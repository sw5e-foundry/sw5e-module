#!/usr/bin/env node
import assert from "node:assert/strict";
import {
	formatPowerAttackBonus,
	formatSchoolAttackBonus,
	readPreparedAttackValue
} from "../scripts/power-attack-display.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

test("numeric zero displays +0", () => {
	assert.equal(formatPowerAttackBonus(0), "+0");
	assert.equal(formatSchoolAttackBonus({ value: 0 }, 0), "+0");
});

test("positive and negative values keep their sign", () => {
	assert.equal(formatPowerAttackBonus(5), "+5");
	assert.equal(formatPowerAttackBonus(-2), "-2");
	assert.equal(formatSchoolAttackBonus({ value: 2 }, 3), "+5");
	assert.equal(formatSchoolAttackBonus({ value: 1 }, -4), "-3");
});

test("missing values are not coerced into zero", () => {
	assert.equal(Number(null), 0);
	assert.equal(Number(""), 0);
	for ( const value of [undefined, null, "", " ", Number.NaN, Number.POSITIVE_INFINITY] ) {
		assert.equal(formatPowerAttackBonus(value), "-");
	}
	assert.equal(formatSchoolAttackBonus(undefined, 2), "-");
	assert.equal(formatSchoolAttackBonus({ value: null }, 2), "-");
	assert.equal(formatSchoolAttackBonus({ value: "" }, 2), "-");
	assert.equal(formatSchoolAttackBonus({ value: Number.NaN }, 2), "-");
});

test("the attack object is not numeric-coerced", () => {
	const attack = {
		value: 4,
		toString() {
			throw new Error("attack object must not be stringified");
		},
		valueOf() {
			throw new Error("attack object must not be coerced");
		}
	};
	assert.equal(readPreparedAttackValue(attack), 4);
	assert.equal(formatSchoolAttackBonus(attack, 1), "+5");
});

test("a non-finite school bonus does not replace a valid base", () => {
	assert.equal(formatSchoolAttackBonus({ value: 3 }, Number.NaN), "+3");
	assert.equal(formatSchoolAttackBonus({ value: 3 }, null), "+3");
});

console.log(`\n${passed} passed`);
