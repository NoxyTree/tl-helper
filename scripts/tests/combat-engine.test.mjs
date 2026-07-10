import assert from "node:assert/strict";
import test from "node:test";
import {
  EventQueue,
  EVENT_TYPE,
  FixedPointContext,
  FormulaRegistry,
  PRECISION,
  ROUNDING,
  SeededRandom,
  UnsupportedFormulaError,
  createSyntheticFormulaRegistry,
  createUnitState,
  runSimulation,
  serializeSimulation,
} from "../../packages/combat-engine/src/index.mjs";

const fixed = new FixedPointContext({ scale: 100n, rounding: ROUNDING.TRUNCATE });

function snapshot(id) {
  return deepFreeze({
    schema: "tl-helper.build-snapshot",
    schemaVersion: 1,
    ruleset: { id: "synthetic-static", gameDataBuild: "synthetic" },
    identity: { id, name: id },
    character: { level: 1, attributes: {} },
    loadout: { equipment: {}, skills: [] },
    resolved: { stats: [], validation: { issues: [] } },
  });
}

function unit(id, overrides = {}) {
  return {
    id,
    buildSnapshot: snapshot(`${id}-build`),
    maximumHealth: "100",
    health: "100",
    maximumResource: "100",
    resource: "100",
    ...overrides,
  };
}

function simulate({ units = [unit("source"), unit("target")], actions, seed = "acceptance-seed" }) {
  return runSimulation({
    units,
    actions,
    seed,
    fixed,
    formulas: createSyntheticFormulaRegistry(),
    allowModeledFormulas: true,
  });
}

function action(id, effects, overrides = {}) {
  return { id, time: 0, actorId: "source", targetId: "target", effects, ...overrides };
}

test("fixed-point arithmetic follows configured rounding without fractional number inputs", () => {
  const left = fixed.from("1.25");
  const right = fixed.from("1.25");
  assert.equal(fixed.multiply(left, right, null, ROUNDING.TRUNCATE), 156n);
  assert.equal(fixed.multiply(left, right, null, ROUNDING.FLOOR), 156n);
  assert.equal(fixed.multiply(left, right, null, ROUNDING.CEIL), 157n);
  assert.equal(fixed.multiply(left, right, null, ROUNDING.NEAREST), 156n);
  assert.equal(fixed.divide(fixed.from(1), fixed.from(3), null, ROUNDING.CEIL), 34n);
  assert.throws(() => fixed.from(1.25), /safe integers/);
});

test("seeded random generator and simulation serialization replay exactly", () => {
  const firstRng = new SeededRandom("same-seed");
  const secondRng = new SeededRandom("same-seed");
  assert.deepEqual(
    Array.from({ length: 8 }, () => firstRng.nextUint32()),
    Array.from({ length: 8 }, () => secondRng.nextUint32()),
  );

  const scenario = {
    actions: [action("variable-hit", [{ type: "direct_damage", amountRange: { minimum: "10", maximum: "40" } }])],
    seed: "byte-identical",
  };
  assert.equal(serializeSimulation(simulate(scenario)), serializeSimulation(simulate(scenario)));
  const result = simulate(scenario);
  const damage = result.timeline.find((event) => event.type === EVENT_TYPE.DAMAGE);
  assert.deepEqual(Object.keys(damage.details.random).sort(), ["maximum", "minimum", "selected", "stateAfter", "stateBefore"]);
  assert.equal(damage.details.random.selected, damage.details.requested);
});

test("simultaneous events resolve by timestamp, phase, then stable sequence", () => {
  const queue = new EventQueue();
  queue.schedule({ time: 10, type: EVENT_TYPE.DAMAGE, id: "first-damage" });
  queue.schedule({ time: 10, type: EVENT_TYPE.HEALING, id: "second-same-phase" });
  queue.schedule({ time: 10, type: EVENT_TYPE.BUFF_EXPIRATION, id: "expiration" });
  queue.schedule({ time: 9, type: EVENT_TYPE.COOLDOWN_COMPLETION, id: "earlier" });
  assert.deepEqual(
    Array.from({ length: 4 }, () => queue.pop().id),
    ["earlier", "expiration", "first-damage", "second-same-phase"],
  );
});

test("damage clamps health at zero and healing clamps at maximum health", () => {
  const damage = simulate({ actions: [action("overkill", [{ type: "direct_damage", amount: "250" }])] });
  assert.equal(damage.finalState.target.health, "0");
  assert.equal(damage.finalState.target.alive, false);

  const healing = simulate({
    units: [unit("source"), unit("target", { health: "20" })],
    actions: [action("overheal", [{ type: "direct_healing", amount: "250" }])],
  });
  assert.equal(healing.finalState.target.health, "10000");
  const healEvent = healing.timeline.find((event) => event.type === EVENT_TYPE.HEALING);
  assert.equal(healEvent.details.effective, "8000");
  assert.equal(healEvent.details.overheal, "17000");
});

