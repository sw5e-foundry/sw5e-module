# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

SW5E is a Foundry Virtual Tabletop (FoundryVTT) module that implements the Star Wars 5th Edition (SW5E) system as an extension to the D&D 5e system. The module transforms D&D 5e mechanics to match the SW5E ruleset, including new weapon types (blasters, lightweapons, vibroweapons), Force and Tech powers instead of spells, and various Star Wars-themed content.

This is a **module**, not a system - it patches and extends the existing dnd5e system rather than replacing it entirely.

## Development Commands

### Build Commands

```bash
# Build compendium database files from JSON sources
npm run build
npm run build:db

# Extract compendium packs to JSON files for editing
npm run build:json

# Clean and format source JSON files
npm run build:clean

# Install dependencies and build
npm install
```

### Working with Individual Packs

```bash
# Build specific compendium pack
npm run build:db -- classes

# Extract specific compendium pack
npm run build:json -- classes

# Clean specific pack
npm run build:clean -- classes

# Clean specific entry within a pack
npm run build:clean -- classes "Barbarian"
```

### Development Workflow

1. Install dependencies: `npm install` (automatically runs `npm run build:db`)
2. Make changes to JSON files in `packs/_source/`
3. Build compendium packs: `npm run build:db`
4. Test changes in FoundryVTT

## Architecture Overview

### Module Structure

- **Entry Point**: `scripts/module.mjs` - Main module initialization
- **Patches**: `scripts/patch/` - System modifications and extensions
- **Data Models**: `scripts/data/` - Custom data structures
- **Templates**: `templates/` - Handlebars UI templates
- **Styles**: `styles/` - CSS styling
- **Languages**: `languages/` - Localization files
- **Compendium Packs**: `packs/` - Game content databases

### Key Architecture Patterns

#### Patching System

The module uses a comprehensive patching system to modify the dnd5e system:

- **Config Patches** (`scripts/patch/config.mjs`): Modifies `CONFIG.DND5E` with SW5E-specific content
- **Data Model Patches** (`scripts/patch/dataModels.mjs`): Extends base system data models
- **Powercasting** (`scripts/patch/powercasting.mjs`): Implements Force/Tech casting system
- **Maneuvers** (`scripts/patch/maneuver.mjs`): Custom maneuver system
- **Properties** (`scripts/patch/properties.mjs`): SW5E weapon/armor properties

#### Compendium Management

- **Source Files**: `packs/_source/` contains JSON files organized by pack
- **Build Process**: `utils/packs.mjs` handles conversion between JSON and FoundryVTT's LevelDB format
- **Data Transformation**: Automatic conversion from SW5E data format to D&D 5e compatible format
- **Content Organization**: 40+ compendium packs covering classes, species, equipment, powers, etc.

#### Initialization Flow

1. **`init` Hook**: Register settings, patch configuration, load templates, initialize data models
2. **`ready` Hook**: Apply pack patches, handle migrations
3. **Strict Mode**: Optional mode that removes D&D 5e content entirely

### SW5E-Specific Systems

#### Powercasting System

Replaces D&D 5e spellcasting with:

- **Force Powers**: Wisdom/Charisma-based, divided into Light/Universal/Dark schools
- **Tech Powers**: Intelligence-based technological abilities
- **Power Points**: Alternative to spell slots
- **Power Progression**: Custom advancement tables for different class types

#### Superiority System

- **Maneuvers**: Special combat techniques using superiority dice
- **Types**: Physical, Mental, General maneuvers
- **Dice Scaling**: Different dice sizes and quantities based on class progression

#### Custom Content Types

- **Species** (replaces Races): Star Wars alien species
- **Archetypes** (replaces Subclasses): Class specializations
- **Weapon Categories**: Blasters, Lightweapons, Vibroweapons with unique properties
- **Starship Content**: Vehicles, modifications, and starship-scale combat

### Migration System

- **Version Tracking**: Module maintains its own migration version separate from dnd5e
- **Data Migration**: Handles updates to actor/item data structures across versions
- **Compendium Migration**: Automatically updates world compendium packs

## Development Guidelines

### Working with Compendium Data

- Always edit JSON files in `packs/_source/`, never the compiled packs directly
- Use the clean command to standardize JSON formatting
- Test changes by building and loading in FoundryVTT
- The build system handles automatic data transformation from SW5E to D&D 5e format

### Adding New Content

