#!/usr/bin/env node
/**
 * Drake source outcomes ported onto dnd5e 6 keys.
 * Embedded Adaptive Ailerons keep the preserved +100 turn value from the pack-key test.
 * No remediation script ships with this change: 2.0.0 is unpublished, and the source
 * correction is the authoritative fix.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import yaml from "js-yaml";

const MOVEMENT = {
	"packs/_source/drakes-shipyard/a-z-z-3-light-freighter.yml": [300, 150],
	"packs/_source/drakes-shipyard/aiat-i-gunship.yml": [300, 150],
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml": [350, 200],
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml": [300, 150],
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter.yml": [300, 150],
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml": [200, 500],
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml": [350, 200],
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml": [300, 150],
	"packs/_source/drakes-shipyard/vcx-100-light-freighter.yml": [300, 150],
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml": [350, 200],
	"packs/_source/drakes-shipyard/yt-1300f-light-freighter.yml": [300, 150],
	"packs/_source/drakes-shipyard/dynamic-class-light-freighter.yml": [300, 150],
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml": [300, 150],
	"packs/_source/drakes-shipyard/clutch-tri-fighter.yml": [400, 150],
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml": [200, 400],
	"packs/_source/drakes-shipyard/rz-1-a-wing-interceptor.yml": [400, 150],
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml": [300, 150],
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship.yml": [300, 150],
	"packs/_source/drakes-shipyard/vcx-series-auxiliary-starfighter.yml": [400, 150],
	"packs/_source/drakes-shipyard/x-ceptor.yml": [400, 150],
	"packs/_source/drakes-shipyard/y-wing-starfighter-btl-b-s3.yml": [400, 150]
};

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function load(file) {
	return yaml.load(fs.readFileSync(file, "utf8"));
}

for (const file of [
	"packs/_source/starships/starship-features/large/role-corvette.yml",
	"packs/_source/starships/starship-features/large/role-cruiser.yml",
	"packs/_source/starships/starship-features/large/role-explorer.yml"
]) {
	test(`${file} ability bonuses use add mode once`, () => {
		const doc = load(file);
		const changes = doc.effects[0].changes;
		const abilities = changes.filter(change => String(change.key).startsWith("system.abilities."));
		assert.ok(abilities.length >= 2);
		for (const change of abilities) assert.equal(Number(change.mode), 2, change.key);
		const movement = changes.filter(change => String(change.key).includes("movement.speeds."));
		assert.equal(movement.length, 2);
		for (const change of movement) assert.equal(Number(change.mode), 5);
	});
}

for (const [file, [space, turn]] of Object.entries(MOVEMENT)) {
	test(`${file} publishes dnd5e 6 movement`, () => {
		const doc = load(file);
		const role = (doc.items ?? []).find(item => String(item.name).startsWith("Role:"));
		assert.ok(role, "role item");
		const changes = (role.effects ?? []).flatMap(effect => effect.changes ?? []);
		const spaceChange = changes.find(change => change.key === "system.attributes.movement.speeds.space");
		const turnChange = changes.find(change => change.key === "system.attributes.movement.speeds.turn");
		assert.equal(Number(spaceChange?.value), space);
		assert.equal(Number(turnChange?.value), turn);
		assert.equal(Number(spaceChange.mode), 5);
		assert.equal(Number(turnChange.mode), 5);
	});
}

test("Fire-Linked Mounting no longer uses the slave-circuit description", () => {
	const doc = load("packs/_source/drakes-shipyard/a-sf-01-b-wing-starfighter.yml");
	const items = (doc.items ?? []).filter(item => item.name === "Fire-Linked Mounting");
	assert.ok(items.length > 0);
	for (const item of items) {
		const descriptions = [
			item.system?.description?.value,
			item.flags?.sw5e?.legacyStarshipMod?.description?.value
		].join("\n");
		assert.equal(/slave circuit/i.test(descriptions), false);
		assert.match(descriptions, /Fire-Linked Mounting/);
	}
});

test("embedded Adaptive Ailerons turn value stays +100", () => {
	const doc = load("packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor-modified.yml");
	const item = (doc.items ?? []).find(entry => entry.name === "Adaptive Ailerons");
	const effect = (item.effects ?? []).find(entry => entry._id === "yie6lRqE4olXJrK3");
	const turn = effect.changes.find(change => String(change.key).includes("movement"));
	assert.equal(String(turn.value), "+100");
});

test("identical Role actor effects are not duplicated on the heavily modified YT-1300", () => {
	const doc = load("packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml");
	const roles = (doc.effects ?? []).filter(effect => effect.name === "Role: Freighter");
	const signatures = roles.map(effect => JSON.stringify(effect.changes));
	assert.equal(new Set(signatures).size, signatures.length);
});

test("no Drake remediation script is part of this source correction", () => {
	for (const file of [
		"utils/fix-drakes-role-spec-duplicates.mjs",
		"utils/fix-drakes-duplicated-actor-effects.mjs",
		"utils/fix-drakes-text-repairs.mjs",
		"utils/fix-drakes-directional-shield-duplicates.mjs",
		"utils/fix-starship-role-ability-modes.mjs"
	]) {
		assert.equal(fs.existsSync(file), false, file);
	}
});

console.log(`\n${passed} passed`);
