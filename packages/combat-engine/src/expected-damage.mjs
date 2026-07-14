import { FixedPointContext, ROUNDING } from "./fixed-point.mjs";
import {
  modelCriticalContest,
  modelCriticalDamageMultiplier,
  modelHeavyAttackChance,
  modelHeavyDamageMultiplier,
  modelHitChance,
  modelSkillDamageMultiplier,
} from "./pvp-models.mjs";

export const EXPECTED_DAMAGE_MODEL_VERSION = "community-expected-damage-2026-07-14.v1";

/**
 * Compose the evidence-scoped PvP contest operations into a pre-Defense
 * expected-damage interval. This deliberately does not claim server-exact
 * rounding, Defense, block, flat Bonus Damage, or Damage Reduction.
 */
export function modelExpectedPvpDamage(input = {}) {
  const fixed = new FixedPointContext({ scale: 1_000_000n, rounding: ROUNDING.TRUNCATE });
  const minimum = nonNegative(fixed, input.preResolutionMinimum, "preResolutionMinimum");
  const maximum = nonNegative(fixed, input.preResolutionMaximum, "preResolutionMaximum");
  if (minimum > maximum) throw new RangeError("preResolutionMinimum cannot exceed preResolutionMaximum.");

  const shared = { pvpMode: input.pvpMode };
  const hit = modelHitChance({ hit: input.hit, evasion: input.evasion, ...shared });
  const critical = modelCriticalContest({ criticalHit: input.criticalHit, endurance: input.endurance, ...shared });
  const heavy = modelHeavyAttackChance({ heavyAttackChance: input.heavyAttackChance, heavyAttackEvasion: input.heavyAttackEvasion, ...shared });
  const skillDamage = modelSkillDamageMultiplier({ boost: input.skillDamageBoost, resistance: input.skillDamageResistance });
  const criticalDamage = modelCriticalDamageMultiplier({ criticalDamage: input.criticalDamage, resistance: input.criticalDamageResistance });
  const heavyDamage = modelHeavyDamageMultiplier({ heavyDamageBonus: input.heavyDamage, resistance: input.heavyDamageResistance });

  const one = fixed.from(1);
  const two = fixed.from(2);
  const hitChance = fixed.from(hit.value);
  const criticalChance = fixed.from(critical.criticalChance);
  const glanceChance = fixed.from(critical.glanceChance);
  const normalChance = fixed.from(critical.normalRollChance);
  const heavyChance = fixed.from(heavy.value);
  const skillDamageMultiplier = fixed.from(skillDamage.value);
  const criticalDamageMultiplier = fixed.from(criticalDamage.value);
  const heavyDamageMultiplier = fixed.from(heavyDamage.value);
  const normalMagnitude = fixed.divide(minimum + maximum, two);
  const criticalMagnitude = fixed.multiply(maximum, criticalDamageMultiplier);
  const expectedHeavyMultiplier = (multiplier) => (one - heavyChance) + fixed.multiply(heavyChance, multiplier);
  const heavyExpected = expectedHeavyMultiplier(heavyDamageMultiplier);

  const normalContribution = fixed.multiply(normalChance, normalMagnitude);
  const criticalContribution = fixed.multiply(criticalChance, criticalMagnitude);
  const glanceContribution = fixed.multiply(glanceChance, minimum);
  const nonGlanceLanded = normalContribution + criticalContribution;

  // Canonical community pipeline applies Heavy Attack after the outcome roll.
  const expectedVariant = (heavyMultiplier, heavyOnGlance) => {
    const expectedHeavy = expectedHeavyMultiplier(heavyMultiplier);
    const landed = heavyOnGlance
      ? fixed.multiply(nonGlanceLanded + glanceContribution, expectedHeavy)
      : fixed.multiply(nonGlanceLanded, expectedHeavy) + glanceContribution;
    return fixed.multiply(fixed.multiply(hitChance, landed), skillDamageMultiplier);
  };
  const variants = [
    { id: "heavy_with_glance", value: expectedVariant(heavyDamageMultiplier, true) },
    { id: "heavy_without_glance", value: expectedVariant(heavyDamageMultiplier, false) },
  ];
  const canonicalExpected = variants[0].value;
  const lower = variants.reduce((value, entry) => entry.value < value ? entry.value : value, variants[0].value);
  const upper = variants.reduce((value, entry) => entry.value > value ? entry.value : value, variants[0].value);

  const branchProbability = (outcomeChance, isHeavy) => fixed.multiply(
    fixed.multiply(hitChance, outcomeChance),
    isHeavy ? heavyChance : one - heavyChance,
  );
  const branchDamage = (magnitude, isHeavy) => fixed.multiply(
    fixed.multiply(magnitude, isHeavy ? heavyDamageMultiplier : one),
    skillDamageMultiplier,
  );
  const branchProbabilities = [
    one - hitChance,
    branchProbability(glanceChance, false),
    branchProbability(glanceChance, true),
    branchProbability(normalChance, false),
    branchProbability(normalChance, true),
    branchProbability(criticalChance, false),
  ];
  const assignedProbability = branchProbabilities.reduce((sum, value) => sum + value, 0n);
  branchProbabilities.push(one - assignedProbability);
  const branches = [
    branch("miss", branchProbabilities[0], 0n, fixed),
    branch("glance", branchProbabilities[1], branchDamage(minimum, false), fixed),
    branch("glance_heavy", branchProbabilities[2], branchDamage(minimum, true), fixed, "modeled_unresolved_interaction"),
    branch("normal", branchProbabilities[3], branchDamage(normalMagnitude, false), fixed),
    branch("normal_heavy", branchProbabilities[4], branchDamage(normalMagnitude, true), fixed),
    branch("critical", branchProbabilities[5], branchDamage(criticalMagnitude, false), fixed),
    branch("critical_heavy", branchProbabilities[6], branchDamage(criticalMagnitude, true), fixed),
  ];

  return deepFreeze({
    schema: "tl-helper.modeled-expected-pvp-damage",
    schemaVersion: 1,
    modelVersion: EXPECTED_DAMAGE_MODEL_VERSION,
    status: "modeled",
    attackType: input.attackType ?? null,
    pvpMode: input.pvpMode ?? null,
    expectedDamage: fixed.format(canonicalExpected),
    sensitivityInterval: { minimum: fixed.format(lower), maximum: fixed.format(upper) },
    preResolutionRange: { minimum: fixed.format(minimum), maximum: fixed.format(maximum) },
    probabilities: {
      hit: hit.value,
      miss: hit.missChance,
      critical: critical.criticalChance,
      glance: critical.glanceChance,
      normal: critical.normalRollChance,
      heavy: heavy.value,
    },
    multipliers: {
      criticalDamage: criticalDamage.value,
      heavyDamage: heavyDamage.value,
      skillDamage: skillDamage.value,
      expectedHeavy: fixed.format(heavyExpected),
    },
    sensitivityVariants: variants.map((entry) => ({ id: entry.id, expectedDamage: fixed.format(entry.value) })),
    branches,
    operations: { hit, critical, heavy, skillDamage, criticalDamage, heavyDamage },
    precision: {
      coefficientRange: input.coefficientPrecision ?? "caller_supplied",
      chanceOperations: "modeled",
      damageMultipliers: "modeled",
      overall: "modeled",
    },
    assumptions: [
      "Normal Base Damage is uniformly distributed between the supplied endpoints.",
      "Critical selects the maximum endpoint and glance selects the minimum endpoint.",
      "Heavy Attack is independent of hit, critical, and glance outcomes.",
      "The canonical result allows Heavy Attack on a glancing hit; the sensitivity interval also evaluates the no-Heavy-glance alternative.",
    ],
    unsupportedStages: [
      "Defense and its current-level constant",
      "block and Shield Damage Reduction",
      "flat Bonus Damage and Damage Reduction",
      "server modifier order and rounding",
      "conditional skill effects, buffs, debuffs, and target state",
    ],
    completeness: { preDefenseExpectedDamageModeled: true, isFinalCombatOutcome: false },
  });
}

