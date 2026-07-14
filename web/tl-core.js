// tl-core.js — Throne and Liberty build engine
// Ported from web/app.js (tl-character-extract) — calculation + data helpers only, no DOM.
// All game math, caps, and formatting rules are copied verbatim from the source app.

import {
  ARMOR_MATERIAL_BONUSES,
  ATTRIBUTE_BREAKPOINTS,
  BASE_ATTRIBUTES,
  BASE_LEVEL_STATS,
  CHARACTER_LEVEL,
  COMBAT_POWER,
  COMBAT_POWER_BONUS_20_ITEMS,
  COMBAT_POWER_BONUS_60_ITEMS,
  ITEM_PASSIVE_RULES,
  MASTERY_SYNERGY_RULES,
  PASSIVE_SKILL_RULES,
  PERK_PASSIVE_RULES,
  SET_EXCLUSIVITY_GROUPS,
  SET_PASSIVE_RULES,
  STAT_EXPANSIONS,
  STAT_HARD_CAPS,
  STAT_UNIT_MODIFIERS,
  STELLAR_JOURNEY_ATTRIBUTES,
  UNIFIED_MASTERY_RULES,
  allocatedAttributeValue,
} from "./tl-questlog-rules.js";
import { loadWebData } from "./tl-data-loader.js";
import { PASSIVE_EFFECT_CONTRACT } from "./tl-passive-effect-contract.js";
import {
  COMBAT_SCENARIO_SCHEMA,
  COMBAT_SCENARIO_SCHEMA_VERSION,
  normalizeCombatScenario,
} from "./vendor/combat-engine/combat-scenario.mjs";
import {
  SCENARIO_EFFECT_DEFINITIONS,
  SCENARIO_EFFECT_GAME_BUILD,
  SCENARIO_EFFECT_RULESET_ID,
  SCENARIO_EFFECT_RULESET_VERSION,
  evaluateScenarioEffects,
} from "./tl-scenario-effects.js";

export const EQUIPMENT_SLOTS = [
  { id: "main_hand", label: "Main Hand", types: ["bow", "crossbow", "dagger", "gauntlet", "orb", "spear", "staff", "sword", "sword2h", "wand"] },
  { id: "off_hand", label: "Off Hand", types: ["bow", "crossbow", "dagger", "gauntlet", "orb", "spear", "staff", "sword", "sword2h", "wand", "shield"] },
  { id: "head", label: "Head", types: ["head"] },
  { id: "chest", label: "Chest", types: ["chest"] },
  { id: "hands", label: "Hands", types: ["hands"] },
  { id: "legs", label: "Legs", types: ["legs"] },
  { id: "feet", label: "Feet", types: ["feet"] },
  { id: "cloak", label: "Cloak", types: ["cloak"] },
  { id: "necklace", label: "Necklace", types: ["necklace"] },
  { id: "bracelet", label: "Bracelet", types: ["bracelet"] },
  { id: "belt", label: "Belt", types: ["belt"] },
  { id: "ring_1", label: "Ring 1", types: ["ring"] },
  { id: "ring_2", label: "Ring 2", types: ["ring"] },
  { id: "brooch", label: "Brooch", types: ["brooch"] },
  { id: "earring", label: "Earring", types: ["earring"] },
];

export const ARTIFACT_SLOTS = [
  { id: "talistone1", label: "Talistone I", types: ["talistone1"] },
  { id: "talistone2", label: "Talistone II", types: ["talistone2"] },
  { id: "talistone3", label: "Talistone III", types: ["talistone3"] },
  { id: "talistone4", label: "Talistone IV", types: ["talistone4"] },
  { id: "gemstone1", label: "Gemstone I", types: ["gemstone1"] },
  { id: "gemstone2", label: "Gemstone II", types: ["gemstone2"] },
];

export const SUPPORT_SLOTS = [
  { id: "attack", label: "Attack Food", types: ["attack"] },
  { id: "defense", label: "Defense Food", types: ["defense"] },
  { id: "utility", label: "Utility Food", types: ["utility"] },
  { id: "hp-recovery", label: "Health Recovery", types: ["hp-recovery"] },
  { id: "mana-recovery", label: "Mana Recovery", types: ["mana-recovery"] },
  { id: "riftstone", label: "Riftstone", types: ["riftstone"] },
  { id: "boonstone", label: "Boonstone", types: ["boonstone"] },
  { id: "castle", label: "Castle", types: ["castle"] },
  { id: "stellarite", label: "Stellarite", types: ["stellarite"] },
];

export const BUILD_SLOTS = [...EQUIPMENT_SLOTS, ...ARTIFACT_SLOTS, ...SUPPORT_SLOTS];
export const WEAPON_SLOTS = ["main_hand", "off_hand"];
export const WEAPON_TYPES = [...new Set(WEAPON_SLOTS.flatMap((slotId) => (BUILD_SLOTS.find((s) => s.id === slotId)?.types ?? [])))];
export const HEROIC_GRADE = 51;
export const NORMAL_TRAIT_CAP = 3;
export const UNIQUE_TRAIT_CAP = 1;
export const RESONANCE_CAP = 1;
export const ACTIVE_SKILL_CAP = 12;
// TLGlobalCommon.GlobalCommonData.PassiveSkillSlotCountLevelLimits. The three
// level-1 rows are cumulative initial unlocks; later rows add one slot each.
export const PASSIVE_SKILL_SLOT_SCHEDULE = Object.freeze([
  Object.freeze({ level: 1, slots: 3 }),
  Object.freeze({ level: 20, slots: 4 }),
  Object.freeze({ level: 25, slots: 5 }),
  Object.freeze({ level: 30, slots: 6 }),
  Object.freeze({ level: 35, slots: 7 }),
  Object.freeze({ level: 40, slots: 8 }),
]);
export function passiveSkillCapForLevel(level = CHARACTER_LEVEL) {
  const numericLevel = Math.max(1, Math.floor(Number(level) || 1));
  return PASSIVE_SKILL_SLOT_SCHEDULE.reduce((slots, row) => numericLevel >= row.level ? row.slots : slots, 0);
}
export const PASSIVE_SKILL_CAP = passiveSkillCapForLevel(CHARACTER_LEVEL);
export const ATTRIBUTE_POINT_BUDGET = 59;
export const SPEC_BUDGET = 110;
// TEXT_MSG_PERK_FAIL_EQUIP_LIMITS permits only one Heroic item of each type;
// decoded TLPerkSocket and TLPerkOption rows partition those types into weapon,
// armor, and accessory groups.
export const HEROIC_SLOT_GROUPS = {
  weapon: WEAPON_SLOTS,
  armor: ["head", "chest", "cloak", "hands", "feet", "legs"],
  accessory: ["necklace", "bracelet", "ring_1", "ring_2", "brooch", "earring", "belt"],
};
export const DISPLAY_LABELS = { sword2h: "Greatsword" };

// Explicit static-calculator boundary. Every projected set breakpoint must be
// exactly one of: a structured bonus_stat row, a mapped SET_PASSIVE_RULES
// formula, or an entry in this registry. Keeping unsupported rows explicit
// prevents a newly added or renamed game-data breakpoint from silently
// disappearing from calculated totals.
export const UNSUPPORTED_SET_BREAKPOINTS = Object.freeze({
  "set_aa_fabric_001:2": Object.freeze({ stage: "unsupported_scoped", reason: "Weaken Duration +7.5% is a scoped dynamic stat not represented in sheet totals." }),
  "set_aa_plate_002:4": Object.freeze({ stage: "unsupported_scoped", reason: "Mobility-skill move range is scoped behavior, not a global sheet stat." }),
  "set_aa_T2_fabric_002:2": Object.freeze({ stage: "unsupported_combat", reason: "Skill damage-over-time and its exclusivity require a combat-stage model." }),
  "set_aa_T2_fabric_004:2": Object.freeze({ stage: "unsupported_combat", reason: "Base and triggered skill damage-over-time require a combat-stage model." }),
  "set_aa_t3_lether_003:4": Object.freeze({ stage: "unsupported_combat", reason: "Enemy Endurance reduction and movement-triggered Evasion are conditional combat effects." }),
  "set_aa_t4_fabric_005:2": Object.freeze({ stage: "unsupported_combat", reason: "Skill damage-over-time and the triggered resistance debuff require a combat-stage model." }),
  "set_a_Magic_Nudge_001:3": Object.freeze({ stage: "unsupported_combat", reason: "Target-health-conditional Critical Hit Chance requires target state and duration modeling." }),
  "set_a_Melee_Nudge_001:3": Object.freeze({ stage: "unsupported_combat", reason: "Target-health-conditional Critical Hit Chance requires target state and duration modeling." }),
  "set_a_Range_Nudge_001:3": Object.freeze({ stage: "unsupported_combat", reason: "Target-health-conditional Critical Hit Chance requires target state and duration modeling." }),
});

const MODELED_SET_BREAKPOINTS = new Set([
  "set_aa_T2_fabric_003:2", "set_aa_T2_fabric_003:4",
  "set_aa_T2_leather_004:2", "set_aa_T2_leather_004:4",
  "set_aa_T2_leather_005:2", "set_aa_T2_leather_005:4",
  "set_aa_T2_plate_003:2", "set_aa_T2_plate_003:4",
]);

const DERIVED_SET_BREAKPOINTS = new Set([
  // Persistent Adjust_Stat plus the localized -10 Stamina Regen literal. The
  // value has no formula row, so the mapping is localization-derived.
  "set_aa_PartyDungeon_Ring_001:2",
  // Both localized descriptions say Main Weapon Base Damage +30. The current
  // representation raises both displayed range ends through the bonus-attack
  // power expansion, but the underlying stat identity is not directly bound.
  "set_aa_T2_plate_005:4",
]);

export const ATTRIBUTES = [
  ["str", "Strength"],
  ["dex", "Dexterity"],
  ["int", "Wisdom"],
  ["per", "Perception"],
  ["con", "Fortitude"],
];

export const PRIMARY_STATS = [
  "hp_max",
  "attack_power_main_hand_min",
  "attack_power_main_hand_max",
  "attack_power_off_hand_min",
  "attack_power_off_hand_max",
  "melee_accuracy",
  "range_accuracy",
  "magic_accuracy",
  "melee_evasion",
  "range_evasion",
  "magic_evasion",
  "melee_armor",
  "range_armor",
  "magic_armor",
  "damage_reduction",
  "skill_cooldown_modifier",
];

export const STAT_PAGE_DEFINITIONS = [
  ["combat", "Combat", "Damage, defenses, hit, critical, and core combat totals."],
  ["utility", "Utility", "Attributes, resources, movement, range, cooldowns, and durations."],
  ["control", "Control", "Crowd-control chance, duration, and resistance totals."],
  ["species", "Species", "Humanoid, wildkin, demon, undead, construct, and species modifiers."],
  ["directional", "Directional", "Front, rear, side, and back attack modifiers."],
  ["boss", "Boss", "Boss-specific damage and mitigation modifiers."],
  ["pvp", "PvP", "Player-versus-player modifiers."],
  ["all", "All", "Every visible total in one neutral list."],
];
export const STAT_PAGE_IDS = STAT_PAGE_DEFINITIONS.map(([id]) => id);

export const STAT_ALIASES = {
  attack_power_main_hand_min: "Main Weapon Min Damage",
  attack_power_main_hand_max: "Main Weapon Max Damage",
  attack_power_off_hand_min: "Off Weapon Min Damage",
  attack_power_off_hand_max: "Off Weapon Max Damage",
  attack_range_main_hand: "Main Weapon Range",
  attack_power_modifier: "Attack Power",
  attack_range_modifier: "Attack Range",
  all_evasion: "Evasion",
  critical_damage_dealt_modifier: "Critical Damage",
  continuous_heal_modifier: "Healing Over Time",
  continuous_heal_taken_modifier: "Healing Over Time Received",
  front_all_evasion: "Front Evasion",
  heal_modifier: "Healing",
  magic_damage_dealt_modifier: "Magic Damage",
  magic_doll_heal_modifier: "Magic Doll Healing",
  melee_damage_dealt_modifier: "Melee Damage",
  move_speed_modifier: "Move Speed",
  off_hand_attack_chance: "Off-Hand Weapon Attack Chance",
  pvp_damage_dealt_modifier: "PvP Damage",
  pvp_all_evasion: "PvP Evasion",
  pvp_range_evasion: "PvP Ranged Evasion",
  potion_heal_modifier: "Potion Healing",
  range_damage_dealt_modifier: "Ranged Damage",
  range_evasion: "Ranged Evasion",
  rear_all_evasion: "Back Evasion",
  rear_damage_reduction: "Back Damage Reduction",
  shield_block_chance: "Block Chance",
  shield_modifier: "Shield Strength",
  shield_taken_modifier: "Shield Received",
  side_all_evasion: "Side Evasion",
  skill_heal_taken_modifier: "Skill Healing Received",
  skill_power_amplification: "Skill Damage Boost",
  skill_power_resistance: "Skill Damage Resistance",
  stamina_max: "Max Stamina",
  all_accuracy: "Hit Chance",
  melee_accuracy: "Melee Hit Chance",
  range_accuracy: "Ranged Hit Chance",
  magic_accuracy: "Magic Hit Chance",
  all_double_attack: "Heavy Attack Chance",
  all_critical_attack: "Critical Hit Chance",
  skill_cooldown_modifier: "Cooldown Speed",
  cost_max: "Max Mana",
  cost_regen: "Mana Regen",
  cost_consumption_modifier: "Mana Cost Efficiency",
  hp_max: "Max Health",
  hp_regen: "Health Regen",
  stamina_regen: "Stamina Regen",
  melee_armor: "Melee Defense",
  range_armor: "Ranged Defense",
  magic_armor: "Magic Defense",
  bind_accuracy: "Collision Chance",
  stun_accuracy: "Stun Chance",
  weaken_accuracy: "Weaken Chance",
  silence_accuracy: "Silence Chance",
  melee_heavy_attack: "Melee Heavy Attack Chance",
  range_heavy_attack: "Ranged Heavy Attack Chance",
  magic_heavy_attack: "Magic Heavy Attack Chance",
  melee_double_attack: "Melee Heavy Attack Chance",
  range_double_attack: "Ranged Heavy Attack Chance",
  magic_double_attack: "Magic Heavy Attack Chance",
  double_damage_dealt_modifier: "Heavy Attack Damage",
  double_damage_taken_modifier: "Heavy Attack Damage Resistance",
  collide_amplification: "Collision Chance",
  buff_given_duration_modifier: "Buff Duration",
  debuff_taken_duration_modifier: "Debuff Duration",
  all_species_damage_amplification: "Species Damage Boost",
  damage_reduction: "Damage Reduction",
  attack_speed_modifier: "Attack Speed",
  critical_damage_taken_modifier: "Critical Damage Resistance",
  damage_reduction_penetration: "Bonus Damage",
  boss_bonus_attack_power: "Boss Bonus Damage",
  bonus_attack_power_main_hand: "Main Weapon Bonus Attack Power",
  bonus_attack_power_off_hand: "Off Weapon Bonus Attack Power",
  shield_block_chance_penetration: "Block Chance Penetration",
  all_state_accuracy: "CC Chance",
  all_state_tolerance: "CC Resistances",
  bind_tolerance: "Bind Resistance",
  blind_tolerance: "Fear Resistance",
  petrification_tolerance: "Petrification Resistance",
  silence_tolerance: "Silence Resistance",
  sleep_tolerance: "Sleep Resistance",
  stun_tolerance: "Stun Resistance",
  weaken_tolerance: "Weaken Resistance",
  collide_resistance: "Collision Resistance",
  collision_resistance: "Collision Resistance",
  bind_accuracy: "Bind Chance",
  blind_accuracy: "Fear Chance",
  petrification_accuracy: "Petrification Chance",
  silence_accuracy: "Silence Chance",
  sleep_accuracy: "Sleep Chance",
  stun_accuracy: "Stun Chance",
  weaken_accuracy: "Weaken Chance",
  collide_amplification: "Collision Chance",
  grankus_damage_amplification: "Humanoid Damage Boost",
  grankus_damage_reduction: "Humanoid Damage Reduction",
  animal_damage_amplification: "Wildkin Damage Boost",
  animal_damage_reduction: "Wildkin Damage Reduction",
  creation_damage_amplification: "Construct Damage Boost",
  creation_damage_reduction: "Construct Damage Reduction",
  demon_damage_amplification: "Demon Damage Boost",
  demon_damage_reduction: "Demon Damage Reduction",
  undead_damage_amplification: "Undead Damage Boost",
  undead_damage_reduction: "Undead Damage Reduction",
  all_species_damage_resistance: "Species Damage Resistance",
  grankus_damage_resistance: "Humanoid Damage Resistance",
  animal_damage_resistance: "Wildkin Damage Resistance",
  creation_damage_resistance: "Construct Damage Resistance",
  demon_damage_resistance: "Demon Damage Resistance",
  undead_damage_resistance: "Undead Damage Resistance",
  bonus_grankus_attack_power: "Bonus Humanoid Attack Power",
  bonus_animal_attack_power: "Bonus Wildkin Attack Power",
  bonus_creation_attack_power: "Bonus Construct Attack Power",
  bonus_demon_attack_power: "Bonus Demon Attack Power",
  bonus_undead_attack_power: "Bonus Undead Attack Power",
};

export const TOOLTIP_STAT_LABELS = {
  shield_block_chance: "Block Chance",
  block_chance: "Block Chance",
  cost_max: "Max Mana",
  cost_regen: "Mana Regen",
  cost_consumption_modifier: "Mana Cost Efficiency",
  hp_regen: "Health Regen",
  stamina_regen: "Stamina Regen",
  attack_range_main_hand: "Range",
  attack_range_off_hand: "Range",
  attack_speed_main_hand: "Attack Speed",
  attack_speed_off_hand: "Attack Speed",
};

export const GRADE_COLORS = {
  0: "#9aa0a8",
  11: "#c8cdd4",
  21: "#5ecb7c",
  31: "#59a4ec",
  32: "#59a4ec",
  41: "#b873ff",
  42: "#b873ff",
  43: "#b873ff",
  51: "#ff982d",
  61: "#e2b354",
  71: "#7fd6c9",
};

export let data = null;
export let indexes = null;

function materializeItemPotentials(source) {
  if (!Array.isArray(source?.itemPotentialPool)) return source;
  const items = (source.items ?? []).map((item) => {
    if (item.itemPotentialRef === undefined) return item;
    const ref = item.itemPotentialRef;
    const potential = source.itemPotentialPool[ref];
    if (!Number.isInteger(ref) || !potential || typeof potential !== "object") {
      throw new Error(`Invalid itemPotentialRef ${String(ref)} for item ${item.id ?? "unknown"}`);
    }
    const { itemPotentialRef, ...rest } = item;
    return {
      ...rest,
      itemPotential: {
        ...potential,
        stats: (potential.stats ?? []).map((row) => ({ ...row })),
        skills: (potential.skills ?? []).map((row) => ({ ...row })),
      },
    };
  });
  const { itemPotentialPool, ...runtimeSource } = source;
  return { ...runtimeSource, items };
}

export async function initCore(source) {
  source = await loadWebData(source);
  source = materializeItemPotentials(source);
  data = source;
  indexes = buildIndexes(source);
  return { data, indexes };
}

export function buildIndexes(source) {
  const itemById = Object.fromEntries(source.items.map((item) => [item.id, item]));
  const runeById = Object.fromEntries(source.runes.map((rune) => [rune.id, rune]));
  const normalizedArtifactSets = (source.artifactSets ?? []).map((set) => ({
    ...set,
    itemSetMadeOfItems: set.itemSetMadeOfItems ?? (set.memberItemIds ?? []).map((id) => ({ id })),
    itemSetBonus: set.itemSetBonus ?? set.bonuses ?? [],
  }));
  const itemSetById = Object.fromEntries([...source.itemSets, ...normalizedArtifactSets].map((set) => [set.id, set]));
  const skillById = Object.fromEntries((source.skills ?? []).map((skill) => [skill.id, skill]));
  const skillTraitById = Object.fromEntries((source.skillTraits ?? []).map((trait) => [trait.id, trait]));
  const masteryById = Object.fromEntries((source.masteries ?? []).map((mastery) => [mastery.id, mastery]));
  const itemsByType = {};
  for (const item of source.items) {
    if (!itemsByType[item.equipmentType]) itemsByType[item.equipmentType] = [];
    itemsByType[item.equipmentType].push(item);
  }
  for (const list of Object.values(itemsByType)) {
    list.sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0) || a.name.localeCompare(b.name));
  }
  const runesByCategory = {};
  for (const rune of source.runes) {
    if (!runesByCategory[rune.equipmentCategory]) runesByCategory[rune.equipmentCategory] = [];
    runesByCategory[rune.equipmentCategory].push(rune);
  }
  for (const list of Object.values(runesByCategory)) {
    list.sort((a, b) => a.runeType.localeCompare(b.runeType) || (b.grade ?? 0) - (a.grade ?? 0) || a.name.localeCompare(b.name));
  }
  return { itemById, runeById, itemSetById, skillById, skillTraitById, masteryById, itemsByType, runesByCategory };
}

// ---------- build state helpers ----------

export function emptyEquipmentSelection() {
  return {
    itemId: "",
    level: 0,
    traits: [],
    uniqueTrait: null,
    resonance: [],
    heroicEffects: [],
    artifactStatId: "",
    potentialId: "",
    perkId: "",
    runes: [emptyRune(), emptyRune(), emptyRune()],
  };
}

export function emptyHeroicEffect() {
  return { statId: "", level: 0, levelKnown: false };
}

// Every rune-eligible piece has exactly 3 sockets — this matches the live
// game and Questlog's builder (their rune editors expose sockets 1-3 only).
// If a future patch changes socket counts, normalizeRuneRows and the
// [0, 1, 2] literals must become slot-driven.
export function emptyRune() {
  return { runeId: "", statId: "", level: 1 };
}

export function createInitialBuild() {
  const equipment = {};
  for (const slot of EQUIPMENT_SLOTS) equipment[slot.id] = emptyEquipmentSelection();
  const artifacts = {};
  for (const slot of ARTIFACT_SLOTS) artifacts[slot.id] = emptyEquipmentSelection();
  const supportSlots = {};
  for (const slot of SUPPORT_SLOTS) supportSlots[slot.id] = emptyEquipmentSelection();
  return { id: "build-default", name: "Default Build", equipment, artifacts, supportSlots, skills: [], masteries: {}, unifiedMasteries: [], overallMasteryLevel: null };
}

export function slotById(id) {
  return BUILD_SLOTS.find((slot) => slot.id === id) ?? EQUIPMENT_SLOTS[0];
}

export function isArtifactSlot(slotId) {
  return ARTIFACT_SLOTS.some((slot) => slot.id === slotId);
}

export function isSupportSlot(slotId) {
  return SUPPORT_SLOTS.some((slot) => slot.id === slotId);
}

export function slotCollectionForSlot(build, slotId) {
  if (isArtifactSlot(slotId)) return build.artifacts;
  if (isSupportSlot(slotId)) return build.supportSlots;
  return build.equipment;
}

export function slotSelection(slotId, build) {
  return slotCollectionForSlot(build, slotId)[slotId] ?? emptyEquipmentSelection();
}

export function slotItem(slotId, build) {
  return indexes.itemById[slotSelection(slotId, build).itemId];
}

export function normalizeSelectionRows(rows) {
  return Array.isArray(rows) ? rows.filter((row) => row?.statId) : [];
}

export function normalizeRuneRows(rows) {
  return Array.isArray(rows)
    ? [0, 1, 2].map((index) => ({ ...emptyRune(), ...(rows[index] ?? {}) }))
    : [emptyRune(), emptyRune(), emptyRune()];
}

export function heroicEffectGroupCount(item) {
  let count = 0;
  while (Array.isArray(item?.itemStats?.[`random_stat_group_${count + 1}`])) count += 1;
  return count;
}

export function normalizeHeroicEffectRows(rows, itemOrCount = 0) {
  const count = typeof itemOrCount === "number" ? itemOrCount : heroicEffectGroupCount(itemOrCount);
  const length = Math.max(count, Array.isArray(rows) ? rows.length : 0);
  return Array.from({ length }, (_, index) => ({ ...emptyHeroicEffect(), ...(rows?.[index] ?? {}) }));
}

