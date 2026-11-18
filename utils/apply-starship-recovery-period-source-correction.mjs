#!/usr/bin/env node
/**
 * Apply approved Starship Feature recovery-period source corrections.
 * Gate: the current approved recovery-period census, with zero rows still awaiting correction.
 * Changes only uses.per recharge→sr and refitting→lr for proven ship-rest wording.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");
const VALIDATE = process.argv.includes("--validate");

function walk(dir, acc = []) {
	if ( !fs.existsSync(dir) ) return acc;
	for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const full = path.join(dir, entry.name);
		if ( entry.isDirectory() ) walk(full, acc);
		else if ( /\.(yml|yaml)$/i.test(entry.name) ) acc.push(full);
	}
	return acc;
}

function loadDoc(file) {
	return yaml.load(fs.readFileSync(file, "utf8"));
}

function plainDesc(system) {
	const d = system?.description?.value ?? system?.description ?? "";
	return String(d).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function classify(text, per) {
	const t = text.toLowerCase();
	const roll = (
		/recharge\s*\d|recharge\s*[5-6]|recharge\s*5\s*[–-]\s*6|recharge \[/.test(t)
		|| (/roll a d6/.test(t) && /recharge|regain/.test(t))
		|| /regains this use on a roll|on a recharge of/.test(t)
	) && !/undergoes recharging|when the ship recharges|until the ship recharges|ship undergoes recharging|undergoes refitting|ship is refitted/.test(t);
	const shipRe = /undergoes recharging|when the ship recharges|until the ship recharges|after the ship recharges|when the ship undergoes recharging|regained when the ship undergoes recharging|all expended uses are regained when the ship recharges|until the ship recharges|when the ship recharges/.test(t)
		|| (/\brecharges\b/.test(t) && /(expended|use|uses|regain|can't be used|cannot be used|can't be used again)/.test(t));
	const shipRf = /undergoes refitting|until the ship undergoes refitting|when the ship undergoes refitting|when the ship is refitted|until the ship is refitted|after the ship refits|all expended uses are regained when the ship is refitted|when the ship is refitted/.test(t);

	if ( roll ) return { bucket: "native_recharge_check", expected: "recharge", shipRe: false, shipRf: false };
	if ( shipRe ) return { bucket: "ship_recharging_to_sr", expected: "sr", shipRe: true, shipRf: false };
	if ( shipRf ) return { bucket: "ship_refitting_to_lr", expected: "lr", shipRe: false, shipRf: true };
	if ( per === "recharge" ) return { bucket: "ambiguous_legacy_recharge", expected: null, shipRe: false, shipRf: false };
	if ( per === "refitting" ) return { bucket: "ambiguous_legacy_refitting", expected: null, shipRe: false, shipRf: false };
	return { bucket: "other", expected: null, shipRe: false, shipRf: false };
}

function buildLedger() {
	const rows = [];

	for ( const file of walk(path.join(ROOT, "packs/_source/starships/starship-features")) ) {
		const doc = loadDoc(file);
		if ( !doc || String(doc._key || "").includes("folders") ) continue;
		if ( doc.type && doc.type !== "feat" ) continue;
		const per = doc.system?.uses?.per ?? null;
		const cls = classify(plainDesc(doc.system), per);
		const inApproved = (cls.shipRe && (per === "recharge" || per === "sr"))
			|| (cls.shipRf && (per === "refitting" || per === "lr"));
		if ( !inApproved && per !== "recharge" && per !== "refitting" ) continue;
		if ( !inApproved && (per === "recharge" || per === "refitting") ) {
			rows.push({
				corpus: "standalone",
				name: doc.name,
				id: doc._id,
				file: path.relative(ROOT, file).replace(/\\/g, "/"),
				abs: file,
				per,
				max: doc.system?.uses?.max ?? null,
				recovery: doc.system?.uses?.recovery,
				...cls,
				correctionRequired: false,
				approved: false
			});
			continue;
		}
		if ( !inApproved ) continue;
		rows.push({
			corpus: "standalone",
			name: doc.name,
			id: doc._id,
			file: path.relative(ROOT, file).replace(/\\/g, "/"),
			abs: file,
			per,
			max: doc.system?.uses?.max ?? null,
			recovery: doc.system?.uses?.recovery,
			...cls,
			correctionRequired: per !== cls.expected,
			approved: true,
			fromPer: cls.expected === "sr" ? "recharge" : "refitting"
		});
	}

	for ( const file of walk(path.join(ROOT, "packs/_source/drakes-shipyard")) ) {
		const doc = loadDoc(file);
		if ( !Array.isArray(doc?.items) ) continue;
		for ( const item of doc.items ) {
			if ( item.type !== "feat" ) continue;
			const ft = item.system?.type?.value;
			if ( ft && ft !== "starship" && ft !== "starshipAction" ) continue;
			const per = item.system?.uses?.per ?? null;
			const cls = classify(plainDesc(item.system), per);
			const inApproved = (cls.shipRe && (per === "recharge" || per === "sr"))
				|| (cls.shipRf && (per === "refitting" || per === "lr"));
			if ( !inApproved && per !== "recharge" && per !== "refitting" ) continue;
			if ( !inApproved ) {
				rows.push({
					corpus: "drake",
					name: item.name,
					id: item._id,
					file: path.relative(ROOT, file).replace(/\\/g, "/"),
					abs: file,
					per,
					max: item.system?.uses?.max ?? null,
					recovery: item.system?.uses?.recovery,
					...cls,
					correctionRequired: false,
					approved: false
				});
				continue;
			}
			rows.push({
				corpus: "drake",
				name: item.name,
				id: item._id,
				file: path.relative(ROOT, file).replace(/\\/g, "/"),
				abs: file,
				per,
				max: item.system?.uses?.max ?? null,
				recovery: item.system?.uses?.recovery,
				...cls,
				correctionRequired: per !== cls.expected,
				approved: true,
				fromPer: cls.expected === "sr" ? "recharge" : "refitting"
			});
		}
	}

	return rows;
}

/**
 * Replace uses.per only inside the YAML document region for a given item _id.
 * Supports standalone `_id:` docs and Actor embedded list items (`- _id:`).
 */
