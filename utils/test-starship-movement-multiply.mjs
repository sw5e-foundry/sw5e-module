#!/usr/bin/env node
/**
 * Pure-logic tests: canonical starship movement multiply in the derived DTO.
 * Prepared fixtures use string `type` only. Does not fake Foundry Actor preparation.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	STARSHIP_ACTIVE_EFFECT_TYPE_ADD,
	STARSHIP_ACTIVE_EFFECT_TYPE_MULTIPLY,
	STARSHIP_ACTIVE_EFFECT_TYPE_OVERRIDE,
	STARSHIP_ROLE_MOVEMENT_SPACE_KEY,
	STARSHIP_ROLE_MOVEMENT_TURN_KEY,
	deriveStarshipMovementData,
	getStarshipMovementAddDeltas,
	getStarshipMovementFieldControllers,
	getStarshipMovementMultiplyFactors
} from "../scripts/starship-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STARSHIP_DATA = path.join(ROOT, "scripts", "starship-data.mjs");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function mockActor({ effects=[], sourceMovement={ space: 320, turn: 250 }, flags=null }={}) {
	const speeds = {};
	if ( sourceMovement.space != null ) speeds.space = sourceMovement.space;
	if ( sourceMovement.turn != null ) speeds.turn = sourceMovement.turn;
	return {
		effects: { contents: effects },
		flags: flags ?? {},
		_source: { system: { attributes: { movement: { units: "ft", speeds: { ...speeds } } } } },
		system: { attributes: { movement: { units: "ft", speeds: { ...speeds } } } }
	};
}

function change({ key, type, value, priority=20 }={}) {
	return { key, type, value: String(value), priority };
}

function derive(actor, liveMovement) {
	return deriveStarshipMovementData({
		items: [],
		legacySystem: {},
		liveMovement: liveMovement ?? actor.system.attributes.movement,
		actor,
		fieldControllers: getStarshipMovementFieldControllers(actor)
	});
}

test("constants match Foundry 14 string multiply type and canonical keys", () => {
	assert.equal(STARSHIP_ACTIVE_EFFECT_TYPE_MULTIPLY, "multiply");
	assert.equal(STARSHIP_ACTIVE_EFFECT_TYPE_OVERRIDE, "override");
	assert.equal(STARSHIP_ACTIVE_EFFECT_TYPE_ADD, "add");
	assert.equal(STARSHIP_ROLE_MOVEMENT_TURN_KEY, "system.attributes.movement.speeds.turn");
	assert.equal(STARSHIP_ROLE_MOVEMENT_SPACE_KEY, "system.attributes.movement.speeds.space");
});

test("canonical Turn multiply is recognized and Space is unchanged", () => {
	const actor = mockActor({
		effects: [{
			id: "overload",
			name: "Overload Systems",
			disabled: false,
			changes: [
				change({ key: STARSHIP_ROLE_MOVEMENT_TURN_KEY, type: "multiply", value: "2" }),
				change({ key: "system.attributes.movement.fly", type: "multiply", value: ".5" })
			]
		}]
	});
	assert.equal(getStarshipMovementMultiplyFactors(actor).turn, 2);
	assert.equal(getStarshipMovementMultiplyFactors(actor).space, 1);
	assert.equal(getStarshipMovementFieldControllers(actor).turn.controlled, false);
	assert.equal(getStarshipMovementAddDeltas(actor).turn, 0);
	const result = derive(actor);
	assert.equal(result.turn, 500);
	assert.equal(result.space, 320);
	assert.equal("space" in result && "turn" in result, true);
});

test("sibling Turn multiply is ignored", () => {
	const actor = mockActor({
		effects: [{
			id: "sibling",
			name: "Obsolete Turn Multiply",
			disabled: false,
			changes: [change({ key: "system.attributes.movement.turn", type: "multiply", value: "2" })]
		}]
	});
	assert.equal(getStarshipMovementMultiplyFactors(actor).turn, 1);
	const result = derive(actor);
	assert.equal(result.turn, 250);
	assert.equal(result.space, 320);
});

test("prepared live Turn is not multiplied again", () => {
	const actor = mockActor({
		effects: [{
			id: "overload",
			name: "Overload Systems",
			disabled: false,
			changes: [change({ key: STARSHIP_ROLE_MOVEMENT_TURN_KEY, type: "multiply", value: "2" })]
		}]
	});
	actor.system.attributes.movement.speeds.turn = 500;
	const result = derive(actor, { speeds: { space: 320, turn: 500 } });
	assert.equal(result.turn, 500);
	assert.equal(result.space, 320);
});

test("OVERRIDE controller supersedes multiply on the same field", () => {
	const actor = mockActor({
		effects: [
			{
				id: "role",
				name: "Role: Worker",
				disabled: false,
				changes: [
					change({ key: STARSHIP_ROLE_MOVEMENT_SPACE_KEY, type: "override", value: "350" }),
					change({ key: STARSHIP_ROLE_MOVEMENT_TURN_KEY, type: "override", value: "100" })
				]
			},
			{
				id: "overload",
				name: "Overload Systems",
				disabled: false,
				changes: [change({ key: STARSHIP_ROLE_MOVEMENT_TURN_KEY, type: "multiply", value: "2" })]
			}
		]
	});
	assert.equal(getStarshipMovementFieldControllers(actor).turn.controlled, true);
	const result = derive(actor);
	assert.equal(result.turn, 100);
	assert.equal(result.space, 350);
});

test("ADD is applied before multiply and Space stays unchanged", () => {
	const actor = mockActor({
		effects: [
			{
				id: "thrusters",
				name: "Combat Thrusters, Mk I",
				disabled: false,
				changes: [change({ key: STARSHIP_ROLE_MOVEMENT_TURN_KEY, type: "add", value: "-50" })]
			},
			{
				id: "overload",
				name: "Overload Systems",
				disabled: false,
				changes: [change({ key: STARSHIP_ROLE_MOVEMENT_TURN_KEY, type: "multiply", value: "2" })]
			}
		]
	});
	assert.equal(getStarshipMovementAddDeltas(actor).turn, -50);
	const result = derive(actor);
	assert.equal(result.turn, 400);
	assert.equal(result.space, 320);
});

test("base Turn with no multiply is unchanged", () => {
	const actor = mockActor({ effects: [] });
	const result = derive(actor);
	assert.equal(result.turn, 250);
	assert.equal(result.space, 320);
});

test("disabled multiply restores the unmultiplied base", () => {
	const enabled = mockActor({
		effects: [{
			id: "overload",
			name: "Overload Systems",
			disabled: false,
			changes: [change({ key: STARSHIP_ROLE_MOVEMENT_TURN_KEY, type: "multiply", value: "2" })]
		}]
	});
	const disabled = mockActor({
		effects: [{
			id: "overload",
			name: "Overload Systems",
			disabled: true,
			changes: [change({ key: STARSHIP_ROLE_MOVEMENT_TURN_KEY, type: "multiply", value: "2" })]
		}]
	});
	assert.equal(derive(enabled).turn, 500);
	assert.equal(derive(disabled).turn, 250);
});

test("_source speeds are not mutated by derive", () => {
	const actor = mockActor({
		effects: [{
			id: "overload",
			name: "Overload Systems",
			disabled: false,
			changes: [change({ key: STARSHIP_ROLE_MOVEMENT_TURN_KEY, type: "multiply", value: "2" })]
		}]
	});
	const before = JSON.stringify(actor._source.system.attributes.movement);
	const result = derive(actor);
	assert.equal(result.turn, 500);
	assert.equal(JSON.stringify(actor._source.system.attributes.movement), before);
	assert.equal(actor._source.system.attributes.movement.speeds.turn, 250);
});

test("flag chassis Turn multiply does not require _source.speeds.turn", () => {
	const actor = mockActor({
		effects: [{
			id: "overload",
			name: "Overload Systems",
			disabled: false,
			changes: [change({ key: STARSHIP_ROLE_MOVEMENT_TURN_KEY, type: "multiply", value: "2" })]
		}],
		sourceMovement: {},
		flags: {
			sw5e: {
				legacyStarshipActor: {
					type: "starship",
					system: { attributes: { movement: { space: 300, turn: 250, units: "ft" } } }
				}
			}
		}
	});
	const result = derive(actor, { speeds: { space: 300, turn: 250 } });
	assert.equal(result.turn, 500);
	assert.equal(result.space, 300);
});

test("unsupported types and numeric-only mode are not treated as multiply", () => {
	const actor = mockActor({
		effects: [{
			id: "noise",
			name: "Unsupported",
			disabled: false,
			changes: [
				change({ key: STARSHIP_ROLE_MOVEMENT_TURN_KEY, type: "upgrade", value: "2" }),
				change({ key: STARSHIP_ROLE_MOVEMENT_TURN_KEY, type: "custom", value: "2" }),
				{ key: STARSHIP_ROLE_MOVEMENT_TURN_KEY, mode: 1, value: "2", priority: 20 }
			]
		}]
	});
	assert.equal(getStarshipMovementMultiplyFactors(actor).turn, 1);
	assert.equal(derive(actor).turn, 250);
});

test("movement runtime source does not fall back to numeric mode", () => {
	const text = fs.readFileSync(STARSHIP_DATA, "utf8");
	assert.equal(/Number\(\s*change\??\.mode\s*\)/.test(text), false);
	assert.equal(/change\?\.mode/.test(text), false);
});

console.log(`\n${passed} passed`);
