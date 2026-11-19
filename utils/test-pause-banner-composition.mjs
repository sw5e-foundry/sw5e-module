#!/usr/bin/env node
/**
 * Offline tests: SW5e Pause banner composition (core branding, not theme subsystem).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAUSE_LESS = fs.readFileSync(
	path.join(ROOT, "styles/less/update/components/pause-overlay.less"),
	"utf8"
);
const MODULE_LESS = fs.readFileSync(path.join(ROOT, "styles/less/module.less"), "utf8");
const MODULE_CSS = fs.readFileSync(path.join(ROOT, "styles/module.css"), "utf8");
const INNER = path.join(ROOT, "assets/ui/pause-inner.svg");
const OUTER = path.join(ROOT, "assets/ui/pause-outer.svg");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

test("pause-overlay.less remains imported from module.less", () => {
	assert.match(MODULE_LESS, /update\/components\/pause-overlay\.less/);
});

test("pause SVG assets exist and remain referenced", () => {
	assert.equal(fs.existsSync(INNER), true);
	assert.equal(fs.existsSync(OUTER), true);
	assert.match(PAUSE_LESS, /assets\/ui\/pause-inner\.svg/);
	assert.match(PAUSE_LESS, /assets\/ui\/pause-outer\.svg/);
});

test("banner root #pause is not resized or repositioned", () => {
	// No height/width/top/bottom/left/right on bare #pause { ... } block beyond color.
	const rootBlock = PAUSE_LESS.match(/#pause \{[^}]+\}/);
	assert.ok(rootBlock, "expected #pause color block");
	assert.doesNotMatch(rootBlock[0], /\b(height|width|top|bottom|left|right|opacity|background)\s*:/);
});

test("hologram and GAME PAUSED have independent vertical ownership", () => {
	assert.match(PAUSE_LESS, /justify-content:\s*flex-end/);
	assert.match(PAUSE_LESS, /padding-bottom:\s*[1-9][\d.]*rem/);
	assert.match(PAUSE_LESS, /top:\s*\d*\.?\d+rem/);
	assert.doesNotMatch(PAUSE_LESS, /top:\s*-[\d.]+rem/);
	const withoutComments = PAUSE_LESS.replace(/\/\*[\s\S]*?\*\//g, "");
	assert.doesNotMatch(withoutComments, /top:\s*-112px/);
});

test("hologram horizontal centering does not overwrite animation transform", () => {
	assert.match(PAUSE_LESS, /left:\s*50%/);
	assert.match(PAUSE_LESS, /margin-left:\s*-64px/);
	assert.match(PAUSE_LESS, /@keyframes sw5e-pause-spin/);
	assert.match(PAUSE_LESS, /transform:\s*rotate\(0deg\)/);
	assert.match(PAUSE_LESS, /transform:\s*rotate\(360deg\)/);
	// Static translate centering must not appear on the animated pseudo rules.
	const pseudoShared = PAUSE_LESS.match(
		/figcaption::before,\s*\n#pause:has\([^\)]+\) figcaption::after \{([\s\S]*?)\n\}/
	);
	assert.ok(pseudoShared);
	assert.doesNotMatch(pseudoShared[1], /transform\s*:/);
});

test("animation timing and size preserved", () => {
	assert.match(PAUSE_LESS, /animation:\s*sw5e-pause-spin 10s linear infinite/);
	assert.match(PAUSE_LESS, /animation:\s*sw5e-pause-spin 5s linear infinite reverse/);
	assert.match(PAUSE_LESS, /width:\s*128px/);
	assert.match(PAUSE_LESS, /height:\s*128px/);
});

test("no theme subsystem selectors restored", () => {
	for ( const src of [PAUSE_LESS, MODULE_LESS, MODULE_CSS] ) {
		const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
		assert.doesNotMatch(code, /data-sw5e-theme/);
		assert.doesNotMatch(code, /sw5e-theme-root/);
		assert.doesNotMatch(code, /themeMode/);
		assert.doesNotMatch(code, /\[data-theme.*=.*sw5e-(light|dark|underworld)/);
		assert.doesNotMatch(code, /body\.sw5e-(light|dark|underworld)/);
	}
});

test("no scene-content, die, or Foundry branding selectors introduced", () => {
	assert.doesNotMatch(PAUSE_LESS, /Foundry Virtual Tabletop/);
	assert.doesNotMatch(PAUSE_LESS, /\.token\b|#board\b|canvas\b/);
	assert.doesNotMatch(PAUSE_LESS, /die\.svg|d20/);
});

test("generated CSS contains intended neutral Pause rules after build", () => {
	assert.match(MODULE_CSS, /#pause:has\(img\[src\*="systems\/dnd5e\/ui\/official\/ampersand\.svg"\]\) figcaption/);
	assert.match(
		MODULE_CSS,
		/#pause:has\(img\[src\*="systems\/dnd5e\/ui\/official\/ampersand\.svg"\]\) figcaption \{[^}]*padding-bottom:\s*[1-9][\d.]*rem/
	);
	assert.match(
		MODULE_CSS,
		/#pause:has\(img\[src\*="systems\/dnd5e\/ui\/official\/ampersand\.svg"\]\) figcaption::after \{[^}]*top:\s*\d*\.?\d+rem/
	);
	assert.doesNotMatch(MODULE_CSS, /top:\s*-112px/);
	assert.match(MODULE_CSS, /@keyframes sw5e-pause-spin/);
});

console.log(`\n${passed} passed`);
