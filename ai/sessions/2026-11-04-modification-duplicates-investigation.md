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

---

## Addendum — 2026-11-06 — Drake actor-only effects classified

### Reason

The 42 unresolved actor-only effects needed family tags and a separate ownership conclusion. They were not deleted or moved.

### Supersedes

The sentences above that leave all 42 unclassified, and the earlier claim that deleting 39 would change a prepared number. Those sentences stay as the inventory. This addendum replaces that claim with a per-effect result.

### Recount

Current Drake actor-level effects: 42. The frozen 42 ids are all present. None were added or removed. `ZtUQ6YtH6HkdJH60` and the three Directional Shield actor effects remain absent. No unexplained source drift.

### Rules used

Family tags are not the ownership conclusion. Prepared impact is not ownership. Mode 2 Add stacks, so an embedded item with the same key does not make the actor change redundant. Prepared flying speed is forced to 0. A mode 5 actor value on `movement.turn` or `movement.fly` is not copied into the prepared number. Role publication is mode 5 on `movement.space` or `movement.turn` from an embedded `subtype: role` item. None of these 42 ships publish that movement. The role family and the size family are empty: no actor effect matches an embedded role or size effect on key, mode, value, and priority together.

Two conflicts were resolved here. Z-TIE `aH2aU4GGZ8RGquth` stays Unresolved. The ship has no embedded Role item, so the Strength +1 cannot be assigned to a Role item, and the stored name Role does not by itself make it construction data. N-1 `RcQDyiiABgOStw5q` does not belong on Small Starship. That size item already applies Dexterity +2 at priority 1, while this effect applies Dexterity +2 at priority 20 and also stores Constitution 0. The adds stack, so removing the actor effect still changes prepared Dexterity.

### Required checks

YV-929 `OpwEjg658THj3164`, Modifier, current actor `LY8lY6F9nVqz7Km1`. Stored changes: `movement.fly` 350 mode 5, `movement.turn` 300 mode 5, both priority 20. Role: Freighter `8t3M3oYnzNPb9urY` publishes no movement. Its only change is Constitution +1, mode 2, transfer true. Stored movement is space 300, turn 200, fly 300. Prepared with the effect and without it: space 300, turn 200, fly 0. Fly is a no-op because preparation forces fly to 0. Turn is controlled by this effect, but the 300 is not copied because the Role item publishes no turn. Prepared impact: no-op. Ownership: Unresolved. Next action: investigate. Runtime check: yes.

Escape Pod `CvX6D1B00rvifhxM` and M3-A Scyk Fighter `3oOxhRCrZjoHwv4G`. Both are six ability changes, mode 2, value 0, priority 20. No Override, Upgrade, Downgrade, Multiply, or Custom change. Statuses empty. Duration empty. Flags have no special behavior. Origin is the missing legacy actor `msrxS22tzCwEup0n`. Escape Pod stored scores are Strength 14, Dexterity 13, Constitution 15, Intelligence 10, Wisdom 10, Charisma 10. Scyk stored scores are Strength 14, Dexterity 15, Constitution 13, Intelligence 10, Wisdom 12, Charisma 8. Excluding either effect changes none of those totals. Prepared impact: no-op. Ownership: Unresolved. Next action: investigate. They are not deletion candidates.

Z-TIE `aH2aU4GGZ8RGquth`, name Role, current actor. One change: Strength +1, mode 2, priority 20. `z-tie-fighter.yml` has no embedded Role item and no canonical role feature. Small Starship does not change Strength. Not a duplicate. Ownership: Unresolved. Prepared impact: changes prepared values. Next action: investigate.

### Counts

Each of the 42 ids appears once. Intentional construction data: 17, all of which change prepared values, next action keep. Unresolved and still changing prepared values: 22, next action investigate, except Fang, which is test. Unresolved prepared no-ops: 3, next action investigate. Belongs on an embedded item: 0.

### Intentional construction data

Prepared impact for each row is changes prepared values. Runtime verification is yes only where a movement key is involved.

- `QVV8J6QkJwUgK9tV`, `ef76-nebulon-b-escort-frigate-medical.yml`, EF76 Medical, ASI. Origin: missing legacy actor. Tags: ability-score increase, movement adjustment, custom ship modifier. Changes: Strength +3, Dexterity +1, Wisdom +2, fly +50 mode 2, turn -150 mode 2. Other abilities 0. Related item: none. Deletion lowers those three abilities and raises prepared turn by 150. Fly stays 0. Runtime: yes. Next: keep.
- `pqOqJLrepLJt7O0V`, `ef76-nebulon-b-escort-frigate.yml`, EF76, ASI. Origin: missing legacy actor. Tags: ability-score increase, movement adjustment, custom ship modifier. Changes: Strength +3, Wisdom +1, fly +50 mode 2, turn -150 mode 2. Other abilities 0. Related item: none. Deletion lowers Strength and Wisdom and raises prepared turn by 150. Runtime: yes. Next: keep.
- `4WAAiMXDrFy2MipW`, `hmp-droid-gunship.yml`, HMP Droid Gunship, ASI. Origin: missing legacy actor. Tags: ability-score increase, movement override, custom ship modifier. Changes: Constitution +4, turn 400 mode 5. Other abilities 0. Related item: none. Deletion lowers Constitution by 4. Prepared turn number stays on the stored value. Turn control goes away. Runtime: yes. Next: keep.
- `Kntbe9tGWmmm54Lj`, `wayfarer-class-medium-transport.yml`, Wayfarer, ASI. Origin: current actor. Tags: ability-score increase, movement adjustment, custom ship modifier. Changes: Strength +3, Dexterity -1, Constitution +1, turn +50 mode 2. Related item: none owns the set. Deletion reverses those three abilities and lowers prepared turn by 50. Runtime: yes. Next: keep.
- `Ld1zNnraoTkSCSUo`, `gat-12-skipray-blastboat.yml`, GAT-12, ASI. Origin: missing legacy actor. Tag: ability-score increase. Changes: Strength +4, Constitution +3. Other abilities 0. Related item: none. Deletion lowers those two scores. Runtime: no. Next: keep.
- `OAfvUZHcxgRUm7NF`, `k-wing-btl-s8.yml`, K-wing, ASI. Origin: missing legacy actor. Tag: ability-score increase. Changes: Strength +2, Constitution +4. Other abilities 0. Related item: none. Deletion lowers those two scores. Runtime: no. Next: keep.
- `TJIYFIzmVExqVc0D`, `m12-l-kimogila-heavy-fighter.yml`, Kimogila, ASI. Origin: missing legacy actor. Tag: ability-score increase. Changes: Constitution +2, Wisdom +2. Other abilities 0. Related item: none. Deletion lowers those two scores. Runtime: no. Next: keep.
- `LEc3T7KOFg6KKkPp`, `m3-a-scyk-heavy-fighter.yml`, Scyk Heavy, ASI. Origin: missing legacy actor. Tag: ability-score increase. Changes: Strength +2, Constitution +1. Other abilities 0. Related item: none. Deletion lowers those two scores. Runtime: no. Next: keep.
- `2znuu4saWRIWKilI`, `m4-c-dunelizard-fighter.yml`, Dunelizard, ASI. Origin: missing legacy actor. Tag: ability-score increase. Changes: Constitution +2. Other abilities 0. Related item: none. Deletion lowers Constitution by 2. Runtime: no. Next: keep.
- `GKjlvglk1KRlr5LS`, `tie-d-defender.yml`, TIE/D Defender, ASI. Origin: foreign Drake actor `ajAHTOE1nFbXxusm`. Tag: ability-score increase. Changes: Strength +2, Dexterity +3, Constitution +2, Wisdom +2, Charisma +1. Intelligence 0. Related item: none. Deletion lowers those five scores. Runtime: no. Next: keep.
- `UzKX8O1hrX2fUG6a`, `u-wing-starfighter-support-craft-ut-60d.yml`, U-wing, ASI. Origin: current actor. Tag: ability-score increase. Changes: Constitution +2, Wisdom +2. Related item: none. Deletion lowers those two scores. Runtime: no. Next: keep.
- `rpFFacilSwiEErzy`, `v-wing-starfighter-alpha-3-nimbus-class.yml`, V-wing, AIS. Origin: current actor. Tag: ability-score increase. Changes: Dexterity +1, Constitution +1. Related item: none. Deletion lowers those two scores. Runtime: no. Next: keep.
- `XoPU25PAVecBJZ1K`, `vulture-droid-cis.yml`, Vulture Droid, ASI. Origin: current actor. Tag: ability-score increase. Changes: Strength +1, Dexterity +5, Constitution +2, Wisdom +1. Related item: none. Deletion lowers those four scores. Runtime: no. Next: keep.
- `Rp7gk0y314hWBN4f`, `wander-class-jump-freighter.yml`, Wander, ASI. Origin: current actor. Tag: ability-score increase. Changes: Strength +1, Charisma +1. Related item: none. Deletion lowers those two scores. Runtime: no. Next: keep.
- `8Rr449jpbSMrmmId`, `x-70b-phantom-class-prototype.yml`, X-70B, ASI. Origin: current actor. Tag: ability-score increase. Changes: Strength +3, Constitution +1, Wisdom +3. Related item: none owns these values. Deletion lowers those three scores. Runtime: no. Next: keep.
- `lHtPlYquq2npPWPr`, `z-95-headhunter.yml`, Z-95, Ability Modifiers. Origin: current actor. Tag: ability-score increase. Changes: Strength +1, Wisdom +2. Related item: none. Deletion lowers those two scores. Runtime: no. Next: keep.
- `5g1eZGdBgFX28yTE`, `z-ceptor.yml`, Z-'ceptor, Modifier. Origin: current actor. Tag: ability-score increase, custom ship modifier. Changes: Dexterity +5, Constitution +5. Related item: none owns these values. Deletion lowers those two scores. Runtime: no. Next: keep.

### Unresolved, prepared values still change

Next action is investigate unless noted. Runtime verification is yes.

- `UvdO1iEhKf8g7CfW`, ETA-2, ASI. Origin: missing legacy actor. Tag: ability-score increase. Changes: Strength +2, Dexterity +1, Wisdom +2. Other abilities 0. Related item: Role: Interceptor matches only Dexterity +1. Deletion lowers Strength, Dexterity, and Wisdom.
- `YCeLyX8dFXqxKI2q`, Gand, ASI. Origin: missing legacy actor. Tag: ability-score increase. Changes: Dexterity +1, Constitution +1. Other abilities 0. Related item: Frame, Mark I matches only Constitution. Deletion lowers Dexterity and Constitution.
- `mLJNAvcynpjfy8NT`, Fang, ASI. Origin: missing legacy actor. Tags: ability-score increase, movement adjustment. Changes: Strength +1, Dexterity +2, Constitution +1, Wisdom +1, turn -100 mode 2. Other abilities 0. Related item: Adaptive Ailerons `uqX0yNJkEZ6MAJdD` also adds turn -100, and the adds stack. Deletion lowers the four abilities and raises prepared turn by 100. Next: test.
- `sdBpRmF78iiOot4Z`, Krayt, ASI. Origin: missing legacy actor. Tag: ability-score increase. Changes: Strength +1, Constitution +4, Wisdom +2. Other abilities 0. Related item: Reactor, Mark I matches only Strength. Deletion lowers those three scores.
- `4Hcr1AmMqhvU7Llh`, Scyk TIE Killer, ASI. Origin: missing legacy actor. Tag: ability-score increase. Changes: Strength +3, Dexterity +2, Wisdom +1. Other abilities 0. Related item: Small Starship also adds Dexterity +2, and the adds stack. Deletion lowers Strength, Dexterity, and Wisdom.
- `VC9CbCEjCmhPlFRI`, Nantex, ASI. Origin: missing legacy actor. Tag: ability-score increase. Changes: Strength +1, Dexterity +2. Other abilities 0. Related items: Reactor, Mark I matches Strength, and Small Starship also adds Dexterity +2. No one item owns the effect. Deletion lowers both scores.
- `0O7HKNqQOEd4OVW8`, StarViper Prototype, ASI. Origin: missing legacy actor. Tag: ability-score increase. Changes: Dexterity +2, Constitution +1, Wisdom +4, Charisma +2. Other abilities 0. Related item: Small Starship also adds Dexterity +2. Deletion lowers all four nonzero scores.
- `onJzcJxxUix0rH3I`, StarViper, ASI. Origin: missing legacy actor. Tag: ability-score increase. Changes: Strength +1, Dexterity +1, Constitution +1, Wisdom +2. Other abilities 0. Related items: Reactor and Thrusters each match one change. Deletion lowers all four nonzero scores.
- `uPZW3eWBxhBUUU5G`, StarViper Mk. II, ASI. Origin: missing legacy actor. Tag: ability-score increase. Changes: Dexterity +1, Constitution +1, Wisdom +2. Other abilities 0. Related items: Thrusters and Frame each match one change. Deletion lowers all three nonzero scores.
- `mvIuP35d26OjGvbc`, TIE Advanced, ASI. Origin: missing legacy actor. Tag: ability-score increase. Changes: Strength +1, Dexterity +1, Wisdom +2. Other abilities 0. Related items: Role: Strike Fighter and two thruster items cover Strength and Dexterity only. Deletion lowers all three nonzero scores.
- `N4VQQILD4SFt4gR6`, TIE/HU, ASI. Origin: current actor. Tag: ability-score increase. Changes: Strength +2, Dexterity +2, Wisdom +1. Related item: Small Starship also adds Dexterity +2. Deletion lowers all three scores.
- `XWEx7IMdFqkYzSni`, TIE Interceptor, ASI. Origin: current actor. Tag: ability-score increase. Changes: Dexterity +2, Strength +1, Wisdom +1. Related items: Small Starship and Role: Strike Fighter each match one change. Deletion lowers all three scores.
- `kBZ53WHwGwxDHFsy`, TIE Bomber Mine Layer, ASI. Origin: current actor. Tag: ability-score increase. Changes: Dexterity +1, Constitution +1. Related item: Frame, Mark I matches only Constitution. Deletion lowers both scores.
- `PqvYnyKJE77WZZHt`, TIE Bomber Missile Boat, ASI. Origin: current actor. Tag: ability-score increase. Changes: Dexterity +1, Constitution +1. Related item: Frame, Mark I matches only Constitution. Deletion lowers both scores.
- `UTRYA2jRi2cgpMnZ`, TIE Bomber, ASI. Origin: current actor. Tag: ability-score increase. Changes: Dexterity +1, Constitution +1. Related item: Frame, Mark I matches only Constitution. Deletion lowers both scores.
- `L8dxPRiNxzKWZrgW`, Advanced X-wing, ASI. Origin: current actor. Tag: ability-score increase. Changes: Strength +2, Dexterity +2, Constitution +1, Intelligence -2, Wisdom +4. Related item: Small Starship also adds Dexterity +2. Deletion reverses all five nonzero scores.
- `ABAZbMpjPFeY2lDX`, Y-wing, ASI. Origin: current actor. Tag: ability-score increase. Changes: Strength +2, Dexterity +1, Wisdom +1. Related items: Thrusters, Mark I and Role: Interceptor both match Dexterity. Deletion lowers all three scores.
- `tstPz7sF3O5hbLsi`, YT-1300 Modified, ASI. Origin: current actor. Tag: ability-score increase. Changes: Strength +1, Constitution +1, Wisdom +2. Related items: Reactor, Mark I and Role: Freighter each match one change. Deletion lowers all three scores.
- `XLUqHYCqcIgHhklz`, VT-49, ASI. Origin: current actor. Tags: ability-score increase, movement override, custom ship modifier. Changes: Constitution +1, Intelligence +2, Wisdom +2, fly 300 mode 5, turn 200 mode 5. Related item: none owns the set. Deletion lowers the three abilities. Prepared space, turn, and fly numbers stay put. Turn control goes away.
- `qSl5ltd7udAKjzBX`, YT-1300 Heavily Modified, ASI. Origin: current actor. Tags: ability-score increase, movement override, custom ship modifier. Changes: fly 400 mode 5, turn 150 mode 5, Strength +2, Dexterity +1, Constitution -1, Intelligence +1, Wisdom +1, Charisma +1. Related items: individual modifications match some ability keys and stack with this effect. Neither Role: Freighter item publishes movement. Deletion reverses the six abilities. Prepared space, turn, and fly numbers stay put.
- `RcQDyiiABgOStw5q`, N-1, ASI. Origin: missing legacy actor. Tag: ability-score increase. Changes: Dexterity +2. Other abilities 0. Related item: Small Starship `CUdmIPN5TKpIJg2M` also adds Dexterity +2 at priority 1. The adds stack. Deletion lowers Dexterity by 2. This effect does not belong on that size item.
- `aH2aU4GGZ8RGquth`, Z-TIE, Role. Origin: current actor. Tag: ability-score increase. Not a role adjustment. Change: Strength +1. Related item: none. Deletion lowers Strength by 1.

