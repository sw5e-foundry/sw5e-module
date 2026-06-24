import { getModuleId } from "./module-support.mjs";
import { isSw5eStarshipActor } from "./patch/starship-movement.mjs";
import {
	getStarshipExplicitSlowedLevel,
	getStarshipUsedFlag,
	isStarshipConditionActive,
	resolveStarshipExplicitSlowedLevelClick,
	setStarshipExplicitSlowedLevel,
	setStarshipUsedFlag,
	STARSHIP_CONDITION_IDS,
	STARSHIP_SLOWED_HUD_STATUS_IDS,
	STARSHIP_SYNCED_TOKEN_STATUS_IDS,
	STARSHIP_SYSTEM_DAMAGE_STATUS_ID,
	STARSHIP_USED_CONDITION_ID
} from "./starship-conditions.mjs";
import { getStarshipSystemDamageLevel } from "./starship-system-damage.mjs";

const STARSHIP_STATUS_SYNC_FLAG = "starshipStatusSync";

const syncingActors = new WeakMap();

/** Fresh mutable options for each Foundry embedded-document operation (Foundry mutates options in place). */
function getStarshipStatusSyncOptions(extra = {}) {
	return { ...extra, sw5eSkipStarshipStatusIconSync: true };
}

/** Stable embedded ActiveEffect _ids for display-only synced token statuses (avoid staticID truncation). */
const STARSHIP_SYNCED_STATUS_EFFECT_IDS = Object.freeze({
	[STARSHIP_USED_CONDITION_ID]: "sw5eSyncU0000001",
	[STARSHIP_SYSTEM_DAMAGE_STATUS_ID]: "sw5eSyncSD000001",
	starshipSlowed1: "sw5eSyncS1000001",
	starshipSlowed2: "sw5eSyncS2000001",
	starshipSlowed3: "sw5eSyncS3000001",
	starshipSlowed4: "sw5eSyncS4000001"
});

/** Legacy truncated id shared by all starshipSlowed1–4 under dnd5e.utils.staticID. */
const LEGACY_COLLIDED_SLOWED_SYNC_EFFECT_ID = "dnd5estarshipSlo";

function getStaticID(key) {
	const fn = globalThis.dnd5e?.utils?.staticID ?? foundry.utils.staticID;
	return fn(key);
}

/**
 * Stable embedded ActiveEffect _id for a synced Starship token status.
 * @param {string} statusId
 * @returns {string|null}
 */
export function getStarshipSyncedStatusEffectId(statusId) {
	return STARSHIP_SYNCED_STATUS_EFFECT_IDS[statusId] ?? null;
}

function getLegacySyncedStatusEffectIds() {
	const legacy = new Set([LEGACY_COLLIDED_SLOWED_SYNC_EFFECT_ID]);
	for ( const statusId of STARSHIP_SYNCED_TOKEN_STATUS_IDS ) {
		legacy.add(getStaticID(`dnd5e${statusId}`));
	}
	return legacy;
}

function getEffectStatusIds(effect) {
	const statuses = effect?.statuses;
	if ( !statuses ) return [];
	if ( statuses instanceof Set ) return [...statuses];
	return Array.isArray(statuses) ? statuses : [];
}

function collectStaleSyncedEffectIds(actor) {
	const stale = new Set();
	const legacyIds = getLegacySyncedStatusEffectIds();
	const expectedIds = new Set(
		STARSHIP_SYNCED_TOKEN_STATUS_IDS.map(statusId => getStarshipSyncedStatusEffectId(statusId))
	);

	for ( const effect of actor.effects ) {
		if ( legacyIds.has(effect.id) ) {
			stale.add(effect.id);
			continue;
		}

		const syncedStatus = getEffectStatusIds(effect).find(statusId => STARSHIP_SYNCED_TOKEN_STATUS_IDS.includes(statusId));
		if ( syncedStatus ) {
			const expectedId = getStarshipSyncedStatusEffectId(syncedStatus);
			if ( expectedId && effect.id !== expectedId ) stale.add(effect.id);
			continue;
		}

		if ( isStarshipSyncedStatusEffect(effect) && !expectedIds.has(effect.id) ) stale.add(effect.id);
	}

	return stale;
}

