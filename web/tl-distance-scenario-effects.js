// Distance-scoped scenario overlays for decoded build 24118850.
//
// This module deliberately does not mutate or merge into persistent build totals.
// It projects decoded kAmountFromDistance coefficients against an explicit target
// distance and returns separate overlay rows. Fractional metres are continuous:
// no whole-metre floor is applied because the decoded formula is distance-scaled,
// not a threshold/count formula. No server-side rounding is claimed.

export const DISTANCE_EFFECT_GAME_BUILD = "24118850";

export const DISTANCE_EFFECT_IDS = Object.freeze({
  SNIPERS_SENSE: "SkillSet_WP_BO_S_DistanceCritical",
  FAR_SIGHT: "Bow_Normal_Attack_Skill",
  EAGLE_VISION: "SkillSet_WP_CR_CR_S_DistanceRangeAcc",
  PREDATORS_FOCUS: "Crossbow_Normal_Util_Skill",
  BLACK_RAGE: "SkillSet_WP_Item_kA_ST_55",
});

const SNIPER_CRITICAL_RAW_PER_METER = Object.freeze([
  100, 110, 120, 130, 140, 150, 160, 170, 180, 190,
  200, 210, 220, 230, 240, 245, 250, 255, 260, 265,
]);
const FAR_SIGHT_CRITICAL_RAW_PER_METER = Object.freeze([
  120, 132, 144, 156, 168, 180, 192, 204, 216, 228,
  240, 252, 264, 276, 288, 294, 300, 306, 312, 318,
]);
const EAGLE_ACCURACY_RAW_PER_METER = Object.freeze([
  60, 70, 80, 90, 100, 110, 120, 130, 140, 150,
  160, 170, 180, 190, 200, 205, 210, 215, 220, 225,
]);

const decodedFormula = (formulaRowIds, effectRowIds, extra = {}) => Object.freeze({
  gameBuild: DISTANCE_EFFECT_GAME_BUILD,
  authority: "decoded_exact_coefficients",
  formulaType: "EFormulaType::kAmountFromDistance",
  formulaRowIds: Object.freeze([...formulaRowIds]),
  effectRowIds: Object.freeze([...effectRowIds]),
  ...extra,
});

export const DISTANCE_EFFECT_DEFINITIONS = Object.freeze({
  [DISTANCE_EFFECT_IDS.SNIPERS_SENSE]: Object.freeze({
    name: "Sniper's Sense",
    requiredWeapon: "bow",
    skillRowId: "WP_BO_S_DistanceCritical",
    criticalRawPerMeter: SNIPER_CRITICAL_RAW_PER_METER,
    criticalDamageRawPerMeter: 40,
    provenance: decodedFormula(
      ["BO_DistanceCritical_CriticalChanceUp", "BO_DistanceCritical_Special_CriticalDamageUp"],
      ["WP_BO_DistanceCritical_BoostStatByDistance", "WP_BO_DistanceCritical_BoostStatByDistance_copy"],
      { abnormalStateId: "abn_WP_BO_DistanceCritical" },
    ),
  }),
  [DISTANCE_EFFECT_IDS.FAR_SIGHT]: Object.freeze({
    name: "Far Sight",
    requiredWeapon: "bow",
    replaces: DISTANCE_EFFECT_IDS.SNIPERS_SENSE,
    minimumDistanceMeters: 6,
    criticalRawPerMeter: FAR_SIGHT_CRITICAL_RAW_PER_METER,
    provenance: decodedFormula(
      ["WM_BO_Normal_ATK_DistanceCritical_CriticalChanceUp"],
      ["WP_BO_DistanceCritical_BoostStatByDistance"],
      { masteryNodeId: DISTANCE_EFFECT_IDS.FAR_SIGHT },
    ),
  }),
  [DISTANCE_EFFECT_IDS.EAGLE_VISION]: Object.freeze({
    name: "Eagle Vision",
    requiredWeapon: "crossbow",
    skillRowId: "WP_CR_CR_S_DistanceRangeAcc",
    accuracyBaseRaw: 400,
    accuracyRawPerMeter: EAGLE_ACCURACY_RAW_PER_METER,
    weakenRawPerMeter: 200,
    provenance: decodedFormula(
      ["CR_DistanceRangeAcc_AccuracyUp_by_Distance", "CR_DistanceRangeAcc_Special_WeakenUp_by_Distance"],
      ["WP_CR_DistanceRangeAcc_Buff", "WP_CR_DistanceRangeAcc_AccuracyUp"],
      { abnormalStateId: "abn_WP_CR_DistanceRangeAcc" },
    ),
  }),
  [DISTANCE_EFFECT_IDS.PREDATORS_FOCUS]: Object.freeze({
    name: "Predator's Focus",
    requiredWeapon: "crossbow",
    replaces: DISTANCE_EFFECT_IDS.EAGLE_VISION,
    executable: false,
    unsupportedReason: "nearby_opponent_positions_not_in_scenario",
    provenance: Object.freeze({
      gameBuild: DISTANCE_EFFECT_GAME_BUILD,
      authority: "decoded_condition_unimplemented",
      masteryNodeId: DISTANCE_EFFECT_IDS.PREDATORS_FOCUS,
    }),
  }),
  [DISTANCE_EFFECT_IDS.BLACK_RAGE]: Object.freeze({
    name: "Black Rage's Boost",
    requiredWeapon: "staff",
    skillRowId: "WP_Item_kA_ST_55",
    criticalRawPerMeter: 200,
    provenance: decodedFormula(
      ["WP_Item_kA_ST_55_CriticalAttack"],
      ["WP_Item_kA_ST_55_BoostStatByDistance", "WP_Item_kA_ST_55_Distance"],
      { abnormalStateId: "abn_WP_Item_kA_ST_55_Distance" },
    ),
  }),
});

