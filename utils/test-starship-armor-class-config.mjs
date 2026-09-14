#!/usr/bin/env node
/**
 * Pure-logic tests for starship vs non-starship Armor Class formulaOptions filtering.
 * Does not prove ArmorClassConfig rendering or formula selection in Foundry.
 */
import assert from "node:assert/strict";
import { filterArmorClassCalculationOptions } from "../scripts/patch/starship-armor-class-config.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

const FORMULA_OPTIONS = [
	{ value: "flat", label: "Flat" },
	{ value: "natural", label: "Natural Armor" },
	{ value: "default", label: "Equipped Armor" },
	{ value: "unarmoredMonk", label: "Unarmored Defense (Monk)" },
	{ value: "starship", label: "Starship" },
	{ value: "custom", label: "Custom Formula" }
];

test("6.0 formulaOptions {value,label} input is accepted", () => {
	const out = filterArmorClassCalculationOptions(FORMULA_OPTIONS, true);
	assert.equal(Array.isArray(out), true);
	assert.ok(out.some(e => e.value === "starship"));
});

test("starship retains intended formulas including starship", () => {
	const values = filterArmorClassCalculationOptions(FORMULA_OPTIONS, true)
		.filter(e => !e.rule)
		.map(e => e.value);
	assert.deepEqual(values, ["flat", "natural", "default", "starship", "custom"]);
});

test("non-starship drops starship-only formulas", () => {
	const values = filterArmorClassCalculationOptions(FORMULA_OPTIONS, false)
		.filter(e => !e.rule)
		.map(e => e.value);
	assert.equal(values.includes("starship"), false);
	assert.ok(values.includes("unarmoredMonk"));
	assert.ok(values.includes("default"));
});

test("unrelated option fields are preserved", () => {
	const input = [{ value: "flat", label: "Flat", extra: 7 }];
	const out = filterArmorClassCalculationOptions(input, true);
	const flat = out.find(e => e.value === "flat");
	assert.equal(flat.extra, 7);
	assert.equal(flat.label, "Flat");
});

test("non-array input is returned unchanged", () => {
	assert.equal(filterArmorClassCalculationOptions(null, true), null);
	assert.deepEqual(filterArmorClassCalculationOptions({ value: "flat" }, false), { value: "flat" });
});

console.log(`\n${passed} passed`);
