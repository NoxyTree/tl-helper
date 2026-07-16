import assert from "node:assert/strict";
import test from "node:test";

import { optimizeHeroicPotential } from "../../web/tl-heroic-potential.js";

const effect = (statId, values = [1, 2, 3]) => ({ stat_id: statId, levels: values, max_level: values.length - 1 });
const baseItem = {
  id: "heroic-test",
  itemStats: {
    traits: { zeta: [1, 2], alpha: [1, 2, 3], beta: [1], gamma: [1, 2] },
    uniqueTraits: { unique_b: [1, 2], unique_a: [1, 2, 3] },
    random_stat_group_1: [effect("effect_b"), effect("effect_a", [4, 8])],
    random_stat_group_2: [effect("effect_b"), effect("effect_c")],
  },
};

const weights = {
  alpha: 10, beta: 4, gamma: 3, zeta: 1,
  unique_a: 12, unique_b: 2,
  effect_a: 8, effect_b: 9, effect_c: 3,
};
function evaluate(selection) {
  const all = [...selection.traits, ...(selection.uniqueTrait ? [selection.uniqueTrait] : []), ...selection.heroicEffects];
  return { score: all.reduce((sum, row) => sum + (weights[row.statId] ?? 0), 0), protectionHeadroom: 5 };
}

test("selects exactly three distinct max-tier traits and one max-tier Heroic trait", () => {
  const result = optimizeHeroicPotential(baseItem, { evaluate });
  assert.deepEqual(result.selection.traits, [
    { statId: "alpha", tier: 3 },
    { statId: "beta", tier: 1 },
    { statId: "gamma", tier: 2 },
  ]);
  assert.equal(new Set(result.selection.traits.map((row) => row.statId)).size, 3);
  assert.deepEqual(result.selection.uniqueTrait, { statId: "unique_a", tier: 3 });
  assert.deepEqual(result.selection.resonance, []);
  assert.deepEqual(result.selection.runes, []);
});

test("fills all dynamic effect groups at maximum level and supports three groups", () => {
  const item = structuredClone(baseItem);
  item.itemStats.random_stat_group_3 = [effect("effect_d", [2, 5, 9, 12])];
  weights.effect_d = 20;
  const result = optimizeHeroicPotential(item, { evaluate });
  assert.equal(result.selection.heroicEffects.length, 3);
  assert.deepEqual(result.selection.heroicEffects.map(({ statId, level, value }) => ({ statId, level, value })), [
    { statId: "effect_a", level: 1, value: 8 },
    { statId: "effect_b", level: 2, value: 3 },
    { statId: "effect_d", level: 3, value: 12 },
  ]);
  assert.equal(new Set(result.selection.heroicEffects.map((row) => row.statId)).size, 3);
  assert.ok(result.selection.heroicEffects.every((row) => row.levelKnown));
});

test("duplicate policy changes the legal best effect configuration", () => {
  const allowed = optimizeHeroicPotential(baseItem, { evaluate, allowDuplicateEffects: true });
  assert.deepEqual(allowed.selection.heroicEffects.map((row) => row.statId), ["effect_b", "effect_b"]);

  const forbidden = optimizeHeroicPotential(baseItem, { evaluate, allowDuplicateEffects: false });
  assert.deepEqual(forbidden.selection.heroicEffects.map((row) => row.statId), ["effect_a", "effect_b"]);
});

test("Heroic effects are non-stacking by default", () => {
  const result = optimizeHeroicPotential(baseItem, { evaluate });
  assert.deepEqual(result.selection.heroicEffects.map((row) => row.statId), ["effect_a", "effect_b"]);
  assert.match(result.assumptions.duplicateEffects, /not allowed/);
});

test("uses protection headroom then lexical signature as deterministic tie breakers", () => {
  const tied = (selection) => ({
    score: 1,
    protectionHeadroom: selection.traits.some((row) => row.statId === "alpha") ? 2 : 1,
  });
  const first = optimizeHeroicPotential(baseItem, { evaluate: tied, allowDuplicateEffects: false });
  const second = optimizeHeroicPotential(structuredClone(baseItem), { evaluate: tied, allowDuplicateEffects: false });
  assert.deepEqual(first.selection, second.selection);
  assert.deepEqual(first.selection.traits.map((row) => row.statId), ["alpha", "beta", "gamma"]);
  assert.deepEqual(first.selection.uniqueTrait, { statId: "unique_a", tier: 3 });
  assert.deepEqual(first.selection.heroicEffects.map((row) => row.statId), ["effect_a", "effect_b"]);
});

test("throws when an item cannot provide three legal normal traits", () => {
  const item = structuredClone(baseItem);
  item.itemStats.traits = { alpha: [1], beta: [1] };
  assert.throws(() => optimizeHeroicPotential(item, { evaluate }), /at least three normal trait options/);
});
