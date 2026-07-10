const OUTPUT_SCHEMA = "tl-helper.combat-ability-data";
const OUTPUT_SCHEMA_VERSION = 1;
const FORMULA_TABLE = "TLFormulaParameterNew";

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message) {
  throw new Error(`Combat ability data: ${message}`);
}

function text(value, label) {
  const result = String(value ?? "").trim();
  if (!result) fail(`${label} is required`);
  return result;
}

function buildOf(value, label) {
  const build = value?.gameBuild ?? value?.build;
  if (build === undefined || build === null || String(build).trim() === "") {
    fail(`${label} has no game build`);
  }
  return String(build);
}

function assertBuild(value, requestedBuild, label) {
  const actual = buildOf(value, label);
  if (actual !== requestedBuild) {
    fail(`${label} build ${actual} does not match requested build ${requestedBuild}`);
  }
}

function sortedClone(value) {
  if (Array.isArray(value)) return value.map(sortedClone);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedClone(value[key])]));
}

function skillsFrom(projection) {
  const skills = Array.isArray(projection) ? projection : projection?.data?.skills ?? projection?.skills;
  if (!Array.isArray(skills)) fail("skills projection does not contain a skills array");
  return skills;
}

function mappingsFrom(skillFormulaMap) {
  const mappings = Array.isArray(skillFormulaMap)
    ? skillFormulaMap
    : skillFormulaMap?.skills ?? skillFormulaMap?.mappings;
  if (!Array.isArray(mappings)) fail("skill-formula map does not contain a skills array");
  return mappings;
}

function formulaRowsFrom(formulaTable) {
  if (formulaTable?.table !== FORMULA_TABLE) {
    fail(`formula table must be ${FORMULA_TABLE}`);
  }
  if (!formulaTable.rows || typeof formulaTable.rows !== "object" || Array.isArray(formulaTable.rows)) {
    fail("formula table does not contain decoded rows");
  }
  return formulaTable.rows;
}

function uniqueBy(items, keyOf, label) {
  const result = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (result.has(key)) fail(`duplicate ${label} ${key}`);
    result.set(key, item);
  }
  return result;
}

function normalizeSkillLevels(skill) {
  const levels = skill.levels ?? [];
  if (!Array.isArray(levels)) fail(`skill ${skill.id} levels must be an array`);
  uniqueBy(levels, (level) => Number(level.level), `skill level for ${skill.id}`);
  return [...levels]
    .sort((a, b) => Number(a.level) - Number(b.level))
    .map(sortedClone);
}

function levelRange(levels, label) {
  if (levels.length === 0) fail(`${label} has no levels`);
  const values = levels.map((level) => Number(level.level ?? level.skill_level));
  if (values.some((value) => !Number.isSafeInteger(value) || value < 1)) fail(`${label} has an invalid level`);
  return { minimum: Math.min(...values), maximum: Math.max(...values) };
}

function normalizeEvidence(evidence, requestedBuild, label) {
  if (!Array.isArray(evidence) || evidence.length === 0) fail(`${label} must provide evidence`);
  return evidence.map((entry, index) => ({
    kind: text(entry.kind, `${label} evidence ${index} kind`),
    reference: text(entry.reference, `${label} evidence ${index} reference`),
    gameBuild: requestedBuild,
  })).sort((a, b) => compareCodeUnits(a.kind, b.kind) || compareCodeUnits(a.reference, b.reference));
}

function normalizeUnresolvedStages(stages, requestedBuild, label) {
  if (!Array.isArray(stages)) fail(`${label} must explicitly provide unresolvedStages`);
  return stages.map((stage, index) => {
    if (!stage || typeof stage !== "object" || Array.isArray(stage)) {
      fail(`${label} unresolved stage ${index} must be an object`);
    }
    const id = text(stage.id ?? stage.stageId ?? stage.stage, `${label} unresolved stage ${index} id`);
    const stageName = text(stage.stage, `${label} unresolved stage ${id} stage`);
    const reason = text(stage.reason, `${label} unresolved stage ${id} reason`);
    return {
      id,
      gameBuild: requestedBuild,
      stage: stageName,
      reason,
      classification: text(stage.classification, `${label} unresolved stage ${id} classification`),
      precision: "unsupported",
      provenance: "unresolved",
      evidence: normalizeEvidence(stage.evidence, requestedBuild, `${label} unresolved stage ${id}`),
    };
  }).sort((a, b) => compareCodeUnits(a.id, b.id) || compareCodeUnits(a.reason, b.reason));
}

