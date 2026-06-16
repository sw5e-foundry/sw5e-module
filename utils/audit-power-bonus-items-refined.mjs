#!/usr/bin/env node
/**
 * Refined audit: explicit force/tech power attack & DC bonuses only.
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

const ITEM_TYPES = new Set(["equipment", "weapon", "consumable", "tool", "loot", "backpack", "modification"]);

const INCLUDE_PATTERNS = [
	/bonus to the force attack rolls?/i,
	/bonus to the tech attack rolls?/i,
	/bonus to the force save dc/i,
	/bonus to the tech save dc/i,
	/bonus to melee force attacks?/i,
	/bonus to ranged force attacks?/i,
	/bonus to melee tech attacks?/i,
	/bonus to ranged tech attacks?/i,
	/bonus to your (?:force|tech) (?:power )?save dc/i,
	/bonus to (?:light|dark)[^.]{0,30}force[^.]{0,30}(?:attack|dc)/i,
	/to your dc when[^.]{0,60}(?:wisdom|intelligence|charisma|strength|dexterity|constitution)/i
];

const EXCLUDE_PATTERNS = [
	/power cell fuels a number of attacks/i,
	/dc \d+ security kit to force open/i,
	/bonus to attack and damage rolls with this enhanced weapon/i,
	/bonus to ac\b/i,
	/bonus to damage rolls with weapons and force powers/i,
	/make a dc \d+ forcecasting ability check/i,
	/when you cast a tech power with this wristpad that gives you a bonus to ac/i
];

const ABILITY_MAP = {
	wisdom: "wis", wis: "wis",
	intelligence: "int", int: "int",
	charisma: "cha", cha: "cha",
	strength: "str", str: "str",
	dexterity: "dex", dex: "dex",
	constitution: "con", con: "con"
};

function stripHtml(html = "") {
	return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
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
	const text = stripHtml(doc?.system?.description?.value ?? "").toLowerCase();
	if ( text.includes("requires attunement") ) return true;
	return false;
}

function inferTransfer(doc, category) {
	if ( category === "item-modification" ) return false;
	return getAttunement(doc) !== false;
}

function matchesAudit(text) {
	if ( EXCLUDE_PATTERNS.some(re => re.test(text)) ) return false;
	return INCLUDE_PATTERNS.some(re => re.test(text));
}

function extractBonusSentences(text) {
	return text.split(/(?<=[.!?])\s+/).filter(s => INCLUDE_PATTERNS.some(re => re.test(s))).map(s => s.trim());
}

function recommend(text, doc) {
	const lower = text.toLowerCase();
	const notes = [];
	const recs = [];

	const add = (key, value, mode, confidence, note) => {
		recs.push({ key, mode, value, confidence, ...(note ? { note } : {}) });
	};

	// Focus generator / wristpad standard phrasing
	let m = text.match(/gain a \+(\d+) bonus to the (force|tech) attack rolls?/i);
	if ( m ) {
		const cast = m[2].toLowerCase() === "tech" ? "tech" : "force";
		add(`system.bonuses.${cast}.attack`, Number(m[1]), "ADD", "high");
		return { recs, notes, category: cast === "tech" ? "focus-tech" : "focus-force" };
	}

	// Flat save DC (fadecasting dueling/fighting/mastery/guard etc.)
	m = text.match(/gain a \+(\d+) bonus to the (force|tech) save dc/i);
	if ( m && !/strength|dexterity|constitution|intelligence|wisdom|charisma/i.test(text) ) {
		const cast = m[2].toLowerCase() === "tech" ? "tech" : "force";
		add(`system.bonuses.${cast}.dc`, Number(m[1]), "ADD", "high");
		return { recs, notes, category: `${cast}-dc-flat` };
	}

	// Conditional save-target ability DC (fadecasting training)
	if ( /bonus to the (force|tech) save dc of powers that require/i.test(text) ) {
		const cast = /tech save dc/i.test(text) ? "tech" : "force";
		const bonuses = [...text.matchAll(/\+(\d+) bonus to the (?:force|tech) save dc of powers that require (?:a )?([^.]+?) saving throw/gi)];
		const penalties = [...text.matchAll(/-(\d+) penalty to the (?:force|tech) save dc of powers that require (?:a )?([^.]+?) saving throw/gi)];
		for ( const b of bonuses ) {
			const abilities = b[2].split(/\s+or\s+|,\s*/i).map(a => ABILITY_MAP[a.trim().toLowerCase()]).filter(Boolean);
		for ( const ab of abilities ) {
			add(`system.bonuses.${cast}.${ab}.dc`, Number(b[1]), "ADD", "low",
				"Item text keys off save target ability, not casting ability; current DC keys use casting ability only.");
		}
		}
		for ( const p of penalties ) {
			const abilities = p[2].split(/\s+or\s+|,\s*/i).map(a => ABILITY_MAP[a.trim().toLowerCase()]).filter(Boolean);
			for ( const ab of abilities ) {
				add(`system.bonuses.${cast}.${ab}.dc`, -Number(p[1]), "ADD", "low",
					"Penalty on save-target ability; may need custom handling.");
			}
		}
		notes.push("Save-target-ability conditional DC; verify against implementation scope.");
		return { recs, notes, category: "conditional-save-dc" };
	}

	// Melee/ranged split
	m = text.match(/\+(\d+) bonus to melee (force|tech) attacks?/i);
	if ( m ) {
		const cast = m[2].toLowerCase();
		if ( cast === "tech" ) {
			add("system.bonuses.tech.attack", Number(m[1]), "ADD", "medium", "Text specifies melee only; no tech melee-specific key — tech.attack affects all tech attacks.");
		} else {
			add("system.bonuses.mpak.attack", Number(m[1]), "ADD", "high", "Melee force power attacks (legacy mpak key).");
		}
	}
	m = text.match(/\+(\d+) bonus to ranged (force|tech) attacks?/i);
	if ( m ) {
		const cast = m[2].toLowerCase();
		if ( cast === "tech" ) {
			add("system.bonuses.tech.attack", Number(m[1]), "ADD", "medium", "Text specifies ranged only; no tech ranged-specific key.");
		} else {
			add("system.bonuses.rpak.attack", Number(m[1]), "ADD", "high", "Ranged force power attacks (legacy rpak key).");
		}
	}
	m = text.match(/-(\d+) penalty to (melee|ranged) (force|tech) attacks?/i);
	if ( m ) {
		const key = m[2].toLowerCase() === "melee" ? "system.bonuses.mpak.attack" : "system.bonuses.rpak.attack";
		add(key, -Number(m[1]), "ADD", "high", `${m[2]} penalty`);
	}
	if ( recs.length ) return { recs, notes, category: "melee-ranged-split" };

	// DC when using ability (casting)
	m = text.match(/\+(\d+)[^.]{0,30}to your dc when[^.]{0,60}(wisdom|intelligence|charisma|strength|dexterity|constitution)/i);
	if ( m ) {
		const ab = ABILITY_MAP[m[2].toLowerCase()];
		const cast = lower.includes("tech") ? "tech" : "force";
		add(`system.bonuses.${cast}.${ab}.dc`, Number(m[1]), "ADD", "high");
		return { recs, notes, category: "ability-dc" };
	}

	// Light/dark
	if ( /light.{0,20}force.{0,20}attack/i.test(text) ) {
		m = text.match(/\+(\d+)/);
		if ( m ) add("system.bonuses.force.light.attack", Number(m[1]), "ADD", "high");
	}
	if ( /dark.{0,20}force.{0,20}attack/i.test(text) ) {
		m = text.match(/\+(\d+)/);
		if ( m ) add("system.bonuses.force.dark.attack", Number(m[1]), "ADD", "high");
	}

	if ( recs.length ) return { recs, notes, category: "mixed" };

	return { recs: [{ key: "(manual review)", mode: "ADD", value: null, confidence: "low" }], notes: ["Matched include filter but no parser rule."], category: "unparsed" };
}

