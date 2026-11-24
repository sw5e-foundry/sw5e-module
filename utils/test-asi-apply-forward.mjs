#!/usr/bin/env node
/**
 * Regression: SW5E's Ability Score Improvement apply wrapper must forward the
 * original options object, including options.initial, and return the native result.
 */
import assert from "node:assert/strict";
import { forwardAbilityScoreImprovementApply } from "../scripts/patch/variantRules.mjs";

let passed = 0;
function test(name, fn) {
	return Promise.resolve(fn()).then(() => {
		passed += 1;
		console.log(`ok - ${name}`);
	});
}

const options = { initial: true };

await test("normal path forwards the original options and returns the native promise", async () => {
	const native = Promise.resolve("native-normal");
	let seen;
	const wrapped = (level, data, opts) => {
		seen = { level, data, opts };
		return native;
	};
	const result = forwardAbilityScoreImprovementApply(wrapped, 0, {}, options, {
		enabled: false,
		advancement: {}
	});
	assert.equal(result, native);
	assert.equal(await result, "native-normal");
	assert.equal(seen.level, 0);
	assert.equal(seen.opts, options);
});

await test("disabled feat-plus-ASI data still uses the normal path", async () => {
	const native = Promise.resolve("native-disabled");
	let calls = 0;
	const wrapped = (level, data, opts) => {
		calls += 1;
		assert.equal(opts, options);
		assert.equal(data.type, "both");
		return native;
	};
	const result = forwardAbilityScoreImprovementApply(wrapped, 4, { type: "both" }, options, {
		enabled: false,
		advancement: {}
	});
	assert.equal(result, native);
	assert.equal(await result, "native-disabled");
	assert.equal(calls, 1);
});

await test("feat-plus-ASI path forwards the same options and returns the native feat result", async () => {
	const calls = [];
	const wrapped = (level, data, opts) => {
		calls.push({ level, data, opts });
		return Promise.resolve(data.type);
	};
	const advancement = {
		value: { assignments: { str: 1 } },
		reverse() {},
		updateSource(update) { this.updated = update; }
	};
	const previous = globalThis.foundry;
	globalThis.foundry = {
		utils: {
			deepClone: (value) => JSON.parse(JSON.stringify(value)),
			isEmpty: (value) => !value || (typeof value === "object" && Object.keys(value).length === 0)
		}
	};
	try {
		const result = await forwardAbilityScoreImprovementApply(wrapped, 4, {
			type: "both",
			assignments: { str: 1 },
			uuid: "Compendium.sw5e-module.feats.Item.example"
		}, options, { enabled: true, advancement });
		assert.equal(result, "feat");
		assert.equal(calls.length, 2);
		assert.equal(calls[0].data.type, "asi");
		assert.deepEqual(calls[0].data.assignments, { str: 1 });
		assert.equal(calls[1].data.type, "feat");
		assert.equal(calls[1].data.uuid, "Compendium.sw5e-module.feats.Item.example");
		assert.equal(calls[0].opts, options);
		assert.equal(calls[1].opts, options);
		assert.equal(calls[0].level, 4);
		assert.equal(calls[1].level, 4);
		assert.deepEqual(advancement.updated, {
			"value.assignments": { str: 1 },
			"value.type": "feat"
		});
	} finally {
		globalThis.foundry = previous;
	}
});

console.log(`\n${passed} passed`);
