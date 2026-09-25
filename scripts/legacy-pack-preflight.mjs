import {
	getLegacyItemTypeTarget,
	normalizeLegacyMasterItemSource
} from "./dnd5e-source-normalization.mjs";

const LEGACY_INDEX_FIELDS = ["name", "type", "system"];
const BATCH_SIZE = 25;

/** Read only the pack index, which does not instantiate invalid Item documents. */
export async function analyzeLegacyItemPack(pack) {
	if ( pack.documentName !== "Item" || pack.metadata?.packageType !== "world" ) return [];
	const index = await pack.getIndex({ fields: LEGACY_INDEX_FIELDS });
	return index.filter(entry => {
		const target = getLegacyItemTypeTarget(entry.type);
		return target && target !== entry.type;
	}).map(entry => ({
		id: entry._id,
		name: entry.name,
		from: entry.type,
		to: getLegacyItemTypeTarget(entry.type),
		system: entry.system
	}));
}

export async function analyzeLegacyItemPacks(packs=game.packs) {
	const results = [];
	for ( const pack of packs ) {
		const entries = await analyzeLegacyItemPack(pack);
		if ( entries.length ) results.push({ packId: pack.collection, entries });
	}
	return results;
}

/**
 * Repair the document envelope before pack.migrate() hydrates obsolete types.
 * The caller owns the pack lock. Each batch is checked: Foundry can log individual
 * validation errors without rejecting updateDocuments.
 */
export async function repairLegacyItemPack(pack, entries) {
	if ( !entries.length ) return 0;
	if ( pack.locked ) throw new Error(`Cannot repair locked Compendium ${pack.collection}`);
	const DocumentClass = pack.documentClass ?? CONFIG.Item.documentClass;
	let repaired = 0;
	for ( let offset = 0; offset < entries.length; offset += BATCH_SIZE ) {
		const batch = entries.slice(offset, offset + BATCH_SIZE);
		const updates = batch.map(entry => {
			if ( !entry.system || typeof entry.system !== "object" || Array.isArray(entry.system) ) {
				throw new Error(`Missing indexed system data for ${pack.collection}:${entry.id}; no changes made to this batch`);
			}
			const source = { type: entry.from, system: foundry.utils.deepClone(entry.system) };
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
	// The index is updated by Foundry's document updates. Hydration below is the
	// final check before allowing the normal pack migration to proceed.
	for ( const entry of entries ) {
		const doc = await pack.getDocument(entry.id);
		if ( doc?.type !== entry.to ) {
			throw new Error(`Legacy Item ${pack.collection}:${entry.id} still cannot be loaded as ${entry.to}`);
		}
	}
	return repaired;
}
