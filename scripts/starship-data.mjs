import { getBaseCurrencyKey, normalizeSwPriceDenomination } from "./currencies.mjs";
import { getCharacterDeploymentSummary } from "./character-deployments.mjs";
import {
	appendProficiencyTierFlavor,
	createProficiencyTierChatFlag,
	getExpandedProficiencyHoverLabel,
	getExpandedProficiencyMultiplier,
	getProficiencyAdvantageMode,
	isMasteryProficiencyTier,
	isRerollProficiencyTier
} from "./patch/proficiency.mjs";
import { canAttributeStarshipCrewActor, isStarshipCrewMembershipVisibleToUser } from "./starship-permissions.mjs";
import { resolveStarshipPowerRoutingState } from "./starship-routing-gate.mjs";
import {
	applyStarshipSystemDamageSkillCheckAdvantageDefault,
	applyStarshipSlowedToSpeed,
	buildStarshipSystemDamageAttackSaveFlavorNote,
	buildStarshipSystemDamageSkillCheckFlavorNote,
	getStarshipSlowedLevelFromSystemDamageLevel,
	isStarshipSystemDamageAttackSaveDisadvantageRoll,
	isStarshipSystemDamageSkillCheckDisadvantageRoll,
	resolveStarshipSlowedLevel
} from "./starship-system-damage.mjs";
import { resolveStarshipDefaultAdvantageMode, postStarshipSaveAutoFailMessage, shouldStarshipSaveAutoFail } from "./starship-roll-modifiers.mjs";
import {
	getSpaceStationFixedMovement,
	getSpaceStationHyperspaceTravelTimeMultiplier,
	isActiveSpaceStationActor
} from "./space-station.mjs";

const LEGACY_STARSHIP_PACKS = new Set([
	"starshipactions",
	"starshiparmor",
	"starshipequipment",
	"starshipfeatures",
	"starshipmodifications",
	"starships",
	"starshipweapons",
	"deployments",
	"deploymentfeatures",
	"ventures"
]);

const STARSHIP_CHARACTER_FLAG = "starshipCharacter";
const STARSHIP_POWER_ZONES = ["central", "engines", "shields", "weapons"];
/** SotG power die allocation slots (includes comms/sensors beyond routing zones). */
export const STARSHIP_POWER_DIE_SLOTS = ["central", "comms", "engines", "sensors", "shields", "weapons"];
const STARSHIP_LEGACY_ATTRIBUTE_FLAG_BASE = "flags.sw5e.legacyStarshipActor.system.attributes";
const STARSHIP_TRAVEL_PACES = new Set(["slow", "normal", "fast"]);
const STARSHIP_TOKEN_GRID_SPACES = Object.freeze({
	tiny: 1,
	sm: 1,
	small: 1,
	med: 2,
	medium: 2,
	lg: 4,
	large: 4,
	huge: 8,
	grg: 16,
	gargantuan: 16
});

function cloneData(data) {
	if ( data === undefined ) return undefined;
	if ( typeof globalThis.structuredClone === "function" ) return globalThis.structuredClone(data);
	return JSON.parse(JSON.stringify(data));
}

function ensureSw5eFlags(data) {
	const flags = (data.flags ??= {});
	return (flags.sw5e ??= {});
}

function hasOwnKeys(value) {
	return !!value && (typeof value === "object") && !Array.isArray(value) && (Object.keys(value).length > 0);
}

function isRecord(value) {
	return !!value && (typeof value === "object") && !Array.isArray(value);
}

function toFiniteNumber(value, fallback = null) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

/**
 * Starship ability check/save rolls do not use d20 min/max die bounds.
 * No current SW5E Starship feature configures these ranges; stored 0/0 and
 * Foundry-cleaned 1/1 are poison from the prior null→0→1 chain (Bug 3).
 * Always emit null/null for min/max; preserve mode only.
 * @param {object} [roll]
 * @returns {{ min: null, max: null, mode: number }}
 */
export function makeAbilityRoll(roll = {}) {
	return {
		min: null,
		max: null,
		mode: toFiniteNumber(roll?.mode, 0) ?? 0
	};
}

function localizeWithFallback(key, fallback) {
	const localized = game?.i18n?.localize?.(key);
	return localized && localized !== key ? localized : fallback;
}

function resolveStarshipSkillLabel(config, key) {
	const labelKey = config?.label ?? key;
	const fallback = config?.fullKey
		? String(config.fullKey).charAt(0).toUpperCase() + String(config.fullKey).slice(1)
		: String(key).toUpperCase();
	return localizeWithFallback(labelKey, fallback);
}

