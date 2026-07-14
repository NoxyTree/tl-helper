import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/gear-viewer.html", import.meta.url), "utf8");

test("Gear Viewer combat-scenario scoring is explicit and disabled by default", () => {
  assert.match(html, /id="scenario-fit-toggle" type="checkbox"/);
  assert.doesNotMatch(html, /id="scenario-fit-toggle" type="checkbox" checked/);
  assert.match(html, /id="scenario-distance" type="number" min="0" step="0\.5" value="10"/);
  assert.match(html, /id="scenario-time" aria-label="Time of day"/);
  assert.match(html, /id="scenario-health-percent" type="number" min="0" max="100" step="0\.01" placeholder="Any"/);
  assert.match(html, /id="scenario-mana-percent" type="number" min="0" max="100" step="0\.01" placeholder="Any"/);
  assert.match(html, /id="scenario-event-mode"[^>]*title="Scores the exact instant after a confirmed successful activation\. Elapsed buff duration is not assumed\."/);
  assert.match(html, /id="scenario-event-weapon" aria-label="Triggering weapon"/);
  assert.match(html, /scenarioEnabled: false/);
  assert.match(html, /scenarioTime: "unspecified"/);
  assert.match(html, /scenarioHealthBps: null/);
  assert.match(html, /scenarioManaBps: null/);
  assert.match(html, /if \(!state\.scenarioEnabled \|\| state\.mode === "bare"\) return null/);
  assert.match(html, /core\.createBuildScenario\(scoringContext\(\)\.build, \{[\s\S]*?targetDistanceMeters: state\.scenarioDistance,[\s\S]*?timeOfDay: state\.scenarioTime,[\s\S]*?sourceHealthRatioBps: state\.scenarioHealthBps[\s\S]*?sourceManaRatioBps: state\.scenarioManaBps[\s\S]*?sourceEventHistory: sourceEventHistoryFromControls/);
});

test("Gear Viewer applies the same scenario to ranking, protection, and hover calculations", () => {
  assert.match(html, /function calculationOptions\(scenario = activeScenario\(\)\)/);
  assert.match(html, /core\.slotReplacementDelta\(slotId, selection, build, attributes, options\)/);
  assert.match(html, /core\.slotSelectionContribution\(slotId, selection, build, attributes, options\)/);
  assert.match(html, /core\.calculateBuild\(build, attributes, options\)/);
  assert.match(html, /core\.calculateBuild\(context\.build, context\.attributes, protectionOptions\)/);
  assert.match(html, /const beforeCalc = core\.calculateBuild\(context\.build, context\.attributes, options\)/);
  assert.match(html, /candidateScenario = core\.bindCombatScenarioToBuild\(scenario, build\)/);
  assert.match(html, /const calc = core\.calculateBuild\(build, context\.attributes, calculationOptions\(candidateScenario\)\)/);
  assert.match(html, /currentCalculation\.scenarioStats \?\? currentCalculation\.stats/);
});

test("Gear Viewer represents optional source Health and Mana as canonical basis points", () => {
  assert.match(html, /function normalizeScenarioBps\(value, fallback = null\)/);
  assert.match(html, /Number\.isSafeInteger\(bps\) && bps >= 0 && bps <= 10000/);
  assert.match(html, /function scenarioPercentToBps\(value, fallback = null\)/);
  assert.match(html, /Number\(match\[1\]\) \* 100/);
  assert.match(html, /state\.scenarioHealthBps === null \? \{\} : \{ sourceHealthRatioBps: state\.scenarioHealthBps \}/);
  assert.match(html, /state\.scenarioManaBps === null \? \{\} : \{ sourceManaRatioBps: state\.scenarioManaBps \}/);
  assert.match(html, /const scenario = activeScenario\(\);\s+const options = calculationOptions\(scenario\)/);
  assert.match(html, /candidateContribution\(slotId, selection, build, attributes, options\)/);
});

test("Gear Viewer scenario state has isolated cache identity and shareable persistence", () => {
  assert.match(html, /scenarioCalculationFingerprint\(\{ build, attributes, includeSetEffects: state\.includeSetEffects, scenario \}\)/);
  assert.match(html, /scenarioCalculationFingerprint\(\{ build: context\.build, attributes: context\.attributes, includeSetEffects: state\.includeSetEffects, scenario \}\)/);
  assert.match(html, /params\.set\("distance", String\(state\.scenarioDistance\)\)/);
  assert.match(html, /params\.set\("time", state\.scenarioTime\)/);
  assert.match(html, /params\.set\("hpBps", String\(state\.scenarioHealthBps\)\)/);
  assert.match(html, /params\.set\("mpBps", String\(state\.scenarioManaBps\)\)/);
  assert.match(html, /params\.set\("event", encodeSourceEventControls\(scenarioEventControls\(\)\)\)/);
  assert.match(html, /if \(params\.has\("distance"\)\)/);
  assert.match(html, /if \(params\.has\("hpBps"\)\)/);
  assert.match(html, /if \(params\.has\("mpBps"\)\)/);
  assert.match(html, /if \(params\.has\("event"\)\)/);
  assert.match(html, /scenarioEnabled: state\.scenarioEnabled, scenarioDistance: state\.scenarioDistance, scenarioTime: state\.scenarioTime, scenarioHealthBps: state\.scenarioHealthBps, scenarioManaBps: state\.scenarioManaBps/);
  assert.match(html, /scenario at \$\{state\.scenarioDistance\}m/);
});

test("Gear Viewer fails closed and cannot enable scenarios without a build", () => {
  assert.match(html, /currentCalculation\.scenarioEffects\?\.status !== "unsupported"/);
  assert.match(html, /currentCalculation\.scenarioEffects\.errors/);
  assert.match(html, /\$\("scenario-fit-toggle"\)\.disabled = unavailable/);
  assert.match(html, /\$\("scenario-distance"\)\.disabled = unavailable \|\| !state\.scenarioEnabled/);
  assert.match(html, /\$\("scenario-time"\)\.disabled = unavailable \|\| !state\.scenarioEnabled/);
  assert.match(html, /\$\("scenario-health-percent"\)\.disabled = unavailable \|\| !state\.scenarioEnabled/);
  assert.match(html, /\$\("scenario-mana-percent"\)\.disabled = unavailable \|\| !state\.scenarioEnabled/);
  assert.match(html, /\$\("scenario-event-mode"\)\.disabled = unavailable \|\| !state\.scenarioEnabled/);
  assert.match(html, /\$\("scenario-event-weapon"\)\.disabled = unavailable \|\| !state\.scenarioEnabled \|\| state\.scenarioEventMode === "unspecified"/);
});

test("Gear Viewer preserves evaluation-instant event state through links, preferences, ranking, and hover", () => {
  assert.match(html, /scenarioEventMode: "unspecified"/);
  assert.match(html, /scenarioEventWeapon: ""/);
  assert.match(html, /sourceEventHistoryFromControls\(\{ mode: state\.scenarioEventMode, weaponType: state\.scenarioEventWeapon \}\)/);
  assert.match(html, /scenarioEvent: encodeSourceEventControls\(scenarioEventControls\(\)\)/);
  assert.match(html, /formatSourceEventHistory\(sourceEventHistoryFromControls\(scenarioEventControls\(\)\)/);
  assert.match(html, /\$\("scenario-event-mode"\)\.addEventListener\("change",[\s\S]*?refresh\(\)/);
  assert.match(html, /\$\("scenario-event-weapon"\)\.addEventListener\("change",[\s\S]*?refresh\(\)/);
});
