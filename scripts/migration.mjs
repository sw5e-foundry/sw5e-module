import {
	getModule,
	getModuleSettingValue,
	getModuleId,
	getModulePath,
	normalizeCompendiumReferences,
	normalizeCompendiumUuid,
	SETTINGS_NAMESPACE
} from "./module-support.mjs";
import {
	normalizeDnd5eItemSource,
	normalizeLegacyMasterActorSource,
	normalizeLegacyMasterItemSource
} from "./dnd5e-source-normalization.mjs";
import {
	normalizeLegacyStarshipActorSource,
	normalizeLegacyStarshipItemSource
} from "./starship-data.mjs";
import { normalizeAdvancementGrants } from "./proficiency-utils.mjs";

const MIGRATABLE_COMPENDIUM_DOCUMENTS = ["Actor", "Item", "Scene", "JournalEntry", "RollTable"];

/**
 * Checks if the world needs migrating.
 * @returns {boolean}      Wheter migration is needed or not.
 */
export const needsMigration = function() {
	// Determine whether a system migration is required and feasible
	if (!game.user.isGM) return false;
	const cv = getModuleSettingValue("moduleMigrationVersion", "");
	const totalDocuments = game.actors.size + game.scenes.size + game.items.size;
	const sw5eModule = getModule();
	if ( !sw5eModule ) return false;
	if (!cv && totalDocuments === 0) {
		if (sw5eModule.version !== "#{VERSION}#") game.settings.set(SETTINGS_NAMESPACE, "moduleMigrationVersion", sw5eModule.version);
		return false;
	}
	if (cv && !foundry.utils.isNewerVersion(sw5eModule.flags.needsMigrationVersion, cv)) return false;

	if (cv && foundry.utils.isNewerVersion(sw5eModule.flags.compatibleMigrationVersion, cv)) {
		ui.notifications.error("MIGRATION.sw5eVersionTooOldWarning", { localize: true, permanent: true });
	}

	return true;
};

/* -------------------------------------------- */

/**
 * Perform a system migration for the entire World, applying migrations for Actors, Items, and Compendium packs
 * @returns {Promise}      A Promise which resolves once the migration is completed
 */
export const migrateWorld = async function() {
	const version = getModule()?.version ?? game.system.version ?? "";
	ui.notifications.info(game.i18n.format("MIGRATION.sw5eBegin", {version}), {permanent: true});

	const migrationData = await getMigrationData();

	// Migrate World Actors
	const actors = game.actors.map(a => [a, true])
		.concat(Array.from(game.actors.invalidDocumentIds).map(id => [game.actors.getInvalid(id), false]));
	for ( const [actor, valid] of actors ) {
		try {
			const flags = { persistSourceMigration: false };
			const source = valid ? actor.toObject() : getInvalidDocumentSource(game.actors, actor.id, "actors");
			if ( !source ) continue;
			let updateData = migrateActorData(source, migrationData, flags, { actorUuid: actor.uuid });
			if ( !foundry.utils.isEmpty(updateData) ) {
				console.log(`Migrating Actor document ${actor.name}`);
				updateData = prepareMigratedSource(source, updateData, flags);
				await actor.update(updateData, getDocumentUpdateOptions({
					valid,
					persistSourceMigration: flags.persistSourceMigration
				}));
			}
		} catch(err) {
			err.message = `Failed sw5e module migration for Actor ${actor.name}: ${err.message}`;
			console.error(err);
		}
	}

	// Migrate World Items
	const items = game.items.map(i => [i, true])
		.concat(Array.from(game.items.invalidDocumentIds).map(id => [game.items.getInvalid(id), false]));
	for ( const [item, valid] of items ) {
		try {
			const flags = { persistSourceMigration: false };
			const source = valid ? item.toObject() : getInvalidDocumentSource(game.items, item.id, "items");
			if ( !source ) continue;
			let updateData = migrateItemData(source, migrationData, flags);
			if ( !foundry.utils.isEmpty(updateData) ) {
				console.log(`Migrating Item document ${item.name}`);
				updateData = prepareMigratedSource(source, updateData, flags);
				await item.update(updateData, getDocumentUpdateOptions({
					valid,
					persistSourceMigration: flags.persistSourceMigration
				}));
			}
		} catch(err) {
			err.message = `Failed sw5e module migration for Item ${item.name}: ${err.message}`;
			console.error(err);
		}
	}

	// Migrate World Macros
	for ( const m of game.macros ) {
		try {
			const updateData = migrateMacroData(m.toObject(), migrationData);
			if ( !foundry.utils.isEmpty(updateData) ) {
				console.log(`Migrating Macro document ${m.name}`);
				await m.update(updateData, {enforceTypes: false, render: false});
			}
		} catch(err) {
			err.message = `Failed sw5e module migration for Macro ${m.name}: ${err.message}`;
			console.error(err);
		}
	}

	// Migrate World Roll Tables
	for ( const table of game.tables ) {
		try {
			const updateData = migrateRollTableData(table.toObject(), migrationData);
			if ( !foundry.utils.isEmpty(updateData) ) {
				console.log(`Migrating RollTable document ${table.name}`);
				await table.update(updateData, { enforceTypes: false, render: false });
			}
		} catch(err) {
			err.message = `Failed sw5e module migration for RollTable ${table.name}: ${err.message}`;
			console.error(err);
		}
	}

	// Migrate Actor Override Tokens
	for ( const s of game.scenes ) {
		try {
			const updateData = migrateSceneData(s, migrationData);
			if ( !foundry.utils.isEmpty(updateData) ) {
				console.log(`Migrating Scene document ${s.name}`);
				await s.update(updateData, {enforceTypes: false, render: false});
			}
		} catch(err) {
			err.message = `Failed sw5e module migration for Scene ${s.name}: ${err.message}`;
			console.error(err);
		}

		// Migrate ActorDeltas individually in order to avoid issues with ActorDelta bulk updates.
		for ( const token of s.tokens ) {
			if ( token.actorLink || !token.actor ) continue;
			try {
				const flags = { persistSourceMigration: false };
				const source = token.actor.toObject();
				let updateData = migrateActorData(source, migrationData, flags, { actorUuid: token.actor.uuid });
				if ( !foundry.utils.isEmpty(updateData) ) {
					console.log(`Migrating ActorDelta document ${token.actor.name} [${token.delta.id}] in Scene ${s.name}`);
					if ( flags.persistSourceMigration ) {
						updateData = prepareMigratedSource(source, updateData, flags);
					} else {
						// Workaround for core issue of bulk updating ActorDelta collections.
						["items", "effects"].forEach(col => {
							for ( const [i, update] of (updateData[col] ?? []).entries() ) {
								const original = token.actor[col].get(update._id);
								updateData[col][i] = foundry.utils.mergeObject(original.toObject(), update, { inplace: false });
							}
						});
					}
					await token.actor.update(updateData, getDocumentUpdateOptions({
						valid: true,
						persistSourceMigration: flags.persistSourceMigration
					}));
				}
			} catch(err) {
				err.message = `Failed sw5e module migration for ActorDelta [${token.id}]: ${err.message}`;
				console.error(err);
			}
		}
	}

	// Migrate World Compendium Packs
	for ( let p of game.packs ) {
		if ( p.metadata.packageType !== "world" ) continue;
		if ( !MIGRATABLE_COMPENDIUM_DOCUMENTS.includes(p.documentName) ) continue;
		await migrateCompendium(p);
	}

	// Delete empty folders that existed prior to YAML migration
	for (const folder of game.folders) {
		if (
			[
				'Powers & Maneuvers',
				'Tools',
				'Weapons',
				'Customization Options'
			].includes(folder.name)
		) {
			// Check that they are empty
			if (
				folder.contents.length === 0 &&
				folder.children.length === 0
			) {
				await folder.delete();
			}
		}
	}

	// Set the migration as complete
	const moduleVersion = getModule()?.version ?? version;
	if (moduleVersion !== "#{VERSION}#") game.settings.set(SETTINGS_NAMESPACE, "moduleMigrationVersion", moduleVersion);
	ui.notifications.info(game.i18n.format("MIGRATION.sw5eComplete", { version }), { permanent: true });
};

