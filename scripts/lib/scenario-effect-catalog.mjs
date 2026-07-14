import { PASSIVE_EFFECT_CONTRACT } from "../../web/tl-passive-effect-contract.js";
import {
  SCENARIO_EFFECT_DEFINITIONS,
  SCENARIO_EFFECT_GAME_BUILD,
} from "../../web/tl-scenario-effects.js";

export const SCENARIO_EFFECT_CATALOG_SCHEMA = "tl-helper.scenario-effect-catalog";
export const SCENARIO_EFFECT_CATALOG_SCHEMA_VERSION = 1;

export const SCENARIO_EFFECT_FAMILIES = Object.freeze({
  weaponPassive: "weaponPassive",
  masteryNonStructured: "masteryNonStructured",
  itemPerkComplex: "itemPerkComplex",
  setBreakpointConditional: "setBreakpointConditional",
});

export const SCENARIO_EFFECT_SUPPORT_STATES = Object.freeze({
  cataloguedUnmodeled: "catalogued_unmodeled",
  scenarioExecutableDecoded: "scenario_executable_decoded",
  unsupportedStaticCalculator: "unsupported_static_calculator",
  staticComponentOnly: "static_component_only",
});

const PROJECTION_PATHS = Object.freeze({
  weaponPassive: "web/data/projections/skills.json",
  masteryNonStructured: "web/data/projections/progression.json",
  itemPerkComplex: "web/data/projections/equipment.json",
  setBreakpointConditional: "web/data/projections/equipment.json",
});

const REQUIRED_UNRESOLVED_FIELDS = Object.freeze([
  "activationCondition",
  "applicationOrder",
  "cooldown",
  "duration",
  "formula",
  "procProbability",
  "recipient",
  "stacking",
  "trigger",
  "uptime",
]);

const EXECUTABLE_DISTANCE_UNRESOLVED_FIELDS = Object.freeze(["serverRounding"]);
const EXECUTABLE_TIME_UNRESOLVED_FIELDS = Object.freeze(["eclipseState"]);

const distanceRule = (sourceId) => Object.freeze({
  ruleId: `distance:${sourceId}`,
  mechanic: "target_distance",
  modulePath: "web/tl-distance-scenario-effects.js",
  evaluatorExport: "evaluateDistanceScenarioEffects",
  definitionsExport: "DISTANCE_EFFECT_DEFINITIONS",
  definitionKey: sourceId,
  gameBuild: SCENARIO_EFFECT_GAME_BUILD,
  requiredScenarioInputs: Object.freeze(["targetDistanceMeters"]),
  unresolvedFields: EXECUTABLE_DISTANCE_UNRESOLVED_FIELDS,
  precisionStage: "decoded_exact_coefficients",
  precisionSemantics: "reviewed_distance_scenario",
  precisionLimitation: "Distance coefficients and source gating are decoded and reviewed. Fractional metres are evaluated continuously; server-side rounding is not claimed.",
});

const timeOfDayRule = (sourceId) => Object.freeze({
  ruleId: `time-of-day:${sourceId}`,
  mechanic: "time_of_day",
  modulePath: "web/tl-time-of-day-scenario-effects.js",
  evaluatorExport: "evaluateTimeOfDayScenarioEffects",
  definitionsExport: "TIME_OF_DAY_EFFECT_DEFINITIONS",
  definitionKey: sourceId,
  gameBuild: SCENARIO_EFFECT_GAME_BUILD,
  requiredScenarioInputs: Object.freeze(["environment.timeOfDay"]),
  unresolvedFields: EXECUTABLE_TIME_UNRESOLVED_FIELDS,
  precisionStage: "decoded_exact_fixed_amount",
  precisionSemantics: "reviewed_ordinary_day_night_scenario",
  precisionLimitation: "Fixed ordinary day and night amounts and source gating are decoded and reviewed. Eclipse, dawn, dusk, and unspecified state fail closed.",
});

