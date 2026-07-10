# Combat data audit — Milestone 0

Date: 2026-07-10 · Game build 1.431.22.7761 (Steam 24118850) · Decoder 0.1.0 · Warehouse: `D:\TL_Data\warehouse\tl-24118850.sqlite`

Companion files: [combat-table-inventory.csv](combat-table-inventory.csv) · [unknown-formulas.md](unknown-formulas.md) · [initial-validation-cases.md](initial-validation-cases.md)

Provenance rule used throughout: every claim cites (table, row ID, build 24118850, decoder 0.1.0). Decoded tables are **evidence of client-visible data**, not automatically complete combat formulas; the resolution *order* and server behavior remain separate questions (see unknown-formulas.md). Confidence labels follow 04-data-and-calibration.md: `verified_exact` / `derived_high_confidence` / `modeled` / `unsupported`.

## 1. Headline finding: the client-side skill formula system is readable

`TLFormulaParameterNew` (10,656 rows, decoded clean) is the game's skill-magnitude system. One row per effect (`<Kit>_<Skill>_<Effect>` e.g. `BO_PowerShot_Charge_DD`), holding a `FormulaParameter` array with **one entry per skill level** (1–21 for player actives; up to 256 for scaling systems):

```json
{"skill_level":1, "formula_type":"EFormulaType::kAmountFromMinMax",
 "min":10000, "max":16000, "add":53, "mul":50000, "mul2":0, "mul3":0,
 "dynamic_stat_id1":"WP_Item_Gear_BO_02_1_PC", …,
 "tooltip1":500, "tooltip2":53}
```

- **26 `formula_type` variants** enumerate the client-visible magnitude models. Distribution: `kAmountFromMinMax` 16,064 · `kAmountFromAttackPower` 10,142 · `kAmountFromCostChange` 2,543 · `kAmountFromAttackPowerWithinMinMax` 738 · `kAmountFromTargetHpMax` 250 · `kAmountFromHpMax` 248 · `kAmountFromDistance` 127 · `kAmountFromNormalAttackDelay` 83 · plus cost/regen/attack-range/shield-block/off-hand/wind/falling forms.
- **Coefficients are per level**: PowerShot `mul` 50000→83000 and `add` 53→583 across levels 1–21; `tooltip1 = mul/100` (displayed "500% of Base Damage"), `tooltip2 = add`. Units: the evidence is consistent with **basis 10000 = 100%** (`derived_high_confidence`, needs one calibration check).
- **Conditionals are separate rows**: boss modifiers (`BO_PowerShot_Charge_DD_Boss_Tooltip`, 180%), PvE splits (`SW2_GaiaCrash_DD_PVE`), per-stack party scaling (`WA_PartyCurseBurst_DD_to_{No,One,Two,Three}Stack`), trait variants (`SW2_GaiaCrash_Trait_1_DD`), NPC-vs-PC variants (`…_NPC`).
- **`dynamic_stat_id1..6`** name runtime stat sources (e.g. `HealEffect`, `WM_SW_Rare_ATK_Buff`) that modulate the formula — the hook points for buffs/masteries into skill magnitudes.

### Tooltip placeholder resolver (validated)

Skill descriptions embed `$[Base.field]` expressions. Measured against `en.csv` (160k entries): **7,910 placeholder instances, 3,777 distinct bases, 3,602 (95.4%) resolve directly to `TLFormulaParameterNew` row IDs.** Fields used: `tooltip1` (3,690 bases), `tooltip2` (361), plus raw `min/max/mul` in arithmetic expressions (`$[X.tooltip1*X.max/X.min,1,%D]` — the tooltip language supports inline math and formatting). The 175 unresolved bases are NPC/class-kit prefixes (`KN_`, `MO_`, `SC_`, `AS_`) — candidate location: NPC skill/abnormal tables, not yet decoded. Unresolved mappings are recorded, not guessed.

## 2. Where each combat domain lives

