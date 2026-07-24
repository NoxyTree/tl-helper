// Regression coverage for decoded build-24118850 passive and non-structured
// mastery corrections. Expected values are raw calculator units.

import assert from "node:assert/strict";
import test from "node:test";

import {
  ITEM_PASSIVE_RULES,
  MASTERY_SYNERGY_RULES,
  PASSIVE_SKILL_RULES,
  STAT_UNIT_MODIFIERS,
  statRawValue,
} from "../../web/tl-questlog-rules.js";
import {
  COMBAT_SANCTUARY_ACCURACY_RAW_PER_MEMBER,
  COMBAT_SANCTUARY_ATTACK_RANGE_RAW_PER_MEMBER,
} from "../../web/tl-distorted-sanctuary-data.js";

const totals = (values = {}) => Object.fromEntries(
  Object.entries(values).map(([statId, total]) => [statId, { statId, total }]),
);
const masteryBuild = (...ids) => ({ specialization: ids.map((id) => ({ id, lvl: 1 })) });
const passiveRows = (id, level, masteries = [], values = {}) => (
  PASSIVE_SKILL_RULES[id].effect(level, masteryBuild(...masteries), totals(values))
);
const masteryRows = (id, level, values = {}) => MASTERY_SYNERGY_RULES[id].effect(level, totals(values));
const only = (rows, statId) => {
  const matching = rows.filter((row) => row.statId === statId);
  assert.equal(matching.length, 1, `expected one ${statId}: ${JSON.stringify(rows)}`);
  return matching[0].value;
};
const lacks = (rows, statId) => assert.equal(rows.some((row) => row.statId === statId), false);

test("decoded directional, off-hand, and Base Damage unit mappings are exact", () => {
  assert.equal(STAT_UNIT_MODIFIERS.rear_all_accuracy, 0.1);
  assert.equal(STAT_UNIT_MODIFIERS.side_all_critical_attack, 0.1);
  assert.equal(STAT_UNIT_MODIFIERS.rear_all_critical_attack, 0.1);
  assert.equal(STAT_UNIT_MODIFIERS.attack_power_off_hand, 1);
  assert.equal(STAT_UNIT_MODIFIERS.attack_power_modifier, 0.01);
  for (const family of ["accuracy", "critical_attack", "critical_defense", "double_attack", "double_defense", "evasion"]) {
    for (const type of ["melee", "range", "magic"]) assert.equal(STAT_UNIT_MODIFIERS[`pvp_${type}_${family}`], 0.1, `${type} ${family}`);
  }
  for (const id of ["pvp_all_evasion", "boss_all_evasion", "boss_melee_evasion", "boss_range_evasion", "boss_magic_evasion", "front_all_evasion", "rear_all_evasion", "side_all_evasion"]) {
    assert.equal(STAT_UNIT_MODIFIERS[id], 0.1, id);
  }
  assert.equal(statRawValue("rear_all_accuracy", 120), 1200);
  assert.equal(statRawValue("attack_power_modifier", -16), -1600);
});

test("conditional Aridus and unrepresentable GT mastery remain unsupported", () => {
  assert.equal(ITEM_PASSIVE_RULES.SkillSet_WP_Item_FieldBoss_T3_ST_02, undefined);
  assert.equal(MASTERY_SYNERGY_RULES.GT_Hero_Attack_01, undefined);
});

test("the three incomplete weapon passives include their decoded persistent components", () => {
  const wrath = passiveRows("SkillSet_WP_DA_S_CriticalDamageUp", 20);
  assert.equal(only(wrath, "critical_damage_dealt_modifier"), 1950);
  assert.equal(only(wrath, "rear_all_accuracy"), 1200);

  const forbiddenFirst = passiveRows("SkillSet_WP_ST_S_SkillPowerAmplificationBuff", 1);
  assert.equal(only(forbiddenFirst, "side_all_critical_attack"), 480);
  assert.equal(only(forbiddenFirst, "rear_all_critical_attack"), 480);
  const forbiddenLast = passiveRows("SkillSet_WP_ST_S_SkillPowerAmplificationBuff", 20);
  assert.equal(only(forbiddenLast, "skill_power_amplification"), 1620);
  assert.equal(only(forbiddenLast, "cost_consumption_modifier"), -1500);
  assert.equal(only(forbiddenLast, "side_all_critical_attack"), 1000);
  assert.equal(only(forbiddenLast, "rear_all_critical_attack"), 1000);

  const aegis = passiveRows("SkillSet_WP_SW_SH_S_ArmorUp", 20, [], { shield_block_chance: 0 });
  assert.equal(only(aegis, "shield_block_efficiency"), 250);
});