### Unresolved prepared no-ops

- `CvX6D1B00rvifhxM`, Escape Pod, ASI. Origin: missing legacy actor. Tag: zero-value remnant. Six ability adds of 0, mode 2, priority 20. Related item: none. Deletion changes no prepared score. Runtime: yes. Next: investigate.
- `3oOxhRCrZjoHwv4G`, M3-A Scyk Fighter, ASI. Origin: missing legacy actor. Tag: zero-value remnant. Six ability adds of 0, mode 2, priority 20. Related item: none. Deletion changes no prepared score. Runtime: yes. Next: investigate.
- `OpwEjg658THj3164`, YV-929, Modifier. Origin: current actor. Tags: movement override, custom ship modifier. Changes: fly 350 mode 5, turn 300 mode 5. Related item: Role: Freighter publishes no movement. Deletion changes no prepared speed. Turn control goes away. Runtime: yes. Next: investigate.

### Status

42 actor-only effects classified. None deleted, moved, or edited. No pack rebuild. No commit. No push.

---

## Addendum — 2026-11-06 — SotG workbook ownership audit

### Reason

The frozen 42 actor effects were compared with `C:\Users\ckauble\Downloads\SotG.xlsx`. The workbook was read from its ZIP and was not modified. Pack source was not edited during the comparison. Removal tests used the stored numbers in memory.

### Supersedes

Nothing in the classification above is deleted. This addendum adds workbook authority where a sheet matches, and it records that no high-confidence source fix met the gate.

### Workbook and scope

The file has 38 worksheets. `List of Ships` and `Starship Sheet` are not ships. `Example X-wing` and `Copy of Copy of Copy of copy` are not reliable ship sheets. Drake's Shipyard has 87 actors. Only actors with a high-confidence sheet were compared. A final workbook number was not treated as a value to store directly.

High-confidence matches, same ship and same variant:

- A-Z-Z-3 Light Freighter
- AEG-77 Vigo Gunship
- Aka'jor-class Shuttle, sheet `Akajor-class Shuttle`
- Amphibious Fighter
- ARC-170 Starfighter
- Arquitens-class Command Cruiser
- Arquitens-class Light Cruiser
- DeepWater-class Light Freighter - Legendary, sheet `Deepwater-class- Lengend`
- DeepWater-class Light Freighter, sheet `Deepwater-class Freighter`, because the legendary sheet accounts for the other Deepwater actor
- Delta-7 Aethersprite-class light interceptor, sheet `Delta-7`
- Delta-7 Aethersprite-class light interceptor - Modified, sheet `Modified Delta-7`
- DP20 Frigate
- Droid Tri-Fighter
- Dynamic-class light freighter, sheet `Dynamic-class`
- ETA-2 Actis-class Interceptor, sheet `ETA-2 Actis`
- Fang-class
- Gand Starfighter
- GAT-12 Skipray Blastboat, sheet `GAT-12`
- HMP Droid Gunship, sheet `HMP Gunship`

Variant mismatches, not used as authority: `AIATi Transport` is not AIAT/i Gunship; `Baleen-class Freighter` is not the Heavy Freighter; `Raider-Corvette` is not the CR90; `Example X-wing` is not the T-65 or the Advanced X-wing. `Basilisk` and `Crusader XX-777` are not exact actor names, so they were not used. Sheets with no Drake actor: Firespray-31, G9 Rigger, Gamma-class, GAT-24r, the four Gozanti sheets, GR-75, and Lancer Class.

Of the 42 actor effects, five sit on high-confidence ships: Fang, ETA-2, Gand, GAT-12, and HMP. The other 37 are `NEEDS REVIEW: NO WORKBOOK MATCH`. None of the other high-confidence actors have an actor-level effect.

### Fang-class

Actor `uAzqh6bUJ4ZfKcol`. Effect `mLJNAvcynpjfy8NT`, name ASI. The id in the earlier notes is the effect id, not the actor id.

Worksheet result: Fly 450, Turn 50, Turn adjustment -100 attributed to installed Adaptive Ailerons, Tier 0 Role Superiority Fighter, size Small, tier 2. Ability total row: 15, 18, 11, 10, 14, 10.

Stored movement: space 350, turn 200, fly 350. Stored abilities: 14, 14, 12, 10, 13, 10.

Embedded Adaptive Ailerons `uqX0yNJkEZ6MAJdD` has transfer true, turn -100 mode 2, priority 20. Canonical Adaptive Ailerons `H1PmkigBok9ThtyJ` has the same turn change. The actor effect also has turn -100 mode 2. Small Starship adds Dexterity +2 and Constitution -2.

Prepared with the actor effect: space 350, turn 0, fly 0. Abilities 15, 18, 11, 10, 14, 10. Those ability totals match the worksheet total row. Prepared without the actor effect: space 350, turn 100, fly 0. Abilities 14, 16, 10, 10, 13, 10. That misses both the ability totals and Turn 50.

The two turn adds stack: 200 - 100 - 100 = 0. One Adaptive Ailerons contribution would leave turn 100, still not 50. The worksheet also lists Combat Thrusters Mk I and Mk II, which are not embedded on this actor. Canonical Combat Thrusters Mk I and Mk II each add turn -50, but installing them would be a new component, not a proven repair of this effect. Changing canonical Adaptive Ailerons would affect ships outside this workbook match, so it was not changed.

Classification: `NEEDS REVIEW: INSUFFICIENT OWNERSHIP EVIDENCE`. The ability changes are load-bearing for the workbook totals and have no single proven item owner. The turn change duplicates Adaptive Ailerons and still does not produce Turn 50 if removed. No source edit.

### Other matched actor effects

Prepared fly is 0 in all of these. Space and turn below are the prepared space and turn.

- ETA-2 `kxOYt1pVQc0rh1OP`, sheet `ETA-2 Actis`, effect `UvdO1iEhKf8g7CfW`. Worksheet Fly 450, Turn 150, no turn adjustment, role Superiority Fighter. The actor's installed role item is Role: Interceptor, not Superiority Fighter, so the configuration does not agree. Stored space 300, turn 200. Actor changes: Strength +2, Dexterity +1, Wisdom +2, mode 2. Prepared turn 200. Workbook turn 150 is not produced by this effect. Classification: `NEEDS REVIEW: VARIANT MISMATCH`.
- Gand `DiyflQC8xEhqvrzp`, sheet `Gand Starfighter`, effect `YCeLyX8dFXqxKI2q`. Worksheet Fly 450, Turn 200, role Bomber, no turn adjustment. Stored space 350, turn 250. Actor changes: Dexterity +1, Constitution +1. Frame, Mark I already adds Constitution +1, and the adds stack. Prepared turn 250, not 200. No component on the sheet is named as the source of this ability pair. Classification: `NEEDS REVIEW: INSUFFICIENT OWNERSHIP EVIDENCE`.
- GAT-12 `Bgqr4WNQpTzEIepj`, sheet `GAT-12`, effect `Ld1zNnraoTkSCSUo`. Worksheet Fly 350, Turn 100, role Attack Fighter, no turn adjustment. Stored space 300, turn 300. Embedded Adaptive Ailerons adds the only turn -100, so prepared turn is 200, not 100. Actor changes are Strength +4 and Constitution +3, mode 2, and do not touch turn. The sheet does not name a component for those ability values. Classification: `NEEDS REVIEW: INSUFFICIENT OWNERSHIP EVIDENCE`.
- HMP `reNHgyibXInPuEMz`, sheet `HMP Gunship`, effect `4WAAiMXDrFy2MipW`. Worksheet Fly 350, Turn 100, role Shuttle, no turn adjustment. Stored space 250, turn 250. Actor changes: Constitution +4 mode 2, and turn 400 mode 5. The mode 5 turn value is not copied. No role item publishes turn, so prepared turn stays 250. Prepared fly stays 0. Classification: `NEEDS REVIEW: INSUFFICIENT OWNERSHIP EVIDENCE`.

### No workbook match

These 37 effects stay `NEEDS REVIEW: NO WORKBOOK MATCH`. Their earlier family tags and prepared-impact notes remain in the addendum above. They were not given another ship's numbers.

`QVV8J6QkJwUgK9tV`, `pqOqJLrepLJt7O0V`, `CvX6D1B00rvifhxM`, `OAfvUZHcxgRUm7NF`, `TJIYFIzmVExqVc0D`, `sdBpRmF78iiOot4Z`, `3oOxhRCrZjoHwv4G`, `LEc3T7KOFg6KKkPp`, `4Hcr1AmMqhvU7Llh`, `2znuu4saWRIWKilI`, `RcQDyiiABgOStw5q`, `VC9CbCEjCmhPlFRI`, `0O7HKNqQOEd4OVW8`, `onJzcJxxUix0rH3I`, `uPZW3eWBxhBUUU5G`, `mvIuP35d26OjGvbc`, `GKjlvglk1KRlr5LS`, `N4VQQILD4SFt4gR6`, `XWEx7IMdFqkYzSni`, `kBZ53WHwGwxDHFsy`, `PqvYnyKJE77WZZHt`, `UTRYA2jRi2cgpMnZ`, `UzKX8O1hrX2fUG6a`, `rpFFacilSwiEErzy`, `XLUqHYCqcIgHhklz`, `XoPU25PAVecBJZ1K`, `Rp7gk0y314hWBN4f`, `Kntbe9tGWmmm54Lj`, `8Rr449jpbSMrmmId`, `L8dxPRiNxzKWZrgW`, `ABAZbMpjPFeY2lDX`, `qSl5ltd7udAKjzBX`, `tstPz7sF3O5hbLsi`, `OpwEjg658THj3164`, `lHtPlYquq2npPWPr`, `5g1eZGdBgFX28yTE`, `aH2aU4GGZ8RGquth`.

### Counts

- Correct actor ownership: 0
- Confirmed move: 0
- Confirmed duplicate: 0
- Intentional stack: 0
- Incorrect value: 0
- Missing item effect: 0
- Prepared no-op: 0 newly proven from the workbook
- Needs review, no workbook match: 37
- Needs review, variant mismatch: 1 (ETA-2)
- Needs review, insufficient ownership evidence: 4 (Fang, Gand, GAT-12, HMP)

### Cross-ship pattern

Adaptive Ailerons is the only repeated component tied to a matched actor effect. Fang's embedded copy already matches the canonical turn -100. The actor adds a second -100. GAT-12 also has embedded Adaptive Ailerons and no actor turn change, and its prepared turn is still 200 against a worksheet turn of 100. That pattern is a systemic candidate. It was not implemented, because a canonical change would affect actors outside the high-confidence set, and removing Fang's actor turn key does not produce Turn 50.

### Remediation and validation

No source file was changed. No pack was rebuilt. The next batch is a Fang movement reconciliation that can name the stored space 350 and turn 200 against worksheet Fly 450 and Turn 50, including the missing Combat Thrusters rows, before any effect is split or removed. Do not delete `mLJNAvcynpjfy8NT` while its ability changes are what make the workbook ability totals.

### Status

Workbook audit recorded. No high-confidence fix. No source edit. No commit. No push.

---

## Addendum — 2026-11-12 — Fang role, turn, and specialization repair

### Reason

The Fang-class worksheet is authoritative for this actor. Role: Superiority Fighter was missing. The actor effect's Turn -100 duplicated Adaptive Ailerons. The workbook specialization is Superiority Fighter, not Strike Fighter.

### Supersedes

The status above that says no Fang source edit was made, and the sentence that says not to remove the actor Turn -100 until a later reconciliation. Those statements stay as the record of the read-only audit.

### Revised behavior

`packs/_source/drakes-shipyard/fang-class.yml` now has embedded Role: Superiority Fighter `RsupFng8kQ2mN4wL`, sourced from canonical item `vyc2GIsA50ilVSyg`. Its transfer-true effect overrides space to 400 and turn to 150, and adds Dexterity +1. Actor effect `mLJNAvcynpjfy8NT` no longer changes turn. Its Dexterity change is +1. It still adds Strength +1, Constitution +1, and Wisdom +1. Strike Fighter `gqzu99tDjcCvaGNP` was not edited. A separate embedded specialization, Role Spec: Superiority Fighter `RspcFng9tY3pQ5xM`, adds `movement.space` +50 mode 2. There is no canonical specialization document for that feature, so this copy is only on Fang.

In-memory prepared result: space 450, turn 50, fly 0, abilities 15, 18, 11, 10, 14, 10. The only Turn -100 is Adaptive Ailerons. The intermediate prepared turn of -50 was not saved. Combat Thrusters were not added. Canonical Adaptive Ailerons was not edited. The pack was not rebuilt.

### Status

Fang source repaired. Pack rebuild still required after Foundry is stopped. No commit. No push.

---

## Addendum — 2026-11-16 — Fang pack rebuilt

### Reason

Foundry was stopped, so the repaired Fang source could be compiled.

### Supersedes

The status above that says the pack rebuild is still required. That status stays as the record of the unrebuilt source.

### Revised behavior

`npm run build:db -- drakes-shipyard` exited 0 and packed Fang-class `uAzqh6bUJ4ZfKcol`. A fresh import is still required to see space 450 and turn 50.

### Status

Fang pack rebuilt. Fresh import pending. No commit. No push.

---

## Addendum — 2026-11-16 — Fang validation closeout and remaining workbook actors

### Reason

The rebuilt Fang import was validated in Foundry, and the four remaining workbook-related actor effects were reconstructed from `SotG.xlsx`. The workbook was read from its ZIP and was not modified.

### Supersedes

The status above that says the fresh import is pending. That sentence stays as the record from before this validation. The 2026-11-06 classifications of Gand, GAT-12, HMP, and ETA-2 stay as the earlier audit. This addendum records the later reconstruction and the decision not to edit them.

### Fang live validation

Source actor `uAzqh6bUJ4ZfKcol` in `packs/_source/drakes-shipyard/fang-class.yml` still matches the repaired state. It was not edited.

A fresh import, world actor `TEMP Fang validation` `gKxHhkEF5TF4xIZy`, came from `Compendium.sw5e-module.drakes-shipyard.Actor.uAzqh6bUJ4ZfKcol`. The older world actor `Fang-class` `WDquFVQDLxNBnfrw` was not opened or changed.

Prepared and displayed values: space 450, turn 50, fly 0, abilities 15, 18, 11, 10, 14, 10. Save, close, reopen, and a browser reload kept those values. No Fang, Active Effect, or starship-preparation console error was recorded.

Contributions, each once:

