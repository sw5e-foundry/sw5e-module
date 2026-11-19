#!/usr/bin/env node
/**
 * Offline tests for Bug 9 / Phase 2A — size-aware Hull/Shield die progression.
 */
import assert from "node:assert/strict";
import {
	deriveStarshipPools,
	getStarshipHullShieldDicePerTierGain
} from "../scripts/starship-data.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

/** RAW size profiles: die + tier-0 start (must be preserved). */
const SIZE_PROFILES = {
	tiny: { hullDice: "d4", hullDiceStart: 1, shldDice: "d4", shldDiceStart: 1 },
	small: { hullDice: "d6", hullDiceStart: 3, shldDice: "d6", shldDiceStart: 3 },
	medium: { hullDice: "d8", hullDiceStart: 5, shldDice: "d8", shldDiceStart: 5 },
	large: { hullDice: "d10", hullDiceStart: 7, shldDice: "d10", shldDiceStart: 7 },
	huge: { hullDice: "d12", hullDiceStart: 9, shldDice: "d12", shldDiceStart: 9 },
	gargantuan: { hullDice: "d20", hullDiceStart: 11, shldDice: "d20", shldDiceStart: 11 }
};

const ACTOR_SIZE = {
	tiny: "tiny",
	small: "sm",
	medium: "med",
	large: "lg",
	huge: "huge",
	gargantuan: "grg"
};

function expectedGain(sizeId) {
	return sizeId === "huge" || sizeId === "gargantuan" ? 2 : 1;
}

function makeStarship({
	sizeId="small",
	tier=0,
	hullDiceUsed=0,
	shldDiceUsed=0,
	identifier,
	includeSizeItem=true,
	extraLegacy={}
}={}) {
	const profile = SIZE_PROFILES[sizeId] ?? {
		hullDice: "d8",
		hullDiceStart: 4,
		shldDice: "d8",
		shldDiceStart: 4
	};
	const id = identifier ?? sizeId;
	const sizeItem = includeSizeItem
		? {
			_id: "size1",
			id: "size1",
			type: "feat",
			flags: {
				sw5e: {
					legacyStarshipSize: {
						tier,
						hullDice: profile.hullDice,
						hullDiceStart: profile.hullDiceStart,
						hullDiceUsed,
						shldDice: profile.shldDice,
						shldDiceStart: profile.shldDiceStart,
						shldDiceUsed,
						modBaseCap: 20,
						modMaxSuitesBase: 0,
						modMaxSuitesMult: 1,
						...extraLegacy
					}
				}
			},
			system: { identifier: id, advancement: [] }
		}
		: null;
	const items = sizeItem ? [sizeItem] : [];
	return {
		type: "vehicle",
		flags: {
			sw5e: {
				legacyStarshipActor: {
					type: "starship",
					system: { details: { tier } }
				}
			}
		},
		system: {
			abilities: { con: { value: 10 } },
			traits: { size: ACTOR_SIZE[sizeId] ?? "med" }
		},
		_source: { system: {}, items },
		items: { contents: items }
	};
}

test("per-tier gain helper: Tiny–Large → 1; Huge/Gargantuan → 2; unknown → 1", () => {
	for ( const id of ["tiny", "small", "medium", "large"] ) {
		assert.equal(getStarshipHullShieldDicePerTierGain(id), 1, id);
	}
	assert.equal(getStarshipHullShieldDicePerTierGain("huge"), 2);
	assert.equal(getStarshipHullShieldDicePerTierGain("gargantuan"), 2);
	assert.equal(getStarshipHullShieldDicePerTierGain("colossal"), 1);
	assert.equal(getStarshipHullShieldDicePerTierGain(""), 1);
	assert.equal(getStarshipHullShieldDicePerTierGain(undefined), 1);
	assert.equal(getStarshipHullShieldDicePerTierGain("HUGE"), 2);
});

for ( const sizeId of Object.keys(SIZE_PROFILES) ) {
	const profile = SIZE_PROFILES[sizeId];
	const gain = expectedGain(sizeId);
	for ( const tier of [0, 1, 5] ) {
		test(`${sizeId} tier ${tier}: max = start + ${gain}*tier (hull+shield)`, () => {
			const actor = makeStarship({ sizeId, tier });
			const pools = deriveStarshipPools(actor);
			const expectedMax = profile.hullDiceStart + (gain * tier);
			assert.equal(pools.tier, tier);
			assert.equal(pools.hull.die, profile.hullDice);
			assert.equal(pools.shld.die, profile.shldDice);
			assert.equal(pools.hull.max, expectedMax);
			assert.equal(pools.shld.max, expectedMax);
			assert.equal(pools.hull.current, expectedMax);
			assert.equal(pools.shld.current, expectedMax);
		});
	}
}

