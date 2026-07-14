import {
  assertExpectedBuild,
  assertOnlyKeys,
  compareCodeUnits,
  deepFreeze,
  normalizeDecimal,
  requireBuild,
  requireEnum,
  requireId,
  requireNonnegativeInteger,
  requirePositiveInteger,
  requireRecord,
} from "./contract-primitives.mjs";

export const COMBAT_SCENARIO_SCHEMA = "tl-helper.combat-scenario";
export const COMBAT_SCENARIO_SCHEMA_VERSION = 5;

export const SCENARIO_RESOURCE = Object.freeze({
  HEALTH: "health",
  MANA: "mana",
});

export const SCENARIO_RESOURCE_BPS_SCALE = 10000;

export const SCENARIO_MOTION_STATE = Object.freeze({
  UNSPECIFIED: "unspecified",
  STATIONARY: "stationary",
  MOVING: "moving",
});

export const SCENARIO_STATIONARY_BAND = Object.freeze({
  UNDER_2S: "under_2s",
  TWO_TO_UNDER_3S: "2s_to_under_3s",
  THREE_TO_UNDER_4S: "3s_to_under_4s",
  FOUR_OR_MORE: "4s_or_more",
});

export const SCENARIO_MOVEMENT_KIND = Object.freeze({
  ORDINARY: "ordinary",
  MOVEMENT_SKILL: "movement_skill",
});

export const SCENARIO_MOVING_BAND = Object.freeze({
  UNDER_2S: "under_2s",
  TWO_OR_MORE: "2s_or_more",
  UNSPECIFIED: "unspecified",
});

export const SCENARIO_EVENT_HISTORY_STATE = Object.freeze({
  UNSPECIFIED: "unspecified",
  OBSERVED: "observed",
});

export const SCENARIO_RECENT_EVENT_KIND = Object.freeze({
  ABILITY_USE: "ability_use",
});

// The qualifying ability activation completed and its deterministic,
// no-cooldown trigger was accepted. This does not assert cooldown readiness.
export const SCENARIO_RECENT_EVENT_OUTCOME = Object.freeze({
  SUCCESSFUL_ACTIVATION: "successful_activation",
});

export const SCENARIO_ABILITY_CATEGORY = Object.freeze({
  MOBILITY: "mobility",
  MOVEMENT: "movement",
});

export const SCENARIO_PARTY_STATE = Object.freeze({
  UNSPECIFIED: "unspecified",
  OBSERVED: "observed",
});

export const SCENARIO_PROXIMITY_STATE = Object.freeze({
  UNSPECIFIED: "unspecified",
  OBSERVED: "observed",
});

// These cohorts are deliberately disjoint and exclude the participant whose
// proximity record contains them. An evaluator may combine the cohorts only
// when a decoded recipient rule requires that wider population.
export const SCENARIO_PROXIMITY_COHORT = Object.freeze({
  SAME_PARTY_PLAYER_OTHER: "same_party_player_other",
  ALLIED_NONPARTY_PLAYER: "allied_nonparty_player",
});

export const SCENARIO_PROXIMITY_COMPARATOR = Object.freeze({
  LESS_THAN: "lt",
  LESS_THAN_OR_EQUAL: "lte",
});

export const SCENARIO_TIME_OF_DAY = Object.freeze({
  UNSPECIFIED: "unspecified",
  DAY: "day",
  NIGHT: "night",
  DAWN: "dawn",
  DUSK: "dusk",
});

export const SCENARIO_WEATHER = Object.freeze({
  UNSPECIFIED: "unspecified",
  CLEAR: "clear",
  RAIN: "rain",
  SNOW: "snow",
  FOG: "fog",
  STORM: "storm",
});

export const SCENARIO_PARTICIPANT_RELATIONSHIP = Object.freeze({
  SELF: "self",
  ALLY: "ally",
  ENEMY: "enemy",
  NEUTRAL: "neutral",
});

export const SCENARIO_RNG_ALGORITHM = Object.freeze({
  XORSHIFT64STAR_V1: "xorshift64star-v1",
});

