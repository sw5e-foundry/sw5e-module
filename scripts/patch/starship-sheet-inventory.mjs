/**
 * Starship sheet inventory / Features inject + cargo wrappers (Phase 6 D1–D3).
 * Move-only from scripts/patch/starship-sheet.mjs — bodies preserved.
 */

import { getModuleId } from "../module-support.mjs";
import { deriveStarshipPools } from "../starship-data.mjs";
import {
	fireStarshipLauncherThroughAmmoBridge,
	isStarshipLauncherItem
} from "../starship-launcher-ammo.mjs";
import { hasTriggerActivityConfig } from "../sw5e-activity-trigger.mjs";
import {
	categorizeStarshipItems,
	getStarshipFeaturesExcludedFromFeaturesTab,
	getStarshipFeaturesManagedItemIds,
	getStarshipInventoryExcludedItemIds,
	getStarshipInventoryManagedItemIds,
	resolveStarshipItemGroup
} from "../starship-sheet-categorize.mjs";
import { localizeOrFallback } from "../starship-sheet-html.mjs";
import { isSw5eStarshipActor, STARSHIP_FEATURES_TAB_ID } from "../starship-sheet-ids.mjs";
import { isStarshipWeaponItem } from "../starship-weapon-rolls.mjs";
import {
	applyStarshipFeatureRecoveryRowContext,
	getStarshipFeaturesFeatColumns
} from "./starship-feature-recovery-labels.mjs";

let vehicleSheetPrepareContextWrapped = false;
let vehicleSheetStarshipCargoInventoryWrapped = false;

/**
 * dnd5e 5.2.x `VehicleActorSheet` exposes "Show Abilities" via `flags.dnd5e.showVehicleAbilities` (`_prepareContext` → `context.options.showAbilities`).
 * When unset, stock behavior hides the block. World starships persist `true` once; compendium docs cannot be updated while locked — see `registerStarshipVehicleSheetShowAbilitiesDefault`.
 */
export function isUnsetShowVehicleAbilities(actor) {
	const raw = actor?.getFlag?.("dnd5e", "showVehicleAbilities");
	return raw !== true && raw !== false;
}

export async function ensureStarshipDefaultShowVehicleAbilities(actor) {
	if ( !isSw5eStarshipActor(actor) ) return;
	if ( !isUnsetShowVehicleAbilities(actor) ) return;
	// Pack / compendium documents must not receive `setFlag` during sheet render (locked compendium throws).
	if ( actor.pack ) return;
	if ( !actor.isOwner ) return;
	await actor.setFlag("dnd5e", "showVehicleAbilities", true);
}

/**
 * Render-time default for unset flag: effective ON (no DB write). Applies to compendium starships and first paint before world `setFlag` resolves.
 */
export function registerStarshipVehicleSheetShowAbilitiesDefault() {
	if ( vehicleSheetPrepareContextWrapped ) return;
	vehicleSheetPrepareContextWrapped = true;
	try {
		libWrapper.register(getModuleId(), "dnd5e.applications.actor.VehicleActorSheet.prototype._prepareContext", async function(wrapped, options) {
			const context = await wrapped(options);
			const actor = this.actor;
			if ( isSw5eStarshipActor(actor) && isUnsetShowVehicleAbilities(actor) ) {
				context.options ??= {};
				context.options.showAbilities = true;
			}
			return context;
		});
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap VehicleActorSheet _prepareContext for starship Show Abilities default.", err);
	}
}

export function suppressNativeStarshipStationsAbilityAndFeatures(sheet, partId, context) {
	const actor = sheet?.actor;
	if ( !isSw5eStarshipActor(actor) ) return context;
	if ( partId === "inventory" ) {
		const categorized = injectStarshipInventorySections(sheet, context);
		const hiddenIds = getStarshipInventoryExcludedItemIds(actor, categorized);
		if ( hiddenIds.size ) filterStarshipCargoContext(context, hiddenIds);
		return context;
	}
	if ( partId === STARSHIP_FEATURES_TAB_ID ) {
		const Inventory = customElements.get(sheet.options.elements.inventory);
		if ( Inventory?.mapColumns ) {
			context.listControls = getStarshipFeaturesListControls();
		}
		context.showCurrency = false;
		const categorized = injectStarshipFeaturesSections(sheet, context);
		const hiddenIds = getStarshipFeaturesExcludedFromFeaturesTab(actor, categorized);
		if ( hiddenIds.size ) filterStarshipCargoContext(context, hiddenIds);
		return context;
	}
	if ( partId === "stations" ) {
		const hiddenIds = getStarshipFeaturesManagedItemIds(actor);
		if ( hiddenIds.size ) filterStarshipCargoContext(context, hiddenIds);
		context.options ??= {};
		context.options.showAbilities = false;
		context.features = null;
		return context;
	}
	return context;
}

