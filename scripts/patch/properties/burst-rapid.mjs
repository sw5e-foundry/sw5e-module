import { getFlag } from "../../utils.mjs";

/**
 * Implement automation for burst and rapid weapon properties
 * These properties affect the ammo consumption rate when used
 */

function patchAmmoConsumption() {
	// Hook into attack roll configuration to adjust ammo consumption for burst/rapid
	Hooks.on("dnd5e.preRollAttack", (item, rollConfig) => {
		if (item.type !== "weapon") return true;
		
		const burst = getFlag(item, "properties.burst") || 0;
		const rapid = getFlag(item, "properties.rapid") || 0;
		const auto = getFlag(item, "properties.auto") || 0;
		
		// Store the fire mode in the roll config for later use
		if (burst || rapid || auto) {
			rollConfig.fireMode = rollConfig.fireMode || "normal";
			
			// If the weapon has multiple fire modes, we should provide a choice
			// For now, we'll default to the highest ammo consumption mode
			if (auto) {
				rollConfig.fireMode = "auto";
				rollConfig.ammoMultiplier = auto;
			} else if (burst) {
				rollConfig.fireMode = "burst";
				rollConfig.ammoMultiplier = burst;
			} else if (rapid) {
				rollConfig.fireMode = "rapid";
				rollConfig.ammoMultiplier = rapid;
			}
		}
		
		return true;
	});
	
	// Modify ammo consumption based on fire mode
	Hooks.on("dnd5e.rollAttack", (item, roll, ammoUpdate) => {
		if (item.type !== "weapon") return;
		
		const rollConfig = roll.options;
		const fireMode = rollConfig?.fireMode;
		const multiplier = rollConfig?.ammoMultiplier || 1;
		
		if (fireMode && fireMode !== "normal" && multiplier > 1) {
			// Find the ammo update for this item
			const update = ammoUpdate.find(u => u._id === item.id);
			if (update && update["flags.sw5e.reload.value"] !== undefined) {
				// Adjust the ammo consumption based on the multiplier
				const reload = item.system.reload;
				const baseConsumption = reload.use || reload.baseUse || 1;
				const totalConsumption = baseConsumption * multiplier;
				
				update["flags.sw5e.reload.value"] = Math.max(0, reload.value - totalConsumption);
			}
		}
	});
}

function patchActivityDialog() {
	// Add fire mode selection to the attack dialog for weapons with burst/rapid/auto
	Hooks.on("renderActivityUsageDialog", (app, html, data) => {
		const item = app.item;
		if (item.type !== "weapon") return;
		
		const burst = getFlag(item, "properties.burst") || 0;
		const rapid = getFlag(item, "properties.rapid") || 0;
		const auto = getFlag(item, "properties.auto") || 0;
		
		if (!burst && !rapid && !auto) return;
		
		// Create fire mode selector
		const fireModes = [
			{ value: "normal", label: game.i18n.localize("SW5E.FireMode.Normal"), ammo: 1 }
		];
		
		if (rapid) {
			fireModes.push({ 
				value: "rapid", 
				label: game.i18n.format("SW5E.FireMode.Rapid", { count: rapid }), 
				ammo: rapid 
			});
		}
		if (burst) {
			fireModes.push({ 
				value: "burst", 
				label: game.i18n.format("SW5E.FireMode.Burst", { count: burst }), 
				ammo: burst 
			});
		}
		if (auto) {
			fireModes.push({ 
				value: "auto", 
				label: game.i18n.format("SW5E.FireMode.Auto", { count: auto }), 
				ammo: auto 
			});
		}
		
		// Only add selector if there are multiple modes
		if (fireModes.length <= 1) return;
		
		// Find the form element
		const form = html.find("form");
		const submitButton = form.find('button[type="submit"]');
		
		// Create the fire mode selector HTML
		const selectorHTML = `
			<div class="form-group">
				<label>${game.i18n.localize("SW5E.FireMode.Label")}</label>
				<select name="fireMode" class="fire-mode-select">
					${fireModes.map(mode => 
						`<option value="${mode.value}" data-ammo="${mode.ammo}">${mode.label}</option>`
					).join("")}
				</select>
				<p class="hint">${game.i18n.localize("SW5E.FireMode.Hint")}</p>
			</div>
		`;
		
		// Insert before the submit button
		submitButton.before(selectorHTML);
		
		// Store fire mode in the dialog config
		const selector = form.find('select[name="fireMode"]');
		selector.on("change", (event) => {
			const selected = event.currentTarget.value;
			const ammo = parseInt(event.currentTarget.selectedOptions[0].dataset.ammo) || 1;
			app.config.fireMode = selected;
			app.config.ammoMultiplier = ammo;
		});
	});
	
	// Apply fire mode to the activity usage
	Hooks.on("dnd5e.preUseActivity", (activity, usageConfig, dialogConfig, messageConfig) => {
		const item = activity.item;
		if (item.type !== "weapon") return true;
		
		// Transfer fire mode from dialog config to usage config
		if (dialogConfig?.fireMode) {
			usageConfig.fireMode = dialogConfig.fireMode;
			usageConfig.ammoMultiplier = dialogConfig.ammoMultiplier || 1;
			
			// Adjust ammo consumption
			const reload = item.system.reload;
			if (reload.max > 0) {
				const baseConsumption = reload.use || reload.baseUse || 1;
				const totalConsumption = baseConsumption * usageConfig.ammoMultiplier;
				
				// Check if we have enough ammo
				if (totalConsumption > (reload.value || 0)) {
					ui.notifications.error(game.i18n.format("SW5E.FireMode.InsufficientAmmo", {
						mode: usageConfig.fireMode,
						required: totalConsumption,
						available: reload.value || 0
					}));
					return false;
				}
			}
		}
		
		return true;
	});
}

function patchSavingThrowAmmo() {
	// For weapons with action type "save", automatically adjust ammo based on burst/rapid
	Hooks.on("dnd5e.preUseActivity", (activity, usageConfig, dialogConfig, messageConfig) => {
		const item = activity.item;
		if (item.type !== "weapon" || item.system.actionType !== "save") return true;
		
		const burst = getFlag(item, "properties.burst") || 0;
		const rapid = getFlag(item, "properties.rapid") || 0;
		
		// For saving throw weapons, use the higher of burst or rapid
		const autoConsumption = Math.max(burst, rapid, 1);
		
		if (autoConsumption > 1) {
			usageConfig.ammoMultiplier = autoConsumption;
			
			const reload = item.system.reload;
			if (reload.max > 0) {
				const totalConsumption = autoConsumption;
				
				// Check if we have enough ammo
				if (totalConsumption > (reload.value || 0)) {
					ui.notifications.warn(game.i18n.format("SW5E.FireMode.AutoConsumption", {
						amount: totalConsumption,
						property: burst > rapid ? "burst" : "rapid"
					}));
				}
			}
		}
		
		return true;
	});
}

export function patchBurstRapid() {
	patchAmmoConsumption();
	patchActivityDialog();
	patchSavingThrowAmmo();
}