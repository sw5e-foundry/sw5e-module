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
	getStarshipPrototypeTokenDimensions,
	normalizeLegacyStarshipActorSource,
	normalizeLegacyStarshipItemSource
} from "./starship-data.mjs";
import { normalizeAdvancementGrants } from "./proficiency-utils.mjs";
import { migrateBlasterWeaponData } from "./blaster-migration.mjs";
import {
	foldOrphanPhbCurrencyWallet,
	normalizeSwPriceDenomination
} from "./currencies.mjs";
import { applyManeuverFormulaMigration } from "./maneuver-formula-migration.mjs";
import {
	applyStarshipFoodCurrentMigration,
	auditStarshipFoodCurrent,
	beginStarshipFoodCurrentMigrationReport,
	endStarshipFoodCurrentMigrationReport,
	getActiveStarshipFoodCurrentMigrationReport
} from "./starship-food-value-migration.mjs";
import {
	cleanEffectAdvancementSupplantedChanges,
	remapSuperiorityEffectKeys
} from "./effect-change-collection.mjs";
import {
	createForcedReplacement,
	isForcedReplacement,
	unwrapForcedReplacement,
	unwrapForcedReplacementsDeep,
	valuesEqual
} from "./migration-operators.mjs";
import { executeAutoThrustersRemediation, verifyLiveAutoThrustersPostcondition } from "./auto-thrusters-remediation.mjs";
import { executeBwingResourceRemediation } from "./bwing-resource-remediation.mjs";
import { waitForDnd5eMigrationCompletion } from "./dnd5e-migration-barrier.mjs";
import {
	applyImagePathMigration,
	ArtworkMigrationInvariantError,
	collectArtworkInvariantViolations,
	formatArtworkInvariantDiagnostic
} from "./image-path-migration.mjs";
import {
	SOURCE_CONTEXT,
	describeItemSystemShape,
	getAdvancementEntries,
	emitMissingSystemDiagnostic,
	createMigrationRunState,
	recordDocumentFailure,
	recordAutoThrustersRemediationResult,
	recordBwingResourceRemediationResult,
	countBlockingAutoThrustersRemediationResults,
	countBlockingBwingResourceResults,
	countContinuableAutoThrustersResults,
	countContinuableBwingResourceResults,
	hasBlockingMigrationOutcome,
	hasContinuableActorLevelErrors,
	upsertPackLedger,
	buildBoundedIdentity,
	classifyMissingSystem
} from "./migration-identity.mjs";

export { auditStarshipFoodCurrent };
export {
	SOURCE_CONTEXT,
	describeItemSystemShape,
	classifyMissingSystem,
	buildBoundedIdentity,
	countBlockingAutoThrustersRemediationResults
};

const MIGRATABLE_COMPENDIUM_DOCUMENTS = ["Actor", "Item", "Scene", "JournalEntry", "RollTable"];

let activeMigrationRun = null;
let lastMigrationRun = null;

export function getActiveMigrationRun() {
	return activeMigrationRun;
}

export function getLastMigrationRun() {
	return lastMigrationRun;
}

export class MigrationDocumentError extends Error {
	constructor(message, { cause, identity, packLedger, partialWrites }={}) {
		super(message, { cause });
		this.name = "MigrationDocumentError";
		this.identity = identity ?? null;
		this.originalError = cause ?? null;
		this.originalStack = cause?.stack ?? this.stack;
		this.packLedger = packLedger ?? [];
		this.partialWrites = Boolean(partialWrites);
	}
}

/**
 * Raised when a full-source write payload would empty a non-empty keyed Item collection
 * (`system.advancement`, `system.activities`) that the live document still holds.
 */
export class MigrationCollectionLossError extends Error {
	/**
	 * @param {object[]} violations
	 */
	constructor(violations=[]) {
		const first = violations[0];
		const summary = first
			? `${first.documentType} ${first.documentId} item ${first.itemId ?? first.documentId} ${first.collection} (${first.before} -> ${first.after})`
			: "unknown";
		super(`SW5E migration refused to persist collection loss (${violations.length}): ${summary}`);
		this.name = "MigrationCollectionLossError";
		this.violations = violations;
	}
}

/**
 * Raised when source serialization exposes an embedded-document ID that cannot be
 * expanded from the live collection. Fail closed so a full-source write cannot
 * persist unresolved ID strings.
 */
export class MigrationUnexpandedEmbedError extends Error {
	/**
	 * @param {object} [identity]
	 */
	constructor({ parentType, parentId, embeddedName, embedId }={}) {
		super(`SW5E migration could not expand embedded ${embeddedName ?? "collection"} ${embedId ?? "unknown"} on ${parentType ?? "Document"} ${parentId ?? "unknown"}`);
		this.name = "MigrationUnexpandedEmbedError";
		this.parentType = parentType ?? null;
		this.parentId = parentId ?? null;
		this.embeddedName = embeddedName ?? null;
		this.embedId = embedId ?? null;
	}
}

/** Keyed Item collections that must never be emptied by a migration write. */
const GUARDED_ITEM_COLLECTIONS = ["advancement", "activities"];

function isMapLikeCollection(value) {
	return Boolean(
		value
		&& (typeof value === "object")
		&& !Array.isArray(value)
		&& (typeof value.size === "number")
		&& (typeof value.get === "function")
		&& (typeof value.keys === "function")
		&& (typeof value.forEach === "function")
	);
}

/**
 * Count meaningful keyed-collection entries without mutating the value.
 * Accepts arrays, plain objects, Map-like fixtures, ForcedReplacement wrappers,
 * missing, and null.
 * @param {*} value
 * @returns {number}
 */
function countKeyedEntries(value) {
	if ( (value === undefined) || (value === null) ) return 0;
	if ( isForcedReplacement(value) ) value = unwrapForcedReplacement(value);
	if ( (value === undefined) || (value === null) ) return 0;
	if ( Array.isArray(value) ) return value.filter(v => v && (typeof v === "object")).length;
	if ( isMapLikeCollection(value) ) return Number(value.size);
	if ( typeof value === "object" ) return Object.keys(value).length;
	return 0;
}

function getLiveItemSystemSource(liveItem) {
	let system = liveItem?._source?.system;
	if ( !system && (typeof liveItem?.toObject === "function") ) system = liveItem.toObject()?.system;
	return (system && (typeof system === "object")) ? system : null;
}

/**
 * Compare one Item payload against the live Item source for guarded collection loss.
 * @param {object} liveItem     Live Item document (or mock)
 * @param {object} payloadItem  Item data about to be written
 * @param {object} identity
 * @returns {object[]}
 */
function collectItemCollectionLossViolations(liveItem, payloadItem, identity={}) {
	const violations = [];
	if ( !payloadItem || (typeof payloadItem !== "object") ) return violations;
	const payloadSystem = payloadItem.system;
	const hasSystemObject = payloadSystem && (typeof payloadSystem === "object") && !isForcedReplacement(payloadSystem);
	const liveSystem = getLiveItemSystemSource(liveItem);
	if ( !liveSystem ) return violations;
	for ( const key of GUARDED_ITEM_COLLECTIONS ) {
		const before = countKeyedEntries(liveSystem[key]);
		if ( before === 0 ) continue;
		const flatKey = `system.${key}`;
		let after;
		if ( flatKey in payloadItem ) after = payloadItem[flatKey];
		else if ( hasSystemObject ) after = payloadSystem[key];
		else continue;
		const afterCount = countKeyedEntries(after);
		if ( afterCount > 0 ) continue;
		violations.push({ ...identity, collection: flatKey, before, after: afterCount });
	}
	return violations;
}

