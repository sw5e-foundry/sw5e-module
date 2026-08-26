/**
 * Foundry 14 ForcedReplacement helpers for SW5e migration payloads.
 *
 * Prefer `foundry.data.operators.ForcedReplacement.create` / global `_replace`.
 * Never emit legacy `==key` syntax.
 */

const FORCED_REPLACE_SENTINEL = Symbol.for("sw5e.ForcedReplacement");

/**
 * Create a Foundry 14 ForcedReplacement value, or a Node-test sentinel.
 * @param {*} value
 * @returns {*}
 */
export function createForcedReplacement(value) {
	const create = globalThis._replace
		?? globalThis.foundry?.data?.operators?.ForcedReplacement?.create
		?? null;
	if ( typeof create === "function" ) return create(value);
	return { [FORCED_REPLACE_SENTINEL]: true, value };
}

/**
 * @param {*} value
 * @returns {boolean}
 */
export function isForcedReplacement(value) {
	if ( value == null || typeof value !== "object" ) return false;
	if ( value[FORCED_REPLACE_SENTINEL] === true ) return true;
	const ForcedReplacement = globalThis.foundry?.data?.operators?.ForcedReplacement;
	if ( ForcedReplacement && (value instanceof ForcedReplacement) ) return true;
	if ( typeof ForcedReplacement?.get === "function" ) {
		try {
			if ( value instanceof ForcedReplacement ) return true;
			// Proxy-wrapped instances from ForcedReplacement.create
			const proto = Object.getPrototypeOf(value);
			if ( proto && proto.constructor === ForcedReplacement ) return true;
		} catch ( _err ) {
			/* not a ForcedReplacement */
		}
	}
	return false;
}

/**
 * Unwrap a ForcedReplacement (or sentinel) to the replacement value.
 * @param {*} value
 * @returns {*}
 */
export function unwrapForcedReplacement(value) {
	if ( value == null || typeof value !== "object" ) return value;
	if ( value[FORCED_REPLACE_SENTINEL] === true ) return value.value;
	const ForcedReplacement = globalThis.foundry?.data?.operators?.ForcedReplacement;
	if ( typeof ForcedReplacement?.get === "function" ) {
		try {
			return ForcedReplacement.get(value);
		} catch ( _err ) {
			/* fall through */
		}
	}
	return value;
}

/**
 * Deep-clone update data, replacing ForcedReplacement leaves with raw values for
 * in-memory mergeObject application against working sources.
 * @param {*} value
 * @returns {*}
 */
export function unwrapForcedReplacementsDeep(value) {
	if ( isForcedReplacement(value) ) return structuredClone(unwrapForcedReplacement(value));
	if ( Array.isArray(value) ) return value.map(unwrapForcedReplacementsDeep);
	if ( value && typeof value === "object" ) {
		const out = {};
		for ( const [key, entry] of Object.entries(value) ) {
			out[key] = unwrapForcedReplacementsDeep(entry);
		}
		return out;
	}
	return value;
}

/**
 * Foundry 14 equality helper with objectsEqual fallback for older stubs.
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
export function valuesEqual(a, b) {
	const equals = globalThis.foundry?.utils?.equals;
	if ( typeof equals === "function" ) return equals(a, b);
	const objectsEqual = globalThis.foundry?.utils?.objectsEqual;
	if ( typeof objectsEqual === "function" ) return objectsEqual(a, b);
	return JSON.stringify(a) === JSON.stringify(b);
}
