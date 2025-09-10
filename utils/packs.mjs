import fs from "fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import logger from "fancy-log";
import path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";
import yaml from "js-yaml";

/**
 * Folder where the compiled compendium packs should be located relative to the
 * base 5e system folder.
 * @type {string}
 */
const PACK_DEST = "packs";

/**
 * Folder where source YAML/JSON files should be located relative to the 5e system folder.
 * @type {string}
 */
const PACK_SRC = "packs/src";

/**
 * Temporary folder used to mirror YAML sources into JSON for packing.
 * @type {string}
 */
const PACK_SRC_JSON_MIRROR = "packs/_json";

/**
 * Ensure a directory exists.
 * @param {string} dir
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Read a document from JSON or YAML based on file extension.
 * @param {string} filePath
 * @returns {Promise<object>}
 */
async function readDoc(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contents = await readFile(filePath, { encoding: "utf8" });
  if (ext === ".json") return JSON.parse(contents);
  if (ext === ".yml" || ext === ".yaml") return yaml.load(contents);
  throw new Error(`Unsupported file extension for read: ${filePath}`);
}

/**
 * Write a document to JSON or YAML based on file extension.
 * @param {string} filePath
 * @param {object} data
 */
async function writeDoc(filePath, data) {
  ensureDir(path.dirname(filePath));
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") {
    return writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o664 });
  }
  if (ext === ".yml" || ext === ".yaml") {
    // Dump with consistent style
    const dumped = yaml.dump(data, { lineWidth: 120, noRefs: true, sortKeys: false });
    return writeFile(filePath, dumped.endsWith("\n") ? dumped : `${dumped}\n`, { mode: 0o664 });
  }
  throw new Error(`Unsupported file extension for write: ${filePath}`);
}

/**
 * Returns the same file path but with the provided new extension.
 * @param {string} filePath
 * @param {".json"|".yml"|".yaml"} newExt
 */
function withExt(filePath, newExt) {
  return path.join(path.dirname(filePath), path.parse(filePath).name + newExt);
}

// eslint-disable-next-line
const argv = yargs(hideBin(process.argv)).command(packageCommand()).help().alias("help", "h").argv;

// eslint-disable-next-line
function packageCommand() {
  return {
    command: "package [action] [pack] [entry]",
    describe: "Manage packages",
    builder: (yargs) => {
      yargs.positional("action", {
        describe: "The action to perform.",
        type: "string",
        choices: ["unpack", "pack", "clean", "convert"],
      });
      yargs.positional("pack", {
        describe: "Name of the pack upon which to work.",
        type: "string",
      });
      yargs.positional("entry", {
        describe:
          "Name of any entry within a pack upon which to work. Only applicable to extract & clean commands.",
        type: "string",
      });
    },
    handler: async (argv) => {
      const { action, pack, entry } = argv;
      switch (action) {
        case "clean":
          return await cleanPacks(pack, entry);
        case "pack":
          return await compilePacks(pack);
        case "unpack":
          return await extractPacks(pack, entry);
        case "convert":
          return await convertPacksToYaml(pack);
      }
    },
  };
}

/* ----------------------------------------- */
/*  Clean Packs                              */
/* ----------------------------------------- */

function cleanEffects(data) {
  if (!data.effects) return;

  const key_blacklist = [
    "system.details.background",
    "system.details.species",
    "system.traits.languages.value",
    "system.traits.toolProf.value",
  ];
  const key_blacklist_re = [/system\.tools\.\w+\.prof/];
  function blacklisted(key) {
    if (key_blacklist.includes(key)) return true;
    for (const k in key_blacklist_re) if (k.match(key)) return true;
    return false;
  }
  const key_whitelist = [
    "system.attributes.hp.bonuses.level",
    "system.attributes.hp.bonuses.overall",
    "system.traits.dr.value",
    "system.traits.di.value",
    "system.traits.dv.value",
    "system.traits.ci.value",
    "system.attributes.ac.value",
  ];
  const key_whitelist_re = [/flags\.sw5e\..*/];
  function whitelisted(key) {
    if (key_whitelist.includes(key)) return true;
    for (const k in key_whitelist_re) if (k.match(key)) return true;
    return false;
  }

  const hasAdvancements = data.advancement !== undefined;
  if (hasAdvancements)
    for (const effect in data.effects) {
      effect.changes = effect.changes.filter((change) => !blacklisted(change.key));
    }
  data.effects = data.effects.filter((effect) => effect.changes.length || !effect.transfer);
  if (hasAdvancements && data.effects.length) {
    const non_whitelisted = data.effects.reduce((acc, effect) => {
      acc.push(...effect.changes.filter((change) => !whitelisted(change.key)));
      return acc;
    }, []);
    if (non_whitelisted.length) {
      logger.info(`Item ${data.name1} still has non whitelisted effects:`);
      logger.info(non_whitelisted);
    }
  }
}

