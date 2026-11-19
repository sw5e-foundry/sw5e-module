#!/usr/bin/env node
/**
 * Offline tests: getStarshipEffectiveTier + getRollData details.tier contract (Slice A).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import {
	deriveStarshipPools,
	getStarshipEffectiveTier,
	isStarshipFlagVehicle
} from "../scripts/starship-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREPARE = fs.readFileSync(path.join(ROOT, "scripts/patch/starship-prepare.mjs"), "utf8");
const SHIPYARD = path.join(ROOT, "packs/_source/drakes-shipyard");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function starshipActor({ tier, sizeTier, hullAdvKeys, sizeId = "size1" } = {}) {
	const flags = {
		sw5e: {
			legacyStarshipActor: {
				type: "starship",
				system: {
					details: tier === undefined ? {} : { tier }
				}
			}
		}
	};
	const sizeItem = {
		_id: sizeId,
		id: sizeId,
		type: "feat",
		flags: sizeTier === undefined ? {} : { sw5e: { legacyStarshipSize: { tier: sizeTier, hullDice: "d6", hullDiceStart: 3, shldDice: "d6", shldDiceStart: 3, modBaseCap: 20, modMaxSuitesBase: 0, modMaxSuitesMult: 1 } } },
		system: {
			identifier: "small",
			advancement: hullAdvKeys
				? [{ type: "HullPoints", value: Object.fromEntries(hullAdvKeys.map(k => [String(k), true])) }]
				: []
		}
	};
	if ( sizeTier !== undefined && !sizeItem.flags.sw5e.legacyStarshipSize.hullDice ) {
		/* already set */
	}
	return {
		type: "vehicle",
		flags,
		system: { abilities: { con: { value: 10 } }, traits: { size: "sm" } },
		_source: { system: {}, items: [sizeItem] },
		items: { contents: [sizeItem] }
	};
}

test("finite legacy flag tier wins", () => {
	assert.equal(getStarshipEffectiveTier(starshipActor({ tier: 3, sizeTier: 1, hullAdvKeys: [5] })), 3);
});

test("numeric-string legacy flag tier is normalized", () => {
	assert.equal(getStarshipEffectiveTier(starshipActor({ tier: "2", sizeTier: 9 })), 2);
});

test("valid zero legacy tier remains zero", () => {
	assert.equal(getStarshipEffectiveTier(starshipActor({ tier: 0, sizeTier: 4 })), 0);
});

test("missing legacy tier falls back to size-item tier", () => {
	assert.equal(getStarshipEffectiveTier(starshipActor({ sizeTier: 4, hullAdvKeys: [1] })), 4);
});

test("missing flag and size-item tier falls back to HullPoints advancement maximum key", () => {
	assert.equal(getStarshipEffectiveTier(starshipActor({ hullAdvKeys: [1, 3, 2] })), 3);
});

test("all missing sources return zero", () => {
	assert.equal(getStarshipEffectiveTier(starshipActor({})), 0);
});

test("malformed higher-priority values fall through without NaN/Infinity", () => {
	const actor = starshipActor({ tier: "nope", sizeTier: 2 });
	const tier = getStarshipEffectiveTier(actor);
	assert.equal(tier, 2);
	assert.ok(Number.isFinite(tier));
});

test("malformed all sources return zero finite", () => {
	const actor = starshipActor({ tier: "x", sizeTier: "y" });
	// sizeTier "y" in legacyStarshipSize — toFiniteNumber null; no hull adv → 0
	actor.items.contents[0].flags.sw5e.legacyStarshipSize.tier = "y";
	const tier = getStarshipEffectiveTier(actor);
	assert.equal(tier, 0);
	assert.ok(Number.isFinite(tier));
});

test("deriveStarshipPools uses shared helper and preserves pool math", () => {
	const actor = starshipActor({
		tier: 2,
		sizeTier: 2
	});
	// Ensure size system has dice starts for pool math
	actor.items.contents[0].flags.sw5e.legacyStarshipSize = {
		tier: 2,
		hullDice: "d6",
		hullDiceStart: 3,
		hullDiceUsed: 0,
		shldDice: "d6",
		shldDiceStart: 3,
		shldDiceUsed: 0,
		modBaseCap: 20,
		modMaxSuitesBase: 0,
		modMaxSuitesMult: 1
	};
	const pools = deriveStarshipPools(actor);
	assert.equal(pools.tier, 2);
	assert.equal(pools.tier, getStarshipEffectiveTier(actor));
	// Small size: +1 hull/shield die per tier (Bug 9), not universal +2.
	assert.equal(pools.hull.max, 3 + (1 * 2));
	assert.equal(pools.shld.max, 3 + (1 * 2));
	assert.equal(pools.power.die, "d6");
});

