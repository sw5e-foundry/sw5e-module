#!/usr/bin/env node
/**
 * Migrate conditional save-target DC modification items (Fadecasting / Rendcasting / Withercasting)
 * to Active Effects using system.bonuses.{force|tech}.save.{ability}.dc keys.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const AUDIT = path.join(ROOT, "ai", "sessions", "_audit-power-bonus-items-refined.json");
const SOURCE_ROOT = path.join(ROOT, "packs", "_source");

const MODE_ADD = 2;
const PRIORITY = 20;
const DRY_RUN = process.argv.includes("--dry-run");
const SINGLE = process.argv.find(a => a.startsWith("--only="))?.slice("--only=".length);

/**
 * @param {string} key
 * @returns {string|null}
 */
function toSaveTargetDcKey(key) {
	const m = /^system\.bonuses\.(force|tech)\.(str|dex|con|int|wis|cha)\.dc$/.exec(key);
	if ( !m ) return null;
	return `system.bonuses.${m[1]}.save.${m[2]}.dc`;
}

/**
 * Stable 16-char Foundry-style id from inputs.
 * @param {string} seed
 */
function stableEffectId(seed) {
	return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

/**
 * @param {object} doc
 * @param {import("../ai/sessions/_audit-power-bonus-items-refined.json").results[0]} auditRow
 */
function buildEffect(doc, auditRow) {
	const itemId = doc._id;
	if ( !itemId ) throw new Error(`Missing _id on ${auditRow.source}`);

	const changes = [];
	for ( const rec of auditRow.recommendations ) {
		const key = toSaveTargetDcKey(rec.key);
		if ( !key ) throw new Error(`Unmapped key ${rec.key} on ${auditRow.name}`);
		changes.push({
			key,
			mode: MODE_ADD,
			value: String(rec.value),
			priority: PRIORITY
		});
	}

	const effectId = stableEffectId(`${itemId}:save-target-dc`);
	const img = doc.img ?? "icons/svg/aura.svg";

	return {
		name: `${doc.name} - Save Target DC`,
		origin: `Compendium.sw5e-module.enhanceditems.Item.${itemId}`,
		duration: {
			startTime: null,
			seconds: null,
			combat: null,
			rounds: null,
			turns: null,
			startRound: null,
			startTurn: null
		},
		transfer: false,
		disabled: false,
		_id: effectId,
		changes,
		description: "",
		statuses: [],
		flags: {},
		tint: "#ffffff",
		_stats: {
			coreVersion: "13.351",
			systemId: "dnd5e",
			systemVersion: "5.2.5",
			createdTime: null,
			modifiedTime: null,
			lastModifiedBy: "dnd5ebuilder0000",
			compendiumSource: null,
			duplicateSource: null
		},
		img,
		type: "base",
		system: {},
		sort: 0,
		_key: `!items.effects!${itemId}.${effectId}`
	};
}

function loadAuditRows() {
	const audit = JSON.parse(fs.readFileSync(AUDIT, "utf8"));
	return audit.results.filter(row => row.category === "conditional-save-dc");
}

function main() {
	const rows = loadAuditRows();
	if ( SINGLE ) {
		const one = rows.find(r => r.source.endsWith(SINGLE) || r.source.includes(SINGLE));
		if ( !one ) throw new Error(`No audit row for --only=${SINGLE}`);
		rows.length = 0;
		rows.push(one);
	}

	let updated = 0;
	let skipped = 0;

	for ( const row of rows ) {
		const filePath = path.join(SOURCE_ROOT, row.source);
		if ( !fs.existsSync(filePath) ) throw new Error(`Missing file ${filePath}`);

		const raw = fs.readFileSync(filePath, "utf8");
		const doc = yaml.load(raw);
		if ( !doc || typeof doc !== "object" ) throw new Error(`Invalid YAML ${filePath}`);

		if ( Array.isArray(doc.effects) && doc.effects.length > 0 ) {
			console.warn(`SKIP (existing effects): ${row.source}`);
			skipped++;
			continue;
		}

		const effect = buildEffect(doc, row);
		doc.effects = [effect];

		if ( DRY_RUN ) {
			console.log(`DRY ${row.source}`, effect.changes.map(c => `${c.key}=${c.value}`).join(", "));
			updated++;
			continue;
		}

		const out = yaml.dump(doc, {
			lineWidth: -1,
			noRefs: true,
			quotingType: "'",
			forceQuotes: false
		});
		fs.writeFileSync(filePath, out, "utf8");
		console.log(`OK ${row.source}`);
		updated++;
	}

	console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${rows.length} total`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if ( isMain ) main();

export { toSaveTargetDcKey, buildEffect, loadAuditRows };
