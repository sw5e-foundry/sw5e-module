import { getModulePath } from "./module-support.mjs";
import { applySw5eThemeScope } from "./theme.mjs";
import { deriveStarshipPools, persistStarshipLegacyAttributePath } from "./starship-data.mjs";
import {
	findStarshipSizeItem,
	getSizeLegacyData,
	getStarshipLiveHp,
	getStarshipShieldDepleted,
	setStarshipShieldDepleted
} from "./starship-dice-rolls.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized && localized !== key ? localized : fallback;
}

function parseNumberInput(value, fallback = 0) {
	const text = String(value ?? "").trim();
	if ( !text ) return fallback;
	const numeric = Number(text);
	return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function parseDeltaInput(raw, current) {
	const parseDelta = game?.dnd5e?.utils?.parseDelta ?? globalThis.dnd5e?.utils?.parseDelta;
	if ( typeof parseDelta === "function" ) {
		const value = parseDelta(String(raw ?? "").trim(), Number(current) || 0);
		return Number.isFinite(value) ? Math.trunc(value) : null;
	}
	const text = String(raw ?? "").trim();
	if ( !text ) return null;
	let value = Number(text);
	if ( text[0] === "+" || text[0] === "-" ) value = (Number(current) || 0) + parseFloat(text);
	else if ( text[0] === "=" ) value = Number(text.slice(1));
	return Number.isFinite(value) ? Math.trunc(value) : null;
}

function formatDisplayNumber(value) {
	if ( typeof game?.dnd5e?.utils?.formatNumber === "function" ) {
		return game.dnd5e.utils.formatNumber(value, { maximumFractionDigits: 0 });
	}
	return String(value);
}

function hpSchemaHasField(actor, fieldName) {
	return Boolean(actor?.system?.schema?.fields?.attributes?.fields?.hp?.fields?.[fieldName]);
}

async function persistStarshipSizeDiceCurrent(actor, poolKey, currentValue) {
	const sizeItem = findStarshipSizeItem(actor);
	if ( !sizeItem ) return;
	const pools = deriveStarshipPools(actor);
	const pool = poolKey === "hull" ? pools.hull : pools.shld;
	const max = Math.max(0, Number(pool?.max) || 0);
	const current = Math.max(0, Math.min(max, Math.trunc(Number(currentValue) || 0)));
	const used = max - current;
	const legacy = { ...getSizeLegacyData(sizeItem) };
	if ( poolKey === "hull" ) legacy.hullDiceUsed = used;
	else legacy.shldDiceUsed = used;
	await actor.updateEmbeddedDocuments("Item", [{
		_id: sizeItem.id,
		"flags.sw5e.legacyStarshipSize": legacy
	}]);
}

function bindConfigForm(app, selector, onSubmit) {
	const root = app.element instanceof HTMLElement ? app.element : app.element?.[0] ?? null;
	applySw5eThemeScope(root, { scope: "module-app" });
	const form = root?.querySelector(selector);
	if ( !form || form.dataset.sw5eBound === "true" ) return;
	form.dataset.sw5eBound = "true";
	form.addEventListener("submit", onSubmit);
	for ( const btn of form.querySelectorAll("[data-action='decrease'], [data-action='increase']") ) {
		btn.addEventListener("click", event => {
			event.preventDefault();
			const group = btn.closest(".form-group");
			const input = group?.querySelector("input[type='number']");
			if ( !(input instanceof HTMLInputElement) ) return;
			if ( btn.dataset.action === "increase" ) input.stepUp();
			else input.stepDown();
			form.requestSubmit();
		});
	}
}

export class StarshipHullPointsConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor({ actor } = {}) {
		super();
		this.actor = actor;
	}

	static DEFAULT_OPTIONS = {
		tag: "section",
		classes: ["config-sheet", "hit-points", "sw5e-starship-hull-points-config"],
		window: { resizable: true },
		position: { width: 420, height: "auto" }
	};

	static PARTS = {
		config: { template: getModulePath("templates/apps/starship-hull-points-config.hbs") }
	};

	get title() {
		return localizeOrFallback("SW5E.HullPoints", "Hull Points");
	}

	async _prepareContext() {
		const hp = getStarshipLiveHp(this.actor);
		const value = Math.max(0, Number(hp.value) || 0);
		const max = Math.max(0, Number(hp.max) || 0);
		return {
			value,
			max,
			effectiveMax: max,
			source: {
				value,
				max,
				dt: Number(hp.dt) || 0,
				mt: Number(hp.mt) || 0
			},
			showDt: hpSchemaHasField(this.actor, "dt"),
			showMt: hpSchemaHasField(this.actor, "mt"),
			labels: {
				currentLegend: localizeOrFallback("SW5E.StarshipVitalConfig.HullCurrentLegend", "Current Hull Points"),
				maxLegend: localizeOrFallback("SW5E.StarshipVitalConfig.HullMaxLegend", "Maximum Hull Points"),
				current: localizeOrFallback("SW5E.StarshipVitalConfig.HullCurrent", "Current Hull Points"),
				maximum: localizeOrFallback("SW5E.StarshipVitalConfig.HullMaximum", "Maximum Hull Points"),
				dt: localizeOrFallback("SW5E.StarshipVitalConfig.DamageThreshold", "Damage Threshold"),
				mt: localizeOrFallback("SW5E.StarshipVitalConfig.MishapThreshold", "Mishap Threshold"),
				save: localizeOrFallback("DND5E.Save", "Save")
			}
		};
	}

	_onRender(context, options) {
		super._onRender(context, options);
		bindConfigForm(this, "form.sw5e-starship-hull-points-config-form", this.#onSubmit.bind(this));
	}

	async #onSubmit(event) {
		event.preventDefault();
		if ( !this.actor ) return;
		const formData = new FormData(event.currentTarget);
		const max = Math.max(0, parseNumberInput(formData.get("system.attributes.hp.max")));
		let value = parseDeltaInput(formData.get("system.attributes.hp.value"), getStarshipLiveHp(this.actor).value);
		if ( value === null ) value = Math.max(0, parseNumberInput(formData.get("system.attributes.hp.value")));
		value = Math.max(0, Math.min(value, max > 0 ? max : value));
		const update = {
			"system.attributes.hp.value": value,
			"system.attributes.hp.max": max
		};
		if ( hpSchemaHasField(this.actor, "dt") ) {
			update["system.attributes.hp.dt"] = Math.max(0, parseNumberInput(formData.get("system.attributes.hp.dt")));
		}
		if ( hpSchemaHasField(this.actor, "mt") ) {
			update["system.attributes.hp.mt"] = Math.max(0, parseNumberInput(formData.get("system.attributes.hp.mt")));
		}
		for ( const [path, val] of Object.entries(update) ) {
			await persistStarshipLegacyAttributePath(this.actor, path, val);
		}
		this.close();
	}
}

