import assert from "node:assert/strict";
import test from "node:test";
import {
  COMBAT_EFFECT_DEFINITION_SCHEMA,
  COMBAT_EFFECT_DEFINITION_SCHEMA_VERSION,
  SCENARIO_ABILITY_CATEGORY,
  COMBAT_SCENARIO_SCHEMA,
  COMBAT_SCENARIO_SCHEMA_VERSION,
  SCENARIO_EVENT_HISTORY_STATE,
  SCENARIO_RECENT_EVENT_KIND,
  SCENARIO_RECENT_EVENT_OUTCOME,
  assertCombatEffectMatchesScenario,
  normalizeCombatEffectDefinition,
  normalizeCombatScenario,
  validateCombatEffectDefinition,
  validateCombatScenario,
} from "../../packages/combat-engine/src/index.mjs";

const BUILD = "24118850";

function scenario(overrides = {}) {
  return {
    schema: COMBAT_SCENARIO_SCHEMA,
    schemaVersion: COMBAT_SCENARIO_SCHEMA_VERSION,
    gameBuild: BUILD,
    id: "scenario.distance.10m",
    durationMs: 10_000,
    environment: { timeOfDay: "night", weather: "rain" },
    participants: [
      {
        id: "target",
        relationship: "enemy",
        buildSnapshotHash: "A".repeat(64),
        equippedWeaponTypes: [],
        resources: { health: { currentRatioBps: 4999 } },
        motion: {
          state: "moving",
          movementKind: "ordinary",
          movingBand: "under_2s",
          priorStationaryBand: "3s_to_under_4s",
        },
      },
      {
        id: "player",
        relationship: "self",
        buildSnapshotId: "build.player",
        equippedWeaponTypes: ["dagger", "longbow"],
        activeWeaponType: "longbow",
        resources: {
          health: { currentRatioBps: 5000 },
          mana: { currentRatioBps: 3300 },
        },
        motion: { state: "stationary", stationaryBand: "4s_or_more" },
        eventHistory: {
          state: "observed",
          lookbackMs: 4000,
          events: [
            {
              id: "older-movement",
              sequence: 2,
              occurredAgoMs: 2000,
              kind: "ability_use",
              outcome: "successful_activation",
              abilityId: "ability.movement",
              weaponType: "dagger",
              categories: ["movement"],
            },
            {
              id: "recent-mobility",
              sequence: 1,
              occurredAgoMs: 500,
              kind: "ability_use",
              outcome: "successful_activation",
              weaponType: "longbow",
              categories: ["movement", "mobility"],
            },
          ],
        },
      },
    ],
    source: { participantId: "player" },
    target: { participantId: "target", distanceMeters: 10.5000 },
    actions: [
      { id: "second", sequence: 2, atMs: 2000, kind: "ability", actorId: "player", targetId: "target", abilityId: "ability.two", skillLevel: 5 },
      { id: "first", sequence: 1, atMs: 1000, kind: "ability", actorId: "player", targetId: "target", abilityId: "ability.one", skillLevel: 3 },
    ],
    rng: { algorithm: "xorshift64star-v1", seed: 12345n },
    ...overrides,
  };
}

function exactProvenance() {
  return {
    precision: "verified_exact",
    provenance: "extracted",
    evidence: [{ kind: "decoded_row", reference: "TLFormulaParameter:row_1", gameBuild: BUILD }],
  };
}

function unsupportedProvenance() {
  return {
    precision: "unsupported",
    provenance: "unresolved",
    evidence: [{ kind: "audit", reference: "docs/conditional-effects.md#unknown", gameBuild: BUILD }],
  };
}

