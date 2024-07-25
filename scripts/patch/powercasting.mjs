// dataModels file adds:
// - powercasting field to CreatureTemplate
// - spellcasting.force/techProgression to ClassData and SubclassData

function adjustItemSpellcastingGetter() {
	libWrapper.register('sw5e-module-test', 'dnd5e.documents.Item5e.prototype.spellcasting', function (wrapped, ...args) {
		const result = wrapped(...args);

		const spellcasting = this.system.spellcasting;
		if ( !spellcasting ) return null;
		const isSubclass = this.type === "subclass";
		const classSC = isSubclass ? this.class?.system?.spellcasting : spellcasting;
		const subclassSC = isSubclass ? spellcasting : this.subclass?.system?.spellcasting;
		for (const castType of ["force", "tech"]) {
			const prop = castType + "Progression"
			delete result[prop];
			const classPC = classSC?.[prop] ?? "none";
			const subclassPC = subclassSC?.[prop] ?? "none";
			if (subclassPC !== "none") result[castType] = subclassPC;
			else result[castType] = classPC;
		}

		return result;
	}, 'WRAPPER');
}

function preparePowercasting() {
	libWrapper.register('sw5e-module-test', 'dnd5e.documents.Actor5e.prototype._prepareSpellcasting', function (wrapped, ...args) {
		if (!this.system.spells) return;
		const isNPC = this.type === "npc";

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
				const level = this.system.details?.[`power${progression.castType.capitalize()}Level`];
				if (level) {
					progression.classes = 1;
					progression.points = level * typeConfig.progression.full.powerPoints;
					progression.casterLevel = level;
					progression.maxClassLevel = level;
					progression.maxClassProg = "full";
				}
			} else {
				// Translate the list of classes into power-casting progression
				for (const cls of this.itemTypes?.class ?? []) {
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
				for (const pwr of this.itemTypes?.spell ?? []) {
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
			const target = this.system.powercasting[castType];
			target.known.value = obj.powersKnownCur;
			target.known.max ??= obj.powersKnownMax;
			target.level ??= obj.casterLevel;
			target.limit ??= obj.limit;
			target.maxPowerLevel ??= obj.maxPowerLevel;
			target.points.max ??= obj.points;
		}

		const { simplifyBonus } = dnd5e.utils;
		const rollData = this.getRollData();

		const { abilities, attributes, powercasting } = this.system;
		const base = 8 + attributes.prof ?? 0;
		const lvl = Number(this.system.details?.level ?? this.system.details.cr ?? 0);

		// TODO: Add rules
		// // Simplified forcecasting rule
		// if (game.settings.get("sw5e", "simplifiedForcecasting")) {
		// 	CONFIG.DND5E.powerCasting.force.schools.lgt.attr = CONFIG.DND5E.powerCasting.force.schools.uni.attr;
		// 	CONFIG.DND5E.powerCasting.force.schools.drk.attr = CONFIG.DND5E.powerCasting.force.schools.uni.attr;
		// }

		// Powercasting DC for Actors and NPCs
		const ability = {};
		const bonusAll = simplifyBonus(this.system.bonuses?.power?.dc?.all, rollData);
		for (const [castType, typeConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			for (const [school, schoolConfig] of Object.entries(typeConfig.schools)) {
				const bonus = simplifyBonus(this.system.bonuses?.power?.dc?.[school], rollData) + bonusAll;
				for (const attr of schoolConfig.attr) {
					if (abilities[attr].mod > (ability[school]?.mod ?? -Infinity)) {
						ability[school] = {
							attr,
							mod: abilities[attr].mod
						}
					}
				}
				if (ability[school].mod > (ability[castType]?.mod ?? -Infinity)) ability[castType] = ability[school];
				powercasting[castType].schools[school].attr = ability[school]?.attr ?? "";
				powercasting[castType].schools[school].dc = base + (ability[school]?.mod ?? 0) + bonus;
			}
		}

		// Set Force and tech bonus points for PC Actors
		for (const [castType, typeConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			const cast = this.system.powercasting[castType];
			const castSource = this._source.system.powercasting[castType];

			if (castSource.points.max !== null) continue;
			if (cast.level === 0) continue;

			if (ability[castType]?.mod) cast.points.max += ability[castType].mod;

			const levelBonus = simplifyBonus(cast.points.bonuses.level ?? 0, rollData) * lvl;
			const overallBonus = simplifyBonus(cast.points.bonuses.overall ?? 0, rollData);
			const focus = this.focuses?.[CONFIG.DND5E.powerCasting[castType].focus.label];
			const focusProperty = CONFIG.DND5E.powerCasting[castType].focus.property;
			const focusBonus = focus?.flags?.["sw5e-module-test"]?.properties?.[focusProperty] ?? 0;

			cast.points.max += levelBonus + overallBonus + focusBonus;
		}

		return wrapped(...args);
	}, 'WRAPPER');
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
	libWrapper.register('sw5e-module-test', 'dnd5e.applications.actor.ActorSheet5eCharacter2.prototype.getData', async function (wrapped, ...args) {
		const context = await wrapped(...args);
		const msak = simplifyBonus(this.actor.system.bonuses.msak.attack, context.rollData);
		const rsak = simplifyBonus(this.actor.system.bonuses.rsak.attack, context.rollData);
		for (const castType of ["tech", "force"]) {
			const castData = this.actor.system.powercasting[castType];
			if (castData.level === 0) continue;
			const sc = castData.schools.tec ?? castData.schools.uni ?? {};
			const ability = this.actor.system.abilities[sc.attr];
			const mod = ability?.mod ?? 0;
			const attackBonus = msak === rsak ? msak : 0;
			context.spellcasting.push({
				label: game.i18n.localize(`SW5E.Powercasting.${castType.capitalize()}.Label`) + ` (${castData.points.value}/${castData.points.max})`,
				ability: { mod: ability?.mod ?? 0, ability: sc.attr ?? "" },
				attack: mod + this.actor.system.attributes.prof + attackBonus,
				primary: this.actor.system.attributes.spellcasting === sc.attr,
				save: ability?.dc ?? 0
			});
		}
		return context;
	}, 'WRAPPER');
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
	libWrapper.register('sw5e-module-test', 'dnd5e.documents.Actor5e.prototype.spellcastingClasses', function (wrapped, ...args) {
		const preCalculated = this._spellcastingClasses !== undefined;
		const result = wrapped(...args);
		if (preCalculated) return result;
		for (const [identifier, cls] of Object.entries(this.classes)) for (const castType of ["force", "tech"]) {
			if (cls.spellcasting && (cls.spellcasting[`${castType}Progression`] !== "none")) result[identifier] = cls;
		}
		return result;
	}, 'WRAPPER');

	libWrapper.register('sw5e-module-test', 'dnd5e.dataModels.item.SpellData.prototype._typeAbilityMod', function (wrapped, ...args) {
		for (const [castType, typeConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			if (this.school in typeConfig.schools) {
				return this.parent.actor.system.powercasting[castType].schools[this.school].attr;
			}
		}
		return wrapped(...args);
	}, 'MIXED');
}

function patchAbilityUseDialog() {
	libWrapper.register('sw5e-module-test', 'dnd5e.applications.item.AbilityUseDialog._createResourceOptions', function (wrapped, ...args) {
		const result = wrapped(...args);
		const spell = args[0];
		const actor = spell?.actor;
		for (const [castType, typeConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			if (spell.system.school in typeConfig.schools) {
				const maxPowerLevel = actor.system.powercasting[castType].maxPowerLevel;
				const newResult = Object.fromEntries(Object.entries(result).filter(e => e[0] <= (maxPowerLevel+1)));
				return newResult;
			}
		}
		return result;
	}, 'WRAPPER');
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
	makePowerPointsConsumable();
	patchItemSheet();
	patchPowerAbilityScore();
	patchAbilityUseDialog();
	preparePowercasting();
	recoverPowerPoints();
	showPowercastingStats();
}
