#!/usr/bin/env node
import assert from "node:assert/strict";
import {
	normalizeDaeCustomBonusChange,
	toDaeCustomBonusString
} from "../scripts/dae-custom-bonus-value.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function survivesFoundryJsonMigration(value) {
	try {
		JSON.parse(value);
		return false;
	} catch {
		return true;
	}
}

test("bare numeric custom bonuses become signed strings", () => {
	assert.equal(toDaeCustomBonusString(1), "+1");
	assert.equal(toDaeCustomBonusString("1"), "+1");
	assert.equal(toDaeCustomBonusString(0), "+0");
	assert.equal(toDaeCustomBonusString(-2), "-2+0");
	assert.equal(toDaeCustomBonusString("-2"), "-2+0");
	assert.equal(toDaeCustomBonusString("+1"), "+1");
});

test("normalized bonus strings are not valid JSON numbers", () => {
	for ( const value of [1, "1", 0, -2, "-2"] ) {
		assert.equal(survivesFoundryJsonMigration(toDaeCustomBonusString(value)), true);
	}
	assert.equal(JSON.parse("1"), 1);
	assert.equal(JSON.parse("-2"), -2);
});

test("formulas and non-custom changes are left alone", () => {
	const formula = { key: "system.bonuses.mwak.damage", type: "custom", value: "@scale.berserker.rage-damage" };
	assert.equal(normalizeDaeCustomBonusChange(formula), false);
	assert.equal(formula.value, "@scale.berserker.rage-damage");

	const add = { key: "system.bonuses.mwak.damage", mode: 2, type: "add", value: "1" };
	assert.equal(normalizeDaeCustomBonusChange(add), false);
	assert.equal(add.value, "1");
});

test("legacy custom mode on a DAE bonus key is rewritten", () => {
	const change = { key: "system.bonuses.rwak.attack", mode: 0, value: "1" };
	assert.equal(normalizeDaeCustomBonusChange(change), true);
	assert.equal(change.value, "+1");
});

console.log(`\n${passed} passed`);
