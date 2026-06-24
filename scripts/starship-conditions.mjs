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

/** Manual leveled Slowed — flag-backed, not an ActiveEffect toggle. */
export const STARSHIP_LEVELED_SLOWED_CONDITION_ID = "starshipSlowed";

/** Flag-backed Used — legacy sticky latch, not an ActiveEffect toggle. */
export const STARSHIP_USED_CONDITION_ID = "starshipUsed";

/** Display-only System Damage token status (synced from sidebar SD level). */
export const STARSHIP_SYSTEM_DAMAGE_STATUS_ID = "starshipSystemDamage";

export const STARSHIP_SLOWED_HUD_STATUS_IDS = Object.freeze([
	"starshipSlowed1",
	"starshipSlowed2",
	"starshipSlowed3",
	"starshipSlowed4"
]);

/** Flag/synced token icon statuses (not authoritative state). */
export const STARSHIP_SYNCED_TOKEN_STATUS_IDS = Object.freeze([
	STARSHIP_USED_CONDITION_ID,
	...STARSHIP_SLOWED_HUD_STATUS_IDS,
	STARSHIP_SYSTEM_DAMAGE_STATUS_ID
]);

export const STARSHIP_EXPLICIT_SLOWED_LEVEL_PATH = "flags.sw5e.starship.conditions.slowedLevel";

export const STARSHIP_USED_LEGACY_PATH = "flags.sw5e.legacyStarshipActor.system.attributes.used";

const STARSHIP_VEHICLE_HUD = Object.freeze({ actorTypes: ["vehicle"] });

