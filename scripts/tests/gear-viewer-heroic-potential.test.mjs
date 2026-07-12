import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/gear-viewer.html", import.meta.url), "utf8");
const core = await readFile(new URL("../../web/tl-core.js", import.meta.url), "utf8");

test("Gear Viewer exposes an explicit best-Heroic configuration mode", () => {
  assert.match(html, /id="heroic-potential-toggle" type="checkbox"/);
  assert.match(html, /Use best Heroic configuration in Fit/);
  assert.match(html, /heroicPotential: false/);
  assert.match(html, /optimizeHeroicPotential/);
  assert.match(html, /Best possible configuration/);
  assert.match(html, /max-level Heroic effects/);
});

test("Gear Viewer optimizes no more than three normal traits", () => {
  assert.match(html, /Optimize 3 traits/);
  assert.match(html, /core\.NORMAL_TRAIT_CAP/);
  assert.doesNotMatch(html, /function maxTraitRows/);
  assert.match(html, /traits: state\.withTraits \? optimizedTraitRows\(item\) : \[\]/);
  assert.match(html, /const availableStatIds = potentialStatIds\(item, contribution\)/);
  assert.match(html, /row\.availableStatIds \?\? Object\.keys\(row\.contribution\)/);
});

test("goal-dependent potential selections participate in cache identity and hover rendering", () => {
  assert.match(html, /const objectiveKey = `\$\{state\.columns\.join\(","\)\}\|\$\{state\.protected\.join\(","\)\}/);
  assert.match(html, /candidate\?\.selection/);
  assert.match(html, /optionalFallback: state\.withTraits/);
  assert.match(core, /options\.optionalFallback === false \? \[\]/);
});

test("Heroic effects expose known and unknown levels without changing equipped data", () => {
  assert.match(html, /row\.levelKnown \? ` · Lv/);
  assert.match(html, /level unknown/);
  assert.match(html, /Your equipped item is not changed/);
});
