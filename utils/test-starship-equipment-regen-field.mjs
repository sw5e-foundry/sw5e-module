#!/usr/bin/env node
/**
 * Offline tests: EquipmentData regrateco schema field and explicit-zero regen readers.
 */
import assert from "node:assert/strict";
import { addStarshipEquipmentRegenRateField } from "../scripts/patch/starship-equipment-schema.mjs";
import { getStarshipShieldRegenRateMultSync } from "../scripts/starship-dice-rolls.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

class NumberField {
	constructor(options) {
		this.options = options;
	}
}

class SchemaField {
	constructor(fields = {}) {
		this.fields = fields;
	}
}

const fields = { SchemaField, NumberField };

function shieldItem({ live, source, legacyFlag } = {}) {
	const item = {
		name: "Quick-Charge Shield",
		system: {
			type: { value: "ssshield" },
			equipped: true
		},
		_source: {
			system: {
				type: { value: "ssshield" },
				equipped: true
			}
		},
		flags: { sw5e: {} }
	};
	if ( live !== undefined ) {
		item.system.attributes = { regrateco: { value: live } };
	}
	if ( source !== undefined ) {
		item._source.system.attributes = { regrateco: { value: source } };
	}
	if ( legacyFlag !== undefined ) {
		item.flags.sw5e.legacyStarshipEquipment = {
			attributes: { regrateco: { value: legacyFlag } }
		};
	}
	return item;
}

function starshipActor(shield, { regenRateMult } = {}) {
	const actor = {
		type: "vehicle",
		name: "Regen Fixture",
		system: {},
		_source: { system: {} },
		flags: {
			sw5e: {
				legacyStarshipActor: {
					type: "starship",
					system: {}
				}
			}
		},
		items: { contents: shield ? [shield] : [] }
	};
	if ( regenRateMult !== undefined ) {
		actor.flags.sw5e.legacyStarshipActor.system.attributes = {
			equip: { shields: { regenRateMult } }
		};
	}
	return actor;
}

test("adds nullable regrateco NumberField with min 0 and null initial", () => {
	const schema = {};
	addStarshipEquipmentRegenRateField(schema, fields);
	const value = schema.attributes.fields.regrateco.fields.value;
	assert.ok(value instanceof NumberField);
	assert.equal(value.options.nullable, true);
	assert.equal(value.options.initial, null);
	assert.equal(value.options.min, 0);
	assert.equal(value.options.required, false);
	assert.equal(value.options.integer, undefined);
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
	assert.ok(schema.attributes.fields.regrateco.fields.value instanceof NumberField);
});

test("positive live coefficient is used", () => {
	assert.equal(getStarshipShieldRegenRateMultSync(starshipActor(shieldItem({ live: 1.5 }))), 1.5);
	assert.equal(getStarshipShieldRegenRateMultSync(starshipActor(shieldItem({ live: 1.25 }))), 1.25);
});

test("null live value falls through to the legacy equipment flag", () => {
	const actor = starshipActor(shieldItem({ live: null, legacyFlag: 1 }));
	assert.equal(getStarshipShieldRegenRateMultSync(actor), 1);
});

test("explicit live zero disables regen and skips the legacy flag", () => {
	const actor = starshipActor(shieldItem({ live: 0, legacyFlag: 1 }));
	assert.equal(getStarshipShieldRegenRateMultSync(actor), null);
});

test("zero only in _source still falls through", () => {
	const actor = starshipActor(shieldItem({ source: 0, legacyFlag: 1 }));
	assert.equal(getStarshipShieldRegenRateMultSync(actor), 1);
});

test("legacy actor snapshot is used when the equipped shield has no local value", () => {
	const actor = starshipActor(shieldItem(), { regenRateMult: 0.667 });
	assert.equal(getStarshipShieldRegenRateMultSync(actor), 0.667);
});

console.log(`\n${passed} tests passed`);
