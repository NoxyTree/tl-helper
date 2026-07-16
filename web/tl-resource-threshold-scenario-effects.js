// Self-resource threshold overlays for decoded build 24118850.
//
// Resource state is participant-owned scenario input expressed as integer basis
// points. Missing state is never inferred. These rows remain separate from
// persistent sheet totals and are applied only by the scenario finalizer.

export const RESOURCE_THRESHOLD_EFFECT_GAME_BUILD = "24118850";

export const RESOURCE_THRESHOLD_EFFECT_IDS = Object.freeze({
  CRITICAL_EQUILIBRIUM: "Sword2h_Hero_Attack_01",
  TRANQUIL_WILL: "Orb_Rare_Util_Skill",
});

const CRITICAL_EQUILIBRIUM_RAW_BY_LEVEL = Object.freeze([
  660, 720, 780, 840, 900, 960, 1020, 1080, 1140, 1200,
]);

const decodedThresholdFormula = ({ formulaRowIds, effectRowIds, abnormalStateId, threshold }) => Object.freeze({
  gameBuild: RESOURCE_THRESHOLD_EFFECT_GAME_BUILD,
  authority: "decoded_exact_threshold",
  formulaType: "EFormulaType::kAmountFromMinMax",
  formulaRowIds: Object.freeze([...formulaRowIds]),
  effectRowIds: Object.freeze([...effectRowIds]),
  abnormalStateId,
  threshold: Object.freeze({ ...threshold }),
  stackCap: 1,
});

export const RESOURCE_THRESHOLD_EFFECT_DEFINITIONS = Object.freeze({
  [RESOURCE_THRESHOLD_EFFECT_IDS.CRITICAL_EQUILIBRIUM]: Object.freeze({
    name: "Critical Equilibrium",
    requiredWeapon: "sword2h",
    minimumLevel: 1,
    maximumLevel: 10,
    resource: "health",
    thresholdRatioBps: 5000,
    rawByLevel: CRITICAL_EQUILIBRIUM_RAW_BY_LEVEL,
    provenance: decodedThresholdFormula({
      formulaRowIds: [
        "SW2_Mastery_Hero_Attack_CriticalDamageDefence",
        "SW2_Mastery_Hero_Attack_CriticalDamageBoost",
      ],
      effectRowIds: [
        "WP_SW2_Mastery_Hero_Attack_ConditionalActivation",
        "WP_SW2_Mastery_Hero_Attack_AdjustStat",
        "WP_SW2_Mastery_Hero_Attack_AdjustStat2",
      ],
      abnormalStateId: "abn_SW2_Mastery_Hero_Attack",
      threshold: { resource: "health", highOperator: ">=", lowOperator: "<", ratioBps: 5000 },
    }),
  }),
  [RESOURCE_THRESHOLD_EFFECT_IDS.TRANQUIL_WILL]: Object.freeze({
    name: "Tranquil Will",
    requiredWeapon: "orb",
    minimumLevel: 1,
    maximumLevel: 1,
    resource: "mana",
    thresholdRatioBps: 3300,
    rawValue: 1500,
    provenance: decodedThresholdFormula({
      formulaRowIds: ["ORB_WM_RARE_SUB_CostConsumptionMod"],
      effectRowIds: ["WM_ORB_RARE_SUB_CostCheck", "WM_ORB_RARE_SUB_AdjustStat"],
      abnormalStateId: "abn_WM_ORB_RARE_SUB_AdjustStat",
      threshold: { resource: "mana", operator: "<=", ratioBps: 3300 },
    }),
  }),
});

const EFFECT_IDS = new Set(Object.keys(RESOURCE_THRESHOLD_EFFECT_DEFINITIONS));

const PRECISION = Object.freeze({
  coefficientAuthority: "decoded_exact",
  projection: "integer_basis_point_threshold",
  arithmetic: "integer_comparison",
  rounding: "none",
  staticTotalsMutated: false,
});

const error = (code, sourceId, message) => Object.freeze({ code, sourceId, message });
const trace = (code, sourceId, details = {}) => Object.freeze({ code, sourceId, ...details });

function normalizeStringSet(value) {
  return new Set(Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string").map((entry) => entry.toLowerCase())
    : []);
}