/* -------------------------------------------- */

/**
 * Apply migration rules to all Documents within a single Compendium pack
 * @param {CompendiumCollection} pack  Pack to be migrated.
 * @returns {Promise}
 */
export const migrateCompendium = async function(pack) {
	const documentName = pack.documentName;
	if ( !MIGRATABLE_COMPENDIUM_DOCUMENTS.includes(documentName) ) return;

	const migrationData = await getMigrationData();

	// Unlock the pack for editing
	const wasLocked = pack.locked;
	await pack.configure({locked: false});

	// Begin by requesting server-side data model migration and get the migrated content
	await pack.migrate();
	const documents = await pack.getDocuments();

	// Iterate over compendium entries - applying fine-tuned migration functions
	for ( let doc of documents ) {
		let updateData = {};
		try {
			const flags = { persistSourceMigration: false };
			const source = doc.toObject();
			switch ( documentName ) {
				case "Actor":
					updateData = migrateActorData(source, migrationData, flags, { actorUuid: doc.uuid });
					break;
				case "Item":
					updateData = migrateItemData(source, migrationData, flags);
					break;
				case "Scene":
					updateData = migrateSceneData(source, migrationData, flags);
					break;
				case "JournalEntry":
					updateData = migrateJournalEntryData(source, migrationData);
					break;
				case "RollTable":
					updateData = migrateRollTableData(source, migrationData);
					break;
			}

			// Save the entry, if data was changed
			if ( foundry.utils.isEmpty(updateData) ) continue;
			updateData = prepareMigratedSource(source, updateData, flags);
			await doc.update(updateData, getDocumentUpdateOptions({
				valid: true,
				persistSourceMigration: flags.persistSourceMigration
			}));
			console.log(`Migrated ${documentName} document ${doc.name} in Compendium ${pack.collection}`);
		}

		// Handle migration failures
		catch(err) {
			err.message = `Failed sw5e module migration for document ${doc.name} in pack ${pack.collection}: ${err.message}`;
			console.error(err);
		}
	}

	// Apply the original locked status for the pack
	await pack.configure({locked: wasLocked});
	console.log(`Migrated all ${documentName} documents from Compendium ${pack.collection}`);
};

/* -------------------------------------------- */

function toDocumentArray(value) {
	if ( Array.isArray(value) ) return value;
	if ( !value || (typeof value !== "object") ) return [];
	return Array.isArray(value.contents) ? value.contents : [];
}

function getLegacyPayloadArrays(payload={}) {
	return {
		actors: toDocumentArray(payload.actors),
		items: toDocumentArray(payload.items),
		scenes: toDocumentArray(payload.scenes),
		macros: toDocumentArray(payload.macros),
		rollTables: toDocumentArray(payload.rollTables ?? payload.tables),
		journalEntries: toDocumentArray(payload.journalEntries ?? payload.journal ?? payload.journals)
	};
}

async function upsertWorldDocument(DocumentClass, source, { replaceExisting=true, dryRun=false }={}) {
	const sourceId = source?._id ?? null;
	const collection = DocumentClass?.metadata?.collection ? game[DocumentClass.metadata.collection] : null;
	const existing = sourceId && collection?.get?.(sourceId);

	if ( dryRun ) {
		if ( existing && replaceExisting ) return "updated";
		return "created";
	}

	if ( existing && replaceExisting ) {
		await existing.update(source, {
			enforceTypes: false,
			diff: false,
			recursive: false,
			render: false
		});
		return "updated";
	}

	await DocumentClass.create(source, { keepId: true, renderSheet: false });
	return "created";
}

async function upsertCompendiumDocument(pack, source, { replaceExisting=true, dryRun=false }={}) {
	const sourceId = source?._id ?? null;
	const hasExisting = sourceId && pack.index.has(sourceId);

	if ( dryRun ) {
		if ( hasExisting && replaceExisting ) return "updated";
		return "created";
	}

	if ( hasExisting && replaceExisting ) {
		const existing = await pack.getDocument(sourceId);
		await existing.update(source, {
			enforceTypes: false,
			diff: false,
			recursive: false
		});
		return "updated";
	}

	const DocumentClass = getDocumentClass(pack.documentName);
	await DocumentClass.create(source, { pack: pack.collection, keepId: true, renderSheet: false });
	return "created";
}

function prepareMigratedSource(source, updateData, { persistSourceMigration=false }={}) {
	if ( persistSourceMigration ) return foundry.utils.deepClone(updateData);
	return applyUpdateToClone(source, updateData);
}

function getDocumentUpdateOptions({ valid=true, persistSourceMigration=false }={}) {
	if ( persistSourceMigration ) {
		return {
			enforceTypes: false,
			diff: false,
			recursive: false,
			render: false
		};
	}

	return {
		enforceTypes: false,
		diff: valid,
		render: false
	};
}

