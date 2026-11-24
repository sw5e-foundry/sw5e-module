#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "scripts/patch/dataModels.mjs"), "utf8");

assert.match(src, /Object\.keys\(module\?\.documentTypes\?\.Item \?\? \{\}\)\.map\(subtype => getModuleType\(subtype\)\)/);
assert.doesNotMatch(src, /getModuleTypeCandidates/);
console.log("ok - maneuver sheet registration uses only the declared module subtype");
