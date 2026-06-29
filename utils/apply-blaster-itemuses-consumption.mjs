import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEAPONS_DIR = path.join(ROOT, "packs", "_source", "equipment", "weapons");
const SUPPORTED_AMMO_TYPES = new Set(["powerCell", "cartridge"]);

function walkYamlFiles(dir, out = []) {
	for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const fullPath = path.join(dir, entry.name);
		if ( entry.isDirectory() ) walkYamlFiles(fullPath, out);
		else if ( entry.name.endsWith(".yml") ) out.push(fullPath);
	}
	return out;
}

function getAmmoTypes(doc) {
	const types = doc?.system?.ammo?.types;
	if ( Array.isArray(types) && types.length ) return types;
	const legacyTypes = doc?.flags?.sw5e?.reload?.types;
	return Array.isArray(legacyTypes) ? legacyTypes : [];
}

function getReloadMax(doc) {
	const usesMax = Number(doc?.system?.uses?.max);
	if ( Number.isFinite(usesMax) && usesMax > 0 ) return usesMax;

	const flagRel = Number(
		doc?.flags?.sw5e?.properties?.rel
		?? doc?.flags?.sw5e?.properties?.reload
		?? doc?.flags?.sw5e?.properties?.ovr
	);
	return Number.isFinite(flagRel) && flagRel > 0 ? flagRel : 0;
}

function isManagedBlaster(doc) {
	if ( doc?.type !== "weapon" ) return false;
	if ( getReloadMax(doc) <= 0 ) return false;
	return getAmmoTypes(doc).some(type => SUPPORTED_AMMO_TYPES.has(type));
}

function getPropertyNumber(doc, key) {
	const value = Number(doc?.flags?.sw5e?.properties?.[key]);
	return Number.isFinite(value) && value > 0 ? value : 0;
}

function hasConsumptionTargets(activity) {
	return Array.isArray(activity?.consumption?.targets) && activity.consumption.targets.length > 0;
}

function applyItemUsesConsumption(activity, value) {
	if ( !activity || hasConsumptionTargets(activity) ) return false;
	const cost = Number(value);
	if ( !Number.isFinite(cost) || cost <= 0 ) return false;

	activity.consumption = {
		targets: [
			{
				type: "itemUses",
				target: "",
				value: String(cost)
			}
		]
	};
	return true;
}

function processDocument(doc) {
	if ( !isManagedBlaster(doc) ) return { changed: false, reason: "not-managed" };

	let changed = false;
	const reloadMax = getReloadMax(doc);

	if ( !doc.system ) doc.system = {};
	if ( !doc.system.uses ) doc.system.uses = {};

	const currentMax = doc.system.uses.max;
	if ( currentMax == null || currentMax === "" ) {
		doc.system.uses.max = String(reloadMax);
		changed = true;
	}

	const rapid = getPropertyNumber(doc, "rapid");
	const burst = getPropertyNumber(doc, "burst");
	const activities = doc.system.activities;
	if ( !activities || typeof activities !== "object" ) return { changed, reason: "no-activities" };

	for ( const activity of Object.values(activities) ) {
		if ( !activity || typeof activity !== "object" ) continue;

		if ( activity.type === "attack" ) {
			if ( applyItemUsesConsumption(activity, 1) ) changed = true;
			continue;
		}

		if ( activity.name === "Rapid Attack" ) {
			if ( rapid > 0 && applyItemUsesConsumption(activity, rapid) ) changed = true;
			continue;
		}

		if ( activity.name === "Burst Attack" ) {
			if ( burst > 0 && applyItemUsesConsumption(activity, burst) ) changed = true;
		}
	}

	return { changed, reason: changed ? "updated" : "unchanged" };
}

function main() {
	const files = walkYamlFiles(WEAPONS_DIR);
	let updated = 0;
	let skipped = 0;

	for ( const filePath of files ) {
		const doc = yaml.load(fs.readFileSync(filePath, "utf8"));
		const result = processDocument(doc);
		if ( !result.changed ) {
			skipped++;
			continue;
		}

		const out = yaml.dump(doc, {
			lineWidth: -1,
			noRefs: true,
			quotingType: "'",
			forceQuotes: false
		});
		fs.writeFileSync(filePath, out, "utf8");
		updated++;
		console.log(`OK ${path.relative(WEAPONS_DIR, filePath)}`);
	}

	console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${files.length} total`);
}

main();
