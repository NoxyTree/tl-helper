import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as core from "../../web/tl-core.js";
import { DISTANCE_EFFECT_IDS } from "../../web/tl-distance-scenario-effects.js";
import { createOptimizerAdapter } from "../../web/optimizer/tl-full-build-adapter.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appData = await loadWebDataFromFile(join(repoRoot, "web", "data", "app-data.json"));
await core.initCore(appData);

const attributes = { str: 0, dex: 0, int: 0, per: 0, con: 0 };
const scenario = (build, targetDistanceMeters) => core.createTargetDistanceScenario(build, targetDistanceMeters);
const totals = (rows) => Object.fromEntries(rows.map((row) => [row.id, Number(row.total) || 0]));

function selection(item, perkId = "") {
  return { ...core.emptyEquipmentSelection(), itemId: item.id, level: core.itemMaxLevel(item), perkId };
}

function firstWeapon(type, excludeIds = []) {
  const item = appData.items.find((row) => row.equipmentType === type && !excludeIds.includes(row.id));
  assert.ok(item, `missing ${type} fixture`);
  return item;
}

test("scenario overlays leave persistent calculateBuild output unchanged when no scenario is supplied", () => {
  const build = core.createInitialBuild();
  build.equipment.main_hand = selection(firstWeapon("bow"));
  build.skills = [{ skillId: DISTANCE_EFFECT_IDS.SNIPERS_SENSE, level: 20, loadoutType: "passive" }];

  const persistent = core.calculateBuild(build, attributes);
  assert.equal(Object.hasOwn(persistent, "scenarioStats"), false);
  assert.equal(Object.hasOwn(persistent, "scenarioEffects"), false);

  const withScenario = core.calculateBuild(build, attributes, { scenario: scenario(build, 10) });
  assert.deepEqual(withScenario.stats, persistent.stats);
  assert.equal(withScenario.scenarioEffects.status, "applied");
  assert.equal((totals(withScenario.scenarioStats).all_critical_attack ?? 0) - (totals(persistent.stats).all_critical_attack ?? 0), 2650);
  assert.equal((totals(withScenario.scenarioStats).critical_damage_dealt_modifier ?? 0) - (totals(persistent.stats).critical_damage_dealt_modifier ?? 0), 400);
});

test("scenario expansion and source traces use the authoritative selected Bow passive", () => {
  const build = core.createInitialBuild();
  build.equipment.main_hand = selection(firstWeapon("bow"));
  build.skills = [{ skillId: DISTANCE_EFFECT_IDS.SNIPERS_SENSE, level: 20, loadoutType: "passive" }];
  const calc = core.calculateBuild(build, attributes, { scenario: scenario(build, 6) });
  const staticTotals = totals(calc.stats);
  const scenarioTotals = totals(calc.scenarioStats);

  for (const id of ["all_critical_attack", "melee_critical_attack", "range_critical_attack", "magic_critical_attack"]) {
    assert.equal((scenarioTotals[id] ?? 0) - (staticTotals[id] ?? 0), 265 * 6, `${id} did not receive the expanded overlay`);
  }
  const source = calc.scenarioStats.find((row) => row.id === "all_critical_attack").sources.find((row) => row.type === "scenario_effect");
  assert.equal(source.scenarioEffectId, DISTANCE_EFFECT_IDS.SNIPERS_SENSE);
  assert.equal(source.scenarioDistanceMeters, 6);
  assert.equal(source.provenance.formulaRowIds.includes("BO_DistanceCritical_CriticalChanceUp"), true);
});

test("foreign stored passives remain inactive in scenario calculation", () => {
  const build = core.createInitialBuild();
  build.equipment.main_hand = selection(firstWeapon("dagger"));
  build.skills = [{ skillId: DISTANCE_EFFECT_IDS.SNIPERS_SENSE, level: 20, loadoutType: "passive" }];
  const calc = core.calculateBuild(build, attributes, { scenario: scenario(build, 10) });

  assert.equal(calc.scenarioEffects.status, "applied");
  assert.equal(calc.scenarioEffects.appliedRows.length, 0);
  assert.deepEqual(calc.scenarioStats, calc.stats);
});

