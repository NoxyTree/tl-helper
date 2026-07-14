import assert from "node:assert/strict";
import test from "node:test";
import {
  SOURCE_EVENT_CONTROL_MODE,
  decodeSourceEventControls,
  encodeSourceEventControls,
  eventControlsFromSourceEventHistory,
  formatSourceEventHistory,
  scenarioSourceEventHistory,
  sourceEventHistoryFromControls,
} from "../../web/tl-event-scenario-controls.js";

test("event controls emit only successful evaluation-instant activations", () => {
  assert.deepEqual(sourceEventHistoryFromControls({ mode: "unspecified" }), { state: "unspecified" });
  assert.deepEqual(sourceEventHistoryFromControls({ mode: SOURCE_EVENT_CONTROL_MODE.BOTH_NOW, weaponType: "dagger" }), {
    state: "observed",
    lookbackMs: 0,
    events: [{
      id: "source-ability-activation-now",
      sequence: 0,
      occurredAgoMs: 0,
      kind: "ability_use",
      outcome: "successful_activation",
      weaponType: "dagger",
      categories: ["mobility", "movement"],
    }],
  });
  assert.throws(() => sourceEventHistoryFromControls({ mode: "mobility_now", weaponType: "" }), /weapon type/);
  assert.throws(() => sourceEventHistoryFromControls({ mode: "movement_now", weaponType: "unsafe weapon" }), /weapon type/);
});

test("event controls recover only the exact supported shape", () => {
  const history = sourceEventHistoryFromControls({ mode: "mobility_now", weaponType: "crossbow" });
  assert.deepEqual(eventControlsFromSourceEventHistory(history), { mode: "mobility_now", weaponType: "crossbow" });
  assert.deepEqual(eventControlsFromSourceEventHistory({ ...history, lookbackMs: 1 }), { mode: "unspecified", weaponType: "" });
  assert.deepEqual(eventControlsFromSourceEventHistory({ ...history, events: [{ ...history.events[0], occurredAgoMs: 1 }] }), { mode: "unspecified", weaponType: "" });
  assert.deepEqual(eventControlsFromSourceEventHistory({ ...history, events: [{ ...history.events[0], outcome: "unknown" }] }), { mode: "unspecified", weaponType: "" });
});

test("event controls serialize canonically and reject malformed links", () => {
  for (const controls of [
    { mode: "unspecified", weaponType: "" },
    { mode: "mobility_now", weaponType: "dagger" },
    { mode: "movement_now", weaponType: "spear" },
    { mode: "mobility_movement_now", weaponType: "sword2h" },
  ]) {
    assert.deepEqual(decodeSourceEventControls(encodeSourceEventControls(controls)), {
      mode: controls.mode,
      weaponType: controls.mode === "unspecified" ? "" : controls.weaponType,
    });
  }
  assert.deepEqual(decodeSourceEventControls("bad"), { mode: "unspecified", weaponType: "" });
  assert.deepEqual(decodeSourceEventControls("mobility:unsafe%20weapon"), { mode: "unspecified", weaponType: "" });
});

test("event history formatting and scenario lookup share the canonical shape", () => {
  const history = sourceEventHistoryFromControls({ mode: "movement_now", weaponType: "spear" });
  const scenario = {
    source: { participantId: "source" },
    participants: [{ id: "target", eventHistory: { state: "unspecified" } }, { id: "source", eventHistory: history }],
  };
  assert.equal(scenarioSourceEventHistory(scenario), history);
  assert.equal(formatSourceEventHistory(history, (weapon) => weapon.toUpperCase()), "Movement activation now (SPEAR)");
  assert.equal(formatSourceEventHistory({ state: "unspecified" }), "skill event unspecified");
});
