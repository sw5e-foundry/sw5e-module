import { getBestAbility } from "./../utils.mjs";

// dataModels file adds:
// - maneuverData dataModel
// - super field to CreatureTemplate

function adjustItemSpellcastingGetter() {
	Hooks.on('sw5e.Item5e.spellcasting', function (_this, result, config, ...args) {
		const spellcasting = _this.system.spellcasting;
		if ( !spellcasting ) return;
		const isSubclass = _this.type === "subclass";
		const classSC = isSubclass ? _this.class?.system?.spellcasting : spellcasting;
		const subclassSC = isSubclass ? spellcasting : _this.subclass?.system?.spellcasting;
		for (const superType of ["superiority"]) {
			const prop = superType + "Progression"
			delete result[prop];
			const classPC = classSC?.[prop] ?? "none";
			const subclassPC = subclassSC?.[prop] ?? "none";
			if (subclassPC !== "none") result[superType] = subclassPC;
			else result[superType] = classPC;
		}
	});
}

function prepareSuperiority() {
	Hooks.on('sw5e.preActor5e._prepareSpellcasting', function (_this, result, config, ...args) {
		if (!_this.system.superiority) return;
		const isNPC = _this.type === "npc";

		// Prepare base progression data
		const charProgression = ["superiority"].reduce((obj, superType) => {
			obj[superType] = {
				maneuversKnownCur: 0,
				maneuversKnownMax: 0,
				diceSize: 0,
				diceCount: 0,
				casterLevel: 0,
				maxClassProg: null,
			};
			return obj;
		}, {});

		// Accumulate progression from all classes
		for (const [superType, obj] of Object.entries(charProgression)) {
			const superConfig = CONFIG.DND5E.superiority;
			if (isNPC) {
				const level = _this.system.details?.[`superiorityLevel`];
				if (level) {
					const fullConfig = superConfig.progression.full;
					// obj.maneuversKnownCur = ?;
					obj.maneuversKnownMax += fullConfig.known[level];
					obj.diceSize = fullConfig.size[level];
					obj.diceCount = fullConfig.quant[level];
					obj.casterLevel = level;
					obj.maxClassProg = "full";
				}
			} else {
				// Translate the list of classes into power-casting progression
				for (const cls of _this.itemTypes?.class ?? []) {
					const pc = cls.spellcasting;

					if (!pc || pc.levels < 1) continue;
					const progression = pc[superType];

					if (!(progression in superConfig.progression) || progression === "none") continue;

					const progConfig = superConfig.progression[progression];
					const maxConfig = superConfig.progression[obj.maxClassProg];

					// obj.maneuversKnownCur = ?;
					obj.maneuversKnownMax += progConfig.known[pc.levels];
					// obj.diceSize = ?;
					obj.diceCount += progConfig.quant[pc.levels];
					obj.casterLevel += pc.levels;
					if ((obj.maxClassProg === null) || (maxConfig.divisor > progConfig.divisor)) obj.maxClassProg = progression;
				}

				// Calculate known maneuvers
				for (const pwr of _this.itemTypes?.['sw5e.maneuver'] ?? []) {
					const { properties } = pwr?.system ?? {};
					if (properties?.has("freeLearn")) continue;
					obj.maneuversKnownCur++;
				}
			}
		}

		// Apply progression data
		for (const [superType, obj] of Object.entries(charProgression)) {
			const superConfig = CONFIG.DND5E.superiority;
			const progConfig = superConfig.progression[obj.maxClassProg] ?? {};

			// What is the size of your power dice
			obj.diceSize = progConfig.size?.[obj.casterLevel];

			// Apply the calculated values to the sheet
			const target = _this.system.superiority;
			target.known.value = obj.maneuversKnownCur;
			target.known.max ??= obj.maneuversKnownMax;
			target.dice.max ??= obj.diceCount;
			target.die ??= obj.diceSize;
			target.level ??= obj.casterLevel;
		}

		const { simplifyBonus } = dnd5e.utils;
		const rollData = _this.getRollData();

		const { attributes, superiority } = _this.system;
		const base = 8 + attributes.prof ?? 0;

		// TODO: Add rules
		// // Simplified forcecasting rule
		// if (game.settings.get("sw5e", "simplifiedForcecasting")) {
		// 	CONFIG.DND5E.superiority.types.physical.attr = CONFIG.DND5E.superiority.types.general.attr;
		// 	CONFIG.DND5E.superiority.types.mental.attr = CONFIG.DND5E.superiority.types.general.attr;
		// }

		// Superiority DC for Actors and NPCs
		const superConfig = CONFIG.DND5E.superiority;
		const bonusAll = simplifyBonus(_this.system.bonuses?.superiority?.dc?.all, rollData);
		for (const [type, typeConfig] of Object.entries(superConfig.types)) {
			const typeData = superiority.types[type];
			const bonus = simplifyBonus(_this.system.bonuses?.superiority?.dc?.[type], rollData) + bonusAll;
			const best = getBestAbility(_this, typeConfig.attr, 0);
			typeData.attr = best.id;
			typeData.dc = base + best.mod + bonus;
		}
	});
}