export function getPreparedInventoryItemId(entry) {
	if ( !entry || typeof entry !== "object" ) return null;
	if ( typeof entry.id === "string" ) return entry.id;
	if ( typeof entry._id === "string" ) return entry._id;
	if ( typeof entry.item?.id === "string" ) return entry.item.id;
	if ( typeof entry.item?._id === "string" ) return entry.item._id;
	if ( typeof entry.document?.id === "string" ) return entry.document.id;
	if ( typeof entry.document?._id === "string" ) return entry.document._id;
	if ( typeof entry.object?.id === "string" ) return entry.object.id;
	if ( typeof entry.object?._id === "string" ) return entry.object._id;
	if ( typeof entry.data?.id === "string" ) return entry.data.id;
	if ( typeof entry.data?._id === "string" ) return entry.data._id;
	return null;
}

export function getIterableValues(collection) {
	if ( !collection || typeof collection !== "object" ) return [];
	if ( collection instanceof Map ) return collection.values();
	return Object.values(collection);
}

export function filterPreparedInventoryEntries(entries, hiddenIds) {
	if ( !Array.isArray(entries) ) return entries;
	for ( let i = entries.length - 1; i >= 0; i -= 1 ) {
		const entry = entries[i];
		const itemId = getPreparedInventoryItemId(entry);
		if ( itemId && hiddenIds.has(itemId) ) {
			entries.splice(i, 1);
			continue;
		}
		filterPreparedInventoryEntries(entry?.items, hiddenIds);
		filterPreparedInventoryEntries(entry?.contents, hiddenIds);
		filterPreparedInventoryEntries(entry?.children, hiddenIds);
	}
	return entries;
}

/**
 * Remove hidden Items from Stations/Inventory/Features *list* collections only.
 * Preserve sheet-wide `context.itemContext`: Stations and Inventory PARTs run before
 * `sw5e-starship-features`, and `#dnd5e-itemContext` needs those entries for Uses/Recovery.
 */
export function filterStarshipCargoContext(context, hiddenIds) {
	if ( !context || typeof context !== "object" ) return context;

	filterPreparedInventoryEntries(context.items, hiddenIds);
	filterPreparedInventoryEntries(context.containers, hiddenIds);
	filterPreparedInventoryEntries(context.inventory, hiddenIds);

	for ( const section of getIterableValues(context.sections) ) filterPreparedInventoryEntries(section?.items, hiddenIds);
	for ( const section of getIterableValues(context.features) ) filterPreparedInventoryEntries(section?.items, hiddenIds);
	for ( const section of getIterableValues(context.cargo) ) filterPreparedInventoryEntries(section?.items, hiddenIds);

	for ( const category of getIterableValues(context.itemCategories) ) {
		filterPreparedInventoryEntries(category?.items, hiddenIds);
		for ( const section of getIterableValues(category) ) filterPreparedInventoryEntries(section?.items, hiddenIds);
	}

	return context;
}

export const STARSHIP_CARGO_INVENTORY_COLUMNS = ["price", "weight", "quantity", "charges", "controls"];
/** @deprecated Prefer getStarshipFeaturesFeatColumns() — kept for offline tests expecting the export. */
export const STARSHIP_FEATURES_FEAT_COLUMNS = [{ id: "uses", order: 200 }, "recovery", "controls"];
export { getStarshipFeaturesFeatColumns };

export const STARSHIP_INVENTORY_SECTION_DEFS = [
	{ key: "weapons", id: "sw5e-weapons", labelKey: "SW5E.Weapon", fallback: "Weapons", order: 50 },
	{ key: "equipment", id: "sw5e-equipment", labelKey: "SW5E.Equipment", fallback: "Equipment", order: 60 },
	{ key: "modifications", id: "sw5e-modifications", labelKey: "TYPES.Item.starshipmodPl", fallback: "Modifications", order: 65 }
];

