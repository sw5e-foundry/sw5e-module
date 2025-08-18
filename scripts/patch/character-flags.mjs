import { getFlag } from "../utils.mjs";

/**
 * Implement character flags automation for SW5e special abilities
 * Including Supreme abilities, Force/Tech discounts, Maneuver critical threshold, etc.
 */

function addCharacterFlags() {
	// Add character flags to the actor data model
	Hooks.on("dnd5e.dataModels.actor.CharacterData.defineSchema", (schema) => {
		const { NumberField, SchemaField, StringField } = foundry.data.fields;
		
		// Add SW5e specific flags schema
		schema.flags = schema.flags || new SchemaField({});
		schema.flags.fields.sw5e = new SchemaField({
			characterFlags: new SchemaField({
				// Supreme abilities - doubles proficiency bonus for specific ability checks
				supremeSTR: new NumberField({ initial: 0, min: 0, max: 1, integer: true, label: "SW5E.CharacterFlags.SupremeSTR" }),
				supremeDEX: new NumberField({ initial: 0, min: 0, max: 1, integer: true, label: "SW5E.CharacterFlags.SupremeDEX" }),
				supremeCON: new NumberField({ initial: 0, min: 0, max: 1, integer: true, label: "SW5E.CharacterFlags.SupremeCON" }),
				supremeINT: new NumberField({ initial: 0, min: 0, max: 1, integer: true, label: "SW5E.CharacterFlags.SupremeINT" }),
				supremeWIS: new NumberField({ initial: 0, min: 0, max: 1, integer: true, label: "SW5E.CharacterFlags.SupremeWIS" }),
				supremeCHA: new NumberField({ initial: 0, min: 0, max: 1, integer: true, label: "SW5E.CharacterFlags.SupremeCHA" }),
				
				// Power point discounts
				forcePowerDiscount: new NumberField({ initial: 0, min: 0, integer: true, label: "SW5E.CharacterFlags.ForcePowerDiscount" }),
				techPowerDiscount: new NumberField({ initial: 0, min: 0, integer: true, label: "SW5E.CharacterFlags.TechPowerDiscount" }),
				
				// Maneuver critical threshold modification
				maneuverCritThreshold: new NumberField({ initial: 0, min: -10, max: 10, integer: true, label: "SW5E.CharacterFlags.ManeuverCritThreshold" }),
				
				// Encumbrance multiplier
				encumbranceMultiplier: new NumberField({ initial: 1, min: 0.1, label: "SW5E.CharacterFlags.EncumbranceMultiplier" })
			})
		});
	});
}

function patchSupremeAbilities() {
	// Apply supreme ability bonuses to skill checks
	Hooks.on("dnd5e.preRollAbilityTest", (actor, rollConfig, abilityId) => {
		if (actor.type !== "character") return true;
		
		const flags = getFlag(actor, "characterFlags") || {};
		const supremeKey = `supreme${abilityId.toUpperCase()}`;
		
		if (flags[supremeKey]) {
			// Double the proficiency bonus for this ability
			const prof = actor.system.attributes.prof || 0;
			rollConfig.parts.push(`${prof}[${game.i18n.localize("SW5E.Supreme")}]`);
			
			// Add a note to the roll
			rollConfig.messageData = rollConfig.messageData || {};
			rollConfig.messageData.flavor = rollConfig.messageData.flavor || "";
			rollConfig.messageData.flavor += ` (${game.i18n.localize("SW5E.SupremeAbility")})`;
		}
		
		return true;
	});
	
	// Also apply to skill checks
	Hooks.on("dnd5e.preRollSkill", (actor, rollConfig, skillId) => {
		if (actor.type !== "character") return true;
		
		const skill = actor.system.skills[skillId];
		if (!skill) return true;
		
		const flags = getFlag(actor, "characterFlags") || {};
		const supremeKey = `supreme${skill.ability.toUpperCase()}`;
		
		if (flags[supremeKey]) {
			// Double the proficiency bonus for skills using this ability
			const prof = actor.system.attributes.prof || 0;
			rollConfig.parts.push(`${prof}[${game.i18n.localize("SW5E.Supreme")}]`);
			
			// Add a note to the roll
			rollConfig.messageData = rollConfig.messageData || {};
			rollConfig.messageData.flavor = rollConfig.messageData.flavor || "";
			rollConfig.messageData.flavor += ` (${game.i18n.localize("SW5E.SupremeAbility")})`;
		}
		
		return true;
	});
}

