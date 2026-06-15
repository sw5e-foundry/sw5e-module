import { getModuleId } from "./module-support.mjs";
import {
	getLegacyStarshipActorSystem,
	getStarshipBaseDerivedMovement,
	getStarshipMovementOverrides
} from "./starship-data.mjs";
import { isSw5eStarshipActor, STARSHIP_MOVEMENT_TYPE_KEYS } from "./patch/starship-movement.mjs";

const MOVEMENT_OVERRIDE_FLAG_BASE = "flags.sw5e.legacyStarshipActor.system.attributes.movementOverrides";
const TRAVEL_SPEED_PATH = "system.attributes.travel.speeds.air";
const TRAVEL_PACE_PATH = "system.attributes.travel.paces.air";
const STARSHIP_MOVEMENT_TYPE_SET = new Set(STARSHIP_MOVEMENT_TYPE_KEYS);
const USE_DERIVED_ACTION = "sw5e-reset-derived";

const { MovementSensesConfig } = dnd5e.applications.shared;

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized && localized !== key ? localized : fallback;
}

function parseMovementInput(value, fallback = null) {
	const text = String(value ?? "").trim();
	if ( !text ) return fallback;
	const numeric = Number(text);
	return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : fallback;
}

function resolveOverrideInput(raw, baseValue) {
	const text = String(raw ?? "").trim();
	if ( !text ) return null;
	const parsed = parseMovementInput(text, null);
	if ( parsed === null ) return null;
	const base = Number.isFinite(Number(baseValue)) ? Math.round(Number(baseValue)) : null;
	if ( base !== null && parsed === base ) return null;
	return parsed;
}

/**
 * MovementSensesConfig builds `context.types` from `this.types` in order; `space` / `turn`
 * FormulaFields may lack `field.name`, so resolve the movement key by index or fields map.
 */
function resolveMovementTypeKey(entry, index, orderedKeys, fields) {
	const keyFromOrder = orderedKeys?.[index];
	if ( keyFromOrder && fields?.[keyFromOrder] === entry.field ) return keyFromOrder;
	if ( entry.field?.name ) return entry.field.name;
	if ( entry.field && fields ) {
		return Object.keys(fields).find(key => fields[key] === entry.field) ?? null;
	}
	return keyFromOrder ?? null;
}

/**
 * Prepared starship movement lives on `actor.system`; stock MovementSensesConfig reads `_source`.
 * Sync only `space` / `turn` display values without altering the stock field list or layout.
 */
function applyStarshipMovementDisplayValues(actor, context, orderedKeys) {
	if ( !Array.isArray(context.types) ) return context;
	const movement = actor.system?.attributes?.movement ?? {};
	for ( let index = 0; index < context.types.length; index++ ) {
		const entry = context.types[index];
		const key = resolveMovementTypeKey(entry, index, orderedKeys, context.fields);
		if ( !key || !STARSHIP_MOVEMENT_TYPE_SET.has(key) ) continue;
		const live = movement[key];
		if ( live !== undefined && live !== null && live !== "" ) entry.value = live;
	}
	return context;
}

function filterNonStarshipMovementContext(context, orderedKeys) {
	if ( !Array.isArray(context.types) ) return context;
	context.types = context.types.filter((entry, index) => {
		const key = resolveMovementTypeKey(entry, index, orderedKeys, context.fields);
		return !key || !STARSHIP_MOVEMENT_TYPE_SET.has(key);
	});
	return context;
}

function stripStarshipOverrideMovementWrites(movement = {}) {
	for ( const key of STARSHIP_MOVEMENT_TYPE_KEYS ) {
		delete movement[key];
	}
	return movement;
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

/**
 * Inject a stock `dialog-button` into the Combat Speed fieldset (before units `<hr>`).
 * Starship MovementSensesConfig only; does not alter template or dialog chrome.
 */
function bindStarshipUseDerivedButton(app, html) {
	if ( !isSw5eStarshipActor(app?.document) || app?.options?.type !== "movement" ) return;

	const part = getMovementConfigRoot(app, html)?.querySelector("[data-application-part=\"config\"]");
	const fieldset = part?.querySelector("fieldset.card");
	if ( !fieldset || fieldset.dataset.sw5eUseDerivedBound === "true" ) return;

	const group = document.createElement("div");
	group.className = "form-group";
	const button = document.createElement("button");
	button.type = "button";
	button.className = "dialog-button";
	button.dataset.action = USE_DERIVED_ACTION;
	button.textContent = localizeOrFallback("SW5E.StarshipSheet.MovementResetDerived", "Use Derived");
	group.append(button);

	const hr = fieldset.querySelector("hr");
	fieldset.insertBefore(group, hr ?? null);
	fieldset.dataset.sw5eUseDerivedBound = "true";
	button.addEventListener("click", event => {
		event.preventDefault();
		void resetStarshipMovementDerived(app);
	});
}

function scheduleBindStarshipUseDerivedButton(app, html) {
	if ( app?.constructor !== MovementSensesConfig ) return;
	const run = () => bindStarshipUseDerivedButton(app, html);
	queueMicrotask(run);
	requestAnimationFrame(run);
}

async function resetStarshipMovementDerived(app) {
	const actor = app?.document;
	if ( !actor?.isOwner ) return;

	await actor.update({
		[`${MOVEMENT_OVERRIDE_FLAG_BASE}.-=space`]: null,
		[`${MOVEMENT_OVERRIDE_FLAG_BASE}.-=turn`]: null,
		[TRAVEL_SPEED_PATH]: "",
		[TRAVEL_PACE_PATH]: ""
	});

	if ( typeof app?.render === "function" ) await app.render(false);
	if ( actor.sheet?.rendered ) await actor.sheet.render(false);
}

function onStarshipMovementConfigPreUpdate(doc, changed) {
	if ( !isSw5eStarshipActor(doc) ) return;

	const movement = foundry.utils.getProperty(changed, "system.attributes.movement");
	if ( movement && typeof movement === "object" ) {
		const base = getStarshipBaseDerivedMovement(doc);
		const overrideUpdate = {};
		let hasOverrideChange = false;

		for ( const key of STARSHIP_MOVEMENT_TYPE_KEYS ) {
			if ( !(key in movement) ) continue;
			hasOverrideChange = true;
			const override = resolveOverrideInput(movement[key], base[key]);
			if ( override === null ) overrideUpdate[`${MOVEMENT_OVERRIDE_FLAG_BASE}.-=${key}`] = null;
			else overrideUpdate[`${MOVEMENT_OVERRIDE_FLAG_BASE}.${key}`] = override;
		}

		if ( hasOverrideChange ) {
			const currentOverrides = getStarshipMovementOverrides(getLegacyStarshipActorSystem(doc));
			const nextSpace = "space" in movement
				? resolveOverrideInput(movement.space, base.space)
				: currentOverrides.space;
			let nextTurn = "turn" in movement
				? resolveOverrideInput(movement.turn, base.turn)
				: currentOverrides.turn;
			if ( nextSpace !== null && nextTurn !== null && nextTurn > nextSpace ) {
				nextTurn = nextSpace;
				overrideUpdate[`${MOVEMENT_OVERRIDE_FLAG_BASE}.turn`] = nextTurn;
			}
			foundry.utils.mergeObject(changed, overrideUpdate);
		}

		stripStarshipOverrideMovementWrites(movement);
		if ( !Object.keys(movement).length ) {
			foundry.utils.deleteProperty(changed, "system.attributes.movement");
		}
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
		scheduleBindStarshipUseDerivedButton(app, html);
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
