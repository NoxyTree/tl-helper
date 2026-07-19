// Heroic handling policy: "keep_config" must preserve an equipped Heroic's
// exact selection, "keep_items" must keep the item identity while
// re-optimizing its traits and Heroic effects, and the legacy
// keepCurrentHeroics/reconsiderHeroics booleans must keep meaning keep_config.
import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as core from "../../web/tl-core.js";
import { createOptimizerAdapter } from "../../web/tl-full-build-adapter.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appData = await loadWebDataFromFile(join(repoRoot, "web", "data", "app-data.json"));
await core.initCore(appData);

const attributes = { str: 0, dex: 0, int: 0, per: 0, con: 0 };

function heroicFixture() {
  for (const slot of core.EQUIPMENT_SLOTS) {
    if (core.WEAPON_SLOTS.includes(slot.id)) continue;
    const item = core.slotItems(slot).find((row) =>
      row.grade === core.HEROIC_GRADE && Array.isArray(row.itemStats?.random_stat_group_1) && row.itemStats.random_stat_group_1.length > 0);
    if (item) return { slot: slot.id, item };
  }
  assert.fail("no non-weapon Heroic item with effect groups in the data bundle");
}

const { slot, item } = heroicFixture();
const weakEffect = item.itemStats.random_stat_group_1[0];

function buildWithHeroic() {
  const build = core.createInitialBuild();
  build.equipment[slot] = {
    ...core.emptyEquipmentSelection(),
    itemId: item.id,
    level: core.itemMaxLevel(item),
    heroicEffects: [{ statId: weakEffect.stat_id, level: 0, levelKnown: false }],
  };
  return build;
}

const goalStat = "all_critical_attack";
const rules = {
  minimumItemLevel: 0,
  includeSetEffects: false,
  optimizeThreeTraits: false,
  bestHeroicConfiguration: false,
  runes: { mode: "keep" },
  artifacts: { mode: "keep" },
};

async function optimizeWith(extraRules) {
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  return adapter.optimize({
    build: { build: buildWithHeroic(), attributes },
    sourceKind: "existing",
    goals: { priorities: [{ id: goalStat, rank: 1, mode: "maximize" }], protect: [] },
    rules: { ...rules, ...extraRules },
    depth: "fast",
  });
}

test("keep_config preserves the equipped Heroic item and its exact configuration", async () => {
  const result = await optimizeWith({ heroicPolicy: "keep_config" });
  const selected = result.build.equipment[slot];
  assert.equal(selected.itemId, item.id);
  assert.deepEqual(selected.heroicEffects, [{ statId: weakEffect.stat_id, level: 0, levelKnown: false }]);
});

test("legacy keepCurrentHeroics/reconsiderHeroics booleans behave as keep_config", async () => {
  const result = await optimizeWith({ keepCurrentHeroics: true, reconsiderHeroics: false });
  const selected = result.build.equipment[slot];
  assert.equal(selected.itemId, item.id);
  assert.deepEqual(selected.heroicEffects, [{ statId: weakEffect.stat_id, level: 0, levelKnown: false }]);
});

test("keep_items keeps the Heroic identity but re-optimizes its configuration", async () => {
  const result = await optimizeWith({ heroicPolicy: "keep_items" });
  const selected = result.build.equipment[slot];
  assert.equal(selected.itemId, item.id, "item identity must be preserved");
  const effects = (selected.heroicEffects ?? []).filter((row) => row?.statId);
  assert.ok(effects.length > 0, "re-optimized Heroic must select effects");
  for (const effect of effects) {
    assert.equal(effect.levelKnown, true, "re-optimized effects carry a confirmed level");
  }
  const changed = JSON.stringify(selected.heroicEffects) !== JSON.stringify([{ statId: weakEffect.stat_id, level: 0, levelKnown: false }])
    || (selected.traits ?? []).some((row) => row?.statId);
  assert.equal(changed, true, "configuration must actually be re-optimized");
});

test("results explain every Heroic effect selection with pool and goal linkage", async () => {
  const result = await optimizeWith({ heroicPolicy: "keep_config" });
  const report = result.heroicSelectionReport;
  assert.ok(Array.isArray(report) && report.length >= 1, "heroicSelectionReport must list equipped Heroics");
  const entry = report.find((row) => row.itemName === item.name);
  assert.ok(entry, "the kept Heroic item is reported");
  assert.equal(entry.locked, true, "keep_config marks the item as locked");
  const group = entry.groups[0];
  assert.ok(group.pool.length > 0, "the available effect pool is listed");
  assert.ok(group.selected, "the selected effect is reported");
  assert.equal(group.selected.statId, weakEffect.stat_id);
  assert.equal(group.selected.levelKnown, false, "unknown level is not presented as confirmed");
  assert.equal(typeof group.tieBreaker, "boolean");
  assert.ok(result.explanations.some((line) => line.startsWith(`Heroic ${item.name}`)), "explanations carry a Heroic line");
});
