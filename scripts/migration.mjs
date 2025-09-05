/**
 * Checks if the world needs migrating.
 * @returns {boolean}      Wheter migration is needed or not.
 */
export const needsMigration = function () {
  // Determine whether a system migration is required and feasible
  if (!game.user.isGM) return false;
  const cv = game.settings.get("sw5e", "moduleMigrationVersion");
  const totalDocuments = game.actors.size + game.scenes.size + game.items.size;
  const sw5eModule = game.modules.get("sw5e");
  if (!cv && totalDocuments === 0) {
    if (sw5eModule.version !== "#{VERSION}#")
      game.settings.set("sw5e", "moduleMigrationVersion", sw5eModule.version);
    return false;
  }
  if (cv && !foundry.utils.isNewerVersion(sw5eModule.flags.needsMigrationVersion, cv)) return false;

  if (cv && foundry.utils.isNewerVersion(sw5eModule.flags.compatibleMigrationVersion, cv)) {
    ui.notifications.error("MIGRATION.sw5eVersionTooOldWarning", {
      localize: true,
      permanent: true,
    });
  }

  return true;
};

/* -------------------------------------------- */

/**
 * Perform a system migration for the entire World, applying migrations for Actors, Items, and Compendium packs
 * @returns {Promise}      A Promise which resolves once the migration is completed
 */
