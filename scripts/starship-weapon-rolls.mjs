import {
	applyStarshipAttackCrewPbInjection,
	clearStarshipAttackFiringCrewState,
	createStarshipAttackInvocationId,
	getDerivedStarshipRuntime,
	prepareStarshipAttackFiringCrew,
	publicChatExcludesResponsibleCrewIdentity,
	storeStarshipAttackFiringCrewState,
	STARSHIP_ATTACK_FIRING_CREW_PB_KEY,
	STARSHIP_ATTACK_FIRING_CREW_PREPARED_KEY,
	STARSHIP_ATTACK_FIRING_CREW_UUID_KEY,
	STARSHIP_ATTACK_INVOCATION_ID_KEY
} from "./starship-data.mjs";
import { getModuleId } from "./module-support.mjs";
import { isSw5eStarshipActor } from "./patch/starship-movement.mjs";

const STARSHIP_WEAPON_TYPE_PATTERN = /\(starship\)/i;
const STARSHIP_LAUNCHER_TYPE_VALUES = new Set(["tertiary (starship)", "quaternary (starship)"]);
const STARSHIP_AMMO_PAYLOAD_SUBTYPES = new Set(["ssmissile", "sstorpedo"]);
const PLACEHOLDER_LAUNCHER_DAMAGE_PATTERN = /^0d0(?:\s*\+\s*@mod)?$/i;
const STARSHIP_ATTACK_ROLL_CONFIG_CLASS = "sw5e-starship-attack-roll-config";

function getItemDamageFormulaParts(item) {
	return (item?.system?.damage?.parts ?? [])
		.map(part => Array.isArray(part) ? String(part[0] ?? "").trim() : "")
		.filter(Boolean);
}

function hasRealDamageParts(item) {
	const formulas = getItemDamageFormulaParts(item);
	if ( !formulas.length ) return false;
	return formulas.some(formula => !PLACEHOLDER_LAUNCHER_DAMAGE_PATTERN.test(formula));
}

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
 * Direct-hit starship ordnance payloads stay on ammo items, not launcher shells.
 * This pilot supports missile/torpedo ammo only; bombs, mines, and cluster payloads remain deferred.
 * @param {Item5e|object|null|undefined} item
 * @returns {boolean}
 */
export function isStarshipAmmoPayloadItem(item) {
	if ( item?.type !== "consumable" ) return false;
	if ( item.system?.type?.value !== "ammo" ) return false;
	const subtype = item.system?.type?.subtype ?? "";
	if ( !STARSHIP_AMMO_PAYLOAD_SUBTYPES.has(subtype) ) return false;
	if ( (item.system?.actionType ?? "") !== "rwak" ) return false;
	return hasRealDamageParts(item);
}

/**
 * Launcher shells are separate gating items that own compatibility/reload state rather than the real payload roll data.
 * @param {Item5e|object|null|undefined} item
 * @returns {boolean}
 */
export function isStarshipLauncherShellItem(item) {
	if ( item?.type !== "weapon" ) return false;
	if ( !STARSHIP_LAUNCHER_TYPE_VALUES.has(item.system?.type?.value ?? "") ) return false;
	if ( (item.system?.actionType ?? "") !== "" ) return false;
	const ammoTypes = item.system?.ammo?.types;
	if ( !Array.isArray(ammoTypes) || !ammoTypes.length ) return false;
	const formulas = getItemDamageFormulaParts(item);
	return !formulas.length || formulas.every(formula => PLACEHOLDER_LAUNCHER_DAMAGE_PATTERN.test(formula));
}

/**
 * @param {Item5e|object|null|undefined} launcher
 * @param {string|null|undefined} subtype
 * @returns {boolean}
 */
export function launcherAcceptsStarshipAmmoSubtype(launcher, subtype) {
	if ( !isStarshipLauncherShellItem(launcher) ) return false;
	if ( typeof subtype !== "string" || !subtype ) return false;
	return Array.isArray(launcher.system?.ammo?.types) && launcher.system.ammo.types.includes(subtype);
}

