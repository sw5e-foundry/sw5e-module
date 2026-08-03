#!/usr/bin/env node
/**
 * Read-only Scum and Villainy monster census.
 *
 * Parses ai/SnV_Final.md, loads packs/_source/monsters YAML, applies the
 * explicit alias map, classifies every creature, and emits field-level diffs.
 *
 * Usage:
 *   node utils/snv-monster-census.mjs
 *   node utils/snv-monster-census.mjs --snv ai/SnV_Final.md --out ai/audits/snv-monster-census
 *
 * Does not modify pack source.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function getArg(name, fallback) {
	const idx = process.argv.indexOf(name);
	if ( idx === -1 ) return fallback;
	const value = process.argv[idx + 1];
	if ( !value || value.startsWith("--") ) return fallback;
	return value;
}

const SNV_PATH = path.resolve(ROOT, getArg("--snv", "ai/SnV_Final.md"));
const PACK_DIR = path.resolve(ROOT, getArg("--pack", "packs/_source/monsters"));
const ALIAS_PATH = path.resolve(ROOT, getArg("--aliases", "utils/snv-monster-alias-map.json"));
const OUT_DIR = path.resolve(ROOT, getArg("--out", "ai/audits/snv-monster-census"));
const SUMMARY_PATH = path.resolve(ROOT, getArg("--summary", "utils/snv-monster-census-summary.md"));

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];
const SKILL_MAP = {
	acrobatics: "acr",
	animalhandling: "ani",
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
	sleightofhand: "slt",
	"sleight of hand": "slt",
	stealth: "ste",
	survival: "sur",
	technology: "tec",
	tech: "tec"
};

function die(message) {
	console.error(`[snv-monster-census] ${message}`);
	process.exit(1);
}

function ensureDir(dir) {
	fs.mkdirSync(dir, { recursive: true });
}

function readText(filePath) {
	if ( !fs.existsSync(filePath) ) die(`Missing file: ${filePath}`);
	return fs.readFileSync(filePath, "utf8");
}

function walkFiles(dir, predicate, out = []) {
	for ( const ent of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const full = path.join(dir, ent.name);
		if ( ent.isDirectory() ) walkFiles(full, predicate, out);
		else if ( predicate(ent.name, full) ) out.push(full);
	}
	return out;
}

function normalizeName(value) {
	return String(value ?? "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[''`]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function parseFraction(value) {
	const raw = String(value ?? "").trim().toLowerCase();
	if ( !raw ) return null;
	if ( raw.includes("/") ) {
		const [a, b] = raw.split("/").map(Number);
		if ( Number.isFinite(a) && Number.isFinite(b) && b !== 0 ) return a / b;
		return null;
	}
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}

function stripHtml(value) {
	return String(value ?? "")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/\s+/g, " ")
		.trim();
}

function parseListLine(line, label) {
	const re = new RegExp(`^\\s*-\\s*\\*\\*${label}\\*\\*\\s*(.*)$`, "i");
	const m = line.match(re);
	return m ? m[1].trim() : null;
}

function parseBareListLine(line, label) {
	const re = new RegExp(`^\\s*-\\s*\\*\\*${label}\\*\\*\\s*(.*)$`, "i");
	const m = line.match(re);
	if ( m ) return m[1].trim();
	const bare = new RegExp(`^\\s*${label}\\s+(.*)$`, "i");
	const m2 = line.match(bare);
	return m2 ? m2[1].trim() : null;
}

function normalizeDamageTraitToken(value) {
	return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeConditionTraitToken(value) {
	let token = String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
	// SW5E / source prose often says "disease" while pack stores "diseased"
	if ( token === "disease" ) token = "diseased";
	return token;
}

function parseCsvTraits(value, { conditions = false } = {}) {
	if ( !value ) return [];
	const normalize = conditions ? normalizeConditionTraitToken : normalizeDamageTraitToken;
	return value
		.split(",")
		.map(part => part.replace(/;.*$/, "").trim().toLowerCase())
		.filter(Boolean)
		.map(normalize)
		.filter(Boolean)
		.sort();
}

function parseSkills(value) {
	const skills = {};
	if ( !value ) return skills;
	for ( const part of value.split(",") ) {
		const m = part.trim().match(/^(.+?)\s*([+-]\d+)\s*$/);
		if ( !m ) continue;
		const key = normalizeName(m[1]).replace(/\s+/g, "");
		const mapped = SKILL_MAP[key] || SKILL_MAP[normalizeName(m[1])] || key.slice(0, 3);
		skills[mapped] = Number(m[2]);
	}
	return skills;
}

function parseSaves(value) {
	const saves = {};
	if ( !value ) return saves;
	for ( const part of value.split(",") ) {
		const m = part.trim().match(/^(str|dex|con|int|wis|cha)\s*([+-]\d+)\s*$/i);
		if ( !m ) continue;
		saves[m[1].toLowerCase()] = Number(m[2]);
	}
	return saves;
}

function parseSenses(value) {
	const senses = {
		darkvision: null,
		blindsight: null,
		tremorsense: null,
		truesight: null,
		special: "",
		passivePerception: null
	};
	if ( !value ) return senses;
	for ( const key of ["darkvision", "blindsight", "tremorsense", "truesight"] ) {
		const m = value.match(new RegExp(`${key}\\s+(\\d+)\\s*ft\\.`, "i"));
		if ( m ) senses[key] = Number(m[1]);
	}
	const passive = value.match(/passive Perception\s+(\d+)/i);
	if ( passive ) senses.passivePerception = Number(passive[1]);
	const specialParts = value
		.split(",")
		.map(s => s.trim())
		.filter(s => s && !/darkvision|blindsight|tremorsense|truesight|passive Perception/i.test(s));
	senses.special = specialParts.join(", ");
	return senses;
}

function parseSpeed(value) {
	const speed = { walk: null, fly: null, swim: null, climb: null, burrow: null, hover: false };
	if ( !value ) return speed;
	const walk = value.match(/^(\d+)\s*ft\./i) || value.match(/walk\s+(\d+)\s*ft\./i);
	if ( walk ) speed.walk = Number(walk[1]);
	for ( const key of ["fly", "swim", "climb", "burrow"] ) {
		const m = value.match(new RegExp(`${key}\\s+(\\d+)\\s*ft\\.`, "i"));
		if ( m ) speed[key] = Number(m[1]);
	}
	if ( /hover/i.test(value) ) speed.hover = true;
	return speed;
}

function parseChallenge(value) {
	if ( !value ) return { cr: null, xp: null, pb: null };
	const m = value.match(/^([0-9/]+)\s*(?:\(([\d,]+)\s*XP\))?/i);
	const pb = value.match(/Proficiency Bonus:\s*([+-]?\d+)/i);
	return {
		cr: m ? m[1] : null,
		xp: m && m[2] ? Number(m[2].replace(/,/g, "")) : null,
		pb: pb ? Number(pb[1]) : null
	};
}

function parseHp(value) {
	if ( !value ) return { average: null, formula: null };
	const m = value.match(/^(\d+)\s*(?:\(([^)]+)\))?/);
	return {
		average: m ? Number(m[1]) : null,
		formula: m && m[2] ? m[2].trim() : null
	};
}

function parseAc(value) {
	if ( !value ) return { value: null, source: null };
	const m = value.match(/^(\d+)\s*(?:\(([^)]+)\))?/);
	return {
		value: m ? Number(m[1]) : null,
		source: m && m[2] ? m[2].trim() : null
	};
}

function parseAbilities(lines) {
	const joined = lines.join("\n");
	const row = joined.match(/\|\s*(\d+\s*\([^)]+\))\s*\|\s*(\d+\s*\([^)]+\))\s*\|\s*(\d+\s*\([^)]+\))\s*\|\s*(\d+\s*\([^)]+\))\s*\|\s*(\d+\s*\([^)]+\))\s*\|\s*(\d+\s*\([^)]+\))\s*\|/);
	if ( !row ) {
		// Fallback: consecutive score lines
		const scores = [];
		for ( const line of lines ) {
			const m = line.match(/^(\d+)\s*\(([+-]?\d+)\)\s*$/);
			if ( m ) scores.push(Number(m[1]));
		}
		if ( scores.length >= 6 ) {
			return Object.fromEntries(ABILITY_KEYS.map((k, i) => [k, scores[i]]));
		}
		return null;
	}
	const values = row.slice(1, 7).map(cell => Number(cell.match(/^(\d+)/)[1]));
	return Object.fromEntries(ABILITY_KEYS.map((k, i) => [k, values[i]]));
}

function isPlausibleFeatureName(name) {
	const n = String(name ?? "").trim();
	if ( !n ) return false;
	if ( n.length > 80 ) return false;
	if ( /@import|\.phb\b|font-size|line-height|padding:|width:|height:|copyright|gmbinder|terms of service|privacy|patreon/i.test(n) ) return false;
	if ( /^[^a-zA-Z0-9'"]/.test(n) ) return false;
	if ( /^[a-z0-9_-]+:\s*[0-9]/.test(n) ) return false;
	return true;
}

function parseNamedBlocks(lines, startLabels) {
	const blocks = [];
	let mode = null;
	let current = null;
	const startRe = new RegExp(`^(?:###\\s*)?(${startLabels.join("|")})\\s*$`, "i");

	function flush() {
		if ( current && isPlausibleFeatureName(current.name) ) blocks.push(current);
		current = null;
	}

	for ( const raw of lines ) {
		const line = raw.replace(/^>\s?/, "").trim();
		if ( startRe.test(line) ) {
			flush();
			mode = line.replace(/^###\s*/, "");
			continue;
		}
		const named = line.match(/^\*{0,3}([^*].+?)\.{0,1}\*{0,3}\.\s*(.*)$/)
			|| line.match(/^\*\*\*([^*]+)\.\*\*\*\s*(.*)$/)
			|| line.match(/^\*\*([^*]+)\.\*\*\s*(.*)$/);
		if ( mode && named ) {
			flush();
			current = {
				section: mode,
				name: named[1].replace(/\*+/g, "").trim(),
				text: named[2].trim()
			};
			continue;
		}
		if ( current ) {
			if ( line ) current.text = `${current.text} ${line}`.trim();
		}
	}
	flush();
	return blocks;
}

