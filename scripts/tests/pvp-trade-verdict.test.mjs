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
