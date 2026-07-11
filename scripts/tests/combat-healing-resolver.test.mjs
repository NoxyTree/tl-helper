import assert from "node:assert/strict";
import test from "node:test";
import {
  HEALING_CAST_COMPONENT,
  HEALING_ROLL_OUTCOME,
  ROUNDING,
  resolveHealingRange,
} from "../../packages/combat-engine/src/index.mjs";

function swiftHealingAbility() {
  const gameBuild = "24118850";
  const components = [
    component({ id: "first-heal", role: "first-cast-magnitude", mul: "29000", add: "980" }),
    component({ id: "second-heal", role: "second-cast-magnitude", mul: "20300", add: "686" }),
  ];
  return {
    schema: "tl-helper.combat-ability-definition",
    schemaVersion: 1,
    gameBuild,
    id: "swift-healing",
    name: "Swift Healing",
    weapon: "wand",
    kind: "healing",
    skillLevelRange: { minimum: 14, maximum: 14 },
    formulaComponents: components,
    unresolvedStages: [],
  };

  function component({ id, role, mul, add }) {
    const dynamicStatIds = ["HealEffect", "None", "None", "None", "None", "None"];
    const sourceRow = id === "first-heal" ? "WA_Heal_Heal" : "WA_Heal_Heal_Double";
    return {
      id,
      gameBuild,
      skillLevelRange: { minimum: 14, maximum: 14 },
      sourceTable: "TLFormulaParameterNew",
      sourceRow,
      formulaType: "EFormulaType::kAmountFromAttackPower",
      rawCoefficients: { mul: [mul], add: [add] },
      units: { mul: "basis_points", add: "flat_healing" },
      precision: "derived_high_confidence",
      provenance: "derived",
      evidence: [{ kind: "decoded_row", reference: `TLFormulaParameterNew:${id}`, gameBuild }],
      role,
      effectKind: "healing",
      mappingClass: "derived",
      mappingEvidence: [],
      rawLevels: [{
        skillLevel: 14,
        formulaType: "EFormulaType::kAmountFromAttackPower",
        mul,
        add,
        dynamicStatIds,
        raw: {},
      }],
      dynamicStatIdsByLevel: [{ skillLevel: 14, dynamicStatIds }],
      source: {
        table: "TLFormulaParameterNew",
        rowId: sourceRow,
        gameBuild,
        sourcePath: "D:/TL_Extracted/TLFormulaParameterNew.uasset",
        sourceSha256: "fixture",
        decoderVersion: "test",
      },
    };
  }
}

function request(overrides = {}) {
  return {
    abilityDefinition: swiftHealingAbility(),
    skillLevel: 14,
    castComponent: HEALING_CAST_COMPONENT.FIRST,
    baseDamageMinimum: "100",
    baseDamageMaximum: "200",
    rollOutcome: HEALING_ROLL_OUTCOME.NORMAL,
    outgoingHealingPercent: "10",
    healingReceivedPercent: "20",
    skillDamageBoost: "0",
    heavyAttack: false,
    rounding: ROUNDING.TRUNCATE,
    allowModeledHealing: true,
    ...overrides,
  };
}

test("modeled healing resolves reviewed coefficient endpoints through explicit modifier stages", () => {
  const result = resolveHealingRange(request());
  assert.equal(result.status, "modeled");
  assert.deepEqual(result.baseDamageSelection, {
    minimum: "100",
    maximum: "200",
    semantic: "modeled_normal_interval_endpoints",
    precision: "modeled",
    provenance: "caller_provided_modeled_interval",
  });
  assert.deepEqual(result.modeledRange.perApplication, { minimum: "1676", maximum: "2059" });
  assert.deepEqual(result.modeledRange.totalApplied, { minimum: "1676", maximum: "2059" });
  assert.deepEqual(
    result.traces.minimum.stageOutputs.map(({ id }) => id),
    ["reviewed-coefficient", "outgoing-healing", "healing-received", "skill-damage-boost", "display-rounding", "heal-applications"],
  );
  assert.deepEqual(
    result.traces.minimum.coefficientProjection.trace.stages.map(({ operation }) => operation),
    ["multiply", "divide", "add"],
  );
  assert.equal(result.traces.minimum.arithmetic.rounding, "truncate");
  assert.equal(result.traces.minimum.trace.stages.at(-2).operation, "round_to_display_integer");
  assert.equal(result.traces.minimum.trace.stages.at(-1).operation, "apply_heal_applications");
  assert.equal(result.precision.coefficientBasis, "verified_exact");
  assert.equal(result.precision.outgoingHealing, "modeled");
  assert.equal(result.precision.healingReceived, "calibrated_support");
  assert.equal(result.precision.skillDamageBoost, "modeled");
  assert.equal(result.precision.overall, "modeled");
  assert.equal(result.completeness.isExactLivePrediction, false);
  assert.equal(result.completeness.isFinalHealingOutcome, false);
  assert.ok(Object.isFrozen(result));
});