export class StarshipShieldPointsConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor({ actor } = {}) {
		super();
		this.actor = actor;
	}

	static DEFAULT_OPTIONS = {
		tag: "section",
		classes: ["config-sheet", "hit-points", "sw5e-starship-shield-points-config"],
		window: { resizable: true },
		position: { width: 420, height: "auto" }
	};

	static PARTS = {
		config: { template: getModulePath("templates/apps/starship-shield-points-config.hbs") }
	};

	get title() {
		return localizeOrFallback("SW5E.ShieldPoints", "Shield Points");
	}

	async _prepareContext() {
		const hp = getStarshipLiveHp(this.actor);
		const value = Math.max(0, Number(hp.temp) || 0);
		const max = Math.max(0, Number(hp.tempmax) || 0);
		return {
			value,
			max,
			effectiveMax: max,
			source: { temp: value, tempmax: max },
			shieldDepleted: getStarshipShieldDepleted(this.actor),
			labels: {
				currentLegend: localizeOrFallback("SW5E.StarshipVitalConfig.ShieldCurrentLegend", "Current Shield Points"),
				maxLegend: localizeOrFallback("SW5E.StarshipVitalConfig.ShieldMaxLegend", "Maximum Shield Points"),
				current: localizeOrFallback("SW5E.StarshipVitalConfig.ShieldCurrent", "Current Shield Points"),
				maximum: localizeOrFallback("SW5E.StarshipVitalConfig.ShieldMaximum", "Maximum Shield Points"),
				depleted: localizeOrFallback("SW5E.StarshipVitalConfig.ShieldDepleted", "Shields depleted"),
				save: localizeOrFallback("DND5E.Save", "Save")
			}
		};
	}

	_onRender(context, options) {
		super._onRender(context, options);
		bindConfigForm(this, "form.sw5e-starship-shield-points-config-form", this.#onSubmit.bind(this));
	}

	async #onSubmit(event) {
		event.preventDefault();
		if ( !this.actor ) return;
		const formData = new FormData(event.currentTarget);
		const tempmax = Math.max(0, parseNumberInput(formData.get("system.attributes.hp.tempmax")));
		let temp = parseDeltaInput(formData.get("system.attributes.hp.temp"), getStarshipLiveHp(this.actor).temp);
		if ( temp === null ) temp = Math.max(0, parseNumberInput(formData.get("system.attributes.hp.temp")));
		temp = Math.max(0, Math.min(temp, tempmax > 0 ? tempmax : temp));
		await persistStarshipLegacyAttributePath(this.actor, "system.attributes.hp.tempmax", tempmax);
		await persistStarshipLegacyAttributePath(this.actor, "system.attributes.hp.temp", temp);
		if ( formData.has("flags.sw5e.starship.shieldDepleted") ) {
			await setStarshipShieldDepleted(this.actor, formData.get("flags.sw5e.starship.shieldDepleted") === "on");
		}
		this.close();
	}
}

class StarshipDicePoolConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor({ actor, poolKey } = {}) {
		super();
		this.actor = actor;
		this.poolKey = poolKey;
	}

	static DEFAULT_OPTIONS = {
		tag: "section",
		classes: ["config-sheet", "hit-dice", "sw5e-starship-dice-config"],
		window: { resizable: true },
		position: { width: 420, height: "auto" }
	};

	static PARTS = {
		config: { template: getModulePath("templates/apps/starship-dice-pool-config.hbs") }
	};

	get title() {
		return this.poolKey === "hull"
			? localizeOrFallback("SW5E.HullDice", "Hull Dice")
			: localizeOrFallback("SW5E.ShieldDice", "Shield Dice");
	}

	async _prepareContext() {
		const pools = deriveStarshipPools(this.actor);
		const pool = this.poolKey === "hull" ? pools.hull : pools.shld;
		const current = Math.max(0, Number(pool?.current) || 0);
		const max = Math.max(0, Number(pool?.max) || 0);
		const die = pool?.die ?? "";
		const isHull = this.poolKey === "hull";
		return {
			poolKey: this.poolKey,
			current,
			max,
			die,
			labels: {
				current: isHull
					? localizeOrFallback("SW5E.StarshipVitalConfig.HullDiceCurrent", "Current Hull Dice")
					: localizeOrFallback("SW5E.StarshipVitalConfig.ShieldDiceCurrent", "Current Shield Dice"),
				decrease: localizeOrFallback("DND5E.HITDICE.Action.Decrease", "Decrease"),
				increase: localizeOrFallback("DND5E.HITDICE.Action.Increase", "Increase"),
				save: localizeOrFallback("DND5E.Save", "Save")
			}
		};
	}

	_onRender(context, options) {
		super._onRender(context, options);
		bindConfigForm(this, "form.sw5e-starship-dice-pool-config-form", this.#onSubmit.bind(this));
	}

	async #onSubmit(event) {
		event.preventDefault();
		if ( !this.actor ) return;
		const formData = new FormData(event.currentTarget);
		const current = Math.max(0, parseNumberInput(formData.get("current")));
		await persistStarshipSizeDiceCurrent(this.actor, this.poolKey, current);
		this.close();
	}
}

const VITAL_CONFIG_OPENERS = {
	hullPoints: actor => new StarshipHullPointsConfigApp({ actor }).render(true),
	shieldPoints: actor => new StarshipShieldPointsConfigApp({ actor }).render(true),
	hullDice: actor => new StarshipDicePoolConfigApp({ actor, poolKey: "hull" }).render(true),
	shieldDice: actor => new StarshipDicePoolConfigApp({ actor, poolKey: "shld" }).render(true)
};

export function openStarshipVitalConfig(actor, configKey) {
	if ( !actor ) return;
	const open = VITAL_CONFIG_OPENERS[configKey];
	if ( typeof open === "function" ) open(actor);
}

export { formatDisplayNumber };