// Each promotion is an explicit reviewed binding. Absence from this registry
// always remains non-executable. In particular, Predator's Focus is omitted
// because its nearby-opponent replacement scenario is not represented yet.
export const EXECUTABLE_SCENARIO_RULE_REFERENCES = Object.freeze({
  "Bow_Normal_Attack_Skill": distanceRule("Bow_Normal_Attack_Skill"),
  "SkillSet_WP_BO_S_DistanceCritical": distanceRule("SkillSet_WP_BO_S_DistanceCritical"),
  "SkillSet_WP_CR_CR_S_DistanceRangeAcc": distanceRule("SkillSet_WP_CR_CR_S_DistanceRangeAcc"),
  "SkillSet_WP_Item_kA_CR_61": timeOfDayRule("SkillSet_WP_Item_kA_CR_61"),
  "SkillSet_WP_Item_kA_DA_61_2": timeOfDayRule("SkillSet_WP_Item_kA_DA_61_2"),
  "SkillSet_WP_Item_kA_ST_55": distanceRule("SkillSet_WP_Item_kA_ST_55"),
});

const WEAPON_TYPES = new Set(["bow", "crossbow", "dagger", "gauntlet", "orb", "spear", "staff", "sword", "sword2h", "wand"]);

// This is an explicit build-24118850 component registry. A breakpoint is listed
// only when its projected description contains behavior that is not part of the
// persistent sheet-stat calculation. No description parsing or fallback
// classification is allowed here.
export const SET_CONDITIONAL_COMPONENTS = Object.freeze([
  Object.freeze({ key: "set_a_Magic_Nudge_001:3", componentKind: "whole_breakpoint", reason: "Target-health-conditional Critical Hit Chance requires target state and duration modeling." }),
  Object.freeze({ key: "set_a_Melee_Nudge_001:3", componentKind: "whole_breakpoint", reason: "Target-health-conditional Critical Hit Chance requires target state and duration modeling." }),
  Object.freeze({ key: "set_a_Range_Nudge_001:3", componentKind: "whole_breakpoint", reason: "Target-health-conditional Critical Hit Chance requires target state and duration modeling." }),
  Object.freeze({ key: "set_aa_T2_fabric_002:2", componentKind: "whole_breakpoint", reason: "Skill damage-over-time and its exclusivity require a combat-stage model." }),
  Object.freeze({ key: "set_aa_T2_fabric_004:2", componentKind: "whole_breakpoint", reason: "Base and triggered skill damage-over-time require a combat-stage model." }),
  Object.freeze({ key: "set_aa_fabric_001:2", componentKind: "whole_breakpoint", reason: "Weaken Duration +7.5% is a scoped dynamic stat not represented in sheet totals." }),
  Object.freeze({ key: "set_aa_plate_002:4", componentKind: "whole_breakpoint", reason: "Mobility-skill move range is scoped behavior, not a global sheet stat." }),
  Object.freeze({ key: "set_aa_t3_lether_003:4", componentKind: "whole_breakpoint", reason: "Enemy Endurance reduction and movement-triggered Evasion are conditional combat effects." }),
  Object.freeze({ key: "set_aa_t4_fabric_005:2", componentKind: "whole_breakpoint", reason: "Skill damage-over-time and the triggered resistance debuff require a combat-stage model." }),
  Object.freeze({ key: "set_aa_T2_plate_004:2", componentKind: "conditional_remainder", staticComponent: "Block Chance +8%." }),
  Object.freeze({ key: "set_aa_t3_fabric_003:4", componentKind: "conditional_remainder", staticComponent: "Skill Damage Resistance +100." }),
  Object.freeze({ key: "set_aa_t3_leather_004:4", componentKind: "conditional_remainder", staticComponent: "Skill Damage Boost +80." }),
  Object.freeze({ key: "set_aa_t3_lether_001:4", componentKind: "conditional_remainder", staticComponent: "Bonus Damage +40." }),
  Object.freeze({ key: "set_aa_t3_lether_002:4", componentKind: "conditional_remainder", staticComponent: "Critical Damage +15%." }),
  Object.freeze({ key: "set_aa_t3_lether_003:2", componentKind: "conditional_remainder", staticComponent: "Magic, Melee, and Ranged Evasion +150." }),
  Object.freeze({ key: "set_aa_t3_plate_002:4", componentKind: "conditional_remainder", staticComponent: "Heavy Attack Damage +10%." }),
  Object.freeze({ key: "set_aa_t3_plate_003:4", componentKind: "conditional_remainder", staticComponent: "Block Chance +12%." }),
  Object.freeze({ key: "set_aa_t4_Plate_001:4", componentKind: "conditional_remainder", staticComponent: "Skill Damage Resistance +100." }),
  Object.freeze({ key: "set_aa_t4_Plate_002:4", componentKind: "conditional_remainder", staticComponent: "Cooldown Speed +10%." }),
  Object.freeze({ key: "set_aa_t4_Plate_003:4", componentKind: "conditional_remainder", staticComponent: "Critical Damage +20%." }),
  Object.freeze({ key: "set_aa_t4_fabric_002:4", componentKind: "conditional_remainder", staticComponent: "Cooldown Speed +10%." }),
  Object.freeze({ key: "set_aa_t4_leather_001:4", componentKind: "conditional_remainder", staticComponent: "Critical Damage +20%." }),
  Object.freeze({ key: "set_aa_t4_leather_002:4", componentKind: "conditional_remainder", staticComponent: "Heavy Attack Damage +20%." }),
]);

