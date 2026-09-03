/**
 * Bounded SW5E migration identity and missing-system diagnostics.
 * Does not invent system or advancement data. Does not log private campaign text.
 */

export const SOURCE_CONTEXT = Object.freeze({
	WORLD_ITEM: "world-item",
	ACTOR_EMBEDDED_ITEM: "actor-embedded-item",
	SCENE_ACTOR_DELTA_ITEM: "scene-actor-delta-item",
	COMPENDIUM_ITEM: "compendium-item",
	COMPENDIUM_ACTOR_ITEM: "compendium-actor-item",
	COMPENDIUM_SCENE_DELTA_ITEM: "compendium-scene-delta-item"
});

export const MISSING_SYSTEM_CLASS = Object.freeze({
	LEGACY_SPARSE_DELTA: "legacy-or-nonstandard-sparse-source",
	FULL_ITEM_OMISSION: "legacy-or-malformed-full-source-omission"
});

const SCENE_DELTA_CONTEXTS = new Set([
	SOURCE_CONTEXT.SCENE_ACTOR_DELTA_ITEM,
	SOURCE_CONTEXT.COMPENDIUM_SCENE_DELTA_ITEM
]);

/**
 * @param {object} [itemData]
 * @returns {{ hasSystem: boolean, hasAdvancementParent: boolean, advancementDefined: boolean }}
 */
export function describeItemSystemShape(itemData) {
	const system = itemData?.system;
	const hasSystem = system !== undefined && system !== null && typeof system === "object";
	const advancementDefined = hasSystem && system.advancement !== undefined;
	return {
		hasSystem,
		hasAdvancementParent: hasSystem,
		advancementDefined
	};
}

/**
 * @param {unknown} advancement
 * @returns {{ form: "absent"|"array"|"object"|"malformed", entries: object[]|null }}
 */
export function getAdvancementEntries(advancement) {
	if ( advancement === undefined || advancement === null ) {
		return { form: "absent", entries: null };
	}
	if ( Array.isArray(advancement) ) {
		return { form: "array", entries: advancement };
	}
	if ( typeof advancement === "object" ) {
		return { form: "object", entries: Object.values(advancement) };
	}
	return { form: "malformed", entries: null };
}

export function isSceneActorDeltaContext(sourceContext) {
	return SCENE_DELTA_CONTEXTS.has(sourceContext);
}

export function classifyMissingSystem(sourceContext) {
	if ( isSceneActorDeltaContext(sourceContext) ) return MISSING_SYSTEM_CLASS.LEGACY_SPARSE_DELTA;
	return MISSING_SYSTEM_CLASS.FULL_ITEM_OMISSION;
}

export function createDiagnosticDedupe() {
	return new Map();
}

/**
 * @param {object} [context]
 * @param {object} [itemData]
 * @param {object} [shape]
 * @returns {object}
 */
export function buildBoundedIdentity(context={}, itemData={}, shape=null) {
	const resolvedShape = shape ?? describeItemSystemShape(itemData);
	return {
		phase: context.phase ?? null,
		sourceContext: context.sourceContext ?? null,
		packId: context.packId ?? null,
		documentType: context.documentType ?? "Item",
		documentId: context.documentId ?? itemData?._id ?? itemData?.id ?? null,
		documentName: context.documentName ?? itemData?.name ?? null,
		parentDocumentId: context.parentDocumentId ?? context.actorId ?? context.sceneId ?? null,
		sceneId: context.sceneId ?? null,
		tokenId: context.tokenId ?? null,
		actorLink: context.actorLink ?? null,
		actorId: context.actorId ?? null,
		actorDeltaPresent: context.actorDeltaPresent ?? null,
		itemId: context.itemId ?? itemData?._id ?? itemData?.id ?? null,
		itemType: context.itemType ?? itemData?.type ?? null,
		hasSystem: resolvedShape.hasSystem,
		hasAdvancementParent: resolvedShape.hasAdvancementParent,
		advancementDefined: resolvedShape.advancementDefined
	};
}

function missingSystemDedupeKey(classification, context, itemData) {
	return [
		classification,
		context?.sourceContext ?? "unknown",
		context?.packId ?? "world",
		itemData?.type ?? "unknown"
	].join("|");
}

/**
 * Emit one bounded diagnostic per legacy shape. Does not throw.
 * @param {object} [run]
 * @param {object} [context]
 * @param {object} [itemData]
 * @param {object} [shape]
 * @returns {object}
 */