function parseTechForce(text) {
	const out = {
		techLevel: null,
		techPoints: null,
		techAbility: null,
		forceLevel: null,
		forcePoints: null,
		forceAbility: null
	};
	const tech = text.match(/(\d+)(?:st|nd|rd|th)?-level techcaster[\s\S]*?ability is (\w+)[\s\S]*?has (\d+) tech points/i)
		|| text.match(/techcaster[\s\S]*?has (\d+) tech points/i);
	if ( tech ) {
		if ( tech.length >= 4 ) {
			out.techLevel = Number(tech[1]);
			out.techAbility = tech[2].toLowerCase();
			out.techPoints = Number(tech[3]);
		} else {
			out.techPoints = Number(tech[1]);
		}
	}
	const techAlt = text.match(/has (\d+) tech points/i);
	if ( techAlt && out.techPoints == null ) out.techPoints = Number(techAlt[1]);
	const techLevelAlt = text.match(/(\d+)(?:st|nd|rd|th)?-level techcaster/i);
	if ( techLevelAlt && out.techLevel == null ) out.techLevel = Number(techLevelAlt[1]);

	const force = text.match(/(\d+)(?:st|nd|rd|th)?-level forcecaster[\s\S]*?ability is (\w+)[\s\S]*?has (\d+) force points/i)
		|| text.match(/has (\d+) force points/i);
	if ( force ) {
		if ( force.length >= 4 ) {
			out.forceLevel = Number(force[1]);
			out.forceAbility = force[2].toLowerCase();
			out.forcePoints = Number(force[3]);
		} else {
			out.forcePoints = Number(force[1]);
		}
	}
	const forceLevelAlt = text.match(/(\d+)(?:st|nd|rd|th)?-level forcecaster/i);
	if ( forceLevelAlt && out.forceLevel == null ) out.forceLevel = Number(forceLevelAlt[1]);
	return out;
}

