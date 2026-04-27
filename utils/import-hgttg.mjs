import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeWeaponProficiencyValue } from "../scripts/proficiency-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const LEGACY_DB_PATH = path.join(ROOT, ".hgttg-import", "packs", "heretics-guide-to-the-galaxy.db");
const LEGACY_ICON_DIR = path.join(ROOT, ".hgttg-import", "packs", "Icons");
const CORE_SPECIES_DIR = path.join(ROOT, "packs", "_source", "species");
const CORE_SPECIES_FEATURES_DIR = path.join(ROOT, "packs", "_source", "speciesfeatures");
const HGTTG_SPECIES_DIR = path.join(ROOT, "packs", "_source", "hgttgspecies");
const HGTTG_SPECIES_FEATURES_DIR = path.join(ROOT, "packs", "_source", "hgttgspeciesfeatures");
const ICON_DEST_DIR = path.join(ROOT, "icons", "packs", "Species");
const ART_MANIFEST_PATH = path.join(ROOT, "utils", "hgttg-art-sources.json");
const PDF_ART_MANIFEST_PATH = path.join(ROOT, "utils", "hgttg-pdf-art-sources.json");
const ARGS = new Set(process.argv.slice(2));
const ARG_LIST = process.argv.slice(2);
const HGTTG_SPECIES_FEATURES_PACK = "hgttgspeciesfeatures";
const DEFAULT_MARKDOWN_PATH = path.resolve(ROOT, "..", "..", "SW5e Docs", "hgttg.md");

const CORE_VERSION = "12.331";
const SYSTEM_ID = "dnd5e";
const SYSTEM_VERSION = "5.2.5";
const LAST_MODIFIED_BY = "dnd5ebuilder0000";

const MARKDOWN_SECTION_HEADINGS = new Set([
	"Visual Characteristics",
	"Physical Characteristics",
	"Sociocultural Characteristics",
	"Biology and Appearance",
	"Society and Culture",
	"Names"
]);

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ABILITY_MAP = {
	strength: "str",
	dexterity: "dex",
	constitution: "con",
	intelligence: "int",
	wisdom: "wis",
	charisma: "cha"
};
const SIZE_MAP = {
	tiny: "tiny",
	sm: "sm",
	small: "sm",
	med: "med",
	medium: "med",
	lg: "lg",
	large: "lg"
};
const SKILL_MAP = {
	acrobatics: "acr",
	"animal handling": "ani",
	athletics: "ath",
	deception: "dec",
	insight: "ins",
	intimidation: "itm",
	investigation: "inv",
	lore: "lor",
	medicine: "med",
	nature: "nat",
	perception: "prc",
	performance: "prf",
	persuasion: "per",
	piloting: "pil",
	"sleight of hand": "slt",
	stealth: "ste",
	survival: "sur",
	technology: "tec"
};

function hashToId(seed, length=16) {
	const hex = crypto.createHash("sha1").update(seed).digest("hex");
	let value = BigInt(`0x${hex}`);
	let encoded = "";
	while ( value > 0n ) {
		const index = Number(value % 62n);
		encoded = BASE62[index] + encoded;
		value /= 62n;
	}
	encoded = encoded || "0";
	if ( encoded.length >= length ) return encoded.slice(0, length);
	return encoded.padStart(length, "0");
}

function slugify(value) {
	return String(value ?? "")
		.normalize("NFKD")
		.replace(/[^\w\s-]/g, " ")
		.toLowerCase()
		.replace(/[_\s]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function normalizeWhitespace(value) {
	return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getArgValue(name, fallback = undefined) {
	const index = ARG_LIST.indexOf(name);
	if ( index === -1 ) return fallback;
	const value = ARG_LIST[index + 1];
	if ( !value || value.startsWith("--") ) return fallback;
	return value;
}

function decodeEntities(value) {
	return String(value ?? "")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&quot;/gi, "\"")
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&rsquo;|&lsquo;/gi, "'")
		.replace(/&rdquo;|&ldquo;/gi, "\"")
		.replace(/&ndash;/gi, "-")
		.replace(/&mdash;/gi, "-")
		.replace(/&hellip;/gi, "...")
		.replace(/&uuml;/gi, "u")
		.replace(/&ouml;/gi, "o")
		.replace(/&auml;/gi, "a")
		.replace(/&eacute;/gi, "e")
		.replace(/&agrave;/gi, "a")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">");
}

function stripTags(value) {
	return normalizeWhitespace(decodeEntities(String(value ?? "").replace(/<[^>]+>/g, " ")));
}

function extractFeatureParagraphs(html) {
	const normalized = String(html ?? "").replace(/<p\b[^>]*>/gi, "\n<p>");
	return normalized
		.split("\n")
		.map(part => part.trim())
		.filter(Boolean)
		.filter(part => part.startsWith("<p>"))
		.map(part => part.endsWith("</p>") ? part : `${part}</p>`);
}

function extractFeatureTitle(featureHtml) {
	const strong = featureHtml.match(/<strong>([\s\S]*?)<\/strong>/i)?.[1];
	const raw = strong ? stripTags(strong) : stripTags(featureHtml).split(".")[0];
	return normalizeWhitespace(raw.replace(/[.:]$/, ""));
}

function buildSafeFeatureSlug(featureTitle, { maxLength=64 }={}) {
	const rawSlug = slugify(featureTitle) || "feature";
	if ( rawSlug.length <= maxLength ) return rawSlug;
	const hashSuffix = hashToId(`hgttg:feature-slug:${featureTitle}`, 8).toLowerCase();
	const prefixLength = Math.max(8, maxLength - hashSuffix.length - 1);
	return `${rawSlug.slice(0, prefixLength).replace(/-+$/g, "")}-${hashSuffix}`;
}

function buildStats() {
	return {
		duplicateSource: null,
		coreVersion: CORE_VERSION,
		systemId: SYSTEM_ID,
		systemVersion: SYSTEM_VERSION,
		createdTime: null,
		modifiedTime: null,
		lastModifiedBy: LAST_MODIFIED_BY
	};
}