export function normalizeSkillSelections(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const normalized = [];
  for (const row of rows) {
    const skillId = typeof row === "string" ? row : row?.skillId;
    const skill = indexes?.skillById?.[skillId];
    if (!skill || seen.has(skillId)) continue;
    seen.add(skillId);
    const maxLevel = skillMaxLevel(skill);
    normalized.push({
      skillId,
      level: clamp(Number(row?.level || skillDefaultLevel(skill)), 1, maxLevel),
      loadoutType: row?.loadoutType ?? skillLoadoutType(skill),
      specializationIds: Array.isArray(row?.specializationIds)
        ? row.specializationIds.filter((id) => indexes.skillTraitById[id]?.skillSetId === skillId)
        : [],
    });
  }
  return normalized;
}

export function normalizeMasterySelections(rows) {
  const normalized = {};
  if (!rows || typeof rows !== "object") return normalized;
  for (const [id, row] of Object.entries(rows)) {
    const mastery = data?.masteries?.find((entry) => entry.id === id);
    if (!mastery) continue;
    normalized[id] = { level: clamp(Number(row?.level || 1), 1, masteryMaxLevel(mastery)) };
  }
  return normalized;
}

export function importQuestlogBuild(payload) {
  const characterData = payload?.characterPayload?.result?.data ?? payload?.characterPayload ?? payload?.characterData ?? payload;
  const character = characterData?.character ?? payload?.character ?? {};
  const sourceBuild = payload?.build ?? characterData?.builds?.[Number(payload?.buildIndex ?? 0)] ?? characterData?.builds?.[0];
  if (!sourceBuild?.equipment) throw new Error("The import does not contain a Questlog character build.");
  const build = createInitialBuild();
  build.id = String(sourceBuild.id ?? "questlog-import");
  build.name = sourceBuild.name ?? character.name ?? "Questlog Import";
  const tierRows = (pool, selected, nested = false) => Object.entries(selected ?? {}).flatMap(([statId, selectedValue]) => {
    const valuesForStat = nested ? pool?.[statId]?.tiers : pool?.[statId];
    const tiers = Array.isArray(valuesForStat) ? valuesForStat : Object.values(valuesForStat ?? {});
    const index = tiers.findIndex((value) => Number(value) === Number(selectedValue));
    return index >= 0 ? [{ statId, tier: index + 1 }] : [];
  });
  for (const slot of BUILD_SLOTS) {
    const row = sourceBuild.equipment[slot.id];
    const item = indexes.itemById[row?.id];
    if (!row?.id || !item) continue;
    const heroicEffects = [];
    for (const [groupNumber, statId] of Object.entries(row.heroic ?? {})) {
      if (statId) heroicEffects[Number(groupNumber) - 1] = { statId, level: 0, levelKnown: false };
    }
    const selection = {
      ...emptyEquipmentSelection(),
      itemId: item.id,
      level: Number(row.itemLevel ?? getItemLevels(item).at(-1) ?? 0),
      perkId: row.perk ?? "",
      artifactStatId: row.artifact ?? "",
      potentialId: row.potential ?? "",
      traits: tierRows(item.itemStats?.traits, row.traits),
      uniqueTrait: tierRows(item.itemStats?.uniqueTraits, row.uniqueTraits)[0] ?? null,
      resonance: row.resonance ? [{ statId: row.resonance, tier: Number(row.resonanceTier ?? item.itemStats?.resonance?.[row.resonance]?.tiers?.length ?? 1) }] : [],
      heroicEffects,
      runes: Object.values(row.runes ?? {}).map((rune) => ({ runeId: rune.runeId, statId: rune.statId, level: Number(rune.lvl ?? 1) })),
    };
    slotCollectionForSlot(build, slot.id)[slot.id] = selection;
  }
  const skillBuild = payload?.skillBuild ?? payload?.skillData?.builds?.find((row) => row.id === sourceBuild.skillBuildId);
  build.skills = [
    ...values(skillBuild?.active).map((row) => ({ ...row, loadoutType: "active" })),
    ...values(skillBuild?.passive).map((row) => ({ ...row, loadoutType: "passive" })),
    ...values(skillBuild?.defensive).map((row) => ({ ...row, loadoutType: "defensive" })),
  ].map((row) => ({ skillId: row.skillId, level: Number(row.lvl ?? row.level ?? 1), specializationIds: row.traits ?? [], loadoutType: row.loadoutType }));
  const masteryBuild = payload?.masteryBuild ?? payload?.masteryData?.builds?.find((row) => row.id === sourceBuild.weaponSpecializationBuildId);
  build.masteries = Object.fromEntries(values(masteryBuild?.specialization).map((row) => [row.id, { level: Number(row.lvl ?? row.level ?? 1) }]));
  build.unifiedMasteries = Object.values(masteryBuild?.unified ?? {}).filter(Boolean);
  return {
    profile: {
      name: character.name ?? build.name,
      role: sourceBuild.tags?.[0] ?? "Imported Build",
      server: character.publisher?.toUpperCase?.() ?? "Questlog",
    },
    attributes: { str: 0, dex: 0, int: 0, per: 0, con: 0, ...(sourceBuild.attributes ?? {}) },
    build,
  };
}

// ---------- item helpers ----------

export function values(objectLike) {
  return Array.isArray(objectLike) ? objectLike : Object.values(objectLike ?? {});
}

export function setBreakpointKey(setId, required) {
  return `${setId}:${Number(required) || 0}`;
}

/**
 * Machine-checkable classification for one projected set breakpoint.
 * `kind: "conflict"` or `kind: "unclassified"` is a data-contract failure,
 * never an implicit unsupported result.
 */
export function classifySetBreakpoint(setId, bonus) {
  const required = Number(bonus?.set_count ?? bonus?.setCount ?? 0);
  const key = setBreakpointKey(setId, required);
  const hasStructured = values(bonus?.bonus_stat ?? bonus?.bonusStat).length > 0;
  const hasMappedRule = Boolean(SET_PASSIVE_RULES[setId]?.[required]);
  const unsupported = UNSUPPORTED_SET_BREAKPOINTS[key] ?? null;
  const categories = [hasStructured && "structured", hasMappedRule && "mapped", unsupported && "unsupported"].filter(Boolean);
  if (categories.length !== 1) {
    return Object.freeze({
      key, required,
      kind: categories.length ? "conflict" : "unclassified",
      confidence: "unsupported",
      stage: "invalid_contract",
      reason: categories.length ? `Breakpoint belongs to multiple categories: ${categories.join(", ")}.` : "Breakpoint has no structured, mapped, or explicit unsupported classification.",
    });
  }
  if (unsupported) return Object.freeze({ key, required, kind: "unsupported", confidence: "unsupported", ...unsupported });
  const confidence = MODELED_SET_BREAKPOINTS.has(key) ? "modeled" : DERIVED_SET_BREAKPOINTS.has(key) ? "derived" : "exact";
  return Object.freeze({
    key, required,
    kind: hasStructured ? "structured" : "mapped",
    confidence,
    stage: "static_sheet",
    reason: confidence === "modeled"
      ? "Owner application includes the modeled personal-plus-self-aura behavior."
      : confidence === "derived"
        ? "The displayed mechanic is mapped through the calculator's derived stat representation."
        : "The breakpoint value and stat mapping are data-backed.",
  });
}

export function getItemLevels(item) {
  const keys = new Set([
    ...Object.keys(item.itemStats?.main ?? {}),
    ...Object.keys(item.itemStats?.extra ?? {}),
  ]);
  return [...keys].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
}

export function selectedItemLevel(item, requested) {
  const levels = getItemLevels(item);
  if (!levels.length) return "0";
  const target = Number(requested || levels.at(-1));
  return String(levels.reduce((best, level) => Math.abs(level - target) < Math.abs(best - target) ? level : best, levels[0]));
}

export function itemMaxLevel(item) {
  return getItemLevels(item).at(-1) ?? 0;
}

export function itemLevelRangeLabel(levels) {
  if (!levels.length) return "?";
  if (levels.length === 1) return String(levels[0]);
  return `${levels[0]}-${levels.at(-1)}`;
}

export function slotItems(slot) {
  const all = slot.types.flatMap((type) => indexes.itemsByType[type] ?? []);
  return [...new Map(all.map((item) => [item.id, item])).values()];
}

export function getSelectedWeaponType(slot, build) {
  return indexes.itemById[build.equipment[slot]?.itemId]?.equipmentType ?? "";
}

export function equippedWeaponTypes(build) {
  return [...new Set([getSelectedWeaponType("main_hand", build), getSelectedWeaponType("off_hand", build)].filter(Boolean))];
}

export function currentWeaponTypes(build) {
  const weapons = equippedWeaponTypes(build);
  return weapons.length ? [...new Set(weapons)] : ["bow"];
}

const WEAPON_HIT_PROFILES = {
  bow: { key: "ranged", statId: "range_accuracy", label: "Ranged Hit Chance" },
  crossbow: { key: "ranged", statId: "range_accuracy", label: "Ranged Hit Chance" },
  staff: { key: "magic", statId: "magic_accuracy", label: "Magic Hit Chance" },
  wand: { key: "magic", statId: "magic_accuracy", label: "Magic Hit Chance" },
  orb: { key: "magic", statId: "magic_accuracy", label: "Magic Hit Chance" },
};

export function weaponHitProfile(type) {
  return WEAPON_HIT_PROFILES[type] ?? { key: "melee", statId: "melee_accuracy", label: "Melee Hit Chance" };
}

export function heroicSlotGroupForSlot(slotId) {
  return Object.entries(HEROIC_SLOT_GROUPS).find(([, slots]) => slots.includes(slotId))?.[0] ?? "";
}

export function itemCompatibility(slotId, item, build) {
  if (!item) return { allowed: true, reason: "" };
  const identicalSlot = allBuildSelectionEntries(build)
    .find(({ slotId: otherSlot, item: otherItem }) => otherSlot !== slotId && otherItem?.id === item.id)?.slotId;
  if (identicalSlot) {
    return { allowed: false, reason: `same item in ${slotById(identicalSlot)?.label ?? identicalSlot}` };
  }
  const slotGroup = heroicSlotGroupForSlot(slotId);
  if (WEAPON_SLOTS.includes(slotId)) {
    const otherSlot = slotId === "main_hand" ? "off_hand" : "main_hand";
    const otherItem = indexes.itemById[build.equipment[otherSlot]?.itemId];
    if (otherItem && otherItem.equipmentType === item.equipmentType) {
      return { allowed: false, reason: `same weapon type in ${slotById(otherSlot).label}` };
    }
  }
  if (item.grade === HEROIC_GRADE && slotGroup) {
    const occupied = HEROIC_SLOT_GROUPS[slotGroup]
      .filter((otherSlot) => otherSlot !== slotId)
      .map((otherSlot) => indexes.itemById[build.equipment[otherSlot]?.itemId])
      .find((otherItem) => otherItem?.grade === HEROIC_GRADE);
    if (occupied) return { allowed: false, reason: `heroic ${slotGroup} already equipped` };
  }
  return { allowed: true, reason: "" };
}

export function maxTierFor(tiers) {
  const list = Array.isArray(tiers) ? tiers : Object.values(tiers ?? {});
  return Math.max(1, list.length);
}

export function maxValue(value) {
  if (Array.isArray(value)) return Math.max(0, ...value.map(Number).filter(Number.isFinite));
  if (typeof value === "number") return value;
  if (value && typeof value === "object") return Math.max(0, ...Object.values(value).map(Number).filter(Number.isFinite));
  return 0;
}

// Heroic equipment exposes independently rolled effect groups. Weapons have
// two groups in the current data, while armor and accessories can have three.
export function heroicEffectOptions(item, groupIndex) {
  if (!item || item.grade !== HEROIC_GRADE) return [];
  const index = clamp(Number(groupIndex || 0), 0, Math.max(0, heroicEffectGroupCount(item) - 1));
  const rows = item.itemStats?.[`random_stat_group_${index + 1}`];
  if (!Array.isArray(rows)) return [];
  return rows.map((entry) => {
    const levels = Array.isArray(entry.levels) ? entry.levels.map(Number) : [];
    const baseValue = Number(entry.base_value ?? entry.baseValue ?? levels[0] ?? 0);
    const maxLevel = Math.max(0, Number(entry.max_level ?? entry.maxLevel ?? Math.max(0, levels.length - 1)));
    const option = {
      statId: entry.stat_id ?? entry.statId ?? "",
      baseValue,
      maxValue: Number(levels[clamp(maxLevel, 0, Math.max(0, levels.length - 1))] ?? levels.at(-1) ?? baseValue),
      value: baseValue,
      probability: Number(entry.probability ?? 0),
      maxLevel,
      levels,
    };
    return option;
  }).filter((entry) => entry.statId);
}

// Canonical level lookup for Heroic effects. Legacy selections without a level
// intentionally resolve to level 0, preserving existing saved-build totals.
export function heroicEffectValue(option, level = 0) {
  if (!option) return 0;
  const maxLevel = Math.max(0, Number(option.maxLevel ?? Math.max(0, (option.levels?.length ?? 1) - 1)));
  const selectedLevel = clamp(Number.isFinite(Number(level)) ? Math.trunc(Number(level)) : 0, 0, maxLevel);
  return Number(option.levels?.[selectedLevel] ?? (selectedLevel === 0 ? option.baseValue ?? option.value : undefined) ?? option.levels?.at?.(-1) ?? option.baseValue ?? option.value ?? 0);
}

export function selectedHeroicEffects(item, selection) {
  const selectedStatIds = new Set();
  return normalizeHeroicEffectRows(selection?.heroicEffects, item).flatMap((row, groupIndex) => {
    if (!row.statId) return [];
    if (selectedStatIds.has(row.statId)) return [];
    const option = heroicEffectOptions(item, groupIndex).find((entry) => entry.statId === row.statId);
    if (!option) return [];
    selectedStatIds.add(row.statId);
    const level = clamp(Number.isFinite(Number(row.level)) ? Math.trunc(Number(row.level)) : 0, 0, option.maxLevel);
    const value = heroicEffectValue(option, level);
    return [{
      ...option,
      level,
      levelKnown: row.levelKnown === true,
      value,
      groupIndex,
      groupNumber: groupIndex + 1,
      name: statName(option.statId),
      formattedValue: formatSigned(value, option.statId),
    }];
  });
}

export function itemSourceText(item) {
  return item.itemSource || item.source || item.acquire || item.location || "Source not mapped in the current data bundle.";
}

export function itemSkillCores(item) {
  return (item.availablePerks ?? [])
    .filter((perk) => perk?.passive?.name || perk?.passive?.text || perk?.name)
    .sort((a, b) => String(a.passive?.name ?? a.name).localeCompare(String(b.passive?.name ?? b.name)));
}

// Canonical selected-core authority. A stored id is meaningful only when the
// selected item actually exposes that exact catalogue entry. Unsupported but
// available cores remain selectable and visible; the calculator simply does
// not invent a numeric rule for them.
export function selectedItemPerk(item, selection) {
  const perkId = String(selection?.perkId ?? "").trim();
  if (!perkId) return null;
  return values(item?.availablePerks).find((perk) => perk?.id === perkId) ?? null;
}

export function itemPassiveComplexIds(item, selection) {
  const selectedPerk = selectedItemPerk(item, selection);
  return [...new Set([item?.passives?.id, selectedPerk?.passive?.id].filter(Boolean))];
}

// Shipped client text states that only the highest level of a repeated
// Equipment Skill or Skill Core activates. Build 24118850 projects one fixed
// rule per complex ID and no per-copy skill level, so one-copy deduplication is
// exact for the current catalogue. The canonical topology test fails if a
// future data build introduces a legal duplicate persistent complex; that
// change must project levels before ranking differing copies.
export function activePersistentItemPassiveSources(progression, selections) {
  const weaponTypes = new Set(progression?.equippedWeaponTypes ?? []);
  const candidates = [];
  for (const [selectionIndex, { slotId, selection, item }] of values(selections).entries()) {
    const itemPassiveId = item?.passives?.id;
    const itemRule = ITEM_PASSIVE_RULES[itemPassiveId];
    if (itemRule) candidates.push({
      passiveId: itemPassiveId,
      rule: itemRule,
      name: item.passives.name ?? itemPassiveId,
      slot: slotId,
      grade: item.grade,
      imageUrl: item.passives.imageUrl,
      kind: "item",
      selectionIndex,
    });
    const perk = selectedItemPerk(item, selection);
    const perkPassiveId = perk?.passive?.id;
    const perkRule = PERK_PASSIVE_RULES[perkPassiveId];
    const requiredWeaponEquipped = !perkRule?.requiredWeapon || weaponTypes.has(perkRule.requiredWeapon);
    if (perkRule && requiredWeaponEquipped) candidates.push({
      passiveId: perkPassiveId,
      rule: perkRule,
      name: perk.passive.name ?? perk.name ?? perkPassiveId,
      slot: "skill_core",
      grade: perk.grade,
      imageUrl: perk.passive.imageUrl,
      kind: "perk",
      selectionIndex,
    });
  }
  candidates.sort((a, b) => a.selectionIndex - b.selectionIndex
    || a.kind.localeCompare(b.kind));
  const activated = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.passiveId)) continue;
    seen.add(candidate.passiveId);
    activated.push(candidate);
  }
  return activated;
}

// Candidate generation is deliberately narrower than Armory editing. Blank
// is always legal, while automatic selection may use only executable static
// rules. Multiple catalogue aliases for one passive complex are equivalent;
// choose the lexically first id so results are stable across projection order.
export function calculableItemPerkVariants(item, options = {}) {
  const blank = { perkId: "", perk: null, passiveId: "", requiredWeapon: "" };
  const includeScenarioEffects = options?.scenario != null;
  const candidates = values(item?.availablePerks)
    .filter((perk) => perk?.id && perk?.passive?.id && (
      PERK_PASSIVE_RULES[perk.passive.id]
      || (includeScenarioEffects && SCENARIO_EFFECT_DEFINITIONS[perk.passive.id])
    ))
    .sort((a, b) => String(a.passive.id).localeCompare(String(b.passive.id)) || String(a.id).localeCompare(String(b.id)));
  const seenPassiveIds = new Set();
  const variants = [];
  for (const perk of candidates) {
    const passiveId = perk.passive.id;
    if (seenPassiveIds.has(passiveId)) continue;
    seenPassiveIds.add(passiveId);
    variants.push({
      perkId: perk.id,
      perk,
      passiveId,
      requiredWeapon: PERK_PASSIVE_RULES[passiveId]?.requiredWeapon
        ?? SCENARIO_EFFECT_DEFINITIONS[passiveId]?.requiredWeapon
        ?? "",
    });
  }
  return [blank, ...variants];
}

const PASSIVE_EFFECT_CLASS_BY_FAMILY = Object.freeze(Object.fromEntries(
  Object.entries(PASSIVE_EFFECT_CONTRACT.families).map(([familyId, family]) => [
    familyId,
    Object.freeze(Object.fromEntries(
      Object.entries(family.classes).flatMap(([classId, ids]) => ids.map((id) => [id, classId])),
    )),
  ]),
));

export function passiveEffectClassification(familyId, effectId) {
  return PASSIVE_EFFECT_CLASS_BY_FAMILY[familyId]?.[effectId] ?? "unclassified";
}

function passiveEffectContractIssue(familyId, effectId, effectName = effectId) {
  const classification = passiveEffectClassification(familyId, effectId);
  const details = {
    persistentOwnerSemanticsUnresolved: ["persistent_owner_semantics_unresolved", "owner inclusion is unresolved"],
    sourceConflict: ["passive_effect_source_conflict", "decoded sources conflict"],
    unresolvedDecode: ["passive_effect_decode_unresolved", "the decoded effect join is unresolved"],
    persistentUnrepresentable: ["persistent_effect_unrepresentable", "the persistent effect is not representable by the static stat model"],
    unclassified: ["passive_effect_unclassified", "the effect is absent from the build-scoped passive contract"],
  }[classification];
  if (!details) return null;
  return {
    severity: "error",
    code: details[0],
    calculationImpact: classification === "unclassified" ? "invalid" : "provisional",
    message: `${effectName}: ${details[1]}. Static totals exclude it.`,
  };
}

export function itemSelectionCalculationStatus(item, selection, options = {}) {
  const issues = [];
  if (!item) return calculationStatus({ issues: [invalidSelectionIssue("invalid_item_id", "Unknown item selection.")] });
  issues.push(...validateItemSelectionConfiguration(options.slotId ?? item.equipmentType, selection ?? {}, item));
  const perkId = String(selection?.perkId ?? "").trim();
  const perk = selectedItemPerk(item, selection);
  if (perkId && !perk) issues.push(invalidSelectionIssue("invalid_item_perk", `${item.name} does not offer stored Skill Core ${perkId}.`));
  const weaponTypes = new Set(options.equippedWeaponTypes ?? []);
  const perkRule = PERK_PASSIVE_RULES[perk?.passive?.id];
  if (perkRule?.requiredWeapon && !weaponTypes.has(perkRule.requiredWeapon)) {
    issues.push({ severity: "error", code: "perk_required_weapon_missing", calculationImpact: "none", message: `${perk.passive?.name ?? perk.name} requires ${label(perkRule.requiredWeapon)}.` });
  }
  if (item.passives?.id) {
    const contractIssue = passiveEffectContractIssue("itemPerkComplex", item.passives.id, item.passives.name ?? item.passives.id);
    if (contractIssue) issues.push(contractIssue);
  }
  if (perk?.passive?.id) {
    const contractIssue = passiveEffectContractIssue("itemPerkComplex", perk.passive.id, perk.passive.name ?? perk.name ?? perk.id);
    if (contractIssue) issues.push(contractIssue);
  }
  return calculationStatus({ issues });
}

const PASSIVE_TEXT_OVERRIDES = Object.freeze({
  // Several western localizations bind Orthodox to Southpaw's _GT_02 formula.
  // The decoded Orthodox _GT_01 amount and correctly bound Asian strings are 40.
  SkillSet_WP_Item_Field_NIX_GT_01: "Increases Main Weapon Damage by 40.",
});

export function passiveEffectText(passive) {
  return PASSIVE_TEXT_OVERRIDES[passive?.id] ?? passive?.text ?? "";
}

export function itemTooltipEffects(item, selection) {
  const effects = [];
  if (item.passives?.name || item.passives?.text) {
    effects.push({
      label: "Passive:",
      type: "passive",
      name: item.passives.name ?? "Passive",
      text: passiveEffectText(item.passives),
      imageUrl: item.passives.imageUrl ?? "",
    });
  }
  const selectedPerk = selectedItemPerk(item, selection);
  if (selectedPerk?.passive?.name || selectedPerk?.passive?.text || selectedPerk?.name) {
    effects.push({
      label: "Skill Core:",
      type: "skillCore",
      name: selectedPerk.passive?.name ?? selectedPerk.name,
      text: passiveEffectText(selectedPerk.passive),
      imageUrl: selectedPerk.passive?.imageUrl ?? selectedPerk.imageUrl ?? "",
    });
  }
  return effects;
}

