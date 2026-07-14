// Versioned, immutable boundary between the build planner and combat systems.
//
// calculateBuild remains the compatibility engine for static totals. New
// consumers should use resolveBuildSnapshot so they never depend on mutable UI
// state or the calculator's internal return shape.

import {
  calculateBuild,
  calculateCombatPower,
  data as coreData,
} from "./tl-core.js";
import { CHARACTER_LEVEL } from "./tl-questlog-rules.js";

export const BUILD_SNAPSHOT_SCHEMA = "tl-helper.build-snapshot";
export const BUILD_SNAPSHOT_VERSION = 2;
export const STATIC_RULESET_ID = "persistent-static-v2";
export const STATIC_CALCULATOR_VERSION = "2";

export const STATIC_CALCULATION_CONTEXT = Object.freeze({
  mode: "persistent-static",
  includeSetEffects: true,
  dynamicEffects: "excluded",
});

const ATTRIBUTE_IDS = ["str", "dex", "int", "per", "con"];
const VERIFIED_SNAPSHOTS = new WeakSet();

/**
 * Resolve mutable planner state into the stable BuildSnapshot v2 contract.
 * Ruleset, calculator, game-build, and character-level provenance are owned by
 * the calculator. Caller metadata is accepted for API compatibility but cannot
 * override calculation identity.
 */
export function resolveBuildSnapshot({ build, attributes = {} }) {
  if (!build || typeof build !== "object" || Array.isArray(build)) {
    throw new TypeError("BuildSnapshot requires a build object.");
  }
  const gameDataBuild = initializedGameBuild();

  // Canonicalize object-key order before calculation so source ordering and the
  // serialized snapshot remain stable after a deserialize/re-resolve cycle.
  const normalizedBuild = sortJson(cloneJson(build));
  const normalizedAttributes = normalizeAttributeInput(attributes);
  const calculation = calculateBuild(normalizedBuild, normalizedAttributes, { includeSetEffects: true });

  const snapshot = {
    schema: BUILD_SNAPSHOT_SCHEMA,
    schemaVersion: BUILD_SNAPSHOT_VERSION,
    ruleset: {
      id: STATIC_RULESET_ID,
      gameDataBuild,
      calculatorVersion: STATIC_CALCULATOR_VERSION,
    },
    calculationContext: cloneJson(STATIC_CALCULATION_CONTEXT),
    identity: {
      id: String(normalizedBuild.id ?? ""),
      name: String(normalizedBuild.name ?? ""),
    },
    character: {
      level: CHARACTER_LEVEL,
      attributes: normalizedAttributes,
    },
    loadout: {
      equipment: normalizedBuild.equipment ?? {},
      artifacts: normalizedBuild.artifacts ?? {},
      supportSlots: normalizedBuild.supportSlots ?? {},
      skills: normalizedBuild.skills ?? [],
      masteries: normalizedBuild.masteries ?? {},
      unifiedMasteries: normalizedBuild.unifiedMasteries ?? [],
      overallMasteryLevel: normalizedBuild.overallMasteryLevel ?? null,
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
      ...(calculation.status === undefined ? {} : { status: cloneJson(calculation.status) }),
    },
  };

  const frozen = deepFreeze(snapshot);
  VERIFIED_SNAPSHOTS.add(frozen);
  return frozen;
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

/**
 * Rehydrate a persisted v1 or v2 snapshot through the current calculator.
 * Serialized resolved totals are deliberately ignored because BuildSnapshot is
 * a derived cache, never calculation authority.
 */
export function deserializeBuildSnapshot(json) {
  const parsed = typeof json === "string" ? JSON.parse(json) : cloneJson(json);
  assertPersistedSnapshotInput(parsed);
  return resolveBuildSnapshot({
    build: buildFromSnapshot(parsed),
    attributes: parsed.character.attributes,
  });
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
  const gameDataBuild = initializedGameBuild();
  if (value.ruleset?.id !== STATIC_RULESET_ID
    || value.ruleset?.calculatorVersion !== STATIC_CALCULATOR_VERSION
    || value.ruleset?.gameDataBuild !== gameDataBuild) {
    throw new Error("BuildSnapshot does not use the current static calculator ruleset.");
  }
  if (value.character?.level !== CHARACTER_LEVEL
    || value.calculationContext?.mode !== STATIC_CALCULATION_CONTEXT.mode
    || value.calculationContext?.includeSetEffects !== true
    || value.calculationContext?.dynamicEffects !== STATIC_CALCULATION_CONTEXT.dynamicEffects) {
    throw new Error("BuildSnapshot has an invalid persistent-static calculation context.");
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
  if (!VERIFIED_SNAPSHOTS.has(value)) {
    const recalculated = resolveBuildSnapshot({
      build: buildFromSnapshot(value),
      attributes: value.character.attributes,
    });
    if (JSON.stringify(sortJson(value)) !== JSON.stringify(sortJson(recalculated))) {
      throw new Error("BuildSnapshot resolved output does not match its authoritative raw loadout.");
    }
    deepFreeze(value);
    VERIFIED_SNAPSHOTS.add(value);
  }
}

/** Canonical cache identity for any persistent static calculation surface. */
export function staticCalculationFingerprint({ build, attributes = {}, includeSetEffects = true }) {
  if (!build || typeof build !== "object" || Array.isArray(build)) {
    throw new TypeError("Static calculation fingerprint requires a build object.");
  }
  return JSON.stringify(sortJson({
    ruleset: {
      id: STATIC_RULESET_ID,
      calculatorVersion: STATIC_CALCULATOR_VERSION,
      gameDataBuild: initializedGameBuild(),
    },
    calculationContext: {
      ...STATIC_CALCULATION_CONTEXT,
      includeSetEffects: Boolean(includeSetEffects),
    },
    build: cloneJson(build),
    attributes: normalizeAttributeInput(attributes),
  }));
}

function assertPersistedSnapshotInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("BuildSnapshot must be an object.");
  }
  if (value.schema !== BUILD_SNAPSHOT_SCHEMA || ![1, BUILD_SNAPSHOT_VERSION].includes(value.schemaVersion)) {
    throw new Error(`Unsupported BuildSnapshot schema: ${value.schema ?? "missing"} v${value.schemaVersion ?? "missing"}.`);
  }
  if (!value.identity || !value.character?.attributes || !value.loadout) {
    throw new Error("BuildSnapshot is missing required identity, attributes, or loadout fields.");
  }
}