function effect(overrides = {}) {
  return {
    schema: COMBAT_EFFECT_DEFINITION_SCHEMA,
    schemaVersion: COMBAT_EFFECT_DEFINITION_SCHEMA_VERSION,
    gameBuild: BUILD,
    id: "passive.black-rage-boost",
    name: "Black Rage's Boost",
    execution: "supported",
    sources: [{ kind: "weapon_passive", id: "SkillSet_WP_BO_P_BlackRageBoost", gameBuild: BUILD }],
    weaponRequirements: ["longbow"],
    triggers: [{ id: "evaluate", kind: "scenario_evaluation" }],
    conditions: [
      { id: "longbow-equipped", kind: "weapon_equipped", participant: "source", weaponType: "longbow" },
      {
        id: "positive-distance",
        kind: "numeric_compare",
        left: { kind: "scenario_numeric", path: "target.distanceMeters" },
        operator: "gt",
        right: { kind: "constant", value: 0 },
      },
      {
        id: "night",
        kind: "enum_equals",
        reference: { kind: "scenario_enum", path: "environment.timeOfDay" },
        value: "night",
      },
    ],
    components: [{
      id: "all-critical-chance",
      kind: "stat_modifier",
      recipient: "source",
      statId: "all_critical_hit_chance",
      operation: "add",
      value: {
        reference: { kind: "scenario_numeric", path: "target.distanceMeters" },
        multiplier: 200,
        offset: "0.000",
        rounding: "floor",
        unit: "raw_stat",
      },
      provenance: exactProvenance(),
    }],
    unresolvedStages: [],
    provenance: exactProvenance(),
    ...overrides,
  };
}

test("combat scenarios normalize deterministic build-scoped state and deeply freeze it", () => {
  const input = scenario();
  const normalized = normalizeCombatScenario(input, { expectedGameBuild: BUILD });
  assert.equal(normalized.target.distanceMeters, "10.5");
  assert.equal(normalized.rng.seed, "12345");
  assert.deepEqual(normalized.participants.map(({ id }) => id), ["player", "target"]);
  assert.deepEqual(normalized.actions.map(({ id }) => id), ["first", "second"]);
  assert.equal(normalized.participants[1].buildSnapshotHash, "a".repeat(64));
  assert.equal(validateCombatScenario(input), true);
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.environment));
  assert.ok(Object.isFrozen(normalized.participants[0].equippedWeaponTypes));
  assert.ok(Object.isFrozen(normalized.participants[0].resources.health));
  assert.ok(Object.isFrozen(normalized.participants[0].motion));
  assert.ok(Object.isFrozen(normalized.participants[0].eventHistory.events[0].categories));
  assert.throws(() => { normalized.target.distanceMeters = "99"; }, TypeError);
  input.environment.weather = "clear";
  input.participants[1].equippedWeaponTypes.push("staff");
  input.participants[1].motion.stationaryBand = "under_2s";
  input.participants[1].eventHistory.events[1].categories[0] = "changed";
  assert.equal(normalized.environment.weather, "rain");
  assert.deepEqual(normalized.participants[0].equippedWeaponTypes, ["dagger", "longbow"]);
  assert.deepEqual(normalized.participants[0].resources, {
    health: { currentRatioBps: 5000 },
    mana: { currentRatioBps: 3300 },
  });
  assert.deepEqual(normalized.participants[0].motion, {
    state: "stationary",
    stationaryBand: "4s_or_more",
  });
  assert.deepEqual(normalized.participants[0].eventHistory, {
    state: "observed",
    lookbackMs: 4000,
    events: [
      {
        id: "recent-mobility",
        sequence: 1,
        occurredAgoMs: 500,
        kind: "ability_use",
        outcome: "successful_activation",
        weaponType: "longbow",
        categories: ["mobility", "movement"],
      },
      {
        id: "older-movement",
        sequence: 2,
        occurredAgoMs: 2000,
        kind: "ability_use",
        outcome: "successful_activation",
        abilityId: "ability.movement",
        weaponType: "dagger",
        categories: ["movement"],
      },
    ],
  });
});

