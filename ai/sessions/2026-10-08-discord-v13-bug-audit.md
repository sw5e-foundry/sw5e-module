# Discord v13 / dnd5e 5.2.5 bug audit — 2026-10-08

Branch `v.next` at `a204e26a06956b2b764743b2ddde8a090e3e1296`. Runtime target: Foundry v13.x and dnd5e 5.2.5. No code, pack, Git, or world changes were made for this audit. This audit is not exhaustive. Coverage limits are in section 5.

## 1. Confirmed unresolved defects

**Superseded, 2026-10-08:** The defect label on this section is superseded by the addendum below. The stored-field notes remain. Commando, Demolitions is not classified as defective.

### Scum & Villainy statblock — Commando, Demolitions

Reference: https://discord.com/channels/727847839631278110/1552841363178127420

Reported expected behavior, in the reporter's terms: weapons should not carry a Base Damage entry and a duplicate Damages entry that also adds ability bonuses; To Hit should not be a flat bonus in place of the calculated bonus; saving throws should be present; Commando, Demolitions should include Volatile Reflexes; IWS damage should include the ability modifier when it is not base damage.

Authoritative reference: not identified. No book citation was established in this audit.

Exact source mismatch, `packs/_source/snv-monsters/humanoid/commando-demolitions.yml`: Hidden Blade stores `damage.parts` of `1d4+6` and also `damage.base`; `attack.bonus` is `"11"` with `flat: true`; all six saves are `proficient: 0`; no item in that file is named Volatile Reflexes.

Runtime-unverified: the claim that an IWS roll drops from `1d8+6` to `1d8`, and that changing ability scores makes skill modifiers skyrocket. Those rolls were not made in Foundry. A full SnV pack sweep was not done. The Sith Usurper flat-check claim in the same thread was not checked against source.

## 2. Report-specific Foundry retests

**Superseded, 2026-10-08:** These items were not reproduced. The addendum classifies them as unverified reports. The settled fixes named here stay closed only for the cases already validated.

These name Foundry v13 and dnd5e 5.2.5, or a later message in the same thread does. Current source was not enough to close them, and they were not re-rolled or re-opened in Foundry for this audit.

- Empty point bars. A fighter with use-based powers (Enhanced Item tech powers and Burst of Speed), distinct from the settled 0/0 caster-level meter. — Superseded, 2026-10-08: the preserved case is caster level 0 with no point pool. This fighter report is a different case. https://discord.com/channels/727847839631278110/1551311879782273205
- Crew proficiency on starships. Pilot `system.advancement: []` stays closed. Distinct untested cases: proficiency on skills and weapon attacks, non-pilot crew, deployments other than Pilot, attack rolls deducting a positive Dex modifier, damage set to Strength, Drake's Shipyard data freshness, modification descriptions, duplicated effects, and a missing Tier 3 Medium Versatile Transport. https://discord.com/channels/727847839631278110/1548441058432786472
- Ship shield attribute bar. Retest the stock `sw5e.starshipShields` bar separately from Bar Brawl. https://discord.com/channels/727847839631278110/1553485973185106030
- Granting traits. Foundry 13.350, dnd5e 5.2.5, SW5e 1.3.3, reported again on 2026-09-29. A fresh feature was not reproduced in the thread. https://discord.com/channels/727847839631278110/1509632888516382851
- New sheet themes make advancement editing unusable with only SW5e loaded. SW5e 1.3.9, dnd5e 5.2.5. A fix was said to be in progress; no later confirmation was in the thread. https://discord.com/channels/727847839631278110/1532109201420063000
- Force and tech point bars disappear after update. The thread includes a later report on SW5e 1.3.9 with dnd5e 5.2.5, distinct from the settled 0/0 Play-mode hide. — Superseded, 2026-10-08: the preserved case is caster level 0 with no point pool. Bars disappearing after an update is a different case. https://discord.com/channels/727847839631278110/1435283197209346108
- Starship power storage cannot be edited, consumed, or refilled from the sheet. dnd5e 5.2.5, SW5e 1.3.6. https://discord.com/channels/727847839631278110/1512144484429861036
- Hull and shield dice do not update with tier and cannot be edited or spent. dnd5e 5.2.5, SW5e 1.3.6. Current `getStarshipHullShieldDicePerTierGain` derives dice, and that derivation was not opened on a sheet here. https://discord.com/channels/727847839631278110/1512569870699593838
- Two crew lists track actors separately. dnd5e 5.2.5, SW5e 1.3.6. https://discord.com/channels/727847839631278110/1512143520696238241
- SW5e tools broke for new characters while existing characters kept them. Foundry 13.350, dnd5e 5.2.5, SW5e 1.2.9. Unanswered. https://discord.com/channels/727847839631278110/1486052081654698144

`#general-kenobi` also has a stored YT-1300 difference (`baseTurnSpeed` 200 versus movement turn 150, fly 350). Expected behavior and a reference were not established, so this is not a confirmed defect. It is the same topic as the move/turn thread in section 3.

## 3. Unknown runtime applicability

**Superseded, 2026-10-08:** These remain unverified. The addendum is the classification that applies. A missing dnd5e version still does not drop a report.

dnd5e version was not stated. These stay in scope until a message names a version.

- Module not migrating. Foundry 13.351, SW5e 1.4.3. Repair code for `sw5e-mod-slots.modification` is on `v.next`. Do not migrate a world from this note. https://discord.com/channels/727847839631278110/1553075368863207494
- Power DC set to 0. SW5e 1.3.9. https://discord.com/channels/727847839631278110/1527149858731982939
- Starship armor displayed on the Features tab. SW5e 1.3.9. https://discord.com/channels/727847839631278110/1525286810807308318
- Starship saves described as `1d20min1max1`. SW5e 1.3.9. No `min1max1` string remains in `scripts/`. Actor formulas were not checked. https://discord.com/channels/727847839631278110/1525290043550335066
- Move and turn speed overwritten by size and role features. SW5e 1.3.9. https://discord.com/channels/727847839631278110/1525289742114099322
- Token hull and shields combined, shield temp HP not separate. SW5e 1.3.6 or 1.3.9. Stock `sw5e.starshipHull` and `sw5e.starshipShields` exist. https://discord.com/channels/727847839631278110/1525288344672800829
- Starship feature and action Uses column never populated. SW5e 1.3.9. https://discord.com/channels/727847839631278110/1525286984136790076
- Scout Superiority Style does not grant or rest-reset dice, and the save DC is wrong. Foundry 13.347, SW5e 1.3.9. https://discord.com/channels/727847839631278110/1526956691197788263
- Fighters and Scholars default to 0 superiority dice. SW5e 1.3.9. Related 5.2.5 threads in section 4 were marked fixed in 1.3.9. https://discord.com/channels/727847839631278110/1527150277738762421
- Theme legibility on SW5e 1.3.9. https://discord.com/channels/727847839631278110/1526403683250733166
- Theme selection boxes cramped. Versions not stated. https://discord.com/channels/727847839631278110/1526407075607871508
- Starship sheet UI lag on SW5e themes. SW5e 1.3.9. https://discord.com/channels/727847839631278110/1525291117837549668
- NPC force and tech powers have no point tracker. Versions not stated. https://discord.com/channels/727847839631278110/1418004417159889038
- Migration token images and a later missing `item.system` advancement warning. SW5e 1.4.2. https://discord.com/channels/727847839631278110/1536561790538743808
- No Force Points or Tech Points, testers swapping sample actors. Versions not stated. https://discord.com/channels/727847839631278110/1435367043632468073
- `#general-kenobi` 2026-06-29: a Kushiban reported at 0 armor even after a manual AC set. dnd5e was not stated on that message. https://discord.com/channels/727847839631278110/727848682786914316/1521151927101165630

## 4. Already addressed, closed, or out-of-scope reports

Settled in this session's earlier validation. Not reopened:

- Starship weapon damage applies Wisdom before the routing early return in `onStarshipWeaponPreRollDamage`. `shouldUseStarshipWisAttackAbility` is unchanged.
- Play mode hides a power meter when effective max is 0 and caster level is 0. Edit keeps the meter and the configure control. The validated case is a caster with no points, not every character who owns a power. — Superseded, 2026-10-08: the validated baseline is caster level 0 with no point pool. See the addendum.
- Pilot `system.advancement` is `[]` in `packs/_source/deployments/pilot/pilot.yml`. That does not settle other deployments or skill and attack proficiency.
- Weapon `system.firingArc` and `system.turreted` exist, and the sheet control plus inventory subtitle were checked in Foundry. Pack fill of arcs was not part of that work.

Source now matches the reported expectation, without a new Foundry roll in this audit: — Superseded, 2026-10-08: these are confirmed source observations. They do not close the reports.

- Armor Class Improvement stores `(@details.tier)-1`, which is +1 at tier 2 through +4 at tier 5, and starship roll data injects `details.tier`. https://discord.com/channels/727847839631278110/1512571168962383882
- Hull and shield dice per tier: sizes other than Huge and Gargantuan gain 1 die per tier; Huge and Gargantuan gain 2. https://discord.com/channels/727847839631278110/1525286608058712156
- Role Specialization entries exist in Drake's Shipyard and starship feature packs. A complete mastery checklist was not made. https://discord.com/channels/727847839631278110/1512573420481810534

Closed because the thread names a different dnd5e or Foundry generation, or the reporter said it worked after rollback:

- NPC item edit. Follow-up named dnd5e 5.3.3 and then said it worked. https://discord.com/channels/727847839631278110/1538672646160384082
- Error when updating. dnd5e 5.3.3. https://discord.com/channels/727847839631278110/1540107171826634852
- Leveling error popups. dnd5e 5.3.3, SW5e 1.3.1. https://discord.com/channels/727847839631278110/1538366759269044334
- Compendium folders differ only by capitalization. dnd5e 5.3.3. https://discord.com/channels/727847839631278110/1536522446818123938
- Starship sidebar inaccessible until dnd5e was set to 5.2.5. Reporter said that worked. https://discord.com/channels/727847839631278110/1502642705149333525
- Not working on stable v13, answered as not yet updated (2025-09). https://discord.com/channels/727847839631278110/1414663777860976732
- Cannot wrap `ActorSheet5eCharacter.prototype.getData`. dnd5e 5.1.4, SW5e 1.2.5. https://discord.com/channels/727847839631278110/1414105787843870731
- Module error on dnd5e 5.2.5 with SW5e 1.2.7, then rollback to 5.1.1. https://discord.com/channels/727847839631278110/1479493014039691284
- `#general-kenobi` sheet collapse on Foundry 14 / dnd5e 6.0.3, blank tabs on a newer dnd5e build that worked after 5.2.5, and character-creation errors that worked on 13.351 / 5.2.5.

Thread text says fixed in a named later build. Not re-verified here, and not treated as open: — Superseded, 2026-10-08: a “fixed,” “marked fixed,” promised, or partial-fix reply does not close these. See “Reported fixed, not independently verified” in the addendum.

- Blasters and ammo, including reload and explosive quantity. Fixed in 1.3.9. https://discord.com/channels/727847839631278110/1521922995374002266
- Upscaling cost. Fixed in 1.4.0. https://discord.com/channels/727847839631278110/1534069363143872562
- Force power DCs. Fixed in 1.3.9. https://discord.com/channels/727847839631278110/1521956959442440314
- Superiority tracker edit. Fixed in 1.3.9. https://discord.com/channels/727847839631278110/1522475522347499611
- Superiority dice not granted on Fighter. Fixed in 1.3.9. https://discord.com/channels/727847839631278110/1521934226151178373
- Monsters doubling modifiers. Fixed in 1.3.9. https://discord.com/channels/727847839631278110/1521957947603943434
- Dark-mode console errors. Fixed in 1.3.9. https://discord.com/channels/727847839631278110/1522331637797355590
- Theme legibility. Fixed in 1.3.9. https://discord.com/channels/727847839631278110/1521970911056498869
- Imported force-power limit stays 0. Fixed in 1.3.9. https://discord.com/channels/727847839631278110/1522483740108914758
- Pause icon. Fixed in 1.3.9. https://discord.com/channels/727847839631278110/1522488384801472603
- Starship size token dimensions. Fixed in 1.3.7. https://discord.com/channels/727847839631278110/1511526267583725659
- Dark mode text. dnd5e 5.2.5, SW5e 1.3.8, later marked fixed. https://discord.com/channels/727847839631278110/1526353044948648008
- Arcana still on the sheet. Marked fixed. https://discord.com/channels/727847839631278110/1508616850026790993
- Favorite skill icons. Marked fixed. https://discord.com/channels/727847839631278110/1508616442851889202
- Sidebar edit resets the sheet to Home. Marked fixed. https://discord.com/channels/727847839631278110/1495659128968843365
- Monster damage bonus added twice. Marked fixed. https://discord.com/channels/727847839631278110/1494164819815960646
- Cargo tab. Marked fixed. https://discord.com/channels/727847839631278110/1493500056236724337
- Systems tab blue outline. Marked fixed. https://discord.com/channels/727847839631278110/1495989225387065506
- How to start a ship. Marked fixed. https://discord.com/channels/727847839631278110/1486848094825091143
- Items deleted from fields. Marked fixed. https://discord.com/channels/727847839631278110/1494771901019721839
- Ships so far, cargo and weapon UI. Marked fixed. https://discord.com/channels/727847839631278110/1485848919127752735
- FP and TP bars on 1.2.9 / 1.3.1. Marked fixed. https://discord.com/channels/727847839631278110/1485857875560759306
- Status icons. Marked fixed. https://discord.com/channels/727847839631278110/1494303864923623484
- Powercasting save DC. Marked fixed. https://discord.com/channels/727847839631278110/1486840491806036028
- Weapon and armor proficiency options. Marked fixed. https://discord.com/channels/727847839631278110/1486809795213398078
- Enhanced property checks every property. Marked fixed on the v13 sheet thread. https://discord.com/channels/727847839631278110/1435318507712544858
- Compendium folder sort. Reporter closed it. https://discord.com/channels/727847839631278110/1486823584889569341
- Credits data path. User closed it. https://discord.com/channels/727847839631278110/1504532465677635635
- Guns and reload. A partial next-release fix was stated on an older thread. https://discord.com/channels/727847839631278110/1311109815849975808

