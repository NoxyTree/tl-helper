import assert from "node:assert/strict";
import test from "node:test";

import {
  DISTANCE_EFFECT_DEFINITIONS,
  DISTANCE_EFFECT_IDS,
  evaluateDistanceScenarioEffects,
} from "../../web/tl-distance-scenario-effects.js";

const evaluate = ({ weapons, passives = [], masteries = [], items = [], distance = 10 }) => evaluateDistanceScenarioEffects({
  activeSources: {
    equippedWeaponTypes: weapons,
    passiveSkills: passives,
    masteryIds: masteries,
    itemEffects: items,
  },
  scenario: { targetDistanceMeters: distance },
});

const row = (result, statId) => result.overlayRows.find((entry) => entry.statId === statId);

test("Sniper's Sense uses every decoded level coefficient plus 40 raw Critical Damage per metre", () => {
  const expected = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240, 245, 250, 255, 260, 265];
  for (let level = 1; level <= 20; level += 1) {
    const result = evaluate({ weapons: ["bow"], passives: [{ id: DISTANCE_EFFECT_IDS.SNIPERS_SENSE, level, selected: true }], distance: 1 });
    assert.deepEqual(result.errors, []);
    assert.equal(row(result, "all_critical_attack").rawValue, expected[level - 1]);
    assert.equal(row(result, "critical_damage_dealt_modifier").rawValue, 40);
  }
});

test("Far Sight replaces only Sniper Critical Hit Chance at the exact 6m boundary", () => {
  const passive = [{ id: DISTANCE_EFFECT_IDS.SNIPERS_SENSE, level: 20, selected: true }];
  const masteries = [DISTANCE_EFFECT_IDS.FAR_SIGHT];
  const below = evaluate({ weapons: ["bow"], passives: passive, masteries, distance: 5.999 });
  assert.equal(row(below, "all_critical_attack"), undefined);
  assert.equal(row(below, "critical_damage_dealt_modifier").rawValue, 40 * 5.999);
  const boundary = evaluate({ weapons: ["bow"], passives: passive, masteries, distance: 6 });
  assert.equal(row(boundary, "all_critical_attack").rawValue, 318 * 6);
  assert.equal(row(boundary, "critical_damage_dealt_modifier").rawValue, 40 * 6);
  assert.equal(row(boundary, "all_critical_attack").sourceKinds.includes("mastery_replacement"), true);
});

test("Far Sight exposes all 20 decoded replacement coefficients", () => {
  const expected = [120, 132, 144, 156, 168, 180, 192, 204, 216, 228, 240, 252, 264, 276, 288, 294, 300, 306, 312, 318];
  assert.deepEqual(DISTANCE_EFFECT_DEFINITIONS[DISTANCE_EFFECT_IDS.FAR_SIGHT].criticalRawPerMeter, expected);
});

test("Eagle Vision uses the exact base, distance accuracy, and weaken coefficients at every level", () => {
  const expected = [60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 205, 210, 215, 220, 225];
  for (let level = 1; level <= 20; level += 1) {
    const result = evaluate({ weapons: ["crossbow"], passives: [{ id: DISTANCE_EFFECT_IDS.EAGLE_VISION, level, selected: true }], distance: 2 });
    assert.deepEqual(result.errors, []);
    assert.equal(row(result, "magic_accuracy").rawValue, 400 + expected[level - 1] * 2);
    assert.equal(row(result, "range_accuracy").rawValue, 400 + expected[level - 1] * 2);
    assert.equal(row(result, "weaken_accuracy").rawValue, 400);
  }
});

test("Predator's Focus fails closed until nearby-opponent semantics exist", () => {
  const result = evaluate({
    weapons: ["crossbow"],
    passives: [{ id: DISTANCE_EFFECT_IDS.EAGLE_VISION, level: 20, selected: true }],
    masteries: [DISTANCE_EFFECT_IDS.PREDATORS_FOCUS],
  });
  assert.equal(result.overlayRows.length, 0);
  assert.equal(result.errors[0].code, "unsupported_mastery_replacement");
  assert.equal(result.trace.some(({ code }) => code === "effect_failed_closed"), true);
});

test("Black Rage applies once from an innate or selected core source and preserves provenance", () => {
  const result = evaluate({
    weapons: ["staff"],
    items: [
      { id: DISTANCE_EFFECT_IDS.BLACK_RAGE, sourceKind: "selected_core", selected: true },
      { id: DISTANCE_EFFECT_IDS.BLACK_RAGE, sourceKind: "innate" },
      { id: DISTANCE_EFFECT_IDS.BLACK_RAGE, sourceKind: "innate" },
    ],
    distance: 7.5,
  });
  assert.equal(result.overlayRows.length, 1);
  assert.equal(result.overlayRows[0].rawValue, 1500);
  assert.deepEqual(result.overlayRows[0].sourceKinds, ["innate", "selected_core"]);
  assert.deepEqual(result.overlayRows[0].provenance.formulaRowIds, ["WP_Item_kA_ST_55_CriticalAttack"]);
  assert.equal(result.trace.some(({ code }) => code === "source_deduplicated"), true);
});

test("fractional metres remain continuous and never alter static totals", () => {
  const staticTotals = Object.freeze({ all_critical_attack: Object.freeze({ total: 1234 }) });
  const result = evaluate({ weapons: ["bow"], passives: [{ id: DISTANCE_EFFECT_IDS.SNIPERS_SENSE, level: 20, selected: true }], distance: 1.5 });
  assert.equal(row(result, "all_critical_attack").rawValue, 397.5);
  assert.equal(row(result, "all_critical_attack").precision.projection, "continuous_fractional_meters");
  assert.equal(row(result, "all_critical_attack").precision.staticTotalsMutated, false);
  assert.equal(staticTotals.all_critical_attack.total, 1234);
});

test("invalid scenarios, foreign weapons, unselected sources, and conflicting duplicate levels fail closed", () => {
  for (const distance of [-1, Number.NaN, Number.POSITIVE_INFINITY, "10"]) {
    const result = evaluate({ weapons: ["bow"], passives: [{ id: DISTANCE_EFFECT_IDS.SNIPERS_SENSE, level: 20, selected: true }], distance });
    assert.equal(result.overlayRows.length, 0);
    assert.equal(result.errors[0].code, "invalid_target_distance");
  }

  const foreign = evaluate({ weapons: ["dagger"], passives: [{ id: DISTANCE_EFFECT_IDS.SNIPERS_SENSE, level: 20, selected: true }] });
  assert.equal(foreign.overlayRows.length, 0);
  assert.equal(foreign.errors[0].code, "foreign_weapon_passive");

  const unselected = evaluate({ weapons: ["bow"], passives: [{ id: DISTANCE_EFFECT_IDS.SNIPERS_SENSE, level: 20, selected: false }] });
  assert.equal(unselected.overlayRows.length, 0);
  assert.equal(unselected.trace[0].code, "source_not_selected");

  const conflict = evaluate({
    weapons: ["bow"],
    passives: [
      { id: DISTANCE_EFFECT_IDS.SNIPERS_SENSE, level: 19, selected: true },
      { id: DISTANCE_EFFECT_IDS.SNIPERS_SENSE, level: 20, selected: true },
    ],
  });
  assert.equal(conflict.overlayRows.length, 0);
  assert.equal(conflict.errors[0].code, "conflicting_source_levels");
});
