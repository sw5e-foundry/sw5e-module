#!/usr/bin/env node
/**
 * Generator output: Role movement Active Effects use canonical dnd5e 6.0 speeds paths.
 * Compares in-memory generator output to the 36 already-remediated size Role YAML sources.
 * Does not write pack source and does not prove Foundry runtime.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FEATURES = path.join(ROOT, "packs/_source/starships/starship-features");
const SIZE_FOLDERS = new Set(["tiny", "small", "medium", "large", "huge", "gargantuan"]);

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function walkYaml(dir, acc=[]) {
	for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const full = path.join(dir, entry.name);
		if ( entry.isDirectory() ) walkYaml(full, acc);
		else if ( /\.ya?ml$/i.test(entry.name) ) acc.push(full);
	}
	return acc;
}

function isSizeRoleFile(file) {
	const base = path.basename(file);
	const size = path.basename(path.dirname(file));
	return SIZE_FOLDERS.has(size)
		&& /^role-[^.]+\.yml$/i.test(base)
		&& !base.includes("specialization")
		&& !base.includes("mastery");
}

function hashFile(full) {
	return crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
}

function collectSizeRoleHashes() {
	const out = {};
	for ( const file of walkYaml(FEATURES).filter(isSizeRoleFile) ) {
		out[path.relative(ROOT, file).replaceAll("\\", "/")] = hashFile(file);
	}
	return out;
}

function countMatrixEntries(matrix) {
	let count = 0;
	for ( const files of Object.values(matrix) ) count += Object.keys(files).length;
	return count;
}

const hashesBeforeImport = collectSizeRoleHashes();
const gen = await import("./apply-role-movement-active-effects.mjs");
const hashesAfterImport = collectSizeRoleHashes();

const {
	ROLE_MOVEMENT_MATRIX,
	ROLE_MOVEMENT_AE_SPACE_KEY,
	ROLE_MOVEMENT_AE_TURN_KEY,
	ROLE_MOVEMENT_AE_OBSOLETE_SPACE_KEY,
	ROLE_MOVEMENT_AE_OBSOLETE_TURN_KEY,
	ROLE_MOVEMENT_AE_MODE,
	ROLE_MOVEMENT_AE_PRIORITY,
	buildRoleMovementChanges,
	renderRoleMovementChangeBlock,
	applyRoleMovementChangeYaml
} = gen;

test("importing the generator helper does not write Role YAML", () => {
	assert.deepEqual(hashesAfterImport, hashesBeforeImport);
});

test("build:db remains independent of the one-shot generator", () => {
	const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
	assert.equal(pkg.scripts["build:db"], "node ./utils/packs.mjs package pack");
	const pkgText = fs.readFileSync(path.join(ROOT, "package.json"), "utf8");
	assert.equal(pkgText.includes("apply-role-movement-active-effects"), false);
	const packsText = fs.readFileSync(path.join(ROOT, "utils/packs.mjs"), "utf8");
	assert.equal(packsText.includes("apply-role-movement-active-effects"), false);
});

test("generator emits canonical Space and Turn keys and not obsolete siblings", () => {
	const changes = buildRoleMovementChanges(350, 100);
	assert.equal(changes[0].key, ROLE_MOVEMENT_AE_SPACE_KEY);
	assert.equal(changes[1].key, ROLE_MOVEMENT_AE_TURN_KEY);
	assert.equal(ROLE_MOVEMENT_AE_SPACE_KEY, "system.attributes.movement.speeds.space");
	assert.equal(ROLE_MOVEMENT_AE_TURN_KEY, "system.attributes.movement.speeds.turn");
	assert.equal(changes.some(change => change.key === ROLE_MOVEMENT_AE_OBSOLETE_SPACE_KEY), false);
	assert.equal(changes.some(change => change.key === ROLE_MOVEMENT_AE_OBSOLETE_TURN_KEY), false);
	const yamlBlock = renderRoleMovementChangeBlock(350, 100);
	assert.match(yamlBlock, /^      - key: system\.attributes\.movement\.speeds\.space$/m);
	assert.match(yamlBlock, /^      - key: system\.attributes\.movement\.speeds\.turn$/m);
	assert.equal((yamlBlock.match(/^      - key: system\.attributes\.movement\.space$/m) || []).length, 0);
	assert.equal((yamlBlock.match(/^      - key: system\.attributes\.movement\.turn$/m) || []).length, 0);
});

const sizeRoleFiles = walkYaml(FEATURES).filter(isSizeRoleFile);
test("size-folder Role walk is exactly 36 and specialization/mastery are excluded", () => {
	assert.equal(sizeRoleFiles.length, 36);
	const unmanaged = walkYaml(FEATURES).filter(file => {
		const base = path.basename(file);
		return /^role-[^.]+\.yml$/i.test(base) && !isSizeRoleFile(file);
	});
	assert.equal(unmanaged.length, 4);
	for ( const file of unmanaged ) {
		const base = path.basename(file);
		assert.ok(base.includes("specialization") || base.includes("mastery"), base);
		for ( const files of Object.values(ROLE_MOVEMENT_MATRIX) ) {
			assert.equal(Object.hasOwn(files, base), false, `generator must not own ${base}`);
		}
	}
});

test("generator matrix owns exactly 36 size Role sources", () => {
	assert.equal(countMatrixEntries(ROLE_MOVEMENT_MATRIX), 36);
});

let matched = 0;
const mismatches = [];
for ( const [size, files] of Object.entries(ROLE_MOVEMENT_MATRIX) ) {
	for ( const [file, [expectSpace, expectTurn]] of Object.entries(files) ) {
		const rel = `packs/_source/starships/starship-features/${size}/${file}`;
		test(`${size}/${file} generator parity`, () => {
			const full = path.join(FEATURES, size, file);
			const doc = yaml.load(fs.readFileSync(full, "utf8"));
			const expected = buildRoleMovementChanges(expectSpace, expectTurn);
			const effect = doc.effects?.[0];
			assert.ok(effect, `${rel} missing effect`);
			const spaceChange = (effect.changes ?? []).find(change => change.key === ROLE_MOVEMENT_AE_SPACE_KEY);
			const turnChange = (effect.changes ?? []).find(change => change.key === ROLE_MOVEMENT_AE_TURN_KEY);
			try {
				assert.ok(spaceChange, "missing canonical space AE");
				assert.ok(turnChange, "missing canonical turn AE");
				assert.equal(spaceChange.key, expected[0].key, "space key");
				assert.equal(String(spaceChange.value), expected[0].value, "space value");
				assert.equal(Number(spaceChange.mode), expected[0].mode, "space mode");
				assert.equal(Number(spaceChange.priority), expected[0].priority, "space priority");
				assert.equal(turnChange.key, expected[1].key, "turn key");
				assert.equal(String(turnChange.value), expected[1].value, "turn value");
				assert.equal(Number(turnChange.mode), expected[1].mode, "turn mode");
				assert.equal(Number(turnChange.priority), expected[1].priority, "turn priority");
				assert.equal(Number(spaceChange.mode), ROLE_MOVEMENT_AE_MODE);
				assert.equal(Number(turnChange.mode), ROLE_MOVEMENT_AE_MODE);
				assert.equal(Number(spaceChange.priority), ROLE_MOVEMENT_AE_PRIORITY);
				assert.equal(Number(turnChange.priority), ROLE_MOVEMENT_AE_PRIORITY);
				assert.equal(effect.transfer, true, "transfer");
				assert.equal(effect.disabled, false, "disabled");
				assert.ok(effect._id, "effect identity");
				assert.equal(doc.system.attributes.speed.space, expectSpace, "size/role space classification");
				assert.equal(doc.system.attributes.speed.turn, expectTurn, "size/role turn classification");
				assert.equal(
					(effect.changes ?? []).some(change => change.key === ROLE_MOVEMENT_AE_OBSOLETE_SPACE_KEY
						|| change.key === ROLE_MOVEMENT_AE_OBSOLETE_TURN_KEY),
					false
				);
				matched += 1;
			} catch ( err ) {
				mismatches.push({ rel, cause: err.message });
				throw err;
			}
		});
	}
}

test("all generator-owned Role sources matched canonical output", () => {
	assert.equal(mismatches.length, 0, JSON.stringify(mismatches, null, 2));
	assert.equal(matched, 36);
	assert.equal(matched, countMatrixEntries(ROLE_MOVEMENT_MATRIX));
});

test("in-memory strip+append is idempotent for movement changes", () => {
	const first = applyRoleMovementChangeYaml(
		`      - key: system.abilities.str.value
        mode: 2
        value: '1'
        priority: 1
      - key: ${ROLE_MOVEMENT_AE_OBSOLETE_SPACE_KEY}
        mode: 5
        value: '350'
        priority: 20
      - key: ${ROLE_MOVEMENT_AE_OBSOLETE_TURN_KEY}
        mode: 5
        value: '100'
        priority: 20
`,
		350,
		100
	);
	const second = applyRoleMovementChangeYaml(first, 350, 100);
	const third = applyRoleMovementChangeYaml(second, 350, 100);
	assert.equal(second, third);
	assert.match(second, /^      - key: system\.attributes\.movement\.speeds\.space$/m);
	assert.match(second, /^      - key: system\.attributes\.movement\.speeds\.turn$/m);
	assert.equal((second.match(/^      - key: system\.attributes\.movement\.speeds\.space$/mg) || []).length, 1);
	assert.equal((second.match(/^      - key: system\.attributes\.movement\.speeds\.turn$/mg) || []).length, 1);
	assert.equal((second.match(/^      - key: system\.attributes\.movement\.space$/mg) || []).length, 0);
	assert.equal((second.match(/^      - key: system\.attributes\.movement\.turn$/mg) || []).length, 0);
	assert.match(second, /system\.abilities\.str\.value/);
});

test("authoritative YAML remains unchanged during this suite", () => {
	assert.deepEqual(collectSizeRoleHashes(), hashesBeforeImport);
});

console.log(`\n${passed} passed`);
console.log(`parity: assessed=${countMatrixEntries(ROLE_MOVEMENT_MATRIX)} matched=${matched} mismatched=${mismatches.length}`);
