#!/usr/bin/env node
/**
 * Advancement migration: missing-system guards, quiet no-op, valid transforms, idempotency.
 */
import assert from "node:assert/strict";
import {
	installMigrationTestHarness,
	resetMigrationTestHarness
} from "./test-migration-foundry-harness.mjs";
import {
	SOURCE_CONTEXT,
	MISSING_SYSTEM_CLASS,
	describeItemSystemShape,
	classifyMissingSystem
} from "../scripts/migration-identity.mjs";
import {
	migrateItemData,
	migrateActorData,
	migrateSceneData
} from "../scripts/migration.mjs";

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function clone(value) {
	return structuredClone(value);
}

function assertUnchanged(before, after, label) {
	assert.deepEqual(after, before, label);
}

function advancementFromUpdate(update) {
	const raw = update?.["system.advancement"] ?? update?.system?.advancement;
	const ForcedReplacement = globalThis.foundry?.data?.operators?.ForcedReplacement;
	if ( ForcedReplacement && raw instanceof ForcedReplacement ) return ForcedReplacement.get(raw);
	if ( raw && typeof raw === "object" && raw[Symbol.for("sw5e.ForcedReplacement")] === true ) return raw.value;
	return raw;
}

function advancementEntries(update) {
	const advancement = advancementFromUpdate(update);
	if ( !advancement ) return [];
	return Array.isArray(advancement) ? advancement : Object.values(advancement);
}

installMigrationTestHarness();

const validAdvancementItem = {
	_id: "ValidAdvItem0001",
	name: "SYNTH Valid Adv",
	type: "feat",
	system: {
		advancement: [
			{
				_id: "Adv0000000000001",
				type: "ItemGrant",
				configuration: { pool: ["languages:standard:basic"] },
				value: {}
			}
		]
	}
};

check("Item with valid advancement migrates pool link and stays idempotent", () => {
	const source = clone(validAdvancementItem);
	const first = migrateItemData(source, {}, {}, { sourceContext: SOURCE_CONTEXT.WORLD_ITEM });
	assert.equal(advancementEntries(first)[0].configuration.pool[0], "languages:standard:common");
	assert.equal(Object.prototype.hasOwnProperty.call(source, "system"), true);
	const secondSource = clone(validAdvancementItem);
	secondSource.system.advancement[0].configuration.pool[0] = "languages:standard:common";
	const second = migrateItemData(secondSource, {}, {}, { sourceContext: SOURCE_CONTEXT.WORLD_ITEM });
	assert.equal(advancementEntries(second)[0].configuration.pool[0], "languages:standard:common");
});

check("Item with system but no advancement is a quiet no-op", () => {
	const item = { _id: "NoAdv00000000001", name: "No Adv", type: "feat", system: { description: { value: "", chat: "" } } };
	const before = clone(item);
	const warnings = [];
	const origWarn = console.warn;
	console.warn = (...args) => warnings.push(args);
	try {
		const update = migrateItemData(item, {}, {}, { sourceContext: SOURCE_CONTEXT.WORLD_ITEM });
		assert.equal(update["system.advancement"], undefined);
		assert.equal("system" in update, false);
		assertUnchanged(item, before, "source mutated");
		assert.equal(warnings.length, 0);
	} finally {
		console.warn = origWarn;
	}
});

function assertMissingSystemNoThrow(item, context, expectedClass) {
	const before = clone(item);
	const shape = describeItemSystemShape(item);
	assert.equal(shape.hasSystem, false);
	assert.equal(classifyMissingSystem(context.sourceContext), expectedClass);
	let thrown = null;
	try {
		const update = migrateItemData(item, {}, {}, context);
		assert.equal(update["system.advancement"], undefined);
		assert.equal(update.system, undefined);
		assert.ok(!("system" in item) || item.system === undefined);
		assertUnchanged(item, before, "missing-system source must be unchanged");
	} catch (err) {
		thrown = err;
	}
	assert.equal(thrown, null, thrown?.stack ?? "threw");
}

check("Scene ActorDelta Item without system does not throw or invent data", () => {
	assertMissingSystemNoThrow(
		{ _id: "DeltaNoSys000001", name: "Delta Sparse", type: "feat" },
		{
			sourceContext: SOURCE_CONTEXT.SCENE_ACTOR_DELTA_ITEM,
			sceneId: "Scene00000000001",
			tokenId: "Token00000000001",
			actorLink: false,
			actorId: "Actor00000000001",
			actorDeltaPresent: true
		},
		MISSING_SYSTEM_CLASS.LEGACY_SPARSE_DELTA
	);
});

check("Compendium Scene ActorDelta Item without system does not throw or invent data", () => {
	assertMissingSystemNoThrow(
		{ _id: "PackDeltaNoSys01", name: "Pack Delta Sparse", type: "feat" },
		{
			sourceContext: SOURCE_CONTEXT.COMPENDIUM_SCENE_DELTA_ITEM,
			packId: "world.synth-fail-scenes",
			sceneId: "SynthFailScene01",
			tokenId: "SynthFailToken01",
			actorLink: false,
			actorDeltaPresent: true
		},
		MISSING_SYSTEM_CLASS.LEGACY_SPARSE_DELTA
	);
});

check("Full world Item without system is preserved with higher-severity class", () => {
	assertMissingSystemNoThrow(
		{ _id: "WorldNoSys000001", name: "World Sparse", type: "feat" },
		{ sourceContext: SOURCE_CONTEXT.WORLD_ITEM },
		MISSING_SYSTEM_CLASS.FULL_ITEM_OMISSION
	);
});

