#!/usr/bin/env node
/**
 * Chassis effect snapshots persist numeric mode without reading Foundry's change.mode getter.
 */
import assert from "node:assert/strict";
import {
	cloneEffectsSnapshot,
	persistedModeFromChange
} from "../scripts/chassis-effect-snapshot.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function throwingModeGetter(base) {
	const change = { ...base };
	Object.defineProperty(change, "mode", {
		get() {
			throw new Error("numeric mode getter must not be read");
		}
	});
	return change;
}

test("prepared add type snapshots numeric mode 2 without evaluating getter", () => {
	const change = throwingModeGetter({
		key: "system.bonuses.mpak.attack",
		type: "add",
		value: "2",
		priority: 20
	});
	const snap = cloneEffectsSnapshot([{ name: "Amp", disabled: false, changes: [change] }]);
	assert.equal(snap[0].changes[0].mode, 2);
	assert.equal(snap[0].changes[0].key, "system.bonuses.mpak.attack");
	assert.equal(snap[0].changes[0].value, "2");
	assert.equal(snap[0].changes[0].priority, 20);
});

test("prepared override type snapshots numeric mode 5", () => {
	const change = throwingModeGetter({
		key: "system.attributes.ac.bonus",
		type: "override",
		value: "18",
		priority: 20
	});
	assert.equal(persistedModeFromChange(change), 5);
	const snap = cloneEffectsSnapshot([{ name: "AC", disabled: false, changes: [change] }]);
	assert.equal(snap[0].changes[0].mode, 5);
});

test("plain own-data numeric mode is used when type is absent", () => {
	const change = {
		key: "system.bonuses.mpak.attack",
		mode: 2,
		value: "3",
		priority: 20
	};
	const descriptor = Object.getOwnPropertyDescriptor(change, "mode");
	assert.equal(Object.hasOwn(descriptor, "value"), true);
	assert.equal(descriptor.get, undefined);
	assert.equal(persistedModeFromChange(change), 2);
	const snap = cloneEffectsSnapshot([{ name: "Plain", disabled: false, changes: [change] }]);
	assert.equal(snap[0].changes[0].mode, 2);
});

test("multiply and upgrade types map to Foundry numeric modes", () => {
	assert.equal(persistedModeFromChange({ type: "multiply" }), 1);
	assert.equal(persistedModeFromChange({ type: "upgrade" }), 4);
	assert.equal(persistedModeFromChange({ type: "downgrade" }), 3);
	assert.equal(persistedModeFromChange({ type: "custom" }), 0);
});

test("missing type and missing plain mode defaults to ADD", () => {
	assert.equal(persistedModeFromChange({ key: "system.bonuses.mpak.attack", value: "1" }), 2);
});

test("EmbeddedCollection-like iterable snapshots without evaluating getter", () => {
	const change = throwingModeGetter({
		key: "system.bonuses.rpak.attack",
		type: "add",
		value: "2",
		priority: 20
	});
	const collection = {
		*[Symbol.iterator]() {
			yield { name: "FromCollection", disabled: false, changes: [change] };
		}
	};
	const snap = cloneEffectsSnapshot(collection);
	assert.equal(snap[0].name, "FromCollection");
	assert.equal(snap[0].changes[0].mode, 2);
});

console.log(`\n${passed} passed`);
