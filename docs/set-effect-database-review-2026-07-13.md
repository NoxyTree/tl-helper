# Set-effect decoded-database review

- Review date: 2026-07-13
- Game build: `24118850` (game version `1.431.22.7761`, decoder `0.2.0`)
- Warehouse: `D:\TL_Data\warehouse\tl-24118850.sqlite` (built `2026-07-11T04:57:32Z`)
- Reviewer scope: independent decoded-record audit of every set-effect activation
  breakpoint, then reconciliation against
  [`docs/set-effect-audit-2026-07-13.md`](set-effect-audit-2026-07-13.md).
- Constraint honored: **no production code, projections, or the existing audit
  were modified.** All new artifacts are this document plus throwaway analysis
  scripts kept outside the repo.

Evidence in this document is tagged with one of five confidence categories, kept
deliberately separate as required:

- **[EXACT]** Exact game-data evidence — a decoded `TLFormulaParameterNew` /
  `TLEffectProperty` / `TLSkill` record directly establishes the value or shape.
- **[DERIVED]** Derived interpretation — a conclusion inferred from a consistent
  decoded fingerprint plus display convention, not a single decisive field.
- **[QL-IMPL]** Questlog-compatible implementation — what `SET_PASSIVE_RULES`
  currently computes, mirrored from the public builder.
- **[MODELED]** Modeled conditional behavior — trigger/duration/stack/aura logic
  that is real but not fully decoded in this warehouse.
- **[UNSUPPORTED]** Unsupported or unverifiable from the current warehouse.

---

## 1. Executive conclusion

The existing audit is **methodologically sound and its five headline conflicts
are all real**, but it was generated purely from the Questlog projection and the
implementation rules — it never queried the decoded warehouse (confirmed by
reading [`scripts/audit-set-effects.mjs`](../scripts/audit-set-effects.mjs),
which imports only `equipment.json`, `tl-questlog-rules.js`, and `tl-core.js`).
This review supplies the missing decoded-record layer and reaches stronger
conclusions on the items the audit left as "HIGH RISK — undetermined side":

- **Five implementation errors are now confirmed against decoded
  `TLFormulaParameterNew` magnitudes** (Vanguard Leader 2-pc, Dawn Mist 4-pc,
  Holy Ghost Fighter 4-pc, Battlefield Champion 4-pc, Plains Ravager 4-pc). In
  every case the decoded value matches the **description**, and the current rule
  is wrong. The audit correctly flagged all five but could not pick a side for
  four of them; the warehouse resolves them.
- **The single most important structural fact:** every set passive's
  abnormal-state record is **absent** from the warehouse. `0` rows match
  `abn_Item_Passive_Set%`, yet `130` distinct set effect-properties reference
  such an abnormal. Consequently the warehouse **proves magnitudes** (tooltip,
  raw min/max, multiplier) but **cannot prove**, for any set: the exact stat id,
  the threshold operator (`>` vs `>=`), the pre-/post-effect basis, or whether
  personal and party-aura components stack on the owner. Those must stay
  DERIVED/MODELED until an in-game check.
- **Two new exact findings** the audit missed: the Admiral set and the Demonic
  Beast Hunter 4-pc each contain a **persistent, exactly-calculable** component
  the audit filed under "unmapped/combat-modeling."
- **One new implementation-consistency defect:** the Skilled Veteran party rule
  is internally inconsistent (it doubles Endurance but not Damage Reduction);
  at least one of its two breakpoints must be wrong regardless of the true
  stacking rule.
- The **optimizer pruning defect is real** (candidate stats are built with
  `includeSetEffects: false`), but the audit slightly overstates it: candidate
  retention and set-signature bucketing mitigate it, so the failure is
  **beam-width-dependent**, not unconditional.

Headline counts: **~100 confirmed magnitude matches** (of 111 passive
breakpoints; the other 40 breakpoints are structured `bonus_stat` rows),
**5 confirmed implementation errors**, **~11 effects unresolved by the warehouse**
(2 strict-threshold boundaries + 4 party-aura stacking pairs + the genuinely
combat-only remainder), and **4 material new findings**.

---

## 2. Database schema and querying method

The warehouse is a single normalized table, not one table per game table.

```sql
CREATE TABLE records (
  record_id TEXT PRIMARY KEY, row_id TEXT, record_type TEXT,
  table_name TEXT, table_family TEXT,
  raw_json TEXT, name_loc TEXT, loc_key TEXT, ...
);
CREATE TABLE refs (from_record_id TEXT, field TEXT, to_row_id TEXT);
```