function patchItemPerInFile(fileText, itemId, fromPer, toPer) {
	const idRe = new RegExp(`(^|\\n)([ \\t]*-?[ \\t]*)_id:[ \\t]*${itemId}\\b`);
	const match = idRe.exec(fileText);
	if ( !match ) {
		throw new Error(`Could not locate _id ${itemId}`);
	}

	const lineStart = match.index + (match[1] ? match[1].length : 0);
	const marker = match[2] ?? "";
	const isListItem = marker.includes("-");
	// Region starts at the list dash line (or _id line for standalone)
	let start = lineStart;
	if ( isListItem ) {
		const dashAt = fileText.lastIndexOf("\n", lineStart - 1);
		// keep start at beginning of the `- _id` line content already captured by lineStart
		start = lineStart;
	}

	const rest = fileText.slice(start);
	let endOffset = rest.length;
	if ( isListItem ) {
		const next = /\n[ \t]*-[ \t]*_id:/.exec(rest.slice(1));
		if ( next ) endOffset = 1 + next.index;
	} else {
		// Standalone: whole remainder of file is the item region
		endOffset = rest.length;
	}

	const region = fileText.slice(start, start + endOffset);
	const perRe = new RegExp(`(^|\\n)([ \\t]*)per:[ \\t]*${fromPer}\\b`);
	const perMatch = perRe.exec(region);
	if ( !perMatch ) {
		throw new Error(`Could not find per: ${fromPer} in item ${itemId} region`);
	}
	const before = region.slice(0, perMatch.index);
	if ( !/\buses:\s*\n/.test(before) ) {
		throw new Error(`per: ${fromPer} for ${itemId} not under uses`);
	}

	const patchedRegion = region.slice(0, perMatch.index + perMatch[1].length)
		+ `${perMatch[2]}per: ${toPer}`
		+ region.slice(perMatch.index + perMatch[0].length);
	return fileText.slice(0, start) + patchedRegion + fileText.slice(start + endOffset);
}

function summarize(rows) {
	const approved = rows.filter(r => r.approved);
	const targets = approved.filter(r => r.correctionRequired);
	const already = approved.filter(r => !r.correctionRequired);
	const files = new Set(approved.map(r => r.file));
	const toSr = approved.filter(r => r.expected === "sr");
	const toLr = approved.filter(r => r.expected === "lr");
	return {
		totalRows: rows.length,
		approvedRows: approved.length,
		correctionRows: targets.length,
		alreadyCorrect: already.length,
		files: files.size,
		toSr: toSr.length,
		toLr: toLr.length,
		standaloneSr: toSr.filter(r => r.corpus === "standalone").length,
		drakeSr: toSr.filter(r => r.corpus === "drake").length,
		standaloneLr: toLr.filter(r => r.corpus === "standalone").length,
		drakeLr: toLr.filter(r => r.corpus === "drake").length,
		ambiguous: rows.filter(r => String(r.bucket).startsWith("ambiguous")).length,
		approved,
		targets
	};
}

