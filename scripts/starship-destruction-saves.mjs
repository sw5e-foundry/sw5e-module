import {
	buildStarshipLegacyAttributeBatchMirrorUpdate,
	getLegacyStarshipActorSystem,
	persistStarshipLegacyAttributePath
} from "./starship-data.mjs";
import { incrementStarshipSystemDamageLevel } from "./starship-system-damage.mjs";
import { isSw5eStarshipActor } from "./patch/starship-movement.mjs";

const DESTRUCTION_SAVE_TARGET = 10;
const DESTRUCTION_SAVE_TRACK_MAX = 3;

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

function clampDestructionTrack(value) {
	const n = Math.trunc(Number(value));
	if ( !Number.isFinite(n) ) return 0;
	return Math.max(0, Math.min(DESTRUCTION_SAVE_TRACK_MAX, n));
}

function getStarshipHullValue(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	return Math.max(0, Math.trunc(Number(legacySystem.attributes?.hp?.value) || 0));
}

function getStarshipDeathCounters(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const death = legacySystem.attributes?.death ?? {};
	return {
		success: clampDestructionTrack(death.success),
		failure: clampDestructionTrack(death.failure)
	};
}

function buildDestructionSavePips(count, iconClass) {
	return Array.from({ length: DESTRUCTION_SAVE_TRACK_MAX }, (_, index) => ({
		active: index < count,
		iconClass
	}));
}

/** dnd5e-style tray pips: successes fill left-to-right; failures fill left-to-right. */
export function buildDestructionSaveTrayPips(count, type) {
	const pips = [];
	for ( let i = 1; i <= DESTRUCTION_SAVE_TRACK_MAX; i++ ) {
		const threshold = type === "failure" ? i : (DESTRUCTION_SAVE_TRACK_MAX + 1 - i);
		pips.push({
			filled: count >= threshold,
			failure: type === "failure"
		});
	}
	return pips;
}

export function getStarshipDestructionSaveContext(actor) {
	const hullValue = getStarshipHullValue(actor);
	const { success, failure } = getStarshipDeathCounters(actor);
	const canRoll = hullValue <= 0 && success < DESTRUCTION_SAVE_TRACK_MAX && failure < DESTRUCTION_SAVE_TRACK_MAX;

	return {
		success,
		failure,
		hullValue,
		canRoll,
		trackMax: DESTRUCTION_SAVE_TRACK_MAX,
		successPips: buildDestructionSavePips(success, "fa-check"),
		failurePips: buildDestructionSavePips(failure, "fa-times")
	};
}

export function buildDestructionSaveSidebarContext(actor, options = {}) {
	const {
		open = false,
		editMode = false,
		editable = true
	} = options;
	const ctx = getStarshipDestructionSaveContext(actor);
	const toggleTooltipKey = open
		? "SW5E.StarshipSheet.DestructionSaveHide"
		: "SW5E.StarshipSheet.DestructionSaveShow";

	return {
		...ctx,
		open,
		editMode,
		editable,
		successTrayPips: buildDestructionSaveTrayPips(ctx.success, "success"),
		failureTrayPips: buildDestructionSaveTrayPips(ctx.failure, "failure"),
		panelAria: localizeOrFallback("SW5E.StarshipSheet.DestructionSavePanelAria", "Destruction save tracking"),
		rollLabel: localizeOrFallback("SW5E.StarshipSheet.DestructionSaveRoll", "Roll Destruction Save"),
		rollTooltip: localizeOrFallback(
			"SW5E.StarshipSheet.DestructionSaveRollTooltip",
			"Roll a d20 destruction save when hull points are 0 (DC 10)"
		),
		resetLabel: localizeOrFallback("SW5E.StarshipSheet.DestructionSaveReset", "Reset Destruction Saves"),
		resetTooltip: localizeOrFallback(
			"SW5E.StarshipSheet.DestructionSaveResetTooltip",
			"Clear destruction save successes and failures"
		),
		rollUnavailableTooltip: localizeOrFallback(
			"SW5E.StarshipSheet.DestructionSaveRollUnavailable",
			"Destruction saves are only rolled when hull points are 0"
		),
		toggleTooltipKey,
		toggleTooltip: localizeOrFallback(
			toggleTooltipKey,
			open ? "Hide Destruction Saves" : "Show Destruction Saves"
		)
	};
}

function getDestructionSaveRollParts(actor) {
	const globalBonuses = actor?.system?.bonuses?.abilities ?? {};
	const parts = [];
	const rollData = actor?.getRollData?.() ?? {};
	if ( globalBonuses.save ) {
		parts.push("@saveBonus");
		try {
			rollData.saveBonus = Roll.replaceFormulaData(globalBonuses.save, rollData);
		} catch {
			rollData.saveBonus = globalBonuses.save;
		}
	}
	return { parts, rollData };
}

function getD20NaturalResult(roll) {
	const die = roll?.dice?.[0];
	const result = die?.results?.[0]?.result ?? die?.results?.[0]?.value;
	return Number.isFinite(Number(result)) ? Number(result) : null;
}

function resolveIncomingHullValue(doc, changed) {
	const paths = [
		"system.attributes.hp.value",
		"flags.sw5e.legacyStarshipActor.system.attributes.hp.value"
	];
	for ( const path of paths ) {
		if ( foundry.utils.hasProperty(changed, path) ) {
			return Math.max(0, Math.trunc(Number(foundry.utils.getProperty(changed, path)) || 0));
		}
	}
	return getStarshipHullValue(doc);
}