export const STARSHIP_FEATURES_SECTION_DEFS = [
	{ key: "actions", id: "sw5e-actions", labelKey: "SW5E.Feature.StarshipAction.LabelPl", fallback: "Starship Actions", order: 50, columns: "feat" },
	{ key: "systems", id: "sw5e-systems", labelKey: "DOCUMENT.TagsSystems", fallback: "Systems", order: 70, columns: "feat" }
];

export const STARSHIP_INVENTORY_MANAGED_SECTION_IDS = new Set(STARSHIP_INVENTORY_SECTION_DEFS.map(def => def.id));
export const STARSHIP_FEATURES_MANAGED_SECTION_IDS = new Set(STARSHIP_FEATURES_SECTION_DEFS.map(def => def.id));
export const STARSHIP_CARGO_MANAGED_SECTION_IDS = STARSHIP_INVENTORY_MANAGED_SECTION_IDS;
export const STARSHIP_MODIFICATIONS_SECTION_ID = "sw5e-modifications";

export const STOCK_INVENTORY_SECTION_ID_TYPE = {
	weapons: "weapon",
	weapon: "weapon",
	equipment: "equipment",
	consumable: "consumable",
	consumables: "consumable",
	loot: "loot",
	container: "container"
};

export function snapshotStockInventorySections(sections, managedSectionIds = STARSHIP_INVENTORY_MANAGED_SECTION_IDS) {
	if ( !Array.isArray(sections) ) return [];
	return sections
		.filter(section => section?.id && !managedSectionIds.has(section.id))
		.map(section => ({
			id: section.id,
			label: section.label,
			order: section.order,
			dataset: foundry.utils.deepClone(section.dataset ?? {}),
			groups: foundry.utils.deepClone(section.groups ?? {})
		}));
}

export function resolveStockInventorySectionLabel(section) {
	const existing = section?.label;
	if ( typeof existing === "string" && existing.trim() ) return existing;

	const datasetType = section?.dataset?.type ?? section?.groups?.type;
	if ( typeof datasetType === "string" && datasetType && CONFIG?.Item?.typeLabels?.[datasetType] ) {
		return `${CONFIG.Item.typeLabels[datasetType]}Pl`;
	}

	const mappedType = STOCK_INVENTORY_SECTION_ID_TYPE[section?.id] ?? section?.id;
	if ( typeof mappedType === "string" && mappedType && CONFIG?.Item?.typeLabels?.[mappedType] ) {
		return `${CONFIG.Item.typeLabels[mappedType]}Pl`;
	}

	const items = section?.items;
	if ( Array.isArray(items) && items.length ) {
		const typeCounts = new Map();
		for ( const item of items ) {
			const type = item?.type;
			if ( !type ) continue;
			typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
		}
		let dominantType = null;
		let max = 0;
		for ( const [type, count] of typeCounts ) {
			if ( count > max ) {
				max = count;
				dominantType = type;
			}
		}
		if ( dominantType && CONFIG?.Item?.typeLabels?.[dominantType] ) {
			return `${CONFIG.Item.typeLabels[dominantType]}Pl`;
		}
	}

	return existing ?? "";
}

export function restoreStockInventorySectionLabels(sections, managedSectionIds = STARSHIP_INVENTORY_MANAGED_SECTION_IDS) {
	if ( !Array.isArray(sections) ) return;
	for ( const section of sections ) {
		if ( managedSectionIds.has(section?.id) ) continue;
		const label = resolveStockInventorySectionLabel(section);
		if ( label ) section.label = label;
		section.dataset ??= {};
		if ( !section.dataset.type ) {
			const inferredType = section.items?.[0]?.type;
			if ( inferredType ) section.dataset.type = inferredType;
		}
	}
}

