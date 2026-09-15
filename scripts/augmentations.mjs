/**
 * Actor-level cybernetic augmentations (`flags.sw5e.augmentations`) — data model, validation, mutations,
 * and derived vs effective side-effect resolution (Phase 1 + 1.5 overrides).
 * Body-mod **UI routing** (cybernetic vs droid customization host) is species-only; see {@link isActorEligibleForCyberneticAugmentationsUI}.
 */

import { isActorDroidCustomizationHost, isDroidCustomizationItem } from "./droid-customizations.mjs";
import { getItemSystemRarityKey } from "./item-system-rarity.mjs";

// ——— Types / constants ———

/** @typedef {"enhancement"|"replacement"} AugmentationCategory */
/** @typedef {"standard"|"premium"|"prototype"|"advanced"|"legendary"|"artifact"} AugmentationRarity */
/** @typedef {"native"|"legacy"|"world"} AugmentationSourceType */

export const AUGMENTATION_CATEGORIES = /** @type {const} */ ([
	"enhancement",
	"replacement"
]);

export const AUGMENTATION_RARITIES = /** @type {const} */ ([
	"standard",
	"premium",
	"prototype",
	"advanced",
	"legendary",
	"artifact"
]);

/** Default SW5e rule: beasts and humanoids accept cybernetics unless an item overrides via `validTargetTypes`. */
export const DEFAULT_VALID_AUGMENTATION_CREATURE_TYPES = /** @type {const} */ ([
	"humanoid",
	"beast"
]);

/**
 * Named body slots for replacements (extensible; unknown strings are still allowed with a soft warning).
 * @type {readonly string[]}
 */
export const CANONICAL_AUGMENTATION_BODY_SLOTS = Object.freeze([
	"arm-left",
	"arm-right",
	"leg-left",
	"leg-right",
	"eye-left",
	"eye-right",
	"organ",
	"torso",
	"head",
	"hand-left",
	"hand-right",
	"foot-left",
	"foot-right"
]);

const CANONICAL_BODY_SLOT_SET = new Set(CANONICAL_AUGMENTATION_BODY_SLOTS);

/** Base install duration for a Medium creature (hours). */
export const BASE_CYBERNETIC_INSTALL_HOURS_MEDIUM = 8;

/** dnd5e `system.traits.size` keys → install time multiplier. */
export const AUGMENTATION_SIZE_INSTALL_MULTIPLIER = Object.freeze({
	tiny: 0.25,
	sm: 0.5,
	med: 1,
	lg: 2,
	huge: 5,
	grg: 10
});

const ITEM_SYSTEM_RARITY_TO_AUGMENTATION = Object.freeze({
	"": "standard",
	common: "standard",
	uncommon: "premium",
	rare: "prototype",
	veryRare: "advanced",
	legendary: "legendary",
	artifact: "artifact"
});

const FLAG_ROOT = "flags.sw5e.augmentations";
const ITEM_META_FLAG = "augmentation";

/**
 * dnd5e `system.source.custom` value that routes an item into the augmentations workflow
 * (picker + install) when native `flags.sw5e.augmentation` is absent.
 */
export const CYBERNETIC_AUGMENTATION_CUSTOM_LABEL = "Cybernetic Augmentation";

/** @type {readonly ["ionSaveDisadvantage","ionVulnerability","countAsDroid"]} */
export const AUGMENTATION_SIDE_EFFECT_KEYS = /** @type {const} */ ([
	"ionSaveDisadvantage",
	"ionVulnerability",
	"countAsDroid"
]);

function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Plain excerpt from dnd5e item description HTML (client DOM). Used for snapshot snippets and UI previews.
 * @param {string} html
 * @param {number} [maxLen]
 */
