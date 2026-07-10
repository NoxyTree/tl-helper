import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSkillMapping, deriveFormulaPrefix, extractPlaceholders, parseCsv,
} from "../lib/skill-formula-map.mjs";

test("CSV parser preserves quoted commas and escaped quotes", () => {
  assert.deepEqual(parseCsv('ns,key,hash,text\r\nTL,k,1,"Damage, then ""heal"""\r\n'), [
    ["ns", "key", "hash", "text"],
    ["TL", "k", "1", 'Damage, then "heal"'],
  ]);
});

test("placeholder parser retains base and requested field", () => {
  assert.deepEqual(extractPlaceholders("$[BO_PowerShot_DD.tooltip1]% + $[BO_PowerShot_DD.tooltip2]"), [
    { base: "BO_PowerShot_DD", field: "tooltip1", expression: "$[BO_PowerShot_DD.tooltip1" },
    { base: "BO_PowerShot_DD", field: "tooltip2", expression: "$[BO_PowerShot_DD.tooltip2" },
  ]);
});

test("verified skill naming transforms produce formula prefixes", () => {
  assert.equal(deriveFormulaPrefix("WP_BO_S_PowerShot"), "BO_PowerShot");
  assert.equal(deriveFormulaPrefix("WP_WA_GR_S_PartyCurseBurst"), "WA_PartyCurseBurst");
  assert.equal(deriveFormulaPrefix("SkillSet_WP_CR_FuriousFire"), "CR_FuriousFire");
});

test("mapping keeps exact and derived rows separate and leaves misses unresolved", () => {
  const skills = [
    { id: "SkillSet_WP_BO_S_PowerShot", name: "Power Shot" },
    { id: "SkillSet_WP_KN_S_NpcOnly", name: "No Guess" },
  ];
  const localizationRows = [
    { namespace: "TLStringSkillDesc", key: "TEXT_SKILL_DESC_WP_BO_S_PowerShot", text: "$[BO_PowerShot_DD.tooltip1]" },
    { namespace: "TLStringSkillDesc", key: "TEXT_SKILL_DESC_WP_KN_S_NpcOnly", text: "$[KN_Unknown_DD.tooltip1]" },
  ];
  const formulaRows = {
    BO_PowerShot_DD: { FormulaParameter: [{ skill_level: 1, mul: 50000 }] },
    BO_PowerShot_DD_Boss: { FormulaParameter: [{ skill_level: 1, mul: 18000 }] },
  };
  const result = buildSkillMapping({ skills, localizationRows, formulaRows });
  assert.equal(result[0].classification, "exact");
  assert.deepEqual(result[0].formulaRows.map((row) => [row.formulaRowId, row.mappingClass]), [
    ["BO_PowerShot_DD", "exact"], ["BO_PowerShot_DD_Boss", "derived"],
  ]);
  assert.equal(result[1].classification, "unresolved");
  assert.deepEqual(result[1].unresolvedPlaceholders, ["KN_Unknown_DD"]);
});
