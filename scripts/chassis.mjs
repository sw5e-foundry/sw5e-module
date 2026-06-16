/**
 * Phase 1: flag-based item chassis model (`flags.sw5e.chassis`) and validation helpers for SW5E modifications.
 * No wrapper items, no sheet UI — data + rules only.
 */

import { getModuleId, getModuleSettingValue } from "./module-support.mjs";
import { isCyberneticAugmentationSourceCustom } from "./augmentations.mjs";
import { isDroidCustomizationItem } from "./droid-customizations.mjs";
import { cloneEffectsSnapshot } from "./chassis-effect-snapshot.mjs";

/**
 * Item compendium pack names (within this module) used as modification sources for the install browser.
 * `enhanceditems` holds Item Modifications under folder `ENHANCEDITEMS_ITEM_MODIFICATIONS_FOLDER_ID`.
 * `modifications` is a legacy pack name (included when registered).
 */
export const CHASSIS_MOD_SOURCE_PACK_NAMES = /** @type {const} */ ([
	"enhanceditems",
	"modifications"
]);

/** Stable folder id for Enhanced Items → Item Modifications (packs/_source/enhanceditems/item-modifications/_folder.yml). */
export const ENHANCEDITEMS_ITEM_MODIFICATIONS_FOLDER_ID = "2opSaVXOBytTPCiA";

/**
 * Requested compendium index fields for the install browser so chassis metadata is available without {@link CompendiumCollection#getDocuments}.
 * @see CompendiumCollection#getIndex
 */
const CHASSIS_MOD_COMPENDIUM_INDEX_FIELDS = /** @type {const} */ ([
	"flags.sw5e.chassisMod",
	"flags.sw5e-importer",
	"type",
	"folder",
	"system.rarity",
	"system.type",
	"system.source",
	"system.description",
	"system.attunement",
	"system.attack",
	"system.damage",
	"system.armor"
]);

// ——— Constants ———

/** @typedef {"standard"|"premium"|"prototype"|"advanced"|"legendary"|"artifact"} ChassisRarity */
export const CHASSIS_RARITIES = /** @type {const} */ ([
	"standard",
	"premium",
	"prototype",
	"advanced",
	"legendary",
	"artifact"
]);

/** @typedef {"strict"|"guided"|"freeform"} ChassisRulesMode */
export const CHASSIS_RULES_MODES = /** @type {const} */ ([
	"strict",
	"guided",
	"freeform"
]);

/** Base slots from rarity (total = base + augment). Standard/Premium: 4 base, 0 augment. */
export const CHASSIS_RARITY_SLOT_TABLE = Object.freeze({
	standard: { base: 4, augment: 0 },
	premium: { base: 4, augment: 0 },
	prototype: { base: 4, augment: 1 },
	advanced: { base: 4, augment: 1 },
	legendary: { base: 4, augment: 2 },
	artifact: { base: 4, augment: 2 }
});

/**
 * Per–chassis-type template: overrides default base slot count before rarity augments.
 * Rarity augment slots are always added on top of this base.
 */
export const CHASSIS_TYPE_SLOT_TEMPLATE = Object.freeze({
	weapon: { base: 4 },
	armor: { base: 4 },
	shield: { base: 4 },
	equipment: { base: 4 },
	consumable: { base: 4 },
	tool: { base: 4 },
	loot: { base: 4 }
});

export const CHASSIS_SETTING_KEYS = Object.freeze({
	rulesMode: "chassisRulesMode",
	enforceTools: "chassisEnforceTools",
	enforceRarity: "chassisEnforceRarity",
	enforceSlots: "chassisEnforceSlots"
});

const FLAG_PATH = "flags.sw5e.chassis";

function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
	if ( value === undefined ) return undefined;
	if ( typeof globalThis.structuredClone === "function" ) return globalThis.structuredClone(value);
	return JSON.parse(JSON.stringify(value));
}

// ——— Slot budget ———

/**
 * @param {string} chassisType
 * @param {ChassisRarity} rarity
 * @returns {{ base: number, augment: number, total: number, typeBase: number }}
 */
export function getChassisSlotBudget(chassisType, rarity) {
	const rarityRow = CHASSIS_RARITY_SLOT_TABLE[rarity] ?? CHASSIS_RARITY_SLOT_TABLE.standard;
	const typeRow = CHASSIS_TYPE_SLOT_TEMPLATE[chassisType] ?? { base: rarityRow.base };
	const typeBase = Math.max(0, Number(typeRow.base) || 0);
	const rarityBase = Math.max(0, Number(rarityRow.base) || 0);
	const base = Math.max(typeBase, rarityBase);
	const augment = Math.max(0, Number(rarityRow.augment) || 0);
	return { base, augment, total: base + augment, typeBase };
}

// ——— Chassis flag read/write ———

/**
 * @param {import("@league/foundry").documents.Item} item
 * @returns {object|null}
 */
export function getChassis(item) {
	const c = item?.flags?.sw5e?.chassis;
	return isRecord(c) ? c : null;
}

/**
 * Merge partial chassis data onto the item (caller persists with item.update).
 * @param {import("@league/foundry").documents.Item} item
 * @param {object} partial
 */
export function mergeChassisUpdate(item, partial) {
	const current = getChassis(item) ?? {};
	const next = foundry.utils.mergeObject(foundry.utils.deepClone(current), partial, { inplace: false });
	return { [`${FLAG_PATH}`]: next };
}

/**
 * Default chassis shape for a host item.
 * @param {string} itemType dnd5e item.type
 * @param {ChassisRarity} [rarity="standard"]
 */
export function createDefaultChassis(itemType, rarity = "standard") {
	const chassisType = CHASSIS_TYPE_SLOT_TEMPLATE[itemType] ? itemType : "equipment";
	const budget = getChassisSlotBudget(chassisType, rarity);
	return {
		enabled: false,
		type: chassisType,
		rarity,
		rulesMode: null,
		slotTemplate: { base: budget.base, augment: budget.augment, total: budget.total },
		slots: {
			baseMax: budget.base,
			augmentMax: budget.augment,
			totalMax: budget.total,
			used: 0
		},
		attunement: {
			required: false,
			enhanced: false
		},
		installedMods: [],
		workflowState: {
			lastOperation: null,
			lastOperationAt: null,
			globalCooldownUntil: null
		},
		cooldowns: {}
	};
}

/**
 * Normalize chassis: ensure fields exist, sync slot counts from type + rarity.
 * Rarity follows the item’s dnd5e rarity ({@link inferChassisRarityFromItem}) unless `options.rarityPreview` is set
 * (e.g. validating or persisting a chassis upgrade before/while the item document reflects the new tier).
 * @param {import("@league/foundry").documents.Item} item
 * @param {object} [chassis]
 * @param {{ rarityPreview?: ChassisRarity }} [options]
 */
export function normalizeChassis(item, chassis = getChassis(item), options = {}) {
	if ( !isRecord(chassis) ) {
		return createDefaultChassis(item?.type ?? "equipment", inferChassisRarityFromItem(item));
	}
	const type = typeof chassis.type === "string" && chassis.type ? chassis.type : (item?.type ?? "equipment");
	const rarity = options.rarityPreview != null && CHASSIS_RARITIES.includes(options.rarityPreview)
		? options.rarityPreview
		: inferChassisRarityFromItem(item);
	const budget = getChassisSlotBudget(type, rarity);
	const installed = Array.isArray(chassis.installedMods) ? chassis.installedMods : [];
	const used = installed.reduce((n, m) => n + (Number(m?.slotCost) > 0 ? Number(m.slotCost) : 1), 0);

	return foundry.utils.mergeObject(
		createDefaultChassis(item?.type ?? "equipment", rarity),
		{
			...chassis,
			type,
			rarity,
			slotTemplate: { base: budget.base, augment: budget.augment, total: budget.total },
			slots: {
				baseMax: budget.base,
				augmentMax: budget.augment,
				totalMax: budget.total,
				used
			},
			installedMods: installed,
			workflowState: isRecord(chassis.workflowState) ? chassis.workflowState : {},
			cooldowns: isRecord(chassis.cooldowns) ? chassis.cooldowns : {},
			attunement: isRecord(chassis.attunement) ? chassis.attunement : { required: false, enhanced: false }
		},
		{ inplace: false }
	);
}

// ——— Phase 2: eligibility & sheet helpers ———

/** dnd5e item types that can host `flags.sw5e.chassis` in this phase. */
export const CHASSIS_ELIGIBLE_ITEM_TYPES = /** @type {const} */ ([
	"weapon",
	"equipment",
	"consumable",
	"tool",
	"loot"
]);

/** Map dnd5e `system.rarity` string to chassis rarity. */
export const ITEM_SYSTEM_RARITY_TO_CHASSIS = Object.freeze({
	"": "standard",
	common: "standard",
	uncommon: "premium",
	rare: "prototype",
	veryRare: "advanced",
	legendary: "legendary",
	artifact: "artifact"
});

