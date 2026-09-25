# Foundry 14 / 1.4.3 → 2.x migration gates

Status: **Awaiting Foundry**. No gate on this page is closed. Offline tests (`utils/test-migration-*.mjs` and similar) do **not** close these gates. Do not record Pass results without a live Foundry run.

**1.x source:** SW5e **1.4.3** (Foundry 13 / dnd5e 5.2.5). Copy the world; never migrate production in place.

**Module stamp check (offline, not a Foundry Pass):** `module.json` `flags.needsMigrationVersion` is **2.0.0**, which is greater than the 1.4.3 world stamp **1.3.6**, so GM `ready` will run `migrateWorld` on a copied 1.4.3 world.

## Phase 1 — Foundry v14 (copy of a 1.4.3 world, GM user)

- [ ] Gate 1 — World loads after Foundry 14 upgrade (before or with dnd5e 6 — record which). — Awaiting Foundry
- [ ] Gate 2 — dnd5e system migration completes; SW5e barrier then `migrateWorld` completes and stamps `moduleMigrationVersion`. — Awaiting Foundry
- [ ] Gate 3 — Advancements and activities still on class/subclass/feat items. — Awaiting Foundry
- [ ] Gate 4 — Portraits, prototype tokens, and scene tokens remain. — Awaiting Foundry
- [ ] Gate 5 — Starships remain vehicles with Hull/Shields; Auto-Thrusters not duplicated. — Awaiting Foundry
- [ ] Gate 6 — Maneuvers still `sw5e-module.maneuver`; no `_stats.systemId: "sw5e"` left on migrated docs. — Awaiting Foundry

## Phase 2 — Foundry 14.368 + dnd5e 6.0.3 smoke

Run on a migrated 1.4.3 copy **and** a clean 2.x world.

- [ ] Gate P2-1 — No unverified-package warning for 14.368 / 6.0.3 after metadata lands. — Awaiting Foundry
- [ ] Gate P2-2 — Character / NPC / vehicle / starship sheets, Activities, chat cards, token bars. — Awaiting Foundry
- [ ] Gate P2-3 — Starship Role movement AEs still `system.attributes.movement.speeds.space|turn`. — Awaiting Foundry
- [ ] Gate P2-4 — Minimum path still loads: Foundry **14.367** + dnd5e **6.0.0**. — Awaiting Foundry
- [ ] Gate P2-5 — World-owned packs migrate; **module** packs are rebuild/reimport, not rewritten in user Data. — Awaiting Foundry