test("Earth's Blessing and Distorted Sanctuary use decoded level boundaries", () => {
  const earthFirst = passiveRows("SkillSet_WP_BO_S_NatureForce", 1);
  assert.equal(only(earthFirst, "hp_regen"), 12000);
  assert.equal(only(earthFirst, "continuous_heal_modifier"), 1500);
  const earthLast = passiveRows("SkillSet_WP_BO_S_NatureForce", 20);
  assert.equal(only(earthLast, "hp_regen"), 144000);
  assert.equal(only(earthLast, "continuous_heal_modifier"), 3900);

  const sanctuaryFirst = passiveRows("SkillSet_WP_BO_S_AuraDefenceUp", 1);
  assert.equal(only(sanctuaryFirst, "all_critical_defense"), 180);
  assert.equal(only(sanctuaryFirst, "continuous_heal_modifier"), 180);
  const sanctuaryLast = passiveRows("SkillSet_WP_BO_S_AuraDefenceUp", 20);
  assert.equal(only(sanctuaryLast, "all_critical_defense"), 660);
  assert.equal(only(sanctuaryLast, "continuous_heal_modifier"), 660);
});

test("the four other missing persistent weapon passives use exact decoded values", () => {
  assert.equal(only(passiveRows("SkillSet_WP_CR_S_OffHandMaxDmg", 1), "attack_power_off_hand"), 12);
  assert.equal(only(passiveRows("SkillSet_WP_CR_S_OffHandMaxDmg", 20), "attack_power_off_hand"), 45);

  const physique = passiveRows("SkillSet_WP_GT_Passive_WeightClassUp", 20);
  assert.equal(only(physique, "hp_max"), 2450);
  assert.equal(only(physique, "stamina_max"), 19);

  const provocation = passiveRows("SkillSet_WP_GT_Passive_TauntMaster", 20);
  assert.equal(only(provocation, "melee_armor"), 328);
  assert.equal(only(provocation, "range_armor"), 328);

  assert.equal(only(passiveRows("SkillSet_WP_SW_SH_S_AroundCountBuff", 20), "all_armor"), 179);
});

test("mastery transformations replace or augment the passive exactly once", () => {
  for (let level = 1; level <= 20; level += 1) {
    const sanctuary = passiveRows("SkillSet_WP_BO_S_AuraDefenceUp", level, ["Bow_Normal_Tac_Skill"]);
    assert.equal(only(sanctuary, "all_accuracy"), COMBAT_SANCTUARY_ACCURACY_RAW_PER_MEMBER[level - 1]);
    assert.equal(only(sanctuary, "attack_range_modifier"), COMBAT_SANCTUARY_ATTACK_RANGE_RAW_PER_MEMBER[level - 1]);
    lacks(sanctuary, "all_critical_defense");
    lacks(sanctuary, "continuous_heal_modifier");
  }

  const ambidexterity = passiveRows("SkillSet_WP_CR_S_OffHandMaxDmg", 20, ["Crossbow_High_Attack_Skill"]);
  assert.equal(only(ambidexterity, "attack_power_off_hand"), 30);
  assert.equal(only(ambidexterity, "off_hand_attack_chance_modifier"), -400);

  const instinct = passiveRows("SkillSet_WP_DA_S_MeleeAccuracy", 20, ["Dagger_Normal_Util_Skill"]);
  assert.equal(only(instinct, "all_critical_attack"), 3300);
  assert.equal(only(instinct, "all_accuracy"), -1500);

  const provocation = passiveRows("SkillSet_WP_GT_Passive_TauntMaster", 20, ["Gauntlet_High_Attack_Skill"]);
  assert.equal(only(provocation, "attack_power_modifier"), 325);

  const physique = passiveRows("SkillSet_WP_GT_Passive_WeightClassUp", 20, ["Gauntlet_Normal_Def_Skill"]);
  assert.equal(only(physique, "stamina_max"), 19);
  assert.equal(only(physique, "stamina_regen"), 9000);
  lacks(physique, "hp_max");

  const manaAmp = passiveRows("SkillSet_WP_ST_S_MaxManaUp", 20, ["Staff_Normal_Def_Skill"]);
  assert.equal(only(manaAmp, "cost_max"), 2597);
  assert.equal(only(manaAmp, "hp_max"), 2160);
});

