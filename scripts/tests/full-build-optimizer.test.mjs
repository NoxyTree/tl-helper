import assert from "node:assert/strict";
import test from "node:test";

import { optimizeFullBuild } from "../../web/optimizer/tl-full-build-optimizer.js";

const evaluate = (build) => {
  const entries = Object.values(build);
  const stats = entries.reduce((sum, entry) => {
    for (const [id, value] of Object.entries(entry.stats ?? {})) sum[id] = (sum[id] ?? 0) + value;
    return sum;
  }, {});
  const sets = entries.flatMap((entry) => entry.setKeys ?? []);
  const setBonus = sets.filter((id) => id === "evasion").length >= 2 ? 110 : 0;
  stats.evasion = (stats.evasion ?? 0) + setBonus;
  return { score: (stats.attack ?? 0) + stats.evasion, stats };
};

test("respects locks, Heroic caps, weapon uniqueness, sets, and protected stats", async () => {
  const candidatesBySlot = {
    main: [
      { id: "staff", selection: { id: "staff", stats: { attack: 20 } }, stats: { attack: 20 }, weaponType: "staff" },
    ],
    off: [
      { id: "staff2", selection: { id: "staff2", stats: { attack: 99 } }, stats: { attack: 99 }, weaponType: "staff" },
      { id: "dagger", selection: { id: "dagger", stats: { attack: 10 } }, stats: { attack: 10 }, weaponType: "dagger" },
    ],
    chest: [
      { id: "locked-set", locked: true, selection: { id: "locked-set", stats: { evasion: 5 }, setKeys: ["evasion"] }, stats: { evasion: 5 }, setKeys: ["evasion"], heroicGroup: "armor" },
      { id: "wrong", selection: { id: "wrong", stats: { attack: 100 } }, stats: { attack: 100 } },
    ],
    head: [
      { id: "set-head", selection: { id: "set-head", stats: {}, setKeys: ["evasion"] }, stats: {}, setKeys: ["evasion"] },
      { id: "hero-head", selection: { id: "hero-head", stats: { attack: 90 } }, stats: { attack: 90 }, heroicGroup: "armor" },
    ],
  };
  const result = await optimizeFullBuild({
    candidatesBySlot, evaluate, lockedSlots: { chest: "locked-set" }, distinctWeaponTypes: true,
    heroicCaps: { armor: 1 }, weights: { attack: 1, evasion: 1 }, protectedStats: { evasion: { min: 100 } }, beamWidth: 50,
  });
  assert.deepEqual(Object.fromEntries(Object.entries(result.best.selections).map(([slot, value]) => [slot, value.id])), {
    chest: "locked-set", head: "set-head", main: "staff", off: "dagger",
  });
});

test("returns deterministic alternatives and carries opaque rune and artifact configurations", async () => {
  const candidatesBySlot = {
    artifact: [
      { id: "b", selection: { id: "b", artifact: { set: "chaos" } }, stats: { attack: 1 } },
      { id: "a", selection: { id: "a", artifact: { set: "abyss" } }, stats: { attack: 1 } },
    ],
    rune_board: [
      { id: "triplicate", selection: { id: "triplicate", runes: ["hit", "hit", "hit"] }, stats: { attack: 1 } },
    ],
  };
  const exact = (build) => ({ score: 2, stats: { attack: 2 }, payload: build });
  const runs = await Promise.all(Array.from({ length: 3 }, () => optimizeFullBuild({
    candidatesBySlot, evaluate: exact, weights: { attack: 1 }, alternativeCount: 2,
  })));
  assert.deepEqual(runs.map((run) => run.alternatives.map((value) => value.selections.artifact.id)), [["a", "b"], ["a", "b"], ["a", "b"]]);
  assert.deepEqual(runs[0].best.selections.rune_board.runes, ["hit", "hit", "hit"]);
});

test("retains a bounded Pareto frontier for linked result tuning", async () => {
  const result = await optimizeFullBuild({
    candidatesBySlot: { head: [
      { id: "guard", selection: { id: "guard" }, stats: { endurance: 100, hit: 10 } },
      { id: "balanced", selection: { id: "balanced" }, stats: { endurance: 70, hit: 70 } },
      { id: "striker", selection: { id: "striker" }, stats: { endurance: 10, hit: 100 } },
      { id: "dominated", selection: { id: "dominated" }, stats: { endurance: 5, hit: 5 } },
    ] },
    weights: { endurance: 1, hit: 0.05 }, paretoStats: ["endurance", "hit"], frontierCount: 8,
    evaluate: (build) => ({ score: build.head.id === "guard" ? 1 : 0, stats: build.head.id === "guard" ? { endurance: 100, hit: 10 } : build.head.id === "balanced" ? { endurance: 70, hit: 70 } : build.head.id === "striker" ? { endurance: 10, hit: 100 } : { endurance: 5, hit: 5 } }),
  });
  assert.deepEqual(result.frontier.map((row) => row.selections.head.id).sort(), ["balanced", "guard", "striker"]);
});

