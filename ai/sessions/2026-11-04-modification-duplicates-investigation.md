# 2026-11-04 — Modification descriptions and duplicated effects

## Status

Reproduced. Named items recorded. No source, pack, world, commit, or push change in this phase.

## Question

The crew thread `1548441058432786472` is inaccessible and named no item. This pass asks whether modification descriptions or effects are duplicated in pack source, and what the smallest evidence-supported repair would be.

## Method

Read-only scan on 2026-11-04, after Role Spec duplicate removal `caa03bde0`. Those five removed copies are not in the counts below.

Packs:

- `packs/_source/starships/starship-modifications/**` — 257 items. `packs/_source/modifications/` and `packs/_source/starshipmodifications/` are empty.
- `packs/_source/enhanceditems/item-modifications/**` — 1028 items.
- `packs/_source/drakes-shipyard/*.yml` — 87 actors, 1586 embedded items with `flags.sw5e.legacyStarshipMod`, 928 actor-level effects.

Effect identity used `changes.key`, `changes.mode`, `changes.value`, `transfer`, `disabled`, `statuses`, `duration`, and `origin`.

Representational noise, ignored only as documented here:

- Change ordering.
- `duration.startTime` of `0` versus `null`.
- `flags.core.statusId: ""` versus an empty flags object.

An actor-level effect was not called a duplicate just because it mirrored an item effect. It was classified as the expected transferred copy only when `CONFIG.ActiveEffect.legacyTransferral` would be the thing applying it. dnd5e 5.2.5 sets that flag to `false` (`_audit_dnd525/extracted/dnd5e.mjs` line 79115), so a `transfer: true` item effect applies on its own. The actor-level copy is then a second application.

dnd5e's `_duplicatedEffects()` (same file, line 77644) deletes that copy, but only when `_stats.systemVersion` is older than `3.0.3` (lines 76952 and 77135). All 87 Drake actors are stamped `5.2.5`, so that cleanup does not run on a fresh import.

## Candidate table

### A. Duplicated effects — reproduced

| Pack and file | Parent | Name | Item ID | Item effect | Actor-level effect | Description | Mechanical comparison | Classification | Recommended action | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `drakes-shipyard`, all 87 actor files | Every Drake starship | 893 copies across modification, size, feat, and equipment | See kind counts | `transfer: true` on the embedded item | `transfer: false`, `origin: Actor.<same actor>.Item.<item id>` | Not a description defect | 612 copies include at least one ADD (mode 2) change, which stacks. 281 copies are mode 1, 4, or 5 only, so the number does not stack, but the Effects tab lists the effect twice | Duplicated applied effect. Not the expected transferred copy, because `legacyTransferral` is `false` | Delete the actor-level copy by id. Keep the item effect | High. Basilisk PLAY evidence below |

Kind of the 893 copies: modification 468, size 174, feat 126, equipment 125.

ADD-mode change occurrences inside those copies (one copy can hold several):

| Key | Count |
| --- | --- |
| `system.traits.sdr.value` | 285 |
| `system.traits.di.value` | 261 |
| `system.traits.sdi.value` | 229 |
| `system.abilities.con.value` | 115 |
| `system.abilities.dex.value` | 106 |
| `system.abilities.str.value` | 66 |
| `system.details.role` | 44 |
| `system.abilities.wis.value` | 43 |
| `system.attributes.ac.bonus` | 41 |
| `system.attributes.movement.fly` | 27 |
| `system.attributes.movement.turn` | 20 |
| `system.abilities.int.value` | 20 |
| `system.abilities.cha.value` | 19 |
| `system.attributes.mods.cap.max` | 17 |
| `system.abilities.dex.save` | 10 |
| `system.abilities.dex.bonuses.save` | 8 |
| `system.attributes.movement.swim` | 4 |
| `system.skills.ast.bonuses.check` | 3 |
| `system.attributes.prof` | 2 |
| `system.traits.dr.value` | 1 |

Set-mode trait adds are idempotent. Ability, AC, movement, cap, save, and proficiency adds are not.

Foundry evidence already on file, not re-run here: [2026-07-20-basilisk-play-edit-ability-investigation.md](2026-07-20-basilisk-play-edit-ability-investigation.md). Basilisk persisted DEX 8 / CON 21. The size item and the actor-level copy both add +4 DEX / −4 CON. One application matches the workbook total DEX 12 / CON 17. PLAY showed DEX 16 / CON 13, which is the second application.

Examples:

| Pack and file | Parent | Name | Item ID | Item effect | Actor-level effect | Description | Mechanical comparison | Classification | Recommended action | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `drakes-shipyard/akajor-class-shuttle.yml` | `tRnGAAILKowm8n4T` | Role: Shuttle | `4lOzKTxQ6X75iRE3` | `qQTMHDrpIch61Q7C` | `ljLwuvSxNPAaYg0h` origin `Actor.tRnGAAILKowm8n4T.Item.4lOzKTxQ6X75iRE3` | Same | Both ADD Constitution +1. Applied twice | A | Delete the actor-level copy | High |
| `drakes-shipyard/a-sf-01-b-wing-starfighter.yml` | `Y0Vf2Yi6pPQjliD1` | Navcomputer | `TctaYtjEvN0qFDoW` | `mt6FdLS2U2Ov4Eun` | `NPCSVwjrOCuIso9Z` origin `Actor.Y0Vf2Yi6pPQjliD1.Item.TctaYtjEvN0qFDoW` | Same | Both mode 4 Astrogation 1. Number does not stack; listed twice | A, idempotent | Delete the actor-level copy | High |

