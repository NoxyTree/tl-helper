import assert from "node:assert/strict";
import test from "node:test";

import { calculateBuild, createInitialBuild, emptyEquipmentSelection, initCore } from "../../web/tl-core.js";

const armourSlots = ["head", "chest", "hands", "legs", "feet"];
const items = [
  { id: "test-sword", name: "Test Sword", equipmentType: "sword", itemStats: {} },
  { id: "test-greatsword", name: "Test Greatsword", equipmentType: "sword2h", itemStats: {} },
  ...armourSlots.map((equipmentType) => ({
    id: `test-plate-${equipmentType}`,
    name: `Test Plate ${equipmentType}`,
    equipmentType,
    armorCategory: "plate",
    itemStats: {},
  })),
];

await initCore({
  items,
  itemSets: [],
  artifactSets: [],
  runes: [],
  runeSynergies: [],
  masteries: [],
  skills: [],
  skillTraits: [],
});

function snsGreatswordBuild(pieceCount) {
  const build = createInitialBuild();
  build.equipment.main_hand = { ...emptyEquipmentSelection(), itemId: "test-sword" };
  build.equipment.off_hand = { ...emptyEquipmentSelection(), itemId: "test-greatsword" };
  for (const slot of armourSlots.slice(0, pieceCount)) {
    build.equipment[slot] = { ...emptyEquipmentSelection(), itemId: `test-plate-${slot}` };
  }
  return build;
}

function total(calc, id) {
  return calc.stats.find((row) => row.id === id)?.total ?? 0;
}

test("each SnS and Greatsword plate piece receives both weapon material bonuses", () => {
  const calc = calculateBuild(snsGreatswordBuild(1), {});
  assert.equal(total(calc, "all_state_tolerance"), 1000);
  assert.equal(total(calc, "double_damage_taken_modifier"), 200);
  const hp = calc.stats.find((row) => row.id === "hp_max");
  const materialHp = hp.sources.find((source) => source.type === "material")?.value ?? 0;
  assert.ok(Math.abs(materialHp / (hp.total - materialHp) - 0.036) < 1e-12);
});

test("five SnS and Greatsword plate pieces stack both material bonuses five times", () => {
  const calc = calculateBuild(snsGreatswordBuild(5), {});
  assert.equal(total(calc, "all_state_tolerance"), 5000);
  assert.equal(total(calc, "double_damage_taken_modifier"), 1000);
  const hp = calc.stats.find((row) => row.id === "hp_max");
  const materialHp = hp.sources.find((source) => source.type === "material")?.value ?? 0;
  assert.ok(Math.abs(materialHp / (hp.total - materialHp) - 0.18) < 1e-12);
});
