import fs from "fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import logger from "fancy-log";
import YAML from "js-yaml";
import path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";
//import { ClassicLevel } from "classic-level";
import {
	TARGET_DND5E_VERSION,
	normalizeLegacyMasterItemSource,
	normalizeDnd5eItemSource,
	normalizeEmbeddedDnd5eItemSources
} from "../scripts/dnd5e-source-normalization.mjs";
import { normalizeAdvancementGrants } from "../scripts/proficiency-utils.mjs";
import { backfillNpcWeapons, getNpcWeaponBackfillStats, resetNpcWeaponBackfillStats } from "./npc-weapon-backfill.mjs";
import {
	normalizeLegacyStarshipActorSource,
	normalizeLegacyStarshipItemSource
} from "../scripts/starship-data.mjs";

const CANONICAL_MODULE_ID = "sw5e-module";

const HIERARCHY = {
	actors: {
		items: [],
		effects: []
	},
	cards: {
		cards: []
	},
	combats: {
		combatants: []
	},
	delta: {
		items: [],
		effects: []
	},
	items: {
		effects: []
	},
	journal: {
		pages: []
	},
	playlists: {
		sounds: []
	},
	regions: {
		behaviors: []
	},
	tables: {
		results: []
	},
	tokens: {
		delta: {}
	},
	scenes: {
		drawings: [],
		tokens: [],
		lights: [],
		notes: [],
		regions: [],
		sounds: [],
		templates: [],
		tiles: [],
		walls: []
	}
};


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