function patchPowerDiscounts() {
	// Apply power point discounts when casting powers
	Hooks.on("dnd5e.preUseActivity", (activity, usageConfig, dialogConfig, messageConfig) => {
		const item = activity.item;
		const actor = item.actor;
		
		if (!actor || actor.type !== "character" || item.type !== "spell") return true;
		
		const flags = getFlag(actor, "characterFlags") || {};
		const school = item.system.school;
		
		// Determine if this is a force or tech power
		const isForce = ["lgt", "uni", "drk"].includes(school);
		const isTech = school === "tec";
		
		if (!isForce && !isTech) return true;
		
		const discount = isForce ? (flags.forcePowerDiscount || 0) : (flags.techPowerDiscount || 0);
		
		if (discount > 0 && item.system.preparation?.mode === "powerCasting") {
			// Reduce the power point cost
			const originalCost = usageConfig.spell?.slot || item.system.level || 0;
			const discountedCost = Math.max(1, originalCost - discount);
			
			if (originalCost !== discountedCost) {
				usageConfig.spell = usageConfig.spell || {};
				usageConfig.spell.slot = discountedCost;
				
				// Add a note about the discount
				messageConfig.flavor = messageConfig.flavor || "";
				messageConfig.flavor += ` (${game.i18n.format("SW5E.PowerDiscount", { 
					discount: discount,
					original: originalCost,
					final: discountedCost
				})})`;
			}
		}
		
		return true;
	});
}

function patchManeuverCritical() {
	// Apply maneuver critical threshold modifications
	Hooks.on("dnd5e.preRollAttack", (item, rollConfig) => {
		const actor = item.actor;
		if (!actor || actor.type !== "character") return true;
		
		// Check if this is a maneuver-based attack
		const isManeuver = item.type === "sw5e.maneuver" || 
						  (item.type === "feat" && item.system.type?.value === "maneuver");
		
		if (!isManeuver) return true;
		
		const flags = getFlag(actor, "characterFlags") || {};
		const critModifier = flags.maneuverCritThreshold || 0;
		
		if (critModifier !== 0) {
			// Modify the critical threshold
			rollConfig.critical = (rollConfig.critical || 20) - critModifier;
			rollConfig.critical = Math.max(1, Math.min(20, rollConfig.critical));
			
			// Add a note about the modified critical
			rollConfig.messageData = rollConfig.messageData || {};
			rollConfig.messageData.flavor = rollConfig.messageData.flavor || "";
			rollConfig.messageData.flavor += ` (${game.i18n.format("SW5E.ManeuverCritModified", { 
				threshold: rollConfig.critical 
			})})`;
		}
		
		return true;
	});
}

function patchEncumbrance() {
	// Apply encumbrance multiplier to carrying capacity
	Hooks.on("dnd5e.computeEncumbrance", (actor, encumbrance) => {
		if (actor.type !== "character") return;
		
		const flags = getFlag(actor, "characterFlags") || {};
		const multiplier = flags.encumbranceMultiplier || 1;
		
		if (multiplier !== 1) {
			// Modify all encumbrance thresholds
			if (encumbrance.max) encumbrance.max *= multiplier;
			if (encumbrance.thresholds) {
				for (const [key, value] of Object.entries(encumbrance.thresholds)) {
					encumbrance.thresholds[key] = Math.floor(value * multiplier);
				}
			}
		}
	});
}

