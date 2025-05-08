import { addHooks } from "./patch/addHooks.mjs";
import { patchConfig } from "./patch/config.mjs";
import { patchDataModels } from "./patch/dataModels.mjs";
import { patchPacks } from "./patch/packs.mjs";
import { patchManeuver } from "./patch/maneuver.mjs";
import { patchPowercasting } from "./patch/powercasting.mjs";
import { patchProficiencyInit, patchProficiencyReady } from "./patch/proficiency.mjs";
import { patchProperties } from "./patch/properties.mjs";
import * as migrations from "./migration.mjs";
import { handleTemplates } from "./templates.mjs";
import { registerModuleSettings } from "./settings.mjs";
import { reloadBlaster } from './blaster-reload.mjs';

globalThis.sw5e = {
	migrations
};

const strict = true;

Hooks.once('init', async function() {
	// Register Module Settings
	registerModuleSettings();
	// Register lib-wrapper hooks
	addHooks();
	// Pre-load templates
	handleTemplates();

	patchConfig(CONFIG.DND5E, strict);
	patchDataModels();

	patchManeuver();
	patchPowercasting();
	patchProficiencyInit();
	patchProperties();
});

Hooks.once('ready', async function() {
	patchPacks(strict);
	patchProficiencyReady();

	// Perform module migration if it is required and feasible
	if (migrations.needsMigration()) migrations.migrateWorld();
});

Hooks.on('preRollAttack', async (actor, item, config) => {
	if (item?.type === 'weapon' && ['simpleBL', 'martialBL', 'exoticBL'].includes(item?.data?.data?.weaponType) && item?.data?.data?.uses) {
		if (item.data.data.uses.value <= 0) {
			config.roll = false; // Prevent the roll

			// Display the reload dialog
			let dialog = new Dialog({
				title: "Out of Charges!",
				content: `<p>Your ${item.name} is out of charges. Do you want to reload?</p>`,
				buttons: {
					yes: {
						icon: '<i class="fas fa-check"></i>',
						label: "Yes",
						callback: () => {
							reloadBlaster(actor, item);
						}
					},
					no: {
						icon: '<i class="fas fa-times"></i>',
						label: "No"
					}
				},
				default: "no"
			});
			dialog.render(true);
			return false; // Indicate that the roll should not proceed
		} else {
			// Decrement a charge
			await item.update({'data.data.uses.value': item.data.data.uses.value - 1});
		}
	}
	return true; // Allow the roll to proceed if it's not a blaster or has charges
});

Hooks.on('createItem', async (item, options, userId) => {
	if (item?.type === 'weapon' && ['simpleBL', 'martialBL', 'exoticBL'].includes(item?.data?.data?.weaponType) && !item?.data?.data?.uses?.value) {
		const reloadValue = item.data.data.flags?.sw5e?.reload;
		if (reloadValue) {
			await item.update({'data.data.uses': { value: reloadValue, max: reloadValue }});
		}
	}
});