1. Create or modify JSON files in appropriate `packs/_source/` subfolder
2. Follow existing naming and data structure conventions
3. Run `npm run build:clean` to format the JSON
4. Build with `npm run build:db`
5. Test in FoundryVTT

### Patching dnd5e Systems

- Extend existing patches in `scripts/patch/` rather than creating new ones
- Use the strict mode flag to control whether D&D 5e content is removed
- Maintain compatibility with dnd5e system updates
- Use lib-wrapper for safe function hooking

### Localization

- All text strings should use localization keys (SW5E.\*)
- Add new strings to `languages/en.json`
- Follow existing key naming conventions

### Testing

- Test with both strict and non-strict modes
- Verify compatibility with latest dnd5e system version
- Test migration functionality when changing data structures
- Validate compendium content after builds

## Important Files to Understand

### SW5E Module Files

- `scripts/module.mjs` - Module entry point and initialization
- `scripts/patch/config.mjs` - Core system configuration patches
- `scripts/patch/powercasting.mjs` - Force/Tech power system implementation
- `utils/packs.mjs` - Compendium build and management system
- `module.json` - Module manifest and metadata
- `packs/_source/` - Source JSON files for all game content

### DND5e System Files (Reference)

The DND5e system is located in `dnd5e/` and contains:

- `dnd5e/dnd5e.mjs` - System entry point
- `dnd5e/module/config.mjs` - Core DND5e configuration (CONFIG.DND5E)
- `dnd5e/module/documents/` - Actor, Item, and other document classes
- `dnd5e/module/data/` - Data models and field definitions
- `dnd5e/module/applications/` - UI applications and sheets
- `dnd5e/system.json` - System manifest

## DND5e System Integration

### How SW5E Patches DND5e

SW5E uses several strategies to modify the DND5e system:

1. **Configuration Overrides**: Modifies `CONFIG.DND5E` object with SW5E content
   - Skills: Adds Lore, Piloting, Technology
   - Damage Types: Adds Energy, Ion, Kinetic
   - Weapon Types: Adds Blaster, Lightweapon, Vibroweapon categories
   - Languages: Replaces with Star Wars languages
   - Conditions: Adds SW5E conditions (corroded, ignited, shocked, etc.)

2. **Data Model Extensions**: Extends DND5e data models
   - Adds powercasting fields to actors and items
   - Extends spellcasting configuration for Force/Tech powers
   - Adds superiority system data

3. **Document Patching**: Uses lib-wrapper to hook into DND5e functions
   - Modifies spellcasting preparation and usage
   - Patches item property handling
   - Extends actor preparation methods

4. **Template and UI Modifications**:
   - Replaces terminology (Spell→Power, Race→Species, etc.)
   - Adds custom templates for SW5E-specific content
   - Modifies existing sheets through CSS and JavaScript

### Key Integration Points

#### CONFIG.DND5E Modifications

```javascript
// In scripts/patch/config.mjs
CONFIG.DND5E.skills.lor = { label: "SW5E.SkillLor", ability: "int" };
CONFIG.DND5E.damageTypes.energy = { label: "SW5E.DamageEnergy" };
```

#### Spellcasting → Powercasting

- Replaces spell slot system with power points
- Adds Force/Tech power progression tables
- Modifies preparation modes and casting mechanics

#### Custom Document Types

- `sw5e.maneuver` - New item type for combat maneuvers
- Custom weapon/armor properties with numeric values
- Starship-specific content types

### Compatibility Considerations

1. **DND5e Version Compatibility**:
   - SW5E requires DND5e 4.3.x (see module.json)
   - Major DND5e updates may require SW5E patches to be updated
   - Test with new DND5e versions before releasing

2. **Strict Mode**:
   - When enabled, removes DND5e content entirely
   - When disabled, SW5E content coexists with DND5e content
   - Controlled by the `strict` flag in patch files

3. **Migration Handling**:
   - SW5E maintains separate migration version from DND5e
   - Handles data transformation during system updates
   - Manages compendium pack updates independently

### Understanding the Patching System

1. **Initialization Order**:

   ```javascript
   // DND5e init hook runs first
   Hooks.once("init", function () {
     CONFIG.DND5E = DND5E; // DND5e sets up configuration
   });

   // SW5E init hook runs after, patches the configuration
   Hooks.once("init", function () {
     patchConfig(CONFIG.DND5E, strict); // SW5E modifies it
   });
   ```

2. **Patch Files Structure**:
   - Each patch file focuses on specific system area
   - Uses conditional logic based on strict mode
   - Maintains backward compatibility where possible

