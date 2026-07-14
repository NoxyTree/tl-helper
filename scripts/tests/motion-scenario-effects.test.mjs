import assert from "node:assert/strict";
import test from "node:test";

import {
  MOTION_EFFECT_IDS,
  evaluateMotionScenarioEffects,
} from "../../web/tl-motion-scenario-effects.js";

const passive = (id, level, selected = true) => ({ id, level, selected });
const stationary = (stationaryBand) => ({ state: "stationary", stationaryBand });
const moving = (movementKind, movingBand, priorStationaryBand) => ({
  state: "moving", movementKind, movingBand, priorStationaryBand,
});

function evaluate({ weapons = [], passives = [], masteries = [], itemEffects = [], setBreakpoints = [], motion = { state: "unspecified" } } = {}) {
  return evaluateMotionScenarioEffects({
    activeSources: {
      equippedWeaponTypes: weapons,
      passiveSkills: passives,
      masteryIds: masteries,
      itemEffects,
      setBreakpoints,
    },
    scenario: { sourceMotion: motion },
  });
}

const rows = (result) => result.overlayRows.map(({ effectId, statId, rawValue }) => ({ effectId, statId, rawValue }));

test("Rapidfire Stance applies every exact level curve at and above two seconds", () => {
  const speeds = [600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2050, 2100, 2150, 2200, 2250];
  for (let level = 1; level <= 20; level += 1) {
    const result = evaluate({ weapons: ["bow"], passives: [passive(MOTION_EFFECT_IDS.RAPIDFIRE_STANCE, level)], motion: stationary("2s_to_under_3s") });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(rows(result), [
      { effectId: MOTION_EFFECT_IDS.RAPIDFIRE_STANCE, statId: "attack_speed_modifier", rawValue: speeds[level - 1] },
      { effectId: MOTION_EFFECT_IDS.RAPIDFIRE_STANCE, statId: "all_accuracy", rawValue: 1000 },
    ]);
  }
  assert.deepEqual(evaluate({ weapons: ["bow"], passives: [passive(MOTION_EFFECT_IDS.RAPIDFIRE_STANCE, 20)], motion: stationary("under_2s") }).overlayRows, []);
});

test("Battle Tempo replaces Rapidfire's threshold and speed curve but not Hit Chance", () => {
  const rapidfire = passive(MOTION_EFFECT_IDS.RAPIDFIRE_STANCE, 20);
  const below = evaluate({ weapons: ["bow"], passives: [rapidfire], masteries: [MOTION_EFFECT_IDS.BATTLE_TEMPO], motion: stationary("3s_to_under_4s") });
  assert.deepEqual(below.overlayRows, []);
  const active = evaluate({ weapons: ["bow"], passives: [rapidfire], masteries: [MOTION_EFFECT_IDS.BATTLE_TEMPO], motion: stationary("4s_or_more") });
  assert.deepEqual(rows(active), [
    { effectId: MOTION_EFFECT_IDS.BATTLE_TEMPO, statId: "attack_speed_modifier", rawValue: 2700 },
    { effectId: MOTION_EFFECT_IDS.BATTLE_TEMPO, statId: "all_accuracy", rawValue: 1000 },
  ]);
  const absent = evaluate({ weapons: ["bow"], masteries: [MOTION_EFFECT_IDS.BATTLE_TEMPO], motion: { state: "unspecified" } });
  assert.deepEqual(absent.errors, []);
  assert.deepEqual(absent.overlayRows, []);
  assert.ok(absent.trace.some((row) => row.code === "replacement_source_absent"));
});

test("Asceticism adds the second Mana Regen component and exact Heavy Attack curve", () => {
  const expectedMana = [32000, 37000, 42000, 48000, 53000, 58000, 63000, 69000, 74000, 79000, 84000, 90000, 95000, 100000, 105000, 107000, 109000, 111000, 113000, 115000];
  const expectedHeavy = [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1030, 1060, 1090, 1120, 1150];
  for (let level = 1; level <= 20; level += 1) {
    const result = evaluate({ weapons: ["staff"], passives: [passive(MOTION_EFFECT_IDS.ASCETICISM, level)], motion: stationary("3s_to_under_4s") });
    assert.deepEqual(rows(result), [
      { effectId: MOTION_EFFECT_IDS.ASCETICISM, statId: "cost_regen", rawValue: expectedMana[level - 1] },
      { effectId: MOTION_EFFECT_IDS.ASCETICISM, statId: "all_double_attack", rawValue: expectedHeavy[level - 1] },
    ]);
  }
  assert.deepEqual(evaluate({ weapons: ["staff"], passives: [passive(MOTION_EFFECT_IDS.ASCETICISM, 20)], motion: stationary("2s_to_under_3s") }).overlayRows, []);
});

