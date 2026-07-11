import { FixedPointContext, ROUNDING } from "./fixed-point.mjs";

export const PVP_MODEL_VERSION = "community-model-2026-07-11.v1";
export const PVP_HEAVY_DIFFERENCE_CAPS = Object.freeze({
  general: Object.freeze({ positive: "4500", negative: "3000" }),
  battleground: Object.freeze({ positive: "3000", negative: "2000" }),
  arena: Object.freeze({ positive: "2250", negative: "1500" }),
});
export const PVP_CRITICAL_DIFFERENCE_CAPS = PVP_HEAVY_DIFFERENCE_CAPS;
export const PVP_HIT_DIFFERENCE_CAPS = Object.freeze({
  general: Object.freeze({ positive: "3000", negative: "4500" }),
  battleground: Object.freeze({ positive: "2000", negative: "3000" }),
  arena: Object.freeze({ positive: "1500", negative: "2250" }),
});
export const PVP_CONTEST_DIFFERENCE_CAPS = PVP_CRITICAL_DIFFERENCE_CAPS;

export function modelHitChance({ hit, evasion, denominator = "1000", pvpMode } = {}) {
  const contest = contestInputs({ offense: hit, defense: evasion, denominator, pvpMode, capsByMode: PVP_HIT_DIFFERENCE_CAPS, offenseName: "hit", defenseName: "evasion" });
  const { fixed, difference, k, cap } = contest;
  const missChance = difference < 0n ? fixed.divide(-difference, -difference + k) : 0n;
  return result(fixed, fixed.from(1) - missChance, {
    operation: "evasion_surplus_miss_curve",
    inputs: contest.displayInputs,
    evidence: "community_tested_operation_plus_official_caps",
    confidence: "high",
    missChance: fixed.format(missChance),
    exactStages: cap === null ? [] : ["official_mode_specific_difference_cap"],
    unresolved: ["current-build server denominator", "server rounding"],
  });
}

export function modelCriticalContest({ criticalHit, endurance, denominator = "1000", pvpMode } = {}) {
  const contest = contestInputs({ offense: criticalHit, defense: endurance, denominator, pvpMode, capsByMode: PVP_CRITICAL_DIFFERENCE_CAPS, offenseName: "criticalHit", defenseName: "endurance" });
  const { fixed, difference, k, cap } = contest;
  const criticalChance = difference > 0n ? fixed.divide(difference, difference + k) : 0n;
  const glanceChance = difference < 0n ? fixed.divide(-difference, -difference + k) : 0n;
  return Object.freeze({
    ...result(fixed, criticalChance, {
      operation: "critical_endurance_two_sided_contest",
      inputs: contest.displayInputs,
      evidence: "community_tested_critical_plus_symmetry_inferred_glance",
      confidence: "medium_high",
      exactStages: cap === null ? [] : ["official_mode_specific_difference_cap"],
      unresolved: ["glancing denominator current-build confirmation", "server rounding"],
    }),
    criticalChance: fixed.format(criticalChance),
    glanceChance: fixed.format(glanceChance),
    normalRollChance: fixed.format(fixed.from(1) - criticalChance - glanceChance),
  });
}

/** Community-tested signed Skill Damage Boost minus Resistance curve. */
export function modelSkillDamageMultiplier({ boost, resistance, denominator = "1000" } = {}) {
  const fixed = context();
  const b = nonNegative(fixed, boost, "boost");
  const r = nonNegative(fixed, resistance, "resistance");
  const k = positive(fixed, denominator, "denominator");
  const difference = b - r;
  const magnitude = difference < 0n ? -difference : difference;
  const adjustment = fixed.divide(magnitude, magnitude + k);
  const multiplier = difference < 0n ? fixed.from(1) - adjustment : fixed.from(1) + adjustment;
  return result(fixed, multiplier, {
    operation: "signed_difference_curve",
    inputs: { boost: fixed.format(b), resistance: fixed.format(r), denominator: fixed.format(k) },
    evidence: "community_tested",
    unresolved: ["current-level-cap denominator", "server rounding and pipeline order"],
  });
}

