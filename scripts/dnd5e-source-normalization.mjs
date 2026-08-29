import { normalizeSwCurrencyWallet, normalizeSwPriceDenomination } from "./currencies.mjs";

export const TARGET_DND5E_VERSION = "5.2.5"

const LEGACY_ITEM_TYPE_REMAPS = {
	power: "spell",
	species: "race",
	archetype: "subclass",
	modification: "loot"
}

const LEGACY_FEAT_LIKE_ITEM_TYPES = {
	deploymentfeature: { value: "deployment" },
	classfeature: { value: "class" },
	fightingmastery: { value: "customizationOption", subtype: "fightingMastery" },
	fightingstyle: { value: "customizationOption", subtype: "fightingStyle" },
	lightsaberform: { value: "customizationOption", subtype: "lightsaberForm" },
	venture: { value: "deployment", subtype: "venture" }
}

const STANDARD_DND5E_SPELL_SCHOOLS = new Set(["abj", "con", "div", "enc", "evo", "ill", "nec", "trs", "trn"])
const TOOL_TYPE_VALUE_MAP = {
	art: "artisan",
	artisan: "artisan",
	game: "game",
	kit: "specialist",
	music: "music",
	specialist: "specialist"
}

function isObjectLike(value) {
	return !!value && (typeof value === "object") && !Array.isArray(value)
}

function hasOwnKeys(value) {
	return isObjectLike(value) && Object.keys(value).length > 0
}

function isManeuverItem(item) {
	if ( typeof item?.type !== "string" ) return false
	const normalizedType = item.type.split(".").at(-1) ?? item.type
	return normalizedType === "maneuver"
}

function normalizeActivityEntry(activity, fallbackId) {
	if ( !isObjectLike(activity) ) return null
	activity._id ??= fallbackId
	return activity
}

function normalizeActivitiesToObject(activities) {
	const normalized = {}
	let index = 0

	for ( const [candidateId, activity] of activities ) {
		index += 1
		const fallbackId = candidateId || `legacy-activity-${index}`
		const entry = normalizeActivityEntry(activity, fallbackId)
		if ( !entry ) continue
		normalized[entry._id ?? fallbackId] = entry
	}

	return normalized
}

function isSw5ePowerData(item) {
	if ( item?.type !== "spell" ) return false
	const school = item?.system?.school
	const powerCasting = globalThis.CONFIG?.DND5E?.powerCasting ?? {}
	if ( school && Object.values(powerCasting).some(castType => school in (castType?.schools ?? {})) ) return true
	if ( school && !STANDARD_DND5E_SPELL_SCHOOLS.has(school) ) return true

	const consumeTarget = item?.system?.consume?.target
	if ( typeof consumeTarget === "string" && /^powercasting\.(force|tech)\.points\.value$/.test(consumeTarget) ) return true

	const activityTargets = Object.values(item?.system?.activities ?? {}).flatMap(activity => activity?.consumption?.targets ?? [])
	return activityTargets.some(target =>
		target?.type === "attribute" && /^powercasting\.(force|tech)\.points\.value$/.test(target?.target ?? "")
	)
}

function normalizePowerCastingDefaults(item) {
	if ( !isSw5ePowerData(item) ) return false
	item.system ??= {}
	let changed = false

	if ( item.system.method !== "powerCasting" ) {
		item.system.method = "powerCasting"
		changed = true
	}

	if ( item.system.prepared !== true ) {
		item.system.prepared = true
		changed = true
	}

	item.system.preparation ??= {}
	if ( item.system.preparation.prepared !== true ) {
		item.system.preparation.prepared = true
		changed = true
	}

	return changed
}

function hasProperty(properties, key) {
	if ( Array.isArray(properties) ) return properties.includes(key)
	if ( typeof properties?.has === "function" ) return properties.has(key)
	if ( isObjectLike(properties) ) return Boolean(properties[key])
	return false
}

function normalizeActivityDistanceUnits(units) {
	return units === "feet" ? "ft" : units || "ft"
}

