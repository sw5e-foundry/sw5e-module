#!/usr/bin/env node
/**
 * dnd5e 6.0 physical-item rarity helpers used by chassis, augmentations, and droid customizations.
 */
import assert from "node:assert/strict";
import {
	getItemSystemRarityKey,
	itemSystemRaritiesUpdateValue,
	physicalItemRarityBrowserClauses
} from "../scripts/item-system-rarity.mjs";
import { inferChassisRarityFromItem } from "../scripts/chassis.mjs";
import { inferAugmentationRarityFromItem } from "../scripts/augmentations.mjs";
import { inferDroidCustomizationRarityFromItem } from "../scripts/droid-customizations.mjs";

function test(name, fn) {
	fn();
	console.log(`ok - ${name}`);
}

test("upgrade persist payload is system.rarities array, not system.rarity", () => {
	assert.deepEqual(itemSystemRaritiesUpdateValue("rare"), ["rare"]);
	assert.deepEqual(itemSystemRaritiesUpdateValue("  "), []);
	assert.deepEqual(itemSystemRaritiesUpdateValue(""), []);
});

test("prefers system.rarities over leftover system.rarity", () => {
	assert.equal(getItemSystemRarityKey({
		system: { rarity: "common", rarities: ["veryRare"] }
	}), "veryRare");
});

test("reads leftover pack-source system.rarity string", () => {
	assert.equal(getItemSystemRarityKey({ system: { rarity: "uncommon" } }), "uncommon");
});

test("reads leftover 5.x object rarity.value", () => {
	assert.equal(getItemSystemRarityKey({ system: { rarity: { value: "legendary" } } }), "legendary");
});

test("reads Foundry Set-like rarities.first()", () => {
	assert.equal(getItemSystemRarityKey({
		system: {
			rarities: {
				first() {
					return "artifact";
				}
			}
		}
	}), "artifact");
});

test("reads Array and Set rarities", () => {
	assert.equal(getItemSystemRarityKey({ system: { rarities: ["rare"] } }), "rare");
	assert.equal(getItemSystemRarityKey({ system: { rarities: new Set(["legendary"]) } }), "legendary");
});

test("mundane empty rarities maps through infer helpers to standard", () => {
	const mundane = { system: { rarities: [] } };
	assert.equal(getItemSystemRarityKey(mundane), "");
	assert.equal(inferChassisRarityFromItem(mundane), "standard");
	assert.equal(inferAugmentationRarityFromItem(mundane), "standard");
	assert.equal(inferDroidCustomizationRarityFromItem(mundane), "standard");
});

test("infer maps dnd5e rare → prototype chassis/aug/droid tier", () => {
	const item = { system: { rarities: ["rare"] } };
	assert.equal(inferChassisRarityFromItem(item), "prototype");
	assert.equal(inferAugmentationRarityFromItem(item), "prototype");
	assert.equal(inferDroidCustomizationRarityFromItem(item), "prototype");
});

test("browser clauses include system.rarities hasany and leftover system.rarity in", () => {
	const clauses = physicalItemRarityBrowserClauses(["rare", "veryRare"]);
	assert.deepEqual(clauses, [
		{ k: "system.rarities", o: "hasany", v: ["rare", "veryRare"] },
		{ k: "system.rarity", o: "in", v: ["rare", "veryRare"] }
	]);
});

console.log("test-chassis-rarity-dnd5e-6: all tests passed");
