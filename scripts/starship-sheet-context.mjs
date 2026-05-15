import {
	deriveStarshipPools,
	getDerivedStarshipRuntime,
	getLegacyStarshipActorSystem,
	getStarshipSkillDisplayEntries
} from "./starship-data.mjs";
import { buildVehicleStarshipCrewContext } from "./starship-character.mjs";

const STARSHIP_PACKS = new Set([
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

function toFiniteNumber(value, fallback = null) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function isRecord(value) {
	return !!value && (typeof value === "object") && !Array.isArray(value);
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

function getItemSourceId(item) {
	return item?.flags?.core?.sourceId
		?? item?._stats?.compendiumSource
		?? "";
}

function getPackHint(item) {
	const match = /^Compendium\.[^.]+\.([^.]+)\./.exec(getItemSourceId(item));
	return match?.[1] ?? null;
}

function getItemTypeValue(item) {
	return item?.system?.type?.value
		?? item?._source?.system?.type?.value
		?? item?.flags?.sw5e?.legacyStarshipMod?.type?.value
		?? item?.flags?.sw5e?.legacyDeployment?.type?.value
		?? "";
}

function getItemSubtype(item) {
	return item?.system?.type?.subtype
		?? item?._source?.system?.type?.subtype
		?? item?.flags?.sw5e?.legacyStarshipMod?.type?.subtype
		?? item?.flags?.sw5e?.legacyDeployment?.type?.subtype
		?? "";
}

function getItemIdentifier(item) {
	return item?.system?.identifier
		?? item?._source?.system?.identifier
		?? "";
}

function hasHullPointsAdvancement(item) {
	const advancement = item?.system?.advancement ?? item?._source?.system?.advancement;
	return Array.isArray(advancement) && advancement.some(entry => entry?.type === "HullPoints");
}

function isStarshipRelatedItem(item) {
	if ( !item ) return false;
	if ( item.type === "starshipsize" || item.type === "starshipmod" ) return true;
	if ( item?.flags?.sw5e?.legacyStarshipSize || item?.flags?.sw5e?.legacyStarshipMod || item?.flags?.sw5e?.legacyDeployment ) return true;
	const packHint = getPackHint(item);
	if ( packHint && STARSHIP_PACKS.has(packHint) ) return true;
	const typeValue = getItemTypeValue(item);
	return ["starship", "starshipAction", "deployment"].includes(typeValue);
}

function summarizeItem(item) {
	return {
		id: item?.id ?? item?._id ?? null,
		uuid: item?.uuid ?? null,
		name: item?.name ?? "",
		type: item?.type ?? "",
		typeValue: getItemTypeValue(item),
		subtype: getItemSubtype(item),
		identifier: getItemIdentifier(item),
		packHint: getPackHint(item),
		img: item?.img ?? item?._source?.img ?? ""
	};
}

function classifyItemSummary(item) {
	const summary = summarizeItem(item);
	const packHint = summary.packHint;
	if ( item?.flags?.sw5e?.legacyStarshipSize || item?.type === "starshipsize" || hasHullPointsAdvancement(item) ) return ["classifications", summary];
	if ( item?.flags?.sw5e?.legacyStarshipMod || item?.type === "starshipmod" || packHint === "starshipmodifications" ) return ["modifications", summary];
	if ( packHint === "starshipweapons" || item?.type === "weapon" ) return ["weapons", summary];
	if ( packHint === "starshipactions" || summary.typeValue === "starshipAction" ) return ["actions", summary];
	if ( packHint === "starshipequipment" || packHint === "starshiparmor" ) return ["equipment", summary];
	if ( packHint === "starshipfeatures" || packHint === "deployments" || packHint === "deploymentfeatures" || packHint === "ventures" || summary.type === "feat" ) {
		return ["features", summary];
	}
	if ( isStarshipRelatedItem(item) ) return ["unknownStarshipRelated", summary];
	return [null, summary];
}

function buildItemsSummary(actor) {
	const groups = {
		weapons: [],
		equipment: [],
		features: [],
		modifications: [],
		actions: [],
		classifications: [],
		unknownStarshipRelated: []
	};

	for ( const item of Array.from(actor?.items?.contents ?? []) ) {
		const [group, summary] = classifyItemSummary(item);
		if ( !group ) continue;
		groups[group].push(summary);
	}

	return {
		...groups,
		counts: Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, value.length]))
	};
}

