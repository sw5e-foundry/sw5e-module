import { getModulePath, SETTINGS_NAMESPACE } from "./module-support.mjs";
import {
	applySw5eCurrencyConfig,
	CURRENCY_CUSTOM_RATES_SETTING,
	CURRENCY_ENABLED_MAP_SETTING,
	getCurrencySettingsRows,
	rerenderOpenWindows,
	syncWorldActorCurrencyWallets
} from "./currencies.mjs";
import { applySw5eThemeScope } from "./theme.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function parseCustomRate(value) {
	const text = String(value ?? "").trim();
	if ( !text ) return null;
	const numeric = Number(text);
	return Number.isFinite(numeric) && (numeric > 0) ? numeric : null;
}

export class CurrencySettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		tag: "section",
		classes: ["config-sheet", "currency-settings-app"],
		window: {
			resizable: true
		},
		position: {
			width: 760,
			height: 720
		}
	};

	static PARTS = {
		config: {
			template: getModulePath("templates/apps/currency-settings.hbs")
		}
	};

	get title() {
		return game.i18n.localize("SW5E.CurrencySettingsTitle");
	}

	async _prepareContext() {
		return {
			currencies: getCurrencySettingsRows(),
			introHint: game.i18n.localize("SW5E.CurrencySettingsHint"),
			enabledLabel: game.i18n.localize("SW5E.CurrencySettingsEnabled"),
			abbreviationLabel: game.i18n.localize("SW5E.CurrencySettingsAbbreviation"),
			exchangeRateLabel: game.i18n.localize("SW5E.CurrencySettingsExchangeRate"),
			fixedRateLabel: game.i18n.localize("SW5E.CurrencySettingsFixedRate"),
			customRatePlaceholder: game.i18n.localize("SW5E.CurrencySettingsCustomRatePlaceholder"),
			baseCurrencyHint: game.i18n.localize("SW5E.CurrencySettingsBaseCurrencyHint"),
			referenceOnlyHint: game.i18n.localize("SW5E.CurrencySettingsReferenceOnlyHint"),
			saveLabel: game.i18n.localize("SW5E.CurrencySettingsSave")
		};
	}

	_onRender(context, options) {
		super._onRender(context, options);
		const root = this.element instanceof HTMLElement ? this.element : this.element?.[0] ?? null;
		applySw5eThemeScope(root, { scope: "module-app" });
		const form = root?.querySelector("form.sw5e-currency-settings-form");
		if ( !form || form.dataset.sw5eBound === "true" ) return;
		form.dataset.sw5eBound = "true";
		form.addEventListener("submit", this.#onSubmit.bind(this));
	}

	async #onSubmit(event) {
		event.preventDefault();
		const formData = new FormData(event.currentTarget);
		const enabledMap = {};
		const customRates = {};

		for ( const currency of getCurrencySettingsRows() ) {
			enabledMap[currency.key] = currency.isBaseCurrency
				? true
				: (formData.get(`enabled.${currency.key}`) === "on");

			if ( currency.fixed ) continue;
			const customRate = parseCustomRate(formData.get(`customRate.${currency.key}`));
			if ( customRate != null ) customRates[currency.key] = customRate;
		}

		await game.settings.set(SETTINGS_NAMESPACE, CURRENCY_ENABLED_MAP_SETTING, enabledMap);
		await game.settings.set(SETTINGS_NAMESPACE, CURRENCY_CUSTOM_RATES_SETTING, customRates);
		applySw5eCurrencyConfig(CONFIG.DND5E, true);
		await syncWorldActorCurrencyWallets();
		rerenderOpenWindows();
		ui.notifications.info(game.i18n.localize("SW5E.CurrencySettingsSaved"));
		this.render(true);
	}
}
