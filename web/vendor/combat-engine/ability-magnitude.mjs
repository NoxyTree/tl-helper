import { normalizeAbilityDefinition } from "./ability-definition.mjs";
import { FixedPointContext, ROUNDING } from "./fixed-point.mjs";
import { CalculationTrace } from "./trace.mjs";

const SUPPORTED_FORMULA_TYPE = "kAmountFromAttackPower";
const BASIS_DENOMINATOR = "10000";
const REQUEST_KEYS = new Set([
  "abilityDefinition",
  "componentId",
  "skillLevel",
  "baseDamage",
  "allowUncalibratedProjection",
  "rounding",
]);
const EXPRESSION_REQUEST_KEYS = new Set(["abilityDefinition", "componentId", "skillLevel"]);
const NONE_DYNAMIC_STAT = new Set([null, "None"]);

/**
 * Inspect one reviewed formula row without executing any combat calculation.
 * This is the safe default for consumers that only need coefficients.
 */
export function inspectAbilityMagnitude(request) {
  assertRequest(request, EXPRESSION_REQUEST_KEYS);
  const selection = selectMagnitude(request);
  return buildResult(selection);
}

/**
 * Project the client-visible coefficient expression against a caller-supplied
 * Base Damage value. This is not final damage, healing, or shield capacity.
 */
export function projectAbilityMagnitude(request) {
  assertRequest(request, REQUEST_KEYS);
  if (request.allowUncalibratedProjection !== true) {
    throw new Error("Numeric magnitude projection requires explicit allowUncalibratedProjection=true.");
  }
  if (request.baseDamage === undefined) throw new Error("Numeric magnitude projection requires baseDamage.");

  const selection = selectMagnitude(request);
  const rounding = request.rounding ?? ROUNDING.TRUNCATE;
  const fixed = new FixedPointContext({ scale: 10_000n, rounding });
  const baseDamage = fixed.from(request.baseDamage);
  if (baseDamage < 0n) throw new RangeError("baseDamage cannot be negative.");

  const multiplier = fixed.from(selection.level.mul);
  const denominator = fixed.from(BASIS_DENOMINATOR);
  const additive = fixed.from(selection.level.add);
  const trace = new CalculationTrace({
    id: `ability-magnitude:${selection.ability.id}:${selection.component.id}:${selection.skillLevel}`,
    formula: {
      id: `${selection.component.sourceTable}:${selection.component.sourceRow}`,
      formulaType: SUPPORTED_FORMULA_TYPE,
      semantic: "tooltip_coefficient_projection",
      gameBuild: selection.ability.gameBuild,
      sourceTable: selection.component.sourceTable,
      sourceRow: selection.component.sourceRow,
      coefficientPrecision: selection.component.precision,
      coefficientProvenance: selection.component.provenance,
    },
    inputs: {
      baseDamage,
      mul: selection.level.mul,
      basisDenominator: BASIS_DENOMINATOR,
      add: selection.level.add,
    },
  });

  const multiplied = fixed.multiply(baseDamage, multiplier, trace, rounding);
  const scaled = fixed.divide(multiplied, denominator, trace, rounding);
  const output = fixed.add(scaled, additive, trace);
  if (output < 0n) throw new RangeError("Projected magnitude cannot be negative.");

  const completedTrace = trace.complete(output);
  return buildResult(selection, {
    magnitudeProjection: {
      semantic: "tooltip_coefficient_projection",
      stage: "pre_resolution",
      value: fixed.format(output),
      scaledValue: output.toString(),
      scale: fixed.scale.toString(),
      rounding,
    },
    trace: completedTrace,
  });
}

function selectMagnitude(request) {
  const ability = normalizeAbilityDefinition(request.abilityDefinition);
  if (typeof request.componentId !== "string" || request.componentId.length === 0) {
    throw new TypeError("componentId must be a non-empty string.");
  }
  if (!Number.isSafeInteger(request.skillLevel) || request.skillLevel < 1) {
    throw new RangeError("skillLevel must be a positive safe integer.");
  }
  const component = ability.formulaComponents.find(({ id }) => id === request.componentId);
  if (!component) throw new Error(`Unknown formula component: ${request.componentId}`);
  if (stripFormulaEnum(component.formulaType) !== SUPPORTED_FORMULA_TYPE) {
    throw new Error(`Unsupported ability magnitude formula type: ${component.formulaType}`);
  }
  const level = component.rawLevels.find((entry) => entry.skillLevel === request.skillLevel);
  if (!level) {
    throw new RangeError(`Component ${component.id} has no reviewed coefficients for skillLevel ${request.skillLevel}.`);
  }
  if (level.mul === null || level.add === null) {
    throw new Error(`Component ${component.id} has incomplete coefficients at skillLevel ${request.skillLevel}.`);
  }
  return { ability, component, level, skillLevel: request.skillLevel };
}

