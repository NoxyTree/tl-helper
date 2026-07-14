import assert from "node:assert/strict";
import test from "node:test";
import {
  COMBAT_EFFECT_DEFINITION_SCHEMA,
  COMBAT_EFFECT_DEFINITION_SCHEMA_VERSION,
  COMBAT_SCENARIO_SCHEMA,
  COMBAT_SCENARIO_SCHEMA_VERSION,
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
  assert.throws(() => { normalized.target.distanceMeters = "99"; }, TypeError);
  input.environment.weather = "clear";
  input.participants[1].equippedWeaponTypes.push("staff");
  assert.equal(normalized.environment.weather, "rain");
  assert.deepEqual(normalized.participants[0].equippedWeaponTypes, ["dagger", "longbow"]);
  assert.deepEqual(normalized.participants[0].resources, {
    health: { currentRatioBps: 5000 },
    mana: { currentRatioBps: 3300 },
  });
});

test("combat scenario v2 validates exact participant resource ratios", () => {
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

test("combat scenario v1 migrates to canonical v2 without resource semantics", () => {
  const input = scenario({ schemaVersion: 1 });
  for (const participant of input.participants) delete participant.resources;
  const migrated = normalizeCombatScenario(input);
  assert.equal(migrated.schemaVersion, 2);
  assert.ok(migrated.participants.every((participant) => Object.keys(participant.resources).length === 0));

  const smuggled = scenario({ schemaVersion: 1 });
  assert.throws(() => normalizeCombatScenario(smuggled), /unknown field/);
  assert.throws(() => normalizeCombatScenario(scenario({ schemaVersion: 3 })), /Unsupported combat scenario schemaVersion/);
});

test("scenario normalization is deterministic across non-semantic input ordering", () => {
  const left = normalizeCombatScenario(scenario());
  const reordered = scenario();
  reordered.participants.reverse();
  reordered.actions.reverse();
  reordered.participants[1].equippedWeaponTypes.reverse();
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
