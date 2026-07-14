import assert from "node:assert/strict";
import test from "node:test";

import { createOptimizerAdapter, deriveObjectiveScales, diverseFinalistsWithSetRoutes, expandCompositeGoals, normalizeRankedGoals, optimizeAttributeAllocation, optimizeProgressionFinalistTask, optimizedResonanceSelection, optimizerItemSelection, rawPointsForAttributeGain, refineRuneConfiguration, resolveWeaponTypeConstraints, scoreRankedGoals, sourceStatObjectiveScore } from "../../web/tl-full-build-adapter.js";

test("set-route representatives survive bounded downstream finalist selection", () => {
  const rows = [
    { key: "general", setCounts: {}, evaluation: { score: 100, stats: { attack: 100 } } },
    { key: "alpha", setCounts: { alpha: 2 }, evaluation: { score: 2, stats: { attack: 2 } } },
    { key: "beta", setCounts: { beta: 4 }, evaluation: { score: 1, stats: { attack: 1 } } },
    { key: "artifact", setCounts: {}, structuralKeys: ["artifact-set:6"], evaluation: { score: 0, stats: { attack: 0 } } },
  ];
  const routes = [
    { id: "alpha:2", setId: "alpha", minimumPieces: 2, maximumPieces: 3 },
    { id: "beta:4", setId: "beta", minimumPieces: 4, maximumPieces: 4 },
  ];
  const selected = diverseFinalistsWithSetRoutes(rows, [{ id: "attack", components: ["attack"] }], 1, routes, ["artifact-set:6"]);
  assert.deepEqual(selected.map((row) => row.key), ["general", "alpha", "beta", "artifact"]);
});

test("same-item scratch and refit candidates preserve excluded potentials without cross-item inheritance", () => {
  const core = { emptyEquipmentSelection: () => ({ itemId: "", potentialId: "", traits: [] }), itemMaxLevel: () => 12 };
  const current = { itemId: "same", potentialId: "Potential_Stored", traits: [{ statId: "hp_max" }] };
  assert.equal(optimizerItemSelection(core, { id: "same" }, current).potentialId, "Potential_Stored");
  assert.equal(optimizerItemSelection(core, { id: "different" }, current).potentialId, "");
});

test("generated equipment candidates select one max-tier goal-aware resonance", () => {
  const item = { itemStats: { resonance: { wanted: { tiers: [10, 20] }, ignored: { tiers: [100, 200] } } } };
  const goals = normalizeRankedGoals({ increase: ["wanted"] });
  assert.deepEqual(optimizedResonanceSelection(item, goals, { wanted: 1 }), [{ statId: "wanted", tier: 2 }]);
});

test("candidate option scoring follows parent stats into typed PvP goals once", () => {
  const goals = expandCompositeGoals(normalizeRankedGoals({ increase: ["pvp_melee_critical_defense"] }));
  const scales = { pvp_melee_critical_defense: 100 };
  assert.equal(sourceStatObjectiveScore("all_critical_defense", 100, goals, scales), 1);
  assert.equal(sourceStatObjectiveScore("melee_critical_defense", 100, goals, scales), 1);
  assert.equal(sourceStatObjectiveScore("pvp_melee_critical_defense", 100, goals, scales), 1);
  const item = { itemStats: { resonance: { all_critical_defense: { tiers: [100] }, ignored: { tiers: [1000] } } } };
  assert.deepEqual(optimizedResonanceSelection(item, goals, scales), [{ statId: "all_critical_defense", tier: 1 }]);
});

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

test("ranked goals use tied ranks, explicit modes, and scale normalization", () => {
  const goals = normalizeRankedGoals({ priorities: [{ id: "endurance", rank: 1 }, { id: "health", rank: 2 }, { id: "evasion", rank: 2, mode: "at_least", minimum: 80 }] });
  assert.deepEqual(goals.map(({ id, rank, weight, mode, minimum, target }) => ({ id, rank, weight, mode, minimum, target })), [
    { id: "endurance", rank: 1, weight: 1, mode: "maximize", minimum: null, target: null },
    { id: "evasion", rank: 2, weight: 0.05, mode: "at_least", minimum: 80, target: null },
    { id: "health", rank: 2, weight: 0.05, mode: "maximize", minimum: null, target: null },
  ]);
  assert.equal(scoreRankedGoals({ endurance: 10, health: 1000 }, {}, { endurance: 10, health: 1000 }, goals), 1.05);
});

