import {
  COMBAT_SANCTUARY_ACCURACY_RAW_PER_MEMBER,
  COMBAT_SANCTUARY_ATTACK_RANGE_RAW_PER_MEMBER,
  DISTORTED_SANCTUARY_ENDURANCE_RAW_PER_MEMBER,
  DISTORTED_SANCTUARY_HEAL_OVER_TIME_RAW_PER_MEMBER,
} from "./tl-distorted-sanctuary-data.js";

// Questlog-compatible calculation rules captured from the public character builder.
// These tables are kept separate from tl-core.js so the ordered calculator remains readable.

export const STAT_UNIT_MODIFIERS={skill_cooldown_modifier:.01,attack_speed_modifier:.01,melee_damage_dealt_modifier:.01,all_critical_defense:.1,all_double_defense:.1,melee_critical_defense:.1,range_critical_defense:.1,magic_critical_defense:.1,damage_reduction:1,all_armor:1,melee_armor:1,magic_armor:1,range_armor:1,stamina_max:1,stamina_regen:.001,hp_max:1,hp_regen:.001,cost_max:1,cost_regen:.001,shield_block_chance:.01,critical_damage_taken_modifier:.01,critical_damage_dealt_modifier:.01,all_critical_attack:.1,all_accuracy:.1,weaken_accuracy:.025,skill_power_amplification:.1,stun_accuracy:.025,skill_power_resistance:.1,magic_doll_heal_modifier:.01,potion_heal_modifier:.01,attack_power_main_hand:1,bonus_attack_power_main_hand:1,range_evasion:.1,magic_evasion:.1,melee_double_attack:.1,move_speed_modifier:.01,heal_modifier:.01,buff_given_duration_modifier:.01,damage_reduction_penetration:1,off_hand_attack_chance_modifier:.01,attack_range_modifier:.01,skill_heal_taken_modifier:.01,all_evasion:.1,collide_amplification:.025,collision_resistance:.025,collide_resistance:.025,cost_consumption_modifier:.01,debuff_taken_duration_modifier:.01,melee_evasion:.1,stun_tolerance:.025,blind_accuracy:.025,shield_block_efficiency:.01,shield_block_chance_penetration:.01,dex:1,con:1,per:1,str:1,int:1,all_double_attack:.1,double_damage_taken_modifier:.01,shield_modifier:.01,shield_taken_modifier:.01,continuous_heal_modifier:.01,double_damage_dealt_modifier:.01,pvp_melee_critical_attack:.1,pvp_range_critical_attack:.1,pvp_melee_double_attack:.1,pvp_magic_double_attack:.1,pvp_melee_critical_defense:.1,pvp_range_critical_defense:.1,pvp_magic_evasion:.1,pvp_range_evasion:.1};
// Decoded persistent passive and mastery effects use these additional sheet
// stats. Values are the raw-to-display multipliers from TLStats.
Object.assign(STAT_UNIT_MODIFIERS,{
  attack_power_modifier:.01,
  attack_power_off_hand:1,
  rear_all_accuracy:.1,
  side_all_critical_attack:.1,
  rear_all_critical_attack:.1,
});
// Every typed PvP contest rating uses the same raw-to-sheet 0.1 scale. Keep
// this complete so optimizer inputs, result formatting, and Combat Lab agree.
for(const family of ["accuracy","critical_attack","critical_defense","double_attack","double_defense","evasion"]){
  for(const type of ["melee","range","magic"]) STAT_UNIT_MODIFIERS[`pvp_${type}_${family}`]=.1;
}
// Composite and directional evasion ratings share their typed components'
// 0.1 raw-to-sheet scale. tl-core's formatStat contest-rating regex covers
// the accuracy/critical/double families but not evasion, so every evasion
// id must be listed here explicitly or its value displays raw (10x sheet).
for(const id of ["pvp_all_evasion","boss_all_evasion","boss_melee_evasion","boss_range_evasion","boss_magic_evasion","front_all_evasion","rear_all_evasion","side_all_evasion"]) STAT_UNIT_MODIFIERS[id]=.1;
// Absolute effective-value caps from official global patch notes. Update 2.22.0
// introduced the three speed/duration limits; Update 4.0.0 raised attributes
// to 130 and capped Range increase at 100%. PvP contest difference caps are
// intentionally not listed here because they depend on an opponent and mode.
export const STAT_HARD_CAPS=Object.freeze({
  skill_cooldown_modifier:20000,
  buff_given_duration_modifier:15000,
  attack_speed_modifier:15000,
  attack_range_modifier:10000,
  str:130,dex:130,int:130,per:130,con:130,
});
export const ARMOR_MATERIAL_BONUSES={dagger:{mithril:{effectName:"mithril",stats:{all_critical_attack:800,all_evasion:600}},plate:{effectName:"plate",stats:{hp_max_percentage:1.4,critical_damage_taken_modifier:120}},leather:{effectName:"leather",stats:{all_critical_attack:400,all_evasion:300}},fabric:{effectName:"fabric",stats:{skill_cooldown_modifier:200,critical_damage_dealt_modifier:120}}},sword:{mithril:{effectName:"mithril",stats:{hp_max_percentage:4,all_state_tolerance:2e3}},plate:{effectName:"plate",stats:{hp_max_percentage:2,all_state_tolerance:1e3}},leather:{effectName:"leather",stats:{hp_max_percentage:1.5,all_evasion:250}},fabric:{effectName:"fabric",stats:{cost_max:2,shield_taken_modifier:250}}},sword2h:{mithril:{effectName:"mithril",stats:{hp_max_percentage:3.2,double_damage_taken_modifier:400}},plate:{effectName:"plate",stats:{hp_max_percentage:1.6,double_damage_taken_modifier:200}},leather:{effectName:"leather",stats:{hp_max_percentage:1.2,double_damage_dealt_modifier:200}},fabric:{effectName:"fabric",stats:{all_critical_attack:350,all_evasion:200}}},staff:{mithril:{effectName:"mithril",stats:{cost_regen:6e4,all_double_attack:600}},plate:{effectName:"plate",stats:{all_critical_defense:250,all_double_defense:300}},leather:{effectName:"leather",stats:{attack_speed_modifier:200,all_critical_attack:250}},fabric:{effectName:"fabric",stats:{cost_regen:3e4,all_double_attack:300}}},bow:{mithril:{effectName:"mithril",stats:{attack_range_modifier:300,critical_damage_dealt_modifier:300}},plate:{effectName:"plate",stats:{cost_regen:25e3,continuous_heal_taken_modifier:250}},leather:{effectName:"leather",stats:{attack_range_modifier:150,critical_damage_dealt_modifier:150}},fabric:{effectName:"fabric",stats:{continuous_heal_modifier:300,cost_regen:25e3}}},crossbow:{mithril:{effectName:"mithril",stats:{damage_reduction_penetration:8,cost_regen:5e4}},plate:{effectName:"plate",stats:{hp_max_percentage:1.2,all_state_accuracy:1e3}},leather:{effectName:"leather",stats:{damage_reduction_penetration:4,cost_regen:25e3}},fabric:{effectName:"fabric",stats:{attack_speed_modifier:200,cost_consumption_modifier:200}}},wand:{mithril:{effectName:"mithril",stats:{cost_consumption_modifier:600,continuous_heal_modifier:600}},plate:{effectName:"plate",stats:{hp_max_percentage:1.4,skill_heal_taken_modifier:250}},leather:{effectName:"leather",stats:{skill_cooldown_modifier:200,cost_consumption_modifier:200}},fabric:{effectName:"fabric",stats:{cost_consumption_modifier:300,heal_modifier:300}}},spear:{mithril:{effectName:"mithril",stats:{hp_max_percentage:3.2,all_state_accuracy:2e3}},plate:{effectName:"plate",stats:{hp_max_percentage:1.6,all_state_accuracy:1e3}},leather:{effectName:"leather",stats:{hp_max_percentage:1.2,attack_speed_modifier:200}},fabric:{effectName:"fabric",stats:{cost_regen:2e4,all_double_attack:250}}},orb:{mithril:{effectName:"mithril",stats:{attack_range_modifier:300,shield_modifier:600}},plate:{effectName:"plate",stats:{all_critical_defense:250,shield_taken_modifier:150}},leather:{effectName:"leather",stats:{skill_cooldown_modifier:150,attack_speed_modifier:200}},fabric:{effectName:"fabric",stats:{attack_range_modifier:150,shield_modifier:300}}},gauntlet:{mithril:{effectName:"mithril",stats:{hp_max_percentage:4,critical_damage_dealt_modifier:400}},plate:{effectName:"plate",stats:{hp_max_percentage:2,critical_damage_dealt_modifier:200}},leather:{effectName:"leather",stats:{critical_damage_dealt_modifier:200,all_evasion:300}},fabric:{effectName:"fabric",stats:{skill_cooldown_modifier:200,all_critical_attack:250}}}};
export const STAT_EXPANSIONS={all_accuracy:["melee_accuracy","range_accuracy","magic_accuracy"],all_evasion:["melee_evasion","range_evasion","magic_evasion"],all_armor:["melee_armor","range_armor","magic_armor"],all_double_attack:["melee_double_attack","range_double_attack","magic_double_attack"],all_critical_defense:["melee_critical_defense","range_critical_defense","magic_critical_defense"],all_double_defense:["melee_double_defense","range_double_defense","magic_double_defense"],all_critical_attack:["melee_critical_attack","range_critical_attack","magic_critical_attack"],bonus_attack_power_main_hand:["attack_power_main_hand"],bonus_attack_power_off_hand:["attack_power_off_hand"],all_state_tolerance:["weaken_tolerance","stun_tolerance","petrification_tolerance","sleep_tolerance","silence_tolerance","blind_tolerance","bind_tolerance","collide_resistance"],all_state_accuracy:["weaken_accuracy","stun_accuracy","petrification_accuracy","sleep_accuracy","silence_accuracy","bind_accuracy","blind_accuracy","collide_amplification"],damage_reduction:["boss_damage_reduction"],melee_critical_attack:["boss_melee_critical_attack","pvp_melee_critical_attack"],range_critical_attack:["boss_range_critical_attack","pvp_range_critical_attack"],magic_critical_attack:["boss_magic_critical_attack","pvp_magic_critical_attack"],melee_critical_defense:["boss_melee_critical_defense","pvp_melee_critical_defense"],range_critical_defense:["boss_range_critical_defense","pvp_range_critical_defense"],magic_critical_defense:["boss_magic_critical_defense","pvp_magic_critical_defense"],melee_accuracy:["boss_melee_accuracy","pvp_melee_accuracy"],range_accuracy:["boss_range_accuracy","pvp_range_accuracy"],magic_accuracy:["boss_magic_accuracy","pvp_magic_accuracy"],melee_evasion:["boss_melee_evasion","pvp_melee_evasion"],range_evasion:["boss_range_evasion","pvp_range_evasion"],magic_evasion:["boss_magic_evasion","pvp_magic_evasion"],melee_double_attack:["boss_melee_double_attack","pvp_melee_double_attack"],range_double_attack:["boss_range_double_attack","pvp_range_double_attack"],magic_double_attack:["boss_magic_double_attack","pvp_magic_double_attack"],melee_double_defense:["boss_melee_double_defense","pvp_melee_double_defense"],range_double_defense:["boss_range_double_defense","pvp_range_double_defense"],magic_double_defense:["boss_magic_double_defense","pvp_magic_double_defense"],boss_all_accuracy:["boss_melee_accuracy","boss_range_accuracy","boss_magic_accuracy"],boss_all_critical_attack:["boss_melee_critical_attack","boss_range_critical_attack","boss_magic_critical_attack"],boss_all_double_attack:["boss_melee_double_attack","boss_range_double_attack","boss_magic_double_attack"],boss_all_evasion:["boss_melee_evasion","boss_range_evasion","boss_magic_evasion"],boss_all_critical_defense:["boss_melee_critical_defense","boss_range_critical_defense","boss_magic_critical_defense"],boss_all_double_defense:["boss_melee_double_defense","boss_range_double_defense","boss_magic_double_defense"],pvp_all_accuracy:["pvp_melee_accuracy","pvp_range_accuracy","pvp_magic_accuracy"],pvp_all_critical_attack:["pvp_melee_critical_attack","pvp_range_critical_attack","pvp_magic_critical_attack"],pvp_all_double_attack:["pvp_melee_double_attack","pvp_range_double_attack","pvp_magic_double_attack"],pvp_all_evasion:["pvp_melee_evasion","pvp_range_evasion","pvp_magic_evasion"],pvp_all_critical_defense:["pvp_melee_critical_defense","pvp_range_critical_defense","pvp_magic_critical_defense"],pvp_all_double_defense:["pvp_melee_double_defense","pvp_range_double_defense","pvp_magic_double_defense"]};
// Context-split composites (e.g. Magic Heavy Attack Chance) expand to exactly a
// Boss and a PvP variant. A build is either PvE or PvP, never both, so scoring or
// displaying them as min(boss, pvp) penalises the context you don't play and makes
// the optimizer waste budget raising it. They are still real "applies to both"
// stats with their own totals, so for GOALS and DISPLAY we treat them as leaves
// (score/show their own row) and expose the Boss/PvP variants separately. The
// calculator still distributes their contributions via STAT_EXPANSIONS, and
// type roll-ups (min over melee/range/magic) are unaffected.
export const CONTEXT_SPLIT_COMPOSITE_IDS=new Set(
  Object.entries(STAT_EXPANSIONS)
    .filter(([,components])=>components.length===2
      &&components.some((id)=>id.startsWith("boss_"))
      &&components.some((id)=>id.startsWith("pvp_")))
    .map(([id])=>id),
);
// Component ids used for GOAL scoring and stat-panel breakdown. Returns the stat
// itself (a leaf) for context-split composites; otherwise its STAT_EXPANSIONS.
export function goalCompositeComponents(statId){
  if(CONTEXT_SPLIT_COMPOSITE_IDS.has(statId))return [statId];
  return STAT_EXPANSIONS[statId]??[statId];
}

