import { getModuleId } from "../module-support.mjs";
import { getInstalledModBonus } from "../installed-mod-effects.mjs";

const { SchemaField } = foundry.data.fields;
const ABILITY_KEYS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
const FORCE_SCHOOL_VARIANTS = Object.freeze({ lgt: "light", drk: "dark" });

/**
 * @param {number} bonus
 * @returns {string|undefined}
 */
function formatBonusPart(bonus) {
	if ( !bonus ) return undefined;
	return bonus > 0 ? `+${bonus}` : `${bonus}`;
}

/**
 * @param {object} bonuses
 * @param {string} path
 * @param {object} rollData
 * @returns {number}
 */
function readBonus(bonuses, path, rollData, actor) {
	const { simplifyBonus } = dnd5e.utils;
	let total = simplifyBonus(foundry.utils.getProperty(bonuses, path), rollData);
	if ( actor ) total += getInstalledModBonus(actor, path, rollData);
	return total;
}

/**
 * @param {Item5e|object} item
 * @returns {"force"|"tech"}
 */
export function getPowerCastType(item) {
	return item?.system?.school === "tec" ? "tech" : "force";
}

/**
 * @param {Item5e|object} item
 * @returns {boolean}
 */
export function isPowerCastingItem(item) {
	return item?.type === "spell" && item?.system?.method === "powerCasting";
}

/**
 * @param {Actor5e} actor
 * @param {Item5e|object} item
 * @returns {number|null}
 */
export function getPreparedPowerDc(actor, item) {
	if ( !actor || !item?.system?.school ) return null;
	const castType = getPowerCastType(item);
	const school = item.system.school;
	const dc = actor.system?.powercasting?.[castType]?.schools?.[school]?.dc;
	return Number.isFinite(Number(dc)) ? Number(dc) : null;
}

/**
 * Aggregate force/tech power attack bonuses for a power item.
 * @param {Actor5e} actor
 * @param {Item5e|object} item
 * @param {object} rollData
 * @param {object} [options]
 * @param {string} [options.attackMode]
 * @returns {number}
 */
export function getPowerAttackBonus(actor, item, rollData, { attackMode } = {}) {
	if ( !actor || !isPowerCastingItem(item) ) return 0;

	const bonuses = actor.system?.bonuses ?? {};
	const castType = getPowerCastType(item);
	const school = item.system.school;
	let total = 0;

	if ( castType === "force" ) {
		total += readBonus(bonuses, "force.attack", rollData, actor);
		const variant = FORCE_SCHOOL_VARIANTS[school];
		if ( variant ) total += readBonus(bonuses, `force.${variant}.attack`, rollData, actor);
	} else {
		total += readBonus(bonuses, "tech.attack", rollData, actor);
	}

	const legacyType = getLegacyPowerAttackType(attackMode);
	if ( legacyType ) total += readBonus(bonuses, `${legacyType}.attack`, rollData, actor);

	return total;
}

/**
 * @param {string} [attackMode]
 * @returns {"mpak"|"rpak"|null}
 */
function getLegacyPowerAttackType(attackMode) {
	if ( attackMode?.startsWith?.("ranged") || attackMode === "thrown" ) return "rpak";
	if ( attackMode?.startsWith?.("melee") || !attackMode ) return "mpak";
	return null;
}

/**
 * Aggregate force/tech power save DC bonuses for actor preparation.
 * @param {Actor5e} actor
 * @param {"force"|"tech"} castType
 * @param {string} school
 * @param {string|null} abilityId
 * @param {object} rollData
 * @returns {number}
 */
export function getPowerDcBonus(actor, castType, school, abilityId, rollData) {
	const bonuses = actor?.system?.bonuses ?? {};
	let total = 0;

	if ( castType === "force" ) {
		total += readBonus(bonuses, "force.dc", rollData);
		total += readBonus(bonuses, "power.dc", rollData);
		total += readBonus(bonuses, "power.dc.all", rollData);
		total += readBonus(bonuses, `power.dc.${school}`, rollData);

		if ( school === "lgt" ) total += readBonus(bonuses, "power.forceLightDC", rollData);
		else if ( school === "drk" ) total += readBonus(bonuses, "power.forceDarkDC", rollData);
		else if ( school === "uni" ) total += readBonus(bonuses, "power.forceUnivDC", rollData);

		const variant = FORCE_SCHOOL_VARIANTS[school];
		if ( variant ) total += readBonus(bonuses, `force.${variant}.dc`, rollData);

		if ( abilityId ) {
			total += readBonus(bonuses, `force.${abilityId}.dc`, rollData);
			if ( variant ) total += readBonus(bonuses, `force.${variant}.${abilityId}.dc`, rollData);
		}
	} else if ( castType === "tech" ) {
		total += readBonus(bonuses, "tech.dc", rollData);
		total += readBonus(bonuses, "power.dc", rollData);
		total += readBonus(bonuses, "power.dc.all", rollData);
		total += readBonus(bonuses, "power.dc.tec", rollData);
		total += readBonus(bonuses, "power.techDC", rollData);

		if ( abilityId ) total += readBonus(bonuses, `tech.${abilityId}.dc`, rollData);
	}

	return total;
}

