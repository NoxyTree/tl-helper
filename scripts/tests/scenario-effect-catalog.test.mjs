import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { PASSIVE_EFFECT_CONTRACT } from "../../web/tl-passive-effect-contract.js";
import { UNSUPPORTED_SET_BREAKPOINTS } from "../../web/tl-core.js";
import { DISTANCE_EFFECT_DEFINITIONS } from "../../web/tl-distance-scenario-effects.js";
import { SCENARIO_EFFECT_DEFINITIONS } from "../../web/tl-scenario-effects.js";
import { buildScenarioEffectCatalogFile } from "../build-scenario-effect-catalog.mjs";
import {
  SCENARIO_EFFECT_CATALOG_SCHEMA,
  SCENARIO_EFFECT_CATALOG_SCHEMA_VERSION,
  EXECUTABLE_SCENARIO_RULE_REFERENCES,
  SET_CONDITIONAL_COMPONENTS,
  buildScenarioEffectCatalog,
  serializeScenarioEffectCatalog,
} from "../lib/scenario-effect-catalog.mjs";

const projection = (name) => JSON.parse(readFileSync(new URL(`../../web/data/projections/${name}.json`, import.meta.url), "utf8"));
const inputs = () => ({
  skillsProjection: projection("skills"),
  progressionProjection: projection("progression"),
  equipmentProjection: projection("equipment"),
});
const sorted = (values) => [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
const conditionalIds = (family) => PASSIVE_EFFECT_CONTRACT.families[family].classes.conditional;

test("catalogue covers the exact conditional source universe", () => {
  const catalog = buildScenarioEffectCatalog(inputs());
  assert.equal(catalog.schema, SCENARIO_EFFECT_CATALOG_SCHEMA);
  assert.equal(catalog.schemaVersion, SCENARIO_EFFECT_CATALOG_SCHEMA_VERSION);
  assert.equal(catalog.gameBuild, "24118850");
  assert.deepEqual(catalog.counts, {
    total: 530,
    byFamily: {
      weaponPassive: 62,
      masteryNonStructured: 159,
      itemPerkComplex: 286,
      setBreakpointConditional: 23,
    },
    bySupportState: {
      catalogued_unmodeled: 501,
      scenario_executable_decoded: 6,
      unsupported_static_calculator: 9,
      static_component_only: 14,
    },
  });

  for (const family of ["weaponPassive", "masteryNonStructured", "itemPerkComplex"]) {
    const actual = catalog.effects.filter((row) => row.sourceFamily === family).map((row) => row.sourceId);
    assert.deepEqual(sorted(actual), sorted(conditionalIds(family)), `${family} conditional universe drifted`);
  }
  assert.deepEqual(
    sorted(catalog.effects.filter((row) => row.sourceFamily === "setBreakpointConditional").map((row) => row.sourceId)),
    sorted(SET_CONDITIONAL_COMPONENTS.map((row) => row.key)),
  );
});

test("set component registry separates nine whole unsupported breakpoints from fourteen calculated-static remainders", () => {
  const whole = SET_CONDITIONAL_COMPONENTS.filter((row) => row.componentKind === "whole_breakpoint");
  const remainder = SET_CONDITIONAL_COMPONENTS.filter((row) => row.componentKind === "conditional_remainder");
  assert.equal(whole.length, 9);
  assert.equal(remainder.length, 14);
  assert.equal(new Set(SET_CONDITIONAL_COMPONENTS.map((row) => row.key)).size, 23);
  assert.deepEqual(sorted(whole.map((row) => row.key)), sorted(Object.keys(UNSUPPORTED_SET_BREAKPOINTS)));
  assert.equal(whole.every((row) => row.reason && !Object.hasOwn(row, "staticComponent")), true);
  assert.equal(remainder.every((row) => row.staticComponent), true);
});

test("every entry is an explicit shell with provenance, edges, and no inferred executable default", () => {
  const catalog = buildScenarioEffectCatalog(inputs());
  assert.equal(catalog.policy.executableSemantics, "explicit_reviewed_rules_only");
  assert.equal(catalog.policy.descriptionInference, false);
  assert.equal(Object.hasOwn(catalog, "defaultEffect"), false);
  assert.equal(Object.hasOwn(catalog, "defaultSupportState"), false);
  assert.equal(new Set(catalog.effects.map((row) => row.catalogId)).size, 530);
  for (const effect of catalog.effects) {
    assert.ok(effect.sourceId);
    assert.ok(effect.name);
    assert.ok(effect.description);
    assert.ok(Array.isArray(effect.carriers) && effect.carriers.length > 0, `${effect.catalogId} has no carriers`);
    assert.ok(Array.isArray(effect.weaponRequirements));
    assert.ok(Array.isArray(effect.provenance) && effect.provenance.length >= 2, `${effect.catalogId} lacks provenance`);
    assert.ok(Array.isArray(effect.sourceEdges) && effect.sourceEdges.length > 0, `${effect.catalogId} lacks source edges`);
    assert.deepEqual(effect.unresolvedFields, sorted(effect.unresolvedFields), `${effect.catalogId} unresolved fields are not sorted`);
    assert.equal(Object.hasOwn(effect, "trigger"), false);
    assert.equal(Object.hasOwn(effect, "formula"), false);
    if (effect.supportState === "scenario_executable_decoded") {
      assert.ok(["decoded_exact_coefficients", "decoded_exact_fixed_amount"].includes(effect.precision.stage));
      assert.ok(["reviewed_distance_scenario", "reviewed_ordinary_day_night_scenario"].includes(effect.precision.semantics));
      assert.equal(effect.precision.executable, true);
      assert.ok(effect.executableSemantics);
      assert.ok(effect.unresolvedFields.length === 1 && ["serverRounding", "eclipseState"].includes(effect.unresolvedFields[0]));
    } else {
      assert.equal(effect.precision.stage, "unsupported");
      assert.equal(effect.precision.semantics, "unresolved");
      assert.equal(effect.precision.executable, false);
      assert.equal(effect.executableSemantics, null);
      assert.ok(effect.unresolvedFields.includes("trigger"));
      assert.ok(effect.unresolvedFields.includes("formula"));
    }
  }
});

test("only the six reviewed decoded scenario rules are promoted to deterministic executable references", () => {
  const catalog = buildScenarioEffectCatalog(inputs());
  const expectedIds = [
    "Bow_Normal_Attack_Skill",
    "SkillSet_WP_BO_S_DistanceCritical",
    "SkillSet_WP_CR_CR_S_DistanceRangeAcc",
    "SkillSet_WP_Item_kA_CR_61",
    "SkillSet_WP_Item_kA_DA_61_2",
    "SkillSet_WP_Item_kA_ST_55",
  ];
  assert.deepEqual(Object.keys(EXECUTABLE_SCENARIO_RULE_REFERENCES), expectedIds);
  const executable = catalog.effects.filter((row) => row.supportState === "scenario_executable_decoded");
  assert.deepEqual(sorted(executable.map((row) => row.sourceId)), expectedIds);

  for (const effect of executable) {
    const reference = effect.executableSemantics;
    assert.deepEqual(reference, EXECUTABLE_SCENARIO_RULE_REFERENCES[effect.sourceId]);
    assert.equal(reference.definitionKey, effect.sourceId);
    assert.equal(reference.gameBuild, "24118850");
    assert.ok(["target_distance", "time_of_day"].includes(reference.mechanic));
    assert.ok(SCENARIO_EFFECT_DEFINITIONS[effect.sourceId]);
    assert.notEqual(SCENARIO_EFFECT_DEFINITIONS[effect.sourceId].executable, false);
    if (reference.mechanic === "target_distance") {
      assert.equal(reference.modulePath, "web/tl-distance-scenario-effects.js");
      assert.equal(reference.evaluatorExport, "evaluateDistanceScenarioEffects");
      assert.equal(reference.definitionsExport, "DISTANCE_EFFECT_DEFINITIONS");
      assert.deepEqual(reference.requiredScenarioInputs, ["targetDistanceMeters"]);
      assert.deepEqual(reference.unresolvedFields, ["serverRounding"]);
    } else {
      assert.equal(reference.modulePath, "web/tl-time-of-day-scenario-effects.js");
      assert.equal(reference.evaluatorExport, "evaluateTimeOfDayScenarioEffects");
      assert.equal(reference.definitionsExport, "TIME_OF_DAY_EFFECT_DEFINITIONS");
      assert.deepEqual(reference.requiredScenarioInputs, ["environment.timeOfDay"]);
      assert.deepEqual(reference.unresolvedFields, ["eclipseState"]);
    }
    assert.equal(effect.provenance.some((row) => row.kind === "decoded_executable_rule" && row.path === reference.modulePath), true);
    assert.equal(effect.sourceEdges.some((row) => row.relation === "executed_by_reviewed_rule" && row.to === reference.ruleId), true);
  }

  const predatorsFocus = catalog.effects.find((row) => row.sourceId === "Crossbow_Normal_Util_Skill");
  assert.ok(predatorsFocus);
  assert.equal(predatorsFocus.supportState, "catalogued_unmodeled");
  assert.equal(predatorsFocus.precision.executable, false);
  assert.equal(predatorsFocus.executableSemantics, null);
  assert.ok(predatorsFocus.unresolvedFields.includes("trigger"));
  assert.equal(DISTANCE_EFFECT_DEFINITIONS.Crossbow_Normal_Util_Skill.executable, false);
});

test("catalogue and checked-in browser artifact are deterministically ordered and byte reproducible", () => {
  const catalog = buildScenarioEffectCatalog(inputs());
  const ids = catalog.effects.map((row) => row.catalogId);
  assert.deepEqual(ids, sorted(ids));
  const serialized = serializeScenarioEffectCatalog(catalog);
  assert.equal(serialized, serializeScenarioEffectCatalog(buildScenarioEffectCatalog(inputs())));
  assert.equal(serialized, readFileSync(new URL("../../web/data/scenario-effects.json", import.meta.url), "utf8"));
});

test("build script emits the same build-scoped artifact", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "tl-scenario-effects-"));
  try {
    const outputFile = path.join(directory, "scenario-effects.json");
    const { catalog } = buildScenarioEffectCatalogFile({ outputFile });
    assert.equal(readFileSync(outputFile, "utf8"), serializeScenarioEffectCatalog(catalog));
    assert.equal(catalog.gameBuild, "24118850");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("projection drift fails closed instead of receiving a default semantic class", () => {
  const source = inputs();
  const drifted = structuredClone(source.skillsProjection);
  const missingId = conditionalIds("weaponPassive")[0];
  drifted.data.skills = drifted.data.skills.filter((row) => row.id !== missingId);
  assert.throws(
    () => buildScenarioEffectCatalog({ ...source, skillsProjection: drifted }),
    new RegExp(`conditional weapon passive universe drifted.*${missingId}`),
  );

  const wrongBuild = structuredClone(source.progressionProjection);
  wrongBuild.gameBuild = "999";
  assert.throws(
    () => buildScenarioEffectCatalog({ ...source, progressionProjection: wrongBuild }),
    /progression projection gameBuild does not match 24118850/,
  );
});
