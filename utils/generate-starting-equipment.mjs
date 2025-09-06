#!/usr/bin/env node
/*
  generate-starting-equipment.mjs
  - Reads a mapping file (YAML) that specifies starting equipment choices for classes
  - Updates packs/src/classes/*.yml to include system.startingEquipment entries using D&D5e structure
  - Uses linked item UUIDs pointing to Compendium.sw5e.<pack>.Item.<_id>

  Usage:
    node utils/generate-starting-equipment.mjs [path/to/data/starting-equipment.yml]

  Mapping format (YAML):
    classes:
      fighter:
        groups:
          - type: OR
            options:
              - and:
                  - { pack: blasters, name: "Blaster pistol", count: 1 }
                  - { pack: ammo, name: "Power cell", count: 20 }
              - and:
                  - { pack: vibroweapons, name: "Vibroblade", count: 2 }
          - type: OR
            options:
              - { pack: kits, name: "Explorer's Pack", count: 1 }
              - { pack: kits, name: "Dungeoneer's Pack", count: 1 }

  Notes:
  - pack refers to a compendium pack under packs/src/<pack> (top-level pack name only).
  - name must match the item's "name" field exactly within that pack subtree.
  - If multiple items match, the first match is used (prefer unique names).
  - This script will replace any existing system.startingEquipment array in the class file.
*/

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import crypto from "crypto";

const ROOT = process.cwd();
const CLASSES_DIR = path.join(ROOT, "packs", "src", "classes");
const PACKS_SRC_DIR = path.join(ROOT, "packs", "src");

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function readYamlFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return yaml.load(raw, { schema: yaml.DEFAULT_SCHEMA });
}

function writeYamlFile(filePath, data) {
  const doc = yaml.dump(data, {
    lineWidth: 0,
    noRefs: true,
    quotingType: '"',
  });
  fs.writeFileSync(filePath, doc, "utf8");
}

function listFilesRecursive(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(p));
    else out.push(p);
  }
  return out;
}

function findItemByNameInPack(packName, itemName) {
  // Search packs/src/<packName> recursively for YAML files with name: <itemName>
  const packDir = path.join(PACKS_SRC_DIR, packName);
  if (!fs.existsSync(packDir)) return null;
  const files = listFilesRecursive(packDir).filter((p) => p.endsWith(".yml") || p.endsWith(".yaml"));
  for (const f of files) {
    try {
      const doc = readYamlFile(f);
      if (doc && doc.name === itemName && doc._id) {
        return { id: doc._id, file: f };
      }
    } catch {}
  }
  return null;
}

function uuidForItem(packName, id) {
  // Compendium.sw5e.<packName>.Item.<id>
  return `Compendium.sw5e.${packName}.Item.${id}`;
}

function makeId() {
  return crypto.randomBytes(8).toString("hex");
}

function flattenGroups(groups, sortBase = 100000) {
  // Input groups: array of { type: 'OR'|'AND', options: [ and?: item[], item?: ... ] }
  // Output: an array of entries as used in DnD5e startingEquipment (groups + linked items)
  // We'll increment sort for each top-level group by 100000 and items within by larger steps.
  const out = [];
  let groupIdx = 0;
  for (const g of groups || []) {
    const groupId = makeId();
    const groupSort = sortBase + groupIdx * 100000; // 100000, 200000, ...
    out.push({ type: g.type || "OR", _id: groupId, group: "", sort: groupSort, requiresProficiency: false });

    let optionIdx = 0;
    for (const opt of g.options || []) {
      // Each option can be either an 'and' (array of items), or a single item
      const andItems = Array.isArray(opt?.and) ? opt.and : (opt?.item ? [opt.item] : []);
      let innerGroupId = groupId;
      if (andItems.length > 1) {
        // create an AND subgroup
        innerGroupId = makeId();
        const innerSort = groupSort + 700000 + optionIdx * 100000; // after initial link
        out.push({ type: "AND", _id: innerGroupId, group: groupId, sort: innerSort, requiresProficiency: false });
      }
      // add each item as linked
      let itemIdx = 0;
      for (const it of andItems) {
        if (!it || !it.pack || !it.name) continue;
        out.push({
          type: "linked",
          count: it.count ?? null,
          key: it.uuid ?? null, // may be filled later
          _id: makeId(),
          group: innerGroupId,
          sort: groupSort + (andItems.length > 1 ? 800000 : 500000) + itemIdx * 100000,
          requiresProficiency: false,
        });
        itemIdx++;
      }
      optionIdx++;
    }
    groupIdx++;
  }
  return out;
}

function fillLinkedUUIDs(startingEquipment, mappingItemsIndex) {
  // mappingItemsIndex: function(pack, name) => uuid
  return startingEquipment.map((entry) => {
    if (entry.type === "linked" && !entry.key && entry.__lookup) {
      const { pack, name } = entry.__lookup;
      const uuid = mappingItemsIndex(pack, name);
      if (!uuid) {
        throw new Error(`Unable to resolve item '${name}' in pack '${pack}'`);
      }
      const clone = { ...entry };
      clone.key = uuid;
      delete clone.__lookup;
      return clone;
    }
    return entry;
  });
}

