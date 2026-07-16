import {
  COMBAT_SANCTUARY_PROVENANCE,
  DISTORTED_SANCTUARY_GAME_BUILD,
  DISTORTED_SANCTUARY_IDS,
  DISTORTED_SANCTUARY_PROVENANCE,
  distortedSanctuaryPerMemberRows,
} from "./tl-distorted-sanctuary-data.js";
import {
  scenarioSourceParty,
  scenarioSourceProximity,
} from "./tl-social-scenario-controls.js";

export const SOCIAL_EFFECT_GAME_BUILD = DISTORTED_SANCTUARY_GAME_BUILD;

export const SOCIAL_EFFECT_IDS = Object.freeze({
  DISTORTED_SANCTUARY: DISTORTED_SANCTUARY_IDS.PASSIVE,
  COMBAT_SANCTUARY: DISTORTED_SANCTUARY_IDS.COMBAT_SANCTUARY,
  SHIELDED_BY_UNITY: "WM_Common_SKILL_020",
});

export const SOCIAL_EFFECT_DEFINITIONS = Object.freeze({
  [SOCIAL_EFFECT_IDS.DISTORTED_SANCTUARY]: Object.freeze({
    name: "Distorted Sanctuary",
    requiredWeapon: "bow",
    provenance: DISTORTED_SANCTUARY_PROVENANCE,
  }),
  [SOCIAL_EFFECT_IDS.COMBAT_SANCTUARY]: Object.freeze({
    name: "Combat Sanctuary",
    requiredEffectId: SOCIAL_EFFECT_IDS.DISTORTED_SANCTUARY,
    provenance: COMBAT_SANCTUARY_PROVENANCE,
  }),
  [SOCIAL_EFFECT_IDS.SHIELDED_BY_UNITY]: Object.freeze({
    name: "Shielded by Unity",
    provenance: Object.freeze({
      gameBuild: SOCIAL_EFFECT_GAME_BUILD,
      authority: "decoded_exact_threshold_count",
      recipientRule: "source_counts_allied_players_within_4m_excluding_source",
      formulaRowIds: Object.freeze([
        "WM_Common_FriendlyShieldUp_Buff_1",
        "WM_Common_FriendlyShieldUp_Buff_2",
        "WM_Common_FriendlyShieldUp_Buff_3",
      ]),
      effectRowId: "WM_Common_FriendlyShieldUp_TargetCounter",
      abnormalStateId: "abn_WM_Common_FriendlyShieldUp_TargetCounter_AdjustStat",
      stackCap: 1,
    }),
  }),
});

const PRECISION = Object.freeze({
  authority: "decoded_exact",
  arithmetic: "integer_raw_units",
  rounding: "none",
  staticTotalsMutated: false,
});
const DISTORTED_SANCTUARY_PRECISION = Object.freeze({
  ...PRECISION,
  persistentBaseline: "one_member_owned_by_static_calculator",
});

const error = (code, sourceId, message) => Object.freeze({ code, sourceId, message });
const trace = (code, sourceId, details = {}) => Object.freeze({ code, sourceId, ...details });

function normalizedWeapons(value) {
  return new Set(Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string").map((entry) => entry.toLowerCase())
    : []);
}

function selectedMasteryIds(value, allowedIds, traces) {
  const selected = new Set();
  for (const id of Array.isArray(value) ? value : []) {
    if (typeof id !== "string" || !allowedIds.has(id)) continue;
    if (selected.has(id)) traces.push(trace("source_deduplicated", id));
    selected.add(id);
  }
  return selected;
}

function selectedUnifiedMasteryIds(activeSources, traces) {
  const selected = selectedMasteryIds(
    activeSources?.unifiedMasteryIds,
    new Set([SOCIAL_EFFECT_IDS.SHIELDED_BY_UNITY]),
    traces,
  );
  for (const entry of Array.isArray(activeSources?.unifiedMasteries) ? activeSources.unifiedMasteries : []) {
    if (entry?.id !== SOCIAL_EFFECT_IDS.SHIELDED_BY_UNITY || entry.selected === false) continue;
    if (selected.has(entry.id)) traces.push(trace("source_deduplicated", entry.id));
    selected.add(entry.id);
  }
  return selected;
}

