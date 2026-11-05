/**
 * Separate guarded Drake text repairs.
 *
 * Usage:
 *   node ./utils/fix-drakes-text-repairs.mjs tuned-engines [--dry-run]
 *   node ./utils/fix-drakes-text-repairs.mjs fire-linked [--dry-run]
 *   node ./utils/fix-drakes-text-repairs.mjs ailerons [--dry-run]
 *
 * Descriptions are read from compendium source. Book text is not stored here.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DRAKES = path.join(ROOT, "packs", "_source", "drakes-shipyard");
const MODS = path.join(ROOT, "packs", "_source", "starships", "starship-modifications");

const SLAVE_OPENING = "You install a slave circuit in your ship to improve automation.";
const BOOST_MARKERS = ["Boost Engines", "bonus action"];
const SLAM_MARKER = "SubLight Acceleration Motor";

const TUNED = {
	file: "n-1-naboo-starfighter-custom.yml",
	actorId: "Ug33oVFGY7Qp3ufC",
	itemId: "V2EZCmDU7Sd6qXmi",
	effectId: "aox9hA3SJo66l6cy",
	slamItemId: "SodQqzh3yVc4s1Qp",
	sublightItemId: "qf6pDveEwnrkmjNQ",
	compendiumId: "Qt0Y1DWiU2ybVirE",
	compendiumFile: path.join(MODS, "universal", "tuned-engines.yml")
};

const FIRE_SOURCES = {
	mounting: path.join(MODS, "weapon", "fire-linked-mounting.yml"),
	reinforcement: path.join(MODS, "weapon", "fire-linked-weapon-reinforcement.yml"),
	compensator: path.join(MODS, "weapon", "fire-linked-variable-compensator.yml"),
	primer: path.join(MODS, "weapon", "fire-linked-primer.yml")
};

const FIRE_IDS = {
	mounting: "pa1DzHAExLc3Wp4j",
	reinforcement: "kOMRqFfo6NbckGTx",
	compensator: "bG6HBpQFiPH90PWm",
	primer: "zmwWPfuYfEU43Ofi"
};

const FIRE_LINKED = [
	["a-sf-01-b-wing-starfighter.yml", "Y0Vf2Yi6pPQjliD1", "J3KmNbejuZAr8wAo", "Fire-Linked Mounting", "mounting"],
	["a-sf-01-b-wing-starfighter.yml", "Y0Vf2Yi6pPQjliD1", "KW1ayIq86PK4ti4i", "Fire-Linked Mounting", "mounting"],
	["a-sf-01-b-wing-starfighter.yml", "Y0Vf2Yi6pPQjliD1", "sszDW04B1NEWAPLw", "Fire-Linked Variable Compensator", "compensator"],
	["a-sf-01-b-wing-starfighter.yml", "Y0Vf2Yi6pPQjliD1", "qoljxRRMt7nCmqMy", "Fire-Linked Weapon Reinforcement", "reinforcement"],
	["a-sf-01-b-wing-starfighter.yml", "Y0Vf2Yi6pPQjliD1", "Ed3DOzMHjrfQzvxF", "Fire-Linked Weapon Reinforcement", "reinforcement"],
	["arc-170-starfighter.yml", "B5AmMDBTT6TrfW5E", "oKPeuxmYUEKWhlAO", "Fire-Linked Mounting", "mounting"],
	["arc-170-starfighter.yml", "B5AmMDBTT6TrfW5E", "04ElV6rblq2sMal1", "Fire-Linked Mounting", "mounting"],
	["arc-170-starfighter.yml", "B5AmMDBTT6TrfW5E", "XbWSHlnUKeUJkCkK", "Fire-Linked Mounting", "mounting"],
	["arc-170-starfighter.yml", "B5AmMDBTT6TrfW5E", "6cj0OHWXJOLbBDi7", "Fire-Linked Mounting", "mounting"],
	["c-wing-corellian-b-wing.yml", "NYWhs7E7dXECVXNq", "FqfXAZPLTznwe0DK", "Fire-Linked Mounting", "mounting"],
	["chirdaki-deathseed.yml", "OMMoXTxtFhVheNdP", "DfMHLnTaKNGjdixz", "Fire-Linked Mounting", "mounting"],
	["chirdaki-deathseed.yml", "OMMoXTxtFhVheNdP", "b2XpgYG2Bu31EUSW", "Fire-Linked Weapon Reinforcement", "reinforcement"],
	["delta-7-aethersprite-class-light-interceptor-modified.yml", "FbzPxDn1FfeRvDym", "r0McwAYdIUVxf1PQ", "Fire-Linked Mounting", "mounting"],
	["delta-7-aethersprite-class-light-interceptor-modified.yml", "FbzPxDn1FfeRvDym", "udiNbsUC3rrRDY9X", "Fire-Linked Weapon Reinforcement", "reinforcement"],
	["dynamic-class-light-freighter.yml", "gawTKA6kzr7qNnnD", "59Fljg4T9kub4zTM", "Fire-Linked Mounting", "mounting"],
	["dynamic-class-light-freighter.yml", "gawTKA6kzr7qNnnD", "uEDXTyzevprJvYPp", "Fire-Linked Weapon Reinforcement", "reinforcement"],
	["m12-l-kimogila-heavy-fighter.yml", "zEXFY5OjrHTSUdjm", "1ibWjcB06Fq4twdZ", "Fire-Linked Variable Compensator", "compensator"],
	["m12-l-kimogila-heavy-fighter.yml", "zEXFY5OjrHTSUdjm", "pORZv00i7Hy9SUYi", "Fire-Linked Mounting (Note)", "mounting"],
	["m12-l-kimogila-heavy-fighter.yml", "zEXFY5OjrHTSUdjm", "JkBuzQbRASwxDPcu", "Fire-Linked Weapon Reinforcement", "reinforcement"],
	["m22-t-krayt-gunship.yml", "9pA2rg6Eme3DtR1h", "Q8VG8MSEn1e2uvzM", "Fire-Linked Mounting (Note)", "mounting"],
	["m22-t-krayt-gunship.yml", "9pA2rg6Eme3DtR1h", "b5pXfF8fqmtbDD1w", "Fire-Linked Weapon Reinforcement (Note)", "reinforcement"],
	["m22-t-krayt-gunship.yml", "9pA2rg6Eme3DtR1h", "LusgOBYUykS369lc", "Fire-Linked Primer (Note)", "primer"],
	["m4-c-dunelizard-fighter.yml", "WTLl7aWFzvM6C5TV", "38jSmrkPEitYqeVn", "Fire-Linked Mounting (Note)", "mounting"],
	["t-65-x-wing-starfighter.yml", "KIYZmULvhfmiOrC2", "k2RD7OH0UVRolp39", "Fire-Linked Mounting", "mounting"],
	["t-65-x-wing-starfighter.yml", "KIYZmULvhfmiOrC2", "5CXqw6ttS4ECYjW2", "Fire-Linked Weapon Reinforcement", "reinforcement"],
	["tie-d-defender.yml", "SuqAQa6LsY1hNJnI", "hqZpJCVCmphAf9Ur", "Fire-Linked Mounting (Note)", "mounting"],
	["tie-d-defender.yml", "SuqAQa6LsY1hNJnI", "SkPXUdsTKMlnbwnd", "Fire-Linked Reinforcement (Note)", "reinforcement"],
	["tie-in-interceptor.yml", "ajAHTOE1nFbXxusm", "mWnMaNkhjiT30VIp", "Fire-Linked Mounting", "mounting"],
	["tie-in-interceptor.yml", "ajAHTOE1nFbXxusm", "YUxMxvLLLSkBmB8c", "Fire-Linked Weapon Reinforcement", "reinforcement"],
	["x-wing-starfighter-advanced.yml", "1iE0TPVtIaqWPKRH", "gHZGRDjZUASmn5sJ", "Fire-Linked Mounting", "mounting"],
	["x-wing-starfighter-advanced.yml", "1iE0TPVtIaqWPKRH", "0e09tH1FYjWuEZBf", "Fire-Linked Primer", "primer"],
	["x-wing-starfighter-advanced.yml", "1iE0TPVtIaqWPKRH", "bpHEvxt3geISCLKV", "Fire-Linked Weapon Reinforcement", "reinforcement"],
	["yv-929-armed-freighter.yml", "LY8lY6F9nVqz7Km1", "8LnwtR66Ws5PYqnb", "Fire-Linked Mounting (Burst)", "mounting"],
	["yv-929-armed-freighter.yml", "LY8lY6F9nVqz7Km1", "OGWWpQRS2NuZzCVj", "Fire-Link Mounting (Particle)", "mounting"],
	["yv-929-armed-freighter.yml", "LY8lY6F9nVqz7Km1", "JmZTL0CADI4SeUig", "Fire-Link Reinforcement (Particle)", "reinforcement"]
].map(([file, actorId, itemId, name, base]) => ({ file, actorId, itemId, name, base }));

const AILERONS = [
	["akajor-class-shuttle.yml", "tRnGAAILKowm8n4T", "n2PyvLKrFdJ29WgP"],
	["delta-7-aethersprite-class-light-interceptor-modified.yml", "FbzPxDn1FfeRvDym", "FxogYcbDil0Eig1b"],
	["ef76-nebulon-b-escort-frigate-medical.yml", "8uUUatfcGjYMSKZr", "WZP3ZjIGof4CpEBF"],
	["ef76-nebulon-b-escort-frigate.yml", "MBlMVJlmhIjF9IqH", "V7tLotxCeARamq1Y"],
	["fang-class.yml", "uAzqh6bUJ4ZfKcol", "uqX0yNJkEZ6MAJdD"],
	["gat-12-skipray-blastboat.yml", "Bgqr4WNQpTzEIepj", "hQ1wwoqMfU6ZGRZI"],
	["nantex-class-territorial-defense-starfighter.yml", "bc83jDYGauWHxSjB", "ZO7Oq680QBKJSZVD"],
	["u-wing-starfighter-support-craft-ut-60d.yml", "8rxZGWKJJ2XbyhNl", "go3xpHa8UzNPbZ0b"]
].map(([file, actorId, itemId]) => ({ file, actorId, itemId }));

const TURN_KEY = "system.attributes.movement.turn";
const AILERON_FILE = path.join(MODS, "universal", "adaptive-ailerons.yml");

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

function sameJson(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function loadYaml(file) {
	return YAML.load(fs.readFileSync(file, "utf8"));
}

function loadDrake(file) {
	const full = path.join(DRAKES, file);
	const text = fs.readFileSync(full, "utf8");
	return { file, full, text, data: YAML.load(text) };
}

function topLevelBlocks(lines) {
	const blocks = [];
	let section = "";
	let current = null;
	const push = () => {
		if ( current ) blocks.push(current);
		current = null;
	};
	for ( let index = 0; index < lines.length; index += 1 ) {
		const line = lines[index];
		if ( /^[A-Za-z_]/.test(line) ) {
			push();
			section = line.split(":")[0];
			continue;
		}
		if ( (section === "items" || section === "effects") && /^  - _id: /.test(line) ) {
			push();
			current = {
				section,
				start: index,
				id: line.slice("  - _id: ".length).trim(),
				lines: [line]
			};
			continue;
		}
		if ( current ) current.lines.push(line);
	}
	push();
	return blocks;
}

function indentOf(line) {
	return line.match(/^ */)?.[0].length ?? 0;
}