test("target goals enforce their value but stop rewarding excess", () => {
  const goals = normalizeRankedGoals({ priorities: [{ id: "cooldown", rank: 1, mode: "target", target: 80 }] });
  assert.deepEqual(goals.map(({ mode, minimum, target }) => ({ mode, minimum, target })), [{ mode: "target", minimum: 80, target: 80 }]);
  assert.equal(scoreRankedGoals({ cooldown: 80 }, {}, { cooldown: 100 }, goals), 0.8);
  assert.equal(scoreRankedGoals({ cooldown: 92.9 }, {}, { cooldown: 100 }, goals), 0.8);
});

test("rune refinement values synergy attributes through their exact breakpoint effects", () => {
  const core = {
    EQUIPMENT_SLOTS: [{ id: "head", label: "Head" }],
    runeCategoryForSlot: () => "head", slotById: () => ({ id: "head", label: "Head" }), statName: (id) => id, formatStat: (_id, value) => String(value),
    calculateBuild(build) {
      const synergy = build.equipment.head.runes?.[0]?.runeId === "synergy";
      const str = synergy ? 30 : 27;
      return { stats: [
        { id: "str", total: str, sources: synergy ? [{ type: "head_rune_synergy", sourceLabel: "Head: Rune Synergy", value: 3 }] : [] },
        { id: "hp_max", total: str >= 30 ? 100 : 10, sources: str >= 30 ? [{ type: "attribute_bracket", sourceLabel: "STR (30): Bonus", value: 100 }] : [] },
      ], runeSynergies: synergy ? { head: { name: "Strength Link", stats: { str: 3 } } } : {} };
    },
  };
  const build = { equipment: { head: { itemId: "hat", runes: [{ runeId: "direct" }] } } };
  const result = refineRuneConfiguration({
    core, build, attributes: { str: 0, dex: 0, int: 0, per: 0, con: 0 }, budget: 0,
    rankedGoals: normalizeRankedGoals({ increase: ["hp_max"] }), baseline: {}, scales: { hp_max: 100 },
    runeCandidatesByCategory: new Map([["head", [
      { key: "direct", selection: [{ runeId: "direct" }] },
      { key: "synergy", selection: [{ runeId: "synergy" }] },
    ]]]),
  });
  assert.equal(result.build.equipment.head.runes[0].runeId, "synergy");
  assert.equal(result.stats.hp_max, 100);
  assert.match(result.runeInsights[0].text, /\+3 str toward attribute milestones/);
});

test("a meaningful gain in priority one outweighs a complete lower-priority objective", () => {
  const goals = normalizeRankedGoals({ priorities: [{ id: "endurance", rank: 1 }, { id: "hit", rank: 2 }] });
  const scales = { endurance: 100, hit: 100 };
  assert.ok(scoreRankedGoals({ endurance: 10, hit: 0 }, {}, scales, goals)
    > scoreRankedGoals({ endurance: 0, hit: 100 }, {}, scales, goals));
});

test("ranked objective scoring stops at official absolute stat caps", () => {
  const goals = expandCompositeGoals(normalizeRankedGoals({ increase: ["skill_cooldown_modifier"] }));
  assert.equal(scoreRankedGoals({ skill_cooldown_modifier: 25000 }, {}, { skill_cooldown_modifier: 10000 }, goals), 2);
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
  for (const method of ["createScratchBuild", "loadArmoryBuild", "importQuestlogBuild", "listStats", "currentStats", "optimize"]) assert.equal(typeof adapter[method], "function");
  assert.equal(await adapter.loadArmoryBuild(), null);
  assert.deepEqual(await adapter.listStats(), [{ id: "attack", name: "attack" }]);
});

