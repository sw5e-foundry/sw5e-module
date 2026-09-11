#!/usr/bin/env node
/**
 * Offline tests: Bug 11 Role AE movement authority.
 * No movementOverrides, Size movement fallback, or Role item speed runtime fallback.
 */
import assert from "node:assert/strict";
import {
	applyStarshipTravelFromUnslowedCombatBase,
	buildStarshipMovementControlWarning,
	deriveStarshipMovementData,
	getRolePublishedMovementFromItems,
	getStarshipMovementFieldControllers,
	getStarshipRoleMovementValidationWarnings,
	resolveStarshipMovementSourceUpdate
} from "../scripts/starship-data.mjs";
import { applyStarshipSlowedToSpeed } from "../scripts/starship-system-damage.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function roleItem({
	name="Role: Shuttle",
	space=350,
	turn=100,
	requirements="Small Starship",
	withEffect=true,
	disabled=false,
	mode=5,
	badKeys=false
}={}) {
	const changes = [
		{ key: "system.abilities.con.value", mode: 2, value: "1", priority: 1 }
	];
	if ( withEffect ) {
		if ( badKeys ) {
			changes.push(
				{ key: "attributes.movement.space", mode: 2, value: String(space), priority: 20 },
				{ key: "attributes.movement.turning", mode: 2, value: String(turn), priority: 20 }
			);
		} else {
			changes.push(
				{ key: "system.attributes.movement.speeds.space", mode, value: String(space), priority: 20 },
				{ key: "system.attributes.movement.speeds.turn", mode, value: String(turn), priority: 20 }
			);
		}
	}
	return {
		name,
		type: "feat",
		effects: [{ name, disabled, changes, transfer: true }],
		system: {
			type: { subtype: "role" },
			requirements,
			attributes: { speed: { space, turn } }
		},
		flags: {
			sw5e: {
				legacyStarshipItem: {
					system: {
						type: { subtype: "role" },
						attributes: { speed: { space, turn } }
					}
				}
			}
		}
	};
}

function sizeSystem({ baseSpaceSpeed=300, baseTurnSpeed=250, identifier="small" }={}) {
	return { baseSpaceSpeed, baseTurnSpeed, identifier };
}

function legacySystem({ routing="none" }={}) {
	return { attributes: { power: { routing } } };
}

function mockActor({ effects=[], sourceMovement={} }={}) {
	const movement = sourceMovement.speeds
		? { units: sourceMovement.units ?? "ft", ...sourceMovement, speeds: { ...sourceMovement.speeds } }
		: {
			units: sourceMovement.units ?? "ft",
			speeds: {
				space: sourceMovement.space,
				turn: sourceMovement.turn
			}
		};
	return {
		effects: { contents: effects },
		_source: { system: { attributes: { movement: { ...movement, speeds: { ...movement.speeds } } } } },
		system: { attributes: { movement: { ...movement, speeds: { ...movement.speeds } } } }
	};
}

function overrideEffect({
	id="ae1",
	name="Role: Shuttle",
	disabled=false,
	space=350,
	turn=100,
	includeSpace=true,
	includeTurn=true,
	addMode=false,
	malformed=false
}={}) {
	const changes = [];
	const mode = addMode ? 2 : 5;
	if ( malformed ) {
		changes.push(
			{ key: "attributes.movement.space", mode: 2, value: String(space) },
			{ key: "attributes.movement.turning", mode: 2, value: String(turn) }
		);
	} else {
		if ( includeSpace ) changes.push({ key: "system.attributes.movement.speeds.space", mode, value: String(space) });
		if ( includeTurn ) changes.push({ key: "system.attributes.movement.speeds.turn", mode, value: String(turn) });
	}
	return { id, name, disabled, changes };
}

test("1. No Role, underlying present — Size does not alter", () => {
	const result = deriveStarshipMovementData({
		items: [],
		legacySystem: legacySystem(),
		liveMovement: { speeds: { space: 120, turn: 80 } },
		sizeSystem: sizeSystem({ baseSpaceSpeed: 300, baseTurnSpeed: 250 })
	});
	assert.equal(result.space, 120);
	assert.equal(result.turn, 80);
	assert.notEqual(result.profileSource, "Size Fallback");
});

