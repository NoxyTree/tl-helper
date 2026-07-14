import {
  DISTANCE_EFFECT_DEFINITIONS,
  DISTANCE_EFFECT_GAME_BUILD,
  DISTANCE_EFFECT_IDS,
  evaluateDistanceScenarioEffects,
} from "./tl-distance-scenario-effects.js";
import {
  TIME_OF_DAY_EFFECT_DEFINITIONS,
  TIME_OF_DAY_EFFECT_GAME_BUILD,
  TIME_OF_DAY_EFFECT_IDS,
  evaluateTimeOfDayScenarioEffects,
} from "./tl-time-of-day-scenario-effects.js";
import {
  RESOURCE_THRESHOLD_EFFECT_DEFINITIONS,
  RESOURCE_THRESHOLD_EFFECT_GAME_BUILD,
  RESOURCE_THRESHOLD_EFFECT_IDS,
  evaluateResourceThresholdScenarioEffects,
} from "./tl-resource-threshold-scenario-effects.js";

export const SCENARIO_EFFECT_GAME_BUILD = DISTANCE_EFFECT_GAME_BUILD;
if (TIME_OF_DAY_EFFECT_GAME_BUILD !== SCENARIO_EFFECT_GAME_BUILD) {
  throw new Error("Scenario effect family game builds do not match.");
}
if (RESOURCE_THRESHOLD_EFFECT_GAME_BUILD !== SCENARIO_EFFECT_GAME_BUILD) {
  throw new Error("Scenario effect family game builds do not match.");
}

export const SCENARIO_EFFECT_RULESET_ID = "tl-helper.scenario-effects";
export const SCENARIO_EFFECT_RULESET_VERSION = 3;

export {
  DISTANCE_EFFECT_DEFINITIONS,
  DISTANCE_EFFECT_IDS,
  RESOURCE_THRESHOLD_EFFECT_DEFINITIONS,
  RESOURCE_THRESHOLD_EFFECT_IDS,
  TIME_OF_DAY_EFFECT_DEFINITIONS,
  TIME_OF_DAY_EFFECT_IDS,
};

export const SCENARIO_EFFECT_DEFINITIONS = Object.freeze({
  ...DISTANCE_EFFECT_DEFINITIONS,
  ...RESOURCE_THRESHOLD_EFFECT_DEFINITIONS,
  ...TIME_OF_DAY_EFFECT_DEFINITIONS,
});

const EVALUATORS = Object.freeze([
  Object.freeze({ family: "target_distance", evaluate: evaluateDistanceScenarioEffects }),
  Object.freeze({ family: "time_of_day", evaluate: evaluateTimeOfDayScenarioEffects }),
  Object.freeze({ family: "source_resource_threshold", evaluate: evaluateResourceThresholdScenarioEffects }),
]);

/** Evaluate every reviewed family. The caller applies rows only when errors is empty. */
export function evaluateScenarioEffects({ activeSources = {}, scenario = {} } = {}) {
  const overlayRows = [];
  const trace = [];
  const errors = [];
  for (const evaluator of EVALUATORS) {
    const result = evaluator.evaluate({ activeSources, scenario });
    overlayRows.push(...result.overlayRows);
    trace.push(...result.trace.map((row) => Object.freeze({ family: evaluator.family, ...row })));
    errors.push(...result.errors.map((row) => Object.freeze({ family: evaluator.family, ...row })));
  }
  return Object.freeze({
    ruleset: Object.freeze({ id: SCENARIO_EFFECT_RULESET_ID, version: SCENARIO_EFFECT_RULESET_VERSION }),
    overlayRows: Object.freeze(overlayRows),
    trace: Object.freeze(trace),
    errors: Object.freeze(errors),
  });
}
