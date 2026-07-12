import { STAT_UNIT_MODIFIERS } from "../../web/tl-questlog-rules.js";

// Player-facing names verified against the Questlog-compatible calculator or
// the local Questlog projection. Raw game IDs remain the lookup keys.
export const QUESTLOG_STAT_LABELS = Object.freeze({
  str: "Strength",
  dex: "Dexterity",
  int: "Wisdom",
  per: "Perception",
  con: "Fortitude",
  hp_max: "Max Health",
  hp_regen: "Health Regen",
  cost_max: "Max Mana",
  cost_regen: "Mana Regen",
  cost_consumption_modifier: "Mana Cost Efficiency",
  stamina_regen: "Stamina Regen",
  attack_power_main_hand_min: "Main Weapon Min Damage",
  attack_power_main_hand_max: "Main Weapon Max Damage",
  attack_power_off_hand_min: "Off-Hand Weapon Min Damage",
  attack_power_off_hand_max: "Off-Hand Weapon Max Damage",
  bonus_attack_power_main_hand: "Main Weapon Bonus Attack Power",
  bonus_attack_power_off_hand: "Off-Hand Weapon Bonus Attack Power",
  attack_speed_modifier: "Attack Speed",
  skill_cooldown_modifier: "Cooldown Speed",
  damage_reduction: "Damage Reduction",
  damage_reduction_penetration: "Bonus Damage",
  shield_block_chance: "Block Chance",
  shield_block_chance_penetration: "Block Chance Penetration",
  critical_damage_taken_modifier: "Critical Damage Resistance",
  double_damage_dealt_modifier: "Heavy Attack Damage",
  double_damage_taken_modifier: "Heavy Attack Damage Resistance",
  buff_given_duration_modifier: "Buff Duration",
  debuff_taken_duration_modifier: "Debuff Duration",
  all_state_accuracy: "CC Chance",
  all_state_tolerance: "CC Resistance",
  bind_accuracy: "Bind Chance",
  bind_tolerance: "Bind Resistance",
  blind_accuracy: "Fear Chance",
  blind_tolerance: "Fear Resistance",
  collide_amplification: "Collision Chance",
  collide_resistance: "Collision Resistance",
  collision_resistance: "Collision Resistance",
  petrification_accuracy: "Petrification Chance",
  petrification_tolerance: "Petrification Resistance",
  silence_accuracy: "Silence Chance",
  silence_tolerance: "Silence Resistance",
  sleep_accuracy: "Sleep Chance",
  sleep_tolerance: "Sleep Resistance",
  stun_accuracy: "Stun Chance",
  stun_tolerance: "Stun Resistance",
  weaken_accuracy: "Weaken Chance",
  weaken_tolerance: "Weaken Resistance",
  all_species_damage_amplification: "Species Damage Boost",
  all_species_damage_resistance: "Species Damage Resistance",
  grankus_damage_amplification: "Humanoid Damage Boost",
  grankus_damage_reduction: "Humanoid Damage Reduction",
  grankus_damage_resistance: "Humanoid Damage Resistance",
  animal_damage_amplification: "Wildkin Damage Boost",
  animal_damage_reduction: "Wildkin Damage Reduction",
  animal_damage_resistance: "Wildkin Damage Resistance",
  creation_damage_amplification: "Construct Damage Boost",
  creation_damage_reduction: "Construct Damage Reduction",
  creation_damage_resistance: "Construct Damage Resistance",
  demon_damage_amplification: "Demon Damage Boost",
  demon_damage_reduction: "Demon Damage Reduction",
  demon_damage_resistance: "Demon Damage Resistance",
  undead_damage_amplification: "Undead Damage Boost",
  undead_damage_reduction: "Undead Damage Reduction",
  undead_damage_resistance: "Undead Damage Resistance",
  bonus_grankus_attack_power: "Bonus Humanoid Attack Power",
  bonus_animal_attack_power: "Bonus Wildkin Attack Power",
  bonus_creation_attack_power: "Bonus Construct Attack Power",
  bonus_demon_attack_power: "Bonus Demon Attack Power",
  bonus_undead_attack_power: "Bonus Undead Attack Power",
});