test("cast component selects the separate reviewed second-cast coefficient row", () => {
  const result = resolveHealingRange(request({ castComponent: HEALING_CAST_COMPONENT.SECOND }));
  assert.equal(result.componentId, "second-heal");
  assert.deepEqual(result.coefficientExpression.coefficients, { mul: "20300", add: "686" });
  assert.deepEqual(result.modeledRange.perApplication, { minimum: "1173", maximum: "1441" });
  assert.equal(result.traces.minimum.coefficientProjection.sourceProvenance.coefficientProvenance, "derived");
});

test("modeled critical selects maximum Base Damage while verified Heavy creates two applications", () => {
  const result = resolveHealingRange(request({
    rollOutcome: HEALING_ROLL_OUTCOME.CRITICAL,
    heavyAttack: true,
  }));
  assert.equal(result.baseDamageSelection.minimum, "200");
  assert.equal(result.baseDamageSelection.maximum, "200");
  assert.deepEqual(result.modeledRange.perApplication, { minimum: "2059", maximum: "2059" });
  assert.deepEqual(result.modeledRange.totalApplied, { minimum: "4118", maximum: "4118" });
  assert.equal(result.applications.count, 2);
  assert.equal(result.applications.precision, "verified_exact");
  assert.equal(result.applications.provenance, "live_video_verified");
  assert.equal(result.baseDamageSelection.provenance, "derived_community_reference");
  assert.equal(result.traces.minimum, result.traces.maximum);
});

test("Skill Damage Boost healing bonus remains an opt-in community-modeled stage", () => {
  const result = resolveHealingRange(request({
    outgoingHealingPercent: "0",
    healingReceivedPercent: "0",
    skillDamageBoost: "3000",
    baseDamageMaximum: "100",
  }));
  assert.deepEqual(result.modeledRange.perApplication, { minimum: "1905", maximum: "1905" });
  const stage = result.traces.minimum.stageOutputs.find(({ id }) => id === "skill-damage-boost");
  assert.equal(stage.factor, "1.5");
  assert.equal(stage.provenance, "derived_community_reference");
  assert.match(result.warnings.join(" "), /community-reference/);
});

test("modeled execution requires opt-in and never invents missing modifier inputs", () => {
  const noOptIn = resolveHealingRange(request({ allowModeledHealing: false }));
  assert.equal(noOptIn.status, "unsupported");
  assert.equal(noOptIn.optInAccepted, false);
  assert.equal("modeledRange" in noOptIn, false);

  const missing = resolveHealingRange(request({ outgoingHealingPercent: undefined }));
  assert.equal(missing.status, "unsupported");
  assert.deepEqual(missing.missingInputs, ["outgoingHealingPercent"]);
  assert.equal(missing.optInAccepted, true);
  assert.match(missing.warnings.join(" "), /No numeric healing range was produced/);
});

test("invalid modeled values and non-healing component boundaries are refused", () => {
  assert.throws(() => resolveHealingRange(request({ baseDamageMinimum: "201" })), /cannot exceed/);
  assert.throws(() => resolveHealingRange(request({ healingReceivedPercent: "-1" })), /cannot be negative/);
  assert.throws(() => resolveHealingRange(request({ heavyAttack: "yes" })), /explicit boolean/);
  assert.throws(() => resolveHealingRange(request({ rollOutcome: "lucky" })), /Unsupported healing roll outcome/);
  assert.throws(() => resolveHealingRange(request({ castComponent: "third" })), /Unsupported healing cast component/);
});

test("clean live batches remain calibration fixtures, not exact-final acceptance cases", () => {
  const baseline = resolveHealingRange(request({
    baseDamageMinimum: "311",
    baseDamageMaximum: "713",
    outgoingHealingPercent: "15",
    healingReceivedPercent: "4.2",
    skillDamageBoost: "459.2",
  }));
  const highReceived = resolveHealingRange(request({
    baseDamageMinimum: "311",
    baseDamageMaximum: "713",
    outgoingHealingPercent: "15",
    healingReceivedPercent: "20.85",
    skillDamageBoost: "459.2",
  }));
  const baselineFirst = [2421, 2776, 2081, 1829, 1829, 2776, 2960, 2543];
  const highReceivedFirst = [1949, 3220, 2253, 2693, 2536, 2918];
  const outside = (values, range) => values.filter((value) => (
    value < Number(range.minimum) || value > Number(range.maximum)
  ));

  assert.ok(outside(baselineFirst, baseline.modeledRange.perApplication).length > 0);
  assert.ok(outside(highReceivedFirst, highReceived.modeledRange.perApplication).length > 0);
  assert.equal(baseline.completeness.isExactLivePrediction, false);
  assert.equal(highReceived.completeness.isExactLivePrediction, false);
  assert.match(baseline.warnings[0], /not an exact or final/);
  assert.deepEqual(
    baseline.provenance.stages.map(({ provenance }) => provenance),
    ["derived", "caller_provided_modeled_interval", "modeled_from_extracted_hook", "calibrated_support", "derived_community_reference", "caller_selected_normal_application"],
  );
});