function hasItemUsePool(item) {
	const uses = item?.system?.uses ?? {}
	if ( uses.value !== undefined && uses.value !== null ) return true
	if ( uses.max === 0 ) return true
	if ( typeof uses.max === "string" ) return uses.max.trim() !== ""
	return Number.isFinite(Number(uses.max))
}

function getWeaponAttackClassification(item) {
	const actionType = item?.system?.actionType
	if ( actionType === "mwak" ) return "melee"
	if ( actionType === "rwak" ) return "ranged"
	const typeValue = item?.system?.type?.value ?? ""
	if ( typeof typeValue === "string" && /BL$/i.test(typeValue) ) return "ranged"
	const rangeValue = Number(item?.system?.range?.value)
	return Number.isFinite(rangeValue) && rangeValue > 0 ? "ranged" : "melee"
}

function normalizeMissingWeaponAttackActivity(item) {
	if ( item?.type !== "weapon" ) return false
	if ( !hasOwnKeys(item?.system?.activities) ) return false

	const activities = Object.values(item.system.activities)
	const hasAttack = activities.some(activity => activity?.type === "attack")
	if ( hasAttack ) return false

	const hasAltFireModes = hasProperty(item.system?.properties, "burst")
		|| hasProperty(item.system?.properties, "rapid")
		|| activities.some(activity => ["Burst Attack", "Rapid Attack"].includes(activity?.name))
	if ( !hasAltFireModes ) return false

	const classification = getWeaponAttackClassification(item)
	const attackActivity = {
		_id: "sw5e0attack00000",
		activation: {
			type: item.system.activation?.type || "action"
		},
		attack: {
			ability: "",
			bonus: "",
			flat: false,
			type: {
				classification: "weapon",
				value: classification
			}
		},
		damage: {
			critical: {},
			parts: []
		},
		description: {},
		duration: {
			units: item.system.duration?.units || "inst"
		},
		img: null,
		range: {
			override: false,
			units: normalizeActivityDistanceUnits(item.system.range?.units),
			value: item.system.range?.value ?? ""
		},
		target: {
			template: {
				contiguous: false,
				units: "ft",
				type: ""
			},
			affects: {
				choice: false,
				type: ""
			},
			override: false,
			prompt: false
		},
		type: "attack",
		consumption: {
			targets: hasItemUsePool(item)
				? [{ type: "itemUses", target: "", value: "1" }]
				: []
		}
	}

	item.system.activities = {
		[attackActivity._id]: attackActivity,
		...item.system.activities
	}
	return true
}

function getAbilityModifier(actor, abilityId) {
	const ability = actor?.system?.abilities?.[abilityId]
	if ( !isObjectLike(ability) ) return null
	const directMod = Number(ability.mod)
	if ( Number.isFinite(directMod) ) return directMod
	const score = Number(ability.value)
	if ( !Number.isFinite(score) ) return null
	return Math.floor((score - 10) / 2)
}

function normalizeExplosiveSelfConsumption(item) {
	if ( item?.type !== "consumable" ) return false
	if ( item?.system?.type?.value !== "explosive" ) return false

	item.system ??= {}
	item.system.uses ??= {}
	let changed = false

	if ( `${item.system.uses.max ?? ""}`.trim() === "" ) {
		item.system.uses.max = "1"
		changed = true
	}

	if ( item.system.uses.autoDestroy !== true ) {
		item.system.uses.autoDestroy = true
		changed = true
	}

	for ( const activity of Object.values(item.system.activities ?? {}) ) {
		if ( !isObjectLike(activity) ) continue
		activity.consumption ??= {}
		activity.consumption.scaling ??= { allowed: false }
		const targets = activity.consumption.targets
		if ( Array.isArray(targets) && targets.length > 0 ) continue
		activity.consumption.targets = [{ type: "itemUses", target: "", value: "1" }]
		changed = true
	}

	return changed
}

