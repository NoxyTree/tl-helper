# Stat source coverage audit

Build audited: `24118850`

Warehouse: `D:\TL_Data\warehouse\tl-24118850.sqlite`

Audit scope: current 38 decoded table families, the five browser projections, Questlog-derived rules, skill-formula mapping, and current TL-Helper calculation rules.

## Bottom line

TL-Helper now materializes a large proportion of static stat sources into one
queryable index, but it is not yet a complete catalogue of every dynamic source
that grants a stat.

The implemented `stat_sources` table contains 293,446 rows across 2,394 named
sources and 110 canonical metrics. It includes equipment, optional item stats,
runes, rune synergies, direct item and artifact set bonuses, attribute curves,
attribute breakpoints, material rules, and masteries. Heavy Attack Chance has
15,247 level/rank rows across 490 named sources. Skills, passives, dynamic set
effects, and unsafe raw-curve owner guesses remain excluded.

For Heavy Attack Chance, the current data can identify named equipment, optional item rolls, runes, rune synergies, masteries, one direct set bonus, two Strength breakpoints, three material bonuses, and several skill descriptions. The remaining problem is normalization and joining, not lack of raw values.

A raw recursive search is unsafe as a user-facing answer. Dense generic stat structures produce thousands of fields, many of which are zero, and an item can merely *allow* a Heavy Attack trait or potential roll without granting it by default.

## Heavy Attack terminology

The game-data term is `DoubleAttack`; the English player-facing term is **Heavy Attack Chance**. Questlog-derived labels already establish these mappings in `web/tl-core.js`.

### Canonical current aliases

| Internal ID | Player-facing meaning |
|---|---|
| `all_double_attack` | Heavy Attack Chance applied to all attack types |
| `melee_double_attack` | Melee Heavy Attack Chance |
| `range_double_attack` | Ranged Heavy Attack Chance |
| `magic_double_attack` | Magic Heavy Attack Chance |
| `boss_all_double_attack` | Heavy Attack Chance against bosses, all attack types |
| `boss_melee_double_attack` | Melee Heavy Attack Chance against bosses |
| `boss_range_double_attack` | Ranged Heavy Attack Chance against bosses |
| `boss_magic_double_attack` | Magic Heavy Attack Chance against bosses |
| `pvp_all_double_attack` | PvP Heavy Attack Chance, all attack types |
| `pvp_melee_double_attack` | PvP Melee Heavy Attack Chance |
| `pvp_range_double_attack` | PvP Ranged Heavy Attack Chance |
| `pvp_magic_double_attack` | PvP Magic Heavy Attack Chance |
| `front_all_double_attack` | Positional Heavy Attack Chance from the front |
| `side_all_double_attack` | Positional Heavy Attack Chance from the side |
| `rear_all_double_attack` | Positional Heavy Attack Chance from the rear |

The raw tables express the same concepts through `EPcStatsType`, `EItemStats`, and `EItemAttrType` enum forms such as `kAllDoubleAttack`, `kMeleeDoubleAttack`, `kBossMagicDoubleAttack`, and `kPvPRangeDoubleAttack`.

Raw dictionary tables also declare `Weaken`, `Stun`, `Petrification`, `Sleep`, `Silence`, `Bind`, and `Blind` `DoubleAttack` enum members. Their live meaning has not been established, so they should remain separate conditional aliases rather than being flattened into ordinary Heavy Attack Chance.

### Explicit exclusions

These are related to Heavy Attacks but are not Heavy Attack Chance grants:

- `double_damage_dealt_modifier`: Heavy Attack Damage.
- `double_damage_taken_modifier`: incoming Heavy Attack Damage modifier.
- `all_double_defense` and typed/scoped `double_defense`: Heavy Attack Evasion.
- Descriptions that only say an effect triggers *when a Heavy Attack lands*.
- Formula rows that calculate damage for a Heavy Attack-triggered effect but do not modify chance.

## Heavy Attack evidence counts

### Raw decoded warehouse

A recursive scan for the 12 ordinary all/typed/boss/PvP snake-case fields found:

- 763 rows containing at least one Heavy Attack field.
- 496 rows containing at least one non-zero Heavy Attack value.
- 26,136 Heavy Attack field occurrences, of which 19,817 are non-zero.

All non-zero key-value occurrences are currently concentrated in generic value tables:

| Table | Rows with a Heavy field | Rows with a non-zero value | Non-zero occurrences | Interpretation |
|---|---:|---:|---:|---|
| `TLItemExtraLevelStat` | 700 | 474 | 5,688 | Generic item level curves. Not named sources by themselves. |
| `TLStatsItemBaseValue` | 54 | 14 | 12,197 | Dense base-value arrays used by items, traits, runes, synergies, and resonance. |
| `TLStatsItemEnchantValue` | 9 | 8 | 1,932 | Enchantment curves, including runes and trait resonance. |

The large occurrence count must not be reported as 19,817 Heavy Attack sources. These are curve cells and arrays.

Other decoded tables reference Heavy Attack by enum or stat ID rather than embedding a snake-case numeric field. Examples include 83 `TLItemStats` rows, 160 `TLWeaponSpecializationStat` rows, two Strength breakpoint rows, three `TLItemMaterialStat` rows, and one `TLFormulaParameterNew` row.

