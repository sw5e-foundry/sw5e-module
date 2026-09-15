#!/usr/bin/env node
/**
 * dnd5e 6.0 usage cards are created from preCreateUsageMessage `messageConfig.data`.
 * Medpac flags must land on `data.flags.sw5e`, not a sibling `messageConfig.flags`.
 */
import assert from "node:assert/strict";

const previousFoundry = globalThis.foundry;
globalThis.foundry = {
	utils: {
		mergeObject(original = {}, other = {}, { inplace = true } = {}) {
			const target = inplace ? original : { ...original };
			for ( const [key, value] of Object.entries(other ?? {}) ) {
				if ( value && typeof value === "object" && !Array.isArray(value) ) {
					target[key] = globalThis.foundry.utils.mergeObject(target[key] ?? {}, value, { inplace: false });
				} else {
					target[key] = value;
				}
			}
			return target;
		},
		getProperty(object, path) {
			return String(path ?? "").split(".").reduce((cursor, part) => cursor?.[part], object);
		}
	}
};

const { applyMedpacFlagsToUsageMessage, getPredominantHitDie } = await import("../scripts/patch/medpac.mjs");

function test(name, fn) {
	fn();
	console.log(`ok - ${name}`);
}

const medpac = {
	enabled: true,
	diceCount: 1,
	itemName: "Medpac",
	itemUuid: "Actor.hero.Item.med"
};

test("writes flags onto messageConfig.data.flags.sw5e.medpac", () => {
	const messageConfig = {
		data: { type: "usage", system: { item: { name: "Medpac" } } },
		rollMode: "publicroll",
		create: true
	};
	applyMedpacFlagsToUsageMessage(messageConfig, medpac);
	assert.deepEqual(messageConfig.data.flags.sw5e.medpac, medpac);
	assert.equal(messageConfig.flags, undefined);
	assert.equal(messageConfig.data.system.buttons[0].action, "sw5eMedpacRoll");
	assert.equal(messageConfig.data.system.buttons[0].visibility, "all");
});

test("creates data when the 6.0 config omitted it", () => {
	const messageConfig = { rollMode: "publicroll" };
	applyMedpacFlagsToUsageMessage(messageConfig, medpac);
	assert.deepEqual(messageConfig.data.flags.sw5e.medpac, medpac);
});

test("merges with existing data.flags without using obsolete flags.dnd5e.item", () => {
	const messageConfig = {
		data: { flags: { core: { canPopout: true } } }
	};
	applyMedpacFlagsToUsageMessage(messageConfig, medpac);
	assert.equal(messageConfig.data.flags.core.canPopout, true);
	assert.deepEqual(messageConfig.data.flags.sw5e.medpac, medpac);
	assert.equal(messageConfig.data.flags.dnd5e, undefined);
});

test("appends a 6.0 usage-card button without duplicating it", () => {
	const messageConfig = {
		data: {
			system: {
				buttons: [{ action: "placeTemplate", label: { value: "Place" } }]
			}
		}
	};
	applyMedpacFlagsToUsageMessage(messageConfig, medpac);
	applyMedpacFlagsToUsageMessage(messageConfig, medpac);
	assert.deepEqual(messageConfig.data.system.buttons.map(b => b.action), ["placeTemplate", "sw5eMedpacRoll"]);
});

test("no-ops on missing config or medpac", () => {
	assert.equal(applyMedpacFlagsToUsageMessage(null, medpac), null);
	const messageConfig = { data: {} };
	assert.equal(applyMedpacFlagsToUsageMessage(messageConfig, null), messageConfig);
	assert.equal(messageConfig.data.flags, undefined);
});

test("reads dnd5e 6.0 class system.hd.denomination", () => {
	assert.equal(getPredominantHitDie({
		itemTypes: { class: [{ system: { hd: { denomination: "d10" }, levels: 1 } }] }
	}), "d10");
});

test("still reads leftover system.hitDice", () => {
	assert.equal(getPredominantHitDie({
		itemTypes: { class: [{ system: { hitDice: "d8", levels: 2 } }] }
	}), "d8");
});

if ( previousFoundry === undefined ) delete globalThis.foundry;
else globalThis.foundry = previousFoundry;

console.log("test-medpac-usage-message-flags: all tests passed");
