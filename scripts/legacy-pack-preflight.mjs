import {
	getLegacyItemTypeTarget,
	normalizeLegacyMasterItemSource
} from "./dnd5e-source-normalization.mjs";

const LEGACY_INDEX_FIELDS = ["name", "type", "system"];
const BATCH_SIZE = 25;

function cloneData(value) {
	const clone = foundry?.utils?.deepClone ?? structuredClone;
	return clone(value);
}

function collectionIds(value) {
	if ( !value || typeof value !== "object" ) return [];
	if ( Array.isArray(value) ) return value.map((entry, index) => entry?._id ?? String(index));
	return Object.keys(value);
}

function preservationStatus(before, after) {
	const beforeIds = collectionIds(before);
	const afterIds = collectionIds(after);
	if ( !beforeIds.length && !afterIds.length ) return "absent";
	const kept = beforeIds.every(id => afterIds.includes(id));
	return kept ? "preserved" : "lost";
}

function inspectEntry(entry) {
	const target = getLegacyItemTypeTarget(entry.type);
	if ( !target || target === entry.type ) return null;
	const system = entry.system;
	const hasSystem = Boolean(system) && typeof system === "object" && !Array.isArray(system);
	let activities = "absent";
	let advancement = "absent";
	if ( hasSystem ) {
		const preview = { type: entry.type, system: cloneData(system) };
		normalizeLegacyMasterItemSource(preview);
		activities = preservationStatus(system.activities, preview.system?.activities);
		advancement = preservationStatus(system.advancement, preview.system?.advancement);
	}
	return {
		id: entry._id,
		name: entry.name ?? "",
		from: entry.type,
		to: target,
		system,
		activities,
		advancement,
		failure: hasSystem ? null : "missing-system"
	};
}

/**
 * Read only the pack index. Locked or non-world packs are reported and not repaired.
 * @param {Compendium} pack
 */
export async function analyzeLegacyItemPack(pack) {
	const packId = pack?.collection ?? "";
	const base = {
		packId,
		inspected: 0,
		documentsRequiringRepair: 0,
		entries: [],
		failures: [],
		skipped: false,
		skipReason: null
	};
	if ( pack?.documentName !== "Item" || pack?.metadata?.packageType !== "world" ) {
		return { ...base, skipped: true, skipReason: "not-world-item-pack" };
	}
	if ( pack.locked ) {
		return { ...base, skipped: true, skipReason: "locked" };
	}
	const index = await pack.getIndex({ fields: LEGACY_INDEX_FIELDS });
	const indexed = [...index];
	const entries = [];
	const failures = [];
	for ( const entry of indexed ) {
		const inspected = inspectEntry(entry);
		if ( !inspected ) continue;
		if ( inspected.failure ) failures.push({ id: inspected.id, name: inspected.name, failure: inspected.failure });
		if ( inspected.activities === "lost" || inspected.advancement === "lost" ) {
			failures.push({
				id: inspected.id,
				name: inspected.name,
				failure: `preservation-${inspected.activities === "lost" ? "activities" : "advancement"}`
			});
		}
		entries.push(inspected);
	}
	return {
		...base,
		inspected: indexed.length,
		documentsRequiringRepair: entries.length,
		entries,
		failures
	};
}

export async function analyzeLegacyItemPacks(packs=game.packs) {
	const results = [];
	for ( const pack of packs ) {
		if ( pack?.documentName !== "Item" || pack?.metadata?.packageType !== "world" ) continue;
		results.push(await analyzeLegacyItemPack(pack));
	}
	return results;
}

/**
 * Repair the document envelope before pack.migrate() hydrates obsolete types.
 * The caller owns the pack lock. Each batch is checked before the next one starts.
 */
export async function repairLegacyItemPack(pack, entries) {
	if ( !entries.length ) return 0;
	if ( pack.locked ) throw new Error(`Cannot repair locked Compendium ${pack.collection}`);
	const blocking = entries.filter(entry => entry.failure || entry.activities === "lost" || entry.advancement === "lost");
	if ( blocking.length ) {
		throw new Error(`Legacy Item repair refused in ${pack.collection}: ${blocking.map(entry => entry.id).join(", ")}`);
	}
	const DocumentClass = pack.documentClass ?? CONFIG.Item.documentClass;
	let repaired = 0;
	for ( let offset = 0; offset < entries.length; offset += BATCH_SIZE ) {
		const batch = entries.slice(offset, offset + BATCH_SIZE);
		const updates = batch.map(entry => {
			if ( !entry.system || typeof entry.system !== "object" || Array.isArray(entry.system) ) {
				throw new Error(`Missing indexed system data for ${pack.collection}:${entry.id}; no changes made to this batch`);
			}
			const source = { type: entry.from, system: cloneData(entry.system) };
			normalizeLegacyMasterItemSource(source);
			if ( source.type !== entry.to ) {
				throw new Error(`Unexpected Item type mapping for ${pack.collection}:${entry.id}`);
			}
			return { _id: entry.id, type: source.type, system: source.system };
		});
		const result = await DocumentClass.updateDocuments(updates, {
			pack: pack.collection,
			diff: false,
			recursive: false,
			enforceTypes: false,
			render: false
		});
		const returned = new Map((result ?? []).map(doc => [doc.id ?? doc._id, doc.type]));
		const missing = batch.filter(entry => returned.get(entry.id) !== entry.to);
		if ( missing.length ) {
			throw new Error(`Legacy Item repair incomplete in ${pack.collection}: ${missing.map(entry => entry.id).join(", ")}`);
		}
		repaired += batch.length;
	}
	for ( const entry of entries ) {
		const doc = await pack.getDocument(entry.id);
		if ( doc?.type !== entry.to ) {
			throw new Error(`Legacy Item ${pack.collection}:${entry.id} still cannot be loaded as ${entry.to}`);
		}
	}
	return repaired;
}

export function formatLegacyPackReport(results) {
	if ( !results?.length ) return "No world Item packs were found.";
	return results.map(row => {
		if ( row.skipped ) return `${row.packId}: skipped (${row.skipReason})`;
		const failureText = row.failures?.length ? `; failures ${row.failures.length}` : "";
		return `${row.packId}: inspected ${row.inspected}, repair ${row.documentsRequiringRepair}${failureText}`;
	}).join("\n");
}
