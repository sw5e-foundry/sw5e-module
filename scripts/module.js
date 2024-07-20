import { patchConfig } from "./config.mjs";

Hooks.once('init', async function() {
	patchConfig(CONFIG.DND5E);
});

Hooks.once('ready', async function() {

});