test("combat scenarios validate exact participant resource ratios", () => {
  for (const currentRatioBps of [0, 1, 9999, 10000]) {
    const input = scenario();
    input.participants[1].resources.health.currentRatioBps = currentRatioBps;
    assert.equal(normalizeCombatScenario(input).participants[0].resources.health.currentRatioBps, currentRatioBps);
  }
  for (const invalid of [-1, 10001, 1.5, NaN, Infinity, "5000"]) {
    const input = scenario();
    input.participants[1].resources.health.currentRatioBps = invalid;
    assert.throws(() => normalizeCombatScenario(input));
  }
  const unknownResource = scenario();
  unknownResource.participants[1].resources.stamina = { currentRatioBps: 5000 };
  assert.throws(() => normalizeCombatScenario(unknownResource), /unknown field/);
  const unknownRatioField = scenario();
  unknownRatioField.participants[1].resources.health.percent = 50;
  assert.throws(() => normalizeCombatScenario(unknownRatioField), /unknown field/);
});

test("combat scenario v1 migrates to canonical v4 without resource, motion, or event semantics", () => {
  const input = scenario({ schemaVersion: 1 });
  for (const participant of input.participants) {
    delete participant.resources;
    delete participant.motion;
    delete participant.eventHistory;
  }
  const migrated = normalizeCombatScenario(input);
  assert.equal(migrated.schemaVersion, 4);
  assert.ok(migrated.participants.every((participant) => Object.keys(participant.resources).length === 0));
  assert.ok(migrated.participants.every((participant) => participant.motion.state === "unspecified"));
  assert.ok(migrated.participants.every((participant) => participant.eventHistory.state === "unspecified"));

  const smuggled = scenario({ schemaVersion: 1 });
  assert.throws(() => normalizeCombatScenario(smuggled), /unknown field/);
  assert.throws(() => normalizeCombatScenario(scenario({ schemaVersion: 5 })), /Unsupported combat scenario schemaVersion/);
});

test("combat scenario v2 migrates resources to canonical v4 without motion or event semantics", () => {
  const input = scenario({ schemaVersion: 2 });
  for (const participant of input.participants) {
    delete participant.motion;
    delete participant.eventHistory;
  }
  const migrated = normalizeCombatScenario(input);
  assert.equal(migrated.schemaVersion, 4);
  assert.deepEqual(migrated.participants[0].resources, {
    health: { currentRatioBps: 5000 },
    mana: { currentRatioBps: 3300 },
  });
  assert.ok(migrated.participants.every((participant) => participant.motion.state === "unspecified"));
  assert.ok(migrated.participants.every((participant) => participant.eventHistory.state === "unspecified"));

  const smuggled = scenario({ schemaVersion: 2 });
  assert.throws(() => normalizeCombatScenario(smuggled), /unknown field/);
});

test("combat scenario v3 migrates resources and motion to canonical v4 without event semantics", () => {
  const input = scenario({ schemaVersion: 3 });
  for (const participant of input.participants) delete participant.eventHistory;
  const migrated = normalizeCombatScenario(input);
  assert.equal(migrated.schemaVersion, 4);
  assert.deepEqual(migrated.participants[0].resources, {
    health: { currentRatioBps: 5000 },
    mana: { currentRatioBps: 3300 },
  });
  assert.deepEqual(migrated.participants[0].motion, { state: "stationary", stationaryBand: "4s_or_more" });
  assert.ok(migrated.participants.every((participant) => participant.eventHistory.state === "unspecified"));

  const smuggled = scenario({ schemaVersion: 3 });
  assert.throws(() => normalizeCombatScenario(smuggled), /eventHistory/);
});

