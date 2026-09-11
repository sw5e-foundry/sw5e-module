#!/usr/bin/env node
/**
 * Pure-logic tests for dnd5e 6.0.0 Maneuver chat-card subtitle/property shapes.
 * Does not prove rendered chat HTML, sheets, or Foundry Item preparation.
 */
import assert from "node:assert/strict";
import {
	adaptManeuverCardContext,
	maneuverChatPropertyDescriptors
} from "../scripts/maneuver-card-data.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

test("subtitle remains an array and keeps the SW5e type label", () => {
	const context = adaptManeuverCardContext(
		{ subtitle: ["Maneuver"], properties: [{ type: "text", text: "Item", identity: true }] },
		{ typeLabel: "General" }
	);
	assert.equal(Array.isArray(context.subtitle), true);
	assert.deepEqual(context.subtitle, ["Maneuver", "General"]);
	assert.equal(context.isManeuver, true);
});

test("string subtitle is replaced with an array containing the SW5e label", () => {
	const context = adaptManeuverCardContext(
		{ subtitle: "General", properties: [] },
		{ typeLabel: "General" }
	);
	assert.equal(Array.isArray(context.subtitle), true);
	assert.deepEqual(context.subtitle, ["General"]);
});

test("superclass property descriptors are preserved", () => {
	const superProp = { type: "text", text: "Maneuver", identity: true };
	const context = adaptManeuverCardContext(
		{ subtitle: ["Maneuver"], properties: [superProp] },
		{ typeLabel: "Commander", extraProperties: [{ type: "text", text: "Concentration" }] }
	);
	assert.equal(context.properties[0], superProp);
	assert.equal(context.properties[1].type, "text");
	assert.equal(context.properties[1].text, "Concentration");
});

test("untyped extra properties are not appended", () => {
	const context = adaptManeuverCardContext(
		{ subtitle: [], properties: [] },
		{ extraProperties: ["Concentration", { text: "no-type" }, { type: "text", text: "ok" }] }
	);
	assert.equal(context.properties.length, 1);
	assert.equal(context.properties[0].type, "text");
});

test("chat property tags become typed descriptors", () => {
	const props = maneuverChatPropertyDescriptors(["Concentration", "General"]);
	assert.equal(props.every(p => p && typeof p === "object" && p.type), true);
	assert.deepEqual(props, [
		{ type: "text", text: "Concentration" },
		{ type: "text", text: "General" }
	]);
});

test("already-typed chat properties pass through", () => {
	const existing = { type: "property", property: "concentration" };
	assert.deepEqual(maneuverChatPropertyDescriptors([existing, ""]), [existing]);
});

console.log(`\n${passed} passed`);
