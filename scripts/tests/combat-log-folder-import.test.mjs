import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { importCombatLogFolder } from "../import-combat-log-folder.mjs";

const BUILD = "24118850";
const SOURCE = "CombatLogVersion,4\n20260711-01:31:31:532,DamageDone,Judgment Lightning,950004896,97794,1,1,kMaxDamageByCriticalDecision,Varkesh,Practice Dummy\n";

test("imports every text combat log in a folder and writes an overview", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tl-log-folder-"));
  try {
    const input = path.join(root, "input");
    const output = path.join(root, "output");
    mkdirSync(input);
    writeFileSync(path.join(input, "session-a.txt"), SOURCE, "utf8");
    writeFileSync(path.join(input, "ignore.csv"), SOURCE, "utf8");
    const result = importCombatLogFolder({ inputDirectory: input, outputDirectory: output, gameBuild: BUILD });
    assert.deepEqual(result.overview.totals, { files: 1, imported: 1, failed: 0, records: 1, damage: "97794", knownMappings: 1 });
    assert.equal(JSON.parse(readFileSync(result.overviewFile, "utf8")).sessions[0].file, "session-a.txt");
    assert.equal(JSON.parse(readFileSync(path.join(output, "session-a.json"), "utf8")).records[0].abilityMapping.castVariant, "first_cast");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("retains successful sessions and reports malformed logs", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tl-log-folder-"));
  try {
    const input = path.join(root, "input");
    const output = path.join(root, "output");
    mkdirSync(input);
    writeFileSync(path.join(input, "good.txt"), SOURCE, "utf8");
    writeFileSync(path.join(input, "bad.txt"), "bad", "utf8");
    const result = importCombatLogFolder({ inputDirectory: input, outputDirectory: output, gameBuild: BUILD });
    assert.equal(result.overview.totals.imported, 1);
    assert.equal(result.overview.totals.failed, 1);
    assert.match(result.overview.errors[0].error, /CombatLogVersion/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
