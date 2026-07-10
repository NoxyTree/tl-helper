export const ROUNDING = Object.freeze({
  FLOOR: "floor",
  CEIL: "ceil",
  TRUNCATE: "truncate",
  NEAREST: "nearest",
});

const ROUNDING_VALUES = new Set(Object.values(ROUNDING));

export class FixedPointContext {
  constructor({ scale = 10_000n, rounding = ROUNDING.TRUNCATE } = {}) {
    this.scale = toPositiveBigInt(scale, "scale");
    this.rounding = assertRounding(rounding);
    Object.freeze(this);
  }

  from(value) {
    if (typeof value === "bigint") return value * this.scale;
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) {
        throw new TypeError("Fixed-point number inputs must be safe integers; use a decimal string for fractions.");
      }
      return BigInt(value) * this.scale;
    }
    if (typeof value !== "string") throw new TypeError("Fixed-point values must be bigint, safe integer, or decimal string.");
    const match = value.trim().match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
    if (!match) throw new TypeError(`Invalid fixed-point decimal: ${value}`);
    const sign = match[1] === "-" ? -1n : 1n;
    const whole = BigInt(match[2]);
    const fraction = match[3] ?? "";
    const denominator = 10n ** BigInt(fraction.length);
    const numerator = whole * denominator + BigInt(fraction || "0");
    return sign * divideRounded(numerator * this.scale, denominator, this.rounding).quotient;
  }

  format(value) {
    assertScaled(value);
    const sign = value < 0n ? "-" : "";
    const absolute = value < 0n ? -value : value;
    const whole = absolute / this.scale;
    const fraction = absolute % this.scale;
    if (fraction === 0n) return `${sign}${whole}`;
    const digits = this.scale.toString().length - 1;
    if (10n ** BigInt(digits) !== this.scale) return `${value}/${this.scale}`;
    return `${sign}${whole}.${fraction.toString().padStart(digits, "0").replace(/0+$/, "")}`;
  }

  add(left, right, trace) {
    assertPair(left, right);
    return record(trace, "add", [left, right], left + right, this, ROUNDING.TRUNCATE, 0n);
  }

  subtract(left, right, trace) {
    assertPair(left, right);
    return record(trace, "subtract", [left, right], left - right, this, ROUNDING.TRUNCATE, 0n);
  }

  multiply(left, right, trace, rounding = this.rounding) {
    assertPair(left, right);
    const mode = assertRounding(rounding);
    const result = divideRounded(left * right, this.scale, mode);
    return record(trace, "multiply", [left, right], result.quotient, this, mode, result.remainder);
  }

  divide(left, right, trace, rounding = this.rounding) {
    assertPair(left, right);
    if (right === 0n) throw new RangeError("Fixed-point division by zero.");
    const mode = assertRounding(rounding);
    const result = divideRounded(left * this.scale, right, mode);
    return record(trace, "divide", [left, right], result.quotient, this, mode, result.remainder);
  }
}

export function divideRounded(numerator, denominator, rounding) {
  if (typeof numerator !== "bigint" || typeof denominator !== "bigint") throw new TypeError("Rounded division requires bigint operands.");
  if (denominator === 0n) throw new RangeError("Division by zero.");
  const mode = assertRounding(rounding);
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n || mode === ROUNDING.TRUNCATE) return { quotient, remainder };

  const sameSign = (numerator < 0n) === (denominator < 0n);
  if (mode === ROUNDING.FLOOR) return { quotient: sameSign ? quotient : quotient - 1n, remainder };
  if (mode === ROUNDING.CEIL) return { quotient: sameSign ? quotient + 1n : quotient, remainder };

  const absoluteRemainder = remainder < 0n ? -remainder : remainder;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const awayFromZero = absoluteRemainder * 2n >= absoluteDenominator;
  if (!awayFromZero) return { quotient, remainder };
  return { quotient: quotient + (sameSign ? 1n : -1n), remainder };
}

function record(trace, operation, inputs, output, context, rounding, remainder) {
  trace?.recordArithmetic({
    operation,
    inputs: inputs.map(String),
    scale: context.scale.toString(),
    rounding,
    discardedRemainder: remainder.toString(),
    output: output.toString(),
  });
  return output;
}

function assertPair(left, right) {
  assertScaled(left);
  assertScaled(right);
}

function assertScaled(value) {
  if (typeof value !== "bigint") throw new TypeError("Fixed-point arithmetic requires scaled bigint values.");
}

function toPositiveBigInt(value, name) {
  const result = typeof value === "bigint" ? value : BigInt(value);
  if (result <= 0n) throw new RangeError(`${name} must be a positive integer.`);
  return result;
}

function assertRounding(rounding) {
  if (!ROUNDING_VALUES.has(rounding)) throw new RangeError(`Unsupported rounding mode: ${rounding}`);
  return rounding;
}
