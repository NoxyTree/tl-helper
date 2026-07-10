export const ABILITY_DEFINITION_SCHEMA = "tl-helper.combat-ability-definition";
export const ABILITY_DEFINITION_SCHEMA_VERSION = 1;

export const ABILITY_KIND = Object.freeze({
  DAMAGE: "damage",
  HEALING: "healing",
  SHIELDING: "shielding",
  BUFF: "buff",
  DEBUFF: "debuff",
  CONTROL: "control",
  RESOURCE: "resource",
  HYBRID: "hybrid",
});

export const FORMULA_COMPONENT_PRECISION = Object.freeze({
  VERIFIED_EXACT: "verified_exact",
  VERIFIED_CALIBRATED: "verified_calibrated",
  DERIVED_HIGH_CONFIDENCE: "derived_high_confidence",
  MODELED: "modeled",
  UNSUPPORTED: "unsupported",
});

export const FORMULA_COMPONENT_PROVENANCE = Object.freeze({
  EXTRACTED: "extracted",
  OFFICIAL: "official",
  CALIBRATED: "calibrated",
  DERIVED: "derived",
  MODELED: "modeled",
  UNRESOLVED: "unresolved",
});

export const UNRESOLVED_STAGE_CLASSIFICATION = Object.freeze({
  EXTRACTABLE: "extractable",
  CALIBRATION_REQUIRED: "calibration_required",
  LIKELY_SERVER_ONLY: "likely_server_only",
  CURRENTLY_UNKNOWN: "currently_unknown",
  UNSUPPORTED: "unsupported",
});

