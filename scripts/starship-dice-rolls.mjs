import {
	buildStarshipLegacyAttributeBatchMirrorUpdate,
	deriveStarshipPools,
	getLegacyStarshipActorSystem
} from "./starship-data.mjs";
import {
	getStarshipEffectiveHullMax,
	getStarshipEffectiveShieldMax,
	getStarshipEffectiveShieldRegenRateMult
} from "./starship-system-damage.mjs";

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

export function findStarshipSizeItem(actor) {
	const items = actor?.items?.contents ?? [];
	return items.find(item => item.type === "starshipsize")
		?? items.find(item => item.flags?.sw5e?.legacyStarshipSize)
		?? items.find(item => item.flags?.sw5e?.starshipCharacter?.role === "classification")
		?? items.find(item => item.type === "feat" && item.system?.advancement?.some?.(a => a.type === "HullPoints"))
		?? null;
}

export function getSizeLegacyData(sizeItem) {
	return sizeItem?.flags?.sw5e?.legacyStarshipSize ?? {};
}

export function getStarshipLiveHp(actor) {
	return actor?.system?.attributes?.hp ?? {};
}

export function getStarshipShieldDepleted(actor) {
	const flag = actor?.flags?.sw5e?.starship?.shieldDepleted;
	if ( flag === true ) return true;
	if ( flag === false ) return false;
	const hp = getStarshipLiveHp(actor);
	const tempmax = Math.max(0, Number(hp.tempmax) || 0);
	const temp = Math.max(0, Number(hp.temp) || 0);
	return tempmax > 0 && temp <= 0;
}

export async function setStarshipShieldDepleted(actor, depleted) {
	if ( !actor ) return;
	const cur = actor.flags?.sw5e?.starship ?? {};
	await actor.update({
		"flags.sw5e.starship": { ...cur, shieldDepleted: Boolean(depleted) }
	});
}

export function getStarshipHullDiceAvailability(actor, stagedSpent = 0) {
	const pools = deriveStarshipPools(actor);
	const remaining = Math.max(0, (pools.hull?.current ?? 0) - Math.max(0, stagedSpent));
	return {
		die: pools.hull?.die || "d6",
		remaining,
		max: pools.hull?.max ?? 0,
		used: (pools.hull?.max ?? 0) - (pools.hull?.current ?? 0) + Math.max(0, stagedSpent)
	};
}

/**
 * Roll a hull die without persisting — for staged Recharge Repair rolls.
 * @returns {Promise<{ roll: Roll, hpGain: number, total: number }|null>}
 */
export async function previewStarshipHullDieRoll(actor, { denomination, stagedHpGain = 0 } = {}) {
	const pools = deriveStarshipPools(actor);
	const die = denomination || pools.hull?.die;
	if ( !die || die === "d1" ) return null;

	const hp = getStarshipLiveHp(actor);
	const storedHullMax = Math.max(0, Number(hp.max) || 0);
	const hpMax = getStarshipEffectiveHullMax(actor, storedHullMax);
	const hpValue = Math.max(0, Number(hp.value) || 0);
	const headroom = Math.max(0, hpMax - hpValue - Math.max(0, stagedHpGain));
	if ( headroom <= 0 ) {
		ui.notifications?.warn?.(localizeOrFallback(
			"SW5E.StarshipSheet.RepairHullFull",
			"Hull points are already at maximum."
		));
		return null;
	}

	const formula = `max(0, 1${die} + @abilities.con.mod)`;
	const roll = await new Roll(formula, actor?.getRollData?.() ?? {}).evaluate();
	const hpGain = Math.min(headroom, Math.max(0, Math.trunc(roll.total)));
	return { roll, hpGain, total: roll.total, die };
}

/**
 * Spend hull dice and restore hull points (immediate apply).
 */
