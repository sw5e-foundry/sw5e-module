#!/usr/bin/env node
/**
 * Legacy world Item pack preflight. The migration stamp on this line is 2.0.0.
 * A partial repair does not stamp, and a later run can finish the remaining documents.
 */
import assert from "node:assert/strict";
import { installMigrationTestHarness, resetMigrationTestHarness } from "./test-migration-foundry-harness.mjs";
import { analyzeLegacyItemPack, repairLegacyItemPack } from "../scripts/legacy-pack-preflight.mjs";
import { getLegacyItemTypeTarget } from "../scripts/dnd5e-source-normalization.mjs";
import { getLastMigrationRun, migrateWorld, needsMigration } from "../scripts/migration.mjs";

function makePack(count=1, { partial=false, missingSystem=false, locked=true }={}) {
	const sources = new Map(Array.from({ length: count }, (_, i) => {
		const id = `LegacyMod${String(i).padStart(8, "0")}`;
		return [id, {
			_id: id,
			name: `Modification ${i}`,
			type: "sw5e-mod-slots.modification",
			system: missingSystem ? undefined : {
				description: { value: "Original content", chat: "" },
				activities: { act1: { _id: "act1", type: "attack" } },
				advancement: { adv1: { _id: "adv1", type: "ItemGrant" } }
			}
		}];
	}));
	const pack = {
		collection: "world.sw5e-modifications-v2",
		documentName: "Item",
		metadata: { packageType: "world" },
		locked,
		partial,
		migratedCount: 0,
		writes: 0,
		async configure({ locked: nextLocked }) { this.locked = nextLocked; },
		async getIndex() { return [...sources.values()].map(source => structuredClone(source)); },
		async getDocument(id) {
			const source = sources.get(id);
			if ( !source || source.type.startsWith("sw5e-mod-slots.") ) return null;
			return {
				id, type: source.type, name: source.name,
				toObject: () => structuredClone(source),
				async update(payload) { Object.assign(source, structuredClone(payload)); }
			};
		},
		async getDocuments() {
			const docs = await Promise.all([...sources.keys()].map(id => this.getDocument(id)));
			return docs.filter(Boolean);
		},
		async migrate() {
			this.migratedCount += 1;
			if ( [...sources.values()].some(source => String(source.type).startsWith("sw5e-mod-slots.")) ) {
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
			const accepted = pack.partial ? updates.slice(0, -1) : updates;
			for ( const update of accepted ) Object.assign(sources.get(update._id), structuredClone(update));
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
	const { pack } = makePack(1, { locked: true });
	const skipped = await analyzeLegacyItemPack(pack);
	assert.equal(skipped.skipped, true);
	assert.equal(skipped.skipReason, "locked");
	assert.equal(skipped.entries.length, 0);
	await pack.configure({ locked: false });
	const report = await analyzeLegacyItemPack(pack);
	assert.equal(report.inspected, 1);
	assert.equal(report.documentsRequiringRepair, 1);
	assert.equal(report.entries[0].name, "Modification 0");
	assert.equal(report.entries[0].from, "sw5e-mod-slots.modification");
	assert.equal(report.entries[0].to, "loot");
	assert.equal(report.entries[0].activities, "preserved");
	assert.equal(report.entries[0].advancement, "preserved");
}

{
	const { pack, sources } = makePack(26, { locked: false });
	const report = await analyzeLegacyItemPack(pack);
	assert.equal(await repairLegacyItemPack(pack, report.entries), 26);
	assert.equal(pack.writes, 2, "bounded batches");
	assert.ok([...sources.values()].every(source => source.type === "loot"));
	assert.equal(sources.values().next().value.system.activities.act1.type, "attack");
	assert.equal(sources.values().next().value.system.advancement.adv1.type, "ItemGrant");
}

{
	const { pack } = makePack(2, { partial: true, locked: false });
	const report = await analyzeLegacyItemPack(pack);
	await assert.rejects(repairLegacyItemPack(pack, report.entries), /repair incomplete/);
}

{
	const { pack } = makePack(1, { missingSystem: true, locked: false });
	const report = await analyzeLegacyItemPack(pack);
	assert.equal(report.failures[0].failure, "missing-system");
	await assert.rejects(repairLegacyItemPack(pack, report.entries), /repair refused|Missing indexed system/);
	assert.equal(pack.writes, 0);
}
resetMigrationTestHarness();

{
	const { pack, sources } = makePack(1);
	const { settingsStore } = installMigrationTestHarness({
		packs: [pack],
		moduleVersion: "2.0.0",
		needsMigrationVersion: "2.0.0",
		moduleMigrationVersion: "1.3.4"
	});
	assert.equal(needsMigration(), true);
	await migrateWorld();
	assert.equal(sources.values().next().value.type, "loot");
	assert.equal(pack.migratedCount, 1);
	assert.equal(pack.locked, true);
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "2.0.0");
	assert.equal(getLastMigrationRun().summary.completionState, "completed");
	const preflight = getLastMigrationRun().legacyPackPreflight;
	assert.equal(preflight[0].packId, pack.collection);
	assert.equal(preflight[0].documentsRequiringRepair, 1);
	resetMigrationTestHarness();
}

{
	const { pack } = makePack(2, { partial: true });
	const { settingsStore } = installMigrationTestHarness({
		packs: [pack],
		moduleVersion: "2.0.0",
		needsMigrationVersion: "2.0.0",
		moduleMigrationVersion: "1.3.4"
	});
	await assert.rejects(migrateWorld(), /Legacy Item repair incomplete/);
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "1.3.4");
	assert.equal(pack.locked, true);
	assert.equal(pack.migratedCount, 0);
	assert.equal(getLastMigrationRun().summary.completionState, "blocked");
	pack.partial = false;
	await migrateWorld();
	assert.equal(settingsStore["sw5e-module.moduleMigrationVersion"], "2.0.0");
	assert.equal(getLastMigrationRun().summary.completionState, "completed");
	resetMigrationTestHarness();
}

console.log("ok - legacy pack preflight and world integration");