const ABILITY_KINDS = new Set(Object.values(ABILITY_KIND));
const PRECISIONS = new Set(Object.values(FORMULA_COMPONENT_PRECISION));
const PROVENANCES = new Set(Object.values(FORMULA_COMPONENT_PROVENANCE));
const UNRESOLVED_CLASSIFICATIONS = new Set(Object.values(UNRESOLVED_STAGE_CLASSIFICATION));
const MAPPING_CLASSES = new Set(["exact", "derived", "reviewed_alias", "description_derived"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_BUILD = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const RAW_NUMBER = /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/;

const ALLOWED_PROVENANCE_BY_PRECISION = Object.freeze({
  [FORMULA_COMPONENT_PRECISION.VERIFIED_EXACT]: new Set([
    FORMULA_COMPONENT_PROVENANCE.EXTRACTED,
    FORMULA_COMPONENT_PROVENANCE.OFFICIAL,
  ]),
  [FORMULA_COMPONENT_PRECISION.VERIFIED_CALIBRATED]: new Set([
    FORMULA_COMPONENT_PROVENANCE.CALIBRATED,
  ]),
  [FORMULA_COMPONENT_PRECISION.DERIVED_HIGH_CONFIDENCE]: new Set([
    FORMULA_COMPONENT_PROVENANCE.DERIVED,
    FORMULA_COMPONENT_PROVENANCE.EXTRACTED,
  ]),
  [FORMULA_COMPONENT_PRECISION.MODELED]: new Set([
    FORMULA_COMPONENT_PROVENANCE.MODELED,
  ]),
  [FORMULA_COMPONENT_PRECISION.UNSUPPORTED]: new Set([
    FORMULA_COMPONENT_PROVENANCE.UNRESOLVED,
  ]),
});

/**
 * Validate, normalize, detach, and deeply freeze a versioned combat ability
 * definition. Raw numeric coefficients become decimal strings so decoded
 * integers cannot silently lose precision after ingestion.
 */
export function normalizeAbilityDefinition(input) {
  const value = requireRecord(input, "Ability definition");
  if (value.schema !== ABILITY_DEFINITION_SCHEMA) {
    throw new Error(`Unsupported ability definition schema: ${String(value.schema)}`);
  }
  if (value.schemaVersion !== ABILITY_DEFINITION_SCHEMA_VERSION) {
    throw new Error(`Unsupported ability definition schemaVersion: ${String(value.schemaVersion)}`);
  }

  const gameBuild = requireBuild(value.gameBuild, "gameBuild");
  const id = requireId(value.id, "id");
  const name = requireText(value.name, "name");
  const weapon = requireId(value.weapon, "weapon");
  if (!ABILITY_KINDS.has(value.kind)) throw new Error(`Unknown ability kind: ${String(value.kind)}`);
  const skillLevelRange = normalizeLevelRange(value.skillLevelRange, "skillLevelRange");

  if (!Array.isArray(value.formulaComponents)) throw new TypeError("formulaComponents must be an array.");
  if (!Array.isArray(value.unresolvedStages)) throw new TypeError("unresolvedStages must be an array.");
  if (value.formulaComponents.length === 0 && value.unresolvedStages.length === 0) {
    throw new Error("Ability definition requires a formula component or an explicit unresolved stage.");
  }

  const componentIds = new Set();
  const formulaComponents = value.formulaComponents.map((component, index) => {
    const normalized = normalizeFormulaComponent(component, gameBuild, skillLevelRange, index);
    if (componentIds.has(normalized.id)) throw new Error(`Duplicate formula component id: ${normalized.id}`);
    componentIds.add(normalized.id);
    return normalized;
  });

  const stageIds = new Set();
  const unresolvedStages = value.unresolvedStages.map((stage, index) => {
    const normalized = normalizeUnresolvedStage(stage, gameBuild, index);
    if (stageIds.has(normalized.id)) throw new Error(`Duplicate unresolved stage id: ${normalized.id}`);
    stageIds.add(normalized.id);
    return normalized;
  });

  return deepFreeze({
    schema: ABILITY_DEFINITION_SCHEMA,
    schemaVersion: ABILITY_DEFINITION_SCHEMA_VERSION,
    gameBuild,
    id,
    ...(value.abilityId === undefined ? {} : { abilityId: requireMatchingId(value.abilityId, id, "abilityId") }),
    ...(value.skillSetId === undefined ? {} : { skillSetId: requireId(value.skillSetId, "skillSetId") }),
    name,
    weapon,
    ...(value.skillType === undefined ? {} : { skillType: requireId(value.skillType, "skillType") }),
    kind: value.kind,
    skillLevelRange,
    formulaComponents,
    unresolvedStages,
    ...(value.source === undefined ? {} : { source: normalizeAbilitySource(value.source, gameBuild) }),
  });
}

export const createAbilityDefinition = normalizeAbilityDefinition;

export function validateAbilityDefinition(input) {
  normalizeAbilityDefinition(input);
  return true;
}

function normalizeFormulaComponent(input, expectedBuild, abilityLevelRange, index) {
  const label = `formulaComponents[${index}]`;
  const value = requireRecord(input, label);
  const id = requireId(value.id, `${label}.id`);
  assertMatchingBuild(value.gameBuild, expectedBuild, `${label}.gameBuild`);
  const levelRange = normalizeLevelRange(value.skillLevelRange, `${label}.skillLevelRange`);
  if (levelRange.minimum < abilityLevelRange.minimum || levelRange.maximum > abilityLevelRange.maximum) {
    throw new RangeError(`${label}.skillLevelRange falls outside the ability skillLevelRange.`);
  }
  const sourceTable = requireId(value.sourceTable, `${label}.sourceTable`);
  const sourceRow = requireId(value.sourceRow, `${label}.sourceRow`);
  const formulaType = requireId(value.formulaType, `${label}.formulaType`);
  const rawCoefficients = normalizeRawCoefficients(value.rawCoefficients, `${label}.rawCoefficients`);
  const levelCount = levelRange.maximum - levelRange.minimum + 1;
  assertCoefficientCoverage(rawCoefficients, levelCount, `${label}.rawCoefficients`);
  const units = normalizeUnits(value.units, rawCoefficients, `${label}.units`);
  const precision = requireEnum(value.precision, PRECISIONS, `${label}.precision`);
  const provenance = requireEnum(value.provenance, PROVENANCES, `${label}.provenance`);
  if (!ALLOWED_PROVENANCE_BY_PRECISION[precision].has(provenance)) {
    throw new Error(`${label} cannot claim ${precision} precision with ${provenance} provenance.`);
  }
  const evidence = normalizeEvidence(value.evidence, expectedBuild, `${label}.evidence`);
  const role = requireId(value.role, `${label}.role`);
  const mappingClass = requireEnum(value.mappingClass, MAPPING_CLASSES, `${label}.mappingClass`);
  const rawLevels = normalizeRawLevels(value.rawLevels, {
    label: `${label}.rawLevels`, levelRange, formulaType, rawCoefficients,
  });
  const dynamicStatIdsByLevel = normalizeDynamicStatIdsByLevel(
    value.dynamicStatIdsByLevel,
    rawLevels,
    `${label}.dynamicStatIdsByLevel`,
  );
  const source = normalizeComponentSource(value.source, expectedBuild, sourceTable, sourceRow, `${label}.source`);

  return {
    id,
    gameBuild: expectedBuild,
    skillLevelRange: levelRange,
    sourceTable,
    sourceRow,
    formulaType,
    rawCoefficients,
    units,
    precision,
    provenance,
    evidence,
    role,
    ...(value.effectKind === undefined || value.effectKind === null ? {} : { effectKind: requireId(value.effectKind, `${label}.effectKind`) }),
    mappingClass,
    mappingEvidence: normalizeJsonArray(value.mappingEvidence, `${label}.mappingEvidence`),
    rawLevels,
    dynamicStatIdsByLevel,
    source,
  };
}

function normalizeRawLevels(input, { label, levelRange, formulaType, rawCoefficients }) {
  if (!Array.isArray(input)) throw new TypeError(`${label} must be an array.`);
  const expectedCount = levelRange.maximum - levelRange.minimum + 1;
  if (input.length !== expectedCount) throw new Error(`${label} must cover every skill level in the component skillLevelRange.`);
  const seen = new Set();
  const result = input.map((entry, index) => {
    const itemLabel = `${label}[${index}]`;
    const value = requireRecord(entry, itemLabel);
    const skillLevel = requirePositiveInteger(value.skillLevel, `${itemLabel}.skillLevel`);
    if (seen.has(skillLevel)) throw new Error(`${label} contains duplicate skillLevel ${skillLevel}.`);
    seen.add(skillLevel);
    if (skillLevel < levelRange.minimum || skillLevel > levelRange.maximum) {
      throw new RangeError(`${itemLabel}.skillLevel falls outside the component skillLevelRange.`);
    }
    if (value.formulaType !== formulaType) throw new Error(`${itemLabel}.formulaType does not match the component formulaType.`);
    const dynamicStatIds = normalizeDynamicStatIds(value.dynamicStatIds, `${itemLabel}.dynamicStatIds`);
    const coefficients = Object.fromEntries(Object.keys(rawCoefficients).map((key) => {
      if (!(key in value)) throw new Error(`${itemLabel} is missing raw coefficient ${key}.`);
      return [key, normalizeNullableRawScalar(value[key], `${itemLabel}.${key}`)];
    }));
    return {
      skillLevel,
      formulaType,
      ...coefficients,
      dynamicStatIds,
      raw: normalizeJsonRecord(value.raw, `${itemLabel}.raw`),
    };
  }).sort((left, right) => left.skillLevel - right.skillLevel);

  for (let offset = 0; offset < expectedCount; offset += 1) {
    const expectedLevel = levelRange.minimum + offset;
    const level = result[offset];
    if (level.skillLevel !== expectedLevel) throw new Error(`${label} does not explicitly cover skillLevel ${expectedLevel}.`);
    for (const [key, coefficients] of Object.entries(rawCoefficients)) {
      if (level[key] !== coefficients[offset]) {
        throw new Error(`${label} coefficient ${key} at skillLevel ${expectedLevel} disagrees with rawCoefficients.`);
      }
    }
  }
  return result;
}

function normalizeDynamicStatIdsByLevel(input, rawLevels, label) {
  if (!Array.isArray(input) || input.length !== rawLevels.length) {
    throw new Error(`${label} must cover every raw level.`);
  }
  const seen = new Set();
  const result = input.map((entry, index) => {
    const itemLabel = `${label}[${index}]`;
    const value = requireRecord(entry, itemLabel);
    const skillLevel = requirePositiveInteger(value.skillLevel, `${itemLabel}.skillLevel`);
    if (seen.has(skillLevel)) throw new Error(`${label} contains duplicate skillLevel ${skillLevel}.`);
    seen.add(skillLevel);
    return { skillLevel, dynamicStatIds: normalizeDynamicStatIds(value.dynamicStatIds, `${itemLabel}.dynamicStatIds`) };
  }).sort((left, right) => left.skillLevel - right.skillLevel);
  for (let index = 0; index < rawLevels.length; index += 1) {
    if (result[index].skillLevel !== rawLevels[index].skillLevel
      || !sameArray(result[index].dynamicStatIds, rawLevels[index].dynamicStatIds)) {
      throw new Error(`${label} disagrees with rawLevels at skillLevel ${rawLevels[index].skillLevel}.`);
    }
  }
  return result;
}

function normalizeDynamicStatIds(input, label) {
  if (!Array.isArray(input) || input.length === 0) throw new Error(`${label} must be a non-empty array.`);
  return input.map((value, index) => {
    if (value === null) return null;
    return requireId(value, `${label}[${index}]`);
  });
}

function normalizeComponentSource(input, expectedBuild, table, rowId, label) {
  const value = requireRecord(input, label);
  assertMatchingBuild(value.gameBuild, expectedBuild, `${label}.gameBuild`);
  if (value.table !== table) throw new Error(`${label}.table does not match sourceTable.`);
  if (value.rowId !== rowId) throw new Error(`${label}.rowId does not match sourceRow.`);
  return {
    table: requireId(value.table, `${label}.table`),
    rowId: requireId(value.rowId, `${label}.rowId`),
    gameBuild: expectedBuild,
    sourcePath: requireText(value.sourcePath, `${label}.sourcePath`),
    sourceSha256: requireText(value.sourceSha256, `${label}.sourceSha256`),
    decoderVersion: requireText(value.decoderVersion, `${label}.decoderVersion`),
  };
}

function normalizeAbilitySource(input, expectedBuild) {
  const value = requireRecord(input, "source");
  assertMatchingBuild(value.gameBuild, expectedBuild, "source.gameBuild");
  return {
    gameBuild: expectedBuild,
    skillProjection: requireText(value.skillProjection, "source.skillProjection"),
    skillFormulaMapSchema: requireText(value.skillFormulaMapSchema, "source.skillFormulaMapSchema"),
  };
}

function normalizeUnresolvedStage(input, expectedBuild, index) {
  const label = `unresolvedStages[${index}]`;
  const value = requireRecord(input, label);
  assertMatchingBuild(value.gameBuild, expectedBuild, `${label}.gameBuild`);
  const precision = requireEnum(value.precision, PRECISIONS, `${label}.precision`);
  const provenance = requireEnum(value.provenance, PROVENANCES, `${label}.provenance`);
  if (precision !== FORMULA_COMPONENT_PRECISION.UNSUPPORTED || provenance !== FORMULA_COMPONENT_PROVENANCE.UNRESOLVED) {
    throw new Error(`${label} must use unsupported precision and unresolved provenance.`);
  }
  return {
    id: requireId(value.id, `${label}.id`),
    gameBuild: expectedBuild,
    stage: requireId(value.stage, `${label}.stage`),
    reason: requireText(value.reason, `${label}.reason`),
    classification: requireEnum(value.classification, UNRESOLVED_CLASSIFICATIONS, `${label}.classification`),
    precision,
    provenance,
    evidence: normalizeEvidence(value.evidence, expectedBuild, `${label}.evidence`),
  };
}

function normalizeEvidence(input, expectedBuild, label) {
  if (!Array.isArray(input) || input.length === 0) throw new Error(`${label} must contain at least one evidence reference.`);
  return input.map((entry, index) => {
    const itemLabel = `${label}[${index}]`;
    const value = requireRecord(entry, itemLabel);
    assertMatchingBuild(value.gameBuild, expectedBuild, `${itemLabel}.gameBuild`);
    return {
      kind: requireId(value.kind, `${itemLabel}.kind`),
      reference: requireText(value.reference, `${itemLabel}.reference`),
      gameBuild: expectedBuild,
    };
  });
}

function normalizeRawCoefficients(input, label) {
  const value = requireRecord(input, label);
  const entries = Object.entries(value);
  if (entries.length === 0) throw new Error(`${label} must not be empty.`);
  return Object.fromEntries(entries.map(([key, coefficient]) => [
    requireId(key, `${label} key`),
    normalizeRawCoefficientValue(coefficient, `${label}.${key}`),
  ]));
}

function normalizeRawCoefficientValue(value, label) {
  if (Array.isArray(value)) {
    if (value.length === 0) throw new Error(`${label} must not be an empty array.`);
    return value.map((entry, index) => normalizeRawCoefficientScalar(entry, `${label}[${index}]`));
  }
  return normalizeRawCoefficientScalar(value, label);
}

function assertCoefficientCoverage(coefficients, expectedCount, label) {
  for (const [key, values] of Object.entries(coefficients)) {
    if (!Array.isArray(values) || values.length !== expectedCount) {
      throw new Error(`${label}.${key} must contain one value for every skill level.`);
    }
  }
}

function normalizeNullableRawScalar(value, label) {
  if (value === null) return null;
  return normalizeRawCoefficientScalar(value, label);
}

function normalizeJsonArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  return value.map((entry, index) => normalizeJsonValue(entry, `${label}[${index}]`));
}

function normalizeJsonRecord(value, label) {
  requireRecord(value, label);
  return normalizeJsonValue(value, label);
}

function normalizeJsonValue(value, label) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must contain finite JSON values.`);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => normalizeJsonValue(entry, `${label}[${index}]`));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      requireId(key, `${label} key`), normalizeJsonValue(entry, `${label}.${key}`),
    ]));
  }
  throw new TypeError(`${label} contains a non-JSON value.`);
}

function normalizeRawCoefficientScalar(value, label) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer or decimal string.`);
    return String(value);
  }
  if (typeof value === "string" && RAW_NUMBER.test(value)) return value;
  throw new TypeError(`${label} must be an integer, bigint, or decimal string.`);
}