### A2. Makeshift copies that also carry the penalty — reproduced

The item effect has only the +1. The actor-level copy has the +1 and the GM-chosen −1. With both applied, the ship gets +2 and −1.

| Pack and file | Parent | Name | Item ID | Item effect | Actor-level effect | Description | Mechanical comparison | Classification | Recommended action | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `drakes-shipyard/c-wing-corellian-b-wing.yml` | `NYWhs7E7dXECVXNq` | Frame, Makeshift | `1sOlirh6b3nvK7fJ` | `MFmEao36oVlzKQAf` CON +1 | `kzNbnLvrITWzBEAX` CON +1 and DEX −1 | Text says +1 CON and −1 to one other score | Copy is a superset, not an identical mirror | A2 | Move DEX −1 onto the item effect, then delete the copy | High |
| `drakes-shipyard/chirdaki-deathseed.yml` | `OMMoXTxtFhVheNdP` | Thrusters, Makeshift | `Q7TJBeN1RZBQXv4j` | `pGr8kuryyuo2srt5` DEX +1 | `qKuKsRwjZGK9Ajhq` DEX +1 and STR −1 | Text says +1 DEX and −1 to one other score | Copy is a superset | A2 | Move STR −1 onto the item effect, then delete the copy | High |
| `drakes-shipyard/dp20-frigate.yml` | `NRhEjklvSBU3e1e2` | Data Core, Makeshift | `6GVg7Ryiu8tPdaWZ` | `QqpA53Psrw6O9vhK` INT +1 | `UhAwYYHcnBSa8R1x` INT +1 and CHA −1 | Text says +1 INT and −1 to one other score | Copy is a superset | A2 | Move CHA −1 onto the item effect, then delete the copy | High |
| `drakes-shipyard/dp20-frigate.yml` | `NRhEjklvSBU3e1e2` | Sensor Array, Makeshift | `fJEpINHyoeArIR37` | `bxIgXxH8k3VKqoI0` WIS +1 | `N6V0RhFAJSDlDQNM` WIS +1 and CHA −1 | Text says +1 WIS and −1 to one other score | Copy is a superset | A2 | Move CHA −1 onto the item effect, then delete the copy | High |

### A3. Orphan copies from another actor — reproduced

| Pack and file | Parent | Name | Item ID | Item effect | Actor-level effect | Description | Mechanical comparison | Classification | Recommended action | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `drakes-shipyard/baudo-class-star-yacht-modified.yml` | `IbM8uXHEpvvdf0TN` | Quick-Charge Shield | none on this actor | none | `T95ZrMngkvi4muNq` origin `Actor.e5uv8tcM0cFQLI7R.Item.824XlJbDjltEP5Se` | The ship's shield is Directional Shield `RgVtId6joDAZ3F1P`, with its own copy `cnRSHbamONTcZvPn` | Set-adds acid/cold/fire/necrotic resistance and poison/psychic immunity. No numeric stack | A3 orphan | Delete `T95ZrMngkvi4muNq` | High |
| `drakes-shipyard/deepwater-class-light-freighter-legendary.yml` | `NdFAYbYXP78V2jqD` | Directional Shield | none on this actor | none | `uAzLDWw1Or6D04g6` origin `Actor.8X549fFDsnYcpJY7.Item.NvW7TgtOqtqJKqw3` | The ship's shield is Fortress Shield `DXeL8WT4Q0hX8eqL`, with its own copy `ofxGr34fwmg2x2dQ` | Same set-adds. No numeric stack | A3 orphan | Delete `uAzLDWw1Or6D04g6` | High |

Exact duplicate actor-level effects on one actor, same identity and same origin: 0.

### B. Fire-Linked items carrying the Slave Circuit description — reproduced

35 Drake items. The stored text begins "You install a slave circuit in your ship to improve automation." None of these items has an effect, and neither does the compendium Slave Circuit `WosCDOyBpooyizF0`, so the number does not change. The displayed text is the wrong modification.

Compendium texts to copy from, by base name:

- Fire-Linked Mounting `pa1DzHAExLc3Wp4j`
- Fire-Linked Weapon Reinforcement `kOMRqFfo6NbckGTx`
- Fire-Linked Variable Compensator `bG6HBpQFiPH90PWm`
- Fire-Linked Primer `zmwWPfuYfEU43Ofi`

