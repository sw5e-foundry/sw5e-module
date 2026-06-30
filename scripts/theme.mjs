import {
	getModuleSettingValue,
	hasStoredWorldSetting,
	LEGACY_SETTINGS_NAMESPACE,
	SETTINGS_NAMESPACE
} from "./module-support.mjs";
import { isDnd5eActivityConfigApp, resolveActivityConfigThemeScope } from "./patch/starship-activity.mjs";

export const SW5E_THEME_SETTING = "themeMode";

export const SW5E_THEMES = Object.freeze({
	SW5E_LIGHT: "sw5e-light",
	SW5E_DARK: "sw5e-dark",
	SW5E_UNDERWORLD: "sw5e-underworld",
	OFF: "off"
});

/** Legacy stored value; normalized to {@link SW5E_THEMES.OFF} at runtime. */
const LEGACY_THEME_DND5E = "dnd5e";
const LEGACY_THEME_FOLLOW_FOUNDRY = "follow-foundry";

export const SW5E_THEME_CHOICES = Object.freeze(Object.values(SW5E_THEMES));
export const SW5E_DEFAULT_THEME = SW5E_THEMES.SW5E_LIGHT;

const THEME_CLASS_PREFIX = "sw5e-theme--";
const LEGACY_THEME_CLASSES = Object.freeze([
	"sw5e-theme--sw5e",
	"sw5e-theme--native-dnd5e",
	`${THEME_CLASS_PREFIX}${LEGACY_THEME_DND5E}`
]);

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? null;
}

function getAppRoot(app) {
	const element = app?.element;
	return element instanceof HTMLElement ? element : element?.[0] ?? null;
}

function getThemeRoot(target) {
	if ( target instanceof HTMLElement ) return target;
	return getHtmlRoot(target) ?? getAppRoot(target);
}

function removeThemeClasses(element) {
	if ( !(element instanceof HTMLElement) ) return;
	for ( const theme of SW5E_THEME_CHOICES ) element.classList.remove(`${THEME_CLASS_PREFIX}${theme}`);
	for ( const className of LEGACY_THEME_CLASSES ) element.classList.remove(className);
}

function applyThemeClasses(element, theme) {
	if ( !(element instanceof HTMLElement) ) return;
	removeThemeClasses(element);
	if ( isSw5eThemeOff(theme) ) return;
	element.classList.add(`${THEME_CLASS_PREFIX}${theme}`);
	element.classList.add("sw5e-theme--sw5e");
}

function collectScopedElements(root) {
	if ( !(root instanceof HTMLElement) ) return [];
	const elements = [root];
	const app = root.closest(".application");
	const windowApp = root.closest(".window-app");
	if ( app instanceof HTMLElement && !elements.includes(app) ) elements.push(app);
	if ( windowApp instanceof HTMLElement && !elements.includes(windowApp) ) elements.push(windowApp);
	return elements;
}

export function normalizeSw5eTheme(value) {
	const theme = typeof value === "string" ? value.trim().toLowerCase() : "";
	if ( theme === LEGACY_THEME_DND5E ) return SW5E_THEMES.OFF;
	if ( theme === LEGACY_THEME_FOLLOW_FOUNDRY ) return SW5E_DEFAULT_THEME;
	return SW5E_THEME_CHOICES.includes(theme) ? theme : SW5E_DEFAULT_THEME;
}

export function getSw5eTheme() {
	return normalizeSw5eTheme(getModuleSettingValue(SW5E_THEME_SETTING, SW5E_DEFAULT_THEME));
}

export function isSw5eThemeOff(theme = getSw5eTheme()) {
	return normalizeSw5eTheme(theme) === SW5E_THEMES.OFF;
}

function clearSw5eThemeScope(target) {
	const root = getThemeRoot(target);
	if ( !(root instanceof HTMLElement) ) return null;
	for ( const element of collectScopedElements(root) ) {
		element.classList.remove("sw5e-theme-root");
		delete element.dataset.sw5eThemeRoot;
		delete element.dataset.sw5eTheme;
		removeThemeClasses(element);
	}
	return root;
}

function clearAllSw5eThemeScopes() {
	for ( const element of document.querySelectorAll(".sw5e-theme-root, [data-sw5e-theme-root]") ) {
		if ( element instanceof HTMLElement ) clearSw5eThemeScope(element);
	}
}

