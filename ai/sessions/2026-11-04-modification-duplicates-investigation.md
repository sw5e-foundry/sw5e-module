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

---

## Addendum — 2026-11-05 — Remaining actor effects and Sublight identity

### Reason

The duplicate-effect cleanup left 46 actor-level effects. The custom N-1 Sublight Drive record also needed a separate identity audit. This pass is read-only.

### Supersedes

Nothing in the closed Tuned Engines, Fire-Linked, or Adaptive Ailerons findings. Those remain closed. This addendum adds the remaining-effect inventory and the Sublight outcome.

### Recount

Independent recount of actor-level effects in `packs/_source/drakes-shipyard`: 46. No added, removed, or changed records against the expected population. All 46 have `transfer: false`, `disabled: false`, empty statuses, and empty normalized duration. Actor flags are only `core.statusId: ""` unless noted.

Origin shapes:

- 1 proper `Actor.<id>.Item.<id>`: CR90.
- 3 `Compendium.world.drakes-shipyard.<actor>.Item.<item>`: Directional Shield.
- 42 `Actor.<id>` with no item segment.

`msrxS22tzCwEup0n` is not an actor id in this pack.

### Classification counts

| Class | Count |
| --- | ---: |
| Required compatibility effect | 1 |
| Intentional ship-specific effect | 0 |
| Recoverable item effect | 0 |
| Orphaned effect | 0 |
| Duplicate with nonstandard origin | 3 |
| Unresolved | 42 |

### Required compatibility effect

CR90 Corvette `0S6RxfRRNiswQrya`, effect `ZtUQ6YtH6HkdJH60` "Role: Corvette". Origin `Actor.0S6RxfRRNiswQrya.Item.QV7xhcdNoH8halzL`. Changes, both mode 2 ADD, priority null: Strength +1, Dexterity +1.

Embedded item `QV7xhcdNoH8halzL` effect `qQTMHDrpIch61Q7C` changes the same two fields with mode 0 and priority 1. Foundry mode 0 is CUSTOM. Stock Active Effect application does not add a CUSTOM value, and the local dnd5e 5.2.5 extract has no ability-score handler for mode 0. Mode 2 is ADD. The item description does not support these ability bonuses. It describes a fixed hardpoint and a weapon-damage bonus.

Current deletion impact: yes. Removing the actor effect removes the only applying Strength and Dexterity bonus. Probable canonical owner: the Role item, after its effect is changed from mode 0 to mode 2. Evidence: same item, same fields and values, different mode. The description does not confirm that those ability bonuses are intended. Runtime test required: yes, one fresh import, to confirm the mode 0 changes do not alter the scores. Smallest later fix, not performed: if the +1 scores should remain, change `qQTMHDrpIch61Q7C` from mode 0 to mode 2, then remove `ZtUQ6YtH6HkdJH60`.

### Duplicate with nonstandard origin

Each local Directional Shield item has transfer-true effect `8DZ792d8qqBQeXNh`. That effect matches the actor effect on all six changes (mode 2, priority 20): shield damage resistance acid, cold, fire, and necrotic; shield damage immunity poison and psychic. Statuses and duration are empty on both sides. The actor effect adds no further change. `transfer` differs only because the actor copy is false and the item effect is true.

| File | Actor | Actor effect | Local item |
| --- | --- | --- | --- |
| `escape-pod.yml` | Escape Pod `2YtJawA2uITnhq6V` | `b6Faqbwd2sLA9Hgc` | `sQFl4VavPGVYKhXD` |
| `eta-2-actis-class-interceptor.yml` | ETA-2 `kxOYt1pVQc0rh1OP` | `i98DfifxpUQ6S1qw` | `4u8uwxj0M1atqRwf` |
| `fang-class.yml` | Fang-class `uAzqh6bUJ4ZfKcol` | `Hk5jIpbt4L79lBIp` | `4m9YNf4FAE0bXjIF` |

Current deletion impact: no calculated change if the item effect applies. Probable canonical owner: the embedded Directional Shield item. Evidence: exact change match and the origin item id is installed. Runtime test required: yes, before deletion, because the `Compendium.world` origin was outside the prior cleanup and may still change how Foundry lists the effect.

### Unresolved actor-only effects

These 42 effects have no matching embedded item. Absence of a matching item is not treated as intent. No size, role, or modification effect on the same ship carries the uncovered changes below. Covered changes are already applied by some other transfer-true effect, so only the uncovered count would change the ship today. Values are mode 2 ADD unless marked mode 5 OVERRIDE. Origin actor `msrxS22tzCwEup0n` is foreign. Other origins name the current actor, except the TIE/D Defender row, whose origin actor is the TIE interceptor `ajAHTOE1nFbXxusm`.

