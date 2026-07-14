# Passive and mastery calculation audit

> This document is the pre-fix evidence baseline. Post-fix classifications and verification are in `docs/calculation-authority-final-review-2026-07-14.md` and `web/tl-passive-effect-contract.js`.

## Scope

- Audit date: 2026-07-14
- Worktree: `D:\TL_Helper-calculation-release`
- Branch: `codex/calculation-consistency-release`
- Audited commit: `0644307`
- Game build: `24118850`
- Scope: weapon passive skills, weapon mastery, unified mastery, innate item passives, selectable perk passives, progression validation, and every build-consuming web surface
- Implementation state: investigation only; no calculation code changed by this audit

The dirty main checkout at `D:\TL_Helper` was not modified.

## Executive conclusion

The current build is not yet calculation-complete outside the set-effect family.

Equipment and artifact set effects have a complete contract for persistent sheet totals: all 151 projected breakpoints are structured, mapped, or explicitly unsupported. Passive skills and mastery do not yet have the same contract.

The release-blocking findings fall into four connected groups:

1. `calculateBuild()` and Combat Power apply stored skills and mastery that are foreign, over-cap, prerequisite-invalid, duplicated, or incorrectly typed.
2. The non-scratch Full Build Optimizer can change weapon families while carrying the source build's incompatible skills and mastery into candidate and finalist calculations.
3. Existing weapon-passive, non-structured mastery, and item/perk registries contain decoded-confirmed incorrect or incomplete rules.
4. The passive-effect classification contract that already protects set effects does not yet cover all progression and item/perk families.

The shipped client text resolves the intended rule. Passive skills and mastery from both equipped weapon families apply concurrently, even while one weapon is holstered. Unequipped-family effects do not apply. Unified mastery applies regardless of weapon.

Progression legality is also incomplete at the calculator boundary. Imported or persisted builds can exceed skill-slot caps, exceed per-weapon mastery budgets, retain foreign selections, and bypass canonical skill type through stored `loadoutType`, without a legality warning. Combat Power uses the same unfiltered selections.

Finally, the current passive rule registry is not a complete persistent-effect registry. Several unmapped passive descriptions contain unconditional persistent stats. These require decoded formula mapping rather than being treated as ordinary combat-only exclusions.

## Inventory and current coverage

| Effect family | Projected or decoded inventory | Current static handling | Audit state |
| --- | ---: | --- | --- |
| Equipment and artifact set breakpoints | 151 | 40 structured, 102 mapped, 9 explicit unsupported | Complete persistent-sheet contract |
| Weapon passive skills | 80, eight per weapon family | 9 complete mapped, 3 incomplete mapped, 6 persistent unmapped, 62 conditional or scoped | Incomplete |
| Normal mastery nodes | 400, 40 per weapon family | 351 structured numeric nodes; 49 passive-skill nodes | Structured rows complete; passive rows partial |
| Normal mastery passive nodes | 49 | 8 mapped complete, 3 mapped incorrect, 2 persistent missing, 1 unrepresentable, 35 conditional | Exhaustively classified |
| Synergy mastery nodes | 120, 12 per weapon family | 10 mapped complete, 1 mapped incorrect, 8 persistent missing, 101 conditional | Exhaustively classified |
| Unified mastery nodes | 24 | 1 mapped complete, Potential; 23 conditional | Exhaustively classified |
| Unique projected innate item-passive IDs | 232 across 251 item occurrences | 3 IDs exist in `ITEM_PASSIVE_RULES`; one weapon rule is wrong and two entries are unreachable duplicates | Incomplete |
| Unique projected selectable perk-passive IDs | 241 across 880 options on 21 socket-bearing items | 1 ID exists in `PERK_PASSIVE_RULES`; one decoded persistent armor effect is in the wrong registry | Incomplete |
| Unique projected item/perk passive complexes | 294 | 179 occur in both catalogs; 293 resolve through extracted SkillSet XML | Exhaustively classified |

There is no structured mastery plus `MASTERY_SYNERGY_RULES` double-count overlap. The registry name is misleading: its 16 entries contain 11 normal passive mastery nodes and 5 actual synergy nodes.

## Confirmed defects

### P0: foreign weapon passive skills affect totals

`selectedSkillRows()` normalizes stored IDs but does not intersect them with the equipped weapon families. `applyQuestlogPhase()` then applies any matching `PASSIVE_SKILL_RULES` entry.

Relevant code:

- `web/tl-core.js:454-473`: normalization removes unknown and duplicate IDs, but does not enforce weapon family or caps.
- `web/tl-core.js:624-625`: the correct equipped weapon set is already available through `equippedWeaponTypes(build)`.
- `web/tl-core.js:1289-1293`: selected rows are resolved without weapon filtering.
- `web/tl-core.js:2146-2148`: passive rules are applied without a weapon check.

The game guide is explicit:

- `TLStringGameGuide::TEXT_RES_HELP_SKILL_MESSAGE_01`: passive skills can only be registered for an equipped weapon type; a holstered equipped weapon remains active; an unequipped weapon passive does not apply even if it remains in a quick slot.
- `TLStringGameGuide::TEXT_RES_OB_GUIDE_PAGE_SKILL_04_1`: only equipped weapon skills in quick slots can be used or applied.

Recommended behavior: preserve stale selections in the saved build, but treat them as inactive until their weapon family is equipped again. Report them separately from genuinely unsupported selected passives.

### P0: foreign weapon mastery affects totals

The structured and passive mastery application loops iterate every stored mastery ID:

- `web/tl-core.js:1797-1801`: structured mastery stats
- `web/tl-core.js:2150-2154`: normal passive and synergy mastery rules
- `web/tl-core.js:2155-2159`: unified mastery rules