// Full data model for the equipped-item hover card (doll rails on Armory +
// Tracker). Pure data — no handlers, no colors that aren't grade-derived.
export function buildItemHoverModel(slotId, build, calc, options = {}) {
  const item = slotItem(slotId, build);
  if (!item) return null;
  const selection = slotSelection(slotId, build);
  const color = gradeColor(item.grade);
  const level = selectedItemLevel(item, selection.level);
  const mainValues = flattenQuestlogMainStats(item.itemStats?.main?.[String(level)]);
  const extraValues = item.itemStats?.extra?.[String(level)] ?? {};
  const statRow = (statId, value, kind = "core") => ({
    statId, value, kind, name: statName(statId), formattedValue: formatStat(statId, value),
    text: `${statName(statId)} ${formatStat(statId, value)}`,
  });
  let stats = [...new Set([...Object.keys(mainValues), ...Object.keys(extraValues)])]
    .map((statId) => statRow(statId, Number(mainValues[statId] ?? 0) + Number(extraValues[statId] ?? 0), statId in mainValues ? "core" : "extra"))
    .filter((row) => Math.abs(Number(row.value) || 0) > 1e-9);
  if (options.beforeCalc && calc) {
    const derivedSourceValue = (calculation, statId, attributeId) => {
      const row = calculation.stats.find((entry) => entry.id === statId);
      return (row?.sources ?? [])
        .filter((source) => ["attribute_bonus", "attribute_bracket"].includes(source.type) && String(source.sourceLabel).toLowerCase().startsWith(attributeId))
        .reduce((sum, source) => sum + Number(source.value || 0), 0);
    };
    stats = stats.map((row) => {
      if (!ATTRIBUTES.some(([attributeId]) => attributeId === row.statId)) return row;
      const childIds = new Set([...options.beforeCalc.stats.map((entry) => entry.id), ...calc.stats.map((entry) => entry.id)]);
      let children = [...childIds].map((statId) => {
        const delta = derivedSourceValue(calc, statId, row.statId) - derivedSourceValue(options.beforeCalc, statId, row.statId);
        return { statId, value: delta, name: statName(statId), formattedValue: formatSigned(delta, statId) };
      }).filter((child) => child.statId !== row.statId && Math.abs(child.value) > 1e-9);
      const expandedDescendants = new Set();
      const collectExpanded = (statId) => {
        for (const expandedId of STAT_EXPANSIONS[statId] ?? []) {
          if (expandedDescendants.has(expandedId)) continue;
          expandedDescendants.add(expandedId);
          collectExpanded(expandedId);
        }
      };
      for (const child of children) collectExpanded(child.statId);
      const preferredChildren = new Set(children.filter((child) => (options.preferredStatIds ?? []).includes(child.statId)).map((child) => child.statId));
      const expandsToPreferred = (statId) => {
        const queue = [...(STAT_EXPANSIONS[statId] ?? [])];
        const seen = new Set();
        while (queue.length) {
          const candidate = queue.shift();
          if (preferredChildren.has(candidate)) return true;
          if (seen.has(candidate)) continue;
          seen.add(candidate);
          queue.push(...(STAT_EXPANSIONS[candidate] ?? []));
        }
        return false;
      };
      children = children.filter((child) => preferredChildren.has(child.statId) || (!expandedDescendants.has(child.statId) && !expandsToPreferred(child.statId)));
      return { ...row, children, hasChildren: children.length > 0 };
    });
  }

  const tierRow = (statId, tiersRaw, tier) => {
    const arr = Array.isArray(tiersRaw) ? tiersRaw : Object.values(tiersRaw ?? {});
    const v = arr[clamp(Number(tier || 1), 1, Math.max(1, arr.length)) - 1];
    return statRow(statId, v, "trait");
  };
  // Prefer what's actually rolled on the equipped item; if the build has no
  // selection for this piece, fall back to the item's own trait lines (max tier)
  // so the card always shows the gear's full stat block, not just its set.
  const maxTierVal = (tiersRaw) => { const a = Array.isArray(tiersRaw) ? tiersRaw : Object.values(tiersRaw ?? {}); return a.length; };
  const selTraits = normalizeSelectionRows(selection.traits);
  const traits = (selTraits.length
    ? selTraits.map((r) => tierRow(r.statId, item.itemStats?.traits?.[r.statId], r.tier))
    : options.optionalFallback === false ? []
    : Object.entries(item.itemStats?.traits ?? {}).slice(0, NORMAL_TRAIT_CAP).map(([statId, tiers]) => tierRow(statId, tiers, maxTierVal(tiers))));
  const selReson = normalizeSelectionRows(selection.resonance);
  const resonance = (selReson.length
    ? selReson.map((r) => tierRow(r.statId, item.itemStats?.resonance?.[r.statId]?.tiers, r.tier))
    : options.optionalFallback === false ? []
    : Object.entries(item.itemStats?.resonance ?? {}).slice(0, RESONANCE_CAP).map(([statId, row]) => tierRow(statId, row?.tiers, maxTierVal(row?.tiers))));
  const resonanceOptions = Object.entries(item.itemStats?.resonance ?? {}).map(([statId, row]) => ({
    ...tierRow(statId, row?.tiers, maxTierVal(row?.tiers)),
    probability: Number(row?.probability ?? 0),
  }));
  const uniqueEntries = Object.entries(item.itemStats?.uniqueTraits ?? {});
  const unique = selection.uniqueTrait
    ? [tierRow(selection.uniqueTrait.statId, item.itemStats?.uniqueTraits?.[selection.uniqueTrait.statId], selection.uniqueTrait.tier)]
    : options.optionalFallback === false ? []
    : uniqueEntries.slice(0, UNIQUE_TRAIT_CAP).map(([statId, tiers]) => tierRow(statId, tiers, maxTierVal(tiers)));
  const heroicEffects = selectedHeroicEffects(item, selection).map((effect) => ({
    groupNumber: effect.groupNumber,
    name: effect.name,
    value: effect.formattedValue,
    level: effect.level,
    levelKnown: effect.levelKnown,
    maxLevel: effect.maxLevel,
    text: `${effect.name} ${effect.formattedValue}`,
  }));

  const typeColors = { attack: "#e56a6a", defense: "#72a9ff", assist: "#55d58a" };
  const filledRunes = normalizeRuneRows(selection.runes).filter((r) => r.runeId).map((r) => {
    const rune = indexes.runeById[r.runeId];
    const opts = rune ? runeStatOptions(rune) : [];
    const opt = opts.find((o) => o.statId === r.statId) ?? opts[0];
    const maxLevel = Math.max(1, (opt?.levels?.length ?? 1) - 1);
    const lvl = clamp(Number(r.level || 1), 1, maxLevel);
    const val = opt?.levels?.[lvl] ?? 0;
    return {
      empty: false,
      filled: true,
      icon: rune?.imageUrl ?? "", hasIcon: Boolean(rune?.imageUrl),
      typeLabel: rune ? runeTypeLabel(rune.runeType).toUpperCase() : "",
      typeColor: rune ? (typeColors[rune.runeType] ?? "#cbb185") : "#cbb185",
      gradeName: rune ? runeTierLabel(rune) : "",
      level: lvl,
      maxLevel,
      maxLevelLabel: `Max Lv ${maxLevel}`,
      contribution: r.statId ? `+${formatStat(r.statId, val)} ${statName(r.statId)}` : "",
    };
  });
  const isEquipmentSlot = EQUIPMENT_SLOTS.some((s) => s.id === slotId);
  const runes = isEquipmentSlot
    ? [...filledRunes, ...Array.from({ length: Math.max(0, 3 - filledRunes.length) }, () => ({ empty: true, filled: false, typeColor: "rgba(212, 166, 94, 0.3)", hasIcon: false }))]
    : filledRunes;

  const synergy = calc?.runeSynergies?.[slotId];
  const synergyStats = synergy ? Object.entries(synergy.stats ?? {}).map(([id, v]) => `${statName(id)} ${formatSigned(v, id)}`) : [];

  const effects = itemTooltipEffects(item, selection).map((e) => ({ label: e.label, name: e.name, text: plainInline(e.text), icon: e.imageUrl || "", hasIcon: Boolean(e.imageUrl) }));

  let setInfo = null;
  if (item.setId) {
    const set = indexes.itemSetById[item.setId];
    if (set) {
      const members = values(set.itemSetMadeOfItems);
      const count = activeSetCounts(allBuildSelectionEntries(build)).find((row) => row.set.id === set.id)?.count ?? 0;
      // Applied values come from the canonical calculator trace. Re-running a
      // dynamic rule against final totals can feed it its own result, while
      // raw descriptions cannot explain exclusivity or unsupported effects.
      const calculatedSet = calc?.setEffects?.sets?.find((row) => row.setId === set.id);
      const bonuses = values(set.itemSetBonus).map((b) => {
        const req = Number(b.set_count || 0);
        const active = count >= req;
        const evaluated = calculatedSet?.breakpoints?.find((row) => row.required === req);
        const stats = values(b.bonus_stat).map((s) => `${statName(s.type)} ${formatStat(s.type, s.value)}`);
        const pass = values(b.bonus_passive).map((p) => p?.name ? (p.text ? `${plainInline(p.name)} — ${plainInline(p.text)}` : plainInline(p.name)) : plainInline(p?.text));
        const fullySuppressed = evaluated?.status === "suppressed";
        const unsupported = evaluated?.status === "unsupported";
        const summary = active && evaluated ? setEffectBreakpointSummary(evaluated) : "";
        const computedText = summary ? `${evaluated.status === "applied" ? "Applied: " : ""}${summary}` : "";
        return {
          required: `${req} pc`,
          active: active && !fullySuppressed && !unsupported,
          suppressed: fullySuppressed,
          mark: fullySuppressed ? "✕" : unsupported ? "!" : active ? "✓" : "○",
          opacity: active && !fullySuppressed ? "1" : "0.58",
          color: fullySuppressed || unsupported ? "#c9955a" : active ? "#7ee0a6" : "#8a795f",
          text: [...stats, ...pass].filter(Boolean).join(", ") || "Set bonus",
          computedText,
          hasComputed: Boolean(computedText),
        };
      });
      setInfo = { name: set.name, countLabel: `${count}/${members.length}`, bonuses };
    }
  }

  return {
    name: item.name, nameColor: color, icon: item.imageUrl ?? "", hasIcon: Boolean(item.imageUrl),
    meta: `${gradeName(item.grade)} · ${label(item.equipmentType)} · Lv ${level}`,
    headBg: `linear-gradient(180deg, ${color}26, transparent)`, headBorder: `2px solid ${color}`,
    stats, hasStats: stats.length > 0, hasAttributeGains: stats.some((row) => row.hasChildren),
    traits, hasTraits: traits.length > 0,
    unique, hasUnique: unique.length > 0,
    heroicEffects, hasHeroicEffects: heroicEffects.length > 0,
    resonance, hasResonance: resonance.length > 0,
    resonanceOptions, hasResonanceOptions: resonanceOptions.length > 0,
    visibleResonance: resonance,
    resonanceTitle: "Trait Resonance",
    showResonanceHint: resonanceOptions.length > resonance.length,
    runes, hasRunes: isEquipmentSlot || runes.length > 0,
    synergyName: synergy?.name ?? "", synergyStats, hasSynergy: Boolean(synergy) && synergyStats.length > 0,
    effects, hasEffects: effects.length > 0,
    setInfo, hasSet: Boolean(setInfo),
  };
}

export function itemPassiveText(item) {
  return [
    item.passive,
    item.passiveDescription,
    item.itemPassive,
    item.itemSkill,
    item.skillDescription,
    item.description,
    ...itemSkillCores(item).flatMap((perk) => [perk.name, perk.passive?.name, perk.passive?.text]),
  ].filter(Boolean).join(" ");
}

export function plainInline(value) {
  return String(value ?? "").replace(/<[^>]+>/g, "").trim();
}

export function itemDatabaseUrl(item) {
  return `https://questlog.gg/throne-and-liberty/en/db/item/${encodeURIComponent(item.id)}`;
}

// ---------- item picker helpers ----------

export function itemMatchesPicker(item, slotId, query, pickerType, pickerGrade) {
  if (pickerType && pickerType !== "all" && item.equipmentType !== pickerType) return false;
  if (pickerGrade && pickerGrade !== "all" && String(item.grade) !== String(pickerGrade)) return false;
  if (!query) return true;
  const haystack = [
    item.name,
    item.equipmentType,
    gradeName(item.grade),
    itemLevelRangeLabel(getItemLevels(item)),
    itemSourceText(item),
    itemPassiveText(item),
    ...itemSearchStatNames(item),
    ...Object.keys(item.itemStats?.traits ?? {}).map(statName),
    ...Object.keys(item.itemStats?.resonance ?? {}).map(statName),
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query);
}

// Stat display names found anywhere in the item's raw stat blocks, for the
// picker search haystack only — display values come from the live engine.
export function itemSearchStatNames(item) {
  const names = new Set();
  const isStatId = (key) => STAT_UNIT_MODIFIERS[key] !== undefined || STAT_ALIASES[key] !== undefined || data?.statLabels?.[key] !== undefined;
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    for (const [key, nested] of Object.entries(value)) {
      if (isStatId(key)) names.add(statName(key));
      else if (key === "stat_id" || key === "statId") { if (typeof nested === "string" && nested) names.add(statName(nested)); }
      if (nested && typeof nested === "object") visit(nested);
    }
  };
  visit(item.itemStats ?? {});
  return [...names];
}

export function sortItemPickerItems(a, b, sort) {
  if (sort === "grade_desc") return (b.grade ?? 0) - (a.grade ?? 0) || itemMaxLevel(b) - itemMaxLevel(a) || a.name.localeCompare(b.name);
  if (sort === "type_name") return label(a.equipmentType).localeCompare(label(b.equipmentType)) || itemMaxLevel(b) - itemMaxLevel(a) || a.name.localeCompare(b.name);
  if (sort === "name_asc") return a.name.localeCompare(b.name);
  return itemMaxLevel(b) - itemMaxLevel(a) || (b.grade ?? 0) - (a.grade ?? 0) || a.name.localeCompare(b.name);
}

export function pickerTypeOptions(items) {
  return [...new Set(items.map((item) => item.equipmentType).filter(Boolean))]
    .sort((a, b) => label(a).localeCompare(label(b)));
}

export function pickerGradeOptions(items) {
  return [...new Set(items.map((item) => item.grade).filter((grade) => grade !== undefined && grade !== null))]
    .sort((a, b) => Number(b) - Number(a));
}

export function statSummaryKind(id) {
  if (id === "damage_reduction" || id === "shield_block_chance") return "main";
  if (id.includes("attack_power") || id.includes("armor") || id.includes("attack_speed") || id.includes("attack_range")) return "main";
  return "extra";
}

export function statSummaryRank(a, b) {
  const important = [
    "attack_power_main_hand_min",
    "attack_power_main_hand_max",
    "attack_power_off_hand_min",
    "attack_power_off_hand_max",
    "damage_reduction",
    "shield_block_chance",
    "attack_range_main_hand",
    "attack_range_off_hand",
    "attack_speed_main_hand",
    "attack_speed_off_hand",
    "all_double_attack",
    "all_accuracy",
    "hp_max",
    "skill_cooldown_modifier",
    "all_critical_attack",
    "melee_armor",
    "range_armor",
    "magic_armor",
  ];
  const aIndex = important.indexOf(a);
  const bIndex = important.indexOf(b);
  return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
}

export function pickerRowChips(item, slotId, level, build, attributes) {
  const contribution = itemStatContribution(item, slotId, level, build, attributes);
  const handBase = slotId === "off_hand" ? "attack_power_off_hand" : "attack_power_main_hand";
  const minId = `${handBase}_min`;
  const maxId = `${handBase}_max`;
  const consumed = new Set([minId, maxId, "value"]);
  const chips = [];
  if (contribution[minId] || contribution[maxId]) {
    chips.push(`Base Damage ${formatStat(minId, contribution[minId] ?? 0)} ~ ${formatStat(maxId, contribution[maxId] ?? 0)}`);
  }
  const rest = Object.entries(contribution)
    .filter(([id, value]) => value && !consumed.has(id))
    .map(([id, value]) => ({ id, value }))
    .sort((a, b) => statSummaryRank(a.id, b.id) || Math.abs(b.value) - Math.abs(a.value) || statName(a.id).localeCompare(statName(b.id)));
  for (const entry of rest) {
    if (chips.length >= 3) break;
    chips.push(`${TOOLTIP_STAT_LABELS[entry.id] ?? statName(entry.id)} ${formatStat(entry.id, entry.value)}`);
  }
  // Artifacts contribute nothing until one of their stats is selected — list
  // the choices instead of showing an empty (but truthful) card.
  if (!chips.length) {
    const artifactRows = item.itemStats?.artifact?.[0] ?? item.itemStats?.artifact?.["0"];
    const options = Object.keys(artifactRows ?? {});
    if (options.length) chips.push(`Pick one: ${options.slice(0, 3).map(statName).join(" / ")}${options.length > 3 ? " …" : ""}`);
  }
  return chips;
}

export function itemComparisonRows(slotId, item, level, build, attributes) {
  const selection = slotSelection(slotId, build);
  const currentItem = indexes.itemById[selection.itemId];
  const comparing = Boolean(currentItem) && currentItem.id !== item.id;
  // "Before" is the equipped item with its full selection (traits, runes,
  // heroic effects) because unequipping loses all of it; "after" is the
  // candidate equipped bare, exactly as equipItem will apply it.
  const before = currentItem ? slotSelectionContribution(slotId, selection, build, attributes) : {};
  const after = comparing || !currentItem ? itemStatContribution(item, slotId, level, build, attributes) : before;
  const consumed = new Set();
  const rows = [];
  const handBase = slotId === "off_hand" ? "attack_power_off_hand" : "attack_power_main_hand";
  const minId = `${handBase}_min`;
  const maxId = `${handBase}_max`;
  if (before[minId] || before[maxId] || after[minId] || after[maxId]) {
    consumed.add(minId);
    consumed.add(maxId);
    rows.push(makeComparisonRangeRow("base_damage", "Base Damage", before, after, minId, maxId));
  }
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (consumed.has(id) || id === "value") continue;
    rows.push(makeComparisonRow(id, before[id] ?? 0, after[id] ?? 0));
  }
  rows.sort((a, b) => statSummaryRank(a.sortId, b.sortId) || Number(b.hasAfter) - Number(a.hasAfter) || Math.abs(b.delta) - Math.abs(a.delta) || a.label.localeCompare(b.label));
  if (!comparing) {
    for (const row of rows) {
      row.status = "plain";
      row.delta = 0;
    }
  }
  const mainRows = rows.filter((row) => row.kind === "main");
  const isSecondaryMain = (row) => /attack_range|attack_speed|block_chance/.test(row.id);
  return {
    comparing,
    headline: mainRows.filter((row) => !isSecondaryMain(row)).slice(0, 4),
    secondary: mainRows.filter((row) => isSecondaryMain(row)).slice(0, 4),
    extra: rows.filter((row) => row.kind !== "main").slice(0, 8),
  };
}

function makeComparisonRangeRow(id, labelText, before, after, minId, maxId) {
  const beforeMin = before[minId] ?? 0;
  const beforeMax = before[maxId] ?? 0;
  const afterMin = after[minId] ?? 0;
  const afterMax = after[maxId] ?? 0;
  return {
    id,
    sortId: minId,
    deltaStatId: maxId,
    label: labelText,
    beforeLabel: `${formatStat(minId, beforeMin)} ~ ${formatStat(maxId, beforeMax)}`,
    afterLabel: `${formatStat(minId, afterMin)} ~ ${formatStat(maxId, afterMax)}`,
    delta: afterMax - beforeMax,
    hasBefore: Boolean(beforeMin || beforeMax),
    hasAfter: Boolean(afterMin || afterMax),
    status: comparisonStatus(beforeMin || beforeMax, afterMin || afterMax),
    kind: "main",
  };
}

function makeComparisonRow(id, beforeValue, afterValue) {
  return {
    id,
    sortId: id,
    label: TOOLTIP_STAT_LABELS[id] ?? statName(id),
    beforeLabel: formatStat(id, beforeValue),
    afterLabel: formatStat(id, afterValue),
    delta: afterValue - beforeValue,
    hasBefore: Boolean(beforeValue),
    hasAfter: Boolean(afterValue),
    status: comparisonStatus(beforeValue, afterValue),
    kind: statSummaryKind(id),
  };
}

function comparisonStatus(beforeValue, afterValue) {
  if (!beforeValue && afterValue) return "new";
  if (beforeValue && !afterValue) return "removed";
  if (afterValue > beforeValue) return "up";
  if (afterValue < beforeValue) return "down";
  return "same";
}

// ---------- rune helpers ----------

export function runeCategoryForSlot(slot) {
  if (slot === "main_hand" || slot === "off_hand") return "weapon";
  if (slot.startsWith("ring")) return "ring";
  if (slot.startsWith("earring")) return "earring";
  return slot;
}

export function runeStatOptions(rune) {
  if (!rune) return [];
  const groups = Object.entries(rune.itemStats ?? {})
    .filter(([key, value]) => key.startsWith("random_stat_group") && Array.isArray(value))
    .flatMap(([, value]) => value);
  return groups.map((entry) => ({
    statId: entry.stat_id,
    levels: entry.levels ?? [],
    maxLevel: Number(entry.max_level ?? Math.max(1, (entry.levels?.length ?? 1) - 1)),
    probability: entry.probability ?? 0,
  }));
}

export function runeMaxLevel(rune, statId) {
  return Math.max(1, runeStatOptions(rune).find((option) => option.statId === statId)?.maxLevel ?? 1);
}

export function runeTypeLabel(type) {
  return type === "assist" ? "Support" : label(type);
}

export function runeTierLabel(rune) {
  if (!rune) return "";
  if (rune.runeType === "chaos") return rune.grade >= 41 ? "Epic Chaos" : "Rare Chaos";
  const names = { 11: "Common", 21: "Uncommon", 31: "Rare", 32: "Rare II", 41: "Epic", 42: "Epic II", 43: "Epic III" };
  return names[rune.grade] ?? gradeName(rune.grade);
}

export function runeChoicesForCategory(category) {
  const byTier = new Map();
  for (const rune of indexes?.runesByCategory?.[category] ?? []) {
    const key = `${rune.runeType}|${rune.grade}`;
    const existing = byTier.get(key);
    const generation = (row) => row?.id?.includes("_kAA2_") ? 3 : row?.id?.includes("_kAA_") ? 2 : row?.id?.includes("_kA_") ? 1 : 0;
    if (!existing || generation(rune) > generation(existing)) byTier.set(key, rune);
  }
  const typeOrder = { attack: 0, defense: 1, assist: 2, chaos: 3 };
  return [...byTier.values()].sort((a, b) => (
    (typeOrder[a.runeType] ?? 9) - (typeOrder[b.runeType] ?? 9)
    || Number(b.grade ?? 0) - Number(a.grade ?? 0)
  ));
}

export function findRuneSynergy(category, types) {
  const expandChaos = (rows, index = 0) => {
    if (index >= rows.length) return [rows];
    if (rows[index] !== "chaos") return expandChaos(rows, index + 1);
    return ["attack", "defense", "assist"].flatMap((type) => {
      const next = [...rows];
      next[index] = type;
      return expandChaos(next, index + 1);
    });
  };
  const candidates = expandChaos([...types]);
  const synergies = data.runeSynergies.filter((synergy) => synergy.equipmentCategory === category);
  return candidates.map((candidate) => synergies.find((synergy) => (
    (synergy.combination ?? []).join("|") === candidate.join("|")
  ))).find(Boolean) ?? null;
}

// ---------- skills helpers ----------

export function skillLoadoutType(skill) {
  return skill?.skillType === "passive" ? "passive" : skill?.skillType === "defensive" ? "defensive" : "active";
}

export function skillTypeSort(skill) {
  const type = skillLoadoutType(skill);
  if (type === "active") return 0;
  if (type === "passive") return 1;
  return 2;
}

export function skillCapForType(type, level = CHARACTER_LEVEL) {
  return type === "passive" ? passiveSkillCapForLevel(level) : type === "defensive" ? 1 : ACTIVE_SKILL_CAP;
}

export function skillMaxLevel(skill) {
  return Math.max(1, Number(skill?.maxLevel || skill?.levels?.length || 1));
}

export function skillDefaultLevel(skill) {
  return skillBandedMax(skill);
}

// Highest level reachable through the normal tier rows (Common..Heroic, 5 each).
// The one level above this (the "Ascended" level) is a special gear-potential
// unlock and is intentionally NOT part of the normal skill-level ramp.
export function skillBandedMax(skill) {
  const bands = skillLevelBands(skillMaxLevel(skill));
  return bands.length ? bands[bands.length - 1].max : 1;
}

export function skillTraitsFor(skillId) {
  const ids = data.traitsBySkillId?.[skillId] ?? indexes.skillById[skillId]?.specializationIds ?? [];
  return ids.map((id) => indexes.skillTraitById[id]).filter(Boolean);
}

export function skillLevelRow(skill, level) {
  return values(skill?.levels).find((row) => Number(row.level) === Number(level)) ?? values(skill?.levels)[Math.max(0, Number(level || 1) - 1)];
}