function fail(message) {
  throw new Error(`Scenario effect catalog: ${message}`);
}

function codepointSort(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort(codepointSort);
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function requiredText(value, label) {
  const result = clean(value);
  if (!result) fail(`${label} is required`);
  return result;
}

function assertProjection(projection, expectedSchema, gameBuild, label) {
  if (projection?.schema !== expectedSchema) fail(`${label} schema must be ${expectedSchema}`);
  if (String(projection?.gameBuild ?? "") !== gameBuild) fail(`${label} gameBuild does not match ${gameBuild}`);
  if (!projection.data || typeof projection.data !== "object") fail(`${label}.data is required`);
}

function assertExactUniverse(actual, expected, label) {
  const left = sortedUnique(actual);
  const right = sortedUnique(expected);
  if (left.length !== actual.length) fail(`${label} source contains duplicate IDs`);
  if (left.length !== right.length || left.some((id, index) => id !== right[index])) {
    const missing = right.filter((id) => !left.includes(id));
    const extra = left.filter((id) => !right.includes(id));
    fail(`${label} universe drifted (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"})`);
  }
}

function projectionProvenance(family, selector) {
  return Object.freeze([
    Object.freeze({ kind: "projection", path: PROJECTION_PATHS[family], selector }),
    Object.freeze({
      kind: "classification_contract",
      path: "web/tl-passive-effect-contract.js",
      selector: `PASSIVE_EFFECT_CONTRACT.families.${family}.classes.conditional`,
    }),
  ]);
}

function validateScenarioRuleReference(sourceId, reference) {
  if (reference.definitionKey !== sourceId) fail(`scenario rule ${reference.ruleId} definitionKey does not match ${sourceId}`);
  if (reference.gameBuild !== SCENARIO_EFFECT_GAME_BUILD) fail(`scenario rule ${reference.ruleId} gameBuild drifted`);
  const definition = SCENARIO_EFFECT_DEFINITIONS[reference.definitionKey];
  if (!definition) fail(`scenario rule ${reference.ruleId} references a missing definition`);
  if (definition.executable === false) fail(`scenario rule ${reference.ruleId} references an unsupported definition`);
  if (!reference.mechanic || !reference.precisionStage || !reference.precisionSemantics || !reference.precisionLimitation) {
    fail(`scenario rule ${reference.ruleId} lacks explicit mechanic precision metadata`);
  }
}

function shell({ family, sourceId, name, description, carriers, weaponRequirements, supportState, provenance, sourceEdges, scenarioRule = null, componentKind = null, staticComponent = null, reason = null }) {
  if (scenarioRule) validateScenarioRuleReference(sourceId, scenarioRule);
  const effectiveProvenance = scenarioRule
    ? [...provenance, Object.freeze({
      kind: "decoded_executable_rule",
      path: scenarioRule.modulePath,
      selector: `${scenarioRule.definitionsExport}[${scenarioRule.definitionKey}]`,
    })]
    : provenance;
  const effectiveSourceEdges = scenarioRule
    ? [...sourceEdges, Object.freeze({
      from: sourceId,
      relation: "executed_by_reviewed_rule",
      to: scenarioRule.ruleId,
      modulePath: scenarioRule.modulePath,
      evaluatorExport: scenarioRule.evaluatorExport,
      definitionKey: scenarioRule.definitionKey,
    })]
    : sourceEdges;
  return Object.freeze({
    catalogId: `${family}:${sourceId}`,
    sourceFamily: family,
    sourceId,
    name: requiredText(name, `${family} ${sourceId} name`),
    description: requiredText(description, `${family} ${sourceId} description`),
    carriers: Object.freeze(carriers),
    weaponRequirements: Object.freeze(sortedUnique(weaponRequirements)),
    supportState: scenarioRule ? SCENARIO_EFFECT_SUPPORT_STATES.scenarioExecutableDecoded : supportState,
    precision: scenarioRule
      ? Object.freeze({
        stage: scenarioRule.precisionStage,
        source: "decoded_game_tables",
        semantics: scenarioRule.precisionSemantics,
        executable: true,
        limitation: scenarioRule.precisionLimitation,
      })
      : Object.freeze({ stage: "unsupported", source: "projected", semantics: "unresolved", executable: false }),
    provenance: Object.freeze(effectiveProvenance),
    sourceEdges: Object.freeze(effectiveSourceEdges),
    unresolvedFields: scenarioRule ? scenarioRule.unresolvedFields : REQUIRED_UNRESOLVED_FIELDS,
    executableSemantics: scenarioRule ?? null,
    ...(componentKind ? { componentKind } : {}),
    ...(staticComponent ? {
      staticComponent: Object.freeze({
        status: "calculated_separately",
        summary: staticComponent,
        authority: "web/tl-core.js set-effect trace",
      }),
    } : {}),
    ...(reason ? { unsupportedReason: reason } : {}),
  });
}

function weaponPassiveEffects(skills, contract) {
  const ids = contract.families.weaponPassive.classes.conditional;
  const rows = skills.filter((row) => row.skillType === "passive" && ids.includes(row.id));
  assertExactUniverse(rows.map((row) => row.id), ids, "conditional weapon passive");
  return rows.map((row) => {
    const levels = Array.isArray(row.levels) ? row.levels : [];
    const last = levels[levels.length - 1];
    if (!last) fail(`weapon passive ${row.id} has no projected levels`);
    return shell({
      family: SCENARIO_EFFECT_FAMILIES.weaponPassive,
      sourceId: row.id,
      name: row.name,
      description: last.description,
      carriers: [Object.freeze({ kind: "passive_skill", id: row.id, name: clean(row.name) })],
      weaponRequirements: [row.mainCategory],
      supportState: SCENARIO_EFFECT_SUPPORT_STATES.cataloguedUnmodeled,
      scenarioRule: EXECUTABLE_SCENARIO_RULE_REFERENCES[row.id] ?? null,
      provenance: projectionProvenance("weaponPassive", `data.skills[id=${row.id}]`),
      sourceEdges: [Object.freeze({
        from: row.id,
        relation: "has_level_descriptions",
        to: `${row.id}:levels`,
        projectionPath: `data.skills[id=${row.id}].levels`,
        levelRange: Object.freeze({ minimum: Number(levels[0].level), maximum: Number(last.level), count: levels.length }),
        selectedDescriptionLevel: Number(last.level),
      })],
    });
  });
}

function masteryEffects(masteries, contract) {
  const ids = contract.families.masteryNonStructured.classes.conditional;
  const rows = masteries.filter((row) => ids.includes(row.id));
  assertExactUniverse(rows.map((row) => row.id), ids, "conditional non-structured mastery");
  return rows.map((row) => {
    const passives = (row.passives ?? []).map(clean).filter(Boolean);
    const description = passives[passives.length - 1] || row.description;
    const edge = passives.length
      ? Object.freeze({ from: row.id, relation: "has_rank_descriptions", to: `${row.id}:ranks`, projectionPath: `data.masteries[id=${row.id}].passives`, rankCount: passives.length, selectedDescriptionRank: passives.length })
      : Object.freeze({ from: row.id, relation: "has_description", to: `${row.id}:description`, projectionPath: `data.masteries[id=${row.id}].description` });
    return shell({
      family: SCENARIO_EFFECT_FAMILIES.masteryNonStructured,
      sourceId: row.id,
      name: row.name,
      description,
      carriers: [Object.freeze({
        kind: "mastery_node",
        id: row.id,
        name: clean(row.name),
        specializationType: row.specializationType,
        weaponActivatedOnly: Boolean(row.weaponActivatedOnly),
      })],
      weaponRequirements: row.specializationType === "unified" ? [] : [row.mainCategory],
      supportState: SCENARIO_EFFECT_SUPPORT_STATES.cataloguedUnmodeled,
      scenarioRule: EXECUTABLE_SCENARIO_RULE_REFERENCES[row.id] ?? null,
      provenance: projectionProvenance("masteryNonStructured", `data.masteries[id=${row.id}]`),
      sourceEdges: [edge],
    });
  });
}

function itemComplexOccurrences(items, ids) {
  const byId = new Map(ids.map((id) => [id, []]));
  for (const item of items) {
    if (byId.has(item.passives?.id)) {
      byId.get(item.passives.id).push({ item, passive: item.passives, perk: null });
    }
    for (const perk of item.availablePerks ?? []) {
      if (byId.has(perk.passive?.id)) byId.get(perk.passive.id).push({ item, passive: perk.passive, perk });
    }
  }
  return byId;
}

function itemComplexEffects(items, contract) {
  const ids = contract.families.itemPerkComplex.classes.conditional;
  const occurrences = itemComplexOccurrences(items, ids);
  assertExactUniverse([...occurrences].filter(([, rows]) => rows.length).map(([id]) => id), ids, "conditional item/perk complex");
  return ids.map((id) => {
    const rows = occurrences.get(id);
    const names = sortedUnique(rows.map((row) => clean(row.passive.name)));
    const descriptions = sortedUnique(rows.map((row) => clean(row.passive.text)));
    if (names.length !== 1) fail(`item/perk complex ${id} has conflicting projected names`);
    if (descriptions.length !== 1) fail(`item/perk complex ${id} has conflicting projected descriptions`);
    const carriers = rows.map(({ item, perk }) => Object.freeze({
      kind: perk ? "skill_core" : "innate_item_passive",
      itemId: item.id,
      itemName: clean(item.name),
      equipmentType: item.equipmentType,
      ...(perk ? { perkId: perk.id, perkName: clean(perk.name) } : {}),
    })).sort((left, right) => codepointSort(`${left.itemId}:${left.perkId ?? ""}`, `${right.itemId}:${right.perkId ?? ""}`));
    const weaponRequirements = rows.flatMap(({ item, perk }) => {
      const values = [perk?.weapon, WEAPON_TYPES.has(item.equipmentType) ? item.equipmentType : null];
      return values.filter((value) => WEAPON_TYPES.has(value));
    });
    const sourceEdges = carriers.map((carrier) => Object.freeze({
      from: carrier.perkId ?? carrier.itemId,
      relation: carrier.perkId ? "skill_core_activates_complex" : "item_activates_complex",
      to: id,
      projectionPath: carrier.perkId
        ? `data.items[id=${carrier.itemId}].availablePerks[id=${carrier.perkId}].passive`
        : `data.items[id=${carrier.itemId}].passives`,
    }));
    return shell({
      family: SCENARIO_EFFECT_FAMILIES.itemPerkComplex,
      sourceId: id,
      name: names[0],
      description: descriptions[0],
      carriers,
      weaponRequirements,
      supportState: SCENARIO_EFFECT_SUPPORT_STATES.cataloguedUnmodeled,
      scenarioRule: EXECUTABLE_SCENARIO_RULE_REFERENCES[id] ?? null,
      provenance: projectionProvenance("itemPerkComplex", `union(data.items[].passives.id, data.items[].availablePerks[].passive.id)[id=${id}]`),
      sourceEdges,
    });
  });
}

function setEffects(itemSets) {
  const setById = new Map(itemSets.map((row) => [row.id, row]));
  return SET_CONDITIONAL_COMPONENTS.map((component) => {
    const separator = component.key.lastIndexOf(":");
    const setId = component.key.slice(0, separator);
    const count = Number(component.key.slice(separator + 1));
    const set = setById.get(setId);
    if (!set) fail(`conditional set component ${component.key} references a missing set`);
    const bonusIndex = (set.itemSetBonus ?? []).findIndex((row) => Number(row.set_count) === count);
    if (bonusIndex < 0) fail(`conditional set component ${component.key} references a missing breakpoint`);
    const bonus = set.itemSetBonus[bonusIndex];
    const description = (bonus.bonus_passive ?? []).map((row) => clean(row.text || row.name)).filter(Boolean).join(" / ");
    const carriers = (set.itemSetMadeOfItems ?? []).map((item) => Object.freeze({
      kind: "set_piece",
      itemId: item.id,
      itemName: clean(item.name),
      equipmentType: item.sub_category ?? null,
    })).sort((left, right) => codepointSort(left.itemId, right.itemId));
    const supportState = component.componentKind === "whole_breakpoint"
      ? SCENARIO_EFFECT_SUPPORT_STATES.unsupportedStaticCalculator
      : SCENARIO_EFFECT_SUPPORT_STATES.staticComponentOnly;
    return shell({
      family: SCENARIO_EFFECT_FAMILIES.setBreakpointConditional,
      sourceId: component.key,
      name: `${set.name} ${count}-piece conditional component`,
      description,
      carriers,
      weaponRequirements: [],
      supportState,
      componentKind: component.componentKind,
      staticComponent: component.staticComponent ?? null,
      reason: component.reason ?? "The persistent component is calculated separately; the conditional remainder requires a combat-stage model.",
      provenance: [
        Object.freeze({ kind: "projection", path: PROJECTION_PATHS.setBreakpointConditional, selector: `data.itemSets[id=${setId}].itemSetBonus[set_count=${count}]` }),
        Object.freeze({ kind: "static_calculation_boundary", path: "web/tl-core.js", selector: `set breakpoint ${component.key}` }),
        Object.freeze({ kind: "audit", path: "docs/set-effect-audit-2026-07-13.md", selector: component.componentKind }),
      ],
      sourceEdges: [Object.freeze({
        from: setId,
        relation: "activates_breakpoint",
        to: component.key,
        projectionPath: `data.itemSets[id=${setId}].itemSetBonus[${bonusIndex}]`,
        requiredPieces: count,
      })],
    });
  });
}

function countByFamily(effects) {
  const result = {};
  for (const family of Object.values(SCENARIO_EFFECT_FAMILIES)) result[family] = effects.filter((row) => row.sourceFamily === family).length;
  return Object.freeze(result);
}

function countBySupportState(effects) {
  const result = {};
  for (const state of Object.values(SCENARIO_EFFECT_SUPPORT_STATES)) result[state] = effects.filter((row) => row.supportState === state).length;
  return Object.freeze(result);
}

export function buildScenarioEffectCatalog({
  skillsProjection,
  progressionProjection,
  equipmentProjection,
  contract = PASSIVE_EFFECT_CONTRACT,
}) {
  const gameBuild = requiredText(contract?.gameBuild, "contract.gameBuild");
  if (contract?.schema !== "tl-helper.passive-effect-contract" || contract?.schemaVersion !== 1) fail("passive-effect contract is unsupported");
  if (Object.hasOwn(contract, "defaultClassification")) fail("passive-effect contract must not define a default classification");
  assertProjection(skillsProjection, "tl-helper.web-data", gameBuild, "skills projection");
  assertProjection(progressionProjection, "tl-helper.web-data", gameBuild, "progression projection");
  assertProjection(equipmentProjection, "tl-helper.web-data", gameBuild, "equipment projection");

  const effects = [
    ...weaponPassiveEffects(skillsProjection.data.skills ?? [], contract),
    ...masteryEffects(progressionProjection.data.masteries ?? [], contract),
    ...itemComplexEffects(equipmentProjection.data.items ?? [], contract),
    ...setEffects(equipmentProjection.data.itemSets ?? []),
  ].sort((left, right) => codepointSort(left.catalogId, right.catalogId));

  if (new Set(effects.map((row) => row.catalogId)).size !== effects.length) fail("catalog IDs must be unique");
  if (effects.length !== 530) fail(`expected 530 conditional effect shells, received ${effects.length}`);

  return Object.freeze({
    schema: SCENARIO_EFFECT_CATALOG_SCHEMA,
    schemaVersion: SCENARIO_EFFECT_CATALOG_SCHEMA_VERSION,
    gameBuild,
    sourceContract: Object.freeze({ schema: contract.schema, schemaVersion: contract.schemaVersion }),
    sourceProjections: Object.freeze({
      skills: Object.freeze({ schema: skillsProjection.schema, schemaVersion: skillsProjection.schemaVersion, generatedAtUtc: skillsProjection.generatedAtUtc }),
      progression: Object.freeze({ schema: progressionProjection.schema, schemaVersion: progressionProjection.schemaVersion, generatedAtUtc: progressionProjection.generatedAtUtc }),
      equipment: Object.freeze({ schema: equipmentProjection.schema, schemaVersion: equipmentProjection.schemaVersion, generatedAtUtc: equipmentProjection.generatedAtUtc }),
    }),
    policy: Object.freeze({
      executableSemantics: "explicit_reviewed_rules_only",
      descriptionInference: false,
      limitation: "Only entries with an explicit executableSemantics reference may be evaluated. Every other entry remains a non-executable work-queue shell, and descriptions never create rules.",
    }),
    counts: Object.freeze({
      total: effects.length,
      byFamily: countByFamily(effects),
      bySupportState: countBySupportState(effects),
    }),
    effects: Object.freeze(effects),
  });
}

export function serializeScenarioEffectCatalog(catalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}
