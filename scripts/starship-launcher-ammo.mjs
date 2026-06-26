import { isSw5eStarshipActor } from "./patch/starship-movement.mjs";
import { hasTriggerActivityConfig } from "./sw5e-activity-trigger.mjs";
import {
	getCompatibleStarshipLauncherAmmoItems,
	isStarshipAmmoPayloadItem,
	isStarshipLauncherShellItem,
	launcherAcceptsStarshipAmmoSubtype
} from "./starship-weapon-rolls.mjs";

const { DialogV2 } = foundry.applications.api;

const PAYLOAD_ACTIVITY_TYPES = Object.freeze(["save", "attack", "damage"]);

/**
 * @param {Item5e|object|null|undefined} item
 * @returns {boolean}
 */
export function isStarshipLauncherItem(item) {
	return isStarshipLauncherShellItem(item);
}

/**
 * @param {Item5e|object|null|undefined} launcher
 * @param {Item5e|object|null|undefined} ammo
 * @returns {boolean}
 */
export function isCompatibleStarshipAmmoItem(launcher, ammo) {
	if ( !isStarshipLauncherItem(launcher) || !isStarshipAmmoPayloadItem(ammo) ) return false;
	if ( !launcherAcceptsStarshipAmmoSubtype(launcher, ammo.system?.type?.subtype) ) return false;
	if ( (ammo.system?.quantity ?? 0) <= 0 ) return false;
	return Boolean(resolveStarshipAmmoPayloadActivity(ammo));
}

/**
 * @param {Actor5e|object|null|undefined} actor
 * @param {Item5e|object|null|undefined} launcher
 * @returns {Item5e[]}
 */
export function getCompatibleStarshipAmmo(actor, launcher) {
	return getCompatibleStarshipLauncherAmmoItems(launcher, actor)
		.filter(item => isCompatibleStarshipAmmoItem(launcher, item));
}

/**
 * @param {Item5e|object|null|undefined} ammo
 * @returns {Activity|null}
 */
export function resolveStarshipAmmoPayloadActivity(ammo) {
	const activities = [...(ammo?.system?.activities ?? [])].filter(activity => activity?.canUse);
	if ( !activities.length ) return null;
	for ( const type of PAYLOAD_ACTIVITY_TYPES ) {
		const match = activities.find(activity => activity.type === type);
		if ( match ) return match;
	}
	return activities[0] ?? null;
}

function localizeOr(key, fallback) {
	const value = game.i18n.localize(key);
	return value && value !== key ? value : fallback;
}

/**
 * @param {Item5e} launcher
 * @param {Item5e[]} candidates
 * @returns {Promise<Item5e|null>}
 */
async function promptStarshipAmmoSelection(launcher, candidates) {
	const buttons = candidates.map((ammo, index) => ({
		action: ammo.id,
		label: `${ammo.name} (${ammo.system.quantity})`,
		icon: "fas fa-rocket",
		default: index === 0
	}));
	buttons.push({
		action: "cancel",
		label: game.i18n.localize("Cancel"),
		icon: "fas fa-times"
	});

	const choice = await DialogV2.wait({
		window: { title: launcher.name },
		content: "",
		buttons,
		rejectClose: false
	});

	if ( !choice || choice === "cancel" ) return null;
	return candidates.find(ammo => ammo.id === choice) ?? null;
}

/**
 * @param {Actor5e|object} actor
 * @param {Item5e|object} launcher
 * @returns {Promise<Item5e|null>}
 */
export async function selectStarshipAmmoPayload(actor, launcher) {
	const candidates = getCompatibleStarshipAmmo(actor, launcher);
	if ( !candidates.length ) {
		ui.notifications.warn(localizeOr("SW5E.WeaponAmmo.Warn.NoAmmo", "Not enough ammo"));
		return null;
	}
	if ( candidates.length === 1 ) return candidates[0];
	return promptStarshipAmmoSelection(launcher, candidates);
}

/**
 * @param {Item5e} ammo
 * @param {Activity} activity
 * @returns {boolean}
 */
