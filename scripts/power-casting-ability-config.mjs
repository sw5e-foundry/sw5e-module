import { getModulePath } from "./module-support.mjs";
import { applySw5eThemeScope } from "./theme.mjs";
import {
	getPowercastingAbilityOptionIds,
	getPowercastingOverrides
} from "./powercasting-overrides.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const FORCE_SCHOOLS = ["lgt", "drk", "uni"];
const UNI_MODES = ["highestEffective", "fixed"];
const FORCE_SCHOOL_LABEL_KEYS = {
	lgt: "SW5E.Powercasting.Force.School.Lgt.Label",
	drk: "SW5E.Powercasting.Force.School.Drk.Label",
	uni: "SW5E.Powercasting.Force.School.Uni.Label"
};

function labelAbility(id) {
	if ( !id ) return game.i18n.localize("SW5E.Powercasting.AbilityConfig.UseDefault");
	const cfg = CONFIG.DND5E.abilities[id];
	return cfg?.label ? game.i18n.localize(cfg.label) : id.toUpperCase();
}

function buildAbilityOptions(selected) {
	const options = [{ value: "", label: game.i18n.localize("SW5E.Powercasting.AbilityConfig.UseDefault"), selected: !selected }];
	for ( const id of getPowercastingAbilityOptionIds() ) {
		options.push({ value: id, label: labelAbility(id), selected: selected === id });
	}
	return options;
}

/**
 * @param {string | null | undefined} mode
 * @returns {"highestEffective" | "fixed"}
 */
function normalizeUniModeForDisplay(mode) {
	return mode === "fixed" ? "fixed" : "highestEffective";
}

export class PowerCastingAbilityConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor({ actor } = {}) {
		super();
		this.actor = actor;
	}

	static DEFAULT_OPTIONS = {
		tag: "section",
		classes: ["config-sheet", "power-casting-ability-config"],
		window: { resizable: true },
		position: { width: 480, height: "auto" }
	};

	static PARTS = {
		config: {
			template: getModulePath("templates/apps/power-casting-ability-config.hbs")
		}
	};

	get title() {
		return game.i18n.localize("SW5E.Powercasting.AbilityConfig.Title");
	}

	async _prepareContext() {
		const actor = this.actor;
		const sourceForce = foundry.utils.deepClone(actor?._source?.system?.powercasting?.force?.schools ?? {});
		const overrides = getPowercastingOverrides(actor);
		const uniMode = normalizeUniModeForDisplay(overrides?.force?.uni?.mode);

		const schoolRows = FORCE_SCHOOLS.map(school => ({
			school,
			schoolLabel: game.i18n.localize(FORCE_SCHOOL_LABEL_KEYS[school]),
			abilityOptions: buildAbilityOptions(sourceForce?.[school]?.attr ?? ""),
			pointsOptions: buildAbilityOptions(overrides?.force?.[school]?.pointsAbility ?? "")
		}));

		const uniModeOptions = UNI_MODES.map(mode => ({
			value: mode,
			label: game.i18n.localize(`SW5E.Powercasting.AbilityConfig.UniMode.${mode}`),
			selected: uniMode === mode
		}));

		return {
			forceLabel: game.i18n.localize("SW5E.Powercasting.Force.Label"),
			primarySchoolRows: schoolRows.filter(row => row.school !== "uni"),
			uniFixedOptions: buildAbilityOptions(sourceForce?.uni?.attr ?? ""),
			uniModeOptions,
			uniMode,
			showUniFixed: uniMode === "fixed",
			resetLabel: game.i18n.localize("SW5E.Powercasting.AbilityConfig.Reset"),
			saveLabel: game.i18n.localize("SW5E.Powercasting.AbilityConfig.Save"),
			abilityColumnLabel: game.i18n.localize("SW5E.Powercasting.AbilityConfig.CastingAbility"),
			pointsColumnLabel: game.i18n.localize("SW5E.Powercasting.AbilityConfig.PointsAbility"),
			uniModeLabel: game.i18n.localize("SW5E.Powercasting.AbilityConfig.UniMode.Label"),
			uniFixedLabel: game.i18n.localize("SW5E.Powercasting.AbilityConfig.UniFixedAbility")
		};
	}

	_onRender(context, options) {
		super._onRender(context, options);
		const root = this.element instanceof HTMLElement ? this.element : this.element?.[0] ?? null;
		applySw5eThemeScope(root, { scope: "module-app" });
		const form = root?.querySelector("form.sw5e-power-casting-ability-config-form");
		if ( !form || form.dataset.sw5eBound === "true" ) return;
		form.dataset.sw5eBound = "true";
		form.addEventListener("submit", this.#onSubmit.bind(this));
		form.querySelector('[name="flags.sw5e.powercastingOverrides.force.uni.mode"]')?.addEventListener("change", event => {
			const fixedGroup = form.querySelector(".sw5e-uni-fixed-group");
			if ( fixedGroup ) fixedGroup.hidden = event.currentTarget.value !== "fixed";
		});
	}

	async #onSubmit(event) {
		event.preventDefault();
		if ( !this.actor ) return;

		const formData = new FormData(event.currentTarget);
		const submitAction = event.submitter?.dataset?.action ?? "save";
		/** @type {Record<string, unknown>} */
		const updateData = {};

		if ( submitAction === "reset" ) {
			for ( const school of FORCE_SCHOOLS ) {
				updateData[`system.powercasting.force.schools.${school}.attr`] = null;
				updateData[`system.powercasting.force.schools.${school}.dc`] = null;
			}
			updateData["flags.sw5e.powercastingOverrides"] = null;
		} else {
			for ( const school of ["lgt", "drk"] ) {
				const attr = String(formData.get(`system.powercasting.force.schools.${school}.attr`) ?? "").trim();
				updateData[`system.powercasting.force.schools.${school}.attr`] = attr || null;
				const points = String(formData.get(`flags.sw5e.powercastingOverrides.force.${school}.pointsAbility`) ?? "").trim();
				updateData[`flags.sw5e.powercastingOverrides.force.${school}.pointsAbility`] = points || null;
			}
			const uniModeRaw = String(formData.get("flags.sw5e.powercastingOverrides.force.uni.mode") ?? "highestEffective").trim();
			const uniMode = uniModeRaw === "fixed" ? "fixed" : "highestEffective";
			updateData["flags.sw5e.powercastingOverrides.force.uni.mode"] = uniMode;
			updateData["flags.sw5e.powercastingOverrides.force.uni.pointsAbility"] = null;
			if ( uniMode === "fixed" ) {
				const uniAttr = String(formData.get("system.powercasting.force.schools.uni.attr") ?? "").trim();
				updateData["system.powercasting.force.schools.uni.attr"] = uniAttr || null;
			} else {
				updateData["system.powercasting.force.schools.uni.attr"] = null;
			}
		}

		await this.actor.update(updateData);
		if ( submitAction === "reset" ) this.render(true);
		else await this.close();
	}
}

export function openPowerCastingAbilityConfig(actor) {
	if ( !actor ) return;
	new PowerCastingAbilityConfigApp({ actor }).render(true);
}
