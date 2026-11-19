/**
 * Remove five Drake's Shipyard Role Spec duplicates and their actor-level copies.
 *
 * Each deletion is authorized by a fixed file, actor, item, effect, and retained-item id.
 * A file is left untouched when validation fails.
 *
 * Usage: node ./utils/fix-drakes-role-spec-duplicates.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRAKES = path.resolve(__dirname, "..", "packs", "_source", "drakes-shipyard");

const TARGETS = [
	{
		file: "akajor-class-shuttle.yml",
		actorId: "tRnGAAILKowm8n4T",
		specItemId: "BQ1QP4pDtSswfpEk",
		specActorEffectId: "vrbxUmzq0uXtKnJ4",
		roleItemId: "4lOzKTxQ6X75iRE3",
		roleActorEffectId: "ljLwuvSxNPAaYg0h"
	},
	{
		file: "arc-170-starfighter.yml",
		actorId: "B5AmMDBTT6TrfW5E",
		specItemId: "3LpnhMKSnfj2kweZ",
		specActorEffectId: "cYTnq6omxIAHtLjz",
		roleItemId: "546iyB7I0mfBCOgu",
		roleActorEffectId: "FVqRY2kv3xER04iZ"
	},
	{
		file: "u-wing-starfighter-support-craft-ut-60d.yml",
		actorId: "8rxZGWKJJ2XbyhNl",
		specItemId: "CuY0bUBgTMQ5QG5t",
		specActorEffectId: "gW3SJJLUPgQdHGuX",
		roleItemId: "N1N52oykBJ5Folkw",
		roleActorEffectId: "L84UThMvDvqf6H1M"
	},
	{
		file: "ef76-nebulon-b-escort-frigate.yml",
		actorId: "MBlMVJlmhIjF9IqH",
		specItemId: "zkaANU1XMiQGdlf0",
		specActorEffectId: "iaFkhGXZPYZSPcJ9",
		roleItemId: "hPR9d0SurUXfVjST",
		roleActorEffectId: "8tk2F87OOlpiQFHA"
	},
	{
		file: "ef76-nebulon-b-escort-frigate-medical.yml",
		actorId: "8uUUatfcGjYMSKZr",
		specItemId: "PDWg1DWCwL0eiu32",
		specActorEffectId: "chOWaILOZPSmcELU",
		roleItemId: "SmRAAX8SFDt14PXt",
		roleActorEffectId: "2ZpwP0uyFsQLeKaP"
	}
];

const DETAILS_ROLE_KEY = "system.details.role";

function normText(value) {
	return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function sameJson(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function byId(list, id) {
	return (list ?? []).filter(entry => entry?._id === id);
}

function changeSignature(change) {
	return JSON.stringify({
		key: change?.key,
		mode: change?.mode,
		value: change?.value
	});
}

function normalizeEffectFlags(flags) {
	const copy = JSON.parse(JSON.stringify(flags ?? {}));
	if ( copy?.core?.statusId === "" ) delete copy.core.statusId;
	if ( copy.core && Object.keys(copy.core).length === 0 ) delete copy.core;
	return copy;
}

function mechanicalSystem(system) {
	const copy = JSON.parse(JSON.stringify(system ?? {}));
	if ( copy.type && Object.prototype.hasOwnProperty.call(copy.type, "subtype") ) delete copy.type.subtype;
	if ( copy.attributes?.speed ) delete copy.attributes.speed;
	if ( copy.attributes && Object.keys(copy.attributes).length === 0 ) delete copy.attributes;
	return copy;
}

function normalizedDescription(description) {
	const out = {};
	for ( const [key, value] of Object.entries(description ?? {}) ) {
		out[key] = typeof value === "string" ? normText(value) : value;
	}
	return out;
}

function validateTarget(data, target) {
	const reasons = [];
	if ( data?._id !== target.actorId ) {
		reasons.push(`actor _id is ${data?._id ?? "missing"}, expected ${target.actorId}`);
	}
	if ( target.specItemId === target.roleItemId ) reasons.push("targeted and retained item ids are the same");

	const specItems = byId(data.items, target.specItemId);
	const roleItems = byId(data.items, target.roleItemId);
	const specEffects = byId(data.effects, target.specActorEffectId);
	const roleEffects = byId(data.effects, target.roleActorEffectId);
	if ( specItems.length !== 1 ) reasons.push(`targeted item ${target.specItemId} count is ${specItems.length}`);
	if ( roleItems.length !== 1 ) reasons.push(`retained item ${target.roleItemId} count is ${roleItems.length}`);
	if ( specEffects.length !== 1 ) reasons.push(`targeted actor effect ${target.specActorEffectId} count is ${specEffects.length}`);
	if ( roleEffects.length !== 1 ) reasons.push(`retained actor effect ${target.roleActorEffectId} count is ${roleEffects.length}`);
	if ( reasons.length ) return reasons;

	const spec = specItems[0];
	const role = roleItems[0];
	const specActorEffect = specEffects[0];
	if ( !sameJson(normalizedDescription(spec.system?.description), normalizedDescription(role.system?.description)) ) {
		reasons.push("specialization descriptions differ");
	}
	if ( !sameJson(mechanicalSystem(spec.system), mechanicalSystem(role.system)) ) {
		reasons.push("system data differs outside subtype and attributes.speed");
	}
	if ( !sameJson(spec.system?.activities ?? null, role.system?.activities ?? null) ) {
		reasons.push("activities differ");
	}

	const specItemEffects = spec.effects ?? [];
	const roleItemEffects = role.effects ?? [];
	if ( specItemEffects.length !== roleItemEffects.length ) {
		reasons.push(`item effect count ${specItemEffects.length} does not match retained ${roleItemEffects.length}`);
	}
	const roleChangeSet = new Set(roleItemEffects.flatMap(effect => effect.changes ?? []).map(changeSignature));
	for ( const effect of specItemEffects ) {
		for ( const change of effect.changes ?? [] ) {
			if ( change.key === DETAILS_ROLE_KEY ) continue;
			if ( !roleChangeSet.has(changeSignature(change)) ) {
				reasons.push(`targeted item effect has unique change ${change.key}`);
			}
		}
	}
	for ( let index = 0; index < Math.min(specItemEffects.length, roleItemEffects.length); index += 1 ) {
		const left = specItemEffects[index];
		const right = roleItemEffects[index];
		if ( !sameJson(normalizeEffectFlags(left.flags), normalizeEffectFlags(right.flags)) ) {
			reasons.push(`item effect ${index} flags differ`);
		}
		if ( !sameJson(left.duration ?? null, right.duration ?? null) ) reasons.push(`item effect ${index} duration differs`);
		if ( (left.disabled ?? false) !== (right.disabled ?? false) ) reasons.push(`item effect ${index} disabled differs`);
	}

	const expectedOrigin = `Actor.${target.actorId}.Item.${target.specItemId}`;
	if ( specActorEffect.origin !== expectedOrigin ) {
		reasons.push(`actor effect origin is ${specActorEffect.origin ?? "missing"}`);
	}
	if ( specActorEffect.transfer !== false ) reasons.push(`actor effect transfer is ${specActorEffect.transfer}`);
	const itemChanges = specItemEffects.flatMap(effect => effect.changes ?? []);
	if ( !sameJson(specActorEffect.changes ?? [], itemChanges) ) {
		reasons.push("actor effect changes are not the targeted item effect changes");
	}
	const detailKeys = new Set(itemChanges.map(change => change.key));
	if ( detailKeys.size !== 1 || !detailKeys.has(DETAILS_ROLE_KEY) ) {
		reasons.push("targeted effect changes are not only system.details.role");
	}
	if ( !sameJson(specActorEffect.statuses ?? [], specItemEffects[0]?.statuses ?? []) ) {
		reasons.push("actor effect statuses differ from the targeted item effect");
	}
	if ( !sameJson(specActorEffect.flags ?? {}, specItemEffects[0]?.flags ?? {}) ) {
		reasons.push("actor effect flags differ from the targeted item effect");
	}

	const origins = (data.effects ?? []).filter(effect => effect.origin === expectedOrigin);
	if ( origins.length !== 1 || origins[0]._id !== target.specActorEffectId ) {
		reasons.push(`actor effects pointing at the targeted item: ${origins.map(effect => effect._id).join(", ") || "none"}`);
	}
	if ( roleEffects[0].origin !== `Actor.${target.actorId}.Item.${target.roleItemId}` ) {
		reasons.push("retained actor effect does not originate from the retained item");
	}
	return reasons;
}

function newlineOf(text) {
	return text.includes("\r\n") ? "\r\n" : "\n";
}

function yamlDumpChurns(text, data) {
	const dumped = YAML.dump(data).replace(/\r?\n/g, "\n");
	const original = text.replace(/\r?\n/g, "\n");
	return dumped !== original;
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

function assertCollection(preList, postList, removedId, label, reasons) {
	const pre = new Map((preList ?? []).map(entry => [entry._id, entry]));
	const post = new Map((postList ?? []).map(entry => [entry._id, entry]));
	if ( post.has(removedId) ) reasons.push(`${label} ${removedId} is still present`);
	if ( (postList ?? []).length !== (preList ?? []).length - 1 ) {
		reasons.push(`${label} count ${postList?.length ?? 0}, expected ${(preList?.length ?? 0) - 1}`);
	}
	for ( const [id, entry] of pre ) {
		if ( id === removedId ) continue;
		if ( !post.has(id) ) reasons.push(`${label} ${id} was removed`);
		else if ( !sameJson(post.get(id), entry) ) reasons.push(`${label} ${id} changed`);
	}
	for ( const id of post.keys() ) {
		if ( !pre.has(id) ) reasons.push(`${label} ${id} was added`);
	}
}

function orphanedOrigins(data) {
	const itemIds = new Set((data.items ?? []).map(item => item._id));
	const orphans = [];
	const visit = effect => {
		const origin = String(effect?.origin ?? "");
		const match = origin.match(/\.Item\.([A-Za-z0-9]+)$/);
		if ( match && !itemIds.has(match[1]) ) orphans.push(`${effect._id} -> ${match[1]}`);
	};
	for ( const effect of data.effects ?? [] ) visit(effect);
	for ( const item of data.items ?? [] ) {
		for ( const effect of item.effects ?? [] ) visit(effect);
	}
	return orphans;
}

function verifyEdited(before, after, target) {
	const reasons = [];
	assertCollection(before.items, after.items, target.specItemId, "item", reasons);
	assertCollection(before.effects, after.effects, target.specActorEffectId, "actor effect", reasons);
	const retainedItem = (after.items ?? []).find(item => item._id === target.roleItemId);
	const retainedEffect = (after.effects ?? []).find(effect => effect._id === target.roleActorEffectId);
	if ( !retainedItem ) reasons.push(`retained item ${target.roleItemId} is absent`);
	if ( !retainedEffect ) reasons.push(`retained actor effect ${target.roleActorEffectId} is absent`);
	const orphans = orphanedOrigins(after);
	if ( orphans.length ) reasons.push(`orphaned origins: ${orphans.join(", ")}`);
	return reasons;
}

function countRoleSpecs(dir) {
	let count = 0;
	for ( const file of fs.readdirSync(dir).filter(name => name.endsWith(".yml")) ) {
		const data = YAML.load(fs.readFileSync(path.join(dir, file), "utf8"));
		for ( const item of data.items ?? [] ) {
			if ( String(item.name ?? "").startsWith("Role Spec:") ) count += 1;
		}
	}
	return count;
}

function main() {
	const dryRun = process.argv.includes("--dry-run");
	let failed = 0;
	let updated = 0;
	for ( const target of TARGETS ) {
		const full = path.join(DRAKES, target.file);
		const raw = fs.readFileSync(full, "utf8");
		const before = YAML.load(raw);
		const reasons = validateTarget(before, target);
		if ( reasons.length ) {
			failed += 1;
			console.log(`${target.file}: ABORT`);
			for ( const reason of reasons ) console.log(`  - ${reason}`);
			continue;
		}
		if ( yamlDumpChurns(raw, before) ) {
			console.log(`${target.file}: YAML.dump rewrites unrelated lines; removing the two id blocks in place`);
		}
		const removed = removeTopLevelEntries(raw, [target.specItemId, target.specActorEffectId]);
		const missing = [target.specItemId, target.specActorEffectId].filter(id => removed.found.get(id) !== 1);
		if ( missing.length ) {
			failed += 1;
			console.log(`${target.file}: ABORT`);
			console.log(`  - block removal matched ${missing.join(", ")} ${missing.map(id => removed.found.get(id) ?? 0).join(", ")} time(s)`);
			continue;
		}
		let after;
		try {
			after = YAML.load(removed.text);
		} catch (error) {
			failed += 1;
			console.log(`${target.file}: ABORT`);
			console.log(`  - edited YAML did not parse: ${error.message}`);
			continue;
		}
		const verifyReasons = verifyEdited(before, after, target);
		if ( verifyReasons.length ) {
			failed += 1;
			console.log(`${target.file}: ABORT`);
			for ( const reason of verifyReasons ) console.log(`  - ${reason}`);
			continue;
		}
		const specName = before.items.find(item => item._id === target.specItemId)?.name;
		console.log(
			`${target.file}: ${dryRun ? "would remove" : "removed"} ${specName} ${target.specItemId} `
			+ `and actor effect ${target.specActorEffectId}; kept ${target.roleItemId} and ${target.roleActorEffectId}; `
			+ `items ${before.items.length} -> ${after.items.length}, effects ${before.effects.length} -> ${after.effects.length}`
		);
		if ( dryRun ) continue;
		fs.writeFileSync(full, removed.text, "utf8");
		const written = YAML.load(fs.readFileSync(full, "utf8"));
		const writtenReasons = verifyEdited(before, written, target);
		if ( writtenReasons.length ) {
			failed += 1;
			console.log(`${target.file}: POST-WRITE MISMATCH`);
			for ( const reason of writtenReasons ) console.log(`  - ${reason}`);
			continue;
		}
		updated += 1;
		console.log(`${target.file}: reparsed; targeted ids absent; retained ids unchanged; no orphaned origins`);
	}

	const roleSpecCount = countRoleSpecs(DRAKES);
	const expected = dryRun ? 47 : 42;
	console.log(`Role Spec: count is ${roleSpecCount} (expected ${expected}).`);
	if ( roleSpecCount !== expected ) {
		failed += 1;
		console.log("Global Role Spec count mismatch.");
	}
	if ( failed ) {
		console.log(`Stopped with ${failed} failure(s). ${updated} file(s) written.`);
		process.exitCode = 1;
		return;
	}
	console.log(dryRun ? "Dry run passed. No files written." : `Done. ${updated} files written.`);
}

main();