async function purgeCollidedLegacySyncedEffects(actor) {
	const toDelete = new Set();

	for ( const effect of actor.effects ) {
		if ( effect.id === LEGACY_COLLIDED_SLOWED_SYNC_EFFECT_ID ) toDelete.add(effect.id);

		for ( const statusId of getEffectStatusIds(effect) ) {
			if ( !STARSHIP_SLOWED_HUD_STATUS_IDS.includes(statusId) ) continue;
			const expectedId = getStarshipSyncedStatusEffectId(statusId);
			if ( expectedId && effect.id !== expectedId ) toDelete.add(effect.id);
		}
	}

	if ( !toDelete.size ) return false;
	await actor.deleteEmbeddedDocuments("ActiveEffect", [...toDelete], getStarshipStatusSyncOptions());
	return true;
}

export function isStarshipSyncedStatusEffect(effect) {
	return Boolean(effect?.flags?.sw5e?.[STARSHIP_STATUS_SYNC_FLAG]);
}

/** @deprecated Use {@link isStarshipSyncedStatusEffect}. */
export function isStarshipSystemDamageSyncEffect(effect) {
	return isStarshipSyncedStatusEffect(effect);
}

export function getStarshipSyncedStatusEffectIds() {
	return new Set(STARSHIP_SYNCED_TOKEN_STATUS_IDS.map(id => getStarshipSyncedStatusEffectId(id)));
}

function getCoverStatusIds() {
	return (CONFIG.statusEffects ?? [])
		.filter(effect => /^cover/i.test(effect.id ?? ""))
		.map(effect => effect.id);
}

/** Status palette entries allowed on SW5E Starship token HUDs. */
export function getStarshipTokenHudAllowlist() {
	return new Set([
		...STARSHIP_CONDITION_IDS,
		STARSHIP_USED_CONDITION_ID,
		STARSHIP_SYSTEM_DAMAGE_STATUS_ID,
		...STARSHIP_SLOWED_HUD_STATUS_IDS,
		...getCoverStatusIds()
	]);
}

/** Starship-only status IDs hidden from character/NPC token HUDs. */
export function getStarshipOnlyStatusIds() {
	return new Set([
		...STARSHIP_CONDITION_IDS,
		STARSHIP_USED_CONDITION_ID,
		STARSHIP_SYSTEM_DAMAGE_STATUS_ID,
		...STARSHIP_SLOWED_HUD_STATUS_IDS
	]);
}

function localizeStatusName(status) {
	const name = status?.name ?? "";
	if ( !name ) return "";
	const localized = game.i18n.localize(name);
	return localized && localized !== name ? localized : name;
}

function getStatusConfig(statusId) {
	return (CONFIG.statusEffects ?? []).find(effect => effect.id === statusId);
}

function resolveStarshipHudActiveState(statusId, actor, fallbackActive = false) {
	if ( statusId === STARSHIP_USED_CONDITION_ID ) return getStarshipUsedFlag(actor);
	if ( statusId === STARSHIP_SYSTEM_DAMAGE_STATUS_ID ) return getStarshipSystemDamageLevel(actor) > 0;
	if ( statusId.startsWith("starshipSlowed") && statusId.length === "starshipSlowed".length + 1 ) {
		const level = Number(statusId.slice("starshipSlowed".length));
		return getStarshipExplicitSlowedLevel(actor) === level;
	}
	if ( STARSHIP_CONDITION_IDS.includes(statusId) ) return isStarshipConditionActive(actor, statusId);
	return fallbackActive;
}

function buildHudChoiceFromStatus(status, actor, existingChoice) {
	const isActive = resolveStarshipHudActiveState(status.id, actor, existingChoice?.isActive ?? false);
	const title = localizeStatusName(status);
	return {
		_id: status._id,
		id: status.id,
		title,
		src: status.img,
		isOverlay: existingChoice?.isOverlay ?? false,
		cssClass: isActive ? "active" : "",
		isActive
	};
}

function filterStarshipTokenHudChoices(choices, actor) {
	const allow = getStarshipTokenHudAllowlist();
	const result = {};

	for ( const status of CONFIG.statusEffects ?? [] ) {
		if ( !allow.has(status.id) ) continue;
		result[status.id] = buildHudChoiceFromStatus(status, actor, choices?.[status.id]);
	}
	return result;
}

function stripStarshipStatusesFromChoices(choices) {
	const starshipOnly = getStarshipOnlyStatusIds();
	const result = { ...choices };
	for ( const id of starshipOnly ) delete result[id];
	return result;
}

function getDesiredSyncedStatusIds(actor) {
	const desired = new Set();
	if ( getStarshipUsedFlag(actor) ) desired.add(STARSHIP_USED_CONDITION_ID);
	const slowed = getStarshipExplicitSlowedLevel(actor);
	if ( slowed >= 1 && slowed <= 4 ) desired.add(`starshipSlowed${slowed}`);
	if ( getStarshipSystemDamageLevel(actor) > 0 ) desired.add(STARSHIP_SYSTEM_DAMAGE_STATUS_ID);
	return desired;
}

