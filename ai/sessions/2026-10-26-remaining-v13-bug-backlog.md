# Remaining v13 bug backlog — 2026-10-26

Branch `v.next` at `592b0bd3801d5482ab250c44839f4df8df55ab83`. Runtime checked: Foundry 13.351, dnd5e 5.2.5, `sw5e-module` active. This note is the current backlog only. Settled power, tool, trait, deployment, crew, repair, shield-bar, weapon-ability, Hidden Blade, and Commando IWS results stay in the 2026-10-08 audit and are not repeated here.

## 1. Runtime defects reproduced and still open

None from this pass. The Engines Spend presentation defect was reproduced and corrected. Gargantuan tier gain passed.

## 2. Runtime defects corrected in this pass

**Engines Spend stays enabled at zero**

- Scope: runtime sheet control.
- Evidence: Play rendered Engines Spend enabled at stored value 0. The click wrote nothing and created no chat. `applyCoreOperationsControlState` then set `disabled` from edit permission only, after the template had already disabled `canSpend === false`. Recover already kept `data-can-recover`.
- Files: `templates/starship-sheet-layer.hbs`, `scripts/patch/starship-sheet.mjs`.
- Foundry reproduction still required: no. Retest passed. Engines at 0 is disabled. Central above 0 still spends one die.
- Authoritative source required: no.
- Next action: none for this control. Do not change the spend rule.

## 3. Runtime checks passed or not reproduced

**Gargantuan suffix mapping**

- Scope: runtime pool derivation.
- Evidence: actor `BdsHxKZ2reGwdeZd`, size `sbR9MRdzWB4R447W`, identifier `gargantuan-starship`. Tiers 0, 1, and 2 were 11, 13, and 15 `d20`. Decreasing tier restored 13. Hull used 1 and shield used 2 survived a tier increase and a reopen.
- File: `scripts/starship-data.mjs` (`canonicalizeStarshipSizeProfileKey`), unchanged this pass.
- Foundry reproduction still required: no.
- Authoritative source required: no.
- Next action: none.

Older reports that no later addendum closed were not retested. They are not active defects. They stay unverified until a new 13.351 / 5.2.5 report asks for that case. That list includes use-based empty point bars, bars disappearing after an update, theme advancement editing, migration, power DC 0, starship armor on Features, `1d20min1max1` saves, move and turn overwrite, the Uses column, Scout superiority, theme legibility and lag, the NPC point tracker, Kushiban AC, and the older unnamed item reports. Reports closed only by a “fixed” reply were not reopened.

## 4. Compatibility still untested

**Stock shield bar with Bar Brawl absent**

- Scope: compatibility.
- Evidence: the 2026-10-21 sweep passed `sw5e.starshipShields` with Bar Brawl 1.9.0 already active. A world without that module was not tested. This pass did not change that.
- File: `scripts/starship-token-resources.mjs`.
- Foundry reproduction still required: yes, only for a Bar-Brawl-off world.
- Authoritative source required: no.
- Next action: leave it untested unless a world without Bar Brawl is available. Do not install the module.

## 5. Pack/build discrepancies

**Quick-Charge Shield `regrateco`**

- Scope: DataModel construction. The installed pack still stores the value.
- Evidence: source `system.attributes.regrateco.value` is 1.5 on `M7igMGsBIosGA4dS`. The installed index returns 1.5. `EquipmentData` has no `attributes` field, so the constructed document and a fresh world copy drop it. `getStarshipShieldRegenRateMult` still reads that path when it is present.
- File: `packs/_source/starships/starship-equipment/shields/quick-charge-shield.yml`. Runtime reader: `scripts/starship-dice-rolls.mjs`.
- Foundry reproduction still required: no for the loss stage. Yes before any schema change is called fixed, and that validation needs a pack rebuild that this pass did not authorize.
- Authoritative source required: no for the field loss. Yes before changing the coefficient.
- Next action: a later pass may add the field to the equipment schema or keep it on a preserved flag. Do not rebuild or edit the YAML until that pass is authorized.

## 6. Content accuracy awaiting authoritative comparison

**YT-1300, Modified movement**

- Scope: source observation.
- Evidence: actor `t5oz29L2QV5lFlYr` stores `baseTurnSpeed` 200 and movement fly 350 / turn 150. No local book source states the expected numbers.
- File: `packs/_source/drakes-shipyard/yt-1300-modified.yml`.
- Foundry reproduction still required: no.
- Authoritative source required: yes.
- Next action: do not rewrite the numbers.