//function cleanEffects(data) {
//	if (!data.effects) return;
//
//	const key_blacklist = [
//		'system.details.background',
//		'system.details.species',
//		'system.traits.languages.value',
//		'system.traits.toolProf.value',
//	];
//	const key_blacklist_re = [
//		/system\.tools\.\w+\.prof/,
//	];
//	function blacklisted(key) {
//		if (key_blacklist.includes(key)) return true;
//		for (const re of key_blacklist_re) if (re.test(key)) return true;
//		return false;
//	}
//	const key_whitelist = [
//		'system.attributes.hp.bonuses.level',
//		'system.attributes.hp.bonuses.overall',
//		'system.traits.dr.value',
//		'system.traits.di.value',
//		'system.traits.dv.value',
//		'system.traits.ci.value',
//		'system.attributes.ac.value',
//	];
//	const key_whitelist_re = [
//		/flags\.sw5e\..*/,
//	];
//	function whitelisted(key) {
//		if (key_whitelist.includes(key)) return true;
//		for (const re of key_whitelist_re) if (re.test(key)) return true;
//		return false;
//	}
//
//	const hasAdvancements = data.advancement !== undefined;
//	if (hasAdvancements) for (const effect of data.effects) {
//		effect.changes = effect.changes.filter(change => !blacklisted(change.key));
//	}
//	data.effects = data.effects.filter(effect => effect.changes.length || !effect.transfer);
//	if (hasAdvancements && data.effects.length) {
//		const non_whitelisted = data.effects.reduce((acc, effect) => {
//			acc.push(...effect.changes.filter(change => !whitelisted(change.key)));
//			return acc;
//		}, []);
//		if (non_whitelisted.length) {
//			logger.info(`Item ${data.name} still has non whitelisted effects:`);
//			logger.info(non_whitelisted)
//		}
//	}
//}
//
//function normalizeCompendiumUuid(uuid, { moduleId=CANONICAL_MODULE_ID }={}) {
//	if ( typeof uuid !== "string" ) return uuid;
//	return uuid.replace(/^Compendium\.(sw5e-module-test|sw5e|sw5e-module)\./, `Compendium.${moduleId}.`);
//}
//
//function normalizeCompendiumReferences(data, { moduleId=CANONICAL_MODULE_ID }={}) {
//	if ( typeof data === "string" ) {
//		return data.replace(/Compendium\.(sw5e-module-test|sw5e|sw5e-module)\./g, `Compendium.${moduleId}.`);
//	}
//
//	if ( Array.isArray(data) ) {
//		for ( let i = 0; i < data.length; i += 1 ) data[i] = normalizeCompendiumReferences(data[i], { moduleId });
//		return data;
//	}
//
//	if ( data && (typeof data === "object") ) {
//		for ( const [key, value] of Object.entries(data) ) data[key] = normalizeCompendiumReferences(value, { moduleId });
//	}
//
//	return data;
//}
//
//function normalizeAdvancementLink(item, field, moduleId=CANONICAL_MODULE_ID) {
//	if ( typeof item === "string" ) {
//		if ( item === "languages:standard:basic" ) return { item: "languages:standard:common", changed: true };
//		const normalizedUuid = normalizeCompendiumUuid(item, { moduleId });
//		if ( field === "pool" && normalizedUuid.startsWith("Compendium.") ) return { item: { uuid: normalizedUuid }, changed: true };
//		if ( field === "items" && normalizedUuid.startsWith("Compendium.") ) return { item: { uuid: normalizedUuid, optional: false }, changed: true };
//		return { item: normalizedUuid, changed: normalizedUuid !== item };
//	}
//
//	if ( !item || (typeof item !== "object") ) return { item, changed: false };
//
//	let changed = false;
//	if ( item.uuid ) {
//		const normalizedUuid = normalizeCompendiumUuid(item.uuid, { moduleId });
//		if ( normalizedUuid !== item.uuid ) {
//			item.uuid = normalizedUuid;
//			changed = true;
//		}
//	}
//	if ( (field === "items") && item.uuid?.startsWith("Compendium.") && (item.optional === undefined) ) {
//		item.optional = false;
//		changed = true;
//	}
//	return { item, changed };
//}
//
//function normalizeItemChoiceValue(value, moduleId=CANONICAL_MODULE_ID) {
//	if ( !value || (typeof value !== "object") ) return { value, changed: false };
//	let changed = false;
//
//	if ( value.added && (typeof value.added === "object") ) {
//		for ( const added of Object.values(value.added) ) {
//			if ( !added || (typeof added !== "object") ) continue;
//			for ( const [key, uuid] of Object.entries(added) ) {
//				if ( typeof uuid !== "string" ) continue;
//				const normalizedUuid = normalizeCompendiumUuid(uuid, { moduleId });
//				if ( normalizedUuid !== uuid ) {
//					added[key] = normalizedUuid;
//					changed = true;
//				}
//			}
//		}
//	}
//
//	return { value, changed };
//}
//
//function normalizeSubclassValue(value, moduleId=CANONICAL_MODULE_ID) {
//	if ( !value || (typeof value !== "object") ) return { value: {}, changed: true };
//
//	if ( value.document || value.uuid ) {
//		const normalizedValue = { ...value };
//		let changed = false;
//		if ( typeof normalizedValue.uuid === "string" ) {
//			const normalizedUuid = normalizeCompendiumUuid(normalizedValue.uuid, { moduleId });
//			if ( normalizedUuid !== normalizedValue.uuid ) {
//				normalizedValue.uuid = normalizedUuid;
//				changed = true;
//			}
//		}
//		return { value: normalizedValue, changed };
//	}
//
//	for ( const added of Object.values(value.added ?? {}) ) {
//		if ( !added || (typeof added !== "object") ) continue;
//		const [document, uuid] = Object.entries(added)[0] ?? [];
//		if ( !document ) continue;
//		return {
//			value: {
//				document,
//				...(typeof uuid === "string" ? { uuid: normalizeCompendiumUuid(uuid, { moduleId }) } : {})
//			},
//			changed: true
//		};
//	}
//
//	return { value: {}, changed: Object.keys(value).length > 0 };
//}
//
//function normalizeAdvancements(data, moduleId=CANONICAL_MODULE_ID) {
//	if ( !data.system?.advancement ) return;
//
//	for ( const adv of data.system.advancement ) {
//		for ( const field of ["pool", "items", "grants"] ) {
//			if ( !adv?.configuration?.[field] ) continue;
//			if ( field === "grants" ) {
//				adv.configuration.grants = normalizeAdvancementGrants(adv.configuration.grants).grants;
//				continue;
//			}
//			adv.configuration[field] = adv.configuration[field].map(item => normalizeAdvancementLink(item, field, moduleId).item);
//		}
//
//		if ( (data.type === "class") && (adv.type === "ItemChoice")
//			&& ["archetype", "subclass"].includes(adv.configuration?.type) ) {
//			adv.type = "Subclass";
//			adv.configuration = {};
//			adv.value = normalizeSubclassValue(adv.value, moduleId).value;
//			continue;
//		}
//
//		if ( adv.type === "Subclass" ) {
//			adv.value = normalizeSubclassValue(adv.value, moduleId).value;
//			continue;
//		}
//
//		if ( adv.type === "ItemChoice" ) adv.value = normalizeItemChoiceValue(adv.value, moduleId).value;
//	}
//}
//
//function normalizeModuleImagePath(path) {
//	path = path?.replace(/^modules\/sw5e\//, "modules/sw5e-module/");
//	path = path?.replace(/^modules\/sw5e-module-test\//, "modules/sw5e-module/");
//	path = path?.replace("systems/sw5e/packs/Icons", "modules/sw5e-module/icons/packs");
//	path = path?.replace("modules/sw5e/icons/packs", "modules/sw5e-module/icons/packs");
//	path = path?.replace("modules/sw5e-module-test/icons/packs", "modules/sw5e-module/icons/packs");
//	return path;
//}
//
//function getMonsterTokenPathFromAvatar(path) {
//	if ( !/^modules\/sw5e-module\/icons\/packs\/monsters\/.+\/Avatar\.webp$/i.test(path ?? "") ) return "";
//	return path.replace(/\/Avatar\.webp$/i, "/Token.webp");
//}
//
//function cleanImage(path, { avatarPath="", isPrototypeToken=false }={}) {
//		const normalized = typeof path === "string" ? path.trim() : path;
//		const lower = typeof normalized === "string" ? normalized.toLowerCase() : "";
//		const isBrokenExternal = /^https?:\/\/(?:static\.wikia\.nocookie\.net|cdn[ab]\.artstation\.com)\//.test(lower);
//		if ( ["", "undefined", "null", "nan"].includes(lower) || lower.startsWith("tokenizer/") || isBrokenExternal ) return "";
//		path = normalizeModuleImagePath(normalized);
//		if ( isPrototypeToken ) {
//			const normalizedAvatar = normalizeModuleImagePath(typeof avatarPath === "string" ? avatarPath.trim() : avatarPath);
//			const canonicalMonsterToken = getMonsterTokenPathFromAvatar(normalizedAvatar);
//			if ( canonicalMonsterToken && (path === normalizedAvatar) ) path = canonicalMonsterToken;
//		}
//		return path;
//}
//
//function cleanHtmlImagePaths(text) {
//	if ( typeof text !== "string" ) return text;
//	return text
//		.replace(/systems\/sw5e\/packs\/Icons/g, "modules/sw5e-module/icons/packs")
//		.replace(/modules\/sw5e\/icons\/packs/g, "modules/sw5e-module/icons/packs")
//		.replace(/modules\/sw5e-module-test\/icons\/packs/g, "modules/sw5e-module/icons/packs");
//}
//
//function cloneData(data) {
//	return data === undefined ? undefined : JSON.parse(JSON.stringify(data));
//}
//
//function ensureSw5eFlags(data) {
//	data.flags ??= {};
//	return (data.flags.sw5e ??= {});
//}
//
///**
// * Convert an entry from the sw5e system format.
// * @param {object} data                           Data for a single entry to convert.
// * @param {object} [options={}]
// * @param {boolean} [options.forceConvert=false]  Should the data be converted regardless of having it's systemId as 'sw5e'?
// */
//function convertSW5EPackEntry(data, { forceConvert=false }={}) {
//	const propertyChanges = {
//		"weapon": {
//			aut: "auto",
//			bur: "burst",
//			dir: "dire",
//			heavy: "hvy",
//			hid: "hidden",
//			ken: "keen",
//			pic: "piercing",
//			ran: "range",
//			rap: "rapid",
//			reload: "rel",
//			smr: "smart",
//			spc: "special",
//			vic: "vicious",
//
//			bit: "biting",
//			bri: "bright",
//			bru: "brutal",
//			cor: "corruption",
//			def: "defensive",
//			dex: "dexRq",
//			drm: "disarming",
//			dsg: "disguised",
//			dis: "disintegrate",
//			dpt: "disruptive",
//			dou: "double",
//			finesse: "fin",
//			fix: "fixed",
//			ilk: "interlockingWeapon",
//			light: "lgt",
//			lum: "luminous",
//			mig: "mighty",
//			mod: "modal",
//			neu: "neuralizing",
//			pen: "penetrating",
//			pcl: "powerCell",
//			reach: "rch",
//			rck: "reckless",
//			returning: "ret",
//			shk: "shocking",
//			sil: "silentWeapon",
//			slg: "slug",
//			son: "sonorous",
//			spz: "specialized",
//			str: "strRq",
//			swi: "switch",
//			thrown: "thr",
//			twoHanded: "two",
//			versatileWeapon: "ver",
//
//			con: "conRq",
//			exp: "explosive",
//			hom: "homing",
//			ion: "ionizing",
//			mlt: "melt",
//			ovr: "overheat",
//			pow: "power",
//			sat: "saturate",
//			zon: "zone",
//		},
//		"equipment": {
//			Absorptive: "absorptive",
//			Agile: "agile",
//			Anchor: "anchor",
//			Avoidant: "avoidant",
//			Barbed: "barbed",
//			Bulky: "bulky",
//			Charging: "charging",
//			Concealing: "concealing",
//			Cumbersome: "cumbersome",
//			Gauntleted: "gauntleted",
//			Imbalanced: "imbalanced",
//			Impermeable: "impermeable",
//			Insulated: "insulated",
//			Interlocking: "interlockingEquipment",
//			Lambent: "lambent",
//			Lightweight: "lightweight",
//			Magnetic: "magnetic",
//			Obscured: "obscured",
//			Obtrusive: "obtrusive",
//			Powered: "powered",
//			Reactive: "reactive",
//			Regulated: "regulated",
//			Reinforced: "reinforced",
//			Responsive: "responsive",
//			Rigid: "rigid",
//			Silent: "silentEquipment",
//			Spiked: "spiked",
//			Strength: "strength",
//			Steadfast: "steadfast",
//			Versatile: "versatileEquipment",
//
//			c_Absorbing: "absorbing",
//			c_Acessing: "acessing",
//			c_Amplifying: "amplifying",
//			c_Bolstering: "bolstering",
//			c_Constitution: "constitution",
//			c_Dispelling: "dispelling",
//			c_Elongating: "elongating",
//			c_Enlarging: "enlarging",
//			c_Expanding: "expanding",
//			c_Extending: "extending",
//			c_Fading: "fading",
//			c_Focused: "focused",
//			c_Increasing: "increasing",
//			c_Inflating: "inflating",
//			c_Mitigating: "mitigating",
//			c_Ranging: "ranging",
//			c_Rending: "rending",
//			c_Repelling: "repelling",
//			c_Storing: "storing",
//			c_Surging: "surging",
//			c_Withering: "withering",
//		},
//	};
//
//	if ( !forceConvert && (data._stats?.systemId !== "sw5e") ) return false;
//
//	if ( data._stats?.systemId ) data._stats.systemId = "dnd5e";
//	if ( data._stats?.systemVersion ) data._stats.systemVersion = TARGET_DND5E_VERSION;
//	if ( data._stats?.lastModifiedBy ) data._stats.lastModifiedBy = "sw5ebuilder00000";
//
//	if ( data.system?._propertyValues ) {
//		Object.entries(data.system._propertyValues).forEach(([k,v]) => {
//			if (typeof v === "boolean") return;
//			if ((data.type in propertyChanges) && (k in propertyChanges[data.type])) k = propertyChanges[data.type][k];
//			data.flags ??= {};
//			const flags = (data.flags.sw5e ??= {});
//			flags.properties ??= {};
//			flags.properties[k] = v
//		});
//		delete data.system._propertyValues;
//	}
//
//	if ( data.system?.properties && (data.type in propertyChanges) ) {
//		data.system.properties = data.system.properties.map(k => {
//			if (k in propertyChanges[data.type]) return propertyChanges[data.type][k];
//			return k;
//		});
//	}
//
//	normalizeLegacyMasterItemSource(data);
//	normalizeLegacyStarshipActorSource(data);
//	normalizeLegacyStarshipItemSource(data);
//
//	if ( data.flags?.['sw5e-module-test'] ) {
//		data.flags.sw5e = {
//			...data.flags['sw5e-module-test'],
//			...data.flags.sw5e ?? {},
//		};
//		delete data.flags['sw5e-module-test'];
//	}
//
//	if ( data.effects ) cleanEffects(data);
//	if ( data.img ) data.img = cleanImage(data.img);
//	if ( data.icon ) data.icon = cleanImage(data.icon);
//	if ( data.texture?.src ) data.texture.src = cleanImage(data.texture.src);
//	if ( data.prototypeToken?.texture?.src ) data.prototypeToken.texture.src = cleanImage(data.prototypeToken.texture.src, { avatarPath: data.img, isPrototypeToken: true });
//	normalizeDnd5eItemSource(data);
//	normalizeEmbeddedDnd5eItemSources(data.items);
//	normalizeCompendiumReferences(data);
//	normalizeAdvancements(data);
//
//	return true;
//}

