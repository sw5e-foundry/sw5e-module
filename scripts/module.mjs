import { patchConfig } from "./patch/config.mjs";
import { patchDataModels } from "./patch/dataModels.mjs";
import { patchPacks } from "./patch/packs.mjs";
import { patchPowercasting } from "./patch/powercasting.mjs";
import { patchProficiencyInit, patchProficiencyReady } from "./patch/proficiency.mjs";
import { patchProperties } from "./patch/properties.mjs";
import * as migrations from "./migration.mjs";
import { registerModuleSettings } from "./settings.mjs";

globalThis.sw5e = {
	migrations
};

const strict = true;

Hooks.once('init', async function() {
	// Register Module Settings
	registerModuleSettings();

	patchConfig(CONFIG.DND5E, strict);
	patchDataModels();

	patchPowercasting();
	patchProficiencyInit();
	patchProperties();
});

Hooks.once('ready', async function() {
	if(!game.modules.get('lib-wrapper')?.active && game.user.isGM) {
		ui.notifications.error("SW5E requires the 'libWrapper' module. Please install and activate it.");
	} else {
		patchPacks(strict);
		patchProficiencyReady();
	}

	// Perform module migration if it is required and feasible
	if (migrations.needsMigration()) migrations.migrateWorld();
});