test("interaction mastery IDs are registered without unconditional duplicate output", () => {
  for (const id of [
    "Bow_Normal_Tac_Skill",
    "Crossbow_High_Attack_Skill",
    "Dagger_Normal_Util_Skill",
    "Gauntlet_High_Attack_Skill",
    "Gauntlet_Normal_Def_Skill",
    "Staff_Normal_Def_Skill",
  ]) {
    assert.ok(MASTERY_SYNERGY_RULES[id], `${id} should be classified`);
    assert.deepEqual(masteryRows(id, 1), []);
  }
});

test("Dexterous Power uses independent Dexterity and Strength threshold branches", () => {
  const dexOnly = masteryRows("Dagger_Hero_Tactic_04", 1, { dex: 80, str: 79 });
  assert.equal(only(dexOnly, "critical_damage_dealt_modifier"), 440);
  lacks(dexOnly, "all_evasion");

  const strengthOnly = masteryRows("Dagger_Hero_Tactic_04", 1, { dex: 79, str: 80 });
  assert.equal(only(strengthOnly, "all_evasion"), 660);
  lacks(strengthOnly, "critical_damage_dealt_modifier");

  const both = masteryRows("Dagger_Hero_Tactic_04", 10, { dex: 80, str: 80 });
  assert.equal(only(both, "critical_damage_dealt_modifier"), 800);
  assert.equal(only(both, "all_evasion"), 1200);
});

test("Mana Shield and Keen Reflexes clamp their decoded source inputs", () => {
  const cappedMana = masteryRows("Staff_Hero_Defense_03", 10, { cost_regen: 3500000 });
  const overMana = masteryRows("Staff_Hero_Defense_03", 10, { cost_regen: 5000000 });
  assert.equal(only(cappedMana, "all_armor"), 850);
  assert.equal(only(overMana, "all_armor"), 850);

  const per99 = masteryRows("Bow_Rare_Def_Skill", 1, { per: 99 });
  const per100 = masteryRows("Bow_Rare_Def_Skill", 1, { per: 100 });
  assert.equal(only(per99, "melee_evasion"), 2160);
  assert.equal(only(per99, "melee_critical_defense"), 2160);
  assert.deepEqual(per100, per99);
});

test("Life's Bargain scales Endurance to 40,000 Health and applies percentage Base Damage", () => {
  const atCap = masteryRows("Sword_Hero_Defense_03", 10, { hp_max: 40000 });
  const overCap = masteryRows("Sword_Hero_Defense_03", 10, { hp_max: 50000 });
  assert.equal(only(atCap, "melee_critical_defense"), 8000);
  assert.equal(only(atCap, "range_critical_defense"), 8000);
  assert.equal(only(atCap, "attack_power_modifier"), -1600);
  lacks(atCap, "bonus_attack_power_main_hand");
  assert.deepEqual(overCap, atCap);
});

test("new standalone mastery rules apply only their persistent sheet components", () => {
  assert.equal(only(masteryRows("Crossbow_Hero_Tactic_04", 1), "move_speed_modifier"), 440);
  assert.equal(only(masteryRows("Crossbow_Hero_Tactic_04", 10), "move_speed_modifier"), 800);

  const gauntlet = masteryRows("GT_Hero_Tactic_04", 10, { dex: 139, con: 139 });
  assert.equal(only(gauntlet, "critical_damage_dealt_modifier"), 1560);
  assert.equal(only(gauntlet, "critical_damage_taken_modifier"), 1560);

  assert.equal(MASTERY_SYNERGY_RULES.Spear_High_Attack_Skill, undefined);
  assert.equal(only(masteryRows("Sword2h_Normal_Def_Skill", 1), "melee_double_attack"), -1000);
});
