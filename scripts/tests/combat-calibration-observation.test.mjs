import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  CALIBRATION_OBSERVATION_SCHEMA,
  CALIBRATION_OBSERVATION_SCHEMA_VERSION,
  calibrationObservationContentId,
  createCalibrationObservation,
  serializeCalibrationObservation,
  validateCalibrationObservation,
} from "../../packages/combat-engine/src/calibration-observation.mjs";

function observation(overrides = {}) {
  return {
    schema: CALIBRATION_OBSERVATION_SCHEMA,
    schemaVersion: CALIBRATION_OBSERVATION_SCHEMA_VERSION,
    experimentId: "gaia-crash-base-damage",
    attemptNumber: 1,
    recordedAt: "2026-07-10T14:05:06+01:00",
    gameBuild: "24118850",
    gameVersion: "1.27.4",
    scenario: {
      mode: "damage",
      abilityId: "skill_gaia_crash",
      skillLevel: 5,
      component: "initial_hit",
    },
    participants: {
      source: { buildSnapshotId: "attacker-build-1" },
      target: { buildSnapshotHash: "A".repeat(64) },
    },
    inputs: {
      sourceStats: { base_damage_min: "100.00", base_damage_max: "120", strength: "50" },
      targetStats: { melee_defense: "750" },
      baseDamage: { minimum: "100.0", maximum: "120.000" },
      controlledVariables: { distanceBucket: "near", pvp: false, sampleIndex: 1 },
      activeEffects: [
        { owner: "target", effectId: "weakened", kind: "debuff", stacks: 2, remainingMs: 800 },
        { owner: "source", effectId: "power-up", kind: "buff", magnitude: "10.0" },
      ],
    },
    observedOutcome: {
      magnitude: "537.00",
      flags: { normal: false, critical: true, heavy: true, blocked: false, missed: false },
      timestamps: { impactMs: 750, actionStartedMs: 100 },
    },
    evidence: { type: "screenshot", path: "evidence/gaia-001.png", hash: "b".repeat(64) },
    notes: "UI number reviewed against the captured frame.",
    reviewer: "reviewer-1",
    status: "reviewed",
    ...overrides,
  };
}

test("normalizes a complete observation into a detached deeply frozen contract", () => {
  const input = observation();
  const normalized = createCalibrationObservation(input);
  assert.equal(normalized.contentId.match(/^sha256-[a-f0-9]{64}$/)?.[0], normalized.contentId);
  assert.equal(normalized.recordedAt, "2026-07-10T13:05:06.000Z");
  assert.equal(normalized.inputs.sourceStats.base_damage_min, "100");
  assert.deepEqual(normalized.inputs.baseDamage, { minimum: "100", maximum: "120" });
  assert.equal(normalized.participants.target.buildSnapshotHash, `sha256:${"a".repeat(64)}`);
  assert.equal(normalized.evidence.hash, `sha256:${"b".repeat(64)}`);
  assert.deepEqual(normalized.inputs.activeEffects.map(({ owner, effectId }) => [owner, effectId]), [
    ["source", "power-up"],
    ["target", "weakened"],
  ]);
  assert.ok(isDeeplyFrozen(normalized));
  input.inputs.sourceStats.strength = "999";
  assert.equal(normalized.inputs.sourceStats.strength, "50");
  assert.equal(validateCalibrationObservation(normalized), true);
});

test("canonical serialization and content IDs ignore object key and active-effect order", () => {
  const first = observation();
  const second = observation({
    inputs: {
      activeEffects: [...first.inputs.activeEffects].reverse(),
      controlledVariables: { sampleIndex: 1, pvp: false, distanceBucket: "near" },
      baseDamage: { maximum: "120", minimum: "100" },
      targetStats: { melee_defense: "750.0" },
      sourceStats: { strength: "50.000", base_damage_max: "120.0", base_damage_min: "+100" },
    },
  });
  assert.equal(calibrationObservationContentId(first), calibrationObservationContentId(second));
  assert.equal(serializeCalibrationObservation(first), serializeCalibrationObservation(second));
  assert.equal(serializeCalibrationObservation(first), serializeCalibrationObservation(JSON.parse(serializeCalibrationObservation(first))));
});

test("verifies a supplied content ID and rejects stale or malformed IDs", () => {
  const normalized = createCalibrationObservation(observation());
  assert.equal(createCalibrationObservation({ ...observation(), contentId: normalized.contentId }).contentId, normalized.contentId);
  assert.throws(() => createCalibrationObservation({ ...observation(), contentId: `sha256-${"0".repeat(64)}` }), /does not match/);
  assert.throws(() => createCalibrationObservation({ ...observation(), contentId: `sha256:${"0".repeat(64)}` }), /filesystem-safe/);
});

test("pure JavaScript SHA-256 content IDs match Node crypto over canonical payload JSON", () => {
  const normalized = createCalibrationObservation(observation());
  const { contentId, ...payload } = normalized;
  const canonicalPayload = canonicalJson(payload);
  const expected = createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
  assert.equal(contentId, `sha256-${expected}`);

  const unicode = createCalibrationObservation(observation({ notes: "Reviewed damage: 537, evidence ✓" }));
  const { contentId: unicodeId, ...unicodePayload } = unicode;
  const expectedUnicode = createHash("sha256").update(canonicalJson(unicodePayload), "utf8").digest("hex");
  assert.equal(unicodeId, `sha256-${expectedUnicode}`);
});

