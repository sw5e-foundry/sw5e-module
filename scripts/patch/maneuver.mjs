import { getBestAbility } from "./../utils.mjs";
import {
	getModuleId,
	getModulePath,
	getModuleType,
	getModuleTypeCandidates,
	isModuleType,
	localizeOrFallback,
	normalizeModuleType,
	SETTINGS_NAMESPACE
} from "../module-support.mjs";
import { parseExplicitNullableNumber } from "../nullable-number.mjs";
import {
	enrichManeuverListRowContext,
	resolveManeuverSpellbookColumns
} from "../maneuver-powers-list-context.mjs";
import {
	getSuperiorityStylePoolGrant,
	hasSuperiorityStyleGrant,
	mergeSuperiorityDieDenomination,
	resolveSuperiorityStyleDie,
	shouldRecoverSuperiorityDice
} from "../superiority-style.mjs";

const PRECALCULATED_SPELLCASTING_KEY = "sw5e-preCalculatedSpellcastingClasses";
const MANEUVER_TYPE = getModuleType("maneuver");
const SUPERIORITY_SYNC_KEY = "sw5eSuperioritySync";
const SUPERIORITY_SYNC_PROMISE_KEY = "sw5eSuperioritySyncPromise";

/** Canonical Active Effect key for Superiority dice maximum (Bug 19A). */
export const SUPERIORITY_DICE_MAX_EFFECT_KEY = "system.superiority.dice.max";

/**
 * Foundry 14 prepared Active Effect change.type for ADD.
 * Other types targeting this key are deferred in Bug 19A
 * (no repository evidence for multiply/override/upgrade/downgrade/custom on this path).
 */
export const SUPERIORITY_DICE_MAX_ADD_TYPE = "add";

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

/**
 * Resolve the effective Superiority dice maximum from progression, explicit override, and ADD effects.
 * Does not read prepared `dice.max` and does not mutate Actor source.
 *
 * @param {object} options
 * @param {unknown} options.sourceMax Explicit persisted override (`null`/`undefined` = none; `0` is explicit).
 * @param {number} options.calculatedMax Class progression + supported bonuses (already non-negative preferred).
 * @param {number} [options.effectAdditions=0] Sum of applicable ADD changes for the canonical key.
 * @returns {number}
 */
export function resolveSuperiorityDiceMax({ sourceMax, calculatedMax, effectAdditions = 0 } = {}) {
	if ( sourceMax != null ) {
		const override = Number(sourceMax);
		if ( Number.isFinite(override) ) return Math.max(0, override);
	}
	const calculated = Number(calculatedMax);
	const additions = Number(effectAdditions);
	const base = Number.isFinite(calculated) ? calculated : 0;
	const delta = Number.isFinite(additions) ? additions : 0;
	return Math.max(0, base + delta);
}

/**
 * Sum finite numeric ADD changes targeting `system.superiority.dice.max` from an applicable-effects collection.
 * Each matching change is counted once. Disabled effects are skipped when `disabled === true`.
 * Unsupported types and invalid values are ignored (deferred / safe no-op).
 *
 * @param {Iterable<object>|object[]|null|undefined} effects
 * @returns {number}
 */
export function sumSuperiorityDiceMaxAdditions(effects) {
	if ( !effects ) return 0;

	let total = 0;
	for ( const effect of effects ) {
		if ( !effect || effect.disabled === true ) continue;
		const changes = effect.changes;
		if ( !Array.isArray(changes) ) continue;
		for ( const change of changes ) {
			if ( !change || change.key !== SUPERIORITY_DICE_MAX_EFFECT_KEY ) continue;
			const type = String(change.type ?? "").trim();
			if ( type !== SUPERIORITY_DICE_MAX_ADD_TYPE ) continue;
			const raw = change.value;
			if ( raw === "" || raw == null ) continue;
			const value = Number(raw);
			if ( !Number.isFinite(value) ) continue;
			total += value;
		}
	}
	return total;
}