const TIMES = new Set(Object.values(SCENARIO_TIME_OF_DAY));
const WEATHERS = new Set(Object.values(SCENARIO_WEATHER));
const RELATIONSHIPS = new Set(Object.values(SCENARIO_PARTICIPANT_RELATIONSHIP));
const RNG_ALGORITHMS = new Set(Object.values(SCENARIO_RNG_ALGORITHM));
const MOTION_STATES = new Set(Object.values(SCENARIO_MOTION_STATE));
const STATIONARY_BANDS = new Set(Object.values(SCENARIO_STATIONARY_BAND));
const MOVEMENT_KINDS = new Set(Object.values(SCENARIO_MOVEMENT_KIND));
const MOVING_BANDS = new Set(Object.values(SCENARIO_MOVING_BAND));
const PRIOR_STATIONARY_BANDS = new Set([SCENARIO_MOTION_STATE.UNSPECIFIED, ...STATIONARY_BANDS]);
const EVENT_HISTORY_STATES = new Set(Object.values(SCENARIO_EVENT_HISTORY_STATE));
const RECENT_EVENT_KINDS = new Set(Object.values(SCENARIO_RECENT_EVENT_KIND));
const RECENT_EVENT_OUTCOMES = new Set(Object.values(SCENARIO_RECENT_EVENT_OUTCOME));
const ABILITY_CATEGORIES = new Set(Object.values(SCENARIO_ABILITY_CATEGORY));
const PARTY_STATES = new Set(Object.values(SCENARIO_PARTY_STATE));
const PROXIMITY_STATES = new Set(Object.values(SCENARIO_PROXIMITY_STATE));
const PROXIMITY_COHORTS = new Set(Object.values(SCENARIO_PROXIMITY_COHORT));
const PROXIMITY_COMPARATORS = new Set(Object.values(SCENARIO_PROXIMITY_COMPARATOR));
const PROXIMITY_COMPARATOR_ORDER = Object.freeze({
  [SCENARIO_PROXIMITY_COMPARATOR.LESS_THAN]: 0,
  [SCENARIO_PROXIMITY_COMPARATOR.LESS_THAN_OR_EQUAL]: 1,
});
const SHA256 = /^(?:sha256:)?[a-fA-F0-9]{64}$/;

/** Validate, detach, canonically order, and deeply freeze a scenario. */
export function normalizeCombatScenario(input, { expectedGameBuild } = {}) {
  const value = requireRecord(input, "Combat scenario");
  assertOnlyKeys(value, [
    "schema", "schemaVersion", "gameBuild", "id", "durationMs", "environment",
    "participants", "source", "target", "actions", "rng",
  ], "Combat scenario");
  if (value.schema !== COMBAT_SCENARIO_SCHEMA) throw new Error(`Unsupported combat scenario schema: ${String(value.schema)}`);
  if (![1, 2, 3, 4, COMBAT_SCENARIO_SCHEMA_VERSION].includes(value.schemaVersion)) {
    throw new Error(`Unsupported combat scenario schemaVersion: ${String(value.schemaVersion)}`);
  }
  const gameBuild = requireBuild(value.gameBuild, "gameBuild");
  assertExpectedBuild(gameBuild, expectedGameBuild);
  const durationMs = requireNonnegativeInteger(value.durationMs, "durationMs");
  const participants = normalizeParticipants(value.participants, value.schemaVersion);
  const participantIds = new Set(participants.map((participant) => participant.id));
  const source = normalizeParticipantReference(value.source, "source", participantIds);
  const target = normalizeTarget(value.target, participantIds);
  const actions = normalizeActions(value.actions, participantIds, durationMs);

  return deepFreeze({
    schema: COMBAT_SCENARIO_SCHEMA,
    schemaVersion: COMBAT_SCENARIO_SCHEMA_VERSION,
    gameBuild,
    id: requireId(value.id, "id"),
    durationMs,
    environment: normalizeEnvironment(value.environment),
    participants,
    source,
    target,
    actions,
    rng: normalizeRng(value.rng),
  });
}

export const createCombatScenario = normalizeCombatScenario;

export function validateCombatScenario(input, options) {
  normalizeCombatScenario(input, options);
  return true;
}

function normalizeEnvironment(input) {
  const value = requireRecord(input, "environment");
  assertOnlyKeys(value, ["timeOfDay", "weather"], "environment");
  return {
    timeOfDay: requireEnum(value.timeOfDay, TIMES, "environment.timeOfDay"),
    weather: requireEnum(value.weather, WEATHERS, "environment.weather"),
  };
}

