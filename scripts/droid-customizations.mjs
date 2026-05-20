/**
 * Droid customization items + actor-level install state (`flags.sw5e.droidCustomizations`).
 * Phase 1: data model, normalization, validation, mutations — no sheet UI or runtime effects.
 *
 * Host routing is **species-only** via {@link isActorDroidCustomizationHost} (see {@link SW5E_DROID_SPECIES_NAMES}).
 */

// ——— Item flag key (singular on Item documents) ———

export const ITEM_META_FLAG = /** @type {const} */ ("droidCustomization");

export const DROID_CUSTOMIZATION_CUSTOM_LABEL = /** @type {const} */ ("Droid Customization");

/** @typedef {"part"|"protocol"} DroidCustomizationCategory */
/** @typedef {"standard"|"premium"|"prototype"|"advanced"|"legendary"|"artifact"} DroidCustomizationRarity */
/** @typedef {"native"|"legacy"|"world"} DroidCustomizationSourceType */
/** @typedef {"str"|"dex"|"con"} DroidPartsAbilityKey */
/** @typedef {"int"|"wis"|"cha"} DroidProtocolsAbilityKey */

export const DROID_CUSTOMIZATION_CATEGORIES = /** @type {const} */ ([ "part", "protocol" ]);
export const DROID_PARTS_ABILITY_KEYS = /** @type {const} */ ([ "str", "dex", "con" ]);
export const DROID_PROTOCOLS_ABILITY_KEYS = /** @type {const} */ ([ "int", "wis", "cha" ]);

export const DROID_CUSTOMIZATION_RARITIES = /** @type {const} */ ([
	"standard",
	"premium",
	"prototype",
	"advanced",
	"legendary",
	"artifact"
]);

export const DEFAULT_DROID_CUSTOMIZATION_VALID_TARGET_TYPES = /** @type {const} */ ([ "droid" ]);

/** Authoritative droid species item names for body-mod host routing (must match compendium `name` exactly). */
export const SW5E_DROID_SPECIES_NAMES = /** @type {const} */ ([
	"Droid, Class I",
	"Droid, Class II",
	"Droid, Class III",
	"Droid, Class IV",
	"Droid, Class V"
]);

const DROID_SPECIES_SET = new Set(SW5E_DROID_SPECIES_NAMES);

const PARTS_ABILITY_KEYS = DROID_PARTS_ABILITY_KEYS;
const PROTOCOLS_ABILITY_KEYS = DROID_PROTOCOLS_ABILITY_KEYS;

const ITEM_SYSTEM_RARITY_TO_DROID = Object.freeze({
	"": "standard",
	common: "standard",
	uncommon: "premium",
	rare: "prototype",
	veryRare: "advanced",
	legendary: "legendary",
	artifact: "artifact"
});

/** Base install / upgrade duration for a Medium droid (hours). */
export const BASE_DROID_CUSTOMIZATION_INSTALL_HOURS_MEDIUM = 8;

/** dnd5e `system.traits.size` keys → install time multiplier (same table as cybernetics). */
export const DROID_CUSTOMIZATION_SIZE_INSTALL_MULTIPLIER = Object.freeze({
	tiny: 0.25,
	sm: 0.5,
	med: 1,
	lg: 2,
	huge: 5,
	grg: 10
});

export const DROID_DEFAULT_MOTOR_SLOTS = 2;
export const DROID_MAX_MOTOR_SLOTS = 6;

/** Credits to reach a given **total** motor slot count (from Modifications / SW5e economy). */
export const DROID_MOTOR_UPGRADE_COST_BY_TOTAL_SLOTS = Object.freeze({
	3: 2000,
	4: 10000,
	5: 50000,
	6: 200000
});
export const DROID_CUSTOMIZATION_DC_BY_RARITY = Object.freeze({
	standard: 15,
	premium: 19,
	prototype: 23,
	advanced: 27,
	legendary: 31,
	artifact: 35
});

const FLAG_ROOT = "flags.sw5e.droidCustomizations";
const DROID_INSTALL_RETRY_WAIT_MS = 24 * 60 * 60 * 1000;
const DROID_REQUIRED_TOOL_ALIASES = Object.freeze({
	astrotech: "astrotechsimplements",
	astrotechsimplements: "astrotechsimplements"
});

function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function issue(code, message, data) {
	return data ? { code, message, data } : { code, message };
}

/**
 * @param {object} p
 * @param {ReturnType<typeof issue>[]} p.blocking
 * @param {ReturnType<typeof issue>[]} p.warnings
 * @param {object} p.info
 * @param {boolean} [p.force]
 */
function droidValidationResult({ blocking, warnings, info, force = false }) {
	const hasBlocking = blocking.length > 0;
	const ok = !hasBlocking || force === true;
	return { ok, blocking, warnings, info, force: force === true };
}

// ——— Source / species (existing routing) ———

/**
 * dnd5e item source “Custom Label” (`system.source.custom`), trimmed.
 * @param {object|null|undefined} itemLike
 * @returns {string}
 */
export function getItemSourceCustom(itemLike) {
	const c = itemLike?.system?.source?.custom;
	return typeof c === "string" ? c.trim() : "";
}

/**
 * Native `flags.sw5e.droidCustomization` when present.
 * @param {object|null|undefined} itemLike
 * @returns {object|null}
 */
export function getDroidCustomizationItemMeta(itemLike) {
	const m = itemLike?.flags?.sw5e?.[ITEM_META_FLAG];
	return isRecord(m) ? m : null;
}

/**
 * @param {object|null|undefined} itemLike
 */
export function isDroidCustomizationSourceCustom(itemLike) {
	return getItemSourceCustom(itemLike) === DROID_CUSTOMIZATION_CUSTOM_LABEL;
}

