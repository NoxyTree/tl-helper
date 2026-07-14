// Stationary and movement-state scenario overlays for decoded build 24118850.
//
// Motion is a participant-owned snapshot assertion. This evaluator does not
// estimate uptime, replay movement, or infer a prior stationary qualification.

export const MOTION_EFFECT_GAME_BUILD = "24118850";

export const MOTION_EFFECT_IDS = Object.freeze({
  ASCETICISM: "SkillSet_WP_ST_S_ManaRegenBuff",
  RAPIDFIRE_STANCE: "SkillSet_WP_BO_S_InplaceAttack",
  BATTLE_TEMPO: "Bow_High_Tac_Skill",
  ARIDUS_FURY: "SkillSet_WP_Item_FieldBoss_T3_ST_02",
  STIGMA_EXECUTOR_4: "set_aa_t4_leather_001:4",
});

const ASCETICISM_MANA_REGEN_RAW = Object.freeze([
  32000, 37000, 42000, 48000, 53000, 58000, 63000, 69000, 74000, 79000,
  84000, 90000, 95000, 100000, 105000, 107000, 109000, 111000, 113000, 115000,
]);
const ASCETICISM_HEAVY_RAW = Object.freeze([
  1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000,
  1000, 1000, 1000, 1000, 1000, 1030, 1060, 1090, 1120, 1150,
]);
const RAPIDFIRE_SPEED_RAW = Object.freeze([
  600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500,
  1600, 1700, 1800, 1900, 2000, 2050, 2100, 2150, 2200, 2250,
]);
const BATTLE_TEMPO_SPEED_RAW = Object.freeze([
  720, 840, 960, 1080, 1200, 1320, 1440, 1560, 1680, 1800,
  1920, 2040, 2160, 2280, 2400, 2460, 2520, 2580, 2640, 2700,
]);

const decoded = (formulaRowIds, effectRowIds, extra = {}) => Object.freeze({
  gameBuild: MOTION_EFFECT_GAME_BUILD,
  authority: "decoded_exact",
  formulaRowIds: Object.freeze([...formulaRowIds]),
  effectRowIds: Object.freeze([...effectRowIds]),
  ...extra,
});

export const MOTION_EFFECT_DEFINITIONS = Object.freeze({
  [MOTION_EFFECT_IDS.ASCETICISM]: Object.freeze({
    name: "Asceticism",
    requiredWeapon: "staff",
    stationaryBand: "3s_to_under_4s",
    graceAfterOrdinaryMovement: true,
    movementSkillsDoNotCancel: true,
    provenance: decoded(
      ["ST_Passive_01_ManaRegen_Normal", "ST_Passive_01_ManaRegen_Double", "ST_Passive_01_ManaRegen_SecondTime"],
      ["WP_ST_S_ManaRegenBuff_Statup_Boost"],
      { abnormalStateId: "abn_WP_ST_S_ManaRegenBuff", stackCap: 1 },
    ),
  }),
  [MOTION_EFFECT_IDS.RAPIDFIRE_STANCE]: Object.freeze({
    name: "Rapidfire Stance",
    requiredWeapon: "bow",
    stationaryBand: "2s_to_under_3s",
    graceAfterOrdinaryMovement: true,
    movementSkillsDoNotCancel: true,
    provenance: decoded(
      ["BO_InplaceAttack_AttackSpeedUp", "BO_InplaceAttack_AccuracyUp", "BO_InplaceAttack_Duration"],
      ["WP_BO_InplaceAttack_Stabilize", "WP_BO_InplaceAttack_StatUp_On"],
      { abnormalStateId: "abn_WP_BO_InplaceAttack_Passive_StatUpBuff", stackCap: 1 },
    ),
  }),
  [MOTION_EFFECT_IDS.BATTLE_TEMPO]: Object.freeze({
    name: "Battle Tempo",
    requiredWeapon: "bow",
    replacesActivationFor: MOTION_EFFECT_IDS.RAPIDFIRE_STANCE,
    stationaryBand: "4s_or_more",
    graceAfterOrdinaryMovement: true,
    movementSkillsDoNotCancel: true,
    provenance: decoded(
      ["WM_BO_HIGH_TAC_InplaceAttack_AttackSpeedUp", "BO_InplaceAttack_AccuracyUp"],
      ["WP_BO_InplaceAttack_StatUp_On_WM"],
      { masteryNodeId: MOTION_EFFECT_IDS.BATTLE_TEMPO, abnormalStateId: "abn_WM_BO_HIGH_TAC_Passive_Buff", stackCap: 1 },
    ),
  }),
  [MOTION_EFFECT_IDS.ARIDUS_FURY]: Object.freeze({
    name: "Aridus's Fury",
    requiredWeapon: "staff",
    stationaryBand: "3s_to_under_4s",
    graceAfterOrdinaryMovement: true,
    movementSkillsDoNotCancel: false,
    provenance: decoded(
      ["WP_Item_Fieldboss_T3_ST_Stat"],
      ["WP_Item_FieldBoss_T3_ST_02_Stabilize", "WP_Item_FieldBoss_T3_ST_02_AdjustStat"],
      { abnormalStateId: "abn_WP_Item_FieldBoss_T3_ST_02", stackCap: 1 },
    ),
  }),
  [MOTION_EFFECT_IDS.STIGMA_EXECUTOR_4]: Object.freeze({
    name: "Stigma Executor Set",
    stationaryBand: "4s_or_more",
    removedOnMovement: true,
    provenance: decoded(
      ["Item_Passive_Set_leather_aa_T4_001_2_Stabilize", "Item_Passive_Set_leather_aa_T4_001_2_CriticalDamageDealtModifier2"],
      ["Item_Passive_Set_leather_aa_T4_001_2_Stabilize", "Item_Passive_Set_leather_aa_T4_001_2_AdjustStat2"],
      { itemSetBonusRow: 137, abnormalStateId: "abn_Item_Passive_Set_leather_aa_T4_001_2_AdjustStat2", stackCap: 1 },
    ),
  }),
});