test("adapter reports formatted current source-build stats", async () => {
  const core = {
    data: { gameBuild: "test", statLabels: { attack: "Attack" }, items: [{ itemStats: { attack: 1 } }], runes: [], runeSynergies: [], itemSets: [], artifactSets: [] },
    indexes: {}, statName: (id) => id, formatStat: (_id, value) => `${value} power`,
    calculateBuild: () => ({ stats: [{ id: "attack", total: 123 }] }),
    createInitialBuild: () => ({ equipment: {}, artifacts: {}, supportSlots: {} }),
  };
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  assert.deepEqual(await adapter.currentStats({ build: { equipment: {} }, attributes: {} }), { attack: { value: 123, formattedValue: "123 power" } });
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
  assert.deepEqual(result.statDeltas, [{ id: "attack", name: "attack", delta: 5, formattedDelta: "5" }]);
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

test("scratch builds exclude unowned Heroic items when theoretical Heroics are disabled", async () => {
  const empty = () => ({ itemId: "", traits: [], heroicEffects: [], runes: [] });
  const items = {
    normal: { id: "normal", name: "Normal", grade: 41, equipmentType: "head" },
    heroic: { id: "heroic", name: "Heroic", grade: 51, equipmentType: "head" },
  };
  const core = {
    data: { gameBuild: "test", statLabels: { attack: "Attack" }, items: Object.values(items), runes: [], runeSynergies: [], itemSets: [], artifactSets: [] },
    indexes: { itemById: items, runeById: {} }, EQUIPMENT_SLOTS: [{ id: "head", label: "Head" }], ARTIFACT_SLOTS: [], WEAPON_SLOTS: [], WEAPON_TYPES: [], HEROIC_GRADE: 51,
    calculateBuild(build) { return { stats: [{ id: "attack", total: build.equipment.head.itemId === "heroic" ? 100 : 10 }] }; },
    slotSelectionContribution(_slot, selection) { return { attack: selection?.itemId === "heroic" ? 100 : selection?.itemId === "normal" ? 10 : 0 }; },
    slotItems: () => Object.values(items), slotById: () => ({ id: "head", types: ["head"] }), emptyEquipmentSelection: empty,
    itemMaxLevel: () => 80, heroicSlotGroupForSlot: () => "armor", statName: (id) => id, formatStat: (_id, value) => String(value), statPageFor: () => "combat", gradeColor: () => "#fff",
  };
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const result = await adapter.optimize({
    build: { build: { equipment: { head: empty() }, artifacts: {}, supportSlots: {} }, attributes: {}, sourceKind: "scratch" },
    sourceKind: "scratch", goals: { increase: ["attack"] }, rules: { allowUnownedHeroics: false },
  });
  assert.equal(result.build.equipment.head.itemId, "normal");
});

test("candidate cap ranks direct stats without copying them into score hints", async () => {
  const empty = () => ({ itemId: "", traits: [], heroicEffects: [], runes: [] });
  const itemRows = [
    ...["a", "b", "c", "d"].map((id) => ({ id, power: 10, guard: 0 })),
    ...["e", "f", "g", "h"].map((id) => ({ id, power: 0, guard: 10 })),
    { id: "z-balanced", power: 6, guard: 6 },
  ];
  const items = Object.fromEntries(itemRows.map((row) => [row.id, { ...row, name: row.id, grade: 41, equipmentType: "head" }]));
  const totals = (selection) => {
    const item = items[selection?.itemId];
    return { power: item?.power ?? 0, guard: item?.guard ?? 0 };
  };
  const core = {
    data: { gameBuild: "test", statLabels: { power: "Power", guard: "Guard" }, items: Object.values(items), runes: [], runeSynergies: [], itemSets: [], artifactSets: [] },
    indexes: { itemById: items, runeById: {} }, EQUIPMENT_SLOTS: [{ id: "head", label: "Head" }], ARTIFACT_SLOTS: [], WEAPON_SLOTS: [], WEAPON_TYPES: [], HEROIC_GRADE: 51,
    calculateBuild(build) { const row = totals(build.equipment.head); return { stats: Object.entries(row).map(([id, total]) => ({ id, total })) }; },
    slotSelectionContribution(_slot, selection) { return totals(selection); },
    slotItems: () => Object.values(items), slotById: () => ({ id: "head", types: ["head"] }), emptyEquipmentSelection: empty,
    itemMaxLevel: () => 80, heroicSlotGroupForSlot: () => "", statName: (id) => id, formatStat: (_id, value) => String(value), statPageFor: () => "combat", gradeColor: () => "#fff",
  };
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const result = await adapter.optimize({
    build: { build: { equipment: { head: empty() }, artifacts: {}, supportSlots: {} }, attributes: {}, sourceKind: "scratch" },
    sourceKind: "scratch", goals: { priorities: [{ id: "power", rank: 1 }, { id: "guard", rank: 1 }] }, rules: {},
  });

  assert.equal(result.build.equipment.head.itemId, "z-balanced");
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

test("existing-build optimization locks weapon families while preserving source progression", async () => {
  let replacementDeltaCalls = 0;
  const items = {
    bow: { id: "bow", name: "Bow", grade: 41, equipmentType: "bow", power: 5 },
    bow2: { id: "bow2", name: "Better Bow", grade: 41, equipmentType: "bow", power: 10 },
    staff: { id: "staff", name: "Staff", grade: 41, equipmentType: "staff", power: 100 },
    dagger: { id: "dagger", name: "Dagger", grade: 41, equipmentType: "dagger", power: 5 },
    dagger2: { id: "dagger2", name: "Better Dagger", grade: 41, equipmentType: "dagger", power: 10 },
    sword: { id: "sword", name: "Sword", grade: 41, equipmentType: "sword", power: 100 },
  };
  const empty = () => ({ itemId: "", traits: [], heroicEffects: [], runes: [] });
  const core = {
    data: { gameBuild: "test", statLabels: { attack: "Attack" }, items: Object.values(items), runes: [], runeSynergies: [], itemSets: [], artifactSets: [] },
    indexes: { itemById: items, runeById: {} },
    EQUIPMENT_SLOTS: [{ id: "main_hand", label: "Main" }, { id: "off_hand", label: "Off" }], ARTIFACT_SLOTS: [],
    WEAPON_SLOTS: ["main_hand", "off_hand"], WEAPON_TYPES: ["bow", "staff", "dagger", "sword"], HEROIC_GRADE: 51,
    calculateBuild(build) {
      const total = Object.values(build.equipment).reduce((sum, selection) => sum + Number(items[selection?.itemId]?.power ?? 0), 0);
      return { stats: [{ id: "attack", total }] };
    },
    slotSelectionContribution(_slot, selection) { return { attack: Number(items[selection?.itemId]?.power ?? 0) }; },
    slotReplacementDelta(_slot, selection) { replacementDeltaCalls += 1; return { attack: Number(items[selection?.itemId]?.power ?? 0) }; },
    slotItems: () => Object.values(items), slotById: (id) => ({ id, label: id, types: core.WEAPON_TYPES }),
    emptyEquipmentSelection: empty, itemMaxLevel: () => 12, heroicSlotGroupForSlot: () => "",
    statName: (id) => id, formatStat: (_id, value) => String(value), statPageFor: () => "combat", gradeColor: () => "#fff", label: (id) => id,
  };
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const source = { build: { equipment: { main_hand: { ...empty(), itemId: "bow" }, off_hand: { ...empty(), itemId: "dagger" } }, artifacts: {}, supportSlots: {}, skills: [{ skillId: "bow-passive" }], masteries: { bow: { level: 1 } } }, attributes: {}, sourceKind: "armory" };
  const result = await adapter.optimize({ build: source, goals: { increase: ["attack"] }, rules: {} });

  assert.equal(result.build.equipment.main_hand.itemId, "bow2");
  assert.equal(result.build.equipment.off_hand.itemId, "dagger2");
  assert.ok(replacementDeltaCalls > 0, "existing weapon candidate hints must use replacement deltas");
  assert.ok(result.assumptions.some((text) => text.includes("Weapon families were locked")));
  await assert.rejects(() => adapter.optimize({ build: source, weaponTypes: ["staff", "dagger"], goals: { increase: ["attack"] }, rules: {} }), /Changing weapon families/);

  const calculateBuild = core.calculateBuild;
  core.calculateBuild = (...args) => ({ ...calculateBuild(...args), validation: { issues: [{ severity: "error", code: "mastery_budget_exceeded", message: "Bow mastery budget exceeded." }] } });
  await assert.rejects(() => adapter.optimize({ build: source, goals: { increase: ["attack"] }, rules: {} }), /not calculation-legal.*mastery budget exceeded/i);
});

test("saved Armory state is returned with build and attributes", async () => {
  const core = { data: { gameBuild: "test", statLabels: {} }, indexes: {} };
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: true, data: { build: { name: "Mine" }, attributes: { str: 4 } } }) });
  const saved = await adapter.loadArmoryBuild();
  assert.equal(saved.name, "Mine");
  assert.equal(saved.attributes.str, 4);
});