| Pack and file | Parent | Name | Item ID | Item effect | Actor-level effect | Description | Mechanical comparison | Classification | Recommended action | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `drakes-shipyard/a-sf-01-b-wing-starfighter.yml` | `Y0Vf2Yi6pPQjliD1` | Fire-Linked Mounting | `J3KmNbejuZAr8wAo` | none | none | Slave Circuit text | No effect | B | Replace description from Mounting `pa1DzHAExLc3Wp4j` | High |
| same | same | Fire-Linked Mounting | `KW1ayIq86PK4ti4i` | none | none | Slave Circuit text | No effect | B | Same | High |
| same | same | Fire-Linked Variable Compensator | `sszDW04B1NEWAPLw` | none | none | Slave Circuit text | No effect | B | Replace from Compensator `bG6HBpQFiPH90PWm` | High |
| same | same | Fire-Linked Weapon Reinforcement | `qoljxRRMt7nCmqMy` | none | none | Slave Circuit text | No effect | B | Replace from Reinforcement `kOMRqFfo6NbckGTx` | High |
| same | same | Fire-Linked Weapon Reinforcement | `Ed3DOzMHjrfQzvxF` | none | none | Slave Circuit text | No effect | B | Same | High |
| `drakes-shipyard/arc-170-starfighter.yml` | `B5AmMDBTT6TrfW5E` | Fire-Linked Mounting | `oKPeuxmYUEKWhlAO` | none | none | Slave Circuit text | No effect | B | Replace from Mounting | High |
| same | same | Fire-Linked Mounting | `04ElV6rblq2sMal1` | none | none | Slave Circuit text | No effect | B | Same | High |
| same | same | Fire-Linked Mounting | `XbWSHlnUKeUJkCkK` | none | none | Slave Circuit text | No effect | B | Same | High |
| same | same | Fire-Linked Mounting | `6cj0OHWXJOLbBDi7` | none | none | Slave Circuit text | No effect | B | Same | High |
| `drakes-shipyard/c-wing-corellian-b-wing.yml` | `NYWhs7E7dXECVXNq` | Fire-Linked Mounting | `FqfXAZPLTznwe0DK` | none | none | Slave Circuit text | No effect | B | Same | High |
| `drakes-shipyard/chirdaki-deathseed.yml` | `OMMoXTxtFhVheNdP` | Fire-Linked Mounting | `DfMHLnTaKNGjdixz` | none | none | Slave Circuit text | No effect | B | Same | High |
| same | same | Fire-Linked Weapon Reinforcement | `b2XpgYG2Bu31EUSW` | none | none | Slave Circuit text | No effect | B | Replace from Reinforcement | High |
| `drakes-shipyard/delta-7-aethersprite-class-light-interceptor-modified.yml` | `FbzPxDn1FfeRvDym` | Fire-Linked Mounting | `r0McwAYdIUVxf1PQ` | none | none | Slave Circuit text | No effect | B | Replace from Mounting | High |
| same | same | Fire-Linked Weapon Reinforcement | `udiNbsUC3rrRDY9X` | none | none | Slave Circuit text | No effect | B | Replace from Reinforcement | High |
| `drakes-shipyard/dynamic-class-light-freighter.yml` | `gawTKA6kzr7qNnnD` | Fire-Linked Mounting | `59Fljg4T9kub4zTM` | none | none | Slave Circuit text | No effect | B | Replace from Mounting | High |
| same | same | Fire-Linked Weapon Reinforcement | `uEDXTyzevprJvYPp` | none | none | Slave Circuit text | No effect | B | Replace from Reinforcement | High |
| `drakes-shipyard/m12-l-kimogila-heavy-fighter.yml` | `zEXFY5OjrHTSUdjm` | Fire-Linked Variable Compensator | `1ibWjcB06Fq4twdZ` | none | none | Slave Circuit text | No effect | B | Replace from Compensator | High |
| same | same | Fire-Linked Mounting (Note) | `pORZv00i7Hy9SUYi` | none | none | Slave Circuit text | No effect | B | Replace from Mounting | High |
| same | same | Fire-Linked Weapon Reinforcement | `JkBuzQbRASwxDPcu` | none | none | Slave Circuit text | No effect | B | Replace from Reinforcement | High |
| `drakes-shipyard/m22-t-krayt-gunship.yml` | `9pA2rg6Eme3DtR1h` | Fire-Linked Mounting (Note) | `Q8VG8MSEn1e2uvzM` | none | none | Slave Circuit text | No effect | B | Replace from Mounting | High |
| same | same | Fire-Linked Weapon Reinforcement (Note) | `b5pXfF8fqmtbDD1w` | none | none | Slave Circuit text | No effect | B | Replace from Reinforcement | High |
| same | same | Fire-Linked Primer (Note) | `LusgOBYUykS369lc` | none | none | Slave Circuit text | No effect | B | Replace from Primer `zmwWPfuYfEU43Ofi` | High |
| `drakes-shipyard/m4-c-dunelizard-fighter.yml` | `WTLl7aWFzvM6C5TV` | Fire-Linked Mounting (Note) | `38jSmrkPEitYqeVn` | none | none | Slave Circuit text | No effect | B | Replace from Mounting | High |
| `drakes-shipyard/t-65-x-wing-starfighter.yml` | `KIYZmULvhfmiOrC2` | Fire-Linked Mounting | `k2RD7OH0UVRolp39` | none | none | Slave Circuit text | No effect | B | Same | High |
| same | same | Fire-Linked Weapon Reinforcement | `5CXqw6ttS4ECYjW2` | none | none | Slave Circuit text | No effect | B | Replace from Reinforcement | High |
| `drakes-shipyard/tie-d-defender.yml` | `SuqAQa6LsY1hNJnI` | Fire-Linked Mounting (Note) | `hqZpJCVCmphAf9Ur` | none | none | Slave Circuit text | No effect | B | Replace from Mounting | High |
| same | same | Fire-Linked Reinforcement (Note) | `SkPXUdsTKMlnbwnd` | none | none | Slave Circuit text | No effect | B | Replace from Reinforcement | High |
| `drakes-shipyard/tie-in-interceptor.yml` | `ajAHTOE1nFbXxusm` | Fire-Linked Mounting | `mWnMaNkhjiT30VIp` | none | none | Slave Circuit text | No effect | B | Replace from Mounting | High |
| same | same | Fire-Linked Weapon Reinforcement | `YUxMxvLLLSkBmB8c` | none | none | Slave Circuit text | No effect | B | Replace from Reinforcement | High |
| `drakes-shipyard/x-wing-starfighter-advanced.yml` | `1iE0TPVtIaqWPKRH` | Fire-Linked Mounting | `gHZGRDjZUASmn5sJ` | none | none | Slave Circuit text | No effect | B | Same | High |
| same | same | Fire-Linked Primer | `0e09tH1FYjWuEZBf` | none | none | Slave Circuit text | No effect | B | Replace from Primer | High |
| same | same | Fire-Linked Weapon Reinforcement | `bpHEvxt3geISCLKV` | none | none | Slave Circuit text | No effect | B | Replace from Reinforcement | High |
| `drakes-shipyard/yv-929-armed-freighter.yml` | `LY8lY6F9nVqz7Km1` | Fire-Linked Mounting (Burst) | `8LnwtR66Ws5PYqnb` | none | none | Slave Circuit text | No effect | B | Replace from Mounting. The "(Burst)" suffix has no separate compendium item | Medium |
| same | same | Fire-Link Mounting (Particle) | `OGWWpQRS2NuZzCVj` | none | none | Slave Circuit text | No effect | B | Same, "(Particle)" has no separate compendium item | Medium |
| same | same | Fire-Link Reinforcement (Particle) | `JmZTL0CADI4SeUig` | none | none | Slave Circuit text | No effect | B | Replace from Reinforcement. "(Particle)" has no separate compendium item | Medium |

