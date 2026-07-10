import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { normalizeCalibrationObservation } from "../../packages/combat-engine/src/calibration-observation.mjs";
import { recordCombatObservation, rebuildCalibrationIndex } from "../lib/combat-calibration-store.mjs";

const BUILD = "24118850";
const CLI = path.resolve("scripts", "record-combat-observation.mjs");

function observation(overrides = {}) {
  return {
    schema: "tl-helper.combat-calibration-observation",
    schemaVersion: 1,
    gameBuild: BUILD,
    experimentId: "gaia-crash-baseline",
    attemptNumber: 1,
    recordedAt: "2026-07-10T20:00:00.000Z",
    scenario: { mode: "damage", abilityId: "gaia-crash", skillLevel: 1, component: "SW2_GaiaCrash_DD" },
    participants: {
      source: { buildSnapshotId: "source-build" },
      target: { buildSnapshotId: "target-build" },
    },
    inputs: {
      sourceStats: { baseDamageMinimum: "100", baseDamageMaximum: "120" },
      targetStats: { meleeDefense: "500" },
      baseDamage: { minimum: "100", maximum: "120" },
      controlledVariables: { location: "training-area", attempt: 1 },
      activeEffects: [],
    },
    observedOutcome: {
      magnitude: "321",
      flags: { normal: true, critical: false, heavy: false, blocked: false, missed: false },
    },
    evidence: { type: "manual" },
    status: "draft",
    ...overrides,
  };
}