export function applyStockInventorySectionSnapshots(sections, snapshots, managedSectionIds = STARSHIP_INVENTORY_MANAGED_SECTION_IDS) {
	if ( !Array.isArray(sections) || !snapshots?.length ) return;
	const snapshotById = new Map(snapshots.map(snapshot => [snapshot.id, snapshot]));
	for ( const section of sections ) {
		if ( managedSectionIds.has(section?.id) ) continue;
		const snapshot = section?.id ? snapshotById.get(section.id) : null;
		if ( !snapshot ) continue;
		if ( !section.label && snapshot.label ) section.label = snapshot.label;
		if ( section.order == null && snapshot.order != null ) section.order = snapshot.order;
		section.dataset = { ...snapshot.dataset, ...section.dataset };
		if ( foundry.utils.isEmpty(section.groups) && !foundry.utils.isEmpty(snapshot.groups) ) {
			section.groups = foundry.utils.deepClone(snapshot.groups);
		}
	}
}


export function pruneStarshipCargoManagedInventoryEntries(context, managedIds) {
	if ( !managedIds?.size ) return;
	filterPreparedInventoryEntries(context.items, managedIds);
	filterPreparedInventoryEntries(context.containers, managedIds);
	filterPreparedInventoryEntries(context.inventory, managedIds);
	for ( const section of getIterableValues(context.sections) ) filterPreparedInventoryEntries(section?.items, managedIds);
	for ( const section of getIterableValues(context.features) ) filterPreparedInventoryEntries(section?.items, managedIds);
	for ( const section of getIterableValues(context.cargo) ) filterPreparedInventoryEntries(section?.items, managedIds);
	for ( const category of getIterableValues(context.itemCategories) ) {
		filterPreparedInventoryEntries(category?.items, managedIds);
		for ( const section of getIterableValues(category) ) filterPreparedInventoryEntries(section?.items, managedIds);
	}
}

export function getStarshipFeaturesListControls() {
	const featureSearch = game.i18n.localize("DND5E.FeatureSearch");
	return {
		label: featureSearch && featureSearch !== "DND5E.FeatureSearch" ? featureSearch : "Search features",
		list: "features",
		filters: [
			{ key: "action", label: "DND5E.Action" },
			{ key: "bonus", label: "DND5E.BonusAction" },
			{ key: "reaction", label: "DND5E.Reaction" }
		],
		sorting: [
			{ key: "m", label: "SIDEBAR.SortModeManual", dataset: { icon: "fa-solid fa-arrow-down-short-wide" } },
			{ key: "a", label: "SIDEBAR.SortModeAlpha", dataset: { icon: "fa-solid fa-arrow-down-a-z" } }
		],
		grouping: []
	};
}

export function getStarshipInventorySearchRoot(root) {
	if ( !(root instanceof HTMLElement) ) return null;
	return root.querySelector("[data-application-part=\"inventory\"]")
		?? root.querySelector("[data-tab=\"inventory\"]")
		?? root.querySelector(".tab.inventory")
		?? root;
}

export function findStarshipModificationsInventorySection(inventoryRoot) {
	if ( !(inventoryRoot instanceof HTMLElement) ) return null;

	const selectorHits = [
		`[data-sw5e-section-id="${STARSHIP_MODIFICATIONS_SECTION_ID}"]`,
		"[data-group-sw5e-inventory=\"modifications\"]"
	];
	for ( const selector of selectorHits ) {
		const section = inventoryRoot.querySelector(`.items-section${selector}`);
		if ( section ) return section;
	}

	const modsLabel = localizeOrFallback("TYPES.Item.starshipmodPl", "Modifications");
	const localizedModsLabel = game.i18n.localize("TYPES.Item.starshipmodPl");
	for ( const section of inventoryRoot.querySelectorAll(".items-section") ) {
		const title = section.querySelector(".items-header .item-name");
		const text = title?.textContent?.trim();
		if ( !text ) continue;
		if ( text === modsLabel || (localizedModsLabel && text === localizedModsLabel) ) return section;
	}
	return null;
}

export function getStarshipModificationPoolSummary(actor) {
	const pools = deriveStarshipPools(actor);
	return {
		modSlots: `${pools.mods.slotsUsed}/${pools.mods.slotMax}`,
		suites: `${pools.mods.suitesUsed}/${pools.mods.suiteMax}`
	};
}