export async function rollStarshipHullDie(actor, { denomination, chat = true, update = true } = {}) {
	const availability = getStarshipHullDiceAvailability(actor);
	if ( availability.remaining < 1 ) {
		ui.notifications?.warn?.(localizeOrFallback(
			"SW5E.RechargeRepairNoHD",
			"No Hull Dice remaining"
		));
		return null;
	}

	const preview = await previewStarshipHullDieRoll(actor, { denomination: denomination || availability.die });
	if ( !preview || preview.hpGain <= 0 ) return null;

	const flavor = localizeOrFallback("SW5E.HullDiceRoll", "Hull Die Roll");
	if ( chat ) {
		await preview.roll.toMessage({
			speaker: ChatMessage.getSpeaker({ actor }),
			flavor: `${flavor}: ${actor?.name ?? ""}`.trim(),
			flags: { sw5e: { roll: { type: "hullDie" } } }
		});
	}

	if ( !update ) return preview;

	const hp = getStarshipLiveHp(actor);
	const effectiveMax = getStarshipEffectiveHullMax(actor, hp.max);
	const newHp = Math.min(
		effectiveMax > 0 ? effectiveMax : Number.MAX_SAFE_INTEGER,
		Math.max(0, Number(hp.value) || 0) + preview.hpGain
	);
	const sizeItem = findStarshipSizeItem(actor);
	const updates = buildStarshipLegacyAttributeBatchMirrorUpdate([
		["system.attributes.hp.value", newHp]
	]);
	await actor.update(updates);

	if ( sizeItem ) {
		const legacy = { ...getSizeLegacyData(sizeItem) };
		legacy.hullDiceUsed = Math.max(0, (Number(legacy.hullDiceUsed) || 0) + 1);
		await actor.updateEmbeddedDocuments("Item", [{
			_id: sizeItem.id,
			"flags.sw5e.legacyStarshipSize": legacy
		}]);
	}

	return preview;
}

export function buildRecoverStarshipHullDiceItemUpdate(actor) {
	const sizeItem = findStarshipSizeItem(actor);
	if ( !sizeItem ) return { itemUpdates: [], recovered: 0 };
	const legacy = getSizeLegacyData(sizeItem);
	const used = Math.max(0, Number(legacy.hullDiceUsed) || 0);
	if ( used <= 0 ) return { itemUpdates: [], recovered: 0 };
	const next = { ...legacy, hullDiceUsed: 0 };
	return {
		itemUpdates: [{ _id: sizeItem.id, "flags.sw5e.legacyStarshipSize": next }],
		recovered: used
	};
}

export function buildRecoverStarshipShieldDiceItemUpdate(actor) {
	const sizeItem = findStarshipSizeItem(actor);
	if ( !sizeItem ) return { itemUpdates: [], recovered: 0 };
	const legacy = getSizeLegacyData(sizeItem);
	const used = Math.max(0, Number(legacy.shldDiceUsed) || 0);
	if ( used <= 0 ) return { itemUpdates: [], recovered: 0 };
	const next = { ...legacy, shldDiceUsed: 0 };
	return {
		itemUpdates: [{ _id: sizeItem.id, "flags.sw5e.legacyStarshipSize": next }],
		recovered: used
	};
}

export async function recoverStarshipHullDice(actor) {
	const { itemUpdates, recovered } = buildRecoverStarshipHullDiceItemUpdate(actor);
	if ( !itemUpdates.length ) return 0;
	await actor.updateEmbeddedDocuments("Item", itemUpdates);
	return recovered;
}

export async function recoverStarshipShieldDice(actor) {
	const { itemUpdates, recovered } = buildRecoverStarshipShieldDiceItemUpdate(actor);
	if ( !itemUpdates.length ) return 0;
	await actor.updateEmbeddedDocuments("Item", itemUpdates);
	return recovered;
}

export function buildStarshipHullDiceSpendItemUpdate(actor, spendCount) {
	const sizeItem = findStarshipSizeItem(actor);
	if ( !sizeItem || spendCount <= 0 ) return [];
	const legacy = { ...getSizeLegacyData(sizeItem) };
	legacy.hullDiceUsed = Math.max(0, (Number(legacy.hullDiceUsed) || 0) + spendCount);
	return [{ _id: sizeItem.id, "flags.sw5e.legacyStarshipSize": legacy }];
}

export function findEquippedShield(actor) {
	const items = actor?.items?.contents ?? [];
	return items.find(item => {
		const typeVal = item.system?.type?.value ?? item._source?.system?.type?.value;
		const equipped = item.system?.equipped ?? item._source?.system?.equipped;
		return typeVal === "ssshield" && equipped !== false;
	}) ?? null;
}