Only the unified loop should remain independent of equipped weapon family.

The shipped localization establishes the rule:

- `TLTextTooltip::TEXT_TOOLTIP_MASTERY_STAT_EFFECT_ON_Description`: mastery buffs from the equipped weapon set apply.
- `TLTextTooltip::TEXT_TOOLTIP_MASTERY_STAT_EFFECT_OFF_Description`: mastery buffs from unequipped weapon sets do not apply.
- `TLTextTooltip::TEXT_TOOLTIP_MASTERY_SKILL_EFFECT_ON_Description`: mastery skills from the equipped weapon set apply.
- `TLTextTooltip::TEXT_TOOLTIP_MASTERY_SKILL_EFFECT_OFF_Description`: mastery skills from unequipped weapon sets do not apply.
- `TLStringGameGuide::TEXT_RES_HELP_GEARSCORE_MESSAGE_01`: Main and Off-hand mastery levels both contribute.
- `TLTextTooltip::TEXT_TOOLTIP_MASTERY_COMBINE_SKILL_Description`: Overall Mastery Skills apply regardless of weapon.

Recommended behavior: gate normal structured mastery, normal passive mastery, and synergy mastery with `equippedWeaponTypes(build)`. Do not use `currentWeaponTypes(build)` because it fabricates a Bow fallback for an empty build. Keep unified mastery global.

### P0: optimizer progression can become incompatible with optimized weapons

`applySelections()` clones the complete source build and replaces equipment selections only. Skills, mastery, and unified mastery survive unchanged.

- `web/tl-full-build-adapter.js:164-171`: carries source progression into candidate equipment.
- `web/tl-full-build-adapter.js:591-599`: deliberately retains seeds for every weapon family.
- `web/tl-full-build-adapter.js:627-631`: candidates are scored with the carried progression.
- `web/tl-full-build-adapter.js:673`: the selected finalist is recalculated with the same incompatible progression.

This is a systematic scoring distortion, not only a display issue. A Staff passive can help a Bow/Dagger candidate survive beam pruning and can change its final score.

Build from Scratch is correctly scoped to the selected weapon pair because it clears progression, allocates mastery only for the chosen pair, and selects passive skills only from `availableSkillsForWeapons(weapons)` in `web/tl-progression-optimizer.js:119-139`. It still inherits incomplete or incorrect effect rules from the shared calculator.

Recommended behavior for the ordinary optimizer: either lock weapon families when preserving source progression, or rebuild progression for every changed weapon pair. Silently retaining incompatible progression is invalid.

### P0: persistent passive-skill coverage is incomplete

Only 12 of 80 projected passive skills have rules. Nine are complete, three omit decoded-confirmed persistent components, and six additional passive skills have persistent sheet-stat components without rules. The other 62 are conditional, triggered, target-scoped, skill-scoped, or combat-stage effects and should not be invented as always-on sheet totals.

The full join used English localization, `TLFormulaParameterNew`, `TLEffectProperty`, weapon abnormal-state tables, and `TLStats`. No projected weapon passive skill remains unresolved after this classification.

The three incomplete mapped rules are:

| Passive | Correct existing component | Missing persistent component |
| --- | --- | --- |
| Wrathful Edge, `SkillSet_WP_DA_S_CriticalDamageUp` | Critical Damage +19.5% at level 20 | Rear Hit Chance +120, raw 1,200 |
| Forbidden Sanctuary, `SkillSet_WP_ST_S_SkillPowerAmplificationBuff` | Skill Damage +162 and Mana Cost Efficiency -15% | Side and Rear Critical Hit Chance +100 each, raw 1,000 each |
| Aegis Shield, `SkillSet_WP_SW_SH_S_ArmorUp` | Dynamic Melee and Ranged Defense | Block Damage Reduction +2.5%, raw 250 |

The six persistent unmapped rules at level 20 are:

| Passive | Persistent sheet contribution | Conditional or hidden remainder |
| --- | --- | --- |
| Earth's Blessing, `SkillSet_WP_BO_S_NatureForce` | Health Regen +144, raw 144,000; continuous healing +39%, raw 3,900 | None |
| Distorted Sanctuary, `SkillSet_WP_BO_S_AuraDefenceUp` | Exact self-minimum All Endurance +66, raw 660; continuous healing +6.6%, raw 660 | Additional nearby party-member stacks require party context |
| Ambidexterity, `SkillSet_WP_CR_S_OffHandMaxDmg` | Off-hand maximum damage delta +45 | +105 All Critical Hit Chance applies only while attacking off-hand |
| Physique Training, `SkillSet_WP_GT_Passive_WeightClassUp` | Max Health +2,450; Max Stamina +19 | None |
| Master of Provocation, `SkillSet_WP_GT_Passive_TauntMaster` | Melee and Ranged Defense +328 | Aggro +200% is exact but uses hidden `aggro_modifier`; keep unsupported unless exposed |
| Impenetrable, `SkillSet_WP_SW_SH_S_AroundCountBuff` | Exact minimum All Defense +179 because zero targets is in the 2-or-fewer band | 3 to 6 targets gives 280; 7 or more gives 700 |

Exact level-20 formula rows include `BO_NatureForce_HpRegenUp`, `BO_NatureForce_ContinuousHealUp`, `BO_AuraDefenceUp_CriticalDefenceUp_Party_01`, `BO_AuraDefenceUp_ContinuousHealUp_Party_01`, `CR_OffHandMaxDmg_OffHandMaxDmgUp`, `WP_GT_WeightClassUp_MaxHP`, `WP_GT_WeightClassUp_MaxStamina`, and `WP_GT_TauntMaster_ArmorDebuff`.

