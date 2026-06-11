import { getModulePath } from "./module-support.mjs";
import { applySw5eThemeScope } from "./theme.mjs";
import {
	getDerivedStarshipRuntime,
	getLegacyStarshipActorSystem,
	getStarshipBaseDerivedMovement,
	getStarshipMovementOverrides
} from "./starship-data.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MOVEMENT_OVERRIDE_FLAG_BASE = "flags.sw5e.legacyStarshipActor.system.attributes.movementOverrides";
const SPACE_INPUT_NAME = "sw5e-starship-space-speed";
const TURN_INPUT_NAME = "sw5e-starship-turning-speed";
const TRAVEL_SPEED_PATH = "system.attributes.travel.speeds.air";
const TRAVEL_PACE_PATH = "system.attributes.travel.paces.air";

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

function getStoredTravelField(actor, path) {
	const sourceValue = foundry.utils.getProperty(actor?._source ?? {}, path);
	if ( sourceValue !== "" && sourceValue !== null && sourceValue !== undefined ) return String(sourceValue);
	return "";
}

function getLiveTravelField(actor, path) {
	const liveValue = foundry.utils.getProperty(actor?.system ?? {}, path);
	return Number.isFinite(Number(liveValue)) ? String(Math.round(Number(liveValue))) : "";
}

function getTravelUnitLabels(travel = {}) {
	const units = travel.units === "kph" ? "kph" : "mph";
	return {
		speed: units === "kph" ? "km/h" : "mph",
		pace: units === "kph" ? "km/d" : "mi/d"
	};
}