function perkOptimizerCore({ slots, items, invalidWhen = () => false }) {
  const itemById = Object.fromEntries(items.map((item) => [item.id, item]));
  const empty = () => ({ itemId: "", perkId: "", traits: [], heroicEffects: [], runes: [] });
  const selectedPerk = (item, selection) => (item?.availablePerks ?? []).find((perk) => perk.id === selection?.perkId) ?? null;
  const passiveIds = (item, selection) => [...new Set([item?.passives?.id, selectedPerk(item, selection)?.passive?.id].filter(Boolean))];
  const selectionAttack = (selection) => {
    const item = itemById[selection?.itemId];
    const traitAttack = (selection?.traits ?? []).reduce((sum, trait) => {
      const tiers = item?.itemStats?.traits?.[trait.statId] ?? [];
      return sum + Number(tiers[Math.max(0, Number(trait.tier ?? 1) - 1)] ?? 0);
    }, 0);
    return Number(item?.attack ?? 0) + Number(selectedPerk(item, selection)?.attack ?? 0) + traitAttack;
  };
  const core = {
    data: { gameBuild: "test", statLabels: { attack: "Attack" }, items, runes: [], runeSynergies: [], itemSets: [], artifactSets: [] },
    indexes: { itemById, runeById: {} },
    EQUIPMENT_SLOTS: slots.map((id) => ({ id, label: id })), ARTIFACT_SLOTS: [], WEAPON_SLOTS: [], WEAPON_TYPES: [], HEROIC_GRADE: 51,
    calculateBuild(build) {
      const selections = Object.values(build.equipment);
      const seen = new Set();
      const invalid = selections.some((selection) => invalidWhen(selection));
      let total = 0;
      for (const selection of selections) {
        const item = itemById[selection?.itemId];
        const perk = selectedPerk(item, selection);
        total += Number(item?.attack ?? 0);
        total += (selection?.traits ?? []).reduce((sum, trait) => {
          const tiers = item?.itemStats?.traits?.[trait.statId] ?? [];
          return sum + Number(tiers[Math.max(0, Number(trait.tier ?? 1) - 1)] ?? 0);
        }, 0);
        if (perk && !seen.has(perk.passive.id)) {
          seen.add(perk.passive.id);
          total += Number(perk.attack ?? 0);
        }
      }
      return {
        stats: [{ id: "attack", total }],
        validation: { issues: [
          ...(invalid ? [{ severity: "error", code: "invalid_candidate", message: "Invalid candidate." }] : []),
        ] },
      };
    },
    slotSelectionContribution(_slot, selection) { return { attack: selectionAttack(selection) }; },
    slotItems: (slot) => items.filter((item) => item.equipmentType === slot.id),
    slotById: (id) => ({ id, label: id, types: [id] }), emptyEquipmentSelection: empty,
    itemMaxLevel: () => 12, heroicSlotGroupForSlot: () => "", statName: (id) => id,
    formatStat: (_id, value) => String(value), statPageFor: () => "combat", gradeColor: () => "#fff", label: (id) => id,
    calculableItemPerkVariants(item) {
      return [{ perkId: "", perk: null, passiveId: "", requiredWeapon: "" }, ...(item.availablePerks ?? [])
        .filter((perk) => perk.calculable)
        .map((perk) => ({ perkId: perk.id, perk, passiveId: perk.passive.id, requiredWeapon: "" }))];
    },
    itemPassiveComplexIds: passiveIds,
  };
  return { core, empty };
}

