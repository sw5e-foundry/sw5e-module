#!/usr/bin/env node
/**
 * World migration coordinator: recoverable document isolation vs blocking infrastructure.
 */
import assert from "node:assert/strict";
import {
	installMigrationTestHarness,
	resetMigrationTestHarness,
	formatLocalization,
	createMockActor
} from "./test-migration-foundry-harness.mjs";
import {
	migrateWorld,
	needsMigration,
	MigrationDocumentError,
	getLastMigrationRun
} from "../scripts/migration.mjs";

let passed = 0;
async function check(name, fn) {
	await fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function expectedBegin(version) {
	return formatLocalization("MIGRATION.sw5eBegin", { version });
}

function expectedSuccess(version) {
	return formatLocalization("MIGRATION.sw5eCompleteSuccess", { version });
}

function expectedCompleteWithErrors(version, count) {
	return formatLocalization("MIGRATION.sw5eCompleteWithErrors", { version, count });
}

function expectedBlocked(version) {
	return formatLocalization("MIGRATION.sw5eBlocked", { version });
}

function expectedLegacyCleanComplete(version) {
	return formatLocalization("MIGRATION.sw5eComplete", { version });
}

function notificationMessage(notifications, type, expected) {
	return notifications.find(n => n.type === type && n.message === expected)?.message ?? null;
}

function hasCompleteSuccess(notifications, version="1.4.1") {
	return Boolean(notificationMessage(notifications, "info", expectedSuccess(version)));
}

function hasCompleteWithErrors(notifications, version="1.4.1", count=1) {
	return notifications.some(n => n.type === "warn" && n.message === expectedCompleteWithErrors(version, count));
}

function hasBlocked(notifications, version="1.4.1") {
	return Boolean(notificationMessage(notifications, "error", expectedBlocked(version)));
}

function hasDevelopmentCompleteSuccess(notifications, version="#{VERSION}#") {
	const expected = formatLocalization("MIGRATION.sw5eCompleteSuccessDevelopment", { version });
	return Boolean(notificationMessage(notifications, "info", expected));
}

function hasLegacyCleanComplete(notifications, version="1.4.1") {
	return notifications.some(n => n.message === expectedLegacyCleanComplete(version));
}

function assertNoUnresolvedPlaceholders(message) {
	assert.equal(String(message).includes("{version}"), false, `unresolved {version} in ${message}`);
	assert.equal(String(message).includes("{count}"), false, `unresolved {count} in ${message}`);
}

function createActorDoc(source) {
	return {
		id: source._id,
		_id: source._id,
		name: source.name,
		uuid: `Actor.${source._id}`,
		toObject() { return structuredClone(source); },
		async update() { this.updated = true; }
	};
}

function createItemDoc(source) {
	return {
		id: source._id,
		_id: source._id,
		name: source.name,
		uuid: `Item.${source._id}`,
		toObject() { return structuredClone(source); },
		async update() { this.updated = true; }
	};
}

function createSceneDoc({ id, name, tokens=[] }) {
	return {
		id,
		_id: id,
		name,
		tokens,
		toObject() {
			return {
				_id: id,
				name,
				tokens: tokens.map(token => ({
					_id: token.id,
					actorLink: token.actorLink,
					actorId: token.actorId
				}))
			};
		},
		async update() { this.updated = true; }
	};
}

function createUnlinkedToken({ id, actor }) {
	return {
		id,
		actorLink: false,
		actor,
		actorId: actor.id,
		delta: { id: `delta-${id}` }
	};
}

function createLockedPack({
	collection="world.test-scenes",
	documentName="Scene",
	documents=[],
	migrateImpl=null,
	configureImpl=null
}={}) {
	const pack = {
		collection,
		documentName,
		locked: true,
		migratedCount: 0,
		metadata: { packageType: "world" },
		async configure({ locked }) {
			if ( configureImpl ) return configureImpl.call(pack, { locked });
			pack.locked = locked;
		},
		async migrate() {
			if ( migrateImpl ) return migrateImpl.call(pack);
			pack.migratedCount += 1;
		},
		async getDocuments() { return documents; }
	};
	return pack;
}

function successActor() {
	return createActorDoc({
		_id: "OkActor0000000001",
		name: "OK Actor",
		type: "npc",
		img: "icons/svg/mystery-man.svg",
		prototypeToken: { texture: { src: "icons/svg/mystery-man.svg" } },
		items: [{
			_id: "OkFeat00000000001",
			name: "OK Feat",
			type: "feat",
			system: { description: { value: "", chat: "" } }
		}]
	});
}

function remappableActor(id, name) {
	return createActorDoc({
		_id: id,
		name,
		type: "npc",
		img: "modules/sw5e/icons/foo.webp",
		prototypeToken: { texture: { src: "modules/sw5e/icons/foo.webp" } },
		items: [{
			_id: `${id}Feat`,
			name: "OK Feat",
			type: "feat",
			system: { description: { value: "", chat: "" } }
		}]
	});
}

function remappableItem(id, name) {
	return createItemDoc({
		_id: id,
		name,
		type: "loot",
		img: "modules/sw5e/icons/item.webp",
		system: { description: { value: "", chat: "" } }
	});
}

await check("16. Successful zero-error migration behaves normally", async () => {
	const { notifications, settingsStore } = installMigrationTestHarness({
		actors: [successActor()],
		moduleMigrationVersion: "1.3.4"
	});
	await migrateWorld();
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.4.1");
	assert.ok(notifications.some(n => n.type === "info" && n.message === expectedBegin("1.4.1")));
	assert.equal(hasCompleteSuccess(notifications, "1.4.1"), true);
	assert.equal(hasCompleteWithErrors(notifications), false);
	assert.equal(hasBlocked(notifications), false);
	assert.equal(getLastMigrationRun().summary.completionState, "completed");
	resetMigrationTestHarness();
});

await check("Formatted clean-success notification includes the start-notification target version", async () => {
	const targetVersion = "7.7.7";
	const { notifications } = installMigrationTestHarness({
		actors: [successActor()],
		moduleVersion: targetVersion,
		moduleMigrationVersion: "1.3.4"
	});
	await migrateWorld();
	const begin = notifications.find(n => n.type === "info" && n.message === expectedBegin(targetVersion));
	const complete = notifications.find(n => n.type === "info" && n.message === expectedSuccess(targetVersion));
	assert.ok(begin, "start notification should include the target version");
	assert.ok(complete, "clean success should include the same target version");
	assert.match(complete.message, /to version 7\.7\.7 completed successfully/);
	assertNoUnresolvedPlaceholders(complete.message);
	assert.equal(hasCompleteWithErrors(notifications, targetVersion), false);
	assert.equal(hasLegacyCleanComplete(notifications, targetVersion), false);
	resetMigrationTestHarness();
});

await check("Formatted completed-with-errors notification includes version and one error count", async () => {
	const targetVersion = "8.8.8";
	const first = remappableActor("FmtBadActor0000001", "Bad Actor");
	const second = remappableActor("FmtOkActor00000002", "Later Actor");
	const { notifications } = installMigrationTestHarness({
		actors: [first, second],
		moduleVersion: targetVersion,
		moduleMigrationVersion: "1.3.4"
	});
	globalThis.__SW5E_MIGRATION_TEST_HOOKS__ = {
		failDocumentId: "FmtBadActor0000001",
		error: new Error("actor transform boom")
	};
	await migrateWorld();
	const begin = notifications.find(n => n.type === "info" && n.message === expectedBegin(targetVersion));
	const complete = notifications.find(n => n.type === "warn" && n.message === expectedCompleteWithErrors(targetVersion, 1));
	assert.ok(begin);
	assert.ok(complete);
	assert.match(complete.message, /to version 8\.8\.8 completed with 1 document error\(s\)/);
	assertNoUnresolvedPlaceholders(complete.message);
	assert.equal(hasCompleteSuccess(notifications, targetVersion), false);
	assert.equal(hasLegacyCleanComplete(notifications, targetVersion), false);
	resetMigrationTestHarness();
});

await check("Formatted completed-with-errors notification includes version and multiple error counts", async () => {
	const targetVersion = "9.9.9";
	const first = remappableActor("FmtBadActorA000001", "Bad Actor A");
	const second = remappableActor("FmtBadActorB000002", "Bad Actor B");
	const { notifications } = installMigrationTestHarness({
		actors: [first, second],
		moduleVersion: targetVersion,
		moduleMigrationVersion: "1.3.4"
	});
	globalThis.__SW5E_MIGRATION_TEST_HOOKS__ = {
		failDocumentId: "FmtBadActorA000001",
		failUpdateDocumentId: "FmtBadActorB000002",
		error: new Error("multi document boom")
	};
	await migrateWorld();
	const complete = notifications.find(n => n.type === "warn" && n.message === expectedCompleteWithErrors(targetVersion, 2));
	assert.ok(complete);
	assert.equal(getLastMigrationRun().documentFailures.length, 2);
	assert.match(complete.message, /to version 9\.9\.9 completed with 2 document error\(s\)/);
	assertNoUnresolvedPlaceholders(complete.message);
	assert.equal(hasCompleteSuccess(notifications, targetVersion), false);
	resetMigrationTestHarness();
});

await check("Formatted blocked notification includes the attempted target version", async () => {
	const targetVersion = "6.6.6";
	const { notifications } = installMigrationTestHarness({
		actors: [successActor()],
		moduleVersion: targetVersion,
		moduleMigrationVersion: "1.3.4"
	});
	globalThis.__SW5E_MIGRATION_TEST_HOOKS__ = { forceUnexpectedAt: "collect-world" };
	try {
		await migrateWorld();
		assert.fail("should throw");
	} catch {
		const begin = notifications.find(n => n.type === "info" && n.message === expectedBegin(targetVersion));
		const blocked = notifications.find(n => n.type === "error" && n.message === expectedBlocked(targetVersion));
		assert.ok(begin);
		assert.ok(blocked);
		assert.match(blocked.message, /to version 6\.6\.6 could not complete/);
		assertNoUnresolvedPlaceholders(blocked.message);
		assert.equal(hasCompleteSuccess(notifications, targetVersion), false);
		assert.equal(hasCompleteWithErrors(notifications, targetVersion), false);
	}
	resetMigrationTestHarness();
});

await check("Expected sparse/legacy no-op does not fail migration", async () => {
	const actor = createActorDoc({
		_id: "SparseActor000001",
		name: "Sparse Actor",
		type: "npc",
		items: [{ _id: "SparseItem0000001", name: "Sparse", type: "feat" }]
	});
	const { settingsStore, notifications } = installMigrationTestHarness({
		actors: [actor],
		moduleMigrationVersion: "1.3.4"
	});
	await migrateWorld();
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.4.1");
	assert.equal(hasBlocked(notifications), false);
	assert.equal(hasCompleteWithErrors(notifications), false);
	resetMigrationTestHarness();
});

await check("1. One Actor migration throws, later Actors still process", async () => {
	const first = remappableActor("BadActor000000001", "Bad Actor");
	const second = remappableActor("OkActor0000000002", "Later Actor");
	const { notifications, settingsStore } = installMigrationTestHarness({
		actors: [first, second],
		moduleMigrationVersion: "1.3.4"
	});
	globalThis.__SW5E_MIGRATION_TEST_HOOKS__ = {
		failDocumentId: "BadActor000000001",
		error: new Error("actor transform boom")
	};
	await migrateWorld();
	assert.equal(first.updated, undefined);
	assert.equal(second.updated, true);
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.3.4");
	assert.equal(hasCompleteWithErrors(notifications), true);
	resetMigrationTestHarness();
});

await check("2. One Item migration throws, later Items still process", async () => {
	const first = remappableItem("BadItem0000000001", "Bad Item");
	const second = remappableItem("OkItem00000000002", "Later Item");
	const { notifications, settingsStore } = installMigrationTestHarness({
		items: [first, second],
		moduleMigrationVersion: "1.3.4"
	});
	globalThis.__SW5E_MIGRATION_TEST_HOOKS__ = {
		failDocumentId: "BadItem0000000001",
		error: new Error("item transform boom")
	};
	await migrateWorld();
	assert.equal(first.updated, undefined);
	assert.equal(second.updated, true);
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.3.4");
	assert.equal(hasCompleteWithErrors(notifications), true);
	resetMigrationTestHarness();
});

await check("3. One Scene ActorDelta migration throws, later Scenes still process", async () => {
	const firstDelta = remappableActor("DeltaActor00000001", "Delta One");
	const secondDelta = remappableActor("DeltaActor00000002", "Delta Two");
	const firstScene = createSceneDoc({
		id: "SceneBad000000001",
		name: "Bad Scene",
		tokens: [createUnlinkedToken({ id: "TokenBad000000001", actor: firstDelta })]
	});
	const secondScene = createSceneDoc({
		id: "SceneOk0000000001",
		name: "Later Scene",
		tokens: [createUnlinkedToken({ id: "TokenOk0000000001", actor: secondDelta })]
	});
	const { notifications, settingsStore } = installMigrationTestHarness({
		scenes: [firstScene, secondScene],
		moduleMigrationVersion: "1.3.4"
	});
	globalThis.__SW5E_MIGRATION_TEST_HOOKS__ = {
		failDocumentId: "delta-TokenBad000000001",
		error: new Error("scene delta boom")
	};
	await migrateWorld();
	assert.equal(firstDelta.updated, undefined);
	assert.equal(secondDelta.updated, true);
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.3.4");
	assert.equal(hasCompleteWithErrors(notifications), true);
	resetMigrationTestHarness();
});

await check("4. One Compendium document transform throws, later documents still process", async () => {
	const first = remappableActor("PackActorBad00001", "Pack Bad");
	const second = remappableActor("PackActorOk000002", "Pack Later");
	const pack = createLockedPack({
		collection: "world.test-actors",
		documentName: "Actor",
		documents: [first, second]
	});
	const { notifications, settingsStore } = installMigrationTestHarness({
		packs: [pack],
		moduleMigrationVersion: "1.3.4"
	});
	globalThis.__SW5E_MIGRATION_TEST_HOOKS__ = {
		failDocumentId: "PackActorBad00001",
		error: new Error("compendium transform boom")
	};
	await migrateWorld();
	assert.equal(first.updated, undefined);
	assert.equal(second.updated, true);
	const packFailure = getLastMigrationRun().documentFailures.find(row => row.documentId === "PackActorBad00001");
	assert.ok(packFailure);
	assert.equal(packFailure.sourceContext, "compendium-actor-item");
	assert.equal(packFailure.packId, "world.test-actors");
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.3.4");
	assert.equal(hasCompleteWithErrors(notifications), true);
	resetMigrationTestHarness();
});

await check("5-8. Failed document update is skipped, identity recorded, completion-with-errors shown", async () => {
	const first = remappableActor("FailUpdateActor001", "Fail Update");
	const second = remappableActor("OkActor0000000003", "Safe Actor");
	const original = new Error("update boom");
	original.stack = "Error: update boom\n    at test:2:2";
	const { notifications, settingsStore } = installMigrationTestHarness({
		actors: [first, second],
		moduleMigrationVersion: "1.3.4"
	});
	globalThis.__SW5E_MIGRATION_TEST_HOOKS__ = {
		failUpdateDocumentId: "FailUpdateActor001",
		error: original
	};
	await migrateWorld();
	assert.equal(first.updated, undefined);
	assert.equal(second.updated, true);
	const run = getLastMigrationRun();
	const failure = run.documentFailures.find(row => row.documentId === "FailUpdateActor001");
	assert.ok(failure);
	assert.equal(failure.documentType, "Actor");
	assert.equal(failure.documentName, "Fail Update");
	assert.equal(failure.originalError, original);
	assert.match(failure.originalStack, /update boom/);
	assert.equal(hasCompleteWithErrors(notifications), true);
	assert.equal(hasCompleteSuccess(notifications), false);
	assert.equal(hasLegacyCleanComplete(notifications), false);
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.3.4");
	resetMigrationTestHarness();
});

await check("9-10. Recoverable failures remain unstamped and retryable on next login", async () => {
	const first = remappableActor("BadActor000000009", "Bad Actor");
	const second = remappableActor("OkActor0000000009", "Later Actor");
	const { settingsStore } = installMigrationTestHarness({
		actors: [first, second],
		moduleMigrationVersion: "1.3.4"
	});
	globalThis.__SW5E_MIGRATION_TEST_HOOKS__ = {
		failDocumentId: "BadActor000000009",
		error: new Error("recoverable boom")
	};
	await migrateWorld();
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.3.4");
	assert.equal(needsMigration(), true);
	resetMigrationTestHarness();
});

await check("11. Blocking pack failure prevents version advancement", async () => {
	const pack = createLockedPack({
		collection: "world.test-actors",
		documentName: "Actor",
		documents: [remappableActor("PackActorOk000011", "Pack Actor")],
		migrateImpl() { throw new Error("pack migrate exploded"); }
	});
	const { settingsStore, notifications } = installMigrationTestHarness({
		packs: [pack],
		moduleMigrationVersion: "1.3.4"
	});
	let thrown = null;
	try {
		await migrateWorld();
	} catch (err) {
		thrown = err;
	}
	assert.ok(thrown instanceof MigrationDocumentError);
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.3.4");
	assert.equal(hasCompleteSuccess(notifications), false);
	assert.equal(hasCompleteWithErrors(notifications), false);
	assert.equal(hasBlocked(notifications), true);
	resetMigrationTestHarness();
});

await check("12. Pack-lock restoration failure is blocking", async () => {
	const pack = createLockedPack({
		collection: "world.test-actors",
		documentName: "Actor",
		documents: [remappableActor("PackActorOk000012", "Pack Actor")],
		configureImpl({ locked }) {
			if ( locked === true ) throw new Error("cannot restore lock");
			this.locked = locked;
		}
	});
	const { settingsStore, notifications } = installMigrationTestHarness({
		packs: [pack],
		moduleMigrationVersion: "1.3.4"
	});
	let thrown = null;
	try {
		await migrateWorld();
	} catch (err) {
		thrown = err;
	}
	assert.ok(thrown);
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.3.4");
	assert.equal(hasCompleteSuccess(notifications), false);
	assert.equal(hasCompleteWithErrors(notifications), false);
	assert.equal(hasBlocked(notifications), true);
	resetMigrationTestHarness();
});

await check("13. Migration-setting persistence failure is blocking", async () => {
	const persistError = new Error("settings set failed");
	const { settingsStore, notifications } = installMigrationTestHarness({
		actors: [successActor()],
		moduleMigrationVersion: "1.3.4",
		throwOnSettingsSet: persistError
	});
	let thrown = null;
	try {
		await migrateWorld();
	} catch (err) {
		thrown = err;
	}
	assert.ok(thrown instanceof MigrationDocumentError);
	assert.equal(thrown.originalError, persistError);
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.3.4");
	assert.equal(hasCompleteSuccess(notifications), false);
	assert.equal(hasCompleteWithErrors(notifications), false);
	assert.equal(hasBlocked(notifications), true);
	resetMigrationTestHarness();
});

await check("14. Artwork-violating document is skipped without affecting safe documents", async () => {
	const unsafe = remappableActor("ArtBadActor000001", "Unsafe Art");
	const safe = remappableActor("ArtOkActor0000002", "Safe Art");
	const { notifications, settingsStore } = installMigrationTestHarness({
		actors: [unsafe, safe],
		moduleMigrationVersion: "1.3.4"
	});
	globalThis.__SW5E_MIGRATION_TEST_HOOKS__ = { forceArtworkClearForId: "ArtBadActor000001" };
	await migrateWorld();
	assert.equal(unsafe.updated, undefined);
	assert.equal(safe.updated, true);
	const run = getLastMigrationRun();
	assert.ok(run.summary.artworkInvariantSkips >= 1);
	assert.ok(run.documentFailures.some(row => row.documentId === "ArtBadActor000001"));
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.3.4");
	assert.equal(hasCompleteWithErrors(notifications), true);
	assert.equal(hasCompleteSuccess(notifications), false);
	resetMigrationTestHarness();
});

await check("15. Missing-system Item is handled explicitly without throw", async () => {
	const actor = createActorDoc({
		_id: "MissingSysActor001",
		name: "Missing System Actor",
		type: "npc",
		img: "icons/svg/mystery-man.svg",
		prototypeToken: { texture: { src: "icons/svg/mystery-man.svg" } },
		items: [{ _id: "MissingSysItem0001", name: "No System", type: "feat" }]
	});
	const { notifications, settingsStore } = installMigrationTestHarness({
		actors: [actor],
		moduleMigrationVersion: "1.3.4"
	});
	await migrateWorld();
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.4.1");
	assert.equal(hasCompleteWithErrors(notifications), false);
	assert.equal(hasBlocked(notifications), false);
	assert.equal(hasCompleteSuccess(notifications), true);
	resetMigrationTestHarness();
});

await check("Blocking coordinator hook still aborts without advancing version", async () => {
	const pack = createLockedPack();
	const { settingsStore, notifications } = installMigrationTestHarness({
		actors: [successActor()],
		packs: [pack],
		moduleMigrationVersion: "1.3.4"
	});
	const original = new Error("forced boom");
	original.stack = "Error: forced boom\n    at test:1:1";
	globalThis.__SW5E_MIGRATION_TEST_HOOKS__ = {
		forceUnexpectedAt: "before-sw5e-write",
		error: original
	};
	let thrown = null;
	try {
		await migrateWorld();
	} catch (err) {
		thrown = err;
	}
	assert.ok(thrown instanceof MigrationDocumentError);
	assert.equal(thrown.originalError, original);
	assert.match(thrown.originalStack, /forced boom/);
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.3.4");
	assert.equal(hasCompleteSuccess(notifications), false);
	assert.equal(hasCompleteWithErrors(notifications), false);
	assert.equal(hasBlocked(notifications), true);
	assert.equal(pack.locked, true);
	// V14 writes world documents before pack.migrate(), so this hook fires
	// before any writes or pack unlock. partialWrites is therefore false.
	assert.equal(thrown.partialWrites, false);
	resetMigrationTestHarness();
});

await check("Forced failure after Foundry pack.migrate reports ledger and restores lock", async () => {
	const pack = createLockedPack();
	const { settingsStore } = installMigrationTestHarness({
		actors: [successActor()],
		packs: [pack],
		moduleMigrationVersion: "1.3.4"
	});
	globalThis.__SW5E_MIGRATION_TEST_HOOKS__ = { forceUnexpectedAt: "after-foundry-pack-migrate" };
	let thrown = null;
	try {
		await migrateWorld();
	} catch (err) {
		thrown = err;
	}
	assert.ok(thrown instanceof MigrationDocumentError);
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.3.4");
	assert.equal(pack.locked, true);
	assert.ok(pack.migratedCount >= 1);
	const row = thrown.packLedger.find(r => r.packId === pack.collection);
	assert.ok(row);
	assert.equal(row.foundryMigrateCompleted, true);
	assert.equal(row.finalLocked, true);
	assert.ok(thrown.partialWrites);
	resetMigrationTestHarness();
});

await check("Corrected rerun remains eligible and successful rerun advances version", async () => {
	const { settingsStore } = installMigrationTestHarness({
		actors: [successActor()],
		moduleMigrationVersion: "1.3.4"
	});
	globalThis.__SW5E_MIGRATION_TEST_HOOKS__ = { forceUnexpectedAt: "collect-world" };
	try {
		await migrateWorld();
		assert.fail("should throw");
	} catch {
		assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.3.4");
	}
	globalThis.__SW5E_MIGRATION_TEST_HOOKS__ = {};
	await migrateWorld();
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.4.1");
	resetMigrationTestHarness();
});

await check("Placeholder #{VERSION}# still remediates Auto-Thrusters and stamps are skipped", async () => {
	const actorSource = {
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
				_id: "DwFh63OFTvVGSjQD",
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
	const { notifications, settingsStore } = installMigrationTestHarness({
		moduleVersion: "#{VERSION}#",
		needsMigrationVersion: "2.0.0",
		moduleMigrationVersion: "1.3.6",
		actors: [createMockActor(actorSource)]
	});
	assert.equal(needsMigration(), true);
	await migrateWorld();
	const run = getLastMigrationRun();
	const actor = game.actors.get("LRB3mTAKyvKVAV3Z");
	const effect = actor.items.get("bYUvLvm9ant0G9t7").effects.get("DwFh63OFTvVGSjQD");
	assert.equal(run.summary.autoThrusters.updatedVerified >= 1, true);
	assert.equal(run.summary.completionState, "completed");
	assert.equal(run.summary.stampSkippedReason, "development-placeholder-version");
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.3.6");
	assert.ok(hasDevelopmentCompleteSuccess(notifications, "#{VERSION}#"));
	assert.equal(effect.system.changes[0].key, "system.abilities.dex.bonuses.save");
	assert.equal(actor.effects.has("9hTss8Gebtw4efXl"), false);
	resetMigrationTestHarness();
});

await check("Ambiguous Auto-Thrusters remediation blocks clean success", async () => {
	const broken = {
		_id: "LRB3mTAKyvKVAV3Z",
		name: "A/SF-01 B-wing starfighter",
		type: "vehicle",
		flags: { sw5e: { legacyStarshipActor: { type: "starship" } } },
		effects: [],
		items: [{
			_id: "bYUvLvm9ant0G9t7",
			name: "Auto-Thrusters",
			type: "feat",
			system: { description: { value: "", chat: "" } },
			_stats: { compendiumSource: "Compendium.sw5e-module.starships.Ps2LiBeSQQAi57Kf" },
			effects: []
		}]
	};
	const { notifications } = installMigrationTestHarness({
		moduleVersion: "#{VERSION}#",
		needsMigrationVersion: "2.0.0",
		moduleMigrationVersion: "1.3.6",
		actors: [createMockActor(broken)]
	});
	await migrateWorld();
	const run = getLastMigrationRun();
	assert.equal(run.summary.autoThrusters.ambiguous >= 1, true);
	assert.equal(run.summary.completionState, "completed-with-errors");
	assert.equal(hasDevelopmentCompleteSuccess(notifications, "#{VERSION}#"), false);
	assert.ok(hasCompleteWithErrors(notifications, "#{VERSION}#", run.summary.autoThrusters.ambiguous));
	resetMigrationTestHarness();
});

console.log(`\n${passed} passed`);
