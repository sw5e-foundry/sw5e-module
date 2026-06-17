import { getBestAbility } from "./utils.mjs";
import { getPowerDcBonus } from "./patch/power-bonuses.mjs";

/** @typedef {"attack" | "dc" | "points"} PowercastingAbilityPurpose */
/** @typedef {"default" | "highestEffective" | "fixed"} UniversalForceAbilityMode */

/**
 * @param {string | null | undefined} mode
 * @returns {"highestEffective" | "fixed"}
 */
function normalizeUniversalForceMode(mode) {
	if ( mode === "fixed" ) return "fixed";
	return "highestEffective";
}

const ABILITY_IDS = ["str", "dex", "con", "int", "wis", "cha"];

/**
 * @param {import("@league/foundry").documents.Actor} actor
 */
export function getPowercastingOverrides(actor) {
	return foundry.utils.mergeObject(
		{
			force: {
				lgt: {},
				drk: {},
				uni: { mode: "highestEffective" }
			},
			tech: {
				tec: {}
			}
		},
		actor?.flags?.sw5e?.powercastingOverrides ?? {},
		{ inplace: false }
	);
}

/**
 * @param {string} castType
 * @param {string} school
 * @returns {string[]}
 */
export function getDefaultSchoolAbilityIds(castType, school) {
	const attrs = CONFIG.DND5E?.powerCasting?.[castType]?.schools?.[school]?.attr;
	if ( !attrs ) return [];
	return Array.isArray(attrs) ? attrs : [attrs];
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {string} abilityId
 * @returns {{ id: string, mod: number }}
 */
function abilityEntry(actor, abilityId) {
	const id = String(abilityId ?? "").trim();
	if ( !id ) return { id: "", mod: 0 };
	return { id, mod: Number(actor?.system?.abilities?.[id]?.mod) || 0 };
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {string} castType
 * @param {string} school
 * @param {PowercastingAbilityPurpose} purpose
 * @returns {{ id: string, mod: number }}
 */
export function getEffectivePowercastingAbility(actor, { castType, school, purpose = "attack" }) {
	if ( !actor ) return { id: "", mod: 0 };

	const overrides = getPowercastingOverrides(actor);
	const schoolOverrides = overrides?.[castType]?.[school] ?? {};
	const sourceSchool = actor._source?.system?.powercasting?.[castType]?.schools?.[school] ?? {};
	const defaultIds = getDefaultSchoolAbilityIds(castType, school);

	if ( castType === "force" && school === "uni" ) {
		const mode = normalizeUniversalForceMode(
			schoolOverrides.mode ?? overrides?.force?.uni?.mode ?? "highestEffective"
		);
		if ( mode === "fixed" ) {
			const fixedId = sourceSchool.attr ?? schoolOverrides.ability;
			if ( fixedId ) return abilityEntry(actor, fixedId);
		}
		const lgt = getEffectivePowercastingAbility(actor, { castType, school: "lgt", purpose });
		const drk = getEffectivePowercastingAbility(actor, { castType, school: "drk", purpose });
		return lgt.mod >= drk.mod ? lgt : drk;
	}

	if ( purpose === "points" ) {
		const pointsId = schoolOverrides.pointsAbility;
		if ( pointsId ) return abilityEntry(actor, pointsId);
	}

	const attrOverride = sourceSchool.attr ?? schoolOverrides.ability;
	if ( attrOverride ) return abilityEntry(actor, attrOverride);

	return getBestAbility(actor, defaultIds, 0);
}

/**
 * Highest effective ability mod among schools for max power points.
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {"force"|"tech"} castType
 */
export function getBestPointsAbilityForCastType(actor, castType) {
	const schools = CONFIG.DND5E?.powerCasting?.[castType]?.schools ?? {};
	let best = { id: "", mod: -Infinity };
	for ( const school of Object.keys(schools) ) {
		const entry = getEffectivePowercastingAbility(actor, { castType, school, purpose: "points" });
		if ( entry.mod > best.mod ) best = entry;
	}
	if ( best.id === "" && best.mod === -Infinity ) return { id: "", mod: 0 };
	return best;
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {string} castType
 * @param {string} school
 * @param {number} base
 * @param {object} rollData
 */
export function resolveSchoolPowerDc(actor, castType, school, base, rollData) {
	const sourceSchool = actor?._source?.system?.powercasting?.[castType]?.schools?.[school];
	const dcOverride = sourceSchool?.dc;
	if ( dcOverride != null && dcOverride !== "" ) return Number(dcOverride);

	const ability = getEffectivePowercastingAbility(actor, { castType, school, purpose: "dc" });
	const bonus = getPowerDcBonus(actor, castType, school, ability.id, rollData);
	return base + ability.mod + bonus;
}

export function getPowercastingAbilityOptionIds() {
	return ABILITY_IDS;
}

/**
 * Documented Active Effect / feature flag paths for ability overrides.
 * @returns {readonly string[]}
 */
export function getPowercastingOverrideEffectPaths() {
	return Object.freeze([
		"flags.sw5e.powercastingOverrides.force.lgt.ability",
		"flags.sw5e.powercastingOverrides.force.lgt.pointsAbility",
		"flags.sw5e.powercastingOverrides.force.drk.ability",
		"flags.sw5e.powercastingOverrides.force.drk.pointsAbility",
		"flags.sw5e.powercastingOverrides.force.uni.mode",
		"flags.sw5e.powercastingOverrides.force.uni.ability",
		"flags.sw5e.powercastingOverrides.force.uni.pointsAbility",
		"system.powercasting.force.schools.lgt.attr",
		"system.powercasting.force.schools.drk.attr",
		"system.powercasting.force.schools.uni.attr"
	]);
}
