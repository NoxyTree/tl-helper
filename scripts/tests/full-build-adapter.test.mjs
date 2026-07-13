import assert from "node:assert/strict";
import test from "node:test";

import { createOptimizerAdapter, deriveObjectiveScales, normalizeRankedGoals, scoreRankedGoals } from "../../web/tl-full-build-adapter.js";

test("ranked goals use tied ranks, diminishing weights, and scale normalization", () => {
  const goals = normalizeRankedGoals({ priorities: [{ id: "endurance", rank: 1 }, { id: "health", rank: 2 }, { id: "evasion", rank: 2, minimum: 80 }] });
  assert.deepEqual(goals.map(({ id, rank, weight, minimum }) => ({ id, rank, weight, minimum })), [
    { id: "endurance", rank: 1, weight: 1, minimum: null },
    { id: "evasion", rank: 2, weight: 0.6, minimum: 80 },
    { id: "health", rank: 2, weight: 0.6, minimum: null },
  ]);
  assert.equal(scoreRankedGoals({ endurance: 10, health: 1000 }, {}, { endurance: 10, health: 1000 }, goals), 1.6);
});

test("legacy increase arrays remain equally weighted", () => {
  assert.deepEqual(normalizeRankedGoals({ increase: ["health", "endurance"] }).map(({ rank, weight }) => ({ rank, weight })), [{ rank: 1, weight: 1 }, { rank: 1, weight: 1 }]);
});

test("objective scales are independent of priority order and ties", () => {
  const core = {
    data: { items: [{ itemStats: { traits: { hp_max: [500, 1000], melee_critical_defense: [10, 20] } } }], runes: [], runeSynergies: [], itemSets: [], artifactSets: [], attributeStats: {} },
    EQUIPMENT_SLOTS: Array.from({ length: 3 }), ARTIFACT_SLOTS: [],
  };
  const first = normalizeRankedGoals({ priorities: [{ id: "hp_max", rank: 1 }, { id: "melee_critical_defense", rank: 2 }] });
  const reordered = normalizeRankedGoals({ priorities: [{ id: "melee_critical_defense", rank: 1 }, { id: "hp_max", rank: 2 }] });
  assert.deepEqual(deriveObjectiveScales(core, first), { hp_max: 3000, melee_critical_defense: 60 });
  assert.deepEqual(deriveObjectiveScales(core, reordered), { melee_critical_defense: 60, hp_max: 3000 });
});

test("adapter exposes the browser contract and reports a missing saved build", async () => {
  const core = { data: { gameBuild: "test", statLabels: { attack: "Attack" }, items: [{ itemStats: { attack: 1 } }] }, indexes: {}, statName: (id) => id, createInitialBuild: () => ({ name: "Default Build", equipment: {}, artifacts: {}, supportSlots: {} }) };
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  for (const method of ["createScratchBuild", "loadArmoryBuild", "importQuestlogBuild", "listStats", "optimize"]) assert.equal(typeof adapter[method], "function");
  assert.equal(await adapter.loadArmoryBuild(), null);
  assert.deepEqual(await adapter.listStats(), [{ id: "attack", name: "attack" }]);
});

test("optimizer stat catalog keeps source-backed combat goals and removes internal metadata", async () => {
  const statLabels = {
    str: "Strength", all_accuracy: "Hit Chance", melee_double_attack: "Melee Double Attack",
    pvp_magic_evasion: "PvP Magic Evasion", animal_damage_amplification: "Animal Damage",
    probability: "Probability", none: "None", orb: "Orb", adjust_gold_acquired: "Gold",
  };
  const core = {
    data: {
      gameBuild: "test", statLabels,
      items: [{ itemStats: { main: [{ all_accuracy: 80 }], traits: { melee_double_attack: [40] }, resonance: { pvp_magic_evasion: { tiers: [20] } } } }],
      runes: [{ itemStats: { random_stat_group_1: [{ stat_id: "animal_damage_amplification" }] } }],
      runeSynergies: [], itemSets: [], artifactSets: [],
    },
    indexes: {}, WEAPON_TYPES: ["orb"], statName: (id) => id, createInitialBuild: () => ({ equipment: {}, artifacts: {}, supportSlots: {} }),
  };
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const ids = (await adapter.listStats()).map((row) => row.id);
  assert.deepEqual(ids.sort(), ["all_accuracy", "animal_damage_amplification", "melee_double_attack", "pvp_magic_evasion", "str"].sort());
});