async function lookupShieldRegenRateFromCompendium(shieldItem) {
	if ( !shieldItem ) return null;

	const compendiumSource = shieldItem._stats?.compendiumSource ?? shieldItem.flags?.core?.sourceId;
	if ( compendiumSource ) {
		try {
			const doc = await fromUuid(compendiumSource);
			const value = parseFloat(doc?.system?.attributes?.regrateco?.value);
			if ( Number.isFinite(value) && value > 0 ) return value;
		} catch {
			// Compendium lookup is best-effort only.
		}
	}

	const name = shieldItem.name;
	if ( !name ) return null;
	const packIds = ["sw5e-module.starships", "sw5e-module.starshiparmor"];
	for ( const packId of packIds ) {
		const pack = game.packs.get(packId);
		if ( !pack ) continue;
		try {
			const index = await pack.getIndex({
				fields: ["system.attributes.regrateco.value", "name"]
			});
			const indexEntry = index.find(entry => entry.name === name);
			const value = parseFloat(indexEntry?.system?.attributes?.regrateco?.value);
			if ( Number.isFinite(value) && value > 0 ) return value;
		} catch {
			// Continue to next pack.
		}
	}

	return null;
}

/** Upstream natural regen uses equipped shield `regrateco` → `@attributes.equip.shields.regenRateMult`. */
export async function getStarshipShieldRegenRateMult(actor) {
	const shield = findEquippedShield(actor);
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const candidates = [
		shield?.system?.attributes?.regrateco?.value,
		shield?._source?.system?.attributes?.regrateco?.value,
		shield?.flags?.sw5e?.legacyStarshipEquipment?.attributes?.regrateco?.value,
		legacySystem?.attributes?.equip?.shields?.regenRateMult
	];
	for ( const candidate of candidates ) {
		const value = parseFloat(candidate);
		if ( Number.isFinite(value) && value > 0 ) return value;
	}

	const compendiumSource = shield?._stats?.compendiumSource ?? shield?.flags?.core?.sourceId;
	if ( compendiumSource || shield?.name ) {
		const fromPack = await lookupShieldRegenRateFromCompendium(shield);
		if ( Number.isFinite(fromPack) && fromPack > 0 ) return fromPack;
	}

	return null;
}

export function getStarshipShieldRegenRateMultSync(actor) {
	const shield = findEquippedShield(actor);
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const candidates = [
		shield?.system?.attributes?.regrateco?.value,
		shield?._source?.system?.attributes?.regrateco?.value,
		shield?.flags?.sw5e?.legacyStarshipEquipment?.attributes?.regrateco?.value,
		legacySystem?.attributes?.equip?.shields?.regenRateMult
	];
	for ( const candidate of candidates ) {
		const value = parseFloat(candidate);
		if ( Number.isFinite(value) && value > 0 ) return value;
	}
	return null;
}

export function getStarshipShieldDiceAvailability(actor) {
	const pools = deriveStarshipPools(actor);
	const remaining = Math.max(0, pools.shld?.current ?? 0);
	return {
		die: pools.shld?.die || "d6",
		remaining,
		max: pools.shld?.max ?? 0
	};
}

export function getStarshipShieldExpendDisabledReason(actor) {
	if ( getStarshipShieldDepleted(actor) ) {
		return localizeOrFallback(
			"SW5E.ShieldDepletedWarn",
			"{name} Shields are Depleted, you need to repair them before you can regenerate them.",
			{ name: actor?.name ?? "" }
		);
	}
	const hp = getStarshipLiveHp(actor);
	const temp = Math.max(0, Number(hp.temp) || 0);
	const storedTempmax = Math.max(0, Number(hp.tempmax) || 0);
	const effectiveTempmax = getStarshipEffectiveShieldMax(actor, storedTempmax);
	if ( effectiveTempmax > 0 && temp >= effectiveTempmax ) {
		return localizeOrFallback(
			"SW5E.ShieldFullWarn",
			"{name} Shields are full, regeneration is not necessary.",
			{ name: actor?.name ?? "" }
		);
	}
	const availability = getStarshipShieldDiceAvailability(actor);
	if ( availability.remaining < 1 ) {
		return localizeOrFallback(
			"SW5E.ShieldDiceWarn",
			"{name} has no available {formula} Shield Dice remaining!",
			{ name: actor?.name ?? "", formula: availability.die }
		);
	}
	return null;
}

export function canExpendStarshipShieldDieForRegen(actor) {
	if ( getStarshipShieldExpendDisabledReason(actor) ) return false;
	const regenMult = getStarshipShieldRegenRateMultSync(actor);
	return Number.isFinite(regenMult) && regenMult > 0;
}

