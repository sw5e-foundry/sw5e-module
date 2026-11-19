/**
 * Remove the unsupported CR90 Role: Corvette ability effects.
 *
 * Usage: node ./utils/fix-cr90-role-corvette-effects.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(__dirname, "..", "packs", "_source", "drakes-shipyard", "cr90-corvette.yml");

const ACTOR_ID = "0S6RxfRRNiswQrya";
const ITEM_ID = "QV7xhcdNoH8halzL";
const ITEM_EFFECT_ID = "qQTMHDrpIch61Q7C";
const ACTOR_EFFECT_ID = "ZtUQ6YtH6HkdJH60";
const ORIGIN = `Actor.${ACTOR_ID}.Item.${ITEM_ID}`;

const ITEM_CHANGES = [
	["system.abilities.str.value", 0, "1", 1],
	["system.abilities.dex.value", 0, "1", 1]
];
const ACTOR_CHANGES = [
	["system.abilities.str.value", 2, "1", null],
	["system.abilities.dex.value", 2, "1", null]
];

function sameJson(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function newlineOf(text) {
	return text.includes("\r\n") ? "\r\n" : "\n";
}

function joinLines(lines, original) {
	const nl = newlineOf(original);
	const trailing = original.endsWith("\n");
	let next = lines.join(nl);
	if ( trailing && !next.endsWith(nl) ) next += nl;
	if ( !trailing && next.endsWith(nl) ) next = next.slice(0, -nl.length);
	return next;
}

function changeView(change) {
	return [change?.key ?? null, Number(change?.mode), String(change?.value), change?.priority ?? null];
}

function sortedChanges(effect) {
	return (effect?.changes ?? []).map(changeView).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function emptyDuration(duration) {
	if ( !duration ) return true;
	return Object.entries(duration).every(([key, value]) => value === null || value === undefined || (key === "startTime" && value === 0));
}

function plain(value) {
	return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function load() {
	const text = fs.readFileSync(FILE, "utf8");
	return { text, data: YAML.load(text) };
}

function references(text, id) {
	return text.match(new RegExp(id, "g")) ?? [];
}

function guard(source) {
	const reasons = [];
	const actor = source.data;
	if ( actor?._id !== ACTOR_ID ) reasons.push(`actor is ${actor?._id}`);
	const items = (actor?.items ?? []).filter(item => item._id === ITEM_ID);
	const actorEffects = (actor?.effects ?? []).filter(effect => effect._id === ACTOR_EFFECT_ID);
	if ( items.length !== 1 ) reasons.push(`Role: Corvette item count is ${items.length}`);
	if ( actorEffects.length !== 1 ) reasons.push(`actor effect count for ${ACTOR_EFFECT_ID} is ${actorEffects.length}`);
	const item = items[0];
	const actorEffect = actorEffects[0];
	const itemEffects = (item?.effects ?? []).filter(effect => effect._id === ITEM_EFFECT_ID);
	if ( item && item.name !== "Role: Corvette" ) reasons.push(`item name is ${item.name}`);
	if ( itemEffects.length !== 1 ) reasons.push(`item effect count is ${itemEffects.length}`);
	const itemEffect = itemEffects[0];
	const description = plain(item?.system?.description?.value);
	if ( item && !/fixed hardpoint/i.test(description) ) reasons.push("description does not include the hardpoint benefit");
	if ( item && !/damage rolls/i.test(description) ) reasons.push("description does not include the weapon-damage benefit");
	if ( item && /strength|dexterity/i.test(description) ) reasons.push("description states an ability adjustment");
	if ( itemEffect ) {
		if ( itemEffect.transfer !== true ) reasons.push("item effect transfer is not true");
		if ( !sameJson(sortedChanges(itemEffect), [...ITEM_CHANGES].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))) ) {
			reasons.push("item effect changes are not the two mode 0 ability changes");
		}
		if ( (itemEffect.statuses ?? []).length || itemEffect.activities || !emptyDuration(itemEffect.duration) ) {
			reasons.push("item effect has a status, activity, or active duration");
		}
	}
	if ( actorEffect ) {
		if ( actorEffect.transfer !== false ) reasons.push("actor effect transfer is not false");
		if ( actorEffect.origin !== ORIGIN ) reasons.push(`actor effect origin is ${actorEffect.origin}`);
		if ( !sameJson(sortedChanges(actorEffect), [...ACTOR_CHANGES].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))) ) {
			reasons.push("actor effect changes are not the two mode 2 ability changes");
		}
		if ( (actorEffect.statuses ?? []).length || actorEffect.activities || !emptyDuration(actorEffect.duration) ) {
			reasons.push("actor effect has a status, activity, or active duration");
		}
	}
	for ( const id of [ITEM_EFFECT_ID, ACTOR_EFFECT_ID] ) {
		const hits = references(source.text, id);
		if ( hits.length !== 2 ) reasons.push(`${id} appears ${hits.length} times, expected 2`);
	}
	const otherUsers = (actor?.effects ?? []).filter(effect => effect._id !== ACTOR_EFFECT_ID && String(effect.origin ?? "").includes(ITEM_EFFECT_ID));
	if ( otherUsers.length ) reasons.push(`another effect references ${ITEM_EFFECT_ID}`);
	return reasons;
}

function indentOf(line) {
	return line.match(/^ */)?.[0].length ?? 0;
}

