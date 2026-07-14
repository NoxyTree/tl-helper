export const OPTIMIZER_RESOURCE_BPS_SCALE = 10000;

/** Convert an optional percentage input into exact basis points. */
export function parseOptionalPercentageBps(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = /^(?:(\d{1,3})(?:\.(\d{1,2}))?|\.(\d{1,2}))$/.exec(raw);
  if (!match) throw new TypeError("Percentage must use no more than two decimal places.");
  const whole = Number(match[1] ?? 0);
  const fraction = match[2] ?? match[3] ?? "";
  const basisPoints = whole * 100 + Number((fraction + "00").slice(0, 2));
  if (basisPoints < 0 || basisPoints > OPTIMIZER_RESOURCE_BPS_SCALE) {
    throw new RangeError("Percentage must be from 0 through 100.");
  }
  return basisPoints;
}

/** Build strict scenario options while preserving unspecified resources. */
export function optimizerScenarioOptions({
  targetDistanceMeters,
  timeOfDay,
  sourceHealthRatioBps = null,
  sourceManaRatioBps = null,
}) {
  return {
    targetDistanceMeters,
    timeOfDay,
    ...(sourceHealthRatioBps === null ? {} : { sourceHealthRatioBps }),
    ...(sourceManaRatioBps === null ? {} : { sourceManaRatioBps }),
  };
}

export function formatRatioBps(value) {
  if (value === null || value === undefined) return "unspecified";
  const basisPoints = Number(value);
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > OPTIMIZER_RESOURCE_BPS_SCALE) return "unspecified";
  const whole = Math.floor(basisPoints / 100);
  const fraction = String(basisPoints % 100).padStart(2, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}%`;
}

export function scenarioSourceResourceBps(scenario, resourceId) {
  const sourceId = scenario?.source?.participantId;
  const participant = scenario?.participants?.find((row) => row?.id === sourceId);
  const value = participant?.resources?.[resourceId]?.currentRatioBps;
  return Number.isInteger(value) ? value : null;
}

/** One canonical description used by setup, progress, result, hover handoff, and tuning. */
export function formatOptimizerScenario(scenario) {
  if (!scenario) return "";
  const distance = Number(scenario?.target?.distanceMeters);
  const timeOfDay = scenario?.environment?.timeOfDay;
  const time = timeOfDay === "unspecified" ? "time unspecified" : String(timeOfDay || "time unspecified");
  const health = formatRatioBps(scenarioSourceResourceBps(scenario, "health"));
  const mana = formatRatioBps(scenarioSourceResourceBps(scenario, "mana"));
  return `target ${Number.isFinite(distance) ? distance : "?"}m · ${time} · Health ${health} · Mana ${mana}`;
}
