import { getStarshipConditionSlowedContribution } from "./starship-conditions.mjs";
import {
	getLegacyStarshipActorSystem,
	isStarshipFlagVehicle,
	persistStarshipLegacyAttributePath
} from "./starship-data.mjs";

export const STARSHIP_SYSTEM_DAMAGE_PATH = "system.attributes.systemDamage";
export const STARSHIP_USED_LEGACY_PATH = "flags.sw5e.legacyStarshipActor.system.attributes.used";
export const STARSHIP_SYSTEM_DAMAGE_MAX = 6;
export const STARSHIP_SYSTEM_DAMAGE_CATASTROPHIC_LEVEL = STARSHIP_SYSTEM_DAMAGE_MAX;
export const STARSHIP_SYSTEM_DAMAGE_USED_LEVEL = 5;
/** SotG Appendix A — starship slowed speed reduction by level (levels 1–3). */
export const STARSHIP_SLOWED_MAX_LEVEL = 4;
export const STARSHIP_SLOWED_SPEED_REDUCTION_FT = Object.freeze([0, 150, 250, 300]);

function localizeOrFallback(key, fallback, data = {}) {
	const formatted = game?.i18n?.format?.(key, data);
	if ( formatted && formatted !== key ) return formatted;
	const localized = game?.i18n?.localize?.(key);
	if ( localized && localized !== key ) return localized;
	return Object.entries(data).reduce(
		(text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
		fallback
	);
}

export function clampStarshipSystemDamageLevel(value) {
	const n = Math.trunc(Number(value));
	if ( !Number.isFinite(n) ) return 0;
	return Math.max(0, Math.min(STARSHIP_SYSTEM_DAMAGE_MAX, n));
}

export function getStarshipSystemDamageLevel(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	return clampStarshipSystemDamageLevel(legacySystem.attributes?.systemDamage ?? 0);
}

/** Level 6+ catastrophic power failure helper for future callers only. */
export function appliesStarshipSystemDamageCatastrophicFailure(actor) {
	return getStarshipSystemDamageLevel(actor) >= STARSHIP_SYSTEM_DAMAGE_CATASTROPHIC_LEVEL;
}

export function getStarshipUsed(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	return Boolean(legacySystem.attributes?.used);
}

export async function setStarshipUsed(actor, used) {
	const value = Boolean(used);
	await actor.update({ [STARSHIP_USED_LEGACY_PATH]: value });
	return value;
}

/** Level 5+ latches Used true once; never clears Used when SD drops. */
export async function ensureStarshipUsedLatched(actor) {
	if ( getStarshipSystemDamageLevel(actor) < STARSHIP_SYSTEM_DAMAGE_USED_LEVEL ) return false;
	if ( getStarshipUsed(actor) ) return false;
	await setStarshipUsed(actor, true);
	return true;
}

export async function setStarshipSystemDamageLevel(actor, level) {
	const value = clampStarshipSystemDamageLevel(level);
	await persistStarshipLegacyAttributePath(actor, STARSHIP_SYSTEM_DAMAGE_PATH, value);
	await ensureStarshipUsedLatched(actor);
	return value;
}

/** Increase System Damage by up to `amount` (default 1), clamped at max. Triggers Used latch at SD ≥ 5. */
export async function incrementStarshipSystemDamageLevel(actor, amount = 1) {
	const before = getStarshipSystemDamageLevel(actor);
	const delta = Math.max(0, Math.trunc(Number(amount)) || 0);
	const after = clampStarshipSystemDamageLevel(before + delta);
	if ( after === before ) return { before, after, changed: false };
	await setStarshipSystemDamageLevel(actor, after);
	return { before, after, changed: true };
}

/** Reduce System Damage by up to `amount` (default 1), clamped at 0. */
export async function reduceStarshipSystemDamageLevel(actor, amount = 1) {
	const before = getStarshipSystemDamageLevel(actor);
	const delta = Math.max(0, Math.trunc(Number(amount)) || 0);
	const after = Math.max(0, before - delta);
	if ( after === before ) return { before, after, changed: false };
	await setStarshipSystemDamageLevel(actor, after);
	return { before, after, changed: true };
}

const STARSHIP_SYSTEM_DAMAGE_SKILL_CHECK_LEVEL = 1;

/** Level 1+ imposes disadvantage on Starship ability/skill checks (Phase 1 automation). */
export function appliesStarshipSystemDamageSkillCheckDisadvantage(actor) {
	return getStarshipSystemDamageLevel(actor) >= STARSHIP_SYSTEM_DAMAGE_SKILL_CHECK_LEVEL;
}

/** Default disadvantage when System Damage >= 1; preserves explicit adv/dis from event modifiers. */
export function applyStarshipSystemDamageSkillCheckAdvantageDefault(actor, advantageMode) {
	if ( !appliesStarshipSystemDamageSkillCheckDisadvantage(actor) ) return advantageMode;
	const modes = CONFIG?.Dice?.D20Roll?.ADV_MODE ?? {};
	const normal = modes.NORMAL ?? 0;
	const disadvantage = modes.DISADVANTAGE ?? -1;
	if ( advantageMode === normal ) return disadvantage;
	return advantageMode;
}

export function buildStarshipSystemDamageSkillCheckFlavorNote(actor) {
	if ( !appliesStarshipSystemDamageSkillCheckDisadvantage(actor) ) return "";
	return localizeOrFallback(
		"SW5E.StarshipSheet.SystemDamageSkillCheckDisadvantage",
		"System Damage Level 1: Disadvantage on ability checks"
	);
}

export function isStarshipSystemDamageSkillCheckDisadvantageRoll(actor, advantageMode) {
	if ( !appliesStarshipSystemDamageSkillCheckDisadvantage(actor) ) return false;
	const disadvantage = CONFIG?.Dice?.D20Roll?.ADV_MODE?.DISADVANTAGE ?? -1;
	return advantageMode === disadvantage;
}

const STARSHIP_SYSTEM_DAMAGE_ATTACK_SAVE_LEVEL = 3;

/** Level 3+ imposes disadvantage on Starship attack rolls and saving throws. */
export function appliesStarshipSystemDamageAttackSaveDisadvantage(actor) {
	return getStarshipSystemDamageLevel(actor) >= STARSHIP_SYSTEM_DAMAGE_ATTACK_SAVE_LEVEL;
}

/** Default disadvantage when System Damage >= 3; preserves explicit adv/dis from event modifiers. */
export function applyStarshipSystemDamageAttackSaveAdvantageDefault(actor, advantageMode) {
	if ( !appliesStarshipSystemDamageAttackSaveDisadvantage(actor) ) return advantageMode;
	const modes = CONFIG?.Dice?.D20Roll?.ADV_MODE ?? {};
	const normal = modes.NORMAL ?? 0;
	const disadvantage = modes.DISADVANTAGE ?? -1;
	if ( advantageMode === normal ) return disadvantage;
	return advantageMode;
}

export function buildStarshipSystemDamageAttackSaveFlavorNote(actor) {
	if ( !appliesStarshipSystemDamageAttackSaveDisadvantage(actor) ) return "";
	return localizeOrFallback(
		"SW5E.StarshipSheet.SystemDamageAttackSaveDisadvantage",
		"System Damage Level 3: Disadvantage on attack rolls and saving throws"
	);
}

export function isStarshipSystemDamageAttackSaveDisadvantageRoll(actor, advantageMode) {
	if ( !appliesStarshipSystemDamageAttackSaveDisadvantage(actor) ) return false;
	const disadvantage = CONFIG?.Dice?.D20Roll?.ADV_MODE?.DISADVANTAGE ?? -1;
	return advantageMode === disadvantage;
}

function getDnd5eRollEventKeyModifiers(event) {
	const areKeysPressed = globalThis.dnd5e?.utils?.areKeysPressed;
	if ( typeof areKeysPressed === "function" ) {
		return {
			advantage: areKeysPressed(event, "skipDialogAdvantage"),
			disadvantage: areKeysPressed(event, "skipDialogDisadvantage")
		};
	}
	return {
		advantage: Boolean(event?.altKey),
		disadvantage: Boolean(event?.ctrlKey || event?.metaKey)
	};
}

function shouldDefaultStarshipSystemDamageRollDisadvantage(config = {}) {
	if ( config.advantage ) return false;
	const keys = getDnd5eRollEventKeyModifiers(config.event);
	if ( keys.advantage ) return false;
	for ( const roll of config.rolls ?? [] ) {
		if ( roll?.options?.advantage ) return false;
	}
	return true;
}

function applyStarshipSystemDamageD20RollDisadvantageConfig(actor, config = {}) {
	if ( !appliesStarshipSystemDamageAttackSaveDisadvantage(actor) ) return false;
	if ( !shouldDefaultStarshipSystemDamageRollDisadvantage(config) ) return false;
	config.disadvantage = true;
	config.sw5eStarshipSystemDamageAttackSave = true;
	for ( const roll of config.rolls ?? [] ) {
		roll.options ??= {};
		if ( !roll.options.advantage ) roll.options.disadvantage = true;
	}
	return true;
}

/** Apply Level 3 default disadvantage to a dnd5e attack roll configuration object. */
export function applyStarshipSystemDamageAttackDisadvantageDefault(actor, rollOptions = {}) {
	return applyStarshipSystemDamageD20RollDisadvantageConfig(actor, rollOptions);
}

/** Apply Level 3 default disadvantage to a dnd5e saving throw configuration object. */
export function applyStarshipSystemDamageSaveDisadvantageDefault(actor, rollOptions = {}) {
	return applyStarshipSystemDamageD20RollDisadvantageConfig(actor, rollOptions);
}

function resolveRollConfigActor(config) {
	const subject = config?.subject;
	if ( !subject ) return null;
	if ( subject.documentName === "Actor" ) return subject;
	if ( subject.actor?.documentName === "Actor" ) return subject.actor;
	if ( subject.item?.actor ) return subject.item.actor;
	return null;
}

function isStarshipSavingThrowRollConfig(config) {
	return (config?.hookNames ?? []).includes("SavingThrow");
}

function isStarshipAttackRollConfig(config) {
	return (config?.hookNames ?? []).some(name => /^attack$/i.test(name));
}

function appendStarshipSystemDamageAttackSaveDialogNote(dialog, actor) {
	if ( !appliesStarshipSystemDamageAttackSaveDisadvantage(actor) ) return;
	const note = buildStarshipSystemDamageAttackSaveFlavorNote(actor);
	dialog.options ??= {};
	dialog.options.window ??= {};
	const existing = dialog.options.window.subtitle ?? "";
	if ( !existing.includes(note) ) {
		dialog.options.window.subtitle = existing ? `${existing} — ${note}` : note;
	}
}

function appendStarshipSystemDamageAttackSaveMessageFlavor(message, actor) {
	const note = buildStarshipSystemDamageAttackSaveFlavorNote(actor);
	if ( !note ) return;
	const existing = foundry.utils.getProperty(message, "data.flavor") ?? "";
	if ( existing.includes(note) ) return;
	foundry.utils.setProperty(message, "data.flavor", existing ? `${existing} — ${note}` : note);
}

function onStarshipSystemDamagePreRoll(config, dialog, message) {
	const actor = resolveRollConfigActor(config);
	if ( !actor || !isStarshipFlagVehicle(actor) ) return;
	const isSave = isStarshipSavingThrowRollConfig(config);
	const isAttack = isStarshipAttackRollConfig(config);
	if ( !isSave && !isAttack ) return;
	if ( !applyStarshipSystemDamageD20RollDisadvantageConfig(actor, config) ) return;
	appendStarshipSystemDamageAttackSaveDialogNote(dialog, actor);
}

function onStarshipSystemDamagePostRollConfiguration(rolls, config, message) {
	const actor = resolveRollConfigActor(config);
	if ( !actor || !isStarshipFlagVehicle(actor) ) return;
	const isSave = isStarshipSavingThrowRollConfig(config);
	const isAttack = isStarshipAttackRollConfig(config);
	if ( !isSave && !isAttack ) return;
	const hasDisadvantage = (rolls ?? []).some(roll => roll?.hasDisadvantage);
	if ( !hasDisadvantage || !appliesStarshipSystemDamageAttackSaveDisadvantage(actor) ) return;
	appendStarshipSystemDamageAttackSaveMessageFlavor(message, actor);
}

const pendingStarshipZeroHullDamageApplications = new WeakMap();

function getStarshipCurrentHullValue(actor) {
	return Math.max(0, Number(actor?.system?.attributes?.hp?.value) || 0);
}

function onStarshipSystemDamagePreApplyDamage(actor, amount, updates, options) {
	if ( !actor || !isStarshipFlagVehicle(actor) ) return;
	const appliedDamage = Math.max(0, Number(amount) || 0);
	const preHull = getStarshipCurrentHullValue(actor);
	if ( preHull <= 0 && appliedDamage > 0 ) {
		pendingStarshipZeroHullDamageApplications.set(actor, { preHull, amount: appliedDamage });
		return;
	}
	pendingStarshipZeroHullDamageApplications.delete(actor);
}

async function onStarshipSystemDamageApplyDamage(actor, amount, options) {
	if ( !actor || !isStarshipFlagVehicle(actor) ) return;
	const pending = pendingStarshipZeroHullDamageApplications.get(actor);
	if ( !pending ) return;
	pendingStarshipZeroHullDamageApplications.delete(actor);
	if ( pending.preHull > 0 ) return;
	if ( pending.amount <= 0 ) return;
	await incrementStarshipSystemDamageLevel(actor, 1);
}

/** Register dnd5e roll hooks for System Damage Level 3 attack/save disadvantage. */
export function registerStarshipSystemDamageRollHooks() {
	Hooks.on("dnd5e.preRollSavingThrow", onStarshipSystemDamagePreRoll);
	Hooks.on("dnd5e.preRollAttack", onStarshipSystemDamagePreRoll);
	Hooks.on("dnd5e.postRollConfiguration", onStarshipSystemDamagePostRollConfiguration);
	Hooks.on("dnd5e.preApplyDamage", onStarshipSystemDamagePreApplyDamage);
	Hooks.on("dnd5e.applyDamage", onStarshipSystemDamageApplyDamage);
}

export const STARSHIP_SYSTEM_DAMAGE_HALVED_CAPS_LEVEL = 4;

/** Level 4+ halves effective hull max, shield max, and shield regen rate (derived only). */
export function appliesStarshipSystemDamageHalvedCapsForLevel(systemDamageLevel) {
	return clampStarshipSystemDamageLevel(systemDamageLevel) >= STARSHIP_SYSTEM_DAMAGE_HALVED_CAPS_LEVEL;
}

export function appliesStarshipSystemDamageHalvedCaps(actor) {
	return appliesStarshipSystemDamageHalvedCapsForLevel(getStarshipSystemDamageLevel(actor));
}

function halveStoredCap(storedMax, shouldHalve) {
	const stored = Math.max(0, Number(storedMax) || 0);
	if ( !shouldHalve ) return stored;
	return Math.max(0, Math.floor(stored / 2));
}

/**
 * Effective hull max for gameplay/display; stored `hp.max` is unchanged.
 * @param {Actor} actor
 * @param {number} [storedMax]
 * @param {number} [systemDamageLevel] Override SD level (e.g. refitting preview after reduction).
 */
export function getStarshipEffectiveHullMax(actor, storedMax, systemDamageLevel) {
	const stored = Math.max(0, Number(storedMax ?? actor?.system?.attributes?.hp?.max) || 0);
	const level = systemDamageLevel ?? getStarshipSystemDamageLevel(actor);
	return halveStoredCap(stored, appliesStarshipSystemDamageHalvedCapsForLevel(level));
}

/**
 * Effective shield max for gameplay/display; stored `hp.tempmax` is unchanged.
 * @param {Actor} actor
 * @param {number} [storedMax]
 * @param {number} [systemDamageLevel]
 */
export function getStarshipEffectiveShieldMax(actor, storedMax, systemDamageLevel) {
	const stored = Math.max(0, Number(storedMax ?? actor?.system?.attributes?.hp?.tempmax) || 0);
	const level = systemDamageLevel ?? getStarshipSystemDamageLevel(actor);
	return halveStoredCap(stored, appliesStarshipSystemDamageHalvedCapsForLevel(level));
}

/**
 * Effective shield regen coefficient; stored item `regrateco` is unchanged.
 * @param {Actor} actor
 * @param {number|null|undefined} storedMult
 * @param {number} [systemDamageLevel]
 */
export function getStarshipEffectiveShieldRegenRateMult(actor, storedMult, systemDamageLevel) {
	const stored = Number(storedMult);
	if ( !Number.isFinite(stored) || stored <= 0 ) return storedMult ?? null;
	const level = systemDamageLevel ?? getStarshipSystemDamageLevel(actor);
	if ( !appliesStarshipSystemDamageHalvedCapsForLevel(level) ) return stored;
	return stored * 0.5;
}

/** System Damage level 2+ grants 1 slowed level (cumulative RAW includes level 2 effect). */
export function getStarshipSlowedLevelFromSystemDamageLevel(systemDamageLevel) {
	return clampStarshipSystemDamageLevel(systemDamageLevel) >= 2 ? 1 : 0;
}

/** Reserved for a future leveled Slowed tracker; returns 0 until that UI exists. */
export function getExplicitStarshipSlowedLevel(_actor) {
	return 0;
}

export function resolveEffectiveStarshipSlowedLevel(actor) {
	const systemDamageSlowedLevel = getStarshipSlowedLevelFromSystemDamageLevel(getStarshipSystemDamageLevel(actor));
	const conditionSlowedContribution = getStarshipConditionSlowedContribution(actor);
	const explicitSlowedLevel = getExplicitStarshipSlowedLevel(actor);
	const total = systemDamageSlowedLevel + conditionSlowedContribution + explicitSlowedLevel;
	return Math.max(0, Math.min(STARSHIP_SLOWED_MAX_LEVEL, total));
}

export function resolveStarshipSlowedLevel(actor) {
	return resolveEffectiveStarshipSlowedLevel(actor);
}

/** Apply SotG starship slowed reduction to a speed value (derived only — does not mutate storage). */
export function applyStarshipSlowedToSpeed(speed, slowedLevel) {
	const level = Math.max(0, Math.min(STARSHIP_SLOWED_MAX_LEVEL, Math.trunc(Number(slowedLevel)) || 0));
	const base = Math.floor(Number(speed));
	if ( !Number.isFinite(base) ) return 0;
	if ( level <= 0 ) return base;
	if ( level >= STARSHIP_SLOWED_MAX_LEVEL ) return 0;
	const reduction = STARSHIP_SLOWED_SPEED_REDUCTION_FT[level] ?? 0;
	return Math.max(0, base - reduction);
}

function getSystemDamagePipTooltip(level) {
	return localizeOrFallback(
		"SW5E.StarshipSheet.SystemDamageLevel",
		`System Damage Level ${level}`,
		{ n: level }
	);
}

/** Mimics dnd5e `#togglePip` for exhaustion. */
export function resolveStarshipSystemDamagePipToggle(currentLevel, pipN) {
	const current = clampStarshipSystemDamageLevel(currentLevel);
	const n = clampStarshipSystemDamageLevel(pipN);
	if ( n < 1 ) return current;
	if ( current === n ) return Math.max(0, n - 1);
	return n;
}

function buildSystemDamagePip(level, currentLevel) {
	const filled = currentLevel >= level;
	const classes = ["pip", "sw5e-starship-system-damage-pip"];
	if ( filled ) classes.push("filled");
	if ( level === STARSHIP_SYSTEM_DAMAGE_MAX ) classes.push("death");
	const tooltip = getSystemDamagePipTooltip(level);
	return {
		n: level,
		filled,
		classes: classes.join(" "),
		tooltip,
		label: tooltip
	};
}

export function buildSystemDamageSidebarContext(actor, options = {}) {
	const { editable = true } = options;
	const level = getStarshipSystemDamageLevel(actor);
	const pips = [];
	for ( let n = 1; n <= STARSHIP_SYSTEM_DAMAGE_MAX; n++ ) pips.push(buildSystemDamagePip(n, level));

	return {
		level,
		pips,
		editable,
		catastrophic: level >= STARSHIP_SYSTEM_DAMAGE_MAX,
		panelAria: localizeOrFallback(
			"SW5E.StarshipSheet.SystemDamagePanelAria",
			"System damage tracking"
		)
	};
}