function normalizeClassSuperiorityProgression(item) {
	if ( item?.type !== "class" ) return false
	const identifier = item?.system?.identifier
	if ( !identifier || !["fighter", "scholar"].includes(identifier) ) return false

	const progression = item.system?.spellcasting?.superiorityProgression
	if ( progression && progression !== "none" ) return false

	const expected = identifier === "fighter" ? "half" : "full"
	item.system.spellcasting ??= {}
	item.system.spellcasting.superiorityProgression = expected
	return true
}

function mapLegacySuperiorityProgression(progression) {
	if ( progression === "" || progression === null || progression === undefined ) return null
	if ( progression === 0 || progression === "0" || progression === "none" ) return "none"
	if ( progression === 0.5 || progression === "0.5" || progression === "half" ) return "half"
	if ( progression === 1 || progression === "1" || progression === "full" ) return "full"
	return null
}

function normalizeLegacyClassSuperiorityProgression(item) {
	if ( !["class", "subclass"].includes(item?.type) ) return false

	const current = item.system?.spellcasting?.superiorityProgression
	if ( current && current !== "none" ) return false

	const legacyProgression = item.system?.superiority?.progression
	const mapped = mapLegacySuperiorityProgression(legacyProgression)
	if ( !mapped ) return false

	item.system.spellcasting ??= {}
	item.system.spellcasting.superiorityProgression = mapped
	return true
}

function copyLegacySuperiorityScalar(target, legacyValue, currentValue, { skipZero = false } = {}) {
	if ( legacyValue === undefined || legacyValue === null ) return false
	if ( skipZero && legacyValue === 0 ) return false
	if ( currentValue != null ) return false
	return legacyValue
}

function normalizeLegacyActorSuperiority(actor) {
	if ( !actor?.system ) return false

	const legacySuper = actor.system.attributes?.super
	if ( !isObjectLike(legacySuper) ) return false

	let changed = false
	actor.system.superiority ??= {}
	actor.system.superiority.dice ??= {}
	actor.system.superiority.dice.bonuses ??= {}
	actor.system.superiority.known ??= {}

	const dice = actor.system.superiority.dice
	const legacyMax = copyLegacySuperiorityScalar(dice, legacySuper.dice?.max, dice.max, { skipZero: true })
	if ( legacyMax !== false ) {
		dice.max = legacyMax
		changed = true
	}

	const legacyDie = copyLegacySuperiorityScalar(actor.system.superiority, legacySuper.die, actor.system.superiority.die)
	if ( legacyDie !== false ) {
		actor.system.superiority.die = legacyDie
		changed = true
	}

	const legacyLevel = copyLegacySuperiorityScalar(actor.system.superiority, legacySuper.level, actor.system.superiority.level)
	if ( legacyLevel !== false ) {
		actor.system.superiority.level = legacyLevel
		changed = true
	}

	const legacyKnownMax = copyLegacySuperiorityScalar(actor.system.superiority.known, legacySuper.known?.max, actor.system.superiority.known.max)
	if ( legacyKnownMax !== false ) {
		actor.system.superiority.known.max = legacyKnownMax
		changed = true
	}

	const legacyBonuses = legacySuper.dice?.bonuses
	if ( isObjectLike(legacyBonuses) ) {
		for ( const [key, value] of Object.entries(legacyBonuses) ) {
			if ( value == null ) continue
			if ( dice.bonuses[key] != null ) continue
			dice.bonuses[key] = value
			changed = true
		}
	}

	const legacyValue = legacySuper.dice?.value
	if ( Number.isFinite(Number(legacyValue)) && dice.max == null ) {
		const currentValue = dice.value
		if ( currentValue == null || currentValue === 0 ) {
			dice.value = Number(legacyValue)
			changed = true
		}
	}

	return changed
}

function isLegacyScholarSuperiorityFeature(item) {
	if ( item?.type !== "feat" ) return false
	if ( item?.system?.identifier !== "superiority-dice" ) return false
	if ( item?.system?.requirements === "Scholar" ) return true
	const importerUid = item?.flags?.["sw5e-importer"]?.uid ?? ""
	return importerUid.includes("sourceName-scholar")
}