function buildResult(selection, projection = {}) {
  const { ability, component, level, skillLevel } = selection;
  const dynamicStatIds = level.dynamicStatIds.filter((id) => !NONE_DYNAMIC_STAT.has(id));
  const unresolvedStages = [
    ...ability.unresolvedStages,
    assumptionStage("base-damage-selection", "The runtime selection of the Base Damage value has not been calibrated.", ability.gameBuild),
    assumptionStage("rounding-order", "The live server rounding order has not been calibrated.", ability.gameBuild),
    ...(dynamicStatIds.length === 0 ? [] : [assumptionStage(
      "dynamic-stat-modifiers",
      `Dynamic stat hooks are reported but not executed: ${dynamicStatIds.join(", ")}.`,
      ability.gameBuild,
    )]),
  ];
  const result = {
    schema: "tl-helper.ability-magnitude-inspection",
    schemaVersion: 1,
    abilityId: ability.id,
    abilityName: ability.name,
    gameBuild: ability.gameBuild,
    componentId: component.id,
    skillLevel,
    magnitudeKind: component.effectKind ?? ability.kind,
    semantic: "tooltip_coefficient_projection",
    expression: {
      formulaType: SUPPORTED_FORMULA_TYPE,
      notation: "baseDamage * mul / 10000 + add",
      coefficients: { mul: level.mul, add: level.add },
      basisDenominator: BASIS_DENOMINATOR,
    },
    precision: {
      coefficient: component.precision,
      coefficientBasis: "verified_exact",
      ownerMapping: mappingPrecision(component.mappingClass),
      arithmeticProjection: projection.magnitudeProjection ? "modeled" : "not_executed",
      liveOutcome: "unsupported",
      overall: "unsupported",
    },
    completeness: {
      coefficientStageProjected: Boolean(projection.magnitudeProjection),
      dynamicStatsApplied: false,
      modifiersApplied: false,
      mitigationApplied: false,
      outcomeResolved: false,
      isFinalCombatOutcome: false,
    },
    assumptions: projection.magnitudeProjection ? [
      "The supplied Base Damage is caller-selected.",
      "The coefficient basis uses the live-verified 10000 = 100 percent display encoding for these reviewed rows.",
      "Arithmetic uses an explicit caller-selected rounding mode, defaulting to truncate.",
    ] : [
      "No Base Damage or arithmetic projection was accepted by this inspection.",
      "The expression records the live-verified 10000 = 100 percent display encoding without executing it.",
    ],
    warnings: [
      "This result is a tooltip coefficient projection, not a final combat outcome.",
      "Dynamic stats, buffs, mitigation, hit, critical, Heavy Attack, block, PvP rules, and server timing are not executed.",
    ],
    dynamicStatHooks: dynamicStatIds,
    sourceProvenance: {
      coefficientPrecision: component.precision,
      coefficientBasisPrecision: "verified_exact",
      coefficientBasisEvidence: "plans/combat-simulator/calibration-findings-2026-07-10.md#finding-1",
      coefficientProvenance: component.provenance,
      mappingClass: component.mappingClass,
      evidence: component.evidence,
      source: component.source,
    },
    unresolvedStages,
    ...projection,
  };
  return deepFreeze(result);
}

function assumptionStage(id, reason, gameBuild) {
  return {
    id: `projection.${id}`,
    gameBuild,
    stage: id,
    reason,
    classification: "calibration_required",
    precision: "unsupported",
    provenance: "unresolved",
    evidence: [{ kind: "engine_contract", reference: "packages/combat-engine/src/ability-magnitude.mjs", gameBuild }],
  };
}

function mappingPrecision(mappingClass) {
  if (mappingClass === "exact") return "verified_exact";
  if (mappingClass === "derived" || mappingClass === "reviewed_alias") return "derived_high_confidence";
  return "modeled";
}

function stripFormulaEnum(value) {
  const separator = value.lastIndexOf("::");
  return separator === -1 ? value : value.slice(separator + 2);
}

function assertRequest(value, allowedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Ability magnitude request must be an object.");
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unsupported ability magnitude request field: ${key}. Dynamic-stat execution and final-outcome claims are not supported.`);
    }
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
