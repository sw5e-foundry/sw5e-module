import { addHooks } from "./patch/addHooks.mjs";
import { patchConfig } from "./patch/config.mjs";
import { patchDataModels } from "./patch/dataModels.mjs";
import { patchPacks } from "./patch/packs.mjs";
import { patchManeuver } from "./patch/maneuver.mjs";
import { patchPowercasting } from "./patch/powercasting.mjs";
import { patchProficiencyInit, patchProficiencyReady } from "./patch/proficiency.mjs";
import { patchProperties } from "./patch/properties.mjs";
import * as migrations from "./migration.mjs";
import { handleTemplates } from "./templates.mjs";
import { registerModuleSettings } from "./settings.mjs";
import StarshipVehicleSheet from "./applications/actor/vehicle-starship-sheet.mjs";

globalThis.sw5e = {
  migrations,
};

const strict = true;

Hooks.once("init", async function () {
  // Register Module Settings
  registerModuleSettings();
  // Register lib-wrapper hooks
  addHooks();
  // Pre-load templates
  handleTemplates();

  // Register the Starship overlay sheet for Vehicle actors
  try {
    Actors.registerSheet("sw5e", StarshipVehicleSheet, {
      types: ["vehicle"],
      makeDefault: false,
      label: "SW5E Starship (Vehicle)",
    });
  } catch (err) {
    console.warn("SW5E: failed to register StarshipVehicleSheet", err);
  }

  patchConfig(CONFIG.DND5E, strict);
  patchDataModels();

  patchManeuver();
  patchPowercasting();
  patchProficiencyInit();
  patchProperties();
});

Hooks.once("ready", async function () {
  patchPacks(strict);
  patchProficiencyReady();

  // Perform module migration if it is required and feasible
  if (migrations.needsMigration()) migrations.migrateWorld();
});
