import { getModulePath } from "./module-support.mjs";
import { applySw5eThemeScope } from "./theme.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function getNumericValue(value) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
}

function parseNumberInput(value, fallback=0) {
	const text = String(value ?? "").trim();
	if ( !text ) return fallback;
	return getNumericValue(text) ?? fallback;
}

function parseNullableNumberInput(value) {
	const text = String(value ?? "").trim();
	if ( !text ) return null;
	return getNumericValue(text);
}

function formatPointsLabel(castType) {
	return game.i18n.localize(`SW5E.Powercasting.${castType.capitalize()}.Point.Label`);
}

function getPowerPointRuntime(actor, castType) {
	return actor?._sw5ePowerPointRuntime?.[castType] ?? {};
}

export class PowerPointConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor({ actor, castType }={}) {
		super();
		this.actor = actor;
		this.castType = castType;
	}

	static DEFAULT_OPTIONS = {
		tag: "section",
		classes: ["config-sheet", "power-point-config"],
		window: {
			resizable: true
		},
		position: {
			width: 420,
			height: "auto"
		}
	};

	static PARTS = {
		config: {
			template: getModulePath("templates/apps/power-point-config.hbs")
		}
	};

	get title() {
		return `${formatPointsLabel(this.castType)} Configuration`;
	}

	async _prepareContext(options={}) {
		const source = foundry.utils.deepClone(this.actor?._source?.system?.powercasting?.[this.castType]?.points ?? {});
		const points = this.actor?.system?.powercasting?.[this.castType]?.points ?? {};
		const runtime = getPowerPointRuntime(this.actor, this.castType);
		const sourceBonuses = source.bonuses ??= {};
		source.value = parseNumberInput(source.value, getNumericValue(points.value) ?? 0);
		source.temp = parseNumberInput(source.temp, getNumericValue(points.temp) ?? 0);
		source.tempmax = parseNumberInput(source.tempmax, getNumericValue(points.tempmax) ?? 0);
		sourceBonuses.level ??= "";
		sourceBonuses.overall ??= "";

		const max = getNumericValue(points.max) ?? 0;
		const tempmax = getNumericValue(points.tempmax) ?? 0;
		const calculatedMax = Math.max(0, getNumericValue(runtime.calculatedMax) ?? max);
		const hasMaxOverride = source.max !== null && source.max !== undefined && source.max !== "";
		return {
			castType: this.castType,
			source,
			value: getNumericValue(points.value) ?? source.value ?? 0,
			effectiveMax: Math.max(0, max + tempmax),
			calculatedMax,
			hasMaxOverride,
			showCalculatedReset: this.actor?.type === "npc",
			maximumLegend: `Maximum ${formatPointsLabel(this.castType)}`,
			currentLegend: `Current ${formatPointsLabel(this.castType)}`,
			currentLabel: "Current Points",
			tempLabel: game.i18n.localize("DND5E.TMP"),
			tempMaxLabel: "Temporary Maximum",
			calculatedMaxLabel: "Calculated Maximum",
			maxOverrideLabel: "Maximum Override",
			maxOverrideHint: `Leave blank to use the calculated ${formatPointsLabel(this.castType).toLowerCase()} maximum.`,
			perLevelBonusLabel: "Per Level Bonus",
			overallBonusLabel: "Overall Bonus",
			resetLabel: "Reset to Calculated",
			saveLabel: "Save"
		};
	}

	_onRender(context, options) {
		super._onRender(context, options);
		const root = this.element instanceof HTMLElement ? this.element : this.element?.[0] ?? null;
		applySw5eThemeScope(root, { scope: "module-app" });
		const form = root?.querySelector("form.sw5e-power-point-config-form");
		if ( !form || form.dataset.sw5eBound === "true" ) return;
		form.dataset.sw5eBound = "true";
		form.addEventListener("submit", this.#onSubmit.bind(this));
	}

	async #onSubmit(event) {
		event.preventDefault();
		if ( !this.actor ) return;

		const formData = new FormData(event.currentTarget);
		const submitAction = event.submitter?.dataset?.action ?? "save";
		const basePath = `system.powercasting.${this.castType}.points`;
		const updateData = {
			[`${basePath}.value`]: parseNumberInput(formData.get(`${basePath}.value`)),
			[`${basePath}.temp`]: parseNumberInput(formData.get(`${basePath}.temp`)),
			[`${basePath}.tempmax`]: parseNumberInput(formData.get(`${basePath}.tempmax`)),
			[`${basePath}.max`]: parseNullableNumberInput(formData.get(`${basePath}.max`)),
			[`${basePath}.bonuses.level`]: String(formData.get(`${basePath}.bonuses.level`) ?? "").trim(),
			[`${basePath}.bonuses.overall`]: String(formData.get(`${basePath}.bonuses.overall`) ?? "").trim()
		};
		if ( submitAction === "reset-calculated" ) updateData[`${basePath}.max`] = null;

		const points = this.actor.system?.powercasting?.[this.castType]?.points ?? {};
		const runtime = getPowerPointRuntime(this.actor, this.castType);
		const previousMax = Math.max(0, getNumericValue(runtime.effectiveMax) ?? getNumericValue(points.max) ?? 0);
		const previousTempMax = getNumericValue(points.tempmax) ?? 0;
		const nextTempMax = getNumericValue(updateData[`${basePath}.tempmax`]) ?? previousTempMax;
		const nextMax = updateData[`${basePath}.max`] === null
			? previousMax
			: Math.max(0, getNumericValue(updateData[`${basePath}.max`]) ?? 0);
		const nextEffectiveMax = Math.max(0, nextMax + nextTempMax);
		const submittedCurrent = getNumericValue(updateData[`${basePath}.value`]) ?? 0;
		updateData[`${basePath}.value`] = Math.max(0, Math.min(submittedCurrent, nextEffectiveMax));

		await this.actor.update(updateData);
		this.render(true);
	}
}

export function openPowerPointConfig(actor, castType) {
	if ( !actor || !["force", "tech"].includes(castType) ) return;
	new PowerPointConfigApp({ actor, castType }).render(true);
}
