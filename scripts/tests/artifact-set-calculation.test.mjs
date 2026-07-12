import assert from "node:assert/strict";
import test from "node:test";

import { calculateBuild, createInitialBuild, initCore } from "../../web/tl-core.js";

const setId = "test-artifact-set";
const items = ["talistone1", "talistone2", "talistone3", "talistone4", "gemstone1", "gemstone2"].map((equipmentType) => ({
  id: `${setId}-${equipmentType}`,
  name: equipmentType,
  equipmentType,
  setId,
  itemStats: { artifact: { 0: { hp_max: 100 } } },
}));

await initCore({
  items,
  itemSets: [],
  artifactSets: [{
    id: setId,
    name: "Test Artifact Set",
    memberItemIds: items.map((item) => item.id),
    bonuses: [
      { set_count: 2, bonus_stat: [{ type: "all_evasion", value: 110 }] },
      { set_count: 4, bonus_stat: [{ type: "hp_max", value: 500 }] },
    ],
  }],
  runes: [],
  masteries: [],
  skills: [],
  skillTraits: [],
});

test("artifact set thresholds contribute to exact build totals", () => {
  const build = createInitialBuild();
  for (const [index, item] of items.slice(0, 4).entries()) {
    build.artifacts[item.equipmentType] = { ...build.artifacts[item.equipmentType], itemId: item.id, artifactStatId: "hp_max" };
    assert.equal(index + 1, Object.values(build.artifacts).filter((row) => row.itemId).length);
  }
  const calc = calculateBuild(build, {});
  const total = (id) => calc.stats.find((row) => row.id === id)?.total ?? 0;
  assert.equal(total("all_evasion"), 110);
  assert.ok(calc.stats.find((row) => row.id === "hp_max")?.sources.some((source) => source.type === "set_bonus" && source.value === 500));
});
