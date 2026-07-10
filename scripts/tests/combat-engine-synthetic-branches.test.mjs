import assert from "node:assert/strict";
import test from "node:test";
import {
  EVENT_TYPE,
  FixedPointContext,
  ROUNDING,
  createSyntheticFormulaRegistry,
  runSimulation,
  serializeSimulation,
} from "../../packages/combat-engine/src/index.mjs";

const fixed = new FixedPointContext({ scale: 100n, rounding: ROUNDING.TRUNCATE });

function snapshot(id) {
  return Object.freeze({
    schema: "tl-helper.build-snapshot",
    schemaVersion: 1,
    identity: Object.freeze({ id, name: id }),
  });
}

function unit(id, overrides = {}) {
  return {
    id,
    buildSnapshot: snapshot(`${id}-build`),
    maximumHealth: "500",
    health: "500",
    maximumResource: "100",
    resource: "100",
    ...overrides,
  };
}

function damageEffect(outcome) {
  return {
    type: "direct_damage",
    amount: "100",
    formulaId: "synthetic.static-mitigated-damage.v1",
    formulaInputs: {
      targetMitigation: fixed.from("0.25"),
      outcome,
      criticalMultiplier: fixed.from("1.5"),
    },
  };
}

function scenario(outcome) {
  return {
    units: [unit("source"), unit("target")],
    actions: [{
      id: `forced-${outcome}`,
      time: 0,
      actorId: "source",
      targetId: "target",
      resourceCost: "20",
      cooldownMs: 500,
      effects: [
        { type: "timed_buff", id: "synthetic-window", durationMs: 250 },
        damageEffect(outcome),
      ],
    }],
    seed: "synthetic-branches",
    fixed,
    formulas: createSyntheticFormulaRegistry(),
    allowModeledFormulas: true,
  };
}

test("explicitly modeled damage fixture traces mitigation and forced normal versus critical branches", () => {
  const normal = runSimulation(scenario("normal"));
  const critical = runSimulation(scenario("critical"));

  assert.equal(normal.finalState.target.health, "42500");
  assert.equal(critical.finalState.target.health, "38750");
  assert.equal(normal.finalState.source.resource, "8000");
  assert.deepEqual(normal.finalState.source.cooldowns, {});
  assert.deepEqual(normal.finalState.target.activeBuffs, []);

  const normalDamage = normal.timeline.find((event) => event.type === EVENT_TYPE.DAMAGE);
  const criticalDamage = critical.timeline.find((event) => event.type === EVENT_TYPE.DAMAGE);
  const normalTrace = normal.traces.find((trace) => trace.id === normalDamage.traceIds[0]);
  const criticalTrace = critical.traces.find((trace) => trace.id === criticalDamage.traceIds[0]);

  assert.equal(normalTrace.formula.precision, "modeled");
  assert.equal(normalTrace.formula.traceMetadata.realGameFormula, false);
  assert.equal(normalTrace.inputs.outcome, "normal");
  assert.equal(criticalTrace.inputs.outcome, "critical");
  assert.deepEqual(normalTrace.stages.map((stage) => stage.operation), ["subtract", "multiply", "add"]);
  assert.deepEqual(criticalTrace.stages.map((stage) => stage.operation), ["subtract", "multiply", "multiply"]);
  assert.equal(normalTrace.output, "7500");
  assert.equal(criticalTrace.output, "11250");

  const expiration = normal.timeline.find((event) => event.type === EVENT_TYPE.BUFF_EXPIRATION);
  const cooldown = normal.timeline.find((event) => event.type === EVENT_TYPE.COOLDOWN_COMPLETION);
  assert.equal(expiration.time, 250);
  assert.equal(expiration.details.expired, true);
  assert.equal(cooldown.time, 500);
  assert.equal(cooldown.details.completed, true);
});

test("synthetic forced-outcome fixture replays byte-identically and rejects invented branches", () => {
  const first = runSimulation(scenario("critical"));
  const second = runSimulation(scenario("critical"));
  assert.equal(serializeSimulation(first), serializeSimulation(second));

  assert.throws(
    () => runSimulation(scenario("heavy")),
    /forced to normal or critical/,
  );
});