New unit mappings are required for `rear_all_accuracy`, `side_all_critical_attack`, and `rear_all_critical_attack` at `0.1`. `shield_block_efficiency` already uses `0.01`.

#### Complete 80-passive classification

This table is the durable classification summary. "Conditional remainder" covers triggered, target-count, skill-scoped, weapon-action-scoped, or combat-stage effects that must not be added to an always-on sheet total.

| Weapon family | Complete mapped | Incomplete mapped | Persistent unmapped | Conditional remainder |
| --- | --- | --- | --- | ---: |
| Bow | None | None | Distorted Sanctuary; Earth's Blessing | 6 |
| Crossbow | Piercing Strike; Corrupt Nail | None | Ambidexterity | 5 |
| Dagger | Assassin's Instincts | Wrathful Edge | None | 6 |
| Gauntlet | None | None | Physique Training; Master of Provocation | 6 |
| Orb | Eternal Veil | None | None | 7 |
| Spear | None | None | None | 8 |
| Staff | Asceticism; Mana Amp | Forbidden Sanctuary | None | 5 |
| Sword | None | Aegis Shield | Impenetrable | 6 |
| Greatsword | Robust Constitution; Vital Force | None | None | 6 |
| Wand | Noble Revival | None | None | 7 |

Totals: 9 complete mapped, 3 incomplete mapped, 6 persistent unmapped, and 62 conditional remainder entries. These categories are mutually exclusive and total exactly 80.

### P0: non-structured mastery rules are incorrect and incomplete

All 193 non-structured mastery nodes now have a mutually exclusive decoded classification:

| Classification | Normal | Synergy | Unified | Total |
| --- | ---: | ---: | ---: | ---: |
| Mapped sheet-complete | 8 | 10 | 1 | 19 |
| Mapped incorrect | 3 | 1 | 0 | 4 |
| Missing persistent rule or interaction | 2 | 8 | 0 | 10 |
| Persistent but unrepresentable | 1 | 0 | 0 | 1 |
| Conditional or combat-scoped | 35 | 101 | 23 | 159 |
| Unresolved | 0 | 0 | 0 | 0 |
| **Total** | **49** | **120** | **24** | **193** |

The four incorrect mapped rules are:

| Node | Current error | Decoded-correct behavior |
| --- | --- | --- |
| `Dagger_Hero_Tactic_04` | Tests Dexterity 90, makes the branches exclusive, ignores Strength, and uses excessive Evasion values | Independently apply Critical Damage +4.4% to +8% at Dexterity 80 or more and All Evasion +66 to +120 at Strength 80 or more; both apply when both thresholds pass |
| `Staff_Hero_Defense_03` | Omits the source cap | The Mana Regen input is capped at displayed 3,500 before the 20% scaling and rank addition |
| `Sword_Hero_Defense_03` | Caps Health at 30,000 and converts a percentage Base Damage penalty into flat Bonus Attack Power | Endurance scales through 40,000 Health; the fixed Base Damage penalty is -8.8% to -16% |
| `Bow_Rare_Def_Skill` | Uses uncapped Perception | Both Melee Evasion and Melee Endurance use `floor(min(Perception, 99) / 10) * 24`, maximum 216 |

The ten missing persistent rules or interactions are:

| Node or interaction | Decoded persistent sheet effect |
| --- | --- |
| `Crossbow_Hero_Tactic_04` | Movement Speed +4.4% to +8% by rank; the melee-hit debuff remains conditional |
| `GT_Hero_Tactic_04` | Critical Damage +0.66% to +1.2% per full ten Dexterity and Critical Damage Resistance +0.66% to +1.2% per full ten Fortitude, source attributes capped at 130 |
| `Bow_Normal_Tac_Skill` plus Distorted Sanctuary | Replace the passive's self-minimum with All Hit Chance +44 and Range +0.75% at passive level 20; additional party stacks remain contextual |
| `Crossbow_High_Attack_Skill` plus Ambidexterity | Replace Off-hand maximum damage +45 with +30 and add Off-hand Heavy Attack Chance -4% |
| `Dagger_Normal_Util_Skill` plus Assassin's Instincts | Add persistent All Hit Chance -150; critical-hit healing remains combat-scoped |
| `Gauntlet_High_Attack_Skill` plus Master of Provocation | Base Damage +1.6% at passive level 1 through +3.25% at level 20; hidden Aggro -30% remains unsupported |
| `Gauntlet_Normal_Def_Skill` plus Physique Training | Remove the Health increase, retain Max Stamina, and add Stamina Regen +2.4 through +9; at passive level 20 the delta is Max Health -2,450, Max Stamina unchanged at +19, and Stamina Regen +9 |
| `Spear_High_Attack_Skill` | All Defense -200; the Mortal Wrath damage boost remains skill-scoped |
| `Staff_Normal_Def_Skill` plus Mana Amp | At passive level 20 use Max Mana +2,597 and Max Health +2,160 instead of +3,710 and +1,350 |
| `Sword2h_Normal_Def_Skill` | Melee Heavy Attack Chance -100; the Indomitable Armor boost remains activation-scoped |

`GT_Hero_Attack_01` is the single decoded persistent effect that the current sheet model cannot represent honestly. Its default state gives All Defense +6.6% to +12% and Base Damage -5.5% to -10%; Eclipse of Blood reverses the trade. The calculator has flat Defense and weapon-damage components but no correct general percentage materialization for these values. It must remain explicitly unsupported until that model exists.

The other 159 nodes are triggers, duration effects, target or range state, Health or Mana state, skill-family modifiers, procs, crowd control, party context, or Guardian Morph effects. They are classified conditional rather than unresolved and must not be added to unconditional sheet totals.

### P0: Aridus's Fury is calculated as a different weapon's effect

