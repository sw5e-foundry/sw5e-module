#!/usr/bin/env node
/**
 * EquipmentData starship fields and null-versus-zero regeneration.
 *
 * Normalization rules:
 * - Regen uses local ?? inherited ?? default. 0 and "0" are present and disable regen.
 * - Null, undefined, and blank strings are absent and fall through.
 * - Negative regen values are rejected (absent), not clamped to a disable.
 * - Numeric regen strings parse. Non-numeric text is absent.
 * - Capacity null stays null on the schema. Pool derivation maps null, blank, and
 *   non-numeric text to 0, parses numeric strings, and clamps negatives to 0.
 * - powerdicerec stays a string. Null and non-scalar YAML become "".
 */
import assert from "node:assert/strict";
import { deriveStarshipPools } from "../scripts/starship-data.mjs";
import { getStarshipShieldRegenRateMultSync } from "../scripts/starship-dice-rolls.mjs";
import {
	addStarshipEquipmentRegenRateField,
	normalizeStarshipCapacity,
	normalizeStarshipPowerDiceRecovery,
	resolveStarshipRegenRate
} from "../scripts/patch/starship-equipment-schema.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

class NumberField {
	constructor(options) { this.options = options; }
}
class StringField {
	constructor(options) { this.options = options; }
}
class SchemaField {
	constructor(fields = {}) { this.fields = fields; }
}

const fields = { SchemaField, NumberField, StringField };

test("schema field names match pack content", () => {
	const schema = {};
	addStarshipEquipmentRegenRateField(schema, fields);
	for ( const name of ["regrateco", "cscap", "sscap", "powerdicerec"] ) {
		assert.ok(schema.attributes.fields[name], name);
	}
	const regen = schema.attributes.fields.regrateco.fields.value;
	assert.ok(regen instanceof NumberField);
	assert.equal(regen.options.nullable, true);
	assert.equal(regen.options.initial, null);
	assert.equal(regen.options.min, 0);
	assert.equal(regen.options.integer, undefined);
	for ( const name of ["cscap", "sscap"] ) {
		const field = schema.attributes.fields[name].fields.value;
		assert.ok(field instanceof NumberField, name);
		assert.equal(field.options.nullable, true, name);
		assert.equal(field.options.initial, null, name);
		assert.equal(field.options.min, 0, name);
	}
	const formula = schema.attributes.fields.powerdicerec.fields.value;
	assert.ok(formula instanceof StringField);
	assert.equal(formula.options.nullable, true);
	assert.equal(formula.options.blank, true);
	assert.equal(formula.options.initial, "");
});

test("extends an existing attributes SchemaField instead of replacing it", () => {
	const existing = new SchemaField({
		capx: new SchemaField({ value: new NumberField({ initial: null }) })
	});
	const schema = { attributes: existing };
	const returned = addStarshipEquipmentRegenRateField(schema, fields);
	assert.equal(returned, schema);
	assert.equal(schema.attributes, existing);
	assert.ok(schema.attributes.fields.capx);
	assert.ok(schema.attributes.fields.regrateco);
});

test("local null or undefined falls back to inherited 2", () => {
	assert.equal(resolveStarshipRegenRate(null, 2, 9), 2);
	assert.equal(resolveStarshipRegenRate(undefined, 2, 9), 2);
});

test("local 0 disables even when inherited is 2", () => {
	assert.equal(resolveStarshipRegenRate(0, 2, 9), 0);
});

test("local 1 overrides inherited 2", () => {
	assert.equal(resolveStarshipRegenRate(1, 2, 9), 1);
});

test("local string 0 normalizes to an explicit disable", () => {
	assert.equal(resolveStarshipRegenRate("0", 2, 9), 0);
	assert.equal(resolveStarshipRegenRate(" 0 ", 2, 9), 0);
});

test("local numeric string parses and a negative local is rejected", () => {
	assert.equal(resolveStarshipRegenRate("1.5", 2, 9), 1.5);
	assert.equal(resolveStarshipRegenRate(-1, 2, 9), 2);
	assert.equal(resolveStarshipRegenRate("nope", 2, 9), 2);
});

test("blank local falls through and an absent chain uses the default", () => {
	assert.equal(resolveStarshipRegenRate("", 2, 9), 2);
	assert.equal(resolveStarshipRegenRate(null, null, 0.667), 0.667);
	assert.equal(resolveStarshipRegenRate(null, null, null), null);
});