function normalizeParticipants(input, inputSchemaVersion) {
  if (!Array.isArray(input) || input.length === 0) throw new TypeError("participants must be a nonempty array.");
  const seen = new Set();
  const participants = input.map((entry, index) => {
    const label = `participants[${index}]`;
    const value = requireRecord(entry, label);
    const allowedKeys = [
      "id", "relationship", "buildSnapshotId", "buildSnapshotHash",
      "equippedWeaponTypes", "activeWeaponType",
      ...(inputSchemaVersion >= 2 ? ["resources"] : []),
      ...(inputSchemaVersion >= 3 ? ["motion"] : []),
      ...(inputSchemaVersion >= 4 ? ["eventHistory"] : []),
      ...(inputSchemaVersion >= 5 ? ["party", "proximity"] : []),
    ];
    assertOnlyKeys(value, allowedKeys, label);
    const id = requireId(value.id, `${label}.id`);
    if (seen.has(id)) throw new Error(`Duplicate participant id: ${id}`);
    seen.add(id);
    if (!Array.isArray(value.equippedWeaponTypes)) throw new TypeError(`${label}.equippedWeaponTypes must be an array.`);
    const equippedWeaponTypes = value.equippedWeaponTypes.map((weapon, weaponIndex) => (
      requireId(weapon, `${label}.equippedWeaponTypes[${weaponIndex}]`)
    ));
    if (new Set(equippedWeaponTypes).size !== equippedWeaponTypes.length) {
      throw new Error(`${label}.equippedWeaponTypes contains duplicate values.`);
    }
    equippedWeaponTypes.sort(compareCodeUnits);
    const activeWeaponType = value.activeWeaponType === undefined
      ? undefined
      : requireId(value.activeWeaponType, `${label}.activeWeaponType`);
    if (activeWeaponType !== undefined && !equippedWeaponTypes.includes(activeWeaponType)) {
      throw new Error(`${label}.activeWeaponType must be one of equippedWeaponTypes.`);
    }
    if (value.buildSnapshotId === undefined && value.buildSnapshotHash === undefined) {
      throw new Error(`${label} requires buildSnapshotId or buildSnapshotHash.`);
    }
    const buildSnapshotHash = value.buildSnapshotHash === undefined
      ? undefined
      : normalizeSha256(value.buildSnapshotHash, `${label}.buildSnapshotHash`);
    return {
      id,
      relationship: requireEnum(value.relationship, RELATIONSHIPS, `${label}.relationship`),
      ...(value.buildSnapshotId === undefined ? {} : { buildSnapshotId: requireId(value.buildSnapshotId, `${label}.buildSnapshotId`) }),
      ...(buildSnapshotHash === undefined ? {} : { buildSnapshotHash }),
      equippedWeaponTypes,
      ...(activeWeaponType === undefined ? {} : { activeWeaponType }),
      resources: normalizeParticipantResources(value.resources, `${label}.resources`),
      motion: normalizeParticipantMotion(value.motion, `${label}.motion`),
      eventHistory: normalizeParticipantEventHistory(value.eventHistory, `${label}.eventHistory`, equippedWeaponTypes),
      party: normalizeParticipantParty(value.party, `${label}.party`),
      proximity: normalizeParticipantProximity(value.proximity, `${label}.proximity`, value.party, `${label}.party`),
    };
  });
  return participants.sort((left, right) => compareCodeUnits(left.id, right.id));
}

function normalizeParticipantParty(input, label) {
  if (input === undefined) return { state: SCENARIO_PARTY_STATE.UNSPECIFIED };
  const value = requireRecord(input, label);
  const state = requireEnum(value.state, PARTY_STATES, `${label}.state`);
  if (state === SCENARIO_PARTY_STATE.UNSPECIFIED) {
    assertOnlyKeys(value, ["state"], label);
    return { state };
  }
  assertOnlyKeys(value, ["state", "totalMembersIncludingSelf"], label);
  return {
    state,
    totalMembersIncludingSelf: requirePositiveInteger(
      value.totalMembersIncludingSelf,
      `${label}.totalMembersIncludingSelf`,
    ),
  };
}

