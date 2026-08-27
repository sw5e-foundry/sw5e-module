#!/usr/bin/env node
import assert from "node:assert/strict";
import {
	BWING_ACTOR_COMPENDIUM_PROVENANCE,
	BWING_CANONICAL_HULL,
	BWING_CANONICAL_SHIELDS,
	BWING_SIZE_ITEM_ID,
	BWING_AUTO_THRUSTERS_ITEM_ID,
	inspectBwingResourceCandidate,
	executeBwingResourceRemediation
} from "../scripts/bwing-resource-remediation.mjs";
import { AUTO_THRUSTERS_CANONICAL_EFFECT_ID } from "../scripts/auto-thrusters-remediation.mjs";
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

function bwingActor(hp={ value: 38, max: 0, temp: 57, tempmax: null }) {
	return {
		_id: "LRB3mTAKyvKVAV3Z",
		name: "A/SF-01 B-wing starfighter",
		type: "vehicle",
		flags: {
			sw5e: {
				legacyStarshipActor: {
					type: "starship",
					system: { attributes: { hp: { ...hp } } }
				}
			}
		},
		_stats: { compendiumSource: BWING_ACTOR_COMPENDIUM_PROVENANCE },
		system: { attributes: { hp: { ...hp } } },
		items: [{
			_id: BWING_SIZE_ITEM_ID,
			name: "Small Starship",
			type: "feat",
			_stats: { compendiumSource: "Compendium.sw5e-module.starships.6BN8l5E8QtYt103T" },
			flags: { sw5e: { legacyStarshipSize: { size: "sm", tier: 3, hullDice: "d6", shldDice: "d6" } } }
		}, {
			_id: BWING_AUTO_THRUSTERS_ITEM_ID,
			name: "Auto-Thrusters",
			type: "feat",
			_stats: { compendiumSource: "Compendium.sw5e-module.starships.Ps2LiBeSQQAi57Kf" },
			effects: [{
				_id: AUTO_THRUSTERS_CANONICAL_EFFECT_ID,
				name: "Auto-Thrusters",
				transfer: true,
				system: { changes: [{ key: "system.abilities.dex.bonuses.save", type: "add", value: "+1", priority: 20, phase: "initial" }] }
			}]
		}],
		effects: []
	};
}

await check("exact B-Wing matcher accepts pre-dnd5e broken tuple", async () => {
	installMigrationTestHarness({ actors: [createMockActor(bwingActor())] });
	const inspection = inspectBwingResourceCandidate(game.actors.get("LRB3mTAKyvKVAV3Z"));
	assert.equal(inspection.classification, "MATCHED");
	assert.equal(inspection.needsUpdate, true);
	assert.equal(inspection.historicalTuple, "pre-dnd5e");
	resetMigrationTestHarness();
});

await check("B-Wing resource remediation restores 44/44 hull and 75/75 shields", async () => {
	installMigrationTestHarness({ actors: [createMockActor(bwingActor())] });
	const actor = game.actors.get("LRB3mTAKyvKVAV3Z");
	const result = await executeBwingResourceRemediation(actor);
	assert.equal(result.classification, "RESOURCE_UPDATED_VERIFIED");
	const live = game.actors.get("LRB3mTAKyvKVAV3Z");
	assert.equal(Number(live.system.attributes.hp.value), BWING_CANONICAL_HULL.value);
	assert.equal(Number(live.system.attributes.hp.max), BWING_CANONICAL_HULL.max);
	assert.equal(Number(live.system.attributes.hp.temp), BWING_CANONICAL_SHIELDS.temp);
	assert.equal(Number(live.system.attributes.hp.tempmax), BWING_CANONICAL_SHIELDS.tempmax);
	resetMigrationTestHarness();
});

await check("non-B-Wing starship actors are skipped", async () => {
	const actor = bwingActor();
	delete actor._stats;
	installMigrationTestHarness({ actors: [createMockActor(actor)] });
	const result = await executeBwingResourceRemediation(game.actors.get("LRB3mTAKyvKVAV3Z"));
	assert.equal(result.classification, "NOT_BWING");
	resetMigrationTestHarness();
});

await check("already-canonical 44/44/75/75 is idempotent, not ambiguous", async () => {
	const actor = bwingActor({
		value: BWING_CANONICAL_HULL.value,
		max: BWING_CANONICAL_HULL.max,
		temp: BWING_CANONICAL_SHIELDS.temp,
		tempmax: BWING_CANONICAL_SHIELDS.tempmax
	});
	installMigrationTestHarness({ actors: [createMockActor(actor)] });
	const inspection = inspectBwingResourceCandidate(game.actors.get("LRB3mTAKyvKVAV3Z"));
	assert.equal(inspection.classification, "ALREADY_CANONICAL");
	assert.equal(inspection.needsUpdate, false);
	const result = await executeBwingResourceRemediation(game.actors.get("LRB3mTAKyvKVAV3Z"));
	assert.equal(result.classification, "ALREADY_CANONICAL");
	assert.equal(result.updateRequested, false);
	resetMigrationTestHarness();
});

console.log(`\n${passed} passed`);
