#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { loadAuditRows, toSaveTargetDcKey } from "./migrate-fadecasting-save-target-dc-effects.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.join(__dirname, "..", "packs", "_source");

let ok = 0;
let fail = 0;

for ( const row of loadAuditRows() ) {
	const filePath = path.join(SOURCE_ROOT, row.source);
	const doc = yaml.load(fs.readFileSync(filePath, "utf8"));
	const effect = doc.effects?.[0];
	let bad = !effect || effect.transfer !== false;
	if ( !bad ) {
		const byKey = Object.fromEntries(effect.changes.map(c => [c.key, c]));
		for ( const rec of row.recommendations ) {
			const key = toSaveTargetDcKey(rec.key);
			const change = byKey[key];
			if ( !change || String(change.value) !== String(rec.value) || change.mode !== 2 ) bad = true;
		}
	}
	if ( bad ) {
		console.error("FAIL", row.source);
		fail++;
	} else ok++;
}

console.log(`validated ${ok} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