The only current weapon entry in `ITEM_PASSIVE_RULES` is keyed as `SkillSet_WP_Item_FieldBoss_T3_ST_02`. The passive is Aridus's Fury on Aridus's Immolated Voidstaff. Its decoded Staff effect is conditional:

- stationary for 3 seconds activates Base Damage +12%
- the effect lasts for 2 seconds after moving
- decoded effect rows are `WP_Item_FieldBoss_T3_ST_02_Stabilize` and `WP_Item_FieldBoss_T3_ST_02_AdjustStat`

The implemented rule instead reads Max Health and adds 0.4% main-hand Bonus Attack Power per 1,000 Health. That concept belongs to Adentus's Fury, `SkillSet_WP_Item_FieldBoss_T3_SW2_02`, whose decoded graph contains a Greatsword activation watcher and interval stat adjustment.

This is not safely fixed by renaming the key. Adentus's effect uses current Health, affects Base Damage, caps at 14.4%, and requires a Greatsword attack state. The current rule uses Max Health, affects only main-hand Bonus Attack Power, and has no weapon activation requirement. Remove the Staff rule from persistent calculation until the scenario and active-weapon model exists.

### P0: Dark Wing's Bulwark is unreachable in the wrong registry

`SkillSet_Unique_Armor_Skill_01`, Dark Wing's Bulwark, exists only as a selectable perk on six raid armor pieces. It never appears in projected `item.passives`, but its rule exists only in `ITEM_PASSIVE_RULES`, so the calculator never applies it.

Decoded evidence maps the complex to `Equip_Unique_Armor_Skill_01` and `Equip_Unique_Armor_Skill_01_AdjustStat`. The current dormant values agree with the projection: Max Health +2,000 and Magic Defense +300. Move or mirror the effect into the perk rule path and test it through a real selected `perkId`.

`SkillSet_Unique_Accessory_Skill_01`, Dark Wing's Power, is correctly effective in `PERK_PASSIVE_RULES`: Melee and Ranged Defense +300 and Max Mana +1,000. Its duplicate item-registry entry is unreachable.

### P1: item/perk duplicate suppression is a latent design gap

The guard at `web/tl-core.js:2116-2122` only suppresses a selected perk when the same item also contains the same innate passive. No current item has both any innate passive and any selectable perk, so the guard cannot fire.

The catalogs overlap on 179 passive complex IDs. A build can obtain the same complex from an innate weapon and from a selected core on a different raid item. If a rule is added to both registries, both applications would currently execute. No currently effective mapped rule is proven to double-count through this cross-item path. Decoded abnormal-state rows use `StackCap: 1`, which is evidence that same-effect stacking needs investigation, but it does not by itself prove cross-slot runtime semantics.

Do not add a build-global dedupe rule until the same-core stacking test resolves runtime behavior. If dedupe is confirmed, use an application key such as passive complex plus personal component rather than a per-item comparison. Distinct personal and party-aura components must remain distinct where the decoded graph proves both.

The repeated raid core pools need a separate stack audit. The same armor pool appears on six items and the same accessory pool appears on five. The current engine applies each selected core independently, so Dark Wing's Power can be counted up to five times. Whether equal cores on separate gear slots stack is not established by the current projection.

### P1: decoded item/perk persistent candidates are not mapped

High-confidence persistent sheet candidates are:

| Passive complex | Item effect | Exact or modeled treatment |
| --- | --- | --- |
| `SkillSet_WP_Item_A08_kAA_BO` | Mind's Eye: Range +9% to self and nearby party | Exact one personal application; exclude party propagation |
| `SkillSet_WP_Item_A07_kA_CR` | Malakar's Eye of Storm: Movement Speed +8% to self and nearby party | Exact one personal application; exclude party propagation |
| `SkillSet_WP_Item_Nix_Field_CR_01` | Wind's Guidance: Movement Speed +8% and all three Evasions +160 to self and party | Exact one personal application; exclude party propagation |
| `SkillSet_WP_Item_FieldBoss_T3_CR_02` | Malakar's Blazing Wind: Base Damage +2.5% to party members | Exact party aura; owner application unsupported pending target-filter confirmation, so no personal stat is added |
| `SkillSet_WP_Item_Field_NIX_GT_02` | Southpaw: Off-hand Weapon Damage +90 | Exact, but requires an off-hand Bonus Attack Power rule and unit mapping |
| `SkillSet_WP_Item_Field_NIX_GT_01` | Orthodox: projected Main Weapon Damage +90, decoded formula row 40 | Source conflict; keep out of exact scoring |
| `SkillSet_Unique_Armor_Skill_01` | Dark Wing's Bulwark: Max Health +2,000 and Magic Defense +300 | Exact selected-perk rule; currently unreachable |

Armor and accessory cores can expose weapon-specific perk effects. Projection `perk.weapon` and decoded `TLPerkOption.AttachableItemTypes` provide weapon-family requirements where present, but `calculateBuild()` does not check `perk.weapon`. Any new static perk rule must require a matching equipped family. A decoded `Weapon_Activation_Watcher`, such as either Adentus passive, is stronger than an equipped-family requirement and needs explicit active-weapon or scenario state.

The following effects are decoded but must not be precalculated as always-on totals:

- Adentus's Passion: current-Health scaling while attacking with a Greatsword
- Adentus's Fury: current-Health percentage scaling while attacking with a Greatsword
- Vindictive Wraith Blade: Base Damage +15% only at or below 40% Health
- Aridus's Immolated Voidstaff: stationary activation and movement grace period
- skill transformations, on-hit procs, duration buffs, and target debuffs

`mayAffectStaticTotals()` is only a warning heuristic. It misses condition words such as `if`, `per`, and timed clauses, so it must not be used to generate or approve persistent rules.

