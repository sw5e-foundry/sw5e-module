import { getBestAbility } from "./../utils.mjs";
import {
  getModulePath,
  isModuleType,
  SETTINGS_NAMESPACE,
} from "../module-support.mjs";
import { openPowerPointConfig } from "../power-point-config.mjs";
import { getPowerDcBonus, patchPowerBonuses } from "./power-bonuses.mjs";

const PRECALCULATED_SPELLCASTING_KEY = "sw5e-preCalculatedSpellcastingClasses";

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

function formatSuperiorityPool(superiority) {
	const dice = superiority?.dice ?? {};
	const current = Number.isFinite(Number(dice.value)) ? Number(dice.value) : 0;
	const max = Number.isFinite(Number(dice.max)) ? Number(dice.max) : 0;
	const die = Number.isFinite(Number(superiority?.die)) ? Number(superiority.die) : 0;
	if ( !max || !die ) return null;
	return `${current}/${max}d${die}`;
}

function getPreparedPowercastingCards(actor) {
	const abilities = actor?.system?.abilities ?? {};
	const powercasting = actor?.system?.powercasting ?? {};
	const superiority = actor?.system?.superiority ?? {};
	const superiorityPool = formatSuperiorityPool(superiority);

	const makeAbilityAttack = ability => {
		const attack = abilities?.[ability]?.attack;
		if ( !Number.isFinite(Number(attack)) ) return "-";
		return attack >= 0 ? `+${attack}` : `${attack}`;
	};

	return {
		force: [
			{
				name: "Forcecasting (Light)",
				attr: powercasting.force?.schools?.lgt?.attr ?? "wis",
				save: powercasting.force?.schools?.lgt?.dc ?? null
			},
			{
				name: "Forcecasting (Dark)",
				attr: powercasting.force?.schools?.drk?.attr ?? "cha",
				save: powercasting.force?.schools?.drk?.dc ?? null
			},
			{
				name: "Forcecasting (Neutral)",
				attr: powercasting.force?.schools?.uni?.attr ?? getBestAbility(actor, ["wis", "cha"], 0)?.id ?? "wis",
				save: powercasting.force?.schools?.uni?.dc ?? null
			}
		].map(card => ({
			...card,
			attack: makeAbilityAttack(card.attr)
		})),
		superiority: [
			{
				name: "Superiority (Mental)",
				attr: superiority.types?.mental?.attr ?? getBestAbility(actor, CONFIG.DND5E.superiority.types.mental.attr, 0)?.id ?? "int",
				save: superiority.types?.mental?.dc ?? null,
				resource: superiorityPool
			},
			{
				name: "Superiority (Physical)",
				attr: superiority.types?.physical?.attr ?? getBestAbility(actor, CONFIG.DND5E.superiority.types.physical.attr, 0)?.id ?? "str",
				save: superiority.types?.physical?.dc ?? null,
				resource: superiorityPool
			},
			{
				name: "Superiority (General)",
				attr: superiority.types?.general?.attr ?? getBestAbility(actor, CONFIG.DND5E.superiority.types.general.attr, 0)?.id ?? "int",
				save: superiority.types?.general?.dc ?? null,
				resource: superiorityPool
			}
		].map(card => ({
			...card,
			attack: makeAbilityAttack(card.attr)
		})),
		tech: {
			name: "Techcasting",
			attr: powercasting.tech?.schools?.tec?.attr ?? "int",
			save: powercasting.tech?.schools?.tec?.dc ?? null,
			attack: makeAbilityAttack(powercasting.tech?.schools?.tec?.attr ?? "int")
		}
	};
}

function getPowercastingTypeFromItem(item) {
	return item?.system?.school === "tec" ? "tech" : "force";
}

function getPowerPointCost(item, activity, castLevel) {
	const powercastingType = getPowercastingTypeFromItem(item);
	const targetPath = `powercasting.${powercastingType}.points.value`;
	const activityTarget = activity?.consumption?.targets?.find(target =>
		target?.type === "attribute" && target?.target === targetPath
	);
	const baseCostValue = activityTarget?.value ?? item?.system?.consume?.amount ?? 0;
	const baseCost = Number.isFinite(Number(baseCostValue)) ? Number(baseCostValue) : 0;
	const itemLevel = Number.isFinite(Number(item?.system?.level)) ? Number(item.system.level) : 0;
	const selectedLevel = Number.isFinite(Number(castLevel)) ? Number(castLevel) : itemLevel;
	return baseCost + Math.max(0, selectedLevel - itemLevel);
}

function isSw5ePowerData(itemData) {
	if ( itemData?.type !== "spell" ) return false;
	const school = itemData?.system?.school;
	if ( school && Object.values(CONFIG.DND5E.powerCasting).some(castType => school in (castType?.schools ?? {})) ) return true;

	const consumeTarget = itemData?.system?.consume?.target;
	if ( typeof consumeTarget === "string" && /^powercasting\.(force|tech)\.points\.value$/.test(consumeTarget) ) return true;

	const activityTargets = Object.values(itemData?.system?.activities ?? {}).flatMap(activity => activity?.consumption?.targets ?? []);
	return activityTargets.some(target =>
		target?.type === "attribute" && /^powercasting\.(force|tech)\.points\.value$/.test(target?.target ?? "")
	);
}

function getDroppedPowerNormalizationUpdates(itemData) {
	if ( !isSw5ePowerData(itemData) ) return null;

	return {
		"system.method": "powerCasting",
		"system.prepared": true
	};
}

function normalizeDroppedPowerData(itemData) {
	const updates = getDroppedPowerNormalizationUpdates(itemData);
	if ( !updates ) return itemData;

	itemData.system ??= {};
	itemData.system.method = updates["system.method"];
	itemData.system.prepared = updates["system.prepared"];
	return itemData;
}

function normalizeRawDroppedPowerData(dropData) {
	if ( !dropData || (typeof dropData !== "object") ) return dropData;
	normalizeDroppedPowerData(dropData);
	if ( dropData.data && (typeof dropData.data === "object") ) normalizeDroppedPowerData(dropData.data);
	return dropData;
}

function getNumericValue(value) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
}

function getLegacyPowerPoints(actor, castType) {
	const sourcePoints = actor?._source?.system?.attributes?.[castType]?.points;
	if ( sourcePoints && typeof sourcePoints === "object" ) return sourcePoints;
	const preparedPoints = actor?.system?.attributes?.[castType]?.points;
	if ( preparedPoints && typeof preparedPoints === "object" ) return preparedPoints;
	return actor?._source?.system?.[castType]?.points ?? actor?.system?.[castType]?.points ?? {};
}

