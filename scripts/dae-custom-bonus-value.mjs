/**
 * DAE concatenates custom-mode bonus changes with String#startsWith.
 * Foundry 14 migrates a string such as "1" through JSON.parse, which stores the number 1.
 * A signed formula such as "+1" is not valid JSON, so that migration leaves the string intact.
 */

export const DAE_STRING_BONUS_KEYS = Object.freeze([
	"system.bonuses.weapon.damage",
	"system.bonuses.spell.damage",
	"system.bonuses.mwak.attack",
	"system.bonuses.mwak.damage",
	"system.bonuses.rwak.attack",
	"system.bonuses.rwak.damage",
	"system.bonuses.msak.attack",
	"system.bonuses.msak.damage",
	"system.bonuses.rsak.attack",
	"system.bonuses.rsak.damage",
	"system.bonuses.heal.attack",
	"system.bonuses.heal.damage",
	"system.bonuses.abilities.save",
	"system.bonuses.abilities.check",
	"system.bonuses.abilities.skill"
]);

const BONUS_KEYS = new Set(DAE_STRING_BONUS_KEYS);
const PLAIN_INTEGER = /^[+-]?\d+$/;

/**
 * @param {object} change
 * @returns {boolean}
 */
export function isCustomBonusChange(change) {
	if ( !change || !BONUS_KEYS.has(change.key) ) return false;
	return change.type === "custom" || change.mode === 0;
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function toDaeCustomBonusString(value) {
	if ( typeof value === "number" ) {
		if ( !Number.isFinite(value) ) return value;
		value = String(value);
	}
	if ( typeof value !== "string" ) return value;
	const trimmed = value.trim();
	if ( !PLAIN_INTEGER.test(trimmed) ) return value;
	if ( trimmed.startsWith("+") ) return trimmed;
	// JSON.parse("-2") is a number, so a bare negative would be migrated again.
	if ( trimmed.startsWith("-") ) return `${trimmed}+0`;
	return `+${trimmed}`;
}

/**
 * @param {object} change
 * @returns {boolean} Whether the change value was rewritten.
 */
export function normalizeDaeCustomBonusChange(change) {
	if ( !isCustomBonusChange(change) ) return false;
	const next = toDaeCustomBonusString(change.value);
	if ( next === change.value ) return false;
	change.value = next;
	return true;
}

/**
 * @param {object[]|null|undefined} changes
 * @returns {number}
 */
export function normalizeDaeCustomBonusChanges(changes) {
	if ( !Array.isArray(changes) ) return 0;
	let count = 0;
	for ( const change of changes ) {
		if ( normalizeDaeCustomBonusChange(change) ) count += 1;
	}
	return count;
}
