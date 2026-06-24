import { isStarshipConditionActive } from "./starship-conditions.mjs";
import { isSw5eStarshipActor } from "./patch/starship-movement.mjs";

const STARSHIP_AUTO_FAIL_SAVE_ABILITIES = new Set(["str", "dex"]);
const STARSHIP_SYSTEM_DAMAGE_SKILL_CHECK_LEVEL = 1;
const STARSHIP_SYSTEM_DAMAGE_ATTACK_SAVE_LEVEL = 3;
const STARSHIP_SYSTEM_DAMAGE_MAX = 6;

/**
 * Stalled/Stunned cause automatic failure on Strength and Dexterity saving throws only.
 * @param {Actor|object} actor
 * @param {string} abilityId
 * @returns {boolean}
 */
export function shouldStarshipSaveAutoFail(actor, abilityId) {
	if ( actor?.type !== "vehicle" ) return false;
	if ( actor?.flags?.sw5e?.legacyStarshipActor?.type !== "starship" ) return false;
	const ability = String(abilityId ?? "").toLowerCase();
	if ( !STARSHIP_AUTO_FAIL_SAVE_ABILITIES.has(ability) ) return false;
	return isStarshipConditionActive(actor, "starshipStalled")
		|| isStarshipConditionActive(actor, "starshipStunned");
}

/**
 * Post a minimal automatic-failure chat message for a Starship ability save.
 * @param {Actor} actor
 * @param {string} abilityLabel
 * @returns {Promise<{ autoFail: true }>}
 */
export async function postStarshipSaveAutoFailMessage(actor, abilityLabel) {
	const saveKey = "SW5E.ActionSave";
	const localizedSave = game?.i18n?.localize?.(saveKey);
	const saveLabel = localizedSave && localizedSave !== saveKey ? localizedSave : "Saving Throw";
	await ChatMessage.create({
		speaker: ChatMessage.getSpeaker({ actor }),
		flavor: `${abilityLabel} (${saveLabel}) — Automatic Failure`
	});
	return { autoFail: true };
}

function getAdvModes() {
	const modes = CONFIG?.Dice?.D20Roll?.ADV_MODE ?? {};
	return {
		normal: modes.NORMAL ?? 0,
		advantage: modes.ADVANTAGE ?? 1,
		disadvantage: modes.DISADVANTAGE ?? -1
	};
}

function readStarshipSystemDamageLevel(actor) {
	const legacy = actor?.flags?.sw5e?.legacyStarshipActor?.system?.attributes
		?? actor?._source?.flags?.sw5e?.legacyStarshipActor?.system?.attributes;
	const level = Math.trunc(Number(legacy?.systemDamage) || 0);
	if ( !Number.isFinite(level) ) return 0;
	return Math.max(0, Math.min(STARSHIP_SYSTEM_DAMAGE_MAX, level));
}

/**
 * @param {Actor|object} actor
 * @param {"check"|"attack"|"save"} rollKind
 * @returns {{ advantage: string[], disadvantage: string[] }}
 */
export function collectStarshipRollModifierSources(actor, rollKind) {
	const advantage = [];
	const disadvantage = [];
	const sdLevel = readStarshipSystemDamageLevel(actor);

	if ( rollKind === "check" ) {
		if ( sdLevel >= STARSHIP_SYSTEM_DAMAGE_SKILL_CHECK_LEVEL ) disadvantage.push("systemDamage");
		if ( isStarshipConditionActive(actor, "starshipIonized") ) disadvantage.push("ionized");
	} else if ( rollKind === "attack" ) {
		if ( sdLevel >= STARSHIP_SYSTEM_DAMAGE_ATTACK_SAVE_LEVEL ) disadvantage.push("systemDamage");
		if ( isStarshipConditionActive(actor, "starshipIonized") ) disadvantage.push("ionized");
		if ( isStarshipConditionActive(actor, "starshipBlinded") ) disadvantage.push("blinded");
		if ( isStarshipConditionActive(actor, "starshipInvisible") ) advantage.push("invisible");
	} else if ( rollKind === "save" ) {
		if ( sdLevel >= STARSHIP_SYSTEM_DAMAGE_ATTACK_SAVE_LEVEL ) disadvantage.push("systemDamage");
	}

	return { advantage, disadvantage };
}

/**
 * Starship actors currently targeted by the rolling user (`game.user.targets`).
 * Does not use `config.target` (defender AC only when exactly one target is selected).
 * @returns {Actor[]}
 */
export function resolveIncomingAttackTargetActors() {
	const targets = game?.user?.targets;
	if ( !targets?.size ) return [];

	const actors = [];
	for ( const token of targets ) {
		const actor = token?.actor;
		if ( actor && isSw5eStarshipActor(actor) ) actors.push(actor);
	}
	return actors;
}

/**
 * Incoming attack modifier sources from a single targeted Starship defender.
 * @param {Actor|object} targetActor
 * @returns {{ advantage: string[], disadvantage: string[] }}
 */
export function collectStarshipIncomingAttackModifierSources(targetActor) {
	const advantage = [];
	const disadvantage = [];

	if ( isStarshipConditionActive(targetActor, "starshipBlinded") ) advantage.push("targetBlinded");
	if ( isStarshipConditionActive(targetActor, "starshipStalled") ) advantage.push("targetStalled");
	if ( isStarshipConditionActive(targetActor, "starshipStunned") ) advantage.push("targetStunned");
	if ( isStarshipConditionActive(targetActor, "starshipInvisible") ) disadvantage.push("targetInvisible");

	return { advantage, disadvantage };
}

