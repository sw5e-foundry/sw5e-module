import { getModulePath, getModuleId, getModuleSettingValue, SETTINGS_NAMESPACE } from "../module-support.mjs";
import { normalizeSwPriceDenomination } from "../currencies.mjs";
import {
	deriveStarshipPools,
	getDerivedStarshipRuntime,
	getLegacyStarshipActorSystem,
	getStarshipAdvancedPowerContext,
	getStarshipPowerRecoverySummary,
	getStarshipPrototypeTokenDimensions,
	getStarshipSkillDisplayEntries,
	getStarshipSkillEntries,
	persistStarshipLegacyAttributePath,
	rollStarshipAbility,
	rollStarshipAbilityCheck,
	rollStarshipAbilitySave,
	rollStarshipPowerDie,
	rollStarshipSkill,
	STARSHIP_POWER_DIE_SLOTS
} from "../starship-data.mjs";
import { recoverStarshipPowerDice } from "../starship-power-recovery.mjs";
import { openRechargeRepairDialog, openRefittingRepairDialog, openRegenRepairDialog } from "../starship-repair.mjs";
import { shouldShowStarshipPowerRouting, isLegacyPowerRoutingOverrideEnabled, STARSHIP_LEGACY_POWER_ROUTING_FLAG } from "../starship-routing-gate.mjs";
import { isStarshipWeaponItem } from "../starship-weapon-rolls.mjs";
import {
	fireStarshipLauncherThroughAmmoBridge,
	isStarshipLauncherItem
} from "../starship-launcher-ammo.mjs";
import {
	hasTriggerActivityConfig
} from "../sw5e-activity-trigger.mjs";
import {
	buildDestructionSaveSidebarContext,
	resetStarshipDestructionSaves,
	rollStarshipDestructionSave
} from "../starship-destruction-saves.mjs";
import {
	buildSystemDamageSidebarContext,
	getStarshipEffectiveHullMax,
	getStarshipEffectiveShieldMax,
	getStarshipSystemDamageLevel,
	resolveStarshipSystemDamagePipToggle,
	setStarshipSystemDamageLevel
} from "../starship-system-damage.mjs";
import { buildVehicleStarshipCrewContext, buildVehicleAvailableActors, deployStarshipCrew, undeployStarshipCrew, toggleStarshipActiveCrew } from "../starship-character.mjs";
import { getExpandedProficiencyHoverLabel } from "./proficiency.mjs";
import { openStarshipMovementConfig } from "../starship-movement-config.mjs";
import { openStarshipVitalConfig } from "../starship-vital-config.mjs";
import {
	registerStarshipConditionStatusEffectHooks,
	registerStarshipEffectsConditionPresentation,
	registerStarshipEffectsContextWrapper,
	registerStarshipEffectsSlowedToggleGuard
} from "../starship-conditions.mjs";
import { registerStarshipTokenStatusHooks } from "../starship-token-status.mjs";
/**
 * dnd5e pack asset — used only for on-sheet display when art is missing or fails to load (not persisted to actors).
 * @see https://github.com/foundryvtt/dnd5e — `icons/svg/actors/vehicle.svg`
 */
const DND5E_VEHICLE_ACTOR_FALLBACK_PATH = "systems/dnd5e/icons/svg/actors/vehicle.svg";

let vehicleSheetPrepareContextWrapped = false;
let vehicleSheetPrepareStationsContextWrapped = false;
let vehicleSheetStarshipCargoInventoryWrapped = false;

const STARSHIP_PACKS = new Set([
	"starshipactions",
	"starshiparmor",
	"starshipequipment",
	"starshipfeatures",
	"starshipmodifications",
	"starships",
	"starshipweapons",
	"deployments",
	"deploymentfeatures",
	"ventures"
]);

const STARSHIP_TAB_ID = "sw5e-starship";
/** Primary Features tab for starship Actions / Systems. */
const STARSHIP_FEATURES_TAB_ID = "sw5e-starship-features";
const STOCK_CARGO_TAB_ID = "inventory";
const STOCK_FEATURES_TAB_ID = "features";
const STOCK_STARSHIP_TAB_ORDER = [STARSHIP_TAB_ID, STOCK_CARGO_TAB_ID, STARSHIP_FEATURES_TAB_ID, "effects", "description"];
const CUSTOM_STARSHIP_TAB_IDS = new Set([STARSHIP_TAB_ID]);

const SOTG_SUB_TAB_IDS = new Set(["overview"]);

/** Set `true` to enable verbose submit/mode diagnostics for starship vehicle sheets. */
const SW5E_STARSHIP_SHEET_DIAG_ENABLED = false;
const SW5E_STARSHIP_SHEET_DIAG_PREFIX = "SW5E MODULE | StarshipSheetDiag";
const STARSHIP_ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

function getSotgSubTab(app) {
	const v = app?._sw5eSotgSubTab;
	if ( v === "skills" || v === "crew" || v === "v2" ) return "overview";
	if ( v === "weapons" || v === "equipment" || v === "modifications" || v === "systems" || v === "features" ) return "overview";
	if ( SOTG_SUB_TAB_IDS.has(v) ) return v;
	return "overview";
}

function resolveStarshipItemPrimaryTab(item) {
	const group = resolveStarshipItemGroup(item);
	if ( group === "weapons" || group === "equipment" || group === "modifications" ) return STOCK_CARGO_TAB_ID;
	if ( group ) return STARSHIP_FEATURES_TAB_ID;
	return STOCK_CARGO_TAB_ID;
}

function setSotgSubTab(app, tabId) {
	if ( !app ) return;
	app._sw5eSotgSubTab = tabId;
}

/**
 * SotG inner tabs (Core / Features / Equipment / Modifications / Systems): show one panel, update nav, persist on the sheet app. Starship skills and crew render on Core.
 */
/**
 * Align SotG item-list chrome with dnd5e sheet mode: PLAY = compact rows; EDIT = full row actions.
 * @param {object} app  Actor sheet application (`app._mode`, `app.isEditable`, `app.constructor.MODES`)
 * @param {HTMLElement | null} starshipPanel  `.sw5e-starship-panel` inside the SotG tab
 */
function isStarshipSheetEditMode(app) {
	if ( !app ) return false;
	const MODES = app.constructor?.MODES;
	const hasModeEnum = MODES?.EDIT != null && MODES?.PLAY != null;
	if ( hasModeEnum ) return app._mode === MODES.EDIT;
	return app.isEditable === true;
}

/**
 * Core operations (routing + fuel): sync disabled/locked state on PLAY/EDIT toggle without a full SotG re-render.
 * Fuel cap/cost/value inputs follow sheet EDIT mode; routing select and Burn/Refuel follow actor edit permission.
 */
function applyCoreOperationsControlState(app, starshipPanel) {
	if ( !(starshipPanel instanceof HTMLElement) ) return;
	const overview = starshipPanel.querySelector("[data-sw5e-sotg-panel=\"overview\"]");
	if ( !overview ) return;

	const setupEditable = isStarshipSheetEditMode(app) && app.isEditable !== false;
	const routingEditable = app.isEditable !== false;

	const setupControlIds = [
		"sw5e-core-fuel-value",
		"sw5e-core-fuel-cap",
		"sw5e-core-fuel-cost"
	];

	for ( const id of setupControlIds ) {
		const el = overview.querySelector(`#${id}`);
		if ( el instanceof HTMLInputElement || el instanceof HTMLSelectElement ) {
			el.disabled = !setupEditable;
			el.closest(".sw5e-starship-systems-field")?.classList.toggle("sw5e-starship-systems-field--locked", !setupEditable);
		}
	}

	const routing = overview.querySelector("#sw5e-core-routing");
	if ( routing instanceof HTMLSelectElement ) {
		routing.disabled = !routingEditable;
		routing.closest(".sw5e-starship-systems-field")?.classList.toggle("sw5e-starship-systems-field--locked", !routingEditable);
	}

	for ( const btn of overview.querySelectorAll("[data-sw5e-fuel-action]") ) {
		if ( btn instanceof HTMLButtonElement ) btn.disabled = !routingEditable;
	}
	for ( const btn of overview.querySelectorAll("[data-sw5e-advanced-power-action='spend']") ) {
		if ( btn instanceof HTMLButtonElement ) btn.disabled = !routingEditable;
	}
	const recoverBtn = overview.querySelector("[data-sw5e-advanced-power-action='recover']");
	if ( recoverBtn instanceof HTMLButtonElement ) {
		recoverBtn.disabled = !routingEditable || recoverBtn.dataset.canRecover !== "1";
	}
	overview.querySelector(".sw5e-starship-core-fuel-actions")
		?.classList.toggle("sw5e-starship-core-fuel-actions--locked", !routingEditable);
	overview.querySelector(".sw5e-starship-core-advanced-power-actions")
		?.classList.toggle("sw5e-starship-core-advanced-power-actions--locked", !routingEditable);

	const advancedPowerPanel = overview.querySelector(".sw5e-starship-core-advanced-power-panel");
	if ( advancedPowerPanel ) {
		for ( const input of advancedPowerPanel.querySelectorAll("input[name^='system.attributes.power.']") ) {
			if ( input instanceof HTMLInputElement || input instanceof HTMLSelectElement ) {
				input.disabled = !setupEditable;
			}
		}
		advancedPowerPanel.querySelectorAll(".sw5e-starship-advanced-power-slot--edit")
			.forEach(row => row.classList.toggle("sw5e-starship-systems-field--locked", !setupEditable));
	}
}

function getStarshipAbilitySaveRollTooltip(label) {
	const saveRollTitle = game.i18n.format("DND5E.SavePromptTitle", { ability: label });
	return saveRollTitle && saveRollTitle !== "DND5E.SavePromptTitle"
		? `Roll ${saveRollTitle}`
		: `Roll ${label} Saving Throw`;
}

function getStarshipAbilityProficiencyHover(proficient) {
	return getExpandedProficiencyHoverLabel(proficient);
}

/**
 * Keep Core ability save tabs aligned with sheet PLAY/EDIT mode without a full SotG template re-render.
 * Play: NPC-style rollable save tab (CL4e). Edit: non-rollable tab with editable proficiency-cycle.
 */
function syncStarshipAbilitySaveTabRollState(app, starshipPanel) {
	if ( !(starshipPanel instanceof HTMLElement) ) return;
	const isEditMode = isStarshipSheetEditMode(app);

	for ( const tile of starshipPanel.querySelectorAll(".sw5e-starship-ability-strip .ability-score[data-ability]") ) {
		const key = tile.dataset.ability;
		const saveTab = tile.querySelector(".save-tab.saving-throw");
		if ( !key || !(saveTab instanceof HTMLElement) ) continue;

		const label = tile.getAttribute("title") || key.toUpperCase();
		const proficiencyCycle = saveTab.querySelector("proficiency-cycle");
		const proficient = Number(proficiencyCycle?.getAttribute("value") ?? proficiencyCycle?.value ?? 0);

		if ( isEditMode ) {
			saveTab.classList.remove("rollable");
			saveTab.removeAttribute("data-action");
			saveTab.removeAttribute("data-type");
			saveTab.removeAttribute("data-sw5e-action");
			saveTab.removeAttribute("data-ability");
			const hover = getStarshipAbilityProficiencyHover(proficient);
			if ( hover ) {
				saveTab.dataset.tooltip = hover;
				saveTab.setAttribute("aria-label", hover);
			} else {
				saveTab.removeAttribute("data-tooltip");
				saveTab.removeAttribute("aria-label");
			}
			proficiencyCycle?.removeAttribute("disabled");
		} else {
			const saveRollTooltip = getStarshipAbilitySaveRollTooltip(label);
			saveTab.classList.add("rollable");
			saveTab.dataset.action = "roll";
			saveTab.dataset.type = "ability";
			saveTab.dataset.sw5eAction = "roll-save";
			saveTab.dataset.ability = key;
			saveTab.dataset.tooltip = saveRollTooltip;
			saveTab.setAttribute("aria-label", saveRollTooltip);
			proficiencyCycle?.setAttribute("disabled", "");
		}
	}
}

function syncSotgSheetPhaseClasses(app, starshipPanel) {
	if ( !starshipPanel ) return;
	const isEditMode = isStarshipSheetEditMode(app);
	starshipPanel.classList.toggle("sw5e-starship-sotg--mode-edit", isEditMode);
	starshipPanel.classList.toggle("sw5e-starship-sotg--mode-play", !isEditMode);
	starshipPanel.classList.toggle("sw5e-starship-sotg--readonly", app.isEditable === false);
	applyCoreOperationsControlState(app, starshipPanel);
	syncStarshipAbilitySaveTabRollState(app, starshipPanel);
	const sheetRoot = starshipPanel.closest(".sw5e-starship-sheet") ?? app?.element;
	syncDestructionTrayControlState(app, sheetRoot);
}

function scheduleStarshipAbilitySaveTabSync(root, app) {
	if ( !(root instanceof HTMLElement) ) return;
	const run = () => {
		const panel = root.querySelector(".sw5e-starship-panel");
		if ( panel ) syncStarshipAbilitySaveTabRollState(app, panel);
	};
	queueMicrotask(run);
	requestAnimationFrame(run);
}

function ensureStarshipAbilitySaveTabModeSync(root, app) {
	if ( !(root instanceof HTMLElement) || root.dataset.sw5eAbilitySaveTabModeBound === "1" ) return;
	root.dataset.sw5eAbilitySaveTabModeBound = "1";

	const onModeChange = () => {
		const panel = root.querySelector(".sw5e-starship-panel");
		if ( panel ) syncSotgSheetPhaseClasses(app, panel);
		if ( app?.actor ) applyStarshipSidebarChrome(root, app.actor, app);
	};

	root.addEventListener("change", event => {
		if ( event.target?.matches?.("slide-toggle.mode-slider, .mode-slider") ) onModeChange();
	});
	root.addEventListener("click", event => {
		if ( event.target?.closest?.("slide-toggle.mode-slider, .mode-slider") ) {
			queueMicrotask(() => requestAnimationFrame(onModeChange));
		}
	});
}

function activateSotgSubTab(wrapper, app, tabId) {
	if ( !wrapper ) return;
	let id = tabId === "crew" || tabId === "v2" ? "overview" : tabId;
	id = SOTG_SUB_TAB_IDS.has(id) ? id : "overview";
	if ( !wrapper.querySelector(`[data-sw5e-sotg-panel="${id}"]`) ) id = "overview";
	wrapper.querySelectorAll("[data-sw5e-sotg-tab]").forEach(btn => {
		const sel = btn.getAttribute("data-sw5e-sotg-tab") === id;
		btn.classList.toggle("active", sel);
		btn.setAttribute("aria-selected", sel ? "true" : "false");
	});
	wrapper.querySelectorAll("[data-sw5e-sotg-panel]").forEach(panel => {
		const on = panel.getAttribute("data-sw5e-sotg-panel") === id;
		panel.classList.toggle("active", on);
		panel.toggleAttribute("hidden", !on);
	});
	setSotgSubTab(app, id);
}

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

function getSheetForm(root, app) {
	return app?.form
		?? (root instanceof HTMLFormElement ? root : root.querySelector("form"));
}

function starshipScrollOverflowYAllowsScroll(overflowY) {
	return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
}

function getStarshipSidebarScrollAnchor(shell) {
	if ( !(shell instanceof HTMLElement) ) return null;
	return shell.querySelector(".sw5e-starship-sidebar-vitals")
		?? shell.querySelector(".sw5e-starship-sidebar-movement")
		?? getStarshipSidebarNameBlock(shell);
}

/**
 * Scroll container for the starship sidebar: prefer the inner element that actually scrolls
 * (dnd5e/AppV2 often nests overflow on a child of `[data-application-part="sidebar"]`).
 * @param {HTMLElement} shell
 * @returns {HTMLElement|null}
 */
function getStarshipSheetSidebarScrollHost(shell) {
	if ( !(shell instanceof HTMLElement) ) return null;
	let el = getStarshipSidebarScrollAnchor(shell)?.parentElement ?? null;
	while ( el && shell.contains(el) ) {
		if ( el.scrollHeight > el.clientHeight ) {
			const oy = globalThis.getComputedStyle(el).overflowY;
			if ( starshipScrollOverflowYAllowsScroll(oy) ) return el;
		}
		el = el.parentElement;
	}
	const fallback = shell.querySelector("[data-application-part=\"sidebar\"]")
		?? shell.querySelector(".sheet-sidebar")
		?? shell.querySelector(".sidebar");
	return fallback instanceof HTMLElement ? fallback : null;
}

/**
 * @param {HTMLElement} shell
 * @param {EventTarget|null} editTarget
 */
function getStarshipSidebarScrollTopFromEditTarget(shell, editTarget) {
	const hostFromTarget = (() => {
		if ( !(editTarget instanceof HTMLElement) ) return null;
		const scope = editTarget.closest(
			".sw5e-starship-sidebar-vitals, .sw5e-starship-sidebar-movement, .sw5e-starship-destruction-tray, .sw5e-starship-sidebar-system-damage"
		);
		if ( !scope || !shell.contains(scope) ) return null;
		let el = scope.parentElement;
		while ( el && shell.contains(el) ) {
			if ( el.scrollHeight > el.clientHeight ) {
				const oy = globalThis.getComputedStyle(el).overflowY;
				if ( starshipScrollOverflowYAllowsScroll(oy) ) return el;
			}
			el = el.parentElement;
		}
		return null;
	})();
	const host = hostFromTarget ?? getStarshipSheetSidebarScrollHost(shell);
	return host instanceof HTMLElement ? host.scrollTop : 0;
}

/** Set when a sidebar quick-edit runs so the next sheet render can restore scroll after DOM replacement. */
const STARSHIP_PENDING_SIDEBAR_SCROLL_KEY = "_sw5eStarshipPendingSidebarScroll";

function stashStarshipPendingSidebarScroll(app, editTarget) {
	if ( !app ) return;
	const shell = app.element;
	if ( !(shell instanceof HTMLElement) ) return;
	app[STARSHIP_PENDING_SIDEBAR_SCROLL_KEY] = getStarshipSidebarScrollTopFromEditTarget(shell, editTarget);
}

/** @returns {number|null} */
function consumeStarshipPendingSidebarScroll(app) {
	if ( !app || !Object.prototype.hasOwnProperty.call(app, STARSHIP_PENDING_SIDEBAR_SCROLL_KEY) ) return null;
	const v = app[STARSHIP_PENDING_SIDEBAR_SCROLL_KEY];
	delete app[STARSHIP_PENDING_SIDEBAR_SCROLL_KEY];
	return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Read sidebar / main scroll from the live sheet element. Call at render start before sidebar blocks re-mount.
 * @param {object} app
 * @returns {{ sidebarScrollTop: number, mainScrollTop: number }}
 */
function readStarshipSheetScrollSnapshot(app) {
	let sidebarScrollTop = 0;
	let mainScrollTop = 0;
	let sotgPanelScrollTop = 0;
	const shell = app?.element;
	if ( !(shell instanceof HTMLElement) ) return { sidebarScrollTop, mainScrollTop, sotgPanelScrollTop };

	const sidebar = getStarshipSheetSidebarScrollHost(shell);
	if ( sidebar instanceof HTMLElement ) sidebarScrollTop = sidebar.scrollTop;

	const main = shell.querySelector(".window-content")
		?? shell.querySelector(".standard-form")
		?? shell.querySelector("form.application");
	if ( main instanceof HTMLElement ) mainScrollTop = main.scrollTop;

	const sotgPanel = shell.querySelector(".sw5e-starship-panel");
	if ( sotgPanel instanceof HTMLElement ) sotgPanelScrollTop = sotgPanel.scrollTop;

	return { sidebarScrollTop, mainScrollTop, sotgPanelScrollTop };
}

/**
 * Capture starship sheet view state for restore after `renderActorSheetV2` refreshes the DOM.
 * Pass scroll positions from {@link readStarshipSheetScrollSnapshot} taken at render start (before sidebar re-mount).
 * Call after default-tab init so `sw5ePrimary` / `stockPrimary` reflect the post-init app tab state.
 * @param {object} app
 * @param {{ sidebarScrollTop?: number, mainScrollTop?: number, sotgPanelScrollTop?: number }} [scrollSnapshot]
 * @returns {StarshipSheetViewState}
 */
function captureStarshipSheetViewState(app, scrollSnapshot) {
	const scroll = scrollSnapshot ?? readStarshipSheetScrollSnapshot(app);
	return {
		sidebarScrollTop: Number(scroll.sidebarScrollTop) || 0,
		mainScrollTop: Number(scroll.mainScrollTop) || 0,
		sotgPanelScrollTop: Number(scroll.sotgPanelScrollTop) || 0,
		sw5ePrimary: getStarshipActiveTab(app),
		stockPrimary: typeof app?.tabGroups?.primary === "string" ? app.tabGroups.primary : null,
		sotgSub: getSotgSubTab(app)
	};
}

/**
 * @param {string} tabId
 * @returns {string}
 */
function escapeTabSelectorValue(tabId) {
	const s = String(tabId ?? "");
	if ( typeof CSS !== "undefined" && typeof CSS.escape === "function" ) return CSS.escape(s);
	return s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

/**
 * Apply saved scroll positions to the sheet shell. Pass `mainScrollTop` / `sotgPanelScrollTop` as 0 to skip those axes.
 * @param {object} app
 * @param {{ sidebarScrollTop?: number, mainScrollTop?: number, sotgPanelScrollTop?: number }} state
 */
function applyStarshipSheetScrollPositions(app, state) {
	if ( !state || !app ) return;
	try {
		const shell = app.element;
		if ( !(shell instanceof HTMLElement) ) return;
		const sidebar = getStarshipSheetSidebarScrollHost(shell);
		if ( sidebar instanceof HTMLElement && state.sidebarScrollTop > 0 ) sidebar.scrollTop = state.sidebarScrollTop;
		const main = shell.querySelector(".window-content")
			?? shell.querySelector(".standard-form")
			?? shell.querySelector("form.application");
		if ( main instanceof HTMLElement && state.mainScrollTop > 0 ) main.scrollTop = state.mainScrollTop;
		const sotgPanel = shell.querySelector(".sw5e-starship-panel");
		if ( sotgPanel instanceof HTMLElement && state.sotgPanelScrollTop > 0 ) {
			sotgPanel.scrollTop = state.sotgPanelScrollTop;
		}
	} catch {
		/* ignore */
	}
}

/**
 * Reapply primary tab, SotG sub-tab, and scroll after a full starship layer render.
 * @param {object} app
 * @param {StarshipSheetViewState|null|undefined} state
 * @param {HTMLElement} root
 */
function restoreStarshipSheetViewState(app, state, root) {
	if ( !state || !app || !root ) return;
	try {
		const onCoreTab = state.sw5ePrimary === STARSHIP_TAB_ID || state.sw5ePrimary === true;
		const wantsFeatures = !onCoreTab
			&& (state.sotgSub === "features" || state.stockPrimary === STARSHIP_FEATURES_TAB_ID);
		if ( wantsFeatures ) {
			activateSheetTab(root, app, STARSHIP_FEATURES_TAB_ID);
			applyStarshipSheetScrollPositions(app, {
				sidebarScrollTop: Number(state.sidebarScrollTop) || 0,
				mainScrollTop: Number(state.mainScrollTop) || 0,
				sotgPanelScrollTop: 0
			});
			return;
		}

		const wantsSotg = state.sw5ePrimary === STARSHIP_TAB_ID || state.sw5ePrimary === true;
		if ( wantsSotg ) {
			activateSheetTab(root, app, STARSHIP_TAB_ID);
			const wrapper = root.querySelector(`.sw5e-starship-tab[data-tab="${STARSHIP_TAB_ID}"]`);
			const sub = SOTG_SUB_TAB_IDS.has(state.sotgSub) ? state.sotgSub : "overview";
			if ( wrapper ) activateSotgSubTab(wrapper, app, sub);
		}
		else if ( state.stockPrimary && typeof state.stockPrimary === "string" && !CUSTOM_STARSHIP_TAB_IDS.has(state.stockPrimary) ) {
			const nav = getPrimaryTabNav(root);
			const safe = escapeTabSelectorValue(state.stockPrimary);
			const tabBtn = nav?.querySelector(`[data-tab="${safe}"]`);
			if ( tabBtn ) activateSheetTab(root, app, state.stockPrimary);
			else {
				activateSheetTab(root, app, STARSHIP_TAB_ID);
				const wrapper = root.querySelector(`.sw5e-starship-tab[data-tab="${STARSHIP_TAB_ID}"]`);
				const sub = SOTG_SUB_TAB_IDS.has(state.sotgSub) ? state.sotgSub : "overview";
				if ( wrapper ) activateSotgSubTab(wrapper, app, sub);
			}
		}
		else {
			activateSheetTab(root, app, STARSHIP_TAB_ID);
			const wrapper = root.querySelector(`.sw5e-starship-tab[data-tab="${STARSHIP_TAB_ID}"]`);
			const sub = SOTG_SUB_TAB_IDS.has(state.sotgSub) ? state.sotgSub : "overview";
			if ( wrapper ) activateSotgSubTab(wrapper, app, sub);
		}
	} catch ( err ) {
		console.warn("SW5E MODULE | Starship sheet tab restore failed.", err);
		try {
			activateSheetTab(root, app, STARSHIP_TAB_ID);
			const wrapper = root.querySelector(`.sw5e-starship-tab[data-tab="${STARSHIP_TAB_ID}"]`);
			if ( wrapper ) activateSotgSubTab(wrapper, app, "overview");
		} catch {
			/* sheet still usable */
		}
	}

	// Sync: avoid painting scrollTop 0 before restore (double rAF deferred too late and caused a visible flash).
	applyStarshipSheetScrollPositions(app, state);
	// One follow-up frame after tab/layout work settles (stock dnd5e can reflow when toggling tab panels).
	window.requestAnimationFrame(() => applyStarshipSheetScrollPositions(app, state));
}

/** @typedef {{ sidebarScrollTop: number, mainScrollTop: number, sotgPanelScrollTop: number, sw5ePrimary: string|null|boolean, stockPrimary: string|null, sotgSub: string }} StarshipSheetViewState */

/**
 * dnd5e vehicle sheet can inject a second native `[name="system.traits.size"]` in EDIT mode.
 * Prefer a marked Systems control when present; otherwise keep the first match so submit stays unambiguous.
 */
function neutralizeDuplicateNativeTraitsSizeControls(root, app, actor) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const form = getSheetForm(root, app);
	if ( !form ) return;
	const matches = Array.from(form.querySelectorAll("[name=\"system.traits.size\"]"));
	if ( matches.length <= 1 ) return;

	let canonical = form.querySelector("[data-sw5e-systems-authoritative-size][name=\"system.traits.size\"]")
		?? form.querySelector(".sw5e-starship-systems-core [name=\"system.traits.size\"]");
	if ( !canonical || !matches.includes(canonical) ) canonical = matches[0];

	for ( const el of matches ) {
		if ( el === canonical ) continue;
		el.removeAttribute("name");
		el.disabled = true;
		el.setAttribute("data-sw5e-neutralized", "duplicate-native-traits-size");
		el.setAttribute("aria-hidden", "true");
		el.tabIndex = -1;
		el.classList.add("sw5e-starship-neutralized-stock-size");
	}
}

/** Authoritative Systems-tab HP inputs (sole named submit controls when duplicates exist). */
const STARSHIP_HP_FIELD_AUTH = [
	["system.attributes.hp.value", "[data-sw5e-systems-authoritative-hp=\"value\"]"],
	["system.attributes.hp.max", "[data-sw5e-systems-authoritative-hp=\"max\"]"],
	["system.attributes.hp.temp", "[data-sw5e-systems-authoritative-hp=\"temp\"]"],
	["system.attributes.hp.tempmax", "[data-sw5e-systems-authoritative-hp=\"tempmax\"]"]
];

/**
 * dnd5e vehicle sheet can surface duplicate `[name="system.attributes.hp.*"]` in EDIT mode (e.g. header meter + Systems fuel).
 * Prefer marked Systems controls when present; otherwise keep the first named match.
 */
function neutralizeDuplicateNativeHpControls(root, app, actor) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const form = getSheetForm(root, app);
	if ( !form ) return;

	for ( const [path, authSel] of STARSHIP_HP_FIELD_AUTH ) {
		const matches = Array.from(form.querySelectorAll(`[name="${path}"]`));
		if ( matches.length <= 1 ) continue;

		let canonical = form.querySelector(`${authSel}[name="${path}"]`)
			?? form.querySelector(`.sw5e-starship-systems-core [name="${path}"]`);
		if ( !canonical || !matches.includes(canonical) ) canonical = matches[0];

		for ( const el of matches ) {
			if ( el === canonical ) continue;
			el.removeAttribute("name");
			el.disabled = true;
			el.setAttribute("data-sw5e-neutralized", "duplicate-native-hp");
			el.setAttribute("aria-hidden", "true");
			el.tabIndex = -1;
			el.classList.add("sw5e-starship-neutralized-stock-hp");
		}
	}
}

