import {
	getActivityTriggerConfig
} from "../sw5e-activity-trigger.mjs";
import { isSw5eStarshipActor } from "./starship-movement.mjs";

const DND5E_ACTIVITY_CONFIG_SHEETS = new Set([
	"ActivitySheet",
	"AttackSheet",
	"CastSheet",
	"CheckSheet",
	"DamageSheet",
	"EnchantSheet",
	"ForwardSheet",
	"HealSheet",
	"SaveSheet",
	"SummonSheet",
	"TransformSheet",
	"UtilitySheet"
]);

const TRIGGER_ACTIVITY_MODES = Object.freeze({
	NONE: "none",
	CONSUMED_MATERIAL: "consumedMaterial",
	ACTOR_ITEM_ACTIVITY: "actorItemActivity"
});

const DEFAULT_TRIGGER_TIMING = "afterParentUseBeforeConsumption";
const ACTOR_ITEM_VALUE_DELIMITER = "::";
const ACTOR_ITEM_GROUP_ORDER = Object.freeze([
	"weapons",
	"consumables",
	"equipment",
	"loot",
	"features",
	"other"
]);

/**
 * @param {Item5e|object|null|undefined} item
 * @returns {boolean}
 */
export function isStarshipActivityConfigItem(item) {
	if ( !item ) return false;
	if ( item.system?.type?.value === "starshipAction" ) return true;
	return isSw5eStarshipActor(item.actor);
}

/** @deprecated Use {@link isStarshipActivityConfigItem}. */
export function shouldInjectStarshipActivitySkills(item) {
	return isStarshipActivityConfigItem(item);
}

/**
 * dnd5e Activity configuration sheets (Check, Attack, etc.).
 */
export function isDnd5eActivityConfigApp(app, element) {
	if ( !(element instanceof HTMLElement) ) return false;
	if ( !element.classList.contains("dnd5e2") ) return false;
	if ( !element.classList.contains("activity") ) return false;
	return DND5E_ACTIVITY_CONFIG_SHEETS.has(app?.constructor?.name ?? "");
}

/**
 * @param {Application} app
 * @returns {"starship-activity-config"|"activity-config"}
 */
export function resolveActivityConfigThemeScope(app) {
	const item = app?.item ?? app?.document;
	return isStarshipActivityConfigItem(item) ? "starship-activity-config" : "activity-config";
}

function getHtmlRoot(html, app) {
	if ( html instanceof HTMLElement ) return html;
	return html?.[0] ?? app?.element?.[0] ?? null;
}

function localizeOr(key, fallback) {
	const value = game.i18n.localize(key);
	return value && value !== key ? value : fallback;
}

function getActivityFromApp(app) {
	return app?.activity ?? app?.document ?? null;
}

function getActivityItem(app, activity) {
	return activity?.item ?? app?.item ?? null;
}

function getTriggerActivityGroup(item) {
	switch ( item?.type ) {
		case "weapon": return "weapons";
		case "consumable": return "consumables";
		case "equipment": return "equipment";
		case "loot": return "loot";
		case "feat":
		case "class":
		case "subclass":
		case "background":
		case "race":
		case "sw5e-module.maneuver":
		case "sw5e.maneuver":
			return "features";
		default:
			return "other";
	}
}

function getTriggerActivityGroupLabel(group) {
	switch ( group ) {
		case "weapons":
			return localizeOr("SW5E.TriggerActivity.Group.Weapons", "Weapons");
		case "consumables":
			return localizeOr("SW5E.TriggerActivity.Group.Consumables", "Consumables");
		case "equipment":
			return localizeOr("SW5E.TriggerActivity.Group.Equipment", "Equipment");
		case "loot":
			return localizeOr("SW5E.TriggerActivity.Group.Loot", "Loot");
		case "features":
			return localizeOr("SW5E.TriggerActivity.Group.Features", "Features");
		default:
			return localizeOr("SW5E.TriggerActivity.Group.Other", "Other");
	}
}

function getActivityDisplayName(activity) {
	return String(
		activity?.name
		?? CONFIG.DND5E?.activityTypes?.[activity?.type]?.label
		?? activity?.type
		?? "Activity"
	);
}

function encodeActorItemTriggerValue(itemUuid, activityId) {
	return `${TRIGGER_ACTIVITY_MODES.ACTOR_ITEM_ACTIVITY}${ACTOR_ITEM_VALUE_DELIMITER}${itemUuid}${ACTOR_ITEM_VALUE_DELIMITER}${activityId}`;
}