function scalarEnd(lines, valueIndex) {
	const header = lines[valueIndex];
	const indent = indentOf(header);
	const rest = header.slice(header.indexOf(":") + 1).trim();
	if ( rest === ">" || rest === ">-" || rest === "|" || rest === "|-" ) {
		let end = valueIndex + 1;
		while ( end < lines.length ) {
			if ( lines[end].trim() === "" ) {
				end += 1;
				continue;
			}
			if ( indentOf(lines[end]) <= indent ) break;
			end += 1;
		}
		return end;
	}
	return valueIndex + 1;
}

function parsedScalar(lines, valueIndex, end) {
	const snippet = lines.slice(valueIndex, end).join("\n");
	const parsed = YAML.load(snippet);
	return parsed?.value;
}

function descriptionValueSites(lines) {
	const sites = [];
	let scope = "";
	for ( let index = 0; index < lines.length; index += 1 ) {
		if ( /^\s{4}(system|flags):\s*$/.test(lines[index]) ) scope = lines[index].trim().replace(":", "");
		const match = lines[index].match(/^(\s*)description:\s*$/);
		if ( !match ) continue;
		const next = index + 1;
		if ( next >= lines.length ) continue;
		const value = lines[next].match(/^(\s*)value:\s*/);
		if ( !value || value[1].length !== match[1].length + 2 ) continue;
		const end = scalarEnd(lines, next);
		sites.push({
			scope,
			valueIndex: next,
			end,
			indent: value[1],
			text: String(parsedScalar(lines, next, end) ?? "")
		});
	}
	return sites;
}

