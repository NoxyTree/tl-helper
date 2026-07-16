// Exact decoded Distorted Sanctuary data for game build 24118850.
//
// The persistent calculator owns the one-member baseline. Social scenario
// evaluation adds only the remainder for other qualifying party members, so
// these arrays are deliberately per-member rather than cumulative totals.

export const DISTORTED_SANCTUARY_GAME_BUILD = "24118850";

export const DISTORTED_SANCTUARY_IDS = Object.freeze({
  PASSIVE: "SkillSet_WP_BO_S_AuraDefenceUp",
  COMBAT_SANCTUARY: "Bow_Normal_Tac_Skill",
});

export const DISTORTED_SANCTUARY_ENDURANCE_RAW_PER_MEMBER = Object.freeze([
  180, 210, 240, 270, 300, 330, 360, 390, 420, 450,
  480, 510, 540, 570, 600, 612, 624, 636, 648, 660,
]);

export const DISTORTED_SANCTUARY_HEAL_OVER_TIME_RAW_PER_MEMBER = Object.freeze([
  ...DISTORTED_SANCTUARY_ENDURANCE_RAW_PER_MEMBER,
]);

export const COMBAT_SANCTUARY_ACCURACY_RAW_PER_MEMBER = Object.freeze([
  120, 140, 160, 180, 200, 220, 240, 260, 280, 300,
  320, 340, 360, 380, 400, 408, 416, 424, 432, 440,
]);

export const COMBAT_SANCTUARY_ATTACK_RANGE_RAW_PER_MEMBER = Object.freeze([
  28, 31, 34, 37, 40, 43, 46, 49, 52, 55,
  58, 61, 64, 67, 70, 71, 72, 73, 74, 75,
]);

const partyRows = (prefix) => Object.freeze(
  Array.from({ length: 6 }, (_, index) => `${prefix}_${String(index + 1).padStart(2, "0")}`),
);
const combatRows = (prefix) => Object.freeze(
  Array.from({ length: 6 }, (_, index) => `${prefix}_${index + 1}`),
);

export const DISTORTED_SANCTUARY_PROVENANCE = Object.freeze({
  gameBuild: DISTORTED_SANCTUARY_GAME_BUILD,
  authority: "decoded_exact_cumulative_party_count",
  recipientRule: "party_members_including_source_within_16m",
  minimumTotalPartyMembers: 1,
  maximumTotalPartyMembers: 6,
  formulaRowIds: Object.freeze([
    ...partyRows("BO_AuraDefenceUp_CriticalDefenceUp_Party"),
    ...partyRows("BO_AuraDefenceUp_ContinuousHealUp_Party"),
  ]),
  abnormalStateId: "abn_WP_BO_AuraDefenceUp_Aura_Effect",
  stackCap: 1,
});

export const COMBAT_SANCTUARY_PROVENANCE = Object.freeze({
  gameBuild: DISTORTED_SANCTUARY_GAME_BUILD,
  authority: "decoded_exact_replacement_cumulative_party_count",
  replaces: Object.freeze(["all_critical_defense", "continuous_heal_modifier"]),
  formulaRowIds: Object.freeze([
    ...combatRows("WM_BO_Normal_TAC_Accuracy"),
    ...combatRows("WM_BO_Normal_TAC_AttackRange"),
  ]),
  masteryNodeId: DISTORTED_SANCTUARY_IDS.COMBAT_SANCTUARY,
});

export function distortedSanctuaryPerMemberRows(level, combatSanctuary = false) {
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new RangeError("Distorted Sanctuary level must be an integer from 1 through 20.");
  }
  const index = level - 1;
  return combatSanctuary
    ? Object.freeze([
      Object.freeze({ statId: "all_accuracy", rawValue: COMBAT_SANCTUARY_ACCURACY_RAW_PER_MEMBER[index] }),
      Object.freeze({ statId: "attack_range_modifier", rawValue: COMBAT_SANCTUARY_ATTACK_RANGE_RAW_PER_MEMBER[index] }),
    ])
    : Object.freeze([
      Object.freeze({ statId: "all_critical_defense", rawValue: DISTORTED_SANCTUARY_ENDURANCE_RAW_PER_MEMBER[index] }),
      Object.freeze({ statId: "continuous_heal_modifier", rawValue: DISTORTED_SANCTUARY_HEAL_OVER_TIME_RAW_PER_MEMBER[index] }),
    ]);
}
