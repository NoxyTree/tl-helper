import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";
import * as core from "../../web/tl-core.js";
import { createOptimizerAdapter } from "../../web/optimizer/tl-full-build-adapter.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const data = await loadWebDataFromFile(path.join(root, "web", "data", "app-data.json"));
await core.initCore(data);

function equip(build, slotId, itemId) {
  const item = core.indexes.itemById[itemId];
  assert.ok(item, `Missing fixture item ${itemId}`);
  build.equipment[slotId] = { ...core.emptyEquipmentSelection(), itemId, level: core.itemMaxLevel(item) };
}

const row = (calculation, statId, scenario = false) => (scenario ? calculation.scenarioStats : calculation.stats)
  .find((entry) => entry.id === statId);

test("Kowazan Bombing updates both Attack Speed modifier and derived weapon interval", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "crossbow_aa_t5_boss_001");
  const staticCalculation = core.calculateBuild(build, {});
  const scenario = core.createBuildScenario(build, { targetDistanceMeters: 10, timeOfDay: "day" });
  const calculated = core.calculateBuild(build, {}, { scenario });

  assert.equal(calculated.scenarioEffects.status, "applied");
  assert.equal(calculated.scenarioEffects.timeOfDay, "day");
  assert.equal(row(calculated, "attack_speed_modifier", true).total - row(staticCalculation, "attack_speed_modifier").total, 1200);
  assert.ok(row(calculated, "attack_speed_main_hand", true).total < row(staticCalculation, "attack_speed_main_hand").total);

  const speedRow = row(calculated, "attack_speed_main_hand", true);
  const preFinalSpeed = speedRow.sources.filter((source) => source.type !== "attack_speed").reduce((sum, source) => sum + source.value, 0);
  const ratio = row(calculated, "attack_speed_modifier", true).total / 10000;
  assert.ok(Math.abs(speedRow.total - preFinalSpeed / (1 + ratio)) < 1e-9);
  assert.deepEqual(row(staticCalculation, "attack_speed_modifier").sources.filter((source) => source.type === "scenario_effect"), []);
});

test("scenario Attack Speed is capped before the dependent weapon interval is derived", () => {
  const build = core.createInitialBuild();
  const fixture = {
    main_hand: "crossbow_aa_t5_boss_001",
    off_hand: "dagger_aa_t2_raid_001",
    head: "head_aa_S1_fabric_003",
    chest: "chest_aa_S1_fabric_rift_001",
    hands: "hands_aa_S1_fabric_003",
    legs: "legs_aa_S1_fabric_002",
    feet: "feet_leather_aa_t2_boss_001",
    cloak: "cloak_aa_t3_nomal_005",
    necklace: "necklace_aa_t3_normal_008",
    bracelet: "bracelet_aa_t1_Arena_001",
    belt: "belt_aa2_t1_normal_012",
    ring_1: "ring_aa_t2_raid_001",
    ring_2: "ring_aa_S1_008",
  };
  for (const [slotId, itemId] of Object.entries(fixture)) equip(build, slotId, itemId);
  const calculation = core.calculateBuild(build, { dex: 20 }, {
    scenario: core.createBuildScenario(build, { targetDistanceMeters: 2, timeOfDay: "day" }),
  });
  const modifier = row(calculation, "attack_speed_modifier", true);
  const interval = row(calculation, "attack_speed_main_hand", true);

  assert.equal(modifier.total, 15000);
  assert.equal(modifier.uncappedTotal, 15530);
  assert.equal(modifier.overflow, 530);
  assert.equal(modifier.sources.find((source) => source.type === "scenario_effect").value, 1200);
  assert.equal(modifier.sources.find((source) => source.type === "hard_cap").value, -530);
  assert.equal(interval.total, 220);
});

test("Gear Viewer contribution and optimizer current totals use the same day and night values", async () => {
  const build = core.createInitialBuild();
  const ordinaryCrossbow = data.items.find((item) => item.equipmentType === "crossbow" && item.id !== "crossbow_aa_t5_boss_001");
  assert.ok(ordinaryCrossbow, "Missing ordinary Crossbow fixture");
  equip(build, "main_hand", ordinaryCrossbow.id);
  const kowazan = core.indexes.itemById.crossbow_aa_t5_boss_001;
  const selection = { ...core.emptyEquipmentSelection(), itemId: kowazan.id, level: core.itemMaxLevel(kowazan) };
  const staticContribution = core.slotSelectionContribution("main_hand", selection, build, {});
  const dayScenario = core.createBuildScenario(build, { targetDistanceMeters: 2, timeOfDay: "day" });
  const nightScenario = core.createBuildScenario(build, { targetDistanceMeters: 2, timeOfDay: "night" });
  const dayContribution = core.slotSelectionContribution("main_hand", selection, build, {}, { scenario: dayScenario });
  const nightContribution = core.slotSelectionContribution("main_hand", selection, build, {}, { scenario: nightScenario });

  assert.equal((dayContribution.attack_speed_modifier ?? 0) - (staticContribution.attack_speed_modifier ?? 0), 1200);
  assert.equal((nightContribution.attack_speed_modifier ?? 0) - (staticContribution.attack_speed_modifier ?? 0), 600);
  assert.ok(dayContribution.attack_speed_main_hand < nightContribution.attack_speed_main_hand);
  assert.ok(nightContribution.attack_speed_main_hand < staticContribution.attack_speed_main_hand);

  const candidateBuild = structuredClone(build);
  candidateBuild.equipment.main_hand = selection;
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const dayStats = await adapter.currentStats({ build: candidateBuild, attributes: {} }, {
    scenario: core.bindCombatScenarioToBuild(dayScenario, candidateBuild),
  });
  const nightStats = await adapter.currentStats({ build: candidateBuild, attributes: {} }, {
    scenario: core.bindCombatScenarioToBuild(nightScenario, candidateBuild),
  });
  assert.equal(dayStats.attack_speed_modifier.value - nightStats.attack_speed_modifier.value, 600);
});