function parseActorItemTriggerValue(value) {
	if ( typeof value !== "string" ) return null;
	const [mode, itemUuid, activityId] = value.split(ACTOR_ITEM_VALUE_DELIMITER);
	if ( mode !== TRIGGER_ACTIVITY_MODES.ACTOR_ITEM_ACTIVITY || !itemUuid || !activityId ) return null;
	return { mode, itemUuid, activityId };
}

function getEmbeddedItemIdFromReference(reference) {
	if ( typeof reference !== "string" ) return "";
	const match = reference.match(/(?:^|\.)Item\.([^.]+)$/);
	return match?.[1] ?? "";
}

function isCurrentActivity(currentActivity, item, candidateActivity) {
	return item?.id === currentActivity?.item?.id && candidateActivity?.id === currentActivity?.id;
}

function createsDirectTriggerLoop(currentActivity, item, candidateActivity) {
	if ( isCurrentActivity(currentActivity, item, candidateActivity) ) return true;
	const config = getActivityTriggerConfig(candidateActivity);
	if ( config.mode !== TRIGGER_ACTIVITY_MODES.ACTOR_ITEM_ACTIVITY ) return false;
	const currentRefs = new Set([
		currentActivity?.item?.id,
		currentActivity?.item?.uuid,
		getEmbeddedItemIdFromReference(currentActivity?.item?.uuid)
	].filter(Boolean));
	const targetRefs = new Set([
		config.itemUuid,
		getEmbeddedItemIdFromReference(config.itemUuid)
	].filter(Boolean));
	return config.activityId === currentActivity?.id
		&& [...targetRefs].some(ref => currentRefs.has(ref));
}

function isSelectedActorItemTarget(config, item, activity) {
	if ( config.mode !== TRIGGER_ACTIVITY_MODES.ACTOR_ITEM_ACTIVITY ) return false;
	if ( config.activityId !== activity?.id ) return false;
	const targetRefs = new Set([
		config.itemUuid,
		getEmbeddedItemIdFromReference(config.itemUuid)
	].filter(Boolean));
	return [item?.id, item?.uuid].some(ref => targetRefs.has(ref));
}

function buildActorItemTriggerOptions(currentActivity) {
	const actor = currentActivity?.item?.actor;
	const groups = new Map(ACTOR_ITEM_GROUP_ORDER.map(group => [group, []]));
	if ( !actor ) return groups;

	for ( const item of actor.items ?? [] ) {
		if ( !item || item.actor !== actor || item.pack ) continue;
		const itemUuid = item.uuid ?? item.id;
		if ( !itemUuid ) continue;
		for ( const activity of item.system?.activities ?? [] ) {
			if ( !activity?.id ) continue;
			if ( createsDirectTriggerLoop(currentActivity, item, activity) ) continue;
			const group = getTriggerActivityGroup(item);
			const label = `${item.name ?? "Item"} — ${getActivityDisplayName(activity)}`;
			groups.get(group)?.push({
				item,
				activity,
				label,
				value: encodeActorItemTriggerValue(itemUuid, activity.id)
			});
		}
	}

	for ( const options of groups.values() ) {
		options.sort((lhs, rhs) => {
			const itemCompare = String(lhs.item?.name ?? "").localeCompare(String(rhs.item?.name ?? ""), game.i18n.lang);
			if ( itemCompare !== 0 ) return itemCompare;
			return String(lhs.activity?.name ?? lhs.activity?.id ?? "").localeCompare(
				String(rhs.activity?.name ?? rhs.activity?.id ?? ""),
				game.i18n.lang
			);
		});
	}

	return groups;
}

function createHiddenInput(name, value) {
	const input = document.createElement("input");
	input.type = "hidden";
	input.name = name;
	input.value = value;
	return input;
}

function syncTriggerActivityHiddenInputs(select, hiddenInputs, timing) {
	const parsed = parseActorItemTriggerValue(select.value);
	hiddenInputs.timing.value = timing || DEFAULT_TRIGGER_TIMING;
	if ( select.value === TRIGGER_ACTIVITY_MODES.CONSUMED_MATERIAL ) {
		hiddenInputs.mode.value = TRIGGER_ACTIVITY_MODES.CONSUMED_MATERIAL;
		hiddenInputs.itemUuid.value = "";
		hiddenInputs.activityId.value = "";
		return;
	}
	if ( parsed ) {
		hiddenInputs.mode.value = TRIGGER_ACTIVITY_MODES.ACTOR_ITEM_ACTIVITY;
		hiddenInputs.itemUuid.value = parsed.itemUuid;
		hiddenInputs.activityId.value = parsed.activityId;
		return;
	}
	hiddenInputs.mode.value = TRIGGER_ACTIVITY_MODES.NONE;
	hiddenInputs.itemUuid.value = "";
	hiddenInputs.activityId.value = "";
}

