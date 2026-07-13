import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initCore } from "../../web/tl-core.js";

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

  assert.ok(pool.length > 0);
  assert.ok(references.length > pool.length);
  assert.equal(new Set(pool.map((potential) => JSON.stringify(potential))).size, pool.length);
  assert.ok(references.every((ref) => Number.isInteger(ref) && pool[ref]));
  assert.ok(projection.data.items.every((item) => item.itemPotentialRef === undefined || item.itemPotential === undefined));
});
