import fs from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

const ROOT = path.resolve("packs/src");

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if ([".yml", ".yaml"].includes(path.extname(e.name).toLowerCase())) yield p;
  }
}

function setActivityPromptFalse(doc) {
  if (!doc || doc.type !== "weapon") return 0;
  const activities = doc?.system?.activities;
  if (!activities || typeof activities !== "object") return 0;
  let changes = 0;
  for (const [key, act] of Object.entries(activities)) {
    if (!act || typeof act !== "object") continue;
    // Only touch activities that can potentially place a template (have a target object)
    act.target ??= {};
    if (act.target.prompt !== false) {
      act.target.prompt = false;
      changes++;
    }
  }
  return changes;
}

async function processFile(file) {
  const before = await readFile(file, "utf8");
  let data;
  try {
    data = yaml.load(before);
  } catch (err) {
    console.error(`YAML parse error in ${file}:`, err.message);
    return { file, changed: false };
  }
  const total = setActivityPromptFalse(data);
  if (!total) return { file, changed: false };
  const dumped = yaml.dump(data, { lineWidth: 120, noRefs: true, sortKeys: false });
  const normalized = dumped.endsWith("\n") ? dumped : `${dumped}\n`;
  if (normalized !== before) {
    await writeFile(file, normalized, "utf8");
    return { file, changed: true, edits: total };
  }
  return { file, changed: false };
}

async function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`Source folder not found: ${ROOT}`);
    process.exit(1);
  }
  let changedFiles = 0;
  let totalEdits = 0;
  for await (const f of walk(ROOT)) {
    const res = await processFile(f);
    if (res.changed) {
      changedFiles++;
      totalEdits += res.edits ?? 1;
      console.log(`Updated: ${path.relative(process.cwd(), f)} (${res.edits} activit${res.edits === 1 ? "y" : "ies"})`);
    }
  }
  console.log(`Done. ${changedFiles} file(s) updated, ${totalEdits} activity updates.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