test("persistent Skill Core variants participate in exact optimizer scoring and survive the result", async () => {
  const items = [
    { id: "plain", name: "Plain", grade: 41, equipmentType: "head", attack: 12 },
    { id: "carrier", name: "Carrier", grade: 41, equipmentType: "head", attack: 5, availablePerks: [
      { id: "persistent-core", calculable: true, attack: 20, passive: { id: "persistent-passive", name: "Persistent" } },
      { id: "conditional-core", calculable: false, attack: 1000, passive: { id: "conditional-passive", name: "Conditional" } },
    ] },
  ];
  const { core, empty } = perkOptimizerCore({ slots: ["head"], items });
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const result = await adapter.optimize({
    build: { build: { equipment: { head: empty() }, artifacts: {}, supportSlots: {} }, attributes: {}, sourceKind: "scratch" },
    sourceKind: "scratch", goals: { increase: ["attack"] }, rules: {},
  });

  assert.equal(result.build.equipment.head.itemId, "carrier");
  assert.equal(result.build.equipment.head.perkId, "persistent-core");
  assert.notEqual(result.build.equipment.head.perkId, "conditional-core");
  assert.ok(result.assumptions.some((text) => text.includes("decoded-proven persistent Skill Cores")));
});

test("an unsupported current core is preserved when its exact item is retained", async () => {
  const items = [{ id: "carrier", name: "Carrier", grade: 41, equipmentType: "head", attack: 5, availablePerks: [
    { id: "persistent-core", calculable: true, attack: 20, passive: { id: "persistent-passive" } },
    { id: "unsupported-core", calculable: false, attack: 0, passive: { id: "unsupported-passive" } },
  ] }];
  const { core, empty } = perkOptimizerCore({ slots: ["head"], items });
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const sourceSelection = { ...empty(), itemId: "carrier", perkId: "unsupported-core" };
  const result = await adapter.optimize({
    build: { build: { equipment: { head: sourceSelection }, artifacts: {}, supportSlots: {} }, attributes: {}, sourceKind: "armory" },
    goals: { increase: ["attack"] }, rules: {},
  });
  assert.equal(result.build.equipment.head.itemId, "carrier");
  assert.equal(result.build.equipment.head.perkId, "unsupported-core");
});

test("a generated current-item variant can improve traits without losing its selected core", async () => {
  const items = [{
    id: "carrier", name: "Carrier", grade: 41, equipmentType: "head", attack: 5,
    itemStats: { traits: { attack: [3, 6, 9] } },
    availablePerks: [{ id: "persistent-core", calculable: true, attack: 20, passive: { id: "persistent-passive" } }],
  }];
  const { core, empty } = perkOptimizerCore({ slots: ["head"], items });
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const sourceSelection = { ...empty(), itemId: "carrier", perkId: "persistent-core" };
  const result = await adapter.optimize({
    build: { build: { equipment: { head: sourceSelection }, artifacts: {}, supportSlots: {} }, attributes: {}, sourceKind: "armory" },
    goals: { increase: ["attack"] }, rules: { optimizeThreeTraits: true },
  });

  assert.equal(result.build.equipment.head.itemId, "carrier");
  assert.equal(result.build.equipment.head.perkId, "persistent-core");
  assert.deepEqual(result.build.equipment.head.traits, [{ statId: "attack", tier: 3 }]);
});

