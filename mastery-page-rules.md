# Mastery Page Rules

## Summary

The Mastery Page does not use `nodeNumber` as a prerequisite chain. The field controls a node's placement or ordering on the page. Unlocks are instead based on points spent by rarity tier, category totals, synergy selections, and Epic-node limits.

## Unlock Rules

### Normal Nodes

- **Common nodes:** Available immediately.
- **Uncommon nodes:** Require 30 points spent in Common normal nodes for that weapon.
- **Rare nodes:** Require 30 points spent in Uncommon normal nodes for that weapon.
- **First Epic node:** Requires 80 non-Epic normal-node points for that weapon and at least one selected Synergy node matching the Epic node's category.
- **Second Epic node:** Requires 120 non-Epic normal-node points for that weapon and at least one selected Synergy node matching its category.
- **Epic limit:** A maximum of two Epic nodes can be selected per weapon.

Normal nodes do not require the node immediately before them. Any qualifying allocation within the required preceding rarity tier contributes towards the threshold.

## Synergy Node Rules

- A Synergy node requires 20 points in its matching category at its own rarity tier.
- A maximum of two Synergy nodes can be selected at each rarity tier for a weapon.
- Synergy nodes do not contribute points towards normal-node tier requirements, category totals, or total points spent.

For example, an Uncommon Attack Synergy requires 20 points allocated to Uncommon Attack-compatible normal nodes.

## Point Counting

- A selected normal node contributes its selected level as points.
- A level-10 normal node therefore contributes 10 points.
- Normal-node points count once towards total points spent and towards the node's rarity tier.
- Single-category nodes contribute to their single category.
- Hybrid-category nodes contribute their full level to both named categories while consuming their level only once from the total allocation.

Hybrid mappings:

| Hybrid category | Category totals credited |
|---|---|
| Attack + Utility | Attack and Utility |
| Defence + Tactics | Defence and Tactics |
| Tactics + Attack | Tactics and Attack |
| Utility + Defence | Utility and Defence |

For example, a level-10 Attack + Utility node contributes 10 Attack points and 10 Utility points, but only 10 total points spent.

## Point Budget

The recovered Questlog UI code currently defines a maximum of **220 points per weapon**.

## Data and Evidence Locations

### Raw mastery records

`C:\_Projects\tl-character-extract\out\questlog-public\weaponSpecialization.getWeaponSpecializations.json`

This contains the mastery node records, including:

- Node ID and name
- Weapon and category
- Rarity grade
- `nodeNumber`
- Specialization type
- Opening costs
- Stats and passive effects by level

It does not contain explicit prerequisite node IDs or dependency links.

### Cached Questlog Mastery UI

`C:\_Projects\tl-character-extract\out\questlog-chunks\BjG9XNuZ.js`

This cached UI asset shows that the Mastery Page asks the Questlog store for `getNormalNodeRequirement` and `getSynergyNodeRequirement`. It also renders the resulting mastery-point, category-point, Synergy, and rarity conditions.

The precise calculations were recovered from the corresponding Questlog core UI asset currently loaded from:

`https://cdn.questlog.gg/_static/throne-and-liberty/_nuxt/CSq355zw.js`

The relevant logic defines:

- 30 preceding-tier points for Uncommon and Rare nodes
- 20 matching category-and-tier points for Synergy nodes
- Two Synergy nodes per rarity tier
- 80 non-Epic normal-node points for the first Epic node
- 120 non-Epic normal-node points for the second Epic node
- A matching Synergy requirement for Epic nodes
- Two Epic nodes per weapon
- A 220-point weapon budget

The recovered client calculation excludes selected Epic-node levels from the
80/120 prerequisite total. This prevents an Epic node from satisfying part of
its own unlock condition and is preserved in both UI reconciliation and raw
persisted-build validation.

### Local installed-game assets

The inspected game installation is:

`D:\SteamLibrary\steamapps\common\Throne and Liberty`

The readable loose Mastery-related game assets are visual `.bk2` files such as:

- `BK2_SkillBook_WeaponProficiency_frame.bk2`
- `BK2_SkillMasterySmokeCirle_LoopFX.bk2`

These files provide frames and visual effects. They do not expose node requirements or Mastery progression rules. The important gameplay archives remain encrypted, as documented in:

`C:\_Projects\tl-character-extract\extraction-report.md`

## Implementation Interpretation

The tracker should validate selections using aggregate allocation rules rather than treating each visual connector as a required node-to-node path. Connectors can represent the Mastery Page layout without implying that the previous displayed node must be selected.

