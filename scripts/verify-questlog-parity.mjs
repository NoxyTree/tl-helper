// Questlog stat-parity verifier — hermetic and offline.
//
// For each fixture in scripts/reference-builds/questlog-parity/, imports the
// frozen Questlog payload, runs it through calculateBuild(), and compares our
// totals against the Combined Stats panel Questlog itself rendered for the same
// build. Stats are matched by DISPLAY LABEL: both sides label from the same game
// data, so there is no hand-written mapping to drift.
//
// Questlog is the reference. Our number is wrong when it disagrees.
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

// These frozen Questlog builds genuinely store fewer activated Achievement
// effects than validateMasterySelections requires. Their specialization arrays
// import one-for-one, and the payload/panel pairs were captured together, so
// synthesizing another effect would make the import less faithful. Keep the
// core legality warning, but distinguish these exact known source conditions
// from unexpected blockers in the parity report.
//
// 8197308 (hit tank) and 8261110 (healer) are the conclusive pair: both reach
// FULL parity with the under-activation in place, so Questlog demonstrably
// rendered the same one-effect tier we do.
//
// 8227612 (Juggernaut) and 8290225 (Magic DPS) are ACCEPTED, not explained —
// owner decision, 2026-08-12. Their disagreements are characterised down to
// named nodes in mastery-achievement-parity-2026-07-25.md but not resolved, and
// resolving them needs an in-game observation this repo cannot produce. The
// deltas are pinned in ACCEPTED_MISMATCHES below so accepting them cannot turn
// into ignoring them. Read that doc before touching either entry: the standing
// instruction not to invent an engine rule that zeroes out Double Impact is
// still in force, and is the reason these are accepted rather than "fixed".
const EXPECTED_BLOCKING_ISSUES = new Map([
  ["8197308", new Set([
    "Greatsword Uncommon mastery must activate 2 Achievement effects; 1 are stored.",
  ])],
  ["8261110", new Set([
    "Orb Common mastery must activate 2 Achievement effects; 1 are stored.",
  ])],
  ["8227612", new Set([
    "Greatsword Common mastery must activate 2 Achievement effects; 1 are stored.",
    "Greatsword Rare mastery must activate 2 Achievement effects; 1 are stored.",
  ])],
  ["8290225", new Set([
    "Staff Uncommon mastery must activate 2 Achievement effects; 1 are stored.",
  ])],
]);

// The exact disagreements accepted above, pinned by signed delta.
//
// The ratchet cannot guard these. It counts MATCHED stats, and an accepted
// mismatch is already counted as unmatched — so Critical Damage could drift
// from +15.6 to +150 and every number the ratchet watches would hold. Without
// this map, "accepted" would quietly mean "unbounded".
//
// Juggernaut: all five rows are the two nodes Questlog does not apply and we
// do — Double Impact (GT_Hero_Tactic_04) accounts for Critical Damage and
// Critical Damage Resistance, Steel Sacrifice (Sword2h_Normal_Def_Skill) for
// the three Melee Heavy Attack Chance contexts. Magic DPS: one stat, raw 600 we
// do not have, running the opposite direction and still unattributed.
//
// A delta that grows, a new mismatch in an accepted fixture, or a shape change
// fails the run. A delta that goes to zero does NOT fail — that is the fix
// landing, and the message says to drop the entry and raise the ratchet.
const ACCEPTED_MISMATCHES = new Map([
  ["8227612", new Map([
    ["Critical Damage", 15.6],
    ["Critical Damage Resistance", 1.2],
    ["Melee Heavy Attack Chance", -100],
    ["PvP Melee Heavy Attack Chance", -100],
    ["Boss Melee Heavy Attack Chance", -100],
  ])],
  ["8290225", new Map([
    ["Critical Damage Resistance", -6],
  ])],
]);
// Same absolute tolerance the match test uses, so a delta that only moves by
// display rounding is not treated as drift.
const ACCEPTED_DELTA_TOLERANCE = 0.05;

