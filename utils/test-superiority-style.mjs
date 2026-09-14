/**
 * Offline tests for Bug 18 Superiority Style grant, denomination, and recovery predicate.
 */
import assert from "node:assert/strict";
import {
	SUPERIORITY_STYLE_IMPORTER_UID,
	SUPERIORITY_STYLE_PACK_ID,
	getActorCharacterLevel,
	getSuperiorityStyleDieForCharacterLevel,
	getSuperiorityStylePoolGrant,
	hasSuperiorityStyleGrant,
	isSuperiorityStyleGrantItem,
	mergeSuperiorityDieDenomination,
	resolveSuperiorityStyleDie,
	shouldRecoverSuperiorityDice,
	sourceIdReferencesSuperiorityStylePack
} from "../scripts/superiority-style.mjs";
import {
	resolveSuperiorityDiceMax,
	sumSuperiorityDiceMaxAdditions,
	SUPERIORITY_DICE_MAX_EFFECT_KEY,
	SUPERIORITY_DICE_MAX_ADD_TYPE
} from "../scripts/patch/maneuver.mjs";

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function styleItem(overrides = {}) {
	return {
		disabled: false,
		flags: {
			"sw5e-importer": { uid: SUPERIORITY_STYLE_IMPORTER_UID }
		},
		...overrides
	};
}

function actorWithItems(items, extras = {}) {
	return {
		items,
		itemTypes: { class: extras.classes ?? [] },
		system: {
			details: { level: extras.level ?? null },
			superiority: extras.superiority ?? { dice: { max: 0, value: 0 }, die: 0, level: 0 }
		},
		...extras
	};
}

// --- Detection ---
check("importer UID match", () => {
	assert.equal(isSuperiorityStyleGrantItem(styleItem()), true);
});

check("pack/source ID match via compendiumSource", () => {
	assert.equal(isSuperiorityStyleGrantItem({
		flags: {},
		_stats: { compendiumSource: `Compendium.sw5e-module.customization-options.Item.${SUPERIORITY_STYLE_PACK_ID}` }
	}), true);
});

check("sourceId helper recognizes pack id forms", () => {
	assert.equal(sourceIdReferencesSuperiorityStylePack(SUPERIORITY_STYLE_PACK_ID), true);
	assert.equal(sourceIdReferencesSuperiorityStylePack(`Compendium.x.y.Item.${SUPERIORITY_STYLE_PACK_ID}`), true);
	assert.equal(sourceIdReferencesSuperiorityStylePack("Compendium.x.y.Item.other"), false);
});

check("homebrew flag match", () => {
	assert.equal(isSuperiorityStyleGrantItem({
		flags: { sw5e: { superiorityStyleGrant: true } }
	}), true);
});

check("name-only non-match", () => {
	assert.equal(isSuperiorityStyleGrantItem({
		name: "Superiority Style",
		flags: {}
	}), false);
});

check("generic fighting-style subtype non-match", () => {
	assert.equal(isSuperiorityStyleGrantItem({
		flags: {},
		system: { type: { value: "customizationOption", subtype: "fightingStyle" } }
	}), false);
});

check("unrelated Item non-match", () => {
	assert.equal(isSuperiorityStyleGrantItem({
		flags: { "sw5e-importer": { uid: "FightingStyle.name-duelist_style" } }
	}), false);
});

check("disabled Item non-match", () => {
	assert.equal(isSuperiorityStyleGrantItem(styleItem({ disabled: true })), false);
});

check("duplicate matching Items grant once", () => {
	const actor = actorWithItems([styleItem(), styleItem({ id: "copy2" })]);
	assert.equal(hasSuperiorityStyleGrant(actor), true);
	assert.equal(getSuperiorityStylePoolGrant(actor), 1);
});

check("no owned Style → no grant", () => {
	const actor = actorWithItems([{ flags: {}, name: "Feat" }]);
	assert.equal(hasSuperiorityStyleGrant(actor), false);
	assert.equal(getSuperiorityStylePoolGrant(actor), 0);
});

// --- Character-level denomination ---
check("Style die curve 1–20", () => {
	const cases = [
		[1, 4], [4, 4], [5, 6], [8, 6], [9, 8], [12, 8], [13, 10], [16, 10], [17, 12], [20, 12]
	];
	for ( const [level, die] of cases ) {
		assert.equal(getSuperiorityStyleDieForCharacterLevel(level), die, `level ${level}`);
	}
});

check("multiclass total level 4 → d4", () => {
	const actor = actorWithItems([styleItem()], {
		level: 4,
		classes: [{ system: { levels: 3 } }, { system: { levels: 1 } }]
	});
	assert.equal(getActorCharacterLevel(actor), 4);
	assert.equal(resolveSuperiorityStyleDie(actor, true), 4);
});

check("missing prepared total uses class-level sum fallback", () => {
	const actor = actorWithItems([styleItem()], {
		level: null,
		classes: [{ system: { levels: 5 } }, { system: { levels: 2 } }]
	});
	assert.equal(getActorCharacterLevel(actor), 7);
	assert.equal(resolveSuperiorityStyleDie(actor, true), 6);
});

check("malformed level with grant uses minimum Style d4", () => {
	const actor = actorWithItems([styleItem()], { level: "x", classes: [] });
	assert.equal(getActorCharacterLevel(actor), 0);
	assert.equal(resolveSuperiorityStyleDie(actor, true), 4);
});