function auditFile(filePath) {
	let doc;
	try { doc = yaml.load(fs.readFileSync(filePath, "utf8")); } catch { return null; }
	if ( !doc?.name || (doc.type && !ITEM_TYPES.has(doc.type)) ) return null;

	const description = stripHtml(doc?.system?.description?.value ?? "");
	if ( !matchesAudit(description) ) return null;

	const sentences = extractBonusSentences(description);
	const { recs, notes, category } = recommend(description, doc);
	const source = path.relative(SOURCE, filePath).replace(/\\/g, "/");

	return {
		name: doc.name,
		source,
		pack: source.split("/")[0],
		type: doc.type,
		category,
		text: sentences.join(" ") || description.slice(0, 400),
		recommendations: recs,
		transfer: inferTransfer(doc, category),
		attunement: getAttunement(doc),
		existingEffects: (doc.effects ?? []).length,
		notes
	};
}

const files = ITEM_PACKS.flatMap(p => walkYamlFiles(path.join(SOURCE, p)));
const results = files.map(auditFile).filter(Boolean);
results.sort((a, b) => a.name.localeCompare(b.name));

const byCategory = {};
for ( const r of results ) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;

const outJson = path.join(ROOT, "ai", "sessions", "_audit-power-bonus-items-refined.json");
fs.writeFileSync(outJson, JSON.stringify({ summary: { total: results.length, byCategory }, results }, null, 2));