Set effects are decomposed across three families, all keyed by an
`Item_Passive_Set_<stem>_<count>_<suffix>` naming scheme:

| Family | Role | Present? |
| --- | --- | --- |
| `TLSkill` | The passive skill container (mechanics; **no magnitudes**) | Yes — 152 `Item_Passive_Set%` rows |
| `TLFormulaParameterNew` | **Magnitudes**: `tooltip1` (display), `min/max` (raw), `mul` (scaling) | Yes — 258 rows |
| `TLEffectProperty` | Effect **shape**: `Group` (persistent/aura/conditional/proc) + `Abnormal` ref | Yes — 266 rows |
| `TLAbnormalState` (`abn_Item_Passive_Set*`) | Stat id, stacking, duration, threshold operator, pre/post basis | **No — 0 rows** |

There is no `sqlite3` CLI on this machine; all queries were run through Python's
built-in `sqlite3` (v3.50.4). The count marker convention is `_1_ = 2-piece`,
`_2_ = 4-piece` (artifact 6-piece effects use their own `artifact_*` stems).

**Key querying facts established independently:**

1. The magnitude fingerprint. For a constant effect, `min == max == raw` and
   `tooltip1 == raw × display_modifier`. Example: Nine Lives 2-pc
   `Item_Passive_Set_Plate_aa_T4_003_1_CriticalDamageTakenModifier` has
   `min=max=1000, tooltip1=10` → raw 1000, display 10 (`×0.1`). **[EXACT]**
2. The per-10-attribute fingerprint. Attribute-scaled effects share
   `formula_type=kAmountFromMinMax, min=0, max=<attribute cap>, mul = raw_per_10 × 1000`,
   with `max=99` on T2/T3 sets and `max=130` on T4 sets (matching the Update
   4.0.0 attribute-cap raise recorded in `STAT_HARD_CAPS`). Verified across
   Vanguard (`mul=450000, t1=45`), Forgotten Monarch (`mul=300000, t1=30`),
   Resistance Scale 4-pc (`mul=200000, t1=2`), and every T4 PvP set
   (`mul=300000, t1=30, max=130`). **[DERIVED]**
3. The set→item link is **not** stored on the item. `TLItemEquip.item_passive_id`
   is `"None"` for set pieces (checked `chest_plate_aa_t2_set_003`); set
   membership is carried only by the projection and the naming convention. The
   projection **set id does not equal the DB stem** (e.g. projection
   `set_aa_T2_fabric_003` "Oracle Priest" → DB stem `fabric_aa_T2_002`), and
   some sets are stored under a transposed stem (`aa_<mat>_T2_x` vs
   `<mat>_aa_T2_x`). Joins in this review were done by **tooltip-value
   fingerprint**, not by id.

---

## 3. Coverage reconciliation — were all 151 breakpoints reviewed?

Yes. The projection yields exactly **151 breakpoints across 78 sets**
(reproduced `node scripts/audit-set-effects.mjs` → byte-identical to the
committed audit). They partition as:

| Group | Count | How it was reviewed against the warehouse |
| --- | ---: | --- |
| Structured static (`bonus_stat`, no passive) | 40 | Value is a direct item-stat row, not a set passive; no `Item_Passive_Set` skill exists or is needed. |
| Passive breakpoints matched to a decoded magnitude | ~100 | Located the `TLFormulaParameterNew` row and confirmed `tooltip1`/`raw` against the rule. |
| Passive breakpoints whose magnitude is a %/conditional not stored as a flat tooltip | 11 | 8 artifact 6-pc percent-of-Health/Defense scalers + 3 Nudge conditional 3-pc; magnitude is DERIVED/MODELED, see §8. |
| **Total** | **151** | |

The DB carries **152** `Item_Passive_Set%` `TLSkill` rows vs 111 passive
breakpoints; the surplus is shared child/helper skills (`AuraFocusing`,
`ColliderStun`, `Cure`, `Frostbite`, `Nudge_00x` cores, `acc_t2_upgrade_*`
multi-part effects) reused across sets. Every breakpoint the task explicitly
named — Vanguard 2/4-pc, Nine Lives 4-pc, Battlefield Champion / Plains Ravager
4-pc, Dawn Mist 4-pc, Holy Ghost Fighter 4-pc, Resistance Scale 2/4-pc, Oracle
Priest / Forgotten Assassin / Skilled Veteran / Admiral, and all 13 "unmapped"
rows — was located and inspected at the record level (§4, §5, §7, §8).

---

## 4. Confirmed matches (implementation agrees with decoded data)

