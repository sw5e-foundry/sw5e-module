import { getModuleId, SETTINGS_NAMESPACE } from "./module-support.mjs";
import { isSw5eStarshipActor } from "./patch/starship-movement.mjs";

/** World setting: automate SW5e flat Damage Reduction on starships. */
export const STARSHIP_FLAT_DR_SETTING = "starshipFlatDamageReduction";

/** Active Effect / flag path for equipment-derived starship flat DR. */
export const STARSHIP_FLAT_DR_FLAG_PATH = "flags.sw5e.flatDamageReduction";

/** Sidebar-editable manual override (takes precedence over equipment AE DR). */
export const STARSHIP_FLAT_DR_MANUAL_FLAG_PATH = "flags.sw5e.flatDamageReductionManual";

/**
 * @param {Actor} actor
 * @returns {number|null} Manual override, or null when unset.
 */
export function getStarshipFlatDamageReductionManual(actor) {
	const raw = foundry.utils.getProperty(actor, STARSHIP_FLAT_DR_MANUAL_FLAG_PATH)
		?? foundry.utils.getProperty(actor?._source, STARSHIP_FLAT_DR_MANUAL_FLAG_PATH)
		?? foundry.utils.getProperty(actor, "flags.sw5e.flatDamageReductionManual")
		?? foundry.utils.getProperty(actor?._source, "flags.sw5e.flatDamageReductionManual");
	if ( raw === null || raw === undefined || raw === "" ) return null;
	const value = Number(raw);
	return Number.isFinite(value) ? Math.max(0, value) : null;
}

/**
 * Equipment / Active Effect DR only (ignores sidebar manual override).
 * @param {Actor} actor
 * @returns {number}
 */
