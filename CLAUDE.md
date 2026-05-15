# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build:db          # compile packs/_source/ JSON → packs/ (Foundry LevelDB)
npm run build:json        # extract packs/ back to packs/_source/ JSON
npm run build:clean       # normalize/clean pack source data
npm run build:db -- classes                  # single pack
npm run build:json -- classes Barbarian      # single entry
```

**`npm run build:db` requires Foundry VTT to be fully stopped** — Foundry holds a LevelDB lock on `packs/` that blocks the build.

After any `packs/_source/` change: run `build:db`, then restart Foundry (not just browser reload).

There are no tests. There is no frontend bundler — Foundry loads JS/CSS/templates directly from source files at runtime. Code and template changes take effect after a browser reload; pack changes require a rebuild and Foundry restart.

## Architecture

`sw5e-module` is a Foundry VTT module that layers SW5E (Star Wars 5e) content and mechanics onto the `dnd5e` system. It does not fork dnd5e — it patches it at runtime using `lib-wrapper`.

**Targets:** Foundry VTT 13.351, dnd5e 5.2.5, lib-wrapper (required)

**Module ID:** `sw5e-module` — the Foundry data symlink directory must be named `sw5e-module` to match. (The ID was changed from `sw5e` upstream; mismatches cause "Invalid module detected" errors.)

**Entry point:** `module.json` → `scripts/module.mjs`
- `init` hook: registers settings, lib-wrapper hooks, preloads templates, applies patches
- `ready` hook: patches pack behavior, finalizes proficiency, runs migrations

### Patch Layer (`scripts/patch/`)

All runtime dnd5e integration lives here. Key files:

| File | Purpose |
|------|---------|
| `config.mjs` | Adds SW5E entries to `CONFIG.DND5E` (damage types, abilities, armor classes, tools, etc.) |
| `dataModels.mjs` | Extends dnd5e data model schemas (powercasting fields, superiority, proficiency changes); registers `ItemSheetSW5E` |
| `powercasting.mjs` | Force/tech powercasting point computation; hooks into actor prep and sheet rendering |
| `starship-prepare.mjs` | Derives starship runtime data (hull/shields, movement, crew) from legacy JSON flags |
| `starship-sheet.mjs` | Injects SW5E and Starship Features tabs into the dnd5e VehicleActorSheet via `renderActorSheetV2` hook — see [`docs/actor-sheet-tabs.md`](docs/actor-sheet-tabs.md) for tab system details |
| `character-deployment-sheet.mjs` | Character Features tab: injects parent Deployment as stock `section.classes` pills (`class pill-lg`, `.level-selector` in EDIT); Ventures/Deployment feat grouping + hide parent Deployment from ordinary feature rows |
| `maneuver.mjs` | Maneuver item type behavior |
| `addHooks.mjs` | Central hook/wrapper registration |

### Custom Document Types

Only one custom item type is registered: `sw5e-module.maneuver` (declared in `module.json` `documentTypes` and registered in `dataModels.mjs`). All other item types (modifications, deployments, starship sizes, etc.) use generic dnd5e types (`loot`, `feat`, etc.) to stay compatible with upstream.

Starship actors use the stock `vehicle` type, not a custom type. The module identifies them via `actor.flags.sw5e.legacyStarshipActor.type === "starship"`.

### Starship sheet: stock travel UI

Starship vehicle sheets use the same dnd5e sidebar **Travel Speed** and **Travel Pace** rows as other vehicles (no module suppression). **Stock Hit Points** remain hidden in favor of the custom Hull + Shield summary.

**Design note:** If the project later adds SW5E-specific campaign-scale travel fields, prefer **custom SW5E data/UI** that is **manual by default** rather than auto-derived from tactical space/flying/turning speed.

### Compendium Workflow

`packs/_source/` is the source of truth — one JSON file per document, organized by pack name. `packs/` contains generated LevelDB databases and is never edited by hand.

The build pipeline (`utils/packs.mjs`) normalizes legacy SW5E data shapes into current dnd5e-compatible forms before writing to the database.

### Localization

All i18n strings live in `languages/en.json`. The module uses `localizeOrFallback(key, fallback)` (defined in `starship-sheet.mjs`) throughout the starship UI to gracefully handle missing keys.

## Key Conventions

- `packs/_source/` JSON is edited; `packs/` is generated. The git repo tracks source, not built output.
- The `scripts/dnd5e-source-normalization.mjs` and `scripts/starship-data.mjs` files handle legacy starship data — the ships in Drake's Shipyard store their derived values in `flags.sw5e` rather than in the dnd5e schema.
- dnd5e system source files are at `~/Library/Application Support/FoundryVTT/Data/systems/dnd5e/`. Foundry core is at `/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/`.
- The `module-support.mjs` helpers (`getModuleId()`, `getModuleType()`, `getLegacyModuleType()`) abstract over both the `sw5e-module` (current) and `sw5e` (legacy) module IDs.
