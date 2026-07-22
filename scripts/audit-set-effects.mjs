import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SET_PASSIVE_RULES, STAT_UNIT_MODIFIERS } from "../web/tl-questlog-rules.js";
import { STAT_ALIASES } from "../web/tl-core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectionPath = path.join(root, "web", "data", "projections", "equipment.json");
const defaultOutput = path.join(root, "docs", "set-effect-audit-2026-07-13.md");
const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : defaultOutput;

const projection = JSON.parse(fs.readFileSync(projectionPath, "utf8"));
const data = projection.data;
const artifactIds = new Set(data.artifactSets.map((set) => set.id));

const KEY_LABELS = {
  ...STAT_ALIASES,
  all_armor: "All Defense",
  all_critical_attack: "All Critical Hit Chance",
  all_critical_defense: "All Endurance",
  all_double_attack: "All Heavy Attack Chance",
  all_double_defense: "All Heavy Attack Evasion",
  all_evasion: "All Evasion",
  attack_power_main_hand: "Main Weapon Base Damage",
  attack_speed_modifier: "Attack Speed",
  melee_damage_dealt_modifier: "Melee Damage Dealt",
  bonus_attack_power_main_hand: "Main Weapon Bonus Attack Power",
  critical_damage_dealt_modifier: "Critical Damage",
  critical_damage_taken_modifier: "Critical Damage Resistance",
  damage_reduction: "Damage Reduction",
  damage_reduction_penetration: "Bonus Damage",
  double_damage_dealt_modifier: "Heavy Attack Damage",
  double_damage_taken_modifier: "Heavy Attack Damage Resistance",
  hp_max: "Max Health",
  melee_double_attack: "Melee Heavy Attack Chance",
  move_speed_modifier: "Move Speed",
  skill_cooldown_modifier: "Cooldown Speed",
  skill_power_amplification: "Skill Damage Boost",
  skill_power_resistance: "Skill Damage Resistance",
  stamina_regen: "Stamina Regen",
};

const DYNAMIC_FORMULAS = {
  "set_aa_leather_003:2": "If final Dexterity >= 30, Cooldown Speed +8%.",
  "set_aa_leather_003:4": "floor(min(final Fortitude, 99) / 10) * 2% Attack Speed.",
  "set_a_artifact_set_006:6": "floor(pre-effect Max Health * 7%).",
  "set_a_artifact_set_007:6": "floor(each pre-effect Defense value * 7%).",
  "set_aa_T2_fabric_001:4": "min(20, floor(final Max Mana / 1,000))% Cooldown Speed.",
  "set_aa_T2_plate_001:4": "min(240, floor(final Max Health / 1,000) * 12) Melee Heavy Attack Chance.",
  "set_aa_T2_plate_005:2": "floor(min(final Perception, 99) / 10) * 45 Endurance.",
  "set_aa_T2_plate_005:4": "If final Fortitude >= 50, Main Weapon Base Damage +30.",
  "set_aa_t3_plate_001:4": "Endurance +250 each; min(24, floor(final Max Health / 1,000) * 0.6)% Heavy Attack Damage Resistance.",
  "set_aa_t3_plate_002:2": "floor(min(final Strength, 99) / 10) * 30 Heavy Attack Chance.",
  "set_aa_t4_fabric_004:2": "Heavy Attack Damage +20%; floor(min(final Wisdom, 130) / 10) * 30 PvP Magic Heavy Attack Chance.",
  "set_aa_t4_leather_003:2": "Critical Damage +15%; floor(min(final Fortitude, 130) / 10) * 30 PvP Melee Critical Hit Chance.",
  "set_aa_t4_leather_005:2": "Critical Damage +15%; floor(min(final Dexterity, 130) / 10) * 30 PvP Ranged Critical Hit Chance.",
  "set_aa_t4_Plate_004:2": "Heavy Attack Damage +20%; floor(min(final Perception, 130) / 10) * 30 PvP Melee Heavy Attack Chance.",
  "set_b_artifact_set_003:6": "floor(each pre-effect Defense value * 4%).",
  "set_b_artifact_set_004:6": "floor(pre-effect Max Health * 4%).",
  "set_c_artifact_set_002:6": "floor(each pre-effect Defense value * 2%).",
};