### Named browser sources

Counts below are source records, not individual level values:

| Source category | Current count | What the count means |
|---|---:|---|
| Named items with fixed Heavy Attack progression | 78 | The item has a Heavy Attack value in its fixed `extra` progression. |
| Named items with any structured numeric Heavy source | 175 | Union including fixed values, random groups, potential, and positional values. This is a discovery upper bound, not 175 automatic grants. |
| Items exposing `all_double_attack` as an available trait | 310 | Optional trait pool only. |
| Items exposing Heavy Attack in resonance | 254 | Optional resonance pool only. |
| Items exposing a Heavy Attack unique-trait path | 5 | Optional unique-trait path. |
| Items exposing Heavy Attack in a random-stat group | 18 | Possible random outcome. |
| Items exposing Heavy Attack as item potential | 80 | Possible potential choice. |
| Mastery nodes with non-zero Heavy Attack values | 16 | 13 positive and 3 negative; named, valued, and levelled. |
| Rune item definitions with Heavy Attack possibilities | 52 | Named rune definitions across grade/slot variants; values are roll possibilities. |
| Rune synergies granting Heavy Attack | 2 | Named and directly valued. |
| Item sets with a direct projected Heavy Attack bonus | 1 | Imperator Set, 2-piece Melee Heavy Attack. |
| Strength breakpoints | 2 | STR 50 gives `all_double_attack` 1000; STR 80 adds 600. |
| Weapon/material combinations | 3 | Staff/mithril 600, staff/fabric 300, spear/fabric 250. |

The earlier figure of 82 named equipment sources came from a broader occurrence query. The stricter fixed-progression count is 78. The future index should report both categories explicitly rather than preserving one ambiguous equipment count.

### Dynamic and manual-rule sources

`web/tl-questlog-rules.js` contains six set-rule entries that mention Heavy Attack Chance. They include positive, negative, PvP-scoped, and attribute-scaled effects. One passive rule applies a negative Melee Heavy Attack modifier when a specialization is active. These rules are named and executable, but they are manually encoded Questlog parity rules rather than normalized extracted-table records.

Nine player skill descriptions currently describe an actual Heavy Attack Chance increase or ability-specific chance modifier:

- Shield Throw
- Flame Condensation
- Shield Strike
- Gerad's Shield
- Pulse of the Battlegrounds
- Asceticism
- Unyielding Sentinel
- Precision Dash
- Malice Surge

Only `SW_ShieldThrow_DoubleAttackUP` is directly identifiable by a `DoubleAttackUP` dynamic-stat marker in the decoded formula table. The other descriptions are useful named and conditional evidence, but their stat-effect rows have not yet been materialized as normalized grants.

Skills such as Valiant Brawl, Judgment Lightning, Inferno Wave, Stunning Blow, and Infernal Meteor mention Heavy Attacks only as triggers or outcomes. They must not appear in a “grants Heavy Attack Chance” query.

## Source-type matrix

Legend: **Yes** means usable now; **Partial** means evidence exists but a join, semantic mapping, or condition model is incomplete; **No** means the current dataset cannot support the claim safely.

| Source type | Available | Joinable to owner | Player-facing name | Numeric value | Conditions represented | Confidence and limitation |
|---|---|---|---|---|---|---|
| Fixed equipment stats | Yes | Yes | Yes | Yes, by item level | Item level | High. Questlog projection already resolves the multi-table curves. |
| Item traits | Yes | Yes | Yes | Yes, by tier | Selection and tier | High for possible traits; not an automatic item grant. |
| Item resonance | Yes | Yes | Yes | Yes, by tier | Selection, tier, probability | High for available outcomes. |
| Unique traits | Yes | Yes | Yes | Yes, by tier | Selection and tier | High for available outcomes. |
| Random item stats | Yes | Yes | Yes | Yes, by level | Roll probability and level | High for possible outcomes. |
| Item potential | Yes | Yes | Yes | Yes | Selection | High for possible outcomes. |
| Item-set direct stats | Yes | Yes | Yes | Yes | Piece count | High. |
| Item-set passive effects | Yes | Yes | Yes | Partial | Piece count plus runtime conditions | Medium. Questlog text and manual executable rules cover known sets, but extracted passive-effect joins are incomplete. |
| Artifact sets | Yes | Yes | Yes | Yes for direct stats | Piece count | High for direct stats; passive-effect normalization is partial. |
| Armor material bonuses | Yes | Yes | Derived combination name | Yes | Weapon and armor-material combination | High values, medium naming. Names are assembled from weapon/material context. |
| Runes | Yes | Yes | Yes | Yes, by level | Slot, grade, roll, level | High for possible rolls. |
| Rune synergies | Yes | Yes | Yes | Yes | Socket order, target slot, grade | High. |
| Attribute base curves | Yes | Yes | Yes | Yes, by attribute point | Attribute total | High. |
| Attribute breakpoints | Yes | Yes | Yes | Yes | Threshold | High, but breakpoint application currently lives in manual rules. |
| Weapon masteries | Yes | Yes | Yes | Yes, by node level | Weapon active state, level, prerequisites | High for direct node stats; synergy passives can require manual rules. |
| Unified masteries | Yes | Yes | Yes | Partial | Selection and prerequisites | Medium. Only one unified mastery currently has an executable manual stat rule. |
| Passive skills | Yes | Partial | Yes | Partial | Skill level, specialization, build state | Medium. Skill/formula mapping covers 181 of 210 sets exactly or by naming, but it does not yet express stat-effect semantics. |
| Active skill buffs/debuffs | Yes | Partial | Yes | Partial | Cast, target, duration, stacks, party, position | Medium to low until skill, effect, abnormal state, and formula rows are joined. |
| Abnormal states | Partial | Partial | No direct localization in warehouse | Mostly no stat magnitude | Duration-related flags, stack cap, exclusivity, disable flags | Medium for mechanics metadata. Only Common, Sword, and Wand families are decoded; these rows do not expose the numeric modifier payload needed for a grant index. |
| Skill formula rows | Yes | Partial | Named through skill map | Yes | Skill level and formula variant | High for coefficient values; low for automatic interpretation as a stat grant. |
| Questlog labels and descriptions | Yes | Yes to projected records | Yes | Often | Often in prose | High for display terminology, medium as structured mechanics. Questlog remains a comparison/naming source. |
| Manual calculator rules | Yes | Yes | Usually | Yes | Executable build conditions | Verified for Questlog parity, but provenance must remain `manual_questlog_rule`, not extracted. |

