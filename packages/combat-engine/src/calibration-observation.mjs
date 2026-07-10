export const CALIBRATION_OBSERVATION_SCHEMA = "tl-helper.combat-calibration-observation";
export const CALIBRATION_OBSERVATION_SCHEMA_VERSION = 1;

export const CALIBRATION_SCENARIO_MODE = Object.freeze({
  DAMAGE: "damage",
  HEALING: "healing",
  SHIELDING: "shielding",
  TOOLTIP: "tooltip",
});

export const CALIBRATION_EVIDENCE_TYPE = Object.freeze({
  MANUAL: "manual",
  SCREENSHOT: "screenshot",
  RECORDING: "recording",
  OCR_REVIEWED: "ocr_reviewed",
});

export const CALIBRATION_STATUS = Object.freeze({
  DRAFT: "draft",
  REVIEWED: "reviewed",
  REJECTED: "rejected",
});

const SCENARIO_MODES = new Set(Object.values(CALIBRATION_SCENARIO_MODE));
const EVIDENCE_TYPES = new Set(Object.values(CALIBRATION_EVIDENCE_TYPE));
const STATUSES = new Set(Object.values(CALIBRATION_STATUS));
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_BUILD = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DECIMAL = /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const SHA256 = /^(?:sha256:)?([a-fA-F0-9]{64})$/;
const CONTENT_ID = /^sha256-[a-f0-9]{64}$/;
const SHA256_INITIAL = Object.freeze([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);
const SHA256_ROUND = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/**
 * Validate, detach, canonically normalize, identify, and deeply freeze one
 * caller-declared calibration observation. Observations are evidence, never
 * executable formula definitions or verified formula claims.
 */
export function normalizeCalibrationObservation(input) {
  const value = requireRecord(input, "Calibration observation");
  assertOnlyKeys(value, [
    "schema", "schemaVersion", "contentId", "experimentId", "attemptNumber", "recordedAt",
    "gameBuild", "gameVersion", "scenario", "participants",
    "inputs", "observedOutcome", "evidence", "notes", "reviewer", "status", "rejectionReasons",
  ], "Calibration observation");
  if (value.schema !== CALIBRATION_OBSERVATION_SCHEMA) {
    throw new Error(`Unsupported calibration observation schema: ${String(value.schema)}`);
  }
  if (value.schemaVersion !== CALIBRATION_OBSERVATION_SCHEMA_VERSION) {
    throw new Error(`Unsupported calibration observation schemaVersion: ${String(value.schemaVersion)}`);
  }

  const status = requireEnum(value.status, STATUSES, "status");
  const reviewer = value.reviewer === undefined ? undefined : requireText(value.reviewer, "reviewer");
  if (status === CALIBRATION_STATUS.REVIEWED && reviewer === undefined) {
    throw new Error("reviewer is required when status is reviewed.");
  }
  const rejectionReasons = value.rejectionReasons === undefined
    ? undefined
    : normalizeRejectionReasons(value.rejectionReasons);
  if (status === CALIBRATION_STATUS.REJECTED) {
    if (rejectionReasons === undefined || rejectionReasons.length === 0) {
      throw new Error("rejectionReasons must be nonempty when status is rejected.");
    }
  } else if (rejectionReasons !== undefined) {
    throw new Error("rejectionReasons are only allowed when status is rejected.");
  }

  const payload = {
    schema: CALIBRATION_OBSERVATION_SCHEMA,
    schemaVersion: CALIBRATION_OBSERVATION_SCHEMA_VERSION,
    experimentId: requireId(value.experimentId, "experimentId"),
    attemptNumber: requirePositiveInteger(value.attemptNumber, "attemptNumber"),
    recordedAt: normalizeTimestamp(value.recordedAt, "recordedAt"),
    gameBuild: requireBuild(value.gameBuild, "gameBuild"),
    ...(value.gameVersion === undefined ? {} : { gameVersion: requireBuild(value.gameVersion, "gameVersion") }),
    scenario: normalizeScenario(value.scenario),
    participants: normalizeParticipants(value.participants),
    inputs: normalizeInputs(value.inputs),
    observedOutcome: normalizeOutcome(value.observedOutcome),
    evidence: normalizeEvidence(value.evidence),
    ...(value.notes === undefined ? {} : { notes: requireText(value.notes, "notes") }),
    ...(reviewer === undefined ? {} : { reviewer }),
    status,
    ...(rejectionReasons === undefined ? {} : { rejectionReasons }),
  };
  const contentId = contentIdForPayload(payload);
  if (value.contentId !== undefined) {
    if (typeof value.contentId !== "string" || !CONTENT_ID.test(value.contentId)) {
      throw new TypeError("contentId must be a lowercase filesystem-safe SHA-256 content identifier.");
    }
    if (value.contentId !== contentId) throw new Error("contentId does not match the calibration observation payload.");
  }
  return deepFreeze({
    schema: payload.schema,
    schemaVersion: payload.schemaVersion,
    contentId,
    ...Object.fromEntries(Object.entries(payload).slice(2)),
  });
}

export const createCalibrationObservation = normalizeCalibrationObservation;

export function validateCalibrationObservation(input) {
  normalizeCalibrationObservation(input);
  return true;
}

export function serializeCalibrationObservation(input) {
  return canonicalJson(normalizeCalibrationObservation(input));
}

export function calibrationObservationContentId(input) {
  return normalizeCalibrationObservation(input).contentId;
}

function normalizeScenario(input) {
  const value = requireRecord(input, "scenario");
  assertOnlyKeys(value, ["mode", "abilityId", "skillLevel", "component"], "scenario");
  return {
    mode: requireEnum(value.mode, SCENARIO_MODES, "scenario.mode"),
    abilityId: requireId(value.abilityId, "scenario.abilityId"),
    skillLevel: requirePositiveInteger(value.skillLevel, "scenario.skillLevel"),
    component: requireId(value.component, "scenario.component"),
  };
}

function normalizeParticipants(input) {
  const value = requireRecord(input, "participants");
  assertOnlyKeys(value, ["source", "target"], "participants");
  return {
    source: normalizeParticipant(value.source, "participants.source"),
    target: normalizeParticipant(value.target, "participants.target"),
  };
}

function normalizeParticipant(input, label) {
  const value = requireRecord(input, label);
  assertOnlyKeys(value, ["buildSnapshotId", "buildSnapshotHash"], label);
  if (value.buildSnapshotId === undefined && value.buildSnapshotHash === undefined) {
    throw new Error(`${label} requires buildSnapshotId or buildSnapshotHash.`);
  }
  return {
    ...(value.buildSnapshotId === undefined ? {} : { buildSnapshotId: requireId(value.buildSnapshotId, `${label}.buildSnapshotId`) }),
    ...(value.buildSnapshotHash === undefined ? {} : { buildSnapshotHash: normalizeSha256(value.buildSnapshotHash, `${label}.buildSnapshotHash`) }),
  };
}

function normalizeInputs(input) {
  const value = requireRecord(input, "inputs");
  assertOnlyKeys(value, ["sourceStats", "targetStats", "baseDamage", "controlledVariables", "activeEffects"], "inputs");
  if (!Array.isArray(value.activeEffects)) throw new TypeError("inputs.activeEffects must be an array.");
  const activeEffects = value.activeEffects.map(normalizeActiveEffect);
  const effectKeys = new Set();
  for (const effect of activeEffects) {
    const key = `${effect.owner}\0${effect.effectId}`;
    if (effectKeys.has(key)) throw new Error(`inputs.activeEffects contains duplicate ${effect.owner} effect ${effect.effectId}.`);
    effectKeys.add(key);
  }
  activeEffects.sort((left, right) => compareStrings(`${left.owner}\0${left.effectId}`, `${right.owner}\0${right.effectId}`));
  return {
    sourceStats: normalizeDecimalRecord(value.sourceStats, "inputs.sourceStats"),
    targetStats: normalizeDecimalRecord(value.targetStats, "inputs.targetStats"),
    ...(value.baseDamage === undefined ? {} : { baseDamage: normalizeBaseDamage(value.baseDamage) }),
    controlledVariables: normalizeControlledVariables(value.controlledVariables),
    activeEffects,
  };
}

function normalizeBaseDamage(input) {
  if (typeof input === "string") return { value: requireDecimal(input, "inputs.baseDamage") };
  const value = requireRecord(input, "inputs.baseDamage");
  assertOnlyKeys(value, ["value", "minimum", "maximum"], "inputs.baseDamage");
  if (value.value !== undefined) {
    if (value.minimum !== undefined || value.maximum !== undefined) throw new Error("inputs.baseDamage cannot combine value with minimum or maximum.");
    return { value: requireDecimal(value.value, "inputs.baseDamage.value") };
  }
  if (value.minimum === undefined || value.maximum === undefined) {
    throw new Error("inputs.baseDamage requires value or both minimum and maximum.");
  }
  const minimum = requireDecimal(value.minimum, "inputs.baseDamage.minimum");
  const maximum = requireDecimal(value.maximum, "inputs.baseDamage.maximum");
  if (compareDecimals(minimum, maximum) > 0) throw new RangeError("inputs.baseDamage minimum cannot exceed maximum.");
  return { minimum, maximum };
}

function normalizeControlledVariables(input) {
  const value = requireRecord(input, "inputs.controlledVariables");
  return normalizeJsonRecord(value, "inputs.controlledVariables", true);
}

function normalizeActiveEffect(input, index) {
  const label = `inputs.activeEffects[${index}]`;
  const value = requireRecord(input, label);
  assertOnlyKeys(value, ["owner", "effectId", "kind", "stacks", "magnitude", "remainingMs"], label);
  if (value.owner !== "source" && value.owner !== "target") throw new Error(`${label}.owner must be source or target.`);
  return {
    owner: value.owner,
    effectId: requireId(value.effectId, `${label}.effectId`),
    kind: requireId(value.kind, `${label}.kind`),
    ...(value.stacks === undefined ? {} : { stacks: requirePositiveInteger(value.stacks, `${label}.stacks`) }),
    ...(value.magnitude === undefined ? {} : { magnitude: requireDecimal(value.magnitude, `${label}.magnitude`) }),
    ...(value.remainingMs === undefined ? {} : { remainingMs: requireNonnegativeInteger(value.remainingMs, `${label}.remainingMs`) }),
  };
}

function normalizeOutcome(input) {
  const value = requireRecord(input, "observedOutcome");
  assertOnlyKeys(value, ["magnitude", "flags", "timestamps"], "observedOutcome");
  const flagsValue = requireRecord(value.flags, "observedOutcome.flags");
  assertOnlyKeys(flagsValue, ["normal", "critical", "heavy", "blocked", "missed"], "observedOutcome.flags");
  const flags = Object.fromEntries(["normal", "critical", "heavy", "blocked", "missed"].map((name) => [
    name, requireBoolean(flagsValue[name], `observedOutcome.flags.${name}`),
  ]));

  if (flags.missed) {
    if (value.magnitude !== undefined) throw new Error("A missed outcome must not declare a magnitude.");
    if (flags.normal || flags.critical || flags.heavy || flags.blocked) {
      throw new Error("A missed outcome cannot also be normal, critical, heavy, or blocked.");
    }
  } else {
    if (value.magnitude === undefined) throw new Error("A non-missed outcome requires a magnitude.");
    requireNonnegativeDecimal(value.magnitude, "observedOutcome.magnitude");
    if (!flags.normal && !flags.critical && !flags.heavy) {
      throw new Error("A non-missed outcome must be normal, critical, or heavy.");
    }
    if (flags.normal && (flags.critical || flags.heavy)) {
      throw new Error("A normal outcome cannot also be critical or heavy.");
    }
  }
  return {
    ...(value.magnitude === undefined ? {} : { magnitude: requireNonnegativeDecimal(value.magnitude, "observedOutcome.magnitude") }),
    flags,
    ...(value.timestamps === undefined ? {} : { timestamps: normalizeTimestamps(value.timestamps) }),
  };
}

function normalizeTimestamps(input) {
  const value = requireRecord(input, "observedOutcome.timestamps");
  const entries = Object.entries(value);
  if (entries.length === 0) throw new Error("observedOutcome.timestamps must not be empty.");
  return Object.fromEntries(entries.sort(([left], [right]) => compareStrings(left, right)).map(([key, timestamp]) => {
    requireId(key, "observedOutcome.timestamps key");
    if (!key.endsWith("Ms")) throw new Error(`observedOutcome.timestamps.${key} must use an Ms suffix.`);
    return [key, requireNonnegativeInteger(timestamp, `observedOutcome.timestamps.${key}`)];
  }));
}

function normalizeEvidence(input) {
  const value = requireRecord(input, "evidence");
  assertOnlyKeys(value, ["type", "path", "hash"], "evidence");
  return {
    type: requireEnum(value.type, EVIDENCE_TYPES, "evidence.type"),
    ...(value.path === undefined ? {} : { path: requireText(value.path, "evidence.path") }),
    ...(value.hash === undefined ? {} : { hash: normalizeSha256(value.hash, "evidence.hash") }),
  };
}

function normalizeRejectionReasons(input) {
  if (!Array.isArray(input)) throw new TypeError("rejectionReasons must be an array.");
  return [...new Set(input.map((reason, index) => requireText(reason, `rejectionReasons[${index}]`)))].sort(compareStrings);
}

function normalizeDecimalRecord(input, label) {
  const value = requireRecord(input, label);
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareStrings(left, right)).map(([key, decimal]) => [
    requireId(key, `${label} key`), requireDecimal(decimal, `${label}.${key}`),
  ]));
}