function refreshActorTokenEffectIcons(actor) {
	for ( const token of actor.getActiveTokens?.() ?? [] ) {
		token.object?.renderFlags?.set({ refreshEffects: true });
	}
}

function getSyncEffectDisplayData(statusId) {
	const statusConfig = getStatusConfig(statusId);
	return {
		name: localizeStatusName(statusConfig) || statusId,
		img: statusConfig?.img ?? "icons/svg/aura.svg"
	};
}

function buildSyncEffectUpdateData(existing, statusId) {
	const { name, img } = getSyncEffectDisplayData(statusId);
	const updates = { _id: existing.id };

	if ( existing.disabled ) updates.disabled = false;
	if ( existing.name !== name ) updates.name = name;
	if ( existing.img !== img ) updates.img = img;
	if ( !isStarshipSyncedStatusEffect(existing) ) {
		updates.flags = foundry.utils.mergeObject(existing.flags ?? {}, {
			sw5e: { ...existing.flags?.sw5e, [STARSHIP_STATUS_SYNC_FLAG]: true }
		});
	}

	if ( Object.keys(updates).length === 1 ) return null;
	return updates;
}

function buildSyncEffectCreateData(statusId) {
	const effectId = getStarshipSyncedStatusEffectId(statusId);
	const { name, img } = getSyncEffectDisplayData(statusId);

	return {
		_id: effectId,
		name,
		img,
		disabled: false,
		transfer: false,
		flags: { sw5e: { [STARSHIP_STATUS_SYNC_FLAG]: true } },
		statuses: [statusId]
	};
}

/**
 * Sync display-only ActiveEffects for flag-backed Used, explicit Slowed, and System Damage.
 * Source of truth remains actor flags; effects exist only for token/HUD icon rendering.
 * @param {Actor} actor
 */
export async function syncStarshipTokenStatusIcons(actor) {
	if ( !actor?.effects || !isSw5eStarshipActor(actor) ) return;

	const prior = syncingActors.get(actor) ?? Promise.resolve();
	const next = prior
		.then(() => runStarshipStatusIconSync(actor))
		.catch(err => {
			console.error("SW5E MODULE | Starship token status icon sync failed.", err);
		});
	syncingActors.set(actor, next);
	return next;
}

async function runStarshipStatusIconSync(actor) {
	try {
		const desired = getDesiredSyncedStatusIds(actor);
		const toDelete = new Set(collectStaleSyncedEffectIds(actor));
		const toUpdate = [];
		const toCreate = [];

		for ( const statusId of STARSHIP_SYNCED_TOKEN_STATUS_IDS ) {
			const effectId = getStarshipSyncedStatusEffectId(statusId);
			const existing = actor.effects.get(effectId);

			if ( desired.has(statusId) ) {
				if ( existing ) {
					const updateData = buildSyncEffectUpdateData(existing, statusId);
					if ( updateData ) toUpdate.push(updateData);
				} else {
					toCreate.push(buildSyncEffectCreateData(statusId));
				}
			} else if ( existing ) {
				toDelete.add(existing.id);
			}
		}

		const deleteIds = [...toDelete];
		if ( deleteIds.length ) {
			await actor.deleteEmbeddedDocuments("ActiveEffect", deleteIds, getStarshipStatusSyncOptions());
		}
		if ( toUpdate.length ) {
			await actor.updateEmbeddedDocuments("ActiveEffect", toUpdate, getStarshipStatusSyncOptions());
		}
		if ( toCreate.length ) {
			await actor.createEmbeddedDocuments("ActiveEffect", toCreate, getStarshipStatusSyncOptions({ keepId: true }));
		}

		const postStale = [...collectStaleSyncedEffectIds(actor)].filter(id => !deleteIds.includes(id));
		if ( postStale.length ) {
			await actor.deleteEmbeddedDocuments("ActiveEffect", postStale, getStarshipStatusSyncOptions());
		}

		let purgedLegacy = await purgeCollidedLegacySyncedEffects(actor);

		await new Promise(resolve => queueMicrotask(resolve));
		if ( await purgeCollidedLegacySyncedEffects(actor) ) purgedLegacy = true;

		if ( deleteIds.length || toUpdate.length || toCreate.length || postStale.length || purgedLegacy ) {
			refreshActorTokenEffectIcons(actor);
		}

		setTimeout(() => {
			if ( !isSw5eStarshipActor(actor) ) return;
			void purgeCollidedLegacySyncedEffects(actor).then(purged => {
				if ( purged ) refreshActorTokenEffectIcons(actor);
			});
		}, 150);
	} catch ( err ) {
		console.error("SW5E MODULE | Starship token status icon sync failed.", err);
		throw err;
	}
}