- Role: Superiority Fighter `RsupFng8kQ2mN4wL`: space Override 400, turn Override 150, Dexterity Add +1.
- Role Spec: Superiority Fighter `RspcFng9tY3pQ5xM`: space Add +50. This item exists only on Fang. No canonical specialization document was found.
- Adaptive Ailerons `uqX0yNJkEZ6MAJdD`: one turn Add -100. Canonical Adaptive Ailerons was not changed.
- Actor effect ASI `mLJNAvcynpjfy8NT`: no movement change. Strength +1, Dexterity +1, Constitution +1, Wisdom +1. Intelligence and Charisma remain stored as +0.
- Small Starship `5rjtIrFtcMNL3D5c`: Dexterity +2, Constitution -2.
- Role Spec: Strike Fighter `gqzu99tDjcCvaGNP` is still present and unchanged. It sets the role text to Strike Fighter and adds a weapon attack bonus of +1. It does not change space or turn.

Strike Fighter and Superiority Fighter both appearing is an unresolved semantic issue. It is not a failed movement repair. Combat Thrusters were not added. The intermediate turn of -50 was never saved.

`TEMP Fang validation` `gKxHhkEF5TF4xIZy` was deleted after the results were recorded. `WDquFVQDLxNBnfrw` is still present.

### Read-only reconstructions

Reports, outside the repository: `C:\Users\ckauble\AppData\Local\Temp\sw5e-remaining-actors\gand.md`, `gat-12.md`, `hmp.md`, and `eta-2.md`. Preparation was simulated in memory. No source document was edited and reverted. Canonical role files were checked and not edited: Bomber `53B9y7SQ99ZK5hup` publishes space 450 and turn 200; Attack Fighter `Xxjz0gT579YzJV29` publishes space 350 and turn 100 plus Strength +1; Shuttle `9Y0nzFMxL2BanNd7` publishes space 350 and turn 100 plus Constitution +1.

Prepared flying speed is `movement.space`. `movement.fly` is forced to 0. Only subtype `role` with mode 5 publishes movement. Mode 2 adds stack.

#### Gand Starfighter

Actor `DiyflQC8xEhqvrzp`, sheet `Gand Starfighter` (`sheet26.xml`). Mapping is high for the named hull, tier 1, Small, and the ability bases. Armor, reactor, coupling, scanner name, cannon count, and ammunition count do not match the sheet, so the actor is not a clean copy of the whole worksheet.

Workbook ability totals are 14, 16, 13, 10, 14, 11. Fly formula caches 450 and turn formula caches 200, both from role Bomber, with no specialization or manual speed adjustment. Prepared abilities match those totals. Prepared space is 350 and prepared turn is 250 because no item has subtype `role`. Stored movement is 350 / 250. Embedded Role: Bomber `XjPLikTzuibn7Cbd` is subtype `roleSpecialization`, adds only Wisdom +1, and does not publish movement.

Effect ASI `YCeLyX8dFXqxKI2q`, transfer false, disabled false, priority 20 on every change:

| Key | Mode | Value | Raw | Prepared | Workbook | Owner | Embedded | Canonical | Class | Confidence | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `system.abilities.str.value` | 2 | 0 | 14 | 14 | 14 | none | none | none | PREPARED NO-OP | high that it adds nothing | NO EDIT |
| `system.abilities.dex.value` | 2 | 1 | 13 | 16 | 16, ASI cell `I6` = 1 | actor ASI | Small Starship `QwtcDqpGqxtwz0K7` owns the separate +2 | ASI feature `xs1MlcfBFFiUyCQv` has no effect | CORRECT ACTOR OWNERSHIP | high | NO EDIT |
| `system.abilities.con.value` | 2 | 1 | 13 | 13 | 13, ASI `J6` = 1 and modifications `J7` = 1 | actor ASI, stacked with Frame | Frame, Mark I `rbJMhzfvYhYUutSU` +1; Small Starship -2 | Frame `DIrqTk8nPYStxC1A` | INTENTIONAL STACK | high | NO EDIT |
| `system.abilities.int.value` | 2 | 0 | 10 | 10 | 10 | none | none | none | PREPARED NO-OP | high that it adds nothing | NO EDIT |
| `system.abilities.wis.value` | 2 | 0 | 13 | 14 | 14, role formula +1 | role item, not this +0 | Role: Bomber `XjPLikTzuibn7Cbd` +1 | Role: Bomber `53B9y7SQ99ZK5hup` | PREPARED NO-OP | high that the actor change adds nothing | NO EDIT |
| `system.abilities.cha.value` | 2 | 0 | 11 | 11 | 11 | none | none | none | PREPARED NO-OP | high that it adds nothing | NO EDIT |

The effect stayed unresolved earlier because Constitution +1 shares a key and value with Frame, while the sheet keeps those rows separate. Both adds are required. Replacing the embedded role with the canonical Bomber publication would be a different edit, and the rest of the loadout does not match the sheet. No Gand source edit.

#### GAT-12 Skipray Blastboat

Actor `Bgqr4WNQpTzEIepj`, sheet `GAT-12` (`sheet27.xml`). Identity, tier 3, Small, bases, hull 44, and shields 75 match. Tier 0 role `F9` is Attack Fighter. Tier 2 specialization `H111` is Shuttle. Those are two slots on the same sheet, not two variants. The actor has Role Spec: Shuttle `j79orFtk8oqMH6Nx` and no subtype-`role` item. Coupling and suite do not match the sheet.

Workbook totals are 18, 14, 17, 10, 14, 8. Fly caches 350 and turn caches 100 from Attack Fighter. The turn formula does not subtract Adaptive Ailerons. Prepared abilities match the totals. Prepared space is 300 and prepared turn is 200, because stored turn 300 plus Adaptive Ailerons `hQ1wwoqMfU6ZGRZI` turn -100 is the only movement math.

Effect ASI `Ld1zNnraoTkSCSUo`, transfer false, disabled false, priority 20:

| Key | Mode | Value | Raw | Prepared | Workbook | Owner | Embedded | Canonical | Class | Confidence | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `system.abilities.str.value` | 2 | 4 | 14 | 18 | 18 = ASI 3 + Attack Fighter 1 | split: 3 actor, 1 missing role | none | Role: Attack Fighter `Xxjz0gT579YzJV29` | INCORRECT VALUE | high for the split | NO EDIT |
| `system.abilities.dex.value` | 2 | 0 | 12 | 14 | 14 | size, not this 0 | Small Starship `mUjAwBxUg9shADPv` +2 | `6BN8l5E8QtYt103T` | PREPARED NO-OP | high | NO EDIT |
| `system.abilities.con.value` | 2 | 3 | 15 | 17 | 17, ASI `J6` = 3 | actor ASI | Frame `mOrIRQ69lPkIeSrz` +1; size -2 | Frame `DIrqTk8nPYStxC1A` | CORRECT ACTOR OWNERSHIP | high | NO EDIT |
| `system.abilities.int.value` | 2 | 0 | 10 | 10 | 10 | none | none | none | PREPARED NO-OP | high | NO EDIT |
| `system.abilities.wis.value` | 2 | 0 | 13 | 14 | 14 | sensor array, not this 0 | Sensor Array, Mark I `Qj2qbRkB814zCApR` +1 | `CncE9bLKYn5iZlwD` | PREPARED NO-OP | high | NO EDIT |
| `system.abilities.cha.value` | 2 | 0 | 8 | 8 | 8 | none | none | none | PREPARED NO-OP | high | NO EDIT |

Changing Strength from +4 to +3 without the role prepares 17. Adding the role on top of +4 prepares 19. Doing both prepares Strength 18 and then turn 0, because the role publishes turn 100 and Adaptive Ailerons still adds -100. The sheet turn is 100. That atomic state fails. Canonical Adaptive Ailerons was not changed. Drake actors that embed it are GAT-12, Aka'jor, the modified Delta-7, both Nebulon-B actors, Fang, Nantex, and the U-wing. No GAT-12 source edit.

#### HMP Droid Gunship

Actor `reNHgyibXInPuEMz`, sheet `HMP Gunship` (`sheet34.xml`). Bases, tier 2, Small, role Shuttle, and specialization Bomber match. Armor and reactor type do not. Workbook totals are 14, 12, 18, 12, 14, 8. Fly caches 350 and turn caches 100 from Shuttle. Prepared abilities match. Prepared space and turn stay 250. The actor mode 5 turn 400 is not published.

Effect ASI `4WAAiMXDrFy2MipW`, transfer false, disabled false, priority 20:

| Key | Mode | Value | Raw | Prepared | Workbook | Owner | Embedded | Canonical | Class | Confidence | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `system.abilities.str.value` | 2 | 0 | 13 | 14 | 14 | reactor, not this 0 | Reactor, Mark I `XRY9uQOXkhRgd1DE` +1 | `IQRWfBEpxMKLROOx` | PREPARED NO-OP | high | NO EDIT |
| `system.abilities.dex.value` | 2 | 0 | 10 | 12 | 12 | size, not this 0 | Small Starship `PANrDEtEOnvvheyy` +2 | `6BN8l5E8QtYt103T` | PREPARED NO-OP | high | NO EDIT |
| `system.abilities.con.value` | 2 | 4 | 15 | 18 | 18, ASI `J6` = 4 | actor ASI | size -2; Role: Shuttle `rMgwICJ0JdiA9Glv` +1 | ASI feature has no effect | CORRECT ACTOR OWNERSHIP | high | NO EDIT |
| `system.abilities.int.value` | 2 | 0 | 12 | 12 | 12 | none | none | none | PREPARED NO-OP | high | NO EDIT |
| `system.abilities.wis.value` | 2 | 0 | 14 | 14 | 14 | none | none | none | PREPARED NO-OP | high | NO EDIT |
| `system.abilities.cha.value` | 2 | 0 | 8 | 8 | 8 | none | none | none | PREPARED NO-OP | high | NO EDIT |
| `system.attributes.movement.turn` | 5 | 400 | 250 | 250 | 100 | none | Role: Shuttle publishes nothing | Role: Shuttle `9Y0nzFMxL2BanNd7` publishes 100, not 400 | PREPARED NO-OP | high that 400 is not prepared | NO EDIT |

Role Spec: Bomber `FlcZuegIatuxuEJt` matches `H111` and was not converted into the role. Publishing the canonical Shuttle speeds on this embedded item would also leave the actor mode 5 controller in place, and the embedded item's description and compendium id are not the current canonical role. The same missing publication appears on other Drake Shuttle items. No HMP source edit.

#### ETA-2 Actis-class Interceptor

Actor `kxOYt1pVQc0rh1OP`, sheet `ETA-2 Actis` (`sheet21.xml`). The sheet is a different configuration. Both are Small, tier 2, and share the base scores, but the sheet role and specialization are Superiority Fighter, while the actor embeds Role: Interceptor `SD65mkoce1gtVgp3` and Role Spec: Interceptor `CSXdf6NzOarL8rI5`. Comms, scanner, thrusters, weapons, shield, coupling, and whether the hyperdrive ring is installed also differ. The Role discrepancy is not an isolated defect on the same build. Conclusion: `NEEDS REVIEW: VARIANT MISMATCH`. Do not install Superiority Fighter or remove Interceptor.

Workbook totals are 16, 18, 11, 10, 12, 12. Fly caches 450 (role 400 plus specialization +50). Turn caches 150. Prepared actor movement is space 300, turn 200, fly 0. The specialization's `movement.fly` +50 does not raise space.

Effect ASI `UvdO1iEhKf8g7CfW`, transfer false, disabled false, priority 20:

| Key | Mode | Value | Raw | Prepared | Workbook | Owner | Embedded | Canonical | Class | Confidence | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `system.abilities.str.value` | 2 | 2 | 13 | 16 | 16, ASI `H6` = 2 | actor ASI | Reactor, Mark I `cOg3lvfvyh57kRMF` +1 | ASI feature has no effect | CORRECT ACTOR OWNERSHIP | high for this layer only | NO EDIT |
| `system.abilities.dex.value` | 2 | 1 | 14 | 18 | 18, but ASI Dexterity is empty | unresolved | size +2; Role: Interceptor +1 | Thrusters, Mark I is the sheet's modification +1 and is not installed here | NEEDS REVIEW: VARIANT MISMATCH | low | NO EDIT |
| `system.abilities.con.value` | 2 | 0 | 13 | 11 | 11 | none | Small Starship `cKwWxbNj3gMbJNrP` -2 | `6BN8l5E8QtYt103T` | PREPARED NO-OP | high | NO EDIT |
| `system.abilities.int.value` | 2 | 0 | 10 | 10 | 10 | none | none | none | PREPARED NO-OP | high | NO EDIT |
| `system.abilities.wis.value` | 2 | 2 | 12 | 14 | 12 | actor choice the sheet does not make | none | none | NEEDS REVIEW: VARIANT MISMATCH | low against this sheet | NO EDIT |
| `system.abilities.cha.value` | 2 | 0 | 12 | 12 | 12 | none | none | none | PREPARED NO-OP | high | NO EDIT |

No ETA-2 source edit.

### Classification counts for the inspected changes

- CORRECT ACTOR OWNERSHIP: 4
- INTENTIONAL STACK: 1
- INCORRECT VALUE: 1
- PREPARED NO-OP: 17
- NEEDS REVIEW: VARIANT MISMATCH: 2
- CONFIRMED MOVE, CONFIRMED DUPLICATE, MISSING ITEM EFFECT, and NEEDS REVIEW: NO WORKBOOK MATCH: 0 among these changes

The 37 effects with no worksheet remain `NEEDS REVIEW: NO WORKBOOK MATCH`. Missing role publication on Gand and HMP, and the missing Attack Fighter item on GAT-12, are recorded above and were not given an actor-effect class.

### Implementation

No Drake actor source was edited. No canonical item was edited. No pack was rebuilt. Foundry was running, and no rebuild was required because no source changed. No fresh Gand, GAT-12, HMP, or ETA-2 import was created. No existing world actor other than the disposable Fang validation copy was modified.

### Unresolved

- Fang still has both Strike Fighter and Superiority Fighter specializations.
- Gand, GAT-12, and HMP still prepare movement from stored values because their tier-0 role items do not publish mode 5 space and turn. Repairing that publication is a later batch. It is not safe as a one-ship edit in this pass.
- GAT-12 Strength +4 stands in for ASI +3 plus the missing Attack Fighter +1. Installing that role while Adaptive Ailerons remains would prepare turn 0.
- ETA-2 remains a variant mismatch.
- The other 37 actor effects still have no worksheet.

### Status

Fang validation recorded and the temporary actor removed. Gand, GAT-12, HMP, and ETA-2 reconstructed. No source edit. No pack rebuild. No commit. No push.

---

## Addendum — 2026-11-16 — Drake Role movement publication inventory

### Reason

Every Drake actor was checked for a publishing Role. The question was why prepared movement stays on the stored value for ships other than Fang.

### Supersedes

Nothing above is removed. Gand, GAT-12, ETA-2, and Fang stay out of this repair batch.

### Read-only inventory

87 actors were parsed from `packs/_source/drakes-shipyard`. 36 canonical Role features were indexed under `packs/_source/starships/starship-features`. Publication uses `isRoleSpeedProfileItem`: subtype must be exactly `role`, and only an enabled mode 5 change on `system.attributes.movement.space` or `.turn` publishes. Prepared movement is that published value when an applicable override controls the field, otherwise the stored value, plus mode 2 space and turn deltas. `movement.fly` is forced to 0.

Inventory groups:

- Correct publishing Role: 1 (Fang-class)
- Role-named item whose subtype is not `role`: 32 actors
- Subtype `role` with no enabled mode 5 movement: 17 actors
- Incomplete publication: 0
- Complete publication with intentional custom values: 0
- Complete publication with an unexplained canonical mismatch: 0
- Only Role Spec or `roleSpecialization`, no base Role: 26 actors
- No Role item: 10 actors
- Multiple base Roles: 1 (YT-1300, Heavily Modified)

