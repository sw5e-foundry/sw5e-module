import { getModuleId } from "./module-support.mjs";
import {
	getStarshipMovementFieldControllers,
	getStarshipUnderlyingMovement,
	resolveStarshipMovementSourceUpdate
} from "./starship-data.mjs";
import { isSw5eStarshipActor, STARSHIP_MOVEMENT_TYPE_KEYS } from "./patch/starship-movement.mjs";
import {
	STARSHIP_SPEEDS_PATH_PREFIX,
	STARSHIP_UNITS_PATH,
	filterNonStarshipMovementContext,
	resolveMovementTypeKey
} from "./starship-movement-context.mjs";

const STARSHIP_MOVEMENT_TYPE_SET = new Set(STARSHIP_MOVEMENT_TYPE_KEYS);
const STARSHIP_BRIDGED_MOVEMENT_KEYS = Object.freeze(["space", "turn", "walk", "fly", "units"]);
const STARSHIP_FIXED_ZERO_MOVEMENT_KEYS = Object.freeze(["walk", "fly"]);
const STARSHIP_BRIDGED_MOVEMENT_KEY_SET = new Set(STARSHIP_BRIDGED_MOVEMENT_KEYS);
const STARSHIP_PENDING_MOVEMENT_EDITS = new Map();

const { MovementSensesConfig } = dnd5e.applications.shared;

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized && localized !== key ? localized : fallback;
}

function ensureStarshipMovementEntryName(entry, key) {
	if ( !entry || !key ) return;
	const path = key === "units" ? STARSHIP_UNITS_PATH : `${STARSHIP_SPEEDS_PATH_PREFIX}${key}`;
	if ( !entry.name ) entry.name = path;
	if ( entry.field && !entry.field.name ) entry.field.name = path;
}

function getTrackedStarshipMovementKey(target) {
	const path = target?.name;
	if ( typeof path !== "string" ) return null;
	if ( path === STARSHIP_UNITS_PATH ) return "units";
	if ( path.startsWith(STARSHIP_SPEEDS_PATH_PREFIX) ) {
		const key = path.slice(STARSHIP_SPEEDS_PATH_PREFIX.length);
		return key && STARSHIP_BRIDGED_MOVEMENT_KEY_SET.has(key) ? key : null;
	}
	return null;
}

function resetPendingStarshipMovementEdits(actor) {
	if ( actor?.id ) STARSHIP_PENDING_MOVEMENT_EDITS.set(actor.id, new Set());
}

function trackPendingStarshipMovementEdit(actor, key) {
	if ( !actor?.id || !key ) return;
	const pending = STARSHIP_PENDING_MOVEMENT_EDITS.get(actor.id) ?? new Set();
	pending.add(key);
	STARSHIP_PENDING_MOVEMENT_EDITS.set(actor.id, pending);
}

function consumePendingStarshipMovementEdits(actor) {
	if ( !actor?.id ) return null;
	const pending = STARSHIP_PENDING_MOVEMENT_EDITS.get(actor.id) ?? null;
	STARSHIP_PENDING_MOVEMENT_EDITS.delete(actor.id);
	return pending;
}

/**
 * Dialog fields show underlying Actor movement (homebrew storage), not prepared live
 * (Role OVERRIDE / routing / Slowed).
 */
function getStarshipDialogMovementValue(actor, key) {
	if ( key === "walk" || key === "fly" ) return 0;
	const underlying = getStarshipUnderlyingMovement(actor);
	if ( key === "units" ) return underlying.units ?? "ft";
	if ( key === "space" || key === "turn" ) {
		const value = underlying[key];
		return value === null ? "" : value;
	}
	return underlying[key];
}

function applyStarshipMovementDisplayValues(actor, context, orderedKeys) {
	if ( !Array.isArray(context.types) ) return context;
	for ( let index = 0; index < context.types.length; index++ ) {
		const entry = context.types[index];
		const key = resolveMovementTypeKey(entry, index, orderedKeys, context.fields);
		if ( !key ) continue;
		if ( STARSHIP_MOVEMENT_TYPE_SET.has(key) ) ensureStarshipMovementEntryName(entry, key);
		if ( !STARSHIP_BRIDGED_MOVEMENT_KEY_SET.has(key) ) continue;
		const value = getStarshipDialogMovementValue(actor, key);
		if ( value !== undefined && value !== null && value !== "" ) entry.value = value;
		else if ( key === "space" || key === "turn" ) entry.value = value;
	}
	if ( context.data && (typeof context.data === "object") ) {
		const units = getStarshipDialogMovementValue(actor, "units");
		if ( units !== undefined && units !== null && units !== "" ) context.data.units = units;
	}
	return context;
}