function neutralizeDuplicateNativeAbilityControls(root, app, actor) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const form = getSheetForm(root, app);
	if ( !form ) return;

	for ( const key of Object.keys(CONFIG?.DND5E?.abilities ?? CONFIG?.SW5E?.abilities ?? {}) ) {
		const path = `system.abilities.${key}.value`;
		const matches = Array.from(form.querySelectorAll(`[name="${path}"]`));
		if ( matches.length <= 1 ) continue;

		let canonical = form.querySelector(`[data-sw5e-overview-edit-ability="${key}"][name="${path}"]`);
		if ( !canonical || !matches.includes(canonical) ) {
			canonical = form.querySelector(`[data-sw5e-overview-authoritative-ability="${key}"][name="${path}"]`);
		}
		if ( !canonical || !matches.includes(canonical) ) canonical = matches[0];

		for ( const el of matches ) {
			if ( el === canonical ) continue;
			el.removeAttribute("name");
			el.disabled = true;
			el.setAttribute("data-sw5e-neutralized", "duplicate-native-ability");
			el.setAttribute("aria-hidden", "true");
			el.tabIndex = -1;
		}
	}
}

function neutralizeStockVehicleAbilityControls(root, actor, app = null) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const shell = (app?.element instanceof HTMLElement ? app.element : null) ?? root;
	if ( !(shell instanceof HTMLElement) ) return;

	for ( const block of shell.querySelectorAll(".sheet-stations .abilities, [data-application-part=\"stations\"] .abilities") ) {
		if ( !(block instanceof HTMLElement) ) continue;
		block.setAttribute("hidden", "");
		block.setAttribute("aria-hidden", "true");
		block.classList.add("sw5e-starship-neutralized-stock-abilities");

		for ( const el of block.querySelectorAll("[name^=\"system.abilities.\"], button, input, select, textarea, proficiency-cycle, a[data-action], [data-action], [data-config]")) {
			if ( el instanceof HTMLElement ) {
				if ( "name" in el ) el.removeAttribute("name");
				if ( "disabled" in el ) el.disabled = true;
				el.setAttribute("data-sw5e-neutralized", "stock-abilities");
				el.setAttribute("aria-hidden", "true");
				el.tabIndex = -1;
			}
		}
	}
}

/**
 * Hide stock dnd5e vehicle Hit Points UI so starships only show SW5E Hull + Shield in the custom sidebar.
 * dnd5e 5.2.x vehicle `sidebar.hbs` uses `div.pills-group` + heart icon for Hit Points (not `.meter-group`).
 * PLAY: hidden `input[name^="system.attributes.hp."]` exists inside the block.
 * EDIT: that block has no HP inputs until inline expand — it only exposes `button[data-config="hitPoints"]` on the header.
 */
function suppressStockVehicleHpMeterForStarship(root, actor, app = null) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const shell = (app?.element instanceof HTMLElement ? app.element : null) ?? root;
	if ( !(shell instanceof HTMLElement) ) return;

	const markIfStockHpContainer = el => {
		if ( !(el instanceof HTMLElement) ) return;
		if ( el.classList.contains("sw5e-starship-sidebar-vitals") ) return;
		if ( el.closest(".sw5e-starship-sidebar-vitals") ) return;
		if ( el.closest(".sw5e-starship-panel") ) return;
		const hasHpNamedField = !!el.querySelector("[name^=\"system.attributes.hp.\"]");
		const isStockHitPointsHeader = !!el.querySelector("button[data-config=\"hitPoints\"]");
		if ( !hasHpNamedField && !isStockHitPointsHeader ) return;
		el.classList.add("sw5e-starship-suppress-stock-hp");
		el.setAttribute("hidden", "");
	};

	for ( const meter of shell.querySelectorAll(".meter-group") ) markIfStockHpContainer(meter);
	for ( const group of shell.querySelectorAll(".pills-group") ) markIfStockHpContainer(group);
}

const STARSHIP_SUPPRESSED_STOCK_MOVEMENT_LABELS = new Set(["Speed", "Travel Speed", "Travel Pace"]);

function suppressStockVehicleMovementSidebarForStarship(root, actor, app = null) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return;

	for ( const label of STARSHIP_SUPPRESSED_STOCK_MOVEMENT_LABELS ) {
		const group = findStarshipSidebarPillsGroup(shell, label);
		if ( !(group instanceof HTMLElement) ) continue;
		group.classList.add("sw5e-starship-suppress-stock-movement");
		group.setAttribute("hidden", "");
		group.setAttribute("aria-hidden", "true");
		for ( const control of group.querySelectorAll(
			"[data-action=\"showConfiguration\"][data-config=\"movement\"], [data-config=\"movement\"], [name^=\"system.attributes.movement.\"], [name^=\"system.attributes.travel.\"]"
		) ) {
			if ( !(control instanceof HTMLElement) ) continue;
			if ( "name" in control ) control.removeAttribute("name");
			if ( "disabled" in control ) control.disabled = true;
			control.setAttribute("hidden", "");
			control.setAttribute("aria-hidden", "true");
			control.tabIndex = -1;
		}
	}
}

function formatStarshipInitiativeTotal(actor) {
	const total = Number(actor?.system?.attributes?.init?.total) || 0;
	if ( typeof foundry?.utils?.formatNumber === "function" ) {
		return foundry.utils.formatNumber(total, { signDisplay: "always" });
	}
	return total >= 0 ? `+${total}` : `${total}`;
}

function starshipVitalMeterPct(current, max) {
	const cap = Math.max(0, Number(max) || 0);
	const value = Math.max(0, Number(current) || 0);
	if ( cap <= 0 ) return value > 0 ? 100 : 0;
	return Math.min(100, Math.round((value / cap) * 100));
}

function buildStarshipSidebarVitalsContext(actor) {
	const hp = getStarshipLiveVehicleHp(actor);
	const pools = deriveStarshipPools(actor);
	const hullValue = Math.max(0, Number(hp.value) || 0);
	const hullStoredMax = Math.max(0, Number(hp.max) || 0);
	const hullMax = getStarshipEffectiveHullMax(actor, hullStoredMax);
	const shieldValue = Math.max(0, Number(hp.temp) || 0);
	const shieldStoredMax = Math.max(0, Number(hp.tempmax) || 0);
	const shieldMax = getStarshipEffectiveShieldMax(actor, shieldStoredMax);
	const hullDiceCurrent = Math.max(0, Number(pools.hull?.current) || 0);
	const hullDiceMax = Math.max(0, Number(pools.hull?.max) || 0);
	const shieldDiceCurrent = Math.max(0, Number(pools.shld?.current) || 0);
	const shieldDiceMax = Math.max(0, Number(pools.shld?.max) || 0);

	return {
		hull: { value: hullValue, max: hullMax, pct: starshipVitalMeterPct(hullValue, hullMax) },
		shield: { value: shieldValue, max: shieldMax, pct: starshipVitalMeterPct(shieldValue, shieldMax) },
		hullDice: {
			current: hullDiceCurrent,
			max: hullDiceMax,
			die: pools.hull?.die ?? "",
			pct: starshipVitalMeterPct(hullDiceCurrent, hullDiceMax)
		},
		shieldDice: {
			current: shieldDiceCurrent,
			max: shieldDiceMax,
			die: pools.shld?.die ?? "",
			pct: starshipVitalMeterPct(shieldDiceCurrent, shieldDiceMax)
		}
	};
}

function buildStarshipSidebarSummaryLabels() {
	return {
		hullPoints: localizeOrFallback("SW5E.HullPoints", "Hull Points"),
		shieldPoints: localizeOrFallback("SW5E.ShieldPoints", "Shield Points"),
		hullDice: localizeOrFallback("SW5E.HullDice", "Hull Dice"),
		shieldDice: localizeOrFallback("SW5E.ShieldDice", "Shield Dice"),
		configureHullPoints: localizeOrFallback("SW5E.StarshipVitalConfig.ConfigureHullPoints", "Configure Hull Points"),
		configureShieldPoints: localizeOrFallback("SW5E.StarshipVitalConfig.ConfigureShieldPoints", "Configure Shield Points"),
		configureHullDice: localizeOrFallback("SW5E.StarshipVitalConfig.ConfigureHullDice", "Configure Hull Dice"),
		configureShieldDice: localizeOrFallback("SW5E.StarshipVitalConfig.ConfigureShieldDice", "Configure Shield Dice")
	};
}

const STARSHIP_SUPPRESSED_SIDEBAR_OPTION_NAMES = new Set([
	"flags.dnd5e.showVehicleInitiative",
	"flags.dnd5e.showVehicleQuality",
	"system.attributes.actions.stations"
]);

function isStarshipSidebarShellElement(el) {
	if ( !(el instanceof HTMLElement) ) return false;
	return el.matches(".sheet-sidebar, [data-application-part='sidebar'], .sidebar");
}

/**
 * Resolve the smallest row to hide for a stock vehicle sidebar option input.
 * EDIT mode slide-toggles are often direct children of `aside.sheet-sidebar` (no `.option` wrapper);
 * never climb to the sidebar shell itself.
 */
function getStarshipSuppressedSidebarOptionRow(input) {
	if ( !(input instanceof HTMLElement) ) return null;

	const option = input.closest(".option");
	if ( option instanceof HTMLElement && !isStarshipSidebarShellElement(option) ) return option;

	const toggle = input.closest("label.slide-toggle, slide-toggle");
	if ( toggle instanceof HTMLElement && !isStarshipSidebarShellElement(toggle) ) return toggle;

	const label = input.closest("label");
	if ( label instanceof HTMLElement && !isStarshipSidebarShellElement(label) ) return label;

	const parent = label?.parentElement;
	if ( parent instanceof HTMLElement && !isStarshipSidebarShellElement(parent) ) return parent;

	return null;
}

function suppressStockVehicleSidebarControlsForStarship(root, actor, app = null) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return;

	for ( const name of STARSHIP_SUPPRESSED_SIDEBAR_OPTION_NAMES ) {
		for ( const input of shell.querySelectorAll(`input[name="${name}"]`) ) {
			const row = getStarshipSuppressedSidebarOptionRow(input);
			if ( !(row instanceof HTMLElement) || isStarshipSidebarShellElement(row) ) continue;
			row.classList.add("sw5e-starship-suppress-stock-sidebar-option");
			row.setAttribute("hidden", "");
			row.setAttribute("aria-hidden", "true");
		}
	}

	for ( const group of shell.querySelectorAll(".pills-group") ) {
		if ( !group.querySelector("[name^=\"system.attributes.actions\"]") ) continue;
		group.classList.add("sw5e-starship-suppress-stock-sidebar-option");
		group.setAttribute("hidden", "");
		group.setAttribute("aria-hidden", "true");
	}

	for ( const pips of shell.querySelectorAll(".pips[data-prop=\"system.attributes.actions.spent\"]") ) {
		pips.classList.add("sw5e-starship-suppress-stock-action-pips");
		pips.setAttribute("hidden", "");
		pips.setAttribute("aria-hidden", "true");
	}
}

function customizeStarshipPortraitBadges(root, actor, app = null) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const shell = getStarshipSidebarShell(root, app);
	const portrait = shell?.querySelector(".portrait");
	if ( !(portrait instanceof HTMLElement) ) return;

	const initLabel = localizeOrFallback("DND5E.Initiative", "Initiative");
	const initDisplay = formatStarshipInitiativeTotal(actor);
	let initWrapper = portrait.querySelector(".initiative-wrapper");

	if ( !(initWrapper instanceof HTMLElement) ) {
		initWrapper = document.createElement("div");
		initWrapper.className = "initiative-wrapper";
		const initBlock = document.createElement("div");
		initBlock.className = "initiative";
		initBlock.setAttribute("aria-label", initLabel);
		const span = document.createElement("span");
		span.textContent = initDisplay;
		initBlock.append(span);
		initWrapper.append(initBlock);
		portrait.prepend(initWrapper);
	} else {
		initWrapper.hidden = false;
		initWrapper.removeAttribute("hidden");
		initWrapper.style.removeProperty("display");
		const initBlock = initWrapper.querySelector(".initiative");
		if ( initBlock && !initBlock.querySelector("input") ) {
			let span = initBlock.querySelector("span");
			if ( !span ) {
				span = document.createElement("span");
				initBlock.append(span);
			}
			span.textContent = initDisplay;
		}
	}

	for ( const badge of portrait.querySelectorAll(".loyalty-badge") ) {
		if ( !badge.querySelector("[name=\"system.attributes.quality.value\"]") ) continue;
		badge.classList.add("sw5e-starship-suppress-stock-quality");
		badge.setAttribute("hidden", "");
		badge.setAttribute("aria-hidden", "true");
	}

	const tierLabel = localizeOrFallback("SW5E.StarshipTier", "Starship Tier");
	const tierValue = buildSystemsCoreContext(actor).tierValue;
	let tierBadge = portrait.querySelector(".sw5e-starship-tier-badge");
	if ( !(tierBadge instanceof HTMLElement) ) {
		tierBadge = document.createElement("div");
		tierBadge.className = "loyalty-badge badge sw5e-starship-tier-badge";
		portrait.append(tierBadge);
	}
	tierBadge.hidden = false;
	tierBadge.removeAttribute("aria-hidden");
	tierBadge.textContent = String(tierValue);
	tierBadge.dataset.tooltip = tierLabel;
	tierBadge.setAttribute("aria-label", `${tierLabel}: ${tierValue}`);
}

function applyStarshipSidebarChrome(root, actor, app = null) {
	if ( !isSw5eStarshipActor(actor) ) return;
	suppressStockVehicleSidebarControlsForStarship(root, actor, app);
	customizeStarshipPortraitBadges(root, actor, app);
	mountStarshipLegacyPowerRoutingSidebarToggle(root, actor, app);
}

function getActorLegacyPowerRoutingFlag(actor) {
	return Boolean(actor?.getFlag?.(SETTINGS_NAMESPACE, STARSHIP_LEGACY_POWER_ROUTING_FLAG));
}

function syncLegacyPowerRoutingToggleVisual(toggle, checked) {
	if ( !(toggle instanceof HTMLElement) ) return;
	const input = toggle.querySelector("input[data-sw5e-legacy-power-routing-toggle]");
	if ( input instanceof HTMLInputElement ) input.checked = Boolean(checked);
	const icon = toggle.querySelector("i");
	if ( icon ) icon.className = checked ? "fa-solid fa-toggle-on" : "fa-solid fa-toggle-off";
}

/**
 * Edit-mode sidebar option: per-actor legacy Power Routing override (slide toggle under Show Abilities).
 */
function mountStarshipLegacyPowerRoutingSidebarToggle(root, actor, app = null) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return;

	const existing = shell.querySelector("[data-sw5e-starship-legacy-routing-toggle]");
	if ( !isStarshipSheetEditMode(app) ) {
		existing?.remove();
		return;
	}

	const checked = getActorLegacyPowerRoutingFlag(actor);
	const labelText = localizeOrFallback(
		"SW5E.StarshipSheet.ShowLegacyPowerRouting",
		"Show Power Routing"
	);
	const tooltipText = localizeOrFallback(
		"SW5E.StarshipSheet.ShowLegacyPowerRoutingTooltip",
		"Show legacy Power Routing controls"
	);
	const flagPath = `flags.${SETTINGS_NAMESPACE}.${STARSHIP_LEGACY_POWER_ROUTING_FLAG}`;

	let toggle = existing;
	if ( !(toggle instanceof HTMLElement) ) {
		toggle = document.createElement("label");
		toggle.className = "slide-toggle header-interactable sw5e-starship-legacy-routing-toggle";
		toggle.dataset.sw5eStarshipLegacyRoutingToggle = "1";

		const input = document.createElement("input");
		input.type = "checkbox";
		input.name = flagPath;
		input.dataset.sw5eLegacyPowerRoutingToggle = "1";

		const icon = document.createElement("i");
		icon.setAttribute("inert", "");

		toggle.append(input, document.createTextNode(labelText), icon);

		const abilitiesInput = shell.querySelector('input[name="flags.dnd5e.showVehicleAbilities"]');
		const abilitiesLabel = abilitiesInput?.closest("label.slide-toggle");
		if ( abilitiesLabel instanceof HTMLElement ) {
			abilitiesLabel.insertAdjacentElement("afterend", toggle);
		} else {
			shell.append(toggle);
		}
	} else {
		const input = toggle.querySelector("input[data-sw5e-legacy-power-routing-toggle]");
		let node = input?.nextSibling;
		while ( node && node.nodeType !== Node.TEXT_NODE ) node = node.nextSibling;
		if ( node?.nodeType === Node.TEXT_NODE ) node.textContent = labelText;
	}

	toggle.title = tooltipText;
	toggle.dataset.tooltip = tooltipText;
	toggle.setAttribute("aria-label", labelText);

	syncLegacyPowerRoutingToggleVisual(toggle, checked);
}

function ensureStarshipMovementConfigBlocked(root, app, actor) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return;
	if ( shell.dataset.sw5eMovementConfigBound === "1" ) return;
	shell.dataset.sw5eMovementConfigBound = "1";
	shell.addEventListener("click", event => {
		const target = event.target.closest("[data-action=\"showConfiguration\"][data-config=\"movement\"]");
		if ( !target ) return;
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
		void openStarshipMovementConfig(actor, app, { isEditMode: isStarshipSheetEditMode(app) });
	}, true);
}

function bindStarshipSidebarMovementConfig(movementBlock, actor, app) {
	if ( !(movementBlock instanceof HTMLElement) ) return;
	const button = movementBlock.querySelector("[data-sw5e-starship-movement-config]");
	if ( !(button instanceof HTMLButtonElement) ) return;
	if ( button.dataset.sw5eMovementConfigBound === "1" ) return;
	button.dataset.sw5eMovementConfigBound = "1";
	button.addEventListener("click", event => {
		event.preventDefault();
		event.stopPropagation();
		void openStarshipMovementConfig(actor, app, { isEditMode: isStarshipSheetEditMode(app) });
	});
}

/** Stock sheet may insert duplicates after paint — retry through the next frames + short delays. */
function scheduleStarshipDuplicateSizeNeutralize(root, app, actor) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const run = () => {
		neutralizeDuplicateNativeTraitsSizeControls(root, app, actor);
		neutralizeDuplicateNativeHpControls(root, app, actor);
		neutralizeDuplicateNativeAbilityControls(root, app, actor);
		neutralizeStockVehicleAbilityControls(root, actor, app);
		suppressStockVehicleHpMeterForStarship(root, actor, app);
		suppressStockVehicleMovementSidebarForStarship(root, actor, app);
		applyStarshipSidebarChrome(root, actor, app);
		ensureStarshipMovementConfigBlocked(root, app, actor);
		void renderStarshipSidebarMovement(root, actor, app);
	};
	run();
	queueMicrotask(run);
	window.setTimeout(run, 0);
	window.requestAnimationFrame(() => {
		window.requestAnimationFrame(() => {
			run();
			window.setTimeout(run, 48);
			window.setTimeout(run, 160);
		});
	});
}

function syncStarshipOverviewAuthoritativeAbilityInput(input) {
	if ( !(input instanceof HTMLInputElement) ) return;
	const key = input.dataset.sw5eOverviewEditAbility;
	if ( !key ) return;
	const path = input.dataset.sw5eOverviewInputName || `system.abilities.${key}.value`;
	const form = input.form;
	if ( !(form instanceof HTMLFormElement) ) return;
	const hidden = form.querySelector(`[data-sw5e-overview-authoritative-ability="${key}"][name="${path}"]`);
	if ( !(hidden instanceof HTMLInputElement) ) return;
	hidden.value = input.value;
}

function ensureStarshipOverviewAbilityMirrors(root, _app, actor) {
	if ( !isSw5eStarshipActor(actor) ) return;
	if ( !root || root.dataset.sw5eOverviewAbilityMirrorBound === "1" ) return;
	root.dataset.sw5eOverviewAbilityMirrorBound = "1";
	const sync = event => {
		const el = event.target;
		if ( !(el instanceof HTMLInputElement) ) return;
		if ( !el.matches("[data-sw5e-overview-edit-ability]") ) return;
		syncStarshipOverviewAuthoritativeAbilityInput(el);
	};
	root.addEventListener("input", sync);
	root.addEventListener("change", sync);
}

/**
 * Temporary: audit DOM + optional form submit for `system.traits.size` (module scope only).
 * Stock vehicle sheet may register a second native control; custom Systems + sidebar use module templates.
 */
function ensureStarshipSheetSubmitDiagnostic(root, app, actor) {
	if ( !SW5E_STARSHIP_SHEET_DIAG_ENABLED ) return;
	if ( !isSw5eStarshipActor(actor) ) return;
	const form = getSheetForm(root, app);
	if ( !form || form.dataset.sw5eStarshipDiagSubmitBound === "1" ) return;
	form.dataset.sw5eStarshipDiagSubmitBound = "1";
	form.addEventListener("submit", () => {
		const a = app.actor;
		if ( !isSw5eStarshipActor(a) ) return;
		try {
			const fd = new FormData(form);
			const traitsSizePairs = [];
			for ( const [k, v] of fd.entries() ) {
				if ( k === "system.traits.size" || k.endsWith(".traits.size") ) traitsSizePairs.push([k, String(v)]);
			}
			const named = form.querySelectorAll("[name=\"system.traits.size\"]");
			const abilitySnapshots = STARSHIP_ABILITY_KEYS.map(key => {
				const path = `system.abilities.${key}.value`;
				const namedInputs = Array.from(form.querySelectorAll(`[name="${path}"]`));
				return {
					key,
					formDataValue: fd.get(path),
					namedCount: namedInputs.length,
					inputs: namedInputs.map((el, i) => ({
						i,
						type: el.getAttribute("type"),
						value: el.value,
						disabled: el.disabled,
						id: el.id || null,
						className: el.className?.slice?.(0, 120) ?? ""
					}))
				};
			});
			console.info(SW5E_STARSHIP_SHEET_DIAG_PREFIX, "formSubmit (capture phase)", {
				actorId: a.id,
				formTraitsSizeKeyPairs: traitsSizePairs,
				namedNameCount: named.length,
				abilitySnapshots,
				namedSnapshots: Array.from(named).map((el, i) => ({
					i,
					value: el.value,
					disabled: el.disabled,
					id: el.id || null,
					className: el.className?.slice?.(0, 120) ?? ""
				}))
			});
		} catch ( err ) {
			console.warn(SW5E_STARSHIP_SHEET_DIAG_PREFIX, "formSubmit capture failed", err);
		}
	}, true);
}

function runStarshipSheetDiagnostics(root, app, actor, phase) {
	if ( !SW5E_STARSHIP_SHEET_DIAG_ENABLED ) return;
	if ( !isSw5eStarshipActor(actor) ) return;

	const form = getSheetForm(root, app);
	const edit = isStarshipSheetEditMode(app);
	const prevMode = app._sw5eDiagSheetMode;
	if ( prevMode !== undefined && prevMode !== edit ) {
		console.info(SW5E_STARSHIP_SHEET_DIAG_PREFIX, "sheetEditModeTransition (after render)", {
			phase,
			actorId: actor.id,
			from: prevMode ? "EDIT" : "PLAY",
			to: edit ? "EDIT" : "PLAY",
			appMode: app._mode,
			modeEnum: app.constructor?.MODES ?? null
		});
	}
	app._sw5eDiagSheetMode = edit;

	const namedAll = root.querySelectorAll("[name=\"system.traits.size\"]");
	const dataPath = root.querySelectorAll("[data-sw5e-system-path=\"system.traits.size\"]");
	const namedInForm = form ? form.querySelectorAll("[name=\"system.traits.size\"]") : [];
	const abilityDomAudit = STARSHIP_ABILITY_KEYS.map(key => {
		const path = `system.abilities.${key}.value`;
		const named = form ? Array.from(form.querySelectorAll(`[name="${path}"]`)) : [];
		return {
			key,
			count: named.length,
			values: named.map((el, i) => ({
				i,
				type: el.getAttribute("type"),
				value: el.value,
				disabled: el.disabled,
				className: el.className?.slice?.(0, 100) ?? ""
			}))
		};
	});

	console.info(SW5E_STARSHIP_SHEET_DIAG_PREFIX, "domAudit", {
		phase,
		actorId: actor.id,
		sheetMode: edit ? "EDIT" : "PLAY",
		namedSystemTraitsSize_totalUnderRoot: namedAll.length,
		namedSystemTraitsSize_insideForm: namedInForm.length,
		dataSw5eSystemPath_traitsSize: dataPath.length,
		formElementFound: Boolean(form),
		validActorSizeKeys: Object.keys(CONFIG?.DND5E?.actorSizes ?? {}),
		persistedActorSystemTraitsSize: actor.system?.traits?.size,
		abilityDomAudit,
		namedDetails: Array.from(namedAll).map((el, i) => ({
			i,
			tag: el.tagName,
			id: el.id || null,
			inForm: form ? form.contains(el) : false,
			value: el.value,
			disabled: el.disabled,
			className: el.className?.slice?.(0, 100) ?? ""
		})),
		dataPathDetails: Array.from(dataPath).map((el, i) => ({
			i,
			tag: el.tagName,
			inForm: form ? form.contains(el) : false,
			value: el.value,
			className: el.className?.slice?.(0, 100) ?? ""
		}))
	});
}

