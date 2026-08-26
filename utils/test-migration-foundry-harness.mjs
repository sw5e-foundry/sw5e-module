/**
 * Node-only Foundry/game stub for SW5E migration unit tests.
 * Must not be loaded by Foundry worlds.
 */
import { readFileSync } from "node:fs";

const englishLocalization = JSON.parse(
	readFileSync(new URL("../languages/en.json", import.meta.url), "utf8")
);

export function formatLocalization(key, data={}) {
	const template = englishLocalization[key] ?? key;
	return template.replace(/\{(\w+)\}/g, (match, name) => (
		Object.hasOwn(data, name) ? String(data[name]) : match
	));
}
function isEmpty(value) {
	if ( value == null ) return true;
	if ( Array.isArray(value) ) return value.length === 0;
	if ( typeof value === "object" ) return Object.keys(value).length === 0;
	return false;
}

function getProperty(object, path) {
	if ( object == null || typeof path !== "string" ) return undefined;
	return path.split(".").reduce((cur, key) => (cur == null ? undefined : cur[key]), object);
}

function setProperty(object, path, value) {
	const parts = path.split(".");
	let cur = object;
	for ( let i = 0; i < parts.length - 1; i++ ) {
		const key = parts[i];
		if ( typeof cur[key] !== "object" || cur[key] === null ) cur[key] = {};
		cur = cur[key];
	}
	cur[parts[parts.length - 1]] = value;
	return object;
}

function mergeObject(original, other, { inplace=true }={}) {
	const target = inplace ? original : structuredClone(original ?? {});
	if ( !other || typeof other !== "object" ) return target;
	for ( const [key, value] of Object.entries(other) ) {
		if ( value && typeof value === "object" && !Array.isArray(value) && typeof target[key] === "object" && target[key] ) {
			mergeObject(target[key], value, { inplace: true });
		} else {
			target[key] = value;
		}
	}
	return target;
}

function objectsEqual(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}

function equals(a, b) {
	return objectsEqual(a, b);
}

function expandObject(obj) {
	const out = {};
	for ( const [key, value] of Object.entries(obj ?? {}) ) {
		if ( key.includes(".") ) setProperty(out, key, value);
		else out[key] = value;
	}
	return out;
}

class ForcedReplacement {
	constructor(value) {
		this.value = value;
	}

	static create(value) {
		return new ForcedReplacement(value);
	}

	static get(value) {
		if ( value instanceof ForcedReplacement ) return value.value;
		return value;
	}
}

function createCollection(docs=[]) {
	const byId = new Map(docs.map(d => [d.id ?? d._id, d]));
	return {
		get size() { return byId.size; },
		invalidDocumentIds: new Set(),
		map(fn) { return [...byId.values()].map(fn); },
		[Symbol.iterator]() { return byId.values(); },
		get(id) { return byId.get(id); },
		has(id) { return byId.has(id); },
		getInvalid() { return null; },
		contents: [...byId.values()]
	};
}

export function installMigrationTestHarness({
	moduleVersion="1.4.1",
	needsMigrationVersion="1.3.6",
	moduleMigrationVersion="",
	actors=[],
	items=[],
	scenes=[],
	macros=[],
	tables=[],
	packs=[],
	throwOnSettingsSet=null
}={}) {
	const settingsStore = {};
	if ( moduleMigrationVersion !== "" && moduleMigrationVersion != null ) {
		settingsStore["sw5e-module.moduleMigrationVersion"] = moduleMigrationVersion;
	}
	const notifications = [];
	const module = {
		id: "sw5e-module",
		version: moduleVersion,
		active: true,
		flags: { needsMigrationVersion, compatibleMigrationVersion: "1.0.0" }
	};
	const game = {
		user: { isGM: true },
		system: { id: "dnd5e", version: "5.2.5" },
		world: { id: "synth-test", title: "synth-test", coreVersion: "13.351" },
		actors: createCollection(actors),
		items: createCollection(items),
		scenes: createCollection(scenes),
		macros,
		tables,
		packs,
		folders: createCollection([]),
		modules: {
			get(id) { return id === "sw5e-module" ? module : null; },
			find(fn) { return fn(module) ? module : null; }
		},
		i18n: {
			format(key, data={}) { return formatLocalization(key, data); },
			localize(key) { return key; }
		},
		settings: {
			storage: {
				get() {
					return {
						get(key) {
							if ( !(key in settingsStore) ) return undefined;
							return { value: settingsStore[key] };
						}
					};
				}
			},
			get(ns, key) {
				const full = `${ns}.${key}`;
				if ( !(full in settingsStore) ) throw new Error(`${full} is not a registered game setting`);
				return settingsStore[full];
			},
			set(ns, key, value) {
				if ( throwOnSettingsSet && `${ns}.${key}` === "sw5e-module.moduleMigrationVersion" ) {
					throw throwOnSettingsSet instanceof Error
						? throwOnSettingsSet
						: new Error(String(throwOnSettingsSet));
				}
				settingsStore[`${ns}.${key}`] = value;
				return Promise.resolve(value);
			}
		}
	};
	globalThis.game = game;
	globalThis.ui = {
		notifications: {
			info(message, options) { notifications.push({ type: "info", message, ...options }); },
			error(message, options) { notifications.push({ type: "error", message, ...options }); },
			warn(message, options) { notifications.push({ type: "warn", message, ...options }); }
		}
	};
	globalThis.foundry = {
		utils: {
			deepClone: value => structuredClone(value),
			isEmpty,
			getProperty,
			setProperty,
			mergeObject,
			objectsEqual,
			equals,
			expandObject,
			isNewerVersion(a, b) {
				if ( !b ) return true;
				return String(a) > String(b);
			}
		},
		data: {
			operators: { ForcedReplacement }
		},
		abstract: { DataModel: class DataModel {} }
	};
	globalThis._replace = ForcedReplacement.create;
	globalThis.CONFIG = {
		Item: { documentClass: class Item {} },
		Actor: { documentClass: class Actor {} },
		ActiveEffect: { documentClass: class ActiveEffect {} }
	};
	globalThis.__SW5E_MIGRATION_TEST_HOOKS__ = {};
	return { game, notifications, settingsStore, module };
}

export function resetMigrationTestHarness() {
	delete globalThis.game;
	delete globalThis.ui;
	delete globalThis.foundry;
	delete globalThis.CONFIG;
	delete globalThis.__SW5E_MIGRATION_TEST_HOOKS__;
}