export function emitMissingSystemDiagnostic(run, context, itemData, shape) {
	const classification = classifyMissingSystem(context?.sourceContext);
	const severity = classification === MISSING_SYSTEM_CLASS.FULL_ITEM_OMISSION ? "error" : "warn";
	const identity = buildBoundedIdentity(context, itemData, shape);
	const key = missingSystemDedupeKey(classification, context, itemData);
	const dedupe = run?.diagnostics ?? createDiagnosticDedupe();
	if ( run && !run.diagnostics ) run.diagnostics = dedupe;
	const prior = dedupe.get(key);
	if ( prior ) {
		prior.count += 1;
		return { emitted: false, duplicate: true, severity, classification, identity, count: prior.count };
	}
	const record = {
		classification,
		severity,
		identity,
		count: 1,
		note: classification === MISSING_SYSTEM_CLASS.LEGACY_SPARSE_DELTA
			? "Safely preserved legacy or nonstandard sparse source. Advancement migration is not applicable without system."
			: "Full Item source omitted system. Source preserved unchanged. Advancement migration is not applicable."
	};
	dedupe.set(key, record);
	const logger = severity === "error" ? console.error : console.warn;
	logger("SW5E MODULE | Missing item.system during advancement migration", record);
	if ( Array.isArray(run?.missingSystemDiagnostics) ) run.missingSystemDiagnostics.push(record);
	return { emitted: true, duplicate: false, severity, classification, identity, count: 1 };
}

function createEmptyAutoThrustersRemediationSummary() {
	return {
		actorsScanned: 0,
		candidatesFound: 0,
		matched: 0,
		notAffected: 0,
		alreadyCorrect: 0,
		updateRequested: 0,
		updateSucceeded: 0,
		updateVerified: 0,
		deleteRequested: 0,
		deleteSucceeded: 0,
		deleteVerified: 0,
		updatedVerified: 0,
		skipped: 0,
		ambiguous: 0,
		unexpandedInput: 0,
		barrierFailed: 0,
		updateFailed: 0,
		deleteFailed: 0,
		postconditionFailed: 0,
		laterOverwrite: 0
	};
}

function createEmptyBwingResourceSummary() {
	return {
		actorsScanned: 0,
		matched: 0,
		notBwing: 0,
		alreadyCanonical: 0,
		updateRequested: 0,
		updateSucceeded: 0,
		updateVerified: 0,
		updatedVerified: 0,
		ambiguous: 0,
		updateFailed: 0,
		postconditionFailed: 0
	};
}

function createEmptyMigrationSummary() {
	return {
		documentsAttempted: 0,
		documentsUpdated: 0,
		documentsUnchanged: 0,
		expectedLegacyNoOps: 0,
		documentFailures: 0,
		packsAttempted: 0,
		packFailures: 0,
		artworkInvariantSkips: 0,
		collectionLossSkips: 0,
		dnd5eBarrier: null,
		autoThrusters: createEmptyAutoThrustersRemediationSummary(),
		bwingResources: createEmptyBwingResourceSummary(),
		completionState: "pending",
		stampSkippedReason: null,
		stampPersisted: false
	};
}

/**
 * Whether remediation accounting blocks a clean success.
 * @param {object} [summary]
 * @returns {number}
 */
export function countBlockingAutoThrustersRemediationResults(summary={}) {
	const at = summary?.autoThrusters ?? {};
	return Number(at.unexpandedInput ?? 0)
		+ Number(at.barrierFailed ?? 0)
		+ Number(at.postconditionFailed ?? 0)
		+ Number(at.laterOverwrite ?? 0);
}

/**
 * @param {object} [summary]
 * @returns {number}
 */
export function countContinuableAutoThrustersResults(summary={}) {
	const at = summary?.autoThrusters ?? {};
	return Number(at.ambiguous ?? 0)
		+ Number(at.updateFailed ?? 0)
		+ Number(at.deleteFailed ?? 0);
}

/**
 * @param {object} [summary]
 * @returns {number}
 */
export function countBlockingBwingResourceResults(summary={}) {
	const br = summary?.bwingResources ?? {};
	return Number(br.postconditionFailed ?? 0);
}

/**
 * @param {object} [summary]
 * @returns {number}
 */
