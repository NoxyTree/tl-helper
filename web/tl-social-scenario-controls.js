// Partial-observation controls for reviewed source party/proximity effects.
// Blank means unknown. Explicit zero is retained as observed zero.

export const SOCIAL_CONTROL_MODE = Object.freeze({
  UNSPECIFIED: "unspecified",
  PARTIAL: "partial",
  SPECIFIED: "specified",
});

const SAME_PARTY = "same_party_player_other";
const ALLIED_NONPARTY = "allied_nonparty_player";
const BLANK = "";

const isBlank = (value) => value === undefined || value === null || value === "";

function optionalCount(value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (isBlank(value)) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : undefined;
}

function strictOptionalCount(value, label, bounds = {}) {
  if (isBlank(value)) return undefined;
  const number = optionalCount(value, bounds);
  if (number === undefined) throw new RangeError(`${label} must be a whole number in the supported range, or blank.`);
  return number;
}

function unspecifiedParty() {
  return { state: "unspecified" };
}

function unspecifiedProximity() {
  return { state: "unspecified" };
}

/** Convert independent controls into the v5 participant party/proximity unions. */
export function sourceSocialFromControls(input = {}) {
  const total = strictOptionalCount(input.totalPartyMembersIncludingSelf, "Total party members including self", { minimum: 1, maximum: 6 });
  const party4 = strictOptionalCount(input.otherPartyPlayersWithin4m, "Other party players within 4m", { maximum: 5 });
  const additional4To16 = strictOptionalCount(input.additionalOtherPartyPlayersAbove4mThrough16m, "Additional other party players from above 4m through 16m", { maximum: 5 });
  const alliedNonparty4 = strictOptionalCount(input.alliedNonpartyPlayersWithin4m, "Allied nonparty players within 4m");

  if (total !== undefined && party4 !== undefined && party4 > total - 1) {
    throw new RangeError("Other party players within 4m cannot exceed the total party size minus the source.");
  }
  if (total !== undefined && additional4To16 !== undefined && additional4To16 > total - 1) {
    throw new RangeError("Additional other party players through 16m cannot exceed the total party size minus the source.");
  }
  if (additional4To16 !== undefined && party4 === undefined) {
    throw new RangeError("Other party players within 4m must be observed before an additional 4m-through-16m count can be calculated.");
  }
  let party16;
  if (party4 !== undefined && additional4To16 !== undefined) {
    const cumulative = party4 + additional4To16;
    if (cumulative > 5 || (total !== undefined && cumulative > total - 1)) {
      throw new RangeError("Other party players within 16m cannot exceed five or the total party size minus the source.");
    }
    party16 = cumulative;
  }

  const counts = [];
  if (alliedNonparty4 !== undefined) counts.push({
    cohort: ALLIED_NONPARTY, comparator: "lte", radiusMeters: "4", count: alliedNonparty4,
  });
  if (party4 !== undefined) counts.push({
    cohort: SAME_PARTY, comparator: "lte", radiusMeters: "4", count: party4,
  });
  if (party16 !== undefined) counts.push({
    cohort: SAME_PARTY, comparator: "lte", radiusMeters: "16", count: party16,
  });

  return {
    sourceParty: total === undefined
      ? unspecifiedParty()
      : { state: "observed", totalMembersIncludingSelf: total },
    sourceProximity: counts.length
      ? { state: "observed", counts }
      : unspecifiedProximity(),
  };
}

/** Recover independent controls. Missing rows remain blank rather than zero. */
export function socialControlsFromSourceState(sourceState = {}, proximityArgument) {
  const party = sourceState?.party ?? sourceState;
  const proximity = sourceState?.proximity ?? proximityArgument;
  const counts = proximity?.state === "observed" && Array.isArray(proximity.counts) ? proximity.counts : [];
  const count = (cohort, radiusMeters) => counts.find((row) => (
    row?.cohort === cohort && row.comparator === "lte" && row.radiusMeters === radiusMeters
  ))?.count;
  const party4 = count(SAME_PARTY, "4");
  const party16 = count(SAME_PARTY, "16");
  const alliedNonparty4 = count(ALLIED_NONPARTY, "4");
  const total = party?.state === "observed" ? party.totalMembersIncludingSelf : undefined;
  const additional4To16 = Number.isSafeInteger(party4) && Number.isSafeInteger(party16) && party16 >= party4
    ? party16 - party4
    : undefined;
  const observed = [total, party4, additional4To16, alliedNonparty4].filter((value) => value !== undefined).length;
  return {
    mode: observed === 0 ? SOCIAL_CONTROL_MODE.UNSPECIFIED : observed === 4 ? SOCIAL_CONTROL_MODE.SPECIFIED : SOCIAL_CONTROL_MODE.PARTIAL,
    totalPartyMembersIncludingSelf: total ?? BLANK,
    otherPartyPlayersWithin4m: party4 ?? BLANK,
    additionalOtherPartyPlayersAbove4mThrough16m: additional4To16 ?? BLANK,
    alliedNonpartyPlayersWithin4m: alliedNonparty4 ?? BLANK,
  };
}

