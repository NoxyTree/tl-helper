import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as core from "../../web/tl-core.js";
import { resolveBuildSnapshot } from "../../web/tl-build-snapshot.js";
import { createOptimizerAdapter } from "../../web/tl-full-build-adapter.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const data = await loadWebDataFromFile(path.join(root, "web", "data", "app-data.json"));
await core.initCore(data);

const SET_ID = "set_aa_t4_Plate_003";
const SET_PIECES = [
  ["head", "head_aa_S1_plate_003"],
  ["chest", "chest_aa_S1_plate_003"],
  ["hands", "hands_aa_S1_plate_003"],
  ["legs", "legs_aa_S1_plate_003"],
];
const attributes = { str: 23, dex: 41, int: 17, per: 39, con: 31 };

function buildWithPieces(count) {
  const build = core.createInitialBuild();
  for (const [slot, itemId] of SET_PIECES.slice(0, count)) {
    const item = core.indexes.itemById[itemId];
    build.equipment[slot] = { ...core.emptyEquipmentSelection(), itemId, level: core.itemMaxLevel(item) };
  }
  return build;
}

const totals = (calc) => Object.fromEntries(calc.stats.map((row) => [row.id, Number(row.total) || 0]));

test("Armory BuildSnapshot and the authoritative calculator return identical totals", () => {
  const build = buildWithPieces(4);
  const direct = totals(core.calculateBuild(build, attributes));
  const snapshot = resolveBuildSnapshot({ build, attributes, metadata: { gameDataBuild: data.gameBuild } });
  assert.deepEqual(totals(snapshot.resolved), direct);
  assert.equal(direct.critical_damage_dealt_modifier, 2000, "Nine Lives 4-piece contributes Critical Damage +20%");
  assert.ok(snapshot.resolved.stats.find((row) => row.id === "critical_damage_dealt_modifier").sources
    .some((row) => row.type === "set_bonus" && row.sourceLabel === "Nine Lives Set"));
});

test("Gear Viewer slot contribution equals the complete calculator delta when a set activates", () => {
  const partial = buildWithPieces(3);
  const before = totals(core.calculateBuild(partial, attributes));
  const [slot, itemId] = SET_PIECES[3];
  const item = core.indexes.itemById[itemId];
  const selection = { ...core.emptyEquipmentSelection(), itemId, level: core.itemMaxLevel(item) };
  const contribution = core.slotSelectionContribution(slot, selection, partial, attributes, { includeSetEffects: true });
  const completed = core.deepClone(partial);
  completed.equipment[slot] = selection;
  const after = totals(core.calculateBuild(completed, attributes));
  const expected = {};
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const delta = (after[id] ?? 0) - (before[id] ?? 0);
    if (Math.abs(delta) > 1e-9) expected[id] = delta;
  }
  assert.deepEqual(contribution, expected);
  assert.equal(contribution.critical_damage_dealt_modifier, 2000);
});

test("Gear Viewer weapon replacement delta does not attribute shared family progression to the item", () => {
  const [equippedItem, candidateItem] = data.items.filter((item) => item.equipmentType === "dagger").slice(0, 2);
  assert.ok(equippedItem && candidateItem, "two dagger fixtures are required");
  const selectionFor = (item) => ({ ...core.emptyEquipmentSelection(), itemId: item.id, level: core.itemMaxLevel(item) });
  const build = core.createInitialBuild();
  build.equipment.main_hand = selectionFor(equippedItem);
  build.skills = [{ skillId: "SkillSet_WP_DA_S_CriticalDamageUp", level: 20, loadoutType: "passive" }];

  assert.deepEqual(core.slotReplacementDelta("main_hand", build.equipment.main_hand, build, attributes), {});

  const candidate = selectionFor(candidateItem);
  const before = totals(core.calculateBuild(build, attributes));
  const replaced = core.deepClone(build);
  replaced.equipment.main_hand = candidate;
  const after = totals(core.calculateBuild(replaced, attributes));
  const expected = {};
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const delta = (after[id] ?? 0) - (before[id] ?? 0);
    if (Math.abs(delta) > 1e-9) expected[id] = delta;
  }

  assert.deepEqual(core.slotReplacementDelta("main_hand", candidate, build, attributes), expected);
  assert.ok(core.slotSelectionContribution("main_hand", candidate, build, attributes).critical_damage_dealt_modifier >= 1950);
  assert.equal(expected.critical_damage_dealt_modifier ?? 0, after.critical_damage_dealt_modifier - before.critical_damage_dealt_modifier);
});