function normalizeUnits(input, coefficients, label) {
  const value = requireRecord(input, label);
  for (const key of Object.keys(coefficients)) {
    if (!(key in value)) throw new Error(`${label} is missing a unit for coefficient ${key}.`);
  }
  const entries = Object.entries(value);
  if (entries.length === 0) throw new Error(`${label} must not be empty.`);
  return Object.fromEntries(entries.map(([key, unit]) => [
    requireId(key, `${label} key`),
    requireId(unit, `${label}.${key}`),
  ]));
}

function normalizeLevelRange(input, label) {
  const value = requireRecord(input, label);
  const minimum = requirePositiveInteger(value.minimum, `${label}.minimum`);
  const maximum = requirePositiveInteger(value.maximum, `${label}.maximum`);
  if (minimum > maximum) throw new RangeError(`${label}.minimum must not exceed maximum.`);
  return { minimum, maximum };
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

function requireId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error(`${label} must be a safe identifier.`);
  return value;
}

function requireMatchingId(value, expected, label) {
  const result = requireId(value, label);
  if (result !== expected) throw new Error(`${label} must match id.`);
  return result;
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function requireBuild(value, label) {
  if (typeof value !== "string" || !SAFE_BUILD.test(value)) throw new Error(`${label} must be a safe build identifier.`);
  return value;
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be nonempty text.`);
  return value.trim();
}

function requireEnum(value, allowed, label) {
  if (!allowed.has(value)) throw new Error(`Unknown ${label}: ${String(value)}`);
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${label} must be a positive safe integer.`);
  return value;
}

function assertMatchingBuild(value, expected, label) {
  requireBuild(value, label);
  if (value !== expected) throw new Error(`${label} ${value} does not match ability gameBuild ${expected}.`);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