function cleanImage(path) {
  path = path?.replace("systems/sw5e/packs/Icons", "modules/sw5e/icons/packs");
  path = path?.replace("modules/sw5e-module-test/icons/packs", "modules/sw5e/icons/packs");
  return path;
}

/**
 * Convert an entry from the sw5e system format.
 * @param {object} data                           Data for a single entry to convert.
 * @param {object} [options={}]
 * @param {boolean} [options.forceConvert=false]  Should the data be converted regardless of having it's systemId as 'sw5e'?
 */
function convertSW5EPackEntry(data, { forceConvert = false } = {}) {
  const propertyChanges = {
    weapon: {
      aut: "auto",
      bur: "burst",
      dir: "dire",
      heavy: "hvy",
      hid: "hidden",
      ken: "keen",
      pic: "piercing",
      ran: "range",
      rap: "rapid",
      reload: "rel",
      smr: "smart",
      spc: "special",
      vic: "vicious",

      bit: "biting",
      bri: "bright",
      bru: "brutal",
      cor: "corruption",
      def: "defensive",
      dex: "dexRq",
      drm: "disarming",
      dsg: "disguised",
      dis: "disintegrate",
      dpt: "disruptive",
      dou: "double",
      finesse: "fin",
      fix: "fixed",
      ilk: "interlockingWeapon",
      light: "lgt",
      lum: "luminous",
      mig: "mighty",
      mod: "modal",
      neu: "neuralizing",
      pen: "penetrating",
      pcl: "powerCell",
      reach: "rch",
      rck: "reckless",
      returning: "ret",
      shk: "shocking",
      sil: "silentWeapon",
      slg: "slug",
      son: "sonorous",
      spz: "specialized",
      str: "strRq",
      swi: "switch",
      thrown: "thr",
      twoHanded: "two",
      versatileWeapon: "ver",

      con: "conRq",
      exp: "explosive",
      hom: "homing",
      ion: "ionizing",
      mlt: "melt",
      ovr: "overheat",
      pow: "power",
      sat: "saturate",
      zon: "zone",
    },
    equipment: {
      Absorptive: "absorptive",
      Agile: "agile",
      Anchor: "anchor",
      Avoidant: "avoidant",
      Barbed: "barbed",
      Bulky: "bulky",
      Charging: "charging",
      Concealing: "concealing",
      Cumbersome: "cumbersome",
      Gauntleted: "gauntleted",
      Imbalanced: "imbalanced",
      Impermeable: "impermeable",
      Insulated: "insulated",
      Interlocking: "interlockingEquipment",
      Lambent: "lambent",
      Lightweight: "lightweight",
      Magnetic: "magnetic",
      Obscured: "obscured",
      Obtrusive: "obtrusive",
      Powered: "powered",
      Reactive: "reactive",
      Regulated: "regulated",
      Reinforced: "reinforced",
      Responsive: "responsive",
      Rigid: "rigid",
      Silent: "silentEquipment",
      Spiked: "spiked",
      Strength: "strength",
      Steadfast: "steadfast",
      Versatile: "versatileEquipment",

      c_Absorbing: "absorbing",
      c_Acessing: "acessing",
      c_Amplifying: "amplifying",
      c_Bolstering: "bolstering",
      c_Constitution: "constitution",
      c_Dispelling: "dispelling",
      c_Elongating: "elongating",
      c_Enlarging: "enlarging",
      c_Expanding: "expanding",
      c_Extending: "extending",
      c_Fading: "fading",
      c_Focused: "focused",
      c_Increasing: "increasing",
      c_Inflating: "inflating",
      c_Mitigating: "mitigating",
      c_Ranging: "ranging",
      c_Rending: "rending",
      c_Repelling: "repelling",
      c_Storing: "storing",
      c_Surging: "surging",
      c_Withering: "withering",
    },
  };

  if (!forceConvert && data._stats?.systemId !== "sw5e") return false;

  if (data._stats?.systemId) data._stats.systemId = "dnd5e";
  if (data._stats?.systemVersion) data._stats.systemVersion = "5.1.4";
  if (data._stats?.lastModifiedBy) data._stats.lastModifiedBy = "sw5ebuilder00000";

  if (data.system?._propertyValues) {
    Object.entries(data.system._propertyValues).forEach(([k, v]) => {
      if (typeof v === "boolean") return;
      if (data.type in propertyChanges && k in propertyChanges[data.type])
        k = propertyChanges[data.type][k];
      data.flags ??= {};
      const flags = (data.flags.sw5e ??= {});
      flags.properties ??= {};
      flags.properties[k] = v;
    });
    delete data.system._propertyValues;
  }

  if (data.system?.properties && data.type in propertyChanges) {
    data.system.properties = data.system.properties.map((k) => {
      if (k in propertyChanges[data.type]) return propertyChanges[data.type][k];
      return k;
    });
  }

  if (data.system?.advancement)
    for (const adv of data.system.advancement) {
      for (const field of ["pool", "items"]) {
        if (adv?.configuration?.[field])
          for (const item of adv.configuration[field]) {
            if (item.uuid)
              item.uuid = item.uuid.replace("Compendium.sw5e-module-test.", "Compendium.sw5e.");
          }
      }
    }

  if (data.type === "power") data.type = "spell";
  // Keep species type in DND5e v5.x
  // if ( data.type === "species" ) data.type = "race";
  if (data.type === "archetype") data.type = "subclass";
  if (data.type === "maneuver") data.type = "sw5e.maneuver";
  if (data.changes)
    data.changes.forEach((ch) => {
      if (ch.key === "system.traits.languages.value" && ch.value === "basic") ch.value = "common";
    });

  if (data.system?.price?.denomination === "gc") data.system.price.denomination = "gp";
  if (data.system?.save?.scaling === "power") data.system.save.scaling = "spell";

  if (data.flags?.["sw5e-module-test"]) {
    data.flags.sw5e = {
      ...data.flags["sw5e-module-test"],
      ...(data.flags.sw5e ?? {}),
    };
    delete data.flags["sw5e-module-test"];
  }

  if (data.effects) cleanEffects(data);
  if (data.img) data.img = cleanImage(data.img);
  if (data.icon) data.icon = cleanImage(data.icon);

  return true;
}

