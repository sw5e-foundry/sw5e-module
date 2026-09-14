/**
 * Offline tests for Bug 19A Superiority dice maximum resolution.
 */
import assert from "node:assert/strict";
import {
	resolveSuperiorityDiceMax,
	sumSuperiorityDiceMaxAdditions,
	SUPERIORITY_DICE_MAX_EFFECT_KEY,
	SUPERIORITY_DICE_MAX_ADD_TYPE
} from "../scripts/patch/maneuver.mjs";

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function addEffect(value, { key = SUPERIORITY_DICE_MAX_EFFECT_KEY, type = SUPERIORITY_DICE_MAX_ADD_TYPE, disabled = false } = {}) {
	return {
		disabled,
		changes: [{ key, type, value }]
	};
}

// --- Progression without effects ---
check("calculated 9, source null, no effects → 9", () => {
	assert.equal(resolveSuperiorityDiceMax({ sourceMax: null, calculatedMax: 9, effectAdditions: 0 }), 9);
});

check("calculated 3, source null, no effects → 3", () => {
	assert.equal(resolveSuperiorityDiceMax({ sourceMax: null, calculatedMax: 3, effectAdditions: 0 }), 3);
});

check("calculated 0, source null, no effects → 0", () => {
	assert.equal(resolveSuperiorityDiceMax({ sourceMax: null, calculatedMax: 0, effectAdditions: 0 }), 0);
});

check("source undefined treated as no override", () => {
	assert.equal(resolveSuperiorityDiceMax({ sourceMax: undefined, calculatedMax: 9, effectAdditions: 0 }), 9);
});

// --- Explicit overrides ---
check("calculated 9, source 0 → 0", () => {
	assert.equal(resolveSuperiorityDiceMax({ sourceMax: 0, calculatedMax: 9, effectAdditions: 0 }), 0);
});

check("calculated 9, source 4 → 4", () => {
	assert.equal(resolveSuperiorityDiceMax({ sourceMax: 4, calculatedMax: 9, effectAdditions: 0 }), 4);
});

check("calculated 3, source positive homebrew → explicit value", () => {
	assert.equal(resolveSuperiorityDiceMax({ sourceMax: 12, calculatedMax: 3, effectAdditions: 0 }), 12);
});

// --- ADD effects with no source override ---
check("calculated 3, ADD +1 → 4", () => {
	const additions = sumSuperiorityDiceMaxAdditions([addEffect(1)]);
	assert.equal(additions, 1);
	assert.equal(resolveSuperiorityDiceMax({ sourceMax: null, calculatedMax: 3, effectAdditions: additions }), 4);
});

check("calculated 9, ADD +2 → 11", () => {
	const additions = sumSuperiorityDiceMaxAdditions([addEffect("2")]);
	assert.equal(resolveSuperiorityDiceMax({ sourceMax: null, calculatedMax: 9, effectAdditions: additions }), 11);
});

check("calculated 3, ADD -1 → 2", () => {
	const additions = sumSuperiorityDiceMaxAdditions([addEffect(-1)]);
	assert.equal(resolveSuperiorityDiceMax({ sourceMax: null, calculatedMax: 3, effectAdditions: additions }), 2);
});

check("calculated 0, ADD -1 → 0 (clamp)", () => {
	const additions = sumSuperiorityDiceMaxAdditions([addEffect(-1)]);
	assert.equal(resolveSuperiorityDiceMax({ sourceMax: null, calculatedMax: 0, effectAdditions: additions }), 0);
});

check("multiple ADD changes summed once", () => {
	const additions = sumSuperiorityDiceMaxAdditions([
		addEffect(1),
		addEffect(2),
		{ disabled: false, changes: [
			{ key: SUPERIORITY_DICE_MAX_EFFECT_KEY, type: SUPERIORITY_DICE_MAX_ADD_TYPE, value: "3" }
		] }
	]);
	assert.equal(additions, 6);
	assert.equal(resolveSuperiorityDiceMax({ sourceMax: null, calculatedMax: 3, effectAdditions: additions }), 9);
});

