#!/usr/bin/env node
/**
 * Offline tests: Recharge / Refitting / Regen relocated to Starship sidebar vitals.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EN = JSON.parse(fs.readFileSync(path.join(ROOT, "languages/en.json"), "utf8"));
const VITALS = fs.readFileSync(path.join(ROOT, "templates/starship-sidebar-vitals.hbs"), "utf8");
const LAYER = fs.readFileSync(path.join(ROOT, "templates/starship-sheet-layer.hbs"), "utf8");
const DELEGATES = fs.readFileSync(path.join(ROOT, "scripts/patch/starship-sheet-delegates.mjs"), "utf8");
const PARTIAL = fs.readFileSync(path.join(ROOT, "scripts/patch/starship-sheet-partial.mjs"), "utf8");
const SHEET = fs.readFileSync(path.join(ROOT, "scripts/patch/starship-sheet.mjs"), "utf8");
const FA_CSS_RELATIVE = path.join("resources", "app", "public", "fonts", "fontawesome", "css", "all.min.css");
const FA_CSS_CANDIDATES = [
	process.env.FOUNDRY_VTT_APP ? path.join(process.env.FOUNDRY_VTT_APP, FA_CSS_RELATIVE) : null,
	"C:\\Foundry\\FoundryV14\\App\\resources\\app\\public\\fonts\\fontawesome\\css\\all.min.css",
	"C:\\Program Files\\Foundry Virtual Tabletop\\resources\\app\\public\\fonts\\fontawesome\\css\\all.min.css"
].filter(Boolean);
const FA_CSS = FA_CSS_CANDIDATES.find(candidate => fs.existsSync(candidate));

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function extractRepairActions(html) {
	const re = /data-sw5e-repair-action="([^"]+)"[\s\S]*?<i class="([^"]+)"/g;
	const out = [];
	let match;
	while ( (match = re.exec(html)) ) {
		out.push({ action: match[1], iconClass: match[2] });
	}
	return out;
}

test("Core-body Recharge/Refitting/Regen row removed", () => {
	assert.doesNotMatch(LAYER, /sw5e-starship-core-repair/);
	assert.doesNotMatch(LAYER, /sw5e-starship-core-repair-panel/);
	assert.doesNotMatch(LAYER, /class="sw5e-starship-repair-action"/);
	assert.doesNotMatch(LAYER, /data-sw5e-repair-action=/);
	assert.doesNotMatch(PARTIAL, /sw5e-starship-core-repair-panel/);
	assert.doesNotMatch(SHEET, /sw5e-starship-core-repair-panel/);
});

test("Sidebar vitals contain exactly three repair controls in order", () => {
	const actions = extractRepairActions(VITALS);
	assert.equal(actions.length, 3);
	assert.deepEqual(actions.map(a => a.action), ["recharge", "refitting", "regen"]);
	assert.match(actions[0].iconClass, /fa-solid\s+fa-screwdriver-wrench/);
	assert.match(actions[1].iconClass, /fa-solid\s+fa-anchor/);
	assert.match(actions[2].iconClass, /fa-solid\s+fa-shield-plus/);
	assert.match(VITALS, /sw5e-starship-sidebar-repair-actions/);
	assert.match(
		VITALS,
		/sw5e-starship-sidebar-repair-actions[\s\S]*sw5e-starship-vital-meter--primary/
	);
});

test("Each sidebar control uses short localized tooltip and aria-label keys", () => {
	assert.equal(EN["SW5E.Recharge"], "Recharge");
	assert.equal(EN["SW5E.Refitting"], "Refitting");
	assert.equal(EN["SW5E.Regen"], "Regen");
	for ( const [action, key] of [
		["recharge", "SW5E.Recharge"],
		["refitting", "SW5E.Refitting"],
		["regen", "SW5E.Regen"]
	] ) {
		const block = VITALS.match(
			new RegExp(`data-sw5e-repair-action="${action}"[\\s\\S]*?<\\/button>`, "m")
		)?.[0];
		assert.ok(block, `missing ${action} button`);
		assert.match(block, new RegExp(`title="\\{\\{localize "${key}"\\}\\}"`));
		assert.match(block, new RegExp(`aria-label="\\{\\{localize "${key}"\\}\\}"`));
		assert.doesNotMatch(block, /RechargeRepair|RefittingRepair|RegenRepair/);
	}
});

test("Existing repair delegate remains the single data-sw5e-repair-action router", () => {
	assert.match(DELEGATES, /export function ensureStarshipRepairDelegate/);
	assert.match(DELEGATES, /data-sw5e-repair-action/);
	assert.match(DELEGATES, /openRechargeRepairDialog/);
	assert.match(DELEGATES, /openRefittingRepairDialog/);
	assert.match(DELEGATES, /openRegenRepairDialog/);
	assert.match(DELEGATES, /app\?\.isEditable === false/);
	assert.equal((DELEGATES.match(/export function ensureStarshipRepairDelegate/g) ?? []).length, 1);
	assert.equal((SHEET.match(/ensureStarshipRepairDelegate\(root, app\)/g) ?? []).length, 1);
});

test("Flight Manifest and Bug 6 membership-hidden markup remain", () => {
	assert.match(LAYER, /SW5E\.StarshipCrewPanelTitle/);
	assert.match(LAYER, /sw5e-starship-crew-panel-count[^>]*>\(\{\{crew\.visibleQuantitySum\}\}\)/);
	assert.match(LAYER, /sw5e-crew-row--membership-hidden/);
	assert.doesNotMatch(LAYER, /sw5e-starship-crew-status/);
});

test("Foundry runtime Font Awesome includes all three approved icons", () => {
	assert.equal(
		typeof FA_CSS,
		"string",
		`Missing Foundry FA CSS. Tried: ${FA_CSS_CANDIDATES.join("; ")}`
	);
	const css = fs.readFileSync(FA_CSS, "utf8");
	for ( const icon of ["fa-screwdriver-wrench", "fa-anchor", "fa-shield-plus"] ) {
		assert.equal(css.includes(icon), true, `Font Awesome missing ${icon}`);
	}
});

console.log(`\n${passed} tests passed`);
