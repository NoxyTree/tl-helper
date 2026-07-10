# Skill and passive stat-source join

Build investigated: `24118850`

## Outcome

The smallest trustworthy implementation can add all nine known player skills to `stat_sources`, but it must use two confidence tiers.

- Six skills have a current skill-set record plus a skill-map edge to matching formula rows: Shield Throw, Shield Strike, Gerad's Shield, Asceticism, Unyielding Sentinel, and Precision Dash.
- Pulse of the Battlegrounds and Malice Surge have formula rows whose names and complete level curves agree with their current descriptions, but the general skill mapper currently leaves the skill sets unresolved. They need two explicit, reviewed prefix aliases.
- Flame Condensation is safe to index from its current player-facing description only. A plausible legacy formula prefix exists, but its late-level Heavy Attack values disagree with the current description, so it must not be used as extracted numeric truth yet.

This is enough for a useful Heavy Attack query without pretending that formula-name similarity proves an effect payload.

## Exact inputs

| Input | Role | Trust boundary |
|---|---|---|
| `web/data/projections/skills.json` | Current player skill-set IDs, names, type, weapon, per-level descriptions, specializations, and trait descriptions | Authoritative for player-facing naming and text, with provenance inherited from the web-data build |
| `D:\TL_Data\reports\24118850\skill-formula-map.json` | Build-scoped skill-set to formula-row edges, including `exact`, `derived`, and `unresolved` classification | Exact edges may be promoted automatically. Derived edges require semantic confirmation. Unresolved means no general mapper claim, not that no matching row exists. |
| `TLFormulaParameterNew` in `D:\TL_Data\warehouse\tl-24118850.sqlite` | Per-level values, formula type, dynamic-stat IDs, and tooltip values | Numeric truth only after an evidenced owner join and semantic classification |
| `TLAbnormalState_Common` and `TLAbnormalState_Weapon_Sword` in the same warehouse | Buff or debuff polarity, stack cap, content tags, and group metadata | Supporting mechanics evidence only. These rows do not contain the general numeric stat-modifier payload. |
| `web/tl-questlog-rules.js` | Existing executable Questlog-parity rules | It has no executable active-buff rule for these nine. Asceticism currently contributes only its always-on Mana Regen there, so the file must not be treated as complete dynamic-skill coverage. |
| `scripts/lib/stat-taxonomy.mjs` | Raw stat ID to canonical stat, display name, unit, and scope | Use `heavy_attack_chance`, preserving typed and positional scope |

All emitted records must retain `game_build`, projection or warehouse provenance, formula row ID where used, mapping class, and confidence. The join must reject mixed builds.

## Evidenced Heavy Attack mappings

The values below use player-facing tooltip units. Formula `min` values commonly store ten times the displayed Heavy Attack number, while `tooltip1` is already display-ready. The implementation should consume the row's tooltip value or an explicitly unit-tested conversion, not infer a global divisor from this sample.

