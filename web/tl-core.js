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
  SET_PASSIVE_RULES,
  STAT_EXPANSIONS,
  STAT_UNIT_MODIFIERS,
  STELLAR_JOURNEY_ATTRIBUTES,
  UNIFIED_MASTERY_RULES,
  allocatedAttributeValue,
} from "./tl-questlog-rules.js";
import { loadWebData } from "./tl-data-loader.js";

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
export const PASSIVE_SKILL_CAP = 8;
export const SPEC_BUDGET = 110;
export const HEROIC_SLOT_GROUPS = {
  weapon: WEAPON_SLOTS,
  armor: ["head", "chest", "cloak", "hands", "feet", "legs"],
  accessory: ["necklace", "bracelet", "ring_1", "ring_2", "brooch", "earring", "belt"],
};
export const DISPLAY_LABELS = { sword2h: "Greatsword" };

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
  animal_damage_amplification: "Wildkin Damage Boost",
  creation_damage_amplification: "Construct Damage Boost",
  demon_damage_amplification: "Demon Damage Boost",
  undead_damage_amplification: "Undead Damage Boost",
  all_species_damage_resistance: "Species Damage Resistance",
  grankus_damage_resistance: "Humanoid Damage Resistance",
  animal_damage_resistance: "Wildkin Damage Resistance",
  creation_damage_resistance: "Construct Damage Resistance",
  demon_damage_resistance: "Demon Damage Resistance",
  undead_damage_resistance: "Undead Damage Resistance",
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

export async function initCore(source) {
  source = await loadWebData(source);
  data = source;
  indexes = buildIndexes(source);
  return { data, indexes };
}

