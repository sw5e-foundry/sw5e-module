import fs from "fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import logger from "fancy-log";
import path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";


/**
 * Folder where the compiled compendium packs should be located relative to the
 * base 5e system folder.
 * @type {string}
 */
const PACK_DEST = "packs";

/**
 * Folder where source JSON files should be located relative to the 5e system folder.
 * @type {string}
 */
const PACK_SRC = "packs/_source";


// eslint-disable-next-line
const argv = yargs(hideBin(process.argv))
  .command(packageCommand())
  .help().alias("help", "h")
  .argv;


// eslint-disable-next-line
function packageCommand() {
  return {
    command: "package [action] [pack] [entry]",
    describe: "Manage packages",
    builder: yargs => {
      yargs.positional("action", {
        describe: "The action to perform.",
        type: "string",
        choices: ["unpack", "pack", "clean"]
      });
      yargs.positional("pack", {
        describe: "Name of the pack upon which to work.",
        type: "string"
      });
      yargs.positional("entry", {
        describe: "Name of any entry within a pack upon which to work. Only applicable to extract & clean commands.",
        type: "string"
      });
    },
    handler: async argv => {
      const { action, pack, entry } = argv;
      switch ( action ) {
        case "clean":
          return await cleanPacks(pack, entry);
        case "pack":
          return await compilePacks(pack);
        case "unpack":
          return await extractPacks(pack, entry);
      }
    }
  };
}


/* ----------------------------------------- */
/*  Clean Packs                              */
/* ----------------------------------------- */

/**
 * Convert an entry from the sw5e system format.
 * @param {object} data                           Data for a single entry to convert.
 * @param {object} [options={}]
 * @param {boolean} [options.forceConvert=false]  Should the data be converted regardless of having it's systemId as 'sw5e'?
 */
