// Request-level set-effect controls (rules.sets): require a set, a minimum
// number of active set bonuses, forbid breaking sets, and a soft prefer bias.
// The controls are additive — absent rules.sets leaves the search untouched
// (guarded by the whole optimizer-set-completion suite). Here we prove the
// beam-level filter and tie-break behave, plus the setEffectSummary reader.
import assert from "node:assert/strict";
import test from "node:test";

import { setEffectSummary } from "../../web/optimizer/tl-full-build-adapter.js";
import { optimizeFullBuild } from "../../web/optimizer/tl-full-build-optimizer.js";

test("setEffectSummary counts active bonuses and flags partial (broken) sets", () => {
  const calc = { setEffects: { sets: [
    { setId: "A", equippedPieces: 4, breakpoints: [{ required: 2, active: true, status: "applied" }, { required: 4, active: true, status: "applied" }] },
    { setId: "B", equippedPieces: 2, breakpoints: [{ required: 2, active: true, status: "excluded" }] }, // excluded ⇒ not counted
    { setId: "C", equippedPieces: 1, breakpoints: [{ required: 2, active: false, status: "inactive" }] }, // partial ⇒ broken
    { setId: "D", equippedPieces: 0, breakpoints: [{ required: 2, active: false, status: "inactive" }] }, // unequipped ⇒ neither
  ] } };
  const summary = setEffectSummary(calc);
  assert.equal(summary.activeBonusCount, 2, "two active, non-excluded breakpoints on A");
  assert.deepEqual(summary.activeSetIds, ["A"]);
  assert.deepEqual(summary.partialSetIds, ["C"], "B is excluded (not partial); D has no pieces");
});

// Two slots; each offers a standalone item (worth 10) or a set piece that only
// activates the set 'S' when both are equipped, adding `bonus`.
const run = (options = {}, bonus = 5) => optimizeFullBuild({
  candidatesBySlot: Object.fromEntries(["s1", "s2"].map((slot) => [slot, [
    { id: `${slot}-alone`, selection: { itemId: `${slot}-alone` }, stats: { power: 10 } },
    { id: `${slot}-set`, selection: { itemId: `${slot}-set` }, stats: {}, setKeys: ["S"] },
  ]])),
  evaluate: (selections, context) => {
    const setPieces = Number(context.setCounts?.S ?? 0);
    const standalone = Object.values(selections).filter((row) => row.itemId.endsWith("-alone")).length;
    const score = standalone * 10 + (setPieces === 2 ? bonus : 0);
    const setSummary = setPieces === 2
      ? { activeBonusCount: 1, activeSetIds: ["S"], partialSetIds: [] }
      : setPieces === 1
        ? { activeBonusCount: 0, activeSetIds: [], partialSetIds: ["S"] }
        : { activeBonusCount: 0, activeSetIds: [], partialSetIds: [] };
    return { score, stats: { power: score }, setSummary };
  },
  weights: { power: 1 },
  paretoStats: [],
  beamWidth: 8,
  paretoWidth: 8,
  ...options,
});

test("no set controls ⇒ the highest score wins even if it uses no set", async () => {
  const result = await run();
  assert.equal(result.best.evaluation.score, 20, "two standalone items outscore the weak set");
  assert.equal(result.best.evaluation.setSummary.activeBonusCount, 0);
});

test("minimumActiveBonuses forces a build with an active set bonus", async () => {
  const statRejects = [];
  const setRejects = [];
  const result = await run({
    setConstraints: { minimumActiveBonuses: 1 },
    onConstraintRejection: (stats) => statRejects.push(stats),
    onSetConstraintRejection: (summary) => setRejects.push(summary),
  });
  assert.equal(result.best.evaluation.setSummary.activeBonusCount, 1);
  assert.equal(Object.values(result.best.selections).every((row) => row.itemId.endsWith("-set")), true);
  // Set failures are reported through the dedicated set channel, NOT the stat one,
  // so an infeasible set rule is not misattributed to stat floors.
  assert.equal(statRejects.length, 0, "set failures do not fire the stat-constraint hook");
  assert.ok(setRejects.length > 0, "set-less builds fire the set-constraint hook");
  assert.ok(setRejects.every((summary) => summary && summary.activeBonusCount === 0));
});

test("require forces a specific set to be active", async () => {
  const result = await run({ setConstraints: { require: "S" } });
  assert.deepEqual(result.best.evaluation.setSummary.activeSetIds, ["S"]);
  // an unsatisfiable requirement yields no accepted build
  const impossible = await run({ setConstraints: { require: "does_not_exist" } });
  assert.equal(impossible.best, null);
});

test("allowBreaking:false rejects partial sets but allows using no set at all", async () => {
  const result = await run({ setConstraints: { allowBreaking: false } });
  // best avoids the set entirely (score 20) rather than a 1-piece broken set
  assert.equal(result.best.evaluation.score, 20);
  assert.deepEqual(result.best.evaluation.setSummary.partialSetIds, []);
  // every accepted build is free of partial sets
  for (const candidate of result.frontier) assert.deepEqual(candidate.evaluation.setSummary.partialSetIds, []);
});

test("prefer breaks ties toward more active set bonuses without changing the score", async () => {
  // bonus 20 makes the full set tie the two-standalone build at score 20.
  const neutral = await run({}, 20);
  const preferred = await run({ preferSets: true }, 20);
  assert.equal(neutral.best.evaluation.score, 20);
  assert.equal(preferred.best.evaluation.score, 20, "prefer never sacrifices score");
  assert.equal(preferred.best.evaluation.setSummary.activeBonusCount, 1, "the tie resolves toward the set");
});