export function plainTextExcerptFromItemDescriptionHtml(html, maxLen = 400) {
	if ( typeof html !== "string" || !html ) return "";
	if ( typeof document === "undefined" ) return "";
	const div = document.createElement("div");
	div.innerHTML = html;
	let t = (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
	if ( !t ) return "";
	if ( t.length <= maxLen ) return t;
	return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

function issue(code, message, data) {
	return data ? { code, message, data } : { code, message };
}

/**
 * @param {object} param0
 * @param {ReturnType<typeof issue>[]} param0.blocking
 * @param {ReturnType<typeof issue>[]} param0.warnings
 * @param {object} param0.info
 * @param {boolean} [param0.force]
 */
function augmentationValidationResult({ blocking, warnings, info, force = false }) {
	const hasBlocking = blocking.length > 0;
	const forceAllowed = force === true && game.user?.isGM === true;
	const ok = !hasBlocking || forceAllowed;
	return { ok, blocking, warnings, info, force: forceAllowed };
}

// ——— Side effects (RAW thresholds) ———

/**
 * @param {number} installedCount
 */
export function deriveAugmentationSideEffects(installedCount) {
	const n = Math.max(0, Math.floor(Number(installedCount) || 0));
	return {
		ionSaveDisadvantage: n >= 2,
		ionVulnerability: n >= 4,
		countAsDroid: n >= 6
	};
}

// ——— Default actor flag shape ———

export function createDefaultSideEffectOverrides() {
	return {
		ionSaveDisadvantage: null,
		ionVulnerability: null,
		countAsDroid: null
	};
}

export function createDefaultAugmentationsState() {
	const derivedSide = deriveAugmentationSideEffects(0);
	const overrideSide = createDefaultSideEffectOverrides();
	return {
		installed: [],
		limits: {
			maxAugmentations: null
		},
		derived: {
			sideEffects: { ...derivedSide }
		},
		overrides: {
			sideEffects: { ...overrideSide }
		},
		effective: {
			sideEffects: resolveEffectiveAugmentationSideEffects(derivedSide, overrideSide)
		},
		workflowState: {
			lastInstallFailureAt: null,
			lastRemoveFailureAt: null
		}
	};
}

/**
 * @param {unknown} value
 * @returns {boolean|null}
 */
function coerceSideEffectOverrideValue(value) {
	if ( value === true || value === false || value === null ) return value;
	return null;
}

/**
 * Parse persisted `overrides.sideEffects`; unknown keys ignored, invalid values treated as null (inherit derived).
 * @param {unknown} raw
 */
export function parseAugmentationSideEffectOverrides(raw) {
	const defaults = createDefaultSideEffectOverrides();
	if ( !isRecord(raw) ) return { ...defaults };
	const out = { ...defaults };
	for ( const key of AUGMENTATION_SIDE_EFFECT_KEYS ) {
		if ( Object.prototype.hasOwnProperty.call(raw, key) ) out[key] = coerceSideEffectOverrideValue(raw[key]);
	}
	return out;
}

/**
 * RAW threshold output vs per-actor GM/homebrew overrides (`null` = use derived).
 * @param {ReturnType<typeof deriveAugmentationSideEffects>} derived
 * @param {ReturnType<typeof parseAugmentationSideEffectOverrides>} overrides
 */
export function resolveEffectiveAugmentationSideEffects(derived, overrides) {
	const o = { ...createDefaultSideEffectOverrides(), ...overrides };
	const d = derived ?? deriveAugmentationSideEffects(0);
	return {
		ionSaveDisadvantage: o.ionSaveDisadvantage === null ? Boolean(d.ionSaveDisadvantage) : o.ionSaveDisadvantage,
		ionVulnerability: o.ionVulnerability === null ? Boolean(d.ionVulnerability) : o.ionVulnerability,
		countAsDroid: o.countAsDroid === null ? Boolean(d.countAsDroid) : o.countAsDroid
	};
}

/**
 * Normalize the `flags.sw5e.augmentations` object (plain data). Merges optional `partial` overlay for authoring/tests.
 * @param {object} [raw]
 * @param {object|null} [partial]
 */
export function normalizeAugmentationsState(raw = {}, partial = null) {
	const defaults = createDefaultAugmentationsState();
	const base = isRecord(raw) ? foundry.utils.deepClone(raw) : {};
	if ( isRecord(partial) ) foundry.utils.mergeObject(base, partial, { inplace: true });

	const installed = Array.isArray(base.installed)
		? base.installed.filter(isRecord).map(e => foundry.utils.deepClone(e))
		: [];

	const limits = isRecord(base.limits)
		? foundry.utils.mergeObject(foundry.utils.deepClone(defaults.limits), base.limits, { inplace: false })
		: foundry.utils.deepClone(defaults.limits);

	const workflowState = isRecord(base.workflowState)
		? foundry.utils.mergeObject(foundry.utils.deepClone(defaults.workflowState), base.workflowState, { inplace: false })
		: foundry.utils.deepClone(defaults.workflowState);

	const overrideSideEffects = parseAugmentationSideEffectOverrides(base.overrides?.sideEffects);
	const overrides = {
		sideEffects: overrideSideEffects
	};

	const extraDerived = isRecord(base.derived) ? foundry.utils.deepClone(base.derived) : {};
	delete extraDerived.sideEffects;

	const count = installed.length;
	const derivedSideEffects = deriveAugmentationSideEffects(count);
	const effectiveSideEffects = resolveEffectiveAugmentationSideEffects(derivedSideEffects, overrideSideEffects);

	return {
		installed,
		limits,
		overrides,
		derived: {
			...extraDerived,
			sideEffects: derivedSideEffects
		},
		effective: {
			sideEffects: effectiveSideEffects
		},
		workflowState
	};
}

/**
 * Normalize augmentations for an actor (or merge `partial` onto current flag before normalizing).
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {object|null} [partial]
 */
export function normalizeActorAugmentations(actor, partial = null) {
	const raw = actor?.flags?.sw5e?.augmentations;
	return normalizeAugmentationsState(isRecord(raw) ? raw : {}, partial);
}

/**
 * Final side effects after applying actor overrides (`flags.sw5e.augmentations.overrides.sideEffects`).
 * Accepts a live actor or a plain flag object / already-normalized state from {@link normalizeAugmentationsState}.
 * @param {import("@league/foundry").documents.Actor|object} actorOrState
 */
export function getEffectiveAugmentationSideEffects(actorOrState) {
	if ( isRecord(actorOrState) && !actorOrState.flags?.sw5e && Array.isArray(actorOrState.installed) ) {
		return { ...normalizeAugmentationsState(actorOrState).effective.sideEffects };
	}
	const state = normalizeActorAugmentations(/** @type {*} */ (actorOrState));
	return { ...state.effective.sideEffects };
}

// ——— Item metadata (`flags.sw5e.augmentation`) ———

/**
 * Raw augmentation item metadata on the item document.
 * @param {import("@league/foundry").documents.Item} item
 * @returns {object|null}
 */
export function getAugmentationItemMeta(item) {
	const m = item?.flags?.sw5e?.[ITEM_META_FLAG];
	return isRecord(m) ? m : null;
}

/**
 * dnd5e item source “Custom Label” (`system.source.custom`), trimmed.
 * @param {object} item
 * @returns {string}
 */
export function getItemSourceCustom(item) {
	const c = item?.system?.source?.custom;
	return typeof c === "string" ? c.trim() : "";
}

/**
 * @param {object} item
 */
export function isCyberneticAugmentationSourceCustom(item) {
	return getItemSourceCustom(item) === CYBERNETIC_AUGMENTATION_CUSTOM_LABEL;
}

/**
 * Infer enhancement vs replacement for Custom Label–routed items using legacy importer uid or description heading.
 * @param {object} item
 * @returns {AugmentationCategory}
 */
function inferAugmentationCategoryForSourceRoutedItem(item) {
	const uid = item?.flags?.["sw5e-importer"]?.uid;
	if ( typeof uid === "string" ) {
		if ( uid.includes("subtype-replacement") ) return /** @type {AugmentationCategory} */ ("replacement");
		if ( uid.includes("subtype-enhancement") ) return /** @type {AugmentationCategory} */ ("enhancement");
	}
	const html = item?.system?.description?.value;
	if ( typeof html === "string" ) {
		if ( /Cybernetic Augmentation \(Replacement\)/i.test(html) ) return /** @type {AugmentationCategory} */ ("replacement");
		if ( /Cybernetic Augmentation \(Enhancement\)/i.test(html) ) return /** @type {AugmentationCategory} */ ("enhancement");
	}
	return /** @type {AugmentationCategory} */ ("enhancement");
}

/**
 * Native `flags.sw5e.augmentation` when valid; otherwise minimal metadata when `system.source.custom` is
 * {@link CYBERNETIC_AUGMENTATION_CUSTOM_LABEL} so routing works without Configure Sheet subtype.
 * @param {object} item
 * @returns {object|null}
 */
export function getEffectiveAugmentationItemMeta(item) {
	if ( isDroidCustomizationItem(item) ) return null;
	const native = getAugmentationItemMeta(item);
	if ( isValidAugmentationItemMeta(native) ) return native;
	if ( !isCyberneticAugmentationSourceCustom(item) ) return null;
	return {
		category: inferAugmentationCategoryForSourceRoutedItem(item),
		rarity: inferAugmentationRarityFromItem(item),
		slotless: true,
		bodySlots: []
	};
}

/**
 * @param {object|null|undefined} meta
 * @returns {meta is object}
 */
export function isValidAugmentationItemMeta(meta) {
	if ( !isRecord(meta) ) return false;
	if ( !AUGMENTATION_CATEGORIES.includes(meta.category) ) return false;
	if ( meta.rarity != null && !AUGMENTATION_RARITIES.includes(meta.rarity) ) return false;
	if ( meta.validTargetTypes != null && !Array.isArray(meta.validTargetTypes) ) return false;
	if ( meta.bodySlots != null && !Array.isArray(meta.bodySlots) ) return false;
	return true;
}

function inferAugmentationSourceType(item) {
	if ( getAugmentationItemMeta(item) ) return /** @type {AugmentationSourceType} */ ("native");
	if ( isRecord(item?.flags?.["sw5e-importer"]) ) return /** @type {AugmentationSourceType} */ ("legacy");
	return /** @type {AugmentationSourceType} */ ("world");
}

function getItemDndTypeKey(item) {
	return item?.type?.split?.(".").at(-1) ?? item?.type ?? "";
}

/**
 * Map dnd5e item `system.rarity` to augmentation rarity tier.
 * @param {import("@league/foundry").documents.Item} item
 * @returns {AugmentationRarity}
 */
export function inferAugmentationRarityFromItem(item) {
	const normalized = getItemSystemRarityKey(item);
	const mapped = ITEM_SYSTEM_RARITY_TO_AUGMENTATION[normalized];
	if ( mapped ) return /** @type {AugmentationRarity} */ (mapped);
	if ( AUGMENTATION_RARITIES.includes(normalized) ) return /** @type {AugmentationRarity} */ (normalized);
	return /** @type {AugmentationRarity} */ ("standard");
}

// ——— Actor: creature type, size, proficiency ———

/**
 * dnd5e 5.2.x creature type key from {@link CreatureTypeField} (`system.details.type.value`).
 * @param {import("@league/foundry").documents.Actor} actor
 * @returns {string}
 */
export function getActorCreatureTypeKey(actor) {
	const typeData = actor?.system?.details?.type;
	if ( !typeData ) return "";
	if ( typeof typeData === "string" ) return typeData;
	return typeData.value ?? "";
}

/**
 * dnd5e actor size key (`system.traits.size`): tiny, sm, med, lg, huge, grg.
 * @param {import("@league/foundry").documents.Actor} actor
 * @returns {string}
 */
export function getActorSizeKey(actor) {
	const size = actor?.system?.traits?.size;
	return typeof size === "string" && size ? size : "med";
}

/**
 * Core proficiency bonus used for augmentation capacity (dnd5e prepares `system.attributes.prof` as a number for PC/NPC).
 * @param {import("@league/foundry").documents.Actor} actor
 * @returns {number}
 */
export function getActorProficiencyBonus(actor) {
	const prof = actor?.system?.attributes?.prof;
	if ( prof == null ) return 0;
	if ( typeof prof === "number" && Number.isFinite(prof) ) return Math.max(0, prof);
	if ( isRecord(prof) && Number.isFinite(prof.flat) ) return Math.max(0, prof.flat);
	return 0;
}

export function isLegacyStarshipActor(actor) {
	return actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

/**
 * Characters and NPCs that are not starships/vehicles may use the augmentation system.
 * @param {import("@league/foundry").documents.Actor} actor
 */
export function isActorAugmentationCandidate(actor) {
	if ( !actor ) return false;
	if ( isLegacyStarshipActor(actor) ) return false;
	if ( actor.type === "vehicle" ) return false;
	return actor.type === "character" || actor.type === "npc";
}

/**
 * Character/NPC actors that may use the cybernetic augmentations sheet/manager (excludes SW5E droid-class species).
 * Does not exclude legacy starships — use {@link isActorCyberneticAugmentationsManagerAllowed} for the full gate.
 * @param {import("@league/foundry").documents.Actor} actor
 */
export function isActorEligibleForCyberneticAugmentationsUI(actor) {
	return isActorAugmentationCandidate(actor) && !isActorDroidCustomizationHost(actor);
}

/**
 * Whether the augmentations manager / inline sheet should be available (candidate, not a starship, not a droid species host).
 * @param {import("@league/foundry").documents.Actor} actor
 */
export function isActorCyberneticAugmentationsManagerAllowed(actor) {
	return isActorEligibleForCyberneticAugmentationsUI(actor) && !isLegacyStarshipActor(actor);
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {string[]} [validTypes]
 */
export function isActorValidAugmentationTarget(actor, validTypes = DEFAULT_VALID_AUGMENTATION_CREATURE_TYPES) {
	if ( !isActorAugmentationCandidate(actor) ) return false;
	if ( isActorDroidCustomizationHost(actor) ) return false;
	const t = getActorCreatureTypeKey(actor);
	if ( !t || t === "custom" ) return false;
	return validTypes.includes(t);
}

// ——— Capacity ———

/**
 * Max installs: explicit `limits.maxAugmentations` if set, else proficiency bonus.
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {ReturnType<typeof normalizeActorAugmentations>} [state]
 */
export function getMaxAugmentationsForActor(actor, state = null) {
	const s = state ?? normalizeActorAugmentations(actor);
	const override = s.limits?.maxAugmentations;
	if ( override != null && Number.isFinite(Number(override)) ) return Math.max(0, Math.floor(Number(override)));
	return getActorProficiencyBonus(actor);
}

export function getInstalledAugmentationCount(actor, state = null) {
	const s = state ?? normalizeActorAugmentations(actor);
	return Array.isArray(s.installed) ? s.installed.length : 0;
}

export function isActorAtAugmentationCapacity(actor, state = null) {
	const s = state ?? normalizeActorAugmentations(actor);
	return getInstalledAugmentationCount(actor, s) >= getMaxAugmentationsForActor(actor, s);
}

// ——— Body slots ———

/**
 * @param {Iterable<object>} installedEntries
 * @returns {Set<string>}
 */
export function collectOccupiedBodySlots(installedEntries) {
	const out = new Set();
	for ( const e of installedEntries ) {
		if ( !isRecord(e) || !Array.isArray(e.bodySlots) ) continue;
		for ( const s of e.bodySlots ) {
			if ( s ) out.add(String(s));
		}
	}
	return out;
}

function findBodySlotConflicts(proposedSlots, occupied) {
	const conflicts = [];
	for ( const s of proposedSlots ) {
		const k = String(s);
		if ( occupied.has(k) ) conflicts.push(k);
	}
	return conflicts;
}

function augmentationMetaBodySlots(meta) {
	if ( !meta || !Array.isArray(meta.bodySlots) ) return [];
	return meta.bodySlots.map(s => String(s)).filter(Boolean);
}

function entryBodySlots(entry) {
	if ( !entry || !Array.isArray(entry.bodySlots) ) return [];
	return entry.bodySlots.map(s => String(s)).filter(Boolean);
}

// ——— Install / removal duration ———

export function getAugmentationInstallTimeHours(actor) {
	const size = getActorSizeKey(actor);
	const mult = AUGMENTATION_SIZE_INSTALL_MULTIPLIER[size] ?? 1;
	return BASE_CYBERNETIC_INSTALL_HOURS_MEDIUM * mult;
}

export function getAugmentationRemovalTimeHours(actor) {
	return getAugmentationInstallTimeHours(actor) / 2;
}

// ——— Installed entry factory ———

/**
 * @param {import("@league/foundry").documents.Item} item
 * @param {object} [partial]
 */
export function createInstalledAugmentationEntry(item, partial = {}) {
	const meta = getEffectiveAugmentationItemMeta(item);
	const category = partial.category ?? meta?.category;
	const rarity = partial.rarity ?? meta?.rarity ?? inferAugmentationRarityFromItem(item);
	const bodySlots = partial.bodySlots ?? augmentationMetaBodySlots(meta);
	const slotless = partial.slotless ?? Boolean(meta?.slotless);
	const typeKey = getItemDndTypeKey(item);
	const rawRarity = item?.system?.rarity;
	const raritySnapshot = typeof rawRarity === "object" && rawRarity !== null
		? foundry.utils.deepClone(rawRarity)
		: (rawRarity ?? "");

	const snapshotFlags = {};
	if ( isRecord(item?.flags?.sw5e) ) {
		const aug = item.flags.sw5e[ITEM_META_FLAG];
		if ( isRecord(aug) ) snapshotFlags.sw5e = { [ITEM_META_FLAG]: foundry.utils.deepClone(aug) };
	}

	const descriptionSnippet = plainTextExcerptFromItemDescriptionHtml(item?.system?.description?.value ?? "", 400);

	return {
		uuid: partial.uuid ?? item?.uuid ?? "",
		name: partial.name ?? item?.name ?? "",
		category,
		rarity,
		installedAt: partial.installedAt ?? Date.now(),
		bodySlots: Array.isArray(partial.bodySlots) ? [...partial.bodySlots] : [...bodySlots],
		slotless: partial.slotless !== undefined ? Boolean(partial.slotless) : slotless,
		snapshot: {
			name: partial.snapshot?.name ?? item?.name ?? "",
			type: partial.snapshot?.type ?? typeKey,
			img: partial.snapshot?.img ?? item?.img ?? "",
			rarity: partial.snapshot?.rarity ?? raritySnapshot,
			flags: partial.snapshot?.flags ?? (Object.keys(snapshotFlags).length ? snapshotFlags : {}),
			...(descriptionSnippet ? { descriptionSnippet } : {})
		},
		sourceType: partial.sourceType ?? inferAugmentationSourceType(item)
	};
}

// ——— Validation ———

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {import("@league/foundry").documents.Item} item
 * @param {object} [ctx]
 * @param {boolean} [ctx.force] If true, result is `ok` despite blocking issues (GM override).
 */
export function validateAugmentationInstall(actor, item, ctx = {}) {
	const force = ctx.force === true;
	const blocking = [];
	const warnings = [];
	const state = normalizeActorAugmentations(actor);
	const meta = getEffectiveAugmentationItemMeta(item);

	const actorTargetType = getActorCreatureTypeKey(actor);
	const validTargetTypes = Array.isArray(meta?.validTargetTypes) && meta.validTargetTypes.length
		? meta.validTargetTypes.map(String)
		: [...DEFAULT_VALID_AUGMENTATION_CREATURE_TYPES];

	const maxAugmentations = getMaxAugmentationsForActor(actor, state);
	const currentAugmentations = getInstalledAugmentationCount(actor, state);
	const requiredTool = meta?.requiredTool != null ? String(meta.requiredTool) : "";
	const installDC = meta?.installDC != null && Number.isFinite(Number(meta.installDC))
		? Number(meta.installDC)
		: null;

	const occupiedBodySlots = collectOccupiedBodySlots(state.installed);
	const proposedSlots = augmentationMetaBodySlots(meta);
	const slotless = Boolean(meta?.slotless);
	const category = meta?.category;

	const info = {
		actorTargetType,
		validTargetTypes,
		maxAugmentations,
		currentAugmentations,
		requiredTool: requiredTool || null,
		installDC,
		occupiedBodySlots: [...occupiedBodySlots].sort(),
		proposedBodySlots: proposedSlots,
		category: category ?? null,
		slotless
	};

	if ( !actor || !item ) {
		blocking.push(issue("missing-actor-or-item", "Actor and item are required."));
		return augmentationValidationResult({ blocking, warnings, info, force });
	}

	if ( isActorDroidCustomizationHost(actor) ) {
		blocking.push(issue("droid-species-body-mod-routing", "Droid species use the Droid Customizations workflow, not cybernetic augmentations."));
		return augmentationValidationResult({ blocking, warnings, info, force });
	}

	if ( !isActorAugmentationCandidate(actor) ) {
		blocking.push(issue("actor-not-supported", "This actor type cannot receive cybernetic augmentations.", { actorType: actor.type }));
	}

	if ( !isValidAugmentationItemMeta(meta) ) {
		blocking.push(issue("invalid-augmentation-meta", `Item is not a valid cybernetic augmentation. Add flags.sw5e.${ITEM_META_FLAG} or set Source Custom Label to "${CYBERNETIC_AUGMENTATION_CUSTOM_LABEL}".`, { flag: `flags.sw5e.${ITEM_META_FLAG}` }));
	}

	if ( isValidAugmentationItemMeta(meta) && !isActorValidAugmentationTarget(actor, validTargetTypes) ) {
		blocking.push(issue("creature-type-ineligible", "Creature type is not a valid augmentation target for this item.", {
			actorTargetType,
			validTargetTypes
		}));
	}

	if ( isValidAugmentationItemMeta(meta) && currentAugmentations >= maxAugmentations ) {
		blocking.push(issue("at-capacity", "Actor is at maximum cybernetic augmentations.", { currentAugmentations, maxAugmentations }));
	}

	if ( isValidAugmentationItemMeta(meta) && item.uuid ) {
		const dup = state.installed.some(e => e?.uuid === item.uuid);
		if ( dup ) blocking.push(issue("duplicate-augmentation-uuid", "This augmentation is already installed (same item UUID).", { uuid: item.uuid }));
	}

	if ( isValidAugmentationItemMeta(meta) ) {
		if ( category === "replacement" && !slotless && proposedSlots.length === 0 ) {
			blocking.push(issue("replacement-needs-body-slots", "Replacement augmentations must declare at least one body slot unless marked slotless."));
		}
		if ( category === "enhancement" && slotless && proposedSlots.length > 0 ) {
			warnings.push(issue("slotless-body-slots", "Slotless enhancement lists body slots; occupancy rules still apply if slots are present."));
		}
		if ( meta.requiredTool !== undefined && meta.requiredTool !== null && String(meta.requiredTool).trim() === "" ) {
			warnings.push(issue("required-tool-empty", "`requiredTool` is present but empty; set a tool id (e.g. biotech) or omit the field."));
		}
		for ( const s of proposedSlots ) {
			if ( !CANONICAL_BODY_SLOT_SET.has(s) ) {
				warnings.push(issue("non-canonical-body-slot", `Body slot "${s}" is not in the canonical list (still allowed).`, { slot: s }));
			}
		}
		if ( proposedSlots.length > 0 ) {
			const conflicts = findBodySlotConflicts(proposedSlots, occupiedBodySlots);
			if ( conflicts.length ) {
				blocking.push(issue("body-slot-conflict", "One or more body slots are already occupied.", { conflicts }));
			}
		}
	}

	return augmentationValidationResult({ blocking, warnings, info, force });
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {string} installedUuid `uuid` on the installed entry (source item UUID)
 * @param {object} [ctx]
 */
export function validateAugmentationRemove(actor, installedUuid, ctx = {}) {
	const blocking = [];
	const warnings = [];
	const state = normalizeActorAugmentations(actor);
	const id = String(installedUuid ?? "");
	const entry = state.installed.find(e => e?.uuid === id);

	const info = {
		installedUuid: id,
		found: Boolean(entry),
		entryCategory: entry?.category ?? null,
		entryBodySlots: entry ? entryBodySlots(entry) : [],
		slotless: entry ? Boolean(entry.slotless) : null
	};

	if ( !actor ) {
		blocking.push(issue("missing-actor", "Actor is required."));
		return { ok: false, blocking, warnings, info, force: false };
	}

	if ( !entry ) {
		blocking.push(issue("not-installed", "No installed augmentation matches that item UUID."));
	} else {
		if ( !isRecord(entry.snapshot) ) {
			warnings.push(issue("snapshot-missing", "Installed entry has no snapshot object; integrity may be degraded."));
		}
		if ( !entry.category ) {
			warnings.push(issue("category-missing", "Installed entry has no category."));
		}
	}

	return { ok: blocking.length === 0, blocking, warnings, info, force: false };
}

// ——— Mutations ———

function buildAugmentationsStateForPersist(actor, nextInstalled, workflowPatch = null) {
	const base = normalizeActorAugmentations(actor);
	const count = nextInstalled.length;
	const workflowState = workflowPatch
		? foundry.utils.mergeObject(foundry.utils.deepClone(base.workflowState), workflowPatch, { inplace: false })
		: base.workflowState;
	const derivedSideEffects = deriveAugmentationSideEffects(count);
	const effectiveSideEffects = resolveEffectiveAugmentationSideEffects(derivedSideEffects, base.overrides.sideEffects);
	return {
		installed: nextInstalled,
		limits: base.limits,
		overrides: base.overrides,
		derived: {
			...base.derived,
			sideEffects: derivedSideEffects
		},
		effective: {
			sideEffects: effectiveSideEffects
		},
		workflowState
	};
}

/**
 * @param {string} key
 */
function assertAugmentationSideEffectKey(key) {
	if ( !AUGMENTATION_SIDE_EFFECT_KEYS.includes(key) ) {
		throw new Error(`Invalid augmentation side effect key "${key}". Expected one of: ${AUGMENTATION_SIDE_EFFECT_KEYS.join(", ")}.`);
	}
}

/**
 * Persist `flags.sw5e.augmentations` without {@link Actor#setFlag}(`"sw5e"`, …): that scope is not registered; the module id is `sw5e-module`.
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {object} augmentationsData Plain state passed through {@link normalizeAugmentationsState}.
 */
async function persistActorAugmentationsState(actor, augmentationsData) {
	const payload = normalizeAugmentationsState(augmentationsData);
	await actor.update({ "flags.sw5e.augmentations": payload });
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {typeof AUGMENTATION_SIDE_EFFECT_KEYS[number]} key
 * @param {boolean|null} value
 */
export async function setAugmentationSideEffectOverride(actor, key, value) {
	assertAugmentationSideEffectKey(key);
	if ( value !== true && value !== false && value !== null ) {
		throw new Error("Augmentation side effect override must be true, false, or null.");
	}
	const state = normalizeActorAugmentations(actor);
	const merged = {
		installed: state.installed,
		limits: state.limits,
		workflowState: state.workflowState,
		derived: foundry.utils.deepClone(state.derived),
		overrides: {
			sideEffects: { ...state.overrides.sideEffects, [key]: value }
		}
	};
	await persistActorAugmentationsState(actor, merged);
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {typeof AUGMENTATION_SIDE_EFFECT_KEYS[number]} key
 */
export async function clearAugmentationSideEffectOverride(actor, key) {
	return setAugmentationSideEffectOverride(actor, key, null);
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {Partial<Record<typeof AUGMENTATION_SIDE_EFFECT_KEYS[number], boolean|null>>} partialOverrides
 */
export async function updateAugmentationSideEffectOverrides(actor, partialOverrides) {
	if ( !isRecord(partialOverrides) ) {
		throw new Error("partialOverrides must be an object.");
	}
	const state = normalizeActorAugmentations(actor);
	const next = { ...state.overrides.sideEffects };
	for ( const [k, v] of Object.entries(partialOverrides) ) {
		assertAugmentationSideEffectKey(k);
		if ( v !== true && v !== false && v !== null ) {
			throw new Error(`Override for "${k}" must be true, false, or null.`);
		}
		next[k] = v;
	}
	const merged = {
		installed: state.installed,
		limits: state.limits,
		workflowState: state.workflowState,
		derived: foundry.utils.deepClone(state.derived),
		overrides: { sideEffects: next }
	};
	await persistActorAugmentationsState(actor, merged);
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {import("@league/foundry").documents.Item} item
 * @param {object} [ctx]
 * @param {boolean} [ctx.force]
 */
export async function addAugmentationToActor(actor, item, ctx = {}) {
	const validation = validateAugmentationInstall(actor, item, ctx);
	if ( !validation.ok ) return { ok: false, validation, entry: null };

	const state = normalizeActorAugmentations(actor);
	const entry = createInstalledAugmentationEntry(item, ctx.entryPartial ?? {});
	if ( !entry.uuid ) {
		const v2 = augmentationValidationResult({
			blocking: [issue("entry-uuid-missing", "Could not resolve item UUID for installed entry.")],
			warnings: validation.warnings,
			info: validation.info,
			force: false
		});
		return { ok: false, validation: v2, entry: null };
	}

	const nextInstalled = [...state.installed, entry];
	const nextState = buildAugmentationsStateForPersist(actor, nextInstalled);
	await persistActorAugmentationsState(actor, nextState);
	return { ok: true, validation, entry };
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {string} installedUuid
 * @param {object} [ctx]
 */
export async function removeAugmentationFromActor(actor, installedUuid, ctx = {}) {
	const validation = validateAugmentationRemove(actor, installedUuid, ctx);
	if ( !validation.ok ) return { ok: false, validation, removed: null };

	const state = normalizeActorAugmentations(actor);
	const id = String(installedUuid ?? "");
	const entry = state.installed.find(e => e?.uuid === id);
	const nextInstalled = state.installed.filter(e => e?.uuid !== id);
	const nextState = buildAugmentationsStateForPersist(actor, nextInstalled);
	await persistActorAugmentationsState(actor, nextState);
	return { ok: true, validation, removed: entry };
}

/**
 * Update workflow timestamps after a failed operation (optional UI hook).
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {"install"|"remove"} kind
 * @param {number} [at]
 */
export async function recordAugmentationFailure(actor, kind, at = Date.now()) {
	const state = normalizeActorAugmentations(actor);
	const ts = Number(at) || Date.now();
	const patch = kind === "remove"
		? { lastRemoveFailureAt: ts }
		: { lastInstallFailureAt: ts };
	const workflowState = foundry.utils.mergeObject(state.workflowState, patch, { inplace: false });
	await persistActorAugmentationsState(actor, {
		...state,
		workflowState
	});
}

// ——— Public bundle ———

export const augmentationsApi = {
	AUGMENTATION_CATEGORIES,
	AUGMENTATION_RARITIES,
	AUGMENTATION_SIDE_EFFECT_KEYS,
	DEFAULT_VALID_AUGMENTATION_CREATURE_TYPES,
	CANONICAL_AUGMENTATION_BODY_SLOTS,
	BASE_CYBERNETIC_INSTALL_HOURS_MEDIUM,
	AUGMENTATION_SIZE_INSTALL_MULTIPLIER,
	createDefaultSideEffectOverrides,
	createDefaultAugmentationsState,
	normalizeAugmentationsState,
	normalizeActorAugmentations,
	parseAugmentationSideEffectOverrides,
	resolveEffectiveAugmentationSideEffects,
	getEffectiveAugmentationSideEffects,
	setAugmentationSideEffectOverride,
	clearAugmentationSideEffectOverride,
	updateAugmentationSideEffectOverrides,
	getAugmentationItemMeta,
	plainTextExcerptFromItemDescriptionHtml,
	CYBERNETIC_AUGMENTATION_CUSTOM_LABEL,
	getItemSourceCustom,
	isCyberneticAugmentationSourceCustom,
	getEffectiveAugmentationItemMeta,
	isValidAugmentationItemMeta,
	inferAugmentationRarityFromItem,
	getActorCreatureTypeKey,
	getActorSizeKey,
	getActorProficiencyBonus,
	isLegacyStarshipActor,
	isActorAugmentationCandidate,
	isActorEligibleForCyberneticAugmentationsUI,
	isActorCyberneticAugmentationsManagerAllowed,
	isActorDroidCustomizationHost,
	isActorValidAugmentationTarget,
	getMaxAugmentationsForActor,
	getInstalledAugmentationCount,
	isActorAtAugmentationCapacity,
	collectOccupiedBodySlots,
	deriveAugmentationSideEffects,
	getAugmentationInstallTimeHours,
	getAugmentationRemovalTimeHours,
	createInstalledAugmentationEntry,
	validateAugmentationInstall,
	validateAugmentationRemove,
	addAugmentationToActor,
	removeAugmentationFromActor,
	recordAugmentationFailure,
	FLAG_ROOT,
	ITEM_META_FLAG
};