function replaceSites(lines, sites) {
	const next = lines.slice();
	for ( const site of [...sites].sort((left, right) => right.valueIndex - left.valueIndex) ) {
		const replacement = `${site.indent}value: ${JSON.stringify(site.replacement)}`;
		next.splice(site.valueIndex, site.end - site.valueIndex, replacement);
	}
	return next;
}

function removeNested(lines, header) {
	const start = lines.findIndex(line => line === header);
	if ( start < 0 ) return { error: `missing block ${header.trim()}` };
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
	return { lines: next };
}

function collapseEmptyKey(lines, key) {
	const next = lines.slice();
	for ( let index = 0; index < next.length; index += 1 ) {
		if ( next[index] !== `${" ".repeat(indentOf(next[index]))}${key}:` && !new RegExp(`^\\s+${key}:\\s*$`).test(next[index]) ) continue;
		if ( !/^\s+effects:\s*$/.test(next[index]) ) continue;
		const indent = indentOf(next[index]);
		let follower = index + 1;
		while ( follower < next.length && next[follower].trim() === "" ) follower += 1;
		if ( follower >= next.length || indentOf(next[follower]) <= indent ) {
			next[index] = `${" ".repeat(indent)}${key}: []`;
		}
	}
	return next;
}

function blankDescriptions(item) {
	const copy = JSON.parse(JSON.stringify(item));
	if ( copy.system?.description ) copy.system.description.value = "";
	if ( copy.flags?.sw5e?.legacyStarshipMod?.description ) copy.flags.sw5e.legacyStarshipMod.description.value = "";
	return copy;
}

