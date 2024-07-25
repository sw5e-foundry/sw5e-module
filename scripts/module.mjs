import { patchConfig } from "./patch/config.mjs";
import { patchDataModels } from "./patch/dataModels.mjs";
import { patchPowercasting } from "./patch/powercasting.mjs";
import { patchProficiencyInit, patchProficiencyReady } from "./patch/proficiency.mjs";
import { patchProperties } from "./patch/properties.mjs";

const strict = true;

Hooks.once('init', async function() {
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
		if (strict) {
			game.packs.filter(p => p.metadata.packageName === "dnd5e").forEach(p => {
				foundry.utils.setProperty(p.metadata.flags, "dnd5e.types", ["nope"]);
			});
		}
		patchProficiencyReady();
	}
});