function distortedSelection(entries, traces, errors) {
  let selected = null;
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || entry.id !== SOCIAL_EFFECT_IDS.DISTORTED_SANCTUARY) continue;
    if (entry.selected !== true) {
      traces.push(trace("source_not_selected", entry.id));
      continue;
    }
    if (!Number.isInteger(entry.level) || entry.level < 1 || entry.level > 20) {
      errors.push(error("invalid_passive_level", entry.id, "Distorted Sanctuary level must be an integer from 1 through 20."));
      continue;
    }
    if (selected && selected.level !== entry.level) {
      selected = { conflicted: true };
      errors.push(error("conflicting_source_levels", entry.id, "Duplicate selected Distorted Sanctuary sources disagree on level."));
    } else if (selected) {
      traces.push(trace("source_deduplicated", entry.id));
    } else {
      selected = { level: entry.level };
    }
  }
  return selected;
}

function observedCount(proximity, cohort, radiusMeters) {
  if (proximity?.state !== "observed") return undefined;
  return proximity?.counts?.find((row) => (
    row?.cohort === cohort && row.comparator === "lte" && row.radiusMeters === radiusMeters
  ))?.count;
}

const PARTY_KEYS = Object.freeze({
  unspecified: Object.freeze(["state"]),
  observed: Object.freeze(["state", "totalMembersIncludingSelf"]),
});
const PROXIMITY_KEYS = Object.freeze({
  unspecified: Object.freeze(["state"]),
  observed: Object.freeze(["state", "counts"]),
});
const PROXIMITY_ROW_KEYS = Object.freeze(["cohort", "comparator", "radiusMeters", "count"]);
const PROXIMITY_COHORTS = new Set(["same_party_player_other", "allied_nonparty_player"]);
const PROXIMITY_COMPARATORS = new Set(["lt", "lte"]);
const CANONICAL_NONNEGATIVE_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/;