/** Defense mitigation candidate with caller-selected level/build constant. */
export function modelDefenseMultiplier({ defense, constant } = {}) {
  const fixed = context();
  const d = nonNegative(fixed, defense, "defense");
  const k = positive(fixed, constant, "constant");
  const multiplier = fixed.divide(k, d + k);
  return result(fixed, multiplier, {
    operation: "constant_over_defense_plus_constant",
    inputs: { defense: fixed.format(d), constant: fixed.format(k) },
    evidence: "community_tested_shape_level_constant_partial",
    unresolved: ["current-level-cap constant", "server rounding and pipeline order"],
  });
}

/** Critical damage bonus and resistance are percentage-point values above base damage. */
export function modelCriticalDamageMultiplier({ criticalDamage, resistance } = {}) {
  const fixed = context();
  const dealt = nonNegative(fixed, criticalDamage, "criticalDamage");
  const resisted = nonNegative(fixed, resistance, "resistance");
  const remaining = dealt > resisted ? dealt - resisted : 0n;
  const multiplier = fixed.from(1) + fixed.divide(remaining, fixed.from(100));
  return result(fixed, multiplier, {
    operation: "base_plus_positive_percentage_difference",
    inputs: { criticalDamage: fixed.format(dealt), resistance: fixed.format(resisted) },
    evidence: "datamined_floor_additive_interaction_inferred",
    floor: "1",
    unresolved: ["server rounding and pipeline order"],
  });
}

/** Heavy bonus and resistance are percentage points; client tooltip establishes a 150% floor. */
export function modelHeavyDamageMultiplier({ heavyDamageBonus, resistance } = {}) {
  const fixed = context();
  const bonus = nonNegative(fixed, heavyDamageBonus, "heavyDamageBonus");
  const resisted = nonNegative(fixed, resistance, "resistance");
  const netBonus = bonus > resisted ? bonus - resisted : 0n;
  const floor = fixed.from("1.5");
  const candidate = fixed.from(1) + fixed.divide(netBonus, fixed.from(100));
  const multiplier = candidate > floor ? candidate : floor;
  return result(fixed, multiplier, {
    operation: "base_plus_heavy_bonus_minus_resistance_with_floor",
    inputs: { heavyDamageBonus: fixed.format(bonus), resistance: fixed.format(resisted) },
    evidence: "datamined_floor_additive_interaction_inferred",
    floor: "1.5",
    unresolved: ["server rounding and pipeline order"],
  });
}

/** Symmetry-derived glance probability. A glance selects minimum Base Damage. */
export function modelGlanceChance({ endurance, criticalHit, denominator = "1000" } = {}) {
  const fixed = context();
  const end = nonNegative(fixed, endurance, "endurance");
  const crit = nonNegative(fixed, criticalHit, "criticalHit");
  const k = positive(fixed, denominator, "denominator");
  const difference = end > crit ? end - crit : 0n;
  const probability = difference === 0n ? 0n : fixed.divide(difference, difference + k);
  return result(fixed, probability, {
    operation: "positive_difference_probability_curve",
    inputs: { endurance: fixed.format(end), criticalHit: fixed.format(crit), denominator: fixed.format(k) },
    evidence: "community_corroborated_symmetry_inferred",
    outcome: "select_minimum_base_damage",
    unresolved: ["curve denominator", "glance and Heavy interaction", "server rounding"],
  });
}

/**
 * Heavy Attack Chance and Heavy Attack Evasion are client-confirmed paired
 * stats. Their subtract-first common curve is community-tested but the current
 * build's server denominator and content caps are not extracted.
 */