/** Map chassis tier back to dnd5e `system.rarity` value (inverse of {@link ITEM_SYSTEM_RARITY_TO_CHASSIS}). */
export const CHASSIS_TO_ITEM_SYSTEM_RARITY = Object.freeze({
	standard: "common",
	premium: "uncommon",
	prototype: "rare",
	advanced: "veryRare",
	legendary: "legendary",
	artifact: "artifact"
});

/**
 * @param {import("@league/foundry").documents.Item} item
 */
export function getItemDndTypeKey(item) {
	return item?.type?.split?.(".").at(-1) ?? item?.type ?? "";
}

/**
 * @param {import("@league/foundry").documents.Item} item
 */
export function isItemEligibleForChassis(item) {
	return CHASSIS_ELIGIBLE_ITEM_TYPES.includes(/** @type {*} */ (getItemDndTypeKey(item)));
}

/**
 * Map host item → chassis type key (must exist in {@link CHASSIS_TYPE_SLOT_TEMPLATE}).
 * @param {import("@league/foundry").documents.Item} item
 */
export function inferChassisTypeFromItem(item) {
	const t = getItemDndTypeKey(item);
	if ( t === "weapon" ) return "weapon";
	if ( t === "consumable" ) return "consumable";
	if ( t === "tool" ) return "tool";
	if ( t === "loot" ) return "loot";
	if ( t !== "equipment" ) return CHASSIS_TYPE_SLOT_TEMPLATE[t] ? t : "equipment";
	const typeVal = String(item.system?.type?.value ?? "");
	if ( /shield/i.test(typeVal) ) return "shield";
	const armor = item.system?.armor;
	if ( armor && (Number(armor.value) > 0 || Boolean(armor.type)) ) return "armor";
	return "equipment";
}

/**
 * @param {import("@league/foundry").documents.Item} item
 * @returns {ChassisRarity}
 */
export function inferChassisRarityFromItem(item) {
	const raw = item?.system?.rarity;
	const key = typeof raw === "object" && raw !== null ? (raw.value ?? "") : (raw ?? "");
	const normalized = typeof key === "string" ? key : "";
	const mapped = ITEM_SYSTEM_RARITY_TO_CHASSIS[normalized];
	if ( mapped ) return mapped;
	if ( CHASSIS_RARITIES.includes(normalized) ) return /** @type {ChassisRarity} */ (normalized);
	return "standard";
}

/**
 * Authoritative chassis tier for the host item: always derived from the item’s dnd5e rarity mapping.
 * Stored `flags.sw5e.chassis.rarity` is kept in sync via {@link normalizeChassis} and upgrade / item-update hooks.
 * @param {import("@league/foundry").documents.Item} item
 * @returns {ChassisRarity}
 */
export function getEffectiveChassisRarity(item) {
	return inferChassisRarityFromItem(item);
}

/**
 * dnd5e `system.rarity` value string for a chassis tier (for persisting upgrades on the item).
 * @param {ChassisRarity} chassisRarity
 * @returns {string}
 */
export function chassisRarityToItemSystemRarity(chassisRarity) {
	return CHASSIS_TO_ITEM_SYSTEM_RARITY[chassisRarity] ?? "common";
}

/**
 * Merge defaults, enable chassis, preserve existing flag data (e.g. installed mods).
 * @param {import("@league/foundry").documents.Item} item
 */
export function buildEnabledChassisStateForItem(item) {
	const rawChassis = getChassis(item);
	const existing = isRecord(rawChassis) ? rawChassis : {};
	const inferredType = inferChassisTypeFromItem(item);
	const inferredRarity = inferChassisRarityFromItem(item);
	const type = typeof existing.type === "string" && CHASSIS_TYPE_SLOT_TEMPLATE[existing.type] ? existing.type : inferredType;
	const rarity = inferredRarity;
	const draft = foundry.utils.mergeObject(
		createDefaultChassis(type, rarity),
		{ ...existing, enabled: true, type, rarity },
		{ inplace: false }
	);
	return normalizeChassis(item, draft);
}

/**
 * Rows for UI: base slots then augment slots, each with occupying `installedMods` entries.
 * @param {object} chassis normalized chassis
 */
/** @param {object} m installed mod entry */
export function getInstalledModSlotSpan(m) {
	return Math.max(1, Number(m?.slotCost) || 1);
}

/**
 * Whether `m` occupies a visual row of `kind` at linear index `rowIndex`.
 * @param {object} m
 * @param {"base"|"augment"} kind
 * @param {number} rowIndex
 */
export function installedModOccupiesRow(m, kind, rowIndex) {
	const mk = (m?.slotKind ?? "base") === "augment" ? "augment" : "base";
	if ( mk !== kind ) return false;
	const start = Number(m?.slotIndex) || 0;
	const span = getInstalledModSlotSpan(m);
	return rowIndex >= start && rowIndex < start + span;
}

export function buildChassisSlotDisplayRows(chassis) {
	if ( !isRecord(chassis) || !isRecord(chassis.slots) ) return [];
	const baseMax = Math.max(0, Number(chassis.slots.baseMax) || 0);
	const augMax = Math.max(0, Number(chassis.slots.augmentMax) || 0);
	const mods = Array.isArray(chassis.installedMods) ? chassis.installedMods : [];
	const rows = [];
	for ( let i = 0; i < baseMax; i++ ) {
		const entries = mods.filter(m => installedModOccupiesRow(m, "base", i));
		rows.push({ kind: "base", index: i, entries });
	}
	for ( let i = 0; i < augMax; i++ ) {
		const entries = mods.filter(m => installedModOccupiesRow(m, "augment", i));
		rows.push({ kind: "augment", index: i, entries });
	}
	return rows;
}

/**
 * @param {object} chassis normalized
 * @param {number} start
 * @param {number} span
 * @param {"base"|"augment"} kind
 * @returns {boolean}
 */
export function chassisSlotRangeAvailable(chassis, start, span, kind) {
	const max = kind === "augment"
		? Math.max(0, Number(chassis.slots.augmentMax) || 0)
		: Math.max(0, Number(chassis.slots.baseMax) || 0);
	if ( start < 0 || span < 1 || start + span > max ) return false;
	const mods = Array.isArray(chassis.installedMods) ? chassis.installedMods : [];
	for ( let row = start; row < start + span; row++ ) {
		for ( const m of mods ) {
			if ( installedModOccupiesRow(m, kind, row) ) return false;
		}
	}
	return true;
}

/**
 * Deterministic placements: base rows first (low index), then augment.
 * @param {object} chassis normalized
 * @param {number} cost slot span / slot cost
 * @returns {{ slotKind: "base"|"augment", slotIndex: number }[]}
 */
export function findChassisInstallPlacements(chassis, cost) {
	const span = Math.max(1, Number(cost) || 1);
	const out = [];
	const baseMax = Math.max(0, Number(chassis.slots.baseMax) || 0);
	const augMax = Math.max(0, Number(chassis.slots.augmentMax) || 0);
	for ( let i = 0; i <= baseMax - span; i++ ) {
		if ( chassisSlotRangeAvailable(chassis, i, span, "base") ) out.push({ slotKind: /** @type {const} */ ("base"), slotIndex: i });
	}
	for ( let i = 0; i <= augMax - span; i++ ) {
		if ( chassisSlotRangeAvailable(chassis, i, span, "augment") ) out.push({ slotKind: /** @type {const} */ ("augment"), slotIndex: i });
	}
	return out;
}

// ——— Rules mode ———

/**
 * Effective rules mode: item override, else world setting.
 * @param {import("@league/foundry").documents.Item} item
 * @returns {ChassisRulesMode}
 */
export function getEffectiveChassisRulesMode(item) {
	const c = getChassis(item);
	const override = c?.rulesMode;
	if ( CHASSIS_RULES_MODES.includes(override) ) return override;
	const world = getModuleSettingValue(CHASSIS_SETTING_KEYS.rulesMode, "guided");
	return CHASSIS_RULES_MODES.includes(world) ? world : "guided";
}

export function getChassisEnforcementToggles() {
	return {
		tools: getModuleSettingValue(CHASSIS_SETTING_KEYS.enforceTools, true),
		rarity: getModuleSettingValue(CHASSIS_SETTING_KEYS.enforceRarity, true),
		slots: getModuleSettingValue(CHASSIS_SETTING_KEYS.enforceSlots, true)
	};
}

// ——— Mod item metadata (optional flags.sw5e.chassisMod on the modification item) ———

/**
 * Optional `flags.sw5e.chassisMod.effects` on modification items (authoritative when installing; snapshot preserves it).
 * @param {object|null|undefined} raw
 * @returns {object|null}
 */
