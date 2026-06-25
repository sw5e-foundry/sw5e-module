import { applySw5eThemeScope } from "./theme.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const D20_ICON = "systems/dnd5e/icons/svg/dice/d20.svg";

function getRollModeChoices() {
	return Object.entries(CONFIG.Dice.rollModes).map(([value, entry]) => ({
		value,
		label: game.i18n.localize(entry.label)
	}));
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

function buildSkillPromptTitle(entry = {}) {
	const skill = entry?.label ?? localizeOrFallback("SW5E.Skill", "Skill");
	const ability = getAbilityLabel(entry?.ability);
	const formatted = game.i18n.format("DND5E.SkillPromptTitle", { ability, skill });
	if ( formatted && formatted !== "DND5E.SkillPromptTitle" ) return formatted;
	return `${ability} (${skill}) Check`;
}

export class StarshipSkillRollConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor({ actor, entry, abilities, defaultRollMode, initialMode, forcedAdvantage, systemDamageNote }={}) {
		super({
			window: {
				subtitle: actor?.name ?? ""
			}
		});
		this.actor = actor;
		this.entry = entry;
		this.abilities = abilities ?? {};
		this.defaultRollMode = defaultRollMode ?? game.settings.get("core", "rollMode");
		this.forcedAdvantage = Boolean(forcedAdvantage);
		this.systemDamageNote = systemDamageNote ?? "";
		const advantage = CONFIG?.Dice?.D20Roll?.ADV_MODE?.ADVANTAGE ?? 1;
		this.initialMode = this.forcedAdvantage ? advantage : (initialMode ?? (CONFIG?.Dice?.D20Roll?.ADV_MODE?.NORMAL ?? 0));
		this.#result = new Promise(resolve => {
			this.#resolveResult = resolve;
		});
	}

	static DEFAULT_OPTIONS = {
		tag: "dialog",
		classes: ["dnd5e2", "application", "roll-configuration", "sw5e-starship-skill-roll-config"],
		window: {
			icon: "fa-solid fa-dice",
			contentClasses: ["standard-form"]
		},
		form: {
			handler: StarshipSkillRollConfigApp.#handleFormSubmission
		},
		position: {
			width: 400,
			height: "auto"
		}
	};

	static PARTS = {
		formulas: {
			template: "systems/dnd5e/templates/dice/roll-formulas.hbs"
		},
		configuration: {
			template: "systems/dnd5e/templates/dice/roll-configuration.hbs"
		},
		buttons: {
			template: "systems/dnd5e/templates/dice/roll-buttons.hbs"
		}
	};

	#resolveResult;
	#result;
	#resolved = false;

	get title() {
		return buildSkillPromptTitle(this.entry);
	}

	get result() {
		return this.#result;
	}

	async _prepareContext(options={}) {
		return {};
	}

	async _preparePartContext(partId, context, options) {
		context = await super._preparePartContext(partId, context, options);
		switch ( partId ) {
			case "formulas":
				return this.#prepareFormulasContext(context);
			case "configuration":
				return this.#prepareConfigurationContext(context);
			case "buttons":
				return this.#prepareButtonsContext(context);
			default:
				return context;
		}
	}

	#prepareFormulasContext(context) {
		context.dice = [{ icon: D20_ICON, label: "d20" }];
		context.rolls = [{
			roll: {
				formula: buildFormulaLabel(this.entry),
				data: { situational: "" }
			}
		}];
		return context;
	}

	#prepareConfigurationContext(context) {
		const abilityOptions = Object.keys(this.abilities).map(key => ({
			value: key,
			label: getAbilityLabel(key)
		}));
		if ( !abilityOptions.length ) {
			abilityOptions.push({
				value: this.entry?.ability ?? "int",
				label: getAbilityLabel(this.entry?.ability ?? "int")
			});
		}

		context.fields = [
			{
				field: new foundry.data.fields.StringField({
					required: true,
					blank: false,
					label: game.i18n.localize("DND5E.Abilities")
				}),
				name: "ability",
				options: abilityOptions,
				value: this.entry?.ability ?? abilityOptions[0]?.value ?? "int"
			},
			{
				field: new foundry.data.fields.StringField({
					required: true,
					blank: false,
					label: game.i18n.localize("DND5E.RollMode")
				}),
				name: "rollMode",
				options: getRollModeChoices(),
				value: this.defaultRollMode
			}
		];
		return context;
	}

	#prepareButtonsContext(context) {
		const advantage = CONFIG?.Dice?.D20Roll?.ADV_MODE?.ADVANTAGE ?? 1;
		const normal = CONFIG?.Dice?.D20Roll?.ADV_MODE?.NORMAL ?? 0;
		const disadvantage = CONFIG?.Dice?.D20Roll?.ADV_MODE?.DISADVANTAGE ?? -1;

		let defaultButton = "normal";
		if ( this.initialMode === advantage ) defaultButton = "advantage";
		else if ( this.initialMode === disadvantage ) defaultButton = "disadvantage";

		if ( this.forcedAdvantage ) {
			context.buttons = {
				advantage: {
					default: true,
					label: localizeOrFallback("DND5E.Advantage", "Advantage")
				}
			};
			return context;
		}

		context.buttons = {
			advantage: {
				default: defaultButton === "advantage",
				label: localizeOrFallback("DND5E.Advantage", "Advantage")
			},
			normal: {
				default: defaultButton === "normal",
				label: localizeOrFallback("DND5E.Normal", "Normal")
			},
			disadvantage: {
				default: defaultButton === "disadvantage",
				label: localizeOrFallback("DND5E.Disadvantage", "Disadvantage")
			}
		};
		return context;
	}

	_onRender(context, options) {
		super._onRender(context, options);
		const root = this.element instanceof HTMLElement ? this.element : this.element?.[0] ?? null;
		if ( !root ) return;

		if ( root.dataset.sw5eBound !== "true" ) {
			applySw5eThemeScope(root, { scope: "roll-configuration" });
			root.dataset.sw5eBound = "true";
		}

		const actorName = this.actor?.name ?? "";
		const title = root.querySelector(".window-title");
		let subtitle = root.querySelector(".window-subtitle");
		if ( actorName && title ) {
			if ( !subtitle ) {
				subtitle = document.createElement("h2");
				subtitle.className = "window-subtitle";
				title.insertAdjacentElement("afterend", subtitle);
			}
			subtitle.textContent = actorName;
		}

		if ( this.systemDamageNote ) {
			const fieldset = root.querySelector("fieldset");
			if ( fieldset && !fieldset.nextElementSibling?.classList?.contains("sw5e-starship-skill-system-note") ) {
				const note = document.createElement("p");
				note.className = "notes sw5e-starship-skill-system-note";
				note.textContent = this.systemDamageNote;
				fieldset.insertAdjacentElement("afterend", note);
			}
		}
	}

	async close(options={}) {
		if ( !this.#resolved && !options?.submitted ) this.#finish(null);
		return super.close(options);
	}

	#finish(result) {
		if ( this.#resolved ) return;
		this.#resolved = true;
		this.#resolveResult?.(result);
	}

	static async #handleFormSubmission(event, form, formData) {
		event.preventDefault();
		const action = event.submitter?.dataset?.action ?? "normal";
		const advantage = CONFIG?.Dice?.D20Roll?.ADV_MODE ?? {};
		let advantageMode = advantage.NORMAL ?? 0;
		if ( action === "advantage" ) advantageMode = advantage.ADVANTAGE ?? 1;
		else if ( action === "disadvantage" ) advantageMode = advantage.DISADVANTAGE ?? -1;

		this.#finish({
			ability: String(formData.get("ability") || this.entry?.ability || "int"),
			bonus: String(formData.get("roll.0.situational") ?? "").trim(),
			rollMode: String(formData.get("rollMode") || this.defaultRollMode),
			advantageMode: Number.isFinite(Number(advantageMode)) ? Number(advantageMode) : this.initialMode
		});
		await this.close({ submitted: true });
	}
}

export async function promptStarshipSkillRoll(config={}) {
	const app = new StarshipSkillRollConfigApp(config);
	app.render(true);
	return app.result;
}
