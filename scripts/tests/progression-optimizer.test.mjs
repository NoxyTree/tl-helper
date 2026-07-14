import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";
import * as core from "../../web/tl-core.js";
import { optimizeScratchProgression } from "../../web/tl-progression-optimizer.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const data = await loadWebDataFromFile(path.join(root, "web", "data", "app-data.json"));
await core.initCore(data);

const totalMap = (build) => Object.fromEntries(core.calculateBuild(build, {}, { includeSetEffects: true }).stats
  .map((row) => [row.id, Number(row.total) || 0]));
const score = (stats) => Number(stats.skill_cooldown_modifier ?? 0)
  + Number(stats.melee_accuracy ?? 0)
  + Number(stats.pvp_melee_critical_defense ?? 0);

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
  assert.equal(core.masteryWeaponPointState("sword", result.build).totalPoints, core.MASTERY_POINT_BUDGET);
  assert.equal(core.masteryWeaponPointState("sword2h", result.build).totalPoints, 0);
  assert.deepEqual(result.build.unifiedMasteries, ["WM_Common_SKILL_007"]);
  assert.equal(result.build.overallMasteryLevel, core.indexes.masteryById.WM_Common_SKILL_007.requiredLevel);
  assert.equal(core.calculateBuild(result.build, {}).status.state, "legal");
});