export function parseChassisModEffects(raw) {
	if ( !isRecord(raw) ) return null;
	return {
		addProperties: Array.isArray(raw.addProperties) ? raw.addProperties.filter(Boolean) : [],
		removeProperties: Array.isArray(raw.removeProperties) ? raw.removeProperties.filter(Boolean) : [],
		attackBonus: Number.isFinite(Number(raw.attackBonus)) ? Number(raw.attackBonus) : 0,
		magicalBonus: Number.isFinite(Number(raw.magicalBonus)) ? Number(raw.magicalBonus) : 0,
		armorMagicalBonus: Number.isFinite(Number(raw.armorMagicalBonus)) ? Number(raw.armorMagicalBonus) : 0,
		acBonus: Number.isFinite(Number(raw.acBonus)) ? Number(raw.acBonus) : 0,
		damageBonus: typeof raw.damageBonus === "string" ? raw.damageBonus.trim() : "",
		descriptionAppend: typeof raw.descriptionAppend === "string" ? raw.descriptionAppend.trim() : "",
		attunementRequired: Boolean(raw.attunementRequired),
		forceEnhanced: raw.forceEnhanced === true,
		displayTags: Array.isArray(raw.displayTags) ? raw.displayTags.filter(Boolean) : []
	};
}

/**
 * @param {import("@league/foundry").documents.Item} modItem
 */
export function getChassisModMeta(modItem) {
	const m = modItem?.flags?.sw5e?.chassisMod;
	if ( !isRecord(m) ) return null;
	return {
		compatibleChassisTypes: Array.isArray(m.compatibleChassisTypes) ? m.compatibleChassisTypes.filter(Boolean) : [],
		compatibleSlotKinds: Array.isArray(m.compatibleSlotKinds) ? m.compatibleSlotKinds.filter(Boolean) : [],
		maxHostRarity: typeof m.maxHostRarity === "string" ? m.maxHostRarity : null,
		modRarity: typeof m.modRarity === "string" ? m.modRarity : null,
		requiresTool: m.requiresTool ?? null,
		installDC: Number.isFinite(Number(m.installDC)) ? Number(m.installDC) : null,
		slotCost: Number.isFinite(Number(m.slotCost)) && Number(m.slotCost) > 0 ? Number(m.slotCost) : 1,
		addsAttunement: Boolean(m.addsAttunement),
		upgradeRank: Number.isFinite(Number(m.upgradeRank)) ? Number(m.upgradeRank) : null,
		effects: parseChassisModEffects(m.effects)
	};
}

/** @typedef {"native"|"legacy-modifications-pack"} ChassisModSourceType */
/** @typedef {"native"|"inferred-strong"|"inferred-basic"} ChassisModInferenceConfidence */

/**
 * True when the item document is tied to a chassis-mod compendium source that may use inference after lazy load.
 * @param {object|null|undefined} modItem
 */
export function modificationsPackInferenceEligible(modItem) {
	if ( isRecord(modItem?.flags?.sw5e?.chassisMod) ) return false;
	const u = String(modItem?.uuid ?? "");
	if ( /Compendium\.[^.]+\.modifications\./i.test(u) ) return true;
	if ( /Compendium\.[^.]+\.enhanceditems\./i.test(u) ) return isEnhancedItemsModificationItemLike(modItem);
	const pack = modItem?.pack;
	const pkg = typeof pack === "string" ? pack : pack?.metadata?.id ?? pack?.metadata?.name ?? "";
	if ( /(^|\.)modifications$/i.test(pkg) ) return true;
	if ( /(^|\.)enhanceditems$/i.test(pkg) ) return isEnhancedItemsModificationItemLike(modItem);
	return false;
}

/**
 * Enhanced Items compendium rows that represent item modifications (not wristpads, chassis hosts, etc.).
 * @param {object|null|undefined} itemLike
 */
export function isEnhancedItemsModificationItemLike(itemLike) {
	if ( !itemLike || typeof itemLike !== "object" ) return false;
	if ( isRecord(itemLike.flags?.sw5e?.chassisMod) ) return true;
	const folderRef = itemLike.folder ?? itemLike._source?.folder;
	const folderId = typeof folderRef === "string" ? folderRef : folderRef?.id ?? folderRef?._id ?? null;
	if ( folderId === ENHANCEDITEMS_ITEM_MODIFICATIONS_FOLDER_ID ) return true;
	if ( String(itemLike.system?.source?.custom ?? "").toLowerCase() === "modification" ) return true;
	const uid = itemLike.flags?.["sw5e-importer"]?.uid;
	if ( typeof uid === "string" && /^EnhancedItem\./i.test(uid) && /\.subtype-/i.test(uid) ) return true;
	const desc = String(itemLike.system?.description?.value ?? "");
	if ( /<h4>\s*item\s*modification/i.test(desc) ) return true;
	return false;
}

/**
 * Compendium index row eligible for the chassis install browser.
 * @param {object} entry
 * @param {import("@league/foundry").CompendiumCollection} pack
 */
export function isChassisModCompendiumIndexEntry(entry, pack) {
	if ( !entry || typeof entry !== "object" ) return false;
	if ( isRecord(entry.flags?.sw5e?.chassisMod) ) return true;
	const packName = pack?.metadata?.name ?? "";
	if ( packName === "modifications" ) return true;
	if ( packName === "enhanceditems" ) {
		if ( entry.folder === ENHANCEDITEMS_ITEM_MODIFICATIONS_FOLDER_ID ) return true;
		if ( String(entry.system?.source?.custom ?? "").toLowerCase() === "modification" ) return true;
		const uid = entry.flags?.["sw5e-importer"]?.uid;
		if ( typeof uid === "string" && /^EnhancedItem\./i.test(uid) && /\.subtype-/i.test(uid) ) return true;
		const desc = String(entry.system?.description?.value ?? "");
		if ( /<h4>\s*item\s*modification/i.test(desc) ) return true;
		return false;
	}
	return false;
}

/**
 * Whether chassis metadata may be inferred for this item (compendium or world modification-shaped items).
 * @param {object|null|undefined} modItemLike
 */
export function chassisModInferenceAllowed(modItemLike) {
	if ( isRecord(modItemLike?.flags?.sw5e?.chassisMod) ) return false;
	return modificationsPackInferenceEligible(modItemLike) || isEnhancedItemsModificationItemLike(modItemLike);
}

/**
 * @param {ReturnType<typeof getChassisModMeta>} native
 * @returns {object}
 */
function augmentNativeChassisMeta(native) {
	return {
		...native,
		sourceType: /** @type {const} */ ("native"),
		inferenceConfidence: /** @type {const} */ ("native")
	};
}

/**
 * Map SW5e modification `system.type.value` / importer subtype tokens → chassis host types.
 * @param {string} raw
 * @returns {string|null}
 */
function mapModificationSubtypeToChassisType(raw) {
	const s = String(raw ?? "").toLowerCase().replace(/_/g, "");
	if ( !s ) return null;
	if ( s.includes("blaster") || s.includes("vibroweapon") || s.includes("lightweapon") || s === "bowcaster" ) return "weapon";
	if ( s.includes("armor") && !s.includes("blaster") ) return "armor";
	if ( s.includes("shield") ) return "shield";
	if ( s.includes("wrist") || s.includes("wristpad") || s.includes("focus") || s.includes("generator") || s.includes("techpower") || s.includes("tech") ) return "equipment";
	return null;
}

/**
 * Infer compatible chassis types from Modifications-pack item data (no native chassisMod).
 * @returns {{ types: string[], strength: "strong"|"basic" }}
 */
function inferModificationChassisTypes(itemLike) {
	const sysVal = String(itemLike?.system?.type?.value ?? "").toLowerCase();
	const fromSys = mapModificationSubtypeToChassisType(sysVal);
	if ( fromSys ) return { types: [fromSys], strength: /** @type {const} */ ("strong") };

	const uid = itemLike?.flags?.["sw5e-importer"]?.uid;
	if ( typeof uid === "string" ) {
		const m = /[._]subtype-([^.]+)/i.exec(uid);
		if ( m ) {
			const fromUid = mapModificationSubtypeToChassisType(m[1]);
			if ( fromUid ) return { types: [fromUid], strength: /** @type {const} */ ("strong") };
		}
	}

	const desc = String(itemLike?.system?.description?.value ?? "");
	const h4 = /<h4>[^<]*item\s*modification[^<]*\(([^)]+)\)/i.exec(desc);
	if ( h4 ) {
		const fromDesc = mapModificationSubtypeToChassisType(h4[1]);
		if ( fromDesc ) return { types: [fromDesc], strength: /** @type {const} */ ("strong") };
	}

	const plain = desc.replace(/<[^>]+>/g, " ").toLowerCase();
	if ( /\b(blaster|lightweapon|vibroweapon|bowcaster)\b/.test(plain) ) {
		return { types: ["weapon"], strength: /** @type {const} */ ("strong") };
	}
	if ( /\bshield\b/.test(plain) ) return { types: ["shield"], strength: /** @type {const} */ ("strong") };
	if ( /\barmor\b/.test(plain) && !/\bblaster\b/.test(plain) ) {
		return { types: ["armor"], strength: /** @type {const} */ ("strong") };
	}

	return { types: [], strength: /** @type {const} */ ("basic") };
}

