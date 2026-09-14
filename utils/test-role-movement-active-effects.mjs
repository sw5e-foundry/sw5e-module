#!/usr/bin/env node
/**
 * Pack integrity: all 36 size Roles have synced attributes.speed + OVERRIDE movement AEs.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FEATURES = path.join(ROOT, "packs/_source/starships/starship-features");

const MATRIX = {
	tiny: {
		"role-droid.yml": [450, 200],
		"role-munition.yml": [450, 200],
		"role-predator.yml": [350, 100],
		"role-probe.yml": [400, 150],
		"role-satellite.yml": [400, 150],
		"role-worker.yml": [350, 100]
	},
	small: {
		"role-attack-fighter.yml": [350, 100],
		"role-bomber.yml": [450, 200],
		"role-scout.yml": [450, 200],
		"role-scrambler.yml": [400, 150],
		"role-shuttle.yml": [350, 100],
		"role-superiority-fighter.yml": [400, 150]
	},
	medium: {
		"role-courier.yml": [400, 250],
		"role-freighter.yml": [300, 150],
		"role-gunship.yml": [300, 150],
		"role-missile-boat.yml": [400, 250],
		"role-navigator.yml": [350, 200],
		"role-yacht.yml": [350, 200]
	},
	large: {
		"role-ambassador.yml": [350, 250],
		"role-corvette.yml": [400, 300],
		"role-cruiser.yml": [400, 300],
		"role-explorer.yml": [350, 250],
		"role-picket-ship.yml": [300, 200],
		"role-ships-tender.yml": [300, 200]
	},
	huge: {
		"role-battleship.yml": [200, 400],
		"role-carrier.yml": [300, 500],
		"role-colonizer.yml": [400, 600],
		"role-command-ship.yml": [300, 500],
		"role-interdictor.yml": [200, 400],
		"role-juggernaut.yml": [400, 600]
	},
	gargantuan: {
		"role-blockade-ship.yml": [100, 400],
		"role-flagship.yml": [200, 500],
		"role-industrial-center.yml": [300, 600],
		"role-mobile-metropolis.yml": [300, 600],
		"role-researcher.yml": [100, 400],
		"role-warship.yml": [200, 500]
	}
};

const SPACE_KEY = "system.attributes.movement.speeds.space";
const TURN_KEY = "system.attributes.movement.speeds.turn";
const MODE_OVERRIDE = 5;

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

let count = 0;
for ( const [size, files] of Object.entries(MATRIX) ) {
	for ( const [file, [expectSpace, expectTurn]] of Object.entries(files) ) {
		count += 1;
		test(`${size}/${file} matrix + AE`, () => {
			const doc = yaml.load(fs.readFileSync(path.join(FEATURES, size, file), "utf8"));
			const speed = doc.system?.attributes?.speed ?? {};
			assert.equal(speed.space, expectSpace, "source space");
			assert.equal(speed.turn, expectTurn, "source turn");

			const changes = doc.effects?.[0]?.changes ?? [];
			const spaceChange = changes.find(c => c.key === SPACE_KEY);
			const turnChange = changes.find(c => c.key === TURN_KEY);
			assert.ok(spaceChange, "missing space AE");
			assert.ok(turnChange, "missing turn AE");
			assert.equal(Number(spaceChange.mode), MODE_OVERRIDE, "space mode Override");
			assert.equal(Number(turnChange.mode), MODE_OVERRIDE, "turn mode Override");
			assert.equal(Number(spaceChange.value), expectSpace, "AE space value");
			assert.equal(Number(turnChange.value), expectTurn, "AE turn value");

			for ( const c of changes ) {
				assert.doesNotMatch(String(c.key), /turning$/, `bad key ${c.key}`);
				if ( String(c.key).includes("attributes.movement.") ) {
					assert.equal(Number(c.mode), MODE_OVERRIDE, "movement base must be Override");
				}
			}
		});
	}
}

test("exactly 36 Roles in matrix", () => {
	assert.equal(count, 36);
});

test("Medium Courier is 400/250", () => {
	const doc = yaml.load(fs.readFileSync(path.join(FEATURES, "medium/role-courier.yml"), "utf8"));
	assert.equal(doc.system.attributes.speed.space, 400);
	assert.equal(doc.system.attributes.speed.turn, 250);
});

console.log(`\n${passed} passed`);
