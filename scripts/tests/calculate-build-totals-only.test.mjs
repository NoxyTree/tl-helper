// calculateBuild({totalsOnly:true}) must be an exact, presentation-free twin
// of the full calculation: identical stat totals (including scenario overlays
// and progression-driven passives/masteries) with none of the source rows,
// validation, status, or set-effect trace the optimizer inner loops ignore.
// The optimizer's progression stage relies on this equality being byte-exact.
import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as core from "../../web/tl-core.js";
import { DISTANCE_EFFECT_IDS } from "../../web/tl-distance-scenario-effects.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appData = await loadWebDataFromFile(join(repoRoot, "web", "data", "app-data.json"));
await core.initCore(appData);

const attributes = { str: 23, dex: 41, int: 17, per: 39, con: 31 };
const totals = (rows) => Object.fromEntries(rows.map((row) => [row.id, Number(row.total) || 0]));

function selection(item) {
  return { ...core.emptyEquipmentSelection(), itemId: item.id, level: core.itemMaxLevel(item) };
}

function firstWeapon(type) {
  const item = appData.items.find((row) => row.equipmentType === type);
  assert.ok(item, `missing ${type} fixture`);
  return item;
}

function setPieceBuild() {
  const build = core.createInitialBuild();
  for (const [slot, itemId] of [
    ["head", "head_aa_S1_plate_003"],
    ["chest", "chest_aa_S1_plate_003"],
    ["hands", "hands_aa_S1_plate_003"],
    ["legs", "legs_aa_S1_plate_003"],
  ]) {
    build.equipment[slot] = selection(core.indexes.itemById[itemId]);
  }
  return build;
}

function progressionBuild() {
  const build = core.createInitialBuild();
  build.equipment.main_hand = selection(firstWeapon("sword"));
  const masteries = core.masteryRowsForWeapon("sword").filter((row) => row.specializationType === "normal" && row.grade !== 41);
  assert.ok(masteries.length >= 3, "sword mastery fixtures are required");
  build.masteries = Object.fromEntries(masteries.slice(0, 3).map((row) => [row.id, { level: 1 }]));
  const passive = core.availableSkillsForWeapons(["sword"]).find((skill) => core.skillLoadoutType(skill) === "passive");
  assert.ok(passive, "a sword passive skill fixture is required");
  build.skills = [{ skillId: passive.id, level: Math.min(core.skillBandedMax(passive), 20), loadoutType: "passive" }];
  return build;
}

function assertTotalsTwin(build, options) {
  const full = core.calculateBuild(build, attributes, options);
  const lean = core.calculateBuild(build, attributes, { ...options, totalsOnly: true });
  assert.deepEqual(totals(lean.stats), totals(full.stats), `stats totals diverge for ${JSON.stringify(options)}`);
  if (Object.hasOwn(full, "scenarioStats")) {
    assert.deepEqual(totals(lean.scenarioStats), totals(full.scenarioStats), "scenarioStats totals diverge");
  } else {
    assert.equal(Object.hasOwn(lean, "scenarioStats"), false);
  }
  return { full, lean };
}

test("totalsOnly matches the full calculation for set-effect builds", () => {
  assertTotalsTwin(setPieceBuild(), { includeSetEffects: true });
  assertTotalsTwin(setPieceBuild(), { includeSetEffects: false });
});

test("totalsOnly matches the full calculation for progression builds with weapon families", () => {
  assertTotalsTwin(progressionBuild(), { includeSetEffects: true, progressionWeaponTypes: ["sword", "sword2h"] });
});

test("totalsOnly matches scenario overlay totals", () => {
  const build = core.createInitialBuild();
  build.equipment.main_hand = selection(firstWeapon("bow"));
  build.skills = [{ skillId: DISTANCE_EFFECT_IDS.SNIPERS_SENSE, level: 20, loadoutType: "passive" }];
  const { full, lean } = assertTotalsTwin(build, { scenario: core.createTargetDistanceScenario(build, 6) });
  const overlayDelta = (rows) => (totals(rows.scenarioStats).all_critical_attack ?? 0) - (totals(rows.stats).all_critical_attack ?? 0);
  assert.ok(overlayDelta(full) > 0, "fixture scenario must apply an overlay");
  assert.equal(overlayDelta(lean), overlayDelta(full));
});

test("totalsOnly omits every presentation product and marks itself", () => {
  const lean = core.calculateBuild(setPieceBuild(), attributes, { totalsOnly: true });
  assert.equal(lean.totalsOnly, true);
  for (const key of ["validation", "status", "setEffects", "runeSynergies", "calculationContext"]) {
    assert.equal(Object.hasOwn(lean, key), false, `${key} should be skipped in totalsOnly mode`);
  }
  assert.deepEqual(lean.stats.flatMap((row) => row.sources), [], "totalsOnly must not accumulate source rows");
});
