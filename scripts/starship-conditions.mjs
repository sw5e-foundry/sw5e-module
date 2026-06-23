import { getModuleId, getModulePath } from "./module-support.mjs";
import { isSw5eStarshipActor } from "./patch/starship-movement.mjs";

/** Phase 1 starship Effects tab condition IDs (distinct from creature conditionTypes). */
export const STARSHIP_CONDITION_IDS = Object.freeze([
	"starshipBlinded",
	"starshipDisabled",
	"starshipIonized",
	"starshipInvisible",
	"starshipShocked",
	"starshipStalled",
	"starshipStunned",
	"starshipTractored"
]);

const DND5E_STATUS = "systems/dnd5e/icons/svg/statuses";

/**
 * Starship-only condition registry for the Effects tab grid.
 * Not merged into CONFIG.DND5E.conditionTypes (character/NPC grids unchanged).
 */
export const STARSHIP_CONDITION_TYPE_DEFS = Object.freeze({
	starshipBlinded: {
		name: "SW5E.StarshipConBlinded",
		img: `${DND5E_STATUS}/blinded.svg`
	},
	starshipDisabled: {
		name: "SW5E.StarshipConDisabled",
		img: `${DND5E_STATUS}/incapacitated.svg`
	},
	starshipIonized: {
		name: "SW5E.StarshipConIonized",
		img: `${DND5E_STATUS}/paralyzed.svg`
	},
	starshipInvisible: {
		name: "SW5E.StarshipConInvisible",
		img: `${DND5E_STATUS}/invisible.svg`
	},
	starshipShocked: {
		name: "SW5E.StarshipConShocked",
		img: getModulePath("icons/svg/conditions/shocked.svg")
	},
	starshipStalled: {
		name: "SW5E.StarshipConStalled",
		img: `${DND5E_STATUS}/petrified.svg`
	},
	starshipStunned: {
		name: "SW5E.StarshipConStunned",
		img: `${DND5E_STATUS}/stunned.svg`
	},
	starshipTractored: {
		name: "SW5E.StarshipConTractored",
		img: `${DND5E_STATUS}/restrained.svg`
	}
});

/** SotG Appendix A — starship condition tooltip lines (mechanical summary; hover only). */
const STARSHIP_CONDITION_TOOLTIP_LINES = Object.freeze({
	starshipBlinded: [
		"A blinded ship can't see and automatically fails any ability check that relies on sight or the ship's sensors.",
		"Attack rolls against the ship have advantage, and the ship's attack rolls have disadvantage."
	],
	starshipDisabled: [
		"A disabled ship can't communicate with external sources more than 1,000 feet away.",
		"A disabled ship can't take actions or reactions.",
		"A disabled ship has 4 Slowed Levels."
	],
	starshipIonized: [
		"An ionized starship has disadvantage on attack rolls and ability checks."
	],
	starshipInvisible: [
		"An invisible starship is impossible to see without the aid of powers or a special sense.",
		"For the purpose of hiding, the starship is heavily obscured.",
		"The starship's location can be detected by any noise it makes or any tracks it leaves.",
		"Attack rolls against the ship have disadvantage, and the ship's attack rolls have advantage."
	],
	starshipShocked: [
		"A shocked starship can't take reactions.",
		"On its turn, a crewmember on a shocked starship can take either an action or a bonus action, but not both."
	],
	starshipStalled: [
		"A stalled ship is disabled.",
		"Any active features controlled by the ship, such as a Tractor Beam or Gravity Well Projector, automatically end.",
		"The ship automatically fails Strength and Dexterity saving throws.",
		"Attack rolls against the ship have advantage."
	],
	starshipStunned: [
		"A stunned ship has 4 Slowed Levels.",
		"The ship automatically fails Strength and Dexterity saving throws.",
		"Attack rolls against the ship have advantage."
	],
	starshipTractored: [
		"A tractored ship has 4 Slowed Levels.",
		"The condition ends if the tractoring ship is disabled.",
		"The condition also ends if an effect removes the tractored ship from the reach of the tractoring ship or effect."
	]
});

