import {
	isStarshipLauncherItem,
	selectStarshipAmmoPayload
} from "./starship-launcher-ammo.mjs";

const PAYLOAD_ACTIVITY_TYPES = Object.freeze(["save", "attack", "damage"]);

const TRIGGER_MODES = Object.freeze(["none", "consumedMaterial", "actorItemActivity"]);

/**
 * @typedef {object} Sw5eTriggerActivityConfig
 * @property {"none"|"consumedMaterial"|"actorItemActivity"} mode
 * @property {string} [itemUuid]
 * @property {string} [activityId]
 * @property {string} [timing]
 */

/**
 * @typedef {object} Sw5eTriggerActivityPlan
 * @property {import("@league/foundry").documents.Item} parentItem
 * @property {object} parentActivity
 * @property {import("@league/foundry").documents.Item} consumedItem
 * @property {object} [materialTarget]
 * @property {number} cost
 * @property {object} targetActivity
 */

/**
 * `dnd5e.preUseActivity` receives an Activity whose item is a clone used during the use pipeline.
 * Updates must target the real embedded Item on the actor (see dnd5e `Activity#use`).
 * @param {object|null|undefined} activity
 * @returns {import("@league/foundry").documents.Item|null}
 */
export function getRealEmbeddedItemFromActivity(activity) {
	const probeItem = activity?.item;
	const id = probeItem?.id;
	const parent = probeItem?.parent;
	if ( !id || parent?.documentName !== "Actor" ) return null;
	return parent.items.get(id) ?? null;
}

/**
 * @param {object|null|undefined} activity
 * @returns {object|null}
 */
function getRealActivityFromActivity(activity) {
	const realItem = getRealEmbeddedItemFromActivity(activity);
	if ( !realItem || !activity?.id ) return null;
	return realItem.system?.activities?.get(activity.id) ?? null;
}

/**
 * Actor-owned trigger targets are authoritative to the current actor only.
 * When copied flags preserve an original actor UUID, recover the embedded item
 * by local item id if possible instead of resolving across actors.
 * @param {string} reference
 * @returns {string}
 */
function getEmbeddedItemIdFromReference(reference) {
	if ( typeof reference !== "string" ) return "";
	const match = reference.match(/(?:^|\.)Item\.([^.]+)$/);
	return match?.[1] ?? "";
}

/**
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 * @param {string} reference
 * @returns {import("@league/foundry").documents.Item|null}
 */
function resolveSameActorTriggerItem(actor, reference) {
	if ( !actor || !reference ) return null;
	const directMatch = actor.items.get(reference);
	if ( directMatch ) return directMatch;

	const embeddedId = getEmbeddedItemIdFromReference(reference);
	if ( embeddedId ) {
		const remapped = actor.items.get(embeddedId);
		if ( remapped ) return remapped;
	}

	try {
		const resolved = fromUuidSync(reference, { relative: actor, strict: false });
		if ( resolved?.documentName === "Item" && resolved.parent === actor ) return resolved;
	} catch {
		// Foreign or stale references safely no-op.
	}
	return null;
}

/**
 * @param {object|null|undefined} raw
 * @returns {Sw5eTriggerActivityConfig}
 */
function normalizeTriggerConfig(raw) {
	if ( !raw || typeof raw !== "object" ) return { mode: "none" };
	const mode = raw.mode ?? "none";
	if ( !TRIGGER_MODES.includes(mode) ) return { mode: "none" };
	return {
		mode,
		itemUuid: String(raw.itemUuid ?? ""),
		activityId: String(raw.activityId ?? ""),
		timing: String(raw.timing ?? "afterParentUseBeforeConsumption")
	};
}

/**
 * @param {object|null|undefined} activity
 * @returns {Sw5eTriggerActivityConfig}
 */
export function getActivityTriggerConfig(activity) {
	const raw = activity?.flags?.sw5e?.triggerActivity
		?? foundry.utils.getProperty(activity, "flags.sw5e.triggerActivity");
	return normalizeTriggerConfig(raw);
}

/**
 * @param {object|null|undefined} activity
 * @returns {boolean}
 */
export function hasTriggerActivityConfig(activity) {
	return Boolean(activity?.flags?.sw5e?.triggerActivity
		?? foundry.utils.getProperty(activity, "flags.sw5e.triggerActivity"));
}

/**
 * @param {object|null|undefined} activity
 * @returns {boolean}
 */
