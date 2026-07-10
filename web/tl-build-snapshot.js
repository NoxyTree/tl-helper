// Versioned, immutable boundary between the build planner and combat systems.
//
// calculateBuild remains the compatibility engine for static totals. New
// consumers should use resolveBuildSnapshot so they never depend on mutable UI
// state or the calculator's internal return shape.

import {
  calculateBuild,
  calculateCombatPower,
  normalizeMasterySelections,
} from "./tl-core.js";
import { CHARACTER_LEVEL } from "./tl-questlog-rules.js";

export const BUILD_SNAPSHOT_SCHEMA = "tl-helper.build-snapshot";
export const BUILD_SNAPSHOT_VERSION = 1;
export const STATIC_RULESET_ID = "questlog-static-v1";

const ATTRIBUTE_IDS = ["str", "dex", "int", "per", "con"];

/**
 * Resolve mutable planner state into the stable BuildSnapshot v1 contract.
 *
 * metadata.gameDataBuild should identify the source dataset when known. It is
 * deliberately supplied by the caller because the current app-data projection
 * does not yet carry a game build identifier.
 */
export function resolveBuildSnapshot({ build, attributes = {}, metadata = {} }) {
  if (!build || typeof build !== "object" || Array.isArray(build)) {
    throw new TypeError("BuildSnapshot requires a build object.");
  }

  const normalizedBuild = cloneJson(build);
  normalizedBuild.masteries = normalizeMasterySelections(normalizedBuild.masteries);
  const normalizedAttributes = Object.fromEntries(
    ATTRIBUTE_IDS.map((id) => [id, finiteNumber(attributes[id])]),
  );
  const calculation = calculateBuild(normalizedBuild, normalizedAttributes);

  const snapshot = {
    schema: BUILD_SNAPSHOT_SCHEMA,
    schemaVersion: BUILD_SNAPSHOT_VERSION,
    ruleset: {
      id: STATIC_RULESET_ID,
      gameDataBuild: String(metadata.gameDataBuild ?? "unversioned"),
      calculatorVersion: String(metadata.calculatorVersion ?? "1"),
    },
    identity: {
      id: String(normalizedBuild.id ?? ""),
      name: String(normalizedBuild.name ?? ""),
    },
    character: {
      level: finiteNumber(metadata.characterLevel, CHARACTER_LEVEL),
      attributes: normalizedAttributes,
    },
    loadout: {
      equipment: normalizedBuild.equipment ?? {},
      artifacts: normalizedBuild.artifacts ?? {},
      supportSlots: normalizedBuild.supportSlots ?? {},
      skills: normalizedBuild.skills ?? [],
      masteries: normalizedBuild.masteries ?? {},
      unifiedMasteries: normalizedBuild.unifiedMasteries ?? [],
    },
    resolved: {
      stats: calculation.stats.map((row) => ({
        id: row.id,
        total: row.total,
        sources: cloneJson(row.sources ?? []),
      })),
      combatPower: calculateCombatPower(normalizedBuild),
      runeSynergies: cloneJson(calculation.runeSynergies ?? {}),
      validation: cloneJson(calculation.validation ?? { issues: [] }),
    },
  };

  return deepFreeze(snapshot);
}

/** Return a stat total without exposing calculator-specific lookup logic. */
export function snapshotStat(snapshot, statId) {
  assertBuildSnapshot(snapshot);
  return snapshot.resolved.stats.find((row) => row.id === statId)?.total ?? 0;
}

/** Deterministic JSON: object keys are sorted recursively, array order is kept. */
export function serializeBuildSnapshot(snapshot, { space = 0 } = {}) {
  assertBuildSnapshot(snapshot);
  return JSON.stringify(sortJson(snapshot), null, space);
}

/** Parse, minimally validate, clone, and freeze a persisted BuildSnapshot v1. */
export function deserializeBuildSnapshot(json) {
  const parsed = typeof json === "string" ? JSON.parse(json) : cloneJson(json);
  assertBuildSnapshot(parsed);
  return deepFreeze(parsed);
}

export function isBuildSnapshot(value) {
  try {
    assertBuildSnapshot(value);
    return true;
  } catch {
    return false;
  }
}

function assertBuildSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("BuildSnapshot must be an object.");
  }
  if (value.schema !== BUILD_SNAPSHOT_SCHEMA || value.schemaVersion !== BUILD_SNAPSHOT_VERSION) {
    throw new Error(`Unsupported BuildSnapshot schema: ${value.schema ?? "missing"} v${value.schemaVersion ?? "missing"}.`);
  }
  if (!value.ruleset?.id || !value.identity || !value.character?.attributes || !value.loadout) {
    throw new Error("BuildSnapshot is missing required metadata or loadout fields.");
  }
  if (!Array.isArray(value.resolved?.stats) || !value.resolved?.validation) {
    throw new Error("BuildSnapshot is missing resolved calculator output.");
  }
  for (const row of value.resolved.stats) {
    if (!row?.id || !Number.isFinite(row.total) || !Array.isArray(row.sources)) {
      throw new Error("BuildSnapshot contains an invalid resolved stat row.");
    }
  }
}

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortJson(value[key])]),
  );
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