/**
 * True when the item participates in the droid customization content pool (native flag or Custom Label).
 * @param {object|null|undefined} itemLike
 */
export function isDroidCustomizationItem(itemLike) {
	if ( getDroidCustomizationItemMeta(itemLike) ) return true;
	return isDroidCustomizationSourceCustom(itemLike);
}

/**
 * Collect species display names from the actor (embedded `species` / `race`, `actor.species`, `system.details.species`).
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 * @returns {string[]}
 */
export function collectActorSpeciesNames(actor) {
	const out = /** @type {string[]} */ ([]);
	const seen = new Set();
	const add = raw => {
		const n = typeof raw === "string" ? raw.trim() : "";
		if ( !n || seen.has(n) ) return;
		seen.add(n);
		out.push(n);
	};

	if ( actor?.items ) {
		for ( const item of actor.items ) {
			if ( item.type === "species" || item.type === "race" ) add(item.name);
		}
	}

	const nameFromSpecies = actor?.species?.name;
	if ( typeof nameFromSpecies === "string" ) add(nameFromSpecies);

	const ref = actor?.system?.details?.species;
	if ( ref == null ) return out;
	if ( typeof ref === "string" ) {
		add(ref);
		return out;
	}
	if ( typeof ref === "object" ) {
		if ( typeof ref.name === "string" ) add(ref.name);
		const label = ref.label;
		if ( typeof label === "string" ) add(label);
	}
	return out;
}

/**
 * Species-only: actor is a SW5E droid-class species (authoritative host check for this phase).
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 */
export function isActorDroidCustomizationHost(actor) {
	for ( const n of collectActorSpeciesNames(actor) ) {
		if ( DROID_SPECIES_SET.has(n) ) return true;
	}
	return false;
}

/**
 * Valid target for installing droid customizations (same as {@link isActorDroidCustomizationHost} in Phase 1).
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 */
export function isActorValidDroidCustomizationTarget(actor) {
	return isActorDroidCustomizationHost(actor);
}

