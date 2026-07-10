import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectAbilityMagnitude,
  projectAbilityMagnitude,
} from "../../packages/combat-engine/src/ability-magnitude.mjs";

function ability({
  id = "gaia-crash",
  name = "Gaia Crash",
  kind = "damage",
  effectKind = kind,
  formulaType = "EFormulaType::kAmountFromAttackPower",
  mul = ["25500", "26000"],
  add = ["37", "40"],
  dynamicStatIds = ["None", "None", "None", "None", "None", "None"],
} = {}) {
  const gameBuild = "24118850";
  const componentId = "primary-magnitude";
  const levels = mul.map((levelMul, index) => ({
    skillLevel: index + 1,
    formulaType,
    mul: levelMul,
    add: add[index],
    dynamicStatIds,
    raw: { skill_level: index + 1, formula_type: formulaType, mul: Number(levelMul), add: Number(add[index]) },
  }));
  return {
    schema: "tl-helper.combat-ability-definition",
    schemaVersion: 1,
    gameBuild,
    id,
    name,
    weapon: "test-weapon",
    kind,
    skillLevelRange: { minimum: 1, maximum: mul.length },
    formulaComponents: [{
      id: componentId,
      gameBuild,
      skillLevelRange: { minimum: 1, maximum: mul.length },
      sourceTable: "TLFormulaParameterNew",
      sourceRow: `${id}_row`,
      formulaType,
      rawCoefficients: { mul, add },
      units: { mul: "basis_points", add: `flat_${effectKind}` },
      precision: "verified_exact",
      provenance: "extracted",
      evidence: [{ kind: "decoded_row", reference: `TLFormulaParameterNew:${id}_row`, gameBuild }],
      role: "magnitude",
      effectKind,
      mappingClass: "exact",
      mappingEvidence: [{ field: "tooltip1" }],
      rawLevels: levels,
      dynamicStatIdsByLevel: levels.map(({ skillLevel, dynamicStatIds: ids }) => ({ skillLevel, dynamicStatIds: ids })),
      source: {
        table: "TLFormulaParameterNew",
        rowId: `${id}_row`,
        gameBuild,
        sourcePath: `D:/TL_Extracted/${id}.uasset`,
        sourceSha256: "abc123",
        decoderVersion: "0.1.0",
      },
    }],
    unresolvedStages: [{
      id: "live-pipeline",
      gameBuild,
      stage: "live-pipeline",
      reason: "The live pipeline is not established.",
      classification: "currently_unknown",
      precision: "unsupported",
      provenance: "unresolved",
      evidence: [{ kind: "audit", reference: "unknown-formulas.md", gameBuild }],
    }],
  };
}

function project(definition, baseDamage, overrides = {}) {
  return projectAbilityMagnitude({
    abilityDefinition: definition,
    componentId: "primary-magnitude",
    skillLevel: 1,
    baseDamage,
    allowUncalibratedProjection: true,
    ...overrides,
  });
}

test("inspection is expression-only by default and makes final-outcome incompleteness explicit", () => {
  const result = inspectAbilityMagnitude({
    abilityDefinition: ability(), componentId: "primary-magnitude", skillLevel: 1,
  });
  assert.equal(result.expression.notation, "baseDamage * mul / 10000 + add");
  assert.deepEqual(result.expression.coefficients, { mul: "25500", add: "37" });
  assert.equal(result.semantic, "tooltip_coefficient_projection");
  assert.equal(result.precision.coefficient, "verified_exact");
  assert.equal(result.precision.coefficientBasis, "verified_exact");
  assert.equal(result.precision.arithmeticProjection, "not_executed");
  assert.equal(result.precision.overall, "unsupported");
  assert.equal(result.completeness.isFinalCombatOutcome, false);
  assert.equal("magnitudeProjection" in result, false);
  assert.equal("damage" in result, false);
  assert.equal("final" in result, false);
  assert.ok(Object.isFrozen(result));
});

