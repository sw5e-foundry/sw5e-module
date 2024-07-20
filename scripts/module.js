import { patchConfig } from "./config.mjs";

const strict = true;

Hooks.once('init', async function() {
	patchConfig(CONFIG.DND5E, strict);
});

Hooks.once('ready', async function() {
	if (strict) {
		game.packs.filter(p => p.metadata.packageName === "dnd5e").forEach(p => {
			foundry.utils.setProperty(p.metadata.flags, "dnd5e.types", ["nope"]);
		});
	}
});
