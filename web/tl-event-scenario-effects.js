// Evaluation-instant ability-event overlays for decoded build 24118850.
//
// Only deterministic triggers with no decoded cooldown or activation lock are
// executable here. Positive Buff Duration can change later age boundaries, so
// this evaluator deliberately accepts only a successful activation at age 0.

export const EVENT_EFFECT_GAME_BUILD = "24118850";

export const EVENT_EFFECT_IDS = Object.freeze({
  SHADOW_WALKER: "SkillSet_WP_DA_DA_S_MoveSkillEvasion",
  NIMBLE_STEPS: "SkillSet_WP_SP_S_Passive_MoveBuff",
  BARBARIANS_DASH: "SkillSet_WP_SW2_S_SkillMaster",
  BARBARIANS_DASH_MASTERY: "Sword2h_Normal_Tac_Skill",
  ENDURING_DASH: "Spear_Rare_Def_Skill",
  MIRAGE_DANCER: "Crossbow_Hero_Defense_03",
  BLIZZARD_OVERTURE_4: "set_aa_t4_Plate_002:4",
});

const SHADOW_EVASION_RAW = Object.freeze([
  2700, 3000, 3300, 3600, 3900, 4200, 4500, 4800, 5100, 5400,
  5700, 6000, 6300, 6600, 6900, 7000, 7100, 7200, 7300, 7400,
]);
const SHADOW_REDUCTION_RAW = Object.freeze([
  14, 14, 14, 14, 14, 14, 14, 14, 14, 14,
  14, 14, 14, 14, 14, 15, 16, 17, 18, 19,
]);
const NIMBLE_STATE_RESIST_RAW = Object.freeze([
  6000, 6600, 7200, 7800, 8400, 9000, 9600, 10200, 10800, 11400,
  12000, 12600, 13200, 13800, 14400, 14680, 14960, 15240, 15520, 15800,
]);
const NIMBLE_EVASION_RAW = Object.freeze([
  1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000, 3200,
  3400, 3600, 3800, 4000, 4200, 4280, 4360, 4440, 4520, 4600,
]);
const BARBARIAN_MOVE_SPEED_RAW = Object.freeze([
  1700, 1850, 2000, 2150, 2300, 2450, 2600, 2750, 2900, 3050,
  3200, 3350, 3500, 3650, 3800, 3860, 3920, 3980, 4040, 4100,
]);
const MIRAGE_EVASION_RAW = Object.freeze([
  1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000,
]);

const decoded = ({ formulaRowIds, effectRowIds, abnormalStateId, baseDurationMs, ...extra }) => Object.freeze({
  gameBuild: EVENT_EFFECT_GAME_BUILD,
  authority: "decoded_exact_evaluation_instant",
  formulaType: "EFormulaType::kAmountFromMinMax",
  formulaRowIds: Object.freeze([...formulaRowIds]),
  effectRowIds: Object.freeze([...effectRowIds]),
  abnormalStateId,
  baseDurationMs,
  stackCap: 1,
  evaluationBoundary: "successful_activation_at_age_zero_only",
  ...extra,
});

