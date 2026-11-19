#!/usr/bin/env node
/**
 * Weapon facing schema defaults and Wisdom damage application when routing is 1.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import yaml from "js-yaml";
import { addStarshipWeaponFacingFields } from "../scripts/patch/starship-weapon-facing.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

class StringField {
	constructor(options) { this.options = options; }
}
class BooleanField {
	constructor(options) { this.options = options; }
}

test("facing defaults to blank and turret defaults to false", () => {
	const schema = {};
	addStarshipWeaponFacingFields(schema, { StringField, BooleanField });
	assert.equal(schema.firingArc.options.initial, "");
	assert.equal(schema.firingArc.options.blank, true);
	assert.equal(schema.turreted.options.initial, false);
});

test("Wisdom damage is applied before the routing multiplier early return", () => {
	const source = fs.readFileSync("scripts/starship-weapon-rolls.mjs", "utf8");
	const fn = source.slice(source.indexOf("function onStarshipWeaponPreRollDamage"));
	const wis = fn.indexOf("shouldUseStarshipWisAttackAbility");
	const early = fn.indexOf("if ( multiplier === 1 ) return;");
	assert.ok(wis > 0 && early > wis);
});

test("empty power pools stay hidden in Play when caster level is zero", () => {
	const source = fs.readFileSync("scripts/patch/powercasting.mjs", "utf8");
	assert.match(source, /hideEmptyPoolInPlay/);
	assert.match(source, /shouldRenderMeter && !hideEmptyPoolInPlay/);
});

test("Pilot compendium no longer carries level advancements", () => {
	const doc = yaml.load(fs.readFileSync("packs/_source/deployments/pilot/pilot.yml", "utf8"));
	assert.deepEqual(doc.system.advancement, []);
	assert.match(doc.system.description.value, /Rank/);
	assert.equal(doc.flags.sw5e.legacyDeployment.rank, 1);
});

console.log(`\n${passed} passed`);
