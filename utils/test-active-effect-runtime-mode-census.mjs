#!/usr/bin/env node
/**
 * Static census: prepared-runtime Active Effect change.mode reads in scripts/.
 * Allow-list is persisted-source consumers only. Does not scan YAML, packs, or ai/.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(ROOT, "scripts");

const FORBIDDEN = [
	/change\?\.mode\b/,
	/change\.mode\b/,
	/Number\(\s*change\.mode\s*\)/
];

/** Persisted-source or create-data lines that may retain numeric mode. */
const ALLOW_REL = new Set([
	"scripts/installed-mod-effects.mjs",
	"scripts/space-station.mjs"
]);

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function walkMjs(dir, acc=[]) {
	for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const full = path.join(dir, entry.name);
		if ( entry.isDirectory() ) walkMjs(full, acc);
		else if ( entry.name.endsWith(".mjs") ) acc.push(full);
	}
	return acc;
}

function isCommentOrStringOnly(line) {
	const trimmed = line.trim();
	return trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*");
}

test("prepared-runtime change.mode reads are absent outside the persisted-source allow-list", () => {
	const hits = [];
	for ( const file of walkMjs(SCRIPTS) ) {
		const rel = path.relative(ROOT, file).replaceAll("\\", "/");
		const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
		lines.forEach((line, index) => {
			if ( isCommentOrStringOnly(line) ) return;
			if ( !FORBIDDEN.some(pattern => pattern.test(line)) ) return;
			if ( ALLOW_REL.has(rel) ) return;
			hits.push(`${rel}:${index + 1}:${line.trim()}`);
		});
	}
	assert.deepEqual(hits, []);
});

test("allow-list files still contain persisted numeric mode by design", () => {
	const installed = fs.readFileSync(path.join(ROOT, "scripts/installed-mod-effects.mjs"), "utf8");
	assert.match(installed, /change\.mode/);
	const station = fs.readFileSync(path.join(ROOT, "scripts/space-station.mjs"), "utf8");
	assert.match(station, /mode:\s*2/);
});

test("corrected consumers do not evaluate change.mode", () => {
	const maneuver = fs.readFileSync(path.join(ROOT, "scripts/patch/maneuver.mjs"), "utf8");
	assert.equal(/change\.mode/.test(maneuver), false);
	const snapshot = fs.readFileSync(path.join(ROOT, "scripts/chassis-effect-snapshot.mjs"), "utf8");
	assert.equal(/change\.mode/.test(snapshot), false);
	assert.match(snapshot, /getOwnPropertyDescriptor/);
});

console.log(`\n${passed} passed`);
