const { ArrayField, BooleanField, NumberField, ObjectField, SchemaField, StringField } = foundry.data.fields;

export class StarshipData extends dnd5e.dataModels.actor.VehicleData {
	/**
	 * Declare this model as provided by dnd5e so its full prepareData() lifecycle runs.
	 * Foundry sets modelProvider based on the module that registered the type (sw5e), but
	 * dnd5e gates its preparation on modelProvider === dnd5e. Returning game.system here
	 * satisfies that check while still using our extended schema.
	 */
	get modelProvider() {
		return game.system;
	}

	static defineSchema() {
		const schema = super.defineSchema();
		const FormulaField = dnd5e.dataModels.fields.FormulaField;

		// Extend attributes with starship-specific fields.
		Object.assign(schema.attributes.fields, {
			systemDamage: new NumberField({ nullable: false, integer: true, min: 0, initial: 0 }),
			fuel: new SchemaField({
				value: new NumberField({ nullable: false, integer: true, min: 0, initial: 0 })
			}),
			power: new SchemaField({
				routing: new StringField({ initial: "none" }),
				central: new SchemaField({ value: new NumberField({ nullable: false, initial: 0, min: 0 }) }),
				comms:   new SchemaField({ value: new NumberField({ nullable: false, initial: 0, min: 0 }) }),
				engines: new SchemaField({ value: new NumberField({ nullable: false, initial: 0, min: 0 }) }),
				shields: new SchemaField({ value: new NumberField({ nullable: false, initial: 0, min: 0 }) }),
				sensors: new SchemaField({ value: new NumberField({ nullable: false, initial: 0, min: 0 }) }),
				weapons: new SchemaField({ value: new NumberField({ nullable: false, initial: 0, min: 0 }) })
			}),
			deployment: new SchemaField({
				pilot: new SchemaField({
					value: new StringField({ nullable: true, initial: null }),
					active: new BooleanField({ initial: false })
				}),
				crew: new SchemaField({
					items: new ArrayField(new StringField()),
					active: new BooleanField({ initial: false })
				}),
				passenger: new SchemaField({
					items: new ArrayField(new StringField()),
					active: new BooleanField({ initial: false })
				}),
				active: new SchemaField({
					value: new StringField({ nullable: true, initial: null })
				})
			})
		});

		// Extend details with starship size.
		schema.details.fields.starshipsize = new StringField({ nullable: true, initial: null });
		// Override vehicle "type" default so starships show "Starship" instead of "Water Vehicle".
		schema.details.fields.type.initial = "starship";

		// Preserve existing starship skill keys from compendium payloads.
		schema.skills = new dnd5e.dataModels.fields.MappingField(
			new SchemaField({
				value: new NumberField({ nullable: false, integer: true, min: 0, initial: 0 }),
				ability: new StringField({ initial: "int" }),
				bonuses: new SchemaField({
					check: new FormulaField({ initial: "" }),
					passive: new FormulaField({ initial: "" })
				}),
				roll: new SchemaField({
					min: new NumberField({ nullable: true, initial: null }),
					max: new NumberField({ nullable: true, initial: null }),
					mode: new NumberField({ nullable: false, integer: true, initial: 0 })
				})
			}),
			{ initialKeysOnly: false }
		);

		schema.favorites = new ArrayField(new ObjectField());

		return schema;
	}

	/** @inheritDoc */
	prepareDerivedData() {
		try {
			super.prepareDerivedData();
		} finally {
			// Guarantee a non-undefined source label so the sheet header stays stable.
			if (this.source && this.source.label === undefined) {
				this.source.label = "";
			}
		}
	}
}