Probable canonical owner for all 42: unknown. Evidence for ownership: the effect is the only applying copy of its uncovered changes, and the origin names an actor rather than an item. Runtime test required: not to prove that deletion would change numbers; yes before choosing an advancement, role, size, or modification to receive them.

| File | Actor effect | Name | Origin actor | Uncovered | Changes |
| --- | --- | --- | --- | --- | --- |
| `ef76-nebulon-b-escort-frigate-medical.yml` | `QVV8J6QkJwUgK9tV` | ASI | `msrxS22tzCwEup0n` | 7/8 | Str 3, Dex 1, Con 0, Int 0, Wis 2, Cha 0, fly 50, turn -150 |
| `ef76-nebulon-b-escort-frigate.yml` | `pqOqJLrepLJt7O0V` | ASI | `msrxS22tzCwEup0n` | 7/8 | Str 3, Dex 0, Con 0, Int 0, Wis 1, Cha 0, fly 50, turn -150 |
| `escape-pod.yml` | `CvX6D1B00rvifhxM` | ASI | `msrxS22tzCwEup0n` | 6/6 | all six abilities 0 |
| `eta-2-actis-class-interceptor.yml` | `UvdO1iEhKf8g7CfW` | ASI | `msrxS22tzCwEup0n` | 5/6 | Str 2, Dex 1, Con 0, Int 0, Wis 2, Cha 0 |
| `fang-class.yml` | `mLJNAvcynpjfy8NT` | ASI | `msrxS22tzCwEup0n` | 5/7 | Str 1, Dex 2, Con 1, Int 0, Wis 1, Cha 0, turn -100 |
| `gand-starfighter.yml` | `YCeLyX8dFXqxKI2q` | ASI | `msrxS22tzCwEup0n` | 5/6 | Str 0, Dex 1, Con 1, Int 0, Wis 0, Cha 0 |
| `gat-12-skipray-blastboat.yml` | `Ld1zNnraoTkSCSUo` | ASI | `msrxS22tzCwEup0n` | 6/6 | Str 4, Dex 0, Con 3, Int 0, Wis 0, Cha 0 |
| `hmp-droid-gunship.yml` | `4WAAiMXDrFy2MipW` | ASI | `msrxS22tzCwEup0n` | 7/7 | Str 0, Dex 0, Con 4, Int 0, Wis 0, Cha 0, turn 400 mode 5 |
| `k-wing-btl-s8.yml` | `OAfvUZHcxgRUm7NF` | ASI | `msrxS22tzCwEup0n` | 6/6 | Str 2, Dex 0, Con 4, Int 0, Wis 0, Cha 0 |
| `m12-l-kimogila-heavy-fighter.yml` | `TJIYFIzmVExqVc0D` | ASI | `msrxS22tzCwEup0n` | 6/6 | Str 0, Dex 0, Con 2, Int 0, Wis 2, Cha 0 |
| `m22-t-krayt-gunship.yml` | `sdBpRmF78iiOot4Z` | ASI | `msrxS22tzCwEup0n` | 5/6 | Str 1, Dex 0, Con 4, Int 0, Wis 2, Cha 0 |
| `m3-a-scyk-fighter.yml` | `3oOxhRCrZjoHwv4G` | ASI | `msrxS22tzCwEup0n` | 6/6 | all six abilities 0 |
| `m3-a-scyk-heavy-fighter.yml` | `LEc3T7KOFg6KKkPp` | ASI | `msrxS22tzCwEup0n` | 6/6 | Str 2, Dex 0, Con 1, Int 0, Wis 0, Cha 0 |
| `m3-a-scyk-tie-killer.yml` | `4Hcr1AmMqhvU7Llh` | ASI | `msrxS22tzCwEup0n` | 5/6 | Str 3, Dex 2, Con 0, Int 0, Wis 1, Cha 0 |
| `m4-c-dunelizard-fighter.yml` | `2znuu4saWRIWKilI` | ASI | `msrxS22tzCwEup0n` | 6/6 | Str 0, Dex 0, Con 2, Int 0, Wis 0, Cha 0 |
| `n-1-naboo-starfighter.yml` | `RcQDyiiABgOStw5q` | ASI | `msrxS22tzCwEup0n` | 5/6 | Str 0, Dex 2, Con 0, Int 0, Wis 0, Cha 0 |
| `nantex-class-territorial-defense-starfighter.yml` | `VC9CbCEjCmhPlFRI` | ASI | `msrxS22tzCwEup0n` | 4/6 | Str 1, Dex 2, Con 0, Int 0, Wis 0, Cha 0 |
| `starviper-class-attack-platform-prototype.yml` | `0O7HKNqQOEd4OVW8` | ASI | `msrxS22tzCwEup0n` | 5/6 | Str 0, Dex 2, Con 1, Int 0, Wis 4, Cha 2 |
| `starviper-class-attack-platform.yml` | `onJzcJxxUix0rH3I` | ASI | `msrxS22tzCwEup0n` | 4/6 | Str 1, Dex 1, Con 1, Int 0, Wis 2, Cha 0 |
| `starviper-mk-ii.yml` | `uPZW3eWBxhBUUU5G` | ASI | `msrxS22tzCwEup0n` | 4/6 | Str 0, Dex 1, Con 1, Int 0, Wis 2, Cha 0 |
| `tie-advanced-x1.yml` | `mvIuP35d26OjGvbc` | ASI | `msrxS22tzCwEup0n` | 4/6 | Str 1, Dex 1, Con 0, Int 0, Wis 2, Cha 0 |
| `tie-d-defender.yml` | `GKjlvglk1KRlr5LS` | ASI | `ajAHTOE1nFbXxusm` | 6/6 | Str 2, Dex 3, Con 2, Int 0, Wis 2, Cha 1 |
| `tie-hu-hunter-multi-role-starfighter.yml` | `N4VQQILD4SFt4gR6` | ASI | current | 2/3 | Str 2, Dex 2, Wis 1 |
| `tie-in-interceptor.yml` | `XWEx7IMdFqkYzSni` | ASI | current | 1/3 | Dex 2, Str 1, Wis 1 |
| `tie-sa-bomber-mine-layer.yml` | `kBZ53WHwGwxDHFsy` | ASI | current | 1/2 | Dex 1, Con 1 |
| `tie-sa-bomber-missile-boat.yml` | `PqvYnyKJE77WZZHt` | ASI | current | 1/2 | Dex 1, Con 1 |
| `tie-sa-bomber.yml` | `UTRYA2jRi2cgpMnZ` | ASI | current | 1/2 | Dex 1, Con 1 |
| `u-wing-starfighter-support-craft-ut-60d.yml` | `UzKX8O1hrX2fUG6a` | ASI | current | 2/2 | Con 2, Wis 2 |
| `v-wing-starfighter-alpha-3-nimbus-class.yml` | `rpFFacilSwiEErzy` | AIS | current | 2/2 | Dex 1, Con 1 |
| `vt-49-decimator.yml` | `XLUqHYCqcIgHhklz` | ASI | current | 5/5 | Con 1, Int 2, Wis 2, fly 300 mode 5, turn 200 mode 5 |
| `vulture-droid-cis.yml` | `XoPU25PAVecBJZ1K` | ASI | current | 4/4 | Str 1, Dex 5, Con 2, Wis 1 |
| `wander-class-jump-freighter.yml` | `Rp7gk0y314hWBN4f` | ASI | current | 2/2 | Str 1, Cha 1 |
| `wayfarer-class-medium-transport.yml` | `Kntbe9tGWmmm54Lj` | ASI | current | 3/4 | Str 3, Dex -1, Con 1, turn 50 |
| `x-70b-phantom-class-prototype.yml` | `8Rr449jpbSMrmmId` | ASI | current | 3/3 | Str 3, Con 1, Wis 3 |
| `x-wing-starfighter-advanced.yml` | `L8dxPRiNxzKWZrgW` | ASI | current | 4/5 | Str 2, Dex 2, Con 1, Int -2, Wis 4 |
| `y-wing-starfighter-btl-b-s3.yml` | `ABAZbMpjPFeY2lDX` | ASI | current | 2/3 | Str 2, Dex 1, Wis 1 |
| `yt-1300-heavily-modified.yml` | `qSl5ltd7udAKjzBX` | ASI | current | 4/8 | fly 400 mode 5, turn 150 mode 5, Str 2, Dex 1, Con -1, Int 1, Wis 1, Cha 1 |
| `yt-1300-modified.yml` | `tstPz7sF3O5hbLsi` | ASI | current | 1/3 | Str 1, Con 1, Wis 2 |
| `yv-929-armed-freighter.yml` | `OpwEjg658THj3164` | Modifier | current | 2/2 | fly 350 mode 5, turn 300 mode 5 |
| `z-95-headhunter.yml` | `lHtPlYquq2npPWPr` | Ability Modifiers | current | 2/2 | Str 1, Wis 2 |
| `z-ceptor.yml` | `5g1eZGdBgFX28yTE` | Modifier | current | 2/2 | Dex 5, Con 5 |
| `z-tie-fighter.yml` | `aH2aU4GGZ8RGquth` | Role | current | 1/1 | Str 1 |

