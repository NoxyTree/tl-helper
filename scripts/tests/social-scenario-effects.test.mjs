import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  COMBAT_SANCTUARY_ACCURACY_RAW_PER_MEMBER,
  COMBAT_SANCTUARY_ATTACK_RANGE_RAW_PER_MEMBER,
  DISTORTED_SANCTUARY_ENDURANCE_RAW_PER_MEMBER,
  DISTORTED_SANCTUARY_HEAL_OVER_TIME_RAW_PER_MEMBER,
} from "../../web/tl-distorted-sanctuary-data.js";
import {
  SOCIAL_EFFECT_IDS,
  evaluateSocialScenarioEffects,
} from "../../web/tl-social-scenario-effects.js";

const evaluate = ({
  weapons = ["bow"],
  passives = [],
  masteryIds = [],
  unifiedMasteryIds = [],
  unifiedMasteries = [],
  totalParty = 1,
  party4 = 0,
  party16 = 0,
  nonparty4 = 0,
  participantSocial = null,
} = {}) => evaluateSocialScenarioEffects({
  activeSources: { equippedWeaponTypes: weapons, passiveSkills: passives, masteryIds, unifiedMasteryIds, unifiedMasteries },
  scenario: participantSocial ?? {
    sourceParty: { state: "observed", totalMembersIncludingSelf: totalParty },
    sourceProximity: { state: "observed", counts: [
          { cohort: "allied_nonparty_player", comparator: "lte", radiusMeters: "4", count: nonparty4 },
          { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "4", count: party4 },
          { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "16", count: party16 },
    ] },
  },
});

const passive = (level) => [{ id: SOCIAL_EFFECT_IDS.DISTORTED_SANCTUARY, level, selected: true }];
const row = (result, statId) => result.overlayRows.find((entry) => entry.statId === statId);
const sha256 = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("decoded build-24118850 social curves remain independently fingerprinted", () => {
  assert.equal(sha256(DISTORTED_SANCTUARY_ENDURANCE_RAW_PER_MEMBER), "ae7669367540ff11da19d7ef1d933fe0062ee0f475910c9d7bc01a8eb69db44d");
  assert.equal(sha256(DISTORTED_SANCTUARY_HEAL_OVER_TIME_RAW_PER_MEMBER), "ae7669367540ff11da19d7ef1d933fe0062ee0f475910c9d7bc01a8eb69db44d");
  assert.equal(sha256(COMBAT_SANCTUARY_ACCURACY_RAW_PER_MEMBER), "2c34271eb31f3c37e12f0aea01d764eb28e3d01d4f21c89e5cb1e41ae70d6c7d");
  assert.equal(sha256(COMBAT_SANCTUARY_ATTACK_RANGE_RAW_PER_MEMBER), "32dd98ec2d48886d51d56a4fed4708925c79aa5353512dcb3d01e3d4ed6e4b12");
});

test("Distorted Sanctuary adds only the other-member remainder at all 20 levels", () => {
  for (let level = 1; level <= 20; level += 1) {
    const result = evaluate({ passives: passive(level), totalParty: 6, party16: 5 });
    assert.deepEqual(result.errors, []);
    assert.equal(row(result, "all_critical_defense").rawValue, DISTORTED_SANCTUARY_ENDURANCE_RAW_PER_MEMBER[level - 1] * 5);
    assert.equal(row(result, "continuous_heal_modifier").rawValue, DISTORTED_SANCTUARY_ENDURANCE_RAW_PER_MEMBER[level - 1] * 5);
    assert.equal(row(result, "all_critical_defense").calculation.sourceIncludedInStaticBaseline, true);
    assert.equal(row(result, "all_critical_defense").precision.persistentBaseline, "one_member_owned_by_static_calculator");
  }
  const solo = evaluate({ passives: passive(20) });
  assert.equal(solo.overlayRows.length, 0);
  assert.equal(solo.trace[0].code, "static_one_member_baseline_only");
});