#### Complete 294-complex item/perk classification

Every projected item/perk passive complex has exactly one top-level classification:

| Classification | Count | Interpretation |
| --- | ---: | --- |
| Effective mapped complete | 1 | Dark Wing's Power |
| Effective mapped wrong, incomplete, or unreachable | 2 | Dark Wing's Bulwark; mis-keyed Aridus Staff rule |
| Decoded-proven persistent missing | 5 | Mind's Eye; Eye of Storm; Blazing Wind; Southpaw; Wind's Guidance |
| Conditional, scenario, proc, skill-transform, debuff, or otherwise non-sheet | 284 | Correctly excluded from always-on sheet totals |
| Source-conflict review | 1 | Orthodox, projection 90 versus formula 40 |
| Unresolved missing decode | 1 | `SkillSet_WP_Item_FieldBoss_T2_ORB_01` |
| **Total** | **294** | Every projected ID assigned once |

The 284 unsupported entries divide into 202 trigger or scenario effects, 49 skill transformations or skill-specific effects, 16 timed buff, debuff, or crowd-control effects, 9 other conditional or non-sheet effects, 7 proc damage or healing effects, and 1 non-combat economy effect.

`SkillSet_WP_Item_FieldBoss_T2_ORB_01`, Primal Brothers' Thunder Strike, lacks the exact complex-to-simple XML join. Its projected text and same-stem decoded rows describe a summon-triggered damage proc, so it is unlikely to affect sheet totals, but it remains conservatively unresolved until the join is restored.

The supporting ledger was generated outside the repository:

- CSV: `C:\Users\thats\AppData\Local\Temp\tl-helper-passive-ledger-2026-07-14.csv`, SHA-256 `F93B4778116FB8F444ACDF7442E7E003577440C415F91694AEB961F428A26639`
- JSON: `C:\Users\thats\AppData\Local\Temp\tl-helper-passive-ledger-2026-07-14.json`, SHA-256 `20DAB087E3B7A67528876C28EB2B7303A53993E5FA26006740E404E731C9DC0E`

Both contain 294 rows or objects and 294 unique complex IDs. Columns include catalog presence, carrier and perk IDs, weapon requirements, current rule flags, XML join status, simple skill IDs, decoded effects, formula records, and normalized descriptions.

These `%TEMP%` ledgers are reproducible review artifacts, not durable repository evidence. Persist either the ledger or its generator before using row-level classification as a release guard. The exhaustive counts and exceptions are retained in this Markdown.

### P1: progression caps are not validated at the calculation boundary

`PASSIVE_SKILL_CAP` is enforced by Armory selection UI and the scratch progression optimizer, but not by normalization, `calculateBuild()`, or `validateBuild()`.

A legal Bow/Dagger pair with nine stored passive selections produced no cap issue. Validation only reported eight unmapped passives. The ninth, Assassin's Instincts, had a mapped rule and was calculated.

Additional invariants needing calculation-boundary validation:

- active skill cap
- passive skill cap
- defensive skill cap
- canonical skill type instead of trusting stored `loadoutType`
- per-weapon 220-point mastery budget
- mastery prerequisites and synergy limits on imported data
- unified mastery cap, currently an explicit product assumption rather than decoded proof
- equipped-family membership

The preferred response is to calculate a deterministic legal subset and emit explicit validation issues. Rejecting or deleting persisted data would make temporary weapon swaps destructive.

Exact malformed or imported-build reproductions:

| Invalid progression | Observed result | Validation result |
| --- | --- | --- |
| Foreign Staff Judgment Lightning active skill, level 21, on Bow/Dagger | Combat Power 250 to 292 | No issue |
| Foreign Staff Mystic Shield defensive skill, level 20, on Bow/Dagger | Combat Power 250 to 290 | No issue |
| Foreign Staff Forbidden Sanctuary passive, level 20, on Bow/Dagger | Combat Power 250 to 290 and passive sheet stats apply | No issue |
| 13 active, 9 passive, and 2 defensive legal-family skills at level 20 | Combat Power 250 to 1,210 | No cap issue |
| All 40 Bow normal mastery nodes at maximum, 400 points total | Combat Power 250 to 1,510 and all structured stats apply | No budget issue |
| Bow high-tier or rare node without its point prerequisite | Node stat and Combat Power contributions apply | No prerequisite issue |
| Five unique unified selections | All five are accepted | No issue against the configured assumed cap of four |
| Five duplicate Potential selections | Every base attribute receives +5 through five sources | No deduplication issue |

`masteryCanSetLevel()` enforces the 220-point limit only during UI transitions. `masteryLockInfo()` also treats an already-selected node as unlocked, so it is not suitable as the validation authority for persisted data. `reconcileMasterySelections()` checks tier, synergy, and epic constraints but does not check the 220-point budget, is only invoked by selected Armory paths, and is bypassed by Questlog import and other consumers.

Unified mastery requires separate canonical handling. `selectedUnifiedMasteries()` accepts truthy entries without identity checks or deduplication, while the four-entry cap exists only in Armory rendering and click behavior and is labeled assumed in the UI. Identity and deduplication are correctness requirements; the cap remains a product policy until decoded evidence confirms it. A unified ID placed in `build.masteries` is also accepted by normal mastery normalization and incorrectly contributes to Combat Power.

### P1: stored skill type can bypass canonical caps

`normalizeSkillSelections()` trusts serialized `loadoutType`. The canonical authority already exists in `skillLoadoutType(skill)`.

A Staff/Dagger Forbidden Sanctuary selection stored as `loadoutType: "active"` is displayed and counted as active, still executes the passive rule for +1,620 raw Skill Damage and -1,500 raw Mana Cost, and emits no validation issue. Duplicate IDs are first-wins deduplicated, so placing the spoofed copy first preserves the bypass.

