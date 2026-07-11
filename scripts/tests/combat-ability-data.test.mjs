import test from "node:test";
import assert from "node:assert/strict";
import { buildCombatAbilityData } from "../lib/combat-ability-data.mjs";
import { validateAbilityDefinition } from "../../packages/combat-engine/src/ability-definition.mjs";

const BUILD = "24118850";
const cases = [
  ["judgment-lightning", "SkillSet_WP_ST_S_PowerAttack", "Judgment Lightning", "damage", "ST_PowerAttack_DD", "kAmountFromAttackPower", "exact", "derived_high_confidence", "derived"],
  ["swift-healing", "SkillSet_WP_WA_GR_S_Heal", "Swift Healing", "healing", "WA_Heal_Heal", "kAmountFromAttackPower", "derived", "derived_high_confidence", "derived"],
  ["distortion-veil", "SkillSet_WP_ORB_Active_Shield", "Distortion Veil", "shielding", "ORB_Active_Shield_ShieldHp", "kAmountFromTargetHpMax", "exact", "verified_exact", "extracted"],
];

function fixture() {
  const skills = cases.map(([, id, name]) => ({
    id, name,
    mainCategory: id.includes("WA_") ? "wand" : id.includes("ORB_") ? "orb" : "sword2h",
    skillType: "active",
    levels: [
      { level: 2, cooldown: 10, description: `${name} two` },
      { level: 1, cooldown: 10, description: `${name} one` },
    ],
  }));
  const mappings = cases.map(([, skillSetId, , , formulaRowId, , mappingClass]) => ({
    skillSetId,
    classification: mappingClass,
    formulaRows: [{ formulaRowId, mappingClass, evidence: [{ field: "tooltip1" }] }],
  }));
  const rows = Object.fromEntries(cases.map(([, , , , formulaRowId, formulaType], index) => [formulaRowId, {
    FormulaParameter: [2, 1].map((skill_level) => ({
      skill_level,
      formula_type: `EFormulaType::${formulaType}`,
      min: index + skill_level,
      max: index + skill_level + 1,
      add: 53,
      mul: 50000,
      mul2: 7,
      mul3: 8,
      dynamic_stat_id1: "attack_power_main_hand",
      dynamic_stat_id2: "None",
      dynamic_stat_id3: "target_hp_max",
      dynamic_stat_id4: "None",
      dynamic_stat_id5: "None",
      dynamic_stat_id6: "None",
      tooltip1: skill_level === 2 ? 115.5 : 500,
      tooltip2: 53,
    })),
  }]));
  const reviewedAbilities = cases.map(([abilityId, skillSetId, , effectKind, formulaRowId, , , precision, provenance]) => ({
    abilityId,
    skillSetId,
    effectKind,
    components: [{
      id: "primary",
      formulaRowId,
      role: "magnitude",
      effectKind,
      units: Object.fromEntries(["min", "max", "add", "mul", "mul2", "mul3", "tooltip1", "tooltip2"]
        .map((key) => [key, "decoded-unit"])),
      precision,
      provenance,
      evidence: [{ kind: "review", reference: "initial-validation-cases.md" }],
    }],
    unresolvedStages: [
      {
        id: "rounding-order", stage: "rounding-order", reason: "Live rounding order is not calibrated.",
        classification: "calibration_required", evidence: [{ kind: "audit", reference: "unknown-formulas.md" }],
      },
      {
        id: "base-damage-selection", stage: "base-damage-selection", reason: "Base damage selection is not confirmed.",
        classification: "calibration_required", evidence: [{ kind: "audit", reference: "unknown-formulas.md" }],
      },
    ],
  }));
  return {
    skillsProjection: { gameBuild: BUILD, projection: "skills", data: { skills } },
    skillFormulaMap: { gameBuild: BUILD, schema: "tl-helper.skill-formula-map", skills: mappings },
    formulaTable: {
      gameBuild: BUILD,
      table: "TLFormulaParameterNew",
      sourcePath: "D:/TL_Extracted/TLFormulaParameterNew.uasset",
      sha256: "abc123",
      decoderVersion: "0.1.0",
      rows,
    },
    requestedBuild: BUILD,
    reviewedAbilities,
  };
}