function selectedMasteries(entries, traces, errors) {
  const selected = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || !EFFECT_IDS.has(entry.id)) continue;
    if (entry.selected !== true) {
      traces.push(trace("source_not_selected", entry.id));
      continue;
    }
    const definition = RESOURCE_THRESHOLD_EFFECT_DEFINITIONS[entry.id];
    if (!Number.isInteger(entry.level) || entry.level < definition.minimumLevel || entry.level > definition.maximumLevel) {
      errors.push(error(
        "invalid_mastery_level",
        entry.id,
        `${definition.name} level must be an integer from ${definition.minimumLevel} through ${definition.maximumLevel}.`,
      ));
      continue;
    }
    const prior = selected.get(entry.id);
    if (prior && prior.level !== entry.level) {
      selected.set(entry.id, { conflicted: true });
      errors.push(error("conflicting_source_levels", entry.id, "Duplicate selected mastery sources disagree on level."));
      continue;
    }
    if (prior) {
      traces.push(trace("source_deduplicated", entry.id, { duplicateCount: (prior.duplicateCount ?? 0) + 1 }));
      prior.duplicateCount = (prior.duplicateCount ?? 0) + 1;
    } else {
      selected.set(entry.id, { level: entry.level, duplicateCount: 0 });
    }
  }
  return selected;
}

function sourceRatioBps(sourceResources, resource) {
  return sourceResources?.[resource]?.currentRatioBps;
}

function overlayRow({ effectId, statId, rawValue, resource, currentRatioBps, thresholdRatioBps, operator, branch }) {
  const definition = RESOURCE_THRESHOLD_EFFECT_DEFINITIONS[effectId];
  return Object.freeze({
    effectId,
    effectName: definition.name,
    sourceKinds: Object.freeze(["selected_mastery"]),
    statId,
    operation: "add",
    rawValue,
    scope: "source_resource_threshold",
    scenario: Object.freeze({ resource, currentRatioBps, thresholdRatioBps, operator, branch }),
    calculation: Object.freeze({
      formulaType: "kAmountFromMinMax",
      rawValue,
      resource,
      currentRatioBps,
      thresholdRatioBps,
      operator,
      branch,
    }),
    precision: PRECISION,
    provenance: definition.provenance,
  });
}

/** Evaluate exact selected-mastery resource thresholds without changing static totals. */
export function evaluateResourceThresholdScenarioEffects({ activeSources = {}, scenario = {} } = {}) {
  const overlayRows = [];
  const traces = [];
  const errors = [];
  const weapons = normalizeStringSet(activeSources?.equippedWeaponTypes);
  const masteries = selectedMasteries(activeSources?.masteries, traces, errors);
  const sourceResources = scenario?.sourceResources;

  for (const [effectId, selection] of masteries) {
    if (selection.conflicted) continue;
    const definition = RESOURCE_THRESHOLD_EFFECT_DEFINITIONS[effectId];
    if (!weapons.has(definition.requiredWeapon)) {
      errors.push(error("foreign_weapon_mastery", effectId, `${definition.name} requires an equipped ${definition.requiredWeapon}.`));
      continue;
    }
    const currentRatioBps = sourceRatioBps(sourceResources, definition.resource);
    if (!Number.isInteger(currentRatioBps) || currentRatioBps < 0 || currentRatioBps > 10000) {
      errors.push(error(
        "missing_scenario_resource_state",
        effectId,
        `${definition.name} requires explicit source ${definition.resource} currentRatioBps.`,
      ));
      continue;
    }

    if (effectId === RESOURCE_THRESHOLD_EFFECT_IDS.CRITICAL_EQUILIBRIUM) {
      const highHealth = currentRatioBps >= definition.thresholdRatioBps;
      overlayRows.push(overlayRow({
        effectId,
        statId: highHealth ? "critical_damage_dealt_modifier" : "critical_damage_taken_modifier",
        rawValue: definition.rawByLevel[selection.level - 1],
        resource: definition.resource,
        currentRatioBps,
        thresholdRatioBps: definition.thresholdRatioBps,
        operator: highHealth ? ">=" : "<",
        branch: highHealth ? "at_or_above_threshold" : "below_threshold",
      }));
      continue;
    }

    const active = currentRatioBps <= definition.thresholdRatioBps;
    if (!active) {
      traces.push(trace("resource_threshold_inactive", effectId, {
        resource: definition.resource,
        currentRatioBps,
        thresholdRatioBps: definition.thresholdRatioBps,
        operator: "<=",
      }));
      continue;
    }
    overlayRows.push(overlayRow({
      effectId,
      statId: "cost_consumption_modifier",
      rawValue: definition.rawValue,
      resource: definition.resource,
      currentRatioBps,
      thresholdRatioBps: definition.thresholdRatioBps,
      operator: "<=",
      branch: "at_or_below_threshold",
    }));
  }

  return Object.freeze({
    overlayRows: Object.freeze(overlayRows),
    trace: Object.freeze(traces),
    errors: Object.freeze(errors),
  });
}