export const EVENT_EFFECT_DEFINITIONS = Object.freeze({
  [EVENT_EFFECT_IDS.SHADOW_WALKER]: Object.freeze({
    name: "Shadow Walker",
    sourceKind: "selected_passive",
    requiredWeapon: "dagger",
    minimumLevel: 1,
    maximumLevel: 20,
    triggerWeaponScope: "any_equipped_weapon",
    triggerCategories: Object.freeze(["mobility", "movement"]),
    provenance: decoded({
      formulaRowIds: ["DA_MoveSkillEvasion_EvasionUp", "DA_MoveSkillEvasion_DamageReductionUp", "DA_MoveSkillEvasion_Duration"],
      effectRowIds: ["WP_DA_MoveSkillEvasion_PassiveOn", "WP_DA_MoveSkillEvasion_Buff"],
      abnormalStateId: "abn_WP_DA_MoveSkillEvasion_Buff",
      baseDurationMs: 4000,
    }),
  }),
  [EVENT_EFFECT_IDS.NIMBLE_STEPS]: Object.freeze({
    name: "Nimble Steps",
    sourceKind: "selected_passive",
    requiredWeapon: "spear",
    minimumLevel: 1,
    maximumLevel: 20,
    triggerWeaponScope: "any_equipped_weapon",
    triggerCategories: Object.freeze(["movement"]),
    provenance: decoded({
      formulaRowIds: ["SP_MoveBuff_ToleranceUp_Collide", "SP_MoveBuff_ToleranceUp_Bind", "SP_MoveBuff_RangeEvasion", "SP_MoveBuff_ToleranceUp_Duration"],
      effectRowIds: ["WP_SP_Passive_MoveBuff_PassiveOn", "WP_SP_Passive_MoveBuff_AdjustStat"],
      abnormalStateId: "abn_WP_SP_Passive_MoveBuff",
      baseDurationMs: 3000,
    }),
  }),
  [EVENT_EFFECT_IDS.BARBARIANS_DASH]: Object.freeze({
    name: "Barbarian's Dash",
    sourceKind: "selected_passive",
    requiredWeapon: "sword2h",
    minimumLevel: 1,
    maximumLevel: 20,
    triggerWeaponScope: "any_equipped_weapon",
    triggerCategories: Object.freeze(["mobility", "movement"]),
    provenance: decoded({
      formulaRowIds: ["SW2_Passive_03_MoveSpeedUp_by_MoveSkill", "SW2_Passive_03_Duration"],
      effectRowIds: ["WP_SW2_S_SkillMaster_PassiveOn", "WP_SW2_S_SkillMaster_Passive_AdjustStat"],
      abnormalStateId: "abn_MO_CO_SkillMaster_Passive_AdjustStat",
      baseDurationMs: 3000,
    }),
  }),
  [EVENT_EFFECT_IDS.BARBARIANS_DASH_MASTERY]: Object.freeze({
    name: "Steadfast Rush (Barbarian's Dash augmentation)",
    sourceKind: "selected_mastery_augmentation",
    requiredWeapon: "sword2h",
    minimumLevel: 1,
    maximumLevel: 1,
    triggerWeaponScope: "any_equipped_weapon",
    triggerCategories: Object.freeze(["mobility", "movement"]),
    requiresEffectId: EVENT_EFFECT_IDS.BARBARIANS_DASH,
    provenance: decoded({
      formulaRowIds: ["SW2_Mastery_Normal_Tactics_Res", "SW2_Passive_03_Duration"],
      effectRowIds: ["SW2_Mastery_Normal_Tactics_AdjustStat"],
      abnormalStateId: "abn_SW2_Mastery_Normal_Tactics_Buff",
      baseDurationMs: 3000,
      masteryNodeId: EVENT_EFFECT_IDS.BARBARIANS_DASH_MASTERY,
    }),
  }),
  [EVENT_EFFECT_IDS.ENDURING_DASH]: Object.freeze({
    name: "Enduring Dash",
    sourceKind: "selected_mastery",
    requiredWeapon: "spear",
    minimumLevel: 1,
    maximumLevel: 1,
    triggerWeaponScope: "any_equipped_weapon",
    triggerCategories: Object.freeze(["movement"]),
    provenance: decoded({
      formulaRowIds: ["WM_SP_Rare_DEF_Armor", "SP_WeakenkBonus_AttackSpeedUp_Duration"],
      effectRowIds: ["WM_SP_RARE_DEF_PassiveOn", "WM_SP_RARE_DEF_Passive_AdjustStat"],
      abnormalStateId: "abn_WM_SP_RARE_DEF_Passive_Buff",
      baseDurationMs: 3000,
      masteryNodeId: EVENT_EFFECT_IDS.ENDURING_DASH,
    }),
  }),
  [EVENT_EFFECT_IDS.MIRAGE_DANCER]: Object.freeze({
    name: "Mirage Dancer",
    sourceKind: "selected_mastery",
    requiredWeapon: "crossbow",
    minimumLevel: 1,
    maximumLevel: 10,
    triggerWeaponScope: "any_equipped_weapon",
    triggerCategories: Object.freeze(["mobility"]),
    provenance: decoded({
      formulaRowIds: ["WM_CR_HERO_DEF_EvasionUp", "WM_CR_HERO_DEF_EvasionUp_Duration"],
      effectRowIds: ["WM_CR_HERO_DEF_Passive_AdjustStat"],
      abnormalStateId: "abn_WM_CR_HERO_DEF_Passive_Buff",
      baseDurationMs: 3000,
      masteryNodeId: EVENT_EFFECT_IDS.MIRAGE_DANCER,
    }),
  }),
  [EVENT_EFFECT_IDS.BLIZZARD_OVERTURE_4]: Object.freeze({
    name: "Blizzard Overture Set",
    sourceKind: "set_breakpoint",
    triggerWeaponScope: "any_equipped_weapon",
    triggerCategories: Object.freeze(["mobility"]),
    provenance: decoded({
      formulaRowIds: [
        "Item_Passive_Set_Plate_aa_T4_002_2_AttackSpeedModifier",
        "Item_Passive_Set_Plate_aa_T4_002_2_DoubleDamageDealtModifier",
        "Item_Passive_Set_Plate_aa_T4_002_2_Duration",
      ],
      effectRowIds: ["Item_Passive_Set_Plate_aa_T4_002_2_PassiveOn", "Item_Passive_Set_Plate_aa_T4_002_2_AdjustStat2"],
      abnormalStateId: "abn_Item_Passive_Set_Plate_aa_T4_002_2_AdjustStat2",
      baseDurationMs: 3000,
      itemSetBonusRow: 131,
    }),
  }),
});

