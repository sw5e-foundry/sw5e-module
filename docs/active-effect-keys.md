# SW5E module — Active Effect property keys

Quick reference for building **Active Effects** on actors when playing with the **sw5e-module** on the **dnd5e** system. Paths use Foundry’s usual `system.*` notation on the **Actor** document.

## How dnd5e effects work (short)

- Each **change** has a **key** (property path), **mode** (`CONST.ACTIVE_EFFECT_MODES`: e.g. `ADD`, `MULTIPLY`, `OVERRIDE`, `UPGRADE`, `DOWNGRADE`, `CUSTOM`), and **value** (often a formula string evaluated with the actor’s roll data).
- Prefer targeting fields that are **persisted on the actor** and meant for overrides. Many **derived** values are recomputed during `prepareDerivedData`; changing them with an effect may do nothing, be overwritten on the next prepare, or fight the system.

## Effect modes (when to use which)

| Mode | Typical use |
|------|-------------|
| **Add** | Flat bonuses: `+2` to a numeric pool max or resource. |
| **Multiply** | Scale a numeric value (be careful with stacks). |
| **Override** | Replace a value entirely (e.g. set die size to `10`). |
| **Upgrade / Downgrade** | dnd5e may use these for specific subsystems—check core docs. |

For “**+2 maximum superiority dice**”, **`Add`** on `system.superiority.dice.max` is usually appropriate when that field is an explicit override the sheet already respects (see caveat in **Superiority** below).

---

## Superiority (maneuvers)

| Key | Notes |
|-----|--------|
| `system.superiority.dice.value` | **Current** dice remaining. Safe to adjust for “spend/recover” style effects; rest hooks may reset this. |
| `system.superiority.dice.max` | **Maximum** dice (override / cap). Module preparation combines class progression with this; `Add` is a common choice for “+2 max dice”. |
| `system.superiority.dice.temp` | Temporary dice (schema supports temp on this resource). |
| `system.superiority.dice.bonuses.level` | Formula bonus field (per-level); evaluated during prep. |
| `system.superiority.dice.bonuses.overall` | Formula bonus field; evaluated during prep. |
| `system.superiority.die` | Die **size** (e.g. `6`, `8`, `10`). Prefer **Override** for a fixed size. |
| `system.superiority.known.max` | Override cap on **maneuvers known** where the sheet uses it. |
| `system.superiority.level` | Prepared “superiority level”-style field when set; often derived from classes—**avoid overriding** unless you know the actor’s prep pipeline. |
| `system.bonuses.superiority.dc.all` | Formula bonus to all superiority save DCs (when used by prep). |
| `system.bonuses.superiority.dc.mental` | Per–maneuver-type DC bonus. |
| `system.bonuses.superiority.dc.physical` | Same. |
| `system.bonuses.superiority.dc.general` | Same. |

**Caveats:** `system.superiority.dice.max` may be **filled from progression** when the source field is blank; an **Add** effect still applies in Foundry’s effect pipeline—test on a copy of the actor. Purely **derived** display values (e.g. some DC components) should not be targeted unless documented in core dnd5e.

---

## Force and Tech (power points)

Force (`force`) and Tech (`tech`) mirror each other.

| Key | Notes |
|-----|--------|
| `system.powercasting.force.points.value` | Current Force points. |
| `system.powercasting.force.points.max` | Max Force points (override when set; bonuses fields also exist). |
| `system.powercasting.force.points.temp` | Temp pool. |
| `system.powercasting.force.points.tempmax` | Temporary adjustment to maximum. |
| `system.powercasting.force.points.bonuses.level` | Per-level formula bonus. |
| `system.powercasting.force.points.bonuses.overall` | Overall formula bonus. |

Replace **`force`** with **`tech`** for Tech power points (e.g. `system.powercasting.tech.points.value`).

**Caveats:** Point totals are recalculated during actor preparation; **`max`** may interact with class progression and overrides. Prefer testing after level changes and rests.

---

## Common actor keys (small subset)

Use these for generic buffs; for a full list see **dnd5e** system documentation (Active Effect documentation / schema).

| Key | Notes |
|-----|--------|
| `system.attributes.hp.max` | HP maximum (interacts with prep and other effects). |
| `system.attributes.hp.temp` | Temp HP. |
| `system.attributes.ac.value` | AC components (dnd5e version-dependent). |
| `system.abilities.str.value` | Ability **score** (not mod); modes matter. |
| `system.bonuses.abilities.str` | Global STR checks/saves bonus (if present in your dnd5e version). |
| `system.skills.ath.value` | Skill flat bonus (check core for skill key abbreviations). |

Always confirm the exact path in the **dnd5e** version you ship with (here: **5.2.x**).

---

## Examples

| Goal | Suggested key | Suggested mode | Value example |
|------|----------------|----------------|---------------|
| +2 **maximum** superiority dice | `system.superiority.dice.max` | Add | `2` |
| +4 **maximum** Force points | `system.powercasting.force.points.max` | Add | `4` |
| Set superiority die to **d10** | `system.superiority.die` | Override | `10` |
| +1 Tech point **right now** | `system.powercasting.tech.points.value` | Add | `1` |

---

## Upstream references

- [DnD5e system documentation](https://github.com/foundryvtt/dnd5e) — Active Effects, data models, and migration notes for your exact version.

This file is **curated** for SW5E-on-dnd5e module users, not a dump of every `system` key.
