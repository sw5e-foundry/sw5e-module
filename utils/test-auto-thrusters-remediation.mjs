#!/usr/bin/env node
/**
 * Auto-Thrusters existing-world remediation fixtures.
 */
import assert from "node:assert/strict";
import {
	installMigrationTestHarness,
	resetMigrationTestHarness,
	createMockActor
} from "./test-migration-foundry-harness.mjs";
import { migrateActorData, migrateWorld, getLastMigrationRun, needsMigration } from "../scripts/migration.mjs";
import {
	AUTO_THRUSTERS_CANONICAL_EFFECT_ID,
	AUTO_THRUSTERS_LEGACY_FORMULA,
	AUTO_THRUSTERS_LEGACY_TARGET,
	AUTO_THRUSTERS_NAME,
	AUTO_THRUSTERS_PRIORITY,
	AUTO_THRUSTERS_V14_FORMULA,
	AUTO_THRUSTERS_V14_TARGET,
	remediateActorAutoThrusters,
	verifyAutoThrustersRemediationPostcondition
} from "../scripts/auto-thrusters-remediation.mjs";
import { countBlockingAutoThrustersRemediationResults } from "../scripts/migration-identity.mjs";

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}
async function checkAsync(name, fn) {
	await fn();
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
		flags: { sw5e: { legacyStarshipActor: { type: "starship" } } },
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

installMigrationTestHarness({
	moduleVersion: "#{VERSION}#",
	needsMigrationVersion: "2.0.0",
	moduleMigrationVersion: "1.3.6"
});

check("repairs embedded legacy Auto-Thrusters and removes exact actor snapshot", () => {
	const actor = baseActor();
	const result = remediateActorAutoThrusters(actor);
	assert.equal(result.changed, true);
	assert.equal(result.classification, "UPDATED");
	assert.deepEqual(result.repairedEffectIds, [AUTO_THRUSTERS_CANONICAL_EFFECT_ID]);
	assert.deepEqual(result.removedActorEffectIds, ["9hTss8Gebtw4efXl"]);
	const embedded = actor.items[0].effects[0];
	assert.equal(embedded.changes[0].key, AUTO_THRUSTERS_V14_TARGET);
	assert.equal(embedded.changes[0].value, AUTO_THRUSTERS_V14_FORMULA);
	assert.equal(embedded.transfer, true);
	assert.equal(actor.effects.some(e => e._id === "9hTss8Gebtw4efXl"), false);
	assert.equal(actor.effects.some(e => e.name === "Adaptive Ailerons"), true);
});

check("second remediation run is idempotent / already correct", () => {
	const actor = baseActor();
	remediateActorAutoThrusters(actor);
	const second = remediateActorAutoThrusters(actor);
	assert.equal(second.changed, false);
	assert.equal(second.classification, "ALREADY_CORRECT");
	assert.equal(actor.items[0].effects.length, 1);
	assert.equal(actor.effects.filter(e => e.name === AUTO_THRUSTERS_NAME).length, 0);
});

check("fails closed on Foundry 14 unexpanded embed ID refs", () => {
	const actor = baseActor();
	actor.items = ["bYUvLvm9ant0G9t7"];
	actor.effects = ["9hTss8Gebtw4efXl"];
	const result = remediateActorAutoThrusters(actor);
	assert.equal(result.failed, true);
	assert.equal(result.classification, "ERROR");
	assert.equal(result.reason, "unexpanded-embed-id-refs");
	assert.equal(result.failedPredicate, "expanded-embeds");
});

check("fails closed when item effects remain ID refs", () => {
	const actor = baseActor();
	actor.items[0].effects = [AUTO_THRUSTERS_CANONICAL_EFFECT_ID];
	const result = remediateActorAutoThrusters(actor);
	assert.equal(result.failed, true);
	assert.equal(result.classification, "ERROR");
	assert.equal(result.reason, "unexpanded-item-effect-id-refs");
});

check("skips ambiguous duplicate Auto-Thrusters items", () => {
	const actor = baseActor();
	actor.items.push(structuredClone(actor.items[0]));
	actor.items[1]._id = "OtherAutoThrusters";
	const result = remediateActorAutoThrusters(actor);
	assert.equal(result.classification, "AMBIGUOUS");
	assert.equal(result.reason, "multiple-auto-thrusters-items");
	assert.equal(result.changed, false);
});

check("does not remove Adaptive Ailerons", () => {
	const actor = baseActor();
	remediateActorAutoThrusters(actor);
	assert.equal(actor.effects.find(e => e.name === "Adaptive Ailerons")?.changes[0].key, AUTO_THRUSTERS_V14_TARGET);
});

check("repairs real post-dnd5e F14 disk shape from Kalebian Holocron copy", () => {
	const actor = {
		_id: "LRB3mTAKyvKVAV3Z",
		name: "A/SF-01 B-wing starfighter",
		type: "vehicle",
		flags: { sw5e: { legacyStarshipActor: { type: "starship" } } },
		effects: [{
			_id: "9hTss8Gebtw4efXl",
			name: "Auto-Thrusters",
			transfer: false,
			origin: "Actor.Y0Vf2Yi6pPQjliD1.Item.bYUvLvm9ant0G9t7",
			system: {
				changes: [{
					key: AUTO_THRUSTERS_LEGACY_TARGET,
					value: AUTO_THRUSTERS_LEGACY_FORMULA,
					type: "add",
					priority: 20
				}]
			}
		}],
		items: [{
			_id: "bYUvLvm9ant0G9t7",
			name: AUTO_THRUSTERS_NAME,
			type: "feat",
			_stats: { compendiumSource: "Compendium.sw5e-module.starships.Ps2LiBeSQQAi57Kf" },
			effects: [{
				_id: AUTO_THRUSTERS_CANONICAL_EFFECT_ID,
				name: AUTO_THRUSTERS_NAME,
				transfer: true,
				origin: null,
				system: {
					changes: [{
						key: AUTO_THRUSTERS_LEGACY_TARGET,
						value: AUTO_THRUSTERS_LEGACY_FORMULA,
						type: "add",
						priority: 20
					}]
				}
			}]
		}]
	};
	const result = remediateActorAutoThrusters(actor);
	assert.equal(result.classification, "UPDATED");
	const embedded = actor.items[0].effects[0];
	const changes = embedded.system?.changes ?? embedded.changes ?? [];
	assert.equal(changes[0].key, AUTO_THRUSTERS_V14_TARGET);
	assert.equal(changes[0].value, AUTO_THRUSTERS_V14_FORMULA);
	assert.equal(actor.effects.some(e => e._id === "9hTss8Gebtw4efXl"), false);
});

check("repairs Foundry 14 system.changes shape with type/phase", () => {
	const actor = baseActor();
	const embedded = actor.items[0].effects[0];
	embedded.system = {
		changes: [{
			key: AUTO_THRUSTERS_LEGACY_TARGET,
			value: AUTO_THRUSTERS_LEGACY_FORMULA,
			priority: 20,
			type: "add",
			phase: "initial"
		}]
	};
	delete embedded.changes;
	const actorFx = actor.effects[0];
	actorFx.system = {
		changes: [{
			key: AUTO_THRUSTERS_LEGACY_TARGET,
			value: AUTO_THRUSTERS_LEGACY_FORMULA,
			priority: 20,
			type: "add",
			phase: "initial"
		}]
	};
	delete actorFx.changes;
	const result = remediateActorAutoThrusters(actor);
	assert.equal(result.classification, "UPDATED");
	assert.equal(actor.items[0].effects[0].system.changes[0].key, AUTO_THRUSTERS_V14_TARGET);
	assert.equal(actor.items[0].effects[0].system.changes[0].value, AUTO_THRUSTERS_V14_FORMULA);
});

check("migrateActorData no longer applies Auto-Thrusters remediation inline", () => {
	const actor = baseActor();
	const flags = { persistSourceMigration: false };
	migrateActorData(actor, {}, flags);
	assert.equal(flags.autoThrustersRemediation, undefined);
	assert.equal(actor.effects.some(e => e._id === "9hTss8Gebtw4efXl"), true);
	const item = actor.items.find(i => i._id === "bYUvLvm9ant0G9t7");
	const changes = item?.effects?.[0]?.changes ?? item?.effects?.[0]?.system?.changes ?? [];
	assert.equal(changes[0]?.key, AUTO_THRUSTERS_LEGACY_TARGET);
});

check("postcondition verifier accepts corrected actor and rejects legacy", () => {
	const actor = baseActor();
	assert.equal(verifyAutoThrustersRemediationPostcondition(actor).ok, false);
	remediateActorAutoThrusters(actor);
	assert.equal(verifyAutoThrustersRemediationPostcondition(actor).ok, true);
});

check("blocking remediation counts include postcondition and unexpanded failures", () => {
	assert.equal(countBlockingAutoThrustersRemediationResults({
		autoThrusters: { unexpandedInput: 1, postconditionFailed: 1, ambiguous: 1, updateFailed: 1 }
	}), 2);
	assert.equal(countBlockingAutoThrustersRemediationResults({
		autoThrusters: { failed: 0, postconditionFailed: 0, ambiguous: 0, updatedVerified: 1 }
	}), 0);
});

check("single embedded legacy effect without actor snapshot is repaired only", () => {
	const actor = baseActor();
	actor.effects = [aileronsEffect()];
	const result = remediateActorAutoThrusters(actor);
	assert.equal(result.changed, true);
	assert.deepEqual(result.removedActorEffectIds, []);
	assert.equal(actor.items[0].effects[0].changes[0].key, AUTO_THRUSTERS_V14_TARGET);
});

await checkAsync("migrateWorld with placeholder version remediates via document operations", async () => {
	resetMigrationTestHarness();
	const { notifications } = installMigrationTestHarness({
		moduleVersion: "#{VERSION}#",
		needsMigrationVersion: "2.0.0",
		moduleMigrationVersion: "1.3.6",
		actors: [createMockActor(baseActor())]
	});

	await migrateWorld();
	const run = getLastMigrationRun();
	const actor = game.actors.get("LRB3mTAKyvKVAV3Z");
	const item = actor.items.get("bYUvLvm9ant0G9t7");
	const effect = item.effects.get(AUTO_THRUSTERS_CANONICAL_EFFECT_ID);
	assert.equal(run.summary.autoThrusters.updatedVerified >= 1, true);
	assert.equal(run.summary.completionState, "completed");
	assert.equal(run.summary.stampSkippedReason, "development-placeholder-version");
	assert.ok(notifications.some(n => n.type === "info" && String(n.message).includes("#{VERSION}#")));
	assert.equal(effect.system.changes[0].key, AUTO_THRUSTERS_V14_TARGET);
	assert.equal(actor.effects.has("9hTss8Gebtw4efXl"), false);
});

await checkAsync("migrateWorld reports completed-with-errors when remediation is ambiguous", async () => {
	resetMigrationTestHarness();
	const broken = baseActor();
	broken.items[0].effects = [];
	const { notifications } = installMigrationTestHarness({
		moduleVersion: "#{VERSION}#",
		needsMigrationVersion: "2.0.0",
		moduleMigrationVersion: "",
		actors: [createMockActor(broken)]
	});

	await migrateWorld();
	const run = getLastMigrationRun();
	assert.equal(run.summary.autoThrusters.ambiguous >= 1, true);
	assert.equal(run.summary.completionState, "completed-with-errors");
	assert.equal(notifications.some(n => n.type === "warn"), true);
	assert.equal(notifications.some(n => n.type === "info" && String(n.message).includes("completed successfully")), false);
});

await checkAsync("needsMigration is true for #{VERSION}# when needsMigrationVersion is newer than stamp", async () => {
	resetMigrationTestHarness();
	installMigrationTestHarness({
		moduleVersion: "#{VERSION}#",
		needsMigrationVersion: "2.0.0",
		moduleMigrationVersion: "1.3.6",
		actors: [{ id: "a1", name: "Dummy", type: "character", toObject() { return { _id: "a1", type: "character", items: [], effects: [] }; }, async update() { return this; } }]
	});
	assert.equal(needsMigration(), true);
});

resetMigrationTestHarness();
console.log(`\n${passed} passed`);
