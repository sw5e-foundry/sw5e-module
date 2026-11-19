/**
 * Preserve starship equipment fields that runtime preparation reads from EquipmentData.
 * Pack source uses these names: `regrateco`, `cscap`, `sscap`, and `powerdicerec`.
 * `regrateco` is a shield regeneration coefficient. `cscap` and `sscap` are power-coupling
 * capacities. `powerdicerec` is a reactor recovery formula string.
 * @param {object} schema
 * @param {{ SchemaField: Function, NumberField: Function, StringField: Function }} fields
 */
export function addStarshipEquipmentRegenRateField(schema, { SchemaField, NumberField, StringField }) {
	schema.attributes ??= new SchemaField({});
	schema.attributes.fields.regrateco = new SchemaField({
		value: new NumberField({ required: false, nullable: true, initial: null, min: 0 })
	});
	schema.attributes.fields.cscap = new SchemaField({
		value: new NumberField({ required: false, nullable: true, initial: null, min: 0 })
	});
	schema.attributes.fields.sscap = new SchemaField({
		value: new NumberField({ required: false, nullable: true, initial: null, min: 0 })
	});
	schema.attributes.fields.powerdicerec = new SchemaField({
		value: new StringField({ required: false, nullable: true, blank: true, initial: "" })
	});
	return schema;
}

/**
 * Classify one regen coefficient.
 * Absent: null, undefined, blank string, non-numeric text, and negatives.
 * Negatives are rejected rather than clamped, matching a min-0 field that does not store them.
 * Numeric strings are parsed. 0 and "0" are an explicit disable, not absent.
 * @param {unknown} value
 * @returns {{ state: "absent" } | { state: "disabled" } | { state: "value", value: number }}
 */
export function classifyStarshipRegenRate(value) {
	if ( value === null || value === undefined ) return { state: "absent" };
	if ( typeof value === "string" && value.trim() === "" ) return { state: "absent" };
	const number = typeof value === "number" ? value : Number(String(value).trim());
	if ( !Number.isFinite(number) || number < 0 ) return { state: "absent" };
	if ( number === 0 ) return { state: "disabled" };
	return { state: "value", value: number };
}

/**
 * Null-aware regen fallback: local ?? inherited ?? default.
 * An explicit 0 is present and disables regeneration. It does not fall through.
 * @param {unknown} localValue
 * @param {unknown} inheritedValue
 * @param {unknown} [defaultValue]
 * @returns {number|null}
 */
export function resolveStarshipRegenRate(localValue, inheritedValue, defaultValue = null) {
	const local = classifyStarshipRegenRate(localValue);
	if ( local.state === "disabled" ) return 0;
	if ( local.state === "value" ) return local.value;
	const inherited = classifyStarshipRegenRate(inheritedValue);
	if ( inherited.state === "disabled" ) return 0;
	if ( inherited.state === "value" ) return inherited.value;
	const fallback = classifyStarshipRegenRate(defaultValue);
	if ( fallback.state === "disabled" ) return 0;
	if ( fallback.state === "value" ) return fallback.value;
	return null;
}

/**
 * First present regen candidate wins. 0 is present.
 * @param {unknown[]} candidates
 * @returns {number|null}
 */
export function resolveStarshipRegenRateFromCandidates(candidates) {
	let resolved = null;
	let seen = false;
	for ( const candidate of candidates ?? [] ) {
		const classified = classifyStarshipRegenRate(candidate);
		if ( classified.state === "absent" ) continue;
		resolved = classified.state === "disabled" ? 0 : classified.value;
		seen = true;
		break;
	}
	return seen ? resolved : null;
}

/**
 * Capacity policy: null and blank stay null; numeric strings parse; NaN and non-numeric
 * text become null; negatives clamp to 0.
 * @param {unknown} value
 * @returns {number|null}
 */
export function normalizeStarshipCapacity(value) {
	if ( value === null || value === undefined ) return null;
	if ( typeof value === "string" && value.trim() === "" ) return null;
	const number = typeof value === "number" ? value : Number(String(value).trim());
	if ( !Number.isFinite(number) ) return null;
	return Math.max(0, number);
}

/**
 * Recovery formulas are strings. Blank, null, and non-scalar YAML (`{}`) become "".
 * Numbers are stringified so an unquoted YAML scalar is not dropped.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeStarshipPowerDiceRecovery(value) {
	if ( value === null || value === undefined ) return "";
	if ( typeof value === "object" ) return "";
	return String(value).trim();
}