### Actor-effect conclusion

- Safe source-only deletions: none in this pass. The three Directional Shield actor effects are the only source-supported deletion candidates, and only after the Foundry listing test.
- Mechanics that must move onto an item first: none identified. The 42 unresolved effects must stay where they are until an owner is established.
- Effects that must remain: CR90 `ZtUQ6YtH6HkdJH60`, and all 42 unresolved effects.
- Foundry runtime verification: the three Directional Shield ships, and one CR90 import for the mode 0 check.
- Smallest later repair supported here: after that shield test, delete only `b6Faqbwd2sLA9Hgc`, `i98DfifxpUQ6S1qw`, and `Hk5jIpbt4L79lBIp`. Leave the CR90 actor effect until a separate decision accepts changing `qQTMHDrpIch61Q7C` from mode 0 to mode 2. Do not delete ASI rows.

### Sublight Drive and Thrusters

This audit is separate from the 46. No Sublight or Thrusters actor-level effect remains in that set. No item was edited.

Current compendium records agree with themselves. Sublight Drive Mk I–V (`SRpx1hrTUFH7MMG0`, `MQ7n6D2MZ8z6vJAA`, `dfrm1Oaz3sut5hZT`, `9QteiCr64GOV5bWd`, `H9YswnFl9Wy2y1Uw`) each grant fly +50 and describe a flying-speed increase. Sublight Drive Makeshift `IJm40Qtgjgq4Hs8L` also grants turn +50. Thrusters Mk I–IV grant Dexterity +1. Thrusters Mk V grants Dexterity +2. Thrusters Makeshift grants Dexterity +1. Effect id `5NT4IF3E7iHlj8bR` is the Thrusters Mk I effect on item `ApKSV7OFLKFAMyMh`.