const PASSIVE_IDS = new Set([
  EVENT_EFFECT_IDS.SHADOW_WALKER,
  EVENT_EFFECT_IDS.NIMBLE_STEPS,
  EVENT_EFFECT_IDS.BARBARIANS_DASH,
]);
const MASTERY_IDS = new Set([
  EVENT_EFFECT_IDS.BARBARIANS_DASH_MASTERY,
  EVENT_EFFECT_IDS.ENDURING_DASH,
  EVENT_EFFECT_IDS.MIRAGE_DANCER,
]);

const PRECISION = Object.freeze({
  authority: "decoded_exact",
  arithmetic: "integer_raw_units",
  rounding: "none",
  durationProjection: "none_evaluation_instant_only",
  staticTotalsMutated: false,
});

const error = (code, sourceId, message) => Object.freeze({ code, sourceId, message });
const trace = (code, sourceId, details = {}) => Object.freeze({ code, sourceId, ...details });

function normalizedWeapons(value) {
  return new Set(Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string").map((entry) => entry.toLowerCase())
    : []);
}

function selectedRankedSources(entries, allowedIds, kind, traces, errors) {
  const selected = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || !allowedIds.has(entry.id)) continue;
    if (entry.selected !== true) {
      traces.push(trace("source_not_selected", entry.id));
      continue;
    }
    const definition = EVENT_EFFECT_DEFINITIONS[entry.id];
    if (!Number.isInteger(entry.level) || entry.level < definition.minimumLevel || entry.level > definition.maximumLevel) {
      errors.push(error(
        `invalid_${kind}_level`,
        entry.id,
        `${definition.name} level must be an integer from ${definition.minimumLevel} through ${definition.maximumLevel}.`,
      ));
      continue;
    }
    const prior = selected.get(entry.id);
    if (prior && prior.level !== entry.level) {
      selected.set(entry.id, { conflicted: true });
      errors.push(error("conflicting_source_levels", entry.id, `Duplicate selected ${kind} sources disagree on level.`));
      continue;
    }
    if (prior) {
      prior.duplicateCount = (prior.duplicateCount ?? 0) + 1;
      traces.push(trace("source_deduplicated", entry.id, { duplicateCount: prior.duplicateCount }));
    } else {
      selected.set(entry.id, { level: entry.level, duplicateCount: 0 });
    }
  }
  return selected;
}

function validateWeaponSources(sources, weapons, kind, errors) {
  for (const [effectId, selection] of sources) {
    if (selection.conflicted) continue;
    const definition = EVENT_EFFECT_DEFINITIONS[effectId];
    if (!weapons.has(definition.requiredWeapon)) {
      errors.push(error(`foreign_weapon_${kind}`, effectId, `${definition.name} requires an equipped ${definition.requiredWeapon}.`));
      selection.foreignWeapon = true;
    }
  }
}