test("shields absorb damage in deterministic application order", () => {
  const result = simulate({
    actions: [
      action("shields", [
        { type: "shield", id: "first", amount: "10" },
        { type: "shield", id: "second", amount: "15" },
      ]),
      action("hit", [{ type: "direct_damage", amount: "18" }], { time: 1 }),
    ],
  });
  const hit = result.timeline.find((event) => event.type === EVENT_TYPE.DAMAGE);
  assert.deepEqual(hit.details.absorbed, [
    { shieldId: "first", amount: "1000" },
    { shieldId: "second", amount: "800" },
  ]);
  assert.equal(result.finalState.target.health, "10000");
  assert.equal(result.finalState.target.shields[0].id, "second");
  assert.equal(result.finalState.target.shields[0].remaining, "700");
});

test("timed shields expire by exact instance before same-timestamp damage", () => {
  const result = simulate({
    actions: [
      action("first-shield", [{ type: "shield", id: "shared", amount: "20", durationMs: 100 }]),
      action("replacement-shield", [{ type: "shield", id: "shared", amount: "30", durationMs: 200 }], { time: 50 }),
      action("expiry-hit", [{ type: "direct_damage", amount: "10" }], { time: 100 }),
    ],
  });
  const expiration = result.timeline.find((event) => event.type === EVENT_TYPE.SHIELD_EXPIRATION);
  assert.equal(expiration.time, 100);
  assert.equal(expiration.details.expired, true);
  const hit = result.timeline.find((event) => event.type === EVENT_TYPE.DAMAGE);
  assert.deepEqual(hit.details.absorbed, [{ shieldId: "shared", amount: "1000" }]);
  assert.equal(hit.state.target.shields.length, 1);
  assert.equal(hit.state.target.shields[0].remaining, "2000");
  assert.deepEqual(result.finalState.target.shields, []);
});

test("DoT and HoT ticks occur at declared synthetic timestamps", () => {
  const result = simulate({
    units: [unit("source"), unit("target", { health: "50" })],
    actions: [action("periodics", [
      { type: "damage_over_time", amount: "5", intervalMs: 100, tickCount: 3 },
      { type: "healing_over_time", amount: "2", intervalMs: 150, tickCount: 2 },
    ])],
  });
  assert.deepEqual(result.timeline.filter((event) => event.type === EVENT_TYPE.DOT_TICK).map((event) => event.time), [100, 200, 300]);
  assert.deepEqual(result.timeline.filter((event) => event.type === EVENT_TYPE.HOT_TICK).map((event) => event.time), [150, 300]);
  assert.equal(result.finalState.target.health, "3900");
});

test("timed buffs expire at the exact timestamp", () => {
  const result = simulate({ actions: [action("buff", [{ type: "timed_buff", id: "synthetic-power", durationMs: 750 }])] });
  const expiration = result.timeline.find((event) => event.type === EVENT_TYPE.BUFF_EXPIRATION);
  assert.equal(expiration.time, 750);
  assert.equal(expiration.details.expired, true);
  assert.deepEqual(result.finalState.target.activeBuffs, []);
});

test("resource costs and cooldown completion update state deterministically", () => {
  const result = simulate({
    actions: [
      action("costly", [], { resourceCost: "30", cooldownMs: 500 }),
      action("costly", [], { time: 100, resourceCost: "30", cooldownMs: 500 }),
    ],
  });
  assert.equal(result.finalState.source.resource, "7000");
  assert.deepEqual(result.finalState.source.cooldowns, {});
  const rejected = result.timeline.find((event) => event.type === EVENT_TYPE.ACTION_REQUESTED && event.time === 100);
  assert.equal(rejected.details.reason, "cooldown_active");
  const ready = result.timeline.find((event) => event.type === EVENT_TYPE.COOLDOWN_COMPLETION);
  assert.equal(ready.time, 500);
  assert.equal(ready.details.completed, true);
});

test("simultaneous action admission reserves resources and cooldowns atomically", () => {
  const resources = simulate({
    actions: [
      action("first", [], { resourceCost: "60" }),
      action("second", [], { resourceCost: "60" }),
    ],
  });
  const resourceAdmissions = resources.timeline.filter((event) => event.type === EVENT_TYPE.ACTION_REQUESTED);
  assert.deepEqual(resourceAdmissions.map((event) => [event.details.actionId, event.details.accepted, event.details.reason ?? null]), [
    ["first", true, null],
    ["second", false, "insufficient_resource"],
  ]);
  assert.equal(resources.finalState.source.resource, "4000");

  const cooldowns = simulate({
    actions: [
      action("first", [], { cooldownId: "shared", cooldownMs: 100 }),
      action("second", [], { cooldownId: "shared", cooldownMs: 100 }),
    ],
  });
  const cooldownAdmissions = cooldowns.timeline.filter((event) => event.type === EVENT_TYPE.ACTION_REQUESTED);
  assert.deepEqual(cooldownAdmissions.map((event) => [event.details.actionId, event.details.accepted, event.details.reason ?? null]), [
    ["first", true, null],
    ["second", false, "cooldown_active"],
  ]);
});

