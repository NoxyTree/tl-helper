import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  COMBAT_LAB_MANUAL_SKILL_LEVEL_MAX,
  loadCombatLabData,
  mapDisplayedLevel,
  projectAbilityRange,
  resolveCombatLabBuildContext,
  resolveCombatLabHealing,
  resolveCustomExpectedPvpDamage,
  resolveExpectedPvpDamage,
  resolveKitPacketExpectedPvpDamage,
  resolveKitPacketSelection,
  resolvePvpMatchup,
  TIER_MAPPINGS,
} from "../../web/combat-lab-model.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const artifact = JSON.parse(readFileSync(path.join(REPO_ROOT, "web", "data", "combat-abilities.json"), "utf8"));
const data = loadCombatLabData(artifact);

test("Combat Lab maps only the observed rarity windows", () => {
  assert.equal(mapDisplayedLevel("epic", 1).globalSkillLevel, 11);
  assert.equal(mapDisplayedLevel("heroic", 5).globalSkillLevel, 20);
  assert.throws(() => mapDisplayedLevel("rare", 1), /Unsupported or uncalibrated/);
});

test("Combat Lab manual release levels stop at 20 while decoded level 21 remains projectable", () => {
  const globalTier = TIER_MAPPINGS.find(({ id }) => id === "global");
  assert.equal(COMBAT_LAB_MANUAL_SKILL_LEVEL_MAX, 20);
  assert.equal(globalTier.maximum, 20);
  assert.equal(mapDisplayedLevel("global", 20).globalSkillLevel, 20);
  assert.equal(mapDisplayedLevel("global", 21).globalSkillLevel, 21);
  const ability = data.abilities.find(({ id }) => id === "judgment-lightning");
  const ascendedProjection = projectAbilityRange({
    ability,
    componentId: "first-cast-per-hit-damage",
    globalLevel: 21,
    minimum: "399",
    maximum: "640",
    outcomeId: "coefficient_only",
  });
  assert.equal(ascendedProjection.globalLevel, 21);
});

test("Combat Lab accepts only the explicit Item Potential exclusion context", () => {
  const context = resolveCombatLabBuildContext({ calculationContext: { itemPotentials: "excluded" } });
  assert.deepEqual(context, { itemPotentials: "excluded" });
  assert.ok(Object.isFrozen(context));
  assert.throws(() => resolveCombatLabBuildContext({ calculationContext: {} }), /explicitly excludes Item Potentials/);
  assert.throws(() => resolveCombatLabBuildContext({ calculationContext: { itemPotentials: "included" } }), /explicitly excludes Item Potentials/);
});

test("Combat Lab resolves a capped PvP matchup without claiming final damage", () => {
  const result = resolvePvpMatchup({
    pvpMode: "general", attackType: "melee",
    hit: "3000", evasion: "2800",
    criticalHit: "1500", endurance: "500",
    heavyAttackChance: "800", heavyAttackEvasion: "400",
    skillDamageBoost: "500", skillDamageResistance: "300",
  });
  assert.equal(result.hitChance, "1");
  assert.equal(result.criticalChance, "0.5");
  assert.equal(result.heavyChance, "0.285714");
  assert.equal(result.skillDamageMultiplier, "1.166666");
  assert.equal(result.status, "modeled");
});

test("Combat Lab projects a saved-build Base Damage range without resolving outcomes", () => {
  const ability = data.abilities.find(({ id }) => id === "judgment-lightning");
  const shared = {
    ability,
    componentId: "first-cast-per-hit-damage",
    globalLevel: 11,
    minimum: "399",
    maximum: "640",
  };
  const coefficientOnly = projectAbilityRange({ ...shared, outcomeId: "coefficient_only" });
  const heavy = projectAbilityRange({ ...shared, outcomeId: "heavy_attack" });

  assert.deepEqual(coefficientOnly.result, {
    minimum: "3692.6",
    maximum: "5717",
    stage: "pre_resolution",
    semantic: "tooltip_coefficient_projection",
  });
  assert.deepEqual(heavy.result, coefficientOnly.result);
  assert.equal(heavy.outcome.applied, false);
  assert.equal(heavy.completeness.isFinalCombatOutcome, false);
  assert.equal(heavy.precision.coefficientBasis, "verified_exact");
  assert.equal(heavy.traces.length, 2);
});