test("Gear Viewer preserves the exact selected weapon core in replacement deltas", () => {
  const item = data.items.find((candidate) => core.WEAPON_TYPES.includes(candidate.equipmentType) && core.calculableItemPerkVariants(candidate).length > 1);
  assert.ok(item, "a weapon with a calculable persistent core is required");
  const variant = core.calculableItemPerkVariants(item).find((row) => row.perkId);
  const selection = { ...core.emptyEquipmentSelection(), itemId: item.id, level: core.itemMaxLevel(item), perkId: variant.perkId };
  const build = core.createInitialBuild();
  build.equipment.main_hand = selection;

  assert.deepEqual(core.slotReplacementDelta("main_hand", selection, build, attributes), {});

  const bareSelection = { ...selection, perkId: "" };
  const expectedBuild = core.deepClone(build);
  expectedBuild.equipment.main_hand = bareSelection;
  const before = totals(core.calculateBuild(build, attributes));
  const after = totals(core.calculateBuild(expectedBuild, attributes));
  const expected = {};
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const delta = (after[id] ?? 0) - (before[id] ?? 0);
    if (Math.abs(delta) > 1e-9) expected[id] = delta;
  }
  assert.deepEqual(core.slotReplacementDelta("main_hand", bareSelection, build, attributes), expected);
  assert.ok(Object.values(expected).some((value) => value < 0), "removing the selected persistent core must lose at least one stat");
});

test("Build Optimizer reads the same set-aware totals through its adapter", async () => {
  const build = buildWithPieces(4);
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const current = await adapter.currentStats({ build, attributes }, { includeSetEffects: true });
  const direct = totals(core.calculateBuild(build, attributes, { includeSetEffects: true }));
  assert.equal(current.critical_damage_dealt_modifier.value, direct.critical_damage_dealt_modifier);
  assert.equal(current.double_damage_taken_modifier.value, direct.double_damage_taken_modifier);
});

test("inactive and dynamic set hover values come from the authoritative trace", () => {
  const onePiece = buildWithPieces(1);
  const inactiveModel = core.buildItemHoverModel("head", onePiece, core.calculateBuild(onePiece, attributes));
  assert.ok(inactiveModel.setInfo.bonuses.every((bonus) => !bonus.computedText.includes("Applied:")));

  const artifactIds = [
    "talistone_b_set_04_001",
    "talistone_b_set_04_002",
    "talistone_b_set_04_003",
    "talistone_b_set_04_004",
    "gemstone_b_set_04_001",
    "gemstone_b_set_04_002",
  ];
  const artifactBuild = core.createInitialBuild();
  for (const [index, slot] of core.ARTIFACT_SLOTS.entries()) {
    artifactBuild.artifacts[slot.id] = { ...core.emptyEquipmentSelection(), itemId: artifactIds[index], level: core.itemMaxLevel(core.indexes.itemById[artifactIds[index]]) };
  }
  const artifactCalc = core.calculateBuild(artifactBuild, attributes);
  const sourceValue = artifactCalc.stats.find((row) => row.id === "hp_max").sources
    .find((row) => row.setId === "set_b_artifact_set_004" && row.setPieces === 6 && !row.expandedFrom).value;
  const model = core.buildItemHoverModel("talistone1", artifactBuild, artifactCalc);
  assert.match(model.setInfo.bonuses.find((row) => row.required === "6 pc").computedText, new RegExp(`Max Health \\+${sourceValue}`));
});