// Both sides render from the same game data, so display labels are the join key.
const idsByLabel = new Map();
for (const id of Object.keys(core.data.statLabels ?? {})) {
  const label = String(core.statName(id));
  if (!idsByLabel.has(label)) idsByLabel.set(label, id);
}

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

  const compared = [];
  for (const [label, displayed] of Object.entries(fixture.questlogPanel ?? {})) {
    const id = idsByLabel.get(label);
    if (!id || totals[id] == null) continue;
    const ours = numeric(core.formatStat(id, totals[id]));
    const theirs = numeric(displayed);
    if (!Number.isFinite(ours) || !Number.isFinite(theirs)) continue;
    const delta = ours - theirs;
    // Absolute tolerance covers display rounding; relative covers large values.
    const match = Math.abs(delta) < 0.05 || (theirs !== 0 && Math.abs(delta / theirs) < 0.0005);
    compared.push({ label, id, questlog: theirs, ours, delta, match });
  }

  const matched = compared.filter((row) => row.match).length;
  const blockingIssues = calculation.status?.blockingIssues ?? [];
  const expectedMessages = EXPECTED_BLOCKING_ISSUES.get(String(fixture.buildId)) ?? new Set();
  const expectedBlockingIssues = blockingIssues.filter((row) => expectedMessages.has(row.message));
  const unexpectedBlockingIssues = blockingIssues.filter((row) => !expectedMessages.has(row.message));

  // Accepted-mismatch drift. Only fixtures carrying an acceptance record are
  // checked; everywhere else a mismatch is governed by the ratchet exactly as
  // before, so this cannot fail a fixture that was passing.
  const accepted = ACCEPTED_MISMATCHES.get(String(fixture.buildId));
  const mismatched = compared.filter((row) => !row.match);
  const acceptedDrift = [];
  const acceptedHealed = [];
  if (accepted) {
    for (const row of mismatched) {
      if (!accepted.has(row.label)) {
        acceptedDrift.push(`${row.label}: new disagreement (questlog ${row.questlog}, ours ${row.ours}) in an accepted fixture`);
        continue;
      }
      const pinned = accepted.get(row.label);
      if (Math.abs(row.delta - pinned) > ACCEPTED_DELTA_TOLERANCE) {
        acceptedDrift.push(`${row.label}: accepted delta was ${pinned}, now ${Number(row.delta.toFixed(3))}`);
      }
    }
    const stillMismatched = new Set(mismatched.map((row) => row.label));
    for (const label of accepted.keys()) {
      if (!stillMismatched.has(label)) acceptedHealed.push(label);
    }
  }
  return {
    buildId: fixture.buildId,
    label: fixture.label,
    status: calculation.status?.state ?? "unknown",
    blockingIssues: blockingIssues.map((row) => row.message),
    expectedBlockingIssues: expectedBlockingIssues.map((row) => row.message),
    unexpectedBlockingIssues: unexpectedBlockingIssues.map((row) => row.message),
    compared: compared.length,
    matched,
    parity: compared.length ? matched / compared.length : 0,
    baselineMatched: Number(fixture.baselineMatched ?? 0),
    acceptedDrift,
    acceptedHealed,
    mismatches: mismatched
      .sort((a, b) => Math.abs(b.delta / (b.questlog || 1)) - Math.abs(a.delta / (a.questlog || 1))),
  };
}

const fixtures = fs.readdirSync(fixtureDir).filter((name) => name.endsWith(".json")).sort();
if (!fixtures.length) throw new Error(`No parity fixtures in ${fixtureDir}`);

