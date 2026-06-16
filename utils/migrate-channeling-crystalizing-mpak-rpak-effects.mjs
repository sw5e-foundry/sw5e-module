#!/usr/bin/env node
/**
 * Migrate Channeling/Crystalizing melee-ranged power attack mods to Active Effects
 * using system.bonuses.mpak.attack / system.bonuses.rpak.attack.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MAPPING = path.join(ROOT, "ai", "sessions", "_audit-channeling-crystalizing-mpak-rpak-mapping.json");
const SOURCE_ROOT = path.join(ROOT, "packs", "_source");

const MODE_ADD = 2;
const PRIORITY = 20;
const ALLOWED_KEYS = new Set([
	"system.bonuses.mpak.attack",
	"system.bonuses.rpak.attack"
]);

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const SINGLE = process.argv.find(a => a.startsWith("--only="))?.slice("--only=".length);

/**
 * @param {string} seed
 */
function stableEffectId(seed) {
	return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

/**
 * @param {object} doc
 * @param {object} row
 */
function buildEffect(doc, row) {
	const itemId = doc._id;
	if ( !itemId ) throw new Error(`Missing _id on ${row.source}`);

	const changes = [];
	for ( const ch of row.migrationChanges ) {
		if ( !ALLOWED_KEYS.has(ch.key) ) throw new Error(`Disallowed key ${ch.key} on ${row.name}`);
		changes.push({
			key: ch.key,
			mode: MODE_ADD,
			value: String(ch.value),
			priority: PRIORITY
		});
	}
	if ( !changes.length ) throw new Error(`No migration changes for ${row.name}`);

	const effectId = stableEffectId(`${itemId}:power-attack`);
	const img = doc.img ?? "icons/svg/aura.svg";

	return {
		name: `${doc.name} - Power Attack`,
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

export function loadMappingRows() {
	const data = JSON.parse(fs.readFileSync(MAPPING, "utf8"));
	return data.rows.filter(r => r.recommendation === "migrate");
}

function main() {
	let rows = loadMappingRows();
	if ( SINGLE ) {
		const one = rows.find(r => r.source.endsWith(SINGLE) || r.source.includes(SINGLE));
		if ( !one ) throw new Error(`No mapping row for --only=${SINGLE}`);
		rows = [one];
	}

	let updated = 0;
	let skipped = 0;

	for ( const row of rows ) {
		const filePath = path.join(SOURCE_ROOT, row.source);
		if ( !fs.existsSync(filePath) ) throw new Error(`Missing file ${filePath}`);

		const raw = fs.readFileSync(filePath, "utf8");
		const doc = yaml.load(raw);
		if ( !doc || typeof doc !== "object" ) throw new Error(`Invalid YAML ${filePath}`);

		if ( Array.isArray(doc.effects) && doc.effects.length > 0 && !FORCE ) {
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

export { buildEffect, ALLOWED_KEYS, MODE_ADD, PRIORITY };
