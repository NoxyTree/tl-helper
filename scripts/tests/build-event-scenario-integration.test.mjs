import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as core from "../../web/tl-core.js";
import { EVENT_EFFECT_IDS } from "../../web/tl-event-scenario-effects.js";
import {
  SCENARIO_EFFECT_RULESET_ID,
  SCENARIO_EFFECT_RULESET_VERSION,
} from "../../web/tl-scenario-effects.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appData = await loadWebDataFromFile(join(repoRoot, "web", "data", "app-data.json"));
await core.initCore(appData);

const attributes = { str: 0, dex: 0, int: 0, per: 0, con: 0 };

function equip(build, slotId, itemId) {
  const item = core.indexes.itemById[itemId];
  assert.ok(item, `missing integration item ${itemId}`);
  build.equipment[slotId] = { ...core.emptyEquipmentSelection(), itemId, level: core.itemMaxLevel(item) };
}

function activation(weaponType, categories, occurredAgoMs = 0) {
  return {
    state: "observed",
    lookbackMs: occurredAgoMs,
    events: [{
      id: occurredAgoMs === 0 ? "activation-now" : "activation-before-now",
      sequence: 0,
      occurredAgoMs,
      kind: "ability_use",
      outcome: "successful_activation",
      weaponType,
      categories,
    }],
  };
}

function scenario(build, eventHistory) {
  return core.createBuildScenario(build, {
    targetDistanceMeters: 2,
    sourceEventHistory: eventHistory,
  });
}

function total(calculation, statId, scenarioState = false) {
  const rows = scenarioState ? calculation.scenarioStats : calculation.stats;
  return rows.find((row) => row.id === statId)?.total ?? 0;
}

function shadowBuild() {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "bow_c_t1_nomal_001");
  equip(build, "off_hand", "dagger_c_t1_nomal_001");
  build.skills = [{ skillId: EVENT_EFFECT_IDS.SHADOW_WALKER, level: 20, loadoutType: "passive" }];
  return build;
}

test("a generic Mobility event from the other equipped weapon activates Shadow Walker", () => {
  const build = shadowBuild();
  const staticCalculation = core.calculateBuild(build, attributes);
  const calculated = core.calculateBuild(build, attributes, {
    scenario: scenario(build, activation("bow", ["mobility"])),
  });

  assert.equal(calculated.scenarioEffects.status, "applied");
  assert.equal(total(calculated, "range_evasion", true) - total(staticCalculation, "range_evasion"), 7400);
  assert.equal(total(calculated, "magic_evasion", true) - total(staticCalculation, "magic_evasion"), 7400);
  assert.equal(total(calculated, "damage_reduction", true) - total(staticCalculation, "damage_reduction"), 19);

  const source = calculated.scenarioStats
    .find((row) => row.id === "range_evasion")
    .sources.find((row) => row.scenarioEffectId === EVENT_EFFECT_IDS.SHADOW_WALKER);
  assert.equal(source.scenarioSourceEventId, "activation-now");
  assert.equal(source.scenarioSourceEventOccurredAgoMs, 0);
  assert.equal(source.scenarioSourceEventOutcome, "successful_activation");
  assert.equal(source.scenarioSourceEventWeaponType, "bow");
  assert.deepEqual(source.scenarioSourceEventMatchedCategories, ["mobility"]);
  assert.equal(Object.hasOwn(source, "scenarioSourceEvent"), false);
  assert.equal(Object.hasOwn(source, "scenarioEventBranch"), false);
});

test("missing and older qualifying events fail the complete build overlay closed", () => {
  const build = shadowBuild();
  const missing = core.calculateBuild(build, attributes, {
    scenario: scenario(build, { state: "unspecified" }),
  });
  assert.equal(missing.scenarioEffects.status, "unsupported");
  assert.deepEqual(missing.scenarioEffects.appliedRows, []);
  assert.equal(missing.scenarioStats, missing.stats);
  assert.deepEqual(missing.scenarioEffects.errors.map(({ family, code }) => ({ family, code })), [{
    family: "source_event_activation_instant",
    code: "insufficient_source_event_history",
  }]);

  const old = core.calculateBuild(build, attributes, {
    scenario: scenario(build, activation("bow", ["mobility"], 1)),
  });
  assert.equal(old.scenarioEffects.status, "unsupported");
  assert.deepEqual(old.scenarioEffects.appliedRows, []);
  assert.equal(old.scenarioStats, old.stats);
  assert.ok(old.scenarioEffects.trace.some((row) => (
    row.family === "source_event_activation_instant"
    && row.code === "effect_failed_closed"
    && row.occurredAgoMs === 1
  )));
  assert.deepEqual(old.scenarioEffects.errors.map(({ family, code }) => ({ family, code })), [{
    family: "source_event_activation_instant",
    code: "unsupported_event_duration",
  }]);
});