check("Actor embedded Item without system is preserved", () => {
	const actor = {
		_id: "ActorEmbed000001",
		name: "Embed Actor",
		type: "npc",
		items: [{ _id: "EmbedNoSys000001", name: "Embed Sparse", type: "feat" }]
	};
	const before = clone(actor);
	const update = migrateActorData(actor, {}, {}, {
		context: { sourceContext: SOURCE_CONTEXT.ACTOR_EMBEDDED_ITEM }
	});
	assert.equal(update.items, undefined);
	assertUnchanged(actor.items[0], before.items[0]);
});

check("Unsupported Item type without system is preserved", () => {
	assertMissingSystemNoThrow(
		{ _id: "PowerNoSys000001", name: "Legacy Power", type: "power" },
		{ sourceContext: SOURCE_CONTEXT.WORLD_ITEM },
		MISSING_SYSTEM_CLASS.FULL_ITEM_OMISSION
	);
});

check("Legacy class ItemChoice-to-Subclass still migrates when system exists", () => {
	const item = {
		_id: "ClassLegacy00001",
		name: "Legacy Class",
		type: "class",
		system: {
			advancement: [
				{
					_id: "AdvClass00000001",
					type: "ItemChoice",
					configuration: { type: "subclass" },
					value: {}
				}
			]
		}
	};
	const update = migrateItemData(item, {}, {}, { sourceContext: SOURCE_CONTEXT.WORLD_ITEM });
	assert.equal(advancementEntries(update)[0].type, "Subclass");
});

check("Legacy subclass advancement uuid normalizes when present", () => {
	const item = {
		_id: "SubclassLeg00001",
		name: "Legacy Subclass",
		type: "subclass",
		system: {
			advancement: [
				{
					_id: "AdvSub0000000001",
					type: "Subclass",
					configuration: {},
					value: { uuid: "Compendium.sw5e.archetypes.Item.abcdefghijklmnop" }
				}
			]
		}
	};
	const update = migrateItemData(item, {}, {}, { sourceContext: SOURCE_CONTEXT.WORLD_ITEM });
	assert.match(advancementEntries(update)[0].value.uuid, /sw5e-module/);
});

check("Malformed advancement value does not throw or invent advancement", () => {
	const item = { _id: "BadAdv0000000001", name: "Bad Adv", type: "feat", system: { advancement: "not-an-array" } };
	const before = clone(item);
	const update = migrateItemData(item, {}, {}, { sourceContext: SOURCE_CONTEXT.WORLD_ITEM });
	assert.equal(update["system.advancement"], undefined);
	assert.equal(item.system.advancement, "not-an-array");
	assertUnchanged(item, before);
});

check("Array advancement form remains supported", () => {
	const item = clone(validAdvancementItem);
	const update = migrateItemData(item, {}, {}, { sourceContext: SOURCE_CONTEXT.WORLD_ITEM });
	const advancement = advancementFromUpdate(update);
	assert.ok(advancement, "array input must still migrate");
	assert.equal(advancementEntries(update)[0].configuration.pool[0], "languages:standard:common");
});

check("Object advancement form remains supported", () => {
	const item = {
		_id: "ObjAdv0000000001",
		name: "Object Adv",
		type: "feat",
		system: {
			advancement: {
				AdvObj0000000001: {
					type: "ItemGrant",
					configuration: { pool: ["languages:standard:basic"] },
					value: {}
				}
			}
		}
	};
	const update = migrateItemData(item, {}, {}, { sourceContext: SOURCE_CONTEXT.WORLD_ITEM });
	const advancement = advancementFromUpdate(update);
	assert.ok(advancement, "object advancement must still migrate");
	const entries = Array.isArray(advancement) ? advancement : Object.values(advancement);
	assert.equal(entries[0].configuration.pool[0], "languages:standard:common");
	assert.equal(item.system.advancement.AdvObj0000000001.configuration.pool[0], "languages:standard:basic");
});

check("migrateSceneData sparse delta item does not throw", () => {
	const scene = {
		_id: "SceneDelta000001",
		name: "Delta Scene",
		tokens: [
			{
				_id: "TokDelta00000001",
				name: "Unlinked",
				actorId: "ActorDelta000001",
				actorLink: false,
				delta: {
					_id: "ActorDeltaDoc001",
					items: [{ _id: "DeltaItem0000001", name: "Sparse", type: "feat" }]
				}
			}
		]
	};
	const before = clone(scene);
	const update = migrateSceneData(scene, {}, {
		sourceContext: SOURCE_CONTEXT.COMPENDIUM_SCENE_DELTA_ITEM,
		packId: "world.synth-fail-scenes"
	});
	assert.doesNotThrow(() => JSON.stringify(update));
	assert.equal(scene.tokens[0].delta.items[0].system, undefined);
	assertUnchanged(scene.tokens[0].delta.items[0], before.tokens[0].delta.items[0]);
});

check("describeItemSystemShape flags", () => {
	assert.deepEqual(describeItemSystemShape({ type: "feat" }), {
		hasSystem: false,
		hasAdvancementParent: false,
		advancementDefined: false
	});
	assert.deepEqual(describeItemSystemShape({ system: {} }), {
		hasSystem: true,
		hasAdvancementParent: true,
		advancementDefined: false
	});
	assert.deepEqual(describeItemSystemShape({ system: { advancement: [] } }), {
		hasSystem: true,
		hasAdvancementParent: true,
		advancementDefined: true
	});
});

resetMigrationTestHarness();
console.log(`\n${passed} passed`);