export function availableSkillsForWeapons(weapons) {
  const weaponSet = new Set(weapons);
  const indexed = weapons
    .flatMap((weapon) => data.skillsByWeapon?.[weapon] ?? [])
    .map((id) => indexes.skillById[id])
    .filter((skill) => skill && weaponSet.has(skill.mainCategory));
  const source = indexed.length ? indexed : (data.skills ?? []).filter((skill) => weaponSet.has(skill.mainCategory));
  return [...new Map(source.map((skill) => [skill.id, skill])).values()]
    .sort((a, b) => skillTypeSort(a) - skillTypeSort(b) || String(a.skillSlotAffinity).localeCompare(String(b.skillSlotAffinity)) || a.name.localeCompare(b.name));
}

export function selectedSkillRows(build) {
  return normalizeSkillSelections(build.skills).map((selection) => {
    const skill = indexes.skillById[selection.skillId];
    return { skill, selection, loadoutType: skillLoadoutType(skill) };
  }).filter((row) => row.skill);
}

// Canonical, non-mutating projection of the progression that is allowed to
// affect a build. Stored selections are deliberately retained on the build so
// swapping weapons does not destroy work, but only selections belonging to an
// equipped weapon family are active. Unified mastery is global and therefore
// has no weapon-family gate.
export function effectiveProgression(build, options = {}) {
  const equippedTypes = equippedWeaponTypes(build);
  const requestedWeaponTypes = Array.isArray(options.weaponTypes) ? options.weaponTypes : null;
  const weaponTypes = requestedWeaponTypes && equippedTypes.length === 0
    ? [...new Set(requestedWeaponTypes.filter((weapon) => WEAPON_TYPES.includes(weapon)))]
    : equippedTypes;
  const weaponSet = new Set(weaponTypes);
  const skills = [];
  const inactiveSkills = [];
  const masteries = [];
  const inactiveMasteries = [];
  const unifiedMasteries = [];
  const inactiveUnifiedMasteries = [];
  const issues = [];
  const issue = (code, message, severity = "error", basis = "dataBacked", calculationImpact = "provisional") => issues.push({ code, message, severity, basis, calculationImpact });

  if (build.skills != null && !Array.isArray(build.skills)) {
    issue("invalid_skill_collection", "Stored skills must be an array. The malformed collection is excluded from calculations.", "error", "dataBacked", "invalid");
  }
  const rawSkillIds = new Set();
  for (const stored of Array.isArray(build.skills) ? build.skills : []) {
    const skillId = typeof stored === "string" ? stored : stored?.skillId;
    const skill = indexes?.skillById?.[skillId];
    if (!skill) {
      issue("invalid_skill_id", `Unknown skill ${String(skillId ?? "missing")} is excluded from calculations.`, "error", "dataBacked", "invalid");
      continue;
    }
    if (rawSkillIds.has(skillId)) {
      issue("duplicate_skill_selection", `${skill.name} is selected more than once. Duplicate entries are excluded from calculations.`);
      continue;
    }
    rawSkillIds.add(skillId);
    const rawLevel = Number(stored?.level ?? skillDefaultLevel(skill));
    if (!Number.isInteger(rawLevel) || rawLevel < 1 || rawLevel > skillMaxLevel(skill)) {
      issue("invalid_skill_level", `${skill.name} has invalid stored level ${String(stored?.level)}. Calculations clamp it to the supported range.`);
    }
    if (stored?.specializationIds != null && !Array.isArray(stored.specializationIds)) {
      issue("invalid_skill_specialization_collection", `${skill.name} has a malformed specialization collection. It is excluded from calculations.`);
    }
    const seenSpecializations = new Set();
    for (const specializationId of Array.isArray(stored?.specializationIds) ? stored.specializationIds : []) {
      if (seenSpecializations.has(specializationId)) {
        issue("duplicate_skill_specialization", `${skill.name} contains specialization ${specializationId} more than once. Duplicate entries are excluded from calculations.`);
        continue;
      }
      seenSpecializations.add(specializationId);
      if (indexes.skillTraitById[specializationId]?.skillSetId !== skillId) {
        issue("invalid_skill_specialization", `${skill.name} contains unavailable specialization ${specializationId}. It is excluded from calculations.`, "error", "dataBacked", "invalid");
      }
    }
  }

  for (const row of selectedSkillRows(build)) {
    const storedType = row.selection.loadoutType;
    if (storedType && storedType !== row.loadoutType) {
      issue(
        "skill_type_mismatch",
        `${row.skill.name} is stored as ${label(storedType)} but canonical skill data classifies it as ${label(row.loadoutType)}. Calculations use ${label(row.loadoutType)}.`,
        "error",
        "dataBacked",
        "none",
      );
    }
    if (!weaponSet.has(row.skill.mainCategory)) {
      inactiveSkills.push({ ...row, reason: "foreign_weapon" });
      issue(
        "foreign_weapon_skill",
        `${row.skill.name} requires ${label(row.skill.mainCategory)}, which is not equipped. The stored selection is inactive and excluded from calculations.`,
        "error",
        "dataBacked",
        "none",
      );
      continue;
    }
    skills.push(row);
  }

  for (const type of ["active", "passive", "defensive"]) {
    const count = skills.filter((row) => row.loadoutType === type).length;
    const cap = skillCapForType(type);
    if (count > cap) {
      issue(
        "skill_cap_exceeded",
        `${label(type)} skill cap exceeded: ${count}/${cap}. All equipped-weapon selections remain active until deterministic truncation rules are defined.`,
        "error",
        "dataBacked",
      );
    }
  }

  for (const [masteryId, stored] of Object.entries(build.masteries ?? {})) {
    const mastery = indexes?.masteryById?.[masteryId];
    if (!mastery) {
      inactiveMasteries.push({ masteryId, selection: stored, mastery: null, reason: "unknown" });
      issue("unknown_mastery", `Unknown mastery node ${masteryId} is inactive and excluded from calculations. Its weapon family and effect cannot be verified.`);
      continue;
    }
    const selection = { level: clamp(Number(stored?.level || 1), 1, masteryMaxLevel(mastery)) };
    if (!["normal", "synergy"].includes(mastery.specializationType)) {
      inactiveMasteries.push({ masteryId, selection, mastery, reason: "wrong_category" });
      issue(
        "wrong_category_mastery",
        `${mastery.name} is ${label(mastery.specializationType)} mastery and cannot be selected as weapon mastery. It is excluded from calculations.`,
        "error",
        "dataBacked",
        "invalid",
      );
      continue;
    }
    if (!weaponSet.has(mastery.mainCategory)) {
      inactiveMasteries.push({ masteryId, selection, mastery, reason: "foreign_weapon" });
      issue(
        "foreign_weapon_mastery",
        `${mastery.name} requires ${label(mastery.mainCategory)}, which is not equipped. The stored selection is inactive and excluded from calculations.`,
        "error",
        "dataBacked",
        "none",
      );
      continue;
    }
    masteries.push({ masteryId, mastery, selection });
  }

  issues.push(...validateMasterySelections(build, { activeWeaponTypes: weaponTypes }).issues);

  const seenUnified = new Set();
  for (const masteryId of selectedUnifiedMasteries(build)) {
    if (seenUnified.has(masteryId)) {
      inactiveUnifiedMasteries.push({ masteryId, mastery: indexes?.masteryById?.[masteryId] ?? null, reason: "duplicate" });
      issue("duplicate_unified_mastery", `Unified mastery ${masteryId} is selected more than once. Duplicate entries are excluded from calculations.`);
      continue;
    }
    seenUnified.add(masteryId);
    const mastery = indexes?.masteryById?.[masteryId];
    if (!mastery) {
      inactiveUnifiedMasteries.push({ masteryId, mastery: null, reason: "unknown" });
      issue("unknown_unified_mastery", `Unknown unified mastery node ${masteryId} is inactive and excluded from calculations.`);
      continue;
    }
    if (mastery.specializationType !== "unified") {
      inactiveUnifiedMasteries.push({ masteryId, mastery, reason: "wrong_category" });
      issue("wrong_category_unified_mastery", `${mastery.name} is not a unified mastery node and is excluded from unified mastery calculations.`, "error", "dataBacked", "invalid");
      continue;
    }
    unifiedMasteries.push({ masteryId, mastery });
  }
  if (unifiedMasteries.length > UNIFIED_MASTERY_CAP) {
    issue(
      "unified_mastery_cap_exceeded",
      `Unified mastery cap exceeded: ${unifiedMasteries.length}/${UNIFIED_MASTERY_CAP}. Selections are not truncated automatically.`,
    );
  }
  const unifiedIds = new Set(unifiedMasteries.map(({ masteryId }) => masteryId));
  if (unifiedIds.has("WM_Common_SKILL_002") && unifiedIds.has("WM_Common_SKILL_024")) {
    issue(
      "unified_mastery_mutual_exclusion",
      "Destruction Spear and Piercing Spear are mutually exclusive Overall Mastery selections.",
      "error",
      "dataBacked",
      "invalid",
    );
  }
  const overallMasteryLevel = build.overallMasteryLevel;
  const lockedUnifiedIds = new Set();
  if ((overallMasteryLevel == null || overallMasteryLevel === "") && unifiedMasteries.length) {
    issue(
      "overall_mastery_level_unknown",
      "Overall Mastery Level is not stored, so selected Overall Mastery unlocks cannot be verified.",
    );
  } else if (overallMasteryLevel != null && overallMasteryLevel !== "") {
    const level = Number(overallMasteryLevel);
    if (!Number.isInteger(level) || level < 0) {
      issue("invalid_overall_mastery_level", `Overall Mastery Level ${String(overallMasteryLevel)} is invalid.`, "error", "dataBacked", "invalid");
      for (const { masteryId } of unifiedMasteries) lockedUnifiedIds.add(masteryId);
    } else {
      for (const { masteryId, mastery } of unifiedMasteries) {
        if (Number(mastery.requiredLevel ?? 0) > level) {
          issue("unified_mastery_level_missing", `${mastery.name} requires Overall Mastery Level ${mastery.requiredLevel}; the build stores ${level}.`, "error", "dataBacked", "invalid");
          lockedUnifiedIds.add(masteryId);
        }
      }
    }
  }

  const activeUnifiedMasteries = unifiedMasteries.filter(({ masteryId }) => !lockedUnifiedIds.has(masteryId));
  for (const row of unifiedMasteries) {
    if (lockedUnifiedIds.has(row.masteryId)) inactiveUnifiedMasteries.push({ ...row, reason: "unlock_level_missing" });
  }

  return {
    equippedWeaponTypes: weaponTypes,
    skills,
    inactiveSkills,
    masteries,
    inactiveMasteries,
    unifiedMasteries: activeUnifiedMasteries,
    inactiveUnifiedMasteries,
    issues,
  };
}

export function selectedSkillSelection(skillId, build) {
  return normalizeSkillSelections(build.skills).find((selection) => selection.skillId === skillId) ?? null;
}

export function skillSpecSpent(build) {
  return selectedSkillRows(build).reduce((total, row) => total + skillSpecSpentForSelection(row.selection), 0);
}

export function skillSpecSpentForSelection(selection) {
  if (!selection) return 0;
  return (selection.specializationIds ?? []).reduce((total, id) => total + Number(indexes.skillTraitById[id]?.points || 0), 0);
}

// ---------- mastery helpers ----------

export function masteryRowsForWeapon(weapon) {
  return data.masteries.filter((mastery) => mastery.mainCategory === weapon);
}

