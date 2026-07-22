// Private, local-only loadout forensics. This script is deliberately outside
// web/ and is not referenced by any application route or deployment entrypoint.

import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../../web/tl-core.js";
import { allocatedAttributeValue } from "../../web/tl-questlog-rules.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const defaultObservation = join(root, "fixtures", "build-forensics", "varkesh-status-2026-07-13.json");
const observationPath = resolve(process.argv[2] ?? defaultObservation);
const outputPath = resolve(process.argv[3] ?? join(root, "out", "build-forensics", "varkesh-status-report.json"));

const observation = JSON.parse(await readFile(observationPath, "utf8"));
assert.equal(observation.schema, "tl-helper.private-build-forensics-observation");
assert.equal(observation.schemaVersion, 1);

const appData = await loadWebDataFromFile(join(root, "web", "data", "app-data.json"));
await core.initCore(appData);

const displayed = observation.displayed;
const raw = {
  str: displayed.str,
  dex: displayed.dex,
  int: displayed.int,
  per: displayed.per,
  con: displayed.con,
  attack_power_main_hand_min: displayed.attack_power_main_hand_min,
  attack_power_main_hand_max: displayed.attack_power_main_hand_max,
  damage_reduction: displayed.damage_reduction,
  shield_block_chance: displayed.shield_block_chance_percent * 100,
  melee_armor: displayed.melee_armor,
  range_armor: displayed.range_armor,
  magic_armor: displayed.magic_armor,
  melee_accuracy: displayed.melee_accuracy * 10,
  range_accuracy: displayed.range_accuracy * 10,
  magic_accuracy: displayed.magic_accuracy * 10,
  melee_critical_attack: displayed.melee_critical_attack * 10,
  range_critical_attack: displayed.range_critical_attack * 10,
  magic_critical_attack: displayed.magic_critical_attack * 10,
  melee_evasion: displayed.melee_evasion * 10,
  range_evasion: displayed.range_evasion * 10,
  magic_evasion: displayed.magic_evasion * 10,
  melee_critical_defense: displayed.melee_critical_defense * 10,
  range_critical_defense: displayed.range_critical_defense * 10,
  magic_critical_defense: displayed.magic_critical_defense * 10,
  melee_double_attack: displayed.melee_double_attack * 10,
  range_double_attack: displayed.range_double_attack * 10,
  melee_double_defense: displayed.melee_double_defense * 10,
  range_double_defense: displayed.range_double_defense * 10,
  hp_max: displayed.hp_max,
  cost_max: displayed.cost_max,
  cost_consumption_modifier: displayed.cost_consumption_modifier_percent * 100,
  heal_modifier: displayed.heal_modifier_percent * 100,
  shield_modifier: displayed.shield_modifier_percent * 100,
  magic_doll_heal_modifier: displayed.magic_doll_heal_modifier_percent * 100,
  potion_heal_modifier: displayed.potion_heal_modifier_percent * 100,
  hp_regen: displayed.hp_regen * 1000,
  cost_regen: displayed.cost_regen * 1000,
  stamina_regen: displayed.stamina_regen * 1000,
  skill_cooldown_modifier: displayed.skill_cooldown_modifier_percent * 100,
  attack_speed_modifier: displayed.attack_speed_modifier_percent * 100,
  skill_heal_taken_modifier: displayed.skill_heal_taken_modifier_percent * 100,
  shield_taken_modifier: displayed.shield_taken_modifier_percent * 100,
  attack_range_modifier: displayed.attack_range_modifier_percent * 100,
};

const iconMatch = observation.screenshot.mainWeaponIconMatch;
const mainItem = core.indexes.itemById[iconMatch.itemId];
assert(mainItem, `Unknown icon-matched item: ${iconMatch.itemId}`);
assert.equal(mainItem.equipmentType, "sword");
assert(core.getItemLevels(mainItem).includes(Number(iconMatch.itemLevel)));

function totalsFor(build, attributes = { str: 0, dex: 0, int: 0, per: 0, con: 0 }) {
  return Object.fromEntries(core.calculateBuild(build, attributes).stats.map((row) => [row.id, row.total]));
}

function allocatedInputForContribution(targetContribution) {
  if (targetContribution < -1e-6) return null;
  for (let input = 0; input <= 500; input += 1) {
    if (Math.abs(allocatedAttributeValue(input) - targetContribution) < 1e-6) return input;
  }
  return null;
}

function attributeInputsToReachObserved(build) {
  const fixed = totalsFor(build);
  const inputs = {};
  for (const statId of ["str", "dex", "int", "per", "con"]) {
    const input = allocatedInputForContribution(raw[statId] - (fixed[statId] ?? 0));
    if (input === null) return null;
    inputs[statId] = input;
  }
  return inputs;
}

