/**
 * Synthetic aggregation of installed chassis modification Active Effect changes.
 * Mod items keep transfer:false; bonuses apply when installed on an active host item.
 */
import { getChassis, normalizeChassis } from "./chassis.mjs";
import { cloneEffectsSnapshot } from "./chassis-effect-snapshot.mjs";

const ABILITY_KEYS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
const MODE_ADD = 2;

/** @type {ReadonlySet<string>} */
export const INSTALLED_MOD_SUPPORTED_BONUS_KEYS = new Set([
	"system.bonuses.force.attack",
	"system.bonuses.tech.attack",
	"system.bonuses.mpak.attack",
	"system.bonuses.rpak.attack",
	...ABILITY_KEYS.flatMap(ab => [
		`system.bonuses.force.save.${ab}.dc`,
		`system.bonuses.tech.save.${ab}.dc`
	])
]);

/** @type {Map<string, object[]>} mod item uuid → effects snapshot */
const modEffectsCache = new Map();

export { cloneEffectsSnapshot };

/**
 * @param {object} hostItem
 * @returns {boolean}
 */
export function isChassisHostItemActive(hostItem) {
	if ( !hostItem?.parent && !hostItem?.actor ) return false;

	const chassis = getChassis(hostItem);
	if ( !chassis?.enabled ) return false;
	if ( !Array.isArray(chassis.installedMods) || !chassis.installedMods.length ) return false;

	if ( requiresHostEquipped(hostItem) && !isHostEquipped(hostItem) ) return false;
	if ( requiresHostAttunement(hostItem) && !isHostAttuned(hostItem) ) return false;
	if ( chassis.attunement?.required && !isHostAttuned(hostItem) ) return false;

	return true;
}

/**
 * @param {object} item
 */
function requiresHostEquipped(item) {
	const type = item?.type;
	return type === "weapon" || type === "equipment" || type === "consumable";
}

/**
 * @param {object} item
 */
function isHostEquipped(item) {
	return Boolean(item?.system?.equipped);
}

/**
 * @param {object} item
 */
function requiresHostAttunement(item) {
	const declared = item?.system?.attunement ?? item?._source?.attunement;
	return declared === "required";
}

/**
 * @param {object} item
 */
function isHostAttuned(item) {
	return Boolean(item?.system?.attuned);
}

/**
 * @param {object} installedEntry
 * @returns {object[]}
 */
function getEffectsSnapshotForInstalledEntry(installedEntry) {
	const snap = installedEntry?.snapshot?.effects;
	if ( Array.isArray(snap) && snap.length ) return snap;

	const modUuid = installedEntry?.uuid;
	if ( modUuid && modEffectsCache.has(modUuid) ) return modEffectsCache.get(modUuid) ?? [];

	return [];
}

/**
 * @param {object} hostItem
 * @param {object} installedEntry
 * @returns {object[]}
 */
function collectChangesFromInstalledEntry(hostItem, installedEntry) {
	const hostId = hostItem.id ?? hostItem._id ?? "";
	const hostName = hostItem.name ?? "";
	const modId = installedEntry.uuid ?? "";
	const modName = installedEntry.snapshot?.name ?? modId;
	/** @type {object[]} */
	const out = [];

	for ( const effect of getEffectsSnapshotForInstalledEntry(installedEntry) ) {
		if ( effect.disabled ) continue;
		for ( const change of effect.changes ?? [] ) {
			if ( !change?.key || !INSTALLED_MOD_SUPPORTED_BONUS_KEYS.has(change.key) ) continue;
			if ( change.mode != null && change.mode !== MODE_ADD ) continue;
			out.push({
				key: change.key,
				value: change.value,
				mode: MODE_ADD,
				priority: change.priority ?? 20,
				sourceHostId: hostId,
				sourceHostName: hostName,
				sourceModId: modId,
				sourceModName: modName
			});
		}
	}
	return out;
}

/**
 * @param {import("@league/foundry").documents.Actor|object} actor
 * @param {object} [options]
 * @param {boolean} [options.activeHostsOnly=true]
 * @returns {object[]}
 */