export function createStarshipModificationHeaderStat(value, suffixLabel = "") {
	const stat = document.createElement("span");
	stat.className = "sw5e-starship-modifications-header-stat";
	const valueEl = document.createElement("span");
	valueEl.className = "sw5e-starship-modifications-header-stat-value";
	valueEl.textContent = value;
	stat.append(valueEl);
	if ( suffixLabel ) {
		const suffixEl = document.createElement("span");
		suffixEl.className = "sw5e-starship-modifications-header-stat-suffix";
		suffixEl.textContent = suffixLabel;
		stat.append(suffixEl);
	}
	return stat;
}

export function applyStarshipModificationsSectionHeader(root, actor) {
	if ( !isSw5eStarshipActor(actor) ) return false;

	const inventoryRoot = getStarshipInventorySearchRoot(root);
	if ( !inventoryRoot ) return false;

	const section = findStarshipModificationsInventorySection(inventoryRoot);
	const header = section?.querySelector(".items-header.header");
	if ( !header ) return false;

	const { modSlots, suites } = getStarshipModificationPoolSummary(actor);
	const suitesLabel = localizeOrFallback("SW5E.Suites", "Suites");

	let stats = header.querySelector(".sw5e-starship-modifications-header-stats");
	if ( !stats ) {
		stats = document.createElement("div");
		stats.className = "sw5e-starship-modifications-header-stats";
		const columnHeader = header.querySelector(".item-header");
		if ( columnHeader ) header.insertBefore(stats, columnHeader);
		else header.append(stats);
	}

	stats.replaceChildren(
		createStarshipModificationHeaderStat(modSlots),
		createStarshipModificationHeaderStat(suites, suitesLabel)
	);
	return true;
}

export function scheduleStarshipModificationsSectionHeader(root, actor) {
	const run = () => { applyStarshipModificationsSectionHeader(root, actor); };
	queueMicrotask(run);
	requestAnimationFrame(() => requestAnimationFrame(run));
}

/**
 * Bind (or rebind) the modifications-header MutationObserver to the current Inventory PART root.
 * Phase 10A proved Inventory PART replacement leaves a stale observer when the sheet root survives;
 * rebind when the watched node identity changes. Does not invent close-time teardown: after sheet
 * close the app element (and thus the observer reference) is dropped with no functional callbacks.
 * @param {HTMLElement} root
 * @param {object} app
 */
export function ensureStarshipModificationsSectionHeaderSync(root, app) {
	if ( !(root instanceof HTMLElement) ) return;

	const inventoryRoot = getStarshipInventorySearchRoot(root) ?? root;
	const existing = root._sw5eModHeaderObserver;
	const observedRoot = root._sw5eModHeaderObservedRoot;
	if ( existing && observedRoot === inventoryRoot ) {
		scheduleStarshipModificationsSectionHeader(root, app?.actor);
		return;
	}

	if ( existing && typeof existing.disconnect === "function" ) {
		try { existing.disconnect(); } catch { /* ignore */ }
	}

	let timer = null;
	const sync = () => {
		const actor = app?.actor;
		if ( !isSw5eStarshipActor(actor) ) return;
		applyStarshipModificationsSectionHeader(root, actor);
	};
	const debouncedSync = () => {
		clearTimeout(timer);
		timer = setTimeout(sync, 0);
	};

	const observer = new MutationObserver(debouncedSync);
	observer.observe(inventoryRoot, { childList: true, subtree: true });
	root._sw5eModHeaderObserver = observer;
	root._sw5eModHeaderObservedRoot = inventoryRoot;
	root.dataset.sw5eModHeaderSync = "1";

	scheduleStarshipModificationsSectionHeader(root, app?.actor);
}

