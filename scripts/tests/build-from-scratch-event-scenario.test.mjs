import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/build-from-scratch.html", import.meta.url), "utf8");

test("Build From Scratch exposes exact evaluation-instant event controls", () => {
  assert.match(html, /Successful skill event at evaluation/);
  assert.match(html, /value="mobility_now">Successful Mobility now/);
  assert.match(html, /value="movement_now">Successful Movement now/);
  assert.match(html, /value="mobility_movement_now">Successful Mobility \+ Movement now/);
  assert.match(html, /aria-label="Scenario triggering selected weapon"/);
  assert.match(html, /scenarioEventWeaponOptions/);
  assert.match(html, /Exact selected-timestamp state only; no uptime is assumed/);
});

test("event state is initialized and converted through the shared helper", () => {
  assert.match(html, /eventMode:'unspecified', eventWeaponType:''/);
  assert.match(html, /import\('\.\/tl-event-scenario-controls\.js'\)/);
  assert.match(html, /this\.eventControls = eventControls/);
  assert.match(html, /sourceEventHistory=this\.eventControls\.sourceEventHistoryFromControls\(\{mode:input\.eventMode,weaponType:input\.eventWeaponType\}\)/);
  assert.match(html, /sourceMotion,sourceEventHistory/);
});

test("only a selected weapon can carry the observed activation", () => {
  assert.match(html, /selectedWeapons=\[this\.state\.weaponTypes\.main,this\.state\.weaponTypes\.off\]\.filter\(Boolean\)/);
  assert.match(html, /Choose one of the two selected weapon families as the triggering weapon/);
  assert.match(html, /scenarioCarrierBuild\(build\)/);
  assert.match(html, /\[\['main_hand',this\.state\.weaponTypes\.main\],\['off_hand',this\.state\.weaponTypes\.off\]\]/);
  assert.match(html, /scenarioBuild=input\.eventMode==='unspecified'\?build:this\.scenarioCarrierBuild\(build\)/);
  assert.match(html, /createBuildScenario\(scenarioBuild,/);
  assert.match(html, /!selected\.includes\(scenario\.eventWeaponType\)\)scenario\.eventWeaponType=selected\[0\]\|\|''/);
});

test("canonical handoff and result summaries restore and identify the event", () => {
  assert.match(html, /scenarioSourceEventHistory\(scenario\)/);
  assert.match(html, /eventControlsFromSourceEventHistory/);
  assert.match(html, /eventMode:eventControls\.mode,eventWeaponType:eventControls\.weaponType/);
  assert.match(html, /formatSourceEventHistory/);
  assert.match(html, /Selected timestamp/);
  assert.match(html, /evaluation-instant skill event/);
});

test("worker finalists and tuning retain the canonical event-bearing scenario", () => {
  assert.match(html, /const scenario=this\.buildScenario\(source\.build\)/);
  assert.match(html, /this\._worker\.postMessage\(\{type:'optimize',request\}\)/);
  const scenarioCalculationCalls = html.match(/calculateBuild\([^\n]+result\.scenario\?\{scenario:result\.scenario\}:\{\}\)[^\n]+/g) ?? [];
  assert.equal(scenarioCalculationCalls.length, 3);
  assert.match(html, /scenario:result\.scenario\?\?null/);
  assert.match(html, /scenario:this\.scenarioStateFromCanonical\(result\.scenario\)/);
});

test("Armory persistence remains static and excludes the selected-timestamp event", () => {
  const snapshotBody = html.match(/resultSnapshot\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.doesNotMatch(snapshotBody, /scenario|event/i);
  assert.match(html, /Armory recalculates persistent static totals without this combat scenario or its evaluation-instant skill event/);
});