### B2. Tuned Engines on the custom N-1 — needs a decision

| Pack and file | Parent | Name | Item ID | Item effect | Actor-level effect | Description | Mechanical comparison | Classification | Recommended action | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `drakes-shipyard/n-1-naboo-starfighter-custom.yml` | `Ug33oVFGY7Qp3ufC` | Tuned Engines | `V2EZCmDU7Sd6qXmi` | fly +50, mode 2 | none matched in this row | Text is the SLAM action text. Compendium Tuned Engines `Qt0Y1DWiU2ybVirE` is the Boost Engines bonus-action text and has no effect | The ship also has SLAM `SodQqzh3yVc4s1Qp` with the same text and no effect | Mislabel or a second SLAM. Not a confirmed duplicate | Do not edit until someone chooses which item is the SLAM | Medium |

### B3. One renamed drive — low

| Pack and file | Parent | Name | Item ID | Item effect | Actor-level effect | Description | Mechanical comparison | Classification | Recommended action | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `drakes-shipyard/n-1-naboo-starfighter-custom.yml` | `Ug33oVFGY7Qp3ufC` | Sublight Drive, Mark I | `qf6pDveEwnrkmjNQ` | not compared beyond the text | none | Text matches Thrusters, Mk I, not a sublight drive | Not established | Possible mislabel | Leave until a source check | Low |

### C. Compendium packs — not reproduced

- Exact duplicate descriptions exist only inside tiered families: Combat Thrusters Mk I–V (`X6aGTz0DRzG9FoIQ`, `mC2BAe5x7H5l61zm`, `ocyySK2I5s4dXZOd`, `NZjd8PfcGZxLHzEC`, `QdUImuA8VcOCdejd`), Sublight Drive Mk I–V (`SRpx1hrTUFH7MMG0`, `MQ7n6D2MZ8z6vJAA`, `dfrm1Oaz3sut5hZT`, `9QteiCr64GOV5bWd`, `H9YswnFl9Wy2y1Uw`), and Plating, Deflection Mk I `pEXETfuJSUXcnYI7` with Plating, Lightweight Mk I `YIdEIiKTcX3hRvJc`. Grades and prerequisites differ. By design.
- Normalized-only duplicate descriptions beyond those groups: 0.
- Repeated paragraphs inside one description: 0.
- Two effects on one item with the same change: 0, in both compendium packs and Drake.
- The same change twice inside one effect: 0.
- Two items with the same name and different description or effect data: 0 in both compendium packs.

### D. Adaptive Ailerons sign — Drake freshness, not this report

Eight Drake copies store turn `+100`. The item's own text and compendium Adaptive Ailerons `6WjkUMegKn0XeCNz` say the turn speed decreases by 100.

