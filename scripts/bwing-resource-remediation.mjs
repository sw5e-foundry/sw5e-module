/**
 * Exact Drake B-Wing resource remediation (MIG-V14-BWING-RESOURCES-01).
 */

import { buildStarshipLegacyAttributeMirrorUpdate } from "./starship-data.mjs";
import {
	AUTO_THRUSTERS_CANONICAL_EFFECT_ID,
	AUTO_THRUSTERS_CANONICAL_ITEM_PROVENANCE,
	getItemProvenance,
	isStarshipActor
} from "./auto-thrusters-remediation.mjs";

export const BWING_ACTOR_COMPENDIUM_PROVENANCE = "Compendium.sw5e-module.drakes-shipyard.Actor.Y0Vf2Yi6pPQjliD1";
export const BWING_SIZE_ITEM_ID = "J21aRoIuOC8ne2Zx";
export const BWING_SIZE_ITEM_PROVENANCE = "Compendium.sw5e-module.starships.6BN8l5E8QtYt103T";
export const BWING_AUTO_THRUSTERS_ITEM_ID = "bYUvLvm9ant0G9t7";
export const BWING_CANONICAL_HULL = { value: 44, max: 44 };
export const BWING_CANONICAL_SHIELDS = { temp: 75, tempmax: 75 };

const PRE_DND5E_TUPLE = Object.freeze({ value: 38, max: 0, temp: 57, tempmax: null });
const POST_DND5E_TUPLE = Object.freeze({ value: 0, max: 0, temp: 57, tempmax: 0 });

function readHp(actor) {
	const top = actor?._source?.system?.attributes?.hp ?? actor?.system?.attributes?.hp ?? {};
	const legacy = actor?._source?.flags?.sw5e?.legacyStarshipActor?.system?.attributes?.hp
		?? actor?.flags?.sw5e?.legacyStarshipActor?.system?.attributes?.hp
		?? {};
	return { top, legacy };
}

function hpMatchesTuple(hp, tuple) {
	const norm = key => {
		const value = hp?.[key];
		if ( value === null || value === undefined ) return null;
		return Number(value);
	};
	return norm("value") === tuple.value
		&& norm("max") === tuple.max
		&& norm("temp") === tuple.temp
		&& norm("tempmax") === tuple.tempmax;
}

function getSizeLegacy(item) {
	return item?.flags?.sw5e?.legacyStarshipSize
		?? item?._source?.flags?.sw5e?.legacyStarshipSize
		?? null;
}

/**
 * @param {object} actor
 * @returns {object}
 */
export function inspectBwingResourceCandidate(actor) {
	const result = {
		classification: "NOT_BWING",
		actorId: actor?.id ?? actor?._id ?? null,
		actorUuid: actor?.uuid ?? null,
		ambiguousReason: null,
		needsUpdate: false,
		alreadyCanonical: false,
		historicalTuple: null
	};

	if ( !isStarshipActor(actor) ) return result;
	const provenance = actor._stats?.compendiumSource ?? actor._source?._stats?.compendiumSource ?? null;
	if ( provenance !== BWING_ACTOR_COMPENDIUM_PROVENANCE ) return result;

	const sizeItem = actor.items?.get?.(BWING_SIZE_ITEM_ID);
	const autoItem = actor.items?.get?.(BWING_AUTO_THRUSTERS_ITEM_ID);
	if ( !sizeItem || !autoItem ) {
		result.classification = "RESOURCE_AMBIGUOUS";
		result.ambiguousReason = "missing-required-items";
		return result;
	}
	if ( getItemProvenance(sizeItem) !== BWING_SIZE_ITEM_PROVENANCE ) {
		result.classification = "RESOURCE_AMBIGUOUS";
		result.ambiguousReason = "size-item-provenance";
		return result;
	}
	if ( getItemProvenance(autoItem) !== AUTO_THRUSTERS_CANONICAL_ITEM_PROVENANCE ) {
		result.classification = "RESOURCE_AMBIGUOUS";
		result.ambiguousReason = "auto-thrusters-provenance";
		return result;
	}
	const autoEffect = autoItem.effects?.get?.(AUTO_THRUSTERS_CANONICAL_EFFECT_ID);
	if ( !autoEffect ) {
		result.classification = "RESOURCE_AMBIGUOUS";
		result.ambiguousReason = "missing-auto-thrusters-effect";
		return result;
	}

	const sizeLegacy = getSizeLegacy(sizeItem);
	if ( sizeLegacy?.size !== "sm" || Number(sizeLegacy?.tier) !== 3 ) {
		result.classification = "RESOURCE_AMBIGUOUS";
		result.ambiguousReason = "size-tier-fingerprint";
		return result;
	}
	if ( sizeLegacy?.hullDice !== "d6" || sizeLegacy?.shldDice !== "d6" ) {
		result.classification = "RESOURCE_AMBIGUOUS";
		result.ambiguousReason = "dice-fingerprint";
		return result;
	}

	const { top, legacy } = readHp(actor);
	if ( !((top.value === legacy.value) && (top.max === legacy.max) && (top.temp === legacy.temp) && (top.tempmax === legacy.tempmax)) ) {
		result.classification = "RESOURCE_AMBIGUOUS";
		result.ambiguousReason = "top-level-legacy-mismatch";
		return result;
	}

	const canonicalTuple = {
		value: BWING_CANONICAL_HULL.value,
		max: BWING_CANONICAL_HULL.max,
		temp: BWING_CANONICAL_SHIELDS.temp,
		tempmax: BWING_CANONICAL_SHIELDS.tempmax
	};
	const pre = hpMatchesTuple(top, PRE_DND5E_TUPLE) && hpMatchesTuple(legacy, PRE_DND5E_TUPLE);
	const post = hpMatchesTuple(top, POST_DND5E_TUPLE) && hpMatchesTuple(legacy, POST_DND5E_TUPLE);
	const canonical = hpMatchesTuple(top, canonicalTuple) && hpMatchesTuple(legacy, canonicalTuple);

	if ( canonical ) {
		result.classification = "ALREADY_CANONICAL";
		result.alreadyCanonical = true;
		result.needsUpdate = false;
		result.historicalTuple = "canonical";
		return result;
	}
	if ( !pre && !post ) {
		result.classification = "RESOURCE_AMBIGUOUS";
		result.ambiguousReason = "resource-tuple";
		return result;
	}

	result.classification = "MATCHED";
	result.historicalTuple = pre ? "pre-dnd5e" : "post-dnd5e";
	result.alreadyCanonical = false;
	result.needsUpdate = true;
	return result;
}

