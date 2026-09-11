#!/usr/bin/env node
/**
 * Pure-logic tests: Foundry 14 string Active Effect `type`, obsolete-key rejection,
 * and Space/Turn controller equivalence. Does not prove Foundry AE application.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	STARSHIP_ACTIVE_EFFECT_TYPE_ADD,
	STARSHIP_ACTIVE_EFFECT_TYPE_OVERRIDE,
	STARSHIP_ROLE_MOVEMENT_SPACE_KEY,
	STARSHIP_ROLE_MOVEMENT_TURN_KEY,
	deriveStarshipMovementData,
	getRolePublishedMovementFromItems,
	getStarshipMovementAddDeltas,
	getStarshipMovementFieldControllers,
	getStarshipMovementOverrideValues,
	isCanonicalRoleMovementOverrideChange
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
	const speeds = {
		space: sourceMovement.space,
		turn: sourceMovement.turn
	};
	return {
		effects: { contents: effects },
		flags: flags ?? {},
		_source: { system: { attributes: { movement: { units: "ft", speeds: { ...speeds } } } } },
		system: { attributes: { movement: { units: "ft", speeds: { ...speeds } } } }
	};
}

function change({ key, type, value, priority=20, mode }={}) {
	const entry = { key, type, value: String(value), priority };
	if ( mode !== undefined ) entry.mode = mode;
	return entry;
}

test("constants match Foundry 14.367 string types", () => {
	assert.equal(STARSHIP_ACTIVE_EFFECT_TYPE_OVERRIDE, "override");
	assert.equal(STARSHIP_ACTIVE_EFFECT_TYPE_ADD, "add");
	assert.equal(STARSHIP_ROLE_MOVEMENT_SPACE_KEY, "system.attributes.movement.speeds.space");
	assert.equal(STARSHIP_ROLE_MOVEMENT_TURN_KEY, "system.attributes.movement.speeds.turn");
});

test("supported OVERRIDE and ADD string types are handled; unrelated types ignored", () => {
	assert.equal(isCanonicalRoleMovementOverrideChange(change({
		key: STARSHIP_ROLE_MOVEMENT_SPACE_KEY, type: "override", value: 99
	})), true);
	assert.equal(isCanonicalRoleMovementOverrideChange(change({
		key: STARSHIP_ROLE_MOVEMENT_SPACE_KEY, type: "add", value: 50
	})), false);
	assert.equal(isCanonicalRoleMovementOverrideChange(change({
		key: STARSHIP_ROLE_MOVEMENT_SPACE_KEY, type: "upgrade", value: 99
	})), false);
	assert.equal(isCanonicalRoleMovementOverrideChange(change({
		key: STARSHIP_ROLE_MOVEMENT_SPACE_KEY, mode: 5, value: 99
	})), false);

	const addActor = mockActor({
		effects: [{
			id: "add1",
			name: "Combat Thrusters",
			disabled: false,
			changes: [change({ key: STARSHIP_ROLE_MOVEMENT_SPACE_KEY, type: "add", value: 50 })]
		}]
	});
	assert.equal(getStarshipMovementAddDeltas(addActor).space, 50);
	assert.equal(getStarshipMovementFieldControllers(addActor).space.controlled, false);
});

test("obsolete sibling keys are ignored even with string OVERRIDE", () => {
	const obsolete = {
		id: "role-old",
		name: "Role: Attack Fighter",
		disabled: false,
		changes: [
			change({ key: "system.attributes.movement.space", type: "override", value: 350 }),
			change({ key: "system.attributes.movement.turn", type: "override", value: 100 })
		]
	};
	const actor = mockActor({
		effects: [obsolete],
		sourceMovement: { space: 320, turn: 250 }
	});
	assert.equal(getStarshipMovementFieldControllers(actor).space.controlled, false);
	assert.equal(getStarshipMovementFieldControllers(actor).turn.controlled, false);
	assert.equal(getStarshipMovementOverrideValues(actor).hasPublishedEffect, false);
	assert.equal(getRolePublishedMovementFromItems([{
		name: "Role: Attack Fighter",
		type: "feat",
		effects: [obsolete],
		system: { type: { subtype: "role" } }
	}]).hasPublishedEffect, false);

	const result = deriveStarshipMovementData({
		items: [],
		legacySystem: { attributes: { movement: { space: 350, turn: 100 } } },
		liveMovement: { speeds: { space: 350, turn: 100 }, space: 350, turn: 100 },
		actor,
		fieldControllers: getStarshipMovementFieldControllers(actor)
	});
	assert.equal(result.space, 320);
	assert.equal(result.turn, 250);
});

test("Space and Turn OVERRIDE from actor AE beat _source and restore when uncontrolled", () => {
	const effect = {
		id: "manual",
		name: "VAL Manual Speeds AE",
		disabled: false,
		changes: [
			change({ key: STARSHIP_ROLE_MOVEMENT_SPACE_KEY, type: "override", value: 99 }),
			change({ key: STARSHIP_ROLE_MOVEMENT_TURN_KEY, type: "override", value: 11 })
		]
	};
	const actor = mockActor({
		effects: [effect],
		sourceMovement: { space: 320, turn: 250 }
	});
	const controllers = getStarshipMovementFieldControllers(actor);
	assert.equal(controllers.space.controlled, true);
	assert.equal(controllers.turn.controlled, true);
	const enabled = deriveStarshipMovementData({
		items: [],
		legacySystem: {},
		liveMovement: { speeds: { space: 320, turn: 250 } },
		actor,
		fieldControllers: controllers
	});
	assert.equal(enabled.space, 99);
	assert.equal(enabled.turn, 11);

	const disabledActor = mockActor({
		effects: [{ ...effect, disabled: true }],
		sourceMovement: { space: 320, turn: 250 }
	});
	const restored = deriveStarshipMovementData({
		items: [],
		legacySystem: {},
		liveMovement: { speeds: { space: 320, turn: 250 } },
		actor: disabledActor,
		fieldControllers: getStarshipMovementFieldControllers(disabledActor)
	});
	assert.equal(restored.space, 320);
	assert.equal(restored.turn, 250);
});

test("numeric-only mode on canonical keys is not a controller", () => {
	const actor = mockActor({
		effects: [{
			id: "legacy-mode",
			name: "Numeric Mode Only",
			disabled: false,
			changes: [
				{ key: STARSHIP_ROLE_MOVEMENT_SPACE_KEY, mode: 5, value: "99" },
				{ key: STARSHIP_ROLE_MOVEMENT_TURN_KEY, mode: 5, value: "11" }
			]
		}],
		sourceMovement: { space: 320, turn: 250 }
	});
	assert.equal(getStarshipMovementFieldControllers(actor).space.controlled, false);
	const result = deriveStarshipMovementData({
		items: [],
		legacySystem: {},
		liveMovement: { speeds: { space: 320, turn: 250 } },
		actor,
		fieldControllers: getStarshipMovementFieldControllers(actor)
	});
	assert.equal(result.space, 320);
	assert.equal(result.turn, 250);
});

test("movement runtime source does not read numeric mode", () => {
	const text = fs.readFileSync(STARSHIP_DATA, "utf8");
	assert.equal(/Number\(\s*change\??\.mode\s*\)/.test(text), false);
	assert.equal(/change\?\.mode/.test(text), false);
});

console.log(`\n${passed} passed`);