function buildEffectStats() {
	return {
		coreVersion: "12.330",
		systemId: null,
		systemVersion: null,
		createdTime: null,
		modifiedTime: null,
		lastModifiedBy: null,
		compendiumSource: null,
		duplicateSource: null
	};
}

function buildFeatureItem({ speciesName, speciesSlug, featureTitle, featureSlug, featureHtml, imgPath, sourceText, artAttribution = null }) {
	const id = hashToId(`hgttg:feature:${speciesSlug}:${featureSlug}`);
	return {
		name: featureTitle,
		flags: {
			"sw5e-importer": {
				timestamp: new Date().toISOString(),
				importer_version: 4,
				uid: `Feature.name-${featureSlug}.source-species.sourceName-${speciesSlug}`
			},
			...(artAttribution ? { "sw5e-module": { hgttgArt: artAttribution } } : {})
		},
		type: "feat",
		img: imgPath,
		system: {
			description: {
				value: featureHtml,
				chat: ""
			},
			requirements: speciesName,
			source: {
				custom: sourceText,
				revision: 1,
				rules: "2024"
			},
			type: {
				value: "species",
				subtype: ""
			},
			uses: {
				spent: 0,
				recovery: []
			},
			activities: [],
			identifier: featureSlug,
			enchant: {},
			prerequisites: {
				level: null
			},
			properties: []
		},
		effects: [],
		_id: id,
		folder: null,
		sort: 0,
		ownership: {
			default: 0
		},
		_stats: buildStats(),
		_key: `!items!${id}`
	};
}

function buildRaceItem({
	legacyItem,
	speciesSlug,
	imgPath,
	featureItems,
	advancement,
	movement,
	senses,
	effectChanges,
	artAttribution = null
}) {
	const id = hashToId(`hgttg:species:${speciesSlug}`);
	const sourceText = legacyItem.data?.source || "HGTTG";
	const effectId = hashToId(`hgttg:species:${speciesSlug}:effect`);
	return {
		name: legacyItem.name,
		flags: {
			"sw5e-importer": {
				timestamp: new Date().toISOString(),
				importer_version: 4,
				uid: `Species.name-${speciesSlug}`
			},
			...(artAttribution ? { "sw5e-module": { hgttgArt: artAttribution } } : {})
		},
		type: "race",
		img: imgPath,
		system: {
			description: {
				value: legacyItem.data?.description?.value ?? "",
				chat: legacyItem.data?.description?.chat ?? ""
			},
			source: {
				custom: sourceText
			},
			identifier: speciesSlug,
			details: {
				isDroid: false
			},
			type: {
				value: "humanoid"
			},
			movement,
			senses,
			advancement,
			skinColorOptions: {
				value: legacyItem.data?.skinColorOptions?.value ?? ""
			},
			hairColorOptions: {
				value: legacyItem.data?.hairColorOptions?.value ?? ""
			},
			eyeColorOptions: {
				value: legacyItem.data?.eyeColorOptions?.value ?? ""
			},
			colorScheme: {
				value: ""
			},
			distinctions: {
				value: legacyItem.data?.distinctions?.value ?? ""
			},
			heightAverage: {
				value: legacyItem.data?.heightAverage?.value ?? ""
			},
			heightRollMod: {
				value: legacyItem.data?.heightRollMod?.value ?? ""
			},
			weightAverage: {
				value: legacyItem.data?.weightAverage?.value ?? ""
			},
			weightRollMod: {
				value: legacyItem.data?.weightRollMod?.value ?? ""
			},
			homeworld: {
				value: legacyItem.data?.homeworld?.value ?? ""
			},
			slanguage: {
				value: legacyItem.data?.slanguage?.value ?? ""
			},
			droidDistinctions: {
				value: ""
			},
			manufacturer: {
				value: ""
			},
			droidLanguage: {
				value: ""
			}
		},
		effects: effectChanges.length ? [{
			_id: effectId,
			changes: effectChanges,
			disabled: false,
			duration: {
				startTime: null,
				seconds: null,
				combat: null,
				rounds: null,
				turns: null,
				startRound: null,
				startTurn: null
			},
			tint: "#ffffff",
			transfer: true,
			flags: {},
			origin: null,
			name: legacyItem.name,
			description: "",
			statuses: [],
			_stats: buildEffectStats(),
			img: imgPath,
			type: "base",
			system: {},
			sort: 0,
			_key: `!items.effects!${id}.${effectId}`
		}] : [],
		_id: id,
		folder: null,
		sort: 0,
		ownership: {
			default: 0
		},
		_stats: buildStats(),
		_key: `!items!${id}`
	};
}

