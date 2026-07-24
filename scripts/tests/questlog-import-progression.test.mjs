// Questlog sends the selected Overall Mastery nodes but no Overall Mastery
// Level. Leaving the level unset raised a blocking calculation issue, and
// blocking issues stop the optimizer from running on the imported build at all
// ("Optimizer unavailable ... Overall Mastery Level is not stored").
import assert from "node:assert/strict";
import test from "node:test";

import { importQuestlogBuild, initCore } from "../../web/tl-core.js";

const masteries = [
  { id: "WM_Common_SKILL_007", name: "Potential", specializationType: "unified", requiredLevel: 520, mainCategory: "common" },
  { id: "WM_Common_SKILL_020", name: "Shielded by Unity", specializationType: "unified", requiredLevel: 300, mainCategory: "common" },
];

await initCore({ items: [], itemSets: [], runes: [], masteries, skills: [], skillTraits: [] });

const importWith = (extra) => importQuestlogBuild({
  character: { name: "Tester" },
  build: { id: "imported", equipment: {} },
  ...extra,
}).build;

test("Questlog imports derive the Overall Mastery Level implied by the selected unified nodes", () => {
  const build = importWith({ masteryBuild: { unified: { 0: "WM_Common_SKILL_007", 1: "WM_Common_SKILL_020" } } });
  assert.deepEqual(build.unifiedMasteries, ["WM_Common_SKILL_007", "WM_Common_SKILL_020"]);
  // The highest requiredLevel among the selections — a lower bound the game
  // already proved by allowing the pick. Never the lower node's 300.
  assert.equal(build.overallMasteryLevel, 520);
});

test("an explicit Overall Mastery Level always beats the derived lower bound", () => {
  const build = importWith({
    build: { id: "imported", equipment: {}, overallMasteryLevel: 640 },
    masteryBuild: { unified: { 0: "WM_Common_SKILL_020" } },
  });
  assert.equal(build.overallMasteryLevel, 640);
});

test("a build with no unified selections stores no Overall Mastery Level", () => {
  // Nothing to verify means nothing to prove, and the validator only demands a
  // level when unified nodes are selected.
  assert.equal(importWith({ masteryBuild: { unified: {} } }).overallMasteryLevel, null);
  assert.equal(importWith({}).overallMasteryLevel, null);
});