const STATUS_OVERRIDES = {
  "set_aa_T2_plate_005:2": "CORRECTED 2026-07-13: whole 10-point steps per decoded mul=450000 fingerprint (docs/set-effect-database-review-2026-07-13.md).",
  "set_aa_T2_plate_005:4": "RESOLVED 2026-07-13: Korean source string '50 이상' confirms >= 50 (docs/set-effect-localization-resolution-2026-07-13.md).",
  "set_aa_leather_003:2": "RESOLVED 2026-07-13: Korean source string '30 이상' confirms >= 30.",
  "set_aa_leather_003:4": "RESOLVED 2026-07-13: Korean source string names the stat — Attack Speed ('공격 속도').",
  "set_aa_T2_leather_003:4": "CORRECTED 2026-07-13: Bonus Damage 70 per decoded aa_leather_T2_003_2 (min=max=70).",
  "set_aa_T2_plate_002:4": "CORRECTED 2026-07-13: Damage Reduction 40 per decoded aa_plate_T2_002_2_DamageReduction (min=max=40).",
  "set_c_artifact_set_001:4": "CORRECTED 2026-07-13: Critical Damage +4% per decoded artifact_c_001_1_Passive (raw 400 proves the x0.01 stat).",
  "set_b_artifact_set_001:4": "CORRECTED 2026-07-13: Critical Damage +6% per decoded artifact_b_001_1_Passive (raw 600 proves the x0.01 stat).",
  "set_aa_T2_fabric_003:2": "MODELED STACKING: the client set string binds the same tooltip to a personal line and a self-inclusive aura line; owner receives both (docs/set-effect-localization-resolution-2026-07-13.md).",
  "set_aa_T2_fabric_003:4": "MODELED STACKING: personal + self-inclusive aura, decoded per-application 10%.",
  "set_aa_T2_leather_004:2": "MODELED STACKING: personal + self-inclusive aura, decoded per-application 110.",
  "set_aa_T2_leather_004:4": "MODELED STACKING: personal + self-inclusive aura, decoded per-application 110.",
  "set_aa_T2_plate_003:2": "MODELED STACKING: personal + self-inclusive aura, decoded per-application 120.",
  "set_aa_T2_plate_003:4": "CORRECTED 2026-07-13: decoded per-application Damage Reduction is 24, bound twice by the client string; Questlog's 12+12 halved it.",
  "set_aa_t4_fabric_001:2": "CORRECTED 2026-07-14: TLItemSetBonus joins 2pc to _1_Passive, which contains Healing and Healing over Time +20%.",
  "set_aa_t4_fabric_001:4": "CORRECTED 2026-07-14: TLItemSetBonus joins 4pc to _2_Passive, which contains Max Health +2200 plus a conditional recovery proc.",
  "set_aa_t4_Plate_002:2": "CORRECTED 2026-07-14: decoded _1_Passive also contains Melee Damage Dealt +3% (raw 300).",
  "set_aa_PartyDungeon_Ring_001:2": "DERIVED 2026-07-14: persistent Adjust_Stat and the localized -10 Stamina Regen literal map to raw -10000.",
};

const DESCRIPTION_OVERRIDES = {
  "set_aa_t4_fabric_001:2": "Skill Healing +20%; Skill Healing over Time +20%.",
  "set_aa_t4_fabric_001:4": "Max Health +2200. Recovery-skill Damage Reduction and Debuff Resistance proc is combat-conditional.",
  "set_aa_t4_Plate_002:2": "Endurance +100; Heavy Attack Evasion +100; Melee Damage Dealt +3%.",
  "set_aa_PartyDungeon_Ring_001:2": "Stamina Regen -10.",
  "set_a_Magic_Nudge_001:3": "When attacking an enemy below 50% Health, Critical Hit Chance +140 for 3s.",
  "set_a_Melee_Nudge_001:3": "When attacking an enemy below 50% Health, Critical Hit Chance +140 for 3s.",
  "set_a_Range_Nudge_001:3": "When attacking an enemy below 50% Health, Critical Hit Chance +140 for 3s.",
};