function convertSW5EPackEntry(data, { forceConvert=false }={}) {
  const propertyChanges = {
    "weapon": {
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
    "equipment": {
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

  if ( !forceConvert && (data._stats?.systemId !== "sw5e") ) return false;

  if ( data._stats?.systemId ) data._stats.systemId = "dnd5e";
  if ( data._stats?.systemVersion ) data._stats.systemVersion = "3.3.1";
  if ( data._stats?.lastModifiedBy ) data._stats.lastModifiedBy = "sw5ebuilder00000";

  if ( data.system?._propertyValues ) {
    Object.entries(data.system._propertyValues).forEach(([k,v]) => {
      if (typeof v === "boolean") return;
      if ((data.type in propertyChanges) && (k in propertyChanges[data.type])) k = propertyChanges[data.type][k];
      data.flags ??= {};
      const flags = (data.flags["sw5e-module-test"] ??= {});
      flags.properties ??= {};
      flags.properties[k] = v
    });
    delete data.system._propertyValues;
  }

  if ( data.system?.properties && (data.type in propertyChanges) ) {
    data.system.properties = data.system.properties.map(k => {
      if (k in propertyChanges[data.type]) return propertyChanges[data.type][k];
      return k;
    });
  }

  if ( data.type === "power" ) data.type = "spell";
  if ( data.type === "species" ) data.type = "race";
  if ( data.type === "archetype" ) data.type = "subclass";
  if ( data.img ) data.img = data.img.replace("systems/sw5e/packs/Icons", "modules/sw5e-module-test/Icons/Packs");
  if ( data.icon ) data.icon = data.icon.replace("systems/sw5e/packs/Icons", "modules/sw5e-module-test/Icons/Packs");
  if ( data.changes ) data.changes.forEach(ch => { if ( ch.key === "system.traits.languages.value" && ch.value === "basic" ) ch.value = "common"; });

  if ( data.system?.price?.denomination === "gc" ) data.system.price.denomination = "gp";
  if ( data.system?.save?.scaling === "power" ) data.system.save.scaling = "spell";

  return true;
}


/**
 * Removes unwanted flags, permissions, and other data from entries before extracting or compiling.
 * @param {object} data                           Data for a single entry to clean.
 * @param {object} [options={}]
 * @param {boolean} [options.clearSourceId=true]  Should the core sourceId flag be deleted.
 * @param {number} [options.ownership=0]          Value to reset default ownership to.
 */
function cleanPackEntry(data, { clearSourceId=true, ownership=0, forceConvert=true }={}) {
  forceConvert = convertSW5EPackEntry(data, { forceConvert });

  if ( data.ownership ) data.ownership = { default: ownership };
  if ( clearSourceId ) {
    delete data._stats?.compendiumSource;
    delete data.flags?.core?.sourceId;
  }
  delete data.flags?.importSource;
  delete data.flags?.exportSource;
  if ( data._stats?.lastModifiedBy ) data._stats.lastModifiedBy = "dnd5ebuilder0000";

  // Remove empty entries in flags
  if ( !data.flags ) data.flags = {};
  Object.entries(data.flags).forEach(([key, contents]) => {
    if ( Object.keys(contents).length === 0 ) delete data.flags[key];
  });

  if ( data.system?.activation?.cost === 0 ) data.system.activation.cost = null;
  if ( data.system?.duration?.value === "0" ) data.system.duration.value = "";
  if ( data.system?.target?.value === 0 ) data.system.target.value = null;
  if ( data.system?.target?.width === 0 ) data.system.target.width = null;
  if ( data.system?.range?.value === 0 ) data.system.range.value = null;
  if ( data.system?.range?.long === 0 ) data.system.range.long = null;
  if ( data.system?.uses?.value === 0 ) data.system.uses.value = null;
  if ( data.system?.uses?.max === "0" ) data.system.duration.value = "";
  if ( data.system?.save?.dc === 0 ) data.system.save.dc = null;
  if ( data.system?.capacity?.value === 0 ) data.system.capacity.value = null;
  if ( data.system?.strength === 0 ) data.system.strength = null;

  // Remove mystery-man.svg from Actors
  if ( ["character", "npc"].includes(data.type) && data.img === "icons/svg/mystery-man.svg" ) {
    data.img = "";
    data.prototypeToken.texture.src = "";
  }

  if ( data.effects ) data.effects.forEach(i => cleanPackEntry(i, { clearSourceId: false, forceConvert }));
  if ( data.items ) data.items.forEach(i => cleanPackEntry(i, { clearSourceId: false, forceConvert }));
  if ( data.pages ) data.pages.forEach(i => cleanPackEntry(i, { ownership: -1, forceConvert }));
  if ( data.system?.description?.value ) data.system.description.value = cleanString(data.system.description.value);
  if ( data.label ) data.label = cleanString(data.label);
  if ( data.name ) data.name = cleanString(data.name);
}


/**
 * Removes invisible whitespace characters and normalizes single- and double-quotes.
 * @param {string} str  The string to be cleaned.
 * @returns {string}    The cleaned string.
 */
function cleanString(str) {
  return str.replace(/\u2060/gu, "").replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"');
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
  const folders = fs.readdirSync(PACK_SRC, { withFileTypes: true }).filter(file =>
    file.isDirectory() && ( !packName || (packName === file.name) )
  );

  /**
   * Walk through directories to find JSON files.
   * @param {string} directoryPath
   * @yields {string}
   */
  async function* _walkDir(directoryPath) {
    const directory = await readdir(directoryPath, { withFileTypes: true });
    for ( const entry of directory ) {
      const entryPath = path.join(directoryPath, entry.name);
      if ( entry.isDirectory() ) yield* _walkDir(entryPath);
      else if ( path.extname(entry.name) === ".json" ) yield entryPath;
    }
  }

  for ( const folder of folders ) {
    logger.info(`Cleaning pack ${folder.name}`);
    for await ( const src of _walkDir(path.join(PACK_SRC, folder.name)) ) {
      const json = JSON.parse(await readFile(src, { encoding: "utf8" }));
      if ( entryName && (entryName !== json.name.toLowerCase()) ) continue;
      if ( !json._id || !json._key ) {
        console.log(`Failed to clean \x1b[31m${src}\x1b[0m, must have _id and _key.`);
        continue;
      }
      cleanPackEntry(json);
      fs.rmSync(src, { force: true });
      writeFile(src, `${JSON.stringify(json, null, 2)}\n`, { mode: 0o664 });
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
  const folders = fs.readdirSync(PACK_SRC, { withFileTypes: true }).filter(file =>
    file.isDirectory() && ( !packName || (packName === file.name) )
  );

  for ( const folder of folders ) {
    const src = path.join(PACK_SRC, folder.name);
    const dest = path.join(PACK_DEST, folder.name);
    logger.info(`Compiling pack ${folder.name}`);
    await compilePack(src, dest, { recursive: true, log: true, transformEntry: cleanPackEntry });
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

  // Load system.json.
  const system = JSON.parse(fs.readFileSync("./system.json", { encoding: "utf8" }));

  // Determine which source packs to process.
  const packs = system.packs.filter(p => !packName || p.name === packName);

  for ( const packInfo of packs ) {
    const dest = path.join(PACK_SRC, packInfo.name);
    logger.info(`Extracting pack ${packInfo.name}`);

    const folders = {};
    const containers = {};
    await extractPack(packInfo.path, dest, {
      log: false, transformEntry: e => {
        if ( e._key.startsWith("!folders") ) folders[e._id] = { name: slugify(e.name), folder: e.folder };
        else if ( e.type === "container" ) containers[e._id] = {
          name: slugify(e.name), container: e.system?.container, folder: e.folder
        };
        return false;
      }
    });
    const buildPath = (collection, entry, parentKey) => {
      let parent = collection[entry[parentKey]];
      entry.path = entry.name;
      while ( parent ) {
        entry.path = path.join(parent.name, entry.path);
        parent = collection[parent[parentKey]];
      }
    };
    Object.values(folders).forEach(f => buildPath(folders, f, "folder"));
    Object.values(containers).forEach(c => {
      buildPath(containers, c, "container");
      const folder = folders[c.folder];
      if ( folder ) c.path = path.join(folder.path, c.path);
    });

    await extractPack(packInfo.path, dest, {
      log: true, transformEntry: entry => {
        if ( entryName && (entryName !== entry.name.toLowerCase()) ) return false;
        cleanPackEntry(entry);
      }, transformName: entry => {
        if ( entry._id in folders ) return path.join(folders[entry._id].path, "_folder.json");
        if ( entry._id in containers ) return path.join(containers[entry._id].path, "_container.json");
        const outputName = slugify(entry.name);
        const parent = containers[entry.system?.container] ?? folders[entry.folder];
        return path.join(parent?.path ?? "", `${outputName}.json`);
      }
    });
  }
}


/**
 * Standardize name format.
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  return name.toLowerCase().replace("'", "").replace(/[^a-z0-9]+/gi, " ").trim().replace(/\s+|-{2,}/g, "-");
}