test("beam pruning preserves the strongest candidate for every tuning stat", async () => {
  const result = await optimizeFullBuild({
    candidatesBySlot: { head: [
      { id: "guard", selection: { id: "guard" }, stats: { endurance: 100, cooldown: 0 } },
      { id: "balanced", selection: { id: "balanced" }, stats: { endurance: 99, cooldown: 50 } },
      { id: "haste", selection: { id: "haste" }, stats: { endurance: 0, cooldown: 100 } },
    ] },
    weights: { endurance: 1, cooldown: 0.0001 }, paretoStats: ["endurance", "cooldown"], beamWidth: 2, paretoWidth: 2,
    evaluate: (build) => ({ score: build.head.id === "guard" ? 1 : 0, stats: build.head.id === "guard" ? { endurance: 100, cooldown: 0 } : { endurance: 0, cooldown: 100 } }),
  });
  assert.deepEqual(result.frontier.map((row) => row.selections.head.id).sort(), ["guard", "haste"]);
});

test("dedicated set routes survive a global beam width of one", async () => {
  const candidatesBySlot = Object.fromEntries(["head", "chest"].map((slot) => [slot, [
    { id: `${slot}-direct`, selection: { id: `${slot}-direct` }, stats: { attack: 100 } },
    { id: `${slot}-alpha`, selection: { id: `${slot}-alpha` }, stats: {}, setKeys: ["alpha"] },
    { id: `${slot}-beta`, selection: { id: `${slot}-beta` }, stats: {}, setKeys: ["beta"] },
  ]]));
  const result = await optimizeFullBuild({
    candidatesBySlot,
    setRoutes: [
      { id: "alpha:2", setId: "alpha", minimumPieces: 2, maximumPieces: 2 },
      { id: "beta:2", setId: "beta", minimumPieces: 2, maximumPieces: 2 },
    ],
    beamWidth: 1,
    weights: { attack: 1 },
    evaluate: () => ({ score: 0, stats: {} }),
  });
  assert.equal(result.setRouteMetrics.requested, 2);
  assert.equal(result.setRouteMetrics.represented, 2);
  assert.deepEqual(result.setRouteMetrics.representedRouteIds, ["alpha:2", "beta:2"]);
});

test("set-route reachability respects Heroic caps in future slots", async () => {
  const result = await optimizeFullBuild({
    slotOrder: ["head", "chest", "legs"],
    candidatesBySlot: {
      head: [
        { id: "heroic-blocker", selection: { itemId: "heroic-blocker" }, stats: { attack: 100 }, heroicGroup: "armor" },
        { id: "plain", selection: { itemId: "plain" }, stats: {} },
      ],
      chest: [
        { id: "chest-set", selection: { itemId: "chest-set" }, stats: {}, setKeys: ["S"] },
        { id: "chest-plain", selection: { itemId: "chest-plain" }, stats: { attack: 10 } },
      ],
      legs: [
        { id: "legs-set-heroic", selection: { itemId: "legs-set-heroic" }, stats: {}, setKeys: ["S"], heroicGroup: "armor" },
        { id: "legs-plain", selection: { itemId: "legs-plain" }, stats: { attack: 10 } },
      ],
    },
    setRoutes: [{ id: "S:2", setId: "S", minimumPieces: 2, maximumPieces: 2 }],
    heroicCaps: { armor: 1 },
    routeLegalityMetadataComplete: true,
    beamWidth: 1,
    weights: { attack: 1 },
    evaluate: (_selections, context) => ({ score: Number(context.setCounts.S ?? 0) === 2 ? 1000 : 0, stats: {} }),
  });
  assert.equal(result.setRouteMetrics.represented, 1);
  assert.equal(result.frontier.some((row) => row.setCounts.S === 2), true);
});