const STATIONARY_RANK = Object.freeze({
  under_2s: 0,
  "2s_to_under_3s": 1,
  "3s_to_under_4s": 2,
  "4s_or_more": 3,
});

const error = (code, sourceId, message) => Object.freeze({ code, sourceId, message });
const trace = (code, sourceId, details = {}) => Object.freeze({ code, sourceId, ...details });

function selectedPassives(entries, traces, errors) {
  const relevantIds = new Set([MOTION_EFFECT_IDS.ASCETICISM, MOTION_EFFECT_IDS.RAPIDFIRE_STANCE]);
  const result = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || !relevantIds.has(entry.id)) continue;
    if (entry.selected !== true) {
      traces.push(trace("source_not_selected", entry.id));
      continue;
    }
    if (!Number.isInteger(entry.level) || entry.level < 1 || entry.level > 20) {
      errors.push(error("invalid_passive_level", entry.id, "Motion passive level must be an integer from 1 through 20."));
      continue;
    }
    const prior = result.get(entry.id);
    if (prior && prior.level !== entry.level) {
      result.set(entry.id, { conflicted: true });
      errors.push(error("conflicting_source_levels", entry.id, "Duplicate selected passive sources disagree on level."));
    } else if (prior) {
      traces.push(trace("source_deduplicated", entry.id));
    } else {
      result.set(entry.id, { level: entry.level });
    }
  }
  return result;
}

const ARIDUS_CARRIERS = Object.freeze({
  innate: Object.freeze({ itemId: "staff_aa_t3_boss_002" }),
  selected_core: Object.freeze({ itemId: "staff_aa_t2_raid_001", perkId: "perk_staff_aa_t3_boss_002" }),
});

function activeItemKinds(entries, effectId, traces, errors) {
  const kinds = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || entry.id !== effectId) continue;
    if (entry.sourceKind === "selected_core" && entry.selected !== true) {
      traces.push(trace("source_not_selected", effectId, { sourceKind: entry.sourceKind }));
      continue;
    }
    if (!new Set(["innate", "selected_core"]).has(entry.sourceKind)) {
      errors.push(error("invalid_item_source_kind", effectId, "Motion item effect must be an innate or selected_core source."));
      continue;
    }
    const carrier = ARIDUS_CARRIERS[entry.sourceKind];
    if (entry.itemId !== carrier.itemId || (carrier.perkId && entry.perkId !== carrier.perkId)) {
      errors.push(error("invalid_item_effect_carrier", effectId, "Aridus's Fury source does not match a decoded innate item or selectable Skill Core carrier."));
      continue;
    }
    if (kinds.size) traces.push(trace("source_deduplicated", effectId));
    kinds.add(entry.sourceKind);
  }
  return Object.freeze([...kinds].sort());
}

