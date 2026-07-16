import {
  FORMULA_COMPONENT_PRECISION,
  FORMULA_COMPONENT_PROVENANCE,
  UNRESOLVED_STAGE_CLASSIFICATION,
} from "./ability-definition.mjs";
import { normalizeCombatScenario } from "./combat-scenario.mjs";
import {
  assertExpectedBuild,
  assertOnlyKeys,
  compareCodeUnits,
  deepFreeze,
  normalizeDecimal,
  requireBoolean,
  requireBuild,
  requireEnum,
  requireId,
  requireMatchingBuild,
  requireNonnegativeInteger,
  requirePositiveInteger,
  requireRecord,
  requireText,
} from "./contract-primitives.mjs";

export const COMBAT_EFFECT_DEFINITION_SCHEMA = "tl-helper.combat-effect-definition";
export const COMBAT_EFFECT_DEFINITION_SCHEMA_VERSION = 1;

export const EFFECT_EXECUTION_STATUS = Object.freeze({
  SUPPORTED: "supported",
  PARTIAL: "partial",
  UNSUPPORTED: "unsupported",
});

export const EFFECT_SOURCE_KIND = Object.freeze({
  SET: "set",
  WEAPON_PASSIVE: "weapon_passive",
  MASTERY: "mastery",
  ITEM: "item",
  SKILL_CORE: "skill_core",
});

export const EFFECT_TRIGGER_KIND = Object.freeze({
  SCENARIO_EVALUATION: "scenario_evaluation",
  ACTION_COMPLETED: "action_completed",
  HIT: "hit",
  CRITICAL_HIT: "critical_hit",
  HEAVY_HIT: "heavy_hit",
  DAMAGE_DEALT: "damage_dealt",
  DAMAGE_RECEIVED: "damage_received",
  INTERVAL: "interval",
});

export const EFFECT_CONDITION_KIND = Object.freeze({
  NUMERIC_COMPARE: "numeric_compare",
  ENUM_EQUALS: "enum_equals",
  WEAPON_EQUIPPED: "weapon_equipped",
  WEAPON_ACTIVE: "weapon_active",
});

const EXECUTION_STATUSES = new Set(Object.values(EFFECT_EXECUTION_STATUS));
const SOURCE_KINDS = new Set(Object.values(EFFECT_SOURCE_KIND));
const TRIGGER_KINDS = new Set(Object.values(EFFECT_TRIGGER_KIND));
const CONDITION_KINDS = new Set(Object.values(EFFECT_CONDITION_KIND));
const PRECISIONS = new Set(Object.values(FORMULA_COMPONENT_PRECISION));
const PROVENANCES = new Set(Object.values(FORMULA_COMPONENT_PROVENANCE));
const UNRESOLVED_CLASSIFICATIONS = new Set(Object.values(UNRESOLVED_STAGE_CLASSIFICATION));
const COMPARISON_OPERATORS = new Set(["lt", "lte", "eq", "gte", "gt"]);
const PARTICIPANT_REFS = new Set(["source", "target"]);
const COMPONENT_KINDS = new Set(["stat_modifier", "formula_reference"]);
const STAT_OPERATIONS = new Set(["add", "multiply"]);
const ROUNDINGS = new Set(["none", "floor", "ceil", "nearest"]);
const NUMERIC_SCENARIO_PATHS = new Set(["target.distanceMeters", "durationMs"]);
const ENUM_SCENARIO_VALUES = Object.freeze({
  "environment.timeOfDay": new Set(["unspecified", "day", "night", "dawn", "dusk"]),
  "environment.weather": new Set(["unspecified", "clear", "rain", "snow", "fog", "storm"]),
});
const EVIDENCE_KINDS = new Set(["decoded_row", "localization", "official", "calibration", "audit", "community_model"]);
const ALLOWED_PROVENANCE_BY_PRECISION = Object.freeze({
  [FORMULA_COMPONENT_PRECISION.VERIFIED_EXACT]: new Set([FORMULA_COMPONENT_PROVENANCE.EXTRACTED, FORMULA_COMPONENT_PROVENANCE.OFFICIAL]),
  [FORMULA_COMPONENT_PRECISION.VERIFIED_CALIBRATED]: new Set([FORMULA_COMPONENT_PROVENANCE.CALIBRATED]),
  [FORMULA_COMPONENT_PRECISION.DERIVED_HIGH_CONFIDENCE]: new Set([FORMULA_COMPONENT_PROVENANCE.DERIVED, FORMULA_COMPONENT_PROVENANCE.EXTRACTED]),
  [FORMULA_COMPONENT_PRECISION.MODELED]: new Set([FORMULA_COMPONENT_PROVENANCE.MODELED]),
  [FORMULA_COMPONENT_PRECISION.UNSUPPORTED]: new Set([FORMULA_COMPONENT_PROVENANCE.UNRESOLVED]),
});