function actorWithoutCollections(actor) {
	const copy = JSON.parse(JSON.stringify(actor));
	delete copy.items;
	delete copy.effects;
	return copy;
}

function inactiveDuration(duration) {
	if ( !duration ) return true;
	return Object.values(duration).every(value => value === null || value === undefined);
}

function isSlamText(value) {
	return String(value ?? "").includes(SLAM_MARKER);
}

function isSlaveText(value) {
	return String(value ?? "").includes(SLAVE_OPENING);
}

function isBoostText(value) {
	const text = String(value ?? "");
	return BOOST_MARKERS.every(marker => text.includes(marker)) && !text.includes(SLAM_MARKER);
}

function compendiumDescriptions(file, expectedId) {
	const data = loadYaml(file);
	if ( data?._id !== expectedId ) {
		throw new Error(`${path.basename(file)} _id is ${data?._id}, expected ${expectedId}`);
	}
	return {
		data,
		system: String(data.system?.description?.value ?? ""),
		legacy: String(data.flags?.sw5e?.legacyStarshipMod?.description?.value ?? "")
	};
}

function actorCopies(actor, itemId) {
	return (actor.effects ?? []).filter(effect => String(effect.origin ?? "").includes(`.Item.${itemId}`));
}

function applyItemEdits(source, edits) {
	const lines = source.text.split(/\r?\n/);
	const blocks = topLevelBlocks(lines);
	const ordered = [...edits].sort((left, right) => {
		const leftBlock = blocks.find(block => block.section === "items" && block.id === left.itemId);
		const rightBlock = blocks.find(block => block.section === "items" && block.id === right.itemId);
		return (rightBlock?.start ?? 0) - (leftBlock?.start ?? 0);
	});
	for ( const edit of ordered ) {
		const block = topLevelBlocks(lines).find(entry => entry.section === "items" && entry.id === edit.itemId);
		if ( !block ) return { error: `${source.file} item ${edit.itemId} block not found` };
		let blockLines = block.lines.slice();
		if ( edit.removeEffectId ) {
			const removed = removeNested(blockLines, `      - _id: ${edit.removeEffectId}`);
			if ( removed.error ) return { error: `${source.file} ${removed.error}` };
			blockLines = collapseEmptyKey(removed.lines, "effects");
		}
		if ( edit.replacements?.length ) {
			const sites = descriptionValueSites(blockLines);
			const used = new Set();
			const chosen = [];
			for ( const replacement of edit.replacements ) {
				const site = sites.find(entry => !used.has(entry.valueIndex) && entry.scope === replacement.scope && entry.text === replacement.current);
				if ( !site ) return { error: `${source.file} ${edit.itemId} description site not found` };
				used.add(site.valueIndex);
				chosen.push({ ...site, replacement: replacement.next });
			}
			blockLines = replaceSites(blockLines, chosen);
		}
		if ( edit.turnValue ) {
			const keyIndex = blockLines.findIndex(line => line.includes(`- key: ${TURN_KEY}`));
			if ( keyIndex < 0 ) return { error: `${source.file} ${edit.itemId} turn key not found` };
			const valueIndex = blockLines.slice(keyIndex, keyIndex + 4).findIndex(line => /^\s+value:/.test(line));
			if ( valueIndex < 0 ) return { error: `${source.file} ${edit.itemId} turn value not found` };
			const absolute = keyIndex + valueIndex;
			const indent = blockLines[absolute].match(/^\s*/)[0];
			blockLines[absolute] = `${indent}value: '-100'`;
		}
		lines.splice(block.start, block.lines.length, ...blockLines);
	}
	return { text: joinLines(lines, source.text) };
}

function fail(reasons) {
	console.log("Stopped. No files written for this repair.");
	for ( const reason of reasons ) console.log(`  - ${reason}`);
	process.exitCode = 1;
}