function getMovementConfigRoot(app, html) {
	const fromHtml = html instanceof HTMLElement ? html : html?.[0] ?? null;
	if ( fromHtml?.querySelector?.("[data-application-part=\"config\"]") ) return fromHtml;
	if ( fromHtml?.classList?.contains("application") ) return fromHtml;
	if ( fromHtml?.closest instanceof Function ) {
		const application = fromHtml.closest(".application");
		if ( application instanceof HTMLElement ) return application;
	}

	const byId = app?.id ? document.getElementById(app.id) : null;
	if ( byId instanceof HTMLElement ) return byId;

	const element = app?.element;
	const el = element instanceof HTMLElement ? element : element?.[0] ?? null;
	if ( el?.classList?.contains("application") ) return el;
	return el?.closest?.(".application") ?? null;
}

function scheduleBindStarshipMovementFieldTracking(app, html) {
	if ( app?.constructor !== MovementSensesConfig ) return;
	const run = () => bindStarshipMovementFieldTracking(app, html);
	queueMicrotask(run);
	requestAnimationFrame(run);
}

function bindStarshipMovementFieldTracking(app, html) {
	if ( !isSw5eStarshipActor(app?.document) || app?.options?.type !== "movement" ) return;

	const root = getMovementConfigRoot(app, html);
	if ( !(root instanceof HTMLElement) ) return;
	if ( root.dataset.sw5eMovementTracked === "true" ) return;
	root.dataset.sw5eMovementTracked = "true";
	resetPendingStarshipMovementEdits(app.document);

	const remember = event => {
		const key = getTrackedStarshipMovementKey(event.target);
		if ( key ) trackPendingStarshipMovementEdit(app.document, key);
	};
	root.addEventListener("input", remember, true);
	root.addEventListener("change", remember, true);
}

function onStarshipMovementConfigPreUpdate(doc, changed) {
	if ( !isSw5eStarshipActor(doc) ) return;

	const movement = foundry.utils.getProperty(changed, "system.attributes.movement");
	if ( !(movement && typeof movement === "object") ) return;

	const hasTrackedSession = !!doc?.id && STARSHIP_PENDING_MOVEMENT_EDITS.has(doc.id);
	const pendingKeys = hasTrackedSession ? (consumePendingStarshipMovementEdits(doc) ?? new Set()) : null;
	const controllers = getStarshipMovementFieldControllers(doc);
	const underlying = getStarshipUnderlyingMovement(doc);
	const resolved = resolveStarshipMovementSourceUpdate({
		underlying,
		proposedMovement: movement,
		pendingKeys,
		fieldControllers: controllers
	});

	for ( const key of Object.keys(movement) ) {
		if ( !(key in resolved.movement) ) delete movement[key];
	}
	Object.assign(movement, resolved.movement);

	for ( const key of STARSHIP_FIXED_ZERO_MOVEMENT_KEYS ) {
		if ( key in movement ) delete movement[key];
		if ( movement.speeds && (key in movement.speeds) ) delete movement.speeds[key];
	}

	if ( resolved.warning ) {
		ui.notifications?.warn?.(resolved.warning);
	}

	if ( !Object.keys(movement).length ) {
		foundry.utils.deleteProperty(changed, "system.attributes.movement");
	}
}

export function patchStarshipMovementSensesConfig() {
	const target = "dnd5e.applications.shared.MovementSensesConfig";

	try {
		libWrapper.register(
			getModuleId(),
			`${target}.prototype._preparePartContext`,
			async function(wrapped, partId, context, options) {
				context = await wrapped(partId, context, options);
				if ( this.options.type !== "movement" || !context.fields ) return context;
				const orderedKeys = this.types;
				if ( isSw5eStarshipActor(this.document) ) {
					return applyStarshipMovementDisplayValues(this.document, context, orderedKeys);
				}
				return filterNonStarshipMovementContext(context, orderedKeys);
			},
			"WRAPPER"
		);
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap MovementSensesConfig._preparePartContext.", err);
	}

	Hooks.on("preUpdateActor", onStarshipMovementConfigPreUpdate);

	Hooks.on("renderApplicationV2", (app, html) => {
		scheduleBindStarshipMovementFieldTracking(app, html);
	});
}

export async function openStarshipMovementConfig(actor, app = null, { isEditMode = true } = {}) {
	if ( !isSw5eStarshipActor(actor) ) return;
	if ( !actor.isOwner ) {
		ui.notifications?.warn?.(localizeOrFallback("PERMISSION.WarningNoActor", "You do not have permission to edit this actor."));
		return;
	}
	if ( !isEditMode || app?.isEditable === false ) {
		ui.notifications?.info?.(localizeOrFallback(
			"SW5E.StarshipSheet.MovementConfigEditMode",
			"Switch the sheet to Edit mode to configure starship movement."
		));
		return;
	}

	const config = new MovementSensesConfig({ document: actor, type: "movement" });
	await config.render({ force: true });
}
