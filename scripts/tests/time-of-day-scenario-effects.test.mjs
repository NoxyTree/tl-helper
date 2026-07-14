import assert from "node:assert/strict";
import test from "node:test";

import {
  TIME_OF_DAY_EFFECT_IDS,
  evaluateTimeOfDayScenarioEffects,
} from "../../web/tl-time-of-day-scenario-effects.js";

const bombing = (overrides = {}) => ({
  id: TIME_OF_DAY_EFFECT_IDS.KOWAZANS_BOMBING,
  sourceKind: "innate",
  itemId: "crossbow_aa_t5_boss_001",
  ...overrides,
});

const madness = (overrides = {}) => ({
  id: TIME_OF_DAY_EFFECT_IDS.KOWAZANS_MADNESS,
  sourceKind: "innate",
  itemId: "dagger_aa_t5_boss_001",
  ...overrides,
});

function evaluate({ weapons = [], itemEffects = [], timeOfDay = "day" } = {}) {
  return evaluateTimeOfDayScenarioEffects({
    activeSources: { equippedWeaponTypes: weapons, itemEffects },
    scenario: { timeOfDay },
  });
}

test("Kowazan ordinary day and night values are decoded fixed amounts", () => {
  const day = evaluate({ weapons: ["crossbow", "dagger"], itemEffects: [bombing(), madness()], timeOfDay: "day" });
  const night = evaluate({ weapons: ["crossbow", "dagger"], itemEffects: [bombing(), madness()], timeOfDay: "night" });

  assert.deepEqual(day.errors, []);
  assert.deepEqual(night.errors, []);
  assert.deepEqual(day.overlayRows.map(({ effectId, statId, rawValue }) => ({ effectId, statId, rawValue })), [
    { effectId: TIME_OF_DAY_EFFECT_IDS.KOWAZANS_BOMBING, statId: "attack_speed_modifier", rawValue: 1200 },
    { effectId: TIME_OF_DAY_EFFECT_IDS.KOWAZANS_MADNESS, statId: "melee_critical_attack", rawValue: 1250 },
  ]);
  assert.deepEqual(night.overlayRows.map(({ effectId, statId, rawValue }) => ({ effectId, statId, rawValue })), [
    { effectId: TIME_OF_DAY_EFFECT_IDS.KOWAZANS_BOMBING, statId: "attack_speed_modifier", rawValue: 600 },
    { effectId: TIME_OF_DAY_EFFECT_IDS.KOWAZANS_MADNESS, statId: "melee_critical_attack", rawValue: 2500 },
  ]);
  assert.ok(day.overlayRows.every((row) => row.provenance.authority === "decoded_exact_fixed_amount"));
});

test("unsupported phases fail only active time-dependent sources closed", () => {
  for (const timeOfDay of ["unspecified", "dawn", "dusk"]) {
    const active = evaluate({ weapons: ["crossbow"], itemEffects: [bombing()], timeOfDay });
    assert.deepEqual(active.overlayRows, []);
    assert.deepEqual(active.errors.map((row) => row.code), ["unsupported_time_of_day"]);
    assert.deepEqual(evaluate({ timeOfDay }).errors, []);
  }
});

test("carrier identity, source kind, and equipped weapon are exact", () => {
  assert.deepEqual(evaluate({ weapons: ["crossbow"], itemEffects: [bombing({ itemId: "wrong" })] }).errors.map((row) => row.code), ["invalid_item_effect_carrier"]);
  assert.deepEqual(evaluate({ weapons: ["crossbow"], itemEffects: [bombing({ sourceKind: "selected_core", selected: true })] }).errors.map((row) => row.code), ["invalid_item_source_kind"]);
  assert.deepEqual(evaluate({ weapons: ["dagger"], itemEffects: [bombing()] }).errors.map((row) => row.code), ["foreign_weapon_item_effect"]);
});

test("shared old and new Kowazan abnormal states fail closed", () => {
  const dagger = evaluate({
    weapons: ["dagger"],
    itemEffects: [madness(), { id: TIME_OF_DAY_EFFECT_IDS.KOWAZANS_FRENZY, sourceKind: "innate", itemId: "dagger_aa_t3_boss_002" }],
  });
  const crossbow = evaluate({
    weapons: ["crossbow"],
    itemEffects: [bombing(), { id: TIME_OF_DAY_EFFECT_IDS.KOWAZANS_FLAME_SPIRIT, sourceKind: "innate", itemId: "crossbow_aa_t3_boss_002" }],
  });
  assert.deepEqual(dagger.overlayRows, []);
  assert.deepEqual(crossbow.overlayRows, []);
  assert.deepEqual(dagger.errors.map((row) => row.code), ["shared_abnormal_conflict"]);
  assert.deepEqual(crossbow.errors.map((row) => row.code), ["shared_abnormal_conflict"]);
});