export function isTriggerActivityEnabled(activity) {
	return getActivityTriggerConfig(activity).mode !== "none";
}

/**
 * @param {import("@league/foundry").documents.Item|object|null|undefined} item
 * @returns {object|null}
 */
export function resolvePreferredPayloadActivity(item) {
	const activities = [...(item?.system?.activities ?? [])].filter(activity => activity?.canUse);
	if ( !activities.length ) return null;
	for ( const type of PAYLOAD_ACTIVITY_TYPES ) {
		const match = activities.find(activity => activity.type === type);
		if ( match ) return match;
	}
	return activities[0] ?? null;
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {object} parentActivity
 * @returns {Promise<{ item: import("@league/foundry").documents.Item, target: object, cost: number }|null>}
 */
async function resolveMaterialConsumptionTarget(actor, parentActivity) {
	const targets = [...(parentActivity?.consumption?.targets ?? [])].filter(target => target?.type === "material");
	for ( const target of targets ) {
		const targetId = target.target ?? "";
		const cost = Math.max(1, Number(target.value) || 1);
		if ( !targetId ) continue;
		const item = actor.items.get(targetId);
		if ( !item ) continue;
		const quantity = Number(item.system?.quantity ?? 0);
		if ( !Number.isFinite(quantity) || quantity < cost ) continue;
		return { item, target, cost };
	}
	return null;
}

/**
 * @param {object} parentActivity
 * @param {import("@league/foundry").documents.Item} parentItem
 * @param {Sw5eTriggerActivityConfig} triggerConfig
 * @returns {Promise<Sw5eTriggerActivityPlan|null>}
 */
export async function resolveTriggeredActivityFromConsumedMaterial(parentActivity, parentItem, triggerConfig) {
	const actor = parentItem.actor;
	if ( !actor ) return null;

	let consumed = await resolveMaterialConsumptionTarget(actor, parentActivity);
	if ( !consumed && isStarshipLauncherItem(parentItem) ) {
		const ammo = await selectStarshipAmmoPayload(actor, parentItem);
		if ( ammo ) consumed = { item: ammo, target: { type: "material", value: "1" }, cost: 1 };
	}
	if ( !consumed?.item ) return null;

	const targetActivity = resolvePreferredPayloadActivity(consumed.item);
	if ( !targetActivity ) return null;

	return {
		parentItem,
		parentActivity,
		consumedItem: consumed.item,
		materialTarget: consumed.target,
		cost: consumed.cost,
		targetActivity
	};
}

/**
 * @param {object} parentActivity
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {Sw5eTriggerActivityConfig} triggerConfig
 * @returns {Sw5eTriggerActivityPlan|null}
 */
export function resolveTriggeredActivityFromActorItem(parentActivity, actor, triggerConfig) {
	if ( !actor ) return null;
	const parentItem = parentActivity?.item;
	const ref = triggerConfig.itemUuid ?? "";
	const item = resolveSameActorTriggerItem(actor, ref);
	if ( !item ) return null;

	let targetActivity = null;
	if ( triggerConfig.activityId ) targetActivity = item.system?.activities?.get(triggerConfig.activityId) ?? null;
	else targetActivity = resolvePreferredPayloadActivity(item);
	if ( !targetActivity ) return null;

	return {
		parentItem,
		parentActivity,
		consumedItem: item,
		materialTarget: null,
		cost: 1,
		targetActivity
	};
}

/**
 * @param {object} activity
 * @param {import("@league/foundry").documents.Item} realParentItem
 * @param {object} realParentActivity
 * @param {Sw5eTriggerActivityConfig} triggerConfig
 * @returns {Promise<Sw5eTriggerActivityPlan|null>}
 */
async function buildTriggerPlan(activity, realParentItem, realParentActivity, triggerConfig) {
	switch ( triggerConfig.mode ) {
		case "consumedMaterial":
			return resolveTriggeredActivityFromConsumedMaterial(realParentActivity, realParentItem, triggerConfig);
		case "actorItemActivity":
			return resolveTriggeredActivityFromActorItem(realParentActivity, realParentItem.actor, triggerConfig);
		default:
			return null;
	}
}

/**
 * @param {import("@league/foundry").documents.Item} consumedItem
 * @param {object} targetActivity
 * @returns {boolean}
 */
function targetActivityConsumesSameMaterial(consumedItem, targetActivity) {
	const targets = targetActivity?.consumption?.targets ?? [];
	return targets.some(target => {
		if ( target?.type !== "material" ) return false;
		const targetId = target.target ?? "";
		return !targetId || targetId === consumedItem.id;
	});
}

/**
 * Build a plain triggered-activity use config without carrying live DOM objects
 * or the parent activity's consumption shape into the triggered cross-item
 * Activity.use() call.
 * @param {object} usageConfig
 * @param {object} [options]
 * @param {boolean} [options.disableConsumption=false]
 * @returns {object}
 */
function sanitizeTriggeredUsageConfig(usageConfig = {}, { disableConsumption = false } = {}) {
	const config = {};
	if ( usageConfig?.subsequentActions === false ) config.subsequentActions = false;
	if ( disableConsumption ) {
		config.consume = false;
		config.hasConsumption = false;
	}
	return config;
}

/**
 * @param {Sw5eTriggerActivityPlan} plan
 * @param {object} usageConfig
 * @param {object} [options]
 * @param {boolean} [options.disableConsumption=false]
 * @returns {Promise<ActivityUsageResults|void|null>}
 */
export async function useTriggeredActivity(plan, usageConfig = {}, options = {}) {
	const { targetActivity, parentActivity } = plan;
	const config = sanitizeTriggeredUsageConfig(usageConfig, options);
	if ( parentActivity?.relativeUUID ) {
		config.cause = { activity: parentActivity.relativeUUID };
		if ( options.disableConsumption ) config.cause.resources = false;
	}
	return targetActivity.use(config, {}, {});
}

/**
 * @param {Sw5eTriggerActivityPlan} plan
 * @param {object} [options]
 * @returns {Promise<void>}
 */
export async function consumeTriggerMaterialAfterSuccess(plan, options = {}) {
	const { consumedItem, targetActivity, cost = 1 } = plan;
	if ( options.skipConsumption ) return;
	if ( targetActivityConsumesSameMaterial(consumedItem, targetActivity) ) return;

	const quantity = Number(consumedItem.system?.quantity ?? 0);
	if ( !Number.isFinite(quantity) || quantity <= 0 ) return;
	const newQuantity = Math.max(0, quantity - cost);
	if ( newQuantity === quantity ) return;
	await consumedItem.update({ "system.quantity": newQuantity });
}

function localizeOr(key, fallback) {
	const value = game.i18n.localize(key);
	return value && value !== key ? value : fallback;
}

/**
 * @param {object} activity
 * @param {ActivityUseConfiguration} usageConfig
 * @param {ActivityDialogConfiguration} dialogConfig
 * @param {ActivityMessageConfiguration} messageConfig
 */
async function orchestrateTriggerActivity(activity, usageConfig, dialogConfig, messageConfig) {
	const realParentItem = getRealEmbeddedItemFromActivity(activity);
	const realParentActivity = getRealActivityFromActivity(activity);
	if ( !realParentItem || !realParentActivity ) return;

	const triggerConfig = getActivityTriggerConfig(activity);
	const plan = await buildTriggerPlan(activity, realParentItem, realParentActivity, triggerConfig);
	if ( !plan?.targetActivity || !plan.consumedItem ) {
		ui.notifications.warn(localizeOr(
			"SW5E.TriggerActivity.Warn.Unresolved",
			"Could not resolve the triggered activity."
		));
		return;
	}

	if ( dialogConfig.configure && activity._requiresConfigurationDialog?.(usageConfig) ) {
		try {
			await dialogConfig.applicationClass.create(activity, usageConfig, dialogConfig.options);
		} catch {
			return;
		}
	}

	const results = await useTriggeredActivity(plan, usageConfig, {
		disableConsumption: triggerConfig.mode === "consumedMaterial"
	});
	if ( !results ) return;

	if ( triggerConfig.mode === "consumedMaterial" ) {
		await consumeTriggerMaterialAfterSuccess(plan);
	}
}

function onSw5eTriggerPreUseActivity(activity, usageConfig, dialogConfig, messageConfig) {
	if ( !isTriggerActivityEnabled(activity) ) return;
	void orchestrateTriggerActivity(activity, usageConfig, dialogConfig, messageConfig);
	return false;
}

/** Register SW5e Trigger Activity framework hooks (T1 pilot). */
export function registerSw5eActivityTriggerHooks() {
	Hooks.on("dnd5e.preUseActivity", onSw5eTriggerPreUseActivity);
}
