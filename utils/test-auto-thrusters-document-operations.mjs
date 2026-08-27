#!/usr/bin/env node
import assert from "node:assert/strict";
import {
	AUTO_THRUSTERS_CANONICAL_EFFECT_ID,
	AUTO_THRUSTERS_V14_TARGET,
	executeAutoThrustersRemediation
} from "../scripts/auto-thrusters-remediation.mjs";
import {
	installMigrationTestHarness,
	resetMigrationTestHarness,
	createMockActor
} from "./test-migration-foundry-harness.mjs";

let passed = 0;
async function check(name, fn) {
	await fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function legacyActor() {
	return {
		_id: "LRB3mTAKyvKVAV3Z",
		name: "A/SF-01 B-wing starfighter",
		type: "vehicle",
		flags: { sw5e: { legacyStarshipActor: { type: "starship" } } },
		effects: [{
			_id: "9hTss8Gebtw4efXl",
			name: "Auto-Thrusters",
			transfer: false,
			origin: "Actor.Y0Vf2Yi6pPQjliD1.Item.bYUvLvm9ant0G9t7",
			changes: [{
				key: "system.abilities.dex.save",
				value: "((@str.mod)/2)",
				mode: 2,
				priority: 20
			}]
		}],
		items: [{
			_id: "bYUvLvm9ant0G9t7",
			name: "Auto-Thrusters",
			type: "feat",
			system: { description: { value: "", chat: "" } },
			_stats: { compendiumSource: "Compendium.sw5e-module.starships.Ps2LiBeSQQAi57Kf" },
			effects: [{
				_id: AUTO_THRUSTERS_CANONICAL_EFFECT_ID,
				name: "Auto-Thrusters",
				transfer: true,
				origin: null,
				changes: [{
					key: "system.abilities.dex.save",
					value: "((@str.mod)/2)",
					mode: 2,
					priority: 20
				}]
			}]
		}]
	};
}

await check("document operations update embedded effect before deleting actor snapshot", async () => {
	installMigrationTestHarness({ actors: [createMockActor(legacyActor())] });
	const actor = game.actors.get("LRB3mTAKyvKVAV3Z");
	const result = await executeAutoThrustersRemediation(actor);
	assert.equal(result.classification, "UPDATED_VERIFIED");
	assert.equal(result.updateRequested, true);
	assert.equal(result.updateSucceeded, true);
	assert.equal(result.deleteRequested, true);
	assert.equal(result.deleteSucceeded, true);
	const item = game.actors.get("LRB3mTAKyvKVAV3Z").items.get("bYUvLvm9ant0G9t7");
	const effect = item.effects.get(AUTO_THRUSTERS_CANONICAL_EFFECT_ID);
	assert.equal(effect.system.changes[0].key, AUTO_THRUSTERS_V14_TARGET);
	assert.equal(game.actors.get("LRB3mTAKyvKVAV3Z").effects.has("9hTss8Gebtw4efXl"), false);
	assert.equal(result.finalContributionCount, 1);
	resetMigrationTestHarness();
});

await check("second document-operation pass is idempotent", async () => {
	installMigrationTestHarness({ actors: [createMockActor(legacyActor())] });
	const actor = game.actors.get("LRB3mTAKyvKVAV3Z");
	await executeAutoThrustersRemediation(actor);
	const second = await executeAutoThrustersRemediation(game.actors.get("LRB3mTAKyvKVAV3Z"));
	assert.equal(second.classification, "ALREADY_CORRECT");
	assert.equal(second.updateRequested, false);
	assert.equal(second.deleteRequested, false);
	resetMigrationTestHarness();
});

console.log(`\n${passed} passed`);