test("Combat Sanctuary replaces the remainder stats with exact level-scaled Accuracy and Range", () => {
  for (let level = 1; level <= 20; level += 1) {
    const result = evaluate({
      passives: passive(level), masteryIds: [SOCIAL_EFFECT_IDS.COMBAT_SANCTUARY], totalParty: 3, party16: 2,
    });
    assert.deepEqual(result.errors, []);
    assert.equal(row(result, "all_accuracy").rawValue, COMBAT_SANCTUARY_ACCURACY_RAW_PER_MEMBER[level - 1] * 2);
    assert.equal(row(result, "attack_range_modifier").rawValue, COMBAT_SANCTUARY_ATTACK_RANGE_RAW_PER_MEMBER[level - 1] * 2);
    assert.equal(row(result, "all_critical_defense"), undefined);
    assert.equal(row(result, "continuous_heal_modifier"), undefined);
    assert.deepEqual(row(result, "all_accuracy").sourceKinds, ["selected_passive", "mastery_replacement"]);
  }
});

test("Shielded by Unity uses exact 0, 1, 2, and capped 3-or-more bands", () => {
  const unifiedMasteryIds = [SOCIAL_EFFECT_IDS.SHIELDED_BY_UNITY];
  for (const [party4, nonparty4, expected] of [[0, 0, 0], [1, 0, 500], [1, 1, 1000], [2, 5, 1500]]) {
    const result = evaluate({ weapons: [], unifiedMasteryIds, totalParty: Math.max(1, party4 + 1), party4, party16: party4, nonparty4 });
    assert.deepEqual(result.errors, []);
    assert.equal(row(result, "shield_taken_modifier")?.rawValue ?? 0, expected);
    if (expected) assert.equal(Object.hasOwn(row(result, "shield_taken_modifier").precision, "persistentBaseline"), false);
  }
  const smuggled = evaluate({ weapons: [], masteryIds: [SOCIAL_EFFECT_IDS.SHIELDED_BY_UNITY], party4: 2, party16: 2, nonparty4: 2 });
  assert.equal(smuggled.overlayRows.length, 0);
  const objectSource = evaluate({ weapons: [], unifiedMasteries: [{ id: SOCIAL_EFFECT_IDS.SHIELDED_BY_UNITY, level: 1, selected: true }], totalParty: 2, party4: 1, party16: 1 });
  assert.equal(row(objectSource, "shield_taken_modifier").rawValue, 500);
});

test("the social family fails closed atomically for missing facts, invalid counts, and foreign passives", () => {
  const sources = { passives: passive(20), unifiedMasteryIds: [SOCIAL_EFFECT_IDS.SHIELDED_BY_UNITY], totalParty: 3, party4: 1, party16: 2, nonparty4: 1 };
  const unspecified = evaluate({ ...sources, participantSocial: { sourceParty: { state: "unspecified" }, sourceProximity: { state: "unspecified" } } });
  assert.equal(unspecified.overlayRows.length, 0);
  assert.equal(unspecified.errors[0].code, "insufficient_party_state");

  const invalid = evaluate({ ...sources, participantSocial: {
    sourceParty: { state: "observed", totalMembersIncludingSelf: 2 },
    sourceProximity: { state: "observed", counts: [
      { cohort: "allied_nonparty_player", comparator: "lte", radiusMeters: "4", count: 0 },
      { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "4", count: 0 },
      { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "16", count: 2 },
    ] },
  } });
  assert.equal(invalid.overlayRows.length, 0);
  assert.equal(invalid.errors[0].code, "invalid_proximity_state");

  const foreign = evaluate({ ...sources, weapons: ["dagger"] });
  assert.equal(foreign.overlayRows.length, 0);
  assert.equal(foreign.errors[0].code, "foreign_weapon_passive");
});