Older or different-system reports, how-to posts, feature requests, and guidelines. Each was read. They are not open v13 / 5.2.5 defects from the text in hand: — Superseded, 2026-10-08, for any item below whose dnd5e version was not stated, and for any close that rests on “marked fixed” or a promised fix. Those are in the addendum. A thread that itself names a different Foundry or dnd5e version stays out of scope.

- NPCs can't use force, maneuvers, or tech powers. Reporter was told to move to Foundry v13 and 1.4.2. https://discord.com/channels/727847839631278110/1538565133196988487
- Fighter superiority dice. Foundry v13, dnd5e 5.2.5, SW5e 1.3.8. Reply attributed it to the editable-tracker change and pointed at the beta thread marked fixed in 1.3.9. https://discord.com/channels/727847839631278110/1522374346218410177
- Scholar maneuvers do not reduce the Academic Superiority counter. dnd5e 5.2.5, SW5e 1.3.3. Reply said tracking would move to the actor. https://discord.com/channels/727847839631278110/1508615795897401485
- Deployment advancement follows character level. Foundry 13.351, dnd5e 5.2.5, SW5e 1.3.4. Pilot advancement is now `[]`. https://discord.com/channels/727847839631278110/1509135686312267866
- Advancement not created for most deployments. Same versions. Pilot-only at the time. Other deployments stay in the crew retest above, not as a second open defect. https://discord.com/channels/727847839631278110/1509134118494011422
- Food capacity request. https://discord.com/channels/727847839631278110/1525287874881130601
- Max fires per round request. https://discord.com/channels/727847839631278110/1525286019128365167
- Crew search and spoiler request. https://discord.com/channels/727847839631278110/1525289351645368371
- Ship saving-throw proficiency control request. https://discord.com/channels/727847839631278110/1512572315177848923
- Misc feature requests. https://discord.com/channels/727847839631278110/1512577573086040144
- Beta test procedure. https://discord.com/channels/727847839631278110/1260956278214234192
- Module-issues guidelines. https://discord.com/channels/727847839631278110/1353716721785110619
- 1.3.3 to 1.3.4 release question. https://discord.com/channels/727847839631278110/1498434142533324960
- 1.2.9 beta announcement. https://discord.com/channels/727847839631278110/1485843950647378093
- Elven Accuracy / Onslaught how-to. https://discord.com/channels/727847839631278110/1519058271216996506
- Corrupted PC after dragging a droid-brain mod. How-to recovery. https://discord.com/channels/727847839631278110/1503206162659807303
- Mandalorian Codex availability question. https://discord.com/channels/727847839631278110/1477126478305955972
- Spellcasting method for force powers. dnd5e 5.1.10. https://discord.com/channels/727847839631278110/1493640760963367094
- Force Recovery on short rest. Marked fixed. https://discord.com/channels/727847839631278110/1495531224742105138
- Force Sensitive powercasting how-to. dnd5e 5.1.x. https://discord.com/channels/727847839631278110/1485366090845393091
- Power levels and casting modifier. dnd5e 5.1.10. Marked fixed. https://discord.com/channels/727847839631278110/1446742565499179161
- Languages showing dnd5e values on 5.2.0. Marked fixed. https://discord.com/channels/727847839631278110/1445070265389420615
- Attunement how-to. https://discord.com/channels/727847839631278110/1445022013105242142
- Foundry v13 plans question. https://discord.com/channels/727847839631278110/1414735678859907244
- Leveling automation. dnd5e 4.4.2. https://discord.com/channels/727847839631278110/1411776102505910314
- Starfighter problems. dnd5e 4.3.9. https://discord.com/channels/727847839631278110/1410279493238784143
- Scholar Archaeologist discoveries twice. dnd5e 4.3.9. https://discord.com/channels/727847839631278110/1397996682343481455
- Artisan's Implements on v12. dnd5e 4.4.4. https://discord.com/channels/727847839631278110/1397632689191784458
- Powers dragged in after the first of a level. How-to. https://discord.com/channels/727847839631278110/1397742346400956558
- Brutal crit dice. How-to. https://discord.com/channels/727847839631278110/1379202066487971880
- Enhanced item property, older thread. https://discord.com/channels/727847839631278110/1372836946749161512
- Force/tech points on dnd5e 5.0.2. https://discord.com/channels/727847839631278110/1366829960664322108
- Droid customization invalid item type. dnd5e 4.4.1. https://discord.com/channels/727847839631278110/1368594712960962642
- Changing the force ability. Foundry v12. https://discord.com/channels/727847839631278110/1366901154973224971
- New characters missing gear prompts. dnd5e 4.3. https://discord.com/channels/727847839631278110/1368598555303874671
- Bowcaster measured template. dnd5e 4.3. https://discord.com/channels/727847839631278110/1358539441966284910
- NPC sheets and classes. Foundry v12, dnd5e 4.3.9. https://discord.com/channels/727847839631278110/1455760232150994965
- Racial AC Hide forces 0. dnd5e 5.1.10. https://discord.com/channels/727847839631278110/1450664892142190753
- v13 powers stuck at +0. dnd5e 5.1.10. https://discord.com/channels/727847839631278110/1435316447751573635
- Cannot manually modify force or tech points. dnd5e 5.1.10. https://discord.com/channels/727847839631278110/1435630633723494481
- Archetypes cannot be added to the class list. dnd5e 5.1.10. How-to, drag onto the sheet. https://discord.com/channels/727847839631278110/1443114246283198658
- 1.2.6 changelog request. https://discord.com/channels/727847839631278110/1435303134380429413
- Tool list is stock dnd5e. dnd5e 5.1.10. https://discord.com/channels/727847839631278110/1435310121445232690
- Modifications in a container. dnd5e 4.1.2. https://discord.com/channels/727847839631278110/1316258828051808267
- Slug cartridges not in the ammo list. https://discord.com/channels/727847839631278110/1311721069769527346
- Jedi Padawan Robe AC. https://discord.com/channels/727847839631278110/1311470046467461170
- Wookiee Hide AC. https://discord.com/channels/727847839631278110/1311421540776284220
- Feature recharge migration called a dnd5e issue. https://discord.com/channels/727847839631278110/1311181944322785280
- Unable to open NPC sheets. https://discord.com/channels/727847839631278110/1263272331925520454
- Backgrounds do not add skills. https://discord.com/channels/727847839631278110/1263269271564451931
- Modifications dropped from the dnd sheet. https://discord.com/channels/727847839631278110/1262977820569899040
- Force migration error. Foundry v12 build 328. https://discord.com/channels/727847839631278110/1262971790007734362

## 5. Remaining coverage limitations

This audit is not exhaustive.

`#sw5e-module-issues` (`1353452832761708554`) and `#beta-testing` (`1260953943609966663`): `discord_list_tickets` with `includeArchived: true` returned `truncated: false` and `warnings: []`. Every public thread from those lists was read except the beta procedure thread, which is only partly paged. Private threads and archived-private threads were not returned and are outside this scope.

Beta Test Procedure (`1260956278214234192`): `discord_read` limit 12. Oldest cursor `1260956278214234192`. Newest cursor returned `1435730712375590952`. Channel `lastMessageId` is `1511568872959115354`. The unread tail was not paged. The portion read is a posting guide.

`#general-kenobi` (`727848682786914316`): pages of limit 100, `includeImages: false`. Newest message in the channel window is `1556746587634401402` (2026-10-05). Oldest message read is `1511901874163548330` (2026-06-04). Backward cursors used include `1543131329468825691`, `1532932785889738754`, `1527165721606488084`, `1523557953410564209`, `1521152439967809556`, and `1514927457994805409`. Stop reason: paging stopped while the channel was still in the Foundry v13 period. Messages before `1511901874163548330` can still apply to Foundry v13, so that older history stays inside the defined scope and is unread. Channel history before a true pre-v13 stop was not reached.

Dev Fixed tags were not used by themselves to include or exclude a report. A missing dnd5e version did not drop a report. "Not shown as fixed" was not treated as proof of an unfixed bug.

---

## Addendum — 2026-10-08 — Evidence classification correction

### Reason

The sections above used “confirmed unresolved defect,” “source now matches,” and “marked fixed” as closures. Those labels are stronger than the evidence. This addendum corrects the classifications only.

### Supersedes

- Section 1’s defect label for Commando, Demolitions.
- Section 2’s implication that the listed reports are open defects rather than unverified reports.
- The Force-Sensitive baseline phrase “a caster with no points” in section 4.
- The section 4 claim that current source matching an expectation closes Armor Class Improvement, hull and shield dice per tier, and Role Specialization.
- The section 4 closure of reports based only on “Fixed in …,” “Marked fixed,” a fix said to be in progress, or a partial next-release fix. That includes the Scholar maneuver reply that tracking would move to the actor, the Fighter superiority reply that pointed at the 1.3.9 beta thread, and Force Recovery, power levels, and languages where the close depended on a fix statement.

The superseded content above is retained as historical evidence and must not be deleted.

Version-mismatch closures stay in effect where the thread itself names a runtime other than Foundry v13 / dnd5e 5.2.5, or the reporter said the problem stopped after returning to 5.2.5. Those closures do not depend on a fix tag. How-to posts, feature requests, guidelines, and release questions stay non-defect posts.

### Revised decision or behavior

No defect was reproduced during this audit. Prior validated fixes stay closed. A Discord report reopens one of them only when it describes a different case, and that difference is stated below.

**Preserved validated fixes**

- Starship weapon damage applies Wisdom before the routing early return in `onStarshipWeaponPreRollDamage`. `shouldUseStarshipWisAttackAbility` is unchanged. The crew thread’s request to base damage on Strength is a different case and was not tested.
- Play mode hides a power meter when effective max is 0 and caster level is 0, for a caster with no point pool. Edit keeps the meter and the configure control. The validated case is that baseline only.
- Pilot `system.advancement` is `[]` in `packs/_source/deployments/pilot/pilot.yml`. That verdict is only the Pilot advancement array.
- Weapon `system.firingArc` and `system.turreted` exist, and the sheet control plus inventory subtitle were checked in Foundry. Pack fill of stored arcs was not part of that validation and is not claimed fixed or broken.

**Confirmed source observations**

These are stored or code values read in the repo. They are not reproduced defects, and they do not by themselves prove a fix.

- Commando, Demolitions, `packs/_source/snv-monsters/humanoid/commando-demolitions.yml`, thread https://discord.com/channels/727847839631278110/1552841363178127420. Hidden Blade stores `damage.parts` `1d4+6` and `damage.base`. `attack.bonus` is `"11"` with `flat: true`. All six saves are `proficient: 0`. No item in that file is named Volatile Reflexes. Authoritative reference: not identified. No runtime error was demonstrated. The statblock is not classified as defective. The reported IWS change from `1d8+6` to `1d8`, and skill modifiers rising after an ability change, were not rolled. Sith Usurper was not checked.
- YT-1300 Modified stores `baseTurnSpeed` 200 and movement fly 350 / turn 150. Expected behavior and a reference were not established. This is a stored difference, not a defect.
- Armor Class Improvement stores effect value `(@details.tier)-1`. Starship roll data can inject `details.tier`. The reported -1 AC was not opened on a sheet. https://discord.com/channels/727847839631278110/1512571168962383882
- `getStarshipHullShieldDicePerTierGain` returns 1, and returns 2 for Huge and Gargantuan. The reported extra die on Tiny through Large was not opened on a sheet. https://discord.com/channels/727847839631278110/1525286608058712156
- Some Role Specialization item names exist under Drake’s Shipyard and starship features. A complete mastery checklist was not made. https://discord.com/channels/727847839631278110/1512573420481810534
- No `min1max1` string was found in `scripts/`. Actor save formulas were not checked, so the save report stays unverified. https://discord.com/channels/727847839631278110/1525290043550335066
- Repair code for item type `sw5e-mod-slots.modification` is on `v.next`. That does not show the reported world migration succeeding. Do not migrate a world. https://discord.com/channels/727847839631278110/1553075368863207494

