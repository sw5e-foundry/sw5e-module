const { ItemDataModel } = globalThis.dnd5e.dataModels;
const { ActionTemplate, ActivatedEffectTemplate, ItemDescriptionTemplate, ItemTypeTemplate, ItemTypeField } = globalThis.dnd5e.dataModels.item;

const { BooleanField, NumberField, SchemaField, SetField, StringField } = foundry.data.fields;

/**
 * Data definition for Maneuver items.
 * @mixes ItemDescriptionTemplate
 * @mixes ItemTypeTemplate
 * @mixes ActivatedEffectTemplate
 * @mixes ActionTemplate
 *
 * @property {object} prerequisites
 * @property {number} prerequisites.level           Character or class level required to choose this maneuver.
 * @property {Set<string>} properties               General properties of a maneuver item.
 */
export default class ManeuverData extends ItemDataModel.mixin(
	ItemDescriptionTemplate, ItemTypeTemplate, ActivatedEffectTemplate, ActionTemplate
) {
	/** @inheritdoc */
	static defineSchema() {
		return this.mergeSchema(super.defineSchema(), {
			type: new ItemTypeField({ baseItem: false }, { label: "SW5E.Superiority.Type.Label" }),
			prerequisites: new SchemaField({
				level: new NumberField({ integer: true, min: 0 })
			}),
			properties: new foundry.data.fields.SetField(new foundry.data.fields.StringField())
		});
	}

	/* -------------------------------------------- */

	/** @override */
	static get compendiumBrowserFilters() {
		return new Map([
			["level", {
				label: "DND5E.Level",
				type: "range",
				config: {
					keyPath: "system.prerequisites.level",
					min: 0,
					max: CONFIG.DND5E.maxLevel
				}
			}],
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

	/** @inheritdoc */
	static _migrateData(source) {
		super._migrateData(source);
	}

	/* -------------------------------------------- */
	/*  Data Preparation                            */
	/* -------------------------------------------- */

	/** @inheritDoc */
	prepareDerivedData() {
		super.prepareDerivedData();
	}

	/* -------------------------------------------- */

	/** @inheritDoc */
	prepareFinalData() {
		this.prepareFinalActivatedEffectData();

		const Proficiency = game.dnd5e.documents.Proficiency;
		// This isnt done by the Item5e._prepareProficiency because `sw5e.maneuver` is not on the list of types with proficiency.
		if ( !this.parent.actor?.system?.attributes?.prof ) this.prof = new Proficiency(0, 0);
		else this.prof = new Proficiency(this.parent.actor.system.attributes.prof, this.proficiencyMultiplier ?? 0);
	}

	/* -------------------------------------------- */

	/** @inheritDoc */
	async getCardData(enrichmentOptions={}) {
		const context = await super.getCardData(enrichmentOptions);
		context.subtitle = this.type.value;
		return context;
	}

	/* -------------------------------------------- */

	/** @inheritDoc */
	async getFavoriteData() {
		return foundry.utils.mergeObject(await super.getFavoriteData(), {
			subtitle: [this.parent.labels.activation],
			modifier: this.parent.labels.modifier,
			range: this.range,
			save: this.save
		});
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

	/** @inheritdoc */
	get _typeAbilityMod() {
		return this.parent?.actor?.system?.super?.types?.[this.type.value]?.attr
			?? CONFIG.DND5E.superiority.types[this.type.value]?.attr?.[0]
			?? "int";
	}

	/* -------------------------------------------- */

	/** @inheritdoc */
	get _typeCriticalThreshold() {
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
};