check("iterable effects collection is supported", () => {
	function* gen() {
		yield addEffect(1);
		yield addEffect(1);
	}
	assert.equal(sumSuperiorityDiceMaxAdditions(gen()), 2);
});

// --- Invalid / ignored effects ---
check("disabled effect ignored", () => {
	assert.equal(sumSuperiorityDiceMaxAdditions([addEffect(5, { disabled: true })]), 0);
});

check("wrong key ignored", () => {
	assert.equal(sumSuperiorityDiceMaxAdditions([addEffect(5, { key: "system.attributes.hp.max" })]), 0);
});

check("unsupported OVERRIDE type ignored", () => {
	assert.equal(sumSuperiorityDiceMaxAdditions([addEffect(5, { type: "override" })]), 0);
});

check("unsupported MULTIPLY type ignored", () => {
	assert.equal(sumSuperiorityDiceMaxAdditions([addEffect(2, { type: "multiply" })]), 0);
});

check("numeric-only persisted mode is not treated as ADD (no fallback)", () => {
	assert.equal(sumSuperiorityDiceMaxAdditions([{
		disabled: false,
		changes: [{ key: SUPERIORITY_DICE_MAX_EFFECT_KEY, mode: 2, value: 1 }]
	}]), 0);
});

check("missing value ignored", () => {
	assert.equal(sumSuperiorityDiceMaxAdditions([{
		disabled: false,
		changes: [{ key: SUPERIORITY_DICE_MAX_EFFECT_KEY, type: SUPERIORITY_DICE_MAX_ADD_TYPE }]
	}]), 0);
});

check("empty string value ignored", () => {
	assert.equal(sumSuperiorityDiceMaxAdditions([addEffect("")]), 0);
});

check("non-numeric value ignored", () => {
	assert.equal(sumSuperiorityDiceMaxAdditions([addEffect("abc")]), 0);
});

check("non-finite value ignored", () => {
	assert.equal(sumSuperiorityDiceMaxAdditions([addEffect("Infinity")]), 0);
	assert.equal(sumSuperiorityDiceMaxAdditions([addEffect(NaN)]), 0);
});

check("null effects collection → 0", () => {
	assert.equal(sumSuperiorityDiceMaxAdditions(null), 0);
	assert.equal(sumSuperiorityDiceMaxAdditions(undefined), 0);
});

// --- Override plus effects (override authoritative) ---
check("source 4 + ADD 1 → 4 (override wins)", () => {
	const additions = sumSuperiorityDiceMaxAdditions([addEffect(1)]);
	assert.equal(resolveSuperiorityDiceMax({ sourceMax: 4, calculatedMax: 9, effectAdditions: additions }), 4);
});

check("source 0 + ADD 1 → 0 (explicit zero wins)", () => {
	const additions = sumSuperiorityDiceMaxAdditions([addEffect(1)]);
	assert.equal(resolveSuperiorityDiceMax({ sourceMax: 0, calculatedMax: 9, effectAdditions: additions }), 0);
});

// --- Idempotence ---
check("resolver idempotent with identical inputs", () => {
	const inputs = { sourceMax: null, calculatedMax: 9, effectAdditions: 2 };
	const first = resolveSuperiorityDiceMax(inputs);
	const second = resolveSuperiorityDiceMax(inputs);
	assert.equal(first, 11);
	assert.equal(second, first);
});

check("sumSuperiorityDiceMaxAdditions idempotent (no mutation)", () => {
	const effects = [addEffect(1), addEffect(2)];
	const first = sumSuperiorityDiceMaxAdditions(effects);
	const second = sumSuperiorityDiceMaxAdditions(effects);
	assert.equal(first, 3);
	assert.equal(second, first);
	assert.equal(effects[0].changes[0].value, 1);
});

// --- Non-goals / clamp ---
check("negative calculated clamps with no effects", () => {
	assert.equal(resolveSuperiorityDiceMax({ sourceMax: null, calculatedMax: -5, effectAdditions: 0 }), 0);
});

check("non-finite calculated treated as 0 when no override", () => {
	assert.equal(resolveSuperiorityDiceMax({ sourceMax: null, calculatedMax: NaN, effectAdditions: 3 }), 3);
});

console.log(`\n${passed} tests passed`);