Item counts: 73 items are named `Role:`. 53 of those do not have subtype `role`. 20 items have subtype `role`. 64 items are a Role Spec by name or by subtype `roleSpecialization`.

Of the 73 base-role source pointers, 72 do not resolve to a current starship document. They use 14 stale ids. The only resolving pointer is Fang's Role: Superiority Fighter, `Compendium.sw5e-module.starships.vyc2GIsA50ilVSyg`. The shared effect id `qQTMHDrpIch61Q7C` appears on many different roles, so it does not identify a Role.

### Root cause

`utils/packs.mjs` does not assign Role subtypes or copy canonical movement onto embedded items.

At `fb63553d6`, canonical Role: Freighter `QY7jBe7EgKLz8z1p` already had subtype `role` and only Constitution +1. Drake's A-Z-Z-3 already had subtype `role` and the same ability change. Commit `0da62ca1d` then added mode 5 space and turn overrides to the canonical Role features only. Its message says old world Roles may need a compendium refresh. That commit did not update `packs/_source/drakes-shipyard`.

The missing publication is therefore old embedded copies that never received the Bug 11 movement changes. A second set cannot publish even if those keys were copied, because the embedded item's subtype is blank or `roleSpecialization`. There is no evidence of one conversion script stripping subtypes. Names with no current canonical Role are Interceptor, Gunboat, and Strike Fighter.

### Decision

No actor passed all ten gates. No source file was edited. No canonical Role was edited. No repair was simulated as a saved target. Current prepared movement was simulated for all 87 actors: it matches stored movement plus mode 2 deltas, except Fang, whose Role publishes 400/150 and whose prepared result is 450/50.

Actor-level mode 5 changes that do not publish, and that would make turn control ambiguous if a Role began publishing while they remained:

- HMP `4WAAiMXDrFy2MipW`, turn 400
- VT-49 Decimator `XLUqHYCqcIgHhklz`, fly 300 and turn 200
- YV-929 `OpwEjg658THj3164`, fly 350 and turn 300
- YT-1300, Heavily Modified `qSl5ltd7udAKjzBX`, fly 400 and turn 150

The closest later batch is the 12 stale subtype-`role` items whose name and size match a current canonical Role, but whose source UUID does not. Freighter (`QY7jBe7EgKLz8z1p`) publishes 300/150. Yacht (`dfqRcgIokd6o0G0A`) publishes 350/200. Warship (`72graKov2mme5CB0`) publishes 200/500. Those actors are A-Z-Z-3, AIAT/i, both DeepWaters, both VCX-100s, YT-1300f, YV-929, Baudo modified, Horizon legendary, X-70B, and Executor. They were not repaired, because the stale UUID does not prove the current document and several still have actor-level movement changes.

Gand, GAT-12, ETA-2, and Fang were not edited.

### Classification counts

- CORRECT ROLE PUBLICATION: 1
- STALE EMBEDDED ROLE: 12
- NON-PUBLISHING ROLE: 32
- MISSING BASE ROLE: 36
- INSUFFICIENT EVIDENCE: 5
- MULTIPLE ROLE CONFLICT: 1
- INCOMPLETE ROLE EFFECT, INTENTIONAL CUSTOM ROLE, and VARIANT MISMATCH: 0 in this Role-publication classification

Prepared space/turn below is the in-memory result. Published `-/-` means no Role publication.

| Actor | ID | File | Current Role | Subtype | Published | Prepared | Class | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-Z-Z-3 Light Freighter | Ec0jtuoGKx6dPdXL | a-z-z-3-light-freighter.yml | Role: Freighter 8WM96RjJKxq4v5EZ | role | -/- | 50/50 | STALE EMBEDDED ROLE | NO EDIT |
| A/SF-01 B-wing starfighter | Y0Vf2Yi6pPQjliD1 | a-sf-01-b-wing-starfighter.yml | Role: Bomber 60nHLQxcoMBitVrQ | (blank) | -/- | 250/250 | NON-PUBLISHING ROLE | NO EDIT |
| AEG-77 Vigo Gunship | g7Rc7hHyyWraZ9xB | aeg-77-vigo-gunship.yml | Role: Gunboat MvOUgDzaMc4A6nhA | (blank) | -/- | 300/200 | NON-PUBLISHING ROLE | NO EDIT |
| AIAT/i Gunship | EAiaXORMgRRDVsz9 | aiat-i-gunship.yml | Role: Freighter ReQ4aQ33Dw9VK5EV | role | -/- | 300/200 | STALE EMBEDDED ROLE | NO EDIT |
| Aka'jor-class Shuttle | tRnGAAILKowm8n4T | akajor-class-shuttle.yml | Role: Shuttle 4lOzKTxQ6X75iRE3 | (blank) | -/- | 300/100 | NON-PUBLISHING ROLE | NO EDIT |
| Amphibious Fighter | LGffjLPNJFnU0dFw | amphibious-fighter.yml | Role: Strike Fighter cn8vBB6vWd0lknLm | roleSpecialization | -/- | 300/200 | MISSING BASE ROLE | NO EDIT |
| ARC-170 Starfighter | B5AmMDBTT6TrfW5E | arc-170-starfighter.yml | Role: Shuttle 546iyB7I0mfBCOgu | roleSpecialization | -/- | 300/250 | MISSING BASE ROLE | NO EDIT |
| Arquitens-class Command Cruiser | mpt1kUtoAefmMm2J | arquitens-class-command-cruiser.yml | Role: Cruiser BNntHepC9RhyIwjO | (blank) | -/- | 300/200 | NON-PUBLISHING ROLE | NO EDIT |
| Arquitens-class Light Cruiser | gcbEAITXaFubk3Te | arquitens-class-light-cruiser.yml | Role: Cruiser xFHd6rI1xtRGo9Yw | (blank) | -/- | 300/200 | NON-PUBLISHING ROLE | NO EDIT |
| Baleen-class Heavy Freighter | gDIld1heRHyZAON9 | baleen-class-heavy-freighter.yml | Role: Explorer uq9rp0qorjKNfWFF | (blank) | -/- | 300/300 | NON-PUBLISHING ROLE | NO EDIT |
| Baradium Missile | cfolyngp2wsTmiAI | baradium-missile.yml | (none) | - | -/- | 450/150 | MISSING BASE ROLE | NO EDIT |
| Barloz Class Medium Freighter | cczypZPh7owYKxX1 | barloz-class-medium-freighter.yml | Role: Freighter PmbL9tsxdUSOYQRb | (blank) | -/- | 300/200 | NON-PUBLISHING ROLE | NO EDIT |
| Basilisk Space Droid | 7X4txvq9CcL2MPdL | basilisk-space-droid.yml | (none) | - | -/- | 100/100 | MISSING BASE ROLE | NO EDIT |
| Baudo-class Star Yacht | e5uv8tcM0cFQLI7R | baudo-class-star-yacht.yml | Role: Yacht VHtmsBGq3mQy2sGk | (blank) | -/- | 300/200 | NON-PUBLISHING ROLE | NO EDIT |
| Baudo-class Star Yacht - Modified | IbM8uXHEpvvdf0TN | baudo-class-star-yacht-modified.yml | Role: Yacht VHtmsBGq3mQy2sGk | role | -/- | 350/250 | STALE EMBEDDED ROLE | NO EDIT |
| C-wing Corellian/B-wing | NYWhs7E7dXECVXNq | c-wing-corellian-b-wing.yml | Role: Shuttle 6w11XCnEdQejeh9p | roleSpecialization | -/- | 300/300 | MISSING BASE ROLE | NO EDIT |
| Chir'daki Deathseed | OMMoXTxtFhVheNdP | chirdaki-deathseed.yml | Role: Strike Fighter SUIHKYejNmPDlkIy | roleSpecialization | -/- | 300/150 | MISSING BASE ROLE | NO EDIT |
| Clutch Tri-Fighter | jzfWoZefO4jrwMP5 | clutch-tri-fighter.yml | Role: Interceptor szt1dfLH6V4bltyf | (blank) | -/- | 300/200 | NON-PUBLISHING ROLE | NO EDIT |
| CR90 Corvette | 0S6RxfRRNiswQrya | cr90-corvette.yml | Role: Corvette QV7xhcdNoH8halzL | roleSpecialization | -/- | 400/150 | MISSING BASE ROLE | NO EDIT |
| Crusader XX-777 Prototype Droid Frigate | G0XGdRHTGz8BXfmN | crusader-xx-777-prototype-droid-frigate.yml | Role: Explorer OvgclZ4y1q5WML2y | roleSpecialization | -/- | 250/250 | MISSING BASE ROLE | NO EDIT |
| DeepWater-class Light Freighter | 8X549fFDsnYcpJY7 | deepwater-class-light-freighter.yml | Role: Freighter 31JjWKLxLWEnjbAA | role | -/- | 350/100 | STALE EMBEDDED ROLE | NO EDIT |
| DeepWater-class Light Freighter - Legendary | NdFAYbYXP78V2jqD | deepwater-class-light-freighter-legendary.yml | Role: Freighter 31JjWKLxLWEnjbAA | role | -/- | 400/100 | STALE EMBEDDED ROLE | NO EDIT |
| Delta-7 Aethersprite-class light interceptor | fqQgg2zi7i1ZWjly | delta-7-aethersprite-class-light-interceptor.yml | Role: Interceptor JAzyRBH3KzCuhzU6 | (blank) | -/- | 350/200 | NON-PUBLISHING ROLE | NO EDIT |
| Delta-7 Aethersprite-class light interceptor - Modified | FbzPxDn1FfeRvDym | delta-7-aethersprite-class-light-interceptor-modified.yml | Role: Interceptor JAzyRBH3KzCuhzU6 | role | -/- | 50/-50 | INSUFFICIENT EVIDENCE | NO EDIT |
| DP20 Frigate | NRhEjklvSBU3e1e2 | dp20-frigate.yml | Role: Cruiser NpxDWTCaikWW0Iwu | roleSpecialization | -/- | 400/150 | MISSING BASE ROLE | NO EDIT |
| Droid Tri-Fighter | Twk5AisCbp7TvL9M | droid-tri-fighter.yml | (none) | - | -/- | 300/300 | MISSING BASE ROLE | NO EDIT |
| Dynamic-class light freighter | gawTKA6kzr7qNnnD | dynamic-class-light-freighter.yml | Role: Freighter HZSgtPcTxZoJVKxW | (blank) | -/- | 300/200 | NON-PUBLISHING ROLE | NO EDIT |
| EF76 Nebulon-B Escort Frigate | MBlMVJlmhIjF9IqH | ef76-nebulon-b-escort-frigate.yml | Role: Picket Ship hPR9d0SurUXfVjST | roleSpecialization | -/- | 300/0 | MISSING BASE ROLE | NO EDIT |
| EF76 Nebulon-B Escort Frigate (Medical) | 8uUUatfcGjYMSKZr | ef76-nebulon-b-escort-frigate-medical.yml | Role: Picket Ship SmRAAX8SFDt14PXt | roleSpecialization | -/- | 300/0 | MISSING BASE ROLE | NO EDIT |
| Escape Pod | 2YtJawA2uITnhq6V | escape-pod.yml | Role: Shuttle Bz7uDdJLZKJDymsd | roleSpecialization | -/- | 300/300 | MISSING BASE ROLE | NO EDIT |
| ETA-2 Actis-class Interceptor | kxOYt1pVQc0rh1OP | eta-2-actis-class-interceptor.yml | Role: Interceptor SD65mkoce1gtVgp3 | (blank) | -/- | 300/200 | NON-PUBLISHING ROLE | NO EDIT excluded |
| Executor I-class Star Dreadnought | RMKgV514aBS7LwMo | executor-i-class-star-dreadnought.yml | Role: Warship ZfdETGmnmIaJQIWS | role | -/- | 200/200 | STALE EMBEDDED ROLE | NO EDIT |
| Fang-class | uAzqh6bUJ4ZfKcol | fang-class.yml | Role: Superiority Fighter RsupFng8kQ2mN4wL | role | 400/150 | 450/50 | CORRECT ROLE PUBLICATION | NO EDIT excluded |
| Gand Starfighter | DiyflQC8xEhqvrzp | gand-starfighter.yml | Role: Bomber XjPLikTzuibn7Cbd | roleSpecialization | -/- | 350/250 | MISSING BASE ROLE | NO EDIT excluded |
| GAT-12 Skipray Blastboat | Bgqr4WNQpTzEIepj | gat-12-skipray-blastboat.yml | (none) | - | -/- | 300/200 | MISSING BASE ROLE | NO EDIT excluded |
| HMP Droid Gunship | reNHgyibXInPuEMz | hmp-droid-gunship.yml | Role: Shuttle rMgwICJ0JdiA9Glv | (blank) | -/- | 250/250 | NON-PUBLISHING ROLE | NO EDIT |
| Horizon-class Star Yacht - Legendary | LVFuVcFl4gF7tNoR | horizon-class-star-yacht-legendary.yml | Role: Yacht NKCzhjklp8NVXV8h | role | -/- | 400/350 | STALE EMBEDDED ROLE | NO EDIT |
| Imperial I-class Star Destroyer | eLlCXi97DAtixinm | imperial-i-class-star-destroyer.yml | Role: Battleship mjTL7BRtcGi6vXWJ | (blank) | -/- | 350/100 | NON-PUBLISHING ROLE | NO EDIT |
| K-wing - BTL-S8 | vuT2zQ9MkT4bl9sX | k-wing-btl-s8.yml | Role: Bomber lbPSZPPNil7p3sGd | (blank) | -/- | 300/300 | NON-PUBLISHING ROLE | NO EDIT |
| M12-L Kimogila Heavy Fighter | zEXFY5OjrHTSUdjm | m12-l-kimogila-heavy-fighter.yml | Role: Strike Fighter 7oCOOnClarE5h1nL | (blank) | -/- | 300/250 | NON-PUBLISHING ROLE | NO EDIT |
| M22-T Krayt Gunship | 9pA2rg6Eme3DtR1h | m22-t-krayt-gunship.yml | (none) | - | -/- | 300/250 | MISSING BASE ROLE | NO EDIT |
| M3-A Scyk "Heavy" Fighter | 1r4jBr6JMShi7Uay | m3-a-scyk-heavy-fighter.yml | (none) | - | -/- | 350/200 | MISSING BASE ROLE | NO EDIT |
| M3-A Scyk "TIE Killer" | ZDQ7jvM0EdDgQCoy | m3-a-scyk-tie-killer.yml | Role: Strike Fighter KSvmP8uQ9VAb5lxp | (blank) | -/- | 350/200 | NON-PUBLISHING ROLE | NO EDIT |
| M3-A Scyk Fighter | Gc58wD4Yv0HoMsZW | m3-a-scyk-fighter.yml | Role: Strike Fighter gg50XLuCHnx0fKUs | roleSpecialization | -/- | 350/200 | MISSING BASE ROLE | NO EDIT |
| M4-C Dunelizard Fighter | WTLl7aWFzvM6C5TV | m4-c-dunelizard-fighter.yml | Role: Strike Fighter VhKlzHq1TZsA0ul6 | (blank) | -/- | 350/200 | NON-PUBLISHING ROLE | NO EDIT |
| N-1 Naboo Starfighter | lKELcx2njLSJrP5Q | n-1-naboo-starfighter.yml | Role: Strike Fighter 3TpM5sbRkmgAjjXj | (blank) | -/- | 300/250 | NON-PUBLISHING ROLE | NO EDIT |
| N-1 Naboo Starfighter, Custom | Ug33oVFGY7Qp3ufC | n-1-naboo-starfighter-custom.yml | Role: Strike Fighter XZsfE2Uab4PYy3Bk | (blank) | -/- | 350/150 | NON-PUBLISHING ROLE | NO EDIT |
| Nantex-class Territorial Defense Starfighter | bc83jDYGauWHxSjB | nantex-class-territorial-defense-starfighter.yml | (none) | - | -/- | 350/100 | MISSING BASE ROLE | NO EDIT |
| Probe-Mate Hyperspace Pod | eMVRexg9Xh6wKFUe | probe-mate-hyperspace-pod.yml | (none) | - | -/- | 450/150 | MISSING BASE ROLE | NO EDIT |
| RZ-1 A-wing Interceptor | bE202kqpwHSmKTaI | rz-1-a-wing-interceptor.yml | Role: Interceptor FNNtNwdBeH3blQbk | (blank) | -/- | 400/200 | NON-PUBLISHING ROLE | NO EDIT |
| ST-70 Razor Crest Assault Ship | MsLkNfJG6uHWftYA | st-70-razor-crest-assault-ship.yml | Role: Gunboat iK5J38u5OOuM0K6e | role | -/- | 50/50 | INSUFFICIENT EVIDENCE | NO EDIT |
| ST-70 Razor Crest Assault Ship - Legendary | 0X0Aklqyf02hbyBb | st-70-razor-crest-assault-ship-legendary.yml | Role: Gunboat yqQOGN6AiWjJ5Ngd | role | -/- | 50/50 | INSUFFICIENT EVIDENCE | NO EDIT |
| StarViper Mk. II | CvOvBLzu6qwpXdBM | starviper-mk-ii.yml | Role: Strike Fighter O9CHgOzc65JFbhGf | roleSpecialization | -/- | 350/200 | MISSING BASE ROLE | NO EDIT |
| StarViper-class Attack Platform | O5nM5NhXI4h9WW9P | starviper-class-attack-platform.yml | (none) | - | -/- | 350/200 | MISSING BASE ROLE | NO EDIT |
| StarViper-class Attack Platform - Prototype | JmiBJf3Wa2OcBpte | starviper-class-attack-platform-prototype.yml | Role: Strike Fighter Ha6GXTqZtsiXF2pv | roleSpecialization | -/- | 350/200 | MISSING BASE ROLE | NO EDIT |
| T-65 X-Wing Starfighter | KIYZmULvhfmiOrC2 | t-65-x-wing-starfighter.yml | Role: Strike Fighter zJBEDSrGi0PjgWWY | roleSpecialization | -/- | 300/250 | MISSING BASE ROLE | NO EDIT |
| TIE Advanced x1 | 4LttOGkwmXWfxQhQ | tie-advanced-x1.yml | Role: Strike Fighter RoY1VArOZMSmsKYX | roleSpecialization | -/- | 350/250 | MISSING BASE ROLE | NO EDIT |
| TIE/D Defender | SuqAQa6LsY1hNJnI | tie-d-defender.yml | (none) | - | -/- | 350/250 | MISSING BASE ROLE | NO EDIT |
| TIE/HU Hunter Multi-role Starfighter | xAvg4N6BLjZ1AW8x | tie-hu-hunter-multi-role-starfighter.yml | (none) | - | -/- | 350/250 | MISSING BASE ROLE | NO EDIT |
| TIE/IN Interceptor | ajAHTOE1nFbXxusm | tie-in-interceptor.yml | Role: Strike Fighter ZxCGoh3JEglb0k2B | (blank) | -/- | 350/250 | NON-PUBLISHING ROLE | NO EDIT |
| TIE/LN Starfighter | CyMwaR1CkveFBSb7 | tie-ln-starfighter.yml | Role: Strike Fighter 9RVJh2fz4f8tOIBO | roleSpecialization | -/- | 350/200 | MISSING BASE ROLE | NO EDIT |
| TIE/sa Bomber | Y36w1nGrrDghf1bq | tie-sa-bomber.yml | Role: Bomber LI6pWRK2LS9L1YTO | (blank) | -/- | 350/250 | NON-PUBLISHING ROLE | NO EDIT |
| TIE/sa Bomber (Mine Layer) | PgRFaYvoWARHlfUS | tie-sa-bomber-mine-layer.yml | Role: Bomber B1ilCGzuL6vbpQQz | roleSpecialization | -/- | 350/250 | MISSING BASE ROLE | NO EDIT |
| TIE/sa Bomber (Missile Boat) | Yj3aH9iBLduHKl4q | tie-sa-bomber-missile-boat.yml | Role: Bomber 13VsMnXRW4VFzu0F | (blank) | -/- | 350/250 | NON-PUBLISHING ROLE | NO EDIT |
| TYE-wing | WUJlWDH4enxYeX4n | tye-wing.yml | Role: Bomber W0VI2y88ZGyYkuYz | (blank) | -/- | 300/300 | NON-PUBLISHING ROLE | NO EDIT |
| U-wing Starfighter/Support Craft - UT-60D | 8rxZGWKJJ2XbyhNl | u-wing-starfighter-support-craft-ut-60d.yml | Role: Shuttle N1N52oykBJ5Folkw | roleSpecialization | -/- | 300/200 | MISSING BASE ROLE | NO EDIT |
| V-wing Starfighter - Alpha-3 Nimbus-class | qiAPxTVe39l5Su3w | v-wing-starfighter-alpha-3-nimbus-class.yml | Role: Strike Fighter yDAdS0t2j0tiK69b | (blank) | -/- | 300/200 | NON-PUBLISHING ROLE | NO EDIT |
| VCX-100 light freighter | GWyrReJAN9ByMpoa | vcx-100-light-freighter.yml | Role: Freighter yPpe28ywR6DyomR3 | role | -/- | 300/200 | STALE EMBEDDED ROLE | NO EDIT |
| VCX-100 light freighter, Modified | 474155zgDsAVDg5N | vcx-100-light-freighter-modified.yml | Role: Freighter yPpe28ywR6DyomR3 | role | -/- | 350/150 | STALE EMBEDDED ROLE | NO EDIT |
| VCX-series auxiliary starfighter | DaTKXigeX6pTNsO2 | vcx-series-auxiliary-starfighter.yml | Role: Interceptor uyRRdjE5Gzdh1xdo | role | -/- | 50/50 | INSUFFICIENT EVIDENCE | NO EDIT |
| VT-49 Decimator | 0PlzcuyrY9qaDM4q | vt-49-decimator.yml | Role: Gunboat 90UoJVNE1s77x7pB | role | -/- | 50/100 | INSUFFICIENT EVIDENCE | NO EDIT |
| Vulture Droid - CIS | 8yjv1R0XJQ7QPbmy | vulture-droid-cis.yml | (none) | - | -/- | 350/300 | MISSING BASE ROLE | NO EDIT |
| Wander-class Jump Freighter | otFcy4156sFvukFS | wander-class-jump-freighter.yml | Role: Courier x0ud7Ku4CVdMBeck | (blank) | -/- | 300/200 | NON-PUBLISHING ROLE | NO EDIT |
| Wayfarer-class Medium Transport | edvK3te9EEg9kZcU | wayfarer-class-medium-transport.yml | Role: Gunboat fTXFkx64e099tJOd | (blank) | -/- | 350/200 | NON-PUBLISHING ROLE | NO EDIT |
| X-70B Phantom-class Prototype | CXI1rlrERTsjeoSo | x-70b-phantom-class-prototype.yml | Role: Yacht PdUDYATxSiO9PPm5 | role | -/- | 350/200 | STALE EMBEDDED ROLE | NO EDIT |
| X-ceptor | U7Pstus7Kt5jGaxq | x-ceptor.yml | Role: Interceptor TYIYieTHKqSqkhRR | (blank) | -/- | 350/250 | NON-PUBLISHING ROLE | NO EDIT |
| X-TIE Fighter | Z9GLGFS5bmGEF188 | x-tie-fighter.yml | Role: Strike Fighter maxowxYTHhP6ZJZr | (blank) | -/- | 300/300 | NON-PUBLISHING ROLE | NO EDIT |
| X-Wing Starfighter - Advanced | 1iE0TPVtIaqWPKRH | x-wing-starfighter-advanced.yml | Role: Strike Fighter J6e9J3OH7gLcGc37 | roleSpecialization | -/- | 350/200 | MISSING BASE ROLE | NO EDIT |
| Y-TIE Fighter | 2TkLW4TUmB9mulsx | y-tie-fighter.yml | Role: Strike Fighter 4s2jNzrWpnDiAasN | roleSpecialization | -/- | 250/250 | MISSING BASE ROLE | NO EDIT |
| Y-Wing Starfighter - BTL-B/S3 | lHFf29mWBxshx6HO | y-wing-starfighter-btl-b-s3.yml | Role: Interceptor z9wtDYOxE9rke7OF | (blank) | -/- | 350/250 | NON-PUBLISHING ROLE | NO EDIT |
| YT-1300, Heavily Modified | QqgnknDyNxtsaImK | yt-1300-heavily-modified.yml | Role: Freighter PZD6gJAdnXCCofj3; Role: Freighter EyL27EnUM3jKqVSQ | role | -/- | 350/150 | MULTIPLE ROLE CONFLICT | NO EDIT |
| YT-1300, Modified | t5oz29L2QV5lFlYr | yt-1300-modified.yml | Role: Freighter TWPkOS1qbBm9qs85 | (blank) | -/- | 350/150 | NON-PUBLISHING ROLE | NO EDIT |
| YT-1300f Light Freighter | BZkA48rDJKsKCX3C | yt-1300f-light-freighter.yml | Role: Freighter tL6NzVoptTVl9LDQ | role | -/- | 350/100 | STALE EMBEDDED ROLE | NO EDIT |
| YV-929 Armed Freighter | LY8lY6F9nVqz7Km1 | yv-929-armed-freighter.yml | Role: Freighter 8t3M3oYnzNPb9urY | role | -/- | 300/200 | STALE EMBEDDED ROLE | NO EDIT |
| Z-'ceptor | pzpo8Hny7SqtrP7C | z-ceptor.yml | (none) | - | -/- | 400/250 | MISSING BASE ROLE | NO EDIT |
| Z-95 Headhunter | Y0qIHIctfGjGcgmI | z-95-headhunter.yml | (none) | - | -/- | 350/200 | MISSING BASE ROLE | NO EDIT |
| Z-TIE Fighter | pzL1SI9raUYuSpv8 | z-tie-fighter.yml | (none) | - | -/- | 350/250 | MISSING BASE ROLE | NO EDIT |