/**
 * Collect guarded-collection loss violations for a write candidate. Only full-source
 * (`recursive: false`) writes can delete keys, so recursive diff writes are not checked.
 * @param {object} candidate
 * @returns {object[]}
 */
function collectCandidateCollectionLossViolations(candidate) {
	if ( !candidate ) return [];
	if ( !candidate.persistSourceMigration && (candidate.options?.recursive !== false) ) return [];
	const payload = candidate.writePayload ?? candidate.preparedUpdate;
	if ( !payload || (typeof payload !== "object") ) return [];
	const doc = candidate.document;
	const base = {
		documentType: candidate.documentType,
		documentId: candidate.documentId,
		documentUuid: candidate.document?.uuid ?? null,
		documentName: candidate.logName ?? null,
		caller: candidate.caller ?? null,
		operation: candidate.caller ?? "persistSourceMigration"
	};
	const violations = [];
	if ( candidate.documentType === "Item" ) {
		violations.push(...collectItemCollectionLossViolations(doc, payload, { ...base, itemId: candidate.documentId }));
	}
	const items = isForcedReplacement(payload.items) ? undefined : payload.items;
	if ( Array.isArray(items) ) {
		for ( const itemPayload of items ) {
			if ( !itemPayload || (typeof itemPayload !== "object") ) continue;
			const liveItem = doc?.items?.get?.(itemPayload._id);
			if ( !liveItem ) continue;
			violations.push(...collectItemCollectionLossViolations(liveItem, itemPayload, {
				...base,
				itemId: itemPayload._id,
				itemName: itemPayload.name ?? null
			}));
		}
	}
	return violations;
}

export function formatCollectionLossDiagnostic(v) {
	return [
		"SW5E migration collection-loss violation",
		`type=${v.documentType}`,
		`id=${v.documentId}`,
		`uuid=${v.documentUuid ?? ""}`,
		`item=${v.itemId ?? ""}`,
		`collection=${v.collection}`,
		`before=${v.before}`,
		`after=${v.after}`,
		`operation=${v.operation ?? v.caller ?? ""}`
	].join(" ");
}

/**
 * Refuse to write a candidate whose payload would wipe advancements or activities that
 * the live document still has. Records a document failure so the run cannot stamp clean.
 * @param {object} run
 * @param {object} candidate
 * @returns {boolean}
 */
export function isCollectionLossSafeCandidate(run, candidate) {
	const violations = collectCandidateCollectionLossViolations(candidate);
	if ( !violations.length ) return true;
	if ( run?.summary ) run.summary.collectionLossSkips = Number(run.summary.collectionLossSkips ?? 0) + 1;
	const err = new MigrationCollectionLossError(violations);
	for ( const violation of violations ) console.error(formatCollectionLossDiagnostic(violation));
	recordDocumentFailure(run, err, {
		phase: run?.phase ?? "write",
		sourceContext: candidate.sourceContext ?? run?.identity?.sourceContext ?? null,
		packId: candidate.packCollection ?? null,
		documentType: candidate.documentType,
		documentId: candidate.documentId,
		documentName: candidate.logName,
		sceneId: candidate.sceneId ?? null,
		tokenId: candidate.tokenId ?? null,
		actorId: candidate.actorId ?? null,
		itemId: candidate.itemId ?? violations[0]?.itemId ?? null
	});
	return false;
}

function applyMigrationTestHook(point, run) {
	const hook = globalThis.__SW5E_MIGRATION_TEST_HOOKS__;
	if ( !hook?.forceUnexpectedAt || hook.forceUnexpectedAt !== point ) return;
	const err = hook.error instanceof Error
		? hook.error
		: new Error(String(hook.error ?? `SW5E test-only unexpected migration failure at ${point}`));
	throw err;
}

function applyDocumentMigrationTestHook(identity={}) {
	const hook = globalThis.__SW5E_MIGRATION_TEST_HOOKS__;
	if ( !hook?.failDocumentId || hook.failDocumentId !== identity.documentId ) return;
	const err = hook.error instanceof Error
		? hook.error
		: new Error(String(hook.error ?? `SW5E test-only document migration failure for ${identity.documentId}`));
	throw err;
}

function applyCandidateMutationTestHook(candidate) {
	const hook = globalThis.__SW5E_MIGRATION_TEST_HOOKS__;
	if ( !candidate || hook?.forceArtworkClearForId !== candidate.documentId ) return;
	candidate.preparedUpdate = foundry.utils.deepClone(candidate.preparedUpdate ?? {});
	candidate.preparedUpdate.img = "";
}

/**
 * Serialize a live Document into a plain source object for migration.
 *
 * Always uses `Document.toObject()` (source=true), which deepClones `_source`.
 *
 * Never use `toObject(false)` here. That serializes *prepared* data through the class
 * schema. In dnd5e 5.3.3 the `system.advancement` and `system.activities` MappingFields
 * initialize to Collection (Map) instances, and Foundry's `TypedObjectField.toObject`
 * iterates them with `for...in`, which yields `{}`. Fed into the full-source write path
 * (`diff: false, recursive: false`) that empties every advancement and activity on the
 * document. See ai/sessions/2026-09-03-migration-advancement-wipe-investigation.md.
 *
 * Defensive embed expansion: if an embedded collection in `_source` is stored as ID
 * strings (LevelDB sidecar refs), each string is replaced with the matching live
 * embedded Document's own source. The 2026-08-26 live probe found `_source` already
 * expanded on Foundry 14.367, so this is a safeguard rather than the expected path.
 * @param {object} document
 * @returns {object|null}
 */
export function getExpandedMigrationSource(document) {
	if ( !document ) return null;
	if ( typeof document.toObject !== "function" ) return foundry.utils.deepClone(document);
	const source = document.toObject();
	if ( !source || (typeof source !== "object") ) return source ?? null;
	expandEmbeddedSourceRefs(source, document, "items");
	expandEmbeddedSourceRefs(source, document, "effects");
	return source;
}

/**
 * Replace ID-string entries in `source[embeddedName]` with the live embedded Document's
 * source. Recurses into item-embedded effects.
 * @param {object} source
 * @param {object} document
 * @param {"items"|"effects"} embeddedName
 */
function expandEmbeddedSourceRefs(source, document, embeddedName) {
	const entries = source?.[embeddedName];
	if ( !Array.isArray(entries) ) return;
	const collection = document?.[embeddedName];
	const parentType = document?.documentName
		?? source?.documentName
		?? (embeddedName === "items" ? "Actor" : "Document");
	const parentId = document?.id ?? document?._id ?? source?._id ?? null;
	for ( let i = 0; i < entries.length; i++ ) {
		const entry = entries[i];
		if ( typeof entry === "string" ) {
			const embedded = collection?.get?.(entry);
			const expanded = embedded ? getExpandedMigrationSource(embedded) : null;
			if ( !expanded || (typeof expanded !== "object") ) {
				throw new MigrationUnexpandedEmbedError({
					parentType,
					parentId,
					embeddedName,
					embedId: entry
				});
			}
			entries[i] = expanded;
		} else if ( entry && (typeof entry === "object") && (embeddedName === "items") ) {
			const embedded = collection?.get?.(entry._id);
			if ( embedded ) {
				expandEmbeddedSourceRefs(entry, embedded, "effects");
				continue;
			}
			const unresolvedEffect = Array.isArray(entry.effects)
				? entry.effects.find(effect => typeof effect === "string")
				: null;
			if ( unresolvedEffect ) {
				throw new MigrationUnexpandedEmbedError({
					parentType: "Item",
					parentId: entry._id ?? parentId,
					embeddedName: "effects",
					embedId: unresolvedEffect
				});
			}
		}
	}
}

