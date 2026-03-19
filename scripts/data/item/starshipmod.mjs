const { BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

export default class StarshipModData extends dnd5e.dataModels.item.FeatData {
	static defineSchema() {
		const schema = super.defineSchema();

		// SW5E-specific fields not present in FeatData.
		schema.grade = new SchemaField({
			value: new NumberField({ nullable: true, initial: null })
		});
		schema.baseCost = new SchemaField({
			value: new NumberField({ nullable: true, initial: null })
		});
		schema.prerequisites = new SchemaField({
			value: new StringField({ initial: "" })
		});
		schema.free = new SchemaField({
			slot: new BooleanField({ initial: false }),
			suite: new BooleanField({ initial: false })
		});
		schema.attributes = new SchemaField({
			dr: new StringField({ initial: "" })
		});
		schema.isCargo = new BooleanField({ initial: false });

		return schema;
	}
}
