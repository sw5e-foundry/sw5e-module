#!/usr/bin/env node
import assert from "node:assert/strict";
import { installMigrationTestHarness, resetMigrationTestHarness } from "./test-migration-foundry-harness.mjs";
import { analyzeLegacyItemPack, repairLegacyItemPack } from "../scripts/legacy-pack-preflight.mjs";
import { getLegacyItemTypeTarget } from "../scripts/dnd5e-source-normalization.mjs";
import { getLastMigrationRun, migrateWorld, needsMigration } from "../scripts/migration.mjs";

function makePack(count=1, { partial=false, missingSystem=false }={}) {
	const sources = new Map(Array.from({ length: count }, (_, i) => {
		const id = `LegacyMod${String(i).padStart(8, "0")}`;
		return [id, {
			_id: id,
			name: `Modification ${i}`,
			type: "sw5e-mod-slots.modification",
			system: missingSystem ? undefined : { description: { value: "Original content", chat: "" } }
		}];
	}));
	const pack = {
		collection: "world.sw5e-modifications-v2",
		documentName: "Item",
		metadata: { packageType: "world" },
		locked: true,
		migratedCount: 0,
		writes: 0,
		async configure({ locked }) { this.locked = locked; },
		async getIndex() { return [...sources.values()].map(source => structuredClone(source)); },
		async getDocument(id) {
			const source = sources.get(id);
			if ( !source || source.type.startsWith("sw5e-mod-slots.") ) return null;
			return {
				id, type: source.type, name: source.name, uuid: `Compendium.${this.collection}.Item.${id}`,
				toObject: () => structuredClone(source),
				async update(payload) { Object.assign(source, structuredClone(payload)); }
			};
		},
		async getDocuments() {
			return Promise.all([...sources.keys()].map(id => this.getDocument(id)));
		},
		async migrate() {
			this.migratedCount += 1;
			if ([...sources.values()].some(source => source.type.startsWith("sw5e-mod-slots."))) {
				throw new Error("invalid legacy Item type");
			}
		}
	};
	pack.documentClass = class {
		static async updateDocuments(updates, options) {
			assert.equal(options.pack, pack.collection);
			assert.equal(options.recursive, false);
			assert.equal(pack.locked, false);
			pack.writes += 1;
			const accepted = partial ? updates.slice(0, -1) : updates;
			for (const update of accepted) Object.assign(sources.get(update._id), structuredClone(update));
			return accepted.map(update => ({ id: update._id, type: update.type }));
		}
	};
	return { pack, sources };
}

installMigrationTestHarness();
assert.equal(getLegacyItemTypeTarget("sw5e-mod-slots.modification"), "loot");
assert.equal(getLegacyItemTypeTarget("sw5e.power"), "spell");
assert.equal(getLegacyItemTypeTarget("sw5e.fightingstyle"), "feat");
assert.equal(getLegacyItemTypeTarget("unknown-homebrew"), null);
{
	const { pack, sources } = makePack(26);
	const entries = await analyzeLegacyItemPack(pack);
	assert.equal(entries.length, 26);
	assert.equal(entries[0].to, "loot");
	await pack.configure({ locked: false });
	assert.equal(await repairLegacyItemPack(pack, entries), 26);
	assert.equal(pack.writes, 2, "bounded batches");
	assert.ok([...sources.values()].every(source => source.type === "loot"));
}
{
	const { pack } = makePack(2, { partial: true });
	const entries = await analyzeLegacyItemPack(pack);
	await pack.configure({ locked: false });
	await assert.rejects(repairLegacyItemPack(pack, entries), /repair incomplete/);
}
{
	const { pack } = makePack(1, { missingSystem: true });
	const entries = await analyzeLegacyItemPack(pack);
	await pack.configure({ locked: false });
	await assert.rejects(repairLegacyItemPack(pack, entries), /Missing indexed system data/);
	assert.equal(pack.writes, 0);
}
resetMigrationTestHarness();

{
	const { pack, sources } = makePack(1);
	const { settingsStore } = installMigrationTestHarness({
		packs: [pack],
		moduleMigrationVersion: "1.3.4"
	});
	assert.equal(needsMigration(), true, "pack-only worlds must be migrated");
	await migrateWorld();
	assert.equal(sources.values().next().value.type, "loot");
	assert.equal(pack.migratedCount, 1, "do not rerun pack.migrate during writes");
	assert.equal(pack.locked, true);
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.4.1");
	assert.equal(getLastMigrationRun().summary.completionState, "completed");
	resetMigrationTestHarness();
}
{
	const { pack } = makePack(2, { partial: true });
	const { settingsStore } = installMigrationTestHarness({
		packs: [pack], moduleMigrationVersion: "1.3.4"
	});
	await assert.rejects(migrateWorld(), /Legacy Item repair incomplete/);
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.3.4");
	assert.equal(pack.locked, true);
	assert.equal(pack.migratedCount, 0);
	assert.equal(getLastMigrationRun().summary.completionState, "blocked");
	resetMigrationTestHarness();
}
{
	const broken = {
		id: "BrokenRead0000001", name: "Broken read",
		toObject() { throw new Error("source read failed"); }
	};
	const good = {
		id: "GoodRead00000001", name: "Good read",
		toObject() { return { _id: this.id, name: this.name, type: "loot",
			system: { description: { value: "Retained", chat: "" } } }; },
		async update() { this.updated = true; }
	};
	const { settingsStore } = installMigrationTestHarness({
		items: [broken, good], moduleMigrationVersion: "1.3.4"
	});
	await migrateWorld();
	assert.equal(getLastMigrationRun().documentFailures.length, 1);
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.4.1");
	resetMigrationTestHarness();
}
console.log("ok - legacy pack preflight and world integration");