3. **Data Transformation**:
   - Compendium build process converts SW5E format to DND5e format
   - Handles item type changes (power→spell, species→race)
   - Manages property mappings and data structure changes

## FoundryVTT Development Resources

### API Documentation and Guides

The following resources are essential for understanding FoundryVTT development:

#### Official Documentation

- **FoundryVTT API Documentation**: https://foundryvtt.com/api/ - Complete API reference
- **Migration Guides**: https://foundryvtt.com/article/migration/ - Version migration patterns
- **Community Wiki**: https://foundryvtt.wiki/en/development/api - Comprehensive development guides

#### Community Guides (Located in `foundryvtt-api-guide/`)

- **Beginner Macro Guide**: `macro_guide.md` - Introduction to FoundryVTT scripting
- **Advanced API Guide**: `advanced_api_guide.md` - Collections, Compendiums, UUIDs, batch operations
- **Module Creation Guide**: `module_guide_create.md` - How to create and structure modules
- **Region Macros**: `region_macros_guide.md` - Working with region-based scripting

### Key FoundryVTT Concepts for SW5E Development

#### Document System

- **Documents**: Persistent data objects (Actor, Item, Scene, etc.)
- **Data Models**: Define document schemas and validation
- **Collections**: Array-like containers for documents (`game.actors`, `game.items`)
- **Embedded Documents**: Documents nested within other documents (items on actors)

#### Hooks System

```javascript
// FoundryVTT uses hooks for event-driven programming
Hooks.once("init", function () {
  // Module initialization
});

Hooks.on("createActor", function (document, options, userId) {
  // Respond to actor creation
});
```

#### Compendium Packs

```javascript
// SW5E extensively uses compendium packs for content
const pack = game.packs.get("sw5e.species");
const documents = await pack.getDocuments();
const specificDoc = await pack.getDocument("documentId");
```

#### Configuration System

```javascript
// SW5E patches CONFIG.DND5E extensively
CONFIG.DND5E.skills.lor = {
  label: "SW5E.SkillLor",
  ability: "int",
  fullKey: "lore",
};
```

### FoundryVTT Version Compatibility

#### Current Requirements

- **FoundryVTT**: v13.347+ (minimum), v13 (verified)
- **DND5e System**: v4.3.0+ (minimum), v4.3.5 (verified)

#### Migration Considerations

1. **Major Version Updates**: Often require significant code changes
2. **API Deprecations**: Follow migration guides for breaking changes
3. **Data Model Changes**: May require data migration scripts
4. **Hook Changes**: Hook signatures and timing may change

#### Common Migration Patterns

```javascript
// V11 → V12 Example: Application → ApplicationV2
// Old way
class MyApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      // options
    });
  }
}

// New way (V12+)
class MyApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    // options
  };
}
```

### Development Best Practices for SW5E

1. **Use UUIDs for Cross-Document References**:

   ```javascript
   // Good: Universal reference
   const item = await fromUuid("Compendium.sw5e.species.Item.xyz123");

   // Bad: Fragile reference
   const item = game.items.get("xyz123");
   ```

2. **Handle Async Operations Properly**:

   ```javascript
   // SW5E compendium operations are async
   const pack = game.packs.get("sw5e.classes");
   const documents = await pack.getDocuments();
   ```

3. **Use lib-wrapper for Safe Function Hooking**:

   ```javascript
   // SW5E uses lib-wrapper extensively
   libWrapper.register(
     "sw5e",
     "CONFIG.Actor.documentClass.prototype._prepareSpellcasting",
     function (wrapped, ...args) {
       // Custom logic
       return wrapped(...args);
     },
     "WRAPPER"
   );
   ```

4. **Respect Foundry's Document Lifecycle**:
   ```javascript
   // Proper document creation
   const actorData = {
     name: "Test Character",
     type: "character",
     system: {},
   };
   const actor = await Actor.create(actorData);
   ```

### Debugging and Development Tools

1. **Browser Console**: Primary debugging interface

   ```javascript
   console.log(game.actors); // Inspect world actors
   console.log(CONFIG.DND5E); // Inspect DND5e configuration
   ```

2. **Module Hot Reload**: Automatically reload templates, CSS, and lang files during development

3. **Foundry CLI**: For compendium pack management (used by SW5E build system)

## Release Process

Releases are automated via GitHub Actions when a release is published:

1. Extract version from Git tag
2. Update module.json with release-specific values
3. Build compendium packs
4. Create module.zip with required files
5. Attach files to GitHub release
