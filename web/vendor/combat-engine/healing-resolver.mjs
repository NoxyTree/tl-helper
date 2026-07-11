import { inspectAbilityMagnitude, projectAbilityMagnitude } from "./ability-magnitude.mjs";
import { divideRounded, FixedPointContext, ROUNDING } from "./fixed-point.mjs";
import { CalculationTrace } from "./trace.mjs";

export const HEALING_CAST_COMPONENT = Object.freeze({
  FIRST: "first",
  SECOND: "second",
});

export const HEALING_ROLL_OUTCOME = Object.freeze({
  NORMAL: "normal",
  CRITICAL: "critical",
});

const COMPONENT_IDS = Object.freeze({
  [HEALING_CAST_COMPONENT.FIRST]: "first-heal",
  [HEALING_CAST_COMPONENT.SECOND]: "second-heal",
});
const CAST_COMPONENTS = new Set(Object.values(HEALING_CAST_COMPONENT));
const ROLL_OUTCOMES = new Set(Object.values(HEALING_ROLL_OUTCOME));
const REQUEST_KEYS = new Set([
  "abilityDefinition",
  "skillLevel",
  "castComponent",
  "baseDamageMinimum",
  "baseDamageMaximum",
  "rollOutcome",
  "outgoingHealingPercent",
  "healingReceivedPercent",
  "skillDamageBoost",
  "heavyAttack",
  "rounding",
  "allowModeledHealing",
]);
const MODELED_INPUTS = Object.freeze([
  "baseDamageMinimum",
  "baseDamageMaximum",
  "rollOutcome",
  "outgoingHealingPercent",
  "healingReceivedPercent",
  "skillDamageBoost",
  "heavyAttack",
  "rounding",
]);
const FIXED_SCALE = 1_000_000n;
const COEFFICIENT_BASIS = "10000";
const PERCENT_DENOMINATOR = "100";
const SKILL_DAMAGE_BOOST_DENOMINATOR = "3000";

/**
 * Resolve a strictly modeled Swift Healing interval from reviewed coefficients.
 * This is a calibration aid, not an exact or final live-healing prediction.
 */
