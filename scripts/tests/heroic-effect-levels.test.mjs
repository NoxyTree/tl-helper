import assert from "node:assert/strict";
import test from "node:test";

import {
  HEROIC_GRADE,
  heroicEffectGroupCount,
  heroicEffectOptions,
  heroicEffectValue,
  importQuestlogBuild,
  initCore,
  normalizeHeroicEffectRows,
  selectedHeroicEffects,
} from "../../web/tl-core.js";

const effect = (statId, base, levels) => ({
  stat_id: statId,
  base_value: base,
  max_level: levels.length - 1,
  levels,
  probability: 50,
});

const heroic = {
  id: "test-heroic-chest",
  name: "Test Heroic Chest",
  grade: HEROIC_GRADE,
  equipmentType: "chest",
  itemStats: {
    random_stat_group_1: [effect("all_evasion", 160, [160, 180, 220])],
    random_stat_group_2: [effect("hp_max", 600, [600, 700, 800]), effect("all_evasion", 140, [140, 160, 180])],
    random_stat_group_3: [effect("all_accuracy", 160, [160, 190, 230])],
  },
};

await initCore({ items: [heroic], itemSets: [], runes: [], masteries: [], skills: [], skillTraits: [] });

test("Heroic effect options expose the full level range and canonical clamped values", () => {
  const [option] = heroicEffectOptions(heroic, 0);
  assert.deepEqual(
    { baseValue: option.baseValue, maxValue: option.maxValue, maxLevel: option.maxLevel, levels: option.levels },
    { baseValue: 160, maxValue: 220, maxLevel: 2, levels: [160, 180, 220] },
  );
  assert.equal(heroicEffectValue(option), 160);
  assert.equal(heroicEffectValue(option, 1), 180);
  assert.equal(heroicEffectValue(option, 99), 220);
  assert.equal(heroicEffectValue(option, -4), 160);
});

test("legacy Heroic selections remain level zero while selected levels affect totals", () => {
  const [legacy] = selectedHeroicEffects(heroic, { heroicEffects: [{ statId: "all_evasion" }] });
  assert.equal(legacy.level, 0);
  assert.equal(legacy.levelKnown, false);
  assert.equal(legacy.value, 160);

  const [upgraded] = selectedHeroicEffects(heroic, {
    heroicEffects: [{ statId: "all_evasion", level: 2, levelKnown: true }],
  });
  assert.equal(upgraded.level, 2);
  assert.equal(upgraded.levelKnown, true);
  assert.equal(upgraded.value, 220);
});

test("Heroic effect rows and groups are dynamic and retain level metadata", () => {
  assert.equal(heroicEffectGroupCount(heroic), 3);
  assert.deepEqual(normalizeHeroicEffectRows([{ statId: "all_evasion" }], heroic), [
    { statId: "all_evasion", level: 0, levelKnown: false },
    { statId: "", level: 0, levelKnown: false },
    { statId: "", level: 0, levelKnown: false },
  ]);
});

test("duplicate Heroic effects never stack during calculation", () => {
  const selected = selectedHeroicEffects(heroic, { heroicEffects: [
    { statId: "all_evasion", level: 2, levelKnown: true },
    { statId: "all_evasion", level: 2, levelKnown: true },
    { statId: "all_accuracy", level: 2, levelKnown: true },
  ] });
  assert.deepEqual(selected.map((row) => row.statId), ["all_evasion", "all_accuracy"]);
  assert.deepEqual(selected.map((row) => row.value), [220, 230]);
});

test("Questlog imports mark selected Heroic effect levels as unknown at level zero", () => {
  const { build } = importQuestlogBuild({
    character: { name: "Tester" },
    build: {
      id: "imported",
      equipment: {
        chest: { id: heroic.id, itemLevel: 12, heroic: { 1: "all_evasion", 3: "all_accuracy" } },
      },
    },
  });
  assert.deepEqual(build.equipment.chest.heroicEffects[0], { statId: "all_evasion", level: 0, levelKnown: false });
  assert.deepEqual(build.equipment.chest.heroicEffects[2], { statId: "all_accuracy", level: 0, levelKnown: false });
});

// Questlog's group numbering does not always match random_stat_group_N ordering.
// Storing its number verbatim produced rows the validator rejects, and those
// rejections are blocking issues — one mismatch made the entire imported build
// uncalculable and the optimizer refused to run.
test("Questlog imports relocate Heroic effects into the group the item actually offers", () => {
  const { build } = importQuestlogBuild({
    character: { name: "Tester" },
    build: {
      id: "imported",
      equipment: {
        // Every stat is stored under a group that does not offer it.
        chest: { id: heroic.id, itemLevel: 12, heroic: { 1: "hp_max", 2: "all_accuracy" } },
      },
    },
  });
  assert.deepEqual(build.equipment.chest.heroicEffects, [
    { statId: "", level: 0, levelKnown: false },
    { statId: "hp_max", level: 0, levelKnown: false },
    { statId: "all_accuracy", level: 0, levelKnown: false },
  ]);
  // The rows must survive validation, or the optimizer refuses the build.
  assert.deepEqual(selectedHeroicEffects(heroic, build.equipment.chest).map((row) => row.statId), ["hp_max", "all_accuracy"]);
});

test("Questlog imports drop Heroic effects no group on the item offers", () => {
  const { build } = importQuestlogBuild({
    character: { name: "Tester" },
    build: {
      id: "imported",
      equipment: {
        chest: { id: heroic.id, itemLevel: 12, heroic: { 1: "all_evasion", 2: "damage_reduction" } },
      },
    },
  });
  assert.deepEqual(build.equipment.chest.heroicEffects.map((row) => row.statId), ["all_evasion", "", ""]);
});
