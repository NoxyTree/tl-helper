import assert from "node:assert/strict";
import test from "node:test";
import {
  ABILITY_DEFINITION_SCHEMA,
  ABILITY_DEFINITION_SCHEMA_VERSION,
  normalizeAbilityDefinition,
  validateAbilityDefinition,
} from "../../packages/combat-engine/src/ability-definition.mjs";

function evidence(overrides = {}) {
  return { kind: "decoded_row", reference: "TLFormulaParameterNew:row_1", gameBuild: "24118850", ...overrides };
}

function validDefinition(overrides = {}) {
  const dynamicStatIds = ["attack_power", "None", null, null, null, null];
  return {
    schema: ABILITY_DEFINITION_SCHEMA,
    schemaVersion: ABILITY_DEFINITION_SCHEMA_VERSION,
    gameBuild: "24118850",
    id: "skill.gaia_crash",
    abilityId: "skill.gaia_crash",
    skillSetId: "SkillSet_WP_SW2_S_GaiaCrash",
    name: "Gaia Crash",
    weapon: "greatsword",
    skillType: "active",
    kind: "damage",
    skillLevelRange: { minimum: 1, maximum: 5 },
    formulaComponents: [{
      id: "damage.base",
      gameBuild: "24118850",
      skillLevelRange: { minimum: 1, maximum: 5 },
      sourceTable: "TLFormulaParameterNew",
      sourceRow: "row_1",
      formulaType: "kAmountFromAttackPower",
      rawCoefficients: { mul: [50000n, 51000, 52000, 53000, 54000], add: [53, 54, 55, 56, 57] },
      units: { mul: "basis_points", add: "flat_damage", tooltip: "display_percent", output: "damage" },
      precision: "verified_exact",
      provenance: "extracted",
      evidence: [evidence()],
      role: "magnitude",
      effectKind: "damage",
      mappingClass: "exact",
      mappingEvidence: [{ field: "tooltip1" }],
      rawLevels: Array.from({ length: 5 }, (_, index) => ({
        skillLevel: index + 1,
        formulaType: "kAmountFromAttackPower",
        mul: 50000 + index * 1000,
        add: 53 + index,
        dynamicStatIds,
        raw: { skill_level: index + 1, formula_type: "kAmountFromAttackPower", mul: 50000 + index * 1000, add: 53 + index },
      })),
      dynamicStatIdsByLevel: Array.from({ length: 5 }, (_, index) => ({ skillLevel: index + 1, dynamicStatIds })),
      source: {
        table: "TLFormulaParameterNew", rowId: "row_1", gameBuild: "24118850",
        sourcePath: "D:/TL_Data/decoded/TLFormulaParameterNew.json", sourceSha256: "abc123", decoderVersion: "1.0.0",
      },
    }],
    source: { gameBuild: "24118850", skillProjection: "skills", skillFormulaMapSchema: "tl-helper.skill-formula-map" },
    unresolvedStages: [{
      id: "target.mitigation",
      gameBuild: "24118850",
      stage: "mitigation",
      reason: "The client-visible armor contest curve has not been calibrated.",
      classification: "calibration_required",
      precision: "unsupported",
      provenance: "unresolved",
      evidence: [{ kind: "audit", reference: "plans/combat-simulator/unknown-formulas.md#mitigation", gameBuild: "24118850" }],
    }],
    ...overrides,
  };
}

test("ability definitions normalize raw values into an immutable build-scoped contract", () => {
  const input = validDefinition();
  const normalized = normalizeAbilityDefinition(input);
  assert.deepEqual(normalized.formulaComponents[0].rawCoefficients.mul, ["50000", "51000", "52000", "53000", "54000"]);
  assert.deepEqual(normalized.formulaComponents[0].rawCoefficients.add, ["53", "54", "55", "56", "57"]);
  assert.equal(normalized.skillSetId, "SkillSet_WP_SW2_S_GaiaCrash");
  assert.equal(normalized.skillType, "active");
  assert.equal(normalized.formulaComponents[0].role, "magnitude");
  assert.equal(normalized.formulaComponents[0].mappingClass, "exact");
  assert.equal(normalized.formulaComponents[0].rawLevels[4].skillLevel, 5);
  assert.equal(normalized.formulaComponents[0].source.sourceSha256, "abc123");
  assert.equal(validateAbilityDefinition(input), true);
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.formulaComponents));
  assert.ok(Object.isFrozen(normalized.formulaComponents[0].rawCoefficients.mul));
  assert.ok(Object.isFrozen(normalized.unresolvedStages[0].evidence[0]));
  assert.throws(() => { normalized.name = "Changed"; }, TypeError);
  assert.throws(() => { normalized.formulaComponents[0].rawCoefficients.add = "99"; }, TypeError);

  input.formulaComponents[0].rawCoefficients.add[0] = 999;
  input.unresolvedStages[0].evidence[0].reference = "changed";
  assert.equal(normalized.formulaComponents[0].rawCoefficients.add[0], "53");
  assert.match(normalized.unresolvedStages[0].evidence[0].reference, /unknown-formulas/);
});