function logStarshipPreUpdateTraitsIncoming(document, changed) {
	if ( !SW5E_STARSHIP_SHEET_DIAG_ENABLED ) return;
	if ( !isSw5eStarshipActor(document) ) return;
	if ( !foundry.utils.hasProperty(changed, "system.traits.size") ) return;
	const incoming = foundry.utils.getProperty(changed, "system.traits.size");
	const keys = Object.keys(CONFIG?.DND5E?.actorSizes ?? {});
	console.info(SW5E_STARSHIP_SHEET_DIAG_PREFIX, "preUpdateActor INCOMING (before sanitize)", {
		actorId: document.id,
		"system.traits.size": incoming,
		incomingIsBlank: incoming === "" || incoming === undefined,
		incomingIsValidKey: typeof incoming === "string" && keys.includes(incoming)
	});
}

function logStarshipPreUpdateTraitsAfterSanitize(document, changed) {
	if ( !SW5E_STARSHIP_SHEET_DIAG_ENABLED ) return;
	if ( !isSw5eStarshipActor(document) ) return;
	if ( !foundry.utils.hasProperty(changed, "system.traits.size") ) return;
	const val = foundry.utils.getProperty(changed, "system.traits.size");
	const keys = Object.keys(CONFIG?.DND5E?.actorSizes ?? {});
	console.info(SW5E_STARSHIP_SHEET_DIAG_PREFIX, "preUpdateActor AFTER sanitize hook", {
		actorId: document.id,
		"system.traits.size": val,
		isValidKey: typeof val === "string" && keys.includes(val)
	});
}

function logStarshipPreUpdateAbilities(document, changed, phase = "incoming") {
	if ( !SW5E_STARSHIP_SHEET_DIAG_ENABLED ) return;
	if ( !isSw5eStarshipActor(document) ) return;
	const details = STARSHIP_ABILITY_KEYS.flatMap(key => {
		const path = `system.abilities.${key}.value`;
		if ( !foundry.utils.hasProperty(changed, path) ) return [];
		return [{
			key,
			path,
			changedValue: foundry.utils.getProperty(changed, path),
			sourceValue: document?._source?.system?.abilities?.[key]?.value,
			liveValue: document?.system?.abilities?.[key]?.value
		}];
	});
	if ( !details.length ) return;
	console.info(SW5E_STARSHIP_SHEET_DIAG_PREFIX, `preUpdateActor ABILITIES (${phase})`, {
		actorId: document.id,
		details
	});
}

/** Vehicle HP fields validated as integers by dnd5e; sidebar quick-edit must never submit raw "" / floats. */
const STARSHIP_INTEGER_HP_PATHS = new Set([
	"system.attributes.hp.value",
	"system.attributes.hp.max",
	"system.attributes.hp.temp",
	"system.attributes.hp.tempmax"
]);

function coerceStarshipIntegerHpField(actor, systemPath, raw) {
	const m = /^system\.attributes\.hp\.(value|max|temp|tempmax)$/.exec(systemPath);
	if ( !m ) return null;
	const key = m[1];
	const prev = Number(actor?.system?.attributes?.hp?.[key]);
	const fallback = Number.isFinite(prev) ? Math.trunc(prev) : 0;
	const trimmed = String(raw ?? "").trim();
	if ( trimmed === "" ) return fallback;
	const n = Number(trimmed);
	if ( !Number.isFinite(n) ) return fallback;
	return Math.max(0, Math.trunc(n));
}

/** Power routing keys persisted on `system.attributes.power.routing` (includes legacy `central`). */
const STARSHIP_ROUTING_KEYS = ["none", "central", "engines", "shields", "weapons"];

/** User-facing routing selector options (legacy `central` omitted; stored values normalized on read). */
const STARSHIP_ROUTING_KEYS_VISIBLE = ["none", "engines", "shields", "weapons"];

function getEffectivePowerRouting(routing) {
	return routing === "central" ? "none" : (routing ?? "none");
}

function buildStarshipRoutingOptionLabel(value) {
	if ( value === "none" ) return localizeOrFallback("SW5E.PowerRoutingNone", "None");
	const optionKey = `SW5E.PowerRoutingOption.${value.charAt(0).toUpperCase()}${value.slice(1)}`;
	return localizeOrFallback(optionKey, value);
}

function buildStarshipRoutingOptionTooltip(value) {
	const key = `SW5E.StarshipSheet.PowerRoutingTooltip.${value}`;
	const fallbacks = {
		none: "No power is being routed. Space speed and weapon damage use their base derived values.",
		engines: "Route power to engines. Space speed is doubled; other routed systems run at reduced capacity.",
		shields: "Route power to shields. Tracked only — no shield boost yet; engines and weapons still run at reduced capacity.",
		weapons: "Route power to weapons. Starship weapon damage is doubled; other routed systems run at reduced capacity."
	};
	return localizeOrFallback(key, fallbacks[value] ?? "");
}

function buildStarshipRoutingSelectionEffect(routing) {
	const effective = getEffectivePowerRouting(routing);
	if ( effective === "engines" ) {
		return localizeOrFallback(
			"SW5E.StarshipSheet.PowerRoutingEffectEngines",
			"Enforced: space speed ×2. Weapons and shields run at reduced capacity."
		);
	}
	if ( effective === "weapons" ) {
		return localizeOrFallback(
			"SW5E.StarshipSheet.PowerRoutingEffectWeapons",
			"Enforced: starship weapon damage ×2. Engines and shields run at reduced capacity."
		);
	}
	if ( effective === "shields" ) {
		return localizeOrFallback(
			"SW5E.StarshipSheet.PowerRoutingEffectShields",
			"Tracked only: shield routing is stored but does not boost shields yet. Engines and weapons still run at reduced capacity."
		);
	}
	return localizeOrFallback(
		"SW5E.StarshipSheet.PowerRoutingEffectNone",
		"No routing boost is applied to space speed or weapon damage."
	);
}

function buildStarshipFuelBarContext(fuelValue, fuelCap) {
	const value = Number.isFinite(Number(fuelValue)) ? Math.max(0, Math.trunc(Number(fuelValue))) : 0;
	const cap = Number.isFinite(Number(fuelCap)) ? Math.max(0, Math.trunc(Number(fuelCap))) : 0;
	const pct = cap > 0
		? Math.min(100, Math.max(0, Math.round((value / cap) * 100)))
		: (value > 0 ? 100 : 0);
	const barLabel = cap > 0 ? `${value} / ${cap} units` : `${value} units`;
	return { fuelPct: pct, fuelBarLabel: barLabel, fuelHasCap: cap > 0 };
}

const STARSHIP_VITAL_INLINE_PATHS = new Set([
	"system.attributes.hp.value",
	"system.attributes.hp.temp"
]);

function parseStarshipVitalInlineDelta(raw, current) {
	const parseDelta = game?.dnd5e?.utils?.parseDelta ?? globalThis.dnd5e?.utils?.parseDelta;
	if ( typeof parseDelta === "function" ) {
		const value = parseDelta(String(raw ?? "").trim(), Number(current) || 0);
		return Number.isFinite(value) ? Math.trunc(value) : null;
	}
	const text = String(raw ?? "").trim();
	if ( !text ) return null;
	let value = Number(text);
	if ( text[0] === "+" || text[0] === "-" ) value = (Number(current) || 0) + parseFloat(text);
	else if ( text[0] === "=" ) value = Number(text.slice(1));
	return Number.isFinite(value) ? Math.trunc(value) : null;
}

function clampStarshipVitalInlineValue(actor, systemPath, value) {
	const hp = actor?.system?.attributes?.hp ?? {};
	let next = Math.max(0, Math.trunc(Number(value) || 0));
	if ( systemPath === "system.attributes.hp.value" ) {
		const max = getStarshipEffectiveHullMax(actor, hp.max);
		if ( max > 0 ) next = Math.min(next, max);
	} else if ( systemPath === "system.attributes.hp.temp" ) {
		const max = getStarshipEffectiveShieldMax(actor, hp.tempmax);
		if ( max > 0 ) next = Math.min(next, max);
	}
	return next;
}

function toggleStarshipVitalMeterDisplay(event, edit) {
	const meter = event.currentTarget?.closest?.('[role="meter"]');
	if ( !(meter instanceof HTMLElement) ) return;
	if ( event.target?.closest?.("button") ) return;
	const label = meter.querySelector(":scope > .label");
	const input = meter.querySelector(":scope > input[data-sw5e-vital-path]");
	if ( !(label instanceof HTMLElement) || !(input instanceof HTMLInputElement) ) return;
	label.hidden = edit;
	input.hidden = !edit;
	if ( edit ) {
		input.focus();
		input.select?.();
	}
}

function bindStarshipVitalsMeterControls(root, actor, app) {
	if ( !(root instanceof HTMLElement) || !isSw5eStarshipActor(actor) ) return;
	const vitals = root.querySelector(".sw5e-starship-sidebar-vitals");
	if ( !(vitals instanceof HTMLElement) ) return;

	const playMode = !isStarshipSheetEditMode(app) && app?.isEditable !== false;
	for ( const meter of vitals.querySelectorAll(".sw5e-starship-vital-play-meter[role='meter']") ) {
		const input = meter.querySelector(":scope > input[data-sw5e-vital-path]");
		if ( !(input instanceof HTMLInputElement) ) continue;
		if ( meter.dataset.sw5eVitalMeterBound === "1" ) continue;
		meter.dataset.sw5eVitalMeterBound = "1";
		meter.classList.toggle("sw5e-starship-vital-play-meter--interactive", playMode);
		if ( !playMode ) continue;

		meter.addEventListener("click", event => {
			if ( isStarshipSheetEditMode(app) || app?.isEditable === false ) return;
			toggleStarshipVitalMeterDisplay(event, true);
		});
		input.addEventListener("blur", event => toggleStarshipVitalMeterDisplay(event, false));
		input.addEventListener("keydown", event => {
			if ( event.key === "Enter" ) event.currentTarget.blur();
			if ( event.key === "Escape" ) {
				event.currentTarget.value = event.currentTarget.defaultValue;
				event.currentTarget.blur();
			}
		});
		input.addEventListener("change", async event => {
			const path = event.currentTarget.getAttribute("data-sw5e-vital-path");
			if ( !path || !STARSHIP_VITAL_INLINE_PATHS.has(path) ) return;
			const act = app?.actor ?? actor;
			if ( !act ) return;
			const hpKey = path.endsWith(".temp") ? "temp" : "value";
			const current = Number(act.system?.attributes?.hp?.[hpKey]) || 0;
			let next = parseStarshipVitalInlineDelta(event.currentTarget.value, current);
			if ( next === null ) next = clampStarshipVitalInlineValue(act, path, current);
			else next = clampStarshipVitalInlineValue(act, path, next);
			if ( next === current ) {
				event.currentTarget.value = String(next);
				return;
			}
			try {
				stashStarshipPendingSidebarScroll(app, event.currentTarget);
				await persistStarshipFuelPowerSystemPath(act, path, next);
			} catch ( err ) {
				consumeStarshipPendingSidebarScroll(app);
				console.error("SW5E MODULE | Starship vital inline update failed.", err);
			}
		});
	}
}

function ensureStarshipVitalsDelegate(root, app) {
	if ( !root || root.dataset.sw5eVitalsDelegate === "1" ) return;
	root.dataset.sw5eVitalsDelegate = "1";
	root.addEventListener("click", event => {
		const configBtn = event.target.closest("[data-sw5e-vital-config]");
		if ( !configBtn ) return;
		const act = app?.actor;
		if ( !act || app?.isEditable === false ) return;
		if ( !isStarshipSheetEditMode(app) ) return;
		event.preventDefault();
		event.stopPropagation();
		openStarshipVitalConfig(act, configBtn.dataset.sw5eVitalConfig);
	});
}

/** SoTG Systems subtab: `name=` controls sit inside the vehicle sheet form; persist on `change` via trusted update (see delegate). */
const STARSHIP_SYSTEMS_CORE_DIRECT_PATHS = new Set([
	"system.attributes.power.routing",
	"system.attributes.power.die",
	"system.attributes.fuel.value",
	"system.attributes.fuel.fuelCap",
	"system.attributes.fuel.cost",
	...STARSHIP_POWER_DIE_SLOTS.flatMap(slot => [
		`system.attributes.power.${slot}.value`,
		`system.attributes.power.${slot}.max`
	]),
	"system.attributes.death.success",
	"system.attributes.death.failure"
]);

/** @returns {Promise<void>} */
async function persistStarshipFuelPowerSystemPath(act, systemPath, value) {
	await persistStarshipLegacyAttributePath(act, systemPath, value);
}

function coerceSidebarFuelValue(actor, raw) {
	const prev = Number(actor?.system?.attributes?.fuel?.value);
	const fallback = Number.isFinite(prev) ? Math.max(0, Math.trunc(prev)) : 0;
	const trimmed = String(raw ?? "").trim();
	if ( trimmed === "" ) return fallback;
	const n = Number(trimmed);
	if ( !Number.isFinite(n) ) return fallback;
	return Math.max(0, Math.trunc(n));
}

/** @param {"fuelCap"|"cost"} subKey */
function coerceStarshipFuelCapOrCost(actor, subKey, raw) {
	const prev = Number(actor?.system?.attributes?.fuel?.[subKey]);
	const fallback = Number.isFinite(prev) ? Math.max(0, Math.trunc(prev)) : 0;
	const trimmed = String(raw ?? "").trim();
	if ( trimmed === "" ) return fallback;
	const n = Number(trimmed);
	if ( !Number.isFinite(n) ) return fallback;
	return Math.max(0, Math.trunc(n));
}

function coerceStarshipPowerSlotField(actor, slotKey, field, raw) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const power = legacySystem.attributes?.power ?? {};
	const pools = deriveStarshipPools(actor);
	const prevValue = Number.isFinite(Number(power[slotKey]?.value)) ? Number(power[slotKey].value) : 0;
	const storedMax = Number(power[slotKey]?.max);
	const prevMax = Number.isFinite(storedMax) && storedMax > 0
		? storedMax
		: (slotKey === "central" ? (pools.power.cscap ?? 0) : (pools.power.sscap ?? 0));
	const prev = field === "max" ? prevMax : prevValue;
	const trimmed = String(raw ?? "").trim();
	if ( trimmed === "" ) return Math.max(0, Math.trunc(prev));
	const n = Number(trimmed);
	if ( !Number.isFinite(n) ) return Math.max(0, Math.trunc(prev));
	return Math.max(0, Math.trunc(n));
}

const STARSHIP_POWER_DIE_OPTIONS = ["d4", "d6", "d8", "d10", "d12"];

function coerceStarshipPowerDie(raw) {
	const trimmed = String(raw ?? "").trim().toLowerCase();
	if ( STARSHIP_POWER_DIE_OPTIONS.includes(trimmed) ) return trimmed;
	return "d8";
}

function coerceStarshipDestructionTrack(raw) {
	const n = Number(String(raw ?? "").trim());
	if ( !Number.isFinite(n) ) return 0;
	return Math.max(0, Math.min(3, Math.trunc(n)));
}

/**
 * SoTG Systems subtab: whitelisted `name="system...."` fields inside the vehicle form call `actor.update` on change
 * (the in-form early return would otherwise skip them; dnd5e does not persist these paths reliably from the sheet form).
 * Fallback: other Systems `name=` controls outside the form only.
 */
function ensureStarshipTrustedSystemPathDelegate(root, app) {
	if ( !root || root.dataset.sw5eTrustedSystemDelegate === "1" ) return;
	root.dataset.sw5eTrustedSystemDelegate = "1";
	root.addEventListener("change", async event => {
		const el = event.target;
		if ( !(el instanceof HTMLInputElement || el instanceof HTMLSelectElement) ) return;

		const inSystemPathScope = el.closest(".sw5e-starship-system-path-scope, .sw5e-starship-systems-core");
		const act = app?.actor;
		if ( !act ) return;

		if ( inSystemPathScope && el.name && STARSHIP_SYSTEMS_CORE_DIRECT_PATHS.has(el.name) ) {
			const path = el.name;
			let value;
			if ( path === "system.attributes.power.routing" ) {
				if ( !STARSHIP_ROUTING_KEYS_VISIBLE.includes(el.value) ) return;
				value = el.value;
			} else if ( path === "system.attributes.fuel.value" ) {
				value = coerceSidebarFuelValue(act, el.value);
			} else if ( path === "system.attributes.fuel.fuelCap" ) {
				value = coerceStarshipFuelCapOrCost(act, "fuelCap", el.value);
			} else if ( path === "system.attributes.fuel.cost" ) {
				value = coerceStarshipFuelCapOrCost(act, "cost", el.value);
			} else if ( path === "system.attributes.power.die" ) {
				value = coerceStarshipPowerDie(el.value);
			} else if ( path === "system.attributes.death.success" || path === "system.attributes.death.failure" ) {
				value = coerceStarshipDestructionTrack(el.value);
			} else {
				const slotMatch = path.match(/^system\.attributes\.power\.(\w+)\.(value|max)$/);
				if ( !slotMatch || !STARSHIP_POWER_DIE_SLOTS.includes(slotMatch[1]) ) return;
				value = coerceStarshipPowerSlotField(act, slotMatch[1], slotMatch[2], el.value);
			}
			try {
				await persistStarshipFuelPowerSystemPath(act, path, value);
			} catch ( err ) {
				console.error("SW5E MODULE | Starship Systems subtab update failed.", err);
			}
			return;
		}

		if ( !inSystemPathScope || !el.name?.startsWith("system.") ) return;

		const form = getSheetForm(root, app);
		if ( form?.contains(el) ) return;

		const path = el.name;
		let value;
		if ( STARSHIP_INTEGER_HP_PATHS.has(path) ) {
			const coerced = coerceStarshipIntegerHpField(act, path, el.value);
			if ( coerced === null ) return;
			value = coerced;
		} else {
			const isNumber = el.type === "number" || el.dataset.dtype === "Number";
			value = isNumber
				? (() => { const n = Number(el.value); return Number.isFinite(n) ? n : 0; })()
				: el.value;
		}
		try {
			await act.update({ [path]: value });
		} catch ( err ) {
			console.error("SW5E MODULE | Starship Systems tab fallback update failed.", err);
		}
	});
}

/**
 * Core fuel quick actions — Burn (−1) and Refuel (to cap). Usable whenever the actor is editable (Play or Edit).
 */
function ensureStarshipFuelActionsDelegate(root, app) {
	if ( !root || root.dataset.sw5eFuelActionsDelegate === "1" ) return;
	root.dataset.sw5eFuelActionsDelegate = "1";
	root.addEventListener("click", async event => {
		const btn = event.target.closest("[data-sw5e-fuel-action]");
		if ( !btn || btn.disabled ) return;
		const act = app?.actor;
		if ( !act || app?.isEditable === false ) return;

		const action = btn.dataset.sw5eFuelAction;
		const legacySystem = getLegacyStarshipActorSystem(act);
		const fuel = legacySystem.attributes?.fuel ?? {};
		const current = Number.isFinite(Number(fuel.value)) ? Math.max(0, Math.trunc(Number(fuel.value))) : 0;
		const cap = Number.isFinite(Number(fuel.fuelCap)) ? Math.max(0, Math.trunc(Number(fuel.fuelCap))) : 0;

		let newValue;
		if ( action === "burn" ) {
			newValue = Math.max(0, current - 1);
		} else if ( action === "refuel" ) {
			if ( cap <= 0 ) {
				ui.notifications.warn(localizeOrFallback(
					"SW5E.StarshipSheet.RefuelNoCapWarning",
					"Set a fuel capacity before refueling."
				));
				return;
			}
			newValue = cap;
		} else {
			return;
		}

		if ( newValue === current ) return;

		try {
			await persistStarshipFuelPowerSystemPath(act, "system.attributes.fuel.value", newValue);
		} catch ( err ) {
			console.error("SW5E MODULE | Starship fuel action update failed.", err);
		}
	});
}

function ensureStarshipRepairDelegate(root, app) {
	if ( !root || root.dataset.sw5eRepairDelegate === "1" ) return;
	root.dataset.sw5eRepairDelegate = "1";
	root.addEventListener("click", async event => {
		const btn = event.target.closest("[data-sw5e-repair-action]");
		if ( !btn || btn.disabled ) return;
		const act = app?.actor;
		if ( !act || app?.isEditable === false ) return;

		const action = btn.dataset.sw5eRepairAction;
		try {
			if ( action === "recharge" ) {
				await openRechargeRepairDialog(act);
			} else if ( action === "refitting" ) {
				await openRefittingRepairDialog(act);
			} else if ( action === "regen" ) {
				await openRegenRepairDialog(act);
			}
			if ( app?.rendered ) await app.render(false);
		} catch ( err ) {
			if ( err?.message !== "cancelled" ) {
				console.error("SW5E MODULE | Starship repair action failed.", err);
			}
		}
	});
}

function ensureStarshipLegacyRoutingDelegate(root, app) {
	if ( !root || root.dataset.sw5eLegacyRoutingDelegate === "1" ) return;
	root.dataset.sw5eLegacyRoutingDelegate = "1";
	root.addEventListener("change", async event => {
		const input = event.target.closest("[data-sw5e-legacy-power-routing-toggle]");
		if ( !(input instanceof HTMLInputElement) ) return;
		const act = app?.actor;
		if ( !act || app?.isEditable === false || !isStarshipSheetEditMode(app) ) return;
		const flagPath = `flags.${SETTINGS_NAMESPACE}.${STARSHIP_LEGACY_POWER_ROUTING_FLAG}`;
		try {
			await act.update({ [flagPath]: input.checked });
			syncLegacyPowerRoutingToggleVisual(
				input.closest("[data-sw5e-starship-legacy-routing-toggle]"),
				input.checked
			);
			if ( app?.rendered ) await app.render(false);
		} catch ( err ) {
			console.error("SW5E MODULE | Starship legacy power routing toggle failed.", err);
		}
	});
}

/**
 * Advanced Power panel — collapse toggle (persist UI flag) and per-slot Roll/Spend in Play mode.
 * Also handles Crew & Passengers and Fuel core panel collapse toggles.
 */
function resolveStarshipCoreCollapseToggle(target) {
	if ( !(target instanceof Element) ) return null;
	return target.closest(
		"[data-sw5e-advanced-power-action='toggle-collapse'], [data-sw5e-core-collapse-action='toggle'], .sw5e-starship-core-collapsible-toggle"
	);
}

async function toggleStarshipCorePanelCollapse(toggle, app) {
	const panelKey = toggle.dataset.corePanel ?? "advancedPower";
	const panel = toggle.closest(`[data-sw5e-core-panel="${panelKey}"]`);
	if ( !panel ) return;

	const willCollapse = !panel.classList.contains("is-collapsed");
	panel.classList.toggle("is-collapsed", willCollapse);
	panel.querySelectorAll(".sw5e-starship-core-collapsible-toggle, [data-sw5e-advanced-power-action='toggle-collapse']").forEach(btn => {
		btn.setAttribute("aria-expanded", willCollapse ? "false" : "true");
		const expandLabel = btn.dataset.expandLabel
			?? localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerExpand", "Expand Power Die Allocation");
		const collapseLabel = btn.dataset.collapseLabel
			?? localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerCollapse", "Collapse Power Die Allocation");
		const label = willCollapse ? expandLabel : collapseLabel;
		btn.title = label;
		btn.setAttribute("aria-label", label);
		if ( Object.prototype.hasOwnProperty.call(btn.dataset, "tooltip") ) btn.dataset.tooltip = label;
	});

	const act = app?.actor;
	if ( !act?.isOwner ) return;

	const flagKey = panelKey === "advancedPower"
		? "advancedPowerCollapsed"
		: panelKey === "crew"
			? "crewCollapsed"
			: "fuelCollapsed";
	try {
		await act.update({ [`flags.sw5e.starship.ui.${flagKey}`]: willCollapse });
	} catch ( err ) {
		console.error("SW5E MODULE | Starship core panel collapse update failed.", err);
	}
}

function ensureStarshipCorePanelCollapseDelegate(container, app) {
	if ( !(container instanceof HTMLElement) ) return;
	if ( container.dataset.sw5eCoreCollapseDelegate === "1" ) return;
	container.dataset.sw5eCoreCollapseDelegate = "1";
	container.addEventListener("click", async event => {
		if ( event.target.closest("[data-sw5e-crew-command], [data-sw5e-fuel-action]") ) return;
		const collapseToggle = resolveStarshipCoreCollapseToggle(event.target);
		if ( !collapseToggle ) return;
		event.preventDefault();
		event.stopPropagation();
		await toggleStarshipCorePanelCollapse(collapseToggle, app);
	});
}

function ensureStarshipAdvancedPowerDelegate(root, app) {
	if ( !root || root.dataset.sw5eAdvancedPowerDelegate === "1" ) return;
	root.dataset.sw5eAdvancedPowerDelegate = "1";
	root.addEventListener("click", async event => {
		const spendBtn = event.target.closest("[data-sw5e-advanced-power-action='spend']");
		if ( spendBtn && !spendBtn.disabled ) {
			const act = app?.actor;
			if ( act && app?.isEditable !== false ) {
				const slotKey = spendBtn.dataset.powerSlot;
				if ( slotKey && STARSHIP_POWER_DIE_SLOTS.includes(slotKey) ) {
					try {
						await rollStarshipPowerDie(act, slotKey);
					} catch ( err ) {
						console.error("SW5E MODULE | Starship power die roll failed.", err);
					}
				}
			}
			return;
		}

		const recoverBtn = event.target.closest("[data-sw5e-advanced-power-action='recover']");
		if ( recoverBtn && !recoverBtn.disabled ) {
			const act = app?.actor;
			if ( !act || app?.isEditable === false ) return;
			try {
				await recoverStarshipPowerDice(act);
			} catch ( err ) {
				console.error("SW5E MODULE | Starship power die recovery failed.", err);
			}
		}
	});
}

function ensureStarshipSystemDamageDelegate(root, app) {
	if ( !root || root.dataset.sw5eSystemDamageDelegate === "1" ) return;
	root.dataset.sw5eSystemDamageDelegate = "1";
	root.addEventListener("click", async event => {
		const pip = event.target.closest("[data-sw5e-system-damage-action='toggle-pip']");
		if ( !pip || pip.disabled ) return;
		const act = app?.actor;
		if ( !act || app?.isEditable === false ) return;
		event.preventDefault();
		event.stopPropagation();
		const pipN = Number(pip.dataset.n);
		if ( !Number.isFinite(pipN) ) return;
		const current = getStarshipSystemDamageLevel(act);
		const next = resolveStarshipSystemDamagePipToggle(current, pipN);
		try {
			await setStarshipSystemDamageLevel(act, next);
			await renderStarshipSidebarSystemDamage(root, act, app);
		} catch ( err ) {
			console.error("SW5E MODULE | Starship system damage update failed.", err);
		}
	});
}