export const migrateWorld = async function () {
  const version = game.modules.get("sw5e").version;
  ui.notifications.info(game.i18n.format("MIGRATION.sw5eBegin", { version }), { permanent: true });

  const migrationData = await getMigrationData();

  // Migrate World Actors
  const actors = game.actors
    .map((a) => [a, true])
    .concat(
      Array.from(game.actors.invalidDocumentIds).map((id) => [game.actors.getInvalid(id), false])
    );
  for (const [actor, valid] of actors) {
    try {
      const flags = { persistSourceMigration: false };
      const source = valid ? actor.toObject() : game.data.actors.find((a) => a._id === actor.id);
      let updateData = migrateActorData(source, migrationData, flags, { actorUuid: actor.uuid });
      if (!foundry.utils.isEmpty(updateData)) {
        console.log(`Migrating Actor document ${actor.name}`);
        if (flags.persistSourceMigration) {
          updateData = foundry.utils.mergeObject(source, updateData, { inplace: false });
        }
        await actor.update(updateData, {
          enforceTypes: false,
          diff: valid && !flags.persistSourceMigration,
          render: false,
        });
      }
    } catch (err) {
      err.message = `Failed sw5e module migration for Actor ${actor.name}: ${err.message}`;
      console.error(err);
    }
  }

  // Migrate World Items
  const items = game.items
    .map((i) => [i, true])
    .concat(
      Array.from(game.items.invalidDocumentIds).map((id) => [game.items.getInvalid(id), false])
    );
  for (const [item, valid] of items) {
    try {
      const flags = { persistSourceMigration: false };
      const source = valid ? item.toObject() : game.data.items.find((i) => i._id === item.id);
      let updateData = migrateItemData(source, migrationData, flags);
      if (!foundry.utils.isEmpty(updateData)) {
        console.log(`Migrating Item document ${item.name}`);
        if (flags.persistSourceMigration) {
          updateData = foundry.utils.mergeObject(source, updateData, { inplace: false });
        }
        await item.update(updateData, {
          enforceTypes: false,
          diff: valid && !flags.persistSourceMigration,
          render: false,
        });
      }
    } catch (err) {
      err.message = `Failed sw5e module migration for Item ${item.name}: ${err.message}`;
      console.error(err);
    }
  }

  // Migrate World Macros
  for (const m of game.macros) {
    try {
      const updateData = migrateMacroData(m.toObject(), migrationData);
      if (!foundry.utils.isEmpty(updateData)) {
        console.log(`Migrating Macro document ${m.name}`);
        await m.update(updateData, { enforceTypes: false, render: false });
      }
    } catch (err) {
      err.message = `Failed sw5e module migration for Macro ${m.name}: ${err.message}`;
      console.error(err);
    }
  }

  // Migrate World Roll Tables
  for (const table of game.tables) {
    try {
      const updateData = migrateRollTableData(table.toObject(), migrationData);
      if (!foundry.utils.isEmpty(updateData)) {
        console.log(`Migrating RollTable document ${table.name}`);
        await table.update(updateData, { enforceTypes: false, render: false });
      }
    } catch (err) {
      err.message = `Failed sw5e module migration for RollTable ${table.name}: ${err.message}`;
      console.error(err);
    }
  }

  // Migrate Actor Override Tokens
  for (const s of game.scenes) {
    try {
      const updateData = migrateSceneData(s, migrationData);
      if (!foundry.utils.isEmpty(updateData)) {
        console.log(`Migrating Scene document ${s.name}`);
        await s.update(updateData, { enforceTypes: false, render: false });
      }
    } catch (err) {
      err.message = `Failed sw5e module migration for Scene ${s.name}: ${err.message}`;
      console.error(err);
    }

    // Migrate ActorDeltas individually in order to avoid issues with ActorDelta bulk updates.
    for (const token of s.tokens) {
      if (token.actorLink || !token.actor) continue;
      try {
        const flags = { persistSourceMigration: false };
        const source = token.actor.toObject();
        let updateData = migrateActorData(source, migrationData, flags, {
          actorUuid: token.actor.uuid,
        });
        if (!foundry.utils.isEmpty(updateData)) {
          console.log(
            `Migrating ActorDelta document ${token.actor.name} [${token.delta.id}] in Scene ${s.name}`
          );
          if (flags.persistSourceMigration) {
            updateData = foundry.utils.mergeObject(source, updateData, { inplace: false });
          } else {
            // Workaround for core issue of bulk updating ActorDelta collections.
            ["items", "effects"].forEach((col) => {
              for (const [i, update] of (updateData[col] ?? []).entries()) {
                const original = token.actor[col].get(update._id);
                updateData[col][i] = foundry.utils.mergeObject(original.toObject(), update, {
                  inplace: false,
                });
              }
            });
          }
          await token.actor.update(updateData, {
            enforceTypes: false,
            diff: !flags.persistSourceMigration,
            render: false,
          });
        }
      } catch (err) {
        err.message = `Failed sw5e module migration for ActorDelta [${token.id}]: ${err.message}`;
        console.error(err);
      }
    }
  }

  // Migrate World Compendium Packs
  for (let p of game.packs) {
    if (p.metadata.packageType !== "world") continue;
    if (!["Actor", "Item", "Scene"].includes(p.documentName)) continue;
    await migrateCompendium(p);
  }

  // Set the migration as complete
  const moduleVersion = game.modules.get("sw5e").version;
  if (moduleVersion !== "#{VERSION}#")
    game.settings.set("sw5e", "moduleMigrationVersion", moduleVersion);
  ui.notifications.info(game.i18n.format("MIGRATION.sw5eComplete", { version }), {
    permanent: true,
  });
};

/* -------------------------------------------- */

/**
 * Apply migration rules to all Documents within a single Compendium pack
 * @param {CompendiumCollection} pack  Pack to be migrated.
 * @returns {Promise}
 */
