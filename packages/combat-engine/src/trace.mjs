export class CalculationTrace {
  constructor({ id, formula, inputs }) {
    this.id = id;
    this.formula = immutableCopy(formula);
    this.inputs = serializeValues(inputs);
    this.stages = [];
    this.output = null;
    this.warnings = [];
  }

  recordArithmetic(stage) {
    this.stages.push(Object.freeze({ index: this.stages.length, ...stage }));
  }

  warn(message) {
    this.warnings.push(String(message));
  }

  complete(output) {
    this.output = serializeValue(output);
    return Object.freeze({
      id: this.id,
      formula: this.formula,
      inputs: this.inputs,
      stages: Object.freeze([...this.stages]),
      output: this.output,
      warnings: Object.freeze([...this.warnings]),
    });
  }
}

export function serializeValue(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializeValue(child)]));
  return value;
}

function serializeValues(values) {
  return Object.freeze(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, serializeValue(value)])));
}

function immutableCopy(value) {
  return Object.freeze(serializeValue(value));
}
