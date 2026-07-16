export const MOTION_CONTROL_MODE = Object.freeze({
  UNSPECIFIED: "unspecified",
  STATIONARY: "stationary",
  MOVING_ORDINARY: "moving_ordinary",
  MOVING_SKILL: "moving_skill",
});

export const STATIONARY_BANDS = Object.freeze([
  "under_2s",
  "2s_to_under_3s",
  "3s_to_under_4s",
  "4s_or_more",
]);

export const MOVING_BANDS = Object.freeze(["under_2s", "2s_or_more", "unspecified"]);
export const PRIOR_STATIONARY_BANDS = Object.freeze(["unspecified", ...STATIONARY_BANDS]);

const MODES = new Set(Object.values(MOTION_CONTROL_MODE));
const STATIONARY = new Set(STATIONARY_BANDS);
const MOVING = new Set(MOVING_BANDS);
const PRIOR_STATIONARY = new Set(PRIOR_STATIONARY_BANDS);

const normalizedChoice = (value, allowed, fallback) => allowed.has(value) ? value : fallback;

/** Convert simple page-control state into the strict participant motion union. */
export function sourceMotionFromControls(input = {}) {
  const mode = normalizedChoice(input.mode, MODES, MOTION_CONTROL_MODE.UNSPECIFIED);
  if (mode === MOTION_CONTROL_MODE.UNSPECIFIED) return { state: "unspecified" };
  if (mode === MOTION_CONTROL_MODE.STATIONARY) {
    if (!STATIONARY.has(input.stationaryBand)) return { state: "unspecified" };
    return {
      state: "stationary",
      stationaryBand: input.stationaryBand,
    };
  }
  return {
    state: "moving",
    movementKind: mode === MOTION_CONTROL_MODE.MOVING_SKILL ? "movement_skill" : "ordinary",
    movingBand: normalizedChoice(input.movingBand, MOVING, "unspecified"),
    priorStationaryBand: normalizedChoice(input.priorStationaryBand, PRIOR_STATIONARY, "unspecified"),
  };
}

/** Recover page-control state from a normalized scenario participant. */
export function motionControlsFromSourceMotion(motion) {
  if (motion?.state === "stationary") {
    if (!STATIONARY.has(motion.stationaryBand)) return motionControlsFromSourceMotion({ state: "unspecified" });
    return {
      mode: MOTION_CONTROL_MODE.STATIONARY,
      stationaryBand: motion.stationaryBand,
      movingBand: "unspecified",
      priorStationaryBand: "unspecified",
    };
  }
  if (motion?.state === "moving") {
    return {
      mode: motion.movementKind === "movement_skill" ? MOTION_CONTROL_MODE.MOVING_SKILL : MOTION_CONTROL_MODE.MOVING_ORDINARY,
      stationaryBand: "under_2s",
      movingBand: normalizedChoice(motion.movingBand, MOVING, "unspecified"),
      priorStationaryBand: normalizedChoice(motion.priorStationaryBand, PRIOR_STATIONARY, "unspecified"),
    };
  }
  return {
    mode: MOTION_CONTROL_MODE.UNSPECIFIED,
    stationaryBand: "under_2s",
    movingBand: "unspecified",
    priorStationaryBand: "unspecified",
  };
}

export function scenarioSourceMotion(scenario) {
  const sourceId = scenario?.source?.participantId;
  return scenario?.participants?.find((row) => row?.id === sourceId)?.motion ?? { state: "unspecified" };
}

const STATIONARY_LABELS = Object.freeze({
  under_2s: "stationary under 2s",
  "2s_to_under_3s": "stationary 2 to under 3s",
  "3s_to_under_4s": "stationary 3 to under 4s",
  "4s_or_more": "stationary 4s or more",
});
const MOVING_LABELS = Object.freeze({ under_2s: "under 2s", "2s_or_more": "2s or more", unspecified: "duration unspecified" });

export function formatSourceMotion(motion) {
  const normalized = sourceMotionFromControls(motionControlsFromSourceMotion(motion));
  if (normalized.state === "unspecified") return "motion unspecified";
  if (normalized.state === "stationary") return STATIONARY_LABELS[normalized.stationaryBand];
  const kind = normalized.movementKind === "movement_skill" ? "movement-skill moving" : "ordinary moving";
  const prior = normalized.priorStationaryBand === "unspecified"
    ? "prior stationary duration unspecified"
    : `after ${STATIONARY_LABELS[normalized.priorStationaryBand]}`;
  return `${kind} ${MOVING_LABELS[normalized.movingBand]}, ${prior}`;
}

/** Compact, versioned value for Gear Viewer URL and preference persistence. */
export function encodeSourceMotionControls(input) {
  const motion = sourceMotionFromControls(input);
  if (motion.state === "unspecified") return "u";
  if (motion.state === "stationary") return `s:${motion.stationaryBand}`;
  return `${motion.movementKind === "movement_skill" ? "k" : "o"}:${motion.movingBand}:${motion.priorStationaryBand}`;
}

export function decodeSourceMotionControls(value) {
  const [kind, first, second] = String(value ?? "").split(":");
  if (kind === "s") return motionControlsFromSourceMotion({ state: "stationary", stationaryBand: first });
  if (kind === "o" || kind === "k") {
    return motionControlsFromSourceMotion({
      state: "moving",
      movementKind: kind === "k" ? "movement_skill" : "ordinary",
      movingBand: first,
      priorStationaryBand: second,
    });
  }
  return motionControlsFromSourceMotion({ state: "unspecified" });
}