function detectStarshipActor(actor) {
	if ( !actor || actor.type !== "vehicle" ) return { isStarship: false, source: null };
	if ( actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship" ) {
		return { isStarship: true, source: "legacyStarshipActor.type" };
	}
	if ( actor?.flags?.sw5e?.createStarship ) {
		return { isStarship: true, source: "flags.sw5e.createStarship" };
	}
	if ( Array.from(actor?.items?.contents ?? []).some(isStarshipRelatedItem) ) {
		return { isStarship: true, source: "embedded-starship-items" };
	}
	return { isStarship: false, source: null };
}

function buildIdentity(actor, legacySystem, pools, detectionSource) {
	const roleItem = Array.from(actor?.items?.contents ?? []).find(item => getItemSubtype(item) === "role");
	return {
		name: actor?.name ?? "",
		id: actor?.id ?? null,
		uuid: actor?.uuid ?? null,
		type: actor?.type ?? "",
		img: actor?.img ?? "",
		detectionSource,
		tier: toFiniteNumber(legacySystem?.details?.tier, pools?.tier ?? null),
		size: legacySystem?.traits?.size ?? actor?.system?.traits?.size ?? "",
		role: roleItem?.name ?? "",
		detailsType: legacySystem?.details?.type ?? actor?.system?.details?.type ?? ""
	};
}

function buildAbilities(actor, legacySystem) {
	const liveAbilities = actor?.system?.abilities ?? {};
	const legacyAbilities = legacySystem?.abilities ?? {};
	return Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map(key => {
		const live = liveAbilities[key] ?? {};
		const legacy = legacyAbilities[key] ?? {};
		const value = toFiniteNumber(live?.value, toFiniteNumber(legacy?.value, 10)) ?? 10;
		const mod = toFiniteNumber(live?.mod, Math.floor((value - 10) / 2)) ?? Math.floor((value - 10) / 2);
		return [key, {
			value,
			mod,
			source: live?.value !== undefined ? "actor.system.abilities" : "legacyStarshipActor.system.abilities"
		}];
	}));
}

function buildResources(actor, legacySystem, runtime, pools) {
	const liveAttributes = actor?.system?.attributes ?? {};
	const legacyAttributes = legacySystem?.attributes ?? {};
	return {
		ac: {
			flat: toFiniteNumber(liveAttributes?.ac?.flat, toFiniteNumber(legacyAttributes?.ac?.flat, null)),
			motionless: liveAttributes?.ac?.motionless ?? legacyAttributes?.ac?.motionless ?? ""
		},
		hp: {
			value: toFiniteNumber(liveAttributes?.hp?.value, toFiniteNumber(legacyAttributes?.hp?.value, null)),
			max: toFiniteNumber(liveAttributes?.hp?.max, toFiniteNumber(legacyAttributes?.hp?.max, null)),
			temp: toFiniteNumber(liveAttributes?.hp?.temp, toFiniteNumber(legacyAttributes?.hp?.temp, 0))
		},
		hull: pools?.hull ?? null,
		shields: pools?.shld ?? null,
		power: {
			pools: pools?.power ?? null,
			routing: runtime?.routing ?? null,
			legacy: isRecord(legacyAttributes?.power) ? {
				die: legacyAttributes.power.die ?? "",
				routing: legacyAttributes.power.routing ?? "none",
				central: legacyAttributes.power.central ?? {},
				engines: legacyAttributes.power.engines ?? {},
				shields: legacyAttributes.power.shields ?? {},
				weapons: legacyAttributes.power.weapons ?? {}
			} : null
		},
		fuel: legacyAttributes?.fuel ?? liveAttributes?.fuel ?? {},
		mods: pools?.mods ?? null,
		systemDamage: toFiniteNumber(legacyAttributes?.systemDamage, null)
	};
}

