import { loadCombatAbilityData } from "./vendor/combat-engine/ability-data.mjs";
import {
  ABILITY_RARITY_TIER,
  FORCED_ABILITY_OUTCOME,
  projectAbilityMagnitudeRange,
  resolveAbilitySkillLevel,
} from "./vendor/combat-engine/ability-range-projection.mjs";
import {
  HEALING_CAST_COMPONENT,
  HEALING_ROLL_OUTCOME,
  resolveHealingRange,
} from "./vendor/combat-engine/healing-resolver.mjs";

export const HEALING_OUTCOMES = Object.freeze([
  { id: "normal", label: "Forced normal" },
  { id: "critical", label: "Forced critical" },
  { id: "heavy", label: "Forced Heavy Attack" },
]);

export const HEALING_CASTS = Object.freeze([
  { id: HEALING_CAST_COMPONENT.FIRST, label: "First cast", componentId: "first-heal" },
  { id: HEALING_CAST_COMPONENT.SECOND, label: "Second consecutive cast", componentId: "second-heal" },
]);

export const OUTCOMES = Object.freeze([
  { id: FORCED_ABILITY_OUTCOME.COEFFICIENT_ONLY, label: "Coefficient projection" },
  { id: FORCED_ABILITY_OUTCOME.NORMAL, label: "Forced normal" },
  { id: FORCED_ABILITY_OUTCOME.HEAVY_ATTACK, label: "Forced Heavy Attack" },
  { id: FORCED_ABILITY_OUTCOME.CRITICAL, label: "Forced critical" },
  { id: FORCED_ABILITY_OUTCOME.BLOCKED, label: "Forced blocked" },
  { id: FORCED_ABILITY_OUTCOME.MISSED, label: "Forced missed" },
]);

export const TIER_MAPPINGS = Object.freeze([
  { id: ABILITY_RARITY_TIER.GLOBAL, label: "Global table level", offset: 0, minimum: 1, maximum: 21 },
  { id: ABILITY_RARITY_TIER.EPIC, label: "Epic", offset: 10, minimum: 1, maximum: 5 },
  { id: ABILITY_RARITY_TIER.HEROIC, label: "Heroic", offset: 15, minimum: 1, maximum: 5 },
]);

export function loadCombatLabData(input) {
  const data = loadCombatAbilityData(input);
  return Object.freeze({ gameBuild: data.gameBuild, abilities: data.listAbilities() });
}

export function mapDisplayedLevel(tierId, displayedLevel) {
  return resolveAbilitySkillLevel({ rarityTier: tierId, displayedLevel });
}

export function projectAbilityRange({ ability, componentId, globalLevel, minimum, maximum, outcomeId }) {
  const component = ability?.formulaComponents?.find((entry) => entry.id === componentId);
  if (!component) throw new Error("Select a formula component.");
  if (stripEnum(component.formulaType) !== "kAmountFromAttackPower") {
    return unsupportedResult(ability, component, globalLevel, outcomeId,
      `Formula type ${stripEnum(component.formulaType)} is inspection-only in this first Combat Lab.`);
  }

  const projection = projectAbilityMagnitudeRange({
    abilityDefinition: ability,
    componentId,
    skillLevel: globalLevel,
    baseDamageMinimum: minimum,
    baseDamageMaximum: maximum,
    forcedOutcome: outcomeId,
    allowUncalibratedProjection: true,
  });
  const distortionWarning = ability.id === "distortion-veil" && component.id === "shield-health"
    ? "Distortion Veil live shield values do not match the naive Shield Health model. This coefficient range must not be treated as shield capacity."
    : null;
  return Object.freeze({
    supported: true,
    abilityId: projection.abilityId,
    abilityName: projection.abilityName,
    componentId: projection.componentId,
    magnitudeKind: projection.magnitudeKind,
    globalLevel: projection.skillLevel,
    outcome: projection.forcedOutcome,
    result: projection.preResolutionRange,
    expression: projection.projections.minimum.expression.notation,
    coefficients: projection.projections.minimum.expression.coefficients,
    precision: { ...projection.precision, provenance: component.provenance },
    completeness: projection.completeness,
    warnings: [...projection.warnings, distortionWarning].filter(Boolean),
    source: component.source,
    evidence: component.evidence ?? [],
    traces: [
      traceFor("minimum", projection.projections.minimum.trace),
      traceFor("maximum", projection.projections.maximum.trace),
    ],
    unresolvedStages: projection.projections.minimum.unresolvedStages ?? [],
  });
}