test("2. No Role, underlying zero — Size does not replace zero", () => {
	const result = deriveStarshipMovementData({
		items: [],
		legacySystem: legacySystem(),
		liveMovement: { speeds: { space: 0, turn: 0 } },
		sizeSystem: sizeSystem({ baseSpaceSpeed: 300, baseTurnSpeed: 250 })
	});
	assert.equal(result.space, 0);
	assert.equal(result.turn, 0);
});

test("3. Disabled Role movement effect — underlying live; Size does not restore Role", () => {
	const actor = mockActor({
		effects: [overrideEffect({ disabled: true, name: "Role: Shuttle", space: 350, turn: 100 })],
		sourceMovement: { space: 40, turn: 30 }
	});
	const controllers = getStarshipMovementFieldControllers(actor);
	assert.equal(controllers.space.controlled, false);

	const result = deriveStarshipMovementData({
		items: [roleItem({ space: 350, turn: 100 })],
		legacySystem: legacySystem(),
		liveMovement: { speeds: { space: 40, turn: 30 } },
		sizeSystem: sizeSystem({ baseSpaceSpeed: 300, baseTurnSpeed: 250 }),
		actor
	});
	assert.equal(result.space, 40);
	assert.equal(result.turn, 30);

	const resolved = resolveStarshipMovementSourceUpdate({
		underlying: { space: 40, turn: 30 },
		proposedMovement: { speeds: { space: 55, turn: 44 } },
		pendingKeys: new Set(["space", "turn"]),
		fieldControllers: controllers
	});
	assert.equal(resolved.warning, null);
	assert.deepEqual(resolved.savedFields, ["space", "turn"]);
});

test("4. Deleted Role movement effect — underlying editable; no Size fallback", () => {
	const controllers = getStarshipMovementFieldControllers(mockActor({ effects: [] }));
	const result = deriveStarshipMovementData({
		items: [],
		legacySystem: legacySystem(),
		liveMovement: { speeds: { space: 111, turn: 222 } },
		sizeSystem: sizeSystem({ baseSpaceSpeed: 300, baseTurnSpeed: 250 }),
		fieldControllers: controllers
	});
	assert.equal(result.space, 111);
	assert.equal(result.turn, 222);

	const resolved = resolveStarshipMovementSourceUpdate({
		underlying: { space: 111, turn: 222 },
		proposedMovement: { speeds: { space: 150, turn: 160 } },
		pendingKeys: new Set(["space", "turn"]),
		fieldControllers: controllers
	});
	assert.equal(resolved.warning, null);
	assert.deepEqual(resolved.savedFields, ["space", "turn"]);
});

test("5. Malformed Role effect — underlying authoritative; no Size conceal", () => {
	const controllers = getStarshipMovementFieldControllers(mockActor({
		effects: [overrideEffect({ malformed: true, name: "Bad Keys", space: 350, turn: 100 })]
	}));
	assert.equal(controllers.space.controlled, false);

	const result = deriveStarshipMovementData({
		items: [roleItem({ space: 350, turn: 100, badKeys: true })],
		legacySystem: legacySystem(),
		liveMovement: { speeds: { space: 25, turn: 15 } },
		sizeSystem: sizeSystem({ baseSpaceSpeed: 300, baseTurnSpeed: 250 }),
		fieldControllers: controllers
	});
	assert.equal(result.space, 25);
	assert.equal(result.turn, 15);
	assert.equal(getRolePublishedMovementFromItems([roleItem({ badKeys: true })]).hasPublishedEffect, false);
});

