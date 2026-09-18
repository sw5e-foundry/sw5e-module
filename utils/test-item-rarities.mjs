#!/usr/bin/env node
/**
 * Offline coverage for dnd5e 6 `system.rarities` pack/world normalization.
 */
import assert from "node:assert/strict";
import {
	normalizeDnd5eItemSource,
	normalizeEmbeddedDnd5eItemSources,
	normalizePhysicalItemRarities
} from "../scripts/dnd5e-source-normalization.mjs";

function test(name, fn) {
	fn();
	console.log(`ok - ${name}`);
}

test("non-empty system.rarity string becomes rarities array and rarity is deleted", () => {
	const item = { type: "loot", system: { rarity: "common" } };
	assert.equal(normalizePhysicalItemRarities(item), true);
	assert.deepEqual(item.system.rarities, ["common"]);
	assert.equal("rarity" in item.system, false);
});

test("empty rarity string becomes rarities [] and rarity is deleted", () => {
	const item = { type: "weapon", system: { rarity: "" } };
	assert.equal(normalizePhysicalItemRarities(item), true);
	assert.deepEqual(item.system.rarities, []);
	assert.equal("rarity" in item.system, false);
});

test("whitespace-only rarity is empty persist", () => {
	const item = { system: { rarity: "  " } };
	assert.equal(normalizePhysicalItemRarities(item), true);
	assert.deepEqual(item.system.rarities, []);
	assert.equal("rarity" in item.system, false);
});

test("object rarity.value is converted", () => {
	const item = { system: { rarity: { value: "legendary" } } };
	assert.equal(normalizePhysicalItemRarities(item), true);
	assert.deepEqual(item.system.rarities, ["legendary"]);
	assert.equal("rarity" in item.system, false);
});

test("existing rarities drop leftover rarity", () => {
	const item = { system: { rarity: "common", rarities: ["veryRare"] } };
	assert.equal(normalizePhysicalItemRarities(item), true);
	assert.deepEqual(item.system.rarities, ["veryRare"]);
	assert.equal("rarity" in item.system, false);
});

test("empty rarities plus valued leftover rarity promotes the leftover", () => {
	const item = { system: { rarity: "rare", rarities: [] } };
	assert.equal(normalizePhysicalItemRarities(item), true);
	assert.deepEqual(item.system.rarities, ["rare"]);
	assert.equal("rarity" in item.system, false);
});

test("already migrated rarities is a no-op", () => {
	const item = { system: { rarities: ["uncommon"] } };
	assert.equal(normalizePhysicalItemRarities(item), false);
	assert.deepEqual(item.system.rarities, ["uncommon"]);
});

test("missing rarity and rarities is a no-op", () => {
	const item = { type: "feat", system: { description: { value: "" } } };
	assert.equal(normalizePhysicalItemRarities(item), false);
	assert.equal("rarities" in item.system, false);
});

test("normalizeDnd5eItemSource returns true for rarity-only items", () => {
	const item = { type: "loot", system: { rarity: "common" } };
	assert.equal(normalizeDnd5eItemSource(item), true);
	assert.deepEqual(item.system.rarities, ["common"]);
	assert.equal("rarity" in item.system, false);
});

test("embedded actor items convert while sibling feats without rarity stay untouched", () => {
	const items = [
		{ type: "weapon", system: { rarity: "" } },
		{ type: "feat", system: { description: { value: "x" } } }
	];
	assert.equal(normalizeEmbeddedDnd5eItemSources(items), true);
	assert.deepEqual(items[0].system.rarities, []);
	assert.equal("rarities" in items[1].system, false);
});

test("SW5e pack keys such as premium are preserved", () => {
	const item = { system: { rarity: "premium" } };
	assert.equal(normalizePhysicalItemRarities(item), true);
	assert.deepEqual(item.system.rarities, ["premium"]);
});

test("Foundry Set rarities drop leftover rarity without rewriting the set", () => {
	const item = { system: { rarity: "common", rarities: new Set(["artifact"]) } };
	assert.equal(normalizePhysicalItemRarities(item), true);
	assert.ok(item.system.rarities instanceof Set);
	assert.deepEqual([...item.system.rarities], ["artifact"]);
	assert.equal("rarity" in item.system, false);
});

console.log("test-item-rarities: all tests passed");
