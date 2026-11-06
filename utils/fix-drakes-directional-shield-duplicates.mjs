/**
 * Remove three Directional Shield actor-level duplicates.
 *
 * Usage: node ./utils/fix-drakes-directional-shield-duplicates.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRAKES = path.resolve(__dirname, "..", "packs", "_source", "drakes-shipyard");
const SOURCE_PREFIX = "packs/_source/drakes-shipyard";

const EXPECTED_CHANGES = [
	["system.traits.sdr.value", 2, "acid", 20],
	["system.traits.sdr.value", 2, "cold", 20],
	["system.traits.sdr.value", 2, "fire", 20],
	["system.traits.sdr.value", 2, "necrotic", 20],
	["system.traits.sdi.value", 2, "poison", 20],
	["system.traits.sdi.value", 2, "psychic", 20]
];

const TARGETS = [
	{
		file: "escape-pod.yml",
		actorId: "2YtJawA2uITnhq6V",
		effectId: "b6Faqbwd2sLA9Hgc",
		itemId: "sQFl4VavPGVYKhXD",
		itemEffectId: "8DZ792d8qqBQeXNh"
	},
	{
		file: "eta-2-actis-class-interceptor.yml",
		actorId: "kxOYt1pVQc0rh1OP",
		effectId: "i98DfifxpUQ6S1qw",
		itemId: "4u8uwxj0M1atqRwf",
		itemEffectId: "8DZ792d8qqBQeXNh"
	},
	{
		file: "fang-class.yml",
		actorId: "uAzqh6bUJ4ZfKcol",
		effectId: "Hk5jIpbt4L79lBIp",
		itemId: "4m9YNf4FAE0bXjIF",
		itemEffectId: "8DZ792d8qqBQeXNh"
	}
];

function keyOf(target) {
	return `${SOURCE_PREFIX}/${target.file}|${target.actorId}|${target.effectId}`;
}

function sameJson(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function newlineOf(text) {
	return text.includes("\r\n") ? "\r\n" : "\n";
}

function changeView(change) {
	return [change?.key ?? null, Number(change?.mode), String(change?.value), change?.priority ?? null];
}

function sortedChanges(effect) {
	return (effect?.changes ?? []).map(changeView).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function emptyDuration(duration) {
	if ( !duration ) return true;
	return Object.entries(duration).every(([key, value]) => {
		if ( value === null || value === undefined ) return true;
		return key === "startTime" && value === 0;
	});
}

function emptyFlags(flags) {
	const copy = JSON.parse(JSON.stringify(flags ?? {}));
	if ( copy?.core?.statusId === "" ) delete copy.core.statusId;
	if ( copy.core && Object.keys(copy.core).length === 0 ) delete copy.core;
	return Object.keys(copy).length === 0;
}

function loadFile(file) {
	const full = path.join(DRAKES, file);
	const text = fs.readFileSync(full, "utf8");
	return { file, full, text, data: YAML.load(text) };
}

function guardTarget(source, target) {
	const reasons = [];
	if ( source.data?._id !== target.actorId ) reasons.push(`${target.file} actor is ${source.data?._id}`);
	const effect = (source.data?.effects ?? []).find(entry => entry._id === target.effectId);
	const item = (source.data?.items ?? []).find(entry => entry._id === target.itemId);
	const itemEffect = (item?.effects ?? []).find(entry => entry._id === target.itemEffectId);
	if ( !effect ) return { present: false, reasons: [`${target.effectId} is absent`] };
	if ( effect.name !== "Directional Shield" || item?.name !== "Directional Shield" ) {
		reasons.push(`${target.effectId} or its item is not named Directional Shield`);
	}
	const expectedOrigin = `Compendium.world.drakes-shipyard.${target.actorId}.Item.${target.itemId}`;
	if ( effect.origin !== expectedOrigin ) reasons.push(`${target.effectId} origin is ${effect.origin}`);
	if ( effect.transfer !== false ) reasons.push(`${target.effectId} transfer is ${effect.transfer}`);
	if ( !item ) reasons.push(`item ${target.itemId} is absent`);
	if ( !itemEffect ) reasons.push(`item effect ${target.itemEffectId} is absent`);
	if ( itemEffect && itemEffect.transfer !== true ) reasons.push(`${target.itemEffectId} transfer is ${itemEffect.transfer}`);
	if ( effect && itemEffect ) {
		const expected = EXPECTED_CHANGES.map(row => [...row]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
		if ( !sameJson(sortedChanges(effect), expected) ) reasons.push(`${target.effectId} changes do not match the six recorded resistances`);
		if ( !sameJson(sortedChanges(effect), sortedChanges(itemEffect)) ) reasons.push(`${target.effectId} changes differ from ${target.itemEffectId}`);
		if ( (effect.disabled ?? false) !== (itemEffect.disabled ?? false) ) reasons.push("disabled state differs");
		if ( !sameJson(effect.statuses ?? [], itemEffect.statuses ?? []) ) reasons.push("statuses differ");
		if ( emptyDuration(effect.duration) !== emptyDuration(itemEffect.duration) ) reasons.push("duration emptiness differs");
		if ( !emptyDuration(effect.duration) || !emptyDuration(itemEffect.duration) ) reasons.push("duration is not empty");
		if ( (effect.statuses ?? []).length || (itemEffect.statuses ?? []).length ) reasons.push("statuses are not empty");
		if ( effect.activities || itemEffect.activities ) reasons.push("an effect has activities");
		if ( !emptyFlags(effect.flags) ) reasons.push("actor effect has flag behavior beyond an empty status id");
	}
	return { present: true, reasons, effect, item, itemEffect };
}

function removeTopLevelEntries(text, ids) {
	const nl = newlineOf(text);
	const lines = text.split(/\r?\n/);
	const trailingNewline = text.endsWith("\n");
	const wanted = new Set(ids);
	const found = new Map();
	const kept = [];
	let skipping = false;
	for ( const line of lines ) {
		const match = line.match(/^  - _id: ([A-Za-z0-9]+)$/);
		if ( match ) {
			skipping = wanted.has(match[1]);
			if ( skipping ) {
				found.set(match[1], (found.get(match[1]) ?? 0) + 1);
				continue;
			}
		} else if ( skipping ) {
			if ( /^[A-Za-z_]/.test(line) ) skipping = false;
			else continue;
		}
		kept.push(line);
	}
	let next = kept.join(nl);
	if ( trailingNewline && !next.endsWith(nl) ) next += nl;
	if ( !trailingNewline && next.endsWith(nl) ) next = next.slice(0, -nl.length);
	return { text: next, found };
}

function verifyEdited(before, after, target) {
	const reasons = [];
	const removed = (before.effects ?? []).find(entry => entry._id === target.effectId);
	const still = (after.effects ?? []).find(entry => entry._id === target.effectId);
	if ( still ) reasons.push(`${target.effectId} remains`);
	if ( (after.effects ?? []).length !== (before.effects ?? []).length - 1 ) reasons.push("actor effect count changed by more than one");
	for ( const effect of before.effects ?? [] ) {
		if ( effect._id === target.effectId ) continue;
		const next = (after.effects ?? []).find(entry => entry._id === effect._id);
		if ( !next || !sameJson(next, effect) ) reasons.push(`actor effect ${effect._id} changed`);
	}
	const beforeItems = new Map((before.items ?? []).map(item => [item._id, item]));
	const afterItems = new Map((after.items ?? []).map(item => [item._id, item]));
	if ( !sameJson([...beforeItems.keys()].sort(), [...afterItems.keys()].sort()) ) reasons.push("item ids changed");
	for ( const [id, item] of beforeItems ) {
		if ( !sameJson(afterItems.get(id), item) ) reasons.push(`item ${id} changed`);
	}
	const item = afterItems.get(target.itemId);
	const itemEffect = (item?.effects ?? []).find(entry => entry._id === target.itemEffectId);
	if ( !item || item.name !== "Directional Shield" ) reasons.push("Directional Shield item is absent");
	if ( !itemEffect || itemEffect.transfer !== true ) reasons.push("transfer true item effect is absent");
	if ( removed && itemEffect && !sameJson(sortedChanges(removed), sortedChanges(itemEffect)) ) {
		reasons.push("retained item effect no longer matches the removed actor effect");
	}
	const restBefore = JSON.parse(JSON.stringify(before));
	const restAfter = JSON.parse(JSON.stringify(after));
	delete restBefore.items;
	delete restBefore.effects;
	delete restAfter.items;
	delete restAfter.effects;
	if ( !sameJson(restBefore, restAfter) ) reasons.push("an actor field outside items and effects changed");
	return reasons;
}

function fail(lines) {
	console.log("Stopped. No files written.");
	for ( const line of lines ) console.log(`  - ${line}`);
	process.exitCode = 1;
}

function main() {
	const dryRun = process.argv.includes("--dry-run");
	const sources = TARGETS.map(target => ({ target, source: loadFile(target.file) }));
	const guards = sources.map(entry => ({ ...entry, guard: guardTarget(entry.source, entry.target) }));
	const present = guards.filter(entry => entry.guard.present).length;
	const absent = guards.length - present;
	const problems = guards.flatMap(entry => entry.guard.reasons
		.filter(reason => !reason.endsWith(" is absent"))
		.map(reason => `${entry.target.file}: ${reason}`));
	if ( present === 0 && absent === 3 && problems.length === 0 ) {
		console.log("Post-repair: the three Directional Shield actor effects are absent.");
		for ( const entry of guards ) {
			const item = (entry.source.data.items ?? []).find(candidate => candidate._id === entry.target.itemId);
			const itemEffect = (item?.effects ?? []).find(candidate => candidate._id === entry.target.itemEffectId);
			if ( !item || item.name !== "Directional Shield" || !itemEffect || itemEffect.transfer !== true ) {
				return fail([`${entry.target.file}: retained item effect is missing in the post-repair state`]);
			}
			if ( !sameJson(sortedChanges(itemEffect), EXPECTED_CHANGES.map(row => [...row]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))) ) {
				return fail([`${entry.target.file}: retained item effect changes changed`]);
			}
			console.log(`${keyOf(entry.target)} item ${entry.target.itemId} itemEffect ${entry.target.itemEffectId} remains`);
		}
		console.log("Post-repair dry run passed. No files written.");
		return;
	}
	if ( present !== 3 || absent !== 0 || problems.length ) {
		return fail([`partial or mixed state: ${present} present, ${absent} absent`, ...problems]);
	}
	console.log("Pre-repair: 3 deletion candidates.");
	for ( const entry of guards ) {
		console.log(keyOf(entry.target));
		console.log(`  actor ${entry.target.actorId} effect ${entry.target.effectId}`);
		console.log(`  item ${entry.target.itemId} itemEffect ${entry.target.itemEffectId}`);
		for ( const change of sortedChanges(entry.guard.effect) ) console.log(`  ${change.join(" ")}`);
	}
	const edits = [];
	for ( const entry of guards ) {
		const removed = removeTopLevelEntries(entry.source.text, [entry.target.effectId]);
		if ( removed.found.get(entry.target.effectId) !== 1 ) {
			return fail([`${entry.target.file}: block removal count is ${removed.found.get(entry.target.effectId) ?? 0}`]);
		}
		let after;
		try {
			after = YAML.load(removed.text);
		} catch (error) {
			return fail([`${entry.target.file} did not parse: ${error.message}`]);
		}
		const reasons = verifyEdited(entry.source.data, after, entry.target);
		if ( reasons.length ) return fail(reasons.map(reason => `${entry.target.file}: ${reason}`));
		edits.push({ ...entry, text: removed.text });
	}
	console.log(dryRun ? "Dry run passed. No files written." : "Writing 3 files.");
	if ( dryRun ) return;
	for ( const edit of edits ) fs.writeFileSync(edit.source.full, edit.text, "utf8");
	for ( const edit of edits ) {
		const written = YAML.load(fs.readFileSync(edit.source.full, "utf8"));
		const reasons = verifyEdited(edit.source.data, written, edit.target);
		if ( reasons.length ) return fail(reasons.map(reason => `post-write ${edit.target.file}: ${reason}`));
	}
	console.log("Directional Shield actor copies removed and reparsed.");
}

main();
