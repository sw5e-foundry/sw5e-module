import { getBaseCurrencyKey, normalizeSwPriceDenomination } from "./currencies.mjs";

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
const STARSHIP_TRAVEL_PACES = new Set(["slow", "normal", "fast"]);

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

function localizeWithFallback(key, fallback) {
	const localized = game?.i18n?.localize?.(key);
	return localized && localized !== key ? localized : fallback;
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
	const sourceId = item?.flags?.core?.sourceId;
	const match = /^Compendium\.[^.]+\.([^.]+)\./.exec(sourceId ?? "");
	return match?.[1] ?? null;
}

function getStarshipCharacterFlag(subject) {
	return subject?.flags?.sw5e?.[STARSHIP_CHARACTER_FLAG] ?? null;
}

function isCharacterBackedStarship(data) {
	return data?.type === "character" && getStarshipCharacterFlag(data)?.enabled;
}

function getLegacyStarshipSize(items = []) {
	return items.find(item => item.type === "starshipsize")
		?? items.find(item => item.flags?.sw5e?.legacyStarshipSize)
		?? items.find(item => item.flags?.sw5e?.[STARSHIP_CHARACTER_FLAG]?.role === "classification")
		// New-format: feat item with HullPoints advancement (identifier-based, no legacy flag)
		?? items.find(item => item.type === "feat" && item.system?.advancement?.some?.(a => a.type === "HullPoints"));
}

