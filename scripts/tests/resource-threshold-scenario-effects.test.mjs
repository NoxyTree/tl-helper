import assert from "node:assert/strict";
import test from "node:test";

import {
  RESOURCE_THRESHOLD_EFFECT_DEFINITIONS,
  RESOURCE_THRESHOLD_EFFECT_IDS,
  evaluateResourceThresholdScenarioEffects,
} from "../../web/tl-resource-threshold-scenario-effects.js";

const mastery = (id, level, selected = true) => ({ id, level, selected });

function evaluate({ weapons = [], masteries = [], health, mana } = {}) {
  return evaluateResourceThresholdScenarioEffects({
    activeSources: { equippedWeaponTypes: weapons, masteries },
    scenario: {
      sourceResources: {
        ...(health === undefined ? {} : { health: { currentRatioBps: health } }),
        ...(mana === undefined ? {} : { mana: { currentRatioBps: mana } }),
      },
    },
  });
}

test("Critical Equilibrium uses all ten exact decoded ranks on both health branches", () => {
  const expected = [660, 720, 780, 840, 900, 960, 1020, 1080, 1140, 1200];
  for (let level = 1; level <= 10; level += 1) {
    const selected = mastery(RESOURCE_THRESHOLD_EFFECT_IDS.CRITICAL_EQUILIBRIUM, level);
    const low = evaluate({ weapons: ["sword2h"], masteries: [selected], health: 4999 });
    const high = evaluate({ weapons: ["sword2h"], masteries: [selected], health: 5000 });
    assert.deepEqual(low.errors, []);
    assert.deepEqual(high.errors, []);
    assert.deepEqual(low.overlayRows.map(({ statId, rawValue }) => ({ statId, rawValue })), [
      { statId: "critical_damage_taken_modifier", rawValue: expected[level - 1] },
    ]);
    assert.deepEqual(high.overlayRows.map(({ statId, rawValue }) => ({ statId, rawValue })), [
      { statId: "critical_damage_dealt_modifier", rawValue: expected[level - 1] },
    ]);
  }
});

test("Critical Equilibrium 49, 50, and 51 percent boundaries are mutually exclusive", () => {
  const selected = [mastery(RESOURCE_THRESHOLD_EFFECT_IDS.CRITICAL_EQUILIBRIUM, 10)];
  const rows = [4900, 5000, 5100].map((health) => evaluate({ weapons: ["sword2h"], masteries: selected, health }).overlayRows[0]);
  assert.deepEqual(rows.map((row) => row.statId), [
    "critical_damage_taken_modifier",
    "critical_damage_dealt_modifier",
    "critical_damage_dealt_modifier",
  ]);
});

test("Tranquil Will activates at 33.00 percent or less without rounding one third down", () => {
  const selected = [mastery(RESOURCE_THRESHOLD_EFFECT_IDS.TRANQUIL_WILL, 1)];
  const active = evaluate({ weapons: ["orb"], masteries: selected, mana: 3300 });
  const oneThirdBps = evaluate({ weapons: ["orb"], masteries: selected, mana: 3333 });
  const above = evaluate({ weapons: ["orb"], masteries: selected, mana: 3400 });
  assert.deepEqual(active.overlayRows.map(({ statId, rawValue }) => ({ statId, rawValue })), [
    { statId: "cost_consumption_modifier", rawValue: 1500 },
  ]);
  assert.deepEqual(oneThirdBps.overlayRows, []);
  assert.deepEqual(above.overlayRows, []);
  assert.equal(oneThirdBps.trace[0].code, "resource_threshold_inactive");
});

test("resource rules require an explicitly selected mastery and relevant equipped weapon", () => {
  const id = RESOURCE_THRESHOLD_EFFECT_IDS.CRITICAL_EQUILIBRIUM;
  assert.deepEqual(evaluate({ weapons: ["sword2h"], masteries: [], health: 5000 }).overlayRows, []);
  assert.deepEqual(evaluate({ weapons: ["sword2h"], masteries: [mastery(id, 10, false)], health: 5000 }).overlayRows, []);
  assert.deepEqual(evaluate({ weapons: ["orb"], masteries: [mastery(id, 10)], health: 5000 }).errors.map((row) => row.code), ["foreign_weapon_mastery"]);
  assert.deepEqual(evaluate({ weapons: ["orb", "sword2h"], masteries: [mastery(id, 10)], health: 5000 }).errors, []);
});

