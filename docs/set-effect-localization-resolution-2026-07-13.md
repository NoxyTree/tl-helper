# Set-effect resolution from newly decoded tables and localization

- Date: 2026-07-13 (follow-up to [set-effect-database-review-2026-07-13.md](set-effect-database-review-2026-07-13.md))
- Game build: `24118850`, decoder `0.2.0`
- Purpose: resolve the items the database review parked as "requires a minimal
  in-game read" by exhausting the raw game data first. Three previously
  un-ingested tables and the shipped localization resolve most of them; what
  remains modeled is stated explicitly.

## New decoded sources (persisted, reproducible)

| Source | Location | Content |
| --- | --- | --- |
| `TLItemSetBonus` (151 rows) | `D:\TL_Data\decoded\24118850\tables\TLItemSetBonus.json` | Authoritative breakpoint table: `id` = projection set id, `set_count`, structured `extra_stat_N` + `extra_stat_seed_N`, `item_passive_id` |
| `TLItemPassive` (160 rows) | `…\TLItemPassive.json` | `item_passive_id` → up to three passive skill row ids |
| `TLAbnormalState_Item` (1,154 rows; 131 set-passive) | `…\TLAbnormalState_Item.json` | The previously-absent `abn_Item_Passive_Set_*` rows — behavior flags only (`StackCap`, `ModifyGroup`, …); **no stat payload** |
| `Game.locres` en + ko | `D:\TL_Data\raw\24118850\extracted\localization\TL\Content\Localization\Game\{en,ko}\Game.locres` | Client-shipped source strings with `$[FormulaRow.tooltip1]` bindings; parsed with [`scripts/internal/locres-extract.py`](../scripts/internal/locres-extract.py) |

Decode command (already run; outputs persisted):
`node scripts/decode-tljson-table.mjs <Table>/TLItemSetBonus.uasset <Table>/TLItemPassive.uasset <Table>/TLAbnormalState_Item.uasset --out D:/TL_Data/decoded/24118850/tables`

## Resolutions

### 1. Authoritative set→passive join — upgrades every fingerprint join to EXACT
`TLItemSetBonus.id` uses the projection set ids directly and `item_passive_id`
names the exact passive skill row. All 151 breakpoints joined; every
fingerprint-based mapping in the database review is confirmed, including the
transposed-stem cases (Dawn Mist `set_aa_T2_leather_003` → skills
`Item_Passive_Set_leather_aa_T2_003_*_Passive` whose formula rows live under
`Item_Passive_Set_aa_leather_T2_003_*`) and the shared-stem suffix split
(`plate_aa_T2_002_*_Passive` = Holy Ghost Fighter vs `plate_aa_T2_002_*_Talland`
= Skilled Veteran). The localization templates bind those formula rows directly
(e.g. `$[Item_Passive_Set_aa_plate_T2_002_2_DamageReduction.tooltip1]`), making
the earlier 40/70 numeric corrections airtight. **[EXACT]**

### 2. Threshold operators — RESOLVED, both `>=` (implementation already correct)
The Korean source strings are grammatically explicit where English "over" is not:

- Vanguard Leader 4-pc — `TEXT_SKILL_DESC_Item_Passive_Set_plate_aa_T2_003_2_Talland` (ko):
  「불굴이 50 **이상**일 때 주무기 기본 피해 … 증가」 — 이상 = "or more" → **`>= 50`**.
- Resistance Scale 2-pc — `TEXT_SKILL_DESC_Item_Passive_Set_leather_aa_003_1_Passive` (ko):
  「기량이 30 **이상**일 때 …」 → **`>= 30`**.

The current rules already use `>=`; no code change. The audit's two
REVIEW BOUNDARY rows are closed. **[EXACT — client source string]**

### 3. Resistance Scale 4-pc source gap — RESOLVED, Attack Speed
The English template omits the stat; the Korean string names it:
「불굴 10당 **공격 속도** …% 증가」 ("per 10 Fortitude, **Attack Speed** +…%").
The implementation's Attack Speed assumption is confirmed. **[EXACT]**