function observedEvents(history, equippedWeapons, traces, errors, hasRelevantSource) {
  if (!hasRelevantSource) return [];
  if (!history || history.state === "unspecified") {
    errors.push(error("insufficient_source_event_history", null, "Event effects require an observed source event history."));
    return [];
  }
  if (history.state !== "observed" || !Array.isArray(history.events)) {
    errors.push(error("invalid_source_event_history", null, "Source event history must be an observed event list."));
    return [];
  }
  const result = [];
  for (const event of history.events) {
    if (!event || event.kind !== "ability_use" || event.outcome !== "successful_activation") {
      traces.push(trace("event_not_successful_ability_activation", event?.id ?? null));
      continue;
    }
    const weaponType = typeof event.weaponType === "string" ? event.weaponType.toLowerCase() : "";
    if (!equippedWeapons.has(weaponType)) {
      errors.push(error("foreign_event_weapon", event.id ?? null, "The triggering event weapon must be equipped."));
      continue;
    }
    const categories = new Set(Array.isArray(event.categories) ? event.categories : []);
    if (![...categories].every((category) => category === "mobility" || category === "movement") || categories.size === 0) {
      errors.push(error("invalid_event_categories", event.id ?? null, "The triggering event requires a Mobility or Movement category."));
      continue;
    }
    if (!Number.isInteger(event.occurredAgoMs) || event.occurredAgoMs < 0) {
      errors.push(error("invalid_event_age", event.id ?? null, "The triggering event age must be a non-negative integer."));
      continue;
    }
    result.push(Object.freeze({ id: event.id, occurredAgoMs: event.occurredAgoMs, weaponType, categories }));
  }
  return result;
}

function matchingEvent(events, definition, predicate = () => true) {
  return events.find((event) => (
    predicate(event)
    && definition.triggerCategories.some((category) => event.categories.has(category))
  ));
}

function overlayRow(effectId, sourceKinds, event, statId, rawValue, level) {
  const definition = EVENT_EFFECT_DEFINITIONS[effectId];
  return Object.freeze({
    effectId,
    effectName: definition.name,
    sourceKinds: Object.freeze([...sourceKinds]),
    statId,
    operation: "add",
    rawValue,
    scope: "source_event_activation_instant",
    scenario: Object.freeze({
      eventId: event.id,
      occurredAgoMs: 0,
      outcome: "successful_activation",
      weaponType: event.weaponType,
      matchedCategories: Object.freeze(definition.triggerCategories.filter((category) => event.categories.has(category))),
    }),
    calculation: Object.freeze({
      formulaType: "kAmountFromMinMax",
      rawValue,
      ...(level === undefined ? {} : { level }),
    }),
    precision: PRECISION,
    provenance: definition.provenance,
  });
}