| Domain | Primary tables (all decoded unless noted) | State |
| --- | --- | --- |
| Damage magnitudes | `TLFormulaParameterNew` (DD rows), `TLSkill` (damage_type, attack_side, delays, ranges, projectile) | client-visible |
| Skill behavior/timing | `TLSkill` 15,934 rows: `skill_delay`, `hit_delay`, charge fields, target relations, `Chain_Skill` | client-visible |
| Cooldown & resource | `TLSkillOptionalDataForPc` 3,697 rows: `cost_consumption`/`hp_consumption`/`cooldown_time` **as formula-row references**, `cooldown_group`, cancel rules, `can_be_affected_by_skill_cooldown_modifier` | client-visible |
| Healing | `TLFormulaParameterNew` heal rows (`WA_Heal_Heal`: 165% AP + 200, dynamic `HealEffect`) | client-visible |
| Shielding | `SW2_ShieldBuff_Absorption_*` rows (capacity, change-rate, HoT, duration) + `TLAbnormalState_*` carriers | client-visible |
| Buffs/debuffs/CC | `TLAbnormalState_Common` 3,297 + `_Weapon_*` (2 of 11 decoded; rest are raw-preserved, same schema): 53 fields — `StackCap`, `GoodOrBad`, `ModifyGroup`/`PriorityInGroup` (exclusivity), Disable*/Prevent* flags (CC mechanics), `ContentsGroupId` handle | client-visible |
| Hit/crit/heavy/evasion/endurance | stat *totals* in `TLStats` (292 stat registry), `TLItemStats`, item level tables; **contest curves not client-visible** — see unknown-formulas.md | gap |
| Mitigation (armor→%) | raw stats exist (`melee_armor`, `damage_reduction`…); **conversion curve not found in decoded tables** | gap |
| PvP/PvE modifiers | per-skill variant rows (`_PVE`, `_Boss_Tooltip`) and PvP-named stats; global PvP scalar not located | partial |
| Party effects | party-scoped formula rows (`WA_PartyCurseBurst_*`), `TLGuildSkillInfo` (14), abnormal scopes | client-visible |
| Base/derived stats | `TLPCInitialStat` (10s), `TLPCLevelStat` (levels 1–100: hp/cost/attack_rating), `TLBaseMainStat` 650, `TLStats`, `TLPcDynamicStat` 496, `TLContentStatLimit` 59 (content stat caps!), `TLBasicStatBonusPreview` 40 | client-visible |
| Item stat scaling | `TLItemMainLevelStat` 4,500, `TLItemExtraLevelStat` 700, `TLItemMainStatInit` 21,029, `TLStatsItemBaseValue` 54, `TLStatsItemEnchantValue` 9, `TLItemMaterialStat` 40, `TLItemAttackSpeedBaseline` 9 | client-visible |
| Masteries | `TLWeaponSpecializationStat` 3,602 | client-visible |
| Weapon interactions | `TLSkill.attack_side` (main/off-hand), `kAmountFromOffHandAttackChance` formula type, `TLWeaponCategorySkillSet` | client-visible |

Full per-table status: [combat-table-inventory.csv](combat-table-inventory.csv).

## 3. Static build totals vs live combat state

The existing web calculator (`web/tl-core.js` + `web/tl-questlog-rules.js`) computes **static build totals only** — verified by full read (subagent formula inventory, 2026-07-10). Its formulas are transcribed verbatim from Questlog's client bundle (attribute diminishing curve `n≤20: n; ≤40: half; >40: quarter`, breakpoint tables, 6-phase application order, reciprocal attack-speed curve, floor-based Stellarite AP math) **except** combat power, which is an explicitly fitted heuristic (`COMBAT_POWER` tables + two hardcoded item allowlists) — replaceable now by decoded `TLItemCombatPower` (132 rows).

Nothing in the web code computes live combat: no damage resolution, mitigation, contest probabilities, cooldown seconds, buff timelines, healing output. That entire layer is new engine territory, fed by the tables above. The boundary for Milestone 1: `calculateBuild()`'s stat totals become the `BuildSnapshot`; skill magnitude/timing/cost data comes from decoded tables; contest/mitigation curves enter as `modeled`/`calibration-required` until validated.

Cross-checks already possible (static side): `TLPCLevelStat` rows agree in kind with the web's `BASE_LEVEL_STATS` (hp/cost/attack_rating trio); the attribute tables the web reads from Questlog's bundle now have a local authoritative source (`TLBaseMainStat`/`TLStats`) for diffing after patches.

## 4. Reference resolution status

- **TLDataHandle**: decodes to `{RowName}`; target table implied by field schema. Mapped where evidence permits: `TLSkillOptionalDataForPc.cost_consumption/cooldown_time → TLFormulaParameterNew` (values like `Common_Constant_0` are formula rows — verified present); `TLAbnormalState_*.ContentsGroupId → TLAbnormalContentsGroup` (raw-preserved, not yet decoded); `TLRuneInfo.*RandomStatGroup → TLItemRandomStatGroup`. Unresolved handle fields are listed per table in the inventory CSV (`refTargets=unresolved`).
- **ObjectProperty (package-local import indices)**: blocks interpretation in exactly these combat-relevant spots: `TLItemLooks*.HiveEntity/OffHandHiveEntity` (cosmetic — harmless), `RowStruct` headers (harmless), and **`TLSkill` links to skill *looks/FX* packages** (harmless for math). No damage-math field was found blocked by an ObjectProperty. Import-map parsing remains a decoder 0.2 item.
- **Skill → formula-row linkage**: the deterministic key is the description placeholder plus naming convention (`WP_BO_S_PowerShot` ↔ `BO_PowerShot_*`). The prefix transform (`WP_BO_S_X → BO_X`) held for every case examined but is `derived_high_confidence`, not verified across all 210 skill sets — the Milestone 1 adapter should materialize this mapping table and flag misses.

## 5. Confidence summary

| Claim | Label |
| --- | --- |
| Formula rows, coefficients, per-level scaling, tooltip linkage | verified_exact (decoded + tooltip cross-check) |
| 10000 = 100% basis; tooltip1 = mul/100 | derived_high_confidence (needs 1 calibration point) |
| Cost/cooldown resolution via formula rows | verified_exact (rows present) |
| Damage pipeline order, contest curves, mitigation conversion | currently unknown / calibration-required (see register) |
| PvP global modifiers | currently unknown; per-skill PvE/boss variants verified_exact |
| Combat power | fitted heuristic in web code; real table decoded, not yet integrated |