/**
 * Conservative slot-kind hints from name + description (matches demo semantics like barrel / optic).
 * @param {object} itemLike
 * @returns {string[]}
 */
function inferModificationSlotKinds(itemLike) {
	const blob = `${itemLike?.name ?? ""}\n${itemLike?.system?.description?.value ?? ""}`.toLowerCase();
	/** @type {string[]} */
	const out = [];
	if ( /\bbarrel\b/.test(blob) ) out.push("barrel");
	if ( /\b(scope|optic|sighting|targeting chip|targeting module)\b/.test(blob) ) out.push("optic");
	if ( /\b(chamber|power\s*cell|energy\s*cell|\bcell\b|matrix|capacitor|\bcore\b)\b/.test(blob) ) out.push("core");
	if ( /\bplating\b/.test(blob) ) out.push("plating");
	return [...new Set(out)];
}

/**
 * Minimal safe effects profile from modification item fields (no HTML scraping beyond obvious numeric fields).
 * @param {object} itemLike
 */
function inferMinimalModificationEffects(itemLike) {
	const atk = Number(itemLike?.system?.attack?.bonus);
	const parts = itemLike?.system?.damage?.parts;
	let damageBonus = "";
	if ( Array.isArray(parts) && parts[0]?.[0] != null ) damageBonus = String(parts[0][0]).trim();
	const raw = {
		attackBonus: Number.isFinite(atk) ? atk : 0,
		damageBonus,
		displayTags: [],
		descriptionAppend: ""
	};
	const parsed = parseChassisModEffects(raw);
	if ( !parsed ) return null;
	const hasMechanical = (parsed.attackBonus !== 0) || Boolean(parsed.damageBonus);
	const mag = Number(itemLike?.system?.magicalBonus ?? itemLike?.system?.bonus ?? NaN);
	if ( Number.isFinite(mag) && mag !== 0 ) {
		return parseChassisModEffects({ ...raw, magicalBonus: mag });
	}
	return hasMechanical ? parsed : null;
}

/**
 * Build normalized chassis mod metadata for Modifications-compendium rows missing native `flags.sw5e.chassisMod`.
 * Any document shape can be adapted (pack is authoritative); unknown hosts resolve as inferred-basic with open compatibility.
 * @param {object} itemLike
 * @returns {object|null}
 */
function inferModificationsPackChassisModMeta(itemLike) {
	let { types, strength } = inferModificationChassisTypes(itemLike);
	const typeKey = getItemDndTypeKey(itemLike);
	if ( !types.length && CHASSIS_ELIGIBLE_ITEM_TYPES.includes(/** @type {*} */ (typeKey)) ) {
		types = [inferChassisTypeFromItem(itemLike)];
		strength = /** @type {const} */ ("strong");
	}
	const modRarity = inferChassisRarityFromItem(itemLike);
	const slotKinds = inferModificationSlotKinds(itemLike);
	const effects = inferMinimalModificationEffects(itemLike);
	const confidence = strength === "strong" ? /** @type {const} */ ("inferred-strong") : /** @type {const} */ ("inferred-basic");
	return {
		compatibleChassisTypes: types,
		compatibleSlotKinds: slotKinds,
		maxHostRarity: modRarity,
		modRarity,
		requiresTool: null,
		installDC: null,
		slotCost: 1,
		addsAttunement: itemLike?.system?.attunement === "required",
		upgradeRank: null,
		effects,
		sourceType: /** @type {const} */ ("legacy-modifications-pack"),
		inferenceConfidence: confidence
	};
}

/**
 * Strip UI / provenance fields before persisting a snapshot `flags.sw5e.chassisMod` payload.
 * @param {object} meta
 */
export function chassisModMetaForSnapshot(meta) {
	if ( !isRecord(meta) ) return null;
	const {
		sourceType: _st,
		inferenceConfidence: _ic,
		...rest
	} = /** @type {object} */ (meta);
	return clone(rest);
}

/**
 * i18n keys for informational hints (source/adaptation — not install risk by themselves).
 * Shown on compendium rows in addition to Native/Legacy source labels.
 * @param {object|null|undefined} meta row meta from {@link resolveChassisModMetaForInstall}
 * @returns {string[]}
 */
export function collectChassisBrowserInformationalHintKeys(meta) {
	/** @type {string[]} */
	const keys = [];
	const add = k => {
		if ( typeof k === "string" && k && !keys.includes(k) ) keys.push(k);
	};
	if ( meta?.sourceType === "legacy-modifications-pack" ) add("SW5E.Chassis.BrowserHintLegacyInferred");
	if ( meta?.inferenceConfidence === "inferred-basic" ) add("SW5E.Chassis.BrowserHintLowConfidence");
	if ( meta?.sourceType === "legacy-modifications-pack" ) {
		if ( !meta.compatibleSlotKinds?.length ) add("SW5E.Chassis.BrowserHintNoSlotRoleMeta");
		if ( !meta.compatibleChassisTypes?.length ) add("SW5E.Chassis.BrowserHintGenericCompat");
		if ( !meta.requiresTool && (meta.installDC == null || !Number.isFinite(Number(meta.installDC))) ) {
			add("SW5E.Chassis.BrowserHintNoToolDc");
		}
	}
	return keys;
}

/** @type {ReadonlySet<string>} */
const CHASSIS_BROWSER_INFO_ONLY_WARNING_CODES = new Set([
	"mod-legacy-pack-adapted",
	"mod-inferred-basic",
	"install-dc"
]);

/**
 * Warnings that affect browser row tier (Valid vs Warning) for relaxed Modifications-pack rows.
 * @param {{ warnings?: ChassisValidationIssue[] }|null|undefined} validation
 * @param {boolean} relaxModPackCompat
 * @returns {ChassisValidationIssue[]}
 */
export function chassisInstallTierSignificantWarnings(validation, relaxModPackCompat) {
	const w = validation?.warnings ?? [];
	if ( !relaxModPackCompat ) return w;
	return w.filter(issue => issue?.code && !CHASSIS_BROWSER_INFO_ONLY_WARNING_CODES.has(issue.code));
}

/**
 * @deprecated Use {@link collectChassisBrowserInformationalHintKeys} plus {@link chassisInstallTierSignificantWarnings} for UI.
 * @param {object|null|undefined} meta
 * @param {{ warnings?: object[] }|null|undefined} validation
 * @returns {string[]}
 */
export function collectChassisBrowserWarningHintKeys(meta, validation) {
	const keys = [...collectChassisBrowserInformationalHintKeys(meta)];
	for ( const w of validation?.warnings ?? [] ) {
		if ( w?.code === "tool-check-pending" ) keys.push("SW5E.Chassis.BrowserHintToolUnverified");
		if ( w?.code === "install-dc" ) keys.push("SW5E.Chassis.BrowserHintInstallDcNote");
		if ( w?.code === "mod-legacy-pack-adapted" ) keys.push("SW5E.Chassis.BrowserHintLegacyInferred");
		if ( w?.code === "mod-inferred-basic" ) keys.push("SW5E.Chassis.BrowserHintLowConfidence");
	}
	return keys;
}

/**
 * Resolve mod metadata for install / validation: native chassisMod first, then Modifications-pack inference only when allowed.
 * @param {object} modItemLike
 * @param {{ allowModificationsPackInference?: boolean }} [options]
 * @returns {object|null} extended meta with `sourceType` and `inferenceConfidence`
 */
export function resolveChassisModMetaForInstall(modItemLike, options = {}) {
	const native = getChassisModMeta(modItemLike);
	if ( native ) return augmentNativeChassisMeta(native);
	if ( options.allowModificationsPackInference !== true ) return null;
	return inferModificationsPackChassisModMeta(modItemLike);
}

/**
 * World items may appear in the install browser when they declare explicit mod metadata or match modification heuristics.
 * @param {import("@league/foundry").documents.Item} item
 * @param {import("@league/foundry").documents.Item} hostItem
 */
function isWorldChassisModBrowserCandidate(item, hostItem) {
	if ( item?.uuid === hostItem?.uuid ) return false;
	if ( isRecord(item?.flags?.sw5e?.chassisMod) ) return true;
	return isEnhancedItemsModificationItemLike(item);
}

// ——— Validation result shape ———

/** @typedef {{ code: string, message: string, data?: object }} ChassisValidationIssue */

function issue(code, message, data) {
	return data ? { code, message, data } : { code, message };
}

const RARITY_ORDER = Object.freeze({
	standard: 0,
	premium: 1,
	prototype: 2,
	advanced: 3,
	legendary: 4,
	artifact: 5
});

function rarityRank(r) {
	return RARITY_ORDER[r] ?? 0;
}

/**
 * @param {object} param0
 * @param {ChassisRulesMode} param0.mode
 * @param {ChassisValidationIssue[]} param0.blocking
 * @param {ChassisValidationIssue[]} param0.warnings
 * @param {object} param0.info
 * @param {boolean} [param0.overrideAllowed]
 */
