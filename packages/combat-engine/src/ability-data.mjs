import { normalizeAbilityDefinition } from "./ability-definition.mjs";

export const COMBAT_ABILITY_DATA_SCHEMA = "tl-helper.combat-ability-data";
export const COMBAT_ABILITY_DATA_SCHEMA_VERSION = 1;

const TOP_LEVEL_KEYS = new Set(["schema", "schemaVersion", "gameBuild", "abilities"]);
const SAFE_BUILD = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * Validate an already parsed combat-ability artifact and expose immutable,
 * deterministic lookups. This loader deliberately performs no filesystem
 * access and no coefficient evaluation.
 */
export function loadCombatAbilityData(input) {
  const artifact = requireRecord(input, "Combat ability data");
  rejectUnknownKeys(artifact);

  if (artifact.schema !== COMBAT_ABILITY_DATA_SCHEMA) {
    throw new Error(`Unsupported combat ability data schema: ${String(artifact.schema)}`);
  }
  if (artifact.schemaVersion !== COMBAT_ABILITY_DATA_SCHEMA_VERSION) {
    throw new Error(`Unsupported combat ability data schemaVersion: ${String(artifact.schemaVersion)}`);
  }

  const gameBuild = requireBuild(artifact.gameBuild);
  if (!Array.isArray(artifact.abilities)) {
    throw new TypeError("Combat ability data abilities must be an array.");
  }

  const byId = new Map();
  for (const candidate of artifact.abilities) {
    const ability = normalizeAbilityDefinition(candidate);
    if (ability.gameBuild !== gameBuild) {
      throw new Error(
        `Ability ${ability.id} gameBuild ${ability.gameBuild} does not match combat ability data gameBuild ${gameBuild}.`,
      );
    }
    if (byId.has(ability.id)) {
      throw new Error(`Duplicate combat ability id: ${ability.id}`);
    }
    byId.set(ability.id, ability);
  }

  const abilities = deepFreeze([...byId.values()].sort((left, right) => compareCodeUnits(left.id, right.id)));
  const container = {
    schema: COMBAT_ABILITY_DATA_SCHEMA,
    schemaVersion: COMBAT_ABILITY_DATA_SCHEMA_VERSION,
    gameBuild,
    abilities,
    getAbility(id) {
      if (typeof id !== "string") throw new TypeError("Ability id must be a string.");
      return byId.get(id);
    },
    listAbilities() {
      return abilities;
    },
  };
  return deepFreeze(container);
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function requireBuild(value) {
  if (typeof value !== "string" || !SAFE_BUILD.test(value)) {
    throw new Error("Combat ability data gameBuild must be a safe build identifier.");
  }
  return value;
}

function rejectUnknownKeys(artifact) {
  for (const key of Object.keys(artifact)) {
    if (!TOP_LEVEL_KEYS.has(key)) throw new Error(`Unknown combat ability data key: ${key}`);
  }
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
