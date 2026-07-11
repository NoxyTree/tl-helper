import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  loadCombatLabData,
  mapDisplayedLevel,
  projectAbilityRange,
  resolveCombatLabHealing,
} from "../../web/combat-lab-model.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const artifact = JSON.parse(readFileSync(path.join(REPO_ROOT, "web", "data", "combat-abilities.json"), "utf8"));
const data = loadCombatLabData(artifact);

test("Combat Lab maps only the observed rarity windows", () => {
  assert.equal(mapDisplayedLevel("epic", 1).globalSkillLevel, 11);
  assert.equal(mapDisplayedLevel("heroic", 5).globalSkillLevel, 20);
  assert.throws(() => mapDisplayedLevel("rare", 1), /Unsupported or uncalibrated/);
});

test("Combat Lab projects a saved-build Base Damage range without resolving outcomes", () => {
  const ability = data.abilities.find(({ id }) => id === "gaia-crash");
  const shared = {
    ability,
    componentId: "primary-damage",
    globalLevel: 11,
    minimum: "399",
    maximum: "640",
  };
  const coefficientOnly = projectAbilityRange({ ...shared, outcomeId: "coefficient_only" });
  const heavy = projectAbilityRange({ ...shared, outcomeId: "heavy_attack" });

  assert.deepEqual(coefficientOnly.result, {
    minimum: "1204.15",
    maximum: "1891",
    stage: "pre_resolution",
    semantic: "tooltip_coefficient_projection",
  });
  assert.deepEqual(heavy.result, coefficientOnly.result);
  assert.equal(heavy.outcome.applied, false);
  assert.equal(heavy.completeness.isFinalCombatOutcome, false);
  assert.equal(heavy.precision.coefficientBasis, "verified_exact");
  assert.equal(heavy.traces.length, 2);
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