export function modelHeavyAttackChance({ heavyAttackChance, heavyAttackEvasion, denominator = "1000", pvpMode, differenceCap } = {}) {
  const fixed = context();
  const chance = nonNegative(fixed, heavyAttackChance, "heavyAttackChance");
  const evasion = nonNegative(fixed, heavyAttackEvasion, "heavyAttackEvasion");
  const k = positive(fixed, denominator, "denominator");
  const rawDifference = chance > evasion ? chance - evasion : 0n;
  if (pvpMode !== undefined && differenceCap !== undefined) throw new TypeError("Use pvpMode or differenceCap, not both.");
  const officialCap = pvpMode === undefined ? null : PVP_HEAVY_DIFFERENCE_CAPS[pvpMode]?.positive;
  if (pvpMode !== undefined && officialCap === undefined) throw new RangeError(`Unsupported PvP mode: ${pvpMode}`);
  const selectedCap = differenceCap ?? officialCap;
  const cap = selectedCap === undefined || selectedCap === null ? null : positive(fixed, selectedCap, "differenceCap");
  const effectiveDifference = cap !== null && rawDifference > cap ? cap : rawDifference;
  const probability = effectiveDifference === 0n ? 0n : fixed.divide(effectiveDifference, effectiveDifference + k);
  return result(fixed, probability, {
    operation: "positive_heavy_chance_minus_evasion_curve",
    inputs: {
      heavyAttackChance: fixed.format(chance),
      heavyAttackEvasion: fixed.format(evasion),
      denominator: fixed.format(k),
      differenceCap: cap === null ? null : fixed.format(cap),
      pvpMode: pvpMode ?? null,
      rawDifference: fixed.format(rawDifference),
      effectiveDifference: fixed.format(effectiveDifference),
      capApplied: effectiveDifference !== rawDifference,
    },
    evidence: "client_paired_stats_plus_community_tested_operation",
    confidence: "medium",
    zeroBranch: "heavyAttackChance <= heavyAttackEvasion",
    exactStages: pvpMode === undefined ? [] : ["official_mode_specific_difference_cap"],
    unresolved: ["current-build server denominator", "server rounding"],
  });
}

function context() {
  return new FixedPointContext({ scale: 1_000_000n, rounding: ROUNDING.TRUNCATE });
}

function contestInputs({ offense, defense, denominator, pvpMode, capsByMode, offenseName, defenseName }) {
  const fixed = context();
  const attack = nonNegative(fixed, offense, offenseName);
  const resist = nonNegative(fixed, defense, defenseName);
  const k = positive(fixed, denominator, "denominator");
  const caps = pvpMode === undefined ? null : capsByMode[pvpMode];
  if (pvpMode !== undefined && !caps) throw new RangeError(`Unsupported PvP mode: ${pvpMode}`);
  const rawDifference = attack - resist;
  let difference = rawDifference;
  if (caps) {
    const positiveCap = fixed.from(caps.positive);
    const negativeCap = fixed.from(caps.negative);
    if (difference > positiveCap) difference = positiveCap;
    if (difference < -negativeCap) difference = -negativeCap;
  }
  return {
    fixed, difference, k, cap: caps,
    displayInputs: {
      [offenseName]: fixed.format(attack),
      [defenseName]: fixed.format(resist),
      rawDifference: fixed.format(rawDifference),
      effectiveDifference: fixed.format(difference),
      capApplied: difference !== rawDifference,
      denominator: fixed.format(k),
      pvpMode: pvpMode ?? null,
    },
  };
}

function nonNegative(fixed, value, name) {
  const parsed = fixed.from(required(value, name));
  if (parsed < 0n) throw new RangeError(`${name} must be non-negative.`);
  return parsed;
}

function positive(fixed, value, name) {
  const parsed = fixed.from(required(value, name));
  if (parsed <= 0n) throw new RangeError(`${name} must be positive.`);
  return parsed;
}

function required(value, name) {
  if (value === undefined || value === null || value === "") throw new TypeError(`${name} is required.`);
  return value;
}

function result(fixed, value, details) {
  return Object.freeze({
    schema: "tl-helper.pvp-modeled-operation",
    schemaVersion: 1,
    modelVersion: PVP_MODEL_VERSION,
    status: "modeled",
    precision: "modeled",
    provenance: details.evidence,
    value: fixed.format(value),
    ...details,
  });
}
