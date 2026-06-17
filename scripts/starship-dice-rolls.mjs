import {
	buildStarshipLegacyAttributeBatchMirrorUpdate,
	deriveStarshipPools,
	getLegacyStarshipActorSystem
} from "./starship-data.mjs";

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

function findStarshipSizeItem(actor) {
	const items = actor?.items?.contents ?? [];
	return items.find(item => item.type === "starshipsize")
		?? items.find(item => item.flags?.sw5e?.legacyStarshipSize)
		?? items.find(item => item.flags?.sw5e?.starshipCharacter?.role === "classification")
		?? items.find(item => item.type === "feat" && item.system?.advancement?.some?.(a => a.type === "HullPoints"))
		?? null;
}

function getSizeLegacyData(sizeItem) {
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
	const hpMax = Math.max(0, Number(hp.max) || 0);
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
	const newHp = Math.max(0, Number(hp.value) || 0) + preview.hpGain;
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
