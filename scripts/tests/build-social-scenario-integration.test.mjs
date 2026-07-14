import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as core from "../../web/tl-core.js";
import {
  COMBAT_SANCTUARY_ACCURACY_RAW_PER_MEMBER,
  COMBAT_SANCTUARY_ATTACK_RANGE_RAW_PER_MEMBER,
  DISTORTED_SANCTUARY_ENDURANCE_RAW_PER_MEMBER,
} from "../../web/tl-distorted-sanctuary-data.js";
import { SOCIAL_EFFECT_IDS } from "../../web/tl-social-scenario-effects.js";
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

function socialScenario(build, {
  totalPartyMembersIncludingSelf,
  otherPartyPlayersWithin4m,
  otherPartyPlayersWithin16m,
  alliedNonpartyPlayersWithin4m,
} = {}) {
  const counts = [];
  if (otherPartyPlayersWithin4m !== undefined) counts.push({
    cohort: "same_party_player_other", comparator: "lte", radiusMeters: "4", count: otherPartyPlayersWithin4m,
  });
  if (otherPartyPlayersWithin16m !== undefined) counts.push({
    cohort: "same_party_player_other", comparator: "lte", radiusMeters: "16", count: otherPartyPlayersWithin16m,
  });
  if (alliedNonpartyPlayersWithin4m !== undefined) counts.push({
    cohort: "allied_nonparty_player", comparator: "lte", radiusMeters: "4", count: alliedNonpartyPlayersWithin4m,
  });
  return core.createBuildScenario(build, {
    targetDistanceMeters: 2,
    sourceParty: totalPartyMembersIncludingSelf === undefined
      ? { state: "unspecified" }
      : { state: "observed", totalMembersIncludingSelf: totalPartyMembersIncludingSelf },
    sourceProximity: counts.length ? { state: "observed", counts } : { state: "unspecified" },
  });
}

function total(calculation, statId, scenarioState = false) {
  const rows = scenarioState ? calculation.scenarioStats : calculation.stats;
  return rows.find((row) => row.id === statId)?.total ?? 0;
}

function sanctuaryBuild(level, combatSanctuary = false) {
  const build = core.createInitialBuild();
  equip(build, "main_hand", "bow_c_t1_nomal_001");
  build.skills = [{ skillId: SOCIAL_EFFECT_IDS.DISTORTED_SANCTUARY, level, loadoutType: "passive" }];
  if (combatSanctuary) build.masteries = { [SOCIAL_EFFECT_IDS.COMBAT_SANCTUARY]: { level: 1 } };
  return build;
}

test("Distorted Sanctuary combines its static source baseline with only the observed nearby-party remainder", () => {
  for (const level of [1, 10, 20]) {
    const build = sanctuaryBuild(level);
    const persistent = core.calculateBuild(build, attributes);
    const scenario = socialScenario(build, {
      totalPartyMembersIncludingSelf: 4,
      otherPartyPlayersWithin4m: 1,
      otherPartyPlayersWithin16m: 3,
      alliedNonpartyPlayersWithin4m: 2,
    });
    const calculated = core.calculateBuild(build, attributes, { scenario });
    const perMember = DISTORTED_SANCTUARY_ENDURANCE_RAW_PER_MEMBER[level - 1];

    assert.equal(calculated.scenarioEffects.status, "applied");
    assert.equal(total(calculated, "all_critical_defense", true) - total(persistent, "all_critical_defense"), perMember * 3);
    assert.equal(total(calculated, "continuous_heal_modifier", true) - total(persistent, "continuous_heal_modifier"), perMember * 3);
    assert.equal(calculated.scenarioEffects.appliedRows.filter((row) => row.effectId === SOCIAL_EFFECT_IDS.DISTORTED_SANCTUARY).length, 2);
  }
});

test("Combat Sanctuary uses the decoded level curve for both its static source and social remainder", () => {
  for (const level of [1, 10, 20]) {
    const build = sanctuaryBuild(level, true);
    const persistent = core.calculateBuild(build, attributes);
    const calculated = core.calculateBuild(build, attributes, {
      scenario: socialScenario(build, {
        totalPartyMembersIncludingSelf: 3,
        otherPartyPlayersWithin16m: 2,
      }),
    });
    const accuracy = COMBAT_SANCTUARY_ACCURACY_RAW_PER_MEMBER[level - 1];
    const range = COMBAT_SANCTUARY_ATTACK_RANGE_RAW_PER_MEMBER[level - 1];

    assert.equal(total(persistent, "all_accuracy"), accuracy);
    assert.equal(total(persistent, "attack_range_modifier"), range);
    assert.equal(total(calculated, "all_accuracy", true) - total(persistent, "all_accuracy"), accuracy * 2);
    assert.equal(total(calculated, "attack_range_modifier", true) - total(persistent, "attack_range_modifier"), range * 2);
    assert.equal(total(calculated, "all_critical_defense", true), total(persistent, "all_critical_defense"));
  }
});

