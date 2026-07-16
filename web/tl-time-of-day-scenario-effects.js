// Ordinary day/night scenario overlays for decoded build 24118850.
//
// Eclipse has distinct client skill rows whose activation graph is not present
// in the decoded tables. This evaluator therefore accepts only explicit day or
// night scenario state and makes no claim about Eclipse behavior.

export const TIME_OF_DAY_EFFECT_GAME_BUILD = "24118850";

export const TIME_OF_DAY_EFFECT_IDS = Object.freeze({
  KOWAZANS_BOMBING: "SkillSet_WP_Item_kA_CR_61",
  KOWAZANS_MADNESS: "SkillSet_WP_Item_kA_DA_61_2",
  KOWAZANS_FLAME_SPIRIT: "SkillSet_WP_Item_FieldBoss_T3_CR_01",
  KOWAZANS_FRENZY: "SkillSet_WP_Item_FieldBoss_T3_DA_02",
});

const decodedFixedFormula = ({ formulaRowIds, effectRowIds, abnormalStateIds }) => Object.freeze({
  gameBuild: TIME_OF_DAY_EFFECT_GAME_BUILD,
  authority: "decoded_exact_fixed_amount",
  formulaType: "EFormulaType::kAmountFromMinMax",
  formulaRowIds: Object.freeze([...formulaRowIds]),
  effectRowIds: Object.freeze([...effectRowIds]),
  abnormalStateIds: Object.freeze([...abnormalStateIds]),
  limitation: "Ordinary day and night only. Eclipse activation semantics are not decoded and are not inferred.",
});

export const TIME_OF_DAY_EFFECT_DEFINITIONS = Object.freeze({
  [TIME_OF_DAY_EFFECT_IDS.KOWAZANS_BOMBING]: Object.freeze({
    name: "Kowazan's Bombing",
    requiredWeapon: "crossbow",
    carrierItemIds: Object.freeze(["crossbow_aa_t5_boss_001"]),
    allowedSourceKinds: Object.freeze(["innate"]),
    flatSkillContextLevels: Object.freeze({ minimum: 1, maximum: 20 }),
    conflictsWith: Object.freeze([TIME_OF_DAY_EFFECT_IDS.KOWAZANS_FLAME_SPIRIT]),
    statId: "attack_speed_modifier",
    rawByTimeOfDay: Object.freeze({ day: 1200, night: 600 }),
    provenance: decodedFixedFormula({
      formulaRowIds: ["WP_Item_kA_CR_61_AttackSpeedUp", "WP_Item_kA_CR_61_AttackSpeedUp_Night"],
      effectRowIds: ["WP_Item_kA_CR_61_Stat", "WP_Item_kA_CR_61_Stat_Night"],
      abnormalStateIds: ["abn_WP_Item_kA_CR_61_Passive", "abn_WP_Item_kA_CR_61_Passive_Night"],
    }),
  }),
  [TIME_OF_DAY_EFFECT_IDS.KOWAZANS_MADNESS]: Object.freeze({
    name: "Kowazan's Madness",
    requiredWeapon: "dagger",
    carrierItemIds: Object.freeze(["dagger_aa_t5_boss_001"]),
    allowedSourceKinds: Object.freeze(["innate"]),
    flatSkillContextLevels: Object.freeze({ minimum: 1, maximum: 20 }),
    conflictsWith: Object.freeze([TIME_OF_DAY_EFFECT_IDS.KOWAZANS_FRENZY]),
    statId: "melee_critical_attack",
    rawByTimeOfDay: Object.freeze({ day: 1250, night: 2500 }),
    provenance: decodedFixedFormula({
      formulaRowIds: ["WP_Item_kA_DA_61_2_CriticalAttackUp", "WP_Item_kA_DA_61_2_CriticalAttackUp_Day"],
      effectRowIds: ["WP_Item_kA_DA_61_2_Stat", "WP_Item_kA_DA_61_2_Stat_Day"],
      abnormalStateIds: ["abn_WP_Item_kA_DA_61_2_Passive", "abn_WP_Item_kA_DA_61_2_Passive_Day"],
    }),
  }),
});

const EFFECT_IDS = new Set(Object.keys(TIME_OF_DAY_EFFECT_DEFINITIONS));
const CONFLICT_IDS = new Set([
  TIME_OF_DAY_EFFECT_IDS.KOWAZANS_FLAME_SPIRIT,
  TIME_OF_DAY_EFFECT_IDS.KOWAZANS_FRENZY,
]);
const SUPPORTED_TIMES = new Set(["day", "night"]);

const PRECISION = Object.freeze({
  coefficientAuthority: "decoded_exact",
  projection: "ordinary_day_night_fixed_amount",
  arithmetic: "integer_raw_stat",
  rounding: "none",
  staticTotalsMutated: false,
  eclipseModeled: false,
});

const error = (code, sourceId, message) => Object.freeze({ code, sourceId, message });
const trace = (code, sourceId, details = {}) => Object.freeze({ code, sourceId, ...details });

function normalizeStringSet(value) {
  return new Set(Array.isArray(value) ? value.filter((entry) => typeof entry === "string").map((entry) => entry.toLowerCase()) : []);
}

