#!/usr/bin/env node
/**
 * Audit Channeling/Crystalizing (melee-ranged-split) mods for mpak/rpak migration.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const AUDIT_PATH = path.join(ROOT, "ai", "sessions", "_audit-power-bonus-items-refined.json");
const OUT_JSON = path.join(ROOT, "ai", "sessions", "_audit-channeling-crystalizing-mpak-rpak-mapping.json");

function stripHtml(html = "") {
	return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function parseHostType(text) {
	const m = /<h4>[^<]*item\s*modification[^<]*\(([^)]+)\)/i.exec(text);
	if ( m ) return m[1].trim();
	if ( /wristpad/i.test(text) ) return "Wristpad";
	if ( /blaster/i.test(text) ) return "Blaster";
	if ( /vibroweapon/i.test(text) ) return "Vibroweapon";
	if ( /focus generator/i.test(text) ) return "Focus Generator";
	return "Unknown";
}

function parseCastType(text) {
	return /\btech attacks?\b/i.test(text) ? "tech" : "force";
}

/**
 * Migration mapping from item text (not raw audit recs when audit used tech.attack).
 * @param {string} text
 */
function mapFromText(text) {
	const plain = stripHtml(text);
	const cast = parseCastType(plain);
	const changes = [];

	const meleeBonus = plain.match(/\+(\d+) bonus to melee (?:force|tech) attacks?/i);
	const rangedBonus = plain.match(/\+(\d+) bonus to ranged (?:force|tech) attacks?/i);
	const meleePenalty = plain.match(/-(\d+) penalty to melee (?:force|tech) attacks?/i);
	const rangedPenalty = plain.match(/-(\d+) penalty to ranged (?:force|tech) attacks?/i);

	if ( meleeBonus ) changes.push({ key: "system.bonuses.mpak.attack", value: Number(meleeBonus[1]) });
	if ( rangedBonus ) changes.push({ key: "system.bonuses.rpak.attack", value: Number(rangedBonus[1]) });
	if ( meleePenalty ) changes.push({ key: "system.bonuses.mpak.attack", value: -Number(meleePenalty[1]) });
	if ( rangedPenalty ) changes.push({ key: "system.bonuses.rpak.attack", value: -Number(rangedPenalty[1]) });

	return { cast, changes };
}

function auditRecIssues(item, mapped) {
	const issues = [];
	const auditKeys = new Set(item.recommendations.map(r => r.key));
	const mappedKeys = new Set(mapped.changes.map(c => c.key));

	for ( const rec of item.recommendations ) {
		if ( rec.key === "system.bonuses.tech.attack" ) {
			issues.push("audit used tech.attack (school-wide); migration should use mpak/rpak for melee/ranged split");
		}
	}

	for ( const ch of mapped.changes ) {
		if ( !mappedKeys.has(ch.key) ) continue;
		const auditMatch = item.recommendations.find(r => r.key === ch.key && r.value === ch.value);
		if ( ch.key.startsWith("system.bonuses.") && !auditMatch && !auditKeys.has("system.bonuses.tech.attack") ) {
			// ok — mapped from text
		}
	}

	const mappedStr = mapped.changes.map(c => `${c.key}=${c.value}`).join(", ");
	const auditStr = item.recommendations.map(r => `${r.key}=${r.value}`).join(", ");
	if ( mappedStr !== auditStr && !issues.some(i => i.includes("tech.attack")) ) {
		if ( mappedStr.replace(/system\.bonuses\.(mpak|rpak)/g, "X") !== auditStr.replace(/system\.bonuses\.(mpak|rpak|tech)/g, "X") ) {
			issues.push(`mapping differs: mapped [${mappedStr}] vs audit [${auditStr}]`);
		}
	}

	return issues;
}

function recommend(item, mapped, issues) {
	if ( !mapped.changes.length ) return "defer";
	if ( issues.some(i => i.includes("differs") && !i.includes("tech.attack")) ) return "review";
	return "migrate";
}

const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf8"));
const items = audit.results.filter(r => r.category === "melee-ranged-split");

const rows = [];
for ( const item of items ) {
	const filePath = path.join(ROOT, "packs/_source", item.source);
	const doc = fs.existsSync(filePath) ? yaml.load(fs.readFileSync(filePath, "utf8")) : null;
	const text = doc?.system?.description?.value ?? item.text;
	const host = parseHostType(text);
	const mapped = mapFromText(text);
	const issues = auditRecIssues(item, mapped);
	const action = recommend(item, mapped, issues);

	rows.push({
		name: item.name,
		source: item.source,
		host,
		cast: mapped.cast,
		transfer: item.transfer === false ? false : item.transfer,
		textSnippet: stripHtml(text).slice(0, 140),
		auditRecommendations: item.recommendations.map(r => ({ key: r.key, mode: r.mode, value: r.value })),
		migrationChanges: mapped.changes.map(c => ({ key: c.key, mode: "ADD", value: c.value, priority: 20 })),
		issues,
		recommendation: action,
		existingEffects: doc?.effects?.length ?? item.existingEffects ?? 0
	});
}

const summary = {
	total: rows.length,
	migrate: rows.filter(r => r.recommendation === "migrate").length,
	review: rows.filter(r => r.recommendation === "review").length,
	defer: rows.filter(r => r.recommendation === "defer").length,
	force: rows.filter(r => r.cast === "force").length,
	tech: rows.filter(r => r.cast === "tech").length,
	auditTechAttackCount: rows.filter(r => r.auditRecommendations.some(a => a.key === "system.bonuses.tech.attack")).length,
	withPenalty: rows.filter(r => r.migrationChanges.some(c => c.value < 0)).length,
	transferFalse: rows.filter(r => r.transfer === false).length
};

fs.writeFileSync(OUT_JSON, JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log("Wrote", OUT_JSON);