test("builds deterministic reviewed bundles for damage, healing, and shielding", () => {
  const input = fixture();
  const result = buildCombatAbilityData(input);
  assert.equal(result.schema, "tl-helper.combat-ability-data");
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.gameBuild, BUILD);
  assert.deepEqual(result.abilities.map((ability) => [ability.abilityId, ability.kind]), [
    ["distortion-veil", "shielding"],
    ["judgment-lightning", "damage"],
    ["swift-healing", "healing"],
  ]);

  const judgment = result.abilities.find((ability) => ability.abilityId === "judgment-lightning");
  assert.deepEqual(judgment.skillLevelRange, { minimum: 1, maximum: 2 });
  assert.deepEqual(judgment.unresolvedStages.map((stage) => stage.id), [
    "base-damage-selection", "rounding-order",
  ]);
  const component = judgment.formulaComponents[0];
  assert.equal(component.mappingClass, "exact");
  assert.equal(component.precision, "derived_high_confidence");
  assert.equal(component.provenance, "derived");
  assert.deepEqual(component.skillLevelRange, { minimum: 1, maximum: 2 });
  assert.equal(component.formulaType, "EFormulaType::kAmountFromAttackPower");
  assert.deepEqual(component.rawCoefficients.mul, ["50000", "50000"]);
  assert.deepEqual(component.rawCoefficients.tooltip1, ["500", "115.5"]);
  assert.deepEqual(component.dynamicStatIdsByLevel[0].dynamicStatIds.slice(0, 3), [
    "attack_power_main_hand", "None", "target_hp_max",
  ]);
  assert.deepEqual(component.rawLevels[0].raw, input.formulaTable.rows.ST_PowerAttack_DD.FormulaParameter[1]);
  assert.equal(component.rawLevels[0].mul, "50000");
  assert.equal(component.rawLevels[1].tooltip1, "115.5");
  assert.equal(component.rawLevels[0].dynamicStatIds[1], "None");
  assert.deepEqual(component.source, {
    table: "TLFormulaParameterNew",
    rowId: "ST_PowerAttack_DD",
    gameBuild: BUILD,
    sourcePath: "D:/TL_Extracted/TLFormulaParameterNew.uasset",
    sourceSha256: "abc123",
    decoderVersion: "0.1.0",
  });
  assert.equal(JSON.stringify(result), JSON.stringify(buildCombatAbilityData(input)));
  for (const ability of result.abilities) {
    validateAbilityDefinition(ability);
  }
});

test("rejects mixed builds", () => {
  const input = fixture();
  input.formulaTable.gameBuild = "999";
  assert.throws(() => buildCombatAbilityData(input), /formula table build 999 does not match/);
});

test("rejects reviewed rows absent from mapping or decoded table", () => {
  const notMapped = fixture();
  notMapped.reviewedAbilities[0].components[0].formulaRowId = "SW2_Unreviewed_DD";
  assert.throws(() => buildCombatAbilityData(notMapped), /is not mapped/);

  const notDecoded = fixture();
  delete notDecoded.formulaTable.rows.ST_PowerAttack_DD;
  assert.throws(() => buildCombatAbilityData(notDecoded), /missing from decoded formula data/);
});

test("rejects duplicate skill and formula levels", () => {
  const skillDuplicate = fixture();
  skillDuplicate.skillsProjection.data.skills[0].levels.push({ level: 1 });
  assert.throws(() => buildCombatAbilityData(skillDuplicate), /duplicate skill level/);

  const formulaDuplicate = fixture();
  formulaDuplicate.formulaTable.rows.ST_PowerAttack_DD.FormulaParameter.push({ skill_level: 1 });
  assert.throws(() => buildCombatAbilityData(formulaDuplicate), /duplicate formula level/);
});

test("requires unresolved stages to be an explicit reviewed decision", () => {
  const input = fixture();
  delete input.reviewedAbilities[0].unresolvedStages;
  assert.throws(() => buildCombatAbilityData(input), /must explicitly provide unresolvedStages/);
});