### Implementation

No source edit. No pack rebuild. Foundry was running, and a rebuild was not required.

### Status

Role publication inventory recorded. No actor passed the repair gates. No commit. No push.

---

## Addendum — 2026-11-16 — Stale Freighter, Yacht, and Warship identity

### Reason

The 12 subtype-`role` embeddings whose source ids do not resolve were checked against the current Freighter, Yacht, and Warship documents. Equivalence was not treated as lineage.

### Supersedes

Nothing above is removed. The earlier `STALE EMBEDDED ROLE` label stays as the inventory class. This addendum adds the identity result.

### Read-only identity

Current fingerprints, with no Activities:

- Freighter `QY7jBe7EgKLz8z1p`, medium, subtype `role`. Before and after `0da62ca1d` the id is the same. Before that commit the only change is Constitution +1, mode 2, priority 1. After it, space 300 and turn 150, mode 5, priority 20. The rules heading is Freighter.
- Yacht `dfqRcgIokd6o0G0A`, medium, subtype `role`. Same history shape. Ability is Charisma +1. After `0da62ca1d`, space 350 and turn 200. The rules heading is Yacht.
- Warship `72graKov2mme5CB0`, gargantuan, subtype `role`. Abilities are Wisdom +1 and Strength +1. After `0da62ca1d`, space 200 and turn 500. The rules heading on this document is Flagship, not Warship.

At `124dca632` the embeddings already pointed at `Compendium.sw5e.starshipfeatures`, not at `sw5e-module.starships`. The ids were `VdHmWXHvkK5ZyoWw` (Freighter), `U1S8haQSb90YulZq` (Yacht), and `uokunSKATOfWwOP9` (Warship). Those ids are not document `_id` values anywhere in that commit, and they are not the current Role ids. `fb63553d6` rewrote the pointer string to `Compendium.sw5e-module.starships.<same stale id>`. That rewrite did not make the stale id the current document. `0da62ca1d` added movement to the current documents and left their ids unchanged. The shared effect id `qQTMHDrpIch61Q7C` is not identity.

The embedded changes still match the pre-movement ability row: Freighter Constitution +1, Yacht Charisma +1, Warship Wisdom +1 and Strength +1. None has a movement change, an Activity, or a second effect. The Freighter and Yacht rules headings match those names. The Executor embedding's heading is Warship, while the current Warship document's heading is Flagship.

That is a structural match to the pre-movement shape, plus a source pointer from a different compendium. It does not prove the embedding was copied from the current document. No embedding is `CONFIRMED STALE CANONICAL COPY`.

| Actor | ID | Role item | Stale UUID | Candidate | Class | Action |
| --- | --- | --- | --- | --- | --- | --- |
| A-Z-Z-3 Light Freighter | `Ec0jtuoGKx6dPdXL` | `8WM96RjJKxq4v5EZ` | `VdHmWXHvkK5ZyoWw` | Freighter `QY7jBe7EgKLz8z1p` | PROBABLE STALE COPY | NO EDIT |
| AIAT/i Gunship | `EAiaXORMgRRDVsz9` | `ReQ4aQ33Dw9VK5EV` | `VdHmWXHvkK5ZyoWw` | Freighter `QY7jBe7EgKLz8z1p` | PROBABLE STALE COPY | NO EDIT |
| DeepWater-class Light Freighter | `8X549fFDsnYcpJY7` | `31JjWKLxLWEnjbAA` | `VdHmWXHvkK5ZyoWw` | Freighter `QY7jBe7EgKLz8z1p` | PROBABLE STALE COPY | NO EDIT |
| DeepWater-class Light Freighter - Legendary | `NdFAYbYXP78V2jqD` | `31JjWKLxLWEnjbAA` | `VdHmWXHvkK5ZyoWw` | Freighter `QY7jBe7EgKLz8z1p` | PROBABLE STALE COPY | NO EDIT |
| VCX-100 light freighter | `GWyrReJAN9ByMpoa` | `yPpe28ywR6DyomR3` | `VdHmWXHvkK5ZyoWw` | Freighter `QY7jBe7EgKLz8z1p` | PROBABLE STALE COPY | NO EDIT |
| VCX-100 light freighter, Modified | `474155zgDsAVDg5N` | `yPpe28ywR6DyomR3` | `VdHmWXHvkK5ZyoWw` | Freighter `QY7jBe7EgKLz8z1p` | PROBABLE STALE COPY | NO EDIT |
| YT-1300f Light Freighter | `BZkA48rDJKsKCX3C` | `tL6NzVoptTVl9LDQ` | `VdHmWXHvkK5ZyoWw` | Freighter `QY7jBe7EgKLz8z1p` | PROBABLE STALE COPY | NO EDIT |
| YV-929 Armed Freighter | `LY8lY6F9nVqz7Km1` | `8t3M3oYnzNPb9urY` | `VdHmWXHvkK5ZyoWw` | Freighter `QY7jBe7EgKLz8z1p` | PROBABLE STALE COPY | NO EDIT |
| Baudo-class Star Yacht - Modified | `IbM8uXHEpvvdf0TN` | `VHtmsBGq3mQy2sGk` | `U1S8haQSb90YulZq` | Yacht `dfqRcgIokd6o0G0A` | PROBABLE STALE COPY | NO EDIT |
| Horizon-class Star Yacht - Legendary | `LVFuVcFl4gF7tNoR` | `NKCzhjklp8NVXV8h` | `U1S8haQSb90YulZq` | Yacht `dfqRcgIokd6o0G0A` | PROBABLE STALE COPY | NO EDIT |
| X-70B Phantom-class Prototype | `CXI1rlrERTsjeoSo` | `PdUDYATxSiO9PPm5` | `U1S8haQSb90YulZq` | Yacht `dfqRcgIokd6o0G0A` | PROBABLE STALE COPY | NO EDIT |
| Executor I-class Star Dreadnought | `RMKgV514aBS7LwMo` | `ZfdETGmnmIaJQIWS` | `uokunSKATOfWwOP9` | Warship `72graKov2mme5CB0` | AMBIGUOUS ROLE IDENTITY | NO EDIT |

