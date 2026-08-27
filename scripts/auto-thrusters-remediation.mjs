/**
 * Auto-Thrusters remediation for Foundry 14 / dnd5e 5.3.3.
 *
 * Pure matchers and canonical payload builders are separated from live Document
 * operations. World Actors are remediated through parent-mediated embedded APIs.
 */

export const AUTO_THRUSTERS_CANONICAL_ITEM_COMPENDIUM_ID = "Ps2LiBeSQQAi57Kf";
export const AUTO_THRUSTERS_CANONICAL_ITEM_PROVENANCE = `Compendium.sw5e-module.starships.${AUTO_THRUSTERS_CANONICAL_ITEM_COMPENDIUM_ID}`;
export const AUTO_THRUSTERS_CANONICAL_EFFECT_ID = "DwFh63OFTvVGSjQD";
export const AUTO_THRUSTERS_CANONICAL_SNAPSHOT_ID = "9hTss8Gebtw4efXl";
export const AUTO_THRUSTERS_NAME = "Auto-Thrusters";
export const AUTO_THRUSTERS_LEGACY_TARGET = "system.abilities.dex.save";
export const AUTO_THRUSTERS_V14_TARGET = "system.abilities.dex.bonuses.save";
export const AUTO_THRUSTERS_LEGACY_FORMULA = "((@str.mod)/2)";
export const AUTO_THRUSTERS_V14_FORMULA = "+max(1, floor((@abilities.str.value - 10) / 4))";
export const AUTO_THRUSTERS_PRIORITY = 20;

/**
 * @param {object} change
 * @returns {boolean}
 */
export function isLegacyAutoThrustersChange(change) {
	if ( !change || typeof change !== "object" ) return false;
	return change.key === AUTO_THRUSTERS_LEGACY_TARGET
		&& String(change.value) === AUTO_THRUSTERS_LEGACY_FORMULA;
}

/**
 * @param {object} change
 * @returns {boolean}
 */
export function isCorrectedAutoThrustersChange(change) {
	if ( !change || typeof change !== "object" ) return false;
	return change.key === AUTO_THRUSTERS_V14_TARGET
		&& String(change.value) === AUTO_THRUSTERS_V14_FORMULA
		&& (change.type === "add" || change.type === undefined)
		&& Number(change.priority) === AUTO_THRUSTERS_PRIORITY
		&& (change.phase === "initial" || change.phase === undefined);
}

/**
 * @param {object} effect
 * @returns {object[]|null}
 */
export function getEffectChanges(effect) {
	if ( Array.isArray(effect?.system?.changes) ) return effect.system.changes;
	if ( Array.isArray(effect?.changes) ) return effect.changes;
	return null;
}

/**
 * @param {object} actor
 * @returns {boolean}
 */
