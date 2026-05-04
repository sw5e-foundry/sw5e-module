import { getBestAbility } from "./../utils.mjs";
import { getModuleType, getModuleTypeCandidates, isModuleType, normalizeModuleType, SETTINGS_NAMESPACE} from "../module-support.mjs";

const PRECALCULATED_SPELLCASTING_KEY = "sw5e-preCalculatedSpellcastingClasses";
const MANEUVER_TYPE = getModuleType("maneuver");
const SUPERIORITY_SYNC_KEY = "sw5eSuperioritySync";
const SUPERIORITY_SYNC_PROMISE_KEY = "sw5eSuperioritySyncPromise";

function getActorManeuvers(actor) {
	return getModuleTypeCandidates("maneuver").flatMap(type => actor.itemTypes?.[type] ?? []);
}

function capitalize(text) {
	return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function clampResourceValue(value, max) {
	const numericValue = Number.isFinite(Number(value)) ? Number(value) : 0;
	const numericMax = Math.max(0, Number.isFinite(Number(max)) ? Number(max) : 0);
	return Math.min(Math.max(numericValue, 0), numericMax);
}

function queueSuperioritySync(actor, updateData) {
	if ( !actor?.update || foundry.utils.isEmpty(updateData) ) return;

	const pendingUpdate = actor[SUPERIORITY_SYNC_KEY]
		? foundry.utils.mergeObject(actor[SUPERIORITY_SYNC_KEY], updateData, { inplace: false })
		: updateData;
	actor[SUPERIORITY_SYNC_KEY] = pendingUpdate;
	if ( actor[SUPERIORITY_SYNC_PROMISE_KEY] ) return;

	actor[SUPERIORITY_SYNC_PROMISE_KEY] = Promise.resolve()
		.then(async () => {
			const pending = actor[SUPERIORITY_SYNC_KEY];
			delete actor[SUPERIORITY_SYNC_KEY];
			if ( foundry.utils.isEmpty(pending) ) return;
			const canPersistUpdate = actor.id && actor.collection?.has?.(actor.id) && !actor.isToken;
			if ( canPersistUpdate ) await actor.update(pending, { render: false });
			else actor.updateSource?.(pending);
		})
		.catch(err => console.error("SW5E | Failed to synchronize superiority resource.", err))
		.finally(() => delete actor[SUPERIORITY_SYNC_PROMISE_KEY]);
}

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

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
		const sourceSuperiority = _this._source?.system?.superiority ?? {};
		const superiorityFlags = _this.flags?.sw5e?.superiority ?? {};

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
				for (const pwr of getActorManeuvers(_this) ?? []) {
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
			const sourceKnown = sourceSuperiority.known ?? {};
			const sourceDice = sourceSuperiority.dice ?? {};
			const effectiveKnownMax = sourceKnown.max ?? obj.maneuversKnownMax;
			const effectiveDiceMax = sourceDice.max ?? obj.diceCount;
			const effectiveDie = sourceSuperiority.die ?? obj.diceSize;
			const effectiveLevel = sourceSuperiority.level ?? obj.casterLevel;
			const sourceCurrentValue = Number.isFinite(Number(sourceDice.value)) ? Number(sourceDice.value) : null;
			const previousMax = Number.isFinite(Number(superiorityFlags.diceMax)) ? Number(superiorityFlags.diceMax) : null;
			const missingProgressData = [sourceDice.max, sourceSuperiority.die, sourceSuperiority.level].every(value => value == null);
			let effectiveCurrentValue = sourceCurrentValue;

			if ( effectiveDiceMax <= 0 ) effectiveCurrentValue = 0;
			else if ( sourceCurrentValue == null ) effectiveCurrentValue = effectiveDiceMax;
			else if ( (previousMax == null) && (sourceCurrentValue === 0) && missingProgressData ) {
				// Existing actors from the broken state had no persisted superiority resource, only the default zero value.
				effectiveCurrentValue = effectiveDiceMax;
			} else if ( (previousMax != null) && (previousMax !== effectiveDiceMax) ) {
				// Preserve spent dice while still granting newly gained dice on level-up.
				effectiveCurrentValue = clampResourceValue(sourceCurrentValue + (effectiveDiceMax - previousMax), effectiveDiceMax);
			} else {
				effectiveCurrentValue = clampResourceValue(sourceCurrentValue, effectiveDiceMax);
			}

			target.known.value = obj.maneuversKnownCur;
			target.known.max = effectiveKnownMax;
			target.dice.max = effectiveDiceMax;
			target.dice.value = effectiveCurrentValue;
			target.die = effectiveDie;
			target.level = effectiveLevel;

			const updateData = {};
			if ( previousMax !== effectiveDiceMax ) updateData["flags.sw5e.superiority.diceMax"] = effectiveDiceMax;
			if ( sourceCurrentValue !== effectiveCurrentValue ) updateData["system.superiority.dice.value"] = effectiveCurrentValue;
			queueSuperioritySync(_this, updateData);
		}

		const { simplifyBonus } = dnd5e.utils;
		const rollData = _this.getRollData();

		const { attributes, superiority } = _this.system;
		const base = 8 + (attributes.prof ?? 0);

		// TODO: Add rules
		// // Simplified forcecasting rule
		if (game.settings.get(SETTINGS_NAMESPACE , "simplifiedForcecasting")) {
			CONFIG.DND5E.superiority.types.physical.attr = CONFIG.DND5E.superiority.types.general.attr;
			CONFIG.DND5E.superiority.types.mental.attr = CONFIG.DND5E.superiority.types.general.attr;
		}

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
	/*
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
	*/
}

