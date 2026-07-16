import assert from "node:assert/strict";
import test from "node:test";

import {
  EVENT_EFFECT_DEFINITIONS,
  EVENT_EFFECT_IDS,
  evaluateEventScenarioEffects,
} from "../../web/tl-event-scenario-effects.js";

const passive = (id, level, selected = true) => ({ id, level, selected });
const mastery = (id, level, selected = true) => ({ id, level, selected });
const observed = (weaponType, categories, overrides = {}) => ({
  state: "observed",
  lookbackMs: 0,
  events: [{
    id: "activation-now",
    sequence: 0,
    occurredAgoMs: 0,
    kind: "ability_use",
    outcome: "successful_activation",
    weaponType,
    categories,
    ...overrides,
  }],
});

function evaluate({ weapons = [], passives = [], masteries = [], setBreakpoints = [], history = { state: "unspecified" } } = {}) {
  return evaluateEventScenarioEffects({
    activeSources: {
      equippedWeaponTypes: weapons,
      passiveSkills: passives,
      masteries,
      setBreakpoints,
    },
    scenario: { sourceEventHistory: history },
  });
}

const rows = (result) => result.overlayRows.map(({ effectId, statId, rawValue }) => ({ effectId, statId, rawValue }));

test("Shadow Walker applies all twenty decoded ranks for either qualifying category", () => {
  const evasion = [2700, 3000, 3300, 3600, 3900, 4200, 4500, 4800, 5100, 5400, 5700, 6000, 6300, 6600, 6900, 7000, 7100, 7200, 7300, 7400];
  const reduction = [14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 15, 16, 17, 18, 19];
  for (let level = 1; level <= 20; level += 1) {
    const category = level % 2 ? "mobility" : "movement";
    const result = evaluate({
      weapons: ["dagger"],
      passives: [passive(EVENT_EFFECT_IDS.SHADOW_WALKER, level)],
      history: observed("dagger", [category]),
    });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(rows(result), [
      { effectId: EVENT_EFFECT_IDS.SHADOW_WALKER, statId: "range_evasion", rawValue: evasion[level - 1] },
      { effectId: EVENT_EFFECT_IDS.SHADOW_WALKER, statId: "magic_evasion", rawValue: evasion[level - 1] },
      { effectId: EVENT_EFFECT_IDS.SHADOW_WALKER, statId: "damage_reduction", rawValue: reduction[level - 1] },
    ]);
  }
});

test("Nimble Steps keeps Movement separate from Mobility across all ranks", () => {
  const tolerance = [6000, 6600, 7200, 7800, 8400, 9000, 9600, 10200, 10800, 11400, 12000, 12600, 13200, 13800, 14400, 14680, 14960, 15240, 15520, 15800];
  const evasion = [1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000, 3200, 3400, 3600, 3800, 4000, 4200, 4280, 4360, 4440, 4520, 4600];
  for (let level = 1; level <= 20; level += 1) {
    const result = evaluate({
      weapons: ["spear"],
      passives: [passive(EVENT_EFFECT_IDS.NIMBLE_STEPS, level)],
      history: observed("spear", ["movement"]),
    });
    assert.deepEqual(rows(result), [
      { effectId: EVENT_EFFECT_IDS.NIMBLE_STEPS, statId: "collide_resistance", rawValue: tolerance[level - 1] },
      { effectId: EVENT_EFFECT_IDS.NIMBLE_STEPS, statId: "bind_tolerance", rawValue: tolerance[level - 1] },
      { effectId: EVENT_EFFECT_IDS.NIMBLE_STEPS, statId: "range_evasion", rawValue: evasion[level - 1] },
    ]);
  }
  const mobilityOnly = evaluate({
    weapons: ["spear"],
    passives: [passive(EVENT_EFFECT_IDS.NIMBLE_STEPS, 20)],
    history: observed("spear", ["mobility"]),
  });
  assert.deepEqual(mobilityOnly.overlayRows, []);
  assert.deepEqual(mobilityOnly.errors.map((entry) => entry.code), ["insufficient_source_event_window"]);
});

