import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  CALIBRATION_OBSERVATION_SCHEMA,
  CALIBRATION_OBSERVATION_SCHEMA_VERSION,
  normalizeCalibrationObservation,
  serializeCalibrationObservation,
} from "../../packages/combat-engine/src/calibration-observation.mjs";

const INDEX_SCHEMA = "tl-helper.combat-calibration-index";
const INDEX_SCHEMA_VERSION = 1;
const SAFE_BUILD = /^[0-9]+$/;
const SAFE_CONTENT_ID = /^sha256-[a-f0-9]{64}$/;
const MAX_INDEX_REBUILD_ATTEMPTS = 8;
const INDEX_LOCK_TIMEOUT_MS = 10_000;
const INDEX_LOCK_STALE_MS = 60_000;
const LOCK_RETRY_MS = 20;
const RENAME_RETRY_LIMIT = 20;
const TRANSIENT_RENAME_ERRORS = new Set(["EACCES", "EBUSY", "EPERM"]);
const sleeper = new Int32Array(new SharedArrayBuffer(4));

function fail(message) {
  throw new Error(`Combat calibration store: ${message}`);
}

function normalizedBuild(value, label = "build") {
  const build = String(value ?? "").trim();
  if (!SAFE_BUILD.test(build)) fail(`${label} must contain decimal digits only`);
  return build;
}

function normalizedContentId(value) {
  const id = String(value ?? "").trim();
  if (!SAFE_CONTENT_ID.test(id) || id === "." || id === "..") {
    fail("observation contentId is not safe for use as a filename");
  }
  return id;
}

function observationDirectory(dataRoot, build) {
  const root = path.resolve(String(dataRoot ?? ""));
  if (!String(dataRoot ?? "").trim()) fail("dataRoot is required");
  return path.join(root, "calibration", build, "observations");
}

function count(values, key) {
  values[key] = (values[key] ?? 0) + 1;
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareCodeUnits(left, right)));
}

function atomicReplaceJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    for (let attempt = 1; ; attempt += 1) {
      try {
        renameSync(temporary, file);
        break;
      } catch (error) {
        if (!TRANSIENT_RENAME_ERRORS.has(error?.code) || attempt >= RENAME_RETRY_LIMIT) throw error;
        sleep(Math.min(LOCK_RETRY_MS * attempt, 200));
      }
    }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function sleep(milliseconds) {
  Atomics.wait(sleeper, 0, 0, milliseconds);
}

function lockOwnerFile(lockDirectory) {
  return path.join(lockDirectory, "owner.json");
}

function readLockOwner(lockDirectory) {
  try { return JSON.parse(readFileSync(lockOwnerFile(lockDirectory), "utf8")); }
  catch { return null; }
}

