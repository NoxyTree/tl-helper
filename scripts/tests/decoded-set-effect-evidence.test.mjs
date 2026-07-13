import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { SET_EXCLUSIVITY_GROUPS, SET_PASSIVE_RULES } from "../../web/tl-questlog-rules.js";

const evidence = JSON.parse(await readFile(
  new URL("./fixtures/decoded-set-effect-evidence.json", import.meta.url),
  "utf8",
));
const equipment = JSON.parse(await readFile(
  new URL("../../web/data/projections/equipment.json", import.meta.url),
  "utf8",
)).data;

const emptyTotals = new Proxy({}, { get: () => ({ total: 0 }) });

test("decoded breakpoint fixture matches executable passive joins and raw values", () => {
  for (const [key, expected] of Object.entries(evidence.breakpoints)) {
    const split = key.lastIndexOf(":");
    const setId = key.slice(0, split);
    const pieces = Number(key.slice(split + 1));
    const rows = SET_PASSIVE_RULES[setId]?.[pieces]?.effect(emptyTotals) ?? [];
    const actual = Object.fromEntries(rows.map((row) => [row.statId, row.value]));
    assert.deepEqual(actual, expected.stats, key);
  }
});

test("decoded exclusivity priorities are preserved without inventing winner direction", () => {
  const actual = {};
  for (const group of Object.values(SET_EXCLUSIVITY_GROUPS)) {
    for (const [setId, row] of Object.entries(group)) actual[`${setId}:${row.pieces}`] = row.decodedPriority;
  }
  assert.deepEqual(actual, evidence.exclusivityPriorities);
  assert.equal(evidence.exclusivityWinnerDirection, "unresolved");
});

test("generated set descriptions correct known Questlog join and localization errors", () => {
  const prayer = equipment.itemSets.find((set) => set.id === "set_aa_t4_fabric_001");
  const textAt = (set, pieces) => set.itemSetBonus.find((bonus) => bonus.set_count === pieces).bonus_passive[0].text;
  assert.match(textAt(prayer, 2), /Skill Healing \+20%.*Skill Healing over Time \+20%/s);
  assert.match(textAt(prayer, 4), /Max Health \+2200.*recovery skill/s);
  for (const setId of ["set_a_Magic_Nudge_001", "set_a_Melee_Nudge_001", "set_a_Range_Nudge_001"]) {
    const set = equipment.itemSets.find((row) => row.id === setId);
    assert.match(textAt(set, 3), /Critical Hit Chance \+140/);
    assert.doesNotMatch(textAt(set, 3), /Critical Damage \+140/);
  }
});