test("misses are exclusive and carry no magnitude", () => {
  const missed = observation({
    observedOutcome: {
      flags: { normal: false, critical: false, heavy: false, blocked: false, missed: true },
      timestamps: { impactMs: 750 },
    },
  });
  assert.equal(createCalibrationObservation(missed).observedOutcome.magnitude, undefined);
  assert.throws(() => createCalibrationObservation(observation({
    observedOutcome: { magnitude: "0", flags: { normal: false, critical: false, heavy: false, blocked: false, missed: true } },
  })), /must not declare a magnitude/);
  assert.throws(() => createCalibrationObservation(observation({
    observedOutcome: { flags: { normal: false, critical: false, heavy: false, blocked: true, missed: true } },
  })), /cannot also be/);
});

test("hit classifications reject missing magnitudes and contradictory normal flags", () => {
  assert.throws(() => createCalibrationObservation(observation({
    observedOutcome: { flags: { normal: true, critical: false, heavy: false, blocked: false, missed: false } },
  })), /requires a magnitude/);
  assert.throws(() => createCalibrationObservation(observation({
    observedOutcome: { magnitude: "1", flags: { normal: true, critical: true, heavy: false, blocked: false, missed: false } },
  })), /cannot also be critical/);
  assert.throws(() => createCalibrationObservation(observation({
    observedOutcome: { magnitude: "1", flags: { normal: false, critical: false, heavy: false, blocked: true, missed: false } },
  })), /must be normal, critical, or heavy/);
  assert.throws(() => createCalibrationObservation(observation({
    observedOutcome: { magnitude: "-1", flags: { normal: true, critical: false, heavy: false, blocked: false, missed: false } },
  })), /must be nonnegative/);
});

test("fractional JavaScript numbers and unsafe identifiers cannot enter evidence", () => {
  assert.throws(() => createCalibrationObservation(observation({
    inputs: { ...observation().inputs, controlledVariables: { charge: 0.5 } },
  })), /decimal strings for fractions/);
  assert.throws(() => createCalibrationObservation(observation({
    scenario: { ...observation().scenario, abilityId: "../skill" },
  })), /safe identifier/);
  assert.throws(() => createCalibrationObservation(observation({ gameBuild: "build/unsafe" })), /safe build/);
  assert.throws(() => createCalibrationObservation(observation({ experimentId: "../experiment" })), /safe identifier/);
  assert.throws(() => createCalibrationObservation(observation({ attemptNumber: 0 })), /positive safe integer/);
  assert.throws(() => createCalibrationObservation(observation({ recordedAt: "2026-07-10T14:05:06" })), /explicit offset/);
  assert.throws(() => createCalibrationObservation(observation({ recordedAt: "2026-02-30T14:05:06Z" })), /valid calendar/);
  assert.throws(() => createCalibrationObservation(observation({
    participants: { source: {}, target: { buildSnapshotId: "target" } },
  })), /requires buildSnapshotId or buildSnapshotHash/);
});

test("formula claims and unknown contract fields are rejected instead of executed or preserved", () => {
  assert.throws(() => createCalibrationObservation(observation({
    inputs: { ...observation().inputs, controlledVariables: { damageFormula: "attack * 2" } },
  })), /cannot contain executable formula claims/);
  assert.throws(() => createCalibrationObservation({ ...observation(), precision: "verified_exact" }), /unknown field: precision/);
  assert.throws(() => createCalibrationObservation(observation({
    observedOutcome: { ...observation().observedOutcome, serverClaim: true },
  })), /unknown field: serverClaim/);
});

test("evidence metadata, status, and timestamps use closed vocabularies", () => {
  for (const type of ["manual", "screenshot", "recording", "ocr_reviewed"]) {
    assert.equal(createCalibrationObservation(observation({ evidence: { type } })).evidence.type, type);
  }
  assert.throws(() => createCalibrationObservation(observation({ evidence: { type: "ocr" } })), /unsupported value/);
  assert.throws(() => createCalibrationObservation(observation({ status: "verified_exact" })), /unsupported value/);
  assert.throws(() => createCalibrationObservation(observation({
    observedOutcome: { ...observation().observedOutcome, timestamps: { impact: 1 } },
  })), /Ms suffix/);
});

test("review and rejection lifecycle metadata is internally consistent and canonical", () => {
  assert.throws(() => createCalibrationObservation(observation({ reviewer: undefined })), /reviewer is required/);

  const rejected = createCalibrationObservation(observation({
    status: "rejected",
    reviewer: "reviewer-2",
    rejectionReasons: ["Wrong target build.", "Magnitude obscured.", "Wrong target build."],
  }));
  assert.deepEqual(rejected.rejectionReasons, ["Magnitude obscured.", "Wrong target build."]);
  assert.throws(() => createCalibrationObservation(observation({
    status: "rejected",
    rejectionReasons: [],
  })), /must be nonempty/);
  assert.throws(() => createCalibrationObservation(observation({
    status: "draft",
    rejectionReasons: ["Not reviewed yet."],
  })), /only allowed when status is rejected/);
  assert.throws(() => createCalibrationObservation(observation({
    status: "rejected",
    rejectionReasons: [""],
  })), /non-empty text/);
});

function isDeeplyFrozen(value) {
  return !value || typeof value !== "object" || (Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen));
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
