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
import {
  MOTION_EFFECT_DEFINITIONS,
  MOTION_EFFECT_GAME_BUILD,
  MOTION_EFFECT_IDS,
  evaluateMotionScenarioEffects,
} from "./tl-motion-scenario-effects.js";
import {
  EVENT_EFFECT_DEFINITIONS,
  EVENT_EFFECT_GAME_BUILD,
  EVENT_EFFECT_IDS,
  evaluateEventScenarioEffects,
} from "./tl-event-scenario-effects.js";
import {
  SOCIAL_EFFECT_DEFINITIONS,
  SOCIAL_EFFECT_GAME_BUILD,
  SOCIAL_EFFECT_IDS,
  evaluateSocialScenarioEffects,
} from "./tl-social-scenario-effects.js";

export const SCENARIO_EFFECT_GAME_BUILD = DISTANCE_EFFECT_GAME_BUILD;
if (TIME_OF_DAY_EFFECT_GAME_BUILD !== SCENARIO_EFFECT_GAME_BUILD) {
  throw new Error("Scenario effect family game builds do not match.");
}
if (RESOURCE_THRESHOLD_EFFECT_GAME_BUILD !== SCENARIO_EFFECT_GAME_BUILD) {
  throw new Error("Scenario effect family game builds do not match.");
}
if (MOTION_EFFECT_GAME_BUILD !== SCENARIO_EFFECT_GAME_BUILD) {
  throw new Error("Scenario effect family game builds do not match.");
}
if (EVENT_EFFECT_GAME_BUILD !== SCENARIO_EFFECT_GAME_BUILD) {
  throw new Error("Scenario effect family game builds do not match.");
}
if (SOCIAL_EFFECT_GAME_BUILD !== SCENARIO_EFFECT_GAME_BUILD) {
  throw new Error("Scenario effect family game builds do not match.");
}

export const SCENARIO_EFFECT_RULESET_ID = "tl-helper.scenario-effects";
export const SCENARIO_EFFECT_RULESET_VERSION = 6;

export {
  DISTANCE_EFFECT_DEFINITIONS,
  DISTANCE_EFFECT_IDS,
  EVENT_EFFECT_DEFINITIONS,
  EVENT_EFFECT_IDS,
  MOTION_EFFECT_DEFINITIONS,
  MOTION_EFFECT_IDS,
  RESOURCE_THRESHOLD_EFFECT_DEFINITIONS,
  RESOURCE_THRESHOLD_EFFECT_IDS,
  SOCIAL_EFFECT_DEFINITIONS,
  SOCIAL_EFFECT_IDS,
  TIME_OF_DAY_EFFECT_DEFINITIONS,
  TIME_OF_DAY_EFFECT_IDS,
};

export const SCENARIO_EFFECT_DEFINITIONS = Object.freeze({
  ...DISTANCE_EFFECT_DEFINITIONS,
  ...EVENT_EFFECT_DEFINITIONS,
  ...MOTION_EFFECT_DEFINITIONS,
  ...RESOURCE_THRESHOLD_EFFECT_DEFINITIONS,
  ...SOCIAL_EFFECT_DEFINITIONS,
  ...TIME_OF_DAY_EFFECT_DEFINITIONS,
});

const EVALUATORS = Object.freeze([
  Object.freeze({ family: "target_distance", evaluate: evaluateDistanceScenarioEffects }),
  Object.freeze({ family: "time_of_day", evaluate: evaluateTimeOfDayScenarioEffects }),
  Object.freeze({ family: "source_resource_threshold", evaluate: evaluateResourceThresholdScenarioEffects }),
  Object.freeze({ family: "source_motion", evaluate: evaluateMotionScenarioEffects }),
  Object.freeze({ family: "source_event_activation_instant", evaluate: evaluateEventScenarioEffects }),
  Object.freeze({ family: "source_party_proximity", evaluate: evaluateSocialScenarioEffects }),
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