Counts: confirmed stale copy 0, confirmed custom 0, probable stale copy 11, ambiguous 1, not the current Role 0.

Current prepared movement stays on the stored value plus mode 2 deltas, because nothing publishes. External Docking System adds turn +50 and fly -50 on both VCX-100 actors, the modified Baudo yacht, and YT-1300, Heavily Modified. The fly add is discarded. A hypothetical Freighter publication of 300/150 would then prepare turn 200 on those docking ships and would change space on the ships whose stored space is not 300. That simulation was not saved. Abilities would not change, because the ability row is already present. Source UUIDs were not rewritten.

### Actor-level mode 5

None of these changes is consumed. Preparation does not publish actor mode 5, and fly is forced to 0.

- HMP `reNHgyibXInPuEMz`, effect `4WAAiMXDrFy2MipW`: turn 400. Prepared turn stays 250. The value is not the workbook turn of 100 and not a current Role value. Origin unresolved.
- VT-49 `0PlzcuyrY9qaDM4q`, effect `XLUqHYCqcIgHhklz`: fly 300 and turn 200. Prepared turn is 100 because stored turn is 50 and another effect adds +50. Origin unresolved. Gunboat is not a current canonical Role.
- YV-929 `LY8lY6F9nVqz7Km1`, effect `OpwEjg658THj3164`: fly 350 and turn 300. Prepared movement stays 300/200. Adding Freighter publication would put a second mode 5 controller on turn. Origin unresolved, so YV-929 stays blocked even though its Role shape is a probable match.
- YT-1300, Heavily Modified `QqgnknDyNxtsaImK`, effect `qSl5ltd7udAKjzBX`: fly 400 and turn 150. Prepared turn is 150 from stored 100 plus docking +50. The actor turn 150 is the same number a Freighter override would publish, but that is not proof it was copied from the Role.

### YT-1300, Heavily Modified

`PZD6gJAdnXCCofj3` and `EyL27EnUM3jKqVSQ` are duplicate base Roles. Both are subtype `role`, both point at `VdHmWXHvkK5ZyoWw`, and both add only Constitution +1. Neither is a specialization. Publication uses the first Role item that publishes and then stops, so giving both the same override would publish `PZD6gJAdnXCCofj3` and leave two mode 5 controllers, plus the actor turn controller. Giving the override to only one item leaves the other duplicate and the actor controller. The actor was not repaired.

### Implementation

No source file was edited. No canonical Role was edited. No pack was rebuilt. Foundry was running, and a rebuild was not required.

### Status

Identity check recorded. No candidate was a confirmed copy of the current Role. No commit. No push.

---

## Addendum — 2026-11-17 — Legacy starshipfeatures Role recovery

### Reason

The three stale ids were recovered from the discontinued system repository https://github.com/sw5e-foundry/sw5e. A full clone is at `C:\Users\ckauble\AppData\Local\Temp\sw5e-legacy-system`. Raw matching lines are at `C:\Users\ckauble\AppData\Local\Temp\sw5e-legacy-role-recovery`.

### Supersedes

The statement above that these ids were never document ids. That was true inside this module repository. It is not true in the discontinued system. The earlier text stays.

### Recovered documents

Pack name `starshipfeatures`, label Starship Features, entity Item. First record: commit `4cb468ae4` (2021-12-23), path `packs/packs/starshipfeatures.db`, declared in `system.json`. Last record of the documents themselves: commit `5f519f0d1` (2023-03-15), same path, system version `2.1.4.2.4.0`, core `10.291`. By `fbe2b581f` (2023-05-26) the NeDB file is gone. Later hits are Drake actor pointers only. No commit in that repository rewrites these ids into `QY7jBe7EgKLz8z1p`, `dfqRcgIokd6o0G0A`, or `72graKov2mme5CB0`.

The mechanical content does not change between the first and last pack copies. The schema does. There is no movement change and no Activity in either copy. Effect id `qQTMHDrpIch61Q7C`, disabled false, transfer true.

| ID | Name | Size | First schema | Last schema | Ability |
| --- | --- | --- | --- | --- | --- |
| `VdHmWXHvkK5ZyoWw` | Role: Freighter | Medium | type `starshipfeature`, key `data.abilities.con.value` | type `feat`, subtype blank, key `system.abilities.con.value` | Constitution +1, mode 2, priority 1 |
| `U1S8haQSb90YulZq` | Role: Yacht | Medium | type `starshipfeature`, key `data.abilities.cha.value` | type `feat`, subtype blank, key `system.abilities.cha.value` | Charisma +1, mode 2, priority 1 |
| `uokunSKATOfWwOP9` | Role: Warship | Gargantuan | type `starshipfeature`, Wisdom and Strength on `data.abilities` | type `feat`, subtype blank, keys `system.abilities.wis.value` and `system.abilities.str.value` | Wisdom +1 and Strength +1, mode 2, priority 1 |

Each description says that at tier 0 the ship adopts a style, then names Freighter, Yacht, or Warship and states the ability bonus above. The Warship heading is Warship. Image paths are `systems/sw5e/packs/Icons/Starship Features/Medium.webp` or `Gargantuan.webp`.

### Relationship to the current Roles

Classification for all three: `LEGACY PREDECESSOR WITH EXPECTED SCHEMA MIGRATION`.

The current Freighter `QY7jBe7EgKLz8z1p` and Yacht `dfqRcgIokd6o0G0A` keep the same size, the same ability, and the same rules sentence. They add subtype `role` and the mode 5 movement from `0da62ca1d`: Freighter 300/150, Yacht 350/200. Those movement keys are not in the legacy documents. The key rename from `data.abilities` to `system.abilities` and the type rename from `starshipfeature` to `feat` are schema migration.

The current Warship `72graKov2mme5CB0` keeps Gargantuan, Wisdom +1, and Strength +1, and adds space 200 and turn 500. Its current rules heading says Flagship. The recovered document says Warship. That heading difference is on the current file. It does not make the recovered document a different role.

### Embeddings

The 12 Drake embeddings can now be confirmed as copies of these recovered pack documents. Their ability changes and the absence of movement match the last legacy copy, and their original pointer was `Compendium.sw5e.starshipfeatures.<id>`. They are not confirmed copies of the current module document ids. No embedding was edited. YV-929 still has an unresolved actor-level mode 5 turn, and YT-1300, Heavily Modified still has two Freighter items. Those blocks remain.

### Implementation

No actor, canonical item, pack, workbook, world, or archive was modified. The temporary clone was not checked out onto another commit. No pack was rebuilt. No commit. No push.

### Status

Legacy documents recovered. Identity is a schema-migrated predecessor, not an id-preserving rewrite. No Drake repair. No commit. No push.

---

## Addendum — 2026-11-17 — Legacy-to-current Role migration

### Reason

The recovered `starshipfeatures` documents were tested as a migration map to the current module Roles, and movement publication was simulated for the 12 embeddings.

### Supersedes

The earlier statement that `VdHmWXHvkK5ZyoWw`, `U1S8haQSb90YulZq`, and `uokunSKATOfWwOP9` were never documents. That sentence stays in the chronology. The recovered pack records supersede it: those ids are the Freighter, Yacht, and Warship documents in `packs/packs/starshipfeatures.db`.

The status above that says no Drake repair was made. That status stays as the record before this migration edit.

### Migration proof

| Legacy | Current | Class |
| --- | --- | --- |
| Freighter `VdHmWXHvkK5ZyoWw`, Medium, Constitution +1, no movement | `QY7jBe7EgKLz8z1p`, Medium, Constitution +1, space 300 and turn 150 mode 5 | CONFIRMED LEGACY-TO-CURRENT MIGRATION |
| Yacht `U1S8haQSb90YulZq`, Medium, Charisma +1, no movement | `dfqRcgIokd6o0G0A`, Medium, Charisma +1, space 350 and turn 200 mode 5 | CONFIRMED LEGACY-TO-CURRENT MIGRATION |
| Warship `uokunSKATOfWwOP9`, Gargantuan, Wisdom +1 and Strength +1, no movement | `72graKov2mme5CB0`, Gargantuan, Wisdom +1 and Strength +1, space 200 and turn 500 mode 5 | CONFIRMED LEGACY-TO-CURRENT MIGRATION |

The only mechanical addition on the current documents is the mode 5 movement from `0da62ca1d`, plus subtype `role` and the `system.abilities` key names. Flagship is a different Role: Charisma +1 and Wisdom +1, with the same 200/500 movement numbers. The current Warship effect and ability sentence are Wisdom and Strength. Its heading says Flagship. That heading is a title mismatch, not a mechanical replacement, so Executor uses the Warship movement and keeps its Warship description.

### Source-pointer policy

Policy A. This repository has no successor-rebinding convention for item source pointers. `flags.core.sourceId` and `_stats.compendiumSource` stay on the legacy ids. No provenance field was created.

### Simulations and blocks

Prepared movement is the published Role value plus intentional mode 2 turn adds. Fly adds are discarded. Abilities on these Role items were not changed.

| Actor | Item | Published | Prepared | Action |
| --- | --- | --- | --- | --- |
| A-Z-Z-3 | `8WM96RjJKxq4v5EZ` | 300/150 | 300/150 | edited |
| AIAT/i | `ReQ4aQ33Dw9VK5EV` | 300/150 | 300/150 | edited |
| DeepWater | `31JjWKLxLWEnjbAA` | 300/150 | 300/150 | edited |
| DeepWater Legendary | `31JjWKLxLWEnjbAA` | 300/150 | 300/150 | edited |
| VCX-100 | `yPpe28ywR6DyomR3` | 300/150 | 300/200 | edited |
| VCX-100 Modified | `yPpe28ywR6DyomR3` | 300/150 | 300/200 | edited |
| YT-1300f | `tL6NzVoptTVl9LDQ` | 300/150 | 300/150 | edited |
| YV-929 | `8t3M3oYnzNPb9urY` | none | 300/200 | blocked |
| Baudo Modified | `VHtmsBGq3mQy2sGk` | 350/200 | 350/250 | edited |
| Horizon Legendary | `NKCzhjklp8NVXV8h` | 350/200 | 350/200 | edited |
| X-70B | `PdUDYATxSiO9PPm5` | 350/200 | 350/200 | edited |
| Executor | `ZfdETGmnmIaJQIWS` | 200/500 | 200/500 | edited |

VCX-100, VCX-100 Modified, and Baudo Modified keep External Docking System turn +50. Its rules text says turning speed increases by 50 feet while a ship is coupled. That add stays. Courier and Freighter specialization fly +50 changes, and DeepWater's amphibious swim formula, stay and do not change space or turn. These prepared numbers are Role publication. They are not workbook totals.

YV-929 stays blocked. Actor effect `OpwEjg658THj3164` overrides fly 350 and turn 300. Preparation does not consume it, and that does not explain its origin or disposition. YT-1300, Heavily Modified stays out of this edit. It has two subtype-`role` Freighter items.

### Implementation

Eleven embedded Role effects gained the successor mode 5 space and turn changes. Item ids, ability changes, descriptions, specializations, equipment, and legacy source UUIDs were kept. Canonical Role files were not edited. No pack was rebuilt. Foundry is running.

### Status

Migration map confirmed. Eleven embeddings now publish Role movement. YV-929 and YT-1300, Heavily Modified remain blocked. No commit. No push.

---

## Addendum — 2026-11-17 — Drake Role movement live validation

### Reason

Foundry was restarted after `npm run build:db -- drakes-shipyard` exited 0. Fresh imports of the 11 repaired actors were checked in the world Vanilla.

### Supersedes

The implementation note above that says the pack was not rebuilt and Foundry was running. That note stays as the record before the build.

### Validation

Login was Curso with a blank password. Each import came from `Compendium.sw5e-module.drakes-shipyard.Actor.<repaired id>`. Existing world actors were not opened or updated. All 11 passed prepared movement, fly 0, walk 0, one subtype-`role` publisher, the legacy source pointer, and a single copy of the original ability change.

| Actor | Published | Prepared | Result |
| --- | --- | --- | --- |
| A-Z-Z-3 `Ec0jtuoGKx6dPdXL` | 300/150 | 300/150 | PASS |
| AIAT/i `EAiaXORMgRRDVsz9` | 300/150 | 300/150 | PASS |
| DeepWater `8X549fFDsnYcpJY7` | 300/150 | 300/150 | PASS |
| DeepWater Legendary `NdFAYbYXP78V2jqD` | 300/150 | 300/150 | PASS |
| YT-1300f `BZkA48rDJKsKCX3C` | 300/150 | 300/150 | PASS |
| VCX-100 `GWyrReJAN9ByMpoa` | 300/150 | 300/200 | PASS |
| VCX-100 Modified `474155zgDsAVDg5N` | 300/150 | 300/200 | PASS |
| Horizon Legendary `LVFuVcFl4gF7tNoR` | 350/200 | 350/200 | PASS |
| X-70B `CXI1rlrERTsjeoSo` | 350/200 | 350/200 | PASS |
| Baudo Modified `IbM8uXHEpvvdf0TN` | 350/200 | 350/250 | PASS |
| Executor `RMKgV514aBS7LwMo` | 200/500 | 200/500 | PASS |

The sheet showed those prepared speeds for A-Z-Z-3, VCX-100, Horizon Legendary, Baudo Modified, and Executor. External Docking System supplied the extra turn +50 only on the two VCX actors and Baudo Modified. After close, reopen, and one browser reload, those five still had the same prepared movement. No console error or warning was recorded for import, Active Effects, Role publication, or starship preparation. The legacy source ids remain on the Role items and are not current document ids; no console message reported that during import.

The 11 temporary actors were deleted. YV-929 and YT-1300, Heavily Modified were not imported.

### Status

Live validation passed for the 11 repaired actors. Temporary actors removed. No commit. No push.

---

## Addendum — 2026-11-17 — YV-929 movement origin

### Reason

YV-929 was the remaining Freighter embedding. Actor effect `OpwEjg658THj3164` overrides fly 350 and turn 300, and those changes were not removed just because the current preparation ignores them.

### Supersedes

Nothing above is deleted. The block on YV-929 stays until a proven disposition exists.

### Current reconstruction

Actor `LY8lY6F9nVqz7Km1` in `packs/_source/drakes-shipyard/yv-929-armed-freighter.yml`. Tier 2, size Medium. Stored movement is space 300, turn 200, fly 300, walk 30. Role: Freighter `8t3M3oYnzNPb9urY` is subtype `role`, source `VdHmWXHvkK5ZyoWw`, and its only effect change is Constitution +1. It does not publish movement. Nimble Starship has no effect. No equipment item changes space or turn.

`resolveStarshipMovementBase` therefore selects the stored base, space 300 and turn 200. There is no mode 2 space or turn add. Prepared movement is 300/200, and preparation forces fly and walk to 0. The actor overrides do not supply that base.

### Workbook

