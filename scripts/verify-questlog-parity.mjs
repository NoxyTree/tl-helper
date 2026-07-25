// Questlog stat-parity verifier — hermetic and offline.
//
// For each fixture in scripts/reference-builds/questlog-parity/, imports the
// frozen Questlog payload, runs it through calculateBuild(), and compares our
// totals against the Combined Stats panel Questlog itself rendered for the same
// build. Stats are matched by DISPLAY LABEL.
//
// Questlog is the reference. Our number is wrong when it disagrees.
//
// EVERY PANEL ROW MUST BE ACCOUNTED FOR. Until 2026-07-25 a panel row whose
// label matched no stat was silently dropped: not compared, not failed, not
// counted. 62 of 887 rows were invisible that way and "819/825 = 99.3%" meant
// 99.3% of the rows we happened to map, not of what Questlog displays. A parity
// number that hides its denominator is worse than a lower honest one, so this
// script now classifies every row and FAILS on any it cannot verify. Widening
// the denominator is the point; see UNVERIFIED_PANEL_ROWS for the escape hatch.
//
// The label join is not self-maintaining. The web-data projection only
// title-cases stat ids, so our display names come from STAT_ALIASES and
// derivedQuestlogStatName in tl-core.js — a hand-written map that can drift from
// Questlog's wording. All 62 dropped rows were drift or capture shape, not
// missing maths: 23 were stats we already computed exactly under a name
// Questlog does not use ("Move Speed" for its "Movement Speed"), 37 were boss_
// defence projections that no item grants directly (so they never reach
// data.statLabels, though calculateBuild does total them), and 2 were Combat
// Power, which we compute outside the stat table entirely.
//
//   node scripts/verify-questlog-parity.mjs            # table + regression gate
//   node scripts/verify-questlog-parity.mjs --verbose  # list every mismatch
//   node scripts/verify-questlog-parity.mjs --json     # machine-readable
//
// The committed `baselineMatched` in each fixture is a ratchet: the number of
// stats we get right may rise freely, but losing one fails the run. Raise a
// baseline only alongside the change that earned it.
//
// The ratchet counts MATCHED STATS, not the percentage. Refreshing game data can
// make previously-absent stats comparable, growing the denominator while matches
// hold — the healer went 5/81 to 5/83 that way. That is richer coverage, not a
// regression, and gating on percentage would punish it. A real regression is
// losing a stat we used to get right.
//
// Refreshing a fixture: the payload and the panel MUST be recaptured together.
// Owners edit their builds, and a payload newer than its panel silently reports
// false mismatches (observed 2026-07-24 on the reference build, where a re-spec
// turned 43/43 into 22/43).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as core from "../web/tl-core.js";
import { loadWebDataFromFile } from "./lib/load-web-projections.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = path.join(repoRoot, "scripts", "reference-builds", "questlog-parity");
const verbose = process.argv.includes("--verbose");
const asJson = process.argv.includes("--json");

const data = await loadWebDataFromFile(path.join(repoRoot, "web", "data", "app-data.json"));
await core.initCore(data);

// Display labels are the join key. First-wins on collisions, over sorted ids, so
// the mapping is deterministic and independent of fixture order.
const idsByLabel = new Map();
for (const id of Object.keys(core.data.statLabels ?? {}).sort()) {
  const label = String(core.statName(id));
  if (!idsByLabel.has(label)) idsByLabel.set(label, id);
}

// Panel rows that are not a plain "one label, one stat total" pair. Everything
// else joins by label; these are shape quirks, so they are named here rather
// than papered over with a label alias that would misname the stat in the UI.
//
// Questlog renders main-hand weapon damage as one range row, "478 ~ 1071". The
// capture splits on whitespace, so the label lands on the minimum and the
// separator becomes a key: {"Max Damage": "478", "~": "1071"}. Both ends are
// real reference values — we compare them against min and max rather than
// recapture, which would desynchronise the payload from the panel.
const WEAPON_DAMAGE_LABEL = "Max Damage";
const WEAPON_DAMAGE_SEPARATOR = "~";
// In the weapon block Questlog drops the "Main Weapon" prefix it uses elsewhere.
const WEAPON_RANGE_LABEL = "Range";
// Combat Power is a Questlog-side aggregate over equipment, skills and masteries,
// not a game stat: it has no id, no row in calculateBuild, and no entry in
// STAT_EXPANSIONS. We already derive it (core.combatPowerBreakdown, a fitted
// heuristic), so it is compared here rather than left out of the denominator.
const COMBAT_POWER_LABEL = "Combat Power";