function normalizeLegacyScholarSuperiorityFeature(item) {
	if ( !isLegacyScholarSuperiorityFeature(item) ) return false

	const activity = Object.values(item.system?.activities ?? {}).find(entry => entry?.type === "utility")
	if ( !activity ) return false

	let changed = false
	activity.roll ??= {}
	if ( activity.roll.formula !== "@scale.scholar.superiority-dice-size.die" ) {
		activity.roll.formula = "@scale.scholar.superiority-dice-size.die"
		changed = true
	}

	activity.consumption ??= {}
	activity.consumption.scaling ??= { allowed: false }
	if ( activity.consumption.spellSlot !== true ) {
		activity.consumption.spellSlot = true
		changed = true
	}

	const expectedTargets = [{ type: "attribute", value: "1", target: "superiority.dice.value" }]
	if ( JSON.stringify(activity.consumption.targets ?? []) !== JSON.stringify(expectedTargets) ) {
		activity.consumption.targets = expectedTargets
		changed = true
	}

	item.system.uses ??= {}
	const expectedRecovery = [{ period: "sr", type: "recoverAll" }]
	if ( JSON.stringify(item.system.uses.recovery ?? []) !== JSON.stringify(expectedRecovery) ) {
		item.system.uses.recovery = expectedRecovery
		changed = true
	}

	return changed
}

function removeTrailingAbilityBonus(formula, abilityMod) {
	if ( !abilityMod || typeof formula !== "string" ) return { formula, changed: false }
	const compact = formula.replace(/\s+/g, "")
	const match = compact.match(/^((?:\d+d\d+)(?:[+-]\d+d\d+)*)\+(\d+)$/i)
	if ( !match ) return { formula, changed: false }
	if ( Number(match[2]) !== abilityMod ) return { formula, changed: false }
	return { formula: match[1], changed: true }
}

function normalizeDamagePartsAbilityBonus(parts, abilityMod) {
	if ( !Array.isArray(parts) || !abilityMod ) return false
	let changed = false

	for ( const part of parts ) {
		if ( Array.isArray(part) && typeof part[0] === "string" ) {
			const normalized = removeTrailingAbilityBonus(part[0], abilityMod)
			if ( normalized.changed ) {
				part[0] = normalized.formula
				changed = true
			}
			continue
		}

		if ( !isObjectLike(part) ) continue
		const numericBonus = Number(part.bonus)
		if ( Number.isFinite(numericBonus) && numericBonus === abilityMod ) {
			part.bonus = ""
			changed = true
		}
	}

	return changed
}

function normalizeNpcEmbeddedWeaponDamage(actor) {
	if ( actor?.type !== "npc" ) return false
	if ( !Array.isArray(actor?.items) || !actor.items.length ) return false

	let changed = false
	for ( const item of actor.items ) {
		if ( item?.type !== "weapon" ) continue
		const abilityId = item?.system?.ability
		const abilityMod = getAbilityModifier(actor, abilityId)
		if ( !Number.isFinite(abilityMod) || abilityMod <= 0 ) continue

		changed = normalizeDamagePartsAbilityBonus(item.system?.damage?.parts, abilityMod) || changed
		for ( const activity of Object.values(item.system?.activities ?? {}) ) {
			changed = normalizeDamagePartsAbilityBonus(activity?.damage?.parts, abilityMod) || changed
		}
	}

	return changed
}

function activityHasMeasuredTemplate(activity) {
	const template = activity?.target?.template
	if ( template === true ) return true
	if ( isObjectLike(template) ) {
		const templateType = template.type
		if ( typeof templateType === "string" && templateType && (templateType in (globalThis.CONFIG?.DND5E?.areaTargetTypes ?? {})) ) return true
		const templateSize = Number(template.size ?? template.value)
		if ( Number.isFinite(templateSize) && (templateSize > 0) ) return true
		const templateWidth = Number(template.width)
		if ( Number.isFinite(templateWidth) && (templateWidth > 0) ) return true
	}
	if ( activity?.target?.affects?.type === "area" ) return true
	return false
}