function escapeHtml(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function getLegacyPackHint(item) {
	// Foundry v14: prefer _stats.compendiumSource; retain flags.core.sourceId for legacy content.
	const sourceId = item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId;
	const match = /^Compendium\.[^.]+\.([^.]+)\./.exec(sourceId ?? "");
	return match?.[1] ?? null;
}

function getStarshipCharacterFlag(subject) {
	return subject?.flags?.sw5e?.[STARSHIP_CHARACTER_FLAG] ?? null;
}

function isCharacterBackedStarship(data) {
	return data?.type === "character" && getStarshipCharacterFlag(data)?.enabled;
}

export function getLegacyStarshipSize(items = []) {
	return items.find(item => item.type === "starshipsize")
		?? items.find(item => item.flags?.sw5e?.legacyStarshipSize)
		?? items.find(item => item.flags?.sw5e?.[STARSHIP_CHARACTER_FLAG]?.role === "classification")
		// New-format: feat item with HullPoints advancement (identifier-based, no legacy flag)
		?? items.find(item => item.type === "feat" && item.system?.advancement?.some?.(a => a.type === "HullPoints"));
}

export function getLegacySizeSystem(item) {
	if ( item?.flags?.sw5e?.legacyStarshipSize ) return item.flags.sw5e.legacyStarshipSize;
	const classification = item?.flags?.sw5e?.[STARSHIP_CHARACTER_FLAG]?.classification;
	// item._source is the raw pre-DataModel object; item.system may be a DataModel that hides custom fields
	const rawSystem = item?._source?.system ?? item?.system ?? {};
	return classification?.raw ?? classification ?? rawSystem;
}

function getLegacyItemSystem(item) {
	return item?.flags?.sw5e?.legacyStarshipSize
		?? item?.flags?.sw5e?.legacyStarshipMod
		?? item?.flags?.sw5e?.legacyDeployment
		?? item?.flags?.sw5e?.[STARSHIP_CHARACTER_FLAG]?.legacySystem
		?? item?.system
		?? {};
}

function stripHtml(value) {
	return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeTravelPace(value, fallback = "normal") {
	const normalized = String(value ?? "").trim().toLowerCase();
	return STARSHIP_TRAVEL_PACES.has(normalized) ? normalized : fallback;
}

function normalizeStarshipTokenSizeKey(value) {
	const normalized = String(value ?? "").trim().toLowerCase();
	return normalized && (normalized in STARSHIP_TOKEN_GRID_SPACES) ? normalized : "med";
}

export function getStarshipPrototypeTokenDimensions(sizeKey) {
	const normalized = normalizeStarshipTokenSizeKey(sizeKey);
	const gridSpaces = STARSHIP_TOKEN_GRID_SPACES[normalized] ?? STARSHIP_TOKEN_GRID_SPACES.med;
	return { width: gridSpaces, height: gridSpaces };
}

export function applyStarshipPrototypeTokenDimensions(target, sizeKey = target?.system?.traits?.size) {
	if ( !target || (typeof target !== "object") ) return target;
	const { width, height } = getStarshipPrototypeTokenDimensions(sizeKey);
	target.prototypeToken ??= {};
	target.prototypeToken.width = width;
	target.prototypeToken.height = height;
	return target;
}

function getItemDescriptionText(item) {
	const system = getLegacyItemSystem(item);
	return stripHtml(system?.description?.value ?? system?.description ?? "");
}

function isRoleSpeedProfileItem(item) {
	if ( !item ) return false;
	const subtype = item.system?.type?.subtype ?? getLegacyItemSystem(item)?.type?.subtype ?? "";
	return subtype === "role";
}

function getRoutingMultiplier(selected, zone) {
	if ( selected === zone ) return 2;
	if ( !selected || selected === "none" ) return 1;
	return 0.5;
}

function getPowerRoutingState(legacySystem = {}) {
	const raw = legacySystem.attributes?.power?.routing ?? "none";
	// Legacy "central" penalized all zones with no boost — treat as unrouted for mechanics and UI.
	const selected = raw === "central" ? "none" : raw;
	return {
		selected,
		enginesMultiplier: getRoutingMultiplier(selected, "engines"),
		weaponsMultiplier: getRoutingMultiplier(selected, "weapons"),
		// Reserved for future shield automation (regen / temp SP); not consumed yet.
		shieldsMultiplier: getRoutingMultiplier(selected, "shields")
	};
}

export { getPowerRoutingState };

/**
 * Normalize deployment UUID containers written by Foundry updates (array, Set, or numeric-key object).
 * @param {unknown} value
 * @returns {string[]}
 */
export function getDeploymentUuidList(value) {
	if ( value == null || value === "" ) return [];
	if ( value instanceof Set ) return Array.from(value).filter(Boolean).map(String);
	if ( Array.isArray(value) ) return value.filter(Boolean).map(String);
	if ( typeof value === "object" ) {
		if ( "items" in value ) return getDeploymentUuidList(value.items);
		if ( "value" in value && (Array.isArray(value.value) || value.value instanceof Set || (value.value && typeof value.value === "object")) ) {
			return getDeploymentUuidList(value.value);
		}
		// Foundry expandObject may persist arrays as { "0": uuid, "1": uuid }.
		const values = Object.values(value).filter(entry => typeof entry === "string" && entry);
		if ( values.length ) return values;
	}
	if ( typeof value === "string" ) return [value];
	return [];
}

function resolveActorDocument(subject) {
	if ( !subject ) return null;
	if ( subject.documentName === "Actor" ) return subject;
	if ( typeof subject !== "string" ) return null;
	return globalThis.fromUuidSync?.(subject)
		?? globalThis.game?.actors?.get(subject)
		?? null;
}

function getStarshipCrewState(actor, legacySystem = {}) {
	const deployment = legacySystem.attributes?.deployment ?? {};
	const pilotUuid = deployment.pilot?.value ?? deployment.pilot ?? null;
	const crewUuids = getDeploymentUuidList(deployment.crew);
	const passengerUuids = getDeploymentUuidList(deployment.passenger);
	const user = globalThis.game?.user;
	const isMembershipVisible = uuid => isStarshipCrewMembershipVisibleToUser(actor, uuid, user);
	const visiblePilotUuid = pilotUuid && isMembershipVisible(pilotUuid) ? pilotUuid : null;
	const visibleCrewUuids = crewUuids.filter(isMembershipVisible);
	const visiblePassengerUuids = passengerUuids.filter(isMembershipVisible);
	const pilotActor = resolveActorDocument(visiblePilotUuid);
	// Bug 29D: deployed/stealth set is membership-only (Pilot + Crew + Passenger).
	// Ignore deployment.active.value so stale Active cannot uniquely affect stealth pace.
	// Stealth remains mechanical (includes hidden members); display fields are Layer-1 filtered.
	const deployedActors = Array.from(new Set([pilotUuid, ...crewUuids, ...passengerUuids]))
		.map(resolveActorDocument)
		.filter(Boolean);

	const canStealthAtNormalPace = deployedActors.some(crewActor => {
		return Array.from(crewActor?.items ?? []).some(item => /move stealthily at a normal pace/i.test(getItemDescriptionText(item)));
	});

	return {
		pilotAssigned: Boolean(visiblePilotUuid),
		pilotName: pilotActor?.name ?? "",
		activeCrewName: "",
		crewCount: visibleCrewUuids.length,
		passengerCount: visiblePassengerUuids.length,
		pilotSkill: toFiniteNumber(pilotActor?.system?.skills?.pil?.value, 0) ?? 0,
		stealthPace: canStealthAtNormalPace ? "normal" : "slow"
	};
}

function getHyperdriveClassFromItem(item) {
	const candidateText = `${item?.name ?? ""} ${getItemDescriptionText(item)}`.trim();
	if ( !/hyperdrive/i.test(candidateText) ) return null;
	if ( /escape pod/i.test(candidateText) ) return null;
	const match = /class\s*(\d+)/i.exec(candidateText);
	return toFiniteNumber(match?.[1], null);
}

function deriveStarshipTravelData({ legacySystem = {}, items = [], crewState = {} } = {}) {
	const attributes = legacySystem.attributes ?? {};
	const storedHyperdriveClass = toFiniteNumber(
		attributes?.equip?.hyperdrive?.class ?? attributes?.travel?.hyperdriveClass,
		null
	);
	const itemHyperdriveClasses = items
		.map(getHyperdriveClassFromItem)
		.filter(value => value !== null);
	const hyperdriveClass = storedHyperdriveClass ?? (itemHyperdriveClasses.length ? Math.min(...itemHyperdriveClasses) : 0);
	return {
		pace: normalizeTravelPace(attributes?.travel?.pace ?? attributes?.movement?.travelPace, "normal"),
		stealthPace: normalizeTravelPace(attributes?.travel?.stealthPace ?? crewState.stealthPace, crewState.stealthPace ?? "slow"),
		hyperdriveClass
	};
}

function getLegacyAbilityValue(currentAbility, legacyAbility) {
	if ( currentAbility && (typeof currentAbility === "object") ) {
		const directValue = toFiniteNumber(currentAbility.value);
		if ( directValue !== null ) return directValue;
	}

	const scalarValue = toFiniteNumber(currentAbility);
	if ( scalarValue !== null ) return scalarValue;

	if ( legacyAbility && (typeof legacyAbility === "object") ) {
		const legacyValue = toFiniteNumber(legacyAbility.value);
		if ( legacyValue !== null ) return legacyValue;
	}

	return 10;
}

function hasPreparedAbilityShape(ability) {
	return !!ability
		&& (typeof ability === "object")
		&& !!ability.save
		&& (typeof ability.save === "object")
		&& !!ability.check
		&& (typeof ability.check === "object");
}

function canPersistVehicleAbilities(abilities = {}) {
	if ( !hasOwnKeys(abilities) ) return false;
	return Object.values(abilities).every(hasPreparedAbilityShape);
}

function makeAbilityStage(stage = {}, fallbackStage = {}) {
	return {
		value: toFiniteNumber(stage?.value, toFiniteNumber(fallbackStage?.value, 0)) ?? 0,
		roll: makeAbilityRoll(stage?.roll ?? fallbackStage?.roll)
	};
}

function makeVehicleAbilityEntry(currentAbility, legacyAbility) {
	const current = currentAbility && (typeof currentAbility === "object") ? cloneData(currentAbility) : {};
	const fallback = legacyAbility && (typeof legacyAbility === "object") ? legacyAbility : {};
	const ability = hasOwnKeys(current) ? current : {};

	ability.value = getLegacyAbilityValue(currentAbility, legacyAbility);
	ability.proficient = toFiniteNumber(ability.proficient, toFiniteNumber(fallback.proficient, 0)) ?? 0;
	ability.max = toFiniteNumber(ability.max, toFiniteNumber(fallback.max));
	ability.bonuses = {
		check: ability.bonuses?.check ?? fallback.bonuses?.check ?? "",
		save: ability.bonuses?.save ?? fallback.bonuses?.save ?? ""
	};
	ability.check = makeAbilityStage(ability.check, fallback.check);
	ability.save = makeAbilityStage(ability.save, fallback.save);
	return ability;
}

export function mergeVehicleAbilityValues(existingAbilities = {}, legacyAbilities = {}) {
	const current = hasOwnKeys(existingAbilities) ? existingAbilities : {};
	const legacy = hasOwnKeys(legacyAbilities) ? legacyAbilities : {};
	const keys = Object.keys(current);
	if ( !keys.length ) return undefined;

	return keys.reduce((abilities, key) => {
		abilities[key] = makeVehicleAbilityEntry(current[key], legacy[key]);
		return abilities;
	}, {});
}

export function normalizeSourceField(source) {
	if ( !source || (typeof source !== "object" && typeof source !== "string") ) return {};
	if ( typeof source === "object" ) return source;
	const trimmed = source.trim();
	return trimmed && (trimmed !== "[object Object]") ? { custom: trimmed } : {};
}

function mergeStarshipSystemData(...systems) {
	return systems.reduce((merged, system) => {
		if ( !isRecord(system) ) return merged;
		for ( const [key, value] of Object.entries(system) ) {
			if ( isRecord(value) && isRecord(merged[key]) ) merged[key] = mergeStarshipSystemData(merged[key], value);
			else merged[key] = cloneData(value);
		}
		return merged;
	}, {});
}

function buildLegacySystemFromCharacterStarship(actor, starshipFlag = {}) {
	const currentSystem = cloneData(actor.system ?? {});
	const legacySystem = cloneData(starshipFlag.legacySystem ?? {});
	const resources = cloneData(starshipFlag.resources ?? {});
	const details = cloneData(starshipFlag.details ?? {});
	const classification = cloneData(starshipFlag.classification ?? {});
	const currentAttributes = currentSystem.attributes ?? {};
	const legacyAttributes = (legacySystem.attributes ??= {});

	legacySystem.details ??= {};
	legacySystem.details.source = normalizeSourceField(currentSystem.details?.source ?? legacySystem.details?.source);
	legacySystem.details.tier = toFiniteNumber(details.tier, toFiniteNumber(currentSystem.details?.tier, toFiniteNumber(legacySystem.details?.tier, 0))) ?? 0;
	if ( currentSystem.details?.type !== undefined ) legacySystem.details.type = cloneData(currentSystem.details.type);

	legacySystem.traits ??= {};
	legacySystem.traits.size = classification.size ?? currentSystem.traits?.size ?? legacySystem.traits?.size ?? "med";

	legacyAttributes.ac ??= {};
	legacyAttributes.ac.flat = toFiniteNumber(
		currentAttributes.ac?.flat ?? currentAttributes.ac?.value,
		toFiniteNumber(legacyAttributes.ac.flat, 10)
	) ?? 10;

	legacyAttributes.hp ??= {};
	legacyAttributes.hp.value = toFiniteNumber(currentAttributes.hp?.value, toFiniteNumber(legacyAttributes.hp.value, 0)) ?? 0;
	legacyAttributes.hp.max = toFiniteNumber(currentAttributes.hp?.max, toFiniteNumber(legacyAttributes.hp.max, legacyAttributes.hp.value)) ?? legacyAttributes.hp.value;
	legacyAttributes.hp.temp = toFiniteNumber(currentAttributes.hp?.temp, toFiniteNumber(legacyAttributes.hp.temp, 0)) ?? 0;
	legacyAttributes.hp.tempmax = toFiniteNumber(currentAttributes.hp?.tempmax, toFiniteNumber(legacyAttributes.hp.tempmax, 0)) ?? 0;

	legacyAttributes.movement ??= {};
	legacyAttributes.movement.space = toFiniteNumber(
		currentAttributes.movement?.fly ?? currentAttributes.speed?.space,
		toFiniteNumber(legacyAttributes.movement.space, 0)
	) ?? 0;
	legacyAttributes.movement.units = currentAttributes.movement?.units ?? legacyAttributes.movement.units ?? "ft";
	legacyAttributes.movement.turn = toFiniteNumber(legacyAttributes.movement.turn, 0) ?? 0;

	legacyAttributes.systemDamage = toFiniteNumber(resources.systemDamage, toFiniteNumber(legacyAttributes.systemDamage, 0)) ?? 0;
	legacyAttributes.prof = toFiniteNumber(currentAttributes.prof, toFiniteNumber(legacyAttributes.prof, 0)) ?? 0;

	legacyAttributes.fuel ??= {};
	legacyAttributes.fuel.value = toFiniteNumber(resources.fuel?.value, toFiniteNumber(legacyAttributes.fuel.value, 0)) ?? 0;
	legacyAttributes.fuel.cost = toFiniteNumber(resources.fuel?.cost, toFiniteNumber(legacyAttributes.fuel.cost, 0)) ?? 0;
	legacyAttributes.fuel.fuelCap = toFiniteNumber(resources.fuel?.fuelCap, toFiniteNumber(legacyAttributes.fuel.fuelCap, 0)) ?? 0;

	legacyAttributes.power ??= {};
	legacyAttributes.power.routing = resources.power?.routing ?? legacyAttributes.power.routing ?? "none";
	legacyAttributes.power.die = resources.power?.die ?? legacyAttributes.power.die ?? "d1";
	for ( const zone of STARSHIP_POWER_DIE_SLOTS ) {
		legacyAttributes.power[zone] ??= {};
		legacyAttributes.power[zone].value = toFiniteNumber(
			resources.power?.[zone]?.value,
			toFiniteNumber(legacyAttributes.power[zone].value, 0)
		) ?? 0;
		legacyAttributes.power[zone].max = toFiniteNumber(
			resources.power?.[zone]?.max,
			toFiniteNumber(legacyAttributes.power[zone].max, 0)
		) ?? 0;
	}

	if ( resources.deployment ) legacyAttributes.deployment = cloneData(resources.deployment);
	if ( resources.hullDice ) legacyAttributes.hull = cloneData(resources.hullDice);
	if ( resources.shieldDice ) legacyAttributes.shld = cloneData(resources.shieldDice);
	if ( resources.cost ) legacyAttributes.cost = cloneData(resources.cost);
	if ( resources.mods ) legacyAttributes.mods = cloneData(resources.mods);
	if ( resources.workforce ) legacyAttributes.workforce = cloneData(resources.workforce);
	if ( resources.equip ) legacyAttributes.equip = cloneData(resources.equip);

	if ( !hasOwnKeys(legacySystem.abilities) && hasOwnKeys(currentSystem.abilities) ) legacySystem.abilities = cloneData(currentSystem.abilities);
	if ( !hasOwnKeys(legacySystem.skills) && hasOwnKeys(currentSystem.skills) ) legacySystem.skills = cloneData(currentSystem.skills);
	return legacySystem;
}

function buildVehicleSystem(legacySystem = {}, items = [], existingSystem = {}) {
	const runtimeSystem = mergeStarshipSystemData(legacySystem, existingSystem);
	const starshipSize = getLegacyStarshipSize(items);
	const sizeSystem = getLegacySizeSystem(starshipSize);
	const hpValue = toFiniteNumber(runtimeSystem.attributes?.hp?.value, 0) ?? 0;
	const resolvedHpMax = toFiniteNumber(runtimeSystem.attributes?.hp?.max, hpValue) ?? hpValue;
	const cargoCap = toFiniteNumber(sizeSystem.cargoCap, toFiniteNumber(runtimeSystem.attributes?.capacity?.cargo, 0)) ?? 0;
	const resolvedCargoCap = toFiniteNumber(runtimeSystem.attributes?.capacity?.cargo, cargoCap) ?? cargoCap;
	const routing = getPowerRoutingState(runtimeSystem);
	const slowedLevel = getStarshipSlowedLevelFromSystemDamageLevel(runtimeSystem.attributes?.systemDamage ?? 0);
	const derivedMovement = deriveStarshipMovementData({
		legacySystem: runtimeSystem,
		items,
		liveAbilities: runtimeSystem.abilities ?? {},
		liveMovement: runtimeSystem.attributes?.movement ?? {},
		sizeSystem,
		routingState: routing,
		slowedLevel
	});
	const derivedTravel = deriveStarshipTravelData({ legacySystem: runtimeSystem, items });
	applyDerivedStarshipMovement(runtimeSystem, derivedMovement);
	applyDerivedStarshipTravel(runtimeSystem, derivedTravel);
	const acFlat = toFiniteNumber(runtimeSystem.attributes?.ac?.flat, 10) ?? 10;
	// SotG Starships calc: armor base + capped Dex + ac.bonus. Preserve explicit Flat/Custom/etc.
	const storedAcCalc = runtimeSystem.attributes?.ac?.calc;
	let acCalc = (typeof storedAcCalc === "string" && storedAcCalc) ? storedAcCalc : "starship";
	// Prior slice defaulted to Equipped Armor (`default`); migrate to dedicated Starships calc.
	if ( acCalc === "default" ) acCalc = "starship";

	const system = cloneData(runtimeSystem) ?? {};
	// Remove legacy vehicleType — dnd5e migrates it to details.type, which would overwrite our "space" value.
	delete system.vehicleType;
	system.attributes = mergeStarshipSystemData(runtimeSystem.attributes, {
		ac: {
			calc: acCalc,
			flat: acFlat,
			motionless: runtimeSystem.attributes?.ac?.motionless ?? ""
		},
		actions: {
			stations: runtimeSystem.attributes?.actions?.stations ?? true
		},
		hp: {
			value: hpValue,
			max: resolvedHpMax,
			dt: runtimeSystem.attributes?.hp?.dt ?? null,
			mt: runtimeSystem.attributes?.hp?.mt ?? null
		},
		capacity: {
			creature: runtimeSystem.attributes?.capacity?.creature ?? "",
			cargo: resolvedCargoCap
		},
		movement: {
			space: derivedMovement.space,
			walk: 0,
			fly: 0,
			units: derivedMovement.units ?? runtimeSystem.attributes?.movement?.units ?? "ft",
			hover: runtimeSystem.attributes?.movement?.hover ?? true
		}
	});
	const tierFromDetails = toFiniteNumber(runtimeSystem.details?.tier, null);
	const tierFromSize = toFiniteNumber(sizeSystem?.tier, null);
	const resolvedTier = tierFromDetails !== null ? tierFromDetails : tierFromSize;

	system.details = mergeStarshipSystemData(runtimeSystem.details, {
		source: normalizeSourceField(runtimeSystem.details?.source),
		type: runtimeSystem.details?.type ?? "space",
		...(resolvedTier !== null ? { tier: resolvedTier } : {})
	});
	system.traits = mergeStarshipSystemData(runtimeSystem.traits, {
		size: sizeSystem.size ?? runtimeSystem.traits?.size ?? "med",
		dimensions: runtimeSystem.traits?.dimensions ?? "",
		di: cloneData(runtimeSystem.traits?.di) ?? { value: [], bypasses: [], custom: "" },
		ci: cloneData(runtimeSystem.traits?.ci) ?? { value: [], custom: "" }
	});
	system.cargo = mergeStarshipSystemData(runtimeSystem.cargo, {
		crew: cloneData(runtimeSystem.cargo?.crew) ?? [],
		passengers: cloneData(runtimeSystem.cargo?.passengers) ?? []
	});
	return system;
}

function isLegacyStarshipLikeActor(data) {
	if ( data?.type === "starship" ) return true;
	if ( data?.flags?.sw5e?.legacyStarshipActor?.type === "starship" ) return true;
	if ( isCharacterBackedStarship(data) ) return true;
	if ( data?.type !== "vehicle" ) return false;

	return Array.isArray(data.items) && data.items.some(item => {
		if ( ["starshipsize", "starshipmod", "deployment"].includes(item.type) ) return true;
		if ( item.flags?.sw5e?.legacyStarshipSize || item.flags?.sw5e?.legacyStarshipMod || item.flags?.sw5e?.legacyDeployment ) return true;
		if ( item.flags?.sw5e?.[STARSHIP_CHARACTER_FLAG]?.role ) return true;
		const pack = getLegacyPackHint(item);
		return pack ? LEGACY_STARSHIP_PACKS.has(pack) : false;
	});
}

export function normalizeLegacyStarshipItemData(data) {
	if ( !data || (typeof data !== "object") ) return false;

	const legacySystem = cloneData(data.system ?? {});
	const flags = ensureSw5eFlags(data);
	const characterFlag = flags[STARSHIP_CHARACTER_FLAG];
	let changed = false;

	if ( characterFlag?.role === "classification" && !flags.legacyStarshipSize ) {
		flags.legacyStarshipSize = cloneData(characterFlag.classification?.raw ?? characterFlag.classification ?? legacySystem);
		changed = true;
	}

	if ( characterFlag?.role === "modification" && !flags.legacyStarshipMod ) {
		flags.legacyStarshipMod = legacySystem;
		changed = true;
	}

	if ( ["deployment", "venture"].includes(characterFlag?.role) && !flags.legacyDeployment ) {
		flags.legacyDeployment = legacySystem;
		changed = true;
	}

	switch ( data.type ) {
		case "deployment":
			flags.legacyDeployment = legacySystem;
			data.type = "feat";
			data.system = {
				description: cloneData(legacySystem.description) ?? { value: "", chat: "" },
				source: normalizeSourceField(legacySystem.source),
				type: {
					value: "deployment",
					subtype: ""
				},
				advancement: cloneData(legacySystem.advancement) ?? []
			};
			return true;

		case "starshipsize":
			flags.legacyStarshipSize = legacySystem;
			data.type = "feat";
			data.system = {
				description: cloneData(legacySystem.description) ?? { value: "", chat: "" },
				source: normalizeSourceField(legacySystem.source),
				type: {
					value: "starship",
					subtype: ""
				},
				advancement: cloneData(legacySystem.advancement) ?? []
			};
			return true;

		case "starshipmod":
			flags.legacyStarshipMod = legacySystem;
			data.type = "loot";
			data.system = {
				description: cloneData(legacySystem.description) ?? { value: "", chat: "" },
				source: normalizeSourceField(legacySystem.source),
				quantity: legacySystem.quantity ?? 1,
				weight: cloneData(legacySystem.weight) ?? { value: 0, units: "lb" },
				price: cloneData(legacySystem.price) ?? { value: 0, denomination: getBaseCurrencyKey() },
				rarity: legacySystem.rarity ?? "",
				identified: legacySystem.identified ?? true
			};
			if ( data.system?.price ) {
				data.system.price.denomination = normalizeSwPriceDenomination(data.system.price.denomination);
			}
			if ( legacySystem.container !== undefined ) data.system.container = legacySystem.container;
			return true;
	}

	return changed;
}

export function normalizeLegacyStarshipActorData(data) {
	if ( !data || (typeof data !== "object") || !isLegacyStarshipLikeActor(data) ) return false;

	const flags = ensureSw5eFlags(data);
	const legacyRecord = flags.legacyStarshipActor;
	const characterRecord = flags[STARSHIP_CHARACTER_FLAG];
	const currentSystem = cloneData(data.system ?? {});
	const legacySystem = characterRecord?.enabled
		? buildLegacySystemFromCharacterStarship(data, characterRecord)
		: cloneData(legacyRecord?.type === "starship" ? legacyRecord.system ?? {} : currentSystem);

	data.type = "vehicle";
	data.flags ??= {};
	data.flags.core ??= {};
	delete data.flags.core.sheetClass;
	data.system = buildVehicleSystem(legacySystem, data.items ?? [], currentSystem);

	const abilities = mergeVehicleAbilityValues(currentSystem.abilities, legacySystem.abilities);
	if ( canPersistVehicleAbilities(abilities) ) data.system.abilities = abilities;

	if ( Array.isArray(data.items) ) {
		for ( const item of data.items ) normalizeLegacyStarshipItemData(item);
	}

	flags.legacyStarshipActor = {
		type: "starship",
		system: cloneData(data.system ?? legacySystem)
	};
	const existingVariant = legacyRecord?.variant
		?? characterRecord?.variant
		?? flags.legacyStarshipActor?.variant;
	if ( existingVariant === "spaceStation" ) {
		flags.legacyStarshipActor.variant = "spaceStation";
	}

	return true;
}

export function createBlankLegacyStarshipActorData(data = {}) {
	const source = cloneData(data) ?? {};
	source.type = "vehicle";
	source.items = Array.isArray(source.items) ? source.items : [];
	source.system = cloneData(source.system ?? {});

	const flags = ensureSw5eFlags(source);
	delete flags.createStarship;
	delete flags.createSpaceStation;
	const priorVariant = flags.legacyStarshipActor?.variant;
	flags.legacyStarshipActor = {
		type: "starship",
		system: cloneData(flags.legacyStarshipActor?.system ?? source.system ?? {})
	};
	if ( priorVariant === "spaceStation" ) flags.legacyStarshipActor.variant = "spaceStation";

	normalizeLegacyStarshipActorData(source);
	// Blank starship creation: seed the same dnd5e vehicle-sheet flag so the first paint matches sheet-side defaulting (see `ensureStarshipDefaultShowVehicleAbilities`).
	source.flags ??= {};
	source.flags.dnd5e = { ...(source.flags.dnd5e ?? {}) };
	if ( source.flags.dnd5e.showVehicleAbilities === undefined ) source.flags.dnd5e.showVehicleAbilities = true;
	return source;
}

function getStoredLegacyStarshipActorSystem(actor) {
	return actor?.flags?.sw5e?.legacyStarshipActor?.system ?? {};
}

export function isStarshipFlagVehicle(actor) {
	return actor?.type === "vehicle" && actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

export {
	getStarshipVariant,
	getStarshipModificationInstallDcAdjustment,
	isActiveSpaceStationActor,
	isSw5eSpaceStationActor,
	STARSHIP_VARIANT_SPACE_STATION,
	STARSHIP_VARIANT_STARSHIP
} from "./space-station.mjs";

export function getLegacyStarshipActorSystem(actor) {
	const flagSystem = getStoredLegacyStarshipActorSystem(actor);
	const srcSystem = actor?._source?.system ?? {};
	const liveSystem = actor?.system ?? {};
	const merged = mergeStarshipSystemData(flagSystem, srcSystem, liveSystem);

	if ( isStarshipFlagVehicle(actor) ) {
		// Vehicle `actor.system.skills` is not part of the stock dnd5e vehicle schema; prepared data can be empty or
		// out of sync. A three-way merge would apply that object last and clobber real skill data from flags/_source.
		merged.skills = mergeStarshipSystemData(flagSystem.skills ?? {}, srcSystem.skills ?? {});
		// SW5e fuel + power routing live on `system.attributes` in legacy data, but dnd5e's vehicle DataModel does not
		// retain those keys on `actor.system` / may leave stale copies in `_source`. Sidebar + Systems tab mirror edits
		// into `flags.sw5e.legacyStarshipActor.system`; re-apply that snapshot last so it wins over `_source` noise.
		if ( hasOwnKeys(flagSystem.attributes?.fuel) ) {
			merged.attributes ??= {};
			merged.attributes.fuel = mergeStarshipSystemData(merged.attributes.fuel ?? {}, flagSystem.attributes.fuel);
		}
		// Food: overlay persisted value/foodCap/cost from flags only.
		// Never flag-last foodCapMod — prepared AE ADD must remain visible on system.
		if ( hasOwnKeys(flagSystem.attributes?.food) ) {
			merged.attributes ??= {};
			const flagFood = flagSystem.attributes.food;
			const baseFood = merged.attributes.food ?? {};
			merged.attributes.food = {
				...baseFood,
				...(flagFood.value !== undefined ? { value: flagFood.value } : {}),
				...(flagFood.foodCap !== undefined ? { foodCap: flagFood.foodCap } : {}),
				...(flagFood.cost !== undefined ? { cost: flagFood.cost } : {})
			};
			if ( baseFood.foodCapMod !== undefined ) {
				merged.attributes.food.foodCapMod = baseFood.foodCapMod;
			}
		}
		if ( hasOwnKeys(flagSystem.attributes?.power) ) {
			merged.attributes ??= {};
			merged.attributes.power = mergeStarshipSystemData(merged.attributes.power ?? {}, flagSystem.attributes.power);
		}
		if ( hasOwnKeys(flagSystem.attributes?.death) ) {
			merged.attributes ??= {};
			merged.attributes.death = mergeStarshipSystemData(merged.attributes.death ?? {}, flagSystem.attributes.death);
		}
	}

	return merged;
}

function getAbilityModifier(abilities = {}, legacyAbilities = {}, abilityId) {
	const abilityValue = getLegacyAbilityValue(abilities?.[abilityId], legacyAbilities?.[abilityId]);
	return Math.floor((abilityValue - 10) / 2);
}

function getMovementBaseValue(value) {
	return toFiniteNumber(value, null);
}

/** Canonical Actor paths for Role published movement (OVERRIDE Active Effects). */
export const STARSHIP_ROLE_MOVEMENT_SPACE_KEY = "system.attributes.movement.space";
export const STARSHIP_ROLE_MOVEMENT_TURN_KEY = "system.attributes.movement.turn";
export const STARSHIP_ACTIVE_EFFECT_MODE_OVERRIDE = 5;

function normalizeMovementEffectKey(key) {
	return String(key ?? "").trim();
}

function isCanonicalRoleMovementOverrideChange(change) {
	const key = normalizeMovementEffectKey(change?.key);
	const mode = Number(change?.mode);
	if ( mode !== STARSHIP_ACTIVE_EFFECT_MODE_OVERRIDE ) return false;
	return key === STARSHIP_ROLE_MOVEMENT_SPACE_KEY || key === STARSHIP_ROLE_MOVEMENT_TURN_KEY;
}

/**
 * Published Role movement from item Active Effect OVERRIDE changes (correct keys only).
 * Does not read prepared Actor movement (avoids routed/Slowed circularity).
 */
export function getRolePublishedMovementFromItems(items = []) {
	const roles = (items ?? []).filter(item => isRoleSpeedProfileItem(item));
	let space = null;
	let turn = null;
	let source = null;
	for ( const item of roles ) {
		const effects = item.effects?.contents ?? item.effects ?? [];
		for ( const effect of effects ) {
			if ( effect?.disabled ) continue;
			for ( const change of effect.changes ?? [] ) {
				if ( !isCanonicalRoleMovementOverrideChange(change) ) continue;
				const key = normalizeMovementEffectKey(change.key);
				const value = toFiniteNumber(change.value, null);
				if ( value === null ) continue;
				if ( key === STARSHIP_ROLE_MOVEMENT_SPACE_KEY ) space = value;
				if ( key === STARSHIP_ROLE_MOVEMENT_TURN_KEY ) turn = value;
			}
		}
		if ( space !== null || turn !== null ) {
			source = item.name ?? "Role";
			break;
		}
	}
	return {
		space,
		turn,
		source,
		hasPublishedEffect: space !== null || turn !== null,
		roleCount: roles.length
	};
}

/**
 * Soft validation only — never blocks. Presentation may be deferred to sheet warnings.
 * @returns {{ code: string, message: string }[]}
 */
export function getStarshipRoleMovementValidationWarnings(items = [], sizeSystem = null) {
	const warnings = [];
	const roles = (items ?? []).filter(item => isRoleSpeedProfileItem(item));
	if ( roles.length > 1 ) {
		warnings.push({
			code: "duplicate-roles",
			message: "Multiple Role items are present; only the first Role movement source is used."
		});
	}
	const sizeId = String(sizeSystem?.identifier ?? sizeSystem?.id ?? "").toLowerCase();
	if ( sizeId && roles.length ) {
		for ( const role of roles ) {
			const req = String(role.system?.requirements ?? getLegacyItemSystem(role)?.requirements ?? "").toLowerCase();
			if ( !req ) continue;
			const sizeWord = sizeId === "gargantuan" ? "gargantuan" : sizeId;
			if ( req.includes("starship") && !req.includes(sizeWord) ) {
				warnings.push({
					code: "role-size-mismatch",
					message: `Role "${role.name ?? "Role"}" may not match starship size ${sizeId}.`
				});
			}
		}
	}
	return warnings;
}

/**
 * Resolve prepared combat movement base before routing/Slowed.
 *
 * Authority (no Size / Role-item-speed fallback; no soft recovery from live 0):
 * - Enabled Override controllers → published Role OVERRIDE values from item AEs
 * - Else underlying Actor `_source` movement (homebrew)
 * - Plus enabled Add-mode deltas on canonical paths (e.g. Combat Thrusters)
 *
 * Never use already Slowed/routed prepared live values as the base (prevents double Slowed
 * when sheet code re-calls derive after prepare wrote Slowed results).
 */
function resolveStarshipMovementBase({
	items = [],
	liveMovement = {},
	legacyMovement = {},
	fieldControllers = null,
	actor = null,
	addDeltas = null
} = {}) {
	const published = getRolePublishedMovementFromItems(items);
	const underlying = actor
		? getStarshipUnderlyingMovement(actor)
		: {
			space: getMovementBaseValue(legacyMovement.space),
			turn: getMovementBaseValue(legacyMovement.turn)
		};
	const deltas = addDeltas ?? (actor ? getStarshipMovementAddDeltas(actor) : { space: 0, turn: 0 });

	const pick = (field) => {
		const controlled = !!fieldControllers?.[field]?.controlled;
		let base = null;
		if ( controlled && published[field] !== null ) base = published[field];
		else if ( underlying[field] !== null && underlying[field] !== undefined ) base = underlying[field];
		else base = getMovementBaseValue(liveMovement?.[field]);
		if ( base === null ) base = getMovementBaseValue(legacyMovement?.[field]) ?? 0;
		return base + (Number(deltas[field]) || 0);
	};

	const space = pick("space");
	const turn = pick("turn");

	let profileSource = "Actor";
	if ( fieldControllers?.space?.controlled || fieldControllers?.turn?.controlled ) {
		profileSource = published.source ?? "Role AE";
	}

	return {
		space,
		turn,
		baseSpaceSpeed: published.space,
		baseTurnSpeed: published.turn,
		profileSource,
		published,
		fallbackSpace: underlying.space ?? 0,
		fallbackTurn: underlying.turn ?? underlying.space ?? 0
	};
}

/** Foundry ActiveEffect mode Add. */
const STARSHIP_ACTIVE_EFFECT_MODE_ADD = 2;

/**
 * Sum enabled Add-mode deltas on canonical movement paths (not Override).
 */
export function getStarshipMovementAddDeltas(actor) {
	const deltas = { space: 0, turn: 0 };
	if ( !actor ) return deltas;
	const effects = typeof actor.allApplicableEffects === "function"
		? [...actor.allApplicableEffects()]
		: (actor.appliedEffects ?? actor.effects?.contents ?? actor.effects ?? []);
	for ( const effect of effects ) {
		if ( !effect || effect.disabled ) continue;
		for ( const change of effect.changes ?? [] ) {
			const mode = Number(change?.mode);
			if ( mode !== STARSHIP_ACTIVE_EFFECT_MODE_ADD ) continue;
			const key = normalizeMovementEffectKey(change.key);
			const value = toFiniteNumber(change.value, null);
			if ( value === null ) continue;
			if ( key === STARSHIP_ROLE_MOVEMENT_SPACE_KEY ) deltas.space += value;
			else if ( key === STARSHIP_ROLE_MOVEMENT_TURN_KEY ) deltas.turn += value;
		}
	}
	return deltas;
}

export function getStarshipTravelPaceOptions() {
	return [
		{ value: "slow", labelKey: "DND5E.TravelPaceSlow", fallback: "Slow" },
		{ value: "normal", labelKey: "DND5E.TravelPaceNormal", fallback: "Normal" },
		{ value: "fast", labelKey: "DND5E.TravelPaceFast", fallback: "Fast" }
	];
}

/**
 * Enabled Active Effects that OVERRIDE canonical starship movement base fields.
 * Add-mode deltas (Combat Thrusters), disabled effects, and malformed keys are ignored.
 * @param {Actor} actor
 * @param {{ includeDisabled?: boolean }} [options]
 * @returns {{
 *   space: { controlled: boolean, ambiguous: boolean, effectNames: string[] },
 *   turn: { controlled: boolean, ambiguous: boolean, effectNames: string[] }
 * }}
 */
export function getStarshipMovementFieldControllers(actor, { includeDisabled = false } = {}) {
	const empty = () => ({ controlled: false, ambiguous: false, effectNames: [] });
	const result = { space: empty(), turn: empty() };
	if ( !actor ) return result;

	const byField = { space: new Map(), turn: new Map() };
	const effects = typeof actor.allApplicableEffects === "function"
		? [...actor.allApplicableEffects()]
		: (actor.appliedEffects ?? actor.effects?.contents ?? actor.effects ?? []);
	for ( const effect of effects ) {
		if ( !effect ) continue;
		if ( !includeDisabled && effect.disabled ) continue;
		if ( includeDisabled && !effect.disabled ) continue;
		for ( const change of effect.changes ?? [] ) {
			if ( !isCanonicalRoleMovementOverrideChange(change) ) continue;
			const key = normalizeMovementEffectKey(change.key);
			const field = key === STARSHIP_ROLE_MOVEMENT_SPACE_KEY ? "space" : "turn";
			const id = effect.id ?? effect._id ?? `${effect.name}:${field}`;
			if ( !byField[field].has(id) ) {
				byField[field].set(id, effect.name ?? "Active Effect");
			}
		}
	}

	for ( const field of ["space", "turn"] ) {
		const names = [...byField[field].values()];
		result[field] = {
			controlled: names.length > 0,
			ambiguous: names.length > 1,
			effectNames: names
		};
	}
	return result;
}

/**
 * Soft warning when multiple enabled Override effects control the same movement field.
 */
export function getStarshipMovementControllerAmbiguityWarnings(fieldControllers = {}) {
	const warnings = [];
	for ( const field of ["space", "turn"] ) {
		const info = fieldControllers[field];
		if ( !info?.ambiguous ) continue;
		const label = field === "space" ? "Space" : "Turn";
		warnings.push({
			code: `duplicate-movement-override-${field}`,
			message: `Multiple enabled Override Active Effects control ${label} movement; disable or delete extras from the Effects tab.`
		});
	}
	return warnings;
}

/**
 * Warning when the user tries to edit an underlying field controlled by an enabled Override AE.
 * Never hard-codes an effect name — only uses names from detected controllers.
 */
export function buildStarshipMovementControlWarning(fieldControllers = {}, blockedFields = []) {
	const fields = (blockedFields ?? []).filter(field => fieldControllers[field]?.controlled);
	if ( !fields.length ) return null;

	const labels = fields.map(field => (field === "space" ? "Space" : "Turn"));
	const labelText = labels.join(" and ");
	const names = [...new Set(fields.flatMap(field => fieldControllers[field]?.effectNames ?? []))];
	const ambiguous = fields.some(field => fieldControllers[field]?.ambiguous);

	if ( names.length === 1 && !ambiguous ) {
		const verb = fields.length === 1 ? "is" : "are";
		return `${labelText} ${verb} currently overridden by '${names[0]}.' Disable or delete that effect from the Effects tab before setting homebrew movement values.`;
	}

	if ( fields.length === 2 ) {
		return "Space and/or Turn is currently overridden by an enabled Active Effect. Disable or delete the applicable effect from the Effects tab before setting a homebrew movement value.";
	}
	return `${labelText} is currently overridden by an enabled Active Effect. Disable or delete the applicable effect from the Effects tab before setting a homebrew movement value.`;
}

/**
 * Resolve Movement dialog saves against underlying Actor values + controlling Override effects.
 * Controlled changed fields are stripped (not saved). Uncontrolled changed fields persist normally.
 * @returns {{ movement: object, blockedFields: string[], warning: string|null, savedFields: string[] }}
 */
export function resolveStarshipMovementSourceUpdate({
	underlying = {},
	proposedMovement = {},
	pendingKeys = null,
	fieldControllers = null
} = {}) {
	const movement = { ...(proposedMovement ?? {}) };
	const controllers = fieldControllers ?? { space: { controlled: false }, turn: { controlled: false } };
	const blockedFields = [];
	const savedFields = [];

	if ( pendingKeys ) {
		for ( const key of ["space", "turn", "walk", "fly", "units"] ) {
			if ( pendingKeys.has(key) ) continue;
			delete movement[key];
		}
	}

	for ( const key of ["walk", "fly"] ) {
		if ( key in movement ) delete movement[key];
	}

	for ( const key of ["space", "turn"] ) {
		if ( !(key in movement) ) continue;
		const next = toFiniteNumber(movement[key], null);
		if ( next === null ) {
			delete movement[key];
			continue;
		}
		const rounded = Math.max(0, Math.round(next));
		movement[key] = rounded;
		const prior = toFiniteNumber(underlying[key], null);
		const changed = prior === null ? true : rounded !== Math.round(prior);
		if ( !changed ) {
			delete movement[key];
			continue;
		}
		if ( controllers[key]?.controlled ) {
			delete movement[key];
			blockedFields.push(key);
			continue;
		}
		savedFields.push(key);
	}

	return {
		movement,
		blockedFields,
		savedFields,
		warning: buildStarshipMovementControlWarning(controllers, blockedFields)
	};
}

/**
 * Underlying stored Actor movement (homebrew / editable source), not prepared live.
 */
export function getStarshipUnderlyingMovement(actor) {
	const src = actor?._source?.system?.attributes?.movement
		?? actor?.system?.attributes?.movement
		?? {};
	return {
		space: toFiniteNumber(src.space, null),
		turn: toFiniteNumber(src.turn, null),
		units: src.units ?? "ft"
	};
}

/**
 * Starship combat movement (Bug 11 / Phase 2B — Role AE authority):
 * Underlying / AE-prepared live base → Power Routing on space → Slowed.
 * No movementOverrides, Role item speed runtime fallback, or Size movement fallback.
 */
export function deriveStarshipMovementData({
	legacySystem = {},
	items = [],
	liveAbilities = {},
	liveMovement = {},
	sizeSystem = null,
	routingState = null,
	slowedLevel = 0,
	spaceStationFixed = false,
	applyRouting = true,
	fieldControllers = null,
	actor = null
} = {}) {
	void liveAbilities;
	const resolvedSizeSystem = sizeSystem ?? getLegacySizeSystem(getLegacyStarshipSize(items));
	const legacyMovement = legacySystem.attributes?.movement ?? {};
	const routing = routingState ?? getPowerRoutingState(legacySystem);
	const controllers = fieldControllers ?? (actor ? getStarshipMovementFieldControllers(actor) : null);
	const resolved = resolveStarshipMovementBase({
		items,
		liveMovement,
		legacyMovement,
		fieldControllers: controllers,
		actor
	});
	const units = liveMovement.units ?? legacyMovement.units ?? "ft";
	const roleWarnings = [
		...getStarshipRoleMovementValidationWarnings(items, resolvedSizeSystem),
		...getStarshipMovementControllerAmbiguityWarnings(controllers ?? {})
	];

	if ( spaceStationFixed ) {
		const { space, turn } = getSpaceStationFixedMovement();
		return {
			space,
			turn,
			units,
			baseSpaceSpeed: space,
			baseTurnSpeed: turn,
			profileSource: "spaceStation",
			enginesMultiplier: 1,
			slowedLevel: 0,
			spaceBeforeSlowed: space,
			turnBeforeSlowed: turn,
			spaceStationFixed: true,
			roleWarnings: []
		};
	}

	let space = toFiniteNumber(resolved.space, resolved.fallbackSpace) ?? resolved.fallbackSpace;
	let turn = toFiniteNumber(resolved.turn, resolved.fallbackTurn) ?? resolved.fallbackTurn;

	const enginesMultiplier = applyRouting ? routing.enginesMultiplier : 1;
	if ( enginesMultiplier !== 1 ) {
		space = Math.floor(space * enginesMultiplier);
	}

	const resolvedSlowedLevel = Math.max(0, Math.trunc(Number(slowedLevel)) || 0);
	const spaceBeforeSlowed = space;
	const turnBeforeSlowed = turn;
	if ( resolvedSlowedLevel > 0 ) {
		space = applyStarshipSlowedToSpeed(space, resolvedSlowedLevel);
		turn = applyStarshipSlowedToSpeed(turn, resolvedSlowedLevel);
	}

	return {
		space: toFiniteNumber(space, resolved.fallbackSpace) ?? resolved.fallbackSpace,
		turn: toFiniteNumber(turn, resolved.fallbackTurn) ?? resolved.fallbackTurn,
		units,
		baseSpaceSpeed: resolved.baseSpaceSpeed,
		baseTurnSpeed: resolved.baseTurnSpeed,
		profileSource: resolved.profileSource,
		enginesMultiplier,
		slowedLevel: resolvedSlowedLevel,
		spaceBeforeSlowed: toFiniteNumber(spaceBeforeSlowed, resolved.fallbackSpace) ?? resolved.fallbackSpace,
		turnBeforeSlowed: toFiniteNumber(turnBeforeSlowed, resolved.fallbackTurn) ?? resolved.fallbackTurn,
		spaceStationFixed: false,
		roleWarnings
	};
}

export function applyDerivedStarshipMovement(legacySystem = {}, movement = {}) {
	const attributes = (legacySystem.attributes ??= {});
	const legacyMovement = (attributes.movement ??= {});
	if ( movement.space !== undefined ) legacyMovement.space = movement.space;
	if ( movement.turn !== undefined ) legacyMovement.turn = movement.turn;
	if ( movement.units ) legacyMovement.units = movement.units;
	return legacyMovement;
}

export function applyDerivedStarshipTravel(legacySystem = {}, travel = {}) {
	const attributes = (legacySystem.attributes ??= {});
	const travelData = (attributes.travel ??= {});
	travelData.pace = normalizeTravelPace(travel.pace, "normal");
	travelData.stealthPace = normalizeTravelPace(travel.stealthPace, "slow");
	travelData.hyperdriveClass = toFiniteNumber(travel.hyperdriveClass, 0) ?? 0;
	attributes.equip ??= {};
	attributes.equip.hyperdrive ??= {};
	if ( travelData.hyperdriveClass > 0 ) attributes.equip.hyperdrive.class = travelData.hyperdriveClass;
	return travelData;
}

export function getDerivedStarshipRuntime(actor, { liveAbilities, liveMovement, showPowerRouting } = {}) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const items = actor?.items?.contents ?? actor?._source?.items ?? [];
	const routing = resolveStarshipPowerRoutingState(actor, legacySystem, { showPowerRouting });
	const crew = getStarshipCrewState(actor, legacySystem);
	const spaceStationFixed = isActiveSpaceStationActor(actor);
	const slowedLevel = spaceStationFixed ? 0 : resolveStarshipSlowedLevel(actor);
	const movement = deriveStarshipMovementData({
		legacySystem,
		items,
		liveAbilities: liveAbilities ?? actor?.system?.abilities ?? {},
		liveMovement: liveMovement ?? actor?.system?.attributes?.movement ?? {},
		routingState: routing,
		slowedLevel,
		spaceStationFixed,
		actor
	});
	const travel = deriveStarshipTravelData({ legacySystem, items, crewState: crew });
	travel.hyperspaceTimeMultiplier = getSpaceStationHyperspaceTravelTimeMultiplier(actor);
	return { movement, travel, crew, routing };
}

export function getDerivedStarshipMovement(actor) {
	return getDerivedStarshipRuntime(actor).movement;
}

/**
 * Whether a travel formula field is blank in Actor source (empty → may auto-fill from unslowed Space).
 */
export function isStarshipTravelFieldBlank(value) {
	if ( value === undefined || value === null ) return true;
	return String(value).trim() === "";
}

/**
 * Fill blank starship Travel Speed/Pace from the unslowed routed combat Space base.
 * Slowed must not change travel. Explicitly stored travel values are preserved.
 * @param {object} model  VehicleData model (`this` during prepare)
 * @param {Actor|object|null} actor
 * @param {object} movement  deriveStarshipMovementData result
 */
export function applyStarshipTravelFromUnslowedCombatBase(model, actor, movement = {}) {
	const travel = model?.attributes?.travel;
	if ( !travel || (typeof travel !== "object") ) return;

	const sourceTravel = actor?._source?.system?.attributes?.travel ?? {};
	const spaceBefore = toFiniteNumber(movement.spaceBeforeSlowed, null);
	if ( spaceBefore === null ) return;

	const movementUnits = model.attributes?.movement?.units ?? "ft";
	const travelUnits = travel.units ?? null;
	const convert = globalThis.dnd5e?.data?.fields?.TravelField?.convertMovementToTravel
		?? globalThis.dnd5e?.dataModels?.fields?.TravelField?.convertMovementToTravel
		?? null;
	let speed = convert
		? Number(convert(spaceBefore, movementUnits, travelUnits))
		: spaceBefore / 10;
	if ( !Number.isFinite(speed) ) return;
	speed = Math.max(0, speed);

	if ( isStarshipTravelFieldBlank(sourceTravel.speeds?.air) ) {
		travel.speeds ??= {};
		travel.speeds.air = speed;
		if ( speed > (travel.speeds.max ?? 0) ) travel.speeds.max = speed;
	}

	if ( isStarshipTravelFieldBlank(sourceTravel.paces?.air) ) {
		const time = toFiniteNumber(travel.time, 24) ?? 24;
		let pace = speed * time;
		const paceMode = travel.pace;
		const applyPace = globalThis.dnd5e?.data?.fields?.TravelField?.applyPaceMultiplier
			?? globalThis.dnd5e?.dataModels?.fields?.TravelField?.applyPaceMultiplier
			?? null;
		const unitType = globalThis.CONFIG?.DND5E?.travelUnits?.[travelUnits]?.type
			?? globalThis.CONFIG?.DND5E?.movementUnits?.[movementUnits]?.type;
		if ( applyPace && paceMode ) {
			pace = Number(applyPace(pace, paceMode, unitType)) || pace;
		}
		travel.paces ??= {};
		travel.paces.air = Math.max(0, pace);
		if ( pace > (travel.paces.max ?? 0) ) travel.paces.max = pace;
	}
}

const POWER_DIE_BY_TIER = { 1: "d4", 2: "d6", 3: "d8", 4: "d10", 5: "d12" };

// Static size profiles — hull/shield dice and mod caps are class-level constants, not per-actor state.
// Used as a fallback when the embedded size item lacks legacy flag data (new-format feat items
// with identifier + HullPoints advancement instead of direct hullDice/modBaseCap fields).
const STARSHIP_SIZE_PROFILES = {
	tiny:        { hullDice: "d4",  hullDiceStart: 1,  shldDice: "d4",  shldDiceStart: 1,  modBaseCap: 10, modMaxSuitesBase: 0,  modMaxSuitesMult: 0 },
	small:       { hullDice: "d6",  hullDiceStart: 3,  shldDice: "d6",  shldDiceStart: 3,  modBaseCap: 20, modMaxSuitesBase: 0,  modMaxSuitesMult: 1 },
	medium:      { hullDice: "d8",  hullDiceStart: 5,  shldDice: "d8",  shldDiceStart: 5,  modBaseCap: 30, modMaxSuitesBase: 3,  modMaxSuitesMult: 1 },
	large:       { hullDice: "d10", hullDiceStart: 7,  shldDice: "d10", shldDiceStart: 7,  modBaseCap: 50, modMaxSuitesBase: 3,  modMaxSuitesMult: 2 },
	huge:        { hullDice: "d12", hullDiceStart: 9,  shldDice: "d12", shldDiceStart: 9,  modBaseCap: 60, modMaxSuitesBase: 6,  modMaxSuitesMult: 3 },
	gargantuan:  { hullDice: "d20", hullDiceStart: 11, shldDice: "d20", shldDiceStart: 11, modBaseCap: 70, modMaxSuitesBase: 10, modMaxSuitesMult: 4 }
};
// Map dnd5e actor size keys → identifier
const ACTOR_SIZE_TO_IDENTIFIER = { tiny: "tiny", sm: "small", med: "medium", lg: "large", huge: "huge", grg: "gargantuan" };

/**
 * Hull/Shield dice gained per Tier Upgrade (Bug 9 / Phase 2A).
 * Tiny–Large and unknown/homebrew sizes → 1; Huge/Gargantuan → 2.
 * Does not hard-block unknown sizes. Does not invent settings.
 * @param {string} [sizeIdentifier]
 * @returns {1|2}
 */
export function getStarshipHullShieldDicePerTierGain(sizeIdentifier) {
	const key = String(sizeIdentifier ?? "").trim().toLowerCase();
	if ( key === "huge" || key === "gargantuan" ) return 2;
	return 1;
}

/**
 * Resolve Starship size identifier for pool derivation (same identity path as size profiles).
 * @param {object} actor
 * @param {object} [sizeSystem]
 * @param {object|null} [liveSizeItem]
 * @returns {string}
 */
function resolveStarshipSizeIdentifierForPools(actor, sizeSystem={}, liveSizeItem=null) {
	const fromItem = String(
		liveSizeItem?.system?.identifier
		?? sizeSystem?.identifier
		?? ""
	).trim().toLowerCase();
	if ( fromItem ) return fromItem;
	const actorSize = actor?.system?.traits?.size ?? "";
	return ACTOR_SIZE_TO_IDENTIFIER[actorSize] ?? "";
}

/**
 * Resolve the size-item system snapshot used for pool/tier derivation.
 * Prefer post-migration legacy flags, then raw source system, then live fallbacks / size profiles.
 * @param {object} actor
 * @returns {{ sizeSystem: object, liveSizeItem: object|null }}
 */
function resolveStarshipSizeSystemForPools(actor) {
	const liveItems = actor?.items?.contents ?? [];
	const sourceItems = actor?._source?.items ?? [];
	const liveSizeItem = getLegacyStarshipSize(liveItems);
	const sourceSizeItem = getLegacyStarshipSize(sourceItems)
		?? (liveSizeItem ? sourceItems.find(i => i._id === liveSizeItem.id) : null);
	let sizeSystem = liveSizeItem?.flags?.sw5e?.legacyStarshipSize
		?? sourceSizeItem?.system
		?? getLegacySizeSystem(liveSizeItem)
		?? {};

	if ( !sizeSystem.hullDice ) {
		const identifier = liveSizeItem?.system?.identifier ?? sourceSizeItem?.system?.identifier ?? "";
		const actorSize = actor?.system?.traits?.size ?? "";
		const profile = STARSHIP_SIZE_PROFILES[identifier] ?? STARSHIP_SIZE_PROFILES[ACTOR_SIZE_TO_IDENTIFIER[actorSize]];
		if ( profile ) sizeSystem = { ...sizeSystem, ...profile };
	}

	return { sizeSystem, liveSizeItem };
}

/**
 * Canonical Starship effective tier for pools and formula roll data (`@details.tier`).
 * Precedence: legacy actor flag tier → size-item tier → HullPoints advancement max key → 0.
 * Does not persist tier or mutate actor data. Zero is a valid result.
 * @param {object} actor
 * @returns {number}
 */
export function getStarshipEffectiveTier(actor) {
	const legacyActorSystem = getLegacyStarshipActorSystem(actor) ?? {};
	const fromLegacy = toFiniteNumber(legacyActorSystem.details?.tier, null);
	if ( fromLegacy !== null ) return fromLegacy;

	const { sizeSystem, liveSizeItem } = resolveStarshipSizeSystemForPools(actor);
	const fromSize = toFiniteNumber(sizeSystem?.tier, null);
	if ( fromSize !== null ) return fromSize;

	const hullAdv = liveSizeItem?.system?.advancement?.find?.(a => a.type === "HullPoints");
	const advKeys = hullAdv?.value ? Object.keys(hullAdv.value).map(Number).filter(Number.isFinite) : [];
	return advKeys.length ? Math.max(0, ...advKeys) : 0;
}

export function deriveStarshipPools(actor) {
	const liveItems = actor?.items?.contents ?? [];
	const sourceItems = actor?._source?.items ?? [];
	// For mods/equipment (standard dnd5e types), live items have accessible system data.
	const items = liveItems.length ? liveItems : sourceItems;

	const { sizeSystem, liveSizeItem } = resolveStarshipSizeSystemForPools(actor);
	const tier = getStarshipEffectiveTier(actor);
	const sizeIdentifier = resolveStarshipSizeIdentifierForPools(actor, sizeSystem, liveSizeItem);
	const dicePerTier = getStarshipHullShieldDicePerTierGain(sizeIdentifier);

	// Hull dice pool — max = start + (size-aware gain × tier); used is never rewritten here.
	const hullDie = sizeSystem.hullDice ?? "";
	const hullDiceStart = toFiniteNumber(sizeSystem.hullDiceStart, 0);
	const hullDiceUsed = toFiniteNumber(sizeSystem.hullDiceUsed, 0);
	const hullDiceMax = hullDiceStart + (dicePerTier * tier);

	// Shield dice pool — same per-tier gain as hull.
	const shldDie = sizeSystem.shldDice ?? "";
	const shldDiceStart = toFiniteNumber(sizeSystem.shldDiceStart, 0);
	const shldDiceUsed = toFiniteNumber(sizeSystem.shldDiceUsed, 0);
	const shldDiceMax = shldDiceStart + (dicePerTier * tier);

	// Power coupling — find the equipped powerc item for zone capacities.
	// Equipment items are standard dnd5e type so item.system is accessible normally.
	// Also try _source.system as fallback for items whose DataModel restricts field access.
	const powerCoupling = items.find(item => {
		const typeVal = item.system?.type?.value ?? item._source?.system?.type?.value;
		const equipped = item.system?.equipped ?? item._source?.system?.equipped;
		return typeVal === "powerc" && equipped !== false;
	});
	const pcSystem = powerCoupling?.system?.attributes ? powerCoupling.system : powerCoupling?._source?.system ?? {};
	const cscap = toFiniteNumber(pcSystem?.attributes?.cscap?.value, 0);
	const sscap = toFiniteNumber(pcSystem?.attributes?.sscap?.value, 0);
	const powerDie = POWER_DIE_BY_TIER[tier] ?? "";

	// Modification slot budget.
	// Mods in Drake's Shipyard actors are embedded with type "starshipmod" and no legacy flags.
	// After migration they become type "loot" with legacyStarshipMod set.
	// Standalone compendium items dragged to an actor have flags.core.sourceId referencing the pack.
	const conValue = toFiniteNumber(actor?.system?.abilities?.con?.value, 10);
	const conMod = Math.floor((conValue - 10) / 2);
	const modSlotMax = toFiniteNumber(sizeSystem.modBaseCap, 0);
	let suiteMax = Math.max(0,
		toFiniteNumber(sizeSystem.modMaxSuitesBase, 0)
		+ toFiniteNumber(sizeSystem.modMaxSuitesMult, 0) * conMod
	);
	if ( isActiveSpaceStationActor(actor) ) suiteMax *= 2;
	const isModItem = (item) => {
		if ( item.flags?.sw5e?.legacyStarshipMod ) return true;
		if ( item.type === "starshipmod" ) return true;
		const sourceId = item.flags?.core?.sourceId ?? item._stats?.compendiumSource ?? "";
		return /^Compendium\.[^.]+\.starshipmodifications\./.test(sourceId);
	};
	const isSuiteItem = (item) => {
		// After migration: legacyStarshipMod contains original system with type.value
		const legacyType = item.flags?.sw5e?.legacyStarshipMod?.type?.value;
		if ( legacyType ) return legacyType === "Suite";
		// Pre-migration: read from raw source system
		const rawType = item._source?.system?.type?.value ?? item.system?.type?.value ?? "";
		return rawType === "Suite";
	};
	const modItems = items.filter(isModItem);
	const suitesUsed = modItems.filter(isSuiteItem).length;
	const modSlotsUsed = modItems.length;

	return {
		tier,
		hull: { die: hullDie, current: hullDiceMax - hullDiceUsed, max: hullDiceMax },
		shld: { die: shldDie, current: shldDiceMax - shldDiceUsed, max: shldDiceMax },
		power: { die: powerDie, cscap, sscap },
		mods: { slotsUsed: modSlotsUsed, slotMax: modSlotMax, suitesUsed, suiteMax }
	};
}

function getStarshipPowerDieSlotLabel(slotKey) {
	const labelKey = CONFIG?.SW5E?.powerDieSlots?.[slotKey];
	if ( labelKey ) return localizeWithFallback(labelKey, slotKey);
	const title = slotKey.charAt(0).toUpperCase() + slotKey.slice(1);
	return title;
}

function resolveStarshipPowerDie(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const pools = deriveStarshipPools(actor);
	const stored = legacySystem.attributes?.power?.die;
	if ( typeof stored === "string" && stored !== "" && stored !== "d1" ) return stored;
	return pools.power.die || "d4";
}

function getStarshipPowerSlotCouplingCap(slotKey, pools = {}) {
	return slotKey === "central"
		? (toFiniteNumber(pools?.power?.cscap, 0) ?? 0)
		: (toFiniteNumber(pools?.power?.sscap, 0) ?? 0);
}

function getStarshipPowerSlotStoredMax(slotKey, power = {}) {
	const stored = toFiniteNumber(power?.[slotKey]?.max, null);
	return stored !== null ? Math.max(0, Math.trunc(stored)) : 0;
}

function resolveStarshipPowerSlotDisplayMax(slotKey, storedValue, storedMax, pools = {}) {
	const couplingCap = getStarshipPowerSlotCouplingCap(slotKey, pools);
	let displayMax = Math.max(storedMax, storedValue);
	if ( couplingCap > 0 ) displayMax = Math.max(couplingCap, storedMax, storedValue);
	return displayMax;
}

function resolveStarshipPowerSlotMax(slotKey, power = {}, pools = {}) {
	const storedMax = getStarshipPowerSlotStoredMax(slotKey, power);
	if ( storedMax > 0 ) return storedMax;
	return getStarshipPowerSlotCouplingCap(slotKey, pools);
}

function getStarshipPowerSlotPeak(actor, slotKey) {
	return toFiniteNumber(actor?.flags?.sw5e?.starship?.powerPeak?.[slotKey], 0) ?? 0;
}

/** Allocation ceiling for recovery — uses stored/coupling max, else peak/current for legacy actors. */
export function resolveStarshipPowerSlotAllocationMax(actor, slotKey, power = {}, pools = {}) {
	const storedValue = toFiniteNumber(power?.[slotKey]?.value, 0) ?? 0;
	const storedMax = getStarshipPowerSlotStoredMax(slotKey, power);
	const couplingCap = getStarshipPowerSlotCouplingCap(slotKey, pools);
	if ( storedMax > 0 ) return storedMax;
	if ( couplingCap > 0 ) return couplingCap;
	return Math.max(getStarshipPowerSlotPeak(actor, slotKey), storedValue);
}

export async function recordStarshipPowerSlotPeak(actor, slotKey, observedValue) {
	const value = Math.max(0, Math.trunc(Number(observedValue) || 0));
	const prev = getStarshipPowerSlotPeak(actor, slotKey);
	if ( value <= prev ) return;
	const cur = actor?.flags?.sw5e?.starship ?? {};
	const powerPeak = { ...(typeof cur.powerPeak === "object" && cur.powerPeak ? cur.powerPeak : {}) };
	powerPeak[slotKey] = value;
	await actor.update({ "flags.sw5e.starship": { ...cur, powerPeak } });
}

export function getStarshipPowerRecoverySlots(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const pools = deriveStarshipPools(actor);
	const power = legacySystem.attributes?.power ?? {};

	return STARSHIP_POWER_DIE_SLOTS.map(slotKey => {
		const storedValue = toFiniteNumber(power[slotKey]?.value, 0) ?? 0;
		const allocationMax = resolveStarshipPowerSlotAllocationMax(actor, slotKey, power, pools);
		const missing = Math.max(0, allocationMax - storedValue);
		return {
			key: slotKey,
			label: getStarshipPowerDieSlotLabel(slotKey),
			value: storedValue,
			allocationMax,
			missing,
			isFull: missing <= 0,
			isCentral: slotKey === "central"
		};
	});
}

export function getStarshipPowerRecoverySummary(actor) {
	const slots = getStarshipPowerRecoverySlots(actor);
	const totalMissing = slots.reduce((sum, slot) => sum + slot.missing, 0);
	return { slots, totalMissing, canRecover: totalMissing > 0 };
}

export function shouldMirrorStarshipLegacyAttributePath(systemPath) {
	if ( systemPath === "system.details.tier" ) return true;
	if ( systemPath === "system.attributes.power.routing" || systemPath === "system.attributes.power.die" ) return true;
	if ( systemPath === "system.attributes.death.success" || systemPath === "system.attributes.death.failure" ) return true;
	if ( systemPath === "system.attributes.systemDamage" ) return true;
	if ( systemPath === "system.attributes.hp.value"
		|| systemPath === "system.attributes.hp.max"
		|| systemPath === "system.attributes.hp.temp"
		|| systemPath === "system.attributes.hp.tempmax" ) return true;
	if ( systemPath.startsWith("system.attributes.fuel.") ) return true;
	// Food: mirror value / foodCap / cost only — never foodCapMod (AE-prepared).
	if (
		systemPath === "system.attributes.food.value"
		|| systemPath === "system.attributes.food.foodCap"
		|| systemPath === "system.attributes.food.cost"
	) return true;
	const slotMatch = systemPath.match(/^system\.attributes\.power\.(\w+)\.(value|max)$/);
	return Boolean(slotMatch && STARSHIP_POWER_DIE_SLOTS.includes(slotMatch[1]));
}

export function buildStarshipLegacyAttributeMirrorUpdate(systemPath, value) {
	const update = { [systemPath]: value };
	if ( systemPath === "system.details.tier" ) {
		update["flags.sw5e.legacyStarshipActor.system.details.tier"] = value;
	} else if ( systemPath === "system.attributes.power.routing" ) {
		update[`${STARSHIP_LEGACY_ATTRIBUTE_FLAG_BASE}.power.routing`] = value;
	} else if ( systemPath === "system.attributes.power.die" ) {
		update[`${STARSHIP_LEGACY_ATTRIBUTE_FLAG_BASE}.power.die`] = value;
	} else if ( systemPath === "system.attributes.death.success" ) {
		update[`${STARSHIP_LEGACY_ATTRIBUTE_FLAG_BASE}.death.success`] = value;
	} else if ( systemPath === "system.attributes.death.failure" ) {
		update[`${STARSHIP_LEGACY_ATTRIBUTE_FLAG_BASE}.death.failure`] = value;
	} else if ( systemPath === "system.attributes.systemDamage" ) {
		update[`${STARSHIP_LEGACY_ATTRIBUTE_FLAG_BASE}.systemDamage`] = value;
	} else if ( systemPath === "system.attributes.hp.value" ) {
		update[`${STARSHIP_LEGACY_ATTRIBUTE_FLAG_BASE}.hp.value`] = value;
	} else if ( systemPath === "system.attributes.hp.max" ) {
		update[`${STARSHIP_LEGACY_ATTRIBUTE_FLAG_BASE}.hp.max`] = value;
	} else if ( systemPath === "system.attributes.hp.temp" ) {
		update[`${STARSHIP_LEGACY_ATTRIBUTE_FLAG_BASE}.hp.temp`] = value;
	} else if ( systemPath === "system.attributes.hp.tempmax" ) {
		update[`${STARSHIP_LEGACY_ATTRIBUTE_FLAG_BASE}.hp.tempmax`] = value;
	} else if ( systemPath.startsWith("system.attributes.fuel.") ) {
		const tail = systemPath.slice("system.attributes.fuel.".length);
		update[`${STARSHIP_LEGACY_ATTRIBUTE_FLAG_BASE}.fuel.${tail}`] = value;
	} else if (
		systemPath === "system.attributes.food.value"
		|| systemPath === "system.attributes.food.foodCap"
		|| systemPath === "system.attributes.food.cost"
	) {
		const tail = systemPath.slice("system.attributes.food.".length);
		update[`${STARSHIP_LEGACY_ATTRIBUTE_FLAG_BASE}.food.${tail}`] = value;
	} else {
		const slotMatch = systemPath.match(/^system\.attributes\.power\.(\w+)\.(value|max)$/);
		if ( slotMatch ) {
			const [, slot, field] = slotMatch;
			update[`${STARSHIP_LEGACY_ATTRIBUTE_FLAG_BASE}.power.${slot}.${field}`] = value;
		}
	}
	return update;
}

export function buildStarshipLegacyAttributeBatchMirrorUpdate(entries = []) {
	return entries.reduce((payload, [systemPath, value]) => ({
		...payload,
		...buildStarshipLegacyAttributeMirrorUpdate(systemPath, value)
	}), {});
}

async function syncStarshipSizeItemTier(actor, tier) {
	const sizeItem = getLegacyStarshipSize(actor?.items?.contents ?? []);
	if ( !sizeItem?.id ) return;
	const legacy = { ...(sizeItem.flags?.sw5e?.legacyStarshipSize ?? {}), tier };
	await actor.updateEmbeddedDocuments("Item", [{
		_id: sizeItem.id,
		"flags.sw5e.legacyStarshipSize": legacy
	}]);
}

export async function persistStarshipLegacyAttributePath(actor, systemPath, value, { mirror = true } = {}) {
	const isStarship = actor?.type === "vehicle" && actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
	const payload = mirror && isStarship && shouldMirrorStarshipLegacyAttributePath(systemPath)
		? buildStarshipLegacyAttributeMirrorUpdate(systemPath, value)
		: { [systemPath]: value };
	await actor.update(payload);
	if ( systemPath === "system.details.tier" && isStarship ) {
		await syncStarshipSizeItemTier(actor, value);
	}
}

export function getStarshipAdvancedPowerContext(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const pools = deriveStarshipPools(actor);
	const power = legacySystem.attributes?.power ?? {};
	const die = resolveStarshipPowerDie(actor);
	const ui = actor?.flags?.sw5e?.starship?.ui ?? {};

	const slots = STARSHIP_POWER_DIE_SLOTS.map(slotKey => {
		const storedValue = toFiniteNumber(power[slotKey]?.value, 0) ?? 0;
		const storedMax = getStarshipPowerSlotStoredMax(slotKey, power);
		const derivedCap = getStarshipPowerSlotCouplingCap(slotKey, pools);
		const displayValue = storedValue;
		const displayMax = resolveStarshipPowerSlotDisplayMax(slotKey, storedValue, storedMax, pools);
		const maxDisplayDiffers = displayMax !== storedMax;
		const maxDisplayHint = maxDisplayDiffers
			? (() => {
				const key = "SW5E.StarshipSheet.AdvancedPowerMaxDisplayHint";
				const formatted = game?.i18n?.format?.(key, { displayMax, storedMax });
				return formatted && formatted !== key
					? formatted
					: `Play mode shows ${displayMax}; stored max is ${storedMax}.`;
			})()
			: null;
		return {
			key: slotKey,
			label: getStarshipPowerDieSlotLabel(slotKey),
			value: storedValue,
			storedMax,
			derivedCap,
			displayValue,
			displayMax,
			pct: displayMax > 0 ? Math.max(0, Math.min(100, (displayValue / displayMax) * 100)) : 0,
			allocationMax: resolveStarshipPowerSlotAllocationMax(actor, slotKey, power, pools),
			maxDisplayDiffers,
			maxDisplayHint,
			isCentral: slotKey === "central",
			canSpend: storedValue > 0
		};
	});

	return {
		die,
		dieDisplay: die,
		slots,
		collapsed: ui.advancedPowerCollapsed !== false
	};
}

export async function rollStarshipPowerDie(actor, slotKey) {
	if ( !STARSHIP_POWER_DIE_SLOTS.includes(slotKey) ) return null;

	const legacySystem = getLegacyStarshipActorSystem(actor);
	const power = legacySystem.attributes?.power ?? {};
	const current = toFiniteNumber(power[slotKey]?.value, 0) ?? 0;
	if ( current < 1 ) {
		const slotLabel = getStarshipPowerDieSlotLabel(slotKey);
		const warnKey = "SW5E.PowerDieUnavailable";
		const warnFmt = game?.i18n?.format?.(warnKey, { slot: slotLabel });
		ui.notifications?.warn?.(warnFmt && warnFmt !== warnKey ? warnFmt : `No ${slotLabel} power dice available.`);
		return null;
	}

	const die = resolveStarshipPowerDie(actor);
	const rollData = actor?.getRollData?.() ?? {};
	const roll = await new Roll(die, rollData).evaluate();
	const flavor = localizeWithFallback("SW5E.PowerDiceRoll", "Power Die Roll");
	const slotLabel = getStarshipPowerDieSlotLabel(slotKey);
	await roll.toMessage({
		speaker: ChatMessage.getSpeaker({ actor }),
		flavor: `${flavor} (${slotLabel}): ${actor?.name ?? ""}`.trim(),
		flags: { sw5e: { roll: { type: "pwrDieRoll", slot: slotKey } } }
	});

	const newValue = Math.max(0, current - 1);
	await recordStarshipPowerSlotPeak(actor, slotKey, current);
	await persistStarshipLegacyAttributePath(actor, `system.attributes.power.${slotKey}.value`, newValue);
	return roll;
}

function getStarshipSkillsConfig() {
	return CONFIG?.DND5E?.starshipSkills ?? CONFIG?.SW5E?.starshipSkills ?? {};
}

function getSkillBonus(skill = {}) {
	return toFiniteNumber(skill?.bonuses?.check, 0) ?? 0;
}

function getStarshipSkillProficiencyMultiplier(proficiencyMode) {
	return getExpandedProficiencyMultiplier(proficiencyMode);
}

function proficiencyLevelHoverLabel(mode) {
	return getExpandedProficiencyHoverLabel(mode);
}

function resolveStarshipSkillAbility(skill, config) {
	const abilityKeys = Object.keys(CONFIG?.DND5E?.abilities ?? CONFIG?.SW5E?.abilities ?? {});
	const fromSkill = typeof skill?.ability === "string" ? skill.ability.trim() : "";
	if ( fromSkill && abilityKeys.includes(fromSkill) ) return fromSkill;
	const fromConfig = typeof config?.ability === "string" ? config.ability.trim() : "";
	if ( fromConfig && abilityKeys.includes(fromConfig) ) return fromConfig;
	return abilityKeys.includes("int") ? "int" : (abilityKeys[0] ?? "int");
}

function getStarshipActorProficiencyBonus(actor, legacySystem) {
	return toFiniteNumber(
		actor?.system?.attributes?.prof,
		toFiniteNumber(legacySystem?.attributes?.prof, 0)
	) ?? 0;
}

function normalizeDeploymentActorUuid(raw) {
	if ( raw === undefined || raw === null || raw === "" ) return null;
	if ( typeof raw === "string" ) return raw;
	return String(raw);
}

/**
 * Pilot / crew / passenger UUID sets for Bug 29A qualification (excludes Active station pointer).
 * @param {Actor} starshipActor
 * @returns {{ pilotUuid: string|null, crewUuids: Set<string>, passengerUuids: Set<string> }}
 */
function getStarshipPilotCrewPassengerSets(starshipActor) {
	const legacy = getLegacyStarshipActorSystem(starshipActor);
	const deployment = legacy.attributes?.deployment ?? {};
	const pilotUuid = normalizeDeploymentActorUuid(deployment.pilot?.value ?? deployment.pilot ?? null);
	const crewUuids = new Set(getDeploymentUuidList(deployment.crew).map(normalizeDeploymentActorUuid).filter(Boolean));
	const passengerUuids = new Set(
		getDeploymentUuidList(deployment.passenger).map(normalizeDeploymentActorUuid).filter(Boolean)
	);
	return { pilotUuid, crewUuids, passengerUuids };
}

/**
 * Max valid stored Deployment rank across parent Deployment feats.
 * Does not use `displayRank` for gating (displayRank mirrors valid storedRank else 0 for UI only).
 * @param {Actor} actor
 * @returns {number}
 */
function getActorMaxValidDeploymentStoredRank(actor) {
	const summary = getCharacterDeploymentSummary(actor);
	let maxRank = 0;
	for ( const entry of summary?.deployments ?? [] ) {
		if ( entry?.rankFlagInvalid ) continue;
		const stored = entry?.storedRank;
		if ( stored === null || stored === undefined ) continue;
		const n = Number(stored);
		if ( !Number.isFinite(n) ) continue;
		if ( n > maxRank ) maxRank = n;
	}
	return maxRank;
}

/**
 * Pilot or Crew membership with max valid stored Deployment rank >= 1. Passenger-only never qualifies.
 * @param {Actor} starshipActor
 * @param {Actor} crewActor
 * @returns {boolean}
 */
function actorQualifiesForStarshipCrewPb(starshipActor, crewActor) {
	if ( !crewActor || crewActor.documentName !== "Actor" || !crewActor.uuid ) return false;
	const { pilotUuid, crewUuids } = getStarshipPilotCrewPassengerSets(starshipActor);
	const uuid = crewActor.uuid;
	const isPilotOrCrew = (pilotUuid && uuid === pilotUuid) || crewUuids.has(uuid);
	if ( !isPilotOrCrew ) return false;
	return getActorMaxValidDeploymentStoredRank(crewActor) >= 1;
}

/**
 * Ordinary-player OWNER gate for responsible-crew picker (not OBSERVER/LIMITED/Token control).
 * @param {User|null|undefined} user
 * @param {Actor|null|undefined} crewActor
 * @returns {boolean}
 */
export function userOwnsStarshipResponsibleCrewActor(user, crewActor) {
	if ( !user || !crewActor ) return false;
	return crewActor.testUserPermission?.(user, "OWNER") === true;
}

/**
 * @param {number} distinctCount
 * @returns {"none"|"automatic"|"picker"}
 */
export function determineResponsibleCrewSelectionMode(distinctCount) {
	const n = Number(distinctCount);
	if ( !Number.isFinite(n) || n <= 0 ) return "none";
	if ( n === 1 ) return "automatic";
	return "picker";
}

/**
 * Strip live Actor from an internal candidate for Application context.
 * @param {{ actor?: Actor, actorUuid: string, membershipRole?: string, deploymentLabel?: string, proficiencyBonus?: number, actorName?: string, image?: string }} internal
 * @returns {{ actorUuid: string, actorName: string, image: string, membershipRole: string, deploymentLabel: string, proficiencyBonus: number }}
 */
export function toDialogSafeResponsibleCrewCandidate(internal={}) {
	const actor = internal?.actor;
	return {
		actorUuid: String(internal?.actorUuid ?? actor?.uuid ?? ""),
		actorName: String(internal?.actorName ?? actor?.name ?? ""),
		image: String(internal?.image ?? actor?.img ?? ""),
		membershipRole: String(internal?.membershipRole ?? ""),
		deploymentLabel: String(internal?.deploymentLabel ?? ""),
		proficiencyBonus: Number.isFinite(Number(internal?.proficiencyBonus))
			? Number(internal.proficiencyBonus)
			: 0
	};
}

/**
 * @param {Array<object>} internals
 * @returns {Array<object>}
 */
export function toDialogSafeResponsibleCrewCandidates(internals=[]) {
	return (Array.isArray(internals) ? internals : []).map(toDialogSafeResponsibleCrewCandidate);
}

function localizeCrewMembershipLabel(role) {
	if ( role === "pilot" ) {
		return globalThis.game?.i18n?.localize?.("SW5E.StarshipCrewBadgePilot") || "Pilot";
	}
	if ( role === "crew" ) {
		return globalThis.game?.i18n?.localize?.("SW5E.StarshipCrewBadgeCrew") || "Crew";
	}
	return "";
}

/**
 * Bug 29E-P: permitted qualified responsible-crew candidates for the rolling user.
 * Deduplicates by Actor UUID before selection mode. Dialog context must use dialog-safe DTOs only.
 *
 * @param {{ starshipActor: Actor, user?: User }} args
 * @returns {{
 *   candidates: Array<{ actor: Actor, actorUuid: string, membershipRole: string, deploymentLabel: string, proficiencyBonus: number }>,
 *   selectionMode: "none"|"automatic"|"picker",
 *   automaticActor: Actor|null,
 *   userAuthority: "gm"|"owner"|"none"
 * }}
 */
export function buildStarshipResponsibleCrewCandidates({ starshipActor, user = globalThis.game?.user }={}) {
	const empty = {
		candidates: [],
		selectionMode: "none",
		automaticActor: null,
		userAuthority: "none"
	};
	if ( !starshipActor || !user ) return empty;

	const userAuthority = user.isGM === true ? "gm" : "owner";
	const { pilotUuid, crewUuids } = getStarshipPilotCrewPassengerSets(starshipActor);
	const uuidSet = new Set();
	if ( pilotUuid ) uuidSet.add(pilotUuid);
	for ( const uuid of crewUuids ) {
		if ( uuid ) uuidSet.add(uuid);
	}

	const candidates = [];
	for ( const uuid of uuidSet ) {
		const crewActor = resolveActorDocument(uuid);
		if ( !actorQualifiesForStarshipCrewPb(starshipActor, crewActor) ) continue;
		const proficiencyBonus = toFiniteNumber(crewActor?.system?.attributes?.prof, NaN);
		if ( !Number.isFinite(proficiencyBonus) ) continue;
		if ( !isStarshipCrewMembershipVisibleToUser(starshipActor, crewActor, user) ) continue;
		if ( user.isGM !== true && !userOwnsStarshipResponsibleCrewActor(user, crewActor) ) continue;

		const membershipRole = pilotUuid && uuid === pilotUuid ? "pilot" : "crew";
		candidates.push({
			actor: crewActor,
			actorUuid: crewActor.uuid,
			membershipRole,
			deploymentLabel: localizeCrewMembershipLabel(membershipRole),
			proficiencyBonus
		});
	}

	const selectionMode = determineResponsibleCrewSelectionMode(candidates.length);
	return {
		candidates,
		selectionMode,
		automaticActor: selectionMode === "automatic" ? candidates[0]?.actor ?? null : null,
		userAuthority
	};
}

/**
 * Re-resolve and revalidate a selected UUID against a freshly built candidate set.
 * @param {{ starshipActor: Actor, user?: User, actorUuid?: string|null }} args
 * @returns {Actor|null}
 */
export function resolveValidatedResponsibleCrewActor({
	starshipActor,
	user = globalThis.game?.user,
	actorUuid = null
}={}) {
	const uuid = typeof actorUuid === "string" ? actorUuid.trim() : "";
	if ( !uuid || !starshipActor || !user ) return null;
	const rebuilt = buildStarshipResponsibleCrewCandidates({ starshipActor, user });
	const match = rebuilt.candidates.find(entry => entry.actorUuid === uuid);
	if ( !match?.actor ) return null;
	if ( !actorQualifiesForStarshipCrewPb(starshipActor, match.actor) ) return null;
	const pb = toFiniteNumber(match.actor?.system?.attributes?.prof, NaN);
	if ( !Number.isFinite(pb) ) return null;
	if ( !isStarshipCrewMembershipVisibleToUser(starshipActor, match.actor, user) ) return null;
	if ( user.isGM !== true && !userOwnsStarshipResponsibleCrewActor(user, match.actor) ) return null;
	return match.actor;
}

/**
 * Shared proficiency-points math for skill rolls and dialog preview (29A/29B).
 * @param {number|null|undefined} proficiencyMode
 * @param {number|null|undefined} crewPb
 * @returns {number}
 */
export function computeStarshipSkillCrewProficiencyPoints(proficiencyMode, crewPb) {
	const pb = toFiniteNumber(crewPb, NaN);
	if ( !Number.isFinite(pb) ) return 0;
	const multiplier = getStarshipSkillProficiencyMultiplier(proficiencyMode);
	return Math.round(pb * multiplier);
}

/**
 * Assert selected crew identity is absent from public chat message metadata.
 * @param {object} messageData
 * @param {{ name?: string, uuid?: string }} identity
 * @returns {boolean}
 */
export function publicChatExcludesResponsibleCrewIdentity(messageData={}, identity={}) {
	const name = String(identity?.name ?? "").trim();
	const uuid = String(identity?.uuid ?? "").trim();
	const blobs = [
		messageData?.flavor,
		messageData?.speaker?.alias,
		messageData?.speaker?.actor,
		JSON.stringify(messageData?.flags ?? {}),
		JSON.stringify(messageData?.speaker ?? {})
	].map(value => String(value ?? ""));
	const joined = blobs.join("\n");
	if ( name && joined.includes(name) ) return false;
	if ( uuid && joined.includes(uuid) ) return false;
	return true;
}

/** Roll-config marker: Pilot save PB already injected for this roll only (never an Actor flag). */
const STARSHIP_SAVE_PILOT_PB_INJECTED_KEY = "sw5ePilotSavePbInjected";
/** Formula/@data key for Pilot save proficiency (dnd5e constructParts / mergeConfigs). */
const STARSHIP_SAVE_PILOT_PB_DATA_KEY = "sw5ePilotSaveProf";
const STARSHIP_SAVE_PILOT_PB_PART = `@${STARSHIP_SAVE_PILOT_PB_DATA_KEY}`;

/**
 * Bug 29C: resolve exactly `deployment.pilot.value` for save PB.
 * No Crew / Active / controlled / rolling-user / Passenger / 29A responsible-Actor substitutes.
 * @param {Actor} starshipActor
 * @returns {Actor|null}
 */
export function resolveStarshipSavePilotActor(starshipActor) {
	if ( !isStarshipFlagVehicle(starshipActor) ) return null;
	const { pilotUuid } = getStarshipPilotCrewPassengerSets(starshipActor);
	if ( !pilotUuid ) return null;
	const pilot = resolveActorDocument(pilotUuid);
	if ( !pilot || pilot.documentName !== "Actor" ) return null;
	if ( getActorMaxValidDeploymentStoredRank(pilot) < 1 ) return null;
	const pb = toFiniteNumber(pilot?.system?.attributes?.prof, NaN);
	if ( !Number.isFinite(pb) ) return null;
	return pilot;
}

/**
 * Save-equipped gate: `proficient <= 0` → none; `proficient > 0` → Pilot PB once (no tier multiplication).
 * @param {Actor} starshipActor
 * @param {string} abilityId
 * @returns {number}
 */
export function getStarshipSavePilotProficiency(starshipActor, abilityId) {
	if ( !isStarshipFlagVehicle(starshipActor) || !abilityId ) return 0;
	const proficient = toFiniteNumber(starshipActor?.system?.abilities?.[abilityId]?.proficient, 0) ?? 0;
	if ( proficient <= 0 ) return 0;
	const pilot = resolveStarshipSavePilotActor(starshipActor);
	if ( !pilot ) return 0;
	return toFiniteNumber(pilot.system?.attributes?.prof, 0) ?? 0;
}

/**
 * Deterministic numeric eval of a save-bonus formula for sheet display only.
 * Nondeterministic dice / unsafe formulas are omitted (not coerced to 0).
 * @param {string} formula
 * @param {object} [rollData]
 * @returns {{ ok: boolean, value: number }}
 */
function evaluateDeterministicSaveBonusFormula(formula, rollData = {}) {
	const raw = String(formula ?? "").trim();
	if ( !raw ) return { ok: true, value: 0 };
	try {
		const RollCls = globalThis.CONFIG?.Dice?.BasicRoll ?? globalThis.Roll;
		if ( !RollCls ) return { ok: false, value: 0 };
		const roll = new RollCls(raw, rollData);
		if ( typeof roll.isDeterministic === "boolean" ) {
			if ( !roll.isDeterministic ) return { ok: false, value: 0 };
		} else if ( /\d+d\d/i.test(raw) ) {
			// Foundry without isDeterministic: refuse dice formulas rather than coerce to 0.
			return { ok: false, value: 0 };
		}
		const simplifyBonus = globalThis.dnd5e?.utils?.simplifyBonus;
		if ( typeof simplifyBonus === "function" ) {
			const value = Number(simplifyBonus(raw, rollData));
			if ( !Number.isFinite(value) ) return { ok: false, value: 0 };
			return { ok: true, value };
		}
		const replaced = RollCls.replaceFormulaData?.(raw, rollData, { missing: "0" }) ?? raw;
		const value = Number(RollCls.safeEval?.(replaced));
		if ( !Number.isFinite(value) ) return { ok: false, value: 0 };
		return { ok: true, value };
	} catch (_err) {
		return { ok: false, value: 0 };
	}
}

/**
 * Shared save modifier parts for roll injection and sheet display (Bug 29C).
 * Roll keeps `saveBonusFormula` as a formula term; display uses deterministic terms only.
 * @param {Actor} starshipActor
 * @param {string} abilityId
 * @returns {{
 *   shipModifier: number,
 *   saveBonusFormula: string,
 *   pilotProficiency: number,
 *   saveBonusDeterministic: boolean,
 *   saveBonusDeterministicValue: number|null,
 *   displayTotal: number,
 *   displayOmitsSaveBonus: boolean
 * }}
 */
export function buildStarshipSaveModifierParts(starshipActor, abilityId) {
	const entry = getStarshipAbilityRollEntry(starshipActor, abilityId);
	const shipModifier = toFiniteNumber(entry?.mod, 0) ?? 0;
	const saveBonusFormula = String(entry?.saveBonus ?? "").trim();
	const pilotProficiency = getStarshipSavePilotProficiency(starshipActor, abilityId);
	const rollData = starshipActor?.getRollData?.() ?? {};
	const bonusEval = evaluateDeterministicSaveBonusFormula(saveBonusFormula, rollData);
	const displayTotal = bonusEval.ok
		? shipModifier + bonusEval.value + pilotProficiency
		: shipModifier + pilotProficiency;
	return {
		shipModifier,
		saveBonusFormula,
		pilotProficiency,
		saveBonusDeterministic: bonusEval.ok,
		saveBonusDeterministicValue: bonusEval.ok ? bonusEval.value : null,
		displayTotal,
		displayOmitsSaveBonus: !bonusEval.ok && Boolean(saveBonusFormula)
	};
}

/**
 * Fresh per-call merge fragment for stock `rollSavingThrow` (dnd5e 5.2.5 `D20Roll.mergeConfigs`).
 * Does not mutate shared arrays; caller passes a new object each roll.
 * @param {Actor} starshipActor
 * @param {string} abilityId
 * @returns {{ sw5ePilotSavePbInjected?: boolean, rolls?: object[] }}
 */
export function buildStarshipSavePilotPbStockRollConfig(starshipActor, abilityId) {
	const pilotProficiency = getStarshipSavePilotProficiency(starshipActor, abilityId);
	if ( !pilotProficiency ) return {};
	return {
		[STARSHIP_SAVE_PILOT_PB_INJECTED_KEY]: true,
		rolls: [{
			parts: [STARSHIP_SAVE_PILOT_PB_PART],
			data: { [STARSHIP_SAVE_PILOT_PB_DATA_KEY]: pilotProficiency }
		}]
	};
}

/**
 * `dnd5e.preRollSavingThrow` inject: clone this roll's parts/data; once-marker on config only.
 * Preserves stock dialog / hooks / chat — does not bypass `rollSavingThrow`.
 * @param {object} config
 */
export function injectStarshipSavePilotPbIntoRollConfig(config) {
	if ( !config || config[STARSHIP_SAVE_PILOT_PB_INJECTED_KEY] ) return;
	if ( !(config.hookNames ?? []).includes("SavingThrow") ) return;
	const actor = config.subject?.documentName === "Actor" ? config.subject : null;
	if ( !isStarshipFlagVehicle(actor) ) return;
	const abilityId = config.ability;
	const pilotProficiency = getStarshipSavePilotProficiency(actor, abilityId);
	config[STARSHIP_SAVE_PILOT_PB_INJECTED_KEY] = true;
	if ( !pilotProficiency ) return;

	const roll = config.rolls?.[0];
	if ( !roll ) return;

	const existingParts = Array.isArray(roll.parts) ? roll.parts : [];
	if ( existingParts.includes(STARSHIP_SAVE_PILOT_PB_PART) ) return;

	roll.parts = [...existingParts, STARSHIP_SAVE_PILOT_PB_PART];
	roll.data = foundry.utils.mergeObject({}, roll.data ?? {}, { inplace: false });
	roll.data[STARSHIP_SAVE_PILOT_PB_DATA_KEY] = pilotProficiency;
}

/** Register stock-path Pilot save PB injection (keeps `rollSavingThrow` primary). */
export function registerStarshipSavePilotPbHooks() {
	Hooks.on("dnd5e.preRollSavingThrow", injectStarshipSavePilotPbIntoRollConfig);
}

/** Roll-config marker / formula key: firing-crew attack PB (Bug 29 attack slice). */
export const STARSHIP_ATTACK_CREW_PB_INJECTED_KEY = "sw5eCrewAttackPbInjected";
export const STARSHIP_ATTACK_CREW_PB_DATA_KEY = "sw5eCrewAttackProf";
export const STARSHIP_ATTACK_CREW_PB_PART = `@${STARSHIP_ATTACK_CREW_PB_DATA_KEY}`;
/** Process-config key: firing crew prepared for this attack roll only. */
export const STARSHIP_ATTACK_FIRING_CREW_PREPARED_KEY = "sw5eAttackFiringCrewPrepared";
export const STARSHIP_ATTACK_FIRING_CREW_PB_KEY = "sw5eAttackFiringCrewPb";
export const STARSHIP_ATTACK_FIRING_CREW_UUID_KEY = "sw5eAttackFiringCrewActorUuid";
/** Unique per-attack invocation id correlating wrapper prep → postBuild inject. */
export const STARSHIP_ATTACK_INVOCATION_ID_KEY = "sw5eAttackInvocationId";
const STARSHIP_ATTACK_NONZERO_PROF_WARNED_KEY = "sw5eCrewAttackPbNonzeroProfWarned";

/**
 * Roll-scoped firing-crew state. Keyed by invocation id — never Actor/User/Item flags.
 * @type {Map<string, { actorUuid: string, proficiencyBonus: number, source: string, selectionMode: string }>}
 */
const starshipAttackFiringCrewByInvocation = new Map();

/**
 * @returns {string}
 */
export function createStarshipAttackInvocationId() {
	return `sw5e-atk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {string} invocationId
 * @param {{ actorUuid?: string, proficiencyBonus?: number, source?: string, selectionMode?: string }} state
 */
export function storeStarshipAttackFiringCrewState(invocationId, state={}) {
	const id = String(invocationId ?? "").trim();
	if ( !id ) return;
	starshipAttackFiringCrewByInvocation.set(id, {
		actorUuid: String(state.actorUuid ?? "").trim(),
		proficiencyBonus: Number.isFinite(Number(state.proficiencyBonus)) ? Number(state.proficiencyBonus) : 0,
		source: String(state.source ?? "none"),
		selectionMode: String(state.selectionMode ?? "none")
	});
}

/**
 * @param {string} invocationId
 * @returns {{ actorUuid: string, proficiencyBonus: number, source: string, selectionMode: string }|null}
 */
export function peekStarshipAttackFiringCrewState(invocationId) {
	const id = String(invocationId ?? "").trim();
	if ( !id ) return null;
	return starshipAttackFiringCrewByInvocation.get(id) ?? null;
}

/**
 * @param {string} invocationId
 */
export function clearStarshipAttackFiringCrewState(invocationId) {
	const id = String(invocationId ?? "").trim();
	if ( !id ) return;
	starshipAttackFiringCrewByInvocation.delete(id);
}
/**
 * Classify whether firing-crew PB may be injected onto a built attack roll config.
 * Safe contract: exactly one crew proficiency contribution; never silently discard nonzero `@prof`.
 *
 * @param {{
 *   parts?: string[],
 *   data?: object,
 *   crewProficiency?: number|null,
 *   hasResolvedFiringCrew?: boolean,
 *   actorProf?: number|null
 * }} args
 * @returns {{
 *   decision: "inject"|"skip-already-present"|"skip-nonzero-stock-prof"|"skip-no-crew"|"skip-no-finite-pb",
 *   stockProfValue: number,
 *   stockProfIsZero: boolean,
 *   hasDedicatedCrewPart: boolean,
 *   reason: string
 * }}
 */
export function classifyStarshipAttackCrewPbInjection({
	parts=[],
	data={},
	crewProficiency=null,
	hasResolvedFiringCrew=false,
	actorProf=0
}={}) {
	const partList = Array.isArray(parts) ? parts.map(part => String(part ?? "")) : [];
	const hasDedicatedCrewPart = partList.includes(STARSHIP_ATTACK_CREW_PB_PART)
		|| Number.isFinite(Number(data?.[STARSHIP_ATTACK_CREW_PB_DATA_KEY]));
	const stockProfValue = Number(data?.prof);
	const normalizedStockProf = Number.isFinite(stockProfValue) ? stockProfValue : 0;
	const stockProfIsZero = normalizedStockProf === 0;
	const actorProfValue = Number(actorProf);
	const base = {
		stockProfValue: normalizedStockProf,
		stockProfIsZero,
		hasDedicatedCrewPart,
		actorProf: Number.isFinite(actorProfValue) ? actorProfValue : 0
	};

	if ( hasDedicatedCrewPart ) {
		return {
			...base,
			decision: "skip-already-present",
			reason: "dedicated firing-crew PB part or data key already present"
		};
	}
	if ( !hasResolvedFiringCrew ) {
		return {
			...base,
			decision: "skip-no-crew",
			reason: "no resolved firing crew Actor"
		};
	}
	const pb = Number(crewProficiency);
	if ( !Number.isFinite(pb) ) {
		return {
			...base,
			decision: "skip-no-finite-pb",
			reason: "firing crew PB is not finite"
		};
	}
	if ( !stockProfIsZero ) {
		return {
			...base,
			decision: "skip-nonzero-stock-prof",
			reason: "stock @prof is unexpectedly nonzero; investigate before mutate"
		};
	}
	return {
		...base,
		decision: "inject",
		reason: "stock @prof is zero; inject dedicated firing-crew PB once"
	};
}

/**
 * Apply classified firing-crew PB onto a per-roll attack config (postBuild).
 * Does not strip stock `@prof`. Soft-warns once per process when nonzero `@prof` blocks inject.
 *
 * @param {object} processConfig
 * @param {object} rollConfig
 * @returns {{ injected: boolean, decision: string, classification: object|null }}
 */
export function applyStarshipAttackCrewPbInjection(processConfig, rollConfig) {
	if ( !processConfig || !rollConfig ) {
		return { injected: false, decision: "skip-no-config", classification: null };
	}
	if ( !(processConfig.hookNames ?? []).some(name => /^attack$/i.test(String(name ?? ""))) ) {
		return { injected: false, decision: "skip-not-attack", classification: null };
	}

	const invocationId = String(processConfig[STARSHIP_ATTACK_INVOCATION_ID_KEY] ?? "").trim();
	const stored = invocationId ? peekStarshipAttackFiringCrewState(invocationId) : null;

	let firingUuid = String(processConfig[STARSHIP_ATTACK_FIRING_CREW_UUID_KEY] ?? "").trim();
	let crewPb = Number(processConfig[STARSHIP_ATTACK_FIRING_CREW_PB_KEY]);
	if ( !firingUuid && stored?.actorUuid ) {
		firingUuid = stored.actorUuid;
		crewPb = stored.proficiencyBonus;
		processConfig[STARSHIP_ATTACK_FIRING_CREW_UUID_KEY] = firingUuid;
		processConfig[STARSHIP_ATTACK_FIRING_CREW_PB_KEY] = crewPb;
	}

	const subject = processConfig.subject;
	const actor = subject?.actor
		?? (subject?.documentName === "Actor" ? subject : null)
		?? subject?.item?.actor
		?? null;
	const actorProf = toFiniteNumber(actor?.system?.attributes?.prof, 0) ?? 0;

	rollConfig.parts = Array.isArray(rollConfig.parts) ? [...rollConfig.parts] : [];
	rollConfig.data = foundry.utils.mergeObject({}, rollConfig.data ?? {}, { inplace: false });

	const classification = classifyStarshipAttackCrewPbInjection({
		parts: rollConfig.parts,
		data: rollConfig.data,
		crewProficiency: crewPb,
		hasResolvedFiringCrew: Boolean(firingUuid),
		actorProf
	});

	if ( classification.decision === "skip-nonzero-stock-prof" ) {
		if ( !processConfig[STARSHIP_ATTACK_NONZERO_PROF_WARNED_KEY] ) {
			processConfig[STARSHIP_ATTACK_NONZERO_PROF_WARNED_KEY] = true;
			const title = globalThis.game?.i18n?.localize?.("SW5E.Starship.Attack.NonzeroStockProfTitle")
				?? "Starship attack";
			const body = globalThis.game?.i18n?.localize?.("SW5E.Starship.Attack.NonzeroStockProfWarning")
				?? "Stock proficiency (@prof) is unexpectedly nonzero; firing-crew PB was not added. Investigate before changing roll parts.";
			console.warn(`SW5E MODULE | ${title}: ${body}`, {
				stockProfValue: classification.stockProfValue,
				actorProf: classification.actorProf,
				parts: rollConfig.parts
			});
			globalThis.ui?.notifications?.warn?.(`${title}: ${body}`);
		}
		return { injected: false, decision: classification.decision, classification };
	}

	if ( classification.decision !== "inject" ) {
		return { injected: false, decision: classification.decision, classification };
	}

	rollConfig.parts.push(STARSHIP_ATTACK_CREW_PB_PART);
	rollConfig.data[STARSHIP_ATTACK_CREW_PB_DATA_KEY] = crewPb;
	processConfig[STARSHIP_ATTACK_CREW_PB_INJECTED_KEY] = true;
	return { injected: true, decision: "inject", classification };
}

/**
 * Resolve firing crew for a starship attack (29A + 29E-P). Feeds `explicitActor` — no second resolver.
 *
 * @param {{
 *   starshipActor: Actor,
 *   event?: Event|null,
 *   user?: User,
 *   explicitActor?: Actor|null
 * }} args
 * @returns {Promise<{
 *   cancelled: boolean,
 *   explicitActor: Actor|null,
 *   source: string,
 *   proficiencyBonus: number,
 *   selectionMode: "none"|"automatic"|"picker"
 * }>}
 */
export async function prepareStarshipAttackFiringCrew({
	starshipActor,
	event=null,
	user=globalThis.game?.user,
	explicitActor=null
}={}) {
	const empty = {
		cancelled: false,
		explicitActor: null,
		source: "none",
		proficiencyBonus: 0,
		selectionMode: "none"
	};
	if ( !isStarshipFlagVehicle(starshipActor) || !user ) return empty;

	const candidatePack = buildStarshipResponsibleCrewCandidates({
		starshipActor,
		user
	});
	const priorSource = resolveStarshipResponsibleCrewActor(starshipActor, user, {
		mode: "roll",
		explicitActor: explicitActor ?? null
	});
	const priorUuid = priorSource?.actor?.uuid ?? "";
	const priorPermitted = Boolean(
		priorUuid && candidatePack.candidates.some(candidate => candidate.actorUuid === priorUuid)
	);
	const preselectedResponsibleCrewUuid = priorPermitted ? priorUuid : "";

	let selectedExplicitActor = null;
	if ( candidatePack.selectionMode === "automatic" ) {
		const autoUuid = candidatePack.automaticActor?.uuid ?? candidatePack.candidates[0]?.actorUuid ?? "";
		selectedExplicitActor = resolveValidatedResponsibleCrewActor({
			starshipActor,
			user,
			actorUuid: autoUuid
		});
	} else if ( candidatePack.selectionMode === "none" ) {
		selectedExplicitActor = null;
	} else if ( explicitActor ) {
		selectedExplicitActor = resolveValidatedResponsibleCrewActor({
			starshipActor,
			user,
			actorUuid: explicitActor?.uuid ?? ""
		});
	}

	const needsPicker = candidatePack.selectionMode === "picker";

	if ( needsPicker ) {
		const dialogSafeCandidates = toDialogSafeResponsibleCrewCandidates(candidatePack.candidates);
		const { promptStarshipAttackCrewPicker } = await import("./starship-attack-crew-picker.mjs");
		const dialogSelection = await promptStarshipAttackCrewPicker({
			actor: starshipActor,
			responsibleCrewCandidates: dialogSafeCandidates,
			preselectedResponsibleCrewUuid
		});
		if ( !dialogSelection ) {
			return {
				cancelled: true,
				explicitActor: null,
				source: "none",
				proficiencyBonus: 0,
				selectionMode: "picker"
			};
		}
		selectedExplicitActor = resolveValidatedResponsibleCrewActor({
			starshipActor,
			user,
			actorUuid: dialogSelection.responsibleCrewUuid
		});
		if ( !selectedExplicitActor ) {
			const warnTitle = globalThis.game?.i18n?.localize?.("SW5E.Starship.Attack.NoCrewPBTitle")
				?? "Starship attack";
			const warnBody = globalThis.game?.i18n?.localize?.("SW5E.Starship.Roll.NoCrewPBNotSelected")
				?? "No qualified crew member was selected for this roll.";
			globalThis.ui?.notifications?.warn?.(`${warnTitle}: ${warnBody}`);
			return {
				cancelled: true,
				explicitActor: null,
				source: "none",
				proficiencyBonus: 0,
				selectionMode: "picker"
			};
		}
	}

	const crewPbSource = resolveStarshipResponsibleCrewActor(starshipActor, user, {
		mode: "roll",
		explicitActor: selectedExplicitActor
	});
	const deployed = crewPbSource.actor;
	if ( selectedExplicitActor && deployed?.uuid !== selectedExplicitActor.uuid ) {
		const warnTitle = globalThis.game?.i18n?.localize?.("SW5E.Starship.Attack.NoCrewPBTitle")
			?? "Starship attack";
		const warnBody = globalThis.game?.i18n?.localize?.("SW5E.Starship.Roll.NoCrewPBNotSelected")
			?? "No qualified crew member was selected for this roll.";
		globalThis.ui?.notifications?.warn?.(`${warnTitle}: ${warnBody}`);
		return {
			cancelled: true,
			explicitActor: null,
			source: "none",
			proficiencyBonus: 0,
			selectionMode: candidatePack.selectionMode
		};
	}

	const proficiencyBonus = deployed
		? (toFiniteNumber(deployed.system?.attributes?.prof, NaN) ?? NaN)
		: NaN;
	return {
		cancelled: false,
		explicitActor: deployed,
		source: crewPbSource.source,
		proficiencyBonus: Number.isFinite(proficiencyBonus) ? proficiencyBonus : 0,
		selectionMode: candidatePack.selectionMode
	};
}

/**
 * Exactly one canvas-controlled Token Actor that qualifies (local client selection only).
 * @param {Actor} starshipActor
 * @param {User} rollingUser
 * @returns {Actor|null}
 */
function resolveUnambiguousControlledQualifyingActor(starshipActor, rollingUser) {
	if ( !rollingUser || rollingUser !== globalThis.game?.user ) return null;
	const controlled = globalThis.canvas?.tokens?.controlled;
	if ( !Array.isArray(controlled) || !controlled.length ) return null;

	const qualifying = [];
	const seen = new Set();
	for ( const token of controlled ) {
		const actor = token?.actor;
		if ( !actor?.uuid || seen.has(actor.uuid) ) continue;
		seen.add(actor.uuid);
		if ( actorQualifiesForStarshipCrewPb(starshipActor, actor) ) qualifying.push(actor);
	}
	return qualifying.length === 1 ? qualifying[0] : null;
}

function buildStarshipCrewPbNoneResult(reasonKey="SW5E.Starship.Roll.CrewPBSourceNoneReason") {
	return {
		actor: null,
		source: "none",
		name: "",
		reasonKey
	};
}

function buildStarshipCrewPbSourceResult(actor, source) {
	return {
		actor,
		source,
		name: actor?.name ?? ""
	};
}

/**
 * Bug 29A responsible crew Actor for starship skill PB.
 * Modes:
 * - `roll`: explicit → assigned → one controlled qualified Actor → none
 * - `display`: assigned → none (no controlled-token dependence)
 * Never uses Active station or Pilot as silent fallbacks. Never uses Passenger-only membership.
 * @param {Actor} starshipActor
 * @param {User} rollingUser
 * @param {{ mode: "roll"|"display", explicitActor?: Actor|null }} options
 * @returns {{ actor: Actor|null, source: "explicit"|"assigned"|"controlled"|"none", name: string, reasonKey?: string }}
 */
function resolveStarshipResponsibleCrewActor(starshipActor, rollingUser, options={}) {
	const mode = options?.mode;
	if ( mode !== "roll" && mode !== "display" ) {
		console.warn("SW5E MODULE | resolveStarshipResponsibleCrewActor requires mode \"roll\" or \"display\".");
		return buildStarshipCrewPbNoneResult();
	}

	if ( mode === "roll" ) {
		const explicit = options?.explicitActor ?? null;
		if ( explicit && actorQualifiesForStarshipCrewPb(starshipActor, explicit) ) {
			return buildStarshipCrewPbSourceResult(explicit, "explicit");
		}
	}

	const assigned = rollingUser?.character;
	if ( assigned && actorQualifiesForStarshipCrewPb(starshipActor, assigned) ) {
		return buildStarshipCrewPbSourceResult(assigned, "assigned");
	}

	if ( mode === "roll" ) {
		const controlled = resolveUnambiguousControlledQualifyingActor(starshipActor, rollingUser);
		if ( controlled ) return buildStarshipCrewPbSourceResult(controlled, "controlled");
	}

	return buildStarshipCrewPbNoneResult();
}

/**
 * Skill crew-PB source with explicit roll vs display mode (Bug 29A).
 * @param {Actor} starshipActor
 * @param {User} rollingUser
 * @param {{ mode: "roll"|"display", explicitActor?: Actor|null }} options
 */
function resolveStarshipSkillCrewPbSource(starshipActor, rollingUser, options={}) {
	return resolveStarshipResponsibleCrewActor(starshipActor, rollingUser, options);
}

function getStarshipSkillCrewPbSourceLabel(pbSource) {
	if ( !pbSource || pbSource.source === "none" ) {
		const reasonKey = pbSource?.reasonKey ?? "SW5E.Starship.Roll.CrewPBSourceNoneReason";
		const reason = game.i18n.localize(reasonKey);
		return game.i18n.format("SW5E.Starship.Roll.CrewPBSourceNone", { reason });
	}

	const name = pbSource.name ?? pbSource.actor?.name ?? "";
	if ( pbSource.source === "assigned" ) {
		return game.i18n.format("SW5E.Starship.Roll.CrewPBSourceAssigned", { name });
	}
	if ( pbSource.source === "controlled" ) {
		return game.i18n.format("SW5E.Starship.Roll.CrewPBSourceControlled", { name });
	}
	if ( pbSource.source === "explicit" ) {
		return game.i18n.format("SW5E.Starship.Roll.CrewPBSourceExplicit", { name });
	}
	if ( pbSource.source === "automatic" ) {
		return game.i18n.format("SW5E.Starship.Roll.CrewPBSourceAutomatic", { name });
	}
	return game.i18n.format("SW5E.Starship.Roll.CrewPBSourceNone", {
		reason: game.i18n.localize("SW5E.Starship.Roll.CrewPBSourceNoneReason")
	});
}

/**
 * Localized chat line describing which crew actor supplied PB (or why none), plus whether numeric PB applied.
 * This is a messaging-only P1 slice: no roll math changes, only clearer attribution for tier-0 / PB-0 cases.
 * @param {{ actor: Actor|null, source: string, name?: string, reasonKey?: string }} pbSource
 * @param {{ rollerPb?: number, proficiencyMode?: number, multiplier?: number, rollProficiencyPoints?: number }} [detail]
 * @returns {string}
 */
function buildStarshipSkillCrewPbChatLine(pbSource, detail={}) {
	const sourceLine = getStarshipSkillCrewPbSourceLabel(pbSource);
	if ( !pbSource || pbSource.source === "none" ) return sourceLine;

	const rollProficiencyPoints = toFiniteNumber(detail.rollProficiencyPoints, 0) ?? 0;
	const multiplier = toFiniteNumber(detail.multiplier, 0) ?? 0;
	const rollerPb = toFiniteNumber(detail.rollerPb, 0) ?? 0;

	if ( rollProficiencyPoints > 0 ) {
		const applied = game.i18n.format("SW5E.Starship.Roll.CrewPBAppliedDetail", {
			value: rollProficiencyPoints
		});
		return `${sourceLine}; ${applied}`;
	}

	if ( multiplier <= 0 ) {
		return `${sourceLine}; ${game.i18n.localize("SW5E.Starship.Roll.CrewPBSourceZeroSkillTier")}`;
	}

	if ( rollerPb <= 0 ) {
		return `${sourceLine}; ${game.i18n.localize("SW5E.Starship.Roll.CrewPBSourceZeroCrewPB")}`;
	}

	return `${sourceLine}; ${game.i18n.localize("SW5E.Starship.Roll.CrewPBSourceZeroGeneric")}`;
}

function buildStarshipSkillChatFlavorSuffix(pbSource, detail={}) {
	const rollProficiencyPoints = toFiniteNumber(detail.rollProficiencyPoints, 0) ?? 0;
	const multiplier = toFiniteNumber(detail.multiplier, 0) ?? 0;
	const rollerPb = toFiniteNumber(detail.rollerPb, 0) ?? 0;

	if ( !pbSource || pbSource.source === "none" ) {
		return game.i18n.localize("SW5E.Starship.Roll.NoCrewPBShort");
	}
	if ( rollProficiencyPoints > 0 ) return "";
	if ( multiplier <= 0 ) {
		return game.i18n.localize("SW5E.Starship.Roll.SkillNotProficientShort");
	}
	if ( rollerPb <= 0 ) {
		return game.i18n.localize("SW5E.Starship.Roll.CrewPBZeroShort");
	}
	return game.i18n.localize("SW5E.Starship.Roll.NoCrewPBShort");
}

function buildStarshipSkillDisplayEntry(actor, entry, rollingUser = globalThis.game?.user) {
	const crewPbSource = resolveStarshipSkillCrewPbSource(actor, rollingUser, { mode: "display" });
	const deployedRoller = crewPbSource.actor;
	const rollerPb = toFiniteNumber(deployedRoller?.system?.attributes?.prof, 0) ?? 0;
	const proficiencyMultiplier = getStarshipSkillProficiencyMultiplier(entry.proficiencyMode);
	const effectiveProficiency = deployedRoller
		? Math.round(rollerPb * proficiencyMultiplier)
		: 0;
	const effectiveTotal = entry.parts.abilityMod + effectiveProficiency + entry.parts.bonus;
	const fullSourceLabel = getStarshipSkillCrewPbSourceLabel(crewPbSource);
	const showCrewPbAttribution = crewPbSource?.source !== "none"
		&& canAttributeStarshipCrewActor(actor, deployedRoller, rollingUser);
	return {
		...entry,
		effectiveCrewPbSource: crewPbSource,
		effectiveCrewPbSourceLabel: fullSourceLabel,
		crewPbAttributionLabel: showCrewPbAttribution ? fullSourceLabel : "",
		showCrewPbAttribution,
		effectiveCrewPbLine: buildStarshipSkillCrewPbChatLine(crewPbSource, {
			rollerPb,
			proficiencyMode: entry.proficiencyMode,
			multiplier: proficiencyMultiplier,
			rollProficiencyPoints: effectiveProficiency
		}),
		effectiveCrewPb: rollerPb,
		effectiveProficiency,
		effectiveTotal,
		displayParts: {
			...entry.parts,
			proficiency: effectiveProficiency
		}
	};
}

/**
 * Whether starship skill roll UX (crew PB notice/warning) should apply — avoids changing plain vehicle sheets.
 * @param {Actor} actor
 * @returns {boolean}
 */
function qualifiesForStarshipSkillRollMessaging(actor) {
	if ( actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship" ) return true;
	if ( actor?.flags?.sw5e?.createStarship ) return true;
	return isLegacyStarshipLikeActor({
		type: actor?.type,
		flags: actor?.flags,
		items: Array.from(actor?.items ?? [])
	});
}

/** Prepared skill rows for the sheet sidebar; proficiency uses the merged vehicle `attributes.prof` × tier (often 0). Display-time crew PB uses assigned-only resolution — see {@link rollStarshipSkill} for roll-time (may include controlled Token). */
export function getStarshipSkillEntries(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const runtime = getDerivedStarshipRuntime(actor);
	const skillConfig = getStarshipSkillsConfig();
	const baseProficiency = getStarshipActorProficiencyBonus(actor, legacySystem);
	const pilotSkill = toFiniteNumber(runtime.crew?.pilotSkill, 0) ?? 0;

	return Object.entries(skillConfig).map(([key, config]) => {
		const skill = legacySystem.skills?.[key] ?? {};
		const ability = resolveStarshipSkillAbility(skill, config);
		const abilityValue = toFiniteNumber(actor?.system?.abilities?.[ability]?.value, toFiniteNumber(legacySystem.abilities?.[ability]?.value, 10)) ?? 10;
		const abilityMod = Math.floor((abilityValue - 10) / 2);
		const proficiencyMode = toFiniteNumber(skill.value, 0) ?? 0;
		const multiplier = getStarshipSkillProficiencyMultiplier(proficiencyMode);
		const proficiency = Math.round(baseProficiency * multiplier);
		let bonus = getSkillBonus(skill);
		const baseTotal = abilityMod + proficiency + bonus;
		if ( key === "man" && pilotSkill > baseTotal ) bonus += (pilotSkill - baseTotal);
		return {
			id: key,
			label: resolveStarshipSkillLabel(config, key),
			ability,
			abilityLabel: CONFIG?.DND5E?.abilities?.[ability]?.label ?? ability.toUpperCase(),
			proficiencyMode,
			hover: proficiencyLevelHoverLabel(proficiencyMode),
			total: abilityMod + proficiency + bonus,
			parts: {
				abilityMod,
				proficiency,
				bonus
			}
		};
	}).sort((left, right) => left.label.localeCompare(right.label));
}

/**
 * Display-only starship skill rows for the current user: keeps stored tier / bonus data from
 * {@link getStarshipSkillEntries} but swaps the displayed proficiency contribution to the
 * display-time crew PB source (assigned qualified Actor → none). Roll-time resolution may also
 * use an unambiguous controlled Token — see {@link rollStarshipSkill}.
 * @param {Actor} actor
 * @param {User} [rollingUser]
 * @returns {Array<object>}
 */
export function getStarshipSkillDisplayEntries(actor, rollingUser = globalThis.game?.user) {
	return getStarshipSkillEntries(actor)
		.map(entry => buildStarshipSkillDisplayEntry(actor, entry, rollingUser))
		.sort((left, right) => left.label.localeCompare(right.label));
}

function getStarshipAdvantageMode(event) {
	const advantageModes = CONFIG?.Dice?.D20Roll?.ADV_MODE ?? {};
	const normal = advantageModes.NORMAL ?? 0;
	const advantage = advantageModes.ADVANTAGE ?? 1;
	const disadvantage = advantageModes.DISADVANTAGE ?? -1;

	if ( event?.altKey ) return advantage;
	if ( event?.ctrlKey || event?.metaKey ) return disadvantage;
	return normal;
}

export function isStarshipFastForward(event) {
	return Boolean(event?.shiftKey || event?.altKey || event?.ctrlKey || event?.metaKey);
}

function buildStarshipRollAbilities(actor) {
	const legacyAbilities = getLegacyStarshipActorSystem(actor).abilities ?? {};
	const configuredAbilities = CONFIG?.DND5E?.abilities ?? CONFIG?.SW5E?.abilities ?? {};
	const currentAbilities = actor?.system?.abilities ?? {};

	return Object.keys(configuredAbilities).reduce((abilities, key) => {
		const currentAbility = currentAbilities[key] ?? {};
		const legacyAbility = legacyAbilities[key] ?? {};
		const value = toFiniteNumber(currentAbility?.value, toFiniteNumber(legacyAbility?.value, 10)) ?? 10;
		const mod = toFiniteNumber(currentAbility?.mod, Math.floor((value - 10) / 2)) ?? 0;
		abilities[key] = {
			mod,
			bonuses: {
				check: currentAbility?.bonuses?.check ?? legacyAbility?.bonuses?.check ?? ""
			}
		};
		return abilities;
	}, {});
}

function getStarshipAbilityRollEntry(actor, abilityId) {
	const configuredAbilities = CONFIG?.DND5E?.abilities ?? CONFIG?.SW5E?.abilities ?? {};
	if ( !(abilityId in configuredAbilities) ) return null;

	const currentAbility = actor?.system?.abilities?.[abilityId] ?? {};
	const legacyAbility = getLegacyStarshipActorSystem(actor).abilities?.[abilityId] ?? {};
	const value = toFiniteNumber(currentAbility?.value, toFiniteNumber(legacyAbility?.value, 10)) ?? 10;
	const mod = toFiniteNumber(currentAbility?.mod, Math.floor((value - 10) / 2)) ?? 0;
	const checkBonus = currentAbility?.bonuses?.check ?? legacyAbility?.bonuses?.check ?? "";
	const saveBonus = currentAbility?.bonuses?.save ?? legacyAbility?.bonuses?.save ?? "";
	const cfg = configuredAbilities[abilityId] ?? {};
	const labelKey = typeof cfg?.label === "string" ? cfg.label : "";
	const localizedLabel = labelKey ? game.i18n.localize(labelKey) : abilityId.toUpperCase();
	return {
		id: abilityId,
		label: localizedLabel && localizedLabel !== labelKey ? localizedLabel : abilityId.toUpperCase(),
		mod,
		checkBonus,
		saveBonus
	};
}

function getStarshipAbilityRollData(actor, abilityId, entry, mode) {
	const rollData = foundry.utils.deepClone(actor?.getRollData?.() ?? {});
	const shipProf = getStarshipActorProficiencyBonus(actor, getLegacyStarshipActorSystem(actor));
	rollData.abilities ??= {};
	rollData.abilities[abilityId] ??= {};
	rollData.abilities[abilityId].mod = entry.mod;
	rollData.abilities[abilityId].bonuses ??= {};
	rollData.abilities[abilityId].bonuses.check = entry.checkBonus;
	rollData.abilities[abilityId].bonuses.save = entry.saveBonus;
	rollData.mod = entry.mod;
	rollData.prof = toFiniteNumber(rollData.prof, shipProf) ?? 0;
	return rollData;
}

function buildStarshipAbilityRollFormula(actor, abilityId, entry, mode) {
	const rollData = getStarshipAbilityRollData(actor, abilityId, entry, mode);
	const bonus = mode === "save" ? entry.saveBonus : entry.checkBonus;
	const terms = [
		normalizeFormulaTerm(entry.mod, rollData),
		normalizeFormulaTerm(bonus, rollData)
	];
	if ( mode === "save" ) {
		const pilotProficiency = getStarshipSavePilotProficiency(actor, abilityId);
		if ( pilotProficiency ) {
			rollData[STARSHIP_SAVE_PILOT_PB_DATA_KEY] = pilotProficiency;
			rollData.prof = pilotProficiency;
			terms.push(normalizeFormulaTerm(pilotProficiency, rollData));
		}
	}
	const formula = buildRollFormula(terms);
	return { formula, rollData };
}

async function resolveStarshipAbilitySaveAutoFail(actor, abilityId) {
	if ( !shouldStarshipSaveAutoFail(actor, abilityId) ) return null;
	const entry = getStarshipAbilityRollEntry(actor, abilityId);
	if ( !entry ) return null;
	return postStarshipSaveAutoFailMessage(actor, entry.label);
}

async function executeStarshipAbilityRoll(actor, abilityId, mode, event) {
	const entry = getStarshipAbilityRollEntry(actor, abilityId);
	if ( !entry ) return null;

	if ( mode === "save" ) {
		const autoFail = await resolveStarshipAbilitySaveAutoFail(actor, abilityId);
		if ( autoFail ) return autoFail;
	}

	const { formula, rollData } = buildStarshipAbilityRollFormula(actor, abilityId, entry, mode);
	const defaultRollMode = game.settings.get("core", "rollMode");
	const rollLabel = mode === "save"
		? localizeWithFallback("SW5E.ActionSave", "Saving Throw")
		: localizeWithFallback("SW5E.ActionAbil", "Ability Check");
	const baseAdvantageMode = getStarshipAdvantageMode(event);
	const rollKind = mode === "save" ? "save" : "check";
	const advantageMode = resolveStarshipDefaultAdvantageMode({ actor, rollKind, baseMode: baseAdvantageMode });
	const systemDamageNote = mode === "save" ? buildStarshipSystemDamageAttackSaveFlavorNote(actor) : "";
	const roll = new CONFIG.Dice.D20Roll(formula, rollData, {
		flavor: `${actor.name}: ${entry.label} ${rollLabel}`,
		advantageMode,
		defaultRollMode,
		rollMode: defaultRollMode
	});

	await roll.evaluate();
	const baseFlavor = `${entry.label} (${rollLabel})`;
	const flavor = isStarshipSystemDamageAttackSaveDisadvantageRoll(actor, advantageMode) && systemDamageNote
		? `${baseFlavor} — ${systemDamageNote}`
		: baseFlavor;
	await roll.toMessage({
		speaker: ChatMessage.getSpeaker({ actor }),
		flavor
	});
	return roll;
}

/**
 * Roll a Starship ability check (no check/save chooser).
 * @param {Actor} actor
 * @param {string} abilityId
 * @param {Event} [event]
 */
export async function rollStarshipAbilityCheck(actor, abilityId, event) {
	if ( !abilityId ) return null;
	if ( typeof actor?.rollAbilityCheck === "function" ) {
		try {
			return await actor.rollAbilityCheck({ ability: abilityId, event });
		} catch (err) {
			console.warn("SW5E MODULE | Starship ability check via rollAbilityCheck failed; using fallback.", err);
		}
	}
	return executeStarshipAbilityRoll(actor, abilityId, "check", event);
}

/**
 * Roll a Starship ability saving throw using prepared vehicle save data when possible.
 * Stock `rollSavingThrow` remains primary (Bug 29C): Pilot PB injects via a fresh per-call
 * `rolls` merge config (dnd5e 5.2.5 `D20Roll.mergeConfigs`) plus `preRollSavingThrow` safety net.
 * Does not bypass stock merely to add Pilot PB.
 * @param {Actor} actor
 * @param {string} abilityId
 * @param {Event} [event]
 */
export async function rollStarshipAbilitySave(actor, abilityId, event) {
	if ( !abilityId ) return null;
	const autoFail = await resolveStarshipAbilitySaveAutoFail(actor, abilityId);
	if ( autoFail ) return autoFail;
	if ( typeof actor?.rollSavingThrow === "function" ) {
		try {
			const pilotPbConfig = isStarshipFlagVehicle(actor)
				? buildStarshipSavePilotPbStockRollConfig(actor, abilityId)
				: {};
			return await actor.rollSavingThrow({
				ability: abilityId,
				event,
				...pilotPbConfig
			});
		} catch (err) {
			console.warn("SW5E MODULE | Starship save roll via rollSavingThrow failed; using fallback.", err);
		}
	}
	return executeStarshipAbilityRoll(actor, abilityId, "save", event);
}

export async function rollStarshipAbility(actor, abilityId, event) {
	const entry = getStarshipAbilityRollEntry(actor, abilityId);
	if ( !entry ) return null;

	const localizedPromptTitle = game?.i18n?.format?.("SW5E.AbilityPromptTitle", { ability: entry.label });
	const localizedPromptBody = game?.i18n?.format?.("SW5E.AbilityPromptText", { ability: entry.label });
	const promptTitleBase = localizedPromptTitle && localizedPromptTitle !== "SW5E.AbilityPromptTitle"
		? localizedPromptTitle
		: entry.label;
	const promptBody = localizedPromptBody && localizedPromptBody !== "SW5E.AbilityPromptText"
		? localizedPromptBody
		: `Choose whether to roll an ability check or saving throw for ${entry.label}.`;
	const promptTitle = `${promptTitleBase}: ${actor?.name ?? localizeWithFallback("TYPES.Actor.vehicle", "Vehicle Actor")}`;
	const selection = await foundry.applications.api.DialogV2.wait({
		window: { title: promptTitle },
		content: `<p>${escapeHtml(promptBody)}</p>`,
		buttons: [
			{
				action: "check",
				label: localizeWithFallback("SW5E.ActionAbil", "Ability Check"),
				icon: "fas fa-dice-d20",
				default: true
			},
			{
				action: "save",
				label: localizeWithFallback("SW5E.ActionSave", "Saving Throw"),
				icon: "fas fa-shield-alt"
			},
			{
				action: "cancel",
				label: localizeWithFallback("Cancel", "Cancel"),
				icon: "fas fa-times"
			}
		],
		rejectClose: false
	});

	if ( selection === "check" ) return executeStarshipAbilityRoll(actor, abilityId, "check", event);
	// Route chooser saves through stock-primary `rollStarshipAbilitySave` (not custom-only).
	if ( selection === "save" ) return rollStarshipAbilitySave(actor, abilityId, event);
	return null;
}

function getStarshipRollData(actor, selectedAbility, chosenAbility, proficiencyBonusForData = null) {
	const rollData = foundry.utils.deepClone(actor?.getRollData?.() ?? {});
	rollData.abilities ??= {};
	rollData.abilities[selectedAbility] ??= {};
	rollData.abilities[selectedAbility].mod = toFiniteNumber(chosenAbility?.mod, 0) ?? 0;
	rollData.abilities[selectedAbility].bonuses ??= {};
	rollData.abilities[selectedAbility].bonuses.check = chosenAbility?.bonuses?.check ?? "";
	rollData.mod = rollData.abilities[selectedAbility].mod;
	const shipProf = getStarshipActorProficiencyBonus(actor, getLegacyStarshipActorSystem(actor));
	const profSource = proficiencyBonusForData !== null && proficiencyBonusForData !== undefined
		? proficiencyBonusForData
		: shipProf;
	rollData.prof = toFiniteNumber(rollData.prof, profSource) ?? 0;
	return rollData;
}

function normalizeFormulaTerm(term, rollData={}) {
	if ( term === null || term === undefined ) return null;
	let text = String(term).trim();
	if ( !text ) return null;

	try {
		text = Roll.replaceFormulaData(text, rollData, { missing: "0" });
	} catch {
		// Keep the original text if formula replacement is unavailable.
	}

	text = String(text ?? "").trim();
	if ( !text || /^[-+]?0(?:\.0+)?$/.test(text) ) return null;

	try {
		new Roll(text, rollData);
	} catch {
		return null;
	}

	return text;
}

function buildRollFormula(terms=[]) {
	let formula = "1d20";
	for ( const term of terms ) {
		const text = String(term ?? "").trim();
		if ( !text ) continue;
		if ( text.startsWith("-") ) formula += ` - ${text.slice(1).trim()}`;
		else if ( text.startsWith("+") ) formula += ` + ${text.slice(1).trim()}`;
		else formula += ` + ${text}`;
	}
	return formula;
}

function buildStarshipSkillFormula(
	actor,
	entry,
	selectedAbility,
	chosenAbility,
	situationalBonus="",
	{ rollProficiencyPoints = null, rollDataProficiency = null } = {}
) {
	const rollData = getStarshipRollData(actor, selectedAbility, chosenAbility, rollDataProficiency);
	const profPoints = rollProficiencyPoints !== null && rollProficiencyPoints !== undefined
		? rollProficiencyPoints
		: entry.parts.proficiency;
	const terms = [
		normalizeFormulaTerm(chosenAbility?.mod ?? entry.parts.abilityMod, rollData),
		normalizeFormulaTerm(chosenAbility?.bonuses?.check, rollData),
		normalizeFormulaTerm(profPoints, rollData),
		normalizeFormulaTerm(entry.parts.bonus, rollData),
		normalizeFormulaTerm(situationalBonus, rollData)
	].filter(Boolean);
	return buildRollFormula(terms);
}

/**
 * @param {Actor} actor Starship (vehicle) actor
 * @param {string} skillId Starship skill key
 * @param {Event} [event] Click / key modifiers for fast-forward rolls
 * @param {User} [rollingUser] User performing the roll (defaults to `game.user`). Crew PB uses Bug 29A roll-time resolution (explicit → assigned → one controlled qualified Actor → none), with Bug 29E-P picker when multiple permitted candidates exist.
 * @param {{ flavorPrefix?: string, dc?: number|null, explicitActor?: Actor|null }} [messageOptions] Optional chat flavor prefix, DC comparison, and explicit crew PB Actor override.
 * @returns {Promise<{ roll: Roll, total: number, skillId: string, label: string }|null>}
 */
export async function rollStarshipSkill(actor, skillId, event, rollingUser, messageOptions = {}) {
	const entry = getStarshipSkillEntries(actor).find(skill => skill.id === skillId);
	if ( !entry ) return null;

	const roller = rollingUser ?? game.user;
	const candidatePack = buildStarshipResponsibleCrewCandidates({ starshipActor: actor, user: roller });
	const priorSource = resolveStarshipSkillCrewPbSource(actor, roller, {
		mode: "roll",
		explicitActor: messageOptions?.explicitActor ?? null
	});
	const priorUuid = priorSource?.actor?.uuid ?? "";
	const priorPermitted = Boolean(
		priorUuid && candidatePack.candidates.some(candidate => candidate.actorUuid === priorUuid)
	);
	const preselectedResponsibleCrewUuid = priorPermitted ? priorUuid : "";

	let selectedExplicitActor = null;
	if ( candidatePack.selectionMode === "automatic" ) {
		const autoUuid = candidatePack.automaticActor?.uuid ?? candidatePack.candidates[0]?.actorUuid ?? "";
		selectedExplicitActor = resolveValidatedResponsibleCrewActor({
			starshipActor: actor,
			user: roller,
			actorUuid: autoUuid
		});
	} else if ( candidatePack.selectionMode === "none" ) {
		selectedExplicitActor = null;
	} else if ( messageOptions?.explicitActor ) {
		// Caller-supplied explicit Actor only when it remains in the permitted set.
		const callerUuid = messageOptions.explicitActor?.uuid ?? "";
		selectedExplicitActor = resolveValidatedResponsibleCrewActor({
			starshipActor: actor,
			user: roller,
			actorUuid: callerUuid
		});
	}

	const needsPicker = candidatePack.selectionMode === "picker";
	const forceDialogForPicker = needsPicker;
	const fastForward = isStarshipFastForward(event) && !forceDialogForPicker;

	const previewActor = needsPicker
		? (preselectedResponsibleCrewUuid
			? resolveValidatedResponsibleCrewActor({
				starshipActor: actor,
				user: roller,
				actorUuid: preselectedResponsibleCrewUuid
			})
			: null)
		: selectedExplicitActor;

	const previewPb = toFiniteNumber(previewActor?.system?.attributes?.prof, 0) ?? 0;
	const proficiencyMultiplier = getStarshipSkillProficiencyMultiplier(entry.proficiencyMode);
	let rollProficiencyPoints = previewActor
		? computeStarshipSkillCrewProficiencyPoints(entry.proficiencyMode, previewPb)
		: 0;
	let rollDataProficiency = previewActor ? previewPb : 0;
	const dialogEntry = {
		...entry,
		parts: {
			...entry.parts,
			proficiency: rollProficiencyPoints
		},
		total: entry.parts.abilityMod + rollProficiencyPoints + entry.parts.bonus
	};

	const previewSource = (() => {
		if ( !previewActor ) return buildStarshipCrewPbNoneResult();
		if ( needsPicker ) {
			// Named "selected" only when a real picker preselection exists; otherwise no named PB yet.
			if ( !preselectedResponsibleCrewUuid ) return buildStarshipCrewPbNoneResult();
			if ( priorPermitted && priorSource.source !== "none" ) {
				return buildStarshipCrewPbSourceResult(previewActor, priorSource.source);
			}
			return buildStarshipCrewPbSourceResult(previewActor, "explicit");
		}
		if ( priorPermitted && priorSource.source !== "none" ) {
			return buildStarshipCrewPbSourceResult(previewActor, priorSource.source);
		}
		return buildStarshipCrewPbSourceResult(previewActor, "automatic");
	})();
	let crewPbAttributionLabel = previewSource.source !== "none"
		&& canAttributeStarshipCrewActor(actor, previewActor, roller)
		? getStarshipSkillCrewPbSourceLabel(previewSource)
		: "";

	const defaultRollMode = game.settings.get("core", "rollMode");
	const abilities = buildStarshipRollAbilities(actor);
	const masteryTier = entry.proficiencyMode;
	const forcedAdvantage = isMasteryProficiencyTier(masteryTier);
	const baseAdvantageMode = forcedAdvantage
		? getProficiencyAdvantageMode()
		: getStarshipAdvantageMode(event);
	const defaultAdvantageMode = applyStarshipSystemDamageSkillCheckAdvantageDefault(actor, baseAdvantageMode);
	const systemDamageNote = buildStarshipSystemDamageSkillCheckFlavorNote(actor);

	const dialogSafeCandidates = toDialogSafeResponsibleCrewCandidates(candidatePack.candidates);

	const dialogSelection = fastForward
		? {
			ability: entry.ability,
			bonus: "",
			rollMode: defaultRollMode,
			advantageMode: forcedAdvantage ? getProficiencyAdvantageMode() : defaultAdvantageMode,
			responsibleCrewUuid: selectedExplicitActor?.uuid ?? ""
		}
		: await (await import("./starship-skill-roll-config.mjs")).promptStarshipSkillRoll({
			actor,
			entry: dialogEntry,
			abilities,
			defaultRollMode,
			initialMode: forcedAdvantage ? getProficiencyAdvantageMode() : defaultAdvantageMode,
			forcedAdvantage,
			systemDamageNote,
			crewPbAttributionLabel,
			canShowCrewPbAttribution: Boolean(
				previewActor
					? canAttributeStarshipCrewActor(actor, previewActor, roller)
					: roller?.isGM === true || actor?.canUserModify?.(roller, "update") === true
			),
			showResponsibleCrewPicker: needsPicker,
			responsibleCrewCandidates: dialogSafeCandidates,
			preselectedResponsibleCrewUuid
		});
	if ( !dialogSelection ) return null;

	if ( forcedAdvantage ) dialogSelection.advantageMode = getProficiencyAdvantageMode();

	if ( needsPicker ) {
		selectedExplicitActor = resolveValidatedResponsibleCrewActor({
			starshipActor: actor,
			user: roller,
			actorUuid: dialogSelection.responsibleCrewUuid
		});
		if ( !selectedExplicitActor ) {
			const warnTitle = game.i18n.localize("SW5E.Starship.Roll.NoCrewPBTitle");
			const warnBody = game.i18n.localize("SW5E.Starship.Roll.NoCrewPBNotSelected");
			ui.notifications.warn(`${warnTitle}: ${warnBody}`);
			return null;
		}
	}

	const crewPbSource = resolveStarshipSkillCrewPbSource(actor, roller, {
		mode: "roll",
		explicitActor: selectedExplicitActor
	});
	const deployedRoller = crewPbSource.actor;
	if ( selectedExplicitActor && deployedRoller?.uuid !== selectedExplicitActor.uuid ) {
		const warnTitle = game.i18n.localize("SW5E.Starship.Roll.NoCrewPBTitle");
		const warnBody = game.i18n.localize("SW5E.Starship.Roll.NoCrewPBNotSelected");
		ui.notifications.warn(`${warnTitle}: ${warnBody}`);
		return null;
	}

	const rollerPb = toFiniteNumber(deployedRoller?.system?.attributes?.prof, 0) ?? 0;
	rollProficiencyPoints = deployedRoller
		? computeStarshipSkillCrewProficiencyPoints(entry.proficiencyMode, rollerPb)
		: 0;
	rollDataProficiency = deployedRoller ? rollerPb : 0;

	const selectedAbility = dialogSelection.ability in abilities ? dialogSelection.ability : entry.ability;
	const chosenAbility = abilities[selectedAbility] ?? { mod: entry.parts.abilityMod, bonuses: { check: "" } };
	const formula = buildStarshipSkillFormula(
		actor,
		entry,
		selectedAbility,
		chosenAbility,
		dialogSelection.bonus,
		{ rollProficiencyPoints, rollDataProficiency }
	);
	const roll = new CONFIG.Dice.D20Roll(formula, {}, {
		flavor: `${actor.name}: ${entry.label}`,
		advantageMode: dialogSelection.advantageMode,
		defaultRollMode,
		rollMode: dialogSelection.rollMode
	});

	const abilityLabel = CONFIG?.DND5E?.abilities?.[selectedAbility]?.label
		?? CONFIG?.SW5E?.abilities?.[selectedAbility]?.label
		?? entry.abilityLabel;
	const starshipCrewPbUi = qualifiesForStarshipSkillRollMessaging(actor);

	if ( starshipCrewPbUi && crewPbSource.source === "none" ) {
		const warnTitle = game.i18n.localize("SW5E.Starship.Roll.NoCrewPBTitle");
		const noCandidates = candidatePack.selectionMode === "none"
			|| (candidatePack.selectionMode === "automatic" && !deployedRoller);
		const warnBody = game.i18n.localize(
			noCandidates
				? "SW5E.Starship.Roll.NoCrewPBWarning"
				: "SW5E.Starship.Roll.NoCrewPBNotSelected"
		);
		ui.notifications.warn(`${warnTitle}: ${warnBody}`);
	}

	await roll.evaluate();

	const localizedAbilityLabel = abilityLabel
		? game.i18n.localize(abilityLabel)
		: abilityLabel;
	const finalAbilityLabel = localizedAbilityLabel && localizedAbilityLabel !== abilityLabel
		? localizedAbilityLabel
		: abilityLabel;
	const baseFlavor = game.i18n.format("SW5E.Starship.Roll.SkillCheckFlavor", {
		skill: entry.label,
		ability: finalAbilityLabel
	});
	const flavorSuffix = starshipCrewPbUi
		? buildStarshipSkillChatFlavorSuffix(crewPbSource, {
			rollerPb,
			proficiencyMode: entry.proficiencyMode,
			multiplier: proficiencyMultiplier,
			rollProficiencyPoints
		})
		: "";
	const chatFlavor = flavorSuffix ? `${baseFlavor} — ${flavorSuffix}` : baseFlavor;
	const systemDamageFlavor = isStarshipSystemDamageSkillCheckDisadvantageRoll(actor, dialogSelection.advantageMode)
		? systemDamageNote
		: "";
	const chatFlavorWithSystemDamage = systemDamageFlavor
		? `${chatFlavor} — ${systemDamageFlavor}`
		: chatFlavor;
	const tierMetadata = forcedAdvantage
		? createProficiencyTierChatFlag(masteryTier, {
			type: "skill",
			rollLabel: entry.label,
			subjectUuid: actor.uuid
		})
		: null;
	const messageFlavor = tierMetadata ? appendProficiencyTierFlavor(chatFlavorWithSystemDamage, tierMetadata) : chatFlavorWithSystemDamage;
	let finalFlavor = messageFlavor;
	if ( messageOptions.flavorPrefix ) {
		finalFlavor = `${messageOptions.flavorPrefix} — ${messageFlavor}`;
	}
	const dc = messageOptions.dc;
	if ( dc != null && Number.isFinite(dc) ) {
		const success = roll.total >= dc;
		const resultKey = success ? "DND5E.Success" : "DND5E.Failure";
		const resultLabel = game.i18n.localize(resultKey);
		finalFlavor = `${finalFlavor} (DC ${dc}: ${resultLabel})`;
	}
	const messageData = {
		speaker: ChatMessage.getSpeaker({ actor }),
		flavor: finalFlavor
	};
	if ( tierMetadata && isRerollProficiencyTier(masteryTier) ) {
		messageData.flags = { sw5e: { proficiencyTier: tierMetadata } };
	}

	// Local-only audit: selected crew identity must not enter public message metadata.
	if (
		deployedRoller
		&& deployedRoller.name !== actor.name
		&& !publicChatExcludesResponsibleCrewIdentity(messageData, {
			name: deployedRoller.name,
			uuid: deployedRoller.uuid
		})
	) {
		console.warn("SW5E MODULE | Responsible crew identity appears in public skill message metadata.");
	}

	await roll.toMessage(messageData);
	return { roll, total: roll.total, skillId, label: entry.label };
}

export const normalizeLegacyStarshipActorSource = normalizeLegacyStarshipActorData;
export const normalizeLegacyStarshipItemSource = normalizeLegacyStarshipItemData;