/**
 * Collect Actor applicable effects for Superiority dice-max ADD summation.
 * @param {object} actor
 * @returns {Iterable<object>|object[]}
 */
function getApplicableSuperiorityEffects(actor) {
	if ( typeof actor?.allApplicableEffects === "function" ) return actor.allApplicableEffects();
	return actor?.effects ?? [];
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
		const sourceTypes = sourceSuperiority.types ?? {};

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
		const { simplifyBonus } = dnd5e.utils;
		const rollData = _this.getRollData();

		for (const [superType, obj] of Object.entries(charProgression)) {
			const superConfig = CONFIG.DND5E.superiority;
			const progConfig = superConfig.progression[obj.maxClassProg] ?? {};

			// What is the size of your power dice
			obj.diceSize = progConfig.size?.[obj.casterLevel];

			// Apply the calculated values to the sheet
			const target = _this.system.superiority;
			const sourceKnown = sourceSuperiority.known ?? {};
			const sourceDice = sourceSuperiority.dice ?? {};
			const preparedDice = target.dice ?? {};
			const baseDiceMax = obj.diceCount;
			const effectiveKnownMax = sourceKnown.max ?? obj.maneuversKnownMax;
			const hasStyleGrant = hasSuperiorityStyleGrant(_this);
			const stylePoolGrant = getSuperiorityStylePoolGrant(_this);
			const styleDie = resolveSuperiorityStyleDie(_this, hasStyleGrant);
			const classDie = obj.diceSize;
			const effectiveDie = mergeSuperiorityDieDenomination({
				sourceDie: sourceSuperiority.die,
				classDie,
				styleDie,
				hasStyleGrant
			});
			const effectiveLevel = sourceSuperiority.level ?? obj.casterLevel;
			const bonuses = preparedDice.bonuses ?? sourceDice.bonuses ?? {};
			const levelBonus = simplifyBonus(bonuses.level ?? 0, rollData) * effectiveLevel;
			const overallBonus = simplifyBonus(bonuses.overall ?? 0, rollData);
			const calculatedDiceMax = Math.max(0, baseDiceMax + levelBonus + overallBonus + stylePoolGrant);
			const effectAdditions = sumSuperiorityDiceMaxAdditions(getApplicableSuperiorityEffects(_this));
			const effectiveDiceMax = resolveSuperiorityDiceMax({
				sourceMax: sourceDice.max,
				calculatedMax: calculatedDiceMax,
				effectAdditions
			});
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

			_this._sw5eSuperiorityRuntime = {
				calculatedMax: calculatedDiceMax,
				calculatedDie: classDie,
				styleGrant: stylePoolGrant,
				styleDie,
				effectiveMax: effectiveDiceMax,
				effectiveDie
			};
		}

		const { attributes, superiority } = _this.system;
		const base = 8 + (attributes.prof ?? 0);

		// Superiority DC for Actors and NPCs
		// Simplified forcecasting: use general attrs locally (no CONFIG mutation).
		let simplifiedForcecasting = false;
		try {
			simplifiedForcecasting = Boolean(game.settings.get(SETTINGS_NAMESPACE, "simplifiedForcecasting"));
		} catch ( _err ) { /* settings not ready */ }
		const generalSuperiorityAttr = CONFIG.DND5E.superiority?.types?.general?.attr;

		const superConfig = CONFIG.DND5E.superiority;
		const bonusAll = simplifyBonus(_this.system.bonuses?.superiority?.dc?.all, rollData);
		for (const [type, typeConfig] of Object.entries(superConfig.types)) {
			const typeData = superiority.types[type];
			const bonus = simplifyBonus(_this.system.bonuses?.superiority?.dc?.[type], rollData) + bonusAll;
			const sourceType = sourceTypes?.[type] ?? {};
			const attrList = (simplifiedForcecasting && (type === "physical" || type === "mental") && generalSuperiorityAttr)
				? generalSuperiorityAttr
				: typeConfig.attr;
			const best = getBestAbility(_this, attrList, 0);
			const overrideAttr = sourceType.attr;
			const resolvedAttr = (overrideAttr && _this.system.abilities?.[overrideAttr]) ? overrideAttr : best.id;
			const resolvedMod = Number.isFinite(Number(_this.system.abilities?.[resolvedAttr]?.mod))
				? Number(_this.system.abilities[resolvedAttr].mod)
				: best.mod;
			typeData.attr = resolvedAttr;
			typeData.dc = resolveSuperiorityTypeDc(sourceType.dc, base, resolvedMod, bonus);
		}
	});
}