function onStarshipDestructionSavePreUpdateActor(doc, changed, options) {
	if ( !isSw5eStarshipActor(doc) ) return;
	const priorHull = getStarshipHullValue(doc);
	const nextHull = resolveIncomingHullValue(doc, changed);
	if ( priorHull <= 0 && nextHull > 0 ) {
		options.sw5eResetDestructionSavesOnHullRecovery = true;
	}
}

async function onStarshipDestructionSaveUpdateActor(doc, changed, options) {
	if ( !options?.sw5eResetDestructionSavesOnHullRecovery ) return;
	if ( !isSw5eStarshipActor(doc) ) return;
	const death = getStarshipDeathCounters(doc);
	if ( death.success === 0 && death.failure === 0 ) return;
	await resetStarshipDestructionSaves(doc);
}

export function registerStarshipDestructionSaveHooks() {
	Hooks.on("preUpdateActor", onStarshipDestructionSavePreUpdateActor);
	Hooks.on("updateActor", onStarshipDestructionSaveUpdateActor);
}

async function applyDestructionSaveRollResult(actor, roll, rollMode) {
	const death = getStarshipDeathCounters(actor);
	const natural = getD20NaturalResult(roll);
	const isCritical = natural === 20;
	const isFumble = natural === 1;
	const updates = [];
	let chatString = null;

	if ( isCritical ) {
		updates.push(["system.attributes.death.success", 0]);
		updates.push(["system.attributes.death.failure", 0]);
		updates.push(["system.attributes.hp.value", 1]);
		chatString = "SW5E.DestructionSaveCriticalSuccess";
	} else if ( isFumble ) {
		const failures = Math.min(
			DESTRUCTION_SAVE_TRACK_MAX,
			death.failure + 2
		);
		updates.push(["system.attributes.death.failure", failures]);
		await incrementStarshipSystemDamageLevel(actor, 2);
	} else if ( roll.total >= DESTRUCTION_SAVE_TARGET ) {
		const successes = death.success + 1;
		if ( successes >= DESTRUCTION_SAVE_TRACK_MAX ) {
			updates.push(["system.attributes.death.success", 0]);
			updates.push(["system.attributes.death.failure", 0]);
			chatString = "SW5E.DestructionSaveSuccess";
		} else {
			updates.push(["system.attributes.death.success", successes]);
		}
	} else {
		const failures = Math.min(
			DESTRUCTION_SAVE_TRACK_MAX,
			death.failure + 1
		);
		updates.push(["system.attributes.death.failure", failures]);
		await incrementStarshipSystemDamageLevel(actor, 1);
	}

	if ( updates.length ) {
		await actor.update(buildStarshipLegacyAttributeBatchMirrorUpdate(updates));
	}

	if ( chatString ) {
		const chatData = {
			content: localizeOrFallback(chatString, chatString, { name: actor.name }),
			speaker: ChatMessage.getSpeaker({ actor })
		};
		ChatMessage.applyRollMode(chatData, rollMode);
		await ChatMessage.create(chatData);
	}
}

export async function rollStarshipDestructionSave(actor) {
	if ( !actor ) return null;

	const hullValue = getStarshipHullValue(actor);
	const death = getStarshipDeathCounters(actor);
	if ( hullValue > 0 || death.success >= DESTRUCTION_SAVE_TRACK_MAX || death.failure >= DESTRUCTION_SAVE_TRACK_MAX ) {
		ui.notifications?.warn?.(localizeOrFallback(
			"SW5E.DestructionSaveUnnecessary",
			"You do not need to roll destruction saves because you have a positive number of hit points or have already reached 3 successes or failures."
		));
		return null;
	}

	const { parts, rollData } = getDestructionSaveRollParts(actor);
	const dialogTitle = localizeOrFallback("SW5E.DestructionSaveRollDialogTitle", "Destruction Save");

	const rollConfig = {
		target: DESTRUCTION_SAVE_TARGET,
		hookNames: ["destructionSave"],
		subject: actor,
		rolls: [
			CONFIG.Dice.D20Roll.mergeConfigs({
				parts,
				data: rollData,
				options: { target: DESTRUCTION_SAVE_TARGET }
			})
		]
	};

	const dialogConfig = {
		options: {
			window: {
				title: dialogTitle,
				subtitle: actor.name
			}
		}
	};

	const messageConfig = {
		data: {
			speaker: ChatMessage.getSpeaker({ actor }),
			flavor: dialogTitle,
			flags: { sw5e: { roll: { type: "destruction" } } }
		}
	};

	const rolls = await CONFIG.Dice.D20Roll.build(rollConfig, dialogConfig, messageConfig);
	if ( !rolls?.length ) return null;

	const roll = rolls[0];
	const rollMode = messageConfig.rollMode ?? game.settings.get("core", "rollMode");
	await applyDestructionSaveRollResult(actor, roll, rollMode);
	return roll;
}

export async function resetStarshipDestructionSaves(actor) {
	if ( !actor ) return false;
	await actor.update(buildStarshipLegacyAttributeBatchMirrorUpdate([
		["system.attributes.death.success", 0],
		["system.attributes.death.failure", 0]
	]));
	return true;
}

export async function persistStarshipDestructionCounter(actor, systemPath, rawValue) {
	const value = clampDestructionTrack(rawValue);
	await persistStarshipLegacyAttributePath(actor, systemPath, value);
	return value;
}