function runTuned(dryRun) {
	const compendium = compendiumDescriptions(TUNED.compendiumFile, TUNED.compendiumId);
	const reasons = [];
	if ( compendium.data.name !== "Tuned Engines" ) reasons.push("compendium item is not named Tuned Engines");
	if ( !isBoostText(compendium.system) || !isBoostText(compendium.legacy) ) {
		reasons.push("compendium description is not the Boost Engines text");
	}
	if ( (compendium.data.effects ?? []).length !== 0 ) reasons.push("compendium Tuned Engines has Active Effects");
	const source = loadDrake(TUNED.file);
	if ( source.data._id !== TUNED.actorId ) reasons.push(`actor is ${source.data._id}`);
	const item = (source.data.items ?? []).find(entry => entry._id === TUNED.itemId);
	const slam = (source.data.items ?? []).find(entry => entry._id === TUNED.slamItemId);
	const sublight = (source.data.items ?? []).find(entry => entry._id === TUNED.sublightItemId);
	if ( !item ) reasons.push("Tuned Engines item is absent");
	if ( !slam || slam.name !== "SLAM" ) reasons.push("SLAM item is absent");
	if ( !sublight ) reasons.push("Sublight Drive item is absent");
	const effect = (item?.effects ?? []).find(entry => entry._id === TUNED.effectId);
	const already = item && !effect
		&& item.system?.description?.value === compendium.system
		&& item.flags?.sw5e?.legacyStarshipMod?.description?.value === compendium.legacy
		&& actorCopies(source.data, TUNED.itemId).length === 0;
	if ( already && reasons.length === 0 ) {
		console.log("Tuned Engines is already repaired. No files written.");
		return;
	}
	if ( !effect ) reasons.push(`effect ${TUNED.effectId} is absent`);
	if ( effect ) {
		const change = effect.changes ?? [];
		const only = change.length === 1 && change[0].key === "system.attributes.movement.fly"
			&& Number(change[0].mode) === 2 && String(change[0].value) === "50";
		if ( !only ) reasons.push("effect is not only fly mode 2 value 50");
		if ( (effect.statuses ?? []).length ) reasons.push("effect has statuses");
		if ( !inactiveDuration(effect.duration) ) reasons.push("effect has an active duration");
		if ( effect.activities ) reasons.push("effect has activities");
		if ( effect.disabled ) reasons.push("effect is disabled");
		const extra = Object.keys(effect).filter(key => !["_id", "changes", "disabled", "duration", "origin", "transfer", "flags", "tint", "name", "description", "statuses", "_stats", "img", "type", "system", "sort", "_key"].includes(key));
		if ( extra.length ) reasons.push(`effect has additional fields ${extra.join(", ")}`);
		if ( Object.keys(effect.flags ?? {}).length ) reasons.push("effect flags are not empty");
	}
	if ( actorCopies(source.data, TUNED.itemId).length ) {
		reasons.push("an actor-level copy of Tuned Engines remains after the 927-effect cleanup");
	}
	const systemText = item?.system?.description?.value ?? "";
	const legacyText = item?.flags?.sw5e?.legacyStarshipMod?.description?.value ?? "";
	if ( item && !isSlamText(systemText) ) reasons.push("system description is not the SLAM text");
	if ( item && !isSlamText(legacyText) ) reasons.push("legacy description is not the SLAM text");
	if ( reasons.length ) return fail(reasons);

	const edited = applyItemEdits(source, [{
		itemId: TUNED.itemId,
		removeEffectId: TUNED.effectId,
		replacements: [
			{ scope: "system", current: systemText, next: compendium.system },
			{ scope: "flags", current: legacyText, next: compendium.legacy }
		]
	}]);
	if ( edited.error ) return fail([edited.error]);
	const after = YAML.load(edited.text);
	const verify = verifyTuned(source.data, after, compendium);
	if ( verify.length ) return fail(verify);
	console.log(`${TUNED.file}: ${dryRun ? "would update" : "updated"} ${TUNED.itemId}; removed ${TUNED.effectId}; SLAM and Sublight Drive blocks unchanged.`);
	if ( dryRun ) {
		console.log("Dry run passed. No files written.");
		return;
	}
	fs.writeFileSync(source.full, edited.text, "utf8");
	const written = YAML.load(fs.readFileSync(source.full, "utf8"));
	const writtenReasons = verifyTuned(source.data, written, compendium);
	if ( writtenReasons.length ) return fail(writtenReasons.map(reason => `post-write ${reason}`));
	console.log("Tuned Engines repair written and reparsed.");
}

function verifyTuned(before, after, compendium) {
	const reasons = [];
	if ( !sameJson(actorWithoutCollections(before), actorWithoutCollections(after)) ) {
		reasons.push("an actor field outside items and effects changed");
	}
	if ( !sameJson(before.effects ?? [], after.effects ?? []) ) reasons.push("actor effects changed");
	const beforeItems = new Map((before.items ?? []).map(item => [item._id, item]));
	const afterItems = new Map((after.items ?? []).map(item => [item._id, item]));
	if ( beforeItems.size !== afterItems.size ) reasons.push("item count changed");
	for ( const [id, item] of beforeItems ) {
		const next = afterItems.get(id);
		if ( !next ) {
			reasons.push(`item ${id} was removed`);
			continue;
		}
		if ( id === TUNED.slamItemId && !sameJson(next, item) ) reasons.push("SLAM item changed");
		if ( id === TUNED.sublightItemId && !sameJson(next, item) ) reasons.push("Sublight Drive item changed");
		if ( id !== TUNED.itemId && !sameJson(next, item) ) reasons.push(`item ${id} changed`);
	}
	const tuned = afterItems.get(TUNED.itemId);
	const prior = beforeItems.get(TUNED.itemId);
	if ( !tuned || !prior ) reasons.push("Tuned Engines item missing after edit");
	if ( tuned && prior ) {
		if ( (tuned.effects ?? []).length !== 0 ) reasons.push("Tuned Engines effect was not removed");
		if ( tuned.system?.description?.value !== compendium.system ) reasons.push("system description does not match the compendium");
		if ( tuned.flags?.sw5e?.legacyStarshipMod?.description?.value !== compendium.legacy ) {
			reasons.push("legacy description does not match the compendium");
		}
		const left = blankDescriptions(prior);
		const right = blankDescriptions(tuned);
		left.effects = [];
		right.effects = [];
		if ( !sameJson(left, right) ) reasons.push("Tuned Engines changed outside its description and effect");
	}
	return reasons;
}