export function getInstalledChassisModEffectChanges(actor, { activeHostsOnly = true } = {}) {
	if ( !actor?.items ) return [];

	/** @type {object[]} */
	const changes = [];
	for ( const hostItem of actor.items ) {
		if ( activeHostsOnly && !isChassisHostItemActive(hostItem) ) continue;
		const chassis = getChassis(hostItem);
		for ( const installedEntry of chassis?.installedMods ?? [] ) {
			changes.push(...collectChangesFromInstalledEntry(hostItem, installedEntry));
		}
	}
	return changes;
}

/**
 * @param {string} effectKey full Active Effect key e.g. system.bonuses.mpak.attack
 * @returns {string|null} bonus path under actor.system.bonuses
 */
export function bonusPathFromEffectKey(effectKey) {
	if ( typeof effectKey !== "string" || !effectKey.startsWith("system.bonuses.") ) return null;
	return effectKey.slice("system.bonuses.".length);
}

/**
 * @param {import("@league/foundry").documents.Actor|object} actor
 * @param {string} bonusPath path under actor.system.bonuses e.g. mpak.attack
 * @param {object} [rollData]
 * @returns {number}
 */
export function getInstalledModBonus(actor, bonusPath, rollData = {}) {
	if ( !actor || !bonusPath ) return 0;
	const effectKey = `system.bonuses.${bonusPath}`;
	const { simplifyBonus } = dnd5e.utils;
	let total = 0;

	for ( const change of getInstalledChassisModEffectChanges(actor) ) {
		if ( change.key !== effectKey ) continue;
		total += simplifyBonus(change.value, rollData);
	}
	return total;
}

/**
 * Populate in-memory cache (and optionally persist snapshot) for legacy installs missing snapshot.effects.
 * @param {import("@league/foundry").documents.Item} hostItem
 * @param {{ persist?: boolean }} [options]
 */
export async function prefetchInstalledModEffectsForHost(hostItem, { persist = false } = {}) {
	const chassis = getChassis(hostItem);
	if ( !chassis?.installedMods?.length ) return;

	let dirty = false;
	const installedMods = chassis.installedMods.map(entry => {
		if ( Array.isArray(entry.snapshot?.effects) && entry.snapshot.effects.length ) {
			if ( entry.uuid ) modEffectsCache.set(entry.uuid, entry.snapshot.effects);
			return entry;
		}
		return entry;
	});

	for ( let i = 0; i < installedMods.length; i++ ) {
		const entry = installedMods[i];
		if ( Array.isArray(entry.snapshot?.effects) && entry.snapshot.effects.length ) continue;
		const modUuid = entry.uuid;
		if ( !modUuid ) continue;
		try {
			const doc = await fromUuid(modUuid);
			const snap = cloneEffectsSnapshot(doc?.effects);
			if ( snap?.length ) {
				modEffectsCache.set(modUuid, snap);
				if ( persist ) {
					installedMods[i] = {
						...entry,
						snapshot: { ...entry.snapshot, effects: snap }
					};
					dirty = true;
				}
			} else {
				modEffectsCache.set(modUuid, []);
			}
		} catch {
			modEffectsCache.set(modUuid, []);
		}
	}

	if ( persist && dirty ) {
		const next = normalizeChassis(hostItem, { ...chassis, installedMods });
		await hostItem.update({ "flags.sw5e.chassis": next });
	}
}

/**
 * Warm cache for all chassis hosts on an actor (does not persist).
 * @param {import("@league/foundry").documents.Actor} actor
 */
export async function prefetchInstalledModEffectsForActor(actor) {
	if ( !actor?.items ) return;
	for ( const item of actor.items ) {
		const chassis = getChassis(item);
		if ( !chassis?.enabled || !chassis.installedMods?.length ) continue;
		await prefetchInstalledModEffectsForHost(item, { persist: false });
	}
}

/** @param {string} modUuid */
export function clearInstalledModEffectsCacheEntry(modUuid) {
	if ( modUuid ) modEffectsCache.delete(modUuid);
}

export function clearInstalledModEffectsCache() {
	modEffectsCache.clear();
}
