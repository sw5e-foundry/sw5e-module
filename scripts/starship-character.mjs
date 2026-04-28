import { getLegacyStarshipActorSystem } from "./starship-data.mjs";

export const STARSHIP_CREW_DEPLOYMENT_FLAG = "starshipDeployment";

const STARSHIP_DEPLOYMENT_ROLES = ["pilot", "crew", "passenger"];

function cloneDeep(data) {
	if ( globalThis.foundry?.utils?.deepClone ) return globalThis.foundry.utils.deepClone(data);
	if ( data === undefined ) return undefined;
	if ( typeof globalThis.structuredClone === "function" ) return globalThis.structuredClone(data);
	return JSON.parse(JSON.stringify(data));
}

function cloneData(data) {
	return cloneDeep(data ?? {});
}

function toNumber(value, fallback = 0) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeUuidSet(value) {
	if ( value instanceof Set ) return Array.from(value).filter(Boolean);
	if ( Array.isArray(value) ) return value.filter(Boolean);
	if ( value && typeof value === "object" ) {
		if ( value.items instanceof Set ) return Array.from(value.items).filter(Boolean);
		if ( Array.isArray(value.items) ) return value.items.filter(Boolean);
		if ( Array.isArray(value.value) ) return value.value.filter(Boolean);
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

function getCrewDeploymentFlag(actor) {
	return actor?.flags?.sw5e?.[STARSHIP_CREW_DEPLOYMENT_FLAG] ?? null;
}

function isLegacyVehicleStarship(actor) {
	return actor?.type === "vehicle" && actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

function isDeployableCrewActor(subject) {
	const actor = resolveActorDocument(subject);
	if ( !actor ) return false;
	return ["character", "npc"].includes(actor.type);
}

function getDeploymentState(existingDeployment = {}, preservedDeployment = {}) {
	return {
		pilot: {
			value: existingDeployment?.pilot?.value ?? preservedDeployment?.pilot?.value ?? null,
			active: Boolean(existingDeployment?.pilot?.active ?? preservedDeployment?.pilot?.active)
		},
		crew: {
			items: new Set(normalizeUuidSet(existingDeployment?.crew ?? preservedDeployment?.crew)),
			active: Boolean(existingDeployment?.crew?.active ?? preservedDeployment?.crew?.active)
		},
		passenger: {
			items: new Set(normalizeUuidSet(existingDeployment?.passenger ?? preservedDeployment?.passenger)),
			active: Boolean(existingDeployment?.passenger?.active ?? preservedDeployment?.passenger?.active)
		},
		active: {
			value: existingDeployment?.active?.value ?? preservedDeployment?.active?.value ?? null
		}
	};
}

function collectDeploymentUuids(deployment) {
	const uuids = new Set();
	if ( deployment?.pilot?.value ) uuids.add(deployment.pilot.value);
	for (const uuid of normalizeUuidSet(deployment?.crew)) uuids.add(uuid);
	for (const uuid of normalizeUuidSet(deployment?.passenger)) uuids.add(uuid);
	return uuids;
}

function getDeploymentRolesForUuid(deployment, uuid) {
	if ( !uuid ) return [];
	const roles = [];
	if ( deployment?.pilot?.value === uuid ) roles.push("pilot");
	if ( deployment?.crew?.items?.has?.(uuid) ) roles.push("crew");
	if ( deployment?.passenger?.items?.has?.(uuid) ) roles.push("passenger");
	return roles;
}

function syncDeploymentActiveFlags(deployment) {
	const activeUuid = deployment?.active?.value ?? null;
	if ( activeUuid && !collectDeploymentUuids(deployment).has(activeUuid) ) {
		deployment.active.value = null;
	}
	const currentActive = deployment?.active?.value ?? null;
	deployment.pilot.active = Boolean(currentActive && (deployment.pilot.value === currentActive));
	deployment.crew.active = Boolean(currentActive && deployment.crew.items.has(currentActive));
	deployment.passenger.active = Boolean(currentActive && deployment.passenger.items.has(currentActive));
	return deployment;
}

function cloneStarshipDeployment(starship) {
	const legacySystem = getLegacyStarshipActorSystem(starship) ?? {};
	return getDeploymentState(legacySystem.attributes?.deployment);
}

function buildDeploymentUpdateData(deployment) {
	syncDeploymentActiveFlags(deployment);
	// Vehicle actors store deployment in flags — dnd5e's DataModel silently discards writes to system.attributes.*
	const prefix = "flags.sw5e.legacyStarshipActor.system.attributes.deployment";
	return {
		[`${prefix}.pilot.value`]: deployment.pilot.value,
		[`${prefix}.pilot.active`]: deployment.pilot.active,
		[`${prefix}.crew.items`]: Array.from(deployment.crew.items),
		[`${prefix}.crew.active`]: deployment.crew.active,
		[`${prefix}.passenger.items`]: Array.from(deployment.passenger.items),
		[`${prefix}.passenger.active`]: deployment.passenger.active,
		[`${prefix}.active.value`]: deployment.active.value
	};
}

function buildCrewDeploymentFlagData(starship, roles) {
	return {
		starshipUuid: starship.uuid,
		starshipName: starship.name ?? "",
		roles: Array.from(new Set(roles)).sort()
	};
}

async function updateCrewDeploymentFlag(actor, starship, roles) {
	const normalizedRoles = Array.from(new Set(roles)).filter(role => STARSHIP_DEPLOYMENT_ROLES.includes(role));
	if ( !normalizedRoles.length ) {
		return actor.update({
			[`flags.sw5e.-=${STARSHIP_CREW_DEPLOYMENT_FLAG}`]: null
		});
	}
	return actor.update({
		[`flags.sw5e.${STARSHIP_CREW_DEPLOYMENT_FLAG}`]: buildCrewDeploymentFlagData(starship, normalizedRoles)
	});
}

function buildResolvedCrewRecord(deployment, uuid) {
	const actor = resolveActorDocument(uuid);
	const roles = getDeploymentRolesForUuid(deployment, uuid);
	return {
		uuid,
		name: actor?.name ?? "Unknown Crew",
		img: actor?.img || "icons/svg/mystery-man.svg",
		type: actor?.type ?? "",
		isPilot: roles.includes("pilot"),
		isCrew: roles.includes("crew"),
		isPassenger: roles.includes("passenger"),
		active: deployment.active.value === uuid,
		roles,
		proficiency: toNumber(actor?.system?.attributes?.prof, 0),
		pilotSkill: toNumber(actor?.system?.skills?.pil?.value, 0)
	};
}

function compareCrewRecords(left, right) {
	if ( left.isPilot !== right.isPilot ) return left.isPilot ? -1 : 1;
	if ( left.active !== right.active ) return left.active ? -1 : 1;
	return left.name.localeCompare(right.name);
}

function buildResolvedCrewRoster(deployment) {
	return Array.from(collectDeploymentUuids(deployment))
		.map(uuid => buildResolvedCrewRecord(deployment, uuid))
		.sort(compareCrewRecords);
}

export function buildAvailableStarshipCrewChoices(starship) {
	if ( !globalThis.game?.actors ) return [];
	return game.actors.contents
		.filter(actor => isDeployableCrewActor(actor) && (actor.id !== starship.id))
		.map(actor => {
			const deploymentFlag = getCrewDeploymentFlag(actor);
			const assignedShip = deploymentFlag?.starshipUuid ? resolveActorDocument(deploymentFlag.starshipUuid) : null;
			return {
				uuid: actor.uuid,
				name: actor.name,
				img: actor.img,
				type: actor.type,
				assignedElsewhere: Boolean(deploymentFlag?.starshipUuid && (deploymentFlag.starshipUuid !== starship.uuid)),
				assignedShipName: assignedShip?.name ?? deploymentFlag?.starshipName ?? "",
				roles: Array.isArray(deploymentFlag?.roles) ? deploymentFlag.roles : []
			};
		})
		.sort((left, right) => left.name.localeCompare(right.name));
}

export async function undeployStarshipCrew(starshipSubject, crewSubject, roles = STARSHIP_DEPLOYMENT_ROLES) {
	const starship = resolveActorDocument(starshipSubject);
	const crewActor = resolveActorDocument(crewSubject);
	if ( !isLegacyVehicleStarship(starship) ) return false;
	if ( !isDeployableCrewActor(crewActor) ) return false;

	const roleSet = new Set(Array.isArray(roles) ? roles : [roles]);
	const deployment = cloneStarshipDeployment(starship);
	const crewUuid = crewActor.uuid;

	if ( roleSet.has("pilot") && (deployment.pilot.value === crewUuid) ) {
		deployment.pilot.value = null;
	}
	if ( roleSet.has("crew") ) deployment.crew.items.delete(crewUuid);
	if ( roleSet.has("passenger") ) deployment.passenger.items.delete(crewUuid);

	await starship.update(buildDeploymentUpdateData(deployment));
	await updateCrewDeploymentFlag(crewActor, starship, getDeploymentRolesForUuid(deployment, crewUuid));
	return true;
}

export async function deployStarshipCrew(starshipSubject, crewSubject, role) {
	const starship = resolveActorDocument(starshipSubject);
	const crewActor = resolveActorDocument(crewSubject);
	if ( !isLegacyVehicleStarship(starship) ) return false;
	if ( !isDeployableCrewActor(crewActor) ) return false;
	if ( !STARSHIP_DEPLOYMENT_ROLES.includes(role) ) throw new Error(`Unsupported crew deployment role: ${role}`);

	const priorAssignment = getCrewDeploymentFlag(crewActor);
	if ( priorAssignment?.starshipUuid && (priorAssignment.starshipUuid !== starship.uuid) ) {
		const previousStarship = resolveActorDocument(priorAssignment.starshipUuid);
		if ( previousStarship ) await undeployStarshipCrew(previousStarship, crewActor);
		else await updateCrewDeploymentFlag(crewActor, starship, []);
	}

	const deployment = cloneStarshipDeployment(starship);
	const crewUuid = crewActor.uuid;
	const displacedPilotUuid = (role === "pilot" && deployment.pilot.value && (deployment.pilot.value !== crewUuid))
		? deployment.pilot.value
		: null;

	if ( role === "pilot" ) deployment.pilot.value = crewUuid;
	if ( role === "crew" || role === "pilot" ) deployment.crew.items.add(crewUuid);
	if ( role === "passenger" ) deployment.passenger.items.add(crewUuid);

	await starship.update(buildDeploymentUpdateData(deployment));
	await updateCrewDeploymentFlag(crewActor, starship, getDeploymentRolesForUuid(deployment, crewUuid));

	if ( displacedPilotUuid && (displacedPilotUuid !== crewUuid) ) {
		const displacedPilot = resolveActorDocument(displacedPilotUuid);
		if ( displacedPilot ) {
			await updateCrewDeploymentFlag(displacedPilot, starship, getDeploymentRolesForUuid(deployment, displacedPilotUuid));
		}
	}
	return true;
}

export async function toggleStarshipActiveCrew(starshipSubject, crewSubject = null) {
	const starship = resolveActorDocument(starshipSubject);
	if ( !isLegacyVehicleStarship(starship) ) return false;

	const deployment = cloneStarshipDeployment(starship);
	const crewActor = resolveActorDocument(crewSubject);
	const targetUuid = crewActor?.uuid ?? (typeof crewSubject === "string" ? crewSubject : null);
	const nextActive = (targetUuid && (deployment.active.value === targetUuid)) ? null : targetUuid;

	if ( nextActive && !collectDeploymentUuids(deployment).has(nextActive) ) return false;
	deployment.active.value = nextActive;
	await starship.update(buildDeploymentUpdateData(deployment));
	return true;
}

export function buildVehicleStarshipCrewContext(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor) ?? {};
	const deployment = getDeploymentState(legacySystem.attributes?.deployment);
	syncDeploymentActiveFlags(deployment);
	return {
		roster: buildResolvedCrewRoster(deployment)
	};
}

export function buildVehicleAvailableActors(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor) ?? {};
	const deployment = getDeploymentState(legacySystem.attributes?.deployment);
	const assignedUuids = collectDeploymentUuids(deployment);
	return buildAvailableStarshipCrewChoices(actor).filter(a => !assignedUuids.has(a.uuid));
}
