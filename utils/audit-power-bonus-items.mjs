#!/usr/bin/env node
/**
 * Audit-only: scan pack source YAML for force/tech attack and DC bonus item text.
 * Does not modify compendium data.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "packs", "_source");

const ITEM_PACKS = [
	"enhanceditems",
	"equipment",
	"implements",
	"armor",
	"lightweapons",
	"modifications",
	"consumables",
	"adventuringgear",
	"drakes-shipyard",
	"fistoscodex",
	"mandaloriancodexitems",
	"blasters",
	"vibroweapons"
];

const ITEM_TYPES = new Set([
	"equipment",
	"weapon",
	"consumable",
	"tool",
	"loot",
	"backpack",
	"modification"
]);

const ABILITY_MAP = {
	wisdom: "wis",
	wis: "wis",
	intelligence: "int",
	int: "int",
	charisma: "cha",
	cha: "cha",
	strength: "str",
	str: "str",
	dexterity: "dex",
	dex: "dex",
	constitution: "con",
	con: "con"
};

const BONUS_LINE = /(?:you\s+)?(?:gain|get|have|add|receive|increase)[^.]{0,120}?(?:bonus|increase|\+)\s*(?:of\s*)?\+?(\d+)[^.]{0,120}?(?:to\s+(?:your\s+)?)?((?:force|tech|light|dark|universal|melee|ranged)[^.]{0,80}?(?:attack|DC|save)|(?:attack|DC|save)[^.]{0,80}?(?:force|tech|power))/i;
const DC_WHEN = /\+?(\d+)[^.]{0,40}?to\s+(?:your\s+)?DC\s+when[^.]{0,80}?(wisdom|intelligence|charisma|strength|dexterity|constitution|wis|int|cha|str|dex|con)/i;
const ATTACK_BONUS = /\+?(\d+)\s+bonus\s+to\s+(?:the\s+)?((?:force|tech|light|dark|universal)[^.]{0,60}?attack|attack[^.]{0,60}?(?:force|tech|power))/i;
const DC_BONUS = /\+?(\d+)\s+bonus\s+to\s+(?:the\s+)?((?:force|tech|light|dark|universal)[^.]{0,60}?(?:DC|save)|(?:DC|save)[^.]{0,60}?(?:force|tech|power))/i;
const GENERIC_DC = /\+?(\d+)\s+(?:to\s+(?:your\s+)?)?(?:force|tech)\s+(?:power\s+)?(?:save\s+)?DC/i;

function stripHtml(html = "") {
	return html
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function walkYamlFiles(dir, files = []) {
	if ( !fs.existsSync(dir) ) return files;
	for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const full = path.join(dir, entry.name);
		if ( entry.isDirectory() ) walkYamlFiles(full, files);
		else if ( entry.name.endsWith(".yml") || entry.name.endsWith(".yaml") ) files.push(full);
	}
	return files;
}

function getAttunement(doc) {
	const att = doc?.system?.attunement;
	if ( att === "required" ) return true;
	if ( att === "optional" ) return "optional";
	return false;
}

function inferTransfer(doc) {
	// Equipment/focus items with attunement typically transfer when attuned.
	return getAttunement(doc) !== false;
}

function textMentionsBonus(text) {
	const lower = text.toLowerCase();
	return (
		(lower.includes("attack") && (lower.includes("force") || lower.includes("tech") || lower.includes("power")))
		|| (lower.includes("dc") && (lower.includes("force") || lower.includes("tech") || lower.includes("power")))
		|| lower.includes("dc when")
		|| lower.includes("light side")
		|| lower.includes("dark side")
		|| lower.includes("universal force")
		|| /\+\d+/.test(text) && (lower.includes("force") || lower.includes("tech"))
	);
}

function recommendEffect(text, doc) {
	const lower = text.toLowerCase();
	const valueMatch = text.match(/\+(\d+)/);
	const value = valueMatch ? Number(valueMatch[1]) : null;

	const results = [];

	const dcWhen = text.match(DC_WHEN);
	if ( dcWhen ) {
		const ab = ABILITY_MAP[dcWhen[2].toLowerCase()];
		const cast = lower.includes("tech") ? "tech" : "force";
		results.push({
			key: `system.bonuses.${cast}.${ab}.dc`,
			mode: "ADD",
			value: Number(dcWhen[1]),
			confidence: "high"
		});
	}

	const attackMatch = text.match(ATTACK_BONUS) ?? text.match(BONUS_LINE);
	if ( attackMatch && attackMatch[0].toLowerCase().includes("attack") ) {
		const fragment = attackMatch[2]?.toLowerCase() ?? lower;
		const val = Number(attackMatch[1]);
		if ( fragment.includes("tech") ) {
			results.push({ key: "system.bonuses.tech.attack", mode: "ADD", value: val, confidence: "high" });
		} else if ( fragment.includes("light") ) {
			results.push({ key: "system.bonuses.force.light.attack", mode: "ADD", value: val, confidence: "high" });
		} else if ( fragment.includes("dark") ) {
			results.push({ key: "system.bonuses.force.dark.attack", mode: "ADD", value: val, confidence: "high" });
		} else if ( fragment.includes("force") || fragment.includes("power") ) {
			results.push({ key: "system.bonuses.force.attack", mode: "ADD", value: val, confidence: "high" });
		}
	}

	const dcMatch = text.match(DC_BONUS) ?? (lower.includes("dc") ? text.match(GENERIC_DC) : null);
	if ( dcMatch ) {
		const fragment = (dcMatch[2] ?? dcMatch[0]).toLowerCase();
		const val = Number(dcMatch[1]);
		if ( fragment.includes("tech") ) {
			results.push({ key: "system.bonuses.tech.dc", mode: "ADD", value: val, confidence: "high" });
		} else if ( fragment.includes("light") ) {
			results.push({ key: "system.bonuses.force.light.dc", mode: "ADD", value: val, confidence: "high" });
		} else if ( fragment.includes("dark") ) {
			results.push({ key: "system.bonuses.force.dark.dc", mode: "ADD", value: val, confidence: "high" });
		} else if ( fragment.includes("universal") ) {
			results.push({ key: "system.bonuses.force.dc", mode: "ADD", value: val, confidence: "medium" });
		} else if ( fragment.includes("force") || fragment.includes("power") ) {
			results.push({ key: "system.bonuses.force.dc", mode: "ADD", value: val, confidence: "high" });
		}
	}

	// Ability-specific DC without "DC when" phrasing
	for ( const [word, ab] of Object.entries(ABILITY_MAP) ) {
		const re = new RegExp(`\\+?(\\d+)[^.]{0,60}?${word}[^.]{0,60}?(?:force|tech)[^.]{0,40}?dc`, "i");
		const m = text.match(re);
		if ( m ) {
			const cast = lower.includes("tech") ? "tech" : "force";
			results.push({
				key: `system.bonuses.${cast}.${ab}.dc`,
				mode: "ADD",
				value: Number(m[1]),
				confidence: "medium"
			});
		}
	}

	// Existing effects on item
	for ( const effect of doc?.effects ?? [] ) {
		for ( const change of effect?.changes ?? [] ) {
			if ( /bonuses\.(force|tech|mpak|power)/.test(change.key) ) {
				results.push({
					key: change.key,
					mode: change.mode,
					value: change.value,
					confidence: "existing",
					note: "Already has Active Effect"
				});
			}
		}
	}

	if ( !results.length && value !== null ) {
		if ( lower.includes("force") && lower.includes("attack") ) {
			results.push({ key: "system.bonuses.force.attack", mode: "ADD", value, confidence: "medium" });
		} else if ( lower.includes("tech") && lower.includes("attack") ) {
			results.push({ key: "system.bonuses.tech.attack", mode: "ADD", value, confidence: "medium" });
		} else if ( lower.includes("force") && lower.includes("dc") ) {
			results.push({ key: "system.bonuses.force.dc", mode: "ADD", value, confidence: "low" });
		} else if ( lower.includes("tech") && lower.includes("dc") ) {
			results.push({ key: "system.bonuses.tech.dc", mode: "ADD", value, confidence: "low" });
		}
	}

	// Deduplicate by key
	const seen = new Set();
	return results.filter(r => {
		const id = `${r.key}|${r.value}`;
		if ( seen.has(id) ) return false;
		seen.add(id);
		return true;
	});
}

function extractRelevantSentences(text) {
	return text
		.split(/(?<=[.!?])\s+/)
		.filter(s => textMentionsBonus(s))
		.map(s => s.trim());
}

function auditFile(filePath) {
	let doc;
	try {
		doc = yaml.load(fs.readFileSync(filePath, "utf8"));
	} catch {
		return null;
	}
	if ( !doc?.name ) return null;
	if ( doc.type && !ITEM_TYPES.has(doc.type) ) return null;

	const description = stripHtml(doc?.system?.description?.value ?? "");
	if ( !textMentionsBonus(description) ) return null;

	const pack = path.relative(SOURCE, filePath).split(path.sep)[0];
	const rel = path.relative(SOURCE, filePath).replace(/\\/g, "/");
	const sentences = extractRelevantSentences(description);
	const recommendations = recommendEffect(description, doc);

	if ( !recommendations.length ) {
		return {
			name: doc.name,
			source: rel,
			pack,
			type: doc.type,
			text: sentences.join(" ") || description.slice(0, 300),
			recommendations: [{ key: "(manual review)", mode: "ADD", value: null, confidence: "low" }],
			transfer: inferTransfer(doc),
			attunement: getAttunement(doc),
			existingEffects: (doc.effects ?? []).length
		};
	}

	return {
		name: doc.name,
		source: rel,
		pack,
		type: doc.type,
		text: sentences.join(" ") || description.slice(0, 300),
		recommendations,
		transfer: inferTransfer(doc),
		attunement: getAttunement(doc),
		existingEffects: (doc.effects ?? []).length
	};
}

const files = ITEM_PACKS.flatMap(p => walkYamlFiles(path.join(SOURCE, p)));
const results = files.map(auditFile).filter(Boolean);
results.sort((a, b) => a.name.localeCompare(b.name));

const outPath = path.join(ROOT, "ai", "sessions", "_audit-power-bonus-items.json");
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`Audited ${files.length} YAML files, found ${results.length} matching items.`);
console.log(`Wrote ${outPath}`);