function formatStarshipConditionTooltip(conditionId) {
	const lines = STARSHIP_CONDITION_TOOLTIP_LINES[conditionId];
	if ( !Array.isArray(lines) || !lines.length ) return "";
	return lines.join("<br>");
}

function getStaticID(key) {
	const fn = globalThis.dnd5e?.utils?.staticID ?? foundry.utils.staticID;
	return fn(key);
}

function isStarshipConditionActive(actor, conditionId) {
	if ( !actor?.effects?.get ) return false;
	const effectId = getStaticID(`dnd5e${conditionId}`);
	const existing = actor.effects.get(effectId);
	return existing != null && existing.disabled === false;
}

/**
 * Derived slowed levels from active Starship Effects conditions (not persisted).
 * Disabled and Stalled share one +4 bucket (Stalled implies Disabled; both on = +4, not +8).
 * Stunned and Tractored each add +4 when active. Clamp is applied by the slowed resolver.
 * @param {Actor|object} actor
 * @returns {number}
 */
export function getStarshipConditionSlowedContribution(actor) {
	let contribution = 0;
	const disabled = isStarshipConditionActive(actor, "starshipDisabled");
	const stalled = isStarshipConditionActive(actor, "starshipStalled");
	if ( disabled || stalled ) contribution += 4;
	if ( isStarshipConditionActive(actor, "starshipStunned") ) contribution += 4;
	if ( isStarshipConditionActive(actor, "starshipTractored") ) contribution += 4;
	return contribution;
}

function localizeConditionName(entry) {
	const key = entry?.name;
	if ( !key ) return "";
	const localized = game.i18n.localize(key);
	return localized && localized !== key ? localized : key;
}

/**
 * Register CONFIG.SW5E.starshipConditionTypes during module config patch.
 */
export function applySw5eStarshipConditionConfig() {
	CONFIG.SW5E ??= {};
	CONFIG.SW5E.starshipConditionTypes = foundry.utils.deepClone(STARSHIP_CONDITION_TYPE_DEFS);
}

/**
 * Register starship condition entries on CONFIG.statusEffects so stock fromStatusEffect toggles work.
 * Idempotent — safe to call multiple times. Returns false only when CONFIG.statusEffects is unavailable.
 *
 * Must run after dnd5e `Hooks.once("i18nInit")` → `_configureStatusEffects()`, which rebuilds
 * CONFIG.statusEffects and clears any entries added during module init.
 */
export function registerStarshipConditionStatusEffects() {
	if ( !Array.isArray(CONFIG.statusEffects) ) return false;

	for ( const id of STARSHIP_CONDITION_IDS ) {
		if ( CONFIG.statusEffects.some(effect => effect.id === id) ) continue;
		const data = STARSHIP_CONDITION_TYPE_DEFS[id];
		if ( !data ) continue;
		const nameKey = data.name;
		const localizedName = game.i18n.localize(nameKey);
		CONFIG.statusEffects.push({
			id,
			_id: getStaticID(`dnd5e${id}`),
			name: localizedName && localizedName !== nameKey ? localizedName : nameKey,
			img: data.img,
			hud: false
		});
	}

	return true;
}

/**
 * Register starship status effects after dnd5e configures CONFIG.statusEffects.
 */
export function registerStarshipConditionStatusEffectHooks() {
	const ensureRegistered = () => {
		registerStarshipConditionStatusEffects();
	};

	// dnd5e rebuilds CONFIG.statusEffects in i18nInit (after module init).
	Hooks.on("i18nInit", ensureRegistered);
	Hooks.once("ready", ensureRegistered);
}

function getStarshipConditionEffectIds() {
	return new Set(STARSHIP_CONDITION_IDS.map(id => getStaticID(`dnd5e${id}`)));
}

/**
 * Build Effects tab condition rows for SW5e starship actors.
 * @param {Actor} actor
 * @returns {object[]}
 */