test("optimizer retains strong duplicate-core items and exact scoring activates one copy", async () => {
  const shared = (id, type, attack) => ({ id, name: id, grade: 41, equipmentType: type, attack, availablePerks: [
    { id: `${id}-core`, calculable: true, attack: 10, passive: { id: "shared-passive" } },
  ] });
  const items = [shared("head-carrier", "head", 1), shared("chest-carrier", "chest", 1)];
  const { core, empty } = perkOptimizerCore({ slots: ["head", "chest"], items });
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const result = await adapter.optimize({
    build: { build: { equipment: { head: empty(), chest: empty() }, artifacts: {}, supportSlots: {} }, attributes: {}, sourceKind: "scratch" },
    sourceKind: "scratch", goals: { increase: ["attack"] }, rules: {},
  });

  assert.equal(result.build.equipment.head.itemId, "head-carrier");
  assert.equal(result.build.equipment.chest.itemId, "chest-carrier");
  assert.equal(core.calculateBuild(result.build).stats[0].total, 12);
  assert.equal(core.calculateBuild(result.build).validation.issues.length, 0);
  assert.ok(result.assumptions.some((text) => text.includes("only one copy")));
});

test("exact evaluation refuses an invalid finalist", async () => {
  const items = [{ id: "carrier", name: "Carrier", grade: 41, equipmentType: "head", attack: 1, availablePerks: [
    { id: "invalid-core", calculable: true, attack: 100, passive: { id: "invalid-passive" } },
  ] }];
  const { core, empty } = perkOptimizerCore({ slots: ["head"], items, invalidWhen: (selection) => selection.perkId === "invalid-core" });
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  await assert.rejects(() => adapter.optimize({
    build: { build: { equipment: { head: empty() }, artifacts: {}, supportSlots: {} }, attributes: {}, sourceKind: "scratch" },
    sourceKind: "scratch", goals: { increase: ["attack"] }, rules: {},
  }), /No calculation-legal finalist survived exact evaluation/);
});

test("candidate generation excludes an unmapped persistent item before beam scoring", async () => {
  const items = [
    { id: "legal", name: "Legal", grade: 41, equipmentType: "head", attack: 10 },
    { id: "unmapped", name: "Unmapped", grade: 41, equipmentType: "head", attack: 1000, passives: { id: "unmapped-passive" } },
  ];
  const { core, empty } = perkOptimizerCore({ slots: ["head"], items });
  core.itemSelectionCalculationStatus = (item) => ({ state: item.id === "unmapped" ? "provisional" : "legal" });
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const result = await adapter.optimize({
    build: { build: { equipment: { head: empty() }, artifacts: {}, supportSlots: {} }, attributes: {}, sourceKind: "scratch" },
    sourceKind: "scratch", goals: { increase: ["attack"] }, rules: {},
  });
  assert.equal(result.build.equipment.head.itemId, "legal");
});

