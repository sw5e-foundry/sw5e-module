#!/usr/bin/env node
/**
 * P10E-15 — SW5e Maneuver registration on dnd5e Item Choice / Item Grant VALID_TYPES.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getModuleType, getModuleTypeCandidates } from "../scripts/module-support.mjs";
import { registerManeuverItemChoiceTypes } from "../scripts/patch/item-choice-advancement.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STOCK_TYPES = ["feat", "spell", "consumable", "container", "equipment", "loot", "tool", "weapon"];

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function makeConfig(stock=STOCK_TYPES) {
	const validTypes = new Set(stock);
	class ItemGrantAdvancement {
		static VALID_TYPES = validTypes;
	}
	class ItemChoiceAdvancement extends ItemGrantAdvancement {}
	return {
		config: {
			advancementTypes: {
				ItemChoice: { documentClass: ItemChoiceAdvancement },
				ItemGrant: { documentClass: ItemGrantAdvancement }
			}
		},
		validTypes,
		ItemChoiceAdvancement,
		ItemGrantAdvancement
	};
}

/** Mirror ItemChoiceConfig typeOptions mapping (Anything + VALID_TYPES → labels). */
function buildTypeOptions(validTypes, typeLabels) {
	return [
		{ value: "", label: "Anything" },
		...[...validTypes].map(value => ({ value, label: typeLabels[value] ?? value }))
	];
}

/** Mirror ItemGrantAdvancement._validateItemType allowlist gate. */
function allowlistAccepts(validTypes, itemType) {
	return validTypes.has(itemType);
}

check("baseline maneuver module type and candidates", () => {
	assert.equal(getModuleType("maneuver"), "sw5e-module.maneuver");
	const candidates = getModuleTypeCandidates("maneuver");
	assert.ok(candidates.includes("sw5e-module.maneuver"));
	assert.ok(candidates.includes("sw5e.maneuver"));
});

check("maneuver absent before patch; stock present", () => {
	const { validTypes } = makeConfig();
	for ( const t of STOCK_TYPES ) assert.ok(validTypes.has(t), t);
	for ( const t of getModuleTypeCandidates("maneuver") ) assert.equal(validTypes.has(t), false);
});

check("ItemChoice and ItemGrant share the same VALID_TYPES Set instance", () => {
	const { ItemChoiceAdvancement, ItemGrantAdvancement, validTypes } = makeConfig();
	assert.equal(ItemChoiceAdvancement.VALID_TYPES, ItemGrantAdvancement.VALID_TYPES);
	assert.equal(ItemChoiceAdvancement.VALID_TYPES, validTypes);
});

check("register adds all maneuver candidates and preserves Set identity", () => {
	const { config, validTypes, ItemChoiceAdvancement } = makeConfig();
	const beforeRef = ItemChoiceAdvancement.VALID_TYPES;
	const result = registerManeuverItemChoiceTypes(config);
	assert.equal(result.ok, true);
	assert.equal(result.set, beforeRef);
	assert.equal(ItemChoiceAdvancement.VALID_TYPES, beforeRef);
	for ( const t of getModuleTypeCandidates("maneuver") ) {
		assert.ok(validTypes.has(t), `missing ${t}`);
	}
	assert.deepEqual(new Set(result.added), new Set(getModuleTypeCandidates("maneuver")));
	for ( const t of STOCK_TYPES ) assert.ok(validTypes.has(t), `stock lost ${t}`);
});

check("repeated registration is idempotent (no size growth)", () => {
	const { config, validTypes } = makeConfig();
	registerManeuverItemChoiceTypes(config);
	const size1 = validTypes.size;
	const second = registerManeuverItemChoiceTypes(config);
	assert.equal(second.ok, true);
	assert.equal(second.added.length, 0);
	assert.equal(validTypes.size, size1);
});

