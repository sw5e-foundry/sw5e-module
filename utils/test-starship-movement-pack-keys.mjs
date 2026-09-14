#!/usr/bin/env node
/**
 * Pack-source census: eligible Active Effect movement keys use dnd5e 6.0 speeds paths.
 * Does not prove Foundry import, AE application, sheets, or token rulers.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import {
	STARSHIP_ROLE_MOVEMENT_SPACE_KEY,
	STARSHIP_ROLE_MOVEMENT_TURN_KEY
} from "../scripts/starship-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "packs/_source");
const FEATURES = path.join(SRC, "starships/starship-features");
const OBSOLETE_SPACE = "system.attributes.movement.space";
const OBSOLETE_TURN = "system.attributes.movement.turn";
const CANONICAL_SPACE = "system.attributes.movement.speeds.space";
const CANONICAL_TURN = "system.attributes.movement.speeds.turn";

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

function collectAeChanges(node, trail, out) {
	if ( !node || typeof node !== "object" ) return;
	if ( Array.isArray(node) ) {
		node.forEach((value, index) => collectAeChanges(value, `${trail}[${index}]`, out));
		return;
	}
	if ( Array.isArray(node.changes) ) {
		for ( const change of node.changes ) {
			out.push({
				trail,
				effectName: node.name ?? null,
				effectId: node._id ?? null,
				key: String(change?.key ?? ""),
				mode: change?.mode ?? change?.type ?? null,
				value: change?.value ?? null,
				priority: change?.priority ?? null,
				transfer: node.transfer ?? null,
				disabled: node.disabled ?? null
			});
		}
	}
	for ( const [key, value] of Object.entries(node) ) {
		if ( value && typeof value === "object" ) collectAeChanges(value, `${trail}.${key}`, out);
	}
}

function loadDoc(rel) {
	const full = path.join(ROOT, rel);
	return yaml.load(fs.readFileSync(full, "utf8"));
}

const yamlFiles = walkYaml(SRC);
const aeChanges = [];
for ( const file of yamlFiles ) {
	const doc = yaml.load(fs.readFileSync(file, "utf8"));
	const found = [];
	collectAeChanges(doc, path.relative(ROOT, file), found);
	for ( const change of found ) {
		aeChanges.push({ file: path.relative(ROOT, file), ...change });
	}
}

test("runtime constants match canonical pack keys", () => {
	assert.equal(STARSHIP_ROLE_MOVEMENT_SPACE_KEY, CANONICAL_SPACE);
	assert.equal(STARSHIP_ROLE_MOVEMENT_TURN_KEY, CANONICAL_TURN);
});

test("no eligible pack AE change retains obsolete sibling keys", () => {
	const leftover = aeChanges.filter(change => change.key === OBSOLETE_SPACE || change.key === OBSOLETE_TURN);
	assert.deepEqual(leftover, []);
});

test("Role Worker preserves IDs, OVERRIDE mode, values, priority, transfer", () => {
	const doc = loadDoc("packs/_source/starships/starship-features/tiny/role-worker.yml");
	assert.equal(doc._id, "1Lx1A9P1GUA8hyTx");
	assert.equal(doc.system.attributes.speed.space, 350);
	assert.equal(doc.system.attributes.speed.turn, 100);
	const effect = doc.effects[0];
	assert.equal(effect._id, "qQTMHDrpIch61Q7C");
	assert.equal(effect.transfer, true);
	assert.equal(effect.disabled, false);
	const space = effect.changes.find(change => change.key === CANONICAL_SPACE);
	const turn = effect.changes.find(change => change.key === CANONICAL_TURN);
	assert.equal(space.mode, 5);
	assert.equal(turn.mode, 5);
	assert.equal(String(space.value), "350");
	assert.equal(String(turn.value), "100");
	assert.equal(space.priority, 20);
	assert.equal(turn.priority, 20);
	assert.equal(effect.changes.find(change => change.key === "system.abilities.str.value")?.value, "1");
});

test("Combat Thrusters Mk I Turn ADD is canonical and otherwise unchanged", () => {
	const doc = loadDoc("packs/_source/starships/starship-modifications/universal/combat-thrusters-mk-i.yml");
	assert.equal(doc._id, "X6aGTz0DRzG9FoIQ");
	const effect = doc.effects[0];
	assert.equal(effect._id, "giD5qccvLQuASvKU");
	assert.equal(effect.changes.length, 1);
	assert.equal(effect.changes[0].key, CANONICAL_TURN);
	assert.equal(effect.changes[0].mode, 2);
	assert.equal(String(effect.changes[0].value), "-50");
	assert.equal(effect.changes[0].priority, 20);
	assert.equal(effect.transfer, true);
	assert.equal(effect.disabled, false);
});

test("Overload Systems Turn key is canonical; fly sibling is unchanged", () => {
	const doc = loadDoc("packs/_source/deployments/operator/deployment-features/overload-systems.yml");
	assert.equal(doc._id, "2GMuH7TIypF8O3bB");
	const effect = doc.effects[0];
	assert.equal(effect._id, "Xafum7u479aJ6zZA");
	assert.equal(effect.changes[0].key, "system.attributes.movement.fly");
	assert.equal(effect.changes[0].mode, 1);
	assert.equal(String(effect.changes[0].value), ".5");
	assert.equal(effect.changes[1].key, CANONICAL_TURN);
	assert.equal(effect.changes[1].mode, 1);
	assert.equal(String(effect.changes[1].value), "2");
	assert.equal(effect.changes[1].priority, 20);
	assert.equal(effect.transfer, false);
});

test("Drake delta-7 embedded Adaptive Ailerons Turn key is canonical; value preserved", () => {
	const doc = loadDoc("packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor-modified.yml");
	assert.equal(doc._id, "FbzPxDn1FfeRvDym");
	const item = (doc.items ?? []).find(entry => entry.name === "Adaptive Ailerons");
	assert.ok(item);
	const effect = (item.effects ?? []).find(entry => entry._id === "yie6lRqE4olXJrK3");
	assert.ok(effect);
	const turn = effect.changes.find(change => String(change.key).includes("movement"));
	assert.equal(turn.key, CANONICAL_TURN);
	assert.equal(turn.mode, 2);
	assert.equal(String(turn.value), "+100");
	assert.equal(turn.priority, 20);
});

test("Role YAML files publish canonical Space and Turn OVERRIDE keys", () => {
	const sizeFolders = new Set(["tiny", "small", "medium", "large", "huge", "gargantuan"]);
	const roleFiles = walkYaml(FEATURES).filter(file => {
		const base = path.basename(file);
		const size = path.basename(path.dirname(file));
		return sizeFolders.has(size) && /^role-[^.]+\.yml$/i.test(base) && !base.includes("specialization") && !base.includes("mastery");
	});
	assert.equal(roleFiles.length, 36);
	for ( const file of roleFiles ) {
		const doc = yaml.load(fs.readFileSync(file, "utf8"));
		const changes = doc.effects?.[0]?.changes ?? [];
		assert.ok(changes.some(change => change.key === CANONICAL_SPACE), `${path.basename(file)} missing canonical space`);
		assert.ok(changes.some(change => change.key === CANONICAL_TURN), `${path.basename(file)} missing canonical turn`);
	}
});

test("Role attributes.speed metadata is not treated as an AE key defect", () => {
	const doc = loadDoc("packs/_source/starships/starship-features/tiny/role-worker.yml");
	assert.equal(typeof doc.system.attributes.speed.space, "number");
	assert.equal(typeof doc.system.attributes.speed.turn, "number");
	const speedHits = aeChanges.filter(change => change.file.includes("role-worker.yml")
		&& (change.key === "space" || change.key === "turn"));
	assert.deepEqual(speedHits, []);
});

test("prose and fly keys are not classified as obsolete sibling movement AE keys", () => {
	const fly = aeChanges.filter(change => change.key === "system.attributes.movement.fly");
	assert.ok(fly.length > 0, "expected remaining fly AE keys outside this remediation");
	assert.equal(fly.some(change => change.key === OBSOLETE_SPACE || change.key === OBSOLETE_TURN), false);
});

console.log(`\n${passed} passed`);