function motionDecision(motion, definition) {
  if (!motion || motion.state === "unspecified") return { unknown: true, reason: "motion_unspecified" };
  if (motion.state === "stationary") {
    return {
      active: STATIONARY_RANK[motion.stationaryBand] >= STATIONARY_RANK[definition.stationaryBand],
      branch: "stationary",
    };
  }
  if (definition.removedOnMovement) return { active: false, branch: "removed_on_movement" };
  const qualified = motion.priorStationaryBand === "unspecified"
    ? null
    : STATIONARY_RANK[motion.priorStationaryBand] >= STATIONARY_RANK[definition.stationaryBand];
  if (qualified === null) return { unknown: true, reason: "prior_stationary_unspecified" };
  if (!qualified) return { active: false, branch: "prior_stationary_not_qualified" };
  if (motion.movementKind === "movement_skill" && definition.movementSkillsDoNotCancel) {
    return { active: true, branch: "movement_skill_not_cancelled" };
  }
  if (motion.movingBand === "unspecified") return { unknown: true, reason: "moving_duration_unspecified" };
  return { active: definition.graceAfterOrdinaryMovement === true && motion.movingBand === "under_2s", branch: "post_move_grace" };
}

function overlayRow(effectId, sourceKinds, statId, rawValue, sourceMotion, branch, extra = {}) {
  const definition = MOTION_EFFECT_DEFINITIONS[effectId];
  return Object.freeze({
    effectId,
    effectName: definition.name,
    sourceKinds: Object.freeze([...sourceKinds]),
    statId,
    operation: "add",
    rawValue,
    scope: "source_motion",
    scenario: Object.freeze({ sourceMotion, branch }),
    calculation: Object.freeze({ formulaType: "kAmountFromMinMax", rawValue, branch, ...extra }),
    precision: Object.freeze({ authority: "decoded_exact", arithmetic: "integer_raw_units", rounding: "none", staticTotalsMutated: false }),
    provenance: definition.provenance,
  });
}

function applyDecision({ effectId, sourceKinds, motion, overlayRows, traces, errors, emit }) {
  const decision = motionDecision(motion, MOTION_EFFECT_DEFINITIONS[effectId]);
  if (decision.unknown) {
    errors.push(error("insufficient_source_motion", effectId, `${MOTION_EFFECT_DEFINITIONS[effectId].name} requires a complete source motion assertion.`));
    traces.push(trace("effect_failed_closed", effectId, { reason: decision.reason }));
    return;
  }
  if (!decision.active) {
    traces.push(trace("motion_condition_inactive", effectId, { branch: decision.branch, sourceMotion: motion }));
    return;
  }
  emit(decision.branch, (statId, rawValue, extra) => overlayRows.push(overlayRow(effectId, sourceKinds, statId, rawValue, motion, decision.branch, extra)));
}

