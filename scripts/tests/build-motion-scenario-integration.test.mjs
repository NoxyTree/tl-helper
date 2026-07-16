import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";
import * as core from "../../web/tl-core.js";
import { MOTION_EFFECT_IDS } from "../../web/tl-motion-scenario-effects.js";

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

test("Rapidfire motion is scenario-only and preserved in cache identity", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "bow_c_t1_nomal_001");
  build.skills = [{ skillId: MOTION_EFFECT_IDS.RAPIDFIRE_STANCE, level: 20, loadoutType: "passive" }];
  const inactiveScenario = core.createBuildScenario(build, { targetDistanceMeters: 2, sourceMotion: { state: "stationary", stationaryBand: "under_2s" } });
  const activeScenario = core.createBuildScenario(build, { targetDistanceMeters: 2, sourceMotion: { state: "stationary", stationaryBand: "2s_to_under_3s" } });
  const persistent = core.calculateBuild(build, {});
  const active = core.calculateBuild(build, {}, { scenario: activeScenario });
  assert.equal(active.scenarioEffects.status, "applied");
  assert.equal(total(active, "attack_speed_modifier", true) - total(persistent, "attack_speed_modifier"), 2250);
  assert.equal(total(active, "all_accuracy", true) - total(persistent, "all_accuracy"), 1000);
  assert.notEqual(core.combatScenarioCacheKey(inactiveScenario), core.combatScenarioCacheKey(activeScenario));
  assert.deepEqual(active.scenarioEffects.dimensions.sourceMotion, { state: "stationary", stationaryBand: "2s_to_under_3s" });
});

test("missing relevant motion fails distance and motion overlays atomically closed", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "bow_c_t1_nomal_001");
  build.skills = [
    { skillId: MOTION_EFFECT_IDS.RAPIDFIRE_STANCE, level: 20, loadoutType: "passive" },
    { skillId: "SkillSet_WP_BO_S_DistanceCritical", level: 20, loadoutType: "passive" },
  ];
  const result = core.calculateBuild(build, {}, { scenario: core.createBuildScenario(build, { targetDistanceMeters: 10 }) });
  assert.equal(result.scenarioEffects.status, "unsupported");
  assert.ok(result.scenarioEffects.evaluatedRows.length > 0);
  assert.deepEqual(result.scenarioEffects.appliedRows, []);
  assert.equal(result.scenarioStats, result.stats);
});

test("effective progression excludes foreign stored motion passives", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "staff_c_t1_nomal_001");
  build.skills = [{ skillId: MOTION_EFFECT_IDS.RAPIDFIRE_STANCE, level: 20, loadoutType: "passive" }];
  const result = core.calculateBuild(build, {}, { scenario: core.createBuildScenario(build, { targetDistanceMeters: 2 }) });
  assert.equal(result.scenarioEffects.status, "applied");
  assert.deepEqual(result.scenarioEffects.errors, []);
});

test("Stigma conditional 15 percent requires four active pieces and respects includeSetEffects", () => {
  const build = core.createInitialBuild();
  for (const [slotId, itemId] of [
    ["head", "head_aa_S1_leather_001"],
    ["chest", "chest_aa_S1_leather_001"],
    ["hands", "hands_aa_S1_leather_001"],
    ["legs", "legs_aa_S1_leather_001"],
  ]) equip(build, slotId, itemId);
  const scenario = core.createBuildScenario(build, { targetDistanceMeters: 2, sourceMotion: { state: "stationary", stationaryBand: "4s_or_more" } });
  const persistent = core.calculateBuild(build, {});
  const active = core.calculateBuild(build, {}, { scenario });
  const excluded = core.calculateBuild(build, {}, { scenario, includeSetEffects: false });
  assert.equal(total(active, "critical_damage_dealt_modifier", true) - total(persistent, "critical_damage_dealt_modifier"), 1500);
  assert.equal(total(excluded, "critical_damage_dealt_modifier", true), total(excluded, "critical_damage_dealt_modifier"));
  assert.equal(active.scenarioEffects.evaluatedRows.filter((row) => row.effectId === MOTION_EFFECT_IDS.STIGMA_EXECUTOR_4).length, 1);
  assert.equal(excluded.scenarioEffects.evaluatedRows.filter((row) => row.effectId === MOTION_EFFECT_IDS.STIGMA_EXECUTOR_4).length, 0);
});

test("scenario rebinding changes source weapons and preserves participant motion", () => {
  const bow = core.createInitialBuild();
  const staff = core.createInitialBuild();
  equip(bow, "main_hand", "bow_c_t1_nomal_001");
  equip(staff, "main_hand", "staff_c_t1_nomal_001");
  const motion = { state: "moving", movementKind: "ordinary", movingBand: "under_2s", priorStationaryBand: "4s_or_more" };
  const rebound = core.bindCombatScenarioToBuild(core.createBuildScenario(bow, { targetDistanceMeters: 2, sourceMotion: motion }), staff);
  const source = rebound.participants.find((participant) => participant.id === rebound.source.participantId);
  assert.deepEqual(source.equippedWeaponTypes, ["staff"]);
  assert.deepEqual(source.motion, motion);
});
