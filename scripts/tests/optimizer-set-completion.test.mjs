// Set-completion search correction (docs/set-effect-database-review-2026-07-13.md §10).
// Candidate stats are generated with set effects disabled, so partial-set beam
// states used to carry none of the value their completed set unlocks and the
// beam-width cut could discard a strong set route before exact evaluation.
// deriveSetCompletionHints gives each set-bearing candidate an optimistic
// per-piece share of the set's full-completion objective value. This is
// breakpoint-aware pruning that protects set routes, not a global optimality
// guarantee — see the baseline-threshold limitation test below.

import assert from "node:assert/strict";
import test from "node:test";

import { applySetCompletionHints, deriveSetCompletionHints, normalizeRankedGoals, expandCompositeGoals } from "../../web/tl-full-build-adapter.js";
import { optimizeFullBuild } from "../../web/tl-full-build-optimizer.js";

test("completion hints combine structured bonus_stat rows and passive rules per piece", () => {
  // Real registry entry: set_aa_T2_leather_003 (Dawn Mist) 4-piece grants
  // damage_reduction_penetration 70 (decoded aa_leather_T2_003_2, min=max=70).
  const core = {
    indexes: {
      itemSetById: {
        set_aa_T2_leather_003: {
          id: "set_aa_T2_leather_003",
          itemSetBonus: [
            { set_count: 2, bonus_stat: [] },
            { set_count: 4, bonus_stat: [] },
          ],
        },
        "structured-set": {
          id: "structured-set",
          itemSetBonus: [{ set_count: 2, bonus_stat: [{ type: "all_evasion", value: 110 }] }],
        },
      },
    },
  };
  const candidatesBySlot = {
    head: [{ id: "a", setKeys: ["set_aa_T2_leather_003"] }, { id: "b", setKeys: ["structured-set"] }],
  };

  const bonusGoals = expandCompositeGoals(normalizeRankedGoals({ increase: ["damage_reduction_penetration"] }));
  const bonusHints = deriveSetCompletionHints({ core, candidatesBySlot, rankedGoals: bonusGoals, scales: { damage_reduction_penetration: 70 }, baseline: {} });
  // Full completion is worth score 1 (70 / scale 70) across 4 required pieces.
  assert.equal(bonusHints.get("set_aa_T2_leather_003"), 0.25);
  assert.equal(bonusHints.has("structured-set"), false, "sets with no goal-relevant value carry no hint");

  // Structured bonus_stat rows count too, including STAT_EXPANSIONS fan-out
  // (all_evasion -> melee/range/magic_evasion), matching the exact calculator.
  const evasionGoals = expandCompositeGoals(normalizeRankedGoals({ increase: ["melee_evasion"] }));
  const evasionHints = deriveSetCompletionHints({ core, candidatesBySlot, rankedGoals: evasionGoals, scales: { melee_evasion: 110 }, baseline: {} });
  assert.equal(evasionHints.get("structured-set"), 0.5);
});

test("dynamic passive rules project against baseline totals inside the hint", () => {
  // Vanguard Leader 2-piece: floor(per/10)*45 Endurance. With 41 baseline
  // Perception the completed set is worth 180 display = 1800 raw.
  const core = {
    indexes: {
      itemSetById: {
        set_aa_T2_plate_005: {
          id: "set_aa_T2_plate_005",
          itemSetBonus: [{ set_count: 2, bonus_stat: [] }, { set_count: 4, bonus_stat: [] }],
        },
      },
    },
  };
  const goals = expandCompositeGoals(normalizeRankedGoals({ increase: ["melee_critical_defense"] }));
  const hints = deriveSetCompletionHints({
    core,
    candidatesBySlot: { head: [{ id: "a", setKeys: ["set_aa_T2_plate_005"] }] },
    rankedGoals: goals,
    scales: { melee_critical_defense: 1800 },
    baseline: { per: 41 },
  });
  // all_critical_defense 1800 expands to melee_critical_defense 1800 -> score 1 over 4 pieces.
  assert.equal(hints.get("set_aa_T2_plate_005"), 0.25);
});