test("6. Valid Role Override — live AE values; Size does not independently affect; routing/Slowed once", () => {
	const items = [roleItem({ space: 200, turn: 500, name: "Role: Warship" })];
	const published = getRolePublishedMovementFromItems(items);
	assert.equal(published.space, 200);
	assert.equal(published.turn, 500);

	const controllers = getStarshipMovementFieldControllers(mockActor({
		effects: [overrideEffect({ name: "Role: Warship", space: 200, turn: 500 })]
	}));
	const result = deriveStarshipMovementData({
		items,
		legacySystem: legacySystem({ routing: "engines" }),
		liveMovement: { speeds: { space: 200, turn: 500 } },
		sizeSystem: sizeSystem({ baseSpaceSpeed: 999, baseTurnSpeed: 888 }),
		fieldControllers: controllers,
		slowedLevel: 1
	});
	assert.equal(result.spaceBeforeSlowed, 400);
	assert.equal(result.space, applyStarshipSlowedToSpeed(400, 1));
	assert.equal(result.turn, applyStarshipSlowedToSpeed(500, 1));
});

test("7. Explicit zero with valid effect disabled — zero remains; no fallback", () => {
	const actor = mockActor({
		effects: [overrideEffect({ disabled: true, name: "Role: Shuttle", space: 350, turn: 100 })],
		sourceMovement: { space: 0, turn: 0 }
	});
	const result = deriveStarshipMovementData({
		items: [roleItem({ space: 350, turn: 100 })],
		legacySystem: legacySystem(),
		liveMovement: { speeds: { space: 0, turn: 0 } },
		sizeSystem: sizeSystem({ baseSpaceSpeed: 300, baseTurnSpeed: 250 }),
		actor
	});
	assert.equal(result.space, 0);
	assert.equal(result.turn, 0);
});

test("8. Role/Size mismatch soft warning — Size does not substitute speed", () => {
	const items = [roleItem({ name: "Role: Warship", requirements: "Gargantuan Starship", space: 200, turn: 500 })];
	const warnings = getStarshipRoleMovementValidationWarnings(items, sizeSystem({ identifier: "small" }));
	assert.ok(warnings.some(w => w.code === "role-size-mismatch"));

	const result = deriveStarshipMovementData({
		items,
		legacySystem: legacySystem(),
		liveMovement: { speeds: { space: 200, turn: 500 } },
		sizeSystem: sizeSystem({ identifier: "small", baseSpaceSpeed: 300, baseTurnSpeed: 250 }),
		fieldControllers: getStarshipMovementFieldControllers(mockActor({
			effects: [overrideEffect({ name: "Role: Warship", space: 200, turn: 500 })]
		}))
	});
	assert.equal(result.space, 200);
	assert.equal(result.turn, 500);
});

test("9. Size change alone does not change movement", () => {
	const items = [];
	const live = { speeds: { space: 90, turn: 70 } };
	const a = deriveStarshipMovementData({
		items,
		legacySystem: legacySystem(),
		liveMovement: live,
		sizeSystem: sizeSystem({ identifier: "small", baseSpaceSpeed: 300, baseTurnSpeed: 250 })
	});
	const b = deriveStarshipMovementData({
		items,
		legacySystem: legacySystem(),
		liveMovement: live,
		sizeSystem: sizeSystem({ identifier: "huge", baseSpaceSpeed: 600, baseTurnSpeed: 400 })
	});
	assert.equal(a.space, b.space);
	assert.equal(a.turn, b.turn);
	assert.equal(a.space, 90);
});

test("No soft recovery when published OVERRIDE exists but live is zero", () => {
	const result = deriveStarshipMovementData({
		items: [roleItem({ space: 200, turn: 500 })],
		legacySystem: legacySystem(),
		liveMovement: { speeds: { space: 0, turn: 0 } },
		sizeSystem: sizeSystem()
	});
	assert.equal(result.space, 0);
	assert.equal(result.turn, 0);
});

test("No Role item attributes.speed runtime fallback when AE absent", () => {
	const result = deriveStarshipMovementData({
		items: [roleItem({ space: 350, turn: 100, withEffect: false })],
		legacySystem: legacySystem(),
		liveMovement: { speeds: { space: 0, turn: 0 } },
		sizeSystem: sizeSystem({ baseSpaceSpeed: 300, baseTurnSpeed: 250 })
	});
	assert.equal(result.space, 0);
	assert.equal(result.turn, 0);
});