const RAW_ID_ALIASES = Object.freeze({
  collision_resistance: "collide_resistance",
  melee_heavy_attack: "melee_double_attack",
  range_heavy_attack: "range_double_attack",
  ranged_heavy_attack: "range_double_attack",
  magic_heavy_attack: "magic_double_attack",
});

const METRICS = Object.freeze({
  accuracy: { canonical: "hit_chance", label: "Hit Chance", relationship: "chance", unit: "points", scale: 0.1 },
  armor: { canonical: "defense", label: "Defense", relationship: "defense", unit: "points", scale: 1 },
  critical_attack: { canonical: "critical_hit_chance", label: "Critical Hit Chance", relationship: "chance", unit: "points", scale: 0.1 },
  critical_defense: { canonical: "endurance", label: "Endurance", relationship: "defense", unit: "points", scale: 0.1 },
  double_attack: { canonical: "heavy_attack_chance", label: "Heavy Attack Chance", relationship: "chance", unit: "points", scale: 0.1 },
  double_defense: { canonical: "heavy_attack_evasion", label: "Heavy Attack Evasion", relationship: "defense", unit: "points", scale: 0.1 },
  evasion: { canonical: "evasion", label: "Evasion", relationship: "defense", unit: "points", scale: 0.1 },
});

const CONTEXT_LABELS = Object.freeze({ pvp: "PvP", boss: "Boss", front: "Front", side: "Side", rear: "Back" });
const SCOPE_LABELS = Object.freeze({ all: "", melee: "Melee", range: "Ranged", magic: "Magic" });
const CONDITION_LABELS = Object.freeze({ weaken: "Weaken", stun: "Stun", petrification: "Petrification", sleep: "Sleep", silence: "Silence", bind: "Bind", blind: "Fear" });

function titleCase(rawStatId) {
  return String(rawStatId)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bHp\b/g, "HP")
    .replace(/\bMp\b/g, "MP")
    .replace(/\bPvp\b/g, "PvP")
    .replace(/\bPve\b/g, "PvE");
}

function parseContestStat(normalizedRawId) {
  const match = normalizedRawId.match(/^(?:(pvp|boss|front|side|rear|weaken|stun|petrification|sleep|silence|bind|blind)_)?(?:(all|melee|range|magic)_)?(accuracy|armor|critical_attack|critical_defense|double_attack|double_defense|evasion)$/);
  if (!match) return null;
  const [, contextPrefix = "", scopePrefix = "all", metricId] = match;
  const metric = METRICS[metricId];
  const context = contextPrefix === "pvp" ? "pvp"
      : contextPrefix === "boss" ? "boss"
      : ["front", "side", "rear"].includes(contextPrefix) ? "directional"
        : Object.hasOwn(CONDITION_LABELS, contextPrefix) ? "conditional"
        : "base";
  const conditional = context === "conditional";
  return {
    canonicalStatId: metric.canonical,
    displayName: [CONTEXT_LABELS[contextPrefix] ?? CONDITION_LABELS[contextPrefix], SCOPE_LABELS[scopePrefix], metric.label].filter(Boolean).join(" "),
    unit: metric.unit,
    scale: metric.scale,
    attackScope: scopePrefix,
    context,
    direction: context === "directional" ? contextPrefix : null,
    condition: conditional ? contextPrefix : null,
    relationship: metric.relationship,
    source: conditional ? "raw-derived-pattern" : "questlog-derived-pattern",
    labelSource: conditional ? "raw-derived-pattern" : "questlog-derived-pattern",
    labelStatus: conditional ? "provisional" : "verified",
  };
}