function buildStartingEquipment(mappingForClass) {
  // Step 1: flatten declared groups into DnD5e structure with placeholder lookups
  const groups = mappingForClass?.groups || [];
  const flattened = flattenGroups(groups);

  // Step 2: annotate each linked entry with lookup info so we can fill ids later
  // Here, we must rewalk mapping groups to inject __lookup since flatten step doesn’t carry pack/name
  const out = [];
  let idx = 0;
  for (const g of groups) {
    // find the group entry we created (type OR/AND with empty group)
    const groupEntry = flattened[idx++];
    out.push(groupEntry);

    for (const opt of g.options || []) {
      const andItems = Array.isArray(opt?.and) ? opt.and : (opt?.item ? [opt.item] : []);
      let innerGroupEntry = null;
      if (andItems.length > 1) {
        innerGroupEntry = flattened[idx++];
        out.push(innerGroupEntry);
      }
      for (const item of andItems) {
        const entry = flattened[idx++];
        entry.__lookup = { pack: item.pack, name: item.name };
        entry.count = item.count ?? null;
        out.push(entry);
      }
    }
  }
  return out;
}

function loadMapping(mappingPath) {
  if (!fs.existsSync(mappingPath)) return null;
  const data = readYamlFile(mappingPath);
  if (!data || typeof data !== "object" || !data.classes) return null;
  return data;
}

function ensureArray(val) {
  if (Array.isArray(val)) return val;
  if (val == null) return [];
  return [val];
}

function updateClassFile(classKey, startingEquipment, itemResolver) {
  const classFile = path.join(CLASSES_DIR, `${classKey}.yml`);
  if (!fs.existsSync(classFile)) {
    console.warn(`[skip] Class file not found: ${classFile}`);
    return false;
  }
  const doc = readYamlFile(classFile);
  if (!doc || !doc.system) {
    console.warn(`[skip] Invalid class YAML (missing system): ${classFile}`);
    return false;
  }

  // Fill UUIDs for linked items
  const resolved = startingEquipment.map((e) => ({ ...e }));
  for (const entry of resolved) {
    if (entry.type === "linked" && entry.key == null && entry.__lookup) {
      const { pack, name } = entry.__lookup;
      const info = findItemByNameInPack(pack, name);
      if (!info) {
        throw new Error(`Could not locate '${name}' in pack '${pack}' for class '${classKey}'.`);
      }
      entry.key = uuidForItem(pack, info.id);
      delete entry.__lookup;
    }
  }

  // Apply
  doc.system.startingEquipment = resolved;

  writeYamlFile(classFile, doc);
  console.log(`[ok] Updated ${classKey} startingEquipment (${resolved.length} entries)`);
  return true;
}

async function main() {
  const mappingPath = process.argv[2] || path.join(ROOT, "data", "starting-equipment.yml");
  if (!fs.existsSync(mappingPath)) {
    console.log(`[info] Mapping file not found at ${mappingPath}. Creating an example at data/starting-equipment.example.yml`);
    const examplePath = path.join(ROOT, "data", "starting-equipment.example.yml");
    fs.mkdirSync(path.dirname(examplePath), { recursive: true });
    fs.writeFileSync(
      examplePath,
      yaml.dump(
        {
          classes: {
            fighter: {
              groups: [
                {
                  type: "OR",
                  options: [
                    {
                      and: [
                        { pack: "blasters", name: "Affixed Rifle", count: 1 },
                        { pack: "ammo", name: "Power cell", count: 20 },
                      ],
                    },
                    {
                      and: [
                        { pack: "vibroweapons", name: "Vibroblade", count: 2 },
                      ],
                    },
                  ],
                },
                {
                  type: "OR",
                  options: [
                    { and: [{ pack: "kits", name: "Explorer's Pack", count: 1 }] },
                    { and: [{ pack: "kits", name: "Dungeoneer's Pack", count: 1 }] },
                  ],
                },
              ],
            },
          },
        },
        { lineWidth: 0 }
      ),
      "utf8"
    );
    return;
  }

  const mapping = loadMapping(mappingPath);
  if (!mapping) die(`Invalid mapping file: ${mappingPath}`);

  const classes = mapping.classes || {};
  const keys = Object.keys(classes);
  if (!keys.length) die("Mapping contains no classes");

  let updated = 0;
  for (const classKey of keys) {
    const spec = classes[classKey];
    if (!spec || !Array.isArray(spec.groups) || !spec.groups.length) {
      console.warn(`[skip] No groups for class '${classKey}'`);
      continue;
    }
    const built = buildStartingEquipment(spec);
    updateClassFile(classKey, built);
    updated++;
  }

  if (!updated) {
    console.warn("No classes were updated. Ensure your mapping has 'groups' for each class you want to modify.");
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});

