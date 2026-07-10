// node --test scripts/tests/
import test from "node:test";
import assert from "node:assert/strict";
import { AssetCaseIndex, normalizeAssetKey } from "../lib/asset-case-index.mjs";

// Representative real-world discrepancy: the extraction stores
// "Image/DE/Title/TItle_BossStone.png" (sic) while references use "Title_".
const EXTRACTED = [
  "Image/DE/Title/TItle_BossStone.png",
  "Image/Icon/Item_128/Equip/Weapon/IT_P_Bow_00002.png",
  "Image/Skill/Active/S_WP_CR_CriticalAttack.png",
];

test("normalizeAssetKey lowercases and normalizes separators", () => {
  assert.equal(normalizeAssetKey("Image\\DE\\Title\\TItle_BossStone.png"), "image/de/title/title_bossstone.png");
});

test("exact match preserves original path", () => {
  const idx = new AssetCaseIndex(EXTRACTED);
  const r = idx.lookup("Image/Icon/Item_128/Equip/Weapon/IT_P_Bow_00002.png");
  assert.equal(r.status, "exact");
  assert.equal(r.match, "Image/Icon/Item_128/Equip/Weapon/IT_P_Bow_00002.png");
});

test("case-insensitive match is flagged, original casing returned", () => {
  const idx = new AssetCaseIndex(EXTRACTED);
  const r = idx.lookup("Image/DE/Title/Title_BossStone.png");
  assert.equal(r.status, "case_insensitive");
  assert.equal(r.match, "Image/DE/Title/TItle_BossStone.png");
});

test("backslash queries resolve", () => {
  const idx = new AssetCaseIndex(EXTRACTED);
  const r = idx.lookup("Image\\Skill\\Active\\S_WP_CR_CriticalAttack.png");
  assert.equal(r.status, "exact");
});

test("missing is reported", () => {
  const idx = new AssetCaseIndex(EXTRACTED);
  assert.equal(idx.lookup("Image/Nope.png").status, "missing");
});

test("collision detection: two originals, same normalized key", () => {
  const idx = new AssetCaseIndex([...EXTRACTED, "Image/DE/Title/TITLE_BossStone.png"]);
  const collisions = idx.collisions();
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].key, "image/de/title/title_bossstone.png");
  assert.equal(collisions[0].paths.length, 2);
  const r = idx.lookup("Image/DE/Title/Title_BossStone.png");
  assert.equal(r.status, "ambiguous");
  assert.equal(r.candidates.length, 2);
});

test("duplicate identical adds do not create collisions", () => {
  const idx = new AssetCaseIndex([EXTRACTED[0], EXTRACTED[0]]);
  assert.equal(idx.collisions().length, 0);
});