export const ATTRIBUTE_BREAKPOINTS={str:{30:{hp_max:750},40:{damage_reduction:30},50:{all_double_attack:1e3},60:{hp_max:900},70:{hp_max:450,melee_armor:200,range_armor:200},80:{hp_max:450,all_double_attack:600},100:{hp_max:600,damage_reduction:18},120:{hp_max:600,double_damage_dealt_modifier:500}},dex:{30:{all_critical_attack:1e3},40:{damage_reduction_penetration:30},50:{move_speed_modifier:500},60:{all_critical_attack:1200},70:{all_critical_attack:600,all_evasion:1200},80:{all_critical_attack:600,damage_reduction_penetration:18},100:{all_critical_attack:600,attack_speed_modifier:400},120:{all_critical_attack:600,critical_damage_dealt_modifier:400}},int:{30:{cost_max:750},40:{debuff_taken_duration_modifier:-500},50:{skill_cooldown_modifier:500},60:{cost_max:900},70:{cost_max:450,cost_regen:120/.001},80:{cost_max:450,skill_cooldown_modifier:300},100:{cost_max:600,cost_consumption_modifier:300},120:{cost_max:600,attack_power_main_hand:10}},per:{30:{all_accuracy:1e3},40:{buff_given_duration_modifier:500},50:{attack_range_modifier:750},60:{all_accuracy:1200},70:{all_accuracy:600,all_state_accuracy:100/.025},80:{all_accuracy:600,buff_given_duration_modifier:300},100:{all_accuracy:600,attack_range_modifier:500},120:{all_accuracy:600,all_state_accuracy:100/.025}},con:{30:{all_critical_defense:1e3},40:{magic_armor:200},50:{all_double_defense:1e3},60:{all_critical_defense:1200},70:{all_critical_defense:600,all_state_tolerance:4e3},80:{all_critical_defense:600,all_double_defense:600},100:{all_critical_defense:600,critical_damage_taken_modifier:400},120:{all_critical_defense:600,double_damage_taken_modifier:500}}};

export const BASE_ATTRIBUTES={str:10,dex:10,int:10,per:10,con:10};
export const STELLAR_JOURNEY_ATTRIBUTES={str:1,dex:1,int:1,per:1,con:1};
// Cross-set exclusivity is clause-based. Only effects whose own decoded
// description says they cannot stack with another effect in the named group
// are members. Other evasion sets continue to stack normally. The client text
// proves exclusivity and TLAbnormalState_Item exposes PriorityInGroup. An
// in-game Secret Order (priority 1) versus Death (priority 3) test confirmed
// that the lower PriorityInGroup wins. Shared-priority members have the same
// grouped persistent value, so their lexical tie-break does not change totals.
// Each entry applies only to the breakpoint that carries the clause.
export const SET_EXCLUSIVITY_GROUPS={
  evasion:{
    set_aa_T2_leather_004:{pieces:2,decodedPriority:2,statIds:["all_evasion"]},
    set_aa_t3_lether_003:{pieces:2,decodedPriority:1,statIds:["magic_evasion","melee_evasion","range_evasion"]},
  },
  critical_damage:{
    set_aa_T2_leather_006:{pieces:2,decodedPriority:2,statIds:["critical_damage_dealt_modifier"]},
    set_aa_T2_leather_007:{pieces:2,decodedPriority:2,statIds:["critical_damage_dealt_modifier"]},
    set_aa_leather_002:{pieces:2,decodedPriority:3,statIds:["critical_damage_dealt_modifier"]},
    set_aa_t3_leather_004:{pieces:2,decodedPriority:1,statIds:["critical_damage_dealt_modifier"]},
  },
  damage_over_time:{
    set_aa_T2_fabric_002:{pieces:2,decodedPriority:2,suppressAll:true},
    set_aa_T2_fabric_004:{pieces:2,decodedPriority:1,suppressAll:true},
  },
};