function validationResult({ mode, blocking, warnings, info, overrideAllowed: explicitOverride }) {
	const hasBlocking = blocking.length > 0;
	const usedOverride = explicitOverride === true;
	let ok = true;
	if ( mode === "strict" ) ok = !hasBlocking;
	else if ( mode === "guided" ) ok = !hasBlocking || usedOverride;
	else ok = true;

	return {
		ok,
		mode,
		blocking,
		warnings,
		info,
		overrideAllowed: usedOverride || (mode === "guided" && hasBlocking)
	};
}

function chassisRarityAllowsMod(hostRarity, meta) {
	if ( !meta?.maxHostRarity ) return true;
	return rarityRank(hostRarity) <= rarityRank(meta.maxHostRarity);
}

function chassisTypeCompatible(hostType, meta) {
	if ( !meta?.compatibleChassisTypes?.length ) return true;
	return meta.compatibleChassisTypes.includes(hostType);
}

/**
 * Mod tier (`modRarity`) must not exceed host chassis tier when both are set.
 * Missing `modRarity` on legacy content is treated as compatible.
 * @param {ChassisRarity} hostRarity
 * @param {ReturnType<typeof getChassisModMeta>} meta
 */
export function chassisModRarityAllowedOnHost(hostRarity, meta) {
	if ( !meta?.modRarity || !CHASSIS_RARITIES.includes(meta.modRarity) ) return true;
	if ( !CHASSIS_RARITIES.includes(hostRarity) ) return true;
	return rarityRank(meta.modRarity) <= rarityRank(hostRarity);
}

/**
 * When the host slot row has no semantic tag, any mod passes. When the mod lists no `compatibleSlotKinds`, any slot passes.
 * @param {ReturnType<typeof getChassisModMeta>} meta
 * @param {string|null|undefined} slotSemantic e.g. "barrel" from `chassis.slotRowSemantics`
 */
export function chassisModSlotSemanticCompatible(meta, slotSemantic) {
	if ( !meta?.compatibleSlotKinds?.length ) return true;
	if ( !slotSemantic ) return true;
	return meta.compatibleSlotKinds.includes(slotSemantic);
}

/**
 * Optional per-row semantics: `flags.sw5e.chassis.slotRowSemantics = { base?: string[], augment?: string[] }`
 * Index aligns with chassis slot row index for that kind.
 * @param {object} chassis normalized
 * @param {"base"|"augment"} slotKind
 * @param {number} slotIndex
 * @returns {string|null}
 */
export function getChassisSlotSemantic(chassis, slotKind, slotIndex) {
	const sem = chassis?.slotRowSemantics;
	if ( !isRecord(sem) ) return null;
	const key = slotKind === "augment" ? "augment" : "base";
	const arr = sem[key];
	if ( !Array.isArray(arr) ) return null;
	const v = arr[Number(slotIndex)];
	return typeof v === "string" && v ? v : null;
}

/**
 * Compendium packs that hold chassis modification items for the install browser (Modifications compendium only).
 * @returns {import("@league/foundry").CompendiumCollection[]}
 */
export function getChassisModificationCompendiumPacks() {
	const game = globalThis.game;
	if ( !game?.packs ) return [];
	const mids = Array.from(new Set([getModuleId(), "sw5e-module", "sw5e"]));
	/** @type {import("@league/foundry").CompendiumCollection[]} */
	const out = [];
	const seen = new Set();
	for ( const mid of mids ) {
		for ( const name of CHASSIS_MOD_SOURCE_PACK_NAMES ) {
			const id = `${mid}.${name}`;
			const p = game.packs.get(id);
			if ( p && !seen.has(p.metadata.id) ) {
				seen.add(p.metadata.id);
				out.push(p);
			}
		}
	}
	return out;
}

/**
 * Live world items that declare `flags.sw5e.chassisMod`.
 * Compendium modifications are listed via compendium index in {@link getChassisInstallCandidates} (no eager pack hydration).
 * @returns {Promise<import("@league/foundry").documents.Item[]>}
 */
export async function collectChassisModificationItemDocuments() {
	/** @type {import("@league/foundry").documents.Item[]} */
	const out = [];
	const seen = new Set();
	const push = doc => {
		if ( !doc?.uuid || seen.has(doc.uuid) ) return;
		if ( !isRecord(doc.flags?.sw5e?.chassisMod) ) return;
		seen.add(doc.uuid);
		out.push(doc);
	};
	const worldItems = globalThis.game?.items;
	if ( worldItems ) {
		const docs = typeof worldItems.contents?.values === "function"
			? Array.from(worldItems.contents.values())
			: Array.from(worldItems);
		for ( const doc of docs ) push(doc);
	}
	return out.sort((a, b) => a.name.localeCompare(b.name, globalThis.game?.i18n?.lang ?? undefined));
}

/**
 * @param {{ slotKind: "base"|"augment", slotIndex: number }|null|undefined} preferred
 * @param {number} cost
 * @param {{ slotKind: "base"|"augment", slotIndex: number }[]} placements
 */
export function filterChassisPlacementsForPreference(preferred, _cost, placements) {
	if ( !preferred ) return placements;
	return placements.filter(p =>
		p.slotKind === preferred.slotKind && p.slotIndex === Number(preferred.slotIndex)
	);
}

/**
 * @param {object[]} rows
 * @param {import("@league/foundry").documents.Item} hostItem
 * @param {ChassisInstallBrowserContext} browserCtx
 * @param {object} p
 * @param {object} p.chassis normalized
 * @param {"strict"|"guided"|"freeform"} p.mode
 * @param {ReturnType<typeof getChassisEnforcementToggles>} p.toggles
 * @param {import("@league/foundry").documents.Actor|null} p.actor
 * @param {import("@league/foundry").documents.Item|{ flags?: object }} p.modItemLike
 * @param {import("@league/foundry").documents.Item|null} p.item hydrated Item or null (compendium index row)
 * @param {string} p.uuid
 * @param {string} p.name
 * @param {string} p.img
 * @param {string} p.sourceLabel
 * @param {unknown} [p.systemRarity] optional display rarity from index
 * @param {boolean} [p.allowModificationsPackInference]
 */
function pushChassisInstallCandidateRow(rows, hostItem, browserCtx, p) {
	const { chassis, mode, toggles, actor, modItemLike, item, uuid, name, img, sourceLabel, systemRarity, allowModificationsPackInference } = p;
	if ( isCyberneticAugmentationSourceCustom(modItemLike) ) return;
	if ( isDroidCustomizationItem(modItemLike) ) return;
	if ( uuid === hostItem.uuid ) return;
	const meta = resolveChassisModMetaForInstall(/** @type {*} */ (modItemLike), {
		allowModificationsPackInference: allowModificationsPackInference === true
	});
	if ( !meta ) return;
	/**
	 * Temporary: Modifications compendium rows are listed broadly (rarity + placement only).
	 * Host chassis type, slot semantics, and mod `maxHostRarity` are not used to exclude candidates.
	 * World items still use full compatibility filtering.
	 */
	const relaxModPackCompat = allowModificationsPackInference === true;
	if ( !relaxModPackCompat && mode === "strict" && meta.inferenceConfidence === "inferred-basic" ) return;

	if ( toggles.rarity && !relaxModPackCompat && !chassisRarityAllowsMod(chassis.rarity, meta) ) return;
	if ( toggles.rarity && !chassisModRarityAllowedOnHost(chassis.rarity, meta) ) return;
	if ( !relaxModPackCompat && toggles.rarity && meta.compatibleChassisTypes?.length && !chassisTypeCompatible(chassis.type, meta) ) return;
	if ( !relaxModPackCompat && !chassisModSlotSemanticCompatible(meta, browserCtx.slotSemantic) ) return;

	const cost = meta.slotCost ?? 1;
	let placements = findChassisInstallPlacements(chassis, cost);
	placements = filterChassisPlacementsForPreference(browserCtx.preferredSlot, cost, placements);
	if ( !placements.length ) return;

	const tryPlacement = placements[0];
	const validation = validateChassisInstall(hostItem, /** @type {*} */ (modItemLike), {
		...tryPlacement,
		actor: actor instanceof Actor ? actor : null,
		slotSemantic: browserCtx.slotSemantic ?? undefined,
		force: false,
		fromModificationsPackIndex: allowModificationsPackInference === true
	});

	const tierWarnings = chassisInstallTierSignificantWarnings(validation, relaxModPackCompat);
	let tier = /** @type {"valid"|"warn"|"blocked"} */ ("valid");
	if ( mode === "freeform" ) {
		if ( tierWarnings.length ) tier = "warn";
	}
	else if ( validation.blocking.length ) {
		tier = mode === "strict" ? "blocked" : "warn";
	}
	else if ( tierWarnings.length ) {
		tier = "warn";
	}

	rows.push({
		item,
		meta,
		placements,
		validation,
		tierSignificantWarnings: tierWarnings,
		tier,
		sourceLabel,
		uuid,
		name,
		img,
		slotCost: cost,
		systemRarity
	});
}