test("Blizzard Overture event rows obey includeSetEffects false", () => {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "bow_c_t1_nomal_001");
  for (const [slotId, itemId] of [
    ["head", "head_aa_S1_plate_002"],
    ["chest", "chest_aa_S1_plate_002"],
    ["hands", "hands_aa_S1_plate_002"],
    ["legs", "legs_aa_S1_plate_002"],
  ]) equip(build, slotId, itemId);
  const eventScenario = scenario(build, activation("bow", ["mobility"]));
  const persistent = core.calculateBuild(build, attributes);
  const included = core.calculateBuild(build, attributes, { scenario: eventScenario });
  const excluded = core.calculateBuild(build, attributes, { scenario: eventScenario, includeSetEffects: false });

  assert.equal(total(included, "attack_speed_modifier", true) - total(persistent, "attack_speed_modifier"), 1000);
  assert.equal(total(included, "double_damage_dealt_modifier", true) - total(persistent, "double_damage_dealt_modifier"), 1400);
  assert.equal(included.scenarioEffects.evaluatedRows.filter((row) => row.effectId === EVENT_EFFECT_IDS.BLIZZARD_OVERTURE_4).length, 2);
  assert.equal(excluded.scenarioEffects.status, "applied");
  assert.equal(excluded.scenarioEffects.evaluatedRows.filter((row) => row.effectId === EVENT_EFFECT_IDS.BLIZZARD_OVERTURE_4).length, 0);
});

test("event scenario output declares the current schema and ruleset", () => {
  const build = shadowBuild();
  const calculated = core.calculateBuild(build, attributes, {
    scenario: scenario(build, activation("bow", ["mobility"])),
  });
  assert.equal(calculated.scenarioEffects.schema, "tl-helper.build-scenario-effects");
  assert.equal(calculated.scenarioEffects.schemaVersion, 5);
  assert.deepEqual(calculated.scenarioEffects.ruleset, {
    id: SCENARIO_EFFECT_RULESET_ID,
    version: SCENARIO_EFFECT_RULESET_VERSION,
  });
  assert.equal(SCENARIO_EFFECT_RULESET_VERSION, 5);
  assert.deepEqual(calculated.scenarioEffects.dimensions.sourceEventHistory, activation("bow", ["mobility"]));
});

test("canonical cache identity includes event history and normalizes equivalent ordering", () => {
  const build = shadowBuild();
  const mobility = scenario(build, activation("bow", ["mobility"]));
  const movement = scenario(build, activation("bow", ["movement"]));
  const both = scenario(build, activation("bow", ["movement", "mobility"]));
  const reordered = structuredClone(both);
  reordered.participants.reverse();
  reordered.participants.find((row) => row.id === "source").eventHistory.events[0].categories.reverse();

  assert.notEqual(core.combatScenarioCacheKey(mobility), core.combatScenarioCacheKey(movement));
  assert.notEqual(core.combatScenarioCacheKey(mobility), core.combatScenarioCacheKey(both));
  assert.equal(core.combatScenarioCacheKey(both), core.combatScenarioCacheKey(reordered));
});

test("candidate rebinding preserves a valid generic event from the retained weapon", () => {
  const source = shadowBuild();
  const candidate = core.createInitialBuild();
  equip(candidate, "main_hand", "staff_c_t1_nomal_001");
  equip(candidate, "off_hand", "dagger_c_t1_nomal_001");
  candidate.skills = [{ skillId: EVENT_EFFECT_IDS.SHADOW_WALKER, level: 20, loadoutType: "passive" }];

  const original = scenario(source, activation("dagger", ["mobility"]));
  const rebound = core.bindCombatScenarioToBuild(original, candidate);
  const reboundSource = rebound.participants.find((row) => row.id === rebound.source.participantId);
  assert.deepEqual(reboundSource.equippedWeaponTypes, ["dagger", "staff"]);
  assert.deepEqual(reboundSource.eventHistory, activation("dagger", ["mobility"]));

  const calculated = core.calculateBuild(candidate, attributes, { scenario: rebound });
  assert.equal(calculated.scenarioEffects.status, "applied");
  assert.equal(calculated.scenarioEffects.appliedRows.filter((row) => row.effectId === EVENT_EFFECT_IDS.SHADOW_WALKER).length, 3);
});
