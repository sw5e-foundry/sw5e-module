import {
	AUGMENTATION_CATEGORIES,
	AUGMENTATION_RARITIES
} from "./augmentations.mjs";

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
	enhancement: "SW5E.Augmentations.PickerCategoryEnhancement",
	replacement: "SW5E.Augmentations.PickerCategoryReplacement"
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

function augmentationCandidateFilter() {
	return {
		o: "OR",
		v: [
			{ k: "flags.sw5e.augmentation.category", o: "in", v: [...AUGMENTATION_CATEGORIES] },
			{ k: "flags.sw5e-importer.uid", o: "icontains", v: "subtype-enhancement" },
			{ k: "flags.sw5e-importer.uid", o: "icontains", v: "subtype-replacement" }
		]
	};
}

function augmentationCategoryFilter(category) {
	return {
		o: "OR",
		v: [
			{ k: "flags.sw5e.augmentation.category", v: category },
			{ k: "flags.sw5e-importer.uid", o: "icontains", v: `subtype-${category}` }
		]
	};
}

function augmentationRarityFilter(rarity) {
	return {
		o: "OR",
		v: [
			{ k: "flags.sw5e.augmentation.rarity", v: rarity },
			{ k: "system.rarity", o: "in", v: RARITY_VALUE_MAP[rarity] ?? [rarity] }
		]
	};
}

function defaultLockedFilters() {
	return {
		documentClass: "Item",
		types: new Set(["loot"]),
		arbitrary: [augmentationCandidateFilter()]
	};
}

export class AugmentationCompendiumBrowser extends CompendiumBrowser {
	static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
		window: {
			title: "SW5E.Augmentations.BrowserTitle"
		},
		hint: "SW5E.Augmentations.BrowserHint"
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

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		context.hint = localizeOrFallback(context.hint ?? "", context.hint ?? "");
		context.filterDefinitions.delete("price");
		context.filterDefinitions.delete("rarity");
		context.filterDefinitions.delete("source");
		context.filterDefinitions.delete("type");
		context.filterDefinitions.delete("properties");
		context.filterDefinitions.set("augmentationCategory", {
			label: "SW5E.Augmentations.ColCategory",
			type: "set",
			config: {
				choices: createChoices(AUGMENTATION_CATEGORIES, categoryLabel)
			},
			createFilter(filters, value) {
				applySetSelections(filters, value, AUGMENTATION_CATEGORIES, augmentationCategoryFilter);
			}
		});
		context.filterDefinitions.set("augmentationRarity", {
			label: "SW5E.Augmentations.ColRarity",
			type: "set",
			config: {
				choices: createChoices(AUGMENTATION_RARITIES, rarityLabel)
			},
			createFilter(filters, value) {
				applySetSelections(filters, value, AUGMENTATION_RARITIES, augmentationRarityFilter);
			}
		});
		return context;
	}

	async _renderSourceFilters() {
		// This scoped picker intentionally hides the generic source filter so only augmentation filters remain.
		return;
	}
}

export async function pickAugmentationCompendiumUuid(options = {}) {
	const locked = foundry.utils.mergeObject(defaultLockedFilters(), options.filters?.locked ?? {}, { inplace: false });
	return AugmentationCompendiumBrowser.selectOne(foundry.utils.mergeObject(options, {
		filters: { locked }
	}, { inplace: false }));
}
