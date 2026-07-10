import assert from "node:assert/strict";
import test from "node:test";
import {
  ABILITY_RARITY_TIER,
  FORCED_ABILITY_OUTCOME,
  describeForcedAbilityOutcome,
  projectAbilityMagnitudeRange,
  resolveAbilitySkillLevel,
} from "../../packages/combat-engine/src/ability-range-projection.mjs";

function ability() {
  const gameBuild = "24118850";
  const rawLevels = Array.from({ length: 20 }, (_, index) => ({
    skillLevel: index + 1,
    formulaType: "EFormulaType::kAmountFromAttackPower",
    mul: String(20_000 + index * 1_000),
    add: String(index),
    dynamicStatIds: ["None", "None", "None", "None", "None", "None"],
    raw: {},
  }));
  return {
    schema: "tl-helper.combat-ability-definition",
    schemaVersion: 1,
    gameBuild,
    id: "range-test",
    name: "Range Test",
    weapon: "test",
    kind: "healing",
    skillLevelRange: { minimum: 1, maximum: 20 },
    formulaComponents: [{
      id: "magnitude",
      gameBuild,
      skillLevelRange: { minimum: 1, maximum: 20 },
      sourceTable: "TLFormulaParameterNew",
      sourceRow: "Range_Test",
      formulaType: "EFormulaType::kAmountFromAttackPower",
      rawCoefficients: { mul: rawLevels.map(({ mul }) => mul), add: rawLevels.map(({ add }) => add) },
      units: { mul: "basis_points", add: "flat_healing" },
      precision: "verified_exact",
      provenance: "extracted",
      evidence: [{ kind: "decoded_row", reference: "TLFormulaParameterNew:Range_Test", gameBuild }],
      role: "magnitude",
      effectKind: "healing",
      mappingClass: "exact",
      mappingEvidence: [],
      rawLevels,
      dynamicStatIdsByLevel: rawLevels.map(({ skillLevel, dynamicStatIds }) => ({ skillLevel, dynamicStatIds })),
      source: {
        table: "TLFormulaParameterNew", rowId: "Range_Test", gameBuild,
        sourcePath: "D:/TL_Extracted/range-test.uasset", sourceSha256: "abc", decoderVersion: "test",
      },
    }],
    unresolvedStages: [],
  };
}

test("observed Epic and Heroic rarity windows map to global levels", () => {
  const epic = resolveAbilitySkillLevel({ rarityTier: ABILITY_RARITY_TIER.EPIC, displayedLevel: 4 });
  assert.equal(epic.globalSkillLevel, 14);
  assert.equal(epic.offset, 10);
  assert.equal(epic.precision, "derived_high_confidence");
  assert.match(epic.evidence[0].reference, /calibration-findings/);

  const heroic = resolveAbilitySkillLevel({ rarityTier: ABILITY_RARITY_TIER.HEROIC, displayedLevel: 2 });
  assert.equal(heroic.globalSkillLevel, 17);
  assert.equal(heroic.offset, 15);
  assert.ok(Object.isFrozen(heroic));
});

test("global levels remain direct while unobserved rarity tiers are refused", () => {
  const global = resolveAbilitySkillLevel({ rarityTier: ABILITY_RARITY_TIER.GLOBAL, displayedLevel: 20 });
  assert.equal(global.globalSkillLevel, 20);
  assert.equal(global.precision, "direct");
  assert.deepEqual(global.evidence, []);
  assert.throws(() => resolveAbilitySkillLevel({ rarityTier: "rare", displayedLevel: 5 }), /uncalibrated/);
  assert.throws(() => resolveAbilitySkillLevel({ rarityTier: "epic", displayedLevel: 6 }), /between 1 and 5/);
});

test("range projection evaluates both Base Damage endpoints and preserves their traces", () => {
  const level = resolveAbilitySkillLevel({ rarityTier: "epic", displayedLevel: 1 });
  const result = projectAbilityMagnitudeRange({
    abilityDefinition: ability(),
    componentId: "magnitude",
    skillLevel: level.globalSkillLevel,
    baseDamageMinimum: "100",
    baseDamageMaximum: "200",
    forcedOutcome: FORCED_ABILITY_OUTCOME.COEFFICIENT_ONLY,
    allowUncalibratedProjection: true,
  });
  assert.deepEqual(result.baseDamageRange, { minimum: "100", maximum: "200" });
  assert.deepEqual(result.preResolutionRange, {
    minimum: "310",
    maximum: "610",
    stage: "pre_resolution",
    semantic: "tooltip_coefficient_projection",
  });
  assert.deepEqual(result.projections.minimum.trace.stages.map(({ operation }) => operation), ["multiply", "divide", "add"]);
  assert.deepEqual(result.projections.maximum.trace.stages.map(({ operation }) => operation), ["multiply", "divide", "add"]);
  assert.equal(result.precision.coefficient, "verified_exact");
  assert.equal(result.precision.coefficientBasis, "verified_exact");
  assert.equal(result.precision.arithmeticProjection, "modeled");
  assert.equal(result.precision.liveOutcome, "unsupported");
  assert.equal(result.completeness.isFinalCombatOutcome, false);
  assert.ok(Object.isFrozen(result));
});

test("forced live outcomes remain non-executable and never alter the range", () => {
  const request = {
    abilityDefinition: ability(), componentId: "magnitude", skillLevel: 11,
    baseDamageMinimum: "100", baseDamageMaximum: "200",
    allowUncalibratedProjection: true,
  };
  const baseline = projectAbilityMagnitudeRange({ ...request, forcedOutcome: "coefficient_only" });
  for (const outcome of ["normal", "critical", "heavy_attack", "blocked", "missed"]) {
    const result = projectAbilityMagnitudeRange({ ...request, forcedOutcome: outcome });
    assert.deepEqual(result.preResolutionRange, baseline.preResolutionRange);
    assert.deepEqual(result.forcedOutcome, describeForcedAbilityOutcome(outcome));
    assert.equal(result.forcedOutcome.status, outcome === "heavy_attack"
      ? "partially_verified_not_executed"
      : "unsupported");
    assert.equal(result.forcedOutcome.executable, false);
    assert.equal(result.forcedOutcome.applied, false);
  }
  assert.match(describeForcedAbilityOutcome("heavy_attack").reason, /two heal applications/);
});

test("invalid ranges and attempts to smuggle final resolution are rejected", () => {
  const request = {
    abilityDefinition: ability(), componentId: "magnitude", skillLevel: 11,
    baseDamageMinimum: "200", baseDamageMaximum: "100",
    allowUncalibratedProjection: true,
  };
  assert.throws(() => projectAbilityMagnitudeRange(request), /cannot exceed/);
  assert.throws(() => projectAbilityMagnitudeRange({ ...request, baseDamageMinimum: "-1" }), /cannot be negative/);
  assert.throws(() => projectAbilityMagnitudeRange({ ...request, baseDamageMinimum: "100", resolveHeavyAttack: true }), /Final-outcome execution/);
  assert.throws(() => projectAbilityMagnitudeRange({ ...request, baseDamageMinimum: "100", forcedOutcome: "double" }), /Unsupported forced/);
});