test("Controlled edit warns; does not save; no movementOverrides", () => {
	const controllers = getStarshipMovementFieldControllers(mockActor({
		effects: [overrideEffect({ name: "Role: Warship", space: 200, turn: 500 })]
	}));
	const resolved = resolveStarshipMovementSourceUpdate({
		underlying: { space: 50, turn: 40 },
		proposedMovement: { speeds: { space: 999, turn: 888 } },
		pendingKeys: new Set(["space", "turn"]),
		fieldControllers: controllers
	});
	assert.deepEqual(resolved.blockedFields, ["space", "turn"]);
	assert.match(resolved.warning, /Role: Warship/);
	assert.equal("movementOverrides" in resolved.movement, false);
});

test("Partial control: Space Override, Turn free", () => {
	const controllers = getStarshipMovementFieldControllers(mockActor({
		effects: [overrideEffect({ includeTurn: false, name: "Role: Scout" })]
	}));
	const resolved = resolveStarshipMovementSourceUpdate({
		underlying: { space: 50, turn: 40 },
		proposedMovement: { speeds: { space: 999, turn: 120 } },
		pendingKeys: new Set(["space", "turn"]),
		fieldControllers: controllers
	});
	assert.deepEqual(resolved.blockedFields, ["space"]);
	assert.deepEqual(resolved.savedFields, ["turn"]);
	assert.equal(resolved.movement.speeds.turn, 120);
});

test("Add-mode / ability-only do not control base", () => {
	const addOnly = getStarshipMovementFieldControllers(mockActor({
		effects: [overrideEffect({ addMode: true, name: "Combat Thrusters" })]
	}));
	assert.equal(addOnly.space.controlled, false);
	assert.equal(buildStarshipMovementControlWarning(addOnly, ["space"]), null);
});

test("Duplicate Override effects: ambiguous soft warning", () => {
	const controllers = getStarshipMovementFieldControllers(mockActor({
		effects: [
			overrideEffect({ id: "a", name: "Role: A", space: 350, turn: 100 }),
			overrideEffect({ id: "b", name: "Role: B", space: 450, turn: 200 })
		]
	}));
	assert.equal(controllers.space.ambiguous, true);
	const result = deriveStarshipMovementData({
		items: [
			roleItem({ name: "Role: A", space: 350, turn: 100 }),
			roleItem({ name: "Role: B", space: 450, turn: 200 })
		],
		legacySystem: legacySystem(),
		liveMovement: { speeds: { space: 350, turn: 100 } },
		fieldControllers: controllers
	});
	assert.ok(result.roleWarnings.some(w => w.code === "duplicate-movement-override-space"));
	assert.ok(result.roleWarnings.some(w => w.code === "duplicate-roles"));
});

test("Ability / tier do not alter Role movement", () => {
	const items = [roleItem({ space: 350, turn: 100 })];
	const a = deriveStarshipMovementData({
		items,
		legacySystem: legacySystem(),
		liveMovement: { speeds: { space: 350, turn: 100 } },
		liveAbilities: { str: { value: 3 }, con: { value: 30 } }
	});
	const b = deriveStarshipMovementData({
		items,
		legacySystem: legacySystem(),
		liveMovement: { speeds: { space: 350, turn: 100 } },
		liveAbilities: { str: { value: 30 }, con: { value: 3 } }
	});
	assert.equal(a.space, b.space);
	assert.equal(a.turn, b.turn);
});

test("Travel not mutated by derive", () => {
	const legacy = {
		attributes: {
			power: { routing: "engines" },
			travel: { speeds: { air: "12" }, paces: { air: "fast" } }
		}
	};
	deriveStarshipMovementData({
		items: [roleItem()],
		legacySystem: legacy,
		liveMovement: { speeds: { space: 350, turn: 100 } }
	});
	assert.equal(legacy.attributes.travel.speeds.air, "12");
	assert.equal(legacy.attributes.travel.paces.air, "fast");
});