| Skill | Stable skill-set ID | Evidenced value and condition | Formula evidence | Join decision |
|---|---|---|---|---|
| Shield Throw | `SkillSet_WP_SW_SH_S_ShieldThrow` | All three attack types, +30 at level 1 through +118 at level 21, for 2s after cast | Exact `SW_ShieldThrow_DoubleAttackADD`; exact `SW_ShieldThrow_AdjustStat_Duration`; `abn_SW_SH_ShieldThrow_AdjustStat` is a good PC buff | Emit one conditional all-type grant per skill level. High confidence. Do not substitute the separate derived `SW_ShieldThrow_DoubleAttackUP` dynamic row. |
| Shield Strike | `SkillSet_WP_SW_SH_S_DebuffAttack` | This ability's Melee Heavy Attack Chance increases by 20 per 1% Block Chance | Exact `SW_DebuffAttack_DoubleAttackUp`, formula type `kAmountFromShieldBlockChance`, `mul=20000`, `tooltip1=20`; `abn_SW_SH_S_DebuffAttack_DoubleAttackUp` is good, stack cap 1 | Emit an `ability_specific` formula source, not a build-wide grant. High confidence. Store the expression and input stat rather than a fabricated fixed value. |
| Gerad's Shield | `SkillSet_WP_SW_SH_S_DefenceSucceedBuff` | All-type +50 at level 1 through +130 at level 20, party members within 15m for 3s, triggered by defending the matching Fury or Wrath attack; 6s per-effect cooldown | Exact `SW_SH_S_DefenceSucceedBuff_DoubleAttackUp` and `..._Duration`; melee abnormal-state variant is a good buff, stack cap 1 | Emit a party conditional grant. High confidence. The trigger's attack-type branch is part of the condition and must not be flattened away. |
| Asceticism | `SkillSet_WP_ST_S_ManaRegenBuff` | All-type +100 while the stationary condition is active at levels 1 to 15, then +103 to +115 through level 20; stationary for 3s, persists 2s after moving | Exact `ST_Passive_01_ManaRegen_Double`; its level points agree with the current descriptions | Emit a self conditional passive grant. High confidence. Do not treat the always-on Mana Regen rule in `tl-questlog-rules.js` as evidence that the Heavy Attack portion is always on. |
| Unyielding Sentinel | `SkillSet_WP_SP_S_AbnormalTolerance` | All-type +48 per nearby target at level 1 through +99 at level 21, after a 3s delay, 8m radius, 3s duration, cap 5 | Derived `SP_AbnormalTolerance_DoubleUp_1` through `_5` are exact cumulative multiples; `..._DoubleUp_Duration` is 3s. Trait 1 has separate `..._DoubleUp_Party` and 6s duration rows. | Emit a per-target capped expression for the base skill. High confidence after description and five-row arithmetic agreement. Emit the trait as a separate replacement variant, not an additive sixth source. |
| Precision Dash | `SkillSet_WP_SW2_S_DashAttack` | All-type +90 at level 1 through +190 at level 21 for 3s on hit; trait 4 adds 1.5s | Derived naming rows `SW2_DashAttack_Double` and `..._Duration`; exact trait dynamic-stat duration row; values agree with every current description endpoint | Emit an on-hit conditional grant and a separate optional duration modifier. High confidence. The Heavy Attack grant rows are derived even though the skill set has other exact mapping edges. |
| Pulse of the Battlegrounds | `SkillSet_WP_SP_S_Passive_AuraBuff` | Melee +60 at level 1 through +140 at level 20 for self and party within 8m, 6s duration, triggered by applying listed control effects; 15s cooldown | Mapper says unresolved. Reviewed candidates `SP_AuraBuff_DoubleAttackUp`, `..._Duration`, and `..._CoolDown` match the complete curve and constants | Add explicit alias `SkillSet_WP_SP_S_Passive_AuraBuff -> SP_AuraBuff`, marked `reviewed_alias`. Emit a party conditional melee grant. Medium-high confidence until an extracted owner reference is found. Exclude the adjacent Heavy Attack Damage rows from the chance record. |
| Malice Surge | `SkillSet_WP_SP_S_Passive_AttackedBuff` | On taking damage, 5% proc; all-type +100 and rear +50 at level 1 through +232 and +116 at level 20; 6s | Mapper says unresolved. Reviewed candidates `SP_AttackedBuff_DoubleUp`, `..._DoubleUp_Rear`, `..._Duration`, and `..._Rate` reproduce every value and constant | Add explicit alias `SkillSet_WP_SP_S_Passive_AttackedBuff -> SP_AttackedBuff`, marked `reviewed_alias`. Emit two conditional records, one all-type and one rear positional. Medium-high confidence until an extracted owner reference is found. |
| Flame Condensation | `SkillSet_WP_ST_S_BurnTargetAddDamage` | Heavy Attack Chance +10 per Burning stack when using a skill on the user's Burning victim; current text holds +10 at every level | Mapper says unresolved. `WP_ST_S_BurnDamageUp_DD` matches the passive's Burning damage curve, but candidate `WP_ST_S_BurnDamageUp_Double` rises above 10 after level 15 and conflicts with current text | Emit description-derived conditional source with value 10 per stack and `questlog_description` provenance. Medium confidence. Record the candidate formula alias as unresolved evidence, never as the value owner. |