test("Kowazan Madness uses distinct day and night melee Critical Hit Chance", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "dagger_aa_t5_boss_001");
  const staticCalculation = core.calculateBuild(build, {});
  const day = core.calculateBuild(build, {}, { scenario: core.createBuildScenario(build, { targetDistanceMeters: 2, timeOfDay: "day" }) });
  const night = core.calculateBuild(build, {}, { scenario: core.createBuildScenario(build, { targetDistanceMeters: 2, timeOfDay: "night" }) });

  assert.equal(row(day, "melee_critical_attack", true).total - row(staticCalculation, "melee_critical_attack").total, 1250);
  assert.equal(row(night, "melee_critical_attack", true).total - row(staticCalculation, "melee_critical_attack").total, 2500);
});

test("relevant unsupported time state and shared abnormalities fail the complete scenario closed", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "dagger_aa_t5_boss_001");
  const unspecified = core.calculateBuild(build, {}, { scenario: core.createTargetDistanceScenario(build, 10) });
  assert.equal(unspecified.scenarioEffects.status, "unsupported");
  assert.deepEqual(unspecified.scenarioEffects.appliedRows, []);
  assert.equal(unspecified.scenarioStats, unspecified.stats);
  assert.ok(unspecified.scenarioEffects.errors.some((error) => error.code === "unsupported_time_of_day"));

  equip(build, "off_hand", "dagger_aa_t3_boss_002");
  const conflict = core.calculateBuild(build, {}, { scenario: core.createBuildScenario(build, { targetDistanceMeters: 10, timeOfDay: "day" }) });
  assert.equal(conflict.scenarioEffects.status, "unsupported");
  assert.ok(conflict.scenarioEffects.errors.some((error) => error.code === "shared_abnormal_conflict"));
});

test("one family error prevents partial application from every scenario family", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "dagger_aa_t5_boss_001");
  const bow = data.items.find((item) => item.equipmentType === "bow");
  equip(build, "off_hand", bow.id);
  build.skills = [{ skillId: "SkillSet_WP_BO_S_DistanceCritical", level: 20, loadoutType: "passive" }];

  const calculated = core.calculateBuild(build, {}, { scenario: core.createTargetDistanceScenario(build, 10) });
  assert.equal(calculated.scenarioEffects.status, "unsupported");
  assert.ok(calculated.scenarioEffects.evaluatedRows.some((effect) => effect.effectId === "SkillSet_WP_BO_S_DistanceCritical"));
  assert.deepEqual(calculated.scenarioEffects.appliedRows, []);
  assert.equal(calculated.scenarioStats, calculated.stats);
});

test("time-of-day state participates in canonical scenario cache identity", async () => {
  const { scenarioCalculationFingerprint } = await import("../../web/tl-build-snapshot.js");
  const build = core.createInitialBuild();
  equip(build, "main_hand", "dagger_aa_t5_boss_001");
  const day = core.createBuildScenario(build, { targetDistanceMeters: 10, timeOfDay: "day" });
  const night = core.createBuildScenario(build, { targetDistanceMeters: 10, timeOfDay: "night" });
  assert.notEqual(
    scenarioCalculationFingerprint({ build, scenario: day }),
    scenarioCalculationFingerprint({ build, scenario: night }),
  );
  const reorderedDay = structuredClone(day);
  reorderedDay.participants.reverse();
  assert.equal(
    scenarioCalculationFingerprint({ build, scenario: day }),
    scenarioCalculationFingerprint({ build, scenario: reorderedDay }),
  );
});

test("scratch optimizer rebinds the scenario to each concrete weapon finalist", async () => {
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const scratch = await adapter.createScratchBuild({ attributes: {} });
  const scenario = core.createBuildScenario(scratch.build, { targetDistanceMeters: 2, timeOfDay: "day" });
  const result = await adapter.optimize({
    build: scratch,
    sourceKind: "scratch",
    weaponTypes: ["crossbow", "dagger"],
    goals: { priorities: [{ id: "attack_speed_modifier", rank: 1, mode: "maximize" }], protect: [] },
    rules: {
      minimumItemLevel: 0,
      includeSetEffects: false,
      runes: { mode: "keep" },
      artifacts: { mode: "keep" },
    },
    scenario,
    depth: "fast",
  });
  const sourceParticipant = result.scenario.participants.find((participant) => participant.id === result.scenario.source.participantId);

  assert.equal(result.scenarioEffects.status, "applied");
  assert.deepEqual(sourceParticipant.equippedWeaponTypes, ["crossbow", "dagger"]);
  assert.deepEqual([...core.equippedWeaponTypes(result.build)].sort(), ["crossbow", "dagger"]);
});