function activeItemEffects(entries, traces, errors) {
  const effects = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || (!EFFECT_IDS.has(entry.id) && !CONFLICT_IDS.has(entry.id))) continue;
    if (entry.sourceKind === "selected_core" && entry.selected !== true) {
      traces.push(trace("source_not_selected", entry.id, { sourceKind: entry.sourceKind }));
      continue;
    }
    if (CONFLICT_IDS.has(entry.id)) {
      if (entry.sourceKind !== "innate" && entry.sourceKind !== "selected_core") {
        errors.push(error("invalid_item_source_kind", entry.id, "Conflicting Kowazan effects must be innate or selected_core sources."));
        continue;
      }
    } else {
      const definition = TIME_OF_DAY_EFFECT_DEFINITIONS[entry.id];
      if (!definition.allowedSourceKinds.includes(entry.sourceKind)) {
        errors.push(error("invalid_item_source_kind", entry.id, `${definition.name} is decoded only as an innate item passive.`));
        continue;
      }
      if (!definition.carrierItemIds.includes(entry.itemId)) {
        errors.push(error("invalid_item_effect_carrier", entry.id, `${definition.name} is not carried by item ${String(entry.itemId ?? "missing")}.`));
        continue;
      }
    }
    if (entry.sourceKind !== "innate" && entry.sourceKind !== "selected_core") {
      errors.push(error("invalid_item_source_kind", entry.id, "Time-of-day item effects must be innate or selected_core sources."));
      continue;
    }
    if (!effects.has(entry.id)) effects.set(entry.id, new Set());
    const sourceKinds = effects.get(entry.id);
    if (sourceKinds.has(entry.sourceKind)) traces.push(trace("source_deduplicated", entry.id, { sourceKind: entry.sourceKind }));
    sourceKinds.add(entry.sourceKind);
  }
  return effects;
}

function overlayRow(effectId, sourceKinds, timeOfDay) {
  const definition = TIME_OF_DAY_EFFECT_DEFINITIONS[effectId];
  const rawValue = definition.rawByTimeOfDay[timeOfDay];
  return Object.freeze({
    effectId,
    effectName: definition.name,
    sourceKinds: Object.freeze([...sourceKinds].sort()),
    statId: definition.statId,
    operation: "add",
    rawValue,
    scope: "environment_time_of_day",
    scenario: Object.freeze({ timeOfDay }),
    calculation: Object.freeze({ formulaType: "kAmountFromMinMax", rawValue, timeOfDay }),
    precision: PRECISION,
    provenance: definition.provenance,
  });
}

/** Evaluate decoded ordinary day/night item effects without changing static totals. */
export function evaluateTimeOfDayScenarioEffects({ activeSources = {}, scenario = {} } = {}) {
  const overlayRows = [];
  const traces = [];
  const errors = [];
  const effects = activeItemEffects(activeSources?.itemEffects, traces, errors);
  const executableEffects = [...effects.keys()].filter((effectId) => EFFECT_IDS.has(effectId));
  if (!executableEffects.length) return Object.freeze({ overlayRows: Object.freeze([]), trace: Object.freeze(traces), errors: Object.freeze(errors) });

  for (const effectId of executableEffects) {
    const conflictId = TIME_OF_DAY_EFFECT_DEFINITIONS[effectId].conflictsWith.find((candidate) => effects.has(candidate));
    if (conflictId) {
      errors.push(error("shared_abnormal_conflict", effectId, `${TIME_OF_DAY_EFFECT_DEFINITIONS[effectId].name} shares an abnormal-state controller with ${conflictId}; decoded winner semantics are unresolved.`));
    }
  }
  if (errors.length) return Object.freeze({ overlayRows: Object.freeze([]), trace: Object.freeze(traces), errors: Object.freeze(errors) });

  const timeOfDay = scenario?.timeOfDay;
  if (!SUPPORTED_TIMES.has(timeOfDay)) {
    for (const effectId of executableEffects) {
      errors.push(error("unsupported_time_of_day", effectId, `${TIME_OF_DAY_EFFECT_DEFINITIONS[effectId].name} requires an explicit ordinary day or night scenario. Eclipse, dawn, dusk, and unspecified state are not modeled.`));
    }
    return Object.freeze({ overlayRows: Object.freeze([]), trace: Object.freeze(traces), errors: Object.freeze(errors) });
  }

  const weapons = normalizeStringSet(activeSources?.equippedWeaponTypes);
  for (const effectId of executableEffects) {
    const sourceKinds = effects.get(effectId);
    const definition = TIME_OF_DAY_EFFECT_DEFINITIONS[effectId];
    if (!weapons.has(definition.requiredWeapon)) {
      errors.push(error("foreign_weapon_item_effect", effectId, `${definition.name} requires an equipped ${definition.requiredWeapon}.`));
      continue;
    }
    overlayRows.push(overlayRow(effectId, sourceKinds, timeOfDay));
  }

  return Object.freeze({ overlayRows: Object.freeze(overlayRows), trace: Object.freeze(traces), errors: Object.freeze(errors) });
}