/** @deprecated Use {@link syncStarshipTokenStatusIcons}. */
export async function syncStarshipSystemDamageStatusEffect(actor) {
	return syncStarshipTokenStatusIcons(actor);
}

function actorChangesRequireStatusIconSync(changes) {
	return foundry.utils.hasProperty(changes, "flags.sw5e.legacyStarshipActor.system.attributes.used")
		|| foundry.utils.hasProperty(changes, "flags.sw5e.starship.conditions.slowedLevel")
		|| foundry.utils.hasProperty(changes, "flags.sw5e.legacyStarshipActor.system.attributes.systemDamage");
}

function shouldSkipStatusIconSync(options) {
	return Boolean(options?.sw5eSkipStarshipStatusIconSync);
}

function registerStarshipTokenStatusIconSyncHooks() {
	Hooks.once("ready", () => {
		for ( const actor of game.actors ?? [] ) {
			if ( isSw5eStarshipActor(actor) ) void syncStarshipTokenStatusIcons(actor);
		}
	});

	Hooks.on("updateActor", (actor, changes, options) => {
		if ( shouldSkipStatusIconSync(options) ) return;
		if ( !isSw5eStarshipActor(actor) ) return;
		if ( !actorChangesRequireStatusIconSync(changes) ) return;
		void syncStarshipTokenStatusIcons(actor);
	});
}

function getTokenHudPrototype() {
	return foundry.applications?.hud?.TokenHUD?.prototype
		?? CONFIG.Token?.hudClass?.prototype;
}

function wrapTokenHudStatusChoices() {
	const proto = getTokenHudPrototype();
	if ( !proto?._getStatusEffectChoices ) return;

	try {
		libWrapper.register(getModuleId(), "foundry.applications.hud.TokenHUD.prototype._getStatusEffectChoices", function(wrapped) {
			const choices = wrapped.call(this);
			const actor = this.actor;
			if ( !actor ) return choices;

			if ( isSw5eStarshipActor(actor) ) return filterStarshipTokenHudChoices(choices, actor);
			return stripStarshipStatusesFromChoices(choices);
		}, "MIXED");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap TokenHUD _getStatusEffectChoices for starship statuses.", err);
	}
}

async function handleStarshipFlagBackedStatusToggle(actor, statusId) {
	if ( statusId === STARSHIP_USED_CONDITION_ID ) {
		await setStarshipUsedFlag(actor, !getStarshipUsedFlag(actor));
		return true;
	}

	if ( statusId.startsWith("starshipSlowed") && statusId.length === "starshipSlowed".length + 1 ) {
		const clicked = Number(statusId.slice("starshipSlowed".length));
		const next = resolveStarshipExplicitSlowedLevelClick(getStarshipExplicitSlowedLevel(actor), clicked);
		await setStarshipExplicitSlowedLevel(actor, next);
		return true;
	}

	if ( statusId === STARSHIP_SYSTEM_DAMAGE_STATUS_ID ) return true;

	return false;
}

function wrapActorToggleStatusEffect() {
	const ActorClass = CONFIG.Actor?.documentClass;
	if ( !ActorClass?.prototype?.toggleStatusEffect ) return;

	try {
		libWrapper.register(getModuleId(), "CONFIG.Actor.documentClass.prototype.toggleStatusEffect", function(wrapped, statusId, options) {
			if ( isSw5eStarshipActor(this) ) {
				if ( statusId === STARSHIP_USED_CONDITION_ID
					|| statusId === STARSHIP_SYSTEM_DAMAGE_STATUS_ID
					|| (statusId.startsWith("starshipSlowed") && statusId.length === "starshipSlowed".length + 1) ) {
					void handleStarshipFlagBackedStatusToggle(this, statusId);
					return this;
				}
			}
			return wrapped.call(this, statusId, options);
		}, "MIXED");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap Actor toggleStatusEffect for starship flag statuses.", err);
	}
}

/**
 * Register Token HUD filtering and flag-backed status toggles for SW5E Starships.
 */
export function registerStarshipTokenStatusHooks() {
	wrapTokenHudStatusChoices();
	wrapActorToggleStatusEffect();
	registerStarshipTokenStatusIconSyncHooks();
}
