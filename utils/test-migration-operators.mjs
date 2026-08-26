#!/usr/bin/env node
/**
 * Foundry 14 ForcedReplacement / equality migration helpers.
 */
import assert from "node:assert/strict";
import {
	installMigrationTestHarness,
	resetMigrationTestHarness
} from "./test-migration-foundry-harness.mjs";
import {
	createForcedReplacement,
	isForcedReplacement,
	unwrapForcedReplacement,
	valuesEqual
} from "../scripts/migration-operators.mjs";
import { migrateItemData, migrateMacroData } from "../scripts/migration.mjs";

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

installMigrationTestHarness({ needsMigrationVersion: "2.0.0" });

check("createForcedReplacement does not emit legacy == keys", () => {
	const value = [{ _id: "Adv1", type: "ItemGrant" }];
	const replaced = createForcedReplacement(value);
	assert.equal(isForcedReplacement(replaced), true);
	assert.deepEqual(unwrapForcedReplacement(replaced), value);
	assert.equal(Object.prototype.hasOwnProperty.call(replaced, "==advancement"), false);
});

check("advancement migration uses ForcedReplacement payload", () => {
	const item = {
		_id: "ItemAdv001",
		name: "Feat",
		type: "feat",
		system: {
			advancement: {
				Adv1: {
					_id: "Adv1",
					type: "ItemGrant",
					configuration: { pool: ["languages:standard:basic"] },
					value: {}
				}
			}
		},
		flags: {},
		effects: []
	};
	const flags = { persistSourceMigration: false };
	const update = migrateItemData(structuredClone(item), {}, flags);
	assert.equal(flags.persistSourceMigration, false);
	const raw = update["system.advancement"];
	assert.equal(isForcedReplacement(raw), true);
	const unwrapped = unwrapForcedReplacement(raw);
	assert.equal(unwrapped.Adv1.configuration.pool[0], "languages:standard:common");
	assert.equal("==advancement" in update, false);
	assert.equal("system.==advancement" in update, false);
});

check("empty / missing advancement produce no forced replacement", () => {
	const missing = migrateItemData({ _id: "a", type: "feat", system: {} }, {});
	assert.equal(missing["system.advancement"], undefined);
	const empty = migrateItemData({ _id: "b", type: "feat", system: { advancement: [] } }, {});
	assert.equal(empty["system.advancement"], undefined);
});

check("valuesEqual matches equal macro flags and rejects unequal", () => {
	assert.equal(valuesEqual({ a: 1 }, { a: 1 }), true);
	assert.equal(valuesEqual({ a: 1 }, { a: 2 }), false);
	assert.equal(valuesEqual([1, 2], [1, 2]), true);
	assert.equal(valuesEqual(null, null), true);
});

check("migrateMacroData uses equals-compatible comparison", () => {
	const macro = {
		_id: "Macro1",
		name: "Test",
		command: "console.log(1)",
		flags: { sw5e: { note: "x" } }
	};
	const unchanged = migrateMacroData(structuredClone(macro), {});
	assert.equal(unchanged.flags, undefined);
	const changed = migrateMacroData({
		...macro,
		flags: { "sw5e-module-test": { note: "legacy" } }
	}, {});
	// normalizeCompendiumReferences may or may not change flags; ensure no throw
	assert.equal(typeof changed, "object");
});

check("no residual ==system key from SW5e macro/item helpers", () => {
	const item = migrateItemData({
		_id: "c",
		type: "feat",
		system: { advancement: [{ _id: "Adv2", type: "ItemGrant", configuration: { grants: ["languages:standard:basic"] } }] }
	}, {});
	assert.equal("==system" in item, false);
	assert.equal(Object.keys(item).some(k => k.includes("==")), false);
});

resetMigrationTestHarness();
console.log(`\n${passed} passed`);