function buildMovement(actor, legacySystem, runtime) {
	const liveMovement = actor?.system?.attributes?.movement ?? {};
	return {
		tactical: {
			fly: toFiniteNumber(liveMovement?.fly, toFiniteNumber(runtime?.movement?.space, null)),
			turn: toFiniteNumber(runtime?.movement?.turn, toFiniteNumber(legacySystem?.attributes?.movement?.turn, null)),
			units: liveMovement?.units ?? runtime?.movement?.units ?? legacySystem?.attributes?.movement?.units ?? "ft",
			baseSpaceSpeed: toFiniteNumber(runtime?.movement?.baseSpaceSpeed, null),
			baseTurnSpeed: toFiniteNumber(runtime?.movement?.baseTurnSpeed, null),
			profileSource: runtime?.movement?.profileSource ?? null
		},
		travel: runtime?.travel ?? {
			pace: legacySystem?.attributes?.travel?.pace ?? "normal",
			stealthPace: legacySystem?.attributes?.travel?.stealthPace ?? "slow",
			hyperdriveClass: toFiniteNumber(legacySystem?.attributes?.travel?.hyperdriveClass, 0) ?? 0
		}
	};
}

function buildCrew(actor, legacySystem, options={}) {
	const deployment = legacySystem?.attributes?.deployment ?? {};
	const pilotUuid = deployment?.pilot?.value ?? deployment?.pilot ?? null;
	const activeUuid = deployment?.active?.value ?? deployment?.active ?? null;
	const crewUuids = getDeploymentUuidList(deployment?.crew);
	const passengerUuids = getDeploymentUuidList(deployment?.passenger);
	const pilotActor = resolveActorDocument(pilotUuid);
	const activeActor = resolveActorDocument(activeUuid);
	const roster = buildVehicleStarshipCrewContext(actor)?.roster ?? [];

	const user = options.user ?? globalThis.game?.user ?? null;
	const userCharacter = user?.character ?? null;
	const userCharacterUuid = userCharacter?.uuid ?? null;
	const userCharacterRecord = userCharacterUuid ? roster.find(entry => entry.uuid === userCharacterUuid) : null;

	return {
		pilot: {
			uuid: pilotUuid,
			name: pilotActor?.name ?? "",
			resolved: Boolean(pilotActor)
		},
		active: {
			uuid: activeUuid,
			name: activeActor?.name ?? "",
			resolved: Boolean(activeActor)
		},
		crew: crewUuids.map(uuid => {
			const entry = roster.find(record => record.uuid === uuid);
			return entry ?? {
				uuid,
				name: resolveActorDocument(uuid)?.name ?? "Unknown Crew",
				active: activeUuid === uuid,
				roles: ["crew"]
			};
		}),
		passengers: passengerUuids.map(uuid => {
			const entry = roster.find(record => record.uuid === uuid);
			return entry ?? {
				uuid,
				name: resolveActorDocument(uuid)?.name ?? "Unknown Passenger",
				active: activeUuid === uuid,
				roles: ["passenger"]
			};
		}),
		roster,
		counts: {
			crew: crewUuids.length,
			passengers: passengerUuids.length,
			roster: roster.length
		},
		userCharacter: user ? {
			userId: user.id ?? null,
			uuid: userCharacterUuid,
			name: userCharacter?.name ?? "",
			deployed: Boolean(userCharacterRecord),
			roles: userCharacterRecord?.roles ?? []
		} : null
	};
}

function buildSkills(actor, options={}) {
	const passiveCfg = globalThis.CONFIG?.DND5E?.skillPassive;
	const passiveBase = Number.isFinite(Number(passiveCfg?.base)) ? Number(passiveCfg.base) : 10;
	const entries = getStarshipSkillDisplayEntries(actor, options.user ?? globalThis.game?.user ?? null).map(entry => ({
		id: entry.id,
		label: entry.label,
		ability: entry.ability,
		abilityLabel: entry.abilityLabel,
		proficiencyMode: entry.proficiencyMode,
		hover: entry.hover,
		total: entry.total,
		displayMod: entry.effectiveTotal,
		passive: passiveBase + (toFiniteNumber(entry.effectiveTotal, 0) ?? 0),
		tierZero: !entry.proficiencyMode,
		crewPbSource: entry.effectiveCrewPbSource ?? null,
		crewPbLine: entry.effectiveCrewPbLine ?? "",
		parts: {
			abilityMod: entry.parts?.abilityMod ?? 0,
			proficiency: entry.displayParts?.proficiency ?? entry.parts?.proficiency ?? 0,
			bonus: entry.parts?.bonus ?? 0
		}
	}));

	return {
		entries,
		byId: Object.fromEntries(entries.map(entry => [entry.id, entry])),
		zeroTierSkillIds: entries.filter(entry => entry.tierZero).map(entry => entry.id)
	};
}