function parseAbilityScoreAdvancement(featureText, effectAbilityBonuses) {
	const fixed = {};
	let points = 0;
	const plain = normalizeWhitespace(stripTags(featureText));
	const parseAbilityList = value => Object.entries(ABILITY_MAP)
		.filter(([name]) => new RegExp(`\\b${name}\\b`, "i").test(value))
		.map(([, key]) => key);

	const choicePatterns = [
		[/one ability score of your choice increases by 2/gi, 2],
		[/one other ability score of your choice increases by 1/gi, 1],
		[/two other ability scores of your choice increase by 1/gi, 2],
		[/three different ability scores of your choice increase by 1/gi, 3],
		[/four ability scores of your choice each increase by 1/gi, 4]
	];
	for ( const [pattern, value] of choicePatterns ) {
		if ( pattern.test(plain) ) points += value;
	}

	for ( const match of plain.matchAll(/\b(?:your|you)\s+([a-z ,'-]+?)\s+scores?\s+increases? by\s+(\d+)/gi) ) {
		const amount = Number(match[2] ?? 0);
		if ( !amount ) continue;
		const segment = normalizeWhitespace(match[1].toLowerCase());
		if ( segment.includes("ability score of your choice") ) continue;
		if ( segment.includes(" or ") ) {
			points += amount;
			continue;
		}
		const abilities = parseAbilityList(segment);
		if ( abilities.length ) {
			for ( const ability of abilities ) fixed[ability] = (fixed[ability] ?? 0) + amount;
		}
	}

	if ( !Object.keys(fixed).length && !points ) {
		for ( const [ability, amount] of Object.entries(effectAbilityBonuses) ) {
			if ( !amount ) continue;
			fixed[ability] = amount;
		}
	}

	return {
		_id: hashToId(`hgttg:adv:asi:${plain}`),
		configuration: {
			fixed,
			points,
			cap: 2,
			locked: []
		},
		level: 0,
		type: "AbilityScoreImprovement",
		value: {
			type: "asi"
		}
	};
}

function buildSizeAdvancement(size) {
	return {
		_id: hashToId(`hgttg:adv:size:${size}`),
		configuration: {
			sizes: [size]
		},
		level: 0,
		type: "Size",
		value: {}
	};
}

function buildItemGrantAdvancement(speciesFeatures) {
	return {
		_id: hashToId(`hgttg:adv:itemgrant:${speciesFeatures.map(item => item._id).join(":")}`),
		configuration: {
			items: speciesFeatures.map(item => ({
				uuid: `Compendium.sw5e-module.${HGTTG_SPECIES_FEATURES_PACK}.${item._id}`,
				optional: false
			})),
			optional: true,
			spell: null
		},
		level: 0,
		title: "Features",
		type: "ItemGrant",
		value: {}
	};
}

function collectChoicePools(featureTexts) {
	const choiceMap = new Map();
	const addChoice = (count, pool) => {
		const key = `${count}:${pool.join("|")}`;
		if ( choiceMap.has(key) ) return;
		choiceMap.set(key, { count, pool });
	};

	for ( const text of featureTexts ) {
		const plain = normalizeWhitespace(stripTags(text)).toLowerCase();
		if ( /one skill of your choice/.test(plain) ) addChoice(1, ["skills:*"]);
		if ( /one tool of your choice/.test(plain) ) addChoice(1, ["tool:*"]);
		if ( /one weapon of your choice/.test(plain) ) addChoice(1, ["weapon:*"]);
		if ( /one artisan'?s implements of your choice/.test(plain) ) addChoice(1, ["tool:artisan:*"]);
		if ( /one musical instrument of your choice/.test(plain) ) addChoice(1, ["tool:music:*"]);
		if ( /one gaming set of your choice/.test(plain) ) addChoice(1, ["tool:game:*"]);
		if ( /one kit of your choice/.test(plain) ) addChoice(1, ["tool:specialist:*"]);

		const skillMatch = plain.match(/proficiency in ([a-z' -]+?) or ([a-z' -]+?)(?: skill)?(?: \(your choice\))?[.]/);
		if ( skillMatch ) {
			const first = SKILL_MAP[normalizeWhitespace(skillMatch[1])];
			const second = SKILL_MAP[normalizeWhitespace(skillMatch[2])];
			if ( first && second ) addChoice(1, [`skills:${first}`, `skills:${second}`]);
		}
	}

	return Array.from(choiceMap.values());
}

function buildTraitAdvancement(grants, choices) {
	if ( !grants.length && !choices.length ) return null;
	return {
		_id: hashToId(`hgttg:adv:traits:${grants.join(":")}:${JSON.stringify(choices)}`),
		configuration: {
			choices,
			grants,
			mode: "default",
			allowReplacements: false
		},
		level: 0,
		type: "Trait",
		value: {
			chosen: []
		}
	};
}

function parseLegacyEffects(legacyItem, featureTexts) {
	const grants = new Set();
	const residualChanges = [];
	const effectAbilityBonuses = {};

	const movement = {
		walk: 30,
		burrow: null,
		climb: null,
		fly: null,
		swim: null,
		units: null,
		hover: false
	};
	const senses = {
		darkvision: null,
		blindsight: null,
		tremorsense: null,
		truesight: null,
		units: null,
		special: ""
	};
	let size = "med";

	for ( const effect of legacyItem.effects ?? [] ) {
		for ( const change of effect.changes ?? [] ) {
			if ( !change?.key ) continue;
			const key = String(change.key).replace(/^data\./, "system.");
			const value = change.value;

			if ( key === "system.details.species" ) continue;
			if ( key === "system.traits.languages.value" ) continue;
			if ( key === "system.traits.languages.custom" ) continue;

			const abilityMatch = key.match(/^system\.abilities\.(str|dex|con|int|wis|cha)\.value$/);
			if ( abilityMatch ) {
				effectAbilityBonuses[abilityMatch[1]] = Number(value ?? 0);
				continue;
			}

			const movementMatch = key.match(/^system\.attributes\.movement\.(walk|burrow|climb|fly|swim)$/);
			if ( movementMatch ) {
				const type = movementMatch[1];
				movement[type] = Number(value ?? 0) || null;
				continue;
			}

			const senseMatch = key.match(/^system\.attributes\.senses\.(darkvision|blindsight|tremorsense|truesight)$/);
			if ( senseMatch ) {
				const type = senseMatch[1];
				senses[type] = Number(value ?? 0) || null;
				continue;
			}

			if ( key === "system.traits.size" ) {
				size = SIZE_MAP[String(value).toLowerCase()] ?? "med";
				continue;
			}

			const skillMatch = key.match(/^system\.skills\.([a-z]{3})\.value$/);
			if ( skillMatch && Number(value ?? 0) >= 1 ) {
				grants.add(`skills:${skillMatch[1]}`);
				continue;
			}

			if ( key === "system.traits.weaponProf.custom" && value ) {
				grants.add(`weapon:${normalizeWeaponProficiencyValue(String(value))}`);
				continue;
			}

			if ( key === "system.traits.toolProf.custom" && value ) {
				residualChanges.push({
					key,
					mode: change.mode,
					priority: change.priority ?? 20,
					value: String(value)
				});
				continue;
			}

			const traitGrantMatch = key.match(/^system\.traits\.(dr|di|dv|ci)\.value$/);
			if ( traitGrantMatch && value ) {
				const prefix = traitGrantMatch[1];
				for ( const part of String(value).split(/[;,]/).map(item => normalizeWhitespace(item)).filter(Boolean) ) {
					grants.add(`${prefix}:${part.toLowerCase()}`);
				}
				continue;
			}

			residualChanges.push({
				key,
				mode: change.mode,
				priority: change.priority ?? 20,
				value: String(value ?? "")
			});
		}
	}

	const choices = collectChoicePools(featureTexts);

	return {
		effectAbilityBonuses,
		grants: Array.from(grants),
		choices,
		residualChanges,
		movement,
		senses,
		size
	};
}

function normalizeMarkdownLines(markdown) {
	return String(markdown ?? "")
		.replace(/\r/g, "")
		.split("\n")
		.map(line => normalizeWhitespace(line))
		.filter(Boolean);
}

function parseMarkdownSpeciesNames(lines) {
	const tocStart = lines.findIndex(line => line === "Table of Contents");
	if ( tocStart === -1 ) throw new Error("Could not find HGTTG table of contents in markdown.");
	const firstSpeciesIndex = lines.findIndex((line, index) => index > tocStart && line === "Abednedo" && lines[index + 1] === "Visual Characteristics");
	if ( firstSpeciesIndex === -1 ) throw new Error("Could not find first HGTTG species section in markdown.");
	const toc = lines.slice(tocStart + 1, firstSpeciesIndex);
	const names = [];
	for ( let i = 0; i < toc.length; i += 1 ) {
		const line = toc[i];
		if ( /^pg\d+$/i.test(line) ) continue;
		if ( /^Heretic's Guide to the Galaxy$/i.test(line) ) continue;
		if ( /^Table of Contents$/i.test(line) ) continue;
		const nextIsPage = /^pg\d+$/i.test(toc[i + 1] ?? "");
		const previousIsPage = /^pg\d+$/i.test(toc[i - 1] ?? "");
		if ( nextIsPage || previousIsPage ) names.push(line);
	}
	return Array.from(new Set(names));
}

function parseMarkdownTable(lines, startIndex, endHeading) {
	const data = {};
	let index = startIndex + 1;
	while ( index < lines.length && lines[index] !== endHeading ) {
		const line = lines[index];
		const match = line.match(/^([^	]+?)(?:\t+|\s{2,})(.+)$/);
		if ( match ) data[normalizeWhitespace(match[1])] = normalizeWhitespace(match[2]);
		index += 1;
	}
	return { data, nextIndex: index };
}

function readMarkdownParagraph(lines, startIndex, endHeadings) {
	const parts = [];
	let index = startIndex + 1;
	while ( index < lines.length && !endHeadings.has(lines[index]) && !lines[index].endsWith(" Traits") ) {
		parts.push(lines[index]);
		index += 1;
	}
	return { text: normalizeWhitespace(parts.join(" ")), nextIndex: index };
}

function parseMarkdownTraits(lines, startIndex) {
	const traits = [];
	let index = startIndex + 1;
	if ( /^As an? /i.test(lines[index] ?? "") ) index += 1;
	let current = null;
	while ( index < lines.length && !/^ART CREDIT\b/i.test(lines[index]) ) {
		const line = lines[index];
		const match = line.match(/^([A-Z][A-Za-z0-9'’(), -]+?)\.\s+(.+)$/);
		if ( match ) {
			if ( current ) traits.push(current);
			current = {
				title: normalizeWhitespace(match[1].replace(/[’]/g, "'")),
				text: normalizeWhitespace(match[2])
			};
		} else if ( current ) {
			current.text = normalizeWhitespace(`${current.text} ${line}`);
		}
		index += 1;
	}
	if ( current ) traits.push(current);
	return traits;
}

function buildDescriptionHtml(section) {
	const blocks = [];
	const addBlock = (heading, text) => {
		if ( !text ) return;
		blocks.push(`<h2>${heading}</h2>`);
		blocks.push(`<p>${text}</p>`);
	};
	addBlock("Biology and Appearance", section.description.biography);
	addBlock("Society and Culture", section.description.society);
	if ( section.description.names ) {
		blocks.push("<h2>Names</h2>");
		blocks.push(`<p>${section.description.names}</p>`);
		for ( const nameLine of section.nameLines ) blocks.push(`<p>&nbsp;&nbsp;<strong>${nameLine.title}.</strong> ${nameLine.text}</p>`);
	}
	return blocks.join("\n");
}

function buildMarkdownFeatureHtml(trait) {
	return `<p><em><strong>${trait.title}.</strong></em> ${trait.text}</p>`;
}

function parseSizeFromText(featureTexts) {
	const sizeText = featureTexts.find(text => /^<p><em><strong>Size\./i.test(text));
	const plain = stripTags(sizeText ?? "");
	if ( /\bTiny\b/i.test(plain) ) return "tiny";
	if ( /\bSmall\b/i.test(plain) ) return "sm";
	if ( /\bLarge\b/i.test(plain) ) return "lg";
	return "med";
}

function parseMovementFromText(featureTexts) {
	const movement = {
		walk: 30,
		burrow: null,
		climb: null,
		fly: null,
		swim: null,
		units: null,
		hover: false
	};
	const speedText = featureTexts.map(stripTags).join(" ");
	const walk = speedText.match(/base walking speed is (\d+) feet/i)?.[1];
	if ( walk ) movement.walk = Number(walk);
	const climb = speedText.match(/climb(?:ing)? speed (?:equal to your walking speed|of (\d+) feet)/i);
	if ( climb ) movement.climb = climb[1] ? Number(climb[1]) : movement.walk;
	const fly = speedText.match(/fly(?:ing)? speed (?:equal to your walking speed|of (\d+) feet)/i);
	if ( fly ) movement.fly = fly[1] ? Number(fly[1]) : movement.walk;
	const swim = speedText.match(/swim(?:ming)? speed (?:equal to your walking speed|of (\d+) feet)/i);
	if ( swim ) movement.swim = swim[1] ? Number(swim[1]) : movement.walk;
	const burrow = speedText.match(/burrow(?:ing)? speed (?:equal to your walking speed|of (\d+) feet)/i);
	if ( burrow ) movement.burrow = burrow[1] ? Number(burrow[1]) : movement.walk;
	return movement;
}

function parseSensesFromText(featureTexts) {
	const text = featureTexts.map(stripTags).join(" ");
	return {
		darkvision: Number(text.match(/darkvision[^.]*within (\d+) feet/i)?.[1] ?? text.match(/darkvision[^.]*out to (\d+) feet/i)?.[1]) || null,
		blindsight: Number(text.match(/blindsight[^.]*out to (\d+) feet/i)?.[1]) || null,
		tremorsense: Number(text.match(/tremorsense[^.]*out to (\d+) feet/i)?.[1]) || null,
		truesight: Number(text.match(/truesight[^.]*out to (\d+) feet/i)?.[1]) || null,
		units: null,
		special: ""
	};
}

function collectSkillGrantsFromText(plain, grants) {
	const addSkill = value => {
		const skill = SKILL_MAP[normalizeWhitespace(value).toLowerCase()];
		if ( skill ) grants.add(`skills:${skill}`);
	};

	for ( const [label, key] of Object.entries(SKILL_MAP) ) {
		const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const patterns = [
			new RegExp(`proficiency in the ${escaped} skill`, "i"),
			new RegExp(`proficient in the ${escaped} skill`, "i"),
			new RegExp(`proficiency in ${escaped}(?: and|,|\\.)`, "i")
		];
		if ( patterns.some(pattern => pattern.test(plain)) ) grants.add(`skills:${key}`);
	}

	for ( const match of plain.matchAll(/\b(?:proficiency in|proficient in)\s+(?:the\s+)?([a-z' -]+(?:,\s*[a-z' -]+)*(?:,?\s+and\s+[a-z' -]+)?)\s+skills?\b/gi) ) {
		const segment = match[1].replace(/\byour choice of\b/gi, "");
		for ( const part of segment.split(/\s*,\s*|\s+and\s+/i) ) addSkill(part);
	}
}

function parseMarkdownTraitEffects(featureTexts) {
	const grants = new Set();
	const residualChanges = [];
	for ( const featureText of featureTexts ) {
		const plain = stripTags(featureText).toLowerCase();
		collectSkillGrantsFromText(plain, grants);
		if ( /resistance (?:against|to) poison damage/i.test(plain) ) grants.add("dr:poison");
		if ( /resistance (?:against|to) acid damage/i.test(plain) ) grants.add("dr:acid");
		if ( /resistance (?:against|to) cold damage/i.test(plain) ) grants.add("dr:cold");
		if ( /resistance (?:against|to) fire damage/i.test(plain) ) grants.add("dr:fire");
		if ( /resistance (?:against|to) lightning damage/i.test(plain) ) grants.add("dr:lightning");
		if ( /resistance (?:against|to) necrotic damage/i.test(plain) ) grants.add("dr:necrotic");
	}
	return {
		effectAbilityBonuses: {},
		grants: Array.from(grants),
		choices: collectChoicePools(featureTexts),
		residualChanges,
		movement: parseMovementFromText(featureTexts),
		senses: parseSensesFromText(featureTexts),
		size: parseSizeFromText(featureTexts)
	};
}

function parseMarkdownSpeciesSections(markdown) {
	const lines = normalizeMarkdownLines(markdown);
	const names = parseMarkdownSpeciesNames(lines);
	const sections = [];
	let searchStart = lines.findIndex((line, index) => line === names[0] && lines[index + 1] === "Visual Characteristics");
	for ( const name of names ) {
		const start = lines.findIndex((line, index) => index >= searchStart && line === name && lines[index + 1] === "Visual Characteristics");
		if ( start === -1 ) {
			sections.push({ name, missing: true });
			continue;
		}
		searchStart = start + 1;
		const section = {
			name,
			visual: {},
			physical: {},
			sociocultural: {},
			description: {},
			nameLines: [],
			traits: []
		};
		let index = start + 1;
		while ( index < lines.length ) {
			const line = lines[index];
			if ( index > start + 1 && names.includes(line) && lines[index + 1] === "Visual Characteristics" ) break;
			if ( line === "Visual Characteristics" ) {
				const parsed = parseMarkdownTable(lines, index, "Physical Characteristics");
				section.visual = parsed.data;
				index = parsed.nextIndex;
				continue;
			}
			if ( line === "Physical Characteristics" ) {
				const parsed = parseMarkdownTable(lines, index, "Sociocultural Characteristics");
				section.physical = parsed.data;
				index = parsed.nextIndex;
				continue;
			}
			if ( line === "Sociocultural Characteristics" ) {
				const parsed = parseMarkdownTable(lines, index, "Biology and Appearance");
				section.sociocultural = parsed.data;
				index = parsed.nextIndex;
				continue;
			}
			if ( line === "Biology and Appearance" ) {
				const parsed = readMarkdownParagraph(lines, index, MARKDOWN_SECTION_HEADINGS);
				section.description.biography = parsed.text;
				index = parsed.nextIndex;
				continue;
			}
			if ( line === "Society and Culture" ) {
				const parsed = readMarkdownParagraph(lines, index, MARKDOWN_SECTION_HEADINGS);
				section.description.society = parsed.text;
				index = parsed.nextIndex;
				continue;
			}
			if ( line === "Names" ) {
				const parsed = readMarkdownParagraph(lines, index, new Set([`${name} Traits`]));
				const nameParts = parsed.text.split(/(?=\b(?:Male Names|Female Names|Surnames|First Names|Personal Names|Surname)\.)/);
				section.description.names = normalizeWhitespace(nameParts.shift() ?? "");
				section.nameLines = nameParts.map(part => {
					const match = part.match(/^(.+?)\.\s*(.+)$/);
					return match ? { title: normalizeWhitespace(match[1]), text: normalizeWhitespace(match[2]) } : null;
				}).filter(Boolean);
				index = parsed.nextIndex;
				continue;
			}
			if ( line === `${name} Traits` ) {
				section.traits = parseMarkdownTraits(lines, index);
				break;
			}
			index += 1;
		}
		sections.push(section);
	}
	return { names, sections };
}

async function readCurrentSpeciesNames() {
	const names = new Set();
	for ( const entry of await fs.readdir(CORE_SPECIES_DIR) ) {
		if ( !entry.endsWith(".json") ) continue;
		const filePath = path.join(CORE_SPECIES_DIR, entry);
		const json = JSON.parse(await fs.readFile(filePath, "utf8"));
		names.add(normalizeWhitespace(json.name).toLowerCase());
	}
	return names;
}

async function loadLegacySpecies() {
	const raw = await fs.readFile(LEGACY_DB_PATH, "utf8");
	return raw
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(Boolean)
		.map(line => JSON.parse(line))
		.filter(entry => entry.type === "species");
}

async function loadLegacySpeciesByName() {
	try {
		const species = await loadLegacySpecies();
		return new Map(species.map(item => [normalizeWhitespace(item.name).toLowerCase(), item]));
	} catch {
		return new Map();
	}
}

async function writeJson(filePath, data) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readJson(filePath, fallback = null) {
	try {
		return JSON.parse(await fs.readFile(filePath, "utf8"));
	} catch (error) {
		if ( error?.code === "ENOENT" ) return fallback;
		throw error;
	}
}

async function readJsonFilesFromDirectory(directoryPath) {
	try {
		return await fs.readdir(directoryPath);
	} catch {
		return [];
	}
}

async function cleanGeneratedImports() {
	const cleanupTargets = [
		{ speciesDir: CORE_SPECIES_DIR, featureDir: CORE_SPECIES_FEATURES_DIR },
		{ speciesDir: HGTTG_SPECIES_DIR, featureDir: HGTTG_SPECIES_FEATURES_DIR }
	];

	for ( const { speciesDir, featureDir } of cleanupTargets ) {
		for ( const entry of await readJsonFilesFromDirectory(speciesDir) ) {
			if ( !entry.endsWith(".json") ) continue;
			const filePath = path.join(speciesDir, entry);
			const json = JSON.parse(await fs.readFile(filePath, "utf8"));
			if ( json.system?.source?.custom !== "HGTTG" ) continue;

			const identifier = json.system?.identifier || path.basename(entry, ".json");
			const imgFileName = path.basename(String(json.img ?? ""));

			await fs.rm(filePath, { force: true });
			await fs.rm(path.join(featureDir, identifier), { recursive: true, force: true });
			if ( imgFileName ) await fs.rm(path.join(ICON_DEST_DIR, imgFileName), { force: true });
		}
	}
}

async function cleanDirectory(directoryPath) {
	await fs.rm(directoryPath, { recursive: true, force: true });
	await fs.mkdir(directoryPath, { recursive: true });
}

async function readSpeciesNamesFromDirectory(directoryPath) {
	const names = new Map();
	for ( const entry of await readJsonFilesFromDirectory(directoryPath) ) {
		if ( !entry.endsWith(".json") ) continue;
		const filePath = path.join(directoryPath, entry);
		const json = JSON.parse(await fs.readFile(filePath, "utf8"));
		names.set(normalizeWhitespace(json.name).toLowerCase(), {
			name: json.name,
			identifier: json.system?.identifier || path.basename(entry, ".json"),
			filePath
		});
	}
	return names;
}

function buildLegacyItemFromMarkdownSection(section) {
	return {
		name: section.name,
		data: {
			description: {
				value: buildDescriptionHtml(section),
				chat: ""
			},
			source: "HGTTG",
			skinColorOptions: {
				value: section.visual["Skin Color"] ?? ""
			},
			hairColorOptions: {
				value: section.visual["Hair Color"] ?? ""
			},
			eyeColorOptions: {
				value: section.visual["Eye Color"] ?? ""
			},
			distinctions: {
				value: section.visual.Distinctions ?? ""
			},
			heightAverage: {
				value: section.physical.Height ?? ""
			},
			heightRollMod: {
				value: ""
			},
			weightAverage: {
				value: section.physical.Weight ?? ""
			},
			weightRollMod: {
				value: ""
			},
			homeworld: {
				value: section.sociocultural.Homeworld ?? ""
			},
			slanguage: {
				value: section.sociocultural.Language ?? ""
			}
		},
		effects: []
	};
}

function buildMarkdownSpeciesArtifacts(section, imgPath = "icons/svg/mystery-man.svg", artAttribution = null) {
	const speciesSlug = slugify(section.name);
	const legacyItem = buildLegacyItemFromMarkdownSection(section);
	const featureItems = [];
	const seenFeatureSlugs = new Set();

	for ( const trait of section.traits ) {
		const featureTitle = trait.title;
		let featureSlug = buildSafeFeatureSlug(featureTitle);
		if ( !featureSlug ) featureSlug = "feature";
		let featureSlugCandidate = featureSlug;
		let index = 2;
		while ( seenFeatureSlugs.has(featureSlugCandidate) ) {
			featureSlugCandidate = `${featureSlug}-${index}`;
			index += 1;
		}
		seenFeatureSlugs.add(featureSlugCandidate);

		featureItems.push(buildFeatureItem({
			speciesName: section.name,
			speciesSlug,
			featureTitle,
			featureSlug: featureSlugCandidate,
			featureHtml: buildMarkdownFeatureHtml(trait),
			imgPath,
			sourceText: "HGTTG",
			artAttribution
		}));
	}

	const featureTexts = featureItems.map(item => item.system.description.value);
	const effectsSummary = parseMarkdownTraitEffects(featureTexts);
	const abilityFeature = featureItems.find(item => item.system.identifier === "ability-score-increase");
	const advancement = [
		buildItemGrantAdvancement(featureItems),
		parseAbilityScoreAdvancement(abilityFeature?.system?.description?.value ?? "", effectsSummary.effectAbilityBonuses),
		buildSizeAdvancement(effectsSummary.size)
	];
	const traitAdvancement = buildTraitAdvancement(effectsSummary.grants, effectsSummary.choices);
	if ( traitAdvancement ) advancement.push(traitAdvancement);

	return {
		speciesSlug,
		featureItems,
		speciesItem: buildRaceItem({
			legacyItem,
			speciesSlug,
			imgPath,
			featureItems,
			advancement,
			movement: effectsSummary.movement,
			senses: effectsSummary.senses,
			effectChanges: effectsSummary.residualChanges,
			artAttribution
		})
	};
}

async function buildMarkdownCoverage({ expectedNames, coreSpecies, generatedSpecies, staleGenerated = [] }) {
	const generatedNames = new Set(Array.from(generatedSpecies.keys()));
	const coreNames = new Set(Array.from(coreSpecies.keys()));
	const missing = [];
	const coreCovered = [];
	const generated = [];
	for ( const name of expectedNames ) {
		const key = normalizeWhitespace(name).toLowerCase();
		if ( coreNames.has(key) ) coreCovered.push(name);
		else if ( generatedNames.has(key) ) generated.push(name);
		else missing.push(name);
	}
	return {
		expected: expectedNames.length,
		generated: generated.length,
		coreCovered: coreCovered.length,
		missing: missing.length,
		stale: staleGenerated.length,
		generatedNames: generated,
		coreCoveredNames: coreCovered,
		missingNames: missing,
		staleNames: staleGenerated
	};
}

function printCoverageReport(report) {
	console.log("HGTTG markdown species coverage:");
	console.log(`  Expected from markdown: ${report.expected}`);
	console.log(`  Generated HGTTG species: ${report.generated}`);
	console.log(`  Covered by core species: ${report.coreCovered}`);
	console.log(`  Missing: ${report.missing}`);
	console.log(`  Stale generated: ${report.stale}`);
	if ( report.missingNames.length ) console.warn(`  Missing names: ${report.missingNames.join(", ")}`);
	if ( report.staleNames.length ) console.warn(`  Stale names: ${report.staleNames.join(", ")}`);
}

function buildWookieepediaArtAttribution(entry) {
	return {
		source: "Wookieepedia",
		pageTitle: entry.selected?.pageTitle ?? "",
		pageUrl: entry.selected?.pageUrl ?? "",
		imageTitle: entry.selected?.imageTitle ?? "",
		imageUrl: entry.selected?.imageUrl ?? "",
		license: entry.selected?.license ?? "",
		artist: entry.selected?.artist ?? "",
		credit: entry.selected?.credit ?? "",
		retrievedAt: entry.generatedAt ?? new Date().toISOString(),
		licenseReviewRequired: Boolean(entry.selected?.licenseReview?.needsReview)
	};
}

function buildPdfArtAttribution(entry) {
	return {
		source: "HGTTG PDF",
		pdfPath: entry.pdfPath ?? "",
		pdfPage: entry.pdfPage ?? null,
		sourceXref: entry.sourceXref ?? null,
		extractedImage: entry.extractedImage ?? "",
		localPath: entry.localPath ?? "",
		modulePath: entry.modulePath ?? "",
		confidence: entry.confidence ?? "",
		retrievedAt: entry.generatedAt ?? new Date().toISOString()
	};
}

async function readApprovedArtManifest() {
	const pdfManifest = await readJson(PDF_ART_MANIFEST_PATH, { species: [] });
	const pdfArt = new Map((pdfManifest.species ?? [])
		.filter(entry => entry.status === "mapped" && entry.modulePath)
		.map(entry => [entry.slug, {
			imgPath: entry.modulePath,
			artAttribution: buildPdfArtAttribution({ ...entry, generatedAt: pdfManifest.generatedAt })
		}]));
	const manifest = await readJson(ART_MANIFEST_PATH, { species: [] });
	const wookieepediaArt = new Map((manifest.species ?? [])
		.filter(entry => entry.approved && entry.modulePath)
		.map(entry => [entry.slug, {
			imgPath: entry.modulePath,
			artAttribution: buildWookieepediaArtAttribution({ ...entry, generatedAt: manifest.generatedAt })
		}]));
	return new Map([...wookieepediaArt, ...pdfArt]);
}

async function resolveMarkdownSpeciesIcon(section, legacySpeciesByName, approvedArtBySlug) {
	const speciesSlug = slugify(section.name);
	const approvedArt = approvedArtBySlug.get(speciesSlug);
	if ( approvedArt ) return { ...approvedArt, copied: false };
	const legacyItem = legacySpeciesByName.get(normalizeWhitespace(section.name).toLowerCase());
	if ( !legacyItem?.img ) return { imgPath: "icons/svg/mystery-man.svg", copied: false, artAttribution: null };
	const encodedIconName = path.basename(String(legacyItem.img).replace(/^modules\/hgttg\/packs\/Icons\//i, ""));
	if ( !encodedIconName ) return { imgPath: "icons/svg/mystery-man.svg", copied: false, artAttribution: null };
	const legacyIconName = decodeURIComponent(encodedIconName);
	const legacyIconPath = path.join(LEGACY_ICON_DIR, legacyIconName);
	const iconDestPath = path.join(ICON_DEST_DIR, legacyIconName);
	try {
		await fs.mkdir(ICON_DEST_DIR, { recursive: true });
		await fs.copyFile(legacyIconPath, iconDestPath);
		return {
			imgPath: `modules/sw5e-module/icons/packs/Species/${legacyIconName.replace(/\\/g, "/")}`,
			copied: true,
			artAttribution: null
		};
	} catch {
		return { imgPath: "icons/svg/mystery-man.svg", copied: false, artAttribution: null };
	}
}

async function importMarkdownSpecies() {
	const markdownPath = path.resolve(getArgValue("--markdown", DEFAULT_MARKDOWN_PATH));
	const markdown = await fs.readFile(markdownPath, "utf8");
	const { names: markdownNames, sections } = parseMarkdownSpeciesSections(markdown);
	const coreSpecies = await readSpeciesNamesFromDirectory(CORE_SPECIES_DIR);
	const existingGeneratedSpecies = await readSpeciesNamesFromDirectory(HGTTG_SPECIES_DIR);
	const expectedGeneratedNames = new Set(
		markdownNames
			.filter(name => !coreSpecies.has(normalizeWhitespace(name).toLowerCase()))
			.map(name => normalizeWhitespace(name).toLowerCase())
	);
	const staleGenerated = Array.from(existingGeneratedSpecies.keys())
		.filter(name => !expectedGeneratedNames.has(name))
		.map(name => existingGeneratedSpecies.get(name)?.name ?? name);

	if ( ARGS.has("--report") ) {
		const report = await buildMarkdownCoverage({
			expectedNames: markdownNames,
			coreSpecies,
			generatedSpecies: existingGeneratedSpecies,
			staleGenerated
		});
		printCoverageReport(report);
		if ( report.missingNames.length ) process.exitCode = 1;
		return;
	}

	await cleanDirectory(HGTTG_SPECIES_DIR);
	await cleanDirectory(HGTTG_SPECIES_FEATURES_DIR);

	const legacySpeciesByName = await loadLegacySpeciesByName();
	const approvedArtBySlug = await readApprovedArtManifest();
	let speciesCount = 0;
	let featureCount = 0;
	let iconCount = 0;
	let artCount = 0;
	for ( const section of sections ) {
		if ( section.missing ) continue;
		if ( coreSpecies.has(normalizeWhitespace(section.name).toLowerCase()) ) continue;
		const { imgPath, copied, artAttribution } = await resolveMarkdownSpeciesIcon(section, legacySpeciesByName, approvedArtBySlug);
		if ( copied ) iconCount += 1;
		if ( artAttribution ) artCount += 1;
		const { speciesSlug, featureItems, speciesItem } = buildMarkdownSpeciesArtifacts(section, imgPath, artAttribution);
		for ( const featureItem of featureItems ) {
			await writeJson(path.join(HGTTG_SPECIES_FEATURES_DIR, speciesSlug, `${featureItem.system.identifier}.json`), featureItem);
			featureCount += 1;
		}
		await writeJson(path.join(HGTTG_SPECIES_DIR, `${speciesSlug}.json`), speciesItem);
		speciesCount += 1;
	}

	const generatedSpecies = await readSpeciesNamesFromDirectory(HGTTG_SPECIES_DIR);
	const report = await buildMarkdownCoverage({
		expectedNames: markdownNames,
		coreSpecies,
		generatedSpecies
	});
	printCoverageReport(report);
	console.log(`Rebuilt ${speciesCount} HGTTG species, ${featureCount} HGTTG species features, ${iconCount} legacy icons, and ${artCount} approved art links from ${markdownPath}.`);
	if ( report.missingNames.length ) process.exitCode = 1;
}

async function main() {
	if ( ARGS.has("--clean") ) {
		await cleanGeneratedImports();
		console.log("Removed generated HGTTG imports.");
		return;
	}

	if ( ARGS.has("--markdown") || ARGS.has("--report") ) {
		await importMarkdownSpecies();
		return;
	}

	const currentSpeciesNames = await readCurrentSpeciesNames();
	const legacySpecies = await loadLegacySpecies();
	const netNewSpecies = legacySpecies.filter(item => !currentSpeciesNames.has(normalizeWhitespace(item.name).toLowerCase()));

	await fs.mkdir(ICON_DEST_DIR, { recursive: true });

	let speciesCount = 0;
	let featureCount = 0;
	let iconCount = 0;

	for ( const legacyItem of netNewSpecies ) {
		const speciesSlug = slugify(legacyItem.name);
		const encodedIconName = path.basename(String(legacyItem.img ?? "").replace(/^modules\/hgttg\/packs\/Icons\//i, "")) || `${legacyItem.name}.webp`;
		const legacyIconName = decodeURIComponent(encodedIconName);
		const legacyIconPath = path.join(LEGACY_ICON_DIR, legacyIconName);
		const iconDestPath = path.join(ICON_DEST_DIR, legacyIconName);
		const imgPath = `modules/sw5e-module/icons/packs/Species/${legacyIconName.replace(/\\/g, "/")}`;

		await fs.copyFile(legacyIconPath, iconDestPath);
		iconCount += 1;

		const featureParagraphs = extractFeatureParagraphs(legacyItem.data?.traits?.value ?? "");
		const featureItems = [];
		const seenFeatureSlugs = new Set();

		for ( const featureHtml of featureParagraphs ) {
			const featureTitle = extractFeatureTitle(featureHtml);
			if ( !featureTitle ) continue;
			let featureSlug = buildSafeFeatureSlug(featureTitle);
			if ( !featureSlug ) featureSlug = "feature";
			let featureSlugCandidate = featureSlug;
			let index = 2;
			while ( seenFeatureSlugs.has(featureSlugCandidate) ) {
				featureSlugCandidate = `${featureSlug}-${index}`;
				index += 1;
			}
			seenFeatureSlugs.add(featureSlugCandidate);

			const featureItem = buildFeatureItem({
				speciesName: legacyItem.name,
				speciesSlug,
				featureTitle,
				featureSlug: featureSlugCandidate,
				featureHtml,
				imgPath,
				sourceText: legacyItem.data?.source || "HGTTG"
			});
			featureItems.push(featureItem);

			const featurePath = path.join(HGTTG_SPECIES_FEATURES_DIR, speciesSlug, `${featureSlugCandidate}.json`);
			await writeJson(featurePath, featureItem);
			featureCount += 1;
		}

		const featureTexts = featureItems.map(item => item.system.description.value);
		const effectsSummary = parseLegacyEffects(legacyItem, featureTexts);

		const abilityFeature = featureItems.find(item => item.system.identifier === "ability-score-increase");
		const abilityAdvancement = parseAbilityScoreAdvancement(
			abilityFeature?.system?.description?.value ?? "",
			effectsSummary.effectAbilityBonuses
		);

		const advancement = [
			buildItemGrantAdvancement(featureItems),
			abilityAdvancement,
			buildSizeAdvancement(effectsSummary.size)
		];

		const traitAdvancement = buildTraitAdvancement(effectsSummary.grants, effectsSummary.choices);
		if ( traitAdvancement ) advancement.push(traitAdvancement);

		const speciesItem = buildRaceItem({
			legacyItem,
			speciesSlug,
			imgPath,
			featureItems,
			advancement,
			movement: effectsSummary.movement,
			senses: effectsSummary.senses,
			effectChanges: effectsSummary.residualChanges
		});

		await writeJson(path.join(HGTTG_SPECIES_DIR, `${speciesSlug}.json`), speciesItem);
		speciesCount += 1;
	}

	console.log(`Imported ${speciesCount} species, ${featureCount} features, and ${iconCount} icons.`);
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
