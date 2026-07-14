import assert from "node:assert/strict";
import test from "node:test";
import {
  compareModeledExpectedDamage,
  modelExpectedPvpDamage,
} from "../../packages/combat-engine/src/expected-damage.mjs";

const BASE = Object.freeze({
  pvpMode: "general",
  attackType: "melee",
  preResolutionMinimum: "100",
  preResolutionMaximum: "200",
  hit: "1000",
  evasion: "1000",
  criticalHit: "2000",
  endurance: "1000",
  heavyAttackChance: "1000",
  heavyAttackEvasion: "0",
  skillDamageBoost: "500",
  skillDamageResistance: "0",
  criticalDamage: "50",
  criticalDamageResistance: "0",
  heavyDamage: "100",
  heavyDamageResistance: "0",
});

test("expected PvP damage composes chance and damage operations without claiming final damage", () => {
  const result = modelExpectedPvpDamage(BASE);
  assert.equal(result.expectedDamage, "599.99985");
  assert.deepEqual(result.sensitivityInterval, { minimum: "599.99985", maximum: "599.99985" });
  assert.equal(result.probabilities.critical, "0.5");
  assert.equal(result.probabilities.heavy, "0.5");
  assert.equal(result.multipliers.criticalDamage, "1.5");
  assert.equal(result.multipliers.heavyDamage, "3");
  assert.equal(result.multipliers.skillDamage, "1.333333");
  assert.equal(result.completeness.isFinalCombatOutcome, false);
  assert.ok(result.unsupportedStages.some((stage) => stage.includes("Defense")));
  const probabilityTotal = result.branches.reduce((sum, row) => sum + Number(row.probability), 0);
  const enumeratedExpected = result.branches.reduce((sum, row) => sum + Number(row.probability) * Number(row.damage), 0);
  assert.ok(Math.abs(probabilityTotal - 1) < 0.00001);
  assert.ok(Math.abs(enumeratedExpected - Number(result.expectedDamage)) < 0.01);
});

test("glance and Heavy uncertainty produces a visible sensitivity interval", () => {
  const result = modelExpectedPvpDamage({
    ...BASE,
    criticalHit: "0",
    endurance: "1000",
  });
  assert.equal(result.probabilities.glance, "0.5");
  assert.ok(Number(result.sensitivityInterval.maximum) > Number(result.sensitivityInterval.minimum));
  assert.equal(result.branches.find(({ id }) => id === "glance_heavy").precision, "modeled_unresolved_interaction");
});

test("damage comparison is decisive only when sensitivity intervals do not overlap", () => {
  const lower = modelExpectedPvpDamage(BASE);
  const higher = modelExpectedPvpDamage({ ...BASE, preResolutionMinimum: "200", preResolutionMaximum: "400" });
  assert.deepEqual(compareModeledExpectedDamage(lower, higher), {
    status: "model_stable",
    winner: "right",
    decisiveWithinModeledSensitivity: true,
    guaranteedDifferencePercent: "100.0000",
  });
  const glancing = modelExpectedPvpDamage({ ...BASE, criticalHit: "0", endurance: "1000" });
  assert.equal(compareModeledExpectedDamage(lower, glancing).decisiveWithinModeledSensitivity, true);
});

test("expected damage validates the supplied projection range", () => {
  assert.throws(() => modelExpectedPvpDamage({ ...BASE, preResolutionMinimum: "201" }), /cannot exceed/);
  assert.throws(() => modelExpectedPvpDamage({ ...BASE, heavyDamage: "-1" }), /non-negative/);
});
