import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as core from "../../web/tl-core.js";
import { expandCompositeGoals } from "../../web/optimizer/tl-full-build-adapter.js";
import { CONTEXT_SPLIT_COMPOSITE_IDS, STAT_EXPANSIONS, goalCompositeComponents } from "../../web/tl-questlog-rules.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appData = await loadWebDataFromFile(join(repoRoot, "web", "data", "app-data.json"));
await core.initCore(appData);

test("CONTEXT_SPLIT_COMPOSITE_IDS captures every composite whose components are boss_/pvp_ projections of itself", () => {
  // Includes the two-way boss_x+pvp_x splits AND one-way boss-only forward feeds
  // like damage_reduction (there is no pvp_damage_reduction).
  const derived = Object.entries(STAT_EXPANSIONS)
    .filter(([id, components]) => components.length >= 1 && components.length <= 2
      && components.every((c) => c === `boss_${id}` || c === `pvp_${id}`))
    .map(([id]) => id);
  assert.deepEqual([...CONTEXT_SPLIT_COMPOSITE_IDS].sort(), derived.sort());
  for (const id of ["magic_double_attack", "melee_critical_attack", "range_accuracy"]) {
    assert.ok(CONTEXT_SPLIT_COMPOSITE_IDS.has(id), `${id} should be context-split`);
  }
});

test("damage_reduction scores and floor-checks on itself, not on boss_damage_reduction", () => {
  // Regression: damage_reduction expands one-way to [boss_damage_reduction]. It
  // must be treated as a context projection of itself so a "Damage Reduction"
  // goal scores AND enforces its floor on raw damage_reduction. Otherwise the
  // goal reports the (higher) boss value while the floor checks raw, producing a
  // false "no build satisfies".
  assert.ok(CONTEXT_SPLIT_COMPOSITE_IDS.has("damage_reduction"));
  assert.deepEqual(goalCompositeComponents("damage_reduction"), ["damage_reduction"]);
  const [goal] = expandCompositeGoals([{ id: "damage_reduction", rank: 1, weight: 1 }]);
  assert.deepEqual(goal.components, ["damage_reduction"]);
  // Genuine aggregates are unaffected — still expand to their typed leaves.
  assert.deepEqual(goalCompositeComponents("all_accuracy"), STAT_EXPANSIONS.all_accuracy);
});

test("context-split composites score on their own leaf, never min(boss, pvp)", () => {
  assert.deepEqual(goalCompositeComponents("magic_double_attack"), ["magic_double_attack"]);
  const [goal] = expandCompositeGoals([{ id: "magic_double_attack", rank: 1, weight: 1 }]);
  assert.deepEqual(goal.components, ["magic_double_attack"],
    "a context-split goal must not expand into boss_ + pvp_ (which would score as their minimum)");
});

test("type roll-up composites still expand to their typed/context components (min preserved)", () => {
  // PvP Heavy Attack Chance is min over melee/range/magic within the PvP context — legitimate.
  const [pvpRollup] = expandCompositeGoals([{ id: "pvp_all_double_attack", rank: 1, weight: 1 }]);
  assert.deepEqual(pvpRollup.components, STAT_EXPANSIONS.pvp_all_double_attack);
  assert.equal(pvpRollup.components.length, 3);
  // Endurance is min over the typed defensive stats.
  const [endurance] = expandCompositeGoals([{ id: "all_critical_defense", rank: 1, weight: 1 }]);
  assert.deepEqual(endurance.components, STAT_EXPANSIONS.all_critical_defense);
});

test("compositeStatBreakdown hides the Boss/PvP min for context-split, keeps it for roll-ups", () => {
  const calc = core.calculateBuild(core.createInitialBuild(), {}, { includeSetEffects: true });
  assert.equal(core.compositeStatBreakdown(calc, "magic_double_attack"), null,
    "context-split stats must display as a single total, not a Boss/PvP breakdown");
  assert.equal(core.compositeStatBreakdown(calc, "melee_critical_attack"), null);
  assert.ok(core.compositeStatBreakdown(calc, "pvp_all_double_attack"),
    "type roll-ups keep their weakest-component breakdown");
  assert.ok(core.compositeStatBreakdown(calc, "all_critical_defense"));
});
