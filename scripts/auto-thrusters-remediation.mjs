/**
 * Existing-world Auto-Thrusters remediation for Foundry 14 / dnd5e 5.3.3.
 *
 * Repairs legacy embedded transferable Auto-Thrusters effects and removes only
 * exact redundant Actor-level snapshots. Idempotent. Skips ambiguous cases.
 */

export const AUTO_THRUSTERS_CANONICAL_ITEM_ID = "Ps2LiBeSQQAi57Kf";
export const AUTO_THRUSTERS_CANONICAL_EFFECT_ID = "DwFh63OFTvVGSjQD";
export const AUTO_THRUSTERS_NAME = "Auto-Thrusters";
export const AUTO_THRUSTERS_LEGACY_TARGET = "system.abilities.dex.save";
export const AUTO_THRUSTERS_V14_TARGET = "system.abilities.dex.bonuses.save";
export const AUTO_THRUSTERS_LEGACY_FORMULA = "((@str.mod)/2)";
export const AUTO_THRUSTERS_V14_FORMULA = "+max(1, floor((@abilities.str.value - 10) / 4))";
export const AUTO_THRUSTERS_PRIORITY = 20;
export const AUTO_THRUSTERS_MODE = 2;

/**
 * @param {object} item
 * @returns {boolean}
 */
export function isAutoThrustersItem(item) {
	if ( !item || typeof item !== "object" ) return false;
	if ( String(item.name || "").toLowerCase() === AUTO_THRUSTERS_NAME.toLowerCase() ) return true;
	const provenance = item._stats?.compendiumSource
		|| item.flags?.core?.sourceId
		|| item.flags?.sw5e?.sourceId
		|| "";
	if ( typeof provenance === "string" && provenance.includes(AUTO_THRUSTERS_CANONICAL_ITEM_ID) ) return true;
	if ( item._id === AUTO_THRUSTERS_CANONICAL_ITEM_ID ) return true;
	const effects = Array.isArray(item.effects) ? item.effects : [];
	return effects.some(effect => {
		if ( typeof effect === "string" ) return effect === AUTO_THRUSTERS_CANONICAL_EFFECT_ID;
		return effect?._id === AUTO_THRUSTERS_CANONICAL_EFFECT_ID
			|| String(effect?.name || "").toLowerCase() === AUTO_THRUSTERS_NAME.toLowerCase();
	});
}

/**
 * @param {object} effect
 * @returns {object[]|null}
 */
function getEffectChanges(effect) {
	if ( Array.isArray(effect?.changes) ) return effect.changes;
	if ( Array.isArray(effect?.system?.changes) ) return effect.system.changes;
	return null;
}

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
		&& String(change.value) === AUTO_THRUSTERS_V14_FORMULA;
}

/**
 * @param {object} effect
 * @returns {boolean}
 */
export function effectLooksLikeAutoThrusters(effect) {
	if ( !effect || typeof effect !== "object" ) return false;
	if ( effect._id === AUTO_THRUSTERS_CANONICAL_EFFECT_ID ) return true;
	if ( String(effect.name || "").toLowerCase() === AUTO_THRUSTERS_NAME.toLowerCase() ) return true;
	const changes = getEffectChanges(effect) ?? [];
	return changes.some(change => isLegacyAutoThrustersChange(change) || isCorrectedAutoThrustersChange(change));
}

/**
 * @param {object} effect
 * @returns {boolean}
 */
export function effectNeedsAutoThrustersRepair(effect) {
	if ( !effectLooksLikeAutoThrusters(effect) ) return false;
	const changes = getEffectChanges(effect);
	if ( !changes?.length ) return false;
	return changes.some(isLegacyAutoThrustersChange);
}

/**
 * @param {object} effect
 * @returns {{ changed: boolean, effect: object }}
 */
export function repairAutoThrustersEffect(effect) {
	const working = foundry.utils.deepClone(effect);
	const changes = getEffectChanges(working);
	if ( !changes ) return { changed: false, effect: working };

	let changed = false;
	for ( const change of changes ) {
		if ( !isLegacyAutoThrustersChange(change) && !isCorrectedAutoThrustersChange(change) ) continue;
		if ( change.key !== AUTO_THRUSTERS_V14_TARGET ) {
			change.key = AUTO_THRUSTERS_V14_TARGET;
			changed = true;
		}
		if ( String(change.value) !== AUTO_THRUSTERS_V14_FORMULA ) {
			change.value = AUTO_THRUSTERS_V14_FORMULA;
			changed = true;
		}
		if ( Number(change.mode) !== AUTO_THRUSTERS_MODE ) {
			change.mode = AUTO_THRUSTERS_MODE;
			changed = true;
		}
		if ( Number(change.priority) !== AUTO_THRUSTERS_PRIORITY ) {
			change.priority = AUTO_THRUSTERS_PRIORITY;
			changed = true;
		}
	}

	if ( working.transfer !== true ) {
		working.transfer = true;
		changed = true;
	}

	return { changed, effect: working };
}

/**
 * @param {string|null|undefined} origin
 * @param {string} itemId
 * @returns {boolean}
 */
export function originMatchesEmbeddedItem(origin, itemId) {
	if ( typeof origin !== "string" || !itemId ) return false;
	return origin.endsWith(`.Item.${itemId}`) || origin.includes(`.Item.${itemId}`);
}

