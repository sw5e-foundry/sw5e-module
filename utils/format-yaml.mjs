import fs from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

const SRC_ROOT = path.resolve("packs/src");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if ([".yml", ".yaml"].includes(path.extname(e.name).toLowerCase())) yield p;
  }
}

function sortObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((v) => sortObject(v));
  if (typeof obj !== "object") return obj;
  const keys = Object.keys(obj).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const out = {};
  for (const k of keys) out[k] = sortObject(obj[k]);
  return out;
}

async function formatYamlFile(file) {
  const before = await readFile(file, "utf8");
  let data;
  try {
    data = yaml.load(before);
  } catch (err) {
    console.error(`YAML parse error in ${file}:`, err.message);
    return false;
  }
  const sorted = sortObject(data);
  const dumped = yaml.dump(sorted, { lineWidth: 120, noRefs: true, sortKeys: false });
  const normalized = dumped.endsWith("\n") ? dumped : `${dumped}\n`;
  if (normalized !== before) {
    ensureDir(path.dirname(file));
    await writeFile(file, normalized, "utf8");
    return true;
  }
  return false;
}

async function main() {
  if (!fs.existsSync(SRC_ROOT)) {
    console.log(`No source folder found at ${SRC_ROOT}`);
    return;
  }
  let changed = 0;
  for await (const f of walk(SRC_ROOT)) {
    const did = await formatYamlFile(f);
    if (did) changed++;
  }
  if (changed) console.log(`Formatted ${changed} YAML file(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