function lockIsStale(lockDirectory, now = Date.now()) {
  try {
    const owner = readLockOwner(lockDirectory);
    const createdAtMs = Number(owner?.createdAtMs);
    const fallback = statSync(lockDirectory).mtimeMs;
    return now - (Number.isFinite(createdAtMs) ? createdAtMs : fallback) >= INDEX_LOCK_STALE_MS;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function reclaimStaleLock(lockDirectory) {
  const reclaimFile = `${lockDirectory}.reclaim`;
  try {
    writeFileSync(reclaimFile, `${process.pid}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  }
  try {
    if (!lockIsStale(lockDirectory)) return false;
    rmSync(lockDirectory, { recursive: true, force: true });
    return true;
  } finally {
    try { unlinkSync(reclaimFile); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
}

function withIndexLock(buildDirectory, callback) {
  mkdirSync(buildDirectory, { recursive: true });
  const lockDirectory = path.join(buildDirectory, ".index.lock");
  const reclaimFile = `${lockDirectory}.reclaim`;
  const token = `${process.pid}-${Date.now()}-${process.hrtime.bigint()}`;
  const deadline = Date.now() + INDEX_LOCK_TIMEOUT_MS;
  for (;;) {
    if (existsSync(reclaimFile)) {
      try {
        if (Date.now() - statSync(reclaimFile).mtimeMs >= INDEX_LOCK_STALE_MS) unlinkSync(reclaimFile);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      if (Date.now() >= deadline) fail(`timed out waiting for index lock after ${INDEX_LOCK_TIMEOUT_MS}ms`);
      sleep(LOCK_RETRY_MS);
      continue;
    }
    try {
      mkdirSync(lockDirectory);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (lockIsStale(lockDirectory)) reclaimStaleLock(lockDirectory);
      if (Date.now() >= deadline) fail(`timed out waiting for index lock after ${INDEX_LOCK_TIMEOUT_MS}ms`);
      sleep(LOCK_RETRY_MS);
      continue;
    }
    try {
      writeFileSync(lockOwnerFile(lockDirectory), `${JSON.stringify({ token, pid: process.pid, createdAtMs: Date.now() })}\n`, {
        encoding: "utf8", flag: "wx",
      });
    } catch (error) {
      rmSync(lockDirectory, { recursive: true, force: true });
      throw error;
    }
    break;
  }
  try {
    return callback();
  } finally {
    // Ownership verification prevents a delayed process from deleting a lock
    // that was recovered and subsequently acquired by another recorder.
    if (readLockOwner(lockDirectory)?.token === token) rmSync(lockDirectory, { recursive: true, force: true });
  }
}

function atomicCreate(file, serialized, normalized) {
  mkdirSync(path.dirname(file), { recursive: true });
  if (existsSync(file)) {
    assertExistingMatches(file, serialized, normalized.contentId);
    return false;
  }

  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporary, `${serialized}\n`, { encoding: "utf8", flag: "wx" });
    try {
      // A hard link makes publication atomic while retaining exclusive-create
      // semantics even when multiple recorders race for the same content ID.
      linkSync(temporary, file);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      assertExistingMatches(file, serialized, normalized.contentId);
      return false;
    }
    return true;
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function assertExistingMatches(file, serialized, contentId) {
  try {
    const existing = normalizeCalibrationObservation(JSON.parse(readFileSync(file, "utf8")));
    if (serializeCalibrationObservation(existing) === serialized) return;
  } catch {
    // Invalid or non-canonical existing content is necessarily a conflict.
  }
  fail(`refusing to overwrite differing observation ${contentId}`);
}

export function rebuildCalibrationIndex({ dataRoot, build } = {}) {
  const requestedBuild = normalizedBuild(build);
  const directory = observationDirectory(dataRoot, requestedBuild);
  mkdirSync(directory, { recursive: true });
  const indexFile = path.join(path.dirname(directory), "index.json");
  return withIndexLock(path.dirname(directory), () => {
    for (let attempt = 1; attempt <= MAX_INDEX_REBUILD_ATTEMPTS; attempt += 1) {
      const names = observationFileNames(directory);
      const observations = names.map((name) => readStoredObservation(directory, name, requestedBuild));
      const index = buildIndex(observations, requestedBuild);
      atomicReplaceJson(indexFile, index);
      if (sameNames(names, observationFileNames(directory))) {
        return { index, indexFile, observationsDirectory: directory };
      }
    }
    fail(`index did not converge after ${MAX_INDEX_REBUILD_ATTEMPTS} attempts because observations kept changing`);
  });
}

function observationFileNames(directory) {
  return readdirSync(directory).filter((name) => name.endsWith(".json")).sort(compareCodeUnits);
}

function sameNames(left, right) {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

function readStoredObservation(directory, name, requestedBuild) {
  const id = normalizedContentId(name.slice(0, -5));
  const observation = normalizeCalibrationObservation(JSON.parse(readFileSync(path.join(directory, name), "utf8")));
  if (observation.contentId !== id) fail(`filename/contentId mismatch in ${name}`);
  if (observation.gameBuild !== requestedBuild) {
    fail(`observation ${id} build ${observation.gameBuild} does not match requested build ${requestedBuild}`);
  }
  return observation;
}

function buildIndex(observations, requestedBuild) {
  const statuses = Object.create(null);
  const evidenceTypes = Object.create(null);
  const scenarioModes = Object.create(null);
  const abilityIds = Object.create(null);
  const experimentIds = new Set();
  for (const observation of observations) {
    count(statuses, observation.status);
    count(evidenceTypes, observation.evidence.type);
    count(scenarioModes, observation.scenario.mode);
    count(abilityIds, observation.scenario.abilityId);
    experimentIds.add(observation.experimentId);
  }
  return {
    schema: INDEX_SCHEMA,
    schemaVersion: INDEX_SCHEMA_VERSION,
    observationSchema: CALIBRATION_OBSERVATION_SCHEMA,
    observationSchemaVersion: CALIBRATION_OBSERVATION_SCHEMA_VERSION,
    gameBuild: requestedBuild,
    observationCount: observations.length,
    experimentCount: experimentIds.size,
    counts: {
      statuses: stableObject(statuses),
      evidenceTypes: stableObject(evidenceTypes),
      scenarioModes: stableObject(scenarioModes),
      abilityIds: stableObject(abilityIds),
    },
    observationIds: observations.map((observation) => observation.contentId).sort(compareCodeUnits),
  };
}

export function recordCombatObservation({ observation, dataRoot, build } = {}) {
  const requestedBuild = normalizedBuild(build);
  const normalized = normalizeCalibrationObservation(observation);
  if (normalized.inputs.controlledVariables.valuesArePlaceholders === true) {
    fail("observation still contains placeholder values; replace them before recording");
  }
  if (normalized.gameBuild !== requestedBuild) {
    fail(`observation build ${normalized.gameBuild} does not match requested build ${requestedBuild}`);
  }
  const id = normalizedContentId(normalized.contentId);
  const directory = observationDirectory(dataRoot, requestedBuild);
  const observationFile = path.join(directory, `${id}.json`);
  const created = atomicCreate(observationFile, serializeCalibrationObservation(normalized), normalized);
  const { index, indexFile } = rebuildCalibrationIndex({ dataRoot, build: requestedBuild });
  return { created, observation: normalized, observationFile, index, indexFile };
}

export const COMBAT_CALIBRATION_INDEX_SCHEMA = INDEX_SCHEMA;
export const COMBAT_CALIBRATION_INDEX_SCHEMA_VERSION = INDEX_SCHEMA_VERSION;