/** Validate, detach, canonically order, and deeply freeze one effect definition. */
export function normalizeCombatEffectDefinition(input, { expectedGameBuild } = {}) {
  const value = requireRecord(input, "Combat effect definition");
  assertOnlyKeys(value, [
    "schema", "schemaVersion", "gameBuild", "id", "name", "execution", "sources",
    "weaponRequirements", "triggers", "conditions", "components", "unresolvedStages", "provenance",
  ], "Combat effect definition");
  if (value.schema !== COMBAT_EFFECT_DEFINITION_SCHEMA) {
    throw new Error(`Unsupported combat effect definition schema: ${String(value.schema)}`);
  }
  if (value.schemaVersion !== COMBAT_EFFECT_DEFINITION_SCHEMA_VERSION) {
    throw new Error(`Unsupported combat effect definition schemaVersion: ${String(value.schemaVersion)}`);
  }
  const gameBuild = requireBuild(value.gameBuild, "gameBuild");
  assertExpectedBuild(gameBuild, expectedGameBuild);
  const execution = requireEnum(value.execution, EXECUTION_STATUSES, "execution status");
  const triggers = normalizeUniqueArray(value.triggers, "triggers", normalizeTrigger);
  const components = normalizeUniqueArray(value.components, "components", (entry, index) => normalizeComponent(entry, gameBuild, index));
  const unresolvedStages = normalizeUniqueArray(
    value.unresolvedStages,
    "unresolvedStages",
    (entry, index) => normalizeUnresolvedStage(entry, gameBuild, index),
  );
  assertExecutionShape(execution, triggers, components, unresolvedStages);
  const provenance = normalizeProvenance(value.provenance, gameBuild, "provenance", execution === EFFECT_EXECUTION_STATUS.UNSUPPORTED);
  if (execution !== EFFECT_EXECUTION_STATUS.UNSUPPORTED && provenance.precision === FORMULA_COMPONENT_PRECISION.UNSUPPORTED) {
    throw new Error(`${execution} effects cannot claim unsupported root provenance.`);
  }

  return deepFreeze({
    schema: COMBAT_EFFECT_DEFINITION_SCHEMA,
    schemaVersion: COMBAT_EFFECT_DEFINITION_SCHEMA_VERSION,
    gameBuild,
    id: requireId(value.id, "id"),
    name: requireText(value.name, "name"),
    execution,
    sources: normalizeSources(value.sources, gameBuild),
    weaponRequirements: normalizeUniqueIds(value.weaponRequirements, "weaponRequirements"),
    triggers,
    conditions: normalizeUniqueArray(value.conditions, "conditions", normalizeCondition),
    components,
    unresolvedStages,
    provenance,
  });
}

export const createCombatEffectDefinition = normalizeCombatEffectDefinition;

export function validateCombatEffectDefinition(input, options) {
  normalizeCombatEffectDefinition(input, options);
  return true;
}

export function assertCombatEffectMatchesScenario(effectInput, scenarioInput) {
  const effect = normalizeCombatEffectDefinition(effectInput);
  const scenario = normalizeCombatScenario(scenarioInput);
  if (effect.gameBuild !== scenario.gameBuild) {
    throw new Error(`Effect gameBuild ${effect.gameBuild} does not match scenario gameBuild ${scenario.gameBuild}.`);
  }
  return true;
}