function addCharacterFlagsTab() {
	// Add a tab to the character sheet for SW5e flags
	Hooks.on("renderActorSheet5eCharacter2", (app, html, data) => {
		if (!app.isEditable) return;
		
		// Find the nav tabs
		const nav = html.find('.tabs[data-group="primary"]');
		if (!nav.length) return;
		
		// Add SW5e flags tab
		const flagsTab = `<a class="item" data-tab="sw5e-flags">${game.i18n.localize("SW5E.CharacterFlags.Tab")}</a>`;
		nav.append(flagsTab);
		
		// Create the tab content
		const flags = getFlag(app.actor, "characterFlags") || {};
		const tabContent = `
			<div class="tab sw5e-flags" data-group="primary" data-tab="sw5e-flags">
				<h3 class="border">${game.i18n.localize("SW5E.CharacterFlags.Header")}</h3>
				
				<div class="form-group">
					<h4>${game.i18n.localize("SW5E.CharacterFlags.SupremeAbilities")}</h4>
					<p class="notes">${game.i18n.localize("SW5E.CharacterFlags.SupremeAbilitiesHint")}</p>
					<div class="form-fields">
						${["STR", "DEX", "CON", "INT", "WIS", "CHA"].map(ability => `
							<label class="checkbox">
								<input type="checkbox" name="flags.sw5e.characterFlags.supreme${ability}" 
									   ${flags[`supreme${ability}`] ? "checked" : ""}>
								<span>${game.i18n.localize(`DND5E.Ability${ability.capitalize()}`)}</span>
							</label>
						`).join("")}
					</div>
				</div>
				
				<div class="form-group">
					<h4>${game.i18n.localize("SW5E.CharacterFlags.PowerDiscounts")}</h4>
					<p class="notes">${game.i18n.localize("SW5E.CharacterFlags.PowerDiscountsHint")}</p>
					<div class="form-fields">
						<label>
							<span>${game.i18n.localize("SW5E.CharacterFlags.ForcePowerDiscount")}</span>
							<input type="number" name="flags.sw5e.characterFlags.forcePowerDiscount" 
								   value="${flags.forcePowerDiscount || 0}" min="0" max="9" step="1">
						</label>
						<label>
							<span>${game.i18n.localize("SW5E.CharacterFlags.TechPowerDiscount")}</span>
							<input type="number" name="flags.sw5e.characterFlags.techPowerDiscount" 
								   value="${flags.techPowerDiscount || 0}" min="0" max="9" step="1">
						</label>
					</div>
				</div>
				
				<div class="form-group">
					<h4>${game.i18n.localize("SW5E.CharacterFlags.CombatModifiers")}</h4>
					<p class="notes">${game.i18n.localize("SW5E.CharacterFlags.CombatModifiersHint")}</p>
					<div class="form-fields">
						<label>
							<span>${game.i18n.localize("SW5E.CharacterFlags.ManeuverCritThreshold")}</span>
							<input type="number" name="flags.sw5e.characterFlags.maneuverCritThreshold" 
								   value="${flags.maneuverCritThreshold || 0}" min="-10" max="10" step="1">
						</label>
					</div>
				</div>
				
				<div class="form-group">
					<h4>${game.i18n.localize("SW5E.CharacterFlags.PhysicalModifiers")}</h4>
					<p class="notes">${game.i18n.localize("SW5E.CharacterFlags.PhysicalModifiersHint")}</p>
					<div class="form-fields">
						<label>
							<span>${game.i18n.localize("SW5E.CharacterFlags.EncumbranceMultiplier")}</span>
							<input type="number" name="flags.sw5e.characterFlags.encumbranceMultiplier" 
								   value="${flags.encumbranceMultiplier || 1}" min="0.1" max="10" step="0.1">
						</label>
					</div>
				</div>
			</div>
		`;
		
		// Add the tab content after the last tab
		const tabs = html.find('.sheet-body .tab-content');
		tabs.append(tabContent);
		
		// Handle input changes
		html.find('.tab.sw5e-flags input').on('change', (event) => {
			const input = event.currentTarget;
			const name = input.name;
			const value = input.type === 'checkbox' ? (input.checked ? 1 : 0) : Number(input.value);
			
			app.actor.update({ [name]: value });
		});
	});
}

export function patchCharacterFlags() {
	// Note: Schema modification would need to happen at module init
	// For now, we'll work with flags stored in the regular flag system
	
	patchSupremeAbilities();
	patchPowerDiscounts();
	patchManeuverCritical();
	patchEncumbrance();
	addCharacterFlagsTab();
}