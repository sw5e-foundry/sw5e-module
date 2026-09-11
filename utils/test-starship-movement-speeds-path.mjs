#!/usr/bin/env node
/**
 * Pure-logic tests: dnd5e 6.0 Role movement keys live under movement.speeds.
 * Does not prove Actor preparation, Active Effect application, sheets, or token rulers.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	STARSHIP_ROLE_MOVEMENT_SPACE_KEY,
	STARSHIP_ROLE_MOVEMENT_TURN_KEY,
	readStarshipActorMovementSpeeds,
	resolveStarshipMovementSourceUpdate
} from "../scripts/starship-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(ROOT, "scripts");
const OBSOLETE_SPACE = "system.attributes.movement.space";
const OBSOLETE_TURN = "system.attributes.movement.turn";

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

test("runtime Role AE keys use movement.speeds", () => {
	assert.equal(STARSHIP_ROLE_MOVEMENT_SPACE_KEY, "system.attributes.movement.speeds.space");
	assert.equal(STARSHIP_ROLE_MOVEMENT_TURN_KEY, "system.attributes.movement.speeds.turn");
});

test("readStarshipActorMovementSpeeds uses speeds only", () => {
	const fromSpeeds = readStarshipActorMovementSpeeds({ speeds: { space: 400, turn: 250 }, space: 1, turn: 2 });
	assert.equal(fromSpeeds.space, 400);
	assert.equal(fromSpeeds.turn, 250);
	const fromSiblings = readStarshipActorMovementSpeeds({ space: 400, turn: 250 });
	assert.equal(fromSiblings.space, null);
	assert.equal(fromSiblings.turn, null);
});

test("source update writes speeds and strips sibling keys", () => {
	const resolved = resolveStarshipMovementSourceUpdate({
		underlying: { space: 40, turn: 30 },
		proposedMovement: { speeds: { space: 55, turn: 44, walk: 30 }, space: 99, units: "ft" },
		pendingKeys: new Set(["space", "turn", "units"])
	});
	assert.equal(resolved.movement.speeds.space, 55);
	assert.equal(resolved.movement.speeds.turn, 44);
	assert.equal("walk" in (resolved.movement.speeds ?? {}), false);
	assert.equal("space" in resolved.movement, false);
	assert.equal(resolved.movement.units, "ft");
	assert.deepEqual(resolved.savedFields, ["space", "turn"]);
});

test("ordinary-vehicle isolation is identification-based (keys remain starship-only constants)", () => {
	assert.match(STARSHIP_ROLE_MOVEMENT_SPACE_KEY, /\.speeds\.space$/);
	assert.match(STARSHIP_ROLE_MOVEMENT_TURN_KEY, /\.speeds\.turn$/);
});

test("obsolete sibling AE keys are absent from scripts/", () => {
	const hits = [];
	for ( const file of walkMjs(SCRIPTS) ) {
		const text = fs.readFileSync(file, "utf8");
		if ( text.includes(OBSOLETE_SPACE) || text.includes(OBSOLETE_TURN) ) hits.push(path.relative(ROOT, file));
	}
	assert.deepEqual(hits, []);
});

console.log(`\n${passed} passed`);
