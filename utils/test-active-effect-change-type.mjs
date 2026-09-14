#!/usr/bin/env node
/**
 * Prepared Active Effect change.type contract for Superiority dice-max ADD.
 * Does not prove Foundry application or compatibility-warning absence.
 */
import assert from "node:assert/strict";
import {
	sumSuperiorityDiceMaxAdditions,
	SUPERIORITY_DICE_MAX_EFFECT_KEY,
	SUPERIORITY_DICE_MAX_ADD_TYPE
} from "../scripts/patch/maneuver.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

test("ADD string type is recognized", () => {
	assert.equal(SUPERIORITY_DICE_MAX_ADD_TYPE, "add");
	assert.equal(sumSuperiorityDiceMaxAdditions([{
		disabled: false,
		changes: [{ key: SUPERIORITY_DICE_MAX_EFFECT_KEY, type: "add", value: "2" }]
	}]), 2);
});

test("override and multiply string types are ignored", () => {
	assert.equal(sumSuperiorityDiceMaxAdditions([{
		disabled: false,
		changes: [{ key: SUPERIORITY_DICE_MAX_EFFECT_KEY, type: "override", value: "9" }]
	}]), 0);
	assert.equal(sumSuperiorityDiceMaxAdditions([{
		disabled: false,
		changes: [{ key: SUPERIORITY_DICE_MAX_EFFECT_KEY, type: "multiply", value: "2" }]
	}]), 0);
});

test("numeric persisted mode is not a runtime fallback", () => {
	assert.equal(sumSuperiorityDiceMaxAdditions([{
		disabled: false,
		changes: [{ key: SUPERIORITY_DICE_MAX_EFFECT_KEY, mode: 2, value: "4" }]
	}]), 0);
});

test("does not read change.mode on a throwing getter", () => {
	const change = { key: SUPERIORITY_DICE_MAX_EFFECT_KEY, type: "add", value: "1" };
	Object.defineProperty(change, "mode", {
		get() {
			throw new Error("numeric mode getter must not be read");
		}
	});
	assert.equal(sumSuperiorityDiceMaxAdditions([{ disabled: false, changes: [change] }]), 1);
});

test("does not mutate input objects", () => {
	const change = { key: SUPERIORITY_DICE_MAX_EFFECT_KEY, type: "add", value: "1" };
	const effects = [{ disabled: false, changes: [change] }];
	sumSuperiorityDiceMaxAdditions(effects);
	assert.equal(change.type, "add");
	assert.equal(change.value, "1");
	assert.equal(effects[0].disabled, false);
});

console.log(`\n${passed} passed`);