export const migrateCompendium = async function (pack) {
  const documentName = pack.documentName;
  if (!["Actor", "Item", "Scene"].includes(documentName)) return;

  const migrationData = await getMigrationData();

  // Unlock the pack for editing
  const wasLocked = pack.locked;
  await pack.configure({ locked: false });

  // Begin by requesting server-side data model migration and get the migrated content
  await pack.migrate();
  const documents = await pack.getDocuments();

  // Iterate over compendium entries - applying fine-tuned migration functions
  for (let doc of documents) {
    let updateData = {};
    try {
      const flags = { persistSourceMigration: false };
      const source = doc.toObject();
      switch (documentName) {
        case "Actor":
          updateData = migrateActorData(source, migrationData, flags, { actorUuid: doc.uuid });
          break;
        case "Item":
          updateData = migrateItemData(source, migrationData, flags);
          break;
        case "Scene":
          updateData = migrateSceneData(source, migrationData, flags);
          break;
      }

      // Save the entry, if data was changed
      if (foundry.utils.isEmpty(updateData)) continue;
      if (flags.persistSourceMigration) updateData = foundry.utils.mergeObject(source, updateData);
      await doc.update(updateData, { diff: !flags.persistSourceMigration });
      console.log(`Migrated ${documentName} document ${doc.name} in Compendium ${pack.collection}`);
    } catch (err) {
      // Handle migration failures
      err.message = `Failed sw5e module migration for document ${doc.name} in pack ${pack.collection}: ${err.message}`;
      console.error(err);
    }
  }

  // Apply the original locked status for the pack
  await pack.configure({ locked: wasLocked });
  console.log(`Migrated all ${documentName} documents from Compendium ${pack.collection}`);
};

/* -------------------------------------------- */

/**
 * Migrate any active effects attached to the provided parent.
 * @param {object} parent           Data of the parent being migrated.
 * @param {object} [migrationData]  Additional data to perform the migration.
 * @returns {object[]}              Updates to apply on the embedded effects.
 */
export const migrateEffects = function (parent, migrationData) {
  if (!parent.effects) return {};
  return parent.effects.reduce((arr, e) => {
    const effectData = e instanceof CONFIG.ActiveEffect.documentClass ? e.toObject() : e;
    let effectUpdate = migrateEffectData(effectData, migrationData, { parent });
    if (!foundry.utils.isEmpty(effectUpdate)) {
      effectUpdate._id = effectData._id;
      arr.push(foundry.utils.expandObject(effectUpdate));
    }
    return arr;
  }, []);
};

/* -------------------------------------------- */
/*  Document Type Migration Helpers             */
/* -------------------------------------------- */

/**
 * Migrate a single Actor document to incorporate latest data model changes
 * Return an Object of updateData to be applied
 * @param {object} actor                The actor data object to update
 * @param {object} [migrationData]      Additional data to perform the migration
 * @param {object} [flags={}]           Track the needs migration flag.
 * @param {object} [options]
 * @param {string} [options.actorUuid]  The UUID of the actor.
 * @returns {object}                    The updateData to apply
 */
export const migrateActorData = function (actor, migrationData, flags = {}, { actorUuid } = {}) {
  const updateData = {};
  _migrateImage(actor, updateData);
  _migrateObjectFlags(actor, updateData);

  // Migrate embedded effects
  if (actor.effects) {
    const effects = migrateEffects(actor, migrationData);
    if (effects.length > 0) updateData.effects = effects;
  }

  // Migrate Owned Items
  if (!actor.items) return updateData;
  const items = actor.items.reduce((arr, i) => {
    // Migrate the Owned Item
    const itemData = i instanceof CONFIG.Item.documentClass ? i.toObject() : i;
    const itemFlags = { persistSourceMigration: false };
    let itemUpdate = migrateItemData(itemData, migrationData, itemFlags);

    // Update the Owned Item
    if (!foundry.utils.isEmpty(itemUpdate)) {
      if (itemFlags.persistSourceMigration) {
        itemUpdate = foundry.utils.mergeObject(itemData, itemUpdate, { inplace: false });
        flags.persistSourceMigration = true;
      }
      arr.push({ ...itemUpdate, _id: itemData._id });
    }

    return arr;
  }, []);
  if (items.length > 0) updateData.items = items;

  return updateData;
};

/* -------------------------------------------- */

/**
 * Migrate a single Item document to incorporate latest data model changes
 *
 * @param {object} item             Item data to migrate
 * @param {object} [migrationData]  Additional data to perform the migration
 * @param {object} [flags={}]       Track the needs migration flag.
 * @returns {object}                The updateData to apply
 */