test("combat scenario v4 validates the participant-owned motion union exactly", () => {
  const stationaryBands = ["under_2s", "2s_to_under_3s", "3s_to_under_4s", "4s_or_more"];
  const movingBands = ["under_2s", "2s_or_more", "unspecified"];
  const movementKinds = ["ordinary", "movement_skill"];
  const priorStationaryBands = ["unspecified", ...stationaryBands];

  for (const stationaryBand of stationaryBands) {
    const input = scenario();
    input.participants[1].motion = { state: "stationary", stationaryBand };
    assert.deepEqual(normalizeCombatScenario(input).participants[0].motion, { state: "stationary", stationaryBand });
  }
  for (const movementKind of movementKinds) {
    for (const movingBand of movingBands) {
      for (const priorStationaryBand of priorStationaryBands) {
        const input = scenario();
        input.participants[1].motion = { state: "moving", movementKind, movingBand, priorStationaryBand };
        assert.deepEqual(normalizeCombatScenario(input).participants[0].motion, {
          state: "moving",
          movementKind,
          movingBand,
          priorStationaryBand,
        });
      }
    }
  }

  const omitted = scenario();
  delete omitted.participants[1].motion;
  assert.deepEqual(normalizeCombatScenario(omitted).participants[0].motion, { state: "unspecified" });

  for (const invalidMotion of [
    { state: "unknown" },
    { state: "unspecified", stationaryBand: "under_2s" },
    { state: "stationary" },
    { state: "stationary", stationaryBand: "2s_or_more" },
    { state: "stationary", stationaryBand: "under_2s", movementKind: "ordinary" },
    { state: "moving", movementKind: "ordinary", movingBand: "under_2s" },
    { state: "moving", movementKind: "dash", movingBand: "under_2s", priorStationaryBand: "unspecified" },
    { state: "moving", movementKind: "ordinary", movingBand: "3s_or_more", priorStationaryBand: "unspecified" },
    { state: "moving", movementKind: "ordinary", movingBand: "under_2s", priorStationaryBand: "2s_or_more" },
    { state: "moving", movementKind: "ordinary", movingBand: "under_2s", priorStationaryBand: "unspecified", extra: true },
  ]) {
    const input = scenario();
    input.participants[1].motion = invalidMotion;
    assert.throws(() => normalizeCombatScenario(input));
  }
});

test("combat scenario v4 validates and canonically orders participant event history", () => {
  assert.equal(SCENARIO_EVENT_HISTORY_STATE.OBSERVED, "observed");
  assert.equal(SCENARIO_RECENT_EVENT_KIND.ABILITY_USE, "ability_use");
  assert.equal(SCENARIO_RECENT_EVENT_OUTCOME.SUCCESSFUL_ACTIVATION, "successful_activation");
  assert.equal(SCENARIO_ABILITY_CATEGORY.MOBILITY, "mobility");

  const normalized = normalizeCombatScenario(scenario());
  assert.deepEqual(normalized.participants[0].eventHistory.events.map(({ id }) => id), [
    "recent-mobility",
    "older-movement",
  ]);
  assert.deepEqual(normalized.participants[0].eventHistory.events[0].categories, ["mobility", "movement"]);
  assert.deepEqual(normalized.participants[1].eventHistory, { state: "unspecified" });

  const omitted = scenario();
  delete omitted.participants[1].eventHistory;
  assert.deepEqual(normalizeCombatScenario(omitted).participants[0].eventHistory, { state: "unspecified" });

  const emptyObserved = scenario();
  emptyObserved.participants[1].eventHistory = { state: "observed", lookbackMs: 4000, events: [] };
  assert.deepEqual(normalizeCombatScenario(emptyObserved).participants[0].eventHistory, {
    state: "observed",
    lookbackMs: 4000,
    events: [],
  });
});

