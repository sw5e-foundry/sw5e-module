import { getBestAbility } from "./../../utils.mjs";

/**
 * Resolve maneuver save activities for preparation without assuming dnd5e's ActivitiesCollection API.
 *
 * Legacy embedded `sw5e-module.maneuver` items may prepare with `system.activities` as a plain object
 * that lacks `getByType` on dnd5e 5.2.5 world load. Calling `getByType("save")` or iterating its result
 * then throws (`object is not iterable`). This helper is read-only: it does not mutate item data.
 * Migration/normalization of stale embedded maneuvers may be handled separately.
 *
 * @param {unknown} activities  Prepared `this.activities` from ManeuverData / ActivitiesTemplate.
 * @returns {object[]}  Activity-shaped documents entries suitable for superiority DC patching / favorites.
 */
function maneuverSaveActivitiesAsArray(activities) {
	if (!activities) return [];

	const getByType = activities.getByType;
	if (typeof getByType === "function") {
		let slice;
		try {
			slice = getByType.call(activities, "save");
		} catch {
			return [];
		}
		if (slice == null) return [];
		if (typeof slice[Symbol.iterator] === "function") return [...slice];
		return [];
	}

	if (typeof activities !== "object" || Array.isArray(activities)) return [];
	return Object.values(activities).filter(
		a => a && typeof a === "object" && !Array.isArray(a) && a.type === "save"
	);
}

const { ItemDataModel } = globalThis.dnd5e.dataModels.abstract;
const { ActivitiesTemplate, ItemDescriptionTemplate, ItemTypeTemplate, ItemTypeField } = globalThis.dnd5e.dataModels.item;
const { ActivationField, DurationField, RangeField, TargetField } = globalThis.dnd5e.dataModels.shared;

const { BooleanField, NumberField, SchemaField, SetField, StringField } = foundry.data.fields;

/**
 * Data definition for Maneuver items.
 * @mixes ItemDescriptionTemplate
 * @mixes ItemTypeTemplate
 * @mixes ActivitiesTemplate
 *
 * @property {string} ability                    Override of default superiority 'casting' ability.
 * @property {ActivationData} activation         Casting time & conditions.
 * @property {DurationData} duration             Duration of the maneuver effect.
 * @property {Set<string>} properties            General properties of a maneuver item.
 * @property {RangeData} range                   Range of the maneuver.
 * @property {string} sourceClass                Associated superiority class when this maneuver is on an actor.
 * @property {TargetData} target                 Information on area and individual targets.
 */
export default class ManeuverData extends ItemDataModel.mixin(ItemDescriptionTemplate, ItemTypeTemplate, ActivitiesTemplate) {
	/* -------------------------------------------- */
	/*  Model Configuration                         */
	/* -------------------------------------------- */

	/** @override */
	static LOCALIZATION_PREFIXES = [
		"DND5E.ACTIVATION", "DND5E.DURATION", "DND5E.RANGE", "DND5E.SOURCE", "DND5E.TARGET"
	];

	/* -------------------------------------------- */

	/** @inheritdoc */
	static defineSchema() {
		return this.mergeSchema(super.defineSchema(), {
			type: new ItemTypeField({ baseItem: false }, { label: "SW5E.Superiority.Type.Label" }),
			ability: new StringField({ label: "SW5E.Maneuver.AbilityOverride" }),
			activation: new ActivationField(),
			duration: new DurationField(),
			properties: new SetField(new StringField(), { label: "SW5E.Maneuver.Properties" }),
			range: new RangeField(),
			sourceClass: new StringField({ label: "SW5E.Maneuver.SourceClass" }),
			target: new TargetField()
		});
	}

	/* -------------------------------------------- */

	/** @override */
	static get compendiumBrowserFilters() {
		return new Map([
			["type", {
				label: "SW5E.Superiority.Type.Label",
				type: "set",
				config: {
					choices: CONFIG.DND5E.superiority.types,
					keyPath: "system.type.value"
				}
			}],
			["properties", this.compendiumBrowserPropertiesFilter("maneuver")]
		]);
	}

	/* -------------------------------------------- */
	/*  Data Migrations                             */
	/* -------------------------------------------- */

	/** @inheritDoc */
	static _migrateData(source) {
		super._migrateData(source);
		ActivitiesTemplate.migrateActivities(source);
		ManeuverData.#migrateActivation(source);
		ManeuverData.#migrateTarget(source);
		ManeuverData.#migrateSourceClass(source);
		ManeuverData.#migrateTargetPrompt(source);
	}