const PRECISION = Object.freeze({
  coefficientAuthority: "decoded_exact",
  projection: "continuous_fractional_meters",
  arithmetic: "javascript_binary64",
  rounding: "none",
  staticTotalsMutated: false,
});

const error = (code, sourceId, message) => Object.freeze({ code, sourceId, message });
const trace = (code, sourceId, details = {}) => Object.freeze({ code, sourceId, ...details });

function normalizeStringSet(value) {
  return new Set(Array.isArray(value) ? value.filter((entry) => typeof entry === "string").map((entry) => entry.toLowerCase()) : []);
}

function selectedMasteries(activeSources) {
  return new Set(Array.isArray(activeSources?.masteryIds) ? activeSources.masteryIds.filter((id) => typeof id === "string") : []);
}

function dedupePassives(entries, traces, errors) {
  const relevant = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || ![DISTANCE_EFFECT_IDS.SNIPERS_SENSE, DISTANCE_EFFECT_IDS.EAGLE_VISION].includes(entry.id)) continue;
    if (entry.selected !== true) {
      traces.push(trace("source_not_selected", entry.id));
      continue;
    }
    if (!Number.isInteger(entry.level) || entry.level < 1 || entry.level > 20) {
      errors.push(error("invalid_passive_level", entry.id, "Distance passive level must be an integer from 1 through 20."));
      continue;
    }
    const prior = relevant.get(entry.id);
    if (prior && prior.level !== entry.level) {
      relevant.set(entry.id, { conflicted: true });
      errors.push(error("conflicting_source_levels", entry.id, "Duplicate selected passive sources disagree on level."));
      continue;
    }
    if (prior) traces.push(trace("source_deduplicated", entry.id, { duplicateCount: (prior.duplicateCount ?? 0) + 1 }));
    else relevant.set(entry.id, { level: entry.level, duplicateCount: 0 });
  }
  return relevant;
}