function fireEntry(row) {
	return FIRE_LINKED.find(entry => entry.itemId === row);
}

function runFireLinked(dryRun) {
	if ( FIRE_LINKED.length !== 35 ) return fail([`manifest has ${FIRE_LINKED.length} ids, expected 35`]);
	const sources = {};
	const reasons = [];
	for ( const [base, file] of Object.entries(FIRE_SOURCES) ) {
		try {
			sources[base] = compendiumDescriptions(file, FIRE_IDS[base]);
		} catch (error) {
			reasons.push(error.message);
		}
		if ( sources[base] && !isSlaveText(sources[base].system) && isSlaveText(sources[base].system) ) {
			reasons.push(`${base} compendium text is unexpected`);
		}
		if ( sources[base] && isSlaveText(sources[base].system) ) reasons.push(`${base} compendium still has the Slave Circuit text`);
	}
	const byFile = new Map();
	let pending = 0;
	let repaired = 0;
	for ( const entry of FIRE_LINKED ) {
		const source = byFile.get(entry.file) ?? loadDrake(entry.file);
		byFile.set(entry.file, source);
		if ( source.data._id !== entry.actorId ) reasons.push(`${entry.file} actor is ${source.data._id}`);
		const item = (source.data.items ?? []).find(candidate => candidate._id === entry.itemId);
		if ( !item ) {
			reasons.push(`${entry.itemId} is absent`);
			continue;
		}
		if ( item.name !== entry.name ) reasons.push(`${entry.itemId} name is ${item.name}, expected ${entry.name}`);
		if ( (item.effects ?? []).length !== 0 ) reasons.push(`${entry.itemId} has effects`);
		const systemText = item.system?.description?.value;
		const legacy = item.flags?.sw5e?.legacyStarshipMod?.description;
		const legacyText = legacy ? legacy.value : null;
		const expected = sources[entry.base];
		if ( !expected ) continue;
		if ( systemText === undefined ) reasons.push(`${entry.itemId} has no system.description.value`);
		const systemSlave = isSlaveText(systemText);
		const legacySlave = legacyText !== null && isSlaveText(legacyText);
		if ( systemText !== undefined && !systemSlave && systemText !== expected.system ) {
			reasons.push(`${entry.itemId} system description is neither the Slave Circuit text nor the compendium text`);
		}
		if ( legacyText !== null && !legacySlave && legacyText !== expected.legacy ) {
			reasons.push(`${entry.itemId} legacy description is neither the Slave Circuit text nor the compendium text`);
		}
		if ( !systemSlave && !legacySlave && systemText === expected.system && (legacyText === null || legacyText === expected.legacy) ) {
			repaired += 1;
			continue;
		}
		if ( !systemSlave && legacyText !== null && !legacySlave ) {
			reasons.push(`${entry.itemId} has no Slave Circuit description to replace`);
		}
		pending += 1;
		entry.systemText = systemSlave ? systemText : null;
		entry.legacyText = legacySlave ? legacyText : null;
		entry.systemNext = expected.system;
		entry.legacyNext = expected.legacy;
	}
	if ( reasons.length ) return fail(reasons);
	if ( pending === 0 && repaired === 35 ) {
		console.log("Fire-Linked descriptions are already repaired. No files written.");
		return;
	}
	const editsByFile = new Map();
	for ( const entry of FIRE_LINKED ) {
		if ( !entry.systemText && !entry.legacyText ) continue;
		const replacements = [];
		if ( entry.systemText ) replacements.push({ scope: "system", current: entry.systemText, next: entry.systemNext });
		if ( entry.legacyText ) replacements.push({ scope: "flags", current: entry.legacyText, next: entry.legacyNext });
		const list = editsByFile.get(entry.file) ?? [];
		list.push({ itemId: entry.itemId, replacements });
		editsByFile.set(entry.file, list);
	}
	const written = [];
	for ( const [file, edits] of editsByFile ) {
		const source = byFile.get(file);
		const edited = applyItemEdits(source, edits);
		if ( edited.error ) return fail([edited.error]);
		let after;
		try {
			after = YAML.load(edited.text);
		} catch (error) {
			return fail([`${file} edited YAML did not parse: ${error.message}`]);
		}
		const verify = verifyFireFile(source.data, after, edits);
		if ( verify.length ) return fail(verify);
		written.push({ source, text: edited.text, edits });
	}
	console.log(`Fire-Linked: ${pending} items ${dryRun ? "would be updated" : "updated"} across ${written.length} files. ${repaired} already matched.`);
	if ( dryRun ) {
		console.log("Dry run passed. No files written.");
		return;
	}
	for ( const entry of written ) {
		fs.writeFileSync(entry.source.full, entry.text, "utf8");
		const parsed = YAML.load(fs.readFileSync(entry.source.full, "utf8"));
		const verify = verifyFireFile(entry.source.data, parsed, entry.edits);
		if ( verify.length ) return fail(verify.map(reason => `post-write ${reason}`));
	}
	console.log("Fire-Linked descriptions written and reparsed.");
}

