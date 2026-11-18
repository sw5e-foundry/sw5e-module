#!/usr/bin/env node
/**
 * Offline gate: approved ship-rest recovery-period source ledger + Superior Firepower contract.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "utils/apply-starship-recovery-period-source-correction.mjs");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function parseJsonObjects(stdout) {
	const objs = [];
	const text = String(stdout);
	let depth = 0;
	let start = -1;
	for ( let i = 0; i < text.length; i++ ) {
		const ch = text[i];
		if ( ch === "{" ) {
			if ( depth === 0 ) start = i;
			depth += 1;
		} else if ( ch === "}" ) {
			depth -= 1;
			if ( depth === 0 && start >= 0 ) {
				objs.push(JSON.parse(text.slice(start, i + 1)));
				start = -1;
			}
		}
	}
	return objs;
}

function runValidate() {
	const r = spawnSync(process.execPath, [SCRIPT, "--validate"], {
		cwd: ROOT,
		encoding: "utf8"
	});
	assert.equal(r.status, 0, r.stderr || r.stdout);
	const objs = parseJsonObjects(r.stdout);
	assert.ok(objs.length >= 2, "expected summary + validated JSON");
	return { summary: objs[0], last: objs[objs.length - 1] };
}

test("validate reports the current approved recovery census with nothing pending", () => {
	const { summary, last } = runValidate();
	assert.equal(summary.approvedRows, 134);
	assert.equal(summary.files, 78);
	assert.equal(summary.toSr, 83);
	assert.equal(summary.toLr, 51);
	assert.equal(summary.standaloneSr, 5);
	assert.equal(summary.drakeSr, 78);
	assert.equal(summary.standaloneLr, 5);
	assert.equal(summary.drakeLr, 46);
	assert.equal(summary.ambiguous, 0);
	assert.equal(summary.correctionRowsPending, 0);
	assert.equal(last.validated, true);
	assert.equal(last.sr, 83);
	assert.equal(last.lr, 51);
	assert.equal(last.ambiguousUntouched, 0);
});

test("Superior Firepower Drake embed uses per:sr and @details.tier*3", () => {
	const file = path.join(ROOT, "packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml");
	const doc = yaml.load(fs.readFileSync(file, "utf8"));
	const item = (doc.items ?? []).find(i => i._id === "4aQwn3RVsQ4e5xss");
	assert.ok(item, "Superior Firepower embed must exist");
	assert.equal(item.name, "Superior Firepower");
	assert.equal(item.system.uses.per, "sr");
	assert.equal(item.system.uses.recovery, "");
	assert.equal(item.system.uses.max, "@details.tier*3");
	assert.notEqual(item.system.uses.per, "recharge");
});

test("passive Citadel, Paragon, and Hold Together are not limited-use recoveries", () => {
	const citadel = yaml.load(fs.readFileSync(
		path.join(ROOT, "packs/_source/starships/starship-features/gargantuan/citadel.yml"),
		"utf8"
	));
	assert.equal(citadel.system.uses.per, null);
	assert.notEqual(citadel.system.uses.per, "sr");
	assert.ok(!Array.isArray(citadel.system.uses.recovery));

	const paragon = yaml.load(fs.readFileSync(
		path.join(ROOT, "packs/_source/starships/starship-features/gargantuan/paragon-dreadnought.yml"),
		"utf8"
	));
	assert.equal(paragon.system.uses.per, null);
	assert.notEqual(paragon.system.uses.per, "sr");
	assert.ok(!Array.isArray(paragon.system.uses.recovery));

	const ht = yaml.load(fs.readFileSync(
		path.join(ROOT, "packs/_source/starships/starship-features/medium/hold-together.yml"),
		"utf8"
	));
	assert.equal(ht.system.uses.per, null);
	assert.notEqual(ht.system.uses.per, "lr");
	assert.ok(!Array.isArray(ht.system.uses.recovery));
});

test("canonical YAML does not introduce modern recovery[] arrays for Superior Firepower", () => {
	const file = path.join(ROOT, "packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml");
	const src = fs.readFileSync(file, "utf8");
	const doc = yaml.load(src);
	const item = (doc.items ?? []).find(i => i._id === "4aQwn3RVsQ4e5xss");
	assert.equal(item.system.uses.per, "sr");
	assert.equal(item.system.uses.recovery, "");
	assert.equal(typeof item.system.uses.recovery, "string");
	assert.ok(!Array.isArray(item.system.uses.recovery));

	// Text-level: recovery remains a quoted empty string near uses.max, not a list.
	const usesBlock = src.match(
		/- _id: 4aQwn3RVsQ4e5xss[\s\S]*?(?=\n  - _id:|\nflags:|\nz:|\n_id:|\n$)/
	)?.[0] ?? "";
	assert.match(usesBlock, /per:\s*sr/);
	assert.match(usesBlock, /recovery:\s*(''|\"\")/);
	assert.doesNotMatch(usesBlock, /recovery:\s*\r?\n\s*-\s*period:/);
});

console.log(`\n${passed} passed`);
