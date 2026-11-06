/**
 * Restore the CR90 Role: Corvette ability effect at mode 2.
 *
 * Usage: node ./utils/restore-cr90-role-corvette-effect.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FILE = path.join(ROOT, "packs", "_source", "drakes-shipyard", "cr90-corvette.yml");
const COMPENDIUM = path.join(ROOT, "packs", "_source", "starships", "starship-features", "large", "role-corvette.yml");

const ACTOR_ID = "0S6RxfRRNiswQrya";
const ITEM_ID = "QV7xhcdNoH8halzL";
const EFFECT_ID = "qQTMHDrpIch61Q7C";
const ACTOR_EFFECT_ID = "ZtUQ6YtH6HkdJH60";

const EXPECTED = [
	["system.abilities.dex.value", 2, "1", 1],
	["system.abilities.str.value", 2, "1", 1]
];

const EFFECT_BLOCK = [
	"    effects:",
	`      - _id: ${EFFECT_ID}`,
	"        flags:",
	"          core:",
	"            statusId: ''",
	"        changes:",
	"          - key: system.abilities.str.value",
	"            mode: 2",
	"            value: '1'",
	"            priority: 1",
	"          - key: system.abilities.dex.value",
	"            mode: 2",
	"            value: '1'",
	"            priority: 1",
	"        disabled: false",
	"        duration:",
	"          startTime: null",
	"          seconds: null",
	"          combat: null",
	"          rounds: null",
	"          turns: null",
	"          startRound: null",
	"          startTurn: null",
	"        tint: '#ffffff'",
	"        transfer: true",
	"        origin: null",
	"        name: 'Role: Corvette'",
	"        description: ''",
	"        statuses: []",
	"        _stats:",
	"          coreVersion: '12.330'",
	"          systemId: null",
	"          systemVersion: null",
	"          createdTime: null",
	"          modifiedTime: null",
	"          lastModifiedBy: null",
	"          compendiumSource: null",
	"          duplicateSource: null",
	"        img: modules/sw5e-module/icons/packs/Starship%20Features/Small.webp",
	"        type: base",
	"        system: {}",
	"        sort: 0",
	"        _key: >-",
	`          !actors.items.effects!${ACTOR_ID}.${ITEM_ID}.${EFFECT_ID}`
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

function plain(value) {
	return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function changeView(change) {
	return [change?.key ?? null, Number(change?.mode), String(change?.value), change?.priority ?? null];
}

function sortedChanges(effect) {
	return (effect?.changes ?? []).map(changeView).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function load() {
	const text = fs.readFileSync(FILE, "utf8");
	return { text, data: YAML.load(text) };
}

function roleItem(data) {
	return (data?.items ?? []).filter(item => item._id === ITEM_ID);
}

function compendiumStillGrantsBonus() {
	const data = YAML.load(fs.readFileSync(COMPENDIUM, "utf8"));
	const changes = (data.effects ?? []).flatMap(effect => effect.changes ?? []);
	const strength = changes.find(change => change.key === "system.abilities.str.value" && String(change.value) === "1");
	const dexterity = changes.find(change => change.key === "system.abilities.dex.value" && String(change.value) === "1");
	return Boolean(strength && dexterity);
}

function guardPre(source) {
	const reasons = [];
	if ( source.data?._id !== ACTOR_ID ) reasons.push(`actor is ${source.data?._id}`);
	const items = roleItem(source.data);
	if ( items.length !== 1 || items[0].name !== "Role: Corvette" ) reasons.push("Role: Corvette item is not present once");
	const item = items[0];
	if ( item && (item.effects ?? []).length !== 0 ) reasons.push("Role: Corvette effects collection is not empty");
	if ( (source.data.effects ?? []).some(effect => effect._id === ACTOR_EFFECT_ID) ) reasons.push("actor-level effect is present");
	if ( source.text.includes(ACTOR_EFFECT_ID) ) reasons.push("actor-level effect id remains in the file");
	if ( source.text.includes(EFFECT_ID) ) reasons.push("effect id is already present in the CR90 file");
	const description = plain(item?.system?.description?.value);
	if ( !/fixed hardpoint/i.test(description) || !/damage rolls/i.test(description) ) {
		reasons.push("hardpoint or weapon-damage text is missing");
	}
	if ( corvetteAbilityEffects(source.data).length ) reasons.push("a Role: Corvette ability adjustment already exists");
	if ( !compendiumStillGrantsBonus() ) reasons.push("compendium Corvette role no longer records Strength +1 and Dexterity +1");
	return reasons;
}

function itemBlockRange(lines) {
	const start = lines.findIndex(line => line === `  - _id: ${ITEM_ID}`);
	if ( start < 0 ) return { error: "item header not found" };
	let end = lines.length;
	for ( let index = start + 1; index < lines.length; index += 1 ) {
		if ( /^  - _id: /.test(lines[index]) || /^[A-Za-z_]/.test(lines[index]) ) {
			end = index;
			break;
		}
	}
	return { start, end };
}

function insertEffect(text) {
	const lines = text.split(/\r?\n/);
	const range = itemBlockRange(lines);
	if ( range.error ) return range;
	const effectsAt = lines.findIndex((line, index) => index > range.start && index < range.end && line === "    effects: []");
	if ( effectsAt < 0 ) return { error: "empty effects list was not found on the Role: Corvette item" };
	const next = lines.slice();
	next.splice(effectsAt, 1, ...EFFECT_BLOCK);
	return { text: joinLines(next, text) };
}

function effectSites(data) {
	const sites = [];
	for ( const effect of data?.effects ?? [] ) {
		if ( effect._id === EFFECT_ID ) sites.push(`actor effect ${effect._id}`);
	}
	for ( const item of data?.items ?? [] ) {
		for ( const effect of item.effects ?? [] ) {
			if ( effect._id === EFFECT_ID ) sites.push(`item ${item._id}`);
		}
	}
	return sites;
}

function verifyPost(data) {
	const reasons = [];
	const items = roleItem(data);
	if ( items.length !== 1 || items[0].name !== "Role: Corvette" ) reasons.push("Role: Corvette is not present once");
	const item = items[0];
	const effects = (item?.effects ?? []).filter(effect => effect._id === EFFECT_ID);
	if ( effects.length !== 1 ) reasons.push(`nested effect count is ${effects.length}`);
	const effect = effects[0];
	if ( effect ) {
		if ( effect.transfer !== true ) reasons.push("restored effect transfer is not true");
		if ( !sameJson(sortedChanges(effect), EXPECTED) ) reasons.push(`restored changes are ${JSON.stringify(sortedChanges(effect))}`);
		if ( (effect.statuses ?? []).length ) reasons.push("restored effect has statuses");
		if ( effect.name !== "Role: Corvette" ) reasons.push("restored effect name differs");
	}
	const sites = effectSites(data);
	if ( sites.length !== 1 || sites[0] !== `item ${ITEM_ID}` ) reasons.push(`effect id sites: ${sites.join(", ") || "none"}`);
	if ( (data.effects ?? []).some(entry => entry._id === ACTOR_EFFECT_ID) ) reasons.push("actor-level effect returned");
	const description = plain(item?.system?.description?.value);
	if ( !/fixed hardpoint/i.test(description) || !/damage rolls/i.test(description) ) reasons.push("description changed");
	const bonuses = corvetteAbilityEffects(data);
	if ( bonuses.length !== 1 ) reasons.push(`Role: Corvette ability effects: ${bonuses.join(", ") || "none"}`);
	return reasons;
}

function corvetteAbilityEffects(data) {
	return effectSites(data).length ? [`item ${ITEM_ID}`].filter(() => {
		const item = roleItem(data)[0];
		const effect = (item?.effects ?? []).find(entry => entry._id === EFFECT_ID);
		return Boolean(effect);
	}) : [];
}

function fail(lines) {
	console.log("Stopped. No file written.");
	for ( const line of lines ) console.log(`  - ${line}`);
	process.exitCode = 1;
}

function main() {
	const dryRun = process.argv.includes("--dry-run");
	const source = load();
	const postReasons = verifyPost(source.data);
	const actorAbsent = !source.text.includes(ACTOR_EFFECT_ID);
	if ( postReasons.length === 0 && actorAbsent ) {
		console.log("Post-correction: one mode 2 Role: Corvette effect is present and the actor copy is absent.");
		console.log("Post-correction dry run passed. No file written.");
		return;
	}
	const reasons = guardPre(source);
	if ( reasons.length ) return fail(reasons);
	const edited = insertEffect(source.text);
	if ( edited.error ) return fail([edited.error]);
	let after;
	try {
		after = YAML.load(edited.text);
	} catch (error) {
		return fail([`edited YAML did not parse: ${error.message}`]);
	}
	const verifyReasons = verifyPost(after);
	if ( verifyReasons.length ) return fail(verifyReasons);
	const beforeRest = JSON.parse(JSON.stringify(source.data));
	const afterRest = JSON.parse(JSON.stringify(after));
	const beforeItem = roleItem(beforeRest)[0];
	const afterItem = roleItem(afterRest)[0];
	beforeItem.effects = [];
	afterItem.effects = [];
	if ( !sameJson(beforeRest, afterRest) ) return fail(["a CR90 field outside the restored effect changed"]);
	console.log(`${dryRun ? "Would restore" : "Restoring"} ${EFFECT_ID} on ${ITEM_ID} at mode 2. ${ACTOR_EFFECT_ID} stays absent.`);
	if ( dryRun ) {
		console.log("Dry run passed. No file written.");
		return;
	}
	fs.writeFileSync(FILE, edited.text, "utf8");
	const written = YAML.load(fs.readFileSync(FILE, "utf8"));
	const writtenReasons = verifyPost(written);
	if ( writtenReasons.length ) return fail(writtenReasons.map(reason => `post-write ${reason}`));
	console.log("CR90 Role: Corvette effect restored and reparsed.");
}

main();
