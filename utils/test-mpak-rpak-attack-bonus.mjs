#!/usr/bin/env node
/**
 * Offline verification of mpak/rpak power attack bonus consumption
 * (mirrors scripts/patch/power-bonuses.mjs).
 */
function simplifyBonus(value) {
	if ( value == null || value === "" ) return 0;
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

function readBonus(bonuses, bonusPath) {
	return simplifyBonus(bonusPath.split(".").reduce((o, k) => o?.[k], bonuses));
}

function isPowerCastingItem(item) {
	return item?.type === "spell" && item?.system?.method === "powerCasting";
}

function getPowerCastType(item) {
	return item?.system?.school === "tec" ? "tech" : "force";
}

function getLegacyPowerAttackType(attackMode) {
	if ( attackMode?.startsWith?.("ranged") || attackMode === "thrown" ) return "rpak";
	if ( attackMode?.startsWith?.("melee") || !attackMode ) return "mpak";
	return null;
}

function getPowerAttackBonus(actor, item, { attackMode } = {}) {
	if ( !actor || !isPowerCastingItem(item) ) return 0;
	const bonuses = actor.system?.bonuses ?? {};
	const castType = getPowerCastType(item);
	const school = item.system.school;
	let total = 0;
	if ( castType === "force" ) {
		total += readBonus(bonuses, "force.attack");
		if ( school === "lgt" ) total += readBonus(bonuses, "force.light.attack");
		if ( school === "drk" ) total += readBonus(bonuses, "force.dark.attack");
	} else {
		total += readBonus(bonuses, "tech.attack");
	}
	const legacyType = getLegacyPowerAttackType(attackMode);
	if ( legacyType ) total += readBonus(bonuses, `${legacyType}.attack`);
	return total;
}

function getWeaponAttackBonus(actor) {
	const bonuses = actor.system?.bonuses ?? {};
	return readBonus(bonuses, "mwak.attack") + readBonus(bonuses, "rwak.attack");
}

function assert(cond, msg) {
	if ( !cond ) throw new Error(msg);
}

const actor = {
	system: {
		bonuses: {
			mpak: { attack: 2 },
			rpak: { attack: -1 },
			force: { attack: 5 },
			tech: { attack: 3 },
			mwak: { attack: 99 }
		}
	}
};

const forcePower = { type: "spell", system: { method: "powerCasting", school: "uni" } };
const techPower = { type: "spell", system: { method: "powerCasting", school: "tec" } };
const weapon = { type: "weapon", system: {} };

let n = 0;
function test(name, fn) { fn(); console.log("  OK", name); n++; }

console.log("mpak/rpak attack bonus tests\n");

test("mpak applies to melee force power only (+2 mpak, not on ranged)", () => {
	assert(getPowerAttackBonus(actor, forcePower, { attackMode: "melee" }) === 5 + 2, "melee force");
	assert(getPowerAttackBonus(actor, forcePower, { attackMode: "ranged" }) === 5 - 1, "ranged force");
});

test("mpak/rpak apply to melee/ranged tech powers (not tech.attack for split)", () => {
	assert(getPowerAttackBonus(actor, techPower, { attackMode: "melee" }) === 3 + 2, "melee tech");
	assert(getPowerAttackBonus(actor, techPower, { attackMode: "ranged" }) === 3 - 1, "ranged tech");
});

test("force.attack is school-wide on force powers", () => {
	const a = { system: { bonuses: { force: { attack: 4 }, mpak: { attack: 0 }, rpak: { attack: 0 } } } };
	assert(getPowerAttackBonus(a, forcePower, { attackMode: "melee" }) === 4, "melee");
	assert(getPowerAttackBonus(a, forcePower, { attackMode: "ranged" }) === 4, "ranged");
});

test("mpak/rpak do not affect weapon attacks", () => {
	assert(getWeaponAttackBonus(actor) === 99, "weapon uses mwak not mpak");
	assert(getPowerAttackBonus(actor, weapon, { attackMode: "melee" }) === 0, "not power item");
});

test("Channeling Training pattern: mpak +1 rpak -1 on force melee/ranged", () => {
	const a = { system: { bonuses: { mpak: { attack: 1 }, rpak: { attack: -1 } } } };
	assert(getPowerAttackBonus(a, forcePower, { attackMode: "melee" }) === 1, "training melee");
	assert(getPowerAttackBonus(a, forcePower, { attackMode: "ranged" }) === -1, "training ranged");
});

test("tech.attack alone affects all tech power attack modes (why not for split mods)", () => {
	const a = { system: { bonuses: { tech: { attack: 2 } } } };
	assert(getPowerAttackBonus(a, techPower, { attackMode: "melee" }) === 2, "tech melee");
	assert(getPowerAttackBonus(a, techPower, { attackMode: "ranged" }) === 2, "tech ranged — wrong for dueling");
});

console.log(`\n${n} passed`);