const STARSHIP_EFFECTS_CONDITION_GRID_ORDER = Object.freeze([
	"starshipBlinded",
	"starshipDisabled",
	"starshipIonized",
	"starshipInvisible",
	"starshipShocked",
	STARSHIP_LEVELED_SLOWED_CONDITION_ID,
	"starshipStalled",
	"starshipStunned",
	"starshipTractored",
	STARSHIP_USED_CONDITION_ID
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
	},
	starshipSlowed: {
		name: "SW5E.StarshipConSlowed",
		img: getModulePath("icons/svg/conditions/slowed.svg")
	},
	starshipUsed: {
		name: "SW5E.StarshipConUsed",
		img: `${DND5E_STATUS}/sleeping.svg`
	},
	starshipSystemDamage: {
		name: "SW5E.StarshipConSystemDamage",
		img: `${DND5E_STATUS}/exhaustion.svg`
	},
	starshipSlowed1: {
		name: "SW5E.StarshipConSlowed1",
		img: getModulePath("icons/svg/conditions/slowed.svg")
	},
	starshipSlowed2: {
		name: "SW5E.StarshipConSlowed2",
		img: getModulePath("icons/svg/conditions/slowed.svg")
	},
	starshipSlowed3: {
		name: "SW5E.StarshipConSlowed3",
		img: getModulePath("icons/svg/conditions/slowed.svg")
	},
	starshipSlowed4: {
		name: "SW5E.StarshipConSlowed4",
		img: getModulePath("icons/svg/conditions/slowed.svg")
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
	],
	starshipSlowed: [
		"Slowed is measured in four levels.",
		"Level 1: Speed reduced by 150 feet.",
		"Level 2: Speed reduced by 250 feet.",
		"Level 3: Speed reduced by 300 feet.",
		"Level 4: Speed reduced to 0, and can't benefit from any bonus to speed."
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

export function isStarshipConditionActive(actor, conditionId) {
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

export function clampStarshipExplicitSlowedLevel(value) {
	const n = Math.trunc(Number(value));
	if ( !Number.isFinite(n) ) return 0;
	return Math.max(0, Math.min(4, n));
}

export function getStarshipExplicitSlowedLevel(actor) {
	const raw = actor?.flags?.sw5e?.starship?.conditions?.slowedLevel;
	return clampStarshipExplicitSlowedLevel(raw ?? 0);
}

export function resolveStarshipExplicitSlowedLevelClick(currentLevel, clickedLevel) {
	const clicked = clampStarshipExplicitSlowedLevel(clickedLevel);
	const current = clampStarshipExplicitSlowedLevel(currentLevel);
	if ( clicked < 1 ) return current;
	return current === clicked ? 0 : clicked;
}

export async function setStarshipExplicitSlowedLevel(actor, level) {
	const value = clampStarshipExplicitSlowedLevel(level);
	if ( getStarshipExplicitSlowedLevel(actor) === value ) return value;
	await actor.update({ [STARSHIP_EXPLICIT_SLOWED_LEVEL_PATH]: value });
	return value;
}

export function getStarshipUsedFlag(actor) {
	return Boolean(actor?.flags?.sw5e?.legacyStarshipActor?.system?.attributes?.used);
}

export async function setStarshipUsedFlag(actor, used) {
	const value = Boolean(used);
	if ( getStarshipUsedFlag(actor) === value ) return value;
	await actor.update({ [STARSHIP_USED_LEGACY_PATH]: value });
	return value;
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

	const registerEntry = (id, hud = STARSHIP_VEHICLE_HUD) => {
		if ( CONFIG.statusEffects.some(effect => effect.id === id) ) return;
		const data = STARSHIP_CONDITION_TYPE_DEFS[id];
		if ( !data ) return;
		const nameKey = data.name;
		const localizedName = game.i18n.localize(nameKey);
		CONFIG.statusEffects.push({
			id,
			_id: getStaticID(`dnd5e${id}`),
			name: localizedName && localizedName !== nameKey ? localizedName : nameKey,
			img: data.img,
			hud
		});
	};

	for ( const id of STARSHIP_CONDITION_IDS ) registerEntry(id);
	registerEntry(STARSHIP_USED_CONDITION_ID);
	registerEntry(STARSHIP_SYSTEM_DAMAGE_STATUS_ID);
	for ( const id of STARSHIP_SLOWED_HUD_STATUS_IDS ) registerEntry(id);

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

/** Display-only synced token status effect ids (and legacy staticID collisions). */
function getStarshipSyncedDisplayEffectIdSet() {
	const ids = new Set([
		"sw5eSyncU0000001",
		"sw5eSyncSD000001",
		"sw5eSyncS1000001",
		"sw5eSyncS2000001",
		"sw5eSyncS3000001",
		"sw5eSyncS4000001",
		"dnd5estarshipSlo"
	]);
	for ( const statusId of STARSHIP_SYNCED_TOKEN_STATUS_IDS ) {
		ids.add(getStaticID(`dnd5e${statusId}`));
	}
	return ids;
}

/**
 * Build Effects tab condition rows for SW5e starship actors.
 * @param {Actor} actor
 * @returns {object[]}
 */
export function buildStarshipEffectsConditionsContext(actor) {
	const types = CONFIG.SW5E?.starshipConditionTypes ?? STARSHIP_CONDITION_TYPE_DEFS;
	const explicitSlowed = getStarshipExplicitSlowedLevel(actor);

	return STARSHIP_EFFECTS_CONDITION_GRID_ORDER.map(id => {
		if ( id === STARSHIP_LEVELED_SLOWED_CONDITION_ID ) {
			const config = types[id] ?? STARSHIP_CONDITION_TYPE_DEFS[id];
			return {
				id,
				name: localizeConditionName(config) || "Slowed",
				img: config?.img ?? getModulePath("icons/svg/conditions/slowed.svg"),
				disabled: explicitSlowed === 0,
				leveled: true,
				slowedLevel: explicitSlowed
			};
		}

		if ( id === STARSHIP_USED_CONDITION_ID ) {
			const config = types[id] ?? STARSHIP_CONDITION_TYPE_DEFS[id];
			const used = getStarshipUsedFlag(actor);
			return {
				id,
				name: localizeConditionName(config) || "Used",
				img: config?.img ?? STARSHIP_CONDITION_TYPE_DEFS.starshipUsed.img,
				disabled: !used
			};
		}

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
	const syncedDisplayEffectIds = getStarshipSyncedDisplayEffectIdSet();
	for ( const category of Object.values(context.effects ?? {}) ) {
		if ( !Array.isArray(category?.effects) ) continue;
		category.effects = category.effects.filter(effect => {
			if ( effect.flags?.sw5e?.starshipStatusSync && !effect.duration?.remaining ) return false;
			if ( syncedDisplayEffectIds.has(effect.id) && !effect.duration?.remaining ) return false;
			if ( conditionEffectIds.has(effect.id) && !effect.duration?.remaining ) return false;
			return true;
		});
	}
}

/**
 * Apply starship-only condition tooltips and presentation classes on the Effects tab grid.
 * @param {HTMLElement} root
 * @param {Actor} [actor]
 */
export function ensureStarshipEffectsConditionCells(root, actor = null) {
	if ( !(root instanceof HTMLElement) ) return;

	const panel = root.querySelector(".tab[data-tab=\"effects\"]");
	if ( !panel ) return;

	for ( const cell of panel.querySelectorAll(".conditions-list .condition[data-condition-id]") ) {
		const id = cell.dataset.conditionId;
		if ( id === STARSHIP_LEVELED_SLOWED_CONDITION_ID || id === STARSHIP_USED_CONDITION_ID ) continue;
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

	if ( actor ) {
		ensureStarshipEffectsSlowedCell(panel, actor);
		ensureStarshipEffectsUsedCell(panel, actor);
	}
}

function canEditStarshipFlagBackedConditions(actor) {
	return Boolean(actor?.canUserModify?.(game.user, "update"));
}

function ensureStarshipEffectsUsedCell(panel, actor) {
	const cell = panel.querySelector(`.condition[data-condition-id="${STARSHIP_USED_CONDITION_ID}"]`);
	if ( !cell ) return;

	const label = localizeConditionName(STARSHIP_CONDITION_TYPE_DEFS[STARSHIP_USED_CONDITION_ID]) || "Used";
	const used = getStarshipUsedFlag(actor);
	const editable = canEditStarshipFlagBackedConditions(actor);

	cell.classList.add("sw5e-starship-effects-condition", "sw5e-starship-effects-used");
	cell.classList.toggle("active", used);
	cell.classList.remove("content-link");
	cell.removeAttribute("data-action");
	cell.removeAttribute("data-uuid");
	if ( editable ) cell.dataset.sw5eUsedToggle = "1";
	else cell.removeAttribute("data-sw5e-used-toggle");
	cell.setAttribute("aria-label", label);

	cell.querySelector(".fa-solid.fa-toggle-off, .fa-solid.fa-toggle-on")?.remove();
}

function ensureStarshipEffectsSlowedCell(panel, actor) {
	const cell = panel.querySelector(`.condition[data-condition-id="${STARSHIP_LEVELED_SLOWED_CONDITION_ID}"]`);
	if ( !cell ) return;

	const label = localizeConditionName(STARSHIP_CONDITION_TYPE_DEFS[STARSHIP_LEVELED_SLOWED_CONDITION_ID]) || "Slowed";
	const tooltip = formatStarshipConditionTooltip(STARSHIP_LEVELED_SLOWED_CONDITION_ID);
	const level = getStarshipExplicitSlowedLevel(actor);
	const editable = canEditStarshipFlagBackedConditions(actor);

	cell.classList.add("sw5e-starship-effects-condition", "sw5e-starship-effects-slowed");
	cell.classList.toggle("active", level > 0);
	cell.classList.remove("content-link");
	cell.removeAttribute("data-action");
	cell.removeAttribute("data-uuid");
	cell.setAttribute("aria-label", label);
	if ( tooltip ) cell.setAttribute("data-tooltip", tooltip);

	cell.querySelector(".fa-solid.fa-toggle-off, .fa-solid.fa-toggle-on")?.remove();

	let levelsEl = cell.querySelector(".sw5e-starship-slowed-levels");
	if ( !levelsEl ) {
		levelsEl = document.createElement("div");
		levelsEl.className = "sw5e-starship-slowed-levels";
		cell.appendChild(levelsEl);
	}

	levelsEl.replaceChildren();
	for ( let n = 1; n <= 4; n++ ) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "sw5e-starship-slowed-level";
		if ( level === n ) btn.classList.add("active");
		btn.dataset.sw5eSlowedLevel = String(n);
		btn.textContent = String(n);
		btn.setAttribute("aria-label", String(n));
		if ( !editable ) btn.disabled = true;
		levelsEl.appendChild(btn);
	}
}

function ensureStarshipFlagBackedConditionDelegates(root, app) {
	ensureStarshipSlowedLevelDelegate(root, app);
	ensureStarshipUsedToggleDelegate(root, app);
}

function ensureStarshipUsedToggleDelegate(root, app) {
	if ( !(root instanceof HTMLElement) || root.dataset.sw5eUsedDelegate === "1" ) return;
	root.dataset.sw5eUsedDelegate = "1";

	root.addEventListener("click", async (event) => {
		const cell = event.target.closest?.(`.condition[data-condition-id="${STARSHIP_USED_CONDITION_ID}"]`);
		if ( !cell || !cell.dataset.sw5eUsedToggle ) return;

		event.preventDefault();
		event.stopPropagation();

		const actor = app?.document ?? app?.actor;
		if ( !actor || !canEditStarshipFlagBackedConditions(actor) ) return;

		await setStarshipUsedFlag(actor, !getStarshipUsedFlag(actor));

		const panel = root.querySelector(".tab[data-tab=\"effects\"]");
		if ( panel ) ensureStarshipEffectsUsedCell(panel, actor);
	});
}

function ensureStarshipSlowedLevelDelegate(root, app) {
	if ( !(root instanceof HTMLElement) || root.dataset.sw5eSlowedDelegate === "1" ) return;
	root.dataset.sw5eSlowedDelegate = "1";

	root.addEventListener("click", async (event) => {
		const button = event.target.closest?.("[data-sw5e-slowed-level]");
		if ( !button || button.disabled ) return;
		const cell = button.closest(`.condition[data-condition-id="${STARSHIP_LEVELED_SLOWED_CONDITION_ID}"]`);
		if ( !cell ) return;

		event.preventDefault();
		event.stopPropagation();

		const actor = app?.document ?? app?.actor;
		if ( !actor || !canEditStarshipFlagBackedConditions(actor) ) return;

		const clicked = Number(button.dataset.sw5eSlowedLevel);
		const next = resolveStarshipExplicitSlowedLevelClick(getStarshipExplicitSlowedLevel(actor), clicked);
		await setStarshipExplicitSlowedLevel(actor, next);

		const panel = root.querySelector(".tab[data-tab=\"effects\"]");
		if ( panel ) ensureStarshipEffectsSlowedCell(panel, actor);
	});
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
 * Block stock ActiveEffect toggles for flag-backed leveled Slowed.
 */
export function registerStarshipEffectsSlowedToggleGuard() {
	const EffectsElement = globalThis.dnd5e?.applications?.components?.EffectsElement;
	if ( !EffectsElement?.prototype?._onToggleCondition ) return;

	try {
		libWrapper.register(getModuleId(), "dnd5e.applications.components.EffectsElement.prototype._onToggleCondition", async function(wrapped, conditionId) {
			if ( conditionId === STARSHIP_LEVELED_SLOWED_CONDITION_ID ) return;
			if ( conditionId === STARSHIP_USED_CONDITION_ID ) return;
			return wrapped.call(this, conditionId);
		}, "MIXED");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap EffectsElement _onToggleCondition for starship Slowed.", err);
	}
}

/**
 * Patch Effects tab condition cells after render (RAW description tooltips, presentation class).
 */
export function registerStarshipEffectsConditionPresentation() {
	Hooks.on("renderActorSheetV2", (app, html) => {
		if ( !isSw5eStarshipActor(app?.document) ) return;
		const root = html?.querySelector?.(".window-content") ?? html;
		ensureStarshipFlagBackedConditionDelegates(root, app);
		ensureStarshipEffectsConditionCells(root, app.document);
	});

	Hooks.on("updateActor", (actor, changes) => {
		if ( !isSw5eStarshipActor(actor) ) return;
		const usedChanged = foundry.utils.hasProperty(changes, STARSHIP_USED_LEGACY_PATH);
		const slowedChanged = foundry.utils.hasProperty(changes, STARSHIP_EXPLICIT_SLOWED_LEVEL_PATH);
		if ( !usedChanged && !slowedChanged ) return;

		for ( const app of Object.values(ui.windows) ) {
			if ( app?.document?.id !== actor.id ) continue;
			const root = app.element?.querySelector?.(".window-content") ?? app.element;
			if ( root instanceof HTMLElement ) ensureStarshipEffectsConditionCells(root, actor);
		}
	});
}
