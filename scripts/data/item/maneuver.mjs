// dataModels file adds:
// - super field to CreatureTemplate

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
 * @property {string} requirements                  Actor details required to use this maneuver.
 * @property {object} recharge                      Details on how a maneuver can roll for recharges.
 * @property {number} recharge.value                Minimum number needed to roll on a d6 to recharge this maneuver.
 * @property {boolean} recharge.charged             Does this maneuver have a charge remaining?

 * @property {number} level                      Base level of the spell.
 * @property {string} school                     Magical school to which this spell belongs.
 * @property {Set<string>} properties            General components and tags for this spell.
 * @property {object} scaling                    Details on how casting at higher levels affects this spell.
 * @property {string} scaling.mode               Spell scaling mode as defined in `DND5E.spellScalingModes`.
 * @property {string} scaling.formula            Dice formula used for scaling.
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
			})
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
