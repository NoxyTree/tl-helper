import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [builder, armory, masteryWheel] = await Promise.all([
  readFile(new URL("../../web/build-from-scratch.html", import.meta.url), "utf8"),
  readFile(new URL("../../web/index.html", import.meta.url), "utf8"),
  readFile(new URL("../../web/MasteryWheel.dc.html", import.meta.url), "utf8"),
]);

test("Builder result view exposes Stats, Upgrade Guide, and Skills & Mastery primary tabs with progression sub-views", () => {
  // Three primary tabs: Stats, Upgrade Guide, then the combined progression tab.
  assert.match(builder, /\{id:'stats',name:'Stats'/);
  assert.match(builder, /\{id:'guide',name:'Upgrade Guide'/);
  assert.match(builder, /id:'progression',name:'Skills & Mastery'/);
  // Skills and Mastery remain distinct views, now as sub-chips of the progression tab.
  assert.match(builder, /\['skills','Skills'\],\['mastery','Mastery'\]/);
  assert.match(builder, /tabSkills:s\.statTab==='skills'/);
  assert.match(builder, /tabMastery:s\.statTab==='mastery'/);
  assert.match(builder, /showCompactProgression:false/);
  // The result overview renders whenever a build exists; view gating is per statTab.
  assert.match(builder, /showResultOverview:!!s\.result/);
});

test("Armory and Builder render the same shared mastery wheel", () => {
  const sharedImport = /<dc-import name="MasteryWheel" data="\{\{ (?:masteryPanel|masteryPanel) \}\}"/;
  assert.match(builder, sharedImport);
  assert.match(armory, sharedImport);
  assert.match(masteryWheel, /viewBox="0 0 1260 1260"/);
  assert.match(masteryWheel, /data-mastery-pan="1" data-result-mastery-pan="1"/);
  assert.match(masteryWheel, /\{\{ data\.masteryDetail\.effects \}\}/);
  assert.match(masteryWheel, /Unified Mastery/);
});

test("Builder skill results use the Armory card and detail conventions", () => {
  assert.match(builder, /width:58px;height:58px;border-radius:999px/);
  assert.match(builder, /resultSkillFocus\.levelBands/);
  assert.match(builder, /resultSkillFocus\.specs/);
  assert.match(builder, /resultSkillFocus\.variants/);
  assert.match(builder, /Only passive skills are selected by Build from Scratch/);
});
