#!/usr/bin/env node
/**
 * P10E-15 — SW5e Maneuver registration on dnd5e Item Choice / Item Grant VALID_TYPES.
 * User-facing allowlist uses the canonical type only; legacy alias remains in candidates.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getModuleType, getModuleTypeCandidates, isModuleType } from "../scripts/module-support.mjs";
import { registerManeuverItemChoiceTypes } from "../scripts/patch/item-choice-advancement.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STOCK_TYPES = ["feat", "spell", "consumable", "container", "equipment", "loot", "tool", "weapon"];
const CANONICAL = "sw5e-module.maneuver";
const LEGACY = "sw5e.maneuver";

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
	assert.equal(getModuleType("maneuver"), CANONICAL);
	const candidates = getModuleTypeCandidates("maneuver");
	assert.ok(candidates.includes(CANONICAL));
	assert.ok(candidates.includes(LEGACY));
	assert.equal(isModuleType(LEGACY, "maneuver"), true);
	assert.equal(isModuleType(CANONICAL, "maneuver"), true);
});

check("maneuver absent before patch; stock present", () => {
	const { validTypes } = makeConfig();
	for ( const t of STOCK_TYPES ) assert.ok(validTypes.has(t), t);
	assert.equal(validTypes.has(CANONICAL), false);
	assert.equal(validTypes.has(LEGACY), false);
});

check("ItemChoice and ItemGrant share the same VALID_TYPES Set instance", () => {
	const { ItemChoiceAdvancement, ItemGrantAdvancement, validTypes } = makeConfig();
	assert.equal(ItemChoiceAdvancement.VALID_TYPES, ItemGrantAdvancement.VALID_TYPES);
	assert.equal(ItemChoiceAdvancement.VALID_TYPES, validTypes);
});

check("register adds only canonical Maneuver and preserves Set identity", () => {
	const { config, validTypes, ItemChoiceAdvancement } = makeConfig();
	const beforeRef = ItemChoiceAdvancement.VALID_TYPES;
	const result = registerManeuverItemChoiceTypes(config);
	assert.equal(result.ok, true);
	assert.equal(result.set, beforeRef);
	assert.equal(ItemChoiceAdvancement.VALID_TYPES, beforeRef);
	assert.equal(result.type, CANONICAL);
	assert.ok(validTypes.has(CANONICAL));
	assert.equal(validTypes.has(LEGACY), false);
	assert.deepEqual(result.added, [CANONICAL]);
	for ( const t of STOCK_TYPES ) assert.ok(validTypes.has(t), `stock lost ${t}`);
});

check("compatibility helper still returns both candidates outside VALID_TYPES", () => {
	const candidates = getModuleTypeCandidates("maneuver");
	assert.deepEqual(new Set(candidates), new Set([CANONICAL, LEGACY]));
	const { config, validTypes } = makeConfig();
	registerManeuverItemChoiceTypes(config);
	assert.equal(validTypes.has(LEGACY), false);
	assert.equal(isModuleType(LEGACY, "maneuver"), true);
});

check("repeated registration is idempotent (no size growth)", () => {
	const { config, validTypes } = makeConfig();
	registerManeuverItemChoiceTypes(config);
	const size1 = validTypes.size;
	const second = registerManeuverItemChoiceTypes(config);
	assert.equal(second.ok, true);
	assert.equal(second.added.length, 0);
	assert.equal(validTypes.size, size1);
	assert.equal(validTypes.has(LEGACY), false);
});

check("option generation yields exactly one Maneuver with canonical value", () => {
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
		[CANONICAL]: "Maneuver",
		[LEGACY]: "Maneuver"
	};
	const options = buildTypeOptions(validTypes, typeLabels);
	const maneuverOpts = options.filter(o => o.value === CANONICAL || o.value === LEGACY);
	assert.equal(maneuverOpts.length, 1);
	assert.equal(maneuverOpts[0].value, CANONICAL);
	assert.equal(maneuverOpts[0].label, "Maneuver");
	assert.ok(!options.some(o => o.value === LEGACY));
	const power = options.find(o => o.value === "spell");
	assert.ok(power);
	assert.equal(power.label, "Power");
	assert.ok(!options.some(o => o.value === "spell" && o.label === "Maneuver"));
	assert.ok(options.some(o => o.value === "" && o.label === "Anything"));
});

check("maneuver restriction accepts canonical and rejects feature/power/unrelated", () => {
	const { config, validTypes } = makeConfig();
	registerManeuverItemChoiceTypes(config);
	assert.equal(allowlistAccepts(validTypes, CANONICAL), true);
	assert.equal(allowlistAccepts(validTypes, LEGACY), false);
	assert.equal(allowlistAccepts(validTypes, "feat"), true);
	const restricted = (itemType) => itemType === CANONICAL && allowlistAccepts(validTypes, itemType);
	assert.equal(restricted(CANONICAL), true);
	assert.equal(restricted(LEGACY), false);
	assert.equal(restricted("feat"), false);
	assert.equal(restricted("spell"), false);
	assert.equal(restricted("weapon"), false);
});

check("power restriction accepts power and rejects maneuver", () => {
	const { config, validTypes } = makeConfig();
	registerManeuverItemChoiceTypes(config);
	const restricted = (itemType) => itemType === "spell" && allowlistAccepts(validTypes, itemType);
	assert.equal(restricted("spell"), true);
	assert.equal(restricted(CANONICAL), false);
});

check("anything remains unrestricted for allowlisted types including canonical Maneuver", () => {
	const { config, validTypes } = makeConfig();
	registerManeuverItemChoiceTypes(config);
	const type = null;
	const accepts = (itemType) => (!type || type === itemType) && allowlistAccepts(validTypes, itemType);
	assert.equal(accepts("spell"), true);
	assert.equal(accepts(CANONICAL), true);
	assert.equal(accepts("feat"), true);
	// Legacy alias is not on the user-facing allowlist (Anything still uses VALID_TYPES.has)
	assert.equal(accepts(LEGACY), false);
});

check("legacy alias remains recognizable for document reading/normalization", () => {
	assert.equal(isModuleType(LEGACY, "maneuver"), true);
	assert.ok(getModuleTypeCandidates("maneuver").includes(LEGACY));
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
	assert.match(src, /getModuleType\("maneuver"\)/);
	assert.doesNotMatch(src, /getModuleTypeCandidates\("maneuver"\)/);
});

check("dnd5e install files unchanged by this module patch file set", () => {
	assert.equal(fs.existsSync(path.join(ROOT, "systems/dnd5e")), false);
	const mod = fs.readFileSync(path.join(ROOT, "scripts/module.mjs"), "utf8");
	assert.ok(mod.includes("patchItemChoiceAdvancement"));
});

console.log(`\n${passed} passed`);
