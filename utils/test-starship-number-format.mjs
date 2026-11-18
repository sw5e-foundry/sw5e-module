#!/usr/bin/env node
/**
 * Offline tests: locale-aware Ship’s Stores whole-number formatting.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	formatStarshipWholeNumber,
	formatStarshipWholeNumberUnavailable
} from "../scripts/starship-number-format.mjs";
import {
	buildStarshipFoodBarContext,
	formatStarshipFoodCapacityTooltip
} from "../scripts/starship-food.mjs";
import { buildStarshipFuelBarContext } from "../scripts/starship-number-format.mjs";
import {
	buildStarshipSuppliesConsumeChatContext,
	buildStarshipSuppliesValueUpdate
} from "../scripts/starship-supplies-consume.mjs";
import {
	buildStarshipSuppliesRestockChatContext,
	formatStarshipSuppliesRestockCostDisplay,
	resolveStarshipSuppliesRestock
} from "../scripts/starship-supplies-restock.mjs";
import { resolveStarshipFoodCurrentMigration } from "../scripts/starship-food-value-migration.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const layerHbs = readFileSync(join(__dirname, "..", "templates", "starship-sheet-layer.hbs"), "utf8");
const storesConfigHbs = readFileSync(join(__dirname, "..", "templates", "apps", "starship-ships-stores-config.hbs"), "utf8");
const foodLess = readFileSync(join(__dirname, "..", "styles", "less", "starship-food-capacity.less"), "utf8");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

test("1. 0 formats as 0", () => {
	assert.equal(formatStarshipWholeNumber(0, { locale: "en" }), "0");
});

test("2. 1000 formats with locale grouping", () => {
	assert.equal(formatStarshipWholeNumber(1000, { locale: "en" }), "1,000");
});

test("3. 576000000 formats with grouping", () => {
	assert.equal(formatStarshipWholeNumber(576000000, { locale: "en" }), "576,000,000");
});

test("4. Negative modifier -1000 retains sign and grouping", () => {
	assert.equal(formatStarshipWholeNumber(-1000, { locale: "en", allowNegative: true }), "-1,000");
});

test("5. Positive capacity tooltip formats all three values", () => {
	const tip = formatStarshipFoodCapacityTooltip({
		selectedBase: 576000000,
		preparedModifier: 1000,
		effectiveCapacity: 576001000,
		safeInteger: true
	});
	assert.equal(tip, "576,000,000 + 1,000 = 576,001,000");
});

test("6. Negative-modifier tooltip formats correctly", () => {
	const tip = formatStarshipFoodCapacityTooltip({
		selectedBase: 576000000,
		preparedModifier: -1000,
		effectiveCapacity: 575999000,
		safeInteger: true
	});
	assert.equal(tip, "576,000,000 + (-1,000) = 575,999,000");
});

test("7. Food summary uses formatted current and capacity", () => {
	const bar = buildStarshipFoodBarContext(0, 576000000);
	assert.equal(bar.foodBarLabel, "0 / 576,000,000 portions");
});

test("8–14. Food values are edited in the stores config and summarized by the formatted bar", () => {
	assert.equal(/sw5e-core-food-effective-cap/.test(layerHbs), false);
	assert.equal(/id="sw5e-core-food-value"/.test(layerHbs), false);
	assert.equal(/id="sw5e-core-food-cost"/.test(layerHbs), false);
	assert.match(layerHbs, /systemsCore\.food\.barLabel/);
	assert.match(storesConfigHbs, /id="sw5e-ships-stores-food-value"[\s\S]*?type="number"/);
	assert.match(storesConfigHbs, /id="sw5e-ships-stores-food-cap"[\s\S]*?type="number"/);
	assert.match(storesConfigHbs, /id="sw5e-ships-stores-food-cost"[\s\S]*?type="number"/);
	assert.match(foodLess, /text-align:\s*center/);
});

test("15–16. Consume/Restock quantity fields remain type=number", () => {
	const consume = readFileSync(join(__dirname, "..", "scripts", "starship-supplies-consume.mjs"), "utf8");
	const restock = readFileSync(join(__dirname, "..", "scripts", "starship-supplies-restock.mjs"), "utf8");
	assert.match(consume, /name="\$\{STARSHIP_SUPPLIES_CONSUME_FUEL_FIELD\}"[^>]*type="number"/);
	assert.match(restock, /name="\$\{STARSHIP_SUPPLIES_RESTOCK_FUEL_FIELD\}"[^>]*type="number"/);
});

test("17. Restock cost previews use formatted display values", () => {
	const cost = formatStarshipSuppliesRestockCostDisplay({
		displayCost: 1500000,
		safeInteger: true,
		applied: 1
	});
	assert.equal(cost.text, "1,500,000");
	assert.equal(cost.displayCost, 1500000);
});

test("18. Consume chat uses formatted values", () => {
	const ctx = buildStarshipSuppliesConsumeChatContext({
		actorName: "Ship",
		fuelApplied: 0,
		foodApplied: 1,
		fuelBefore: 0,
		fuelAfter: 0,
		fuelCap: 10,
		foodBefore: 0,
		foodAfter: 1000,
		foodEffectiveCap: 576000000
	});
	assert.match(ctx.foodLine, /0\/576,000,000/);
	assert.match(ctx.foodLine, /1,000\/576,000,000/);
});

test("19–20. Restock chat formats resource and Total Cost", () => {
	const ctx = buildStarshipSuppliesRestockChatContext({
		actorName: "Ship",
		fuelApplied: 0,
		foodApplied: 2,
		fuelBefore: 0,
		fuelAfter: 0,
		fuelCap: 10,
		foodBefore: 0,
		foodAfter: 2,
		foodCap: 576000000,
		fuelMode: "perRestock",
		foodMode: "perRestock",
		fuelConfiguredCost: 150,
		foodConfiguredCost: 1500000,
		fuelCostText: "—",
		foodCostText: "1,500,000",
		fuelCostTrustworthy: true,
		foodCostTrustworthy: true,
		combinedTotal: 1500450,
		combinedSafe: true
	});
	assert.match(ctx.foodLine, /576,000,000/);
	assert.match(ctx.foodCostLine, /1,500,000/);
	assert.match(ctx.totalLine, /1,500,450/);
});

test("21–23. Raw transaction / update payloads remain numbers", () => {
	const snap = {
		fuelCurrent: 4,
		fuelCap: 10,
		fuelRoom: 6,
		foodCurrent: 0,
		foodCap: 576000000,
		foodRoom: 576000000,
		fuelMode: "perUnit",
		foodMode: "perRestock",
		fuelConfiguredCost: 150,
		foodConfiguredCost: 1500000
	};
	const resolved = resolveStarshipSuppliesRestock(snap, 2, 1000);
	assert.equal(resolved.food.applied, 1000);
	assert.equal(typeof resolved.combinedTotal, "number");
	const update = buildStarshipSuppliesValueUpdate({
		fuelApplied: 0,
		fuelNew: 4,
		foodApplied: 1000,
		foodNew: 1000
	});
	assert.equal(update["system.attributes.food.value"], 1000);
	assert.equal(typeof update["system.attributes.food.value"], "number");
	assert.equal(
		typeof update["flags.sw5e.legacyStarshipActor.system.attributes.food.value"],
		"number"
	);
});

test("24. Migration payload contains numeric food.value", () => {
	const actor = {
		type: "vehicle",
		items: [{ type: "starshipsize", flags: { sw5e: { legacyStarshipSize: { foodCap: 576000000 } } } }],
		system: { attributes: {} },
		flags: { sw5e: { legacyStarshipActor: { type: "starship", system: { attributes: {} } }, starship: { food: {} } } }
	};
	const r = resolveStarshipFoodCurrentMigration(actor);
	assert.equal(r.disposition, "initialize");
	assert.equal(r.nextValue, 576000000);
	assert.equal(typeof r.update["system.attributes.food.value"], "number");
	assert.equal(r.update["system.attributes.food.value"], 576000000);
});

test("25. Unsafe integers are not trustworthy exact displays", () => {
	assert.equal(
		formatStarshipWholeNumber(Number.MAX_SAFE_INTEGER + 2, { locale: "en" }),
		formatStarshipWholeNumberUnavailable()
	);
	assert.equal(
		formatStarshipFoodCapacityTooltip({ safeInteger: false }),
		formatStarshipWholeNumberUnavailable()
	);
});

test("Fuel bar also formats large values", () => {
	const bar = buildStarshipFuelBarContext(1000, 5000);
	assert.equal(bar.fuelBarLabel, "1,000 / 5,000 units");
});

console.log(`\n${passed} tests passed`);