function tryBuildCandidate(run, builder) {
	run.summary.documentsAttempted += 1;
	try {
		applyDocumentMigrationTestHook(run.identity);
		const candidate = builder();
		if ( !candidate ) {
			run.summary.documentsUnchanged += 1;
			return null;
		}
		applyCandidateMutationTestHook(candidate);
		return candidate;
	} catch(err) {
		recordDocumentFailure(run, err, run.identity);
		return null;
	}
}

async function writeCandidate(run, candidate) {
	if ( !isCollectionLossSafeCandidate(run, candidate) ) return;
	try {
		const hook = globalThis.__SW5E_MIGRATION_TEST_HOOKS__;
		if ( hook?.failUpdateDocumentId && hook.failUpdateDocumentId === candidate.documentId ) {
			const err = hook.error instanceof Error
				? hook.error
				: new Error(String(hook.error ?? `SW5E test-only document update failure for ${candidate.documentId}`));
			throw err;
		}
		console.log(`Migrating ${candidate.documentType} document ${candidate.logName}`);
		const payload = candidate.writePayload ?? candidate.preparedUpdate;
		await candidate.document.update(payload, candidate.options);
		run.summary.documentsUpdated += 1;
	} catch(err) {
		recordDocumentFailure(run, err, {
			phase: "write",
			sourceContext: candidate.sourceContext ?? run.identity?.sourceContext ?? null,
			packId: candidate.packCollection ?? null,
			documentType: candidate.documentType,
			documentId: candidate.documentId,
			documentName: candidate.logName,
			sceneId: candidate.sceneId ?? null,
			tokenId: candidate.tokenId ?? null,
			actorId: candidate.actorId ?? null,
			itemId: candidate.itemId ?? null
		});
	}
}

/**
 * Run world-Actor Auto-Thrusters and B-Wing resource remediation after ordinary migration.
 * @param {object} run
 */
async function _runWorldRemediationPass(run) {
	run.phase = "remediation";
	run.identity = { phase: "remediation", documentType: "World" };
	for ( const actor of game.actors ) {
		run.identity = {
			phase: "remediation",
			documentType: "Actor",
			documentId: actor.id,
			documentName: actor.name,
			actorId: actor.id
		};
		const liveActor = game.actors.get(actor.id) ?? actor;
		const autoResult = await executeAutoThrustersRemediation(liveActor);
		run.remediationResults.push(autoResult);
		recordAutoThrustersRemediationResult(run, autoResult);

		const bwingResult = await executeBwingResourceRemediation(game.actors.get(actor.id) ?? liveActor);
		run.bwingResults.push(bwingResult);
		recordBwingResourceRemediationResult(run, bwingResult);
	}
}

function wrapUnexpectedMigrationError(err, run) {
	if ( err instanceof MigrationDocumentError || err instanceof ArtworkMigrationInvariantError ) return err;
	const packCompleted = Boolean(run?.foundryPackMigrateCompleted?.length);
	return new MigrationDocumentError(err?.message ?? String(err), {
		cause: err,
		identity: run?.identity ?? null,
		packLedger: run?.packLedger ?? [],
		partialWrites: Boolean(run?.sw5eWritesBegun || packCompleted)
	});
}

function resolveItemContext(flags={}, context={}, itemData={}) {
	return {
		phase: context.phase ?? flags.migrationContext?.phase ?? activeMigrationRun?.phase ?? null,
		sourceContext: context.sourceContext
			?? flags.migrationContext?.sourceContext
			?? SOURCE_CONTEXT.WORLD_ITEM,
		packId: context.packId ?? flags.migrationContext?.packId ?? null,
		documentType: context.documentType ?? "Item",
		documentId: context.documentId ?? itemData?._id ?? itemData?.id ?? null,
		documentName: context.documentName ?? itemData?.name ?? null,
		parentDocumentId: context.parentDocumentId ?? context.actorId ?? context.sceneId ?? null,
		sceneId: context.sceneId ?? null,
		tokenId: context.tokenId ?? null,
		actorLink: context.actorLink ?? null,
		actorId: context.actorId ?? null,
		itemId: context.itemId ?? itemData?._id ?? itemData?.id ?? null
	};
}

function _collectCandidateArtworkViolations(candidate, migrationVersion) {
	const violations = [];
	if ( candidate.sceneTokenArtwork && candidate.sceneUpdate?.tokens ) {
		const beforeTokens = candidate.beforeSource?.tokens ?? [];
		for ( const tokenUpdate of candidate.sceneUpdate.tokens ) {
			const beforeToken = beforeTokens.find(t => t._id === tokenUpdate._id) ?? {};
			const afterToken = foundry.utils.mergeObject(
				foundry.utils.deepClone(beforeToken),
				tokenUpdate,
				{ inplace: false }
			);
			violations.push(...collectArtworkInvariantViolations({
				documentType: "Token",
				documentId: tokenUpdate._id,
				beforeSource: beforeToken,
				preparedSource: afterToken,
				caller: "migrateWorld:Scene.tokens",
				updateMode: candidate.options,
				migrationVersion
			}));
		}
	}

	violations.push(...collectArtworkInvariantViolations({
		documentType: candidate.documentType,
		documentId: candidate.documentId,
		beforeSource: candidate.beforeSource,
		preparedSource: candidate.preparedUpdate,
		caller: candidate.caller,
		updateMode: {
			diff: candidate.options?.diff,
			recursive: candidate.options?.recursive,
			persistSourceMigration: candidate.persistSourceMigration
		},
		migrationVersion
	}));
	return violations;
}

function isArtworkSafeCandidate(run, candidate, migrationVersion) {
	const violations = _collectCandidateArtworkViolations(candidate, migrationVersion);
	if ( !violations.length ) return true;
	run.summary.artworkInvariantSkips += 1;
	const err = new ArtworkMigrationInvariantError(violations);
	for ( const violation of violations ) console.error(formatArtworkInvariantDiagnostic(violation));
	recordDocumentFailure(run, err, {
		phase: run.phase,
		sourceContext: candidate.sourceContext ?? null,
		packId: candidate.packCollection ?? null,
		documentType: candidate.documentType,
		documentId: candidate.documentId,
		documentName: candidate.logName,
		sceneId: candidate.sceneId ?? null,
		tokenId: candidate.tokenId ?? null,
		actorId: candidate.actorId ?? null,
		itemId: candidate.itemId ?? null
	});
	return false;
}

