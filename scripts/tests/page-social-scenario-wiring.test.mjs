import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [gear, optimizer, optimizerHelper, scratch] = await Promise.all([
  readFile(new URL("../../web/gear-viewer.html", import.meta.url), "utf8"),
  readFile(new URL("../../web/full-build-optimizer.html", import.meta.url), "utf8"),
  readFile(new URL("../../web/full-build-optimizer.js", import.meta.url), "utf8"),
  readFile(new URL("../../web/build-from-scratch.html", import.meta.url), "utf8"),
]);

const CONTROL_IDS = [
  "scenario-party-total",
  "scenario-party-within4",
  "scenario-party-additional-4to16",
  "scenario-allied-nonparty-within4",
];

test("all three scenario pages expose the same optional social observations", () => {
  for (const html of [gear, optimizer]) {
    for (const id of CONTROL_IDS) assert.match(html, new RegExp(`id="${id}"`), id);
  }
  for (const binding of [
    "scenarioPartyTotal",
    "scenarioPartyWithin4",
    "scenarioPartyAdditional4To16",
    "scenarioAlliedNonpartyWithin4",
  ]) assert.match(scratch, new RegExp(`value="\\{\\{ ${binding} \\}\\}"`), binding);

  for (const html of [gear, optimizer, scratch]) {
    assert.match(html, /Total party (?:members )?including self/i);
    assert.match(html, /Other party(?: members)? within (?:4m|4 metres)/i);
    assert.match(html, /Allied nonparty/i);
  }
});

test("page inputs use the exact partial-observation helper contract", () => {
  for (const source of [gear, optimizer, scratch]) {
    assert.match(source, /totalPartyMembersIncludingSelf/);
    assert.match(source, /otherPartyPlayersWithin4m/);
    assert.match(source, /additionalOtherPartyPlayersAbove4mThrough16m/);
    assert.match(source, /alliedNonpartyPlayersWithin4m/);
  }
  assert.match(optimizerHelper, /sourceSocialFromControls\(sourceSocial\)/);
  assert.match(optimizerHelper, /scenarioSourceParty\(scenario\)/);
  assert.match(optimizerHelper, /scenarioSourceProximity\(scenario\)/);
});

test("Gear Viewer shares and restores social controls without putting them in Armory state", () => {
  assert.match(gear, /params\.set\("social", encodeSourceSocialControls\(scenarioSocialControls\(\)\)\)/);
  assert.match(gear, /if \(params\.has\("social"\)\)/);
  assert.match(gear, /scenarioSocial: encodeSourceSocialControls\(scenarioSocialControls\(\)\)/);
  assert.match(gear, /typeof prefs\.scenarioSocial === "string"/);
  assert.match(gear, /sourceSocialFromControls\(scenarioSocialControls\(\)\)/);
  assert.match(gear, /invalid_combat_scenario_controls/);
  assert.match(gear, /state\.scenarioEnabled && state\.mode !== "bare" && scenario == null/);
  assert.doesNotMatch(gear, /saveArmoryState\([^\n]*scenarioSocial/);
});

test("optimizer and scratch carry social state into canonical scenarios and keep Armory saves static", () => {
  assert.match(optimizer, /sourceSocial:inputs\.sourceSocial/);
  assert.match(optimizer, /formatOptimizerScenario\(scenario\)/);
  assert.match(scratch, /this\.socialControls\.sourceSocialFromControls/);
  assert.match(scratch, /this\.socialControls\.socialControlsFromSourceState/);
  assert.match(scratch, /this\.socialControls\?\.formatSourceSocial/);
  assert.match(scratch, /sourceMotion,sourceEventHistory,sourceParty,sourceProximity/);
  assert.match(scratch, /Save as preset and Use in Armory store the build only/);
});
