// Page-control helpers for the exact evaluation-instant source-event scenario.
//
// Elapsed-time controls are deliberately absent. Positive Buff Duration can
// extend the decoded base durations, but its server formula and rounding are
// not yet calibrated. A successful activation at the evaluation instant is
// exact without inventing that duration arithmetic.

export const SOURCE_EVENT_CONTROL_MODE = Object.freeze({
  UNSPECIFIED: "unspecified",
  MOBILITY_NOW: "mobility_now",
  MOVEMENT_NOW: "movement_now",
  BOTH_NOW: "mobility_movement_now",
});

const CONTROL_MODES = new Set(Object.values(SOURCE_EVENT_CONTROL_MODE));
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function normalizedMode(value) {
  return CONTROL_MODES.has(value) ? value : SOURCE_EVENT_CONTROL_MODE.UNSPECIFIED;
}

function categoriesForMode(mode) {
  if (mode === SOURCE_EVENT_CONTROL_MODE.MOBILITY_NOW) return ["mobility"];
  if (mode === SOURCE_EVENT_CONTROL_MODE.MOVEMENT_NOW) return ["movement"];
  if (mode === SOURCE_EVENT_CONTROL_MODE.BOTH_NOW) return ["mobility", "movement"];
  return [];
}

/** Convert page state into the strict participant event-history union. */
export function sourceEventHistoryFromControls({ mode, weaponType } = {}) {
  const normalized = normalizedMode(mode);
  if (normalized === SOURCE_EVENT_CONTROL_MODE.UNSPECIFIED) return { state: "unspecified" };
  const weapon = String(weaponType ?? "").trim();
  if (!SAFE_ID.test(weapon)) throw new TypeError("A valid triggering weapon type is required for a source event.");
  return {
    state: "observed",
    lookbackMs: 0,
    events: [{
      id: "source-ability-activation-now",
      sequence: 0,
      occurredAgoMs: 0,
      kind: "ability_use",
      outcome: "successful_activation",
      weaponType: weapon,
      categories: categoriesForMode(normalized),
    }],
  };
}

/** Recover the simple page state only for the exact supported event shape. */
export function eventControlsFromSourceEventHistory(history) {
  const fallback = { mode: SOURCE_EVENT_CONTROL_MODE.UNSPECIFIED, weaponType: "" };
  if (history?.state !== "observed" || history.lookbackMs !== 0 || !Array.isArray(history.events) || history.events.length !== 1) return fallback;
  const event = history.events[0];
  if (event?.kind !== "ability_use" || event.outcome !== "successful_activation" || event.occurredAgoMs !== 0) return fallback;
  const categories = Array.isArray(event.categories) ? [...event.categories].sort().join(",") : "";
  const mode = categories === "mobility"
    ? SOURCE_EVENT_CONTROL_MODE.MOBILITY_NOW
    : categories === "movement"
      ? SOURCE_EVENT_CONTROL_MODE.MOVEMENT_NOW
      : categories === "mobility,movement"
        ? SOURCE_EVENT_CONTROL_MODE.BOTH_NOW
        : SOURCE_EVENT_CONTROL_MODE.UNSPECIFIED;
  if (mode === SOURCE_EVENT_CONTROL_MODE.UNSPECIFIED || !SAFE_ID.test(String(event.weaponType ?? ""))) return fallback;
  return { mode, weaponType: String(event.weaponType) };
}

export function scenarioSourceEventHistory(scenario) {
  const sourceId = scenario?.source?.participantId;
  return scenario?.participants?.find((row) => row?.id === sourceId)?.eventHistory ?? { state: "unspecified" };
}

export function formatSourceEventHistory(history, weaponLabel = (weapon) => weapon) {
  const controls = eventControlsFromSourceEventHistory(history);
  if (controls.mode === SOURCE_EVENT_CONTROL_MODE.UNSPECIFIED) return "skill event unspecified";
  const category = controls.mode === SOURCE_EVENT_CONTROL_MODE.MOBILITY_NOW
    ? "Mobility"
    : controls.mode === SOURCE_EVENT_CONTROL_MODE.MOVEMENT_NOW
      ? "Movement"
      : "Mobility + Movement";
  return `${category} activation now (${weaponLabel(controls.weaponType)})`;
}

export function encodeSourceEventControls(input) {
  const history = sourceEventHistoryFromControls(input);
  if (history.state === "unspecified") return "u";
  const event = history.events[0];
  const categories = event.categories.join("+");
  return `${categories}:${encodeURIComponent(event.weaponType)}`;
}

export function decodeSourceEventControls(value) {
  const raw = String(value ?? "");
  if (!raw || raw === "u") return eventControlsFromSourceEventHistory({ state: "unspecified" });
  const split = raw.lastIndexOf(":");
  if (split <= 0) return eventControlsFromSourceEventHistory({ state: "unspecified" });
  let weaponType = "";
  try { weaponType = decodeURIComponent(raw.slice(split + 1)); } catch { return eventControlsFromSourceEventHistory({ state: "unspecified" }); }
  const categoryKey = raw.slice(0, split);
  const mode = categoryKey === "mobility"
    ? SOURCE_EVENT_CONTROL_MODE.MOBILITY_NOW
    : categoryKey === "movement"
      ? SOURCE_EVENT_CONTROL_MODE.MOVEMENT_NOW
      : categoryKey === "mobility+movement"
        ? SOURCE_EVENT_CONTROL_MODE.BOTH_NOW
        : SOURCE_EVENT_CONTROL_MODE.UNSPECIFIED;
  try {
    return eventControlsFromSourceEventHistory(sourceEventHistoryFromControls({ mode, weaponType }));
  } catch {
    return eventControlsFromSourceEventHistory({ state: "unspecified" });
  }
}
