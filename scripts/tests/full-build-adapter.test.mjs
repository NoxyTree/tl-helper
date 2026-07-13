import assert from "node:assert/strict";
import test from "node:test";

import { createOptimizerAdapter, deriveObjectiveScales, expandCompositeGoals, normalizeRankedGoals, optimizeAttributeAllocation, rawPointsForAttributeGain, resolveWeaponTypeConstraints, scoreRankedGoals } from "../../web/tl-full-build-adapter.js";

test("composite goals preserve one goal weight across typed leaf totals", () => {
  const [goal] = expandCompositeGoals(normalizeRankedGoals({ increase: ["pvp_all_critical_defense"] }));
  assert.deepEqual(goal.components, ["pvp_melee_critical_defense", "pvp_range_critical_defense", "pvp_magic_critical_defense"]);
  assert.equal(scoreRankedGoals({ pvp_melee_critical_defense: 300 }, {}, { pvp_all_critical_defense: 100 }, [goal]), 0.05);
  assert.equal(scoreRankedGoals({ pvp_melee_critical_defense: 100, pvp_range_critical_defense: 100, pvp_magic_critical_defense: 100 }, {}, { pvp_all_critical_defense: 100 }, [goal]), 1);
  const scale = deriveObjectiveScales({ data: { items: [{ pvp_melee_critical_defense: 90 }, { pvp_range_critical_defense: 120 }, { pvp_magic_critical_defense: 90 }] }, EQUIPMENT_SLOTS: [{}], ARTIFACT_SLOTS: [] }, [goal]);
  assert.deepEqual(scale, { pvp_all_critical_defense: 100 });
});

test("general composite goals match the calculator's direct typed totals", () => {
  const [endurance] = expandCompositeGoals(normalizeRankedGoals({ increase: ["all_critical_defense"] }));
  assert.deepEqual(endurance.components, ["melee_critical_defense", "range_critical_defense", "magic_critical_defense"]);
  assert.equal(endurance.components.some((id) => id.startsWith("boss_") || id.startsWith("pvp_")), false);

  const [hitChance] = expandCompositeGoals(normalizeRankedGoals({ increase: ["all_accuracy"] }));
  assert.deepEqual(hitChance.components, ["melee_accuracy", "range_accuracy", "magic_accuracy"]);
});
import { allocatedAttributeValue } from "../../web/tl-questlog-rules.js";

function attributeTestCore() {
  return {
    statName: (id) => id, formatStat: (_id, value) => String(value),
    calculateBuild(build, attributes) {
      const str = 20 + Number(build.gearStr ?? 0) + allocatedAttributeValue(attributes.str ?? 0);
      const dex = 20 + allocatedAttributeValue(attributes.dex ?? 0);
      const stats = [
        { id: "str", total: str, sources: [] }, { id: "dex", total: dex, sources: [] },
        { id: "hp_max", total: str >= 30 ? 100 : 0, sources: str >= 30 ? [{ type: "attribute_bracket", sourceLabel: "STR (30): Bonus", value: 100 }] : [] },
        { id: "all_double_attack", total: str >= 50 ? 1000 : 0, sources: str >= 50 ? [{ type: "attribute_bracket", sourceLabel: "STR (50): Bonus", value: 1000 }] : [] },
        { id: "all_critical_attack", total: dex >= 30 ? 100 : 0, sources: dex >= 30 ? [{ type: "attribute_bracket", sourceLabel: "DEX (30): Bonus", value: 100 }] : [] },
      ];
      return { stats };
    },
  };
}

test("attribute breakpoint inversion uses the diminishing raw-point curve", () => {
  assert.equal(rawPointsForAttributeGain(20, 100), 20);
  assert.equal(rawPointsForAttributeGain(30, 100), 40);
  assert.equal(rawPointsForAttributeGain(32.5, 100), 50);
});

test("a level-50 breakpoint consumes forty raw points after diminishing conversion", () => {
  const core = attributeTestCore();
  const result = optimizeAttributeAllocation({ core, build: {}, budget: 40, rankedGoals: normalizeRankedGoals({ increase: ["all_double_attack"] }), baseline: {}, scales: { all_double_attack: 1000 } });
  assert.equal(result.attributes.str, 40);
  assert.equal(result.stats.all_double_attack, 1000);
  assert.equal(result.activeAttributeBreakpoints.some((row) => row.attributeId === "str" && row.threshold === 50), true);
});