export function isHealingResolverAbility(ability) {
  return ability?.id === "swift-healing";
}

export function resolveCombatLabHealing({
  ability,
  globalLevel,
  castComponent,
  minimum,
  maximum,
  outcomeId,
  outgoingHealingPercent,
  healingReceivedPercent,
  skillDamageBoost,
  allowModeledHealing,
}) {
  if (!isHealingResolverAbility(ability)) throw new Error("Healing Resolver v1 supports Swift Healing only.");
  const critical = outcomeId === "critical";
  const heavyAttack = outcomeId === "heavy";
  const resolution = resolveHealingRange({
    abilityDefinition: ability,
    skillLevel: globalLevel,
    castComponent,
    baseDamageMinimum: minimum,
    baseDamageMaximum: maximum,
    rollOutcome: critical ? HEALING_ROLL_OUTCOME.CRITICAL : HEALING_ROLL_OUTCOME.NORMAL,
    outgoingHealingPercent,
    healingReceivedPercent,
    skillDamageBoost,
    heavyAttack,
    rounding: "truncate",
    allowModeledHealing,
  });
  const componentId = HEALING_CASTS.find(({ id }) => id === castComponent)?.componentId ?? `${castComponent}-heal`;
  const component = ability.formulaComponents.find(({ id }) => id === componentId);
  return Object.freeze({
    ...resolution,
    mode: "healing_resolver_v1",
    abilityId: ability.id,
    abilityName: ability.name,
    componentId,
    globalLevel,
    outcome: { id: outcomeId, critical, heavyAttack },
    source: component?.source ?? null,
    evidence: component?.evidence ?? [],
    warnings: resolution.status === "modeled"
      ? [...resolution.warnings, "Clean live calibration observations currently fall outside this community-modeled pipeline. Treat the range as a calibration aid, never an exact prediction."]
      : resolution.warnings,
  });
}

function unsupportedResult(ability, component, globalLevel, outcomeId, reason) {
  const outcome = OUTCOMES.find((entry) => entry.id === outcomeId) ?? OUTCOMES[0];
  return Object.freeze({
    supported: false,
    abilityId: ability.id,
    abilityName: ability.name,
    componentId: component.id,
    globalLevel,
    outcome: { requested: outcome.id, executable: false, applied: false, reason },
    precision: { coefficient: component.precision, provenance: component.provenance, overall: "unsupported" },
    completeness: { coefficientStageProjected: false, outcomeResolved: false, mitigationApplied: false, isFinalCombatOutcome: false },
    warnings: [reason, "No numeric result was produced."],
    source: component.source,
    evidence: component.evidence ?? [],
    traces: [],
    unresolvedStages: ability.unresolvedStages ?? [],
  });
}

function traceFor(bound, trace) {
  return {
    bound,
    inputs: { ...trace.inputs, baseDamage: scaledToDisplay(trace.inputs.baseDamage, trace.inputs.basisDenominator) },
    stages: trace.stages,
    output: scaledToDisplay(trace.output, trace.inputs.basisDenominator),
  };
}

function scaledToDisplay(value, scaleValue) {
  const scale = BigInt(scaleValue);
  const scaled = BigInt(value);
  const sign = scaled < 0n ? "-" : "";
  const absolute = scaled < 0n ? -scaled : scaled;
  const whole = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(scale.toString().length - 1, "0").replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

function stripEnum(value) {
  const text = String(value);
  return text.slice(text.lastIndexOf("::") + 2);
}