function ensureStarshipDestructionSaveDelegate(root, app) {
	if ( !root || root.dataset.sw5eDestructionSaveDelegate === "1" ) return;
	root.dataset.sw5eDestructionSaveDelegate = "1";
	root.addEventListener("click", async event => {
		const toggleBtn = event.target.closest("[data-sw5e-destruction-action='toggle']");
		if ( toggleBtn ) {
			event.preventDefault();
			toggleStarshipDestructionTray(app, root);
			return;
		}

		const rollBtn = event.target.closest("[data-sw5e-destruction-action='roll']");
		if ( rollBtn && !rollBtn.disabled ) {
			const act = app?.actor;
			if ( !act || app?.isEditable === false ) return;
			try {
				await rollStarshipDestructionSave(act);
				await renderStarshipSidebarDestructionSaves(root, act, app);
				await renderStarshipSidebarSystemDamage(root, act, app);
				await renderStarshipSidebarVitals(root, act, app);
			} catch ( err ) {
				console.error("SW5E MODULE | Starship destruction save roll failed.", err);
			}
			return;
		}

		const resetBtn = event.target.closest("[data-sw5e-destruction-action='reset']");
		if ( resetBtn && !resetBtn.disabled ) {
			const act = app?.actor;
			if ( !act || !isStarshipSheetEditMode(app) || app?.isEditable === false ) return;
			try {
				await resetStarshipDestructionSaves(act);
				await renderStarshipSidebarDestructionSaves(root, act, app);
			} catch ( err ) {
				console.error("SW5E MODULE | Starship destruction save reset failed.", err);
			}
		}
	});
}

function toggleStarshipDestructionTray(app, root, open) {
	const shell = getStarshipSidebarShell(root, app);
	const tray = shell?.querySelector(".sw5e-starship-destruction-tray");
	if ( !(tray instanceof HTMLElement) ) return;

	const tab = tray.querySelector(".sw5e-starship-destruction-toggle");
	const shouldOpen = typeof open === "boolean" ? open : !tray.classList.contains("open");
	tray.classList.toggle("open", shouldOpen);
	if ( app ) app._sw5eDestructionTrayOpen = shouldOpen;

	if ( tab instanceof HTMLElement ) {
		const tooltipKey = shouldOpen
			? "SW5E.StarshipSheet.DestructionSaveHide"
			: "SW5E.StarshipSheet.DestructionSaveShow";
		tab.dataset.tooltip = tooltipKey;
		tab.setAttribute(
			"aria-label",
			localizeOrFallback(tooltipKey, shouldOpen ? "Hide Destruction Saves" : "Show Destruction Saves")
		);
	}
}

function syncDestructionTrayControlState(app, root) {
	const shell = getStarshipSidebarShell(root, app);
	const tray = shell?.querySelector(".sw5e-starship-destruction-tray");
	if ( !(tray instanceof HTMLElement) ) return;

	const routingEditable = app?.isEditable !== false;
	const setupEditable = isStarshipSheetEditMode(app) && routingEditable;

	for ( const rollBtn of tray.querySelectorAll("[data-sw5e-destruction-action='roll']") ) {
		if ( rollBtn instanceof HTMLButtonElement ) {
			rollBtn.disabled = !routingEditable || rollBtn.dataset.canRoll !== "1";
		}
	}

	const resetBtn = tray.querySelector("[data-sw5e-destruction-action='reset']");
	if ( resetBtn instanceof HTMLButtonElement ) resetBtn.disabled = !setupEditable;
}

function getPrimaryTabNav(root) {
	return root.querySelector(".sheet-navigation[data-group='primary']")
		?? root.querySelector("[data-application-part='tabs'] .sheet-navigation")
		?? root.querySelector("[data-application-part='tabs'] .tabs")
		?? root.querySelector("nav.tabs[data-group='primary']")
		?? root.querySelector("nav.tabs")
		?? root.querySelector(".tabs[data-group='primary']");
}

function getPrimaryTabPanelParent(root) {
	return root.querySelector(".tab[data-group='primary']")?.parentElement
		?? root.querySelector("#tabs")
		?? root.querySelector(".tab-body")
		?? root.querySelector("[data-application-part='inventory']")?.parentElement
		?? root.querySelector(".sheet-body")
		?? root.querySelector(".window-content")
		?? root;
}

function getTabButton(root, tabId) {
	return getPrimaryTabNav(root)?.querySelector(`[data-tab="${tabId}"]`) ?? null;
}

function getStarshipActiveTab(app) {
	if ( app?._sw5eStarshipActiveTab === true ) return STARSHIP_TAB_ID;
	if ( app?._sw5eStarshipActiveTab === false ) return null;
	return typeof app?._sw5eStarshipActiveTab === "string" ? app._sw5eStarshipActiveTab : null;
}

function setStarshipActiveTab(app, tabId = null) {
	app._sw5eStarshipActiveTab = tabId;
}

function getTabButtons(nav) {
	return Array.from(nav?.querySelectorAll("[data-tab]") ?? []);
}

function getTabLabel(button) {
	return button?.textContent?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function getStockFeaturesTabButton(nav) {
	return getTabButtons(nav).find(button => {
		if ( CUSTOM_STARSHIP_TAB_IDS.has(button.dataset.tab) ) return false;
		return button.dataset.tab === STARSHIP_FEATURES_TAB_ID || button.dataset.tab === STOCK_FEATURES_TAB_ID;
	}) ?? null;
}

function hideStockCrewTab(nav) {
	const crewButton = getTabButtons(nav).find(button => button.dataset.tab === "crew");
	if ( !crewButton ) return;
	crewButton.classList.add("sw5e-starship-hidden-tab");
	crewButton.hidden = true;
	crewButton.setAttribute("aria-hidden", "true");
}

function configureStarshipPrimaryTabLabels(nav) {
	if ( !nav ) return;
	const coreButton = nav.querySelector(`[data-tab="${STARSHIP_TAB_ID}"]`);
	if ( coreButton ) {
		const label = coreButton.querySelector("span") ?? coreButton;
		label.textContent = localizeOrFallback("SW5E.StarshipSheet.CoreTab", "Core");
	}
	const inventoryButton = nav.querySelector(`[data-tab="${STOCK_CARGO_TAB_ID}"]`);
	if ( inventoryButton ) {
		const label = inventoryButton.querySelector("span") ?? inventoryButton;
		const inventoryLabel = game.i18n.localize("DND5E.Inventory");
		label.textContent = inventoryLabel && inventoryLabel !== "DND5E.Inventory" ? inventoryLabel : "Inventory";
	}
	const featuresButton = nav.querySelector(`[data-tab="${STARSHIP_FEATURES_TAB_ID}"]`);
	if ( featuresButton ) {
		const label = featuresButton.querySelector("span") ?? featuresButton;
		label.textContent = getStarshipFeaturesTabLabel();
	}
	hideStockCrewTab(nav);
}

function getStarshipFeaturesTabLabel() {
	const label = game.i18n.localize("DND5E.Features");
	return label && label !== "DND5E.Features" ? label : "Features";
}

function registerStarshipFeaturesTabPart() {
	const VAS = globalThis.dnd5e?.applications?.actor?.VehicleActorSheet;
	if ( !VAS?.PARTS || VAS._sw5eStarshipFeaturesTabRegistered ) return;

	if ( !VAS.PARTS[STARSHIP_FEATURES_TAB_ID] ) {
		VAS.PARTS[STARSHIP_FEATURES_TAB_ID] = {
			container: { classes: ["tab-body"], id: "tabs" },
			template: "systems/dnd5e/templates/actors/tabs/actor-features.hbs",
			templates: [
				"systems/dnd5e/templates/inventory/inventory.hbs",
				"systems/dnd5e/templates/inventory/activity.hbs"
			],
			scrollable: [""]
		};
	}

	if ( !Array.isArray(VAS.TABS) ) VAS.TABS = [];
	if ( !VAS.TABS.some(tab => tab.tab === STARSHIP_FEATURES_TAB_ID) ) {
		const inventoryIdx = VAS.TABS.findIndex(tab => tab.tab === STOCK_CARGO_TAB_ID);
		const featuresTab = {
			tab: STARSHIP_FEATURES_TAB_ID,
			label: "DND5E.Features",
			condition: actor => isSw5eStarshipActor(actor)
		};
		if ( inventoryIdx >= 0 ) VAS.TABS.splice(inventoryIdx + 1, 0, featuresTab);
		else VAS.TABS.push(featuresTab);
	}

	VAS._sw5eStarshipFeaturesTabRegistered = true;
}

function registerStarshipTabsContextWrapper() {
	const BAS = globalThis.dnd5e?.applications?.actor?.BaseActorSheet;
	const VAS = globalThis.dnd5e?.applications?.actor?.VehicleActorSheet;
	if ( !BAS?.prototype || !VAS ) return;
	try {
		libWrapper.register(getModuleId(), "dnd5e.applications.actor.BaseActorSheet.prototype._prepareTabsContext", async function(wrapped, context, options) {
			context = await wrapped.call(this, context, options);
			if ( !(this instanceof VAS) || !isSw5eStarshipActor(this.actor) ) return context;
			if ( !Array.isArray(context.tabs) ) return context;

			const inventoryTab = context.tabs.find(tab => tab.tab === STOCK_CARGO_TAB_ID);
			if ( inventoryTab ) inventoryTab.label = "DND5E.Inventory";

			context.tabs = context.tabs.filter(tab => tab.tab !== "crew");

			if ( !context.tabs.some(tab => tab.tab === STARSHIP_FEATURES_TAB_ID) ) {
				const inventoryIdx = context.tabs.findIndex(tab => tab.tab === STOCK_CARGO_TAB_ID);
				const featuresTab = {
					tab: STARSHIP_FEATURES_TAB_ID,
					label: "DND5E.Features"
				};
				if ( inventoryIdx >= 0 ) context.tabs.splice(inventoryIdx + 1, 0, featuresTab);
				else context.tabs.push(featuresTab);
			}

			return context;
		}, "WRAPPER");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap BaseActorSheet _prepareTabsContext for starship tab labels.", err);
	}
}

/**
 * Ensure Features appears in the primary nav when dnd5e omits it (e.g. before PARTS/TABS patch on first paint).
 * Clones an existing stock tab button so styling matches Core | Inventory | Effects | Description.
 */
function ensureStarshipFeaturesTabNav(root, app, nav) {
	if ( !nav || nav.querySelector(`[data-tab="${STARSHIP_FEATURES_TAB_ID}"]`) ) return;

	const templateButton = nav.querySelector("[data-tab=\"effects\"]")
		?? nav.querySelector(`[data-tab="${STOCK_CARGO_TAB_ID}"]`);
	if ( !(templateButton instanceof HTMLElement) ) return;

	const tabButton = templateButton.cloneNode(true);
	tabButton.classList.remove("active");
	tabButton.dataset.tab = STARSHIP_FEATURES_TAB_ID;
	tabButton.removeAttribute("aria-selected");
	const labelEl = tabButton.querySelector("span") ?? tabButton;
	labelEl.textContent = getStarshipFeaturesTabLabel();

	const anchor = nav.querySelector("[data-tab=\"effects\"]") ?? templateButton.nextElementSibling;
	if ( anchor?.parentElement === nav ) nav.insertBefore(tabButton, anchor);
	else nav.append(tabButton);

	tabButton.addEventListener("click", event => {
		event.preventDefault();
		activateSheetTab(root, app, STARSHIP_FEATURES_TAB_ID);
	});
}

function insertCustomTabButtons(nav, buttons = []) {
	const stockButtons = getTabButtons(nav).filter(button => !buttons.includes(button));
	const anchor = STOCK_STARSHIP_TAB_ORDER
		.map(tabId => stockButtons.find(button => button.dataset.tab === tabId))
		.find(Boolean)
		?? stockButtons.find(button => !button.hidden)
		?? null;

	for ( const button of buttons ) {
		if ( anchor?.parentElement === nav ) nav.insertBefore(button, anchor);
		else nav.append(button);
	}
}

function activatePrimaryTab(root, tabId) {
	const nav = getPrimaryTabNav(root);
	if ( nav ) {
		nav.querySelectorAll("[data-tab]").forEach(item => {
			item.classList.toggle("active", item.dataset.tab === tabId);
		});
	}

	root.querySelectorAll(".tab[data-group='primary']").forEach(panel => {
		const isActive = panel.dataset.tab === tabId;
		panel.classList.toggle("active", isActive);
		// Only manage `hidden` on our own custom tabs.
		// Stock dnd5e panels use CSS classes for visibility; setting `hidden` on them
		// prevents dnd5e from showing them again when the user clicks back to cargo/description.
		if ( panel.classList.contains("sw5e-starship-tab") ) {
			panel.hidden = !isActive;
		} else {
			panel.hidden = false;
		}
	});
}

function activateSheetTab(root, app, tabId) {
	if ( CUSTOM_STARSHIP_TAB_IDS.has(tabId) ) {
		setStarshipActiveTab(app, tabId);
		activatePrimaryTab(root, tabId);
		desyncStaleStockTabGroupWhileSotgVisible(app);
		return;
	}

	setStarshipActiveTab(app, null);
	root.querySelectorAll(".sw5e-starship-tab").forEach(panel => { panel.classList.remove("active"); panel.hidden = true; });
	if ( typeof app?.changeTab === "function" ) {
		try {
			app.changeTab(tabId, "primary", { force: true, updatePosition: false });
		} catch(e) {
			activatePrimaryTab(root, tabId);
		}
	} else {
		activatePrimaryTab(root, tabId);
	}
	if ( tabId === STOCK_CARGO_TAB_ID && isSw5eStarshipActor(app?.actor) ) {
		scheduleStarshipModificationsSectionHeader(root, app.actor);
	}
}

/**
 * While SotG is the visible custom primary tab, dnd5e often still has `tabGroups.primary === "inventory"`
 * (last stock tab). After EDIT/PLAY rerender that can mark the Cargo nav as `.active` even though SotG
 * is showing — stock click handlers then no-op. Nudge tabGroups off the default so `changeTab("inventory")`
 * reliably runs on the next Cargo click.
 * @param {object} app
 */
function desyncStaleStockTabGroupWhileSotgVisible(app) {
	if ( !app?.tabGroups || typeof app.tabGroups !== "object" ) return;
	if ( app.tabGroups.primary !== STOCK_CARGO_TAB_ID && app.tabGroups.primary !== STARSHIP_FEATURES_TAB_ID ) return;
	app.tabGroups.primary = "effects";
}

/**
 * Single capture-phase bridge for stock primary tabs on integrated vehicle sheets.
 * Re-bound each render so it survives nav replacement after EDIT/PLAY toggles.
 * @param {object} app
 * @param {HTMLElement} root
 * @param {HTMLElement|null} nav
 */
function attachIntegratedStockPrimaryTabBridge(app, root, nav) {
	if ( !nav ) return;
	if ( app._sw5eStockTabBridgeAbort ) app._sw5eStockTabBridgeAbort.abort();
	const ac = new AbortController();
	app._sw5eStockTabBridgeAbort = ac;

	nav.addEventListener("click", event => {
		const item = event.target.closest("[data-tab]");
		if ( !item || !nav.contains(item) ) return;
		const tabId = item.dataset.tab;
		if ( !tabId || CUSTOM_STARSHIP_TAB_IDS.has(tabId) ) return;

		const sotgIsEffectivePrimary = Boolean(getStarshipActiveTab(app));

		// After mode-toggle rerender, Cargo can be `.active` while SotG is still the effective tab — do not no-op.
		if ( !sotgIsEffectivePrimary && item.classList.contains("active") ) {
			event.preventDefault();
			return;
		}

		event.preventDefault();
		event.stopImmediatePropagation();

		setStarshipActiveTab(app, null);
		root.querySelectorAll(".sw5e-starship-tab").forEach(panel => {
			panel.classList.remove("active");
			panel.hidden = true;
		});
		if ( typeof app?.changeTab === "function" ) {
			try {
				app.changeTab(tabId, "primary", { force: true, updatePosition: false });
			} catch ( e ) {
				activatePrimaryTab(root, tabId);
			}
		} else activatePrimaryTab(root, tabId);
	}, { capture: true, signal: ac.signal });
}

function ensureStarshipTabTargets(root) {
	const nav = getPrimaryTabNav(root);
	const panelParent = getPrimaryTabPanelParent(root);
	if ( nav && panelParent ) return { nav, panelParent, integrated: true };

	const mountPoint = root.querySelector(".window-content") ?? root;
	let host = mountPoint.querySelector(".sw5e-starship-tab-host");
	if ( !host ) {
		host = document.createElement("section");
		host.className = "sw5e-starship-tab-host";
		host.innerHTML = `
			<nav class="sheet-navigation tabs sw5e-starship-fallback-nav" data-group="primary"></nav>
			<section class="sw5e-starship-tab-panels"></section>
		`;
		mountPoint.prepend(host);
	}

	return {
		nav: host.querySelector(".sw5e-starship-fallback-nav"),
		panelParent: host.querySelector(".sw5e-starship-tab-panels"),
		integrated: false
	};
}

async function ensureWarningsDialog(root, app, actor) {
	const form = getSheetForm(root, app);
	if ( !form || form.querySelector("dialog.warnings") ) return;

	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-warnings-dialog.hbs"),
		{
			title: localizeOrFallback("DND5E.Warnings", "Warnings"),
			body: localizeOrFallback("DND5E.WarningDetails", "This sheet has one or more warnings from the dnd5e actor preparation step."),
			actorName: actor?.name ?? localizeOrFallback("TYPES.Actor.vehicle", "Vehicle Actor"),
			closeLabel: localizeOrFallback("Close", "Close")
		}
	);

	const dialog = document.createElement("dialog");
	dialog.className = "warnings sw5e-starship-warnings-dialog";
	dialog.innerHTML = rendered;
	form.append(dialog);
}

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized === key ? fallback : localized;
}

function formatSignedSkillMod(value) {
	const n = Number(value);
	if ( !Number.isFinite(n) ) return "+0";
	return n >= 0 ? `+${n}` : `${n}`;
}

function getStarshipProficiencyIcon(level) {
	const n = Number(level);
	if ( !Number.isFinite(n) || n <= 0 ) return "";
	if ( n === 1 ) return `<i class="fas fa-check"></i>`;
	if ( n === 2 ) return `<i class="fas fa-check-double"></i>`;
	return `<span class="sw5e-starship-skill-prof-custom">${n}</span>`;
}

function getStarshipSkillProficiencyClass(level) {
	const n = Number(level);
	if ( !Number.isFinite(n) || n <= 0 ) return "";
	if ( n === 1 ) return " proficient";
	if ( n === 2 ) return " expert proficient";
	return " custom proficient";
}

/** Resolve a short ability abbreviation for starship skill rows (mirrors Core sheet labeling). */
function resolveStarshipSkillAbilityAbbreviation(entry) {
	const abil = CONFIG?.DND5E?.abilities?.[entry.ability];
	let abilityAbbr = entry.ability?.toUpperCase?.() ?? "";
	if ( abil?.abbreviation ) {
		const loc = game.i18n.localize(abil.abbreviation);
		abilityAbbr = loc && loc !== abil.abbreviation ? loc : abilityAbbr;
	}
	return abilityAbbr;
}

/**
 * Presentation fields for the Overview skills list (ability abbreviation, signed modifier, passive total).
 * Passive uses {@link CONFIG.DND5E.skillPassive} base (default 10) + prepared skill modifier, matching core 5e passive notation.
 */
function enrichStarshipSkillsForSheet(actor) {
	const passiveCfg = CONFIG?.DND5E?.skillPassive;
	const passiveBase = Number.isFinite(Number(passiveCfg?.base)) ? Number(passiveCfg.base) : 10;
	return getStarshipSkillDisplayEntries(actor, game.user).map(entry => {
		const abilityAbbr = resolveStarshipSkillAbilityAbbreviation(entry);
		const passiveTotal = passiveBase + Number(entry.effectiveTotal);
		const tierLabel = formatStarshipSkillTierOptionLabel(entry.proficiencyMode);
		const modDisplay = formatSignedSkillMod(entry.effectiveTotal);
		const passiveDisplay = Number.isFinite(passiveTotal) ? String(passiveTotal) : "";
		return {
			...entry,
			value: entry.proficiencyMode,
			baseValue: entry.proficiencyMode,
			icon: getStarshipProficiencyIcon(entry.proficiencyMode),
			proficiencyClass: getStarshipSkillProficiencyClass(entry.proficiencyMode),
			abilityAbbr,
			abbreviation: abilityAbbr,
			tierLabel,
			modDisplay,
			passiveDisplay
		};
	});
}

/**
 * Render a dnd5e ApplicationV2 config sheet when possible (no console noise on failure).
 */
async function renderDnd5eConfigApp(app) {
	if ( !app || typeof app.render !== "function" ) return false;
	try {
		const r = app.render({ force: true });
		if ( r && typeof r.then === "function" ) await r;
		return true;
	} catch {
		/* ApplicationV2 may throw during prepare when actor schema lacks expected fields (e.g. vehicles). */
	}
	try {
		const r2 = app.render(true);
		if ( r2 && typeof r2.then === "function" ) await r2;
		return true;
	} catch {
		return false;
	}
}

function actorSchemaHasSkillsField(actor) {
	try {
		return Boolean(actor?.system?.schema?.getField?.("skills"));
	} catch {
		return false;
	}
}

function formatStarshipSkillTierOptionLabel(value) {
	switch ( value ) {
		case 0:
			return localizeOrFallback("SW5E.Starship.SkillTier.NotProficient", "Not proficient");
		case 1:
			return localizeOrFallback("SW5E.Starship.SkillTier.ProficientlyEquipped", "Proficiently equipped");
		case 2:
			return localizeOrFallback("SW5E.Starship.SkillTier.ExpertlyEquipped", "Expertly equipped");
		default: {
			const localized = game.i18n.format("SW5E.Starship.SkillTier.Custom", { value });
			return localized === "SW5E.Starship.SkillTier.Custom" ? `Custom (${value})` : localized;
		}
	}
}

/**
 * Minimal per-skill editor for SW5E starship skills on vehicle actors.
 * dnd5e 5.2.x {@link SkillToolConfig} resolves labels from `CONFIG.DND5E.skills[key]` only; starship keys live in
 * `CONFIG.DND5E.starshipSkills`. {@link SkillsConfig} prepares trait data via `system.skills` schema fields that
 * vehicle actors typically do not define. This dialog edits ability override, ship check bonus, and the manual
 * starship skill proficiency tier stored on the vehicle actor. Rolls still use crew proficiency on `rollStarshipSkill`;
 * this dialog only controls the existing per-skill multiplier state.
 */
async function openStarshipSkillInlineConfigDialog(actor, skillId) {
	const entry = getStarshipSkillEntries(actor).find(s => s.id === skillId);
	if ( !entry ) return;

	const legacy = getLegacyStarshipActorSystem(actor);
	const raw = legacy.skills?.[skillId] ?? {};
	const abilityVal = typeof raw.ability === "string" && raw.ability ? raw.ability : entry.ability;
	const bonusVal = typeof raw.bonuses?.check === "string" ? raw.bonuses.check : "";
	const rawTierNumber = Number(raw?.value);
	const tierVal = Number.isFinite(rawTierNumber) ? rawTierNumber : 0;
	const tierOptions = [0, 1, 2];
	if ( !tierOptions.includes(tierVal) ) tierOptions.push(tierVal);

	const abilOptions = Object.entries(CONFIG?.DND5E?.abilities ?? {}).map(([key, cfg]) => {
		const lab = typeof cfg?.label === "string" ? game.i18n.localize(cfg.label) : key;
		return `<option value="${escapeHtml(key)}"${key === abilityVal ? " selected" : ""}>${escapeHtml(lab)}</option>`;
	}).join("");
	const tierOptionsHtml = tierOptions.map(value =>
		`<option value="${escapeHtml(String(value))}"${value === tierVal ? " selected" : ""}>${escapeHtml(formatStarshipSkillTierOptionLabel(value))}</option>`
	).join("");

	const bonusLabel = game.i18n.localize("DND5E.CheckBonus");
	const tierLabel = localizeOrFallback("SW5E.Starship.SkillTier.Label", "Skill tier");
	const tierHint = localizeOrFallback(
		"SW5E.Starship.SkillTier.Hint",
		"Controls whether crew proficiency bonus contributes to this starship skill roll."
	);
	const content = `
<div class="standard-form sw5e-starship-skill-inline-config">
  <div class="form-group">
    <label>${escapeHtml(localizeOrFallback("DND5E.Ability", "Ability"))}</label>
    <select name="sw5e-starship-skill-ability">${abilOptions}</select>
  </div>
  <div class="form-group">
    <label>${escapeHtml(tierLabel)}</label>
    <select name="sw5e-starship-skill-tier">${tierOptionsHtml}</select>
    <p class="hint">${escapeHtml(tierHint)}</p>
  </div>
  <div class="form-group">
    <label>${escapeHtml(bonusLabel)}</label>
    <input type="text" name="sw5e-starship-skill-bonus" value="${escapeHtml(bonusVal)}" autocomplete="off" />
  </div>
</div>`;

	const title = `${localizeOrFallback("SW5E.SkillConfigure", "Configure skill")}: ${entry.label}`;

	await foundry.applications.api.DialogV2.wait({
		window: { title },
		content,
		position: { width: 400 },
		buttons: [
			{
				action: "save",
				label: game.i18n.localize("Save"),
				icon: "fas fa-check",
				default: true
			},
			{
				action: "cancel",
				label: game.i18n.localize("Cancel"),
				icon: "fas fa-times"
			}
		],
		// DialogV2 `submit` is `(result, dialog)` — the clicked button’s `action` (or callback return), not `(event, dialog, button)`.
		submit: async (result, dialog) => {
			if ( result !== "save" ) return;

			const form = dialog.form ?? dialog.element?.querySelector?.("form");
			if ( !form ) return;

			const fd = new FormData(form);
			const abilRaw = fd.get("sw5e-starship-skill-ability");
			const tierRaw = fd.get("sw5e-starship-skill-tier");
			const bonusRaw = fd.get("sw5e-starship-skill-bonus") ?? "";

			const abilStr = typeof abilRaw === "string" ? abilRaw : "";
			const abilKeys = Object.keys(CONFIG?.DND5E?.abilities ?? {});
			const abilFinal = abilStr && abilKeys.includes(abilStr) ? abilStr : abilityVal;
			const tierStr = typeof tierRaw === "string" ? tierRaw.trim() : "";
			const tierNumber = Number(tierStr);
			const tierFinal = Number.isFinite(tierNumber) ? tierNumber : tierVal;

			const bonusStr = String(bonusRaw).trim();

			try {
				// Authoritative store for starship vehicle actors is `flags.sw5e.legacyStarshipActor.system.skills`
				// (same snapshot `normalizeLegacyStarshipActorData` maintains). `system.skills` is mirrored when the
				// system accepts it so exports / tooling stay aligned; vehicle data models may drop unknown skill paths.
				const updateData = {
					[`flags.sw5e.legacyStarshipActor.system.skills.${skillId}.ability`]: abilFinal,
					[`flags.sw5e.legacyStarshipActor.system.skills.${skillId}.bonuses.check`]: bonusStr,
					[`system.skills.${skillId}.ability`]: abilFinal,
					[`system.skills.${skillId}.bonuses.check`]: bonusStr
				};
				if ( tierFinal !== tierVal ) {
					updateData[`flags.sw5e.legacyStarshipActor.system.skills.${skillId}.value`] = tierFinal;
					updateData[`system.skills.${skillId}.value`] = tierFinal;
				}
				await actor.update(updateData);
			} catch ( err ) {
				ui.notifications?.error(localizeOrFallback(
					"SW5E.StarshipSheet.SkillConfigUpdateFailed",
					"Could not save skill changes. Check console for details."
				));
				console.error("SW5E MODULE | Starship skill inline config update failed.", err);
			}
		}
	});
}