export function applySw5eThemeDocument(theme = getSw5eTheme()) {
	const resolvedTheme = normalizeSw5eTheme(theme);
	const html = document.documentElement;
	const body = document.body;
	for ( const element of [html, body] ) {
		if ( !(element instanceof HTMLElement) ) continue;
		if ( isSw5eThemeOff(resolvedTheme) ) {
			delete element.dataset.sw5eTheme;
			removeThemeClasses(element);
			continue;
		}
		element.dataset.sw5eTheme = resolvedTheme;
		applyThemeClasses(element, resolvedTheme);
	}
	return resolvedTheme;
}

export function applySw5eThemeScope(target, { scope = "module" } = {}) {
	const root = getThemeRoot(target);
	if ( !(root instanceof HTMLElement) ) return null;
	const theme = applySw5eThemeDocument();
	if ( isSw5eThemeOff(theme) ) {
		clearSw5eThemeScope(root);
		return root;
	}
	for ( const element of collectScopedElements(root) ) {
		element.classList.add("sw5e-theme-root");
		element.dataset.sw5eThemeRoot = scope;
		element.dataset.sw5eTheme = theme;
		applyThemeClasses(element, theme);
	}
	return root;
}

function collectRenderableApplications() {
	const apps = new Set();
	for ( const app of Object.values(ui.windows ?? {}) ) if ( app ) apps.add(app);
	const instances = foundry.applications?.instances;
	if ( instances ) {
		for ( const app of instances.values() ) if ( app?.render ) apps.add(app);
	}
	return apps;
}

/**
 * Re-apply the active SW5E theme to open scoped surfaces without a full rerender.
 * Needed because AppV2 sheets may not live in `ui.windows`.
 */
function resyncExistingThemeScopes(theme = getSw5eTheme()) {
	const resolvedTheme = normalizeSw5eTheme(theme);
	if ( isSw5eThemeOff(resolvedTheme) ) {
		clearAllSw5eThemeScopes();
		return;
	}
	const seen = new Set();
	for ( const root of document.querySelectorAll(".sw5e-theme-root, [data-sw5e-theme-root]") ) {
		if ( !(root instanceof HTMLElement) ) continue;
		for ( const element of collectScopedElements(root) ) {
			if ( seen.has(element) ) continue;
			seen.add(element);
			element.dataset.sw5eTheme = resolvedTheme;
			applyThemeClasses(element, resolvedTheme);
		}
	}
}

export function rerenderThemeableApplications() {
	for ( const app of collectRenderableApplications() ) {
		try {
			app.render(true);
		} catch ( err ) {
			console.warn("SW5E | Theme rerender failed", err);
		}
	}
}

export function onSw5eThemeChange(theme) {
	const resolvedTheme = normalizeSw5eTheme(theme);
	applySw5eThemeDocument(resolvedTheme);
	if ( isSw5eThemeOff(resolvedTheme) ) clearAllSw5eThemeScopes();
	else resyncExistingThemeScopes(resolvedTheme);
	rerenderThemeableApplications();
}

function migrateLegacyThemeSetting() {
	const game = globalThis.game;
	if ( !game?.settings ) return;
	const namespaces = Array.from(new Set([SETTINGS_NAMESPACE, LEGACY_SETTINGS_NAMESPACE]));
	for ( const namespace of namespaces ) {
		if ( !hasStoredWorldSetting(namespace, SW5E_THEME_SETTING) ) continue;
		try {
			const value = game.settings.get(namespace, SW5E_THEME_SETTING);
			if ( value === LEGACY_THEME_DND5E ) {
				void game.settings.set(namespace, SW5E_THEME_SETTING, SW5E_THEMES.OFF);
			} else if ( value === LEGACY_THEME_FOLLOW_FOUNDRY ) {
				void game.settings.set(namespace, SW5E_THEME_SETTING, SW5E_THEMES.SW5E_LIGHT);
			}
		} catch ( err ) {
			console.warn("SW5E | Theme setting migration failed", err);
		}
	}
}

function applyThemeScopeFromHook(_app, html, scope) {
	applySw5eThemeScope(html, { scope });
}

const DND5E_SPECIES_CONFIG_SHEETS = new Set([
	"AbilityConfig",
	"CreatureTypeConfig",
	"MovementSensesConfig"
]);