**Reproduced defects**

None. This correction did not roll, open, or migrate anything in Foundry.

**Reported fixed, not independently verified**

A later message said fixed, marked fixed, in progress, or partly fixed. This audit did not reproduce the fix.

- Blasters and ammo, reload, and explosive quantity. “Fixed in 1.3.9.” https://discord.com/channels/727847839631278110/1521922995374002266
- Upscaling cost. “Fixed in 1.4.0.” https://discord.com/channels/727847839631278110/1534069363143872562
- Force power DCs. “Fixed in 1.3.9.” https://discord.com/channels/727847839631278110/1521956959442440314
- Superiority tracker edit. “Fixed in 1.3.9.” https://discord.com/channels/727847839631278110/1522475522347499611
- Superiority dice not granted on Fighter. “Fixed in 1.3.9.” https://discord.com/channels/727847839631278110/1521934226151178373
- Fighter PCs have no superiority dice. The reply pointed at that 1.3.9 report. Foundry v13, dnd5e 5.2.5, SW5e 1.3.8. https://discord.com/channels/727847839631278110/1522374346218410177
- Monsters doubling modifiers. “Fixed in 1.3.9.” https://discord.com/channels/727847839631278110/1521957947603943434
- Dark-mode console errors. “Fixed in 1.3.9.” https://discord.com/channels/727847839631278110/1522331637797355590
- Theme legibility. “Fixed in 1.3.9.” https://discord.com/channels/727847839631278110/1521970911056498869
- Imported force-power limit stays 0. “Fixed in 1.3.9.” https://discord.com/channels/727847839631278110/1522483740108914758
- Pause icon. “Fixed in 1.3.9.” https://discord.com/channels/727847839631278110/1522488384801472603
- Starship size token dimensions. “Fixed in 1.3.7.” https://discord.com/channels/727847839631278110/1511526267583725659
- Dark mode text. Later marked fixed. https://discord.com/channels/727847839631278110/1526353044948648008
- Arcana still on the sheet. Marked fixed. https://discord.com/channels/727847839631278110/1508616850026790993
- Favorite skill icons. Marked fixed. https://discord.com/channels/727847839631278110/1508616442851889202
- Sidebar edit resets the sheet to Home. Marked fixed. https://discord.com/channels/727847839631278110/1495659128968843365
- Monster damage bonus added twice. Marked fixed. https://discord.com/channels/727847839631278110/1494164819815960646
- Cargo tab. Marked fixed. https://discord.com/channels/727847839631278110/1493500056236724337
- Systems tab blue outline. Marked fixed. https://discord.com/channels/727847839631278110/1495989225387065506
- How to start a ship. Marked fixed. https://discord.com/channels/727847839631278110/1486848094825091143
- Items deleted from fields. Marked fixed. https://discord.com/channels/727847839631278110/1494771901019721839
- Ships so far. Marked fixed. https://discord.com/channels/727847839631278110/1485848919127752735
- FP and TP bars on 1.2.9 / 1.3.1. Marked fixed. https://discord.com/channels/727847839631278110/1485857875560759306
- Status icons. Marked fixed. https://discord.com/channels/727847839631278110/1494303864923623484
- Powercasting save DC. Marked fixed. https://discord.com/channels/727847839631278110/1486840491806036028
- Weapon and armor proficiency options. Marked fixed. https://discord.com/channels/727847839631278110/1486809795213398078
- Enhanced property on the v13 sheet thread. Marked fixed. https://discord.com/channels/727847839631278110/1435318507712544858
- Guns and reload. A partial next-release fix was stated. https://discord.com/channels/727847839631278110/1311109815849975808
- Scholar maneuvers and the Academic Superiority counter. The reply said tracking would move to the actor. dnd5e 5.2.5, SW5e 1.3.3. https://discord.com/channels/727847839631278110/1508615795897401485
- Advancement editing unusable on the new themes. A fix was said to be in progress. dnd5e 5.2.5, SW5e 1.3.9. https://discord.com/channels/727847839631278110/1532109201420063000
- Fighters and Scholars default to 0 superiority dice. Related threads say fixed in 1.3.9. dnd5e version missing. https://discord.com/channels/727847839631278110/1527150277738762421
- Force Recovery on a short rest. Marked fixed. dnd5e version missing. https://discord.com/channels/727847839631278110/1495531224742105138
- Compendium folder sort. The reporter later closed it. Not independently checked. https://discord.com/channels/727847839631278110/1486823584889569341
- NPCs cannot use force, maneuvers, or tech powers. The reply pointed them at a 1.4.2 pre-release and a Foundry v13 update. NPC power use on dnd5e 5.2.5 was not shown. https://discord.com/channels/727847839631278110/1538565133196988487

**Unverified reports and unknown runtime applicability**

Not rolled or opened in Foundry for this audit. Where dnd5e 5.2.5 is named, the report is unverified on the target runtime. Where it is not named, applicability is unknown. Neither state is a confirmed defect.

Distinct from the preserved fixes:

- Empty point bars. A fighter with use-based powers. That is not caster level 0 with no point pool. https://discord.com/channels/727847839631278110/1551311879782273205
- Force and tech bars disappear after an update, including a later SW5e 1.3.9 / dnd5e 5.2.5 report. That is not the Play-mode hide. https://discord.com/channels/727847839631278110/1435283197209346108
- Crew proficiency. Pilot advancement `[]` stays closed. Still unverified: skill and weapon-attack proficiency, non-pilot crew, deployments other than Pilot, attack rolls deducting positive Dex, Strength-based damage, Drake data freshness, modification descriptions, duplicated effects, and a missing Tier 3 Medium Versatile Transport. https://discord.com/channels/727847839631278110/1548441058432786472
- Ship shield attribute bar. Stock `sw5e.starshipShields` was not retested. The report also names Bar Brawl. https://discord.com/channels/727847839631278110/1553485973185106030
- Granting traits. Foundry 13.350, dnd5e 5.2.5, SW5e 1.3.3, reported again on 2026-09-29. A fresh feature was not reproduced in the thread. https://discord.com/channels/727847839631278110/1509632888516382851
- Deployment advancement for deployments other than Pilot. The Pilot array verdict does not cover them. https://discord.com/channels/727847839631278110/1509134118494011422
- Adding Pilot used to offer ranks from character level. The stored Pilot advancement is now `[]`. Whether a current drag still offers those ranks was not retested. https://discord.com/channels/727847839631278110/1509135686312267866

Other unverified target-runtime reports:

- Starship power storage. dnd5e 5.2.5, SW5e 1.3.6. https://discord.com/channels/727847839631278110/1512144484429861036
- Hull and shield dice do not update with tier and cannot be edited or spent. dnd5e 5.2.5, SW5e 1.3.6. Derivation in code was not opened on a sheet. https://discord.com/channels/727847839631278110/1512569870699593838
- Two crew lists. dnd5e 5.2.5, SW5e 1.3.6. https://discord.com/channels/727847839631278110/1512143520696238241
- SW5e tools missing on new characters. Foundry 13.350, dnd5e 5.2.5, SW5e 1.2.9. https://discord.com/channels/727847839631278110/1486052081654698144

dnd5e version not stated:

- Module not migrating. Foundry 13.351, SW5e 1.4.3. https://discord.com/channels/727847839631278110/1553075368863207494
- Power DC set to 0. SW5e 1.3.9. https://discord.com/channels/727847839631278110/1527149858731982939
- Starship armor on the Features tab. SW5e 1.3.9. https://discord.com/channels/727847839631278110/1525286810807308318
- Starship saves described as `1d20min1max1`. SW5e 1.3.9. https://discord.com/channels/727847839631278110/1525290043550335066
- Move and turn speed overwritten by size and role features. SW5e 1.3.9. https://discord.com/channels/727847839631278110/1525289742114099322
- Token hull and shields combined. SW5e 1.3.6 or 1.3.9. https://discord.com/channels/727847839631278110/1525288344672800829
- Starship feature Uses column empty. SW5e 1.3.9. https://discord.com/channels/727847839631278110/1525286984136790076
- Scout Superiority Style dice and save DC. Foundry 13.347, SW5e 1.3.9. https://discord.com/channels/727847839631278110/1526956691197788263
- Theme legibility. SW5e 1.3.9. https://discord.com/channels/727847839631278110/1526403683250733166
- Theme selection boxes. Versions not stated. https://discord.com/channels/727847839631278110/1526407075607871508
- Starship sheet UI lag. SW5e 1.3.9. https://discord.com/channels/727847839631278110/1525291117837549668
- NPC force and tech point tracker. Versions not stated. https://discord.com/channels/727847839631278110/1418004417159889038
- Migration token images and a missing `item.system` warning. SW5e 1.4.2. https://discord.com/channels/727847839631278110/1536561790538743808
- No Force Points or Tech Points. Versions not stated. https://discord.com/channels/727847839631278110/1435367043632468073
- Kushiban AC stays 0. dnd5e not stated on that message. https://discord.com/channels/727847839631278110/727848682786914316/1521151927101165630
- Slug cartridges missing from ammo. Versions not stated. https://discord.com/channels/727847839631278110/1311721069769527346
- Jedi Padawan Robe AC. Versions not stated. https://discord.com/channels/727847839631278110/1311470046467461170
- Wookiee Hide AC. Versions not stated. https://discord.com/channels/727847839631278110/1311421540776284220
- Unable to open NPC sheets. Versions not stated. https://discord.com/channels/727847839631278110/1263272331925520454
- Backgrounds do not add skills. Versions not stated. https://discord.com/channels/727847839631278110/1263269271564451931
- Modifications dropped from the dnd sheet. Versions not stated. https://discord.com/channels/727847839631278110/1262977820569899040
- Enhanced item property, older thread. Versions not stated. https://discord.com/channels/727847839631278110/1372836946749161512

### Implementation impact

None. No code, pack, Git, or world files were changed.

### Validation impact

Section 5 coverage limitations are unchanged. No Foundry gate was added or checked. No earlier Pass or Fail was removed.

### Status

Classification corrected. No reproduced defects. Commando, Demolitions remains a source observation.

---

## Addendum — 2026-10-20 — Power bar reproduction

### Reason

The two power-resource reports were opened on temporary actors in Foundry 13.351 and dnd5e 5.2.5, on branch `v.next` at `49211d299`. The earlier unverified classification of those reports stays in the sections above.

### Supersedes

Nothing. The 2026-10-08 classifications, including the unverified empty-bar and disappearing-bar lines, remain as written.

### Reproduction

Temporary actors were created and deleted. `Actor.p7kygnlnyGlRxLDV` and `Actor.MtCUUXnpkRotQrTw` were still present afterward. No chat messages named `POWER BAR` remained.

Fighter, level 5, Force progression `none`, Tech progression `none`:

- Burst of Speed, school `uni`. `system.uses` max 3, spent 0, value 3, recovery long rest. Its activity consumes attribute `powercasting.force.points.value` by 2.
- Enhance Weapon, school `tec`. `system.uses` max 3, spent 0, value 3, recovery long rest. Its activity consumes `itemUses` by 1.
- Stored Force and Tech maximums were blank (`null`). Prepared level, maximum, and calculated maximum were all 0.
- Play showed no sidebar Force meter and no sidebar Tech meter.
- Edit showed `FORCE POINTS 0 / 0` and `TECH POINTS 0 / 0`, and each meter had the configuration control.
- Both power rows read `/ 3`. The uses nodes were `display: none`. They were not a visible empty uses bar.

Guardian, level 5, Force progression `full`, one owned Force power:

- Blank stored maximum. Prepared maximum 20, calculated maximum 20, level 5. Play showed `FORCE POINTS 0 / 20`.
- Current value set to 0, maximum still 20. Play still showed `FORCE POINTS 0 / 20`.
- Temporary maximum 5. Play showed `FORCE POINTS 0 / 25 +5`.
- Blank maximum again restored prepared maximum 20.

NPC with `details.powerForceLevel` 3 and no owned power: Play and Edit showed `FORCE POINTS 0 / 12`. Edit had the configuration control. Calculated maximum was 12.

A character with no class and no powers showed no meter in Play or Edit. The Edit configuration control appears when the meter is eligible, as on the fighter, not on a character who owns no Force or Tech power.

### Synthetic stored zeros

On the temporary Guardian only, stored Force `points.max` and `level` were set to 0. This was an injection. It is not evidence that an update wrote those zeros.