export function buildIndexes(source) {
  const itemById = Object.fromEntries(source.items.map((item) => [item.id, item]));
  const runeById = Object.fromEntries(source.runes.map((rune) => [rune.id, rune]));
  const itemSetById = Object.fromEntries(source.itemSets.map((set) => [set.id, set]));
  const skillById = Object.fromEntries((source.skills ?? []).map((skill) => [skill.id, skill]));
  const skillTraitById = Object.fromEntries((source.skillTraits ?? []).map((trait) => [trait.id, trait]));
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
  return { itemById, runeById, itemSetById, skillById, skillTraitById, itemsByType, runesByCategory };
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
  return { statId: "" };
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
  return { id: "build-default", name: "Default Build", equipment, artifacts, supportSlots, skills: [], masteries: {}, unifiedMasteries: [] };
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
      if (statId) heroicEffects[Number(groupNumber) - 1] = { statId };
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

// Heroic equipment exposes two independently rolled effects. Questlog stores
// each slot as random_stat_group_1 / random_stat_group_2. The displayed value
// is base_value; the levels array describes the underlying growth table rather
// than a separate choice in the Heroic Effects picker.
export function heroicEffectOptions(item, groupIndex) {
  if (!item || item.grade !== HEROIC_GRADE) return [];
  const index = clamp(Number(groupIndex || 0), 0, Math.max(0, heroicEffectGroupCount(item) - 1));
  const rows = item.itemStats?.[`random_stat_group_${index + 1}`];
  if (!Array.isArray(rows)) return [];
  return rows.map((entry) => ({
    statId: entry.stat_id ?? entry.statId ?? "",
    value: Number(entry.base_value ?? entry.baseValue ?? entry.levels?.[0] ?? 0),
    probability: Number(entry.probability ?? 0),
    maxLevel: Number(entry.max_level ?? entry.maxLevel ?? Math.max(1, (entry.levels?.length ?? 1) - 1)),
    levels: entry.levels ?? [],
  })).filter((entry) => entry.statId);
}

export function selectedHeroicEffects(item, selection) {
  return normalizeHeroicEffectRows(selection?.heroicEffects, item).flatMap((row, groupIndex) => {
    if (!row.statId) return [];
    const option = heroicEffectOptions(item, groupIndex).find((entry) => entry.statId === row.statId);
    if (!option) return [];
    return [{
      ...option,
      groupIndex,
      groupNumber: groupIndex + 1,
      name: statName(option.statId),
      formattedValue: formatSigned(option.value, option.statId),
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

export function itemTooltipEffects(item) {
  if (item.passives?.name || item.passives?.text) {
    return [{
      label: "Passive:",
      type: "passive",
      name: item.passives.name ?? "Passive",
      text: item.passives.text ?? "",
      imageUrl: item.passives.imageUrl ?? "",
    }];
  }
  return itemSkillCores(item).slice(0, 1).map((perk) => ({
    label: "Skill Core:",
    type: "skillCore",
    name: perk.passive?.name ?? perk.name,
    text: perk.passive?.text ?? "",
    imageUrl: perk.passive?.imageUrl ?? perk.imageUrl ?? "",
  }));
}

// Full data model for the equipped-item hover card (doll rails on Armory +
// Tracker). Pure data — no handlers, no colors that aren't grade-derived.
export function buildItemHoverModel(slotId, build, calc) {
  const item = slotItem(slotId, build);
  if (!item) return null;
  const selection = slotSelection(slotId, build);
  const color = gradeColor(item.grade);
  const level = selectedItemLevel(item, selection.level);

  const tierText = (statId, tiersRaw, tier) => {
    const arr = Array.isArray(tiersRaw) ? tiersRaw : Object.values(tiersRaw ?? {});
    const v = arr[clamp(Number(tier || 1), 1, Math.max(1, arr.length)) - 1];
    return `${statName(statId)} ${formatStat(statId, v)}`;
  };
  // Prefer what's actually rolled on the equipped item; if the build has no
  // selection for this piece, fall back to the item's own trait lines (max tier)
  // so the card always shows the gear's full stat block, not just its set.
  const maxTierVal = (tiersRaw) => { const a = Array.isArray(tiersRaw) ? tiersRaw : Object.values(tiersRaw ?? {}); return a.length; };
  const selTraits = normalizeSelectionRows(selection.traits);
  const traits = (selTraits.length
    ? selTraits.map((r) => ({ text: tierText(r.statId, item.itemStats?.traits?.[r.statId], r.tier) }))
    : Object.entries(item.itemStats?.traits ?? {}).slice(0, NORMAL_TRAIT_CAP).map(([statId, tiers]) => ({ text: tierText(statId, tiers, maxTierVal(tiers)) })));
  const selReson = normalizeSelectionRows(selection.resonance);
  const resonance = (selReson.length
    ? selReson.map((r) => ({ text: tierText(r.statId, item.itemStats?.resonance?.[r.statId]?.tiers, r.tier) }))
    : Object.entries(item.itemStats?.resonance ?? {}).slice(0, RESONANCE_CAP).map(([statId, row]) => ({ text: tierText(statId, row?.tiers, maxTierVal(row?.tiers)) })));
  const uniqueEntries = Object.entries(item.itemStats?.uniqueTraits ?? {});
  const unique = selection.uniqueTrait
    ? [{ text: tierText(selection.uniqueTrait.statId, item.itemStats?.uniqueTraits?.[selection.uniqueTrait.statId], selection.uniqueTrait.tier) }]
    : uniqueEntries.slice(0, UNIQUE_TRAIT_CAP).map(([statId, tiers]) => ({ text: tierText(statId, tiers, maxTierVal(tiers)) }));
  const heroicEffects = selectedHeroicEffects(item, selection).map((effect) => ({
    groupNumber: effect.groupNumber,
    name: effect.name,
    value: effect.formattedValue,
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
      icon: rune?.imageUrl ?? "", hasIcon: Boolean(rune?.imageUrl),
      typeLabel: rune ? runeTypeLabel(rune.runeType).toUpperCase() : "",
      typeColor: rune ? (typeColors[rune.runeType] ?? "#cbb185") : "#cbb185",
      gradeName: rune ? runeTierLabel(rune) : "",
      level: lvl,
      contribution: r.statId ? `+${formatStat(r.statId, val)} ${statName(r.statId)}` : "",
    };
  });
  const isEquipmentSlot = EQUIPMENT_SLOTS.some((s) => s.id === slotId);
  const runes = isEquipmentSlot
    ? [...filledRunes, ...Array.from({ length: Math.max(0, 3 - filledRunes.length) }, () => ({ empty: true, typeColor: "rgba(212, 166, 94, 0.3)", hasIcon: false }))]
    : filledRunes;

  const synergy = calc?.runeSynergies?.[slotId];
  const synergyStats = synergy ? Object.entries(synergy.stats ?? {}).map(([id, v]) => `${statName(id)} ${formatSigned(v, id)}`) : [];

  const effects = itemTooltipEffects(item).map((e) => ({ label: e.label, name: e.name, text: plainInline(e.text), icon: e.imageUrl || "", hasIcon: Boolean(e.imageUrl) }));

  let setInfo = null;
  if (item.setId) {
    const set = indexes.itemSetById[item.setId];
    if (set) {
      const equippedIds = new Set([
        ...Object.values(build.equipment).map((x) => x.itemId).filter(Boolean),
        ...Object.values(build.artifacts ?? {}).map((x) => x.itemId).filter(Boolean),
      ]);
      const members = values(set.itemSetMadeOfItems);
      const count = members.filter((m) => equippedIds.has(m.id)).length;
      // Computed SET_PASSIVE_RULES effects are evaluated against the live calc
      // totals so the card shows the actual values the engine applies (the
      // static bonus_passive text only describes them).
      const calcTotals = calc ? Object.fromEntries(calc.stats.map((row) => [row.id, { total: row.total }])) : null;
      const bonuses = values(set.itemSetBonus).map((b) => {
        const req = Number(b.set_count || 0);
        const active = count >= req;
        const stats = values(b.bonus_stat).map((s) => `${statName(s.type)} ${formatStat(s.type, s.value)}`);
        const pass = values(b.bonus_passive).map((p) => p?.name ? (p.text ? `${plainInline(p.name)} — ${plainInline(p.text)}` : plainInline(p.name)) : plainInline(p?.text));
        let computed = [];
        const rule = SET_PASSIVE_RULES[set.id]?.[req];
        if (rule && calcTotals) {
          try {
            computed = rule.effect(calcTotals).map((row) => `${statName(row.statId)} ${formatSigned(row.value, row.statId)}`);
          } catch { computed = []; }
        }
        return {
          required: `${req} pc`,
          active,
          color: active ? "#7ee0a6" : "#8a795f",
          text: [...stats, ...pass].filter(Boolean).join(", ") || "Set bonus",
          computedText: computed.length ? `Applied: ${computed.join(", ")}` : "",
          hasComputed: computed.length > 0,
        };
      });
      setInfo = { name: set.name, countLabel: `${count}/${members.length}`, bonuses };
    }
  }

  let abilities = [];
  if (slotId === "main_hand" || slotId === "off_hand") {
    abilities = availableSkillsForWeapons([item.equipmentType])
      .filter((s) => skillLoadoutType(s) === "active")
      .slice(0, 8)
      .map((s) => ({ name: s.name, icon: s.imageUrl || "", hasIcon: Boolean(s.imageUrl) }));
  }

  // Skill Cores · Potentials: the slotted perk (skill core), the selected
  // potential stat, and the item's enchant proc effects. The large
  // availablePerks pool is intentionally omitted — only what is actually on
  // this piece is shown. Known Questlog-parity gaps that stay blocked on
  // missing bundle data: active/inactive trait flags and fixed set/enchant
  // effects — do not fake them.
  const allCores = [];
  const slottedPerk = values(item.availablePerks).find((p) => p.id === selection.perkId);
  if (slottedPerk) {
    allCores.push({
      name: slottedPerk.passive?.name ?? slottedPerk.name,
      text: plainInline(slottedPerk.passive?.text ?? ""),
      icon: slottedPerk.passive?.imageUrl ?? slottedPerk.imageUrl ?? "",
      hasIcon: Boolean(slottedPerk.passive?.imageUrl ?? slottedPerk.imageUrl),
    });
  }
  if (selection.potentialId && item.itemPotential) {
    const potential = values(item.itemPotential.stats).find((row) => (row.statId ?? row.stat_id) === selection.potentialId);
    if (potential) {
      allCores.push({
        name: "Item Potential",
        text: `${statName(selection.potentialId)} ${formatSigned(potential.value, selection.potentialId)}`,
        icon: "",
        hasIcon: false,
      });
    }
  }
  for (const proc of item.itemPotential?.skills ?? []) {
    allCores.push({
      name: proc.probability ? `${proc.name} (${trim(proc.probability)}%)` : proc.name,
      text: plainInline(proc.description ?? ""),
      icon: proc.imageUrl ?? "",
      hasIcon: Boolean(proc.imageUrl),
    });
  }
  const cores = allCores.slice(0, 4);
  const coreMore = Math.max(0, allCores.length - cores.length);

  return {
    name: item.name, nameColor: color, icon: item.imageUrl ?? "", hasIcon: Boolean(item.imageUrl),
    meta: `${gradeName(item.grade)} · ${label(item.equipmentType)} · Lv ${level}`,
    headBg: `linear-gradient(180deg, ${color}26, transparent)`, headBorder: `2px solid ${color}`,
    traits, hasTraits: traits.length > 0,
    unique, hasUnique: unique.length > 0,
    heroicEffects, hasHeroicEffects: heroicEffects.length > 0,
    resonance, hasResonance: resonance.length > 0,
    runes, hasRunes: isEquipmentSlot || runes.length > 0,
    synergyName: synergy?.name ?? "", synergyStats, hasSynergy: Boolean(synergy) && synergyStats.length > 0,
    effects, hasEffects: effects.length > 0,
    setInfo, hasSet: Boolean(setInfo),
    abilities, hasAbilities: abilities.length > 0,
    cores, hasCores: cores.length > 0, coreMoreLabel: coreMore > 0 ? `+${coreMore} more skill cores` : "", hasCoreMore: coreMore > 0,
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

export function skillCapForType(type) {
  return type === "passive" ? PASSIVE_SKILL_CAP : type === "defensive" ? 1 : ACTIVE_SKILL_CAP;
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
    return { skill, selection, loadoutType: selection.loadoutType ?? skillLoadoutType(skill) };
  }).filter((row) => row.skill);
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
// WM_Common_SKILL_* nodes are shared across weapons. The cap of 4 active
// nodes is assumed from imported reference builds (not extracted data).

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

export function calculateBuild(build, attributes) {
  const totals = new Map();
  const sourceMap = new Map();
  const add = (statId, value, sourceLabel, sourceType = "source", grade = 0, icon = "") => {
    const numeric = Number(value);
    if (!statId || !numeric || Number.isNaN(numeric)) return;
    for (const expandedId of STAT_EXPANSIONS[statId] ?? []) {
      add(expandedId, numeric, sourceLabel, sourceType, grade, icon);
    }
    totals.set(statId, (totals.get(statId) ?? 0) + numeric);
    if (!sourceMap.has(statId)) sourceMap.set(statId, []);
    sourceMap.get(statId).push({ sourceLabel, name: sourceLabel, value: numeric, type: sourceType, grade, icon });
  };
  const totalsObject = () => Object.fromEntries([...totals].map(([statId, total]) => [statId, { statId, total, sources: sourceMap.get(statId) ?? [] }]));
  const selections = allBuildSelectionEntries(build);
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
  for (const [statId, value] of Object.entries(attributes ?? {})) {
    add(statId, allocatedAttributeValue(value), "Allocated points", "attribute");
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

  for (const [masteryId, selected] of Object.entries(build.masteries ?? {})) {
    const mastery = data.masteries.find((entry) => entry.id === masteryId);
    const stats = mastery?.stats?.[Math.max(0, Number(selected.level || 1) - 1)];
    for (const row of values(stats)) add(row.statId, row.value, `Weapon Mastery: ${mastery.name}`, "weapon_specialization", mastery.grade, mastery.imageUrl);
  }

  const applyPhase = (phase) => applyQuestlogPhase(phase, build, selections, totalsObject, add);
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
    const attributeTotal = totals.get(attributeId) ?? 0;
    for (const [threshold, bonuses] of Object.entries(breakpoints)) {
      if (attributeTotal < Number(threshold)) continue;
      for (const [statId, value] of Object.entries(bonuses)) {
        add(statId, value, `${attributeId.toUpperCase()} (${threshold}): Bonus`, "attribute_bracket");
      }
    }
  }

  applyPhase(2);
  for (const { set, count } of activeSetCounts(selections)) {
    for (const bonus of values(set.itemSetBonus)) {
      const required = Number(bonus.set_count ?? bonus.setCount ?? 0);
      if (!required || count < required) continue;
      for (const row of values(bonus.bonus_stat ?? bonus.bonusStat)) add(row.type, row.value, `${set.name} Set`, "set_bonus");
    }
  }
  applyPhase(3);
  if (materialHpPercentage > 0) add("hp_max", (totals.get("hp_max") ?? 0) * materialHpPercentage / 100, "Material: Bonus", "material");
  applyPhase(4);
  applyPhase(5);
  applyPhase(6);

  const range = totals.get("attack_range_main_hand") ?? 0;
  const rangeModifier = totals.get("attack_range_modifier") ?? 0;
  if (range && rangeModifier) add("attack_range_main_hand", range * (rangeModifier / 10000), "Range Increase", "range");
  const speed = totals.get("attack_speed_main_hand") ?? 0;
  const speedModifier = totals.get("attack_speed_modifier") ?? 0;
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
    add("attack_power_main_hand", Math.floor(maxDamage * ratio) - Math.floor(minDamage * ratio), "Stellarite", "attack_power");
    add("bonus_attack_power_main_hand", Math.floor(minDamage * ratio), "Stellarite Bonus", "attack_power");
  }

  addDerivedTotal("attack_power_main_hand_min", totals.get("bonus_attack_power_main_hand") ?? 0, totals, sourceMap);
  addDerivedTotal("attack_power_main_hand_max", totals.get("attack_power_main_hand") ?? 0, totals, sourceMap);
  addDerivedTotal("attack_power_off_hand_min", totals.get("bonus_attack_power_off_hand") ?? 0, totals, sourceMap);
  addDerivedTotal("attack_power_off_hand_max", totals.get("attack_power_off_hand") ?? 0, totals, sourceMap);
  const runeSynergies = calculateRuneSynergies(build);
  return {
    stats: [...totals.entries()].map(([id, total]) => ({ id, total, sources: sourceMap.get(id) ?? [] })),
    runeSynergies,
    validation: validateBuild(runeSynergies, build),
  };
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
  const counts = new Map();
  for (const { item } of selections) if (item?.setId) counts.set(item.setId, (counts.get(item.setId) ?? 0) + 1);
  return [...counts].map(([setId, count]) => ({ set: indexes.itemSetById[setId], count })).filter((row) => row.set);
}

function applyQuestlogPhase(phase, build, selections, totalsObject, add) {
  for (const { slotId, selection, item } of selections) {
    const itemRule = ITEM_PASSIVE_RULES[item?.passives?.id];
    if (itemRule?.phase === phase) for (const row of itemRule.effect(totalsObject())) add(row.statId, row.value, item.passives.name, slotId, item.grade, item.passives.imageUrl);
    const perk = values(item?.availablePerks).find((entry) => entry.id === (selection?.perkId ?? selection?.perk));
    const perkRule = PERK_PASSIVE_RULES[perk?.passive?.id];
    // Guard: a rule id present in both tables (SkillSet_Unique_Accessory_Skill_01)
    // must not fire twice for the same item via innate passive AND slotted perk.
    const alreadyAppliedAsItemPassive = itemRule && perk?.passive?.id === item?.passives?.id;
    if (perkRule?.phase === phase && !alreadyAppliedAsItemPassive) for (const row of perkRule.effect(totalsObject())) add(row.statId, row.value, perk.passive.name, "skill_core", perk.grade, perk.passive.imageUrl);
  }
  for (const { set, count } of activeSetCounts(selections)) {
    for (const [required, rule] of Object.entries(SET_PASSIVE_RULES[set.id] ?? {})) {
      if (count >= Number(required) && rule.phase === phase) for (const row of rule.effect(totalsObject())) add(row.statId, row.value, set.name, "set_bonus");
    }
  }
  const masteryBuild = { specialization: Object.entries(build.masteries ?? {}).map(([id, row]) => ({ id, lvl: Number(row.level || 1) })) };
  for (const { skill, selection } of selectedSkillRows(build)) {
    const rule = PASSIVE_SKILL_RULES[skill.id];
    if (rule?.phase === phase) for (const row of rule.effect(selection.level, masteryBuild, totalsObject())) add(row.statId, row.value, skill.name, "skill_passive", skill.grade, skill.imageUrl);
  }
  for (const [masteryId, selected] of Object.entries(build.masteries ?? {})) {
    const rule = MASTERY_SYNERGY_RULES[masteryId];
    const mastery = data.masteries.find((entry) => entry.id === masteryId);
    if (rule?.phase === phase) for (const row of rule.effect(Number(selected.level || 1), totalsObject())) add(row.statId, row.value, mastery?.name ?? masteryId, "weapon_specialization_synergy", mastery?.grade, mastery?.imageUrl);
  }
  const unifiedIds = Array.isArray(build.unifiedMasteries) ? build.unifiedMasteries : Object.values(build.unifiedMasteries ?? {});
  for (const masteryId of unifiedIds) {
    const rule = UNIFIED_MASTERY_RULES[masteryId];
    const mastery = data.masteries.find((entry) => entry.id === masteryId);
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
  let equipmentPower = COMBAT_POWER.equipmentBase;
  const items = [];
  for (const { slotId, selection, item } of allBuildSelectionEntries(build)) {
    if (!item) continue;
    const power = itemCombatPower(item, selection, slotId);
    equipmentPower += power;
    items.push({ slotId, itemId: item.id, name: item.name, power });
  }
  const skillPower = selectedSkillRows(build).reduce((total, row) => total + Number(row.selection.level || 0) * COMBAT_POWER.skillPerLevel, 0);
  const masteryLevels = Object.values(build.masteries ?? {}).reduce((total, row) => total + Number(row.level || 0), 0);
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

function totalsWithSlotSelection(build, attributes, slotId, selection) {
  const clone = deepClone(build);
  slotCollectionForSlot(clone, slotId)[slotId] = selection
    ? { ...emptyEquipmentSelection(), ...deepClone(selection) }
    : emptyEquipmentSelection();
  const totals = {};
  for (const row of calculateBuild(clone, attributes ?? {}).stats) {
    if (row.total) totals[row.id] = row.total;
  }
  return totals;
}

// Total-stat delta of placing `selection` into `slotId` versus leaving the
// slot empty, with everything else in the build unchanged.
export function slotSelectionContribution(slotId, selection, build, attributes) {
  const cache = slotDeltaCacheFor(build, attributes);
  const key = `${slotId}|${JSON.stringify(selection ?? null)}`;
  if (cache.has(key)) return cache.get(key);
  const baselineKey = `${slotId}|<empty>`;
  let baseline = cache.get(baselineKey);
  if (!baseline) {
    baseline = totalsWithSlotSelection(build, attributes, slotId, null);
    cache.set(baselineKey, baseline);
  }
  const withSelection = selection?.itemId ? totalsWithSlotSelection(build, attributes, slotId, selection) : baseline;
  const delta = {};
  for (const id of new Set([...Object.keys(baseline), ...Object.keys(withSelection)])) {
    const value = (withSelection[id] ?? 0) - (baseline[id] ?? 0);
    if (Math.abs(value) > 1e-9) delta[id] = value;
  }
  cache.set(key, delta);
  return delta;
}

// Contribution of equipping `item` bare (as equipItem does) at `level`.
export function itemStatContribution(item, slotId, level, build, attributes) {
  if (!item) return {};
  return slotSelectionContribution(slotId, { itemId: item.id, level: Number(level) || 0 }, build, attributes);
}

export function statTotal(calc, statId) {
  return calc.stats.find((row) => row.id === statId)?.total ?? 0;
}

// ---------- validation ----------

export function validateBuild(runeSynergies, build) {
  const dataBacked = [];
  const assumed = [];
  const mainWeapon = indexes.itemById[build.equipment.main_hand?.itemId];
  const offWeapon = indexes.itemById[build.equipment.off_hand?.itemId];
  if (mainWeapon && offWeapon && mainWeapon.equipmentType === offWeapon.equipmentType) {
    dataBacked.push({ severity: "error", message: `Main Hand and Off Hand both use ${label(mainWeapon.equipmentType)}. Weapon pair rules disallow duplicate weapon types.` });
  }

  for (const [group, slots] of Object.entries(HEROIC_SLOT_GROUPS)) {
    const heroicItems = slots
      .map((slot) => ({ slot, item: indexes.itemById[build.equipment[slot]?.itemId] }))
      .filter((entry) => entry.item?.grade === HEROIC_GRADE);
    if (heroicItems.length > 1) {
      assumed.push({
        severity: "warning",
        message: `Assumed heroic cap: only one heroic ${group} should be equipped. Current slots: ${heroicItems.map((entry) => slotById(entry.slot).label).join(", ")}.`,
      });
    }
  }

  for (const [slot, selection] of Object.entries(build.equipment)) {
    const item = indexes.itemById[selection.itemId];
    if (!item) continue;
    const levels = getItemLevels(item);
    if (!levels.length) {
      dataBacked.push({ severity: "warning", message: `${slotById(slot).label} has no item level stat rows in the cached data.` });
      continue;
    }
    const selected = Number(selectedItemLevel(item, selection.level));
    const requested = Number(selection.level || levels.at(-1));
    if (selected !== requested) {
      dataBacked.push({ severity: "warning", message: `${slotById(slot).label} level ${requested} is not available for ${item.name}; totals use level ${selected}.` });
    }
  }

  for (const [slot, selection] of Object.entries(build.equipment)) {
    const rows = selection.runes ?? [];
    const category = runeCategoryForSlot(slot);
    const selectedRunes = rows.map((row) => indexes.runeById[row.runeId]).filter(Boolean);
    for (const rune of selectedRunes) {
      if (rune.equipmentCategory !== category) {
        dataBacked.push({ severity: "error", message: `${rune.name} is a ${label(rune.equipmentCategory)} rune but is slotted into ${slotById(slot).label}.` });
      }
    }
    const chaosCount = selectedRunes.filter((rune) => rune.runeType === "chaos").length;
    if (chaosCount > 1) {
      dataBacked.push({ severity: "error", message: `${slotById(slot).label} has ${chaosCount} Chaos runes. Only one Chaos rune may be equipped on an item.` });
    }
    if (selectedRunes.length === 3 && !runeSynergies[slot]) {
      dataBacked.push({ severity: "warning", message: `${slotById(slot).label} has three runes but no matching rune synergy in the cached table.` });
    }
  }

  const specSpent = skillSpecSpent(build);
  if (specSpent > SPEC_BUDGET) {
    dataBacked.push({ severity: "warning", message: `Skill specialization budget is over the assumed budget: ${specSpent}/${SPEC_BUDGET}.` });
  }

  const unmapped = unmappedRuleIssues(build);
  const issues = [...dataBacked, ...assumed, ...unmapped];
  const severityRank = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3));
  return { dataBacked, assumed, unmapped, issues };
}

// Rule tables are allowlists: any selected passive/set/perk/mastery effect
// without an entry silently contributes nothing to the totals. These were
// transcribed from Questlog's client, which applies the same allowlists, so
// an unmapped effect usually matches Questlog — but it must be visible, not
// silent. Grouped into one message per category to keep the panel compact.
function unmappedRuleIssues(build) {
  const info = (message) => ({ severity: "info", message });
  const issues = [];
  const grouped = (label, names) => {
    if (names.length) issues.push(info(`${names.length === 1 ? names[0] : `${names.length} ${label}`} selected but ${names.length === 1 ? "has" : "have"} no calculation rule — totals exclude ${names.length === 1 ? "it" : `them: ${names.join(", ")}`}. (Questlog's client applies no rule for these either.)`));
  };

  const selections = [
    ...Object.entries(build.equipment ?? {}),
    ...Object.entries(build.artifacts ?? {}),
    ...Object.entries(build.supportSlots ?? {}),
  ].map(([slotId, selection]) => ({ slotId, selection, item: indexes.itemById[selection?.itemId] }));

  // Armory totals describe the character's persistent numeric state. Triggered
  // effects, skill transformations, dispels, and other encounter behaviour do
  // not belong in that arithmetic, so the absence of a static rule is expected.
  const mayAffectStaticTotals = (effect) => {
    const text = String(effect?.text ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!text) return true;
    return !(
      /^(?:on|when|while|after|upon)\b/.test(text) ||
      /\b(?:chance to|remove \d+ buff|deals? .* damage|heals? |recovers? |appl(?:y|ies) |can now|now attacks?|cooldown -)\b/.test(text)
    );
  };

  const itemPassives = [];
  const perkPassives = [];
  for (const { selection, item } of selections) {
    if (!item) continue;
    if (item.passives?.id && !ITEM_PASSIVE_RULES[item.passives.id] && mayAffectStaticTotals(item.passives)) {
      itemPassives.push(`${item.passives.name ?? item.passives.id} (${item.name})`);
    }
    const perk = values(item.availablePerks).find((entry) => entry.id === selection?.perkId);
    if (perk && !PERK_PASSIVE_RULES[perk.passive?.id] && mayAffectStaticTotals(perk.passive)) {
      perkPassives.push(`${perk.passive?.name ?? perk.name ?? perk.id} (${item.name})`);
    }
  }
  grouped("item passives", [...new Set(itemPassives)]);
  grouped("skill cores", [...new Set(perkPassives)]);

  const setPassives = [];
  const counts = new Map();
  for (const { item } of selections) if (item?.setId) counts.set(item.setId, (counts.get(item.setId) ?? 0) + 1);
  for (const [setId, count] of counts) {
    const set = indexes.itemSetById[setId];
    for (const bonus of values(set?.itemSetBonus)) {
      const required = Number(bonus.set_count ?? bonus.setCount ?? 0);
      if (!required || count < required) continue;
      const hasPassive = values(bonus.bonus_passive ?? bonus.bonusPassive).length > 0;
      if (hasPassive && !SET_PASSIVE_RULES[set.id]?.[required]) setPassives.push(`${set.name} (${required} pc)`);
    }
  }
  grouped("set passives", setPassives);

  const passiveSkills = [];
  for (const { skill, loadoutType } of selectedSkillRows(build)) {
    if (loadoutType === "passive" && !PASSIVE_SKILL_RULES[skill.id]) passiveSkills.push(skill.name);
  }
  grouped("passive skills", passiveSkills);

  const synergyNodes = [];
  for (const [masteryId, selected] of Object.entries(build.masteries ?? {})) {
    const mastery = data.masteries.find((entry) => entry.id === masteryId);
    if (!mastery || MASTERY_SYNERGY_RULES[masteryId]) continue;
    const stats = values(mastery.stats?.[Math.max(0, Number(selected.level || 1) - 1)]);
    if (!stats.length) synergyNodes.push(mastery.name);
  }
  grouped("mastery nodes", synergyNodes);

  const unifiedIds = Array.isArray(build.unifiedMasteries) ? build.unifiedMasteries : Object.values(build.unifiedMasteries ?? {});
  const unifiedNodes = unifiedIds
    .filter((id) => id && !UNIFIED_MASTERY_RULES[id])
    .map((id) => data.masteries.find((entry) => entry.id === id)?.name ?? id);
  grouped("unified mastery nodes", unifiedNodes);

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
  return STAT_ALIASES[id] ?? (derivedQuestlogStatName(id) || data.statLabels[id] || label(id));
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
      selection.heroicEffects = [0, 1].map((groupIndex) => {
        const options = heroicEffectOptions(item, groupIndex);
        const option = preferences[groupIndex]
          .map((statId) => options.find((entry) => entry.statId === statId && !chosen.has(statId)))
          .find(Boolean)
          ?? options.find((entry) => !chosen.has(entry.statId))
          ?? options[0];
        if (option) chosen.add(option.statId);
        return option ? { statId: option.statId } : emptyHeroicEffect();
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