/**
 * Starship skill cog: use core dialogs only when they match this actor's schema and skill key; otherwise inline config.
 */
/**
 * Starship ability cog: stock dnd5e AbilityConfig when the actor schema supports it.
 */
async function openStarshipAbilityConfiguration(actor, abilityKey) {
	if ( !abilityKey ) return;
	const AbilityConfig = globalThis.dnd5e?.applications?.actor?.AbilityConfig;
	if ( AbilityConfig ) {
		try {
			const inst = new AbilityConfig({ document: actor, key: abilityKey });
			if ( await renderDnd5eConfigApp(inst) ) return;
		} catch {
			/* prepare/render failure */
		}
	}
	ui.notifications?.warn(localizeOrFallback(
		"SW5E.StarshipSheet.AbilityConfigOpenFailed",
		"Could not open ability configuration for this starship."
	));
}

async function openStarshipSkillConfiguration(actor, skillId) {
	const apps = globalThis.dnd5e?.applications?.actor ?? globalThis.game?.dnd5e?.applications?.actor;

	const coreSkillDef = CONFIG?.DND5E?.skills?.[skillId];
	const SkillToolConfig = apps?.SkillToolConfig;
	if ( SkillToolConfig && coreSkillDef ) {
		try {
			const inst = new SkillToolConfig({ document: actor, trait: "skills", key: skillId });
			if ( await renderDnd5eConfigApp(inst) ) return;
		} catch {
			/* prepare/render failure — fall through */
		}
	}

	const SkillsConfig = apps?.SkillsConfig;
	if ( SkillsConfig && actorSchemaHasSkillsField(actor) ) {
		try {
			const inst = new SkillsConfig({ document: actor });
			if ( await renderDnd5eConfigApp(inst) ) {
				ui.notifications?.info(localizeOrFallback(
					"SW5E.StarshipSheet.SkillsConfigOpened",
					"Opened the actor’s skills configuration."
				));
				return;
			}
		} catch {
			/* vehicle / schema mismatch */
		}
	}

	await openStarshipSkillInlineConfigDialog(actor, skillId);
}