export function groupMasteryLanes(rows) {
  const groups = new Map();
  for (const mastery of rows) {
    const key = mastery.subCategory || mastery.specializationType || "general";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mastery);
  }
  return [...groups.entries()]
    .map(([category, nodes]) => ({
      category,
      nodes: nodes.sort((a, b) => masteryNodeOrder(a) - masteryNodeOrder(b) || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => masteryLaneSort(a.category) - masteryLaneSort(b.category) || a.category.localeCompare(b.category));
}

export function masteryLaneSort(category) {
  const order = ["attack", "tacticattack", "attackutil", "util", "utildefense", "defense", "defensetactic", "tactic", "general"];
  const index = order.indexOf(category);
  return index === -1 ? 999 : index;
}

export function masteryNodeOrder(mastery) {
  return Number(mastery.nodeNumber || 999999);
}

export function masteryMaxLevel(mastery) {
  return Math.max(1, values(mastery.stats).length, values(mastery.passives).length);
}

export function masteryStructuredStats(mastery, level) {
  const row = values(mastery.stats)[Math.max(0, Number(level || 1) - 1)];
  return values(row).filter((stat) => stat?.statId && Number.isFinite(Number(stat.value)));
}

export function masteryTextRows(mastery, level) {
  const passives = values(mastery.passives).filter(Boolean);
  const passive = passives[Math.max(0, Number(level || 1) - 1)];
  return [mastery.description, passive].filter(Boolean).map(plainInline);
}

export function shortMasteryNodeLabel(mastery) {
  const number = Number(mastery.nodeNumber || 0);
  if (!number) return "N";
  return String(number).slice(-2);
}

export function masteryCostLabel(mastery) {
  const rows = values(mastery.openCost);
  if (!rows.length) return "No cost";
  return rows.slice(0, 2).map(formatMasteryCostRow).join(" | ");
}

export function formatMasteryCostRow(row) {
  const amount = formatCompactNumber(row?.costAmount ?? 0);
  const material = values(row?.material)[0];
  return `${amount} ${material?.name ?? "cost"}`;
}

// Cost rows enriched with the material's icon + grade, for icon-based chips.
export function masteryCostRows(mastery) {
  return values(mastery?.openCost).map((row) => {
    const material = values(row?.material)[0];
    return {
      key: material?.id ?? material?.name ?? "cost",
      amount: Number(row?.costAmount || 0),
      amountLabel: formatCompactNumber(row?.costAmount ?? 0),
      name: material?.name ?? "Cost",
      icon: material?.imageUrl ?? "",
      grade: material?.grade ?? 0,
    };
  });
}

// Aggregated cost across all selected mastery nodes, with icons.
export function masteryCostSummaryRows(build) {
  const totals = new Map();
  for (const id of Object.keys(build.masteries ?? {})) {
    const mastery = data.masteries.find((entry) => entry.id === id);
    for (const row of values(mastery?.openCost)) {
      const material = values(row?.material)[0];
      const key = material?.id ?? material?.name ?? "cost";
      const prev = totals.get(key) ?? { key, name: material?.name ?? "Cost", icon: material?.imageUrl ?? "", grade: material?.grade ?? 0, amount: 0 };
      prev.amount += Number(row?.costAmount || 0);
      totals.set(key, prev);
    }
  }
  return [...totals.values()]
    .sort((a, b) => b.amount - a.amount)
    .map((row) => ({ ...row, amountLabel: formatCompactNumber(row.amount) }));
}

// ---------- skill level tiers ----------
// Skill levels are grouped into named rarity tiers (Common -> Heroic) instead
// of a flat 1..N ramp. Bands are distributed as evenly as possible across the
// skill's max level and reuse the shared grade colour palette.
export const SKILL_LEVEL_TIERS = [
  { key: "common", name: "Common", grade: 11, color: "#5ecb7c" },
  { key: "uncommon", name: "Uncommon", grade: 21, color: "#6bc2ff" },
  { key: "epic", name: "Epic", grade: 41, color: "#b873ff" },
  { key: "heroic", name: "Heroic", grade: 51, color: "#ff982d" },
];

// Each tier holds a fixed block of levels (1-5 within the tier). Tiers are
// assigned in order; if a skill has more level blocks than named tiers the
// last tier name repeats.
export const SKILL_TIER_SIZE = 5;

export function skillLevelBands(maxLevel) {
  const total = Math.max(1, Number(maxLevel || 1));
  const tiers = SKILL_LEVEL_TIERS;
  const bands = [];
  let next = 1;
  let tierIndex = 0;
  while (next <= total && tierIndex < tiers.length) {
    const tier = tiers[tierIndex];
    const levels = [];
    for (let i = 0; i < SKILL_TIER_SIZE && next <= total; i += 1) { levels.push(next); next += 1; }
    bands.push({ ...tier, color: tier.color ?? gradeColor(tier.grade), levels, min: levels[0], max: levels[levels.length - 1] });
    tierIndex += 1;
  }
  return bands;
}

export function skillLevelTierFor(level, maxLevel) {
  const lvl = clamp(Number(level || 1), 1, Math.max(1, Number(maxLevel || 1)));
  const bands = skillLevelBands(maxLevel);
  return bands.find((band) => lvl >= band.min && lvl <= band.max) ?? bands[bands.length - 1];
}

// ---------- mastery unlock rules ----------
// Rules are aggregate-allocation based (points spent by rarity tier, category
// totals, synergy picks, epic limits) — nodeNumber is layout-only, not a
// prerequisite chain. See mastery-page-rules.md.

export const MASTERY_POINT_BUDGET = 220;

const MASTERY_HYBRID_CATEGORIES = {
  attackutil: ["attack", "util"],
  defensetactic: ["defense", "tactic"],
  tacticattack: ["tactic", "attack"],
  utildefense: ["util", "defense"],
};

export function masteryCategoryKeys(mastery) {
  return MASTERY_HYBRID_CATEGORIES[mastery.subCategory] ?? [mastery.subCategory];
}

export function masterySelectedLevel(mastery, build) {
  const row = build.masteries?.[mastery.id];
  if (!row) return 0;
  return clamp(Number(row.level || 1), 1, masteryMaxLevel(mastery));
}

export function masteryWeaponPointState(weapon, build) {
  const rows = masteryRowsForWeapon(weapon);
  const tierTotals = {};
  const categoryTierTotals = {};
  const categoryTotals = {};
  let totalPoints = 0;
  const selectedNormal = [];
  const selectedSynergy = [];
  for (const mastery of rows) {
    if (!build.masteries?.[mastery.id]) continue;
    if (mastery.specializationType === "normal") {
      const lvl = masterySelectedLevel(mastery, build);
      selectedNormal.push(mastery);
      tierTotals[mastery.grade] = (tierTotals[mastery.grade] || 0) + lvl;
      totalPoints += lvl;
      for (const cat of masteryCategoryKeys(mastery)) {
        const key = `${cat}-${mastery.grade}`;
        categoryTierTotals[key] = (categoryTierTotals[key] || 0) + lvl;
        categoryTotals[cat] = (categoryTotals[cat] || 0) + lvl;
      }
    } else {
      selectedSynergy.push(mastery);
    }
  }
  const synergyCountByTier = {};
  for (const mastery of selectedSynergy) synergyCountByTier[mastery.grade] = (synergyCountByTier[mastery.grade] || 0) + 1;
  const epicSelected = selectedNormal.filter((m) => m.grade === 41);
  const nonEpicPoints = selectedNormal
    .filter((mastery) => mastery.grade !== 41)
    .reduce((total, mastery) => total + masterySelectedLevel(mastery, build), 0);
  return { tierTotals, categoryTierTotals, categoryTotals, totalPoints, nonEpicPoints, selectedNormal, selectedSynergy, synergyCountByTier, epicSelected };
}

// Pure validation authority for persisted weapon-mastery allocations. This
// intentionally reads the raw saved levels instead of normalizeMasterySelections,
// masterySelectedLevel, masteryLockInfo, or reconcileMasterySelections: those UI
// helpers clamp, accept existing picks, or mutate the build. The shipped game
// guide defines the 30-point tier gates, 20-point Achievement threshold,
// highest-category priority, two-per-tier/six-per-weapon limits, and the
// 80/120-point Epic gates. TLWeaponSpecializationLevel contains levels 0..220,
// proving the per-weapon point budget for build 24118850.
export function validateMasterySelections(build, options = {}) {
  const activeWeaponSet = new Set(options.activeWeaponTypes ?? equippedWeaponTypes(build));
  const issues = [];
  const groups = new Map();
  const addIssue = (weapon, code, message) => issues.push({
    code,
    message,
    severity: activeWeaponSet.has(weapon) ? "error" : "warning",
    basis: "dataBacked",
    calculationImpact: activeWeaponSet.has(weapon) ? "provisional" : "none",
  });

  for (const [masteryId, stored] of Object.entries(build?.masteries ?? {})) {
    const mastery = indexes?.masteryById?.[masteryId];
    if (!mastery || !["normal", "synergy"].includes(mastery.specializationType)) continue;
    const weapon = mastery.mainCategory;
    if (!groups.has(weapon)) groups.set(weapon, []);
    const rawLevel = Number(stored?.level ?? 1);
    const requiredLevel = mastery.specializationType === "synergy" ? 1 : masteryMaxLevel(mastery);
    const validLevel = Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= requiredLevel
      && (mastery.specializationType !== "synergy" || rawLevel === 1);
    if (!validLevel) {
      addIssue(
        weapon,
        "invalid_mastery_level",
        `${mastery.name} has invalid stored level ${String(stored?.level)}; ${label(mastery.specializationType)} mastery requires ${mastery.specializationType === "synergy" ? "level 1" : `an integer level from 1 to ${requiredLevel}`}. Calculated totals clamp the value and are provisional.`,
      );
    }
    if (mastery.isDisabled) {
      addIssue(weapon, "disabled_mastery_selected", `${mastery.name} is disabled in the decoded mastery table and cannot be selected.`);
    }
    groups.get(weapon).push({ masteryId, mastery, rawLevel, validLevel });
  }

  for (const [weapon, rows] of groups) {
    const validRows = rows.filter((row) => row.validLevel && !row.mastery.isDisabled);
    const normals = validRows.filter((row) => row.mastery.specializationType === "normal");
    const synergies = validRows.filter((row) => row.mastery.specializationType === "synergy");
    const tierTotals = {};
    const categoryTierTotals = {};
    let totalNormalPoints = 0;
    let nonEpicNormalPoints = 0;
    for (const row of normals) {
      const grade = Number(row.mastery.grade);
      tierTotals[grade] = (tierTotals[grade] ?? 0) + row.rawLevel;
      totalNormalPoints += row.rawLevel;
      if (grade !== 41) nonEpicNormalPoints += row.rawLevel;
      for (const category of masteryCategoryKeys(row.mastery)) {
        const key = `${grade}:${category}`;
        categoryTierTotals[key] = (categoryTierTotals[key] ?? 0) + row.rawLevel;
      }
    }

    if (totalNormalPoints > MASTERY_POINT_BUDGET) {
      addIssue(
        weapon,
        "mastery_budget_exceeded",
        `${label(weapon)} mastery budget exceeded: ${totalNormalPoints}/${MASTERY_POINT_BUDGET}. Selections are not truncated automatically.`,
      );
    }
    for (const row of normals) {
      const grade = Number(row.mastery.grade);
      const priorGrade = grade === 21 ? 11 : grade === 31 ? 21 : null;
      if (priorGrade && (tierTotals[priorGrade] ?? 0) < 30) {
        addIssue(
          weapon,
          "mastery_tier_prerequisite_missing",
          `${row.mastery.name} requires 30 ${label(priorGrade === 11 ? "common" : "uncommon")} normal-node points; ${label(weapon)} has ${tierTotals[priorGrade] ?? 0}.`,
        );
      }
    }

    for (const grade of [11, 21, 31]) {
      const eligible = [...new Set(
        masteryRowsForWeapon(weapon)
          .filter((mastery) => mastery.specializationType === "synergy" && Number(mastery.grade) === grade)
          .flatMap((mastery) => masteryCategoryKeys(mastery)),
      )]
        .map((category) => ({ category, points: categoryTierTotals[`${grade}:${category}`] ?? 0 }))
        .filter((row) => row.points >= 20)
        .sort((a, b) => b.points - a.points || a.category.localeCompare(b.category));
      const selectedCategories = new Set(
        synergies
          .filter((row) => Number(row.mastery.grade) === grade)
          .flatMap((row) => masteryCategoryKeys(row.mastery)),
      );
      const slotCount = Math.min(2, eligible.length);
      if (selectedCategories.size !== slotCount) {
        addIssue(
          weapon,
          "mastery_synergy_count_invalid",
          `${label(weapon)} ${label(grade === 11 ? "common" : grade === 21 ? "uncommon" : "rare")} mastery must activate ${slotCount} Achievement effect${slotCount === 1 ? "" : "s"}; ${selectedCategories.size} are stored.`,
        );
      }
      if (!slotCount) continue;
      const cutoff = eligible[slotCount - 1].points;
      const requiredAboveCutoff = eligible.filter((row) => row.points > cutoff);
      const eligibleCategorySet = new Set(eligible.filter((row) => row.points >= cutoff).map((row) => row.category));
      for (const row of requiredAboveCutoff) {
        if (!selectedCategories.has(row.category)) {
          addIssue(
            weapon,
            "mastery_synergy_priority_invalid",
            `${label(weapon)} ${label(row.category)} has ${row.points} points and must activate before a lower-point Achievement effect at this tier.`,
          );
        }
      }
      for (const category of selectedCategories) {
        if (!eligibleCategorySet.has(category)) {
          addIssue(
            weapon,
            "mastery_synergy_priority_invalid",
            `${label(weapon)} ${label(category)} is not within the highest eligible Achievement categories at this tier.`,
          );
        }
      }
    }

    if (synergies.length > 6) {
      addIssue(weapon, "mastery_synergy_weapon_cap_exceeded", `${label(weapon)} has ${synergies.length}/6 Achievement effects selected.`);
    }
    const epics = normals.filter((row) => Number(row.mastery.grade) === 41);
    if (epics.length > 2) {
      addIssue(weapon, "mastery_epic_cap_exceeded", `${label(weapon)} has ${epics.length}/2 Epic mastery nodes selected.`);
    }
    const epicPointRequirement = epics.length >= 2 ? 120 : epics.length === 1 ? 80 : 0;
    if (nonEpicNormalPoints < epicPointRequirement) {
      addIssue(
        weapon,
        "mastery_epic_points_missing",
        `${label(weapon)} has ${nonEpicNormalPoints}/${epicPointRequirement} non-Epic normal-node points required for ${epics.length} Epic node${epics.length === 1 ? "" : "s"}.`,
      );
    }
    for (const epic of epics) {
      if (!synergies.some((synergy) => masterySynergyMatches(synergy.mastery, epic.mastery))) {
        addIssue(
          weapon,
          "mastery_epic_synergy_missing",
          `${epic.mastery.name} requires a matching selected Achievement effect from any non-Epic tier.`,
        );
      }
    }
  }

  return { issues };
}

export function masterySynergyMatches(synergy, mastery) {
  return masteryCategoryKeys(synergy).includes(mastery.subCategory)
    || masteryCategoryKeys(mastery).includes(synergy.subCategory);
}

// Returns { locked, reason } for whether `mastery` could be newly selected
// right now, given everything else already selected on `weapon`. Already-
// selected nodes always report unlocked so existing picks are never yanked.
export function masteryLockInfo(mastery, weapon, build) {
  if (build.masteries?.[mastery.id]) return { locked: false, reason: "" };
  const state = masteryWeaponPointState(weapon, build);
  if (mastery.specializationType !== "normal") {
    const key = `${mastery.subCategory}-${mastery.grade}`;
    const have = state.categoryTierTotals[key] || 0;
    if (have < 20) return { locked: true, reason: `Needs 20 ${label(mastery.subCategory)} points at this tier (have ${have})` };
    const tierCount = state.synergyCountByTier[mastery.grade] || 0;
    if (tierCount >= 2) return { locked: true, reason: "Only 2 Synergy nodes allowed per tier" };
    return { locked: false, reason: "" };
  }
  if (mastery.grade === 41) {
    const epicCount = state.epicSelected.length;
    if (epicCount >= 2) return { locked: true, reason: "Epic limit reached — only 2 per weapon" };
    const needed = epicCount === 0 ? 80 : 120;
    if (state.nonEpicPoints < needed) return { locked: true, reason: `Needs ${needed} non-Epic normal-node points (have ${state.nonEpicPoints})` };
    const hasSynergy = state.selectedSynergy.some((synergy) => masterySynergyMatches(synergy, mastery));
    if (!hasSynergy) return { locked: true, reason: `Needs a selected ${label(mastery.subCategory)} Synergy node` };
    return { locked: false, reason: "" };
  }
  if (mastery.grade === 11) return { locked: false, reason: "" };
  const priorGrade = mastery.grade === 21 ? 11 : 21;
  const have = state.tierTotals[priorGrade] || 0;
  if (have < 30) return { locked: true, reason: `Needs 30 points in grade ${priorGrade} normal nodes (have ${have})` };
  return { locked: false, reason: "" };
}

// Returns { ok, reason } for setting `mastery` to `level` on `weapon`. Only
// normal nodes cost budget points; synergy levels are free once unlocked.
export function masteryCanSetLevel(mastery, level, weapon, build) {
  if (mastery.specializationType !== "normal") return { ok: true, reason: "" };
  const state = masteryWeaponPointState(weapon, build);
  const oldLevel = masterySelectedLevel(mastery, build);
  const marginal = level - oldLevel;
  if (marginal <= 0) return { ok: true, reason: "" };
  const remaining = MASTERY_POINT_BUDGET - state.totalPoints;
  if (marginal > remaining) return { ok: false, reason: `Exceeds ${MASTERY_POINT_BUDGET}-point weapon budget (${remaining} left)` };
  return { ok: true, reason: "" };
}

// Removes selected nodes that became invalid after a prerequisite node was
// removed or reduced. Repeats until the remaining selection is internally
// consistent because removing one tier can invalidate the next tier.
export function reconcileMasterySelections(weapon, build) {
  const removed = [];
  let changed = true;
  while (changed) {
    changed = false;
    const state = masteryWeaponPointState(weapon, build);
    const selected = masteryRowsForWeapon(weapon)
      .filter((mastery) => build.masteries?.[mastery.id])
      .sort((a, b) => masteryNodeOrder(b) - masteryNodeOrder(a));
    const epics = selected.filter((mastery) => mastery.specializationType === "normal" && mastery.grade === 41);
    let invalid = null;
    if (epics.length > 2) invalid = epics[0];
    if (!invalid && epics.length > 1 && state.nonEpicPoints < 120) invalid = epics[0];
    if (!invalid && epics.length === 1 && state.nonEpicPoints < 80) invalid = epics[0];
    if (!invalid) {
      invalid = epics.find((mastery) => !state.selectedSynergy.some((synergy) => masterySynergyMatches(synergy, mastery))) ?? null;
    }
    if (!invalid) {
      invalid = selected.find((mastery) => {
        if (mastery.specializationType === "synergy") {
          return (state.categoryTierTotals[`${mastery.subCategory}-${mastery.grade}`] || 0) < 20;
        }
        if (mastery.specializationType !== "normal" || mastery.grade === 11 || mastery.grade === 41) return false;
        const priorGrade = mastery.grade === 21 ? 11 : 21;
        return (state.tierTotals[priorGrade] || 0) < 30;
      }) ?? null;
    }
    if (invalid) {
      delete build.masteries[invalid.id];
      removed.push(invalid.name);
      changed = true;
    }
  }
  // Synergy nodes are passive unlocks. Fill newly eligible slots in stable
  // data order so imports and repeated edits always produce the same build.
  const rows = masteryRowsForWeapon(weapon);
  for (const grade of [...new Set(rows.map((mastery) => mastery.grade))].sort((a, b) => a - b)) {
    let state = masteryWeaponPointState(weapon, build);
    let available = 2 - (state.synergyCountByTier[grade] || 0);
    if (available <= 0) continue;
    const candidates = rows
      .filter((mastery) => mastery.specializationType === "synergy" && mastery.grade === grade && !build.masteries?.[mastery.id])
      .filter((mastery) => (state.categoryTierTotals[`${mastery.subCategory}-${grade}`] || 0) >= 20)
      .sort((a, b) => masteryNodeOrder(a) - masteryNodeOrder(b) || a.id.localeCompare(b.id));
    for (const mastery of candidates) {
      if (available <= 0) break;
      build.masteries[mastery.id] = { level: masteryMaxLevel(mastery) };
      available -= 1;
      state = masteryWeaponPointState(weapon, build);
    }
  }
  return removed;
}

// Mutates a build using the same transition for UI clicks, context-menu
// decrements, and clear actions. Positive values add levels, negative values
// remove levels, and { clear: true } removes the node entirely.
export function adjustMasterySelection(build, masteryId, adjustment = 1, options = {}) {
  const mastery = data.masteries.find((entry) => entry.id === masteryId);
  if (!mastery) return { ok: false, reason: "Unknown mastery node", level: 0, removed: [] };
  build.masteries = normalizeMasterySelections(build.masteries);
  const current = masterySelectedLevel(mastery, build);
  const requested = options.clear ? 0 : current + Number(adjustment || 0);
  const target = clamp(requested, 0, masteryMaxLevel(mastery));
  if (target > current) {
    const lock = masteryLockInfo(mastery, mastery.mainCategory, build);
    if (lock.locked) return { ok: false, reason: lock.reason, level: current, removed: [] };
    const budget = masteryCanSetLevel(mastery, target, mastery.mainCategory, build);
    if (!budget.ok) return { ok: false, reason: budget.reason, level: current, removed: [] };
  }
  if (target > 0) build.masteries[masteryId] = { level: target };
  else delete build.masteries[masteryId];
  const removed = reconcileMasterySelections(mastery.mainCategory, build);
  return { ok: true, reason: "", level: masterySelectedLevel(mastery, build), removed };
}

// ---------- unified mastery ----------
// WM_Common_SKILL_* nodes are shared across weapons. Shipped build-24118850
// localization explicitly permits up to four Overall Mastery Skills and says
// they apply regardless of weapon (en.csv TEXT_TOOLTIP and game-guide rows).

export const UNIFIED_MASTERY_CAP = 4;

export function unifiedMasteryNodes() {
  return (data?.masteries ?? []).filter((mastery) => mastery.specializationType === "unified");
}

export function selectedUnifiedMasteries(build) {
  const ids = Array.isArray(build.unifiedMasteries) ? build.unifiedMasteries : Object.values(build.unifiedMasteries ?? {});
  return ids.filter(Boolean);
}

export function toggleUnifiedMastery(build, masteryId) {
  const ids = selectedUnifiedMasteries(build);
  build.unifiedMasteries = ids.includes(masteryId) ? ids.filter((id) => id !== masteryId) : [...ids, masteryId];
}

// Whether a unified node has a stat rule (only "Potential" does; the rest are
// conditional combat passives that Questlog's calculation also excludes).
export function unifiedMasteryCounted(masteryId) {
  return Boolean(UNIFIED_MASTERY_RULES[masteryId]);
}

export function masteryCostSummary(build) {
  const totals = new Map();
  for (const id of Object.keys(build.masteries ?? {})) {
    const mastery = data.masteries.find((entry) => entry.id === id);
    for (const row of values(mastery?.openCost)) {
      const material = values(row?.material)[0];
      const key = material?.name ?? "Cost";
      totals.set(key, (totals.get(key) ?? 0) + Number(row?.costAmount || 0));
    }
  }
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  return {
    primary: rows.length ? rows.slice(0, 3).map(([name, amount]) => `${formatCompactNumber(amount)} ${name}`).join(" | ") : "No selected cost",
    rows,
  };
}

// ---------- artifact set helpers ----------

export function activeArtifactSetSummary(build) {
  const equippedIds = new Set(Object.values(build.artifacts ?? {}).map((selection) => selection.itemId).filter(Boolean));
  const active = data.artifactSets
    .map((set) => ({ set, count: set.memberItemIds.filter((id) => equippedIds.has(id)).length }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)[0];
  return active ? `${active.set.name} (${active.count}/${active.set.memberItemIds.length})` : "No set equipped";
}

export function applyArtifactSet(build, setId) {
  const set = data.artifactSets.find((entry) => entry.id === setId);
  if (!set) return;
  for (const itemId of set.memberItemIds ?? []) {
    const item = indexes.itemById[itemId];
    const slot = ARTIFACT_SLOTS.find((entry) => entry.types.includes(item?.equipmentType));
    if (!item || !slot) continue;
    build.artifacts[slot.id] = {
      ...emptyEquipmentSelection(),
      itemId: item.id,
      level: getItemLevels(item).at(-1) ?? 0,
    };
  }
}

// ---------- calculation engine ----------

// Scenario overlays are deliberately separate from persistent sheet totals.
// The selected/equipped source projection below reuses the same progression
// and Skill Core authority as calculateBuild, so a scenario cannot reactivate
// a stored foreign-weapon passive or an unselected catalogue core.
export function activeScenarioSources(build, progression = effectiveProgression(build), selections = allBuildSelectionEntries(build), includeSetEffects = true) {
  const passiveSkills = progression.skills
    .filter(({ loadoutType }) => loadoutType === "passive")
    .map(({ skill, selection }) => ({ id: skill.id, level: Number(selection.level || 1), selected: true }));
  const masteryIds = progression.masteries.map(({ masteryId }) => masteryId);
  const masteries = progression.masteries.map(({ masteryId, selection }) => ({
    id: masteryId,
    level: Number(selection.level || 1),
    selected: true,
  }));
  const unifiedMasteryIds = progression.unifiedMasteries.map(({ masteryId }) => masteryId);
  const unifiedMasteries = progression.unifiedMasteries.map(({ masteryId }) => ({
    id: masteryId,
    level: 1,
    selected: true,
  }));
  const itemEffects = [];
  for (const { item, selection } of selections) {
    if (item?.passives?.id) itemEffects.push({ id: item.passives.id, sourceKind: "innate", itemId: item.id });
    const selectedPerk = selectedItemPerk(item, selection);
    if (selectedPerk?.passive?.id) itemEffects.push({ id: selectedPerk.passive.id, sourceKind: "selected_core", selected: true, itemId: item.id, perkId: selectedPerk.id });
  }
  const setBreakpoints = includeSetEffects
    ? activeSetCounts(selections).flatMap(({ set, count }) => values(set.itemSetBonus ?? set.item_set_bonus)
      .map((bonus) => Number(bonus.set_count ?? bonus.setCount ?? 0))
      .filter((required) => required > 0 && count >= required)
      .map((required) => `${set.id}:${required}`))
    : [];
  return {
    equippedWeaponTypes: [...(progression.equippedWeaponTypes ?? equippedWeaponTypes(build))],
    passiveSkills,
    masteryIds,
    masteries,
    unifiedMasteryIds,
    unifiedMasteries,
    itemEffects,
    setBreakpoints,
  };
}

export function activeDistanceScenarioSources(build, progression = effectiveProgression(build), selections = allBuildSelectionEntries(build)) {
  return activeScenarioSources(build, progression, selections);
}

function participantResources({ healthRatioBps, manaRatioBps } = {}) {
  return {
    ...(healthRatioBps === undefined ? {} : { health: { currentRatioBps: healthRatioBps } }),
    ...(manaRatioBps === undefined ? {} : { mana: { currentRatioBps: manaRatioBps } }),
  };
}

export function createBuildScenario(build, {
  targetDistanceMeters,
  timeOfDay = "unspecified",
  sourceHealthRatioBps,
  sourceManaRatioBps,
  targetHealthRatioBps,
  targetManaRatioBps,
  sourceMotion = { state: "unspecified" },
  targetMotion = { state: "unspecified" },
  sourceEventHistory = { state: "unspecified" },
  targetEventHistory = { state: "unspecified" },
  sourceParty = { state: "unspecified" },
  targetParty = { state: "unspecified" },
  sourceProximity = { state: "unspecified" },
  targetProximity = { state: "unspecified" },
} = {}) {
  if (!data?.gameBuild) throw new Error("Game data must be initialized before creating a combat scenario.");
  const equipped = [...equippedWeaponTypes(build)].sort();
  return normalizeCombatScenario({
    schema: COMBAT_SCENARIO_SCHEMA,
    schemaVersion: COMBAT_SCENARIO_SCHEMA_VERSION,
    gameBuild: String(data.gameBuild),
    id: "build-scenario",
    durationMs: 0,
    environment: { timeOfDay, weather: "unspecified" },
    participants: [
      {
        id: "source",
        relationship: "self",
        buildSnapshotId: "calculation-build",
        equippedWeaponTypes: equipped,
        resources: participantResources({ healthRatioBps: sourceHealthRatioBps, manaRatioBps: sourceManaRatioBps }),
        motion: sourceMotion,
        eventHistory: sourceEventHistory,
        party: sourceParty,
        proximity: sourceProximity,
      },
      {
        id: "target",
        relationship: "enemy",
        buildSnapshotId: "scenario-target",
        equippedWeaponTypes: [],
        resources: participantResources({ healthRatioBps: targetHealthRatioBps, manaRatioBps: targetManaRatioBps }),
        motion: targetMotion,
        eventHistory: targetEventHistory,
        party: targetParty,
        proximity: targetProximity,
      },
    ],
    source: { participantId: "source" },
    target: { participantId: "target", distanceMeters: targetDistanceMeters },
    actions: [],
    rng: { algorithm: "xorshift64star-v1", seed: "0" },
  }, { expectedGameBuild: String(data.gameBuild) });
}

export function createTargetDistanceScenario(build, targetDistanceMeters, timeOfDay = "unspecified") {
  return createBuildScenario(build, { targetDistanceMeters, timeOfDay });
}

export function canonicalCombatScenario(scenario) {
  const gameBuild = String(data?.gameBuild ?? "");
  return normalizeCombatScenario(scenario, { expectedGameBuild: gameBuild });
}

export function combatScenarioCacheKey(scenario) {
  return JSON.stringify(canonicalCombatScenario(scenario));
}

export function bindCombatScenarioToBuild(scenario, build, weaponTypes = null) {
  const gameBuild = String(data?.gameBuild ?? "");
  const normalized = canonicalCombatScenario(scenario);
  const sourceId = normalized.source.participantId;
  const equipped = [...new Set(weaponTypes ?? equippedWeaponTypes(build))].sort();
  return normalizeCombatScenario({
    ...normalized,
    participants: normalized.participants.map((participant) => participant.id === sourceId
      ? { ...participant, equippedWeaponTypes: equipped, ...(equipped.includes(participant.activeWeaponType) ? {} : { activeWeaponType: undefined }) }
      : participant),
  }, { expectedGameBuild: gameBuild });
}

function scenarioCacheIdentity(scenario) {
  if (scenario == null) return "static";
  try {
    return combatScenarioCacheKey(scenario);
  } catch {
    // Invalid scenarios still need stable isolation until calculateBuild returns
    // their normal fail-closed result.
    return `invalid:${JSON.stringify(scenario)}`;
  }
}

function calculationOptionsBoundToBuild(options, build) {
  if (options.scenario == null) return options;
  try {
    return { ...options, scenario: bindCombatScenarioToBuild(options.scenario, build) };
  } catch {
    // Preserve invalid input for calculateBuild's normal fail-closed scenario
    // result instead of turning a comparison helper into a throwing API.
    return options;
  }
}

function scenarioTargetDistance(scenario) {
  const value = Number(scenario?.target?.distanceMeters);
  return Number.isFinite(value) ? value : scenario?.target?.distanceMeters;
}

export function evaluateBuildScenario(build, scenario, progression = effectiveProgression(build), selections = allBuildSelectionEntries(build), options = {}) {
  const gameBuild = String(data?.gameBuild ?? "");
  let normalizedScenario;
  try {
    normalizedScenario = normalizeCombatScenario(scenario, { expectedGameBuild: gameBuild });
  } catch (cause) {
    return Object.freeze({
      overlayRows: Object.freeze([]),
      trace: Object.freeze([]),
      errors: Object.freeze([Object.freeze({
        code: "invalid_combat_scenario",
        sourceId: null,
        message: String(cause?.message ?? cause),
      })]),
      scenario: null,
    });
  }
  if (gameBuild !== SCENARIO_EFFECT_GAME_BUILD) {
    return Object.freeze({
      overlayRows: Object.freeze([]),
      trace: Object.freeze([]),
      errors: Object.freeze([Object.freeze({
        code: "scenario_effect_build_mismatch",
        sourceId: null,
        message: `Decoded scenario rules are authoritative for game build ${SCENARIO_EFFECT_GAME_BUILD}, not loaded game build ${gameBuild}.`,
      })]),
      scenario: normalizedScenario,
    });
  }
  const activeSources = activeScenarioSources(build, progression, selections, options.includeSetEffects !== false);
  const sourceParticipant = normalizedScenario.participants.find((participant) => participant.id === normalizedScenario.source.participantId);
  const targetParticipant = normalizedScenario.participants.find((participant) => participant.id === normalizedScenario.target.participantId);
  if (sourceParticipant?.relationship !== "self") {
    return Object.freeze({
      overlayRows: Object.freeze([]),
      trace: Object.freeze([]),
      errors: Object.freeze([Object.freeze({
        code: "scenario_source_relationship_mismatch",
        sourceId: normalizedScenario.source.participantId,
        message: "Scenario source participant must have the self relationship for build calculation.",
      })]),
      scenario: normalizedScenario,
    });
  }
  const scenarioWeapons = [...(sourceParticipant?.equippedWeaponTypes ?? [])].sort();
  const actualWeapons = [...activeSources.equippedWeaponTypes].sort();
  if (JSON.stringify(scenarioWeapons) !== JSON.stringify(actualWeapons)) {
    return Object.freeze({
      overlayRows: Object.freeze([]),
      trace: Object.freeze([]),
      errors: Object.freeze([Object.freeze({
        code: "scenario_source_weapon_mismatch",
        sourceId: normalizedScenario.source.participantId,
        message: "Scenario source equippedWeaponTypes do not match the calculated build.",
      })]),
      scenario: normalizedScenario,
    });
  }
  const evaluated = evaluateScenarioEffects({
    activeSources,
    scenario: {
      targetDistanceMeters: scenarioTargetDistance(normalizedScenario),
      timeOfDay: normalizedScenario.environment.timeOfDay,
      sourceResources: sourceParticipant.resources,
      targetResources: targetParticipant?.resources ?? {},
      sourceMotion: sourceParticipant.motion,
      targetMotion: targetParticipant?.motion ?? { state: "unspecified" },
      sourceEventHistory: sourceParticipant.eventHistory,
      targetEventHistory: targetParticipant?.eventHistory ?? { state: "unspecified" },
      sourceParty: sourceParticipant.party,
      targetParty: targetParticipant?.party ?? { state: "unspecified" },
      sourceProximity: sourceParticipant.proximity,
      targetProximity: targetParticipant?.proximity ?? { state: "unspecified" },
    },
  });
  return Object.freeze({ ...evaluated, scenario: normalizedScenario });
}

export function evaluateBuildDistanceScenario(build, scenario, progression = effectiveProgression(build), selections = allBuildSelectionEntries(build)) {
  return evaluateBuildScenario(build, scenario, progression, selections);
}

function cloneCalculationSourceMap(sourceMap) {
  return new Map([...sourceMap].map(([statId, sources]) => [
    statId,
    values(sources).map((source) => ({ ...source })),
  ]));
}

// Final derived values and hard caps must run after scenario rows are added.
// Keeping one finalizer for static and scenario states prevents an overlay on a
// modifier such as Attack Speed from leaving its dependent weapon stat stale.
function finalizeCalculationState(baseTotals, baseSourceMap, scenarioRows = []) {
  const totals = new Map(baseTotals);
  const sourceMap = cloneCalculationSourceMap(baseSourceMap);
  const add = (statId, value, sourceLabel, sourceType = "source", grade = 0, icon = "", metadata = {}) => {
    const numeric = Number(value);
    if (!statId || !numeric || Number.isNaN(numeric)) return;
    for (const expandedId of STAT_EXPANSIONS[statId] ?? []) {
      add(expandedId, numeric, sourceLabel, sourceType, grade, icon, { ...metadata, expandedFrom: statId });
    }
    totals.set(statId, (totals.get(statId) ?? 0) + numeric);
    if (!sourceMap.has(statId)) sourceMap.set(statId, []);
    sourceMap.get(statId).push({ sourceLabel, name: sourceLabel, value: numeric, type: sourceType, grade, icon, ...metadata });
  };

  for (const effect of scenarioRows) {
    add(effect.statId, effect.rawValue, effect.effectName, "scenario_effect", 0, "", {
      scenarioEffectId: effect.effectId,
      scenarioDistanceMeters: effect.scenario?.targetDistanceMeters,
      scenarioTimeOfDay: effect.scenario?.timeOfDay,
      scenarioResource: effect.scenario?.resource,
      scenarioResourceRatioBps: effect.scenario?.currentRatioBps,
      scenarioResourceThresholdRatioBps: effect.scenario?.thresholdRatioBps,
      scenarioResourceOperator: effect.scenario?.operator,
      scenarioResourceBranch: effect.scenario?.branch,
      scenarioSourceMotion: effect.scenario?.sourceMotion,
      scenarioMotionBranch: effect.scenario?.branch,
      scenarioSourceEventId: effect.scenario?.eventId,
      scenarioSourceEventOccurredAgoMs: effect.scenario?.occurredAgoMs,
      scenarioSourceEventOutcome: effect.scenario?.outcome,
      scenarioSourceEventWeaponType: effect.scenario?.weaponType,
      scenarioSourceEventMatchedCategories: effect.scenario?.matchedCategories,
      scenarioPartyTotalMembersIncludingSelf: effect.scenario?.totalMembersIncludingSelf,
      scenarioProximityCohort: effect.scenario?.cohort,
      scenarioProximityComparator: effect.scenario?.comparator,
      scenarioProximityRadiusMeters: effect.scenario?.radiusMeters,
      scenarioProximityCount: effect.scenario?.count,
      scenarioSamePartyPlayerOtherCount: effect.scenario?.samePartyPlayerOtherCount,
      scenarioAlliedNonpartyPlayerCount: effect.scenario?.alliedNonpartyPlayerCount,
      sourceKinds: effect.sourceKinds,
      precision: effect.precision,
      provenance: effect.provenance,
      calculation: effect.calculation,
    });
  }

  const range = totals.get("attack_range_main_hand") ?? 0;
  const rangeModifier = effectiveStatValue("attack_range_modifier", totals.get("attack_range_modifier") ?? 0);
  if (range && rangeModifier) add("attack_range_main_hand", range * (rangeModifier / 10000), "Range Increase", "range");
  const speed = totals.get("attack_speed_main_hand") ?? 0;
  const speedModifier = effectiveStatValue("attack_speed_modifier", totals.get("attack_speed_modifier") ?? 0);
  if (speed && speedModifier) {
    const ratio = speedModifier / 10000;
    const adjusted = speed * (1 - ratio / (1 + ratio));
    add("attack_speed_main_hand", -(speed - adjusted), "Added Attack Speed", "attack_speed");
  }
  const attackPowerModifier = totals.get("attack_power_modifier") ?? 0;
  if (attackPowerModifier) {
    const ratio = attackPowerModifier / 10000;
    const maxDamage = totals.get("attack_power_main_hand") ?? 0;
    const minDamage = totals.get("bonus_attack_power_main_hand") ?? 0;
    add("attack_power_main_hand", Math.floor(maxDamage * ratio) - Math.floor(minDamage * ratio), "Base Damage Modifier", "attack_power");
    add("bonus_attack_power_main_hand", Math.floor(minDamage * ratio), "Base Damage Modifier", "attack_power");
  }

  addDerivedTotal("attack_power_main_hand_min", totals.get("bonus_attack_power_main_hand") ?? 0, totals, sourceMap);
  addDerivedTotal("attack_power_main_hand_max", totals.get("attack_power_main_hand") ?? 0, totals, sourceMap);
  addDerivedTotal("attack_power_off_hand_min", totals.get("bonus_attack_power_off_hand") ?? 0, totals, sourceMap);
  addDerivedTotal("attack_power_off_hand_max", totals.get("attack_power_off_hand") ?? 0, totals, sourceMap);
  const capOverflow = new Map();
  for (const [statId, maximum] of Object.entries(STAT_HARD_CAPS)) {
    const rawTotal = totals.get(statId) ?? 0;
    if (rawTotal <= maximum) continue;
    capOverflow.set(statId, rawTotal - maximum);
    add(statId, maximum - rawTotal, `Hard cap: ${formatStat(statId, maximum)}`, "hard_cap");
  }
  const stats = [...totals.entries()].map(([id, total]) => ({
    id,
    total,
    uncappedTotal: total + (capOverflow.get(id) ?? 0),
    overflow: capOverflow.get(id) ?? 0,
    hardCap: statHardCap(id),
    sources: sourceMap.get(id) ?? [],
  }));
  return { totals, sourceMap, capOverflow, stats };
}

export function calculateBuild(build, attributes, options = {}) {
  const includeSetEffects = options.includeSetEffects !== false;
  const progression = effectiveProgression(build, { weaponTypes: options.progressionWeaponTypes });
  const totals = new Map();
  const sourceMap = new Map();
  const add = (statId, value, sourceLabel, sourceType = "source", grade = 0, icon = "", metadata = {}) => {
    const numeric = Number(value);
    if (!statId || !numeric || Number.isNaN(numeric)) return;
    for (const expandedId of STAT_EXPANSIONS[statId] ?? []) {
      add(expandedId, numeric, sourceLabel, sourceType, grade, icon, { ...metadata, expandedFrom: statId });
    }
    totals.set(statId, (totals.get(statId) ?? 0) + numeric);
    if (!sourceMap.has(statId)) sourceMap.set(statId, []);
    sourceMap.get(statId).push({ sourceLabel, name: sourceLabel, value: numeric, type: sourceType, grade, icon, ...metadata });
  };
  const totalsObject = () => Object.fromEntries([...totals].map(([statId, total]) => [statId, { statId, total: effectiveStatValue(statId, total), sources: sourceMap.get(statId) ?? [] }]));
  const selections = allBuildSelectionEntries(build);
  const setEffectTrace = createSetEffectTrace(selections, includeSetEffects);
  const mainWeapon = indexes.itemById[build.equipment?.main_hand?.itemId];
  const offWeapon = indexes.itemById[build.equipment?.off_hand?.itemId];
  const mainWeaponType = mainWeapon?.equipmentType ?? "none";
  const offWeaponType = offWeapon?.equipmentType ?? "none";

  add("bonus_attack_power_main_hand", 1, "Initial", "init");
  add("bonus_attack_power_off_hand", 1, "Initial", "init");
  for (const [statId, value] of Object.entries(BASE_ATTRIBUTES)) add(statId, value, "Base", "base");
  for (const [statId, value] of Object.entries(STELLAR_JOURNEY_ATTRIBUTES)) add(statId, value, "Stellar Journey", "base");
  const baseLevel = Object.keys(BASE_LEVEL_STATS).reduce((best, candidate) => (
    Math.abs(Number(candidate) - CHARACTER_LEVEL) < Math.abs(Number(best) - CHARACTER_LEVEL) ? candidate : best
  ));
  for (const [statId, value] of Object.entries(BASE_LEVEL_STATS[baseLevel] ?? {})) add(statId, value, "Base", "base");
  for (const [statId] of ATTRIBUTES) {
    add(statId, allocatedAttributeValue(attributes?.[statId]), "Allocated points", "attribute");
  }

  let materialHpPercentage = 0;
  for (const { slotId, selection, item } of selections) {
    if (!item) continue;
    if (item.armorCategory && item.subCategory !== "cloak") {
      for (const weaponType of [mainWeaponType, offWeaponType]) {
        const material = ARMOR_MATERIAL_BONUSES[weaponType]?.[item.armorCategory];
        for (const [statId, value] of Object.entries(material?.stats ?? {})) {
          if (statId === "hp_max_percentage") materialHpPercentage += Number(value);
          else add(statId, value, `Material: ${item.armorCategory}`, slotId, 1, item.imageUrl);
        }
      }
    }
    if (selection.artifactStatId) {
      const artifactRows = item.itemStats?.artifact?.[0] ?? item.itemStats?.artifact?.["0"];
      if (artifactRows?.[selection.artifactStatId]) {
        add(selection.artifactStatId, artifactRows[selection.artifactStatId], item.name, slotId, item.grade, item.imageUrl);
      }
    }
    const level = selectedItemLevel(item, selection.level);
    const mainStats = item.itemStats?.main?.[String(level)];
    // Questlog parity: off-hand damage comes from the main-hand item's
    // `offhand` sub-block, so an off-hand item's own main block is skipped.
    // Unverified edge: what Questlog shows with ONLY an off-hand equipped —
    // no reference data available; revisit if a fixture covers it.
    if (mainStats && slotId !== "off_hand") {
      for (const [statId, value] of Object.entries(flattenQuestlogMainStats(mainStats))) {
        add(statId, value, item.name, slotId, item.grade, item.imageUrl);
      }
    }
    for (const [statId, value] of Object.entries(item.itemStats?.extra?.[String(level)] ?? {})) {
      add(statId, value, item.name, slotId, item.grade, item.imageUrl);
    }
    for (const row of normalizeSelectionRows(selection.traits)) {
      add(row.statId, selectedPoolValue(item.itemStats?.traits, row), `${item.name} Trait`, `${slotId}_trait`, item.grade, item.imageUrl);
    }
    if (selection.uniqueTrait?.statId) {
      add(selection.uniqueTrait.statId, selectedPoolValue(item.itemStats?.uniqueTraits, selection.uniqueTrait), `${item.name} Trait`, `${slotId}_trait`, item.grade, item.imageUrl);
    }
    for (const row of normalizeSelectionRows(selection.resonance).slice(0, 1)) {
      add(row.statId, selectedPoolValue(item.itemStats?.resonance, row, true), `${item.name} Resonance`, `${slotId}_resonance`, item.grade, item.imageUrl);
    }
    if (selection.potentialId && item.itemPotential) {
      const potential = values(item.itemPotential.stats).find((row) => row.stat_id === selection.potentialId || row.statId === selection.potentialId);
      if (potential) add(selection.potentialId, potential.value, `${item.name} Potential`, `${slotId}_potential`, item.grade, item.imageUrl);
    }
    for (const row of normalizeRuneRows(selection.runes)) {
      const rune = indexes.runeById[row.runeId];
      const option = runeStatOptions(rune).find((entry) => entry.statId === row.statId);
      if (!rune || !option) continue;
      const runeLevel = clamp(Number(row.level || 1), 1, option.maxLevel);
      add(row.statId, option.levels[runeLevel], `${rune.name} Lv. ${runeLevel}`, `${slotId}_rune`, rune.grade, rune.imageUrl);
    }
    const selectedRunes = normalizeRuneRows(selection.runes).map((row) => indexes.runeById[row.runeId]).filter(Boolean);
    if (selectedRunes.length === 3) {
      const synergy = findRuneSynergy(runeCategoryForSlot(slotId), selectedRunes.map((rune) => rune.runeType));
      for (const [statId, value] of Object.entries(synergy?.stats ?? {})) {
        add(statId, value, `${item.name}: Rune Synergy`, `${slotId}_rune_synergy`, synergy.grade, "");
      }
    }
    for (const effect of selectedHeroicEffects(item, selection)) {
      add(effect.statId, effect.value, `${item.name}: Heroic Effect ${effect.groupNumber}`, `${slotId}_heroic_effect`, item.grade, item.imageUrl);
    }
  }

  for (const { mastery, selection: selected } of progression.masteries) {
    const stats = mastery?.stats?.[Math.max(0, Number(selected.level || 1) - 1)];
    for (const row of values(stats)) add(row.statId, row.value, `Weapon Mastery: ${mastery.name}`, "weapon_specialization", mastery.grade, mastery.imageUrl);
  }

  const applyPhase = (phase) => applyQuestlogPhase(phase, progression, selections, totalsObject, add, includeSetEffects, setEffectTrace);
  applyPhase(1);

  for (const [attributeId] of ATTRIBUTES) {
    const table = data.attributeStats?.[attributeId] ?? {};
    const maximum = Math.max(0, ...Object.keys(table).map(Number));
    const level = Math.min(Math.floor(totals.get(attributeId) ?? 0), maximum);
    for (const [statId, value] of Object.entries(table[String(level)] ?? {})) {
      const numeric = ["attack_power_main_hand", "bonus_attack_power_main_hand"].includes(statId)
        ? Number(value?.[mainWeaponType] ?? value?.none ?? 0)
        : Number(value);
      add(statId, numeric, `${attributeId.toUpperCase()} Points`, "attribute_bonus");
    }
  }
  for (const [attributeId, breakpoints] of Object.entries(ATTRIBUTE_BREAKPOINTS)) {
    const attributeTotal = effectiveStatValue(attributeId, totals.get(attributeId) ?? 0);
    for (const [threshold, bonuses] of Object.entries(breakpoints)) {
      if (attributeTotal < Number(threshold)) continue;
      for (const [statId, value] of Object.entries(bonuses)) {
        add(statId, value, `${attributeId.toUpperCase()} (${threshold}): Bonus`, "attribute_bracket");
      }
    }
  }

  applyPhase(2);
  if (includeSetEffects) {
    const active = activeSetCounts(selections);
    const suppressed = suppressedSetStats(active);
    for (const { set, count } of active) {
      for (const bonus of values(set.itemSetBonus)) {
        const required = Number(bonus.set_count ?? bonus.setCount ?? 0);
        if (!required || count < required) continue;
        const classification = classifySetBreakpoint(set.id, bonus);
        if (classification.kind !== "structured") continue;
        for (const row of values(bonus.bonus_stat ?? bonus.bonusStat)) {
          const key = setBreakpointKey(set.id, required);
          const isSuppressed = setStatIsSuppressed(suppressed, set.id, required, row.type);
          recordSetEffectEvaluation(setEffectTrace, key, row.type, row.value, isSuppressed);
          if (!isSuppressed) {
            add(row.type, row.value, `${set.name} Set`, "set_bonus", 0, "", { setId: set.id, setPieces: required, setEffectKey: key });
          }
        }
      }
    }
  }
  applyPhase(3);
  if (materialHpPercentage > 0) add("hp_max", (totals.get("hp_max") ?? 0) * materialHpPercentage / 100, "Material: Bonus", "material");
  applyPhase(4);
  applyPhase(5);
  applyPhase(6);
  const persistentState = finalizeCalculationState(totals, sourceMap);
  const runeSynergies = calculateRuneSynergies(build);
  const validation = validateBuild(runeSynergies, build, progression, attributes);
  const stats = persistentState.stats;
  const result = {
    stats,
    setEffects: finalizeSetEffectTrace(setEffectTrace, persistentState.sourceMap, includeSetEffects),
    runeSynergies,
    validation,
    status: calculationStatus(validation),
  };
  if (options.scenario != null) {
    const evaluated = evaluateBuildScenario(build, options.scenario, progression, selections, { includeSetEffects });
    const distanceMeters = scenarioTargetDistance(evaluated.scenario ?? options.scenario);
    const timeOfDay = evaluated.scenario?.environment?.timeOfDay ?? options.scenario?.environment?.timeOfDay;
    const sourceParticipant = evaluated.scenario?.participants?.find((participant) => participant.id === evaluated.scenario?.source?.participantId);
    const targetParticipant = evaluated.scenario?.participants?.find((participant) => participant.id === evaluated.scenario?.target?.participantId);
    const sourceResources = sourceParticipant?.resources ?? {};
    const targetResources = targetParticipant?.resources ?? {};
    const sourceMotion = sourceParticipant?.motion ?? { state: "unspecified" };
    const targetMotion = targetParticipant?.motion ?? { state: "unspecified" };
    const sourceEventHistory = sourceParticipant?.eventHistory ?? { state: "unspecified" };
    const targetEventHistory = targetParticipant?.eventHistory ?? { state: "unspecified" };
    const sourceParty = sourceParticipant?.party ?? { state: "unspecified" };
    const targetParty = targetParticipant?.party ?? { state: "unspecified" };
    const sourceProximity = sourceParticipant?.proximity ?? { state: "unspecified" };
    const targetProximity = targetParticipant?.proximity ?? { state: "unspecified" };
    const executable = evaluated.errors.length === 0;
    result.scenarioEffects = {
      schema: "tl-helper.build-scenario-effects",
      schemaVersion: 6,
      gameBuild: String(data?.gameBuild ?? ""),
      kind: "combat_scenario",
      ruleset: evaluated.ruleset ?? { id: SCENARIO_EFFECT_RULESET_ID, version: SCENARIO_EFFECT_RULESET_VERSION },
      targetDistanceMeters: distanceMeters,
      timeOfDay,
      sourceResources,
      targetResources,
      sourceMotion,
      targetMotion,
      sourceEventHistory,
      targetEventHistory,
      sourceParty,
      targetParty,
      sourceProximity,
      targetProximity,
      dimensions: { targetDistanceMeters: distanceMeters, timeOfDay, sourceResources, targetResources, sourceMotion, targetMotion, sourceEventHistory, targetEventHistory, sourceParty, targetParty, sourceProximity, targetProximity },
      status: executable ? "applied" : "unsupported",
      scenario: evaluated.scenario,
      evaluatedRows: evaluated.overlayRows,
      appliedRows: executable ? evaluated.overlayRows : [],
      trace: evaluated.trace,
      errors: evaluated.errors,
    };
    // Any unsupported replacement fails the complete overlay closed. This
    // prevents an optimizer from comparing a partially evaluated scenario.
    result.scenarioStats = executable
      ? finalizeCalculationState(totals, sourceMap, evaluated.overlayRows).stats
      : stats;
  }
  return result;
}

function allBuildSelectionEntries(build) {
  return [
    ...Object.entries(build.equipment ?? {}),
    ...Object.entries(build.artifacts ?? {}),
    ...Object.entries(build.supportSlots ?? {}),
  ].map(([slotId, selection]) => ({ slotId, selection, item: indexes.itemById[selection?.itemId] }));
}

function flattenQuestlogMainStats(mainStats) {
  let flattened = { ...(mainStats?.extra ?? {}), ...(mainStats?.armor ?? {}) };
  if (mainStats?.shield?.statId) flattened[mainStats.shield.statId] = mainStats.shield.value;
  if (mainStats?.mainhand) {
    flattened.bonus_attack_power_main_hand = Number(mainStats.mainhand.min ?? 0) - 1;
    flattened.attack_power_main_hand = Number(mainStats.mainhand.max ?? 0) - Number(mainStats.mainhand.min ?? 0);
  }
  if (mainStats?.offhand) {
    flattened.bonus_attack_power_off_hand = Number(mainStats.offhand.min ?? 0) - 1;
    flattened.attack_power_off_hand = Number(mainStats.offhand.max ?? 0) - Number(mainStats.offhand.min ?? 0);
  }
  return flattened;
}

function selectedPoolValue(pool, selection, nestedTiers = false) {
  const tiers = nestedTiers ? pool?.[selection.statId]?.tiers : pool?.[selection.statId];
  const rows = Array.isArray(tiers) ? tiers : Object.values(tiers ?? {});
  const index = clamp(Number(selection.tier ?? selection.level ?? rows.length) - 1, 0, Math.max(0, rows.length - 1));
  return Number(selection.value ?? rows[index] ?? 0);
}

function activeSetCounts(selections) {
  const members = new Map();
  for (const { item } of selections) {
    if (!item?.setId || !item.id) continue;
    if (!members.has(item.setId)) members.set(item.setId, new Set());
    members.get(item.setId).add(item.id);
  }
  return [...members].map(([setId, itemIds]) => ({ set: indexes.itemSetById[setId], count: itemIds.size })).filter((row) => row.set);
}

// Returns breakpoint-specific stat suppression for active members that lose
// under decoded PriorityInGroup. An in-game priority-1 versus priority-3 test
// confirmed that lower values win. Some breakpoints contain
// unrelated stats which must remain active, so suppression cannot be modeled
// as an all-or-nothing breakpoint flag.
export function suppressedSetStats(activeSets) {
  const suppressed = new Map();
  for (const [groupId, group] of Object.entries(SET_EXCLUSIVITY_GROUPS)) {
    const contenders = activeSets
      .filter(({ set, count }) => group[set.id] && count >= group[set.id].pieces)
      .sort((a, b) => group[a.set.id].decodedPriority - group[b.set.id].decodedPriority || a.set.id.localeCompare(b.set.id));
    for (const { set } of contenders.slice(1)) {
      const rule = group[set.id];
      suppressed.set(`${set.id}:${rule.pieces}`, {
        groupId,
        winnerSetId: contenders[0]?.set.id ?? "",
        provenance: "calibrated",
        reason: "Lower decoded PriorityInGroup wins, confirmed by an in-game priority-1 versus priority-3 test.",
        all: rule.suppressAll === true,
        statIds: new Set(rule.statIds ?? []),
      });
    }
  }
  return suppressed;
}

export function suppressedSetBreakpoints(activeSets) {
  return new Set(suppressedSetStats(activeSets).keys());
}

function setStatIsSuppressed(suppressed, setId, required, statId) {
  const rule = suppressed.get(`${setId}:${required}`);
  return Boolean(rule?.all || rule?.statIds.has(statId));
}

function createSetEffectTrace(selections, includeSetEffects) {
  const activeSets = activeSetCounts(selections);
  const suppressed = suppressedSetStats(activeSets);
  const exclusivity = new Map();
  for (const [groupId, group] of Object.entries(SET_EXCLUSIVITY_GROUPS)) {
    const contenders = activeSets
      .filter(({ set, count }) => group[set.id] && count >= group[set.id].pieces)
      .sort((a, b) => group[a.set.id].decodedPriority - group[b.set.id].decodedPriority || a.set.id.localeCompare(b.set.id));
    if (contenders.length < 2) continue;
    for (const [index, { set }] of contenders.entries()) {
      const key = setBreakpointKey(set.id, group[set.id].pieces);
      if (!exclusivity.has(key)) exclusivity.set(key, []);
      exclusivity.get(key).push({
        groupId,
        role: index === 0 ? "winner" : "suppressed",
        winnerSetId: contenders[0].set.id,
        provenance: "calibrated",
        decodedPriority: group[set.id].decodedPriority,
        reason: "Lower decoded PriorityInGroup wins, confirmed by an in-game priority-1 versus priority-3 test.",
      });
    }
  }
  const byKey = new Map();
  const sets = activeSets.map(({ set, count }) => {
    const breakpoints = values(set.itemSetBonus).map((bonus) => {
      const classification = classifySetBreakpoint(set.id, bonus);
      const key = classification.key;
      const active = Boolean(classification.required && count >= classification.required);
      const suppression = suppressed.get(key);
      const row = {
        key,
        required: classification.required,
        active,
        included: includeSetEffects,
        status: active ? "pending" : "inactive",
        classification: classification.kind,
        confidence: classification.confidence,
        stage: classification.stage,
        provenance: {
          calculation: classification.confidence,
          application: exclusivity.has(key) ? "calibrated" : "exact",
          reason: classification.reason,
        },
        descriptions: values(bonus.bonus_passive ?? bonus.bonusPassive).map((passive) => plainInline(passive?.text || passive?.name)).filter(Boolean),
        evaluatedStats: [],
        appliedStats: [],
        suppressedStats: [],
        suppression: suppression ? {
          groupId: suppression.groupId,
          winnerSetId: suppression.winnerSetId,
          all: suppression.all,
          statIds: [...suppression.statIds],
          provenance: suppression.provenance,
          reason: suppression.reason,
        } : null,
        exclusivity: exclusivity.get(key) ?? [],
      };
      byKey.set(key, row);
      return row;
    });
    return {
      setId: set.id,
      name: set.name,
      equippedPieces: count,
      memberPieces: values(set.itemSetMadeOfItems).length,
      breakpoints,
    };
  });
  return { byKey, sets };
}

function recordSetEffectEvaluation(trace, key, statId, value, suppressed) {
  const breakpoint = trace.byKey.get(key);
  if (!breakpoint) return;
  const evaluated = {
    statId,
    value: Number(value) || 0,
    expandedStatIds: [...(STAT_EXPANSIONS[statId] ?? [])],
  };
  breakpoint.evaluatedStats.push(evaluated);
  if (suppressed) breakpoint.suppressedStats.push(evaluated);
}

function finalizeSetEffectTrace(trace, sourceMap, includeSetEffects) {
  for (const [statId, sources] of sourceMap) {
    for (const source of sources) {
      if (!source.setEffectKey) continue;
      const breakpoint = trace.byKey.get(source.setEffectKey);
      if (!breakpoint) continue;
      breakpoint.appliedStats.push({
        statId,
        value: source.value,
        sourceLabel: source.sourceLabel,
        sourceType: source.type,
        expandedFrom: source.expandedFrom ?? null,
      });
    }
  }
  const unsupportedActive = [];
  for (const set of trace.sets) for (const breakpoint of set.breakpoints) {
    if (!breakpoint.active) breakpoint.status = "inactive";
    else if (!includeSetEffects) breakpoint.status = "excluded";
    else if (breakpoint.classification === "unsupported" || breakpoint.classification === "conflict" || breakpoint.classification === "unclassified") {
      breakpoint.status = "unsupported";
      unsupportedActive.push({ setId: set.setId, setName: set.name, key: breakpoint.key, required: breakpoint.required, stage: breakpoint.stage, reason: breakpoint.provenance.reason });
    } else if (breakpoint.appliedStats.length && breakpoint.suppressedStats.length) breakpoint.status = "applied_with_suppression";
    else if (breakpoint.appliedStats.length) breakpoint.status = "applied";
    else if (breakpoint.suppressedStats.length) breakpoint.status = "suppressed";
    else breakpoint.status = "active_no_effect";
  }
  return {
    schema: "tl-helper.set-effects",
    schemaVersion: 1,
    included: includeSetEffects,
    sets: trace.sets,
    unsupportedActive,
  };
}

// Canonical human-readable rendering of one already-evaluated breakpoint.
// Consumers must not recalculate dynamic rules from final totals or rebuild
// suppression decisions from raw projection descriptions.
export function setEffectBreakpointSummary(breakpoint) {
  if (!breakpoint) return "Set bonus unavailable";
  const summedStats = (rows, { applied = false } = {}) => {
    const totals = new Map();
    for (const row of values(rows)) {
      if (!row.statId || (applied && row.expandedFrom)) continue;
      totals.set(row.statId, (totals.get(row.statId) ?? 0) + (Number(row.value) || 0));
    }
    return [...totals].map(([statId, value]) => `${statName(statId)} ${formatSigned(value, statId)}`);
  };
  const applied = summedStats(breakpoint.appliedStats, { applied: true });
  const suppressed = summedStats(breakpoint.suppressedStats);
  const description = values(breakpoint.descriptions).filter(Boolean).join("; ");
  const winnerName = indexes.itemSetById[breakpoint.suppression?.winnerSetId]?.name ?? breakpoint.suppression?.winnerSetId ?? "a stronger exclusive set effect";
  const suppressedText = suppressed.length ? `Not applied: ${suppressed.join(", ")} is replaced by ${winnerName}` : "";
  if (breakpoint.status === "unsupported") return `Not calculated: ${breakpoint.provenance?.reason || description || "unsupported effect"}`;
  if (breakpoint.status === "excluded") return `Excluded from this calculation${description ? `: ${description}` : ""}`;
  if (breakpoint.status === "inactive") return description || "Set bonus inactive";
  if (breakpoint.status === "suppressed") return suppressedText || `Not applied: replaced by ${winnerName}`;
  if (breakpoint.status === "applied_with_suppression") return [applied.join(", "), suppressedText].filter(Boolean).join(". ");
  if (breakpoint.status === "applied") return applied.join(", ") || description || "Applied";
  if (breakpoint.status === "active_no_effect") return description ? `${description} (no persistent sheet-stat change)` : "Active with no persistent sheet-stat change";
  return description || "Set bonus unavailable";
}

function applyQuestlogPhase(phase, progression, selections, totalsObject, add, includeSetEffects = true, setEffectTrace = null) {
  for (const source of activePersistentItemPassiveSources(progression, selections)) {
    if (source.rule.phase !== phase) continue;
    for (const row of source.rule.effect(totalsObject())) {
      add(row.statId, row.value, source.name, source.slot, source.grade, source.imageUrl);
    }
  }
  if (includeSetEffects) {
    const active = activeSetCounts(selections);
    const suppressed = suppressedSetStats(active);
    for (const { set, count } of active) {
      for (const [required, rule] of Object.entries(SET_PASSIVE_RULES[set.id] ?? {})) {
        if (count >= Number(required) && rule.phase === phase) {
          const bonus = values(set.itemSetBonus).find((row) => Number(row.set_count ?? row.setCount ?? 0) === Number(required));
          if (classifySetBreakpoint(set.id, bonus).kind !== "mapped") continue;
          for (const row of rule.effect(totalsObject())) {
            const key = setBreakpointKey(set.id, required);
            const isSuppressed = setStatIsSuppressed(suppressed, set.id, required, row.statId);
            recordSetEffectEvaluation(setEffectTrace, key, row.statId, row.value, isSuppressed);
            if (!isSuppressed) {
              add(row.statId, row.value, set.name, "set_bonus", 0, "", { setId: set.id, setPieces: Number(required), setEffectKey: key });
            }
          }
        }
      }
    }
  }
  const masteryBuild = { specialization: progression.masteries.map(({ masteryId, selection }) => ({ id: masteryId, lvl: Number(selection.level || 1) })) };
  for (const { skill, selection, loadoutType } of progression.skills) {
    const rule = PASSIVE_SKILL_RULES[skill.id];
    if (loadoutType === "passive" && rule?.phase === phase) for (const row of rule.effect(selection.level, masteryBuild, totalsObject())) add(row.statId, row.value, skill.name, "skill_passive", skill.grade, skill.imageUrl);
  }
  for (const { masteryId, mastery, selection: selected } of progression.masteries) {
    const rule = MASTERY_SYNERGY_RULES[masteryId];
    if (rule?.phase === phase) for (const row of rule.effect(Number(selected.level || 1), totalsObject())) add(row.statId, row.value, mastery?.name ?? masteryId, "weapon_specialization_synergy", mastery?.grade, mastery?.imageUrl);
  }
  for (const { masteryId, mastery } of progression.unifiedMasteries) {
    const rule = UNIFIED_MASTERY_RULES[masteryId];
    if (rule?.phase === phase) for (const row of rule.effect(1, totalsObject())) add(row.statId, row.value, mastery?.name ?? masteryId, "weapon_specialization_synergy", mastery?.grade, mastery?.imageUrl);
  }
}

function calculateRuneSynergies(build) {
  const result = {};
  for (const [slotId, selection] of Object.entries(build.equipment ?? {})) {
    const runes = normalizeRuneRows(selection.runes).map((row) => indexes.runeById[row.runeId]).filter(Boolean);
    if (runes.length === 3) {
      const synergy = findRuneSynergy(runeCategoryForSlot(slotId), runes.map((rune) => rune.runeType));
      if (synergy) result[slotId] = synergy;
    }
  }
  return result;
}

function addDerivedTotal(id, total, totals, sourceMap) {
  if (!total) return;
  totals.set(id, total);
  sourceMap.set(id, [{ sourceLabel: "Calculated total", name: "Calculated total", value: total, type: "derived" }]);
}

// Combat power is a fitted heuristic (hardcoded tables + per-item bonus
// allowlists in tl-questlog-rules.js), matched against the reference builds —
// it is NOT extracted from real game power tables. Always present it as an
// estimate in the UI.
export function calculateCombatPower(build) {
  const breakdown = combatPowerBreakdown(build);
  return breakdown.total;
}

export function combatPowerBreakdown(build) {
  const progression = effectiveProgression(build);
  let equipmentPower = COMBAT_POWER.equipmentBase;
  const items = [];
  for (const { slotId, selection, item } of allBuildSelectionEntries(build)) {
    if (!item) continue;
    const power = itemCombatPower(item, selection, slotId);
    equipmentPower += power;
    items.push({ slotId, itemId: item.id, name: item.name, power });
  }
  const skillPower = progression.skills.reduce((total, row) => total + Number(row.selection.level || 0) * COMBAT_POWER.skillPerLevel, 0);
  const masteryLevels = progression.masteries.reduce((total, row) => total + Number(row.selection.level || 0), 0);
  const masteryThresholdPower = COMBAT_POWER.masteryThresholds.filter((threshold) => masteryLevels >= threshold).length * COMBAT_POWER.masteryThresholdBonus;
  const masteryPower = masteryLevels * COMBAT_POWER.masteryPerLevel + masteryThresholdPower;
  // All components are integer-valued (itemCombatPower floors its fractional
  // terms), so flooring here is a no-op kept for consistency with that path.
  return { total: Math.floor(equipmentPower + skillPower + masteryPower), equipmentPower, skillPower, masteryPower, masteryLevels, items };
}

function itemCombatPower(item, selection, slotId) {
  if (["talistone1", "talistone2", "talistone3", "talistone4"].includes(item.equipmentType)) return 60;
  if (["gemstone1", "gemstone2"].includes(item.equipmentType)) return 70;
  if (isSupportSlot(slotId)) return 0;
  const category = WEAPON_TYPES.includes(item.equipmentType) ? "weapon" : "armor";
  const levels = getItemLevels(item);
  const level = selectedItemLevel(item, selection.level);
  const enchantLevels = Math.max(0, level - (levels[0] ?? level));
  let power = Number(COMBAT_POWER.itemLevelBase[category]?.[item.grade] ?? 0);
  power += enchantLevels * COMBAT_POWER.enchantPerLevel[category];
  const traitTierTotal = normalizeSelectionRows(selection.traits).reduce((total, row) => total + Number(row.tier || 0), 0);
  if (traitTierTotal > 1) power += (traitTierTotal - 1) * COMBAT_POWER.traitPerTier[category];
  for (const row of normalizeRuneRows(selection.runes)) {
    const rune = indexes.runeById[row.runeId];
    if (!rune) continue;
    const gradeBase = runeCombatPowerBase(rune.grade);
    power += rune.runeType === "chaos"
      ? gradeBase + Math.floor(runeCombatPowerLevelCap(rune.grade) * 0.2)
      : gradeBase + Math.floor(Number(row.level || 0) * 0.2);
  }
  if (COMBAT_POWER_BONUS_60_ITEMS.includes(item.id)) power += 60;
  if (COMBAT_POWER_BONUS_20_ITEMS.includes(item.id)) power += 20;
  if (normalizeSelectionRows(selection.resonance).length) {
    const tier = Number(selection.resonance[0].tier || 1);
    power += 20 + Math.max(0, tier - 1) * 10;
  }
  return power;
}

function runeCombatPowerBase(grade) {
  if (grade === 71) return 35;
  if (grade === 61) return 30;
  if (grade === 51) return 25;
  if (grade === 43) return 22;
  if (grade === 42) return 20;
  if (grade === 41) return 15;
  if (grade === 32) return 12;
  if (grade === 31) return 10;
  if (grade === 21) return 5;
  return 1;
}

function runeCombatPowerLevelCap(grade) {
  if (grade === 71) return 200;
  if (grade === 61) return 180;
  if (grade === 51) return 150;
  if (grade === 43 || grade === 42) return 120;
  if (grade === 41) return 90;
  if (grade === 32 || grade === 31) return 60;
  if (grade === 21) return 40;
  return 20;
}

// ---------- per-slot contribution slices (live engine) ----------
// Picker chips and comparison rows are computed as a slice of calculateBuild:
// clone the build, swap the slot's selection, and diff the resulting totals
// against the same build with the slot empty. Because equipItem resets the
// selection (traits/runes/etc.), a candidate item is measured "bare", while
// the currently equipped item is measured with its full selection — so the
// displayed delta always equals the real total change on click.

const slotDeltaCache = new WeakMap();

function slotDeltaCacheFor(build, attributes) {
  let entry = slotDeltaCache.get(build);
  const attrKey = JSON.stringify(attributes ?? {});
  if (!entry || entry.attrKey !== attrKey) {
    entry = { attrKey, map: new Map() };
    slotDeltaCache.set(build, entry);
  }
  return entry.map;
}

function totalsWithSlotSelection(build, attributes, slotId, selection, options = {}) {
  const clone = deepClone(build);
  slotCollectionForSlot(clone, slotId)[slotId] = selection
    ? { ...emptyEquipmentSelection(), ...deepClone(selection) }
    : emptyEquipmentSelection();
  const totals = {};
  const calculationOptions = calculationOptionsBoundToBuild(options, clone);
  const calculation = calculateBuild(clone, attributes ?? {}, calculationOptions);
  const rows = options.scenario != null ? calculation.scenarioStats : calculation.stats;
  for (const row of rows) {
    if (row.total) totals[row.id] = row.total;
  }
  return totals;
}

// Total-stat delta of placing `selection` into `slotId` versus leaving the
// slot empty, with everything else in the build unchanged.
export function slotSelectionContribution(slotId, selection, build, attributes, options = {}) {
  const cache = slotDeltaCacheFor(build, attributes);
  const setMode = options.includeSetEffects === false ? "no-sets" : "sets";
  const scenarioKey = scenarioCacheIdentity(options.scenario);
  const key = `${setMode}|${scenarioKey}|${slotId}|${JSON.stringify(selection ?? null)}`;
  if (cache.has(key)) return cache.get(key);
  const baselineKey = `${setMode}|${scenarioKey}|${slotId}|<empty>`;
  let baseline = cache.get(baselineKey);
  if (!baseline) {
    baseline = totalsWithSlotSelection(build, attributes, slotId, null, options);
    cache.set(baselineKey, baseline);
  }
  const withSelection = selection?.itemId ? totalsWithSlotSelection(build, attributes, slotId, selection, options) : baseline;
  const delta = {};
  for (const id of new Set([...Object.keys(baseline), ...Object.keys(withSelection)])) {
    const value = (withSelection[id] ?? 0) - (baseline[id] ?? 0);
    if (Math.abs(value) > 1e-9) delta[id] = value;
  }
  cache.set(key, delta);
  return delta;
}

// Total-stat delta of replacing the current selection in `slotId`. Weapon
// comparison surfaces must use this form so removing the current weapon does
// not deactivate that weapon family's shared skills and mastery in the
// baseline, falsely attributing all progression to every same-family item.
export function slotReplacementDelta(slotId, selection, build, attributes, options = {}) {
  const cache = slotDeltaCacheFor(build, attributes);
  const setMode = options.includeSetEffects === false ? "no-sets" : "sets";
  const scenarioKey = scenarioCacheIdentity(options.scenario);
  const current = slotSelection(slotId, build);
  const currentKey = JSON.stringify(current ?? null);
  const prefix = `${setMode}|${scenarioKey}|replacement|${slotId}|${currentKey}`;
  let baseline = cache.get(`${prefix}|<current>`);
  if (!baseline) {
    baseline = totalsWithSlotSelection(build, attributes, slotId, current, options);
    cache.set(`${prefix}|<current>`, baseline);
  }
  const candidateKey = `${prefix}|${JSON.stringify(selection ?? null)}`;
  if (cache.has(candidateKey)) return cache.get(candidateKey);
  const withSelection = selection?.itemId ? totalsWithSlotSelection(build, attributes, slotId, selection, options) : totalsWithSlotSelection(build, attributes, slotId, null, options);
  const delta = {};
  for (const id of new Set([...Object.keys(baseline), ...Object.keys(withSelection)])) {
    const value = (withSelection[id] ?? 0) - (baseline[id] ?? 0);
    if (Math.abs(value) > 1e-9) delta[id] = value;
  }
  cache.set(candidateKey, delta);
  return delta;
}

export function slotSelectionCalculationStatus(slotId, selection, build, attributes, options = {}) {
  const clone = deepClone(build);
  slotCollectionForSlot(clone, slotId)[slotId] = selection
    ? { ...emptyEquipmentSelection(), ...deepClone(selection) }
    : emptyEquipmentSelection();
  const calculationOptions = calculationOptionsBoundToBuild(options, clone);
  const calculation = calculateBuild(clone, attributes ?? {}, calculationOptions);
  if (options.scenario != null && calculation.scenarioEffects?.status !== "applied") {
    const blockingIssues = calculation.scenarioEffects.errors.map((error) => ({
      severity: "error",
      code: error.code,
      calculationImpact: "provisional",
      message: error.message,
    }));
    return { state: "provisional", blockingIssues, issues: blockingIssues };
  }
  return calculation.status;
}

// Contribution of equipping `item` bare (as equipItem does) at `level`.
export function itemStatContribution(item, slotId, level, build, attributes, options = {}) {
  if (!item) return {};
  return slotSelectionContribution(slotId, { itemId: item.id, level: Number(level) || 0 }, build, attributes, options);
}

export function statTotal(calc, statId) {
  return calc.stats.find((row) => row.id === statId)?.total ?? 0;
}

// ---------- validation ----------

function invalidSelectionIssue(code, message) {
  return { severity: "error", code, calculationImpact: "invalid", message };
}

function selectionTierCount(pool, statId, nested = false) {
  const source = nested ? pool?.[statId]?.tiers : pool?.[statId];
  return Array.isArray(source) ? source.length : Object.keys(source ?? {}).length;
}

function validateItemSelectionConfiguration(slotId, selection, item) {
  const issues = [];
  const itemName = item.name ?? item.id;
  const validateRows = (rows, pool, kind, cap, nested = false) => {
    if (rows != null && !Array.isArray(rows)) {
      issues.push(invalidSelectionIssue(`invalid_${kind}_collection`, `${itemName} has a malformed ${kind} collection.`));
      return;
    }
    const selected = Array.isArray(rows) ? rows : [];
    if (selected.length > cap) issues.push(invalidSelectionIssue(`${kind}_cap_exceeded`, `${itemName} has ${selected.length}/${cap} selected ${kind} rows.`));
    const seen = new Set();
    for (const row of selected) {
      const statId = String(row?.statId ?? "").trim();
      if (!statId || seen.has(statId)) {
        issues.push(invalidSelectionIssue(`invalid_${kind}_selection`, `${itemName} contains a missing or duplicate ${kind} stat.`));
        continue;
      }
      seen.add(statId);
      const tierCount = selectionTierCount(pool, statId, nested);
      const tier = Number(row?.tier ?? 1);
      if (!tierCount || !Number.isInteger(tier) || tier < 1 || tier > tierCount) {
        issues.push(invalidSelectionIssue(`invalid_${kind}_selection`, `${itemName} cannot use ${statName(statId)} at stored ${kind} tier ${String(row?.tier)}.`));
      }
    }
  };

  validateRows(selection.traits, item.itemStats?.traits, "trait", NORMAL_TRAIT_CAP);
  validateRows(selection.resonance, item.itemStats?.resonance, "resonance", RESONANCE_CAP, true);

  if (selection.uniqueTrait?.statId) {
    const statId = selection.uniqueTrait.statId;
    const tierCount = selectionTierCount(item.itemStats?.uniqueTraits, statId);
    const tier = Number(selection.uniqueTrait.tier ?? 1);
    if (!tierCount || !Number.isInteger(tier) || tier < 1 || tier > tierCount) {
      issues.push(invalidSelectionIssue("invalid_unique_trait_selection", `${itemName} cannot use ${statName(statId)} at stored unique-trait tier ${String(selection.uniqueTrait.tier)}.`));
    }
  }

  if (selection.artifactStatId) {
    const artifactRows = item.itemStats?.artifact?.[0] ?? item.itemStats?.artifact?.["0"];
    if (!Object.prototype.hasOwnProperty.call(artifactRows ?? {}, selection.artifactStatId)) {
      issues.push(invalidSelectionIssue("invalid_artifact_stat", `${itemName} cannot use stored artifact stat ${selection.artifactStatId}.`));
    }
  }

  if (selection.potentialId) {
    const available = values(item.itemPotential?.stats).some((row) => (row.stat_id ?? row.statId) === selection.potentialId);
    if (!available) issues.push(invalidSelectionIssue("invalid_item_potential", `${itemName} cannot use stored potential ${selection.potentialId}.`));
  }

  const heroicRows = Array.isArray(selection.heroicEffects) ? selection.heroicEffects : [];
  if (selection.heroicEffects != null && !Array.isArray(selection.heroicEffects)) {
    issues.push(invalidSelectionIssue("invalid_heroic_effect_collection", `${itemName} has a malformed Heroic effect collection.`));
  }
  const heroicGroups = heroicEffectGroupCount(item);
  const seenHeroicStats = new Set();
  for (let index = 0; index < heroicRows.length; index += 1) {
    const row = heroicRows[index];
    const statId = String(row?.statId ?? "").trim();
    if (!statId) continue;
    const option = heroicEffectOptions(item, index).find((entry) => entry.statId === statId);
    const level = Number(row?.level ?? 0);
    if (item.grade !== HEROIC_GRADE || index >= heroicGroups || !option || seenHeroicStats.has(statId)
      || !Number.isInteger(level) || level < 0 || level > Number(option?.maxLevel ?? -1)) {
      issues.push(invalidSelectionIssue("invalid_heroic_effect", `${itemName} cannot use ${statName(statId)} in stored Heroic effect group ${index + 1} at level ${String(row?.level ?? 0)}.`));
      continue;
    }
    seenHeroicStats.add(statId);
  }

  return issues;
}

export function validateBuild(runeSynergies, build, progression = effectiveProgression(build), attributes = {}) {
  const dataBacked = [];
  const assumed = [];
  dataBacked.push(...validateAttributeAllocation(attributes));
  for (const issue of progression.issues) {
    const target = issue.basis === "assumed" ? assumed : dataBacked;
    target.push({ severity: issue.severity, message: issue.message, code: issue.code, calculationImpact: issue.calculationImpact ?? "provisional" });
  }
  for (const { slotId, selection, item } of allBuildSelectionEntries(build)) {
    const itemId = String(selection?.itemId ?? "").trim();
    if (!itemId) continue;
    const slot = BUILD_SLOTS.find((entry) => entry.id === slotId);
    if (!slot) {
      dataBacked.push({ severity: "error", code: "invalid_build_slot", calculationImpact: "invalid", message: `Unknown build slot ${slotId} contains item ${itemId}.` });
      continue;
    }
    if (!item) {
      dataBacked.push({ severity: "error", code: "invalid_item_id", calculationImpact: "invalid", message: `${slot.label} contains unknown item ${itemId}.` });
      continue;
    }
    if (!slot.types.includes(item.equipmentType)) {
      dataBacked.push({ severity: "error", code: "invalid_item_slot", calculationImpact: "invalid", message: `${item.name} (${label(item.equipmentType)}) cannot be equipped in ${slot.label}.` });
    }
    dataBacked.push(...validateItemSelectionConfiguration(slotId, selection, item));
  }
  const mainWeapon = indexes.itemById[build.equipment.main_hand?.itemId];
  const offWeapon = indexes.itemById[build.equipment.off_hand?.itemId];
  if (mainWeapon && offWeapon && mainWeapon.equipmentType === offWeapon.equipmentType) {
    dataBacked.push({ severity: "error", code: "duplicate_weapon_types", calculationImpact: "invalid", message: `Main Hand and Off Hand both use ${label(mainWeapon.equipmentType)}. Weapon pair rules disallow duplicate weapon types.` });
  }

  const slotsByItem = new Map();
  for (const { slotId, item } of allBuildSelectionEntries(build)) {
    if (!item?.id) continue;
    if (!slotsByItem.has(item.id)) slotsByItem.set(item.id, []);
    slotsByItem.get(item.id).push(slotId);
  }
  for (const [itemId, slots] of slotsByItem) {
    if (slots.length < 2) continue;
    dataBacked.push({
      severity: "error",
      code: "duplicate_item_selection",
      calculationImpact: "invalid",
      message: `${indexes.itemById[itemId]?.name ?? itemId} is selected in multiple slots (${slots.map((slot) => slotById(slot)?.label ?? slot).join(", ")}). Shipped equip rules allow only one copy of the same item.`,
    });
  }

  const passiveSources = new Map();
  const equippedWeaponSet = new Set(progression.equippedWeaponTypes);
  for (const { slotId, selection, item } of allBuildSelectionEntries(build)) {
    if (!item) continue;
    const requestedPerkId = String(selection?.perkId ?? "").trim();
    const perk = selectedItemPerk(item, selection);
    if (requestedPerkId && !perk) {
      dataBacked.push({
        severity: "error",
        code: "invalid_item_perk",
        calculationImpact: "invalid",
        message: `${item.name} does not offer the stored Skill Core ${requestedPerkId}. The invalid core is inactive and excluded from calculations.`,
      });
    }
    const perkRule = PERK_PASSIVE_RULES[perk?.passive?.id];
    if (perkRule?.requiredWeapon && !equippedWeaponSet.has(perkRule.requiredWeapon)) {
      dataBacked.push({
        severity: "error",
        code: "perk_required_weapon_missing",
        calculationImpact: "none",
        message: `${perk.passive?.name ?? perk.name} requires an equipped ${label(perkRule.requiredWeapon)}. Its stored core is inactive and excluded from calculations.`,
      });
    }
    for (const passiveId of itemPassiveComplexIds(item, selection)) {
      if (!passiveSources.has(passiveId)) passiveSources.set(passiveId, []);
      passiveSources.get(passiveId).push(slotById(slotId)?.label ?? slotId);
    }
  }
  for (const [passiveId, sourceSlots] of passiveSources) {
    if (sourceSlots.length < 2) continue;
    dataBacked.push({
      severity: "info",
      code: "duplicate_passive_suppressed",
      calculationImpact: "none",
      message: `${passiveId} is selected from multiple slots (${sourceSlots.join(", ")}). The shipped Equipment Skill rule activates one copy, so duplicate effects are suppressed.`,
    });
  }

  for (const [group, slots] of Object.entries(HEROIC_SLOT_GROUPS)) {
    const heroicItems = slots
      .map((slot) => ({ slot, item: indexes.itemById[build.equipment[slot]?.itemId] }))
      .filter((entry) => entry.item?.grade === HEROIC_GRADE);
    if (heroicItems.length > 1) {
      dataBacked.push({
        severity: "error",
        code: "heroic_slot_cap_exceeded",
        calculationImpact: "invalid",
        message: `Only one Heroic ${group} item can be equipped. Current slots: ${heroicItems.map((entry) => slotById(entry.slot).label).join(", ")}.`,
      });
    }
  }

  for (const { slotId: slot, selection, item } of allBuildSelectionEntries(build)) {
    if (!item) continue;
    const levels = getItemLevels(item);
    if (!levels.length) {
      dataBacked.push({ severity: "warning", code: "item_level_data_missing", calculationImpact: "provisional", message: `${slotById(slot).label} has no item level stat rows in the cached data.` });
      continue;
    }
    const selected = Number(selectedItemLevel(item, selection.level));
    const requested = Number(selection.level || levels.at(-1));
    if (selected !== requested) {
      dataBacked.push({ severity: "warning", code: "item_level_clamped", calculationImpact: "provisional", message: `${slotById(slot).label} level ${requested} is not available for ${item.name}; totals use level ${selected}.` });
    }
  }

  for (const { slotId: slot, selection } of allBuildSelectionEntries(build)) {
    const rows = Array.isArray(selection?.runes) ? selection.runes : [];
    if (selection?.runes != null && !Array.isArray(selection.runes)) {
      dataBacked.push({ severity: "error", code: "invalid_rune_collection", calculationImpact: "invalid", message: `${slotById(slot).label} has a malformed rune collection.` });
    }
    const category = runeCategoryForSlot(slot);
    if (rows.length > 3) {
      dataBacked.push({ severity: "error", code: "rune_socket_cap_exceeded", calculationImpact: "invalid", message: `${slotById(slot).label} has ${rows.length} runes. An item has only three rune sockets.` });
    }
    for (const row of Array.isArray(rows) ? rows : []) {
      const runeId = String(row?.runeId ?? "").trim();
      if (!runeId) continue;
      const rune = indexes.runeById[runeId];
      if (!rune) {
        dataBacked.push({ severity: "error", code: "invalid_rune_id", calculationImpact: "invalid", message: `${slotById(slot).label} contains unknown rune ${runeId}.` });
        continue;
      }
      const option = runeStatOptions(rune).find((entry) => entry.statId === row.statId);
      if (!option) {
        dataBacked.push({ severity: "error", code: "invalid_rune_stat", calculationImpact: "invalid", message: `${rune.name} cannot roll stored stat ${String(row.statId ?? "missing")}.` });
        continue;
      }
      const rawLevel = Number(row.level ?? 1);
      if (!Number.isInteger(rawLevel) || rawLevel < 1 || rawLevel > option.maxLevel) {
        dataBacked.push({ severity: "error", code: "invalid_rune_level", calculationImpact: "invalid", message: `${rune.name} has invalid stored level ${String(row.level)} for ${statName(option.statId)}.` });
      }
    }
    const selectedRunes = rows.map((row) => indexes.runeById[row.runeId]).filter(Boolean);
    for (const rune of selectedRunes) {
      if (rune.equipmentCategory !== category) {
        dataBacked.push({ severity: "error", code: "invalid_rune_slot", calculationImpact: "invalid", message: `${rune.name} is a ${label(rune.equipmentCategory)} rune but is slotted into ${slotById(slot).label}.` });
      }
    }
    const chaosCount = selectedRunes.filter((rune) => rune.runeType === "chaos").length;
    if (chaosCount > 1) {
      dataBacked.push({ severity: "error", code: "chaos_rune_cap_exceeded", calculationImpact: "invalid", message: `${slotById(slot).label} has ${chaosCount} Chaos runes. Only one Chaos rune may be equipped on an item.` });
    }
    if (selectedRunes.length === 3 && !runeSynergies[slot]) {
      dataBacked.push({ severity: "warning", code: "rune_synergy_missing", calculationImpact: "provisional", message: `${slotById(slot).label} has three runes but no matching rune synergy in the cached table.` });
    }
  }

  // Stored selections remain editable even while their weapon is unequipped,
  // so report an over-budget saved loadout independently of activation.
  const specSpent = skillSpecSpent(build);
  if (specSpent > SPEC_BUDGET) {
    dataBacked.push({ severity: "warning", code: "skill_specialization_budget_exceeded", calculationImpact: "provisional", message: `Skill specialization budget is over the assumed budget: ${specSpent}/${SPEC_BUDGET}.` });
  }

  const unmapped = unmappedRuleIssues(build, progression);
  const setEffectContracts = setEffectContractIssues(build);
  dataBacked.push(...setEffectContracts);
  const issues = [...dataBacked, ...assumed, ...unmapped];
  const severityRank = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3));
  return { dataBacked, assumed, unmapped, setEffectContracts, issues };
}

export function validateAttributeAllocation(attributes = {}) {
  const issues = [];
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return [{ severity: "error", code: "invalid_attribute_collection", calculationImpact: "invalid", message: "Allocated attributes must be an object keyed by STR, DEX, INT, PER, and CON." }];
  }
  const knownIds = new Set(ATTRIBUTES.map(([id]) => id));
  const unknownIds = Object.keys(attributes).filter((id) => !knownIds.has(id));
  if (unknownIds.length) {
    issues.push({
      severity: "error",
      code: "unknown_attribute_id",
      calculationImpact: "invalid",
      message: `Unknown allocated attribute ${unknownIds.join(", ")} is excluded from calculations.`,
    });
  }
  let spent = 0;
  for (const [id, name] of ATTRIBUTES) {
    const raw = attributes[id] ?? 0;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      issues.push({
        severity: "error",
        code: "invalid_attribute_allocation",
        calculationImpact: "invalid",
        message: `${name} has invalid allocated points ${String(raw)}. Allocations must be nonnegative whole numbers.`,
      });
      continue;
    }
    spent += value;
  }
  if (spent > ATTRIBUTE_POINT_BUDGET) {
    issues.push({
      severity: "error",
      code: "attribute_budget_exceeded",
      calculationImpact: "invalid",
      message: `Allocated attribute budget exceeded: ${spent}/${ATTRIBUTE_POINT_BUDGET}.`,
    });
  }
  return issues;
}