// Panel rows this script is knowingly unable to verify, label -> reason. Adding
// one is a deliberate, reviewed admission that a row Questlog displays is
// outside our model; it keeps the row visible in the report instead of dropping
// it silently. Empty is the goal state and the current state.
const UNVERIFIED_PANEL_ROWS = {};

const numeric = (text) => Number(String(text).replace(/[,%\s]/g, "").replace(/[sm]$/, ""));

function verifyFixture(fixture) {
  const raw = fixture.questlogPayload;
  const imported = core.importQuestlogBuild({
    characterData: { character: raw.character ?? {} },
    build: raw.build,
    skillBuild: raw.skillBuild,
    masteryBuild: raw.masteryBuild,
  });
  const calculation = core.calculateBuild(imported.build, imported.attributes, { includeSetEffects: true });
  const totals = Object.fromEntries((calculation.stats ?? []).map((row) => [row.id, Number(row.total) || 0]));

  // calculateBuild totals ids that data.statLabels never sees: the boss_ defence
  // projections are fed only through STAT_EXPANSIONS, so no item grants them
  // directly and the projection never collects them. They have Questlog names and
  // real totals, so join them too. Additions never displace a label the sorted
  // statLabels pass already claimed, so this can only widen the comparison.
  const labelToId = new Map(idsByLabel);
  for (const row of calculation.stats ?? []) {
    const label = String(core.statName(row.id));
    if (!labelToId.has(label)) labelToId.set(label, row.id);
  }

  const compared = [];
  const unverified = [];
  const compare = (label, id, displayed, ours) => {
    const theirs = numeric(displayed);
    if (!Number.isFinite(ours) || !Number.isFinite(theirs)) {
      unverified.push({ label, reason: `unparseable value (questlog ${JSON.stringify(displayed)}, ours ${ours})` });
      return;
    }
    const delta = ours - theirs;
    // Absolute tolerance covers display rounding; relative covers large values.
    const match = Math.abs(delta) < 0.05 || (theirs !== 0 && Math.abs(delta / theirs) < 0.0005);
    compared.push({ label, id, questlog: theirs, ours, delta, match });
  };
  // Compares through formatStat so both sides are the string a user reads. A
  // missing total is reported, never formatted: formatStat coerces a missing
  // value to 0, which would read as a wrong number instead of an absent one.
  const compareStat = (label, id, displayed) => {
    if (totals[id] == null) {
      unverified.push({ label, reason: `${id} has no calculated total` });
      return;
    }
    compare(label, id, displayed, numeric(core.formatStat(id, totals[id])));
  };

  const entries = Object.entries(fixture.questlogPanel ?? {});
  for (let index = 0; index < entries.length; index += 1) {
    const [label, displayed] = entries[index];
    const next = entries[index + 1];
    if (UNVERIFIED_PANEL_ROWS[label]) {
      unverified.push({ label, reason: UNVERIFIED_PANEL_ROWS[label], exempt: true });
      continue;
    }
    if (label === COMBAT_POWER_LABEL) {
      compare(label, "combat_power", displayed, core.calculateCombatPower(imported.build));
      continue;
    }
    // A split damage range: this row carries the minimum, the next the maximum.
    if (label === WEAPON_DAMAGE_LABEL && next?.[0] === WEAPON_DAMAGE_SEPARATOR) {
      compareStat("Main Weapon Min Damage", "attack_power_main_hand_min", displayed);
      compareStat("Main Weapon Max Damage", "attack_power_main_hand_max", next[1]);
      index += 1;
      continue;
    }
    const id = label === WEAPON_RANGE_LABEL ? "attack_range_main_hand" : labelToId.get(label);
    if (!id) {
      unverified.push({ label, reason: "label matches no stat name" });
      continue;
    }
    compareStat(label, id, displayed);
  }

  const matched = compared.filter((row) => row.match).length;
  const panelRows = entries.length;
  // Conservation: a split range consumes two rows and yields two comparisons, so
  // every panel row is either compared or reported unverified. A drift here means
  // rows are vanishing again, which is the bug this script exists to prevent.
  if (compared.length + unverified.length !== panelRows) {
    throw new Error(`${fixture.buildId}: ${panelRows} panel rows but ${compared.length} compared + ${unverified.length} unverified`);
  }
  return {
    buildId: fixture.buildId,
    label: fixture.label,
    status: calculation.status?.state ?? "unknown",
    blockingIssues: (calculation.status?.blockingIssues ?? []).map((row) => row.message),
    panelRows,
    compared: compared.length,
    matched,
    unverified,
    parity: compared.length ? matched / compared.length : 0,
    baselineMatched: Number(fixture.baselineMatched ?? 0),
    mismatches: compared.filter((row) => !row.match)
      .sort((a, b) => Math.abs(b.delta / (b.questlog || 1)) - Math.abs(a.delta / (a.questlog || 1))),
  };
}