function normalizeJsonRecord(value, label, rejectFormulaClaims = false) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareStrings(left, right)).map(([key, child]) => {
    requireId(key, `${label} key`);
    if (rejectFormulaClaims && /formula/i.test(key)) {
      throw new Error(`${label} cannot contain executable formula claims.`);
    }
    return [key, normalizeJsonValue(child, `${label}.${key}`, rejectFormulaClaims)];
  }));
}

function normalizeJsonValue(value, label, rejectFormulaClaims) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError(`${label} numeric values must be safe integers; use decimal strings for fractions.`);
    return value;
  }
  if (Array.isArray(value)) return value.map((child, index) => normalizeJsonValue(child, `${label}[${index}]`, rejectFormulaClaims));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return normalizeJsonRecord(value, label, rejectFormulaClaims);
  }
  throw new TypeError(`${label} must contain JSON-compatible values.`);
}

function contentIdForPayload(payload) {
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  return `sha256-${sha256(bytes)}`;
}

// Synchronous SHA-256 keeps this browser-safe engine module free of Node
// built-ins while still producing collision-resistant content addresses.
function sha256(bytes) {
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLengthHigh = Math.floor(bytes.length / 0x20000000);
  const bitLengthLow = (bytes.length << 3) >>> 0;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLengthHigh);
  view.setUint32(paddedLength - 4, bitLengthLow);

  const hash = [...SHA256_INITIAL];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15];
      const right = words[index - 2];
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + SHA256_ROUND[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map((word) => word.toString(16).padStart(8, "0")).join("");
}