function anchoredBuild(offhand = null) {
  const build = core.createInitialBuild();
  build.equipment.main_hand = {
    ...core.emptyEquipmentSelection(),
    itemId: mainItem.id,
    level: Number(iconMatch.itemLevel),
  };
  if (offhand) {
    build.equipment.off_hand = {
      ...core.emptyEquipmentSelection(),
      itemId: offhand.item.id,
      level: offhand.level,
    };
  }
  return build;
}

const anchorTotals = totalsFor(anchoredBuild());
const anchorAttributeInputs = attributeInputsToReachObserved(anchoredBuild());
assert(anchorAttributeInputs, "The observed attributes cannot be reached from the anchored weapon baseline");
const anchorAtObservedAttributes = totalsFor(anchoredBuild(), anchorAttributeInputs);
const anchorStats = [
  "str", "dex", "int", "per", "con",
  "attack_power_main_hand_min", "attack_power_main_hand_max",
  "shield_block_chance", "damage_reduction",
].map((statId) => ({
  statId,
  observedRaw: raw[statId],
  anchoredRaw: anchorTotals[statId] ?? 0,
  residualRaw: raw[statId] - (anchorTotals[statId] ?? 0),
  observedDisplay: core.formatStat(statId, raw[statId]),
  anchoredDisplay: core.formatStat(statId, anchorTotals[statId] ?? 0),
  residualDisplay: core.formatStat(statId, raw[statId] - (anchorTotals[statId] ?? 0)),
}));

// This is only a conservative rejection pass. A candidate is rejected if its
// fixed, no-trait contribution already exceeds a visible total that is built
// from non-negative static sources in the current calculator. Passing does not
// make a candidate likely or prove that it is equipped.
const nonNegativeBounds = [
  "str", "dex", "int", "per", "con", "hp_max", "cost_max",
  "damage_reduction", "shield_block_chance",
  "melee_armor", "range_armor", "magic_armor",
  "melee_accuracy", "range_accuracy", "magic_accuracy",
  "melee_critical_attack", "range_critical_attack", "magic_critical_attack",
  "melee_evasion", "range_evasion", "magic_evasion",
  "melee_critical_defense", "range_critical_defense", "magic_critical_defense",
  "melee_double_defense", "range_double_defense",
];
const positiveSourceAssumptionBounds = [...nonNegativeBounds, "attack_speed_modifier", "skill_cooldown_modifier"];
const expandedTargets = {
  all_accuracy: ["melee_accuracy", "range_accuracy", "magic_accuracy"],
  all_critical_attack: ["melee_critical_attack", "range_critical_attack", "magic_critical_attack"],
  all_double_attack: ["melee_double_attack", "range_double_attack"],
};

const greatswordCandidates = [];
for (const item of appData.items.filter((entry) => entry.equipmentType === "sword2h")) {
  for (const level of core.getItemLevels(item)) {
    const candidateBuild = anchoredBuild({ item, level });
    const compatibility = core.itemCompatibility("off_hand", item, anchoredBuild());
    const requiredAttributeInputs = attributeInputsToReachObserved(candidateBuild);
    const candidateTotals = requiredAttributeInputs ? totalsFor(candidateBuild, requiredAttributeInputs) : totalsFor(candidateBuild);
    const violations = nonNegativeBounds.flatMap((statId) => {
      const target = raw[statId];
      const value = candidateTotals[statId] ?? 0;
      if (target === undefined || value <= target + 1e-6) return [];
      return [{ statId, candidateRaw: value, observedRaw: target }];
    });
    greatswordCandidates.push({
      itemId: item.id,
      name: item.name,
      grade: item.grade,
      level,
      compatibleWithAnchoredMainHand: compatibility.allowed,
      compatibilityReason: compatibility.reason,
      feasibleUnderFixedUpperBounds: compatibility.allowed && requiredAttributeInputs !== null && violations.length === 0,
      requiredAttributeInputs,
      violations,
      fixedDeltaFromOffhand: Object.fromEntries(nonNegativeBounds.flatMap((statId) => {
        const delta = (candidateTotals[statId] ?? 0) - (anchorTotals[statId] ?? 0);
        return delta ? [[statId, delta]] : [];
      })),
    });
  }
}

const feasible = greatswordCandidates.filter((row) => row.feasibleUnderFixedUpperBounds);
const feasibleItems = [...new Set(feasible.map((row) => row.itemId))];
const rejectedItems = [...new Set(greatswordCandidates.filter((row) => !row.feasibleUnderFixedUpperBounds).map((row) => row.itemId))]
  .filter((itemId) => !feasibleItems.includes(itemId));
const rejectedItemDetails = rejectedItems.map((itemId) => {
  const rows = greatswordCandidates.filter((row) => row.itemId === itemId);
  return {
    itemId,
    name: rows[0]?.name ?? itemId,
    testedLevels: rows.map((row) => row.level),
    violatedStats: [...new Set(rows.flatMap((row) => row.violations.map((violation) => violation.statId)))],
    attributeFloorExceeded: rows.some((row) => row.requiredAttributeInputs === null),
    compatibilityReasons: [...new Set(rows.map((row) => row.compatibilityReason).filter(Boolean))],
  };
});