Drake Thrusters Mark I and Mark II copies, 28 items, use the Dexterity change that matches the same grade and the Thrusters description. Their `flags.core.sourceId` values, including `ySGqfdHlfEjNJRqm`, do not resolve to a current compendium document id. Those copies are stale source id only. Name, description, and mechanics agree. No repair is recommended for them in this pass.

Custom N-1 `Ug33oVFGY7Qp3ufC` item `qf6pDveEwnrkmjNQ` is the only Drake Sublight Drive item. Its signals do not agree:

- Name: Sublight Drive, Mark I.
- Mechanic: fly +50, mode 2, which matches Sublight Drive Mk I.
- Description: the Thrusters Mk I Dexterity text. The legacy description agrees with `system.description`.
- Effect id: `5NT4IF3E7iHlj8bR`, the Thrusters Mk I effect id, whose compendium change is Dexterity +1.
- Source id: `Compendium.sw5e-module.starshipmodifications.ySGqfdHlfEjNJRqm`, the same unresolved legacy id used by the aligned Thrusters Mark I copies.
- Tuned Engines repair: unrelated. That item is `V2EZCmDU7Sd6qXmi`.

History, read-only: `git log --all --follow` on the custom N-1 file, and `-S` searches for the item id, effect id, source id, "Sublight Drive, Mark I", and "Thrusters, Mk I". The item exists in `124dca632` ("Add packs"), before YAML conversion. At that commit it was already named Sublight Drive, Mark I, already used the Thrusters description, already used effect `5NT4IF3E7iHlj8bR`, and its change was `system.attributes.movement.space` +50, mode 2. The source id was `Compendium.sw5e.starshipmodifications.ySGqfdHlfEjNJRqm`. In that same commit, Thrusters Mk I `ApKSV7OFLKFAMyMh` has Dexterity +1, and that legacy id appears as an effect origin on the old Thrusters file, not as a document that still exists. `7f7ecc85b` still has `movement.space`. `fb63553d6` renames that key to `movement.fly` and keeps +50. Later commits, including the duplicate-effect cleanup and the Tuned Engines repair, do not create the name and description split.