function isRecord(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function validPartyState(party) {
  if (!isRecord(party) || !Object.hasOwn(PARTY_KEYS, party.state)) return false;
  if (!hasExactKeys(party, PARTY_KEYS[party.state])) return false;
  return party.state === "unspecified" || (
    Number.isSafeInteger(party.totalMembersIncludingSelf)
    && party.totalMembersIncludingSelf >= 1
  );
}

function compareNonnegativeDecimals(left, right) {
  if (left === right) return 0;
  const [leftWhole, leftFraction = ""] = left.split(".");
  const [rightWhole, rightFraction = ""] = right.split(".");
  if (leftWhole.length !== rightWhole.length) return leftWhole.length - rightWhole.length;
  const wholeComparison = leftWhole < rightWhole ? -1 : leftWhole > rightWhole ? 1 : 0;
  if (wholeComparison) return wholeComparison;
  const fractionLength = Math.max(leftFraction.length, rightFraction.length);
  const normalizedLeft = leftFraction.padEnd(fractionLength, "0");
  const normalizedRight = rightFraction.padEnd(fractionLength, "0");
  return normalizedLeft < normalizedRight ? -1 : normalizedLeft > normalizedRight ? 1 : 0;
}

function validProximityState(proximity, party) {
  if (!isRecord(proximity) || !Object.hasOwn(PROXIMITY_KEYS, proximity.state)) return false;
  if (!hasExactKeys(proximity, PROXIMITY_KEYS[proximity.state])) return false;
  if (proximity.state === "unspecified") return true;
  if (!Array.isArray(proximity.counts)) return false;

  const keys = new Set();
  const rowsByCohort = new Map();
  const comparatorPairs = new Map();
  for (const row of proximity.counts) {
    if (!hasExactKeys(row, PROXIMITY_ROW_KEYS)
        || !PROXIMITY_COHORTS.has(row.cohort)
        || !PROXIMITY_COMPARATORS.has(row.comparator)
        || typeof row.radiusMeters !== "string"
        || !CANONICAL_NONNEGATIVE_DECIMAL.test(row.radiusMeters)
        || !Number.isSafeInteger(row.count)
        || row.count < 0) return false;
    const key = `${row.cohort}\u0000${row.comparator}\u0000${row.radiusMeters}`;
    if (keys.has(key)) return false;
    keys.add(key);
    if (party.state === "observed"
        && row.cohort === "same_party_player_other"
        && row.count > party.totalMembersIncludingSelf - 1) return false;
    const cohortRows = rowsByCohort.get(row.cohort) ?? [];
    cohortRows.push(row);
    rowsByCohort.set(row.cohort, cohortRows);
    const radiusKey = `${row.cohort}\u0000${row.radiusMeters}`;
    const pair = comparatorPairs.get(radiusKey) ?? {};
    pair[row.comparator] = row.count;
    comparatorPairs.set(radiusKey, pair);
  }
  for (const rows of rowsByCohort.values()) {
    for (const left of rows) {
      for (const right of rows) {
        if (compareNonnegativeDecimals(left.radiusMeters, right.radiusMeters) < 0 && left.count > right.count) return false;
      }
    }
  }
  for (const pair of comparatorPairs.values()) {
    if (pair.lt !== undefined && pair.lte !== undefined && pair.lt > pair.lte) return false;
  }
  return true;
}

function normalizedSocialFacts(scenario, needsDistorted, needsShielded, errors) {
  const party = scenario?.sourceParty ?? scenarioSourceParty(scenario);
  const proximity = scenario?.sourceProximity ?? scenarioSourceProximity(scenario);
  const facts = {};
  if (!validPartyState(party)) {
    errors.push(error("invalid_party_state", null, "Source party state must be unspecified or observed."));
  }
  if (validPartyState(party) && !validProximityState(proximity, party)) {
    errors.push(error("invalid_proximity_state", null, "Source proximity state must be unspecified or observed."));
  }
  if (errors.length) return null;
  if (needsDistorted) {
    facts.otherPartyPlayersWithin16m = observedCount(proximity, "same_party_player_other", "16");
    if (party?.state !== "observed" && facts.otherPartyPlayersWithin16m === undefined) {
      errors.push(error("insufficient_party_state", null, "Distorted Sanctuary requires an observed party or an explicit same-party-player count within 16m."));
    }
    if (!Number.isSafeInteger(facts.otherPartyPlayersWithin16m)
        || facts.otherPartyPlayersWithin16m < 0
        || facts.otherPartyPlayersWithin16m > 5) {
      errors.push(error("insufficient_party_proximity", null, "Distorted Sanctuary requires an explicit same-party-player count within 16m."));
    } else if (party?.state === "observed" && facts.otherPartyPlayersWithin16m > party.totalMembersIncludingSelf - 1) {
      errors.push(error("invalid_party_proximity", null, "The nearby other-party count cannot exceed the observed party total minus the source."));
    }
  }
  if (needsShielded) {
    facts.otherPartyPlayersWithin4m = observedCount(proximity, "same_party_player_other", "4");
    facts.alliedNonpartyPlayersWithin4m = observedCount(proximity, "allied_nonparty_player", "4");
    if (!Number.isSafeInteger(facts.otherPartyPlayersWithin4m)
        || facts.otherPartyPlayersWithin4m < 0
        || !Number.isSafeInteger(facts.alliedNonpartyPlayersWithin4m)
        || facts.alliedNonpartyPlayersWithin4m < 0) {
      errors.push(error("insufficient_allied_proximity", null, "Shielded by Unity requires explicit same-party and allied-nonparty player counts within 4m."));
    }
  }
  return errors.length ? null : Object.freeze({
    totalMembersIncludingSelf: party?.state === "observed" ? party.totalMembersIncludingSelf : null,
    ...facts,
  });
}

function overlayRow(effectId, sourceKinds, statId, rawValue, scenarioFacts, calculation, provenance) {
  return Object.freeze({
    effectId,
    effectName: SOCIAL_EFFECT_DEFINITIONS[effectId].name,
    sourceKinds: Object.freeze([...sourceKinds]),
    statId,
    operation: "add",
    rawValue,
    scope: "source_social_state",
    scenario: Object.freeze(scenarioFacts),
    calculation: Object.freeze(calculation),
    precision: effectId === SOCIAL_EFFECT_IDS.DISTORTED_SANCTUARY
      ? DISTORTED_SANCTUARY_PRECISION
      : PRECISION,
    provenance,
  });
}

/** Evaluate only decoded-exact, continuously active source social effects. */
export function evaluateSocialScenarioEffects({ activeSources = {}, scenario = {} } = {}) {
  const overlayRows = [];
  const traces = [];
  const errors = [];
  const weapons = normalizedWeapons(activeSources?.equippedWeaponTypes);
  const masteries = selectedMasteryIds(
    activeSources?.masteryIds,
    new Set([SOCIAL_EFFECT_IDS.COMBAT_SANCTUARY]),
    traces,
  );
  const unifiedMasteries = selectedUnifiedMasteryIds(activeSources, traces);
  const distorted = distortedSelection(activeSources?.passiveSkills, traces, errors);
  const shielded = unifiedMasteries.has(SOCIAL_EFFECT_IDS.SHIELDED_BY_UNITY);
  const combat = masteries.has(SOCIAL_EFFECT_IDS.COMBAT_SANCTUARY);
  const hasDistorted = distorted && !distorted.conflicted;

  if (hasDistorted && !weapons.has("bow")) {
    errors.push(error("foreign_weapon_passive", SOCIAL_EFFECT_IDS.DISTORTED_SANCTUARY, "Distorted Sanctuary requires an equipped bow."));
  }
  if (combat && !hasDistorted) {
    traces.push(trace("augmentation_source_absent", SOCIAL_EFFECT_IDS.COMBAT_SANCTUARY, {
      requiredEffectId: SOCIAL_EFFECT_IDS.DISTORTED_SANCTUARY,
    }));
  }

  const hasRelevantSource = hasDistorted || shielded;
  if (!hasRelevantSource) {
    return Object.freeze({ overlayRows: Object.freeze([]), trace: Object.freeze(traces), errors: Object.freeze(errors) });
  }
  const social = normalizedSocialFacts(scenario, hasDistorted, shielded, errors);
  if (errors.length || !social) {
    return Object.freeze({ overlayRows: Object.freeze([]), trace: Object.freeze(traces), errors: Object.freeze(errors) });
  }

  if (hasDistorted) {
    const perMemberRows = distortedSanctuaryPerMemberRows(distorted.level, combat);
    if (social.otherPartyPlayersWithin16m === 0) {
      traces.push(trace("static_one_member_baseline_only", SOCIAL_EFFECT_IDS.DISTORTED_SANCTUARY));
    } else {
      for (const row of perMemberRows) {
        overlayRows.push(overlayRow(
          SOCIAL_EFFECT_IDS.DISTORTED_SANCTUARY,
          ["selected_passive", ...(combat ? ["mastery_replacement"] : [])],
          row.statId,
          row.rawValue * social.otherPartyPlayersWithin16m,
          {
            totalMembersIncludingSelf: social.totalMembersIncludingSelf,
            cohort: "same_party_player_other",
            comparator: "lte",
            radiusMeters: "16",
            count: social.otherPartyPlayersWithin16m,
          },
          {
            formulaType: "cumulative_party_count_remainder",
            passiveLevel: distorted.level,
            perMemberRaw: row.rawValue,
            countedOtherPartyMembers: social.otherPartyPlayersWithin16m,
            sourceIncludedInStaticBaseline: true,
          },
          combat ? COMBAT_SANCTUARY_PROVENANCE : DISTORTED_SANCTUARY_PROVENANCE,
        ));
      }
    }
  }

  if (shielded) {
    const observedAllies = social.otherPartyPlayersWithin4m + social.alliedNonpartyPlayersWithin4m;
    const countedAllies = Math.min(3, observedAllies);
    if (countedAllies === 0) {
      traces.push(trace("threshold_count_zero", SOCIAL_EFFECT_IDS.SHIELDED_BY_UNITY));
    } else {
      overlayRows.push(overlayRow(
        SOCIAL_EFFECT_IDS.SHIELDED_BY_UNITY,
        ["selected_unified_mastery"],
        "shield_taken_modifier",
        countedAllies * 500,
        {
          totalMembersIncludingSelf: social.totalMembersIncludingSelf,
          cohort: "allied_player_combined",
          comparator: "lte",
          radiusMeters: "4",
          count: observedAllies,
          samePartyPlayerOtherCount: social.otherPartyPlayersWithin4m,
          alliedNonpartyPlayerCount: social.alliedNonpartyPlayersWithin4m,
        },
        {
          formulaType: "capped_allied_player_count",
          rawPerAlliedPlayer: 500,
          observedAlliedPlayers: observedAllies,
          countedAlliedPlayers: countedAllies,
          cappedAt: 3,
        },
        SOCIAL_EFFECT_DEFINITIONS[SOCIAL_EFFECT_IDS.SHIELDED_BY_UNITY].provenance,
      ));
    }
  }

  return Object.freeze({
    overlayRows: Object.freeze(overlayRows),
    trace: Object.freeze(traces),
    errors: Object.freeze(errors),
  });
}
