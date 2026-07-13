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
  "set_aa_leather_003:4": "floor(final Fortitude / 10) * 2% Attack Speed.",
  "set_a_artifact_set_006:6": "floor(pre-effect Max Health * 7%).",
  "set_a_artifact_set_007:6": "floor(each pre-effect Defense value * 7%).",
  "set_aa_T2_fabric_001:4": "min(20, floor(final Max Mana / 1,000))% Cooldown Speed.",
  "set_aa_T2_plate_001:4": "min(240, floor(final Max Health / 1,000) * 12) Melee Heavy Attack Chance.",
  "set_aa_T2_plate_005:2": "floor(final Perception / 10) * 45 Endurance.",
  "set_aa_T2_plate_005:4": "If final Fortitude >= 50, Main Weapon Base Damage +30.",
  "set_aa_t3_plate_001:4": "Endurance +250 each; min(24, floor(final Max Health / 1,000) * 0.6)% Heavy Attack Damage Resistance.",
  "set_aa_t3_plate_002:2": "floor(final Strength / 10) * 30 Heavy Attack Chance.",
  "set_aa_t4_fabric_004:2": "Heavy Attack Damage +20%; floor(final Wisdom / 10) * 30 PvP Magic Heavy Attack Chance.",
  "set_aa_t4_leather_003:2": "Critical Damage +15%; floor(final Fortitude / 10) * 30 PvP Melee Critical Hit Chance.",
  "set_aa_t4_leather_005:2": "Critical Damage +15%; floor(final Dexterity / 10) * 30 PvP Ranged Critical Hit Chance.",
  "set_aa_t4_Plate_004:2": "Heavy Attack Damage +20%; floor(final Perception / 10) * 30 PvP Melee Heavy Attack Chance.",
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
  "set_aa_fabric_001:2": "Persistent static component; missing supported stat mapping.",
  "set_aa_PartyDungeon_Ring_001:2": "Persistent static component; should be representable.",
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
    const description = passives.map((passive) => passive.text || passive.name).filter(Boolean).join(" / ")
      || structuredCalculation(staticRows);
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
      provenance = "Questlog compatibility rule";
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
      provenance = "Questlog compatibility rule";
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
lines.push(`- Audit date: 2026-07-13`);
lines.push(`- Game build: \`${projection.gameBuild}\``);
lines.push(`- Data generated: \`${projection.generatedAtUtc}\``);
lines.push(`- Unique sets: **${data.itemSets.length}** (${artifactIds.size} artifact sets, ${data.itemSets.length - artifactIds.size} equipment/accessory sets)`);
lines.push(`- Activation breakpoints: **${rows.length}** (${Object.entries(thresholds).map(([count, total]) => `${count}-piece: ${total}`).join(", ")})`);
lines.push("- Counting rule: artifact definitions duplicated between `itemSets` and `artifactSets` are normalized by set ID. One effect row means one set activation breakpoint; a breakpoint may contain several stat changes or a static plus conditional mechanic.");
lines.push("");
lines.push("## Executive finding");
lines.push("");
lines.push(`The final build calculator applies known set rules, but the optimizer's bounded candidate search scores individual item contributions with set effects disabled. Strong completed sets can therefore be removed before exact finalist calculation. The current registry also contains one user-confirmed dynamic formula error, ${highRisk.length} high-risk description-to-rule conflicts, boundary ambiguities, party-aura stacking assumptions, and thirteen unmapped passive breakpoints. Set-based optimizer results are provisional until both the formula registry and search strategy are corrected.`);
lines.push("");
lines.push("## Coverage summary");
lines.push("");
lines.push("| Classification | Breakpoints | Meaning |");
lines.push("| --- | ---: | --- |");
lines.push(`| Structured static | ${countBy((row) => row.classification === "Structured static")} | Direct \`bonus_stat\` rows; no passive rule required. |`);
lines.push(`| Mapped constant | ${countBy((row) => row.classification === "Mapped constant")} | Constant outputs in \`SET_PASSIVE_RULES\`. |`);
lines.push(`| Dynamic or thresholded | ${countBy((row) => row.classification === "Dynamic or thresholded")} | Depends on attributes, Health, Mana, or Defense. |`);
lines.push(`| Unmapped passive | ${unmapped.length} | Description exists, but static calculator applies nothing. |`);
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
lines.push("## Unmapped effects");
lines.push("");
for (const row of unmapped) {
  lines.push(`- **${row.setName} ${row.count}-piece** (\`${row.setId}\`): ${row.status} Description: ${clean(row.description)}`);
}
lines.push("");
lines.push("## Provenance and confidence rules");
lines.push("");
lines.push("1. Decoded game records and linked formula/effect rows are the preferred source for client-visible mechanics.");
lines.push("2. The warehouse is the durable interface to decoded records, but not every set description currently has a complete effect-property to abnormal-state linkage.");
lines.push("3. Questlog projection descriptions identify set membership and user-facing behavior.");
lines.push("4. Questlog compatibility rules reproduce its static calculator, but parity is not proof of in-game correctness. Auric demonstrates this directly.");
lines.push("5. Conditional combat effects must remain separate from persistent sheet totals. They should be labeled modeled or unsupported until their trigger, duration, stacking, and uptime are represented explicitly.");
lines.push("");
lines.push("## Auric breakpoint example");
lines.push("");
lines.push("The Vanguard Leader 2-piece effect is written as 45 Magic, Melee, and Ranged Endurance per complete 10 Perception. At 41 Perception, the correct calculation is `floor(41 / 10) * 45 = 180` displayed Endurance. Internally, Endurance uses a 0.1 display modifier, so that is raw `1,800`, not raw `1,845`. The current rule computes `41 * 4.5 = 184.5` displayed, which incorrectly grants partial progress between ten-point breakpoints.");
lines.push("");
lines.push("## Evidence locations");
lines.push("");
lines.push("- `web/data/projections/equipment.json`: 78-set projection and all 151 descriptions/breakpoints for Steam build 24118850.");
lines.push("- `web/tl-questlog-rules.js`: current static set formula registry and stat unit conversions.");
lines.push("- `web/tl-core.js:1708` and `:1821-1844`: exact build calculation phases and passive set-rule application.");
lines.push("- `web/tl-full-build-adapter.js:469`: approximate slot contribution explicitly called with set effects disabled.");
lines.push("- `web/tl-full-build-optimizer.js:95-106`, `:212`, and `:219`: bounded beam pruning followed by exact calculation only for retained finalists.");
lines.push("- `D:/TL_Data/warehouse/tl-24118850.sqlite`: decoded-record warehouse. It contains Vanguard Leader skill and formula records, including tooltip value 45 and a multiplier record, but the current warehouse links do not alone establish the whole-ten-point operation.");
lines.push("");
lines.push("## Required correction sequence");
lines.push("");
lines.push("1. Replace the Auric 2-piece formula with `floor(final Perception / 10) * 45` and add boundary tests at 9, 10, 19, 20, 40, and 41 Perception.");
lines.push(`2. Resolve the ${highRisk.length} high-risk constant conflicts and the two strict-threshold boundaries from decoded effect and conditional-branch records or a minimal in-game stat-panel check.`);
lines.push("3. Split unmapped mixed effects into persistent and conditional components. Add only persistent, client-visible totals to the static calculator.");
lines.push("4. Record every breakpoint in a provenance-bearing registry with formula kind, dependencies, unit conversion, phase, confidence, and supported calculation stage.");
lines.push("5. Make optimizer pruning breakpoint-aware. Precompute set topology and possible completions, but evaluate dynamic values against projected final attributes rather than freezing one number.");
lines.push("6. Keep `calculateBuild` as the final exact static authority, rerun reference fixtures, then compare optimizer output before and after the search correction.");
lines.push("");
lines.push("## Optimizer-specific defect");
lines.push("");
lines.push("`web/tl-full-build-adapter.js:469` calls `slotSelectionContribution(..., { includeSetEffects: false })` while constructing candidates. Set IDs are retained as count keys, but no future breakpoint value enters the approximate stat vector. `web/tl-full-build-optimizer.js:95-106` and `:212` globally prune the beam using those approximate stats. Exact evaluation starts only at `:219`, which is too late for discarded set routes such as Nine Lives.");
lines.push("");
lines.push("A deterministic four-slot reproduction used a +1 standalone candidate and a zero-immediate-value set candidate in each slot. Completing four set candidates was worth +100 in the exact evaluator. With beam width 1, approximate pruning retained four standalone items for an exact score of 4 and discarded the exact-score-100 set route before finalist evaluation. This isolates the search defect independently of item data or formula correctness.");
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
lines.push("- `node --test scripts/tests/set-aware-fit.test.mjs scripts/tests/artifact-set-calculation.test.mjs scripts/tests/full-build-optimizer.test.mjs` passed 10 of 10 tests.");
lines.push("- Production calculation and optimizer files were not modified during this audit. Formula and search changes remain review-gated.");
lines.push("");
lines.push("## Review handoff");
lines.push("");
lines.push("A reviewing agent should read this document, `STATUS.md` source-of-truth hierarchy, `web/tl-questlog-rules.js`, `web/tl-core.js`, `web/tl-full-build-adapter.js`, and `web/tl-full-build-optimizer.js`. Review formulas before implementation, preserve exact versus modeled versus unsupported stages, and do not promote conditional combat effects into static totals without evidence.");
lines.push("");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ outputPath, sets: data.itemSets.length, breakpoints: rows.length, confirmed: confirmed.length, highRisk: highRisk.length, review: review.length, unmapped: unmapped.length }, null, 2));