export function countContinuableBwingResourceResults(summary={}) {
	const br = summary?.bwingResources ?? {};
	return Number(br.ambiguous ?? 0)
		+ Number(br.updateFailed ?? 0);
}

/**
 * @param {object} [summary]
 * @returns {boolean}
 */
export function hasBlockingMigrationOutcome(summary={}) {
	if ( summary?.dnd5eBarrier && summary.dnd5eBarrier.required && !summary.dnd5eBarrier.passed ) return true;
	if ( Number(summary?.documentFailures ?? 0) > 0 ) return true;
	if ( Number(summary?.packFailures ?? 0) > 0 ) return true;
	if ( countBlockingAutoThrustersRemediationResults(summary) > 0 ) return true;
	if ( countBlockingBwingResourceResults(summary) > 0 ) return true;
	return false;
}

/**
 * @param {object} [summary]
 * @returns {boolean}
 */
export function hasContinuableActorLevelErrors(summary={}) {
	return countContinuableAutoThrustersResults(summary) > 0
		|| countContinuableBwingResourceResults(summary) > 0
		|| Number(summary?.documentFailures ?? 0) > 0;
}

/**
 * Record one Actor Auto-Thrusters remediation result into the migration run summary.
 * @param {object} run
 * @param {object} result
 */
export function recordAutoThrustersRemediationResult(run, result={}) {
	if ( !run ) return;
	if ( !run.summary ) run.summary = createEmptyMigrationSummary();
	if ( !run.summary.autoThrusters ) run.summary.autoThrusters = createEmptyAutoThrustersRemediationSummary();
	const at = run.summary.autoThrusters;
	at.actorsScanned += 1;
	const classification = result.classification ?? null;

	switch ( classification ) {
		case "NOT_AFFECTED":
			at.notAffected += 1;
			at.skipped += 1;
			return;
		case "MATCHED":
			at.candidatesFound += 1;
			at.matched += 1;
			return;
		case "ALREADY_CORRECT":
			at.candidatesFound += 1;
			at.matched += 1;
			at.alreadyCorrect += 1;
			return;
		case "UPDATED_VERIFIED":
			at.candidatesFound += 1;
			at.matched += 1;
			if ( result.updateRequested ) at.updateRequested += 1;
			if ( result.updateSucceeded ) at.updateSucceeded += 1;
			if ( result.updateVerified ) at.updateVerified += 1;
			if ( result.deleteRequested ) at.deleteRequested += 1;
			if ( result.deleteSucceeded ) at.deleteSucceeded += 1;
			if ( result.deleteVerified ) at.deleteVerified += 1;
			at.updatedVerified += 1;
			return;
		case "AMBIGUOUS":
			at.candidatesFound += 1;
			at.ambiguous += 1;
			return;
		case "UNEXPANDED_INPUT":
			at.unexpandedInput += 1;
			return;
		case "DND5E_BARRIER_FAILED":
			at.barrierFailed += 1;
			return;
		case "UPDATE_FAILED":
			at.candidatesFound += 1;
			at.matched += 1;
			if ( result.updateRequested ) at.updateRequested += 1;
			at.updateFailed += 1;
			return;
		case "DELETE_FAILED":
			at.candidatesFound += 1;
			at.matched += 1;
			if ( result.updateRequested ) at.updateRequested += 1;
			if ( result.updateSucceeded ) at.updateSucceeded += 1;
			if ( result.updateVerified ) at.updateVerified += 1;
			if ( result.deleteRequested ) at.deleteRequested += 1;
			at.deleteFailed += 1;
			return;
		case "POSTCONDITION_FAILED":
			at.candidatesFound += 1;
			at.matched += 1;
			at.postconditionFailed += 1;
			return;
		case "LATER_OVERWRITE":
			at.laterOverwrite += 1;
			return;
		default:
			if ( result.failed ) at.unexpandedInput += 1;
			else at.skipped += 1;
	}
}

/**
 * @param {object} run
 * @param {object} result
 */