// Decoded build-24118850 corrections and additions. The compact tables later
// in this module remain a captured Questlog baseline. This deferred function
// overrides them after initialization wherever shipped formulas and
// localization prove a different or additional persistent contribution.
const decodedLevelValue=(values,level)=>values[Math.max(0,Math.min(values.length-1,Number(level||1)-1))];
const decodedHasMastery=(build,id)=>Boolean(build?.specialization?.find(row=>row.id===id));

const forbiddenDirectionalCritical=[48,51,54,57,60,63,66,69,72,75,78,81,84,87,90,92,94,96,98,100];
const earthHealthRegen=[12,20,28,36,44,52,60,68,76,84,92,100,108,116,124,128,132,136,140,144];
const earthContinuousHealRaw=[1500,1650,1800,1950,2100,2250,2400,2550,2700,2850,3000,3150,3300,3450,3600,3660,3720,3780,3840,3900];
const ambidexterityMaxDamage=[12,14,16,18,20,22,24,26,28,30,32,34,36,38,40,41,42,43,44,45];
const physiqueHealth=[470,590,710,830,950,1070,1190,1310,1430,1550,1670,1790,1910,2030,2150,2210,2270,2330,2390,2450];
const physiqueStamina=[3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,17,18,18,19,19];
const physiqueStaminaRegenRaw=[2400,2800,3200,3600,4000,4400,4800,5200,5600,6000,6400,6800,7200,7600,8000,8200,8400,8600,8800,9000];
const provocationArmor=[120,132,144,156,168,180,192,204,216,228,240,252,264,276,288,296,304,312,320,328];
const provocationBaseDamageRaw=[160,170,180,190,200,210,220,230,240,250,260,270,280,290,300,305,310,315,320,325];