Representative, high-value confirmations (`t1` = decoded `tooltip1`):

| Set (DB stem) | Piece | Decoded evidence | Rule output | Verdict |
| --- | --- | --- | --- | --- |
| Nine Lives (`Plate_aa_T4_003`) | 2-pc | `_1` t1 = 100 crit-atk, 10 crit-dmg-taken, 12 heavy-taken | `all_critical_attack 100; critical_damage_taken 10; double_damage_taken 12` | **[EXACT] match** |
| Nine Lives (`Plate_aa_T4_003`) | 4-pc persistent | `_2_CriticalDamageDealtModifier` t1 = 20 | `critical_damage_dealt_modifier 20` | **[EXACT] match** (persistent part) |
| Vanguard Leader (`plate_aa_T2_003`) | 4-pc amount | `_2_Talland_4Set` min=max=30, t1 = 30 | `bonus_attack_power 30` when threshold met | **[EXACT] amount match** (stat/threshold unresolved, §8) |
| Resistance Scale (`leather_aa_003`) | 2-pc | `_1_2Set` min=max=800, t1 = 8 | `skill_cooldown_modifier 8%` | **[EXACT] match** (operator unresolved, §8) |
| Chaos Harbinger (`artifact_a_002`) | 4-pc | `_1_Passive` min=max=900, t1 = 9 | `critical_damage_dealt_modifier 9%` (raw 900) | **[EXACT] match** — the correctly-mapped artifact analogue that proves b/c are wrong |
| Forgotten Monarch (`plate_aa_T3_002`) | 2-pc | `_1` min=0,max=99,mul=300000,t1=30 | `floor(str/10)*30 all_double_attack` | **[EXACT+DERIVED] match** (whole-10 step) |
| Skilled Veteran (`plate_aa_T2_002`) | 4-pc total | `_2` t1 = 24 damage-reduction | `damage_reduction 12 + 12 = 24` | **[EXACT] total match** (see §7 inconsistency) |

The whole family of attribute-scaled sets other than Vanguard 2-pc already use
`Math.floor(attr/10)*x` in `SET_PASSIVE_RULES` and match the decoded
`mul = raw_per_10 × 1000` fingerprint — these are correct. **[DERIVED]**

---

## 5. Confirmed implementation errors (decoded data contradicts the rule)

All five are backed by a decoded `TLFormulaParameterNew` magnitude, not tooltip
wording.

### 5.1 Vanguard Leader 2-pc — continuous instead of whole-10 step **[CONFIRMED]**
- Decoded: `Item_Passive_Set_plate_aa_T2_003_1_Talland_2Set` —
  `formula_type=kAmountFromMinMax, min=0, max=99, mul=450000, tooltip1=45`. The
  `mul = 45/0.1 × 1000 = 450000` fingerprint encodes 45 display Endurance per
  **10** Perception. **[EXACT] magnitude; [DERIVED] whole-10 step.**