export function recordBwingResourceRemediationResult(run, result={}) {
	if ( !run ) return;
	if ( !run.summary ) run.summary = createEmptyMigrationSummary();
	if ( !run.summary.bwingResources ) run.summary.bwingResources = createEmptyBwingResourceSummary();
	const br = run.summary.bwingResources;
	br.actorsScanned += 1;
	switch ( result.classification ) {
		case "NOT_BWING":
			br.notBwing += 1;
			return;
		case "MATCHED":
			br.matched += 1;
			return;
		case "ALREADY_CANONICAL":
			br.matched += 1;
			br.alreadyCanonical += 1;
			return;
		case "RESOURCE_UPDATED_VERIFIED":
			br.matched += 1;
			if ( result.updateRequested ) br.updateRequested += 1;
			if ( result.updateSucceeded ) br.updateSucceeded += 1;
			if ( result.updateVerified ) br.updateVerified += 1;
			br.updatedVerified += 1;
			return;
		case "RESOURCE_AMBIGUOUS":
			br.matched += 1;
			br.ambiguous += 1;
			return;
		case "RESOURCE_UPDATE_FAILED":
			br.matched += 1;
			if ( result.updateRequested ) br.updateRequested += 1;
			br.updateFailed += 1;
			return;
		case "RESOURCE_POSTCONDITION_FAILED":
			br.matched += 1;
			br.postconditionFailed += 1;
			return;
		default:
			return;
	}
}

export function createMigrationRunState() {
	return {
		phase: "collect-world",
		identity: {},
		packLedger: [],
		diagnostics: createDiagnosticDedupe(),
		missingSystemDiagnostics: [],
		sw5eWritesBegun: false,
		sw5eWritesCompleted: false,
		foundryPackMigrateCompleted: [],
		summary: createEmptyMigrationSummary(),
		documentFailures: [],
		documentFailureKeys: new Set(),
		remediationResults: [],
		bwingResults: []
	};
}

function documentFailureDedupeKey(record) {
	return [
		record.phase ?? "",
		record.sourceContext ?? "",
		record.packId ?? "",
		record.documentType ?? "",
		record.documentId ?? "",
		record.originalMessage ?? ""
	].join("|");
}

/**
 * Record a recoverable document-level migration failure. Does not throw.
 * Preserves the original error and stack. Deduplicates repeated copies.
 * @param {object} run
 * @param {Error|unknown} err
 * @param {object} [identity]
 * @returns {object}
 */
export function recordDocumentFailure(run, err, identity={}) {
	const original = err?.originalError ?? err?.cause ?? err;
	const record = {
		phase: identity.phase ?? run?.phase ?? null,
		sourceContext: identity.sourceContext ?? null,
		packId: identity.packId ?? identity.collectionId ?? null,
		collectionId: identity.collectionId ?? identity.packId ?? null,
		documentType: identity.documentType ?? null,
		documentId: identity.documentId ?? identity.itemId ?? identity.actorId ?? identity.sceneId ?? null,
		documentName: identity.documentName ?? null,
		parentDocumentId: identity.parentDocumentId ?? identity.actorId ?? identity.sceneId ?? null,
		sceneId: identity.sceneId ?? null,
		tokenId: identity.tokenId ?? null,
		actorId: identity.actorId ?? null,
		itemId: identity.itemId ?? null,
		originalError: original instanceof Error ? original : null,
		originalMessage: original?.message ?? String(err),
		originalStack: original?.stack ?? err?.stack ?? null,
		count: 1
	};
	if ( !run ) {
		console.error("SW5E MODULE | Document migration failed", record);
		return record;
	}
	if ( !Array.isArray(run.documentFailures) ) run.documentFailures = [];
	if ( !(run.documentFailureKeys instanceof Set) ) run.documentFailureKeys = new Set();
	if ( !run.summary ) run.summary = createEmptyMigrationSummary();
	const key = documentFailureDedupeKey(record);
	if ( run.documentFailureKeys.has(key) ) {
		const prior = run.documentFailures.find(row => documentFailureDedupeKey(row) === key);
		if ( prior ) prior.count += 1;
		run.summary.documentFailures = run.documentFailures.length;
		return prior ?? record;
	}
	run.documentFailureKeys.add(key);
	run.documentFailures.push(record);
	run.summary.documentFailures = run.documentFailures.length;
	console.error("SW5E MODULE | Document migration failed", record);
	return record;
}

/**
 * @param {object} run
 * @param {object} entry
 */
export function upsertPackLedger(run, entry) {
	if ( !run ) return entry;
	const existing = run.packLedger.find(row => row.packId === entry.packId);
	if ( existing ) {
		Object.assign(existing, entry);
		return existing;
	}
	run.packLedger.push(entry);
	return entry;
}