test("threshold bonuses locked below the baseline attribute carry no hint — the documented pruning limitation", () => {
  // Breakpoint-aware pruning protects set routes; it is NOT a global
  // guarantee. Dynamic rules are projected against BASELINE attributes, so a
  // threshold bonus that only activates once the set's own items raise the
  // final attribute above the threshold contributes zero hint, and that route
  // can still be pruned (the "without hints" branch of the search test below
  // is exactly this shape). Real registry entry: set_aa_leather_003
  // (Resistance Scale) 2-piece grants Cooldown Speed 8% only at Dexterity >= 30.
  const core = {
    indexes: {
      itemSetById: {
        set_aa_leather_003: {
          id: "set_aa_leather_003",
          itemSetBonus: [{ set_count: 2, bonus_stat: [] }, { set_count: 4, bonus_stat: [] }],
        },
      },
    },
  };
  const candidatesBySlot = { head: [{ id: "a", setKeys: ["set_aa_leather_003"] }] };
  const goals = expandCompositeGoals(normalizeRankedGoals({ increase: ["skill_cooldown_modifier"] }));
  const scales = { skill_cooldown_modifier: 800 };

  // Baseline Dexterity 25: set items would push the final value past 30, but
  // the hint only sees the baseline, evaluates the rule to zero, and stays out.
  const below = deriveSetCompletionHints({ core, candidatesBySlot, rankedGoals: goals, scales, baseline: { dex: 25, con: 0 } });
  assert.equal(below.has("set_aa_leather_003"), false, "threshold bonus below baseline is underestimated to zero — known limitation");

  // Baseline Dexterity 30: the same rule contributes and the hint appears.
  const above = deriveSetCompletionHints({ core, candidatesBySlot, rankedGoals: goals, scales, baseline: { dex: 30, con: 0 } });
  assert.equal(above.get("set_aa_leather_003"), 0.25);
});

test("the beam keeps a zero-immediate-value set route only when candidates carry completion hints", async () => {
  // Deterministic reproduction from the 2026-07-13 audit: four slots, each
  // offering a +1 standalone item and a set item worth nothing until all four
  // are equipped, at which point the exact evaluator scores the set route 100.
  const run = async (setHint) => optimizeFullBuild({
    candidatesBySlot: Object.fromEntries(["s1", "s2", "s3", "s4"].map((slot) => [slot, [
      { id: `${slot}-standalone`, selection: { itemId: `${slot}-standalone` }, stats: { power: 1 } },
      { id: `${slot}-set`, selection: { itemId: `${slot}-set` }, stats: {}, setKeys: ["S"], scoreHint: setHint },
    ]])),
    evaluate: (selections, context) => {
      const setPieces = Number(context.setCounts?.S ?? 0);
      const standalone = Object.values(selections).filter((row) => row.itemId.endsWith("standalone")).length;
      const score = setPieces === 4 ? 100 : standalone;
      return { score, stats: { power: score } };
    },
    weights: { power: 1 },
    paretoStats: [],
    beamWidth: 1,
    paretoWidth: 1,
  });

  const withoutHints = await run(0);
  assert.equal(withoutHints.best.evaluation.score, 4, "without hints the beam discards the set route (the audited defect)");

  const withHints = await run(25);
  assert.equal(withHints.best.evaluation.score, 100, "per-piece completion hints keep the set route alive to exact evaluation");
  assert.equal(Object.values(withHints.best.selections).every((row) => row.itemId.endsWith("-set")), true);
});

test("direct candidate stats are not duplicated as score hints", async () => {
  const result = await optimizeFullBuild({
    candidatesBySlot: { head: [
      { id: "direct", selection: { itemId: "direct" }, stats: { power: 6 } },
      { id: "future-value", selection: { itemId: "future-value" }, stats: {}, scoreHint: 10 },
    ] },
    evaluate: (selections) => {
      const score = selections.head.itemId === "future-value" ? 10 : 6;
      return { score, stats: { power: score } };
    },
    weights: { power: 1 },
    paretoStats: [],
    beamWidth: 1,
    paretoWidth: 1,
  });

  assert.equal(result.best.selections.head.itemId, "future-value");
  assert.equal(result.best.evaluation.score, 10);
});

test("set hints are disabled without erasing artifact bundle objective hints", () => {
  const core = {
    indexes: {
      itemSetById: {
        S: { id: "S", itemSetBonus: [{ set_count: 2, bonus_stat: [{ type: "power", value: 100 }] }] },
      },
    },
  };
  const goals = expandCompositeGoals(normalizeRankedGoals({ increase: ["power"] }));
  const candidatesBySlot = {
    head: [{ id: "set-piece", stats: {}, setKeys: ["S"] }],
    artifact_bundle: [{ id: "artifact", scoreHint: 0.75 }],
  };

  const disabled = applySetCompletionHints({ core, candidatesBySlot, rankedGoals: goals, scales: { power: 100 }, includeSetEffects: false });
  assert.equal(disabled.size, 0);
  assert.equal(candidatesBySlot.head[0].scoreHint, 0);
  assert.equal(candidatesBySlot.artifact_bundle[0].scoreHint, 0.75);

  const enabled = applySetCompletionHints({ core, candidatesBySlot, rankedGoals: goals, scales: { power: 100 }, includeSetEffects: true });
  assert.equal(enabled.get("S"), 0.5);
  assert.equal(candidatesBySlot.head[0].scoreHint, 0.5);
  assert.equal(candidatesBySlot.artifact_bundle[0].scoreHint, 0.75);
});