function normalizeParticipantProximity(input, label, partyInput, partyLabel) {
  if (input === undefined) return { state: SCENARIO_PROXIMITY_STATE.UNSPECIFIED };
  const value = requireRecord(input, label);
  const state = requireEnum(value.state, PROXIMITY_STATES, `${label}.state`);
  if (state === SCENARIO_PROXIMITY_STATE.UNSPECIFIED) {
    assertOnlyKeys(value, ["state"], label);
    return { state };
  }
  assertOnlyKeys(value, ["state", "counts"], label);
  if (!Array.isArray(value.counts)) throw new TypeError(`${label}.counts must be an array.`);

  const observedParty = normalizeParticipantParty(partyInput, partyLabel);
  const maximumOtherPartyMembers = observedParty.state === SCENARIO_PARTY_STATE.OBSERVED
    ? observedParty.totalMembersIncludingSelf - 1
    : null;
  const keys = new Set();
  const counts = value.counts.map((entry, index) => {
    const countLabel = `${label}.counts[${index}]`;
    const countValue = requireRecord(entry, countLabel);
    assertOnlyKeys(countValue, ["cohort", "comparator", "radiusMeters", "count"], countLabel);
    const cohort = requireEnum(countValue.cohort, PROXIMITY_COHORTS, `${countLabel}.cohort`);
    const comparator = requireEnum(countValue.comparator, PROXIMITY_COMPARATORS, `${countLabel}.comparator`);
    const radiusMeters = normalizeDecimal(countValue.radiusMeters, `${countLabel}.radiusMeters`, { nonnegative: true });
    const count = requireNonnegativeInteger(countValue.count, `${countLabel}.count`);
    const key = `${cohort}\u0000${comparator}\u0000${radiusMeters}`;
    if (keys.has(key)) throw new Error(`${label}.counts contains a duplicate cohort, comparator, and radius observation.`);
    keys.add(key);
    if (
      maximumOtherPartyMembers !== null
      && cohort === SCENARIO_PROXIMITY_COHORT.SAME_PARTY_PLAYER_OTHER
      && count > maximumOtherPartyMembers
    ) {
      throw new RangeError(`${countLabel}.count exceeds ${partyLabel}.totalMembersIncludingSelf minus the participant.`);
    }
    return { cohort, comparator, radiusMeters, count };
  });

  counts.sort(compareProximityCounts);
  validateProximityMonotonicity(counts, label);
  return { state, counts };
}

function compareProximityCounts(left, right) {
  return compareCodeUnits(left.cohort, right.cohort)
    || compareNonnegativeDecimals(left.radiusMeters, right.radiusMeters)
    || PROXIMITY_COMPARATOR_ORDER[left.comparator] - PROXIMITY_COMPARATOR_ORDER[right.comparator];
}

function validateProximityMonotonicity(counts, label) {
  const countsByCohortAndRadius = new Map();
  for (const entry of counts) {
    const radiusKey = `${entry.cohort}\u0000${entry.radiusMeters}`;
    const pair = countsByCohortAndRadius.get(radiusKey) ?? {};
    pair[entry.comparator] = entry.count;
    countsByCohortAndRadius.set(radiusKey, pair);
  }
  for (let leftIndex = 0; leftIndex < counts.length; leftIndex += 1) {
    const left = counts[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < counts.length; rightIndex += 1) {
      const right = counts[rightIndex];
      if (left.cohort !== right.cohort) break;
      if (compareNonnegativeDecimals(left.radiusMeters, right.radiusMeters) < 0 && left.count > right.count) {
        throw new RangeError(`${label}.counts must not decrease as radius increases for the same cohort.`);
      }
    }
  }
  for (const pair of countsByCohortAndRadius.values()) {
    if (
      pair[SCENARIO_PROXIMITY_COMPARATOR.LESS_THAN] !== undefined
      && pair[SCENARIO_PROXIMITY_COMPARATOR.LESS_THAN_OR_EQUAL] !== undefined
      && pair[SCENARIO_PROXIMITY_COMPARATOR.LESS_THAN] > pair[SCENARIO_PROXIMITY_COMPARATOR.LESS_THAN_OR_EQUAL]
    ) {
      throw new RangeError(`${label}.counts cannot contain a greater lt count than lte count at the same radius.`);
    }
  }
}

function compareNonnegativeDecimals(left, right) {
  if (left === right) return 0;
  const [leftWhole, leftFraction = ""] = left.split(".");
  const [rightWhole, rightFraction = ""] = right.split(".");
  if (leftWhole.length !== rightWhole.length) return leftWhole.length - rightWhole.length;
  const wholeComparison = compareCodeUnits(leftWhole, rightWhole);
  if (wholeComparison) return wholeComparison;
  const fractionLength = Math.max(leftFraction.length, rightFraction.length);
  return compareCodeUnits(
    leftFraction.padEnd(fractionLength, "0"),
    rightFraction.padEnd(fractionLength, "0"),
  );
}