### 4. Party-aura self-stacking — RESOLVED as a two-component model
The client's own set descriptions
(`Item_Passive_Set_*_Talland_UIOptions_Index0_Option`) bind the **same decoded
tooltip twice**: once as a personal line and once as an explicitly
self-inclusive aura line (ko: 「18m 이내 **자신** 및 모든 파티원의 …」 — "self
and all party members within 18m"). The owner therefore receives both
applications. Per-application decoded values (`TLFormulaParameterNew`):

| Set | 2-pc | 4-pc | Owner totals |
| --- | --- | --- | --- |
| Oracle Priest (`fabric_aa_T2_002`) | Defense 200 | Healing Received 10% | 400 / 20% (Questlog ✓) |
| Forgotten Assassin (`leather_aa_T2_002`) | Evasion 110 | Critical Hit 110 | 220 / 220 (Questlog ✓) |
| Skilled Veteran (`plate_aa_T2_002`) | Endurance 120 | **DR 24** | 240 / **48 — Questlog's 12+12 halved the decoded 24; corrected** |
| Admiral (`leather_ab_T2_002`) | Debuff Duration −3% | Attack Speed 6% | **−6% / 12% — now applied doubled** |

Amounts are **[EXACT]**; the owner-double-dip itself remains **[MODELED]**
(assumption: the owner is always inside their own 18-m aura — the same model
Questlog's live client uses for the three older sets). The abnormal rows
(`TLAbnormalState_Item`, `StackCap: 1`) show each buff application cannot
self-stack, consistent with exactly two distinct applications (Selfbuff +
aura-applied abnormal).

### 5. Vanguard Leader 4-pc stat identity — mapping retained, documented
Both languages say "Main Weapon Base Damage / 주무기 기본 피해". No table
field binds the effect to a stat enum (the `Adjust_Stat` effect's stat id lives
in the undecoded skill blueprint, not a table). The current rule applies
`bonus_attack_power_main_hand +30`, which via `STAT_EXPANSIONS` also raises
`attack_power_main_hand` by 30 — i.e. both ends of the displayed Base Damage
range increase by 30, a faithful reading of the string. Retained as
**[DERIVED]**; a stat-panel read remains the only way to upgrade this to EXACT.

### 6. What data cannot resolve (and why)
- **Branch/threshold execution parameters** (`Caster_Conditional_Branch`
  internals) are not table rows — `TLEffectProperty` rows carry only 14 fields
  and only `TLEffectProperty` itself references the `_Check` rows. The
  operator resolution above comes from the source strings instead.
- **Owner aura double-dip at runtime** — see §4; modeled, matching Questlog's
  observed client behavior for three of the four sets.
- **Evasion set mutual exclusion** — Forgotten Assassin 2-pc and Lightning
  Strike 2-pc both state "Cannot be used in combination with other
  Evasion-increasing set effects" (also in ko). The static calculator currently
  has no cross-set exclusivity concept and would double-count if both sets were
  equipped; flagged as follow-up work, not fixed here.

## Rule changes in this pass

1. `set_aa_T2_plate_003:4` (Skilled Veteran): `12+12` → `24+24`
   (decoded per-application 24, bound twice by the client string).
2. `set_aa_T2_leather_005` (Admiral): both breakpoints now apply their decoded
   component twice (−3%×2, 6%×2), matching the sibling aura sets' treatment.
3. No change to the threshold rules — the Korean strings confirm the existing
   `>=` operators and the Attack Speed assumption.

## Evidence keys (all verifiable with the parser)

```text
Game.locres ko  TEXT_SKILL_DESC_Item_Passive_Set_plate_aa_T2_003_2_Talland   (>= 50)
Game.locres ko  TEXT_SKILL_DESC_Item_Passive_Set_leather_aa_003_1_Passive    (>= 30)
Game.locres ko  TEXT_SKILL_DESC_Item_Passive_Set_leather_aa_003_2_Passive    (Attack Speed)
Game.locres en+ko  Item_Passive_Set_plate_aa_T2_002_2_Talland_UIOptions_Index0_Option (DR 24 bound twice)
Game.locres en+ko  Item_Passive_Set_leather_ab_T2_002_2_Talland_UIOptions_Index0_Option (Admiral doubled)
TLItemSetBonus rows: id=set_aa_T2_plate_003 → Item_Passive_Set_plate_aa_T2_002_*_Talland
TLItemSetBonus rows: id=set_aa_T2_leather_005 → Item_Passive_Set_leather_ab_T2_002_*_Talland
```