function normalizeSources(input, gameBuild) {
  if (!Array.isArray(input) || input.length === 0) throw new TypeError("sources must be a nonempty array.");
  const seen = new Set();
  return input.map((entry, index) => {
    const label = `sources[${index}]`;
    const value = requireRecord(entry, label);
    assertOnlyKeys(value, ["kind", "id", "gameBuild", "breakpoint"], label);
    const source = {
      kind: requireEnum(value.kind, SOURCE_KINDS, `${label}.kind`),
      id: requireId(value.id, `${label}.id`),
      gameBuild: requireMatchingBuild(value.gameBuild, gameBuild, `${label}.gameBuild`),
      ...(value.breakpoint === undefined ? {} : { breakpoint: requirePositiveInteger(value.breakpoint, `${label}.breakpoint`) }),
    };
    const key = `${source.kind}\0${source.id}\0${source.breakpoint ?? ""}`;
    if (seen.has(key)) throw new Error(`${label} duplicates a source.`);
    seen.add(key);
    return source;
  }).sort((left, right) => compareCodeUnits(`${left.kind}\0${left.id}\0${left.breakpoint ?? ""}`, `${right.kind}\0${right.id}\0${right.breakpoint ?? ""}`));
}

function normalizeTrigger(input, index) {
  const label = `triggers[${index}]`;
  const value = requireRecord(input, label);
  assertOnlyKeys(value, ["id", "kind", "abilityId", "intervalMs"], label);
  const kind = requireEnum(value.kind, TRIGGER_KINDS, `${label}.kind`);
  if (kind === EFFECT_TRIGGER_KIND.INTERVAL) {
    if (value.intervalMs === undefined) throw new Error(`${label}.intervalMs is required for interval triggers.`);
  } else if (value.intervalMs !== undefined) {
    throw new Error(`${label}.intervalMs is only allowed for interval triggers.`);
  }
  if (kind === EFFECT_TRIGGER_KIND.SCENARIO_EVALUATION && value.abilityId !== undefined) {
    throw new Error(`${label}.abilityId is not allowed for scenario_evaluation triggers.`);
  }
  return {
    id: requireId(value.id, `${label}.id`),
    kind,
    ...(value.abilityId === undefined ? {} : { abilityId: requireId(value.abilityId, `${label}.abilityId`) }),
    ...(value.intervalMs === undefined ? {} : { intervalMs: requirePositiveInteger(value.intervalMs, `${label}.intervalMs`) }),
  };
}

function normalizeCondition(input, index) {
  const label = `conditions[${index}]`;
  const value = requireRecord(input, label);
  assertOnlyKeys(value, ["id", "kind", "left", "operator", "right", "reference", "value", "participant", "weaponType"], label);
  const id = requireId(value.id, `${label}.id`);
  const kind = requireEnum(value.kind, CONDITION_KINDS, `${label}.kind`);
  if (kind === EFFECT_CONDITION_KIND.NUMERIC_COMPARE) {
    assertExactFields(value, ["id", "kind", "left", "operator", "right"], label);
    return {
      id,
      kind,
      left: normalizeNumericReference(value.left, `${label}.left`),
      operator: requireEnum(value.operator, COMPARISON_OPERATORS, `${label}.operator`),
      right: normalizeNumericReference(value.right, `${label}.right`),
    };
  }
  if (kind === EFFECT_CONDITION_KIND.ENUM_EQUALS) {
    assertExactFields(value, ["id", "kind", "reference", "value"], label);
    const reference = normalizeEnumReference(value.reference, `${label}.reference`);
    return { id, kind, reference, value: requireEnum(value.value, ENUM_SCENARIO_VALUES[reference.path], `${label}.value`) };
  }
  assertExactFields(value, ["id", "kind", "participant", "weaponType"], label);
  return {
    id,
    kind,
    participant: requireEnum(value.participant, PARTICIPANT_REFS, `${label}.participant`),
    weaponType: requireId(value.weaponType, `${label}.weaponType`),
  };
}