function inferNpcPowerLevelFromPowers(actor, castType, typeConfig) {
	const schools = typeConfig?.schools ?? {};
	const powers = actor?.itemTypes?.spell ?? [];
	const relevantPowers = powers.filter(power => (power?.system?.school ?? "") in schools);
	if ( !relevantPowers.length ) return null;

	const highestPowerLevel = relevantPowers.reduce((highest, power) => {
		const level = getNumericValue(power?.system?.level) ?? 0;
		return Math.max(highest, level);
	}, 0);

	const fullProgression = typeConfig?.progression?.full?.powerMaxLevel;
	if ( !fullProgression || typeof fullProgression !== "object" ) {
		return highestPowerLevel > 0 ? Math.min(highestPowerLevel * 2, 20) : 1;
	}

	for (let lvl = 1; lvl <= 20; lvl += 1) {
		const cap = getNumericValue(fullProgression[lvl] ?? fullProgression[String(lvl)]) ?? 0;
		if ( cap >= highestPowerLevel ) return lvl;
	}
	return 20;
}

function getPowercastingMountPoint(root, actorType) {
	const hpButton = root.querySelector('[data-action="hitPoints"], [data-action="hit-points"]');
	const hpGroup = hpButton?.closest(".meter-group, .attrib.health, .attribute.health, .health, .resource");
	if ( hpGroup?.parentElement ) {
		return {
			container: hpGroup.parentElement,
			reference: hpGroup,
			insertAfter: true,
			append: false
		};
	}

	const hpSectionFromInput = root
		.querySelector('[name="system.attributes.hp.value"]')
		?.closest(".meter-group, .attrib.health, .attribute.health, .health, .resource");
	if ( hpSectionFromInput?.parentElement ) {
		return {
			container: hpSectionFromInput.parentElement,
			reference: hpSectionFromInput,
			insertAfter: true,
			append: false
		};
	}

	if ( root.classList?.contains("tidy5e-sheet") ) {
		const sidePanel = root.querySelector(".attributes .side-panel");
		if ( sidePanel ) {
			return {
				container: sidePanel,
				reference: null,
				insertAfter: false,
				append: false
			};
		}
	}

	if ( actorType === "npc" ) {
		const npcMount = [
			root.querySelector("header .attributes"),
			root.querySelector(".sheet-header .attributes")
		].find(Boolean);
		if ( npcMount?.parentElement ) {
			return {
				container: npcMount.parentElement,
				reference: npcMount,
				insertAfter: true,
				append: false
			};
		}
	}

	const sidebar = [
		root.querySelector(".sidebar .stats"),
		root.querySelector("[data-application-part='sidebar'] .stats"),
		root.querySelector(".sheet-sidebar .stats"),
		root.querySelector(".sidebar"),
		root.querySelector("[data-application-part='sidebar']"),
		root.querySelector(".sheet-sidebar")
	].find(Boolean);
	if ( sidebar ) {
		return {
			container: sidebar,
			reference: null,
			insertAfter: false,
			append: true
		};
	}

	const profileImage = root.querySelector("img.profile, .profile img, .portrait img, .profile-img");
	const profileBlock = profileImage?.closest("section, aside, header, div");
	if ( profileBlock?.parentElement ) {
		return {
			container: profileBlock.parentElement,
			reference: profileBlock,
			insertAfter: true,
			append: false
		};
	}

	return {
		container: root.querySelector("form, .window-content"),
		reference: null,
		insertAfter: false,
		append: true
	};
}

function reconcileNpcPowerPool(actor, castType, computedMax) {
	const sourcePoints = actor?._source?.system?.powercasting?.[castType]?.points ?? {};
	const legacyPoints = getLegacyPowerPoints(actor, castType);

	const sourceMax = getNumericValue(sourcePoints.max);
	const sourceValue = getNumericValue(sourcePoints.value);
	const legacyMax = getNumericValue(legacyPoints.max);
	const legacyValue = getNumericValue(legacyPoints.value);
	const computedPoolMax = Math.max(0, getNumericValue(computedMax) ?? 0);
	const hasSourceOverride = sourcePoints.max !== null && sourcePoints.max !== undefined && sourcePoints.max !== "";
	const effectiveMax = hasSourceOverride
		? Math.max(0, sourceMax ?? 0)
		: ([legacyMax, computedPoolMax].find(value => value != null && value > 0) ?? 0);

	let effectiveValue = effectiveMax;
	if ( sourceValue != null ) effectiveValue = sourceValue;
	else if ( legacyValue != null ) effectiveValue = legacyValue;

	return {
		calculatedMax: computedPoolMax,
		overrideMax: hasSourceOverride ? Math.max(0, sourceMax ?? 0) : null,
		hasOverride: hasSourceOverride,
		max: effectiveMax,
		value: Math.min(Math.max(getNumericValue(effectiveValue) ?? 0, 0), effectiveMax)
	};
}

function actorHasPowercastingUi(actor, castType) {
	const castData = actor?.system?.powercasting?.[castType];
	const points = castData?.points ?? {};
	const level = Number(castData?.level ?? 0);
	const value = Number(points?.value ?? 0);
	const max = Number(points?.max ?? 0);
	const temp = Number(points?.temp ?? 0);
	const tempmax = Number(points?.tempmax ?? 0);
	if ( level > 0 || max > 0 || value > 0 || temp > 0 || tempmax !== 0 ) return true;

	const schools = Object.keys(CONFIG.DND5E.powerCasting?.[castType]?.schools ?? {});
	if ( (actor?.itemTypes?.spell ?? []).some(power => schools.includes(power?.system?.school)) ) return true;

	if ( actor?.type === "npc" ) {
		const levelKey = `power${castType.capitalize()}Level`;
		if ( (getNumericValue(actor.system?.details?.[levelKey]) ?? 0) > 0 ) return true;
		if ( (getNumericValue(actor._source?.system?.details?.[levelKey]) ?? 0) > 0 ) return true;
	}

	return false;
}

/** Schools that belong to a SW5E power casting type (force / tech). */
function getPowerCastTypeSchoolIds(castType) {
	return Object.keys(CONFIG.DND5E.powerCasting?.[castType]?.schools ?? {});
}

/** At least one owned spell item uses a school from this casting type. */
function actorHasOwnedPowerInCastSchools(actor, castType) {
	const schools = getPowerCastTypeSchoolIds(castType);
	if ( !schools.length ) return false;
	return (actor?.itemTypes?.spell ?? []).some(power => schools.includes(power?.system?.school));
}

/** NPC stat-block or prepared data indicates this casting type. */
function npcHasStatBlockPowerCasting(actor, castType) {
	const levelKey = `power${castType.capitalize()}Level`;
	if ( (getNumericValue(actor.system?.details?.[levelKey]) ?? 0) > 0 ) return true;
	if ( (getNumericValue(actor._source?.system?.details?.[levelKey]) ?? 0) > 0 ) return true;
	if ( (getNumericValue(actor.system?.powercasting?.[castType]?.level) ?? 0) > 0 ) return true;
	return false;
}

/**
 * Sidebar-only rule for Force/Tech meters — stricter than {@link actorHasPowercastingUi}.
 * Characters: at least one owned power in that type’s schools. NPCs: same, or stat-block caster level / prepared level.
 */
function shouldShowSidebarPowerMeter(actor, castType) {
	if ( actorHasOwnedPowerInCastSchools(actor, castType) ) return true;
	if ( actor?.type === "npc" && npcHasStatBlockPowerCasting(actor, castType) ) return true;
	return false;
}

