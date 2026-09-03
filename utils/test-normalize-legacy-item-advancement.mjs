#!/usr/bin/env node
/**
 * P8B-01..05 — Offline regression for normalizeLegacyItemAdvancement.
 * Pure-function coverage only; does not prove Foundry runtime advancement UI.
 */
import assert from "node:assert/strict";
import { normalizeLegacyItemAdvancement } from "../scripts/dnd5e-source-normalization.mjs";

const previousFoundry = globalThis.foundry;
let randomSeq = 0;
globalThis.foundry = {
	...(previousFoundry && typeof previousFoundry === "object" ? previousFoundry : {}),
	utils: {
		...(previousFoundry?.utils && typeof previousFoundry.utils === "object" ? previousFoundry.utils : {}),
		randomID() {
			randomSeq += 1;
			return `stubid${String(randomSeq).padStart(10, "0")}`;
		}
	}
};

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function clone(value) {
	return structuredClone(value);
}

function restoreFoundry() {
	if ( previousFoundry === undefined ) delete globalThis.foundry;
	else globalThis.foundry = previousFoundry;
}

try {
	check("P8B-01: legacy array becomes object and second call is idempotent", () => {
		const item = {
			_id: "ItemAdv000000001",
			type: "class",
			system: {
				advancement: [
					{
						_id: "AdvId00000000001",
						type: "ItemGrant",
						configuration: { pool: ["languages:standard:basic"] },
						value: {}
					}
				]
			}
		};
		const first = normalizeLegacyItemAdvancement(item);
		assert.equal(first, true);
		assert.equal(Array.isArray(item.system.advancement), false);
		assert.equal(typeof item.system.advancement, "object");
		assert.equal(Object.keys(item.system.advancement).length, 1);
		assert.equal(item.system.advancement.AdvId00000000001.type, "ItemGrant");
		const snapshot = clone(item.system.advancement);
		const second = normalizeLegacyItemAdvancement(item);
		assert.equal(second, false);
		assert.deepEqual(item.system.advancement, snapshot);
	});

	check("P8B-02: retained object keys equal each entry _id", () => {
		const item = {
			system: {
				advancement: [
					{ _id: "KeyA000000000001", type: "ItemGrant", configuration: {}, value: {} },
					{ _id: "KeyB000000000002", type: "ScaleValue", configuration: {}, value: {} }
				]
			}
		};
		normalizeLegacyItemAdvancement(item);
		for ( const [key, entry] of Object.entries(item.system.advancement) ) {
			assert.equal(key, entry._id);
		}
	});

	check("P8B-03: duplicate _id retains both entries; second gets a unique fabricated ID", () => {
		const first = { _id: "DupId00000000001", type: "ItemGrant", configuration: { pool: ["a"] }, value: { keep: 1 } };
		const second = { _id: "DupId00000000001", type: "ItemGrant", configuration: { pool: ["b"] }, value: { keep: 2 } };
		const item = { system: { advancement: [clone(first), clone(second)] } };
		normalizeLegacyItemAdvancement(item);
		const entries = Object.values(item.system.advancement);
		assert.equal(entries.length, 2);
		const original = item.system.advancement.DupId00000000001;
		assert.ok(original);
		assert.deepEqual(original.configuration.pool, ["a"]);
		assert.deepEqual(original.value, { keep: 1 });
		assert.equal(original._id, "DupId00000000001");
		const fabricated = entries.find(entry => entry._id !== "DupId00000000001");
		assert.ok(fabricated);
		assert.equal(typeof fabricated._id, "string");
		assert.ok(fabricated._id.length > 0);
		assert.equal(item.system.advancement[fabricated._id], fabricated);
		assert.deepEqual(fabricated.configuration.pool, ["b"]);
		assert.deepEqual(fabricated.value, { keep: 2 });
		const ids = entries.map(entry => entry._id);
		assert.equal(new Set(ids).size, 2);
	});

	check("P8B-04: missing or empty _id entries are retained with fabricated unique IDs", () => {
		const item = {
			system: {
				advancement: [
					{ type: "ItemGrant", configuration: { missing: true }, value: { a: 1 } },
					{ _id: "", type: "ItemGrant", configuration: { empty: true }, value: { b: 2 } },
					{ _id: "KeepMe0000000001", type: "ItemGrant", configuration: { keep: true }, value: { c: 3 } }
				]
			}
		};
		normalizeLegacyItemAdvancement(item);
		const entries = Object.values(item.system.advancement);
		assert.equal(entries.length, 3);
		assert.ok(item.system.advancement.KeepMe0000000001);
		assert.equal(item.system.advancement.KeepMe0000000001.configuration.keep, true);
		assert.deepEqual(item.system.advancement.KeepMe0000000001.value, { c: 3 });
		const fabricated = entries.filter(entry => entry._id !== "KeepMe0000000001");
		assert.equal(fabricated.length, 2);
		for ( const entry of fabricated ) {
			assert.equal(typeof entry._id, "string");
			assert.ok(entry._id.length > 0);
			assert.equal(item.system.advancement[entry._id], entry);
		}
		assert.equal(new Set(entries.map(entry => entry._id)).size, 3);
		const missing = fabricated.find(entry => entry.configuration.missing);
		const empty = fabricated.find(entry => entry.configuration.empty);
		assert.ok(missing);
		assert.ok(empty);
		assert.deepEqual(missing.value, { a: 1 });
		assert.deepEqual(empty.value, { b: 2 });
	});

	check("P8B-05: unknown advancement type and payload are preserved", () => {
		const item = {
			system: {
				advancement: [
					{
						_id: "UnkType000000001",
						type: "Sw5eSyntheticUnknownType",
						configuration: { customPayload: { nested: 7 } },
						value: { retained: true },
						extraField: "keep-me"
					}
				]
			}
		};
		normalizeLegacyItemAdvancement(item);
		const entry = item.system.advancement.UnkType000000001;
		assert.equal(entry.type, "Sw5eSyntheticUnknownType");
		assert.deepEqual(entry.configuration.customPayload, { nested: 7 });
		assert.deepEqual(entry.value, { retained: true });
		assert.equal(entry.extraField, "keep-me");
	});

	check("non-object array entries are skipped without throwing", () => {
		const item = {
			system: {
				advancement: [
					null,
					"string",
					42,
					{ _id: "OnlyObj000000001", type: "ItemGrant", configuration: {}, value: {} }
				]
			}
		};
		assert.equal(normalizeLegacyItemAdvancement(item), true);
		assert.deepEqual(Object.keys(item.system.advancement), ["OnlyObj000000001"]);
	});

	check("absent advancement field is a no-op", () => {
		const item = { system: { description: { value: "" } } };
		assert.equal(normalizeLegacyItemAdvancement(item), false);
		assert.equal("advancement" in item.system, false);
	});

	console.log(`\n${passed} checks passed (P8B-01..05)`);
} finally {
	restoreFoundry();
}