export function getStarshipEquipmentFlatDamageReduction(actor) {
	const raw = foundry.utils.getProperty(actor, STARSHIP_FLAT_DR_FLAG_PATH)
		?? foundry.utils.getProperty(actor, "flags.sw5e.flatDamageReduction");
	const value = Number(raw);
	return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Effective flat DR used by damage application and sidebar display.
 * @param {Actor} actor
 * @returns {number}
 */
export function getStarshipFlatDamageReduction(actor) {
	const manual = getStarshipFlatDamageReductionManual(actor);
	if ( manual !== null ) return manual;
	return getStarshipEquipmentFlatDamageReduction(actor);
}

/**
 * Persist or clear the sidebar manual DR override.
 * @param {Actor} actor
 * @param {number|null|undefined} value Finite number to set, or null/undefined/"" to clear.
 */
export async function persistStarshipFlatDamageReductionManual(actor, value) {
	if ( !actor ) return;
	if ( value === null || value === undefined || value === "" ) {
		await actor.update({ "flags.sw5e.-=flatDamageReductionManual": null });
		return;
	}
	const n = Number(value);
	const next = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
	await actor.update({ "flags.sw5e.flatDamageReductionManual": next });
}

/**
 * @returns {boolean}
 */
export function isStarshipFlatDamageReductionEnabled() {
	try {
		return game.settings.get(SETTINGS_NAMESPACE, STARSHIP_FLAT_DR_SETTING) !== false;
	} catch {
		return true;
	}
}

/**
 * @param {ChatMessage} [message]
 * @returns {boolean}
 */
export function isDamageMessageFromAttack(message) {
	if ( !message ) return false;
	if ( message.getFlag?.("dnd5e", "roll.type") === "attack" ) return true;
	const activity = message.getAssociatedActivity?.();
	if ( !activity ) return false;
	if ( activity.type === "attack" ) return true;
	if ( activity.metadata?.type === "attack" ) return true;
	return false;
}

/**
 * Subtract flat DR from positive damage parts after stock dnd5e modifiers.
 * If DR applies and the remaining total would be <= 0, leave 1 total damage.
 *
 * @param {object[]} damages
 * @param {number} dr
 * @returns {boolean} True when DR changed any values.
 */
export function applyFlatDamageReductionToDamages(damages, dr) {
	const amount = Math.max(0, Number(dr) || 0);
	if ( !(amount > 0) || !Array.isArray(damages) ) return false;

	const parts = damages.filter(d => d && d.type !== "temphp" && d.type !== "maximum" && Number(d.value) > 0);
	if ( !parts.length ) return false;
	if ( parts.some(part => part.active?.sw5eFlatDamageReduction) ) return false;

	const total = parts.reduce((sum, d) => sum + Number(d.value), 0);
	if ( !(total > 0) ) return false;

	const reduced = Math.max(1, total - amount);
	if ( reduced === total ) return false;

	const scale = reduced / total;
	for ( const part of parts ) {
		part.value = Number(part.value) * scale;
		part.active ??= {};
		part.active.sw5eFlatDamageReduction = true;
	}
	return true;
}

/**
 * Apply flat DR for an attack-context damage summary and keep `damages.amount` aligned.
 * Non-attack damage is left unchanged. A second call does not reduce again.
 * @param {object[]} damages
 * @param {number} dr
 * @param {object} [options]
 * @returns {boolean}
 */
export function applyStarshipAttackDamageReduction(damages, dr, options={}) {
	if ( options?.sw5e?.fromAttack !== true ) return false;
	const applied = applyFlatDamageReductionToDamages(damages, dr);
	if ( !applied || typeof damages.amount !== "number" ) return applied;
	// dnd5e sums `damages.amount` before this hook. Keep that total in step with the reduced parts.
	damages.amount = Math.trunc(damages.reduce((sum, part) => {
		if ( !part || part.type === "temphp" || part.type === "maximum" ) return sum;
		return sum + Number(part.value);
	}, 0));
	return true;
}

/**
 * @param {Actor5e} actor
 * @param {object[]} damages
 * @param {object} options
 */
function onCalculateDamage(actor, damages, options) {
	if ( !isStarshipFlatDamageReductionEnabled() ) return;
	if ( !isSw5eStarshipActor(actor) ) return;
	if ( options?.ignore === true ) return;
	if ( options?.only === "healing" ) return;

	const dr = getStarshipFlatDamageReduction(actor);
	if ( !(dr > 0) ) return;
	applyStarshipAttackDamageReduction(damages, dr, options);
}

/**
 * Inject attack context into damage-tray target options so preview + apply share gating.
 * @param {Function} wrapped
 * @param {string} uuid
 * @returns {object}
 */
function wrapDamageApplicationGetTargetOptions(wrapped, uuid) {
	const options = wrapped.call(this, uuid) ?? { multiplier: 1 };
	const fromAttack = isDamageMessageFromAttack(this.chatMessage);
	options.sw5e = foundry.utils.mergeObject(options.sw5e ?? {}, { fromAttack }, { inplace: false });
	return options;
}

function registerDamageApplicationAttackContextWrapper() {
	const fromNamespace = globalThis.dnd5e?.applications?.components?.DamageApplicationElement;
	const fromCustomElement = customElements.get?.("damage-application");
	const DamageApplicationElement = fromNamespace ?? fromCustomElement;
	if ( !DamageApplicationElement?.prototype?.getTargetOptions ) {
		console.warn("SW5E MODULE | DamageApplicationElement unavailable; starship DR attack context not registered.");
		return;
	}

	const target = fromNamespace
		? "dnd5e.applications.components.DamageApplicationElement.prototype.getTargetOptions"
		: null;

	try {
		if ( target ) {
			libWrapper.register(getModuleId(), target, wrapDamageApplicationGetTargetOptions, "WRAPPER");
			return;
		}
		// Fallback when class is only registered as a custom element.
		const proto = DamageApplicationElement.prototype;
		const original = proto.getTargetOptions;
		proto.getTargetOptions = function(...args) {
			return wrapDamageApplicationGetTargetOptions.call(this, original.bind(this), ...args);
		};
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap DamageApplicationElement.getTargetOptions for starship DR.", err);
	}
}

/**
 * Register starship flat Damage Reduction hooks and wrappers.
 */
function isDamageTargetWrapped() {
	const fn = globalThis.dnd5e?.applications?.components?.DamageApplicationElement?.prototype?.getTargetOptions
		?? customElements.get?.("damage-application")?.prototype?.getTargetOptions;
	return typeof fn === "function" && fn.name.includes("\u{1F381}");
}

export function registerStarshipDamageReductionHooks() {
	Hooks.on("dnd5e.calculateDamage", onCalculateDamage);

	const register = () => {
		if ( isDamageTargetWrapped() ) return;
		registerDamageApplicationAttackContextWrapper();
	};
	if ( !globalThis.libWrapper ) {
		console.warn("SW5E MODULE | libWrapper not available; starship DR attack-context wrapper not registered.");
		return;
	}
	if ( libWrapper.ready ) register();
	else Hooks.once("libWrapper.Ready", register);
	if ( !isDamageTargetWrapped() ) Hooks.once("ready", register);
}