test("duplicate item selections use the same unique-member set count everywhere", () => {
  const build = core.createInitialBuild();
  for (const [slotId, itemId] of Object.entries({
    ring_1: "ring_aa_t2_upgrade_001",
    ring_2: "ring_aa_t2_upgrade_001",
    necklace: "necklace_aa_t2_upgrade_001",
    bracelet: "bracelet_aa_t2_upgrade_001",
  })) {
    const item = core.indexes.itemById[itemId];
    build.equipment[slotId] = { ...core.emptyEquipmentSelection(), itemId, level: core.itemMaxLevel(item) };
  }

  const calc = core.calculateBuild(build, attributes);
  const setSources = calc.stats.flatMap((row) => row.sources).filter((row) => row.type === "set_bonus" && row.setId === "Set_acc_t2_upgrade_001");
  assert.equal(setSources.length, 0, "three unique Pledge members must not activate its four-piece bonus");
  assert.ok(calc.validation.issues.some((row) => /selected in multiple slots/.test(row.message)));
  const hover = core.buildItemHoverModel("ring_1", build, calc);
  assert.equal(hover.setInfo.countLabel, "3/7");
  assert.ok(hover.setInfo.bonuses.every((row) => !row.active));
});

test("all public calculation surfaces use the shared set-aware engine and data manifest", async () => {
  const files = Object.fromEntries(await Promise.all([
    "index.html",
    "tracker.html",
    "gear-viewer.html",
    "full-build-optimizer.html",
    "build-from-scratch.html",
    "combat-lab.js",
    "tl-full-build-adapter.js",
    "tl-builder-worker.js",
  ].map(async (name) => [name, await readFile(path.join(root, "web", name), "utf8")] )));

  for (const name of ["index.html", "tracker.html", "gear-viewer.html"]) {
    assert.match(files[name], /\.\/data\/app-data\.json/, `${name} loads the canonical manifest`);
  }
  assert.match(files["index.html"], /resolveBuildSnapshot\(/);
  assert.match(files["tracker.html"], /resolveBuildSnapshot\(/);
  assert.match(files["combat-lab.js"], /resolveBuildSnapshot\(/);
  assert.match(files["gear-viewer.html"], /includeSetEffects: true/);
  assert.match(files["gear-viewer.html"], /function candidateContribution/);
  assert.match(files["gear-viewer.html"], /slotSelectionContribution/);
  assert.match(files["gear-viewer.html"], /slotReplacementDelta/);
  assert.match(files["full-build-optimizer.html"], /id="include-sets"[^>]+checked/);
  assert.match(files["full-build-optimizer.html"], /includeSetEffects:\$\("include-sets"\)\.checked/);
  assert.match(files["build-from-scratch.html"], /rules: \{ endgame: true, heroic: false, traits: true, sets: true/);
  assert.match(files["build-from-scratch.html"], /calculateBuild\(result\.build,result\.optimizedAttributes\|\|\{\},\{includeSetEffects:this\.state\.rules\.sets/);
  assert.match(files["build-from-scratch.html"], /resultCalc\?\.setEffects\?\.sets/);
  assert.match(files["build-from-scratch.html"], /setEffectBreakpointSummary\(breakpoint\)/);
  assert.match(files["index.html"], /artifactsVals\(calc\)/);
  assert.match(files["index.html"], /previewCalc\?\.setEffects\?\.sets/);
  assert.match(files["tl-full-build-adapter.js"], /core\.calculateBuild\(build, provisionalAttributes, \{ includeSetEffects: rules\.includeSetEffects !== false \}\)/);
  assert.match(files["tl-full-build-adapter.js"], /setEffects: clone\(finalCalculation\.setEffects\)/);
  assert.match(files["tl-builder-worker.js"], /createOptimizerAdapter/);
});

test("the Nine Lives set exists in the same projection consumed by every page", () => {
  const set = core.indexes.itemSetById[SET_ID];
  assert.equal(set.name, "Nine Lives Set");
  assert.deepEqual(set.itemSetBonus.map((row) => Number(row.set_count)), [2, 4]);
  for (const [, itemId] of SET_PIECES) assert.equal(core.indexes.itemById[itemId].setId, SET_ID);
});