test("Shielded by Unity is sourced only from selected unified mastery and caps three observed allied players", () => {
  const build = core.createInitialBuild();
  build.unifiedMasteries = [SOCIAL_EFFECT_IDS.SHIELDED_BY_UNITY];
  build.overallMasteryLevel = core.indexes.masteryById[SOCIAL_EFFECT_IDS.SHIELDED_BY_UNITY].requiredLevel;
  const activeSources = core.activeScenarioSources(build);
  assert.deepEqual(activeSources.masteryIds, []);
  assert.deepEqual(activeSources.unifiedMasteryIds, [SOCIAL_EFFECT_IDS.SHIELDED_BY_UNITY]);

  for (const [party4, nonparty4, expected] of [[0, 0, 0], [1, 0, 500], [1, 1, 1000], [2, 5, 1500]]) {
    const calculated = core.calculateBuild(build, attributes, {
      scenario: socialScenario(build, {
        totalPartyMembersIncludingSelf: party4 + 1,
        otherPartyPlayersWithin4m: party4,
        alliedNonpartyPlayersWithin4m: nonparty4,
      }),
    });
    assert.equal(calculated.scenarioEffects.status, "applied");
    assert.equal(total(calculated, "shield_taken_modifier", true) - total(calculated, "shield_taken_modifier"), expected);
  }

  const locked = core.deepClone(build);
  locked.overallMasteryLevel -= 1;
  assert.deepEqual(core.activeScenarioSources(locked).unifiedMasteryIds, []);
  const lockedCalculation = core.calculateBuild(locked, attributes, {
    scenario: socialScenario(locked, {
      totalPartyMembersIncludingSelf: 2,
      otherPartyPlayersWithin4m: 1,
      alliedNonpartyPlayersWithin4m: 0,
    }),
  });
  assert.ok(lockedCalculation.status.invalidIssues.some((issue) => issue.code === "unified_mastery_level_missing"));
  assert.equal(lockedCalculation.scenarioEffects.evaluatedRows.some((row) => row.effectId === SOCIAL_EFFECT_IDS.SHIELDED_BY_UNITY), false);
  assert.equal(total(lockedCalculation, "shield_taken_modifier", true) - total(lockedCalculation, "shield_taken_modifier"), 0);
});

test("a relevant social source with missing required observations fails the complete overlay closed", () => {
  const build = sanctuaryBuild(20);
  const calculated = core.calculateBuild(build, attributes, {
    scenario: socialScenario(build, {}),
  });
  assert.equal(calculated.scenarioEffects.status, "unsupported");
  assert.deepEqual(calculated.scenarioEffects.appliedRows, []);
  assert.equal(calculated.scenarioStats, calculated.stats);
  assert.ok(calculated.scenarioEffects.errors.some((row) => (
    row.family === "source_party_proximity" && row.code === "insufficient_party_state"
  )));
});

test("social facts participate in canonical cache identity and survive candidate rebinding", () => {
  const source = sanctuaryBuild(20);
  const near = socialScenario(source, {
    totalPartyMembersIncludingSelf: 2,
    otherPartyPlayersWithin4m: 1,
    otherPartyPlayersWithin16m: 1,
    alliedNonpartyPlayersWithin4m: 0,
  });
  const far = socialScenario(source, {
    totalPartyMembersIncludingSelf: 2,
    otherPartyPlayersWithin4m: 0,
    otherPartyPlayersWithin16m: 1,
    alliedNonpartyPlayersWithin4m: 0,
  });
  assert.notEqual(core.combatScenarioCacheKey(near), core.combatScenarioCacheKey(far));

  const candidate = sanctuaryBuild(20);
  equip(candidate, "off_hand", "dagger_c_t1_nomal_001");
  const rebound = core.bindCombatScenarioToBuild(near, candidate);
  const sourceParticipant = rebound.participants.find((row) => row.id === rebound.source.participantId);
  assert.deepEqual(sourceParticipant.party, { state: "observed", totalMembersIncludingSelf: 2 });
  assert.equal(sourceParticipant.proximity.counts.find((row) => row.radiusMeters === "16").count, 1);
  assert.deepEqual(sourceParticipant.equippedWeaponTypes, ["bow", "dagger"]);
});
