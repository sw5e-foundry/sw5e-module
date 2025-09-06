# Changelog

All notable changes to this project are documented in this file.

## Unreleased

### Added
- Starship sheet UI/UX
  - Per-route power routing tooltips for Engines, Shields, Weapons. Tooltips show Positive | Neutral | Negative effects for the target route.
  - Localized labels for power slots (Central, Comms, Engines, Sensors, Shields, Weapons) and for starship skills (e.g., Astrogation, Maneuvering, Ram, Patch, Scan).
  - "Use" controls on starship item lists (Equipment, Weapons, Actions, Features). Clicking attempts `item.use()` and falls back to `item.roll()` or `item.displayCard()`.
- Repairs automation
  - Recharge: confirmation dialog showing HP and shield restoration and computed cost. Enforces cooldown (default 1 hour).
  - Refitting: confirmation dialog with computed flat cost. Enforces cooldown (default 24 hours).
  - Optional currency deduction if configured (see Configuration below).
- Configuration (per-actor, GM-friendly and homebrew-ready)
  - `flags.sw5e.starship.config.recharge`: `{ cooldownHours, costPerHP, costPerShield }`
  - `flags.sw5e.starship.config.refit`: `{ cooldownHours, flatCost }`
  - `flags.sw5e.starship.config.currency`: `{ path, factor, allowNegative }`
    - `path`: dot-path to numeric currency field (e.g., `system.currency.cr`)
    - `factor`: multiplier applied to cost before deduction
    - `allowNegative`: if `true`, currency can go below zero
  - `flags.sw5e.starship.config.shields`: `{ autoDerive, allowManualMax }`
    - `autoDerive`: derive max shields from equipped starship shields (default `true`)
    - `allowManualMax`: if true, allows manual editing even when `autoDerive` is enabled

### Changed
- Shields
  - Max shields now auto-derive from equipped starship shield items. Current shields are clamped to the new max; depleted flag updates automatically.
  - Shield Max input is read-only when `autoDerive` is `true` and `allowManualMax` is `false`. Shows a tooltip indicating the value is derived.
- Config exposed to the template so the UI can reflect configured behavior (tooltips, read-only toggling, etc.).

### Migration
- Legacy starship flags are normalized automatically during migration:
  - `flags.sw5e.starship.shld.*` → `flags.sw5e.starship.shields.*`
  - `flags.sw5e.starship.speed.*` → `flags.sw5e.starship.movement.*`
  - `flags.sw5e.starship.route` → `flags.sw5e.starship.routing`
  - `flags.sw5e.starship.deployed` → `flags.sw5e.starship.deployment`
  - `flags.sw5e.starship.fuel.capacity` → `flags.sw5e.starship.fuel.cap`
  - `flags.sw5e.starship.power.dice` → `flags.sw5e.starship.power.die`
  - `flags.sw5e.starship.skills.{astrogation, maneuvering, patch, scan, ...}` → corresponding abbreviations `{ast, man, pat, scn, ...}`

### Localization
- Added/updated localization keys:
  - `SW5E.Starship.PowerSlot.{Central,Comms,Engines,Sensors,Shields,Weapons}`
  - `SW5E.Starship.RouteEffects.*` (used by tooltips)
  - `SW5E.Starship.ShieldMaxDerived`
  - `SW5E.Starship.Recharge.{Title,Confirm,Done}`
  - `SW5E.Starship.Refitting.{Title,Confirm,Done}`
  - `SW5E.Starship.Cooldown`
  - `SW5E.Starship.Cost.{Insufficient,Deducted,NotConfigured}`
  - `SW5E.Item.NoUseHandler`

### Developer Notes
- New/updated files
  - `scripts/applications/actor/vehicle-starship-sheet.mjs`
  - `templates/actors/vehicle-starship-sheet.hbs`
  - `scripts/migration.mjs` (legacy starship normalization)
  - `languages/en.json` (new keys)
- Shield capacity derivation currently checks common fields on equipped starship shield items (e.g., `system.armor.value`, `system.capacity.value`, `system.capacity`, `system.ac.value`). If a canonical capacity field is adopted, adjust the derivation helper accordingly.
- Currency deduction is optional and driven by configuration; by default, costs are only displayed to the user.