function normalizeParticipantEventHistory(input, label, equippedWeaponTypes) {
  if (input === undefined) return { state: SCENARIO_EVENT_HISTORY_STATE.UNSPECIFIED };
  const value = requireRecord(input, label);
  const state = requireEnum(value.state, EVENT_HISTORY_STATES, `${label}.state`);
  if (state === SCENARIO_EVENT_HISTORY_STATE.UNSPECIFIED) {
    assertOnlyKeys(value, ["state"], label);
    return { state };
  }
  assertOnlyKeys(value, ["state", "lookbackMs", "events"], label);
  const lookbackMs = requireNonnegativeInteger(value.lookbackMs, `${label}.lookbackMs`);
  if (!Array.isArray(value.events)) throw new TypeError(`${label}.events must be an array.`);
  const ids = new Set();
  const sequences = new Set();
  const events = value.events.map((entry, index) => {
    const eventLabel = `${label}.events[${index}]`;
    const event = requireRecord(entry, eventLabel);
    assertOnlyKeys(event, [
      "id", "sequence", "occurredAgoMs", "kind", "outcome", "abilityId", "weaponType", "categories",
    ], eventLabel);
    const id = requireId(event.id, `${eventLabel}.id`);
    if (ids.has(id)) throw new Error(`Duplicate recent event id: ${id}`);
    ids.add(id);
    const sequence = requireNonnegativeInteger(event.sequence, `${eventLabel}.sequence`);
    if (sequences.has(sequence)) throw new Error(`Duplicate recent event sequence: ${sequence}`);
    sequences.add(sequence);
    const occurredAgoMs = requireNonnegativeInteger(event.occurredAgoMs, `${eventLabel}.occurredAgoMs`);
    if (occurredAgoMs > lookbackMs) throw new RangeError(`${eventLabel}.occurredAgoMs exceeds ${label}.lookbackMs.`);
    const weaponType = requireId(event.weaponType, `${eventLabel}.weaponType`);
    if (!equippedWeaponTypes.includes(weaponType)) {
      throw new Error(`${eventLabel}.weaponType must be one of the participant's equippedWeaponTypes.`);
    }
    if (!Array.isArray(event.categories) || event.categories.length === 0) {
      throw new TypeError(`${eventLabel}.categories must be a nonempty array.`);
    }
    const categories = event.categories.map((category, categoryIndex) => (
      requireEnum(category, ABILITY_CATEGORIES, `${eventLabel}.categories[${categoryIndex}]`)
    ));
    if (new Set(categories).size !== categories.length) {
      throw new Error(`${eventLabel}.categories contains duplicate values.`);
    }
    categories.sort(compareCodeUnits);
    return {
      id,
      sequence,
      occurredAgoMs,
      kind: requireEnum(event.kind, RECENT_EVENT_KINDS, `${eventLabel}.kind`),
      outcome: requireEnum(event.outcome, RECENT_EVENT_OUTCOMES, `${eventLabel}.outcome`),
      ...(event.abilityId === undefined ? {} : { abilityId: requireId(event.abilityId, `${eventLabel}.abilityId`) }),
      weaponType,
      categories,
    };
  });
  events.sort((left, right) => (
    left.occurredAgoMs - right.occurredAgoMs
    || left.sequence - right.sequence
    || compareCodeUnits(left.id, right.id)
  ));
  return { state, lookbackMs, events };
}

function normalizeParticipantMotion(input, label) {
  if (input === undefined) return { state: SCENARIO_MOTION_STATE.UNSPECIFIED };
  const value = requireRecord(input, label);
  const state = requireEnum(value.state, MOTION_STATES, `${label}.state`);
  if (state === SCENARIO_MOTION_STATE.UNSPECIFIED) {
    assertOnlyKeys(value, ["state"], label);
    return { state };
  }
  if (state === SCENARIO_MOTION_STATE.STATIONARY) {
    assertOnlyKeys(value, ["state", "stationaryBand"], label);
    return {
      state,
      stationaryBand: requireEnum(value.stationaryBand, STATIONARY_BANDS, `${label}.stationaryBand`),
    };
  }
  assertOnlyKeys(value, ["state", "movementKind", "movingBand", "priorStationaryBand"], label);
  return {
    state,
    movementKind: requireEnum(value.movementKind, MOVEMENT_KINDS, `${label}.movementKind`),
    movingBand: requireEnum(value.movingBand, MOVING_BANDS, `${label}.movingBand`),
    priorStationaryBand: requireEnum(
      value.priorStationaryBand,
      PRIOR_STATIONARY_BANDS,
      `${label}.priorStationaryBand`,
    ),
  };
}