export function migrateItemData(item, migrationData, flags = {}) {
  const updateData = {};
  _migrateImage(item, updateData);
  _migrateObjectFlags(item, updateData);
  _migrateItemProperties(item, updateData);
  _migrateSpellScaling(item, updateData);
  _migrateAdvancements(item, updateData);
  _migrateWeaponData(item, updateData);

  // Migrate embedded effects
  if (item.effects) {
    const effects = migrateEffects(item, migrationData);
    if (effects.length > 0) updateData.effects = effects;
  }

  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate the provided active effect data.
 * @param {object} effect            Effect data to migrate.
 * @param {object} [migrationData]   Additional data to perform the migration.
 * @param {object} [options]         Additional options.
 * @param {object} [options.parent]  Parent of this effect.
 * @returns {object}                 The updateData to apply.
 */
export const migrateEffectData = function (effect, migrationData, { parent } = {}) {
  const updateData = {};
  _migrateImage(effect, updateData);
  _cleanEffect(effect, updateData);
  return updateData;
};

/* -------------------------------------------- */

/**
 * Migrate a single Macro document to incorporate latest data model changes.
 * @param {object} macro            Macro data to migrate
 * @param {object} [migrationData]  Additional data to perform the migration
 * @returns {object}                The updateData to apply
 */
export const migrateMacroData = function (macro, migrationData) {
  const updateData = {};
  return updateData;
};

/* -------------------------------------------- */

/**
 * Migrate a single RollTable document to incorporate the latest data model changes.
 * @param {object} table            Roll table data to migrate.
 * @param {object} [migrationData]  Additional data to perform the migration.
 * @returns {object}                The update delta to apply.
 */
export function migrateRollTableData(table, migrationData) {
  const updateData = {};
  return updateData;
}

/* -------------------------------------------- */

/**
 * Migrate a single Scene document to incorporate changes to the data model of its actor data overrides
 * Return an Object of updateData to be applied
 * @param {object} scene            The Scene data to Update
 * @param {object} [migrationData]  Additional data to perform the migration
 * @returns {object}                The updateData to apply
 */
export const migrateSceneData = function (scene, migrationData) {
  const tokens = scene.tokens.reduce((arr, token) => {
    const t = token instanceof foundry.abstract.DataModel ? token.toObject() : token;
    const update = {};
    _migrateImage(t, update);
    _migrateObjectFlags(t, update);
    if (!game.actors.has(t.actorId)) update.actorId = null;
    if (!foundry.utils.isEmpty(update)) arr.push({ ...update, _id: t._id });
    return arr;
  }, []);
  if (tokens.length) return { tokens };
  return {};
};

/* -------------------------------------------- */

/**
 * Fetch bundled data for large-scale migrations.
 * @returns {Promise<object>}  Object mapping original system icons to their core replacements.
 */
export const getMigrationData = async function () {
  const data = {};
  try {
  } catch (err) {
    console.warn(`Failed to retrieve migration data: ${err.message}`);
  }
  return data;
};

/* -------------------------------------------- */
/*  Low level migration utilities
/* -------------------------------------------- */

/**
 * Migrate any module images from system or old module path to new one.
 * @param {object} objectData      Object data to migrate.
 * @param {object} updateData      Existing update to expand upon.
 * @returns {object}               The updateData to apply
 * @private
 */
function _migrateImage(objectData, updateData) {
  for (const prop of ["img", "icon", "texture.src", "prototypeToken.texture.src"]) {
    const path = foundry.utils.getProperty(objectData, prop);

    let newPath = path?.replace("systems/sw5e/packs/Icons", "modules/sw5e/icons/packs");
    newPath = newPath?.replace("modules/sw5e-module-test/icons/", "modules/sw5e/icons/");
    if (newPath !== path) {
      updateData[prop] = newPath;
      console.log("Changed img path for item", objectData.name, "old", path, "new", newPath);
    }
  }
  return updateData;
}

/**
 * Migrate flags from the sw5e test module.
 * @param {object} objectData      Object data to migrate.
 * @param {object} updateData      Existing update to expand upon.
 * @returns {object}               The updateData to apply
 * @private
 */
function _migrateObjectFlags(objectData, updateData) {
  if (objectData.flags["sw5e-module-test"]) {
    updateData["flags.sw5e"] = objectData.flags["sw5e-module-test"];
    updateData["flags.-=sw5e-module-test"] = null;
  }

  return updateData;
}

/**
 * Remove any old effects that have been suplanted by advancements.
 * @param {object} effectData      Effect data to migrate.
 * @param {object} updateData      Existing update to expand upon.
 * @returns {object}               The updateData to apply
 * @private
 */
function _cleanEffect(effect, updateData) {
  const hasAdvancements = effect.parent?.advancement !== undefined;
  if (!hasAdvancements) return updateData;

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

  const newChanges = effect.changes.filter((change) => !blacklisted(change.key));
  if (newChanges.length !== effect.changes.length) updateData["changes"] = newChanges;
  return updateData;
}

/**
 * Migrate properties from the old sw5e system.
 * @param {object} itemData        Item data to migrate.
 * @param {object} updateData      Existing update to expand upon.
 * @returns {object}               The updateData to apply
 * @private
 */
function _migrateItemProperties(itemData, updateData) {
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

  if (itemData.system?._propertyValues) {
    Object.entries(itemData.system._propertyValues).forEach(([k, v]) => {
      if (typeof v === "boolean") return;
      if (itemData.type in propertyChanges && k in propertyChanges[itemData.type])
        k = propertyChanges[itemData.type][k];
      updateData[`flags.sw5e.properties${k}`] = v;
    });
    updateData["system.-=_propertyValues"] = null;
  }

  if (itemData.system?.properties && itemData.type in propertyChanges) {
    let changed = false;
    const newProperties = data.system.properties.map((k) => {
      if (k in propertyChanges[data.type]) {
        changed = true;
        return propertyChanges[data.type][k];
      }
      return k;
    });
    if (changed) updateData["system.properties"] = newProperties;
  }

  return updateData;
}

/**
 * Migrate spell data from the old sw5e system.
 * @param {object} itemData        Item data to migrate.
 * @param {object} updateData      Existing update to expand upon.
 * @returns {object}               The updateData to apply
 * @private
 */
function _migrateSpellScaling(itemData, updateData) {
  if (itemData.type !== "spell") return updateData;

  if (itemData.system.scaling === "power") updateData["system.scaling"] = "spell";

  return updateData;
}

/**
 * Migrate advancement data from the sw5e test module or the old system.
 * @param {object} itemData        Item data to migrate.
 * @param {object} updateData      Existing update to expand upon.
 * @returns {object}               The updateData to apply
 * @private
 */
function _migrateAdvancements(itemData, updateData) {
  if (itemData.system.advancement === undefined) return updateData;

  let changed = false;
  for (const adv of itemData.system.advancement) {
    for (const field of ["pool", "items", "grants"]) {
      if (adv?.configuration?.[field]) {
        adv.configuration[field] = adv.configuration[field].map((item) => {
          if (item.uuid) {
            if (item.uuid.search("Compendium.sw5e-module-test.") !== -1) {
              item.uuid = item.uuid.replace("Compendium.sw5e-module-test.", "Compendium.sw5e.");
              changed = true;
            }
          } else if (item === "languages:standard:basic") {
            item = "languages:standard:common";
            changed = true;
          }
          return item;
        });
      }
    }
  }
  if (changed) updateData["system.advancement"] = itemData.system.advancement;

  return updateData;
}

/**
 * Migrate weapon data from the sw5e test module or the old system.
 * @param {object} itemData        Item data to migrate.
 * @param {object} updateData      Existing update to expand upon.
 * @returns {object}               The updateData to apply
 * @private
 */
function _migrateWeaponData(itemData, updateData) {
  if (itemData.type !== "weapon") return updateData;

  if (["martialB", "simpleB", "exoticB"].includes(itemData.system.type.value))
    updateData["system.type.value"] += "L";

  return updateData;
}