function resolveBlackRage(entries, traces, errors) {
  const activeKinds = new Set();
  let duplicateCount = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || entry.id !== DISTANCE_EFFECT_IDS.BLACK_RAGE) continue;
    if (entry.sourceKind === "selected_core" && entry.selected !== true) {
      traces.push(trace("source_not_selected", entry.id, { sourceKind: entry.sourceKind }));
      continue;
    }
    if (entry.sourceKind !== "innate" && entry.sourceKind !== "selected_core") {
      errors.push(error("invalid_item_source_kind", entry.id, "Black Rage must be an innate or selected_core source."));
      continue;
    }
    duplicateCount += activeKinds.size > 0 ? 1 : 0;
    activeKinds.add(entry.sourceKind);
  }
  if (duplicateCount) traces.push(trace("source_deduplicated", DISTANCE_EFFECT_IDS.BLACK_RAGE, { duplicateCount }));
  return Object.freeze([...activeKinds].sort());
}

function overlayRow({ effectId, sourceKinds, statId, rawValue, distanceMeters, addRaw = 0, rawPerMeter, scope = "target_distance" }) {
  const definition = DISTANCE_EFFECT_DEFINITIONS[effectId];
  return Object.freeze({
    effectId,
    effectName: definition.name,
    sourceKinds: Object.freeze([...sourceKinds]),
    statId,
    operation: "add",
    rawValue,
    scope,
    scenario: Object.freeze({ targetDistanceMeters: distanceMeters }),
    calculation: Object.freeze({ formulaType: "kAmountFromDistance", addRaw, rawPerMeter, distanceMeters }),
    precision: PRECISION,
    provenance: definition.provenance,
  });
}

/**
 * Evaluate decoded distance effects without touching persistent static totals.
 *
 * Normalized input shape:
 *   activeSources.equippedWeaponTypes: string[]
 *   activeSources.passiveSkills: { id, level, selected }[]
 *   activeSources.masteryIds: string[]
 *   activeSources.itemEffects: { id, sourceKind: "innate"|"selected_core", selected? }[]
 *   scenario.targetDistanceMeters: finite non-negative number
 */