function gearAwareProgressionFixture(itemCount = 9) {
  const items = Array.from({ length: itemCount }, (_, index) => ({
    id: `item-${index}`,
    name: `Item ${index}`,
    grade: 41,
    equipmentType: "head",
    attack: 100 - index,
    guard: index,
  }));
  const itemById = Object.fromEntries(items.map((item) => [item.id, item]));
  const empty = () => ({ itemId: "", traits: [], heroicEffects: [], runes: [] });
  const evaluatedAttributes = [];
  const progressionCalls = [];
  const core = {
    data: { gameBuild: "test", statLabels: { attack: "Attack", guard: "Guard" }, items, runes: [], runeSynergies: [], itemSets: [], artifactSets: [] },
    indexes: { itemById, runeById: {} },
    EQUIPMENT_SLOTS: [{ id: "head", label: "Head" }], ARTIFACT_SLOTS: [], WEAPON_SLOTS: [], WEAPON_TYPES: [], HEROIC_GRADE: 51,
    calculateBuild(build, attributes = {}, options = {}) {
      const itemId = build.equipment.head.itemId;
      const item = itemById[itemId];
      const refined = build.skills?.[0]?.skillId === `refined:${itemId}`;
      if (refined) evaluatedAttributes.push(structuredClone(attributes));
      const progressionBonus = !refined ? 0 : itemId === "item-1" ? 50 : itemId === "item-2" ? 1000 : 0;
      const scenarioBonus = refined && options.scenario?.progressionBoostItemId === itemId ? 2000 : 0;
      const minimumPenalty = build.minimumPenalty ? 1000 : 0;
      return {
        stats: [
          { id: "attack", total: Number(item?.attack ?? 0) + Number(attributes.dex ?? 0) + progressionBonus + scenarioBonus - minimumPenalty },
          { id: "guard", total: Number(item?.guard ?? 0) },
        ],
        validation: { issues: refined && itemId === "item-2" ? [{ severity: "error", code: "illegal_progression", message: "Illegal progression." }] : [] },
      };
    },
    slotSelectionContribution(_slot, selection) { return { attack: Number(itemById[selection?.itemId]?.attack ?? 0), guard: Number(itemById[selection?.itemId]?.guard ?? 0) }; },
    slotItems: () => items,
    slotById: () => ({ id: "head", types: ["head"] }),
    emptyEquipmentSelection: empty,
    itemMaxLevel: () => 80,
    heroicSlotGroupForSlot: () => "",
    statName: (id) => id,
    formatStat: (_id, value) => String(value),
    statPageFor: () => "combat",
    gradeColor: () => "#fff",
    label: (id) => id,
    bindCombatScenarioToBuild: (scenario) => structuredClone(scenario),
  };
  const optimizeProgression = ({ build, settings, evaluate }) => {
    const refined = structuredClone(build);
    const itemId = refined.equipment.head.itemId;
    progressionCalls.push(itemId || "seed");
    refined.skills = [{ skillId: `refined:${itemId}`, level: 20 }];
    evaluate(refined);
    return {
      build: refined,
      settings: { ...settings, skillLevelCap: 20, masteryPointsByWeapon: {}, gearItemId: itemId },
      summary: { masteryPointsByWeapon: {}, passiveSkills: 1, unifiedMasteries: 0, gearItemId: itemId },
    };
  };
  return { core, empty, optimizeProgression, progressionCalls, evaluatedAttributes };
}

test("gear-aware scratch progression reranks exact finalists once and drops illegal refinements", async () => {
  const fixture = gearAwareProgressionFixture();
  const adapter = await createOptimizerAdapter({
    core: fixture.core,
    storage: {},
    loadArmoryState: () => ({ ok: false }),
    optimizeScratchProgression: fixture.optimizeProgression,
  });
  const result = await adapter.optimize({
    build: { build: { equipment: { head: fixture.empty() }, artifacts: {}, supportSlots: {} }, attributes: { dex: 7 }, sourceKind: "scratch" },
    sourceKind: "scratch",
    goals: { priorities: [{ id: "attack", rank: 1 }, { id: "guard", rank: 2 }] },
    progression: { enabled: true },
    rules: {},
  });

  assert.equal(result.build.equipment.head.itemId, "item-1", "gear-dependent progression should reverse the preliminary item ranking");
  assert.equal(result.build.skills[0].skillId, "refined:item-1");
  assert.equal(result.progression.settings.gearItemId, "item-1");
  assert.equal(result.progressionFinalistsEvaluated, 4);
  assert.deepEqual(fixture.progressionCalls, ["seed", "item-0", "item-1", "item-2", "item-3"]);
  assert.ok(result.tuningFrontier.every((row) => row.build.skills?.[0]?.skillId === `refined:${row.build.equipment.head.itemId}`));
  assert.ok(result.tuningFrontier.every((row) => row.progression?.settings?.gearItemId === row.build.equipment.head.itemId));
  assert.ok(result.alternatives.every((row) => row.progression?.settings?.gearItemId));
  assert.ok(result.tuningFrontier.every((row) => row.build.equipment.head.itemId !== "item-2"), "illegal refined finalists must not reach result surfaces");
  assert.ok(fixture.evaluatedAttributes.every((attributes) => attributes.dex === 7), "progression must evaluate against each finalist's fixed attributes");
});

test("gear-aware scratch progression uses deterministic fast and thorough finalist bounds", async () => {
  const run = async (depth) => {
    const fixture = gearAwareProgressionFixture();
    const adapter = await createOptimizerAdapter({ core: fixture.core, storage: {}, loadArmoryState: () => ({ ok: false }), optimizeScratchProgression: fixture.optimizeProgression });
    const result = await adapter.optimize({
      build: { build: { equipment: { head: fixture.empty() }, artifacts: {}, supportSlots: {} }, attributes: { dex: 7 }, sourceKind: "scratch" },
      sourceKind: "scratch", depth, goals: { priorities: [{ id: "attack", rank: 1 }, { id: "guard", rank: 2 }] }, progression: { enabled: true }, rules: {},
    });
    return { result, calls: fixture.progressionCalls };
  };
  const fastA = await run("fast");
  const fastB = await run("fast");
  const thorough = await run("thorough");

  assert.equal(fastA.result.progressionFinalistsEvaluated, 4);
  assert.equal(thorough.result.progressionFinalistsEvaluated, 8);
  assert.deepEqual(fastA.calls, fastB.calls);
  assert.deepEqual(fastA.result.build, fastB.result.build);
  assert.equal(fastA.calls.length, 5, "one seed pass plus one pass for each of four fast finalists");
  assert.equal(thorough.calls.length, 9, "one seed pass plus one pass for each of eight thorough finalists");
});