function convertSourceByType(documentName, source, migrationData, options={}) {
	const flags = { persistSourceMigration: false };
	let updateData = {};
	switch ( documentName ) {
		case "Actor":
			updateData = migrateActorData(source, migrationData, flags, { actorUuid: options.actorUuid });
			break;
		case "Item":
			updateData = migrateItemData(source, migrationData, flags);
			break;
		case "Scene":
			updateData = migrateSceneData(source, migrationData);
			break;
		case "Macro":
			updateData = migrateMacroData(source, migrationData);
			break;
		case "RollTable":
			updateData = migrateRollTableData(source, migrationData);
			break;
		case "JournalEntry":
			updateData = migrateJournalEntryData(source, migrationData);
			break;
		default:
			return { source, changed: false, flags };
	}

	if ( foundry.utils.isEmpty(updateData) ) return { source, changed: false, flags };
	return {
		source: prepareMigratedSource(source, updateData, flags),
		changed: true,
		flags
	};
}

function getTokenActorDeltaSource(tokenData) {
	if ( tokenData?.delta && (typeof tokenData.delta === "object") ) return foundry.utils.deepClone(tokenData.delta);
	if ( tokenData?.actorData && (typeof tokenData.actorData === "object") ) return foundry.utils.deepClone(tokenData.actorData);
	return null;
}

function setTokenActorDeltaUpdate(tokenData, update, deltaSource, actorFlags) {
	if ( foundry.utils.isEmpty(update) ) return update;
	const prepared = prepareMigratedSource(deltaSource, update, actorFlags);
	if ( tokenData?.delta && (typeof tokenData.delta === "object") ) return { delta: prepared };
	if ( tokenData?.actorData && (typeof tokenData.actorData === "object") ) return { actorData: prepared };
	return {};
}

/**
 * Convert a legacy SW5E world payload and import it into the current world.
 * @param {object} payload                                     Parsed legacy world data payload.
 * @param {object} [options]
 * @param {boolean} [options.replaceExisting=true]             Replace matching _id documents instead of always creating.
 * @param {boolean} [options.includeCompendia=false]           Import world compendia present in payload.compendia.
 * @param {boolean} [options.dryRun=false]                     Run conversion analysis without creating/updating documents.
 * @returns {Promise<object>}                                  Conversion report.
 */
export async function convertLegacyWorldPayload(payload, {
	replaceExisting=true,
	includeCompendia=false,
	dryRun=false
}={}) {
	if ( !game.user?.isGM ) throw new Error("Only a GM can run world conversion.");
	if ( game.system?.id !== "dnd5e" ) throw new Error("Open a dnd5e world before running SW5E world conversion.");
	if ( !payload || (typeof payload !== "object") ) throw new Error("Conversion payload must be a JSON object.");

	const migrationData = await getMigrationData();
	const report = {
		created: 0,
		updated: 0,
		skipped: 0,
		errors: [],
		warnings: [],
		processed: {
			Actor: 0,
			Item: 0,
			Scene: 0,
			Macro: 0,
			RollTable: 0,
			JournalEntry: 0,
			Compendium: 0
		}
	};

	const payloadArrays = getLegacyPayloadArrays(payload);
	const worldCollections = [
		{ name: "Actor", docs: payloadArrays.actors, cls: CONFIG.Actor.documentClass },
		{ name: "Item", docs: payloadArrays.items, cls: CONFIG.Item.documentClass },
		{ name: "Scene", docs: payloadArrays.scenes, cls: CONFIG.Scene.documentClass },
		{ name: "Macro", docs: payloadArrays.macros, cls: CONFIG.Macro.documentClass },
		{ name: "RollTable", docs: payloadArrays.rollTables, cls: CONFIG.RollTable.documentClass },
		{ name: "JournalEntry", docs: payloadArrays.journalEntries, cls: CONFIG.JournalEntry.documentClass }
	];

	for ( const { name, docs, cls } of worldCollections ) {
		for ( const document of docs ) {
			try {
				const source = foundry.utils.deepClone(document);
				const converted = convertSourceByType(name, source, migrationData);
				report.processed[name] += 1;
				if ( !converted.changed && !replaceExisting ) {
					report.skipped += 1;
					continue;
				}
				const result = await upsertWorldDocument(cls, converted.source, { replaceExisting, dryRun });
				if ( result === "created" ) report.created += 1;
				else if ( result === "updated" ) report.updated += 1;
			} catch ( err ) {
				report.errors.push(`[${name}] ${document?.name ?? document?._id ?? "unknown"}: ${err.message}`);
			}
		}
	}

	if ( includeCompendia ) {
		const compendia = Array.isArray(payload.compendia) ? payload.compendia : [];
		for ( const entry of compendia ) {
			const collectionId = entry?.collection ?? null;
			if ( !collectionId ) {
				report.warnings.push("Skipped a compendium entry without collection id.");
				continue;
			}
			const pack = game.packs.get(collectionId);
			if ( !pack ) {
				report.warnings.push(`Compendium ${collectionId} is not present in this world; skipped.`);
				continue;
			}
			if ( !MIGRATABLE_COMPENDIUM_DOCUMENTS.includes(pack.documentName) ) {
				report.warnings.push(`Compendium ${collectionId} (${pack.documentName}) is not supported for import; skipped.`);
				continue;
			}

			const docs = toDocumentArray(entry.documents ?? entry.contents);
			if ( !docs.length ) continue;

			const wasLocked = pack.locked;
			if ( !dryRun ) await pack.configure({ locked: false });
			try {
				for ( const doc of docs ) {
					try {
						const source = foundry.utils.deepClone(doc);
						const converted = convertSourceByType(pack.documentName, source, migrationData);
						report.processed.Compendium += 1;
						const result = await upsertCompendiumDocument(pack, converted.source, { replaceExisting, dryRun });
						if ( result === "created" ) report.created += 1;
						else if ( result === "updated" ) report.updated += 1;
					} catch ( err ) {
						report.errors.push(`[Compendium:${collectionId}] ${doc?.name ?? doc?._id ?? "unknown"}: ${err.message}`);
					}
				}
			} finally {
				if ( !dryRun ) await pack.configure({ locked: wasLocked });
			}
		}
	}

	return report;
}

/* -------------------------------------------- */

/**
 * Migrate any active effects attached to the provided parent.
 * @param {object} parent           Data of the parent being migrated.
 * @param {object} [migrationData]  Additional data to perform the migration.
 * @returns {object[]}              Updates to apply on the embedded effects.
 */