/**
 * @typedef {{
 *   preferredSlot?: { slotKind: "base"|"augment", slotIndex: number },
 *   slotSemantic?: string|null
 * }} ChassisInstallBrowserContext
 */

/**
 * Build filtered install candidates for the chassis browser (query + validation tiering).
 * World items use live documents; compendium entries use {@link CompendiumCollection#getIndex} only until the user picks one.
 * @param {import("@league/foundry").documents.Item} hostItem
 * @param {ChassisInstallBrowserContext} [browserCtx]
 * @returns {Promise<object[]>} rows for UI — each has `item` (null for compendium index rows), `tier`, `placements`, `validation`, `meta`, `sourceLabel`, display fields
 */
export async function getChassisInstallCandidates(hostItem, browserCtx = {}) {
	const chassis = normalizeChassis(hostItem, getChassis(hostItem));
	const mode = getEffectiveChassisRulesMode(hostItem);
	const toggles = getChassisEnforcementToggles();
	const actor = hostItem.actor ?? hostItem.parent;
	/** @type {object[]} */
	const rows = [];
	const worldLabel = globalThis.game?.i18n?.localize("SW5E.Chassis.SourceWorld") ?? "World";

	const worldItems = globalThis.game?.items;
	if ( worldItems ) {
		const docs = typeof worldItems.contents?.values === "function"
			? Array.from(worldItems.contents.values())
			: Array.from(worldItems);
		for ( const doc of docs ) {
			if ( !isWorldChassisModBrowserCandidate(doc, hostItem) ) continue;
			const allowInference = !isRecord(doc.flags?.sw5e?.chassisMod) && isEnhancedItemsModificationItemLike(doc);
			pushChassisInstallCandidateRow(rows, hostItem, browserCtx, {
				chassis,
				mode,
				toggles,
				actor,
				modItemLike: doc,
				item: doc,
				uuid: doc.uuid,
				name: doc.name,
				img: doc.img,
				sourceLabel: worldLabel,
				systemRarity: undefined,
				allowModificationsPackInference: allowInference
			});
		}
	}

	for ( const pack of getChassisModificationCompendiumPacks() ) {
		const packKey = pack.metadata?.id ?? "";
		const sourceLabel = pack.metadata?.label ?? packKey;
		try {
			await pack.getIndex({ fields: [...CHASSIS_MOD_COMPENDIUM_INDEX_FIELDS] });
		} catch ( err ) {
			console.warn("SW5E | Chassis: compendium index unavailable", packKey, err);
			continue;
		}
		for ( const entry of pack.index.values() ) {
			if ( !isChassisModCompendiumIndexEntry(entry, pack) ) continue;
			const uuid = typeof entry.uuid === "string" && entry.uuid
				? entry.uuid
				: (packKey && entry._id ? `Compendium.${packKey}.${entry._id}` : "");
			if ( !uuid ) continue;
			pushChassisInstallCandidateRow(rows, hostItem, browserCtx, {
				chassis,
				mode,
				toggles,
				actor,
				modItemLike: {
					type: entry.type,
					name: entry.name,
					flags: entry.flags,
					system: isRecord(entry.system) ? entry.system : {}
				},
				item: null,
				uuid,
				name: typeof entry.name === "string" ? entry.name : "—",
				img: typeof entry.img === "string" ? entry.img : "",
				sourceLabel,
				systemRarity: entry.system?.rarity,
				allowModificationsPackInference: true
			});
		}
	}

	const order = { valid: 0, warn: 1, blocked: 2 };
	rows.sort((a, b) => (order[a.tier] - order[b.tier]) || a.name.localeCompare(b.name, globalThis.game?.i18n?.lang ?? undefined));

	const isGm = globalThis.game?.user?.isGM === true;
	if ( mode === "strict" && !isGm ) return rows.filter(r => r.tier !== "blocked");

	return rows;
}

/**
 * Explain why {@link getChassisInstallCandidates} returned no rows (for install browser empty state).
 * @param {import("@league/foundry").documents.Item} hostItem
 * @param {ChassisInstallBrowserContext} [browserCtx]
 * @returns {Promise<string>} i18n key for a specific empty reason
 */
export async function diagnoseChassisInstallCandidatesEmpty(hostItem, browserCtx = {}) {
	const packs = getChassisModificationCompendiumPacks();
	if ( !packs.length ) return "SW5E.Chassis.InstallBrowserEmptyNoPacks";

	let indexedModEntries = 0;
	for ( const pack of packs ) {
		try {
			await pack.getIndex({ fields: [...CHASSIS_MOD_COMPENDIUM_INDEX_FIELDS] });
		} catch {
			return "SW5E.Chassis.InstallBrowserEmptyIndexFailed";
		}
		for ( const entry of pack.index.values() ) {
			if ( isChassisModCompendiumIndexEntry(entry, pack) ) indexedModEntries++;
		}
	}

	let worldModCount = 0;
	const worldItems = globalThis.game?.items;
	if ( worldItems ) {
		const docs = typeof worldItems.contents?.values === "function"
			? Array.from(worldItems.contents.values())
			: Array.from(worldItems);
		for ( const doc of docs ) {
			if ( isWorldChassisModBrowserCandidate(doc, hostItem) ) worldModCount++;
		}
	}

	if ( indexedModEntries === 0 && worldModCount === 0 ) return "SW5E.Chassis.InstallBrowserEmptyNoMetadata";

	const chassis = normalizeChassis(hostItem, getChassis(hostItem));
	if ( chassis.slots.used >= chassis.slots.totalMax ) return "SW5E.Chassis.InstallBrowserEmptyNoSlots";

	const rows = await getChassisInstallCandidates(hostItem, browserCtx);
	if ( !rows.length ) return "SW5E.Chassis.InstallBrowserEmptyNoCompatible";

	return "SW5E.Chassis.InstallBrowserEmpty";
}

/** @deprecated Alias for {@link getChassisInstallCandidates}. */
export const getChassisModificationCandidates = getChassisInstallCandidates;

function intervalsOverlap(a0, a1, b0, b1) {
	return a0 < b1 && b0 < a1;
}

/**
 * Next chassis rarity in the upgrade chain, or null if already at max.
 * @param {ChassisRarity} current
 * @returns {ChassisRarity|null}
 */
export function getNextChassisRarity(current) {
	const idx = CHASSIS_RARITIES.indexOf(current);
	if ( idx < 0 || idx >= CHASSIS_RARITIES.length - 1 ) return null;
	return CHASSIS_RARITIES[idx + 1];
}

/**
 * Validate raising this item's chassis rarity (one-step in strict mode).
 * @param {import("@league/foundry").documents.Item} hostItem
 * @param {ChassisRarity} targetRarity
 * @param {object} [ctx]
 * @param {boolean} [ctx.force] guided override
 */
export function validateChassisRarityUpgrade(hostItem, targetRarity, ctx = {}) {
	const mode = getEffectiveChassisRulesMode(hostItem);
	const chassis = normalizeChassis(hostItem, getChassis(hostItem));
	const blocking = [];
	const warnings = [];
	const next = getNextChassisRarity(chassis.rarity);
	const info = { current: chassis.rarity, target: targetRarity, nextAllowed: next };

	if ( mode === "freeform" ) {
		return validationResult({ mode, blocking: [], warnings, info, overrideAllowed: false });
	}

	if ( !chassis.enabled ) {
		blocking.push(issue("chassis-disabled", "Chassis is not enabled on this item."));
	}

	if ( !CHASSIS_RARITIES.includes(targetRarity) ) {
		blocking.push(issue("chassis-invalid-rarity", "Target rarity is not a valid chassis tier.", { target: targetRarity }));
	}

	if ( chassis.rarity === "artifact" ) {
		blocking.push(issue("chassis-max-rarity", "Chassis is already at maximum rarity."));
	}

	if ( mode === "strict" && next !== targetRarity ) {
		blocking.push(issue("chassis-upgrade-not-one-step", "Strict mode allows only a single rarity step.", { expected: next, got: targetRarity }));
	}

	if ( mode === "guided" && next !== targetRarity ) {
		warnings.push(issue("chassis-upgrade-not-one-step", "Target is not the next tier in the standard progression.", { expected: next, got: targetRarity }));
	}

	const trial = normalizeChassis(hostItem, chassis, { rarityPreview: targetRarity });
	if ( trial.slots.used > trial.slots.totalMax ) {
		blocking.push(issue("chassis-upgrade-slots-overflow", "Installed modifications exceed the new slot budget (unexpected).", { used: trial.slots.used, total: trial.slots.totalMax }));
	}

	if ( ctx.force && mode === "guided" && blocking.length ) {
		return validationResult({
			mode,
			blocking: [],
			warnings: [...warnings, ...blocking.map(b => issue(`${b.code}-overridden`, b.message, b.data))],
			info,
			overrideAllowed: true
		});
	}

	return validationResult({ mode, blocking, warnings, info, overrideAllowed: mode === "guided" && blocking.length > 0 });
}