/**
 * Exact redundant Actor-level Auto-Thrusters snapshot?
 * @param {object} effect
 * @param {object} embeddedItem
 * @returns {boolean}
 */
export function isRedundantActorAutoThrustersSnapshot(effect, embeddedItem) {
	if ( !effect || !embeddedItem ) return false;
	if ( effect.transfer === true ) return false;
	if ( String(effect.name || "").toLowerCase() !== AUTO_THRUSTERS_NAME.toLowerCase() ) return false;
	if ( !originMatchesEmbeddedItem(effect.origin, embeddedItem._id) ) return false;
	const changes = getEffectChanges(effect) ?? [];
	if ( !changes.length ) return false;
	const onlyLegacyOrCorrected = changes.every(change => (
		isLegacyAutoThrustersChange(change) || isCorrectedAutoThrustersChange(change)
	));
	return onlyLegacyOrCorrected && changes.some(change => (
		isLegacyAutoThrustersChange(change) || isCorrectedAutoThrustersChange(change)
	));
}

/**
 * Remediates one Actor source in place.
 * @param {object} actorData
 * @param {object} [options]
 * @returns {{
 *   changed: boolean,
 *   skipped: boolean,
 *   reason: string|null,
 *   repairedEffectIds: string[],
 *   removedActorEffectIds: string[],
 *   itemId: string|null
 * }}
 */
export function remediateActorAutoThrusters(actorData, options={}) {
	const result = {
		changed: false,
		skipped: false,
		reason: null,
		repairedEffectIds: [],
		removedActorEffectIds: [],
		itemId: null
	};

	if ( !actorData || typeof actorData !== "object" ) {
		result.skipped = true;
		result.reason = "missing-actor";
		return result;
	}

	const items = Array.isArray(actorData.items) ? actorData.items : [];
	const candidates = items.filter(isAutoThrustersItem);
	if ( candidates.length === 0 ) return result;
	if ( candidates.length > 1 ) {
		result.skipped = true;
		result.reason = "ambiguous-auto-thrusters-items";
		console.warn("SW5E MODULE | Auto-Thrusters remediation skipped (ambiguous items)", {
			actorId: actorData._id ?? actorData.id ?? null,
			actorName: actorData.name ?? null,
			itemIds: candidates.map(item => item._id)
		});
		return result;
	}

	const item = candidates[0];
	result.itemId = item._id ?? null;
	const itemEffects = Array.isArray(item.effects)
		? item.effects.filter(effect => effect && typeof effect === "object")
		: [];
	const atEffects = itemEffects.filter(effectLooksLikeAutoThrusters);
	if ( atEffects.length === 0 ) {
		result.skipped = true;
		result.reason = "missing-embedded-effect";
		console.warn("SW5E MODULE | Auto-Thrusters remediation skipped (missing embedded effect)", {
			actorId: actorData._id ?? actorData.id ?? null,
			itemId: item._id
		});
		return result;
	}
	if ( atEffects.length > 1 ) {
		result.skipped = true;
		result.reason = "ambiguous-embedded-effects";
		console.warn("SW5E MODULE | Auto-Thrusters remediation skipped (ambiguous embedded effects)", {
			actorId: actorData._id ?? actorData.id ?? null,
			itemId: item._id,
			effectIds: atEffects.map(effect => effect._id)
		});
		return result;
	}

	const embedded = atEffects[0];
	const repaired = repairAutoThrustersEffect(embedded);
	if ( repaired.changed ) {
		const idx = item.effects.findIndex(effect => effect?._id === embedded._id);
		if ( idx >= 0 ) item.effects[idx] = repaired.effect;
		result.changed = true;
		result.repairedEffectIds.push(embedded._id);
	}

	const actorEffects = Array.isArray(actorData.effects) ? actorData.effects : [];
	const removable = actorEffects.filter(effect => isRedundantActorAutoThrustersSnapshot(effect, item));
	const ambiguousActor = actorEffects.filter(effect => {
		if ( !effectLooksLikeAutoThrusters(effect) ) return false;
		if ( removable.includes(effect) ) return false;
		if ( effect.transfer === true ) return false;
		return String(effect.name || "").toLowerCase() === AUTO_THRUSTERS_NAME.toLowerCase();
	});
	if ( ambiguousActor.length ) {
		result.skipped = true;
		result.reason = "ambiguous-actor-level-effects";
		console.warn("SW5E MODULE | Auto-Thrusters remediation skipped actor-level removal (ambiguous)", {
			actorId: actorData._id ?? actorData.id ?? null,
			effectIds: ambiguousActor.map(effect => effect._id)
		});
		// Still keep embedded repair if it already applied.
		return result;
	}

	if ( removable.length ) {
		const removeIds = new Set(removable.map(effect => effect._id));
		actorData.effects = actorEffects.filter(effect => !removeIds.has(effect._id));
		result.removedActorEffectIds.push(...removeIds);
		result.changed = true;
	}

	if ( options.log && result.changed ) {
		console.log("SW5E MODULE | Auto-Thrusters remediation applied", {
			actorId: actorData._id ?? actorData.id ?? null,
			actorName: actorData.name ?? null,
			itemId: result.itemId,
			repairedEffectIds: result.repairedEffectIds,
			removedActorEffectIds: result.removedActorEffectIds
		});
	}

	return result;
}