export function calculationStatus(validation) {
  const issues = Array.isArray(validation?.issues) ? validation.issues : [];
  const invalidIssues = issues.filter((issue) => issue.calculationImpact === "invalid");
  const provisionalIssues = issues.filter((issue) => issue.calculationImpact !== "invalid" && issue.calculationImpact !== "none");
  const ignoredIssues = issues.filter((issue) => issue.calculationImpact === "none");
  return {
    state: invalidIssues.length ? "invalid" : provisionalIssues.length ? "provisional" : "legal",
    blockingIssues: [...invalidIssues, ...provisionalIssues],
    invalidIssues,
    provisionalIssues,
    ignoredIssues,
  };
}

function setEffectContractIssues(build) {
  const issues = [];
  const selections = allBuildSelectionEntries(build);
  for (const { set, count } of activeSetCounts(selections)) {
    for (const bonus of values(set.itemSetBonus)) {
      const classification = classifySetBreakpoint(set.id, bonus);
      if (!classification.required || count < classification.required) continue;
      if (!["conflict", "unclassified"].includes(classification.kind)) continue;
      issues.push({
        severity: "error",
        code: "invalid_set_effect_contract",
        calculationImpact: "invalid",
        message: `${set.name} (${classification.required} pc) has an invalid set-effect contract: ${classification.reason} No effect was applied.`,
      });
    }
  }
  return issues;
}