| File | Parent | Item ID |
| --- | --- | --- |
| `akajor-class-shuttle.yml` | `tRnGAAILKowm8n4T` | `n2PyvLKrFdJ29WgP` |
| `delta-7-aethersprite-class-light-interceptor-modified.yml` | `FbzPxDn1FfeRvDym` | `FxogYcbDil0Eig1b` |
| `ef76-nebulon-b-escort-frigate-medical.yml` | `8uUUatfcGjYMSKZr` | `WZP3ZjIGof4CpEBF` |
| `ef76-nebulon-b-escort-frigate.yml` | `MBlMVJlmhIjF9IqH` | `V7tLotxCeARamq1Y` |
| `fang-class.yml` | `uAzqh6bUJ4ZfKcol` | `uqX0yNJkEZ6MAJdD` |
| `gat-12-skipray-blastboat.yml` | `Bgqr4WNQpTzEIepj` | `hQ1wwoqMfU6ZGRZI` |
| `nantex-class-territorial-defense-starfighter.yml` | `bc83jDYGauWHxSjB` | `ZO7Oq680QBKJSZVD` |
| `u-wing-starfighter-support-craft-ut-60d.yml` | `8rxZGWKJJ2XbyhNl` | `go3xpHa8UzNPbZ0b` |

Recorded under Drake freshness. No action in a duplication repair.

## Not treated as defects

- 105 Drake descriptions differ from the same-named compendium item only by "crew member" versus "crewmember", punctuation, or a page reference versus a journal link. Largest: Navcomputer 48, S-Foils 13, Tractor Beam 13, Sensor Dampener 11, Power Backup 9.
- Name scheme only, with matching text: "Mark I" versus "Mk I", "Scanner, Premium" versus "Scanner, Mk I", and the same pattern on reactors, thrusters, plating, data cores, transmitters, and central computers. About 300 items.
- 872 Drake descriptions are older or longer than the current compendium text and match no other compendium description. Largest: Fixed Hardpoint 351, Turret Mounting 55, Flight Computer 45, Comms Package, Premium 40, Storage Compartment 32. Content freshness. A book source is still required. Stays with Drake freshness.
- Only 2 of 1586 Drake modification `flags.core.sourceId` values resolve to a current compendium id. That is a broken link, not a duplicate, and this pass does not create records to repair it.

## Smallest repair scope

Not started. Requires a separate authorization. No world migration.

1. In `packs/_source/drakes-shipyard/`, delete actor-level copies by id when `origin` ends with `Item.<embedded item id>`, that item has a `transfer: true` effect, and the changes match. Keep the item effect. That is the 893. For the four A2 items, add the −1 change to the item effect first. Delete the two A3 orphans `T95ZrMngkvi4muNq` and `uAzLDWw1Or6D04g6`.
2. On the 35 Fire-Linked items, replace `system.description.value` with the compendium text for the base name. Do not create records for "(Burst)" or "(Particle)".
3. With Foundry stopped, `npm run build:db -- drakes-shipyard`.
4. Foundry gate: confirm `CONFIG.ActiveEffect.legacyTransferral === false`. Import one Drake ship fresh. Each ability equals the stored value plus one application. The Effects tab lists one entry per effect.

Ships already in a world keep the copies. dnd5e's own migration will not remove them, because their system version is not older than 3.0.3.

## What this phase did not do

No pack source edit. No new compendium record. No pack rebuild. No world actor edit. No commit. No push.

---

## Addendum — 2026-11-05 — Drake actor-level duplicate repair

### Reason

The Drake actor-level copy repair was authorized and applied to `packs/_source/drakes-shipyard/*.yml`. The original 893 count needed a corrected breakdown before writing.

### Supersedes

The "Not started" status under "Smallest repair scope," and the statement in "What this phase did not do" that no pack source was edited.

That status and that statement are retained above as historical evidence and must not be deleted. Steps 2 through 4 of the smallest repair scope are not superseded.

### Revised decision or behavior

The original scan's 893 required at least one shared change and looked up the origin item id on the current actor without separating clone-source origins. It omitted 32 Lightweight Armor pairs because both `changes` arrays were empty. Re-derived, mutually exclusive counts, keyed by normalized filepath + actor id + actor-level effect id:

- Same-actor-origin duplicates, nonempty changes: 852
- Clone-source-origin duplicates, nonempty changes: 37
- Makeshift supersets: 4
- True foreign-origin orphans: 2
- Inert Lightweight Armor duplicates, empty changes: 32 (31 same-actor, 1 clone-source)
- Total actor-level deletions: 927
- Check: 852 + 37 + 4 = 893, the original scan. The 32 inert pairs and the 2 orphans were outside that 893.

CR90 actor effect `ZtUQ6YtH6HkdJH60` ("Role: Corvette", actor `0S6RxfRRNiswQrya`) was excluded. Its item effect uses mode 0 and the actor copy uses mode 2, so it is not an exact duplicate. One other pair differed only by change priority: N-1 custom `NsuxCmaKIDofAnoV` stores priority null while item effect `qQTMHDrpIch61Q7C` stores 20. Key, mode, and value match, so it stayed in the 852.