test("two-piece and four-piece set bands receive separate exact finalists", async () => {
  const candidatesBySlot = Object.fromEntries(["head", "chest", "hands", "legs"].map((slot) => [slot, [
    { id: `${slot}-neutral`, selection: { id: `${slot}-neutral` }, stats: { attack: 1 } },
    { id: `${slot}-set`, selection: { id: `${slot}-set` }, stats: {}, setKeys: ["tiered"] },
  ]]));
  const result = await optimizeFullBuild({
    candidatesBySlot,
    setRoutes: [
      { id: "tiered:2", setId: "tiered", minimumPieces: 2, maximumPieces: 3 },
      { id: "tiered:4", setId: "tiered", minimumPieces: 4, maximumPieces: 4 },
    ],
    beamWidth: 1,
    weights: { attack: 1 },
    evaluate: () => ({ score: 0, stats: {} }),
  });
  assert.deepEqual(result.setRouteMetrics.representedRouteIds, ["tiered:2", "tiered:4"]);
  assert.ok(result.frontier.some((row) => row.setCounts.tiered >= 2 && row.setCounts.tiered <= 3));
  assert.ok(result.frontier.some((row) => row.setCounts.tiered === 4));
});

test("structurally seeded artifact sets survive a beam width of one", async () => {
  const result = await optimizeFullBuild({
    candidatesBySlot: { artifact_bundle: [
      { id: "direct", selection: { id: "direct" }, stats: { attack: 100 } },
      { id: "complete-set", selection: { id: "complete-set" }, stats: {}, stateKeys: ["artifact-set:6"] },
    ] },
    structuralStateKeys: ["artifact-set:6"],
    beamWidth: 1,
    weights: { attack: 1 },
    evaluate: (selections) => ({
      score: selections.artifact_bundle.id === "complete-set" ? 1000 : 100,
      stats: {},
    }),
  });
  assert.equal(result.best.selections.artifact_bundle.id, "complete-set");
  assert.equal(result.finalists, 2);
});

test("beam scoring does not reward stats beyond an absolute hard cap", async () => {
  const result = await optimizeFullBuild({
    candidatesBySlot: { head: [
      { id: "wasteful", selection: { id: "wasteful" }, stats: { cooldown: 250 }, neutralItemLevel: 1 },
      { id: "capped", selection: { id: "capped" }, stats: { cooldown: 200 }, neutralItemLevel: 80 },
    ] },
    weights: { cooldown: 1 }, statCaps: { cooldown: 200 }, paretoStats: ["cooldown"], beamWidth: 1,
    evaluate: () => ({ score: 200, stats: { cooldown: 200 } }),
  });
  assert.equal(result.best.selections.head.id, "capped");
});

test("supports progress and cancellation", async () => {
  const controller = new AbortController();
  const progress = [];
  await assert.rejects(() => optimizeFullBuild({
    candidatesBySlot: { a: [{ id: "1" }], b: [{ id: "2" }] },
    evaluate: () => ({ score: 0, stats: {} }), signal: controller.signal,
    onProgress(value) { progress.push(value); if (value.phase === "search") controller.abort(); },
  }), { name: "AbortError" });
  assert.equal(progress[0].phase, "search");
});

test("batched finalist evaluation is byte-for-byte equivalent and merged in beam order", async () => {
  const candidatesBySlot = {
    head: [
      { id: "a", selection: { id: "a" }, stats: { attack: 1 } },
      { id: "b", selection: { id: "b" }, stats: { attack: 4 } },
      { id: "c", selection: { id: "c" }, stats: { attack: 2 } },
    ],
    chest: [
      { id: "x", selection: { id: "x" }, stats: { attack: 3 } },
      { id: "y", selection: { id: "y" }, stats: { attack: 0 } },
    ],
  };
  const evaluateEntry = ({ selections }) => {
    const attack = (selections.head.id === "a" ? 1 : selections.head.id === "b" ? 4 : 2)
      + (selections.chest.id === "x" ? 3 : 0);
    return { score: attack, stats: { attack } };
  };
  const sequential = await optimizeFullBuild({
    candidatesBySlot,
    weights: { attack: 1 },
    paretoStats: ["attack"],
    alternativeCount: 4,
    frontierCount: 6,
    evaluate: (selections) => evaluateEntry({ selections }),
  });
  let batchCalls = 0;
  let singleCalls = 0;
  const batched = await optimizeFullBuild({
    candidatesBySlot,
    weights: { attack: 1 },
    paretoStats: ["attack"],
    alternativeCount: 4,
    frontierCount: 6,
    evaluate: () => { singleCalls += 1; throw new Error("single evaluator should not run"); },
    evaluateBatch: async (entries, { onProgress }) => {
      batchCalls += 1;
      const indexed = await Promise.all(entries.map(async (entry, index) => {
        await new Promise((resolve) => setTimeout(resolve, (entries.length - index) % 3));
        onProgress({ completed: index + 1, total: entries.length, workerCount: 3, mode: "parallel" });
        return evaluateEntry(entry);
      }));
      return indexed;
    },
  });
  assert.equal(batchCalls, 1);
  assert.equal(singleCalls, 0);
  assert.deepEqual(batched, sequential);
});

