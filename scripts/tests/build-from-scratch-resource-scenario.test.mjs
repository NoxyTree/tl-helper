import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/build-from-scratch.html", import.meta.url), "utf8");

test("the Combat Scenario setup panel is gone but its engine wiring is intact", () => {
  // The setup panel was removed - it confused far more people than it served,
  // and the Forge scores persistent sheet totals regardless. This is a UI-only
  // removal: the scenario state stays pinned to disabled, and every downstream
  // scenario path (below) still works, so the engine support is untouched.
  assert.doesNotMatch(html, /Combat Scenario/);
  assert.doesNotMatch(html, /Score a combat scenario/);
  assert.doesNotMatch(html, /aria-label="Scenario source Health percentage"/);
  assert.doesNotMatch(html, /aria-label="Scenario source Mana percentage"/);
  assert.match(html, /scenario: \{ enabled:false, distance:'10', timeOfDay:'unspecified', healthPercent:'', manaPercent:'', motionMode:'unspecified'/);
});

test("resource percentages are validated and converted to integer basis points", () => {
  assert.match(html, /scenarioPercentToBps\(value,label\)/);
  assert.match(html, /const percent=Number\(text\),basisPoints=percent\*100/);
  assert.match(html, /percent<0\|\|percent>100/);
  assert.match(html, /supports at most two decimal places/);
  assert.match(html, /return Math\.round\(basisPoints\)/);
  assert.match(html, /sourceHealthRatioBps=this\.scenarioPercentToBps/);
  assert.match(html, /sourceManaRatioBps=this\.scenarioPercentToBps/);
  assert.match(html, /sourceHealthRatioBps==null\?\{\}:\{sourceHealthRatioBps\}/);
  assert.match(html, /sourceManaRatioBps==null\?\{\}:\{sourceManaRatioBps\}/);
});

test("the canonical scenario is sent to the optimizer only when enabled", () => {
  assert.match(html, /if\(!input\.enabled\)return null/);
  assert.match(html, /this\.core\.createBuildScenario\(scenarioBuild,\{targetDistanceMeters,timeOfDay/);
  assert.match(html, /const scenario=this\.buildScenario\(source\.build\)/);
  assert.match(html, /\.\.\.\(scenario\?\{scenario\}:\{\}\)/);
});

test("handoff, finalist, and tuned calculations retain scenario scoring", () => {
  const scenarioCalculationCalls = html.match(/calculateBuild\([^\n]+result\.scenario\?\{scenario:result\.scenario\}:\{\}\)[^\n]+/g) ?? [];
  assert.equal(scenarioCalculationCalls.length, 3);
  assert.match(html, /result\.scenario&&resultCalc\.scenarioEffects\?\.status!==\'applied\'/);
  assert.match(html, /resultCalc\.scenarioStats\?\?resultCalc\.stats\?\?\[\]/);
  assert.match(html, /const resultStats=s\.resultCalc\?\.scenarioStats\?\?s\.resultCalc\?\.stats\?\?\[\]/);
  assert.match(html, /scenario:result\.scenario\?\?null/);
});

test("Armory and preset snapshots deliberately exclude transient scenario inputs", () => {
  const snapshotBody = html.match(/resultSnapshot\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.match(snapshotBody, /favoriteStatIds/);
  assert.match(snapshotBody, /build:this\.core\.deepClone/);
  assert.doesNotMatch(snapshotBody, /scenario/);
});

test("scenario-adjusted results visibly explain their context and static Armory handoff", () => {
  assert.match(html, /Scenario totals:/);
  assert.match(html, /resultScenarioSummary\(scenario\)/);
  assert.match(html, /scenarioRatioLabel\(scenario,resourceId\)/);
  assert.match(html, /Number\.isInteger\(bps\)/);
  assert.match(html, /Health \$\{this\.scenarioRatioLabel\(scenario,'health'\)\}/);
  assert.match(html, /Mana \$\{this\.scenarioRatioLabel\(scenario,'mana'\)\}/);
  assert.match(html, /Armory recalculates persistent static totals without this combat scenario or its evaluation-instant skill event\./);
});