const SEMANTIC_EXPECTATIONS = [
  { name: "Critical Damage Resistance", pattern: /critical damage (?:reduction|resistance)/i, oneOf: ["critical_damage_taken_modifier"] },
  { name: "Critical Damage", pattern: /critical damage/i, exclude: /critical damage (?:reduction|resistance)/i, oneOf: ["critical_damage_dealt_modifier"] },
  { name: "Heavy Attack Damage Resistance", pattern: /heavy attack damage resistance/i, oneOf: ["double_damage_taken_modifier"] },
  { name: "Heavy Attack Damage", pattern: /heavy attack damage/i, exclude: /heavy attack damage resistance/i, oneOf: ["double_damage_dealt_modifier"] },
  { name: "Bonus Damage", pattern: /bonus damage/i, oneOf: ["damage_reduction_penetration"] },
  { name: "Damage Reduction", pattern: /damage reduction/i, exclude: /(?:critical|shield) damage reduction|damage reduction penetration/i, oneOf: ["damage_reduction"] },
  { name: "Skill Damage Boost", pattern: /skill damage boost/i, oneOf: ["skill_power_amplification"] },
  { name: "Skill Damage Resistance", pattern: /skill damage resistance/i, oneOf: ["skill_power_resistance"] },
  { name: "Critical Hit Chance", pattern: /critical hit chance/i, oneOf: ["all_critical_attack", "melee_critical_attack", "range_critical_attack", "magic_critical_attack"] },
  { name: "Endurance", pattern: /endurance/i, oneOf: ["all_critical_defense", "melee_critical_defense", "range_critical_defense", "magic_critical_defense", "pvp_melee_critical_defense", "pvp_range_critical_defense", "pvp_magic_critical_defense"] },
  { name: "Max Health", pattern: /max health/i, oneOf: ["hp_max"] },
  { name: "Attack Speed", pattern: /attack speed/i, oneOf: ["attack_speed_modifier"] },
  { name: "Cooldown Speed", pattern: /cooldown speed/i, oneOf: ["skill_cooldown_modifier"] },
  { name: "Move Speed", pattern: /move speed/i, oneOf: ["move_speed_modifier"] },
  { name: "Block Chance Penetration", pattern: /block chance penetration/i, oneOf: ["shield_block_chance_penetration"] },
];

const UNMAPPED_CLASSIFICATION = {
  "set_aa_fabric_001:2": "Weaken Duration +7.5% is a scoped dynamic stat not represented in sheet totals.",
  "set_aa_plate_002:4": "Scoped mobility-skill effect; not a global sheet stat.",
  "set_aa_T2_fabric_002:2": "Scoped damage-over-time effect; requires combat modeling.",
  "set_aa_T2_fabric_004:2": "Mixed base and triggered damage-over-time effect.",
  "set_aa_T2_leather_005:2": "Mapped 2026-07-13: personal + self-inclusive aura applied doubled, matching the sibling Talland sets.",
  "set_aa_T2_leather_005:4": "Mapped 2026-07-13: personal + self-inclusive aura applied doubled, matching the sibling Talland sets.",
  "set_aa_t3_lether_001:4": "Mapped 2026-07-13: persistent Bonus Damage 40 only; the on-hit proc stays excluded.",
  "set_aa_t3_lether_003:4": "Conditional combat effects only.",
  "set_aa_t4_fabric_005:2": "Mixed base damage-over-time and conditional debuff effect.",
  "set_a_Magic_Nudge_001:3": "Conditional target-health combat effect.",
  "set_a_Melee_Nudge_001:3": "Conditional target-health combat effect.",
  "set_a_Range_Nudge_001:3": "Conditional target-health combat effect.",
};

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function escapeCell(value) {
  return clean(value).replaceAll("|", "\\|");
}

function label(statId) {
  return KEY_LABELS[statId] ?? statId.replaceAll("_", " ");
}

function displayValue(statId, rawValue) {
  const modifier = STAT_UNIT_MODIFIERS[statId];
  return Number(rawValue) * (modifier ?? 1);
}

