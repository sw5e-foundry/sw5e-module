/**
 * Change tier-0 Role ability adjustments from Custom (mode 0) to Add (mode 2).
 *
 * Usage: node ./utils/fix-starship-role-ability-modes.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FEATURES = path.join(ROOT, "packs", "_source", "starships", "starship-features");

const ABILITY_WORD = {
	str: "strength",
	dex: "dexterity",
	con: "constitution",
	int: "intelligence",
	wis: "wisdom",
	cha: "charisma"
};

const MANIFEST = [
	{
		file: "large/role-corvette.yml",
		name: "Role: Corvette",
		itemId: "2KEpnIbTdhgY06tF",
		effectId: "qQTMHDrpIch61Q7C",
		abilities: [
			["system.abilities.str.value", "1", 1],
			["system.abilities.dex.value", "1", 1]
		],
		movement: [
			["system.attributes.movement.space", "400", 5, 20],
			["system.attributes.movement.turn", "300", 5, 20]
		]
	},
	{
		file: "large/role-cruiser.yml",
		name: "Role: Cruiser",
		itemId: "pbaT5Kczi8eJD0u0",
		effectId: "qQTMHDrpIch61Q7C",
		abilities: [
			["system.abilities.wis.value", "1", 1],
			["system.abilities.str.value", "1", 1]
		],
		movement: [
			["system.attributes.movement.space", "400", 5, 20],
			["system.attributes.movement.turn", "300", 5, 20]
		]
	},
	{
		file: "large/role-explorer.yml",
		name: "Role: Explorer",
		itemId: "SgSw1dDCCvxPsfVs",
		effectId: "qQTMHDrpIch61Q7C",
		abilities: [
			["system.abilities.dex.value", "1", 1],
			["system.abilities.int.value", "1", 1]
		],
		movement: [
			["system.attributes.movement.space", "350", 5, 20],
			["system.attributes.movement.turn", "250", 5, 20]
		]
	}
];

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
	return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function abilityWord(key) {
	const ability = key.split(".")[2];
	return ABILITY_WORD[ability] ?? ability;
}

function changeView(change) {
	return [change?.key ?? null, String(change?.value), Number(change?.mode), change?.priority ?? null];
}

function rowKey(file, itemId, effectId, key) {
	return `${file}|${itemId}|${effectId}|${key}`;
}

function listRoleFiles(dir, prefix = "") {
	const found = [];
	for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		const full = path.join(dir, entry.name);
		if ( entry.isDirectory() ) found.push(...listRoleFiles(full, rel));
		else if ( entry.name.startsWith("role-") && entry.name.endsWith(".yml") ) found.push({ rel, full });
	}
	return found.sort((left, right) => left.rel.localeCompare(right.rel));
}

function loadRoles() {
	return listRoleFiles(FEATURES).map(entry => {
		const text = fs.readFileSync(entry.full, "utf8");
		return { ...entry, text, data: YAML.load(text) };
	});
}

function movementOf(effect) {
	const changes = effect?.changes ?? [];
	const space = changes.find(change => change.key === "system.attributes.movement.space");
	const turn = changes.find(change => change.key === "system.attributes.movement.turn");
	return { space, turn };
}

function collectRows(roles) {
	const rows = [];
	for ( const role of roles ) {
		const subtype = role.data?.system?.type?.subtype ?? "";
		for ( const effect of role.data?.effects ?? [] ) {
			const movement = movementOf(effect);
			for ( const change of effect.changes ?? [] ) {
				if ( !String(change.key ?? "").startsWith("system.abilities.") ) continue;
				if ( !String(change.key).endsWith(".value") ) continue;
				rows.push({
					file: role.rel,
					name: role.data?.name ?? "",
					itemId: role.data?._id ?? "",
					effectId: effect._id ?? "",
					key: change.key,
					value: String(change.value),
					mode: Number(change.mode),
					priority: change.priority ?? null,
					subtype,
					space: movement.space ? `${movement.space.value} mode ${Number(movement.space.mode)}` : "",
					turn: movement.turn ? `${movement.turn.value} mode ${Number(movement.turn.mode)}` : ""
				});
			}
		}
	}
	return rows;
}

function manifestIndex() {
	const index = new Map();
	for ( const entry of MANIFEST ) {
		for ( const [key, value, priority] of entry.abilities ) {
			index.set(rowKey(entry.file, entry.itemId, entry.effectId, key), { entry, key, value, priority });
		}
	}
	return index;
}

function printTable(rows, expected) {
	console.log("File\tRole\tItem\tEffect\tAbility\tValue\tMode\tExpected\tSpace\tTurn\tClassification");
	for ( const row of rows ) {
		const known = expected.get(rowKey(row.file, row.itemId, row.effectId, row.key));
		let classification = "already correct";
		if ( known && row.mode === 0 ) classification = "repair";
		else if ( known && row.mode === 2 ) classification = "repaired";
		else if ( row.mode !== 2 ) classification = "stop";
		const expectedMode = known || row.mode === 0 ? 2 : row.mode;
		console.log([
			row.file,
			row.name,
			row.itemId,
			row.effectId,
			row.key,
			row.value,
			row.mode,
			expectedMode,
			row.space,
			row.turn,
			classification
		].join("\t"));
	}
}

function effectFor(role, effectId) {
	return (role?.data?.effects ?? []).find(effect => effect._id === effectId) ?? null;
}

function identityProblems(roles) {
	const problems = [];
	const byFile = new Map(roles.map(role => [role.rel, role]));
	for ( const entry of MANIFEST ) {
		const role = byFile.get(entry.file);
		if ( !role ) {
			problems.push(`${entry.file} is missing`);
			continue;
		}
		if ( role.data?._id !== entry.itemId || role.data?.name !== entry.name ) {
			problems.push(`${entry.file} item identity is ${role.data?._id} ${role.data?.name}`);
		}
		if ( role.data?.system?.type?.subtype !== "role" ) problems.push(`${entry.file} subtype is not role`);
		const effect = effectFor(role, entry.effectId);
		if ( !effect ) {
			problems.push(`${entry.file} effect ${entry.effectId} is missing`);
			continue;
		}
		const description = plain(role.data?.system?.description?.value);
		if ( !/\+1/.test(description) ) problems.push(`${entry.file} description does not state +1`);
		for ( const [key] of entry.abilities ) {
			if ( !description.includes(abilityWord(key)) ) problems.push(`${entry.file} description does not name ${abilityWord(key)}`);
		}
		const actual = (effect.changes ?? []).map(changeView);
		const expected = [
			...entry.abilities.map(([key, value, priority]) => [key, value, null, priority]),
			...entry.movement.map(([key, value, mode, priority]) => [key, value, mode, priority])
		];
		if ( actual.length !== expected.length ) {
			problems.push(`${entry.file} change count is ${actual.length}`);
			continue;
		}
		for ( let index = 0; index < expected.length; index += 1 ) {
			const [key, value, mode, priority] = expected[index];
			const live = actual[index];
			if ( live[0] !== key || live[1] !== value || live[3] !== priority ) {
				problems.push(`${entry.file} change ${index + 1} is ${JSON.stringify(live)}`);
			} else if ( mode !== null && live[2] !== mode ) {
				problems.push(`${entry.file} ${key} mode is ${live[2]}`);
			}
		}
	}
	return problems;
}

function strayModeProblems(rows, expected) {
	const problems = [];
	for ( const row of rows ) {
		const known = expected.has(rowKey(row.file, row.itemId, row.effectId, row.key));
		if ( row.subtype === "role" && row.mode === 0 && !known ) problems.push(`unexpected mode 0: ${row.file} ${row.key}`);
		if ( ![0, 2].includes(row.mode) ) problems.push(`unsupported mode ${row.mode}: ${row.file} ${row.key}`);
		if ( known && !["0", "1"].includes(String(row.value)) && row.value !== "1" ) {
			problems.push(`${row.file} ${row.key} value is ${row.value}`);
		}
	}
	return problems;
}

function manifestModes(rows, expected) {
	const modes = [];
	for ( const [key, spec] of expected ) {
		const row = rows.find(candidate => rowKey(candidate.file, candidate.itemId, candidate.effectId, candidate.key) === key);
		if ( !row ) modes.push({ key, mode: null, spec });
		else modes.push({ key, mode: row.mode, spec, row });
	}
	return modes;
}

function classify(modes, problems) {
	if ( problems.length ) return { state: "invalid", problems };
	const missing = modes.filter(entry => entry.mode === null);
	if ( missing.length ) {
		return { state: "invalid", problems: missing.map(entry => `manifest row missing: ${entry.key}`) };
	}
	const atZero = modes.filter(entry => entry.mode === 0);
	const atTwo = modes.filter(entry => entry.mode === 2);
	const other = modes.filter(entry => entry.mode !== 0 && entry.mode !== 2);
	if ( other.length ) {
		return { state: "invalid", problems: other.map(entry => `${entry.key} mode is ${entry.mode}`) };
	}
	if ( atZero.length === modes.length ) return { state: "pre", problems: [] };
	if ( atTwo.length === modes.length ) return { state: "post", problems: [] };
	const partial = [
		...atZero.map(entry => `still mode 0: ${entry.key}`),
		...atTwo.map(entry => `already mode 2: ${entry.key}`)
	];
	return { state: "partial", problems: [`partial state: ${atTwo.length} repaired and ${atZero.length} still at mode 0`, ...partial] };
}

function replaceAbilityModes(text, abilities) {
	const lines = text.split(/\r?\n/);
	const pending = new Map(abilities.map(([key]) => [key, true]));
	for ( let index = 0; index < lines.length; index += 1 ) {
		const match = lines[index].match(/^\s*- key: (system\.abilities\.\w+\.value)$/);
		if ( !match || !pending.has(match[1]) ) continue;
		const modeLine = lines[index + 1] ?? "";
		if ( !/^\s+mode: 0$/.test(modeLine) ) return { error: `${match[1]} mode line is ${JSON.stringify(modeLine)}` };
		lines[index + 1] = modeLine.replace("mode: 0", "mode: 2");
		pending.delete(match[1]);
	}
	if ( pending.size ) return { error: `unreplaced keys: ${[...pending.keys()].join(", ")}` };
	return { text: joinLines(lines, text) };
}

function fail(lines) {
	console.log("Stopped. No file written.");
	for ( const line of lines ) console.log(`  - ${line}`);
	process.exitCode = 1;
}

function main() {
	const dryRun = process.argv.includes("--dry-run");
	const roles = loadRoles();
	const rows = collectRows(roles);
	const expected = manifestIndex();
	printTable(rows, expected);
	const problems = [...identityProblems(roles), ...strayModeProblems(rows, expected)];
	const decision = classify(manifestModes(rows, expected), problems);
	if ( decision.state === "post" ) {
		console.log("Post-repair: 6 ability changes are mode 2. No tier-0 ability change remains at mode 0.");
		console.log("Post-repair dry run passed. No file written.");
		return;
	}
	if ( decision.state !== "pre" ) return fail(decision.problems);
	console.log("Pre-repair: 6 ability changes are mode 0 and match the frozen manifest.");
	const edited = [];
	for ( const entry of MANIFEST ) {
		const role = roles.find(candidate => candidate.rel === entry.file);
		const next = replaceAbilityModes(role.text, entry.abilities);
		if ( next.error ) return fail([`${entry.file}: ${next.error}`]);
		const parsed = YAML.load(next.text);
		const before = YAML.load(role.text);
		const beforeEffect = (before.effects ?? []).find(effect => effect._id === entry.effectId);
		const afterEffect = (parsed.effects ?? []).find(effect => effect._id === entry.effectId);
		for ( const change of beforeEffect.changes ) {
			if ( String(change.key).startsWith("system.abilities.") ) change.mode = 2;
		}
		if ( JSON.stringify(before) !== JSON.stringify(parsed) ) return fail([`${entry.file} changed outside ability mode`]);
		edited.push({ role, text: next.text, afterEffect });
	}
	console.log(`${dryRun ? "Would change" : "Changing"} mode 0 to mode 2 in ${edited.length} files.`);
	if ( dryRun ) {
		console.log("Dry run passed. No file written.");
		return;
	}
	for ( const entry of edited ) fs.writeFileSync(entry.role.full, entry.text, "utf8");
	const reread = loadRoles();
	const after = classify(manifestModes(collectRows(reread), expected), [...identityProblems(reread), ...strayModeProblems(collectRows(reread), expected)]);
	if ( after.state !== "post" ) return fail(after.problems.map(problem => `post-write ${problem}`));
	console.log("Role ability modes updated and reparsed.");
}

main();