/**
 * Pure resolver for future launcher-selected payload workflows. No UI or consumption side effects.
 * @param {Item5e|object|null|undefined} launcher
 * @param {Actor5e|object|null|undefined} actor
 * @returns {Array<Item5e|object>}
 */
export function getCompatibleStarshipLauncherAmmoItems(launcher, actor = launcher?.actor) {
	if ( !isStarshipLauncherShellItem(launcher) ) return [];
	const items = actor?.items?.contents
		?? Array.from(actor?.items?.values?.() ?? actor?.items ?? []);
	return items.filter(item => isStarshipAmmoPayloadItem(item)
		&& launcherAcceptsStarshipAmmoSubtype(launcher, item.system?.type?.subtype));
}

/**
 * @param {Item5e|object|null|undefined} item
 * @returns {boolean}
 */
export function isStarshipAttackPayloadItem(item) {
	return isStarshipWeaponItem(item) || isStarshipAmmoPayloadItem(item);
}

/**
 * @param {Item5e|object|null|undefined} item
 * @returns {boolean}
 */
export function shouldUseStarshipWisAttackAbility(item) {
	if ( !isStarshipAttackPayloadItem(item) ) return false;
	const systemAbility = item.system?.ability;
	if ( systemAbility && systemAbility !== "none" ) return false;

	const activities = item.system?.activities;
	if ( !activities?.size ) return true;

	let hasAttackActivity = false;
	for ( const activity of activities ) {
		if ( activity.type !== "attack" ) continue;
		hasAttackActivity = true;
		const attackAbility = activity.attack?.ability ?? "";
		if ( attackAbility && attackAbility !== "none" ) return false;
	}
	return hasAttackActivity;
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

/**
 * Keep Attack Roll dialogs in a usable vertical band (stock uses clientY-80, often near top).
 * @param {Event|null|undefined} event
 * @returns {{ top: number, left: number }}
 */
export function resolveStarshipAttackRollDialogPosition(event=null) {
	const viewH = Number(globalThis.window?.innerHeight) || 800;
	const viewW = Number(globalThis.window?.innerWidth) || 1200;
	const clientY = Number(event?.clientY);
	const rawTop = Number.isFinite(clientY) ? clientY - 80 : Math.round(viewH * 0.2);
	const top = Math.max(48, Math.min(rawTop, Math.max(48, viewH - 360)));
	const left = Math.max(48, viewW - 710);
	return { top, left };
}

function onStarshipWeaponPreRollAttack(config) {
	if ( !isAttackRollConfig(config) ) return;
	const item = resolveRollConfigItem(config);
	const actor = resolveRollConfigActor(config);
	if ( !item || !actor || !isSw5eStarshipActor(actor) ) return;
	if ( !shouldUseStarshipWisAttackAbility(item) ) return;
	applyStarshipWeaponWisModifierToRollConfig(config, getStarshipWisdomModifier(actor));
}

/**
 * After stock attack parts are built, inject firing-crew PB once when classified safe.
 * @param {object} processConfig
 * @param {object} rollConfig
 */
function onStarshipWeaponPostBuildAttackRollConfig(processConfig, rollConfig) {
	if ( !processConfig || !rollConfig ) return;
	if ( !(processConfig.hookNames ?? []).some(name => /^attack$/i.test(String(name ?? ""))) ) return;
	const item = resolveRollConfigItem(processConfig);
	const actor = resolveRollConfigActor(processConfig);
	if ( !item || !actor || !isSw5eStarshipActor(actor) ) return;
	if ( !isStarshipAttackPayloadItem(item) ) return;
	applyStarshipAttackCrewPbInjection(processConfig, rollConfig);
}

/**
 * Assert public attack chat metadata does not expose the firing crew identity.
 * @param {object} messageConfig
 * @param {{ name?: string, uuid?: string }} identity
 */
function auditStarshipAttackPublicChat(messageConfig, identity) {
	const data = messageConfig?.data ?? {};
	if ( publicChatExcludesResponsibleCrewIdentity(data, identity) ) return;
	console.warn("SW5E MODULE | Starship attack public chat leaked firing-crew identity; stripping flavor/flags identity is not applied automatically.", {
		identity,
		flavor: data.flavor,
		flags: data.flags
	});
}

/**
 * Await firing-crew resolution before stock AttackActivity.rollAttack continues.
 * @this {AttackActivity}
 * @param {Function} wrapped
 * @param {object} [config]
 * @param {object} [dialog]
 * @param {object} [message]
 */
async function wrapStarshipAttackActivityRollAttack(wrapped, config={}, dialog={}, message={}) {
	const item = this?.item;
	const actor = this?.actor;
	if ( !item || !actor || !isSw5eStarshipActor(actor) || !isStarshipAttackPayloadItem(item) ) {
		return wrapped(config, dialog, message);
	}
	if ( config?.[STARSHIP_ATTACK_FIRING_CREW_PREPARED_KEY] ) {
		return wrapped(config, dialog, message);
	}

	const invocationId = createStarshipAttackInvocationId();
	let prep;
	try {
		prep = await prepareStarshipAttackFiringCrew({
			starshipActor: actor,
			event: config?.event ?? null,
			user: globalThis.game?.user,
			explicitActor: config?.sw5eAttackExplicitActor ?? null
		});
	} catch ( err ) {
		clearStarshipAttackFiringCrewState(invocationId);
		console.error("SW5E MODULE | Starship attack firing-crew preparation failed.", err);
		throw err;
	}

	if ( prep.cancelled ) {
		clearStarshipAttackFiringCrewState(invocationId);
		return null;
	}

	storeStarshipAttackFiringCrewState(invocationId, {
		actorUuid: prep.explicitActor?.uuid ?? "",
		proficiencyBonus: prep.proficiencyBonus,
		source: prep.source,
		selectionMode: prep.selectionMode
	});

	const nextConfig = foundry.utils.mergeObject({}, config, { inplace: false });
	nextConfig[STARSHIP_ATTACK_FIRING_CREW_PREPARED_KEY] = true;
	nextConfig[STARSHIP_ATTACK_INVOCATION_ID_KEY] = invocationId;
	nextConfig[STARSHIP_ATTACK_FIRING_CREW_UUID_KEY] = prep.explicitActor?.uuid ?? "";
	nextConfig[STARSHIP_ATTACK_FIRING_CREW_PB_KEY] = Number.isFinite(Number(prep.proficiencyBonus))
		? Number(prep.proficiencyBonus)
		: 0;

	const position = resolveStarshipAttackRollDialogPosition(config?.event);
	const nextDialog = foundry.utils.mergeObject({}, dialog, { inplace: false });
	nextDialog.options = foundry.utils.mergeObject({}, nextDialog.options ?? {}, { inplace: false });
	const existingClasses = Array.isArray(nextDialog.options.classes)
		? nextDialog.options.classes
		: (typeof nextDialog.options.classes === "string" ? [nextDialog.options.classes] : []);
	nextDialog.options.classes = Array.from(new Set([...existingClasses, STARSHIP_ATTACK_ROLL_CONFIG_CLASS]));
	nextDialog.options.position = foundry.utils.mergeObject(
		{},
		nextDialog.options.position ?? {},
		{ inplace: false }
	);
	nextDialog.options.position.top = position.top;
	nextDialog.options.position.left = position.left;

	const identity = {
		name: prep.explicitActor?.name ?? "",
		uuid: prep.explicitActor?.uuid ?? ""
	};
	const nextMessage = foundry.utils.mergeObject({}, message, { inplace: false });
	auditStarshipAttackPublicChat(nextMessage, identity);

	try {
		const rolls = await wrapped(nextConfig, nextDialog, nextMessage);
		if ( rolls?.length && nextMessage?.data ) {
			auditStarshipAttackPublicChat(nextMessage, identity);
		}
		return rolls;
	} finally {
		clearStarshipAttackFiringCrewState(invocationId);
	}
}

/** Module-local guard: set only after successful libWrapper.register. */
let starshipAttackRollWrapperRegistered = false;

const STARSHIP_ATTACK_ROLL_ATTACK_TARGET = "dnd5e.documents.activity.AttackActivity.prototype.rollAttack";

/**
 * Register firing-crew WRAPPER using the same lifecycle as working AttackActivity
 * wraps (power-bonuses `getAttackData`: init-time `libWrapper.register`, no
 * `libWrapper.ready` gate, no late `libWrapper.Ready` once-listener).
 *
 * If init runs before `AttackActivity.prototype.rollAttack` is callable, retry
 * once on Foundry `ready` (not libWrapper.Ready). Guard stays false until
 * `libWrapper.register` succeeds.
 */
function registerStarshipAttackCrewPbRollAttackWrapper() {
	if ( starshipAttackRollWrapperRegistered ) return;

	if ( typeof globalThis.libWrapper?.register !== "function" ) {
		console.warn("SW5E MODULE | libWrapper not available; starship attack firing-crew wrapper not registered.");
		return;
	}

	const rollAttack = globalThis.dnd5e?.documents?.activity?.AttackActivity?.prototype?.rollAttack;
	if ( typeof rollAttack !== "function" ) {
		console.warn("SW5E MODULE | AttackActivity.prototype.rollAttack unavailable; starship attack firing-crew wrapper not registered.");
		return;
	}

	try {
		libWrapper.register(
			getModuleId(),
			STARSHIP_ATTACK_ROLL_ATTACK_TARGET,
			wrapStarshipAttackActivityRollAttack,
			"WRAPPER"
		);
		starshipAttackRollWrapperRegistered = true;
	} catch ( err ) {
		console.warn("SW5E MODULE | Failed to register starship attack firing-crew rollAttack wrapper.", err);
	}
}

/**
 * Ensure registration: try immediately (init), then one Foundry `ready` retry if
 * needed. If `ready` already fired (hot reload / late call), retry immediately —
 * do not subscribe late to an event that will never fire again.
 */
function ensureStarshipAttackCrewPbRollAttackWrapper() {
	registerStarshipAttackCrewPbRollAttackWrapper();
	if ( starshipAttackRollWrapperRegistered ) return;
	const retry = () => registerStarshipAttackCrewPbRollAttackWrapper();
	if ( globalThis.game?.ready ) retry();
	else Hooks.once("ready", retry);
}

function onStarshipWeaponPreRollDamage(config) {
	if ( !isDamageRollConfig(config) ) return;
	if ( config?.sw5eStarshipWeaponRoutingApplied ) return;

	const item = resolveRollConfigItem(config);
	const actor = resolveRollConfigActor(config);
	if ( !item || !actor || !isSw5eStarshipActor(actor) ) return;
	if ( !isStarshipAttackPayloadItem(item) ) return;
	if ( isHealDamageRollConfig(config) ) return;

	const multiplier = getDerivedStarshipRuntime(actor).routing?.weaponsMultiplier ?? 1;
	if ( shouldUseStarshipWisAttackAbility(item) ) {
		applyStarshipWeaponWisModifierToRollConfig(config, getStarshipWisdomModifier(actor));
	}
	if ( multiplier === 1 ) return;

	applyStarshipWeaponRoutingToDamageRollConfig(config, multiplier);
	config.sw5eStarshipWeaponRoutingApplied = true;
}

/** Register global Starship weapon attack/damage parity hooks. */
export function registerStarshipWeaponRollHooks() {
	Hooks.on("dnd5e.preRollAttack", onStarshipWeaponPreRollAttack);
	Hooks.on("dnd5e.postBuildAttackRollConfig", onStarshipWeaponPostBuildAttackRollConfig);
	Hooks.on("dnd5e.preRollDamage", onStarshipWeaponPreRollDamage);
	ensureStarshipAttackCrewPbRollAttackWrapper();
}
