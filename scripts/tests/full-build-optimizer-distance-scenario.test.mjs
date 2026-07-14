import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/full-build-optimizer.html", import.meta.url), "utf8");

test("Full Build Optimizer keeps scenario scoring explicit and opt-in", () => {
  assert.match(html, /id="enable-distance-scenario" type="checkbox"/);
  assert.doesNotMatch(html, /id="enable-distance-scenario" type="checkbox" checked/);
  assert.match(html, /id="target-distance" type="number" min="0" step="0\.5" value="10"/);
  assert.match(html, /id="scenario-time" disabled/);
  assert.match(html, /id="source-health-percent" type="number" min="0" max="100" step="0\.01"[^>]+placeholder="Unspecified" disabled/);
  assert.match(html, /id="source-mana-percent" type="number" min="0" max="100" step="0\.01"[^>]+placeholder="Unspecified" disabled/);
  assert.match(html, /Leave either resource blank when it is unspecified/);
  assert.match(html, /Static scoring remains the default/);
  assert.match(html, /function scenarioRequestFields\(\)/);
  assert.match(html, /return scenario\?\{scenario\}:\{\}/);
});

test("Full Build Optimizer creates one strict scenario for requests, results, hover, and tuning", () => {
  assert.match(html, /import \{ formatOptimizerScenario, optimizerScenarioOptions, parseOptionalPercentageBps \} from "\.\/full-build-optimizer\.js"/);
  assert.match(html, /optimizerScenarioOptions\(\{targetDistanceMeters:inputs\.targetDistanceMeters,timeOfDay:\$\("scenario-time"\)\.value,sourceHealthRatioBps:inputs\.sourceHealthRatioBps,sourceManaRatioBps:inputs\.sourceManaRatioBps\}\)/);
  assert.match(html, /state\.core\.createBuildScenario\(state\.build\.build\?\?state\.build,options\)/);
  assert.match(html, /currentStats\(state\.build,\{includeSetEffects:\$\("include-sets"\)\.checked,\.\.\.scenarioRequestFields\(\)\}\)/);
  assert.match(html, /function request\(\) \{ return \{ build:state\.build, sourceKind:state\.source, \.\.\.scenarioRequestFields\(\)/);
  assert.match(html, /result\.scenario\?\?activeScenario\(\)/);
  assert.match(html, /calculateBuild\(result\.build,result\.attributes\?\?result\.optimizedAttributes\?\?\{\}, \{includeSetEffects:[^}]+\.\.\.\(scenario\?\{scenario\}:\{\}\)\}\)/);
  assert.match(html, /buildItemHoverModel\(active,result\.build,calc,\{optionalFallback:false,\.\.\.\(scenario\?\{scenario\}:\{\}\)\}\)/);
  assert.match(html, /const resultWithScenario=scenario\?\{\.\.\.result,scenario,assumptions\}:result/);
  assert.match(html, /formatOptimizerScenario\(scenario\)/);
  assert.match(html, /Scenario fit score/);
});

test("Full Build Optimizer rejects invalid distance input and preserves static requests", () => {
  assert.match(html, /scenarioValid=!\$\("enable-distance-scenario"\)\.checked\|\|Boolean\(activeScenario\(\)\)/);
  assert.match(html, /Enter a finite target distance of 0m or more before optimizing/);
  assert.match(html, /from 0% through 100% with at most two decimal places, or leave it unspecified/);
  assert.match(html, /Current stats and recommendations use persistent static totals only/);
});