function inferScaleAndUnit(rawStatId) {
  if (["attack_speed", "attack_speed_main_hand", "attack_speed_off_hand"].includes(rawStatId)) return { unit: "seconds", scale: 0.001 };
  if (["attack_range", "attack_range_main_hand", "attack_range_off_hand"].includes(rawStatId)) return { unit: "metres", scale: 0.01 };
  if (["shield_block_chance", "block_chance", "shield_block_chance_penetration"].includes(rawStatId)) return { unit: "percent", scale: 0.01 };
  if (["cost_regen", "hp_regen", "stamina_regen"].includes(rawStatId)) return { unit: "points", scale: 0.001 };
  if (/(?:accuracy|tolerance)$/.test(rawStatId) && /^(?:bind|blind|collide|collision|petrification|silence|sleep|stun|weaken)_/.test(rawStatId)) return { unit: "points", scale: 0.025 };
  if (rawStatId.endsWith("_modifier") || rawStatId.includes("duration_modifier")) return { unit: "percent", scale: 0.01 };
  const scale = STAT_UNIT_MODIFIERS[rawStatId];
  return { unit: "points", scale: scale ?? 1 };
}

function inferRelationship(rawStatId) {
  if (rawStatId === "double_damage_dealt_modifier") return "damage_modifier";
  if (rawStatId === "double_damage_taken_modifier") return "damage_resistance";
  if (/(?:accuracy|amplification|chance)$/.test(rawStatId)) return "chance";
  if (/(?:defense|evasion|armor|tolerance|resistance|reduction)$/.test(rawStatId)) return "defense";
  if (/(?:damage|attack_power|power_amplification)/.test(rawStatId)) return "damage_modifier";
  if (/(?:heal)/.test(rawStatId)) return "healing_modifier";
  if (/(?:shield)/.test(rawStatId)) return "shield_modifier";
  if (/(?:regen|cost_max|hp_max|stamina_max)/.test(rawStatId)) return "resource";
  if (["str", "dex", "int", "per", "con"].includes(rawStatId)) return "attribute";
  return "other";
}

export function resolveStatTaxonomy(rawStatId, options = {}) {
  const rawId = String(rawStatId ?? "").trim();
  if (!rawId) throw new TypeError("rawStatId must be a non-empty string");
  const normalizedRawId = RAW_ID_ALIASES[rawId] ?? rawId;
  const contest = parseContestStat(normalizedRawId);
  if (contest) return Object.freeze({ rawStatId: rawId, normalizedRawId, ...contest });

  const knownLabel = QUESTLOG_STAT_LABELS[rawId] ?? QUESTLOG_STAT_LABELS[normalizedRawId];
  const localLabel = String(options.localLabel ?? "").trim();
  const { unit, scale } = inferScaleAndUnit(normalizedRawId);
  const context = normalizedRawId.startsWith("pvp_") ? "pvp"
    : normalizedRawId.startsWith("boss_") ? "boss"
      : /^(?:front|side|rear)_/.test(normalizedRawId) ? "directional"
        : "base";
  const attackScope = /^(?:pvp_|boss_|front_|side_|rear_)?(melee|range|magic)_/.exec(normalizedRawId)?.[1] ?? "all";

  const labelSource = knownLabel ? "questlog-compatible-calculator" : localLabel ? "local-projection" : "generated-fallback";
  return Object.freeze({
    rawStatId: rawId,
    normalizedRawId,
    canonicalStatId: normalizedRawId,
    displayName: knownLabel || localLabel || titleCase(normalizedRawId),
    unit,
    scale,
    attackScope,
    context,
    direction: context === "directional" ? normalizedRawId.split("_", 1)[0] : null,
    condition: null,
    relationship: inferRelationship(normalizedRawId),
    source: labelSource,
    labelSource,
    labelStatus: knownLabel ? "verified" : localLabel ? "provisional" : "unresolved",
  });
}

export function buildStatTaxonomy(rawStatIds, localLabels = {}) {
  return Object.fromEntries([...new Set(rawStatIds)].sort().map((rawStatId) => [
    rawStatId,
    resolveStatTaxonomy(rawStatId, { localLabel: localLabels[rawStatId] }),
  ]));
}