/**
 * Removes unwanted flags, permissions, and other data from entries before extracting or compiling.
 * @param {object} data                           Data for a single entry to clean.
 * @param {object} [options={}]
 * @param {boolean} [options.clearSourceId=true]  Should the core sourceId flag be deleted.
 * @param {number} [options.ownership=0]          Value to reset default ownership to.
 */
function cleanPackEntry(data, { clearSourceId = true, ownership = 0, forceConvert = true } = {}) {
  forceConvert = convertSW5EPackEntry(data, { forceConvert });

  if (data.ownership) data.ownership = { default: ownership };
  if (clearSourceId) {
    delete data._stats?.compendiumSource;
    delete data.flags?.core?.sourceId;
  }
  delete data.flags?.importSource;
  delete data.flags?.exportSource;
  if (data._stats?.lastModifiedBy) data._stats.lastModifiedBy = "dnd5ebuilder0000";

  // Remove empty entries in flags
  if (!data.flags) data.flags = {};
  Object.entries(data.flags).forEach(([key, contents]) => {
    if (Object.keys(contents).length === 0) delete data.flags[key];
  });

  if (data.system?.activation?.cost === 0) data.system.activation.cost = null;
  if (data.system?.duration?.value === "0") data.system.duration.value = "";
  if (data.system?.target?.value === 0) data.system.target.value = null;
  if (data.system?.target?.width === 0) data.system.target.width = null;
  if (data.system?.range?.value === 0) data.system.range.value = null;
  if (data.system?.range?.long === 0) data.system.range.long = null;
  if (data.system?.uses?.value === 0) data.system.uses.value = null;
  if (data.system?.uses?.max === "0") data.system.duration.value = "";
  if (data.system?.save?.dc === 0) data.system.save.dc = null;
  if (data.system?.capacity?.value === 0) data.system.capacity.value = null;
  if (data.system?.strength === 0) data.system.strength = null;
  if (data.system?.powercasting) delete data.system.powercasting;

  // Remove mystery-man.svg from Actors
  if (["character", "npc"].includes(data.type) && data.img === "icons/svg/mystery-man.svg") {
    data.img = "";
    data.prototypeToken.texture.src = "";
  }

  if (data.effects)
    data.effects.forEach((i) => cleanPackEntry(i, { clearSourceId: false, forceConvert }));
  if (data.items)
    data.items.forEach((i) => cleanPackEntry(i, { clearSourceId: false, forceConvert }));
  if (data.pages) data.pages.forEach((i) => cleanPackEntry(i, { ownership: -1, forceConvert }));
  if (data.system?.description?.value)
    data.system.description.value = cleanString(data.system.description.value);
  if (data.label) data.label = cleanString(data.label);
  if (data.name) data.name = cleanString(data.name);
}

