import { CalculationTrace } from "./trace.mjs";

export const PRECISION = Object.freeze({
  VERIFIED_EXACT: "verified_exact",
  VERIFIED_CALIBRATED: "verified_calibrated",
  DERIVED_HIGH_CONFIDENCE: "derived_high_confidence",
  MODELED: "modeled",
  UNSUPPORTED: "unsupported",
});

const PRECISION_VALUES = new Set(Object.values(PRECISION));
const VERIFIED_PRECISION = new Set([PRECISION.VERIFIED_EXACT, PRECISION.VERIFIED_CALIBRATED]);
const VERIFIED_PROVENANCE = new Set(["extracted", "official", "calibrated"]);

export class UnsupportedFormulaError extends Error {
  constructor(formulaId, reason) {
    super(`Formula ${formulaId} is unsupported: ${reason}`);
    this.name = "UnsupportedFormulaError";
    this.formulaId = formulaId;
  }
}

export class FormulaRegistry {
  constructor() {
    this.definitions = new Map();
  }

  register(definition) {
    validateDefinition(definition);
    if (this.definitions.has(definition.id)) throw new Error(`Formula already registered: ${definition.id}`);
    this.definitions.set(definition.id, Object.freeze({ ...definition, traceMetadata: deepFreezeCopy(definition.traceMetadata ?? {}) }));
    return this;
  }

  get(id) {
    const definition = this.definitions.get(id);
    if (!definition) throw new UnsupportedFormulaError(id, "not registered");
    return definition;
  }

  evaluate(id, inputs, context, { allowModeled = false } = {}) {
    const definition = this.get(id);
    if (definition.precision === PRECISION.UNSUPPORTED || typeof definition.calculate !== "function") {
      throw new UnsupportedFormulaError(id, definition.unsupportedReason ?? "no reviewed calculation is available");
    }
    if (definition.precision === PRECISION.MODELED && !allowModeled) {
      throw new UnsupportedFormulaError(id, "modeled formulas require explicit allowModeled=true");
    }

    const trace = new CalculationTrace({
      id: context.nextTraceId(),
      formula: formulaMetadata(definition),
      inputs,
    });
    if (definition.precision === PRECISION.MODELED) trace.warn("Modeled formula executed by explicit opt-in.");
    const output = definition.calculate(Object.freeze({ ...inputs }), Object.freeze({ ...context, trace }));
    if (trace.stages.length === 0) throw new Error(`Formula ${id} did not record an arithmetic stage.`);
    const completed = trace.complete(output);
    context.traces.push(completed);
    return { output, traceId: completed.id };
  }
}

function validateDefinition(definition) {
  if (!definition || typeof definition !== "object") throw new TypeError("Formula definition must be an object.");
  for (const key of ["id", "gameBuild", "sourceTable", "sourceRow", "precision", "provenance"]) {
    if (typeof definition[key] !== "string" || !definition[key]) throw new Error(`Formula definition requires ${key}.`);
  }
  if (!PRECISION_VALUES.has(definition.precision)) throw new Error(`Unknown precision label: ${definition.precision}`);
  if (VERIFIED_PRECISION.has(definition.precision) && !VERIFIED_PROVENANCE.has(definition.provenance)) {
    throw new Error(`Formula ${definition.id} cannot claim ${definition.precision} with ${definition.provenance} provenance.`);
  }
  if (
    !definition.traceMetadata
    || typeof definition.traceMetadata !== "object"
    || Array.isArray(definition.traceMetadata)
    || Object.keys(definition.traceMetadata).length === 0
  ) {
    throw new Error(`Formula ${definition.id} requires nonempty traceMetadata.`);
  }
  if (definition.precision === PRECISION.UNSUPPORTED && typeof definition.calculate === "function") {
    throw new Error(`Unsupported formula ${definition.id} cannot provide an executable calculation.`);
  }
  if (definition.precision !== PRECISION.UNSUPPORTED && typeof definition.calculate !== "function") {
    throw new Error(`Formula ${definition.id} requires a calculation function.`);
  }
}

function formulaMetadata(definition) {
  return {
    id: definition.id,
    gameBuild: definition.gameBuild,
    sourceTable: definition.sourceTable,
    sourceRow: definition.sourceRow,
    precision: definition.precision,
    provenance: definition.provenance,
    traceMetadata: definition.traceMetadata,
  };
}

function deepFreezeCopy(value) {
  if (!value || typeof value !== "object") return value;
  const copy = Array.isArray(value) ? value.map(deepFreezeCopy) : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, deepFreezeCopy(child)]));
  for (const child of Object.values(copy)) if (child && typeof child === "object" && !Object.isFrozen(child)) Object.freeze(child);
  return Object.freeze(copy);
}