test("damage coefficient projection uses BigInt fixed point and records every arithmetic stage", () => {
  const result = project(ability(), "100");
  assert.equal(result.magnitudeKind, "damage");
  assert.deepEqual(result.magnitudeProjection, {
    semantic: "tooltip_coefficient_projection",
    stage: "pre_resolution",
    value: "292",
    scaledValue: "2920000",
    scale: "10000",
    rounding: "truncate",
  });
  assert.deepEqual(result.trace.stages.map(({ operation }) => operation), ["multiply", "divide", "add"]);
  assert.equal(result.trace.formula.sourceRow, "gaia-crash_row");
  assert.equal(result.trace.formula.coefficientProvenance, "extracted");
  assert.equal(result.completeness.mitigationApplied, false);
  assert.equal(result.precision.arithmeticProjection, "modeled");
  assert.equal(result.precision.liveOutcome, "unsupported");
  assert.equal(result.sourceProvenance.coefficientBasisPrecision, "verified_exact");
  assert.ok(!result.unresolvedStages.some(({ id }) => id === "projection.coefficient-basis"));
});

test("healing and shielding remain typed coefficient projections without outcome claims", () => {
  const healing = project(ability({
    id: "swift-healing", name: "Swift Healing", kind: "healing", mul: ["16500"], add: ["200"],
    dynamicStatIds: ["HealEffect", "None", "None", "None", "None", "None"],
  }), "20");
  assert.equal(healing.magnitudeKind, "healing");
  assert.equal(healing.magnitudeProjection.value, "233");
  assert.deepEqual(healing.dynamicStatHooks, ["HealEffect"]);
  assert.match(healing.unresolvedStages.find(({ id }) => id === "projection.dynamic-stat-modifiers").reason, /not executed/);
  assert.equal(healing.completeness.dynamicStatsApplied, false);
  assert.equal("healing" in healing, false);

  const shielding = project(ability({
    id: "distortion-veil", name: "Distortion Veil", kind: "shielding", effectKind: "shielding",
    mul: ["30000"], add: ["600"],
  }), "10");
  assert.equal(shielding.magnitudeKind, "shielding");
  assert.equal(shielding.magnitudeProjection.value, "630");
  assert.equal("shieldCapacity" in shielding, false);
});

test("fractional decimal inputs use explicit truncation and expose discarded remainder", () => {
  const result = project(ability({ mul: ["25500"], add: ["0"] }), "1.2345");
  assert.equal(result.magnitudeProjection.value, "3.1479");
  assert.equal(result.trace.stages[1].rounding, "truncate");
  assert.notEqual(result.trace.stages[1].discardedRemainder, "0");
});

test("numeric projection requires an explicit uncalibrated opt-in and valid Base Damage", () => {
  const definition = ability();
  const request = { abilityDefinition: definition, componentId: "primary-magnitude", skillLevel: 1, baseDamage: "100" };
  assert.throws(() => projectAbilityMagnitude(request), /allowUncalibratedProjection=true/);
  assert.throws(() => projectAbilityMagnitude({ ...request, allowUncalibratedProjection: false }), /allowUncalibratedProjection=true/);
  assert.throws(() => projectAbilityMagnitude({ ...request, allowUncalibratedProjection: true, baseDamage: undefined }), /requires baseDamage/);
  assert.throws(() => projectAbilityMagnitude({ ...request, allowUncalibratedProjection: true, baseDamage: "-1" }), /cannot be negative/);
});

test("unsupported formula types, components, and levels are refused", () => {
  assert.throws(() => inspectAbilityMagnitude({
    abilityDefinition: ability({ formulaType: "EFormulaType::kAmountFromMinMax" }),
    componentId: "primary-magnitude",
    skillLevel: 1,
  }), /Unsupported ability magnitude formula type/);
  assert.throws(() => inspectAbilityMagnitude({
    abilityDefinition: ability(), componentId: "missing", skillLevel: 1,
  }), /Unknown formula component/);
  assert.throws(() => inspectAbilityMagnitude({
    abilityDefinition: ability(), componentId: "primary-magnitude", skillLevel: 3,
  }), /no reviewed coefficients/);
});

test("dynamic-stat execution and final-outcome requests are rejected at the boundary", () => {
  const base = { abilityDefinition: ability(), componentId: "primary-magnitude", skillLevel: 1 };
  assert.throws(() => projectAbilityMagnitude({
    ...base, baseDamage: "100", allowUncalibratedProjection: true, dynamicStatValues: { HealEffect: "1.2" },
  }), /Dynamic-stat execution and final-outcome claims are not supported/);
  assert.throws(() => projectAbilityMagnitude({
    ...base, baseDamage: "100", allowUncalibratedProjection: true, resolveFinalDamage: true,
  }), /Dynamic-stat execution and final-outcome claims are not supported/);
  assert.throws(() => inspectAbilityMagnitude({ ...base, baseDamage: "100" }), /Unsupported ability magnitude request field/);
});
