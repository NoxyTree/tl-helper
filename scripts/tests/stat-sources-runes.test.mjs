import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRuneStatSources,
  buildRuneSynergyStatSources,
  runeStatSources,
  runeSynergyStatSources,
} from "../lib/stat-sources-runes.mjs";

const resolveTaxonomy = (rawStatId) => ({
  canonicalStatId: rawStatId.includes("double_attack") ? "heavy_attack_chance" : rawStatId,
  displayName: rawStatId.includes("double_attack") ? "Heavy Attack Chance" : rawStatId,
  unit: "points",
  scale: 0.1,
  attackScope: rawStatId.startsWith("melee_") ? "melee" : "all",
  labelSource: "test",
  labelStatus: "verified",
});

const options = { gameBuild: "123", sourcePath: "web/data/projections/runes.json", resolveTaxonomy };

test("rune possible rolls retain playable levels and omit the level-zero base slot", () => {
  const rows = runeStatSources({
    id: "rune_1", name: "Attack Rune: Weapon", grade: 41,
    equipmentCategory: "weapon", runeType: "attack",
    itemStats: {
      random_stat_group_1: [{
        stat_id: "melee_double_attack", levels: [5, 5, 10], max_level: 2,
        base_value: 5, probability: 6.3,
      }],
    },
  }, options);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.level), [1, 2]);
  assert.deepEqual(rows.map((row) => row.value), [0.5, 1]);
  assert.equal(rows[0].rank, null);
  assert.equal(rows[0].canonicalStatId, "heavy_attack_chance");
  assert.equal(rows[0].statFamilyId, "heavy_attack_chance");
  assert.equal(rows[0].sourceComponent, "random_stat_group_1");
  assert.deepEqual(JSON.parse(rows[0].conditionsJson), {
    possibleRoll: true, randomized: true, rollProbability: 6.3, requiresRuneLevel: 1,
  });
});

test("rune synergies are direct conditional grants, not possible rolls", () => {
  const rows = runeSynergyStatSources({
    id: "synergy_1", name: "Assist Attack Defense", grade: 41,
    equipmentCategory: "cloak", combination: ["assist", "attack", "defense"],
    stats: { all_double_attack: 500, hp_max: 0 },
  }, options);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceType, "rune_synergy");
  assert.equal(rows[0].sourceComponent, "synergy");
  assert.equal(rows[0].level, null);
  assert.equal(rows[0].rank, null);
  assert.deepEqual(JSON.parse(rows[0].conditionsJson), {
    directSynergy: true,
    requiresRuneCount: 3,
    requiresCombination: ["assist", "attack", "defense"],
  });
  assert.equal(JSON.parse(rows[0].conditionsJson).possibleRoll, undefined);
});

test("rune source rows match the 22-column stat_sources contract in order", () => {
  const [row] = runeStatSources({
    id: "rune_1", name: "Rune", itemStats: {
      random_stat_group_1: [{ stat_id: "hp_max", levels: [100, 100], max_level: 1, probability: 10 }],
    },
  }, options);
  assert.deepEqual(Object.keys(row), [
    "statSourceId", "canonicalStatId", "statFamilyId", "rawStatId", "displayName",
    "sourceType", "sourceId", "sourceName", "sourceComponent", "valueRaw", "value",
    "unit", "level", "rank", "attackScope", "contextJson", "conditionsJson", "sourceTable",
    "sourcePath", "gameBuild", "confidence", "evidenceJson",
  ]);
});

test("rune IDs are deterministic and build scoped", () => {
  const rune = {
    id: "rune_1", name: "Rune", itemStats: {
      random_stat_group_1: [{ stat_id: "hp_max", levels: [100, 100], max_level: 1 }],
    },
  };
  const first = runeStatSources(rune, options)[0];
  const again = runeStatSources(rune, options)[0];
  const nextBuild = runeStatSources(rune, { ...options, gameBuild: "124" })[0];
  assert.equal(first.statSourceId, again.statSourceId);
  assert.notEqual(first.statSourceId, nextBuild.statSourceId);
});

test("collection helpers flatten all rune and synergy sources", () => {
  const rune = (id) => ({
    id, name: id, itemStats: {
      random_stat_group_1: [{ stat_id: "hp_max", levels: [1, 1], max_level: 1 }],
    },
  });
  const synergy = (id) => ({ id, name: id, combination: ["attack"], stats: { hp_max: 10 } });
  assert.equal(buildRuneStatSources([rune("a"), rune("b")], options).length, 2);
  assert.equal(buildRuneSynergyStatSources([synergy("a"), synergy("b")], options).length, 2);
});
