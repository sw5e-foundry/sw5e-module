const { HTMLField, NumberField, SchemaField } = foundry.data.fields;

export default class DeploymentData extends dnd5e.dataModels.item.FeatData {
	static defineSchema() {
		const schema = super.defineSchema();

		// Current rank in this deployment.
		schema.rank = new NumberField({ nullable: false, integer: true, min: 0, initial: 1 });

		// Italicized flavor blurb shown on the sheet.
		schema.flavorText = new SchemaField({
			value: new HTMLField({ nullable: true, initial: null })
		});

		return schema;
	}
}