export function resolveHealingRange(request) {
  assertRequest(request);
  const componentId = selectComponentId(request.castComponent);
  const inspection = inspectAbilityMagnitude({
    abilityDefinition: request.abilityDefinition,
    componentId,
    skillLevel: request.skillLevel,
  });
  assertHealingInspection(inspection);

  const missingInputs = MODELED_INPUTS.filter((key) => request[key] === undefined);
  if (request.allowModeledHealing !== true || missingInputs.length > 0) {
    return unsupportedResult({
      inspection,
      castComponent: request.castComponent,
      componentId,
      missingInputs,
      optInAccepted: request.allowModeledHealing === true,
    });
  }

  if (!ROLL_OUTCOMES.has(request.rollOutcome)) {
    throw new RangeError(`Unsupported healing roll outcome: ${request.rollOutcome}.`);
  }
  if (typeof request.heavyAttack !== "boolean") {
    throw new TypeError("heavyAttack must be an explicit boolean.");
  }

  const fixed = new FixedPointContext({ scale: FIXED_SCALE, rounding: request.rounding });
  const baseDamageMinimum = nonNegative(fixed, request.baseDamageMinimum, "baseDamageMinimum");
  const baseDamageMaximum = nonNegative(fixed, request.baseDamageMaximum, "baseDamageMaximum");
  if (baseDamageMinimum > baseDamageMaximum) {
    throw new RangeError("baseDamageMinimum cannot exceed baseDamageMaximum.");
  }
  const outgoingHealingPercent = nonNegative(fixed, request.outgoingHealingPercent, "outgoingHealingPercent");
  const healingReceivedPercent = nonNegative(fixed, request.healingReceivedPercent, "healingReceivedPercent");
  const skillDamageBoost = nonNegative(fixed, request.skillDamageBoost, "skillDamageBoost");

  const selectedMinimum = request.rollOutcome === HEALING_ROLL_OUTCOME.CRITICAL
    ? baseDamageMaximum
    : baseDamageMinimum;
  const selectedMaximum = baseDamageMaximum;
  const selectedMinimumText = fixed.format(selectedMinimum);
  const selectedMaximumText = fixed.format(selectedMaximum);
  const applicationCount = request.heavyAttack ? 2 : 1;
  const shared = {
    abilityDefinition: request.abilityDefinition,
    componentId,
    skillLevel: request.skillLevel,
    allowUncalibratedProjection: true,
    rounding: request.rounding,
  };
  const coefficientMinimum = projectAbilityMagnitude({ ...shared, baseDamage: selectedMinimumText });
  const coefficientMaximum = selectedMinimum === selectedMaximum
    ? coefficientMinimum
    : projectAbilityMagnitude({ ...shared, baseDamage: selectedMaximumText });
  const modelInputs = {
    outgoingHealingPercent,
    healingReceivedPercent,
    skillDamageBoost,
    applicationCount,
  };
  const minimum = resolveEndpoint({
    fixed,
    coefficientProjection: coefficientMinimum,
    modelInputs,
    rounding: request.rounding,
    endpoint: "minimum",
  });
  const maximum = selectedMinimum === selectedMaximum
    ? minimum
    : resolveEndpoint({
      fixed,
      coefficientProjection: coefficientMaximum,
      modelInputs,
      rounding: request.rounding,
      endpoint: "maximum",
    });

  const stages = provenanceStages({
    inspection,
    rollOutcome: request.rollOutcome,
    heavyAttack: request.heavyAttack,
  });
  return deepFreeze({
    schema: "tl-helper.modeled-healing-resolution",
    schemaVersion: 1,
    status: "modeled",
    abilityId: inspection.abilityId,
    abilityName: inspection.abilityName,
    gameBuild: inspection.gameBuild,
    castComponent: request.castComponent,
    componentId,
    skillLevel: inspection.skillLevel,
    rollOutcome: request.rollOutcome,
    baseDamageInputRange: {
      minimum: fixed.format(baseDamageMinimum),
      maximum: fixed.format(baseDamageMaximum),
      provenance: "caller_provided",
    },
    baseDamageSelection: {
      minimum: selectedMinimumText,
      maximum: selectedMaximumText,
      semantic: request.rollOutcome === HEALING_ROLL_OUTCOME.CRITICAL
        ? "modeled_critical_selects_maximum_base_damage"
        : "modeled_normal_interval_endpoints",
      precision: "modeled",
      provenance: request.rollOutcome === HEALING_ROLL_OUTCOME.CRITICAL
        ? "derived_community_reference"
        : "caller_provided_modeled_interval",
    },
    inputs: {
      outgoingHealingPercent: fixed.format(outgoingHealingPercent),
      healingReceivedPercent: fixed.format(healingReceivedPercent),
      skillDamageBoost: fixed.format(skillDamageBoost),
      rounding: request.rounding,
    },
    coefficientExpression: inspection.expression,
    modeledRange: {
      perApplication: {
        minimum: minimum.perApplicationValue,
        maximum: maximum.perApplicationValue,
      },
      totalApplied: {
        minimum: minimum.totalAppliedValue,
        maximum: maximum.totalAppliedValue,
      },
      semantic: "modeled_pre_overheal_healing_interval",
    },
    applications: {
      count: applicationCount,
      heavyAttack: request.heavyAttack,
      precision: request.heavyAttack ? "verified_exact" : "direct",
      provenance: request.heavyAttack ? "live_video_verified" : "caller_selected_normal_application",
      evidence: request.heavyAttack ? [{
        kind: "manual_video_calibration",
        reference: "plans/combat-simulator/calibration-findings-2026-07-10.md#finding-3",
      }] : [],
    },
    precision: {
      coefficient: inspection.precision.coefficient,
      coefficientBasis: inspection.precision.coefficientBasis,
      ownerMapping: inspection.precision.ownerMapping,
      baseDamageSelection: "modeled",
      outgoingHealing: "modeled",
      healingReceived: "calibrated_support",
      skillDamageBoost: "modeled",
      heavyAttackApplications: request.heavyAttack ? "verified_exact" : "direct",
      rounding: "caller_selected_modeled",
      overall: "modeled",
    },
    provenance: { stages },
    traces: {
      minimum,
      maximum,
    },
    completeness: {
      coefficientStageProjected: true,
      modeledModifiersApplied: true,
      baseDamageRuntimeSelectionResolved: false,
      exactServerRoundingResolved: false,
      overhealApplied: false,
      targetHealthApplied: false,
      isFinalHealingOutcome: false,
      isExactLivePrediction: false,
    },
    warnings: [
      "This is an opt-in modeled healing interval, not an exact or final live-healing prediction.",
      "Normal evaluates caller-provided Base Damage endpoints; it does not assert a random distribution or server roll algorithm.",
      "Outgoing Healing is modeled from the extracted HealEffect hook; its exact operation and stage order remain unresolved.",
      "Healing Received has calibration support but its applicability to self-healing is not isolated.",
      "Skill Damage Boost uses a community-reference healing formula and is not live-verified.",
      "Overheal, target current health, buffs, server state, and exact server rounding are not resolved.",
    ],
  });
}