## Representative stat-family coverage

The same normalization issue affects other stats. The following counts are broad structured-discovery counts across named browser records. They include optional traits, rolls, and potentials, so they are coverage indicators rather than automatic-grant totals.

| Stat family | Items | Item sets | Artifact sets | Runes | Rune synergies | Masteries |
|---|---:|---:|---:|---:|---:|---:|
| Heavy Attack Chance | 175 | 1 | 0 | 52 | 2 | 16 |
| Critical Hit Chance | 424 | 6 | 3 | 52 | 7 | 31 |
| Hit Chance and CC chance aliases | 478 | 2 | 2 | 87 | 6 | 55 |
| Max Health | 385 | 2 | 2 | 48 | 30 | 19 |
| Cooldown Speed | 224 | 3 | 0 | 0 | 2 | 18 |
| Defence/armor | 983 | 3 | 3 | 40 | 9 | 30 |
| CC chance only | 214 | 0 | 0 | 48 | 0 | 40 |

Static item, rune, and mastery coverage is therefore already broad. Dynamic skill/passive coverage is the weakest part for every representative family, not only Heavy Attack.

## Missing joins and tables

The main gaps blocking a trustworthy one-query answer are:

1. **Canonical stat taxonomy.** Implemented for the current 204 projected IDs. Less common labels retain provisional status until independently verified.
2. **Materialized source index.** Implemented for the static source families listed above. Dynamic effects and unlinked raw curves remain outstanding.
3. **Grant versus option semantics.** Source components and structured conditions now distinguish current static modes. A dedicated `grant_mode` field is still useful before exposing a public API.
4. **Skill-effect joins.** The 210-set skill/formula map links names to formula rows, but it does not state which formula changes which canonical stat or which abnormal state applies it.
5. **Abnormal-state coverage.** Only Common, Sword, and Wand abnormal-state tables are in the current warehouse. Other weapon families are required for game-wide skill buff/debuff coverage.
6. **Modifier payload owner.** Current abnormal rows contain stack, group, disable, and presentation metadata but no general numeric stat-modifier structure. The table or package object that applies the modifier remains unidentified.
7. **Passive and unique item effects.** `item_passive_id`, skill-set references, set passive text, and formula/effect rows are not materialized into canonical stat grants.
8. **Manual-rule provenance.** Questlog parity rules must be included without being mistaken for extracted records.
9. **Condition model.** Party radius, target count, stack count, position, PvP/PvE scope, target status, current stats, thresholds, duration, and ability-specific modifiers need structured fields.
10. **Decoded-family coverage.** The warehouse has 38 decoded table families out of roughly 680 known families. High-value missing families should be decoded based on unresolved joins, not by blind volume.

## Required behavior of the future one-query index

A query for Heavy Attack Chance should default to actual grants and return optional sources separately. Each result needs:

- Canonical stat and player-facing label.
- Raw stat ID and raw enum.
- Source type, stable source ID, and player-facing source name.
- Value, unit, level/tier, sign, and attack-type scope.
- PvP, boss, and positional scope.
- `fixed`, `selectable`, `random`, `potential`, `conditional`, or `ability_specific` grant mode.
- Duration, stacks, party/target conditions, and activation trigger where applicable.
- Game build, source table/row, decoder version, provenance, and confidence.
- Explicit exclusion reason for Heavy Attack Damage, Heavy Attack Evasion, and trigger-only mentions.

With those distinctions, “show everything that grants Heavy Attack Chance” can be answered in one query without conflating 78 fixed equipment sources with hundreds of optional item configurations or unrelated Heavy Attack mechanics.
