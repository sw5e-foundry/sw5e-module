/**
 * Preserve starship equipment fields that runtime preparation reads from EquipmentData.
 * `regrateco` is the shield regeneration coefficient. `cscap` and `sscap` are power-coupling
 * capacities. `powerdicerec` is the reactor recovery formula.
 * @param {object} schema
 * @param {{ SchemaField: Function, NumberField: Function, StringField: Function }} fields
 */
export function addStarshipEquipmentRegenRateField(schema, { SchemaField, NumberField, StringField }) {
	schema.attributes ??= new SchemaField({});
	schema.attributes.fields.regrateco = new SchemaField({
		value: new NumberField({ required: false, nullable: true, initial: null, min: 0 })
	});
	schema.attributes.fields.cscap = new SchemaField({
		value: new NumberField({ required: false, nullable: true, initial: null })
	});
	schema.attributes.fields.sscap = new SchemaField({
		value: new NumberField({ required: false, nullable: true, initial: null })
	});
	schema.attributes.fields.powerdicerec = new SchemaField({
		value: new StringField({ required: false, nullable: true, blank: true, initial: "" })
	});
	return schema;
}