function resolveEndpoint({ fixed, coefficientProjection, modelInputs, rounding, endpoint }) {
  const coefficientValue = fixed.from(coefficientProjection.magnitudeProjection.value);
  const one = fixed.from(1);
  const hundred = fixed.from(PERCENT_DENOMINATOR);
  const threeThousand = fixed.from(SKILL_DAMAGE_BOOST_DENOMINATOR);
  const trace = new CalculationTrace({
    id: `healing-resolution:${coefficientProjection.abilityId}:${coefficientProjection.componentId}:${coefficientProjection.skillLevel}:${endpoint}`,
    formula: {
      id: "modeled-healing-resolver-v1",
      formulaType: "modeled_healing_pipeline",
      semantic: "modeled_pre_overheal_healing_interval",
      gameBuild: coefficientProjection.gameBuild,
      precision: "modeled",
      provenance: "mixed_extracted_calibration_community",
    },
    inputs: {
      coefficientValue,
      outgoingHealingPercent: modelInputs.outgoingHealingPercent,
      healingReceivedPercent: modelInputs.healingReceivedPercent,
      skillDamageBoost: modelInputs.skillDamageBoost,
      applicationCount: modelInputs.applicationCount,
      rounding,
    },
  });
  const stageOutputs = [{
    id: "reviewed-coefficient",
    value: fixed.format(coefficientValue),
    precision: coefficientProjection.precision.coefficient,
    provenance: coefficientProjection.sourceProvenance.coefficientProvenance,
  }];

  const outgoingRatio = fixed.divide(modelInputs.outgoingHealingPercent, hundred, trace, rounding);
  const outgoingFactor = fixed.add(one, outgoingRatio, trace);
  let value = fixed.multiply(coefficientValue, outgoingFactor, trace, rounding);
  stageOutputs.push({
    id: "outgoing-healing",
    factor: fixed.format(outgoingFactor),
    value: fixed.format(value),
    precision: "modeled",
    provenance: "modeled_from_extracted_hook",
  });

  const receivedRatio = fixed.divide(modelInputs.healingReceivedPercent, hundred, trace, rounding);
  const receivedFactor = fixed.add(one, receivedRatio, trace);
  value = fixed.multiply(value, receivedFactor, trace, rounding);
  stageOutputs.push({
    id: "healing-received",
    factor: fixed.format(receivedFactor),
    value: fixed.format(value),
    precision: "calibrated_support",
    provenance: "calibrated_support",
  });

  const boostDenominator = fixed.add(modelInputs.skillDamageBoost, threeThousand, trace);
  const boostRatio = fixed.divide(modelInputs.skillDamageBoost, boostDenominator, trace, rounding);
  const boostFactor = fixed.add(one, boostRatio, trace);
  value = fixed.multiply(value, boostFactor, trace, rounding);
  stageOutputs.push({
    id: "skill-damage-boost",
    factor: fixed.format(boostFactor),
    value: fixed.format(value),
    precision: "modeled",
    provenance: "derived_community_reference",
  });

  const rounded = divideRounded(value, fixed.scale, rounding);
  const perApplicationValue = rounded.quotient;
  const perApplicationScaled = perApplicationValue * fixed.scale;
  trace.recordArithmetic({
    operation: "round_to_display_integer",
    inputs: [value.toString()],
    scale: fixed.scale.toString(),
    rounding,
    discardedRemainder: rounded.remainder.toString(),
    output: perApplicationScaled.toString(),
  });
  stageOutputs.push({
    id: "display-rounding",
    value: perApplicationValue.toString(),
    precision: "caller_selected_modeled",
    provenance: "caller_selected_rounding",
  });

  const totalAppliedValue = perApplicationValue * BigInt(modelInputs.applicationCount);
  const totalScaled = totalAppliedValue * fixed.scale;
  trace.recordArithmetic({
    operation: "apply_heal_applications",
    inputs: [perApplicationScaled.toString(), String(modelInputs.applicationCount)],
    scale: fixed.scale.toString(),
    rounding: ROUNDING.TRUNCATE,
    discardedRemainder: "0",
    output: totalScaled.toString(),
  });
  stageOutputs.push({
    id: "heal-applications",
    count: modelInputs.applicationCount,
    value: totalAppliedValue.toString(),
    precision: modelInputs.applicationCount === 2 ? "verified_exact" : "direct",
    provenance: modelInputs.applicationCount === 2 ? "live_video_verified" : "caller_selected_normal_application",
  });

  return deepFreeze({
    coefficientProjection,
    stageOutputs,
    perApplicationValue: perApplicationValue.toString(),
    totalAppliedValue: totalAppliedValue.toString(),
    arithmetic: {
      scale: fixed.scale.toString(),
      rounding,
      displayRounding: rounding,
    },
    trace: trace.complete(totalScaled),
  });
}

