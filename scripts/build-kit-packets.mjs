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
// - Two selection tiers, both conservative:
//   1. Legacy: the single largest-coefficient attack-power row, kept only when
//      every level's embedded tooltip1 agrees with mul/100 (±1 for display
//      rounding). This preserves the originally shipped packets unchanged.
//   2. Tooltip-anchored recovery: when the legacy pick fails (typically
//      because the largest row is a _PVE/_NPC/_Boss variant whose tooltip
//      fields encode a monster-bonus percent, not a coefficient), the skill is
//      recovered through the row whose per-level mul/100 and flat add match the
//      player-visible "Damage ▲" line in web/data/projections/skills.json.
//      Only levels the tooltip confirms (±1 point) are published, so a level
//      where the formula table and the in-game tooltip genuinely disagree
//      (e.g. Strafing 21: row 148% vs displayed 174%) is omitted and consumers
//      fall back to the highest confirmed level below it — undercounting,
//      never overcounting.
// - Skills whose own tooltip never states a "Damage ▲" line (heals, shields,
//   buffs that only deal damage through other skills or conditional riders)
//   are excluded as no_tooltip_damage_line: a damage packet for them would
//   overstate a PvP damage race by construction.
//
// Usage:
//   $env:TL_DATA_ROOT = 'D:\TL_Data'
//   node scripts/build-kit-packets.mjs [--build=24118850]

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AP_TYPE = "EFormulaType::kAmountFromAttackPower";
const MUL_BASIS = 10000;
// Display encoding is tooltip1 = mul/100; the client rounds some rendered
// percents by up to one point (e.g. Strafing 18-20 render 138/141/144 for rows
// 139/142/145), so agreement is judged at ±1 point, matching the originally
// shipped check.
const DISPLAY_TOLERANCE = 1;
const DAMAGE_LINE = "Damage ▲";
const DAMAGE_LINE_PATTERN = /^(\d+(?:\.\d+)?)%(?:\s*\+\s*(\d+(?:\.\d+)?))?$/;

// Rows whose every level is attack-power typed and that carry an actual
// magnitude somewhere. All-zero rows exist as placeholders (e.g. Corruption's
// direct hit, whose real payload is a curse DoT) and must never be elected as
// a primary hit — a 0-coefficient packet would falsely report the skill as
// modeled.
const attackPowerRows = (mapping) =>
  mapping.formulaRows.filter((row) =>
    row.levels?.length &&
    row.levels.every((level) => level.formula_type === AP_TYPE) &&
    row.levels.some((level) => Number(level.mul) > 0 || Number(level.add) > 0));

const packetLevel = (level, cooldown) => ({
  coefficient: (Number(level.mul) / MUL_BASIS).toFixed(4),
  flatAdd: String(Number(level.add) || 0),
  cooldown,
});

const cooldownAt = (skill, skillLevel) => {
  const row = skill.levels?.find((entry) => Number(entry.level) === Number(skillLevel));
  const cooldown = Number(row?.cooldown);
  return cooldown > 0 ? cooldown : null;
};

// Tier 1 — the originally shipped selection: single largest-coefficient row,
// every level with a client-visible cooldown, rejected outright when any
// level's embedded tooltip1 disagrees with mul/100.
function selectLegacyPacket(mapping, skill) {
  const apRows = attackPowerRows(mapping);
  if (!apRows.length) return { reason: "no_attack_power_component" };

  const primary = apRows.reduce((best, row) => (Number(row.levels[0].mul) > Number(best.levels[0].mul) ? row : best), apRows[0]);
  const levels = {};
  let inconsistentTooltip = false;
  for (const level of primary.levels) {
    if (!(Number(level.mul) > 0 || Number(level.add) > 0)) continue; // placeholder level, not a hit
    const cooldown = cooldownAt(skill, level.skill_level);
    if (cooldown === null) continue;
    if (Number(level.tooltip1) && Math.abs(Number(level.tooltip1) - Number(level.mul) / 100) > DISPLAY_TOLERANCE) inconsistentTooltip = true;
    levels[String(level.skill_level)] = packetLevel(level, cooldown);
  }
  if (!Object.keys(levels).length) return { reason: "no_level_with_cooldown" };
  if (inconsistentTooltip) return { reason: "tooltip_coefficient_mismatch" };

  return {
    packet: {
      formulaRowId: primary.formulaRowId,
      attackPowerComponentCount: apRows.length,
      componentSelection: apRows.length > 1 ? "primary_largest_coefficient" : "single",
      levels,
    },
  };
}

// The per-level "Damage ▲" statements from the client-visible skill tooltip —
// the number a player reads in game. Levels without the line are skipped.
function tooltipDamageLines(skill) {
  const lines = new Map();
  for (const level of skill.levels ?? []) {
    const option = (level.tooltipOptions ?? []).find((entry) => entry.name === DAMAGE_LINE);
    const match = option ? DAMAGE_LINE_PATTERN.exec(String(option.parameter).trim()) : null;
    if (!match) continue;
    lines.set(Number(level.level), { percent: Number(match[1]), add: match[2] === undefined ? 0 : Number(match[2]) });
  }
  return lines;
}

