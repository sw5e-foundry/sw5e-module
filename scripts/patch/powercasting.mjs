import { getBestAbility } from "./../utils.mjs";

// dataModels file adds:
// - powercasting field to CreatureTemplate
// - spellcasting.force/techProgression to ClassData and SubclassData

function adjustItemSpellcastingGetter() {
	Hooks.on('sw5e.Item5e.spellcasting', function (_this, result, config, ...args) {
		const spellcasting = _this.system.spellcasting;
		if (!spellcasting) return;
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
	Hooks.on("renderBaseActorSheet", function (app, html, context, options) {
		const actorItems = context.actor.toObject().items;
		const actorAbilities = context.actor.system.abilities;
		const powercastingCardsSection = html.querySelector(`section.tab[data-tab="spells"] section.top`);
		const dndSpellcastingCards = powercastingCardsSection.querySelectorAll("div.spellcasting.card:not(.sw5e)");
		dndSpellcastingCards.forEach(card => card.remove());

		// Powercasting Cards (Name + Ability Used)
		const forcecastingCards = [
			{ name: "Forcecasting (Light)", getAbility: () => "wis" },
			{ name: "Forcecasting (Dark)", getAbility: () => "cha" },
			{ name: "Forcecasting (Neutral)", getAbility: () => {
				if (actorAbilities.wis.value > actorAbilities.cha.value) return "wis";
				else return "cha";
			}},
		];
		const superiorityCards = [
			{ name: "Superiority (Mental)", getAbility: () => {
				const mentalAbilities = ["int", "wis", "cha"];
				const greater = {name: mentalAbilities[0], value: actorAbilities[mentalAbilities[0]].value};
				for (let i=1; i<mentalAbilities.length; i++) {
					const ability = mentalAbilities[i];
					if (actorAbilities[ability].value > greater.value) {
						greater.name = ability;
						greater.value = actorAbilities[ability].value;
					}
				}
				return greater.name;
			}},
			{ name: "Superiority (Physical)", getAbility: () => {
				const physicalAbilities = ["str", "dex", "con"];
				const greater = {name: physicalAbilities[0], value: actorAbilities[physicalAbilities[0]].value};
				for (let i=1; i<physicalAbilities.length; i++) {
					const ability = physicalAbilities[i];
					if (actorAbilities[ability].value > greater.value) {
						greater.name = ability;
						greater.value = actorAbilities[ability].value;
					}
				}
				return greater.name;
			}},
			{ name: "Superiority (General)", getAbility: () => {
				const allAbilities = ["str", "dex", "con", "int", "wis", "cha"];
				const greater = {name: allAbilities[0], value: actorAbilities[allAbilities[0]].value};
				for (let i=1; i<allAbilities.length; i++) {
					const ability = allAbilities[i];
					if (actorAbilities[ability].value > greater.value) {
						greater.name = ability;
						greater.value = actorAbilities[ability].value;
					}
				}
				return greater.name;
			}},
		];
		const techcastingCard = { name: "Techcasting", getAbility: () => "int" };

		const actorPowers = actorItems.filter(item => item.type === "spell");
		const actorClasses = actorItems.filter(item => item.type === "class");
		const actorManeuvers = actorItems.filter(item => item.type === "sw5e.maneuver");

		// Verification
		const hasSuperiority = (
			actorClasses.some(clss => clss.system.identifier === "scholar") || actorManeuvers.length > 0
		);
		const hasForcecasting = (
			actorClasses.some(clss => ["consular", "guardian", "sentinel"].includes(clss.system.identifier))
			||
			actorPowers.some(power => ["lgt", "drk", "uni"].includes(power.system.school))
		);
		const hasTechcasting = (
			actorClasses.some(clss => ["engineer", "scout"].includes(clss.system.identifier))
			||
			actorPowers.some(power => power.system.school === "tec")
		);

		// Rendering
		const powercastingCardsToRenderize = [];
		if (hasSuperiority) powercastingCardsToRenderize.push(...superiorityCards);
		if (hasForcecasting) powercastingCardsToRenderize.push(...forcecastingCards);
		if (hasTechcasting) powercastingCardsToRenderize.push(techcastingCard);

		powercastingCardsToRenderize.forEach(powercasting => {
			const powercastingCard = document.createElement("div");
			powercastingCard.classList.add("spellcasting", "card", "sw5e");
			const ability = powercasting.getAbility();
			powercastingCard.dataset.ability = ability;
			const powercastingAttackWithSymbol = actorAbilities[ability].attack >= 0 ? `+${actorAbilities[ability].attack}` : actorAbilities[ability].attack;
			powercastingCard.innerHTML = `
				<div class="header">
					<h3>${powercasting.name}</h3>
				</div>
				<div class="info">
					<div class="ability">
						<span class="label">Ability</span>
						<span class="value">${ability.toUpperCase()}</span>
					</div>
					<div class="attack">
						<span class="label">Attack</span>
						<span class="value">${powercastingAttackWithSymbol}</span>
					</div>
					<div class="save">
						<span class="label">Save</span>
						<span class="value">${actorAbilities[ability].dc}</span>
					</div>
				</div>
			`;
			powercastingCardsSection.appendChild(powercastingCard);
		});
	});

	/* // Old One:
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
	*/
}

function patchItemSheet() {
	Hooks.on("renderItemSheet5e", (app, html, data) => {
		for (const el of html.querySelectorAll(`select[name|='system.spellcasting.progression']`)) {
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
		}
	});
}

function patchPowerAbilityScore() {
	Hooks.on('sw5e.preActor5e.spellcastingClasses', function (_this, ...args) {
		_this['sw5e-preCalculatedSpellcastingClasses'] = _this._spellcastingClasses !== undefined;
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
		if (_this.parent.actor) {
			for (const [castType, castData] of Object.entries(_this.parent.actor.system?.powercasting ?? {})) {
				if (_this.school in castData.schools) {
					const abl = castData.schools[_this.school].attr;
					const ability = CONFIG.DND5E.abilities[abl]?.label?.toLowerCase();
					if (ability) context.defaultAbility = game.i18n.format("DND5E.DefaultSpecific", { default: ability });
				}
			}
		}
	});
	Hooks.on('sw5e.SpellData.availableAbilities', function (_this, result, config, ...args) {
		if (_this.ability) return;
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
	Hooks.on('sw5e.ActorSheet5e._prepareSpellbook', function (_this, spellbook, config, ...args) {
		// In dnd5e 5.x, _prepareSpellbook returns a plain object keyed by slot, not an array.
		const registerSection = (key, i, label) => {
			if (key in spellbook) return;
			spellbook[key] = {
				order: i,
				label: label,
				usesSlots: false,
				id: "powerCasting",
				slot: key,
				items: [],
				dataset: { level: i, method: "powerCasting", type: "spell" },
			};
		};

		for (const [castType, typeConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			const castData = _this.actor.system.powercasting[castType];
			if (castData.level === 0) continue;
			for (let lvl = 0; lvl <= castData.maxPowerLevel; lvl++) registerSection(`spell${lvl}`, lvl, CONFIG.DND5E.spellLevels[lvl]);
		}

		// Sort the spellbook object by section order
		config.result = Object.fromEntries(
			Object.entries(spellbook).sort(([, a], [, b]) => a.order - b.order)
		);
	});

	// In dnd5e 5.x, _onDropSpell no longer exists on actor sheets.
	// Use preCreateItem hook to intercept spell drops on powercasting actors.
	Hooks.on('preCreateItem', function (item, data, options, userId) {
		if (item.type !== "spell") return;
		const actor = item.parent;
		if (!actor || actor.documentName !== "Actor") return;

		const prep = data.system?.preparation;
		if (!prep || prep.mode !== "innate") return;

		// Determine if the actor is a powercaster.
		const isCaster = Object.values(actor.system.powercasting ?? {}).reduce(((acc, obj) => acc || !!obj.level), false);
		if (!isCaster) return;

		// Case 1: Drop a cantrip.
		if (data.system.level === 0) {
			item.updateSource({ "system.preparation.mode": "powerCasting" });
		}
		// Case 2: Drop a leveled spell.
		else if (actor.type !== "npc") {
			item.updateSource({ "system.preparation.mode": "powerCasting" });
		}
	});
}

function patchAbilityUseDialog() {
	Hooks.on('sw5e.ActivityUsageDialog._prepareScalingContext', function (_this, result, config, ...args) {
		const context = config.result;

		if (_this.activity.requiresSpellSlot && (_this.config.scaling !== false) && (_this.item.system.preparation.mode === "powerCasting")) {
			if (context.notes.length >= 1) {
				const note = context.notes[context.notes.length - 1];
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

			if (spellSlotOptions) context.spellSlots = {
				field: new foundry.data.fields.StringField({ label: game.i18n.localize("DND5E.SpellCastUpcast") }),
				name: "spell.slot",
				value: _this.config.spell?.slot,
				options: spellSlotOptions
			};

			if (!spellSlotOptions.some(o => !o.disabled)) context.notes.push({
				type: "warn", message: game.i18n.format("DND5E.SpellCastNoSlotsLeft", {
					name: _this.item.name
				})
			});
		}
	});
	Hooks.on('sw5e.ActivityUsageDialog._prepareSubmitData', function (_this, result, config, ...args) {
		if (_this.item.system.preparation?.mode !== "powerCasting") return;

		const submitData = result;
		if (foundry.utils.hasProperty(submitData, "spell.slot")) {
			const level = submitData.spell.slot ?? 0;
			const scaling = Math.max(0, level - _this.item.system.level);
			submitData.scaling = scaling;
		}
	});
	Hooks.on('dnd5e.activityConsumption', function (activity, usageConfig, messageConfig, updates) {
		if (activity?.item?.type !== "spell" || activity?.item?.system?.preparation?.mode !== "powerCasting") return;
		const powercastingType = activity?.item?.system?.school === "tec" ? "tech" : "force";
		const powercasting = activity?.actor?.system?.powercasting?.[powercastingType];
		const level = usageConfig?.spell?.slot ?? 0;
		if (level >= powercasting.limit) {
			powercasting.used.add(level);
			updates.actor[`system.powercasting.${powercastingType}.used`] = powercasting.used;
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
	Hooks.once("setup", function () {
		for (const castType of ["force", "tech"]) {
			CONFIG.DND5E.consumableResources.push(`powercasting.${castType}.points.value`);
		}
	});
}

function showPowercastingBar() {
	const { simplifyBonus } = dnd5e.utils;
	Hooks.on("renderCharacterActorSheet", (app, element, context, options) => {
		if (app.actor.type != "character" && app.actor.type != "npc") {
			return;
		}

		const hpHTML = element.querySelector('.meter-group');
		const powerCasting = app.actor.system.powercasting;

		// Add meters for the tech and force powercasting values. This
		// will be added right after the hit points meter.
		for (const castType of ["tech", "force"]) {
			if (powerCasting[castType].level > 0) {
				const castData = powerCasting[castType];
				const pointsLabel = game.i18n.localize(`SW5E.Powercasting.${castType.capitalize()}.Point.Label`);
				const value = castData.points.value;
				const temp = castData.points.temp ?? 0;
				const max = castData.points.max;
				const tempmax = castData.points.tempmax ?? 0;
				const effectiveMax = max + tempmax;
				const pct = (value / max) * 100;
				const castingHTMLMeter = `
					<div class="meter-group">
						<div class="label roboto-condensed-upper">
							<span>${pointsLabel}</span>
					` + (app.editable ? `
							<a class="config-button" data-action="hitPoints" data-tooltip="DND5E.HitPointsConfig"
							   aria-label="{{ localize "DND5E.HitPointsConfig" }}">
								<i class="fas fa-cog"></i>
							</a>
					` : '') + `
						</div>
						<div class="meter sectioned ${castType}-points">
							<div class="progress ${castType}-points
					` + ((castData.tempmax > 0) ? 'temp-positive' : (castData.tempmax < 0) ? 'temp-negative' : '') + `
								 "
								 role="meter" aria-valuemin="0" aria-valuenow="${value}"
								 aria-valuemax="${max}" style="--bar-percentage: ${pct}%">
								<div class="label">
									<span class="value">${value}</span>
									<span class="separator">&sol;</span>
									<span class="max">${effectiveMax}</span>
					` + (tempmax ? `
									<span class="bonus">${game.dnd5e.utils.formatNumber(tempmax, { signDisplay:"always" })}</span>
					` : '') + `
								</div>
								<input type="text" name="system.powercasting.${castType}.points.value" data-dtype="Number"
									   placeholder="0" value="${value}" hidden>
							</div>
							<div class="tmp">
								<input type="text" name="system.powercasting.${castType}.points.temp" data-dtype="Number"
									   placeholder="{{ localize "DND5E.TMP" }}" value="${temp}">
							</div>
						</div>
					</div>
				`;
				hpHTML.insertAdjacentHTML('afterend', castingHTMLMeter);
				const statsParent = hpHTML.parentNode;

				// Editable Only Listeners
				if (app.isEditable) {
					for (const el of statsParent.querySelectorAll(`.meter > .${castType}-points`))
						el.addEventListener("click", event => _toggleEditPoints(castType, event, true));
					for (const el of statsParent.querySelectorAll(`.meter > .${castType}-points > input`))
						el.addEventListener("blur", event => _toggleEditPoints(castType, event, false));
					// Input focus and update
					for (const el of statsParent.querySelectorAll("input"))
						el.addEventListener("focus", ev => ev.currentTarget.select());
					for (const el of statsParent.querySelectorAll('[type="text"][data-dtype="Number"]'))
						el.addEventListener("change", app._onChangeInputDelta.bind(app));
				}
			}
		}
	});
}

/**
 * Toggle editing points bar.
 * @param {string} pointType    The type of points.
 * @param {PointerEvent} event  The triggering event.
 * @param {boolean} edit        Whether to toggle to the edit state.
 * @protected
 */
function _toggleEditPoints(pointType, event, edit) {
	const target = event.currentTarget.closest(`.${pointType}-points`);
	const label = target.querySelector(":scope > .label");
	const input = target.querySelector(":scope > input");
	label.hidden = edit;
	input.hidden = !edit;
	if (edit) input.focus();
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
	showPowercastingBar();
}