- Calculated maximum stayed 20. Prepared maximum became 0 and prepared level became 0.
- Play hid the Force meter.
- Edit still showed `FORCE POINTS 20 / 0` with the configuration control.
- Setting the stored maximum back to blank (`null`), with level left unset, restored prepared maximum 20 and level 5.

A separate injection stored maximum 0 and left level blank. Prepared level stayed 5 and prepared maximum stayed 0. Play and Edit both showed `FORCE POINTS 20 / 0`. That display follows the explicit maximum. It was not changed.

### Override inspection

`scripts/power-point-config.mjs` treats a stored maximum as an override when it is not `null`, `undefined`, or `""`. A blank field saves `null`. The hint says to leave the maximum blank to use the calculated maximum. The character runtime flag `hasOverride` stays `false` even when the stored maximum is 0. The prepared pool still keeps that 0, because `??=` does not replace it and the bonus pass skips a maximum that is not `null`.

Observed split:

- Blank maximum: calculated 20, prepared 20.
- Stored maximum 0: calculated 20, prepared 0.

A stored 0 is the override. A blank maximum is the automatic calculation. The automatic path was not suppressed. `resolvePreparedPowersKnownMax` was not applied to `points.max`.

### Revised decision or behavior

No source edit. Play already hides the fighter meters, and Edit already keeps them as the configuration entry. The synthetic Play hide happened only after an explicit stored level of 0 and an explicit stored maximum of 0, which is the existing level-0, no-pool hide. Replacing that 0 with the class calculation would discard an explicit override.

### Implementation impact

None. `scripts/patch/powercasting.mjs`, `scripts/power-point-config.mjs`, packs, migrations, localization, and CHANGELOG were not edited.

### Validation impact

No earlier gate was added, removed, or checked off. The observations above are the 2026-10-20 reproduction record.

### Status

Recorded. Both reports match current Play and Edit behavior. No defect fix was authorized by the gate.

---

## Addendum — 2026-10-20 — Starship power storage

### Reason

The report that starship power storage cannot be edited, spent, or refilled was checked on a temporary starship. The Discord channel `1512144484429861036` was checked once and is still inaccessible to the configured bot. The test used the audit sentence only: edit, spend, and refill from the sheet. Earlier classifications above are unchanged.

### Supersedes

Nothing.

### Reproduction

Runtime: Foundry 13.351, dnd5e 5.2.5, branch `v.next` at `49211d299`. The module version string in the running world is `#{VERSION}#`.

Storage is the six legacy power-die slots. Current and maximum are stored on `flags.sw5e.legacyStarshipActor.system.attributes.power.<slot>`. The vehicle `system.attributes.power` object stayed `null` after every save. Preparation reads the flag last, so the flag is the value that comes back.

A new equipment item did not keep `cscap` or `sscap`. The retained ARC-170 coupling item also has those fields null. This run therefore had coupling caps of 0. Central and Engines still differed because their stored maximums differed.

Temporary starship, starting Central value 2 / stored max 0 and Engines value 1 / stored max 4:

- Play showed Central `2 / 2` and Engines `1 / 4`. Edit showed stored max 0 and 4, with the hint that Play shows 2 while the stored Central max is 0. Display max was the current value when the stored max was 0. It was not a coupling cap.
- Edit changed Central current to 5 and Engines current to 2. Both flags updated. Sheet reopen kept 5 and 2.
- Edit changed Central max to 8 and Engines max to 3. Reopen kept Central `5 / 8` and Engines `2 / 3`.
- Spend on Central and Engines changed the stored values from 5 and 2 to 4 and 1. Play then showed `4 / 8` and `1 / 3`.
- Recover Power, with 2 dice allocated as 1 Central and 1 Engines, changed the stored values to 5 and 2. Play showed `5 / 8` and `2 / 3`.
- A second temporary ship had Central `0 / 4` and Engines `3 / 3`. Spend on the empty Central slot left the stored value at 0. The Engines recover checkbox was disabled. The Central recover checkbox stayed available because its stored max was 4 and its current value was 0.

The Spend button’s `disabled` state is cleared for every slot while the sheet is editable, including a slot at 0. The spend action still refuses a current value below 1, and the stored value does not change.

### Revised decision or behavior

Not reproduced. No source change.

### Implementation impact

None. No runtime, template, pack, migration, localization, or CHANGELOG file was edited.

### Validation impact

No earlier gate was changed. The checks above are the 2026-10-20 storage record.

### Status

Not reproduced. Temporary actors and their chat were deleted. The retained manual-test actors were not edited.

---

## Addendum — 2026-10-20 — Hull and shield dice

### Reason

The report that hull and shield dice do not update with tier and cannot be edited or spent was checked on temporary starships. Discord channel `1512569870699593838` was checked once and is still inaccessible. The test used the audit sentence. Earlier classifications above are unchanged.

### Supersedes

Nothing.

### Reproduction

Runtime: Foundry 13.351, dnd5e 5.2.5, branch `v.next` at `49211d299`.

Dice maximum is `start + (gain × tier)`. Medium gains 1 die per tier from 5 `d8`. Huge and Gargantuan gain 2, from 9 `d12` and 11 `d20`. Spent dice are `hullDiceUsed` and `shldDiceUsed` on the size item. The denomination is displayed and is not an editable field.

Tier and edit, before the correction:

- Medium tier 0 showed `5 / 5 d8` for both pools. Tier 2 showed `7 / 7 d8`. Tier 1 showed `6 / 6 d8`.
- The Edit cog saved hull current 4 (`hullDiceUsed` 2) without changing shield dice, and shield current 5 (`shldDiceUsed` 1) without changing hull dice. Reopen kept both.
- Recharge rolled one hull die, raised hull points from 20 to 25, and restored shield points and shield dice. `hullDiceUsed` stayed 2. The hull spend was lost.
- An empty hull pool showed "No Hull Dice remaining" and did not change the used count.
- Refitting with only hull dice spent returned that used count to 0.

Cause: Recharge writes the hull spend and the shield-dice restore as two full copies of `flags.sw5e.legacyStarshipSize` on the same item. The second copy still has the old hull used count and replaces the first. Refitting has the same shape when both pools are spent. The tier calculation and the cog save were not the failure.

### Revised decision or behavior

`applyRechargeRepair` and `applyRefittingRepair` now write one size-item update that applies both counters. Recharge still restores unspent shield dice when it refills shields. That existing restore is separate from the hull spend.

After reloading the module:

- The same Medium setup, hull used 2 and shield used 1, spent one hull die. Hull became `3 / 6` and hull points rose from 20 to 28. Shield dice returned to `6 / 6` through the existing recharge restore.
- Regen, after shield points were lowered to 5, spent one shield die. Shield became `5 / 6` and shield points rose from 5 to 13. Hull stayed `3 / 6`.
- Regen on a shield pool at `0 / 6` left `shldDiceUsed` at 6.
- Refitting with hull used 4 and shield used 6 returned both pools to `6 / 6`.
- Huge tier 0, 2, and 1 showed `9 / 9 d12`, `13 / 13 d12`, and `11 / 11 d12`.
- Gargantuan tier 0 and 1 showed `11 / 11 d20` and `13 / 13 d20`.

### Implementation impact

`scripts/starship-repair.mjs` only. No pack, migration, localization, or CHANGELOG edit.

### Validation impact

No earlier gate was changed. The checks above are the 2026-10-20 dice record.

### Status

Tier update and count editing were not the defect. The spend overwrite was reproduced and corrected. Temporary actors and their chat were deleted. The retained manual-test actors were not edited.

---

## Addendum — 2026-10-20 — Two crew lists

### Reason

The report that the starship sheet has two crew lists that track actors separately was checked on one temporary starship. Discord channel `1512143520696238241` was checked once and is still inaccessible. The test used the audit sentence: two crew lists track actors separately. Earlier classifications above are unchanged.

### Supersedes

Nothing.

### Reproduction

Runtime: Foundry 13.351, dnd5e 5.2.5, branch `v.next` at `a4b1308ea`. Module `sw5e-module` was active.

Visible interfaces on the temporary starship sheet:

- Core tab, **Flight Manifest**. This is the actor roster. Add, Pilot, Crew, Passenger, Set Pilot, and Remove write `flags.sw5e.legacyStarshipActor.system.attributes.deployment` (`pilot.value`, `crew.items`, `passenger.items`).
- Sidebar **Crew** and **Passengers** in Edit mode. These are capacity inputs, `system.crew.max` and `system.passengers.max`. They are not an actor list.
- The stock dnd5e **Crew & Passengers** tab (`data-tab="crew"`, label `DND5E.VEHICLE.Tabs.CrewPassengers`) is removed from the starship sheet tabs. It was not on the rendered nav.

The Deployments block inside Flight Manifest did not appear. The assigned rank-1 Gunner is the parent deployment, and that block lists deployment features of assigned actors. It is not a second actor store.

Flight Manifest, through its own controls:

- Add as Crew wrote one crew UUID. `system.crew.value` and `system.passengers.value` stayed empty. The sidebar capacity groups did not gain an actor.
- Set Pilot wrote `pilot.value` to that actor and kept the same UUID in `crew.items`. The row badge changed from Crew to Pilot. The stock arrays stayed empty.
- Remove cleared pilot, crew, and passenger for that actor. Close and reopen kept the empty roster.
- Adding the same actor again left a single UUID and a single row.
- Adding a second actor as Passenger left the first actor in `crew.items` and put the second only in `passenger.items`.

Proficiency reads the deployment pilot and crew UUIDs. It does not read `system.crew`.

- With the rank-1 actor in Flight Manifest crew, Maneuvering (proficient) rolled `1d20 + 1`. The attack dialog for a temporary Laser cannon showed `1d20 - 5 + 0 + 1`.
- After Remove, with only the passenger remaining, Maneuvering rolled `1d20`. A new Laser cannon attack dialog showed `1d20 - 5 + 0`.
- Writing the rank-1 actor into `system.crew.value` while the deployment crew set was empty did not add a Flight Manifest row and did not change the roll. Maneuvering stayed `1d20`. That write was then cleared.

### Revised decision or behavior

Intentional separation. No source change. Flight Manifest is the actor roster and the proficiency source. The stock crew actor list is not shown on the starship sheet, and `system.crew` / `system.passengers` are not kept in sync with the deployment flags. Hiding that stock tab is already the sheet behavior. Copying one list into the other was not done.

### Implementation impact

None. No runtime, template, pack, migration, localization, or CHANGELOG file was edited.

### Validation impact

No earlier gate was changed. The checks above are the 2026-10-20 crew-list record.

### Status

Not a broken save or display path. Temporary actors and the chat created for this check were deleted. The retained manual-test actors were not edited.

---

## Addendum — 2026-10-20 — Granting Traits

### Reason

The report that Granting Traits does not apply traits from a newly created feature was checked on a temporary character. Discord thread `1509632888516382851` was checked once and is still inaccessible. The test used only the audit summary: the report was Foundry 13.350 / dnd5e 5.2.5 / SW5e 1.3.3; the thread reportedly did not reproduce it on a fresh feature; a later report said it was still present on 2026-09-29. No click sequence was invented from that summary. Earlier classifications above are unchanged.

### Supersedes

Nothing.

### Reproduction

Runtime: Foundry 13.351, dnd5e 5.2.5, branch `v.next` at `a4b1308ea`. Active modules: `lib-wrapper` and `sw5e-module`.

Granting Traits is the dnd5e Trait advancement. The sheet title is "Traits". The hint describes granting traits or a choice of traits. Configuration is `system.advancement[]` with `configuration.grants` and `configuration.choices`. The selected result is `value.chosen`. `TraitAdvancement.apply` writes the actor during the Advancement Manager. `reverse` runs when the feature is deleted with advancement removal checked. `apply` is not called when the advancement configuration is edited.

SW5e does not wrap Trait advancement. [scripts/patch/config.mjs](scripts/patch/config.mjs) spreads `CONFIG.DND5E.traits` and overrides armor (`system.traits.armorProf`), weapon (`system.traits.weaponProf`), and tool (`system.tools`). Skills stay on `system.skills`. Languages have no `actorKeyPath`, so dnd5e uses `system.traits.languages`.

Fresh features, added through the item Advancement control and the character drop flow, then completed in the Advancement Manager:

- Skills: Athletics `system.skills.ath.value` went from 0 to 1. Existing Acrobatics stayed 1. Close and reopen kept 1. Delete with advancement removal returned Athletics to 0 and left Acrobatics at 1. Adding the feature again restored Athletics once.
- Tools: `system.tools.chancecubes.value` went from 0 to 1. Removal returned it to 0. Re-add restored it once.
- Languages: `system.traits.languages.value` gained `binary`, lost it on removal, and gained it once on re-add.
- Weapon proficiencies: `system.traits.weaponProf.value` gained `ebl`, lost it on removal, and gained it once on re-add.
- Armor proficiencies: `system.traits.armorProf.value` gained `lgt`, lost it on removal, and gained it once on re-add.