function provenanceStages({ inspection, rollOutcome, heavyAttack }) {
  return [
    {
      id: "reviewed-coefficient",
      precision: inspection.precision.coefficient,
      provenance: inspection.sourceProvenance.coefficientProvenance,
      evidence: inspection.sourceProvenance.evidence,
    },
    {
      id: "base-damage-selection",
      precision: "modeled",
      provenance: rollOutcome === HEALING_ROLL_OUTCOME.CRITICAL
        ? "derived_community_reference"
        : "caller_provided_modeled_interval",
      evidence: rollOutcome === HEALING_ROLL_OUTCOME.CRITICAL
        ? [{ kind: "community_calculator_audit", reference: "plans/combat-simulator/community-calculator-audit-2026-07-11.md#skill-damage-boost" }]
        : [],
    },
    {
      id: "outgoing-healing",
      precision: "modeled",
      provenance: "modeled_from_extracted_hook",
      evidence: [{ kind: "decoded_dynamic_stat", reference: "TLFormulaParameterNew:HealEffect" }],
    },
    {
      id: "healing-received",
      precision: "calibrated_support",
      provenance: "calibrated_support",
      evidence: [{ kind: "manual_calibration", reference: "plans/combat-simulator/community-calculator-audit-2026-07-11.md#healing-received-on-self-heals" }],
    },
    {
      id: "skill-damage-boost",
      precision: "modeled",
      provenance: "derived_community_reference",
      evidence: [{ kind: "community_calculator_audit", reference: "plans/combat-simulator/community-calculator-audit-2026-07-11.md#skill-damage-boost" }],
    },
    {
      id: "heavy-heal-applications",
      precision: heavyAttack ? "verified_exact" : "not_applied",
      provenance: heavyAttack ? "live_video_verified" : "caller_selected_normal_application",
      evidence: heavyAttack ? [{ kind: "manual_video_calibration", reference: "plans/combat-simulator/calibration-findings-2026-07-10.md#finding-3" }] : [],
    },
  ];
}

function unsupportedResult({ inspection, castComponent, componentId, missingInputs, optInAccepted }) {
  const reason = !optInAccepted
    ? "Modeled healing execution requires explicit allowModeledHealing=true."
    : `Modeled healing execution is unsupported without: ${missingInputs.join(", ")}.`;
  return deepFreeze({
    schema: "tl-helper.modeled-healing-resolution",
    schemaVersion: 1,
    status: "unsupported",
    abilityId: inspection.abilityId,
    abilityName: inspection.abilityName,
    gameBuild: inspection.gameBuild,
    castComponent,
    componentId,
    skillLevel: inspection.skillLevel,
    missingInputs,
    optInAccepted,
    coefficientExpression: inspection.expression,
    precision: {
      coefficient: inspection.precision.coefficient,
      coefficientBasis: inspection.precision.coefficientBasis,
      overall: "unsupported",
    },
    completeness: {
      coefficientStageProjected: false,
      modeledModifiersApplied: false,
      isFinalHealingOutcome: false,
      isExactLivePrediction: false,
    },
    warnings: [reason, "No numeric healing range was produced and no missing value was defaulted."],
  });
}

function assertHealingInspection(inspection) {
  if (inspection.magnitudeKind !== "healing") {
    throw new Error(`Healing resolver requires a healing component, received ${inspection.magnitudeKind}.`);
  }
  if (!inspection.dynamicStatHooks.includes("HealEffect")) {
    throw new Error("Healing resolver requires a reviewed HealEffect dynamic-stat hook.");
  }
}

function selectComponentId(castComponent) {
  if (!CAST_COMPONENTS.has(castComponent)) {
    throw new RangeError(`Unsupported healing cast component: ${castComponent}.`);
  }
  return COMPONENT_IDS[castComponent];
}

function nonNegative(fixed, value, name) {
  const parsed = fixed.from(value);
  if (parsed < 0n) throw new RangeError(`${name} cannot be negative.`);
  return parsed;
}

function assertRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Healing resolution request must be an object.");
  }
  for (const key of Object.keys(value)) {
    if (!REQUEST_KEYS.has(key)) throw new Error(`Unsupported healing resolution request field: ${key}.`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