// ——— validate install / remove / upgrade ———

/**
 * @param {import("@league/foundry").documents.Item} hostItem
 * @param {import("@league/foundry").documents.Item} modItem
 * @param {object} [ctx]
 * @param {number} [ctx.slotIndex] preferred slot index
 * @param {"base"|"augment"} [ctx.slotKind]
 * @param {boolean} [ctx.force] GM override (guided mode)
 * @param {import("@league/foundry").documents.Actor} [ctx.actor] future: tool prof on actor
 * @param {string} [ctx.slotSemantic] optional slot role from host `slotRowSemantics` (e.g. barrel)
 * @param {boolean} [ctx.fromModificationsPackIndex] validation while listing a Modifications compendium index row (before lazy load)
 * @param {boolean} [ctx.effectiveChassisModFromBrowser] use meta from install browser row (must match target uuid)
 * @param {object} [ctx.effectiveChassisModMeta] cloned row meta — keeps install aligned with listing for legacy pack rows
 * @param {string} [ctx.effectiveChassisModTargetUuid] uuid the browser meta was computed for (sanity check)
 */
export function validateChassisInstall(hostItem, modItem, ctx = {}) {
	const mode = getEffectiveChassisRulesMode(hostItem);
	const toggles = getChassisEnforcementToggles();
	const chassis = normalizeChassis(hostItem, getChassis(hostItem));
	const useBrowserMeta = ctx.effectiveChassisModFromBrowser === true
		&& isRecord(ctx.effectiveChassisModMeta)
		&& (!ctx.effectiveChassisModTargetUuid || String(ctx.effectiveChassisModTargetUuid) === String(modItem?.uuid));
	/** @type {object|null} */
	let meta;
	if ( useBrowserMeta ) {
		meta = clone(ctx.effectiveChassisModMeta);
	} else {
		const allowInfer = ctx.fromModificationsPackIndex === true || chassisModInferenceAllowed(modItem);
		meta = resolveChassisModMetaForInstall(modItem, { allowModificationsPackInference: allowInfer });
	}
	/** Same broad-list policy as {@link pushChassisInstallCandidateRow} for inferred compendium/world rows. */
	let relaxModPackCompat = ctx.fromModificationsPackIndex === true || chassisModInferenceAllowed(modItem);
	if ( useBrowserMeta && meta?.sourceType === "legacy-modifications-pack" ) relaxModPackCompat = true;
	const rawActor = ctx.actor ?? hostItem.actor ?? hostItem.parent;
	const actor = rawActor instanceof Actor ? rawActor : null;
	const blocking = [];
	const warnings = [];
	const info = {
		toolsRequired: meta?.requiresTool ? [meta.requiresTool] : [],
		installDC: meta?.installDC ?? null,
		slotsRemaining: chassis.slots.totalMax - chassis.slots.used,
		slotCost: meta?.slotCost ?? 1,
		hostRarity: chassis.rarity,
		hostType: chassis.type
	};

	if ( mode === "freeform" ) {
		if ( !chassis.enabled ) {
			warnings.push(issue("chassis-disabled", "Chassis is not enabled on this item."));
		}
		if ( !meta ) {
			warnings.push(issue("mod-meta-missing", "Modification has no usable chassis metadata; compatibility checks skipped."));
		}
		if ( meta?.sourceType === "legacy-modifications-pack" ) {
			warnings.push(issue("mod-legacy-pack-adapted", "This modification uses adapted metadata from the Modifications compendium entry (not yet authored with native flags.sw5e.chassisMod)."));
		}
		if ( meta?.inferenceConfidence === "inferred-basic" ) {
			warnings.push(issue("mod-inferred-basic", "Modification metadata was inferred with low confidence; verify compatibility before installing."));
		}
		if ( !relaxModPackCompat && meta?.compatibleSlotKinds?.length && ctx.slotSemantic && !meta.compatibleSlotKinds.includes(ctx.slotSemantic) ) {
			warnings.push(issue("slot-kind-incompatible", "Modification is not compatible with this slot role.", { slot: ctx.slotSemantic }));
		}
		if ( toggles.rarity && meta && !chassisModRarityAllowedOnHost(chassis.rarity, meta) ) {
			warnings.push(issue("mod-rarity-too-high", "Modification tier exceeds host chassis tier.", { modRarity: meta.modRarity, hostRarity: chassis.rarity }));
		}
		if ( ctx.slotIndex != null && ctx.slotKind ) {
			const cost = info.slotCost;
			const kind = ctx.slotKind === "augment" ? "augment" : "base";
			const start = Number(ctx.slotIndex);
			const span = Math.max(1, Number(cost) || 1);
			if ( !chassisSlotRangeAvailable(chassis, start, span, kind) ) {
				warnings.push(issue("slot-placement-invalid", "Chosen slot range is not free or out of bounds.", { slotKind: kind, slotIndex: start, span }));
			}
		}
		return validationResult({ mode, blocking: [], warnings, info, overrideAllowed: false });
	}

	if ( !meta ) {
		blocking.push(issue("mod-unrecognized", "This item has no usable chassis modification metadata and cannot be installed."));
	}

	if ( !relaxModPackCompat && mode === "strict" && meta?.inferenceConfidence === "inferred-basic" ) {
		blocking.push(issue("mod-inferred-basic-strict", "Strict mode does not allow installing this modification because its metadata could only be inferred with low confidence."));
	}

	if ( meta?.sourceType === "legacy-modifications-pack" && mode === "guided" ) {
		warnings.push(issue("mod-legacy-pack-adapted", "This modification uses adapted metadata from the Modifications compendium entry (not yet authored with native flags.sw5e.chassisMod)."));
	}
	if ( meta?.inferenceConfidence === "inferred-basic" && mode === "guided" ) {
		warnings.push(issue("mod-inferred-basic", "Modification metadata was inferred with low confidence; verify compatibility before installing."));
	}

	if ( !chassis.enabled ) {
		blocking.push(issue("chassis-disabled", "Chassis is not enabled on this item."));
	}

	const cost = info.slotCost;
	if ( toggles.slots && chassis.slots.used + cost > chassis.slots.totalMax ) {
		blocking.push(issue("slots-full", "Not enough modification slots.", { used: chassis.slots.used, total: chassis.slots.totalMax, cost }));
	}

	if ( toggles.rarity && meta && !relaxModPackCompat && !chassisRarityAllowsMod(chassis.rarity, meta) ) {
		blocking.push(issue("rarity-incompatible", "Modification is not compatible with this chassis rarity.", { hostRarity: chassis.rarity, max: meta.maxHostRarity }));
	}

	if ( toggles.rarity && meta && !chassisModRarityAllowedOnHost(chassis.rarity, meta) ) {
		blocking.push(issue("mod-rarity-too-high", "Modification tier exceeds host chassis tier.", { modRarity: meta.modRarity, hostRarity: chassis.rarity }));
	}

	if ( !relaxModPackCompat && toggles.rarity && meta?.compatibleChassisTypes?.length && !chassisTypeCompatible(chassis.type, meta) ) {
		blocking.push(issue("type-incompatible", "Modification does not support this chassis type.", { hostType: chassis.type }));
	}

	if ( !relaxModPackCompat && meta?.compatibleSlotKinds?.length && ctx.slotSemantic && !meta.compatibleSlotKinds.includes(ctx.slotSemantic) ) {
		blocking.push(issue("slot-kind-incompatible", "Modification is not compatible with this slot role.", { slot: ctx.slotSemantic }));
	}

	if ( toggles.tools && meta?.requiresTool && !actor ) {
		const toolIssue = issue("tool-check-pending", "Tool requirement not verified (no actor context).", { tool: meta.requiresTool, dc: meta.installDC });
		if ( mode === "strict" ) blocking.push(toolIssue);
		else warnings.push(toolIssue);
	}

	if ( ctx.slotIndex != null && ctx.slotKind ) {
		const kind = ctx.slotKind === "augment" ? "augment" : "base";
		const start = Number(ctx.slotIndex);
		const span = Math.max(1, Number(cost) || 1);
		const max = kind === "augment" ? chassis.slots.augmentMax : chassis.slots.baseMax;
		if ( start < 0 || start + span > max ) {
			blocking.push(issue("slot-bounds", "Modification does not fit in the chosen slot range.", { slotKind: kind, slotIndex: start, span, max }));
		} else {
			for ( const m of chassis.installedMods ?? [] ) {
				const mk = (m?.slotKind ?? "base") === "augment" ? "augment" : "base";
				if ( mk !== kind ) continue;
				const mStart = Number(m.slotIndex) || 0;
				const mSpan = getInstalledModSlotSpan(m);
				if ( intervalsOverlap(start, start + span, mStart, mStart + mSpan) ) {
					blocking.push(issue("slot-overlap", "Chosen slots overlap an installed modification.", { slotKind: kind, slotIndex: start, span }));
					break;
				}
			}
		}
	}

	if ( meta?.installDC != null && mode === "guided" ) {
		warnings.push(issue("install-dc", `Install may require a check (DC ${meta.installDC}).`, { dc: meta.installDC }));
	}

	if ( ctx.force && mode === "guided" ) {
		return validationResult({ mode, blocking: [], warnings: [...warnings, ...blocking.map(b => issue(`${b.code}-overridden`, b.message, b.data))], info, overrideAllowed: true });
	}

	return validationResult({ mode, blocking, warnings, info, overrideAllowed: mode === "guided" && blocking.length > 0 });
}