A feature already on the character was then edited to add a Stealth grant. The item stored `configuration.grants: ["skills:ste"]` and `value.chosen` stayed empty. `system.skills.ste.value` stayed 0. Removing that feature and adding the configured feature again set Stealth to 1 once and left Acrobatics and Athletics at 1. That matches dnd5e: editing an embedded advancement does not rerun `apply`.

### Revised decision or behavior

Not reproduced on a fresh feature. The already-embedded edit is the expected remove-and-readd workflow. No source change.

### Implementation impact

None. No runtime, template, pack, migration, localization, or CHANGELOG file was edited.

### Validation impact

No earlier gate was changed. The checks above are the 2026-10-20 Granting Traits record.

### Status

Not reproduced for a new feature. Temporary actor `Dwx2Mo46c7VSZ43E`, the temporary features, and no chat messages were removed. The retained manual-test actors were not edited.

---

## Addendum — 2026-10-20 — Deployment rank workflow

### Reason

Verify that parent deployments stay manual: empty `system.advancement`, no Advancement Manager on drop, a persistent Deployment Rank control, and rank features added only through description links.

### Supersedes

No earlier decision is superseded. This records the 2026-10-20 verification of the manual parent-deployment workflow.

The earlier content above is retained as historical evidence and must not be deleted.

### Revised decision or behavior

Both reports are addressed or expected manual behavior. Source was left unchanged. No ItemGrant automation was added.

Baseline: branch `v.next`, HEAD `a4b1308ea5716ec45fb4ff0fdcd72ff208cd91e2`. The six parent source files were clean. Live world: Foundry 13.351, dnd5e 5.2.5, `sw5e-module` active.

Source and installed pack `sw5e-module.deployments`:

| Parent | Source file | Item id | `system.advancement` | `flags.sw5e.legacyDeployment` | Rank Features `@UUID` links |
| --- | --- | --- | --- | --- | --- |
| Pilot | `packs/_source/deployments/pilot/pilot.yml` | `TuvDqpPYOvnUGIoQ` | `[]` | present | 26 unique, all resolve |
| Gunner | `packs/_source/deployments/gunner/gunner.yml` | `8B0449FqtXP02WVs` | `[]` | present | 26 unique, all resolve |
| Coordinator | `packs/_source/deployments/coordinator/coordinator.yml` | `hx1NvLOzuEscPrJf` | `[]` | present | 26 unique, all resolve |
| Mechanic | `packs/_source/deployments/mechanic/mechanic.yml` | `NCOjzgFbOg6DsjSF` | `[]` | present | 26 unique, all resolve |
| Operator | `packs/_source/deployments/operator/operator.yml` | `6t3DOvGdpOMkYUtI` | `[]` | present | 26 unique, all resolve |
| Technician | `packs/_source/deployments/technician/technician.yml` | `goeBsNfPxPVrNanH` | `[]` | present | 26 unique, all resolve |

No malformed `@UUID` was found. Every description link uses `Compendium.sw5e-module.deployments.Item.<id>` and that id exists under `packs/_source/deployments`. Pilot’s source still stores ItemGrant entries under `flags.sw5e.legacyDeployment.advancement` (installed pack: 7 entries). The other five installed parents have an empty legacy advancement list. That legacy block was not copied into `system.advancement`. The installed pack matches source; it is not stale.

Drop results on temporary level-1 character `MkBIjbqdqYJiRGAc` and level-5 character `7eFmnbyRpQIq8DIi`:

- All six parents dropped onto the level-1 character with no Advancement Manager and no character-level feature choices. Embedded `system.advancement` was `[]` and `flags.sw5e.legacyDeployment` remained.
- Pilot dropped onto the level-5 character the same way: no manager, embedded advancement `[]`. Character level did not change the result.
- Each embedded description still contained the Rank Features heading and 26 `@UUID` links.
- The character Features tab showed a Deployment Rank select for every parent, options 0–5. Setting each select to 1, closing the sheet, and reopening kept `flags.sw5e-module.deployment.rank` at 1 and the select at 1.

Manual feature on the level-1 character, Pilot already at rank 1:

- Link `Compendium.sw5e-module.deployments.Item.HPbueMMRtKK6TcG2` resolved to Piloting Procedure. Its own `system.advancement` was `[]`.
- Dropping it added one embedded copy, `ojTmtwOil2pk79g7`, and did not open the Advancement Manager.
- Changing Pilot rank from 1 to 3 left that feature present exactly once and did not add another copy.
- The feature was then deleted by that recorded id.

### Implementation impact

None. No runtime, template, pack, migration, localization, or CHANGELOG file was edited. Packs were not rebuilt.

### Validation impact

No earlier gate was changed. The checks above are the 2026-10-20 deployment-rank record.

### Status

Expected manual behavior. Temporary actors `MkBIjbqdqYJiRGAc` and `7eFmnbyRpQIq8DIi` were deleted by id, which removed their embedded class and deployment items. Feature `ojTmtwOil2pk79g7` was deleted by id before the actor deletion. No chat was deleted. Protected actors `JBI4wzQrD5M7Bvau`, `AUBubx8m4G1hnJRs`, `p7kygnlnyGlRxLDV`, and `MtCUUXnpkRotQrTw` were still present and were not edited.

---

## Addendum — 2026-10-20 — SW5e tool list on new characters

### Reason

Verify the report that newly created characters lose the SW5e tool list while existing characters retain it.

### Supersedes

No earlier decision is superseded. This records the 2026-10-20 verification.

The earlier content above is retained as historical evidence and must not be deleted.

### Revised decision or behavior

Not reproduced on the current branch. The original report names SW5e 1.2.9. Source was left unchanged.

Discord `1486052081654698144` was checked once. No configured bot can access that channel. The only evidence used is the audit summary: Foundry 13.350, dnd5e 5.2.5, SW5e 1.2.9, unanswered. The original click sequence was not recovered.

Baseline: branch `v.next`, HEAD `a4b1308ea5716ec45fb4ff0fdcd72ff208cd91e2`. [scripts/patch/config.mjs](scripts/patch/config.mjs) was clean. Live world: Foundry 13.351, dnd5e 5.2.5, `sw5e-module` active. The only other active module was `lib-wrapper`. No other module wraps actor creation, sheets, traits, tools, or advancement.

`CONFIG.DND5E.tools` after ready, and again after the sheets were opened, had 55 keys. Every equipment id resolved. No duplicate labels. No stock fantasy keys such as `alchemist`, `bagpipes`, or `thief`. The keys `drum`, `flute`, `lute`, and `shawm` point at `Compendium.sw5e-module.equipment.Item` documents, not the stock dnd5e items. `toolProficiencies` is `artisan`, `game`, `music`, `specialist`, and `vehicle`. The trait actor path is `system.tools`.

Every config entry’s own `type` is `artisan` and its `ability` is `int`, because the UUID classifier looks for path segments that these `equipment.Item` ids do not contain. The tool cog does not use that field. It groups each resolved item by `system.type.value`. The visible categories were Artisan's Implements (16), Gaming Set (6), Musical Instrument (15), Specialist's Kit (18), and Vehicles (4). Opening a sheet did not change the config object.

Fresh characters were created with the Create Document flow:

- `BcK1wtVV3srsJslJ`, TOOL LIST TEST A, opened on Details immediately. `system.tools` was `{}` and the Tools box showed only the heading. That empty box is the dnd5e 5.2.5 tool field: it has no initial keys. Edit mode’s tool cog offered 64 labels, the five category rows plus the SW5e tools and the four vehicle types. Chance cubes was set to proficient, the sheet was closed and reopened, and `system.tools.chancecubes.value` stayed 1. Cycling that control back to 0 removed the key and the row.
- `JcMx3JPEHcKN5uXr`, TOOL LIST TEST B. World feature `Tv5owjN9JNgonU0Q` was created as a feature with one Trait advancement, grant `tool:game:chancecubes`. Dropping it opened the Advancement Manager and offered Chance cubes. Completing it embedded feature `LdruFq1FVOym4xAE` and set `system.tools.chancecubes.value` to 1. Delete with advancement removal checked removed that feature and set the value to 0. The key remained, so the Tools box showed Chance cubes +0. Re-dropping the same world feature embedded `g0cFGCBAyaOGCzLz` and set the same key back to 1. It did not add a second key or a second feature.

Comparison control `8hjGwHEigPzO0r9Q` was created before any source edit. Its Tools box started empty, `system.tools` was `{}`, and its cog offered the same 64 labels as character A. No stock fantasy tool was offered. Protected actors were not opened.

### Implementation impact

None. No runtime, template, pack, migration, localization, or CHANGELOG file was edited. Packs were not rebuilt.

### Validation impact

No earlier gate was changed. The checks above are the 2026-10-20 tool-list record.

### Status

Not reproduced. The report applies to SW5e 1.2.9 and was not reproduced on the current branch. Temporary actors `BcK1wtVV3srsJslJ`, `JcMx3JPEHcKN5uXr`, and `8hjGwHEigPzO0r9Q` were deleted by id. World feature `Tv5owjN9JNgonU0Q` was deleted by id. Embedded feature `LdruFq1FVOym4xAE` was deleted by its confirmation dialog before the actor deletion. Embedded feature `g0cFGCBAyaOGCzLz` was removed with actor B. An earlier mistaken tool item `HMe0ucl8dQfhN2jp` was deleted by id. No tokens were created. No new chat messages were created, and no chat was deleted. Protected actors `JBI4wzQrD5M7Bvau`, `AUBubx8m4G1hnJRs`, `p7kygnlnyGlRxLDV`, and `MtCUUXnpkRotQrTw` were still present and were not edited.

---

## Addendum — 2026-10-21 — Consolidated regression sweep

### Reason

One Foundry pass over the settled character and starship workflows. A narrow fix was applied only where pool derivation used the compendium size identifier `huge-starship` and therefore granted 1 die per tier instead of 2.

### Supersedes

No earlier decision is superseded. The 2026-10-20 hull/shield dice record remains: `getStarshipHullShieldDicePerTierGain("huge")` still returns 2. This addendum records that the live size feat identifier is `huge-starship`, and that the pool resolver now maps that form onto the profile key before the gain lookup.

The earlier content above is retained as historical evidence and must not be deleted.

### Baseline

Branch `v.next`, HEAD `a4b1308ea5716ec45fb4ff0fdcd72ff208cd91e2`. Live world: Foundry 13.351, dnd5e 5.2.5, `sw5e-module` active (`#{VERSION}#`). Other active modules: Bar Brawl 1.9.0 (already enabled; compatibility minimum 13.341, verified 13.351) and lib-wrapper 1.13.5.1. Bar Brawl was left enabled. Unrelated dirty pack databases were not touched. Protected actors were not opened. Prior approved `scripts/starship-repair.mjs` and the Commando IWS source were left as they were at the start of the sweep.

### Character regression results

- Non-caster `Jr5Go24K3PR27Z5m`, with Master Revitalize `bsTpTHfjG6KiNxfb` and Acid Dart `rplOmH6qIVSoQgF3`, no Force/Tech progression. Expected: Play hides the 0/0 sidebar meters; Edit keeps the meters and config buttons; item uses stay separate. Actual: Play had no `.sw5e-powercasting-meter`. Edit showed FORCE POINTS 0 / 0 and TECH POINTS 0 / 0 with config buttons. Acid Dart uses were 2 / 3 on the power row. Classification: passed. Source change: none.
- Caster `Pv3OrScAxM8wf24T`, class `3jtlglDMnoB5fjkk` at 3 levels with full Force progression, plus Master Revitalize `K7mzlVk2JqZ0ARVv`. Expected: Play shows the calculated pool; current 0 leaves the positive maximum visible; tempmax changes the effective maximum across close/reopen. Actual: the meter appeared once the actor owned a Force power and showed FORCE POINTS 0 / 12. After tempmax 4 it showed FORCE POINTS 0 / 16 +4 after close/reopen. Stored max stayed null. Classification: passed. Source change: none.
- Tools on `bCgwqMgszUEwXqUI`. Expected: empty Tools box, cog still offers the SW5e categories, one selection persists, the supported control removes it. Actual: the box started as the heading only. The cog offered 64 labels, including Artisan's Implements, Gaming Set, Musical Instrument, Specialist's Kit, and Vehicles. Chance cubes saved as `system.tools.chancecubes.value` 1 and cycling to 0 removed the key and the row. Classification: passed. Source change: none.
- Traits on the same actor. World feature `oCddyAIHoOeF7zdo`, advancement `regtrait00000001`, grant `skills:ath`. Expected: Advancement Manager applies the grant once, delete with advancement removal reverses only that grant, re-add does not duplicate. Actual: embedded `ebaqxZqUXFFcqUBC` set Athletics to 1 and left Acrobatics at 0. Delete with "Remove advancement changes" checked returned Athletics to 0. Re-add left one feature and Athletics at 1. An earlier embedded copy `DktMDJzeu8xsfr9J` disappeared during a dialog miss and was not the passing retest; the passing retest used `WThcOSilKnqsvded` then `ebaqxZqUXFFcqUBC`. Classification: passed. Source change: none.
- Deployments on the same actor. Gunner `59XwVOo6lzxDGH3p` from `8B0449FqtXP02WVs` and Pilot `a62lXsottizoMvhd` from `TuvDqpPYOvnUGIoQ`. Expected: no Advancement Manager, empty `system.advancement`, rank persists on `flags.sw5e-module.deployment.rank`, rank changes do not grant or remove features. Actual: both dropped with advancement length 0. Ranks persisted at 1 after close/reopen. Setting Gunner to 3 did not change the item count. Rank Features links remained. Classification: passed. Source change: none. Gunner was set back to rank 1 before the crew check.

