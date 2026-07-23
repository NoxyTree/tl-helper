import test from "node:test";
import assert from "node:assert/strict";
import {
  adjustMasterySelection,
  EQUIPMENT_SLOTS,
  initCore,
  label,
  masteryLockInfo,
  reconcileMasterySelections,
  WEAPON_TYPES,
  weaponHitProfile,
} from "../../web/tl-core.js";

const tiers = Array.from({ length: 10 }, (_, index) => [[{ statId: "melee_accuracy", value: index + 1 }]]).map((row) => row[0]);

function normal(id, grade = 11, subCategory = "attack") {
  return { id, name: id, mainCategory: "sword", subCategory, specializationType: "normal", grade, nodeNumber: Number(id.match(/\d+/)?.[0] || 1), stats: tiers, passives: [] };
}

function synergy(id, grade = 11, subCategory = "attack", nodeNumber = 100) {
  return { id, name: id, mainCategory: "sword", subCategory, specializationType: "synergy", grade, nodeNumber, stats: [], passives: ["Passive"] };
}

function epic(id, subCategory = "attack", nodeNumber = 200) {
  return { ...normal(id, 41, subCategory), nodeNumber };
}

const masteries = [
  ...Array.from({ length: 12 }, (_, index) => normal(`common-${index + 1}`)),
  normal("defense-1", 11, "defense"),
  normal("defense-2", 11, "defense"),
  synergy("attack-passive", 11, "attack", 101),
  synergy("defense-passive", 11, "defense", 102),
  synergy("third-passive", 11, "attack", 103),
  epic("epic-attack", "attack", 201),
  epic("epic-attack-2", "attack", 202),
];

await initCore({ items: [], runes: [], itemSets: [], masteries, skills: [], skillTraits: [] });

test("Sword and Shield is represented as one weapon family", () => {
  assert.equal(label("sword"), "Sword and Shield");
  assert.equal(WEAPON_TYPES.includes("shield"), false);
  assert.equal(EQUIPMENT_SLOTS.find((slot) => slot.id === "off_hand").types.includes("shield"), false);
});

test("weaponHitProfile maps weapon families to their hit stat", () => {
  assert.deepEqual(weaponHitProfile("bow"), { key: "ranged", statId: "range_accuracy", label: "Ranged Hit Chance" });
  assert.deepEqual(weaponHitProfile("staff"), { key: "magic", statId: "magic_accuracy", label: "Magic Hit Chance" });
  assert.deepEqual(weaponHitProfile("sword2h"), { key: "melee", statId: "melee_accuracy", label: "Melee Hit Chance" });
});

test("mastery adjustment increments, decrements, and clears", () => {
  const build = { masteries: {} };
  assert.equal(adjustMasterySelection(build, "common-1", 1).level, 1);
  assert.equal(adjustMasterySelection(build, "common-1", 1).level, 2);
  assert.equal(adjustMasterySelection(build, "common-1", -1).level, 1);
  assert.equal(adjustMasterySelection(build, "common-1", -1).level, 0);
  adjustMasterySelection(build, "common-1", 5);
  assert.equal(adjustMasterySelection(build, "common-1", 0, { clear: true }).level, 0);
});

test("eligible passive synergies are selected deterministically and removed below 20", () => {
  const build = { masteries: { "common-1": { level: 10 }, "common-2": { level: 9 } } };
  adjustMasterySelection(build, "common-2", 1);
  assert.ok(build.masteries["attack-passive"]);
  assert.ok(build.masteries["third-passive"]);
  assert.equal(Object.keys(build.masteries).filter((id) => id.endsWith("passive")).length, 2);

  adjustMasterySelection(build, "common-2", -1);
  assert.equal(build.masteries["attack-passive"], undefined);
  assert.equal(build.masteries["third-passive"], undefined);
});

test("Epic requirements exclude Epic levels so a node cannot support itself", () => {
  const build = { masteries: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`common-${index + 1}`, { level: 10 }])) };
  reconcileMasterySelections("sword", build);
  assert.equal(masteryLockInfo(masteries.find((node) => node.id === "epic-attack"), "sword", build).locked, false);
  build.masteries["epic-attack"] = { level: 10 };
  build.masteries["common-8"].level = 9;
  const removed = reconcileMasterySelections("sword", build);
  assert.equal(build.masteries["epic-attack"], undefined);
  assert.ok(removed.includes("epic-attack"));
});

test("only two automatically selected synergies are allowed per tier", () => {
  const build = {
    masteries: {
      "common-1": { level: 10 },
      "common-2": { level: 10 },
      "defense-1": { level: 10 },
      "defense-2": { level: 10 },
    },
  };
  reconcileMasterySelections("sword", build);
  const selected = ["attack-passive", "defense-passive", "third-passive"].filter((id) => build.masteries[id]);
  assert.deepEqual(selected, ["attack-passive", "defense-passive"]);
});