function verifyFireFile(before, after, edits) {
	const reasons = [];
	if ( !sameJson(actorWithoutCollections(before), actorWithoutCollections(after)) ) reasons.push("an actor field changed");
	if ( !sameJson(before.effects ?? [], after.effects ?? []) ) reasons.push("actor effects changed");
	const editedIds = new Set(edits.map(edit => edit.itemId));
	const beforeItems = new Map((before.items ?? []).map(item => [item._id, item]));
	const afterItems = new Map((after.items ?? []).map(item => [item._id, item]));
	for ( const [id, item] of beforeItems ) {
		const next = afterItems.get(id);
		if ( !next ) {
			reasons.push(`item ${id} was removed`);
			continue;
		}
		if ( !editedIds.has(id) && !sameJson(next, item) ) reasons.push(`item ${id} changed`);
		if ( editedIds.has(id) ) {
			const left = blankDescriptions(item);
			const right = blankDescriptions(next);
			if ( !sameJson(left, right) ) reasons.push(`item ${id} changed outside its description`);
			if ( (next.effects ?? []).length !== (item.effects ?? []).length ) reasons.push(`item ${id} effects changed`);
			const row = FIRE_LINKED.find(entry => entry.itemId === id);
			const expected = row ? compendiumDescriptions(FIRE_SOURCES[row.base], FIRE_IDS[row.base]) : null;
			if ( expected && next.system?.description?.value !== expected.system ) reasons.push(`item ${id} system description mismatch`);
			if ( expected && item.flags?.sw5e?.legacyStarshipMod?.description && next.flags?.sw5e?.legacyStarshipMod?.description?.value !== expected.legacy ) {
				reasons.push(`item ${id} legacy description mismatch`);
			}
		}
	}
	return reasons;
}

function changeSignature(change) {
	return {
		key: change?.key ?? null,
		mode: Number(change?.mode),
		value: String(change?.value),
		priority: change?.priority ?? null
	};
}