### Starship regression results

- Power on Medium `72IvFKKaap6kLPQA`. Expected: Central and one subsystem persist on `flags.sw5e.legacyStarshipActor.system.attributes.power`, spend and recover change one die, zero does not store a negative value, and `system.attributes.power` stays null. Actual: sheet inputs persisted Central 2/5 and Engines 0/2 after reopen. Spend moved Central from 2 to 1 (chat `ExC0rdjueBu6tYFz`). Engines spend at 0 stayed 0. Recover of 1 Central die returned Central to 2 and left Engines at 0. `system.attributes.power` stayed null. Later recharge and refit refilled allocated slots to their maximum (Central 5/5, Engines 2/2) through the existing repair power-dice recovery. Classification: passed. The Engines spend button was still enabled at 0, and the handler refused the spend. That did not write an invalid value, so it was not changed. Source change: none.
- Dice on the same Medium ship, size feat `8j5nOq9lGAp2xD3G` (`medium-starship`), before the identifier fix. Expected: tier-1 d8 maximum 6 survives reopen; recharge raises hull points and spends one hull die without clearing shield dice used; regen spends one shield die and leaves the hull pool; refit returns both used counters to 0. Actual: tier 1, d8, hull 4/6 (used 2) and shields 5/6 (used 1) survived reopen. Recharge moved hull points from 12 to 20 and `hullDiceUsed` from 2 to 3 while `shldDiceUsed` stayed 1. Regen moved shield points from 0 to 12 and `shldDiceUsed` from 1 to 2 while `hullDiceUsed` stayed 3 and hull points stayed 20. The regen dialog opened with the expend option; the checkbox could not be toggled through the page script (`form.elements is not iterable`), so apply was the exported `applyRegenRepair(actor, {useShieldDie:true, chat:true})`. Refit set both used counters to 0, hull to 40/40, and shields to 20/20. Classification: passed. Source change: none for this path.
- Huge `QyRaHK08M13ABBL7`, size feat `QUK2pil5xOgd8ONW`. Expected: d12, and tier 1 adds 2 dice to the start of 9. Actual before the fix: tier 0 was 9/9 d12; tier 1 became 10/10 d12. `getStarshipHullShieldDicePerTierGain("huge")` returned 2, and the live identifier was `huge-starship`. Classification: reproduced defect. See the correction below. After the fix and a game reload, the sheet showed HULL DICE 11 / 11 d12 and SHIELD DICE 11 / 11 d12. Medium `medium-starship` at tier 1 stayed 6 d8. Gargantuan was not given its own actor; the same identifier mapping is covered by the offline test.
- Crew. Deploy actor `bCgwqMgszUEwXqUI` (Gunner rank 1, Dexterity 14, proficiency bonus 1) on the Medium ship's Flight Manifest. Expected: one skill roll and one weapon attack include proficiency once and do not subtract Dexterity; moving role does not duplicate the UUID; removal drops the bonus. Actual: a second crew deploy left a single `Actor.bCgwqMgszUEwXqUI`. Astrogation, which the blank ship does not have equipped, rolled `1d20 - 5` and did not add crew proficiency. Maneuvering was set to proficient on the legacy skill store so the crew bonus could be seen. That roll was `1d20 + 1`: ship Dexterity modifier 0, crew proficiency 1 once, crew Dexterity +2 absent. Setting pilot stored that UUID once in `pilot.value` and once in `crew.items`. Clearing pilot left the crew entry. Full removal emptied pilot, crew, and passenger, and the next Maneuvering roll was `1d20` with flavor "No crew PB applied". `system.crew.value` was not written. Classification: passed. Source change: none.
- Attack ability on Plasburst `GkKWaahbbfi0kPE1`. Expected: a blank weapon uses Wisdom; an explicit Strength setting is preserved and damage follows it. Actual: blank `shouldUseStarshipWisAttackAbility` was true. With Wisdom modifier +1 the attack was `1d20 + 1 + 0 + 1` and damage was `1d8 + 1`. The equipment item has no `system.ability` field. Setting the attack activity ability to `str` persisted, `shouldUseStarshipWisAttackAbility` became false, and with Strength modifier +3 the attack was `1d20 + 3 + 0 + 1` and damage was `1d8 + 3`. Crew Dexterity +2 was not subtracted. Classification: passed. Source change: none.
- Stock shield bar on token `Xzl9HdVE6hY5bWy0`. Expected: `sw5e.starshipShields` saves, reopens with current/max, and follows a shield change. Actual, with Bar Brawl already active: Token Config's Bar Brawl select listed Starship Shields. After save and reopen, `bar1.attribute` and the Bar Brawl bar were `sw5e.starshipShields`, current 20, max 20. Setting `system.attributes.hp.temp` to 11 changed `getBarAttribute("bar1")` to 11/20, and the reopened inputs showed 11 and 20. Classification: passed. The native resource selects are removed by Bar Brawl while it is active, so this stock read was taken through the token document and the hidden `bar1.attribute` field, not a Bar-Brawl-off config. Bar Brawl was not disabled. Source change: none.
- Quick-Charge Shield `jZnpI4QF87aE7a1U` (compendium `M7igMGsBIosGA4dS`) was embedded so regen had a coefficient. The installed document does not expose `system.attributes.regrateco`, while the source YAML stores `regrateco.value` 1.5. The fixture received that 1.5 on its own legacy equipment flag. Classification: stale installed document, not a sheet-control failure. Packs were not rebuilt.

### Bar Brawl compatibility

Bar Brawl 1.9.0 was already installed and already active. It was not downloaded. On the temporary token, the resource select included `sw5e.starshipShields` ("Starship Shields"). Saving and reopening kept that attribute. Current/max were 20/20, then 11/20 after the shield change. The sweep's console error collector recorded no errors during that config save and reopen. The module was left enabled, which was the baseline state. This result is separate from the stock `getBarAttribute` result above. Classification: passed for the installed 1.9.0 package. A world with Bar Brawl absent was not tested.

### Reproduced defects and corrections

Huge and Gargantuan compendium size feats use identifiers `huge-starship` and `gargantuan-starship`. `resolveStarshipSizeIdentifierForPools` passed that string to `getStarshipHullShieldDicePerTierGain`, which only returns 2 for the exact keys `huge` and `gargantuan`. The Huge fixture therefore gained 1 die at tier 1 (max 10) instead of 2 (max 11).

Correction: `canonicalizeStarshipSizeProfileKey` in `scripts/starship-data.mjs` maps a known profile key, or a known profile key plus the `-starship` suffix, onto the profile key. Other identifiers, including `colossal-homebrew`, stay unchanged and keep gain 1. The gain function was not changed.

Offline test added to `utils/test-starship-hull-shield-dice-tier.mjs`. Before the fix, Huge tier 1 with identifier `huge-starship` asserted 11 and got 10. After the fix, `node utils/test-starship-hull-shield-dice-tier.mjs` reported 27 passed. Foundry retest after reload: Huge sheet HULL DICE 11 / 11 d12 and SHIELD DICE 11 / 11 d12; Medium `medium-starship` tier 1 remained d8 max 6.

No migration, pack edit, or roster change was added.

### Deferred content audits

Left deferred, and not opened in this sweep: Drake's Shipyard numbers, modification descriptions, duplicated pack effects, the missing Tier 3 Medium Versatile Transport, and other SnV statblocks. Commando IWS was not reopened. The Quick-Charge Shield `regrateco` gap on the installed compendium document is recorded above and was not rebuilt.

### Cleanup

Deleted by recorded id: actors `Jr5Go24K3PR27Z5m`, `Pv3OrScAxM8wf24T`, `bCgwqMgszUEwXqUI`, `efAshrXeDmtEBjBQ`, `72IvFKKaap6kLPQA`, and `QyRaHK08M13ABBL7`; world feature `oCddyAIHoOeF7zdo`; token `Xzl9HdVE6hY5bWy0`; chat `ExC0rdjueBu6tYFz`, `vV4adxpmQq4BNlLp`, `HMNWW1DOcwDilJHZ`, `Av2hBeXvNxcT0nmD`, `4wo9GyuINNVUqyd2`, `7D7G3ZBWFg0wrfRX`, `fwTPsQRPA6L9ly3X`, `MyU2mtYixaaUXHCr`, `0sgsscDGYiCIZG0N`, `IWabIC4eKVNXZ5xt`, `PmNP7TVmqMaochev`, `n7vcxSdCYtdqTHGa`, `LxmrIMT07VPgoh0v`, `5b2VHOgIsc5T08f4`, `p3WvW13oLCWMYNA5`, `HasHKL7SELu5BnQU`, and `oSMBKPNCsTWC7YBZ`. Embedded items on those actors were removed with the actors. No unrecorded REGRESSION SWEEP actor remained. Protected actors `JBI4wzQrD5M7Bvau`, `AUBubx8m4G1hnJRs`, `p7kygnlnyGlRxLDV`, and `MtCUUXnpkRotQrTw` were still present and were not edited.

### Overall disposition

Character workflows, Medium dice repair, Flight Manifest, attack ability, and the shield token bar passed without a source change. The one reproduced defect is the Huge/Gargantuan compendium identifier, and that derivation is corrected and retested. Bar Brawl 1.9.0 accepted `sw5e.starshipShields` on the temporary token. Deferred content audits stay deferred. No commit, push, pack rebuild, or migration was made.

### Implementation impact

`scripts/starship-data.mjs` and `utils/test-starship-hull-shield-dice-tier.mjs` only. No template, pack, migration, localization, or CHANGELOG edit.

### Validation impact

No earlier gate was changed. The Foundry retest above is the 2026-10-21 confirmation for the identifier correction. Offline hull/shield dice tests: 27 passed.

### Status

Sweep complete. Huge tier gain corrected and retested in Foundry. Temporary documents deleted by id. Protected actors unchanged. Changes are uncommitted.

---

## Addendum — 2026-10-26 — Remaining v13 bug audit

### Reason

Classify what remained after the 2026-10-21 sweep. Run the Gargantuan tier check, the Engines Spend button check, and a read-only Quick-Charge Shield trace. Compare the named content reports without rewriting them.

### Supersedes

No earlier decision is superseded. Gargantuan live evidence is added beside the 2026-10-21 Huge result. The Engines Spend note in that sweep, that the button stayed enabled at 0, is the defect reproduced and corrected here.

The earlier content above is retained as historical evidence and must not be deleted.

### Baseline

Branch `v.next`, HEAD `592b0bd3801d5482ab250c44839f4df8df55ab83`. Live world: Foundry 13.351, dnd5e 5.2.5, `sw5e-module` active (`#{VERSION}#`). Other active modules: Bar Brawl 1.9.0 and lib-wrapper 1.13.5.1. `scripts/starship-data.mjs`, `scripts/patch/starship-sheet.mjs`, and `templates/starship-sheet-layer.hbs` were clean before this pass. Protected actors `AUBubx8m4G1hnJRs`, `JBI4wzQrD5M7Bvau`, `p7kygnlnyGlRxLDV`, and `MtCUUXnpkRotQrTw` were present and were not edited.

### Gargantuan tier check

Fixture actor `BdsHxKZ2reGwdeZd`, size item `sbR9MRdzWB4R447W` from compendium `FH8iBT4uujRUR0j7`. Live `system.identifier` was `gargantuan-starship`. Legacy identifier was `gargantuan`. Expected pools were 11, 13, and 15 `d20` at tiers 0, 1, and 2. Actual: tier 0 was 11/11 `d20`; tier 1 was 13/13 `d20`; tier 2 was 15/15 `d20`; returning to tier 1 restored 13/13. With hull used 1 and shield used 2, tier 2 stayed at those used counts and showed 14/15 and 13/15. Close and reopen kept `HULL DICE 14 / 15 d20` and `SHIELD DICE 13 / 15 d20`. Classification: passed. Source change: none.

### Engines Spend at zero