export function scenarioSourceParty(scenario) {
  const sourceId = scenario?.source?.participantId;
  return scenario?.participants?.find((row) => row?.id === sourceId)?.party ?? unspecifiedParty();
}

export function scenarioSourceProximity(scenario) {
  const sourceId = scenario?.source?.participantId;
  return scenario?.participants?.find((row) => row?.id === sourceId)?.proximity ?? unspecifiedProximity();
}

export function formatSourceSocial(sourceState, proximityArgument) {
  const controls = socialControlsFromSourceState(sourceState, proximityArgument);
  if (controls.mode === SOCIAL_CONTROL_MODE.UNSPECIFIED) return "nearby allies unspecified";
  const parts = [];
  if (controls.totalPartyMembersIncludingSelf !== BLANK) {
    parts.push(controls.totalPartyMembersIncludingSelf === 1 ? "solo party" : `${controls.totalPartyMembersIncludingSelf}-member party`);
  }
  if (controls.otherPartyPlayersWithin4m !== BLANK) parts.push(`${controls.otherPartyPlayersWithin4m} other party within 4m`);
  if (controls.additionalOtherPartyPlayersAbove4mThrough16m !== BLANK) {
    parts.push(`${controls.additionalOtherPartyPlayersAbove4mThrough16m} additional other party from above 4m through 16m`);
  }
  if (controls.alliedNonpartyPlayersWithin4m !== BLANK) parts.push(`${controls.alliedNonpartyPlayersWithin4m} allied nonparty within 4m`);
  return parts.join(", ");
}

const encoded = (value) => value === BLANK ? "~" : String(value);
const decoded = (value) => value === "~" ? BLANK : Number(value);

function normalizedRawControls(input = {}) {
  const total = optionalCount(input.totalPartyMembersIncludingSelf, { minimum: 1, maximum: 6 });
  const party4 = optionalCount(input.otherPartyPlayersWithin4m, { maximum: 5 });
  const additional = optionalCount(input.additionalOtherPartyPlayersAbove4mThrough16m, { maximum: 5 });
  const nonparty4 = optionalCount(input.alliedNonpartyPlayersWithin4m);
  const observed = [total, party4, additional, nonparty4].filter((value) => value !== undefined).length;
  return {
    mode: observed === 0 ? SOCIAL_CONTROL_MODE.UNSPECIFIED : observed === 4 ? SOCIAL_CONTROL_MODE.SPECIFIED : SOCIAL_CONTROL_MODE.PARTIAL,
    totalPartyMembersIncludingSelf: total ?? BLANK,
    otherPartyPlayersWithin4m: party4 ?? BLANK,
    additionalOtherPartyPlayersAbove4mThrough16m: additional ?? BLANK,
    alliedNonpartyPlayersWithin4m: nonparty4 ?? BLANK,
  };
}

export function encodeSourceSocialControls(input) {
  const controls = normalizedRawControls(input);
  return `p:${encoded(controls.totalPartyMembersIncludingSelf)}:${encoded(controls.otherPartyPlayersWithin4m)}:${encoded(controls.additionalOtherPartyPlayersAbove4mThrough16m)}:${encoded(controls.alliedNonpartyPlayersWithin4m)}`;
}

export function decodeSourceSocialControls(value) {
  const parts = String(value ?? "").split(":");
  if (parts.length !== 5 || parts[0] !== "p" || !parts.slice(1).every((part) => part === "~" || /^(0|[1-9]\d*)$/.test(part))) {
    return normalizedRawControls();
  }
  const [, total, party4, additional, nonparty4] = parts;
  const normalized = normalizedRawControls({
    totalPartyMembersIncludingSelf: decoded(total),
    otherPartyPlayersWithin4m: decoded(party4),
    additionalOtherPartyPlayersAbove4mThrough16m: decoded(additional),
    alliedNonpartyPlayersWithin4m: decoded(nonparty4),
  });
  const keys = [
    "totalPartyMembersIncludingSelf",
    "otherPartyPlayersWithin4m",
    "additionalOtherPartyPlayersAbove4mThrough16m",
    "alliedNonpartyPlayersWithin4m",
  ];
  if (parts.slice(1).some((part, index) => part !== "~" && normalized[keys[index]] === BLANK)) return normalizedRawControls();
  return normalized;
}

export const socialStateFromControls = sourceSocialFromControls;
export const socialControlsFromState = socialControlsFromSourceState;
export const formatSocialState = formatSourceSocial;
export const encodeSocialControls = encodeSourceSocialControls;
export const decodeSocialControls = decodeSourceSocialControls;