export function buildStarshipGroupedSections(sheet, context, sectionDefs, {
	managedItemIds,
	includeStockRemainder = true,
	categorized = null
} = {}) {
	const actor = sheet.actor;
	const Inventory = customElements.get(sheet.options.elements.inventory);
	if ( !Inventory?.prepareSections || !Inventory.mapColumns ) return false;

	const isInventoryTab = sectionDefs === STARSHIP_INVENTORY_SECTION_DEFS;
	const sectionIdSet = isInventoryTab ? STARSHIP_INVENTORY_MANAGED_SECTION_IDS : STARSHIP_FEATURES_MANAGED_SECTION_IDS;
	const groups = categorized ?? categorizeStarshipItems(actor);
	const managedIds = managedItemIds
		?? (isInventoryTab ? getStarshipInventoryManagedItemIds(actor, groups) : getStarshipFeaturesManagedItemIds(actor, groups));

	const inventoryColumns = Inventory.mapColumns(STARSHIP_CARGO_INVENTORY_COLUMNS);
	const featColumns = Inventory.mapColumns(getStarshipFeaturesFeatColumns());
	const rawSections = [];

	for ( const def of sectionDefs ) {
		const sourceItems = def.key === "systems"
			? [...groups.size.items, ...groups.features.items]
			: (groups[def.key]?.items ?? []);
		if ( !sourceItems.length ) continue;

		const sectionEntry = {
			id: def.id,
			label: localizeOrFallback(def.labelKey, def.fallback),
			order: def.order,
			columns: def.columns === "feat" ? featColumns : inventoryColumns,
			groups: isInventoryTab ? { sw5eInventory: def.key } : { sw5eFeatures: def.key },
			items: sourceItems.sort((left, right) => left.name.localeCompare(right.name))
		};
		if ( def.id === STARSHIP_MODIFICATIONS_SECTION_ID ) {
			sectionEntry.dataset = { sw5eSectionId: def.id };
		}
		rawSections.push(sectionEntry);
	}

	if ( !rawSections.length && !includeStockRemainder ) return false;

	const stockSectionSnapshots = snapshotStockInventorySections(context.sections, sectionIdSet);
	const prepared = rawSections.length ? Inventory.prepareSections(rawSections) : [];
	pruneStarshipCargoManagedInventoryEntries(context, managedIds);

	const remaining = Array.isArray(context.sections)
		? context.sections.filter(section => section?.items?.length)
		: [];
	applyStockInventorySectionSnapshots(remaining, stockSectionSnapshots, sectionIdSet);
	restoreStockInventorySectionLabels(remaining, sectionIdSet);
	context.sections = includeStockRemainder ? [...prepared, ...remaining] : prepared;
	return prepared.length > 0 || (includeStockRemainder && remaining.length > 0);
}

export function injectStarshipInventorySections(sheet, context) {
	const categorized = categorizeStarshipItems(sheet.actor);
	buildStarshipGroupedSections(sheet, context, STARSHIP_INVENTORY_SECTION_DEFS, {
		managedItemIds: getStarshipInventoryManagedItemIds(sheet.actor, categorized),
		includeStockRemainder: true,
		categorized
	});
	return categorized;
}

export function injectStarshipFeaturesSections(sheet, context) {
	const categorized = categorizeStarshipItems(sheet.actor);
	buildStarshipGroupedSections(sheet, context, STARSHIP_FEATURES_SECTION_DEFS, {
		managedItemIds: getStarshipFeaturesManagedItemIds(sheet.actor, categorized),
		includeStockRemainder: false,
		categorized
	});
	return categorized;
}

/**
 * Add facing and turret text to the stock inventory subtitle.
 * The stock string is left as prepared. Only the added pieces are escaped.
 * @param {Item} item
 * @param {object} ctx
 */
function appendStarshipWeaponInventorySubtitle(item, ctx) {
	if ( !isStarshipWeaponItem(item) ) return;
	const parts = [];
	const facing = typeof item.system?.firingArc === "string" ? item.system.firingArc.trim() : "";
	if ( facing ) parts.push(foundry.utils.escapeHTML(facing));
	if ( item.system?.turreted === true ) {
		const turreted = localizeOrFallback("SW5E.StarshipWeaponTurreted", "Turreted");
		parts.push(foundry.utils.escapeHTML(turreted));
	}
	if ( !parts.length ) return;
	const addition = parts.join(" • ");
	ctx.subtitle = ctx.subtitle ? `${ctx.subtitle} • ${addition}` : addition;
}

