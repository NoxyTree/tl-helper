// Regression tests for the decoded-warehouse set-effect corrections applied on
// 2026-07-13. Evidence: docs/set-effect-database-review-2026-07-13.md (build
// 24118850). Each expectation cites the TLFormulaParameterNew row that proves
// the value. Values are asserted RAW (post statRawValue), matching the rule
// output contract consumed by tl-core's phased calculator.

import assert from "node:assert/strict";
import test from "node:test";

import { SET_PASSIVE_RULES, STAT_UNIT_MODIFIERS } from "../../web/tl-questlog-rules.js";

const attrs = (values) => new Proxy({}, {
  get: (_, key) => ({ total: values[key] ?? 0 }),
});

const rows = (setId, count, env = {}) => SET_PASSIVE_RULES[setId][count].effect(attrs(env));

const only = (list, statId) => {
  const matching = list.filter((row) => row.statId === statId);
  assert.equal(matching.length, 1, `expected exactly one ${statId} row, got ${JSON.stringify(list)}`);
  return matching[0].value;
};

test("Vanguard Leader 2-piece steps Endurance per complete 10 Perception", () => {
  // Item_Passive_Set_plate_aa_T2_003_1_Talland_2Set: min=0 max=99 mul=450000 tooltip1=45.
  // Display modifier for all_critical_defense is 0.1, so display d => raw d*10.
  const cases = [
    [9, 0],
    [10, 45],
    [19, 45],
    [20, 90],
    [40, 180],
    [41, 180], // the reported case: 41 Perception must NOT yield 184.5
  ];
  for (const [per, display] of cases) {
    const result = rows("set_aa_T2_plate_005", 2, { per });
    if (display === 0) {
      const total = result.reduce((sum, row) => sum + row.value, 0);
      assert.equal(total, 0, `at ${per} Perception expected no Endurance`);
      continue;
    }
    const raw = only(result, "all_critical_defense");
    assert.equal(raw, display / STAT_UNIT_MODIFIERS.all_critical_defense, `at ${per} Perception`);
    assert.equal(raw, display * 10);
  }
});

test("Vanguard Leader 4-piece amount stays 30 with the >=50 Fortitude gate", () => {
  // Item_Passive_Set_plate_aa_T2_003_2_Talland_4Set: min=max=30. The >=
  // operator is confirmed by the Korean source string "불굴이 50 이상일 때"
  // ("when Fortitude is 50 or more", Game.locres ko); English "over 50" was a
  // loose translation.
  assert.equal(only(rows("set_aa_T2_plate_005", 4, { con: 50 }), "bonus_attack_power_main_hand"), 30);
  assert.equal(rows("set_aa_T2_plate_005", 4, { con: 49 }).reduce((sum, row) => sum + row.value, 0), 0);
});

test("Dawn Mist 4-piece grants Bonus Damage 70, not 35", () => {
  // Item_Passive_Set_aa_leather_T2_003_2: min=max=70 tooltip1=70.
  assert.equal(only(rows("set_aa_T2_leather_003", 4), "damage_reduction_penetration"), 70);
});

test("Holy Ghost Fighter 4-piece grants Damage Reduction 40 plus Endurance 150", () => {
  // Item_Passive_Set_aa_plate_T2_002_2_DamageReduction: min=max=40.
  // Item_Passive_Set_aa_plate_T2_002_2_AlllCriticalDefense: min=max=1500 (display 150).
  const result = rows("set_aa_T2_plate_002", 4);
  assert.equal(only(result, "damage_reduction"), 40);
  assert.equal(only(result, "all_critical_defense"), 1500);
});

test("Battlefield Champion 4-piece is Critical Damage +4%, not Bonus Attack Power", () => {
  // Item_Passive_Set_artifact_c_001_1_Passive: min=max=400 tooltip1=4 — a raw
  // 400 for a "+4" effect only fits the x0.01 critical_damage_dealt_modifier.
  const result = rows("set_c_artifact_set_001", 4);
  assert.equal(only(result, "critical_damage_dealt_modifier"), 400);
  assert.equal(result.some((row) => row.statId === "bonus_attack_power_main_hand"), false);
});

test("Plains Ravager 4-piece is Critical Damage +6%, not Bonus Attack Power", () => {
  // Item_Passive_Set_artifact_b_001_1_Passive: min=max=600 tooltip1=6.
  const result = rows("set_b_artifact_set_001", 4);
  assert.equal(only(result, "critical_damage_dealt_modifier"), 600);
  assert.equal(result.some((row) => row.statId === "bonus_attack_power_main_hand"), false);
});

test("Admiral applies each decoded component twice: personal plus self-inclusive aura", () => {
  // Item_Passive_Set_leather_ab_T2_002_1_Talland: min=max=-300 tooltip1=-3.
  // Item_Passive_Set_leather_ab_T2_002_2_Talland: min=max=600 tooltip1=6.
  // The client set description (Game.locres leather_ab_T2_002_2_Talland_UIOptions)
  // binds the SAME tooltip to a personal line and a "self and all party members
  // within 18m" line, matching the other Talland aura sets.
  const two = rows("set_aa_T2_leather_005", 2).filter((row) => row.statId === "debuff_taken_duration_modifier");
  assert.deepEqual(two.map((row) => row.value), [-300, -300]);
  const four = rows("set_aa_T2_leather_005", 4).filter((row) => row.statId === "attack_speed_modifier");
  assert.deepEqual(four.map((row) => row.value), [600, 600]);
});

test("Skilled Veteran uses the decoded per-application values in both breakpoints", () => {
  // Item_Passive_Set_plate_aa_T2_002_1_Talland: min=max=1200 tooltip1=120.
  // Item_Passive_Set_plate_aa_T2_002_2_Talland: min=max=24 tooltip1=24.
  // Each is bound twice by the client set description (personal + self-inclusive
  // aura). Questlog's 12+12 for the 4-piece halved the decoded 24.
  const endurance = rows("set_aa_T2_plate_003", 2).filter((row) => row.statId === "all_critical_defense");
  assert.deepEqual(endurance.map((row) => row.value), [1200, 1200]);
  const reduction = rows("set_aa_T2_plate_003", 4).filter((row) => row.statId === "damage_reduction");
  assert.deepEqual(reduction.map((row) => row.value), [24, 24]);
});

test("Demonic Beast Hunter 4-piece applies only the persistent Bonus Damage 40", () => {
  // Item_Passive_Set_leather_aa_T3_001_2_DamageReductionPenetration: min=max=40.
  // The 15%-rate on-hit +14 stacking proc must stay out of sheet totals.
  const result = rows("set_aa_t3_lether_001", 4);
  assert.equal(only(result, "damage_reduction_penetration"), 40);
  assert.equal(result.length, 1);
});