This yields ten source rows at a selected skill level because Malice Surge has two distinct scopes. Unyielding Sentinel's specialization is an optional replacement variant and may add an eleventh row only when that specialization is requested.

## Explicit exclusions

- Valiant Brawl, Judgment Lightning, Inferno Wave, Stunning Blow, and Infernal Meteor mention Heavy Attacks as triggers or outcomes. They do not grant Heavy Attack Chance.
- `double_damage_dealt_modifier` and the Pulse formula rows named `DoubleDamageDealtUp` are Heavy Attack Damage, not chance.
- `double_defense` is Heavy Attack Evasion.
- Shield Strike is ability-specific. It must not modify the character's general Heavy Attack Chance snapshot.
- Unyielding Sentinel rows `_2` through `_5` are cumulative target-count outcomes, not five simultaneous independent grants.
- Unyielding Sentinel's party specialization replaces the base behavior according to its description. It is not automatically additive.
- Shield Throw's `SW_ShieldThrow_DoubleAttackUP` is a dynamic-stat variant with a partial level range. The exact `DoubleAttackADD` row is the safe owner for the base skill.
- Formula rows found by substring alone, NPC skill rows, boss variants, and item-effect rows are excluded until a player skill-set owner edge exists.
- Abnormal-state polarity and row-name similarity do not prove numeric magnitude.

## Minimal record shape

The existing source index can represent these effects if dynamic skills add the following fields or equivalent structured JSON:

```text
source_type: active_skill | passive_skill | skill_trait
source_id, source_name, skill_level
canonical_stat, raw_stat_id, attack_scope, positional_scope
grant_mode: conditional | ability_specific
value | value_expression
condition_trigger, target_scope, radius_m
duration_s, cooldown_s, stack_basis, stack_cap
formula_row_id, formula_mapping_class
provenance, confidence, game_build
```

For formula expressions, store operands rather than prose only. Examples are `20 * shield_block_chance_percent`, `per_target_value * min(nearby_targets, 5)`, and `10 * burning_stacks`. Keep the original description beside the structured condition for auditability.

## Implementation slices

1. **Description-backed discovery.** Scan current skill and trait level descriptions for canonical player-facing stat labels. Use strict grant verbs and reject trigger-only phrases. This discovers candidates only.
2. **Mapped formula promotion.** Join candidates by skill-set ID into `skill-formula-map.json`. Promote exact rows automatically only when the row's semantic token and description agree. Promote derived rows from a reviewed allowlist.
3. **Reviewed alias layer.** Add the two exact build-independent naming aliases for `Passive_AuraBuff` and `Passive_AttackedBuff`, with unit tests asserting their full formula curves against projected descriptions. Keep the Flame Condensation alias unresolved.
4. **Condition parser for the nine cases.** Implement a small explicit parser or data fixture for trigger, duration, party radius, nearby-target cap, stack basis, positional scope, and ability-specific scope. Do not attempt a universal natural-language parser in this slice.
5. **Abnormal-state enrichment.** Where a decoded matching row exists, attach polarity, stack cap, and content tags. Missing Staff, Spear, and two-handed Sword abnormal families must leave enrichment null, not fail the source record.
6. **Query defaults.** Include these dynamic records only when `include_conditional=true`; include Shield Strike only when `include_ability_specific=true`. Return optional trait replacements separately.
7. **Validation fixture.** Assert all nine skill IDs, ten selected-level records, exact scopes, the two reviewed aliases, Flame's description-only provenance, and all exclusions above. Also assert that no Heavy Attack Damage or Evasion row enters the chance family.

## Next evidence target

The most valuable extraction work is locating the package or missing decoded family that owns stat-modifier payloads and ties them to abnormal-state rows. That would replace reviewed naming aliases and description-derived values with direct owner references. Until then, the two-tier join above is narrower but trustworthy.
