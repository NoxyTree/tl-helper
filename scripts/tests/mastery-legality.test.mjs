import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as core from "../../web/tl-core.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appData = await loadWebDataFromFile(join(repoRoot, "web", "data", "app-data.json"));
await core.initCore(appData);

const selected = (entries) => Object.fromEntries(entries.map(([id, level]) => [id, { level }]));
const codes = (build) => core.validateMasterySelections(build, { activeWeaponTypes: ["bow"] }).issues.map((issue) => issue.code);

test("mastery tier prerequisites use exact 30-point boundaries", () => {
  const uncommonAt29 = { masteries: selected([
    ["Bow_Normal_Attack_01", 10],
    ["Bow_Normal_Attack_02", 10],
    ["Bow_Normal_AttackUtil_03", 9],
    ["Bow_High_Attack_01", 1],
  ]) };
  assert.ok(codes(uncommonAt29).includes("mastery_tier_prerequisite_missing"));

  uncommonAt29.masteries.Bow_Normal_AttackUtil_03.level = 10;
  assert.equal(codes(uncommonAt29).includes("mastery_tier_prerequisite_missing"), false);

  const rareAt29 = { masteries: selected([
    ["Bow_Normal_Attack_01", 10],
    ["Bow_Normal_Attack_02", 10],
    ["Bow_Normal_AttackUtil_03", 10],
    ["Bow_High_Attack_01", 10],
    ["Bow_High_Attack_02", 10],
    ["Bow_High_AttackUtil_03", 9],
    ["Bow_Rare_Attack_01", 1],
  ]) };
  assert.ok(codes(rareAt29).includes("mastery_tier_prerequisite_missing"));
  rareAt29.masteries.Bow_High_AttackUtil_03.level = 10;
  assert.equal(codes(rareAt29).includes("mastery_tier_prerequisite_missing"), false);
});

test("hybrid mastery points credit both categories but consume budget once", () => {
  const build = { masteries: selected([
    ["Bow_Normal_Attack_01", 10],
    ["Bow_Normal_AttackUtil_03", 10],
    ["Bow_Normal_Util_04", 10],
    ["Bow_Normal_Attack_Skill", 1],
    ["Bow_Normal_Util_Skill", 1],
  ]) };
  assert.deepEqual(codes(build), []);
});

test("Achievement effects follow the two highest categories with tie-safe selection", () => {
  const base = [
    ["Bow_Normal_Attack_01", 10],
    ["Bow_Normal_Attack_02", 10],
    ["Bow_Normal_AttackUtil_03", 10],
    ["Bow_Normal_Defense_07", 10],
    ["Bow_Normal_Defense_08", 10],
    ["Bow_Normal_Tactic_10", 10],
    ["Bow_Normal_Tactic_11", 10],
  ];
  const wrong = { masteries: selected([...base, ["Bow_Normal_Def_Skill", 1], ["Bow_Normal_Tac_Skill", 1]]) };
  assert.ok(codes(wrong).includes("mastery_synergy_priority_invalid"));

  const validDefenseTie = { masteries: selected([...base, ["Bow_Normal_Attack_Skill", 1], ["Bow_Normal_Def_Skill", 1]]) };
  assert.equal(codes(validDefenseTie).includes("mastery_synergy_priority_invalid"), false);
  assert.equal(codes(validDefenseTie).includes("mastery_synergy_count_invalid"), false);

  const validTacticTie = { masteries: selected([...base, ["Bow_Normal_Attack_Skill", 1], ["Bow_Normal_Tac_Skill", 1]]) };
  assert.equal(codes(validTacticTie).includes("mastery_synergy_priority_invalid"), false);
  assert.equal(codes(validTacticTie).includes("mastery_synergy_count_invalid"), false);
});

test("raw mastery levels are rejected rather than silently accepted as legal", () => {
  assert.ok(codes({ masteries: { Bow_Normal_Attack_01: { level: 11 } } }).includes("invalid_mastery_level"));
  assert.ok(codes({ masteries: { Bow_Normal_Attack_Skill: { level: 2 } } }).includes("invalid_mastery_level"));
});

test("decoded per-weapon budget accepts 220 and rejects 221 normal points", () => {
  const normals = appData.masteries.filter((row) => row.mainCategory === "bow" && row.specializationType === "normal");
  assert.ok(normals.length >= 23);
  const build = { masteries: Object.fromEntries(normals.slice(0, 22).map((row) => [row.id, { level: 10 }])) };
  assert.equal(codes(build).includes("mastery_budget_exceeded"), false);
  build.masteries[normals[22].id] = { level: 1 };
  assert.ok(codes(build).includes("mastery_budget_exceeded"));
});

test("Epic unlock gates exclude Epic-node levels so selected nodes cannot satisfy their own prerequisite", () => {
  const nonEpic = appData.masteries.filter((row) => (
    row.mainCategory === "bow"
    && row.specializationType === "normal"
    && row.grade !== 41
  ));
  const epics = appData.masteries.filter((row) => row.mainCategory === "bow" && row.specializationType === "normal" && row.grade === 41);
  assert.ok(nonEpic.length >= 11);
  assert.ok(epics.length >= 2);

  const firstAtSeventy = { masteries: Object.fromEntries([
    ...nonEpic.slice(0, 7).map((row) => [row.id, { level: 10 }]),
    [epics[0].id, { level: 10 }],
  ]) };
  assert.ok(codes(firstAtSeventy).includes("mastery_epic_points_missing"));

  const secondAtOneTen = { masteries: Object.fromEntries([
    ...nonEpic.slice(0, 11).map((row) => [row.id, { level: 10 }]),
    [epics[0].id, { level: 10 }],
    [epics[1].id, { level: 10 }],
  ]) };
  assert.ok(codes(secondAtOneTen).includes("mastery_epic_points_missing"));
});