/**
 * @param {import("@league/foundry").documents.Item} hostItem
 * @param {string} installedUuid uuid of installedMods entry
 * @param {object} [ctx]
 * @param {boolean} [ctx.force]
 */
export function validateChassisRemove(hostItem, installedUuid, ctx = {}) {
	const mode = getEffectiveChassisRulesMode(hostItem);
	const chassis = normalizeChassis(hostItem, getChassis(hostItem));
	const blocking = [];
	const warnings = [];
	const entry = (chassis.installedMods ?? []).find(m => m?.uuid === installedUuid);
	const info = { installedUuid, found: Boolean(entry) };

	if ( mode === "freeform" ) {
		if ( !entry ) {
			warnings.push(issue("not-installed", "No installed modification matches that id."));
		}
		return validationResult({ mode, blocking: [], warnings, info, overrideAllowed: false });
	}

	if ( !entry ) {
		blocking.push(issue("not-installed", "No installed modification matches that id."));
	}

	if ( ctx.force && mode === "guided" && blocking.length ) {
		return validationResult({
			mode,
			blocking: [],
			warnings: [...warnings, ...blocking.map(b => issue(`${b.code}-overridden`, b.message, b.data))],
			info,
			overrideAllowed: true
		});
	}

	return validationResult({ mode, blocking, warnings, info, overrideAllowed: mode === "guided" && blocking.length > 0 });
}

/**
 * @param {import("@league/foundry").documents.Item} hostItem
 * @param {string} installedUuid
 * @param {import("@league/foundry").documents.Item} [newModItem] next tier mod (optional)
 * @param {object} [ctx]
 * @param {boolean} [ctx.force]
 */
export function validateChassisUpgrade(hostItem, installedUuid, newModItem = null, ctx = {}) {
	const mode = getEffectiveChassisRulesMode(hostItem);
	const toggles = getChassisEnforcementToggles();
	const chassis = normalizeChassis(hostItem, getChassis(hostItem));
	const blocking = [];
	const warnings = [];
	const entry = (chassis.installedMods ?? []).find(m => m?.uuid === installedUuid);
	const meta = newModItem
		? resolveChassisModMetaForInstall(newModItem, { allowModificationsPackInference: modificationsPackInferenceEligible(newModItem) })
		: null;
	const rawActor = ctx.actor ?? hostItem.actor ?? hostItem.parent;
	const actor = rawActor instanceof Actor ? rawActor : null;
	const info = { installedUuid, nextRank: meta?.upgradeRank ?? null, installDC: meta?.installDC ?? null };

	if ( mode === "freeform" ) {
		return validationResult({ mode, blocking: [], warnings, info, overrideAllowed: false });
	}

	if ( !entry ) {
		blocking.push(issue("not-installed", "Cannot upgrade: slot is empty or id unknown."));
	}

	if ( newModItem && toggles.tools && meta?.requiresTool && !actor ) {
		const toolIssue = issue("tool-check-pending", "Tool requirement not verified (no actor context).", { tool: meta.requiresTool, dc: meta.installDC });
		if ( mode === "strict" ) blocking.push(toolIssue);
		else warnings.push(toolIssue);
	}

	if ( meta?.installDC != null && mode === "guided" ) {
		warnings.push(issue("upgrade-dc", `Upgrade may require a check (DC ${meta.installDC}).`, { dc: meta.installDC }));
	}

	if ( ctx.force && mode === "guided" && blocking.length ) {
		return validationResult({
			mode,
			blocking: [],
			warnings: [...warnings, ...blocking.map(b => issue(`${b.code}-overridden`, b.message, b.data))],
			info,
			overrideAllowed: true
		});
	}

	return validationResult({ mode, blocking, warnings, info, overrideAllowed: mode === "guided" && blocking.length > 0 });
}

/**
 * Build one `installedMods` element (persist inside `flags.sw5e.chassis` after a successful install).
 * @param {import("@league/foundry").documents.Item} modItem
 * @param {object} [partial]
 * @param {object} [partial.effectiveChassisModMeta] row meta from the install browser (preferred over re-inference for legacy pack)
 */
export function createInstalledModEntry(modItem, partial = {}) {
	const meta = isRecord(partial.effectiveChassisModMeta)
		? clone(partial.effectiveChassisModMeta)
		: resolveChassisModMetaForInstall(modItem, {
			allowModificationsPackInference: modificationsPackInferenceEligible(modItem)
		});
	const slotCost = partial.slotCost ?? meta?.slotCost ?? 1;
	const snapshotChassisMod = isRecord(modItem?.flags?.sw5e?.chassisMod)
		? clone(modItem.flags.sw5e.chassisMod)
		: (meta ? chassisModMetaForSnapshot(meta) : null);
	const snapshotEffects = cloneEffectsSnapshot(modItem?.effects);
	const adaptation = meta?.sourceType === "legacy-modifications-pack"
		? { sourceType: meta.sourceType, confidence: meta.inferenceConfidence }
		: undefined;
	return {
		uuid: partial.uuid ?? modItem?.uuid ?? foundry.utils.randomID(),
		slotIndex: partial.slotIndex ?? 0,
		slotKind: partial.slotKind === "augment" ? "augment" : "base",
		installedAt: partial.installedAt ?? Date.now(),
		slotCost,
		snapshot: {
			name: modItem?.name ?? "",
			type: modItem?.type ?? "",
			img: modItem?.img ?? "",
			rarity: modItem?.system?.rarity ?? "",
			...(snapshotEffects ? { effects: snapshotEffects } : {}),
			flags: snapshotChassisMod ? { sw5e: { chassisMod: snapshotChassisMod } } : undefined,
			...(adaptation ? { adaptation } : {})
		},
		upgradeRank: partial.upgradeRank ?? meta?.upgradeRank ?? null,
		cooldownUntil: partial.cooldownUntil ?? null,
		workflowState: partial.workflowState ?? null
	};
}

// ——— Public bundle for globalThis.sw5e.chassis ———

export const chassisApi = {
	CHASSIS_RARITIES,
	CHASSIS_RULES_MODES,
	CHASSIS_RARITY_SLOT_TABLE,
	CHASSIS_TYPE_SLOT_TEMPLATE,
	CHASSIS_SETTING_KEYS,
	CHASSIS_ELIGIBLE_ITEM_TYPES,
	ITEM_SYSTEM_RARITY_TO_CHASSIS,
	CHASSIS_TO_ITEM_SYSTEM_RARITY,
	getChassisSlotBudget,
	getChassis,
	mergeChassisUpdate,
	createDefaultChassis,
	normalizeChassis,
	getItemDndTypeKey,
	isItemEligibleForChassis,
	inferChassisTypeFromItem,
	inferChassisRarityFromItem,
	getEffectiveChassisRarity,
	chassisRarityToItemSystemRarity,
	buildEnabledChassisStateForItem,
	buildChassisSlotDisplayRows,
	getEffectiveChassisRulesMode,
	getChassisEnforcementToggles,
	getChassisModMeta,
	resolveChassisModMetaForInstall,
	modificationsPackInferenceEligible,
	chassisModMetaForSnapshot,
	collectChassisBrowserInformationalHintKeys,
	chassisInstallTierSignificantWarnings,
	collectChassisBrowserWarningHintKeys,
	CHASSIS_MOD_SOURCE_PACK_NAMES,
	ENHANCEDITEMS_ITEM_MODIFICATIONS_FOLDER_ID,
	getChassisModificationCompendiumPacks,
	collectChassisModificationItemDocuments,
	getChassisSlotSemantic,
	chassisModRarityAllowedOnHost,
	chassisModSlotSemanticCompatible,
	filterChassisPlacementsForPreference,
	getChassisInstallCandidates,
	getChassisModificationCandidates,
	diagnoseChassisInstallCandidatesEmpty,
	chassisModInferenceAllowed,
	isChassisModCompendiumIndexEntry,
	isEnhancedItemsModificationItemLike,
	parseChassisModEffects,
	validateChassisInstall,
	validateChassisRemove,
	validateChassisUpgrade,
	validateChassisRarityUpgrade,
	getNextChassisRarity,
	getInstalledModSlotSpan,
	installedModOccupiesRow,
	chassisSlotRangeAvailable,
	findChassisInstallPlacements,
	createInstalledModEntry
};
