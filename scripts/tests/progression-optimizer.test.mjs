import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";
import * as core from "../../web/tl-core.js";
import {
  normalizeProgressionSettings,
  optimizeScratchProgression,
  PROVEN_REPRESENTABLE_UNIFIED_MASTERY_IDS,
  representableUnifiedMasteryIds,
} from "../../web/optimizer/tl-progression-optimizer.js";
import { executeOptimizerTask, optimizeProgressionFinalistTask } from "../../web/optimizer/tl-full-build-adapter.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const data = await loadWebDataFromFile(path.join(root, "web", "data", "app-data.json"));
await core.initCore(data);

const totalMap = (build, options = {}) => Object.fromEntries(core.calculateBuild(build, {}, { includeSetEffects: true, ...options }).stats
  .map((row) => [row.id, Number(row.total) || 0]));
const score = (stats) => Number(stats.skill_cooldown_modifier ?? 0)
  + Number(stats.melee_accuracy ?? 0)
  + Number(stats.pvp_melee_critical_defense ?? 0);

const rowsToTotals = (rows) => Object.fromEntries(rows.map((row) => [row.id, Number(row.total) || 0]));

test("scratch progression generates only legal passives and independently budgeted weapon masteries", () => {
  const result = optimizeScratchProgression({
    core,
    build: core.createInitialBuild(),
    weapons: ["sword", "sword2h"],
    settings: {
      enabled: true,
      skillLevelCap: 15,
      masteryPointsByWeapon: { sword: 95, sword2h: 140 },
      includePotential: false,
    },
    evaluate: totalMap,
    score,
  });

  assert.equal(result.build.skills.length, core.PASSIVE_SKILL_CAP);
  assert.ok(result.build.skills.every((selection) => selection.loadoutType === "passive"));
  assert.ok(result.build.skills.every((selection) => selection.level <= 15));
  assert.ok(result.build.skills.every((selection) => selection.specializationIds.length === 0));
  assert.deepEqual(result.build.unifiedMasteries, []);

  for (const [weapon, expected] of [["sword", 95], ["sword2h", 140]]) {
    const state = core.masteryWeaponPointState(weapon, result.build);
    assert.equal(state.totalPoints, expected);
    assert.ok(state.totalPoints <= core.MASTERY_POINT_BUDGET);
    assert.ok(Object.values(state.synergyCountByTier).every((count) => count <= 2));
    assert.ok(state.epicSelected.length <= 2);

    const reconciled = structuredClone(result.build);
    assert.deepEqual(core.reconcileMasterySelections(weapon, reconciled), []);
  }
  assert.equal(core.calculateBuild(result.build, {}, { progressionWeaponTypes: ["sword", "sword2h"] }).status.state, "legal");
});

test("overall mastery Potential is explicit and mastery inputs clamp to legal limits", () => {
  const result = optimizeScratchProgression({
    core,
    build: core.createInitialBuild(),
    weapons: ["sword", "sword2h"],
    settings: {
      enabled: true,
      skillLevelCap: 999,
      masteryPointsByWeapon: { sword: 999, sword2h: -10 },
      includePotential: true,
    },
    evaluate: totalMap,
    score,
  });

  assert.equal(result.settings.skillLevelCap, 20);
  assert.equal(result.settings.overallMasteryLevel, 520);
  assert.equal(Object.hasOwn(result.settings, "includePotential"), false);
  assert.equal(core.masteryWeaponPointState("sword", result.build).totalPoints, core.MASTERY_POINT_BUDGET);
  assert.equal(core.masteryWeaponPointState("sword2h", result.build).totalPoints, 0);
  assert.deepEqual(result.build.unifiedMasteries, ["WM_Common_SKILL_007"]);
  assert.equal(result.build.overallMasteryLevel, core.indexes.masteryById.WM_Common_SKILL_007.requiredLevel);
  assert.equal(core.calculateBuild(result.build, {}).status.state, "legal");
});

test("overall mastery normalization prefers an explicit safe level and migrates legacy Potential", () => {
  assert.equal(normalizeProgressionSettings(core, [], {}).overallMasteryLevel, 0);
  assert.equal(normalizeProgressionSettings(core, [], { includePotential: true }).overallMasteryLevel, 520);
  assert.equal(normalizeProgressionSettings(core, [], { includePotential: true, overallMasteryLevel: 1300 }).overallMasteryLevel, 1300);
  assert.equal(normalizeProgressionSettings(core, [], { includePotential: true, overallMasteryLevel: -1 }).overallMasteryLevel, 0);
  assert.equal(normalizeProgressionSettings(core, [], { overallMasteryLevel: 1.5 }).overallMasteryLevel, 0);
  assert.equal(normalizeProgressionSettings(core, [], { overallMasteryLevel: Number.MAX_SAFE_INTEGER + 1 }).overallMasteryLevel, 0);
});