function normalizeFormulaLevels(levels, formulaRowId) {
  if (!Array.isArray(levels) || levels.length === 0) fail(`formula row ${formulaRowId} has no levels`);
  uniqueBy(levels, (level) => Number(level.skill_level), `formula level for ${formulaRowId}`);
  return [...levels].sort((a, b) => Number(a.skill_level) - Number(b.skill_level)).map((level) => {
    const skillLevel = Number(level.skill_level);
    if (!Number.isInteger(skillLevel) || skillLevel < 1) {
      fail(`formula row ${formulaRowId} has invalid skill level ${level.skill_level}`);
    }
    return {
      skillLevel,
      formulaType: level.formula_type ?? null,
      min: decimalStringOrNull(level.min, `${formulaRowId} level ${skillLevel} min`),
      max: decimalStringOrNull(level.max, `${formulaRowId} level ${skillLevel} max`),
      add: decimalStringOrNull(level.add, `${formulaRowId} level ${skillLevel} add`),
      mul: decimalStringOrNull(level.mul, `${formulaRowId} level ${skillLevel} mul`),
      mul2: decimalStringOrNull(level.mul2, `${formulaRowId} level ${skillLevel} mul2`),
      mul3: decimalStringOrNull(level.mul3, `${formulaRowId} level ${skillLevel} mul3`),
      dynamicStatIds: [1, 2, 3, 4, 5, 6].map((number) => level[`dynamic_stat_id${number}`] ?? null),
      tooltip1: decimalStringOrNull(level.tooltip1, `${formulaRowId} level ${skillLevel} tooltip1`),
      tooltip2: decimalStringOrNull(level.tooltip2, `${formulaRowId} level ${skillLevel} tooltip2`),
      raw: sortedClone(level),
    };
  });
}

function decimalStringOrNull(value, label) {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return value;
  fail(`${label} has invalid decimal value ${String(value)}`);
}

function contractCoefficients(levels) {
  const keys = ["min", "max", "add", "mul", "mul2", "mul3", "tooltip1", "tooltip2"];
  return Object.fromEntries(keys.map((key) => [key, levels.map((level) => {
    const value = level[key];
    if (typeof value === "string") return value;
    fail(`formula coefficient ${key} has invalid value ${String(value)}`);
  })]));
}

function normalizeUnits(units, coefficientKeys, label) {
  if (!units || typeof units !== "object" || Array.isArray(units)) fail(`${label} must provide units`);
  return Object.fromEntries(coefficientKeys.map((key) => [key, text(units[key], `${label} unit ${key}`)]));
}

function componentList(review) {
  const components = review.components ?? review.reviewedFormulaRows;
  if (!Array.isArray(components) || components.length === 0) {
    fail(`ability ${review.abilityId ?? "<unknown>"} has no reviewed formula components`);
  }
  return components;
}

function makeComponent({ component, mapping, decodedRows, formulaTable, requestedBuild, abilityId }) {
  const formulaRowId = text(component.formulaRowId, `ability ${abilityId} formulaRowId`);
  const mapped = mapping.formulaRows?.find((row) => row.formulaRowId === formulaRowId);
  if (!mapped) fail(`reviewed row ${formulaRowId} is not mapped to ability ${abilityId}`);
  const decoded = decodedRows[formulaRowId];
  if (!decoded) fail(`reviewed row ${formulaRowId} is missing from decoded formula data`);

  const componentId = text(component.id ?? component.componentId ?? formulaRowId, `ability ${abilityId} componentId`);
  const role = text(component.role, `ability ${abilityId} component ${componentId} role`);
  const mappingClass = mapped.mappingClass ?? mapping.classification ?? null;
  if (!mappingClass) fail(`reviewed row ${formulaRowId} has no mapping class`);

  const levels = normalizeFormulaLevels(decoded.FormulaParameter, formulaRowId);
  const formulaTypes = [...new Set(levels.map((level) => level.formulaType))];
  if (formulaTypes.length !== 1 || !formulaTypes[0]) {
    fail(`formula row ${formulaRowId} does not have one stable formula type`);
  }
  const rawCoefficients = contractCoefficients(levels);

  return {
    id: componentId,
    gameBuild: requestedBuild,
    skillLevelRange: levelRange(decoded.FormulaParameter, `formula row ${formulaRowId}`),
    sourceTable: FORMULA_TABLE,
    sourceRow: formulaRowId,
    formulaType: formulaTypes[0],
    rawCoefficients,
    units: normalizeUnits(component.units, Object.keys(rawCoefficients), `ability ${abilityId} component ${componentId}`),
    precision: text(component.precision, `ability ${abilityId} component ${componentId} precision`),
    provenance: text(component.provenance, `ability ${abilityId} component ${componentId} provenance`),
    evidence: normalizeEvidence(component.evidence, requestedBuild, `ability ${abilityId} component ${componentId}`),
    // The contract intentionally keeps execution fields narrow. These ingestion
    // fields retain the decoded evidence needed to review or rebuild it.
    role,
    effectKind: component.effectKind ?? null,
    mappingClass,
    mappingEvidence: sortedClone(mapped.evidence ?? []),
    rawLevels: levels,
    dynamicStatIdsByLevel: levels.map((level) => ({
      skillLevel: level.skillLevel,
      dynamicStatIds: level.dynamicStatIds,
    })),
    source: {
      table: FORMULA_TABLE,
      rowId: formulaRowId,
      gameBuild: requestedBuild,
      sourcePath: formulaTable.sourcePath ?? null,
      sourceSha256: formulaTable.sha256 ?? null,
      decoderVersion: formulaTable.decoderVersion ?? null,
    },
  };
}

