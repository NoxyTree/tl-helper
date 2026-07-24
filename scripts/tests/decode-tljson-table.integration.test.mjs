import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const dataRoot = process.env.TL_DATA_ROOT ?? "D:\\TL_Data";
const extractRoot = process.env.TL_EXTRACT_ROOT ?? path.join(dataRoot, "raw", "24118850", "extracted");
const tableRoot = path.join(extractRoot, "data", "TL", "Content", "Game", "Client", "Table");
const decoder = path.resolve("scripts", "decode-tljson-table.mjs");

test("validated RowStruct locator decodes EffectProperty and Staff abnormal states", { skip: !existsSync(path.join(tableRoot, "TLEffectProperty.uasset")) }, () => {
  const output = mkdtempSync(path.join(tmpdir(), "tl-decoder-effect-"));
  try {
    const files = ["TLEffectProperty", "TLAbnormalState_Weapon_Staff"].map((table) => path.join(tableRoot, `${table}.uasset`));
    const result = spawnSync(process.execPath, [decoder, ...files, "--out", output], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    for (const [table, expectedRows] of [["TLEffectProperty", 54205], ["TLAbnormalState_Weapon_Staff", 174]]) {
      const decoded = JSON.parse(readFileSync(path.join(output, `${table}.json`), "utf8"));
      assert.equal(decoded.decodedRowCount, expectedRows);
      assert.deepEqual(decoded.unsupportedTypes, []);
      assert.deepEqual(decoded.warnings, []);
      assert.equal(decoded.trailingBytes, 0);
    }
    const staff = JSON.parse(readFileSync(path.join(output, "TLAbnormalState_Weapon_Staff.json"), "utf8"));
    assert.ok(staff.rows.abn_WP_ST_S_Powerattack_Buff);
    assert.ok(staff.rows.abn_WP_ST_S_PowerAttack_trait1_debuff);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("summary-bounded name map decodes names preceding the first /Game path", { skip: !existsSync(path.join(tableRoot, "TLStarJourney.uasset")) }, () => {
  const output = mkdtempSync(path.join(tmpdir(), "tl-decoder-star-journey-"));
  try {
    const result = spawnSync(process.execPath, [decoder, path.join(tableRoot, "TLStarJourney.uasset"), "--out", output], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const decoded = JSON.parse(readFileSync(path.join(output, "TLStarJourney.json"), "utf8"));
    assert.equal(decoded.decodedRowCount, 184);
    assert.deepEqual(decoded.unsupportedTypes, []);
    assert.deepEqual(decoded.warnings, []);
    assert.equal(decoded.trailingBytes, 0);
    assert.deepEqual(decoded.rows["#Adventure_Start"].RewardStats, []);
    assert.deepEqual(decoded.rows.StarJourney_Adv_001.RewardStats, [{ RewardStatID: "hp_max_50", Seed: 1 }]);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