test("attribute optimization conserves budget, follows the objective, and is deterministic", () => {
  const core = attributeTestCore();
  const hpGoals = normalizeRankedGoals({ increase: ["hp_max"] });
  const critGoals = normalizeRankedGoals({ increase: ["all_critical_attack"] });
  const hpRuns = Array.from({ length: 3 }, () => optimizeAttributeAllocation({ core, build: {}, budget: 10, rankedGoals: hpGoals, baseline: {}, scales: { hp_max: 100 } }));
  assert.deepEqual(hpRuns.map((row) => row.attributes), [hpRuns[0].attributes, hpRuns[0].attributes, hpRuns[0].attributes]);
  assert.equal(Object.values(hpRuns[0].attributes).reduce((sum, value) => sum + value, 0), 10);
  assert.equal(hpRuns[0].attributes.str, 10);
  const crit = optimizeAttributeAllocation({ core, build: {}, budget: 10, rankedGoals: critGoals, baseline: {}, scales: { all_critical_attack: 100 } });
  assert.equal(crit.attributes.dex, 10);
});

test("gear-provided attributes reduce the allocation needed for a breakpoint", () => {
  const core = attributeTestCore();
  const result = optimizeAttributeAllocation({ core, build: { gearStr: 9 }, budget: 1, rankedGoals: normalizeRankedGoals({ increase: ["hp_max"] }), baseline: {}, scales: { hp_max: 100 } });
  assert.equal(result.attributes.str, 1);
  assert.deepEqual(result.activeAttributeBreakpoints, [{ attributeId: "str", attributeName: "str", threshold: 30, bonuses: [{ statId: "hp_max", name: "hp_max", value: 100, formattedValue: "100" }] }]);
});

test("bounded paired-breakpoint seeds beat either single-stat extreme", () => {
  const core = attributeTestCore();
  const result = optimizeAttributeAllocation({
    core, build: {}, budget: 20,
    rankedGoals: normalizeRankedGoals({ increase: ["hp_max", "all_critical_attack"] }), baseline: {}, scales: { hp_max: 100, all_critical_attack: 100 },
  });
  assert.equal(result.attributes.str, 10);
  assert.equal(result.attributes.dex, 10);
  assert.equal(result.score, 2);
});

test("attribute seed retention keeps gear that only wins after a breakpoint", async () => {
  const directItems = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`direct${index}`, { id: `direct${index}`, name: `Direct ${index}`, grade: 41, equipmentType: "head", directHp: 10 + index * 5 }]));
  const items = { ...directItems, gear: { id: "gear", name: "Breakpoint Gear", grade: 41, equipmentType: "head", gearStr: 9 } };
  const empty = () => ({ itemId: "", traits: [], heroicEffects: [], runes: [] });
  const core = {
    data: { gameBuild: "test", statLabels: { hp_max: "Health", str: "Strength" }, items: Object.values(items), runes: [], runeSynergies: [], itemSets: [], artifactSets: [] }, indexes: { itemById: items, runeById: {} },
    EQUIPMENT_SLOTS: [{ id: "head", label: "Head" }], ARTIFACT_SLOTS: [], WEAPON_SLOTS: [], WEAPON_TYPES: [], HEROIC_GRADE: 51,
    calculateBuild(build, attributes) {
      const item = items[build.equipment.head.itemId];
      const str = 20 + Number(item?.gearStr ?? 0) + allocatedAttributeValue(attributes.str ?? 0);
      const bracket = str >= 30 ? 100 : 0;
      return { stats: [{ id: "str", total: str, sources: [] }, { id: "hp_max", total: Number(item?.directHp ?? 0) + bracket, sources: bracket ? [{ type: "attribute_bracket", sourceLabel: "STR (30): Bonus", value: 100 }] : [] }] };
    },
    slotSelectionContribution(_slot, selection) { const item = items[selection?.itemId]; return { hp_max: Number(item?.directHp ?? 0), str: Number(item?.gearStr ?? 0) }; },
    slotItems: () => Object.values(items), slotById: () => ({ id: "head", label: "Head", types: ["head"] }), emptyEquipmentSelection: empty, itemMaxLevel: () => 12, heroicSlotGroupForSlot: () => "",
    statName: (id) => id, formatStat: (_id, value) => String(value), statPageFor: () => "combat", gradeColor: () => "#fff",
  };
  let allocationRuns = 0;
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }), optimizeAttributeAllocation(args) { allocationRuns += 1; return optimizeAttributeAllocation(args); } });
  const result = await adapter.optimize({ build: { build: { equipment: { head: empty() }, artifacts: {}, supportSlots: {} }, attributes: {}, sourceKind: "scratch" }, sourceKind: "scratch", attributePointBudget: 1, goals: { increase: ["hp_max"] }, rules: {} });
  assert.equal(result.build.equipment.head.itemId, "gear");
  assert.equal(result.optimizedAttributes.str, 1);
  assert.ok(result.assumptions.some((text) => text.includes("1 available attribute point was redistributed")));
  assert.equal(allocationRuns, result.attributeFinalistsEvaluated);
  assert.ok(allocationRuns > 0 && allocationRuns <= 48);
});