function removeBlock(lines, header) {
	const start = lines.findIndex(line => line === header);
	if ( start < 0 ) return { error: `missing ${header.trim()}` };
	const indent = indentOf(header);
	let end = start + 1;
	while ( end < lines.length ) {
		if ( lines[end].trim() === "" ) {
			end += 1;
			continue;
		}
		if ( indentOf(lines[end]) <= indent ) break;
		end += 1;
	}
	const next = lines.slice();
	next.splice(start, end - start);
	const parent = start - 1;
	if ( parent >= 0 && /^\s*effects:\s*$/.test(next[parent]) ) {
		const parentIndent = indentOf(next[parent]);
		let follower = start;
		while ( follower < next.length && next[follower].trim() === "" ) follower += 1;
		if ( follower >= next.length || indentOf(next[follower]) <= parentIndent ) {
			next[parent] = `${" ".repeat(parentIndent)}effects: []`;
		}
	}
	return { lines: next };
}

function edit(text) {
	let lines = text.split(/\r?\n/);
	const itemEffect = removeBlock(lines, `      - _id: ${ITEM_EFFECT_ID}`);
	if ( itemEffect.error ) return itemEffect;
	lines = itemEffect.lines;
	const actorEffect = removeBlock(lines, `  - _id: ${ACTOR_EFFECT_ID}`);
	if ( actorEffect.error ) return actorEffect;
	return { text: joinLines(actorEffect.lines, text) };
}

function roleItems(data) {
	return (data?.items ?? []).filter(item => item.name === "Role: Corvette");
}

function abilityChanges(data) {
	const found = [];
	const visit = effect => {
		if ( effect?.name !== "Role: Corvette" ) return;
		for ( const change of effect.changes ?? [] ) {
			if ( String(change.key ?? "").includes("abilities.str") || String(change.key ?? "").includes("abilities.dex") ) found.push(effect._id);
		}
	};
	for ( const effect of data?.effects ?? [] ) visit(effect);
	for ( const item of data?.items ?? [] ) for ( const effect of item.effects ?? [] ) visit(effect);
	return found;
}

function verify(before, after) {
	const reasons = [];
	if ( (after.effects ?? []).some(effect => effect._id === ACTOR_EFFECT_ID) ) reasons.push("actor effect remains");
	if ( (after.items ?? []).some(item => (item.effects ?? []).some(effect => effect._id === ITEM_EFFECT_ID)) ) reasons.push("item effect remains");
	const roles = roleItems(after);
	if ( roles.length !== 1 || roles[0]._id !== ITEM_ID ) reasons.push("Role: Corvette item count is not one");
	const description = plain(roles[0]?.system?.description?.value);
	if ( !/fixed hardpoint/i.test(description) || !/damage rolls/i.test(description) ) reasons.push("hardpoint or weapon-damage text changed");
	if ( abilityChanges(after).length ) reasons.push("a Role: Corvette Strength or Dexterity change remains");
	const beforeItem = (before.items ?? []).find(item => item._id === ITEM_ID);
	const afterItem = roles[0];
	const left = JSON.parse(JSON.stringify(beforeItem));
	const right = JSON.parse(JSON.stringify(afterItem));
	left.effects = [];
	right.effects = [];
	if ( !sameJson(left, right) ) reasons.push("Role: Corvette changed outside its effect list");
	const beforeRest = JSON.parse(JSON.stringify(before));
	const afterRest = JSON.parse(JSON.stringify(after));
	delete beforeRest.effects;
	delete afterRest.effects;
	for ( const item of beforeRest.items ?? [] ) if ( item._id === ITEM_ID ) item.effects = [];
	for ( const item of afterRest.items ?? [] ) if ( item._id === ITEM_ID ) item.effects = [];
	if ( !sameJson(beforeRest, afterRest) ) reasons.push("a CR90 field outside the two effects changed");
	return reasons;
}

function fail(lines) {
	console.log("Stopped. No file written.");
	for ( const line of lines ) console.log(`  - ${line}`);
	process.exitCode = 1;
}

function main() {
	const dryRun = process.argv.includes("--dry-run");
	const source = load();
	const actorGone = !(source.data.effects ?? []).some(effect => effect._id === ACTOR_EFFECT_ID);
	const itemGone = !(source.data.items ?? []).some(item => (item.effects ?? []).some(effect => effect._id === ITEM_EFFECT_ID));
	if ( actorGone && itemGone ) {
		const reasons = [];
		const roles = roleItems(source.data);
		if ( roles.length !== 1 ) reasons.push("Role: Corvette is not present once");
		if ( abilityChanges(source.data).length ) reasons.push("an ability adjustment remains");
		if ( reasons.length ) return fail(reasons);
		console.log("Post-repair: both Role: Corvette ability effects are absent and the item remains.");
		console.log("Post-repair dry run passed. No file written.");
		return;
	}
	if ( actorGone !== itemGone ) return fail(["partial state: only one of the two effect ids is absent"]);
	const reasons = guard(source);
	if ( reasons.length ) return fail(reasons);
	const edited = edit(source.text);
	if ( edited.error ) return fail([edited.error]);
	let after;
	try {
		after = YAML.load(edited.text);
	} catch (error) {
		return fail([`edited YAML did not parse: ${error.message}`]);
	}
	const verifyReasons = verify(source.data, after);
	if ( verifyReasons.length ) return fail(verifyReasons);
	console.log(`${dryRun ? "Would remove" : "Removing"} ${ACTOR_EFFECT_ID} and ${ITEM_EFFECT_ID}; keeping ${ITEM_ID}.`);
	if ( dryRun ) {
		console.log("Dry run passed. No file written.");
		return;
	}
	fs.writeFileSync(FILE, edited.text, "utf8");
	const written = YAML.load(fs.readFileSync(FILE, "utf8"));
	const writtenReasons = verify(source.data, written);
	if ( writtenReasons.length ) return fail(writtenReasons.map(reason => `post-write ${reason}`));
	console.log("CR90 Role: Corvette ability effects removed and reparsed.");
}

main();
