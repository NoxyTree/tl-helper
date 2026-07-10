import { projectAbilityMagnitude } from "./ability-magnitude.mjs";
import { FixedPointContext, ROUNDING } from "./fixed-point.mjs";

export const ABILITY_RARITY_TIER = Object.freeze({
  GLOBAL: "global",
  EPIC: "epic",
  HEROIC: "heroic",
});

export const FORCED_ABILITY_OUTCOME = Object.freeze({
  COEFFICIENT_ONLY: "coefficient_only",
  NORMAL: "normal",
  CRITICAL: "critical",
  HEAVY_ATTACK: "heavy_attack",
  BLOCKED: "blocked",
  MISSED: "missed",
});

const TIER_MAPPINGS = Object.freeze({
  [ABILITY_RARITY_TIER.GLOBAL]: Object.freeze({
    offset: 0,
    minimum: 1,
    maximum: 21,
    precision: "direct",
    provenance: "caller_selected_global_level",
  }),
  [ABILITY_RARITY_TIER.EPIC]: Object.freeze({
    offset: 10,
    minimum: 1,
    maximum: 5,
    precision: "derived_high_confidence",
    provenance: "live_tooltip_observation_2026_07_10",
  }),
  [ABILITY_RARITY_TIER.HEROIC]: Object.freeze({
    offset: 15,
    minimum: 1,
    maximum: 5,
    precision: "derived_high_confidence",
    provenance: "live_tooltip_observation_2026_07_10",
  }),
});

const OUTCOME_VALUES = new Set(Object.values(FORCED_ABILITY_OUTCOME));
const RANGE_REQUEST_KEYS = new Set([
  "abilityDefinition",
  "componentId",
  "skillLevel",
  "baseDamageMinimum",
  "baseDamageMaximum",
  "forcedOutcome",
  "allowUncalibratedProjection",
  "rounding",
]);

/**
 * Map a displayed ability level to the decoded global 21-level table.
 * Only the Epic and Heroic windows observed in the first live calibration
 * session are exposed. Base and Rare remain intentionally unsupported.
 */
export function resolveAbilitySkillLevel({ rarityTier, displayedLevel } = {}) {
  if (typeof rarityTier !== "string" || !(rarityTier in TIER_MAPPINGS)) {
    throw new RangeError(`Unsupported or uncalibrated ability rarity tier: ${rarityTier}.`);
  }
  if (!Number.isSafeInteger(displayedLevel)) {
    throw new TypeError("displayedLevel must be a safe integer.");
  }
  const mapping = TIER_MAPPINGS[rarityTier];
  if (displayedLevel < mapping.minimum || displayedLevel > mapping.maximum) {
    throw new RangeError(
      `${rarityTier} displayedLevel must be between ${mapping.minimum} and ${mapping.maximum}.`,
    );
  }
  return deepFreeze({
    rarityTier,
    displayedLevel,
    globalSkillLevel: displayedLevel + mapping.offset,
    offset: mapping.offset,
    precision: mapping.precision,
    provenance: mapping.provenance,
    evidence: rarityTier === ABILITY_RARITY_TIER.GLOBAL ? [] : [{
      kind: "live_tooltip_calibration",
      reference: "plans/combat-simulator/calibration-findings-2026-07-10.md#finding-1",
    }],
  });
}

/**
 * Project the reviewed coefficient expression at the minimum and maximum of
 * a caller-supplied Base Damage input interval. No runtime selection model or
 * combat outcome is resolved.
 */
