import { getModulePath } from "./module-support.mjs";
import {
	STARSHIP_POWER_DIE_SLOTS,
	buildStarshipLegacyAttributeBatchMirrorUpdate,
	deriveStarshipPools,
	getLegacyStarshipActorSystem,
	getStarshipPowerRecoverySlots,
	resolveStarshipPowerSlotAllocationMax
} from "./starship-data.mjs";
import { recoverStarshipPowerDice } from "./starship-power-recovery.mjs";
import {
	getStarshipEffectiveHullMax,
	getStarshipEffectiveShieldMax,
	getStarshipSystemDamageLevel,
	reduceStarshipSystemDamageLevel
} from "./starship-system-damage.mjs";
import { resetStarshipDestructionSaves } from "./starship-destruction-saves.mjs";
import {
	applyStarshipNaturalShieldDieRoll,
	buildRecoverStarshipHullDiceItemUpdate,
	buildRecoverStarshipShieldDiceItemUpdate,
	buildStarshipHullDiceSpendItemUpdate,
	getStarshipHullDiceAvailability,
	getStarshipLiveHp,
	getStarshipShieldDepleted,
	getStarshipShieldExpendDisabledReason,
	getStarshipShieldRegenRateMult,
	previewStarshipHullDieRoll,
	setStarshipShieldDepleted
} from "./starship-dice-rolls.mjs";

const Dialog5e = dnd5e.applications.api.Dialog5e;
const { BooleanField } = foundry.data.fields;

const REPAIR_DIALOG_WIDTH = 380;

