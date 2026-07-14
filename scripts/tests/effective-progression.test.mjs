import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as core from "../../web/tl-core.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appData = await loadWebDataFromFile(join(repoRoot, "web", "data", "app-data.json"));
await core.initCore(appData);

const attributes = { str: 0, dex: 0, int: 0, per: 0, con: 0 };

function equip(build, slotId, weaponType) {
  const item = appData.items.find((candidate) => candidate.equipmentType === weaponType);
  assert.ok(item, `missing ${weaponType} fixture weapon`);
  build.equipment[slotId] = {
    ...core.emptyEquipmentSelection(),
    itemId: item.id,
    level: core.itemMaxLevel(item),
  };
}

function sourceValues(calc, sourceLabel) {
  return calc.stats.flatMap((stat) => stat.sources
    .filter((source) => source.sourceLabel === sourceLabel)
    .map((source) => ({ statId: stat.id, value: source.value })));
}

function issueCodes(calc) {
  return calc.validation.issues.map((issue) => issue.code).filter(Boolean);
}

test("passives from both equipped weapon families affect sheet totals", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "dagger");
  equip(build, "off_hand", "crossbow");
  build.skills = [
    { skillId: "SkillSet_WP_DA_S_CriticalDamageUp", level: 20, loadoutType: "passive" },
    { skillId: "SkillSet_WP_CR_S_CriticalAttack", level: 20, loadoutType: "passive" },
  ];

  const calc = core.calculateBuild(build, attributes);
  const progression = core.effectiveProgression(build);

  assert.deepEqual(progression.skills.map((row) => row.skill.id), build.skills.map((row) => row.skillId));
  assert.deepEqual(sourceValues(calc, "Wrathful Edge"), [
    { statId: "critical_damage_dealt_modifier", value: 1950 },
    { statId: "rear_all_accuracy", value: 1200 },
  ]);
  assert.deepEqual(sourceValues(calc, "Piercing Strike"), [
    { statId: "damage_reduction_penetration", value: 39 },
    { statId: "stamina_regen", value: 6500 },
  ]);
});

test("foreign passive and mastery selections stay stored but are excluded", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "dagger");
  equip(build, "off_hand", "crossbow");
  build.skills = [{ skillId: "SkillSet_WP_ST_S_SkillPowerAmplificationBuff", level: 20, loadoutType: "passive" }];
  build.masteries = {
    Staff_High_Attack_02: { level: 10 },
    Sword_Hero_Defense_03: { level: 10 },
    Bow_Rare_Def_Skill: { level: 1 },
  };

  const calc = core.calculateBuild(build, attributes);
  const progression = core.effectiveProgression(build);

  assert.equal(sourceValues(calc, "Forbidden Sanctuary").length, 0);
  assert.equal(sourceValues(calc, "Magic Damage Intensity").length, 0);
  assert.deepEqual(progression.skills, []);
  assert.deepEqual(progression.masteries, []);
  assert.deepEqual(issueCodes(calc).filter((code) => code.startsWith("foreign_weapon_")), [
    "foreign_weapon_skill",
    "foreign_weapon_mastery",
    "foreign_weapon_mastery",
    "foreign_weapon_mastery",
  ]);
  assert.equal(build.skills[0].skillId, "SkillSet_WP_ST_S_SkillPowerAmplificationBuff");
  assert.deepEqual(Object.keys(build.masteries), ["Staff_High_Attack_02", "Sword_Hero_Defense_03", "Bow_Rare_Def_Skill"]);
});

test("weapon swaps deactivate and later reactivate retained progression", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "dagger");
  equip(build, "off_hand", "crossbow");
  build.skills = [{ skillId: "SkillSet_WP_DA_S_CriticalDamageUp", level: 20, loadoutType: "passive" }];

  const expected = [
    { statId: "critical_damage_dealt_modifier", value: 1950 },
    { statId: "rear_all_accuracy", value: 1200 },
  ];
  assert.deepEqual(sourceValues(core.calculateBuild(build, attributes), "Wrathful Edge"), expected);
  equip(build, "main_hand", "bow");
  assert.equal(sourceValues(core.calculateBuild(build, attributes), "Wrathful Edge").length, 0);
  assert.equal(build.skills[0].skillId, "SkillSet_WP_DA_S_CriticalDamageUp");
  equip(build, "main_hand", "dagger");
  assert.deepEqual(sourceValues(core.calculateBuild(build, attributes), "Wrathful Edge"), expected);
});