`SotG.xlsx` has no YV-929 worksheet. The sheet names were read from `xl/workbook.xml`. There is no formula to use, and the workbook is not repair authority.

### Historical origin

The effect first appears in the discontinued system at `fbe2b581f` (2023-05-26), `module/documents/actor/actor.mjs` and `packs/drakes-shipyard/yv-929-armed-freighter.json`. Its original keys are `system.attributes.movement.space` 350 and `system.attributes.movement.turn` 300, both mode 5. Stored movement at that commit is space 0, turn 0, and fly 0. The role subtype is blank, and the role effect is only Constitution +1.

At that commit, `Actor5e.prepareDerivedData` calls `_prepareStarshipData` after `applyActiveEffects`. The starship sheet `_getMovementSpeed` reads `movement.space` as the displayed flying speed and `movement.turn` as turning speed. `_prepareStarshipData` replaces those two fields only when an item has subtype `role`. YV-929 had none, so the actor overrides remained. The old sheet consumed space 350 and turn 300. `movement.fly` was not the displayed flying-speed field, and `movement.space` already existed.

Commit `7f5fe110b` (2026-04-17), "Update starship data: movement and asset paths," renamed effect keys from `system.attributes.movement.space` to `system.attributes.movement.fly` across the starship packs. YV-929's 350 moved with that rename. Turn 300 stayed on `movement.turn`. The current module then prepares flying speed from `movement.space` and forces fly to 0, so the renamed 350 is no longer consumed.

### Simulations

The base below is the value selected before mode 2 additions. Mode 2 space and turn adds are 0 in every state. Fly and walk are prepared as 0. Stored abilities stay 13, 10, 13, 13, 14, 11, and the Role still adds Constitution +1 once. No state changes an ability.

| State | Base before mode 2 | Prepared space/turn | Notes |
| --- | --- | --- | --- |
| A. Current | stored 300/200 | 300/200 | No Role publication. Fly 350 and turn 300 are not the base. |
| B. Add Freighter 300/150 and keep both overrides | published 300/150 | 300/150 | Turn is controlled by both the Role 150 and the actor 300. |
| C. Add Freighter and remove only fly | published 300/150 | 300/150 | Same turn conflict. Fly never entered the base. |
| D. Add Freighter and remove only turn | published 300/150 | 300/150 | One turn controller. Fly 350 remains unused. |
| E. Add Freighter and remove both | published 300/150 | 300/150 | Clean publication. It does not restore the historically displayed 350/300. |
| F. Add Freighter and put 350 back on space | published 300/150 | 300/150 | The Role still publishes 300, so the restored 350 competes and does not win. |
| G. Move the change to an embedded owner | not simulated |  | No equipment or specialization text identifies an owner for 350 or 300. |

### Classification

- Fly 350: `MIGRATION ARTIFACT`. The consumed historical value was space 350. The fly key comes from `7f5fe110b`. It is not classified as legacy schema movement merely because a fly value is stored now.
- Turn 300: `HULL-SPECIFIC MOVEMENT`. It was the turning speed the old sheet displayed. It is not the current Freighter turn of 150, and no same-configuration worksheet chooses between them.

### Repair decision

No source edit. The Freighter migration itself remains valid, but the historically consumed result is space 350 and turn 300, while the current Freighter publication is 300/150. There is no worksheet to choose. Removing the actor changes, or leaving turn 300 beside a new Role override, does not produce one proven result. No rebuild was requested.

### Status

YV-929 remains blocked. No source edit. No pack rebuild. No commit. No push.

---

## Addendum — 2026-11-17 — YT-1300 Heavily Modified duplicate Roles

### Reason

The actor has two Freighter items and an actor movement effect. This pass determines whether either item, or either movement value, has a proven disposition before any publication edit.

### Supersedes

Nothing. The Freighter migration and the YV-929 finding above remain.

The superseded content above is retained as historical evidence and must not be deleted.

### Current actor

`packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml`, actor `QqgnknDyNxtsaImK`.

Stored abilities are Strength 14, Dexterity 14, Constitution 13, Intelligence 10, Wisdom 12, and Charisma 10. Stored movement is space 350, turn 100, and fly 350.

| Owner | Key | Mode | Value | Disposition |
| --- | --- | --- | --- | --- |
| Freighter `PZD6gJAdnXCCofj3` | Constitution | 2 | +1 | transfers; first in the item array |
| Freighter `EyL27EnUM3jKqVSQ` | Constitution | 2 | +1 | transfers; second in the item array |
| Actor `qSl5ltd7udAKjzBX` | fly | 5 | 400 | discarded by current preparation |
| Actor `qSl5ltd7udAKjzBX` | turn | 5 | 150 | does not become the base, because it is not a Role publication |
| Actor `qSl5ltd7udAKjzBX` | Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma | 2 | +2, +1, −1, +1, +1, +1 | ability changes on the same effect |
| External Docking System `oNTy7MIekNBGMzmK` | turn | 2 | +50 | retained equipment change |
| External Docking System | fly | 2 | −50 | discarded |

No Role Spec has a movement or Constitution change. Medium Starship has no Constitution change. Current preparation uses stored space 350 and stored turn 100, then adds the docking +50. Prepared movement is space 350, turn 150, fly 0, and walk 0.

Both Freighter items are subtype `role`, point at `Compendium.sw5e-module.starships.VdHmWXHvkK5ZyoWw`, and contain only Constitution +1. Their names, descriptions, effects, and source pointers match. Their document ids differ. Array order is not evidence that the first item is the intended base Role.

### Constitution layers

The current prepared Constitution is not an authority, because both Role changes contribute to it. The separable layers are stored Constitution 13, no Size change, Role `PZD6gJAdnXCCofj3` +1, Role `EyL27EnUM3jKqVSQ` +1, actor effect −1, and no equipment Constitution change. No workbook gives an independent final total. Removing either Role would change the total by 1, but there is no known total to match.

### History

Both item ids and effect `qSl5ltd7udAKjzBX` are present together in the discontinued system at `fbe2b581f` and in this module at `124dca632`. Neither item was added later. Both point at the same legacy Freighter document. In the system snapshot their subtype is blank. In the module's first copy their subtype is `role`. That is a schema difference between the two snapshots, not a second creation event.

The old preparation assigns movement from a Role only when exactly one item has subtype `role`. With two Role items, or with none because the subtype is blank, it leaves the actor effect in place. At both snapshots that effect is space 400 and turn 150, and the old sheet reads space as flying speed and turn as turning speed. The old sheet therefore consumed 400 and 150.

Commit `7f5fe110b` includes this actor. Its parent has `movement.space` 400. The commit changes that key to `movement.fly` 400 and leaves turn 150. The current module discards fly.

Stored space 350 and turn 100 are present from the YAML conversion `fb63553d6`. They are not the values the old effect displayed.

### Authority

`SotG.xlsx` has no worksheet for YT-1300, Heavily Modified. YT-1300f and a generic Freighter were not used as substitutes.

### Classification

- `PZD6gJAdnXCCofj3`: `INSUFFICIENT EVIDENCE` to call it the sole legitimate base Role. It is one of two copies of the same legacy Freighter.
- `EyL27EnUM3jKqVSQ`: `INSUFFICIENT EVIDENCE` to call it disposable. It is the other copy, and array position is not identity.
- Fly 400: `MIGRATION ARTIFACT`. The consumed historical value was space 400.
- Turn 150: `HULL-SPECIFIC MOVEMENT`. The old sheet displayed it. It matches the current Freighter turn numerically, but that match does not identify its owner.

### Simulations

Mode 2 turn addition is +50 from External Docking System. Space addition is 0.

| State | Base before mode 2 | Prepared space / turn | Structural result |
| --- | --- | --- | --- |
| A. Current | stored 350 / 100 | 350 / 150 | two unexplained base Roles and two Constitution +1 changes |
| B. Publish both | first publisher 300 / 150 | 300 / 200 | still two base Roles; second publication is redundant |
| C. Publish only the first | 300 / 150 | 300 / 200 | second Role and its Constitution +1 remain |
| D. Publish only the second | 300 / 150 | 300 / 200 | first Role and its Constitution +1 remain |
| E. Keep one and remove the other | 300 / 150 if the survivor publishes | 300 / 200 | one Role, but no independent Constitution total |
| F. Convert the other | not simulated |  | no proven destination type |
| G. Keep both actor movement changes | published 300 / 150 | 300 / 200 | actor turn competes with the Role |
| H. Remove fly only | 300 / 150 | 300 / 200 | historical 400 is not restored |
| I. Remove turn only | 300 / 150 | 300 / 200 | fly 400 remains unused |
| J. Remove both movement changes | 300 / 150 | 300 / 200 | ability changes on the same effect must remain |
| K. Restore space 400 and publish the Role | published 300 / 150 | 300 / 200 | 400 competes and does not win |

State B is invalid even though it produces a number. A matching speed does not authorize two base Roles or two Constitution bonuses.

### Repair decision

No source edit. Both items have the same origin, but neither has a proven sole purpose. The Constitution total is not independently known. The historical consumed movement is 400/150, while the current Freighter publication is 300/150, and there is no worksheet to choose. The actor effect also carries ability changes, so it cannot be removed as a movement-only cleanup. No rebuild was requested.

### Status

YT-1300, Heavily Modified remains blocked. No source edit. No pack rebuild. No commit. No push.

---

## Addendum — 2026-11-17 — Role-named non-publishers

### Reason

The earlier inventory left 32 Drake actors whose `Role:` item does not have subtype `role`. This pass recovers the exact legacy document for each item and edits only a base Role that passes every repair gate.

### Supersedes

Nothing. Fang, the 11 live-validated Freighter, Yacht, and Warship embeddings, YV-929, and YT-1300, Heavily Modified remain as recorded above.

The superseded content above is retained as historical evidence and must not be deleted.

### Frozen inventory

All 87 Drake actors were parsed again with the saved classifier in `C:\Users\ckauble\AppData\Local\Temp\sw5e-role-publication\inventory.mjs`. The regenerated `role-named-subtype-not-role` actor set matches the saved 32 ids. There are no additions and no omissions. Those 32 actors contain 32 qualifying `Role:` items, all with a blank subtype. No repaired actor also held a separate qualifying item, so the overlap rule did not add anyone.

Actors whose every Role-named item is a Role Spec or subtype `roleSpecialization` stay in the separate `role-spec-only` group. They are not part of this 32. Gand remains in that other group.