function buildTriggerActivityField(activity) {
	const currentConfig = getActivityTriggerConfig(activity);
	const timing = currentConfig.timing || DEFAULT_TRIGGER_TIMING;
	const actorOptions = buildActorItemTriggerOptions(activity);
	let matchedActorItem = false;

	const wrapper = document.createElement("div");
	wrapper.className = "form-group sw5e-trigger-activity-field";

	const label = document.createElement("label");
	label.textContent = localizeOr("SW5E.TriggerActivity.Label", "Trigger Activity");
	wrapper.append(label);

	const formFields = document.createElement("div");
	formFields.className = "form-fields";
	wrapper.append(formFields);

	const select = document.createElement("select");
	select.className = "sw5e-trigger-activity-select";
	formFields.append(select);

	const noneOption = document.createElement("option");
	noneOption.value = TRIGGER_ACTIVITY_MODES.NONE;
	noneOption.textContent = localizeOr("SW5E.TriggerActivity.Option.None", "None");
	select.append(noneOption);

	const consumedOption = document.createElement("option");
	consumedOption.value = TRIGGER_ACTIVITY_MODES.CONSUMED_MATERIAL;
	consumedOption.textContent = localizeOr(
		"SW5E.TriggerActivity.Option.ConsumedMaterial",
		"Consumed Material Activity"
	);
	select.append(consumedOption);

	for ( const group of ACTOR_ITEM_GROUP_ORDER ) {
		const options = actorOptions.get(group) ?? [];
		if ( !options.length ) continue;
		const optgroup = document.createElement("optgroup");
		optgroup.label = getTriggerActivityGroupLabel(group);
		for ( const optionData of options ) {
			const option = document.createElement("option");
			option.value = optionData.value;
			option.textContent = optionData.label;
			if ( isSelectedActorItemTarget(currentConfig, optionData.item, optionData.activity) ) {
				option.selected = true;
				matchedActorItem = true;
			}
			optgroup.append(option);
		}
		select.append(optgroup);
	}

	if ( currentConfig.mode === TRIGGER_ACTIVITY_MODES.CONSUMED_MATERIAL ) {
		consumedOption.selected = true;
	} else if ( currentConfig.mode !== TRIGGER_ACTIVITY_MODES.ACTOR_ITEM_ACTIVITY || !matchedActorItem ) {
		noneOption.selected = true;
	}

	const hiddenInputs = {
		mode: createHiddenInput("flags.sw5e.triggerActivity.mode", currentConfig.mode || TRIGGER_ACTIVITY_MODES.NONE),
		itemUuid: createHiddenInput("flags.sw5e.triggerActivity.itemUuid", currentConfig.itemUuid || ""),
		activityId: createHiddenInput("flags.sw5e.triggerActivity.activityId", currentConfig.activityId || ""),
		timing: createHiddenInput("flags.sw5e.triggerActivity.timing", timing)
	};
	for ( const input of Object.values(hiddenInputs) ) wrapper.append(input);

	syncTriggerActivityHiddenInputs(select, hiddenInputs, timing);
	select.addEventListener("change", () => syncTriggerActivityHiddenInputs(select, hiddenInputs, timing));
	return wrapper;
}

function injectTriggerActivityField(app, html) {
	const root = getHtmlRoot(html, app);
	if ( !isDnd5eActivityConfigApp(app, root) ) return;
	const activity = getActivityFromApp(app);
	const item = getActivityItem(app, activity);
	if ( !activity || !item ) return;
	const effectTab = root.querySelector('section.tab[data-tab="effect"]');
	if ( !(effectTab instanceof HTMLElement) ) return;
	effectTab.querySelector(".sw5e-trigger-activity-field")?.remove();
	effectTab.append(buildTriggerActivityField(activity));
}

export function patchStarshipActivityConfigUi() {
	Hooks.on("renderApplicationV2", injectTriggerActivityField);
}
