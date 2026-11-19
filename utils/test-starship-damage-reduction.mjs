#!/usr/bin/env node
/**
 * Regression: starship attack damage reduction keeps part values and the
 * precomputed total in agreement, applies once, and leaves non-attack damage alone.
 */
import assert from "node:assert/strict";
import { applyStarshipAttackDamageReduction } from "../scripts/starship-damage-reduction.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function partSum(damages) {
	return damages.reduce((sum, part) => {
		if ( !part || part.type === "temphp" || part.type === "maximum" ) return sum;
		return sum + Number(part.value);
	}, 0);
}

test("attack reduction makes parts and the precomputed total agree", () => {
	const damages = [
		{ type: "energy", value: 6 },
		{ type: "energy", value: 3 }
	];
	damages.amount = 9;
	const applied = applyStarshipAttackDamageReduction(damages, 3, { sw5e: { fromAttack: true } });
	assert.equal(applied, true);
	assert.equal(partSum(damages), 6);
	assert.equal(damages.amount, 6);
	assert.equal(damages[0].value + damages[1].value, damages.amount);
});

test("reduction applies exactly once", () => {
	const damages = [{ type: "energy", value: 9 }];
	damages.amount = 9;
	const options = { sw5e: { fromAttack: true } };
	assert.equal(applyStarshipAttackDamageReduction(damages, 3, options), true);
	assert.equal(damages.amount, 6);
	assert.equal(applyStarshipAttackDamageReduction(damages, 3, options), false);
	assert.equal(damages[0].value, 6);
	assert.equal(damages.amount, 6);
});

test("non-attack damage keeps its parts and total", () => {
	const damages = [{ type: "energy", value: 9 }];
	damages.amount = 9;
	assert.equal(applyStarshipAttackDamageReduction(damages, 3, {}), false);
	assert.equal(damages[0].value, 9);
	assert.equal(damages.amount, 9);
	assert.equal(damages[0].active, undefined);
});

test("positive damage smaller than the reduction stays at 1", () => {
	const damages = [{ type: "energy", value: 2 }];
	damages.amount = 2;
	assert.equal(applyStarshipAttackDamageReduction(damages, 5, { sw5e: { fromAttack: true } }), true);
	assert.equal(damages[0].value, 1);
	assert.equal(damages.amount, 1);
	assert.ok(damages.amount > 0);
});

test("zero damage stays zero", () => {
	const damages = [{ type: "energy", value: 0 }];
	damages.amount = 0;
	assert.equal(applyStarshipAttackDamageReduction(damages, 5, { sw5e: { fromAttack: true } }), false);
	assert.equal(damages[0].value, 0);
	assert.equal(damages.amount, 0);
});

console.log(`\n${passed} passed`);
