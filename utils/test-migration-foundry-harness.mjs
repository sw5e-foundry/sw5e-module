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

function createEmbeddedCollection(parent, embeddedName, entries=[]) {
	const byId = new Map(entries.map(entry => [entry._id ?? entry.id, structuredClone(entry)]));
	return {
		get size() { return byId.size; },
		get contents() { return [...byId.values()]; },
		map(fn) { return [...byId.values()].map(fn); },
		[Symbol.iterator]() { return byId.values(); },
		get(id) { return byId.get(id); },
		has(id) { return byId.has(id); },
		async updateEmbeddedDocuments(_embeddedName, updates=[], _operation={}) {
			const out = [];
			for ( const update of updates ) {
				const id = update._id;
				const current = byId.get(id);
				if ( !current ) continue;
				const merged = mergeObject(current, update, { inplace: false });
				if ( update.system?.changes ) delete merged.changes;
				byId.set(id, merged);
				out.push(merged);
			}
			return out;
		},
		async deleteEmbeddedDocuments(_embeddedName, ids=[], _operation={}) {
			const out = [];
			for ( const id of ids ) {
				const current = byId.get(id);
				if ( !current ) continue;
				byId.delete(id);
				out.push(current);
			}
			return out;
		}
	};
}

function normalizeEffectData(effect) {
	const normalized = structuredClone(effect);
	if ( !normalized.system?.changes && Array.isArray(normalized.changes) ) {
		normalized.system = normalized.system ?? {};
		normalized.system.changes = normalized.changes.map(change => ({
			...change,
			type: change.type ?? "add",
			phase: change.phase ?? "initial",
			priority: change.priority ?? 20
		}));
	}
	return normalized;
}

function normalizeItemData(item) {
	const normalized = structuredClone(item);
	const effects = (normalized.effects ?? []).map(normalizeEffectData);
	normalized.effects = effects;
	return normalized;
}

export function createMockActor(raw={}) {
	const data = structuredClone(raw);
	const id = data.id ?? data._id;
	data.id = id;
	data._id = id;
	const itemEntries = (data.items ?? []).map(normalizeItemData);
	const effectEntries = (data.effects ?? []).map(normalizeEffectData);
	const items = createEmbeddedCollection(data, "Item", itemEntries);
	const effects = createEmbeddedCollection(data, "ActiveEffect", effectEntries);
	const actor = {
		...data,
		uuid: data.uuid ?? `Actor.${id}`,
		type: data.type ?? "vehicle",
		flags: data.flags ?? {},
		_stats: data._stats ?? {},
		system: data.system ?? { attributes: { hp: {} } },
		_source: data._source ?? {
			system: data.system ?? { attributes: { hp: {} } },
			flags: data.flags ?? {},
			_stats: data._stats ?? {}
		},
		items,
		effects,
		allApplicableEffects() {
			const out = [];
			for ( const effect of effects.contents ) {
				if ( effect.disabled ) continue;
				out.push({ ...effect, active: true });
			}
			for ( const item of items.contents ) {
				for ( const effect of item.effects.contents ?? item.effects ?? [] ) {
					if ( effect.transfer === true ) out.push({ ...effect, active: true });
				}
			}
			return out;
		},
		async update(updateData={}, _options={}) {
			const expanded = expandObject(updateData);
			if ( Array.isArray(expanded.items) ) {
				for ( const itemData of expanded.items ) {
					const id = itemData?._id ?? itemData?.id;
					const existing = items.get(id);
					if ( !existing ) continue;
					const effectUpdates = itemData.effects;
					const itemPatch = { ...itemData };
					delete itemPatch.effects;
					mergeObject(existing, itemPatch, { inplace: true });
					if ( Array.isArray(effectUpdates) ) {
						for ( const effectData of effectUpdates ) {
							const effectId = effectData?._id ?? effectData?.id;
							const existingEffect = existing.effects?.get?.(effectId);
							if ( existingEffect ) {
								mergeObject(existingEffect, effectData, { inplace: true });
								if ( effectData.system?.changes ) delete existingEffect.changes;
							}
						}
					}
				}
				delete expanded.items;
			}
			if ( Array.isArray(expanded.effects) ) {
				for ( const effectData of expanded.effects ) {
					const id = effectData?._id ?? effectData?.id;
					const existing = effects.get(id);
					if ( existing ) mergeObject(existing, effectData, { inplace: true });
				}
				delete expanded.effects;
			}
			mergeObject(actor, expanded, { inplace: true });
			mergeObject(actor._source, expanded, { inplace: true });
			actor.updated = true;
			return actor;
		},
		async deleteEmbeddedDocuments(embeddedName, ids=[], _operation={}) {
			return effects.deleteEmbeddedDocuments(embeddedName, ids, _operation);
		},
		toObject(expanded=false) {
			return {
				_id: actor._id,
				name: actor.name,
				type: actor.type,
				flags: structuredClone(actor.flags),
				system: structuredClone(actor.system),
				_stats: structuredClone(actor._stats),
				items: items.contents.map(item => ({
					_id: item._id,
					name: item.name,
					type: item.type,
					flags: structuredClone(item.flags ?? {}),
					system: structuredClone(item.system ?? {}),
					_stats: structuredClone(item._stats ?? {}),
					effects: item.effects.contents.map(effect => structuredClone(effect))
				})),
				effects: effects.contents.map(effect => structuredClone(effect))
			};
		}
	};
	for ( const item of items.contents ) {
		item.parent = actor;
		const effectList = Array.isArray(item.effects) ? item.effects : [...(item.effects?.contents ?? [])];
		item.effects = createEmbeddedCollection(item, "ActiveEffect", effectList);
		item.updateEmbeddedDocuments = (...args) => item.effects.updateEmbeddedDocuments(...args);
	}
	return actor;
}

function createCollection(docs=[]) {
	const normalized = docs.map(doc => doc?.update ? doc : createMockActor(doc));
	const byId = new Map(normalized.map(d => [d.id ?? d._id, d]));
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
	dnd5eMigrationVersion="5.3.3",
	actors=[],
	items=[],
	scenes=[],
	macros=[],
	tables=[],
	packs=[],
	throwOnSettingsSet=null,
	worldDnd5eVersion="5.3.3"
}={}) {
	const settingsStore = {
		"dnd5e.systemMigrationVersion": dnd5eMigrationVersion
	};
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
		system: {
			id: "dnd5e",
			version: "5.3.3",
			flags: { needsMigrationVersion: "5.3.3", compatibleMigrationVersion: "5.0.0" }
		},
		world: { id: "synth-test", title: "synth-test", coreVersion: "14.367", flags: { dnd5e: { version: worldDnd5eVersion } } },
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
				if ( !(full in settingsStore) ) {
					if ( `${ns}.${key}` === "dnd5e.systemMigrationVersion" ) return "";
					throw new Error(`${full} is not a registered game setting`);
				}
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
				if ( !a ) return false;
				const normalize = v => String(v).split("-")[0];
				const pa = normalize(a).split(".").map(Number);
				const pb = normalize(b).split(".").map(Number);
				for ( let i = 0; i < Math.max(pa.length, pb.length); i++ ) {
					const av = pa[i] ?? 0;
					const bv = pb[i] ?? 0;
					if ( av > bv ) return true;
					if ( av < bv ) return false;
				}
				return false;
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