`utils/fix-drakes-duplicated-actor-effects.mjs` deleted those 927 actor effects. Originating embedded items and their `transfer: true` effects remain. Forty-four ships whose actor effect list became empty now store `effects: []` instead of a null `effects:` key. All 87 files still use CRLF.

Makeshift penalties were appended once to the retained item effects, and the actor copies were removed:

| File | Actor effect removed | Item effect | Bonus kept | Penalty added |
| --- | --- | --- | --- | --- |
| `c-wing-corellian-b-wing.yml` | `kzNbnLvrITWzBEAX` | `MFmEao36oVlzKQAf` | Constitution +1 | Dexterity −1 |
| `chirdaki-deathseed.yml` | `qKuKsRwjZGK9Ajhq` | `pGr8kuryyuo2srt5` | Dexterity +1 | Strength −1 |
| `dp20-frigate.yml` | `UhAwYYHcnBSa8R1x` | `QqpA53Psrw6O9vhK` | Intelligence +1 | Charisma −1 |
| `dp20-frigate.yml` | `N6V0RhFAJSDlDQNM` | `bxIgXxH8k3VKqoI0` | Wisdom +1 | Charisma −1 |

Orphan actor effects removed, and only those ids: `T95ZrMngkvi4muNq` on `baudo-class-star-yacht-modified.yml` actor `IbM8uXHEpvvdf0TN`, and `uAzLDWw1Or6D04g6` on `deepwater-class-light-freighter-legendary.yml` actor `NdFAYbYXP78V2jqD`. The same ids on the source yacht and source Deepwater were ordinary duplicates and were removed there as well. The source ships' shield items remain.

Actor effects removed, by file (`before -> after`):

- `a-sf-01-b-wing-starfighter.yml` 13 -> 0
- `a-z-z-3-light-freighter.yml` 8 -> 0
- `aeg-77-vigo-gunship.yml` 19 -> 0
- `aiat-i-gunship.yml` 8 -> 0
- `akajor-class-shuttle.yml` 6 -> 0
- `amphibious-fighter.yml` 7 -> 0
- `arc-170-starfighter.yml` 13 -> 0
- `arquitens-class-command-cruiser.yml` 14 -> 0
- `arquitens-class-light-cruiser.yml` 12 -> 0
- `baleen-class-heavy-freighter.yml` 9 -> 0
- `baradium-missile.yml` 6 -> 0
- `barloz-class-medium-freighter.yml` 9 -> 0
- `basilisk-space-droid.yml` 7 -> 0
- `baudo-class-star-yacht-modified.yml` 18 -> 0
- `baudo-class-star-yacht.yml` 7 -> 0
- `c-wing-corellian-b-wing.yml` 9 -> 0
- `chirdaki-deathseed.yml` 8 -> 0
- `clutch-tri-fighter.yml` 7 -> 0
- `cr90-corvette.yml` 9 -> 1
- `crusader-xx-777-prototype-droid-frigate.yml` 20 -> 0
- `deepwater-class-light-freighter-legendary.yml` 17 -> 0
- `deepwater-class-light-freighter.yml` 12 -> 0
- `delta-7-aethersprite-class-light-interceptor-modified.yml` 13 -> 0
- `delta-7-aethersprite-class-light-interceptor.yml` 8 -> 0
- `dp20-frigate.yml` 14 -> 0
- `droid-tri-fighter.yml` 7 -> 0
- `dynamic-class-light-freighter.yml` 6 -> 0
- `ef76-nebulon-b-escort-frigate-medical.yml` 10 -> 1
- `ef76-nebulon-b-escort-frigate.yml` 10 -> 1
- `escape-pod.yml` 7 -> 2
- `eta-2-actis-class-interceptor.yml` 9 -> 2
- `executor-i-class-star-dreadnought.yml` 44 -> 0
- `fang-class.yml` 11 -> 2
- `gand-starfighter.yml` 9 -> 1
- `gat-12-skipray-blastboat.yml` 13 -> 1
- `hmp-droid-gunship.yml` 12 -> 1
- `horizon-class-star-yacht-legendary.yml` 20 -> 0
- `imperial-i-class-star-destroyer.yml` 18 -> 0
- `k-wing-btl-s8.yml` 9 -> 1
- `m12-l-kimogila-heavy-fighter.yml` 12 -> 1
- `m22-t-krayt-gunship.yml` 13 -> 1
- `m3-a-scyk-fighter.yml` 7 -> 1
- `m3-a-scyk-heavy-fighter.yml` 8 -> 1
- `m3-a-scyk-tie-killer.yml` 14 -> 1
- `m4-c-dunelizard-fighter.yml` 10 -> 1
- `n-1-naboo-starfighter-custom.yml` 14 -> 0
- `n-1-naboo-starfighter.yml` 14 -> 1
- `nantex-class-territorial-defense-starfighter.yml` 8 -> 1
- `probe-mate-hyperspace-pod.yml` 6 -> 0
- `rz-1-a-wing-interceptor.yml` 11 -> 0
- `st-70-razor-crest-assault-ship-legendary.yml` 18 -> 0
- `st-70-razor-crest-assault-ship.yml` 12 -> 0
- `starviper-class-attack-platform-prototype.yml` 18 -> 1
- `starviper-class-attack-platform.yml` 11 -> 1
- `starviper-mk-ii.yml` 13 -> 1
- `t-65-x-wing-starfighter.yml` 10 -> 0
- `tie-advanced-x1.yml` 15 -> 1
- `tie-d-defender.yml` 17 -> 1
- `tie-hu-hunter-multi-role-starfighter.yml` 12 -> 1
- `tie-in-interceptor.yml` 9 -> 1
- `tie-ln-starfighter.yml` 7 -> 0
- `tie-sa-bomber-mine-layer.yml` 7 -> 1
- `tie-sa-bomber-missile-boat.yml` 7 -> 1
- `tie-sa-bomber.yml` 7 -> 1
- `tye-wing.yml` 5 -> 0
- `u-wing-starfighter-support-craft-ut-60d.yml` 12 -> 1
- `v-wing-starfighter-alpha-3-nimbus-class.yml` 9 -> 1
- `vcx-100-light-freighter-modified.yml` 21 -> 0
- `vcx-100-light-freighter.yml` 10 -> 0
- `vcx-series-auxiliary-starfighter.yml` 6 -> 0
- `vt-49-decimator.yml` 15 -> 1
- `vulture-droid-cis.yml` 6 -> 1
- `wander-class-jump-freighter.yml` 8 -> 1
- `wayfarer-class-medium-transport.yml` 12 -> 1
- `x-70b-phantom-class-prototype.yml` 25 -> 1
- `x-ceptor.yml` 5 -> 0
- `x-tie-fighter.yml` 6 -> 0
- `x-wing-starfighter-advanced.yml` 13 -> 1
- `y-tie-fighter.yml` 5 -> 0
- `y-wing-starfighter-btl-b-s3.yml` 12 -> 1
- `yt-1300-heavily-modified.yml` 22 -> 1
- `yt-1300-modified.yml` 12 -> 1
- `yt-1300f-light-freighter.yml` 7 -> 0
- `yv-929-armed-freighter.yml` 7 -> 1
- `z-95-headhunter.yml` 6 -> 1
- `z-ceptor.yml` 5 -> 1
- `z-tie-fighter.yml` 6 -> 1