test("Routing ×2 / ×0.5 on live base once", () => {
	const engines = deriveStarshipMovementData({
		items: [roleItem({ space: 350, turn: 100 })],
		legacySystem: legacySystem({ routing: "engines" }),
		liveMovement: { speeds: { space: 350, turn: 100 } }
	});
	assert.equal(engines.space, 700);
	assert.equal(engines.turn, 100);

	const shields = deriveStarshipMovementData({
		items: [roleItem({ space: 350, turn: 100 })],
		legacySystem: legacySystem({ routing: "shields" }),
		liveMovement: { speeds: { space: 350, turn: 100 } }
	});
	assert.equal(shields.space, 175);
});

test("A. Slowed exact mapping base 200/500", () => {
	const items = [roleItem({ space: 200, turn: 500, name: "Role: Warship" })];
	const actor = mockActor({
		effects: [overrideEffect({ name: "Role: Warship", space: 200, turn: 500 })],
		sourceMovement: { space: 10, turn: 10 }
	});
	const expect = {
		0: [200, 500],
		1: [50, 350],
		2: [0, 250],
		3: [0, 200],
		4: [0, 0]
	};
	for ( const [level, [space, turn]] of Object.entries(expect) ) {
		const result = deriveStarshipMovementData({
			items,
			actor,
			legacySystem: legacySystem(),
			liveMovement: { speeds: { space: 999, turn: 999 } },
			slowedLevel: Number(level)
		});
		assert.equal(result.space, space, `level ${level} space`);
		assert.equal(result.turn, turn, `level ${level} turn`);
	}
});

test("B. Travel fill uses unslowed Space; Slowed does not change travel fill", () => {
	const items = [roleItem({ space: 200, turn: 500, name: "Role: Warship" })];
	const actor = mockActor({
		effects: [overrideEffect({ name: "Role: Warship", space: 200, turn: 500 })],
		sourceMovement: { space: 0, turn: 0 }
	});
	actor._source.system.attributes.travel = { speeds: {}, paces: {}, time: 24, pace: "normal" };

	const mkModel = () => ({
		attributes: {
			movement: { units: "ft" },
			travel: { speeds: {}, paces: {}, time: 24, pace: "normal", units: null }
		}
	});

	for ( const level of [0, 1, 2, 3, 4] ) {
		const movement = deriveStarshipMovementData({
			items,
			actor,
			legacySystem: legacySystem(),
			slowedLevel: level
		});
		const model = mkModel();
		applyStarshipTravelFromUnslowedCombatBase(model, actor, movement);
		assert.equal(model.attributes.travel.speeds.air, 20, `travel speed at slowed ${level}`);
		assert.equal(model.attributes.travel.paces.air, 480, `travel pace at slowed ${level}`);
	}
});

test("C. Level transitions never compound prior Slowed output", () => {
	const items = [roleItem({ space: 200, turn: 500, name: "Role: Warship" })];
	const actor = mockActor({
		effects: [overrideEffect({ name: "Role: Warship", space: 200, turn: 500 })],
		sourceMovement: { space: 10, turn: 10 }
	});
	const sequence = [0, 1, 2, 3, 4, 1, 0, 3, 0, 4, 0];
	const expect = {
		0: [200, 500],
		1: [50, 350],
		2: [0, 250],
		3: [0, 200],
		4: [0, 0]
	};
	let prior = null;
	for ( const level of sequence ) {
		const result = deriveStarshipMovementData({
			items,
			actor,
			legacySystem: legacySystem(),
			liveMovement: prior ?? { speeds: { space: 200, turn: 500 } },
			slowedLevel: level
		});
		assert.equal(result.space, expect[level][0], `transition→${level} space`);
		assert.equal(result.turn, expect[level][1], `transition→${level} turn`);
		prior = { speeds: { space: result.space, turn: result.turn } };
	}
});

test("D. Repeated derive at same level does not compound", () => {
	const items = [roleItem({ space: 200, turn: 500, name: "Role: Warship" })];
	const actor = mockActor({
		effects: [overrideEffect({ name: "Role: Warship", space: 200, turn: 500 })],
		sourceMovement: { space: 10, turn: 10 }
	});
	let live = { speeds: { space: 200, turn: 500 } };
	for ( let i = 0; i < 5; i++ ) {
		const result = deriveStarshipMovementData({
			items,
			actor,
			legacySystem: legacySystem(),
			liveMovement: live,
			slowedLevel: 1
		});
		assert.equal(result.space, 50);
		assert.equal(result.turn, 350);
		live = { speeds: { space: result.space, turn: result.turn } };
	}
});