function sortedChanges(changes) {
	return (changes ?? []).map(changeSignature).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function runAilerons(dryRun) {
	const compendium = loadYaml(AILERON_FILE);
	const compendiumEffect = (compendium.effects ?? [])[0];
	const compendiumChanges = sortedChanges(compendiumEffect?.changes);
	const turn = compendiumChanges.find(change => change.key === TURN_KEY);
	const reasons = [];
	if ( compendium._id !== "6WjkUMegKn0XeCNz" ) reasons.push("Adaptive Ailerons compendium id mismatch");
	if ( !turn || turn.value !== "-100" ) reasons.push("compendium turn value is not -100");
	const expected = compendiumChanges.map(change => change.key === TURN_KEY ? { ...change, value: "+100" } : change)
		.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
	if ( reasons.length ) return fail(reasons);
	const stopped = [];
	const pending = [];
	const repaired = [];
	for ( const entry of AILERONS ) {
		const source = loadDrake(entry.file);
		if ( source.data._id !== entry.actorId ) {
			stopped.push(`${entry.file} actor is ${source.data._id}`);
			continue;
		}
		const item = (source.data.items ?? []).find(candidate => candidate._id === entry.itemId);
		if ( !item || item.name !== "Adaptive Ailerons" ) {
			stopped.push(`${entry.itemId} is not the recorded Adaptive Ailerons item`);
			continue;
		}
		const effect = (item.effects ?? []).find(candidate => (candidate.changes ?? []).some(change => change.key === TURN_KEY));
		if ( !effect ) {
			stopped.push(`${entry.itemId} has no turn effect`);
			continue;
		}
		const actual = sortedChanges(effect.changes);
		const copies = actorCopies(source.data, entry.itemId);
		if ( copies.length ) {
			stopped.push(`${entry.file} ${entry.itemId} still has actor effect ${copies.map(copy => copy._id).join(", ")} originating from the item. The 927-effect cleanup should have removed an exact transferred copy; it was left in place and this record was not edited.`);
			continue;
		}
		const currentTurn = actual.find(change => change.key === TURN_KEY);
		if ( sameJson(actual, compendiumChanges) && currentTurn?.value === "-100" ) {
			repaired.push(entry.itemId);
			continue;
		}
		if ( !sameJson(actual, expected) ) {
			stopped.push(`${entry.itemId} changes are ${JSON.stringify(actual)}`);
			continue;
		}
		pending.push({ ...entry, source });
	}
	if ( stopped.length ) {
		console.log("Adaptive Ailerons stopped records:");
		for ( const reason of stopped ) console.log(`  - ${reason}`);
	}
	if ( !pending.length && stopped.length ) return fail(stopped);
	if ( !pending.length && repaired.length === AILERONS.length ) {
		console.log("Adaptive Ailerons are already repaired. No files written.");
		return;
	}
	const byFile = new Map();
	for ( const entry of pending ) {
		const list = byFile.get(entry.file) ?? [];
		list.push(entry);
		byFile.set(entry.file, list);
	}
	const ready = [];
	for ( const [file, entries] of byFile ) {
		const source = entries[0].source;
		const edited = applyItemEdits(source, entries.map(entry => ({ itemId: entry.itemId, turnValue: true })));
		if ( edited.error ) {
			stopped.push(edited.error);
			continue;
		}
		let after;
		try {
			after = YAML.load(edited.text);
		} catch (error) {
			stopped.push(`${file} did not parse: ${error.message}`);
			continue;
		}
		const verify = verifyAilerons(source.data, after, entries.map(entry => entry.itemId), compendiumChanges);
		if ( verify.length ) {
			stopped.push(...verify);
			continue;
		}
		ready.push({ source, text: edited.text, ids: entries.map(entry => entry.itemId) });
	}
	if ( stopped.length ) return fail(stopped);
	console.log(`Adaptive Ailerons: ${pending.length} items ${dryRun ? "would change" : "changed"} from +100 to -100. ${repaired.length} already -100.`);
	if ( dryRun ) {
		console.log("Dry run passed. No files written.");
		return;
	}
	for ( const entry of ready ) {
		fs.writeFileSync(entry.source.full, entry.text, "utf8");
		const parsed = YAML.load(fs.readFileSync(entry.source.full, "utf8"));
		const verify = verifyAilerons(entry.source.data, parsed, entry.ids, compendiumChanges);
		if ( verify.length ) return fail(verify.map(reason => `post-write ${reason}`));
	}
	console.log("Adaptive Ailerons written and reparsed.");
}

function verifyAilerons(before, after, ids, compendiumChanges) {
	const reasons = [];
	if ( !sameJson(actorWithoutCollections(before), actorWithoutCollections(after)) ) reasons.push("an actor field changed");
	if ( !sameJson(before.effects ?? [], after.effects ?? []) ) reasons.push("actor effects changed");
	const wanted = new Set(ids);
	const beforeItems = new Map((before.items ?? []).map(item => [item._id, item]));
	const afterItems = new Map((after.items ?? []).map(item => [item._id, item]));
	for ( const [id, item] of beforeItems ) {
		const next = afterItems.get(id);
		if ( !next ) {
			reasons.push(`item ${id} was removed`);
			continue;
		}
		if ( !wanted.has(id) && !sameJson(next, item) ) reasons.push(`item ${id} changed`);
		if ( wanted.has(id) ) {
			const left = JSON.parse(JSON.stringify(item));
			const right = JSON.parse(JSON.stringify(next));
			for ( const effect of [...(left.effects ?? []), ...(right.effects ?? [])] ) {
				for ( const change of effect.changes ?? [] ) {
					if ( change.key === TURN_KEY ) change.value = "-100";
				}
			}
			if ( !sameJson(left, right) ) reasons.push(`item ${id} changed outside the turn value`);
			const effect = (next.effects ?? []).find(candidate => (candidate.changes ?? []).some(change => change.key === TURN_KEY));
			if ( !sameJson(sortedChanges(effect?.changes), compendiumChanges) ) {
				reasons.push(`item ${id} turn effect does not match the compendium after the sign change`);
			}
		}
	}
	return reasons;
}

function main() {
	const [operation, ...rest] = process.argv.slice(2).filter(argument => argument !== "--dry-run");
	const dryRun = process.argv.includes("--dry-run");
	if ( rest.length ) {
		fail([`unexpected arguments ${rest.join(" ")}`]);
		return;
	}
	if ( operation === "tuned-engines" ) return runTuned(dryRun);
	if ( operation === "fire-linked" ) return runFireLinked(dryRun);
	if ( operation === "ailerons" ) return runAilerons(dryRun);
	console.log("Usage: node ./utils/fix-drakes-text-repairs.mjs <tuned-engines|fire-linked|ailerons> [--dry-run]");
	process.exitCode = 1;
}

main();