	/**
	 * Migrate activation data.
	 * Added in DnD5e 4.0.0.
	 * @param {object} source  The candidate source data from which the model will be constructed.
	 */
	static #migrateActivation(source) {
		if (source.activation?.cost) source.activation.value = source.activation.cost;
	}

	/* -------------------------------------------- */

	/**
	 * Migrate target data.
	 * Added in DnD5e 4.0.0.
	 * @param {object} source  The candidate source data from which the model will be constructed.
	 */
	static #migrateTarget(source) {
		if (!("target" in source)) return;
		source.target.affects ??= {};
		source.target.template ??= {};

		if ("units" in source.target) source.target.template.units = source.target.units;
		if ("width" in source.target) source.target.template.width = source.target.width;

		const type = source.target.type ?? source.target.template.type ?? source.target.affects.type;
		if (type in CONFIG.DND5E.areaTargetTypes) {
			if ("type" in source.target) source.target.template.type = type;
			if ("value" in source.target) source.target.template.size = source.target.value;
		} else if (type in CONFIG.DND5E.individualTargetTypes) {
			if ("type" in source.target) source.target.affects.type = type;
			if ("value" in source.target) source.target.affects.count = source.target.value;
		}
	}

	/* -------------------------------------------- */

	/**
	 * Migrate malformed source class data.
	 * @param {object} source  The candidate source data from which the model will be constructed.
	 */
	static #migrateSourceClass(source) {
		if ( !("sourceClass" in source) ) return;
		const current = source.sourceClass;
		if ( current === "[object Object]" ) {
			source.sourceClass = "";
			return;
		}
		if ( current && (typeof current === "object") && !Array.isArray(current) ) {
			source.sourceClass = current.system?.identifier ?? current.identifier ?? current.value ?? "";
			return;
		}
		if ( (current !== undefined) && (current !== null) && (typeof current !== "string") ) source.sourceClass = "";
	}

	/* -------------------------------------------- */

	/**
	 * Clear stale target prompts for non-area maneuvers.
	 * @param {object} source  The candidate source data from which the model will be constructed.
	 */
	static #migrateTargetPrompt(source) {
		if ( source.target?.prompt !== true ) return;
		const activities = Array.isArray(source.activities) ? source.activities : Object.values(source.activities ?? {});
		const hasMeasuredTemplate = activities.some(activity => {
			const template = activity?.target?.template;
			if ( template === true ) return true;
			if ( template && (typeof template === "object") && !Array.isArray(template) ) {
				const templateType = template.type;
				if ( typeof templateType === "string" && templateType && (templateType in CONFIG.DND5E.areaTargetTypes) ) return true;
				const templateSize = Number(template.size ?? template.value);
				if ( Number.isFinite(templateSize) && (templateSize > 0) ) return true;
				const templateWidth = Number(template.width);
				if ( Number.isFinite(templateWidth) && (templateWidth > 0) ) return true;
			}
			return activity?.target?.affects?.type === "area";
		});
		if ( !hasMeasuredTemplate ) source.target.prompt = false;
	}

	/* -------------------------------------------- */
	/*  Data Preparation                            */
	/* -------------------------------------------- */

	/** @inheritDoc */
	prepareDerivedData() {
		super.prepareDerivedData();
		this.prepareDescriptionData();

		this.duration.concentration = this.properties.has("concentration");

		const labels = this.parent.labels ??= {};
		labels.type = CONFIG.DND5E.superiority.types[this.type.value]?.label;

		labels.properties = this.properties.reduce((acc, c) => {
			const config = this.validProperties.has(c) ? CONFIG.DND5E.itemProperties[c] : null;
			if (!config) return acc;
			const { abbreviation: abbr, label, icon } = config;
			acc.push({ abbr, icon, tag: config.isTag });
			return acc;
		}, []);
	}

	/* -------------------------------------------- */

	/** @inheritDoc */
	prepareFinalData() {
		const rollData = this.parent.getRollData({ deterministic: true });
		const labels = this.parent.labels ??= {};
		this.prepareFinalActivityData(rollData);
		ActivationField.prepareData.call(this, rollData, labels);
		DurationField.prepareData.call(this, rollData, labels);
		RangeField.prepareData.call(this, rollData, labels);
		TargetField.prepareData.call(this, rollData, labels);

		const Proficiency = game.dnd5e.documents.Proficiency;
		// This custom maneuver subtype is not handled by Item5e's built-in proficiency preparation.
		if (!this.parent.actor?.system?.attributes?.prof) this.prof = new Proficiency(0, 0);
		else this.prof = new Proficiency(this.parent.actor.system.attributes.prof, this.proficiencyMultiplier ?? 0);

		const superiorityDc = Number(this.parent.actor?.system?.superiority?.types?.[this.type.value]?.dc);
		if ( Number.isFinite(superiorityDc) ) {
			for ( const activity of maneuverSaveActivitiesAsArray(this.activities) ) {
				if ( activity.save?.dc && typeof activity.save.dc === "object" ) activity.save.dc.value = superiorityDc;
			}
		}
	}

	/* -------------------------------------------- */

	/** @inheritDoc */
	async getCardData(enrichmentOptions = {}) {
		const context = await super.getCardData(enrichmentOptions);
		context.isManeuver = true;
		context.subtitle = CONFIG.DND5E.superiority.types[this.type.value]?.label ?? "";
		context.properties = [];
		return context;
	}

	/* -------------------------------------------- */

	/** @inheritDoc */
	async getFavoriteData() {
		const saveActivities = maneuverSaveActivitiesAsArray(this.activities);
		return foundry.utils.mergeObject(await super.getFavoriteData(), {
			subtitle: [this.parent.labels.activation],
			modifier: this.parent.labels.modifier,
			range: this.range,
			save: saveActivities[0]?.save
		});
	}

	/** @inheritDoc */
	async getSheetData(context) {
		if (this.parent.actor) {
			const ability = CONFIG.DND5E.abilities[
				this.parent.actor.system?.superiority?.types?.[this.type.value]?.attr
				?? CONFIG.DND5E.superiority.types[this.type.value]?.attr?.[0]
				?? this.parent.actor.system.attributes?.spellcasting
				?? "int"
			]?.label?.toLowerCase();
			if (ability) context.defaultAbility = game.i18n.format("DND5E.DefaultSpecific", { default: ability });
			else context.defaultAbility = game.i18n.localize("DND5E.Default");
		}
		context.subtitles = [
			{ label: context.labels.type }
		];
		context.properties.active = this.parent.labels?.properties;
		context.parts = ["sw5e.details-maneuver", "dnd5e.field-uses"];
	}

	/* -------------------------------------------- */
	/*  Properties                                  */
	/* -------------------------------------------- */

	/**
	 * Attack classification of this maneuver.
	 * @type {"spell"}
	 */
	get attackClassification() {
		return "spell";
	}

	/* -------------------------------------------- */

	/** @override */
	get availableAbilities() {
		if (this.ability) return new Set([this.ability]);
		return new Set(CONFIG.DND5E.superiority.types[this.type.value].attr ?? []);
	}

	/* -------------------------------------------- */
	/*  Getters                                     */
	/* -------------------------------------------- */

	/**
	 * Properties displayed in chat.
	 * @type {string[]}
	 */
	get chatProperties() {
		return [
			...this.parent.labels.components?.tags ?? []
		];
	}

	/* -------------------------------------------- */

	/** @inheritDoc */
	get _typeAbilityMod() {
		return getBestAbility(this.parent.actor, this.availableAbilities).id ?? this.availableAbilities.first() ?? "int";
	}

	/* -------------------------------------------- */

	/** @override */
	get criticalThreshold() {
		return this.parent?.actor?.flags.sw5e?.maneuverCriticalThreshold ?? Infinity;
	}

	/* -------------------------------------------- */

	/**
	 * The proficiency multiplier for this item.
	 * @returns {number}
	 */
	get proficiencyMultiplier() {
		return 1;
	}

	/* -------------------------------------------- */
	/*  Socket Event Handlers                       */
	/* -------------------------------------------- */

	/** @inheritDoc */
	_preCreate(data, options, user) {
		if (super._preCreate(data, options, user) === false) return false;
		const classes = new Set(Object.keys(this.parent.actor?.spellcastingClasses ?? {}));
		if (!classes.size) return;

		// Set the source class
		const setClass = cls => {
			const update = { "system.sourceClass": cls };
			this.parent.updateSource(update);
		};

		// If only a single spellcasting class is present, use that
		if (classes.size === 1) {
			setClass(classes.first());
			return;
		}
	}
};