function normalizeComponent(input, gameBuild, index) {
  const label = `components[${index}]`;
  const value = requireRecord(input, label);
  assertOnlyKeys(value, [
    "id", "kind", "recipient", "statId", "operation", "value", "durationMs",
    "abilityId", "formulaComponentId", "provenance",
  ], label);
  const id = requireId(value.id, `${label}.id`);
  const kind = requireEnum(value.kind, COMPONENT_KINDS, `${label}.kind`);
  const recipient = requireEnum(value.recipient, PARTICIPANT_REFS, `${label}.recipient`);
  const provenance = normalizeProvenance(value.provenance, gameBuild, `${label}.provenance`, false);
  if (provenance.precision === FORMULA_COMPONENT_PRECISION.UNSUPPORTED) {
    throw new Error(`${label} cannot execute unsupported provenance.`);
  }
  if (kind === "stat_modifier") {
    assertExactFields(value, ["id", "kind", "recipient", "statId", "operation", "value", "provenance"], label, ["durationMs"]);
    return {
      id,
      kind,
      recipient,
      statId: requireId(value.statId, `${label}.statId`),
      operation: requireEnum(value.operation, STAT_OPERATIONS, `${label}.operation`),
      value: normalizeValueExpression(value.value, `${label}.value`),
      ...(value.durationMs === undefined ? {} : { durationMs: requireNonnegativeInteger(value.durationMs, `${label}.durationMs`) }),
      provenance,
    };
  }
  assertExactFields(value, ["id", "kind", "recipient", "abilityId", "formulaComponentId", "provenance"], label);
  return {
    id,
    kind,
    recipient,
    abilityId: requireId(value.abilityId, `${label}.abilityId`),
    formulaComponentId: requireId(value.formulaComponentId, `${label}.formulaComponentId`),
    provenance,
  };
}

function normalizeValueExpression(input, label) {
  const value = requireRecord(input, label);
  assertOnlyKeys(value, ["reference", "multiplier", "offset", "rounding", "unit"], label);
  return {
    reference: normalizeNumericReference(value.reference, `${label}.reference`),
    multiplier: normalizeDecimal(value.multiplier, `${label}.multiplier`),
    offset: normalizeDecimal(value.offset, `${label}.offset`),
    rounding: requireEnum(value.rounding, ROUNDINGS, `${label}.rounding`),
    unit: requireId(value.unit, `${label}.unit`),
  };
}

function normalizeNumericReference(input, label) {
  const value = requireRecord(input, label);
  assertOnlyKeys(value, ["kind", "value", "path", "participant", "statId"], label);
  if (value.kind === "constant") {
    assertExactFields(value, ["kind", "value"], label);
    return { kind: "constant", value: normalizeDecimal(value.value, `${label}.value`) };
  }
  if (value.kind === "scenario_numeric") {
    assertExactFields(value, ["kind", "path"], label);
    return { kind: "scenario_numeric", path: requireEnum(value.path, NUMERIC_SCENARIO_PATHS, `${label}.path`) };
  }
  if (value.kind === "participant_stat") {
    assertExactFields(value, ["kind", "participant", "statId"], label);
    return {
      kind: "participant_stat",
      participant: requireEnum(value.participant, PARTICIPANT_REFS, `${label}.participant`),
      statId: requireId(value.statId, `${label}.statId`),
    };
  }
  throw new Error(`Unknown ${label}.kind: ${String(value.kind)}`);
}

function normalizeEnumReference(input, label) {
  const value = requireRecord(input, label);
  assertExactFields(value, ["kind", "path"], label);
  if (value.kind !== "scenario_enum") throw new Error(`${label}.kind must be scenario_enum.`);
  if (!Object.hasOwn(ENUM_SCENARIO_VALUES, value.path)) throw new Error(`Unknown ${label}.path: ${String(value.path)}`);
  return { kind: "scenario_enum", path: value.path };
}

function normalizeUnresolvedStage(input, gameBuild, index) {
  const label = `unresolvedStages[${index}]`;
  const value = requireRecord(input, label);
  assertOnlyKeys(value, ["id", "gameBuild", "classification", "reason", "executable", "provenance"], label);
  if (requireBoolean(value.executable, `${label}.executable`) !== false) {
    throw new Error(`${label}.executable must be false.`);
  }
  const provenance = normalizeProvenance(value.provenance, gameBuild, `${label}.provenance`, true);
  if (provenance.precision !== FORMULA_COMPONENT_PRECISION.UNSUPPORTED) {
    throw new Error(`${label} must use unsupported precision.`);
  }
  return {
    id: requireId(value.id, `${label}.id`),
    gameBuild: requireMatchingBuild(value.gameBuild, gameBuild, `${label}.gameBuild`),
    classification: requireEnum(value.classification, UNRESOLVED_CLASSIFICATIONS, `${label}.classification`),
    reason: requireText(value.reason, `${label}.reason`),
    executable: false,
    provenance,
  };
}

