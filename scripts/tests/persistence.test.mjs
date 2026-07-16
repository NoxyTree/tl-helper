import assert from "node:assert/strict";
import test from "node:test";
import {
  ARMORY_PRESETS_SCHEMA,
  ARMORY_STATE_KEY,
  ARMORY_STATE_SCHEMA,
  loadArmoryState,
  parseArmoryPresets,
  parseArmoryState,
  serializeArmoryPresets,
  serializeArmoryState,
} from "../../web/tl-persistence.js";

const legacy = {
  profile: { name: "Legacy" },
  attributes: { str: 50 },
  build: {
    equipment: { main_hand: { itemId: "unknown-future-item" } },
    skills: [{ skillId: "unknown-future-skill" }],
    futureField: { preserved: true },
  },
};

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    keys: () => [...values.keys()],
    value: (key) => values.get(key),
  };
}

test("legacy v2 Armory state migrates without losing unknown IDs or fields", () => {
  const result = parseArmoryState(JSON.stringify(legacy), { currentGameBuild: "24118850" });
  assert.equal(result.ok, true);
  assert.equal(result.migrated, true);
  assert.equal(result.data.build.equipment.main_hand.itemId, "unknown-future-item");
  assert.equal(result.data.build.skills[0].skillId, "unknown-future-skill");
  assert.deepEqual(result.data.build.futureField, { preserved: true });
});

test("legacy v1 key is used when current key is absent", () => {
  const storage = memoryStorage({ "tlhelper-builder-state-v1": JSON.stringify(legacy) });
  const result = loadArmoryState(storage, { currentGameBuild: "24118850" });
  assert.equal(result.ok, true);
  assert.equal(result.sourceKey, "tlhelper-builder-state-v1");
});

test("current Armory document round-trips with schema and build provenance", () => {
  const json = serializeArmoryState(legacy, { gameBuild: "24118850", savedAt: "2026-07-10T00:00:00.000Z" });
  const document = JSON.parse(json);
  assert.equal(document.schema, ARMORY_STATE_SCHEMA);
  assert.equal(document.schemaVersion, 1);
  const result = parseArmoryState(json, { currentGameBuild: "24118850" });
  assert.equal(result.ok, true);
  assert.equal(result.migrated, false);
  assert.deepEqual(result.data, legacy);
  assert.deepEqual(result.warnings, []);
});

test("current Armory document preserves nested rune and mastery selections", () => {
  const state = structuredClone(legacy);
  state.build.equipment.main_hand.runes = [
    { runeId: "Weapon_Atk_Rune_Epic", statId: "melee_accuracy", level: 17 },
    { runeId: "Weapon_Support_Rune_Epic_II", statId: "skill_cooldown_modifier", level: 20 },
    { runeId: "", statId: "", level: 1 },
  ];
  state.build.masteries = {
    Sword_Normal_Attack_01: { level: 6 },
    Sword_Normal_Attack_Skill: { level: 1 },
  };
  state.build.unifiedMasteries = ["Unified_Attack_01", "Unified_Defense_02"];

  const json = serializeArmoryState(state, { gameBuild: "24118850" });
  const result = parseArmoryState(json, { currentGameBuild: "24118850" });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.build.equipment.main_hand.runes, state.build.equipment.main_hand.runes);
  assert.deepEqual(result.data.build.masteries, state.build.masteries);
  assert.deepEqual(result.data.build.unifiedMasteries, state.build.unifiedMasteries);
});

test("current Armory documents preserve stat and skill potentials plus raw Ascended skill level", () => {
  const state = structuredClone(legacy);
  state.build.equipment.main_hand.potentialId = "all_critical_attack";
  state.build.equipment.head = {
    itemId: "potential-armor",
    potentialId: "SkillSet_WP_ST_S_MainAttack",
  };
  state.build.skills = [{
    skillId: "SkillSet_WP_ST_S_MainAttack",
    level: 21,
    loadoutType: "active",
    specializationIds: [],
  }];

  const json = serializeArmoryState(state, { gameBuild: "24118850" });
  const result = parseArmoryState(json, { currentGameBuild: "24118850" });

  assert.equal(result.ok, true);
  assert.equal(result.data.build.equipment.main_hand.potentialId, "all_critical_attack");
  assert.equal(result.data.build.equipment.head.potentialId, "SkillSet_WP_ST_S_MainAttack");
  assert.equal(result.data.build.skills[0].level, 21);
  assert.deepEqual(result.data, state);
});

test("preset export and import validates and preserves entries", () => {
  const preset = { ...legacy, id: "preset-1", name: "Saved build" };
  const json = serializeArmoryPresets([preset], { gameBuild: "24118850" });
  assert.equal(JSON.parse(json).schema, ARMORY_PRESETS_SCHEMA);
  assert.deepEqual(parseArmoryPresets(json, { currentGameBuild: "24118850" }).data, [preset]);
  assert.equal(parseArmoryPresets(JSON.stringify([{ id: "broken" }])).status, "invalid");
});

test("future schema versions are rejected without interpreting their data", () => {
  const result = parseArmoryState({
    schema: ARMORY_STATE_SCHEMA,
    schemaVersion: 99,
    gameBuild: "99999999",
    data: legacy,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "unsupported");
});

test("corrupt current state is preserved and legacy fallback can recover", () => {
  const storage = memoryStorage({
    [ARMORY_STATE_KEY]: "{not-json",
    "tlhelper-builder-state-v1": JSON.stringify(legacy),
  });
  const result = loadArmoryState(storage, { currentGameBuild: "24118850" });
  assert.equal(result.ok, true);
  assert.equal(result.sourceKey, "tlhelper-builder-state-v1");
  const recoveryKey = storage.keys().find((key) => key.startsWith(`${ARMORY_STATE_KEY}:recovery:`));
  assert.ok(recoveryKey);
  assert.equal(storage.value(recoveryKey), "{not-json");
});

test("game build mismatch returns a warning while preserving the build", () => {
  const json = serializeArmoryState(legacy, { gameBuild: "23000000" });
  const result = parseArmoryState(json, { currentGameBuild: "24118850" });
  assert.equal(result.ok, true);
  assert.match(result.warnings[0], /23000000.*24118850/);
  assert.equal(result.data.build.equipment.main_hand.itemId, "unknown-future-item");
});
