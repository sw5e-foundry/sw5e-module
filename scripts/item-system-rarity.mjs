/**
 * dnd5e 6.0 physical-item rarity: persisted `system.rarities` SetField.
 * The `system.rarity` getter still returns the first rarity on prepared documents.
 * Leftover `system.rarity` strings remain on unmigrated pack source until TARGET_DND5E_VERSION is 6.0.0.
 */

/**
 * Canonical dnd5e rarity key from a live Item, index row, or pack-like object.
 * Prefers `system.rarities`; falls back to leftover `system.rarity` string or `{ value }`.
 * @param {object|null|undefined} item
 * @returns {string}
 */
export function getItemSystemRarityKey(item) {
	const sys = item?.system ?? {};
	const fromRarities = firstRarityFromCollection(sys.rarities);
	if ( fromRarities ) return fromRarities;
	return normalizeRarityScalar(sys.rarity);
}

/**
 * 6.0 persist payload for a chassis/item rarity upgrade.
 * @param {string} dndRarityKey
 * @returns {string[]}
 */
export function itemSystemRaritiesUpdateValue(dndRarityKey) {
	const key = typeof dndRarityKey === "string" ? dndRarityKey.trim() : "";
	return key ? [key] : [];
}

/**
 * Compendium-browser clauses matching dnd5e's dual rarity predicates.
 * @param {string[]} values
 * @returns {object[]}
 */
export function physicalItemRarityBrowserClauses(values) {
	const rarities = (Array.isArray(values) ? values : []).filter(v => v);
	if ( !rarities.length ) {
		return [
			{ k: "system.rarities", o: "empty" },
			{ k: "system.rarity", o: "empty" }
		];
	}
	return [
		{ k: "system.rarities", o: "hasany", v: rarities },
		{ k: "system.rarity", o: "in", v: rarities }
	];
}

/**
 * @param {unknown} collection
 * @returns {string}
 */
function firstRarityFromCollection(collection) {
	if ( collection == null ) return "";
	if ( typeof collection.first === "function" ) {
		return normalizeRarityScalar(collection.first());
	}
	if ( collection instanceof Set ) {
		return normalizeRarityScalar([...collection][0]);
	}
	if ( Array.isArray(collection) ) {
		return normalizeRarityScalar(collection[0]);
	}
	return "";
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeRarityScalar(raw) {
	if ( raw == null ) return "";
	if ( typeof raw === "string" ) return raw;
	if ( typeof raw === "object" && !Array.isArray(raw) && !(raw instanceof Set) ) {
		return typeof raw.value === "string" ? raw.value : "";
	}
	return "";
}
