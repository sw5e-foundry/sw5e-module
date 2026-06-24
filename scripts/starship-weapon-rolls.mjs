import { getDerivedStarshipRuntime } from "./starship-data.mjs";
import { isSw5eStarshipActor } from "./patch/starship-movement.mjs";

const STARSHIP_WEAPON_TYPE_PATTERN = /\(starship\)/i;

/**
 * @param {Item5e|object|null|undefined} item
 * @returns {boolean}
 */
export function isStarshipWeaponItem(item) {
	if ( item?.type !== "weapon" ) return false;
	const typeValue = item.system?.type?.value ?? "";
	if ( STARSHIP_WEAPON_TYPE_PATTERN.test(typeValue) ) return true;
	const starshipTypes = CONFIG.SW5E?.weaponStarshipTypes ?? CONFIG.DND5E?.weaponStarshipTypes;
	if ( starshipTypes && typeValue in starshipTypes ) return true;
	const pack = item?.pack ?? "";
	if ( /(?:^|\.)starshipweapons$/i.test(pack) ) return true;
	return false;
}

/**
 * @param {Item5e|object|null|undefined} item
 * @returns {boolean}
 */
export function shouldUseStarshipWisAttackAbility(item) {
	if ( !isStarshipWeaponItem(item) ) return false;
	const systemAbility = item.system?.ability;
	if ( systemAbility && systemAbility !== "none" ) return false;

	const activities = item.system?.activities;
	if ( !activities?.size ) return true;

	for ( const activity of activities ) {
		if ( activity.type !== "attack" ) continue;
		const attackAbility = activity.attack?.ability ?? "";
		if ( attackAbility && attackAbility !== "none" ) return false;
	}
	return true;
}

/**
 * @param {Actor5e|object|null|undefined} actor
 * @returns {number}
 */
export function getStarshipWisdomModifier(actor) {
	const wisdomMod = Number(actor?.system?.abilities?.wis?.mod);
	return Number.isFinite(wisdomMod) ? wisdomMod : 0;
}

/**
 * @param {object} rollConfig
 * @param {number} mod
 */
export function applyStarshipWeaponWisModifierToRollConfig(rollConfig, mod) {
	for ( const roll of rollConfig?.rolls ?? [] ) {
		roll.data ??= {};
		roll.data.mod = mod;
		roll.data.abilities ??= {};
		roll.data.abilities.wis ??= {};
		roll.data.abilities.wis.mod = mod;
	}
	if ( rollConfig?.data ) rollConfig.data.mod = mod;
}

/**
 * Preserve legacy sheet behavior: ×2 on formula parts; ×0.5 uses Math.floor on each part.
 * @param {string} part
 * @param {number} multiplier
 * @returns {string}
 */
export function scaleStarshipWeaponDamageFormulaPart(part, multiplier) {
	const formula = String(part ?? "").trim();
	if ( !formula ) return formula;
	if ( multiplier === 2 ) return `(${formula}) * 2`;
	if ( multiplier === 0.5 ) return `floor((${formula}) / 2)`;
	return formula;
}

/**
 * @param {object} rollConfig
 * @param {number} multiplier
 */
export function applyStarshipWeaponRoutingToDamageRollConfig(rollConfig, multiplier) {
	if ( multiplier === 1 ) return;
	for ( const roll of rollConfig?.rolls ?? [] ) {
		roll.parts = (roll.parts ?? []).map(part => scaleStarshipWeaponDamageFormulaPart(part, multiplier));
	}
}

/**
 * @param {object} config
 * @returns {Item5e|null}
 */
function resolveRollConfigItem(config) {
	const subject = config?.subject;
	if ( !subject ) return null;
	if ( subject.documentName === "Item" ) return subject;
	const item = subject.item ?? subject.parent;
	if ( item?.documentName === "Item" ) return item;
	return null;
}

/**
 * @param {object} config
 * @returns {Actor5e|null}
 */
function resolveRollConfigActor(config) {
	const subject = config?.subject;
	if ( !subject ) return null;
	if ( subject.documentName === "Actor" ) return subject;
	if ( subject.actor?.documentName === "Actor" ) return subject.actor;
	const item = resolveRollConfigItem(config);
	return item?.actor ?? null;
}

function isAttackRollConfig(config) {
	return (config?.hookNames ?? []).some(name => /^attack$/i.test(name));
}

function isDamageRollConfig(config) {
	return (config?.hookNames ?? []).some(name => /^damage$/i.test(name));
}

function isHealDamageRollConfig(config) {
	return config?.subject?.type === "heal";
}

function onStarshipWeaponPreRollAttack(config) {
	if ( !isAttackRollConfig(config) ) return;
	const item = resolveRollConfigItem(config);
	const actor = resolveRollConfigActor(config);
	if ( !item || !actor || !isSw5eStarshipActor(actor) ) return;
	if ( !shouldUseStarshipWisAttackAbility(item) ) return;
	applyStarshipWeaponWisModifierToRollConfig(config, getStarshipWisdomModifier(actor));
}

function onStarshipWeaponPreRollDamage(config) {
	if ( !isDamageRollConfig(config) ) return;
	if ( config?.sw5eStarshipWeaponRoutingApplied ) return;

	const item = resolveRollConfigItem(config);
	const actor = resolveRollConfigActor(config);
	if ( !item || !actor || !isSw5eStarshipActor(actor) ) return;
	if ( !isStarshipWeaponItem(item) ) return;
	if ( isHealDamageRollConfig(config) ) return;

	const multiplier = getDerivedStarshipRuntime(actor).routing?.weaponsMultiplier ?? 1;
	if ( multiplier === 1 ) return;

	if ( shouldUseStarshipWisAttackAbility(item) ) {
		applyStarshipWeaponWisModifierToRollConfig(config, getStarshipWisdomModifier(actor));
	}
	applyStarshipWeaponRoutingToDamageRollConfig(config, multiplier);
	config.sw5eStarshipWeaponRoutingApplied = true;
}

/** Register global Starship weapon attack/damage parity hooks. */
export function registerStarshipWeaponRollHooks() {
	Hooks.on("dnd5e.preRollAttack", onStarshipWeaponPreRollAttack);
	Hooks.on("dnd5e.preRollDamage", onStarshipWeaponPreRollDamage);
}