- Rule ([`tl-questlog-rules.js:51`](../web/tl-questlog-rules.js#L51),
  `set_aa_T2_plate_005:2`): `all_critical_defense = per * 4.5` — continuous.
- At 41 Perception: rule → `41 × 4.5 = 184.5` display (raw 1845); correct →
  `floor(41/10) × 45 = 180` display (raw 1800). Confirmed wrong; grants partial
  progress between 10-point steps.

### 5.2 Dawn Mist 4-pc — Bonus Damage 35 should be 70 **[CONFIRMED]**
- Decoded: `Item_Passive_Set_aa_leather_T2_003_2` — `min=max=70, tooltip1=70`.
  (Note the transposed stem `aa_leather_…`, distinct from the effect-property
  stem `leather_aa_T2_003` which only carries `abn_PC_Nothing` placeholders.)
- Rule (`set_aa_T2_leather_003:4`): `damage_reduction_penetration = 35`.
- Decoded 70 matches the description; **35 is wrong.** [EXACT]

### 5.3 Holy Ghost Fighter 4-pc — Damage Reduction 20 should be 40 **[CONFIRMED]**
- Decoded: `Item_Passive_Set_aa_plate_T2_002_2_DamageReduction` — `min=max=40,
  tooltip1=40`; companion `…_2_AlllCriticalDefense` — `min=max=1500,
  tooltip1=150` (Endurance 150, which the rule gets right).
- Rule (`set_aa_T2_plate_002:4`): `damage_reduction = 20` + `all_critical_defense
  = 150`.
- Decoded 40 matches the description; **the 20 is wrong** (Endurance 150 is
  correct). [EXACT]

### 5.4 & 5.5 Battlefield Champion / Plains Ravager 4-pc — wrong stat **[CONFIRMED]**
- Decoded: `Item_Passive_Set_artifact_c_001_1_Passive` — **`min=max=400`,
  tooltip1=4**; `Item_Passive_Set_artifact_b_001_1_Passive` — **`min=max=600`,
  tooltip1=6**.
- The decisive point is the **raw value**: a "+4"/"+6" effect stored as raw
  **400/600** can only be a `×0.01` display stat, i.e.
  `critical_damage_dealt_modifier` (+4% / +6% Critical Damage). If it were
  `bonus_attack_power_main_hand` (`×1`), the raw would be 4/6. The correctly
  mapped sibling `artifact_a_002` (raw 900 → Crit Damage 9%) proves the scale.
- Rules (`set_c_artifact_set_001:4`, `set_b_artifact_set_001:4`):
  `bonus_attack_power_main_hand = 4` / `6`.
- **The description (Critical Damage) is right; the implementation applies the
  wrong stat *and* the wrong scale.** [EXACT]

---

## 6. Disagreements with the existing audit

1. **The four "HIGH RISK — which side is wrong?" rows are resolvable.** The audit
   (`STATUS_OVERRIDES`, [`audit-set-effects.mjs:69-72`](../scripts/audit-set-effects.mjs#L69))
   correctly flags Dawn Mist, Holy Ghost Fighter, Battlefield Champion, and
   Plains Ravager but leaves the resolution open. Decoded `TLFormulaParameterNew`
   magnitudes resolve all four **in favor of the description** (§5.2–5.5).
2. **Two "unmapped/combat" rows contain exact persistent components.** Admiral
   (`set_aa_T2_leather_005`) and Demonic Beast Hunter 4-pc (`set_aa_t3_lether_001:4`)
   are classified by the audit as unmapped or combat-only; the warehouse shows
   decoded, persistent, sheet-applicable magnitudes for their base components
   (§7). The audit's `UNMAPPED_CLASSIFICATION` is over-conservative here.
3. **The optimizer claim is directionally right but overstated.** The audit says
   completed sets "can therefore be removed before exact finalist calculation."
   True in principle, but candidate generation *always* retains set-bearing items
   ([`tl-full-build-adapter.js:535`](../web/tl-full-build-adapter.js#L535)) and
   the beam is bucketed by set-count signature
   ([`tl-full-build-optimizer.js:46`](../web/tl-full-build-optimizer.js#L46)).
   The real failure is the final `beamWidth` heuristic cut ranking partial-set
   states on set-free stats — a **beam-width-dependent** loss, not an
   unconditional one (§10).
4. **Skilled Veteran is not merely a "review stacking" note — it is internally
   inconsistent.** See §7.3.

No disagreement on the core framing: the audit's provenance rules (its
"Provenance and confidence rules" section) already state the warehouse lacks
complete effect→abnormal linkage. This review confirms and quantifies that gap.

---

## 7. New findings not present in the audit

### 7.1 Admiral self-components are exactly calculable — DB stem `leather_ab_T2_002` **[EXACT]**
- `Item_Passive_Set_leather_ab_T2_002_1_Talland` — `min=max=-300, tooltip1=-3`
  → Debuff Duration **−3%** (`debuff_taken_duration_modifier`).
- `Item_Passive_Set_leather_ab_T2_002_2_Talland` — `min=max=600, tooltip1=6`
  → Attack Speed **+6%** (`attack_speed_modifier`).
- Both are persistent sheet stats; the audit filed both as "Persistent self and
  party component; missing static mapping." The **self** value can be applied
  exactly today; only the party-aura duplication is open (§7.3).

### 7.2 Demonic Beast Hunter 4-pc has an exact persistent base — `leather_aa_T3_001` **[EXACT]**
- `_2_DamageReductionPenetration` `min=max=40, tooltip1=40` → persistent Bonus
  Damage **+40**. Separately `_2_DamageReductionPenetration2` t1=14, `_2_Rate`
  t1=15 (15%), `_2_Duration` t1=3 (3 s) describe the on-hit proc.
- The audit marks the whole 4-pc "Mixed persistent Bonus Damage and conditional
  proc" and applies nothing. The **+40 persistent** part is sheet-applicable now;
  only the proc is [MODELED].

### 7.3 Party-aura rule is internally inconsistent — Skilled Veteran **[EXACT vs QL-IMPL]**
- Decoded single values (`plate_aa_T2_002`): `_1` t1 = **120** Endurance,
  `_2` t1 = **24** Damage Reduction.
- Rule (`set_aa_T2_plate_003`, intentionally doubled per its code comment):
  2-pc = `120 + 120 = 240` Endurance; 4-pc = `12 + 12 = 24` DR.
- The rule **doubles Endurance (→240) but not DR (→24)**. Whatever the true
  self+aura stacking rule is, it cannot make both correct: if the owner receives
  each component once, Endurance should be 120 (rule over-counts); if the owner
  receives self+aura, DR should be 48 (rule under-counts). The decoded tooltip
  is a single per-application value in both cases. Same structure — a `Selfbuff`
  (`Adjust_Stat`) + `Aura` + `Conditional_Branch` gate — recurs for Oracle
  Priest (`fabric_aa_T2_002`), Forgotten Assassin (`leather_aa_T2_002`), and
  Admiral (`leather_ab_T2_002`). **The doubling is a Questlog-parity [MODELED]
  assumption, not decoded fact.**

### 7.4 Nine Lives 4-pc: the two Critical-Damage components are genuinely separate **[EXACT]**
The task asked to confirm this specifically. Decoded `Plate_aa_T4_003` 4-pc has
**two** distinct `critical_damage_dealt_modifier` records:
`_2_CriticalDamageDealtModifier` (t1=20) and `_2_CriticalDamageDealtModifier2`
(t1=20), the second gated by `_2_Cooldown` (`Do_Nothing_Duration`, t1=15 → 15 s),
`_2_Rate` (t1=100 → 100%), `_2_Duration` (t1=6 → 6 s), and a
`Caster_Conditional_Branch` + `Passive_On`. So: a **persistent +20% Critical
Damage** plus a **separate on-hit +20% Critical Damage (100% rate, 6 s, 15 s
internal cooldown)**. The implementation includes only the persistent +20% —
correct for a sheet total. This **confirms the audit's Nine Lives treatment** and
adds the decoded proc parameters.

### 7.5 Every set-passive abnormal state is absent — the master caveat **[EXACT about the gap]**
`SELECT COUNT(*) … row_id LIKE 'abn_Item_Passive_Set%'` → **0**, while 130
distinct set effect-properties reference such an abnormal (e.g.
`plate_aa_T2_003_1_AdjustStat.Abnormal = abn_Item_Passive_Set_plate_aa_T2_003_1_Talland`,
which does not exist). Stat identity, stacking, duration, threshold operator, and
pre/post basis therefore live in undecoded records. This is why §8 exists.

### 7.6 Dual/transposed stem naming **[EXACT]**
Some sets store their live magnitudes under `aa_<mat>_T2_x` while their
effect-property shells sit under `<mat>_aa_T2_x` with `abn_PC_Nothing`
placeholders (Dawn Mist, Holy Ghost Fighter). A naive id join silently reads the
placeholder and misses the real value — a concrete trap for any future
automated extractor.

---

## 8. Effects that remain unverifiable from this warehouse (and exactly why)

| Effect | What is EXACT | What is UNSUPPORTED here | Minimal in-game test |
| --- | --- | --- | --- |
| Vanguard 4-pc threshold | Amount 30 (`_2_Talland_4Set`) | Operator `>` vs `>=` and the value 50 live in the `Caster_Conditional_Branch`/abnormal — no threshold `TLFormulaParameterNew` row exists | Set Fortitude to exactly 50, read Main-Weapon panel |
| Resistance Scale 2-pc threshold | Amount 8% (`_1_2Set`) | `>` vs `>=` 30 (same reason) | Set Dexterity to exactly 30, read Cooldown |
| Vanguard 4-pc stat | Amount 30 | "Base Damage" (`attack_power`) vs rule's "Bonus Attack Power" (`bonus_attack_power`) — abnormal absent | Read both Main-Weapon fields with/without 4-pc |
| Party-aura self-stacking (Oracle, Forgotten Assassin, Skilled Veteran, Admiral) | Per-application values (200/10, 110/110, 120/24, −3/6) | Whether owner gets Selfbuff **and** Aura (double) — `Conditional_Branch` logic undecoded | Equip set solo, read stat deltas vs one application |
| All attribute sets: floor vs truncation vs continuous | `mul = raw_per_10 × 1000`, `min=0,max=cap`; "per 10" localization | The exact engine divisor/rounding op is not a warehouse field (DERIVED as whole-10 floor) | Compare panel at 39 vs 40 of the attribute |
| Artifact 6-pc %-scalers (a_006/007, b_003/004, c_002, HP%/Def%) | Effect exists; scaling stems present | The 7%/4%/2% factor and pre-effect basis are in the abnormal, not a flat tooltip | Read panel before/after equipping 6-pc |
| Pre- vs post-effect basis (all HP%/Def% and threshold sets) | — | Execution order/phase is not encoded per set; rule `phase` is a QL-IMPL choice | Ordered stat-panel reads |
| Genuinely combat-only (Imperator mobility, Sacred Vanquisher/Elder/Reborn Lord 2 DoT, Lightning Strike 4-pc, Nudge 3-pc ×3) | Proc magnitudes where present | No persistent sheet component exists at all | Combat log |

The threshold-operator and party-stacking questions are **the same class of
gap**: the deciding logic is in the missing abnormal/branch records, so both the
audit's "REVIEW BOUNDARY/STACKING" and this review must stop at "amount proven,
rule undecided."

---

## 9. Recommended formula corrections (with pseudocode)

Ordered by confidence. Do **not** apply §9.5–9.6 without an in-game check.

```text
# 9.1 Vanguard Leader 2-pc  (set_aa_T2_plate_005:2)  — CONFIRMED
# was: all_critical_defense = per.total * 4.5
endurance_display = floor(per.total / 10) * 45          # raw = *10 (0.1 modifier)
apply all_critical_defense = z("all_critical_defense", endurance_display)

# 9.2 Dawn Mist 4-pc  (set_aa_T2_leather_003:4)  — CONFIRMED
# was: damage_reduction_penetration = z(..., 35)
damage_reduction_penetration = z("damage_reduction_penetration", 70)

# 9.3 Holy Ghost Fighter 4-pc  (set_aa_T2_plate_002:4)  — CONFIRMED
# was: damage_reduction = z(..., 20)   (all_critical_defense 150 stays)
damage_reduction = z("damage_reduction", 40)

# 9.4 Battlefield Champion 4-pc (set_c_artifact_set_001:4)
#     Plains Ravager 4-pc      (set_b_artifact_set_001:4)  — CONFIRMED
# was: bonus_attack_power_main_hand = z(..., 4) / z(..., 6)   (wrong stat & scale)
critical_damage_dealt_modifier = z("critical_damage_dealt_modifier", 4)   # champion
critical_damage_dealt_modifier = z("critical_damage_dealt_modifier", 6)   # ravager

# 9.5 Admiral self-components  (set_aa_T2_leather_005) — NEW, decoded amounts
2pc: debuff_taken_duration_modifier = z("debuff_taken_duration_modifier", -3)
4pc: attack_speed_modifier         = z("attack_speed_modifier", 6)
# party-aura duplication: leave OFF until §9.7 test

# 9.6 Demonic Beast Hunter 4-pc persistent base (set_aa_t3_lether_001:4) — NEW
damage_reduction_penetration = z("damage_reduction_penetration", 40)   # proc stays excluded

# 9.7 Party-aura self-stacking (Oracle, Forgotten Assassin, Skilled Veteran, Admiral)
# Pick ONE model from an in-game read, then make it CONSISTENT across all four
# and both breakpoints. Decoded per-application values:
#   Oracle 2/4 = 200 / 10 ;  Forgotten 2/4 = 110 / 110 ;
#   Skilled Veteran 2/4 = 120 / 24 ;  Admiral 2/4 = -3 / 6
# Current Skilled Veteran code doubles Endurance but not DR — fix the inconsistency
# regardless of which model wins.

# 9.8 Threshold operators (Vanguard 4-pc, Resistance Scale 2-pc)
# UNVERIFIED. If an in-game read shows the effect is inactive at exactly the
# boundary, switch >= to > ; otherwise keep >=.
```

---

## 10. Recommended optimizer-search correction

**Defect (confirmed):**
[`tl-full-build-adapter.js:469`](../web/tl-full-build-adapter.js#L469) builds
every candidate's `stats` with `{ includeSetEffects: false }`, and
`scoreHint`/`weight` derive from those set-free stats
([`:520`](../web/tl-full-build-adapter.js#L520)). The optimizer prunes the beam
using exactly these stats
([`tl-full-build-optimizer.js:66-70`](../web/tl-full-build-optimizer.js#L66) and
`:212`), and exact `evaluate()` runs only on survivors
([`:222`](../web/tl-full-build-optimizer.js#L222)). A partial-set state therefore
carries **none** of the value it would unlock on completion.

**Mitigations already present (why it is not unconditional):** candidates with
`setKeys` are always retained per slot
([`:535`](../web/tl-full-build-adapter.js#L535)), and the beam is bucketed by a
set-count `signature` ([`tl-full-build-optimizer.js:42-49`](../web/tl-full-build-optimizer.js#L42)),
so partial-set states are not Pareto-dominated by set-free states inside a
bucket. The loss occurs only at the final `diverseStates(..., beamWidth)` cut
(`:106`), which ranks across buckets by the set-free heuristic — so narrow beams
(the audit's beamWidth-1 reproduction) drop set routes; wide default beams
(500) usually keep them.

**Fix (search-only, keeps `calculateBuild` as the exact authority):**
1. Precompute per-set **completion potential**: the additional objective value a
   partial-set state would gain if its cheapest completion were finished,
   evaluated against **projected final attributes**, not a frozen number.
2. Add that optimistic bound to `heuristic()` for partial-set states (an
   admissible upper bound preserves correctness of a best-first cut).
3. Alternatively/also, reserve a slice of `beamWidth` per non-empty set
   signature so completing routes cannot be starved by set-free states.
4. Re-run `evaluate()` exactly on survivors as today.

This directly restores the Nine Lives / any-4-pc route that the current beam can
discard before exact scoring.

---

## 11. Prioritized implementation and testing plan

**P0 — decoded-confirmed value fixes (no game test needed).**
1. Apply §9.1–9.4 (Vanguard 2-pc, Dawn Mist, Holy Ghost Fighter, Battlefield
   Champion, Plains Ravager).
2. Add boundary/step regression tests: Vanguard 2-pc Endurance at 9, 10, 19, 20,
   40, 41 Perception (expect 0, 45, 45, 90, 180, 180 display); artifact 4-pc
   assert `critical_damage_dealt_modifier` not `bonus_attack_power_main_hand`.
3. Re-run `node scripts/verify-reference-build.mjs`, `verify-edge-cases.mjs`, and
   the JS test suite; the reference fixtures must still pass.

**P1 — new exact persistent components.**
4. Apply §9.5 (Admiral self) and §9.6 (Demonic Beast Hunter +40 base), each with
   a unit test tied to the decoded tooltip; keep proc/aura parts excluded.

**P2 — search correctness.**
5. Implement §10; add a regression asserting a completable 4-pc route survives at
   small beam width (generalize the audit's four-slot reproduction).

**P3 — requires a minimal in-game read (record under `D:\TL_Data\calibration`).**
6. Threshold operators (Vanguard 4-pc @ Fort 50, Resistance Scale 2-pc @ Dex 30).
7. Vanguard 4-pc stat identity (Base vs Bonus Attack Power).
8. Party-aura self-stacking model for Oracle/Forgotten/Skilled Veteran/Admiral;
   then make the rule **consistent** (fixes §7.3 regardless of outcome).

**P4 — provenance registry.**
9. Record each breakpoint with `{stem, count, decoded_tooltip, decoded_raw,
   mul, effect_groups, stat_id_confidence, threshold_confidence, phase, source}`
   so the EXACT/DERIVED/MODELED split is machine-checkable and re-derivable when
   the abnormal-state tables are eventually decoded.

---

## 12. Evidence index (record ids, tables, SQL, files, lines)

**Warehouse tables:** `records` (families `TLSkill`, `TLFormulaParameterNew`,
`TLEffectProperty`, `TLAbnormalState`), `refs`, `meta`. DB:
`D:\TL_Data\warehouse\tl-24118850.sqlite`.

**Decoded records cited (all `TLFormulaParameterNew` unless noted; keyed by
`row_id`, no `UID` on formula rows):**
- `Item_Passive_Set_plate_aa_T2_003_1_Talland_2Set` — Vanguard 2-pc (mul 450000, t1 45)
- `Item_Passive_Set_plate_aa_T2_003_2_Talland_4Set` — Vanguard 4-pc (min=max=30, t1 30)
- `Item_Passive_Set_aa_leather_T2_003_2` — Dawn Mist 4-pc (min=max=70, t1 70)
- `Item_Passive_Set_aa_plate_T2_002_2_DamageReduction` — Holy Ghost 4-pc DR (min=max=40, t1 40)
- `Item_Passive_Set_aa_plate_T2_002_2_AlllCriticalDefense` — Holy Ghost 4-pc End (min=max=1500, t1 150)
- `Item_Passive_Set_artifact_b_001_1_Passive` — Plains Ravager 4-pc (min=max=600, t1 6)
- `Item_Passive_Set_artifact_c_001_1_Passive` — Battlefield Champion 4-pc (min=max=400, t1 4)
- `Item_Passive_Set_artifact_a_002_1_Passive` — control (min=max=900, t1 9)
- `Item_Passive_Set_leather_ab_T2_002_1_Talland` / `_2_Talland` — Admiral (−300/t1 −3; 600/t1 6)
- `Item_Passive_Set_leather_aa_T3_001_2_DamageReductionPenetration` — Demonic Beast Hunter (40)
- `Item_Passive_Set_Plate_aa_T4_003_2_CriticalDamageDealtModifier` / `…Modifier2` — Nine Lives twin crit-dmg (both t1 20)
- `TLEffectProperty` `Item_Passive_Set_plate_aa_T2_003_1_AdjustStat`
  (UID 950165234, Group `Intervallic_Adjust_Stat`),
  `…_2_Check` (UID 950887083, Group `Caster_Conditional_Branch`),
  `TLSkill` `Item_Passive_Set_plate_aa_T2_003_1_Talland` (UID 940749952).

**Representative SQL (Python `sqlite3`; no CLI available):**
```sql
-- magnitudes for a stem
SELECT row_id, json_extract(raw_json,'$.FormulaParameter')
FROM records
WHERE table_family='TLFormulaParameterNew' AND row_id LIKE '%aa_plate_T2_002%';
-- effect shape / abnormal ref
SELECT row_id, json_extract(raw_json,'$.Group'), json_extract(raw_json,'$.Abnormal')
FROM records
WHERE table_family='TLEffectProperty' AND row_id LIKE 'Item_Passive_Set%';
-- master caveat: no set abnormal states exist
SELECT COUNT(*) FROM records
WHERE table_family='TLAbnormalState' AND row_id LIKE 'abn_Item_Passive_Set%';   -- 0
-- item→set link is absent
SELECT json_extract(raw_json,'$.item_passive_id') FROM records
WHERE table_name='TLItemEquip' AND row_id='chest_plate_aa_t2_set_003';          -- "None"
```

**Implementation files / lines:**
- [`web/tl-questlog-rules.js:4`](../web/tl-questlog-rules.js#L4) — `STAT_UNIT_MODIFIERS` (display scales)
- [`web/tl-questlog-rules.js:51`](../web/tl-questlog-rules.js#L51) — `SET_PASSIVE_RULES` (all rule bodies incl. the 5 errors)
- [`web/tl-questlog-rules.js:47`](../web/tl-questlog-rules.js#L47) — Skilled Veteran double-apply comment
- `web/tl-core.js` — `calculateBuild` / phased set-rule application (exact authority)
- [`web/tl-full-build-adapter.js:469`](../web/tl-full-build-adapter.js#L469) — candidate stats built `includeSetEffects:false`
- [`web/tl-full-build-adapter.js:520`](../web/tl-full-build-adapter.js#L520), [`:535`](../web/tl-full-build-adapter.js#L535) — `scoreHint`; set/heroic candidate retention
- [`web/tl-full-build-optimizer.js:42`](../web/tl-full-build-optimizer.js#L42), [`:66`](../web/tl-full-build-optimizer.js#L66), [`:106`](../web/tl-full-build-optimizer.js#L106), [`:212`](../web/tl-full-build-optimizer.js#L212), [`:222`](../web/tl-full-build-optimizer.js#L222) — signature bucketing, heuristic, beam cut, exact evaluate
- `web/data/projections/equipment.json` — 78 sets / 151 breakpoints
- [`scripts/audit-set-effects.mjs`](../scripts/audit-set-effects.mjs) — existing audit generator (projection+rules only; no warehouse read)

---

### Result summary

- Confirmed matches: **~100 of 111 passive-breakpoint magnitudes** (remaining 40
  breakpoints are structured `bonus_stat`; ~11 passive rows are %/conditional and
  DERIVED/MODELED, not decoded as flat tooltips).
- Confirmed implementation errors: **5** (Vanguard 2-pc step; Dawn Mist 70≠35;
  Holy Ghost DR 40≠20; Battlefield Champion & Plains Ravager Crit-Damage≠Bonus AP).
- Unresolved by the warehouse: **~11** (2 strict-threshold operators, 4
  party-aura self-stacking pairs, Vanguard 4-pc stat identity, artifact-6-pc %
  basis, plus the genuinely combat-only remainder) — each needs a minimal
  in-game read, itemized in §8.
- New findings beyond the audit: **4** (Admiral exact self-components; Demonic
  Beast Hunter +40 persistent base; Skilled Veteran doubling inconsistency;
  optimizer defect is beam-width-dependent) — plus the structural master caveat
  that all set abnormal-state records are absent from the warehouse.
