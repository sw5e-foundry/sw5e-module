#!/usr/bin/env node
/**
 * Pure-logic tests: dnd5e 6.0 MovementSensesConfig context filtering.
 * Models the 6.0 `context.types` shape. Does not prove Foundry rendering.
 */
import assert from "node:assert/strict";
import {
	filterNonStarshipMovementContext,
	resolveMovementTypeKey
} from "../scripts/starship-movement-context.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

const ORDERED_KEYS = ["walk", "burrow", "climb", "fly", "jump", "swim", "space", "turn"];
const STOCK_KEYS = ["walk", "burrow", "climb", "fly", "jump", "swim"];

function sixContext(extraEntry=null) {
	const sharedModel = { name: "value" };
	const fields = {
		bonus: { name: "bonus" },
		multiplier: { name: "multiplier" },
		speeds: { model: sharedModel },
		units: { name: "units" },
		hover: { name: "hover" }
	};
	const types = ORDERED_KEYS.map(key => ({
		field: sharedModel,
		label: key,
		name: `system.attributes.movement.speeds.${key}`,
		value: key === "walk" ? 30 : 0,
		placeholder: ""
	}));
	if ( extraEntry ) types.push(extraEntry);
	return { fields, types, extras: [{ field: fields.bonus, name: "system.attributes.movement.bonus" }] };
}

test("6.0 shared FormulaField does not resolve via field.name value", () => {
	const context = sixContext();
	const spaceIndex = ORDERED_KEYS.indexOf("space");
	const key = resolveMovementTypeKey(context.types[spaceIndex], spaceIndex, ORDERED_KEYS, context.fields);
	assert.equal(key, "space");
	assert.notEqual(key, "value");
});

test("character context excludes Space and Turn and keeps stock speeds", () => {
	const context = sixContext();
	const unrelated = context.extras.slice();
	filterNonStarshipMovementContext(context, ORDERED_KEYS);
	const keys = context.types.map(entry => resolveMovementTypeKey(entry, ORDERED_KEYS.indexOf(entry.label), ORDERED_KEYS, context.fields));
	assert.deepEqual(keys, STOCK_KEYS);
	assert.equal(context.types.some(entry => entry.name.endsWith(".space") || entry.name.endsWith(".turn")), false);
	assert.deepEqual(context.extras, unrelated);
	assert.ok(context.fields.units);
	assert.ok(context.fields.hover);
});

test("ordinary vehicle context excludes Space and Turn", () => {
	const context = sixContext();
	filterNonStarshipMovementContext(context, ORDERED_KEYS);
	const names = context.types.map(entry => entry.name);
	assert.equal(names.includes("system.attributes.movement.speeds.space"), false);
	assert.equal(names.includes("system.attributes.movement.speeds.turn"), false);
	assert.ok(names.includes("system.attributes.movement.speeds.walk"));
	assert.ok(names.includes("system.attributes.movement.speeds.fly"));
});

test("starship context is unfiltered and retains Space and Turn", () => {
	const context = sixContext();
	const names = context.types.map(entry => entry.name);
	assert.ok(names.includes("system.attributes.movement.speeds.space"));
	assert.ok(names.includes("system.attributes.movement.speeds.turn"));
	assert.ok(names.includes("system.attributes.movement.speeds.walk"));
	assert.equal(context.types.length, ORDERED_KEYS.length);
});

test("unrelated context entries remain after filter", () => {
	const extra = { field: { name: "special" }, label: "Special", name: "system.attributes.movement.special", value: "" };
	const context = sixContext(extra);
	filterNonStarshipMovementContext(context, ORDERED_KEYS);
	assert.ok(context.types.some(entry => entry.name === "system.attributes.movement.special"));
	assert.equal(context.extras.length, 1);
});

console.log(`\n${passed} passed`);