test("Barbarian's Dash and its selected Steadfast Rush augmentation use their exact values", () => {
  const speed = [1700, 1850, 2000, 2150, 2300, 2450, 2600, 2750, 2900, 3050, 3200, 3350, 3500, 3650, 3800, 3860, 3920, 3980, 4040, 4100];
  for (let level = 1; level <= 20; level += 1) {
    const result = evaluate({
      weapons: ["sword2h"],
      passives: [passive(EVENT_EFFECT_IDS.BARBARIANS_DASH, level)],
      masteries: [mastery(EVENT_EFFECT_IDS.BARBARIANS_DASH_MASTERY, 1)],
      history: observed("sword2h", [level % 2 ? "mobility" : "movement"]),
    });
    assert.deepEqual(rows(result), [
      { effectId: EVENT_EFFECT_IDS.BARBARIANS_DASH, statId: "move_speed_modifier", rawValue: speed[level - 1] },
      { effectId: EVENT_EFFECT_IDS.BARBARIANS_DASH_MASTERY, statId: "all_state_tolerance", rawValue: 4800 },
    ]);
  }
  const augmentationOnly = evaluate({
    weapons: ["sword2h"],
    masteries: [mastery(EVENT_EFFECT_IDS.BARBARIANS_DASH_MASTERY, 1)],
    history: observed("sword2h", ["movement"]),
  });
  assert.deepEqual(augmentationOnly.overlayRows, []);
  assert.ok(augmentationOnly.trace.some((entry) => entry.code === "augmentation_source_absent"));
});

test("Mirage Dancer applies only its Mobility Evasion component at all ten ranks", () => {
  for (let level = 1; level <= 10; level += 1) {
    const result = evaluate({
      weapons: ["crossbow"],
      masteries: [mastery(EVENT_EFFECT_IDS.MIRAGE_DANCER, level)],
      history: observed("crossbow", ["mobility"]),
    });
    assert.deepEqual(rows(result), [
      { effectId: EVENT_EFFECT_IDS.MIRAGE_DANCER, statId: "magic_evasion", rawValue: 1000 + level * 100 },
      { effectId: EVENT_EFFECT_IDS.MIRAGE_DANCER, statId: "range_evasion", rawValue: 1000 + level * 100 },
    ]);
  }
  const wrongCategory = evaluate({
    weapons: ["crossbow"],
    masteries: [mastery(EVENT_EFFECT_IDS.MIRAGE_DANCER, 10)],
    history: observed("crossbow", ["movement"]),
  });
  assert.deepEqual(wrongCategory.overlayRows, []);
  assert.deepEqual(wrongCategory.errors.map((entry) => entry.code), ["insufficient_source_event_window"]);
});

test("Enduring Dash and Blizzard Overture emit their exact fixed raw stat rows", () => {
  const enduring = evaluate({
    weapons: ["spear"],
    masteries: [mastery(EVENT_EFFECT_IDS.ENDURING_DASH, 1)],
    history: observed("spear", ["movement"]),
  });
  assert.deepEqual(rows(enduring), [
    { effectId: EVENT_EFFECT_IDS.ENDURING_DASH, statId: "magic_critical_defense", rawValue: 2500 },
    { effectId: EVENT_EFFECT_IDS.ENDURING_DASH, statId: "melee_critical_defense", rawValue: 2500 },
    { effectId: EVENT_EFFECT_IDS.ENDURING_DASH, statId: "range_critical_defense", rawValue: 2500 },
  ]);

  const blizzard = evaluate({
    weapons: ["dagger"],
    setBreakpoints: [EVENT_EFFECT_IDS.BLIZZARD_OVERTURE_4],
    history: observed("dagger", ["mobility"]),
  });
  assert.deepEqual(rows(blizzard), [
    { effectId: EVENT_EFFECT_IDS.BLIZZARD_OVERTURE_4, statId: "attack_speed_modifier", rawValue: 1000 },
    { effectId: EVENT_EFFECT_IDS.BLIZZARD_OVERTURE_4, statId: "double_damage_dealt_modifier", rawValue: 1400 },
  ]);
  const wrongCategory = evaluate({
    weapons: ["dagger"],
    setBreakpoints: [EVENT_EFFECT_IDS.BLIZZARD_OVERTURE_4],
    history: observed("dagger", ["movement"]),
  });
  assert.deepEqual(wrongCategory.overlayRows, []);
  assert.deepEqual(wrongCategory.errors.map((entry) => entry.code), ["insufficient_source_event_window"]);
});

test("event rules require an age-zero successful activation from an equipped weapon", () => {
  const selected = [passive(EVENT_EFFECT_IDS.SHADOW_WALKER, 20)];
  const base = { weapons: ["dagger", "bow"], passives: selected };
  const aged = evaluate({ ...base, history: observed("dagger", ["mobility"], { occurredAgoMs: 1 }) });
  assert.deepEqual(aged.overlayRows, []);
  assert.deepEqual(aged.errors.map((entry) => entry.code), ["unsupported_event_duration"]);
  const unsuccessful = evaluate({ ...base, history: observed("dagger", ["mobility"], { outcome: "unknown" }) });
  assert.deepEqual(unsuccessful.overlayRows, []);
  assert.deepEqual(unsuccessful.errors.map((entry) => entry.code), ["insufficient_source_event_window"]);
  assert.equal(evaluate({ ...base, history: observed("bow", ["mobility"]) }).overlayRows.length, 3);
  assert.deepEqual(evaluate({ ...base, history: observed("staff", ["mobility"]) }).errors.map((entry) => entry.code), ["foreign_event_weapon"]);
  assert.deepEqual(evaluate({ ...base }).errors.map((entry) => entry.code), ["insufficient_source_event_history"]);
  assert.deepEqual(evaluate({
    ...base,
    history: { state: "observed", lookbackMs: 10000, events: [] },
  }).errors.map((entry) => entry.code), ["insufficient_source_event_window"]);
});

