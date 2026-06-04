import { getModulePath } from "./module-support.mjs";
import { applySw5eThemeScope } from "./theme.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function getRollModeChoices() {
	return {
		publicroll: game.i18n.localize("CHAT.RollPublic"),
		gmroll: game.i18n.localize("CHAT.RollPrivate"),
		blindroll: game.i18n.localize("CHAT.RollBlind"),
		selfroll: game.i18n.localize("CHAT.RollSelf")
	};
}

function getAbilityLabel(key) {
	return CONFIG?.DND5E?.abilities?.[key]?.label
		?? CONFIG?.SW5E?.abilities?.[key]?.label
		?? String(key ?? "").toUpperCase();
}

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized && localized !== key ? localized : fallback;
}

function buildFormulaLabel(entry = {}) {
	const terms = [entry?.parts?.abilityMod, entry?.parts?.proficiency, entry?.parts?.bonus]
		.map(value => Number(value))
		.filter(value => Number.isFinite(value) && value !== 0);

	let label = "1d20";
	for ( const value of terms ) {
		label += value < 0 ? ` - ${Math.abs(value)}` : ` + ${value}`;
	}
	return label;
}

export class StarshipSkillRollConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor({ actor, entry, abilities, defaultRollMode, initialMode }={}) {
		super();
		this.actor = actor;
		this.entry = entry;
		this.abilities = abilities ?? {};
		this.defaultRollMode = defaultRollMode ?? game.settings.get("core", "rollMode");
		this.initialMode = initialMode ?? (CONFIG?.Dice?.D20Roll?.ADV_MODE?.NORMAL ?? 0);
		this.#result = new Promise(resolve => {
			this.#resolveResult = resolve;
		});
	}

	static DEFAULT_OPTIONS = {
		tag: "section",
		classes: ["config-sheet", "sw5e-starship-skill-roll-config"],
		window: {
			icon: false,
			resizable: true
		},
		position: {
			width: 420,
			height: "auto"
		}
	};

	static PARTS = {
		config: {
			template: getModulePath("templates/apps/starship-skill-roll-config.hbs")
		}
	};

	#resolveResult;
	#result;
	#resolved = false;

	get title() {
		return `${this.entry?.label ?? localizeOrFallback("SW5E.Skill", "Skill")}: ${this.actor?.name ?? localizeOrFallback("TYPES.Actor.vehicle", "Vehicle")}`;
	}

	get result() {
		return this.#result;
	}

	async _prepareContext(options={}) {
		const advantage = CONFIG?.Dice?.D20Roll?.ADV_MODE?.ADVANTAGE ?? 1;
		const normal = CONFIG?.Dice?.D20Roll?.ADV_MODE?.NORMAL ?? 0;
		const disadvantage = CONFIG?.Dice?.D20Roll?.ADV_MODE?.DISADVANTAGE ?? -1;

		return {
			formulaLabel: buildFormulaLabel(this.entry),
			abilityOptions: Object.keys(this.abilities).map(key => ({
				value: key,
				label: getAbilityLabel(key),
				selected: key === this.entry?.ability
			})),
			rollModeOptions: Object.entries(getRollModeChoices()).map(([value, label]) => ({
				value,
				label,
				selected: value === this.defaultRollMode
			})),
			bonusLabel: localizeOrFallback("SW5E.Bonus", "Bonus"),
			bonusPlaceholder: localizeOrFallback("SW5E.RollSituationalBonus", "Situational Bonus?"),
			configurationLabel: localizeOrFallback("SW5E.Configuration", "Configuration"),
			abilityLabel: localizeOrFallback("SW5E.Ability", "Ability"),
			rollModeLabel: localizeOrFallback("SW5E.RollMode", "Roll Mode"),
			advantageLabel: localizeOrFallback("SW5E.Advantage", "Advantage"),
			normalLabel: localizeOrFallback("SW5E.Normal", "Normal"),
			disadvantageLabel: localizeOrFallback("SW5E.Disadvantage", "Disadvantage"),
			advantageMode: advantage,
			normalMode: normal,
			disadvantageMode: disadvantage,
			isDefaultAdvantage: this.initialMode === advantage,
			isDefaultNormal: this.initialMode === normal,
			isDefaultDisadvantage: this.initialMode === disadvantage
		};
	}

	_onRender(context, options) {
		super._onRender(context, options);
		const root = this.element instanceof HTMLElement ? this.element : this.element?.[0] ?? null;
		if ( !root || root.dataset.sw5eBound === "true" ) return;
		applySw5eThemeScope(root, { scope: "module-app" });
		root.dataset.sw5eBound = "true";

		const form = root.querySelector("form.sw5e-starship-skill-roll-form");
		if ( !form ) return;
		form.addEventListener("submit", event => event.preventDefault());
		form.querySelectorAll("[data-advantage-mode]").forEach(button => {
			button.addEventListener("click", this.#onModeClick.bind(this));
		});
	}

	async close(options={}) {
		if ( !this.#resolved ) this.#finish(null);
		return super.close(options);
	}

	#finish(result) {
		if ( this.#resolved ) return;
		this.#resolved = true;
		this.#resolveResult?.(result);
	}

	async #onModeClick(event) {
		event.preventDefault();
		const button = event.currentTarget;
		const form = button.closest("form");
		const rawMode = Number(button.dataset.advantageMode);
		this.#finish({
			ability: String(form?.ability?.value || this.entry?.ability || "int"),
			bonus: String(form?.bonus?.value ?? "").trim(),
			rollMode: String(form?.rollMode?.value || this.defaultRollMode),
			advantageMode: Number.isFinite(rawMode) ? rawMode : this.initialMode
		});
		await super.close();
	}
}

export async function promptStarshipSkillRoll(config={}) {
	const app = new StarshipSkillRollConfigApp(config);
	app.render(true);
	return app.result;
}