function isLegacyStarshipActor(actor) {
	return actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

/**
 * Character/NPC droid-class species actors that may use the droid customizations sheet/manager (not vehicles / legacy starships).
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 */
export function isActorDroidCustomizationsManagerAllowed(actor) {
	if ( !actor ) return false;
	if ( actor.type === "vehicle" ) return false;
	if ( isLegacyStarshipActor(actor) ) return false;
	if ( actor.type !== "character" && actor.type !== "npc" ) return false;
	return isActorDroidCustomizationHost(actor);
}

// ——— Actor size / abilities ———

/**
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 * @returns {string}
 */
export function getActorSizeKeyForDroidCustomization(actor) {
	const size = actor?.system?.traits?.size;
	return typeof size === "string" && size ? size : "med";
}

/**
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 * @param {string} key
 * @returns {number}
 */
export function getActorAbilityMod(actor, key) {
	const a = actor?.system?.abilities?.[key];
	if ( !isRecord(a) ) return 0;
	const m = a.mod;
	if ( typeof m === "number" && Number.isFinite(m) ) return m;
	return 0;
}

/**
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 * @param {string|null|undefined} toolKey
 * @returns {number}
 */
export function getActorToolProficiencyValue(actor, toolKey) {
	const key = typeof toolKey === "string" ? toolKey.trim() : "";
	if ( !key ) return 0;
	const value = actor?.system?.tools?.[key]?.value;
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : 0;
}

// ——— Time & upgrade cost ———

/**
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 * @returns {number}
 */
export function getDroidCustomizationSizeMultiplier(actor) {
	const size = getActorSizeKeyForDroidCustomization(actor);
	return DROID_CUSTOMIZATION_SIZE_INSTALL_MULTIPLIER[/** @type {keyof typeof DROID_CUSTOMIZATION_SIZE_INSTALL_MULTIPLIER} */ (size)]
		?? 1;
}

/**
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 * @returns {number}
 */
export function getCustomizationInstallTimeHours(actor) {
	return BASE_DROID_CUSTOMIZATION_INSTALL_HOURS_MEDIUM * getDroidCustomizationSizeMultiplier(actor);
}

/**
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 * @returns {number}
 */
export function getCustomizationRemovalTimeHours(actor) {
	return getCustomizationInstallTimeHours(actor) / 2;
}

/**
 * Motor slot upgrade uses the same size scaling as installation.
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 * @param {number} targetSlots
 * @returns {number}
 */
export function getMotorUpgradeTimeHours(actor, targetSlots) {
	void targetSlots;
	return getCustomizationInstallTimeHours(actor);
}

/**
 * Credits for a one-step upgrade to `targetSlots` total motor capacity (table keyed by total slots 3–6).
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 * @param {number} targetSlots
 * @returns {number|null} `null` if there is no defined price for that total.
 */
export function getMotorUpgradeCost(actor, targetSlots) {
	const n = Math.floor(Number(targetSlots));
	const t = /** @type {keyof typeof DROID_MOTOR_UPGRADE_COST_BY_TOTAL_SLOTS} */ (n);
	if ( !Object.prototype.hasOwnProperty.call(DROID_MOTOR_UPGRADE_COST_BY_TOTAL_SLOTS, t) ) return null;
	return Math.round(DROID_MOTOR_UPGRADE_COST_BY_TOTAL_SLOTS[t] * getDroidCustomizationSizeMultiplier(actor));
}

// ——— Item metadata ———

/**
 * @param {object|null|undefined} meta
 * @returns {meta is object}
 */
export function isValidDroidCustomizationItemMeta(meta) {
	if ( !isRecord(meta) ) return false;
	if ( !DROID_CUSTOMIZATION_CATEGORIES.includes(meta.category) ) return false;
	if ( meta.rarity != null && !DROID_CUSTOMIZATION_RARITIES.includes(meta.rarity) ) return false;
	if ( meta.validTargetTypes != null && !Array.isArray(meta.validTargetTypes) ) return false;
	if ( meta.motorSlotCost != null ) {
		const c = Number(meta.motorSlotCost);
		if ( !Number.isFinite(c) || c < 1 ) return false;
	}
	if ( meta.installDC != null && !Number.isFinite(Number(meta.installDC)) ) return false;
	return true;
}

function inferDroidCategoryFromSourceRoutedItem(item) {
	const uid = item?.flags?.["sw5e-importer"]?.uid;
	if ( typeof uid === "string" ) {
		if ( uid.includes("subtype-protocol") || /protocol/i.test(uid) ) return /** @type {DroidCustomizationCategory} */ ("protocol");
		if ( uid.includes("subtype-part") || /part/i.test(uid) ) return /** @type {DroidCustomizationCategory} */ ("part");
	}
	const html = item?.system?.description?.value;
	if ( typeof html === "string" ) {
		if ( /Droid Customization \(Protocol\)/i.test(html) ) return /** @type {DroidCustomizationCategory} */ ("protocol");
		if ( /Droid Customization \(Part\)/i.test(html) ) return /** @type {DroidCustomizationCategory} */ ("part");
	}
	return /** @type {DroidCustomizationCategory} */ ("part");
}

/**
 * @param {object} item
 * @returns {DroidCustomizationRarity}
 */
export function inferDroidCustomizationRarityFromItem(item) {
	const raw = item?.system?.rarity;
	const key = typeof raw === "object" && raw !== null ? (raw.value ?? "") : (raw ?? "");
	const normalized = typeof key === "string" ? key : "";
	const mapped = ITEM_SYSTEM_RARITY_TO_DROID[normalized];
	if ( mapped ) return /** @type {DroidCustomizationRarity} */ (mapped);
	if ( DROID_CUSTOMIZATION_RARITIES.includes(normalized) ) return /** @type {DroidCustomizationRarity} */ (normalized);
	return /** @type {DroidCustomizationRarity} */ ("standard");
}

function inferDroidCustomizationSourceType(item) {
	if ( isValidDroidCustomizationItemMeta(getDroidCustomizationItemMeta(item)) ) return /** @type {DroidCustomizationSourceType} */ ("native");
	if ( isRecord(item?.flags?.["sw5e-importer"]) ) return /** @type {DroidCustomizationSourceType} */ ("legacy");
	return /** @type {DroidCustomizationSourceType} */ ("world");
}

/**
 * Normalize defaults onto item meta for validation/install.
 * @param {object} meta
 * @returns {object}
 */
export function normalizeDroidCustomizationItemMetaRecord(meta) {
	const m = foundry.utils.deepClone(meta);
	if ( !Array.isArray(m.validTargetTypes) || !m.validTargetTypes.length ) {
		m.validTargetTypes = [...DEFAULT_DROID_CUSTOMIZATION_VALID_TARGET_TYPES];
	}
	if ( m.motorSlotCost == null ) m.motorSlotCost = 1;
	else m.motorSlotCost = Math.max(1, Math.floor(Number(m.motorSlotCost) || 1));
	if ( m.effects == null ) m.effects = {};
	return m;
}

/**
 * Native valid meta, or inferred meta for `system.source.custom` === {@link DROID_CUSTOMIZATION_CUSTOM_LABEL}.
 * @param {object|null|undefined} item
 * @returns {object|null}
 */
export function getEffectiveDroidCustomizationItemMeta(item) {
	const native = getDroidCustomizationItemMeta(item);
	if ( isValidDroidCustomizationItemMeta(native) ) return normalizeDroidCustomizationItemMetaRecord(native);
	if ( !isDroidCustomizationSourceCustom(item) ) return null;
	return normalizeDroidCustomizationItemMetaRecord({
		category: inferDroidCategoryFromSourceRoutedItem(item),
		validTargetTypes: [...DEFAULT_DROID_CUSTOMIZATION_VALID_TARGET_TYPES],
		requiredTool: "astrotech",
		rarity: inferDroidCustomizationRarityFromItem(item),
		installDC: null,
		motorSlotCost: 1,
		effects: {}
	});
}

function normalizeRequiredToolAlias(value) {
	return String(value ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * @param {string|null|undefined} requiredTool
 * @returns {string|null}
 */
export function resolveDroidRequiredToolActorKey(requiredTool) {
	const key = normalizeRequiredToolAlias(requiredTool);
	return key ? DROID_REQUIRED_TOOL_ALIASES[key] ?? null : null;
}

/**
 * @param {object|null|undefined} data
 * @returns {string}
 */
export function getDroidCustomizationRequiredTool(data) {
	const explicit = data?.requiredTool ?? data?.snapshot?.flags?.sw5e?.[ITEM_META_FLAG]?.requiredTool;
	if ( typeof explicit === "string" && explicit.trim() ) return explicit.trim();
	return "astrotech";
}

/**
 * @param {object|null|undefined} data
 * @returns {number|null}
 */
export function getDroidCustomizationCheckDc(data) {
	const explicit = data?.installDC ?? data?.snapshot?.flags?.sw5e?.[ITEM_META_FLAG]?.installDC;
	if ( explicit != null && Number.isFinite(Number(explicit)) ) return Number(explicit);
	const rarity = typeof data?.rarity === "string" ? data.rarity : "";
	const mapped = DROID_CUSTOMIZATION_DC_BY_RARITY[/** @type {keyof typeof DROID_CUSTOMIZATION_DC_BY_RARITY} */ (rarity)];
	return Number.isFinite(mapped) ? mapped : null;
}

function getRemainingRetryWaitMs(lastFailureAt, waitMs, now = Date.now()) {
	const ts = Number(lastFailureAt);
	if ( !Number.isFinite(ts) || ts <= 0 ) return 0;
	return Math.max(0, (Number(waitMs) || 0) - Math.max(0, now - ts));
}

function formatRetryWaitHours(remainingMs) {
	return Math.max(1, Math.ceil(Number(remainingMs) / (60 * 60 * 1000)));
}

// ——— Category limits (parts / protocols) ———

/**
 * Allowed Part installs: chosen STR/DEX/CON modifier, minimum 1.
 * If `limits.partsAbility` is unset, uses the **highest** modifier among str/dex/con (documented fallback).
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 * @param {object} [limits] from state.limits
 * @returns {{ allowed: number, policy: "explicit"|"fallback-highest" }}
 */
export function getAllowedDroidPartsDetail(actor, limits = {}) {
	const key = limits.partsAbility;
	if ( typeof key === "string" && PARTS_ABILITY_KEYS.includes(/** @type {*} */ (key)) ) {
		return {
			allowed: Math.max(1, getActorAbilityMod(actor, key)),
			policy: /** @type {const} */ ("explicit")
		};
	}
	const best = Math.max(...PARTS_ABILITY_KEYS.map(k => getActorAbilityMod(actor, k)));
	return {
		allowed: Math.max(1, best),
		policy: /** @type {const} */ ("fallback-highest")
	};
}

/**
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 * @param {object} [limits]
 * @returns {number}
 */
export function getAllowedDroidPartsCount(actor, limits) {
	return getAllowedDroidPartsDetail(actor, limits).allowed;
}

/**
 * Allowed Protocol installs: chosen INT/WIS/CHA modifier, minimum 1.
 * If `limits.protocolsAbility` is unset, uses the **highest** among int/wis/cha.
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 * @param {object} [limits]
 * @returns {{ allowed: number, policy: "explicit"|"fallback-highest" }}
 */
export function getAllowedDroidProtocolsDetail(actor, limits = {}) {
	const key = limits.protocolsAbility;
	if ( typeof key === "string" && PROTOCOLS_ABILITY_KEYS.includes(/** @type {*} */ (key)) ) {
		return {
			allowed: Math.max(1, getActorAbilityMod(actor, key)),
			policy: /** @type {const} */ ("explicit")
		};
	}
	const best = Math.max(...PROTOCOLS_ABILITY_KEYS.map(k => getActorAbilityMod(actor, k)));
	return {
		allowed: Math.max(1, best),
		policy: /** @type {const} */ ("fallback-highest")
	};
}

/**
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 * @param {object} [limits]
 * @returns {number}
 */
export function getAllowedDroidProtocolsCount(actor, limits) {
	return getAllowedDroidProtocolsDetail(actor, limits).allowed;
}

// ——— Default / normalize actor state ———

export function createDefaultDroidCustomizationsState() {
	const motorSlots = DROID_DEFAULT_MOTOR_SLOTS;
	const installed = [];
	const limits = {
		maxMotorSlots: DROID_MAX_MOTOR_SLOTS,
		partsAbility: null,
		protocolsAbility: null
	};
	const derived = recomputeDroidDerived(installed, motorSlots, limits, null);
	const workflowState = {
		lastInstallFailureAt: null,
		lastRemoveFailureAt: null,
		lastMotorUpgradeFailureAt: null
	};
	return { motorSlots, installed, limits, derived, workflowState };
}

/**
 * @param {object[]} installed
 * @param {number} motorSlots
 * @param {object} limits
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 */
function recomputeDroidDerived(installed, motorSlots, limits, actor) {
	let motorUsed = 0;
	let parts = 0;
	let protocols = 0;
	for ( const e of installed ) {
		if ( !isRecord(e) ) continue;
		const cost = Math.max(1, Math.floor(Number(e.motorSlotCost) || 1));
		motorUsed += cost;
		if ( e.category === "part" ) parts++;
		else if ( e.category === "protocol" ) protocols++;
	}
	const slots = Math.max(DROID_DEFAULT_MOTOR_SLOTS, Math.min(DROID_MAX_MOTOR_SLOTS, Math.floor(Number(motorSlots) || DROID_DEFAULT_MOTOR_SLOTS)));
	const partsDetail = actor ? getAllowedDroidPartsDetail(actor, limits) : { allowed: 1, policy: "fallback-highest" };
	const protDetail = actor ? getAllowedDroidProtocolsDetail(actor, limits) : { allowed: 1, policy: "fallback-highest" };
	return {
		counts: {
			total: installed.filter(isRecord).length,
			parts,
			protocols
		},
		capacity: {
			motorUsed,
			motorAvailable: Math.max(0, slots - motorUsed),
			partsAllowed: partsDetail.allowed,
			protocolsAllowed: protDetail.allowed,
			partsPolicy: partsDetail.policy,
			protocolsPolicy: protDetail.policy
		}
	};
}

/**
 * @param {object} [raw]
 * @param {object|null} [partial]
 */
export function normalizeDroidCustomizationsState(raw = {}, partial = null, actorForDerived = null) {
	const defaults = createDefaultDroidCustomizationsState();
	const base = isRecord(raw) ? foundry.utils.deepClone(raw) : {};
	if ( isRecord(partial) ) foundry.utils.mergeObject(base, partial, { inplace: true });

	let motorSlots = Number(base.motorSlots);
	if ( !Number.isFinite(motorSlots) ) motorSlots = DROID_DEFAULT_MOTOR_SLOTS;
	motorSlots = Math.max(DROID_DEFAULT_MOTOR_SLOTS, Math.min(DROID_MAX_MOTOR_SLOTS, Math.floor(motorSlots)));

	const installed = Array.isArray(base.installed)
		? base.installed.filter(isRecord).map(e => foundry.utils.deepClone(e))
		: [];

	const limits = isRecord(base.limits)
		? foundry.utils.mergeObject(foundry.utils.deepClone(defaults.limits), base.limits, { inplace: false })
		: foundry.utils.deepClone(defaults.limits);

	const workflowState = isRecord(base.workflowState)
		? foundry.utils.mergeObject(foundry.utils.deepClone(defaults.workflowState), base.workflowState, { inplace: false })
		: foundry.utils.deepClone(defaults.workflowState);

	const derived = recomputeDroidDerived(installed, motorSlots, limits, actorForDerived);

	return { motorSlots, installed, limits, derived, workflowState };
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {object|null} [partial]
 */
export function normalizeActorDroidCustomizations(actor, partial = null) {
	const raw = actor?.flags?.sw5e?.droidCustomizations;
	return normalizeDroidCustomizationsState(isRecord(raw) ? raw : {}, partial, actor);
}

// ——— Motor capacity helpers ———

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {ReturnType<typeof normalizeActorDroidCustomizations>} [state]
 */
export function getMotorSlotsForActor(actor, state = null) {
	const s = state ?? normalizeActorDroidCustomizations(actor);
	return s.motorSlots;
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {ReturnType<typeof normalizeActorDroidCustomizations>} [state]
 */
export function getUsedMotorSlots(actor, state = null) {
	const s = state ?? normalizeActorDroidCustomizations(actor);
	return s.derived.capacity.motorUsed;
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {ReturnType<typeof normalizeActorDroidCustomizations>} [state]
 */
export function getAvailableMotorSlots(actor, state = null) {
	const s = state ?? normalizeActorDroidCustomizations(actor);
	return s.derived.capacity.motorAvailable;
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {object|null|undefined} item If set, checks whether that item could be added without exceeding motor or category caps.
 * @param {ReturnType<typeof normalizeActorDroidCustomizations>} [state]
 */
export function isActorAtDroidCustomizationCapacity(actor, item = null, state = null) {
	const s = state ?? normalizeActorDroidCustomizations(actor);
	if ( !item ) return s.derived.capacity.motorAvailable <= 0;
	const meta = getEffectiveDroidCustomizationItemMeta(item);
	if ( !meta || !isValidDroidCustomizationItemMeta(meta) ) return false;
	const cost = Math.max(1, Math.floor(Number(meta.motorSlotCost) || 1));
	if ( s.derived.capacity.motorAvailable < cost ) return true;
	const cat = meta.category;
	const cap = s.derived.capacity;
	if ( cat === "part" && s.derived.counts.parts >= cap.partsAllowed ) return true;
	if ( cat === "protocol" && s.derived.counts.protocols >= cap.protocolsAllowed ) return true;
	return false;
}

// ——— Installed entry factory ———

function getItemDndTypeKey(item) {
	return item?.type?.split?.(".").at(-1) ?? item?.type ?? "";
}

/**
 * @param {import("@league/foundry").documents.Item} item
 * @param {object} [partial]
 */
export function createInstalledDroidCustomizationEntry(item, partial = {}) {
	const meta = getEffectiveDroidCustomizationItemMeta(item);
	const category = partial.category ?? meta?.category;
	const rarity = partial.rarity ?? meta?.rarity ?? inferDroidCustomizationRarityFromItem(item);
	const motorSlotCost = partial.motorSlotCost ?? Math.max(1, Math.floor(Number(meta?.motorSlotCost) || 1));
	const requiredTool = partial.requiredTool ?? getDroidCustomizationRequiredTool(meta);
	const installDC = partial.installDC ?? getDroidCustomizationCheckDc(meta);
	const typeKey = getItemDndTypeKey(item);
	const rawRarity = item?.system?.rarity;
	const raritySnapshot = typeof rawRarity === "object" && rawRarity !== null
		? foundry.utils.deepClone(rawRarity)
		: (rawRarity ?? "");

	const snapshotFlags = {};
	if ( isRecord(item?.flags?.sw5e) ) {
		const dc = item.flags.sw5e[ITEM_META_FLAG];
		if ( isRecord(dc) ) snapshotFlags.sw5e = { [ITEM_META_FLAG]: foundry.utils.deepClone(dc) };
	}

	return {
		uuid: partial.uuid ?? item?.uuid ?? "",
		name: partial.name ?? item?.name ?? "",
		category,
		rarity,
		installedAt: partial.installedAt ?? Date.now(),
		motorSlotCost,
		requiredTool,
		installDC,
		snapshot: {
			name: partial.snapshot?.name ?? item?.name ?? "",
			type: partial.snapshot?.type ?? typeKey,
			img: partial.snapshot?.img ?? item?.img ?? "",
			rarity: partial.snapshot?.rarity ?? raritySnapshot,
			flags: partial.snapshot?.flags ?? (Object.keys(snapshotFlags).length ? snapshotFlags : {})
		},
		sourceType: partial.sourceType ?? inferDroidCustomizationSourceType(item)
	};
}

// ——— Persist ———

/**
 * Persist `flags.sw5e.droidCustomizations` via actor.update (same pattern as augmentations).
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {object} data
 */
async function persistActorDroidCustomizationsState(actor, data) {
	const payload = normalizeDroidCustomizationsState(data, null, actor);
	await actor.update({ [FLAG_ROOT]: payload });
}

function buildDroidStateForPersist(actor, patch) {
	const base = normalizeActorDroidCustomizations(actor);
	return normalizeDroidCustomizationsState(
		foundry.utils.mergeObject(foundry.utils.deepClone(base), patch, { inplace: false }),
		null,
		actor
	);
}

function sanitizeDroidLimitAbility(value, allowedKeys) {
	const key = typeof value === "string" ? value.trim().toLowerCase() : "";
	if ( !key ) return null;
	return allowedKeys.includes(/** @type {*} */ (key)) ? key : null;
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {{ partsAbility?: string|null, protocolsAbility?: string|null }} limitsPatch
 */
export async function updateDroidCustomizationLimitAbilities(actor, limitsPatch = {}) {
	const state = normalizeActorDroidCustomizations(actor);
	const nextLimits = foundry.utils.deepClone(state.limits);
	if ( Object.prototype.hasOwnProperty.call(limitsPatch, "partsAbility") ) {
		nextLimits.partsAbility = sanitizeDroidLimitAbility(limitsPatch.partsAbility, PARTS_ABILITY_KEYS);
	}
	if ( Object.prototype.hasOwnProperty.call(limitsPatch, "protocolsAbility") ) {
		nextLimits.protocolsAbility = sanitizeDroidLimitAbility(limitsPatch.protocolsAbility, PROTOCOLS_ABILITY_KEYS);
	}
	const next = buildDroidStateForPersist(actor, { limits: nextLimits });
	await persistActorDroidCustomizationsState(actor, next);
	return next;
}

// ——— Validation ———

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {import("@league/foundry").documents.Item} item
 * @param {object} [ctx]
 * @param {boolean} [ctx.force]
 */
export function validateDroidCustomizationInstall(actor, item, ctx = {}) {
	const force = ctx.force === true;
	const blocking = [];
	const warnings = [];
	const state = normalizeActorDroidCustomizations(actor);
	const meta = getEffectiveDroidCustomizationItemMeta(item);

	const requiredTool = getDroidCustomizationRequiredTool(meta);
	const requiredToolActorKey = resolveDroidRequiredToolActorKey(requiredTool);
	const installDC = getDroidCustomizationCheckDc(meta);
	const motorCost = meta ? Math.max(1, Math.floor(Number(meta.motorSlotCost) || 1)) : 0;
	const installTimeHours = getCustomizationInstallTimeHours(actor);
	const requiredToolProficiency = requiredToolActorKey ? getActorToolProficiencyValue(actor, requiredToolActorKey) : null;
	const installRetryRemainingMs = getRemainingRetryWaitMs(state.workflowState?.lastInstallFailureAt, DROID_INSTALL_RETRY_WAIT_MS);

	const info = {
		requiredTool: requiredTool || null,
		requiredToolActorKey,
		requiredToolProficiency,
		checkDC: installDC,
		motorSlots: state.motorSlots,
		usedMotorSlots: state.derived.capacity.motorUsed,
		availableMotorSlots: state.derived.capacity.motorAvailable,
		partsAllowed: state.derived.capacity.partsAllowed,
		protocolsAllowed: state.derived.capacity.protocolsAllowed,
		partsCount: state.derived.counts.parts,
		protocolsCount: state.derived.counts.protocols,
		motorSlotCost: motorCost,
		procedureTimeHours: installTimeHours,
		partsPolicy: state.derived.capacity.partsPolicy,
		protocolsPolicy: state.derived.capacity.protocolsPolicy,
		retryWaitHours: installRetryRemainingMs ? formatRetryWaitHours(installRetryRemainingMs) : null
	};

	if ( !actor || !item ) {
		blocking.push(issue("missing-actor-or-item", "Actor and item are required."));
		return droidValidationResult({ blocking, warnings, info, force });
	}

	if ( !isActorValidDroidCustomizationTarget(actor) ) {
		blocking.push(issue("actor-not-droid-host", "Only droid-class species actors can receive droid customizations."));
		return droidValidationResult({ blocking, warnings, info, force });
	}

	if ( !meta || !isValidDroidCustomizationItemMeta(meta) ) {
		blocking.push(issue("invalid-customization-meta", `Item is not a valid droid customization. Add flags.sw5e.${ITEM_META_FLAG} or set Source Custom Label to "${DROID_CUSTOMIZATION_CUSTOM_LABEL}".`));
		return droidValidationResult({ blocking, warnings, info, force });
	}

	const targets = Array.isArray(meta.validTargetTypes) && meta.validTargetTypes.length
		? meta.validTargetTypes.map(String)
		: [...DEFAULT_DROID_CUSTOMIZATION_VALID_TARGET_TYPES];
	if ( !targets.includes("droid") ) {
		blocking.push(issue("invalid-target-types", "Droid customization item does not list droid as a valid target."));
	}

	if ( requiredToolActorKey && requiredToolProficiency !== null && requiredToolProficiency <= 0 ) {
		warnings.push(issue("required-tool-missing", "This actor is not proficient with astrotech's implements. An NPC can perform the installation if desired."));
	}
	else if ( requiredTool && !requiredToolActorKey ) {
		warnings.push(issue("required-tool-unmapped", `Could not map required tool "${requiredTool}" to an actor tool proficiency key.`));
	}

	if ( state.derived.capacity.motorAvailable < motorCost ) {
		blocking.push(issue("motor-slots-insufficient", "Not enough motor slots for this customization.", { need: motorCost, have: state.derived.capacity.motorAvailable }));
	}

	if ( meta.category === "part" && state.derived.counts.parts >= state.derived.capacity.partsAllowed ) {
		blocking.push(issue("parts-capacity", "Maximum Part customizations for this droid’s ability limit has been reached."));
	}
	if ( meta.category === "protocol" && state.derived.counts.protocols >= state.derived.capacity.protocolsAllowed ) {
		blocking.push(issue("protocols-capacity", "Maximum Protocol customizations for this droid’s ability limit has been reached."));
	}

	const uuid = typeof item.uuid === "string" ? item.uuid : "";
	if ( uuid && state.installed.some(e => e?.uuid === uuid) ) {
		blocking.push(issue("duplicate-customization-uuid", "That customization is already installed (same item UUID).", { uuid }));
	}

	if ( installRetryRemainingMs > 0 ) {
		blocking.push(issue("install-retry-wait", `A failed installation attempt was recorded recently. Wait ${formatRetryWaitHours(installRetryRemainingMs)} more hour(s) before trying again.`));
	}

	return droidValidationResult({ blocking, warnings, info, force });
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {string} installedUuid
 * @param {object} [ctx]
 */
export function validateDroidCustomizationRemove(actor, installedUuid, ctx = {}) {
	void ctx;
	const blocking = [];
	const warnings = [];
	const state = normalizeActorDroidCustomizations(actor);
	const id = String(installedUuid ?? "");
	const entry = state.installed.find(e => e?.uuid === id);
	const requiredTool = entry ? getDroidCustomizationRequiredTool(entry) : "astrotech";
	const requiredToolActorKey = resolveDroidRequiredToolActorKey(requiredTool);
	const requiredToolProficiency = requiredToolActorKey ? getActorToolProficiencyValue(actor, requiredToolActorKey) : null;
	const removeDC = entry ? getDroidCustomizationCheckDc(entry) : null;

	const info = {
		installedUuid: id,
		found: Boolean(entry),
		entryCategory: entry?.category ?? null,
		motorSlotCost: entry ? Math.max(1, Math.floor(Number(entry.motorSlotCost) || 1)) : null,
		requiredTool,
		requiredToolActorKey,
		requiredToolProficiency,
		checkDC: removeDC,
		procedureTimeHours: getCustomizationRemovalTimeHours(actor)
	};

	if ( !actor ) {
		blocking.push(issue("missing-actor", "Actor is required."));
		return { ok: false, blocking, warnings, info, force: false };
	}

	if ( !entry ) {
		blocking.push(issue("not-installed", "No installed customization matches that item UUID."));
	}
	else {
		if ( requiredToolActorKey && requiredToolProficiency !== null && requiredToolProficiency <= 0 ) {
			warnings.push(issue("required-tool-missing", "This actor is not proficient with astrotech's implements. An NPC can perform the removal if desired."));
		}
		else if ( requiredTool && !requiredToolActorKey ) {
			warnings.push(issue("required-tool-unmapped", `Could not map required tool "${requiredTool}" to an actor tool proficiency key.`));
		}
		if ( !isRecord(entry.snapshot) ) {
			warnings.push(issue("snapshot-missing", "Installed entry has no snapshot object; integrity may be degraded."));
		}
		if ( !entry.category ) {
			warnings.push(issue("category-missing", "Installed entry has no category."));
		}
	}

	return { ok: blocking.length === 0, blocking, warnings, info, force: false };
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {number} targetSlots
 * @param {object} [ctx]
 * @param {boolean} [ctx.force]
 */
export function validateDroidMotorUpgrade(actor, targetSlots, ctx = {}) {
	const force = ctx.force === true;
	const blocking = [];
	const warnings = [];
	const state = normalizeActorDroidCustomizations(actor);
	const current = state.motorSlots;
	const target = Math.floor(Number(targetSlots));

	const info = {
		currentMotorSlots: current,
		targetMotorSlots: target,
		usedMotorSlots: state.derived.capacity.motorUsed,
		upgradeCost: getMotorUpgradeCost(actor, target),
		upgradeTimeHours: getMotorUpgradeTimeHours(actor, target)
	};

	if ( !actor ) {
		blocking.push(issue("missing-actor", "Actor is required."));
		return droidValidationResult({ blocking, warnings, info, force });
	}

	if ( !isActorValidDroidCustomizationTarget(actor) ) {
		blocking.push(issue("actor-not-droid-host", "Only droid-class species actors can upgrade motor slots."));
		return droidValidationResult({ blocking, warnings, info, force });
	}

	if ( !Number.isFinite(target) || target <= current ) {
		blocking.push(issue("invalid-target-slots", "Target motor slots must be greater than current slots.", { current, target }));
	}

	if ( target > DROID_MAX_MOTOR_SLOTS ) {
		blocking.push(issue("target-above-max", `Motor slots cannot exceed ${DROID_MAX_MOTOR_SLOTS}.`, { target }));
	}

	if ( target < DROID_DEFAULT_MOTOR_SLOTS ) {
		blocking.push(issue("target-below-min", `Motor slots cannot be below ${DROID_DEFAULT_MOTOR_SLOTS}.`, { target }));
	}

	if ( !Object.prototype.hasOwnProperty.call(DROID_MOTOR_UPGRADE_COST_BY_TOTAL_SLOTS, target) ) {
		blocking.push(issue("unsupported-upgrade-tier", "That total motor slot count is not a supported upgrade step (use 3–6).", { target }));
	}

	if ( state.derived.capacity.motorUsed > target ) {
		blocking.push(issue("installed-exceeds-target", "Installed customizations use more motor slots than the target capacity.", {
			used: state.derived.capacity.motorUsed,
			target
		}));
	}

	if ( getMotorUpgradeCost(actor, target) == null && !blocking.some(b => b.code === "unsupported-upgrade-tier") ) {
		blocking.push(issue("upgrade-cost-unknown", "No defined credit cost for this upgrade."));
	}

	return droidValidationResult({ blocking, warnings, info, force });
}

// ——— Mutations ———

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {import("@league/foundry").documents.Item} item
 * @param {object} [ctx]
 * @param {boolean} [ctx.force]
 */
export async function addDroidCustomizationToActor(actor, item, ctx = {}) {
	const validation = validateDroidCustomizationInstall(actor, item, ctx);
	if ( !validation.ok ) return { ok: false, validation, entry: null };

	const state = normalizeActorDroidCustomizations(actor);
	const entry = createInstalledDroidCustomizationEntry(item, ctx.entryPartial ?? {});
	if ( !entry.uuid ) {
		const v2 = droidValidationResult({
			blocking: [issue("entry-uuid-missing", "Could not resolve item UUID for installed entry.")],
			warnings: validation.warnings,
			info: validation.info,
			force: false
		});
		return { ok: false, validation: v2, entry: null };
	}

	const nextInstalled = [...state.installed, entry];
	const next = buildDroidStateForPersist(actor, { installed: nextInstalled });
	await persistActorDroidCustomizationsState(actor, next);
	return { ok: true, validation, entry };
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {string} installedUuid
 * @param {object} [ctx]
 */
export async function removeDroidCustomizationFromActor(actor, installedUuid, ctx = {}) {
	const validation = validateDroidCustomizationRemove(actor, installedUuid, ctx);
	if ( !validation.ok ) return { ok: false, validation, removed: null };

	const state = normalizeActorDroidCustomizations(actor);
	const id = String(installedUuid ?? "");
	const entry = state.installed.find(e => e?.uuid === id);
	const nextInstalled = state.installed.filter(e => e?.uuid !== id);
	const next = buildDroidStateForPersist(actor, { installed: nextInstalled });
	await persistActorDroidCustomizationsState(actor, next);
	return { ok: true, validation, removed: entry };
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {number} targetSlots
 * @param {object} [ctx]
 * @param {boolean} [ctx.force]
 */
export async function upgradeDroidMotorSlots(actor, targetSlots, ctx = {}) {
	const validation = validateDroidMotorUpgrade(actor, targetSlots, ctx);
	if ( !validation.ok ) return { ok: false, validation };

	const next = buildDroidStateForPersist(actor, { motorSlots: Math.floor(Number(targetSlots)) });
	await persistActorDroidCustomizationsState(actor, next);
	return { ok: true, validation };
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {"install"|"remove"|"motor-upgrade"} kind
 * @param {number} [at]
 */
export async function recordDroidCustomizationFailure(actor, kind, at = Date.now()) {
	const state = normalizeActorDroidCustomizations(actor);
	const ts = Number(at) || Date.now();
	const patch = kind === "remove"
		? { lastRemoveFailureAt: ts }
		: kind === "motor-upgrade"
			? { lastMotorUpgradeFailureAt: ts }
			: { lastInstallFailureAt: ts };
	const workflowState = foundry.utils.mergeObject(state.workflowState, patch, { inplace: false });
	const next = buildDroidStateForPersist(actor, { workflowState });
	await persistActorDroidCustomizationsState(actor, next);
}

export const droidCustomizationsApi = {
	DROID_CUSTOMIZATION_CUSTOM_LABEL,
	SW5E_DROID_SPECIES_NAMES,
	DROID_CUSTOMIZATION_CATEGORIES,
	DROID_PARTS_ABILITY_KEYS,
	DROID_PROTOCOLS_ABILITY_KEYS,
	DROID_CUSTOMIZATION_RARITIES,
	DEFAULT_DROID_CUSTOMIZATION_VALID_TARGET_TYPES,
	ITEM_META_FLAG,
	BASE_DROID_CUSTOMIZATION_INSTALL_HOURS_MEDIUM,
	DROID_CUSTOMIZATION_SIZE_INSTALL_MULTIPLIER,
	DROID_DEFAULT_MOTOR_SLOTS,
	DROID_MAX_MOTOR_SLOTS,
	DROID_MOTOR_UPGRADE_COST_BY_TOTAL_SLOTS,
	DROID_CUSTOMIZATION_DC_BY_RARITY,
	getItemSourceCustom,
	getDroidCustomizationItemMeta,
	isDroidCustomizationSourceCustom,
	isDroidCustomizationItem,
	collectActorSpeciesNames,
	isActorDroidCustomizationHost,
	isActorDroidCustomizationsManagerAllowed,
	isActorValidDroidCustomizationTarget,
	getActorSizeKeyForDroidCustomization,
	getActorAbilityMod,
	getActorToolProficiencyValue,
	getDroidCustomizationSizeMultiplier,
	getCustomizationInstallTimeHours,
	getCustomizationRemovalTimeHours,
	getMotorUpgradeTimeHours,
	getMotorUpgradeCost,
	isValidDroidCustomizationItemMeta,
	inferDroidCustomizationRarityFromItem,
	normalizeDroidCustomizationItemMetaRecord,
	getEffectiveDroidCustomizationItemMeta,
	resolveDroidRequiredToolActorKey,
	getDroidCustomizationRequiredTool,
	getDroidCustomizationCheckDc,
	getAllowedDroidPartsDetail,
	getAllowedDroidPartsCount,
	getAllowedDroidProtocolsDetail,
	getAllowedDroidProtocolsCount,
	createDefaultDroidCustomizationsState,
	normalizeDroidCustomizationsState,
	normalizeActorDroidCustomizations,
	getMotorSlotsForActor,
	getUsedMotorSlots,
	getAvailableMotorSlots,
	isActorAtDroidCustomizationCapacity,
	isActorAtCustomizationCapacity: isActorAtDroidCustomizationCapacity,
	createInstalledDroidCustomizationEntry,
	updateDroidCustomizationLimitAbilities,
	validateDroidCustomizationInstall,
	validateDroidCustomizationRemove,
	validateDroidMotorUpgrade,
	addDroidCustomizationToActor,
	removeDroidCustomizationFromActor,
	upgradeDroidMotorSlots,
	recordDroidCustomizationFailure
};
