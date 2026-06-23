import { getCharacterDeploymentSummary } from "./character-deployments.mjs";
import { getLegacyStarshipActorSystem, getPowerRoutingState } from "./starship-data.mjs";
import { getModuleSettingValue, SETTINGS_NAMESPACE } from "./module-support.mjs";

export const SHOW_LEGACY_POWER_ROUTING_SETTING = "showLegacyPowerRouting";
export const STARSHIP_LEGACY_POWER_ROUTING_FLAG = "showLegacyPowerRouting";

const NEUTRAL_POWER_ROUTING_STATE = Object.freeze({
	selected: "none",
	enginesMultiplier: 1,
	weaponsMultiplier: 1,
	shieldsMultiplier: 1
});

const REROUTE_POWER_MIN_RANK = 3;
const MECHANIC_NAME = "mechanic";
const REROUTE_POWER_FEATURE = /reroute\s*power/i;

function normalizeUuidList(value) {
	if ( value instanceof Set ) return Array.from(value).filter(Boolean);
	if ( Array.isArray(value) ) return value.filter(Boolean);
	if ( value && typeof value === "object" ) {
		if ( value.items instanceof Set ) return Array.from(value.items).filter(Boolean);
		if ( Array.isArray(value.items) ) return value.items.filter(Boolean);
	}
	return [];
}

function resolveActorDocument(subject) {
	if ( !subject ) return null;
	if ( subject.documentName === "Actor" ) return subject;
	if ( typeof subject === "string" ) {
		return globalThis.fromUuidSync?.(subject)
			?? globalThis.game?.actors?.get(subject)
			?? null;
	}
	return null;
}

function isMechanicDeployment(deployment) {
	const identifier = String(deployment?.identifier ?? "").trim().toLowerCase();
	const name = String(deployment?.name ?? "").trim().toLowerCase();
	return identifier === MECHANIC_NAME || name === MECHANIC_NAME;
}

/**
 * True when a crew member assigned to the starship has Mechanic rank 3+ or the Reroute Power feature.
 */
export function starshipHasReroutePowerCrew(starship) {
	const legacySystem = getLegacyStarshipActorSystem(starship);
	const deployment = legacySystem?.attributes?.deployment ?? {};
	const uuids = new Set([
		...normalizeUuidList(deployment.crew),
		...(deployment.pilot?.value ? [deployment.pilot.value] : [])
	]);

	for ( const uuid of uuids ) {
		const crewActor = resolveActorDocument(uuid);
		if ( !crewActor ) continue;
		const summary = getCharacterDeploymentSummary(crewActor);
		if ( summary.deploymentFeatures.some(feature => REROUTE_POWER_FEATURE.test(feature.name ?? "")) ) return true;
		if ( summary.deployments.some(entry => isMechanicDeployment(entry) && Number(entry.displayRank) >= REROUTE_POWER_MIN_RANK) ) {
			return true;
		}
	}
	return false;
}

export function isLegacyPowerRoutingOverrideEnabled(starship) {
	if ( getModuleSettingValue(SHOW_LEGACY_POWER_ROUTING_SETTING, false) ) return true;
	return Boolean(starship?.getFlag?.(SETTINGS_NAMESPACE, STARSHIP_LEGACY_POWER_ROUTING_FLAG));
}

/**
 * RAW default: hide unless Mechanic 3+ / Reroute Power on assigned crew.
 * Homebrew escape hatch: world setting or per-actor flag.
 */
export function shouldShowStarshipPowerRouting(starship) {
	if ( !starship ) return false;
	if ( isLegacyPowerRoutingOverrideEnabled(starship) ) return true;
	return starshipHasReroutePowerCrew(starship);
}

/**
 * Applies stored routing only when the Core panel is enabled (Mechanic Reroute Power or legacy override).
 * When gated off, mechanics treat routing as neutral while preserving the stored `power.routing` value.
 */
export function resolveStarshipPowerRoutingState(starship, legacySystem = null) {
	if ( !shouldShowStarshipPowerRouting(starship) ) return NEUTRAL_POWER_ROUTING_STATE;
	const system = legacySystem ?? getLegacyStarshipActorSystem(starship);
	return getPowerRoutingState(system);
}
