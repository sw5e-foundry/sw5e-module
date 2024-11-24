import { getBestAbility } from "./../utils.mjs";

// dataModels file adds:
// - powercasting field to CreatureTemplate
// - spellcasting.force/techProgression to ClassData and SubclassData

function adjustItemSpellcastingGetter() {
	Hooks.on('sw5e.Item5e.spellcasting', function (_this, result, config, ...args) {
		const spellcasting = _this.system.spellcasting;
		if ( !spellcasting ) return;
		const isSubclass = _this.type === "subclass";
		const classSC = isSubclass ? _this.class?.system?.spellcasting : spellcasting;
		const subclassSC = isSubclass ? spellcasting : _this.subclass?.system?.spellcasting;
		for (const castType of ["force", "tech"]) {
			const prop = castType + "Progression"
			delete result[prop];
			const classPC = classSC?.[prop] ?? "none";
			const subclassPC = subclassSC?.[prop] ?? "none";
			if (subclassPC !== "none") result[castType] = subclassPC;
			else result[castType] = classPC;
		}
	});
}

function preparePowercasting() {
	Hooks.on('sw5e.preActor5e._prepareSpellcasting', function (_this, result, config, ...args) {
		if (!_this.system.spells) return;
		const isNPC = _this.type === "npc";

		// Prepare base progression data
		const charProgression = ["force", "tech"].reduce((obj, castType) => {
			obj[castType] = {
				powersKnownCur: 0,
				powersKnownMax: 0,
				points: 0,
				casterLevel: 0,
				maxPowerLevel: 0,
				maxClassProg: null,
				maxClassLevel: 0,
				classes: 0,
				attributeOverride: null
			};
			return obj;
		}, {});

		for (const [castType, obj] of Object.entries(charProgression)) {
			const typeConfig = CONFIG.DND5E.powerCasting[castType];
			if (isNPC) {
				const level = _this.system.details?.[`power${castType.capitalize()}Level`];
				if (level) {
					obj.classes = 1;
					obj.points = level * typeConfig.obj.full.powerPoints;
					obj.casterLevel = level;
					obj.maxClassLevel = level;
					obj.maxClassProg = "full";
				}
			} else {
				// Translate the list of classes into power-casting progression
				for (const cls of _this.itemTypes?.class ?? []) {
					const pc = cls.spellcasting;

					if (!pc || pc.levels < 1) continue;
					const progression = pc[castType];

					if (!(progression in typeConfig.progression) || progression === "none") continue;
					if (progression === "half" && castType === "tech" && pc.levels < 2) continue; // Tech half-casters only get techcasting at lvl 2

					const progConfig = typeConfig.progression[progression];

					obj.classes++;
					obj.powersKnownMax += progConfig.powersKnown[pc.levels];
					obj.points += pc.levels * progConfig.powerPoints;
					obj.casterLevel += pc.levels * progConfig.powerMaxLevel[20] / 9;
					obj.maxPowerLevel = Math.max(obj.maxPowerLevel, progConfig.powerMaxLevel[20]);

					if (pc.levels > obj.maxClassLevel) {
						obj.maxClassLevel = pc.levels;
						obj.maxClassProg = progression;
					}
				}

				// Calculate known powers
				for (const pwr of _this.itemTypes?.spell ?? []) {
					const { preparation, properties, school } = pwr?.system ?? {};
					if (properties?.has("freeLearn")) continue;
					if (school in CONFIG.DND5E.powerCasting[castType].schools) obj.powersKnownCur++;
				}
			}
		}


		// Apply progression data
		for (const [castType, obj] of Object.entries(charProgression)) {
			const typeConfig = CONFIG.DND5E.powerCasting[castType] ?? {};
			const progConfig = typeConfig.progression[obj.maxClassProg] ?? {};

			// 'Round Appropriately'
			obj.points = Math.round(obj.points);
			obj.casterLevel = Math.round(obj.casterLevel);

			// What level is considered 'high level casting'
			obj.limit = progConfig.powerLimit ?? 0;

			// What is the maximum power level you can cast
			if (obj.classes) {
				if (obj.classes === 1) {
					obj.maxPowerLevel = progConfig.powerMaxLevel[obj.maxClassLevel];
				} else {
					// Don't allow multiclassing to achieve a higher max power level than a 20th level character of any of those classes
					obj.maxPowerLevel = Math.min(obj.maxPowerLevel, typeConfig.progression.full[obj.casterLevel]);
				}
			}

			// Apply the calculated values to the sheet
			const target = _this.system.powercasting[castType];
			target.known.value = obj.powersKnownCur;
			target.known.max ??= obj.powersKnownMax;
			target.level ??= obj.casterLevel;
			target.limit ??= obj.limit;
			target.maxPowerLevel ??= obj.maxPowerLevel;
			target.points.max ??= obj.points;
		}

		const { simplifyBonus } = dnd5e.utils;
		const rollData = _this.getRollData();

		const { attributes, powercasting } = _this.system;
		const base = 8 + attributes.prof ?? 0;
		const lvl = Number(_this.system.details?.level ?? _this.system.details.cr ?? 0);

		// TODO: Add rules
		// // Simplified forcecasting rule
		// if (game.settings.get("sw5e", "simplifiedForcecasting")) {
		// 	CONFIG.DND5E.powerCasting.force.schools.lgt.attr = CONFIG.DND5E.powerCasting.force.schools.uni.attr;
		// 	CONFIG.DND5E.powerCasting.force.schools.drk.attr = CONFIG.DND5E.powerCasting.force.schools.uni.attr;
		// }

		// Powercasting DC for Actors and NPCs
		const ability = {};
		const bonusAll = simplifyBonus(_this.system.bonuses?.power?.dc?.all, rollData);
		for (const [castType, typeConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			for (const [school, schoolConfig] of Object.entries(typeConfig.schools)) {
				const schoolData = powercasting[castType].schools[school];
				const bonus = simplifyBonus(_this.system.bonuses?.power?.dc?.[school], rollData) + bonusAll;
				ability[school] = getBestAbility(_this, schoolConfig.attr, 0);
				if (ability[school].mod > (ability[castType]?.mod ?? -Infinity)) ability[castType] = ability[school];
				schoolData.attr = ability[school]?.id ?? "";
				schoolData.dc = base + ability[school].mod + bonus;
			}
		}

		// Set Force and tech bonus points for PC Actors
		for (const [castType, typeConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			const cast = _this.system.powercasting[castType];
			const castSource = _this._source.system.powercasting[castType];

			if (castSource.points.max !== null) continue;
			if (cast.level === 0) continue;

			if (ability[castType]?.mod) cast.points.max += ability[castType].mod;

			const levelBonus = simplifyBonus(cast.points.bonuses.level ?? 0, rollData) * lvl;
			const overallBonus = simplifyBonus(cast.points.bonuses.overall ?? 0, rollData);
			const focus = _this.focuses?.[CONFIG.DND5E.powerCasting[castType].focus.label];
			const focusProperty = CONFIG.DND5E.powerCasting[castType].focus.property;
			const focusBonus = focus?.flags?.sw5e?.properties?.[focusProperty] ?? 0;

			cast.points.max += levelBonus + overallBonus + focusBonus;
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
		for (const castType of ["tech", "force"]) {
			const castData = _this.actor.system.powercasting[castType];
			if (castData.level === 0) continue;
			const sc = castData.schools.tec ?? castData.schools.uni ?? {};
			const ability = _this.actor.system.abilities[sc.attr];
			const mod = ability?.mod ?? 0;
			const attackBonus = msak === rsak ? msak : 0;
			context.spellcasting?.push({
				label: game.i18n.localize(`SW5E.Powercasting.${castType.capitalize()}.Label`) + ` (${castData.points.value}/${castData.points.max})`,
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
			for (const castType of ["Tech", "Force"]) {
				const selectedValue = app.item.system.spellcasting[`${castType.toLowerCase()}Progression`];
				const div = document.createElement("div");
				div.setAttribute("class", "form-group");
				const label = document.createElement("label");
				const text = document.createTextNode(game.i18n.localize(`SW5E.Powercasting.${castType}.Prog.Label`));
				label.appendChild(text);
				div.appendChild(label);
				const div2 = document.createElement("div");
				div2.setAttribute("class", "form-fields");
				const select = document.createElement("select");
				select.setAttribute("name", `system.spellcasting.${castType.toLowerCase()}Progression`);
				select.appendChild(makeProgOption({
					value: "none",
					selected: selectedValue === "none",
					label: "DND5E.None"
				}));
				if (!app.isEditable) select.setAttribute("disabled", null);
				for (const [key, prog] of Object.entries(CONFIG.DND5E.powerCasting[castType.toLowerCase()].progression)) {
					select.appendChild(makeProgOption({
						value: key,
						selected: selectedValue === key,
						label: prog.label
					}));
				}
				div2.appendChild(select);
				div.appendChild(div2);
				root.nextElementSibling.insertAdjacentElement("afterend", div);
			}
		});
	});
}

function patchPowerAbilityScore() {
	Hooks.on('sw5e.preActor5e.spellcastingClasses', function (_this, ...args) {
		_this['sw5e-preCalculatedSpellcastingClasses2'] = _this._spellcastingClasses !== undefined;
	});
	Hooks.on('sw5e.Actor5e.spellcastingClasses', function (_this, result, config, ...args) {
		const preCalculated = _this['sw5e-preCalculatedSpellcastingClasses'] = _this._spellcastingClasses !== undefined;
		delete _this['sw5e-preCalculatedSpellcastingClasses'];

		if (preCalculated) return;
		for (const [identifier, cls] of Object.entries(_this.classes)) for (const castType of ["force", "tech"]) {
			if (cls.spellcasting && (cls.spellcasting[`${castType}Progression`] !== "none")) result[identifier] = cls;
		}
	});

	Hooks.on('sw5e.SpellData.getSheetData', function (_this, result, config, ...args) {
		const context = args[0];
		if ( _this.parent.actor ) {
			for (const [castType, castData] of Object.entries(_this.parent.actor.system?.powercasting ?? {})) {
				if (_this.school in castData.schools) {
					const abl = castData.schools[_this.school].attr;
					const ability = CONFIG.DND5E.abilities[abl]?.label?.toLowerCase();
					if ( ability ) context.defaultAbility = game.i18n.format("DND5E.DefaultSpecific", { default: ability });
				}
			}
		}
	});
	Hooks.on('sw5e.SpellData.availableAbilities', function (_this, result, config, ...args) {
		if ( _this.ability ) return;
		for (const [castType, typeConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			if (_this.school in typeConfig.schools) {
				config.result = new Set(typeConfig.schools[_this.school].attr);
				return;
			}
		}
	});
	Hooks.on('sw5e.SpellData._typeAbilityMod', function (_this, result, config, ...args) {
		config.result = getBestAbility(_this.parent.actor, _this.availableAbilities).id ?? _this.availableAbilities.first() ?? "int";
	});
}

function patchPowerbooks() {
	Hooks.on('sw5e.ActorSheet5e._prepareSpellbook', function (_this, powerbook, config, ...args) {
		const [context, spells] = args;

		// Format a powerbook entry for a certain indexed level
		const registerSection = (sl, i, label) => {
			if (powerbook.find(section => section.order === i)) return;
			powerbook.push({
				order: i,
				label: label,
				usesSlots: false,
				canCreate: _this.actor.isOwner,
				canPrepare: (context.actor.type === "character") && (i >= 1),
				spells: [],
				uses: 0,
				slots: 0,
				override: 0,
				dataset: {type: "spell", level: i, preparationMode: "powerCasting"},
				prop: sl,
				editable: context.editable
			});
		};

		for (const [castType, typeConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			const castData = _this.actor.system.powercasting[castType];
			if (castData.level === 0) continue;
			for (let lvl = 0; lvl <= castData.maxPowerLevel; lvl++) registerSection(`spell${lvl}`, lvl, CONFIG.DND5E.spellLevels[lvl]);
		}

		// Sort the powerbook by section level
		config.result = powerbook.sort((a, b) => a.order - b.order);
	});

	Hooks.on('sw5e.ActorSheet5e._onDropSpell', function (_this, itemData, config, ...args) {
	    const prep = itemData.system.preparation;

	    if (prep.mode !== "innate") return;

		// Determine the section it is dropped on, if any.
		let header = _this._event.target.closest(".items-header"); // Dropped directly on the header.
		if ( !header ) {
			const list = _this._event.target.closest(".item-list"); // Dropped inside an existing list.
			header = list?.previousElementSibling;
		}

		const { level, preparationMode } = header?.closest("[data-level]")?.dataset ?? {};

		// Determine if the actor is a powercaster.
		const isCaster = Object.values(_this.actor.system.powercasting).reduce(((acc, obj) => acc || !!obj.level), false);

		// Case 1: Drop a cantrip.
		if ( itemData.system.level === 0 ) {
			const modes = CONFIG.DND5E.spellPreparationModes;
			if ( !preparationMode && isCaster ) prep.mode = "powerCasting";
		}

		// Case 2: Drop a leveled spell in a section without a mode.
		else if ( (level === "0") || !preparationMode ) {
			if ( _this.document.type !== "npc" ) prep.mode = "powerCasting";
		}
	});
}

function patchAbilityUseDialog() {
	Hooks.on('sw5e.AbilityUseDialog._createResourceOptions', function (_this, result, config, ...args) {
		const spell = args[0];
		const actor = spell?.actor;
		for (const [castType, typeConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			if (spell.system.school in typeConfig.schools) {
				const maxPowerLevel = actor.system.powercasting[castType].maxPowerLevel;
				config.result = Object.fromEntries(Object.entries(result).filter(e => e[0] <= (maxPowerLevel+1)));
				return;
			}
		}
	});
	Hooks.on('sw5e.ActivityUsageDialog._prepareScalingContext', function (_this, result, config, ...args) {
		const context = config.result;

		if ( _this.activity.requiresSpellSlot && (_this.config.scaling !== false) && (_this.item.system.preparation.mode === "powerCasting") ) {
			if (context.notes.length >= 1) {
				const note = context.notes[context.notes.length-1];
				if (note.type === "warn" && note.message.startsWith("You have no available")) context.notes.pop();
			}
			const powercastingType = _this.item.system.school === "tec" ? "tech" : "force";
			const powercasting = _this.actor.system.powercasting[powercastingType];

			const minimumLevel = _this.item.system.level ?? 1;
			const maximumLevel = powercasting.maxPowerLevel;

			const spellSlotOptions = Array.from({ length: maximumLevel - minimumLevel + 1 }, (v, i) => {
				const lvl = i + minimumLevel;
				const label = game.i18n.localize(`DND5E.SpellLevel${lvl}`);
				return { value: lvl, label, disabled: powercasting.used.has(lvl) };
			});

			if ( spellSlotOptions ) context.spellSlots = {
				field: new foundry.data.fields.StringField({ label: game.i18n.localize("DND5E.SpellCastUpcast") }),
				name: "spell.slot",
				value: _this.config.spell?.slot,
				options: spellSlotOptions
			};

			if ( !spellSlotOptions.some(o => !o.disabled) ) context.notes.push({
				type: "warn", message: game.i18n.format("DND5E.SpellCastNoSlotsLeft", {
					name: _this.item.name
				})
			});
		}
	});
	Hooks.on('sw5e.ActivityUsageDialog._prepareSubmitData', function (_this, result, config, ...args) {
		if (_this.item.system.preparation.mode !== "powerCasting") return;

		const submitData = result;
		if ( foundry.utils.hasProperty(submitData, "spell.slot") ) {
			const level = submitData.spell.slot ?? 0;
			const scaling = Math.max(0, level - _this.item.system.level);
			submitData.scaling = scaling;
		}
	});
}

function recoverPowerPoints() {
	Hooks.on("dnd5e.shortRest", (actor, config) => {
		for (const [castType, castConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			const points = actor.system.powercasting[castType].points;
			if (!castConfig.shortRest) continue;
			if (points.value === points.max) continue;
			actor.update({ [`system.powercasting.${castType}.points.value`]: points.max });
		}
	});
	Hooks.on("dnd5e.longRest", (actor, config) => {
		for (const [castType, castConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			const { value, max } = actor.system.powercasting[castType].points;
			if (value === max) continue;
			actor.update({ [`system.powercasting.${castType}.points.value`]: max });
		}
	});
}

function makePowerPointsConsumable() {
	Hooks.once("setup", function() {
		for (const castType of ["force", "tech"]) {
			CONFIG.DND5E.consumableResources.push(`powercasting.${castType}.points.value`);
		}
	});
}

export function patchPowercasting() {
	adjustItemSpellcastingGetter();
	patchItemSheet();
	patchPowerAbilityScore();
	patchPowerbooks();
	patchAbilityUseDialog();
	preparePowercasting();
	recoverPowerPoints();
	showPowercastingStats();
	makePowerPointsConsumable();
}
