#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "js-yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "packs/_source/drakes-shipyard/t-65-x-wing-starfighter.yml");
const ship = YAML.load(fs.readFileSync(sourcePath, "utf8"));

function attackChanges(effect) {
	return (effect?.changes ?? []).filter(change => change?.key === "system.bonuses.rwak.attack");
}

const item = (ship.items ?? []).find(entry => entry?._id === "La9CLcHHy6zkCkwR");
const itemEffect = (item?.effects ?? []).find(effect => effect?._id === "qQTMHDrpIch61Q7C");
const actorEffect = (ship.effects ?? []).find(effect => effect?._id === "gkW2IgvJzkyFVsXG");

assert.equal(itemEffect?.disabled, false);
assert.equal(itemEffect?.transfer, true);
assert.equal(attackChanges(itemEffect).length, 1);

assert.ok(actorEffect, "actor-level Strike Fighter effect must remain");
assert.equal(actorEffect.disabled, true);
assert.equal(actorEffect.transfer, false);
assert.deepEqual(
	(actorEffect.changes ?? []).map(change => change.key),
	["system.details.role", "system.bonuses.rwak.attack"]
);

const contributing = [];
for ( const effect of ship.effects ?? [] ) {
	if ( effect.disabled ) continue;
	if ( effect.name === "Role Specialization: Strike Fighter" && attackChanges(effect).length ) contributing.push(effect._id);
}
for ( const embedded of ship.items ?? [] ) {
	for ( const effect of embedded.effects ?? [] ) {
		if ( effect.disabled ) continue;
		if ( effect.name === "Role Specialization: Strike Fighter" && attackChanges(effect).length ) contributing.push(effect._id);
	}
}
assert.deepEqual(contributing, ["qQTMHDrpIch61Q7C"]);
console.log("ok - T-65 source has one contributing Strike Fighter ranged-attack bonus");