**Drake freshness and Role Specialization**

- Scope: source observation.
- Evidence: the audit names no other numeric Drake mismatch. Some Role Specialization items exist. No completeness checklist and no local book source were established.
- Foundry reproduction still required: no.
- Authoritative source required: yes.
- Next action: do not start a Drake stat rewrite.

**Modification descriptions and duplicated effects**

- Scope: unnamed source claim.
- Evidence: the audit does not name an item. The crew thread `1548441058432786472` was inaccessible. No pack scan was run.
- Foundry reproduction still required: no.
- Authoritative source required: yes, and a named item is required first.
- Next action: leave both unnamed.

**Tier 3 Medium Versatile Transport**

- Scope: missing compendium feature record, not a confirmed rules defect.
- Evidence: no top-level document of that name is in source or in the installed starships or Drake indexes. Embedded copies exist, including on tier-3 medium `QqgnknDyNxtsaImK`, and point at missing compendium id `OiZHrN5BsNYW1W3F`. No local book passage was found.
- File: embedded feat on `packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml`. Medium feature folder has no `Versatile Transport` file.
- Foundry reproduction still required: no.
- Authoritative source required: yes before creating the feature.
- Next action: do not create the record.

**Commando, Demolitions and Sith Usurper**

- Scope: source observation. Hidden Blade and both Commando IWS actors stay closed.
- Evidence: Commando, Demolitions remains the 2026-10-08 stored-field note, with no book citation. Sith Usurper exists at `packs/_source/snv-monsters/humanoid/sith-usurper.yml`. Its flat-check claim was not compared.
- Foundry reproduction still required: no.
- Authoritative source required: yes before either statblock is called defective.
- Next action: do not edit SnV source.

## 7. Discord coverage limitations

The configured bot could not read guild `727847839631278110` or thread `1548441058432786472` on 2026-10-26. No new replies and no new 13.351 / 5.2.5 reports were retrieved. Inaccessible thread text was not inferred.

- Foundry reproduction still required: no.
- Authoritative source required: no.
- Next action: retry only the unresolved threads when a bot can access them.

## 8. Recommended implementation order

1. Leave the Spend correction as the only code change from this pass.
2. Authorize a separate schema pass before touching Quick-Charge Shield. That pass needs a pack rebuild to validate.
3. Wait for a local Starships of the Galaxy or SnV citation before any Drake, Versatile Transport, modification, duplicate-effect, or statblock edit.
4. Do not retest the settled 2026-10-20 and 2026-10-21 workflows unless a new report names a different case.

---

## Addendum — 2026-10-26 — Quick-Charge Shield coefficient preserved

### Reason

The schema pass named in section 5 and in recommended step 2 was implemented.

### Supersedes

Section 5's statement that validation of a schema change needs a pack rebuild, and recommended step 2's same requirement. The installed `sw5e-module.starships` index already stored `regrateco` 1.5, and Foundry constructed that value after the `EquipmentData` field was added. No pack rebuild was run.

Section 5 and recommended step 2 are retained above as historical evidence and must not be deleted.

### Revised status

Quick-Charge Shield `M7igMGsBIosGA4dS` now keeps `system.attributes.regrateco.value` 1.5 on a fresh import. An explicit live 0 disables regen without a compendium fallback. A stored 1.25 is used. Details and deleted fixture ids are in the 2026-10-26 addendum of [2026-10-08-discord-v13-bug-audit.md](2026-10-08-discord-v13-bug-audit.md).

- Foundry reproduction still required: no for this coefficient.
- Authoritative source required: no. The coefficient value was not changed.
- Next action: none for `regrateco`. Sibling starship-equipment attributes (`cscap`, `sscap`, `powerdicerec`, and the others) remain stripped and are still a follow-up. No rebuild is required for the coefficient fix.

---

## Addendum — 2026-11-04 — YT-1300 movement closed

### Reason

The Drake's Shipyard YT-1300, Modified was opened in Foundry and compared with world export `G5y5nQHUBa2j5T6R`.

### Supersedes

Section 6, "YT-1300, Modified movement," which left the 200 versus 150 figures as an unresolved source observation awaiting a book citation.

That section is retained above as historical evidence and must not be deleted.

### Revised status

Closed. No pack or code change. Actor `t5oz29L2QV5lFlYr` stores this hull's speeds as space 350 and turn 150, which is what the Movement dialog and sidebar show. `baseTurnSpeed` 200 and `baseSpaceSpeed` 300 belong to the embedded Medium size item. Preparation clears the live fly and walk rows, so the dialog shows Fly 0 and Speed 0 while the stored fly 350 and walk 30 remain on the actor. The export is a fresh world copy of that compendium actor and matches those fields.