function shouldShowSuperioritySidebarMeter(actor) {
	const sup = actor?.system?.superiority;
	if ( (getNumericValue(sup?.dice?.max) ?? 0) > 0 ) return true;
	if ( (getNumericValue(sup?.level) ?? 0) > 0 ) return true;
	const classes = actor.itemTypes?.class ?? [];
	if ( classes.some(clss => {
		const prog = clss.system?.spellcasting?.superiorityProgression;
		return prog && prog !== "none";
	}) ) return true;
	if ( Array.from(actor.items ?? []).some(i => isModuleType(i.type, "maneuver")) ) return true;
	return false;
}

function insertPowercastingElement(containerElement, mountPoint, mountContainer, insertReference) {
	if ( mountPoint.insertAfter && insertReference?.parentElement ) {
		insertReference.insertAdjacentElement("afterend", containerElement);
		return containerElement;
	}
	if ( mountPoint.append ) {
		mountContainer.append(containerElement);
		return insertReference;
	}
	mountContainer.prepend(containerElement);
	return insertReference;
}

// dataModels file adds:
// - powercasting field to CreatureTemplate
// - spellcasting.force/techProgression to ClassData and SubclassData

function adjustItemSpellcastingGetter() {
	Hooks.on('sw5e.Item5e.spellcasting', function (_this, result, config, ...args) {
		const spellcasting = _this.system.spellcasting;
		if (!spellcasting) return;

		const isSubclass = _this.type === "subclass";
		const classSC = isSubclass ? _this.class?.system?.spellcasting : spellcasting;
		const subclassSC = isSubclass ? spellcasting : _this.subclass?.system?.spellcasting;

		for (const castType of ["force", "tech"]) {
			const prop = castType + "Progression";
			delete result[prop];

			const classPC = classSC?.[prop] ?? "none";
			const subclassPC = subclassSC?.[prop] ?? "none";

			if (subclassPC && subclassPC !== "none") result[castType] = subclassPC;
			else if (classPC && classPC !== "none") result[castType] = classPC;
			else result[castType] = "none";
		}
	});
}

function normalizeDroppedPowerDefaults() {
	Hooks.on("sw5e.preItem5e.fromDropData", (_cls, data) => {
		normalizeRawDroppedPowerData(data);
	});

	Hooks.on("sw5e.Item5e.fromDropData", (_cls, result, config, ...args) => {
		if ( !result ) return;
		config.result = normalizeDroppedPowerData(result);
	});

	// The modern DnD5e drop pipeline no longer exposes a dedicated sheet _onDropSpell method.
	// Enforce the final method on actor-owned SW5E powers at creation time instead.
	Hooks.on("preCreateItem", (document, data) => {
		if ( document?.parent?.documentName !== "Actor" ) return;
		const updates = getDroppedPowerNormalizationUpdates(data);
		if ( !updates ) return;
		document.updateSource(updates);
	});
}