function getLegacySizeSystem(item) {
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

function normalizeTravelPace(value, fallback = "normal") {
	const normalized = String(value ?? "").trim().toLowerCase();
	return STARSHIP_TRAVEL_PACES.has(normalized) ? normalized : fallback;
}

function getItemDescriptionText(item) {
	const system = getLegacyItemSystem(item);
	return stripHtml(system?.description?.value ?? system?.description ?? "");
}

function getItemSpeedProfile(item) {
	const speed = getLegacyItemSystem(item)?.attributes?.speed ?? item?.system?.attributes?.speed ?? {};
	const space = toFiniteNumber(speed?.space, null);
	const turn = toFiniteNumber(speed?.turn, null);
	if ( space === null && turn === null ) return null;
	return { space, turn };
}

function isRoleSpeedProfileItem(item) {
	if ( !item ) return false;
	const subtype = item.system?.type?.subtype ?? getLegacyItemSystem(item)?.type?.subtype ?? "";
	return subtype === "role";
}

function getMovementProfile(items = [], sizeSystem = {}) {
	const roleItem = items.find(item => isRoleSpeedProfileItem(item) && getItemSpeedProfile(item));
	if ( roleItem ) {
		const speed = getItemSpeedProfile(roleItem);
		return {
			space: speed?.space ?? toFiniteNumber(sizeSystem?.baseSpaceSpeed, null),
			turn: speed?.turn ?? toFiniteNumber(sizeSystem?.baseTurnSpeed, null),
			source: roleItem.name ?? "Role Profile"
		};
	}

	return {
		space: toFiniteNumber(sizeSystem?.baseSpaceSpeed, null),
		turn: toFiniteNumber(sizeSystem?.baseTurnSpeed, null),
		source: null
	};
}

function getRoutingMultiplier(selected, zone) {
	if ( selected === zone ) return 2;
	if ( !selected || selected === "none" ) return 1;
	return 0.5;
}

function getPowerRoutingState(legacySystem = {}) {
	const selected = legacySystem.attributes?.power?.routing ?? "none";
	return {
		selected,
		enginesMultiplier: getRoutingMultiplier(selected, "engines"),
		weaponsMultiplier: getRoutingMultiplier(selected, "weapons"),
		shieldsMultiplier: getRoutingMultiplier(selected, "shields")
	};
}

function getDeploymentUuidList(value) {
	if ( Array.isArray(value?.items) ) return value.items.filter(Boolean);
	if ( Array.isArray(value?.value) ) return value.value.filter(Boolean);
	if ( Array.isArray(value) ) return value.filter(Boolean);
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
	const activeUuid = deployment.active?.value ?? deployment.active ?? null;
	const crewUuids = getDeploymentUuidList(deployment.crew);
	const passengerUuids = getDeploymentUuidList(deployment.passenger);
	const pilotActor = resolveActorDocument(pilotUuid);
	const activeActor = resolveActorDocument(activeUuid);
	const deployedActors = Array.from(new Set([pilotUuid, activeUuid, ...crewUuids, ...passengerUuids]))
		.map(resolveActorDocument)
		.filter(Boolean);

	const canStealthAtNormalPace = deployedActors.some(crewActor => {
		return Array.from(crewActor?.items ?? []).some(item => /move stealthily at a normal pace/i.test(getItemDescriptionText(item)));
	});

	return {
		pilotAssigned: Boolean(pilotUuid),
		pilotName: pilotActor?.name ?? "",
		activeCrewName: activeActor?.name ?? "",
		crewCount: crewUuids.length,
		passengerCount: passengerUuids.length,
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

function makeAbilityRoll(roll = {}) {
	return {
		min: toFiniteNumber(roll?.min),
		max: toFiniteNumber(roll?.max),
		mode: toFiniteNumber(roll?.mode, 0) ?? 0
	};
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
	for ( const zone of STARSHIP_POWER_ZONES ) {
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
	const derivedMovement = deriveStarshipMovementData({
		legacySystem: runtimeSystem,
		items,
		liveAbilities: runtimeSystem.abilities ?? {},
		liveMovement: runtimeSystem.attributes?.movement ?? {},
		sizeSystem,
		routingState: routing
	});
	const derivedTravel = deriveStarshipTravelData({ legacySystem: runtimeSystem, items });
	applyDerivedStarshipMovement(runtimeSystem, derivedMovement);
	applyDerivedStarshipTravel(runtimeSystem, derivedTravel);
	const acFlat = toFiniteNumber(runtimeSystem.attributes?.ac?.flat, 10) ?? 10;

	const system = cloneData(runtimeSystem) ?? {};
	// Remove legacy vehicleType — dnd5e migrates it to details.type, which would overwrite our "space" value.
	delete system.vehicleType;
	system.attributes = mergeStarshipSystemData(runtimeSystem.attributes, {
		ac: {
			calc: "flat",
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
			fly: derivedMovement.space,
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

	return true;
}

export function createBlankLegacyStarshipActorData(data = {}) {
	const source = cloneData(data) ?? {};
	source.type = "vehicle";
	source.items = Array.isArray(source.items) ? source.items : [];
	source.system = cloneData(source.system ?? {});

	const flags = ensureSw5eFlags(source);
	delete flags.createStarship;
	flags.legacyStarshipActor = {
		type: "starship",
		system: cloneData(flags.legacyStarshipActor?.system ?? source.system ?? {})
	};

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

function isStarshipFlagVehicle(actor) {
	return actor?.type === "vehicle" && actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

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
		const flagRouting = flagSystem.attributes?.power?.routing;
		if ( flagRouting !== undefined && flagRouting !== null && flagRouting !== "" ) {
			merged.attributes ??= {};
			merged.attributes.power ??= {};
			merged.attributes.power.routing = flagRouting;
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

export function deriveStarshipMovementData({
	legacySystem = {},
	items = [],
	liveAbilities = {},
	liveMovement = {},
	sizeSystem = null,
	routingState = null
} = {}) {
	const resolvedSizeSystem = sizeSystem ?? getLegacySizeSystem(getLegacyStarshipSize(items));
	const movementProfile = getMovementProfile(items, resolvedSizeSystem);
	const legacyMovement = legacySystem.attributes?.movement ?? {};
	const legacyAbilities = legacySystem.abilities ?? {};
	const routing = routingState ?? getPowerRoutingState(legacySystem);
	const baseSpaceSpeed = getMovementBaseValue(movementProfile.space);
	const baseTurnSpeed = getMovementBaseValue(movementProfile.turn);
	const fallbackSpace = getMovementBaseValue(legacyMovement.space)
		?? getMovementBaseValue(liveMovement.fly)
		?? 0;
	const fallbackTurn = getMovementBaseValue(legacyMovement.turn)
		?? fallbackSpace;
	const strengthMod = getAbilityModifier(liveAbilities, legacyAbilities, "str");
	const dexterityMod = getAbilityModifier(liveAbilities, legacyAbilities, "dex");
	const constitutionMod = getAbilityModifier(liveAbilities, legacyAbilities, "con");

	let space = baseSpaceSpeed ?? fallbackSpace;
	if ( baseSpaceSpeed !== null ) {
		space = Math.max(50, baseSpaceSpeed + (50 * (strengthMod - constitutionMod)));
	}

	let turn = baseTurnSpeed ?? fallbackTurn;
	if ( baseTurnSpeed !== null ) {
		turn = Math.max(50, baseTurnSpeed - (50 * (dexterityMod - constitutionMod)));
	}

	if ( routing.enginesMultiplier !== 1 ) {
		space = Math.max(50, Math.floor((toFiniteNumber(space, fallbackSpace) ?? fallbackSpace) * routing.enginesMultiplier));
	}

	if ( Number.isFinite(space) && Number.isFinite(turn) && (turn > space) ) turn = space;
	return {
		space: toFiniteNumber(space, fallbackSpace) ?? fallbackSpace,
		turn: toFiniteNumber(turn, fallbackTurn) ?? fallbackTurn,
		units: liveMovement.units ?? legacyMovement.units ?? "ft",
		baseSpaceSpeed,
		baseTurnSpeed,
		profileSource: movementProfile.source,
		enginesMultiplier: routing.enginesMultiplier
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

export function getDerivedStarshipRuntime(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const items = actor?.items?.contents ?? actor?._source?.items ?? [];
	const routing = getPowerRoutingState(legacySystem);
	const crew = getStarshipCrewState(actor, legacySystem);
	const movement = deriveStarshipMovementData({
		legacySystem,
		items,
		liveAbilities: actor?.system?.abilities ?? {},
		liveMovement: actor?.system?.attributes?.movement ?? {},
		routingState: routing
	});
	const travel = deriveStarshipTravelData({ legacySystem, items, crewState: crew });
	return { movement, travel, crew, routing };
}

export function getDerivedStarshipMovement(actor) {
	return getDerivedStarshipRuntime(actor).movement;
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

export function deriveStarshipPools(actor) {
	const liveItems = actor?.items?.contents ?? [];
	const sourceItems = actor?._source?.items ?? [];
	// For mods/equipment (standard dnd5e types), live items have accessible system data.
	const items = liveItems.length ? liveItems : sourceItems;

	// Size item system: live items of unknown type (e.g. "starshipsize") run through DataModel
	// which discards custom fields. actor._source.items are plain objects where item.system
	// always contains all stored fields. Prefer flag data (post-migration), then raw source system.
	const liveSizeItem = getLegacyStarshipSize(liveItems);
	const sourceSizeItem = getLegacyStarshipSize(sourceItems)
		?? (liveSizeItem ? sourceItems.find(i => i._id === liveSizeItem.id) : null);
	let sizeSystem = liveSizeItem?.flags?.sw5e?.legacyStarshipSize  // post-migration
		?? sourceSizeItem?.system                                        // pre-migration (raw plain object)
		?? getLegacySizeSystem(liveSizeItem)                             // character-backed fallback
		?? {};

	// New-format size items (feat + HullPoints advancement, identifier-based) lack custom system fields.
	// Fall back to the static size profile keyed by identifier or actor traits.size.
	if ( !sizeSystem.hullDice ) {
		const identifier = liveSizeItem?.system?.identifier ?? sourceSizeItem?.system?.identifier ?? "";
		const actorSize = actor?.system?.traits?.size ?? "";
		const profile = STARSHIP_SIZE_PROFILES[identifier] ?? STARSHIP_SIZE_PROFILES[ACTOR_SIZE_TO_IDENTIFIER[actorSize]];
		if ( profile ) sizeSystem = { ...sizeSystem, ...profile };
	}

	// Tier: try size system, then stored legacy actor system, then HullPoints advancement max key.
	const legacyActorSystem = getLegacyStarshipActorSystem(actor) ?? {};
	let tier = toFiniteNumber(sizeSystem.tier ?? legacyActorSystem.details?.tier, null);
	if ( tier === null ) {
		const hullAdv = liveSizeItem?.system?.advancement?.find?.(a => a.type === "HullPoints");
		const advKeys = hullAdv?.value ? Object.keys(hullAdv.value).map(Number).filter(Number.isFinite) : [];
		tier = advKeys.length ? Math.max(0, ...advKeys) : 0;
	}

	// Hull dice pool
	const hullDie = sizeSystem.hullDice ?? "";
	const hullDiceStart = toFiniteNumber(sizeSystem.hullDiceStart, 0);
	const hullDiceUsed = toFiniteNumber(sizeSystem.hullDiceUsed, 0);
	const hullDiceMax = hullDiceStart + (2 * tier);

	// Shield dice pool
	const shldDie = sizeSystem.shldDice ?? "";
	const shldDiceStart = toFiniteNumber(sizeSystem.shldDiceStart, 0);
	const shldDiceUsed = toFiniteNumber(sizeSystem.shldDiceUsed, 0);
	const shldDiceMax = shldDiceStart + (2 * tier);

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
	const suiteMax = Math.max(0,
		toFiniteNumber(sizeSystem.modMaxSuitesBase, 0)
		+ toFiniteNumber(sizeSystem.modMaxSuitesMult, 0) * conMod
	);
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

function getProficiencyLevels() {
	return CONFIG?.DND5E?.proficiencyLevels ?? CONFIG?.SW5E?.proficiencyLevels ?? {};
}

function getStarshipSkillsConfig() {
	return CONFIG?.DND5E?.starshipSkills ?? CONFIG?.SW5E?.starshipSkills ?? {};
}

function getSkillBonus(skill = {}) {
	return toFiniteNumber(skill?.bonuses?.check, 0) ?? 0;
}

/**
 * dnd5e 5.2 `CONFIG.DND5E.proficiencyLevels` is localized label strings (0, 0.5, 1, 2) with no `.mult`.
 * SW5E adds Wretched Hives starship tiers 3–5 the same way. Starship skills store the tier number in
 * `skill.value`; that number is the proficiency multiplier applied to the ship’s proficiency bonus.
 */
function getStarshipSkillProficiencyMultiplier(proficiencyMode) {
	const levels = getProficiencyLevels();
	const entry = levels?.[proficiencyMode];
	if ( isRecord(entry) && Number.isFinite(Number(entry.mult)) ) return Number(entry.mult);
	const n = toFiniteNumber(proficiencyMode, NaN);
	if ( !Number.isFinite(n) || n < 0 || n > 5 ) return 0;
	return n;
}

function resolveStarshipSkillAbility(skill, config) {
	const abilityKeys = Object.keys(CONFIG?.DND5E?.abilities ?? CONFIG?.SW5E?.abilities ?? {});
	const fromSkill = typeof skill?.ability === "string" ? skill.ability.trim() : "";
	if ( fromSkill && abilityKeys.includes(fromSkill) ) return fromSkill;
	const fromConfig = typeof config?.ability === "string" ? config.ability.trim() : "";
	if ( fromConfig && abilityKeys.includes(fromConfig) ) return fromConfig;
	return abilityKeys.includes("int") ? "int" : (abilityKeys[0] ?? "int");
}

function proficiencyLevelHoverLabel(mode) {
	const levels = getProficiencyLevels();
	const entry = levels?.[mode];
	if ( typeof entry === "string" ) {
		const loc = globalThis.game?.i18n?.localize?.(entry);
		return loc && loc !== entry ? loc : entry;
	}
	if ( isRecord(entry) && entry.label ) {
		const lab = entry.label;
		const loc = globalThis.game?.i18n?.localize?.(lab);
		return loc && loc !== lab ? loc : String(lab ?? "");
	}
	return "";
}

function getStarshipActorProficiencyBonus(actor, legacySystem) {
	return toFiniteNumber(
		actor?.system?.attributes?.prof,
		toFiniteNumber(legacySystem?.attributes?.prof, 0)
	) ?? 0;
}

/** UUIDs assigned to this starship’s deployment (pilot, active station, crew, passenger). */
function collectStarshipDeploymentUuids(starshipActor) {
	const legacy = getLegacyStarshipActorSystem(starshipActor);
	const deployment = legacy.attributes?.deployment ?? {};
	const pilot = deployment.pilot?.value ?? deployment.pilot ?? null;
	const active = deployment.active?.value ?? deployment.active ?? null;
	const crew = getDeploymentUuidList(deployment.crew);
	const passenger = getDeploymentUuidList(deployment.passenger);
	return new Set([pilot, active, ...crew, ...passenger].filter(Boolean));
}

/**
 * Pilot + crew + passenger UUIDs only (excludes the `active` station pointer).
 * Used to require active/pilot fallbacks to reference actors who are actually on the deployed roster.
 * Phase 1 — see `ai/rules-research/starships/starship-crew-pb-source-design.md`.
 */
function collectStarshipDeploymentRosterCoreUuids(starshipActor) {
	const legacy = getLegacyStarshipActorSystem(starshipActor);
	const deployment = legacy.attributes?.deployment ?? {};
	const pilot = deployment.pilot?.value ?? deployment.pilot ?? null;
	const crew = getDeploymentUuidList(deployment.crew);
	const passenger = getDeploymentUuidList(deployment.passenger);
	return new Set([pilot, ...crew, ...passenger].filter(Boolean));
}

function normalizeDeploymentActorUuid(raw) {
	if ( raw === undefined || raw === null || raw === "" ) return null;
	if ( typeof raw === "string" ) return raw;
	return String(raw);
}

/**
 * Ship-centric crew proficiency source for starship skills (Phase 1).
 * Order: rolling user’s assigned character if deployed → active station (if on core roster) → pilot (if on core roster) → none.
 * Read-only; does not mutate deployment. Avoids importing `starship-character.mjs` (no circular dependency).
 * @param {Actor} starshipActor
 * @param {User} rollingUser
 * @returns {{ actor: Actor|null, source: "assigned"|"active"|"pilot"|"none", name: string, reasonKey?: string }}
 */
function resolveStarshipSkillCrewPbSource(starshipActor, rollingUser) {
	const deploymentMembers = collectStarshipDeploymentUuids(starshipActor);
	const coreRoster = collectStarshipDeploymentRosterCoreUuids(starshipActor);

	const char = rollingUser?.character;
	if ( char?.documentName === "Actor" && char.uuid && deploymentMembers.has(char.uuid) ) {
		return {
			actor: char,
			source: "assigned",
			name: char.name ?? ""
		};
	}

	const legacy = getLegacyStarshipActorSystem(starshipActor);
	const deployment = legacy.attributes?.deployment ?? {};

	const activeUuid = normalizeDeploymentActorUuid(deployment.active?.value ?? deployment.active ?? null);
	if ( activeUuid && coreRoster.has(activeUuid) ) {
		const activeActor = resolveActorDocument(activeUuid);
		if ( activeActor ) {
			return {
				actor: activeActor,
				source: "active",
				name: activeActor.name ?? ""
			};
		}
	}

	const pilotUuid = normalizeDeploymentActorUuid(deployment.pilot?.value ?? deployment.pilot ?? null);
	if ( pilotUuid && coreRoster.has(pilotUuid) ) {
		const pilotActor = resolveActorDocument(pilotUuid);
		if ( pilotActor ) {
			return {
				actor: pilotActor,
				source: "pilot",
				name: pilotActor.name ?? ""
			};
		}
	}

	return {
		actor: null,
		source: "none",
		name: "",
		reasonKey: "SW5E.Starship.Roll.CrewPBSourceNoneReason"
	};
}

/**
 * Localized chat line describing which crew actor supplied PB (or why none).
 * @param {{ actor: Actor|null, source: string, name?: string, reasonKey?: string }} pbSource
 * @returns {string}
 */
function buildStarshipSkillCrewPbChatLine(pbSource) {
	if ( !pbSource || pbSource.source === "none" ) {
		const reasonKey = pbSource?.reasonKey ?? "SW5E.Starship.Roll.CrewPBSourceNoneReason";
		const reason = game.i18n.localize(reasonKey);
		return game.i18n.format("SW5E.Starship.Roll.CrewPBSourceNone", { reason });
	}

	const name = pbSource.name ?? pbSource.actor?.name ?? "";
	if ( pbSource.source === "assigned" ) {
		return game.i18n.format("SW5E.Starship.Roll.CrewPBSourceAssigned", { name });
	}
	if ( pbSource.source === "active" ) {
		return game.i18n.format("SW5E.Starship.Roll.CrewPBSourceActive", { name });
	}
	if ( pbSource.source === "pilot" ) {
		return game.i18n.format("SW5E.Starship.Roll.CrewPBSourcePilot", { name });
	}
	return game.i18n.format("SW5E.Starship.Roll.CrewPBSourceNone", {
		reason: game.i18n.localize("SW5E.Starship.Roll.CrewPBSourceNoneReason")
	});
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

/** Prepared skill rows for the sheet sidebar; proficiency uses the merged vehicle `attributes.prof` × tier (often 0). Rolls resolve crew PB ship-centrically — see {@link rollStarshipSkill}. */
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
			label: config.label ?? key,
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

function getStarshipAdvantageMode(event) {
	const advantageModes = CONFIG?.Dice?.D20Roll?.ADV_MODE ?? {};
	const normal = advantageModes.NORMAL ?? 0;
	const advantage = advantageModes.ADVANTAGE ?? 1;
	const disadvantage = advantageModes.DISADVANTAGE ?? -1;

	if ( event?.altKey ) return advantage;
	if ( event?.ctrlKey || event?.metaKey ) return disadvantage;
	return normal;
}

function isStarshipFastForward(event) {
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
	const formula = buildRollFormula([
		normalizeFormulaTerm(entry.mod, rollData),
		normalizeFormulaTerm(bonus, rollData)
	]);
	return { formula, rollData };
}

async function executeStarshipAbilityRoll(actor, abilityId, mode, event) {
	const entry = getStarshipAbilityRollEntry(actor, abilityId);
	if ( !entry ) return null;

	const { formula, rollData } = buildStarshipAbilityRollFormula(actor, abilityId, entry, mode);
	const defaultRollMode = game.settings.get("core", "rollMode");
	const rollLabel = mode === "save"
		? localizeWithFallback("SW5E.ActionSave", "Saving Throw")
		: localizeWithFallback("SW5E.ActionAbil", "Ability Check");
	const roll = new CONFIG.Dice.D20Roll(formula, rollData, {
		flavor: `${actor.name}: ${entry.label} ${rollLabel}`,
		advantageMode: getStarshipAdvantageMode(event),
		defaultRollMode,
		rollMode: defaultRollMode
	});

	await roll.evaluate();
	await roll.toMessage({
		speaker: ChatMessage.getSpeaker({ actor }),
		flavor: `${entry.label} (${rollLabel})`
	});
	return roll;
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
	if ( selection === "save" ) return executeStarshipAbilityRoll(actor, abilityId, "save", event);
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
 * @param {User} [rollingUser] User performing the roll (defaults to `game.user`). Crew PB is resolved ship-centrically inside `rollStarshipSkill` (assigned+deployed, then active, then pilot — see `starship-crew-pb-source-design.md`).
 */
export async function rollStarshipSkill(actor, skillId, event, rollingUser) {
	const entry = getStarshipSkillEntries(actor).find(skill => skill.id === skillId);
	if ( !entry ) return null;

	const roller = rollingUser ?? game.user;
	const crewPbSource = resolveStarshipSkillCrewPbSource(actor, roller);
	const deployedRoller = crewPbSource.actor;
	const rollerPb = toFiniteNumber(deployedRoller?.system?.attributes?.prof, 0) ?? 0;
	const rollProficiencyPoints = deployedRoller
		? Math.round(rollerPb * getStarshipSkillProficiencyMultiplier(entry.proficiencyMode))
		: 0;
	const rollDataProficiency = deployedRoller ? rollerPb : 0;
	const dialogEntry = {
		...entry,
		parts: {
			...entry.parts,
			proficiency: rollProficiencyPoints
		},
		total: entry.parts.abilityMod + rollProficiencyPoints + entry.parts.bonus
	};

	const fastForward = isStarshipFastForward(event);
	const defaultRollMode = game.settings.get("core", "rollMode");
	const abilities = buildStarshipRollAbilities(actor);
	const dialogSelection = fastForward
		? {
			ability: entry.ability,
			bonus: "",
			rollMode: defaultRollMode,
			advantageMode: getStarshipAdvantageMode(event)
		}
		: await (await import("./starship-skill-roll-config.mjs")).promptStarshipSkillRoll({
			actor,
			entry: dialogEntry,
			abilities,
			defaultRollMode,
			initialMode: getStarshipAdvantageMode(event)
		});
	if ( !dialogSelection ) return null;

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
		const warnBody = game.i18n.localize("SW5E.Starship.Roll.NoCrewPBWarning");
		ui.notifications.warn(`${warnTitle}: ${warnBody}`);
	}

	await roll.evaluate();

	const chatFlavor = starshipCrewPbUi
		? `${entry.label} (${abilityLabel}) — ${buildStarshipSkillCrewPbChatLine(crewPbSource)}`
		: `${entry.label} (${abilityLabel})`;

	await roll.toMessage({
		speaker: ChatMessage.getSpeaker({ actor }),
		flavor: chatFlavor
	});
	return roll;
}

export const normalizeLegacyStarshipActorSource = normalizeLegacyStarshipActorData;
export const normalizeLegacyStarshipItemSource = normalizeLegacyStarshipItemData;