test("unknown homebrew size identifier defaults to gain 1", () => {
	const actor = makeStarship({
		sizeId: "medium",
		tier: 3,
		identifier: "colossal-homebrew"
	});
	// Override starts so we are not reading medium profile identity for gain — identifier drives gain.
	actor.items.contents[0].system.identifier = "colossal-homebrew";
	actor.items.contents[0].flags.sw5e.legacyStarshipSize.hullDiceStart = 4;
	actor.items.contents[0].flags.sw5e.legacyStarshipSize.shldDiceStart = 4;
	const pools = deriveStarshipPools(actor);
	assert.equal(pools.hull.max, 4 + (1 * 3));
	assert.equal(pools.shld.max, 4 + (1 * 3));
});

test("missing size item: actor traits.size maps to profile + gain", () => {
	const actor = makeStarship({ sizeId: "huge", tier: 2, includeSizeItem: false });
	actor.system.traits.size = "huge";
	const pools = deriveStarshipPools(actor);
	// Profile fallback supplies huge start 9; gain 2 × tier 2.
	assert.equal(pools.hull.die, "d12");
	assert.equal(pools.hull.max, 9 + (2 * 2));
	assert.equal(pools.shld.max, 9 + (2 * 2));
});

test("missing size + unknown traits.size defaults gain 1 (soft-safe)", () => {
	const actor = makeStarship({ sizeId: "small", tier: 4, includeSizeItem: false });
	actor.system.traits.size = "unknown-size-key";
	const pools = deriveStarshipPools(actor);
	assert.equal(pools.hull.max, 0 + (1 * 4));
	assert.equal(pools.shld.max, 0 + (1 * 4));
});

test("die denomination and tier-0 starts preserved; used not rewritten by derivation", () => {
	const actor = makeStarship({
		sizeId: "large",
		tier: 2,
		hullDiceUsed: 3,
		shldDiceUsed: 1
	});
	const beforeUsed = {
		hull: actor.items.contents[0].flags.sw5e.legacyStarshipSize.hullDiceUsed,
		shld: actor.items.contents[0].flags.sw5e.legacyStarshipSize.shldDiceUsed
	};
	const pools = deriveStarshipPools(actor);
	assert.equal(pools.hull.die, "d10");
	assert.equal(pools.shld.die, "d10");
	assert.equal(pools.hull.max, 7 + (1 * 2)); // 9
	assert.equal(pools.shld.max, 9);
	assert.equal(pools.hull.current, 9 - 3);
	assert.equal(pools.shld.current, 9 - 1);
	assert.equal(
		actor.items.contents[0].flags.sw5e.legacyStarshipSize.hullDiceUsed,
		beforeUsed.hull
	);
	assert.equal(
		actor.items.contents[0].flags.sw5e.legacyStarshipSize.shldDiceUsed,
		beforeUsed.shld
	);
});

test("non-Starship character: pure derivation; tier 0 so gain band does not invent dice", () => {
	const character = {
		type: "character",
		flags: { sw5e: {} },
		system: { abilities: { con: { value: 14 } }, traits: { size: "med" } },
		_source: { system: {}, items: [] },
		items: { contents: [] }
	};
	const pools = deriveStarshipPools(character);
	// Profile fallback may supply medium starts; effective tier is 0 → no per-tier dice added.
	assert.equal(pools.tier, 0);
	assert.equal(pools.hull.max, pools.hull.die ? 5 : 0);
	assert.equal(pools.shld.max, pools.hull.max);
	assert.equal(pools.hull.current, pools.hull.max);
});

test("ordinary vehicle without starship flag: tier 0; no per-tier inflation", () => {
	const vehicle = {
		type: "vehicle",
		flags: { sw5e: {} },
		system: { abilities: { con: { value: 10 } }, traits: { size: "lg" } },
		_source: { system: {}, items: [] },
		items: { contents: [] }
	};
	const pools = deriveStarshipPools(vehicle);
	assert.equal(pools.tier, 0);
	assert.equal(pools.hull.max, 7); // large profile start only
	assert.equal(pools.shld.max, 7);
});

test("compendium identifiers *-starship use the same gain as the size profile", () => {
	for ( const sizeId of ["huge", "gargantuan"] ) {
		const actor = makeStarship({ sizeId, tier: 1, identifier: `${sizeId}-starship` });
		const pools = deriveStarshipPools(actor);
		const expected = SIZE_PROFILES[sizeId].hullDiceStart + 2;
		assert.equal(pools.hull.die, SIZE_PROFILES[sizeId].hullDice, sizeId);
		assert.equal(pools.hull.max, expected, sizeId);
		assert.equal(pools.shld.max, expected, sizeId);
	}
	const medium = makeStarship({ sizeId: "medium", tier: 1, identifier: "medium-starship" });
	const pools = deriveStarshipPools(medium);
	assert.equal(pools.hull.die, "d8");
	assert.equal(pools.hull.max, 5 + 1);
	assert.equal(pools.shld.max, 6);
});

test("Tiny–Large no longer use universal 2×tier (regression)", () => {
	const actor = makeStarship({ sizeId: "small", tier: 2 });
	const pools = deriveStarshipPools(actor);
	assert.notEqual(pools.hull.max, 3 + (2 * 2));
	assert.equal(pools.hull.max, 3 + (1 * 2));
});

console.log(`\n${passed} passed`);
