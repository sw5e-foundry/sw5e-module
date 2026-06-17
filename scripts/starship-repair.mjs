import { getModulePath } from "./module-support.mjs";
import { applySw5eThemeScope } from "./theme.mjs";
import {
	STARSHIP_POWER_DIE_SLOTS,
	buildStarshipLegacyAttributeBatchMirrorUpdate,
	deriveStarshipPools,
	getLegacyStarshipActorSystem,
	resolveStarshipPowerSlotAllocationMax
} from "./starship-data.mjs";
import {
	buildRecoverStarshipHullDiceItemUpdate,
	buildRecoverStarshipShieldDiceItemUpdate,
	buildStarshipHullDiceSpendItemUpdate,
	getStarshipHullDiceAvailability,
	getStarshipLiveHp,
	getStarshipShieldDepleted,
	previewStarshipHullDieRoll,
	setStarshipShieldDepleted
} from "./starship-dice-rolls.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const REPAIR_DIALOG_CLASSES = ["dnd5e2", "application", "rest", "starship-repair"];
const REPAIR_DIALOG_POSITION = { width: 560, height: "auto" };
const REPAIR_THEME_SCOPE = "starship-repair";

function localizeOrFallback(key, fallback, data = {}) {	const formatted = game?.i18n?.format?.(key, data);
	if ( formatted && formatted !== key ) return formatted;
	const localized = game?.i18n?.localize?.(key);
	if ( localized && localized !== key ) return localized;
	return Object.entries(data).reduce(
		(text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
		fallback
	);
}

function buildPreviewData(preview, { refitting = false } = {}) {
	const rows = [];
	rows.push(localizeOrFallback(
		"SW5E.StarshipSheet.RepairPreviewHullPoints",
		"Hull Points: {before} → {after}",
		{ before: preview.hullPoints.before, after: preview.hullPoints.after }
	));
	if ( preview.hullDice ) {
		rows.push(localizeOrFallback(
			"SW5E.StarshipSheet.RepairPreviewHullDice",
			"Hull Dice: {before} → {after}",
			{ before: preview.hullDice.before, after: preview.hullDice.after }
		));
	}
	if ( preview.shieldPoints ) {
		if ( preview.shieldPoints.restored === false && preview.shieldPoints.depleted ) {
			rows.push(localizeOrFallback(
				"SW5E.StarshipSheet.RepairPreviewShieldsDepleted",
				"Shield Points: {before} (depleted — not restored on recharge)",
				{ before: preview.shieldPoints.before }
			));
		} else {
			rows.push(localizeOrFallback(
				"SW5E.StarshipSheet.RepairPreviewShieldPoints",
				"Shield Points: {before} → {after}",
				{ before: preview.shieldPoints.before, after: preview.shieldPoints.after }
			));
		}
	}
	if ( preview.shieldDice ) {
		if ( preview.shieldDice.restored === false && preview.shieldDice.depleted ) {
			rows.push(localizeOrFallback(
				"SW5E.StarshipSheet.RepairPreviewShieldDiceDepleted",
				"Shield Dice: {before} (depleted — not restored on recharge)",
				{ before: preview.shieldDice.before }
			));
		} else {
			rows.push(localizeOrFallback(
				"SW5E.StarshipSheet.RepairPreviewShieldDice",
				"Shield Dice: {before} → {after}",
				{ before: preview.shieldDice.before, after: preview.shieldDice.after }
			));
		}
	}
	if ( preview.powerDice?.refilled ) {
		rows.push(localizeOrFallback(
			"SW5E.StarshipSheet.RepairPreviewPowerDice",
			"Power Dice: pools refill to max"
		));
	}
	return {
		heading: refitting
			? localizeOrFallback("SW5E.StarshipSheet.RefittingPreviewHeading", "Refitting Preview")
			: localizeOrFallback("SW5E.StarshipSheet.RechargePreviewHeading", "Recharge Preview"),
		rows
	};
}

function applyRepairDialogThemeScope(app) {
	const root = app.element instanceof HTMLElement ? app.element : app.element?.[0] ?? null;
	applySw5eThemeScope(root, { scope: REPAIR_THEME_SCOPE });
}

function formatPoolFraction(current, max) {
	return `${current} / ${max}`;
}

function buildRepairPowerDiceRecovery(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const pools = deriveStarshipPools(actor);
	const power = legacySystem.attributes?.power ?? {};
	const entries = STARSHIP_POWER_DIE_SLOTS.map(slotKey => {
		const max = resolveStarshipPowerSlotAllocationMax(actor, slotKey, power, pools);
		return [`system.attributes.power.${slotKey}.value`, max];
	});
	return buildStarshipLegacyAttributeBatchMirrorUpdate(entries);
}

function getShieldCapacity(actor) {
	const hp = getStarshipLiveHp(actor);
	return Math.max(0, Number(hp.tempmax) || 0);
}

export function buildRechargeRepairPreview(actor, staged = {}) {
	const hp = getStarshipLiveHp(actor);
	const pools = deriveStarshipPools(actor);
	const stagedHp = Math.max(0, Number(staged.hpGain) || 0);
	const stagedSpent = Math.max(0, Number(staged.hullDiceSpent) || 0);
	const hullValue = Math.max(0, Number(hp.value) || 0);
	const hullMax = Math.max(0, Number(hp.max) || 0);
	const shieldValue = Math.max(0, Number(hp.temp) || 0);
	const shieldMax = getShieldCapacity(actor);
	const depleted = getStarshipShieldDepleted(actor);
	const resetShields = !depleted && shieldMax > 0;

	const hullDiceUsed = (pools.hull?.max ?? 0) - (pools.hull?.current ?? 0) + stagedSpent;
	const hullDiceMax = pools.hull?.max ?? 0;
	const hullDiceCurrentAfter = Math.max(0, (pools.hull?.current ?? 0) - stagedSpent);

	const shldDiceUsed = (pools.shld?.max ?? 0) - (pools.shld?.current ?? 0);
	const shldDiceMax = pools.shld?.max ?? 0;

	return {
		hullPoints: {
			before: hullValue,
			after: Math.min(hullMax, hullValue + stagedHp),
			max: hullMax,
			change: stagedHp
		},
		hullDice: {
			before: formatPoolFraction(pools.hull?.current ?? 0, hullDiceMax),
			after: formatPoolFraction(hullDiceCurrentAfter, hullDiceMax),
			spent: stagedSpent
		},
		shieldPoints: resetShields ? {
			before: shieldValue,
			after: shieldMax,
			max: shieldMax,
			restored: true
		} : {
			before: shieldValue,
			after: shieldValue,
			max: shieldMax,
			restored: false,
			depleted
		},
		shieldDice: resetShields ? {
			before: formatPoolFraction(pools.shld?.current ?? 0, shldDiceMax),
			after: formatPoolFraction(shldDiceMax, shldDiceMax),
			restored: true
		} : {
			before: formatPoolFraction(pools.shld?.current ?? 0, shldDiceMax),
			after: formatPoolFraction(pools.shld?.current ?? 0, shldDiceMax),
			restored: false,
			depleted
		},
		powerDice: { refilled: true },
		resetShields,
		depleted
	};
}

export function buildRefittingRepairPreview(actor) {
	const hp = getStarshipLiveHp(actor);
	const pools = deriveStarshipPools(actor);
	const hullValue = Math.max(0, Number(hp.value) || 0);
	const hullMax = Math.max(0, Number(hp.max) || 0);
	const shieldValue = Math.max(0, Number(hp.temp) || 0);
	const shieldMax = getShieldCapacity(actor);
	const hullDiceMax = pools.hull?.max ?? 0;
	const shldDiceMax = pools.shld?.max ?? 0;

	return {
		hullPoints: { before: hullValue, after: hullMax, max: hullMax },
		hullDice: {
			before: formatPoolFraction(pools.hull?.current ?? 0, hullDiceMax),
			after: formatPoolFraction(hullDiceMax, hullDiceMax)
		},
		shieldPoints: { before: shieldValue, after: shieldMax, max: shieldMax },
		shieldDice: {
			before: formatPoolFraction(pools.shld?.current ?? 0, shldDiceMax),
			after: formatPoolFraction(shldDiceMax, shldDiceMax)
		},
		powerDice: { refilled: true }
	};
}

async function postRepairChatMessage(actor, { refitting, result }) {
	const { hullPointsGained = 0, hullDiceSpent = 0, hullDiceRecovered = 0, shieldPointsGained = 0, shieldDiceRecovered = 0 } = result;
	let messageKey = refitting ? "SW5E.RefittingRepairResult" : "SW5E.RechargeRepairResult";
	if ( hullPointsGained > 0 ) messageKey += "HP";
	if ( refitting ? hullDiceRecovered > 0 : hullDiceSpent > 0 ) messageKey += "HD";
	if ( shieldPointsGained > 0 || shieldDiceRecovered > 0 ) messageKey += "S";

	const flavorKey = refitting ? "SW5E.RefittingRepairNormal" : "SW5E.RechargeRepairNormal";
	const formatArgs = {
		name: actor.name,
		hullPoints: hullPointsGained,
		hullDice: refitting ? hullDiceRecovered : hullDiceSpent,
		shldPoints: shieldPointsGained,
		shldDice: shieldDiceRecovered
	};
	await ChatMessage.create({
		user: game.user.id,
		speaker: ChatMessage.getSpeaker({ actor }),
		flavor: localizeOrFallback(flavorKey, refitting ? "Refitting Repair (8 hours)" : "Recharge Repair (1 hour)"),
		content: localizeOrFallback(messageKey, "{name} completes a repair.", formatArgs)
	});
}

export async function applyRechargeRepair(actor, { staged = {}, newDay = false, chat = true } = {}) {
	if ( !actor ) return null;
	const preview = buildRechargeRepairPreview(actor, staged);
	const hp = getStarshipLiveHp(actor);
	const actorEntries = [];
	const stagedHp = Math.max(0, Number(staged.hpGain) || 0);
	const stagedSpent = Math.max(0, Number(staged.hullDiceSpent) || 0);

	if ( stagedHp > 0 ) {
		actorEntries.push(["system.attributes.hp.value", Math.min(
			Math.max(0, Number(hp.max) || 0),
			Math.max(0, Number(hp.value) || 0) + stagedHp
		)]);
	}

	if ( preview.resetShields ) {
		const shieldMax = getShieldCapacity(actor);
		actorEntries.push(["system.attributes.hp.temp", shieldMax]);
	}

	const itemUpdates = [
		...buildStarshipHullDiceSpendItemUpdate(actor, stagedSpent)
	];
	const shieldRecovery = preview.resetShields
		? buildRecoverStarshipShieldDiceItemUpdate(actor)
		: { itemUpdates: [], recovered: 0 };
	if ( shieldRecovery.itemUpdates.length ) itemUpdates.push(...shieldRecovery.itemUpdates);

	let actorUpdate = buildStarshipLegacyAttributeBatchMirrorUpdate(actorEntries);
	actorUpdate = { ...actorUpdate, ...buildRepairPowerDiceRecovery(actor) };

	await actor.update(actorUpdate, { isRest: true });
	if ( itemUpdates.length ) await actor.updateEmbeddedDocuments("Item", itemUpdates, { isRest: true });
	if ( preview.resetShields ) await setStarshipShieldDepleted(actor, false);

	if ( Array.isArray(staged.rolls) ) {
		const flavor = localizeOrFallback("SW5E.HullDiceRoll", "Hull Die Roll");
		for ( const roll of staged.rolls ) {
			if ( !roll ) continue;
			await roll.toMessage({
				speaker: ChatMessage.getSpeaker({ actor }),
				flavor: `${flavor}: ${actor.name}`.trim(),
				flags: { sw5e: { roll: { type: "hullDie" } } }
			});
		}
	}

	const result = {
		hullPointsGained: stagedHp,
		hullDiceSpent: stagedSpent,
		hullDiceRecovered: 0,
		shieldPointsGained: preview.resetShields
			? Math.max(0, getShieldCapacity(actor) - Math.max(0, Number(hp.temp) || 0))
			: 0,
		shieldDiceRecovered: shieldRecovery.recovered,
		newDay
	};

	if ( chat ) await postRepairChatMessage(actor, { refitting: false, result });
	return result;
}

export async function applyRefittingRepair(actor, { newDay = true, chat = true } = {}) {
	if ( !actor ) return null;
	const hp = getStarshipLiveHp(actor);
	const hullMax = Math.max(0, Number(hp.max) || 0);
	const shieldMax = getShieldCapacity(actor);
	const hullBefore = Math.max(0, Number(hp.value) || 0);
	const shieldBefore = Math.max(0, Number(hp.temp) || 0);

	const hullRecovery = buildRecoverStarshipHullDiceItemUpdate(actor);
	const shieldRecovery = buildRecoverStarshipShieldDiceItemUpdate(actor);

	const actorEntries = [
		["system.attributes.hp.value", hullMax],
		["system.attributes.hp.temp", shieldMax]
	];
	let actorUpdate = buildStarshipLegacyAttributeBatchMirrorUpdate(actorEntries);
	actorUpdate = { ...actorUpdate, ...buildRepairPowerDiceRecovery(actor) };

	const itemUpdates = [
		...hullRecovery.itemUpdates,
		...shieldRecovery.itemUpdates
	];

	await actor.update(actorUpdate, { isRest: true });
	if ( itemUpdates.length ) await actor.updateEmbeddedDocuments("Item", itemUpdates, { isRest: true });
	await setStarshipShieldDepleted(actor, false);

	const result = {
		hullPointsGained: Math.max(0, hullMax - hullBefore),
		hullDiceSpent: 0,
		hullDiceRecovered: hullRecovery.recovered,
		shieldPointsGained: Math.max(0, shieldMax - shieldBefore),
		shieldDiceRecovered: shieldRecovery.recovered,
		newDay
	};

	if ( chat ) await postRepairChatMessage(actor, { refitting: true, result });
	return result;
}

export class StarshipRechargeRepairDialog extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(actor, options = {}) {
		super(options);
		this.actor = actor;
		this.staged = { hpGain: 0, hullDiceSpent: 0, rolls: [] };
		this.newDay = false;
		this.#applied = false;
		this.#resolve = null;
		this.#reject = null;
	}

	#resolve;
	#reject;
	#applied = false;

	static DEFAULT_OPTIONS = {
		tag: "form",
		classes: [...REPAIR_DIALOG_CLASSES, "recharge-repair"],
		position: REPAIR_DIALOG_POSITION,
		actions: {
			rollHull: StarshipRechargeRepairDialog.#onRollHull,
			apply: StarshipRechargeRepairDialog.#onApply,
			cancel: StarshipRechargeRepairDialog.#onCancel
		}
	};

	static PARTS = {
		form: {
			template: getModulePath("templates/apps/starship-recharge-repair-dialog.hbs")
		}
	};

	get title() {
		return localizeOrFallback("SW5E.RechargeRepair", "Recharge Repair");
	}

	static open(actor) {
		return new Promise((resolve, reject) => {
			const dialog = new StarshipRechargeRepairDialog(actor);
			dialog.#resolve = resolve;
			dialog.#reject = reject;
			dialog.render(true);
		});
	}

	async _prepareContext() {
		const availability = getStarshipHullDiceAvailability(this.actor, this.staged.hullDiceSpent);
		const preview = buildRechargeRepairPreview(this.actor, this.staged);
		const { heading, rows } = buildPreviewData(preview);
		return {
			hint: localizeOrFallback(
				"SW5E.RechargeRepairHint",
				"On a recharge repair you may spend remaining Hull Dice and recover Shields."
			),
			denomination: availability.die,
			canRoll: availability.remaining > 0,
			noHdHint: localizeOrFallback("SW5E.RechargeRepairNoHD", "No Hull Dice remaining"),
			newDayLabel: localizeOrFallback("SW5E.StarshipSheet.RepairNewDayLabel", "Is New Day?"),
			newDayHint: localizeOrFallback(
				"SW5E.StarshipSheet.RepairNewDayHint",
				"Recover limited use abilities which recharge \"per day\"? (Item recovery not yet implemented.)"
			),
			newDay: this.newDay,
			previewHeading: heading,
			previewRows: rows,
			stagedRollCount: this.staged.rolls.length,
			rollLabel: localizeOrFallback("SW5E.StarshipSheet.RepairRollHullDie", "Roll Hull Die"),
			applyLabel: localizeOrFallback("SW5E.StarshipSheet.RepairApplyRecharge", "Apply Recharge"),
			cancelLabel: localizeOrFallback("Cancel", "Cancel")
		};
	}

	_onRender(context, options) {
		super._onRender(context, options);
		applyRepairDialogThemeScope(this);
		const root = this.element instanceof HTMLElement ? this.element : this.element?.[0] ?? null;
		const checkbox = root?.querySelector("input[name='newDay']");
		if ( checkbox ) checkbox.checked = this.newDay;
	}

	static async #onRollHull(_event, _target) {
		const dialog = this;
		const preview = await previewStarshipHullDieRoll(dialog.actor, {
			denomination: getStarshipHullDiceAvailability(dialog.actor, dialog.staged.hullDiceSpent).die,
			stagedHpGain: dialog.staged.hpGain
		});
		if ( !preview ) return;
		dialog.staged.hpGain += preview.hpGain;
		dialog.staged.hullDiceSpent += 1;
		dialog.staged.rolls.push(preview.roll);
		await dialog.render();
	}

	static async #onApply(_event, _target) {
		const dialog = this;
		const checkbox = dialog.element?.querySelector?.("input[name='newDay']");
		dialog.newDay = Boolean(checkbox?.checked);
		try {
			const result = await applyRechargeRepair(dialog.actor, {
				staged: dialog.staged,
				newDay: dialog.newDay,
				chat: true
			});
			dialog.#applied = true;
			dialog.#resolve?.(result);
			await dialog.close();
		} catch ( err ) {
			console.error("SW5E MODULE | Recharge repair failed.", err);
			ui.notifications?.error?.(localizeOrFallback(
				"SW5E.StarshipSheet.RepairApplyFailed",
				"Repair could not be applied."
			));
		}
	}

	static async #onCancel(_event, _target) {
		const dialog = this;
		dialog.#applied = true;
		dialog.#reject?.(new Error("cancelled"));
		await dialog.close();
	}

	async close(options = {}) {
		if ( !this.#applied ) this.#reject?.(new Error("cancelled"));
		return super.close(options);
	}
}