test("Black Rage innate and selected Skill Core routes receive identical scenario value", () => {
  const innateItem = core.indexes.itemById.staff_a_t3_mythicbeast_003;
  const coreItem = core.indexes.itemById.staff_aa_t2_raid_001;
  assert.ok(innateItem && coreItem);
  const blackRageCore = coreItem.availablePerks.find((perk) => perk.passive?.id === DISTANCE_EFFECT_IDS.BLACK_RAGE);
  assert.ok(blackRageCore);

  const innateBuild = core.createInitialBuild();
  innateBuild.equipment.main_hand = selection(innateItem);
  const coreBuild = core.createInitialBuild();
  coreBuild.equipment.main_hand = selection(coreItem, blackRageCore.id);

  const innate = core.calculateBuild(innateBuild, attributes, { scenario: scenario(innateBuild, 7.5) });
  const selectedCore = core.calculateBuild(coreBuild, attributes, { scenario: scenario(coreBuild, 7.5) });
  assert.equal((totals(innate.scenarioStats).all_critical_attack ?? 0) - (totals(innate.stats).all_critical_attack ?? 0), 1500);
  assert.equal((totals(selectedCore.scenarioStats).all_critical_attack ?? 0) - (totals(selectedCore.stats).all_critical_attack ?? 0), 1500);
  assert.deepEqual(selectedCore.scenarioEffects.appliedRows[0].sourceKinds, ["selected_core"]);
});

test("Gear Viewer contribution and Skill Core variants are scenario aware", () => {
  const blackRage = core.indexes.itemById.staff_a_t3_mythicbeast_003;
  const calanthia = core.indexes.itemById.staff_aa_t2_raid_001;
  const build = core.createInitialBuild();
  build.equipment.main_hand = selection(firstWeapon("staff", [blackRage.id, calanthia.id]));
  const coreVariant = core.calculableItemPerkVariants(calanthia, { scenario: scenario(build, 10) })
    .find((row) => row.passiveId === DISTANCE_EFFECT_IDS.BLACK_RAGE);
  assert.ok(coreVariant, "distance scenario must expose the reviewed Black Rage core");
  assert.equal(core.calculableItemPerkVariants(calanthia).some((row) => row.passiveId === DISTANCE_EFFECT_IDS.BLACK_RAGE), false);

  const staticContribution = core.slotSelectionContribution("main_hand", selection(blackRage), build, attributes);
  const scenarioContribution = core.slotSelectionContribution("main_hand", selection(blackRage), build, attributes, { scenario: scenario(build, 10) });
  assert.equal((scenarioContribution.all_critical_attack ?? 0) - (staticContribution.all_critical_attack ?? 0), 2000);
});

test("unsupported mastery replacements and mismatched builds fail the whole overlay closed", () => {
  const build = core.createInitialBuild();
  build.equipment.main_hand = selection(firstWeapon("crossbow"));
  build.skills = [{ skillId: DISTANCE_EFFECT_IDS.EAGLE_VISION, level: 20, loadoutType: "passive" }];
  build.masteries = { [DISTANCE_EFFECT_IDS.PREDATORS_FOCUS]: { level: 1 } };

  const unsupported = core.calculateBuild(build, attributes, { scenario: scenario(build, 10) });
  assert.equal(unsupported.scenarioEffects.status, "unsupported");
  assert.equal(unsupported.scenarioEffects.errors[0].code, "unsupported_mastery_replacement");
  assert.deepEqual(unsupported.scenarioStats, unsupported.stats);

  const mismatchedScenario = structuredClone(scenario(build, 10));
  mismatchedScenario.gameBuild = "999";
  const mismatched = core.calculateBuild(build, attributes, { scenario: mismatchedScenario });
  assert.equal(mismatched.scenarioEffects.status, "unsupported");
  assert.equal(mismatched.scenarioEffects.errors[0].code, "invalid_combat_scenario");
  assert.deepEqual(mismatched.scenarioStats, mismatched.stats);
});

