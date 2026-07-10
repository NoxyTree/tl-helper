import assert from "node:assert/strict";
import test from "node:test";
import {
  decodedItemPower, decodedRunePower, inferItemCombatPowerRowId, inferRuneCombatPowerRowId, listPower,
} from "../lib/combat-power-table.mjs";

test("maps normal, seasonal, accessory, and artifact item IDs", () => {
  assert.equal(inferItemCombatPowerRowId({ id: "sword_aa_t2_raid_001", equipmentType: "sword" }), "weapon_aa_t2");
  assert.equal(inferItemCombatPowerRowId({ id: "head_aa_S1_fabric_001", equipmentType: "head" }), "armor_aa_S1");
  assert.equal(inferItemCombatPowerRowId({ id: "ear_aa2_t1_001", equipmentType: "earring" }), "ear_aa2_t1");
  assert.equal(inferItemCombatPowerRowId({ id: "anything", equipmentType: "gemstone1", grade: 31 }), "gemstone_a_t1");
  assert.equal(inferItemCombatPowerRowId({ id: "food_a_t1", equipmentType: "attack" }), null);
});

test("rejects inferred keys not present in the supplied table", () => {
  assert.equal(inferItemCombatPowerRowId({ id: "head_aa_t2_001", equipmentType: "head" }, ["head_aa_t1"]), null);
});

test("reads indexed component values without inventing out-of-range values", () => {
  const row = { ItemTraitCombatPowerList: [{ CombatPower: 0 }, { CombatPower: 5 }] };
  assert.equal(listPower(row, "ItemTraitCombatPowerList", 1), 5);
  assert.equal(listPower(row, "ItemTraitCombatPowerList", 2), null);
});

test("sums decoded item components", () => {
  const values = (list) => list.map((CombatPower) => ({ CombatPower }));
  const row = {
    BaseCombatPower: 100,
    ItemEnchantCombatPowerList: values([0, 2, 4]),
    ItemTraitCombatPowerList: values([0, 0, 10, 20, 30]),
    ItemUniqueTraitCombatPowerList: values([0, 7]),
    ItemTraitResonanceCombatPowerList: values([0, 3]),
    ItemPotentialCombatPower: 15,
  };
  assert.deepEqual(decodedItemPower(row, {
    enchantLevel: 2, traits: [{ tier: 2 }, { tier: 2 }], uniqueTrait: { tier: 1 }, resonance: [{ tier: 1 }], potentialId: "x",
  }), { base: 100, enchant: 4, traits: 30, uniqueTrait: 7, resonance: 3, potential: 15, total: 159 });
});

test("maps normal and chaos runes and applies the table level index", () => {
  assert.equal(inferRuneCombatPowerRowId({ grade: 31, runeType: "attack" }), "rune_a_t1");
  assert.equal(inferRuneCombatPowerRowId({ grade: 42, runeType: "chaos" }), "rune_all_aa2_t1");
  assert.equal(decodedRunePower({ BaseCombatPower: 5, ItemEnchantCombatPowerList: [{ CombatPower: 0 }, { CombatPower: 2 }] }, 1), 7);
});
