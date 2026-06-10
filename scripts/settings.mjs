import { CHASSIS_SETTING_KEYS, CHASSIS_RULES_MODES } from "./chassis.mjs";
import { LEGACY_SETTINGS_NAMESPACE, SETTINGS_NAMESPACE } from "./module-support.mjs";
import {
	onSw5eThemeChange,
	SW5E_DEFAULT_THEME,
	SW5E_THEMES,
	SW5E_THEME_SETTING
} from "./theme.mjs";

/** Client-side diagnostic logs for Features-tab Deployment pill injection (default off). */
export const DEPLOYMENT_CARD_DEBUG_SETTING = "deploymentCardDebug";

function registerHiddenWorldSetting(namespace, key, data) {
	game.settings.register(namespace, key, {
		scope: "world",
		config: false,
		...data
	});
}

/**
 * Register all of the module's settings.
 */
export function registerModuleSettings() {
	// Internal Module Migration Version
	const hiddenNamespaces = Array.from(new Set([SETTINGS_NAMESPACE, LEGACY_SETTINGS_NAMESPACE]));

	for ( const namespace of hiddenNamespaces ) registerHiddenWorldSetting(namespace, "moduleMigrationVersion", {
		name: "Module Migration Version",
		type: String,
		default: ""
	});

	const chassisRulesChoices = Object.fromEntries(
		CHASSIS_RULES_MODES.map(id => [id, game.i18n.localize(`SW5E.ChassisRulesModeChoice.${id}`)])
	);
	const themeChoices = {
		[SW5E_THEMES.SW5E_LIGHT]: game.i18n.localize("SW5E.Settings.ThemeMode.Choice.sw5e-light"),
		[SW5E_THEMES.SW5E_DARK]: game.i18n.localize("SW5E.Settings.ThemeMode.Choice.sw5e-dark"),
		[SW5E_THEMES.OFF]: game.i18n.localize("SW5E.Settings.ThemeMode.Choice.off")
	};

	game.settings.register(SETTINGS_NAMESPACE, SW5E_THEME_SETTING, {
		name: "SW5E.Settings.ThemeMode.Name",
		hint: "SW5E.Settings.ThemeMode.Hint",
		scope: "world",
		config: true,
		type: String,
		choices: themeChoices,
		default: SW5E_DEFAULT_THEME,
		onChange: theme => onSw5eThemeChange(theme)
	});

	game.settings.register(SETTINGS_NAMESPACE, CHASSIS_SETTING_KEYS.rulesMode, {
		name: "SW5E.ChassisRulesMode",
		hint: "SW5E.ChassisRulesModeHint",
		scope: "world",
		config: true,
		type: String,
		choices: chassisRulesChoices,
		default: "guided",
		requiresReload: true
	});

	game.settings.register(SETTINGS_NAMESPACE, CHASSIS_SETTING_KEYS.enforceTools, {
		name: "SW5E.ChassisEnforceTools",
		hint: "SW5E.ChassisEnforceToolsHint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
		requiresReload: true
	});

	game.settings.register(SETTINGS_NAMESPACE, CHASSIS_SETTING_KEYS.enforceRarity, {
		name: "SW5E.ChassisEnforceRarity",
		hint: "SW5E.ChassisEnforceRarityHint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
		requiresReload: true
	});

	game.settings.register(SETTINGS_NAMESPACE, CHASSIS_SETTING_KEYS.enforceSlots, {
		name: "SW5E.ChassisEnforceSlots",
		hint: "SW5E.ChassisEnforceSlotsHint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
		requiresReload: true
	});

	// // Allow 'feat + 1 ASI' variant rule
	game.settings.register(SETTINGS_NAMESPACE, "allowFeatsAndASI", {
		name: "SW5E.variant.AllowFeatsAndASI",
		hint: "SW5E.variant.AllowFeatsAndASIHint",
		scope: "world",
		config: true,
		default: false,
		type: Boolean,
		requiresReload: true,
	});

	// // Simplified Forcecasting
	game.settings.register(SETTINGS_NAMESPACE, "simplifiedForcecasting", {
		name: "SW5E.variant.SimplifiedForcecasting",
		hint: "SW5E.variant.SimplifiedForcecastingHint",
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
		requiresReload: true
  	});

	game.settings.register(SETTINGS_NAMESPACE, "experimentalStarshipSheetV2", {
		name: "SW5E.Settings.StarshipSheetV2.Name",
		hint: "SW5E.Settings.StarshipSheetV2.Hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: false
	});

	game.settings.register(SETTINGS_NAMESPACE, DEPLOYMENT_CARD_DEBUG_SETTING, {
		name: "SW5E.Settings.DeploymentCardDebug.Name",
		hint: "SW5E.Settings.DeploymentCardDebug.Hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: false
	});

	// // Use old starship movement calculation rules
	// game.settings.register("sw5e", "oldStarshipMovement", {
	//   name: "SETTINGS.SWOldStarshipMovementN",
	//   hint: "SETTINGS.SWOldStarshipMovementL",
	//   scope: "world",
	//   config: true,
	//   type: Boolean,
	//   default: false
	//   requiresReload: true
	// });

	// // NPCs consume ammo
	// game.settings.register("sw5e", "npcConsumeAmmo", {
	//   name: "SETTINGS.SWnpcConsumeAmmoN",
	//   hint: "SETTINGS.SWnpcConsumeAmmoL",
	//   scope: "world",
	//   config: true,
	//   type: Boolean,
	//   default: false,
	//   requiresReload: true
	// });
}