/**
 * Normalize save abilities from a SaveActivity to a string array.
 * @param {Iterable<string>|string[]|string|null|undefined} saveAbilities
 * @returns {string[]}
 */
export function normalizeSaveAbilities(saveAbilities) {
	if ( !saveAbilities ) return [];
	if ( typeof saveAbilities === "string" ) return ABILITY_KEYS.includes(saveAbilities) ? [saveAbilities] : [];
	const values = typeof saveAbilities?.[Symbol.iterator] === "function"
		? [...saveAbilities]
		: Array.isArray(saveAbilities) ? saveAbilities : [];
	return values.filter(ab => ABILITY_KEYS.includes(ab));
}

/**
 * Aggregate force/tech save DC bonuses keyed by the target saving throw ability.
 * When a save activity lists multiple abilities (e.g. Str or Con), the highest
 * matching bonus applies once so or-save powers are not double-counted.
 * @param {Actor5e} actor
 * @param {"force"|"tech"} castType
 * @param {Iterable<string>|string[]|string|null|undefined} saveAbilities
 * @param {object} rollData
 * @returns {number}
 */
export function getPowerSaveTargetDcBonus(actor, castType, saveAbilities, rollData) {
	if ( !actor || (castType !== "force" && castType !== "tech") ) return 0;

	const abilities = normalizeSaveAbilities(saveAbilities);
	if ( !abilities.length ) return 0;

	const bonuses = actor.system?.bonuses ?? {};
	const values = abilities.map(ab => readBonus(bonuses, `${castType}.save.${ab}.dc`, rollData, actor));
	return values.length ? Math.max(...values) : 0;
}

/**
 * Produce schema fields for save-target ability DC bonuses.
 * @returns {SchemaField}
 */
export function makeSaveTargetDcFields() {
	const FormulaField = game.dnd5e.dataModels.fields.FormulaField;
	return new SchemaField(
		Object.fromEntries(ABILITY_KEYS.map(key => [
			key,
			new SchemaField({
				dc: new FormulaField({
					required: true,
					deterministic: true,
					label: `SW5E.Bonus${key.toUpperCase()}SaveTargetPowerDC`
				})
			})
		])),
		{ label: "SW5E.BonusSaveTargetPowerDC" }
	);
}

/**
 * Produce schema fields for ability-specific DC bonuses.
 * @returns {object}
 */
export function makeAbilityDcFields() {
	const FormulaField = game.dnd5e.dataModels.fields.FormulaField;
	return Object.fromEntries(ABILITY_KEYS.map(key => [
		key,
		new SchemaField({
			dc: new FormulaField({ required: true, deterministic: true, label: `SW5E.Bonus${key.toUpperCase()}PowerDC` })
		})
	]));
}

/**
 * Produce schema fields for a force/tech school variant (light/dark).
 * @returns {SchemaField}
 */
export function makeForceSchoolVariantFields() {
	const FormulaField = game.dnd5e.dataModels.fields.FormulaField;
	return new SchemaField({
		attack: new FormulaField({ required: true, deterministic: true, label: "SW5E.BonusPowerAttack" }),
		dc: new FormulaField({ required: true, deterministic: true, label: "SW5E.BonusPowerDC" }),
		...makeAbilityDcFields()
	});
}

/**
 * Produce schema fields for force or tech casting bonuses.
 * @param {"force"|"tech"} castType
 * @returns {SchemaField}
 */
export function makeCastBonusFields(castType) {
	const FormulaField = game.dnd5e.dataModels.fields.FormulaField;
	const labelPrefix = castType === "force" ? "SW5E.BonusForce" : "SW5E.BonusTech";
	const fields = {
		attack: new FormulaField({ required: true, deterministic: true, label: `${labelPrefix}Attack` }),
		dc: new FormulaField({ required: true, deterministic: true, label: `${labelPrefix}DC` }),
		save: makeSaveTargetDcFields(),
		...makeAbilityDcFields()
	};

	if ( castType === "force" ) {
		fields.light = makeForceSchoolVariantFields();
		fields.dark = makeForceSchoolVariantFields();
	}

	return new SchemaField(fields, { label: labelPrefix });
}

/**
 * Produce legacy SW5E power bonus schema fields.
 * @returns {SchemaField}
 */