function ammoActivityHasBridgeManagedMaterialConsumption(ammo, activity) {
	const targets = activity?.consumption?.targets ?? [];
	return targets.some(target => {
		if ( target?.type !== "material" ) return false;
		const targetId = target.target ?? "";
		return !targetId || targetId === ammo.id;
	});
}

/**
 * @param {Item5e} ammo
 * @param {number} [amount=1]
 * @param {Activity} [activity]
 */
async function consumeStarshipAmmoQuantity(ammo, amount = 1, activity = null) {
	if ( activity && ammoActivityHasBridgeManagedMaterialConsumption(ammo, activity) ) return;
	const quantity = Number(ammo.system?.quantity ?? 0);
	if ( !Number.isFinite(quantity) || quantity <= 0 ) return;
	const newQuantity = Math.max(0, quantity - amount);
	if ( newQuantity === quantity ) return;
	await ammo.update({ "system.quantity": newQuantity });
}

/**
 * Invoke the ammo item's payload Activity through stock dnd5e APIs.
 * @param {Item5e} ammo
 * @param {object} [options]
 * @param {Event} [options.event]
 * @param {ActivityUseConfiguration} [options.config]
 * @param {ActivityDialogConfiguration} [options.dialog]
 * @param {ActivityMessageConfiguration} [options.message]
 * @returns {Promise<ActivityUsageResults|void|null>}
 */
export async function useStarshipAmmoPayloadActivity(ammo, {
	event,
	config = {},
	dialog = {},
	message = {}
} = {}) {
	const activity = resolveStarshipAmmoPayloadActivity(ammo);
	if ( !activity ) {
		ui.notifications.warn(localizeOr("SW5E.WeaponAmmo.Warn.NoAmmo", "Not enough ammo"));
		return null;
	}

	const usageConfig = foundry.utils.mergeObject({ event }, config);
	const results = await activity.use(usageConfig, dialog, message);
	if ( !results ) return null;

	await consumeStarshipAmmoQuantity(ammo, 1, activity);
	return results;
}

/**
 * @param {Item5e} launcher
 * @param {object} [options]
 * @returns {Promise<ActivityUsageResults|void|null>}
 */
export async function fireStarshipLauncherThroughAmmoBridge(launcher, options = {}) {
	const actor = launcher?.actor;
	if ( !actor || !isSw5eStarshipActor(actor) || !isStarshipLauncherItem(launcher) ) return null;

	const ammo = await selectStarshipAmmoPayload(actor, launcher);
	if ( !ammo ) return null;

	return useStarshipAmmoPayloadActivity(ammo, options);
}

/**
 * Launcher utility Activities (future) should route through the ammo bridge instead of rolling on the shell.
 * @param {Activity|null|undefined} activity
 * @returns {boolean}
 */
function isStarshipLauncherBridgeActivity(activity) {
	if ( activity?.type !== "utility" ) return false;
	const item = activity.item;
	return isStarshipLauncherItem(item) && isSw5eStarshipActor(item?.actor);
}

function launcherHasTriggerActivityConfig(item) {
	const activities = item?.system?.activities;
	if ( !activities ) return false;
	for ( const activity of activities ) {
		if ( hasTriggerActivityConfig(activity) ) return true;
	}
	return false;
}

function onStarshipLauncherPreDisplayCard(item) {
	if ( !isStarshipLauncherItem(item) ) return;
	if ( !isSw5eStarshipActor(item.actor) ) return;
	if ( launcherHasTriggerActivityConfig(item) ) return;
	void fireStarshipLauncherThroughAmmoBridge(item);
	return false;
}

function onStarshipLauncherPreUseActivity(activity, usageConfig) {
	if ( !isStarshipLauncherBridgeActivity(activity) ) return;
	if ( hasTriggerActivityConfig(activity) ) return;
	void fireStarshipLauncherThroughAmmoBridge(activity.item, {
		event: usageConfig?.event
	});
	return false;
}

/** Register narrow launcher → ammo Activity bridge hooks (L3A pilot). */
export function registerStarshipLauncherAmmoBridgeHooks() {
	Hooks.on("dnd5e.preDisplayCard", onStarshipLauncherPreDisplayCard);
	Hooks.on("dnd5e.preUseActivity", onStarshipLauncherPreUseActivity);
}
