#!/usr/bin/env node
/**
 * Each Commando has one IWS weapon and one Dexterity 1d8 + @mod energy activity.
 * Hidden Blade and the IWS trait stay in place.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import yaml from "js-yaml";

const files = [
	"packs/_source/snv-monsters/humanoid/commando.yml",
	"packs/_source/snv-monsters/humanoid/commando-demolitions.yml",
	"packs/_source/snv-monsters/humanoid/commando-slicer.yml",
	"packs/_source/snv-monsters/humanoid/commando-sniper.yml"
];

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

for (const file of files) {
	test(file, () => {
		const doc = yaml.load(fs.readFileSync(file, "utf8"));
		const items = doc.items;
		const ids = items.map(item => item._id);
		assert.equal(new Set(ids).size, ids.length, "item ids");
		const iwsWeapons = items.filter(item => item.type === "weapon" && /^IWS/.test(item.name ?? ""));
		assert.equal(iwsWeapons.length, 1);
		assert.equal(iwsWeapons[0].name, "IWS");
		assert.equal(iwsWeapons[0].system.ability, "dex");
		assert.equal(items.filter(item => item.name === "Hidden Blade").length, 1);
		assert.equal(items.filter(item => item.name === "IWS" && item.type === "feat").length, 1);
		assert.equal(items.some(item => item.name === "IWS Sniper Mode"), false);
		assert.equal(items.some(item => item.name === "IWS Antiarmor Mode (6/Day)"), false);
		const activities = Object.values(iwsWeapons[0].system.activities);
		const activityIds = activities.map(activity => activity._id);
		assert.equal(new Set(activityIds).size, activityIds.length);
		const blaster = activities.find(activity => activity.name === "Blaster Mode");
		assert.ok(blaster);
		assert.equal(blaster.attack.ability, "dex");
		assert.equal(blaster.damage.parts.length, 1);
		assert.equal(blaster.damage.parts[0].number, 1);
		assert.equal(blaster.damage.parts[0].denomination, 8);
		assert.equal(blaster.damage.parts[0].bonus, "@mod");
		assert.deepEqual(blaster.damage.parts[0].types, ["energy"]);
		assert.equal(activities.filter(activity => activity.damage?.parts?.[0]?.bonus === "@mod" && activity.damage.parts[0].denomination === 8).length, 1);
	});
}

console.log(`\n${passed} passed`);
