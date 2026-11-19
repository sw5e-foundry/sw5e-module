#!/usr/bin/env node
/**
 * Collision tests for a single size-item hull/shield dice update.
 * Two full flag replacements for the same embedded item must not be emitted.
 */
import assert from "node:assert/strict";
import {
	buildCombinedSizeDiceUpdate,
	buildStarshipRepairSizeDiceUpdate,
	mergeEmbeddedItemUpdates
} from "../scripts/starship-dice-rolls.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function makeActor({
	hullDiceUsed = 0,
	shldDiceUsed = 0,
	hullDiceStart = 3,
	includeSizeItem = true
} = {}) {
	const sizeItem = includeSizeItem
		? {
			_id: "size1",
			id: "size1",
			type: "feat",
			flags: {
				sw5e: {
					legacyStarshipSize: {
						tier: 0,
						hullDice: "d6",
						hullDiceStart,
						hullDiceUsed,
						shldDice: "d6",
						shldDiceStart: 3,
						shldDiceUsed,
						modBaseCap: 20,
						modMaxSuitesBase: 0,
						modMaxSuitesMult: 1
					}
				}
			},
			system: { identifier: "small", advancement: [] }
		}
		: null;
	const items = sizeItem ? [sizeItem] : [];
	return {
		type: "vehicle",
		flags: { sw5e: { legacyStarshipActor: { type: "starship", system: { details: { tier: 0 } } } } },
		system: { abilities: { con: { value: 10 } }, traits: { size: "sm" }, attributes: { hp: {} } },
		_source: { system: {}, items },
		items: { contents: items }
	};
}

function legacyOf(update) {
	return update?.["flags.sw5e.legacyStarshipSize"];
}

test("hull only: one update changes hullDiceUsed and keeps the shield count", () => {
	const actor = makeActor({ hullDiceUsed: 1, shldDiceUsed: 2 });
	const result = buildStarshipRepairSizeDiceUpdate(actor, { hullDiceSpend: 1 });
	assert.equal(result.itemUpdates.length, 1);
	assert.equal(result.hullDiceSpent, 1);
	assert.equal(result.shieldDiceRecovered, 0);
	assert.equal(legacyOf(result.itemUpdates[0]).hullDiceUsed, 2);
	assert.equal(legacyOf(result.itemUpdates[0]).shldDiceUsed, 2);
});

test("shield only: one update clears shield dice and keeps the hull count", () => {
	const actor = makeActor({ hullDiceUsed: 1, shldDiceUsed: 2 });
	const result = buildStarshipRepairSizeDiceUpdate(actor, { recoverShield: true });
	assert.equal(result.itemUpdates.length, 1);
	assert.equal(result.hullDiceSpent, 0);
	assert.equal(result.shieldDiceRecovered, 2);
	assert.equal(legacyOf(result.itemUpdates[0]).hullDiceUsed, 1);
	assert.equal(legacyOf(result.itemUpdates[0]).shldDiceUsed, 0);
});

test("hull and shield together: a single update carries both changes", () => {
	const actor = makeActor({ hullDiceUsed: 1, shldDiceUsed: 2 });
	const result = buildStarshipRepairSizeDiceUpdate(actor, { hullDiceSpend: 1, recoverShield: true });
	assert.equal(result.itemUpdates.length, 1);
	assert.equal(result.itemUpdates[0]._id, "size1");
	assert.equal(legacyOf(result.itemUpdates[0]).hullDiceUsed, 2);
	assert.equal(legacyOf(result.itemUpdates[0]).shldDiceUsed, 0);
	const ids = result.itemUpdates.map(update => update._id);
	assert.equal(new Set(ids).size, 1);
});

test("insufficient hull dice: a spend above the remaining pool is clamped", () => {
	const actor = makeActor({ hullDiceUsed: 2, hullDiceStart: 3 });
	const result = buildStarshipRepairSizeDiceUpdate(actor, { hullDiceSpend: 5 });
	assert.equal(result.hullDiceSpent, 1);
	assert.equal(result.itemUpdates.length, 1);
	assert.equal(legacyOf(result.itemUpdates[0]).hullDiceUsed, 3);
});

test("insufficient hull dice: no update when none remain", () => {
	const actor = makeActor({ hullDiceUsed: 3, hullDiceStart: 3 });
	const result = buildStarshipRepairSizeDiceUpdate(actor, { hullDiceSpend: 1 });
	assert.equal(result.hullDiceSpent, 0);
	assert.deepEqual(result.itemUpdates, []);
});

test("shield already at maximum: recovery does not write a shield change", () => {
	const actor = makeActor({ shldDiceUsed: 0, hullDiceUsed: 1 });
	const result = buildStarshipRepairSizeDiceUpdate(actor, { recoverShield: true });
	assert.equal(result.shieldDiceRecovered, 0);
	assert.deepEqual(result.itemUpdates, []);
});

test("recovery value 0: restoring an unused hull pool writes nothing", () => {
	const actor = makeActor({ hullDiceUsed: 0, shldDiceUsed: 0 });
	const result = buildStarshipRepairSizeDiceUpdate(actor, { recoverHull: true, recoverShield: true });
	assert.equal(result.hullDiceRecovered, 0);
	assert.equal(result.shieldDiceRecovered, 0);
	assert.deepEqual(result.itemUpdates, []);
});

test("missing size Item: no embedded update", () => {
	const actor = makeActor({ includeSizeItem: false });
	const result = buildStarshipRepairSizeDiceUpdate(actor, { hullDiceSpend: 1, recoverShield: true });
	assert.deepEqual(result.itemUpdates, []);
	assert.deepEqual(buildCombinedSizeDiceUpdate(actor, { hullDiceUsed: 1, shldDiceUsed: 0 }), []);
});

test("concurrent changes to separate system paths collapse onto one _id", () => {
	const merged = mergeEmbeddedItemUpdates([
		{ _id: "size1", "system.uses.spent": 1 },
		{ _id: "size1", "system.attributes.hp.value": 12 }
	]);
	assert.equal(merged.length, 1);
	assert.equal(merged[0]._id, "size1");
	assert.equal(merged[0]["system.uses.spent"], 1);
	assert.equal(merged[0]["system.attributes.hp.value"], 12);
});

test("existing update fragments that share the same _id keep both dice fields", () => {
	const merged = mergeEmbeddedItemUpdates([
		{ _id: "size1", "flags.sw5e.legacyStarshipSize": { hullDiceUsed: 4, tier: 1 } },
		{ _id: "size1", "flags.sw5e.legacyStarshipSize": { shldDiceUsed: 0 } }
	]);
	assert.equal(merged.length, 1);
	assert.equal(merged[0]._id, "size1");
	assert.equal(merged[0]["flags.sw5e.legacyStarshipSize"].hullDiceUsed, 4);
	assert.equal(merged[0]["flags.sw5e.legacyStarshipSize"].shldDiceUsed, 0);
	assert.equal(merged[0]["flags.sw5e.legacyStarshipSize"].tier, 1);
});

console.log(`\n${passed} passed`);