test("Combat Lab composes a reviewed damage component into a modeled pre-Defense expectation", () => {
  const ability = data.abilities.find(({ id }) => id === "judgment-lightning");
  const result = resolveExpectedPvpDamage({
    ability,
    componentId: "first-cast-per-hit-damage",
    globalLevel: 11,
    minimum: "399",
    maximum: "640",
    pvpMode: "general",
    attackType: "magic",
    hit: "1500",
    evasion: "1000",
    criticalHit: "1500",
    endurance: "1000",
    heavyAttackChance: "800",
    heavyAttackEvasion: "300",
    skillDamageBoost: "500",
    skillDamageResistance: "200",
    criticalDamage: "40",
    criticalDamageResistance: "10",
    heavyDamage: "30",
    heavyDamageResistance: "10",
  });
  assert.equal(result.status, "modeled");
  assert.equal(result.abilityProjection.result.minimum, "3692.6");
  assert.equal(result.completeness.isFinalCombatOutcome, false);
  assert.ok(Number(result.expectedDamage) > 0);
  assert.ok(Number(result.sensitivityInterval.maximum) >= Number(result.sensitivityInterval.minimum));
});

test("Combat Lab supports a provenance-labeled generic 100 percent weapon packet", () => {
  const result = resolveCustomExpectedPvpDamage({
    minimum: "400", maximum: "700", pvpMode: "general", attackType: "melee",
    hit: "1200", evasion: "1000", criticalHit: "1500", endurance: "1000",
    heavyAttackChance: "700", heavyAttackEvasion: "300", skillDamageBoost: "500",
    skillDamageResistance: "200", criticalDamage: "35", criticalDamageResistance: "10",
    heavyDamage: "25", heavyDamageResistance: "10",
  });
  assert.equal(result.preResolutionRange.minimum, "400");
  assert.equal(result.precision.coefficientRange, "modeled_user_input_100_percent_weapon_packet");
  assert.equal(result.completeness.isFinalCombatOutcome, false);
});

const kitPacket = Object.freeze({
  name: "Test Strike",
  weapon: "sword",
  mappingClass: "exact",
  levels: {
    "1": { coefficient: "2.0000", flatAdd: "10", cooldown: 12 },
    "5": { coefficient: "2.5000", flatAdd: "50", cooldown: 12 },
  },
  traitOverrides: {
    "trait-a": {
      name: "Test Strike - Variant",
      mappingClass: "derived",
      levels: { "5": { coefficient: "3.0000", flatAdd: "60" } },
    },
    "trait-b": {
      name: "Test Strike - Other Variant",
      mappingClass: "derived",
      levels: { "1": { coefficient: "2.2000", flatAdd: "12" } },
    },
  },
  unverifiedDamageTraits: ["trait-c"],
});

test("Kit packet selection applies the honest-level rule without substituting higher levels", () => {
  assert.equal(resolveKitPacketSelection({ packet: { ...kitPacket, levels: { "5": kitPacket.levels["5"] } }, skillLevel: 4 }), null);
  const clamped = resolveKitPacketSelection({ packet: kitPacket, skillLevel: 4 });
  assert.equal(clamped.packetLevel, 1);
  assert.equal(clamped.coefficient, "2.0000");
  assert.equal(clamped.mappingClass, "exact");
  assert.equal(clamped.specApplied, null);
  assert.equal(clamped.specUnverified, false);
});

test("Kit packet selection replaces the primary hit only for one validated override", () => {
  const applied = resolveKitPacketSelection({ packet: kitPacket, skillLevel: 5, specializationIds: ["trait-a"] });
  assert.equal(applied.coefficient, "3.0000");
  assert.equal(applied.flatAdd, "60");
  assert.equal(applied.cooldown, 12);
  assert.equal(applied.mappingClass, "derived");
  assert.equal(applied.specApplied, "Test Strike - Variant");
  assert.equal(applied.specUnverified, false);

  const belowOverride = resolveKitPacketSelection({ packet: kitPacket, skillLevel: 4, specializationIds: ["trait-a"] });
  assert.equal(belowOverride.coefficient, "2.0000");
  assert.equal(belowOverride.specApplied, null);
  assert.equal(belowOverride.specUnverified, true);

  const ambiguous = resolveKitPacketSelection({ packet: kitPacket, skillLevel: 5, specializationIds: ["trait-a", "trait-b"] });
  assert.equal(ambiguous.coefficient, "2.5000");
  assert.equal(ambiguous.specApplied, null);
  assert.equal(ambiguous.specUnverified, true);

  const unverified = resolveKitPacketSelection({ packet: kitPacket, skillLevel: 5, specializationIds: ["trait-c"] });
  assert.equal(unverified.coefficient, "2.5000");
  assert.equal(unverified.specUnverified, true);

  // An applied override must not hide a co-selected damage-relevant
  // specialization that still has no validated model.
  const overrideWithUnverified = resolveKitPacketSelection({ packet: kitPacket, skillLevel: 5, specializationIds: ["trait-a", "trait-c"] });
  assert.equal(overrideWithUnverified.specApplied, "Test Strike - Variant");
  assert.equal(overrideWithUnverified.coefficient, "3.0000");
  assert.equal(overrideWithUnverified.specUnverified, true);
});