function preparePowercasting() {
	Hooks.on('sw5e.preActor5e._prepareSpellcasting', function (_this, result, config, ...args) {
		if (!_this.system.spells) return;
		const isNPC = _this.type === "npc";

		// Prepare base progression data
		const charProgression = ["force", "tech"].reduce((obj, castType) => {
			obj[castType] = {
				powersKnownCur: 0,
				powersKnownMax: 0,
				points: 0,
				casterLevel: 0,
				maxPowerLevel: 0,
				maxClassProg: null,
				maxClassLevel: 0,
				classes: 0,
				attributeOverride: null
			};
			return obj;
		}, {});

		for (const [castType, obj] of Object.entries(charProgression)) {
			const typeConfig = CONFIG.DND5E.powerCasting[castType];
			if (isNPC) {
				const levelKey = `power${castType.capitalize()}Level`;
				let level = getNumericValue(_this.system.details?.[levelKey]);
				const sourceLevel = getNumericValue(_this._source?.system?.details?.[levelKey]);
				if ( !(level > 0) ) level = sourceLevel;

				// Recovery path for already-imported NPCs whose legacy detail fields were pruned.
				if ( !(level > 0) ) {
					const inferredLevel = inferNpcPowerLevelFromPowers(_this, castType, typeConfig);
					if ( inferredLevel > 0 ) {
						level = inferredLevel;
						_this.system.details ??= {};
						_this.system.details[levelKey] = inferredLevel;
						if ( !(sourceLevel > 0) ) {
							_this.updateSource?.({ [`system.details.${levelKey}`]: inferredLevel });
						}
					}
				}

				if ( level > 0 ) {
					obj.classes = 1;
					obj.points = level * (typeConfig.progression.full?.powerPoints ?? 0);
					obj.casterLevel = level;
					obj.maxClassLevel = level;
					obj.maxClassProg = "full";
				}
			} else {
				// Translate the list of classes into power-casting progression
				for (const cls of _this.itemTypes?.class ?? []) {
					const pc = cls.spellcasting;

					if (!pc || pc.levels < 1) continue;
					const progression = pc[castType];

					if (!(progression in typeConfig.progression) || progression === "none") continue;
					if (progression === "half" && castType === "tech" && pc.levels < 2) continue; // Tech half-casters only get techcasting at lvl 2

					const progConfig = typeConfig.progression[progression];

					obj.classes++;
					obj.powersKnownMax += progConfig.powersKnown[pc.levels];
					obj.points += pc.levels * progConfig.powerPoints;
					obj.casterLevel += pc.levels * progConfig.powerMaxLevel[20] / 9;
					obj.maxPowerLevel = Math.max(obj.maxPowerLevel, progConfig.powerMaxLevel[20]);

					if (pc.levels > obj.maxClassLevel) {
						obj.maxClassLevel = pc.levels;
						obj.maxClassProg = progression;
					}
				}

				// Calculate known powers
				for (const pwr of _this.itemTypes?.spell ?? []) {
					const { properties, school } = pwr?.system ?? {};
					if (properties?.has("freeLearn")) continue;
					if (school in CONFIG.DND5E.powerCasting[castType].schools) obj.powersKnownCur++;
				}
			}
		}


		// Apply progression data
		for (const [castType, obj] of Object.entries(charProgression)) {
			const typeConfig = CONFIG.DND5E.powerCasting[castType] ?? {};
			const progConfig = typeConfig.progression[obj.maxClassProg] ?? {};

			// 'Round Appropriately'
			obj.points = Math.round(obj.points);
			obj.casterLevel = Math.round(obj.casterLevel);

			// What level is considered 'high level casting'
			obj.limit = progConfig.powerLimit ?? 0;

			// What is the maximum power level you can cast
			if (obj.classes) {
				if (obj.classes === 1) {
					obj.maxPowerLevel = progConfig.powerMaxLevel[obj.maxClassLevel];
				} else {
					// Don't allow multiclassing to achieve a higher max power level than a 20th level character of any of those classes
					obj.maxPowerLevel = Math.min(obj.maxPowerLevel, typeConfig.progression.full[obj.casterLevel]);
				}
			}

			// Apply the calculated values to the sheet
			const target = _this.system.powercasting[castType];
			target.known.value = obj.powersKnownCur;
			if ( isNPC ) {
				const reconciledPool = reconcileNpcPowerPool(_this, castType, obj.points);
				_this._sw5ePowerPointRuntime ??= {};
				_this._sw5ePowerPointRuntime[castType] = {
					calculatedMax: reconciledPool.calculatedMax,
					overrideMax: reconciledPool.overrideMax,
					hasOverride: reconciledPool.hasOverride,
					effectiveMax: reconciledPool.max
				};
				target.known.max = obj.powersKnownMax;
				target.level = obj.casterLevel;
				target.limit = obj.limit;
				target.maxPowerLevel = obj.maxPowerLevel;
				target.points.max = reconciledPool.max;
				target.points.value = reconciledPool.value;
				const legacyPoints = _this.system.attributes?.[castType]?.points;
				if ( legacyPoints && typeof legacyPoints === "object" ) {
					legacyPoints.max = reconciledPool.max;
					legacyPoints.value = reconciledPool.value;
				}
			} else {
				_this._sw5ePowerPointRuntime ??= {};
				_this._sw5ePowerPointRuntime[castType] = {
					calculatedMax: getNumericValue(obj.points) ?? 0,
					overrideMax: null,
					hasOverride: false,
					effectiveMax: getNumericValue(target.points?.max) ?? getNumericValue(obj.points) ?? 0
				};
				target.known.max ??= obj.powersKnownMax;
				target.level ??= obj.casterLevel;
				target.limit ??= obj.limit;
				target.maxPowerLevel ??= obj.maxPowerLevel;
				target.points.max ??= obj.points;
			}
		}

		const { simplifyBonus } = dnd5e.utils;
		const rollData = _this.getRollData();

		const { attributes, powercasting } = _this.system;
		const base = 8 + (attributes.prof ?? 0);
		const lvl = Number(_this.system.details?.level ?? _this.system.details.cr ?? 0);

		// TODO: Add rules
		// // Simplified forcecasting rule
		if (game.settings.get(SETTINGS_NAMESPACE, "simplifiedForcecasting")) {
			CONFIG.DND5E.powerCasting.force.schools.lgt.attr = CONFIG.DND5E.powerCasting.force.schools.uni.attr;
			CONFIG.DND5E.powerCasting.force.schools.drk.attr = CONFIG.DND5E.powerCasting.force.schools.uni.attr;
		}

		// Powercasting DC for Actors and NPCs
		const ability = {};
		for (const [castType, typeConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			for (const [school, schoolConfig] of Object.entries(typeConfig.schools)) {
				const schoolData = powercasting[castType].schools[school];
				ability[school] = getBestAbility(_this, schoolConfig.attr, 0);
				if (ability[school].mod > (ability[castType]?.mod ?? -Infinity)) ability[castType] = ability[school];
				schoolData.attr = ability[school]?.id ?? "";
				const bonus = getPowerDcBonus(_this, castType, school, ability[school]?.id, rollData);
				schoolData.dc = base + ability[school].mod + bonus;
			}
		}

		// Apply formula-based bonus points to actors without a max override.
		for (const [castType, typeConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			const cast = _this.system.powercasting[castType];
			const castSource = _this._source?.system?.powercasting?.[castType];

			if (!castSource || castSource.points?.max !== null) continue;
			if (cast.level === 0) continue;

			if (ability[castType]?.mod) cast.points.max += ability[castType].mod;

			const levelBonus = simplifyBonus(cast.points.bonuses.level ?? 0, rollData) * lvl;
			const overallBonus = simplifyBonus(cast.points.bonuses.overall ?? 0, rollData);
			const focus = _this.focuses?.[CONFIG.DND5E.powerCasting[castType].focus.label];
			const focusProperty = CONFIG.DND5E.powerCasting[castType].focus.property;
			const focusBonus = focus?.flags?.sw5e?.properties?.[focusProperty] ?? 0;

			cast.points.max += levelBonus + overallBonus + focusBonus;
			const finalMax = Math.max(0, getNumericValue(cast.points.max) ?? 0);
			if ( _this._sw5ePowerPointRuntime?.[castType] ) _this._sw5ePowerPointRuntime[castType].effectiveMax = finalMax;

			if ( isNPC ) {
				const sourcePoints = castSource.points ?? {};
				const legacyPoints = getLegacyPowerPoints(_this, castType);
				const sourceValue = getNumericValue(sourcePoints.value);
				const legacyValue = getNumericValue(legacyPoints.value);
				const restoredValue = sourceValue ?? legacyValue ?? getNumericValue(cast.points.value) ?? 0;
				cast.points.value = Math.min(Math.max(restoredValue, 0), finalMax);

				const legacyPreparedPoints = _this.system.attributes?.[castType]?.points;
				if ( legacyPreparedPoints && typeof legacyPreparedPoints === "object" ) {
					legacyPreparedPoints.max = finalMax;
					legacyPreparedPoints.value = cast.points.value;
				}
			}
		}
	});
}

function makeProgOption(config) {
	const option = document.createElement("option");
	option.setAttribute("value", config.value);
	if (config.selected) option.setAttribute("selected", null);
	const text = document.createTextNode(game.i18n.localize(config.label));
	option.appendChild(text);
	return option;
}

const FORCE_SUMMARY_SCHOOL_LABEL_KEYS = [
	"SW5E.Powercasting.Force.School.Lgt.Label",
	"SW5E.Powercasting.Force.School.Drk.Label",
	"SW5E.Powercasting.Force.School.Uni.Label"
];

/** Theme keys for force summary segments (order matches `preparedCards.force`). */
const FORCE_SUMMARY_SEGMENT_THEME = ["lgt", "drk", "uni"];

const SUPERIORITY_SUMMARY_TYPE_LABEL_KEYS = [
	"SW5E.Superiority.Type.Mental.Label",
	"SW5E.Superiority.Type.Physical.Label",
	"SW5E.Superiority.Type.General.Label"
];

const SUPERIORITY_SUMMARY_SEGMENT_THEME = ["mental", "physical", "general"];

const POWERS_BANNER_SEGMENT_THEMES = new Set([
	...FORCE_SUMMARY_SEGMENT_THEME,
	...SUPERIORITY_SUMMARY_SEGMENT_THEME,
	"tec"
]);

/**
 * One compact segment for the Powers tab banner (horizontal flow, pipe-separated).
 * @param {string} label
 * @param {string} attr
 * @param {string} attack
 * @param {number|null|undefined} saveDc
 * @param {string} [themeKey] Optional CSS modifier for school/type accent (e.g. lgt, drk, uni).
 */
function formatPowersTabBannerSegment(label, attr, attack, saveDc, themeKey) {
	const ab = String(attr ?? "").toUpperCase();
	const atk = attack ?? "—";
	const sv = (saveDc != null && Number.isFinite(Number(saveDc))) ? String(saveDc) : "—";
	const L = foundry.utils.escapeHTML(label);
	const atkLbl = game.i18n.localize("SW5E.Powercasting.PowersTabSummary.AtkAbbr");
	const saveLbl = game.i18n.localize("SW5E.Powercasting.PowersTabSummary.SaveAbbr");
	const themeMod = (themeKey && POWERS_BANNER_SEGMENT_THEMES.has(themeKey))
		? ` sw5e-powers-banner-seg--${themeKey}`
		: "";
	return `<span class="sw5e-powers-banner-seg${themeMod}">`
		+ `<span class="sw5e-powers-banner-seg-label">${L}</span>`
		+ ` — <span class="sw5e-powers-banner-abbr">${ab}</span> - ${foundry.utils.escapeHTML(atkLbl)} ${foundry.utils.escapeHTML(atk)} - ${foundry.utils.escapeHTML(saveLbl)} ${sv}</span>`;
}

/** @param {string[]} segments */
function joinPowersBannerSegments(segments) {
	const sep = `<span class="sw5e-powers-banner-sep" aria-hidden="true">|</span>`;
	return segments.filter(Boolean).join(sep);
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {"force"|"tech"} castType
 * @param {string} labelKey
 */
function buildPowersKnownSummaryRow(actor, castType, labelKey) {
	const known = actor.system?.powercasting?.[castType]?.known;
	const hint = game.i18n.localize("SW5E.Powercasting.PowersTabSummary.KnownHint");
	const label = game.i18n.localize(labelKey);
	if ( !known ) {
		return `<div class="sw5e-powers-known-badge" title="${foundry.utils.escapeHTML(hint)}">`
			+ `<span class="sw5e-powers-known-label">${foundry.utils.escapeHTML(label)}</span>`
			+ `<span class="sw5e-powers-known-pair">— / —</span>`
			+ `</div>`;
	}

	const curRaw = known.value;
	const cur = Number.isFinite(Number(curRaw)) ? Number(curRaw) : 0;
	const maxRaw = known.max;
	let pairText;
	let over = false;

	if ( maxRaw === null || maxRaw === undefined || maxRaw === "" ) {
		pairText = `${cur} / —`;
	} else {
		const maxN = Number(maxRaw);
		if ( Number.isFinite(maxN) ) {
			pairText = `${cur} / ${maxN}`;
			over = cur > maxN;
		} else {
			pairText = `${cur} / ${maxRaw}`;
		}
	}

	const overClass = over ? " sw5e-powers-known--over" : "";
	return `<div class="sw5e-powers-known-badge" title="${foundry.utils.escapeHTML(hint)}">`
		+ `<span class="sw5e-powers-known-label">${foundry.utils.escapeHTML(label)}</span>`
		+ `<span class="sw5e-powers-known-pair${overClass}">${foundry.utils.escapeHTML(pairText)}</span>`
		+ `</div>`;
}

/**
 * @param {HTMLElement} root
 * @param {import("@league/foundry").documents.Actor} actor
 */
function injectPowersTabPowercastingSummary(root, actor) {
	const powercastingCardsSection = root.querySelector(`section.tab[data-tab="spells"] section.top`);
	if ( !powercastingCardsSection || !actor ) return;

	powercastingCardsSection.querySelectorAll("div.spellcasting.card:not(.sw5e)").forEach(card => card.remove());
	powercastingCardsSection.querySelectorAll(".spellcasting.card.sw5e, .sw5e-powers-summary").forEach(el => el.remove());

	const actorPowers = actor.itemTypes?.spell ?? [];
	const actorClasses = actor.itemTypes?.class ?? [];
	const actorManeuvers = Array.from(actor.items ?? []).filter(i => isModuleType(i.type, "maneuver"));
	const superiorityData = actor.system.superiority;

	const hasSuperiority = (
		actorClasses.some(clss => clss.system?.spellcasting?.superiorityProgression && (clss.system.spellcasting.superiorityProgression !== "none"))
		|| actorManeuvers.length > 0
		|| (superiorityData?.level > 0)
	);
	const hasForcecasting = (
		actorClasses.some(clss => ["consular", "guardian", "sentinel"].includes(clss.system.identifier))
		||
		actorPowers.some(power => ["lgt", "drk", "uni"].includes(power.system.school))
	);
	const hasTechcasting = (
		actorClasses.some(clss => ["engineer", "scout"].includes(clss.system.identifier))
		||
		actorPowers.some(power => power.system.school === "tec")
	);

	if ( !hasSuperiority && !hasForcecasting && !hasTechcasting ) return;

	const preparedCards = getPreparedPowercastingCards(actor);
	const blocks = [];

	if ( hasForcecasting ) {
		const title = game.i18n.localize("SW5E.Powercasting.Force.Label");
		const forceKnown = buildPowersKnownSummaryRow(actor, "force", "SW5E.Powercasting.PowersTabSummary.PowersKnownForce");
		const segs = preparedCards.force.map((card, i) => {
			const lab = game.i18n.localize(FORCE_SUMMARY_SCHOOL_LABEL_KEYS[i] ?? FORCE_SUMMARY_SCHOOL_LABEL_KEYS[0]);
			const theme = FORCE_SUMMARY_SEGMENT_THEME[i] ?? FORCE_SUMMARY_SEGMENT_THEME[0];
			return formatPowersTabBannerSegment(lab, card.attr, card.attack, card.save, theme);
		});
		blocks.push(`<div class="sw5e-powers-banner-block" data-sw5e-summary="force">`
			+ `<div class="sw5e-powers-banner-head">`
			+ `<div class="sw5e-powers-banner-head-left"><div class="sw5e-powers-banner-kicker">${foundry.utils.escapeHTML(title)}</div></div>`
			+ `<div class="sw5e-powers-banner-head-right">${forceKnown}</div>`
			+ `</div>`
			+ `<div class="sw5e-powers-banner-flow">${joinPowersBannerSegments(segs)}</div></div>`);
	}

	if ( hasTechcasting ) {
		const t = preparedCards.tech;
		const title = game.i18n.localize("SW5E.Powercasting.Tech.Label");
		const school = game.i18n.localize("SW5E.Powercasting.Tech.School.Tec.Label");
		const seg = formatPowersTabBannerSegment(school, t.attr, t.attack, t.save, "tec");
		const techKnown = buildPowersKnownSummaryRow(actor, "tech", "SW5E.Powercasting.PowersTabSummary.PowersKnownTech");
		blocks.push(`<div class="sw5e-powers-banner-block" data-sw5e-summary="tech">`
			+ `<div class="sw5e-powers-banner-head">`
			+ `<div class="sw5e-powers-banner-head-left"><div class="sw5e-powers-banner-kicker">${foundry.utils.escapeHTML(title)}</div></div>`
			+ `<div class="sw5e-powers-banner-head-right">${techKnown}</div>`
			+ `</div>`
			+ `<div class="sw5e-powers-banner-flow">${seg}</div></div>`);
	}

	if ( hasSuperiority ) {
		const dice = preparedCards.superiority[0]?.resource;
		const kicker = foundry.utils.escapeHTML(game.i18n.localize("SW5E.Superiority.Label"))
			+ (dice ? ` · ${foundry.utils.escapeHTML(dice)}` : "");
		const segs = preparedCards.superiority.map((card, i) => {
			const lab = game.i18n.localize(SUPERIORITY_SUMMARY_TYPE_LABEL_KEYS[i] ?? SUPERIORITY_SUMMARY_TYPE_LABEL_KEYS[0]);
			const theme = SUPERIORITY_SUMMARY_SEGMENT_THEME[i] ?? SUPERIORITY_SUMMARY_SEGMENT_THEME[0];
			return formatPowersTabBannerSegment(lab, card.attr, card.attack, card.save, theme);
		});
		blocks.push(`<div class="sw5e-powers-banner-block" data-sw5e-summary="superiority">`
			+ `<div class="sw5e-powers-banner-head sw5e-powers-banner-head--single">`
			+ `<div class="sw5e-powers-banner-head-left"><div class="sw5e-powers-banner-kicker">${kicker}</div></div>`
			+ `</div>`
			+ `<div class="sw5e-powers-banner-flow">${joinPowersBannerSegments(segs)}</div></div>`);
	}

	const wrap = document.createElement("div");
	wrap.className = "sw5e-powers-summary sw5e-powers-banner";
	wrap.innerHTML = blocks.join("");
	powercastingCardsSection.prepend(wrap);
}

function showPowercastingStats() {
	Hooks.on("renderBaseActorSheet", function (app, html, context, options) {
		const root = getHtmlRoot(html);
		const actor = context?.actor ?? app.actor;
		if ( !root || !actor ) return;
		injectPowersTabPowercastingSummary(root, actor);
	});

	Hooks.on("renderActorSheetV2", function (app, html, data) {
		const root = getHtmlRoot(html);
		const actor = data?.actor ?? app.actor;
		if ( !root || !actor ) return;
		if ( actor.type !== "character" && actor.type !== "npc" ) return;
		injectPowersTabPowercastingSummary(root, actor);
	});

	/* // Old One:
	const { simplifyBonus } = dnd5e.utils;
	Hooks.on('sw5e.ActorSheet5eCharacter.getData', function (_this, context, config, ...args) {
		const msak = simplifyBonus(_this.actor.system.bonuses.msak.attack, context.rollData);
		const rsak = simplifyBonus(_this.actor.system.bonuses.rsak.attack, context.rollData);
		for (const castType of ["tech", "force"]) {
			const castData = _this.actor.system.powercasting[castType];
			if (castData.level === 0) continue;
			const sc = castData.schools.tec ?? castData.schools.uni ?? {};
			const ability = _this.actor.system.abilities[sc.attr];
			const mod = ability?.mod ?? 0;
			const attackBonus = msak === rsak ? msak : 0;
			context.spellcasting?.push({
				label: game.i18n.localize(`SW5E.Powercasting.${castType.capitalize()}.Label`) + ` (${castData.points.value}/${castData.points.max})`,
				ability: { mod: ability?.mod ?? 0, ability: sc.attr ?? "" },
				attack: mod + _this.actor.system.attributes.prof + attackBonus,
				primary: _this.actor.system.attributes.spellcasting === sc.attr,
				save: ability?.dc ?? 0
			});
		}
	});
	*/
}

function patchItemSheet() {
	Hooks.on("renderItemSheet5e", (app, html, data) => {
		const root = getHtmlRoot(html);
		if ( !root || !app.item?.system?.spellcasting ) return;
		root.querySelectorAll(`select[name|='system.spellcasting.progression']`).forEach((el, idx) => {
			const root = el.parentNode.parentNode;
			if ( !root?.nextElementSibling ) return;
			for (const castType of ["Tech", "Force"]) {
				const selectedValue = app.item.system.spellcasting[`${castType.toLowerCase()}Progression`];
				const div = document.createElement("div");
				div.setAttribute("class", "form-group");
				const label = document.createElement("label");
				const text = document.createTextNode(game.i18n.localize(`SW5E.Powercasting.${castType}.Prog.Label`));
				label.appendChild(text);
				div.appendChild(label);
				const div2 = document.createElement("div");
				div2.setAttribute("class", "form-fields");
				const select = document.createElement("select");
				select.setAttribute("name", `system.spellcasting.${castType.toLowerCase()}Progression`);
				select.appendChild(makeProgOption({
					value: "none",
					selected: selectedValue === "none",
					label: "DND5E.None"
				}));
				if (!app.isEditable) select.setAttribute("disabled", null);
				for (const [key, prog] of Object.entries(CONFIG.DND5E.powerCasting[castType.toLowerCase()].progression)) {
					select.appendChild(makeProgOption({
						value: key,
						selected: selectedValue === key,
						label: prog.label
					}));
				}
				div2.appendChild(select);
				div.appendChild(div2);
				root.nextElementSibling.insertAdjacentElement("afterend", div);
			}
		});
	});
}

function patchPowerAbilityScore() {
	Hooks.on('sw5e.preActor5e.spellcastingClasses', function (_this, ...args) {
		_this[PRECALCULATED_SPELLCASTING_KEY] = _this._spellcastingClasses !== undefined;
	});
	Hooks.on('sw5e.Actor5e.spellcastingClasses', function (_this, result, config, ...args) {
		const preCalculated = _this[PRECALCULATED_SPELLCASTING_KEY];
		delete _this[PRECALCULATED_SPELLCASTING_KEY];

		if (preCalculated) return;
		for (const [identifier, cls] of Object.entries(_this.classes)) for (const castType of ["force", "tech"]) {
			if (cls.spellcasting && (cls.spellcasting[castType] !== "none")) result[identifier] = cls;
		}
	});

	Hooks.on('sw5e.SpellData.getSheetData', function (_this, result, config, ...args) {
		const context = args[0];
		if (_this.parent.actor) {
			for (const [castType, castData] of Object.entries(_this.parent.actor.system?.powercasting ?? {})) {
				if (_this.school in castData.schools) {
					const abl = castData.schools[_this.school].attr;
					const ability = CONFIG.DND5E.abilities[abl]?.label?.toLowerCase();
					if (ability) context.defaultAbility = game.i18n.format("DND5E.DefaultSpecific", { default: ability });
				}
			}
		}
	});
	Hooks.on('sw5e.SpellData.availableAbilities', function (_this, result, config, ...args) {
		if (_this.ability) return;
		for (const [castType, typeConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			if (_this.school in typeConfig.schools) {
				const attrs = typeConfig.schools[_this.school].attr;
				config.result = new Set(Array.isArray(attrs) ? attrs : [attrs]);
				return;
			}
		}
	});
	Hooks.on('sw5e.SpellData._typeAbilityMod', function (_this, result, config, ...args) {
		const availableAbilities = Array.from(_this.availableAbilities ?? []);
		config.result = getBestAbility(_this.parent.actor, availableAbilities).id ?? availableAbilities[0] ?? "int";
	});
}

function patchPowerbooks() {
	Hooks.on('sw5e.ActorSheet5e._prepareSpellbook', function (_this, powerbook, config, ...args) {
		const spellbook = config.result ?? powerbook ?? {};
		const columns = Object.values(spellbook)[0]?.columns ?? [];
		const reassignedPowers = [];
		const maxOrder = Object.values(spellbook).reduce((highest, section) => Math.max(highest, section?.order ?? 0), 0);
		const powerOrderBase = maxOrder + 1;

		const registerSection = (key, order, label, dataset) => {
			if ( key in spellbook ) return spellbook[key];
			const section = spellbook[key] = {
				label: game.i18n.localize(label),
				columns,
				order,
				usesSlots: false,
				id: key,
				slot: key,
				items: [],
				minWidth: 220,
				draggable: true,
				dataset: { type: "spell", method: "powerCasting", ...dataset }
			};
			return section;
		};

		for (const [key, section] of Object.entries(spellbook)) {
			if ( !Array.isArray(section?.items) ) continue;
			section.items = section.items.filter(item => {
				if ( item?.type !== "spell" || item?.system?.method !== "powerCasting" ) return true;
				reassignedPowers.push(item);
				return false;
			});

			if ( section.items.length === 0 && ((section?.dataset?.method === "powerCasting") || (key === "powerCasting")) ) {
				delete spellbook[key];
			}
		}

		for (const power of reassignedPowers) {
			const level = getNumericValue(power?.system?.level) ?? 0;
			const sectionKey = level <= 0 ? "powercasting-atwill" : `powercasting-level-${level}`;
			const label = level <= 0 ? "DND5E.SpellLevel0" : `DND5E.SpellLevel${level}`;
			const sectionOrder = powerOrderBase + Math.max(level, 0);
			const section = registerSection(sectionKey, sectionOrder, label, { level: String(Math.max(level, 0)) });
			section.items.push(power);
		}

		config.result = Object.fromEntries(
			Object.entries(spellbook).sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
		);
	});
}

function patchAbilityUseDialog() {
	Hooks.on('sw5e.ActivityUsageDialog._prepareScalingContext', function (_this, result, config, ...args) {
		const context = config.result;

		if ((_this.item.system.method === "powerCasting") && ((getNumericValue(_this.item.system.level) ?? 0) > 0)) {
			if (context.notes.length >= 1) {
				const note = context.notes[context.notes.length - 1];
				if (note.type === "warn" && note.message.startsWith("You have no available")) context.notes.pop();
			}
			const powercastingType = getPowercastingTypeFromItem(_this.item);
			const powercasting = _this.actor.system.powercasting[powercastingType];
			if ( !powercasting ) return;
			context.hasScaling = true;

			const minimumLevel = getNumericValue(_this.item.system.level) ?? 1;
			const maximumLevel = getNumericValue(powercasting.maxPowerLevel) ?? 0;
			const currentPoints = Number.isFinite(Number(powercasting.points?.value)) ? Number(powercasting.points.value) : 0;
			const limit = Number.isFinite(Number(powercasting.limit)) ? Number(powercasting.limit) : 0;
			if ( maximumLevel < minimumLevel ) {
				context.notes.push({
					type: "warn",
					message: game.i18n.format("SW5E.Powercasting.NoLevelsAvailable", {
						name: _this.item.name
					})
				});
				return;
			}

			const spellSlotOptions = Array.from({ length: maximumLevel - minimumLevel + 1 }, (v, i) => {
				const lvl = i + minimumLevel;
				const label = game.i18n.localize(`DND5E.SpellLevel${lvl}`);
				const cost = getPowerPointCost(_this.item, _this.activity, lvl);
				const alreadyUsed = limit > 0 && lvl >= limit && powercasting.used.has(lvl);
				return {
					value: lvl,
					label,
					cost,
					affordable: cost <= currentPoints,
					disabled: alreadyUsed || (cost > currentPoints)
				};
			});

			if (spellSlotOptions) context.spellSlots = {
				field: new foundry.data.fields.StringField({ label: game.i18n.localize("DND5E.SpellCastUpcast") }),
				name: "spell.slot",
				value: _this.config.spell?.slot,
				options: spellSlotOptions
			};

			if (!spellSlotOptions.some(o => !o.disabled)) {
				const messageKey = spellSlotOptions.some(o => o.affordable)
					? "SW5E.Powercasting.NoLevelsAvailable"
					: "SW5E.Powercasting.NoPoints";
				const pointNamespace = powercastingType === "tech" ? "Tech" : "Force";
				context.notes.push({
					type: "warn",
					message: game.i18n.format(messageKey, {
						name: _this.item.name,
						resource: game.i18n.localize(`SW5E.Powercasting.${pointNamespace}.Point.Label`)
					})
				});
			}
		}
	});
	Hooks.on('sw5e.ActivityUsageDialog._prepareSubmitData', function (_this, result, config, ...args) {
		if (_this.item.system.method !== "powerCasting") return;

		const submitData = result;
		if (foundry.utils.hasProperty(submitData, "spell.slot")) {
			const level = submitData.spell.slot ?? 0;
			const scaling = Math.max(0, level - _this.item.system.level);
			submitData.scaling = scaling;
		}
	});
	Hooks.on('dnd5e.activityConsumption', function (activity, usageConfig, messageConfig, updates) {
	if (activity?.item?.type !== "spell" || activity?.item?.system?.method !== "powerCasting") return;

	const powercastingType = getPowercastingTypeFromItem(activity.item);
	const powercasting = activity?.actor?.system?.powercasting?.[powercastingType];
	if ( !powercasting ) return;

	const castLevel = Number(usageConfig?.spell?.slot) || 0;
	const itemLevel = getNumericValue(activity.item.system.level) ?? 0;
	const scaling = Math.max(0, castLevel - itemLevel);

	if ( scaling > 0 ) {
		const pointsPath = `system.powercasting.${powercastingType}.points.value`;
		const currentValue = Number.isFinite(updates.actor[pointsPath])
			? updates.actor[pointsPath]
			: (foundry.utils.getProperty(activity.actor, pointsPath) ?? 0);

		updates.actor[pointsPath] = currentValue - scaling;
		}

	if ( castLevel >= powercasting.limit ) {
		powercasting.used.add(castLevel);
		updates.actor[`system.powercasting.${powercastingType}.used`] = powercasting.used;
		}
	});
}

function recoverPowerPoints() {
	Hooks.on("dnd5e.shortRest", (actor, config) => {
		for (const [castType, castConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			const points = actor.system.powercasting[castType].points;
			if (!castConfig.shortRest) continue;
			if (points.value === points.max) continue;
			actor.update({ [`system.powercasting.${castType}.points.value`]: points.max });
		}
	});
	Hooks.on("dnd5e.longRest", (actor, config) => {
		for (const [castType, castConfig] of Object.entries(CONFIG.DND5E.powerCasting)) {
			const { value, max } = actor.system.powercasting[castType].points;
			if (value === max) continue;
			actor.update({ [`system.powercasting.${castType}.points.value`]: max });
		}
	});
}

function makePowerPointsConsumable() {
	Hooks.once("setup", function () {
		for (const castType of ["force", "tech"]) {
			CONFIG.DND5E.consumableResources.push(`powercasting.${castType}.points.value`);
		}
	});
}

function showPowercastingBar() {
	Hooks.on("renderActorSheetV2", async (app, html, data) => {
		const root = getHtmlRoot(html);
		if ( !root ) return;
		if (data.actor.type != "character" && data.actor.type != "npc") {
			return;
		}
		root.querySelectorAll(".sw5e-powercasting-meter, .sw5e-superiority-meter").forEach(node => node.remove());

		const powerCasting = data.actor.system.powercasting;
		const mountPoint = getPowercastingMountPoint(root, data.actor.type);
		const mountContainer = mountPoint.container;
		if ( !mountContainer ) return;
		let insertReference = mountPoint.reference;
		const isEditable = typeof app.isEditable === "boolean" ? app.isEditable : false;
		for (const castType of ["force", "tech"]) {
			const castData = powerCasting[castType];
			const value = Number.isFinite(Number(castData?.points?.value)) ? Number(castData.points.value) : 0;
			const temp = Number.isFinite(Number(castData?.points?.temp)) ? Number(castData.points.temp) : 0;
			const max = Number.isFinite(Number(castData?.points?.max)) ? Number(castData.points.max) : 0;
			const tempmax = Number.isFinite(Number(castData?.points?.tempmax)) ? Number(castData.points.tempmax) : 0;
			const effectiveMax = Math.max(0, max + tempmax);
			const clampedValue = Math.max(0, Math.min(value, effectiveMax || value));
			const shouldRenderMeter = shouldShowSidebarPowerMeter(data.actor, castType);
			if ( shouldRenderMeter ) {
				const templateData = {
					'castType': castType,
					'pointsLabel': game.i18n.localize(`SW5E.Powercasting.${castType.capitalize()}.Point.Label`),
					'configureLabel': `${game.i18n.localize(`SW5E.Powercasting.${castType.capitalize()}.Point.Label`)} Configuration`,
					'isEditable': isEditable,
					'value': value,
					'ariaMax': effectiveMax,
					'tempmax': tempmax,
					'tempmaxSign': (tempmax > 0) ? 'temp-positive' : (tempmax < 0) ? 'temp-negative' : '',
					'effectiveMax': effectiveMax,
					'pct': effectiveMax > 0 ? (clampedValue / effectiveMax) * 100 : 0,
					'bonus': game.dnd5e.utils.formatNumber(tempmax, { signDisplay: "always" })
				};

				let container = $('<div class="meter-group sw5e-powercasting-meter"></div>');

				const templateFile = getModulePath("templates/powercasting-sheet-tracker.hbs");
				const renderedHtml = await foundry.applications.handlebars.renderTemplate(templateFile, templateData);

				container.append(renderedHtml);
				const containerElement = container[0];
				insertReference = insertPowercastingElement(containerElement, mountPoint, mountContainer, insertReference);
				if ( isEditable ) {
					const progressClass = `${castType}-points`;
					const pointBar = containerElement.querySelector(`.progress.${progressClass}`);
					const configButton = containerElement.querySelector('[data-action="configure-power-points"]');
					const currentInput = pointBar?.querySelector('input[name$=".points.value"]');
					pointBar?.addEventListener("click", event => _toggleEditPoints(progressClass, event, true));
					currentInput?.addEventListener("blur", event => _toggleEditPoints(progressClass, event, false));
					currentInput?.addEventListener("focus", ev => ev.currentTarget.select());
					currentInput?.addEventListener("change", app._onChangeInputDelta.bind(app));
					configButton?.addEventListener("click", event => {
						event.preventDefault();
						event.stopPropagation();
						openPowerPointConfig(data.actor, castType);
					});
				}
			}
		}

		if ( shouldShowSuperioritySidebarMeter(data.actor) ) {
			const sup = data.actor.system.superiority ?? {};
			const dice = sup.dice ?? {};
			const dieSize = getNumericValue(sup.die) ?? 0;
			const diceMax = Math.max(0, getNumericValue(dice.max) ?? 0);
			const diceVal = Math.max(0, getNumericValue(dice.value) ?? 0);
			const clampedDice = diceMax > 0 ? Math.min(diceVal, diceMax) : diceVal;
			const maxSegment = dieSize > 0 ? `${diceMax}d${dieSize}` : String(diceMax);
			const supTemplate = getModulePath("templates/superiority-sheet-tracker.hbs");
			const supHtml = await foundry.applications.handlebars.renderTemplate(supTemplate, {
				label: game.i18n.localize("SW5E.Superiority.Dice.Label"),
				value: clampedDice,
				maxSegment,
				ariaMax: Math.max(1, diceMax),
				pct: diceMax > 0 ? (clampedDice / diceMax) * 100 : 0,
				isEditable
			});
			const supContainer = $('<div class="meter-group sw5e-superiority-meter"></div>');
			supContainer.append(supHtml);
			const supEl = supContainer[0];
			insertReference = insertPowercastingElement(supEl, mountPoint, mountContainer, insertReference);
			if ( isEditable ) {
				const progressClass = "superiority-dice-points";
				const bar = supEl.querySelector(`.progress.${progressClass}`);
				const input = bar?.querySelector("input[name=\"system.superiority.dice.value\"]");
				bar?.addEventListener("click", event => _toggleEditPoints(progressClass, event, true));
				input?.addEventListener("blur", event => _toggleEditPoints(progressClass, event, false));
				input?.addEventListener("focus", ev => ev.currentTarget.select());
				input?.addEventListener("change", app._onChangeInputDelta.bind(app));
			}
		}

	});
}

/**
 * Toggle editing points bar.
 * @param {string} progressClass    CSS class on `.progress` (e.g. `force-points`, `superiority-dice-points`).
 * @param {PointerEvent} event  The triggering event.
 * @param {boolean} edit        Whether to toggle to the edit state.
 * @protected
 */
function _toggleEditPoints(progressClass, event, edit) {
	const target = event.currentTarget.closest(`.${progressClass}`);
	if ( !target ) return;
	const label = target.querySelector(":scope > .label");
	const input = target.querySelector(":scope > input");
	if ( !label || !input ) return;
	target.classList.toggle("editing", edit);
	label.hidden = edit;
	input.hidden = !edit;
	if ( edit ) input.focus();
}

export function patchPowercasting() {
	adjustItemSpellcastingGetter();
	normalizeDroppedPowerDefaults();
	patchItemSheet();
	patchPowerAbilityScore();
	patchPowerbooks();
	patchAbilityUseDialog();
	preparePowercasting();
	patchPowerBonuses();
	recoverPowerPoints();
	showPowercastingStats();
	makePowerPointsConsumable();
	showPowercastingBar();
}