export function makeLegacyPowerBonusFields() {
	const FormulaField = game.dnd5e.dataModels.fields.FormulaField;
	return new SchemaField({
		dc: new FormulaField({ required: true, deterministic: true, label: "SW5E.BonusPowerDC" }),
		forceLightDC: new FormulaField({ required: true, deterministic: true, label: "SW5E.BonusForceLightPowerDC" }),
		forceUnivDC: new FormulaField({ required: true, deterministic: true, label: "SW5E.BonusForceUnivPowerDC" }),
		forceDarkDC: new FormulaField({ required: true, deterministic: true, label: "SW5E.BonusForceDarkPowerDC" }),
		techDC: new FormulaField({ required: true, deterministic: true, label: "SW5E.BonusTechPowerDC" })
	}, { label: "SW5E.BonusPower" });
}

/**
 * Produce legacy melee/ranged power attack bonus schema fields.
 * @param {object} schemaOptions
 * @returns {SchemaField}
 */
export function makeLegacyPowerAttackFields(schemaOptions = {}) {
	const FormulaField = game.dnd5e.dataModels.fields.FormulaField;
	return new SchemaField({
		attack: new FormulaField({ required: true, label: "SW5E.BonusAttack" }),
		damage: new FormulaField({ required: true, label: "SW5E.BonusDamage" })
	}, schemaOptions);
}

function registerWrapper(id, callback, mode = "WRAPPER") {
	try {
		libWrapper.register(getModuleId(), id, callback, mode);
		return true;
	} catch ( err ) {
		console.warn(`SW5E | Skipping incompatible power bonus wrapper '${id}'.`, err);
		return false;
	}
}

function patchPowerAttackBonuses() {
	registerWrapper("dnd5e.documents.activity.AttackActivity.prototype.getAttackData", function (wrapped, config = {}) {
		const result = wrapped(config);
		const item = this.item;
		if ( !isPowerCastingItem(item) ) return result;

		const rollData = this.getRollData();
		const attackMode = config?.attackMode ?? this.item.getFlag?.("dnd5e", `last.${this.id}.attackMode`);
		const bonus = getPowerAttackBonus(this.actor, item, rollData, { attackMode });
		const part = formatBonusPart(bonus);
		if ( part ) result.parts.push(part);
		return result;
	});
}

function patchPowerSaveDc() {
	registerWrapper("dnd5e.documents.activity.SaveActivity.prototype.prepareFinalData", function (wrapped, rollData) {
		rollData ??= this.getRollData({ deterministic: true });
		wrapped(rollData);

		const item = this.item;
		if ( !isPowerCastingItem(item) || !this.save?.ability ) return;

		const preparedDc = getPreparedPowerDc(this.actor, item);
		if ( !Number.isFinite(preparedDc) ) return;

		const castType = getPowerCastType(item);
		const saveTargetBonus = getPowerSaveTargetDcBonus(this.actor, castType, this.save.ability, rollData);
		this.save.dc.value = preparedDc + saveTargetBonus;

		const ability = this.ability;
		if ( this.save.dc.value ) {
			this.labels.save = game.i18n.format("DND5E.SaveDC", {
				dc: this.save.dc.value,
				ability: CONFIG.DND5E.abilities[ability]?.label ?? ""
			});
		}
	});
}

/** @returns {readonly string[]} */
export function getPowerBonusEffectKeys() {
	const castingAbilityKeys = ABILITY_KEYS.flatMap(ab => [
		`system.bonuses.force.${ab}.dc`,
		`system.bonuses.tech.${ab}.dc`,
		`system.bonuses.force.light.${ab}.dc`,
		`system.bonuses.force.dark.${ab}.dc`
	]);
	const saveTargetKeys = ABILITY_KEYS.flatMap(ab => [
		`system.bonuses.force.save.${ab}.dc`,
		`system.bonuses.tech.save.${ab}.dc`
	]);

	return Object.freeze([
		"system.bonuses.force.attack",
		"system.bonuses.force.dc",
		"system.bonuses.force.light.attack",
		"system.bonuses.force.light.dc",
		"system.bonuses.force.dark.attack",
		"system.bonuses.force.dark.dc",
		"system.bonuses.tech.attack",
		"system.bonuses.tech.dc",
		"system.bonuses.mpak.attack",
		"system.bonuses.rpak.attack",
		"system.bonuses.power.dc",
		"system.bonuses.power.forceLightDC",
		"system.bonuses.power.forceDarkDC",
		"system.bonuses.power.forceUnivDC",
		"system.bonuses.power.techDC",
		...castingAbilityKeys,
		...saveTargetKeys
	]);
}

export function patchPowerBonuses() {
	patchPowerAttackBonuses();
	patchPowerSaveDc();
}