const heroicRolls = ["random_stat_group_1", "random_stat_group_2"].map((groupId) => ({
  groupId,
  possibilities: (mainItem.itemStats?.[groupId] ?? []).map((row) => ({
    statId: row.stat_id,
    minRaw: row.levels?.[0] ?? row.base_value,
    maxRaw: row.levels?.at(-1) ?? row.base_value,
    minDisplay: core.formatStat(row.stat_id, row.levels?.[0] ?? row.base_value),
    maxDisplay: core.formatStat(row.stat_id, row.levels?.at(-1) ?? row.base_value),
  })),
}));

const heroicEffectConstraints = [0, 1].map((groupIndex) => ({
  groupNumber: groupIndex + 1,
  possibilities: core.heroicEffectOptions(mainItem, groupIndex).map((option) => {
    const feasibleLevels = [];
    const exactClosures = [];
    for (let level = 0; level <= option.maxLevel; level += 1) {
      const build = anchoredBuild();
      build.equipment.main_hand.heroicEffects = Array.from({ length: groupIndex + 1 }, (_, index) => (
        index === groupIndex ? { statId: option.statId, level, levelKnown: true } : { statId: "", level: 0, levelKnown: false }
      ));
      const attributeInputs = attributeInputsToReachObserved(build);
      if (!attributeInputs) continue;
      const totals = totalsFor(build, attributeInputs);
      const violations = positiveSourceAssumptionBounds.filter((statId) => raw[statId] !== undefined && (totals[statId] ?? 0) > raw[statId] + 1e-6);
      if (!violations.length) {
        feasibleLevels.push({ level, rawValue: core.heroicEffectValue(option, level), displayValue: core.formatStat(option.statId, core.heroicEffectValue(option, level)) });
        const affectedTargets = expandedTargets[option.statId] ?? [option.statId];
        const exactStats = affectedTargets.filter((statId) => raw[statId] !== undefined && Math.abs((totals[statId] ?? 0) - raw[statId]) < 1e-6);
        if (exactStats.length) exactClosures.push({ level, exactStats });
      }
    }
    return {
      statId: option.statId,
      feasibleLevels,
      exactClosures,
      rejectedByVisibleUpperBounds: feasibleLevels.length === 0,
    };
  }),
}));

const report = {
  schema: "tl-helper.private-build-forensics-report",
  schemaVersion: 1,
  gameBuild: appData.gameBuild,
  observation: observationPath,
  publicSurface: false,
  exactFindings: [{
    slotId: "main_hand",
    itemId: mainItem.id,
    name: mainItem.name,
    level: Number(iconMatch.itemLevel),
    evidence: iconMatch.evidence,
    imageUrl: mainItem.imageUrl,
  }],
  anchoredBaseline: anchorStats,
  syntheticAttributeInputsForObservedTotals: {
    inputs: anchorAttributeInputs,
    warning: "These are inverse-calculator inputs used only to reproduce the displayed final attributes with other gear absent. They are not a deduction of the player's allocated points.",
  },
  mainWeaponHeroicRollPossibilities: heroicRolls,
  mainWeaponHeroicEffectConstraints: heroicEffectConstraints,
  conservativeOffhandElimination: {
    testedItemLevelCandidates: greatswordCandidates.length,
    feasibleItemLevelCandidates: feasible.length,
    feasibleDistinctItems: feasibleItems.length,
    rejectedDistinctItems: rejectedItems.length,
    conclusion: feasibleItems.length === 1
      ? "The fixed upper-bound pass leaves one Greatsword item, but optional sources still require verification."
      : "The screenshot does not uniquely determine the Greatsword. Passing candidates are possible, not ranked matches.",
    rejected: rejectedItemDetails,
    feasible: feasible.map((row) => ({ itemId: row.itemId, name: row.name, grade: row.grade, level: row.level, fixedDeltaFromOffhand: row.fixedDeltaFromOffhand })),
  },
  uncertainty: [
    "The screenshot contains aggregate totals, not per-source contributions.",
    "Traits, Heroic random effects, unique traits, runes, rune synergies, artifacts, sets, mastery, skills, allocated points, consumables, and permanent account progression remain unknown.",
    "The current calculator includes the known Stellar Journey +1 to each attribute, but it does not prove that every current Stellar Journey reward is represented.",
    "Combat Power is recorded but is not used as an exact inverse constraint because the native aggregation pipeline is not fully proven for this game build.",
  ],
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`Exact main hand: ${mainItem.name} +${iconMatch.itemLevel}`);
console.log(`Greatsword candidates tested: ${greatswordCandidates.length}`);
console.log(`Greatsword candidates still feasible: ${feasible.length} item-level rows across ${feasibleItems.length} items`);
console.log(`Report: ${outputPath}`);