Any effective-progression projection must derive type from the canonical projected skill row and ignore the serialized type for legality and calculation.

### P1: Combat Power counts foreign and over-cap progression

Combat Power remains a fitted heuristic, not a decoded exact formula. Even within that boundary, it currently counts all stored skill rows and all stored mastery levels:

- `web/tl-core.js:2199`: every selected skill level
- `web/tl-core.js:2200-2202`: every stored mastery level

The same legality projection used for sheet totals should feed Combat Power. Otherwise displayed sheet stats and displayed Combat Power describe different effective loadouts.

Combat Power also reads raw `build.masteries` rather than normalized mastery selections. Adding `{ spoofed_mastery: { level: 999 } }` to the baseline Bow/Dagger build raises Combat Power from 250 to 3,327 with no validation issue. Snapshot resolution removes unknown mastery IDs, but known foreign, over-budget, prerequisite-invalid, and wrong-category IDs remain. A deserialized pre-resolved snapshot is shape-checked and not recalculated, so it is not an untrusted-data integrity boundary.

### P2: validation conflates inactive and unsupported effects

`unmappedRuleIssues()` reports missing calculation rules but has no inactive-weapon category. After weapon scoping is corrected, validation and source breakdowns should distinguish:

- selected and active
- retained but inactive because its weapon is unequipped
- over-cap and inactive
- active but unsupported by the static calculator
- active and mapped

## Exact weapon activation semantics

### Passive skills

Both equipped weapon families are active sources of passive skills. The currently drawn weapon does not matter. Unequipped-family passives do not apply.

This is exact from the shipped English and Korean game-guide strings. It is also consistent with the Armory UI and all three committed reference fixtures, which contain no foreign-family skill selections.

### Normal and synergy mastery

Both equipped weapon families contribute their normal stats and mastery skills concurrently. Unequipped-family mastery does not apply.

Decoded node facts:

- `TLWeaponSpecializationNodeNormal`: 400 of 400 rows decoded, all with `weapon_category`.
- Every normal row also has `weapon_activated_only`; all 400 current values are `false`.
- 351 rows use structured `stat_id_*` references and 49 use `passive_skill_id_*` references.
- `TLWeaponSpecializationNodeSynergy`: 120 of 120 rows decoded, all with `weapon_category`; the schema has no activation-only field.
- All 3,510 normal-node stat references resolve to `TLWeaponSpecializationStat`; none are missing.

The currently drawn weapon therefore requires no calculator state for build 24118850.

### Future `weapon_activated_only` rows

No current row can prove the runtime behavior of a `true` flag. The name strongly suggests a future normal node may require the currently drawn weapon, but inventing a main-hand approximation would be unjustified.

Required defense: add a decoded audit assertion that the number of true flags remains zero. If a future build introduces one, fail the data audit and require explicit active-weapon modeling before counting it.

### Unified mastery

Unified mastery is global. The 24 unified rows have neither `weapon_category` nor an activation-only field. Shipped guide and tooltip strings explicitly say Overall Mastery Skills apply regardless of weapon.

## Reproductions

### Bow/Dagger with retained Staff progression

Build:

- equipped weapons: Bow and Dagger
- retained passive: Staff `SkillSet_WP_ST_S_SkillPowerAmplificationBuff`, Forbidden Sanctuary, level 20
- retained mastery: Staff `Staff_High_Attack_02`, Magic Damage Intensity

Observed incorrect contributions:

| Source | Tested level | Incorrect contribution |
| --- | ---: | --- |
| Forbidden Sanctuary | 20 | Skill Damage Boost +1,620 raw; Mana Cost modifier -1,500 raw |
| Magic Damage Intensity | 1 | Magic Damage +30 raw; Ranged Evasion -45 raw |
| Magic Damage Intensity | 10 | Magic Damage +300 raw; Ranged Evasion -450 raw |

No foreign-weapon validation warning is produced.

### Sword/Greatsword with retained Dagger or Bow mastery

- `Dagger_High_Attack_01` level 1 incorrectly adds +32 raw to Magic, Melee, and Ranged Critical Hit Chance.
- `Bow_Rare_Def_Skill` incorrectly adds +240 raw Melee Evasion and Melee Endurance.

These rows are known mastery IDs, so normalization retains them even though their weapon family is unequipped.

### Nine passive skills

A Bow/Dagger build accepted nine passive skills while `PASSIVE_SKILL_CAP` is eight. Validation emitted only the unmapped-rule message and no cap or legality warning.

## Entry-path audit

| Entry path | Current behavior | Risk |
| --- | --- | --- |
| Armory skill picker | Offers current equipped families and enforces UI caps | Correct for new clicks only |
| Armory weapon swap | Replaces equipment but does not deactivate, prune, or warn on stale skills/mastery | Foreign progression affects totals |
| Saved Armory build | Drops unknown IDs but retains known foreign IDs and over-cap rows | Invalid selections survive reload |
| Questlog import | Copies skill and mastery build selections without intersecting imported weapons | Trusts upstream consistency |
| BuildSnapshot | Normalizes mastery IDs only, then calculates | Carries foreign and over-cap progression into consumers |
| Full Build Optimizer | Preserves source progression while exploring all weapon families | Systematic candidate and finalist distortion |
| Build from Scratch | Clears and rebuilds progression for the mandatory selected pair | Correct weapon-family scoping; shared effect-rule defects remain |
| Gear Viewer | Restricts weapon candidates to equipped weapon types | Does not create a new foreign pair, but inherited invalid source progression still affects deltas |

## Cross-surface impact