/**
 * Removes unwanted flags, permissions, and other data from entries before extracting or compiling.
 * @param {object} data                           Data for a single entry to clean.
 * @param {object} [options={}]
 * @param {boolean} [options.clearSourceId=true]  Should the core sourceId flag be deleted.
 * @param {number} [options.ownership=0]          Value to reset default ownership to.
 */
function cleanPackEntry(data, { clearSourceId=true, ownership=0 }={}) {
//	forceConvert = convertSW5EPackEntry(data, { forceConvert });
//	backfillNpcWeapons(data, { packName });

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
	if ( data.system?.powercasting ) delete data.system.powercasting;

	// Remove mystery-man.svg from Actors
	if ( ["character", "npc"].includes(data.type) && data.img === "icons/svg/mystery-man.svg" ) {
		data.img = "";
		data.prototypeToken.texture.src = "";
	}

	if ( data.effects ) data.effects.forEach(i => cleanPackEntry(i, { clearSourceId: false }));
	if ( data.items ) data.items.forEach(i => cleanPackEntry(i, { clearSourceId: false }));
	if ( data.pages ) data.pages.forEach(i => cleanPackEntry(i, { ownership: -1 }));
	if ( data.system?.description?.value ) data.system.description.value = cleanString(data.system.description.value);
	if ( data.system?.description?.chat ) data.system.description.chat = cleanString(data.system.description.chat);
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
			else if ( path.extname(entry.name) === ".yml" ) yield entryPath;
		}
	}

	for ( const folder of folders ) {
		logger.info(`Cleaning pack ${folder.name}`);
	//	resetNpcWeaponBackfillStats();
		for await ( const src of _walkDir(path.join(PACK_SRC, folder.name)) ) {
			const data = YAML.load(await readFile(src, { encoding: "utf8" }));
			if ( entryName && (entryName !== data.name.toLowerCase()) ) continue;
			if ( !data._id || !data._key ) {
				console.log(`Failed to clean \x1b[31m${src}\x1b[0m, must have _id and _key.`);
				continue;
			}
			cleanPackEntry(data);
			fs.rmSync(src, { force: true });
			writeFile(src, `${YAML.dump(data)}\n`, { mode: 0o664 });
		}
	//	const stats = getNpcWeaponBackfillStats();
	//	if ( stats.matchedEntries ) {
	//		logger.info(`NPC weapon backfill for ${folder.name}: ${stats.matchedEntries} matched entries, ${stats.actorsChanged} actors changed, ${stats.weaponsAdded} weapons added, ${stats.weaponsUpdated} weapons updated, ${stats.ammoAdded} ammo items added`);
	//	}
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
	//	resetNpcWeaponBackfillStats();
		await compilePack(src, dest, { recursive: true, log: true, transformEntry: cleanPackEntry, yaml: true });
	//	await compileClassicLevelSafe(src, dest, {
	//		recursive: true,
	//		log: true,
	//		transformEntry: doc => cleanPackEntry(doc, { packName: folder.name })
	//	});
	//	const stats = getNpcWeaponBackfillStats();
	//	if ( stats.matchedEntries ) {
	//		logger.info(`NPC weapon backfill for ${folder.name}: ${stats.matchedEntries} matched entries, ${stats.actorsChanged} actors changed, ${stats.weaponsAdded} weapons added, ${stats.weaponsUpdated} weapons updated, ${stats.ammoAdded} ammo items added`);
	//	}
	}
}

