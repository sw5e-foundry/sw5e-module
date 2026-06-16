const MODE_ADD = 2;

/**
 * @param {Iterable<object>|null|undefined} effects
 * @returns {object[]|undefined}
 */
export function cloneEffectsSnapshot(effects) {
	if ( !Array.isArray(effects) || !effects.length ) return undefined;
	return effects.map(effect => ({
		name: effect.name ?? "",
		disabled: Boolean(effect.disabled),
		changes: (effect.changes ?? []).map(change => ({
			key: change.key,
			mode: change.mode ?? MODE_ADD,
			value: change.value,
			priority: change.priority ?? 20
		}))
	}));
}
