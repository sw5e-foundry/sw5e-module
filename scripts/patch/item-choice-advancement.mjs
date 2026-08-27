/**
 * Register SW5e Maneuver Item types on the shared dnd5e Item Choice / Item Grant
 * VALID_TYPES allowlist so Choose Items dropdown and grant validation include Maneuver.
 *
 * Does not wrap or modify dnd5e source. Mutates the existing Set via .add() only.
 */
import { getModuleTypeCandidates, HOOKS_NAMESPACE } from "../module-support.mjs";

const LOG_PREFIX = `${HOOKS_NAMESPACE.toUpperCase()} MODULE`;

/**
 * Add all Maneuver module-type candidates to ItemChoice/ItemGrant VALID_TYPES.
 * Idempotent. Fail-safe if the dnd5e advancement surface is missing.
 *
 * @param {object} [configDnd5e=globalThis.CONFIG?.DND5E]
 * @returns {{ ok: boolean, added: string[], reason?: string, set?: Set<string> }}
 */
export function registerManeuverItemChoiceTypes(configDnd5e=globalThis.CONFIG?.DND5E) {
	const advancementTypes = configDnd5e?.advancementTypes;
	if ( !advancementTypes || (typeof advancementTypes !== "object") ) {
		console.warn(`${LOG_PREFIX} | Item Choice Maneuver registration skipped: CONFIG.DND5E.advancementTypes missing.`);
		return { ok: false, added: [], reason: "missing-advancementTypes" };
	}

	const itemChoice = advancementTypes.ItemChoice?.documentClass;
	if ( !itemChoice ) {
		console.warn(`${LOG_PREFIX} | Item Choice Maneuver registration skipped: ItemChoice documentClass missing.`);
		return { ok: false, added: [], reason: "missing-ItemChoice" };
	}

	const validTypes = itemChoice.VALID_TYPES;
	if ( !(validTypes instanceof Set) ) {
		console.warn(`${LOG_PREFIX} | Item Choice Maneuver registration skipped: VALID_TYPES is not a Set.`);
		return { ok: false, added: [], reason: "missing-VALID_TYPES" };
	}

	const added = [];
	for ( const type of getModuleTypeCandidates("maneuver") ) {
		const before = validTypes.size;
		validTypes.add(type);
		if ( validTypes.size > before ) added.push(type);
	}

	return { ok: true, added, set: validTypes };
}

/**
 * Patch entry: register Maneuver on the shared VALID_TYPES Set during module init.
 */
export function patchItemChoiceAdvancement() {
	registerManeuverItemChoiceTypes();
}