test("batched finalist evaluation rejects incomplete result vectors", async () => {
  await assert.rejects(() => optimizeFullBuild({
    candidatesBySlot: { head: [{ id: "a" }, { id: "b" }] },
    evaluate: () => ({ score: 0, stats: {} }),
    evaluateBatch: async () => [{ score: 0, stats: {} }],
  }), /returned 1 result\(s\) for 2 finalist\(s\)/);
});

test("exact selected-goal score always beats the neutral fallback", async () => {
  const result = await optimizeFullBuild({
    candidatesBySlot: { head: [
      { id: "meaningful", selection: { id: "meaningful" }, stats: { goal: 1 }, scoreHint: 1, neutralItemLevel: 1, neutralGrade: 1 },
      { id: "neutral-high", selection: { id: "neutral-high" }, stats: {}, scoreHint: 0, neutralItemLevel: 99, neutralGrade: 99 },
    ] }, weights: { goal: 1 }, evaluate: (build) => ({ score: build.head.id === "meaningful" ? 1 : 0, stats: {} }),
  });
  assert.equal(result.best.selections.head.id, "meaningful");
});

test("neutral fallback conserves Heroics then prefers level, grade, and deterministic ID", async () => {
  const candidatesBySlot = { head: [
    { id: "heroic", selection: { id: "heroic" }, stats: {}, heroicGroup: "armor", neutralHeroicCost: 1, neutralItemLevel: 100, neutralGrade: 51 },
    { id: "low", selection: { id: "low" }, stats: {}, neutralItemLevel: 10, neutralGrade: 41 },
    { id: "z-best", selection: { id: "z-best" }, stats: {}, neutralItemLevel: 80, neutralGrade: 41 },
    { id: "a-best", selection: { id: "a-best" }, stats: {}, neutralItemLevel: 80, neutralGrade: 41 },
  ] };
  const runs = await Promise.all(Array.from({ length: 3 }, () => optimizeFullBuild({ candidatesBySlot, evaluate: () => ({ score: 0, stats: {} }) })));
  assert.deepEqual(runs.map((row) => row.best.selections.head.id), ["a-best", "a-best", "a-best"]);
});

test("goal-minimum targets reserve floor-capable states through beam pruning", async () => {
  // One slot, four candidates: X dominates the maximize objective (attack),
  // A and B are single-floor extremes, C alone covers both floors jointly.
  // With beamWidth 1 the per-dimension diversity pass retains only X, so
  // without minimum targets no frontier state can satisfy the floors -- the
  // exact failure observed with the PvP Evasion preset. Minimum targets must
  // reserve C (the lowest joint shortfall) into the beam and frontier.
  const candidatesBySlot = { slot: [
    { id: "x", selection: { id: "x", stats: { attack: 100 } }, stats: { attack: 100 } },
    { id: "a", selection: { id: "a", stats: { acc: 100 } }, stats: { acc: 100 } },
    { id: "b", selection: { id: "b", stats: { heavy: 100 } }, stats: { heavy: 100 } },
    { id: "c", selection: { id: "c", stats: { acc: 60, heavy: 60 } }, stats: { acc: 60, heavy: 60 } },
  ] };
  const evaluate = (build) => {
    const stats = Object.values(build).reduce((sum, entry) => {
      for (const [id, value] of Object.entries(entry.stats ?? {})) sum[id] = (sum[id] ?? 0) + value;
      return sum;
    }, {});
    return { score: stats.attack ?? 0, stats };
  };
  const base = {
    candidatesBySlot, evaluate, weights: { attack: 1 },
    paretoStats: ["attack", "acc", "heavy"], beamWidth: 1, paretoWidth: 3,
  };
  const meetsFloors = (result) => (result.evaluation.stats.acc ?? 0) >= 50 && (result.evaluation.stats.heavy ?? 0) >= 50;

  const unaware = await optimizeFullBuild(base);
  assert.equal(unaware.frontier.some(meetsFloors), false, "beamWidth 1 must prune the joint-floor state when no targets are declared");

  const aware = await optimizeFullBuild({ ...base, minimumTargets: [
    { id: "acc", components: ["acc"], minimum: 50 },
    { id: "heavy", components: ["heavy"], minimum: 50 },
  ] });
  assert.equal(aware.frontier.some(meetsFloors), true, "minimum targets must carry a joint-floor state into the frontier");
  assert.equal(aware.best.selections.slot.id, unaware.best.selections.slot.id, "reservation is additive and must not change the unconstrained best result");
});