export function compareModeledExpectedDamage(left, right) {
  const leftMin = Number(left?.sensitivityInterval?.minimum);
  const leftMax = Number(left?.sensitivityInterval?.maximum);
  const rightMin = Number(right?.sensitivityInterval?.minimum);
  const rightMax = Number(right?.sensitivityInterval?.maximum);
  if (![leftMin, leftMax, rightMin, rightMax].every(Number.isFinite)) {
    throw new TypeError("Both modeled expected-damage results require finite sensitivity intervals.");
  }
  const winner = leftMin > rightMax ? "left" : rightMin > leftMax ? "right" : "overlap";
  const winnerMinimum = winner === "left" ? leftMin : winner === "right" ? rightMin : null;
  const loserMaximum = winner === "left" ? rightMax : winner === "right" ? leftMax : null;
  const guaranteedDifferencePercent = winnerMinimum !== null && loserMaximum > 0 ? ((winnerMinimum / loserMaximum) - 1) * 100 : null;
  return Object.freeze({
    status: winner === "overlap" ? "model_sensitive" : "model_stable",
    winner,
    decisiveWithinModeledSensitivity: winner !== "overlap",
    guaranteedDifferencePercent: guaranteedDifferencePercent === null ? null : guaranteedDifferencePercent.toFixed(4),
  });
}

function branch(id, probability, damage, fixed, precision = "modeled") {
  return Object.freeze({ id, probability: fixed.format(probability), damage: fixed.format(damage), precision });
}

function nonNegative(fixed, value, name) {
  if (value === undefined || value === null || value === "") throw new TypeError(`${name} is required.`);
  const parsed = fixed.from(value);
  if (parsed < 0n) throw new RangeError(`${name} must be non-negative.`);
  return parsed;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