test("unified mastery proof contract is limited to Potential and Shielded by Unity", () => {
  assert.equal(core.unifiedMasteryNodes().length, 24);
  assert.deepEqual(representableUnifiedMasteryIds(core), PROVEN_REPRESENTABLE_UNIFIED_MASTERY_IDS);
  assert.deepEqual(PROVEN_REPRESENTABLE_UNIFIED_MASTERY_IDS, ["WM_Common_SKILL_007", "WM_Common_SKILL_020"]);
});

test("all unlocked unified nodes receive singleton evaluation but unsupported value cannot enter a build", () => {
  const singletonIds = new Set();
  const subsetSignatures = new Set();
  const supported = new Set(PROVEN_REPRESENTABLE_UNIFIED_MASTERY_IDS);
  const result = optimizeScratchProgression({
    core,
    build: core.createInitialBuild(),
    weapons: [],
    settings: { enabled: false, overallMasteryLevel: 1560 },
    evaluate(candidate) {
      const ids = [...candidate.unifiedMasteries].sort();
      if (ids.length === 1) singletonIds.add(ids[0]);
      if (ids.length > 1) subsetSignatures.add(ids.join("|"));
      return { objective: ids.some((id) => !supported.has(id)) ? 100 : ids.length ? 1 : 0 };
    },
    score: (stats) => stats.objective,
  });

  assert.deepEqual([...singletonIds].sort(), core.unifiedMasteryNodes().map((row) => row.id).sort());
  assert.ok(subsetSignatures.has("WM_Common_SKILL_007|WM_Common_SKILL_020"));
  assert.deepEqual(result.build.unifiedMasteries, ["WM_Common_SKILL_007"], "equal scores prefer fewer nodes, then lexicographic IDs");
  assert.equal(core.effectiveProgression(result.build).issues.length, 0);
});

test("Potential is scoreable at exactly Overall Mastery Level 520", () => {
  const optimize = (overallMasteryLevel) => optimizeScratchProgression({
    core,
    build: core.createInitialBuild(),
    weapons: [],
    settings: { enabled: false, overallMasteryLevel },
    evaluate: totalMap,
    score: (stats) => ["str", "dex", "int", "per", "con"].reduce((sum, id) => sum + Number(stats[id] ?? 0), 0),
  });
  assert.deepEqual(optimize(519).build.unifiedMasteries, []);
  assert.deepEqual(optimize(520).build.unifiedMasteries, ["WM_Common_SKILL_007"]);
});

test("Shielded by Unity wins a fully specified nearby-ally shield scenario", () => {
  const base = core.createInitialBuild();
  const scenario = core.createBuildScenario(base, {
    targetDistanceMeters: 2,
    sourceParty: { state: "observed", totalMembersIncludingSelf: 2 },
    sourceProximity: { state: "observed", counts: [
      { cohort: "allied_nonparty_player", comparator: "lte", radiusMeters: "4", count: 0 },
      { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "4", count: 1 },
      { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "16", count: 1 },
    ] },
  });
  const evaluate = (candidate) => {
    const bound = core.bindCombatScenarioToBuild(scenario, candidate, []);
    const calculation = core.calculateBuild(candidate, {}, { progressionWeaponTypes: [], scenario: bound });
    return rowsToTotals(calculation.scenarioStats ?? calculation.stats);
  };
  const optimize = (overallMasteryLevel) => optimizeScratchProgression({
    core,
    build: base,
    weapons: [],
    settings: { enabled: false, overallMasteryLevel },
    evaluate,
    score: (stats) => Number(stats.shield_taken_modifier ?? 0),
  });

  assert.deepEqual(optimize(1299).build.unifiedMasteries, []);
  const result = optimize(1300);
  assert.deepEqual(result.build.unifiedMasteries, ["WM_Common_SKILL_020"]);
  assert.equal(evaluate(result.build).shield_taken_modifier, 500);
  assert.equal(core.effectiveProgression(result.build).issues.length, 0);
});

test("optimize_progression worker dispatch matches the local canonical fallback after structured cloning", () => {
  const payload = { build: core.createInitialBuild(), attributes: { str: 0, dex: 0, int: 0, per: 0, con: 0 } };
  const rankedGoals = [{ id: "str", rank: 1, weight: 1, mode: "maximize", minimum: null, target: null, components: ["str"] }];
  const context = {
    weapons: [],
    settings: { enabled: false, overallMasteryLevel: 520 },
    rankedGoals,
    baseline: { str: 0 },
    scales: { str: 1 },
    includeSetEffects: true,
    protectedStats: {},
    minimums: {},
    scenario: null,
  };
  const local = optimizeProgressionFinalistTask(core, structuredClone(payload), structuredClone(context));
  const dispatched = executeOptimizerTask(core, "optimize_progression", structuredClone(payload), structuredClone(context));
  assert.deepEqual(structuredClone(dispatched), structuredClone(local));
  assert.deepEqual(dispatched.build.unifiedMasteries, ["WM_Common_SKILL_007"]);
});

