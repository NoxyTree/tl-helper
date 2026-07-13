import assert from "node:assert/strict";
import test from "node:test";

import { optimizeFullBuild } from "../../web/tl-full-build-optimizer.js";

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
