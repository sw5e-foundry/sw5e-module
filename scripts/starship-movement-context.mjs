import { STARSHIP_MOVEMENT_TYPE_KEYS } from "./patch/starship-movement.mjs";

/** dnd5e 6.0 MovementSensesConfig field name prefix for MappingField speeds. */
export const STARSHIP_SPEEDS_PATH_PREFIX = "system.attributes.movement.speeds.";
export const STARSHIP_UNITS_PATH = "system.attributes.movement.units";

const STARSHIP_MOVEMENT_TYPE_SET = new Set(STARSHIP_MOVEMENT_TYPE_KEYS);

/**
 * Resolve a 6.0 MovementSensesConfig `types[]` entry to a short movement key.
 * Prefer `entry.name` (`system.attributes.movement.speeds.<key>`). Do not treat a
 * shared MappingField model `field.name` as the movement type.
 * @param {{ name?: string, field?: { name?: string } }} [entry]
 * @param {number} index
 * @param {string[]} [orderedKeys]
 * @param {Record<string, unknown>} [fields]
 * @returns {string|null}
 */
export function resolveMovementTypeKey(entry, index, orderedKeys, fields) {
	const fromName = movementTypeKeyFromEntryName(entry?.name);
	if ( fromName ) return fromName;

	const keyFromOrder = orderedKeys?.[index];
	if ( keyFromOrder && fields?.[keyFromOrder] === entry?.field ) return keyFromOrder;

	const fieldName = entry?.field?.name;
	if ( typeof fieldName === "string" && fieldName && !fieldName.includes(".") ) {
		const fromFieldPath = movementTypeKeyFromEntryName(fieldName);
		if ( fromFieldPath ) return fromFieldPath;
		if ( STARSHIP_MOVEMENT_TYPE_SET.has(fieldName) || keyFromOrder === fieldName ) return fieldName;
	}

	if ( keyFromOrder ) return keyFromOrder;

	if ( entry?.field && fields ) {
		return Object.keys(fields).find(key => fields[key] === entry.field) ?? null;
	}
	return null;
}

/**
 * @param {string} [name]
 * @returns {string|null}
 */
export function movementTypeKeyFromEntryName(name) {
	if ( typeof name !== "string" || !name ) return null;
	if ( name === STARSHIP_UNITS_PATH ) return "units";
	if ( name.startsWith(STARSHIP_SPEEDS_PATH_PREFIX) ) {
		const key = name.slice(STARSHIP_SPEEDS_PATH_PREFIX.length);
		return key || null;
	}
	return null;
}

/**
 * Remove Space/Turn rows from a 6.0 MovementSensesConfig context.
 * Mutates `context.types`. Does not prove rendering.
 * @param {{ types?: object[], fields?: object }} context
 * @param {string[]} [orderedKeys]
 * @returns {object}
 */
export function filterNonStarshipMovementContext(context, orderedKeys) {
	if ( !context || !Array.isArray(context.types) ) return context;
	context.types = context.types.filter((entry, index) => {
		const key = resolveMovementTypeKey(entry, index, orderedKeys, context.fields);
		return !key || !STARSHIP_MOVEMENT_TYPE_SET.has(key);
	});
	return context;
}