| Surface | Calculation authority | Progression source | Current impact |
| --- | --- | --- | --- |
| Armory | `resolveBuildSnapshot()` to `calculateBuild()` | Local or imported build | Foreign and over-cap selections can affect totals and Combat Power |
| Tracker | Saved Armory build through `resolveBuildSnapshot()` | Local storage | Repeats Armory's invalid effective progression |
| Combat Lab | Armory, preset, or imported `BuildSnapshot` | Snapshot loadout | Attacker and defender sheet inputs can include invalid progression |
| Gear Viewer | `calculateBuild()` and slot deltas | Saved or imported source build | Candidate deltas inherit invalid source progression |
| Full Build Optimizer | `calculateBuild()` for candidates and finalists | Source build unless scratch | Can score new weapon families using old progression |
| Build from Scratch | `calculateBuild()` after scoped progression optimization | Rebuilt for chosen pair | Correctly scoped to the chosen pair; incomplete or incorrect shared rules still apply |

## Missing tests

Required regression tests:

1. Passive from the main equipped family applies.
2. Passive from the off-hand equipped family applies while holstered.
3. Passive from an unequipped family is retained but contributes nothing.
4. Foreign structured mastery contributes nothing.
5. Foreign normal-passive mastery contributes nothing.
6. Foreign synergy mastery contributes nothing.
7. Unified Potential applies regardless of the weapon pair.
8. Empty builds do not activate the `currentWeaponTypes()` Bow fallback.
9. A weapon swap deactivates stale progression without deleting it.
10. Re-equipping the weapon reactivates retained legal progression.
11. More than eight passive skills produces a validation issue; any exclusion precedence is explicitly specified before it changes totals.
12. Stored `loadoutType` cannot disguise a passive as an active skill.
13. Imported over-budget mastery produces a validation issue; its eventual calculation policy has deterministic tested precedence.
14. Unified mastery above the configured assumed cap produces a clearly labeled policy validation issue.
15. Full Build Optimizer cannot evaluate a changed weapon pair with incompatible source progression.
16. Combat Power and sheet totals use the same effective progression projection.
17. Decoded `weapon_activated_only === true` count remains zero for build 24118850.
18. The four incorrect mastery rules cover their exact thresholds, independent branches, caps, and percentage units.
19. Each of the ten missing mastery-passive interactions replaces or augments the base passive exactly once.
20. Aridus's Fury contributes no persistent total without an explicit stationary scenario.
21. Dark Wing's Bulwark applies through a real selected armor perk and not through an unreachable innate path.
22. Weapon-specific armor or accessory perks require their decoded equipped family; activation-watcher effects remain scenario-only.
23. Every projected weapon passive, mastery passive, item passive, and selectable perk has exactly one canonical classification.
24. Same-core cross-slot behavior is tested against the in-game result before any global dedupe rule is enabled.
25. The six missing weapon-passive rules and three incomplete rules match decoded level boundaries and units.

## Recommended implementation plan

### Phase 1: exact effective-progression projection

Create one pure helper that returns:

- equipped weapon family set
- active equipped-family skills by canonical type
- inactive foreign skills
- over-cap skills as validation findings, without silently choosing a subset
- active equipped-family normal and synergy mastery
- inactive foreign mastery
- mastery budget and prerequisite violations
- active unified mastery
- unified overflow

Use this helper in `calculateBuild()`, `combatPowerBreakdown()`, `validateBuild()`, BuildSnapshot resolution, and page explanations. Do not duplicate filtering in individual pages.

Weapon-family activation and canonical skill typing are exact and can immediately control totals and Combat Power. Skill-cap, mastery-budget, prerequisite, and unified-cap failures should initially be surfaced non-destructively. Do not silently truncate those selections until a stable precedence policy is specified and tested.

### Phase 2: optimizer weapon-pair policy

For non-scratch optimization, choose and expose one explicit policy:

1. Preserve progression and lock both weapon families, or
2. Allow weapon-family changes and rebuild passive/mastery progression for each pair.

The second policy is more powerful but more expensive. Until it exists, locking weapon families is the safe calculation-correct behavior.

### Phase 3: exact rule corrections

Remove the incorrect Aridus persistent calculation. Correct the decoded-proven weapon passive and mastery components, route Dark Wing's Bulwark through selected perks, and add exact persistent candidates whose owner semantics and units are established. Keep scenario effects and `GT_Hero_Attack_01` explicitly unsupported.

### Phase 4: legality policy and validation

Add non-destructive validation for skill caps, mastery budgets and prerequisites, duplicate or wrong-category unified IDs, and the currently assumed unified cap. Before illegal selections are excluded from totals, define deterministic precedence and cover it with import, persistence, and cross-surface tests.

Resolve same-core stacking before adding any global item/perk deduplication.

### Phase 5: passive-effect contract

Create a passive-effect audit contract parallel to set effects. Every projected passive skill, innate item passive, selectable perk passive, normal passive mastery, synergy mastery, and unified mastery must be classified as:

- structured exact
- mapped exact
- derived
- calibrated
- modeled
- explicitly unsupported
- conflict or unclassified

Any new or changed projected effect that is unclassified should fail a canonical audit test.

### Phase 6: decoded guards and cross-surface regression

Add decoded fixtures for mastery node counts, stat joins, activation flags, passive IDs, and formula bindings. Then run the complete calculation suite, reference builds, edge cases, optimizer tests, and browser smoke across all six build-consuming surfaces.

## Evidence locations

### Repository

- `web/tl-core.js`
- `web/tl-questlog-rules.js`
- `web/tl-build-snapshot.js`
- `web/tl-progression-optimizer.js`
- `web/tl-full-build-adapter.js`
- `web/index.html`
- `web/tracker.html`
- `web/combat-lab.js`
- `web/gear-viewer.html`
- `web/build-from-scratch.html`