test("combat scenario v4 rejects partial, inconsistent, and open-world event histories", () => {
  const validEvent = {
    id: "recent",
    sequence: 1,
    occurredAgoMs: 500,
    kind: "ability_use",
    outcome: "successful_activation",
    abilityId: "ability.mobility",
    weaponType: "dagger",
    categories: ["mobility"],
  };
  const invalidHistories = [
    { state: "unknown" },
    { state: "unspecified", events: [] },
    { state: "observed", events: [] },
    { state: "observed", lookbackMs: 4000 },
    { state: "observed", lookbackMs: -1, events: [] },
    { state: "observed", lookbackMs: 1.5, events: [] },
    { state: "observed", lookbackMs: 4000, events: [null] },
    { state: "observed", lookbackMs: 4000, events: [{ ...validEvent, extra: true }] },
    { state: "observed", lookbackMs: 4000, events: [{ ...validEvent, id: "unsafe id" }] },
    { state: "observed", lookbackMs: 4000, events: [{ ...validEvent, sequence: -1 }] },
    { state: "observed", lookbackMs: 4000, events: [{ ...validEvent, occurredAgoMs: 4001 }] },
    { state: "observed", lookbackMs: 4000, events: [{ ...validEvent, occurredAgoMs: 1.5 }] },
    { state: "observed", lookbackMs: 4000, events: [{ ...validEvent, kind: "ability_hit" }] },
    { state: "observed", lookbackMs: 4000, events: [{ ...validEvent, outcome: undefined }] },
    { state: "observed", lookbackMs: 4000, events: [{ ...validEvent, outcome: "attempted" }] },
    { state: "observed", lookbackMs: 4000, events: [{ ...validEvent, abilityId: "unsafe ability" }] },
    { state: "observed", lookbackMs: 4000, events: [{ ...validEvent, weaponType: "staff" }] },
    { state: "observed", lookbackMs: 4000, events: [{ ...validEvent, categories: [] }] },
    { state: "observed", lookbackMs: 4000, events: [{ ...validEvent, categories: ["teleport"] }] },
    { state: "observed", lookbackMs: 4000, events: [{ ...validEvent, categories: ["mobility", "mobility"] }] },
    { state: "observed", lookbackMs: 4000, events: [validEvent, { ...validEvent, sequence: 2 }] },
    { state: "observed", lookbackMs: 4000, events: [validEvent, { ...validEvent, id: "other" }] },
    { state: "observed", lookbackMs: 4000, events: [], cooldownReady: true },
  ];
  for (const eventHistory of invalidHistories) {
    const input = scenario();
    input.participants[1].eventHistory = eventHistory;
    assert.throws(() => normalizeCombatScenario(input));
  }
});

test("scenario normalization is deterministic across non-semantic input ordering", () => {
  const left = normalizeCombatScenario(scenario());
  const reordered = scenario();
  reordered.participants.reverse();
  reordered.actions.reverse();
  const reorderedPlayer = reordered.participants.find(({ id }) => id === "player");
  reorderedPlayer.equippedWeaponTypes.reverse();
  reorderedPlayer.eventHistory.events.reverse();
  reorderedPlayer.eventHistory.events[0].categories.reverse();
  const right = normalizeCombatScenario(reordered);
  assert.deepEqual(right, left);
});

test("scenario contracts reject unknown fields, invalid distances, and build mismatches", () => {
  assert.throws(() => normalizeCombatScenario({ ...scenario(), futureField: true }), /unknown field/);
  assert.throws(() => normalizeCombatScenario(scenario({ target: { participantId: "target", distanceMeters: -1 } })), /nonnegative/);
  assert.throws(() => normalizeCombatScenario(scenario({ target: { participantId: "target", distanceMeters: NaN } })), /finite/);
  assert.throws(() => normalizeCombatScenario(scenario({ target: { participantId: "target", distanceMeters: Infinity } })), /finite/);
  assert.throws(() => normalizeCombatScenario(scenario(), { expectedGameBuild: "24118851" }), /does not match expected gameBuild/);
  const nestedUnknown = scenario();
  nestedUnknown.environment.zone = "open_world";
  assert.throws(() => normalizeCombatScenario(nestedUnknown), /unknown field/);
});

test("scenario participants, weapon state, actions, and RNG are closed-world validated", () => {
  const badWeapon = scenario();
  badWeapon.participants[1].activeWeaponType = "staff";
  assert.throws(() => normalizeCombatScenario(badWeapon), /activeWeaponType/);
  const badAction = scenario();
  badAction.actions[0].kind = "proc_guess";
  assert.throws(() => normalizeCombatScenario(badAction), /unsupported/);
  const badActor = scenario();
  badActor.actions[0].actorId = "missing";
  assert.throws(() => normalizeCombatScenario(badActor), /must identify participants/);
  assert.throws(() => normalizeCombatScenario(scenario({ rng: { algorithm: "math-random", seed: "x" } })), /Unknown rng.algorithm/);
  const duplicateWeapon = scenario();
  duplicateWeapon.participants[1].equippedWeaponTypes.push("longbow");
  assert.throws(() => normalizeCombatScenario(duplicateWeapon), /duplicate values/);
});