export function evaluateDistanceScenarioEffects({ activeSources = {}, scenario = {} } = {}) {
  const overlayRows = [];
  const traces = [];
  const errors = [];
  const distanceMeters = scenario?.targetDistanceMeters;
  if (typeof distanceMeters !== "number" || !Number.isFinite(distanceMeters) || distanceMeters < 0) {
    errors.push(error("invalid_target_distance", null, "targetDistanceMeters must be a finite non-negative number."));
    return Object.freeze({ overlayRows: Object.freeze([]), trace: Object.freeze(traces), errors: Object.freeze(errors) });
  }

  const weapons = normalizeStringSet(activeSources?.equippedWeaponTypes);
  const masteries = selectedMasteries(activeSources);
  const passives = dedupePassives(activeSources?.passiveSkills, traces, errors);
  const blackRageKinds = resolveBlackRage(activeSources?.itemEffects, traces, errors);

  for (const masteryId of [DISTANCE_EFFECT_IDS.FAR_SIGHT, DISTANCE_EFFECT_IDS.PREDATORS_FOCUS]) {
    const definition = DISTANCE_EFFECT_DEFINITIONS[masteryId];
    if (masteries.has(masteryId) && !weapons.has(definition.requiredWeapon)) {
      errors.push(error("foreign_weapon_mastery", masteryId, `${definition.name} requires an equipped ${definition.requiredWeapon}.`));
      masteries.delete(masteryId);
    }
  }

  const sniper = passives.get(DISTANCE_EFFECT_IDS.SNIPERS_SENSE);
  if (sniper && !sniper.conflicted) {
    const definition = DISTANCE_EFFECT_DEFINITIONS[DISTANCE_EFFECT_IDS.SNIPERS_SENSE];
    if (!weapons.has(definition.requiredWeapon)) {
      errors.push(error("foreign_weapon_passive", DISTANCE_EFFECT_IDS.SNIPERS_SENSE, "Sniper's Sense requires an equipped bow."));
    } else {
      const farSight = masteries.has(DISTANCE_EFFECT_IDS.FAR_SIGHT);
      const criticalActive = !farSight || distanceMeters >= 6;
      if (criticalActive) {
        const criticalPerMeter = (farSight ? FAR_SIGHT_CRITICAL_RAW_PER_METER : SNIPER_CRITICAL_RAW_PER_METER)[sniper.level - 1];
        overlayRows.push(overlayRow({ effectId: DISTANCE_EFFECT_IDS.SNIPERS_SENSE, sourceKinds: ["selected_passive", ...(farSight ? ["mastery_replacement"] : [])], statId: "all_critical_attack", rawValue: criticalPerMeter * distanceMeters, distanceMeters, rawPerMeter: criticalPerMeter }));
      } else {
        traces.push(trace("replacement_condition_inactive", DISTANCE_EFFECT_IDS.FAR_SIGHT, { minimumDistanceMeters: 6, distanceMeters }));
      }
      // Far Sight replaces only Sniper's Critical Hit Chance component. The
      // decoded mastery graph does not replace the separate Critical Damage
      // component, so it remains active below and above the 6m boundary.
      overlayRows.push(overlayRow({ effectId: DISTANCE_EFFECT_IDS.SNIPERS_SENSE, sourceKinds: ["selected_passive"], statId: "critical_damage_dealt_modifier", rawValue: 40 * distanceMeters, distanceMeters, rawPerMeter: 40 }));
    }
  }

  const eagle = passives.get(DISTANCE_EFFECT_IDS.EAGLE_VISION);
  if (eagle && !eagle.conflicted) {
    const definition = DISTANCE_EFFECT_DEFINITIONS[DISTANCE_EFFECT_IDS.EAGLE_VISION];
    if (!weapons.has(definition.requiredWeapon)) {
      errors.push(error("foreign_weapon_passive", DISTANCE_EFFECT_IDS.EAGLE_VISION, "Eagle Vision requires an equipped crossbow."));
    } else if (masteries.has(DISTANCE_EFFECT_IDS.PREDATORS_FOCUS)) {
      errors.push(error("unsupported_mastery_replacement", DISTANCE_EFFECT_IDS.PREDATORS_FOCUS, "Predator's Focus needs nearby-opponent positions, which the current combat scenario does not model."));
      traces.push(trace("effect_failed_closed", DISTANCE_EFFECT_IDS.EAGLE_VISION, { replacementId: DISTANCE_EFFECT_IDS.PREDATORS_FOCUS }));
    } else {
      const accuracyPerMeter = EAGLE_ACCURACY_RAW_PER_METER[eagle.level - 1];
      for (const statId of ["magic_accuracy", "range_accuracy"]) {
        overlayRows.push(overlayRow({ effectId: DISTANCE_EFFECT_IDS.EAGLE_VISION, sourceKinds: ["selected_passive"], statId, rawValue: 400 + accuracyPerMeter * distanceMeters, distanceMeters, addRaw: 400, rawPerMeter: accuracyPerMeter, scope: "target_hit" }));
      }
      overlayRows.push(overlayRow({ effectId: DISTANCE_EFFECT_IDS.EAGLE_VISION, sourceKinds: ["selected_passive"], statId: "weaken_accuracy", rawValue: 200 * distanceMeters, distanceMeters, rawPerMeter: 200, scope: "target_hit" }));
    }
  }

  if (blackRageKinds.length) {
    const definition = DISTANCE_EFFECT_DEFINITIONS[DISTANCE_EFFECT_IDS.BLACK_RAGE];
    if (!weapons.has(definition.requiredWeapon)) {
      errors.push(error("foreign_weapon_item_effect", DISTANCE_EFFECT_IDS.BLACK_RAGE, "Black Rage's Boost requires an equipped staff."));
    } else {
      overlayRows.push(overlayRow({ effectId: DISTANCE_EFFECT_IDS.BLACK_RAGE, sourceKinds: blackRageKinds, statId: "all_critical_attack", rawValue: 200 * distanceMeters, distanceMeters, rawPerMeter: 200 }));
    }
  }

  return Object.freeze({ overlayRows: Object.freeze(overlayRows), trace: Object.freeze(traces), errors: Object.freeze(errors) });
}