The earliest known mixed state is the initial pack import. YAML conversion preserved the older defect and renamed the movement key. No commit in this repository is the origin of the mismatch.

Outcome D. History remains mixed. Keep `qf6pDveEwnrkmjNQ` unchanged. Do not standardize it from current compendium data. The functional resemblance to Sublight Drive Mk I is an inference, not a repair authorization.

### Status

Actor-effect inventory recorded. Three shield actor effects are duplicate candidates pending a Foundry listing test. Forty-two actor-only effects remain unresolved and must stay. CR90 remains a required compatibility effect. Sublight Drive remains outcome D, unresolved, and unedited. No source edit, pack rebuild, world migration, commit, or push in this pass.

---

## Addendum — 2026-11-05 — Directional Shield copies removed; parallel research integrated

### Reason

The three Directional Shield actor-level duplicates were removed in source. Read-only research on the 42 actor-only effects, the CR90 ability bonuses, and the custom N-1 Sublight Drive finished in separate reports and is recorded here once.

### Supersedes

The sentence above that leaves the three Directional Shield actor effects as deletion candidates pending a Foundry listing test, and the later sentence that says that deletion is not yet authorized.

Those sentences are retained above as historical evidence and must not be deleted. The CR90 mode-0-to-mode-2 suggestion above is also retained. The research below does not adopt it.

### Revised decision or behavior

`utils/fix-drakes-directional-shield-duplicates.mjs` removed only these actor effects:

- Escape Pod `2YtJawA2uITnhq6V`: `b6Faqbwd2sLA9Hgc`
- ETA-2 `kxOYt1pVQc0rh1OP`: `i98DfifxpUQ6S1qw`
- Fang `uAzqh6bUJ4ZfKcol`: `Hk5jIpbt4L79lBIp`

Retained Directional Shield items `sQFl4VavPGVYKhXD`, `4u8uwxj0M1atqRwf`, and `4m9YNf4FAE0bXjIF`, each with transfer-true effect `8DZ792d8qqBQeXNh`. Preflight matched all six resistance and immunity changes. The only duration difference was actor `startTime` 0 versus item `startTime` null. Post-repair dry run exited 0 and wrote nothing. Each ship diff is 0 insertions and 59 deletions. Each ship still has its ASI effect.

The 42 actor-only effects remain. No embedded item was proven to own any of them. Deleting 39 would change a prepared ability score or derived Turn. Escape Pod `CvX6D1B00rvifhxM` and M3-A Scyk Fighter `3oOxhRCrZjoHwv4G` are all zeros. YV-929 `OpwEjg658THj3164` is a mode 5 fly and turn override that current starship preparation does not publish. They stay unresolved.

CR90 `ZtUQ6YtH6HkdJH60` remains. Strength +1 and Dexterity +1 match the tier-0 Corvette role benefit, not the tier-2 specialization `QV7xhcdNoH8halzL`. Changing item effect `qQTMHDrpIch61Q7C` from mode 0 to mode 2 would attach that role bonus to the wrong feature. Do not make that change.

Custom N-1 `qf6pDveEwnrkmjNQ` remains outcome D. The mixed name, Thrusters description, Thrusters effect id, and speed bonus were already present in `124dca632`. No edit.

World actors were not migrated. The pack was not rebuilt. Foundry was not launched.

### Validation impact

Post-repair dry run passed. Hull and shield tests passed 27. Equipment regen tests passed 7. Actor-level effects remaining: 43, of which 42 are actor-only and 1 is CR90.

### Status

Directional Shield actor copies removed in source. Pack rebuild and fresh-import check pending. Forty-two actor-only effects unresolved. CR90 unchanged. Sublight Drive remains outcome D. No commit. No push.

---

## Addendum — 2026-11-05 — Directional Shield pack rebuilt

### Reason

Foundry source for the three removed Directional Shield actor effects was compiled into the LevelDB pack.

### Supersedes

The status line above that says the pack rebuild and fresh-import check are pending.

That line is retained above as historical evidence and must not be deleted. The fresh-import check is not superseded.

### Revised decision or behavior

`npm run build:db -- drakes-shipyard` exited 0 and packed 87 actors. The pack removed `!actors.effects!2YtJawA2uITnhq6V.b6Faqbwd2sLA9Hgc`, `!actors.effects!kxOYt1pVQc0rh1OP.i98DfifxpUQ6S1qw`, and `!actors.effects!uAzqh6bUJ4ZfKcol.Hk5jIpbt4L79lBIp`. YAML source was not rewritten. World actors were not migrated.