test("injected Overall Mastery legality enforces the cap and mutual exclusion during subset scoring", () => {
  const nodes = ["node-a", "node-b", "node-c", "node-d", "node-e"].map((id) => ({ id, requiredLevel: 0, specializationType: "unified" }));
  const nodeById = Object.fromEntries(nodes.map((row) => [row.id, row]));
  const injectedCore = {
    MASTERY_POINT_BUDGET: 220,
    UNIFIED_MASTERY_CAP: 4,
    indexes: { masteryById: nodeById },
    unifiedMasteryNodes: () => nodes,
    unifiedMasteryCounted: () => true,
    effectiveProgression(build) {
      const ids = [...new Set(build.unifiedMasteries ?? [])];
      const overCap = ids.length > injectedCore.UNIFIED_MASTERY_CAP;
      const excluded = ids.includes("node-a") && ids.includes("node-b");
      return {
        issues: [...(overCap ? [{ code: "unified_mastery_cap_exceeded" }] : []), ...(excluded ? [{ code: "unified_mastery_mutual_exclusion" }] : [])],
        unifiedMasteries: ids.map((masteryId) => ({ masteryId, mastery: nodeById[masteryId] })),
      };
    },
  };
  const result = optimizeScratchProgression({
    core: injectedCore,
    build: { skills: [], masteries: {}, unifiedMasteries: [], overallMasteryLevel: 0 },
    weapons: [],
    settings: { enabled: false, overallMasteryLevel: 0 },
    evaluate: (candidate) => ({ objective: candidate.unifiedMasteries.length }),
    score: (stats) => stats.objective,
  });
  assert.equal(result.build.unifiedMasteries.length, injectedCore.UNIFIED_MASTERY_CAP);
  assert.equal(result.build.unifiedMasteries.includes("node-a") && result.build.unifiedMasteries.includes("node-b"), false);
  assert.deepEqual(injectedCore.effectiveProgression(result.build).issues, []);
});

test("text-only persistent mastery effects participate in scratch progression scoring", () => {
  const result = optimizeScratchProgression({
    core,
    build: core.createInitialBuild(),
    weapons: ["crossbow"],
    settings: {
      enabled: true,
      skillLevelCap: 20,
      masteryPointsByWeapon: { crossbow: core.MASTERY_POINT_BUDGET },
      includePotential: false,
    },
    evaluate: totalMap,
    score: (stats) => Number(stats.move_speed_modifier ?? 0),
  });

  assert.equal(result.build.masteries.Crossbow_Hero_Tactic_04?.level, 10);
  const calculation = core.calculateBuild(result.build, {}, { progressionWeaponTypes: ["crossbow"] });
  assert.equal(calculation.status.state, "legal");
  assert.equal(calculation.stats.find((row) => row.id === "move_speed_modifier")?.sources
    .some((row) => row.sourceLabel === "Archenemy" && row.value === 800), true);
});

test("mastery-to-passive transformations receive joint route lookahead at the requested skill cap", () => {
  const result = optimizeScratchProgression({
    core,
    build: core.createInitialBuild(),
    weapons: ["gauntlet"],
    settings: {
      enabled: true,
      skillLevelCap: 1,
      masteryPointsByWeapon: { gauntlet: core.MASTERY_POINT_BUDGET },
      includePotential: false,
    },
    evaluate: totalMap,
    score: (stats) => Number(stats.attack_power_modifier ?? 0),
  });

  assert.equal(result.build.masteries.Gauntlet_High_Attack_Skill?.level, 1);
  assert.equal(result.build.skills.find((row) => row.skillId === "SkillSet_WP_GT_Passive_TauntMaster")?.level, 1);
  assert.equal(core.masteryWeaponPointState("gauntlet", result.build).totalPoints, core.MASTERY_POINT_BUDGET);
  const calculation = core.calculateBuild(result.build, {}, { progressionWeaponTypes: ["gauntlet"] });
  assert.equal(calculation.status.state, "legal");
  assert.equal(calculation.stats.find((row) => row.id === "attack_power_modifier")?.total, 160);
});

test("scratch mastery consumes every requested point across Epic unlock boundaries", () => {
  for (const weapon of core.WEAPON_TYPES.filter((candidate) => core.masteryRowsForWeapon(candidate).length)) {
    for (const pointBudget of [131, 140, 220]) {
      const result = optimizeScratchProgression({
        core,
        build: core.createInitialBuild(),
        weapons: [weapon],
        settings: {
          enabled: true,
          skillLevelCap: 20,
          masteryPointsByWeapon: { [weapon]: pointBudget },
          includePotential: false,
        },
        evaluate: () => ({}),
        score: () => 0,
      });

      assert.equal(result.summary.masteryPointsByWeapon[weapon], pointBudget, `${weapon} at ${pointBudget} points`);
      assert.equal(core.calculateBuild(result.build, {}, { progressionWeaponTypes: [weapon] }).status.state, "legal");
    }
  }
});