function normalizeLegacyWeaponPromptDefaults(item) {
	if ( item?.type !== "weapon" ) return false
	if ( !hasOwnKeys(item?.system?.activities) ) return false
	if ( Object.values(item.system.activities).some(activityHasMeasuredTemplate) ) return false
	if ( !isObjectLike(item.system.target) || item.system.target.prompt !== true ) return false
	item.system.target.prompt = false
	return true
}

function normalizeLegacyManeuverPromptDefaults(item) {
	if ( !isManeuverItem(item) ) return false
	if ( !hasOwnKeys(item?.system?.activities) ) return false
	if ( Object.values(item.system.activities).some(activityHasMeasuredTemplate) ) return false
	if ( !isObjectLike(item.system.target) || item.system.target.prompt !== true ) return false
	item.system.target.prompt = false
	return true
}

function normalizeLegacyManeuverSourceClass(item) {
	if ( !isManeuverItem(item) ) return false
	if ( !item?.system || !("sourceClass" in item.system) ) return false

	const current = item.system.sourceClass
	let normalized = current

	if ( current === "[object Object]" ) normalized = ""
	else if ( isObjectLike(current) ) normalized = current.system?.identifier ?? current.identifier ?? current.value ?? ""
	else if ( (current !== undefined) && (current !== null) && (typeof current !== "string") ) normalized = ""

	if ( (normalized === undefined) || (normalized === null) ) normalized = ""
	if ( typeof normalized !== "string" ) normalized = ""
	if ( normalized === current ) return false

	item.system.sourceClass = normalized
	return true
}

function normalizeLegacyToolShape(item) {
	if ( item?.type !== "tool" ) return false
	item.system ??= {}

	let changed = false
	const sourceType = item.system.type
	const toolType = TOOL_TYPE_VALUE_MAP[sourceType?.value ?? item.system.toolType]
	const baseItem = sourceType?.baseItem ?? item.system.baseItem

	if ( toolType && item.system.toolType !== toolType ) {
		item.system.toolType = toolType
		changed = true
	}

	if ( typeof baseItem === "string" && baseItem && item.system.baseItem !== baseItem ) {
		item.system.baseItem = baseItem
		changed = true
	}

	return changed
}

function normalizeSystemStats(data, { targetSystemVersion=TARGET_DND5E_VERSION }={}) {
	if ( !isObjectLike(data?._stats) ) return false
	let changed = false
	if ( data._stats.systemId === "sw5e" ) {
		data._stats.systemId = "dnd5e"
		changed = true
	}
	if ( data._stats.systemId === "dnd5e" && data._stats.systemVersion !== targetSystemVersion ) {
		data._stats.systemVersion = targetSystemVersion
		changed = true
	}
	return changed
}

export function normalizeLegacyItemActivities(item) {
	if ( !item?.system || !("activities" in item.system) ) return false

	const activities = item.system.activities
	if ( activities === undefined ) return false

	if ( Array.isArray(activities) ) {
		const normalized = normalizeActivitiesToObject(
			activities.map((activity, index) => [activity?._id ?? `legacy-activity-${index + 1}`, activity])
		)
		item.system.activities = normalized
		return true
	}

	if ( !isObjectLike(activities) ) return false

	const normalized = normalizeActivitiesToObject(Object.entries(activities))
	const changed = JSON.stringify(activities) !== JSON.stringify(normalized)
	item.system.activities = normalized
	return changed
}

function normalizeScaleValue(scaleValue, scaleType) {
	if ( !isObjectLike(scaleValue) ) return false

	let changed = false
	if ( scaleType === "dice" ) {
		const number = Number(scaleValue.number ?? scaleValue.n)
		const faces = Number(scaleValue.faces ?? scaleValue.die)

		if ( Number.isFinite(number) && (scaleValue.number === undefined) ) {
			scaleValue.number = number
			changed = true
		}
		if ( Number.isFinite(number) && (scaleValue.n === undefined) ) {
			scaleValue.n = number
			changed = true
		}
		if ( Number.isFinite(faces) && (scaleValue.faces === undefined) ) {
			scaleValue.faces = faces
			changed = true
		}
		if ( Number.isFinite(faces) && (scaleValue.die === undefined) ) {
			scaleValue.die = faces
			changed = true
		}
	} else if ( scaleType === "number" ) {
		const value = Number(scaleValue.value ?? scaleValue.number ?? scaleValue.n)
		if ( Number.isFinite(value) && (scaleValue.value === undefined) ) {
			scaleValue.value = value
			changed = true
		}
	}

	return changed
}

