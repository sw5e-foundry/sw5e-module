import {
	DROID_CUSTOMIZATION_CATEGORIES,
	DROID_CUSTOMIZATION_RARITIES
} from "./droid-customizations.mjs";

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized && localized !== key ? localized : fallback;
}

function capitalize(text) {
	return typeof text === "string" && text
		? text.charAt(0).toUpperCase() + text.slice(1)
		: "";
}

const CATEGORY_LABEL_KEYS = Object.freeze({
	part: "SW5E.DroidCustomizations.PickerCategoryPart",
	protocol: "SW5E.DroidCustomizations.PickerCategoryProtocol"
});

const RARITY_LABEL_KEYS = Object.freeze({
	standard: "DND5E.ItemRarityCommon",
	premium: "DND5E.ItemRarityUncommon",
	prototype: "DND5E.ItemRarityRare",
	advanced: "DND5E.ItemRarityVeryRare",
	legendary: "DND5E.ItemRarityLegendary",
	artifact: "DND5E.ItemRarityArtifact"
});

const RARITY_VALUE_MAP = Object.freeze({
	standard: ["", null, undefined, "common", "standard"],
	premium: ["uncommon", "premium"],
	prototype: ["rare", "prototype"],
	advanced: ["veryRare", "advanced"],
	legendary: ["legendary"],
	artifact: ["artifact"]
});

const CompendiumBrowser = globalThis.dnd5e?.applications?.CompendiumBrowser
	?? game?.dnd5e?.applications?.CompendiumBrowser;

function categoryLabel(category) {
	return localizeOrFallback(CATEGORY_LABEL_KEYS[category] ?? "", capitalize(category));
}

function rarityLabel(rarity) {
	return localizeOrFallback(RARITY_LABEL_KEYS[rarity] ?? "", capitalize(rarity));
}

function createChoices(values, labeler) {
	return values.reduce((choices, value) => {
		choices[value] = { label: labeler(value) };
		return choices;
	}, {});
}

function applySetSelections(filters, value, keys, createFilter) {
	if ( !value || typeof value !== "object" ) return;
	const positive = [];
	const negative = [];

	for ( const key of keys ) {
		if ( value[key] === 1 ) positive.push(key);
		else if ( value[key] === -1 ) negative.push(key);
	}

	if ( positive.length && positive.length < keys.length ) {
		const expressions = positive.map(createFilter);
		filters.push(expressions.length === 1 ? expressions[0] : { o: "OR", v: expressions });
	}

	for ( const key of negative ) filters.push({ o: "NOT", v: createFilter(key) });
}

function droidCustomizationCandidateFilter() {
	return {
		o: "OR",
		v: [
			{ k: "flags.sw5e.droidCustomization.category", o: "in", v: [...DROID_CUSTOMIZATION_CATEGORIES] },
			{ k: "flags.sw5e-importer.uid", o: "icontains", v: "subtype-part" },
			{ k: "flags.sw5e-importer.uid", o: "icontains", v: "subtype-protocol" }
		]
	};
}

function droidCustomizationCategoryFilter(category) {
	return {
		o: "OR",
		v: [
			{ k: "flags.sw5e.droidCustomization.category", v: category },
			{ k: "flags.sw5e-importer.uid", o: "icontains", v: `subtype-${category}` }
		]
	};
}

function droidCustomizationRarityFilter(rarity) {
	return {
		o: "OR",
		v: [
			{ k: "flags.sw5e.droidCustomization.rarity", v: rarity },
			{ k: "system.rarity", o: "in", v: RARITY_VALUE_MAP[rarity] ?? [rarity] }
		]
	};
}

function defaultLockedFilters() {
	return {
		documentClass: "Item",
		types: new Set(["loot"]),
		arbitrary: [droidCustomizationCandidateFilter()]
	};
}

export class DroidCustomizationCompendiumBrowser extends CompendiumBrowser {
	static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
		classes: ["compendium-browser", "vertical-tabs", "dialog-lg", "sw5e-droid-customizations-browser"],
		window: {
			title: "SW5E.DroidCustomizations.BrowserTitle"
		},
		hint: "SW5E.DroidCustomizations.BrowserHint"
	}, { inplace: false });

	static async select(options = {}) {
		return new Promise(resolve => {
			const browser = new this(options);
			browser.addEventListener("close", () => {
				resolve(browser.selected?.size ? browser.selected : null);
			}, { once: true });
			browser.render({ force: true });
		});
	}

	static async selectOne(options = {}) {
		const result = await this.select(
			foundry.utils.mergeObject(options, { selection: { min: 1, max: 1 } }, { inplace: false })
		);
		return result?.size ? result.first() : null;
	}

	async _prepareResultsContext(context, options) {
		context = await super._prepareResultsContext(context, options);
		context.hint = localizeOrFallback(this.options.hint ?? "", this.options.hint ?? "");
		return context;
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		context.hint = localizeOrFallback(context.hint ?? "", context.hint ?? "");
		context.filterDefinitions.delete("price");
		context.filterDefinitions.delete("rarity");
		context.filterDefinitions.delete("source");
		context.filterDefinitions.delete("type");
		context.filterDefinitions.delete("properties");
		context.filterDefinitions.set("droidCustomizationCategory", {
			label: "SW5E.DroidCustomizations.ColCategory",
			type: "set",
			config: {
				choices: createChoices(DROID_CUSTOMIZATION_CATEGORIES, categoryLabel)
			},
			createFilter(filters, value) {
				applySetSelections(filters, value, DROID_CUSTOMIZATION_CATEGORIES, droidCustomizationCategoryFilter);
			}
		});
		context.filterDefinitions.set("droidCustomizationRarity", {
			label: "SW5E.DroidCustomizations.ColRarity",
			type: "set",
			config: {
				choices: createChoices(DROID_CUSTOMIZATION_RARITIES, rarityLabel)
			},
			createFilter(filters, value) {
				applySetSelections(filters, value, DROID_CUSTOMIZATION_RARITIES, droidCustomizationRarityFilter);
			}
		});
		return context;
	}

	async _renderSourceFilters() {
		// This scoped picker intentionally hides the generic source filter so only droid customization filters remain.
		return;
	}
}

export async function pickDroidCustomizationCompendiumUuid(options = {}) {
	const locked = foundry.utils.mergeObject(defaultLockedFilters(), options.filters?.locked ?? {}, { inplace: false });
	return DroidCustomizationCompendiumBrowser.selectOne(foundry.utils.mergeObject(options, {
		filters: { locked }
	}, { inplace: false }));
}