test("scenario calculation requires the closed-world versioned combat contract", () => {
  const build = core.createInitialBuild();
  build.equipment.main_hand = selection(firstWeapon("bow"));
  build.skills = [{ skillId: DISTANCE_EFFECT_IDS.SNIPERS_SENSE, level: 20, loadoutType: "passive" }];

  for (const invalid of [
    { targetDistanceMeters: 10 },
    { ...structuredClone(scenario(build, 10)), schema: "wrong" },
    { ...structuredClone(scenario(build, 10)), unknown: true },
  ]) {
    const calc = core.calculateBuild(build, attributes, { scenario: invalid });
    assert.equal(calc.scenarioEffects.status, "unsupported");
    assert.equal(calc.scenarioEffects.errors[0].code, "invalid_combat_scenario");
    assert.deepEqual(calc.scenarioStats, calc.stats);
  }
});

test("decoded distance rules cannot cross their authoritative game build", () => {
  const build = core.createInitialBuild();
  build.equipment.main_hand = selection(firstWeapon("bow"));
  build.skills = [{ skillId: DISTANCE_EFFECT_IDS.SNIPERS_SENSE, level: 20, loadoutType: "passive" }];
  const futureScenario = structuredClone(scenario(build, 10));
  futureScenario.gameBuild = "future-build";
  const originalBuild = core.data.gameBuild;
  try {
    core.data.gameBuild = "future-build";
    const calc = core.calculateBuild(build, attributes, { scenario: futureScenario });
    assert.equal(calc.scenarioEffects.status, "unsupported");
    assert.equal(calc.scenarioEffects.errors[0].code, "scenario_effect_build_mismatch");
    assert.deepEqual(calc.scenarioStats, calc.stats);
  } finally {
    core.data.gameBuild = originalBuild;
  }
});

test("scenario source weapons must identify the calculated build", () => {
  const build = core.createInitialBuild();
  build.equipment.main_hand = selection(firstWeapon("bow"));
  const wrongWeapons = structuredClone(scenario(build, 10));
  wrongWeapons.participants.find((participant) => participant.id === "source").equippedWeaponTypes = ["staff"];
  const calc = core.calculateBuild(build, attributes, { scenario: wrongWeapons });
  assert.equal(calc.scenarioEffects.status, "unsupported");
  assert.equal(calc.scenarioEffects.errors[0].code, "scenario_source_weapon_mismatch");
  assert.deepEqual(calc.scenarioStats, calc.stats);
});

test("scenario cache identity separates target distances", () => {
  const build = core.createInitialBuild();
  const ordinaryStaff = firstWeapon("staff", ["staff_a_t3_mythicbeast_003"]);
  const blackRage = core.indexes.itemById.staff_a_t3_mythicbeast_003;
  build.equipment.main_hand = selection(ordinaryStaff);
  const atFive = core.slotSelectionContribution("main_hand", selection(blackRage), build, attributes, { scenario: scenario(build, 5) });
  const atTen = core.slotSelectionContribution("main_hand", selection(blackRage), build, attributes, { scenario: scenario(build, 10) });
  assert.equal((atTen.all_critical_attack ?? 0) - (atFive.all_critical_attack ?? 0), 1000);

  const reorderedFive = structuredClone(scenario(build, 5));
  reorderedFive.participants.reverse();
  reorderedFive.participants.find((participant) => participant.id === "source").equippedWeaponTypes.reverse();
  const equivalentFive = core.slotSelectionContribution("main_hand", selection(blackRage), build, attributes, { scenario: reorderedFive });
  assert.equal(equivalentFive, atFive, "equivalent normalized scenarios should share one slot cache entry");
});