function normalizeProvenance(input, gameBuild, label, mustBeUnsupported) {
  const value = requireRecord(input, label);
  assertOnlyKeys(value, ["precision", "provenance", "evidence"], label);
  const precision = requireEnum(value.precision, PRECISIONS, `${label}.precision`);
  const provenance = requireEnum(value.provenance, PROVENANCES, `${label}.provenance`);
  if (!ALLOWED_PROVENANCE_BY_PRECISION[precision].has(provenance)) {
    throw new Error(`${label} cannot claim ${precision} precision with ${provenance} provenance.`);
  }
  if (mustBeUnsupported && precision !== FORMULA_COMPONENT_PRECISION.UNSUPPORTED) {
    throw new Error(`${label} must use unsupported precision and unresolved provenance.`);
  }
  if (!Array.isArray(value.evidence) || value.evidence.length === 0) throw new Error(`${label}.evidence must be a nonempty array.`);
  const evidence = value.evidence.map((entry, index) => {
    const evidenceLabel = `${label}.evidence[${index}]`;
    const row = requireRecord(entry, evidenceLabel);
    assertOnlyKeys(row, ["kind", "reference", "gameBuild"], evidenceLabel);
    return {
      kind: requireEnum(row.kind, EVIDENCE_KINDS, `${evidenceLabel}.kind`),
      reference: requireText(row.reference, `${evidenceLabel}.reference`),
      gameBuild: requireMatchingBuild(row.gameBuild, gameBuild, `${evidenceLabel}.gameBuild`),
    };
  }).sort((left, right) => compareCodeUnits(
    `${left.kind}\0${left.reference}\0${left.gameBuild}`,
    `${right.kind}\0${right.reference}\0${right.gameBuild}`,
  ));
  const evidenceKeys = evidence.map((row) => `${row.kind}\0${row.reference}\0${row.gameBuild}`);
  if (new Set(evidenceKeys).size !== evidenceKeys.length) throw new Error(`${label}.evidence contains duplicate rows.`);
  return { precision, provenance, evidence };
}

function normalizeUniqueIds(input, label) {
  if (!Array.isArray(input)) throw new TypeError(`${label} must be an array.`);
  const ids = input.map((value, index) => requireId(value, `${label}[${index}]`));
  if (new Set(ids).size !== ids.length) throw new Error(`${label} contains duplicate values.`);
  return ids.sort(compareCodeUnits);
}

function normalizeUniqueArray(input, label, normalize) {
  if (!Array.isArray(input)) throw new TypeError(`${label} must be an array.`);
  const seen = new Set();
  const values = input.map((entry, index) => {
    const normalized = normalize(entry, index);
    if (seen.has(normalized.id)) throw new Error(`${label} contains duplicate id: ${normalized.id}`);
    seen.add(normalized.id);
    return normalized;
  });
  return values.sort((left, right) => compareCodeUnits(left.id, right.id));
}

function assertExactFields(value, required, label, optional = []) {
  assertOnlyKeys(value, [...required, ...optional], label);
  for (const key of required) if (value[key] === undefined) throw new Error(`${label}.${key} is required.`);
}

function assertExecutionShape(execution, triggers, components, unresolvedStages) {
  if (execution !== EFFECT_EXECUTION_STATUS.UNSUPPORTED && triggers.length === 0) {
    throw new Error(`${execution} effects require at least one trigger.`);
  }
  if (execution === EFFECT_EXECUTION_STATUS.SUPPORTED && (components.length === 0 || unresolvedStages.length !== 0)) {
    throw new Error("supported effects require components and cannot contain unresolvedStages.");
  }
  if (execution === EFFECT_EXECUTION_STATUS.PARTIAL && (components.length === 0 || unresolvedStages.length === 0)) {
    throw new Error("partial effects require both executable components and unresolvedStages.");
  }
  if (execution === EFFECT_EXECUTION_STATUS.UNSUPPORTED && (components.length !== 0 || unresolvedStages.length === 0)) {
    throw new Error("unsupported effects cannot contain components and require unresolvedStages.");
  }
}
