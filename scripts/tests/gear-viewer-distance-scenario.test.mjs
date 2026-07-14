import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/gear-viewer.html", import.meta.url), "utf8");

test("Gear Viewer combat-scenario scoring is explicit and disabled by default", () => {
  assert.match(html, /id="scenario-fit-toggle" type="checkbox"/);
  assert.doesNotMatch(html, /id="scenario-fit-toggle" type="checkbox" checked/);
  assert.match(html, /id="scenario-distance" type="number" min="0" step="0\.5" value="10"/);
  assert.match(html, /id="scenario-time" aria-label="Time of day"/);
  assert.match(html, /scenarioEnabled: false/);
  assert.match(html, /scenarioTime: "unspecified"/);
  assert.match(html, /if \(!state\.scenarioEnabled \|\| state\.mode === "bare"\) return null/);
  assert.match(html, /core\.createBuildScenario\(scoringContext\(\)\.build, \{ targetDistanceMeters: state\.scenarioDistance, timeOfDay: state\.scenarioTime \}\)/);
});

test("Gear Viewer applies the same scenario to ranking, protection, and hover calculations", () => {
  assert.match(html, /function calculationOptions\(\)/);
  assert.match(html, /core\.slotReplacementDelta\(slotId, selection, build, attributes, options\)/);
  assert.match(html, /core\.slotSelectionContribution\(slotId, selection, build, attributes, options\)/);
  assert.match(html, /core\.calculateBuild\(build, attributes, options\)/);
  assert.match(html, /core\.calculateBuild\(context\.build, context\.attributes, calculationOptions\(\)\)/);
  assert.match(html, /const beforeCalc = core\.calculateBuild\(context\.build, context\.attributes, options\)/);
  assert.match(html, /const calc = core\.calculateBuild\(build, context\.attributes, options\)/);
  assert.match(html, /currentCalculation\.scenarioStats \?\? currentCalculation\.stats/);
});

test("Gear Viewer scenario state has isolated cache identity and shareable persistence", () => {
  assert.match(html, /scenarioCalculationFingerprint\(\{ build, attributes, includeSetEffects: state\.includeSetEffects, scenario \}\)/);
  assert.match(html, /scenarioCalculationFingerprint\(\{ build: context\.build, attributes: context\.attributes, includeSetEffects: state\.includeSetEffects, scenario \}\)/);
  assert.match(html, /params\.set\("distance", String\(state\.scenarioDistance\)\)/);
  assert.match(html, /params\.set\("time", state\.scenarioTime\)/);
  assert.match(html, /if \(params\.has\("distance"\)\)/);
  assert.match(html, /scenarioEnabled: state\.scenarioEnabled, scenarioDistance: state\.scenarioDistance, scenarioTime: state\.scenarioTime/);
  assert.match(html, /scenario at \$\{state\.scenarioDistance\}m/);
});

test("Gear Viewer fails closed and cannot enable scenarios without a build", () => {
  assert.match(html, /currentCalculation\.scenarioEffects\?\.status !== "unsupported"/);
  assert.match(html, /currentCalculation\.scenarioEffects\.errors/);
  assert.match(html, /\$\("scenario-fit-toggle"\)\.disabled = unavailable/);
  assert.match(html, /\$\("scenario-distance"\)\.disabled = unavailable \|\| !state\.scenarioEnabled/);
  assert.match(html, /\$\("scenario-time"\)\.disabled = unavailable \|\| !state\.scenarioEnabled/);
});