/**
 * dnd5e race/species item config dialogs (Creature Type, Movement, Senses) are not item sheets
 * and do not receive renderItemSheet5e. Scope only those dnd5e config applications.
 */
export function isDnd5eSpeciesConfigSheet(app, element) {
	if ( !(element instanceof HTMLElement) ) return false;
	if ( !element.classList.contains("dnd5e2") || !element.classList.contains("config-sheet") ) return false;
	if ( element.classList.contains("sw5e-starship-skill-roll-config") ) return false;
	if ( element.classList.contains("power-point-config") ) return false;
	if ( element.classList.contains("creature-type") ) return true;
	return DND5E_SPECIES_CONFIG_SHEETS.has(app?.constructor?.name);
}

/**
 * dnd5e Advancement configuration sheets (ASI, Traits, Size, Grant Items, etc.) opened from
 * item/actor advancement tabs. PseudoDocumentSheet apps with `.advancement.sheet.grid-columns`.
 */
export function isDnd5eAdvancementConfigApp(app, element) {
	if ( !(element instanceof HTMLElement) ) return false;
	if ( !element.classList.contains("dnd5e2") ) return false;
	if ( !element.classList.contains("advancement") ) return false;
	if ( !element.classList.contains("sheet") ) return false;
	if ( !element.classList.contains("grid-columns") ) return false;
	if ( element.classList.contains("advancement-migration") ) return false;
	return Boolean(app?.advancement);
}

/**
 * dnd5e D20 roll configuration dialogs (ability checks, saving throws, etc.).
 * ApplicationV2 apps with `.dnd5e2.application.roll-configuration`.
 */
export function isDnd5eRollConfigurationApp(app, element) {
	if ( !(element instanceof HTMLElement) ) return false;
	if ( !element.classList.contains("dnd5e2") ) return false;
	if ( !element.classList.contains("application") ) return false;
	if ( !element.classList.contains("roll-configuration") ) return false;
	if ( element.classList.contains("sw5e-starship-skill-roll-config") ) return false;
	return true;
}

const DND5E_REST_DIALOG_NAMES = new Set(["BaseRestDialog", "ShortRestDialog", "LongRestDialog"]);

/**
 * dnd5e short/long rest configuration dialogs (Dialog5e / ApplicationV2).
 * Root: `.dnd5e2.application.rest` (+ `.short-rest` or `.long-rest`).
 */
export function isDnd5eRestDialogApp(app, element) {
	if ( !(element instanceof HTMLElement) ) return false;
	if ( !element.classList.contains("dnd5e2") ) return false;
	if ( !element.classList.contains("application") ) return false;
	if ( !element.classList.contains("rest") ) return false;
	return DND5E_REST_DIALOG_NAMES.has(app?.constructor?.name ?? "");
}

/**
 * dnd5e activity usage dialogs (cast power, save, etc.).
 * Root: `.dnd5e2.application.activity-usage`.
 */
export function isDnd5eActivityUsageDialogApp(app, element) {
	if ( !(element instanceof HTMLElement) ) return false;
	if ( !element.classList.contains("dnd5e2") ) return false;
	if ( !element.classList.contains("application") ) return false;
	if ( !element.classList.contains("activity-usage") ) return false;
	return app?.constructor?.name === "ActivityUsageDialog";
}

/**
 * SW5E starship recharge/refitting repair dialogs (ApplicationV2).
 * Root: `.dnd5e2.application.rest.starship-repair`.
 */
export function isSw5eStarshipRepairDialogApp(app, element) {
	if ( !(element instanceof HTMLElement) ) return false;
	if ( !element.classList.contains("dnd5e2") ) return false;
	if ( !element.classList.contains("application") ) return false;
	if ( !element.classList.contains("starship-repair") ) return false;
	const ctorName = app?.constructor?.name ?? "";
	return ctorName === "StarshipRechargeRepairDialog"
		|| ctorName === "StarshipRefittingRepairDialog"
		|| ctorName === "StarshipRegenRepairDialog";
}

/**
 * dnd5e actor configuration dialogs (HP, AC, skills, etc.) opened from actor sheets.
 * Tight filter: Actor document + dnd5e actor ApplicationV2 config class + config-sheet chrome.
 */