/**
 * Removes invisible whitespace characters and normalizes single- and double-quotes.
 * @param {string} str  The string to be cleaned.
 * @returns {string}    The cleaned string.
 */
function cleanString(str) {
  return str
    .replace(/\u2060/gu, "")
    .replace(/[‘’]/gu, "'")
    .replace(/[“”]/gu, '"');
}

/**
 * Cleans and formats source JSON files, removing unnecessary permissions and flags and adding the proper spacing.
 * @param {string} [packName]   Name of pack to clean. If none provided, all packs will be cleaned.
 * @param {string} [entryName]  Name of a specific entry to clean.
 *
 * - `npm run build:clean` - Clean all source JSON files.
 * - `npm run build:clean -- classes` - Only clean the source files for the specified compendium.
 * - `npm run build:clean -- classes Barbarian` - Only clean a single item from the specified compendium.
 */
async function cleanPacks(packName, entryName) {
  entryName = entryName?.toLowerCase();
  if (!fs.existsSync(PACK_SRC)) return logger.info(`No source folder found at ${PACK_SRC}`);
  const folders = fs
    .readdirSync(PACK_SRC, { withFileTypes: true })
    .filter((file) => file.isDirectory() && (!packName || packName === file.name));

  /**
   * Walk through directories to find JSON or YAML files.
   * @param {string} directoryPath
   * @yields {string}
   */
  async function* _walkDir(directoryPath) {
    const directory = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of directory) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) yield* _walkDir(entryPath);
      else if ([".json", ".yml", ".yaml"].includes(path.extname(entry.name))) yield entryPath;
    }
  }

  for (const folder of folders) {
    logger.info(`Cleaning pack ${folder.name}`);
    for await (const src of _walkDir(path.join(PACK_SRC, folder.name))) {
      let doc = await readDoc(src);
      if (entryName && entryName !== doc.name?.toLowerCase()) continue;
      if (!doc._id || !doc._key) {
        console.log(`Failed to clean \x1b[31m${src}\x1b[0m, must have _id and _key.`);
        continue;
      }
      cleanPackEntry(doc);
      await writeDoc(src, doc);
    }
  }
}

/* ----------------------------------------- */
/*  Compile Packs                            */
/* ----------------------------------------- */

/**
 * Compile the source JSON files into compendium packs.
 * @param {string} [packName]       Name of pack to compile. If none provided, all packs will be packed.
 *
 * - `npm run build:db` - Compile all JSON files into their LevelDB files.
 * - `npm run build:db -- classes` - Only compile the specified pack.
 */
async function compilePacks(packName) {
  // Determine which source folders to process
  if (!fs.existsSync(PACK_SRC)) return logger.info(`No source folder found at ${PACK_SRC}`);
  ensureDir(PACK_SRC_JSON_MIRROR);
  const folders = fs
    .readdirSync(PACK_SRC, { withFileTypes: true })
    .filter((file) => file.isDirectory() && (!packName || packName === file.name));

  for (const folder of folders) {
    const yamlSrc = path.join(PACK_SRC, folder.name);
    const jsonMirror = path.join(PACK_SRC_JSON_MIRROR, folder.name);
    const dest = path.join(PACK_DEST, folder.name);
    logger.info(`Compiling pack ${folder.name}`);

    // Build JSON mirror from YAML/JSON sources
    if (fs.existsSync(jsonMirror)) fs.rmSync(jsonMirror, { recursive: true, force: true });
    const srcEntries = [];
    async function* _walkDir(directoryPath) {
      const directory = await readdir(directoryPath, { withFileTypes: true });
      for (const entry of directory) {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) yield* _walkDir(entryPath);
        else if ([".json", ".yml", ".yaml"].includes(path.extname(entry.name))) yield entryPath;
      }
    }
    for await (const file of _walkDir(yamlSrc)) srcEntries.push(file);
    for (const srcPath of srcEntries) {
      const rel = path.relative(yamlSrc, srcPath);
      const outPath = path.join(jsonMirror, withExt(rel, ".json"));
      const data = await readDoc(srcPath);
      cleanPackEntry(data);
      await writeDoc(outPath, data);
    }

    ensureDir(dest);
    await compilePack(jsonMirror, dest, {
      recursive: true,
      log: true,
      transformEntry: cleanPackEntry,
    });

    // Remove JSON mirror for cleanliness
    fs.rmSync(jsonMirror, { recursive: true, force: true });
  }
}

