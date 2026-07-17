// Curated ranked-goal presets for the build optimizer.
//
// Each preset bundles 3-5 maximize goals with hard "at least" floors so a
// generated build keeps the offensive or defensive baseline that hand-made
// meta builds always carry, instead of dumping everything into the top-ranked
// stat. Floor values are display-unit numbers calibrated at roughly 70% of
// the totals measured on highly rated public Questlog builds against game
// build 24118850 (2026-07-16 optimizer audit): top PvP evasion references held
// ~4,200 PvP accuracy and ~2,000 Heavy Attack Chance; PvE boss references held
// ~900-1,075 boss accuracy alongside their damage stats. Floors sit below
// those marks so the optimizer satisfies them and spends the remaining budget
// on the ranked goals.
//
// Stat ids use the "{family}" token where the correct stat depends on the
// build's main-hand weapon family (melee / range / magic). resolve() replaces
// the token; the "all" family is a valid fallback when no weapon is known.

const FAMILY_BY_WEAPON = {
  sword: "melee",
  sword2h: "melee",
  dagger: "melee",
  spear: "melee",
  gauntlet: "melee",
  bow: "range",
  crossbow: "range",
  staff: "magic",
  wand: "magic",
  orb: "magic",
};

export function weaponStatFamily(weaponType) {
  return FAMILY_BY_WEAPON[String(weaponType ?? "").toLowerCase()] ?? "all";
}

export const OPTIMIZER_PRESETS = [
  {
    id: "boss-dps",
    label: "Boss DPS",
    tagline: "Heavy Attack and Critical pressure for world bosses and dungeons, with hit and cooldown floors.",
    // Role glyph: an in-game skill icon shown on the preset chip. Purely
    // cosmetic — chips render without an icon if the id leaves the catalogue.
    iconSkillId: "SkillSet_WP_SW2_S_GaiaCrash",
    maximize: [
      "boss_{family}_double_attack",
      "boss_{family}_critical_attack",
      "skill_power_amplification",
      "critical_damage_dealt_modifier",
      "double_damage_dealt_modifier",
    ],
    floors: [
      { id: "boss_{family}_accuracy", display: 700 },
      { id: "skill_cooldown_modifier", display: 40 },
    ],
  },
  {
    id: "pvp-burst",
    label: "PvP Burst",
    tagline: "Critical and Heavy Attack burst for open-world PvP, with accuracy and survivability floors.",
    iconSkillId: "SkillSet_WP_DA_DA_S_DeadlyStrike",
    maximize: [
      "pvp_{family}_critical_attack",
      "pvp_{family}_double_attack",
      "critical_damage_dealt_modifier",
      "pvp_damage_dealt_modifier",
    ],
    floors: [
      { id: "pvp_{family}_accuracy", display: 3000 },
      { id: "hp_max", display: 38000 },
    ],
  },
  {
    id: "pvp-evasion",
    label: "PvP Evasion",
    tagline: "Evasion, health, and critical defense, while keeping enough accuracy and Heavy Attack to threaten.",
    iconSkillId: "SkillSet_WP_SW_SH_S_TheCloserEvasionUP",
    maximize: [
      "pvp_all_evasion",
      "hp_max",
      "pvp_all_critical_defense",
      "damage_reduction",
    ],
    floors: [
      { id: "pvp_{family}_accuracy", display: 3000 },
      { id: "pvp_{family}_double_attack", display: 1400 },
    ],
  },
  {
    id: "frontline-tank",
    label: "Frontline Tank",
    tagline: "Block, Endurance, and crowd-control resistance to anchor a fight, with enough accuracy to land your hits.",
    iconSkillId: "SkillSet_WP_SW_SH_S_ShieldThrow",
    maximize: [
      "hp_max",
      "pvp_all_double_defense",
      "shield_block_chance",
      "damage_reduction",
      "all_state_tolerance",
    ],
    floors: [
      { id: "pvp_{family}_accuracy", display: 3000 },
    ],
  },
  {
    id: "pvp-skirmisher",
    label: "PvP Skirmisher",
    tagline: "Evasion-first damage that slips answers while keeping crit pressure, with hit and health floors.",
    iconSkillId: "SkillSet_WP_DA_DA_S_MoveSkillEvasion",
    maximize: [
      "pvp_all_evasion",
      "pvp_{family}_critical_attack",
      "critical_damage_dealt_modifier",
      "pvp_damage_dealt_modifier",
    ],
    floors: [
      { id: "pvp_{family}_accuracy", display: 3000 },
      { id: "hp_max", display: 35000 },
    ],
  },
  {
    id: "support",
    label: "Support / Healer",
    tagline: "Healing output, cooldown speed, and buff duration, with a health floor to stay standing.",
    iconSkillId: "SkillSet_WP_WA_GR_S_Heal",
    maximize: [
      "heal_modifier",
      "skill_cooldown_modifier",
      "buff_given_duration_modifier",
      "cost_regen",
    ],
    floors: [
      { id: "hp_max", display: 35000 },
    ],
  },
];

const substitute = (id, family) => id.replaceAll("{family}", family);

export function resolveOptimizerPreset(presetId, { family = "all" } = {}) {
  const preset = OPTIMIZER_PRESETS.find((row) => row.id === presetId);
  if (!preset) throw new Error(`Unknown optimizer preset: ${presetId}`);
  const resolvedFamily = ["melee", "range", "magic", "all"].includes(family) ? family : "all";
  return {
    id: preset.id,
    label: preset.label,
    maximize: preset.maximize.map((id) => substitute(id, resolvedFamily)),
    floors: preset.floors.map((row) => ({ id: substitute(row.id, resolvedFamily), display: row.display })),
  };
}