/**
 * Incoming attack modifier sources from one or more targeted Starship defenders.
 * @param {Actor[]} targetActors
 * @returns {{ advantage: string[], disadvantage: string[] }}
 */
export function collectStarshipIncomingAttackModifierSourcesFromTargets(targetActors) {
	if ( !targetActors?.length ) return { advantage: [], disadvantage: [] };

	const advantage = [];
	const disadvantage = [];
	for ( const target of targetActors ) {
		const sources = collectStarshipIncomingAttackModifierSources(target);
		advantage.push(...sources.advantage);
		disadvantage.push(...sources.disadvantage);
	}
	return { advantage, disadvantage };
}

/**
 * Outgoing (attacker) and incoming (target) attack roll modifier sources.
 * @param {Actor|object|null} attacker
 * @param {Actor[]} [targetActors]
 * @returns {{ advantage: string[], disadvantage: string[] }}
 */
export function collectStarshipAttackRollModifierSources(attacker, targetActors = []) {
	const advantage = [];
	const disadvantage = [];

	if ( attacker && isSw5eStarshipActor(attacker) ) {
		const outgoing = collectStarshipRollModifierSources(attacker, "attack");
		advantage.push(...outgoing.advantage);
		disadvantage.push(...outgoing.disadvantage);
	}

	const incoming = collectStarshipIncomingAttackModifierSourcesFromTargets(targetActors);
	advantage.push(...incoming.advantage);
	disadvantage.push(...incoming.disadvantage);

	return { advantage, disadvantage };
}

/**
 * @param {object} params
 * @param {Actor|object|null} params.attacker
 * @param {Actor[]} [params.targetActors]
 * @param {number} params.baseMode
 * @returns {number}
 */
export function resolveStarshipAttackRollAdvantageMode({ attacker, targetActors = [], baseMode }) {
	const { normal, advantage, disadvantage } = getAdvModes();
	if ( baseMode === advantage || baseMode === disadvantage ) return baseMode;

	const sources = collectStarshipAttackRollModifierSources(attacker, targetActors);
	const hasAdvantage = sources.advantage.length > 0;
	const hasDisadvantage = sources.disadvantage.length > 0;

	if ( hasAdvantage && hasDisadvantage ) return normal;
	if ( hasAdvantage ) return advantage;
	if ( hasDisadvantage ) return disadvantage;
	return normal;
}

/**
 * @param {object} params
 * @param {Actor|object} params.actor
 * @param {"check"|"attack"|"save"} params.rollKind
 * @param {number} params.baseMode
 * @returns {number}
 */
export function resolveStarshipDefaultAdvantageMode({ actor, rollKind, baseMode }) {
	const { normal, advantage, disadvantage } = getAdvModes();
	if ( baseMode === advantage || baseMode === disadvantage ) return baseMode;

	const sources = collectStarshipRollModifierSources(actor, rollKind);
	const hasAdvantage = sources.advantage.length > 0;
	const hasDisadvantage = sources.disadvantage.length > 0;

	if ( hasAdvantage && hasDisadvantage ) return normal;
	if ( hasAdvantage ) return advantage;
	if ( hasDisadvantage ) return disadvantage;
	return normal;
}

export function getDnd5eRollEventKeyModifiers(event) {
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

/**
 * Derive explicit advantage mode from a dnd5e roll config before applying derived defaults.
 * @param {object} config
 * @returns {number}
 */
export function getStarshipRollBaseAdvantageModeFromConfig(config = {}) {
	const { normal, advantage, disadvantage } = getAdvModes();
	if ( config.advantage ) return advantage;
	if ( config.disadvantage ) return disadvantage;
	const keys = getDnd5eRollEventKeyModifiers(config.event);
	if ( keys.advantage ) return advantage;
	if ( keys.disadvantage ) return disadvantage;
	for ( const roll of config.rolls ?? [] ) {
		if ( roll?.options?.advantage ) return advantage;
		if ( roll?.options?.disadvantage ) return disadvantage;
	}
	return normal;
}

/**
 * Apply resolved default advantage/disadvantage to a dnd5e roll configuration object.
 * @param {object} config
 * @param {number} resolvedMode
 * @returns {boolean} Whether a non-normal modifier was applied
 */
export function applyStarshipResolvedAdvantageModeToRollConfig(config, resolvedMode) {
	const { normal, advantage, disadvantage } = getAdvModes();
	if ( resolvedMode === normal ) return false;

	if ( resolvedMode === advantage ) {
		config.advantage = true;
		config.disadvantage = false;
		for ( const roll of config.rolls ?? [] ) {
			roll.options ??= {};
			roll.options.advantage = true;
			roll.options.disadvantage = false;
		}
		return true;
	}

	if ( resolvedMode === disadvantage ) {
		config.disadvantage = true;
		config.advantage = false;
		for ( const roll of config.rolls ?? [] ) {
			roll.options ??= {};
			if ( !roll.options.advantage ) roll.options.disadvantage = true;
		}
		return true;
	}

	return false;
}