function pushWarning(warnings, warning) {
	warnings.push(warning);
}

function buildWarnings(actor, legacySystem, crew, skills) {
	const warnings = [];
	const deployment = legacySystem?.attributes?.deployment ?? {};
	const pilotUuid = deployment?.pilot?.value ?? deployment?.pilot ?? null;
	const activeUuid = deployment?.active?.value ?? deployment?.active ?? null;

	if ( !actor?.flags?.sw5e?.legacyStarshipActor ) {
		pushWarning(warnings, {
			code: "missing-legacy-starship-flag",
			severity: "info",
			message: "Starship is using vehicle data without a legacyStarshipActor flag snapshot."
		});
	}

	if ( pilotUuid && !crew.pilot.resolved ) {
		pushWarning(warnings, {
			code: "missing-pilot-actor",
			severity: "warning",
			message: "Pilot UUID is set but does not currently resolve to an actor."
		});
	}

	if ( activeUuid && !crew.active.resolved ) {
		pushWarning(warnings, {
			code: "missing-active-actor",
			severity: "warning",
			message: "Active crew UUID is set but does not currently resolve to an actor."
		});
	}

	if ( activeUuid && ![crew.pilot.uuid, ...crew.crew.map(entry => entry.uuid), ...crew.passengers.map(entry => entry.uuid)].filter(Boolean).includes(activeUuid) ) {
		pushWarning(warnings, {
			code: "active-not-on-roster",
			severity: "warning",
			message: "Active crew UUID is not present on the current pilot/crew/passenger roster."
		});
	}

	if ( skills.zeroTierSkillIds.length ) {
		pushWarning(warnings, {
			code: "zero-tier-skills-present",
			severity: "info",
			message: "One or more starship skills currently have proficiency tier 0.",
			detail: { skillIds: skills.zeroTierSkillIds }
		});
	}

	return warnings;
}

function buildDiagnostics(actor, legacySystem, runtime, items, warnings, detectionSource) {
	return {
		detectionSource,
		legacyFlagPresent: Boolean(actor?.flags?.sw5e?.legacyStarshipActor),
		legacyType: actor?.flags?.sw5e?.legacyStarshipActor?.type ?? null,
		usedLegacySystem: Boolean(legacySystem && isRecord(legacySystem)),
		itemCounts: items.counts,
		warningCount: warnings.length,
		routingSelection: runtime?.routing?.selected ?? legacySystem?.attributes?.power?.routing ?? "none"
	};
}

/**
 * Read-only normalized starship context for future SW5e Starship Sheet v2 work.
 * Does not mutate actors, flags, items, or migrations; returns `null` for non-starship actors.
 * @param {Actor} actor
 * @param {{ user?: User | null }} [options]
 * @returns {object|null}
 */
export function getStarshipSheetContext(actor, options = {}) {
	const detection = detectStarshipActor(actor);
	if ( !detection.isStarship ) return null;

	const legacySystem = getLegacyStarshipActorSystem(actor) ?? {};
	const runtime = getDerivedStarshipRuntime(actor) ?? {};
	const pools = deriveStarshipPools(actor) ?? {};
	const crew = buildCrew(actor, legacySystem, options);
	const skills = buildSkills(actor, options);
	const items = buildItemsSummary(actor);
	const warnings = buildWarnings(actor, legacySystem, crew, skills);

	return {
		isStarship: true,
		actor,
		identity: buildIdentity(actor, legacySystem, pools, detection.source),
		legacy: {
			present: Boolean(actor?.flags?.sw5e?.legacyStarshipActor),
			type: actor?.flags?.sw5e?.legacyStarshipActor?.type ?? null,
			usedSystemMerge: true
		},
		abilities: buildAbilities(actor, legacySystem),
		resources: buildResources(actor, legacySystem, runtime, pools),
		movement: buildMovement(actor, legacySystem, runtime),
		crew,
		skills,
		items,
		warnings,
		diagnostics: buildDiagnostics(actor, legacySystem, runtime, items, warnings, detection.source)
	};
}
