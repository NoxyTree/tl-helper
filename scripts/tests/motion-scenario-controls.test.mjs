import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeSourceMotionControls,
  encodeSourceMotionControls,
  formatSourceMotion,
  motionControlsFromSourceMotion,
  scenarioSourceMotion,
  sourceMotionFromControls,
} from "../../web/tl-motion-scenario-controls.js";

test("controls produce every strict source-motion union branch", () => {
  assert.deepEqual(sourceMotionFromControls(), { state: "unspecified" });
  assert.deepEqual(sourceMotionFromControls({ mode: "stationary", stationaryBand: "4s_or_more" }), {
    state: "stationary", stationaryBand: "4s_or_more",
  });
  assert.deepEqual(sourceMotionFromControls({ mode: "moving_ordinary", movingBand: "under_2s", priorStationaryBand: "3s_to_under_4s" }), {
    state: "moving", movementKind: "ordinary", movingBand: "under_2s", priorStationaryBand: "3s_to_under_4s",
  });
  assert.deepEqual(sourceMotionFromControls({ mode: "moving_skill", movingBand: "2s_or_more", priorStationaryBand: "4s_or_more" }), {
    state: "moving", movementKind: "movement_skill", movingBand: "2s_or_more", priorStationaryBand: "4s_or_more",
  });
});

test("invalid control values fail closed to canonical unspecified defaults", () => {
  assert.deepEqual(sourceMotionFromControls({ mode: "teleporting" }), { state: "unspecified" });
  assert.deepEqual(sourceMotionFromControls({ mode: "stationary", stationaryBand: "5s" }), { state: "unspecified" });
  assert.equal(decodeSourceMotionControls("s:5s").mode, "unspecified");
});

test("compact values round trip without losing motion semantics", () => {
  for (const controls of [
    {},
    { mode: "stationary", stationaryBand: "3s_to_under_4s" },
    { mode: "moving_ordinary", movingBand: "under_2s", priorStationaryBand: "4s_or_more" },
    { mode: "moving_skill", movingBand: "unspecified", priorStationaryBand: "2s_to_under_3s" },
  ]) {
    assert.deepEqual(
      sourceMotionFromControls(decodeSourceMotionControls(encodeSourceMotionControls(controls))),
      sourceMotionFromControls(controls),
    );
  }
});

test("source lookup and text use the canonical source participant", () => {
  const motion = { state: "stationary", stationaryBand: "4s_or_more" };
  const scenario = { source: { participantId: "source" }, participants: [{ id: "target" }, { id: "source", motion }] };
  assert.equal(scenarioSourceMotion(scenario), motion);
  assert.equal(formatSourceMotion(motion), "stationary 4s or more");
  assert.equal(motionControlsFromSourceMotion(motion).mode, "stationary");
});