test("scratch builds start empty and are explicitly marked as scratch", async () => {
  const core = { data: { gameBuild: "test", statLabels: {} }, indexes: {}, createInitialBuild: () => ({ name: "Default Build", equipment: { head: { itemId: "" } }, artifacts: {}, supportSlots: {} }) };
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const scratch = await adapter.createScratchBuild();
  assert.equal(scratch.sourceKind, "scratch");
  assert.equal(scratch.name, "New optimized build");
  assert.equal(scratch.build.equipment.head.itemId, "");
  assert.deepEqual(scratch.attributes, { str: 0, dex: 0, int: 0, per: 0, con: 0 });
});

test("stable slot locks preserve complete selections and a fixed objective baseline", async () => {
  const current = { itemId: "old", level: 12, traits: [{ statId: "attack", tier: 3 }], heroicEffects: [{ statId: "guard", level: 12 }], runes: [{ runeId: "r", statId: "attack", level: 9 }] };
  const items = { old: { id: "old", name: "Old", grade: 41, equipmentType: "head" }, next: { id: "next", name: "Next", grade: 41, equipmentType: "head" } };
  const core = {
    data: { gameBuild: "test", statLabels: { attack: "Attack" }, items: Object.values(items), runes: [], runeSynergies: [], itemSets: [], artifactSets: [] },
    indexes: { itemById: items, runeById: {} }, EQUIPMENT_SLOTS: [{ id: "head", label: "Head" }], ARTIFACT_SLOTS: [], WEAPON_SLOTS: [], WEAPON_TYPES: [], HEROIC_GRADE: 51,
    calculateBuild(build) { return { stats: [{ id: "attack", total: build.equipment.head.itemId === "next" ? 20 : 10 }] }; },
    slotSelectionContribution(_slot, selection) { return { attack: selection?.itemId === "next" ? 20 : 10 }; },
    slotItems: () => Object.values(items), slotById: () => ({ id: "head", types: ["head"] }),
    emptyEquipmentSelection: () => ({ itemId: "", traits: [], heroicEffects: [], runes: [] }), itemMaxLevel: () => 12,
    heroicSlotGroupForSlot: () => "", statName: (id) => id, formatStat: (_id, value) => String(value), gradeColor: () => "#fff",
  };
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const result = await adapter.optimize({
    build: { build: { equipment: { head: structuredClone(current) }, artifacts: {}, supportSlots: {} }, attributes: {}, sourceKind: "scratch" },
    sourceKind: "scratch", goals: { increase: ["attack"], protect: [] }, lockedSlotIds: ["head"], objectiveBaseline: { attack: 5 }, rules: {},
  });
  assert.deepEqual(result.build.equipment.head, current);
  assert.equal(result.slots[0].slotId, "head");
  assert.deepEqual(result.objectiveBaseline, { attack: 5 });
  assert.deepEqual(result.attributes, {});
  assert.deepEqual(result.goalResults.map(({ id, rank, value, normalizedContribution, minimumMet }) => ({ id, rank, value, normalizedContribution, minimumMet })), [
    { id: "attack", rank: 1, value: 10, normalizedContribution: 0.5, minimumMet: null },
  ]);
  await assert.rejects(() => adapter.optimize({
    build: { build: { equipment: { head: structuredClone(current) }, artifacts: {}, supportSlots: {} }, attributes: {}, sourceKind: "scratch" },
    sourceKind: "scratch", goals: { priorities: [{ id: "attack", rank: 1, minimum: 15 }] }, lockedSlotIds: ["head"], objectiveBaseline: { attack: 5 }, objectiveScales: result.objectiveScales, rules: {},
  }), /No build satisfies/);
});

test("saved Armory state is returned with build and attributes", async () => {
  const core = { data: { gameBuild: "test", statLabels: {} }, indexes: {} };
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: true, data: { build: { name: "Mine" }, attributes: { str: 4 } } }) });
  const saved = await adapter.loadArmoryBuild();
  assert.equal(saved.name, "Mine");
  assert.equal(saved.attributes.str, 4);
});

test("Questlog import uses the hosted adapter and normalizes the requested build", async () => {
  let imported;
  const core = {
    data: { gameBuild: "test", statLabels: {} }, indexes: {},
    importQuestlogBuild(payload) { imported = payload; return { build: { name: "Imported" }, attributes: { dex: 3 } }; },
  };
  const fetch = async () => ({ ok: true, json: async () => ({ buildId: "7", characterData: { builds: [{ id: 7, equipment: { head: { id: "x", enhLvl: 12 } } }] }, skillData: { builds: [] }, masteryData: { builds: [] } }) });
  const adapter = await createOptimizerAdapter({ core, fetch, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const result = await adapter.importQuestlogBuild("https://questlog.gg/build/7");
  assert.equal(result.name, "Imported");
  assert.equal(imported.build.equipment.head.itemLevel, 12);
});
