import assert from "node:assert/strict";
import test from "node:test";

import {
  modelExpectedPvpDamage,
  modelPvpTradeVerdict,
  TRADE_VERDICT_BANDS,
} from "../../packages/combat-engine/src/index.mjs";

const attacker = (overrides = {}) => modelExpectedPvpDamage({
  preResolutionMinimum: "1000",
  preResolutionMaximum: "1400",
  pvpMode: "general",
  hit: "3000",
  evasion: "1000",
  criticalHit: "2500",
  endurance: "1500",
  heavyAttackChance: "2000",
  heavyAttackEvasion: "800",
  skillDamageBoost: "600",
  skillDamageResistance: "300",
  criticalDamage: "60",
  criticalDamageResistance: "10",
  heavyDamage: "80",
  heavyDamageResistance: "20",
  ...overrides,
});

test("identical builds with identical health are even and symmetric", () => {
  const expected = attacker();
  const verdict = modelPvpTradeVerdict({
    source: { expected, maxHp: 50000 },
    target: { expected, maxHp: 50000 },
  });
  assert.equal(verdict.winner, "even");
  assert.equal(verdict.verdictBand, "even");
  assert.equal(verdict.tradeRatio, "1.0000");
  assert.equal(verdict.status, "modeled");
  assert.equal(
    verdict.pressures.source.perSwingPercentOfOpponentHp,
    verdict.pressures.target.perSwingPercentOfOpponentHp,
  );
});

test("a much larger health pool wins the race with unchanged damage", () => {
  const expected = attacker();
  const verdict = modelPvpTradeVerdict({
    source: { expected, maxHp: 80000 },
    target: { expected, maxHp: 50000 },
  });
  // Source has 60% more HP, so target's pressure on source is lower.
  assert.equal(verdict.winner, "source");
  assert.equal(verdict.verdictBand, "decisive");
  assert.ok(Number(verdict.advantagePercent) > 15);
  assert.equal(verdict.stableWithinModeledSensitivity, true);
  assert.ok(Number(verdict.guaranteedAdvantagePercent) > 0);
});

test("the verdict is antisymmetric when the sides swap", () => {
  const strong = attacker();
  const weak = attacker({ hit: "1200", criticalHit: "1200", heavyAttackChance: "600" });
  const forward = modelPvpTradeVerdict({
    source: { expected: strong, maxHp: 50000 },
    target: { expected: weak, maxHp: 50000 },
  });
  const reversed = modelPvpTradeVerdict({
    source: { expected: weak, maxHp: 50000 },
    target: { expected: strong, maxHp: 50000 },
  });
  assert.equal(forward.winner, "source");
  assert.equal(reversed.winner, "target");
  assert.equal(forward.verdictBand, reversed.verdictBand);
  assert.equal(forward.advantagePercent, reversed.advantagePercent);
});

test("a marginal edge lands in the favored band, not decisive", () => {
  const expected = attacker();
  const verdict = modelPvpTradeVerdict({
    source: { expected, maxHp: 54000 },
    target: { expected, maxHp: 50000 },
  });
  assert.equal(verdict.winner, "source");
  assert.equal(verdict.verdictBand, "favored");
  assert.ok(Number(verdict.advantagePercent) < (TRADE_VERDICT_BANDS.decisive - 1) * 100);
});

test("two builds with zero modeled pressure are even, not a fake decisive win", () => {
  const harmless = attacker({ preResolutionMinimum: "0", preResolutionMaximum: "0" });
  const verdict = modelPvpTradeVerdict({
    source: { expected: harmless, maxHp: 50000 },
    target: { expected: harmless, maxHp: 60000 },
  });
  assert.equal(verdict.winner, "even");
  assert.equal(verdict.verdictBand, "even");
  assert.equal(verdict.tradeRatio, "1.0000");
  assert.equal(verdict.advantagePercent, "0.0");
  assert.equal(verdict.guaranteedAdvantagePercent, null);
  assert.equal(verdict.pressures.source.perSwingPercentOfOpponentHp, "0.00");
  assert.equal(verdict.pressures.target.perSwingPercentOfOpponentHp, "0.00");
});

test("a one-sided race stays a win with coherent null advantage fields", () => {
  const verdict = modelPvpTradeVerdict({
    source: { expected: attacker(), maxHp: 50000 },
    target: { expected: attacker({ preResolutionMinimum: "0", preResolutionMaximum: "0" }), maxHp: 50000 },
  });
  assert.equal(verdict.winner, "source");
  assert.equal(verdict.verdictBand, "decisive");
  assert.equal(verdict.advantagePercent, null);
  assert.equal(verdict.tradeRatio, null);
  assert.equal(verdict.stableWithinModeledSensitivity, true);
});

test("decimal-string inputs resolve through the full verdict pipeline", () => {
  // The UI feeds snapshot-derived values with one decimal (ratings are
  // rating/10, weapon damage can resolve fractional); the fixed-point boundary
  // must accept them as decimal strings.
  const fractional = attacker({
    preResolutionMinimum: "1000.5",
    preResolutionMaximum: "1400.5",
    hit: "300.5",
    evasion: "120.5",
    criticalHit: "250.1",
    endurance: "150.9",
    heavyAttackChance: "200.3",
    heavyAttackEvasion: "80.7",
    skillDamageBoost: "60.5",
    skillDamageResistance: "30.5",
  });
  assert.equal(fractional.status, "modeled");
  assert.ok(Number(fractional.expectedDamage) > 0);
  const verdict = modelPvpTradeVerdict({
    source: { expected: fractional, maxHp: 50000 },
    target: { expected: attacker(), maxHp: 50000 },
  });
  assert.equal(verdict.status, "modeled");
  assert.ok(verdict.tradeRatio !== null);
});

test("missing health or malformed expected results are rejected", () => {
  const expected = attacker();
  assert.throws(() => modelPvpTradeVerdict({ source: { expected, maxHp: 0 }, target: { expected, maxHp: 50000 } }), TypeError);
  assert.throws(() => modelPvpTradeVerdict({ source: { expected, maxHp: 50000 }, target: { expected: {}, maxHp: 50000 } }), TypeError);
  assert.throws(() => modelPvpTradeVerdict(), TypeError);
});

test("the verdict carries modeled provenance and merged unsupported stages", () => {
  const expected = attacker();
  const verdict = modelPvpTradeVerdict({
    source: { expected, maxHp: 50000 },
    target: { expected, maxHp: 50000 },
  });
  assert.equal(verdict.schema, "tl-helper.pvp-trade-verdict");
  assert.equal(verdict.completeness.isFinalCombatOutcome, false);
  assert.ok(verdict.unsupportedStages.includes("Defense and its current-level constant"));
  assert.ok(verdict.assumptions.some((text) => text.includes("cadence")));
  assert.ok(Object.isFrozen(verdict) && Object.isFrozen(verdict.pressures));
});