export function projectAbilityMagnitudeRange(request) {
  assertRangeRequest(request);
  if (request.allowUncalibratedProjection !== true) {
    throw new Error("Numeric magnitude range projection requires explicit allowUncalibratedProjection=true.");
  }
  if (request.baseDamageMinimum === undefined || request.baseDamageMaximum === undefined) {
    throw new Error("Magnitude range projection requires baseDamageMinimum and baseDamageMaximum.");
  }

  const rounding = request.rounding ?? ROUNDING.TRUNCATE;
  const fixed = new FixedPointContext({ scale: 10_000n, rounding });
  const minimumInput = fixed.from(request.baseDamageMinimum);
  const maximumInput = fixed.from(request.baseDamageMaximum);
  if (minimumInput < 0n || maximumInput < 0n) throw new RangeError("Base Damage range cannot be negative.");
  if (minimumInput > maximumInput) {
    throw new RangeError("baseDamageMinimum cannot exceed baseDamageMaximum.");
  }

  const shared = {
    abilityDefinition: request.abilityDefinition,
    componentId: request.componentId,
    skillLevel: request.skillLevel,
    allowUncalibratedProjection: true,
    rounding,
  };
  const minimum = projectAbilityMagnitude({ ...shared, baseDamage: request.baseDamageMinimum });
  const maximum = projectAbilityMagnitude({ ...shared, baseDamage: request.baseDamageMaximum });
  const forcedOutcome = describeForcedAbilityOutcome(request.forcedOutcome ?? FORCED_ABILITY_OUTCOME.COEFFICIENT_ONLY);

  return deepFreeze({
    schema: "tl-helper.ability-magnitude-range-projection",
    schemaVersion: 1,
    abilityId: minimum.abilityId,
    abilityName: minimum.abilityName,
    gameBuild: minimum.gameBuild,
    componentId: minimum.componentId,
    skillLevel: minimum.skillLevel,
    magnitudeKind: minimum.magnitudeKind,
    semantic: minimum.semantic,
    baseDamageRange: {
      minimum: fixed.format(minimumInput),
      maximum: fixed.format(maximumInput),
    },
    preResolutionRange: {
      minimum: minimum.magnitudeProjection.value,
      maximum: maximum.magnitudeProjection.value,
      stage: "pre_resolution",
      semantic: "tooltip_coefficient_projection",
    },
    forcedOutcome,
    precision: {
      coefficient: minimum.precision.coefficient,
      coefficientBasis: minimum.precision.coefficientBasis,
      ownerMapping: minimum.precision.ownerMapping,
      arithmeticProjection: minimum.precision.arithmeticProjection,
      liveOutcome: "unsupported",
      overall: "unsupported",
    },
    completeness: {
      coefficientStageProjected: true,
      outcomeResolved: false,
      mitigationApplied: false,
      isFinalCombatOutcome: false,
    },
    warnings: unique([
      ...minimum.warnings,
      forcedOutcome.warning,
      "The displayed range evaluates only the supplied Base Damage endpoints; it does not assume the server randomly selects between them.",
      "Dynamic stats, consecutive-use state, and other modifiers are not applied.",
    ]),
    projections: { minimum, maximum },
  });
}

/** Describe, but never execute, a selected live combat outcome branch. */
export function describeForcedAbilityOutcome(outcome) {
  if (!OUTCOME_VALUES.has(outcome)) throw new RangeError(`Unsupported forced ability outcome: ${outcome}.`);
  if (outcome === FORCED_ABILITY_OUTCOME.COEFFICIENT_ONLY) {
    return deepFreeze({
      requested: outcome,
      status: "not_requested",
      executable: false,
      applied: false,
      precision: "unsupported",
      reason: "Only the client-visible coefficient stage was requested.",
      warning: "No hit, critical, Heavy Attack, block, miss, or mitigation outcome has been applied.",
    });
  }
  if (outcome === FORCED_ABILITY_OUTCOME.HEAVY_ATTACK) {
    return deepFreeze({
      requested: outcome,
      status: "partially_verified_not_executed",
      executable: false,
      applied: false,
      precision: "unsupported",
      reason: "Video evidence verifies two heal applications for Heavy Attack, but the unresolved live magnitude and pipeline stages prevent execution here.",
      warning: "Forced heavy_attack is not applied. Swift Healing multiplicity is verified as two applications, while its live magnitude and consecutive-use mechanics remain unresolved.",
    });
  }
  return deepFreeze({
    requested: outcome,
    status: "unsupported",
    executable: false,
    applied: false,
    precision: "unsupported",
    reason: `The live ${outcome} resolution formula and pipeline order have not been calibrated.`,
    warning: `Forced ${outcome} is shown as unsupported and has not changed the coefficient projection.`,
  });
}

function assertRangeRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Ability magnitude range request must be an object.");
  }
  for (const key of Object.keys(value)) {
    if (!RANGE_REQUEST_KEYS.has(key)) {
      throw new Error(`Unsupported ability magnitude range request field: ${key}. Final-outcome execution is not supported.`);
    }
  }
}

function unique(values) {
  return [...new Set(values)];
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