Sum of removals: 927. Actor effects remaining in the pack: 46, including CR90 `ZtUQ6YtH6HkdJH60`.

Offline verification on 2026-11-05: pre-repair dry run, live run ("Done. 87 files written. Post-repair state confirmed."), and a second dry run that exited 0 with zero candidates and no writes. `node utils/test-starship-hull-shield-dice-tier.mjs` passed 27. `node utils/test-starship-equipment-regen-field.mjs` passed 7. `git diff --numstat` for the Drake YAML is 60 insertions and 38721 deletions across 87 files. Basilisk actor `7X4txvq9CcL2MPdL` no longer has an actor-level ability change; Tiny Starship item `b41hV0wp9ImoJ02O` effect `5BCYRjiFKUZY8ke9` still has Dexterity +4 and Constitution −4. VCX-100 Modified actor `474155zgDsAVDg5N` has no remaining actor effects and still has its embedded items.

Not done: pack rebuild, Foundry launch, world migration, commit, and push. Ships already in a world still have the copies. Fire-Linked descriptions, Adaptive Ailerons, Tuned Engines, and Sublight Drive text were not edited.

### Implementation impact

`utils/fix-drakes-duplicated-actor-effects.mjs` and `packs/_source/drakes-shipyard/*.yml`. No compendium pack other than Drake source. No world actors.

### Validation impact

The source repair is applied. The Foundry gate in step 4 above is retained and is not passed. `npm run build:db -- drakes-shipyard` has not been run.

### Status

Source repair applied. Pack rebuild and Foundry gate pending.

---

## Addendum — 2026-11-05 — Drake's Shipyard pack rebuilt

### Reason

Foundry was stopped, so the rebuilt source could be compiled into the LevelDB pack.

### Supersedes

The status line above that says the pack rebuild is pending, and the validation note that `npm run build:db -- drakes-shipyard` has not been run.

Those lines are retained above as historical evidence and must not be deleted. The Foundry import gate is not superseded.

### Revised decision or behavior

`npm run build:db -- drakes-shipyard` exited 0. It packed 87 actors, including CR90 `0S6RxfRRNiswQrya`, and removed stale actor-effect keys from the database, including C-wing `kzNbnLvrITWzBEAX`. YAML source was not rewritten by the pack step.

### Validation impact

The Foundry gate is still open: import one fresh Drake ship and confirm each ability is stored once and the Effects tab lists one entry per effect. World actors were not migrated.

### Status

Pack rebuilt. Foundry gate pending. No commit. No push.

---

## Addendum — 2026-11-05 — Duplicate actor effects closed

### Reason

The user reported that the fresh-import Foundry test passed.

### Supersedes

The status line above that says the Foundry gate is pending, and the validation note that the fresh-import gate is still open.

Those lines are retained above as historical evidence and must not be deleted.

### Revised decision or behavior

The duplicated actor-level effect issue is closed for Drake source and for a fresh import. The user confirmed the Foundry test passed on 2026-11-05: a newly imported Drake ship applies each of these bonuses once.

