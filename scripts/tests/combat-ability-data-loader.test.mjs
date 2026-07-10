import assert from "node:assert/strict";
import test from "node:test";
import {
  COMBAT_ABILITY_DATA_SCHEMA,
  COMBAT_ABILITY_DATA_SCHEMA_VERSION,
  loadCombatAbilityData,
} from "../../packages/combat-engine/src/ability-data.mjs";

const BUILD = "24118850";

function ability(id, gameBuild = BUILD) {
  return {
    schema: "tl-helper.combat-ability-definition",
    schemaVersion: 1,
    gameBuild,
    id,
    abilityId: id,
    name: `Ability ${id}`,
    weapon: "test-weapon",
    kind: "damage",
    skillLevelRange: { minimum: 1, maximum: 1 },
    formulaComponents: [],
    unresolvedStages: [{
      id: "damage-pipeline",
      gameBuild,
      stage: "damage-pipeline",
      reason: "Not calibrated.",
      classification: "calibration_required",
      precision: "unsupported",
      provenance: "unresolved",
      evidence: [{ kind: "test", reference: "fixture", gameBuild }],
    }],
  };
}

function artifact(abilities = [ability("gaia-crash")]) {
  return {
    schema: COMBAT_ABILITY_DATA_SCHEMA,
    schemaVersion: COMBAT_ABILITY_DATA_SCHEMA_VERSION,
    gameBuild: BUILD,
    abilities,
  };
}

test("loads, normalizes, sorts, and deeply freezes an ability artifact", () => {
  const input = artifact([ability("swift-healing"), ability("Gaia-Crash"), ability("gaia-crash")]);
  const data = loadCombatAbilityData(input);

  assert.equal(data.schema, COMBAT_ABILITY_DATA_SCHEMA);
  assert.equal(data.schemaVersion, COMBAT_ABILITY_DATA_SCHEMA_VERSION);
  assert.equal(data.gameBuild, BUILD);
  assert.deepEqual(data.listAbilities().map(({ id }) => id), ["Gaia-Crash", "gaia-crash", "swift-healing"]);
  assert.strictEqual(data.abilities, data.listAbilities());
  assert.strictEqual(data.getAbility("gaia-crash"), data.listAbilities()[1]);
  assert.equal(data.getAbility("missing"), undefined);

  assert.ok(Object.isFrozen(data));
  assert.ok(Object.isFrozen(data.abilities));
  assert.ok(Object.isFrozen(data.getAbility("gaia-crash")));
  assert.ok(Object.isFrozen(data.getAbility("gaia-crash").unresolvedStages));
  assert.ok(Object.isFrozen(data.getAbility("gaia-crash").unresolvedStages[0].evidence[0]));

  input.abilities[2].name = "Changed after load";
  assert.equal(data.getAbility("gaia-crash").name, "Ability gaia-crash");
  assert.throws(() => data.abilities.push(ability("other")), TypeError);
});

test("rejects unsupported envelopes and unknown top-level keys", () => {
  assert.throws(
    () => loadCombatAbilityData({ ...artifact(), schema: "other" }),
    /Unsupported combat ability data schema/,
  );
  assert.throws(
    () => loadCombatAbilityData({ ...artifact(), schemaVersion: 2 }),
    /Unsupported combat ability data schemaVersion/,
  );
  assert.throws(
    () => loadCombatAbilityData({ ...artifact(), extra: true }),
    /Unknown combat ability data key: extra/,
  );
  assert.throws(() => loadCombatAbilityData(null), /must be an object/);
  assert.throws(() => loadCombatAbilityData({ ...artifact(), abilities: {} }), /must be an array/);
});

test("rejects mixed builds and duplicate normalized ability ids", () => {
  assert.throws(
    () => loadCombatAbilityData(artifact([ability("gaia-crash", "999")])),
    /gameBuild 999 does not match combat ability data gameBuild 24118850/,
  );
  assert.throws(
    () => loadCombatAbilityData(artifact([ability("gaia-crash"), ability("gaia-crash")])),
    /Duplicate combat ability id: gaia-crash/,
  );
});

test("getAbility requires an exact string id", () => {
  const data = loadCombatAbilityData(artifact());
  assert.throws(() => data.getAbility(1), /Ability id must be a string/);
  assert.equal(data.getAbility("GAIA-CRASH"), undefined);
});
