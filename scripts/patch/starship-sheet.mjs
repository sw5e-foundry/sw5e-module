import { getModulePath, getModuleId, getModuleSettingValue } from "../module-support.mjs";
import { getCurrencyRegistry, normalizeSwPriceDenomination } from "../currencies.mjs";
import { getDerivedStarshipRuntime, getLegacyStarshipActorSystem, getStarshipSkillEntries, getStarshipSkillDisplayEntries, rollStarshipSkill, rollStarshipAbility, deriveStarshipPools } from "../starship-data.mjs";
import { buildVehicleStarshipCrewContext, buildVehicleAvailableActors, deployStarshipCrew, undeployStarshipCrew, toggleStarshipActiveCrew } from "../starship-character.mjs";
import { getStarshipSheetContext } from "../starship-sheet-context.mjs";

/**
 * dnd5e pack asset — used only for on-sheet display when art is missing or fails to load (not persisted to actors).
 * @see https://github.com/foundryvtt/dnd5e — `icons/svg/actors/vehicle.svg`
 */
const DND5E_VEHICLE_ACTOR_FALLBACK_PATH = "systems/dnd5e/icons/svg/actors/vehicle.svg";

let vehicleSheetPrepareContextWrapped = false;
let vehicleSheetPrepareStationsContextWrapped = false;

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
const STARSHIP_SHEET_V2_SETTING_KEY = "experimentalStarshipSheetV2";
/** @deprecated Primary tab; feature content now lives in SotG sub-tab `features`. Kept for one-time migration from saved UI state. */
const STARSHIP_FEATURES_TAB_ID = "sw5e-starship-features";
const STOCK_CARGO_TAB_ID = "inventory";
const STOCK_FEATURES_TAB_ID = "features";
const STOCK_STARSHIP_TAB_ORDER = [STOCK_CARGO_TAB_ID, "effects", "description"];
const CUSTOM_STARSHIP_TAB_IDS = new Set([STARSHIP_TAB_ID]);

const SOTG_SUB_TAB_IDS = new Set([
	"overview", "v2", "crew", "features", "weapons", "equipment", "modifications", "systems"
]);

/** Set `true` to enable verbose submit/mode diagnostics for starship vehicle sheets. */
const SW5E_STARSHIP_SHEET_DIAG_ENABLED = false;
const SW5E_STARSHIP_SHEET_DIAG_PREFIX = "SW5E MODULE | StarshipSheetDiag";
const STARSHIP_ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

function getSotgSubTab(app) {
	const v = app?._sw5eSotgSubTab;
	if ( v === "skills" ) return "overview";
	if ( SOTG_SUB_TAB_IDS.has(v) ) return v;
	return "overview";
}

function setSotgSubTab(app, tabId) {
	if ( !app ) return;
	app._sw5eSotgSubTab = tabId;
}

/**
 * SotG inner tabs (Overview / Crew / Features / Equipment / Modifications / Systems): show one panel, update nav, persist on the sheet app. Starship skills render on Overview.
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
 * Systems subtab: tier/size/hull/shields/fuel follow sheet EDIT mode; power routing follows actor edit permission (PLAY+EDIT).
 * Runs on each sync so PLAY/EDIT toggles work without a full SotG template re-render.
 */
function applySystemsSubtabControlState(app, starshipPanel) {
	if ( !(starshipPanel instanceof HTMLElement) ) return;
	const systemsBody = starshipPanel.querySelector("[data-application-part=\"sw5e-starship-sotg-systems\"]");
	if ( !systemsBody ) return;

	const setupEditable = isStarshipSheetEditMode(app) && app.isEditable !== false;
	const routingEditable = app.isEditable !== false;

	const setupControlIds = [
		"sw5e-systems-fuel-value",
		"sw5e-systems-fuel-cap",
		"sw5e-systems-fuel-cost"
	];

	for ( const id of setupControlIds ) {
		const el = systemsBody.querySelector(`#${id}`);
		if ( el instanceof HTMLInputElement || el instanceof HTMLSelectElement ) {
			el.disabled = !setupEditable;
			el.closest(".sw5e-starship-systems-field")?.classList.toggle("sw5e-starship-systems-field--locked", !setupEditable);
		}
	}

	const routing = systemsBody.querySelector("#sw5e-systems-routing");
	if ( routing instanceof HTMLSelectElement ) {
		routing.disabled = !routingEditable;
		routing.closest(".sw5e-starship-systems-field")?.classList.toggle("sw5e-starship-systems-field--locked", !routingEditable);
	}
}

function syncSotgSheetPhaseClasses(app, starshipPanel) {
	if ( !starshipPanel ) return;
	const isEditMode = isStarshipSheetEditMode(app);
	starshipPanel.classList.toggle("sw5e-starship-sotg--mode-edit", isEditMode);
	starshipPanel.classList.toggle("sw5e-starship-sotg--mode-play", !isEditMode);
	starshipPanel.classList.toggle("sw5e-starship-sotg--readonly", app.isEditable === false);
	applySystemsSubtabControlState(app, starshipPanel);
}