function unmappedRuleIssues(build, progression = effectiveProgression(build)) {
  const issues = [];
  const seen = new Set();
  const addContractIssue = (familyId, effectId, effectName) => {
    if (!effectId) return;
    const issue = passiveEffectContractIssue(familyId, effectId, effectName);
    const key = `${familyId}:${effectId}`;
    if (issue && !seen.has(key)) {
      seen.add(key);
      issues.push(issue);
    }
  };

  for (const { selection, item } of allBuildSelectionEntries(build)) {
    if (!item) continue;
    addContractIssue("itemPerkComplex", item.passives?.id, `${item.passives?.name ?? item.passives?.id} (${item.name})`);
    const perk = selectedItemPerk(item, selection);
    addContractIssue("itemPerkComplex", perk?.passive?.id, `${perk?.passive?.name ?? perk?.name ?? perk?.id} (${item.name})`);
  }
  for (const { skill, loadoutType } of progression.skills) {
    if (loadoutType === "passive") addContractIssue("weaponPassive", skill.id, skill.name);
  }
  for (const { masteryId, mastery } of progression.masteries) {
    const hasStructuredStats = values(mastery.stats).some((rows) => values(rows).length);
    if (!hasStructuredStats) addContractIssue("masteryNonStructured", masteryId, mastery.name);
  }
  for (const { masteryId, mastery } of progression.unifiedMasteries) {
    addContractIssue("masteryNonStructured", masteryId, mastery.name);
  }
  return issues;
}

