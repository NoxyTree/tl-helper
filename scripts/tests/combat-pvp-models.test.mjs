import assert from "node:assert/strict";
import test from "node:test";
import {
  modelCriticalDamageMultiplier,
  modelDefenseMultiplier,
  modelGlanceChance,
  modelHeavyAttackChance,
  modelHitChance,
  modelCriticalContest,
  modelHeavyDamageMultiplier,
  modelSkillDamageMultiplier,
} from "../../packages/combat-engine/src/index.mjs";

test("SDB and SDR subtract before the signed curve", () => {
  assert.equal(modelSkillDamageMultiplier({ boost: "500", resistance: "300" }).value, "1.166666");
  assert.equal(modelSkillDamageMultiplier({ boost: "300", resistance: "500" }).value, "0.833334");
  assert.equal(modelSkillDamageMultiplier({ boost: "500", resistance: "500" }).value, "1");
});

test("Hit chance is 100 percent until Evasion exceeds Hit", () => {
  assert.equal(modelHitChance({ hit: "3000", evasion: "2800", pvpMode: "general" }).value, "1");
  const disadvantaged = modelHitChance({ hit: "1000", evasion: "1500" });
  assert.equal(disadvantaged.value, "0.666667");
  assert.equal(disadvantaged.missChance, "0.333333");
});

test("Hit and Critical use their distinct official cap directions in every mode", () => {
  const expectations = {
    general: { hitNegative: "-4500", criticalPositive: "4500", criticalNegative: "-3000" },
    battleground: { hitNegative: "-3000", criticalPositive: "3000", criticalNegative: "-2000" },
    arena: { hitNegative: "-2250", criticalPositive: "2250", criticalNegative: "-1500" },
  };
  for (const [pvpMode, expected] of Object.entries(expectations)) {
    const hit = modelHitChance({ hit: "0", evasion: "10000", pvpMode });
    const critical = modelCriticalContest({ criticalHit: "10000", endurance: "0", pvpMode });
    const glance = modelCriticalContest({ criticalHit: "0", endurance: "10000", pvpMode });
    assert.equal(hit.inputs.effectiveDifference, expected.hitNegative);
    assert.equal(critical.inputs.effectiveDifference, expected.criticalPositive);
    assert.equal(glance.inputs.effectiveDifference, expected.criticalNegative);
    assert.equal(hit.inputs.capApplied, true);
    assert.equal(critical.inputs.capApplied, true);
    assert.equal(glance.inputs.capApplied, true);
  }
});

test("Critical and glance are mutually exclusive sides of the contest", () => {
  assert.deepEqual(
    (({ criticalChance, glanceChance, normalRollChance }) => ({ criticalChance, glanceChance, normalRollChance }))(modelCriticalContest({ criticalHit: "1500", endurance: "500" })),
    { criticalChance: "0.5", glanceChance: "0", normalRollChance: "0.5" },
  );
  const glance = modelCriticalContest({ criticalHit: "500", endurance: "1500" });
  assert.equal(glance.criticalChance, "0");
  assert.equal(glance.glanceChance, "0.5");
});

test("defense uses an explicit caller-selected level constant", () => {
  assert.equal(modelDefenseMultiplier({ defense: "2750", constant: "2750" }).value, "0.5");
  assert.throws(() => modelDefenseMultiplier({ defense: "2750" }), /constant is required/);
});

test("critical damage resistance cannot reduce below base critical damage", () => {
  assert.equal(modelCriticalDamageMultiplier({ criticalDamage: "80", resistance: "30" }).value, "1.5");
  assert.equal(modelCriticalDamageMultiplier({ criticalDamage: "30", resistance: "80" }).value, "1");
});

test("Heavy bonus is reduced point-for-point with a 150 percent floor", () => {
  assert.equal(modelHeavyDamageMultiplier({ heavyDamageBonus: "128.4", resistance: "20" }).value, "2.084");
  assert.equal(modelHeavyDamageMultiplier({ heavyDamageBonus: "60", resistance: "40" }).value, "1.5");
});

test("glancing is a positive Endurance difference probability", () => {
  const glance = modelGlanceChance({ endurance: "1500", criticalHit: "500" });
  assert.equal(glance.value, "0.5");
  assert.equal(glance.outcome, "select_minimum_base_damage");
  assert.equal(modelGlanceChance({ endurance: "500", criticalHit: "1500" }).value, "0");
});

test("Heavy Evasion subtracts before the modeled common curve", () => {
  const result = modelHeavyAttackChance({ heavyAttackChance: "800", heavyAttackEvasion: "400" });
  assert.equal(result.value, "0.285714");
  assert.equal(result.confidence, "medium");
  assert.equal(modelHeavyAttackChance({ heavyAttackChance: "400", heavyAttackEvasion: "800" }).value, "0");
});

test("Heavy contest caps are explicit caller inputs, never silently assumed", () => {
  assert.equal(modelHeavyAttackChance({ heavyAttackChance: "5000", heavyAttackEvasion: "0" }).value, "0.833333");
  assert.equal(modelHeavyAttackChance({ heavyAttackChance: "5000", heavyAttackEvasion: "0", differenceCap: "3000" }).value, "0.75");
  const arena = modelHeavyAttackChance({ heavyAttackChance: "5000", heavyAttackEvasion: "0", pvpMode: "arena" });
  assert.equal(arena.value, "0.692307");
  assert.deepEqual(arena.exactStages, ["official_mode_specific_difference_cap"]);
  assert.throws(() => modelHeavyAttackChance({ heavyAttackChance: "5000", heavyAttackEvasion: "0", pvpMode: "arena", differenceCap: "3000" }), /not both/);
});
