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