function isSw5eStarshipActor(actor) {
	return actor?.type === "vehicle" && actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
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

function buildMovementOverrideUpdate(actor, spaceRaw, turnRaw) {
	const base = getStarshipBaseDerivedMovement(actor);
	let spaceOverride = resolveOverrideInput(spaceRaw, base.space);
	let turnOverride = resolveOverrideInput(turnRaw, base.turn);
	if ( spaceOverride !== null && turnOverride !== null && turnOverride > spaceOverride ) {
		turnOverride = spaceOverride;
	}

	const update = {};
	if ( spaceOverride === null ) update[`${MOVEMENT_OVERRIDE_FLAG_BASE}.-=space`] = null;
	else update[`${MOVEMENT_OVERRIDE_FLAG_BASE}.space`] = spaceOverride;
	if ( turnOverride === null ) update[`${MOVEMENT_OVERRIDE_FLAG_BASE}.-=turn`] = null;
	else update[`${MOVEMENT_OVERRIDE_FLAG_BASE}.turn`] = turnOverride;
	return update;
}

export class StarshipMovementConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor({ actor } = {}) {
		super();
		this.actor = actor;
	}

	static DEFAULT_OPTIONS = {
		tag: "section",
		classes: ["sheet", "dnd5e2", "standard-form", "config-sheet", "sw5e-starship-movement-config-app"],
		window: {
			icon: false,
			resizable: true
		},
		position: {
			width: 400,
			height: "auto"
		}
	};

	static PARTS = {
		config: {
			template: getModulePath("templates/apps/starship-movement-config.hbs")
		}
	};

	get title() {
		return localizeOrFallback("SW5E.StarshipSheet.MovementConfigTitle", "Movement");
	}

	async _prepareContext() {
		const actor = this.actor;
		const runtime = getDerivedStarshipRuntime(actor);
		const base = getStarshipBaseDerivedMovement(actor);
		const overrides = getStarshipMovementOverrides(getLegacyStarshipActorSystem(actor));
		const movement = runtime.movement ?? {};
		const travel = actor?.system?.attributes?.travel ?? {};
		const units = movement.units ?? actor?.system?.attributes?.movement?.units ?? "ft";
		const travelUnits = getTravelUnitLabels(travel);
		const derivedSpace = Number.isFinite(Number(base.space)) ? Math.round(Number(base.space)) : "";
		const derivedTurn = Number.isFinite(Number(base.turn)) ? Math.round(Number(base.turn)) : "";
		const liveTravelSpeed = getLiveTravelField(actor, TRAVEL_SPEED_PATH);
		const liveTravelPace = getLiveTravelField(actor, TRAVEL_PACE_PATH);

		return {
			units,
			spaceSpeedValue: overrides.space !== null ? String(Math.round(overrides.space)) : "",
			turningSpeedValue: overrides.turn !== null ? String(Math.round(overrides.turn)) : "",
			derivedSpaceSpeed: derivedSpace,
			derivedTurningSpeed: derivedTurn,
			travelSpeedLegend: localizeOrFallback("DND5E.TravelSpeed", "Travel Speed"),
			travelSpeedLabel: localizeOrFallback("DND5E.TravelSpeed", "Travel Speed"),
			travelPaceLabel: localizeOrFallback("DND5E.TravelPace", "Travel Pace"),
			travelSpeedInput: getStoredTravelField(actor, TRAVEL_SPEED_PATH),
			travelPaceInput: getStoredTravelField(actor, TRAVEL_PACE_PATH),
			travelSpeedPlaceholder: liveTravelSpeed,
			travelPacePlaceholder: liveTravelPace,
			travelSpeedUnits: travelUnits.speed,
			travelPaceUnits: travelUnits.pace,
			spaceSpeedLabel: localizeOrFallback("SW5E.SpeedSpace", "Space speed"),
			turningSpeedLabel: localizeOrFallback("SW5E.TurnSpeed", "Turning speed"),
			resetDerivedLabel: localizeOrFallback("SW5E.StarshipSheet.MovementResetDerived", "Use Derived")
		};
	}

	_onRender(context, options) {
		super._onRender(context, options);
		const root = this.element instanceof HTMLElement ? this.element : this.element?.[0] ?? null;
		applySw5eThemeScope(root, { scope: "config-sheet" });
		const section = root?.querySelector("[data-application-part=\"config\"]");
		if ( !section || section.dataset.sw5eBound === "true" ) return;
		section.dataset.sw5eBound = "true";

		section.addEventListener("change", this.#onFieldChange.bind(this));
		section.querySelector("[data-action=\"reset-derived\"]")?.addEventListener("click", this.#onResetDerived.bind(this));
	}

	async #onFieldChange(event) {
		const input = event.target;
		if ( !(input instanceof HTMLInputElement) || !input.name || !this.actor?.isOwner ) return;

		if ( input.name === SPACE_INPUT_NAME || input.name === TURN_INPUT_NAME ) {
			const section = input.closest("[data-application-part=\"config\"]");
			const spaceRaw = section?.querySelector(`[name="${SPACE_INPUT_NAME}"]`)?.value;
			const turnRaw = section?.querySelector(`[name="${TURN_INPUT_NAME}"]`)?.value;
			const update = buildMovementOverrideUpdate(this.actor, spaceRaw, turnRaw);
			await this.actor.update(update);
			return;
		}

		if ( input.name === TRAVEL_SPEED_PATH || input.name === TRAVEL_PACE_PATH ) {
			const value = String(input.value ?? "").trim();
			await this.actor.update({ [input.name]: value });
		}
	}

	async #onResetDerived(event) {
		event.preventDefault();
		if ( !this.actor?.isOwner ) return;

		const base = getStarshipBaseDerivedMovement(this.actor);
		const liveTravelSpeed = getLiveTravelField(this.actor, TRAVEL_SPEED_PATH);
		const liveTravelPace = getLiveTravelField(this.actor, TRAVEL_PACE_PATH);

		await this.actor.update({
			[`${MOVEMENT_OVERRIDE_FLAG_BASE}.-=space`]: null,
			[`${MOVEMENT_OVERRIDE_FLAG_BASE}.-=turn`]: null,
			[TRAVEL_SPEED_PATH]: "",
			[TRAVEL_PACE_PATH]: ""
		});

		const section = event.currentTarget.closest("[data-application-part=\"config\"]");
		if ( !section ) return;

		const spaceInput = section.querySelector(`[name="${SPACE_INPUT_NAME}"]`);
		const turnInput = section.querySelector(`[name="${TURN_INPUT_NAME}"]`);
		const travelSpeedInput = section.querySelector(`[name="${TRAVEL_SPEED_PATH}"]`);
		const travelPaceInput = section.querySelector(`[name="${TRAVEL_PACE_PATH}"]`);

		if ( spaceInput ) {
			spaceInput.value = "";
			spaceInput.placeholder = Number.isFinite(Number(base.space)) ? String(Math.round(Number(base.space))) : "";
		}
		if ( turnInput ) {
			turnInput.value = "";
			turnInput.placeholder = Number.isFinite(Number(base.turn)) ? String(Math.round(Number(base.turn))) : "";
		}
		if ( travelSpeedInput ) {
			travelSpeedInput.value = "";
			travelSpeedInput.placeholder = liveTravelSpeed;
		}
		if ( travelPaceInput ) {
			travelPaceInput.value = "";
			travelPaceInput.placeholder = liveTravelPace;
		}
	}
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

	const config = new StarshipMovementConfigApp({ actor });
	await config.render({ force: true });
}