export function isDnd5eActorConfigSheet(app, element) {
	if ( !(element instanceof HTMLElement) ) return false;
	if ( !element.classList.contains("dnd5e2") || !element.classList.contains("config-sheet") ) return false;
	if ( element.classList.contains("sw5e-starship-skill-roll-config") ) return false;
	if ( element.classList.contains("power-point-config") ) return false;
	if ( isDnd5eSpeciesConfigSheet(app, element) ) return false;
	if ( isDnd5eRollConfigurationApp(app, element) ) return false;
	if ( isDnd5eAdvancementConfigApp(app, element) ) return false;

	const document = app?.document;
	if ( document?.documentName !== "Actor" ) return false;

	const ctorName = app?.constructor?.name ?? "";
	if ( !ctorName || !ctorName.endsWith("Config") ) return false;
	return Boolean(dnd5e.applications?.actor?.[ctorName]);
}

/**
 * SW5E Cybernetic Augmentations manager (ApplicationV2).
 */
export function isSw5eAugmentationsApp(app, element) {
	if ( app?.constructor?.name === "AugmentationsApp" ) return true;
	return element instanceof HTMLElement && element.classList.contains("sw5e-augmentations-manager");
}

/**
 * SW5E Droid customizations manager (ApplicationV2).
 */
export function isSw5eDroidCustomizationsApp(app, element) {
	if ( app?.constructor?.name === "DroidCustomizationsApp" ) return true;
	return element instanceof HTMLElement && element.classList.contains("sw5e-droid-customizations-manager");
}

/**
 * SW5E Droid customization compendium picker (scoped CompendiumBrowser).
 */
export function isSw5eDroidCustomizationsBrowser(app, element) {
	if ( app?.constructor?.name === "DroidCustomizationCompendiumBrowser" ) return true;
	return element instanceof HTMLElement && element.classList.contains("sw5e-droid-customizations-browser");
}

/**
 * SW5E Augmentation compendium picker (scoped CompendiumBrowser).
 */
export function isSw5eAugmentationsBrowser(app, element) {
	if ( app?.constructor?.name === "AugmentationCompendiumBrowser" ) return true;
	return element instanceof HTMLElement && element.classList.contains("sw5e-augmentations-browser");
}

const DIALOG_PROMPT_EXCLUDED_ROOT_CLASSES = Object.freeze([
	"sw5e-chassis-install-browser-app",
	"compendium-browser",
	"sw5e-augmentations-manager",
	"sw5e-droid-customizations-manager",
	"power-point-config",
	"sw5e-starship-skill-roll-config",
	"create-document"
]);

/**
 * dnd5e CreateDocumentDialog for new Activity pseudo-documents (Attack, Cast, Check, etc.).
 * Root: `.dnd5e2.create-document` from `UtilityActivity.createDialog`.
 */
export function isDnd5eActivityTypeChooserDialog(app, element) {
	if ( !(element instanceof HTMLElement) ) return false;
	if ( app?.constructor?.name !== "CreateDocumentDialog" ) return false;
	if ( !element.classList.contains("create-document") ) return false;
	return app?.documentType?.documentName === "Activity";
}

/**
 * Ephemeral DialogV2.wait / legacy Dialog prompts that are not handled by a dedicated theme scope.
 */
export function isEphemeralDialogPromptApp(app, element) {
	if ( !(element instanceof HTMLElement) ) return false;
	if ( element.dataset.sw5eThemeRoot ) return false;

	for ( const className of DIALOG_PROMPT_EXCLUDED_ROOT_CLASSES ) {
		if ( element.classList.contains(className) ) return false;
	}

	const ctorName = app?.constructor?.name ?? "";
	if ( ctorName === "Dialog" || ctorName === "CheckboxSelectDialog" ) {
		return element.classList.contains("dialog");
	}
	if ( ctorName === "DialogV2" ) return true;
	return false;
}

/**
 * dnd5e journal entry/page sheets (AppV2). Legacy renderJournalSheet hooks do not fire on v13.
 */
export function isDnd5eJournalApp(app, element) {
	if ( !(element instanceof HTMLElement) ) return false;
	if ( !element.classList.contains("dnd5e2-journal") ) return false;

	const ctorName = app?.constructor?.name ?? "";
	if ( ctorName === "JournalEntrySheet5e" || ctorName === "JournalPageSheet5e" ) return true;

	const docName = app?.document?.documentName;
	return docName === "JournalEntry" || docName === "JournalEntryPage";
}