test("E. Routing then Slowed once (engines)", () => {
	const items = [roleItem({ space: 200, turn: 500, name: "Role: Warship" })];
	const actor = mockActor({
		effects: [overrideEffect({ name: "Role: Warship", space: 200, turn: 500 })],
		sourceMovement: { space: 10, turn: 10 }
	});
	const result = deriveStarshipMovementData({
		items,
		actor,
		legacySystem: legacySystem({ routing: "engines" }),
		slowedLevel: 1
	});
	assert.equal(result.spaceBeforeSlowed, 400);
	assert.equal(result.space, applyStarshipSlowedToSpeed(400, 1));
	assert.equal(result.turn, 350);
});

test("F. Add-mode delta applies before Slowed; does not control edit warning", () => {
	const actor = mockActor({
		effects: [
			overrideEffect({ name: "Role: Warship", space: 200, turn: 500 }),
			overrideEffect({ id: "ct", name: "Combat Thrusters", addMode: true, space: 50, turn: 0, includeTurn: false })
		],
		sourceMovement: { space: 10, turn: 10 }
	});
	const controllers = getStarshipMovementFieldControllers(actor);
	assert.equal(controllers.space.controlled, true);
	const thrusterOnly = getStarshipMovementFieldControllers(mockActor({
		effects: [overrideEffect({ addMode: true, name: "Combat Thrusters", space: 50 })]
	}));
	assert.equal(thrusterOnly.space.controlled, false);

	const result = deriveStarshipMovementData({
		items: [roleItem({ space: 200, turn: 500, name: "Role: Warship" })],
		actor,
		legacySystem: legacySystem(),
		slowedLevel: 1
	});
	assert.equal(result.spaceBeforeSlowed, 250);
	assert.equal(result.space, applyStarshipSlowedToSpeed(250, 1));
});

test("G. Removal / inactive restores routed Role base; underlying unchanged", () => {
	const actor = mockActor({
		effects: [overrideEffect({ name: "Role: Warship", space: 200, turn: 500 })],
		sourceMovement: { space: 40, turn: 30 }
	});
	const slowed = deriveStarshipMovementData({
		items: [roleItem({ space: 200, turn: 500, name: "Role: Warship" })],
		actor,
		legacySystem: legacySystem({ routing: "engines" }),
		slowedLevel: 1
	});
	assert.equal(slowed.space, applyStarshipSlowedToSpeed(400, 1));
	const cleared = deriveStarshipMovementData({
		items: [roleItem({ space: 200, turn: 500, name: "Role: Warship" })],
		actor,
		legacySystem: legacySystem({ routing: "engines" }),
		slowedLevel: 0
	});
	assert.equal(cleared.space, 400);
	assert.equal(cleared.turn, 500);
	assert.equal(actor._source.system.attributes.movement.speeds.space, 40);
	assert.equal(actor._source.system.attributes.movement.speeds.turn, 30);
});

test("Stored travel is preserved under Slowed fill", () => {
	const actor = mockActor({
		effects: [overrideEffect({ name: "Role: Warship", space: 200, turn: 500 })],
		sourceMovement: { space: 0, turn: 0 }
	});
	actor._source.system.attributes.travel = {
		speeds: { air: "12" },
		paces: { air: "100" },
		time: 24,
		pace: "normal"
	};
	const movement = deriveStarshipMovementData({
		items: [roleItem({ space: 200, turn: 500, name: "Role: Warship" })],
		actor,
		legacySystem: legacySystem(),
		slowedLevel: 3
	});
	const model = {
		attributes: {
			movement: { units: "ft" },
			travel: { speeds: { air: 12 }, paces: { air: 100 }, time: 24, pace: "normal" }
		}
	};
	applyStarshipTravelFromUnslowedCombatBase(model, actor, movement);
	assert.equal(model.attributes.travel.speeds.air, 12);
	assert.equal(model.attributes.travel.paces.air, 100);
});

console.log(`\n${passed} passed`);
