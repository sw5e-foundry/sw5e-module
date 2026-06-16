import { addHooks } from "./patch/addHooks.mjs";
import { patchConfig } from "./patch/config.mjs";
import { patchDataModels } from "./patch/dataModels.mjs";
import { patchPacks } from "./patch/packs.mjs";
import { patchManeuver } from "./patch/maneuver.mjs";
import { patchMedpac } from "./patch/medpac.mjs";
import { patchBlasterReload } from "./patch/blaster-reload.mjs";
import { patchChassisItemSheet } from "./patch/chassis-item-sheet.mjs";
import { patchPowercasting } from "./patch/powercasting.mjs";
import { patchForceRecovery } from "./patch/force-recovery.mjs";
import { patchProficiencyInit, patchProficiencyReady } from "./patch/proficiency.mjs";
import { patchProperties } from "./patch/properties.mjs";
import { patchEquippableAttunement } from "./patch/equippable-attunement.mjs";
import { patchStarshipCreate } from "./patch/starship-create.mjs";
import { patchStarshipPrepare } from "./patch/starship-prepare.mjs";
import { registerStarshipMovementReadyHooks } from "./patch/starship-movement.mjs";
import { patchStarshipMovementSensesConfig } from "./starship-movement-config.mjs";
import { patchStarshipSheet } from "./patch/starship-sheet.mjs";
import { patchAugmentationsSheet } from "./patch/augmentations-sheet.mjs";
import { patchDroidCustomizationsSheet } from "./patch/droid-customizations-sheet.mjs";
import * as migrations from "./migration.mjs";
import { handleTemplates } from "./templates.mjs";
import { chassisApi } from "./chassis.mjs";
import {
	getInstalledChassisModEffectChanges,
	getInstalledModBonus,
	isChassisHostItemActive,
	INSTALLED_MOD_SUPPORTED_BONUS_KEYS,
	prefetchInstalledModEffectsForActor,
	prefetchInstalledModEffectsForHost
} from "./installed-mod-effects.mjs";
import { augmentationsApi } from "./augmentations.mjs";
import { droidCustomizationsApi } from "./droid-customizations.mjs";
import { DroidCustomizationsApp } from "./droid-customizations-app.mjs";
import { AugmentationsApp } from "./augmentations-app.mjs";
import { registerModuleSettings } from "./settings.mjs";
import { patchVariantRules } from "./patch/variantRules.mjs";
import { patchCharacterDeploymentSheet } from "./patch/character-deployment-sheet.mjs";
import { patchCharacterSheetTabNavigation } from "./patch/character-sheet-tab-navigation.mjs";
import { getCharacterDeploymentSummary } from "./character-deployments.mjs";
import { registerCharacterFeaturesDiagnostics } from "./dev/character-features-diagnostics.mjs";
import { characterImporterApi, registerCharacterImporterHooks } from "./character-importer.mjs";
import { registerSw5eThemeHooks } from "./theme.mjs";

globalThis.sw5e = {
	migrations,
	chassis: chassisApi,
	installedModEffects: {
		getInstalledChassisModEffectChanges,
		getInstalledModBonus,
		isChassisHostItemActive,
		prefetchInstalledModEffectsForActor,
		prefetchInstalledModEffectsForHost,
		INSTALLED_MOD_SUPPORTED_BONUS_KEYS
	},
	augmentations: {
		...augmentationsApi,
		openManager: actor => AugmentationsApp.openForActor(actor)
	},
	droidCustomizations: {
		...droidCustomizationsApi,
		openManager: actor => DroidCustomizationsApp.openForActor(actor)
	},
	deployments: {
		getCharacterDeploymentSummary
	},
	characterImporter: {
		...characterImporterApi
	}
};

const strict = true;

Hooks.once('init', async function() {
	// Register Module Settings
	registerModuleSettings();
	registerSw5eThemeHooks();
	// Register lib-wrapper hooks
	addHooks();
	// Pre-load templates
	handleTemplates();
	registerCharacterImporterHooks();

	patchConfig(CONFIG.DND5E, strict);
	patchDataModels();

	patchManeuver();
	patchMedpac();
	patchBlasterReload();
	patchPowercasting();
	patchForceRecovery();
	patchProficiencyInit();
	patchProperties();
	patchEquippableAttunement();
	patchChassisItemSheet();
	patchStarshipCreate();
	patchStarshipPrepare();
	registerStarshipMovementReadyHooks();
	patchStarshipMovementSensesConfig();
	patchStarshipSheet();
	patchAugmentationsSheet();
	patchDroidCustomizationsSheet();
	patchVariantRules();
	patchCharacterDeploymentSheet();
	patchCharacterSheetTabNavigation();
});

Hooks.once('ready', async function() {
	patchPacks(strict);
	patchProficiencyReady();
	registerCharacterFeaturesDiagnostics(globalThis.sw5e);

	// Perform module migration if it is required and feasible
	if (migrations.needsMigration()) await migrations.migrateWorld();
});
