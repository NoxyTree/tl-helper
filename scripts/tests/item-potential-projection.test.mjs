import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importQuestlogBuild, initCore } from "../../web/tl-core.js";
import { staticCalculationFingerprint } from "../../web/tl-build-snapshot.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function minimalData(overrides = {}) {
  return {
    items: [],
    itemSets: [],
    runes: [],
    masteries: [],
    skills: [],
    skillTraits: [],
    ...overrides,
  };
}

test("initCore restores interned item potentials to the runtime item API", async () => {
  const potential = {
    groupId: "potential-a",
    stats: [{ statId: "all_critical_attack", value: 120, probability: 25 }],
    skills: [],
  };
  const result = await initCore(minimalData({
    items: [
      { id: "with-potential", name: "With", equipmentType: "head", itemPotentialRef: 0 },
      { id: "same-potential", name: "Same", equipmentType: "chest", itemPotentialRef: 0 },
      { id: "without-potential", name: "Without", equipmentType: "head", itemPotential: null },
    ],
    itemPotentialPool: [potential],
  }));

  assert.deepEqual(result.data.items[0].itemPotential, potential);
  assert.equal("itemPotentialRef" in result.data.items[0], false);
  assert.equal("itemPotentialPool" in result.data, false);
  assert.notEqual(result.data.items[0].itemPotential, result.data.items[1].itemPotential);
  assert.notEqual(result.data.items[0].itemPotential.stats[0], result.data.items[1].itemPotential.stats[0]);
  assert.equal(result.data.items[2].itemPotential, null);
});

test("initCore continues to accept legacy expanded item potentials", async () => {
  const potential = { groupId: "legacy", stats: [], skills: [] };
  const result = await initCore(minimalData({
    items: [{ id: "legacy", name: "Legacy", equipmentType: "head", itemPotential: potential }],
  }));

  assert.equal(result.data.items[0].itemPotential, potential);
});

test("initCore rejects dangling item potential references", async () => {
  await assert.rejects(
    () => initCore(minimalData({
      items: [{ id: "broken", name: "Broken", equipmentType: "head", itemPotentialRef: 2 }],
      itemPotentialPool: [],
    })),
    /Invalid itemPotentialRef 2 for item broken/,
  );
});

test("generated equipment projection interns repeated potential tables", async () => {
  const projection = JSON.parse(await readFile(path.join(root, "web/data/projections/equipment.json"), "utf8"));
  assert.equal(projection.schemaVersion, 2);
  const pool = projection.data.itemPotentialPool;
  const references = projection.data.items
    .filter((item) => item.itemPotentialRef !== undefined)
    .map((item) => item.itemPotentialRef);

  assert.equal(pool.length, 3);
  assert.deepEqual(pool.map((potential) => potential.groupId), ["Potential_Weapon", "Potential_Acc", "Potential_Equip"]);
  assert.equal(references.length, 193);
  assert.deepEqual(pool.map((_, ref) => references.filter((candidate) => candidate === ref).length), [80, 49, 64]);
  assert.deepEqual(pool.map((potential) => potential.stats.length), [4, 8, 8]);
  assert.deepEqual(pool.map((potential) => potential.skills.length), [60, 60, 60]);
  assert.equal(pool.flatMap((potential) => potential.stats).length, 20);
  const skillIds = pool.flatMap((potential) => potential.skills.map((skill) => skill.id));
  assert.equal(skillIds.length, 180);
  assert.equal(new Set(skillIds).size, 180);
  assert.equal(new Set(pool.map((potential) => JSON.stringify(potential))).size, pool.length);
  assert.ok(references.every((ref) => Number.isInteger(ref) && pool[ref]));
  assert.ok(projection.data.items.every((item) => item.itemPotentialRef === undefined || item.itemPotential === undefined));
});

test("Questlog import preserves stat and skill potential IDs plus raw Ascended level", async () => {
  const statId = "all_critical_attack";
  const skillId = "SkillSet_Test_Potential_Active";
  const item = {
    id: "potential-carrier",
    name: "Potential Carrier",
    equipmentType: "head",
    itemPotential: {
      groupId: "Potential_Equip",
      stats: [{ statId, value: 500, probability: 50 }],
      skills: [{ id: skillId, name: "Potential Skill", description: "", probability: 50 }],
    },
    itemStats: {},
  };
  const skill = {
    id: skillId,
    name: "Potential Skill",
    skillType: "active",
    mainCategory: "sword",
    maxLevel: 21,
    levels: Array.from({ length: 21 }, (_, index) => ({ level: index + 1 })),
  };
  await initCore(minimalData({ gameBuild: "24118850", items: [item], skills: [skill] }));

  const imported = (potential) => importQuestlogBuild({
    character: { name: "Potential Tester" },
    build: { id: "imported", equipment: { head: { id: item.id, itemLevel: 0, potential } } },
    skillBuild: { active: [{ skillId, lvl: 21 }] },
  }).build;

  const statBuild = imported(statId);
  const skillBuild = imported(skillId);
  assert.equal(statBuild.equipment.head.potentialId, statId);
  assert.equal(skillBuild.equipment.head.potentialId, skillId);
  assert.equal(statBuild.skills[0].level, 21);
  assert.equal(skillBuild.skills[0].level, 21);
});

test("static calculation fingerprints retain raw potential and Ascended inputs", async () => {
  const statId = "all_critical_attack";
  const skillId = "SkillSet_Test_Potential_Active";
  const item = {
    id: "potential-fingerprint-carrier",
    name: "Potential Fingerprint Carrier",
    equipmentType: "head",
    itemPotential: {
      groupId: "Potential_Equip",
      stats: [{ statId, value: 500, probability: 50 }],
      skills: [{ id: skillId, name: "Potential Skill", description: "", probability: 50 }],
    },
    itemStats: {},
  };
  const skill = {
    id: skillId,
    name: "Potential Skill",
    skillType: "active",
    mainCategory: "sword",
    maxLevel: 21,
    levels: Array.from({ length: 21 }, (_, index) => ({ level: index + 1 })),
  };
  await initCore(minimalData({ gameBuild: "24118850", items: [item], skills: [skill] }));
  const build = {
    equipment: { head: { itemId: item.id, potentialId: statId } },
    skills: [{ skillId, level: 21, loadoutType: "active", specializationIds: [] }],
  };
  const attributes = { str: 0, dex: 0, int: 0, per: 0, con: 0 };
  const statFingerprint = staticCalculationFingerprint({ build, attributes });
  const skillPotentialBuild = structuredClone(build);
  skillPotentialBuild.equipment.head.potentialId = skillId;
  const skillFingerprint = staticCalculationFingerprint({ build: skillPotentialBuild, attributes });

  assert.notEqual(statFingerprint, skillFingerprint);
  const raw = JSON.parse(skillFingerprint).build;
  assert.equal(raw.equipment.head.potentialId, skillId);
  assert.equal(raw.skills[0].level, 21);
});
