#!/usr/bin/env node
/**
 * Validates that no pack source JSON files contain legacy unscoped starship
 * document types ("starship", "starshipmod", "starshipsize"). These must
 * always use the module-namespaced forms ("sw5e.starship", etc.).
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const LEGACY_TYPES = new Set(["starship", "starshipmod", "starshipsize"]);
const SOURCE_ROOT = new URL("../packs/_source", import.meta.url).pathname;

function* walkJson(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walkJson(full);
    else if (entry.endsWith(".json")) yield full;
  }
}

let violations = 0;
for (const file of walkJson(SOURCE_ROOT)) {
  let doc;
  try { doc = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
  if (typeof doc !== "object" || doc === null) continue;

  if (LEGACY_TYPES.has(doc.type)) {
    console.error(`LEGACY TYPE  ${file}\n  $.type = "${doc.type}"`);
    violations++;
  }
  if (Array.isArray(doc.items)) {
    for (let i = 0; i < doc.items.length; i++) {
      const item = doc.items[i];
      if (item && LEGACY_TYPES.has(item.type)) {
        console.error(`LEGACY TYPE  ${file}\n  $.items[${i}].type = "${item.type}"`);
        violations++;
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} legacy unscoped starship type(s) found. Use sw5e.starship, sw5e.starshipmod, or sw5e.starshipsize.`);
  process.exit(1);
}
console.log("OK: no legacy unscoped starship types found.");