test("records immutable build-scoped observations and atomically rebuilds counts", () => {
  const dataRoot = mkdtempSync(path.join(tmpdir(), "tl-calibration-"));
  try {
    const first = recordCombatObservation({ dataRoot, build: BUILD, observation: observation() });
    assert.equal(first.created, true);
    assert.match(path.basename(first.observationFile), /^sha256-[a-f0-9]{64}\.json$/);
    assert.deepEqual(JSON.parse(readFileSync(first.observationFile, "utf8")), first.observation);
    assert.equal(first.index.observationCount, 1);
    assert.equal(first.index.experimentCount, 1);
    assert.deepEqual(first.index.counts, {
      statuses: { draft: 1 },
      evidenceTypes: { manual: 1 },
      scenarioModes: { damage: 1 },
      abilityIds: { "gaia-crash": 1 },
    });

    const duplicate = recordCombatObservation({ dataRoot, build: BUILD, observation: observation() });
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.index.observationCount, 1);

    const reviewedScreenshot = observation({
      experimentId: "gaia-crash-screenshot",
      attemptNumber: 2,
      recordedAt: "2026-07-10T20:01:00.000Z",
      notes: "Reviewed visible result.",
      reviewer: "tester",
      status: "reviewed",
      evidence: { type: "screenshot", path: "evidence/gaia-crash-001.png" },
    });
    const second = recordCombatObservation({ dataRoot, build: BUILD, observation: reviewedScreenshot });
    assert.equal(second.created, true);
    assert.equal(second.index.observationCount, 2);
    assert.equal(second.index.experimentCount, 2);
    assert.deepEqual(second.index.counts, {
      statuses: { draft: 1, reviewed: 1 },
      evidenceTypes: { manual: 1, screenshot: 1 },
      scenarioModes: { damage: 2 },
      abilityIds: { "gaia-crash": 2 },
    });
    assert.deepEqual(JSON.parse(readFileSync(second.indexFile, "utf8")), second.index);
  } finally {
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("never overwrites differing content at an existing observation ID", () => {
  const dataRoot = mkdtempSync(path.join(tmpdir(), "tl-calibration-"));
  try {
    const result = recordCombatObservation({ dataRoot, build: BUILD, observation: observation() });
    const before = readFileSync(result.observationFile, "utf8");
    writeFileSync(result.observationFile, before.replace("\"321\"", "\"999\""), "utf8");
    assert.throws(
      () => recordCombatObservation({ dataRoot, build: BUILD, observation: observation() }),
      /refusing to overwrite differing observation/,
    );
    assert.match(readFileSync(result.observationFile, "utf8"), /"999"/);
  } finally {
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("rejects mixed builds, traversal-like builds, invalid inputs, and mismatched files", () => {
  const dataRoot = mkdtempSync(path.join(tmpdir(), "tl-calibration-"));
  try {
    assert.throws(
      () => recordCombatObservation({ dataRoot, build: "999", observation: observation() }),
      /observation build 24118850 does not match requested build 999/,
    );
    assert.throws(
      () => recordCombatObservation({ dataRoot, build: "..\\escape", observation: observation() }),
      /decimal digits only/,
    );
    assert.throws(
      () => recordCombatObservation({ dataRoot, build: BUILD, observation: { gameBuild: BUILD } }),
      /Unsupported calibration observation schema/,
    );

    const accepted = recordCombatObservation({ dataRoot, build: BUILD, observation: observation() });
    const other = normalizeCalibrationObservation({ ...observation(), notes: "Different identity." });
    writeFileSync(accepted.observationFile, `${JSON.stringify(other)}\n`, "utf8");
    assert.throws(
      () => rebuildCalibrationIndex({ dataRoot, build: BUILD }),
      /filename\/contentId mismatch/,
    );
  } finally {
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("rejects schema-valid templates until placeholder values are replaced", () => {
  const dataRoot = mkdtempSync(path.join(tmpdir(), "tl-calibration-"));
  try {
    const template = observation({
      inputs: {
        ...observation().inputs,
        controlledVariables: {
          ...observation().inputs.controlledVariables,
          valuesArePlaceholders: true,
        },
      },
    });
    assert.doesNotThrow(() => normalizeCalibrationObservation(template));
    assert.throws(
      () => recordCombatObservation({ dataRoot, build: BUILD, observation: template }),
      /still contains placeholder values; replace them before recording/,
    );
  } finally {
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("recovers a stale index lock and cleans up lock ownership", () => {
  const dataRoot = mkdtempSync(path.join(tmpdir(), "tl-calibration-stale-lock-"));
  try {
    const buildDirectory = path.join(dataRoot, "calibration", BUILD);
    const lockDirectory = path.join(buildDirectory, ".index.lock");
    mkdirSync(lockDirectory, { recursive: true });
    writeFileSync(path.join(lockDirectory, "owner.json"), JSON.stringify({
      token: "abandoned-lock",
      pid: 999999,
      createdAtMs: Date.now() - 120_000,
    }), "utf8");

    const result = recordCombatObservation({ dataRoot, build: BUILD, observation: observation() });
    assert.equal(result.index.observationCount, 1);
    assert.equal(existsSync(lockDirectory), false);
    assert.equal(existsSync(`${lockDirectory}.reclaim`), false);
  } finally {
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("CLI accepts a JSON file and stdin", () => {
  const dataRoot = mkdtempSync(path.join(tmpdir(), "tl-calibration-"));
  try {
    const inputFile = path.join(dataRoot, "observation.json");
    writeFileSync(inputFile, JSON.stringify(observation()), "utf8");
    const fromFile = spawnSync(process.execPath, [CLI, "--input", inputFile, "--data-root", dataRoot, "--build", BUILD], {
      cwd: path.resolve("."), encoding: "utf8",
    });
    assert.equal(fromFile.status, 0, fromFile.stderr);
    assert.equal(JSON.parse(fromFile.stdout).created, true);

    const fromStdin = spawnSync(process.execPath, [CLI, "--data-root", dataRoot, "--build", BUILD], {
      cwd: path.resolve("."), encoding: "utf8", input: JSON.stringify(observation()),
    });
    assert.equal(fromStdin.status, 0, fromStdin.stderr);
    assert.equal(JSON.parse(fromStdin.stdout).created, false);
    assert.equal(JSON.parse(fromStdin.stdout).observationCount, 1);
    assert.equal(JSON.parse(fromStdin.stdout).experimentCount, 1);
  } finally {
    rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("concurrent recorders converge the index on every published observation", async () => {
  const dataRoot = mkdtempSync(path.join(tmpdir(), "tl-calibration-race-"));
  try {
    const attempts = Array.from({ length: 8 }, (_, index) => observation({
      experimentId: index < 4 ? "concurrent-a" : "concurrent-b",
      attemptNumber: index + 1,
      recordedAt: `2026-07-10T20:00:${String(index).padStart(2, "0")}.000Z`,
    }));
    const results = await Promise.all(attempts.map((input) => new Promise((resolve) => {
      const child = spawn(process.execPath, [CLI, "--data-root", dataRoot, "--build", BUILD], {
        cwd: path.resolve("."), stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
      child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
      child.on("close", (status) => resolve({ status, stdout, stderr }));
      child.stdin.end(JSON.stringify(input));
    })));
    for (const result of results) assert.equal(result.status, 0, result.stderr);

    const indexFile = path.join(dataRoot, "calibration", BUILD, "index.json");
    const index = JSON.parse(readFileSync(indexFile, "utf8"));
    assert.equal(index.observationCount, attempts.length);
    assert.equal(index.observationIds.length, attempts.length);
    assert.equal(index.experimentCount, 2);
    assert.deepEqual(index.counts.scenarioModes, { damage: attempts.length });
    assert.deepEqual(index.counts.abilityIds, { "gaia-crash": attempts.length });
  } finally {
    rmSync(dataRoot, { recursive: true, force: true });
  }
});
