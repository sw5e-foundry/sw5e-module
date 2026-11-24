/**
 * Format a prepared dnd5e 6.1 ability attack bonus.
 * Missing, null, empty, and non-finite values stay "-", including values that
 * Number(null) and Number("") would turn into 0. A numeric 0 stays "+0".
 */

/**
 * Read `abilities.<id>.attack.value` without coercing the attack object.
 * A legacy numeric attack is returned as that number.
 * @param {unknown} attack
 * @returns {unknown}
 */
export function readPreparedAttackValue(attack) {
	if ( typeof attack === "number" ) return attack;
	if ( attack && (typeof attack === "object") && ("value" in attack) ) return attack.value;
	return undefined;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function formatPowerAttackBonus(value) {
	if ( typeof value !== "number" || !Number.isFinite(value) ) return "-";
	return value < 0 ? String(value) : `+${value}`;
}

/**
 * @param {unknown} attack Prepared ability attack object or legacy number.
 * @param {unknown} [schoolBonus]
 * @returns {string}
 */
export function formatSchoolAttackBonus(attack, schoolBonus) {
	const base = readPreparedAttackValue(attack);
	if ( typeof base !== "number" || !Number.isFinite(base) ) return "-";
	const bonus = typeof schoolBonus === "number" && Number.isFinite(schoolBonus) ? schoolBonus : 0;
	return formatPowerAttackBonus(base + bonus);
}