const applyDecodedRuleCorrections=()=>{
Object.assign(PASSIVE_SKILL_RULES,{
  SkillSet_WP_DA_S_CriticalDamageUp:{phase:1,effect:level=>{
    const criticalDamage=[9.6,10.2,10.8,11.4,12,12.6,13.2,13.8,14.4,15,15.6,16.2,16.8,17.4,18,18.3,18.6,18.9,19.2,19.5];
    return[
      {statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",decodedLevelValue(criticalDamage,level))},
      {statId:"rear_all_accuracy",value:z("rear_all_accuracy",120)},
    ];
  }},
  SkillSet_WP_ST_S_SkillPowerAmplificationBuff:{phase:1,effect:(level,build,totals)=>{
    const skillPower=[80,85,90,95,100,105,110,115,120,125,130,135,140,145,150,152,155,157,160,162];
    const transformed=decodedHasMastery(build,"Staff_Normal_Tac_Skill");
    const currentCost=(totals.cost_consumption_modifier?.total??0)+1e4;
    const directional=decodedLevelValue(forbiddenDirectionalCritical,level);
    return[
      {statId:"skill_power_amplification",value:z("skill_power_amplification",decodedLevelValue(skillPower,level)+(transformed?75:0))},
      {statId:"cost_consumption_modifier",value:-(currentCost*(transformed ? .2 : .15))},
      {statId:"side_all_critical_attack",value:z("side_all_critical_attack",directional)},
      {statId:"rear_all_critical_attack",value:z("rear_all_critical_attack",directional)},
    ];
  }},
  SkillSet_WP_SW_SH_S_ArmorUp:{phase:2,effect:(level,build,totals)=>{
    const block=totals.shield_block_chance?.total??0;
    const armorRate=[4,4.4,4.8,5.2,5.6,6,6.4,6.8,7.2,7.6,8,8.4,8.8,9.2,9.6,9.8,10,10.2,10.4,10.6];
    const armor=Math.floor(block/100*decodedLevelValue(armorRate,level));
    const rows=[
      {statId:"range_armor",value:z("range_armor",armor)},
      {statId:"melee_armor",value:z("melee_armor",armor)},
      {statId:"shield_block_efficiency",value:z("shield_block_efficiency",2.5)},
    ];
    if(decodedHasMastery(build,"Sword_High_Def_Skill")){
      rows.push({statId:"skill_power_resistance",value:z("skill_power_resistance",150)});
      rows.push({statId:"melee_double_attack",value:z("melee_double_attack",-350)});
    }
    return rows;
  }},
  SkillSet_WP_BO_S_NatureForce:{phase:1,effect:level=>[
    {statId:"hp_regen",value:z("hp_regen",decodedLevelValue(earthHealthRegen,level))},
    {statId:"continuous_heal_modifier",value:decodedLevelValue(earthContinuousHealRaw,level)},
  ]},
  SkillSet_WP_BO_S_AuraDefenceUp:{phase:1,effect:(level,build)=>decodedHasMastery(build,"Bow_Normal_Tac_Skill")?[
    {statId:"all_accuracy",value:decodedLevelValue(COMBAT_SANCTUARY_ACCURACY_RAW_PER_MEMBER,level)},
    {statId:"attack_range_modifier",value:decodedLevelValue(COMBAT_SANCTUARY_ATTACK_RANGE_RAW_PER_MEMBER,level)},
  ]:[
    {statId:"all_critical_defense",value:decodedLevelValue(DISTORTED_SANCTUARY_ENDURANCE_RAW_PER_MEMBER,level)},
    {statId:"continuous_heal_modifier",value:decodedLevelValue(DISTORTED_SANCTUARY_HEAL_OVER_TIME_RAW_PER_MEMBER,level)},
  ]},
  SkillSet_WP_CR_S_OffHandMaxDmg:{phase:1,effect:(level,build)=>decodedHasMastery(build,"Crossbow_High_Attack_Skill")?[
    {statId:"attack_power_off_hand",value:z("attack_power_off_hand",30)},
    {statId:"off_hand_attack_chance_modifier",value:z("off_hand_attack_chance_modifier",-4)},
  ]:[{statId:"attack_power_off_hand",value:z("attack_power_off_hand",decodedLevelValue(ambidexterityMaxDamage,level))}]},
  SkillSet_WP_GT_Passive_WeightClassUp:{phase:1,effect:(level,build)=>{
    const rows=[{statId:"stamina_max",value:z("stamina_max",decodedLevelValue(physiqueStamina,level))}];
    if(decodedHasMastery(build,"Gauntlet_Normal_Def_Skill")) rows.push({statId:"stamina_regen",value:decodedLevelValue(physiqueStaminaRegenRaw,level)});
    else rows.push({statId:"hp_max",value:z("hp_max",decodedLevelValue(physiqueHealth,level))});
    return rows;
  }},
  SkillSet_WP_GT_Passive_TauntMaster:{phase:1,effect:(level,build)=>{
    const armor=decodedLevelValue(provocationArmor,level);
    const rows=[
      {statId:"melee_armor",value:z("melee_armor",armor)},
      {statId:"range_armor",value:z("range_armor",armor)},
    ];
    if(decodedHasMastery(build,"Gauntlet_High_Attack_Skill")) rows.push({statId:"attack_power_modifier",value:decodedLevelValue(provocationBaseDamageRaw,level)});
    return rows;
  }},
  SkillSet_WP_SW_SH_S_AroundCountBuff:{phase:1,effect:()=>[{statId:"all_armor",value:z("all_armor",179)}]},
  SkillSet_WP_DA_S_MeleeAccuracy:{phase:1,effect:(level,build)=>{
    const critical=[66,82,98,114,130,146,162,178,194,210,226,242,258,274,290,298,306,314,322,330];
    const rows=[{statId:"all_critical_attack",value:z("all_critical_attack",decodedLevelValue(critical,level))}];
    if(decodedHasMastery(build,"Dagger_Normal_Util_Skill")) rows.push({statId:"all_accuracy",value:z("all_accuracy",-150)});
    return rows;
  }},
  SkillSet_WP_ST_S_MaxManaUp:{phase:1,effect:(level,build)=>{
    const mana=[1400,1540,1680,1820,1960,2100,2240,2380,2520,2660,2800,2940,3080,3220,3360,3430,3500,3570,3640,3710];
    const health=[360,420,480,540,600,660,720,780,840,900,960,1020,1080,1140,1200,1230,1260,1290,1320,1350];
    const transformed=decodedHasMastery(build,"Staff_Normal_Def_Skill");
    return[
      {statId:"cost_max",value:z("cost_max",decodedLevelValue(mana,level)*(transformed ? .7 : 1))},
      {statId:"hp_max",value:z("hp_max",decodedLevelValue(health,level)*(transformed ? 1.6 : 1))},
    ];
  }},
});

const heroPercentRanks=[4.4,4.8,5.2,5.6,6,6.4,6.8,7.2,7.6,8];
const gauntletHeroRanks=[.66,.72,.78,.84,.9,.96,1.02,1.08,1.14,1.2];
Object.assign(MASTERY_SYNERGY_RULES,{
  Dagger_Hero_Tactic_04:{phase:2,effect:(level,totals)=>{
    const rows=[];
    if((totals.dex?.total??0)>=80) rows.push({statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",decodedLevelValue(heroPercentRanks,level))});
    if((totals.str?.total??0)>=80) rows.push({statId:"all_evasion",value:z("all_evasion",decodedLevelValue([66,72,78,84,90,96,102,108,114,120],level))});
    return rows;
  }},
  Staff_Hero_Defense_03:{phase:3,effect:(level,totals)=>{
    const manaRegen=Math.min(3500,(totals.cost_regen?.total??0)*.001);
    return[{statId:"all_armor",value:Math.floor(manaRegen*.2+decodedLevelValue([15,30,45,60,75,90,105,120,135,150],level))}];
  }},
  Sword_Hero_Defense_03:{phase:4,effect:(level,totals)=>{
    const health=Math.min(4e4,totals.hp_max?.total??0);
    const endurance=decodedLevelValue([1.1,1.2,1.3,1.4,1.5,1.6,1.7,1.8,1.9,2],level)*Math.floor(health/100);
    const baseDamagePenalty=decodedLevelValue([-8.8,-9.6,-10.4,-11.2,-12,-12.8,-13.6,-14.4,-15.2,-16],level);
    return[
      {statId:"melee_critical_defense",value:z("melee_critical_defense",endurance)},
      {statId:"range_critical_defense",value:z("range_critical_defense",endurance)},
      {statId:"attack_power_modifier",value:z("attack_power_modifier",baseDamagePenalty)},
    ];
  }},
  Bow_Rare_Def_Skill:{phase:2,effect:(level,totals)=>{
    const perception=Math.min(99,Math.max(0,totals.per?.total??0));
    const amount=Math.floor(perception/10)*24;
    return[
      {statId:"melee_evasion",value:z("melee_evasion",amount)},
      {statId:"melee_critical_defense",value:z("melee_critical_defense",amount)},
    ];
  }},
  Crossbow_Hero_Tactic_04:{phase:1,effect:level=>[{statId:"move_speed_modifier",value:z("move_speed_modifier",decodedLevelValue(heroPercentRanks,level))}]},
  GT_Hero_Tactic_04:{phase:2,effect:(level,totals)=>{
    const rank=decodedLevelValue(gauntletHeroRanks,level);
    const dexterity=Math.min(130,Math.max(0,totals.dex?.total??0));
    const fortitude=Math.min(130,Math.max(0,totals.con?.total??0));
    return[
      {statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",Math.floor(dexterity/10)*rank)},
      {statId:"critical_damage_taken_modifier",value:z("critical_damage_taken_modifier",Math.floor(fortitude/10)*rank)},
    ];
  }},
  Bow_Normal_Tac_Skill:{phase:1,effect:()=>[]},
  Crossbow_High_Attack_Skill:{phase:1,effect:()=>[]},
  Dagger_Normal_Util_Skill:{phase:1,effect:()=>[]},
  Gauntlet_High_Attack_Skill:{phase:1,effect:()=>[]},
  Gauntlet_Normal_Def_Skill:{phase:1,effect:()=>[]},
  Staff_Normal_Def_Skill:{phase:1,effect:()=>[]},
  Spear_High_Attack_Skill:{phase:1,effect:()=>[{statId:"all_armor",value:z("all_armor",-200)}]},
  Sword2h_Normal_Def_Skill:{phase:1,effect:()=>[{statId:"melee_double_attack",value:z("melee_double_attack",-100)}]},
});
};

// Verified against the live Questlog bundle (CSq355zw.js, 2026-07-10): its
// client also defines CHARACTER_LEVEL=60 with base rows only for 50 and 55,
// and resolves the level via the same nearest-match reduce used in
// calculateBuild — so level 60 intentionally uses the 55 row. Do not "fix"
// this by adding a synthetic 60 row; re-extract if Questlog ships one.
export const BASE_LEVEL_STATS={50:{hp_max:5175,cost_max:5175,attack_rating:2520},55:{hp_max:6675,cost_max:5550,attack_rating:2753}};
export const CHARACTER_LEVEL=60;

export function allocatedAttributeValue(value){
  const numeric=Number(value||0);
  let total=0;
  if(numeric<=20)return numeric;
  if(numeric>40)total+=(numeric-40)*0.25;
  if(numeric>20)total+=numeric>40?20*0.5:(numeric-20)*0.5;
  return total+20;
}

export function statRawValue(statId,displayValue){
  const modifier=STAT_UNIT_MODIFIERS[statId];
  if(modifier===undefined)throw new Error(`No modifier found for stat: ${statId}`);
  return displayValue/modifier;
}

const z=statRawValue;
const mindEyeRule={phase:1,effect:()=>[{statId:"attack_range_modifier",value:z("attack_range_modifier",9)}]};
const eyeOfStormRule={phase:1,effect:()=>[{statId:"move_speed_modifier",value:z("move_speed_modifier",8)}]};
const windGuidanceRule={phase:1,effect:()=>[
  {statId:"move_speed_modifier",value:z("move_speed_modifier",8)},
  {statId:"melee_evasion",value:z("melee_evasion",160)},
  {statId:"range_evasion",value:z("range_evasion",160)},
  {statId:"magic_evasion",value:z("magic_evasion",160)},
]};
// Orthodox is +40 Main Weapon Damage. The English localization accidentally
// binds its description to the Southpaw (_GT_02) formula and displays 90;
// WP_Item_Field_NIX_GT_01 is an unconditional Adjust_Stat effect whose decoded
// formula row has min=max=tooltip1=40.
const orthodoxRule={phase:1,effect:()=>[{statId:"attack_power_main_hand",value:z("attack_power_main_hand",40)}]};
const southpawRule={phase:1,effect:()=>[{statId:"attack_power_off_hand",value:z("attack_power_off_hand",90)}]};
export const ITEM_PASSIVE_RULES={
  SkillSet_WP_Item_A08_kAA_BO:mindEyeRule,
  SkillSet_WP_Item_A07_kA_CR:eyeOfStormRule,
  SkillSet_WP_Item_Field_NIX_GT_01:orthodoxRule,
  SkillSet_WP_Item_Nix_Field_CR_01:windGuidanceRule,
  SkillSet_WP_Item_Field_NIX_GT_02:southpawRule,
};
// Party-aura sets (set_aa_T2_plate_003 Skilled Veteran, set_aa_T2_fabric_003
// Oracle Priest, set_aa_T2_leather_004 Forgotten Assassin, set_aa_T2_leather_005
// Admiral) intentionally list each component twice: the client's own set
// description binds the SAME decoded tooltip to a personal line and an
// explicit "self and all party members within 18m" aura line
// (Game.locres `Item_Passive_Set_*_Talland_UIOptions_Index0_Option`,
// extracted 2026-07-13 via scripts/internal/locres-extract.py), so the owner
// receives both applications. Decoded per-application values
// (TLFormulaParameterNew): Skilled Veteran 120 Endurance / 24 DR
// (plate_aa_T2_002_*_Talland), Admiral -3% Debuff Duration / 6% Attack Speed
// (leather_ab_T2_002_*_Talland). Questlog's 12+12 for the Skilled Veteran
// 4-piece halved the decoded 24 and is corrected here; owner-side aura
// stacking itself remains a modeled assumption (owner always inside own aura).
// Decoded-warehouse corrections (2026-07-13, docs/set-effect-database-review-2026-07-13.md):
// these rules intentionally diverge from Questlog parity where decoded
// TLFormulaParameterNew records contradict it —
//   set_aa_T2_plate_005:2  floor(per/10)*45 Endurance (was per*4.5; mul=450000, t1=45)
//   set_aa_T2_leather_003:4  Bonus Damage 70 (was 35; aa_leather_T2_003_2 min=max=70)
//   set_aa_T2_plate_002:4  Damage Reduction 40 (was 20; aa_plate_T2_002_2_DamageReduction)
//   set_c_artifact_set_001:4 / set_b_artifact_set_001:4  Critical Damage 4%/6%
//     (was Bonus Attack Power 4/6; artifact_c_001/b_001 raw 400/600 prove the x0.01 stat)
//   set_aa_T2_leather_005 (Admiral) -3% Debuff Duration / +6% Attack Speed, each applied
//     twice (leather_ab_T2_002; personal + self-inclusive aura per the client set strings)
//   set_aa_t3_lether_001:4 persistent Bonus Damage 40 (leather_aa_T3_001_2_...Penetration;
//     the 15%-rate on-hit +14 proc stays excluded from sheet totals)
//   set_aa_T2_plate_003:4 (Skilled Veteran) Damage Reduction 24+24 (was Questlog's 12+12;
//     decoded FP tooltip1=24 is bound twice by the client set description)
// Threshold operators resolved 2026-07-13 from the Korean source strings
// (Game.locres ko, "50/30 이상" = "or more"): Vanguard 4pc Fortitude >= 50 and
// Resistance Scale 2pc Dexterity >= 30 are confirmed >=, and the Resistance
// Scale 4pc stat omitted from the English text is Attack Speed ("공격 속도").
export const SET_PASSIVE_RULES={set_aa_t3_fabric_002:{2:{phase:1,effect:e=>[{statId:"heal_modifier",value:z("heal_modifier",30)}]},4:{phase:1,effect:e=>[{statId:"continuous_heal_modifier",value:z("continuous_heal_modifier",30)}]}},set_aa_t3_lether_001:{2:{phase:1,effect:e=>[{statId:"attack_speed_modifier",value:z("attack_speed_modifier",7)},{statId:"skill_cooldown_modifier",value:z("skill_cooldown_modifier",7)}]},4:{phase:1,effect:()=>[{statId:"damage_reduction_penetration",value:z("damage_reduction_penetration",40)}]}},set_aa_t3_plate_002:{2:{phase:3,effect:e=>{const t=Math.min(99,Math.max(0,e.str?.total??0));return[{statId:"all_double_attack",value:z("all_double_attack",Math.floor(t/10)*30)}]}},4:{phase:1,effect:()=>[{statId:"double_damage_dealt_modifier",value:z("double_damage_dealt_modifier",10)}]}},set_aa_t3_plate_001:{2:{phase:1,effect:e=>[{statId:"hp_max",value:z("hp_max",2500)}]},4:{phase:3,effect:e=>{const t=e.hp_max?.total??0,n=Math.min(24,Math.floor(t/1e3)*.6);return[{statId:"melee_critical_defense",value:z("melee_critical_defense",250)},{statId:"range_critical_defense",value:z("range_critical_defense",250)},{statId:"magic_critical_defense",value:z("magic_critical_defense",250)},{statId:"double_damage_taken_modifier",value:z("double_damage_taken_modifier",n)}]}}},set_aa_t3_fabric_001:{2:{phase:1,effect:e=>[{statId:"cost_consumption_modifier",value:z("cost_consumption_modifier",8)},{statId:"cost_max",value:z("cost_max",2e3)}]},4:{phase:1,effect:e=>[{statId:"shield_modifier",value:z("shield_modifier",30)},{statId:"shield_taken_modifier",value:z("shield_taken_modifier",10)}]}},set_aa_t3_lether_002:{2:{phase:1,effect:e=>[{statId:"all_critical_attack",value:z("all_critical_attack",250)}]},4:{phase:1,effect:e=>[{statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",15)}]}},Set_acc_t2_upgrade_001:{4:{phase:1,effect:e=>[{statId:"con",value:2},{statId:"all_double_defense",value:z("all_double_defense",60)},{statId:"hp_max",value:z("hp_max",1e3)}]}},Set_acc_t2_upgrade_002:{4:{phase:1,effect:e=>[{statId:"dex",value:2},{statId:"bonus_attack_power_main_hand",value:z("bonus_attack_power_main_hand",5)},{statId:"hp_max",value:z("hp_max",600)}]}},Set_acc_t2_upgrade_003:{4:{phase:1,effect:e=>[{statId:"int",value:2},{statId:"skill_power_amplification",value:z("skill_power_amplification",45)},{statId:"hp_max",value:z("hp_max",800)}]}},Set_acc_t2_upgrade_004:{4:{phase:1,effect:e=>[{statId:"str",value:2},{statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",4)},{statId:"hp_max",value:z("hp_max",800)}]}},set_aa_leather_003:{2:{phase:2,effect:e=>(e.dex?.total??0)>=30?[{statId:"skill_cooldown_modifier",value:z("skill_cooldown_modifier",8)}]:[]},4:{phase:2,effect:e=>{const t=Math.min(99,Math.max(0,e.con?.total??0));return[{statId:"attack_speed_modifier",value:z("attack_speed_modifier",Math.floor(t/10)*2)}]}}},set_aa_T2_plate_005:{2:{phase:2,effect:e=>{const t=Math.min(99,Math.max(0,e.per?.total??0));return[{statId:"all_critical_defense",value:z("all_critical_defense",Math.floor(t/10)*45)}]}},4:{phase:2,effect:e=>{const t=e.con?.total??0;return[{statId:"bonus_attack_power_main_hand",value:z("bonus_attack_power_main_hand",t>=50?30:0)}]}}},set_aa_T2_leather_007:{2:{phase:1,effect:()=>[{statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",15)}]},4:{phase:1,effect:()=>[{statId:"move_speed_modifier",value:z("move_speed_modifier",15)}]}},set_aa_T2_leather_004:{2:{phase:1,effect:()=>[{statId:"all_evasion",value:z("all_evasion",220)}]},4:{phase:1,effect:()=>[{statId:"all_critical_attack",value:z("all_critical_attack",220)}]}},set_aa_T2_leather_005:{2:{phase:1,effect:()=>[{statId:"debuff_taken_duration_modifier",value:z("debuff_taken_duration_modifier",-3)},{statId:"debuff_taken_duration_modifier",value:z("debuff_taken_duration_modifier",-3)}]},4:{phase:1,effect:()=>[{statId:"attack_speed_modifier",value:z("attack_speed_modifier",6)},{statId:"attack_speed_modifier",value:z("attack_speed_modifier",6)}]}},set_aa_T2_fabric_001:{2:{phase:1,effect:()=>[{statId:"cost_max",value:z("cost_max",1500)},{statId:"cost_regen",value:z("cost_regen",50)}]},4:{phase:3,effect:e=>{const t=e.cost_max?.total??0,n=Math.min(20,Math.floor(t/1e3));return[{statId:"skill_cooldown_modifier",value:z("skill_cooldown_modifier",n)}]}}},set_aa_T2_leather_002:{2:{phase:1,effect:()=>[{statId:"all_critical_attack",value:z("all_critical_attack",200)}]},4:{phase:1,effect:()=>[{statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",15)}]}},set_aa_T2_fabric_004:{4:{phase:1,effect:()=>[{statId:"heal_modifier",value:z("heal_modifier",30)}]}},set_aa_T2_leather_001:{2:{phase:1,effect:()=>[{statId:"attack_power_main_hand",value:z("attack_power_main_hand",20)}]},4:{phase:1,effect:()=>[{statId:"all_critical_attack",value:z("all_critical_attack",100)}]}},set_aa_T2_leather_003:{2:{phase:1,effect:()=>[{statId:"range_evasion",value:z("range_evasion",250)},{statId:"magic_evasion",value:z("magic_evasion",250)}]},4:{phase:1,effect:()=>[{statId:"damage_reduction_penetration",value:z("damage_reduction_penetration",70)}]}},set_aa_T2_leather_006:{2:{phase:1,effect:()=>[{statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",15)}]},4:{phase:1,effect:()=>[{statId:"buff_given_duration_modifier",value:z("buff_given_duration_modifier",12)}]}},set_aa_T2_fabric_003:{2:{phase:1,effect:()=>[{statId:"all_armor",value:z("all_armor",400)}]},4:{phase:1,effect:()=>[{statId:"skill_heal_taken_modifier",value:z("skill_heal_taken_modifier",20)}]}},set_aa_T2_plate_004:{2:{phase:1,effect:()=>[{statId:"shield_block_chance",value:z("shield_block_chance",8)}]},4:{phase:1,effect:()=>[{statId:"critical_damage_taken_modifier",value:z("critical_damage_taken_modifier",25)}]}},set_aa_T2_plate_002:{2:{phase:1,effect:()=>[{statId:"buff_given_duration_modifier",value:z("buff_given_duration_modifier",10)}]},4:{phase:1,effect:()=>[{statId:"damage_reduction",value:z("damage_reduction",40)},{statId:"all_critical_defense",value:z("all_critical_defense",150)}]}},set_aa_plate_001:{4:{phase:1,effect:()=>[{statId:"shield_block_chance",value:z("shield_block_chance",10)}]}},set_aa_leather_001:{4:{phase:1,effect:()=>[{statId:"off_hand_attack_chance_modifier",value:z("off_hand_attack_chance_modifier",30)}]}},set_aa_fabric_002:{4:{phase:1,effect:()=>[{statId:"heal_modifier",value:z("heal_modifier",25)}]}},set_aa_leather_002:{2:{phase:1,effect:()=>[{statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",14)}]}},set_aa_T2_plate_003:{2:{phase:1,effect:()=>[{statId:"all_critical_defense",value:z("all_critical_defense",120)},{statId:"all_critical_defense",value:z("all_critical_defense",120)}]},4:{phase:1,effect:()=>[{statId:"damage_reduction",value:z("damage_reduction",24)},{statId:"damage_reduction",value:z("damage_reduction",24)}]}},set_aa_T2_fabric_002:{4:{phase:1,effect:()=>[{statId:"skill_power_resistance",value:z("skill_power_resistance",150)}]}},set_aa_T2_plate_001:{2:{phase:1,effect:()=>[{statId:"hp_max",value:z("hp_max",2e3)}]},4:{phase:4,effect:e=>{const t=e.hp_max?.total??0,n=Math.min(240,Math.floor(t/1e3)*12);return[{statId:"melee_double_attack",value:z("melee_double_attack",n)}]}}},set_c_artifact_set_001:{4:{phase:1,effect:()=>[{statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",4)}]}},set_a_artifact_set_002:{4:{phase:1,effect:()=>[{statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",9)}]}},set_a_artifact_set_006:{4:{phase:1,effect:()=>[{statId:"magic_doll_heal_modifier",value:z("magic_doll_heal_modifier",200)},{statId:"potion_heal_modifier",value:z("potion_heal_modifier",100)}]},6:{phase:1,effect:e=>{const t=e.hp_max?.total??0;return[{statId:"hp_max",value:z("hp_max",Math.floor(t*.07))}]}}},set_c_artifact_set_002:{4:{phase:1,effect:()=>[{statId:"stamina_max",value:z("stamina_max",6)},{statId:"stamina_regen",value:z("stamina_regen",2)}]},6:{phase:3,effect:e=>{const t=e.melee_armor?.total??0,n=e.magic_armor?.total??0,r=e.range_armor?.total??0;return[{statId:"melee_armor",value:z("melee_armor",Math.floor(t*.02))},{statId:"magic_armor",value:z("magic_armor",Math.floor(n*.02))},{statId:"range_armor",value:z("range_armor",Math.floor(r*.02))}]}}},set_b_artifact_set_001:{4:{phase:1,effect:()=>[{statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",6)}]}},set_b_artifact_set_003:{4:{phase:1,effect:()=>[{statId:"stamina_max",value:z("stamina_max",10)},{statId:"stamina_regen",value:z("stamina_regen",3)}]},6:{phase:3,effect:e=>{const t=e.melee_armor?.total??0,n=e.magic_armor?.total??0,r=e.range_armor?.total??0;return[{statId:"melee_armor",value:z("melee_armor",Math.floor(t*.04))},{statId:"magic_armor",value:z("magic_armor",Math.floor(n*.04))},{statId:"range_armor",value:z("range_armor",Math.floor(r*.04))}]}}},set_b_artifact_set_004:{4:{phase:1,effect:()=>[{statId:"magic_doll_heal_modifier",value:z("magic_doll_heal_modifier",100)},{statId:"potion_heal_modifier",value:z("potion_heal_modifier",50)}]},6:{phase:1,effect:e=>{const t=e.hp_max?.total??0;return[{statId:"hp_max",value:z("hp_max",Math.floor(t*.04))}]}}},set_a_artifact_set_001:{2:{phase:1,effect:()=>[{statId:"shield_block_chance_penetration",value:z("shield_block_chance_penetration",10)}]},6:{phase:1,effect:()=>[{statId:"shield_block_chance_penetration",value:z("shield_block_chance_penetration",15)}]}},set_a_artifact_set_004:{4:{phase:1,effect:()=>[{statId:"critical_damage_taken_modifier",value:z("critical_damage_taken_modifier",12)}]}},set_a_artifact_set_007:{4:{phase:1,effect:()=>[{statId:"stamina_max",value:z("stamina_max",15)},{statId:"stamina_regen",value:z("stamina_regen",5)}]},6:{phase:3,effect:e=>{const t=e.melee_armor?.total??0,n=e.magic_armor?.total??0,r=e.range_armor?.total??0;return[{statId:"melee_armor",value:z("melee_armor",Math.floor(t*.07))},{statId:"magic_armor",value:z("magic_armor",Math.floor(n*.07))},{statId:"range_armor",value:z("range_armor",Math.floor(r*.07))}]}}},set_a_artifact_set_008:{6:{phase:1,effect:()=>[{statId:"shield_block_efficiency",value:z("shield_block_efficiency",5)}]}},set_aa_t3_fabric_003:{2:{phase:1,effect:()=>[{statId:"critical_damage_taken_modifier",value:z("critical_damage_taken_modifier",12)},{statId:"double_damage_taken_modifier",value:z("double_damage_taken_modifier",14)}]},4:{phase:1,effect:()=>[{statId:"skill_power_resistance",value:z("skill_power_resistance",100)}]}},set_aa_t3_leather_004:{2:{phase:1,effect:()=>[{statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",12)},{statId:"double_damage_dealt_modifier",value:z("double_damage_dealt_modifier",14)}]},4:{phase:1,effect:()=>[{statId:"skill_power_amplification",value:z("skill_power_amplification",80)}]}},set_aa_t3_leather_005:{2:{phase:1,effect:()=>[{statId:"attack_range_modifier",value:z("attack_range_modifier",8)},{statId:"attack_speed_modifier",value:z("attack_speed_modifier",8)}]},4:{phase:1,effect:()=>[{statId:"skill_power_amplification",value:z("skill_power_amplification",80)}]}},set_aa_t3_plate_003:{2:{phase:1,effect:()=>[{statId:"damage_reduction",value:z("damage_reduction",32)},{statId:"hp_max",value:z("hp_max",1600)}]},4:{phase:1,effect:()=>[{statId:"shield_block_chance",value:z("shield_block_chance",12)}]}},set_aa_t3_lether_003:{2:{phase:1,effect:()=>[{statId:"magic_evasion",value:z("magic_evasion",150)},{statId:"melee_evasion",value:z("melee_evasion",150)},{statId:"range_evasion",value:z("range_evasion",150)}]}},set_aa_t4_fabric_001:{2:{phase:1,effect:()=>[{statId:"heal_modifier",value:z("heal_modifier",20)},{statId:"continuous_heal_modifier",value:z("continuous_heal_modifier",20)}]},4:{phase:1,effect:()=>[{statId:"hp_max",value:z("hp_max",2200)}]}},set_aa_t4_fabric_002:{2:{phase:1,effect:()=>[{statId:"shield_modifier",value:z("shield_modifier",20)},{statId:"heal_modifier",value:z("heal_modifier",20)}]},4:{phase:1,effect:()=>[{statId:"skill_cooldown_modifier",value:z("skill_cooldown_modifier",10)}]}},set_aa_t4_fabric_003:{2:{phase:1,effect:()=>[{statId:"stamina_regen",value:z("stamina_regen",20)}]},4:{phase:1,effect:()=>[{statId:"move_speed_modifier",value:z("move_speed_modifier",15)},{statId:"all_double_attack",value:z("all_double_attack",-1e3)},{statId:"all_critical_attack",value:z("all_critical_attack",-1e3)}]}},set_aa_t4_fabric_004:{2:{phase:3,effect:e=>{const t=Math.min(130,Math.max(0,e.int?.total??0));return[{statId:"double_damage_dealt_modifier",value:z("double_damage_dealt_modifier",20)},{statId:"pvp_magic_double_attack",value:z("pvp_magic_double_attack",Math.floor(t/10)*30)}]}}},set_aa_t4_leather_001:{2:{phase:1,effect:()=>[{statId:"attack_speed_modifier",value:z("attack_speed_modifier",10)},{statId:"all_critical_attack",value:z("all_critical_attack",150)}]},4:{phase:1,effect:()=>[{statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",20)}]}},set_aa_t4_leather_002:{2:{phase:1,effect:()=>[{statId:"skill_power_amplification",value:z("skill_power_amplification",50)},{statId:"all_double_attack",value:z("all_double_attack",150)}]},4:{phase:1,effect:()=>[{statId:"double_damage_dealt_modifier",value:z("double_damage_dealt_modifier",20)}]}},set_aa_t4_leather_003:{2:{phase:3,effect:e=>{const t=Math.min(130,Math.max(0,e.con?.total??0));return[{statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",15)},{statId:"pvp_melee_critical_attack",value:z("pvp_melee_critical_attack",Math.floor(t/10)*30)}]}}},set_aa_t4_leather_004:{2:{phase:1,effect:()=>[{statId:"all_double_defense",value:z("all_double_defense",200)},{statId:"all_evasion",value:z("all_evasion",250)}]}},set_aa_t4_leather_005:{2:{phase:3,effect:e=>{const t=Math.min(130,Math.max(0,e.dex?.total??0));return[{statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",15)},{statId:"pvp_range_critical_attack",value:z("pvp_range_critical_attack",Math.floor(t/10)*30)}]}}},set_aa_t4_leather_006:{2:{phase:1,effect:()=>[{statId:"pvp_magic_evasion",value:z("pvp_magic_evasion",250)},{statId:"pvp_range_evasion",value:z("pvp_range_evasion",250)},{statId:"damage_reduction_penetration",value:z("damage_reduction_penetration",35)}]}},set_aa_t4_Plate_001:{2:{phase:1,effect:()=>[{statId:"hp_max",value:z("hp_max",2e3)},{statId:"damage_reduction",value:z("damage_reduction",35)}]},4:{phase:1,effect:()=>[{statId:"skill_power_resistance",value:z("skill_power_resistance",100)}]}},set_aa_t4_Plate_002:{2:{phase:1,effect:()=>[{statId:"all_critical_defense",value:z("all_critical_defense",100)},{statId:"all_double_defense",value:z("all_double_defense",100)},{statId:"melee_damage_dealt_modifier",value:z("melee_damage_dealt_modifier",3)}]},4:{phase:1,effect:()=>[{statId:"skill_cooldown_modifier",value:z("skill_cooldown_modifier",10)}]}},set_aa_t4_Plate_003:{2:{phase:1,effect:()=>[{statId:"critical_damage_taken_modifier",value:z("critical_damage_taken_modifier",10)},{statId:"double_damage_taken_modifier",value:z("double_damage_taken_modifier",12)},{statId:"all_critical_attack",value:z("all_critical_attack",100)}]},4:{phase:1,effect:()=>[{statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",20)}]}},set_aa_t4_Plate_004:{2:{phase:3,effect:e=>{const t=Math.min(130,Math.max(0,e.per?.total??0));return[{statId:"double_damage_dealt_modifier",value:z("double_damage_dealt_modifier",20)},{statId:"pvp_melee_double_attack",value:z("pvp_melee_double_attack",Math.floor(t/10)*30)}]}}},set_aa_t4_Plate_005:{2:{phase:1,effect:()=>[{statId:"pvp_melee_critical_defense",value:z("pvp_melee_critical_defense",250)},{statId:"pvp_range_critical_defense",value:z("pvp_range_critical_defense",250)},{statId:"damage_reduction",value:z("damage_reduction",35)}]}},set_aa_PartyDungeon_Ring_001:{2:{phase:1,effect:()=>[{statId:"stamina_regen",value:z("stamina_regen",-10)}]}}};
export const PASSIVE_SKILL_RULES={SkillSet_WP_SW2_S_MaxHPUp:{phase:1,effect:(e,t,n)=>{const r=t?.specialization?.find(u=>u.id==="Sword2h_Normal_Attack_Skill"),a=[470,590,710,830,950,1070,1190,1310,1430,1550,1670,1790,1910,2030,2150,2210,2270,2330,2390,2450][e-1],i=[];if(r){const u=Math.round(24*e/20);i.push({statId:"bonus_attack_power_main_hand",value:z("bonus_attack_power_main_hand",u)}),i.push({statId:"hp_max",value:z("hp_max",Math.floor(a*.5))})}else i.push({statId:"hp_max",value:z("hp_max",a)});const l=[10,16,22,28,34,40,46,52,58,64,70,76,82,88,94,97,100,103,106,109][e-1];return i.push({statId:"hp_regen",value:z("hp_regen",l)}),i}},SkillSet_WP_ORB_Passive_ShieldUp:{phase:3,effect:(e,t,n)=>{const o=[11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,25.8,26.6,27.4,28.2,29][e-1],a=1.4,i=(n.cost_max?.total??0)/1e3,s=o+a*i;return[{statId:"shield_modifier",value:z("shield_modifier",s)}]}},SkillSet_WP_ST_S_MaxManaUp:{phase:1,effect:(e,t,n)=>{const o=[1400,1540,1680,1820,1960,2100,2240,2380,2520,2660,2800,2940,3080,3220,3360,3430,3500,3570,3640,3710][e-1],i=[360,420,480,540,600,660,720,780,840,900,960,1020,1080,1140,1200,1230,1260,1290,1320,1350][e-1];return[{statId:"cost_max",value:z("cost_max",o)},{statId:"hp_max",value:z("hp_max",i)}]}},SkillSet_WP_SW_SH_S_ArmorUp:{phase:2,effect:(e,t,n)=>{const r=n.shield_block_chance?.total??0,o=[4,4.4,4.8,5.2,5.6,6,6.4,6.8,7.2,7.6,8,8.4,8.8,9.2,9.6,9.8,10,10.2,10.4,10.6],a=Math.floor(r/100*o[e-1]),i=t?.specialization?.find(l=>l.id==="Sword_High_Def_Skill"),s=[];return i&&(s.push({statId:"skill_power_resistance",value:z("skill_power_resistance",150)}),s.push({statId:"melee_double_attack",value:z("melee_double_attack",-350)})),[{statId:"range_armor",value:z("range_armor",a)},{statId:"melee_armor",value:z("melee_armor",a)},...s]}},SkillSet_WP_CR_S_WeakenAccuracy:{phase:1,effect:(e,t,n)=>{const o=[107,114,121,128,135,142,149,156,163,170,177,184,191,198,205,208,212,215,219,222][e-1];return[{statId:"weaken_accuracy",value:z("weaken_accuracy",o)}]}},SkillSet_WP_CR_S_CriticalAttack:{phase:1,effect:(e,t,n)=>{const o=[15,16,18,19,21,22,24,25,27,28,30,31,33,34,36,36,37,38,38,39][e-1],i=[.4,.8,1.2,1.6,2,2.4,2.8,3.2,3.6,4,4.4,4.8,5.2,5.6,6,6.1,6.2,6.3,6.4,6.5][e-1];return[{statId:"damage_reduction_penetration",value:z("damage_reduction_penetration",o)},{statId:"stamina_regen",value:z("stamina_regen",i)}]}},SkillSet_WP_WA_GR_S_HealEfficiencyByMaxCost:{phase:3,effect:(e,t,n)=>{const r=n.cost_max?.total??0,a=[1.76,1.85,1.94,2.03,2.12,2.21,2.3,2.39,2.48,2.57,2.66,2.75,2.84,2.93,3.02,3.05,3.08,3.11,3.14,3.17][e-1]*(r/1e3);if(t?.specialization?.find(s=>s.id==="Wand_High_Attack_Skill")){const s=n.bonus_attack_power_main_hand?.total??0,l=n.attack_power_main_hand?.total??0,u=Math.floor(s*(a/100)*.25),c=Math.floor(l*(a/100)*.25)-u;return[{statId:"heal_modifier",value:z("heal_modifier",a*.7)},{statId:"bonus_attack_power_main_hand",value:z("bonus_attack_power_main_hand",u)},{statId:"attack_power_main_hand",value:z("attack_power_main_hand",c)}]}return[{statId:"heal_modifier",value:z("heal_modifier",a)}]}},SkillSet_WP_DA_S_MeleeAccuracy:{phase:1,effect:(e,t,n)=>{const o=[66,82,98,114,130,146,162,178,194,210,226,242,258,274,290,298,306,314,322,330][e-1];return[{statId:"all_critical_attack",value:z("all_critical_attack",o)}]}},SkillSet_WP_ST_S_ManaRegenBuff:{phase:1,effect:(e,t,n)=>{const o=[32,37,42,48,53,58,63,69,74,79,84,90,95,100,105,107,109,111,113,115][e-1];return[{statId:"cost_regen",value:z("cost_regen",o)}]}},SkillSet_WP_SW2_S_CurrentHpBuff:{phase:4,effect:(e,t,n)=>{const o=t?.specialization?.find(m=>m.id==="Sword2h_Normal_Util_Skill")?36e3:3e4,a=Math.min(o,n.hp_max?.total??0),s=Math.floor([.62,.72,.82,.92,1.02,1.12,1.22,1.32,1.42,1.52,1.62,1.72,1.82,1.92,2.02,2.06,2.1,2.14,2.18,2.22][e-1]*(a/100)),u=Math.floor([.07,.09,.11,.13,.15,.17,.19,.21,.23,.25,.27,.29,.31,.33,.35,.358,.366,.374,.382,.39][e-1]*(a/100)),c=Math.floor(.425*(a/100));if(t?.specialization?.find(m=>m.id==="Sword2h_High_Def_Skill")){const m=Math.floor(s*.43);return[{statId:"all_evasion",value:z("all_evasion",m)},{statId:"skill_power_resistance",value:z("skill_power_resistance",u)},{statId:"stun_tolerance",value:z("stun_tolerance",c)}]}return[{statId:"all_accuracy",value:z("all_accuracy",s)},{statId:"skill_power_amplification",value:z("skill_power_amplification",u)},{statId:"stun_accuracy",value:z("stun_accuracy",c)}]}},SkillSet_WP_DA_S_CriticalDamageUp:{phase:1,effect:(e,t,n)=>{const o=[9.6,10.2,10.8,11.4,12,12.6,13.2,13.8,14.4,15,15.6,16.2,16.8,17.4,18,18.3,18.6,18.9,19.2,19.5][e-1];return[{statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",o)}]}},SkillSet_WP_ST_S_SkillPowerAmplificationBuff:{phase:1,effect:(e,t,n)=>{const o=[80,85,90,95,100,105,110,115,120,125,130,135,140,145,150,152,155,157,160,162][e-1],a=t?.specialization?.find(s=>s.id==="Staff_Normal_Tac_Skill"),i=(n.cost_consumption_modifier?.total??0)+1e4;return a?[{statId:"skill_power_amplification",value:z("skill_power_amplification",o+75)},{statId:"cost_consumption_modifier",value:-(i*.2)}]:[{statId:"skill_power_amplification",value:z("skill_power_amplification",o)},{statId:"cost_consumption_modifier",value:-(i*.15)}]}}};
export const MASTERY_SYNERGY_RULES={Crossbow_High_Def_Skill:{phase:1,effect:(e,t)=>[{statId:"magic_evasion",value:z("magic_evasion",-150)},{statId:"range_evasion",value:z("range_evasion",-150)}]},Crossbow_Hero_Util_02:{phase:1,effect:(e,t)=>[{statId:"cost_max",value:z("cost_max",-1e3)}]},Sword_Hero_Util_02:{phase:4,effect:(e,t)=>{const n=Math.min(2e4,t.hp_max?.total??0),o=[.039,.042,.045,.049,.052,.056,.059,.063,.066,.07][e-1]*Math.floor(n/100);return[{statId:"critical_damage_taken_modifier",value:z("critical_damage_taken_modifier",o)}]}},Sword_Hero_Defense_03:{phase:4,effect:(e,t)=>{const n=Math.min(3e4,t.hp_max?.total??0),r=Math.floor(n/100),a=[1.1,1.2,1.3,1.4,1.5,1.6,1.7,1.8,1.9,2][e-1]*r,s=[33,36,39,42,45,48,51,54,57,60][e-1];return[{statId:"melee_critical_defense",value:z("melee_critical_defense",a)},{statId:"range_critical_defense",value:z("range_critical_defense",a)},{statId:"bonus_attack_power_main_hand",value:z("bonus_attack_power_main_hand",-s)}]}},Sword_Hero_Tactic_04:{phase:2,effect:(e,t)=>{if((t.int?.total??0)>=60){const o=[5.5,6,6.5,7,7.5,8,8.5,9,9.5,10][e-1];return[{statId:"heal_modifier",value:z("heal_modifier",o)},{statId:"skill_heal_taken_modifier",value:z("skill_heal_taken_modifier",o)}]}else{const o=[880,960,1040,1120,1200,1280,1360,1440,1520,1600][e-1];return[{statId:"cost_max",value:z("cost_max",o)}]}}},Sword2h_Hero_Tactic_04:{phase:2,effect:(e,t)=>{const n=t.per?.total??0,o=[110,120,130,140,150,160,170,180,190,200][e-1];return n>=70?[{statId:"stun_accuracy",value:z("stun_accuracy",o)},{statId:"collide_amplification",value:z("collide_amplification",o)}]:[{statId:"collide_resistance",value:z("collide_resistance",o)},{statId:"stun_tolerance",value:z("stun_tolerance",o)}]}},Dagger_Hero_Tactic_04:{phase:2,effect:(e,t)=>{const n=t.dex?.total??0,o=(n>=90?[4.4,4.8,5.2,5.6,6,6.4,6.8,7.2,7.6,8]:[88,96,104,112,120,128,136,144,152,160])[e-1];return n>=90?[{statId:"critical_damage_dealt_modifier",value:z("critical_damage_dealt_modifier",o)}]:[{statId:"all_evasion",value:z("all_evasion",o)}]}},Bow_Rare_Util_Skill:{phase:2,effect:(e,t)=>(t.int?.total??0)>=80?[{statId:"skill_cooldown_modifier",value:z("skill_cooldown_modifier",10)}]:[{statId:"heal_modifier",value:z("heal_modifier",10)}]},Bow_Rare_Def_Skill:{phase:2,effect:(e,t)=>{const n=t.per?.total??0,r=Math.floor(n/10)*24;return[{statId:"melee_evasion",value:z("melee_evasion",r)},{statId:"melee_critical_defense",value:z("melee_critical_defense",r)}]}},Wand_Hero_Util_02:{phase:1,effect:(e,t)=>{const r=[6.6,7.2,7.8,8.4,9,9.6,10.2,10.8,11.4,12][e-1];return[{statId:"heal_modifier",value:z("heal_modifier",r)}]}},Staff_Hero_Attack_01:{phase:3,effect:(e,t)=>{const n=Math.min(3e4,t.cost_max?.total??0),o=[.088,.096,.104,.112,.12,.128,.136,.144,.152,.16][e-1]*Math.floor(n/1e3),a=t.attack_power_main_hand?.total??0;return[{statId:"attack_power_main_hand",value:z("attack_power_main_hand",Math.floor(a*o/100))}]}},Staff_Hero_Defense_03:{phase:3,effect:(e,t)=>{const n=t.cost_regen?.total??0,o=[15,30,45,60,75,90,105,120,135,150][e-1],a=n*.001*.2+o;return[{statId:"all_armor",value:Math.floor(a)}]}},Staff_High_Def_Skill:{phase:3,effect:(e,t)=>{const n=Math.min(3e4,t.cost_max?.total??0),r=.03*Math.floor(n/100);return[{statId:"debuff_taken_duration_modifier",value:-z("debuff_taken_duration_modifier",r)}]}},Staff_Rare_Def_Skill:{phase:3,effect:(e,t)=>{const r=(t.cost_max?.total??0)>=15e3?1500:0;return[{statId:"hp_max",value:z("hp_max",r)}]}},Spear_Hero_Util_02:{phase:2,effect:(e,t)=>{const n=t.con?.total??0,o=[6.6,7.2,7.8,8.4,9,9.6,10.2,10.8,11.4,12][e-1];return n>=50?[{statId:"skill_cooldown_modifier",value:z("skill_cooldown_modifier",o)}]:[]}},Spear_Hero_Tactic_04:{phase:2,effect:(e,t)=>{const n=t.con?.total??0,r=[22,24,26,28,30,32,34,36,38,40],o=Math.floor(n/10)*r[e-1];return[{statId:"stun_accuracy",value:z("stun_accuracy",o)},{statId:"collide_amplification",value:z("collide_amplification",o)},{statId:"blind_accuracy",value:z("blind_accuracy",o)}]}}};
applyDecodedRuleCorrections();
// Verified against the live Questlog bundle (CSq355zw.js, 2026-07-10): its
// unified-mastery rule table also contains ONLY WM_Common_SKILL_007. The
// other WM_Common_SKILL_* nodes are conditional combat passives that
// Questlog's stat calculation excludes as well — selecting them contributes
// nothing by design (validateBuild surfaces this as an info issue).
export const UNIFIED_MASTERY_RULES={WM_Common_SKILL_007:{phase:1,effect:(e,t)=>[{statId:"dex",value:z("dex",1)},{statId:"con",value:z("con",1)},{statId:"per",value:z("per",1)},{statId:"str",value:z("str",1)},{statId:"int",value:z("int",1)}]}};
export const PERK_PASSIVE_RULES={
  SkillSet_WP_Item_A08_kAA_BO:{...mindEyeRule,requiredWeapon:"bow"},
  SkillSet_WP_Item_Field_NIX_GT_01:{...orthodoxRule,requiredWeapon:"gauntlet"},
  SkillSet_WP_Item_Nix_Field_CR_01:{...windGuidanceRule,requiredWeapon:"crossbow"},
  SkillSet_WP_Item_Field_NIX_GT_02:{...southpawRule,requiredWeapon:"gauntlet"},
};

export const COMBAT_POWER={equipmentBase:250,itemLevelBase:{weapon:{1:40,2:80,3:120,4:160,5:200,6:220},armor:{1:20,2:40,3:60,4:80,5:100,6:120}},enchantPerLevel:{weapon:8,armor:4},traitPerTier:{weapon:10,armor:5},skillPerLevel:2,masteryPerLevel:3,masteryThresholds:[130,260,390,520],masteryThresholdBonus:20};
export const COMBAT_POWER_BONUS_60_ITEMS=["sword_aa_t2_polymorph_001","staff_aa_t1_nomal_004","spear_aa_t1_Arch_004","crossbow_aa_t2_polymorph_001","wand_aa_t2_polymorph_001","bow_aa_t1_nomal_002","sword2h_aa_t2_polymorph_001","dagger_aa_t2_polymorph_001","crossbow_aa_t2_polymorph_002","wand_aa_t2_polymorph_002","sword2h_aa_t2_boss_002","spear_aa2_t1_Arch_005","dagger_aa_t2_boss_001","sword_aa_t2_boss_001","bow_aa_t2_polymorph_001","staff_aa_t2_polymorph_001"];
export const COMBAT_POWER_BONUS_20_ITEMS=["dagger_aa_t5_boss_001","dagger_aa_t4_nomal_004","sword2h_aa_t3_plant_004","sword2h_aa_t5_boss_001","sword2h_aa_t5_boss_002","spear_aa_t1_normal_002","sword_aa_t3_plant_004","sword_aa_t5_boss_001","sword_aa_t5_boss_002","crossbow_aa_t5_boss_001","crossbow_aa_t5_boss_002","bow_aa_t5_boss_001","staff_aa_t5_boss_001","staff_aa_t5_boss_002","wand_aa_t5_boss_005"];
