import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { importCombatLog } from "../lib/combat-log-importer.mjs";

const BUILD = "24118850";
const CLI = path.resolve("scripts", "import-combat-log.mjs");
const SOURCE = [
  "CombatLogVersion,4",
  "20260711-01:31:31:532,DamageDone,Judgment Lightning,950004896,97794,1,1,kMaxDamageByCriticalDecision,Varkesh,Practice Dummy",
  "20260711-01:31:31:985,DamageDone,Judgment Lightning,968485880,42865,1,0,kMaxDamageByCriticalDecision,Varkesh,Practice Dummy",
  "20260711-01:31:32:000,DamageDone,Manaball,1234,100,0,0,kNormalHit,Varkesh,Practice Dummy",
].join("\n");

test("imports CombatLogVersion 4 with outcome flags and confirmed Judgment Lightning variants", () => {
  const imported = importCombatLog({ source: SOURCE, gameBuild: BUILD, sourcePath: "D:/example.log" });
  assert.equal(imported.schema, "tl-helper.combat-log-import");
  assert.equal(imported.schemaVersion, 1);
  assert.equal(imported.source.formatVersion, 4);
  assert.equal(imported.summary.recordCount, 3);
  assert.equal(imported.summary.totalDamage, "140759");
  assert.deepEqual(imported.summary.outcomeCounts, { normalNonHeavy: 1, normalHeavy: 0, criticalNonHeavy: 1, criticalHeavy: 1 });
  assert.equal(imported.records[0].localizedSkillName, "Judgment Lightning");
  assert.equal(imported.records[0].effectId, "950004896");
  assert.deepEqual(imported.records[0].abilityMapping, {
    abilityId: "judgment-lightning", skillSetId: "WP_ST_S_PowerAttack", castVariant: "first_cast", confidence: "confirmed",
  });
  assert.deepEqual(imported.records[1].abilityMapping, {
    abilityId: "judgment-lightning", skillSetId: "WP_ST_S_PowerAttack_2", castVariant: "conditional_second_cast", confidence: "confirmed",
  });
  assert.equal(imported.records[2].abilityMapping, undefined);
  assert.deepEqual(imported.records[2].outcomes, { normal: true, critical: false, heavy: false });
});

test("rejects unsupported versions and malformed version 4 records", () => {
  assert.throws(() => importCombatLog({ source: "CombatLogVersion,5\n", gameBuild: BUILD }), /unsupported CombatLogVersion 5/);
  assert.throws(() => importCombatLog({ source: "CombatLogVersion,4\nbad,row\n", gameBuild: BUILD }), /has 2 fields, expected 10/);
  assert.throws(() => importCombatLog({ source: SOURCE.replace(",1,1,", ",2,1,"), gameBuild: BUILD }), /HitCritical must be 0 or 1/);
});

test("CLI writes a build-scoped report atomically", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "tl-combat-log-"));
  try {
    const input = path.join(directory, "judgment.log");
    writeFileSync(input, SOURCE, "utf8");
    const result = spawnSync(process.execPath, [CLI, "--input", input, "--build", BUILD, "--data-root", directory], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    const imported = JSON.parse(readFileSync(output.outputFile, "utf8"));
    assert.equal(imported.summary.recordCount, 3);
    assert.equal(imported.records[1].abilityMapping.castVariant, "conditional_second_cast");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