// Tier 2 — recovery for skills the legacy tier rejects: anchor row selection
// to the player-visible damage line instead of row magnitude, and publish only
// the levels the tooltip confirms.
function selectAnchoredPacket(mapping, skill) {
  const apRows = attackPowerRows(mapping);
  if (!apRows.length) return { reason: "no_attack_power_component" };
  const damageLines = tooltipDamageLines(skill);
  if (!damageLines.size) return { reason: "no_tooltip_damage_line" };

  let best = null;
  for (const row of apRows) {
    const matched = [];
    const unmatched = [];
    for (const level of row.levels) {
      const line = damageLines.get(Number(level.skill_level));
      if (!line) continue;
      const percentAgrees = Math.abs(Number(level.mul) / 100 - line.percent) <= DISPLAY_TOLERANCE;
      const addAgrees = Math.abs((Number(level.add) || 0) - line.add) <= DISPLAY_TOLERANCE;
      if (percentAgrees && addAgrees) matched.push(level); else unmatched.push(Number(level.skill_level));
    }
    if (!matched.length) continue;
    const candidate = { row, matched, unmatched };
    // Most confirmed levels wins; ties resolve by row id so duplicates with
    // identical magnitudes (e.g. OrbShoot vs OrbShootPos) pick deterministically.
    if (!best || matched.length > best.matched.length ||
        (matched.length === best.matched.length && row.formulaRowId < best.row.formulaRowId)) best = candidate;
  }
  if (!best) return { reason: "tooltip_coefficient_mismatch" };

  const levels = {};
  for (const level of best.matched) {
    const cooldown = cooldownAt(skill, level.skill_level);
    if (cooldown === null) continue;
    levels[String(level.skill_level)] = packetLevel(level, cooldown);
  }
  if (!Object.keys(levels).length) return { reason: "no_level_with_cooldown" };

  return {
    packet: {
      formulaRowId: best.row.formulaRowId,
      attackPowerComponentCount: apRows.length,
      componentSelection: "tooltip_anchored",
      anchor: {
        evidence: `skills.json tooltipOptions "${DAMAGE_LINE}"`,
        confirmedLevels: Object.keys(levels).length,
        unconfirmedLevels: best.unmatched,
      },
      levels,
    },
  };
}

export function buildKitPacketsArtifact({ skillsProjection, formulaMap, generatedAtUtc }) {
  const gameBuild = String(formulaMap.gameBuild);
  if (String(skillsProjection.gameBuild) !== gameBuild) {
    throw new Error(`skills.json build ${skillsProjection.gameBuild} does not match ${gameBuild}.`);
  }

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

    const legacy = selectLegacyPacket(mapping, skill);
    const selection = legacy.packet ? legacy : selectAnchoredPacket(mapping, skill);
    if (!selection.packet) {
      // The recovery tier's reason is the more informative one: it says what
      // still blocks the skill after the tooltip-anchored attempt.
      exclude(selection.reason);
      continue;
    }

    if (mapping.classification === "exact") exactCount += 1; else derivedCount += 1;
    const { levels, ...selectionFields } = selection.packet;
    packets[mapping.skillSetId] = {
      name: mapping.name,
      weapon: skill.mainCategory,
      mappingClass: mapping.classification,
      ...selectionFields,
      maxLevel: skill.maxLevel,
      levels,
    };
  }

  return {
    schema: "tl-helper.kit-damage-packets",
    schemaVersion: 2,
    gameBuild,
    generatedAtUtc: generatedAtUtc ?? new Date().toISOString(),
    provenance: {
      skillFormulaMap: formulaMap.provenance,
      cooldownSource: "web/data/projections/skills.json (client-visible per-level cooldowns)",
      coefficientBasis: "kAmountFromAttackPower mul / 10000, verified display encoding",
      tooltipAnchor: `web/data/projections/skills.json per-level tooltipOptions "${DAMAGE_LINE}" (client-visible damage line)`,
    },
    method: {
      componentSelection: "single largest-coefficient attack-power row per skill when its embedded tooltip agrees; otherwise the row anchored to the client-visible Damage line, publishing only tooltip-confirmed levels (multi-hit kits and unconfirmed levels undercounted, never overcounted)",
      confidence: "mappingClass exact|derived carried per skill; unresolved, non-attack-power, and no-damage-line actives excluded",
    },
    summary: { skills: Object.keys(packets).length, exact: exactCount, derived: derivedCount, excluded: excluded.length },
    skills: packets,
    excluded,
  };
}

export function main() {
  const option = (name, fallback) => process.argv.find((row) => row.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
  const gameBuild = option("build", process.env.TL_STEAM_BUILD ?? "24118850");
  const dataRoot = process.env.TL_DATA_ROOT ?? "D:\\TL_Data";
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  const skillsProjection = JSON.parse(readFileSync(path.join(repoRoot, "web", "data", "projections", "skills.json"), "utf8"));
  const formulaMap = JSON.parse(readFileSync(path.join(dataRoot, "reports", gameBuild, "skill-formula-map.json"), "utf8"));
  if (String(formulaMap.gameBuild) !== String(gameBuild)) throw new Error(`skill-formula-map build ${formulaMap.gameBuild} does not match ${gameBuild}.`);

  const artifact = buildKitPacketsArtifact({ skillsProjection, formulaMap });
  const outputPath = path.join(repoRoot, "web", "data", "kit-packets.json");
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, summary: artifact.summary }, null, 2));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