export const migrateEffects = function(parent, migrationData) {
	if (!parent.effects) return {};
	return parent.effects.reduce((arr, e) => {
		const effectData = e instanceof CONFIG.ActiveEffect.documentClass ? e.toObject() : e;
		let effectUpdate = migrateEffectData(effectData, migrationData, { parent });
		if (!foundry.utils.isEmpty(effectUpdate)) {
			effectUpdate._id = effectData._id;
			arr.push(foundry.utils.expandObject(effectUpdate));
		}
		return arr;
	}, []);
};

/* -------------------------------------------- */
/*  Document Type Migration Helpers             */
/* -------------------------------------------- */

/**
 * Migrate a single Actor document to incorporate latest data model changes
 * Return an Object of updateData to be applied
 * @param {object} actor                The actor data object to update
 * @param {object} [migrationData]      Additional data to perform the migration
 * @param {object} [flags={}]           Track the needs migration flag.
 * @param {object} [options]
 * @param {string} [options.actorUuid]  The UUID of the actor.
 * @returns {object}                    The updateData to apply
 */
export const migrateActorData = function(actor, migrationData, flags={}, { actorUuid }={}) {
	const updateData = {};
	const normalizedActor = foundry.utils.deepClone(actor);
	const normalizedLegacyMasterActor = normalizeLegacyMasterActorSource(normalizedActor);
	const normalizedLegacyStarshipActor = normalizeLegacyStarshipActorSource(normalizedActor);
	const migratedActor = applyDocumentMigration(CONFIG.Actor.documentClass, normalizedActor);
	const workingActor = migratedActor.source;
	let requiresFullSourceMigration = normalizedLegacyMasterActor
		|| normalizedLegacyStarshipActor
		|| migratedActor.changed
		|| normalizeLegacyMasterActorSource(workingActor)
		|| normalizeLegacyStarshipActorSource(workingActor);

	_migrateImage(workingActor, updateData);
	_migrateObjectFlags(workingActor, updateData);

	// Migrate embedded effects
	if ( workingActor.effects ) {
		const effects = migrateEffects(workingActor, migrationData);
		if ( effects.length > 0 ) {
			updateData.effects = effects;
			applyEmbeddedUpdates(workingActor.effects, effects);
		}
	}
	applyUpdateData(workingActor, updateData);

	// Migrate Owned Items
	if ( !workingActor.items ) {
		if ( requiresFullSourceMigration ) {
			flags.persistSourceMigration = true;
			return workingActor;
		}
		return updateData;
	}

	const items = workingActor.items.reduce((arr, i) => {
		// Migrate the Owned Item
		const itemData = i instanceof CONFIG.Item.documentClass ? i.toObject() : i;
		const itemFlags = { persistSourceMigration: false };
		let itemUpdate = migrateItemData(itemData, migrationData, itemFlags);
		applyUpdateData(itemData, itemUpdate);

		// Update the Owned Item
		if ( itemFlags.persistSourceMigration ) requiresFullSourceMigration = true;
		if ( !foundry.utils.isEmpty(itemUpdate) && !requiresFullSourceMigration ) {
			arr.push({ ...itemUpdate, _id: itemData._id });
		}

		return arr;
	}, []);
	if ( requiresFullSourceMigration ) {
		flags.persistSourceMigration = true;
		return workingActor;
	}

	if ( items.length > 0 ) updateData.items = items;

	return updateData;
};

/* -------------------------------------------- */

/**
 * Migrate a single Item document to incorporate latest data model changes
 *
 * @param {object} item             Item data to migrate
 * @param {object} [migrationData]  Additional data to perform the migration
 * @param {object} [flags={}]       Track the needs migration flag.
 * @returns {object}                The updateData to apply
 */