export function registerStarshipCargoInventoryWrappers() {
	if ( vehicleSheetStarshipCargoInventoryWrapped ) return;
	vehicleSheetStarshipCargoInventoryWrapped = true;

	const moduleId = getModuleId();
	const physicalWrapper = async function(wrapped, item, ctx) {
		await wrapped.call(this, item, ctx);
		if ( !isSw5eStarshipActor(this.actor) ) return;
		appendStarshipWeaponInventorySubtitle(item, ctx);
		const group = resolveStarshipItemGroup(item);
		if ( !group ) return;
		if ( group === "weapons" || group === "equipment" || group === "modifications" ) ctx.groups = { sw5eInventory: group };
		else ctx.groups = { sw5eFeatures: group };
	};

	try {
		libWrapper.register(moduleId, "dnd5e.applications.actor.VehicleActorSheet.prototype._prepareItemPhysical", physicalWrapper, "WRAPPER");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap VehicleActorSheet _prepareItemPhysical for starship cargo grouping.", err);
	}

	try {
		libWrapper.register(moduleId, "dnd5e.applications.actor.VehicleActorSheet.prototype._prepareItemFeature", async function(wrapped, item, ctx) {
			await wrapped.call(this, item, ctx);
			if ( !isSw5eStarshipActor(this.actor) ) return;
			const group = resolveStarshipItemGroup(item);
			if ( !group ) return;
			if ( group === "weapons" || group === "equipment" || group === "modifications" ) ctx.groups = { sw5eInventory: group };
			else ctx.groups = { sw5eFeatures: group };
			applyStarshipFeatureRecoveryRowContext(item, ctx);
		}, "WRAPPER");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap VehicleActorSheet _prepareItemFeature for starship cargo grouping.", err);
	}
}

export function registerStarshipCargoItemCategoryHook() {
	Hooks.on("sw5e.BaseActorSheet._assignItemCategories", (_this, _result, config, item) => {
		if ( !isSw5eStarshipActor(_this.actor) ) return;
		const group = resolveStarshipItemGroup(item);
		if ( !group ) return;
		if ( group === "weapons" || group === "equipment" || group === "modifications" ) config.result = new Set(["inventory"]);
		else config.result = new Set();
	});
}

export function ensureStarshipCargoInventoryInteractions(root, app) {
	if ( !(root instanceof HTMLElement) || root.dataset.sw5eCargoInventoryBound === "1" ) return;
	root.dataset.sw5eCargoInventoryBound = "1";
	ensureStarshipManagedInventoryInteractions(root, app, getStarshipInventoryManagedItemIds(app.actor));
	ensureStarshipModificationsSectionHeaderSync(root, app);
}

export function ensureStarshipFeaturesInventoryInteractions(root, app) {
	if ( !(root instanceof HTMLElement) || root.dataset.sw5eFeaturesInventoryBound === "1" ) return;
	root.dataset.sw5eFeaturesInventoryBound = "1";
	ensureStarshipManagedInventoryInteractions(root, app, getStarshipFeaturesManagedItemIds(app.actor));
}

export function ensureStarshipManagedInventoryInteractions(root, app, getManagedIds) {
	root.addEventListener("inventory", event => {
		if ( event.detail !== "use" ) return;
		const actor = app?.actor;
		if ( !isSw5eStarshipActor(actor) ) return;
		const row = event.target?.closest?.("[data-item-id]");
		const itemId = row?.dataset?.itemId;
		const managedIds = typeof getManagedIds === "function" ? getManagedIds(actor) : getManagedIds;
		if ( !itemId || !managedIds?.has(itemId) ) return;
		const item = actor.items.get(itemId);
		if ( !item ) return;
		if ( item.flags?.sw5e?.legacyStarshipSize || item.flags?.sw5e?.starshipCharacter?.role === "classification" ) {
			event.preventDefault();
			return;
		}
		event.preventDefault();
		void useStarshipItem(item, actor, event);
	}, { capture: true });
}

export async function useStarshipItem(item, actor = item?.actor, event) {
	if ( !item ) return;

	if ( isSw5eStarshipActor(actor) && isStarshipLauncherItem(item) ) {
		const utilityActivity = [...(item.system?.activities ?? [])].find(activity => activity?.type === "utility");
		if ( utilityActivity && hasTriggerActivityConfig(utilityActivity) ) {
			await utilityActivity.use({ event });
			return;
		}
		await fireStarshipLauncherThroughAmmoBridge(item, { event });
		return;
	}

	const methods = ["use", "roll", "displayCard", "toMessage"];
	for ( const method of methods ) {
		if ( typeof item?.[method] !== "function" ) continue;
		try {
			const result = await item[method]({ event });
			if ( result !== false ) return;
		} catch ( err ) {
			console.warn(`SW5E MODULE | Failed starship item action via ${method}.`, err);
		}
	}

	item.sheet?.render(true);
}

