import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inferBuildAttackType, isLegalBuildSnapshot, resolveVisibleMatchupInputs, selectAbilityWeaponHand } from "../../web/combat-lab-build-inputs.js";

const combatLabSource = await readFile(new URL("../../web/combat-lab.js", import.meta.url), "utf8");

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

test("ability Base Damage uses only the hand with the required weapon family", () => {
  const items = { bow1: "bow", staff1: "staff" };
  const build = { equipment: { main_hand: { itemId: "bow1" }, off_hand: { itemId: "staff1" } } };
  const resolveItemType = (id) => items[id] ?? "";
  assert.deepEqual(selectAbilityWeaponHand(build, "staff", resolveItemType), { hand: "off", slotId: "off_hand", weaponType: "staff" });
  assert.deepEqual(selectAbilityWeaponHand(build, "bow", resolveItemType), { hand: "main", slotId: "main_hand", weaponType: "bow" });
  assert.equal(selectAbilityWeaponHand(build, "wand", resolveItemType), null);
  assert.match(combatLabSource, /if \(ui\["damage-source"\]\.value !== "manual"\) syncDamageSourceToAbility\(\)/);
  assert.match(combatLabSource, /if \(!match \|\| match\.hand !== hand\) \{/);
});

test("Combat Lab prefills only legal current snapshots", () => {
  assert.equal(isLegalBuildSnapshot({ resolved: { status: { state: "legal" } } }), true);
  assert.equal(isLegalBuildSnapshot({ resolved: { status: { state: "provisional" } } }), false);
  assert.equal(isLegalBuildSnapshot({ resolved: { status: { state: "invalid" } } }), false);
  assert.equal(isLegalBuildSnapshot({ resolved: {} }), false);
});

test("Combat Lab visibly reports the Item Potential calculation context", () => {
  assert.match(combatLabSource, /resolveCombatLabBuildContext\(snapshot\)/);
  assert.match(combatLabSource, /Calculation context <strong>itemPotentials:'\$\{escapeHtml\(calculationContext\.itemPotentials\)\}'<\/strong>/);
  assert.match(combatLabSource, /ui\["source-summary"\]\.classList\.remove\("hidden"\)/);
  assert.match(combatLabSource, /ui\["target-summary"\]\.classList\.remove\("hidden"\)/);
});