test("weapon constraints accept ordered or slot-keyed distinct pairings and reject invalid pairs", () => {
  const core = { WEAPON_SLOTS: ["main_hand", "off_hand"], WEAPON_TYPES: ["staff", "dagger", "bow"] };
  assert.deepEqual(resolveWeaponTypeConstraints(core, { weaponTypes: ["staff", "dagger"] }), { main_hand: "staff", off_hand: "dagger" });
  assert.deepEqual(resolveWeaponTypeConstraints(core, { weaponTypes: { main_hand: "bow", off_hand: "dagger" } }), { main_hand: "bow", off_hand: "dagger" });
  assert.throws(() => resolveWeaponTypeConstraints(core, { weaponTypes: ["staff", "staff"] }), /must be different/);
  assert.throws(() => resolveWeaponTypeConstraints(core, { weaponTypes: ["staff"] }), /Choose both/);
  assert.throws(() => resolveWeaponTypeConstraints(core, { weaponTypes: ["staff", "future"] }), /Unknown weapon type/);
});

test("ranked goals use tied ranks, diminishing weights, and scale normalization", () => {
  const goals = normalizeRankedGoals({ priorities: [{ id: "endurance", rank: 1 }, { id: "health", rank: 2 }, { id: "evasion", rank: 2, minimum: 80 }] });
  assert.deepEqual(goals.map(({ id, rank, weight, minimum }) => ({ id, rank, weight, minimum })), [
    { id: "endurance", rank: 1, weight: 1, minimum: null },
    { id: "evasion", rank: 2, weight: 0.05, minimum: 80 },
    { id: "health", rank: 2, weight: 0.05, minimum: null },
  ]);
  assert.equal(scoreRankedGoals({ endurance: 10, health: 1000 }, {}, { endurance: 10, health: 1000 }, goals), 1.05);
});

test("a meaningful gain in priority one outweighs a complete lower-priority objective", () => {
  const goals = normalizeRankedGoals({ priorities: [{ id: "endurance", rank: 1 }, { id: "hit", rank: 2 }] });
  const scales = { endurance: 100, hit: 100 };
  assert.ok(scoreRankedGoals({ endurance: 10, hit: 0 }, {}, scales, goals)
    > scoreRankedGoals({ endurance: 0, hit: 100 }, {}, scales, goals));
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
    heroicSlotGroupForSlot: () => "", statName: (id) => id, formatStat: (_id, value) => String(value), statPageFor: () => "combat", gradeColor: () => "#fff",
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
  assert.deepEqual(result.allStats, [{ id: "attack", name: "attack", value: 10, formattedValue: "10", group: "combat" }]);
  assert.deepEqual(result.goalResults.map(({ id, rank, value, normalizedContribution, minimumMet }) => ({ id, rank, value, normalizedContribution, minimumMet })), [
    { id: "attack", rank: 1, value: 10, normalizedContribution: 0.5, minimumMet: null },
  ]);
  assert.equal(result.tuningFrontier.length, 1);
  assert.deepEqual(result.tuningFrontier[0].goalValues, { attack: 10 });
  assert.deepEqual(result.tuningFrontier[0].build.equipment.head, current);
  await assert.rejects(() => adapter.optimize({
    build: { build: { equipment: { head: structuredClone(current) }, artifacts: {}, supportSlots: {} }, attributes: {}, sourceKind: "scratch" },
    sourceKind: "scratch", goals: { priorities: [{ id: "attack", rank: 1, minimum: 15 }] }, lockedSlotIds: ["head"], objectiveBaseline: { attack: 5 }, objectiveScales: result.objectiveScales, rules: {},
  }), /No build satisfies/);
});