The freeze is outside the repository at `C:\Users\ckauble\AppData\Local\Temp\sw5e-role-named-32\`.

### How the old runtime identified a Role

At legacy commit `5f519f0d1`, starship movement preparation did not select a Role by subtype. With `oldStarshipMovement` off, it left stored movement. With that setting on, it used the size base speeds. Both `Role:` and `Role Spec:` documents stored type `feat` (earlier `starshipfeature`), feature type `starship`, and a blank subtype. The base Role was identified by the `Role:` name, the tier 0 sentence, and an ability-score effect. A specialization was identified by the `Role Spec:` name, the tier 2 sentence, and a `details.role` effect. Later discontinued-system code selects movement only from subtype `role` and from item speed fields. These recovered documents have neither. A blank subtype was the old schema. It is a migration defect only where the document is a base Role and the module never wrote subtype `role`.

### Recovered identities

All 11 source ids were recovered from `packs/packs/starshipfeatures.db` at `4cb468ae4` and `5f519f0d1`. None is a current module document id. Raw copies are under `C:\Users\ckauble\AppData\Local\Temp\sw5e-role-named-32\recovered\`.

| Legacy id | Recovered document | Movement on that document | Current successor |
| --- | --- | --- | --- |
| `VdHmWXHvkK5ZyoWw` | Role: Freighter, Constitution +1 | none | `QY7jBe7EgKLz8z1p`, space 300, turn 150. Confirmed by the earlier migration of this same id. |
| `U1S8haQSb90YulZq` | Role: Yacht, Charisma +1 | none | `dfqRcgIokd6o0G0A`, space 350, turn 200. Confirmed by the earlier migration of this same id. |
| `jgF0iBtvzesRwiTs` | Role: Gunboat, Strength +1 | none | none. Current Role: Gunship `NZi3USVLbUTO2CNg` is a different name. |
| `36dTmDP0uGACXGdi` | Role: Interceptor, Dexterity +1 | none | none. No current Interceptor document. |
| `BXnWIl4JqYhabKOG` | Role: Battleship, Wisdom +1 and Strength +1 | none | not confirmed. Current Role: Battleship `wd8brjtWiB4As1x4` has the same ability bonuses and publishes 200/400, but no migration links the ids. |
| `d1gzEqho7W1pNVN8` | Role Spec: Bomber | none | not a base Role |
| `4Rdl3p0fg55B7VZP` | Role Spec: Shuttle | none | not a base Role |
| `B5L1PCdWLWoedo7g` | Role Spec: Cruiser | none | not a base Role |
| `rr9JZdItlbpvsVyr` | Role Spec: Explorer | none | not a base Role |
| `orciEjuUBSjF05Ny` | Role Spec: Strike Fighter | none | not a base Role |
| `sp5NlnjG1oX34pDp` | Role Spec: Courier, fly +50 | specialization fly add | not a base Role |

The legacy base Role: Strike Fighter is a different document, `nE5oQmhOrK0Coirv`, Strength +1, with no movement and no current canonical file. It is not one of the 32 embeddings. No canonical Role was created.

### Classifications

- Confirmed specialization: 19. The embedded name says `Role:`, and the source document says `Role Spec:`.
- Missing subtype on a proven base Role with a confirmed successor: 4. Three Freighters and one Yacht.
- Legacy base Role with no current successor: 7. Two Gunboats, four Interceptors, and one Battleship.
- Variant mismatch: 2. Delta-7 and ETA-2. Both workbook sheets for Delta-7, and the ETA-2 sheet, select Superiority Fighter.

For every no-successor row: historical movement is absent from the legacy document, not merely unpublished. A current canonical document is not the only missing piece, because the legacy item also has no movement profile. An actor-local copy would diverge across ships that share the legacy id. No actor-local publication was made.

### Actor conflicts and the one simulation that passes

Same-configuration worksheets exist for Dynamic-class, AEG-77, Aka'jor, both Arquitens, Baleen, Delta-7, Modified Delta-7, ETA-2, and HMP. No worksheet was used for a different variant. Barloz, Baudo-class, YT-1300 Modified, Wayfarer, the Imperial Star Destroyer, and the remaining Interceptors have no exact worksheet in `SotG.xlsx`.

Dynamic-class Light Freighter, actor `gawTKA6kzr7qNnnD`, item `HZSgtPcTxZoJVKxW`, is Medium, tier 1, and the only Role item. The worksheet separates base 14/14/13/10/12/10, Strength ASI +1, Constitution ASI +1, no Size adjustment, and Freighter Constitution +1. Its totals are 15/14/15/10/12/10. Fly speed is 300 and turn speed is 150. The actor's prepared abilities already match those totals. There is no actor, equipment, or specialization movement change.

| State | Base before mode 2 | Prepared space / turn | Result |
| --- | --- | --- | --- |
| A. Current | stored 300 / 200 | 300 / 200 | does not match the sheet turn of 150 |
| B. Subtype only | stored 300 / 200 | 300 / 200 | still no publication |
| C. Historical movement | none stored on the legacy Role | 300 / 200 | the legacy Role defines no speed |
| D. Subtype plus Freighter 300 / 150 | published 300 / 150 | 300 / 150 | matches the sheet; one base Role; abilities unchanged |

The other three proven Freighter or Yacht embeddings do not pass. Barloz would change turn 200 to 150, YT-1300 Modified would change space 350 to 300, and Baudo-class would change space 300 to 350. None has its own worksheet. AEG-77's sheet says Gunship, not Gunboat, and Wayfarer also has an actor turn +50. Delta-7 and ETA-2 contradict their sheets. HMP, Aka'jor, both Arquitens, and Baleen point at specialization documents even where the sheet names a base Role. Those pointers were not rebound.

### Repair

`packs/_source/drakes-shipyard/dynamic-class-light-freighter.yml` only. Item `HZSgtPcTxZoJVKxW` keeps its id, Constitution +1, and legacy pointer `VdHmWXHvkK5ZyoWw`. Its subtype is now `role`, and the same effect publishes space 300 and turn 150. No other actor, canonical Role, or pack database was edited.

### Status

One source file is changed. The other 31 items remain blocked. No pack rebuild was run. No commit. No push.

---

## Addendum — 2026-11-17 — Dynamic-class build and live validation

### Reason

Foundry was stopped, so the Dynamic-class Light Freighter repair could be packed and then checked in a fresh world import.

### Supersedes

The status line above, which said no pack rebuild had been run. That statement remains the status at the time of the repair addendum.

The superseded content above is retained as historical evidence and must not be deleted.

### Build

`npm run build:db -- drakes-shipyard` exited 0. Actor `gawTKA6kzr7qNnnD` was packed. The packed Role effect is enabled and contains Constitution +1, space Override 300, and turn Override 150. The legacy pointers remain `VdHmWXHvkK5ZyoWw`. The `starships` pack was not rebuilt.

### Live validation

A fresh import from `sw5e-module.drakes-shipyard`, actor `gawTKA6kzr7qNnnD`, was named `TEMP Dynamic-class validation`, world id `IrfAdacuESm0s2M7`. No existing world Dynamic-class actor was present.

- Movement: PASS. Published and prepared space 300, turn 150, fly 0, walk 0.
- Abilities: PASS. 15 / 14 / 15 / 10 / 12 / 10.
- Embedded Role: one base Role, item `HZSgtPcTxZoJVKxW`, subtype `role`, one Constitution +1, and the two enabled mode 5 movement changes.
- `fromUuid` on `Compendium.sw5e-module.starships.VdHmWXHvkK5ZyoWw` returns null. `_stats.compendiumSource` still stores that id, and `getFlag("core", "sourceId")` returns it with Foundry's Version 12 deprecation warning. Preparation succeeded, so the unresolved link is not a mechanical failure.
- Save, close, reopen, and browser reload: PASS. The same movement and abilities remained.
- Console: no import, Active Effect, Role publication, or starship preparation error. The only related warning is the deprecated `core.sourceId` flag warning.

### Cleanup

The temporary actor was deleted. Actor count went from 14 to 13, and the only removed actor was `IrfAdacuESm0s2M7`. No Dynamic-class world actor remains.

### Status

Live validation passed. No commit. No push.

---

## Addendum — 2026-11-17 — Final Drake Role and actor-effect pass

### Reason

The remaining shared Roles, blocked actors, and frozen 42 actor effects were reviewed together. No source edit met the creation or repair gates.

### Supersedes

Nothing. Fang, the 11 validated migrations, and the Dynamic-class validation above remain.

The superseded content above is retained as historical evidence and must not be deleted.

### Shared Role research

Legacy documents at `4cb468ae4` and `5f519f0d1` store an ability change and no movement speed.

- Interceptor `36dTmDP0uGACXGdi`: Dexterity +1. No current successor. Eight embeddings. Stored ship speeds differ, so no shared speed was taken from them.
- Gunboat `jgF0iBtvzesRwiTs`: Strength +1. Five embeddings. No commit renames it to Gunship. Current Gunship remains a separate document.
- Strike Fighter base `nE5oQmhOrK0Coirv`: Strength +1. No Drake actor embeds it. The items that point at `orciEjuUBSjF05Ny` are Role Spec: Strike Fighter.
- Battleship `BXnWIl4JqYhabKOG`: Wisdom +1 and Strength +1. One embedding, the Imperial Star Destroyer. Current Battleship, Warship, and Flagship are separate documents. Warship matches the ability pair but is the already migrated legacy id `uokunSKATOfWwOP9`. Flagship is Charisma +1 and Wisdom +1. No migration links the legacy Battleship id to the current Battleship file.

No canonical Role was created. Movement is absent from the legacy documents, and a ship total is not a shared Role speed.

### Blocked actors

Each prior blocker stays `STILL BLOCKED`. New Role evidence did not resolve it.

- YV-929: `STILL BLOCKED`. Historical 350/300 still has no worksheet against Freighter 300/150.
- YT-1300, Heavily Modified: `STILL BLOCKED`. Two Freighter copies and no independent Constitution total.
- ETA-2 and both Delta-7 actors: `STILL BLOCKED`. Worksheets select Superiority Fighter.
- GAT-12: `STILL BLOCKED`. Attack Fighter versus Shuttle, and Adaptive Ailerons still conflict with the sheet turn.
- Gand and HMP: `STILL BLOCKED`. The embedded items are specializations, not a proven missing base Role that this pass can install.
- AEG-77: `STILL BLOCKED`. The worksheet says Gunship and the actor points at Gunboat.

### Actor effects

All 42 frozen effects have a final disposition. None were edited.

- Seventeen construction effects stay actor-specific. The workbook did not prove another owner.
- Fang `mLJNAvcynpjfy8NT` was already repaired and validated. It was not reopened.
- Twenty-one unresolved effects that still change prepared values stay `INSUFFICIENT EVIDENCE`.
- Escape Pod `CvX6D1B00rvifhxM` and M3-A Scyk `3oOxhRCrZjoHwv4G` stay prepared no-ops. Removal is not proven.
- YV-929 `OpwEjg658THj3164` stays a prepared no-op with an unresolved historical movement value.

### 87-actor disposition

- Validated repair: 13
- Blocked by multiple Roles: 1
- Blocked by unresolved movement: 2
- Blocked by variant mismatch: 5
- Blocked by missing authority: 6
- Needs a shared canonical Role: 8
- Needs a future data migration: 52

Those counts total 87. The validated 13 are Fang, the 11 Freighter, Yacht, and Warship migrations, and Dynamic-class.

### Implementation and build

No source file changed. No pack was rebuilt. Foundry was not asked to stop. No temporary world actor was created. No commit. No push.

### Status

The pass is closed with no source edit. The working tree has this documentation only.

---

## Addendum — 2026-11-17 — Legacy Role rename evidence

### Reason

The [Role history recovery](3a6cada6-601d-4426-8405-b882a9342668) found a discontinued-system commit that this pass did not inspect. The earlier conclusion that these Roles had no rename and no movement is incomplete.

### Supersedes

The statements above that no commit renames Gunboat to Gunship, that Interceptor and Strike Fighter have no successor, and that Battleship has no later movement profile.

The superseded content above is retained as historical evidence and must not be deleted.

### Revised finding

Legacy commit `210140e2d` (`Starship Compendium Updates`) states the renames and says every Role received a base speed and turning speed. The same document ids were kept at that commit:

- Role: Interceptor `36dTmDP0uGACXGdi` became Role: Superiority Fighter. Current successor `vyc2GIsA50ilVSyg` publishes space 400 and turn 150, with Dexterity +1.
- Role: Gunboat `jgF0iBtvzesRwiTs` became Role: Gunship. Current successor `NZi3USVLbUTO2CNg` publishes space 300 and turn 150, with Strength +1.
- Role: Strike Fighter `nE5oQmhOrK0Coirv` became Role: Attack Fighter. Current successor `Xxjz0gT579YzJV29` publishes space 350 and turn 100, with Strength +1. No Drake actor embeds the base id.
- Role Spec: Strike Fighter `orciEjuUBSjF05Ny` became Role Spec: Attack Fighter. It is still not a base Role.
- Role: Battleship `BXnWIl4JqYhabKOG` kept its name and later speed is space 200 and turn 400. Current Battleship `wd8brjtWiB4As1x4` publishes those values. It was not renamed to Warship or Flagship.
- Role: Warship `uokunSKATOfWwOP9` stayed Warship. Its later speed matches the already migrated Executor publication, space 200 and turn 500.

Commit `ce2c0960d` then replaced those original ids with the current ids. The module commit messages do not repeat the rename. That is why the earlier search of this repository found none.

Worksheets that say Superiority Fighter for an actor whose item is still named Interceptor are no longer evidence of two different Roles. ETA-2 and both Delta-7 actors stay unedited because their other documented conflicts were not re-tested in this correction.

### Implementation impact

No source file, canonical Role, or actor was edited. Policy A still keeps the legacy pointers. Applying the successor speeds to the Drake embeddings is a separate repair and was not started.

### Status

Correction recorded. No source edit. No pack rebuild. No commit. No push.

---

## Addendum — 2026-11-17 — Renamed Role successor publication

### Reason

Commit `210140e2d` supplies the successor speeds. This pass publishes them on the clean legacy embeddings.

### Supersedes

The statements that Interceptor and Gunboat have no current successor, and any variant mismatch based only on Interceptor versus Superiority Fighter or Gunboat versus Gunship. The note above that this repair was not started is also superseded.

The superseded content above is retained as historical evidence and must not be deleted.

### Frozen items

No actor embeds Strike Fighter base `nE5oQmhOrK0Coirv`. The 14 base-Role items are:

- Interceptor `36dTmDP0uGACXGdi`: Clutch `szt1dfLH6V4bltyf`, Delta-7 `JAzyRBH3KzCuhzU6`, Delta-7 Modified `JAzyRBH3KzCuhzU6`, ETA-2 `SD65mkoce1gtVgp3`, RZ-1 `FNNtNwdBeH3blQbk`, VCX auxiliary `uyRRdjE5Gzdh1xdo`, X-ceptor `TYIYieTHKqSqkhRR`, Y-wing `z9wtDYOxE9rke7OF`.
- Gunboat `jgF0iBtvzesRwiTs`: AEG-77 `MvOUgDzaMc4A6nhA`, ST-70 `iK5J38u5OOuM0K6e`, ST-70 Legendary `yqQOGN6AiWjJ5Ngd`, VT-49 `90UoJVNE1s77x7pB`, Wayfarer `fTXFkx64e099tJOd`.
- Battleship `BXnWIl4JqYhabKOG`: Imperial `mjTL7BRtcGi6vXWJ`.

### Blockers

The rename resolves the Role-name mismatch. It does not resolve these:

- ETA-2: `STILL BLOCKED BY MOVEMENT`. Sheet fly 450 and turn 150. Successor publication is 400/150. The specialization fly +50 does not raise space.
- Delta-7: `STILL BLOCKED BY MOVEMENT`. Sheet fly 450 and turn 100, with a -50 adjustment the actor does not have.
- Delta-7 Modified: `STILL BLOCKED BY EQUIPMENT`. Adaptive Ailerons is turn -100. Successor plus that equipment is 400/50. The sheet is fly 500 and turn 100.
- VT-49: `STILL BLOCKED BY MOVEMENT`. Actor effect `XLUqHYCqcIgHhklz` is mode 5 fly 300 and turn 200.
- Wayfarer: `STILL BLOCKED BY MOVEMENT`. Actor effect `Kntbe9tGWmmm54Lj` adds turn +50 without proven equipment ownership.
- GAT-12: `STILL BLOCKED BY CONFIGURATION`. It does not embed the Strike Fighter base Role.

### Repairs

These nine frozen items gained the successor mode 5 speeds. Legacy pointers and ability effects stayed. Fly specializations stayed and do not change prepared space or turn.

- AEG-77, both ST-70s: space 300, turn 150. AEG prepared abilities remain 18/14/18/12/14/10, matching its worksheet.
- Clutch, RZ-1, VCX auxiliary, X-ceptor, Y-wing: space 400, turn 150.
- Imperial: space 200, turn 400.

### 87-actor disposition

- Validated repair: 13
- Successor publication awaiting pack validation: 9
- Blocked by multiple Roles: 1
- Blocked by unresolved movement: 6
- Blocked by variant or configuration mismatch: 1
- Blocked by missing authority: 5
- Needs a future data migration: 52

Those counts total 87.

### Status

Source edits are complete. Foundry is running, so the pack was not rebuilt. No commit. No push.

---

## Addendum — 2026-11-17 — Drake pack rebuild

### Reason

Foundry was stopped, so the nine successor publications could be packed.

### Supersedes

The status line above that says the pack was not rebuilt.

The superseded content above is retained as historical evidence and must not be deleted.

### Build

`npm run build:db -- drakes-shipyard` exited 0. The packed effects for AEG-77, both ST-70s, Clutch, RZ-1, VCX auxiliary, X-ceptor, Y-wing, and Imperial contain the successor mode 5 speeds. The `starships` pack was not rebuilt. Live validation has not started.

### Status

Pack rebuilt. No commit. No push.

---

## Addendum — 2026-11-17 — Renamed Role live validation

### Reason

Foundry was restarted after the Drake pack rebuild.

### Supersedes

The status line above that says live validation has not started.

The superseded content above is retained as historical evidence and must not be deleted.

### Live validation

Nine fresh imports from `sw5e-module.drakes-shipyard` were named `TEMP … validation`. Each had one base Role, fly 0, and walk 0. Save, close, reopen, and a browser reload kept the same speeds. The only console warning was Foundry's deprecated `core.sourceId` flag warning. The legacy pointers still do not resolve as current documents.

- AEG-77 `PCIvI5diky2zGXRI`: space 300, turn 150. Abilities 18/14/18/12/14/10. PASS.
- ST-70 `QU6Uq7Ut53GSmyCy`: space 300, turn 150. Abilities 16/12/14/14/13/10. PASS.
- ST-70 Legendary `tlMwjzbS7k6alMIx`: space 300, turn 150. Abilities 16/12/15/14/14/12. PASS.
- Clutch `Ui3MinEKr6PNovmk`: space 400, turn 150. Abilities 12/18/11/11/12/10. PASS.
- RZ-1 `6fq0q3Hzy2MVNl3w`: space 400, turn 150. Abilities 16/18/11/10/14/11. PASS.
- VCX auxiliary `Vn5TCtskjJoAIaC5`: space 400, turn 150. Abilities 15/17/11/10/15/11. PASS.
- X-ceptor `CdW4iXgBBPnwyW8w`: space 400, turn 150. Abilities 15/16/11/10/12/10. PASS.
- Y-wing `wMrU2VXixGvmMVVq`: space 400, turn 150. Abilities 16/18/11/10/14/11. PASS.
- Imperial `R8xPBSCN4t1rh9Cm`: space 200, turn 400. Abilities 18/8/17/14/16/16. PASS.

All nine temporary actors were deleted. The world actor count returned from 22 to 13.

### Status

Live validation passed. No commit. No push.

---

## Addendum — 2026-11-17 — Renamed Role batch closeout

### Reason

The nine successor publications have been packed and live-validated. This closeout moves them out of the pending disposition.

### Supersedes

Only the earlier pending-build and pending-live-validation statuses, including "Successor publication awaiting pack validation: 9" and "Live validation has not started." The PASS results in the addendum immediately above remain the validation evidence and are not repeated here.

The superseded content above is retained as historical evidence and must not be deleted.

### Revised disposition

The nine actors are now `VALIDATED REPAIR`: AEG-77, ST-70, ST-70 Legendary, Clutch, RZ-1, VCX auxiliary, X-ceptor, Y-wing BTL-B/S3, and Imperial I-class Star Destroyer.

Updated 87-actor counts:

- Validated repair: 22
- Blocked by multiple Roles: 1
- Blocked by unresolved movement: 6
- Blocked by variant or configuration mismatch: 1
- Blocked by missing authority: 5
- Needs a future data migration: 52

Those counts total 87. The earlier 13 validated repairs remain in the 22.

### Status

The renamed Role successor batch is closed. No commit. No push.