The same temporary starship stored Engines 0/2 and Central 2/5. In Play, every Spend button was enabled, including Engines, and none had `data-can-spend`. Clicking Engines left the stored value at 0 and created no chat. Central stayed 2. Classification: presentation defect. `applyCoreOperationsControlState` set Spend `disabled` from edit permission only, after the template had disabled a zero slot. Recover already kept its own `data-can-recover` lock.

Correction: the Spend button now sets `data-can-spend`, and the same post-render function disables it unless routing is editable and `data-can-spend` is `1`. Spending rules were not changed. After reload, Engines was disabled at 0 and the click did not change it. Central was enabled, a click moved it from 2 to 1, and chat `8nHjKBevDIc51baD` was created. Engines stayed 0.

### Quick-Charge Shield

Source [packs/_source/starships/starship-equipment/shields/quick-charge-shield.yml](packs/_source/starships/starship-equipment/shields/quick-charge-shield.yml), id `M7igMGsBIosGA4dS`, stores `system.attributes.regrateco.value` 1.5. The installed starships index field for that path is 1.5. The constructed compendium document is `EquipmentData`, whose schema has no `attributes` field. Its `_source.system.attributes` and live `system.attributes` do not contain `regrateco`. A fresh world copy `sBMkbf3j80doCDyx` also lacked it. Runtime still reads `system.attributes.regrateco.value`, `_source`, and the legacy equipment flag in `getStarshipShieldRegenRateMult`. Classification: DataModel cleaning drops the value. The installed pack is not missing the stored field. No source, schema, runtime, or pack file was edited.

### Content comparisons

No local Starships of the Galaxy text was found to cite as an expected number or a required feature. No content was created or rewritten.

- YT-1300, Modified `t5oz29L2QV5lFlYr`: `flags` legacy `baseTurnSpeed` is 200, and movement `fly` is 350 with `turn` 150. Expected value was not established. Source observation.
- Drake number freshness and Role Specialization completeness remain unnamed beyond that stored difference. Source observation.
- Modification descriptions and duplicated effects are not named in the audit. The crew thread that bundled them was inaccessible. They stay unnamed. No pack scan was run.
- Tier 3 Medium Versatile Transport: no top-level document of that name is in source or in the installed `sw5e-module.starships` or `sw5e-module.drakes-shipyard` indexes. Embedded feat copies named Versatile Transport exist, including on tier-3 medium actor `QqgnknDyNxtsaImK` (YT-1300, Heavily Modified), and they point at compendium id `OiZHrN5BsNYW1W3F`, which is not in current starships source or the installed item index. Unresolved missing feature record, not a confirmed rules mismatch.
- Commando, Demolitions stays the existing source observation. Hidden Blade and both Commando IWS actors were not reopened. Sith Usurper `packs/_source/snv-monsters/humanoid/sith-usurper.yml` exists. Its flat-check claim was not compared because the thread was inaccessible.

### Discord coverage

`discord_read` on `1548441058432786472` returned no configured bot access. `discord_list_tickets` on guild `727847839631278110` returned no configured bot access. No new replies or new reports were read. Settled reports were not reopened. Thread contents were not inferred from titles.

### Cleanup

Deleted by recorded id: actor `BdsHxKZ2reGwdeZd`, world item `sBMkbf3j80doCDyx`, and chat `8nHjKBevDIc51baD`. Embedded size `sbR9MRdzWB4R447W` was removed with the actor. Protected actors remained present and were not edited.

### Implementation impact

`templates/starship-sheet-layer.hbs` and `scripts/patch/starship-sheet.mjs` only. No pack, migration, localization, or CHANGELOG edit.

### Validation impact

No earlier gate was changed. Gargantuan and the Spend retest above are the 2026-10-26 Foundry evidence.

### Status

Gargantuan passed. Spend presentation corrected and retested. Quick-Charge Shield traced and left unchanged. Content comparisons recorded without edits. Discord refresh was blocked by access. Temporary documents deleted by id. No commit, push, pack rebuild, or migration.

---

## Addendum — 2026-10-26 — Quick-Charge Shield regeneration coefficient

### Reason

The trace above showed DataModel cleaning dropping `system.attributes.regrateco.value`. This pass keeps that path on `EquipmentData` and defines what an explicit stored 0 means.

### Supersedes

The "Quick-Charge Shield" section in the 2026-10-26 audit above, which left the constructed document without `regrateco` and made no schema or reader edit.

The superseded content above is retained as historical evidence and must not be deleted.

### Revised decision or behavior

`EquipmentData` now has `system.attributes.regrateco.value`: not required, nullable, initial `null`, minimum 0, and not restricted to integers. Ordinary equipment keeps null. The installed pack already stored 1.5, so no source edit and no pack rebuild were used.

The equipped shield's live value has three states. Null or absent still falls through the existing candidates and the compendium lookup. A positive number is used. Exactly 0 returns null immediately and does not consult `_source`, the legacy equipment flag, the legacy actor snapshot, or the compendium. Zero that appears only on those later candidates still falls through.

### Implementation impact

`scripts/patch/starship-equipment-schema.mjs` (new), `scripts/patch/dataModels.mjs` (one `EquipmentData.defineSchema` wrapper), `scripts/starship-dice-rolls.mjs` (the explicit-zero guard in both readers), `utils/test-starship-equipment-regen-field.mjs` (new). No pack, migration, localization, template, or CHANGELOG edit. The uncommitted Engines Spend files were not edited.

### Validation impact

No earlier gate was changed. Offline: `node utils/test-starship-equipment-regen-field.mjs` passed 7 tests, and `node utils/test-starship-hull-shield-dice-tier.mjs` passed 27.

Foundry 13.351 / dnd5e 5.2.5, world `vanilla`, Gamemaster:

- Compendium `M7igMGsBIosGA4dS` constructed with live and `_source` `regrateco` 1.5. The schema field was present.
- Temporary starship `jlTg742f1Adtnx63` with Medium Starship `p4EZ2HX9qthKBwAI` and a drop-imported Quick-Charge Shield `T1SfxoC1L2oPnysO` (`_stats.compendiumSource` `Compendium.sw5e-module.starships.Item.M7igMGsBIosGA4dS`). The shield was equipped with a direct update because the imported document had `equipped: false`. An earlier embedded copy `eGVwQbvZDblWW8ZJ` had no compendium source and was deleted before the world reload. After sheet close and a world reload, live and `_source` were still 1.5.
- `getStarshipShieldRegenRateMult` returned 1.5 with zero `fromUuid` calls and zero pack index lookups. `applyRegenRepair({ useShieldDie: true })` spent one shield die (`shldDiceUsed` 0 to 1), raised shield points from 10 to 22, and left the stored coefficient at 1.5. Chat `YD6xZD3QioQfljVH` formula `8 * 1.5` total 12. Chat `s2DKpSVugCzxyKGz` reported 12 shield points.
- Direct update to 0 persisted in live and `_source` after sheet close. The reader returned null, `canExpendStarshipShieldDieForRegen` was false, the roll returned `{ error: "noRegenMult" }`, and the warning was "Shield regeneration data is unavailable — equip a shield with a regeneration coefficient." `fromUuid` and pack index were not called. `shldDiceUsed` stayed 1.
- Direct update to 1.25 persisted after sheet close. The reader returned 1.25 with no compendium lookup. The roll formula was `8 * 1.25`, gain 10, and `shldDiceUsed` became 2. Chat `kbuecMwIgmBj3tax`.
- World equipment `CVI8DKCbrPnSIPUk`, type clothing, had `regrateco` null. Its sheet opened and its text did not contain `regrateco`. The create-and-open step recorded no `console.error`.
- Construction and updates did not throw schema validation errors. A page-level console collector installed before reload did not remain in front of Foundry's console, so this pass does not have a full world-load console transcript.

### Status

Coefficient preservation implemented and checked in Foundry. Temporary actor `jlTg742f1Adtnx63`, embedded items `p4EZ2HX9qthKBwAI` and `T1SfxoC1L2oPnysO`, world item `CVI8DKCbrPnSIPUk`, and chats `YD6xZD3QioQfljVH`, `s2DKpSVugCzxyKGz`, and `kbuecMwIgmBj3tax` were deleted by those ids. Protected actors `AUBubx8m4G1hnJRs`, `JBI4wzQrD5M7Bvau`, `p7kygnlnyGlRxLDV`, and `MtCUUXnpkRotQrTw` were still present and were not edited. No commit, push, pack rebuild, or migration.

---

## Addendum — 2026-11-04 — YT-1300 movement closed

### Reason

The YT-1300 movement observation in the 2026-10-26 audit was checked against the live sheet and world export `G5y5nQHUBa2j5T6R`.

### Supersedes

The YT-1300 bullet in that audit's content comparisons, which recorded `baseTurnSpeed` 200 against movement fly 350 and turn 150 without a book citation.

That bullet is retained above as historical evidence and must not be deleted.

### Revised decision or behavior

Closed. No content edit. The hull's movement is space 350 and turn 150. The 200 is the Medium size item's `baseTurnSpeed`. The sheet's Fly 0 and Speed 0 are prepared values. Stored fly remains 350 and stored walk remains 30.

### Status

Done. Next open content report is Drake freshness and Role Specialization, thread `1512573420481810534`.

---

## Addendum — 2026-11-04 — Drake Role Spec duplicates removed

### Reason

The Role Specialization report named above includes embedded `Role Spec:` items that repeat a `Role:` item on the same Drake actor. This pass removes only the pairs that carry no unique specialization behavior.

### Supersedes

The "next open content report" status in the YT-1300 addendum above, only for the five duplicate pairs listed here. Drake numeric freshness, the Yacht description pairs, Role Spec items with a unique effect, and Role Spec items with no matching `Role:` item stay open.

That status line is retained above as historical evidence and must not be deleted.

### Revised decision or behavior

Retain `Role:` and remove `Role Spec:` when the descriptions match and the system data matches, allowing only `system.type.subtype` and `system.attributes.speed` to differ. The `Role Spec:` effect's only extra change is `system.details.role`, which nothing in `scripts/`, `templates/`, or `languages/` reads. The retained item effect's empty `flags.core.statusId` was treated as the same as the duplicate's empty flags object. Any other flags, duration, disabled, activities, or system difference aborts that file. No new `starships` record was created for a missing source id, including `Compendium.sw5e-module.starships.4Rdl3p0fg55B7VZP`.

Removed from `packs/_source/drakes-shipyard/`, by id:

| File | Actor | Removed item | Removed actor effect | Retained item | Retained actor effect |
| --- | --- | --- | --- | --- | --- |
| `akajor-class-shuttle.yml` | `tRnGAAILKowm8n4T` | `BQ1QP4pDtSswfpEk` | `vrbxUmzq0uXtKnJ4` | `4lOzKTxQ6X75iRE3` | `ljLwuvSxNPAaYg0h` |
| `arc-170-starfighter.yml` | `B5AmMDBTT6TrfW5E` | `3LpnhMKSnfj2kweZ` | `cYTnq6omxIAHtLjz` | `546iyB7I0mfBCOgu` | `FVqRY2kv3xER04iZ` |
| `u-wing-starfighter-support-craft-ut-60d.yml` | `8rxZGWKJJ2XbyhNl` | `CuY0bUBgTMQ5QG5t` | `gW3SJJLUPgQdHGuX` | `N1N52oykBJ5Folkw` | `L84UThMvDvqf6H1M` |
| `ef76-nebulon-b-escort-frigate.yml` | `MBlMVJlmhIjF9IqH` | `zkaANU1XMiQGdlf0` | `iaFkhGXZPYZSPcJ9` | `hPR9d0SurUXfVjST` | `8tk2F87OOlpiQFHA` |
| `ef76-nebulon-b-escort-frigate-medical.yml` | `8uUUatfcGjYMSKZr` | `PDWg1DWCwL0eiu32` | `chOWaILOZPSmcELU` | `SmRAAX8SFDt14PXt` | `2ZpwP0uyFsQLeKaP` |

Retained, not duplicates:

- Description differs: Yacht on `baudo-class-star-yacht.yml`, `baudo-class-star-yacht-modified.yml`, and both Yacht items on `x-70b-phantom-class-prototype.yml` (`dxgB5vbGcHfe7R48`, `2MrHRcIbwUwBvWeK`, `tXnhWHqCScPZ1pRa`).
- Unique effect: 21 items whose Role Spec change is `system.bonuses.rwak.attack`, `system.bonuses.rwak.damage`, or `system.attributes.movement.fly`.
- No matching `Role:` item: 17 items. Left unchanged.

### Implementation impact

`utils/fix-drakes-role-spec-duplicates.mjs` (new) and the five Drake source files above. `YAML.dump` rewrites unrelated lines, so the script deletes the two indent-2 blocks by id. No migration, localization, template, runtime script, or CHANGELOG edit. World actors were not opened. Protected world actor `AUBubx8m4G1hnJRs` is not the compendium actor `B5AmMDBTT6TrfW5E`.