check("option generation includes Maneuver once and keeps Power as spell", () => {
	const { config, validTypes } = makeConfig();
	registerManeuverItemChoiceTypes(config);
	const typeLabels = {
		feat: "Feature",
		spell: "Power",
		consumable: "Consumable",
		container: "Container",
		equipment: "Equipment",
		loot: "Loot",
		tool: "Tool",
		weapon: "Weapon",
		"sw5e-module.maneuver": "Maneuver",
		"sw5e.maneuver": "Maneuver"
	};
	const options = buildTypeOptions(validTypes, typeLabels);
	const maneuverOpts = options.filter(o => o.value === "sw5e-module.maneuver" || o.value === "sw5e.maneuver");
	assert.ok(maneuverOpts.length >= 1);
	assert.ok(maneuverOpts.every(o => o.label === "Maneuver"));
	const power = options.find(o => o.value === "spell");
	assert.ok(power);
	assert.equal(power.label, "Power");
	assert.ok(!options.some(o => o.value === "spell" && o.label === "Maneuver"));
	assert.ok(options.some(o => o.value === "" && o.label === "Anything"));
});

check("maneuver restriction accepts maneuver and rejects feature/power/unrelated", () => {
	const { config, validTypes } = makeConfig();
	registerManeuverItemChoiceTypes(config);
	const maneuverType = "sw5e-module.maneuver";
	assert.equal(allowlistAccepts(validTypes, maneuverType), true);
	assert.equal(allowlistAccepts(validTypes, "feat"), true); // stock still on allowlist
	// Restriction semantics: when configuration.type is Maneuver, only that type matches
	const restricted = (itemType) => itemType === maneuverType && allowlistAccepts(validTypes, itemType);
	assert.equal(restricted(maneuverType), true);
	assert.equal(restricted("feat"), false);
	assert.equal(restricted("spell"), false);
	assert.equal(restricted("weapon"), false);
});

check("power restriction accepts power and rejects maneuver", () => {
	const { config, validTypes } = makeConfig();
	registerManeuverItemChoiceTypes(config);
	const restricted = (itemType) => itemType === "spell" && allowlistAccepts(validTypes, itemType);
	assert.equal(restricted("spell"), true);
	assert.equal(restricted("sw5e-module.maneuver"), false);
});

check("anything remains unrestricted (blank type)", () => {
	const { config, validTypes } = makeConfig();
	registerManeuverItemChoiceTypes(config);
	const type = null;
	const accepts = (itemType) => (!type || type === itemType) && allowlistAccepts(validTypes, itemType);
	assert.equal(accepts("spell"), true);
	assert.equal(accepts("sw5e-module.maneuver"), true);
	assert.equal(accepts("feat"), true);
});

check("missing advancementTypes fails safely", () => {
	const result = registerManeuverItemChoiceTypes({});
	assert.equal(result.ok, false);
	assert.equal(result.reason, "missing-advancementTypes");
});

check("missing ItemChoice class fails safely", () => {
	const result = registerManeuverItemChoiceTypes({ advancementTypes: {} });
	assert.equal(result.ok, false);
	assert.equal(result.reason, "missing-ItemChoice");
});

check("missing VALID_TYPES Set fails safely", () => {
	class ItemChoiceAdvancement {}
	const result = registerManeuverItemChoiceTypes({
		advancementTypes: { ItemChoice: { documentClass: ItemChoiceAdvancement } }
	});
	assert.equal(result.ok, false);
	assert.equal(result.reason, "missing-VALID_TYPES");
});

check("no P10E-14 shim in item-choice-advancement patch", () => {
	const src = fs.readFileSync(path.join(ROOT, "scripts/patch/item-choice-advancement.mjs"), "utf8");
	assert.equal(/migrateData|ItemChoiceConfigurationData|libWrapper|configuration\s*[=!]=\s*null|AdvancementDataField/.test(src), false);
});

check("dnd5e install files unchanged by this module patch file set", () => {
	// Repo must not contain a systems/dnd5e tree; patch only lives under scripts/
	assert.equal(fs.existsSync(path.join(ROOT, "systems/dnd5e")), false);
	const mod = fs.readFileSync(path.join(ROOT, "scripts/module.mjs"), "utf8");
	assert.ok(mod.includes("patchItemChoiceAdvancement"));
});

console.log(`\n${passed} passed`);