### Decoded and localized game data

- `D:\TL_Data\raw\24118850\extracted\data\TL\Content\Game\Client\Table\TLWeaponSpecializationNodeNormal.uasset`
- `D:\TL_Data\raw\24118850\extracted\data\TL\Content\Game\Client\Table\TLWeaponSpecializationNodeSynergy.uasset`
- `D:\TL_Data\raw\24118850\extracted\data\TL\Content\Game\Client\Table\TLWeaponSpecializationNodeUnified.uasset`
- `D:\TL_Data\raw\24118850\extracted\data\TL\Content\Game\Client\Table\TLWeaponSpecializationStat.uasset`
- `D:\TL_Data\raw\24118850\extracted\localization\csv\en.csv`
- `D:\TL_Data\raw\24118850\extracted\localization\csv\ko.csv`
- `D:\TL_Data\decoded\24118850\tables\TLItemPassive.json`
- `D:\TL_Data\decoded\24118850\tables\TLItemEquip.json`
- `D:\TL_Data\decoded\24118850\tables\TLFormulaParameterNew.json`
- `D:\TL_Data\decoded\24118850\tables\TLEffectProperty.json`
- `D:\TL_Data\decoded\24118850\tables\TLStats.json`
- `D:\TL_Data\decoded\24118850\tables\TLAbnormalState_Weapon_Bow.json` through `TLAbnormalState_Weapon_Wand.json`, including `Common`
- `D:\TL_Data\cache\combat-power-investigation\TLPerkOption.json`
- `D:\TL_Data\raw\24118850\extracted\data\TL\Content\Game\Client\Table\TLPerkOption.uasset`
- extracted `SkillSet` XML and `TLEffectProperty` rows under `D:\TL_Data\raw\24118850`
- `D:\TL_Data\decoded\24118850\tables\TLSkill.json`
- `D:\TL_Data\decoded\24118850\tables\TLSkillOptionalDataForPc.json`

Scratch decodes used for this audit are outside the repository at `D:\TL_Data\scratch\passive-mastery-audit-20260714`.

### Decoded mastery table integrity

| Table | Rows | SHA-256 | Audit result |
| --- | ---: | --- | --- |
| `TLWeaponSpecializationNodeNormal.uasset` | 400 | `7d130349d89d3044c262b142b6de1c71ea01baef794c6f57692047f5309bb372` | 400 have weapon categories; 400 have `weapon_activated_only: false` |
| `TLWeaponSpecializationNodeSynergy.uasset` | 120 | `865c71fd8dd51f03c1f77c0487448944bcff07eac7c10cd6093a44223922d803` | 12 per weapon family; every row has a weapon category and passive-skill reference |
| `TLWeaponSpecializationNodeUnified.uasset` | 24 | `ead401533fe1fc4c782eead3fee98eaf64ef3f99ee4362189dbab0548c60cad9` | Global rows with no weapon category or activation-only field |
| `TLWeaponSpecializationStat.uasset` | 3,602 | `ca55222c6189fc4c36202dbfd345057e28037f3b3a932c54a628d0702b81ecde` | All 3,510 normal-node stat references resolve |
| `TLFormulaParameterNew.json` | 10,656 | `a5f0f8a5de2d72502009c0f15101c6faa24a865839475315407e4f6a73da18a1` | Decoded formula evidence used for passive and mastery values |
| `TLEffectProperty.json` | 54,205 | `81314657fb52d0c05675fc4f47f939e2b200959e5160b709f6df788e8a81c57b` | Decoded effect joins and behavior groups |
| `TLStats.json` | 292 | `44b52f59a9a46b783b5c04abf94149f630339c81929e5f24d209a8935814fe08` | Stat identity and display metadata |

These hashes were recomputed directly from the audited build-24118850 files during this audit.

## Verification baseline

The unchanged audited code passes the complete repository suite: 390 tests passed, 0 failed. The three reference builds match 69 of 69 asserted totals, and all 12 existing edge-case checks pass. This establishes a clean baseline only. The suite does not currently contain the foreign-weapon, cap, canonical-type, or missing-persistent-component regressions listed above.

## Remaining evidence work

The following evidence is required before calculation completeness can be claimed. It does not block independent decoded-proven fixes such as equipped-family filtering, canonical skill typing, removal of the incorrect Aridus rule, or exact component corrections:

1. Same-core stacking behavior across separate armor and accessory slots.
2. Owner inclusion for Malakar's Blazing Wind and the Orthodox 40-versus-90 source conflict.
3. Restoration of the missing SkillSet XML join for `SkillSet_WP_Item_FieldBoss_T2_ORB_01`.
4. Persistence of the row-level 294-complex ledger or a reproducible generator outside `%TEMP%`.

## Implementation handoff

Do not claim calculation completeness after only adding the weapon-family filter. That filter resolves the largest false-positive path, but persistent passive coverage and progression legality remain separate correctness requirements.

The safest implementation order is:

1. Add exact equipped-family and canonical-type projection.
2. Feed that projection into sheet totals and Combat Power.
3. Lock weapon families in non-scratch optimization until pair-specific progression rebuilding exists.
4. Remove the incorrect Aridus calculation and fix decoded-confirmed passive, mastery, and Bulwark rules.
5. Add non-destructive cap, prerequisite, duplicate, and wrong-category validation.
6. Specify deterministic legality precedence before invalid selections are excluded from totals.
7. Resolve same-core stacking before implementing global item/perk deduplication.
8. Introduce the canonical passive-effect classification audit and decoded drift guards.
9. Re-run cross-surface parity, reference builds, edge cases, optimizer tests, and browser smoke.
