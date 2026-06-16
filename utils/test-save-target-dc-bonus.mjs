#!/usr/bin/env node
/**
 * Offline verification of save-target DC bonus consumption logic
 * (mirrors scripts/patch/power-bonuses.mjs without Foundry).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

function simplifyBonus(value) {
	if ( value == null || value === "" ) return 0;
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

function readBonus(bonuses, bonusPath) {
	return simplifyBonus(bonusPath.split(".").reduce((o, k) => o?.[k], bonuses));
}

function normalizeSaveAbilities(saveAbilities) {
	if ( !saveAbilities ) return [];
	if ( typeof saveAbilities === "string" ) return ABILITY_KEYS.includes(saveAbilities) ? [saveAbilities] : [];
	const values = typeof saveAbilities?.[Symbol.iterator] === "function"
		? [...saveAbilities]
		: Array.isArray(saveAbilities) ? saveAbilities : [];
	return values.filter(ab => ABILITY_KEYS.includes(ab));
}

function getPowerSaveTargetDcBonus(actor, castType, saveAbilities) {
	if ( !actor || (castType !== "force" && castType !== "tech") ) return 0;
	const abilities = normalizeSaveAbilities(saveAbilities);
	if ( !abilities.length ) return 0;
	const bonuses = actor.system?.bonuses ?? {};
	const values = abilities.map(ab => readBonus(bonuses, `${castType}.save.${ab}.dc`));
	return values.length ? Math.max(...values) : 0;
}

function getPowerAttackBonus(actor, item) {
	if ( item?.type !== "spell" || item?.system?.method !== "powerCasting" ) return 0;
	const bonuses = actor.system?.bonuses ?? {};
	const castType = item.system?.school === "tec" ? "tech" : "force";
	if ( castType === "force" ) return readBonus(bonuses, "force.attack");
	return readBonus(bonuses, "tech.attack");
}

function getWeaponAttackBonus(actor) {
	const bonuses = actor.system?.bonuses ?? {};
	return readBonus(bonuses, "mwak.attack") + readBonus(bonuses, "rwak.attack");
}

function applyModEffects(actor, changes) {
	const merged = structuredClone(actor.system.bonuses ?? {});
	for ( const ch of changes ) {
		const m = /^system\.bonuses\.(force|tech)\.save\.(str|dex|con|int|wis|cha)\.dc$/.exec(ch.key);
		if ( m ) {
			merged[m[1]] ??= {};
			merged[m[1]].save ??= {};
			merged[m[1]].save[m[2]] ??= {};
			merged[m[1]].save[m[2]].dc = ch.value;
		}
	}
	return { system: { bonuses: merged } };
}

function assert(cond, msg) {
	if ( !cond ) throw new Error(msg);
}

function loadMod(relPath) {
	const doc = yaml.load(fs.readFileSync(path.join(ROOT, "packs/_source", relPath), "utf8"));
	return doc.effects[0].changes;
}

let passed = 0;
function test(name, fn) {
	fn();
	console.log(`  OK ${name}`);
	passed++;
}

console.log("Save-target DC bonus tests\n");

const strConChanges = loadMod("enhanceditems/item-modifications/fadecasting-channel-dueling.yml");
const strConActor = applyModEffects({ system: { bonuses: {} } }, strConChanges);

test("STR/CON mod: +2 on STR save", () => {
	assert(getPowerSaveTargetDcBonus(strConActor, "force", "str") === 2, "expected +2 STR");
});
test("STR/CON mod: +2 on CON save", () => {
	assert(getPowerSaveTargetDcBonus(strConActor, "force", "con") === 2, "expected +2 CON");
});
test("STR/CON mod: 0 on DEX save", () => {
	assert(getPowerSaveTargetDcBonus(strConActor, "force", "dex") === 0, "expected 0 DEX");
});
test("STR/CON mod: or-save Str/Con applies once (max 2, not 4)", () => {
	assert(getPowerSaveTargetDcBonus(strConActor, "force", ["str", "con"]) === 2, "expected max 2");
});
test("STR/CON mod: no tech save-target bonus", () => {
	assert(getPowerSaveTargetDcBonus(strConActor, "tech", "str") === 0, "tech should be 0");
});

const dexIntChanges = loadMod("enhanceditems/item-modifications/rendcasting-channel-dueling.yml");
const dexIntActor = applyModEffects({ system: { bonuses: {} } }, dexIntChanges);

test("DEX/INT mod: +2 on DEX save", () => {
	assert(getPowerSaveTargetDcBonus(dexIntActor, "force", "dex") === 2, "expected +2 DEX");
});
test("DEX/INT mod: +2 on INT save", () => {
	assert(getPowerSaveTargetDcBonus(dexIntActor, "force", "int") === 2, "expected +2 INT");
});
test("DEX/INT mod: 0 on STR save", () => {
	assert(getPowerSaveTargetDcBonus(dexIntActor, "force", "str") === 0, "expected 0 STR");
});

const trainingChanges = loadMod("enhanceditems/item-modifications/fadecasting-channel-training.yml");
const trainingActor = applyModEffects({ system: { bonuses: {} } }, trainingChanges);

test("Training mod: +1 STR, -1 DEX", () => {
	assert(getPowerSaveTargetDcBonus(trainingActor, "force", "str") === 1, "STR +1");
	assert(getPowerSaveTargetDcBonus(trainingActor, "force", "dex") === -1, "DEX -1");
});

const forcePower = { type: "spell", system: { method: "powerCasting", school: "uni" } };
const techPower = { type: "spell", system: { method: "powerCasting", school: "tec" } };
const weaponCtx = { type: "weapon", system: { method: undefined } };

test("Save-target keys do not affect force power attack bonus", () => {
	assert(getPowerAttackBonus(strConActor, forcePower) === 0, "force attack should be 0");
});
test("Save-target keys do not affect tech power attack bonus", () => {
	assert(getPowerAttackBonus(strConActor, techPower) === 0, "tech attack should be 0");
});
test("Save-target keys do not affect weapon attacks", () => {
	assert(getWeaponAttackBonus(strConActor) === 0, "weapon attack should be 0");
});
test("Non-power item returns 0 attack bonus", () => {
	assert(getPowerAttackBonus(strConActor, weaponCtx) === 0, "weapon item 0");
});

console.log(`\n${passed} passed`);