Existing world actors were not cleaned. Older imports still contain the duplicate actor effects. Removing them requires re-importing the ship or a separately authorized migration.

Still open, and separate from this closeout: the 35 Fire-Linked descriptions, Adaptive Ailerons turn `+100`, Tuned Engines text, and Sublight Drive text.

### Validation impact

- Original result: the Foundry gate was pending after the pack rebuild.
- User result: PASS, 2026-11-05. The user reported that the fresh-import test passed.
- World actors: not modified.

### Status

Closed for the duplicate actor-level effects. Fresh import passed. World actors unchanged. Fire-Linked, Adaptive Ailerons, Tuned Engines, and Sublight Drive remain open.

---

## Addendum — 2026-11-05 — Drake text repairs

### Reason

The four findings left open above were handled as separate repairs. Three were edited. Sublight Drive was not.

### Supersedes

The status line above that leaves Fire-Linked, Adaptive Ailerons, Tuned Engines, and Sublight Drive open together.

That line is retained above as historical evidence and must not be deleted.

### Revised decision or behavior

Tuned Engines on custom N-1 `V2EZCmDU7Sd6qXmi` now uses the description from compendium `Qt0Y1DWiU2ybVirE`. Effect `aox9hA3SJo66l6cy` (fly +50) was removed. No actor-level copy remained. SLAM `SodQqzh3yVc4s1Qp` was not modified.

The 35 Fire-Linked items in section B had only their Slave Circuit description fields replaced from the current base-name compendium items. Names, including the abbreviated and suffixed ones, were kept. No effects were added or removed.

The eight Adaptive Ailerons items in section D had only `system.attributes.movement.turn` changed from `+100` to `-100`. AC +1 and the Dexterity save +1 were unchanged. No actor-level copy of those items remained, so none were edited.

Custom N-1 `qf6pDveEwnrkmjNQ` is an unresolved mixed-identity record, left unchanged pending an authoritative historical source. It is not a confirmed Sublight Drive. Its name and fly +50 resemble Sublight Drive Mk I `SRpx1hrTUFH7MMG0`. Its description resembles Thrusters Mk I. Effect id `5NT4IF3E7iHlj8bR` originates from Thrusters Mk I, whose compendium change is Dexterity +1. Origin id `ySGqfdHlfEjNJRqm` is not in current source.

World actors were not migrated. The pack was not rebuilt.

### Implementation impact

`utils/fix-drakes-text-repairs.mjs`, run separately as `tuned-engines`, `fire-linked`, and `ailerons`. Drake YAML for the custom N-1, the 14 Fire-Linked files, and the eight Adaptive Ailerons files.

### Validation impact

Each repair had a passing dry run, a live write, a reparse, and a second dry run that found the repaired state and wrote nothing. The Sublight Drive item was compared and left unchanged. Foundry was not launched.

### Status

Tuned Engines, Fire-Linked descriptions, and Adaptive Ailerons are repaired in source. Sublight Drive remains unresolved and unchanged. Pack rebuild and Foundry check are not done. No commit. No push.

---

## Addendum — 2026-11-05 — Drake text repairs packed

### Reason

The repaired Drake source was compiled into the LevelDB pack.

### Supersedes

The status line above that says the pack rebuild and Foundry check are not done.

That line is retained above as historical evidence and must not be deleted. The Foundry import check is not superseded.

### Revised decision or behavior

`npm run build:db -- drakes-shipyard` exited 0 and packed 87 actors, including custom N-1 `Ug33oVFGY7Qp3ufC`. The pack step removed the old Tuned Engines effect `!actors.items.effects!Ug33oVFGY7Qp3ufC.V2EZCmDU7Sd6qXmi.aox9hA3SJo66l6cy`. YAML source was not rewritten. Sublight Drive `qf6pDveEwnrkmjNQ` remains an unresolved mixed-identity record and was not edited. World actors were not migrated.

### Validation impact

Foundry was not launched. A fresh import is still required to confirm Tuned Engines, one Fire-Linked item, and one Adaptive Ailerons item.

### Status

Pack rebuilt. Foundry import check pending. No commit. No push.

---

## Addendum — 2026-11-05 — Tuned Engines, Fire-Linked, and Adaptive Ailerons closed

### Reason

The user reported that the fresh-import Foundry checks passed.

### Supersedes

The status line above that says the Foundry import check is pending.

That line is retained above as historical evidence and must not be deleted.

### Revised decision or behavior

Complete. The user confirmed on 2026-11-05 that the fresh-import checks passed for Tuned Engines, the Fire-Linked descriptions, and Adaptive Ailerons.

Sublight Drive `qf6pDveEwnrkmjNQ` stays open as an unresolved mixed-identity record. It was not edited. World actors were not migrated.

### Validation impact

- Original result: the Foundry import check was pending after the pack rebuild.
- User result: PASS, 2026-11-05, for Tuned Engines, Fire-Linked descriptions, and Adaptive Ailerons.
- Sublight Drive: unchanged and unresolved.

### Status

Closed for Tuned Engines, Fire-Linked descriptions, and Adaptive Ailerons. Sublight Drive remains open. World actors unchanged.