function rotateRight(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort(compareStrings).map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value;
}

function assertOnlyKeys(value, allowed, label) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) throw new Error(`${label} contains unknown field: ${key}`);
}

function requireId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value) || value === "__proto__" || value === "prototype" || value === "constructor") {
    throw new TypeError(`${label} must be a safe identifier.`);
  }
  return value;
}

function requireBuild(value, label) {
  if (typeof value !== "string" || !SAFE_BUILD.test(value)) throw new TypeError(`${label} must be a safe build identifier.`);
  return value;
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${label} must be non-empty text without control characters.`);
  }
  return value;
}

function requireEnum(value, choices, label) {
  if (!choices.has(value)) throw new Error(`${label} has unsupported value: ${String(value)}`);
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be boolean.`);
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${label} must be a positive safe integer.`);
  return value;
}

function requireNonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a nonnegative safe integer.`);
  return value;
}

function requireDecimal(value, label) {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new TypeError(`${label} must be a canonical decimal string.`);
  const negative = value.startsWith("-");
  const unsigned = /^[+-]/.test(value) ? value.slice(1) : value;
  const [whole, rawFraction = ""] = unsigned.split(".");
  const fraction = rawFraction.replace(/0+$/, "");
  const zero = whole === "0" && fraction.length === 0;
  return `${negative && !zero ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function requireNonnegativeDecimal(value, label) {
  const decimal = requireDecimal(value, label);
  if (decimal.startsWith("-")) throw new RangeError(`${label} must be nonnegative.`);
  return decimal;
}

function normalizeSha256(value, label) {
  if (typeof value !== "string") throw new TypeError(`${label} must be a SHA-256 hash.`);
  const match = value.match(SHA256);
  if (!match) throw new TypeError(`${label} must contain 64 hexadecimal SHA-256 characters.`);
  return `sha256:${match[1].toLowerCase()}`;
}

function normalizeTimestamp(value, label) {
  if (typeof value !== "string") throw new TypeError(`${label} must be an ISO-8601 timestamp with an explicit timezone.`);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/);
  if (!match) throw new TypeError(`${label} must be an ISO-8601 timestamp with Z or an explicit offset.`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , , , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = Number(offsetHourText ?? 0);
  const offsetMinute = Number(offsetMinuteText ?? 0);
  const maximumDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > maximumDay || hour > 23 || minute > 59 || second > 59
    || offsetHour > 23 || offsetMinute > 59) {
    throw new RangeError(`${label} is not a valid calendar timestamp.`);
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) throw new RangeError(`${label} is not a valid calendar timestamp.`);
  return new Date(epoch).toISOString();
}

function compareDecimals(left, right) {
  const parse = (value) => {
    const sign = value.startsWith("-") ? -1n : 1n;
    const unsigned = /^[+-]/.test(value) ? value.slice(1) : value;
    const [whole, fraction = ""] = unsigned.split(".");
    return { sign, whole: BigInt(whole), fraction };
  };
  const a = parse(left);
  const b = parse(right);
  const scale = Math.max(a.fraction.length, b.fraction.length);
  const av = a.sign * (a.whole * 10n ** BigInt(scale) + BigInt(a.fraction.padEnd(scale, "0") || "0"));
  const bv = b.sign * (b.whole * 10n ** BigInt(scale) + BigInt(b.fraction.padEnd(scale, "0") || "0"));
  return av < bv ? -1 : av > bv ? 1 : 0;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