export function buildStarshipEffectsConditionsContext(actor) {
	const types = CONFIG.SW5E?.starshipConditionTypes ?? STARSHIP_CONDITION_TYPE_DEFS;
	return STARSHIP_CONDITION_IDS.map(id => {
		const config = types[id] ?? STARSHIP_CONDITION_TYPE_DEFS[id];
		const effectId = getStaticID(`dnd5e${id}`);
		const existing = actor.effects.get(effectId);
		const { disabled } = existing ?? {};
		return {
			id,
			name: localizeConditionName(config),
			img: existing?.img ?? config?.img,
			disabled: existing ? disabled : true
		};
	});
}

/**
 * Hide starship condition ActiveEffects from the generic effects lists (shown in Conditions grid only).
 * @param {object} context
 */
export function filterStarshipConditionEffectsFromCategories(context) {
	const conditionEffectIds = getStarshipConditionEffectIds();
	for ( const category of Object.values(context.effects ?? {}) ) {
		if ( !Array.isArray(category?.effects) ) continue;
		category.effects = category.effects.filter(effect => {
			if ( conditionEffectIds.has(effect.id) && !effect.duration?.remaining ) return false;
			return true;
		});
	}
}

/**
 * Apply starship-only condition tooltips and presentation classes on the Effects tab grid.
 * @param {HTMLElement} root
 */
export function ensureStarshipEffectsConditionCells(root) {
	if ( !(root instanceof HTMLElement) ) return;

	const panel = root.querySelector(".tab[data-tab=\"effects\"]");
	if ( !panel ) return;

	for ( const cell of panel.querySelectorAll(".conditions-list .condition[data-condition-id]") ) {
		const id = cell.dataset.conditionId;
		if ( !STARSHIP_CONDITION_IDS.includes(id) ) continue;

		const label = cell.querySelector(".name-stacked .title")?.textContent?.trim()
			?? localizeConditionName(STARSHIP_CONDITION_TYPE_DEFS[id]);
		if ( !label ) continue;

		const tooltip = formatStarshipConditionTooltip(id);
		if ( !tooltip ) continue;

		cell.classList.add("sw5e-starship-effects-condition");
		cell.classList.remove("content-link");
		cell.removeAttribute("data-uuid");
		cell.setAttribute("aria-label", label);
		cell.setAttribute("data-tooltip", tooltip);
	}
}

function shouldApplyStarshipEffectsConditions(sheet) {
	const VAS = globalThis.dnd5e?.applications?.actor?.VehicleActorSheet;
	if ( !VAS || !(sheet instanceof VAS) ) return false;
	return isSw5eStarshipActor(sheet.actor);
}

/**
 * Replace Effects tab conditions grid for SW5e starship vehicle actors only.
 */
export function registerStarshipEffectsContextWrapper() {
	const BAS = globalThis.dnd5e?.applications?.actor?.BaseActorSheet;
	if ( !BAS?.prototype ) return;

	try {
		libWrapper.register(getModuleId(), "dnd5e.applications.actor.BaseActorSheet.prototype._prepareEffectsContext", async function(wrapped, context, options) {
			context = await wrapped.call(this, context, options);
			if ( !shouldApplyStarshipEffectsConditions(this) ) return context;

			context.conditions = buildStarshipEffectsConditionsContext(this.actor);
			context.hasConditions = true;
			filterStarshipConditionEffectsFromCategories(context);
			return context;
		}, "WRAPPER");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap BaseActorSheet _prepareEffectsContext for starship conditions.", err);
	}
}

/**
 * Patch Effects tab condition cells after render (RAW description tooltips, presentation class).
 */
export function registerStarshipEffectsConditionPresentation() {
	Hooks.on("renderActorSheetV2", (app, html) => {
		if ( !isSw5eStarshipActor(app?.document) ) return;
		const root = html?.querySelector?.(".window-content") ?? html;
		ensureStarshipEffectsConditionCells(root);
	});
}