function makeProgOption(config) {
	const option = document.createElement("option");
	option.setAttribute("value", config.value);
	if (config.selected) option.setAttribute("selected", null);
	const text = document.createTextNode(game.i18n.localize(config.label));
	option.appendChild(text);
	return option;
}

function showPowercastingStats() {
	const { simplifyBonus } = dnd5e.utils;
	Hooks.on('sw5e.ActorSheet5eCharacter.getData', function (_this, context, config, ...args) {
		const msak = simplifyBonus(_this.actor.system.bonuses.msak.attack, context.rollData);
		const rsak = simplifyBonus(_this.actor.system.bonuses.rsak.attack, context.rollData);
		for (const superType of ["superiority"]) {
			const superData = _this.actor.system.superiority;
			if (!superData.level) continue;
			const sc = superData.types.general ?? {};
			const ability = _this.actor.system.abilities[sc.attr];
			const mod = ability?.mod ?? 0;
			const attackBonus = msak === rsak ? msak : 0;
			context.spellcasting?.push({
				label: game.i18n.localize(`SW5E.Superiority.Label`) + ` (${superData.dice.value}/${superData.dice.max}d${superData.die})`,
				ability: { mod: ability?.mod ?? 0, ability: sc.attr ?? "" },
				attack: mod + _this.actor.system.attributes.prof + attackBonus,
				primary: _this.actor.system.attributes.spellcasting === sc.attr,
				save: ability?.dc ?? 0
			});
		}
	});
}

function patchItemSheet() {
	Hooks.on("renderItemSheet5e", (app, html, data) => {
		html.find(`select[name|='system.spellcasting.progression']`).each((idx, el) => {
			const root = el.parentNode.parentNode;
			const selectedValue = app.item.system.spellcasting.superiorityProgression;
			const div = document.createElement("div");
			div.setAttribute("class", "form-group");
			const label = document.createElement("label");
			const text = document.createTextNode(game.i18n.localize(`SW5E.Superiority.Prog.Label`));
			label.appendChild(text);
			div.appendChild(label);
			const div2 = document.createElement("div");
			div2.setAttribute("class", "form-fields");
			const select = document.createElement("select");
			select.setAttribute("name", `system.spellcasting.superiorityProgression`);
			select.appendChild(makeProgOption({
				value: "none",
				selected: selectedValue === "none",
				label: "DND5E.None"
			}));
			if (!app.isEditable) select.setAttribute("disabled", null);
			for (const [key, prog] of Object.entries(CONFIG.DND5E.superiority.progression)) {
				select.appendChild(makeProgOption({
					value: key,
					selected: selectedValue === key,
					label: prog.label
				}));
			}
			div2.appendChild(select);
			div.appendChild(div2);
			root.nextElementSibling.insertAdjacentElement("afterend", div);
		});
	});
}