/**
 * Builds reviewed, build-scoped ability bundles from already loaded data.
 * This function deliberately performs no filesystem access and no combat math.
 */
export function buildCombatAbilityData({
  skillsProjection,
  skillFormulaMap,
  formulaTable,
  requestedBuild,
  reviewedAbilities,
}) {
  const gameBuild = text(requestedBuild, "requestedBuild");
  assertBuild(skillsProjection, gameBuild, "skills projection");
  assertBuild(skillFormulaMap, gameBuild, "skill-formula map");
  assertBuild(formulaTable, gameBuild, "formula table");

  if (!Array.isArray(reviewedAbilities) || reviewedAbilities.length === 0) {
    fail("reviewedAbilities must be a non-empty array");
  }

  const skills = uniqueBy(skillsFrom(skillsProjection), (skill) => text(skill.id, "skill id"), "skill id");
  const mappings = uniqueBy(mappingsFrom(skillFormulaMap),
    (mapping) => text(mapping.skillSetId, "mapped skillSetId"), "mapped skillSetId");
  const decodedRows = formulaRowsFrom(formulaTable);
  uniqueBy(reviewedAbilities, (review) => text(review.abilityId, "abilityId"), "abilityId");

  const abilities = reviewedAbilities.map((review) => {
    const abilityId = text(review.abilityId, "abilityId");
    const skillSetId = text(review.skillSetId, `ability ${abilityId} skillSetId`);
    const skill = skills.get(skillSetId);
    if (!skill) fail(`reviewed ability ${abilityId} references missing skill ${skillSetId}`);
    const mapping = mappings.get(skillSetId);
    if (!mapping) fail(`reviewed ability ${abilityId} has no skill-formula mapping`);
    const skillType = skill.skillType ?? review.skillType;

    const componentDefinitions = componentList(review);
    uniqueBy(componentDefinitions,
      (component) => text(component.id ?? component.componentId ?? component.formulaRowId, `ability ${abilityId} componentId`),
      `componentId for ${abilityId}`);
    uniqueBy(componentDefinitions,
      (component) => text(component.formulaRowId, `ability ${abilityId} formulaRowId`),
      `reviewed formula row for ${abilityId}`);

    return {
      schema: "tl-helper.combat-ability-definition",
      schemaVersion: 1,
      gameBuild,
      id: abilityId,
      abilityId,
      skillSetId,
      name: text(skill.name ?? review.name, `ability ${abilityId} name`),
      weapon: text(skill.mainCategory ?? review.weapon, `ability ${abilityId} weapon`),
      ...(skillType === undefined || skillType === null
        ? {}
        : { skillType: text(skillType, `ability ${abilityId} skillType`) }),
      kind: text(review.kind ?? review.effectKind, `ability ${abilityId} kind`),
      skillLevelRange: levelRange(normalizeSkillLevels(skill), `skill ${skillSetId}`),
      formulaComponents: componentDefinitions.map((component) => makeComponent({
        component, mapping, decodedRows, formulaTable, requestedBuild: gameBuild, abilityId,
      })).sort((a, b) => compareCodeUnits(a.id, b.id) || compareCodeUnits(a.sourceRow, b.sourceRow)),
      unresolvedStages: normalizeUnresolvedStages(review.unresolvedStages, gameBuild, `ability ${abilityId}`),
      source: {
        gameBuild,
        skillProjection: skillsProjection.projection ?? "skills",
        skillFormulaMapSchema: text(skillFormulaMap.schema, "skill-formula map schema"),
      },
    };
  }).sort((a, b) => compareCodeUnits(a.abilityId, b.abilityId));

  return {
    schema: OUTPUT_SCHEMA,
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    gameBuild,
    abilities,
  };
}

export const COMBAT_ABILITY_DATA_SCHEMA = OUTPUT_SCHEMA;
export const COMBAT_ABILITY_DATA_SCHEMA_VERSION = OUTPUT_SCHEMA_VERSION;
