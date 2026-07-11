import assert from "node:assert/strict";
import test from "node:test";
import { inferBuildAttackType, resolveVisibleMatchupInputs } from "../../web/combat-lab-build-inputs.js";

test("attack type follows the attacking build's main weapon", () => {
  const items = { bow1: "bow", wand1: "wand", spear1: "spear" };
  const resolveItemType = (id) => items[id] ?? "";
  assert.deepEqual(inferBuildAttackType({ equipment: { main_hand: { itemId: "bow1" }, off_hand: { itemId: "wand1" } } }, resolveItemType), { attackType: "range", weaponType: "bow", slotId: "main_hand" });
  assert.deepEqual(inferBuildAttackType({ equipment: { main_hand: { itemId: "wand1" } } }, resolveItemType), { attackType: "magic", weaponType: "wand", slotId: "main_hand" });
  assert.deepEqual(inferBuildAttackType({ equipment: { main_hand: { itemId: "spear1" } } }, resolveItemType), { attackType: "melee", weaponType: "spear", slotId: "main_hand" });
  assert.deepEqual(inferBuildAttackType({ equipment: { off_hand: { itemId: "wand1" } } }, resolveItemType), { attackType: "magic", weaponType: "wand", slotId: "off_hand" });
});

test("matchup inputs use complete typed PvP totals without adding base stats", () => {
  const source = { stats: { magic_accuracy: 13880, magic_critical_attack: 40430, magic_double_attack: 23840, skill_power_amplification: 8770, pvp_magic_accuracy: 23048, pvp_magic_critical_attack: 67104, pvp_magic_double_attack: 34968 } };
  const target = { stats: { magic_evasion: 680, magic_critical_defense: 27810, magic_double_defense: 25790, skill_power_resistance: 8610, pvp_magic_evasion: 680, pvp_magic_critical_defense: 35010, pvp_magic_double_defense: 29330 } };
  const calls = [];
  const result = resolveVisibleMatchupInputs({ sourceSnapshot: source, targetSnapshot: target, attackType: "magic", readStat: (snapshot, id) => { calls.push(id); return snapshot.stats[id] ?? 0; } });
  assert.deepEqual(result, { hit:2304.8, evasion:68, criticalHit:6710.4, endurance:3501, heavyAttackChance:3496.8, heavyAttackEvasion:2933, skillDamageBoost:877, skillDamageResistance:861 });
  assert.deepEqual(calls.filter((id) => id.includes("accuracy") || id.includes("critical") || id.includes("double")), ["pvp_magic_accuracy","pvp_magic_critical_attack","pvp_magic_critical_defense","pvp_magic_double_attack","pvp_magic_double_defense"]);
});