const fixtures = fs.readdirSync(fixtureDir).filter((name) => name.endsWith(".json")).sort();
if (!fixtures.length) throw new Error(`No parity fixtures in ${fixtureDir}`);

const results = fixtures.map((name) => verifyFixture(JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8"))));
const regressions = results.filter((row) => row.matched < row.baselineMatched);
// Exempt rows are declared in UNVERIFIED_PANEL_ROWS and stay visible in the
// report; anything else unverified is an undeclared gap and fails the run.
const undeclared = results.flatMap((row) => row.unverified.filter((entry) => !entry.exempt).map((entry) => ({ ...entry, buildId: row.buildId, build: row.label })));

const totalPanelRows = results.reduce((sum, row) => sum + row.panelRows, 0);
const totalUnverified = results.reduce((sum, row) => sum + row.unverified.length, 0);

if (asJson) {
  console.log(JSON.stringify({
    results,
    totals: {
      panelRows: totalPanelRows,
      compared: results.reduce((sum, row) => sum + row.compared, 0),
      matched: results.reduce((sum, row) => sum + row.matched, 0),
      unverified: totalUnverified,
    },
    regressions: regressions.map((row) => row.buildId),
    undeclaredUnverified: undeclared,
  }, null, 2));
} else {
  console.log("Questlog stat parity (Questlog is the reference)\n");
  for (const row of results.sort((a, b) => b.parity - a.parity)) {
    const pct = (row.parity * 100).toFixed(1).padStart(5);
    const flag = row.matched < row.baselineMatched ? "  REGRESSED" : row.matched > row.baselineMatched ? "  (+" + (row.matched - row.baselineMatched) + ")" : "";
    const skip = row.unverified.length ? `  ${row.unverified.length} of ${row.panelRows} panel rows UNVERIFIED` : "";
    console.log(`  ${pct}%  ${String(row.matched).padStart(3)}/${String(row.compared).padEnd(3)}  ${row.label.padEnd(32)} [${row.status}]${row.blockingIssues.length ? ` ${row.blockingIssues.length} blocking` : ""} (ratchet ${row.baselineMatched})${flag}${skip}`);
    for (const issue of row.blockingIssues) console.log(`           ! ${issue}`);
    for (const entry of row.unverified) console.log(`           ? ${entry.label.padEnd(34)} ${entry.reason}`);
    if (verbose) {
      for (const m of row.mismatches) {
        console.log(`           ${m.label.padEnd(34)} questlog ${String(m.questlog).padStart(10)}  ours ${String(m.ours).padStart(10)}  delta ${m.delta}`);
      }
    }
  }
  const totalCompared = results.reduce((sum, row) => sum + row.compared, 0);
  const totalMatched = results.reduce((sum, row) => sum + row.matched, 0);
  console.log(`\n  Overall: ${totalMatched}/${totalCompared} = ${((totalMatched / totalCompared) * 100).toFixed(1)}% across ${results.length} archetypes`);
  // Always print the denominator's own denominator, even at zero. The parity
  // percentage only means something next to the rows it left out.
  console.log(`  Panel coverage: ${totalCompared} of ${totalPanelRows} displayed rows compared, ${totalUnverified} unverified`);
}

if (regressions.length) {
  console.error(`\nLost previously-matching stats: ${regressions.map((row) => `${row.label} (${row.matched} < ${row.baselineMatched})`).join("; ")}`);
}
if (undeclared.length) {
  console.error(`\n${undeclared.length} panel row(s) Questlog displays could not be verified:`);
  for (const entry of undeclared) console.error(`  ${entry.build} (${entry.buildId})  ${entry.label} — ${entry.reason}`);
  console.error("\nModel the stat, fix the display name in STAT_ALIASES, or declare it in UNVERIFIED_PANEL_ROWS with a reason. Leaving it out of the comparison is what this gate exists to stop.");
}
if (regressions.length || undeclared.length) process.exit(1);
