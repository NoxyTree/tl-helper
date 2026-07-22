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

test("CONTEXT_SPLIT_COMPOSITE_IDS captures exactly the Boss/PvP two-way composites", () => {
  const derived = Object.entries(STAT_EXPANSIONS)
    .filter(([, components]) => components.length === 2
      && components.some((id) => id.startsWith("boss_"))
      && components.some((id) => id.startsWith("pvp_")))
    .map(([id]) => id);
  assert.deepEqual([...CONTEXT_SPLIT_COMPOSITE_IDS].sort(), derived.sort());
  // Sanity: the offensive families the redesign targets are present.
  for (const id of ["magic_double_attack", "melee_critical_attack", "range_accuracy"]) {
    assert.ok(CONTEXT_SPLIT_COMPOSITE_IDS.has(id), `${id} should be context-split`);
  }
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