function isSw5eStarshipActor(actor) {
	return actor?.type === "vehicle" && actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

/**
 * dnd5e 5.2.x `VehicleActorSheet` exposes "Show Abilities" via `flags.dnd5e.showVehicleAbilities` (`_prepareContext` → `context.options.showAbilities`).
 * When unset, stock behavior hides the block. World starships persist `true` once; compendium docs cannot be updated while locked — see `registerStarshipVehicleSheetShowAbilitiesDefault`.
 */
function isUnsetShowVehicleAbilities(actor) {
	const raw = actor?.getFlag?.("dnd5e", "showVehicleAbilities");
	return raw !== true && raw !== false;
}

async function ensureStarshipDefaultShowVehicleAbilities(actor) {
	if ( !isSw5eStarshipActor(actor) ) return;
	if ( !isUnsetShowVehicleAbilities(actor) ) return;
	// Pack / compendium documents must not receive `setFlag` during sheet render (locked compendium throws).
	if ( actor.pack ) return;
	if ( !actor.isOwner ) return;
	await actor.setFlag("dnd5e", "showVehicleAbilities", true);
}

/**
 * Render-time default for unset flag: effective ON (no DB write). Applies to compendium starships and first paint before world `setFlag` resolves.
 */
function registerStarshipVehicleSheetShowAbilitiesDefault() {
	if ( vehicleSheetPrepareContextWrapped ) return;
	vehicleSheetPrepareContextWrapped = true;
	try {
		libWrapper.register(getModuleId(), "dnd5e.applications.actor.VehicleActorSheet.prototype._prepareContext", async function(wrapped, options) {
			const context = await wrapped(options);
			const actor = this.actor;
			if ( isSw5eStarshipActor(actor) && isUnsetShowVehicleAbilities(actor) ) {
				context.options ??= {};
				context.options.showAbilities = true;
			}
			return context;
		});
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap VehicleActorSheet _prepareContext for starship Show Abilities default.", err);
	}
}

function suppressNativeStarshipStationsAbilityAndFeatures() {
	if ( vehicleSheetPrepareStationsContextWrapped ) return;
	vehicleSheetPrepareStationsContextWrapped = true;
	try {
		libWrapper.register(getModuleId(), "dnd5e.applications.actor.VehicleActorSheet.prototype._preparePartContext", async function(wrapped, partId, context, options) {
			context = await wrapped(partId, context, options);
			const actor = this.actor;
			if ( !isSw5eStarshipActor(actor) ) return context;
			if ( partId === "inventory" ) {
				injectStarshipInventorySections(this, context);
				const hiddenIds = getStarshipInventoryExcludedItemIds(actor);
				if ( hiddenIds.size ) filterStarshipCargoContext(context, hiddenIds);
				return context;
			}
			if ( partId === STARSHIP_FEATURES_TAB_ID ) {
				const Inventory = customElements.get(this.options.elements.inventory);
				if ( Inventory?.mapColumns ) {
					context.listControls = getStarshipFeaturesListControls();
				}
				context.showCurrency = false;
				injectStarshipFeaturesSections(this, context);
				const hiddenIds = getStarshipFeaturesExcludedFromFeaturesTab(actor);
				if ( hiddenIds.size ) filterStarshipCargoContext(context, hiddenIds);
				return context;
			}
			if ( partId === "stations" ) {
				const hiddenIds = getStarshipFeaturesManagedItemIds(actor);
				if ( hiddenIds.size ) filterStarshipCargoContext(context, hiddenIds);
				context.options ??= {};
				context.options.showAbilities = false;
				context.features = null;
				return context;
			}
			return context;
		}, "WRAPPER");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap VehicleActorSheet _preparePartContext for starship stations suppression.", err);
	}
}

function getPreparedInventoryItemId(entry) {
	if ( !entry || typeof entry !== "object" ) return null;
	if ( typeof entry.id === "string" ) return entry.id;
	if ( typeof entry._id === "string" ) return entry._id;
	if ( typeof entry.item?.id === "string" ) return entry.item.id;
	if ( typeof entry.item?._id === "string" ) return entry.item._id;
	if ( typeof entry.document?.id === "string" ) return entry.document.id;
	if ( typeof entry.document?._id === "string" ) return entry.document._id;
	if ( typeof entry.object?.id === "string" ) return entry.object.id;
	if ( typeof entry.object?._id === "string" ) return entry.object._id;
	if ( typeof entry.data?.id === "string" ) return entry.data.id;
	if ( typeof entry.data?._id === "string" ) return entry.data._id;
	return null;
}

function getIterableValues(collection) {
	if ( !collection || typeof collection !== "object" ) return [];
	if ( collection instanceof Map ) return collection.values();
	return Object.values(collection);
}

function filterPreparedInventoryEntries(entries, hiddenIds) {
	if ( !Array.isArray(entries) ) return entries;
	for ( let i = entries.length - 1; i >= 0; i -= 1 ) {
		const entry = entries[i];
		const itemId = getPreparedInventoryItemId(entry);
		if ( itemId && hiddenIds.has(itemId) ) {
			entries.splice(i, 1);
			continue;
		}
		filterPreparedInventoryEntries(entry?.items, hiddenIds);
		filterPreparedInventoryEntries(entry?.contents, hiddenIds);
		filterPreparedInventoryEntries(entry?.children, hiddenIds);
	}
	return entries;
}

function filterStarshipCargoContext(context, hiddenIds) {
	if ( !context || typeof context !== "object" ) return context;

	filterPreparedInventoryEntries(context.items, hiddenIds);
	filterPreparedInventoryEntries(context.containers, hiddenIds);
	filterPreparedInventoryEntries(context.inventory, hiddenIds);

	for ( const section of getIterableValues(context.sections) ) filterPreparedInventoryEntries(section?.items, hiddenIds);
	for ( const section of getIterableValues(context.features) ) filterPreparedInventoryEntries(section?.items, hiddenIds);
	for ( const section of getIterableValues(context.cargo) ) filterPreparedInventoryEntries(section?.items, hiddenIds);

	for ( const category of getIterableValues(context.itemCategories) ) {
		filterPreparedInventoryEntries(category?.items, hiddenIds);
		for ( const section of getIterableValues(category) ) filterPreparedInventoryEntries(section?.items, hiddenIds);
	}

	const itemContext = context.itemContext;
	if ( itemContext && typeof itemContext === "object" ) {
		for ( const itemId of hiddenIds ) delete itemContext[itemId];
	}

	return context;
}

const STARSHIP_CARGO_INVENTORY_COLUMNS = ["price", "weight", "quantity", "charges", "controls"];
const STARSHIP_FEATURES_FEAT_COLUMNS = [{ id: "uses", order: 200 }, "recovery", "controls"];

const STARSHIP_INVENTORY_SECTION_DEFS = [
	{ key: "weapons", id: "sw5e-weapons", labelKey: "SW5E.Weapon", fallback: "Weapons", order: 50 },
	{ key: "equipment", id: "sw5e-equipment", labelKey: "SW5E.Equipment", fallback: "Equipment", order: 60 },
	{ key: "modifications", id: "sw5e-modifications", labelKey: "TYPES.Item.starshipmodPl", fallback: "Modifications", order: 65 }
];

const STARSHIP_FEATURES_SECTION_DEFS = [
	{ key: "actions", id: "sw5e-actions", labelKey: "SW5E.Feature.StarshipAction.LabelPl", fallback: "Starship Actions", order: 50, columns: "feat" },
	{ key: "systems", id: "sw5e-systems", labelKey: "DOCUMENT.TagsSystems", fallback: "Systems", order: 70, columns: "feat" }
];

const STARSHIP_INVENTORY_MANAGED_SECTION_IDS = new Set(STARSHIP_INVENTORY_SECTION_DEFS.map(def => def.id));
const STARSHIP_FEATURES_MANAGED_SECTION_IDS = new Set(STARSHIP_FEATURES_SECTION_DEFS.map(def => def.id));
const STARSHIP_CARGO_MANAGED_SECTION_IDS = STARSHIP_INVENTORY_MANAGED_SECTION_IDS;
const STARSHIP_MODIFICATIONS_SECTION_ID = "sw5e-modifications";

const STOCK_INVENTORY_SECTION_ID_TYPE = {
	weapons: "weapon",
	weapon: "weapon",
	equipment: "equipment",
	consumable: "consumable",
	consumables: "consumable",
	loot: "loot",
	container: "container"
};

function snapshotStockInventorySections(sections, managedSectionIds = STARSHIP_INVENTORY_MANAGED_SECTION_IDS) {
	if ( !Array.isArray(sections) ) return [];
	return sections
		.filter(section => section?.id && !managedSectionIds.has(section.id))
		.map(section => ({
			id: section.id,
			label: section.label,
			order: section.order,
			dataset: foundry.utils.deepClone(section.dataset ?? {}),
			groups: foundry.utils.deepClone(section.groups ?? {})
		}));
}

function resolveStockInventorySectionLabel(section) {
	const existing = section?.label;
	if ( typeof existing === "string" && existing.trim() ) return existing;

	const datasetType = section?.dataset?.type ?? section?.groups?.type;
	if ( typeof datasetType === "string" && datasetType && CONFIG?.Item?.typeLabels?.[datasetType] ) {
		return `${CONFIG.Item.typeLabels[datasetType]}Pl`;
	}

	const mappedType = STOCK_INVENTORY_SECTION_ID_TYPE[section?.id] ?? section?.id;
	if ( typeof mappedType === "string" && mappedType && CONFIG?.Item?.typeLabels?.[mappedType] ) {
		return `${CONFIG.Item.typeLabels[mappedType]}Pl`;
	}

	const items = section?.items;
	if ( Array.isArray(items) && items.length ) {
		const typeCounts = new Map();
		for ( const item of items ) {
			const type = item?.type;
			if ( !type ) continue;
			typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
		}
		let dominantType = null;
		let max = 0;
		for ( const [type, count] of typeCounts ) {
			if ( count > max ) {
				max = count;
				dominantType = type;
			}
		}
		if ( dominantType && CONFIG?.Item?.typeLabels?.[dominantType] ) {
			return `${CONFIG.Item.typeLabels[dominantType]}Pl`;
		}
	}

	return existing ?? "";
}

function restoreStockInventorySectionLabels(sections, managedSectionIds = STARSHIP_INVENTORY_MANAGED_SECTION_IDS) {
	if ( !Array.isArray(sections) ) return;
	for ( const section of sections ) {
		if ( managedSectionIds.has(section?.id) ) continue;
		const label = resolveStockInventorySectionLabel(section);
		if ( label ) section.label = label;
		section.dataset ??= {};
		if ( !section.dataset.type ) {
			const inferredType = section.items?.[0]?.type;
			if ( inferredType ) section.dataset.type = inferredType;
		}
	}
}

function applyStockInventorySectionSnapshots(sections, snapshots, managedSectionIds = STARSHIP_INVENTORY_MANAGED_SECTION_IDS) {
	if ( !Array.isArray(sections) || !snapshots?.length ) return;
	const snapshotById = new Map(snapshots.map(snapshot => [snapshot.id, snapshot]));
	for ( const section of sections ) {
		if ( managedSectionIds.has(section?.id) ) continue;
		const snapshot = section?.id ? snapshotById.get(section.id) : null;
		if ( !snapshot ) continue;
		if ( !section.label && snapshot.label ) section.label = snapshot.label;
		if ( section.order == null && snapshot.order != null ) section.order = snapshot.order;
		section.dataset = { ...snapshot.dataset, ...section.dataset };
		if ( foundry.utils.isEmpty(section.groups) && !foundry.utils.isEmpty(snapshot.groups) ) {
			section.groups = foundry.utils.deepClone(snapshot.groups);
		}
	}
}

function resolveStarshipItemGroup(item) {
	const pack = getCompendiumPack(item);
	const featType = item.system?.type?.value;
	const role = item.flags?.sw5e?.starshipCharacter?.role;
	const isStarshipWeapon = pack === "starshipweapons" || item.type === "weapon";
	const isStarshipEquipment = pack === "starshiparmor" || pack === "starshipequipment";

	if ( item.flags?.sw5e?.legacyStarshipSize || role === "classification" ) return "systems";
	if ( item.flags?.sw5e?.legacyStarshipMod || role === "modification" || pack === "starshipmodifications" ) return "modifications";
	if ( featType === "starshipAction" || pack === "starshipactions" ) return "actions";
	if ( featType === "deployment" || role === "deployment" || role === "venture" || pack === "deployments" || pack === "deploymentfeatures" || pack === "ventures" ) return null;
	if ( featType === "starship" || pack === "starshipfeatures" ) return "systems";
	if ( isStarshipWeapon ) return "weapons";
	if ( isStarshipEquipment || item.type === "equipment" ) return "equipment";
	return null;
}

function getStarshipInventoryManagedItemIds(actor) {
	const groups = categorizeStarshipItems(actor);
	return new Set(["weapons", "equipment", "modifications"].flatMap(key => groups[key]?.items?.map(item => item.id) ?? []));
}

function getStarshipFeaturesManagedItemIds(actor) {
	const groups = categorizeStarshipItems(actor);
	return new Set(["actions", "size", "features"].flatMap(key => groups[key]?.items?.map(item => item.id) ?? []));
}

function getStarshipInventoryExcludedItemIds(actor) {
	return getStarshipFeaturesManagedItemIds(actor);
}

function getStarshipFeaturesExcludedFromFeaturesTab(actor) {
	const groups = categorizeStarshipItems(actor);
	return new Set(groups.roles?.items?.map(item => item.id) ?? []);
}

function pruneStarshipCargoManagedInventoryEntries(context, managedIds) {
	if ( !managedIds?.size ) return;
	filterPreparedInventoryEntries(context.items, managedIds);
	filterPreparedInventoryEntries(context.containers, managedIds);
	filterPreparedInventoryEntries(context.inventory, managedIds);
	for ( const section of getIterableValues(context.sections) ) filterPreparedInventoryEntries(section?.items, managedIds);
	for ( const section of getIterableValues(context.features) ) filterPreparedInventoryEntries(section?.items, managedIds);
	for ( const section of getIterableValues(context.cargo) ) filterPreparedInventoryEntries(section?.items, managedIds);
	for ( const category of getIterableValues(context.itemCategories) ) {
		filterPreparedInventoryEntries(category?.items, managedIds);
		for ( const section of getIterableValues(category) ) filterPreparedInventoryEntries(section?.items, managedIds);
	}
}

function getStarshipFeaturesListControls() {
	const featureSearch = game.i18n.localize("DND5E.FeatureSearch");
	return {
		label: featureSearch && featureSearch !== "DND5E.FeatureSearch" ? featureSearch : "Search features",
		list: "features",
		filters: [
			{ key: "action", label: "DND5E.Action" },
			{ key: "bonus", label: "DND5E.BonusAction" },
			{ key: "reaction", label: "DND5E.Reaction" }
		],
		sorting: [
			{ key: "m", label: "SIDEBAR.SortModeManual", dataset: { icon: "fa-solid fa-arrow-down-short-wide" } },
			{ key: "a", label: "SIDEBAR.SortModeAlpha", dataset: { icon: "fa-solid fa-arrow-down-a-z" } }
		],
		grouping: []
	};
}

function getStarshipInventorySearchRoot(root) {
	if ( !(root instanceof HTMLElement) ) return null;
	return root.querySelector("[data-application-part=\"inventory\"]")
		?? root.querySelector("[data-tab=\"inventory\"]")
		?? root.querySelector(".tab.inventory")
		?? root;
}

function findStarshipModificationsInventorySection(inventoryRoot) {
	if ( !(inventoryRoot instanceof HTMLElement) ) return null;

	const selectorHits = [
		`[data-sw5e-section-id="${STARSHIP_MODIFICATIONS_SECTION_ID}"]`,
		"[data-group-sw5e-inventory=\"modifications\"]"
	];
	for ( const selector of selectorHits ) {
		const section = inventoryRoot.querySelector(`.items-section${selector}`);
		if ( section ) return section;
	}

	const modsLabel = localizeOrFallback("TYPES.Item.starshipmodPl", "Modifications");
	const localizedModsLabel = game.i18n.localize("TYPES.Item.starshipmodPl");
	for ( const section of inventoryRoot.querySelectorAll(".items-section") ) {
		const title = section.querySelector(".items-header .item-name");
		const text = title?.textContent?.trim();
		if ( !text ) continue;
		if ( text === modsLabel || (localizedModsLabel && text === localizedModsLabel) ) return section;
	}
	return null;
}

function getStarshipModificationPoolSummary(actor) {
	const pools = deriveStarshipPools(actor);
	return {
		modSlots: `${pools.mods.slotsUsed}/${pools.mods.slotMax}`,
		suites: `${pools.mods.suitesUsed}/${pools.mods.suiteMax}`
	};
}

function createStarshipModificationHeaderStat(value, suffixLabel = "") {
	const stat = document.createElement("span");
	stat.className = "sw5e-starship-modifications-header-stat";
	const valueEl = document.createElement("span");
	valueEl.className = "sw5e-starship-modifications-header-stat-value";
	valueEl.textContent = value;
	stat.append(valueEl);
	if ( suffixLabel ) {
		const suffixEl = document.createElement("span");
		suffixEl.className = "sw5e-starship-modifications-header-stat-suffix";
		suffixEl.textContent = suffixLabel;
		stat.append(suffixEl);
	}
	return stat;
}

function applyStarshipModificationsSectionHeader(root, actor) {
	if ( !isSw5eStarshipActor(actor) ) return false;

	const inventoryRoot = getStarshipInventorySearchRoot(root);
	if ( !inventoryRoot ) return false;

	const section = findStarshipModificationsInventorySection(inventoryRoot);
	const header = section?.querySelector(".items-header.header");
	if ( !header ) return false;

	const { modSlots, suites } = getStarshipModificationPoolSummary(actor);
	const suitesLabel = localizeOrFallback("SW5E.Suites", "Suites");

	let stats = header.querySelector(".sw5e-starship-modifications-header-stats");
	if ( !stats ) {
		stats = document.createElement("div");
		stats.className = "sw5e-starship-modifications-header-stats";
		const columnHeader = header.querySelector(".item-header");
		if ( columnHeader ) header.insertBefore(stats, columnHeader);
		else header.append(stats);
	}

	stats.replaceChildren(
		createStarshipModificationHeaderStat(modSlots),
		createStarshipModificationHeaderStat(suites, suitesLabel)
	);
	return true;
}

function scheduleStarshipModificationsSectionHeader(root, actor) {
	const run = () => { applyStarshipModificationsSectionHeader(root, actor); };
	queueMicrotask(run);
	requestAnimationFrame(() => requestAnimationFrame(run));
}

function ensureStarshipModificationsSectionHeaderSync(root, app) {
	if ( !(root instanceof HTMLElement) || root.dataset.sw5eModHeaderSync === "1" ) return;
	root.dataset.sw5eModHeaderSync = "1";

	let timer = null;
	const sync = () => {
		const actor = app?.actor;
		if ( !isSw5eStarshipActor(actor) ) return;
		applyStarshipModificationsSectionHeader(root, actor);
	};
	const debouncedSync = () => {
		clearTimeout(timer);
		timer = setTimeout(sync, 0);
	};

	const inventoryRoot = getStarshipInventorySearchRoot(root) ?? root;
	const observer = new MutationObserver(debouncedSync);
	observer.observe(inventoryRoot, { childList: true, subtree: true });
	root._sw5eModHeaderObserver = observer;

	scheduleStarshipModificationsSectionHeader(root, app?.actor);
}

function buildStarshipGroupedSections(sheet, context, sectionDefs, { managedItemIds, includeStockRemainder = true } = {}) {
	const actor = sheet.actor;
	const Inventory = customElements.get(sheet.options.elements.inventory);
	if ( !Inventory?.prepareSections || !Inventory.mapColumns ) return false;

	const isInventoryTab = sectionDefs === STARSHIP_INVENTORY_SECTION_DEFS;
	const sectionIdSet = isInventoryTab ? STARSHIP_INVENTORY_MANAGED_SECTION_IDS : STARSHIP_FEATURES_MANAGED_SECTION_IDS;
	const managedIds = managedItemIds
		?? (isInventoryTab ? getStarshipInventoryManagedItemIds(actor) : getStarshipFeaturesManagedItemIds(actor));

	const categorized = categorizeStarshipItems(actor);
	const inventoryColumns = Inventory.mapColumns(STARSHIP_CARGO_INVENTORY_COLUMNS);
	const featColumns = Inventory.mapColumns(STARSHIP_FEATURES_FEAT_COLUMNS);
	const rawSections = [];

	for ( const def of sectionDefs ) {
		const sourceItems = def.key === "systems"
			? [...categorized.size.items, ...categorized.features.items]
			: (categorized[def.key]?.items ?? []);
		if ( !sourceItems.length ) continue;

		const sectionEntry = {
			id: def.id,
			label: localizeOrFallback(def.labelKey, def.fallback),
			order: def.order,
			columns: def.columns === "feat" ? featColumns : inventoryColumns,
			groups: isInventoryTab ? { sw5eInventory: def.key } : { sw5eFeatures: def.key },
			items: sourceItems.sort((left, right) => left.name.localeCompare(right.name))
		};
		if ( def.id === STARSHIP_MODIFICATIONS_SECTION_ID ) {
			sectionEntry.dataset = { sw5eSectionId: def.id };
		}
		rawSections.push(sectionEntry);
	}

	if ( !rawSections.length && !includeStockRemainder ) return false;

	const stockSectionSnapshots = snapshotStockInventorySections(context.sections, sectionIdSet);
	const prepared = rawSections.length ? Inventory.prepareSections(rawSections) : [];
	pruneStarshipCargoManagedInventoryEntries(context, managedIds);

	const remaining = Array.isArray(context.sections)
		? context.sections.filter(section => section?.items?.length)
		: [];
	applyStockInventorySectionSnapshots(remaining, stockSectionSnapshots, sectionIdSet);
	restoreStockInventorySectionLabels(remaining, sectionIdSet);
	context.sections = includeStockRemainder ? [...prepared, ...remaining] : prepared;
	return prepared.length > 0 || (includeStockRemainder && remaining.length > 0);
}

function injectStarshipInventorySections(sheet, context) {
	buildStarshipGroupedSections(sheet, context, STARSHIP_INVENTORY_SECTION_DEFS, {
		managedItemIds: getStarshipInventoryManagedItemIds(sheet.actor),
		includeStockRemainder: true
	});
}

function injectStarshipFeaturesSections(sheet, context) {
	buildStarshipGroupedSections(sheet, context, STARSHIP_FEATURES_SECTION_DEFS, {
		managedItemIds: getStarshipFeaturesManagedItemIds(sheet.actor),
		includeStockRemainder: false
	});
}

function registerStarshipCargoInventoryWrappers() {
	if ( vehicleSheetStarshipCargoInventoryWrapped ) return;
	vehicleSheetStarshipCargoInventoryWrapped = true;

	const moduleId = getModuleId();
	const physicalWrapper = async function(wrapped, item, ctx) {
		await wrapped.call(this, item, ctx);
		if ( !isSw5eStarshipActor(this.actor) ) return;
		const group = resolveStarshipItemGroup(item);
		if ( !group ) return;
		if ( group === "weapons" || group === "equipment" || group === "modifications" ) ctx.groups = { sw5eInventory: group };
		else ctx.groups = { sw5eFeatures: group };
	};

	try {
		libWrapper.register(moduleId, "dnd5e.applications.actor.VehicleActorSheet.prototype._prepareItemPhysical", physicalWrapper, "WRAPPER");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap VehicleActorSheet _prepareItemPhysical for starship cargo grouping.", err);
	}

	try {
		libWrapper.register(moduleId, "dnd5e.applications.actor.VehicleActorSheet.prototype._prepareItemFeature", async function(wrapped, item, ctx) {
			await wrapped.call(this, item, ctx);
			if ( !isSw5eStarshipActor(this.actor) ) return;
			const group = resolveStarshipItemGroup(item);
			if ( !group ) return;
			if ( group === "weapons" || group === "equipment" || group === "modifications" ) ctx.groups = { sw5eInventory: group };
			else ctx.groups = { sw5eFeatures: group };
		}, "WRAPPER");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap VehicleActorSheet _prepareItemFeature for starship cargo grouping.", err);
	}
}

function registerStarshipCargoItemCategoryHook() {
	Hooks.on("sw5e.BaseActorSheet._assignItemCategories", (_this, _result, config, item) => {
		if ( !isSw5eStarshipActor(_this.actor) ) return;
		const group = resolveStarshipItemGroup(item);
		if ( !group ) return;
		if ( group === "weapons" || group === "equipment" || group === "modifications" ) config.result = new Set(["inventory"]);
		else config.result = new Set();
	});
}

function ensureStarshipCargoInventoryInteractions(root, app) {
	if ( !(root instanceof HTMLElement) || root.dataset.sw5eCargoInventoryBound === "1" ) return;
	root.dataset.sw5eCargoInventoryBound = "1";
	ensureStarshipManagedInventoryInteractions(root, app, getStarshipInventoryManagedItemIds(app.actor));
	ensureStarshipModificationsSectionHeaderSync(root, app);
}

function ensureStarshipFeaturesInventoryInteractions(root, app) {
	if ( !(root instanceof HTMLElement) || root.dataset.sw5eFeaturesInventoryBound === "1" ) return;
	root.dataset.sw5eFeaturesInventoryBound = "1";
	ensureStarshipManagedInventoryInteractions(root, app, getStarshipFeaturesManagedItemIds(app.actor));
}

function ensureStarshipManagedInventoryInteractions(root, app, getManagedIds) {
	root.addEventListener("inventory", event => {
		if ( event.detail !== "use" ) return;
		const actor = app?.actor;
		if ( !isSw5eStarshipActor(actor) ) return;
		const row = event.target?.closest?.("[data-item-id]");
		const itemId = row?.dataset?.itemId;
		const managedIds = typeof getManagedIds === "function" ? getManagedIds(actor) : getManagedIds;
		if ( !itemId || !managedIds?.has(itemId) ) return;
		const item = actor.items.get(itemId);
		if ( !item ) return;
		if ( item.flags?.sw5e?.legacyStarshipSize || item.flags?.sw5e?.starshipCharacter?.role === "classification" ) {
			event.preventDefault();
			return;
		}
		event.preventDefault();
		void useStarshipItem(item, actor, event);
	}, { capture: true });
}

function getFoundryResolvedAssetUrl(relativePath) {
	if ( typeof relativePath !== "string" || !relativePath ) return "";
	// Absolute URLs (user / compendium art): never run through getRoute.
	if ( /^https?:\/\//i.test(relativePath) ) return relativePath;
	if ( typeof foundry?.utils?.getRoute === "function" ) {
		try {
			return foundry.utils.getRoute(relativePath);
		} catch {
			/* fall through */
		}
	}
	const p = relativePath.replace(/^\/+/, "");
	if ( typeof globalThis.RoutePrefix === "string" && globalThis.RoutePrefix && globalThis.RoutePrefix !== "/" )
		return `${globalThis.RoutePrefix.replace(/\/$/, "")}/${p}`;
	return `/${p}`;
}

function getStarshipSheetFallbackImageUrl() {
	return getFoundryResolvedAssetUrl(DND5E_VEHICLE_ACTOR_FALLBACK_PATH);
}

/**
 * Sheet template `src` only — never written to actor/item data.
 * Uses sanitized path when present; generic vehicle SVG only when art is missing/placeholder after sanitization.
 * `bindStarshipSheetImageFallbacks` swaps to the same SVG on actual load error (e.g. 404 / TLS).
 */
function resolveStarshipSheetImageUrl(raw) {
	const cleaned = sanitizeImagePath(raw);
	if ( cleaned ) return getFoundryResolvedAssetUrl(cleaned);
	return getStarshipSheetFallbackImageUrl();
}

function bindStarshipSheetImageFallbacks(root) {
	if ( !(root instanceof HTMLElement) ) return;
	const fb = getStarshipSheetFallbackImageUrl();
	if ( !fb ) return;
	root.querySelectorAll("img.sw5e-starship-portrait-image, img.sw5e-starship-item-image").forEach(img => {
		if ( img.dataset.sw5eImgFallbackBound === "1" ) return;
		img.dataset.sw5eImgFallbackBound = "1";
		img.addEventListener("error", function onStarshipImageError() {
			img.removeEventListener("error", onStarshipImageError);
			if ( img.dataset.sw5eImgFallbackApplied === "1" ) return;
			img.dataset.sw5eImgFallbackApplied = "1";
			img.src = fb;
		});
	});
}

/** Keys from `CONFIG.DND5E.actorSizes` — `system.traits.size` must be one of these or dnd5e `_preUpdate` can throw (token sizing). */
function getDnd5eActorSizeKeys() {
	return Object.keys(CONFIG?.DND5E?.actorSizes ?? {});
}

function isValidDnd5eActorSizeKey(value) {
	return typeof value === "string"
		&& value !== ""
		&& Object.prototype.hasOwnProperty.call(CONFIG?.DND5E?.actorSizes ?? {}, value);
}

function resolveValidActorSizeKey(actor, legacySystem) {
	const keys = getDnd5eActorSizeKeys();
	const fallback = keys.includes("med") ? "med" : (keys[0] ?? "med");
	for ( const c of [actor?.system?.traits?.size, legacySystem?.traits?.size] ) {
		if ( isValidDnd5eActorSizeKey(c) ) return c;
	}
	return fallback;
}

/**
 * Starship sheet form / mode-toggle can send blank or legacy invalid size strings; coerce before Actor5e.update.
 */
function sanitizeStarshipTraitsSizeForUpdate(actor, changed) {
	if ( !changed || typeof changed !== "object" ) return;
	if ( !foundry.utils.hasProperty(changed, "system.traits.size") ) return;
	const incoming = foundry.utils.getProperty(changed, "system.traits.size");
	const ks = getDnd5eActorSizeKeys();
	const fallback = ks.includes("med") ? "med" : (ks[0] ?? "med");
	const next = isValidDnd5eActorSizeKey(incoming)
		? incoming
		: (isValidDnd5eActorSizeKey(actor?.system?.traits?.size) ? actor.system.traits.size : fallback);
	foundry.utils.setProperty(changed, "system.traits.size", next);
}

function syncStarshipPrototypeTokenDimensionsForUpdate(actor, changed) {
	if ( !changed || typeof changed !== "object" ) return;
	if ( !foundry.utils.hasProperty(changed, "system.traits.size") ) return;
	const sizeKey = foundry.utils.getProperty(changed, "system.traits.size");
	if ( !sizeKey || sizeKey === actor?.system?.traits?.size ) return;
	const { width, height } = getStarshipPrototypeTokenDimensions(sizeKey);
	// dnd5e may already have stamped stock token dimensions onto the pending payload before this hook runs.
	// On starship size changes, always reassert the SW5E-specific token map so gargantuan resolves to 16x16, etc.
	foundry.utils.setProperty(changed, "prototypeToken.width", width);
	foundry.utils.setProperty(changed, "prototypeToken.height", height);
}

function onPreUpdateActorStarshipTraitsSize(document, changed, _options, _userId) {
	if ( !isSw5eStarshipActor(document) ) return;
	sanitizeStarshipTraitsSizeForUpdate(document, changed);
	syncStarshipPrototypeTokenDimensionsForUpdate(document, changed);
}

/**
 * Coerce vehicle HP integer fields before Actor update (defense in depth vs blank string / float from form serialization).
 */
function sanitizeStarshipHpIntegersForUpdate(actor, changed) {
	if ( !changed || typeof changed !== "object" ) return;
	for ( const path of STARSHIP_INTEGER_HP_PATHS ) {
		if ( !foundry.utils.hasProperty(changed, path) ) continue;
		const raw = foundry.utils.getProperty(changed, path);
		const coerced = coerceStarshipIntegerHpField(actor, path, raw);
		if ( coerced !== null ) foundry.utils.setProperty(changed, path, coerced);
	}
}

function onPreUpdateActorStarshipHpIntegers(document, changed, _options, _userId) {
	if ( !isSw5eStarshipActor(document) ) return;
	sanitizeStarshipHpIntegersForUpdate(document, changed);
}

function getPersistedStarshipAbilityValue(actor, abilityId) {
	const persistedAbility = actor?._source?.system?.abilities?.[abilityId];
	const persistedValue = Number(persistedAbility?.value ?? persistedAbility);
	if ( Number.isFinite(persistedValue) ) return persistedValue;
	const legacyAbility = actor?.flags?.sw5e?.legacyStarshipActor?.system?.abilities?.[abilityId];
	const legacyValue = Number(legacyAbility?.value ?? legacyAbility);
	if ( Number.isFinite(legacyValue) ) return legacyValue;
	const liveAbility = actor?.system?.abilities?.[abilityId];
	const liveValue = Number(liveAbility?.value ?? liveAbility);
	if ( Number.isFinite(liveValue) ) return liveValue;
	return 10;
}

function coerceStarshipAbilityValueForUpdate(actor, abilityId, raw) {
	const fallback = Math.trunc(getPersistedStarshipAbilityValue(actor, abilityId));
	const trimmed = String(raw ?? "").trim();
	if ( trimmed === "" ) return fallback;
	const n = Number(trimmed);
	if ( !Number.isFinite(n) ) return fallback;
	return Math.trunc(n);
}

function sanitizeStarshipAbilityValuesForUpdate(actor, changed) {
	if ( !changed || typeof changed !== "object" ) return;
	for ( const abilityId of STARSHIP_ABILITY_KEYS ) {
		const path = `system.abilities.${abilityId}.value`;
		if ( !foundry.utils.hasProperty(changed, path) ) continue;
		foundry.utils.setProperty(
			changed,
			path,
			coerceStarshipAbilityValueForUpdate(actor, abilityId, foundry.utils.getProperty(changed, path))
		);
	}
}

function mirrorStarshipAbilityValuesToLegacyFlag(changed) {
	if ( !changed || typeof changed !== "object" ) return;
	for ( const abilityId of STARSHIP_ABILITY_KEYS ) {
		const path = `system.abilities.${abilityId}.value`;
		if ( !foundry.utils.hasProperty(changed, path) ) continue;
		foundry.utils.setProperty(
			changed,
			`flags.sw5e.legacyStarshipActor.system.abilities.${abilityId}.value`,
			foundry.utils.getProperty(changed, path)
		);
	}
}

function onPreUpdateActorStarshipAbilities(document, changed, _options, _userId) {
	if ( !isSw5eStarshipActor(document) ) return;
	sanitizeStarshipAbilityValuesForUpdate(document, changed);
	mirrorStarshipAbilityValuesToLegacyFlag(changed);
}

function getCompendiumPack(item) {
	const sourceId = item?.flags?.core?.sourceId;
	const match = /^Compendium\.[^.]+\.([^.]+)\./.exec(sourceId ?? "");
	return match?.[1] ?? null;
}

function normalizeSourceLabel(source) {
	if ( typeof source === "string" ) return source && source !== "[object Object]" ? source : "";
	if ( source && typeof source === "object" ) return source.custom ?? source.book ?? source.label ?? "";
	return "";
}

function sanitizeImagePath(value) {
	if ( typeof value !== "string" ) return "";
	const normalized = value.trim();
	if ( !normalized ) return "";
	const lower = normalized.toLowerCase();
	// Placeholder / invalid only — do not block specific hosts; rely on `error` fallback for broken loads.
	if ( ["undefined", "null", "nan"].includes(lower) ) return "";
	return normalized;
}

function formatPool(current, max) {
	const currentValue = Number.isFinite(Number(current)) ? Number(current) : null;
	const maxValue = Number.isFinite(Number(max)) ? Number(max) : null;
	if ( currentValue == null && maxValue == null ) return "-";
	if ( maxValue == null ) return `${currentValue ?? 0}`;
	return `${currentValue ?? 0} / ${maxValue}`;
}

/** Live dnd5e vehicle HP object (hull value/max, shield temp/tempmax) — same source as stock vehicle Hit Points UI. */
function getStarshipLiveVehicleHp(actor) {
	return actor?.system?.attributes?.hp ?? {};
}

function formatMovement(actor, legacySystem) {
	const runtime = getDerivedStarshipRuntime(actor);
	const derivedMovement = runtime.movement;
	const units = derivedMovement.units || actor.system?.attributes?.movement?.units || "ft";
	const space = Number.isFinite(Number(derivedMovement.space)) ? Number(derivedMovement.space) : null;
	const turn = Number.isFinite(Number(derivedMovement.turn)) ? Number(derivedMovement.turn) : null;
	if ( space != null || turn != null ) {
		const notes = [];
		if ( turn != null ) notes.push(`Turn ${turn}`);
		if ( derivedMovement.profileSource ) notes.push(derivedMovement.profileSource);
		return {
			primary: `${space ?? 0} ${units}`,
			secondary: notes.join(" | ")
		};
	}

	const spaceSpeed = Number.isFinite(Number(actor.system?.attributes?.movement?.space))
		? Number(actor.system.attributes.movement.space)
		: null;
	return {
		primary: spaceSpeed != null ? `${spaceSpeed} ${units}` : "-",
		secondary: ""
	};
}

function localizeTravelPace(pace) {
	const normalized = String(pace ?? "").trim().toLowerCase();
	if ( normalized === "fast" ) return localizeOrFallback("DND5E.TravelPaceFast", "Fast");
	if ( normalized === "slow" ) return localizeOrFallback("DND5E.TravelPaceSlow", "Slow");
	return localizeOrFallback("DND5E.TravelPaceNormal", "Normal");
}

function formatStarshipSidebarTravelSpeed(actor) {
	const travel = actor?.system?.attributes?.travel ?? {};
	const speed = Number(travel.speeds?.air);
	if ( !Number.isFinite(speed) ) return "—";
	const units = travel.units === "kph" ? "km/h" : "mph";
	return `${Math.round(speed)} ${units}`;
}

function formatStarshipSidebarTravelPace(actor) {
	const travel = actor?.system?.attributes?.travel ?? {};
	const pace = Number(travel.paces?.air);
	if ( !Number.isFinite(pace) ) return "—";
	const units = travel.units === "kph" ? "km/d" : "mi/d";
	return `${pace.toLocaleString()} ${units}`;
}

function formatTravel(actor) {
	const runtime = getDerivedStarshipRuntime(actor);
	return {
		primary: localizeTravelPace(runtime.travel?.pace),
		secondary: `Stealth ${localizeTravelPace(runtime.travel?.stealthPace)}`
	};
}

function formatHyperdrive(actor) {
	const runtime = getDerivedStarshipRuntime(actor);
	const hyperdriveClass = Number(runtime.travel?.hyperdriveClass ?? 0);
	return hyperdriveClass > 0 ? `Class ${hyperdriveClass}` : localizeOrFallback("SW5E.None", "None");
}

function formatPowerSummary(legacySystem) {
	const power = legacySystem.attributes?.power ?? {};
	const central = Number.isFinite(Number(power.central?.value)) ? Number(power.central.value) : 0;
	const engines = Number.isFinite(Number(power.engines?.value)) ? Number(power.engines.value) : 0;
	const shields = Number.isFinite(Number(power.shields?.value)) ? Number(power.shields.value) : 0;
	const weapons = Number.isFinite(Number(power.weapons?.value)) ? Number(power.weapons.value) : 0;
	return `C ${central} | E ${engines} | S ${shields} | W ${weapons}`;
}

function getSizeLabel(actor, legacySystem) {
	const sizeKey = actor.system?.traits?.size ?? legacySystem.traits?.size ?? "";
	const entry = CONFIG.DND5E.actorSizes?.[sizeKey];
	return (typeof entry === "string" ? entry : entry?.label) ?? sizeKey ?? "-";
}

function getDeploymentCounts(legacySystem) {
	const deployment = legacySystem.attributes?.deployment ?? {};
	const crew = Array.isArray(deployment.crew?.items) ? deployment.crew.items : Array.isArray(deployment.crew) ? deployment.crew : [];
	const passenger = Array.isArray(deployment.passenger?.items) ? deployment.passenger.items : Array.isArray(deployment.passenger) ? deployment.passenger : [];
	const rawPilot = deployment.pilot?.value ?? deployment.pilot ?? "";
	return {
		pilot: typeof rawPilot === "string" ? rawPilot : "",
		crew: crew.length,
		passenger: passenger.length
	};
}

function makeOverviewCards(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const runtime = getDerivedStarshipRuntime(actor);
	const pools = deriveStarshipPools(actor);
	const movement = formatMovement(actor, legacySystem);
	const deployment = {
		...getDeploymentCounts(legacySystem),
		...runtime.crew
	};
	const travel = formatTravel(actor);
	const fuel = legacySystem.attributes?.fuel ?? {};
	const routing = legacySystem.attributes?.power?.routing ?? "none";
	const effectiveRouting = getEffectivePowerRouting(routing);

	return [
		{
			label: localizeOrFallback("SW5E.Movement", "Movement"),
			value: movement.primary,
			note: movement.secondary || localizeOrFallback("SW5E.MovementSpace", "Space")
		},
		{
			label: localizeOrFallback("DND5E.TravelPace", "Travel Pace"),
			value: travel.primary,
			note: travel.secondary
		},
		{
			label: localizeOrFallback("SW5E.Hyperdrive", "Hyperdrive"),
			value: formatHyperdrive(actor),
			note: runtime.travel?.hyperdriveClass ? localizeOrFallback("SW5E.Hyperspace", "Hyperspace") : localizeOrFallback("SW5E.None", "Not Installed")
		},
		{
			label: localizeOrFallback("SW5E.VehicleCrew", "Crew"),
			value: `${deployment.crewCount ?? deployment.crew ?? 0}`,
			note: deployment.pilotName || deployment.pilot ? `Pilot: ${deployment.pilotName || deployment.pilot}` : "No pilot assigned"
		},
		{
			label: localizeOrFallback("SW5E.Fuel", "Fuel"),
			value: formatPool(fuel.value, fuel.fuelCap),
			note: fuel.cost ? `Cost ${fuel.cost}` : localizeOrFallback("SW5E.PowerDie", "Power")
		},
		{
			label: localizeOrFallback("SW5E.PowerDie", "Routing"),
			value: buildStarshipRoutingOptionLabel(effectiveRouting),
			note: pools.power.die ? `${pools.power.die} | ${formatPowerZones(legacySystem, pools)}` : formatPowerSummary(legacySystem)
		}
	];
}

function makeStarshipSummaryStripVitals(actor) {
	const vitals = buildStarshipSidebarVitalsContext(actor);
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const pools = deriveStarshipPools(actor);
	const tier = legacySystem.details?.tier ?? pools.tier;
	return [
		{
			label: localizeOrFallback("SW5E.StarshipTier", "Tier"),
			value: Number.isFinite(Number(tier)) ? `${tier}` : "-"
		},
		{
			label: localizeOrFallback("SW5E.HullPoints", "Hull Points"),
			value: `${vitals.hull.value}/${vitals.hull.max}`
		},
		{
			label: localizeOrFallback("SW5E.ShieldPoints", "Shield Points"),
			value: `${vitals.shield.value}/${vitals.shield.max}`
		},
		{
			label: localizeOrFallback("SW5E.HullDice", "Hull Dice"),
			value: formatDicePool(vitals.hullDice.current, vitals.hullDice.max, vitals.hullDice.die)
		},
		{
			label: localizeOrFallback("SW5E.ShieldDice", "Shield Dice"),
			value: formatDicePool(vitals.shieldDice.current, vitals.shieldDice.max, vitals.shieldDice.die)
		}
	];
}

/**
 * At-a-glance strip: sidebar summary rows plus the first four operational cards
 * (Movement, Travel Pace, Hyperdrive, Crew). Fuel and power routing live on Core only.
 */
function makeStarshipSummaryStrip(actor) {
	const operational = makeOverviewCards(actor);
	return [
		...makeStarshipSummaryStripVitals(actor),
		...makeSidebarSummary(actor, { includeTier: false }),
		...operational.slice(0, 4)
	];
}

function formatDicePool(current, max, die) {
	if ( !max && !die ) return "-";
	const pool = max > 0 ? `${current}/${max}` : "-";
	return die ? `${pool} ${die}` : pool;
}

/**
 * Context for the Systems tab core configuration section: existing actor paths only, no invented values.
 * See getLegacyStarshipActorSystem / deriveStarshipPools / getDerivedStarshipRuntime in starship-data.mjs.
 */
function buildSystemsCoreContext(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const runtime = getDerivedStarshipRuntime(actor);
	const pools = deriveStarshipPools(actor);
	const hp = getStarshipLiveVehicleHp(actor);
	const fuel = legacySystem.attributes?.fuel ?? {};
	const power = legacySystem.attributes?.power ?? {};
	const movement = runtime.movement ?? {};
	const units = movement.units ?? actor.system?.attributes?.movement?.units ?? "ft";
	const routing = power.routing ?? "none";
	const effectiveRouting = getEffectivePowerRouting(routing);
	const fuelValue = Number.isFinite(Number(fuel.value)) ? Number(fuel.value) : 0;
	const fuelCap = Number.isFinite(Number(fuel.fuelCap)) ? Number(fuel.fuelCap) : 0;
	const fuelBar = buildStarshipFuelBarContext(fuelValue, fuelCap);
	const tierRaw = legacySystem.details?.tier ?? pools.tier;
	const resolvedActorSize = resolveValidActorSizeKey(actor, legacySystem);
	const starshipUi = actor?.flags?.sw5e?.starship?.ui ?? {};

	return {
		turningSpeedDisplay: Number.isFinite(Number(movement.turn))
			? `${Math.round(Number(movement.turn))} ${units}`
			: "—",
		turningSpeedHint: localizeOrFallback(
			"SW5E.StarshipSheet.TurningDerivedHint",
			"Recalculated when the sheet updates (size item, pilot skills, abilities, power routing, and engine routing multiplier)."
		),
		spaceSpeedDisplay: Number.isFinite(Number(movement.space))
			? `${Math.round(Number(movement.space))} ${units}`
			: "—",
		routingOptions: STARSHIP_ROUTING_KEYS_VISIBLE.map(value => ({
			value,
			label: buildStarshipRoutingOptionLabel(value),
			tooltip: buildStarshipRoutingOptionTooltip(value),
			selected: effectiveRouting === value
		})),
		routingSelectionEffect: buildStarshipRoutingSelectionEffect(routing),
		sizeOptions: Object.entries(CONFIG.DND5E?.actorSizes ?? {}).map(([value, entry]) => ({
			value,
			label: typeof entry === "string" ? entry : (entry?.label ?? value),
			selected: resolvedActorSize === value
		})),
		tierValue: Number.isFinite(Number(tierRaw)) ? Number(tierRaw) : 0,
		hullPointsValue: Number.isFinite(Number(hp.value)) ? Number(hp.value) : 0,
		hullPointsMax: Number.isFinite(Number(hp.max)) ? Number(hp.max) : 0,
		shieldPointsTemp: Number.isFinite(Number(hp.temp)) ? Number(hp.temp) : 0,
		shieldPointsTempMax: Number.isFinite(Number(hp.tempmax)) ? Number(hp.tempmax) : 0,
		fuelValue,
		fuelCap,
		fuelCost: Number.isFinite(Number(fuel.cost)) ? Number(fuel.cost) : 0,
		fuelPct: fuelBar.fuelPct,
		fuelBarLabel: fuelBar.fuelBarLabel,
		fuelHasCap: fuelBar.fuelHasCap,
		configSectionLede: localizeOrFallback(
			"SW5E.StarshipSheet.SystemsConfigSectionLede",
			"Tier, size, hull, shields, and dice pools are edited from the sidebar. Power routing and fuel are on the Core tab."
		),
		sectionOperationsKicker: localizeOrFallback("SW5E.StarshipSheet.SystemsSectionOperationsKicker", "Operations"),
		powerRoutingHint: localizeOrFallback(
			"SW5E.StarshipSheet.PowerRoutingSystemsHint",
			"Choose which subsystem receives boosted reactor output during play. This is a legacy routing shortcut—not the SotG Boost action or power die allocation workflow."
		),
		powerRoutingLegacyBadge: localizeOrFallback(
			"SW5E.StarshipSheet.PowerRoutingLegacyBadge",
			"Legacy / Reroute Power"
		),
		sectionSupportingKicker: localizeOrFallback("SW5E.StarshipSheet.SystemsSectionSupportingKicker", "Power state & kinematics"),
		systemsLivePlayBadge: localizeOrFallback("SW5E.StarshipSheet.SystemsLivePlayBadge", "Usable in Play mode"),
		systemsSupportingSetupHint: localizeOrFallback(
			"SW5E.StarshipSheet.SystemsSupportingSetupHint",
			"Fuel fields are maintenance/setup — switch the sheet to Edit mode to change them."
		),
		labels: {
			turningSpeed: localizeOrFallback("SW5E.TurnSpeed", "Turning speed"),
			spaceSpeed: localizeOrFallback("SW5E.SpeedSpace", "Space speed"),
			powerRouting: localizeOrFallback("SW5E.PowerRouting", "Power routing"),
			hullCurrent: localizeOrFallback("SW5E.StarshipHullFieldCurrent", "Current hull points"),
			hullMax: localizeOrFallback("SW5E.StarshipHullFieldMax", "Maximum hull points"),
			shieldCurrent: localizeOrFallback("SW5E.StarshipShieldFieldCurrent", "Current shield points"),
			shieldMax: localizeOrFallback("SW5E.StarshipShieldFieldMax", "Maximum shield points"),
			fuel: localizeOrFallback("SW5E.Fuel", "Fuel"),
			fuelCurrent: localizeOrFallback("SW5E.StarshipFuelFieldCurrent", "Current fuel"),
			fuelCap: localizeOrFallback("SW5E.FuelCap", "Fuel cap"),
			fuelCost: localizeOrFallback("SW5E.FuelCost", "Regeneration cost"),
			fuelCapacity: localizeOrFallback("SW5E.FuelCapacity", "Fuel capacity"),
			burnFuel: localizeOrFallback("SW5E.BurnFuel", "Burn"),
			refuel: localizeOrFallback("SW5E.Refuel", "Refuel"),
			burnFuelTooltip: localizeOrFallback("SW5E.StarshipSheet.BurnFuelTooltip", "Burn 1 fuel unit"),
			refuelTooltip: localizeOrFallback("SW5E.StarshipSheet.RefuelTooltip", "Refuel to capacity"),
			derived: localizeOrFallback("SW5E.Derived", "Derived")
		},
		coreCollapse: {
			crew: starshipUi.crewCollapsed === true,
			fuel: starshipUi.fuelCollapsed === true
		},
		coreCollapseLabels: {
			crew: {
				expand: localizeOrFallback("SW5E.StarshipSheet.CoreCrewExpand", "Expand Crew & Passengers"),
				collapse: localizeOrFallback("SW5E.StarshipSheet.CoreCrewCollapse", "Collapse Crew & Passengers")
			},
			fuel: {
				expand: localizeOrFallback("SW5E.StarshipSheet.CoreFuelExpand", "Expand Fuel"),
				collapse: localizeOrFallback("SW5E.StarshipSheet.CoreFuelCollapse", "Collapse Fuel")
			}
		},
		advancedPower: (() => {
			const powerCtx = getStarshipAdvancedPowerContext(actor);
			const recovery = getStarshipPowerRecoverySummary(actor);
			return {
				...powerCtx,
				canRecover: recovery.canRecover,
				title: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerTitle", "Power Die Allocation"),
				panelAria: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerPanelAria", "Power die allocation"),
				dieLabel: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerDieLabel", "Power die"),
				currentLabel: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerCurrent", "Current"),
				maxLabel: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerMax", "Max"),
				spendLabel: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerSpend", "Roll"),
				spendTooltip: localizeOrFallback(
					"SW5E.StarshipSheet.AdvancedPowerSpendTooltip",
					"Spend 1 die from this pool and roll the ship power die"
				),
				recoverLabel: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerRecover", "Recover Power"),
				recoverTooltip: localizeOrFallback(
					"SW5E.StarshipSheet.AdvancedPowerRecoverTooltip",
					"Recover power dice using the equipped reactor formula, or manual recovery when no formula is available"
				),
				setupHint: localizeOrFallback(
					"SW5E.StarshipSheet.AdvancedPowerSetupHint",
					"Pool sizes and die type are setup fields — switch the sheet to Edit mode to change them. Roll spends dice during play."
				),
				recoveryNote: localizeOrFallback(
					"SW5E.StarshipSheet.AdvancedPowerRecoveryNote",
					"Recover Power refills pools using reactor recovery when available, otherwise manual recovery. Subsystem allocation follows legacy SW5e rules."
				),
				expandTooltip: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerExpand", "Expand Power Die Allocation"),
				collapseTooltip: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerCollapse", "Collapse Power Die Allocation"),
				dieOptions: STARSHIP_POWER_DIE_OPTIONS.map(value => ({
					value,
					selected: (powerCtx.die ?? "d8") === value
				}))
			};
		})()
	};
}

function formatPowerZones(legacySystem, pools) {
	const power = legacySystem.attributes?.power ?? {};
	const zones = [
		{ key: "central", label: "C", max: pools.power.cscap },
		{ key: "engines", label: "E", max: pools.power.sscap },
		{ key: "shields", label: "S", max: pools.power.sscap },
		{ key: "weapons", label: "W", max: pools.power.sscap }
	];
	return zones.map(({ key, label, max }) => {
		const current = Number.isFinite(Number(power[key]?.value)) ? Number(power[key].value) : 0;
		return `${label}:${current}/${max}`;
	}).join(" ");
}

function makeSidebarSummary(actor, { includeTier = false } = {}) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const pools = deriveStarshipPools(actor);

	const rows = [];
	if ( includeTier ) {
		rows.push({
			label: localizeOrFallback("SW5E.StarshipTier", "Tier"),
			value: (() => {
				const t = legacySystem.details?.tier ?? pools.tier;
				return Number.isFinite(Number(t)) ? `${t}` : "-";
			})(),
			note: null,
			sidebarTier: true,
			sidebarSize: false,
			sidebarShowValueOnly: false
		});
	}
	rows.push(
		{
			label: localizeOrFallback("SW5E.Size", "Size"),
			value: getSizeLabel(actor, legacySystem),
			note: formatHyperdrive(actor),
			sidebarTier: false,
			sidebarSize: true,
			sidebarShowValueOnly: false
		}
	);

	return rows.map(entry => ({
		...entry,
		sidebarShowValueOnly: Boolean(entry.sidebarShowValueOnly)
	}));
}

function getItemMeta(item, actor = null) {
	if ( item.flags?.sw5e?.legacyStarshipSize || item.flags?.sw5e?.starshipCharacter?.role === "classification" ) {
		return localizeOrFallback("SW5E.StarshipTier", "Size Profile");
	}

	if ( item.flags?.sw5e?.legacyStarshipMod || item.flags?.sw5e?.starshipCharacter?.role === "modification" ) {
		return item.system?.type?.subtype ?? "Modification";
	}

	if ( item.system?.type?.subtype ) return game.i18n.localize(item.system.type.subtype);
	const pack = getCompendiumPack(item);
	if ( actor && item.type === "weapon" ) {
		const routingMultiplier = getDerivedStarshipRuntime(actor).routing?.weaponsMultiplier ?? 1;
		if ( routingMultiplier === 2 ) return localizeOrFallback("SW5E.PowerRoutingWeaponsPositive", "Weapons deal double damage");
		if ( routingMultiplier === 0.5 ) return localizeOrFallback("SW5E.PowerRoutingWeaponsNegative", "Ship weapon damage is reduced by half");
	}
	return pack ? pack.replace(/-/g, " ") : "";
}

function getItemSystemData(item) {
	return item?.system ?? item?._source?.system ?? {};
}

function formatSheetNumber(value, maximumFractionDigits = 2) {
	const numeric = Number(value);
	if ( !Number.isFinite(numeric) ) return "";
	return game?.dnd5e?.utils?.formatNumber?.(numeric, {
		minimumFractionDigits: 0,
		maximumFractionDigits
	}) ?? String(numeric);
}

function getItemWeightLabel(item) {
	const weight = getItemSystemData(item)?.weight ?? {};
	const rawValue = typeof weight === "object" ? weight.value : weight;
	const value = Number(rawValue);
	if ( !Number.isFinite(value) ) return "";
	const units = typeof weight === "object" ? weight.units : "";
	return [formatSheetNumber(value), units].filter(Boolean).join(" ").trim();
}

function getItemPriceLabel(item) {
	const price = getItemSystemData(item)?.price ?? {};
	const rawValue = typeof price === "object" ? price.value : price;
	const value = Number(rawValue);
	if ( !Number.isFinite(value) ) return "";

	const denomKey = normalizeSwPriceDenomination(typeof price === "object" ? price.denomination : undefined, { fallbackToBase: false });
	const currencyConfig = CONFIG.DND5E.currencies?.[denomKey];
	const abbrKey = currencyConfig?.abbreviation;
	const abbr = abbrKey ? game.i18n.localize(abbrKey) : (typeof denomKey === "string" ? denomKey.toUpperCase() : "");
	return [formatSheetNumber(value), abbr].filter(Boolean).join(" ").trim();
}

function makeItemEntry(item, defaultTab = STOCK_CARGO_TAB_ID, actor = null, { sotgPanel = null } = {}) {
	return {
		id: item.id,
		name: item.name,
		meta: getItemMeta(item, actor),
		img: resolveStarshipSheetImageUrl(item.img),
		defaultTab,
		sotgPanel,
		weightLabel: getItemWeightLabel(item),
		priceLabel: getItemPriceLabel(item)
	};
}

function categorizeStarshipItems(actor) {
	const groups = {
		size: { label: localizeOrFallback("TYPES.Item.starshipsizePl", "Starship Size"), items: [], defaultTab: STARSHIP_FEATURES_TAB_ID, manageLabel: "Features", scrollTo: STARSHIP_FEATURES_TAB_ID, sotgPanel: null, showEconomy: false },
		actions: { label: localizeOrFallback("SW5E.Feature.StarshipAction.LabelPl", "Starship Actions"), items: [], defaultTab: STARSHIP_FEATURES_TAB_ID, manageLabel: "Features", scrollTo: STARSHIP_FEATURES_TAB_ID, sotgPanel: null, showEconomy: true },
		roles: { label: localizeOrFallback("SW5E.Feature.Deployment.Label", "Crew Roles"), items: [], defaultTab: STARSHIP_TAB_ID, manageLabel: "Core", scrollTo: STARSHIP_TAB_ID, sotgPanel: "overview", showEconomy: false },
		features: { label: localizeOrFallback("SW5E.Feature.Starship.Label", "Starship Features"), items: [], defaultTab: STARSHIP_FEATURES_TAB_ID, manageLabel: "Features", scrollTo: STARSHIP_FEATURES_TAB_ID, sotgPanel: null, showEconomy: false },
		equipment: { label: localizeOrFallback("SW5E.Equipment", "Equipment"), items: [], defaultTab: STOCK_CARGO_TAB_ID, manageLabel: "Inventory", scrollTo: STOCK_CARGO_TAB_ID, sotgPanel: null, showEconomy: true },
		modifications: { label: localizeOrFallback("TYPES.Item.starshipmodPl", "Modifications"), items: [], defaultTab: STOCK_CARGO_TAB_ID, manageLabel: "Inventory", scrollTo: STOCK_CARGO_TAB_ID, sotgPanel: null, showEconomy: true },
		weapons: { label: localizeOrFallback("SW5E.Weapon", "Weapons"), items: [], defaultTab: STOCK_CARGO_TAB_ID, manageLabel: "Inventory", scrollTo: STOCK_CARGO_TAB_ID, sotgPanel: null, showEconomy: true }
	};

	for ( const item of actor.items ) {
		const pack = getCompendiumPack(item);
		const featType = item.system?.type?.value;
		const role = item.flags?.sw5e?.starshipCharacter?.role;
		const isStarshipWeapon = pack === "starshipweapons" || item.type === "weapon";
		const isStarshipEquipment = pack === "starshiparmor" || pack === "starshipequipment";

		if ( item.flags?.sw5e?.legacyStarshipSize || role === "classification" ) groups.size.items.push(item);
		else if ( item.flags?.sw5e?.legacyStarshipMod || role === "modification" || pack === "starshipmodifications" ) groups.modifications.items.push(item);
		else if ( featType === "starshipAction" || pack === "starshipactions" ) groups.actions.items.push(item);
		else if ( featType === "deployment" || role === "deployment" || role === "venture" || pack === "deployments" || pack === "deploymentfeatures" || pack === "ventures" ) groups.roles.items.push(item);
		else if ( featType === "starship" || pack === "starshipfeatures" ) groups.features.items.push(item);
		else if ( isStarshipWeapon ) groups.weapons.items.push(item);
		else if ( isStarshipEquipment || item.type === "equipment" ) groups.equipment.items.push(item);
	}

	return groups;
}

function buildGroupContext(group) {
	const items = group.items
		.sort((left, right) => left.name.localeCompare(right.name))
		.map(item => makeItemEntry(item, group.defaultTab, group.actor, { sotgPanel: group.sotgPanel }));
	return {
		label: group.label,
		count: group.items.length,
		defaultTab: group.defaultTab,
		manageLabel: group.manageLabel,
		scrollTo: group.scrollTo,
		firstItemId: group.items[0]?.id ?? null,
		showEconomy: Boolean(group.showEconomy) && items.some(item => item.weightLabel || item.priceLabel),
		sotgPanel: group.sotgPanel,
		items
	};
}

function partitionStarshipGroups(actor) {
	const groups = categorizeStarshipItems(actor);
	for ( const group of Object.values(groups) ) group.actor = actor;
	const build = keys => keys.map(key => buildGroupContext(groups[key])).filter(group => group.items.length);
	return {
		/** Starship Actions — operational/tab visible as "Actions". */
		actionsGroups: build(["actions"]),
		weaponsGroups: build(["weapons"]),
		equipmentGroups: build(["equipment"]),
		modificationsGroups: build(["modifications"]),
		/** Size classification item(s) + passive Starship Features feats — tab "Systems" */
		systemsGroups: build(["size", "features"]),
		/** Deployments / crew roles — Core crew panel */
		crewRoleGroups: build(["roles"])
	};
}

function getLegacyNotes(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const runtime = getDerivedStarshipRuntime(actor);
	const notes = [];
	if ( legacySystem.attributes?.power?.routing ) notes.push(`Routing: ${legacySystem.attributes.power.routing}`);
	if ( legacySystem.attributes?.systemDamage ) notes.push(`System Damage ${legacySystem.attributes.systemDamage}`);
	if ( runtime.travel?.hyperdriveClass ) notes.push(`Hyperdrive Class ${runtime.travel.hyperdriveClass}`);
	if ( runtime.crew?.activeCrewName ) notes.push(`Active Crew: ${runtime.crew.activeCrewName}`);
	if ( runtime.movement?.enginesMultiplier === 2 ) notes.push(localizeOrFallback("SW5E.PowerRoutingEnginesPositive", "The ship's flying speed is doubled"));
	else if ( runtime.movement?.enginesMultiplier === 0.5 ) notes.push(localizeOrFallback("SW5E.PowerRoutingEnginesNegative", "The ship's flying speed is reduced by half"));
	return notes;
}

function makeHeaderBadges(actor) {
	const runtime = getDerivedStarshipRuntime(actor);
	const deployment = {
		...getDeploymentCounts(getLegacyStarshipActorSystem(actor)),
		...runtime.crew
	};
	return [
		getSizeLabel(actor, getLegacyStarshipActorSystem(actor)),
		`${deployment.crewCount ?? deployment.crew ?? 0} Crew`,
		`${deployment.passengerCount ?? deployment.passenger ?? 0} Passengers`
	];
}

function buildOverviewAbilitiesContext(actor, editable = false) {
	const configured = CONFIG?.DND5E?.abilities ?? CONFIG?.SW5E?.abilities ?? {};
	const liveAbilities = actor?.system?.abilities ?? {};
	const preferredOrder = STARSHIP_ABILITY_KEYS;
	const keys = preferredOrder.filter(key => key in configured)
		.concat(Object.keys(configured).filter(key => !preferredOrder.includes(key)));

	const buildEntry = key => {
		const cfg = configured[key] ?? {};
		const live = liveAbilities[key] ?? {};
		const liveValue = Number(live?.value);
		const sourceValue = getPersistedStarshipAbilityValue(actor, key);
		const value = Number.isFinite(liveValue) ? liveValue : sourceValue;
		const currentMod = Number(live?.mod);
		const mod = Number.isFinite(currentMod) ? currentMod : Math.floor((value - 10) / 2);
		const savePrepared = live?.save;
		let saveValue = Number(savePrepared?.value ?? savePrepared);
		if ( !Number.isFinite(saveValue) ) saveValue = mod;
		const proficient = Number.isFinite(Number(live?.proficient)) ? Number(live.proficient) : 0;
		const abbrKey = typeof cfg.abbreviation === "string" ? cfg.abbreviation : "";
		const abbrLocalized = abbrKey ? game.i18n.localize(abbrKey) : "";
		const abbrResolved = abbrKey.includes(".")
			? (abbrLocalized && abbrLocalized !== abbrKey ? abbrLocalized : key.toUpperCase())
			: (abbrKey || key.toUpperCase());
		const labelKey = typeof cfg.label === "string" ? cfg.label : "";
		const labelLocalized = labelKey ? game.i18n.localize(labelKey) : "";
		const labelResolved = labelKey.includes(".")
			? (labelLocalized && labelLocalized !== labelKey ? labelLocalized : key.toUpperCase())
			: (labelKey || key.toUpperCase());
		const configureLabel = game.i18n.format("DND5E.AbilityConfigure", { ability: labelResolved });
		const saveRollTitle = game.i18n.format("DND5E.SavePromptTitle", { ability: labelResolved });
		const saveRollTooltip = saveRollTitle && saveRollTitle !== "DND5E.SavePromptTitle"
			? `Roll ${saveRollTitle}`
			: `Roll ${labelResolved} Saving Throw`;
		return {
			key,
			abbr: abbrResolved,
			abbrLower: abbrResolved.toLowerCase(),
			label: labelResolved,
			value,
			mod,
			modSign: mod > 0 ? "+" : mod < 0 ? "-" : "",
			modAbs: Math.abs(mod),
			save: saveValue,
			sourceValue,
			proficient,
			icon: getStarshipProficiencyIcon(proficient),
			abilityIcon: typeof cfg.icon === "string" ? cfg.icon : `systems/dnd5e/icons/svg/abilities/${key}.svg`,
			configureLabel: configureLabel && configureLabel !== "DND5E.AbilityConfigure"
				? configureLabel
				: `Configure ${labelResolved}`,
			saveRollTooltip,
			proficientName: `system.abilities.${key}.proficient`,
			hover: getExpandedProficiencyHoverLabel(proficient),
			inputName: `system.abilities.${key}.value`,
			editable
		};
	};

	return keys.map(buildEntry);
}

function getStarshipSidebarShell(root, app = null) {
	return (app?.element instanceof HTMLElement ? app.element : null) ?? root;
}

function findStarshipSidebarPillsGroup(shell, labelText) {
	if ( !(shell instanceof HTMLElement) ) return null;
	const groups = shell.querySelectorAll(
		".sheet-sidebar .pills-group, [data-application-part='sidebar'] .pills-group, .sidebar .pills-group"
	);
	for ( const group of groups ) {
		const label = group.querySelector("h3 .roboto-upper");
		if ( label?.textContent?.trim() === labelText ) return group;
	}
	return null;
}

function buildStarshipSidebarMovementContext(actor, app = null) {
	const runtime = getDerivedStarshipRuntime(actor);
	const movement = runtime.movement ?? {};
	const units = movement.units ?? actor.system?.attributes?.movement?.units ?? "ft";
	const space = Number(movement.space);
	const turn = Number(movement.turn);
	return {
		movementAriaLabel: localizeOrFallback("SW5E.Movement", "Movement"),
		spaceSpeedLabel: localizeOrFallback("SW5E.SpeedSpace", "Space speed"),
		spaceSpeedDisplay: Number.isFinite(space) ? `${Math.round(space)} ${units}` : "—",
		turningSpeedLabel: localizeOrFallback("SW5E.TurnSpeed", "Turning speed"),
		turningSpeedDisplay: Number.isFinite(turn) ? `${Math.round(turn)} ${units}` : "—",
		travelSpeedLabel: localizeOrFallback("DND5E.TravelSpeed", "Travel Speed"),
		travelSpeedDisplay: formatStarshipSidebarTravelSpeed(actor),
		travelPaceLabel: localizeOrFallback("DND5E.TravelPace", "Travel Pace"),
		travelPaceDisplay: formatStarshipSidebarTravelPace(actor),
		showMovementConfig: isStarshipSheetEditMode(app) && app?.isEditable !== false && actor?.isOwner,
		movementConfigLabel: localizeOrFallback("SW5E.StarshipSheet.MovementConfigLabel", "Configure Starship Movement")
	};
}

async function renderStarshipSidebarMovement(root, actor, app = null) {
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return;

	suppressStockVehicleMovementSidebarForStarship(root, actor, app);
	ensureStarshipMovementConfigBlocked(root, app, actor);

	shell.querySelectorAll(".sw5e-starship-sidebar-movement").forEach(node => node.remove());

	const speedGroup = findStarshipSidebarPillsGroup(shell, "Speed");
	const sizeGroup = findStarshipSidebarPillsGroup(shell, "Size");
	const insertParent = speedGroup?.parentElement ?? sizeGroup?.parentElement;
	if ( !insertParent ) return;

	const ctx = buildStarshipSidebarMovementContext(actor, app);
	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sidebar-movement.hbs"),
		ctx
	);
	const mount = document.createElement("div");
	mount.innerHTML = rendered.trim();
	const movementBlock = mount.firstElementChild;
	if ( !(movementBlock instanceof HTMLElement) ) return;

	if ( sizeGroup?.parentElement === insertParent ) insertParent.insertBefore(movementBlock, sizeGroup);
	else if ( speedGroup?.parentElement === insertParent ) insertParent.insertBefore(movementBlock, speedGroup);
	else insertParent.prepend(movementBlock);

	bindStarshipSidebarMovementConfig(movementBlock, actor, app);
}