test("simulation validates event budgets before eager scheduling", () => {
  assert.throws(() => runSimulation({
    units: [unit("source"), unit("target")],
    actions: [action("one", []), action("two", [])],
    seed: "budget",
    fixed,
    formulas: createSyntheticFormulaRegistry(),
    allowModeledFormulas: true,
    maximumEvents: 1,
  }), /exceeded maximumEvents \(1\)/);
  for (const invalid of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => runSimulation({
      units: [unit("source"), unit("target")], actions: [], seed: "budget", fixed,
      formulas: createSyntheticFormulaRegistry(), maximumEvents: invalid,
    }), /positive safe integer/);
  }
});

test("negative magnitudes, inverted ranges, and unsafe identifiers are rejected", () => {
  assert.throws(() => simulate({ actions: [action("negative", [{ type: "direct_damage", amount: "-1" }])] }), /amount cannot be negative/);
  assert.throws(() => simulate({ actions: [action("range", [{ type: "direct_damage", amountRange: { minimum: "5", maximum: "1" } }])] }), /minimum cannot exceed maximum/);
  assert.throws(() => simulate({ actions: [action("cost", [], { resourceCost: "-1" })] }), /resourceCost cannot be negative/);
  assert.throws(() => simulate({ units: [unit("__proto__"), unit("target")], actions: [] }), /safe non-empty string identifier/);
  assert.throws(() => simulate({ actions: [action(" bad ", [])] }), /safe non-empty string identifier/);
  assert.throws(() => simulate({ actions: [action("shield", [{ type: "shield", amount: "1" }])] }), /safe non-empty string identifier/);
  assert.throws(() => simulate({ actions: [action("unknown", [{ type: "real_tl_damage", amount: "10" }])] }), /Unsupported synthetic effect type/);
  assert.throws(() => simulate({ actions: [action("direction", [{ type: "resource_change", amount: "10", direction: "sideways" }])] }), /direction must be increase or decrease/);
});

test("formula traces contain each arithmetic stage and provenance metadata", () => {
  const traces = [];
  let sequence = 0;
  const registry = new FormulaRegistry().register({
    id: "synthetic.multiply-add",
    gameBuild: "synthetic",
    sourceTable: "test-fixtures",
    sourceRow: "multiply-add",
    precision: PRECISION.MODELED,
    provenance: "synthetic",
    traceMetadata: { purpose: "stage coverage" },
    calculate: ({ base, multiplier, add }, { fixed: arithmetic, trace }) => {
      const multiplied = arithmetic.multiply(base, multiplier, trace, ROUNDING.TRUNCATE);
      return arithmetic.add(multiplied, add, trace);
    },
  });
  const result = registry.evaluate("synthetic.multiply-add", {
    base: fixed.from("10"), multiplier: fixed.from("1.5"), add: fixed.from("2"),
  }, {
    fixed, traces, nextTraceId: () => `trace-${sequence++}`,
  }, { allowModeled: true });
  assert.equal(result.output, fixed.from("17"));
  assert.deepEqual(traces[0].stages.map((stage) => stage.operation), ["multiply", "add"]);
  assert.equal(traces[0].stages[0].rounding, ROUNDING.TRUNCATE);
  assert.equal(traces[0].formula.sourceTable, "test-fixtures");
  assert.equal(traces[0].formula.precision, PRECISION.MODELED);
  assert.deepEqual(Object.keys(traces[0].inputs).sort(), ["add", "base", "multiplier"]);
});

test("unknown formulas cannot silently execute or claim verified status", () => {
  const registry = createSyntheticFormulaRegistry();
  assert.throws(
    () => registry.evaluate("tl.unknown-damage-pipeline", {}, { traces: [], nextTraceId: () => "trace-0" }),
    UnsupportedFormulaError,
  );
  assert.throws(() => new FormulaRegistry().register({
    id: "invalid-verified",
    gameBuild: "unknown",
    sourceTable: "unknown",
    sourceRow: "unknown",
    precision: PRECISION.VERIFIED_EXACT,
    provenance: "unresolved",
    calculate: () => 0n,
  }), /cannot claim verified_exact/);
});

test("BuildSnapshot references remain identical and immutable", () => {
  const buildSnapshot = snapshot("immutable-build");
  const before = JSON.stringify(buildSnapshot);
  const state = createUnitState(unit("owner", { buildSnapshot }), fixed);
  assert.equal(state.buildSnapshot, buildSnapshot);
  assert.equal(Object.isFrozen(buildSnapshot), true);
  simulate({
    units: [unit("source"), unit("target", { buildSnapshot })],
    actions: [action("hit", [{ type: "direct_damage", amount: "5" }])],
  });
  assert.equal(JSON.stringify(buildSnapshot), before);
  assert.equal(Object.isFrozen(buildSnapshot), true);
  assert.throws(
    () => createUnitState(unit("mutable", { buildSnapshot: { identity: { id: "mutable" } } }), fixed),
    /deeply immutable/,
  );
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