/**
 * Normalize Item `system.advancement` to DND5e v5.3.3 object-native storage.
 *
 * Q-02 / D53-ADV-001: Do not force objects back into arrays. Accept legacy arrays
 * as a transition input and convert toward `{ [advancement._id]: advancement }`
 * matching DND5e AdvancementTemplate.#migrateStorage.
 *
 * @param {object} item  Plain Item source object
 * @returns {boolean} Whether the source was mutated
 */
export function normalizeLegacyItemAdvancement(item) {
	if ( !item?.system || !("advancement" in item.system) ) return false

	const rawAdvancement = item.system.advancement
	if ( rawAdvancement === undefined || rawAdvancement === null ) return false

	let changed = false
	let advancement = rawAdvancement

	// Legacy array → object-native (DND5e v5.3.3 #migrateStorage)
	if ( Array.isArray(rawAdvancement) ) {
		const asObject = {}
		for ( const entry of rawAdvancement ) {
			if ( !isObjectLike(entry) ) continue

			// Preserve existing Advancement IDs, but generate a Foundry ID for
			// legacy SW5E entries which do not have one. Object-native DND5e
			// storage is keyed by the same ID stored in advancement._id.
			let advancementId = (typeof entry._id === "string" && entry._id)
				? entry._id
				: foundry.utils.randomID()

			// Prevent an accidental overwrite if malformed legacy data contains
			// duplicate Advancement IDs.
			while ( asObject[advancementId] ) advancementId = foundry.utils.randomID()

			entry._id = advancementId
			asObject[advancementId] = entry
		}
		item.system.advancement = asObject
		advancement = asObject
		changed = true
	} else if ( !isObjectLike(rawAdvancement) ) {
		return false
	}

	// Object-native path: drop non-object values without converting the map to an array.
	const cleaned = {}
	let removedNonObject = false
	for ( const [key, entry] of Object.entries(advancement) ) {
		if ( !isObjectLike(entry) ) {
			removedNonObject = true
			continue
		}
		cleaned[key] = entry
	}
	if ( removedNonObject ) {
		item.system.advancement = cleaned
		advancement = cleaned
		changed = true
	}

	for ( const adv of Object.values(advancement) ) {
		if ( !isObjectLike(adv) ) continue
		if ( !isObjectLike(adv.configuration) ) {
			adv.configuration = {}
			changed = true
		}
		if ( adv.value === undefined ) {
			adv.value = {}
			changed = true
		}

		const scale = adv.configuration.scale
		if ( !isObjectLike(scale) ) continue
		for ( const value of Object.values(scale) ) {
			changed = normalizeScaleValue(value, adv.configuration.type) || changed
		}
	}

	return changed
}

export function normalizeDnd5eItemSource(item, { targetSystemVersion=TARGET_DND5E_VERSION }={}) {
	if ( !item?.system ) return false

	let changed = false
	changed = normalizeLegacyItemActivities(item) || changed
	changed = normalizeLegacyItemAdvancement(item) || changed
	changed = normalizeLegacyToolShape(item) || changed
	changed = normalizeLegacyWeaponPromptDefaults(item) || changed
	changed = normalizeLegacyManeuverPromptDefaults(item) || changed
	changed = normalizeLegacyManeuverSourceClass(item) || changed
	changed = normalizePowerCastingDefaults(item) || changed
	changed = normalizeMissingWeaponAttackActivity(item) || changed
	changed = normalizeExplosiveSelfConsumption(item) || changed
	changed = normalizeLegacyClassSuperiorityProgression(item) || changed
	changed = normalizeClassSuperiorityProgression(item) || changed
	changed = normalizeLegacyScholarSuperiorityFeature(item) || changed

	if ( changed ) changed = normalizeSystemStats(item, { targetSystemVersion }) || changed

	return changed
}

