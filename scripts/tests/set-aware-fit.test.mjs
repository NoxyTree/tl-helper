import assert from "node:assert/strict";
import test from "node:test";

import { calculateBuild, createInitialBuild, initCore } from "../../web/tl-core.js";

const setId = "test-evasion-set";
const items = [
  { id: "test-set-head", name: "Test Head", equipmentType: "head", setId, itemStats: {} },
  { id: "test-set-chest", name: "Test Chest", equipmentType: "chest", setId, itemStats: {} },
];
const itemSets = [{
  id: setId,
  name: "Test Evasion Set",
  itemSetMadeOfItems: items.map(({ id, name }) => ({ id, name })),
  itemSetBonus: [{ set_count: 2, bonus_stat: [{ type: "all_evasion", value: 110 }] }],
}];

await initCore({ items, itemSets, runes: [], masteries: [], skills: [], skillTraits: [] });

test("set effects can be explicitly included or excluded from build totals", () => {
  const build = createInitialBuild();
  build.equipment.head.itemId = "test-set-head";
  build.equipment.chest.itemId = "test-set-chest";

  const withoutSets = calculateBuild(build, {}, { includeSetEffects: false });
  const withSets = calculateBuild(build, {}, { includeSetEffects: true });
  const total = (calc, id) => calc.stats.find((row) => row.id === id)?.total ?? 0;

  assert.equal(total(withoutSets, "all_evasion"), 0);
  assert.equal(total(withSets, "all_evasion"), 110);
});