function applyDnd5eThemedApplicationFromHook(app, html) {
	const root = getHtmlRoot(html) ?? getAppRoot(app);
	if ( isSw5eAugmentationsApp(app, root) ) {
		applySw5eThemeScope(html, { scope: "cybernetics" });
		return;
	}
	if ( isSw5eDroidCustomizationsApp(app, root) ) {
		applySw5eThemeScope(html, { scope: "droid-customizations" });
		return;
	}
	if ( isSw5eDroidCustomizationsBrowser(app, root) ) {
		applySw5eThemeScope(html, { scope: "droid-customizations-browser" });
		return;
	}
	if ( isSw5eAugmentationsBrowser(app, root) ) {
		applySw5eThemeScope(html, { scope: "augmentations-browser" });
		return;
	}
	if ( isDnd5eJournalApp(app, root) ) {
		applySw5eThemeScope(html, { scope: "journal" });
		return;
	}
	if ( isDnd5eSpeciesConfigSheet(app, root) ) {
		applySw5eThemeScope(html, { scope: "config-sheet" });
		return;
	}
	if ( isDnd5eAdvancementConfigApp(app, root) ) {
		applySw5eThemeScope(html, { scope: "advancement-config" });
		return;
	}
	if ( isDnd5eRollConfigurationApp(app, root) ) {
		applySw5eThemeScope(html, { scope: "roll-configuration" });
		return;
	}
	if ( isDnd5eRestDialogApp(app, root) ) {
		applySw5eThemeScope(html, { scope: "rest-dialog" });
		return;
	}
	if ( isDnd5eActivityConfigApp(app, root) ) {
		applySw5eThemeScope(html, { scope: resolveActivityConfigThemeScope(app) });
		return;
	}
	if ( isDnd5eActivityUsageDialogApp(app, root) ) {
		applySw5eThemeScope(html, { scope: "activity-dialog" });
		return;
	}
	if ( isSw5eStarshipRepairDialogApp(app, root) ) {
		applySw5eThemeScope(html, { scope: "rest-dialog" });
		return;
	}
	if ( isDnd5eActorConfigSheet(app, root) ) {
		applySw5eThemeScope(html, { scope: "config-sheet" });
		return;
	}
	if ( isDnd5eActivityTypeChooserDialog(app, root) ) {
		applySw5eThemeScope(html, { scope: "activity-type-chooser" });
		return;
	}
	if ( isEphemeralDialogPromptApp(app, root) ) {
		applySw5eThemeScope(html, { scope: "dialog-prompt" });
	}
}

function applyLegacyDialogThemeFromHook(app, html) {
	if ( isSw5eThemeOff() ) return;
	const root = getHtmlRoot(html) ?? getAppRoot(app);
	if ( !root || root.dataset.sw5eThemeRoot ) return;
	if ( isEphemeralDialogPromptApp(app, root) ) {
		applySw5eThemeScope(html, { scope: "dialog-prompt" });
	}
}

export function registerSw5eThemeHooks() {
	Hooks.once("ready", () => {
		migrateLegacyThemeSetting();
		applySw5eThemeDocument();
	});
	Hooks.on("canvasReady", () => applySw5eThemeDocument());
	Hooks.on("renderActorSheetV2", (app, html) => applyThemeScopeFromHook(app, html, "sheet"));
	Hooks.on("renderItemSheet5e", (app, html) => applyThemeScopeFromHook(app, html, "sheet"));
	Hooks.on("renderApplicationV2", (app, html) => applyDnd5eThemedApplicationFromHook(app, html));
	Hooks.on("renderDialog", (app, html) => applyLegacyDialogThemeFromHook(app, html));
	Hooks.on("renderChatLog", (app, html) => applyThemeScopeFromHook(app, html, "chat-log"));
	Hooks.on("renderChatMessageHTML", (message, html) => applyThemeScopeFromHook(message, html, "chat"));
	Hooks.on("renderJournalSheet", (app, html) => applyThemeScopeFromHook(app, html, "journal"));
	Hooks.on("renderJournalPageSheet", (app, html) => applyThemeScopeFromHook(app, html, "journal"));
	Hooks.on("renderActiveEffectConfig", (app, html) => applyThemeScopeFromHook(app, html, "active-effect-config"));
}