function patchItemSheet() {
	Hooks.on("renderItemSheet5e", (app, html, data) => {
		const root = getHtmlRoot(html);
		if ( !root || !app.item?.system?.spellcasting ) return;
		root.querySelectorAll(`select[name|='system.spellcasting.progression']`).forEach((el, idx) => {
			const root = el.parentNode.parentNode;
			if ( !root?.nextElementSibling ) return;
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
		_this[PRECALCULATED_SPELLCASTING_KEY] = _this._spellcastingClasses !== undefined;
	});
	Hooks.on('sw5e.Actor5e.spellcastingClasses', function (_this, result, config, ...args) {
		const preCalculated = _this[PRECALCULATED_SPELLCASTING_KEY];
		delete _this[PRECALCULATED_SPELLCASTING_KEY];

		if (preCalculated) return;
		for (const [identifier, cls] of Object.entries(_this.classes)) {
			if (cls.spellcasting && (cls.spellcasting.superiorityProgression !== "none")) result[identifier] = cls;
		}
	});
}

function patchPowerbooks() {
	Hooks.on('sw5e.ActorSheet5e._prepareSpellbook', function (_this, powerbook, config, ...args) {
		const [context] = args;
		const spellbook = config.result ?? powerbook ?? {};
		const columns = Object.values(spellbook)[0]?.columns ?? [];

		// Register a maneuver section using the modern dnd5e spellbook shape.
		const registerSection = (key, order, label, dataset) => {
			if ( key in spellbook ) return spellbook[key];
			const section = spellbook[key] = {
				label: game.i18n.localize(label),
				columns,
				order,
				usesSlots: false,
				id: key,
				slot: key,
				items: [],
				minWidth: 220,
				draggable: true,
				dataset: { type: MANEUVER_TYPE, ...dataset }
			};
			return section;
		};

		const superiorityBook = {};
		const superData = _this.actor.system.superiority;
		let idx = 1000;
		if (superData?.level) {
			for (const type of Object.keys(CONFIG.DND5E.superiority.types)) {
				const section = registerSection(`maneuvers-${type}`, idx++, `SW5E.Superiority.Type.${capitalize(type)}.Label`, { "type.value": type });
				superiorityBook[type] = section;
			}
		}

		// Iterate over every maneuver item, adding maneuvers to the powerbook by section
		getActorManeuvers(context.actor).forEach(maneuver => {
			const type = maneuver.system.type.value || "general";
			const key = `maneuvers-${type}`;

			// Sections for maneuvers which the caster "should not" have, but maneuver items exist for
			if (!superiorityBook[type]) {
				const section = registerSection(key, idx++, `SW5E.Superiority.Type.${capitalize(type)}.Label`, { "type.value": type });
				superiorityBook[type] = section;
			}

			// Add the maneuver to the relevant heading
			superiorityBook[type].items.push(maneuver);
		});

		config.result = Object.fromEntries(
			Object.entries(spellbook).sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
		);
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
	const tabs = game.dnd5e?.applications?.CompendiumBrowser?.TABS;
	if ( !tabs?.length || tabs.some(i => i.tab === "maneuvers") ) return;
	const idx = tabs.findIndex(i => i.tab === "spells");
	if ( idx === -1 ) return;
	tabs.splice(idx+1, 0, {
		tab: "maneuvers",
		label: "TYPES.Item.sw5e-module.maneuverPl",
		icon: "fas fa-tablet",
		documentClass: "Item",
		types: getModuleTypeCandidates("maneuver")
	});
}

function normalizeManeuverDropType() {
	Hooks.on("sw5e.preItem5e.fromDropData", (_cls, data) => {
		if ( !data ) return;
		if ( data.type ) data.type = normalizeModuleType(data.type, "maneuver");
		if ( data.data?.type ) data.data.type = normalizeModuleType(data.data.type, "maneuver");
	});
}

function excludeManeuversFromFeatures() {
	Hooks.on("sw5e.BaseActorSheet._assignItemCategories", (_this, result, config, item) => {
		if ( !isModuleType(item?.type, "maneuver") ) return;
		config.result = new Set();
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
	normalizeManeuverDropType();
	excludeManeuversFromFeatures();
}