//async function compileClassicLevelSafe(src, dest, { recursive=false, log=false, transformEntry }={}) {
//	const files = findSourceFiles(src, { recursive });
//
//	fs.mkdirSync(dest, { recursive: true });
//
//	const db = new ClassicLevel(dest, { keyEncoding: "utf8", valueEncoding: "json" });
//	await db.open();
//	const seenKeys = new Set();
//	const packDoc = applyHierarchy(async (doc, collection) => {
//		const key = doc._key;
//		delete doc._key;
//		if ( seenKeys.has(key) ) {
//			throw new Error(`An entry with key '${key}' was already packed and would be overwritten by this entry.`);
//		}
//		seenKeys.add(key);
//		const value = structuredClone(doc);
//		await mapHierarchy(value, collection, embeddedDoc => embeddedDoc._id);
//		await db.put(key, value);
//	});
//
//	for ( const file of files ) {
//		try {
//			const contents = fs.readFileSync(file, "utf8");
//			const doc = JSON.parse(contents);
//			const [, collection] = doc._key.split("!");
//			if ( await transformEntry?.(doc) === false ) continue;
//			await packDoc(doc, collection);
//			if ( log ) console.log(`Packed ${doc._id}${doc.name ? ` (${doc.name})` : ""}`);
//		} catch ( err ) {
//			if ( log ) console.error(`Failed to pack ${file}. See error below.`);
//			throw err;
//		}
//	}
//
//	await db.close();
//}

