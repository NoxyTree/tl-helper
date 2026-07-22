import assert from "node:assert/strict";
import test from "node:test";

import { createOptimizerAdapter } from "../../web/tl-full-build-adapter.js";

test("adapter exposes the browser contract and reports a missing saved build", async () => {
  const core = { data: { gameBuild: "test", statLabels: { attack: "Attack" } }, indexes: {}, statName: (id) => id };
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  for (const method of ["loadArmoryBuild", "importQuestlogBuild", "listStats", "optimize"]) assert.equal(typeof adapter[method], "function");
  assert.equal(await adapter.loadArmoryBuild(), null);
  assert.deepEqual(await adapter.listStats(), [{ id: "attack", name: "attack" }]);
});

test("createScratchBuild returns a canonical empty build and explicit zero attributes", async () => {
  const core = {
    data: { gameBuild: "test", statLabels: {} }, indexes: {},
    createInitialBuild: () => ({ id: "new", name: "Default Build", equipment: {}, artifacts: {}, supportSlots: {} }),
  };
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const scratch = await adapter.createScratchBuild();
  assert.equal(scratch.sourceKind, "scratch");
  assert.equal(scratch.build.name, "Scratch Build");
  assert.deepEqual(scratch.attributes, { str: 0, dex: 0, int: 0, per: 0, con: 0 });
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

test("stable slot locks preserve the complete current selection and objective baseline", async () => {
  const oldSelection = { itemId: "old", level: 12, traits: [{ statId: "attack", tier: 3 }], heroicEffects: [{ statId: "guard", level: 12 }], runes: [{ runeId: "r", statId: "attack", level: 9 }] };
  const items = { old: { id: "old", name: "Old", grade: 41, equipmentType: "head" }, next: { id: "next", name: "Next", grade: 41, equipmentType: "head" } };
  const core = {
    data: { gameBuild: "test", statLabels: { attack: "Attack" }, runes: [], runeSynergies: [], items: Object.values(items), artifactSets: [] },
    indexes: { itemById: items, runeById: {} }, EQUIPMENT_SLOTS: [{ id: "head", label: "Head" }], WEAPON_SLOTS: [], HEROIC_GRADE: 51,
    calculateBuild(build) { const value = build.equipment.head.itemId === "next" ? 20 : build.equipment.head.itemId === "old" ? 10 : 0; return { stats: [{ id: "attack", total: value }] }; },
    slotSelectionContribution(_slot, selection) { return { attack: selection?.itemId === "next" ? 20 : selection?.itemId === "old" ? 10 : 0 }; },
    slotItems: () => Object.values(items), slotById: () => ({ id: "head", types: ["head"] }),
    emptyEquipmentSelection: () => ({ itemId: "", traits: [], heroicEffects: [], runes: [] }), itemMaxLevel: () => 12,
    heroicSlotGroupForSlot: () => "", statName: (id) => id,
  };
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const result = await adapter.optimize({
    build: { build: { equipment: { head: structuredClone(oldSelection) }, artifacts: {}, supportSlots: {} }, attributes: {}, sourceKind: "scratch" },
    goals: { increase: ["attack"], protect: [] }, lockedSlotIds: ["head"], objectiveBaseline: { attack: 5 }, rules: {},
  });
  assert.deepEqual(result.build.equipment.head, oldSelection);
  assert.equal(result.slots[0].slotId, "head");
  assert.deepEqual(result.objectiveBaseline, { attack: 5 });
  assert.equal(result.sourceKind, "scratch");
  assert.deepEqual(result.attributes, {});
});