test("minimum item level excludes progression gear from scratch candidates", async () => {
  const empty = () => ({ itemId: "", traits: [], heroicEffects: [], runes: [] });
  const items = {
    starter: { id: "starter", name: "Starter", grade: 41, equipmentType: "head", level: 21 },
    endgame: { id: "endgame", name: "Endgame", grade: 41, equipmentType: "head", level: 50 },
  };
  const core = {
    data: { gameBuild: "test", statLabels: { attack: "Attack" }, items: Object.values(items), runes: [], runeSynergies: [], itemSets: [], artifactSets: [] },
    indexes: { itemById: items, runeById: {} }, EQUIPMENT_SLOTS: [{ id: "head", label: "Head" }], ARTIFACT_SLOTS: [], WEAPON_SLOTS: [], WEAPON_TYPES: [], HEROIC_GRADE: 51,
    calculateBuild(build) { return { stats: [{ id: "attack", total: build.equipment.head.itemId === "starter" ? 100 : 10 }] }; },
    slotSelectionContribution(_slot, selection) { return { attack: selection?.itemId === "starter" ? 100 : selection?.itemId === "endgame" ? 10 : 0 }; },
    slotItems: () => Object.values(items), slotById: () => ({ id: "head", types: ["head"] }), emptyEquipmentSelection: empty,
    itemMaxLevel: (item) => item.level, heroicSlotGroupForSlot: () => "", statName: (id) => id, formatStat: (_id, value) => String(value), statPageFor: () => "combat", gradeColor: () => "#fff",
  };
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const result = await adapter.optimize({
    build: { build: { equipment: { head: empty() }, artifacts: {}, supportSlots: {} }, attributes: {}, sourceKind: "scratch" },
    sourceKind: "scratch", goals: { increase: ["attack"] }, rules: { minimumItemLevel: 50 },
  });
  assert.equal(result.build.equipment.head.itemId, "endgame");
  assert.ok(result.assumptions.includes("Equipment below level 50 was excluded."));
});

test("chosen main and off-hand weapon types are enforced during candidate generation", async () => {
  const items = {
    staff: { id: "staff", name: "Staff", grade: 41, equipmentType: "staff" }, bow: { id: "bow", name: "Bow", grade: 41, equipmentType: "bow" },
    dagger: { id: "dagger", name: "Dagger", grade: 41, equipmentType: "dagger" }, sword: { id: "sword", name: "Sword", grade: 41, equipmentType: "sword" },
  };
  const empty = () => ({ itemId: "", traits: [], heroicEffects: [], runes: [] });
  const core = {
    data: { gameBuild: "test", statLabels: { attack: "Attack" }, items: Object.values(items), runes: [], runeSynergies: [], itemSets: [], artifactSets: [] }, indexes: { itemById: items, runeById: {} },
    EQUIPMENT_SLOTS: [{ id: "main_hand", label: "Main" }, { id: "off_hand", label: "Off" }], ARTIFACT_SLOTS: [], WEAPON_SLOTS: ["main_hand", "off_hand"], WEAPON_TYPES: ["staff", "bow", "dagger", "sword"], HEROIC_GRADE: 51,
    calculateBuild(build) { return { stats: [{ id: "attack", total: Object.values(build.equipment).filter((row) => row.itemId).length }] }; },
    slotSelectionContribution(_slot, selection) { return { attack: selection?.itemId ? 1 : 0 }; }, slotItems: () => Object.values(items),
    slotById: (id) => ({ id, label: id, types: core.WEAPON_TYPES }), emptyEquipmentSelection: empty, itemMaxLevel: () => 12, heroicSlotGroupForSlot: () => "",
    statName: (id) => id, formatStat: (_id, value) => String(value), statPageFor: () => "combat", gradeColor: () => "#fff", label: (id) => id,
  };
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const result = await adapter.optimize({ build: { build: { equipment: { main_hand: empty(), off_hand: empty() }, artifacts: {}, supportSlots: {} }, attributes: {}, sourceKind: "scratch" }, sourceKind: "scratch", weaponTypes: ["staff", "dagger"], goals: { increase: ["attack"] }, rules: {} });
  assert.equal(result.build.equipment.main_hand.itemId, "staff");
  assert.equal(result.build.equipment.off_hand.itemId, "dagger");
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