export class StarshipRefittingRepairDialog extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(actor, options = {}) {
		super(options);
		this.actor = actor;
		this.newDay = true;
		this.#applied = false;
		this.#resolve = null;
		this.#reject = null;
	}

	#resolve;
	#reject;
	#applied = false;

	static DEFAULT_OPTIONS = {
		tag: "form",
		classes: [...REPAIR_DIALOG_CLASSES, "refitting-repair"],
		position: REPAIR_DIALOG_POSITION,
		actions: {
			apply: StarshipRefittingRepairDialog.#onApply,
			cancel: StarshipRefittingRepairDialog.#onCancel
		}
	};

	static PARTS = {
		form: {
			template: getModulePath("templates/apps/starship-refitting-repair-dialog.hbs")
		}
	};

	get title() {
		return localizeOrFallback("SW5E.RefittingRepair", "Refitting Repair");
	}

	static open(actor) {
		return new Promise((resolve, reject) => {
			const dialog = new StarshipRefittingRepairDialog(actor);
			dialog.#resolve = resolve;
			dialog.#reject = reject;
			dialog.render(true);
		});
	}

	async _prepareContext() {
		const preview = buildRefittingRepairPreview(this.actor);
		const { heading, rows } = buildPreviewData(preview, { refitting: true });
		return {
			hint: localizeOrFallback(
				"SW5E.StarshipSheet.RefittingRepairHint",
				"On a refitting repair you will recover hull points, your hull dice, and shields."
			),
			newDayLabel: localizeOrFallback("SW5E.StarshipSheet.RepairNewDayLabel", "Is New Day?"),
			newDayHint: localizeOrFallback(
				"SW5E.StarshipSheet.RepairNewDayHint",
				"Recover limited use abilities which recharge \"per day\"? (Item recovery not yet implemented.)"
			),
			newDay: this.newDay,
			previewHeading: heading,
			previewRows: rows,
			applyLabel: localizeOrFallback("SW5E.StarshipSheet.RepairApplyRefitting", "Apply Refitting"),
			cancelLabel: localizeOrFallback("Cancel", "Cancel")
		};
	}

	_onRender(context, options) {
		super._onRender(context, options);
		applyRepairDialogThemeScope(this);
		const root = this.element instanceof HTMLElement ? this.element : this.element?.[0] ?? null;
		const checkbox = root?.querySelector("input[name='newDay']");
		if ( checkbox ) checkbox.checked = this.newDay;
	}

	static async #onApply(_event, _target) {
		const dialog = this;
		const checkbox = dialog.element?.querySelector?.("input[name='newDay']");
		dialog.newDay = Boolean(checkbox?.checked);
		try {
			const result = await applyRefittingRepair(dialog.actor, {
				newDay: dialog.newDay,
				chat: true
			});
			dialog.#applied = true;
			dialog.#resolve?.(result);
			await dialog.close();
		} catch ( err ) {
			console.error("SW5E MODULE | Refitting repair failed.", err);
			ui.notifications?.error?.(localizeOrFallback(
				"SW5E.StarshipSheet.RepairApplyFailed",
				"Repair could not be applied."
			));
		}
	}

	static async #onCancel(_event, _target) {
		const dialog = this;
		dialog.#applied = true;
		dialog.#reject?.(new Error("cancelled"));
		await dialog.close();
	}

	async close(options = {}) {
		if ( !this.#applied ) this.#reject?.(new Error("cancelled"));
		return super.close(options);
	}
}

export async function openRefittingRepairDialog(actor) {
	try {
		return await StarshipRefittingRepairDialog.open(actor);
	} catch {
		return null;
	}
}

export async function openRechargeRepairDialog(actor) {
	try {
		return await StarshipRechargeRepairDialog.open(actor);
	} catch {
		return null;
	}
}