export function isStarshipActor(actor) {
	return actor?.type === "vehicle"
		&& actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

/**
 * @param {object} item
 * @returns {string|null}
 */
export function getItemProvenance(item) {
	const source = item?._stats?.compendiumSource
		|| item?.flags?.core?.sourceId
		|| item?.flags?.sw5e?.sourceId
		|| null;
	return typeof source === "string" ? source : null;
}

/**
 * Strict Auto-Thrusters item match using provenance and embedded effect identity.
 * @param {object} item
 * @returns {boolean}
 */
export function isExactAutoThrustersItem(item) {
	if ( !item || typeof item !== "object" ) return false;
	const provenance = getItemProvenance(item);
	if ( provenance === AUTO_THRUSTERS_CANONICAL_ITEM_PROVENANCE ) return true;
	if ( typeof provenance === "string" && provenance.includes(AUTO_THRUSTERS_CANONICAL_ITEM_COMPENDIUM_ID) ) {
		return true;
	}
	const effects = item.effects?.contents ?? item.effects ?? [];
	for ( const effect of effects ) {
		const id = effect?._id ?? effect?.id ?? effect;
		if ( id === AUTO_THRUSTERS_CANONICAL_EFFECT_ID ) return true;
	}
	return false;
}

/**
 * @param {object} effect
 * @returns {boolean}
 */
export function effectNeedsAutoThrustersRepair(effect) {
	const changes = getEffectChanges(effect);
	if ( !changes?.length ) return false;
	return changes.some(isLegacyAutoThrustersChange);
}

/**
 * @param {object} effect
 * @returns {boolean}
 */
export function effectIsCorrectedAutoThrusters(effect) {
	if ( effect?.transfer !== true ) return false;
	const changes = getEffectChanges(effect);
	if ( !changes?.length ) return false;
	return changes.every(change => !isLegacyAutoThrustersChange(change))
		&& changes.some(isCorrectedAutoThrustersChange);
}

/**
 * @param {string|null|undefined} origin
 * @param {string} itemId
 * @returns {boolean}
 */
export function originExactlyMatchesEmbeddedItem(origin, itemId) {
	if ( typeof origin !== "string" || !itemId ) return false;
	return origin.endsWith(`.Item.${itemId}`);
}

/**
 * @param {object} effect
 * @param {object} item
 * @returns {boolean}
 */
export function isExactAutoThrustersSnapshot(effect, item) {
	if ( !effect || !item ) return false;
	if ( effect._id !== AUTO_THRUSTERS_CANONICAL_SNAPSHOT_ID ) return false;
	if ( effect.transfer === true ) return false;
	if ( !originExactlyMatchesEmbeddedItem(effect.origin, item.id ?? item._id) ) return false;
	const changes = getEffectChanges(effect) ?? [];
	if ( !changes.length ) return false;
	return changes.every(change => isLegacyAutoThrustersChange(change) || isCorrectedAutoThrustersChange(change));
}

/**
 * @param {string} effectId
 * @param {{ transfer?: boolean }} [options]
 * @returns {object}
 */
export function buildCanonicalAutoThrustersEffectUpdate(effectId, { transfer = true } = {}) {
	const update = {
		_id: effectId,
		system: {
			changes: [{
				key: AUTO_THRUSTERS_V14_TARGET,
				type: "add",
				value: AUTO_THRUSTERS_V14_FORMULA,
				phase: "initial",
				priority: AUTO_THRUSTERS_PRIORITY
			}]
		}
	};
	if ( transfer === true ) update.transfer = true;
	return update;
}

/**
 * Inspect a live Actor without mutation.
 * @param {object} actor
 * @returns {object}
 */
export function inspectAutoThrustersCandidate(actor) {
	const result = {
		classification: "NOT_AFFECTED",
		actorId: actor?.id ?? actor?._id ?? null,
		actorUuid: actor?.uuid ?? null,
		itemId: null,
		itemUuid: null,
		embeddedEffectId: null,
		snapshotEffectId: AUTO_THRUSTERS_CANONICAL_SNAPSHOT_ID,
		ambiguousReason: null,
		needsUpdate: false,
		needsDelete: false,
		alreadyCorrect: false
	};

	if ( !actor || typeof actor !== "object" ) {
		result.classification = "UNEXPANDED_INPUT";
		result.ambiguousReason = "missing-actor";
		return result;
	}
	if ( !isStarshipActor(actor) ) return result;

	const items = [...(actor.items?.contents ?? actor.items ?? [])];
	const candidates = items.filter(isExactAutoThrustersItem);
	if ( candidates.length === 0 ) return result;
	if ( candidates.length > 1 ) {
		result.classification = "AMBIGUOUS";
		result.ambiguousReason = "multiple-auto-thrusters-items";
		return result;
	}

	const item = candidates[0];
	result.itemId = item.id ?? item._id ?? null;
	result.itemUuid = item.uuid ?? null;
	result.classification = "MATCHED";

	const itemEffects = [...(item.effects?.contents ?? item.effects ?? [])];
	const embeddedMatches = itemEffects.filter(effect => effect?._id === AUTO_THRUSTERS_CANONICAL_EFFECT_ID);
	if ( embeddedMatches.length === 0 ) {
		result.classification = "AMBIGUOUS";
		result.ambiguousReason = "missing-canonical-embedded-effect";
		return result;
	}
	if ( embeddedMatches.length > 1 ) {
		result.classification = "AMBIGUOUS";
		result.ambiguousReason = "multiple-canonical-embedded-effects";
		return result;
	}

	const embedded = embeddedMatches[0];
	result.embeddedEffectId = embedded._id;
	result.needsUpdate = effectNeedsAutoThrustersRepair(embedded);

	const actorEffects = [...(actor.effects?.contents ?? actor.effects ?? [])];
	const snapshots = actorEffects.filter(effect => isExactAutoThrustersSnapshot(effect, item));
	const otherActorAutoThrusters = actorEffects.filter(effect => {
		if ( snapshots.includes(effect) ) return false;
		if ( effect._id === AUTO_THRUSTERS_CANONICAL_SNAPSHOT_ID ) return true;
		if ( effect.transfer === true ) return false;
		if ( String(effect.name || "").toLowerCase() !== AUTO_THRUSTERS_NAME.toLowerCase() ) return false;
		return true;
	});

	if ( otherActorAutoThrusters.length ) {
		result.classification = "AMBIGUOUS";
		result.ambiguousReason = "ambiguous-actor-level-auto-thrusters";
		return result;
	}

	result.needsDelete = snapshots.length > 0;
	result.alreadyCorrect = !result.needsUpdate
		&& !result.needsDelete
		&& effectIsCorrectedAutoThrusters(embedded);

	if ( result.alreadyCorrect ) result.classification = "ALREADY_CORRECT";
	return result;
}

/**
 * Verify live postconditions on re-fetched Documents.
 * @param {object} actor
 * @param {object} [expectation]
 * @returns {{ ok: boolean, failures: string[], contributionCount: number }}
 */
export function verifyLiveAutoThrustersPostcondition(actor, expectation={}) {
	const failures = [];
	const itemId = expectation.itemId ?? null;
	const effectId = expectation.embeddedEffectId ?? AUTO_THRUSTERS_CANONICAL_EFFECT_ID;
	const snapshotId = expectation.snapshotEffectId ?? AUTO_THRUSTERS_CANONICAL_SNAPSHOT_ID;

	const item = itemId ? actor.items?.get?.(itemId) : null;
	if ( !item ) failures.push("missing-embedded-item");
	const effect = item?.effects?.get?.(effectId);
	if ( !effect ) failures.push("missing-embedded-effect");
	else {
		const changes = getEffectChanges(effect) ?? [];
		if ( !changes.some(isCorrectedAutoThrustersChange) ) failures.push("embedded-effect-not-corrected");
		if ( effect.transfer !== true ) failures.push("embedded-transfer-not-true");
		if ( changes.some(isLegacyAutoThrustersChange) ) failures.push("embedded-legacy-change-remains");
	}
	if ( actor.effects?.has?.(snapshotId) ) failures.push("actor-level-snapshot-remains");

	let contributionCount = 0;
	if ( typeof actor.allApplicableEffects === "function" ) {
		for ( const applicable of actor.allApplicableEffects() ) {
			if ( !applicable?.active ) continue;
			const changes = getEffectChanges(applicable) ?? [];
			if ( changes.some(change => (
				isCorrectedAutoThrustersChange(change) || isLegacyAutoThrustersChange(change)
			)) ) contributionCount += 1;
		}
	}
	if ( contributionCount !== 1 ) failures.push(`contribution-count-${contributionCount}`);

	return { ok: failures.length === 0, failures, contributionCount };
}

/**
 * Execute parent-mediated Auto-Thrusters remediation on one live Actor.
 * @param {object} actor
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function executeAutoThrustersRemediation(actor, options={}) {
	const inspection = inspectAutoThrustersCandidate(actor);
	const result = {
		actorId: inspection.actorId,
		actorUuid: inspection.actorUuid,
		itemId: inspection.itemId,
		itemUuid: inspection.itemUuid,
		embeddedEffectId: inspection.embeddedEffectId,
		snapshotEffectId: inspection.snapshotEffectId,
		classification: inspection.classification,
		updateRequested: false,
		updateSucceeded: false,
		updateVerified: false,
		deleteRequested: false,
		deleteSucceeded: false,
		deleteVerified: false,
		finalContributionCount: null,
		error: null
	};

	if ( inspection.classification === "NOT_AFFECTED" ) {
		result.classification = "NOT_AFFECTED";
		return result;
	}
	if ( inspection.classification === "AMBIGUOUS" ) {
		result.classification = "AMBIGUOUS";
		result.error = inspection.ambiguousReason;
		return result;
	}
	if ( inspection.classification === "ALREADY_CORRECT" ) {
		const verify = verifyLiveAutoThrustersPostcondition(actor, inspection);
		result.finalContributionCount = verify.contributionCount;
		result.classification = verify.ok ? "ALREADY_CORRECT" : "POSTCONDITION_FAILED";
		if ( !verify.ok ) result.error = verify.failures.join(", ");
		return result;
	}

	let liveActor = game.actors.get(actor.id ?? actor._id) ?? actor;
	let liveItem = liveActor.items?.get?.(inspection.itemId);
	let liveEffect = liveItem?.effects?.get?.(inspection.embeddedEffectId);
	if ( !liveItem || !liveEffect ) {
		result.classification = "UNEXPANDED_INPUT";
		result.error = "missing-live-item-or-effect";
		return result;
	}

	if ( inspection.needsUpdate ) {
		result.updateRequested = true;
		try {
			const payload = buildCanonicalAutoThrustersEffectUpdate(inspection.embeddedEffectId, { transfer: true });
			await liveItem.updateEmbeddedDocuments("ActiveEffect", [payload], { render: false });
			result.updateSucceeded = true;
		} catch ( err ) {
			result.classification = "UPDATE_FAILED";
			result.error = err?.message ?? String(err);
			return result;
		}

		liveActor = game.actors.get(actor.id ?? actor._id) ?? actor;
		liveItem = liveActor.items?.get?.(inspection.itemId);
		liveEffect = liveItem?.effects?.get?.(inspection.embeddedEffectId);
		const updateVerify = verifyLiveAutoThrustersPostcondition(liveActor, {
			itemId: inspection.itemId,
			embeddedEffectId: inspection.embeddedEffectId,
			snapshotEffectId: inspection.snapshotEffectId
		});
		result.updateVerified = updateVerify.ok || !updateVerify.failures.includes("embedded-effect-not-corrected");
		if ( !result.updateVerified ) {
			result.classification = "POSTCONDITION_FAILED";
			result.error = updateVerify.failures.join(", ");
			return result;
		}
	} else {
		result.updateVerified = effectIsCorrectedAutoThrusters(liveEffect);
	}

	if ( inspection.needsDelete ) {
		result.deleteRequested = true;
		try {
			await liveActor.deleteEmbeddedDocuments("ActiveEffect", [inspection.snapshotEffectId], { render: false });
			result.deleteSucceeded = true;
		} catch ( err ) {
			result.classification = "DELETE_FAILED";
			result.error = err?.message ?? String(err);
			return result;
		}

		liveActor = game.actors.get(actor.id ?? actor._id) ?? actor;
		result.deleteVerified = !liveActor.effects?.has?.(inspection.snapshotEffectId);
		if ( !result.deleteVerified ) {
			result.classification = "POSTCONDITION_FAILED";
			result.error = "actor-level-snapshot-remains";
			return result;
		}
	} else {
		result.deleteVerified = !liveActor.effects?.has?.(inspection.snapshotEffectId);
	}

	const finalVerify = verifyLiveAutoThrustersPostcondition(liveActor, inspection);
	result.finalContributionCount = finalVerify.contributionCount;
	if ( !finalVerify.ok ) {
		result.classification = "POSTCONDITION_FAILED";
		result.error = finalVerify.failures.join(", ");
		return result;
	}

	result.classification = (inspection.needsUpdate || inspection.needsDelete)
		? "UPDATED_VERIFIED"
		: "ALREADY_CORRECT";
	return result;
}

// Legacy pure-data helpers retained for offline matcher tests.
function detectUnexpandedEmbedRefs(actorData) {
	if ( Array.isArray(actorData?.items) && actorData.items.some(entry => typeof entry === "string") ) {
		return "unexpanded-embed-id-refs";
	}
	if ( Array.isArray(actorData?.effects) && actorData.effects.some(entry => typeof entry === "string") ) {
		return "unexpanded-embed-id-refs";
	}
	for ( const item of actorData?.items ?? [] ) {
		if ( typeof item !== "object" || item === null ) continue;
		if ( Array.isArray(item.effects) && item.effects.some(entry => typeof entry === "string") ) {
			return "unexpanded-item-effect-id-refs";
		}
	}
	return null;
}

function applyOfflineAutoThrustersMutation(actorData, inspection) {
	if ( inspection.needsUpdate && inspection.itemId && inspection.embeddedEffectId ) {
		const item = (actorData.items ?? []).find(entry => (entry?._id ?? entry?.id) === inspection.itemId);
		const effect = (item?.effects ?? []).find(entry => (entry?._id ?? entry?.id) === inspection.embeddedEffectId);
		if ( effect ) {
			const payload = buildCanonicalAutoThrustersEffectUpdate(inspection.embeddedEffectId, { transfer: true });
			effect.transfer = true;
			effect.system = payload.system;
			effect.changes = payload.system.changes;
		}
	}
	if ( inspection.needsDelete && inspection.snapshotEffectId ) {
		actorData.effects = (actorData.effects ?? []).filter(entry => (entry?._id ?? entry?.id) !== inspection.snapshotEffectId);
	}
}

export function remediateActorAutoThrusters(actorData, options={}) {
	const unexpandedReason = detectUnexpandedEmbedRefs(actorData);
	if ( unexpandedReason ) {
		return {
			changed: false,
			skipped: false,
			failed: true,
			reason: unexpandedReason,
			classification: "ERROR",
			repairedEffectIds: [],
			removedActorEffectIds: [],
			itemId: null,
			failedPredicate: "expanded-embeds"
		};
	}

	const inspection = inspectAutoThrustersCandidate({
		id: actorData?._id ?? actorData?.id,
		_id: actorData?._id ?? actorData?.id,
		type: actorData?.type,
		flags: actorData?.flags,
		items: { contents: Array.isArray(actorData?.items) ? actorData.items : [] },
		effects: { contents: Array.isArray(actorData?.effects) ? actorData.effects : [] },
		uuid: actorData?.uuid ?? null
	});

	if ( inspection.classification === "MATCHED" && (inspection.needsUpdate || inspection.needsDelete) ) {
		applyOfflineAutoThrustersMutation(actorData, inspection);
	}

	const classification = inspection.classification === "MATCHED"
		? (inspection.needsUpdate || inspection.needsDelete ? "UPDATED" : "ALREADY_CORRECT")
		: (inspection.classification === "UNEXPANDED_INPUT" ? "ERROR" : inspection.classification);

	return {
		changed: inspection.needsUpdate || inspection.needsDelete,
		skipped: inspection.classification === "NOT_AFFECTED",
		failed: ["AMBIGUOUS", "UNEXPANDED_INPUT", "ERROR"].includes(classification),
		reason: inspection.ambiguousReason,
		classification,
		repairedEffectIds: inspection.needsUpdate ? [inspection.embeddedEffectId].filter(Boolean) : [],
		removedActorEffectIds: inspection.needsDelete ? [inspection.snapshotEffectId] : [],
		itemId: inspection.itemId,
		failedPredicate: inspection.ambiguousReason ?? (classification === "ERROR" ? "expanded-embeds" : null)
	};
}

export function verifyAutoThrustersRemediationPostcondition(actorData, expectation={}) {
	const actor = {
		id: actorData?._id ?? actorData?.id,
		type: actorData?.type,
		flags: actorData?.flags,
		items: {
			get(id) {
				const item = (actorData?.items ?? []).find(entry => entry?._id === id);
				if ( !item ) return null;
				return {
					...item,
					effects: {
						get(effectId) {
							return (item.effects ?? []).find(entry => entry?._id === effectId) ?? null;
						}
					}
				};
			}
		},
		effects: {
			has(id) { return (actorData?.effects ?? []).some(entry => entry?._id === id); }
		},
		allApplicableEffects() {
			const out = [];
			for ( const effect of actorData?.effects ?? [] ) out.push({ ...effect, active: true });
			for ( const item of actorData?.items ?? [] ) {
				for ( const effect of item.effects ?? [] ) {
					if ( effect.transfer === true ) out.push({ ...effect, active: true });
				}
			}
			return out;
		}
	};
	return verifyLiveAutoThrustersPostcondition(actor, {
		itemId: expectation.itemId ?? "bYUvLvm9ant0G9t7",
		embeddedEffectId: expectation.effectId ?? AUTO_THRUSTERS_CANONICAL_EFFECT_ID,
		snapshotEffectId: expectation.actorEffectId ?? AUTO_THRUSTERS_CANONICAL_SNAPSHOT_ID
	});
}

// Back-compat exports used by existing tests.
export const AUTO_THRUSTERS_CANONICAL_ITEM_ID = AUTO_THRUSTERS_CANONICAL_ITEM_COMPENDIUM_ID;
export const AUTO_THRUSTERS_MODE = 2;
export function isAutoThrustersItem(item) { return isExactAutoThrustersItem(item); }
export function effectLooksLikeAutoThrusters(effect) {
	return effect?._id === AUTO_THRUSTERS_CANONICAL_EFFECT_ID
		|| (getEffectChanges(effect) ?? []).some(change => (
			isLegacyAutoThrustersChange(change) || isCorrectedAutoThrustersChange(change)
		));
}
export function repairAutoThrustersEffect(effect) {
	const payload = buildCanonicalAutoThrustersEffectUpdate(effect?._id ?? AUTO_THRUSTERS_CANONICAL_EFFECT_ID);
	return {
		changed: effectNeedsAutoThrustersRepair(effect),
		effect: {
			...effect,
			transfer: true,
			system: payload.system,
			changes: payload.system.changes
		}
	};
}
export function originMatchesEmbeddedItem(origin, itemId) {
	return originExactlyMatchesEmbeddedItem(origin, itemId);
}
export function isRedundantActorAutoThrustersSnapshot(effect, embeddedItem) {
	return isExactAutoThrustersSnapshot(effect, embeddedItem);
}