function shieldItem({ live, source, legacyFlag } = {}) {
	const item = {
		name: "Quick-Charge Shield",
		system: { type: { value: "ssshield" }, equipped: true },
		_source: { system: { type: { value: "ssshield" }, equipped: true } },
		flags: { sw5e: {} }
	};
	if ( live !== undefined ) item.system.attributes = { regrateco: { value: live } };
	if ( source !== undefined ) item._source.system.attributes = { regrateco: { value: source } };
	if ( legacyFlag !== undefined ) {
		item.flags.sw5e.legacyStarshipEquipment = { attributes: { regrateco: { value: legacyFlag } } };
	}
	return item;
}

function starshipActor(shield, { regenRateMult } = {}) {
	const actor = {
		type: "vehicle",
		name: "Regen Fixture",
		system: {},
		_source: { system: {} },
		flags: { sw5e: { legacyStarshipActor: { type: "starship", system: {} } } },
		items: { contents: shield ? [shield] : [] }
	};
	if ( regenRateMult !== undefined ) {
		actor.flags.sw5e.legacyStarshipActor.system.attributes = {
			equip: { shields: { regenRateMult } }
		};
	}
	return actor;
}

test("equipped shield reader keeps explicit zero and falls back when local is null", () => {
	assert.equal(getStarshipShieldRegenRateMultSync(starshipActor(shieldItem({ live: 0, legacyFlag: 2 }))), 0);
	assert.equal(getStarshipShieldRegenRateMultSync(starshipActor(shieldItem({ live: null, legacyFlag: 2 }))), 2);
	assert.equal(getStarshipShieldRegenRateMultSync(starshipActor(shieldItem({ live: "0", legacyFlag: 2 }))), 0);
	assert.equal(getStarshipShieldRegenRateMultSync(starshipActor(shieldItem(), { regenRateMult: 0.667 })), 0.667);
});

test("capacity normalization rejects NaN and clamps negatives", () => {
	assert.equal(normalizeStarshipCapacity(null), null);
	assert.equal(normalizeStarshipCapacity(0), 0);
	assert.equal(normalizeStarshipCapacity("4"), 4);
	assert.equal(normalizeStarshipCapacity(-3), 0);
	assert.equal(normalizeStarshipCapacity("nope"), null);
	assert.equal(normalizeStarshipCapacity(Number.NaN), null);
});

test("powerdicerec strings are preserved and empty objects become blank", () => {
	assert.equal(normalizeStarshipPowerDiceRecovery("1d2"), "1d2");
	assert.equal(normalizeStarshipPowerDiceRecovery("(1d2)-1"), "(1d2)-1");
	assert.equal(normalizeStarshipPowerDiceRecovery(1), "1");
	assert.equal(normalizeStarshipPowerDiceRecovery({}), "");
	assert.equal(normalizeStarshipPowerDiceRecovery(null), "");
});

test("pool derivation does not emit negative or NaN coupling capacities", () => {
	const actor = {
		type: "vehicle",
		flags: { sw5e: { legacyStarshipActor: { type: "starship", system: { details: { tier: 1 } } } } },
		system: { abilities: { con: { value: 10 } }, traits: { size: "sm" } },
		_source: { system: {}, items: [] },
		items: {
			contents: [{
				system: {
					type: { value: "powerc" },
					equipped: true,
					attributes: { cscap: { value: -5 }, sscap: { value: "nope" } }
				}
			}]
		}
	};
	const pools = deriveStarshipPools(actor);
	assert.equal(pools.power.cscap, 0);
	assert.equal(pools.power.sscap, 0);
	assert.equal(Number.isNaN(pools.power.cscap), false);
	assert.equal(Number.isNaN(pools.power.sscap), false);
	const numeric = deriveStarshipPools({
		...actor,
		items: {
			contents: [{
				system: {
					type: { value: "powerc" },
					equipped: true,
					attributes: { cscap: { value: "4" }, sscap: { value: 0 } }
				}
			}]
		}
	});
	assert.equal(numeric.power.cscap, 4);
	assert.equal(numeric.power.sscap, 0);
});

console.log(`\n${passed} passed`);
