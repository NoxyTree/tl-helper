import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/full-build-optimizer.html", import.meta.url), "utf8");

test("Full Build Optimizer keeps scenario scoring explicit and opt-in", () => {
  assert.match(html, /id="enable-distance-scenario" type="checkbox"/);
  assert.doesNotMatch(html, /id="enable-distance-scenario" type="checkbox" checked/);
  assert.match(html, /id="target-distance" type="number" min="0" step="0\.5" value="10"/);
  assert.match(html, /Static scoring remains the default/);
  assert.match(html, /function scenarioRequestFields\(\)/);
  assert.match(html, /return scenario\?\{scenario\}:\{\}/);
});

test("Full Build Optimizer creates a strict scenario from the source build", () => {
  assert.match(html, /state\.core\.createTargetDistanceScenario\(state\.build\.build\?\?state\.build,targetDistanceMeters\)/);
  assert.match(html, /currentStats\(state\.build,\{includeSetEffects:\$\("include-sets"\)\.checked,\.\.\.scenarioRequestFields\(\)\}\)/);
  assert.match(html, /function request\(\) \{ return \{ build:state\.build, sourceKind:state\.source, \.\.\.scenarioRequestFields\(\)/);
  assert.match(html, /result\.scenario\?\?activeScenario\(\)/);
  assert.match(html, /Scenario fit score at/);
});

test("Full Build Optimizer rejects invalid distance input and preserves static requests", () => {
  assert.match(html, /scenarioValid=!\$\("enable-distance-scenario"\)\.checked\|\|Boolean\(activeScenario\(\)\)/);
  assert.match(html, /Enter a finite target distance of 0m or more before optimizing/);
  assert.match(html, /Current stats and recommendations use persistent static totals only/);
});
