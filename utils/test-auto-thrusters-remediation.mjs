#!/usr/bin/env node
/**
 * Auto-Thrusters existing-world remediation fixtures.
 */
import assert from "node:assert/strict";
import {
	installMigrationTestHarness,
	resetMigrationTestHarness
} from "./test-migration-foundry-harness.mjs";
import { migrateActorData } from "../scripts/migration.mjs";
import {
	AUTO_THRUSTERS_CANONICAL_EFFECT_ID,
	AUTO_THRUSTERS_LEGACY_FORMULA,
	AUTO_THRUSTERS_LEGACY_TARGET,
	AUTO_THRUSTERS_NAME,
	AUTO_THRUSTERS_PRIORITY,
	AUTO_THRUSTERS_V14_FORMULA,
	AUTO_THRUSTERS_V14_TARGET,
	remediateActorAutoThrusters
} from "../scripts/auto-thrusters-remediation.mjs";

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function legacyEmbeddedEffect(id=AUTO_THRUSTERS_CANONICAL_EFFECT_ID) {
	return {
		_id: id,
		name: AUTO_THRUSTERS_NAME,
		transfer: true,
		origin: null,
		changes: [{
			key: AUTO_THRUSTERS_LEGACY_TARGET,
			value: AUTO_THRUSTERS_LEGACY_FORMULA,
			mode: 2,
			priority: AUTO_THRUSTERS_PRIORITY
		}]
	};
}

function legacyActorSnapshot(itemId) {
	return {
		_id: "9hTss8Gebtw4efXl",
		name: AUTO_THRUSTERS_NAME,
		transfer: false,
		origin: `Actor.Y0Vf2Yi6pPQjliD1.Item.${itemId}`,
		changes: [{
			key: AUTO_THRUSTERS_LEGACY_TARGET,
			value: AUTO_THRUSTERS_LEGACY_FORMULA,
			mode: 2,
			priority: AUTO_THRUSTERS_PRIORITY
		}]
	};
}

function aileronsEffect() {
	return {
		_id: "AileronsEffect000",
		name: "Adaptive Ailerons",
		transfer: false,
		origin: null,
		changes: [{
			key: AUTO_THRUSTERS_V14_TARGET,
			value: "+2",
			mode: 2,
			priority: 20
		}]
	};
}

function baseActor() {
	const itemId = "bYUvLvm9ant0G9t7";
	return {
		_id: "LRB3mTAKyvKVAV3Z",
		name: "A/SF-01 B-wing starfighter",
		type: "vehicle",
		effects: [legacyActorSnapshot(itemId), aileronsEffect()],
		items: [{
			_id: itemId,
			name: AUTO_THRUSTERS_NAME,
			type: "feat",
			system: { description: { value: "", chat: "" } },
			_stats: { compendiumSource: "Compendium.sw5e-module.starships.Ps2LiBeSQQAi57Kf" },
			effects: [legacyEmbeddedEffect()]
		}]
	};
}

installMigrationTestHarness();

check("repairs embedded legacy Auto-Thrusters and removes exact actor snapshot", () => {
	const actor = baseActor();
	const result = remediateActorAutoThrusters(actor);
	assert.equal(result.changed, true);
	assert.equal(result.skipped, false);
	assert.deepEqual(result.repairedEffectIds, [AUTO_THRUSTERS_CANONICAL_EFFECT_ID]);
	assert.deepEqual(result.removedActorEffectIds, ["9hTss8Gebtw4efXl"]);
	const embedded = actor.items[0].effects[0];
	assert.equal(embedded.changes[0].key, AUTO_THRUSTERS_V14_TARGET);
	assert.equal(embedded.changes[0].value, AUTO_THRUSTERS_V14_FORMULA);
	assert.equal(embedded.transfer, true);
	assert.equal(actor.effects.some(e => e._id === "9hTss8Gebtw4efXl"), false);
	assert.equal(actor.effects.some(e => e.name === "Adaptive Ailerons"), true);
});

check("second remediation run is idempotent", () => {
	const actor = baseActor();
	remediateActorAutoThrusters(actor);
	const second = remediateActorAutoThrusters(actor);
	assert.equal(second.changed, false);
	assert.equal(second.skipped, false);
	assert.equal(actor.items[0].effects.length, 1);
	assert.equal(actor.effects.filter(e => e.name === AUTO_THRUSTERS_NAME).length, 0);
});

check("skips ambiguous duplicate Auto-Thrusters items", () => {
	const actor = baseActor();
	actor.items.push(structuredClone(actor.items[0]));
	actor.items[1]._id = "OtherAutoThrusters";
	const result = remediateActorAutoThrusters(actor);
	assert.equal(result.skipped, true);
	assert.equal(result.reason, "ambiguous-auto-thrusters-items");
	assert.equal(result.changed, false);
});

check("does not remove Adaptive Ailerons", () => {
	const actor = baseActor();
	remediateActorAutoThrusters(actor);
	assert.equal(actor.effects.find(e => e.name === "Adaptive Ailerons")?.changes[0].key, AUTO_THRUSTERS_V14_TARGET);
});

check("migrateActorData applies remediation via full-source path", () => {
	const actor = baseActor();
	const flags = { persistSourceMigration: false };
	const update = migrateActorData(actor, {}, flags);
	assert.equal(flags.persistSourceMigration, true);
	assert.equal(update.effects.some(e => e._id === "9hTss8Gebtw4efXl"), false);
	const item = update.items.find(i => i._id === "bYUvLvm9ant0G9t7");
	assert.equal(item.effects[0].changes[0].key, AUTO_THRUSTERS_V14_TARGET);
	assert.equal(item.effects[0].changes[0].value, AUTO_THRUSTERS_V14_FORMULA);
});

check("single embedded legacy effect without actor snapshot is repaired only", () => {
	const actor = baseActor();
	actor.effects = [aileronsEffect()];
	const result = remediateActorAutoThrusters(actor);
	assert.equal(result.changed, true);
	assert.deepEqual(result.removedActorEffectIds, []);
	assert.equal(actor.items[0].effects[0].changes[0].key, AUTO_THRUSTERS_V14_TARGET);
});

resetMigrationTestHarness();
console.log(`\n${passed} passed`);