test("one unresolved active event effect fails the complete family closed", () => {
  const result = evaluate({
    weapons: ["dagger", "spear"],
    passives: [
      passive(EVENT_EFFECT_IDS.SHADOW_WALKER, 20),
      passive(EVENT_EFFECT_IDS.NIMBLE_STEPS, 20),
    ],
    history: observed("dagger", ["mobility"]),
  });
  assert.deepEqual(result.overlayRows, []);
  assert.deepEqual(result.errors.map((entry) => entry.code), ["insufficient_source_event_window"]);
});

test("ranked event sources validate selection, weapon family, levels, and duplicates", () => {
  const shadow = EVENT_EFFECT_IDS.SHADOW_WALKER;
  assert.deepEqual(evaluate({
    weapons: ["dagger"], passives: [passive(shadow, 20, false)], history: observed("dagger", ["mobility"]),
  }).overlayRows, []);
  assert.deepEqual(evaluate({
    weapons: ["bow"], passives: [passive(shadow, 20)], history: observed("bow", ["mobility"]),
  }).errors.map((entry) => entry.code), ["foreign_weapon_passive"]);
  assert.deepEqual(evaluate({
    weapons: ["dagger"], passives: [passive(shadow, 0)], history: observed("dagger", ["mobility"]),
  }).errors.map((entry) => entry.code), ["invalid_passive_level"]);
  const same = evaluate({
    weapons: ["dagger"], passives: [passive(shadow, 5), passive(shadow, 5)], history: observed("dagger", ["mobility"]),
  });
  assert.equal(same.overlayRows.length, 3);
  assert.ok(same.trace.some((entry) => entry.code === "source_deduplicated"));
  assert.deepEqual(evaluate({
    weapons: ["dagger"], passives: [passive(shadow, 5), passive(shadow, 6)], history: observed("dagger", ["mobility"]),
  }).errors.map((entry) => entry.code), ["conflicting_source_levels"]);
  assert.deepEqual(evaluate({
    weapons: ["crossbow"], masteries: [mastery(EVENT_EFFECT_IDS.MIRAGE_DANCER, 11)], history: observed("crossbow", ["mobility"]),
  }).errors.map((entry) => entry.code), ["invalid_mastery_level"]);
});

test("provenance pins decoded rows, StackCap 1, and the evaluation-instant boundary", () => {
  const shadow = EVENT_EFFECT_DEFINITIONS[EVENT_EFFECT_IDS.SHADOW_WALKER].provenance;
  assert.deepEqual(shadow.effectRowIds, ["WP_DA_MoveSkillEvasion_PassiveOn", "WP_DA_MoveSkillEvasion_Buff"]);
  assert.equal(shadow.abnormalStateId, "abn_WP_DA_MoveSkillEvasion_Buff");
  assert.equal(shadow.baseDurationMs, 4000);
  assert.equal(shadow.stackCap, 1);
  assert.equal(shadow.evaluationBoundary, "successful_activation_at_age_zero_only");
  assert.equal(EVENT_EFFECT_DEFINITIONS[EVENT_EFFECT_IDS.SHADOW_WALKER].triggerWeaponScope, "any_equipped_weapon");

  const blizzard = EVENT_EFFECT_DEFINITIONS[EVENT_EFFECT_IDS.BLIZZARD_OVERTURE_4].provenance;
  assert.equal(blizzard.itemSetBonusRow, 131);
  assert.equal(blizzard.abnormalStateId, "abn_Item_Passive_Set_Plate_aa_T4_002_2_AdjustStat2");
  assert.equal(blizzard.baseDurationMs, 3000);
  assert.equal(blizzard.stackCap, 1);
});

test("cooldown, lock, attribute-branch, and derived Base Damage families remain excluded", () => {
  const excluded = [
    "SkillSet_WP_CR_CR_S_PeaceTimeBuff",
    "set_aa_t3_lether_003:4",
    "Orb_Rare_Tac_Skill",
    "SkillSet_WP_Item_kA_DA_57",
    "Dagger_Hero_Util_02",
  ];
  for (const id of excluded) assert.equal(EVENT_EFFECT_DEFINITIONS[id], undefined);
});