test("the direct evaluator rejects malformed and smuggled social unions", () => {
  const sources = { passives: passive(20), totalParty: 2, party16: 1 };
  const invalidStates = [
    {
      sourceParty: { state: "bogus" },
      sourceProximity: { state: "observed", counts: [
        { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "16", count: 1 },
      ] },
    },
    {
      sourceParty: { state: "unspecified", totalMembersIncludingSelf: 2 },
      sourceProximity: { state: "observed", counts: [
        { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "16", count: 1 },
      ] },
    },
    {
      sourceParty: { state: "observed", totalMembersIncludingSelf: 2 },
      sourceProximity: { state: "unspecified", counts: [
        { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "16", count: 1 },
      ] },
    },
    {
      sourceParty: { state: "observed", totalMembersIncludingSelf: 2 },
      sourceProximity: { state: "bogus", counts: [
        { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "16", count: 1 },
      ] },
    },
    {
      sourceParty: { state: "observed", totalMembersIncludingSelf: 2 },
      sourceProximity: { state: "observed", counts: [
        { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "16", count: "1" },
      ] },
    },
  ];
  for (const participantSocial of invalidStates) {
    const result = evaluate({ ...sources, participantSocial });
    assert.equal(result.overlayRows.length, 0);
    assert.ok(result.errors.some(({ code }) => code === "invalid_party_state" || code === "invalid_proximity_state"));
  }

  const duplicate = evaluate({ ...sources, participantSocial: {
    sourceParty: { state: "observed", totalMembersIncludingSelf: 2 },
    sourceProximity: { state: "observed", counts: [
      { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "16", count: 1 },
      { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "16", count: 1 },
    ] },
  } });
  assert.equal(duplicate.overlayRows.length, 0);
  assert.equal(duplicate.errors[0].code, "invalid_proximity_state");

  for (const counts of [
    [
      { cohort: "allied_nonparty_player", comparator: "lte", radiusMeters: "4", count: 2 },
      { cohort: "allied_nonparty_player", comparator: "lte", radiusMeters: "16", count: 1 },
      { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "16", count: 1 },
    ],
    [
      { cohort: "allied_nonparty_player", comparator: "lt", radiusMeters: "4", count: 2 },
      { cohort: "allied_nonparty_player", comparator: "lte", radiusMeters: "4", count: 1 },
      { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "16", count: 1 },
    ],
    [
      { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "16", count: 1, extra: true },
    ],
  ]) {
    const result = evaluate({ ...sources, participantSocial: {
      sourceParty: { state: "observed", totalMembersIncludingSelf: 2 },
      sourceProximity: { state: "observed", counts },
    } });
    assert.equal(result.overlayRows.length, 0);
    assert.equal(result.errors[0].code, "invalid_proximity_state");
  }
});

test("the direct evaluator rejects custom-prototype social records", () => {
  const sources = { passives: passive(20), totalParty: 2, party16: 1 };
  const validParty = { state: "observed", totalMembersIncludingSelf: 2 };
  const validRow = { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "16", count: 1 };
  const validProximity = { state: "observed", counts: [validRow] };
  const custom = (value) => Object.assign(Object.create({ inherited: true }), value);

  for (const participantSocial of [
    { sourceParty: custom(validParty), sourceProximity: validProximity },
    { sourceParty: validParty, sourceProximity: custom(validProximity) },
    { sourceParty: validParty, sourceProximity: { state: "observed", counts: [custom(validRow)] } },
  ]) {
    const result = evaluate({ ...sources, participantSocial });
    assert.equal(result.overlayRows.length, 0);
    assert.ok(result.errors.some(({ code }) => code === "invalid_party_state" || code === "invalid_proximity_state"));
  }
});

test("duplicates deduplicate, conflicting levels fail closed, and irrelevant sources need no social facts", () => {
  const duplicate = evaluate({ passives: [...passive(5), ...passive(5)], totalParty: 2, party16: 1 });
  assert.deepEqual(duplicate.errors, []);
  assert.equal(row(duplicate, "all_critical_defense").rawValue, DISTORTED_SANCTUARY_ENDURANCE_RAW_PER_MEMBER[4]);
  assert.ok(duplicate.trace.some((entry) => entry.code === "source_deduplicated"));

  const conflict = evaluate({ passives: [...passive(5), ...passive(6)], totalParty: 2, party16: 1 });
  assert.equal(conflict.overlayRows.length, 0);
  assert.equal(conflict.errors[0].code, "conflicting_source_levels");

  const irrelevant = evaluate({ participantSocial: { sourceParty: { state: "unspecified" }, sourceProximity: { state: "unspecified" } } });
  assert.deepEqual(irrelevant, { overlayRows: [], trace: [], errors: [] });
});

test("outputs and decoded data are immutable", () => {
  const result = evaluate({ passives: passive(20), unifiedMasteryIds: [SOCIAL_EFFECT_IDS.SHIELDED_BY_UNITY], totalParty: 2, party4: 1, party16: 1 });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.overlayRows));
  assert.ok(result.overlayRows.every(Object.isFrozen));
  assert.ok(Object.isFrozen(DISTORTED_SANCTUARY_ENDURANCE_RAW_PER_MEMBER));
});