function parseAttackMath(text) {
	const attacks = [];
	const re = /\*{0,3}([^*\n]+?)\.{0,1}\*{0,3}\.\s*\*(Melee|Ranged) Weapon Attack:\*\s*([+-]\d+)\s*to hit[\s\S]*?\*Hit:\*\s*([^.]+)\./gi;
	let m;
	while ( (m = re.exec(text)) ) {
		attacks.push({
			name: m[1].replace(/\*+/g, "").trim(),
			kind: m[2].toLowerCase(),
			bonus: Number(m[3]),
			hit: m[4].trim()
		});
	}
	// Plain form without markdown emphasis
	const re2 = /([A-Z][^.\n]+)\.\s*(Melee|Ranged) Weapon Attack:\s*([+-]\d+)\s*to hit[\s\S]*?Hit:\s*([^.]+)\./g;
	while ( (m = re2.exec(text)) ) {
		const name = m[1].trim();
		if ( attacks.some(a => normalizeName(a.name) === normalizeName(name)) ) continue;
		attacks.push({
			name,
			kind: m[2].toLowerCase(),
			bonus: Number(m[3]),
			hit: m[4].trim()
		});
	}
	return attacks;
}

function parseSnVMarkdown(markdown) {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const creatures = [];
	let section = "Uncategorized";
	let current = null;

	function flush() {
		if ( !current ) return;
		creatures.push(finalizeSnVCreature(current));
		current = null;
	}

	for ( const line of lines ) {
		const h1 = line.match(/^#\s+(.+)$/);
		if ( h1 && !line.startsWith("> ") ) {
			flush();
			section = h1[1].trim();
			continue;
		}
		const heading = line.match(/^>\s*##\s+(.+)$/);
		if ( heading ) {
			flush();
			current = { name: heading[1].trim(), section, lines: [] };
			continue;
		}
		if ( current ) current.lines.push(line);
	}
	flush();
	return creatures;
}

function finalizeSnVCreature(raw) {
	const bodyLines = raw.lines.map(l => l.replace(/^>\s?/, ""));
	const body = bodyLines.join("\n");
	const typeLine = bodyLines.map(l => l.trim()).find(l => /^\*.+\*$/.test(l) || /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i.test(l)) || "";
	const typeText = typeLine.replace(/^\*|\*$/g, "").trim();

	const fields = {};
	for ( const label of [
		"Armor Class", "Hit Points", "Speed", "Saving Throws", "Skills",
		"Damage Vulnerabilities", "Damage Resistances", "Damage Immunities",
		"Condition Immunities", "Senses", "Languages", "Challenge"
	] ) {
		for ( const line of bodyLines ) {
			const value = parseBareListLine(line.replace(/^\s*>\s?/, "").trim(), label);
			if ( value != null ) {
				fields[label] = value;
				break;
			}
		}
	}

	const abilities = parseAbilities(bodyLines);
	const ac = parseAc(fields["Armor Class"]);
	const hp = parseHp(fields["Hit Points"]);
	const challenge = parseChallenge(fields.Challenge || "");
	const casting = parseTechForce(body);
	const featureBlocks = parseNamedBlocks(bodyLines, [
		"Actions", "Bonus Actions", "Reactions", "Legendary Actions", "Mythic Actions"
	]);
	// Traits before Actions: lines matching ***Name.***
	const traits = [];
	let seenActions = false;
	for ( const line of bodyLines ) {
		const trimmed = line.trim();
		if ( /^###\s*Actions\b/i.test(trimmed) || /^Actions$/i.test(trimmed) ) {
			seenActions = true;
			continue;
		}
		if ( seenActions ) continue;
		const tm = trimmed.match(/^\*\*\*([^*]+)\.\*\*\*\s*(.*)$/)
			|| trimmed.match(/^\*\*([^*]+)\.\*\*\s*(.*)$/);
		if ( tm ) traits.push({ name: tm[1].trim(), text: tm[2].trim() });
	}

	const actionNames = featureBlocks.filter(b => /actions/i.test(b.section) && !/bonus|legendary|mythic|reaction/i.test(b.section)).map(b => b.name);
	const attacks = parseAttackMath(body);

	return {
		name: raw.name,
		section: raw.section,
		typeText,
		abilities,
		ac,
		hp,
		speed: parseSpeed(fields.Speed || ""),
		saves: parseSaves(fields["Saving Throws"] || ""),
		skills: parseSkills(fields.Skills || ""),
		damageVulnerabilities: parseCsvTraits(fields["Damage Vulnerabilities"]),
		damageResistances: parseCsvTraits(fields["Damage Resistances"]),
		damageImmunities: parseCsvTraits(fields["Damage Immunities"]),
		conditionImmunities: parseCsvTraits(fields["Condition Immunities"], { conditions: true }),
		senses: parseSenses(fields.Senses || ""),
		languages: fields.Languages || "",
		cr: challenge.cr,
		crValue: parseFraction(challenge.cr),
		xp: challenge.xp,
		pb: challenge.pb,
		casting,
		traits,
		featureBlocks,
		actionNames,
		attacks,
		rawText: body
	};
}

function loadPackActors(packDir) {
	const files = walkFiles(packDir, name => name.endsWith(".yml") && name !== "_folder.yml");
	return files.map(filePath => {
		const doc = YAML.load(fs.readFileSync(filePath, "utf8"));
		if ( !doc || doc.type !== "npc" ) return null;
		return {
			filePath: path.relative(ROOT, filePath).replace(/\\/g, "/"),
			id: doc._id,
			name: doc.name,
			doc
		};
	}).filter(Boolean);
}

function packSkillBonuses(actor) {
	const skills = actor.system?.skills || {};
	const abs = actor.system?.abilities || {};
	const pb = Number(actor.system?.attributes?.prof || 0);
	const out = {};
	for ( const [key, skill] of Object.entries(skills) ) {
		const abilityId = skill.ability || {
			acr: "dex", ani: "wis", ath: "str", dec: "cha", ins: "wis", itm: "cha",
			inv: "int", lor: "int", med: "wis", nat: "int", prc: "wis", prf: "cha",
			per: "cha", pil: "int", slt: "dex", ste: "dex", sur: "wis", tec: "int"
		}[key];
		const abilityMod = Math.floor(((abs[abilityId]?.value ?? 10) - 10) / 2);
		const prof = Number(skill.value || 0);
		const bonus = abilityMod + (prof * pb) + Number(skill.bonuses?.check || 0);
		// Only keep proficient/explicitly listed skills for comparison when snv lists them
		if ( prof > 0 || skill.bonuses?.check ) out[key] = bonus;
	}
	return out;
}

function packSaveBonuses(actor) {
	const abs = actor.system?.abilities || {};
	const pb = Number(actor.system?.attributes?.prof || 0);
	const out = {};
	for ( const key of ABILITY_KEYS ) {
		const abl = abs[key];
		if ( !abl ) continue;
		if ( !abl.proficient && !abl.bonuses?.save ) continue;
		const mod = Math.floor((Number(abl.value || 10) - 10) / 2);
		out[key] = mod + (abl.proficient ? pb : 0) + Number(abl.bonuses?.save || 0);
	}
	return out;
}

function packTraitList(actor, key) {
	const trait = actor.system?.traits?.[key];
	if ( !trait ) return [];
	const normalize = key === "ci" ? normalizeConditionTraitToken : normalizeDamageTraitToken;
	const values = [...(trait.value || [])].map(v => normalize(v));
	const custom = String(trait.custom || "")
		.split(/;|,/)
		.map(v => normalize(v))
		.filter(Boolean);
	return [...new Set([...values, ...custom])].sort();
}

function summarizePack(actorRecord) {
	const actor = actorRecord.doc;
	const items = actor.items || [];
	const itemNames = items.map(i => i.name);
	const weapons = items.filter(i => i.type === "weapon");
	const feats = items.filter(i => i.type === "feat");
	const attacks = weapons.map(w => {
		const parts = w.system?.damage?.parts || [];
		const hit = parts.map(p => `${p[0]}${p[1] ? ` ${p[1]}` : ""}`).join(" + ");
		return {
			name: w.name,
			actionType: w.system?.actionType || "",
			ability: w.system?.ability || "",
			hit
		};
	});

	return {
		name: actor.name,
		id: actor._id,
		filePath: actorRecord.filePath,
		abilities: Object.fromEntries(ABILITY_KEYS.map(k => [k, actor.system?.abilities?.[k]?.value ?? null])),
		ac: {
			value: actor.system?.attributes?.ac?.flat ?? null,
			calc: actor.system?.attributes?.ac?.calc ?? null
		},
		hp: {
			average: actor.system?.attributes?.hp?.max ?? actor.system?.attributes?.hp?.value ?? null,
			formula: actor.system?.attributes?.hp?.formula || null
		},
		speed: {
			walk: actor.system?.attributes?.movement?.walk ?? null,
			fly: actor.system?.attributes?.movement?.fly ?? null,
			swim: actor.system?.attributes?.movement?.swim ?? null,
			climb: actor.system?.attributes?.movement?.climb ?? null,
			burrow: actor.system?.attributes?.movement?.burrow ?? null,
			hover: Boolean(actor.system?.attributes?.movement?.hover)
		},
		skills: packSkillBonuses(actor),
		saves: packSaveBonuses(actor),
		damageVulnerabilities: packTraitList(actor, "dv"),
		damageResistances: packTraitList(actor, "dr"),
		damageImmunities: packTraitList(actor, "di"),
		conditionImmunities: packTraitList(actor, "ci"),
		senses: {
			darkvision: actor.system?.attributes?.senses?.darkvision || null,
			blindsight: actor.system?.attributes?.senses?.blindsight || null,
			tremorsense: actor.system?.attributes?.senses?.tremorsense || null,
			truesight: actor.system?.attributes?.senses?.truesight || null,
			special: actor.system?.attributes?.senses?.special || "",
			passivePerception: null
		},
		languages: [
			...(actor.system?.traits?.languages?.value || []),
			actor.system?.traits?.languages?.custom || ""
		].filter(Boolean).join(", "),
		cr: actor.system?.details?.cr,
		creatureType: actor.system?.details?.type?.value || "",
		creatureSubtype: actor.system?.details?.type?.subtype || "",
		sourceCustom: actor.system?.details?.source?.custom || "",
		techPoints: actor.system?.attributes?.tech?.points?.max
			?? actor.system?.attributes?.tech?.points?.value
			?? null,
		techLevel: actor.system?.details?.powerTechLevel ?? null,
		forcePoints: actor.system?.attributes?.force?.points?.max
			?? actor.system?.attributes?.force?.points?.value
			?? null,
		forceLevel: actor.system?.details?.powerForceLevel ?? null,
		itemNames,
		featNames: feats.map(i => i.name),
		weaponNames: weapons.map(i => i.name),
		attacks
	};
}

function eq(a, b) {
	if ( a == null && b == null ) return true;
	if ( typeof a === "number" && typeof b === "number" ) return a === b;
	if ( Array.isArray(a) && Array.isArray(b) ) {
		if ( a.length !== b.length ) return false;
		for ( let i = 0; i < a.length; i++ ) if ( a[i] !== b[i] ) return false;
		return true;
	}
	return String(a ?? "") === String(b ?? "");
}

function diffCreature(snv, pack) {
	const diffs = [];
	function add(field, expected, actual, note) {
		if ( eq(expected, actual) ) return;
		diffs.push({ field, expected, actual, note: note || null });
	}

	for ( const key of ABILITY_KEYS ) {
		if ( snv.abilities?.[key] != null ) add(`abilities.${key}`, snv.abilities[key], pack.abilities[key]);
	}
	if ( snv.ac.value != null ) add("ac.value", snv.ac.value, pack.ac.value);
	if ( snv.hp.average != null ) add("hp.average", snv.hp.average, pack.hp.average);
	if ( snv.hp.formula ) add("hp.formula", snv.hp.formula.replace(/\s+/g, ""), String(pack.hp.formula || "").replace(/\s+/g, ""));
	if ( snv.speed.walk != null ) add("speed.walk", snv.speed.walk, pack.speed.walk);
	for ( const move of ["fly", "swim", "climb", "burrow"] ) {
		if ( snv.speed[move] != null ) add(`speed.${move}`, snv.speed[move], pack.speed[move]);
	}
	if ( snv.cr != null ) {
		const packCr = pack.cr == null ? null : String(pack.cr);
		const snvCr = String(snv.cr);
		// Accept numeric equivalence 0.5 vs 1/2
		const same = parseFraction(snvCr) === parseFraction(packCr) || snvCr === packCr;
		if ( !same ) add("cr", snv.cr, pack.cr);
	}
	if ( snv.casting.techPoints != null ) add("techPoints", snv.casting.techPoints, pack.techPoints);
	if ( snv.casting.techLevel != null ) add("techLevel", snv.casting.techLevel, pack.techLevel);
	if ( snv.casting.forcePoints != null ) add("forcePoints", snv.casting.forcePoints, pack.forcePoints);
	if ( snv.casting.forceLevel != null ) add("forceLevel", snv.casting.forceLevel, pack.forceLevel);

	// Skill overlap: only compare skills listed in SnV
	for ( const [skill, bonus] of Object.entries(snv.skills || {}) ) {
		if ( pack.skills[skill] == null ) add(`skills.${skill}`, bonus, null, "missing proficient skill on pack");
		else add(`skills.${skill}`, bonus, pack.skills[skill]);
	}
	for ( const [abl, bonus] of Object.entries(snv.saves || {}) ) {
		if ( pack.saves[abl] == null ) add(`saves.${abl}`, bonus, null, "missing save proficiency on pack");
		else add(`saves.${abl}`, bonus, pack.saves[abl]);
	}

	for ( const sense of ["darkvision", "blindsight", "tremorsense", "truesight"] ) {
		if ( snv.senses[sense] != null ) add(`senses.${sense}`, snv.senses[sense], pack.senses[sense] || null);
	}

	if ( snv.damageVulnerabilities.length ) add("damageVulnerabilities", snv.damageVulnerabilities, pack.damageVulnerabilities);
	if ( snv.damageResistances.length ) add("damageResistances", snv.damageResistances, pack.damageResistances);
	if ( snv.damageImmunities.length ) add("damageImmunities", snv.damageImmunities, pack.damageImmunities);
	if ( snv.conditionImmunities.length ) add("conditionImmunities", snv.conditionImmunities, pack.conditionImmunities);

	const snvTraitNames = snv.traits.map(t => normalizeName(t.name));
	const snvActionNames = snv.featureBlocks.map(b => normalizeName(b.name));
	const packItemNorm = pack.itemNames.map(normalizeName);
	for ( const name of snv.traits.map(t => t.name) ) {
		if ( !packItemNorm.includes(normalizeName(name)) ) {
			// allow trailing period differences / Techcasting. vs Techcasting
			const soft = normalizeName(name.replace(/\.$/, ""));
			if ( !packItemNorm.some(n => n.replace(/\.$/, "") === soft) ) {
				diffs.push({ field: "items.trait", expected: name, actual: null, note: "SnV trait not found among pack item names" });
			}
		}
	}
	for ( const block of snv.featureBlocks ) {
		const soft = normalizeName(block.name.replace(/\.$/, ""));
		if ( !packItemNorm.some(n => n.replace(/\.$/, "") === soft) ) {
			diffs.push({
				field: `items.${normalizeName(block.section) || "feature"}`,
				expected: block.name,
				actual: null,
				note: "SnV feature/action not found among pack item names"
			});
		}
	}

	for ( const atk of snv.attacks ) {
		const packAtk = pack.attacks.find(a => normalizeName(a.name) === normalizeName(atk.name));
		if ( !packAtk ) {
			diffs.push({ field: "attack", expected: atk, actual: null, note: "missing attack item" });
			continue;
		}
		if ( atk.hit && packAtk.hit ) {
			const snvHitNorm = normalizeName(atk.hit).replace(/\s+/g, "");
			const packHitNorm = normalizeName(packAtk.hit).replace(/\s+/g, "");
			if ( !snvHitNorm.includes(packHitNorm) && !packHitNorm.includes(snvHitNorm.replace(/kinetic|energy|ion/g, "")) ) {
				// Compare dice average presence loosely via formula tokens
				const snvDice = atk.hit.match(/\d+d\d+(?:\s*[+-]\s*\d+)?/i)?.[0];
				const packDice = packAtk.hit.match(/\d+d\d+(?:\s*[+-]\s*\d+)?/i)?.[0];
				if ( snvDice && packDice && normalizeName(snvDice) !== normalizeName(packDice) ) {
					diffs.push({ field: `attack.${atk.name}.damage`, expected: atk.hit, actual: packAtk.hit, note: null });
				}
			}
		}
	}

	return {
		snvTraitNames,
		snvActionNames,
		diffCount: diffs.length,
		diffs
	};
}

function classify(snvCreatures, packActors, aliasDoc) {
	const aliases = aliasDoc.aliases || {};
	const ambiguousDoc = aliasDoc.ambiguous || {};
	const packByName = new Map(packActors.map(p => [p.name, p]));
	const packByNorm = new Map();
	for ( const p of packActors ) {
		const key = normalizeName(p.name);
		if ( !packByNorm.has(key) ) packByNorm.set(key, []);
		packByNorm.get(key).push(p);
	}

	const snvRows = [];
	const matchedPackNames = new Set();

	for ( const snv of snvCreatures ) {
		if ( ambiguousDoc[snv.name] ) {
			snvRows.push({
				snvName: snv.name,
				section: snv.section,
				classification: "ambiguous",
				packName: null,
				packId: null,
				packPath: null,
				reason: ambiguousDoc[snv.name].reason,
				candidates: ambiguousDoc[snv.name].candidates || []
			});
			continue;
		}

		let pack = null;
		let classification = null;
		const aliasTarget = aliases[snv.name];
		if ( aliasTarget ) {
			pack = packByName.get(aliasTarget) || null;
			classification = pack ? "alias-match" : "missing";
		} else {
			const exact = packByName.get(snv.name);
			if ( exact ) {
				pack = exact;
				classification = "exact-match";
			} else {
				const normHits = packByNorm.get(normalizeName(snv.name)) || [];
				if ( normHits.length === 1 ) {
					pack = normHits[0];
					classification = "alias-match";
				} else if ( normHits.length > 1 ) {
					snvRows.push({
						snvName: snv.name,
						section: snv.section,
						classification: "ambiguous",
						packName: null,
						packId: null,
						packPath: null,
						reason: "Multiple pack actors share normalized name",
						candidates: normHits.map(h => h.name)
					});
					continue;
				} else {
					classification = "missing";
				}
			}
		}

		if ( pack ) matchedPackNames.add(pack.name);
		snvRows.push({
			snvName: snv.name,
			section: snv.section,
			classification,
			packName: pack?.name ?? null,
			packId: pack?.id ?? null,
			packPath: pack?.filePath ?? null,
			reason: classification === "missing" ? "No pack actor matched" : null,
			candidates: []
		});
	}

	const packRows = packActors.map(p => ({
		packName: p.name,
		packId: p.id,
		packPath: p.filePath,
		classification: matchedPackNames.has(p.name) ? "matched" : "pack-only",
		sourceCustom: p.doc?.system?.details?.source?.custom || ""
	}));

	return { snvRows, packRows };
}

function writeJson(filePath, data) {
	fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function renderSummary({ meta, counts, snvRows, packRows, diffs, spotChecks }) {
	const lines = [];
	lines.push("# SnV Monster Census Summary");
	lines.push("");
	lines.push("```text");
	lines.push(`Date: ${meta.date}`);
	lines.push(`Branch: ${meta.branch}`);
	lines.push(`SHA: ${meta.sha}`);
	lines.push("Authorization: Investigation only (Slice 0)");
	lines.push("Pack mutations: none");
	lines.push("```");
	lines.push("");
	lines.push("## Provenance");
	lines.push("");
	lines.push(`- SnV source file: \`${meta.snvPath}\``);
	lines.push(`- SnV heading count: **${counts.snvTotal}**`);
	lines.push(`- Pack NPC count: **${counts.packTotal}**`);
	if ( meta.recoveryNote ) {
		lines.push(`- Recovery note: ${meta.recoveryNote}`);
	}
	lines.push("");
	lines.push("## Classification counts");
	lines.push("");
	lines.push("| Class | Count |");
	lines.push("|---|---:|");
	lines.push(`| exact-match | ${counts.exactMatch} |`);
	lines.push(`| alias-match | ${counts.aliasMatch} |`);
	lines.push(`| missing | ${counts.missing} |`);
	lines.push(`| ambiguous | ${counts.ambiguous} |`);
	lines.push(`| pack-only | ${counts.packOnly} |`);
	lines.push(`| matched with zero diffs | ${counts.matchedClean} |`);
	lines.push(`| matched with diffs | ${counts.matchedDirty} |`);
	lines.push("");
	lines.push("## Missing by section");
	lines.push("");
	const missingBySection = {};
	for ( const row of snvRows.filter(r => r.classification === "missing") ) {
		missingBySection[row.section] = (missingBySection[row.section] || 0) + 1;
	}
	for ( const [section, count] of Object.entries(missingBySection).sort((a, b) => b[1] - a[1]) ) {
		lines.push(`- ${section}: ${count}`);
	}
	lines.push("");
	lines.push("## Top mismatched matched actors");
	lines.push("");
	const dirty = [...diffs].sort((a, b) => b.diffCount - a.diffCount).slice(0, 25);
	for ( const row of dirty ) {
		lines.push(`- ${row.snvName} ↔ ${row.packName}: ${row.diffCount} diffs`);
	}
	lines.push("");
	lines.push("## Spot checks");
	lines.push("");
	for ( const check of spotChecks ) {
		lines.push(`### ${check.name}`);
		lines.push("");
		lines.push(`- Classification: ${check.classification}`);
		lines.push(`- Pack: ${check.packName || "(none)"}`);
		lines.push(`- Diff count: ${check.diffCount}`);
		for ( const d of check.sampleDiffs ) {
			lines.push(`- \`${d.field}\`: expected \`${JSON.stringify(d.expected)}\`, actual \`${JSON.stringify(d.actual)}\``);
		}
		lines.push("");
	}
	lines.push("## Next authorization gate");
	lines.push("");
	lines.push("```text");
	lines.push("Source-data correction authorized — Slice 1 matched-actor alignment");
	lines.push("```");
	lines.push("");
	lines.push("Then separately:");
	lines.push("");
	lines.push("```text");
	lines.push("Source-data correction authorized — Slice 2 missing-actor creation");
	lines.push("Pack rebuild authorized");
	lines.push("```");
	lines.push("");
	return `${lines.join("\n")}\n`;
}

function gitMeta() {
	try {
		const branch = fs.readFileSync(path.join(ROOT, ".git/HEAD"), "utf8").trim();
		const ref = branch.startsWith("ref:") ? branch.slice(5).trim() : branch;
		const shaPath = path.join(ROOT, ".git", ref);
		const sha = fs.existsSync(shaPath) ? fs.readFileSync(shaPath, "utf8").trim().slice(0, 9) : "unknown";
		return { branch: ref.replace("refs/heads/", ""), sha };
	} catch {
		return { branch: "unknown", sha: "unknown" };
	}
}

function main() {
	ensureDir(OUT_DIR);
	const snvText = readText(SNV_PATH);
	const aliasDoc = JSON.parse(readText(ALIAS_PATH));
	const snvCreatures = parseSnVMarkdown(snvText);
	const packActors = loadPackActors(PACK_DIR);
	if ( !snvCreatures.length ) die("No SnV creatures parsed.");
	if ( !packActors.length ) die("No pack NPC YAML found.");

	const { snvRows, packRows } = classify(snvCreatures, packActors, aliasDoc);
	const snvByName = new Map(snvCreatures.map(c => [c.name, c]));
	const packByName = new Map(packActors.map(p => [p.name, summarizePack(p)]));

	const diffs = [];
	for ( const row of snvRows ) {
		if ( row.classification !== "exact-match" && row.classification !== "alias-match" ) continue;
		const snv = snvByName.get(row.snvName);
		const pack = packByName.get(row.packName);
		const result = diffCreature(snv, pack);
		diffs.push({
			snvName: row.snvName,
			packName: row.packName,
			packId: row.packId,
			packPath: row.packPath,
			classification: row.classification,
			...result
		});
	}

	const counts = {
		snvTotal: snvCreatures.length,
		packTotal: packActors.length,
		exactMatch: snvRows.filter(r => r.classification === "exact-match").length,
		aliasMatch: snvRows.filter(r => r.classification === "alias-match").length,
		missing: snvRows.filter(r => r.classification === "missing").length,
		ambiguous: snvRows.filter(r => r.classification === "ambiguous").length,
		packOnly: packRows.filter(r => r.classification === "pack-only").length,
		matchedClean: diffs.filter(d => d.diffCount === 0).length,
		matchedDirty: diffs.filter(d => d.diffCount > 0).length
	};

	const spotNames = [
		"000 Series Protocol Droid",
		"Gonk Droid",
		"Acklay, Adolescent",
		"B'omarr BT-16 Brain Walker",
		"3P0 Series Droid",
		"Bantha, Adult"
	];
	const spotChecks = spotNames.map(name => {
		const row = snvRows.find(r => r.snvName === name);
		const diff = diffs.find(d => d.snvName === name);
		return {
			name,
			classification: row?.classification || "not-in-snv-source",
			packName: row?.packName || null,
			diffCount: diff?.diffCount ?? null,
			sampleDiffs: (diff?.diffs || []).slice(0, 8)
		};
	});

	const git = gitMeta();
	const meta = {
		date: new Date().toISOString().slice(0, 10),
		branch: git.branch,
		sha: git.sha,
		snvPath: path.relative(ROOT, SNV_PATH).replace(/\\/g, "/"),
		packDir: path.relative(ROOT, PACK_DIR).replace(/\\/g, "/"),
		aliasPath: path.relative(ROOT, ALIAS_PATH).replace(/\\/g, "/"),
		recoveryNote: snvText.includes("RECOVERED REFERENCE COPY")
			? "ai/SnV_Final.md is a recovered GM Binder substitute (maintainer-local gitignored original was absent). Prior planning counted 509 headings in the authentic file."
			: null
	};

	const ledger = {
		meta,
		counts,
		snvClassifications: snvRows,
		packClassifications: packRows,
		diffs,
		missing: snvRows.filter(r => r.classification === "missing"),
		ambiguous: snvRows.filter(r => r.classification === "ambiguous"),
		packOnly: packRows.filter(r => r.classification === "pack-only"),
		spotChecks,
		snvParsed: snvCreatures.map(c => ({
			name: c.name,
			section: c.section,
			ac: c.ac,
			hp: c.hp,
			abilities: c.abilities,
			cr: c.cr,
			casting: c.casting,
			traitNames: c.traits.map(t => t.name),
			featureNames: c.featureBlocks.map(b => `${b.section}: ${b.name}`),
			attacks: c.attacks
		}))
	};

	writeJson(path.join(OUT_DIR, "ledger.json"), ledger);
	writeJson(path.join(OUT_DIR, "classifications.json"), { snvRows, packRows, counts });
	writeJson(path.join(OUT_DIR, "diffs.json"), diffs);
	writeJson(path.join(OUT_DIR, "missing.json"), ledger.missing);
	writeJson(path.join(OUT_DIR, "ambiguous.json"), ledger.ambiguous);
	writeJson(path.join(OUT_DIR, "pack-only.json"), ledger.packOnly);
	writeJson(path.join(OUT_DIR, "spot-checks.json"), spotChecks);

	const summary = renderSummary({ meta, counts, snvRows, packRows, diffs, spotChecks });
	fs.writeFileSync(path.join(OUT_DIR, "summary.md"), summary, "utf8");
	fs.writeFileSync(SUMMARY_PATH, summary, "utf8");

	console.log("[snv-monster-census] complete");
	console.log(JSON.stringify(counts, null, 2));
	console.log(`Wrote ${path.relative(ROOT, OUT_DIR)}`);
	console.log(`Wrote ${path.relative(ROOT, SUMMARY_PATH)}`);
}

main();
