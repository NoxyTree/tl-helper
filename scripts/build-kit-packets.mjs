// Build the kit-damage-packet artifact: per active skill, the primary
// attack-power damage component (coefficient + flat add per level) joined with
// the client-visible cooldown, so Combat Lab can weight a build's equipped
// damage skills into a rotation packet.
//
// Selection discipline (nothing is invented):
// - Only skills classified exact or derived in the skill-formula map are
//   considered; the per-skill mappingClass is carried as the confidence flag.
// - Only EFormulaType::kAmountFromAttackPower rows are used — the one formula
//   type whose projection semantics are review-verified (mul basis 10000 =
//   100%, verified display encoding tooltip1 = mul/100). Other formula types
//   are excluded with a reason, never approximated.
// - Skills with several attack-power rows keep the single largest-coefficient
//   row as the primary hit; the component count is recorded so consumers can
//   disclose possible undercounting of multi-hit kits.
//
// Usage:
//   $env:TL_DATA_ROOT = 'D:\TL_Data'
//   node scripts/build-kit-packets.mjs [--build=24118850]

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const option = (name, fallback) => process.argv.find((row) => row.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const gameBuild = option("build", process.env.TL_STEAM_BUILD ?? "24118850");
const dataRoot = process.env.TL_DATA_ROOT ?? "D:\\TL_Data";
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, "")), "..");

const skillsProjection = JSON.parse(readFileSync(path.join(repoRoot, "web", "data", "projections", "skills.json"), "utf8"));
const formulaMap = JSON.parse(readFileSync(path.join(dataRoot, "reports", gameBuild, "skill-formula-map.json"), "utf8"));

if (String(skillsProjection.gameBuild) !== String(gameBuild)) throw new Error(`skills.json build ${skillsProjection.gameBuild} does not match ${gameBuild}.`);
if (String(formulaMap.gameBuild) !== String(gameBuild)) throw new Error(`skill-formula-map build ${formulaMap.gameBuild} does not match ${gameBuild}.`);

const AP_TYPE = "EFormulaType::kAmountFromAttackPower";
const MUL_BASIS = 10000;
const skillById = new Map(skillsProjection.data.skills.map((skill) => [skill.id, skill]));

const packets = {};
const excluded = [];
let exactCount = 0;
let derivedCount = 0;

for (const mapping of formulaMap.skills) {
  const skill = skillById.get(mapping.skillSetId);
  const exclude = (reason) => excluded.push({ skillSetId: mapping.skillSetId, name: mapping.name, reason });
  if (!skill) { exclude("not_in_skills_projection"); continue; }
  if (skill.skillType !== "active") continue; // packets model equipped active damage skills only
  if (mapping.classification === "unresolved") { exclude("unresolved_mapping"); continue; }

  const apRows = mapping.formulaRows.filter((row) => row.levels?.every((level) => level.formula_type === AP_TYPE) && row.levels.length);
  if (!apRows.length) { exclude("no_attack_power_component"); continue; }

  // Primary hit = the row with the largest level-1 coefficient; conservative
  // for multi-hit kits (undercounts, never overcounts conditional casts).
  const primary = apRows.reduce((best, row) => Number(row.levels[0].mul) > Number(best.levels[0].mul) ? row : best, apRows[0]);
  const levels = {};
  let inconsistentTooltip = false;
  for (const level of primary.levels) {
    const mul = Number(level.mul);
    const add = Number(level.add) || 0;
    const cooldownRow = skill.levels?.find((row) => Number(row.level) === Number(level.skill_level));
    const cooldown = Number(cooldownRow?.cooldown);
    if (!(cooldown > 0)) continue; // no client-visible cooldown at this level
    if (Number(level.tooltip1) && Math.abs(Number(level.tooltip1) - mul / 100) > 1) inconsistentTooltip = true;
    levels[String(level.skill_level)] = {
      coefficient: (mul / MUL_BASIS).toFixed(4),
      flatAdd: String(add),
      cooldown,
    };
  }
  if (!Object.keys(levels).length) { exclude("no_level_with_cooldown"); continue; }
  if (inconsistentTooltip) { exclude("tooltip_coefficient_mismatch"); continue; }

  if (mapping.classification === "exact") exactCount += 1; else derivedCount += 1;
  packets[mapping.skillSetId] = {
    name: mapping.name,
    weapon: skill.mainCategory,
    mappingClass: mapping.classification,
    formulaRowId: primary.formulaRowId,
    attackPowerComponentCount: apRows.length,
    componentSelection: apRows.length > 1 ? "primary_largest_coefficient" : "single",
    maxLevel: skill.maxLevel,
    levels,
  };
}

const artifact = {
  schema: "tl-helper.kit-damage-packets",
  schemaVersion: 1,
  gameBuild: String(gameBuild),
  generatedAtUtc: new Date().toISOString(),
  provenance: {
    skillFormulaMap: formulaMap.provenance,
    cooldownSource: "web/data/projections/skills.json (client-visible per-level cooldowns)",
    coefficientBasis: "kAmountFromAttackPower mul / 10000, verified display encoding",
  },
  method: {
    componentSelection: "single largest-coefficient attack-power row per skill (multi-hit kits undercounted, never overcounted)",
    confidence: "mappingClass exact|derived carried per skill; unresolved and non-attack-power actives excluded",
  },
  summary: { skills: Object.keys(packets).length, exact: exactCount, derived: derivedCount, excluded: excluded.length },
  skills: packets,
  excluded,
};

const outputPath = path.join(repoRoot, "web", "data", "kit-packets.json");
writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, summary: artifact.summary }, null, 2));
