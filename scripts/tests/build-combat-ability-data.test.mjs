import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildCombatAbilityDataFiles } from "../build-combat-ability-data.mjs";

const BUILD = "12345";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value)}\n`, "utf8");
}

function fixture(directory) {
  const skillsFile = path.join(directory, "skills.json");
  const skillFormulaMapFile = path.join(directory, "map.json");
  const formulaTableFile = path.join(directory, "formula.json");
  const reviewFile = path.join(directory, "review.json");
  const outputFile = path.join(directory, "nested", "combat-abilities.json");
  const browserOutputFile = path.join(directory, "web", "combat-abilities.json");
  const row = {
    skill_level: 1,
    formula_type: "EFormulaType::kAmountFromAttackPower",
    min: 0,
    max: 0,
    add: 10,
    mul: 20000,
    mul2: 0,
    mul3: 0,
    dynamic_stat_id1: "None",
    dynamic_stat_id2: "None",
    dynamic_stat_id3: "None",
    dynamic_stat_id4: "None",
    dynamic_stat_id5: "None",
    dynamic_stat_id6: "None",
    tooltip1: 200,
    tooltip2: 10,
  };
  writeJson(skillsFile, {
    gameBuild: BUILD,
    projection: "skills",
    data: { skills: [{
      id: "SkillSet_Test", name: "Test Ability", mainCategory: "test", skillType: "active", levels: [{ level: 1 }],
    }] },
  });
  writeJson(skillFormulaMapFile, {
    schema: "tl-helper.skill-formula-map",
    gameBuild: BUILD,
    skills: [{
      skillSetId: "SkillSet_Test",
      classification: "exact",
      formulaRows: [{ formulaRowId: "Test_Row", mappingClass: "exact", evidence: [{ field: "tooltip1" }] }],
    }],
  });
  writeJson(formulaTableFile, {
    table: "TLFormulaParameterNew",
    gameBuild: BUILD,
    sourcePath: "D:/source.uasset",
    sha256: "abc",
    decoderVersion: "1",
    rows: { Test_Row: { FormulaParameter: [row] } },
  });
  writeJson(reviewFile, {
    schema: "tl-helper.reviewed-combat-abilities",
    schemaVersion: 1,
    reviewedGameBuild: BUILD,
    abilities: [{
      abilityId: "test-ability",
      skillSetId: "SkillSet_Test",
      kind: "damage",
      components: [{
        id: "primary",
        formulaRowId: "Test_Row",
        role: "magnitude",
        effectKind: "damage",
        units: Object.fromEntries(["min", "max", "add", "mul", "mul2", "mul3", "tooltip1", "tooltip2"]
          .map((key) => [key, "raw_unit"])),
        precision: "verified_exact",
        provenance: "extracted",
        evidence: [{ kind: "test", reference: "fixture" }],
      }],
      unresolvedStages: [{
        id: "rounding-order",
        stage: "rounding-order",
        reason: "Not calibrated.",
        classification: "calibration_required",
        evidence: [{ kind: "test", reference: "fixture" }],
      }],
    }],
  });
  return { build: BUILD, skillsFile, skillFormulaMapFile, formulaTableFile, reviewFile, outputFile, browserOutputFile };
}

test("writes a validated build-scoped ability bundle atomically", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "tl-combat-abilities-"));
  try {
    const files = fixture(directory);
    const { result, browserOutputFile } = buildCombatAbilityDataFiles(files);
    assert.equal(result.gameBuild, BUILD);
    assert.deepEqual(result.abilities.map((ability) => ability.id), ["test-ability"]);
    assert.deepEqual(JSON.parse(readFileSync(files.outputFile, "utf8")), result);
    assert.deepEqual(JSON.parse(readFileSync(browserOutputFile, "utf8")), result);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("refuses to reuse a reviewed manifest for a different game build", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "tl-combat-abilities-"));
  try {
    const files = fixture(directory);
    files.build = "999";
    assert.throws(() => buildCombatAbilityDataFiles(files), /manifest build 12345 does not match requested build 999/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("reviewed manifest contains only the five approved real formula rows", () => {
  const review = JSON.parse(readFileSync(
    path.join(REPO_ROOT, "scripts", "combat-abilities", "reviewed-abilities.json"),
    "utf8",
  ));
  assert.equal(review.reviewedGameBuild, "24118850");
  assert.deepEqual(review.abilities.map((ability) => ability.abilityId), [
    "judgment-lightning", "swift-healing", "distortion-veil",
  ]);
  assert.deepEqual(review.abilities.flatMap((ability) => ability.components.map((component) => [
    component.formulaRowId, component.precision, component.provenance,
  ])), [
    ["ST_PowerAttack_DD", "derived_high_confidence", "derived"],
    ["WA_Heal_Heal", "derived_high_confidence", "derived"],
    ["WA_Heal_Heal_Double", "derived_high_confidence", "derived"],
    ["ORB_Active_Shield_ShieldHp", "verified_exact", "extracted"],
    ["ORB_Active_Shield_Duration", "verified_exact", "extracted"],
  ]);
  const judgment = review.abilities.find((ability) => ability.abilityId === "judgment-lightning");
  assert.equal(judgment.components[0].role, "first-cast-per-hit-magnitude");
  assert.ok(judgment.unresolvedStages.some((stage) => stage.id === "conditional-second-cast"));
  assert.ok(!JSON.stringify(review).toLowerCase().includes("stalwart"));
});
