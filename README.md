![](https://img.shields.io/badge/Foundry-v11-informational)
![Latest Release Download Count](https://img.shields.io/github/downloads/Ikaguia/sw5e-module-test/latest/module.zip) 

# SW5E Module Test

Test module for the implementation of the sw5e system as a module for dnd5e.

## Instalation

To install and use the sw5e module for Foundry Virtual Tabletop, simply paste the following URL into the Install Module dialog on the Setup menu of the application.

https://github.com/Ikaguia/sw5e-module-test/releases/latest/download/module.json

If you wish to manually install the system, you must clone or extract it into the `Data/modules/sw5e` folder. You may do this by cloning the repository or downloading a zip archive from the Releases Page.

## Changelog

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