- Foundry reproduction still required: no.
- Authoritative source required: no for this speed pair.
- Next action: none for this ship. The next open content report is Drake freshness and Role Specialization.

---

## Addendum — 2026-11-04 — Drake Role Spec duplicates removed

### Reason

The duplicate slice of the Drake freshness and Role Specialization item in section 6 was removed from pack source.

### Supersedes

Section 6's "do not start a Drake stat rewrite" only for these five `Role Spec:` duplicates. Numeric Drake freshness, Yacht description pairs, unique-effect Role Spec items, and Role Spec items with no matching `Role:` item are unchanged and stay open.

Section 6 is retained above as historical evidence and must not be deleted.

### Revised status

Five embedded `Role Spec:` items and their actor-level effect copies were deleted by fixed id. The matching `Role:` items stay.

| File | Removed item | Removed actor effect | Retained item |
| --- | --- | --- | --- |
| `akajor-class-shuttle.yml` | `BQ1QP4pDtSswfpEk` | `vrbxUmzq0uXtKnJ4` | `4lOzKTxQ6X75iRE3` |
| `arc-170-starfighter.yml` | `3LpnhMKSnfj2kweZ` | `cYTnq6omxIAHtLjz` | `546iyB7I0mfBCOgu` |
| `u-wing-starfighter-support-craft-ut-60d.yml` | `CuY0bUBgTMQ5QG5t` | `gW3SJJLUPgQdHGuX` | `N1N52oykBJ5Folkw` |
| `ef76-nebulon-b-escort-frigate.yml` | `zkaANU1XMiQGdlf0` | `iaFkhGXZPYZSPcJ9` | `hPR9d0SurUXfVjST` |
| `ef76-nebulon-b-escort-frigate-medical.yml` | `PDWg1DWCwL0eiu32` | `chOWaILOZPSmcELU` | `SmRAAX8SFDt14PXt` |

Descriptions matched. System data matched except the allowed `subtype` and `attributes.speed` fields. The duplicate's only extra effect change was `system.details.role`. The retained effect's empty `flags.core.statusId` matched an empty flags object. 42 `Role Spec:` items remain: 4 Yacht description differences, 21 unique effects, and 17 with no matching `Role:` item. No specialization compendium record was created.

- Foundry reproduction still required: yes, after an authorized `npm run build:db -- drakes-shipyard` with Foundry stopped. Import ARC-170 and confirm one `Role: Shuttle`, Constitution +1, and no `Role Spec: Shuttle`.
- Authoritative source required: no for these five pairs. Still yes before any numeric Drake rewrite.
- Next action: rebuild only when authorized. Do not rewrite the retained Role Spec items. Details are in the 2026-11-04 addendum of [2026-10-08-discord-v13-bug-audit.md](2026-10-08-discord-v13-bug-audit.md).

---

## Addendum — 2026-11-04 — Drake's Shipyard pack rebuilt

### Reason

The rebuild named above was authorized and run with Foundry stopped.

### Supersedes

The "rebuild only when authorized" next action in the addendum above. The instruction not to rewrite retained Role Spec items still stands.

That next-action line is retained above as historical evidence and must not be deleted.

### Revised status

`npm run build` passed. Lint, styles, and the full pack compile finished. `drakes-shipyard` compiled and ARC-170 `B5AmMDBTT6TrfW5E` was packed.

- Foundry reproduction still required: yes. Restart Foundry, import ARC-170, and confirm one `Role: Shuttle`, Constitution +1, and no `Role Spec: Shuttle`.
- Authoritative source required: no for these five pairs.
- Next action: the sheet check. Do not edit the retained Role Spec items.

---

## Addendum — 2026-11-04 — Drake Role Spec duplicate removal closed

### Reason

The user marked the five-pair duplicate removal done after the pack rebuild.

### Supersedes

The "sheet check" next action in the addendum above. The instruction not to edit retained Role Spec items still stands.

That next-action line is retained above as historical evidence and must not be deleted.

### Revised status

Closed for the five removed pairs. `drakes-shipyard` was packed by `npm run build`, including ARC-170 `B5AmMDBTT6TrfW5E`. No separate sheet transcript was recorded in this session. Yacht pairs, unique-effect Role Spec items, Role Spec items with no matching `Role:` item, and numeric Drake freshness stay open.

