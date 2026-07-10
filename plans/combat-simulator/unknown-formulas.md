# Unknown-formula register

Build 24118850 · 2026-07-10 · statuses: **extractable** (present in client data, not yet decoded/parsed) / **calibration-required** (must be measured in controlled play) / **likely server-only** / **currently unknown** (no evidence either way yet).

Rule: nothing below may be silently invented in the engine. Every entry ships as `modeled` or `unsupported` until its status changes with evidence.

| # | Unknown | Status | Evidence so far | Next step |
| --- | --- | --- | --- | --- |
| 1 | Damage pipeline order (stages 1–15 in 02-damage-healing-tanking.md) | **currently unknown** | Formula rows give per-stage magnitudes but no ordering; no order table found in decoded set | Calibrate with single-variable experiments; check `TLEffectProperty` + ActionTree packages (extractable candidates) |
| 2 | Armor/defense → % mitigation curve | **calibration-required** | Raw armor stats exist; no conversion constants located in 38 decoded tables | Controlled hits vs known armor deltas; integer-boundary probing |
| 3 | Hit vs evasion contest curve | **calibration-required** | `all_accuracy`/`all_evasion` totals only; Questlog community model `Δ/(Δ+1000)` captured in `questlog-contest-curve-evidence.md` | Curve fitting per 04 plan; community model usable as `modeled` only |
| 4 | Crit chance vs endurance (critical_defense) curve | **calibration-required** | Stat totals only; `BO_PowerShot_Hero_CriticalChance_Up` gives flat +2000/4000 (points, not %); same Questlog `Δ/(Δ+1000)` reference | Same |
| 5 | Heavy/double-attack contest curve | **calibration-required** | Stat totals only; same Questlog `Δ/(Δ+1000)` reference (heavy attack and skill damage boost/resistance probed directly) | Same |
| 6 | Block chance/efficiency vs penetration | **calibration-required** | `kAmountFromShieldBlockChance` formula type exists (22 rows) — partial client visibility | Decode-inspect those rows first, then calibrate |
| 7 | Basis units (10000 = 100%) and tooltip scaling (tooltip1 = mul/100) | **calibration-required** (one confirmation) | Consistent across all sampled rows; PowerShot tooltip matches | One in-game tooltip vs decoded row check |
| 8 | Rounding order and integer stages | **calibration-required** | Web static math uses floor at specific points (Questlog-derived); combat rounding unobserved | Integer-boundary tests per 04 plan |
| 9 | Global PvP damage modifier(s) | **currently unknown** | Per-skill `_PVE`/`_Boss` variant rows are client-visible; no global PvP scalar found | Search `TLContentStatLimit` (59 rows, decoded) + `TLFormulaParameter` legacy table; then calibrate |
| 10 | Server tick rate, DoT/HoT tick alignment | **likely server-only** | Durations client-visible (`*_Duration` rows, ms); alignment not | Observation-based estimation only |
| 11 | Internal cooldowns of passive procs | **extractable (partial)** | `TLAbnormalState` carries duration/stack fields; proc ICDs not yet located | Decode remaining `TLAbnormalState_*`; inspect `TLPcDynamicStat` rows |
| 12 | Threat/aggro coefficients | **likely server-only** | Nothing client-side found | Keep modeled relative indices only |
| 13 | Buff exclusivity resolution (same `ModifyGroup`) | **extractable** | `ModifyGroup` + `PriorityInGroup` + `StackCap` decoded; `TLAbnormalContentsGroup` not yet decoded | Decode `TLAbnormalContentsGroup` (288 KB) |
| 14 | Skill→formula-row naming transform, full coverage | **extractable** | Held for all sampled skills (`WP_BO_S_X → BO_X`); 95.4% of tooltip bases resolve | Materialize mapping for all 210 sets; flag the misses |
| 15 | NPC/boss defense and species modifiers | **extractable (partial)** | `TLNpc_*` raw-preserved (33 MB, undecoded); `kAmountFromTargetHpMax` rows show target-scaled magnitudes | Decode selected boss NPC tables on demand |
| 16 | Distance sampling for `kAmountFromDistance` (127 rows) | **calibration-required** | Formula rows visible; in-game sampling unknown | Controlled range tests |
| 17 | Combat-power formula | **extractable** | `TLItemCombatPower` decoded (132 rows) — not yet compared to the web's fitted heuristic | Compare; replace heuristic with labeled extraction |
| 18 | 175 unresolved tooltip bases (`KN_`, `MO_`, `SC_`, `AS_` kits) | **extractable** | Absent from `TLFormulaParameterNew`; likely NPC kit tables | Locate in undecoded families; record per-base resolution |
| 19 | Legacy `TLFormulaParameter` (non-New) relationship | **currently unknown** | Old table exists in extraction; not decoded | Decode + diff against New before trusting either |
| 20 | Whether tooltip values ever diverge from live behavior | **calibration-required** | Known MMO failure mode; no local evidence either way | Include tooltip-vs-observed checks in every calibration case |