function isSw5eStarshipActorData(actor) {
	return actor?.type === "vehicle" && actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

function migrateSw5eStarshipPrototypeToken(actorData, updateData = null, { persistToSource = false } = {}) {
	if ( !isSw5eStarshipActorData(actorData) ) return updateData;
	const sizeKey = actorData?.system?.traits?.size
		?? actorData?.flags?.sw5e?.legacyStarshipActor?.system?.traits?.size
		?? "med";
	const { width, height } = getStarshipPrototypeTokenDimensions(sizeKey);
	if ( persistToSource ) {
		actorData.prototypeToken ??= {};
		actorData.prototypeToken.width = width;
		actorData.prototypeToken.height = height;
		return updateData;
	}
	if ( actorData?.prototypeToken?.width !== width ) updateData["prototypeToken.width"] = width;
	if ( actorData?.prototypeToken?.height !== height ) updateData["prototypeToken.height"] = height;
	return updateData;
}

function _isManeuverItem(item) {
	if ( typeof item?.type !== "string" ) return false;
	const normalizedType = item.type.split(".").at(-1) ?? item.type;
	return normalizedType === "maneuver";
}

function _mapLegacySuperiorityProgression(progression) {
	if ( progression === "" || progression === null || progression === undefined ) return null;
	if ( progression === 0 || progression === "0" || progression === "none" ) return "none";
	if ( progression === 0.5 || progression === "0.5" || progression === "half" ) return "half";
	if ( progression === 1 || progression === "1" || progression === "full" ) return "full";
	return null;
}

function _itemHasSuperiorityProgression(item) {
	if ( !["class", "subclass"].includes(item?.type) ) return false;
	const levels = Number(item.system?.levels ?? 0);
	if ( item.type === "class" && !(levels >= 1) ) return false;

	const progression = item.system?.spellcasting?.superiorityProgression;
	if ( progression && progression !== "none" ) return true;

	const mapped = _mapLegacySuperiorityProgression(item.system?.superiority?.progression);
	return mapped != null && mapped !== "none";
}

function _actorHasSuperiorityProgression(actorData) {
	for ( const item of actorData.items ?? [] ) {
		if ( _itemHasSuperiorityProgression(item) ) return true;
	}
	return false;
}

function _actorHasSuperiorityIndicators(actorData) {
	if ( _actorHasSuperiorityProgression(actorData) ) return true;
	if ( actorData.system?.attributes?.super ) return true;
	if ( (actorData.items ?? []).some(item => _isManeuverItem(item)) ) return true;
	if ( Number(actorData.system?.details?.superiorityLevel ?? 0) > 0 ) return true;
	return false;
}

/**
 * Clear stale persisted superiority dice.max overrides written as 0.
 * @param {object} actorData
 * @param {object} updateData
 * @returns {object}
 * @private
 */
function _migrateStaleSuperiorityDiceMax(actorData, updateData) {
	if ( !["character", "npc"].includes(actorData.type) ) return updateData;

	const diceMax = foundry.utils.getProperty(actorData, "system.superiority.dice.max");
	if ( diceMax !== 0 ) return updateData;
	if ( !_actorHasSuperiorityIndicators(actorData) ) return updateData;

	const path = "system.superiority.dice.max";
	foundry.utils.setProperty(updateData, path, null);
	foundry.utils.setProperty(actorData, path, null);
	return updateData;
}

/**
 * Initialize / normalize Starship Food current stock (system + legacy mirror).
 * Idempotent. Skips non-starships and valid integral stock (including explicit 0).
 * @param {object} actorData
 * @param {object} updateData
 * @returns {object}
 * @private
 */
function _migrateStarshipFoodCurrentValue(actorData, updateData) {
	if ( !isSw5eStarshipActorData(actorData) ) return updateData;
	applyStarshipFoodCurrentMigration(actorData, updateData);
	return updateData;
}

/**
 * Fold orphan PHB wallet keys (and credit aliases) into Galactic Credits.
 * @param {object} actorData
 * @param {object} updateData
 * @returns {object}
 * @private
 */
function _migrateOrphanCurrencyWallet(actorData, updateData) {
	const currency = foundry.utils.getProperty(actorData, "system.currency");
	if ( !currency || (typeof currency !== "object") || Array.isArray(currency) ) return updateData;

	const folded = foldOrphanPhbCurrencyWallet(currency);
	if ( JSON.stringify(folded) === JSON.stringify(currency) ) return updateData;

	const path = "system.currency";
	foundry.utils.setProperty(updateData, path, folded);
	foundry.utils.setProperty(actorData, path, folded);
	return updateData;
}

/**
 * Remap stale PHB / alias price denominations to Galactic Credits.
 * @param {object} itemData
 * @param {object} updateData
 * @returns {object}
 * @private
 */
function _migratePriceDenomination(itemData, updateData) {
	const path = "system.price.denomination";
	const denomination = foundry.utils.getProperty(itemData, path);
	if ( denomination == null || denomination === "" ) return updateData;

	const normalized = normalizeSwPriceDenomination(denomination);
	if ( normalized === denomination ) return updateData;

	foundry.utils.setProperty(updateData, path, normalized);
	foundry.utils.setProperty(itemData, path, normalized);
	return updateData;
}

/**
 * Bug 27C: repair known obsolete Maneuver heal/temphp formulas on canonical carriers.
 * @param {object} itemData
 * @param {object} updateData
 * @returns {object}
 * @private
 */
function _migrateManeuverHealFormulas(itemData, updateData) {
	return applyManeuverFormulaMigration(itemData, updateData);
}

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

	const run = createMigrationRunState();
	activeMigrationRun = run;
	lastMigrationRun = run;
	run.identity = {
		phase: "migrate-world-start",
		documentType: "World"
	};
	const migrationData = await getMigrationData();
	beginStarshipFoodCurrentMigrationReport();
	try {
		applyMigrationTestHook("migrate-world-start", run);
		run.identity = { phase: "dnd5e-barrier", documentType: "World" };
		applyMigrationTestHook("dnd5e-barrier", run);
		const barrier = await waitForDnd5eMigrationCompletion();
		run.summary.dnd5eBarrier = barrier;
		if ( barrier.required && !barrier.passed ) {
			run.summary.completionState = "blocked";
			const err = new Error(`DND5e migration barrier failed: timedOut=${barrier.timedOut}`);
			throw wrapUnexpectedMigrationError(err, run);
		}

		run.identity = { phase: "collect-world", documentType: "World" };
		applyMigrationTestHook("collect-world", run);
		await _migrateWorldDocuments(migrationData, run);
		await _runWorldRemediationPass(run);
		run.sw5eWritesCompleted = true;
	} catch(err) {
		run.summary.completionState = "blocked";
		const wrapped = wrapUnexpectedMigrationError(err, run);
		console.error("SW5E MODULE | Migration could not complete", {
			identity: wrapped.identity ?? run.identity,
			originalMessage: wrapped.originalError?.message ?? wrapped.message,
			originalStack: wrapped.originalStack,
			packLedger: wrapped.packLedger,
			partialWrites: wrapped.partialWrites,
			documentFailures: run.documentFailures
		});
		if ( err instanceof ArtworkMigrationInvariantError ) {
			for ( const violation of err.violations ) {
				console.error(formatArtworkInvariantDiagnostic(violation));
			}
		}
		ui.notifications.error(game.i18n.format("MIGRATION.sw5eBlocked", { version }), { permanent: true });
		throw wrapped;
	} finally {
		endStarshipFoodCurrentMigrationReport();
		activeMigrationRun = null;
	}

	const moduleVersion = getModule()?.version ?? version;
	const blocked = hasBlockingMigrationOutcome(run.summary);
	const continuableErrors = hasContinuableActorLevelErrors(run.summary);
	if ( blocked && !continuableErrors ) {
		run.summary.completionState = "blocked";
		ui.notifications.error(game.i18n.format("MIGRATION.sw5eBlocked", { version }), { permanent: true });
		return;
	}
	if ( continuableErrors || run.documentFailures.length > 0 ) {
		run.summary.completionState = "completed-with-errors";
		const reportedCount = Math.max(
			run.documentFailures.length,
			countContinuableAutoThrustersResults(run.summary),
			countContinuableBwingResourceResults(run.summary)
		);
		ui.notifications.warn(
			game.i18n.format("MIGRATION.sw5eCompleteWithErrors", { count: reportedCount, version }),
			{ permanent: true }
		);
		return;
	}

	run.summary.completionState = "completed";
	if ( moduleVersion === "#{VERSION}#" ) {
		run.summary.stampSkippedReason = "development-placeholder-version";
		ui.notifications.info(game.i18n.format("MIGRATION.sw5eCompleteSuccessDevelopment", { version }), { permanent: true });
		return;
	}

	try {
		await game.settings.set(SETTINGS_NAMESPACE, "moduleMigrationVersion", moduleVersion);
		const persisted = game.settings.get(SETTINGS_NAMESPACE, "moduleMigrationVersion");
		if ( persisted !== moduleVersion ) {
			run.summary.completionState = "blocked";
			throw new Error(`Migration stamp mismatch: expected ${moduleVersion}, got ${persisted}`);
		}
		run.summary.stampPersisted = true;
		ui.notifications.info(game.i18n.format("MIGRATION.sw5eCompleteSuccess", { version: moduleVersion }), { permanent: true });
	} catch(err) {
		run.summary.completionState = "blocked";
		const wrapped = wrapUnexpectedMigrationError(err, run);
		console.error("SW5E MODULE | Migration version could not be persisted", {
			identity: { phase: "persist-version", documentType: "World" },
			originalMessage: wrapped.originalError?.message ?? wrapped.message,
			originalStack: wrapped.originalStack
		});
		ui.notifications.error(game.i18n.format("MIGRATION.sw5eBlocked", { version }), { permanent: true });
		throw wrapped;
	}
};