/** Evaluate exact stationary and post-move effects without estimating uptime. */
export function evaluateMotionScenarioEffects({ activeSources = {}, scenario = {} } = {}) {
  const overlayRows = [];
  const traces = [];
  const errors = [];
  const weapons = new Set(Array.isArray(activeSources.equippedWeaponTypes) ? activeSources.equippedWeaponTypes.map((value) => String(value).toLowerCase()) : []);
  const passives = selectedPassives(activeSources.passiveSkills, traces, errors);
  const masteryIds = new Set(Array.isArray(activeSources.masteryIds) ? activeSources.masteryIds.filter((id) => typeof id === "string") : []);
  const aridusKinds = activeItemKinds(activeSources.itemEffects, MOTION_EFFECT_IDS.ARIDUS_FURY, traces, errors);
  const setBreakpoints = new Set(Array.isArray(activeSources.setBreakpoints) ? activeSources.setBreakpoints.filter((id) => typeof id === "string") : []);
  const motion = scenario.sourceMotion;

  for (const [effectId, requiredWeapon] of [[MOTION_EFFECT_IDS.ASCETICISM, "staff"], [MOTION_EFFECT_IDS.RAPIDFIRE_STANCE, "bow"]]) {
    if (passives.has(effectId) && !weapons.has(requiredWeapon)) {
      errors.push(error("foreign_weapon_passive", effectId, `${MOTION_EFFECT_DEFINITIONS[effectId].name} requires an equipped ${requiredWeapon}.`));
      passives.delete(effectId);
    }
  }
  if (masteryIds.has(MOTION_EFFECT_IDS.BATTLE_TEMPO) && !weapons.has("bow")) {
    errors.push(error("foreign_weapon_mastery", MOTION_EFFECT_IDS.BATTLE_TEMPO, "Battle Tempo requires an equipped bow."));
    masteryIds.delete(MOTION_EFFECT_IDS.BATTLE_TEMPO);
  }
  if (aridusKinds.length && !weapons.has("staff")) {
    errors.push(error("foreign_weapon_item_effect", MOTION_EFFECT_IDS.ARIDUS_FURY, "Aridus's Fury requires an equipped staff."));
  }

  const asceticism = passives.get(MOTION_EFFECT_IDS.ASCETICISM);
  if (asceticism && !asceticism.conflicted) {
    applyDecision({
      effectId: MOTION_EFFECT_IDS.ASCETICISM,
      sourceKinds: ["selected_passive"],
      motion, overlayRows, traces, errors,
      emit: (branch, add) => {
        add("cost_regen", ASCETICISM_MANA_REGEN_RAW[asceticism.level - 1], { level: asceticism.level });
        add("all_double_attack", ASCETICISM_HEAVY_RAW[asceticism.level - 1], { level: asceticism.level });
      },
    });
  }

  const rapidfire = passives.get(MOTION_EFFECT_IDS.RAPIDFIRE_STANCE);
  if (rapidfire && !rapidfire.conflicted) {
    const battleTempo = masteryIds.has(MOTION_EFFECT_IDS.BATTLE_TEMPO);
    const effectId = battleTempo ? MOTION_EFFECT_IDS.BATTLE_TEMPO : MOTION_EFFECT_IDS.RAPIDFIRE_STANCE;
    applyDecision({
      effectId,
      sourceKinds: ["selected_passive", ...(battleTempo ? ["mastery_replacement"] : [])],
      motion, overlayRows, traces, errors,
      emit: (branch, add) => {
        add("attack_speed_modifier", (battleTempo ? BATTLE_TEMPO_SPEED_RAW : RAPIDFIRE_SPEED_RAW)[rapidfire.level - 1], { level: rapidfire.level, passiveId: MOTION_EFFECT_IDS.RAPIDFIRE_STANCE });
        add("all_accuracy", 1000, { level: rapidfire.level, passiveId: MOTION_EFFECT_IDS.RAPIDFIRE_STANCE });
      },
    });
  } else if (masteryIds.has(MOTION_EFFECT_IDS.BATTLE_TEMPO)) {
    traces.push(trace("replacement_source_absent", MOTION_EFFECT_IDS.BATTLE_TEMPO, { requiredPassiveId: MOTION_EFFECT_IDS.RAPIDFIRE_STANCE }));
  }

  if (aridusKinds.length && weapons.has("staff")) {
    applyDecision({
      effectId: MOTION_EFFECT_IDS.ARIDUS_FURY,
      sourceKinds: aridusKinds,
      motion, overlayRows, traces, errors,
      emit: (branch, add) => add("attack_power_modifier", 1200),
    });
  }

  if (setBreakpoints.has(MOTION_EFFECT_IDS.STIGMA_EXECUTOR_4)) {
    applyDecision({
      effectId: MOTION_EFFECT_IDS.STIGMA_EXECUTOR_4,
      sourceKinds: ["set_breakpoint"],
      motion, overlayRows, traces, errors,
      emit: (branch, add) => add("critical_damage_dealt_modifier", 1500),
    });
  }

  return Object.freeze({ overlayRows: Object.freeze(overlayRows), trace: Object.freeze(traces), errors: Object.freeze(errors) });
}