function patchPowerAbilityScore() {
	Hooks.on('sw5e.preActor5e.spellcastingClasses', function (_this, ...args) {
		_this['sw5e-preCalculatedSpellcastingClasses2'] = _this._spellcastingClasses !== undefined;
	});
	Hooks.on('sw5e.Actor5e.spellcastingClasses', function (_this, result, config, ...args) {
		const preCalculated = _this['sw5e-preCalculatedSpellcastingClasses2'] = _this._spellcastingClasses !== undefined;
		delete _this['sw5e-preCalculatedSpellcastingClasses2'];

		if (preCalculated) return;
		for (const [identifier, cls] of Object.entries(_this.classes)) {
			if (cls.spellcasting && (cls.spellcasting.superiorityProgression !== "none")) result[identifier] = cls;
		}
	});
}

function patchPowerbooks() {
	Hooks.on('sw5e.ActorSheet5e._prepareSpellbook', function (_this, powerbook, config, ...args) {
		const [context, spells] = args;

		// Format a powerbook entry for a certain indexed level
		const registerSection = (sl, i, label, dataset) => {
			if (powerbook.find(section => section.order === i)) return;
			const section = {
				order: i,
				label: label,
				usesSlots: false,
				canCreate: _this.actor.isOwner,
				canPrepare: false,
				spells: [],
				uses: 0,
				slots: 0,
				override: 0,
				dataset: {type: "maneuver", ...dataset},
				prop: sl,
				editable: context.editable
			};
			powerbook.push(section);
			return section;
		};

		const superiorityBook = {};
		const superData = _this.actor.system.superiority;
		let idx = 1000;
		if (superData.level !== 0) {
			for (const type of Object.keys(CONFIG.DND5E.superiority.types)) {
				const section = registerSection(`maneuvers-${type}`, idx++, `SW5E.Superiority.Type.${type.capitalize()}.Label`, {'type.value': type});
				superiorityBook[type] = section;
			}
		}

		// Iterate over every maneuver item, adding maneuvers to the powerbook by section
		context.actor.itemTypes['sw5e.maneuver'].forEach(maneuver => {
			const type = maneuver.system.type.value || "general";
			const mt = `maneuver-${type}`;

			// Sections for maneuvers which the caster "should not" have, but maneuver items exist for
			if (!superiorityBook[type]) {
				const section = registerSection(mt, idx++, `SW5E.Superiority.Type.${type.capitalize()}.Label`, {'type.value': type});
				superiorityBook[type] = section;
			}

			// Add the maneuver to the relevant heading
			superiorityBook[type].spells.push(maneuver);
		});

		// Sort the powerbook by section level
		config.result = powerbook.sort((a, b) => a.order - b.order);
	});
}

function recoverSuperiorityDice() {
	Hooks.on("dnd5e.shortRest", (actor, config) => { if (actor.system.superiority.level) actor.update({ "system.superiority.dice.value": actor.system.superiority.dice.max }); });
	Hooks.on("dnd5e.longRest", (actor, config) => { if (actor.system.superiority.level) actor.update({ "system.superiority.dice.value": actor.system.superiority.dice.max }); });
}

function makeSuperiorityDiceConsumable() {
	Hooks.once("setup", function() { CONFIG.DND5E.consumableResources.push(`superiority.dice.value`); });
}

function addSuperiorityScaleValues() {
	Hooks.on("sw5e.ActorDataModel._prepareScaleValues", function (_this, result, config, ...args) {
		const superiority = _this.system?.superiority;
		if ( superiority?.level ) {
			if ( _this.system.scale.superiority ) ui.notifications.warn( "SW5E.Superiority.Warn.Identifier" );
			_this.system.scale.superiority = superiority;
		}
	});
}

function addCompendiumBrowserTab() {
	const tabs = game.dnd5e.applications.CompendiumBrowser.TABS;
	const idx = tabs.findIndex(i => i.tab === "spells");
	tabs.splice(idx+1, 0, {
		tab: "maneuvers",
		label: "TYPES.Item.sw5e.maneuverPl",
		icon: "fas fa-tablet",
		documentClass: "Item",
		types: ["sw5e.maneuver"]
	});
}

export function patchManeuver() {
	adjustItemSpellcastingGetter();
	patchItemSheet();
	patchPowerAbilityScore();
	patchPowerbooks();
	prepareSuperiority();
	recoverSuperiorityDice();
	showPowercastingStats();
	makeSuperiorityDiceConsumable();
	addCompendiumBrowserTab();
}
