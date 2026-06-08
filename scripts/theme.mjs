import { getModuleSettingValue } from "./module-support.mjs";

export const SW5E_THEME_SETTING = "themeMode";

export const SW5E_THEMES = Object.freeze({
	SW5E_LIGHT: "sw5e-light",
	SW5E_DARK: "sw5e-dark",
	DND5E: "dnd5e"
});

export const SW5E_THEME_CHOICES = Object.freeze(Object.values(SW5E_THEMES));
export const SW5E_DEFAULT_THEME = SW5E_THEMES.SW5E_LIGHT;

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
	for ( const theme of SW5E_THEME_CHOICES ) element.classList.remove(`sw5e-theme--${theme}`);
	element.classList.remove("sw5e-theme--sw5e", "sw5e-theme--native-dnd5e");
}

function applyThemeClasses(element, theme) {
	if ( !(element instanceof HTMLElement) ) return;
	removeThemeClasses(element);
	element.classList.add(`sw5e-theme--${theme}`);
	element.classList.toggle("sw5e-theme--sw5e", theme !== SW5E_THEMES.DND5E);
	element.classList.toggle("sw5e-theme--native-dnd5e", theme === SW5E_THEMES.DND5E);
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
	return SW5E_THEME_CHOICES.includes(theme) ? theme : SW5E_DEFAULT_THEME;
}

export function getSw5eTheme() {
	return normalizeSw5eTheme(getModuleSettingValue(SW5E_THEME_SETTING, SW5E_DEFAULT_THEME));
}

export function isNativeDnd5eTheme(theme = getSw5eTheme()) {
	return normalizeSw5eTheme(theme) === SW5E_THEMES.DND5E;
}

export function applySw5eThemeDocument(theme = getSw5eTheme()) {
	const resolvedTheme = normalizeSw5eTheme(theme);
	const html = document.documentElement;
	const body = document.body;
	for ( const element of [html, body] ) {
		if ( !(element instanceof HTMLElement) ) continue;
		element.dataset.sw5eTheme = resolvedTheme;
		applyThemeClasses(element, resolvedTheme);
	}
	return resolvedTheme;
}

export function applySw5eThemeScope(target, { scope = "module" } = {}) {
	const root = getThemeRoot(target);
	if ( !(root instanceof HTMLElement) ) return null;
	const theme = applySw5eThemeDocument();
	for ( const element of collectScopedElements(root) ) {
		element.classList.add("sw5e-theme-root");
		element.dataset.sw5eThemeRoot = scope;
		element.dataset.sw5eTheme = theme;
		applyThemeClasses(element, theme);
	}
	return root;
}

export function rerenderThemeableApplications() {
	for ( const app of Object.values(ui.windows ?? {}) ) {
		try {
			app?.render?.(true);
		} catch ( err ) {
			console.warn("SW5E | Theme rerender failed", err);
		}
	}
}

export function onSw5eThemeChange(theme) {
	applySw5eThemeDocument(theme);
	rerenderThemeableApplications();
}

function applyThemeScopeFromHook(_app, html, scope) {
	applySw5eThemeScope(html, { scope });
}

const DND5E_SPECIES_CONFIG_SHEETS = new Set([
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

function applyDnd5eThemedApplicationFromHook(app, html) {
	const root = getHtmlRoot(html) ?? getAppRoot(app);
	if ( isDnd5eSpeciesConfigSheet(app, root) ) {
		applySw5eThemeScope(html, { scope: "config-sheet" });
		return;
	}
	if ( isDnd5eAdvancementConfigApp(app, root) ) {
		applySw5eThemeScope(html, { scope: "advancement-config" });
	}
}

export function registerSw5eThemeHooks() {
	Hooks.once("ready", () => applySw5eThemeDocument());
	Hooks.on("canvasReady", () => applySw5eThemeDocument());
	Hooks.on("renderActorSheetV2", (app, html) => applyThemeScopeFromHook(app, html, "sheet"));
	Hooks.on("renderItemSheet5e", (app, html) => applyThemeScopeFromHook(app, html, "sheet"));
	Hooks.on("renderApplicationV2", (app, html) => applyDnd5eThemedApplicationFromHook(app, html));
	Hooks.on("renderChatLog", (app, html) => applyThemeScopeFromHook(app, html, "chat-log"));
	Hooks.on("renderChatMessageHTML", (message, html) => applyThemeScopeFromHook(message, html, "chat"));
	Hooks.on("renderJournalSheet", (app, html) => applyThemeScopeFromHook(app, html, "journal"));
	Hooks.on("renderJournalPageSheet", (app, html) => applyThemeScopeFromHook(app, html, "journal"));
}