export function migrateItemData(item, migrationData, flags={}) {
	const normalizedItem = foundry.utils.deepClone(item);
	const normalizedLegacyMasterItem = normalizeLegacyMasterItemSource(normalizedItem);
	const normalizedDnd5eItem = normalizeDnd5eItemSource(normalizedItem);
	const normalizedLegacyStarshipItem = normalizeLegacyStarshipItemSource(normalizedItem);
	const migratedItem = applyDocumentMigration(CONFIG.Item.documentClass, normalizedItem);
	const workingItem = migratedItem.source;
	const updateData = {};
	const requiresFullSourceMigration = normalizedLegacyMasterItem
		|| normalizedDnd5eItem
		|| normalizedLegacyStarshipItem
		|| migratedItem.changed
		|| normalizeLegacyMasterItemSource(workingItem)
		|| normalizeLegacyStarshipItemSource(workingItem);
	if ( requiresFullSourceMigration ) flags.persistSourceMigration = true;

	_migrateImage(workingItem, updateData);
	_migrateDescriptionLinks(workingItem, updateData);
	_migrateObjectFlags(workingItem, updateData);
	_migrateItemProperties(workingItem, updateData);
	_migrateSpellScaling(workingItem, updateData);
	_migrateAdvancements(workingItem, updateData);
	_migrateWeaponData(workingItem, updateData);
	_migrateBlasterAmmoData(workingItem, updateData);

	// Migrate embedded effects
	if ( workingItem.effects ) {
		const effects = migrateEffects(workingItem, migrationData);
		if ( effects.length > 0 ) {
			updateData.effects = effects;
			applyEmbeddedUpdates(workingItem.effects, effects);
		}
	}

	if ( requiresFullSourceMigration ) {
		applyUpdateData(workingItem, updateData);
		return workingItem;
	}

	return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate the provided active effect data.
 * @param {object} effect            Effect data to migrate.
 * @param {object} [migrationData]   Additional data to perform the migration.
 * @param {object} [options]         Additional options.
 * @param {object} [options.parent]  Parent of this effect.
 * @returns {object}                 The updateData to apply.
 */
export const migrateEffectData = function(effect, migrationData, { parent }={}) {
	const updateData = {};
	_migrateImage(effect, updateData);
	_cleanEffect(effect, updateData, parent);
	return updateData;
};

/* -------------------------------------------- */

/**
 * Migrate a single Macro document to incorporate latest data model changes.
 * @param {object} macro            Macro data to migrate
 * @param {object} [migrationData]  Additional data to perform the migration
 * @returns {object}                The updateData to apply
 */
export const migrateMacroData = function(macro, migrationData) {
	const updateData = {};
	_migrateImage(macro, updateData);
	_migrateObjectFlags(macro, updateData);
	if ( typeof macro.command === "string" ) {
		const normalized = normalizeLegacyContentString(macro.command);
		if ( normalized !== macro.command ) updateData.command = normalized;
	}
	if ( macro.flags ) {
		const normalizedFlags = normalizeCompendiumReferences(foundry.utils.deepClone(macro.flags), { moduleId: getModuleId() });
		if ( !foundry.utils.deepEqual(normalizedFlags, macro.flags) ) updateData.flags = normalizedFlags;
	}
	return updateData;
};

/* -------------------------------------------- */

/**
 * Migrate a single RollTable document to incorporate the latest data model changes.
 * @param {object} table            Roll table data to migrate.
 * @param {object} [migrationData]  Additional data to perform the migration.
 * @returns {object}                The update delta to apply.
 */
export function migrateRollTableData(table, migrationData) {
	const updateData = {};
	_migrateImage(table, updateData);
	_migrateObjectFlags(table, updateData);

	if ( Array.isArray(table.results) ) {
		const results = table.results.reduce((arr, result) => {
			const resultData = result instanceof foundry.abstract.DataModel ? result.toObject() : foundry.utils.deepClone(result);
			const resultUpdate = {};
			_migrateImage(resultData, resultUpdate);
			_migrateObjectFlags(resultData, resultUpdate);

			if ( typeof resultData.text === "string" ) {
				const normalizedText = normalizeLegacyContentString(resultData.text);
				if ( normalizedText !== resultData.text ) resultUpdate.text = normalizedText;
			}

			const normalizedCollection = normalizeLegacyDocumentCollection(resultData.documentCollection);
			if ( normalizedCollection !== resultData.documentCollection ) {
				resultUpdate.documentCollection = normalizedCollection;
			}

			if ( typeof resultData.collection === "string" ) {
				const normalizedCompendium = normalizeCompendiumUuid(resultData.collection, { moduleId: getModuleId() });
				if ( normalizedCompendium !== resultData.collection ) resultUpdate.collection = normalizedCompendium;
			}

			if ( !foundry.utils.isEmpty(resultUpdate) ) {
				resultUpdate._id = resultData._id;
				arr.push(resultUpdate);
			}
			return arr;
		}, []);
		if ( results.length ) updateData.results = results;
	}
	return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate a single JournalEntry document to incorporate latest data model changes.
 * @param {object} journal          JournalEntry data to migrate.
 * @param {object} [migrationData]  Additional data to perform the migration.
 * @returns {object}                The updateData to apply.
 */
export function migrateJournalEntryData(journal, migrationData) {
	const updateData = {};
	_migrateImage(journal, updateData);
	_migrateObjectFlags(journal, updateData);

	if ( Array.isArray(journal.pages) ) {
		const pages = journal.pages.reduce((arr, page) => {
			const pageData = page instanceof foundry.abstract.DataModel ? page.toObject() : foundry.utils.deepClone(page);
			const pageUpdate = {};
			_migrateImage(pageData, pageUpdate);
			_migrateObjectFlags(pageData, pageUpdate);

			if ( typeof pageData.text?.content === "string" ) {
				const normalizedContent = normalizeLegacyContentString(pageData.text.content);
				if ( normalizedContent !== pageData.text.content ) pageUpdate["text.content"] = normalizedContent;
			}

			if ( !foundry.utils.isEmpty(pageUpdate) ) {
				pageUpdate._id = pageData._id;
				arr.push(pageUpdate);
			}
			return arr;
		}, []);
		if ( pages.length ) updateData.pages = pages;
	}

	return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate a single Scene document to incorporate changes to the data model of its actor data overrides
 * Return an Object of updateData to be applied
 * @param {object} scene            The Scene data to Update
 * @param {object} [migrationData]  Additional data to perform the migration
 * @returns {object}                The updateData to apply
 */
export const migrateSceneData = function(scene, migrationData) {
	const tokens = scene.tokens.reduce((arr, token) => {
		const t = token instanceof foundry.abstract.DataModel ? token.toObject() : token;
		const update = {};
		_migrateImage(t, update);
		_migrateObjectFlags(t, update);
		if ( !game.actors.has(t.actorId) ) update.actorId = null;
		const deltaSource = (!t.actorLink && t.actorId) ? getTokenActorDeltaSource(t) : null;
		if ( deltaSource ) {
			const actorFlags = { persistSourceMigration: false };
			const actorUpdate = migrateActorData(deltaSource, migrationData, actorFlags, {});
			Object.assign(update, setTokenActorDeltaUpdate(t, actorUpdate, deltaSource, actorFlags));
		}
		if ( !foundry.utils.isEmpty(update) ) arr.push({ ...update, _id: t._id });
		return arr;
	}, []);
	if ( tokens.length ) return { tokens };
	return {};
};

/* -------------------------------------------- */

/**
 * Fetch bundled data for large-scale migrations.
 * @returns {Promise<object>}  Object mapping original system icons to their core replacements.
 */
export const getMigrationData = async function() {
	const data = {};
	try {
	} catch(err) {
		console.warn(`Failed to retrieve migration data: ${err.message}`);
	}
	return data;
};

function normalizeLegacyContentString(content) {
	if ( typeof content !== "string" ) return content;
	const moduleId = getModuleId();
	let normalized = normalizeCompendiumReferences(content, { moduleId });
	normalized = normalized.replace(/systems\/sw5e\/packs\/Icons/g, getModulePath("icons/packs"));
	normalized = normalized.replace(/modules\/sw5e\/icons\/packs/g, getModulePath("icons/packs"));
	normalized = normalized.replace(/modules\/sw5e-module-test\/icons\/packs/g, getModulePath("icons/packs"));
	return normalized;
}

function normalizeLegacyDocumentCollection(collection) {
	if ( typeof collection !== "string" ) return collection;
	if ( collection.startsWith("Compendium.") ) return normalizeCompendiumUuid(collection, { moduleId: getModuleId() });
	if ( /^(sw5e|sw5e-module-test)\./.test(collection) ) {
		return collection.replace(/^(sw5e|sw5e-module-test)\./, `${getModuleId()}.`);
	}
	return collection;
}

function getInvalidDocumentSource(collection, id, legacyKey) {
	const invalid = collection.getInvalid?.(id);
	const source = invalid?._source ? foundry.utils.deepClone(invalid._source) : invalid?.toObject?.();
	if ( source ) return source;
	const legacy = game.data?.[legacyKey]?.find?.(doc => doc._id === id);
	return legacy ? foundry.utils.deepClone(legacy) : null;
}

function applyUpdateData(target, updateData) {
	if ( foundry.utils.isEmpty(updateData) ) return;
	foundry.utils.mergeObject(target, foundry.utils.expandObject(updateData), { inplace: true });
}

function applyUpdateToClone(source, updateData) {
	const clone = foundry.utils.deepClone(source);
	applyUpdateData(clone, updateData);
	return clone;
}

function applyEmbeddedUpdates(collection, updates=[]) {
	if ( !Array.isArray(collection) || !updates.length ) return;
	const updatesById = new Map(updates.map(update => [update._id, update]));
	for ( const entry of collection ) {
		const update = updatesById.get(entry._id);
		if ( update ) applyUpdateData(entry, update);
	}
}

function sourcesDiffer(left, right) {
	return JSON.stringify(left) !== JSON.stringify(right);
}

function applyDocumentMigration(DocumentClass, source) {
	const workingSource = foundry.utils.deepClone(source);
	if ( typeof DocumentClass?.migrateData !== "function" ) return { source: workingSource, changed: false };

	const migrated = DocumentClass.migrateData(workingSource);
	const migratedSource = (migrated && (typeof migrated === "object")) ? migrated : workingSource;
	return {
		source: migratedSource,
		changed: sourcesDiffer(source, migratedSource)
	};
}

function mergePersistedMigrationSource(source, updateData) {
	return foundry.utils.mergeObject(source, updateData, { inplace: false });
}

/* -------------------------------------------- */
/*  Low level migration utilities
/* -------------------------------------------- */

/**
 * Migrate any module images from system or old module path to new one.
 * @param {object} objectData      Object data to migrate.
 * @param {object} updateData      Existing update to expand upon.
 * @returns {object}               The updateData to apply
 * @private
 */
function _migrateImage(objectData, updateData) {
	const actorTypesWithBlankAvatarFallback = new Set(["character", "npc", "starship", "vehicle"]);
	const isActorAvatarTarget = actorTypesWithBlankAvatarFallback.has(objectData?.type);
	const isLegacyDndIcon = path => /^systems\/dnd5e\/icons\/.+$/.test(path ?? "");
	const isLootBagFallback = path => path === "icons/svg/item-bag.svg";
	const normalizeModuleImagePath = path => path
		?.replace(/^modules\/sw5e\//, `${getModulePath()}/`)
		?.replace(/^modules\/sw5e-module-test\//, `${getModulePath()}/`)
		?.replace("systems/sw5e/packs/Icons", getModulePath("icons/packs"))
		?.replace("modules/sw5e/icons/", `${getModulePath("icons")}/`)
		?.replace("modules/sw5e-module-test/icons/", `${getModulePath("icons")}/`);
	const getMonsterTokenPathFromAvatar = path => /^modules\/sw5e-module\/icons\/packs\/monsters\/.+\/Avatar\.webp$/i.test(path ?? "")
		? path.replace(/\/Avatar\.webp$/i, "/Token.webp")
		: "";
	const isKnownBrokenExternalImage = path => /^https?:\/\/(?:static\.wikia\.nocookie\.net|cdn[ab]\.artstation\.com)\//.test(path ?? "");
	const isInvalidImageValue = path => {
		if ( typeof path !== "string" ) return false;
		const normalized = path.trim().toLowerCase();
		return ["", "undefined", "null", "nan"].includes(normalized)
			|| normalized.startsWith("tokenizer/")
			|| isKnownBrokenExternalImage(normalized);
	};
	const props = ["img", "texture.src", "prototypeToken.texture.src"];
	// ActiveEffect5e#icon is deprecated since Foundry v12 (migrated to img); avoid accessing it.
	const isEffect = objectData?.documentName === "ActiveEffect" || (objectData?.changes && Array.isArray(objectData.changes));
	if ( !isEffect ) props.push("icon");
	for (const prop of props) {
		const path = foundry.utils.getProperty(objectData, prop);
		if ( isInvalidImageValue(path) ) {
			updateData[prop] = "";
			console.log("Cleared invalid image path", objectData.name, "prop", prop, "old", path);
			continue;
		}

		let newPath = normalizeModuleImagePath(path);
		if ( prop === "prototypeToken.texture.src" ) {
			const actorAvatar = normalizeModuleImagePath(foundry.utils.getProperty(objectData, "img"));
			const canonicalMonsterToken = getMonsterTokenPathFromAvatar(actorAvatar);
			if ( canonicalMonsterToken && (newPath === actorAvatar) ) newPath = canonicalMonsterToken;
		}
		if ( isActorAvatarTarget && (prop !== "icon") && (isLegacyDndIcon(newPath) || isLootBagFallback(newPath)) ) {
			newPath = "";
		} else {
			newPath = newPath?.replace(/^systems\/dnd5e\/icons\/.+$/, "icons/svg/item-bag.svg");
		}
		if (newPath !== path) {
			updateData[prop] = newPath;
			console.log("Changed image path", objectData.name, "prop", prop, "old", path, "new", newPath);
		}
	}
	return updateData;
}

/**
 * Migrate flags from the sw5e test module.
 * @param {object} objectData      Object data to migrate.
 * @param {object} updateData      Existing update to expand upon.
 * @returns {object}               The updateData to apply
 * @private
 */
function _migrateObjectFlags(objectData, updateData) {
	if (objectData.flags?.["sw5e-module-test"]) {
		updateData["flags.sw5e"] = objectData.flags["sw5e-module-test"];
		updateData["flags.-=sw5e-module-test"] = null;
	}

	return updateData;
}

/**
 * Remove any old effects that have been suplanted by advancements.
 * @param {object} effectData      Effect data to migrate.
 * @param {object} updateData      Existing update to expand upon.
 * @returns {object}               The updateData to apply
 * @private
 */
function _cleanEffect(effect, updateData, parent) {
	const hasAdvancements = parent?.system?.advancement !== undefined || parent?.advancement !== undefined;
	if (!hasAdvancements) return updateData;

	const key_blacklist = [
		"system.details.background",
		"system.details.species",
		"system.traits.languages.value",
		"system.traits.toolProf.value",
	];
	const key_blacklist_re = [
		/system\.tools\.\w+\.prof/,
	];
	function blacklisted(key) {
		if (key_blacklist.includes(key)) return true;
		for (const re of key_blacklist_re) if (re.test(key)) return true;
		return false;
	}

	const newChanges = effect.changes.filter(change => !blacklisted(change.key));
	if (newChanges.length !== effect.changes.length) updateData["changes"] = newChanges;
	return updateData;
}

function _migrateDescriptionLinks(itemData, updateData) {
	const moduleId = getModuleId();
	for ( const prop of ["system.description.value", "system.description.chat"] ) {
		const text = foundry.utils.getProperty(itemData, prop);
		if ( typeof text !== "string" ) continue;
		let normalized = normalizeCompendiumReferences(text, { moduleId });
		normalized = normalized.replace(/systems\/sw5e\/packs\/Icons/g, getModulePath("icons/packs"));
		normalized = normalized.replace(/modules\/sw5e\/icons\/packs/g, getModulePath("icons/packs"));
		normalized = normalized.replace(/modules\/sw5e-module-test\/icons\/packs/g, getModulePath("icons/packs"));
		if ( normalized !== text ) updateData[prop] = normalized;
	}

	return updateData;
}

function _normalizeAdvancementLink(item, field, moduleId) {
	if ( typeof item === "string" ) {
		if ( field === "grants" ) {
			const normalizedGrant = normalizeAdvancementGrants([item]);
			return normalizedGrant.changed
				? { item: normalizedGrant.grants[0], changed: true }
				: { item, changed: false };
		}
		if ( item === "languages:standard:basic" ) return { item: "languages:standard:common", changed: true };
		const normalizedUuid = normalizeCompendiumUuid(item, { moduleId });
		if ( field === "pool" && normalizedUuid.startsWith("Compendium.") ) {
			return { item: { uuid: normalizedUuid }, changed: true };
		}
		if ( field === "items" && normalizedUuid.startsWith("Compendium.") ) {
			return { item: { uuid: normalizedUuid, optional: false }, changed: true };
		}
		return { item: normalizedUuid, changed: normalizedUuid !== item };
	}

	if ( !item || (typeof item !== "object") ) return { item, changed: false };

	let changed = false;
	if ( item.uuid ) {
		const normalizedUuid = normalizeCompendiumUuid(item.uuid, { moduleId });
		if ( normalizedUuid !== item.uuid ) {
			item.uuid = normalizedUuid;
			changed = true;
		}
	}
	if ( (field === "items") && (item.uuid?.startsWith("Compendium.")) && (item.optional === undefined) ) {
		item.optional = false;
		changed = true;
	}
	return { item, changed };
}

function _normalizeItemChoiceValue(value, moduleId) {
	if ( !value || (typeof value !== "object") ) return { value, changed: false };
	let changed = false;

	if ( value.added && (typeof value.added === "object") ) {
		for ( const added of Object.values(value.added) ) {
			if ( !added || (typeof added !== "object") ) continue;
			for ( const [key, uuid] of Object.entries(added) ) {
				if ( typeof uuid !== "string" ) continue;
				const normalizedUuid = normalizeCompendiumUuid(uuid, { moduleId });
				if ( normalizedUuid !== uuid ) {
					added[key] = normalizedUuid;
					changed = true;
				}
			}
		}
	}

	if ( value.replaced && (typeof value.replaced === "object") ) {
		for ( const replaced of Object.values(value.replaced) ) {
			if ( !replaced || (typeof replaced !== "object") ) continue;
			if ( typeof replaced.replacement === "string" ) {
				const normalizedUuid = normalizeCompendiumUuid(replaced.replacement, { moduleId });
				if ( normalizedUuid !== replaced.replacement ) {
					replaced.replacement = normalizedUuid;
					changed = true;
				}
			}
		}
	}

	return { value, changed };
}

function _normalizeSubclassValue(value, moduleId) {
	if ( !value || (typeof value !== "object") ) return { value: {}, changed: true };

	if ( value.document || value.uuid ) {
		const normalizedValue = { ...value };
		let changed = false;
		if ( typeof normalizedValue.uuid === "string" ) {
			const normalizedUuid = normalizeCompendiumUuid(normalizedValue.uuid, { moduleId });
			if ( normalizedUuid !== normalizedValue.uuid ) {
				normalizedValue.uuid = normalizedUuid;
				changed = true;
			}
		}
		return { value: normalizedValue, changed };
	}

	for ( const added of Object.values(value.added ?? {}) ) {
		if ( !added || (typeof added !== "object") ) continue;
		const [document, uuid] = Object.entries(added)[0] ?? [];
		if ( !document ) continue;
		return {
			value: {
				document,
				...(typeof uuid === "string" ? { uuid: normalizeCompendiumUuid(uuid, { moduleId }) } : {})
			},
			changed: true
		};
	}

	return { value: {}, changed: Object.keys(value).length > 0 };
}

/**
 * Migrate properties from the old sw5e system.
 * @param {object} itemData        Item data to migrate.
 * @param {object} updateData      Existing update to expand upon.
 * @returns {object}               The updateData to apply
 * @private
 */
function _migrateItemProperties(itemData, updateData) {
	const propertyChanges = {
		"weapon": {
			aut: "auto",
			bur: "burst",
			dir: "dire",
			heavy: "hvy",
			hid: "hidden",
			ken: "keen",
			pic: "piercing",
			ran: "range",
			rap: "rapid",
			reload: "rel",
			smr: "smart",
			spc: "special",
			vic: "vicious",

			bit: "biting",
			bri: "bright",
			bru: "brutal",
			cor: "corruption",
			def: "defensive",
			dex: "dexRq",
			drm: "disarming",
			dsg: "disguised",
			dis: "disintegrate",
			dpt: "disruptive",
			dou: "double",
			finesse: "fin",
			fix: "fixed",
			ilk: "interlockingWeapon",
			light: "lgt",
			lum: "luminous",
			mig: "mighty",
			mod: "modal",
			neu: "neuralizing",
			pen: "penetrating",
			pcl: "powerCell",
			reach: "rch",
			rck: "reckless",
			returning: "ret",
			shk: "shocking",
			sil: "silentWeapon",
			slg: "slug",
			son: "sonorous",
			spz: "specialized",
			str: "strRq",
			swi: "switch",
			thrown: "thr",
			twoHanded: "two",
			versatileWeapon: "ver",

			con: "conRq",
			exp: "explosive",
			hom: "homing",
			ion: "ionizing",
			mlt: "melt",
			ovr: "overheat",
			pow: "power",
			sat: "saturate",
			zon: "zone",
		},
		"equipment": {
			Absorptive: "absorptive",
			Agile: "agile",
			Anchor: "anchor",
			Avoidant: "avoidant",
			Barbed: "barbed",
			Bulky: "bulky",
			Charging: "charging",
			Concealing: "concealing",
			Cumbersome: "cumbersome",
			Gauntleted: "gauntleted",
			Imbalanced: "imbalanced",
			Impermeable: "impermeable",
			Insulated: "insulated",
			Interlocking: "interlockingEquipment",
			Lambent: "lambent",
			Lightweight: "lightweight",
			Magnetic: "magnetic",
			Obscured: "obscured",
			Obtrusive: "obtrusive",
			Powered: "powered",
			Reactive: "reactive",
			Regulated: "regulated",
			Reinforced: "reinforced",
			Responsive: "responsive",
			Rigid: "rigid",
			Silent: "silentEquipment",
			Spiked: "spiked",
			Strength: "strength",
			Steadfast: "steadfast",
			Versatile: "versatileEquipment",

			c_Absorbing: "absorbing",
			c_Acessing: "acessing",
			c_Amplifying: "amplifying",
			c_Bolstering: "bolstering",
			c_Constitution: "constitution",
			c_Dispelling: "dispelling",
			c_Elongating: "elongating",
			c_Enlarging: "enlarging",
			c_Expanding: "expanding",
			c_Extending: "extending",
			c_Fading: "fading",
			c_Focused: "focused",
			c_Increasing: "increasing",
			c_Inflating: "inflating",
			c_Mitigating: "mitigating",
			c_Ranging: "ranging",
			c_Rending: "rending",
			c_Repelling: "repelling",
			c_Storing: "storing",
			c_Surging: "surging",
			c_Withering: "withering",
		},
	};

	if ( itemData.system?._propertyValues ) {
		Object.entries(itemData.system._propertyValues).forEach(([k,v]) => {
			if (typeof v === "boolean") return;
			if ((itemData.type in propertyChanges) && (k in propertyChanges[itemData.type])) k = propertyChanges[itemData.type][k];
			updateData[`flags.sw5e.properties${k}`] = v;
		});
		updateData["system.-=_propertyValues"] = null;
	}

	if ( itemData.system?.properties && (itemData.type in propertyChanges) ) {
		let changed = false;
		const properties = itemData.system.properties instanceof Set
			? Array.from(itemData.system.properties)
			: itemData.system.properties;
		const newProperties = properties.map(k => {
			if (k in propertyChanges[itemData.type]) {
				changed = true;
				return propertyChanges[itemData.type][k];
			}
			return k;
		});
		if (changed) updateData["system.properties"] = newProperties;
	}

	return updateData;
}

/**
 * Migrate spell data from the old sw5e system.
 * @param {object} itemData        Item data to migrate.
 * @param {object} updateData      Existing update to expand upon.
 * @returns {object}               The updateData to apply
 * @private
 */
function _migrateSpellScaling(itemData, updateData) {
	if (itemData.type !== "spell") return updateData;

	if (itemData.system.scaling === "power") updateData["system.scaling"] = "spell";

	return updateData;
}

/**
 * Migrate advancement data from the sw5e test module or the old system.
 * @param {object} itemData        Item data to migrate.
 * @param {object} updateData      Existing update to expand upon.
 * @returns {object}               The updateData to apply
 * @private
 */
function _migrateAdvancements(itemData, updateData) {
	if (itemData.system.advancement === undefined) return updateData;

	let changed = false;
	const moduleId = getModuleId();
	for (const adv of itemData.system.advancement) {
		for (const field of ["pool", "items", "grants"]) {
			if ( !adv?.configuration?.[field] ) continue;
			if ( field === "grants" ) {
				const normalizedGrants = normalizeAdvancementGrants(adv.configuration.grants);
				if ( normalizedGrants.changed ) {
					adv.configuration.grants = normalizedGrants.grants;
					changed = true;
				}
				continue;
			}
			adv.configuration[field] = adv.configuration[field].map(item => {
				const normalized = _normalizeAdvancementLink(item, field, moduleId);
				changed ||= normalized.changed;
				return normalized.item;
			});
		}

		if ( (itemData.type === "class") && (adv.type === "ItemChoice")
			&& ["archetype", "subclass"].includes(adv.configuration?.type) ) {
			adv.type = "Subclass";
			adv.configuration = {};
			const normalizedValue = _normalizeSubclassValue(adv.value, moduleId);
			adv.value = normalizedValue.value;
			changed = true;
			continue;
		}

		if ( adv.type === "Subclass" ) {
			const normalizedValue = _normalizeSubclassValue(adv.value, moduleId);
			if ( normalizedValue.changed ) {
				adv.value = normalizedValue.value;
				changed = true;
			}
			continue;
		}

		if ( adv.type === "ItemChoice" ) {
			const normalizedValue = _normalizeItemChoiceValue(adv.value, moduleId);
			if ( normalizedValue.changed ) {
				adv.value = normalizedValue.value;
				changed = true;
			}
		}
	}
	if (changed) updateData["system.advancement"] = itemData.system.advancement;

	return updateData;
}

/**
 * Migrate weapon data from the sw5e test module or the old system.
 * @param {object} itemData        Item data to migrate.
 * @param {object} updateData      Existing update to expand upon.
 * @returns {object}               The updateData to apply
 * @private
 */
function _migrateWeaponData(itemData, updateData) {
	if (itemData.type !== "weapon") return updateData;

	if (["martialB", "simpleB", "exoticB"].includes(itemData.system?.type?.value)) {
		updateData["system.type.value"] = `${itemData.system.type.value}L`;
	}

	return updateData;
}

const BLASTER_AMMO_TYPES = new Set(["powerCell", "cartridge"]);

function _getBlasterAmmoTypes(itemData) {
	const types = itemData?.system?.ammo?.types;
	if ( Array.isArray(types) && types.length ) return types;
	const legacyTypes = itemData?.flags?.sw5e?.reload?.types;
	return Array.isArray(legacyTypes) ? legacyTypes : [];
}

function _getBlasterReloadMax(itemData) {
	const ammoMax = Number(itemData?.system?.ammo?.max);
	if ( Number.isFinite(ammoMax) && (ammoMax > 0) ) return ammoMax;

	const systemRel = Number(itemData?.system?.properties?.rel ?? itemData?.system?.properties?.ovr);
	if ( Number.isFinite(systemRel) && (systemRel > 0) ) return systemRel;

	const flagRel = Number(
		itemData?.flags?.sw5e?.properties?.rel
		?? itemData?.flags?.sw5e?.properties?.reload
		?? itemData?.flags?.sw5e?.properties?.ovr
	);
	return Number.isFinite(flagRel) && (flagRel > 0) ? flagRel : 0;
}

function _migrateBlasterAmmoData(itemData, updateData) {
	if ( itemData.type !== "weapon" ) return updateData;
	if ( ![null, undefined, ""].includes(itemData?.system?.ammo?.value) ) return updateData;
	if ( !_getBlasterAmmoTypes(itemData).some(type => BLASTER_AMMO_TYPES.has(type)) ) return updateData;

	const reloadMax = _getBlasterReloadMax(itemData);
	if ( reloadMax > 0 ) updateData["system.ammo.value"] = reloadMax;
	return updateData;
}