// ---------- stat pages ----------

export function shouldShowStatRow(id, build) {
  const statId = String(id ?? "").toLowerCase();
  if (/^attack_power_(?:main|off)_hand_(?:min|max)$/.test(statId)) return false;
  if (ATTRIBUTES.some(([attr]) => attr === statId)) return false;
  if (statId === "none") return false;
  if (!WEAPON_TYPES.includes(statId)) return true;
  return equippedWeaponTypes(build).includes(statId);
}

export function statPageFor(rawId) {
  const id = String(rawId ?? "").toLowerCase();
  if (id.includes("pvp")) return "pvp";
  if (id.includes("boss")) return "boss";
  if (["front", "rear", "side", "back", "directional"].some((token) => id.includes(token))) return "directional";
  if (["species", "humanoid", "wildkin", "demon", "undead", "construct"].some((token) => id.includes(token))) return "species";
  if (["stun", "bind", "collision", "collide", "weaken", "silence", "sleep", "petrification", "blind", "control"].some((token) => id.includes(token))) return "control";
  if (
    ATTRIBUTES.some(([attr]) => attr === id) ||
    ["hp", "health", "mana", "stamina", "regen", "cooldown", "duration", "buff", "debuff", "movement", "move", "speed", "range"].some((token) => id.includes(token))
  ) {
    return "utility";
  }
  return "combat";
}

export function statSort(id) {
  const primary = PRIMARY_STATS.indexOf(id);
  if (primary !== -1) return primary;
  if (ATTRIBUTES.some(([attr]) => attr === id)) return 20;
  return 100;
}

export function statPageSort(id, activePage) {
  if (activePage === "all") {
    const pageIndex = STAT_PAGE_IDS.indexOf(statPageFor(id));
    return (pageIndex === -1 ? 99 : pageIndex) * 1000 + statSort(id);
  }
  return statSort(id);
}

export function statPageRows(calc, pageId, build) {
  const activePage = STAT_PAGE_IDS.includes(pageId) ? pageId : "combat";
  return calc.stats
    .filter((entry) => entry.total)
    .filter((entry) => shouldShowStatRow(entry.id, build))
    .filter((entry) => activePage === "all" || statPageFor(entry.id) === activePage)
    .sort((a, b) => statPageSort(a.id, activePage) - statPageSort(b.id, activePage) || statName(a.id).localeCompare(statName(b.id)));
}

export function sourceTypeLabel(type) {
  const names = {
    attribute: "Attribute",
    equipment: "Item main",
    artifact: "Artifact",
    set: "Set",
    "artifact-set": "Artifact set",
    trait: "Trait",
    "unique-trait": "Unique trait",
    "heroic-effect": "Heroic effect",
    resonance: "Resonance",
    rune: "Rune",
    "rune-synergy": "Rune synergy",
    mastery: "Mastery",
    skill: "Skill",
  };
  return names[type] ?? label(type);
}

// ---------- formatting ----------

function derivedQuestlogStatName(id) {
  const match = String(id ?? "").match(/^(?:(pvp|boss|front|side|rear)_)?(?:(all|melee|range|magic)_)?(accuracy|armor|critical_attack|critical_defense|double_attack|double_defense)$/);
  if (!match) return "";
  const [, prefixId = "", subjectId = "", metricId] = match;
  const prefix = { pvp: "PvP", boss: "Boss", front: "Front", side: "Side", rear: "Back" }[prefixId] ?? "";
  const subject = { all: "", melee: "Melee", range: "Ranged", magic: "Magic" }[subjectId] ?? "";
  const metric = {
    accuracy: "Hit Chance",
    armor: "Defense",
    critical_attack: "Critical Hit Chance",
    critical_defense: "Endurance",
    double_attack: "Heavy Attack Chance",
    double_defense: "Heavy Attack Evasion",
  }[metricId];
  return [prefix, subject, metric].filter(Boolean).join(" ");
}

export function statName(id) {
  if (WEAPON_TYPES.includes(String(id ?? "").toLowerCase())) return `${label(id)} Bonus Attack Power`;
  const raw = STAT_ALIASES[id] ?? (derivedQuestlogStatName(id) || data?.statLabels?.[id] || label(id));
  return String(raw)
    .replace(/\bDouble Damage Dealt Modifier\b/gi, "Heavy Attack Damage")
    .replace(/\bDouble Damage Taken Modifier\b/gi, "Heavy Attack Damage Resistance")
    .replace(/\bDouble Attack\b/gi, "Heavy Attack Chance")
    .replace(/\bDouble Defense\b/gi, "Heavy Attack Evasion");
}

export function gradeName(grade) {
  const names = { 0: "Misc", 11: "Common", 21: "Uncommon", 31: "Rare", 32: "Rare II", 41: "Epic", 42: "Epic II", 43: "Epic III", 51: "Heroic", 61: "Artifact", 71: "Ancient" };
  return names[grade] ?? `G${grade ?? 0}`;
}

export function gradeColor(grade) {
  return GRADE_COLORS[grade] ?? GRADE_COLORS[0];
}

export function label(value) {
  if (DISPLAY_LABELS[value]) return DISPLAY_LABELS[value];
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatNumber(value) {
  return Math.round(Number(value || 0)).toLocaleString();
}

export function formatCompactNumber(value) {
  const numeric = Number(value || 0);
  if (Math.abs(numeric) >= 1000000) return `${trim(numeric / 1000000)}m`;
  if (Math.abs(numeric) >= 1000) return `${trim(numeric / 1000)}k`;
  return formatNumber(numeric);
}

export function formatSigned(value, id) {
  const numeric = Number(value || 0);
  return `${numeric >= 0 ? "+" : ""}${formatStat(id, numeric)}`;
}

export function formatStat(id, value) {
  const numeric = Number(value || 0);
  if (id === "attack_speed" || id === "attack_speed_main_hand" || id === "attack_speed_off_hand") {
    return `${trim(numeric / 1000)}s`;
  }
  if (id === "attack_range" || id === "attack_range_main_hand" || id === "attack_range_off_hand") {
    return `${trim(numeric / 100)}m`;
  }
  if (id === "shield_block_chance" || id === "block_chance" || id === "shield_block_chance_penetration") {
    return `${trim(numeric / 100)}%`;
  }
  if (id === "cost_regen" || id === "hp_regen" || id === "stamina_regen") {
    return trim(numeric / 1000);
  }
  if ([
    "bind_accuracy",
    "bind_tolerance",
    "blind_accuracy",
    "blind_tolerance",
    "collide_amplification",
    "collide_resistance",
    "collision_resistance",
    "petrification_accuracy",
    "petrification_tolerance",
    "silence_accuracy",
    "silence_tolerance",
    "sleep_accuracy",
    "sleep_tolerance",
    "stun_accuracy",
    "stun_tolerance",
    "weaken_accuracy",
    "weaken_tolerance",
  ].includes(id)) {
    return trim(numeric / 40);
  }
  if (/(?:^|_)(?:accuracy|critical_attack|critical_defense|double_attack|double_defense)$/.test(id)
    || id === "all_species_damage_amplification") {
    return trim(numeric / 10);
  }
  if (id.endsWith("_modifier") || id.includes("duration_modifier")) {
    return `${trim(numeric / 100)}%`;
  }
  if (STAT_UNIT_MODIFIERS[id] !== undefined) return trim(numeric * STAT_UNIT_MODIFIERS[id]);
  return trim(numeric);
}

export function statHardCap(id) {
  const cap = Number(STAT_HARD_CAPS[id]);
  return Number.isFinite(cap) ? cap : null;
}

export function effectiveStatValue(id, value) {
  const numeric = Number(value || 0);
  const maximum = statHardCap(id);
  return maximum == null ? numeric : Math.min(numeric, maximum);
}

export function statDisplayToRaw(id, value) {
  const numeric = Number(value || 0);
  if (id === "attack_speed" || id === "attack_speed_main_hand" || id === "attack_speed_off_hand") return numeric * 1000;
  if (id === "attack_range" || id === "attack_range_main_hand" || id === "attack_range_off_hand") return numeric * 100;
  if (id === "shield_block_chance" || id === "block_chance" || id === "shield_block_chance_penetration") return numeric * 100;
  if (id === "cost_regen" || id === "hp_regen" || id === "stamina_regen") return numeric * 1000;
  if (["bind_accuracy","bind_tolerance","blind_accuracy","blind_tolerance","collide_amplification","collide_resistance","collision_resistance","petrification_accuracy","petrification_tolerance","silence_accuracy","silence_tolerance","sleep_accuracy","sleep_tolerance","stun_accuracy","stun_tolerance","weaken_accuracy","weaken_tolerance"].includes(id)) return numeric * 40;
  if (/(?:^|_)(?:accuracy|critical_attack|critical_defense|double_attack|double_defense)$/.test(id) || id === "all_species_damage_amplification") return numeric * 10;
  if (id.endsWith("_modifier") || id.includes("duration_modifier")) return numeric * 100;
  if (STAT_UNIT_MODIFIERS[id] !== undefined) return numeric / STAT_UNIT_MODIFIERS[id];
  return numeric;
}

export function trim(value) {
  const numeric = Number(value || 0);
  const truncated = Math.trunc((numeric + Number.EPSILON * Math.sign(numeric)) * 100) / 100;
  return Number(truncated).toLocaleString();
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ---------- showcase seed ----------
// Builds a populated demo loadout on first run so the design opens alive.

export function seedShowcaseBuild(name = "Showcase Build") {
  const build = createInitialBuild();
  build.name = name;
  const usedWeapons = new Set();
  const usedHeroicGroups = new Set();
  const pickFor = (slot, preferType) => {
    let options = slotItems(slot).filter((item) => item.grade >= 41 && getItemLevels(item).length);
    if (preferType) {
      const typed = options.filter((item) => item.equipmentType === preferType);
      if (typed.length) options = typed;
    }
    if (!options.length) options = slotItems(slot).filter((item) => getItemLevels(item).length);
    return options.find((entry) => {
      const heroicGroup = heroicSlotGroupForSlot(slot.id);
      if (WEAPON_SLOTS.includes(slot.id) && usedWeapons.has(entry.equipmentType)) return false;
      if (entry.grade === HEROIC_GRADE && heroicGroup && usedHeroicGroups.has(heroicGroup)) return false;
      return true;
    }) ?? options[0];
  };
  const weaponPrefs = { main_hand: "sword", off_hand: "wand" };
  for (const slot of EQUIPMENT_SLOTS) {
    const item = pickFor(slot, weaponPrefs[slot.id]);
    if (!item) continue;
    const selection = {
      ...emptyEquipmentSelection(),
      itemId: item.id,
      level: getItemLevels(item).at(-1) ?? 0,
    };
    // Select top traits + resonance up to caps so the build shows real choices.
    const traitIds = Object.keys(item.itemStats?.traits ?? {}).slice(0, NORMAL_TRAIT_CAP);
    selection.traits = traitIds.map((statId) => ({ statId, tier: maxTierFor(item.itemStats.traits[statId]) }));
    const uniqueIds = Object.keys(item.itemStats?.uniqueTraits ?? {});
    if (uniqueIds.length) selection.uniqueTrait = { statId: uniqueIds[0], tier: maxTierFor(item.itemStats.uniqueTraits[uniqueIds[0]]) };
    const resonanceIds = Object.keys(item.itemStats?.resonance ?? {}).slice(0, RESONANCE_CAP);
    selection.resonance = resonanceIds.map((statId) => ({ statId, tier: maxTierFor(item.itemStats.resonance[statId]?.tiers) }));
    if (item.grade === HEROIC_GRADE) {
      const chosen = new Set();
      const preferences = [
        ["all_accuracy", "damage_reduction", "hp_max", "str", "dex", "int", "per", "con"],
        ["skill_cooldown_modifier", "attack_speed_modifier", "critical_damage_taken_modifier", "all_critical_attack", "hp_max", "dex", "str"],
      ];
      selection.heroicEffects = Array.from({ length: heroicEffectGroupCount(item) }, (_, groupIndex) => {
        const options = heroicEffectOptions(item, groupIndex);
        const preferredIds = preferences[groupIndex] ?? preferences.flat();
        const option = preferredIds
          .map((statId) => options.find((entry) => entry.statId === statId && !chosen.has(statId)))
          .find(Boolean)
          ?? options.find((entry) => !chosen.has(entry.statId))
          ?? options[0];
        if (option) chosen.add(option.statId);
        return option ? { statId: option.statId, level: option.maxLevel, levelKnown: true } : emptyHeroicEffect();
      });
    }
    // Socket three matching runes for a synergy where possible.
    const category = runeCategoryForSlot(slot.id);
    const available = indexes.runesByCategory[category] ?? [];
    selection.runes = ["attack", "defense", "assist"].map((type) => {
      const rune = available.find((entry) => entry.runeType === type) ?? available[0];
      const option = runeStatOptions(rune)[0];
      return rune ? { runeId: rune.id, statId: option?.statId ?? "", level: Math.max(1, (option?.levels?.length ?? 1) - 1) } : emptyRune();
    });
    build.equipment[slot.id] = selection;
    if (WEAPON_SLOTS.includes(slot.id)) usedWeapons.add(item.equipmentType);
    const heroicGroup = heroicSlotGroupForSlot(slot.id);
    if (item.grade === HEROIC_GRADE && heroicGroup) usedHeroicGroups.add(heroicGroup);
  }
  // Artifacts: equip the first full set.
  const firstSet = data.artifactSets[0];
  if (firstSet) applyArtifactSet(build, firstSet.id);
  // Skills: fill actives + passives for the equipped weapons with one spec each.
  const weapons = currentWeaponTypes(build);
  const available = availableSkillsForWeapons(weapons);
  const actives = available.filter((skill) => skillLoadoutType(skill) === "active").slice(0, 10);
  const passives = available.filter((skill) => skillLoadoutType(skill) === "passive").slice(0, 6);
  build.skills = [...actives, ...passives].map((skill) => {
    const traits = skillTraitsFor(skill.id);
    const level = skillDefaultLevel(skill);
    const spec = traits.find((trait) => Number(trait.unlockLevel || 0) <= level);
    return { skillId: skill.id, level, specializationIds: spec ? [spec.id] : [] };
  });
  // Mastery: pick the first several nodes for the main weapon.
  const masteryRows = masteryRowsForWeapon(weapons[0]).sort((a, b) => masteryNodeOrder(a) - masteryNodeOrder(b)).slice(0, 8);
  build.masteries = Object.fromEntries(masteryRows.map((mastery) => [mastery.id, { level: masteryMaxLevel(mastery) }]));
  return build;
}