/**
 * @returns {object}
 */
export function buildBwingCanonicalResourceUpdate() {
	const hp = {
		value: BWING_CANONICAL_HULL.value,
		max: BWING_CANONICAL_HULL.max,
		temp: BWING_CANONICAL_SHIELDS.temp,
		tempmax: BWING_CANONICAL_SHIELDS.tempmax
	};
	return {
		...buildStarshipLegacyAttributeMirrorUpdate("system.attributes.hp.value", hp.value),
		...buildStarshipLegacyAttributeMirrorUpdate("system.attributes.hp.max", hp.max),
		...buildStarshipLegacyAttributeMirrorUpdate("system.attributes.hp.temp", hp.temp),
		...buildStarshipLegacyAttributeMirrorUpdate("system.attributes.hp.tempmax", hp.tempmax)
	};
}

/**
 * @param {object} actor
 * @returns {{ ok: boolean, failures: string[] }}
 */
export function verifyLiveBwingResourcePostcondition(actor) {
	const failures = [];
	const { top } = readHp(actor);
	const expected = {
		value: BWING_CANONICAL_HULL.value,
		max: BWING_CANONICAL_HULL.max,
		temp: BWING_CANONICAL_SHIELDS.temp,
		tempmax: BWING_CANONICAL_SHIELDS.tempmax
	};
	for ( const key of Object.keys(expected) ) {
		if ( Number(top?.[key]) !== expected[key] ) failures.push(`stored-${key}`);
		if ( Number(actor.system?.attributes?.hp?.[key]) !== expected[key] ) failures.push(`prepared-${key}`);
	}
	return { ok: failures.length === 0, failures };
}

/**
 * @param {object} actor
 * @returns {Promise<object>}
 */
export async function executeBwingResourceRemediation(actor) {
	const inspection = inspectBwingResourceCandidate(actor);
	const result = {
		actorId: inspection.actorId,
		actorUuid: inspection.actorUuid,
		classification: inspection.classification,
		updateRequested: false,
		updateSucceeded: false,
		updateVerified: false,
		error: null,
		historicalTuple: inspection.historicalTuple
	};

	if ( inspection.classification === "NOT_BWING" ) return result;
	if ( inspection.classification === "RESOURCE_AMBIGUOUS" ) {
		result.error = inspection.ambiguousReason;
		return result;
	}
	if ( inspection.classification === "ALREADY_CANONICAL" ) {
		const verify = verifyLiveBwingResourcePostcondition(actor);
		result.updateVerified = verify.ok;
		if ( !verify.ok ) {
			result.classification = "RESOURCE_POSTCONDITION_FAILED";
			result.error = verify.failures.join(", ");
		}
		return result;
	}

	result.updateRequested = true;
	try {
		const payload = buildBwingCanonicalResourceUpdate();
		await actor.update(payload, { render: false });
		result.updateSucceeded = true;
	} catch ( err ) {
		result.classification = "RESOURCE_UPDATE_FAILED";
		result.error = err?.message ?? String(err);
		return result;
	}

	const liveActor = game.actors.get(actor.id ?? actor._id) ?? actor;
	const verify = verifyLiveBwingResourcePostcondition(liveActor);
	result.updateVerified = verify.ok;
	if ( !verify.ok ) {
		result.classification = "RESOURCE_POSTCONDITION_FAILED";
		result.error = verify.failures.join(", ");
		return result;
	}

	result.classification = "RESOURCE_UPDATED_VERIFIED";
	return result;
}