check("no Style grant → style die 0", () => {
	assert.equal(resolveSuperiorityStyleDie(actorWithItems([]), false), 0);
	assert.equal(getSuperiorityStyleDieForCharacterLevel(0), 0);
	assert.equal(getSuperiorityStyleDieForCharacterLevel(null), 0);
});

// --- Pool assembly (with Bug 19A resolver) ---
check("Style only: 0 + 1 → 1", () => {
	assert.equal(resolveSuperiorityDiceMax({
		sourceMax: null,
		calculatedMax: 0 + 1,
		effectAdditions: 0
	}), 1);
});

check("Fighter level 1: 0 + 1 → 1", () => {
	assert.equal(resolveSuperiorityDiceMax({
		sourceMax: null,
		calculatedMax: 0 + getSuperiorityStylePoolGrant(actorWithItems([styleItem()])),
		effectAdditions: 0
	}), 1);
});

check("class pool 3 + Style → 4", () => {
	assert.equal(resolveSuperiorityDiceMax({
		sourceMax: null,
		calculatedMax: 3 + 1,
		effectAdditions: 0
	}), 4);
});

check("class pool 9 + Style → 10", () => {
	assert.equal(resolveSuperiorityDiceMax({
		sourceMax: null,
		calculatedMax: 9 + 1,
		effectAdditions: 0
	}), 10);
});

check("duplicate Style still +1 in calculated", () => {
	const grant = getSuperiorityStylePoolGrant(actorWithItems([styleItem(), styleItem()]));
	assert.equal(grant, 1);
	assert.equal(resolveSuperiorityDiceMax({ sourceMax: null, calculatedMax: 3 + grant, effectAdditions: 0 }), 4);
});

check("foreign ADD +1 plus Style with source null", () => {
	const additions = sumSuperiorityDiceMaxAdditions([{
		disabled: false,
		changes: [{ key: SUPERIORITY_DICE_MAX_EFFECT_KEY, type: SUPERIORITY_DICE_MAX_ADD_TYPE, value: "1" }]
	}]);
	assert.equal(resolveSuperiorityDiceMax({
		sourceMax: null,
		calculatedMax: 3 + 1,
		effectAdditions: additions
	}), 5);
});

check("explicit source max 0 → 0", () => {
	assert.equal(resolveSuperiorityDiceMax({
		sourceMax: 0,
		calculatedMax: 3 + 1,
		effectAdditions: 1
	}), 0);
});

check("explicit source max positive → explicit value", () => {
	assert.equal(resolveSuperiorityDiceMax({
		sourceMax: 7,
		calculatedMax: 3 + 1,
		effectAdditions: 1
	}), 7);
});

// --- Denomination merge ---
check("class die 0 + Style d4 → d4", () => {
	assert.equal(mergeSuperiorityDieDenomination({
		classDie: 0, styleDie: 4, hasStyleGrant: true
	}), 4);
});

check("class d6 + Style d4 → d6", () => {
	assert.equal(mergeSuperiorityDieDenomination({
		classDie: 6, styleDie: 4, hasStyleGrant: true
	}), 6);
});

check("class d6 + Style d8 → d8", () => {
	assert.equal(mergeSuperiorityDieDenomination({
		classDie: 6, styleDie: 8, hasStyleGrant: true
	}), 8);
});

check("class d10 + Style d10 → d10", () => {
	assert.equal(mergeSuperiorityDieDenomination({
		classDie: 10, styleDie: 10, hasStyleGrant: true
	}), 10);
});

check("explicit source denomination remains authoritative", () => {
	assert.equal(mergeSuperiorityDieDenomination({
		sourceDie: 8, classDie: 6, styleDie: 4, hasStyleGrant: true
	}), 8);
});

check("no Style grant keeps class die", () => {
	assert.equal(mergeSuperiorityDieDenomination({
		classDie: 6, styleDie: 12, hasStyleGrant: false
	}), 6);
});

// --- Idempotence ---
check("idempotent grant + die + pool assembly", () => {
	const actor = actorWithItems([styleItem()], { level: 1 });
	const a1 = getSuperiorityStylePoolGrant(actor);
	const a2 = getSuperiorityStylePoolGrant(actor);
	const d1 = resolveSuperiorityStyleDie(actor);
	const d2 = resolveSuperiorityStyleDie(actor);
	const p1 = resolveSuperiorityDiceMax({ sourceMax: null, calculatedMax: 0 + a1, effectAdditions: 0 });
	const p2 = resolveSuperiorityDiceMax({ sourceMax: null, calculatedMax: 0 + a2, effectAdditions: 0 });
	assert.equal(a1, a2);
	assert.equal(d1, d2);
	assert.equal(p1, p2);
	assert.equal(p1, 1);
	assert.equal(d1, 4);
});

// --- Recovery predicate ---
check("Style-only expended pool recovery when max > 0", () => {
	assert.equal(shouldRecoverSuperiorityDice({
		system: { superiority: { dice: { max: 1, value: 0 } } }
	}), true);
});

check("zero maximum does not recover", () => {
	assert.equal(shouldRecoverSuperiorityDice({
		system: { superiority: { dice: { max: 0, value: 0 } } }
	}), false);
});

check("class-only recovery when max > 0", () => {
	assert.equal(shouldRecoverSuperiorityDice({
		system: { superiority: { dice: { max: 3, value: 1 }, level: 7 } }
	}), true);
});

check("missing superiority does not recover", () => {
	assert.equal(shouldRecoverSuperiorityDice({}), false);
});

console.log(`\n${passed} tests passed`);