/* ----------------------------------------- */
/*  Extract Packs                            */
/* ----------------------------------------- */

/**
 * Extract the contents of compendium packs to JSON files.
 * @param {string} [packName]       Name of pack to extract. If none provided, all packs will be unpacked.
 * @param {string} [entryName]      Name of a specific entry to extract.
 *
 * - `npm build:json - Extract all compendium LevelDB files into JSON files.
 * - `npm build:json -- classes` - Only extract the contents of the specified compendium.
 * - `npm build:json -- classes Barbarian` - Only extract a single item from the specified compendium.
 */
async function extractPacks(packName, entryName) {
  entryName = entryName?.toLowerCase();

  // Load module.json.
  const system = JSON.parse(fs.readFileSync("./module.json", { encoding: "utf8" }));

  // Determine which packs to process.
  const packs = system.packs.filter((p) => !packName || p.name === packName);

  for (const packInfo of packs) {
    logger.info(`Extracting pack ${packInfo.name}`);
    const dest = path.join(PACK_SRC, packInfo.name);
    const src = path.join("./", packInfo.path ?? "");
    ensureDir(dest);

    await extractPack(src, dest, {
      log: false,
      transformEntry: async (entry) => {
        if (entryName && entryName !== entry.name.toLowerCase()) return false;
        cleanPackEntry(entry);
        const outPath = path.join(dest, transformName(entry, packInfo.name)) + ".yml";
        if (!(await checkChangesGeneric(entry, outPath))) return false;
        await writeDoc(outPath, entry);
        return false; // Skip default JSON writing
      },
      transformName: (entry) => transformName(entry, packInfo.name) + ".json", // Unused due to transformEntry returning false
    });
  }
}

/**
 * Standardize name format.
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace("'", "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .replace(/\s+|-{2,}/g, "-");
}

/**
 * Sort an object's keys.
 * @param {object} obj
 * @returns {object}
 */
function sortObject(obj) {
  //Thanks > http://whitfin.io/sorting-object-recursively-node-jsjavascript/
  if (!obj) return obj;

  const isArray = obj instanceof Array;
  var sortedObj = {};
  if (isArray) {
    sortedObj = obj.map((item) => sortObject(item));
  } else {
    var keys = Object.keys(obj);
    // console.log(keys);
    keys.sort(function (key1, key2) {
      ((key1 = key1.toLowerCase()), (key2 = key2.toLowerCase()));
      if (key1 < key2) return -1;
      if (key1 > key2) return 1;
      return 0;
    });

    for (var index in keys) {
      var key = keys[index];
      if (typeof obj[key] == "obj") {
        sortedObj[key] = sortObject(obj[key]);
      } else {
        sortedObj[key] = obj[key];
      }
    }
  }

  return sortedObj;
}

/**
 * Checks if there are meaningful changes in an entry.
 * @param {object} entry
 * @param {string} dest
 * @returns {boolean}
 */
async function checkChangesGeneric(entry, dest) {
  if (fs.existsSync(dest)) {
    let oldEntry;
    const ext = path.extname(dest).toLowerCase();
    if (ext === ".json") oldEntry = JSON.parse(fs.readFileSync(dest, { encoding: "utf8" }));
    else if (ext === ".yml" || ext === ".yaml")
      oldEntry = yaml.load(fs.readFileSync(dest, { encoding: "utf8" }));
    // Do not update item if only changes are flags, stats, or advancement ids
    if (oldEntry._stats && entry._stats) oldEntry._stats = entry._stats;
    if (oldEntry.flags?.["sw5e-importer"] && entry.flags?.["sw5e-importer"])
      oldEntry.flags["sw5e-importer"] = entry.flags["sw5e-importer"];
    if (oldEntry.system?.advancement && entry.system?.advancement) {
      const length = Math.min(oldEntry.system.advancement.length, entry.system.advancement.length);
      for (let i = 0; i < length; i++)
        oldEntry.system.advancement[i]._id = entry.system.advancement[i]._id;
    }
    if (oldEntry.items && entry.items) {
      const length = Math.min(oldEntry.items.length, entry.items.length);
      for (let i = 0; i < length; i++) {
        const oldItem = oldEntry.items[i];
        const newItem = entry.items[i];
        if (oldItem.flags?.["sw5e-importer"] && newItem.flags?.["sw5e-importer"])
          oldItem.flags["sw5e-importer"] = newItem.flags["sw5e-importer"];
        if (oldItem.stats && newItem.stats) oldItem.stats = newItem.stats;
      }
    }
    const oldJson = JSON.stringify(sortObject(oldEntry));
    const newJson = JSON.stringify(sortObject(entry));
    return oldJson !== newJson;
  }
  return true;
}