### Validation impact

Foundry was not launched. Import Escape Pod, ETA-2, and Fang and confirm one Directional Shield listing on each.

### Status

Pack rebuilt. Fresh-import check pending. No commit. No push.

---

## Addendum — 2026-11-06 — CR90 Role: Corvette ability effects removed

### Reason

A fresh CR90 import showed Role: Corvette twice. The rules review showed that neither ability adjustment is a supported specialization benefit.

### Supersedes

The earlier statement that actor effect `ZtUQ6YtH6HkdJH60` was required compatibility data, and the suggestion that the later fix is to change item effect `qQTMHDrpIch61Q7C` from mode 0 to mode 2.

Those statements are retained above as historical evidence and must not be deleted.

### Revised decision or behavior

Both effects were removed from `packs/_source/drakes-shipyard/cr90-corvette.yml`. Item `QV7xhcdNoH8halzL` remains, with its hardpoint and weapon-damage text and with `effects: []`. No Role: Corvette Strength or Dexterity change remains on the ship. Actor-level effects in the pack went from 43 to 42, and the 42 unresolved actor-only effects were not changed.

`npm run build:db -- drakes-shipyard` exited 0 and packed 87 actors. The pack removed `!actors.effects!0S6RxfRRNiswQrya.ZtUQ6YtH6HkdJH60` and `!actors.items.effects!0S6RxfRRNiswQrya.QV7xhcdNoH8halzL.qQTMHDrpIch61Q7C`. The compendium tier-0 Corvette role feature was not edited and remains a separate question. World actors were not migrated.

### Validation impact

Dry run, live run, and post-repair dry run passed. Hull and shield tests passed 27. Equipment regen tests passed 7. A fresh CR90 import is still required to confirm the sheet lists the specialization once and no longer adds Strength or Dexterity from it.

### Status

CR90 ability effects removed and the pack rebuilt. Fresh CR90 import pending. No commit. No push.

---

## Addendum — 2026-11-06 — CR90 Corvette ability bonus restored

### Reason

Removing both Role: Corvette effects was incorrect. The base Corvette role grants Strength +1 and Dexterity +1. The item description is the separate specialization benefit.

### Supersedes

The status above that says both ability effects were removed and that a fresh import should show no Strength or Dexterity bonus from Role: Corvette. Also supersedes the earlier conclusion that `ZtUQ6YtH6HkdJH60` had to stay because it was the only applying copy.

Those statements are retained above as historical evidence and must not be deleted.

### Revised decision or behavior

Item `QV7xhcdNoH8halzL` again has exactly one embedded effect, `qQTMHDrpIch61Q7C`, with `transfer: true`. Strength +1 and Dexterity +1 are mode 2, priority 1. That id appears only under this item inside the CR90 actor. Actor effect `ZtUQ6YtH6HkdJH60` stays absent. The hardpoint and weapon-damage text is unchanged. The 42 unresolved actor-only effects are unchanged. The compendium tier-0 feature was not edited.

`npm run build:db -- drakes-shipyard` exited 0 and packed 87 actors, including CR90 `0S6RxfRRNiswQrya`. A fresh import should now show the specialization once and apply Strength +1 and Dexterity +1 once.

### Status

Embedded Corvette ability effect restored at mode 2. Actor duplicate remains removed. Pack rebuilt. Fresh CR90 import pending. No commit. No push.

---

## Addendum — 2026-11-06 — Canonical Role ability modes

### Reason

Foundry mode 0 is Custom and does not add an ability bonus. Tier-0 Role ability adjustments must use mode 2, Add.

### Supersedes

The sentence above that says the compendium tier-0 Corvette feature was not edited. That sentence remains as the record of the Drake CR90 repair. The Drake item correction is unchanged.

### Revised decision or behavior

The canonical Role features Corvette `2KEpnIbTdhgY06tF`, Cruiser `pbaT5Kczi8eJD0u0`, and Explorer `SgSw1dDCCvxPsfVs` now store their six ability adjustments at mode 2. Values, priorities, ids, descriptions, and movement entries are unchanged. Movement starting values stay mode 5 on `system.attributes.movement.space` and `system.attributes.movement.turn`. The other 33 tier-0 Role ability changes were already mode 2. The Drake CR90 embedded item was already corrected separately and was not edited here. `npm run build:db -- starships` exited 0. A fresh compendium check should show Add for those ability bonuses and Override for the movement entries.

### Status

Canonical Role ability modes repaired. Drake actor source was not edited. No commit. No push.