function activateSotgSubTab(wrapper, app, tabId) {
	if ( !wrapper ) return;
	let id = SOTG_SUB_TAB_IDS.has(tabId) ? tabId : "overview";
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

/**
 * Scroll container for the starship sidebar summary: prefer the inner element that actually scrolls
 * (dnd5e/AppV2 often nests overflow on a child of `[data-application-part="sidebar"]`).
 * @param {HTMLElement} shell
 * @returns {HTMLElement|null}
 */
function getStarshipSheetSidebarScrollHost(shell) {
	if ( !(shell instanceof HTMLElement) ) return null;
	const summary = shell.querySelector(".sw5e-starship-sidebar-summary");
	let el = summary?.parentElement ?? null;
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
		const summary = editTarget.closest(".sw5e-starship-sidebar-summary");
		if ( !summary || !shell.contains(summary) ) return null;
		let el = summary.parentElement;
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
 * Read sidebar / main scroll from the live sheet element. Call **before** `renderStarshipSidebarSummary`
 * replaces the sidebar so values reflect the user’s prior view.
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

		let canonical = form.querySelector(`[data-sw5e-overview-authoritative-ability="${key}"][name="${path}"]`);
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
		if ( el.classList.contains("sw5e-starship-sidebar-summary") ) return;
		if ( el.closest(".sw5e-starship-sidebar-summary") ) return;
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

/** Stock sheet may insert duplicates after paint — retry through the next frames + short delays. */
function scheduleStarshipDuplicateSizeNeutralize(root, app, actor) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const run = () => {
		neutralizeDuplicateNativeTraitsSizeControls(root, app, actor);
		neutralizeDuplicateNativeHpControls(root, app, actor);
		neutralizeDuplicateNativeAbilityControls(root, app, actor);
		neutralizeStockVehicleAbilityControls(root, actor, app);
		suppressStockVehicleHpMeterForStarship(root, actor, app);
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

/** Power routing keys persisted on `system.attributes.power.routing` (sidebar + Systems tab). */
const STARSHIP_ROUTING_KEYS = ["none", "central", "engines", "shields", "weapons"];

/**
 * Delegate-only sidebar quick-edit paths — controls must use `data-sw5e-system-path` and no `name=`
 * so they never participate in vehicle sheet form submit / mode-toggle serialization.
 */
const SIDEBAR_QUICK_EDIT_PATHS = new Set([
	"system.details.tier",
	"system.traits.size",
	"system.attributes.hp.value",
	"system.attributes.hp.max",
	"system.attributes.hp.temp",
	"system.attributes.hp.tempmax",
	"system.attributes.fuel.value",
	"system.attributes.power.routing"
]);

/** SoTG Systems subtab: `name=` controls sit inside the vehicle sheet form; persist on `change` via trusted update (see delegate). */
const STARSHIP_SYSTEMS_CORE_DIRECT_PATHS = new Set([
	"system.attributes.power.routing",
	"system.attributes.fuel.value",
	"system.attributes.fuel.fuelCap",
	"system.attributes.fuel.cost"
]);

/** Mirror target: dnd5e vehicle schema drops SW5e `attributes.fuel` / `attributes.power.routing` from persisted `system`. */
const STARSHIP_FUEL_POWER_LEGACY_FLAG_BASE = "flags.sw5e.legacyStarshipActor.system.attributes";

function shouldMirrorStarshipFuelPowerToLegacyFlag(systemPath) {
	return systemPath === "system.attributes.power.routing"
		|| systemPath === "system.attributes.fuel.value"
		|| systemPath === "system.attributes.fuel.fuelCap"
		|| systemPath === "system.attributes.fuel.cost";
}

function buildStarshipFuelPowerMirrorUpdate(systemPath, value) {
	const update = { [systemPath]: value };
	if ( systemPath === "system.attributes.power.routing" ) {
		update[`${STARSHIP_FUEL_POWER_LEGACY_FLAG_BASE}.power.routing`] = value;
	} else if ( systemPath.startsWith("system.attributes.fuel.") ) {
		const tail = systemPath.slice("system.attributes.fuel.".length);
		update[`${STARSHIP_FUEL_POWER_LEGACY_FLAG_BASE}.fuel.${tail}`] = value;
	}
	return update;
}

/** @returns {Promise<void>} */
async function persistStarshipFuelPowerSystemPath(act, systemPath, value) {
	const payload = shouldMirrorStarshipFuelPowerToLegacyFlag(systemPath) && isSw5eStarshipActor(act)
		? buildStarshipFuelPowerMirrorUpdate(systemPath, value)
		: { [systemPath]: value };
	await act.update(payload);
}

function coerceSidebarTier(actor, raw) {
	const prev = Number(actor?.system?.details?.tier);
	const fallback = Number.isFinite(prev) ? Math.max(0, Math.trunc(prev)) : 0;
	const trimmed = String(raw ?? "").trim();
	if ( trimmed === "" ) return fallback;
	const n = Number(trimmed);
	if ( !Number.isFinite(n) ) return fallback;
	return Math.max(0, Math.trunc(n));
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

function isValidSidebarTraitsSize(value) {
	return typeof value === "string"
		&& value !== ""
		&& Object.prototype.hasOwnProperty.call(CONFIG?.DND5E?.actorSizes ?? {}, value);
}

/**
 * Sidebar: `data-sw5e-system-path` + `actor.update` on change (no `name=`).
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

		const inSidebar = el.closest(".sw5e-starship-sidebar-summary");
		const inSystems = el.closest(".sw5e-starship-systems-core");
		const act = app?.actor;
		if ( !act ) return;

		if ( inSidebar ) {
			const path = el.getAttribute("data-sw5e-system-path");
			if ( !path || !SIDEBAR_QUICK_EDIT_PATHS.has(path) ) return;

			let value;
			if ( STARSHIP_INTEGER_HP_PATHS.has(path) ) {
				const coerced = coerceStarshipIntegerHpField(act, path, el.value);
				if ( coerced === null ) return;
				value = coerced;
			} else if ( path === "system.details.tier" ) {
				value = coerceSidebarTier(act, el.value);
			} else if ( path === "system.attributes.fuel.value" ) {
				value = coerceSidebarFuelValue(act, el.value);
			} else if ( path === "system.traits.size" ) {
				if ( !isValidSidebarTraitsSize(el.value) ) return;
				value = el.value;
			} else if ( path === "system.attributes.power.routing" ) {
				if ( !STARSHIP_ROUTING_KEYS.includes(el.value) ) return;
				value = el.value;
			} else {
				return;
			}

			try {
				stashStarshipPendingSidebarScroll(app, el);
				await persistStarshipFuelPowerSystemPath(act, path, value);
			} catch ( err ) {
				consumeStarshipPendingSidebarScroll(app);
				console.error("SW5E MODULE | Starship sidebar quick-edit update failed.", err);
			}
			return;
		}

		if ( inSystems && el.name && STARSHIP_SYSTEMS_CORE_DIRECT_PATHS.has(el.name) ) {
			const path = el.name;
			let value;
			if ( path === "system.attributes.power.routing" ) {
				if ( !STARSHIP_ROUTING_KEYS.includes(el.value) ) return;
				value = el.value;
			} else if ( path === "system.attributes.fuel.value" ) {
				value = coerceSidebarFuelValue(act, el.value);
			} else if ( path === "system.attributes.fuel.fuelCap" ) {
				value = coerceStarshipFuelCapOrCost(act, "fuelCap", el.value);
			} else if ( path === "system.attributes.fuel.cost" ) {
				value = coerceStarshipFuelCapOrCost(act, "cost", el.value);
			} else {
				return;
			}
			try {
				await persistStarshipFuelPowerSystemPath(act, path, value);
			} catch ( err ) {
				console.error("SW5E MODULE | Starship Systems subtab update failed.", err);
			}
			return;
		}

		if ( !inSystems || !el.name?.startsWith("system.") ) return;

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
		return (button.dataset.tab === STOCK_FEATURES_TAB_ID) || (getTabLabel(button) === "features");
	}) ?? null;
}

function hideStockFeaturesTab(root, app, nav) {
	const featuresButton = getStockFeaturesTabButton(nav);
	if ( !featuresButton ) return;
	const isActive = !getStarshipActiveTab(app) && featuresButton.classList.contains("active");
	featuresButton.classList.add("sw5e-starship-hidden-tab");
	featuresButton.hidden = true;
	featuresButton.setAttribute("aria-hidden", "true");
	if ( isActive ) activateSheetTab(root, app, STOCK_CARGO_TAB_ID);
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
	if ( app.tabGroups.primary !== STOCK_CARGO_TAB_ID ) return;
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

function isExperimentalStarshipSheetV2Enabled() {
	return Boolean(getModuleSettingValue(STARSHIP_SHEET_V2_SETTING_KEY, false));
}

function localizeLabelOrText(value, fallback = "") {
	if ( typeof value !== "string" || !value ) return fallback;
	const localized = game.i18n.localize(value);
	if ( localized && localized !== value ) return localized;
	return value || fallback;
}

function formatStarshipV2Value(value, fallback = null) {
	const empty = fallback ?? localizeOrFallback("SW5E.StarshipSheet.V2NoData", "—");
	if ( value === undefined || value === null || value === "" ) return empty;
	return String(value);
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

function buildStarshipSkillDisplayTooltip(entry) {
	const tierLabel = formatStarshipSkillTierOptionLabel(entry.proficiencyMode);
	const detail = entry.effectiveCrewPbLine ?? "";
	const localized = game.i18n.format("SW5E.Starship.SkillTier.DisplayTooltip", {
		tier: tierLabel,
		detail
	});
	if ( localized && localized !== "SW5E.Starship.SkillTier.DisplayTooltip" ) return localized;
	return detail ? `${tierLabel}. ${detail}` : tierLabel;
}

/**
 * Presentation fields for the Overview skills list (ability abbreviation, signed modifier, passive total).
 * Passive uses {@link CONFIG.DND5E.skillPassive} base (default 10) + prepared skill modifier, matching core 5e passive notation.
 */
function enrichStarshipSkillsForSheet(actor) {
	const passiveCfg = CONFIG?.DND5E?.skillPassive;
	const passiveBase = Number.isFinite(Number(passiveCfg?.base)) ? Number(passiveCfg.base) : 10;
	return getStarshipSkillDisplayEntries(actor, game.user).map(entry => {
		const abil = CONFIG?.DND5E?.abilities?.[entry.ability];
		let abilityAbbr = entry.ability?.toUpperCase?.() ?? "";
		if ( abil?.abbreviation ) {
			const loc = game.i18n.localize(abil.abbreviation);
			abilityAbbr = loc && loc !== abil.abbreviation ? loc : abilityAbbr;
		}
		const passiveTotal = passiveBase + Number(entry.effectiveTotal);
		const displayTooltip = buildStarshipSkillDisplayTooltip(entry);
		return {
			...entry,
			value: entry.proficiencyMode,
			baseValue: entry.proficiencyMode,
			icon: getStarshipProficiencyIcon(entry.proficiencyMode),
			proficiencyClass: getStarshipSkillProficiencyClass(entry.proficiencyMode),
			abilityAbbr,
			abbreviation: abilityAbbr,
			tierLabel: formatStarshipSkillTierOptionLabel(entry.proficiencyMode),
			displayTooltip,
			modDisplay: formatSignedSkillMod(entry.effectiveTotal),
			passiveDisplay: Number.isFinite(passiveTotal) ? String(passiveTotal) : ""
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

function buildV2SkillRollTooltip(entry) {
	const tierLabel = formatStarshipSkillTierOptionLabel(entry.proficiencyMode);
	const detail = entry.crewPbLine ?? "";
	const localized = game.i18n.format("SW5E.Starship.SkillTier.DisplayTooltip", {
		tier: tierLabel,
		detail
	});
	if ( localized && localized !== "SW5E.Starship.SkillTier.DisplayTooltip" ) return localized;
	return detail ? `${tierLabel}. ${detail}` : tierLabel;
}

function buildStarshipSheetV2ShellContext(starshipContext, options = {}) {
	if ( !starshipContext?.isStarship ) return null;
	const editable = options.editable === true;
	const noData = localizeOrFallback("SW5E.StarshipSheet.V2NoData", "—");
	const hull = starshipContext.resources?.hull ?? {};
	const shields = starshipContext.resources?.shields ?? {};
	const movement = starshipContext.movement?.tactical ?? {};
	const fuel = starshipContext.resources?.fuel ?? {};
	const power = starshipContext.resources?.power ?? {};
	const mods = starshipContext.resources?.mods ?? {};
	const warningCount = Array.isArray(starshipContext.warnings) ? starshipContext.warnings.length : 0;
	const crewWarningCodes = new Set(["missing-pilot-actor", "missing-active-actor", "active-not-on-roster"]);
	const crewWarnings = (starshipContext.warnings ?? []).filter(w => crewWarningCodes.has(w.code));

	const hullSummary = hull && (hull.current !== undefined || hull.max !== undefined)
		? `${formatStarshipV2Value(hull.current, "0")} / ${formatStarshipV2Value(hull.max, "0")}${hull.die ? ` (${hull.die})` : ""}`
		: `${formatStarshipV2Value(starshipContext.resources?.hp?.value, "0")} / ${formatStarshipV2Value(starshipContext.resources?.hp?.max, "0")}`;
	const shieldSummary = shields && (shields.current !== undefined || shields.max !== undefined)
		? `${formatStarshipV2Value(shields.current, "0")} / ${formatStarshipV2Value(shields.max, "0")}${shields.die ? ` (${shields.die})` : ""}`
		: `${formatStarshipV2Value(starshipContext.resources?.hp?.temp, "0")} / ${formatStarshipV2Value(starshipContext.resources?.hp?.tempmax, "0")}`;
	const fuelSummary = [fuel?.value, fuel?.max].some(v => v !== undefined && v !== null && v !== "")
		? `${formatStarshipV2Value(fuel?.value, "0")} / ${formatStarshipV2Value(fuel?.max, noData)}`
		: noData;
	const powerSummary = power?.pools
		? `${formatStarshipV2Value(power.pools.die, noData)}${power.pools.cscap !== undefined ? ` (CS ${power.pools.cscap}, SS ${power.pools.sscap})` : ""}`
		: noData;
	const routingSummary = power?.routing?.selected ?? power?.legacy?.routing ?? noData;
	const movementSummary = [
		movement?.fly !== undefined && movement?.fly !== null ? `${movement.fly} ${movement.units ?? "ft"}` : null,
		movement?.turn !== undefined && movement?.turn !== null ? `Turn ${movement.turn}` : null
	].filter(Boolean).join(" / ") || noData;
	const roleSummary = starshipContext.identity?.role || starshipContext.identity?.detailsType || noData;
	const warningSummary = warningCount
		? game.i18n.format("SW5E.StarshipSheet.V2WarningsCount", { count: warningCount })
		: localizeOrFallback("SW5E.StarshipSheet.V2NoWarnings", "No current context warnings.");

	return {
		kicker: localizeOrFallback("SW5E.StarshipSheet.V2Kicker", "Experimental"),
		title: localizeOrFallback("SW5E.StarshipSheet.V2Title", "Starship Sheet v2"),
		lede: localizeOrFallback(
			"SW5E.StarshipSheet.V2Lede",
			"Preview shell: roll starship skills from rows; use the cog in sheet Edit mode to configure tier, ability, and bonus (same dialog as Core)."
		),
		readOnlyBadge: localizeOrFallback("SW5E.StarshipSheet.V2ShellScopeBadge", "Skills: roll · configure"),
		editable,
		identity: {
			name: formatStarshipV2Value(starshipContext.identity?.name, noData),
			image: starshipContext.identity?.img || "",
			tier: formatStarshipV2Value(starshipContext.identity?.tier, noData),
			size: formatStarshipV2Value(starshipContext.identity?.size, noData),
			role: formatStarshipV2Value(roleSummary, noData)
		},
		warningCount,
		warningSummary,
		overviewTitle: localizeOrFallback("SW5E.StarshipSheet.V2OverviewTitle", "Overview"),
		overviewRows: [
			{ label: "Tier", value: formatStarshipV2Value(starshipContext.identity?.tier, noData) },
			{ label: "Size", value: formatStarshipV2Value(starshipContext.identity?.size, noData) },
			{ label: "Role", value: formatStarshipV2Value(roleSummary, noData) },
			{ label: "AC", value: formatStarshipV2Value(starshipContext.resources?.ac?.flat, noData) },
			{ label: "Hull", value: hullSummary },
			{ label: "Shields", value: shieldSummary },
			{ label: "Movement", value: movementSummary },
			{ label: localizeOrFallback("SW5E.StarshipSheet.V2WarningsTitle", "Warnings"), value: warningSummary }
		],
		crewTitle: localizeOrFallback("SW5E.StarshipSheet.V2CrewTitle", "Crew"),
		crewRows: [
			{ label: "Pilot", value: formatStarshipV2Value(starshipContext.crew?.pilot?.name, noData) },
			{ label: "Active crew", value: formatStarshipV2Value(starshipContext.crew?.active?.name, noData) },
			{ label: "Crew count", value: formatStarshipV2Value(starshipContext.crew?.counts?.crew, "0") },
			{ label: "Passenger count", value: formatStarshipV2Value(starshipContext.crew?.counts?.passengers, "0") },
			{ label: "Roster count", value: formatStarshipV2Value(starshipContext.crew?.counts?.roster, "0") }
		],
		crewWarnings,
		skillConfigureTitle: localizeOrFallback("SW5E.SkillConfigure", "Configure skill"),
		skillsTitle: localizeOrFallback("SW5E.StarshipSheet.V2SkillsTitle", "Skills"),
		skills: (starshipContext.skills?.entries ?? []).map(entry => {
			const rollTooltip = buildV2SkillRollTooltip(entry);
			return {
				id: entry.id,
				label: formatStarshipV2Value(entry.label, noData),
				ability: localizeLabelOrText(entry.abilityLabel, formatStarshipV2Value(entry.ability, noData)),
				tierLabel: formatStarshipSkillTierOptionLabel(entry.proficiencyMode),
				modifier: formatSignedSkillMod(entry.displayMod),
				passive: formatStarshipV2Value(entry.passive, noData),
				tierZero: Boolean(entry.tierZero),
				zeroTierBadge: localizeOrFallback("SW5E.StarshipSheet.V2ZeroTierBadge", "Tier 0"),
				title: entry.crewPbLine || formatStarshipSkillTierOptionLabel(entry.proficiencyMode),
				rollTooltip
			};
		}),
		systemsTitle: localizeOrFallback("SW5E.StarshipSheet.V2SystemsTitle", "Systems & resources"),
		systemRows: [
			{ label: "Hull", value: hullSummary },
			{ label: "Shields", value: shieldSummary },
			{ label: "Fuel", value: fuelSummary },
			{ label: "Power", value: powerSummary },
			{ label: "Routing", value: formatStarshipV2Value(routingSummary, noData) },
			{ label: "System damage", value: formatStarshipV2Value(starshipContext.resources?.systemDamage, noData) },
			{
				label: "Mod budget",
				value: mods && (mods.slotsUsed !== undefined || mods.slotMax !== undefined)
					? `${formatStarshipV2Value(mods.slotsUsed, "0")} / ${formatStarshipV2Value(mods.slotMax, noData)}`
					: noData
			}
		],
		warningsTitle: localizeOrFallback("SW5E.StarshipSheet.V2WarningsTitle", "Warnings"),
		warnings: (starshipContext.warnings ?? []).map(warning => ({
			code: warning.code ?? "",
			severity: warning.severity ?? "info",
			message: formatStarshipV2Value(warning.message, noData)
		})),
		noWarningsText: localizeOrFallback("SW5E.StarshipSheet.V2NoWarnings", "No current context warnings.")
	};
}

async function renderStarshipSheetV2Shell(actor, options = {}) {
	const context = getStarshipSheetContext(actor, { user: game.user });
	const shellContext = buildStarshipSheetV2ShellContext(context, options);
	if ( !shellContext ) return "";
	return foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sheet-v2-shell.hbs"),
		shellContext
	);
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
				const hiddenIds = getStarshipCargoHiddenItemIds(actor);
				if ( hiddenIds.size ) filterStarshipCargoContext(context, hiddenIds);
				return context;
			}
			if ( partId !== "stations" ) return context;

			context.options ??= {};
			context.options.showAbilities = false;
			context.features = null;
			return context;
		});
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

function getStarshipCargoHiddenItemIds(actor) {
	const groups = categorizeStarshipItems(actor);
	return new Set(["actions", "weapons", "equipment", "modifications"].flatMap(key => groups[key]?.items?.map(item => item.id) ?? []));
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

function onPreUpdateActorStarshipTraitsSize(document, changed, _options, _userId) {
	if ( !isSw5eStarshipActor(document) ) return;
	sanitizeStarshipTraitsSizeForUpdate(document, changed);
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

	const fly = Number.isFinite(Number(actor.system?.attributes?.movement?.fly))
		? Number(actor.system.attributes.movement.fly)
		: null;
	return {
		primary: fly != null ? `${fly} ${units}` : "-",
		secondary: ""
	};
}

function localizeTravelPace(pace) {
	const normalized = String(pace ?? "").trim().toLowerCase();
	if ( normalized === "fast" ) return localizeOrFallback("DND5E.TravelPaceFast", "Fast");
	if ( normalized === "slow" ) return localizeOrFallback("DND5E.TravelPaceSlow", "Slow");
	return localizeOrFallback("DND5E.TravelPaceNormal", "Normal");
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
			value: localizeOrFallback(`SW5E.PowerRouting.${routing}`, routing),
			note: pools.power.die ? `${pools.power.die} | ${formatPowerZones(legacySystem, pools)}` : formatPowerSummary(legacySystem)
		}
	];
}

/**
 * At-a-glance strip: same entries as the sidebar summary (hull, shields, tier, fuel, power, …),
 * plus the first four operational cards from makeOverviewCards (Movement, Travel Pace, Hyperdrive, Crew).
 * Fuel and Power Routing are not duplicated here — they come only from makeSidebarSummary.
 * Relies on makeOverviewCards maintaining [Movement, Travel, Hyperdrive, Crew, Fuel, Routing] order.
 */
function makeStarshipSummaryStrip(actor) {
	const operational = makeOverviewCards(actor);
	return [...makeSidebarSummary(actor), ...operational.slice(0, 4)];
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
	const tierRaw = legacySystem.details?.tier ?? pools.tier;
	const resolvedActorSize = resolveValidActorSizeKey(actor, legacySystem);

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
		routingOptions: STARSHIP_ROUTING_KEYS.map(value => ({
			value,
			label:
				value === "none"
					? localizeOrFallback("SW5E.PowerRoutingNone", "None")
					: localizeOrFallback(`SW5E.PowerRouting.${value}`, value),
			selected: routing === value
		})),
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
		fuelValue: Number.isFinite(Number(fuel.value)) ? Number(fuel.value) : 0,
		fuelCap: Number.isFinite(Number(fuel.fuelCap)) ? Number(fuel.fuelCap) : 0,
		fuelCost: Number.isFinite(Number(fuel.cost)) ? Number(fuel.cost) : 0,
		configSectionLede: localizeOrFallback(
			"SW5E.StarshipSheet.SystemsConfigSectionLede",
			"Tier, size, hull, shields, and dice pools are edited from the sidebar. Fuel fields below require sheet Edit mode."
		),
		sectionOperationsKicker: localizeOrFallback("SW5E.StarshipSheet.SystemsSectionOperationsKicker", "Operations"),
		powerRoutingHint: localizeOrFallback(
			"SW5E.StarshipSheet.PowerRoutingSystemsHint",
			"Chooses which subsystem receives boosted reactor output; other systems run at reduced capacity until you change routing."
		),
		sectionSupportingKicker: localizeOrFallback("SW5E.StarshipSheet.SystemsSectionSupportingKicker", "Power state & kinematics"),
		systemsLivePlayBadge: localizeOrFallback("SW5E.StarshipSheet.SystemsLivePlayBadge", "Usable in Play mode"),
		systemsSupportingSetupHint: localizeOrFallback(
			"SW5E.StarshipSheet.SystemsSupportingSetupHint",
			"Fuel and related fields are maintenance/setup — switch the sheet to Edit mode to change them."
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
			derived: localizeOrFallback("SW5E.Derived", "Derived")
		}
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

function makeSidebarSummary(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const runtime = getDerivedStarshipRuntime(actor);
	const pools = deriveStarshipPools(actor);
	const hp = getStarshipLiveVehicleHp(actor);
	const fuel = legacySystem.attributes?.fuel?.value;
	const routing = legacySystem.attributes?.power?.routing ?? "none";

	/** `sidebarTier` … `sidebarRouting` flags: which row may render sidebar quick-edit controls in EDIT mode (template + systemsCore). */
	return [
		{
			label: localizeOrFallback("SW5E.StarshipTier", "Tier"),
			value: (() => { const t = legacySystem.details?.tier ?? pools.tier; return Number.isFinite(Number(t)) ? `${t}` : "-"; })(),
			note: normalizeSourceLabel(legacySystem.details?.source),
			sidebarTier: true,
			sidebarSize: false,
			sidebarHull: false,
			sidebarShield: false,
			sidebarFuel: false,
			sidebarRouting: false
		},
		{
			label: localizeOrFallback("SW5E.Size", "Size"),
			value: getSizeLabel(actor, legacySystem),
			note: formatHyperdrive(actor),
			sidebarTier: false,
			sidebarSize: true,
			sidebarHull: false,
			sidebarShield: false,
			sidebarFuel: false,
			sidebarRouting: false
		},
		{
			label: localizeOrFallback("SW5E.HullPoints", "Hull Points"),
			value: formatPool(hp.value, hp.max),
			note: localizeOrFallback("SW5E.StarshipHullSummaryNote", "Main hull integrity"),
			sidebarTier: false,
			sidebarSize: false,
			sidebarHull: true,
			sidebarShield: false,
			sidebarFuel: false,
			sidebarRouting: false
		},
		{
			label: localizeOrFallback("SW5E.HullDice", "Hull Dice"),
			value: formatDicePool(pools.hull.current, pools.hull.max, pools.hull.die),
			note: null,
			sidebarTier: false,
			sidebarSize: false,
			sidebarHull: false,
			sidebarShield: false,
			sidebarFuel: false,
			sidebarRouting: false,
			sidebarDerivedRow: true
		},
		{
			label: localizeOrFallback("SW5E.ShieldPoints", "Shield Points"),
			value: formatPool(hp.temp, hp.tempmax),
			note: localizeOrFallback("SW5E.StarshipShieldSummaryNote", "Absorbs damage before hull"),
			sidebarTier: false,
			sidebarSize: false,
			sidebarHull: false,
			sidebarShield: true,
			sidebarFuel: false,
			sidebarRouting: false
		},
		{
			label: localizeOrFallback("SW5E.ShieldDice", "Shield Dice"),
			value: formatDicePool(pools.shld.current, pools.shld.max, pools.shld.die),
			note: null,
			sidebarTier: false,
			sidebarSize: false,
			sidebarHull: false,
			sidebarShield: false,
			sidebarFuel: false,
			sidebarRouting: false,
			sidebarDerivedRow: true
		},
		{
			label: localizeOrFallback("SW5E.Fuel", "Fuel"),
			value: Number.isFinite(Number(fuel)) ? `${fuel}` : "-",
			note: `${localizeOrFallback("DND5E.TravelPace", "Travel Pace")}: ${localizeTravelPace(runtime.travel?.pace)}`,
			sidebarTier: false,
			sidebarSize: false,
			sidebarHull: false,
			sidebarShield: false,
			sidebarFuel: true,
			sidebarRouting: false
		},
		{
			label: localizeOrFallback("SW5E.PowerRouting", "Power Routing"),
			value: localizeOrFallback(`SW5E.PowerRouting.${routing}`, routing),
			note: pools.power.die ? `${pools.power.die} | ${formatPowerZones(legacySystem, pools)}` : formatPowerSummary(legacySystem),
			sidebarTier: false,
			sidebarSize: false,
			sidebarHull: false,
			sidebarShield: false,
			sidebarFuel: false,
			sidebarRouting: true
		},
		{
			label: localizeOrFallback("SW5E.ModSlots", "Mod Slots"),
			value: `${pools.mods.slotsUsed}/${pools.mods.slotMax}`,
			note: `${pools.mods.suitesUsed}/${pools.mods.suiteMax} suites`,
			sidebarTier: false,
			sidebarSize: false,
			sidebarHull: false,
			sidebarShield: false,
			sidebarFuel: false,
			sidebarRouting: false
		}
	].map(entry => ({
		...entry,
		sidebarDerivedRow: Boolean(entry.sidebarDerivedRow),
		sidebarShowValueOnly: !(
			entry.sidebarTier
			|| entry.sidebarSize
			|| entry.sidebarHull
			|| entry.sidebarShield
			|| entry.sidebarFuel
			|| entry.sidebarRouting
		)
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

	const registry = getCurrencyRegistry();
	const denomKey = normalizeSwPriceDenomination(typeof price === "object" ? price.denomination : undefined, { fallbackToBase: false });
	const abbrKey = registry?.[denomKey]?.abbreviation;
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
		size: { label: localizeOrFallback("TYPES.Item.starshipsizePl", "Starship Size"), items: [], defaultTab: STOCK_CARGO_TAB_ID, manageLabel: "Cargo", scrollTo: "inventory", sotgPanel: "systems", showEconomy: false },
		actions: { label: localizeOrFallback("SW5E.Feature.StarshipAction.Label", "Starship Actions"), items: [], defaultTab: null, manageLabel: "SotG", scrollTo: "features", sotgPanel: "features", showEconomy: true },
		roles: { label: localizeOrFallback("SW5E.Feature.Deployment.Label", "Crew Roles"), items: [], defaultTab: STOCK_CARGO_TAB_ID, manageLabel: "Cargo", scrollTo: "inventory", sotgPanel: "crew", showEconomy: false },
		features: { label: localizeOrFallback("SW5E.Feature.Starship.Label", "Starship Features"), items: [], defaultTab: STOCK_CARGO_TAB_ID, manageLabel: "Cargo", scrollTo: "inventory", sotgPanel: "systems", showEconomy: false },
		equipment: { label: localizeOrFallback("SW5E.Equipment", "Equipment"), items: [], defaultTab: null, manageLabel: "SotG", scrollTo: "equipment", sotgPanel: "equipment", showEconomy: true },
		modifications: { label: localizeOrFallback("TYPES.Item.starshipmodPl", "Modifications"), items: [], defaultTab: null, manageLabel: "SotG", scrollTo: "modifications", sotgPanel: "modifications", showEconomy: true },
		weapons: { label: localizeOrFallback("SW5E.Weapon", "Weapons"), items: [], defaultTab: null, manageLabel: "SotG", scrollTo: "weapons", sotgPanel: "weapons", showEconomy: true }
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
		/** Deployments / crew roles — Crew tab */
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
		const saveValue = Number(live?.save);
		const proficient = Number.isFinite(Number(live?.proficient)) ? Number(live.proficient) : 0;
		const abbrKey = typeof cfg.abbreviation === "string" ? cfg.abbreviation : "";
		const abbr = abbrKey ? game.i18n.localize(abbrKey) : key.toUpperCase();
		const labelKey = typeof cfg.label === "string" ? cfg.label : "";
		const label = labelKey ? game.i18n.localize(labelKey) : key.toUpperCase();
		return {
			key,
			abbr: abbr && abbr !== abbrKey ? abbr : key.toUpperCase(),
			label: label && label !== labelKey ? label : key.toUpperCase(),
			value,
			mod,
			save: Number.isFinite(saveValue) ? saveValue : mod,
			sourceValue,
			proficient,
			icon: getStarshipProficiencyIcon(proficient),
			hover: (CONFIG?.SW5E?.proficiencyLevels ?? CONFIG?.DND5E?.proficiencyLevels ?? {})?.[proficient]?.label ?? "",
			inputName: `system.abilities.${key}.value`,
			editable
		};
	};

	return keys.map(buildEntry);
}

function getStarshipSidebarMountPoint(root) {
	const sidebarContainers = [
		root.querySelector(".sidebar .stats"),
		root.querySelector("[data-application-part='sidebar'] .stats"),
		root.querySelector(".sheet-sidebar .stats"),
		root.querySelector(".sidebar"),
		root.querySelector("[data-application-part='sidebar']"),
		root.querySelector(".sheet-sidebar")
	].filter(Boolean);

	if ( sidebarContainers.length ) {
		return {
			container: sidebarContainers[0],
			reference: null,
			insertAfter: false,
			append: true
		};
	}

	return null;
}

async function renderStarshipSidebarSummary(root, actor, app = null) {
	root.querySelectorAll(".sw5e-starship-sidebar-summary").forEach(node => node.remove());

	const mountPoint = getStarshipSidebarMountPoint(root);
	if ( !mountPoint?.container ) return;

	const sidebarQuickEdit = Boolean(isStarshipSheetEditMode(app) && app?.isEditable !== false);
	const systemsCore = buildSystemsCoreContext(actor);

	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sidebar-summary.hbs"),
		{
			entries: makeSidebarSummary(actor),
			systemsCore,
			sidebarQuickEdit,
			editable: app?.isEditable !== false
		}
	);

	const wrapper = document.createElement("section");
	wrapper.className = "meter-group sw5e-starship-sidebar-summary";
	wrapper.classList.toggle("sw5e-starship-sidebar-summary--quick-edit", sidebarQuickEdit);
	wrapper.innerHTML = rendered;

	const { container, reference, insertAfter, append } = mountPoint;
	if ( reference?.parentElement === container ) {
		reference.insertAdjacentElement(insertAfter ? "afterend" : "beforebegin", wrapper);
		return;
	}

	if ( append ) container.append(wrapper);
	else container.prepend(wrapper);
}

function focusSheetItem(root, app, itemId, tabId = STOCK_CARGO_TAB_ID) {
	window.setTimeout(() => {
		const candidates = root.querySelectorAll(`[data-item-id="${itemId}"]`);
		const stockTarget = Array.from(candidates).find(node => !node.closest(".sw5e-starship-tab"));
		const target = stockTarget ?? Array.from(candidates).find(node => node.closest(".sw5e-starship-tab"));
		if ( !target ) return;

		if ( stockTarget ) {
			// Only switch tabs if the item is inside a named tab panel; non-tab sections (e.g. stations sidebar) are always visible.
			const panel = target.closest(".tab[data-group='primary']");
			if ( panel?.dataset.tab ) activateSheetTab(root, app, panel.dataset.tab);
		} else {
			activateSheetTab(root, app, STARSHIP_TAB_ID);
			const sotgWrapper = target.closest(".sw5e-starship-tab");
			const sotgPanel = target.getAttribute("data-sotg-panel")
				?? target.closest("[data-sw5e-sotg-panel]")?.getAttribute("data-sw5e-sotg-panel")
				?? "overview";
			if ( sotgWrapper ) activateSotgSubTab(sotgWrapper, app, sotgPanel);
		}

		// Defer scroll to next frame so the tab panel is visible (display:none → display:block) before scrollIntoView runs.
		window.requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "center" }));
		target.classList.add("sw5e-starship-item-pulse");
		window.setTimeout(() => target.classList.remove("sw5e-starship-item-pulse"), 1800);
	}, 50);
}

function isStarshipWeaponItem(item) {
	if ( item?.type !== "weapon" ) return false;
	const typeValue = item.system?.type?.value ?? "";
	return /starship/i.test(typeValue) || getCompendiumPack(item) === "starshipweapons";
}

function getStarshipWeaponRollData(actor, item) {
	const rollData = foundry.utils.deepClone(actor?.getRollData?.() ?? {});
	if ( !item?.system?.ability && isStarshipWeaponItem(item) ) {
		const wisdomMod = Number.isFinite(Number(actor?.system?.abilities?.wis?.mod))
			? Number(actor.system.abilities.wis.mod)
			: 0;
		rollData.mod = wisdomMod;
	}
	return rollData;
}

async function rollStarshipWeaponDamage(item, actor, multiplier = 1) {
	const damageParts = Array.isArray(item?.system?.damage?.parts) ? item.system.damage.parts : [];
	if ( !damageParts.length ) {
		if ( typeof item?.use === "function" ) await item.use();
		return;
	}

	const rollData = getStarshipWeaponRollData(actor, item);
	const formula = damageParts
		.map(([part]) => {
			if ( multiplier === 2 ) return `(${part}) * 2`;
			if ( multiplier === 0.5 ) return `floor((${part}) / 2)`;
			return part;
		})
		.join(" + ");
	const damageTypes = damageParts.map(([, type]) => type).filter(Boolean);
	const roll = new CONFIG.Dice.DamageRoll(formula, rollData, {});
	await roll.evaluate();
	const routingNote = multiplier === 2
		? localizeOrFallback("SW5E.PowerRoutingWeaponsPositive", "Weapons deal double damage")
		: multiplier === 0.5
			? localizeOrFallback("SW5E.PowerRoutingWeaponsNegative", "Ship weapon damage is reduced by half")
			: "";
	const typeLabel = damageTypes
		.map(type => CONFIG.DND5E?.damageTypes?.[type]?.label ?? CONFIG.DND5E?.damageTypes?.[type] ?? type)
		.join(", ");
	await roll.toMessage({
		speaker: ChatMessage.getSpeaker({ actor }),
		flavor: [item.name, typeLabel ? `(${typeLabel})` : "", routingNote].filter(Boolean).join(" ")
	});
}

async function useStarshipItem(item, actor = item?.actor) {
	if ( !item ) return;
	if ( actor && isStarshipWeaponItem(item) ) {
		const weaponRouting = getDerivedStarshipRuntime(actor).routing?.weaponsMultiplier ?? 1;
		if ( weaponRouting !== 1 ) {
			if ( typeof item.rollAttack === "function" ) {
				try {
					await item.rollAttack();
				} catch ( err ) {
					console.warn("SW5E MODULE | Failed starship weapon attack roll.", err);
				}
			}
			await rollStarshipWeaponDamage(item, actor, weaponRouting);
			return;
		}
	}

	const methods = ["use", "roll", "displayCard", "toMessage"];
	for ( const method of methods ) {
		if ( typeof item?.[method] !== "function" ) continue;
		try {
			const result = await item[method]();
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
async function onStarshipSotgPrimaryItemAction(app, row) {
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

	await useStarshipItem(item, actor);
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
		void onStarshipSotgPrimaryItemAction(app, row);
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
	const starshipSheetV2Enabled = isExperimentalStarshipSheetV2Enabled();

	if ( !starshipSheetV2Enabled ) await ensureStarshipDefaultShowVehicleAbilities(actor);

	const root = getHtmlRoot(html);
	if ( !root ) return;
	try {
	const scrollSnap = readStarshipSheetScrollSnapshot(app);
	const pendingSidebarScroll = consumeStarshipPendingSidebarScroll(app);
	if ( pendingSidebarScroll !== null ) scrollSnap.sidebarScrollTop = pendingSidebarScroll;

	root.classList.add("sw5e-starship-sheet");
	if ( SW5E_STARSHIP_SHEET_DIAG_ENABLED ) root.dataset.sw5eStarshipDiagSheet = "1";

	ensureStarshipTrustedSystemPathDelegate(root, app);
	ensureStarshipOverviewAbilityMirrors(root, app, actor);
	ensureStarshipSheetSubmitDiagnostic(root, app, actor);

	await ensureWarningsDialog(root, app, actor);
	await renderStarshipSidebarSummary(root, actor, app);
	// Same task as sidebar mount: set scroll before the browser paints the new summary at 0 (async gap below would flash).
	applyStarshipSheetScrollPositions(app, {
		sidebarScrollTop: Number(scrollSnap.sidebarScrollTop) || 0,
		mainScrollTop: 0,
		sotgPanelScrollTop: 0
	});
	suppressStockVehicleHpMeterForStarship(root, actor, app);

	const { nav, panelParent, integrated } = ensureStarshipTabTargets(root);
	if ( !nav || !panelParent ) return;
// Legacy: standalone primary "SotG Features" tab — fold into SotG > Features sub-tab
// Must run before default tab init.
if (app._sw5eStarshipActiveTab === STARSHIP_FEATURES_TAB_ID) {
    setStarshipActiveTab(app, STARSHIP_TAB_ID);
    app._sw5eSotgSubTab = "features";
}

if (app._sw5eStarshipActiveTab === undefined) {
    setStarshipActiveTab(app, STARSHIP_TAB_ID);

    // Remove active class from stock tab buttons
    // (but don't hide panels - dnd5e manages that)
    nav.querySelectorAll("[data-tab]").forEach(item => {
        if (!CUSTOM_STARSHIP_TAB_IDS.has(item.dataset.tab)) {
            item.classList.remove("active");
        }
    });
}

	const starshipViewState = captureStarshipSheetViewState(app, scrollSnap);

	const {
		actionsGroups,
		weaponsGroups,
		equipmentGroups,
		modificationsGroups,
		systemsGroups,
		crewRoleGroups
	} = partitionStarshipGroups(actor);
	const skills = enrichStarshipSkillsForSheet(actor);

	const withIntegrated = arr => arr.map(group => ({
		...group,
		supportsSheetNavigation: integrated && group.defaultTab !== null
	}));

	const sotgItemTabs = [
		{
			panel: "features",
			ariaLabelledBy: "sw5e-sotg-tab-features",
			bodyClasses: "sw5e-starship-sotg-features-body sw5e-starship-panel-features",
			dataAppPart: "sw5e-starship-sotg-features",
			kicker: localizeOrFallback("SW5E.StarshipSheet.OperationsKicker", "Operations"),
			title: localizeOrFallback("SW5E.Feature.StarshipAction.Label", "Starship Actions"),
			lede: localizeOrFallback(
				"SW5E.StarshipSheet.FeaturesTabLede",
				"Ship combat actions and operational maneuvers. Open an item for full details or use edit mode to manage them here."
			),
			groups: withIntegrated(actionsGroups),
			emptyMessage: localizeOrFallback(
				"SW5E.StarshipSheet.NoActionsWeapons",
				"No starship actions are assigned to this vessel."
			)
		},
		{
			panel: "weapons",
			ariaLabelledBy: "sw5e-sotg-tab-weapons",
			bodyClasses: "sw5e-starship-sotg-weapons-body",
			dataAppPart: "sw5e-starship-sotg-weapons",
			kicker: localizeOrFallback("SW5E.Weapon", "Weapons"),
			title: localizeOrFallback("SW5E.Weapon", "Weapons"),
			lede: localizeOrFallback(
				"SW5E.StarshipSheet.WeaponsTabLede",
				"Mounted weapon systems and turret hardpoints assigned to this vessel."
			),
			groups: withIntegrated(weaponsGroups),
			emptyMessage: localizeOrFallback(
				"SW5E.StarshipSheet.NoWeapons",
				"No starship weapons are assigned to this vessel."
			)
		},
		{
			panel: "equipment",
			ariaLabelledBy: "sw5e-sotg-tab-equipment",
			bodyClasses: "sw5e-starship-sotg-equipment-body",
			dataAppPart: "sw5e-starship-sotg-equipment",
			kicker: localizeOrFallback("SW5E.Equipment", "Equipment"),
			title: localizeOrFallback("SW5E.Equipment", "Equipment"),
			lede: localizeOrFallback(
				"SW5E.StarshipSheet.EquipmentTabLede",
				"Armor, kits, and other equipment carried by the ship."
			),
			groups: withIntegrated(equipmentGroups),
			emptyMessage: localizeOrFallback(
				"SW5E.StarshipSheet.NoEquipment",
				"No starship equipment items on this vessel."
			)
		},
		{
			panel: "modifications",
			ariaLabelledBy: "sw5e-sotg-tab-modifications",
			bodyClasses: "sw5e-starship-sotg-modifications-body",
			dataAppPart: "sw5e-starship-sotg-modifications",
			kicker: localizeOrFallback("TYPES.Item.starshipmodPl", "Modifications"),
			title: localizeOrFallback("TYPES.Item.starshipmodPl", "Modifications"),
			lede: localizeOrFallback(
				"SW5E.StarshipSheet.ModificationsTabLede",
				"Installed modifications and similar systems."
			),
			groups: withIntegrated(modificationsGroups),
			emptyMessage: localizeOrFallback(
				"SW5E.StarshipSheet.NoModifications",
				"No modifications on this vessel."
			)
		}
	];

	const sheetEditMode = isStarshipSheetEditMode(app);
	const actorEditable = app.isEditable !== false;
	const starshipSheetV2Shell = starshipSheetV2Enabled
		? await renderStarshipSheetV2Shell(actor, { editable: actorEditable })
		: "";
	const rendered = await foundry.applications.handlebars.renderTemplate(getModulePath("templates/starship-sheet-layer.hbs"), {
		actorName: actor.name,
		actorImage: resolveStarshipSheetImageUrl(actor.img),
		title: localizeOrFallback("TYPES.Actor.starshipPl", "Starship Systems"),
		subtitle: localizeOrFallback("TYPES.Actor.vehicle", "Vehicle Actor"),
		headerBadges: makeHeaderBadges(actor),
		summaryStrip: makeStarshipSummaryStrip(actor),
		legacyNotes: getLegacyNotes(actor),
		skills,
		starshipSheetV2Enabled,
		starshipSheetV2Shell,
		starshipSheetV2TabTitle: localizeOrFallback("SW5E.StarshipSheet.V2TabTitle", "V2 Preview"),
		crew: buildVehicleStarshipCrewContext(actor),
		sotgItemTabs,
		editable: actorEditable,
		/** Systems subtab: setup fields (tier, hull, etc.) only in sheet EDIT mode; routing stays usable in PLAY when `actorEditable`. */
		systemsSetupEditable: sheetEditMode && actorEditable,
		systemsRoutingEditable: actorEditable,
		systemsCore: buildSystemsCoreContext(actor),
		systemsGroups: withIntegrated(systemsGroups),
		systemsTabKicker: localizeOrFallback("DOCUMENT.TagsSystems", "Systems"),
		systemsTabTitle: localizeOrFallback("SW5E.StarshipSheet.SystemsTabTitle", "Ship systems"),
		systemsItemsSectionTitle: localizeOrFallback(
			"SW5E.StarshipSheet.SystemsItemsSectionTitle",
			"Classification & installed features"
		),
		systemsPlaceholderLede: localizeOrFallback(
			"SW5E.StarshipSheet.SystemsPlaceholderLede",
			"Use Operations for power routing during play. Supporting fields cover fuel and derived speeds. Classification groups list size and passive starship features—use sheet Edit mode to manage items; hull, shields, tier, and size stay in the sidebar."
		),
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
		overviewSkillsTitle: localizeOrFallback("SW5E.StarshipSheet.OverviewSkillsTitle", "Starship skills"),
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
		overviewPassiveHint: localizeOrFallback("DND5E.PassiveScore", "Passive score"),
		overviewSkillConfigureTitle: localizeOrFallback("SW5E.SkillConfigure", "Configure skill"),
		sotgSheetEditMode: sheetEditMode,
		sotgFindInSheetAria: localizeOrFallback("SW5E.StarshipSheet.FindInSheet", "Find on sheet"),
		sotgContextMenuAria: game.i18n.localize("DND5E.AdditionalControls")
	});

	// If our tab wrappers are already in the DOM, update their content in place.
	// This avoids removing and re-inserting elements, which would reset scroll position.
	// Event listeners attached via delegation to the wrapper elements survive innerHTML updates.
	panelParent.querySelector(`.sw5e-starship-tab[data-tab="${STARSHIP_FEATURES_TAB_ID}"]`)?.remove();

	const existingWrapper = panelParent.querySelector(`.sw5e-starship-tab[data-tab="${STARSHIP_TAB_ID}"]`);
	if ( existingWrapper ) {
		existingWrapper.innerHTML = rendered;
		syncSotgSheetPhaseClasses(app, existingWrapper.querySelector(".sw5e-starship-panel"));
		ensureStarshipSotgItemRowInteractions(existingWrapper, app);
		// dnd5e may re-render the nav in edit mode, removing our custom tab buttons.
		// Re-insert them if they're gone, and re-hide the stock features tab if needed.
		if ( !nav.querySelector(`[data-tab="${STARSHIP_TAB_ID}"]`) ) {
			const tabButton = document.createElement("a");
			tabButton.className = "sw5e-starship-tab-button";
			tabButton.dataset.group = "primary";
			tabButton.dataset.tab = STARSHIP_TAB_ID;
			tabButton.innerHTML = `<span>SotG</span>`;
			tabButton.addEventListener("click", event => { event.preventDefault(); activateSheetTab(root, app, STARSHIP_TAB_ID); });
			insertCustomTabButtons(nav, [tabButton]);
			hideStockFeaturesTab(root, app, nav);
		}
		restoreStarshipSheetViewState(app, starshipViewState, root);
		if ( integrated ) attachIntegratedStockPrimaryTabBridge(app, root, nav);
		scheduleStarshipDuplicateSizeNeutralize(root, app, actor);
		queueMicrotask(() => runStarshipSheetDiagnostics(root, app, actor, "render:updateSotgLayer"));
		return;
	}

	// First render: clean up any leftover nodes, create wrappers, and wire up all listeners.
	root.querySelectorAll(".sw5e-starship-tab, .sw5e-starship-tab-button, .sw5e-starship-tab-host").forEach(node => node.remove());

	const tabButton = document.createElement("a");
	tabButton.className = "sw5e-starship-tab-button";
	tabButton.dataset.group = "primary";
	tabButton.dataset.tab = STARSHIP_TAB_ID;
	tabButton.innerHTML = `<span>SotG</span>`;

	const wrapper = document.createElement("section");
	wrapper.className = "tab sw5e-starship-tab";
	wrapper.dataset.group = "primary";
	wrapper.dataset.tab = STARSHIP_TAB_ID;
	wrapper.innerHTML = rendered;
	syncSotgSheetPhaseClasses(app, wrapper.querySelector(".sw5e-starship-panel"));
	wrapper.hidden = getStarshipActiveTab(app) !== STARSHIP_TAB_ID;
	if ( getStarshipActiveTab(app) === STARSHIP_TAB_ID ) wrapper.classList.add("active");

	hideStockFeaturesTab(root, app, nav);
	insertCustomTabButtons(nav, [tabButton]);
	panelParent.append(wrapper);

	tabButton.addEventListener("click", event => {
		event.preventDefault();
		activateSheetTab(root, app, STARSHIP_TAB_ID);
	});

	const handleTabClick = async event => {
		const target = getEventTargetElement(event);
		const actionNode = target?.closest("[data-sw5e-action]");
		if ( !actionNode ) return;

		event.preventDefault();
		event.stopPropagation();
		const sheetActor = app.actor ?? actor;
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
			focusSheetItem(root, app, actionNode.dataset.itemId, actionNode.dataset.tab || STOCK_CARGO_TAB_ID);
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
			await rollStarshipAbility(sheetActor, actionNode.dataset.ability, event);
			return;
		}

		if ( action === "configure-skill" ) {
			await openStarshipSkillConfiguration(sheetActor, actionNode.dataset.skillId);
		}
	};

	ensureStarshipSotgItemRowInteractions(wrapper, app);

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
	scheduleStarshipDuplicateSizeNeutralize(root, app, actor);
	queueMicrotask(() => runStarshipSheetDiagnostics(root, app, actor, "render:firstMountSotgLayer"));
	} finally {
		bindStarshipSheetImageFallbacks(root);
	}
}

export function patchStarshipSheet() {
	registerStarshipVehicleSheetShowAbilitiesDefault();
	suppressNativeStarshipStationsAbilityAndFeatures();
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
}