test("slot contribution rebinding cancels scenario effects from the other weapon", () => {
  const build = core.createInitialBuild();
  const bow = firstWeapon("bow");
  const crossbow = firstWeapon("crossbow");
  build.equipment.main_hand = selection(bow);
  build.equipment.off_hand = selection(crossbow);
  build.skills = [
    { skillId: DISTANCE_EFFECT_IDS.SNIPERS_SENSE, level: 20, loadoutType: "passive" },
    { skillId: DISTANCE_EFFECT_IDS.EAGLE_VISION, level: 20, loadoutType: "passive" },
  ];
  const persistent = core.slotSelectionContribution("main_hand", selection(bow), build, attributes);
  const projected = core.slotSelectionContribution("main_hand", selection(bow), build, attributes, { scenario: scenario(build, 10) });
  assert.equal(
    (projected.range_accuracy ?? 0) - (persistent.range_accuracy ?? 0),
    0,
    "the off-hand Eagle Vision overlay must be present in both baseline and candidate totals",
  );
  assert.equal(
    (projected.all_critical_attack ?? 0) - (persistent.all_critical_attack ?? 0),
    2650,
    "the selected bow contribution should retain only its own Sniper's Sense overlay",
  );
});

test("optimizer currentStats rejects unsupported scenarios instead of returning static totals", async () => {
  const build = core.createInitialBuild();
  build.equipment.main_hand = selection(firstWeapon("bow"));
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const wrongBuild = structuredClone(scenario(build, 10));
  wrongBuild.gameBuild = "wrong-build";
  await assert.rejects(
    adapter.currentStats({ build, attributes }, { scenario: wrongBuild }),
    /Scenario calculation is unsupported/,
  );
  assert.doesNotThrow(() => core.slotSelectionContribution("main_hand", build.equipment.main_hand, build, attributes, { scenario: wrongBuild }));
});

test("Build Optimizer scores exact finalists and reviewed Skill Core variants through scenario totals", async () => {
  const build = core.createInitialBuild();
  const ordinaryStaff = firstWeapon("staff", ["staff_a_t3_mythicbeast_003", "staff_aa_t2_raid_001"]);
  build.equipment.main_hand = selection(ordinaryStaff);
  build.equipment.off_hand = selection(firstWeapon("dagger"));
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });

  const distanceScenario = scenario(build, 30);
  const current = await adapter.currentStats({ build, attributes }, { includeSetEffects: false, scenario: distanceScenario });
  const direct = core.calculateBuild(build, attributes, { includeSetEffects: false, scenario: distanceScenario });
  const directTotals = totals(direct.scenarioStats);
  assert.equal(current.all_critical_attack?.value ?? 0, Math.min(
    directTotals.melee_critical_attack ?? 0,
    directTotals.range_critical_attack ?? 0,
    directTotals.magic_critical_attack ?? 0,
  ));

  const result = await adapter.optimize({
    build: { build, attributes },
    sourceKind: "existing",
    goals: { priorities: [{ id: "all_critical_attack", rank: 1, mode: "maximize" }], protect: [] },
    rules: {
      minimumItemLevel: 0,
      keepCurrentHeroics: false,
      reconsiderHeroics: true,
      includeSetEffects: false,
      optimizeThreeTraits: false,
      bestHeroicConfiguration: false,
      runes: { mode: "keep" },
      artifacts: { mode: "keep" },
    },
    scenario: distanceScenario,
    depth: "fast",
  });
  const selected = result.build.equipment.main_hand;
  const selectedItem = core.indexes.itemById[selected.itemId];
  const selectedCore = core.selectedItemPerk(selectedItem, selected);
  assert.equal(
    selectedItem.passives?.id === DISTANCE_EFFECT_IDS.BLACK_RAGE || selectedCore?.passive?.id === DISTANCE_EFFECT_IDS.BLACK_RAGE,
    true,
    "scenario optimizer should retain a Black Rage route",
  );
  assert.equal(result.scenarioEffects.status, "applied");
  assert.equal(Number(result.scenario.target.distanceMeters), 30);
});
