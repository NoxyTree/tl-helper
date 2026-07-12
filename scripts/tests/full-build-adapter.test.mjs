import assert from "node:assert/strict";
import test from "node:test";

import { createOptimizerAdapter } from "../../web/tl-full-build-adapter.js";

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
