#!/usr/bin/env node
/**
 * Offline tests for installed chassis mod effect aggregation.
 * Mirrors scripts/installed-mod-effects.mjs host rules and change collection.
 */
import {
	getInstalledChassisModEffectChanges,
	isChassisHostItemActive,
	INSTALLED_MOD_SUPPORTED_BONUS_KEYS
} from "../scripts/installed-mod-effects.mjs";

function assert(cond, msg) {
	if ( !cond ) throw new Error(msg);
}

function simplifyBonus(value) {
	if ( value == null || value === "" ) return 0;
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

function sumInstalledBonus(actor, effectKey) {
	let total = 0;
	for ( const change of getInstalledChassisModEffectChanges(actor) ) {
		if ( change.key !== effectKey ) continue;
		total += simplifyBonus(change.value);
	}
	return total;
}

function makeHost({
	id = "host1",
	name = "Focus Generator (Fine)",
	equipped = true,
	attuned = true,
	attunement = "required",
	enabled = true,
	installedMods = []
} = {}) {
	return {
		id,
		name,
		type: "equipment",
		parent: { id: "actor1" },
		system: { equipped, attuned, attunement },
		flags: {
			sw5e: {
				chassis: {
					enabled,
					installedMods
				}
			}
		}
	};
}

function makeModEntry({
	uuid = "mod-uuid-1",
	name = "Channeling Amplifier (Dueling)",
	mpak = "2",
	disabled = false
} = {}) {
	return {
		uuid,
		snapshot: {
			name,
			effects: [{
				name: `${name} - Power Attack`,
				disabled,
				changes: [{
					key: "system.bonuses.mpak.attack",
					mode: 2,
					value: mpak,
					priority: 20
				}]
			}]
		}
	};
}

function makeSaveModEntry({ uuid = "mod-save-1", str = "2", con = "2" } = {}) {
	return {
		uuid,
		snapshot: {
			name: "Fadecasting Channel (Dueling)",
			effects: [{
				name: "Fadecasting Channel (Dueling) - Save Target DC",
				disabled: false,
				changes: [
					{ key: "system.bonuses.force.save.str.dc", mode: 2, value: str, priority: 20 },
					{ key: "system.bonuses.force.save.con.dc", mode: 2, value: con, priority: 20 }
				]
			}]
		}
	};
}

function makeActor(hosts, looseMods = []) {
	const items = [...hosts, ...looseMods];
	return { id: "actor1", items };
}

let n = 0;
function test(name, fn) { fn(); console.log("  OK", name); n++; }

console.log("installed mod effect aggregation tests\n");

test("active host with installed mod contributes mpak.attack", () => {
	const host = makeHost({ installedMods: [makeModEntry()] });
	const actor = makeActor([host]);
	assert(isChassisHostItemActive(host), "host active");
	assert(sumInstalledBonus(actor, "system.bonuses.mpak.attack") === 2, "mpak +2");
});

test("loose inventory mod item is not counted", () => {
	const host = makeHost({ installedMods: [makeModEntry()] });
	const loose = {
		id: "loose1",
		type: "loot",
		parent: { id: "actor1" },
		effects: [{ disabled: false, changes: [{ key: "system.bonuses.mpak.attack", mode: 2, value: "99" }] }]
	};
	const actor = makeActor([host], [loose]);
	assert(sumInstalledBonus(actor, "system.bonuses.mpak.attack") === 2, "only installed");
});

test("unequipped host suppresses bonuses", () => {
	const host = makeHost({ equipped: false, installedMods: [makeModEntry()] });
	const actor = makeActor([host]);
	assert(!isChassisHostItemActive(host), "inactive unequipped");
	assert(sumInstalledBonus(actor, "system.bonuses.mpak.attack") === 0, "no bonus");
});

test("unattuned required-attunement host suppresses bonuses", () => {
	const host = makeHost({ attuned: false, installedMods: [makeModEntry()] });
	const actor = makeActor([host]);
	assert(!isChassisHostItemActive(host), "inactive unattuned");
	assert(sumInstalledBonus(actor, "system.bonuses.mpak.attack") === 0, "no bonus");
});

test("disabled effect is ignored", () => {
	const entry = makeModEntry();
	entry.snapshot.effects[0].disabled = true;
	const host = makeHost({ installedMods: [entry] });
	const actor = makeActor([host]);
	assert(sumInstalledBonus(actor, "system.bonuses.mpak.attack") === 0, "disabled");
});

test("unsupported key is ignored", () => {
	const host = makeHost({
		installedMods: [{
			uuid: "x",
			snapshot: {
				name: "Bad",
				effects: [{ disabled: false, changes: [{ key: "system.bonuses.mwak.attack", mode: 2, value: "5" }] }]
			}
		}]
	});
	const actor = makeActor([host]);
	assert(sumInstalledBonus(actor, "system.bonuses.mwak.attack") === 0, "unsupported");
	assert(!INSTALLED_MOD_SUPPORTED_BONUS_KEYS.has("system.bonuses.mwak.attack"), "key not supported");
});

test("save-target DC keys aggregate", () => {
	const host = makeHost({ installedMods: [makeSaveModEntry()] });
	const actor = makeActor([host]);
	assert(sumInstalledBonus(actor, "system.bonuses.force.save.str.dc") === 2, "str");
	assert(sumInstalledBonus(actor, "system.bonuses.force.save.con.dc") === 2, "con");
	assert(sumInstalledBonus(actor, "system.bonuses.force.save.dex.dc") === 0, "dex unchanged");
});

test("chassis disabled host contributes nothing", () => {
	const host = makeHost({ enabled: false, installedMods: [makeModEntry()] });
	const actor = makeActor([host]);
	assert(sumInstalledBonus(actor, "system.bonuses.mpak.attack") === 0, "chassis off");
});

test("rpak key from rangefinder mod", () => {
	const host = makeHost({
		installedMods: [{
			uuid: "rf",
			snapshot: {
				name: "Channeling Rangefinder (Dueling)",
				effects: [{
					disabled: false,
					changes: [{ key: "system.bonuses.rpak.attack", mode: 2, value: "2", priority: 20 }]
				}]
			}
		}]
	});
	const actor = makeActor([host]);
	assert(sumInstalledBonus(actor, "system.bonuses.rpak.attack") === 2, "rpak");
	assert(sumInstalledBonus(actor, "system.bonuses.mpak.attack") === 0, "no mpak");
});

console.log(`\n${n} passed`);