function getStarshipSidebarNameBlock(shell) {
	if ( !(shell instanceof HTMLElement) ) return null;
	return shell.querySelector(
		".sheet-sidebar > .name, [data-application-part='sidebar'] > .name, .sidebar > .name"
	);
}

function getStarshipSidebarVitalsMountPoint(root, app = null) {
	const shell = getStarshipSidebarShell(root, app);
	const nameBlock = getStarshipSidebarNameBlock(shell);
	if ( !(nameBlock instanceof HTMLElement) || !(nameBlock.parentElement instanceof HTMLElement) ) return null;

	return {
		parent: nameBlock.parentElement,
		reference: nameBlock,
		insertAfter: true
	};
}

async function buildStarshipSidebarVitalsRenderContext(actor, app = null) {
	const sheetEditMode = Boolean(isStarshipSheetEditMode(app) && app?.isEditable !== false);
	return {
		vitals: buildStarshipSidebarVitalsContext(actor),
		labels: buildStarshipSidebarSummaryLabels(),
		sheetEditMode,
		playMode: !sheetEditMode
	};
}

async function renderStarshipSidebarVitals(root, actor, app = null) {
	const shell = getStarshipSidebarShell(root, app);
	shell?.querySelectorAll(".sw5e-starship-sidebar-vitals").forEach(node => node.remove());

	const mountPoint = getStarshipSidebarVitalsMountPoint(root, app);
	if ( !mountPoint?.reference ) return;

	const ctx = await buildStarshipSidebarVitalsRenderContext(actor, app);
	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sidebar-vitals.hbs"),
		ctx
	);

	const wrapper = document.createElement("section");
	wrapper.className = "sw5e-starship-sidebar-vitals";
	wrapper.innerHTML = rendered;

	mountPoint.reference.insertAdjacentElement("afterend", wrapper);
	bindStarshipVitalsMeterControls(root, actor, app);
}

function getStarshipSystemDamageMountPoint(root, app = null) {
	const shell = getStarshipSidebarShell(root, app);
	const vitalsBlock = shell?.querySelector(".sw5e-starship-sidebar-vitals");
	const nameBlock = getStarshipSidebarNameBlock(shell);
	const reference = vitalsBlock ?? nameBlock;
	if ( !(reference instanceof HTMLElement) || !(reference.parentElement instanceof HTMLElement) ) return null;

	return {
		parent: reference.parentElement,
		reference,
		insertAfter: true
	};
}

async function renderStarshipSidebarSystemDamage(root, actor, app = null) {
	const shell = getStarshipSidebarShell(root, app);
	shell?.querySelectorAll(".sw5e-starship-sidebar-system-damage").forEach(node => node.remove());

	const mountPoint = getStarshipSystemDamageMountPoint(root, app);
	if ( !mountPoint?.reference ) return;

	const ctx = buildSystemDamageSidebarContext(actor, {
		editable: app?.isEditable !== false
	});
	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sidebar-system-damage.hbs"),
		ctx
	);

	const wrapper = document.createElement("section");
	wrapper.className = "sw5e-starship-sidebar-system-damage";
	if ( ctx.catastrophic ) wrapper.classList.add("sw5e-starship-sidebar-system-damage--catastrophic");
	wrapper.innerHTML = rendered;

	mountPoint.reference.insertAdjacentElement("afterend", wrapper);
}

function removeStarshipSidebarSummary(root) {
	if ( !(root instanceof HTMLElement) ) return;
	root.querySelectorAll(".sw5e-starship-sidebar-summary").forEach(node => node.remove());
}

function getStarshipDestructionTrayMountPoint(root, app = null) {
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return null;

	const systemDamageBlock = shell.querySelector(".sw5e-starship-sidebar-system-damage");
	const vitalsBlock = shell.querySelector(".sw5e-starship-sidebar-vitals");
	const nameBlock = getStarshipSidebarNameBlock(shell);
	const reference = systemDamageBlock ?? vitalsBlock ?? nameBlock;
	if ( !(reference instanceof HTMLElement) || !(reference.parentElement instanceof HTMLElement) ) return null;

	return {
		parent: reference.parentElement,
		reference,
		insertAfter: true
	};
}

async function renderStarshipSidebarDestructionSaves(root, actor, app = null) {
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return;

	shell.querySelectorAll(".sw5e-starship-destruction-tray").forEach(node => node.remove());

	const mountPoint = getStarshipDestructionTrayMountPoint(root, app);
	if ( !mountPoint?.parent || !(mountPoint.reference instanceof HTMLElement) ) return;

	const editMode = Boolean(isStarshipSheetEditMode(app) && app?.isEditable !== false);
	const ctx = buildDestructionSaveSidebarContext(actor, {
		open: app?._sw5eDestructionTrayOpen === true,
		editMode,
		editable: app?.isEditable !== false
	});

	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sidebar-destruction-saves.hbs"),
		ctx
	);
	const mount = document.createElement("div");
	mount.innerHTML = rendered.trim();
	const tray = mount.firstElementChild;
	if ( !(tray instanceof HTMLElement) ) return;

	mountPoint.reference.insertAdjacentElement(mountPoint.insertAfter ? "afterend" : "beforebegin", tray);

	syncDestructionTrayControlState(app, root);
}

function focusSheetItem(root, app, itemId, tabId = STOCK_CARGO_TAB_ID) {
	window.setTimeout(() => {
		const item = app?.actor?.items?.get(itemId);
		const resolvedTab = tabId || resolveStarshipItemPrimaryTab(item);
		const candidates = root.querySelectorAll(`[data-item-id="${itemId}"]`);
		const stockTarget = Array.from(candidates).find(node => !node.closest(".sw5e-starship-tab"));
		const target = stockTarget ?? Array.from(candidates).find(node => node.closest(".sw5e-starship-tab"));
		if ( !target ) return;

		if ( stockTarget ) {
			const panel = target.closest(".tab[data-group='primary']");
			if ( panel?.dataset.tab ) activateSheetTab(root, app, panel.dataset.tab);
			else if ( resolvedTab ) activateSheetTab(root, app, resolvedTab);
		} else {
			activateSheetTab(root, app, STARSHIP_TAB_ID);
			const sotgWrapper = target.closest(".sw5e-starship-tab");
			const sotgPanel = target.getAttribute("data-sotg-panel")
				?? target.closest("[data-sw5e-sotg-panel]")?.getAttribute("data-sw5e-sotg-panel")
				?? "overview";
			if ( sotgWrapper ) activateSotgSubTab(sotgWrapper, app, sotgPanel);
		}

		window.requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "center" }));
		target.classList.add("sw5e-starship-item-pulse");
		window.setTimeout(() => target.classList.remove("sw5e-starship-item-pulse"), 1800);
	}, 50);
}

async function useStarshipItem(item, actor = item?.actor, event) {
	if ( !item ) return;

	if ( isSw5eStarshipActor(actor) && isStarshipLauncherItem(item) ) {
		const utilityActivity = [...(item.system?.activities ?? [])].find(activity => activity?.type === "utility");
		if ( utilityActivity && hasTriggerActivityConfig(utilityActivity) ) {
			await utilityActivity.use({ event });
			return;
		}
		await fireStarshipLauncherThroughAmmoBridge(item, { event });
		return;
	}

	const methods = ["use", "roll", "displayCard", "toMessage"];
	for ( const method of methods ) {
		if ( typeof item?.[method] !== "function" ) continue;
		try {
			const result = await item[method]({ event });
			if ( result !== false ) return;
		} catch ( err ) {
			console.warn(`SW5E MODULE | Failed starship item action via ${method}.`, err);
		}
	}

	item.sheet?.render(true);
}

const _sw5eSotgItemParityWrappers = new WeakSet();

/**
 * dnd5e loads via `dnd5e.mjs`; individual `module/...` URLs are not served — use the global namespace.
 * @returns {any}
 */
function getDnd5eContextMenu5e() {
	return globalThis.dnd5e?.applications?.ContextMenu5e ?? null;
}

/** @returns {any} */
function getDnd5eItemSheet5e() {
	return globalThis.dnd5e?.applications?.item?.ItemSheet5e ?? null;
}

function getEventTargetElement(event) {
	const target = event?.target;
	if ( target instanceof Element ) return target;
	return target?.parentElement ?? null;
}

/**
 * Primary strip: EDIT → item sheet edit; PLAY → use/post (`useStarshipItem`).
 * Systems classification rows: no-op in PLAY (preserves prior gating).
 */
async function onStarshipSotgPrimaryItemAction(app, row, event) {
	const actor = app.actor ?? app.document;
	const id = row?.dataset?.itemId;
	const item = id ? actor?.items?.get(id) : null;
	if ( !item ) return;

	if ( isStarshipSheetEditMode(app) ) {
		const ItemSheet5e = getDnd5eItemSheet5e();
		if ( ItemSheet5e ) await item.sheet?.render(true, { mode: ItemSheet5e.MODES.EDIT });
		else await item.sheet?.render(true);
		return;
	}

	if ( row.closest(".sw5e-starship-systems-groups") ) return;

	await useStarshipItem(item, actor, event);
}