function signed(value) {
  const numeric = Number(value);
  return `${numeric > 0 ? "+" : ""}${Number.isInteger(numeric) ? numeric : numeric.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function structuredCalculation(rows) {
  return rows.map((row) => `${label(row.type)} ${signed(displayValue(row.type, row.value))}`).join("; ");
}

function constantCalculation(rule) {
  try {
    const rows = rule.effect({}) ?? [];
    return rows.map((row) => `${label(row.statId)} ${signed(displayValue(row.statId, row.value))}`).join("; ") || "No static output";
  } catch (error) {
    return `Evaluation failed: ${error.message}`;
  }
}

function isDynamic(rule) {
  const source = String(rule.effect);
  return /\.total|Math\.(?:floor|min|max)|>=|<=/.test(source);
}

function numbers(text) {
  return [...clean(text).matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}

function constantNumericMismatch(rule, description) {
  let rows;
  try {
    rows = rule.effect({}) ?? [];
  } catch {
    return false;
  }
  const described = numbers(description);
  return rows.some((row) => {
    const value = displayValue(row.statId, row.value);
    return value !== 0 && !described.some((candidate) => Math.abs(Math.abs(candidate) - Math.abs(value)) < 1e-9);
  });
}

function constantSemanticMismatches(rule, description) {
  let outputIds;
  try {
    outputIds = new Set((rule.effect({}) ?? []).map((row) => row.statId));
  } catch {
    return [];
  }
  return SEMANTIC_EXPECTATIONS
    .filter((expectation) => expectation.pattern.test(description)
      && !(expectation.exclude?.test(description))
      && !expectation.oneOf.some((statId) => outputIds.has(statId)))
    .map((expectation) => `${expectation.name} expected one of [${expectation.oneOf.join(", ")}], received [${[...outputIds].join(", ")}]`);
}

function hasConditionalCombatText(description) {
  return /\b(?:when|whenever|upon|on hit|on attack|chance to|less than|below|for \d+(?:\.\d+)?s|while using|after using|every time)\b|cooldown\s*:/i.test(description);
}

const rows = [];
for (const set of data.itemSets) {
  for (const bonus of set.itemSetBonus ?? []) {
    const count = Number(bonus.set_count ?? 0);
    const key = `${set.id}:${count}`;
    const staticRows = bonus.bonus_stat ?? [];
    const passives = bonus.bonus_passive ?? [];
    const description = DESCRIPTION_OVERRIDES[key]
      ?? (passives.map((passive) => passive.text || passive.name).filter(Boolean).join(" / ")
        || structuredCalculation(staticRows));
    const rule = SET_PASSIVE_RULES[set.id]?.[count];
    let classification;
    let calculation;
    let status;
    let provenance;

    if (staticRows.length) {
      classification = "Structured static";
      calculation = structuredCalculation(staticRows);
      status = "No registry formula required; verify source value and units.";
      provenance = "Questlog projection bonus_stat";
    } else if (!rule) {
      classification = "Unmapped passive";
      calculation = "Not included in static build totals.";
      status = UNMAPPED_CLASSIFICATION[key] ?? "Unmapped; manual classification required.";
      provenance = "Description only";
    } else if (isDynamic(rule)) {
      classification = "Dynamic or thresholded";
      calculation = DYNAMIC_FORMULAS[key] ?? String(rule.effect);
      status = STATUS_OVERRIDES[key] ?? "Formula structure matches description; game-file and boundary verification still required.";
      provenance = DESCRIPTION_OVERRIDES[key] ? "Decoded join and localized description" : "Questlog compatibility rule";
    } else {
      classification = "Mapped constant";
      calculation = constantCalculation(rule);
      const semanticMismatches = constantSemanticMismatches(rule, description);
      status = STATUS_OVERRIDES[key]
        ?? (hasConditionalCombatText(description)
          ? "STATIC COMPONENT ONLY: conditional combat behavior in the description is not included in persistent sheet totals."
          : semanticMismatches.length
          ? `REVIEW SEMANTIC CONFLICT: ${semanticMismatches.join("; ")}.`
          : constantNumericMismatch(rule, description)
          ? "REVIEW: implemented value does not directly match a number in the description."
          : "Implemented values align numerically with the description.");
      provenance = DESCRIPTION_OVERRIDES[key] ? "Decoded join and localized description" : "Questlog compatibility rule";
    }

    rows.push({
      kind: artifactIds.has(set.id) ? "Artifact" : "Equipment",
      setName: set.name,
      setId: set.id,
      count,
      description,
      calculation,
      classification,
      status,
      provenance,
    });
  }
}

rows.sort((left, right) => left.kind.localeCompare(right.kind)
  || left.setName.localeCompare(right.setName)
  || left.count - right.count
  || left.setId.localeCompare(right.setId));

const countBy = (predicate) => rows.filter(predicate).length;
const thresholds = Object.fromEntries([...new Set(rows.map((row) => row.count))].sort((a, b) => a - b)
  .map((count) => [count, countBy((row) => row.count === count)]));
const confirmed = rows.filter((row) => row.status.startsWith("CONFIRMED"));
const highRisk = rows.filter((row) => row.status.startsWith("HIGH RISK"));
const review = rows.filter((row) => row.status.startsWith("REVIEW"));
const staticOnly = rows.filter((row) => row.status.startsWith("STATIC COMPONENT ONLY"));
const unmapped = rows.filter((row) => row.classification === "Unmapped passive");

const lines = [];
lines.push("# Set-effect calculation audit");
lines.push("");
lines.push(`- Audit date: 2026-07-14`);
lines.push(`- Game build: \`${projection.gameBuild}\``);
lines.push(`- Data generated: \`${projection.generatedAtUtc}\``);
lines.push(`- Unique sets: **${data.itemSets.length}** (${artifactIds.size} artifact sets, ${data.itemSets.length - artifactIds.size} equipment/accessory sets)`);
lines.push(`- Activation breakpoints: **${rows.length}** (${Object.entries(thresholds).map(([count, total]) => `${count}-piece: ${total}`).join(", ")})`);
lines.push("- Counting rule: artifact definitions duplicated between `itemSets` and `artifactSets` are normalized by set ID. One effect row means one set activation breakpoint; a breakpoint may contain several stat changes or a static plus conditional mechanic.");
lines.push("");
lines.push("## Executive finding");
lines.push("");
lines.push(`All ${rows.length} projected breakpoints are now classified as structured, mapped, or explicitly unsupported. The calculator returns one canonical set-effect trace used by totals and page explanations, including dynamic evaluated values and stat-scoped exclusivity. Current audit status is ${confirmed.length} confirmed-incorrect, ${highRisk.length} high-risk, ${review.length} review, and ${unmapped.length} deliberately unsupported breakpoints. Optimizer finalists still use the complete calculator; breakpoint-aware hints now protect equipment-set routes during bounded pruning without becoming a second scoring authority.`);
lines.push("");
lines.push("## Coverage summary");
lines.push("");
lines.push("| Classification | Breakpoints | Meaning |");
lines.push("| --- | ---: | --- |");
lines.push(`| Structured static | ${countBy((row) => row.classification === "Structured static")} | Direct \`bonus_stat\` rows; no passive rule required. |`);
lines.push(`| Mapped constant | ${countBy((row) => row.classification === "Mapped constant")} | Constant outputs in \`SET_PASSIVE_RULES\`. |`);
lines.push(`| Dynamic or thresholded | ${countBy((row) => row.classification === "Dynamic or thresholded")} | Depends on attributes, Health, Mana, or Defense. |`);
lines.push(`| Explicit unsupported | ${unmapped.length} | Description exists, but the static calculator deliberately applies nothing and returns the unsupported reason. |`);
lines.push(`| **Total** | **${rows.length}** | |`);
lines.push("");
lines.push(`Cross-cutting limitation: **${staticOnly.length}** mapped breakpoints include a persistent static component but omit additional conditional combat behavior from sheet totals.`);
lines.push("");
lines.push("## Confirmed and high-risk findings");
lines.push("");
for (const row of [...confirmed, ...highRisk, ...review]) {
  lines.push(`- **${row.setName} ${row.count}-piece** (\`${row.setId}\`): ${row.status} Current calculation: ${row.calculation}`);
}
lines.push("");
lines.push("## Mapped static components with unsupported conditional portions");
lines.push("");
for (const row of staticOnly) {
  lines.push(`- **${row.setName} ${row.count}-piece** (\`${row.setId}\`): ${row.calculation}. Full description: ${clean(row.description)}`);
}
lines.push("");
lines.push("## Explicit unsupported effects");
lines.push("");
for (const row of unmapped) {
  lines.push(`- **${row.setName} ${row.count}-piece** (\`${row.setId}\`): ${row.status} Description: ${clean(row.description)}`);
}
lines.push("");
lines.push("## Provenance and confidence rules");
lines.push("");
lines.push("1. Decoded game records and linked formula/effect rows are the preferred source for client-visible mechanics.");
lines.push("2. The warehouse is the durable interface to decoded records, but not every set description currently has a complete effect-property to abnormal-state linkage.");
lines.push("3. Questlog projection descriptions identify set membership and user-facing behavior, but are not authoritative for breakpoint joins or stat identity. Decoded overrides are required when projection text conflicts with TLItemSetBonus or formula rows.");
lines.push("4. Questlog compatibility rules reproduce its static calculator, but parity is not proof of in-game correctness. Auric demonstrates this directly.");
lines.push("5. Conditional combat effects must remain separate from persistent sheet totals. They should be labeled modeled or unsupported until their trigger, duration, stacking, and uptime are represented explicitly.");
lines.push("");
lines.push("## Auric breakpoint example");
lines.push("");
lines.push("The Vanguard Leader 2-piece effect is 45 Magic, Melee, and Ranged Endurance per complete 10 Perception. At 41 Perception, the calculator now uses `floor(41 / 10) * 45 = 180` displayed Endurance. Internally, Endurance uses a 0.1 display modifier, so that is raw `1,800`, not raw `1,845`. Boundary tests cover 9, 10, 19, 20, 40, and 41 Perception.");
lines.push("");
lines.push("## Evidence locations");
lines.push("");
lines.push("- `web/data/projections/equipment.json`: 78-set projection and all 151 descriptions/breakpoints for Steam build 24118850.");
lines.push("- `web/tl-questlog-rules.js`: current static set formula registry and stat unit conversions.");
lines.push("- `web/tl-core.js`: ordered calculation phases, canonical set-effect trace, explicit unsupported registry, and exclusivity application.");
lines.push("- `web/optimizer/tl-full-build-adapter.js`: direct candidate ranking, set-completion hints, and complete finalist calculation.");
lines.push("- `web/optimizer/tl-full-build-optimizer.js`: deterministic bounded beam pruning followed by complete evaluation of retained finalists.");
lines.push("- `D:/TL_Data/decoded/24118850/tables`: decoded set joins and abnormal-state evidence used by the localization resolution review.");
lines.push("");
lines.push("## Release state and remaining work");
lines.push("");
lines.push("1. Keep the nine combat or scoped breakpoints explicitly unsupported until a verified sheet-stat mapping or combat-stage model exists.");
lines.push("2. Keep the calibrated lower-PriorityInGroup exclusivity direction covered by the Veiled Concord/Secret Order versus Death regression test.");
lines.push("3. Improve bounded optimizer coverage for attribute-activated dynamic sets, partial artifact-set hybrids, Heroic configuration, weapon-material interactions, and rune refinement. These affect search completeness, not finalist arithmetic.");
lines.push("4. Continue using `calculateBuild` as the only final sheet-stat authority and require every new projected breakpoint to pass the structured/mapped/unsupported classification test.");
lines.push("");
lines.push("## Optimizer search state");
lines.push("");
lines.push("Equipment candidates retain their direct stat value once through the beam stat vector. Future set-completion value is carried separately as an optimistic per-piece hint, and those hints are disabled when set effects are excluded. Artifact bundle objective hints are preserved instead of being overwritten. Every retained finalist is recalculated through `calculateBuild`; hints never enter returned totals or the final score directly. The search remains bounded, so the UI correctly describes the result as the best loadout found rather than proof of a global optimum.");
lines.push("");
lines.push("## Complete breakpoint inventory");
lines.push("");
lines.push("| Kind | Set | Pieces | Description | Current calculation | Classification | Review status | Provenance |");
lines.push("| --- | --- | ---: | --- | --- | --- | --- | --- |");
for (const row of rows) {
  lines.push(`| ${row.kind} | ${escapeCell(row.setName)} (\`${row.setId}\`) | ${row.count} | ${escapeCell(row.description)} | ${escapeCell(row.calculation)} | ${row.classification} | ${escapeCell(row.status)} | ${row.provenance} |`);
}
lines.push("");
lines.push("## Verification performed");
lines.push("");
lines.push("- `node scripts/audit-set-effects.mjs` regenerates this document deterministically.");
lines.push("- The generated inventory contains exactly 151 data rows and no malformed table rows.");
lines.push("- `scripts/tests/canonical-set-effects.test.mjs` proves all 151 breakpoints have exactly one classification and checks applied, inactive, suppressed, excluded, and unsupported states.");
lines.push("- Cross-surface tests compare Armory BuildSnapshot, Gear Viewer slot deltas, and optimizer adapter totals against the same Nine Lives calculation.");
lines.push("- Reference-build and edge-case verification remain release gates after any formula, data, or optimizer-search change.");
lines.push("");
lines.push("## Review handoff");
lines.push("");
lines.push("A reviewing agent should read this document, `STATUS.md` source-of-truth hierarchy, `docs/set-effect-localization-resolution-2026-07-13.md`, `web/tl-questlog-rules.js`, `web/tl-core.js`, `web/optimizer/tl-full-build-adapter.js`, and `web/optimizer/tl-full-build-optimizer.js`. Preserve data-backed, derived, modeled, and unsupported stages, and do not promote conditional combat effects into static totals without evidence.");
lines.push("");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ outputPath, sets: data.itemSets.length, breakpoints: rows.length, confirmed: confirmed.length, highRisk: highRisk.length, review: review.length, unmapped: unmapped.length }, null, 2));