test("duplicates deduplicate only when levels agree and invalid levels fail closed", () => {
  const critical = RESOURCE_THRESHOLD_EFFECT_IDS.CRITICAL_EQUILIBRIUM;
  const tranquil = RESOURCE_THRESHOLD_EFFECT_IDS.TRANQUIL_WILL;
  const same = evaluate({ weapons: ["sword2h"], masteries: [mastery(critical, 5), mastery(critical, 5)], health: 5000 });
  assert.equal(same.overlayRows.length, 1);
  assert.ok(same.trace.some((row) => row.code === "source_deduplicated"));
  assert.deepEqual(evaluate({ weapons: ["sword2h"], masteries: [mastery(critical, 5), mastery(critical, 6)], health: 5000 }).errors.map((row) => row.code), ["conflicting_source_levels"]);
  assert.deepEqual(evaluate({ weapons: ["sword2h"], masteries: [mastery(critical, 0)], health: 5000 }).errors.map((row) => row.code), ["invalid_mastery_level"]);
  assert.deepEqual(evaluate({ weapons: ["orb"], masteries: [mastery(tranquil, 2)], mana: 3300 }).errors.map((row) => row.code), ["invalid_mastery_level"]);
});

test("missing resource state fails only an active relevant resource mastery", () => {
  const critical = mastery(RESOURCE_THRESHOLD_EFFECT_IDS.CRITICAL_EQUILIBRIUM, 10);
  const tranquil = mastery(RESOURCE_THRESHOLD_EFFECT_IDS.TRANQUIL_WILL, 1);
  assert.deepEqual(evaluate({ weapons: ["sword2h"], masteries: [critical] }).errors.map((row) => row.code), ["missing_scenario_resource_state"]);
  assert.deepEqual(evaluate({ weapons: ["orb"], masteries: [tranquil] }).errors.map((row) => row.code), ["missing_scenario_resource_state"]);
  assert.deepEqual(evaluate({ weapons: ["sword2h"], masteries: [], health: undefined }).errors, []);
});

test("Critical Equilibrium and Tranquil Will coexist as independent exact rows", () => {
  const result = evaluate({
    weapons: ["orb", "sword2h"],
    masteries: [
      mastery(RESOURCE_THRESHOLD_EFFECT_IDS.CRITICAL_EQUILIBRIUM, 10),
      mastery(RESOURCE_THRESHOLD_EFFECT_IDS.TRANQUIL_WILL, 1),
    ],
    health: 5000,
    mana: 3300,
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.overlayRows.map(({ statId, rawValue }) => ({ statId, rawValue })), [
    { statId: "critical_damage_dealt_modifier", rawValue: 1200 },
    { statId: "cost_consumption_modifier", rawValue: 1500 },
  ]);
});

test("decoded formula, effect, abnormal-state, and stacking provenance is pinned", () => {
  const critical = RESOURCE_THRESHOLD_EFFECT_DEFINITIONS[RESOURCE_THRESHOLD_EFFECT_IDS.CRITICAL_EQUILIBRIUM].provenance;
  assert.equal(critical.formulaType, "EFormulaType::kAmountFromMinMax");
  assert.deepEqual(critical.formulaRowIds, [
    "SW2_Mastery_Hero_Attack_CriticalDamageDefence",
    "SW2_Mastery_Hero_Attack_CriticalDamageBoost",
  ]);
  assert.deepEqual(critical.effectRowIds, [
    "WP_SW2_Mastery_Hero_Attack_ConditionalActivation",
    "WP_SW2_Mastery_Hero_Attack_AdjustStat",
    "WP_SW2_Mastery_Hero_Attack_AdjustStat2",
  ]);
  assert.equal(critical.abnormalStateId, "abn_SW2_Mastery_Hero_Attack");
  assert.equal(critical.stackCap, 1);

  const tranquil = RESOURCE_THRESHOLD_EFFECT_DEFINITIONS[RESOURCE_THRESHOLD_EFFECT_IDS.TRANQUIL_WILL].provenance;
  assert.equal(tranquil.formulaType, "EFormulaType::kAmountFromMinMax");
  assert.deepEqual(tranquil.formulaRowIds, ["ORB_WM_RARE_SUB_CostConsumptionMod"]);
  assert.deepEqual(tranquil.effectRowIds, ["WM_ORB_RARE_SUB_CostCheck", "WM_ORB_RARE_SUB_AdjustStat"]);
  assert.equal(tranquil.abnormalStateId, "abn_WM_ORB_RARE_SUB_AdjustStat");
  assert.equal(tranquil.stackCap, 1);
});
