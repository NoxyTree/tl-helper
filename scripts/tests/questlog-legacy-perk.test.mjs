import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateBuild,
  calculableItemPerkVariants,
  importQuestlogBuild,
  initCore,
} from "../../web/tl-core.js";

const DARK_WING_POWER = "SkillSet_Unique_Accessory_Skill_01";
const ring = {
  id: "legacy-heroic-ring",
  name: "Legacy Heroic Ring",
  grade: 51,
  equipmentType: "ring",
  itemStats: {
    main: { 0: {} },
    extra: { 0: { cost_max: 1000, melee_armor: 300, range_armor: 300 } },
  },
  availablePerks: [{
    id: DARK_WING_POWER,
    name: "Dark Wing's Power",
    grade: 51,
    passive: { id: DARK_WING_POWER, name: "Dark Wing's Power" },
  }],
};

await initCore({
  items: [ring],
  itemSets: [],
  runes: [],
  runeSynergies: [],
  masteries: [],
  skills: [],
  skillTraits: [],
  attributeStats: {},
});

const imported = importQuestlogBuild({
  character: { name: "Legacy import" },
  build: {
    id: "legacy-import",
    equipment: {
      ring_1: { id: ring.id, itemLevel: 0, perk: DARK_WING_POWER },
    },
  },
}).build;

const total = (calculation, statId) => calculation.stats.find((row) => row.id === statId)?.total ?? 0;

test("Questlog imports preserve a stored Dark Wing's Power copy in addition to the inherent Heroic stats", () => {
  assert.equal(imported.equipment.ring_1.questlogLegacyPerkPassiveId, DARK_WING_POWER);
  const withLegacy = calculateBuild(imported, {});
  const withoutMarker = structuredClone(imported);
  delete withoutMarker.equipment.ring_1.questlogLegacyPerkPassiveId;
  const inherentOnly = calculateBuild(withoutMarker, {});

  assert.equal(total(withLegacy, "cost_max") - total(inherentOnly, "cost_max"), 1000);
  assert.equal(total(withLegacy, "melee_armor") - total(inherentOnly, "melee_armor"), 300);
  assert.equal(total(withLegacy, "range_armor") - total(inherentOnly, "range_armor"), 300);
});

test("retired Dark Wing's Power remains unavailable to manual and optimizer perk generation", () => {
  assert.deepEqual(calculableItemPerkVariants(ring).map((row) => row.perkId), [""]);
});
