const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_BUILD = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DECIMAL = /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value;
}

export function assertOnlyKeys(value, allowed, label) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new Error(`${label} contains unknown field: ${key}`);
  }
}

export function requireId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new TypeError(`${label} must be a safe identifier.`);
  return value;
}

export function requireBuild(value, label) {
  if (typeof value !== "string" || !SAFE_BUILD.test(value)) throw new TypeError(`${label} must be a safe game-build identifier.`);
  return value;
}

export function assertExpectedBuild(actual, expected, label = "gameBuild") {
  if (expected === undefined) return;
  const normalizedExpected = requireBuild(expected, "expectedGameBuild");
  if (actual !== normalizedExpected) throw new Error(`${label} ${actual} does not match expected gameBuild ${normalizedExpected}.`);
}

export function requireMatchingBuild(value, expected, label) {
  const actual = requireBuild(value, label);
  if (actual !== expected) throw new Error(`${label} ${actual} does not match definition gameBuild ${expected}.`);
  return actual;
}

export function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} must be nonempty text.`);
  return value.trim();
}

export function requireEnum(value, allowed, label) {
  if (!allowed.has(value)) throw new Error(`Unknown ${label}: ${String(value)}`);
  return value;
}

export function requireBoolean(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean.`);
  return value;
}

export function requireNonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a nonnegative safe integer.`);
  return value;
}

export function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive safe integer.`);
  return value;
}

export function normalizeDecimal(value, label, { nonnegative = false } = {}) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
    value = String(value);
  } else if (typeof value === "bigint") {
    value = value.toString();
  }
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new TypeError(`${label} must be a plain decimal value.`);
  const negative = value.startsWith("-");
  const unsigned = /^[+-]/.test(value) ? value.slice(1) : value;
  const [whole, rawFraction = ""] = unsigned.split(".");
  const fraction = rawFraction.replace(/0+$/, "");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
  const isZero = /^0+$/.test(normalizedWhole) && fraction === "";
  const normalized = `${negative && !isZero ? "-" : ""}${normalizedWhole}${fraction ? `.${fraction}` : ""}`;
  if (nonnegative && normalized.startsWith("-")) throw new RangeError(`${label} must be nonnegative.`);
  return normalized;
}

export function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
