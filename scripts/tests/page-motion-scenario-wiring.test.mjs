import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [gear, optimizer, scratch] = await Promise.all([
  readFile(new URL("../../web/gear-viewer.html", import.meta.url), "utf8"),
  readFile(new URL("../../web/full-build-optimizer.html", import.meta.url), "utf8"),
  readFile(new URL("../../web/build-from-scratch.html", import.meta.url), "utf8"),
]);

test("all three calculation pages expose the canonical motion dimensions", () => {
  for (const html of [gear, optimizer, scratch]) {
    assert.match(html, /Source movement/i);
    assert.match(html, /stationary/);
    assert.match(html, /moving_ordinary/);
    assert.match(html, /moving_skill/);
    assert.match(html, /under_2s/);
    assert.match(html, /4s_or_more/);
  }
});

test("Gear Viewer carries motion through scenario identity, URLs, and compact preferences", () => {
  assert.match(gear, /sourceMotion: sourceMotionFromControls/);
  assert.match(gear, /scenarioCalculationFingerprint\(\{ build, attributes, includeSetEffects: state\.includeSetEffects, scenario \}\)/);
  assert.match(gear, /params\.set\("motion", encodeSourceMotionControls/);
  assert.match(gear, /decodeSourceMotionControls\(params\.get\("motion"\)\)/);
  assert.match(gear, /scenarioMotion: encodeSourceMotionControls/);
});

test("Full Build Optimizer carries motion through current, request, finalist, hover, and handoff paths", () => {
  assert.match(optimizer, /sourceMotion:inputs\.sourceMotion/);
  assert.match(optimizer, /currentStats\(state\.build,\{includeSetEffects:[^}]+\.\.\.scenarioRequestFields\(\)/);
  assert.match(optimizer, /function request\(\) \{ return \{ build:state\.build, sourceKind:state\.source, \.\.\.scenarioRequestFields\(\)/);
  assert.match(optimizer, /result\.scenario\?\?activeScenario\(\)/);
  assert.match(optimizer, /buildItemHoverModel\(active,result\.build,calc,\{optionalFallback:false,\.\.\.\(scenario\?\{scenario\}:\{\}\)\}\)/);
  assert.match(optimizer, /storeImprovedResult\(sessionStorage,\{result:resultWithScenario/);
});

test("Build From Scratch carries motion through worker request, result checks, tuning, and handoff reconstruction", () => {
  assert.match(scratch, /sourceMotion=this\.motionControls\.sourceMotionFromControls/);
  assert.match(scratch, /\.\.\.\(scenario\?\{scenario\}:\{\}\)/);
  assert.match(scratch, /this\._worker\.postMessage\(\{type:'optimize',request\}\)/);
  assert.match(scratch, /result\.scenario\?\{scenario:result\.scenario\}:\{\}/);
  assert.match(scratch, /scenario:result\.scenario\?\?null/);
  assert.match(scratch, /scenario:this\.scenarioStateFromCanonical\(result\.scenario\)/);
});
