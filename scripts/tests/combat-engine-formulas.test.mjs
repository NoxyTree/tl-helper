import assert from "node:assert/strict";
import test from "node:test";
import {
  FixedPointContext,
  FormulaRegistry,
  PRECISION,
  ROUNDING,
  UnsupportedFormulaError,
  divideRounded,
} from "../../packages/combat-engine/src/index.mjs";

const fixed = new FixedPointContext({ scale: 100n, rounding: ROUNDING.TRUNCATE });

function definition(overrides = {}) {
  return {
    id: "test.formula",
    gameBuild: "test-build",
    sourceTable: "test-table",
    sourceRow: "test-row",
    precision: PRECISION.MODELED,
    provenance: "synthetic",
    traceMetadata: { purpose: "formula contract test" },
    calculate: ({ value }, { fixed: arithmetic, trace }) => arithmetic.add(value, 0n, trace),
    ...overrides,
  };
}

function context() {
  return { fixed, traces: [], nextTraceId: () => "trace-0" };
}

test("formula definitions require nonempty object trace metadata", () => {
  for (const traceMetadata of [undefined, null, {}, []]) {
    assert.throws(
      () => new FormulaRegistry().register(definition({ traceMetadata })),
      /requires nonempty traceMetadata/,
    );
  }

  assert.doesNotThrow(() => new FormulaRegistry().register(definition()));
});

test("modeled formulas refuse implicit execution and execute after direct opt-in", () => {
  const registry = new FormulaRegistry().register(definition());
  const refusedContext = context();

  assert.throws(
    () => registry.evaluate("test.formula", { value: fixed.from(3) }, refusedContext),
    (error) => error instanceof UnsupportedFormulaError && /allowModeled=true/.test(error.message),
  );
  assert.deepEqual(refusedContext.traces, []);

  const allowedContext = context();
  const result = registry.evaluate(
    "test.formula",
    { value: fixed.from(3) },
    allowedContext,
    { allowModeled: true },
  );
  assert.equal(result.output, fixed.from(3));
  assert.equal(allowedContext.traces.length, 1);
  assert.deepEqual(allowedContext.traces[0].warnings, ["Modeled formula executed by explicit opt-in."]);
});

test("verified precision requires reviewed provenance and retains it in the trace", () => {
  for (const provenance of ["synthetic", "unresolved", "modeled"]) {
    assert.throws(
      () => new FormulaRegistry().register(definition({
        id: `test.invalid-${provenance}`,
        precision: PRECISION.VERIFIED_EXACT,
        provenance,
      })),
      /cannot claim verified_exact/,
    );
  }

  for (const provenance of ["extracted", "official", "calibrated"]) {
    const id = `test.verified-${provenance}`;
    const registry = new FormulaRegistry().register(definition({
      id,
      precision: PRECISION.VERIFIED_CALIBRATED,
      provenance,
    }));
    const evaluationContext = context();
    registry.evaluate(id, { value: fixed.from(1) }, evaluationContext);
    assert.equal(evaluationContext.traces[0].formula.provenance, provenance);
    assert.equal(evaluationContext.traces[0].formula.precision, PRECISION.VERIFIED_CALIBRATED);
  }
});

test("an executable formula must record at least one arithmetic stage", () => {
  const registry = new FormulaRegistry().register(definition({
    calculate: ({ value }) => value,
  }));
  const evaluationContext = context();

  assert.throws(
    () => registry.evaluate("test.formula", { value: fixed.from(1) }, evaluationContext, { allowModeled: true }),
    /did not record an arithmetic stage/,
  );
  assert.deepEqual(evaluationContext.traces, []);
});

test("negative rounded division honors floor, ceiling, and nearest semantics", () => {
  assert.equal(divideRounded(-5n, 2n, ROUNDING.FLOOR).quotient, -3n);
  assert.equal(divideRounded(-5n, 2n, ROUNDING.CEIL).quotient, -2n);
  assert.equal(divideRounded(-5n, 2n, ROUNDING.NEAREST).quotient, -3n);

  assert.equal(divideRounded(5n, -2n, ROUNDING.FLOOR).quotient, -3n);
  assert.equal(divideRounded(5n, -2n, ROUNDING.CEIL).quotient, -2n);
  assert.equal(divideRounded(5n, -2n, ROUNDING.NEAREST).quotient, -3n);

  assert.equal(divideRounded(-1n, 3n, ROUNDING.NEAREST).quotient, 0n);
  assert.equal(fixed.multiply(fixed.from("-1.25"), fixed.from("1.26"), null, ROUNDING.FLOOR), -158n);
  assert.equal(fixed.multiply(fixed.from("-1.25"), fixed.from("1.26"), null, ROUNDING.CEIL), -157n);
  assert.equal(fixed.multiply(fixed.from("-1.25"), fixed.from("1.26"), null, ROUNDING.NEAREST), -158n);
});
