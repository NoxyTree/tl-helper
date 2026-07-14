import assert from "node:assert/strict";
import test from "node:test";

import {
  formatOptimizerScenario,
  optimizerScenarioOptions,
  parseOptionalPercentageBps,
  scenarioSourceResourceBps,
} from "../../web/full-build-optimizer.js";

test("optional percentage inputs become exact basis points", () => {
  assert.equal(parseOptionalPercentageBps(""), null);
  assert.equal(parseOptionalPercentageBps(null), null);
  assert.equal(parseOptionalPercentageBps("0"), 0);
  assert.equal(parseOptionalPercentageBps(".5"), 50);
  assert.equal(parseOptionalPercentageBps("33"), 3300);
  assert.equal(parseOptionalPercentageBps("33.33"), 3333);
  assert.equal(parseOptionalPercentageBps("100"), 10000);
  assert.equal(parseOptionalPercentageBps("100.00"), 10000);
});

test("optional percentage inputs reject lossy or out-of-range values", () => {
  for (const value of ["-1", "100.01", "33.333", "1e2", "not-a-number"]) {
    assert.throws(() => parseOptionalPercentageBps(value), undefined, value);
  }
});

test("optimizer scenario options preserve unspecified resources by omission", () => {
  assert.deepEqual(
    optimizerScenarioOptions({
      targetDistanceMeters: 10,
      timeOfDay: "night",
      sourceHealthRatioBps: null,
      sourceManaRatioBps: null,
    }),
    { targetDistanceMeters: 10, timeOfDay: "night" },
  );
  assert.deepEqual(
    optimizerScenarioOptions({
      targetDistanceMeters: 4.5,
      timeOfDay: "day",
      sourceHealthRatioBps: 0,
      sourceManaRatioBps: 5000,
    }),
    {
      targetDistanceMeters: 4.5,
      timeOfDay: "day",
      sourceHealthRatioBps: 0,
      sourceManaRatioBps: 5000,
    },
  );
  assert.deepEqual(
    optimizerScenarioOptions({
      targetDistanceMeters: 10,
      timeOfDay: "unspecified",
      sourceMotion: { mode: "stationary", stationaryBand: "4s_or_more" },
    }),
    {
      targetDistanceMeters: 10,
      timeOfDay: "unspecified",
      sourceMotion: { state: "stationary", stationaryBand: "4s_or_more" },
    },
  );
});

test("scenario resource reads identify the source participant by id", () => {
  const scenario = {
    source: { participantId: "player" },
    participants: [
      { id: "target", resources: { health: { currentRatioBps: 10000 } } },
      {
        id: "player",
        resources: {
          health: { currentRatioBps: 3333 },
          mana: { currentRatioBps: 0 },
        },
      },
    ],
  };
  assert.equal(scenarioSourceResourceBps(scenario, "health"), 3333);
  assert.equal(scenarioSourceResourceBps(scenario, "mana"), 0);
});

test("canonical scenario text reports each resource independently", () => {
  const scenario = {
    source: { participantId: "player" },
    target: { distanceMeters: 7.5 },
    environment: { timeOfDay: "night" },
    participants: [
      {
        id: "player",
        resources: { health: { currentRatioBps: 3333 } },
      },
    ],
  };
  assert.equal(
    formatOptimizerScenario(scenario),
    "target 7.5m · night · Health 33.33% · Mana unspecified · motion unspecified",
  );
});
