![](https://img.shields.io/badge/Foundry-v13-informational)
![Latest Release Download Count](https://img.shields.io/github/downloads/sw5e-foundry/sw5e-module/latest/module.zip) 

# SW5E

Implementation of the sw5e system as a module for dnd5e.

Current target compatibility: Foundry VTT `13` with `dnd5e` `5.2.5`.

## Installation

This module is not listed on Foundry's website or in the in-app Module Repository because it contains homebrew content.

### Install The Latest Release

If you want the newest release, open Foundry's `Install Module` window and paste this URL into the `Manifest URL` box at the bottom:

https://github.com/sw5e-foundry/sw5e-module/releases/latest/download/module.json

### Install A Specific Release

If you want a specific version instead of the latest one:

1. Open the [Releases page](https://github.com/sw5e-foundry/sw5e-module/releases).
2. Open the release you want to install.
3. Copy the link to that release's `module.json` artifact.
4. In Foundry, open `Add-on Modules` -> `Install Module`.
5. Paste the link into the `Manifest URL` box at the bottom of the window.
6. Click install.

If you wish to manually install the module, clone or extract it into the `Data/modules/sw5e-module` folder. You may do this by cloning the repository or downloading a zip archive from the Releases Page.

## Local Development

This repository is the editable source for the `sw5e-module` Foundry module. For local work, use Foundry VTT `13.351`, the `dnd5e` system `5.2.5`, and the `lib-wrapper` module.

If your local repository is linked into Foundry's `Data/modules/sw5e-module` folder with a junction or symlink, most code and template changes can be tested by refreshing Foundry after you save your edits.

Compendium content is different:

- Edit the source JSON in `packs/_source/`
- Rebuild the generated compendium databases with `npm run build:db`
- Reload Foundry and verify the updated compendium entries in your test world

The `packs/` folder is generated output and should not be edited by hand. The source of truth is `packs/_source/`.

For a plain-English walkthrough of what is safe to edit, when to rebuild, and a copy/paste template for reporting a bug or requesting a change, see [docs/local-setup.md](docs/local-setup.md).

## Cybernetic Augmentations

**What it is:** Cybernetic augmentations are an **actor-level** implant system for **non-droid** characters and NPCs. They are separate from normal **item chassis / modifications** and from editing species on the sheet.

**Where it appears:** On eligible **character** and **NPC** sheets (not vehicles or legacy starships), an inline **Cybernetic Augmentations** block sits in the details area (near background / senses). Use **Manage…** to open the full **manager** window. In **Play** mode the inline block is shown only when **at least one** augmentation is installed **or** the sheet is in **Edit** mode (so empty characters are not cluttered in play).

**Routing:** Right now, who uses this UI is decided by **species only**: actors whose species is one of **Droid, Class I** through **Droid, Class V** are **not** shown cybernetic augmentations (they use **Droid Customizations** instead). Everyone else eligible uses cybernetic augmentations here. This does **not** follow creature type or the augmentation **count as droid** side effect for that choice.

**What you can do today:**

- **Install** and **remove** augmentations from the manager, with validation feedback (blocking issues, warnings, and details such as tool and DC when present).
- See **installed** entries in a table; **click a name** to open the source item sheet when Foundry can resolve it (otherwise you may see a short saved text preview when available).
- See **derived** side effects from install count (RAW thresholds) and **effective** values after GM overrides.
- **GM:** force an install past blocking validation when appropriate; adjust per-side-effect **overrides** (derived vs forced on/off).
- **Body slots** and **capacity** (max installs vs proficiency-based cap) are enforced according to the current rules implementation. Default **creature type** eligibility (e.g. humanoid/beast) applies unless an item supplies its own valid targets.

**Pack / routing signal:** Items in the **Modifications** compendium (and homebrew) can be treated as cybernetic content when **Custom Label** (`system.source.custom`) is exactly **`Cybernetic Augmentation`**. Native `flags.sw5e.augmentation` on an item is also supported for authored items.

**Enhancement vs replacement:** That distinction is **not** driven by a dedicated Configure Sheet field for this workflow. Pack items usually express it in the description (and legacy importer metadata where present). For routing, **Custom Label** is what matters for label-routed items.

**Homebrew cybernetics:** Create a **Loot** item (or another item type your table uses). Under **Source**, set **Custom Label** to **`Cybernetic Augmentation`**. It can appear in the manager’s install list (world items). Compendium edits still go through `packs/_source/` and `npm run build:db` when you change pack JSON.

**API:** `globalThis.sw5e.augmentations` (includes `openManager(actor)` for the manager window).

## Droid Customizations

**What it is:** Droid Customizations are an **actor-level** modification system for **droid-class** characters and NPCs. They are separate from **Cybernetic Augmentations** and from normal **chassis / item modifications**.

**Routing (species only):** An actor is a droid customization host if their **species name** is exactly one of:

- Droid, Class I  
- Droid, Class II  
- Droid, Class III  
- Droid, Class IV  
- Droid, Class V  

Vehicles, legacy starships, and non-droid species do not get this UI. More nuanced host rules may come later; today it is **species only**.

**Where it appears:** Droid hosts see a **Droid Customizations** block on the sheet (same general area as cybernetics). **Manage…** opens the **Droid Customizations** manager. The inline block stays visible in play mode even when empty, so the section is always there for droids.

**What you can do today:**

- **Install** and **remove** customizations using the manager (validation, then commit).
- See **motor slot** usage (used vs total), **parts** and **protocols** counts vs allowed caps, and short notes on whether caps use a **stored ability** or the **highest modifier fallback** when none is set yet.
- **Upgrade motor capacity** (supported totals **3–6** slots) with shown **credit cost** and **install time** by size; **GM** can force past blocking validation when needed.
- **Click an installed name** to open the source item when Foundry can resolve the UUID.

**Pack / routing signal:** Items can be recognized via native `flags.sw5e.droidCustomization` **or** **Custom Label** **`Droid Customization`**. **Part vs Protocol** still comes from item data (metadata and/or description/importer patterns for routed pack items—not from a new Configure Sheet field in this workflow).

**Homebrew droid parts:** Same pattern as pack routing: **Loot** (or your table’s item type), **Custom Label** **`Droid Customization`**, then pick it in the droid manager. Compendium changes use `packs/_source/` + `npm run build:db` as usual.

**API:** `globalThis.sw5e.droidCustomizations` (includes `openManager(actor)` and helpers such as `isActorDroidCustomizationHost` / `isDroidCustomizationItem`).

## Body-mod content routing (pickers)

Practical rules today:

1. **Normal chassis / modification install browser** (item modifications on chassis): lists modifications that belong in that workflow. It **does not** list items whose **Custom Label** is **`Cybernetic Augmentation`** or **`Droid Customization`** (and stays separate from **Enhanced Items** as before).
2. **Cybernetic Augmentations** install list: **native** `flags.sw5e.augmentation` items **or** **Custom Label** **`Cybernetic Augmentation`**. It **does not** include droid customization items (Custom Label or native droid flag).
3. **Droid Customizations** install list: **native** `flags.sw5e.droidCustomization` items **or** **Custom Label** **`Droid Customization`**. It **does not** include cybernetic augmentation items.

Same item should not need to appear in more than one of those pools; the Custom Labels (or native flags) keep the workflows apart.

## Current limitations (body-mod systems)

- **Automation:** There is **no** full astrotech (or equivalent) **install check rolling** pipeline, **failure consequence** automation, or complete **runtime mechanical effect** application for every implant/customization in Foundry yet. What you get now is **routing**, **install/remove**, **capacity and side-effect tracking** (augmentations), **motor slots / parts-protocol caps / upgrades** (droids), and the **manager UIs** described above.
- **Routing:** Droid vs cybernetic **sheet** choice is **species-only** for now; that may expand later.
- **Droid caps:** Choosing which **ability** governs parts vs protocols on the sheet is **visibility-only** in the manager today unless you set the underlying flag fields (future UI may make that easier).

## Developer Documentation

For a contributor-focused overview of the repo layout, runtime entrypoints, compendium build pipeline, and release packaging, see [docs/developer-guide.md](docs/developer-guide.md).

## Included Legacy Content

The module includes Heretic's Guide to the Galaxy species content as dedicated baked-in compendiums instead of mixing it into the core species lists:

- `HGTTG Species`
- `HGTTG Species Features`

## Beta Testing

For the current beta coverage checklist spanning `1.2.9` and `1.3.0`, see [1.2.9-1.3.0_BetaTestList.md](1.2.9-1.3.0_BetaTestList.md).

## Changelog

### [1.3.4] TEMP - 2026-04-26

### Added
- Added hue-rotate filters to the dual_color_saber background image used on encounter, group, npc, vehicle and item sheets to provide a visual distinction between the sheets.

### Changed
- Removed ".dnd5e2.sheet.actor .window-content {position: relative;}" as it was causing the tabs on the group sheet to not function and was offsetting buttons on the sheet.

### Fixed
- dual_color_saber background image now replaces the DND5e image used for encounter, group, npc, vehicle and item sheets properly where it had not before due to formatting differences between the player sheet and the others.
- Tabs of the group sheet now render properly to the right of the sheet and function as intended.


### [1.3.3] - 2026-04-23

### Added

- Starship **Core** dashboard on the **SotG** tab, with character-sheet-aligned ability and skill presentation for both **PLAY** and **EDIT** modes.
- Dedicated starship **Weapons** subtab for mounted weapons and starship ordnance, separated from **Actions**.
- Starship **Systems** subtab status copy for setup-vs-play behavior, including a **Usable in Play mode** badge for power routing and edit-mode hints for fuel/supporting fields.
- Starship ability tiles now open a check-or-save prompt, matching the expected character sheet interaction.

### Changed

- Starship **Overview** is now labeled **Core**, and the former **Features** subtab is now labeled **Actions**.
- Starship **SotG** no longer shows the old **Starship at a Glance** heading/description block.
- Starship **SotG item groups and rows** now use dnd5e-style inventory/cargo presentation more closely, including primary name-strip interaction, grouped card headers, right-side icon controls, context-menu parity, and visible **Price** / **Weight** columns where the subtab stands on its own.
- Starship **Core ability editing** now follows the expected base-vs-effective split: **PLAY** shows effective/live values, while **EDIT** presents the stored base score for direct editing.
- Starship **Cargo** filters out items already surfaced in SotG **Actions**, **Weapons**, **Equipment**, or **Modifications**, while preserving true cargo and uncategorized items.
- Starship sheet layout now treats **SotG + Cargo** as the main starship workflow by suppressing duplicate stock vehicle ability/features presentation and moving starship ability/skill presentation into the custom SW5E Core experience.

### Fixed

- Starship **SotG row actions** now behave consistently: the primary action in **PLAY** uses/posts the item, **EDIT** opens the item sheet, and the **ellipsis/context menu** and **delete** controls work reliably without overlapping hit targets.
- Starship **Core ability** inputs no longer compete with duplicate stock vehicle controls during form submission, preventing invalid integer submits and other starship ability serialization conflicts.
- Starship ability score editing no longer accumulates repeated drift when toggling **EDIT -> PLAY**; base values persist correctly, active effects are no longer baked back into the actor by the toggle path, and **DEX/WIS/CON** no longer step upward or downward on each mode change.
- Starship ability checks and saving throws now roll through a starship-safe prompt path, include the correct ability modifier and bonuses, and avoid the dnd5e `mergeObject` crash seen on vehicle-backed starships.
- Starship Cargo filtering no longer walks broad dnd5e config objects, avoiding deprecated `CONFIG.DND5E.spellPreparationModes` / `spellcastingTypes` compatibility warnings.

### Migration

- No new persisted schema migration is required for the 1.3.3 starship sheet work. Existing vehicle-backed starships continue through the current `legacyStarshipActor` normalization path, while new ability edits are sanitized and mirrored to the legacy starship flag during actor updates.

### [1.3.2] - 2026-04-17

### Added

- Actor creation option to make a **Starship** as a **vehicle** actor with SW5E starship identity and seeded `legacyStarshipActor` data so new hulls open cleanly on the starship sheet workflow.
- Chassis **Install Modification** browser: subdued **informational hint** line (template + styling) for legacy pack metadata, low-confidence inference, missing slot-role / tool–DC notes, etc., separate from the **Warning** badge.
- **Cybernetic Augmentations:** Actor-level implant data and validation; inline section and **manager** on eligible character/NPC sheets with **install/remove**, installed list, **derived** and **effective** side effects, **GM overrides**, body-slot and capacity checks; routing via **Custom Label** `Cybernetic Augmentation` and native `flags.sw5e.augmentation`; routed items **excluded** from the chassis modification browser; **clickable** installed names when the source item resolves (with snapshot preview fallback when available).
- **Droid Customizations:** Actor-level customization data with **motor slots** (including **upgrades** toward a maximum of 6), **parts/protocol** limits, validation, inline sheet summary, and **manager** for droid-class species; routing via **Custom Label** `Droid Customization` and native `flags.sw5e.droidCustomization`; **species-only** separation from cybernetic augmentations; routed items **excluded** from the chassis browser and from the cybernetic picker; **clickable** installed names when the source item resolves.

### Changed

- **Cybernetic Augmentations** and **Droid Customizations** manager windows (ApplicationV2): fixed window height with **scrollable** inner body and **dark-themed** shell consistent with the augmentations UX.
- Starship skill **inline configure (cog)**: Save uses DialogV2’s `submit(result, dialog)` contract and reads **Ability** and **Check bonus** from the dialog form (`FormData` / `dialog.form`). **Proficiency level** was removed from the cog UI and save path so it no longer overwrites persisted skill tier (`skill.value`); existing stored tiers remain for roll math.
- Starship **skill list / modifiers**: per-skill **ability** from saved data is preferred over `CONFIG.DND5E.starshipSkills` defaults; proficiency **multiplier** uses tier numbers **0**, **0.5**, **1–5** (dnd5e 5.2 `proficiencyLevels` are labels without `.mult`); proficiency tier **hover** text localizes CONFIG string entries; merged **vehicle proficiency** for display prefers `actor.system.attributes.prof` when present.
- Starship **legacy skill merge** on vehicle actors: flag-backed `skills` are not clobbered by prepared or empty `actor.system.skills`.
- Chassis **Install Modification** browser: **Valid / Warning / Blocked** row tier for **Modifications compendium** candidates is driven by **significant** validation issues only (rarity + placement policy unchanged). Informational codes such as legacy pack adaptation, low-confidence inference, and install-DC notes no longer force a **Warning** badge by themselves; **Warning** text on the row shows those significant issues only. **Strict / guided / freeform** behavior and source rules (**Modifications** pack + explicit world `flags.sw5e.chassisMod`) are unchanged.
- Chassis install **confirm** dialog: **Confirm install** / **Install anyway** button callbacks **return `true`** after commit so DialogV2 closes reliably.

### Fixed

- Starship skill **rolls** apply **proficiency bonus × skill tier** using the **rolling user’s** assigned **character** when that actor is on this ship’s **deployment** roster (pilot, active station, crew, or passenger). If the roller has no assigned character or is not deployed, the proficiency term is **zero** (vehicles are not treated as carrying their own PB for this path). Roll configuration preview and `@prof` substitution in roll data use the same deployed character bonus.
- Chassis **Install Modification** workflow: **Continue** reads the user’s choice from DialogV2’s real form (**`button.form`**, with fallbacks), uses **`RadioNodeList` / named form fields** for the pick, and maps the UUID through a stable **row map** so the selected browser row (including **effective compendium metadata** for install and snapshot) matches commit-time validation. **Empty selection**, **missing form**, and **orphan radio values** surface clear notifications instead of failing silently.

### [1.3.1] - 2026-04-09

### Added

- **Crew management UI** on the **SotG** (Song of the Galaxy) tab for vehicle starships.
- **SotG sidebar** readouts for **hull / shield dice**, **power routing**, and **mod slot** usage.
- Beta testing checklist documentation and a **README** link (starship / beta coverage).

### Changed

- Removed dead **character-backed** starship paths in favor of the vehicle starship workflow.
- **Power routing** summary text aligned between the **sidebar** and the **Overview** card.
- `starship-character.mjs` cleanup and hardening from review feedback.

### Fixed

- Starship **vehicle movement** type no longer displays as **air** when it should be **space**.
- **Edit mode** no longer resets the active sheet tab from **SotG** to **Cargo** after toggling.

### [1.3.0] - 2026-04-03

### Added

- Optional Star Wars currencies with GM-managed enablement, custom exchange rates, and exchange-rate tooltips integrated into actor wallets and item price denomination selectors.
- Baked-in Heretic's Guide to the Galaxy species compendiums, published as dedicated `HGTTG Species` and `HGTTG Species Features` packs with migrated artwork and V13 / `dnd5e` 5.2.5-compatible data.

### Changed

- Currency support now follows the dnd5e multi-denomination workflow more closely, including wallet normalization for existing actors and better compatibility with convert and transfer actions.
- The SW currency configuration app now uses the module namespace correctly, appears under `SW5E` in settings, and supports a bounded scrollable layout.
- Legacy HGTTG species are now separated from the main `Species` compendium instead of being merged into the core species roster.
- Repository line-ending rules are now pinned with `.gitattributes` so generated compendium source files behave consistently across Windows and non-Windows development environments.
- Vehicle-backed starships are now the authoritative SW5E runtime path, with legacy and character-backed starship data normalized into the vehicle sheet workflow during migration and pack conversion.
- Starship sheet navigation now presents `SotG` and `SotG Features` ahead of the stock tabs, while hiding the stock `Features` tab on SW5E starship sheets so the remaining tabs can use the full width.

### Fixed

- Force and Tech point editing on character and NPC sheets, including current-point save behavior, post-bonus max handling, repeated save drift, and edit access from the cog-only sheet control.
- The redundant Power Point Controls panel on actor sheets has been removed.
- Currency fields now render correctly on the Inventory tab for enabled denominations, and tooltip text no longer shows unresolved placeholders.
- Legacy image migration no longer replaces actor and vehicle avatars with the loot bag icon, and affected worlds are repaired during migration.
- Stale dnd5e image references in migrated data and compendium content no longer cause repeated missing-image errors.
- Starship compendium builds now preserve vehicle-backed system data such as `details.type`, and migrated starships retain their SW5E movement, travel, crew, and routing data more consistently.

### [1.2.9] - 2026-03-13

### Added

- Local development and contributor documentation, including install instructions and a plain-English change request template.
- A guided legacy world conversion tool for migrating older SW5E worlds into the module workflow.
- Vehicle-backed starship sheets with custom `SW5E` and `Features` tabs, starship skill rolls, travel and hyperdrive displays, crew-aware summaries, and starship item quick actions.

### Changed

- Starship movement now uses a derived runtime for flying speed, turning speed, travel pace, hyperdrive, crew state, and power-routing effects.
- Force and Tech point sheet support has been expanded to better match the dnd5e sheet workflow across character and NPC use cases.
- Compendium and migration handling has been hardened for legacy SW5E data and newer dnd5e data expectations.

### Fixed

- Foundry V13 and dnd5e 5.2.5 compatibility issues across starship sheets, roll dialogs, migration, item activity normalization, and deprecated roll/application APIs.
- Multiple starship sheet issues affecting warnings dialogs, tab visibility, sidebar summaries, skill rolls, and ship weapon interactions.
- Powercasting sheet display issues, medpac syntax/runtime problems, and reload-related item workflow regressions.

### [1.2.8] - 2025-12-14

### Fixed

- Weapon Templates on Attacks.
- Powercasting Cards on Sheets.
- DnD5e 5.2 Conflict/Incompatibility.

### [1.2.7] - 2025-11-21

### Added

- Unify art style for images of conditions.

### Fixed

- Tool Proficiencies on Character Sheet.
- Enhanced property on Weapons and Equipment.
- Image rendering of icon for damage type of energy, ion, kinetic, etc.

### [1.2.6] - 2025-10-31

### Added

- Conditions now have descriptions and images.

### Fixed

- Powercasting Bars on Character Sheet.
- Classes now have additional labels within their details to specify Powercasting and Maneuver progression.
- Equipments and Weapons now have specific configuration labels for their special Properties.

### [1.2.5] - 2025-03-03

### Changed

- Module is now compatible with and requires dnd5e 4.3.x.

### [1.2.4] - 2025-02-12

### Added

- Consumable type and subtypes for explosives.

### Changed

- Compendium updates.

### [1.2.3] - 2025-02-09

### Added

- Backgrounds now have advancements granting their skill and language proficiencies.

### Changed

- Compendium Updates.

### [1.2.2] - 2024-12-05

### Added

- Force/Tech Points will now be displayed as bars bellow hit points.

### Changed

- Compendium Updates.

### Fixed

- Dropping powers on powercasters now properly set them to 'powercasting' preparation.
- Power 'properties' are no longer automatically added on opening their sheet.

### [1.2.1] - 2024-11-27

### Changed

- Compendium Updates.

### Fixed

- The UI for editing numeric item properties should once again work.

### Removed

- Reload system temporarily removed.


### [1.2.0] - 2024-11-26

### Added

- Compatibility with dnd5e 4.1.0.

### Fixed

- Superiority progression selectors will no longer show up as 'nulldnull dice' when not available.

### [1.1.0] - 2024-09-13

### Added

- Support for Maneuvers and Superiority 'casting'.

### Fixed

- Compendium Powers now have their resource consumption set to use the correct amount of power points.
- Powercasting and Superiority progression selectors will now be properly disabled on non editable class sheets (unowned or on locked compendia).

### [1.0.0] - 2024-08-29

### Added

- Compendium Powers now have their resource consumption set to use power points.
- Migration.

### Changed

- Module name changed from `sw5e-module-test` to `sw5e`.
- Github repository ownership changed to the `sw5e-foundry` organization.

### Fixed

- Adde missing localization for Power and Shield dice.
- Powerbook tab should properly populate with sections for available powercasting levels.

### [0.18] - 2024-08-23

### Added

- Item IDs for specific proficiencies and base items.

### Fixed

- Compendium item advancements should now use the correct ids for tool and blaster proficiencies.
- Compendium weapons should no longer have wrong properties due to their descriptions.

### [0.17] - 2024-08-13

### Added

- Reload Property automation.
- Very minor rapid/burst automation (when the item action is set to 'saving throw', the base ammo cost is set to the rapid/burst value).

### Fixed

- Compendium items should now have the correct ids on the advancements.
- Compendium species should no longer have active effects that change proficiencies, senses, movement, or any other traits handled by the species item and advancements.
- Compendium classes and archetypes should have the proper powercasting progression.

### [0.16] - 2024-08-01

### Fixed

- Compendium Packs should now actually be included in the release.

### [0.15] - 2024-07-30

### Added

- Compendium Packs - This is highly experimental and untested, the majority of the items are untested.

### Fixed

- NPC sheets and unowned powers should no longer fail to open.

### [0.14] - 2024-07-29

### Changed

- Force/Tech Powers now use the proper ability scores and respect max power level.

### [0.13] - 2024-07-24

#### Added

- Powercasting

### [0.1] - 2024-07-22

#### Added

- Localization overrides (I.E: Spell -> Power, Subclass -> Archetype, Race -> Species...)
- Skills (lore, piloting, tech)
- Weapon types (blaster, lightweapon, vibroweapon)
- Tool types (specialist's kits)
- Creature types (droid, force)
- Equipment types (wristpad, focus generator, starship armor, starship equipments)
- Ammunition types (power cell, cartridge...)
- Feature types (invocations, customization options, deployments...)
- Item properties (auto, burst, keen...)
- Galactic Credits
- Damage types (ernegy, ion, kinetic)
- Higher proficiency levels (only display, no automation)
- Conditions (corroded, ignited, shocked, slowed...)
- Languages
- Character flags (Maneuver Critical Threshold, Force/Tech Power discount, Supreme XYZ, Encumbrance Multiplier) (only display, no automation)
- Source Books (PHB, SnV, WH...)
- Numeric Item Properties can have their values set correctly
- Keen property automated
