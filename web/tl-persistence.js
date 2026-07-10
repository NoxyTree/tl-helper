// Patch-safe browser persistence for Armory state and presets.
//
// Persisted documents deliberately keep the planner's data opaque. Validation
// checks only the stable boundary, so unknown item, skill, and future fields
// survive migrations and can be resolved again by a later game-data build.

export const ARMORY_STATE_SCHEMA = "tl-helper.armory-state";
export const ARMORY_PRESETS_SCHEMA = "tl-helper.armory-presets";
export const PERSISTENCE_VERSION = 1;

export const ARMORY_STATE_KEY = "tlhelper-builder-state-v2";
export const LEGACY_ARMORY_STATE_KEYS = ["tlhelper-builder-state-v1"];
export const ARMORY_PRESETS_KEY = "tlhelper-builder-presets-v1";

export function encodeArmoryState(state, { gameBuild = "unversioned", savedAt = new Date().toISOString() } = {}) {
  assertArmoryState(state);
  return documentFor(ARMORY_STATE_SCHEMA, cloneJson(state), gameBuild, savedAt);
}

export function encodeArmoryPresets(presets, { gameBuild = "unversioned", savedAt = new Date().toISOString() } = {}) {
  assertPresetList(presets);
  return documentFor(ARMORY_PRESETS_SCHEMA, { presets: cloneJson(presets) }, gameBuild, savedAt);
}

export function serializeArmoryState(state, options) {
  return JSON.stringify(encodeArmoryState(state, options));
}

export function serializeArmoryPresets(presets, options) {
  return JSON.stringify(encodeArmoryPresets(presets, options));
}

export function parseArmoryState(value, options = {}) {
  return parseDocument(value, ARMORY_STATE_SCHEMA, options, (payload) => {
    assertArmoryState(payload);
    return cloneJson(payload);
  });
}

export function parseArmoryPresets(value, options = {}) {
  return parseDocument(value, ARMORY_PRESETS_SCHEMA, options, (payload, legacy) => {
    const presets = legacy ? payload : payload?.presets;
    assertPresetList(presets);
    return cloneJson(presets);
  });
}

export function loadArmoryState(storage, {
  key = ARMORY_STATE_KEY,
  legacyKeys = LEGACY_ARMORY_STATE_KEYS,
  currentGameBuild = "unversioned",
  recoverCorrupt = true,
} = {}) {
  return loadFromStorage(storage, [key, ...legacyKeys], parseArmoryState, {
    currentGameBuild,
    recoverCorrupt,
  });
}

export function loadArmoryPresets(storage, {
  key = ARMORY_PRESETS_KEY,
  currentGameBuild = "unversioned",
  recoverCorrupt = true,
} = {}) {
  return loadFromStorage(storage, [key], parseArmoryPresets, {
    currentGameBuild,
    recoverCorrupt,
  });
}

export function saveArmoryState(storage, state, options = {}) {
  storage.setItem(options.key ?? ARMORY_STATE_KEY, serializeArmoryState(state, options));
}

export function saveArmoryPresets(storage, presets, options = {}) {
  storage.setItem(options.key ?? ARMORY_PRESETS_KEY, serializeArmoryPresets(presets, options));
}

function parseDocument(value, schema, { currentGameBuild = "unversioned" } = {}, validatePayload) {
  let parsed;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : cloneJson(value);
  } catch (error) {
    return failure("corrupt", `Saved data is not valid JSON: ${error.message}`);
  }

  if (parsed == null) return failure("empty", "No saved data was found.");
  if (typeof parsed !== "object" || Array.isArray(parsed) && schema === ARMORY_STATE_SCHEMA) {
    return failure("invalid", "Saved data has an invalid top-level shape.");
  }

  const legacy = parsed.schema == null;
  if (!legacy) {
    if (parsed.schema !== schema) return failure("invalid", `Expected ${schema}, received ${parsed.schema}.`);
    if (!Number.isInteger(parsed.schemaVersion)) return failure("invalid", "Saved data has no valid schema version.");
    if (parsed.schemaVersion > PERSISTENCE_VERSION) {
      return failure("unsupported", `Saved data uses newer schema version ${parsed.schemaVersion}.`);
    }
    if (parsed.schemaVersion < PERSISTENCE_VERSION) {
      return failure("unsupported", `Saved data uses unsupported schema version ${parsed.schemaVersion}.`);
    }
  }

  try {
    const data = validatePayload(legacy ? parsed : parsed.data, legacy);
    const savedGameBuild = legacy ? "unversioned" : String(parsed.gameBuild ?? "unversioned");
    const warnings = buildWarnings(savedGameBuild, currentGameBuild);
    if (legacy) warnings.unshift("Saved data was migrated from an unversioned legacy format.");
    return {
      ok: true,
      status: "ok",
      data,
      migrated: legacy,
      gameBuild: savedGameBuild,
      warnings,
    };
  } catch (error) {
    return failure("invalid", error.message);
  }
}

function loadFromStorage(storage, keys, parser, { currentGameBuild, recoverCorrupt }) {
  const warnings = [];
  for (const key of keys) {
    const raw = storage.getItem(key);
    if (raw == null) continue;
    const result = parser(raw, { currentGameBuild });
    if (result.ok) return { ...result, sourceKey: key, warnings: [...warnings, ...result.warnings] };
    warnings.push(`${key}: ${result.error}`);
    if (result.status === "corrupt" && recoverCorrupt) {
      const recoveryKey = preserveCorruptValue(storage, key, raw);
      if (recoveryKey) warnings.push(`The unreadable value was preserved at ${recoveryKey}.`);
    }
    if (result.status === "unsupported") return { ...result, sourceKey: key, warnings };
  }
  return { ...failure("empty", "No usable saved data was found."), warnings };
}

export function preserveCorruptValue(storage, key, raw, timestamp = Date.now()) {
  try {
    const recoveryKey = `${key}:recovery:${timestamp}`;
    storage.setItem(recoveryKey, raw);
    return recoveryKey;
  } catch {
    return "";
  }
}

function documentFor(schema, data, gameBuild, savedAt) {
  return {
    schema,
    schemaVersion: PERSISTENCE_VERSION,
    gameBuild: String(gameBuild ?? "unversioned"),
    savedAt: String(savedAt),
    data,
  };
}

function assertArmoryState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !value.build?.equipment) {
    throw new TypeError("Armory state must contain build.equipment.");
  }
}

function assertPresetList(value) {
  if (!Array.isArray(value)) throw new TypeError("Armory presets must be an array.");
  for (const preset of value) assertArmoryState(preset);
}

function buildWarnings(saved, current) {
  const savedBuild = String(saved ?? "unversioned");
  const currentBuild = String(current ?? "unversioned");
  if (savedBuild === "unversioned" || currentBuild === "unversioned" || savedBuild === currentBuild) return [];
  return [`Saved build ${savedBuild} differs from current game-data build ${currentBuild}. Unknown IDs were preserved.`];
}

function failure(status, error) {
  return { ok: false, status, data: null, migrated: false, gameBuild: "unversioned", warnings: [], error };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
