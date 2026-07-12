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