### Validation impact

No earlier gate was changed. Offline, 2026-11-04: dry run, then live run. Reparse confirmed the targeted ids absent, the retained ids unchanged, and no orphaned effect origins. `git diff --numstat` is `0` insertions and 173, 173, 173, 172, and 172 deletions. A second comparison found 42 `Role Spec:` items and 0 duplicates. `node utils/test-starship-hull-shield-dice-tier.mjs` passed 27. `node utils/test-starship-equipment-regen-field.mjs` passed 7.

Foundry gate, not run: with Foundry fully stopped, `npm run build:db -- drakes-shipyard`, then import ARC-170 from the rebuilt pack and confirm one `Role: Shuttle`, Constitution still +1, no `Role Spec: Shuttle`, and no console error. Existing world copies keep the duplicate until re-imported.

### Status

Pack source updated. Awaiting an authorized rebuild and the Foundry gate. No commit, push, or pack rebuild.

---

## Addendum — 2026-11-04 — Drake's Shipyard pack rebuilt

### Reason

Foundry was stopped, and the rebuild named in the addendum above was run.

### Supersedes

The status line above that says the pack rebuild is still awaiting authorization.

That status line is retained above as historical evidence and must not be deleted.

### Revised decision or behavior

`npm run build` completed: lint (281 files, 8 JSON), styles, and `build:db`. The log compiled `drakes-shipyard` and packed ARC-170 `B5AmMDBTT6TrfW5E`. No source edit in this step.

### Validation impact

The Foundry gate is still open. Restart Foundry, import ARC-170 from the rebuilt pack, and confirm one `Role: Shuttle`, Constitution still +1, no `Role Spec: Shuttle`, and no console error. Do not edit world actor `AUBubx8m4G1hnJRs`.

### Status

Pack rebuilt. Sheet check not run. No commit or push.

---

## Addendum — 2026-11-04 — Drake Role Spec duplicate removal closed

### Reason

The user marked this duplicate-removal work done after the pack rebuild.

### Supersedes

The status above that left the ARC-170 sheet check open.

That status line is retained above as historical evidence and must not be deleted.

### Revised decision or behavior

Closed. The five duplicate `Role Spec:` items and their actor-level copies are removed from Drake source, and `npm run build` packed `drakes-shipyard`, including ARC-170 `B5AmMDBTT6TrfW5E`. No separate sheet transcript was recorded in this session. Yacht description pairs, unique-effect Role Spec items, Role Spec items with no matching `Role:` item, and Drake numeric freshness stay open.

### Status

Done. No push.

---

## Addendum — 2026-11-04 — Modification descriptions and duplicated effects reproduced

### Reason

The unnamed report in the 2026-10-26 content comparisons was scanned in pack source.

### Supersedes

The bullet that says modification descriptions and duplicated effects stay unnamed and that no pack scan was run.

That bullet is retained above as historical evidence and must not be deleted.

### Revised decision or behavior

Reproduced. The full candidate table, ids, and the smallest repair scope are in [2026-11-04-modification-duplicates-investigation.md](2026-11-04-modification-duplicates-investigation.md).

Drake's Shipyard has 893 actor-level effects that repeat a `transfer: true` item effect. With `legacyTransferral` false, that is a second application. Four Makeshift copies also carry the −1 the item effect lacks. Two shield copies point at a different actor. Thirty-five Fire-Linked items carry the Slave Circuit description and have no effect.

Compendium modification packs did not reproduce a duplicate: no repeated paragraphs, no overlapping item effects, no doubled change inside one effect, and no same-named item with different data. Tiered families that share text differ by grade and prerequisites.

No source, pack, world, commit, or push change in this pass. The repair is not authorized.

### Status

Recorded. Repair not started.

---

## Addendum — 2026-11-05 — Drake duplicated actor effects removed from source

### Reason

The authorized Drake actor-level effect repair was applied after the 893 count was reconciled.

### Supersedes

The status "Recorded. Repair not started." in the addendum above.

That status is retained above as historical evidence and must not be deleted.

### Revised decision or behavior

Drake source now has the duplicate actor-level copies removed: 852 same-actor nonempty, 37 clone-source nonempty, 4 Makeshift supersets, 2 foreign-origin orphans, and 32 inert Lightweight Armor pairs. Total 927. The original 893 omitted the 32 empty-change pairs and did not separate clone-source origins. CR90 `ZtUQ6YtH6HkdJH60` remains. Makeshift penalties now sit once on item effects `MFmEao36oVlzKQAf`, `pGr8kuryyuo2srt5`, `QqpA53Psrw6O9vhK`, and `bxIgXxH8k3VKqoI0`. Details are in [2026-11-04-modification-duplicates-investigation.md](2026-11-04-modification-duplicates-investigation.md).

The LevelDB pack has not been rebuilt. World actors were not migrated. Fire-Linked descriptions, Adaptive Ailerons, Tuned Engines, and Sublight Drive text are still pending.

### Status

Source repair applied. Pack rebuild and Foundry gate pending. No commit. No push.

---

## Addendum — 2026-11-05 — Drake's Shipyard pack rebuilt

### Reason

Foundry was stopped, so `drakes-shipyard` could be compiled.

### Supersedes

The status line above that says the pack rebuild is pending.

That line is retained above as historical evidence and must not be deleted.

### Revised decision or behavior

`npm run build:db -- drakes-shipyard` exited 0 and packed 87 actors. The fresh-import Foundry gate is still open. World actors were not migrated. Fire-Linked descriptions, Adaptive Ailerons, Tuned Engines, and Sublight Drive text are still pending.

### Status

Pack rebuilt. Foundry gate pending. No commit. No push.

---

## Addendum — 2026-11-05 — Duplicate actor effects closed

### Reason

The user reported that the fresh-import Foundry test passed.

### Supersedes

The status line above that says the Foundry gate is pending.

That line is retained above as historical evidence and must not be deleted.

### Revised decision or behavior

Closed. The duplicated Drake actor-level effects are fixed for source and for a fresh import. The user confirmed the Foundry test passed on 2026-11-05.

Existing world actors were not cleaned. They still contain the duplicates and need a re-import or a separately authorized migration.

Fire-Linked descriptions, Adaptive Ailerons, Tuned Engines, and Sublight Drive text stay open as separate issues.

### Status

Closed for the duplicate actor-level effects. Fresh import passed. World actors unchanged. The four text and sign issues remain open.

---

## Addendum — 2026-11-05 — Drake text repairs

### Reason

The four open Drake findings named above were handled separately.

### Supersedes

The status line above that leaves all four text and sign issues open.

That line is retained above as historical evidence and must not be deleted.

### Revised decision or behavior

Source repairs, each verified on its own: custom N-1 Tuned Engines `V2EZCmDU7Sd6qXmi` now matches compendium `Qt0Y1DWiU2ybVirE` and no longer has fly +50; 35 Fire-Linked descriptions no longer use the Slave Circuit text; eight Adaptive Ailerons turn values are `-100`. SLAM `SodQqzh3yVc4s1Qp` was not modified.

`qf6pDveEwnrkmjNQ` is an unresolved mixed-identity record and was not edited. World actors were not migrated. The pack was not rebuilt. Details are in [2026-11-04-modification-duplicates-investigation.md](2026-11-04-modification-duplicates-investigation.md).

### Status

Three source repairs applied. Sublight Drive unresolved and unchanged. Foundry check not done. No commit. No push.

---

## Addendum — 2026-11-05 — Drake text repairs packed

### Reason

The repaired Drake source was compiled.

### Supersedes

The status line above that says the Foundry check is not done.

That line is retained above as historical evidence and must not be deleted.

### Revised decision or behavior

`npm run build:db -- drakes-shipyard` exited 0 and packed 87 actors. The old Tuned Engines effect was removed from the pack. Sublight Drive stays unresolved and unedited. World actors were not migrated. A fresh import is still required.

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

Complete for Tuned Engines, Fire-Linked descriptions, and Adaptive Ailerons. The user confirmed the Foundry checks passed on 2026-11-05.

Sublight Drive `qf6pDveEwnrkmjNQ` remains an unresolved mixed-identity record and was not edited. World actors were not migrated.

### Status

Closed for those three findings. Sublight Drive remains open. World actors unchanged.

---

## Addendum — 2026-11-05 — Remaining actor effects and Sublight identity

### Reason

The 46 actor-level effects left after the duplicate cleanup were inventoried, and the custom N-1 Sublight Drive record was audited separately. No source was edited.

### Supersedes

Nothing in the closed Tuned Engines, Fire-Linked, or Adaptive Ailerons findings.

### Revised decision or behavior

Recount remained 46. One CR90 effect stays required because its item effect is mode 0 and the actor effect is mode 2. Three Directional Shield actor effects match their installed item effects but use a compendium-world origin, so deletion waits on a Foundry listing test. Forty-two actor-only ASI and modifier effects are unresolved and must stay. Custom N-1 `qf6pDveEwnrkmjNQ` is outcome D: the mixed identity predates YAML conversion, so it stays unresolved and unedited. Full tables are in [2026-11-04-modification-duplicates-investigation.md](2026-11-04-modification-duplicates-investigation.md).

### Status

Inventory recorded. Sublight Drive remains open. No source edit.

---

## Addendum — 2026-11-05 — Directional Shield copies removed; parallel research integrated

### Reason

The authorized Directional Shield source removal finished, and the three read-only research reports were combined.

### Supersedes

The sentence above that says Directional Shield deletion waits on a Foundry listing test.

That sentence is retained above as historical evidence and must not be deleted.

### Revised decision or behavior

The three Directional Shield actor effects `b6Faqbwd2sLA9Hgc`, `i98DfifxpUQ6S1qw`, and `Hk5jIpbt4L79lBIp` are removed. Item effect `8DZ792d8qqBQeXNh` remains on each ship. The 42 actor-only effects stay unresolved; no item owns them, and deleting 39 would change prepared scores or derived Turn. CR90 `ZtUQ6YtH6HkdJH60` stays. The tier-0 Corvette ability bonus must not be moved onto specialization `QV7xhcdNoH8halzL`. Sublight Drive `qf6pDveEwnrkmjNQ` stays outcome D. Details are in [2026-11-04-modification-duplicates-investigation.md](2026-11-04-modification-duplicates-investigation.md).

### Status

Shield actor copies removed in source. Pack rebuild and Foundry import pending. Sublight Drive remains open. No commit. No push.

---

## Addendum — 2026-11-05 — Directional Shield pack rebuilt

### Reason

The rebuilt Drake source was compiled after the shield actor copies were removed.

### Supersedes

The status line above that says the pack rebuild and Foundry import are pending.

That line is retained above as historical evidence and must not be deleted. The import check is not superseded.

### Revised decision or behavior

`npm run build:db -- drakes-shipyard` exited 0 and packed 87 actors. The three Directional Shield actor effects were removed from the pack. A fresh import of Escape Pod, ETA-2, and Fang is still required.

### Status

Pack rebuilt. Foundry import pending. Sublight Drive remains open. No commit. No push.

---

## Addendum — 2026-11-06 — CR90 Role: Corvette ability effects removed

### Reason

The fresh CR90 import showed two Role: Corvette effects, and the rules review found that neither ability adjustment belongs on the specialization.

### Supersedes

The earlier classification of `ZtUQ6YtH6HkdJH60` as required compatibility data.

That classification is retained above as historical evidence and must not be deleted.

### Revised decision or behavior

Both `ZtUQ6YtH6HkdJH60` and `qQTMHDrpIch61Q7C` were removed. Role: Corvette `QV7xhcdNoH8halzL` remains. The pack was rebuilt. A fresh CR90 import is still required. The 42 actor-only effects and the custom N-1 Sublight Drive were not changed. Details are in [2026-11-04-modification-duplicates-investigation.md](2026-11-04-modification-duplicates-investigation.md).

### Status

CR90 ability effects removed and the pack rebuilt. Fresh CR90 import pending. No commit. No push.

---

## Addendum — 2026-11-06 — CR90 Corvette ability bonus restored

### Reason

The removal of both Role: Corvette effects was incorrect. The base role grants Strength +1 and Dexterity +1. The description is the separate specialization benefit.

### Supersedes

The status above that treats both ability effects as correctly removed.

That status is retained above as historical evidence and must not be deleted.

### Revised decision or behavior

Embedded effect `qQTMHDrpIch61Q7C` is restored at mode 2 on item `QV7xhcdNoH8halzL`. Actor effect `ZtUQ6YtH6HkdJH60` stays absent. The pack was rebuilt. A fresh CR90 import should apply the ability bonus once. Details are in [2026-11-04-modification-duplicates-investigation.md](2026-11-04-modification-duplicates-investigation.md).

### Status

Embedded Corvette ability effect restored at mode 2. Actor duplicate remains removed. Pack rebuilt. Fresh CR90 import pending. No commit. No push.
