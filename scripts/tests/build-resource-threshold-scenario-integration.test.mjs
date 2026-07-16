import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";
import * as core from "../../web/tl-core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const data = await loadWebDataFromFile(path.join(root, "web", "data", "app-data.json"));
await core.initCore(data);

function equip(build, slotId, itemId) {
  const item = core.indexes.itemById[itemId];
  assert.ok(item, `Missing fixture item ${itemId}`);
  build.equipment[slotId] = { ...core.emptyEquipmentSelection(), itemId, level: core.itemMaxLevel(item) };
}

const total = (calculation, statId, scenario = false) => ((scenario ? calculation.scenarioStats : calculation.stats)
  .find((row) => row.id === statId)?.total ?? 0);

test("Critical Equilibrium is scenario-only and respects the exact 50 percent branch", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "sword2h_c_t1_nomal_001");
  build.masteries = { Sword2h_Hero_Attack_01: { level: 10 } };
  const persistent = core.calculateBuild(build, {});
  const low = core.calculateBuild(build, {}, {
    scenario: core.createBuildScenario(build, { targetDistanceMeters: 2, sourceHealthRatioBps: 4999 }),
  });
  const boundary = core.calculateBuild(build, {}, {
    scenario: core.createBuildScenario(build, { targetDistanceMeters: 2, sourceHealthRatioBps: 5000 }),
  });

  assert.equal(low.scenarioEffects.status, "applied");
  assert.equal(boundary.scenarioEffects.status, "applied");
  assert.equal(total(low, "critical_damage_taken_modifier", true) - total(persistent, "critical_damage_taken_modifier"), 1200);
  assert.equal(total(low, "critical_damage_dealt_modifier", true), total(persistent, "critical_damage_dealt_modifier"));
  assert.equal(total(boundary, "critical_damage_dealt_modifier", true) - total(persistent, "critical_damage_dealt_modifier"), 1200);
  assert.equal(total(boundary, "critical_damage_taken_modifier", true), total(persistent, "critical_damage_taken_modifier"));
  assert.equal(
    persistent.stats.flatMap((row) => row.sources).some((source) => source.type === "scenario_effect"),
    false,
  );
});

test("Tranquil Will is exact at 33 percent and absent above the threshold", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "orb_b_t1_normal_001");
  build.masteries = { Orb_Rare_Util_Skill: { level: 1 } };
  const persistent = core.calculateBuild(build, {});
  const active = core.calculateBuild(build, {}, {
    scenario: core.createBuildScenario(build, { targetDistanceMeters: 2, sourceManaRatioBps: 3300 }),
  });
  const inactive = core.calculateBuild(build, {}, {
    scenario: core.createBuildScenario(build, { targetDistanceMeters: 2, sourceManaRatioBps: 3301 }),
  });

  assert.equal(total(active, "cost_consumption_modifier", true) - total(persistent, "cost_consumption_modifier"), 1500);
  assert.equal(total(inactive, "cost_consumption_modifier", true), total(persistent, "cost_consumption_modifier"));
  assert.ok(inactive.scenarioEffects.trace.some((row) => row.code === "resource_threshold_inactive"));
});

test("missing relevant source resource fails the complete overlay closed", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "sword2h_c_t1_nomal_001");
  build.masteries = { Sword2h_Hero_Attack_01: { level: 10 } };
  const result = core.calculateBuild(build, {}, {
    scenario: core.createBuildScenario(build, { targetDistanceMeters: 2 }),
  });
  assert.equal(result.scenarioEffects.status, "unsupported");
  assert.deepEqual(result.scenarioEffects.appliedRows, []);
  assert.equal(result.scenarioStats, result.stats);
  assert.ok(result.scenarioEffects.errors.some((row) => row.code === "missing_scenario_resource_state"));
});

test("foreign stored masteries remain inactive and cannot request resource state", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "orb_b_t1_normal_001");
  build.masteries = { Sword2h_Hero_Attack_01: { level: 10 } };
  const result = core.calculateBuild(build, {}, {
    scenario: core.createBuildScenario(build, { targetDistanceMeters: 2 }),
  });
  assert.equal(result.scenarioEffects.status, "applied");
  assert.deepEqual(result.scenarioEffects.errors, []);
  assert.equal(result.scenarioEffects.evaluatedRows.length, 0);
});

test("source resource ratios are canonical dimensions and participate in cache identity", async () => {
  const { scenarioCalculationFingerprint } = await import("../../web/tl-build-snapshot.js");
  const build = core.createInitialBuild();
  equip(build, "main_hand", "sword2h_c_t1_nomal_001");
  const low = core.createBuildScenario(build, { targetDistanceMeters: 2, sourceHealthRatioBps: 4999 });
  const high = core.createBuildScenario(build, { targetDistanceMeters: 2, sourceHealthRatioBps: 5000 });
  assert.notEqual(core.combatScenarioCacheKey(low), core.combatScenarioCacheKey(high));
  assert.notEqual(
    scenarioCalculationFingerprint({ build, scenario: low }),
    scenarioCalculationFingerprint({ build, scenario: high }),
  );
  const calculated = core.calculateBuild(build, {}, { scenario: low });
  assert.deepEqual(calculated.scenarioEffects.dimensions.sourceResources, { health: { currentRatioBps: 4999 } });
});

test("scenario source participant must remain the calculated self", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "sword2h_c_t1_nomal_001");
  const scenario = structuredClone(core.createBuildScenario(build, { targetDistanceMeters: 2, sourceHealthRatioBps: 5000 }));
  const source = scenario.participants.find((participant) => participant.id === scenario.source.participantId);
  source.relationship = "ally";
  const result = core.calculateBuild(build, {}, { scenario });
  assert.equal(result.scenarioEffects.status, "unsupported");
  assert.deepEqual(result.scenarioEffects.errors.map((row) => row.code), ["scenario_source_relationship_mismatch"]);
});