function buildFromSnapshot(snapshot) {
  return {
    id: String(snapshot.identity?.id ?? ""),
    name: String(snapshot.identity?.name ?? ""),
    equipment: cloneJson(snapshot.loadout?.equipment ?? {}),
    artifacts: cloneJson(snapshot.loadout?.artifacts ?? {}),
    supportSlots: cloneJson(snapshot.loadout?.supportSlots ?? {}),
    skills: cloneJson(snapshot.loadout?.skills ?? []),
    masteries: cloneJson(snapshot.loadout?.masteries ?? {}),
    unifiedMasteries: cloneJson(snapshot.loadout?.unifiedMasteries ?? []),
    overallMasteryLevel: snapshot.loadout?.overallMasteryLevel ?? null,
  };
}

function initializedGameBuild() {
  const gameBuild = String(coreData?.gameBuild ?? "").trim();
  if (!gameBuild) throw new Error("BuildSnapshot requires initialized core data with a game build identifier.");
  return gameBuild;
}

function normalizeAttributeInput(attributes) {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    throw new TypeError("BuildSnapshot attributes must be an object.");
  }
  const normalized = { ...cloneJson(attributes) };
  for (const id of ATTRIBUTE_IDS) {
    const raw = normalized[id];
    if (raw == null || raw === "") normalized[id] = 0;
    else {
      const numeric = Number(raw);
      normalized[id] = Number.isFinite(numeric) ? numeric : String(raw);
    }
  }
  return sortJson(normalized);
}

function cloneJson(value, seen = new WeakSet()) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (["string", "boolean"].includes(typeof value)) return value;
  if (typeof value === "bigint") return `invalid-bigint:${String(value)}`;
  if (["undefined", "function", "symbol"].includes(typeof value)) return null;
  if (seen.has(value)) throw new TypeError("BuildSnapshot input must not contain circular references.");
  seen.add(value);
  const cloned = Array.isArray(value)
    ? value.map((entry) => cloneJson(entry, seen))
    : Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneJson(entry, seen)]));
  seen.delete(value);
  return cloned;
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