function validateAfter(targets) {
	const failures = [];
	let sr = 0;
	let lr = 0;
	for ( const row of targets ) {
		const doc = loadDoc(row.abs);
		let item = doc;
		if ( row.corpus === "drake" ) {
			item = (doc.items || []).find(i => i._id === row.id);
		}
		if ( !item ) {
			failures.push(`missing item ${row.id} in ${row.file}`);
			continue;
		}
		const per = item.system?.uses?.per;
		const recovery = item.system?.uses?.recovery;
		const max = item.system?.uses?.max;
		if ( per !== row.expected ) failures.push(`${row.name} (${row.id}): per=${per} expected ${row.expected}`);
		if ( recovery !== "" && recovery !== undefined && recovery !== null ) {
			if ( Array.isArray(recovery) ) failures.push(`${row.name}: modern recovery[] introduced`);
		}
		if ( String(max ?? "") !== String(row.max ?? "") ) failures.push(`${row.name}: max changed`);
		if ( item.name !== row.name ) failures.push(`${row.name}: name changed`);
		if ( per === "sr" ) sr += 1;
		if ( per === "lr" ) lr += 1;
	}

	// Ambiguous must remain
	const all = buildLedger();
	const ambStill = all.filter(r => String(r.bucket).startsWith("ambiguous"));
	for ( const a of ambStill ) {
		if ( a.per !== "recharge" && a.per !== "refitting" ) {
			failures.push(`ambiguous ${a.name} per changed to ${a.per}`);
		}
	}

	return { failures, sr, lr, ambStill: ambStill.length };
}

const ledger = buildLedger();
const summary = summarize(ledger);

console.log(JSON.stringify({
	approvedRows: summary.approvedRows,
	correctionRowsPending: summary.correctionRows,
	alreadyCorrect: summary.alreadyCorrect,
	files: summary.files,
	toSr: summary.toSr,
	toLr: summary.toLr,
	standaloneSr: summary.standaloneSr,
	drakeSr: summary.drakeSr,
	standaloneLr: summary.standaloneLr,
	drakeLr: summary.drakeLr,
	ambiguous: summary.ambiguous
}, null, 2));

const EXPECT_ROWS = 134;
const EXPECT_FILES = 78;
const EXPECT_SR = 83;
const EXPECT_LR = 51;

if ( summary.approvedRows !== EXPECT_ROWS
	|| summary.correctionRows !== 0
	|| summary.files !== EXPECT_FILES
	|| summary.toSr !== EXPECT_SR
	|| summary.toLr !== EXPECT_LR
	|| summary.standaloneSr !== 5
	|| summary.drakeSr !== 78
	|| summary.standaloneLr !== 5
	|| summary.drakeLr !== 46
	|| summary.ambiguous !== 0 ) {
	console.error("LEDGER GATE FAILED — refusing to edit YAML");
	process.exit(2);
}

if ( VALIDATE && !APPLY ) {
	const v = validateAfter(summary.approved);
	if ( v.failures.length ) {
		console.error("VALIDATION FAILED");
		for ( const f of v.failures ) console.error(` - ${f}`);
		process.exit(3);
	}
	console.log(JSON.stringify({ validated: true, sr: v.sr, lr: v.lr, ambiguousUntouched: v.ambStill }, null, 2));
	process.exit(0);
}

if ( !APPLY ) {
	console.log("Ledger gate passed. Re-run with --apply to write YAML.");
	process.exit(0);
}

// Apply remaining corrections only
const byFile = new Map();
for ( const row of summary.targets ) {
	if ( !byFile.has(row.abs) ) byFile.set(row.abs, []);
	byFile.get(row.abs).push(row);
}

let filesChanged = 0;
let rowsPatched = 0;
for ( const [abs, rows] of byFile ) {
	let text = fs.readFileSync(abs, "utf8");
	for ( const row of rows ) {
		text = patchItemPerInFile(text, row.id, row.per, row.expected);
		rowsPatched += 1;
	}
	fs.writeFileSync(abs, text);
	filesChanged += 1;
}

const v = validateAfter(summary.approved);
if ( v.failures.length ) {
	console.error("POST-APPLY VALIDATION FAILED");
	for ( const f of v.failures ) console.error(` - ${f}`);
	process.exit(3);
}

console.log(JSON.stringify({
	applied: true,
	filesChangedThisRun: filesChanged,
	rowsPatchedThisRun: rowsPatched,
	approvedRows: summary.approvedRows,
	toSr: v.sr,
	toLr: v.lr,
	ambiguousUntouched: v.ambStill
}, null, 2));
