// Guards the accepted-mismatch machinery in scripts/verify-questlog-parity.mjs.
//
// Two fixtures ship with disagreements the owner accepted on 2026-08-12 rather
// than explained (Juggernaut 8227612, Magic DPS 8290225 — see
// docs/mastery-achievement-parity-2026-07-25.md). Accepting them made the
// verifier exit 0, which removes the signal that used to block a release. What
// replaces it is ACCEPTED_MISMATCHES: the disagreements are pinned by signed
// delta, and one that grows fails the run.
//
// That guard is the whole reason accepting is not the same as ignoring, so it
// needs a test that proves it fires — a pin nobody checks is a comment.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const verifierPath = join(repoRoot, "scripts", "verify-questlog-parity.mjs");

function runVerifier() {
  try {
    return { code: 0, output: execFileSync(process.execPath, [verifierPath], { cwd: repoRoot, encoding: "utf8" }) };
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

// Edit the verifier's pins, run it, always restore. A failed assertion must not
// leave the working tree carrying a doctored gate.
function withPatchedVerifier(replace, run) {
  const original = readFileSync(verifierPath, "utf8");
  const patched = replace(original);
  assert.notEqual(patched, original, "the patch must actually change the verifier, or the test proves nothing");
  writeFileSync(verifierPath, patched);
  try { return run(); } finally { writeFileSync(verifierPath, original); }
}

test("the committed verifier passes with the accepted mismatches in place", () => {
  const { code, output } = runVerifier();
  assert.equal(code, 0, output);
  // Accepted, not silent: both fixtures still report their blockers as expected.
  assert.match(output, /Juggernaut[^\n]*expected blocking/);
  assert.match(output, /Magic DPS[^\n]*expected blocking/);
});

test("an accepted mismatch that grows fails the run", () => {
  const { code, output } = withPatchedVerifier(
    (source) => source.replace('["Critical Damage", 15.6]', '["Critical Damage", 5.6]'),
    runVerifier,
  );
  assert.equal(code, 1, "a delta larger than the accepted one must block");
  assert.match(output, /drifted from the accepted disagreement/);
  assert.match(output, /Critical Damage: accepted delta was 5\.6, now 15\.6/);
});

// The verifier is checked out with CRLF on Windows, so these patches match line
// endings rather than assuming "\n".
test("a new mismatch inside an accepted fixture fails the run", () => {
  const { code, output } = withPatchedVerifier(
    // Drop one pin: its stat is still mismatched, so it now reads as a
    // disagreement nobody accepted.
    (source) => source.replace(/^[ \t]*\["Melee Heavy Attack Chance", -100\],[ \t]*\r?\n/m, ""),
    runVerifier,
  );
  assert.equal(code, 1, "an unaccepted disagreement in an accepted fixture must block");
  assert.match(output, /Melee Heavy Attack Chance: new disagreement/);
});

test("an accepted mismatch that heals is reported, not failed", () => {
  const { code, output } = withPatchedVerifier(
    // A stat that matches everywhere cannot be a live mismatch, so pinning it
    // simulates the fix having landed for that row.
    (source) => source.replace(
      /^([ \t]*)\["Critical Damage Resistance", -6\],([ \t]*\r?\n)/m,
      (_match, indent, eol) => `${indent}["Critical Damage Resistance", -6],${eol}${indent}["Max Health", 1],${eol}`,
    ),
    runVerifier,
  );
  assert.equal(code, 0, "good news must not fail a release gate");
  assert.match(output, /now match/);
  assert.match(output, /raise the ratchet/);
});

test("the acceptance is recorded where a reader will find it", () => {
  const verifier = readFileSync(verifierPath, "utf8");
  assert.match(verifier, /ACCEPTED, not explained/, "the map says what it is");
  assert.match(verifier, /mastery-achievement-parity-2026-07-25\.md/, "and cites the investigation");
  // The standing instruction that made this an acceptance rather than a fix.
  const doc = readFileSync(join(repoRoot, "docs", "mastery-achievement-parity-2026-07-25.md"), "utf8");
  assert.match(doc, /Do not\*\* write a rule/i, "the do-not-invent-a-rule instruction still stands");
  assert.match(doc, /accepted/i, "and the acceptance is recorded alongside the investigation");
});