/**
 * Document migration body for migrateWorld (Actors, Items, Scenes, world packs).
 * Each document transform/update is attempted independently. Recoverable document
 * failures are recorded and skipped. Pack.migrate(), lock restore, and enumeration
 * failures remain blocking.
 * @param {object} migrationData
 * @param {object} [run]
 * @private
 */
async function _migrateWorldDocuments(migrationData, run=createMigrationRunState()) {
	const migrationVersion = getModule()?.flags?.needsMigrationVersion
		?? getModule()?.version
		?? "";

	run.phase = "write";
	applyMigrationTestHook("before-sw5e-write", run);
	run.sw5eWritesBegun = true;

	const actors = game.actors.map(a => [a, true])
		.concat(Array.from(game.actors.invalidDocumentIds).map(id => [game.actors.getInvalid(id), false]));
	for ( const [actor, valid] of actors ) {
		const flags = { persistSourceMigration: false };
		const source = valid
			? getExpandedMigrationSource(actor)
			: getInvalidDocumentSource(game.actors, actor.id, "actors");
		if ( !source ) continue;
		run.identity = {
			phase: run.phase,
			sourceContext: SOURCE_CONTEXT.ACTOR_EMBEDDED_ITEM,
			documentType: "Actor",
			documentId: actor.id,
			documentName: actor.name,
			actorId: actor.id
		};
		const candidate = tryBuildCandidate(run, () => {
			const updateData = migrateActorData(source, migrationData, flags, {
				actorUuid: actor.uuid,
				context: run.identity
			});
			if ( foundry.utils.isEmpty(updateData) ) return null;
			const preparedUpdate = prepareMigratedSource(source, updateData, flags);
			return {
				documentType: "Actor",
				documentId: actor.id,
				document: actor,
				beforeSource: source,
				preparedUpdate,
				writePayload: preparedUpdate,
				options: getDocumentUpdateOptions({
					valid,
					persistSourceMigration: flags.persistSourceMigration
				}),
				caller: "migrateWorld:Actor",
				persistSourceMigration: flags.persistSourceMigration,
				logName: actor.name,
				sourceContext: SOURCE_CONTEXT.ACTOR_EMBEDDED_ITEM,
				actorId: actor.id
			};
		});
		if ( candidate && isArtworkSafeCandidate(run, candidate, migrationVersion) ) {
			await writeCandidate(run, candidate);
		} else if ( run.documentFailures.some(row => row.documentId === actor.id) ) {
			const foodReport = getActiveStarshipFoodCurrentMigrationReport();
			if ( foodReport ) foodReport.failures += 1;
		}
	}

	const items = game.items.map(i => [i, true])
		.concat(Array.from(game.items.invalidDocumentIds).map(id => [game.items.getInvalid(id), false]));
	for ( const [item, valid] of items ) {
		const flags = { persistSourceMigration: false };
		const source = valid
			? getExpandedMigrationSource(item)
			: getInvalidDocumentSource(game.items, item.id, "items");
		if ( !source ) continue;
		run.identity = {
			phase: run.phase,
			sourceContext: SOURCE_CONTEXT.WORLD_ITEM,
			documentType: "Item",
			documentId: item.id,
			documentName: item.name,
			itemId: item.id
		};
		const candidate = tryBuildCandidate(run, () => {
			const updateData = migrateItemData(source, migrationData, flags, run.identity);
			if ( foundry.utils.isEmpty(updateData) ) return null;
			const preparedUpdate = prepareMigratedSource(source, updateData, flags);
			return {
				documentType: "Item",
				documentId: item.id,
				document: item,
				beforeSource: source,
				preparedUpdate,
				writePayload: preparedUpdate,
				options: getDocumentUpdateOptions({
					valid,
					persistSourceMigration: flags.persistSourceMigration
				}),
				caller: "migrateWorld:Item",
				persistSourceMigration: flags.persistSourceMigration,
				logName: item.name,
				sourceContext: SOURCE_CONTEXT.WORLD_ITEM,
				itemId: item.id
			};
		});
		if ( candidate && isArtworkSafeCandidate(run, candidate, migrationVersion) ) {
			await writeCandidate(run, candidate);
		}
	}

	for ( const m of game.macros ) {
		const source = m.toObject();
		run.identity = {
			phase: run.phase,
			documentType: "Macro",
			documentId: m.id,
			documentName: m.name
		};
		const candidate = tryBuildCandidate(run, () => {
			const updateData = migrateMacroData(source, migrationData);
			if ( foundry.utils.isEmpty(updateData) ) return null;
			return {
				documentType: "Macro",
				documentId: m.id,
				document: m,
				beforeSource: source,
				preparedUpdate: applyUpdateToClone(source, updateData),
				writePayload: updateData,
				options: { enforceTypes: false, render: false },
				caller: "migrateWorld:Macro",
				persistSourceMigration: false,
				logName: m.name,
				writeMode: "delta"
			};
		});
		if ( candidate && isArtworkSafeCandidate(run, candidate, migrationVersion) ) {
			await writeCandidate(run, candidate);
		}
	}

	for ( const table of game.tables ) {
		const source = table.toObject();
		run.identity = {
			phase: run.phase,
			documentType: "RollTable",
			documentId: table.id,
			documentName: table.name
		};
		const candidate = tryBuildCandidate(run, () => {
			const updateData = migrateRollTableData(source, migrationData);
			if ( foundry.utils.isEmpty(updateData) ) return null;
			return {
				documentType: "RollTable",
				documentId: table.id,
				document: table,
				beforeSource: source,
				preparedUpdate: applyUpdateToClone(source, updateData),
				writePayload: updateData,
				options: { enforceTypes: false, render: false },
				caller: "migrateWorld:RollTable",
				persistSourceMigration: false,
				logName: table.name,
				writeMode: "delta"
			};
		});
		if ( candidate && isArtworkSafeCandidate(run, candidate, migrationVersion) ) {
			await writeCandidate(run, candidate);
		}
	}

	for ( const s of game.scenes ) {
		const sceneSource = s.toObject?.() ?? s;
		run.identity = {
			phase: run.phase,
			sourceContext: SOURCE_CONTEXT.SCENE_ACTOR_DELTA_ITEM,
			documentType: "Scene",
			documentId: s.id,
			documentName: s.name,
			sceneId: s.id
		};
		const sceneCandidate = tryBuildCandidate(run, () => {
			const sceneUpdate = migrateSceneData(s, migrationData, run.identity);
			if ( foundry.utils.isEmpty(sceneUpdate) ) return null;
			return {
				documentType: "Scene",
				documentId: s.id,
				document: s,
				beforeSource: sceneSource,
				preparedUpdate: applyUpdateToClone(sceneSource, sceneUpdate),
				writePayload: sceneUpdate,
				options: { enforceTypes: false, render: false },
				caller: "migrateWorld:Scene",
				persistSourceMigration: false,
				logName: s.name,
				writeMode: "delta",
				sceneTokenArtwork: true,
				sceneUpdate,
				sourceContext: SOURCE_CONTEXT.SCENE_ACTOR_DELTA_ITEM,
				sceneId: s.id
			};
		});
		if ( sceneCandidate && isArtworkSafeCandidate(run, sceneCandidate, migrationVersion) ) {
			await writeCandidate(run, sceneCandidate);
		}

		for ( const token of s.tokens ) {
			if ( token.actorLink || !token.actor ) continue;
			const flags = { persistSourceMigration: false };
			const source = getExpandedMigrationSource(token.actor);
			run.identity = {
				phase: run.phase,
				sourceContext: SOURCE_CONTEXT.SCENE_ACTOR_DELTA_ITEM,
				documentType: "ActorDelta",
				documentId: token.delta?.id ?? token.id,
				documentName: token.actor.name,
				sceneId: s.id,
				tokenId: token.id,
				actorLink: token.actorLink,
				actorId: token.actorId ?? token.actor.id,
				actorDeltaPresent: true
			};
			const deltaCandidate = tryBuildCandidate(run, () => {
				const updateData = migrateActorData(source, migrationData, flags, {
					actorUuid: token.actor.uuid,
					context: run.identity
				});
				if ( foundry.utils.isEmpty(updateData) ) return null;
				let writePayload;
				let preparedUpdate;
				if ( flags.persistSourceMigration ) {
					writePayload = prepareMigratedSource(source, updateData, flags);
					preparedUpdate = writePayload;
				} else {
					writePayload = foundry.utils.deepClone(updateData);
					["items", "effects"].forEach(col => {
						for ( const [i, update] of (writePayload[col] ?? []).entries() ) {
							const original = token.actor[col].get(update._id);
							writePayload[col][i] = foundry.utils.mergeObject(original.toObject(), update, { inplace: false });
						}
					});
					preparedUpdate = applyUpdateToClone(source, writePayload);
				}
				return {
					documentType: "ActorDelta",
					documentId: token.delta?.id ?? token.id,
					document: token.actor,
					beforeSource: source,
					preparedUpdate,
					writePayload,
					options: getDocumentUpdateOptions({
						valid: true,
						persistSourceMigration: flags.persistSourceMigration
					}),
					caller: "migrateWorld:ActorDelta",
					persistSourceMigration: flags.persistSourceMigration,
					logName: token.actor.name,
					sourceContext: SOURCE_CONTEXT.SCENE_ACTOR_DELTA_ITEM,
					sceneId: s.id,
					tokenId: token.id,
					actorId: token.actorId ?? token.actor.id
				};
			});
			if ( deltaCandidate && isArtworkSafeCandidate(run, deltaCandidate, migrationVersion) ) {
				await writeCandidate(run, deltaCandidate);
			}
		}
	}

	for ( let p of game.packs ) {
		if ( p.metadata.packageType !== "world" ) continue;
		if ( !MIGRATABLE_COMPENDIUM_DOCUMENTS.includes(p.documentName) ) continue;
		await migrateCompendium(p, run);
	}

	run.summary.expectedLegacyNoOps = [...(run.diagnostics?.values?.() ?? [])]
		.reduce((n, row) => n + (row?.count ?? 0), 0);

	const legacyEmptyFolderNames = new Set([
		"Powers & Maneuvers",
		"Tools",
		"Weapons",
		"Customization Options"
	]);
	const leftover = [];
	for ( const folder of game.folders ) {
		if ( !legacyEmptyFolderNames.has(folder.name) ) continue;
		if ( folder.contents.length === 0 && folder.children.length === 0 ) leftover.push(folder.name);
	}
	if ( leftover.length ) {
		console.info(`SW5E | Migration left empty legacy-named folders for manual cleanup: ${leftover.join(", ")}`);
	}
}