export function buildStarshipShieldDiceSpendItemUpdate(actor, spendCount = 1) {
	const sizeItem = findStarshipSizeItem(actor);
	if ( !sizeItem || spendCount <= 0 ) return [];
	const legacy = { ...getSizeLegacyData(sizeItem) };
	legacy.shldDiceUsed = Math.max(0, (Number(legacy.shldDiceUsed) || 0) + spendCount);
	return [{ _id: sizeItem.id, "flags.sw5e.legacyStarshipSize": legacy }];
}

function buildNaturalShieldDieRollData(actor, { denomination, regenMult } = {}) {
	const availability = getStarshipShieldDiceAvailability(actor);
	const die = denomination || availability.die;
	const resolvedMult = regenMult ?? getStarshipShieldRegenRateMultSync(actor);
	if ( !resolvedMult ) return { error: "noRegenMult", die };

	const dieFace = String(die).replace(/^d/i, "");
	const formula = `${dieFace} * @attributes.equip.shields.regenRateMult`;
	const rollData = actor?.getRollData?.() ?? {};
	rollData.attributes ??= {};
	rollData.attributes.equip ??= {};
	rollData.attributes.equip.shields ??= {};
	rollData.attributes.equip.shields.regenRateMult = resolvedMult;
	return { formula, rollData, die, regenMult: resolvedMult };
}

/**
 * Roll natural shield regen without persisting (upstream `rollShieldDie({ natural: true })` formula).
 * @returns {Promise<{ roll: Roll, spGain: number, total: number, die: string }|{ error: string }|null>}
 */
export async function previewStarshipNaturalShieldDieRoll(actor) {
	if ( getStarshipShieldExpendDisabledReason(actor) ) return null;

	const regenMult = getStarshipEffectiveShieldRegenRateMult(
		actor,
		await getStarshipShieldRegenRateMult(actor)
	);
	if ( !regenMult ) return { error: "noRegenMult" };

	const rollConfig = buildNaturalShieldDieRollData(actor, { regenMult });
	if ( rollConfig.error ) return rollConfig;

	const hp = getStarshipLiveHp(actor);
	const effectiveTempmax = getStarshipEffectiveShieldMax(actor, hp.tempmax);
	const headroom = Math.max(
		0,
		effectiveTempmax - Math.max(0, Number(hp.temp) || 0)
	);
	if ( headroom <= 0 ) return null;

	const roll = await new Roll(rollConfig.formula, rollConfig.rollData).evaluate();
	const spGain = Math.min(headroom, Math.max(0, Math.trunc(roll.total)));
	return { roll, spGain, total: roll.total, die: rollConfig.die };
}

/** Spend one shield die and recover shield points using the natural regen formula. */
export async function applyStarshipNaturalShieldDieRoll(actor, { chat = true } = {}) {
	const disabledReason = getStarshipShieldExpendDisabledReason(actor);
	if ( disabledReason ) {
		ui.notifications?.warn?.(disabledReason);
		return null;
	}
	const regenMult = getStarshipEffectiveShieldRegenRateMult(
		actor,
		await getStarshipShieldRegenRateMult(actor)
	);
	if ( !regenMult ) {
		ui.notifications?.warn?.(localizeOrFallback(
			"SW5E.StarshipSheet.RegenNoShieldRegenData",
			"Shield regeneration data is unavailable — equip a shield with a regeneration coefficient."
		));
		return { error: "noRegenMult" };
	}

	const preview = await previewStarshipNaturalShieldDieRoll(actor);
	if ( !preview || preview.error || preview.spGain <= 0 ) return preview;

	const hp = getStarshipLiveHp(actor);
	const effectiveMax = getStarshipEffectiveShieldMax(actor, hp.tempmax);
	const newTemp = Math.min(
		effectiveMax > 0 ? effectiveMax : Number.MAX_SAFE_INTEGER,
		Math.max(0, Number(hp.temp) || 0) + preview.spGain
	);
	await actor.update({ "system.attributes.hp.temp": newTemp });

	const itemUpdates = buildStarshipShieldDiceSpendItemUpdate(actor, 1);
	if ( itemUpdates.length ) await actor.updateEmbeddedDocuments("Item", itemUpdates);

	if ( chat ) {
		const flavor = localizeOrFallback("SW5E.ShieldDiceRoll", "Roll Shield Dice");
		await preview.roll.toMessage({
			speaker: ChatMessage.getSpeaker({ actor }),
			flavor: `${flavor}: ${actor?.name ?? ""}`.trim(),
			flags: { sw5e: { roll: { type: "shieldDie" } } }
		});
	}

	return preview;
}
