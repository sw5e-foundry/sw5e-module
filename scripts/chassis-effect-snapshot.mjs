const MODE_ADD = 2;

/** Foundry 14.367 BaseActiveEffect.#MODES_TO_TYPES inverse for snapshot persistence. */
const CHANGE_TYPE_TO_MODE = Object.freeze({
	custom: 0,
	multiply: 1,
	add: 2,
	downgrade: 3,
	upgrade: 4,
	override: 5
});

/**
 * Numeric snapshot mode from a prepared change `type`, or a plain own-data `mode`.
 * Never evaluates the numeric mode accessor (Foundry 14 compatibility getter warns).
 * @param {object} [change]
 * @returns {number}
 */
export function persistedModeFromChange(change) {
	const type = typeof change?.type === "string" ? change.type.trim() : "";
	if ( type ) {
		if ( Object.hasOwn(CHANGE_TYPE_TO_MODE, type) ) return CHANGE_TYPE_TO_MODE[type];
		const custom = /^custom\.(-?\d+)$/.exec(type);
		if ( custom ) return Number(custom[1]);
		return MODE_ADD;
	}
	const descriptor = Object.getOwnPropertyDescriptor(change ?? {}, "mode");
	const hasPlainNumericMode = Boolean(descriptor)
		&& Object.hasOwn(descriptor, "value")
		&& Number.isFinite(Number(descriptor.value));
	if ( hasPlainNumericMode ) return Number(descriptor.value);
	return MODE_ADD;
}

/**
 * @param {Iterable<object>|null|undefined} effects
 * @returns {object[]|undefined}
 */
export function cloneEffectsSnapshot(effects) {
	if ( !effects ) return undefined;
	const list = Array.isArray(effects)
		? effects
		: (typeof effects[Symbol.iterator] === "function" ? [...effects] : null);
	if ( !list?.length ) return undefined;
	return list.map(effect => ({
		name: effect.name ?? "",
		disabled: Boolean(effect.disabled),
		changes: (effect.changes ?? []).map(change => ({
			key: change.key,
			mode: persistedModeFromChange(change),
			value: change.value,
			priority: change.priority ?? 20
		}))
	}));
}