async function starshipSotgContextDispatch(app, targetEl, action) {
	const actor = app.actor ?? app.document;
	const itemId = targetEl.closest("[data-item-id]")?.dataset?.itemId;
	const item = itemId ? actor?.items?.get(itemId) : null;
	if ( !item ) return;

	const ItemSheet5e = getDnd5eItemSheet5e();
	switch ( action ) {
		case "view":
			if ( ItemSheet5e ) await item.sheet?.render(true, { mode: ItemSheet5e.MODES.PLAY });
			else await item.sheet?.render(true);
			return;
		case "edit":
			if ( ItemSheet5e ) await item.sheet?.render(true, { mode: ItemSheet5e.MODES.EDIT });
			else await item.sheet?.render(true);
			return;
		case "delete":
			await item.deleteDialog?.();
			return;
		case "duplicate":
			await item.clone?.({
				name: game.i18n.format("DOCUMENT.CopyOf", { name: item.name })
			}, { save: true, addSource: true });
			return;
		case "attune":
			await item.update?.({ "system.attuned": !item.system.attuned });
			return;
		case "equip":
			await item.update?.({ "system.equipped": !item.system.equipped });
			return;
		default:
			return;
	}
}

/**
 * @param {HTMLElement} element Row or descendant with data-item-id
 * @param {object} app
 */
function prepareStarshipSotgItemContextMenu(element, app) {
	const row = element.closest(".sw5e-starship-item-row--sotg[data-item-id]");
	const actor = app.actor ?? app.document;
	const item = row ? actor?.items?.get(row.dataset.itemId) : null;
	if ( !item ) return;

	const compendiumLocked = game.packs.get(item.pack)?.locked;
	const sheetOwnerEditable = app.isEditable !== false;
	const sheetEditMode = isStarshipSheetEditMode(app);

	const options = [{
		name: "DND5E.ItemView",
		icon: " ",
		callback: li => { void starshipSotgContextDispatch(app, li, "view"); }
	}, {
		name: "DND5E.ContextMenuActionEdit",
		icon: " ",
		condition: () => item.isOwner && !compendiumLocked && sheetOwnerEditable && sheetEditMode,
		callback: li => { void starshipSotgContextDispatch(app, li, "edit"); }
	}, {
		name: "DND5E.ContextMenuActionDuplicate",
		icon: " ",
		condition: () => item.canDuplicate && item.isOwner && !compendiumLocked,
		callback: li => { void starshipSotgContextDispatch(app, li, "duplicate"); }
	}, {
		name: "DND5E.ContextMenuActionDelete",
		icon: " ",
		condition: () => item.canDelete && item.isOwner && !compendiumLocked && sheetOwnerEditable && sheetEditMode,
		callback: li => { void starshipSotgContextDispatch(app, li, "delete"); }
	}, {
		name: "DND5E.DisplayCard",
		icon: " ",
		callback: () => item.displayCard?.()
	}, {
		name: localizeOrFallback("SW5E.StarshipSheet.SotgContextUseOrRoll", "Use or roll item"),
		icon: " ",
		condition: () => item.isOwner && (typeof item.use === "function" || typeof item.rollAttack === "function"),
		callback: () => { void useStarshipItem(item, actor); },
		group: "action"
	}];

	if ( actor && !actor.system?.isGroup ) {
		if ( "equipped" in item.system ) {
			options.push({
				name: `DND5E.ContextMenuAction${item.system.equipped ? "Unequip" : "Equip"}`,
				icon: " ",
				condition: () => item.isOwner && !compendiumLocked,
				callback: li => { void starshipSotgContextDispatch(app, li, "equip"); },
				group: "state"
			});
		}
		if ( item.system?.attunement ) {
			options.push({
				name: `DND5E.ContextMenuAction${item.system.attuned ? "Unattune" : "Attune"}`,
				icon: " ",
				condition: () => item.isOwner && !compendiumLocked,
				callback: li => { void starshipSotgContextDispatch(app, li, "attune"); },
				group: "state"
			});
		}
	}

	Hooks.callAll("dnd5e.getItemContextOptions", item, options);
	ui.context.menuItems = options;
}

/**
 * One-time wiring: dnd5e-style context menu, primary name-strip action, ⋮ trigger.
 * @param {HTMLElement} wrapper `.sw5e-starship-tab`
 * @param {object} app
 */
function ensureStarshipSotgItemRowInteractions(wrapper, app) {
	if ( !(wrapper instanceof HTMLElement) || _sw5eSotgItemParityWrappers.has(wrapper) ) return;
	_sw5eSotgItemParityWrappers.add(wrapper);

	const ContextMenu5e = getDnd5eContextMenu5e();
	if ( ContextMenu5e ) {
		new ContextMenu5e(wrapper, ".sw5e-starship-item-row--sotg[data-item-id]", [], {
			onOpen: el => prepareStarshipSotgItemContextMenu(el, app),
			jQuery: false
		});
	} else {
		console.warn("SW5E MODULE | dnd5e ContextMenu5e unavailable (is the dnd5e system loaded?).");
	}

	wrapper.addEventListener("click", event => {
		const t = getEventTargetElement(event);
		if ( !t ) return;
		if ( !t.closest(".sw5e-starship-item-row--sotg [data-context-menu]") ) return;
		const CM = getDnd5eContextMenu5e();
		if ( !CM ) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		CM.triggerEvent(event);
	}, { capture: true });

	wrapper.addEventListener("click", event => {
		const t = getEventTargetElement(event);
		if ( !t ) return;
		const nameCell = t.closest(".sw5e-starship-item-row--sotg .item-name.item-action");
		if ( !nameCell ) return;
		if ( t.closest(".item-controls") ) return;
		const row = nameCell.closest(".sw5e-starship-item-row--sotg[data-item-id]");
		if ( !row || !nameCell.contains(t) ) return;
		event.preventDefault();
		void onStarshipSotgPrimaryItemAction(app, row, event);
	});
}

function escapeHtml(str) {
	return String(str ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

async function openAddCrewDialog(actor) {
	const available = buildVehicleAvailableActors(actor);

	if ( !available.length ) {
		ui?.notifications?.info("No actors available to add. Create character or NPC actors in the Actors tab first.");
		return;
	}

	const rows = available.map(a => `
		<div class="sw5e-add-crew-entry${a.assignedElsewhere ? " sw5e-add-crew-elsewhere" : ""}">
			<img src="${escapeHtml(a.img || "icons/svg/mystery-man.svg")}" alt="${escapeHtml(a.name)}" />
			<div class="sw5e-add-crew-copy">
				<strong>${escapeHtml(a.name)}</strong>
				${a.assignedElsewhere ? `<span class="sw5e-add-crew-note">Aboard: ${escapeHtml(a.assignedShipName)}</span>` : ""}
			</div>
			<div class="sw5e-add-crew-roles">
				<button type="button" data-actor-uuid="${escapeHtml(a.uuid)}" data-deploy-role="pilot">Pilot</button>
				<button type="button" data-actor-uuid="${escapeHtml(a.uuid)}" data-deploy-role="crew">Crew</button>
				<button type="button" data-actor-uuid="${escapeHtml(a.uuid)}" data-deploy-role="passenger">Passenger</button>
			</div>
		</div>
	`).join("");

	const content = `<div class="sw5e-add-crew-dialog"><div class="sw5e-add-crew-list">${rows}</div></div>`;

	await foundry.applications.api.DialogV2.wait({
		window: { title: "Add Crew Member" },
		content,
		buttons: [{ action: "cancel", label: "Cancel", icon: "fas fa-times" }],
		rejectClose: false,
		render: (_event, dialog) => {
			dialog.element.querySelectorAll("[data-actor-uuid][data-deploy-role]").forEach(btn => {
				btn.addEventListener("click", async () => {
					btn.disabled = true;
					try {
						await deployStarshipCrew(actor, btn.dataset.actorUuid, btn.dataset.deployRole);
					} catch ( err ) {
						console.error("SW5E MODULE | Failed to add crew member.", err);
					}
					await dialog.close();
				});
			});
		}
	});
}

async function renderStarshipLayer(app, html, data) {
	const actor = data.actor ?? app.actor;
	if ( !isSw5eStarshipActor(actor) ) return;

	await ensureStarshipDefaultShowVehicleAbilities(actor);

	const root = getHtmlRoot(html);
	if ( !root ) return;
	try {
	const scrollSnap = readStarshipSheetScrollSnapshot(app);
	const pendingSidebarScroll = consumeStarshipPendingSidebarScroll(app);
	if ( pendingSidebarScroll !== null ) scrollSnap.sidebarScrollTop = pendingSidebarScroll;

	root.classList.add("sw5e-starship-sheet");
	if ( SW5E_STARSHIP_SHEET_DIAG_ENABLED ) root.dataset.sw5eStarshipDiagSheet = "1";

	ensureStarshipAbilitySaveTabModeSync(root, app);
	ensureStarshipTrustedSystemPathDelegate(root, app);
	ensureStarshipVitalsDelegate(root, app);
	ensureStarshipFuelActionsDelegate(root, app);
	ensureStarshipRepairDelegate(root, app);
	ensureStarshipLegacyRoutingDelegate(root, app);
	ensureStarshipAdvancedPowerDelegate(root, app);
	ensureStarshipCorePanelCollapseDelegate(root, app);
	ensureStarshipDestructionSaveDelegate(root, app);
	ensureStarshipSystemDamageDelegate(root, app);
	ensureStarshipOverviewAbilityMirrors(root, app, actor);
	ensureStarshipSheetSubmitDiagnostic(root, app, actor);

	await ensureWarningsDialog(root, app, actor);
	await renderStarshipSidebarVitals(root, actor, app);
	await renderStarshipSidebarSystemDamage(root, actor, app);
	await renderStarshipSidebarDestructionSaves(root, actor, app);
	removeStarshipSidebarSummary(root);
	await renderStarshipSidebarMovement(root, actor, app);
	applyStarshipSidebarChrome(root, actor, app);
	// Same task as sidebar mount: set scroll before the browser paints the new summary at 0 (async gap below would flash).
	applyStarshipSheetScrollPositions(app, {
		sidebarScrollTop: Number(scrollSnap.sidebarScrollTop) || 0,
		mainScrollTop: 0,
		sotgPanelScrollTop: 0
	});
	suppressStockVehicleHpMeterForStarship(root, actor, app);

	const { nav, panelParent, integrated } = ensureStarshipTabTargets(root);
	if ( !nav || !panelParent ) return;

	const migrateToFeaturesTab = app._sw5eSotgSubTab === "features"
		|| app._sw5eStarshipActiveTab === STARSHIP_FEATURES_TAB_ID;
	if ( app._sw5eSotgSubTab === "features" ) app._sw5eSotgSubTab = "overview";
	if ( app._sw5eStarshipActiveTab === STARSHIP_FEATURES_TAB_ID ) setStarshipActiveTab(app, null);

	if ( app._sw5eStarshipActiveTab === undefined ) {
		setStarshipActiveTab(app, STARSHIP_TAB_ID);

		nav.querySelectorAll("[data-tab]").forEach(item => {
			if ( !CUSTOM_STARSHIP_TAB_IDS.has(item.dataset.tab) ) {
				item.classList.remove("active");
			}
		});
	}

	const starshipViewState = captureStarshipSheetViewState(app, scrollSnap);
	if ( migrateToFeaturesTab ) starshipViewState.stockPrimary = STARSHIP_FEATURES_TAB_ID;

	const {
		crewRoleGroups
	} = partitionStarshipGroups(actor);
	const skills = enrichStarshipSkillsForSheet(actor);

	const withIntegrated = arr => arr.map(group => ({
		...group,
		supportsSheetNavigation: integrated && group.defaultTab !== null
	}));

	const sheetEditMode = isStarshipSheetEditMode(app);
	const actorEditable = app.isEditable !== false;
	const rendered = await foundry.applications.handlebars.renderTemplate(getModulePath("templates/starship-sheet-layer.hbs"), {
		actorName: actor.name,
		actorImage: resolveStarshipSheetImageUrl(actor.img),
		title: localizeOrFallback("TYPES.Actor.starshipPl", "Starship Systems"),
		subtitle: localizeOrFallback("TYPES.Actor.vehicle", "Vehicle Actor"),
		headerBadges: makeHeaderBadges(actor),
		summaryStrip: makeStarshipSummaryStrip(actor),
		legacyNotes: getLegacyNotes(actor),
		skills,
		crew: buildVehicleStarshipCrewContext(actor),
		editable: actorEditable,
		/** Systems subtab: setup fields (tier, hull, etc.) only in sheet EDIT mode; routing stays usable in PLAY when `actorEditable`. */
		systemsSetupEditable: sheetEditMode && actorEditable,
		systemsRoutingEditable: actorEditable,
		showPowerRouting: shouldShowStarshipPowerRouting(actor),
		legacyPowerRoutingEnabled: isLegacyPowerRoutingOverrideEnabled(actor),
		legacyPowerRoutingFlagPath: `flags.${SETTINGS_NAMESPACE}.${STARSHIP_LEGACY_POWER_ROUTING_FLAG}`,
		systemsCore: buildSystemsCoreContext(actor),
		crewRoleGroups: withIntegrated(crewRoleGroups),
		crewRolesKicker: localizeOrFallback("SW5E.Feature.Deployment.Label", "Deployments"),
		crewRolesTitle: localizeOrFallback("SW5E.StarshipSheet.CrewRolesTitle", "Crew roles"),
		crewRolesLede: localizeOrFallback(
			"SW5E.StarshipSheet.CrewRolesLede",
			"Deployment and venture features attached to this vessel."
		),
		overviewLandingKicker: localizeOrFallback("SW5E.StarshipSheet.OverviewKicker", "Overview"),
		overviewLandingTitle: localizeOrFallback("SW5E.StarshipSheet.OverviewTitle", "Starship at a glance"),
		overviewLandingLede: localizeOrFallback(
			"SW5E.StarshipSheet.OverviewLede",
			"Use this overview for starship skills and the tabs for crew, operations, equipment, modifications, and systems configuration. Live statistics remain in the sidebar."
		),
		overviewSkillsAriaLabel: localizeOrFallback("SW5E.StarshipSheet.OverviewSkillsAria", "Starship skills"),
		overviewSkillsKicker: localizeOrFallback("SW5E.StarshipSheet.OverviewSkillsKicker", "Skills"),
		overviewSkillsLede: localizeOrFallback(
			"SW5E.StarshipSheet.OverviewSkillsLede",
			"Roll a skill from the row. In edit mode, use the cog to adjust proficiency, ability, and check bonus (starship skills use a compact editor compatible with vehicle actors)."
		),
		overviewAbilitiesAriaLabel: localizeOrFallback("SW5E.StarshipSheet.OverviewAbilitiesAria", "Starship abilities"),
		overviewAbilitiesKicker: localizeOrFallback("SW5E.StarshipSheet.OverviewAbilitiesKicker", "Abilities"),
		overviewAbilitiesTitle: localizeOrFallback("SW5E.StarshipSheet.OverviewAbilitiesTitle", "Core ability scores"),
		overviewAbilitiesLede: localizeOrFallback(
			"SW5E.StarshipSheet.OverviewAbilitiesLede",
			"Core ship abilities shown in a compact score-card layout. In edit mode, adjust the base score directly here."
		),
		overviewAbilities: buildOverviewAbilitiesContext(actor, actorEditable),
		overviewAbilitySaveLabel: localizeOrFallback("SW5E.StarshipSheet.AbilitySaveLabel", "Save"),
		overviewPassiveHint: localizeOrFallback("DND5E.PassiveScore", "Passive score"),
		overviewSkillConfigureTitle: localizeOrFallback("SW5E.SkillConfigure", "Configure skill"),
		sotgSheetEditMode: sheetEditMode,
		sotgFindInSheetAria: localizeOrFallback("SW5E.StarshipSheet.FindInSheet", "Find on sheet"),
		sotgContextMenuAria: game.i18n.localize("DND5E.AdditionalControls")
	});

	// If our tab wrappers are already in the DOM, update their content in place.
	const existingWrapper = panelParent.querySelector(`.sw5e-starship-tab[data-tab="${STARSHIP_TAB_ID}"]`);
	if ( existingWrapper ) {
		existingWrapper.innerHTML = rendered;
		syncSotgSheetPhaseClasses(app, existingWrapper.querySelector(".sw5e-starship-panel"));
		ensureStarshipCorePanelCollapseDelegate(existingWrapper, app);
		ensureStarshipSotgItemRowInteractions(existingWrapper, app);
		scheduleStarshipAbilitySaveTabSync(root, app);
		if ( !nav.querySelector(`[data-tab="${STARSHIP_TAB_ID}"]`) ) {
			const tabButton = document.createElement("a");
			tabButton.className = "sw5e-starship-tab-button";
			tabButton.dataset.group = "primary";
			tabButton.dataset.tab = STARSHIP_TAB_ID;
			tabButton.innerHTML = `<span>${localizeOrFallback("SW5E.StarshipSheet.CoreTab", "Core")}</span>`;
			tabButton.addEventListener("click", event => { event.preventDefault(); activateSheetTab(root, app, STARSHIP_TAB_ID); });
			insertCustomTabButtons(nav, [tabButton]);
		}
		configureStarshipPrimaryTabLabels(nav);
		ensureStarshipFeaturesTabNav(root, app, nav);
		restoreStarshipSheetViewState(app, starshipViewState, root);
		if ( integrated ) attachIntegratedStockPrimaryTabBridge(app, root, nav);
		ensureStarshipCargoInventoryInteractions(root, app);
		ensureStarshipFeaturesInventoryInteractions(root, app);
		scheduleStarshipModificationsSectionHeader(root, actor);
	scheduleStarshipDuplicateSizeNeutralize(root, app, actor);
	scheduleStarshipAbilitySaveTabSync(root, app);
	queueMicrotask(() => runStarshipSheetDiagnostics(root, app, actor, "render:updateSotgLayer"));
		return;
	}

	// First render: clean up any leftover nodes, create wrappers, and wire up all listeners.
	root.querySelectorAll(".sw5e-starship-tab, .sw5e-starship-tab-button, .sw5e-starship-tab-host").forEach(node => node.remove());

	const tabButton = document.createElement("a");
	tabButton.className = "sw5e-starship-tab-button";
	tabButton.dataset.group = "primary";
	tabButton.dataset.tab = STARSHIP_TAB_ID;
	tabButton.innerHTML = `<span>${localizeOrFallback("SW5E.StarshipSheet.CoreTab", "Core")}</span>`;

	const wrapper = document.createElement("section");
	wrapper.className = "tab sw5e-starship-tab";
	wrapper.dataset.group = "primary";
	wrapper.dataset.tab = STARSHIP_TAB_ID;
	wrapper.innerHTML = rendered;
	syncSotgSheetPhaseClasses(app, wrapper.querySelector(".sw5e-starship-panel"));
	wrapper.hidden = getStarshipActiveTab(app) !== STARSHIP_TAB_ID;
	if ( getStarshipActiveTab(app) === STARSHIP_TAB_ID ) wrapper.classList.add("active");

	configureStarshipPrimaryTabLabels(nav);
	ensureStarshipFeaturesTabNav(root, app, nav);
	insertCustomTabButtons(nav, [tabButton]);
	panelParent.append(wrapper);

	tabButton.addEventListener("click", event => {
		event.preventDefault();
		activateSheetTab(root, app, STARSHIP_TAB_ID);
	});

	const handleTabClick = async event => {
		const target = getEventTargetElement(event);
		const sheetActor = app.actor ?? actor;
		const abilityStrip = target?.closest(".sw5e-starship-ability-strip");

		if ( abilityStrip ) {
			const abilityCog = target?.closest("[data-action=\"showConfiguration\"][data-config=\"ability\"]");
			if ( abilityCog ) {
				event.preventDefault();
				event.stopPropagation();
				const abilityKey = abilityCog.closest(".ability-score")?.dataset?.ability;
				await openStarshipAbilityConfiguration(sheetActor, abilityKey);
				return;
			}

			if ( target?.closest("proficiency-cycle") ) return;

			const abilitySave = target?.closest(".save-tab.saving-throw.rollable[data-action=\"roll\"][data-type=\"ability\"]");
			if ( abilitySave ) {
				event.preventDefault();
				event.stopPropagation();
				const abilityKey = abilitySave.closest(".ability-score")?.dataset?.ability;
				await rollStarshipAbilitySave(sheetActor, abilityKey, event);
				return;
			}

			const abilityRoll = target?.closest(".label.ability-check[data-action=\"roll\"][data-type=\"ability\"]");
			if ( abilityRoll ) {
				event.preventDefault();
				event.stopPropagation();
				const abilityKey = abilityRoll.closest(".ability-score")?.dataset?.ability
					?? abilityRoll.dataset.ability;
				await rollStarshipAbilityCheck(sheetActor, abilityKey, event);
				return;
			}
		}

		const actionNode = target?.closest("[data-sw5e-action]");
		if ( !actionNode ) return;

		event.preventDefault();
		event.stopPropagation();
		const action = actionNode.dataset.sw5eAction
			?? actionNode.getAttribute("data-sw5e-action");
		const itemId = actionNode.dataset.itemId ?? actionNode.getAttribute("data-item-id");
		const item = itemId ? sheetActor?.items?.get(itemId) : null;

		if ( action === "edit-item" ) {
			const ItemSheet5e = getDnd5eItemSheet5e();
			if ( ItemSheet5e ) await item?.sheet?.render(true, { mode: ItemSheet5e.MODES.EDIT });
			else await item?.sheet?.render(true);
			return;
		}

		if ( action === "delete-item" ) {
			if ( !item ) return;
			if ( typeof item.deleteDialog === "function" ) await item.deleteDialog();
			return;
		}

		if ( action === "focus-item" ) {
			const focusItem = actionNode.dataset.itemId ? sheetActor?.items?.get(actionNode.dataset.itemId) : null;
			const focusTab = actionNode.dataset.tab || resolveStarshipItemPrimaryTab(focusItem);
			focusSheetItem(root, app, actionNode.dataset.itemId, focusTab);
			return;
		}

		if ( action === "open-tab" ) {
			const firstItemId = actionNode.dataset.firstItemId;
			if ( firstItemId ) focusSheetItem(root, app, firstItemId);
			return;
		}

		if ( action === "roll-skill" ) {
			await rollStarshipSkill(sheetActor, actionNode.dataset.skillId, event, game.user);
			return;
		}

		if ( action === "roll-ability" ) {
			await rollStarshipAbilityCheck(sheetActor, actionNode.dataset.ability, event);
			return;
		}

		if ( action === "roll-save" ) {
			await rollStarshipAbilitySave(sheetActor, actionNode.dataset.ability, event);
			return;
		}

		if ( action === "configure-skill" ) {
			await openStarshipSkillConfiguration(sheetActor, actionNode.dataset.skillId);
		}
	};

	ensureStarshipSotgItemRowInteractions(wrapper, app);
	ensureStarshipCorePanelCollapseDelegate(wrapper, app);

	wrapper.addEventListener("click", handleTabClick, { capture: true });

	wrapper.addEventListener("click", event => {
		const ctl = event.target.closest("[data-sw5e-sotg-tab], [data-sw5e-sotg-goto]");
		if ( !ctl ) return;
		event.preventDefault();
		const id = ctl.getAttribute("data-sw5e-sotg-tab") || ctl.getAttribute("data-sw5e-sotg-goto");
		if ( !id ) return;
		activateSotgSubTab(wrapper, app, id);
	});

	wrapper.addEventListener("click", async event => {
		const btn = event.target.closest("[data-sw5e-crew-command]");
		if ( !btn ) return;
		event.preventDefault();
		if ( btn.disabled ) return;
		btn.disabled = true;
		try {
			const command = btn.dataset.sw5eCrewCommand;
			const uuid = btn.dataset.actorUuid;
			if ( command === "open-add-crew" ) { await openAddCrewDialog(actor); return; }
			else if ( command === "deploy" ) await deployStarshipCrew(actor, uuid, btn.dataset.deployRole);
			else if ( command === "remove" ) await undeployStarshipCrew(actor, uuid);
			else if ( command === "toggle-active" ) await toggleStarshipActiveCrew(actor, uuid);
			else if ( command === "set-pilot" ) await deployStarshipCrew(actor, uuid, "pilot");
			else if ( command === "undeploy-pilot" ) await undeployStarshipCrew(actor, uuid, ["pilot"]);
		} catch ( err ) {
			console.error("SW5E MODULE | Crew command failed.", err);
		} finally {
			btn.disabled = false;
		}
	});

	restoreStarshipSheetViewState(app, starshipViewState, root);
	if ( integrated ) attachIntegratedStockPrimaryTabBridge(app, root, nav);
	ensureStarshipCargoInventoryInteractions(root, app);
	ensureStarshipFeaturesInventoryInteractions(root, app);
	scheduleStarshipDuplicateSizeNeutralize(root, app, actor);
	scheduleStarshipAbilitySaveTabSync(root, app);
	queueMicrotask(() => runStarshipSheetDiagnostics(root, app, actor, "render:firstMountSotgLayer"));
	} finally {
		bindStarshipSheetImageFallbacks(root);
	}
}

export function patchStarshipSheet() {
	registerStarshipConditionStatusEffectHooks();
	registerStarshipTokenStatusHooks();
	registerStarshipEffectsContextWrapper();
	registerStarshipEffectsConditionPresentation();
	registerStarshipEffectsSlowedToggleGuard();
	registerStarshipFeaturesTabPart();
	registerStarshipTabsContextWrapper();
	registerStarshipVehicleSheetShowAbilitiesDefault();
	suppressNativeStarshipStationsAbilityAndFeatures();
	registerStarshipCargoInventoryWrappers();
	registerStarshipCargoItemCategoryHook();
	Hooks.on("renderActorSheetV2", renderStarshipLayer);
	Hooks.on("preUpdateActor", (doc, changed, opts, uid) => {
		logStarshipPreUpdateTraitsIncoming(doc, changed);
		logStarshipPreUpdateAbilities(doc, changed, "incoming");
	});
	Hooks.on("preUpdateActor", onPreUpdateActorStarshipTraitsSize);
	Hooks.on("preUpdateActor", onPreUpdateActorStarshipHpIntegers);
	Hooks.on("preUpdateActor", onPreUpdateActorStarshipAbilities);
	Hooks.on("preUpdateActor", (doc, changed, opts, uid) => {
		logStarshipPreUpdateTraitsAfterSanitize(doc, changed);
		logStarshipPreUpdateAbilities(doc, changed, "after sanitize");
	});
	Hooks.on("updateActor", (doc, changed) => {
		if ( !isSw5eStarshipActor(doc) ) return;
		const hull = foundry.utils.getProperty(changed, "system.attributes.hp.value");
		if ( hull !== 0 ) return;
		const sheet = doc.sheet;
		if ( sheet?.rendered ) sheet._sw5eDestructionTrayOpen = true;
	});
}