export function normalizeEmbeddedDnd5eItemSources(items=[]) {
	let changed = false
	for ( const item of items ) changed = normalizeDnd5eItemSource(item) || changed
	return changed
}

export function normalizeLegacyMasterItemSource(item) {
	if ( !item || (typeof item !== "object") ) return false

	let changed = false
	changed = normalizeSystemStats(item) || changed

	if ( typeof item.type === "string" ) {
		const normalizedType = item.type.split(".").at(-1) ?? item.type
		const remappedType = LEGACY_ITEM_TYPE_REMAPS[normalizedType]
		const legacyFeatLike = LEGACY_FEAT_LIKE_ITEM_TYPES[normalizedType]
		if ( remappedType && remappedType !== item.type ) {
			item.type = remappedType
			changed = true
		} else if ( legacyFeatLike ) {
			item.type = "feat"
			item.system ??= {}
			item.system.description ??= { value: "", chat: "" }
			item.system.source ??= {}
			item.system.advancement ??= {}
			item.system.type ??= {}
			item.system.type.value = legacyFeatLike.value
			item.system.type.subtype = legacyFeatLike.subtype ?? ""
			changed = true
		} else if ( ["maneuver", "sw5e.maneuver"].includes(item.type) || normalizedType === "maneuver" ) {
			item.type = "sw5e-module.maneuver"
			changed = true
		}
	}

	if ( item.system?.price !== undefined && !isObjectLike(item.system.price) ) {
		const numericPrice = Number(item.system.price)
		item.system.price = {
			value: Number.isFinite(numericPrice) ? numericPrice : 0,
			denomination: normalizeSwPriceDenomination(undefined)
		}
		changed = true
	}
	if ( item.system?.price?.denomination !== undefined ) {
		const normalizedDenomination = normalizeSwPriceDenomination(item.system.price.denomination);
		if ( normalizedDenomination !== item.system.price.denomination ) {
			item.system.price.denomination = normalizedDenomination
			changed = true
		}
	}
	if ( item.system?.price && (item.system.price.denomination === undefined) ) {
		item.system.price.denomination = normalizeSwPriceDenomination(undefined)
		changed = true
	}
	if ( item.system?.save?.scaling === "power" ) {
		item.system.save.scaling = "spell"
		changed = true
	}
	if ( Array.isArray(item.changes) ) {
		for ( const change of item.changes ) {
			if ( change?.key !== "system.traits.languages.value" ) continue
			if ( change.value === "basic" ) {
				change.value = "common"
				changed = true
			}
		}
	}

	return changed
}

export function normalizeEmbeddedLegacyMasterItemSources(items=[]) {
	let changed = false
	for ( const item of items ) changed = normalizeLegacyMasterItemSource(item) || changed
	return changed
}

export function normalizeLegacyMasterActorSource(actor) {
	if ( !actor || (typeof actor !== "object") ) return false

	let changed = false
	changed = normalizeSystemStats(actor) || changed

	const details = actor.system?.details
	if ( isObjectLike(details) ) {
		for ( const key of ["background", "species", "originalClass"] ) {
			const value = details[key]
			if ( !isObjectLike(value) ) continue
			const id = value._id ?? value.id ?? value.uuid ?? null
			if ( !id ) continue
			details[key] = id
			changed = true
		}
	}

	const currency = actor.system?.currency
	if ( isObjectLike(currency) ) {
		const normalizedCurrency = normalizeSwCurrencyWallet(currency)
		if ( JSON.stringify(normalizedCurrency) !== JSON.stringify(currency) ) {
			actor.system.currency = normalizedCurrency
			changed = true
		}
	}

	changed = normalizeNpcEmbeddedWeaponDamage(actor) || changed
	changed = normalizeLegacyActorSuperiority(actor) || changed

	return changed
}