//function applyHierarchy(fn) {
//	const apply = async (doc, collection, options={}) => {
//		const newOptions = await fn(doc, collection, options);
//		for ( const [embeddedCollectionName, type] of Object.entries(HIERARCHY[collection] ?? {}) ) {
//			const embeddedValue = doc[embeddedCollectionName];
//			if ( Array.isArray(type) && Array.isArray(embeddedValue) ) {
//				for ( const embeddedDoc of embeddedValue ) await apply(embeddedDoc, embeddedCollectionName, newOptions);
//			} else if ( embeddedValue ) {
//				await apply(embeddedValue, embeddedCollectionName, newOptions);
//			}
//		}
//	};
//	return apply;
//}

//async function mapHierarchy(doc, collection, fn) {
//	for ( const [embeddedCollectionName, type] of Object.entries(HIERARCHY[collection] ?? {}) ) {
//		const embeddedValue = doc[embeddedCollectionName];
//		if ( Array.isArray(type) ) {
//			doc[embeddedCollectionName] = Array.isArray(embeddedValue) ? embeddedValue.map(entry => fn(entry, embeddedCollectionName)) : [];
//		} else {
//			doc[embeddedCollectionName] = embeddedValue ? await fn(embeddedValue, embeddedCollectionName) : null;
//		}
//	}
//}