function normalizeParticipantResources(input, label) {
  if (input === undefined) return {};
  const value = requireRecord(input, label);
  assertOnlyKeys(value, Object.values(SCENARIO_RESOURCE), label);
  return {
    ...(value.health === undefined ? {} : { health: normalizeResourceRatio(value.health, `${label}.health`) }),
    ...(value.mana === undefined ? {} : { mana: normalizeResourceRatio(value.mana, `${label}.mana`) }),
  };
}

function normalizeResourceRatio(input, label) {
  const value = requireRecord(input, label);
  assertOnlyKeys(value, ["currentRatioBps"], label);
  const currentRatioBps = requireNonnegativeInteger(value.currentRatioBps, `${label}.currentRatioBps`);
  if (currentRatioBps > SCENARIO_RESOURCE_BPS_SCALE) {
    throw new RangeError(`${label}.currentRatioBps must not exceed ${SCENARIO_RESOURCE_BPS_SCALE}.`);
  }
  return { currentRatioBps };
}

function normalizeParticipantReference(input, label, participantIds) {
  const value = requireRecord(input, label);
  assertOnlyKeys(value, ["participantId"], label);
  const participantId = requireId(value.participantId, `${label}.participantId`);
  if (!participantIds.has(participantId)) throw new Error(`${label}.participantId does not identify a participant.`);
  return { participantId };
}

function normalizeTarget(input, participantIds) {
  const value = requireRecord(input, "target");
  assertOnlyKeys(value, ["participantId", "distanceMeters"], "target");
  const participantId = requireId(value.participantId, "target.participantId");
  if (!participantIds.has(participantId)) throw new Error("target.participantId does not identify a participant.");
  return {
    participantId,
    distanceMeters: normalizeDecimal(value.distanceMeters, "target.distanceMeters", { nonnegative: true }),
  };
}

function normalizeActions(input, participantIds, durationMs) {
  if (!Array.isArray(input)) throw new TypeError("actions must be an array.");
  const ids = new Set();
  const sequences = new Set();
  const actions = input.map((entry, index) => {
    const label = `actions[${index}]`;
    const value = requireRecord(entry, label);
    assertOnlyKeys(value, ["id", "sequence", "atMs", "kind", "actorId", "targetId", "abilityId", "skillLevel"], label);
    const id = requireId(value.id, `${label}.id`);
    if (ids.has(id)) throw new Error(`Duplicate action id: ${id}`);
    ids.add(id);
    const sequence = requireNonnegativeInteger(value.sequence, `${label}.sequence`);
    if (sequences.has(sequence)) throw new Error(`Duplicate action sequence: ${sequence}`);
    sequences.add(sequence);
    const atMs = requireNonnegativeInteger(value.atMs, `${label}.atMs`);
    if (atMs > durationMs) throw new RangeError(`${label}.atMs exceeds durationMs.`);
    if (value.kind !== "ability") throw new Error(`${label}.kind is unsupported: ${String(value.kind)}`);
    const actorId = requireId(value.actorId, `${label}.actorId`);
    const targetId = requireId(value.targetId, `${label}.targetId`);
    if (!participantIds.has(actorId) || !participantIds.has(targetId)) {
      throw new Error(`${label} actorId and targetId must identify participants.`);
    }
    return {
      id,
      sequence,
      atMs,
      kind: "ability",
      actorId,
      targetId,
      abilityId: requireId(value.abilityId, `${label}.abilityId`),
      skillLevel: requirePositiveInteger(value.skillLevel, `${label}.skillLevel`),
    };
  });
  return actions.sort((left, right) => left.atMs - right.atMs || left.sequence - right.sequence || compareCodeUnits(left.id, right.id));
}

function normalizeRng(input) {
  const value = requireRecord(input, "rng");
  assertOnlyKeys(value, ["algorithm", "seed"], "rng");
  const seed = typeof value.seed === "bigint" ? value.seed.toString() : value.seed;
  if ((typeof seed !== "string" && !Number.isSafeInteger(seed)) || String(seed).length === 0 || String(seed).length > 128) {
    throw new TypeError("rng.seed must be a nonempty string, bigint, or safe integer with at most 128 characters.");
  }
  return {
    algorithm: requireEnum(value.algorithm, RNG_ALGORITHMS, "rng.algorithm"),
    seed: String(seed),
  };
}

function normalizeSha256(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) throw new TypeError(`${label} must be a SHA-256 digest.`);
  return value.replace(/^sha256:/i, "").toLowerCase();
}