- Foundry reproduction still required: no for these five pairs, closed by the user after the rebuild.
- Authoritative source required: still yes before any numeric Drake rewrite.
- Next action: none for these five duplicates. Do not edit the retained Role Spec items.

---

## Addendum — 2026-11-04 — Modification descriptions and duplicated effects reproduced

### Reason

Section 6 left this report unnamed because the crew thread was inaccessible and no pack scan had been run.

### Supersedes

Section 6, "Modification descriptions and duplicated effects," including its next action to leave both unnamed.

That section is retained above as historical evidence and must not be deleted.

### Revised status

Reproduced from pack source. Named items and the repair scope are in [2026-11-04-modification-duplicates-investigation.md](2026-11-04-modification-duplicates-investigation.md).

- 893 Drake actor-level effects repeat a `transfer: true` item effect. `legacyTransferral` is false, so the copy applies again. Four Makeshift copies also hold the −1. Two shield copies originate on another actor.
- 35 Fire-Linked items on 17 ships store the Slave Circuit description and have no effect.
- Compendium `starship-modifications` and `enhanceditems/item-modifications` did not reproduce a duplicate.
- Adaptive Ailerons turn `+100` on eight ships is a Drake freshness mismatch, not a duplicate.
- Foundry reproduction still required: no for the source finding. The Basilisk PLAY double-apply is already recorded in [2026-07-20-basilisk-play-edit-ability-investigation.md](2026-07-20-basilisk-play-edit-ability-investigation.md).
- Authoritative source required: no for the 893 copies and the 35 descriptions. Still yes before rewriting the 872 older Drake descriptions.
- Next action: do not edit source until the repair scope in the investigation note is authorized. No world migration.

---

## Addendum — 2026-11-05 — Drake duplicated actor effects removed from source

### Reason

The actor-level duplicate portion of the investigation repair scope was authorized and applied.

### Supersedes

The next-action line above that says not to edit source until the repair scope is authorized.

That line is retained above as historical evidence and must not be deleted. The instruction not to migrate world actors still stands.

### Revised status

Drake `packs/_source/drakes-shipyard/*.yml` no longer stores the 927 duplicated actor-level effects (852 same-actor nonempty, 37 clone-source nonempty, 4 Makeshift, 2 orphans, 32 inert Lightweight Armor). The 893 figure omitted the 32 empty-change pairs. CR90 `ZtUQ6YtH6HkdJH60` was not an exact duplicate and remains. Counts, per-file deletions, and the Makeshift penalty moves are in [2026-11-04-modification-duplicates-investigation.md](2026-11-04-modification-duplicates-investigation.md).

- Foundry reproduction still required: yes. The pack has not been rebuilt, and a fresh Drake import has not been checked.
- Authoritative source required: no for this actor-effect removal. Still yes before the 35 Fire-Linked descriptions, Adaptive Ailerons, Tuned Engines, Sublight Drive text, or the older Drake descriptions.
- Next action: with Foundry stopped, `npm run build:db -- drakes-shipyard`, then import one fresh Drake ship and confirm each ability is stored once. Do not migrate world actors in this pass. Do not start Fire-Linked, Adaptive Ailerons, Tuned Engines, or Sublight Drive without a separate authorization.

### Status

Source repair applied. Pack rebuild and Foundry gate pending. No commit. No push.

---

## Addendum — 2026-11-05 — Drake's Shipyard pack rebuilt

### Reason

Foundry was stopped, so the next action to compile `drakes-shipyard` could run.

### Supersedes

The next action above that says to run `npm run build:db -- drakes-shipyard` before the fresh-import check.

That next action is retained above as historical evidence and must not be deleted. The fresh-import check is not superseded.

### Revised status

`npm run build:db -- drakes-shipyard` exited 0 and packed 87 actors. Stale actor-effect documents were removed from the LevelDB pack.

- Foundry reproduction still required: yes. Import one fresh Drake ship and confirm each ability is stored once and the Effects tab lists one entry per effect.
- Authoritative source required: unchanged. Still yes before Fire-Linked descriptions, Adaptive Ailerons, Tuned Engines, Sublight Drive text, or the older Drake descriptions.
- Next action: restart Foundry and run that fresh-import check. Do not migrate world actors. Do not start the other Drake text repairs without a separate authorization.

### Status

Pack rebuilt. Foundry gate pending. No commit. No push.

---

## Addendum — 2026-11-05 — Duplicate actor effects closed