/**
 * Resolve a superiority type DC from a raw source override value.
 * Absent sources (null/undefined/"" / whitespace) use the calculated formula.
 * Explicit numeric zero is preserved.
 * @param {unknown} sourceDc
 * @param {number} base
 * @param {number} resolvedMod
 * @param {number} bonus
 * @returns {number}
 */
export function resolveSuperiorityTypeDc(sourceDc, base, resolvedMod, bonus) {
	const overrideDc = parseExplicitNullableNumber(sourceDc);
	if ( overrideDc !== null ) return overrideDc;
	return base + resolvedMod + bonus;
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
		const existingColumns = Object.values(spellbook)[0]?.columns ?? [];
		const columns = resolveManeuverSpellbookColumns(existingColumns, _this);

		// Register a maneuver section using the modern dnd5e spellbook shape.
		const registerSection = (key, order, label, dataset) => {
			if ( key in spellbook ) return spellbook[key];
			const fallbackLabel = capitalize(dataset?.["type.value"] ?? key);
			const section = spellbook[key] = {
				label: localizeOrFallback(label, fallbackLabel),
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
	Hooks.on("dnd5e.shortRest", (actor, config) => {
		if ( !shouldRecoverSuperiorityDice(actor) ) return;
		actor.update({ "system.superiority.dice.value": actor.system.superiority.dice.max });
	});
	Hooks.on("dnd5e.longRest", (actor, config) => {
		if ( !shouldRecoverSuperiorityDice(actor) ) return;
		actor.update({ "system.superiority.dice.value": actor.system.superiority.dice.max });
	});
}

function makeSuperiorityDiceConsumable() {
	Hooks.once("setup", function() { CONFIG.DND5E.consumableResources.push(`superiority.dice.value`); });
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

/**
 * After stock feature list-row prep, add Force/Tech-shaped Time/Range ctx for Maneuvers (Bug 25).
 */
function patchManeuverPowersListRowContext() {
	const target = "dnd5e.applications.actor.BaseActorSheet.prototype._prepareItemFeature";
	try {
		libWrapper.register(getModuleId(), target, async function(wrapped, item, ctx) {
			const result = await wrapped(item, ctx);
			if ( isModuleType(item?.type, "maneuver") ) enrichManeuverListRowContext(item, ctx);
			return result;
		}, "WRAPPER");
	} catch ( err ) {
		console.warn("SW5E | Could not wrap BaseActorSheet._prepareItemFeature for Maneuver Powers-tab columns.", err);
	}
}

/**
 * Resolve the Heal Activity ability **key** for Maneuver `@mod` (Bug 27B).
 * Returns an ability identifier such as `"int"` / `"cha"`, never a numeric modifier.
 * Invalid / missing fallback keys preserve stock behavior (`null` when base is absent).
 *
 * @param {object} options
 * @param {unknown} options.baseAbility Stock `HealActivity.ability` value.
 * @param {boolean} options.itemIsManeuver Whether the parent Item is a Maneuver.
 * @param {unknown} options.itemAbilityMod Item `abilityMod` — must be an ability key string.
 * @param {object|null|undefined} options.actorAbilities `actor.system.abilities`.
 * @returns {string|null|*} Ability key, stock base when non-string stock value, or `null`.
 */
export function resolveManeuverHealActivityAbility({
	baseAbility,
	itemIsManeuver,
	itemAbilityMod,
	actorAbilities
} = {}) {
	if ( typeof baseAbility === "string" ) {
		const trimmed = baseAbility.trim();
		if ( trimmed ) return trimmed;
	} else if ( baseAbility != null ) {
		return baseAbility;
	}

	if ( !itemIsManeuver ) return null;

	if ( typeof itemAbilityMod !== "string" ) return null;
	const key = itemAbilityMod.trim();
	if ( !key ) return null;
	if ( !actorAbilities || !(key in actorAbilities) ) return null;
	return key;
}

/**
 * Bug 27B Path A: wrap HealActivity.ability so Maneuver Heals fall back to item.abilityMod
 * (ability key). Proven in Foundry v13 / dnd5e 5.2.5 — libWrapper intercepts the inherited
 * BaseActivityData getter via HealActivity.prototype.ability. No descriptor monkey-patch.
 */
function patchHealActivityAbility() {
	const target = "dnd5e.documents.activity.HealActivity.prototype.ability";
	try {
		libWrapper.register(getModuleId(), target, function(wrapped) {
			const baseAbility = wrapped();
			const item = this.item;
			const itemIsManeuver = isModuleType(item?.type, "maneuver");
			const itemAbilityMod = item?.abilityMod;
			const actorAbilities = this.actor?.system?.abilities;
			const resolved = resolveManeuverHealActivityAbility({
				baseAbility,
				itemIsManeuver,
				itemAbilityMod,
				actorAbilities
			});

			const baseAbsent = !(typeof baseAbility === "string" && baseAbility.trim())
				&& (baseAbility == null || baseAbility === "");
			if ( itemIsManeuver && baseAbsent && resolved == null && itemAbilityMod != null && itemAbilityMod !== "" ) {
				console.debug("SW5E | Maneuver Heal ability fallback rejected; preserving stock ability.", {
					itemId: item?.id,
					itemName: item?.name,
					itemAbilityMod,
					itemAbilityModType: typeof itemAbilityMod,
					hasActorAbility: typeof itemAbilityMod === "string"
						&& !!(actorAbilities && itemAbilityMod.trim() in actorAbilities)
				});
			}

			return resolved;
		}, "WRAPPER");
	} catch ( err ) {
		console.warn("SW5E | Could not wrap HealActivity.prototype.ability for Maneuver @mod (Bug 27B).", err);
	}
}

/**
 * Ensure the Maneuver type-icon column template is available on Powers-tab sheet parts.
 * Inventory rows resolve columns via Handlebars partials keyed by the full `.hbs` path.
 */
function registerManeuverTypeColumnTemplate() {
	const template = getModulePath("templates/inventory/columns/maneuver-type.hbs");
	const sheets = [
		globalThis.dnd5e?.applications?.actor?.CharacterActorSheet,
		globalThis.dnd5e?.applications?.actor?.NPCActorSheet,
		globalThis.dnd5e?.applications?.actor?.BaseActorSheet
	].filter(Boolean);

	for ( const Sheet of sheets ) {
		const part = Sheet.PARTS?.spells;
		if ( !part ) continue;
		part.templates ??= [];
		if ( !part.templates.includes(template) ) part.templates.push(template);
	}
}

export function patchManeuver() {
	registerManeuverTypeColumnTemplate();
	adjustItemSpellcastingGetter();
	patchItemSheet();
	patchPowerAbilityScore();
	patchPowerbooks();
	patchManeuverPowersListRowContext();
	patchHealActivityAbility();
	prepareSuperiority();
	recoverSuperiorityDice();
	showPowercastingStats();
	makeSuperiorityDiceConsumable();
	addCompendiumBrowserTab();
	normalizeManeuverDropType();
	excludeManeuversFromFeatures();
}