test("effect definitions normalize constrained references, provenance, and sources immutably", () => {
  const input = effect();
  const normalized = normalizeCombatEffectDefinition(input, { expectedGameBuild: BUILD });
  assert.equal(normalized.components[0].value.multiplier, "200");
  assert.equal(normalized.components[0].value.offset, "0");
  assert.deepEqual(normalized.conditions.map(({ id }) => id), ["longbow-equipped", "night", "positive-distance"]);
  assert.equal(validateCombatEffectDefinition(input), true);
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.components[0].provenance.evidence[0]));
  assert.throws(() => { normalized.components[0].value.offset = "5"; }, TypeError);
  input.components[0].provenance.evidence[0].reference = "changed";
  assert.match(normalized.components[0].provenance.evidence[0].reference, /TLFormulaParameter/);
});

test("effect contracts reject unknown semantics and every nested build mismatch", () => {
  assert.throws(() => normalizeCombatEffectDefinition({ ...effect(), futureField: true }), /unknown field/);
  const badCondition = effect();
  badCondition.conditions[0].kind = "nearby_enemy_count";
  assert.throws(() => normalizeCombatEffectDefinition(badCondition), /Unknown/);
  const badPath = effect();
  badPath.conditions[1].left.path = "target.secretDistance";
  assert.throws(() => normalizeCombatEffectDefinition(badPath), /Unknown/);
  const sourceMismatch = effect();
  sourceMismatch.sources[0].gameBuild = "24118851";
  assert.throws(() => normalizeCombatEffectDefinition(sourceMismatch), /does not match definition gameBuild/);
  const evidenceMismatch = effect();
  evidenceMismatch.components[0].provenance.evidence[0].gameBuild = "24118851";
  assert.throws(() => normalizeCombatEffectDefinition(evidenceMismatch), /does not match definition gameBuild/);
  assert.throws(() => normalizeCombatEffectDefinition(effect(), { expectedGameBuild: "24118851" }), /does not match expected gameBuild/);
});

test("unsupported and partial effects cannot smuggle unresolved semantics into execution", () => {
  const unresolvedStage = {
    id: "owner-inclusion",
    gameBuild: BUILD,
    classification: "calibration_required",
    reason: "Owner inclusion requires an in-game observation.",
    executable: false,
    provenance: unsupportedProvenance(),
  };
  const unsupported = effect({
    execution: "unsupported",
    components: [],
    unresolvedStages: [unresolvedStage],
    provenance: unsupportedProvenance(),
  });
  assert.equal(normalizeCombatEffectDefinition(unsupported).execution, "unsupported");
  assert.throws(() => normalizeCombatEffectDefinition({ ...unsupported, components: effect().components }), /cannot contain components/);
  assert.throws(() => normalizeCombatEffectDefinition(effect({ execution: "partial", unresolvedStages: [] })), /require both/);
  const executableUnknown = structuredClone(unsupported);
  executableUnknown.unresolvedStages[0].executable = true;
  assert.throws(() => normalizeCombatEffectDefinition(executableUnknown), /must be false/);
  const modeledUnknown = structuredClone(unsupported);
  modeledUnknown.unresolvedStages[0].provenance = exactProvenance();
  assert.throws(() => normalizeCombatEffectDefinition(modeledUnknown), /must use unsupported precision/);
  const unsupportedComponent = effect();
  unsupportedComponent.components[0].provenance = unsupportedProvenance();
  assert.throws(() => normalizeCombatEffectDefinition(unsupportedComponent), /cannot execute unsupported provenance/);
  const unsupportedRoot = effect({ provenance: unsupportedProvenance() });
  assert.throws(() => normalizeCombatEffectDefinition(unsupportedRoot), /cannot claim unsupported root provenance/);
  assert.throws(() => normalizeCombatEffectDefinition(effect({ triggers: [] })), /require at least one trigger/);
});

test("effect and scenario build matching is explicit", () => {
  assert.equal(assertCombatEffectMatchesScenario(effect(), scenario()), true);
  assert.throws(() => assertCombatEffectMatchesScenario(effect(), scenario({ gameBuild: "24118851" })), /does not match scenario gameBuild/);
});
