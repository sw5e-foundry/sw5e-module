#!/usr/bin/env node
/**
 * Compile a throwaway pack outside the module's LevelDB directory and check
 * that cleanPackEntry rewrites only custom-mode DAE bonus values.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "js-yaml";
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";
import { cleanPackEntry } from "./packs.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "sw5e-bonus-pack-"));
const src = path.join(root, "src");
const db = path.join(root, "db");
const out = path.join(root, "out");
fs.mkdirSync(src);

const fixture = {
	_id: "bonusprobe0000001",
	_key: "!items!bonusprobe0000001",
	name: "Bonus Probe",
	type: "feat",
	effects: [{
		_id: "bonusprobeeffect1",
		_key: "!items.effects!bonusprobe0000001.bonusprobeeffect1",
		name: "Bonus Probe Effect",
		disabled: false,
		transfer: true,
		changes: [
			{ key: "system.bonuses.rwak.attack", mode: 0, value: "1", priority: 20 },
			{ key: "system.bonuses.rwak.attack", mode: 0, value: 0, priority: 20 },
			{ key: "system.bonuses.rwak.attack", mode: 0, value: -2, priority: 20 },
			{ key: "system.bonuses.mwak.damage", mode: 2, value: "1", priority: 20 },
			{ key: "system.bonuses.mwak.damage", type: "custom", value: "@scale.berserker.rage-damage", priority: 20 },
			{ key: "system.details.role", mode: 2, value: "Strike Fighter", priority: 20 }
		]
	}]
};
fs.writeFileSync(path.join(src, "bonus-probe.yml"), YAML.dump(fixture));

await compilePack(src, db, { yaml: true, log: false, transformEntry: cleanPackEntry });
await extractPack(db, out, { yaml: true, log: false });

const extractedPath = fs.readdirSync(out).find(name => name.endsWith(".yml") || name.endsWith(".yaml") || name.endsWith(".json"));
assert.ok(extractedPath, `extracted file missing in ${out}: ${fs.readdirSync(out).join(", ")}`);
const extracted = extractedPath.endsWith(".json")
	? JSON.parse(fs.readFileSync(path.join(out, extractedPath), "utf8"))
	: YAML.load(fs.readFileSync(path.join(out, extractedPath), "utf8"));
const changes = extracted.effects[0].changes;
const byKey = (key, value) => changes.find(change => change.key === key && change.value === value)
	?? changes.filter(change => change.key === key);

assert.deepEqual(changes.filter(change => change.key === "system.bonuses.rwak.attack").map(change => change.value), ["+1", "+0", "-2+0"]);
assert.equal(changes.find(change => change.key === "system.bonuses.mwak.damage" && change.mode === 2)?.value, "1");
assert.equal(changes.find(change => change.value === "@scale.berserker.rage-damage")?.value, "@scale.berserker.rage-damage");
assert.equal(changes.find(change => change.key === "system.details.role")?.value, "Strike Fighter");

const db2 = path.join(root, "db2");
const out2 = path.join(root, "out2");
await compilePack(out, db2, { yaml: true, log: false, transformEntry: cleanPackEntry });
await extractPack(db2, out2, { yaml: true, log: false });
const extractedPath2 = fs.readdirSync(out2).find(name => name.endsWith(".yml") || name.endsWith(".yaml") || name.endsWith(".json"));
const extracted2 = extractedPath2.endsWith(".json")
	? JSON.parse(fs.readFileSync(path.join(out2, extractedPath2), "utf8"))
	: YAML.load(fs.readFileSync(path.join(out2, extractedPath2), "utf8"));
assert.deepEqual(
	extracted2.effects[0].changes.filter(change => change.key === "system.bonuses.rwak.attack").map(change => change.value),
	["+1", "+0", "-2+0"]
);

const summaryPath = path.join(root, "summary.json");
fs.writeFileSync(summaryPath, JSON.stringify({ root, extracted, changes: extracted.effects[0].changes }, null, 2));
console.log(`ok - isolated pack compile ${root}`);
console.log(summaryPath);
void byKey;