test("progression-disabled scratch requests keep the pre-existing result path", async () => {
  const fixture = gearAwareProgressionFixture();
  const adapter = await createOptimizerAdapter({ core: fixture.core, storage: {}, loadArmoryState: () => ({ ok: false }), optimizeScratchProgression: fixture.optimizeProgression });
  const result = await adapter.optimize({
    build: { build: { equipment: { head: fixture.empty() }, artifacts: {}, supportSlots: {} }, attributes: { dex: 7 }, sourceKind: "scratch" },
    sourceKind: "scratch", goals: { priorities: [{ id: "attack", rank: 1 }, { id: "guard", rank: 2 }] }, progression: { enabled: false }, rules: {},
  });
  assert.equal(result.build.equipment.head.itemId, "item-0");
  assert.equal(result.progression, null);
  assert.equal(result.progressionFinalistsEvaluated, 0);
  assert.deepEqual(fixture.progressionCalls, []);
  assert.ok(result.tuningFrontier.every((row) => !("progression" in row)));
});

test("adapter progression rerank uses the bound scenario for every finalist", async () => {
  const fixture = gearAwareProgressionFixture();
  const adapter = await createOptimizerAdapter({ core: fixture.core, storage: {}, loadArmoryState: () => ({ ok: false }), optimizeScratchProgression: fixture.optimizeProgression });
  const result = await adapter.optimize({
    build: { build: { equipment: { head: fixture.empty() }, artifacts: {}, supportSlots: {} }, attributes: { dex: 7 }, sourceKind: "scratch" },
    sourceKind: "scratch",
    goals: { priorities: [{ id: "attack", rank: 1 }, { id: "guard", rank: 2 }] },
    progression: { enabled: true },
    scenario: { progressionBoostItemId: "item-3" },
    rules: {},
  });
  assert.equal(result.build.equipment.head.itemId, "item-3");
  assert.equal(result.progression.settings.gearItemId, "item-3");
  assert.equal(result.scenario.progressionBoostItemId, "item-3");
});

test("adapter drops every progression refinement that violates protected stats or goal minimums", async () => {
  const fixture = gearAwareProgressionFixture();
  const penalizedProgression = (args) => {
    const result = fixture.optimizeProgression(args);
    if (result.build.equipment.head.itemId) {
      result.build.minimumPenalty = true;
      args.evaluate(result.build);
    }
    return result;
  };
  const adapter = await createOptimizerAdapter({ core: fixture.core, storage: {}, loadArmoryState: () => ({ ok: false }), optimizeScratchProgression: penalizedProgression });
  await assert.rejects(() => adapter.optimize({
    build: { build: { equipment: { head: fixture.empty() }, artifacts: {}, supportSlots: {} }, attributes: { dex: 7 }, sourceKind: "scratch" },
    sourceKind: "scratch",
    goals: { priorities: [{ id: "attack", rank: 1, minimum: 1 }], protect: ["attack"] },
    progression: { enabled: true },
    rules: {},
  }), /No build satisfies the protected or minimum stat constraints/);
});

test("progression finalist task keeps attributes fixed and reports protected-stat rejection", () => {
  const fixture = gearAwareProgressionFixture();
  const build = { equipment: { head: { ...fixture.empty(), itemId: "item-1" } }, artifacts: {}, supportSlots: {} };
  const result = optimizeProgressionFinalistTask(fixture.core, { build, attributes: { dex: 7 } }, {
    weapons: [], settings: { enabled: true }, rankedGoals: [{ id: "attack", components: ["attack"], weight: 1 }],
    baseline: { attack: 0 }, scales: { attack: 1 }, protectedStats: { attack: { min: 1000 } }, minimums: { attack: 1000 }, includeSetEffects: true, scenario: null,
  }, fixture.optimizeProgression);
  assert.deepEqual(result.attributes, { dex: 7 });
  assert.equal(result.protectedStatsSatisfied, false);
  assert.equal(result.minimumsSatisfied, false);
  assert.equal(result.build.equipment.head.itemId, "item-1");
  assert.equal(result.progression.settings.gearItemId, "item-1");
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
