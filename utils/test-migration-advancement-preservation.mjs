#!/usr/bin/env node
/**
 * World-migration advancement/activity preservation.
 * Covers source serialization, embed expansion, full-source writes, and the
 * collection-loss guard. Does not prove Foundry copied-world runtime.
 */
import assert from "node:assert/strict";
import {
	installMigrationTestHarness,
	resetMigrationTestHarness
} from "./test-migration-foundry-harness.mjs";
import {
	createForcedReplacement
} from "../scripts/migration-operators.mjs";
import {
	createMigrationRunState,
	hasBlockingMigrationOutcome,
	SOURCE_CONTEXT
} from "../scripts/migration-identity.mjs";
import {
	getExpandedMigrationSource,
	isCollectionLossSafeCandidate,
	migrateWorld,
	migrateItemData,
	getLastMigrationRun,
	MigrationUnexpandedEmbedError,
	MigrationCollectionLossError
} from "../scripts/migration.mjs";

let passed = 0;
async function check(name, fn) {
	await fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

const ADV_HP = {
	_id: "AdvHp00000000001",
	type: "HitPoints",
	configuration: {},
	value: {},
	level: 0
};
const ADV_RAGE = {
	_id: "AdvRage000000001",
	type: "ScaleValue",
	configuration: {
		identifier: "rages",
		type: "number",
		scale: { "1": { value: 2 } }
	},
	value: {},
	title: "Rages"
};
const ACT_UTILITY = {
	_id: "act0000000000001",
	type: "utility",
	activation: { type: "action" },
	consumption: { targets: [] }
};

function classItemSource(id="ClassItem00000001", name="Berserker") {
	return {
		_id: id,
		name,
		type: "class",
		img: "icons/svg/item-bag.svg",
		system: {
			description: { value: "", chat: "" },
			advancement: [structuredClone(ADV_HP), structuredClone(ADV_RAGE)],
			activities: {
				[ACT_UTILITY._id]: structuredClone(ACT_UTILITY)
			}
		},
		flags: { sw5e: { keep: true } },
		effects: []
	};
}

function createPreparedWipeItem(source) {
	const updates = [];
	const item = {
		id: source._id,
		_id: source._id,
		name: source.name,
		uuid: `Item.${source._id}`,
		documentName: "Item",
		_source: structuredClone(source),
		toObject(includeSource=true) {
			if ( includeSource === false ) {
				const prepared = structuredClone(source);
				prepared.system = { ...prepared.system, advancement: {}, activities: {} };
				return prepared;
			}
			return structuredClone(source);
		},
		async update(payload, options={}) {
			updates.push({ payload, options });
			item.lastUpdate = payload;
			item.lastOptions = options;
		}
	};
	item.updates = updates;
	return item;
}

function createActorWithEmbedded(itemSource, { itemIdsAsStrings=false, effectIdsAsStrings=false, missingItem=false, missingEffect=false }={}) {
	const effectSource = {
		_id: "Eff0000000000001",
		name: "Keep Effect",
		img: "icons/svg/aura.svg",
		changes: [],
		system: { changes: [] }
	};
	const liveEffect = {
		id: effectSource._id,
		_id: effectSource._id,
		documentName: "ActiveEffect",
		toObject() { return structuredClone(effectSource); }
	};
	const itemEffects = new Map([[effectSource._id, liveEffect]]);
	const liveItemSource = {
		...structuredClone(itemSource),
		effects: effectIdsAsStrings ? [effectSource._id] : [structuredClone(effectSource)]
	};
	const liveItem = {
		id: itemSource._id,
		_id: itemSource._id,
		name: itemSource.name,
		documentName: "Item",
		effects: {
			get(id) { return missingEffect ? null : itemEffects.get(id); }
		},
		toObject() { return structuredClone(liveItemSource); }
	};
	const items = new Map([[itemSource._id, liveItem]]);
	const actorEffects = new Map();
	const actorEffectSource = {
		_id: "ActEff0000000001",
		name: "Actor Effect",
		img: "icons/svg/aura.svg",
		changes: [],
		system: { changes: [] }
	};
	const liveActorEffect = {
		id: actorEffectSource._id,
		_id: actorEffectSource._id,
		documentName: "ActiveEffect",
		toObject() { return structuredClone(actorEffectSource); }
	};
	actorEffects.set(actorEffectSource._id, liveActorEffect);

	const actorSource = {
		_id: "Actor000000000001",
		name: "Pilot",
		type: "character",
		img: "icons/svg/mystery-man.svg",
		system: { attributes: { hp: {} } },
		flags: {},
		items: itemIdsAsStrings ? [itemSource._id] : [{
			...structuredClone(itemSource),
			effects: effectIdsAsStrings ? [effectSource._id] : [structuredClone(effectSource)]
		}],
		effects: [actorEffectSource._id]
	};

	return {
		id: actorSource._id,
		_id: actorSource._id,
		name: actorSource.name,
		uuid: `Actor.${actorSource._id}`,
		documentName: "Actor",
		items: {
			get(id) { return missingItem ? null : items.get(id); }
		},
		effects: {
			get(id) { return actorEffects.get(id); }
		},
		toObject() { return structuredClone(actorSource); },
		liveItem,
		liveEffect,
		effectSource,
		actorEffectSource
	};
}

function emptyRun() {
	const run = createMigrationRunState();
	run.phase = "write";
	run.identity = { phase: "write", sourceContext: SOURCE_CONTEXT.WORLD_ITEM };
	return run;
}

function itemCandidate(liveItem, payload, extras={}) {
	return {
		documentType: "Item",
		documentId: liveItem._id ?? liveItem.id,
		document: liveItem,
		writePayload: payload,
		preparedUpdate: payload,
		options: { diff: false, recursive: false },
		persistSourceMigration: true,
		caller: extras.caller ?? "migrateWorld:Item",
		logName: liveItem.name ?? "item",
		sourceContext: SOURCE_CONTEXT.WORLD_ITEM,
		itemId: liveItem._id ?? liveItem.id,
		...extras
	};
}

function advancementById(advancement) {
	if ( Array.isArray(advancement) ) {
		return Object.fromEntries(
			advancement.filter(entry => entry && entry._id).map(entry => [entry._id, entry])
		);
	}
	return advancement && typeof advancement === "object" ? advancement : {};
}

function assertAdvancementPreserved(payload, source) {
	const advancement = advancementById(payload?.system?.advancement);
	assert.ok(Object.keys(advancement).length > 0, "expected preserved advancements");
	for ( const entry of source.system.advancement ) {
		const kept = advancement[entry._id];
		assert.ok(kept, `missing advancement ${entry._id}`);
		assert.equal(kept._id, entry._id);
		assert.equal(kept.type, entry.type);
		assert.deepEqual(kept.configuration, entry.configuration);
		assert.deepEqual(kept.value, entry.value);
		if ( entry.level !== undefined ) assert.equal(kept.level, entry.level);
		if ( entry.title !== undefined ) assert.equal(kept.title, entry.title);
	}
}

function assertActivityPreserved(payload, source) {
	const activities = payload?.system?.activities;
	assert.equal(typeof activities, "object");
	assert.equal(Array.isArray(activities), false);
	for ( const [key, entry] of Object.entries(source.system.activities) ) {
		const kept = activities[key] ?? activities[entry._id];
		assert.ok(kept, `missing activity ${key}`);
		assert.equal(kept._id, entry._id);
		assert.equal(kept.type, entry.type);
		if ( entry.activation ) assert.deepEqual(kept.activation, entry.activation);
		if ( entry.consumption ) assert.deepEqual(kept.consumption, entry.consumption);
	}
}

try {
	installMigrationTestHarness({
		moduleMigrationVersion: "1.3.4",
		needsMigrationVersion: "1.3.6"
	});

	await check("getExpandedMigrationSource uses toObject() source, not prepared empty collections", () => {
		const source = classItemSource();
		const item = createPreparedWipeItem(source);
		const expanded = getExpandedMigrationSource(item);
		assert.equal(Object.keys(item.toObject(false).system.advancement).length, 0);
		assert.equal(Object.keys(item.toObject(false).system.activities).length, 0);
		assertAdvancementPreserved(expanded, source);
		assertActivityPreserved(expanded, source);
		assert.equal(expanded.flags.sw5e.keep, true);
		assert.equal(expanded.img, source.img);
	});

	await check("migrateItemData full-source payload keeps advancement and activity identities", () => {
		const source = classItemSource();
		const flags = { persistSourceMigration: false };
		const payload = migrateItemData(structuredClone(source), {}, flags, {
			sourceContext: SOURCE_CONTEXT.WORLD_ITEM
		});
		assert.equal(flags.persistSourceMigration, true);
		assert.equal(Array.isArray(payload.system.advancement), false);
		assertAdvancementPreserved(payload, source);
		assertActivityPreserved(payload, source);
		assert.equal(payload.flags.sw5e.keep, true);
	});

	await check("migrateWorld full-source write retains advancements and activities from a prepared-wipe fixture", async () => {
		resetMigrationTestHarness();
		const source = classItemSource("WorldClass0000001", "World Berserker");
		const item = createPreparedWipeItem(source);
		installMigrationTestHarness({
			items: [item],
			moduleMigrationVersion: "1.3.4",
			needsMigrationVersion: "1.3.6"
		});
		await migrateWorld();
		assert.ok(item.updates.length >= 1, "expected a persisted Item update");
		const write = item.updates[item.updates.length - 1];
		assert.equal(write.options.recursive, false);
		assert.equal(write.options.diff, false);
		assert.equal(Array.isArray(write.payload.system.advancement), false);
		assertAdvancementPreserved(write.payload, source);
		assertActivityPreserved(write.payload, source);
		const run = getLastMigrationRun();
		assert.equal(run.summary.collectionLossSkips, 0);
		assert.equal(hasBlockingMigrationOutcome(run.summary), false);
	});

	await check("loss guard blocks emptied advancements", () => {
		const live = {
			_id: "GuardItem00000001",
			name: "Guard Item",
			uuid: "Item.GuardItem00000001",
			_source: { system: { advancement: { [ADV_HP._id]: ADV_HP }, activities: {} } }
		};
		const run = emptyRun();
		const ok = isCollectionLossSafeCandidate(run, itemCandidate(live, {
			_id: live._id,
			system: { advancement: {}, activities: {} }
		}));
		assert.equal(ok, false);
		assert.equal(run.summary.collectionLossSkips, 1);
		assert.equal(run.documentFailures.length, 1);
		assert.ok(run.documentFailures[0].originalError instanceof MigrationCollectionLossError);
		assert.equal(run.documentFailures[0].originalError.violations[0].collection, "system.advancement");
		assert.equal(run.documentFailures[0].originalError.violations[0].before, 1);
		assert.equal(run.documentFailures[0].originalError.violations[0].after, 0);
	});

	await check("loss guard blocks emptied activities", () => {
		const live = {
			_id: "GuardItem00000002",
			name: "Guard Item",
			uuid: "Item.GuardItem00000002",
			_source: { system: { advancement: {}, activities: { [ACT_UTILITY._id]: ACT_UTILITY } } }
		};
		const run = emptyRun();
		const ok = isCollectionLossSafeCandidate(run, itemCandidate(live, {
			_id: live._id,
			system: { advancement: {}, activities: {} }
		}));
		assert.equal(ok, false);
		assert.equal(run.summary.collectionLossSkips, 1);
		assert.equal(run.documentFailures.length, 1);
		assert.equal(run.documentFailures[0].originalError.violations[0].collection, "system.activities");
	});

	await check("loss guard records one candidate failure when both collections are emptied", () => {
		const live = {
			_id: "GuardItem00000003",
			name: "Guard Item",
			uuid: "Item.GuardItem00000003",
			_source: {
				system: {
					advancement: { [ADV_HP._id]: ADV_HP },
					activities: { [ACT_UTILITY._id]: ACT_UTILITY }
				}
			}
		};
		const run = emptyRun();
		const ok = isCollectionLossSafeCandidate(run, itemCandidate(live, {
			_id: live._id,
			system: { advancement: {}, activities: {} }
		}));
		assert.equal(ok, false);
		assert.equal(run.summary.collectionLossSkips, 1);
		assert.equal(run.documentFailures.length, 1);
		assert.equal(run.documentFailures[0].originalError.violations.length, 2);
	});

	await check("loss guard allows empty-to-empty, missing-to-missing, and preserved non-empty", () => {
		const emptyLive = { _id: "EmptyItem00000001", _source: { system: { advancement: {}, activities: {} } } };
		const missingLive = { _id: "MissingItem000001", _source: { system: {} } };
		const fullLive = {
			_id: "FullItem000000001",
			_source: {
				system: {
					advancement: { [ADV_HP._id]: ADV_HP },
					activities: { [ACT_UTILITY._id]: ACT_UTILITY }
				}
			}
		};
		assert.equal(isCollectionLossSafeCandidate(emptyRun(), itemCandidate(emptyLive, {
			_id: emptyLive._id,
			system: { advancement: {}, activities: {} }
		})), true);
		assert.equal(isCollectionLossSafeCandidate(emptyRun(), itemCandidate(missingLive, {
			_id: missingLive._id,
			system: {}
		})), true);
		assert.equal(isCollectionLossSafeCandidate(emptyRun(), itemCandidate(fullLive, {
			_id: fullLive._id,
			system: {
				advancement: { [ADV_HP._id]: ADV_HP },
				activities: { [ACT_UTILITY._id]: ACT_UTILITY }
			}
		})), true);
	});

	await check("loss guard counts Map-like live collections and still blocks emptying", () => {
		const live = {
			_id: "MapItem0000000001",
			_source: {
				system: {
					advancement: new Map([[ADV_HP._id, ADV_HP]]),
					activities: new Map([[ACT_UTILITY._id, ACT_UTILITY]])
				}
			}
		};
		const run = emptyRun();
		assert.equal(isCollectionLossSafeCandidate(run, itemCandidate(live, {
			_id: live._id,
			system: { advancement: {}, activities: {} }
		})), false);
		assert.equal(run.documentFailures[0].originalError.violations.length, 2);
	});

	await check("loss guard still blocks ForcedReplacement of an empty collection", () => {
		const live = {
			_id: "FrItem00000000001",
			_source: { system: { advancement: { [ADV_HP._id]: ADV_HP }, activities: {} } }
		};
		const run = emptyRun();
		assert.equal(isCollectionLossSafeCandidate(run, itemCandidate(live, {
			_id: live._id,
			system: { advancement: createForcedReplacement({}), activities: {} }
		})), false);
	});

	await check("defensive expansion replaces Actor item and effect ID strings", () => {
		const source = classItemSource("EmbedClass0000001");
		const actor = createActorWithEmbedded(source, { itemIdsAsStrings: true });
		const expanded = getExpandedMigrationSource(actor);
		assert.equal(typeof expanded.items[0], "object");
		assert.equal(expanded.items[0]._id, source._id);
		assertAdvancementPreserved(expanded.items[0], source);
		assert.equal(typeof expanded.effects[0], "object");
		assert.equal(expanded.effects[0]._id, actor.actorEffectSource._id);
		assert.equal(expanded.items[0].effects[0]._id, actor.effectSource._id);
	});

	await check("defensive expansion replaces Item-owned effect ID strings", () => {
		const source = classItemSource("EmbedClass0000002");
		const actor = createActorWithEmbedded(source, { effectIdsAsStrings: true });
		const expanded = getExpandedMigrationSource(actor);
		assert.equal(typeof expanded.items[0].effects[0], "object");
		assert.equal(expanded.items[0].effects[0]._id, actor.effectSource._id);
		assert.equal(expanded.items[0].effects[0].name, "Keep Effect");
	});

	await check("already-expanded embeds are left as objects", () => {
		const source = classItemSource("EmbedClass0000003");
		const actor = createActorWithEmbedded(source);
		const expanded = getExpandedMigrationSource(actor);
		assert.equal(typeof expanded.items[0], "object");
		assert.equal(expanded.items[0]._id, source._id);
		assert.equal(typeof expanded.items[0].effects[0], "object");
	});

	await check("unresolved embedded item ID fails closed", () => {
		const source = classItemSource("EmbedClass0000004");
		const actor = createActorWithEmbedded(source, { itemIdsAsStrings: true, missingItem: true });
		assert.throws(() => getExpandedMigrationSource(actor), err => {
			assert.ok(err instanceof MigrationUnexpandedEmbedError);
			assert.equal(err.embeddedName, "items");
			assert.equal(err.embedId, source._id);
			return true;
		});
	});

	await check("unresolved Item-owned effect ID fails closed", () => {
		const source = classItemSource("EmbedClass0000005");
		const actor = createActorWithEmbedded(source, { effectIdsAsStrings: true, missingEffect: true });
		assert.throws(() => getExpandedMigrationSource(actor), err => {
			assert.ok(err instanceof MigrationUnexpandedEmbedError);
			assert.equal(err.embeddedName, "effects");
			return true;
		});
	});

	console.log(`\n${passed} checks passed (migration advancement/activity preservation)`);
} finally {
	resetMigrationTestHarness();
}