/** Evaluate decoded no-cooldown triggers at the exact successful activation instant. */
export function evaluateEventScenarioEffects({ activeSources = {}, scenario = {} } = {}) {
  const overlayRows = [];
  const traces = [];
  const errors = [];
  const weapons = normalizedWeapons(activeSources?.equippedWeaponTypes);
  const passives = selectedRankedSources(activeSources?.passiveSkills, PASSIVE_IDS, "passive", traces, errors);
  const masteries = selectedRankedSources(activeSources?.masteries, MASTERY_IDS, "mastery", traces, errors);
  const setBreakpoints = new Set(Array.isArray(activeSources?.setBreakpoints)
    ? activeSources.setBreakpoints.filter((id) => typeof id === "string")
    : []);

  validateWeaponSources(passives, weapons, "passive", errors);
  validateWeaponSources(masteries, weapons, "mastery", errors);

  const hasRelevantSource = [...passives.values()].some((selection) => !selection.conflicted && !selection.foreignWeapon)
    || [...masteries.values()].some((selection) => !selection.conflicted && !selection.foreignWeapon)
    || setBreakpoints.has(EVENT_EFFECT_IDS.BLIZZARD_OVERTURE_4);
  const events = observedEvents(scenario?.sourceEventHistory, weapons, traces, errors, hasRelevantSource);
  if (errors.length) {
    return Object.freeze({
      overlayRows: Object.freeze([]),
      trace: Object.freeze(traces),
      errors: Object.freeze(errors),
    });
  }

  const emit = (effectId, sourceKinds, selection, rows) => {
    if (!selection || selection.conflicted || selection.foreignWeapon) return;
    const definition = EVENT_EFFECT_DEFINITIONS[effectId];
    const event = matchingEvent(events, definition, (candidate) => candidate.occurredAgoMs === 0);
    if (!event) {
      const historical = matchingEvent(events, definition, (candidate) => candidate.occurredAgoMs > 0);
      if (historical) {
        errors.push(error(
          "unsupported_event_duration",
          effectId,
          `${definition.name} has a qualifying prior activation, but positive Buff Duration prevents an exact age boundary.`,
        ));
        traces.push(trace("effect_failed_closed", effectId, { reason: "unsupported_event_duration", eventId: historical.id, occurredAgoMs: historical.occurredAgoMs }));
      } else {
        errors.push(error(
          "insufficient_source_event_window",
          effectId,
          `${definition.name} requires a qualifying successful activation at age zero; the supplied history cannot prove an exact inactive duration state.`,
        ));
        traces.push(trace("effect_failed_closed", effectId, { reason: "qualifying_activation_not_observed_at_age_zero" }));
      }
      return;
    }
    for (const [statId, rawValue] of rows(selection.level)) {
      overlayRows.push(overlayRow(effectId, sourceKinds, event, statId, rawValue, selection.level));
    }
  };

  const shadow = passives.get(EVENT_EFFECT_IDS.SHADOW_WALKER);
  emit(EVENT_EFFECT_IDS.SHADOW_WALKER, ["selected_passive"], shadow, (level) => [
    ["range_evasion", SHADOW_EVASION_RAW[level - 1]],
    ["magic_evasion", SHADOW_EVASION_RAW[level - 1]],
    ["damage_reduction", SHADOW_REDUCTION_RAW[level - 1]],
  ]);

  const nimble = passives.get(EVENT_EFFECT_IDS.NIMBLE_STEPS);
  emit(EVENT_EFFECT_IDS.NIMBLE_STEPS, ["selected_passive"], nimble, (level) => [
    ["collide_resistance", NIMBLE_STATE_RESIST_RAW[level - 1]],
    ["bind_tolerance", NIMBLE_STATE_RESIST_RAW[level - 1]],
    ["range_evasion", NIMBLE_EVASION_RAW[level - 1]],
  ]);

  const barbarian = passives.get(EVENT_EFFECT_IDS.BARBARIANS_DASH);
  emit(EVENT_EFFECT_IDS.BARBARIANS_DASH, ["selected_passive"], barbarian, (level) => [
    ["move_speed_modifier", BARBARIAN_MOVE_SPEED_RAW[level - 1]],
  ]);
  const barbarianMastery = masteries.get(EVENT_EFFECT_IDS.BARBARIANS_DASH_MASTERY);
  if (barbarianMastery && (!barbarian || barbarian.conflicted || barbarian.foreignWeapon)) {
    traces.push(trace("augmentation_source_absent", EVENT_EFFECT_IDS.BARBARIANS_DASH_MASTERY, {
      requiredEffectId: EVENT_EFFECT_IDS.BARBARIANS_DASH,
    }));
  } else if (barbarianMastery) {
    emit(EVENT_EFFECT_IDS.BARBARIANS_DASH_MASTERY, ["selected_passive", "selected_mastery_augmentation"], barbarianMastery, () => [
      ["all_state_tolerance", 4800],
    ]);
  }

  emit(EVENT_EFFECT_IDS.ENDURING_DASH, ["selected_mastery"], masteries.get(EVENT_EFFECT_IDS.ENDURING_DASH), () => [
    ["magic_critical_defense", 2500],
    ["melee_critical_defense", 2500],
    ["range_critical_defense", 2500],
  ]);

  const mirage = masteries.get(EVENT_EFFECT_IDS.MIRAGE_DANCER);
  emit(EVENT_EFFECT_IDS.MIRAGE_DANCER, ["selected_mastery"], mirage, (level) => [
    ["magic_evasion", MIRAGE_EVASION_RAW[level - 1]],
    ["range_evasion", MIRAGE_EVASION_RAW[level - 1]],
  ]);

  if (setBreakpoints.has(EVENT_EFFECT_IDS.BLIZZARD_OVERTURE_4)) {
    emit(EVENT_EFFECT_IDS.BLIZZARD_OVERTURE_4, ["set_breakpoint"], { level: undefined }, () => [
      ["attack_speed_modifier", 1000],
      ["double_damage_dealt_modifier", 1400],
    ]);
  }

  return Object.freeze({
    overlayRows: Object.freeze(errors.length ? [] : overlayRows),
    trace: Object.freeze(traces),
    errors: Object.freeze(errors),
  });
}
