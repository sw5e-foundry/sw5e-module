#!/usr/bin/env node
import assert from "node:assert/strict";
import {
	evaluateDnd5eMigrationRequirement,
	isDnd5eMigrationComplete,
	waitForDnd5eMigrationCompletion
} from "../scripts/dnd5e-migration-barrier.mjs";
import {
	installMigrationTestHarness,
	resetMigrationTestHarness
} from "./test-migration-foundry-harness.mjs";

let passed = 0;
async function check(name, fn) {
	await fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

await check("empty world with no stamp does not require dnd5e migration", async () => {
	installMigrationTestHarness({
		dnd5eMigrationVersion: "",
		actors: [],
		worldDnd5eVersion: null
	});
	const req = evaluateDnd5eMigrationRequirement();
	assert.equal(req.required, false);
	assert.equal(req.reason, "empty-world-stamp-only");
	resetMigrationTestHarness();
});

await check("current dnd5e stamp satisfies completion predicate", async () => {
	installMigrationTestHarness({ dnd5eMigrationVersion: "5.3.3" });
	assert.equal(isDnd5eMigrationComplete("5.3.3", "5.3.3"), true);
	assert.equal(evaluateDnd5eMigrationRequirement().required, false);
	resetMigrationTestHarness();
});

await check("older dnd5e stamp requires migration and barrier waits until current", async () => {
	const { settingsStore } = installMigrationTestHarness({ dnd5eMigrationVersion: "5.2.0" });
	const barrier = await waitForDnd5eMigrationCompletion({ pollIntervalMs: 1, timeoutMs: 50 });
	assert.equal(barrier.required, true);
	assert.equal(barrier.passed, false);
	assert.equal(barrier.timedOut, true);
	settingsStore["dnd5e.systemMigrationVersion"] = "5.3.3";
	const pass = await waitForDnd5eMigrationCompletion({ pollIntervalMs: 1, timeoutMs: 50 });
	assert.equal(pass.passed, true);
	assert.equal(pass.finalVersion, "5.3.3");
	resetMigrationTestHarness();
});

console.log(`\n${passed} passed`);