/* -------------------------------------------- */

/**
 * Apply migration rules to all Documents within a single Compendium pack.
 * Document transform failures are recoverable; pack.migrate() and lock restore are blocking.
 * @param {CompendiumCollection} pack  Pack to be migrated.
 * @param {object} [run]
 * @returns {Promise}
 */
export const migrateCompendium = async function(pack, run=null) {
	const documentName = pack.documentName;
	if ( !MIGRATABLE_COMPENDIUM_DOCUMENTS.includes(documentName) ) return;

	const ownsRun = !run;
	run ??= createMigrationRunState();
	const migrationData = await getMigrationData();
	const migrationVersion = getModule()?.flags?.needsMigrationVersion
		?? getModule()?.version
		?? "";

	run.summary.packsAttempted += 1;
	run.phase = "collect-pack";
	run.identity = {
		phase: run.phase,
		packId: pack.collection,
		documentType: documentName
	};
	const wasLocked = pack.locked;
	upsertPackLedger(run, {
		packId: pack.collection,
		documentName,
		initialLocked: wasLocked,
		unlockRequired: Boolean(wasLocked),
		foundryMigrateAttempted: true,
		foundryMigrateCompleted: false,
		sw5eTransformCompleted: false,
		sw5eUpdatesAttempted: false,
		sw5eUpdatesCompleted: false,
		finalLocked: wasLocked,
		failurePhase: "collect-pack"
	});

	await pack.configure({ locked: false });
	try {
		await pack.migrate();
		upsertPackLedger(run, {
			packId: pack.collection,
			foundryMigrateCompleted: true
		});
		run.foundryPackMigrateCompleted.push(pack.collection);
		applyMigrationTestHook("after-foundry-pack-migrate", run);

		const documents = await pack.getDocuments();
		upsertPackLedger(run, {
			packId: pack.collection,
			sw5eUpdatesAttempted: true,
			failurePhase: "write-pack"
		});
		for ( let doc of documents ) {
			const flags = { persistSourceMigration: false };
			const source = getExpandedMigrationSource(doc);
			const packContext = {
				phase: run.phase,
				packId: pack.collection,
				documentType: documentName,
				documentId: doc.id,
				documentName: doc.name
			};
			switch ( documentName ) {
				case "Actor":
					packContext.sourceContext = SOURCE_CONTEXT.COMPENDIUM_ACTOR_ITEM;
					packContext.actorId = doc.id;
					break;
				case "Item":
					packContext.sourceContext = SOURCE_CONTEXT.COMPENDIUM_ITEM;
					packContext.itemId = doc.id;
					break;
				case "Scene":
					packContext.sourceContext = SOURCE_CONTEXT.COMPENDIUM_SCENE_DELTA_ITEM;
					packContext.sceneId = doc.id;
					break;
				default:
					break;
			}
			run.identity = packContext;
			const candidate = tryBuildCandidate(run, () => {
				let updateData = {};
				switch ( documentName ) {
					case "Actor":
						updateData = migrateActorData(source, migrationData, flags, { actorUuid: doc.uuid, context: packContext });
						break;
					case "Item":
						updateData = migrateItemData(source, migrationData, flags, packContext);
						break;
					case "Scene":
						updateData = migrateSceneData(source, migrationData, packContext);
						break;
					case "JournalEntry":
						updateData = migrateJournalEntryData(source, migrationData);
						break;
					case "RollTable":
						updateData = migrateRollTableData(source, migrationData);
						break;
				}
				if ( foundry.utils.isEmpty(updateData) ) return null;
				const preparedUpdate = prepareMigratedSource(source, updateData, flags);
				return {
					documentType: documentName,
					documentId: doc.id,
					document: doc,
					beforeSource: source,
					preparedUpdate,
					writePayload: preparedUpdate,
					options: getDocumentUpdateOptions({
						valid: true,
						persistSourceMigration: flags.persistSourceMigration
					}),
					caller: `migrateCompendium:${pack.collection}`,
					persistSourceMigration: flags.persistSourceMigration,
					logName: doc.name,
					packCollection: pack.collection,
					sourceContext: packContext.sourceContext ?? null,
					actorId: packContext.actorId ?? null,
					itemId: packContext.itemId ?? null,
					sceneId: packContext.sceneId ?? null
				};
			});
			if ( candidate && isArtworkSafeCandidate(run, candidate, migrationVersion) ) {
				await writeCandidate(run, candidate);
				console.log(`Migrated ${documentName} document ${candidate.logName} in Compendium ${pack.collection}`);
			}
		}
		upsertPackLedger(run, {
			packId: pack.collection,
			sw5eTransformCompleted: true,
			sw5eUpdatesCompleted: true,
			failurePhase: null
		});
	} catch(err) {
		run.summary.packFailures += 1;
		upsertPackLedger(run, {
			packId: pack.collection,
			failurePhase: run.phase,
			finalLocked: pack.locked
		});
		throw err;
	} finally {
		await pack.configure({ locked: wasLocked });
		upsertPackLedger(run, { packId: pack.collection, finalLocked: pack.locked });
	}

	if ( ownsRun ) console.log(`Migrated all ${documentName} documents from Compendium ${pack.collection}`);
	else console.log(`Migrated all ${documentName} documents from Compendium ${pack.collection}`);
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
 * @param {boolean} [options.replaceExisting=false]            Replace matching _id documents instead of always creating.
 * @param {boolean} [options.includeCompendia=false]           Import world compendia present in payload.compendia.
 * @param {boolean} [options.dryRun=false]                     Run conversion analysis without creating/updating documents.
 * @returns {Promise<object>}                                  Conversion report.
 */
export async function convertLegacyWorldPayload(payload, {
	replaceExisting=false,
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

function _remapSuperiorityEffectKeys(effect, updateData) {
	return remapSuperiorityEffectKeys(effect, updateData);
}

/**
 * Migrate any active effects attached to the provided parent.
 * @param {object} parent           Data of the parent being migrated.
 * @param {object} [migrationData]  Additional data to perform the migration.
 * @returns {object[]}              Updates to apply on the embedded effects.
 */
export const migrateEffects = function(parent, migrationData) {
	if (!parent.effects) return {};
	return parent.effects.reduce((arr, e) => {
		const effectData = e instanceof CONFIG.ActiveEffect.documentClass
			? getExpandedMigrationSource(e)
			: e;
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
 * Whether an actor has at least one class item with non-none powercasting progression.
 * @param {object} actorData
 * @param {"force"|"tech"} castType
 * @returns {boolean}
 * @private
 */
function _actorHasPowercastingProgression(actorData, castType) {
	const progressionKey = castType === "force" ? "forceProgression" : "techProgression";
	for ( const item of actorData.items ?? [] ) {
		if ( item.type !== "class" ) continue;
		const levels = Number(item.system?.levels ?? 0);
		if ( !(levels >= 1) ) continue;
		const progression = item.system?.spellcasting?.[progressionKey];
		if ( progression && progression !== "none" ) return true;
	}
	return false;
}

/**
 * Clear stale persisted powercasting known.max overrides written as 0.
 * @param {object} actorData
 * @param {object} updateData
 * @returns {object}
 * @private
 */
function _migrateStalePowercastingKnownMax(actorData, updateData) {
	if ( actorData.type !== "character" ) return updateData;

	for ( const castType of ["force", "tech"] ) {
		const knownMax = foundry.utils.getProperty(actorData, `system.powercasting.${castType}.known.max`);
		if ( knownMax !== 0 ) continue;
		if ( !_actorHasPowercastingProgression(actorData, castType) ) continue;

		const path = `system.powercasting.${castType}.known.max`;
		foundry.utils.setProperty(updateData, path, null);
		foundry.utils.setProperty(actorData, path, null);
	}

	return updateData;
}

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
export const migrateActorData = function(actor, migrationData, flags={}, { actorUuid, context }={}) {
	const updateData = {};
	const actorContext = {
		...context,
		sourceContext: context?.sourceContext
			?? (context?.packId ? SOURCE_CONTEXT.COMPENDIUM_ACTOR_ITEM : SOURCE_CONTEXT.ACTOR_EMBEDDED_ITEM),
		actorId: context?.actorId ?? actor?._id ?? actor?.id ?? null,
		documentName: context?.documentName ?? actor?.name ?? null,
		phase: context?.phase ?? activeMigrationRun?.phase ?? null,
		packId: context?.packId ?? null
	};
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

	applyImagePathMigration(workingActor, updateData);
	_migrateObjectFlags(workingActor, updateData);
	_migrateStalePowercastingKnownMax(workingActor, updateData);
	_migrateStaleSuperiorityDiceMax(workingActor, updateData);
	_migrateOrphanCurrencyWallet(workingActor, updateData);
	_migrateStarshipFoodCurrentValue(workingActor, updateData);

	const embedsAreIdRefs = (
		(Array.isArray(workingActor.items) && workingActor.items.length > 0 && typeof workingActor.items[0] === "string")
		|| (Array.isArray(workingActor.effects) && workingActor.effects.length > 0 && typeof workingActor.effects[0] === "string")
	);
	if ( embedsAreIdRefs ) {
		migrateSw5eStarshipPrototypeToken(workingActor, updateData);
		return updateData;
	}

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
			migrateSw5eStarshipPrototypeToken(workingActor, null, { persistToSource: true });
			flags.persistSourceMigration = true;
			return workingActor;
		}
		migrateSw5eStarshipPrototypeToken(workingActor, updateData);
		return updateData;
	}

	const items = workingActor.items.reduce((arr, i) => {
		// Migrate the Owned Item
		const itemData = i instanceof CONFIG.Item.documentClass ? getExpandedMigrationSource(i) : i;
		const itemFlags = { persistSourceMigration: false };
		let itemUpdate = migrateItemData(itemData, migrationData, itemFlags, {
			...actorContext,
			itemId: itemData?._id ?? itemData?.id ?? null,
			itemType: itemData?.type ?? null,
			documentType: "Item",
			documentId: itemData?._id ?? itemData?.id ?? null,
			documentName: itemData?.name ?? null,
			parentDocumentId: actorContext.actorId
		});
		applyUpdateData(itemData, itemUpdate);

		// Update the Owned Item
		if ( itemFlags.persistSourceMigration ) requiresFullSourceMigration = true;
		if ( !foundry.utils.isEmpty(itemUpdate) && !requiresFullSourceMigration ) {
			arr.push({ ...itemUpdate, _id: itemData._id });
		}

		// Keep workingActor.items aligned when itemData is a clone from a Document.
		if ( itemData !== i && Array.isArray(workingActor.items) ) {
			const idx = workingActor.items.findIndex(entry => (entry?._id ?? entry) === itemData._id);
			if ( idx >= 0 ) workingActor.items[idx] = itemData;
		}

		return arr;
	}, []);

	if ( requiresFullSourceMigration ) {
		migrateSw5eStarshipPrototypeToken(workingActor, null, { persistToSource: true });
		flags.persistSourceMigration = true;
		return workingActor;
	}

	migrateSw5eStarshipPrototypeToken(workingActor, updateData);
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
export function migrateItemData(item, migrationData, flags={}, context={}) {
	const itemContext = resolveItemContext(flags, context, item);
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

	applyImagePathMigration(workingItem, updateData);
	_migrateDescriptionLinks(workingItem, updateData);
	_migrateObjectFlags(workingItem, updateData);
	_migrateItemProperties(workingItem, updateData);
	_migrateSpellScaling(workingItem, updateData);
	_migrateAdvancements(workingItem, updateData, itemContext);
	_migrateWeaponData(workingItem, updateData);
	_migrateBlasterAmmoData(workingItem, updateData);
	_migratePriceDenomination(workingItem, updateData);
	_migrateManeuverHealFormulas(workingItem, updateData);

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
	applyImagePathMigration(effect, updateData);
	_remapSuperiorityEffectKeys(effect, updateData);
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
	applyImagePathMigration(macro, updateData);
	_migrateObjectFlags(macro, updateData);
	if ( typeof macro.command === "string" ) {
		const normalized = normalizeLegacyContentString(macro.command);
		if ( normalized !== macro.command ) updateData.command = normalized;
	}
	if ( macro.flags ) {
		const normalizedFlags = normalizeCompendiumReferences(foundry.utils.deepClone(macro.flags), { moduleId: getModuleId() });
		if ( !valuesEqual(normalizedFlags, macro.flags) ) updateData.flags = normalizedFlags;
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
	applyImagePathMigration(table, updateData);
	_migrateObjectFlags(table, updateData);

	if ( Array.isArray(table.results) ) {
		const results = table.results.reduce((arr, result) => {
			const resultData = result instanceof foundry.abstract.DataModel ? result.toObject() : foundry.utils.deepClone(result);
			const resultUpdate = {};
			applyImagePathMigration(resultData, resultUpdate);
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
	applyImagePathMigration(journal, updateData);
	_migrateObjectFlags(journal, updateData);

	if ( Array.isArray(journal.pages) ) {
		const pages = journal.pages.reduce((arr, page) => {
			const pageData = page instanceof foundry.abstract.DataModel ? page.toObject() : foundry.utils.deepClone(page);
			const pageUpdate = {};
			applyImagePathMigration(pageData, pageUpdate);
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
export const migrateSceneData = function(scene, migrationData, context={}) {
	const sceneContext = {
		...context,
		sourceContext: context.sourceContext
			?? (context.packId ? SOURCE_CONTEXT.COMPENDIUM_SCENE_DELTA_ITEM : SOURCE_CONTEXT.SCENE_ACTOR_DELTA_ITEM),
		sceneId: context.sceneId ?? scene?._id ?? scene?.id ?? null,
		documentName: context.documentName ?? scene?.name ?? null,
		documentType: "Scene",
		packId: context.packId ?? null,
		phase: context.phase ?? activeMigrationRun?.phase ?? null
	};
	const tokens = scene.tokens.reduce((arr, token) => {
		const t = token instanceof foundry.abstract.DataModel ? token.toObject() : token;
		const update = {};
		applyImagePathMigration(t, update);
		_migrateObjectFlags(t, update);
		if ( !game.actors.has(t.actorId) ) update.actorId = null;
		const deltaSource = (!t.actorLink && t.actorId) ? getTokenActorDeltaSource(t) : null;
		if ( deltaSource ) {
			const actorFlags = { persistSourceMigration: false };
			const actorUpdate = migrateActorData(deltaSource, migrationData, actorFlags, {
				context: {
					...sceneContext,
					tokenId: t._id ?? t.id ?? null,
					actorLink: t.actorLink ?? false,
					actorId: t.actorId ?? null,
					actorDeltaPresent: true,
					parentDocumentId: sceneContext.sceneId
				}
			});
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
	const plainUpdate = unwrapForcedReplacementsDeep(updateData);
	foundry.utils.mergeObject(target, foundry.utils.expandObject(plainUpdate), { inplace: true });
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
	return cleanEffectAdvancementSupplantedChanges(effect, updateData, parent);
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

	if (itemData.system?.scaling === "power") updateData["system.scaling"] = "spell";

	return updateData;
}

/**
 * Migrate advancement data from the sw5e test module or the old system.
 * @param {object} itemData        Item data to migrate.
 * @param {object} updateData      Existing update to expand upon.
 * @returns {object}               The updateData to apply
 * @private
 */
function _migrateAdvancements(itemData, updateData, context={}) {
	const shape = describeItemSystemShape(itemData);
	if ( !shape.hasSystem ) {
		emitMissingSystemDiagnostic(activeMigrationRun, context, itemData, shape);
		return updateData;
	}
	if ( !shape.advancementDefined ) return updateData;

	const { form, entries } = getAdvancementEntries(itemData.system.advancement);
	if ( form === "malformed" || !entries ) {
		const identity = buildBoundedIdentity(context, itemData, shape);
		console.warn("SW5E MODULE | Malformed advancement value skipped", {
			...identity,
			advancementType: typeof itemData.system.advancement
		});
		return updateData;
	}

	let changed = false;
	const moduleId = getModuleId();
	for (const adv of entries) {
		if ( !adv || typeof adv !== "object" ) continue;
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
			if ( !Array.isArray(adv.configuration[field]) ) continue;
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
	if ( changed ) {
		const advancementValue = form === "object" ? itemData.system.advancement : entries;
		// Foundry 14: force-replace advancement (never emit legacy ==advancement keys).
		updateData["system.advancement"] = createForcedReplacement(advancementValue);
	}

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

function _migrateBlasterAmmoData(itemData, updateData) {
	return migrateBlasterWeaponData(itemData, updateData);
}