test("foreign active and defensive skills do not inflate Combat Power", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "bow");
  build.skills = [
    { skillId: "SkillSet_WP_BO_S_PowerShot", level: 20, loadoutType: "active" },
    { skillId: "SkillSet_WP_BO_S_CounterMove", level: 5, loadoutType: "defensive" },
  ];
  const expected = core.combatPowerBreakdown(build);

  build.skills.push(
    { skillId: "SkillSet_WP_ST_S_FireCombo", level: 20, loadoutType: "active" },
    { skillId: "SkillSet_WP_ST_S_CounterMove", level: 5, loadoutType: "defensive" },
  );
  const actual = core.combatPowerBreakdown(build);

  assert.ok(expected.skillPower > 0);
  assert.equal(actual.skillPower, expected.skillPower);
  assert.equal(actual.total, expected.total);
});

test("canonical skill type defeats stored loadoutType spoofing", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "dagger");
  build.skills = [{ skillId: "SkillSet_WP_DA_S_CriticalDamageUp", level: 20, loadoutType: "active" }];

  const calc = core.calculateBuild(build, attributes);
  const progression = core.effectiveProgression(build);

  assert.equal(progression.skills[0].loadoutType, "passive");
  assert.deepEqual(sourceValues(calc, "Wrathful Edge"), [
    { statId: "critical_damage_dealt_modifier", value: 1950 },
    { statId: "rear_all_accuracy", value: 1200 },
  ]);
  assert.ok(issueCodes(calc).includes("skill_type_mismatch"));
});

test("unified mastery is global, deduplicated, and category validated", () => {
  const build = core.createInitialBuild();
  build.unifiedMasteries = [
    "WM_Common_SKILL_007",
    "WM_Common_SKILL_007",
    "Bow_High_Attack_01",
    "missing_unified_node",
  ];

  const calc = core.calculateBuild(build, attributes);
  const progression = core.effectiveProgression(build);

  assert.deepEqual(progression.unifiedMasteries.map((row) => row.masteryId), ["WM_Common_SKILL_007"]);
  for (const statId of ["str", "dex", "int", "per", "con"]) {
    assert.deepEqual(sourceValues(calc, "Potential").filter((row) => row.statId === statId), [{ statId, value: 1 }]);
  }
  assert.ok(issueCodes(calc).includes("duplicate_unified_mastery"));
  assert.ok(issueCodes(calc).includes("wrong_category_unified_mastery"));
  assert.ok(issueCodes(calc).includes("unknown_unified_mastery"));
  assert.equal(build.unifiedMasteries.length, 4);
});

test("decoded Overall Mastery cap of four is validated as data-backed", () => {
  const build = core.createInitialBuild();
  build.unifiedMasteries = appData.masteries
    .filter((mastery) => mastery.specializationType === "unified")
    .slice(0, 5)
    .map((mastery) => mastery.id);

  const calc = core.calculateBuild(build, attributes);
  assert.ok(calc.validation.dataBacked.some((issue) => issue.code === "unified_mastery_cap_exceeded" && issue.severity === "error"));
  assert.equal(calc.validation.assumed.some((issue) => issue.code === "unified_mastery_cap_exceeded"), false);
});

test("an empty build does not activate Bow progression through the UI fallback", () => {
  const build = core.createInitialBuild();
  build.skills = [{ skillId: "SkillSet_WP_BO_S_WindBonusProjectile", level: 20, loadoutType: "passive" }];
  build.masteries = { Bow_High_Attack_01: { level: 10 } };

  assert.deepEqual(core.currentWeaponTypes(build), ["bow"]);
  const calc = core.calculateBuild(build, attributes);
  const progression = core.effectiveProgression(build);

  assert.deepEqual(progression.equippedWeaponTypes, []);
  assert.deepEqual(progression.skills, []);
  assert.deepEqual(progression.masteries, []);
  assert.equal(core.combatPowerBreakdown(build).skillPower, 0);
  assert.equal(core.combatPowerBreakdown(build).masteryPower, 0);
  assert.ok(issueCodes(calc).includes("foreign_weapon_skill"));
  assert.ok(issueCodes(calc).includes("foreign_weapon_mastery"));
});
