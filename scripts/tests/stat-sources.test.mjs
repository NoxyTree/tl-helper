import test from "node:test";
import assert from "node:assert/strict";
import { equipmentStatSources, masteryStatSources } from "../lib/stat-sources.mjs";

const resolveStatTaxonomy = (raw) => raw === "all_double_attack"
  ? { canonicalStatId: "heavy_attack_chance", displayName: "Heavy Attack Chance", unit: "points", scale: 0.1, attackScope: "all", labelSource: "test", labelStatus: "verified" }
  : { canonicalStatId: raw, displayName: raw, unit: "raw", scale: 1 };

const options = { gameBuild: "123", sourcePath: "equipment.json", resolveTaxonomy: resolveStatTaxonomy };

test("equipment curves retain level, raw value, canonical value, and evidence", () => {
  const rows = equipmentStatSources({
    id: "gloves_1", name: "Test Gloves", equipmentType: "hands",
    itemStats: { extra: { 21: { all_double_attack: 200 }, 22: { all_double_attack: 220 } } },
  }, options);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.value), [20, 22]);
  assert.deepEqual(rows.map((row) => row.level), [21, 22]);
  assert.equal(rows[0].canonicalStatId, "heavy_attack_chance");
  assert.equal(rows[0].statFamilyId, "heavy_attack_chance");
  assert.match(JSON.parse(rows[0].evidenceJson).projectionPath, /itemStats\.extra\.21/);
});

test("optional traits and randomized resonance are not conflated with inherent curves", () => {
  const rows = equipmentStatSources({
    id: "ring_1", name: "Test Ring", equipmentType: "ring",
    itemStats: {
      traits: { all_double_attack: [100, 200] },
      resonance: { all_double_attack: { tiers: [50], probability: 5.5 } },
    },
  }, options);
  assert.deepEqual(rows.map((row) => row.sourceComponent), ["trait", "trait", "resonance"]);
  assert.deepEqual(rows.map((row) => row.rank), [1, 2, 1]);
  assert.equal(JSON.parse(rows[0].conditionsJson).optional, true);
  assert.equal(JSON.parse(rows[2].conditionsJson).rollProbability, 5.5);
});

test("zero values and metadata are omitted", () => {
  const rows = equipmentStatSources({
    id: "sword_1", name: "Test Sword", equipmentType: "sword",
    itemStats: { main: { 1: { statId: "ignored", attack_power_main_hand: 0, attack_speed_main_hand: 550 } } },
  }, options);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rawStatId, "attack_speed_main_hand");
});

test("stat source IDs are deterministic and build scoped", () => {
  const item = { id: "x", name: "X", itemStats: { extra: { 1: { hp_max: 100 } } } };
  const first = equipmentStatSources(item, options)[0];
  const again = equipmentStatSources(item, options)[0];
  const otherBuild = equipmentStatSources(item, { ...options, gameBuild: "124" })[0];
  assert.equal(first.statSourceId, again.statSourceId);
  assert.notEqual(first.statSourceId, otherBuild.statSourceId);
});

test("mastery ranks retain weapon conditions and localized source names", () => {
  const rows = masteryStatSources({
    id: "Sword_Double_Attack", name: "Heavy Attack Training", mainCategory: "sword",
    subCategory: "attack", weaponActivatedOnly: true,
    stats: [[{ statId: "all_double_attack", value: 100 }], [{ statId: "all_double_attack", value: 200 }]],
  }, options);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].rank, 2);
  assert.equal(rows[1].sourceName, "Heavy Attack Training");
  assert.equal(JSON.parse(rows[1].contextJson).weapon, "sword");
  assert.equal(JSON.parse(rows[1].contextJson).weaponActivatedOnly, true);
});