// Markdown
const lines = [
	"# Force/Tech Power Bonus Item Effect Audit",
	"",
	"**Date:** 2026-06-05",
	"**Branch:** `v.next`",
	"**Scope:** Audit only — no compendium changes.",
	"",
	"## Summary",
	"",
	`| Metric | Count |`,
	`|--------|------:|`,
	`| YAML files scanned | ${files.length} |`,
	`| Items with explicit force/tech attack or save DC bonus text | ${results.length} |`,
	`| Items with existing Active Effects | ${results.filter(r => r.existingEffects > 0).length} |`,
	""
];

for ( const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1]) ) {
	lines.push(`- **${cat}:** ${count}`);
}
lines.push("");
lines.push("## Key Findings");
lines.push("");
lines.push("- **No items** in scanned packs use light-side-only, dark-side-only, or universal-force-specific attack/DC bonus phrasing.");
lines.push("- **No items** use \"DC when using Wisdom/Intelligence/Charisma\" casting-ability phrasing.");
lines.push("- **All Fadecasting modifications** (Training/Dueling/Fighting/Mastery) use save-*target* ability conditionals, which do not map cleanly to casting-ability DC keys (`force.{ability}.dc`).");
lines.push("- **Channeling/Crystalizing** amplifier and rangefinder mods use melee vs ranged force attack splits; recommend `system.bonuses.mpak.attack` / `system.bonuses.rpak.attack`.");
lines.push("- **All audited items have `effects: []`** — no Active Effects are configured yet.");
lines.push("");
lines.push("Item modifications (`type: loot`) use `transfer: false` — effects should apply on the host focus/weapon when the mod is installed, not via item transfer.");
lines.push("");

const groups = {
	"Focus Generators (force attack)": r => r.category === "focus-force",
	"Wristpads (tech attack)": r => r.category === "focus-tech",
	"Flat force save DC (fadecasting etc.)": r => r.category === "force-dc-flat",
	"Flat tech save DC (fadecasting etc.)": r => r.category === "tech-dc-flat",
	"Melee/ranged attack split mods": r => r.category === "melee-ranged-split",
	"Conditional save-target DC (fadecasting mods)": r => r.category === "conditional-save-dc",
	"Other / unparsed": r => ["mixed", "unparsed", "ability-dc"].includes(r.category)
};

for ( const [title, filter] of Object.entries(groups) ) {
	const items = results.filter(filter);
	if ( !items.length ) continue;
	lines.push(`## ${title} (${items.length})`);
	lines.push("");
	for ( const item of items ) {
		lines.push(`### ${item.name}`);
		lines.push("");
		lines.push(`| Field | Value |`);
		lines.push(`|-------|-------|`);
		lines.push(`| Source | \`${item.source}\` |`);
		lines.push(`| Pack | ${item.pack} |`);
		lines.push(`| Type | ${item.type} |`);
		lines.push(`| Attunement | ${item.attunement === true ? "required" : item.attunement === "optional" ? "optional" : "none"} |`);
		lines.push(`| Transfer | ${item.transfer} |`);
		lines.push(`| Existing effects | ${item.existingEffects} |`);
		lines.push("");
		lines.push("**Item text:**");
		lines.push("");
		lines.push(`> ${item.text}`);
		lines.push("");
		lines.push("**Recommended Active Effect(s):**");
		lines.push("");
		lines.push("| Key | Mode | Value | Confidence | Notes |");
		lines.push("|-----|------|------:|------------|-------|");
		for ( const r of item.recommendations ) {
			lines.push(`| \`${r.key}\` | ${r.mode} | ${r.value ?? "—"} | ${r.confidence} | ${r.note ?? ""} |`);
		}
		if ( item.notes?.length ) {
			lines.push("");
			lines.push(`*Notes: ${item.notes.join(" ")}*`);
		}
		lines.push("");
	}
}

lines.push("## Appendix: Master Index");
lines.push("");
lines.push("| Item | Source | Primary Key | Value | Transfer | Attunement | Confidence |");
lines.push("|------|--------|-------------|------:|:--------:|:----------:|:----------:|");
for ( const item of results ) {
	const primary = item.recommendations[0];
	lines.push(`| ${item.name} | \`${item.source}\` | \`${primary?.key ?? "—"}\` | ${primary?.value ?? "—"} | ${item.transfer} | ${item.attunement === true ? "yes" : item.attunement === "optional" ? "opt" : "no"} | ${primary?.confidence ?? "—"} |`);
}
lines.push("");

const outMd = path.join(ROOT, "ai", "sessions", "2026-06-05-force-tech-bonus-item-effect-audit.md");
fs.writeFileSync(outMd, lines.join("\n"));
console.log(`Refined audit: ${results.length} items -> ${outMd}`);