test("getRollData WRAPPER is registered for Actor5e and injects details.tier only for starships", () => {
	assert.match(PREPARE, /dnd5e\.documents\.Actor5e\.prototype\.getRollData/);
	assert.match(PREPARE, /isStarshipFlagVehicle\(this\)/);
	assert.match(PREPARE, /getStarshipEffectiveTier\(this\)/);
	assert.match(PREPARE, /rollData\.details\.tier/);
	assert.match(PREPARE, /WRAPPER/);
	assert.match(PREPARE, /liveActor\._preparationWarnings/);
	assert.doesNotMatch(PREPARE, /system\.details\.tier\s*=/);
	assert.doesNotMatch(PREPARE, /actor\.update/);
});

test("inject preserves sibling details properties (logic unit)", () => {
	const rollData = { details: { biography: { value: "x" }, type: "space", role: "Warship" }, name: "Ship" };
	if ( rollData.details == null || typeof rollData.details !== "object" || Array.isArray(rollData.details) ) {
		rollData.details = {};
	}
	const beforeRef = rollData.details;
	rollData.details.tier = 3;
	assert.equal(rollData.details, beforeRef);
	assert.equal(rollData.details.biography.value, "x");
	assert.equal(rollData.details.type, "space");
	assert.equal(rollData.details.role, "Warship");
	assert.equal(rollData.details.tier, 3);
	assert.equal(rollData.name, "Ship");
});

test("isStarshipFlagVehicle gates ordinary vehicles", () => {
	assert.equal(isStarshipFlagVehicle({ type: "vehicle", flags: {} }), false);
	assert.equal(isStarshipFlagVehicle({ type: "character", flags: { sw5e: { legacyStarshipActor: { type: "starship" } } } }), false);
	assert.equal(isStarshipFlagVehicle(starshipActor({ tier: 1 })), true);
});

test("formula evaluation against injected details.tier", () => {
	const tier = 3;
	const data = { details: { type: "space", tier } };
	const replace = (formula) => String(formula).replace(/@([a-z.0-9_-]+)/gi, (match, term) => {
		const value = term.split(".").reduce((o, k) => (o == null ? undefined : o[k]), data);
		if ( value == null ) return "0";
		return String(value).trim();
	});
	assert.equal(replace("@details.tier"), "3");
	assert.equal(replace("2*@details.tier"), "2*3");
	assert.equal(replace("(@details.tier)"), "(3)");
	assert.equal(replace("@details.tier*2"), "3*2");
	// eslint-disable-next-line no-new-func
	assert.equal(Function(`"use strict"; return (${replace("2*@details.tier")});`)(), 6);
	assert.equal(Function(`"use strict"; return (${replace("@details.tier*3")});`)(), 9);
});

test("Drake's Shipyard source census: uses.max @details.tier family matches disposition totals", () => {
	const files = fs.readdirSync(SHIPYARD).filter(f => f.endsWith(".yml"));
	assert.equal(files.length, 87);
	let actorsWith = 0;
	let hits = 0;
	for ( const file of files ) {
		const doc = yaml.load(fs.readFileSync(path.join(SHIPYARD, file), "utf8"));
		let hit = false;
		for ( const item of doc.items ?? [] ) {
			const max = item?.system?.uses?.max;
			if ( typeof max === "string" && max.includes("@details.tier") ) {
				hits += 1;
				hit = true;
			}
		}
		if ( hit ) actorsWith += 1;
	}
	// After disposition: Hold Together no longer has limited uses (−5),
	// Pinpoint/Evasive incomplete embeds restored (+25/+6) → 60 − 5 + 31 = 86.
	assert.equal(actorsWith, 64);
	assert.equal(hits, 86);
});

console.log(`\n${passed} passed`);