test("schema, safe identity, kind, level, and usable content are mandatory", () => {
  assert.throws(() => normalizeAbilityDefinition(validDefinition({ schema: "other" })), /schema/);
  assert.throws(() => normalizeAbilityDefinition(validDefinition({ schemaVersion: 2 })), /schemaVersion/);
  assert.throws(() => normalizeAbilityDefinition(validDefinition({ id: "../unsafe" })), /safe identifier/);
  assert.throws(() => normalizeAbilityDefinition(validDefinition({ weapon: "great sword" })), /safe identifier/);
  assert.throws(() => normalizeAbilityDefinition(validDefinition({ kind: "explosion" })), /Unknown ability kind/);
  assert.throws(() => normalizeAbilityDefinition(validDefinition({ skillLevelRange: { minimum: 5, maximum: 1 } })), /must not exceed/);
  assert.throws(() => normalizeAbilityDefinition(validDefinition({ formulaComponents: [], unresolvedStages: [] })), /requires a formula component/);
});

test("all nested evidence and source rows must use the ability build", () => {
  const mixedComponent = validDefinition();
  mixedComponent.formulaComponents[0].gameBuild = "24118851";
  assert.throws(() => normalizeAbilityDefinition(mixedComponent), /does not match ability gameBuild/);

  const mixedEvidence = validDefinition();
  mixedEvidence.formulaComponents[0].evidence[0].gameBuild = "24118851";
  assert.throws(() => normalizeAbilityDefinition(mixedEvidence), /does not match ability gameBuild/);

  const mixedUnresolved = validDefinition();
  mixedUnresolved.unresolvedStages[0].gameBuild = "24118851";
  assert.throws(() => normalizeAbilityDefinition(mixedUnresolved), /does not match ability gameBuild/);
});

test("formula components require reviewed provenance, units, raw coefficients, and evidence", () => {
  for (const mutate of [
    (component) => { component.sourceTable = ""; },
    (component) => { component.sourceRow = "row with spaces"; },
    (component) => { component.formulaType = ""; },
    (component) => { component.rawCoefficients = {}; },
    (component) => { component.units = { mul: "basis_points" }; },
    (component) => { component.evidence = []; },
    (component) => { component.precision = "probably_exact"; },
    (component) => { component.provenance = "guessed"; },
    (component) => { component.provenance = "modeled"; },
  ]) {
    const input = validDefinition();
    mutate(input.formulaComponents[0]);
    assert.throws(() => normalizeAbilityDefinition(input));
  }
});

test("component levels cannot escape the declared ability range", () => {
  const input = validDefinition();
  input.formulaComponents[0].skillLevelRange = { minimum: 1, maximum: 6 };
  assert.throws(() => normalizeAbilityDefinition(input), /outside the ability skillLevelRange/);
});

test("reviewed ingestion fields are mandatory and level arrays must agree", () => {
  for (const mutate of [
    (component) => { delete component.role; },
    (component) => { component.mappingClass = "substring_guess"; },
    (component) => { delete component.source.sourcePath; },
    (component) => { component.source.gameBuild = "other-build"; },
    (component) => { component.rawCoefficients.mul.pop(); },
    (component) => { component.rawLevels.pop(); },
    (component) => { component.rawLevels[1].skillLevel = 1; },
    (component) => { component.rawLevels[1].formulaType = "kOtherFormula"; },
    (component) => { component.rawLevels[1].mul = 99999; },
    (component) => { component.dynamicStatIdsByLevel[1].dynamicStatIds = ["different_stat", "None", null, null, null, null]; },
  ]) {
    const input = validDefinition();
    mutate(input.formulaComponents[0]);
    assert.throws(() => normalizeAbilityDefinition(input));
  }
});

test("root reviewed skill and source metadata survive normalization", () => {
  const normalized = normalizeAbilityDefinition(validDefinition());
  assert.deepEqual(normalized.source, {
    gameBuild: "24118850",
    skillProjection: "skills",
    skillFormulaMapSchema: "tl-helper.skill-formula-map",
  });
  assert.equal(normalized.abilityId, normalized.id);
  assert.equal(normalized.skillSetId, "SkillSet_WP_SW2_S_GaiaCrash");
  assert.throws(() => normalizeAbilityDefinition(validDefinition({ abilityId: "another-id" })), /must match id/);
  const mixedSource = validDefinition();
  mixedSource.source.gameBuild = "24118851";
  assert.throws(() => normalizeAbilityDefinition(mixedSource), /does not match ability gameBuild/);
});

test("unresolved stages remain explicit, evidenced, and non-executable", () => {
  const badPrecision = validDefinition();
  badPrecision.unresolvedStages[0].precision = "modeled";
  assert.throws(() => normalizeAbilityDefinition(badPrecision), /must use unsupported precision/);

  const noEvidence = validDefinition();
  noEvidence.unresolvedStages[0].evidence = [];
  assert.throws(() => normalizeAbilityDefinition(noEvidence), /at least one evidence/);

  const unknownClassification = validDefinition();
  unknownClassification.unresolvedStages[0].classification = "maybe";
  assert.throws(() => normalizeAbilityDefinition(unknownClassification), /Unknown/);
});

test("duplicate component and unresolved stage identifiers are rejected", () => {
  const components = validDefinition();
  components.formulaComponents.push(structuredClone(components.formulaComponents[0]));
  assert.throws(() => normalizeAbilityDefinition(components), /Duplicate formula component id/);

  const stages = validDefinition();
  stages.unresolvedStages.push(structuredClone(stages.unresolvedStages[0]));
  assert.throws(() => normalizeAbilityDefinition(stages), /Duplicate unresolved stage id/);
});
