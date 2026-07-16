import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeSourceSocialControls,
  encodeSourceSocialControls,
  formatSourceSocial,
  scenarioSourceParty,
  scenarioSourceProximity,
  socialControlsFromSourceState,
  sourceSocialFromControls,
} from "../../web/tl-social-scenario-controls.js";

const full = (overrides = {}) => ({
  totalPartyMembersIncludingSelf: 6,
  otherPartyPlayersWithin4m: 2,
  additionalOtherPartyPlayersAbove4mThrough16m: 3,
  alliedNonpartyPlayersWithin4m: 1,
  ...overrides,
});

test("controls retain explicit zeroes and derive the 16m cumulative count", () => {
  assert.deepEqual(sourceSocialFromControls(full()), {
    sourceParty: { state: "observed", totalMembersIncludingSelf: 6 },
    sourceProximity: { state: "observed", counts: [
      { cohort: "allied_nonparty_player", comparator: "lte", radiusMeters: "4", count: 1 },
      { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "4", count: 2 },
      { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "16", count: 5 },
    ] },
  });
  const zeroes = sourceSocialFromControls(full({ totalPartyMembersIncludingSelf: 1, otherPartyPlayersWithin4m: 0, additionalOtherPartyPlayersAbove4mThrough16m: 0, alliedNonpartyPlayersWithin4m: 0 }));
  assert.deepEqual(zeroes.sourceProximity.counts.map((row) => row.count), [0, 0, 0]);
});

test("each blank remains independently unspecified in scenario conversion", () => {
  const totalOnly = sourceSocialFromControls({ totalPartyMembersIncludingSelf: 3 });
  assert.equal(totalOnly.sourceParty.state, "observed");
  assert.equal(totalOnly.sourceProximity.state, "unspecified");

  const party4Only = sourceSocialFromControls({ otherPartyPlayersWithin4m: 1 });
  assert.deepEqual(party4Only.sourceProximity.counts, [
    { cohort: "same_party_player_other", comparator: "lte", radiusMeters: "4", count: 1 },
  ]);
  assert.throws(
    () => sourceSocialFromControls({ additionalOtherPartyPlayersAbove4mThrough16m: 2 }),
    /within 4m must be observed/,
  );
  assert.deepEqual(sourceSocialFromControls({ alliedNonpartyPlayersWithin4m: 0 }).sourceProximity.counts, [
    { cohort: "allied_nonparty_player", comparator: "lte", radiusMeters: "4", count: 0 },
  ]);
});

test("invalid and internally impossible observations are rejected instead of becoming unknown", () => {
  for (const input of [
    { totalPartyMembersIncludingSelf: 0 },
    { totalPartyMembersIncludingSelf: 7 },
    { otherPartyPlayersWithin4m: -1 },
    { otherPartyPlayersWithin4m: 1.5 },
    { otherPartyPlayersWithin4m: 6 },
    { additionalOtherPartyPlayersAbove4mThrough16m: 0 },
    { totalPartyMembersIncludingSelf: 2, otherPartyPlayersWithin4m: 2 },
    { totalPartyMembersIncludingSelf: 2, additionalOtherPartyPlayersAbove4mThrough16m: 2 },
    { totalPartyMembersIncludingSelf: 3, otherPartyPlayersWithin4m: 1, additionalOtherPartyPlayersAbove4mThrough16m: 2 },
    { otherPartyPlayersWithin4m: 3, additionalOtherPartyPlayersAbove4mThrough16m: 3 },
    { alliedNonpartyPlayersWithin4m: -1 },
  ]) assert.throws(() => sourceSocialFromControls(input), RangeError);
});

test("raw encoding preserves independent blanks and explicit zeroes", () => {
  for (const input of [
    {},
    { totalPartyMembersIncludingSelf: 3 },
    { otherPartyPlayersWithin4m: 0, alliedNonpartyPlayersWithin4m: 0 },
    { otherPartyPlayersWithin4m: "", additionalOtherPartyPlayersAbove4mThrough16m: 0 },
    { otherPartyPlayersWithin4m: "", additionalOtherPartyPlayersAbove4mThrough16m: 2 },
    full(),
  ]) {
    const decoded = decodeSourceSocialControls(encodeSourceSocialControls(input));
    for (const key of ["totalPartyMembersIncludingSelf", "otherPartyPlayersWithin4m", "additionalOtherPartyPlayersAbove4mThrough16m", "alliedNonpartyPlayersWithin4m"]) {
      assert.equal(decoded[key], input[key] === undefined ? "" : Number(input[key]) || (input[key] === 0 ? 0 : ""));
    }
  }
  assert.equal(encodeSourceSocialControls({}), "p:~:~:~:~");
  assert.equal(encodeSourceSocialControls({ otherPartyPlayersWithin4m: "", additionalOtherPartyPlayersAbove4mThrough16m: 0 }), "p:~:~:0:~");
  assert.equal(encodeSourceSocialControls({ alliedNonpartyPlayersWithin4m: 0 }), "p:~:~:~:0");
  assert.equal(decodeSourceSocialControls("bad").mode, "unspecified");
  assert.equal(decodeSourceSocialControls("p:3:garbage:~:0").mode, "unspecified");
  assert.equal(decodeSourceSocialControls("p:7:~:~:0").mode, "unspecified");
});

test("source lookup and formatting use canonical participant social state", () => {
  const options = sourceSocialFromControls(full());
  const social = { party: options.sourceParty, proximity: options.sourceProximity };
  const scenario = { source: { participantId: "source" }, participants: [{ id: "target" }, { id: "source", ...social }] };
  assert.equal(scenarioSourceParty(scenario), social.party);
  assert.equal(scenarioSourceProximity(scenario), social.proximity);
  assert.equal(formatSourceSocial(social), "6-member party, 2 other party within 4m, 3 additional other party from above 4m through 16m, 1 allied nonparty within 4m");
  assert.equal(socialControlsFromSourceState(social).mode, "specified");
});