test("post-move grace and movement-skill cancellation are source-specific", () => {
  const rapidfire = passive(MOTION_EFFECT_IDS.RAPIDFIRE_STANCE, 20);
  const asceticism = passive(MOTION_EFFECT_IDS.ASCETICISM, 20);
  const aridus = { id: MOTION_EFFECT_IDS.ARIDUS_FURY, sourceKind: "innate", itemId: "staff_aa_t3_boss_002" };
  const skillMotion = moving("movement_skill", "2s_or_more", "4s_or_more");
  const ordinaryGrace = moving("ordinary", "under_2s", "4s_or_more");
  const ordinaryExpired = moving("ordinary", "2s_or_more", "4s_or_more");

  assert.equal(evaluate({ weapons: ["bow"], passives: [rapidfire], motion: skillMotion }).overlayRows.length, 2);
  assert.equal(evaluate({ weapons: ["staff"], passives: [asceticism], motion: skillMotion }).overlayRows.length, 2);
  assert.equal(evaluate({ weapons: ["staff"], itemEffects: [aridus], motion: skillMotion }).overlayRows.length, 0);
  assert.equal(evaluate({ weapons: ["staff"], itemEffects: [aridus], motion: ordinaryGrace }).overlayRows.length, 1);
  assert.equal(evaluate({ weapons: ["staff"], itemEffects: [aridus], motion: ordinaryExpired }).overlayRows.length, 0);
});

test("Aridus's Fury deduplicates innate and selected-core carriers at StackCap 1", () => {
  const itemEffects = [
    { id: MOTION_EFFECT_IDS.ARIDUS_FURY, sourceKind: "innate", itemId: "staff_aa_t3_boss_002" },
    { id: MOTION_EFFECT_IDS.ARIDUS_FURY, sourceKind: "selected_core", selected: true, itemId: "staff_aa_t2_raid_001", perkId: "perk_staff_aa_t3_boss_002" },
  ];
  const result = evaluate({ weapons: ["staff"], itemEffects, motion: stationary("3s_to_under_4s") });
  assert.deepEqual(rows(result), [{ effectId: MOTION_EFFECT_IDS.ARIDUS_FURY, statId: "attack_power_modifier", rawValue: 1200 }]);
  assert.ok(result.trace.some((row) => row.code === "source_deduplicated"));
});

test("Aridus's Fury rejects spoofed item and Skill Core carriers", () => {
  const itemEffects = [
    { id: MOTION_EFFECT_IDS.ARIDUS_FURY, sourceKind: "innate", itemId: "staff_c_t1_nomal_001" },
    { id: MOTION_EFFECT_IDS.ARIDUS_FURY, sourceKind: "selected_core", selected: true, itemId: "staff_aa_t2_raid_001", perkId: "not-aridus" },
  ];
  const result = evaluate({ weapons: ["staff"], itemEffects, motion: stationary("3s_to_under_4s") });
  assert.deepEqual(result.overlayRows, []);
  assert.deepEqual(result.errors.map((row) => row.code), ["invalid_item_effect_carrier", "invalid_item_effect_carrier"]);
});

test("Stigma Executor activates only its conditional remainder at four pieces", () => {
  const active = evaluate({ setBreakpoints: [MOTION_EFFECT_IDS.STIGMA_EXECUTOR_4], motion: stationary("4s_or_more") });
  assert.deepEqual(rows(active), [{ effectId: MOTION_EFFECT_IDS.STIGMA_EXECUTOR_4, statId: "critical_damage_dealt_modifier", rawValue: 1500 }]);
  assert.deepEqual(evaluate({ setBreakpoints: [MOTION_EFFECT_IDS.STIGMA_EXECUTOR_4], motion: stationary("3s_to_under_4s") }).overlayRows, []);
  assert.deepEqual(evaluate({ setBreakpoints: [MOTION_EFFECT_IDS.STIGMA_EXECUTOR_4], motion: moving("ordinary", "under_2s", "4s_or_more") }).overlayRows, []);
  assert.deepEqual(evaluate({ setBreakpoints: [], motion: { state: "unspecified" } }).errors, []);
});

test("missing or partial motion fails closed only for an active relevant source", () => {
  const selected = [passive(MOTION_EFFECT_IDS.RAPIDFIRE_STANCE, 20)];
  assert.deepEqual(evaluate({ weapons: ["bow"], passives: selected }).errors.map((row) => row.code), ["insufficient_source_motion"]);
  assert.deepEqual(evaluate({ weapons: ["bow"], passives: selected, motion: moving("ordinary", "unspecified", "4s_or_more") }).errors.map((row) => row.code), ["insufficient_source_motion"]);
  assert.deepEqual(evaluate({ weapons: ["bow"], passives: selected, motion: moving("ordinary", "unspecified", "under_2s") }).errors, []);
  assert.deepEqual(evaluate().errors, []);
});

test("motion rules enforce selected levels and equipped weapon families", () => {
  assert.deepEqual(evaluate({ weapons: ["staff"], passives: [passive(MOTION_EFFECT_IDS.RAPIDFIRE_STANCE, 20)], motion: stationary("4s_or_more") }).errors.map((row) => row.code), ["foreign_weapon_passive"]);
  assert.deepEqual(evaluate({ weapons: ["bow"], passives: [passive(MOTION_EFFECT_IDS.RAPIDFIRE_STANCE, 0)], motion: stationary("4s_or_more") }).errors.map((row) => row.code), ["invalid_passive_level"]);
  assert.deepEqual(evaluate({ weapons: ["bow"], passives: [passive(MOTION_EFFECT_IDS.RAPIDFIRE_STANCE, 20, false)], motion: { state: "unspecified" } }).errors, []);
});