### Reason

The user reported that the fresh-import Foundry test passed.

### Supersedes

The next action above that says to restart Foundry and run the fresh-import check, and the line "Foundry reproduction still required: yes."

Those lines are retained above as historical evidence and must not be deleted.

### Revised status

Closed for the duplicated actor-level effects. The user confirmed the Foundry test passed on 2026-11-05.

- Foundry reproduction still required: no for this duplicate-effect issue. PASS, 2026-11-05, reported by the user for a fresh Drake import.
- World actors: not cleaned. Older imports still contain the duplicates and require re-importing or a separately authorized migration.
- Authoritative source required: still yes before Fire-Linked descriptions, Adaptive Ailerons, Tuned Engines, Sublight Drive text, or the older Drake descriptions.
- Next action: none for the duplicate actor effects. Leave Fire-Linked, Adaptive Ailerons, Tuned Engines, and Sublight Drive as separate open issues.

### Status

Closed for the duplicate actor-level effects. Fresh import passed. World actors unchanged. The four other Drake issues remain open.

---

## Addendum — 2026-11-05 — Drake text repairs

### Reason

The four Drake findings left open above were separated. Three were repaired in source. Sublight Drive was only recorded.

### Supersedes

The next-action line above that leaves Fire-Linked, Adaptive Ailerons, Tuned Engines, and Sublight Drive open together.

That line is retained above as historical evidence and must not be deleted.

### Revised status

- Tuned Engines `V2EZCmDU7Sd6qXmi`: description replaced from compendium `Qt0Y1DWiU2ybVirE`; fly +50 effect `aox9hA3SJo66l6cy` removed. SLAM `SodQqzh3yVc4s1Qp` unchanged.
- Fire-Linked: 35 description-only replacements. No effects added or removed.
- Adaptive Ailerons: eight turn values changed from `+100` to `-100` only. No actor-level copy remained.
- Sublight Drive `qf6pDveEwnrkmjNQ`: unresolved mixed-identity record, left unchanged pending an authoritative historical source. Not a confirmed Sublight Drive.
- Foundry reproduction still required: yes for these three source edits. The pack has not been rebuilt.
- World actors: not modified.
- Authoritative source required: still yes for `qf6pDveEwnrkmjNQ` and the older Drake descriptions. No longer required before the three repairs above.
- Next action: none until a rebuild is authorized. Do not edit the Sublight Drive item without a historical source.

### Status

Three source repairs applied. Sublight Drive unresolved and unchanged. No commit. No push.

---

## Addendum — 2026-11-05 — Drake text repairs packed

### Reason

A pack rebuild was authorized after the three source repairs.

### Supersedes

The line above that says Foundry reproduction is still required because the pack has not been rebuilt, and the next action that waits for a rebuild authorization.

Those lines are retained above as historical evidence and must not be deleted. The fresh-import check is not superseded.

### Revised status

`npm run build:db -- drakes-shipyard` exited 0 and packed 87 actors. The Tuned Engines fly effect was removed from the LevelDB pack.

- Foundry reproduction still required: yes. Import the custom N-1, one Fire-Linked ship, and one Adaptive Ailerons ship.
- World actors: not modified.
- Sublight Drive `qf6pDveEwnrkmjNQ`: still unresolved and not edited.
- Next action: run that fresh-import check. Do not edit Sublight Drive without a historical source.

### Status

Pack rebuilt. Foundry import check pending. No commit. No push.

---

## Addendum — 2026-11-05 — Tuned Engines, Fire-Linked, and Adaptive Ailerons closed

### Reason

The user reported that the fresh-import Foundry checks passed.

### Supersedes

The next action above that says to run the fresh-import check, and the line "Foundry reproduction still required: yes."

Those lines are retained above as historical evidence and must not be deleted.

### Revised status

Complete for the three repaired findings. The user confirmed the Foundry checks passed on 2026-11-05.

- Tuned Engines: closed.
- Fire-Linked descriptions: closed.
- Adaptive Ailerons: closed.
- Sublight Drive `qf6pDveEwnrkmjNQ`: still open. Unresolved mixed-identity record. Not edited.
- Foundry reproduction still required: no for the three closed findings. PASS, 2026-11-05, reported by the user.
- World actors: not modified.
- Next action: none for the three closed findings. Do not edit Sublight Drive without a historical source.

### Status

Closed for Tuned Engines, Fire-Linked descriptions, and Adaptive Ailerons. Sublight Drive remains open. World actors unchanged.