function localizeOrFallback(key, fallback, data = {}) {
	const localized = game?.i18n?.localize?.(key);
	const text = (localized && localized !== key) ? localized : fallback;
	return Object.entries(data).reduce(
		(result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
		text
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

function buildRepairNewDayFields(context, { value = false } = {}) {
	return [{
		field: new BooleanField({
			label: game?.i18n?.localize?.("DND5E.REST.NewDay.Label") ?? "New Day",
			hint: game?.i18n?.localize?.("DND5E.REST.NewDay.Hint")
				?? "Recover limited use abilities which recharge at dusk, dawn, or on a new day."
		}),
		input: context.inputs.createCheckboxInput,
		name: "newDay",
		value
	}];
}

function buildRepairApplyButton(applyLabel, applyIcon = "fa-solid fa-wrench") {
	return [{
		default: true,
		icon: applyIcon,
		label: applyLabel,
		name: "apply",
		type: "submit"
	}];
}

/** Read repair dialog checkbox state without mutating Foundry's form submission object. */
function parseRepairFormSubmission(formData) {
	const raw = formData?.object ?? {};
	return {
		newDay: Boolean(raw.newDay),
		autoHD: Boolean(raw.autoHD)
	};
}

function parseRefittingFormSubmission(formData) {
	const raw = formData?.object ?? {};
	return {
		newDay: Boolean(raw.newDay),
		reduceSystemDamage: Boolean(raw.reduceSystemDamage)
	};
}

function buildHullDiceOptions(availability) {
	const number = Math.max(0, availability.remaining);
	const die = availability.die || "d6";
	const availableLabel = game?.i18n?.format?.("DND5E.HITDICE.Available", { number });
	return [{
		value: die,
		label: (availableLabel && availableLabel !== "DND5E.HITDICE.Available")
			? `${die} (${availableLabel})`
			: `${die} (${number} available)`
	}];
}

async function autoStageHullDice(actor, staged) {
	while ( true ) {
		const availability = getStarshipHullDiceAvailability(actor, staged.hullDiceSpent);
		if ( availability.remaining <= 0 ) break;

		const hp = getStarshipLiveHp(actor);
		const hullMax = getStarshipEffectiveHullMax(actor, hp.max);
		const hullValue = Math.max(0, Number(hp.value) || 0);
		if ( hullValue + staged.hpGain >= hullMax ) break;

		const preview = await previewStarshipHullDieRoll(actor, {
			denomination: availability.die,
			stagedHpGain: staged.hpGain
		});
		if ( !preview || preview.hpGain <= 0 ) break;

		staged.hpGain += preview.hpGain;
		staged.hullDiceSpent += 1;
		staged.rolls.push(preview.roll);
	}
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

function getStoredShieldCapacity(actor) {
	const hp = getStarshipLiveHp(actor);
	return Math.max(0, Number(hp.tempmax) || 0);
}

function getShieldCapacity(actor, systemDamageLevel) {
	return getStarshipEffectiveShieldMax(actor, getStoredShieldCapacity(actor), systemDamageLevel);
}

function getHullCapacity(actor, systemDamageLevel) {
	const hp = getStarshipLiveHp(actor);
	return getStarshipEffectiveHullMax(actor, Math.max(0, Number(hp.max) || 0), systemDamageLevel);
}

export function buildRechargeRepairPreview(actor, staged = {}) {
	const hp = getStarshipLiveHp(actor);
	const pools = deriveStarshipPools(actor);
	const stagedHp = Math.max(0, Number(staged.hpGain) || 0);
	const stagedSpent = Math.max(0, Number(staged.hullDiceSpent) || 0);
	const hullValue = Math.max(0, Number(hp.value) || 0);
	const hullMax = getHullCapacity(actor);
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

export function buildRefittingRepairPreview(actor, { reduceSystemDamage = false } = {}) {
	const hp = getStarshipLiveHp(actor);
	const pools = deriveStarshipPools(actor);
	const systemDamageBefore = getStarshipSystemDamageLevel(actor);
	const finalSystemDamage = reduceSystemDamage && systemDamageBefore > 0
		? systemDamageBefore - 1
		: systemDamageBefore;
	const hullValue = Math.max(0, Number(hp.value) || 0);
	const hullMax = getHullCapacity(actor, finalSystemDamage);
	const shieldValue = Math.max(0, Number(hp.temp) || 0);
	const shieldMax = getShieldCapacity(actor, finalSystemDamage);
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
	const {
		hullPointsGained = 0,
		hullDiceSpent = 0,
		hullDiceRecovered = 0,
		shieldPointsGained = 0,
		shieldDiceRecovered = 0,
		systemDamageBefore = 0,
		systemDamageAfter = 0
	} = result;
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
	let content = localizeOrFallback(messageKey, "{name} completes a repair.", formatArgs);
	if ( refitting && systemDamageAfter < systemDamageBefore ) {
		content += `<p>${localizeOrFallback(
			"SW5E.StarshipSheet.RefittingSystemDamageReduced",
			"System Damage reduced: {before} → {after}",
			{ before: systemDamageBefore, after: systemDamageAfter }
		)}</p>`;
	}
	await ChatMessage.create({
		user: game.user.id,
		speaker: ChatMessage.getSpeaker({ actor }),
		flavor: localizeOrFallback(flavorKey, refitting ? "Refitting Repair (8 hours)" : "Recharge Repair (1 hour)"),
		content
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
		const effectiveHullMax = getHullCapacity(actor);
		actorEntries.push(["system.attributes.hp.value", Math.min(
			effectiveHullMax,
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
	await resetStarshipDestructionSaves(actor);

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

export async function applyRefittingRepair(actor, { newDay = true, reduceSystemDamage = false, chat = true } = {}) {
	if ( !actor ) return null;
	const systemDamageBefore = getStarshipSystemDamageLevel(actor);

	let systemDamageAfter = systemDamageBefore;
	if ( reduceSystemDamage && systemDamageBefore > 0 ) {
		const reduction = await reduceStarshipSystemDamageLevel(actor, 1);
		systemDamageAfter = reduction.after;
	}

	const hp = getStarshipLiveHp(actor);
	const hullMax = getHullCapacity(actor, systemDamageAfter);
	const shieldMax = getShieldCapacity(actor, systemDamageAfter);
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
	await resetStarshipDestructionSaves(actor);

	const result = {
		hullPointsGained: Math.max(0, hullMax - hullBefore),
		hullDiceSpent: 0,
		hullDiceRecovered: hullRecovery.recovered,
		shieldPointsGained: Math.max(0, shieldMax - shieldBefore),
		shieldDiceRecovered: shieldRecovery.recovered,
		systemDamageBefore,
		systemDamageAfter,
		newDay
	};

	if ( chat ) await postRepairChatMessage(actor, { refitting: true, result });
	return result;
}

export class StarshipRechargeRepairDialog extends Dialog5e {
	constructor(options = {}) {
		super(options);
		this.actor = options.actor;
		this.staged = { hpGain: 0, hullDiceSpent: 0, rolls: [] };
		this.newDay = false;
		this.autoHD = false;
		this.#denom = null;
		this.#applied = false;
		this.#result = null;
		this.#resolve = null;
		this.#reject = null;
	}

	#denom;
	#resolve;
	#reject;
	#applied = false;
	#result = null;

	static DEFAULT_OPTIONS = {
		classes: ["rest", "starship-repair", "recharge-repair"],
		position: { width: REPAIR_DIALOG_WIDTH },
		actions: {
			rollHull: StarshipRechargeRepairDialog.#onRollHull
		},
		form: {
			handler: StarshipRechargeRepairDialog.#handleFormSubmission
		},
		window: {
			title: "SW5E.RechargeRepair",
			minimizable: false
		}
	};

	static PARTS = {
		...super.PARTS,
		content: {
			template: getModulePath("templates/apps/starship-recharge-repair-dialog.hbs")
		}
	};

	static open(actor) {
		return new Promise((resolve, reject) => {
			const dialog = new StarshipRechargeRepairDialog({
				actor,
				buttons: buildRepairApplyButton(
					localizeOrFallback("SW5E.StarshipSheet.RepairApplyRecharge", "Apply Recharge")
				)
			});
			dialog.#resolve = resolve;
			dialog.#reject = reject;
			dialog.addEventListener("close", () => {
				if ( dialog.#applied ) dialog.#resolve?.(dialog.#result);
				else dialog.#reject?.(new Error("cancelled"));
			}, { once: true });
			dialog.render({ force: true });
		});
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const availability = getStarshipHullDiceAvailability(this.actor, this.staged.hullDiceSpent);
		context.config = {
			newDay: this.newDay,
			autoHD: this.autoHD
		};
		context.hint = localizeOrFallback(
			"SW5E.RechargeRepairHint",
			"On a recharge repair you may spend remaining Hull Dice and recover Shields."
		);
		context.fields = buildRepairNewDayFields(context, { value: this.newDay });
		context.hullDice = {
			canRoll: availability.remaining > 0,
			denomination: this.#denom ?? availability.die,
			options: buildHullDiceOptions(availability)
		};
		context.autoSpendField = new BooleanField({
			label: localizeOrFallback(
				"SW5E.StarshipSheet.RepairAutoSpendHD.Label",
				"Auto Spend Hull Dice"
			),
			hint: localizeOrFallback(
				"SW5E.StarshipSheet.RepairAutoSpendHD.Hint",
				"Automatically spend hull dice until they run out or health is full."
			)
		});
		return context;
	}

	static async #onRollHull(_event, _target) {
		const dialog = this;
		dialog.#denom = dialog.form?.denom?.value;
		const availability = getStarshipHullDiceAvailability(dialog.actor, dialog.staged.hullDiceSpent);
		const preview = await previewStarshipHullDieRoll(dialog.actor, {
			denomination: dialog.#denom || availability.die,
			stagedHpGain: dialog.staged.hpGain
		});
		if ( !preview ) return;
		dialog.staged.hpGain += preview.hpGain;
		dialog.staged.hullDiceSpent += 1;
		dialog.staged.rolls.push(preview.roll);
		const formData = new foundry.applications.ux.FormDataExtended(dialog.form);
		const { newDay, autoHD } = parseRepairFormSubmission(formData);
		dialog.newDay = newDay;
		dialog.autoHD = autoHD;
		await dialog.render();
	}

	static async #handleFormSubmission(_event, _form, formData) {
		const dialog = this;
		const { newDay, autoHD } = parseRepairFormSubmission(formData);
		dialog.newDay = newDay;
		dialog.autoHD = autoHD;
		if ( autoHD ) await autoStageHullDice(dialog.actor, dialog.staged);
		try {
			dialog.#result = await applyRechargeRepair(dialog.actor, {
				staged: dialog.staged,
				newDay,
				chat: true
			});
			dialog.#applied = true;
			await dialog.close();
		} catch ( err ) {
			console.error("SW5E MODULE | Recharge repair failed.", err);
			ui.notifications?.error?.(localizeOrFallback(
				"SW5E.StarshipSheet.RepairApplyFailed",
				"Repair could not be applied."
			));
		}
	}
}

export class StarshipRefittingRepairDialog extends Dialog5e {
	constructor(options = {}) {
		super(options);
		this.actor = options.actor;
		this.newDay = true;
		this.reduceSystemDamage = false;
		this.#applied = false;
		this.#result = null;
		this.#resolve = null;
		this.#reject = null;
	}

	#resolve;
	#reject;
	#applied = false;
	#result = null;
	#reduceDefaultSet = false;

	static DEFAULT_OPTIONS = {
		classes: ["rest", "starship-repair", "refitting-repair"],
		position: { width: REPAIR_DIALOG_WIDTH },
		form: {
			handler: StarshipRefittingRepairDialog.#handleFormSubmission
		},
		window: {
			title: "SW5E.RefittingRepair",
			minimizable: false
		}
	};

	static PARTS = {
		...super.PARTS,
		content: {
			template: getModulePath("templates/apps/starship-refitting-repair-dialog.hbs")
		}
	};

	static open(actor) {
		return new Promise((resolve, reject) => {
			const dialog = new StarshipRefittingRepairDialog({
				actor,
				buttons: buildRepairApplyButton(
					localizeOrFallback("SW5E.StarshipSheet.RepairApplyRefitting", "Apply Refitting")
				)
			});
			dialog.#resolve = resolve;
			dialog.#reject = reject;
			dialog.addEventListener("close", () => {
				if ( dialog.#applied ) dialog.#resolve?.(dialog.#result);
				else dialog.#reject?.(new Error("cancelled"));
			}, { once: true });
			dialog.render({ force: true });
		});
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const systemDamageLevel = getStarshipSystemDamageLevel(this.actor);
		const canReduceSystemDamage = systemDamageLevel > 0;

		if ( canReduceSystemDamage && !this.#reduceDefaultSet ) {
			this.reduceSystemDamage = true;
			this.#reduceDefaultSet = true;
		}

		context.config = {
			newDay: this.newDay,
			reduceSystemDamage: canReduceSystemDamage ? this.reduceSystemDamage : false
		};
		context.hint = localizeOrFallback(
			"SW5E.StarshipSheet.RefittingRepairHint",
			"On a refitting repair you will recover hull points, your hull dice, and shields."
		);
		context.fields = buildRepairNewDayFields(context, { value: this.newDay });
		context.canReduceSystemDamage = canReduceSystemDamage;
		context.reduceSystemDamageField = new BooleanField({
			label: localizeOrFallback(
				"SW5E.StarshipSheet.RefittingReduceSystemDamage.Label",
				"Reduce System Damage"
			),
			hint: localizeOrFallback(
				"SW5E.StarshipSheet.RefittingReduceSystemDamage.Hint",
				"Finishing maintenance reduces System Damage by 1."
			)
		});
		return context;
	}

	static async #handleFormSubmission(_event, _form, formData) {
		const dialog = this;
		const { newDay, reduceSystemDamage } = parseRefittingFormSubmission(formData);
		const canReduce = getStarshipSystemDamageLevel(dialog.actor) > 0;
		try {
			dialog.#result = await applyRefittingRepair(dialog.actor, {
				newDay,
				reduceSystemDamage: canReduce && reduceSystemDamage,
				chat: true
			});
			dialog.#applied = true;
			await dialog.close();
		} catch ( err ) {
			console.error("SW5E MODULE | Refitting repair failed.", err);
			ui.notifications?.error?.(localizeOrFallback(
				"SW5E.StarshipSheet.RepairApplyFailed",
				"Repair could not be applied."
			));
		}
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

function sumPowerSlotValues(slots = []) {
	return slots.reduce((sum, slot) => sum + Math.max(0, Number(slot?.value) || 0), 0);
}

async function postRegenChatMessage(actor, { shieldDieSpent = false, shieldPointsGained = 0, powerDiceRecovered = 0 } = {}) {
	if ( !shieldDieSpent && powerDiceRecovered <= 0 ) return;

	let messageKey = "SW5E.RegenRepairResult";
	if ( shieldDieSpent && shieldPointsGained > 0 ) messageKey += "S";
	if ( powerDiceRecovered > 0 ) messageKey += "P";

	await ChatMessage.create({
		user: game.user.id,
		speaker: ChatMessage.getSpeaker({ actor }),
		flavor: localizeOrFallback("SW5E.RegenRepair", "Starship Regen"),
		content: localizeOrFallback(messageKey, "{name} regenerates.", {
			name: actor.name,
			shieldPoints: shieldPointsGained,
			powerDice: powerDiceRecovered
		})
	});
}

export async function applyRegenRepair(actor, { useShieldDie = false, chat = true } = {}) {
	if ( !actor ) return null;

	let shieldPointsGained = 0;
	let shieldDieSpent = false;

	if ( useShieldDie ) {
		const shieldResult = await applyStarshipNaturalShieldDieRoll(actor, { chat: true });
		if ( shieldResult && !shieldResult.error && shieldResult.spGain > 0 ) {
			shieldPointsGained = shieldResult.spGain;
			shieldDieSpent = true;
		}
	}

	const slotsBefore = getStarshipPowerRecoverySlots(actor);
	const powerBeforeTotal = sumPowerSlotValues(slotsBefore);
	let powerDiceRecovered = 0;

	const powerRecovered = await recoverStarshipPowerDice(actor);
	if ( powerRecovered ) {
		const slotsAfter = getStarshipPowerRecoverySlots(actor);
		powerDiceRecovered = Math.max(0, sumPowerSlotValues(slotsAfter) - powerBeforeTotal);
	}

	const result = {
		shieldPointsGained,
		shieldDieSpent,
		powerDiceRecovered
	};

	if ( chat ) await postRegenChatMessage(actor, result);
	return result;
}

export class StarshipRegenRepairDialog extends Dialog5e {
	constructor(options = {}) {
		super(options);
		this.actor = options.actor;
		this.expendShieldDie = Boolean(options.expendShieldDie);
		this.#applied = false;
		this.#result = null;
		this.#resolve = null;
		this.#reject = null;
	}

	#resolve;
	#reject;
	#applied = false;
	#result = null;
	#expendDefaultSet = false;

	static DEFAULT_OPTIONS = {
		classes: ["rest", "starship-repair", "regen-repair"],
		position: { width: REPAIR_DIALOG_WIDTH },
		form: {
			handler: StarshipRegenRepairDialog.#handleFormSubmission
		},
		window: {
			title: "SW5E.RegenRepair",
			minimizable: false
		}
	};

	static PARTS = {
		...super.PARTS,
		content: {
			template: getModulePath("templates/apps/starship-regen-repair-dialog.hbs")
		}
	};

	static open(actor) {
		return new Promise((resolve, reject) => {
			const dialog = new StarshipRegenRepairDialog({
				actor,
				expendShieldDie: false,
				buttons: buildRepairApplyButton(
					localizeOrFallback("SW5E.StarshipSheet.RepairApplyRegen", "Apply Regen"),
					"fa-solid fa-bolt"
				)
			});
			dialog.#resolve = resolve;
			dialog.#reject = reject;
			dialog.addEventListener("close", () => {
				if ( dialog.#applied ) dialog.#resolve?.(dialog.#result);
				else dialog.#reject?.(new Error("cancelled"));
			}, { once: true });
			dialog.render({ force: true });
		});
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const disabledReason = getStarshipShieldExpendDisabledReason(this.actor);
		const regenMult = await getStarshipShieldRegenRateMult(this.actor);
		const hasRegenData = Number.isFinite(regenMult) && regenMult > 0;
		const canExpend = !disabledReason && hasRegenData;

		if ( canExpend && !this.#expendDefaultSet ) {
			this.expendShieldDie = true;
			this.#expendDefaultSet = true;
		}

		context.hint = localizeOrFallback(
			"SW5E.RegenRepairHint",
			"At the beginning of its turn, the starship can expend a shield die to recover shield points, and automatically recovers power dice."
		);
		context.canExpendShieldDie = canExpend;
		context.expendShieldDieDisabledReason = !hasRegenData
			? localizeOrFallback(
				"SW5E.StarshipSheet.RegenNoShieldRegenData",
				"Shield regeneration data is unavailable — equip a shield with a regeneration coefficient."
			)
			: disabledReason;
		context.config = { expendShieldDie: canExpend ? this.expendShieldDie : false };
		context.expendShieldDieField = new BooleanField({
			label: localizeOrFallback(
				"SW5E.StarshipSheet.RegenExpendShieldDie.Label",
				"Expend Shield Die"
			),
			hint: localizeOrFallback(
				"SW5E.StarshipSheet.RegenExpendShieldDie.Hint",
				"Recover shield points by expending a Shield Die."
			),
			disabled: !canExpend
		});
		context.powerRecoveryHint = localizeOrFallback(
			"SW5E.StarshipSheet.RegenPowerRecoveryHint",
			"Power dice recovery will also be resolved."
		);
		return context;
	}

	static async #handleFormSubmission(_event, _form, formData) {
		const dialog = this;
		const raw = formData?.object ?? {};
		const disabledReason = getStarshipShieldExpendDisabledReason(dialog.actor);
		const regenMult = await getStarshipShieldRegenRateMult(dialog.actor);
		const canExpend = !disabledReason && Number.isFinite(regenMult) && regenMult > 0;
		const useShieldDie = canExpend && Boolean(raw.expendShieldDie);
		try {
			dialog.#result = await applyRegenRepair(dialog.actor, {
				useShieldDie,
				chat: true
			});
			dialog.#applied = true;
			await dialog.close();
		} catch ( err ) {
			console.error("SW5E MODULE | Regen repair failed.", err);
			ui.notifications?.error?.(localizeOrFallback(
				"SW5E.StarshipSheet.RepairApplyFailed",
				"Repair could not be applied."
			));
		}
	}
}

export async function openRegenRepairDialog(actor) {
	try {
		return await StarshipRegenRepairDialog.open(actor);
	} catch {
		return null;
	}
}
