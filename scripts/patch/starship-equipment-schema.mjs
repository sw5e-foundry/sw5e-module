/**
 * Preserve starship shield `system.attributes.regrateco.value` on EquipmentData.
 * The field is nullable so ordinary equipment keeps an inert null.
 * @param {object} schema
 * @param {{ SchemaField: Function, NumberField: Function }} fields
 */
export function addStarshipEquipmentRegenRateField(schema, { SchemaField, NumberField }) {
	schema.attributes ??= new SchemaField({});
	schema.attributes.fields.regrateco = new SchemaField({
		value: new NumberField({ required: false, nullable: true, initial: null, min: 0 })
	});
	return schema;
}