const results = fixtures.map((name) => verifyFixture(JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8"))));
const regressions = results.filter((row) => row.matched < row.baselineMatched);

if (asJson) {
  console.log(JSON.stringify({ results, regressions: regressions.map((row) => row.buildId) }, null, 2));
} else {
  console.log("Questlog stat parity (Questlog is the reference)\n");
  for (const row of results.sort((a, b) => b.parity - a.parity)) {
    const pct = (row.parity * 100).toFixed(1).padStart(5);
    const flag = row.matched < row.baselineMatched ? "  REGRESSED" : row.matched > row.baselineMatched ? "  (+" + (row.matched - row.baselineMatched) + ")" : "";
    const blockerFlags = [
      row.unexpectedBlockingIssues.length ? `${row.unexpectedBlockingIssues.length} blocking` : "",
      row.expectedBlockingIssues.length ? `${row.expectedBlockingIssues.length} expected blocking` : "",
    ].filter(Boolean);
    console.log(`  ${pct}%  ${String(row.matched).padStart(3)}/${String(row.compared).padEnd(3)}  ${row.label.padEnd(32)} [${row.status}]${blockerFlags.length ? ` ${blockerFlags.join(", ")}` : ""} (ratchet ${row.baselineMatched})${flag}`);
    for (const issue of row.unexpectedBlockingIssues) console.log(`           ! ${issue}`);
    for (const issue of row.expectedBlockingIssues) console.log(`           ~ expected: ${issue}`);
    for (const drift of row.acceptedDrift) console.log(`           ! accepted mismatch drifted — ${drift}`);
    for (const label of row.acceptedHealed) console.log(`           + ${label} now matches — drop it from ACCEPTED_MISMATCHES and raise the ratchet`);
    if (verbose) {
      for (const m of row.mismatches) {
        console.log(`           ${m.label.padEnd(34)} questlog ${String(m.questlog).padStart(10)}  ours ${String(m.ours).padStart(10)}  delta ${m.delta}`);
      }
    }
  }
  const totalCompared = results.reduce((sum, row) => sum + row.compared, 0);
  const totalMatched = results.reduce((sum, row) => sum + row.matched, 0);
  console.log(`\n  Overall: ${totalMatched}/${totalCompared} = ${((totalMatched / totalCompared) * 100).toFixed(1)}% across ${results.length} archetypes`);
}

if (regressions.length) {
  console.error(`\nLost previously-matching stats: ${regressions.map((row) => `${row.label} (${row.matched} < ${row.baselineMatched})`).join("; ")}`);
  process.exit(1);
}

// A ratchet regression was the only failure condition, so this verifier exited
// 0 while reporting fixtures whose numbers we cannot explain — it announced the
// problem and passed anyway. An unexplained blocker means a build we calculate
// differently from our own reference, which is the thing this script exists to
// catch. Expected blockers are the two fixtures proven to be faithful imports
// (see mastery-achievement-parity-2026-07-25.md); everything else fails.
const unexplained = results.filter((row) => row.unexpectedBlockingIssues.length);
if (unexplained.length) {
  console.error(`\n${unexplained.length} fixture${unexplained.length === 1 ? "" : "s"} carry unexplained blocking issues:`);
  for (const row of unexplained) {
    console.error(`  ${row.label} (${row.matched}/${row.compared})`);
    for (const issue of row.unexpectedBlockingIssues) console.error(`    ! ${issue}`);
  }
  console.error("\nEither explain them and mark them expected, or fix the calculation.");
  process.exit(1);
}

// An accepted disagreement is a fixed, named quantity. If it changes size or a
// new one appears alongside it, the acceptance no longer describes what the
// build does and has to be re-made deliberately.
const drifted = results.filter((row) => row.acceptedDrift.length);
if (drifted.length) {
  console.error(`\n${drifted.length} accepted fixture${drifted.length === 1 ? " has" : "s have"} drifted from the accepted disagreement:`);
  for (const row of drifted) {
    console.error(`  ${row.label}`);
    for (const drift of row.acceptedDrift) console.error(`    ! ${drift}`);
  }
  console.error("\nThese were accepted at an exact size (see mastery-achievement-parity-2026-07-25.md).");
  console.error("Re-check what moved, then update ACCEPTED_MISMATCHES deliberately or fix the calculation.");
  process.exit(1);
}

// Good news is not a failure, but it must not pass unremarked either.
const healed = results.filter((row) => row.acceptedHealed.length);
if (healed.length) {
  console.log("\nAccepted mismatches that now match — retire the acceptance and raise the ratchet:");
  for (const row of healed) console.log(`  ${row.label}: ${row.acceptedHealed.join(", ")}`);
}