test("Kit packet expected damage scales the primary hit into the modeled pre-Defense pipeline", () => {
  const contest = {
    pvpMode: "general", attackType: "melee",
    hit: "1200", evasion: "1000", criticalHit: "1500", endurance: "1000",
    heavyAttackChance: "700", heavyAttackEvasion: "300", skillDamageBoost: "500",
    skillDamageResistance: "200", criticalDamage: "35", criticalDamageResistance: "10",
    heavyDamage: "25", heavyDamageResistance: "10",
  };
  const result = resolveKitPacketExpectedPvpDamage({
    ...contest, minimum: "400", maximum: "700",
    coefficient: "2.5000", flatAdd: "50", mappingClass: "exact",
  });
  assert.equal(result.preResolutionRange.minimum, "1050");
  assert.equal(result.preResolutionRange.maximum, "1800");
  assert.equal(result.precision.coefficientRange, "kit_packet_exact_primary_component");
  assert.equal(result.completeness.isFinalCombatOutcome, false);
  const generic = resolveCustomExpectedPvpDamage({ ...contest, minimum: "1050", maximum: "1800" });
  assert.equal(result.expectedDamage, generic.expectedDamage);
  assert.throws(() => resolveKitPacketExpectedPvpDamage({ ...contest, minimum: "400", maximum: "700", coefficient: "-1", flatAdd: "0" }), /non-negative/);
});

test("Combat Lab keeps Distortion Veil shield magnitude explicitly non-final", () => {
  const ability = data.abilities.find(({ id }) => id === "distortion-veil");
  const result = projectAbilityRange({
    ability,
    componentId: "shield-health",
    globalLevel: 16,
    minimum: "379",
    maximum: "1023",
    outcomeId: "coefficient_only",
  });
  assert.equal(result.completeness.isFinalCombatOutcome, false);
  assert.ok(result.warnings.some((warning) => warning.includes("must not be treated as shield capacity")));
});

test("Combat Lab requires explicit modeled opt-in for healing", () => {
  const ability = data.abilities.find(({ id }) => id === "swift-healing");
  const result = resolveCombatLabHealing({
    ability,
    globalLevel: 11,
    castComponent: "first",
    minimum: "366",
    maximum: "993",
    outcomeId: "normal",
    outgoingHealingPercent: "0",
    healingReceivedPercent: "4.2",
    skillDamageBoost: "713.7",
    allowModeledHealing: false,
  });
  assert.equal(result.status, "unsupported");
  assert.equal(result.modeledRange, undefined);
  assert.equal(result.completeness.isFinalHealingOutcome, false);
});

test("Combat Lab exposes modeled healing and video-verified Heavy applications without an expected value", () => {
  const ability = data.abilities.find(({ id }) => id === "swift-healing");
  const result = resolveCombatLabHealing({
    ability,
    globalLevel: 11,
    castComponent: "first",
    minimum: "366",
    maximum: "993",
    outcomeId: "heavy",
    outgoingHealingPercent: "0",
    healingReceivedPercent: "4.2",
    skillDamageBoost: "713.7",
    allowModeledHealing: true,
  });
  assert.equal(result.status, "modeled");
  assert.deepEqual(result.modeledRange.perApplication, { minimum: "2221", maximum: "4324" });
  assert.deepEqual(result.modeledRange.totalApplied, { minimum: "4442", maximum: "8648" });
  assert.equal(result.applications.count, 2);
  assert.equal(result.applications.precision, "verified_exact");
  assert.equal(result.expectedValue, undefined);
  assert.equal(result.precision.overall, "modeled");
  assert.equal(result.completeness.isFinalHealingOutcome, false);
});
