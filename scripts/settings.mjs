import { CurrencySettingsApp } from "./currency-settings-app.mjs";
import {
	CURRENCY_CUSTOM_RATES_SETTING,
	CURRENCY_ENABLED_MAP_SETTING,
	CURRENCY_SETTINGS_MENU,
	getDefaultCustomCurrencyRates,
	getDefaultEnabledCurrencyMap
} from "./currencies.mjs";
import { CHASSIS_SETTING_KEYS, CHASSIS_RULES_MODES } from "./chassis.mjs";
import { LEGACY_SETTINGS_NAMESPACE, SETTINGS_NAMESPACE } from "./module-support.mjs";

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

	game.settings.registerMenu(SETTINGS_NAMESPACE, CURRENCY_SETTINGS_MENU, {
		name: "SW5E.CurrencySettingsMenu",
		label: "SW5E.CurrencySettingsMenuLabel",
		hint: "SW5E.CurrencySettingsMenuHint",
		icon: "fas fa-coins",
		type: CurrencySettingsApp,
		restricted: true
	});

	for ( const namespace of hiddenNamespaces ) registerHiddenWorldSetting(namespace, CURRENCY_ENABLED_MAP_SETTING, {
		name: "SW5E.CurrencySettingsEnabled",
		type: Object,
		default: getDefaultEnabledCurrencyMap()
	});

	for ( const namespace of hiddenNamespaces ) registerHiddenWorldSetting(namespace, CURRENCY_CUSTOM_RATES_SETTING, {
		name: "SW5E.CurrencySettingsExchangeRate",
		type: Object,
		default: getDefaultCustomCurrencyRates()
	});

	const chassisRulesChoices = Object.fromEntries(
		CHASSIS_RULES_MODES.map(id => [id, game.i18n.localize(`SW5E.ChassisRulesModeChoice.${id}`)])
	);

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
