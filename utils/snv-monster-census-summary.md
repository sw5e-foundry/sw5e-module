# SnV Monster Census Summary

```text
Date: 2026-08-03
Branch: cursor/snv-monster-parity-aaed
SHA: 25766c729
Authorization: Investigation only (Slice 0)
Pack mutations: none
```

## Provenance

- SnV source file: `ai/SnV_Final.md`
- SnV heading count: **346**
- Pack NPC count: **272**
- Recovery note: ai/SnV_Final.md is a recovered GM Binder substitute (maintainer-local gitignored original was absent). Prior planning counted 509 headings in the authentic file.

## Classification counts

| Class | Count |
|---|---:|
| exact-match | 233 |
| alias-match | 28 |
| missing | 80 |
| ambiguous | 5 |
| pack-only | 11 |
| matched with zero diffs | 3 |
| matched with diffs | 258 |

## Missing by section

- Beasts: 39
- Aberrations: 17
- Humanoids: 16
- Uncategorized: 3
- Humanoids (Force Users): 3
- Plants: 2

## Top mismatched matched actors

- Cyborg Khagan ↔ Cyborg Khagan: 27 diffs
- AT-ST ↔ AT-ST: 22 diffs
- Flesh Raider Berserker ↔ Flesh Raider Berserker: 21 diffs
- Emperor's Hand ↔ Emperor's Hand: 20 diffs
- Imperial Guard Champion ↔ Imperial Guard Champion: 20 diffs
- Imperial Shadow Guard ↔ Imperial Shadow Guard: 20 diffs
- HK-Series, HK-47 ↔ HK Series, HK-47: 19 diffs
- Imperial Guard Sentinel ↔ Imperial Guard Sentinel: 19 diffs
- AT-AT ↔ AT-AT: 18 diffs
- Grand Admiral ↔ Grand Admiral: 18 diffs
- Hutt Crime Lord ↔ Hutt Crime Lord: 18 diffs
- Imperial Royal Guard ↔ Imperial Royal Guard: 18 diffs
- IG-100 Magnaguard ↔ IG-100 Series: 17 diffs
- Krayt Dragon, Greater ↔ Krayt Dragon, Greater: 17 diffs
- Vessel of Abeloth ↔ Vessel of Abeloth: 16 diffs
- Sarlacc, Adult ↔ Sarlacc, Adult: 16 diffs
- Acklay, Adult ↔ Acklay, Adult: 15 diffs
- Sando Aqua Monster ↔ Sando Aqua Monster: 15 diffs
- Trandoshan T'Doshok ↔ Trandoshan T'doshok: 15 diffs
- Manifestation of Abeloth ↔ Manifestation of Abeloth: 15 diffs
- Dark Lord Spirit ↔ Dark Lord Spirit: 15 diffs
- Flesh Raider Apprentice ↔ Flesh Raider Apprentice: 15 diffs
- IG-Series, Model 88 ↔ IG Series, Model 88: 14 diffs
- Mistryl Prime ↔ Mistryl Prime: 14 diffs
- Trandoshan Huntmaster ↔ Trandoshan Huntmaster: 14 diffs

## Spot checks

### 000 Series Protocol Droid

- Classification: exact-match
- Pack: 000 Series Protocol Droid
- Diff count: 9
- `abilities.int`: expected `16`, actual `14`
- `cr`: expected `"1"`, actual `2`
- `techLevel`: expected `5`, actual `2`
- `skills.ins`: expected `3`, actual `1`
- `skills.itm`: expected `4`, actual `2`
- `skills.lor`: expected `5`, actual `null`
- `items.trait`: expected `"Circuitry"`, actual `null`
- `items.trait`: expected `"Targeting Systems"`, actual `null`

### Gonk Droid

- Classification: exact-match
- Pack: Gonk Droid
- Diff count: 6
- `cr`: expected `"1/2"`, actual `0`
- `senses.darkvision`: expected `60`, actual `null`
- `damageVulnerabilities`: expected `["ion"]`, actual `["ion","lightning"]`
- `items.trait`: expected `"Explosive Retribution"`, actual `null`
- `items.actions`: expected `"Charging Port (2/Day)"`, actual `null`
- `items.actions`: expected `"Self-Destruct"`, actual `null`

### Acklay, Adolescent

- Classification: exact-match
- Pack: Acklay, Adolescent
- Diff count: 10
- `abilities.str`: expected `19`, actual `22`
- `speed.swim`: expected `40`, actual `0`
- `cr`: expected `"3"`, actual `5`
- `skills.ath`: expected `6`, actual `null`
- `skills.prc`: expected `2`, actual `null`
- `saves.str`: expected `6`, actual `null`
- `saves.con`: expected `5`, actual `null`
- `senses.darkvision`: expected `120`, actual `null`

### B'omarr BT-16 Brain Walker

- Classification: alias-match
- Pack: B'omarr Brain Walker
- Diff count: 13
- `hp.average`: expected `52`, actual `54`
- `skills.dec`: expected `6`, actual `null`
- `skills.lor`: expected `6`, actual `null`
- `skills.prc`: expected `4`, actual `null`
- `skills.per`: expected `6`, actual `null`
- `saves.int`: expected `6`, actual `null`
- `saves.wis`: expected `4`, actual `null`
- `saves.cha`: expected `6`, actual `null`

### 3P0 Series Droid

- Classification: alias-match
- Pack: 3P0 Series
- Diff count: 4
- `skills.lor`: expected `4`, actual `null`
- `skills.per`: expected `2`, actual `0`
- `damageVulnerabilities`: expected `["ion"]`, actual `["ion","lightning"]`
- `items.trait`: expected `"Circuitry"`, actual `null`

### Bantha, Adult

- Classification: exact-match
- Pack: Bantha, Adult
- Diff count: 7
- `abilities.str`: expected `22`, actual `24`
- `abilities.con`: expected `17`, actual `21`
- `ac.value`: expected `12`, actual `13`
- `hp.average`: expected `76`, actual `126`
- `hp.formula`: expected `"8d12+24"`, actual `"11d12+55"`
- `cr`: expected `"4"`, actual `6`
- `items.actions`: expected `"Stomp"`, actual `null`

## Next authorization gate

```text
Source-data correction authorized — Slice 1 matched-actor alignment
```

Then separately:

```text
Source-data correction authorized — Slice 2 missing-actor creation
Pack rebuild authorized
```