//function findSourceFiles(root, { recursive=false }={}) {
//	const files = [];
//	for ( const entry of fs.readdirSync(root, { withFileTypes: true }) ) {
//		const name = path.join(root, entry.name);
//		if ( entry.isDirectory() && recursive ) {
//			files.push(...findSourceFiles(name, { recursive }));
//			continue;
//		}
//		if ( entry.isFile() && path.extname(name) === ".json" ) files.push(name);
//	}
//	return files;
//}



/* ----------------------------------------- */
/*  Extract Packs                            */
/* ----------------------------------------- */

/**
 * Extract the contents of compendium packs to source files.
 * @param {string} [packName]       Name of pack to extract. If none provided, all packs will be unpacked.
 * @param {string} [entryName]      Name of a specific entry to extract.
 *
 * - `npm build:source - Extract all compendium LevelDB files into source files.
 * - `npm build:source -- classes` - Only extract the contents of the specified compendium.
 * - `npm build:source -- classes Barbarian` - Only extract a single item from the specified compendium.
 */
async function extractPacks(packName, entryName) {
  entryName = entryName?.toLowerCase();

  // Load module.json.
  const module = JSON.parse(fs.readFileSync("./module.json", { encoding: "utf8" }));

  // Determine which source packs to process.
  const packs = module.packs.filter(p => !packName || p.name === packName);

  for ( const packInfo of packs ) {
    const dest = path.join(PACK_SRC, packInfo.name);
    logger.info(`Extracting pack ${packInfo.name}`);

    const folders = {};
    const containers = {};
    await extractPack(packInfo.path, dest, {
      log: true, transformEntry: e => {
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
      log: false, transformEntry: entry => {
        if ( entryName && (entryName !== entry.name.toLowerCase()) ) return false;
        cleanPackEntry(entry);
      }, transformName: entry => {
        if ( entry._id in folders ) return path.join(folders[entry._id].path, "_folder.yml");
        if ( entry._id in containers ) return path.join(containers[entry._id].path, "_container.yml");
        const outputName = slugify(entry.name);
        const parent = containers[entry.system?.container] ?? folders[entry.folder];
        return path.join(parent?.path ?? "", `${outputName}.yml`);
      }, yaml: true
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
		sortedObj = obj.map(item => sortObject(item));
	} else {
		var keys = Object.keys(obj);
		// console.log(keys);
		keys.sort(function (key1, key2) {
			(key1 = key1.toLowerCase()), (key2 = key2.toLowerCase());
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
function checkChanges(entry, dest) {
	if (fs.existsSync(dest)) {
		const oldEntry = JSON.parse(fs.readFileSync(dest, { encoding: "utf8" }));
		// Do not update item if only changes are flags, stats, or advancement ids
		if (oldEntry._stats && entry._stats) oldEntry._stats = entry._stats;
		if (oldEntry.flags?.["sw5e-importer"] && entry.flags?.["sw5e-importer"]) oldEntry.flags["sw5e-importer"] = entry.flags["sw5e-importer"];
		if (oldEntry.system?.advancement && entry.system?.advancement) {
			const length = Math.min(oldEntry.system.advancement.length, entry.system.advancement.length);
			for (let i = 0; i < length; i++) oldEntry.system.advancement[i]._id = entry.system.advancement[i]._id;
		}
		if (oldEntry.items && entry.items) {
			const length = Math.min(oldEntry.items.length, entry.items.length);
			for (let i = 0; i < length; i++) {
				const oldItem = oldEntry.items[i];
				const newItem = entry.items[i];
				if (oldItem.flags?.["sw5e-importer"] && newItem.flags?.["sw5e-importer"]) oldItem.flags["sw5e-importer"] = newItem.flags["sw5e-importer"];
				if (oldItem.stats && newItem.stats) oldItem.stats = newItem.stats;
			}
		}
		const oldJson = JSON.stringify(sortObject(oldEntry));
		const newJson = JSON.stringify(sortObject(entry));
		return oldJson !== newJson;
	}
	return true;
}

//function transformName(entry, packName) {
//	const iID = entry.flags["sw5e-importer"]?.uid ?? "";
//	const iData = Object.fromEntries(`type-${iID}`.split(".").map(s => s.split("-")));
//	let parts = new Set();
//
//	let subfolder = "";
//
//	switch (packName) {
//		// Items
//		case "adventuringgear":
//		case "ammo":
//		case "armor":
//		case "blasters":
//		case "lightweapons":
//		case "enhanceditems":
//		case "explosives":
//		case "modifications":
//		case "starshipequipment":
//		case "starshipmodifications":
//		case "starshipweapons":
//		case "vibroweapons":
//			// foundry type
//			if (["adventuringgear", "enhanceditems"].includes(packName)) parts.add(entry.type);
//			// item type
//			if (entry.type !== "loot") parts.add(entry.system?.type?.value?.toLowerCase());
//			// item subtype
//			if (entry.system?.type?.subtype === "crossbowBolt") parts.add("bolt");
//			else parts.add(entry.system?.type?.subtype);
//
//			parts.delete(undefined);
//			parts.delete("");
//			parts.delete(packName);
//			if (packName.endsWith("s")) parts.delete(packName.substring(0, packName.length-1));
//			subfolder = [...parts].join("/");
//			break;
//		// 'classes'
//		case "archetypes":
//			subfolder = entry.system.classIdentifier;
//			break;
//		// 'features'
//		case "archetypefeatures":
//		case "classfeatures":
//		case "speciesfeatures":
//		case "invocations":
//			if (packName === "invocations") parts.add(entry.system.type.subtype.slice(0, 10));
//			parts.add(deslugify(iData.sourceName));
//			parts.add(iData.level);
//
//			parts.delete(undefined);
//			parts.delete("");
//			parts.delete(packName);
//			parts.delete("None");
//			subfolder = [...parts].join("/");
//			break;
//		case "feats":
//		case "starshipactions":
//			subfolder = entry.system.type.subtype;
//			break;
//		case "deploymentfeatures":
//			subfolder = entry.system.requirements.split(" ")[0];
//			break;
//		// powers
//		case "forcepowers":
//		case "techpowers":
//			if (entry.system?.level === undefined) subfolder = "";
//			else if (entry.system.level === 0) subfolder = "at-will";
//			else subfolder = `level-${entry.system.level}`;
//			break;
//		case "maneuvers":
//			subfolder = entry.system.type.value;
//			break;
//		// actors
//		case "fistoscodex":
//		case "monsters":
//			subfolder = entry.system.details.type.value;
//			break;
//		// other
//		case "monstertraits":
//			subfolder = entry.system?.type?.value ?? entry.type;
//			break;
//		default:
//			subfolder = "";
//	}
//
//	return path.join(subfolder ?? "", slugify(entry.name));
//}

function deslugify(string) {
	return string.split("_").join(" ");
}