function transformName(entry, packName) {
  const iID = entry.flags["sw5e-importer"]?.uid ?? "";
  const iData = Object.fromEntries(`type-${iID}`.split(".").map((s) => s.split("-")));
  let parts = new Set();

  let subfolder = "";

  switch (packName) {
    // Items
    case "adventuringgear":
    case "ammo":
    case "armor":
    case "blasters":
    case "lightweapons":
    case "enhanceditems":
    case "explosives":
    case "modifications":
    case "starshipequipment":
    case "starshipmodifications":
    case "starshipweapons":
    case "vibroweapons":
      // foundry type
      if (["adventuringgear", "enhanceditems"].includes(packName)) parts.add(entry.type);
      // item type
      if (entry.type !== "loot") parts.add(entry.system?.type?.value?.toLowerCase());
      // item subtype
      if (entry.system?.type?.subtype === "crossbowBolt") parts.add("bolt");
      else parts.add(entry.system?.type?.subtype);

      parts.delete(undefined);
      parts.delete("");
      parts.delete(packName);
      if (packName.endsWith("s")) parts.delete(packName.substring(0, packName.length - 1));
      subfolder = [...parts].join("/");
      break;
    // 'classes'
    case "archetypes":
      subfolder = entry.system.classIdentifier;
      break;
    // 'features'
    case "archetypefeatures":
    case "classfeatures":
    case "speciesfeatures":
    case "invocations":
      if (packName === "invocations") parts.add(entry.system.type.subtype?.slice(0, 10));
      parts.add(deslugify(iData.sourceName));
      parts.add(iData.level);

      parts.delete(undefined);
      parts.delete("");
      parts.delete(packName);
      parts.delete("None");
      subfolder = [...parts].join("/");
      break;
    case "feats":
    case "starshipactions":
      subfolder = entry.system.type.subtype;
      break;
    case "deploymentfeatures":
      subfolder = entry.system.requirements?.split(" ")[0];
      break;
    // powers
    case "forcepowers":
    case "techpowers":
      if (entry.system?.level === undefined) subfolder = "";
      else if (entry.system.level === 0) subfolder = "at-will";
      else subfolder = `level-${entry.system.level}`;
      break;
    case "maneuvers":
      subfolder = entry.system.type.value;
      break;
    // actors
    case "fistoscodex":
    case "monsters":
    case "monsters_temp":
      subfolder = entry.system.details.type.value;
      break;
    // other
    case "monstertraits":
      subfolder = entry.system?.type?.value ?? entry.type;
      break;
    default:
      subfolder = "";
  }

  return path.join(subfolder ?? "", slugify(entry.name));
}

function deslugify(string) {
  return (string ?? "").split("_").join(" ");
}

/**
 * Convert all JSON source files under PACK_SRC to YAML and remove the JSON originals.
 * @param {string} [packName]
 */
async function convertPacksToYaml(packName) {
  if (!fs.existsSync(PACK_SRC)) return logger.info(`No source folder found at ${PACK_SRC}`);
  const folders = fs
    .readdirSync(PACK_SRC, { withFileTypes: true })
    .filter((file) => file.isDirectory() && (!packName || packName === file.name));
  for (const folder of folders) {
    logger.info(`Converting pack ${folder.name} to YAML`);
    const base = path.join(PACK_SRC, folder.name);
    async function* _walkDir(directoryPath) {
      const directory = await readdir(directoryPath, { withFileTypes: true });
      for (const entry of directory) {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) yield* _walkDir(entryPath);
        else if (path.extname(entry.name) === ".json") yield entryPath;
      }
    }
    for await (const jsonPath of _walkDir(base)) {
      const data = await readDoc(jsonPath);
      const ymlPath = withExt(jsonPath, ".yml");
      await writeDoc(ymlPath, data);
      fs.rmSync(jsonPath, { force: true });
    }
  }
}
