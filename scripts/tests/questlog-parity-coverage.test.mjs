// Guards the DENOMINATOR of the questlog parity number, not the number itself.
//
// verify-questlog-parity.mjs joins our stats to Questlog's panel by display
// label. Until 2026-07-25 a panel row whose label matched no stat was dropped
// silently — not compared, not failed, not counted — so 62 of 887 rows were
// invisible and "819/825 = 99.3%" described the rows we could map rather than
// the rows Questlog shows. Every one of those 62 turned out to be a stale
// display name or a capture shape, hiding totals we already computed exactly.
//
// So the failure mode is not a wrong number, it is a quiet one. These tests
// assert the verifier reports what it left out and that nothing can leave the
// comparison without being named.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const fixtureDir = path.resolve("scripts", "reference-builds", "questlog-parity");
const verifier = path.resolve("scripts", "verify-questlog-parity.mjs");

// One child process, shared by every assertion below: a full parity run inits
// core and calculates ten builds, which is far too slow to repeat per test.
const run = (() => {
  const args = [];
  let stdout = "";
  let status = 0;
  try {
    stdout = execFileSync(process.execPath, [verifier, "--json", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    stdout = error.stdout ?? "";
    status = error.status ?? 1;
  }
  return { report: JSON.parse(stdout), status };
})();

const panelRowCount = (fixture) => Object.keys(fixture.questlogPanel ?? {}).length;
const fixtures = fs.readdirSync(fixtureDir).filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8")));

test("the report states how many displayed panel rows went unverified", () => {
  assert.ok(fixtures.length, "no parity fixtures found");
  assert.equal(typeof run.report.totals?.unverified, "number", "totals.unverified must be reported, even when zero");
  assert.equal(typeof run.report.totals?.panelRows, "number", "totals.panelRows must be reported");
  assert.ok(Array.isArray(run.report.undeclaredUnverified), "undeclaredUnverified must be reported");
  for (const result of run.report.results) {
    assert.ok(Array.isArray(result.unverified), `${result.buildId} must list its unverified rows`);
    assert.equal(typeof result.panelRows, "number", `${result.buildId} must report its panel row count`);
    for (const entry of result.unverified) {
      assert.equal(typeof entry.label, "string", `${result.buildId} unverified entry needs a label`);
      assert.ok(entry.reason, `${result.buildId} unverified entry "${entry.label}" needs a reason`);
    }
  }
});

test("the denominator is what Questlog displays, not what we can map", () => {
  // The claim the parity percentage makes. Read the panel row counts straight
  // from the fixtures so a verifier bug cannot define its own denominator.
  const expected = fixtures.reduce((sum, fixture) => sum + panelRowCount(fixture), 0);
  assert.equal(run.report.totals.panelRows, expected);
  assert.equal(run.report.totals.compared + run.report.totals.unverified, expected,
    "every displayed row must be either compared or reported unverified");
  const byId = new Map(run.report.results.map((result) => [String(result.buildId), result]));
  for (const fixture of fixtures) {
    const result = byId.get(String(fixture.buildId));
    assert.ok(result, `${fixture.buildId} missing from the report`);
    assert.equal(result.panelRows, panelRowCount(fixture), `${fixture.buildId} panel row count`);
    assert.equal(result.compared + result.unverified.length, result.panelRows,
      `${fixture.buildId} loses panel rows between the panel and the comparison`);
  }
});

test("no panel row leaves the comparison without being declared", () => {
  // Undeclared unverified rows fail the run. This is the ratchet on coverage:
  // it is currently zero and a new unmappable row must be modelled, renamed, or
  // written into UNVERIFIED_PANEL_ROWS with a reason — never just dropped.
  assert.deepEqual(run.report.undeclaredUnverified, [],
    `undeclared unverified panel rows: ${run.report.undeclaredUnverified.map((entry) => `${entry.label} (${entry.buildId}) — ${entry.reason}`).join("; ")}`);
  assert.equal(run.report.totals.unverified, 0);
  assert.equal(run.report.regressions.length, 0, `ratchet regressions: ${run.report.regressions.join(", ")}`);
  assert.equal(run.status, 0, "a fully covered, non-regressing run must exit 0");
});

test("the human-readable run prints its coverage, so the percentage is never alone", () => {
  // Tolerates a failing run on purpose: coverage is exactly what a run that is
  // failing on unverified rows needs to print.
  let stdout = "";
  try {
    stdout = execFileSync(process.execPath, [verifier], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    stdout = error.stdout ?? "";
  }
  const coverage = stdout.split("\n").find((line) => line.includes("Panel coverage:"));
  assert.ok(coverage, "the report must print a panel coverage line next to the parity percentage");
  assert.match(coverage, new RegExp(`of ${run.report.totals.panelRows} displayed rows compared`));
  assert.match(coverage, /\d+ unverified/);
});
