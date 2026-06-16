#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { loadMappingRows, MODE_ADD, PRIORITY } from "./migrate-channeling-crystalizing-mpak-rpak-effects.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.join(__dirname, "..", "packs", "_source");

function changeSignature(changes) {
	return changes
		.map(c => `${c.key}=${c.value}`)
		.sort()
		.join("|");
}

let ok = 0;
let fail = 0;

for ( const row of loadMappingRows() ) {
	const filePath = path.join(SOURCE_ROOT, row.source);
	const doc = yaml.load(fs.readFileSync(filePath, "utf8"));
	const effect = doc.effects?.[0];
	const expectedName = `${row.name} - Power Attack`;
	const expectedChanges = row.migrationChanges.map(c => ({
		key: c.key,
		mode: MODE_ADD,
		value: String(c.value),
		priority: PRIORITY
	}));

	let bad = false;
	if ( !Array.isArray(doc.effects) || doc.effects.length !== 1 ) bad = true;
	if ( effect?.name !== expectedName ) bad = true;
	if ( effect?.transfer !== false ) bad = true;
	if ( effect?.disabled !== false ) bad = true;
	if ( changeSignature(effect?.changes ?? []) !== changeSignature(expectedChanges) ) bad = true;
	if ( (effect?.changes ?? []).some(c => c.mode !== MODE_ADD || c.priority !== PRIORITY) ) bad = true;
	if ( (effect?.changes ?? []).some(c => c.key === "system.bonuses.tech.attack" || c.key === "system.bonuses.force.attack") ) {
		bad = true;
	}

	if ( bad ) {
		console.error("FAIL", row.source);
		fail++;
	} else {
		ok++;
	}
}

console.log(`validated ${ok} ok, ${fail} failed (expected ${loadMappingRows().length})`);
process.exit(fail ? 1 : 0);
