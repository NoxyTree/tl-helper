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
  return {
    buildId: fixture.buildId,
    label: fixture.label,
    status: calculation.status?.state ?? "unknown",
    blockingIssues: (calculation.status?.blockingIssues ?? []).map((row) => row.message),
    compared: compared.length,
    matched,
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

if (asJson) {
  console.log(JSON.stringify({ results, regressions: regressions.map((row) => row.buildId) }, null, 2));
} else {
  console.log("Questlog stat parity (Questlog is the reference)\n");
  for (const row of results.sort((a, b) => b.parity - a.parity)) {
    const pct = (row.parity * 100).toFixed(1).padStart(5);
    const flag = row.matched < row.baselineMatched ? "  REGRESSED" : row.matched > row.baselineMatched ? "  (+" + (row.matched - row.baselineMatched) + ")" : "";
    console.log(`  ${pct}%  ${String(row.matched).padStart(3)}/${String(row.compared).padEnd(3)}  ${row.label.padEnd(32)} [${row.status}]${row.blockingIssues.length ? ` ${row.blockingIssues.length} blocking` : ""} (ratchet ${row.baselineMatched})${flag}`);
    for (const issue of row.blockingIssues) console.log(`           ! ${issue}`);
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
