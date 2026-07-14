import assert from "node:assert/strict";
import test from "node:test";
import { join, resolve } from "node:path";
import * as core from "../../web/tl-core.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const root = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, "$1"));
const data = await loadWebDataFromFile(join(root, "web", "data", "app-data.json"));
await core.initCore(data);

const attributes = { str: 0, dex: 0, int: 0, per: 0, con: 0 };

test("a clean static build has legal calculation authority", () => {
  const result = core.calculateBuild(core.createInitialBuild(), attributes);
  assert.equal(result.status.state, "legal");
  assert.deepEqual(result.status.blockingIssues, []);
});

test("foreign retained progression is inactive without making totals non-legal", () => {
  const build = core.createInitialBuild();
  const skill = data.skills.find((row) => row.mainCategory === "staff");
  build.skills = [{ skillId: skill.id, level: 1, loadoutType: "passive" }];
  const result = core.calculateBuild(build, attributes);
  assert.equal(result.status.state, "legal");
  assert.ok(result.status.ignoredIssues.some((issue) => issue.code === "foreign_weapon_skill"));
});

test("a recoverable but unresolved build is provisional", () => {
  const build = core.createInitialBuild();
  const ring = data.items.find((item) => item.equipmentType === "ring");
  build.equipment.ring_1 = { ...core.emptyEquipmentSelection(), itemId: ring.id, level: core.itemMaxLevel(ring) };
  build.equipment.ring_2 = { ...core.emptyEquipmentSelection(), itemId: ring.id, level: core.itemMaxLevel(ring) };
  const result = core.calculateBuild(build, attributes);
  assert.equal(result.status.state, "provisional");
  assert.ok(result.status.provisionalIssues.some((issue) => issue.code === "duplicate_item_selection"));
});

test("an impossible loadout is invalid and invalid outranks provisional", () => {
  const build = core.createInitialBuild();
  const weapon = data.items.find((item) => item.equipmentType === "bow");
  const selection = { ...core.emptyEquipmentSelection(), itemId: weapon.id, level: core.itemMaxLevel(weapon) };
  build.equipment.main_hand = structuredClone(selection);
  build.equipment.off_hand = structuredClone(selection);
  const result = core.calculateBuild(build, attributes);
  assert.equal(result.status.state, "invalid");
  assert.ok(result.status.invalidIssues.some((issue) => issue.code === "duplicate_weapon_types"));
  assert.ok(result.status.provisionalIssues.some((issue) => issue.code === "duplicate_item_selection"));
});

test("calculationStatus uses explicit impact rather than severity alone", () => {
  const status = core.calculationStatus({ issues: [
    { severity: "error", calculationImpact: "none", code: "inactive" },
    { severity: "warning", calculationImpact: "provisional", code: "uncertain" },
    { severity: "error", calculationImpact: "invalid", code: "impossible" },
  ] });
  assert.equal(status.state, "invalid");
  assert.deepEqual(status.invalidIssues.map((row) => row.code), ["impossible"]);
  assert.deepEqual(status.provisionalIssues.map((row) => row.code), ["uncertain"]);
  assert.deepEqual(status.ignoredIssues.map((row) => row.code), ["inactive"]);
});

test("unknown selected items, runes, and skills are invalid rather than silently dropped", () => {
  const unknownItemBuild = core.createInitialBuild();
  unknownItemBuild.equipment.head.itemId = "missing-item";
  assert.ok(core.calculateBuild(unknownItemBuild, attributes).status.invalidIssues.some((issue) => issue.code === "invalid_item_id"));

  const unknownRuneBuild = core.createInitialBuild();
  const head = data.items.find((item) => item.equipmentType === "head");
  unknownRuneBuild.equipment.head = { ...core.emptyEquipmentSelection(), itemId: head.id, level: core.itemMaxLevel(head), runes: [{ runeId: "missing-rune", statId: "hp_max", level: 1 }] };
  assert.ok(core.calculateBuild(unknownRuneBuild, attributes).status.invalidIssues.some((issue) => issue.code === "invalid_rune_id"));

  const unknownSkillBuild = core.createInitialBuild();
  unknownSkillBuild.skills = [{ skillId: "missing-skill", level: 1 }];
  assert.ok(core.calculateBuild(unknownSkillBuild, attributes).status.invalidIssues.some((issue) => issue.code === "invalid_skill_id"));
});

test("impossible per-item configuration is invalid instead of being clamped or ignored", () => {
  const build = core.createInitialBuild();
  const head = data.items.find((item) => item.equipmentType === "head" && Object.keys(item.itemStats?.traits ?? {}).length);
  build.equipment.head = {
    ...core.emptyEquipmentSelection(),
    itemId: head.id,
    level: core.itemMaxLevel(head),
    traits: [{ statId: "missing_trait", tier: 99 }],
    heroicEffects: [{ statId: "missing_heroic", level: 99 }],
    potentialId: "missing_potential",
  };
  const invalidCodes = core.calculateBuild(build, attributes).status.invalidIssues.map((issue) => issue.code);
  assert.ok(invalidCodes.includes("invalid_trait_selection"));
  assert.ok(invalidCodes.includes("invalid_heroic_effect"));
  assert.ok(invalidCodes.includes("invalid_item_potential"));
});

test("decoded Overall Mastery exclusivity and supplied unlock level are enforced", () => {
  const mutuallyExclusive = core.createInitialBuild();
  mutuallyExclusive.unifiedMasteries = ["WM_Common_SKILL_002", "WM_Common_SKILL_024"];
  assert.ok(core.calculateBuild(mutuallyExclusive, attributes).status.invalidIssues.some((issue) => issue.code === "unified_mastery_mutual_exclusion"));

  const gated = core.createInitialBuild();
  const unified = data.masteries.find((row) => row.specializationType === "unified" && Number(row.requiredLevel) > 0);
  gated.unifiedMasteries = [unified.id];
  gated.overallMasteryLevel = Number(unified.requiredLevel) - 1;
  assert.ok(core.calculateBuild(gated, attributes).status.invalidIssues.some((issue) => issue.code === "unified_mastery_level_missing"));

  const unknownLevel = core.createInitialBuild();
  const mappedUnified = data.masteries.find((row) => row.id === "WM_Common_SKILL_007");
  unknownLevel.unifiedMasteries = [mappedUnified.id];
  assert.ok(core.calculateBuild(unknownLevel, attributes).status.provisionalIssues.some((issue) => issue.code === "overall_mastery_level_unknown"));
  unknownLevel.overallMasteryLevel = Number(mappedUnified.requiredLevel);
  assert.equal(core.calculateBuild(unknownLevel, attributes).status.state, "legal");
});

test("attribute allocation accepts 59 points and rejects malformed, excess, or injected stats", () => {
  assert.equal(core.calculateBuild(core.createInitialBuild(), { ...attributes, str: 59 }).status.state, "legal");

  const malformed = core.calculateBuild(core.createInitialBuild(), { ...attributes, str: 1.5 });
  assert.ok(malformed.status.invalidIssues.some((issue) => issue.code === "invalid_attribute_allocation"));

  const excess = core.calculateBuild(core.createInitialBuild(), { ...attributes, str: 60 });
  assert.ok(excess.status.invalidIssues.some((issue) => issue.code === "attribute_budget_exceeded"));

  const injected = core.calculateBuild(core.createInitialBuild(), { ...attributes, critical_damage: 999999 });
  assert.ok(injected.status.invalidIssues.some((issue) => issue.code === "unknown_attribute_id"));
  assert.equal(injected.stats.find((row) => row.id === "critical_damage")?.total ?? 0, 0);
});

test("malformed or duplicate skill specialization selections are non-legal", () => {
  const skill = data.skills.find((row) => row.specializationIds?.length);
  const malformed = core.createInitialBuild();
  malformed.skills = [{ skillId: skill.id, level: 1, specializationIds: "not-an-array" }];
  assert.ok(core.calculateBuild(malformed, attributes).status.provisionalIssues.some((issue) => issue.code === "invalid_skill_specialization_collection"));

  const duplicate = core.createInitialBuild();
  duplicate.skills = [{ skillId: skill.id, level: 1, specializationIds: [skill.specializationIds[0], skill.specializationIds[0]] }];
  assert.ok(core.calculateBuild(duplicate, attributes).status.provisionalIssues.some((issue) => issue.code === "duplicate_skill_specialization"));
});

test("rune socket count and non-equipment rune injection are invalid", () => {
  const head = data.items.find((item) => item.equipmentType === "head");
  const rune = data.runes.find((row) => row.equipmentCategory === "head" && row.runeType !== "chaos");
  const option = core.runeStatOptions(rune)[0];
  const row = { runeId: rune.id, statId: option.statId, level: 1 };
  const overSocketed = core.createInitialBuild();
  overSocketed.equipment.head = { ...core.emptyEquipmentSelection(), itemId: head.id, level: core.itemMaxLevel(head), runes: [row, row, row, row] };
  assert.ok(core.calculateBuild(overSocketed, attributes).status.invalidIssues.some((issue) => issue.code === "rune_socket_cap_exceeded"));

  const talistone = data.items.find((item) => item.equipmentType === "talistone1");
  const injected = core.createInitialBuild();
  injected.artifacts.talistone1 = { ...core.emptyEquipmentSelection(), itemId: talistone.id, level: core.itemMaxLevel(talistone), runes: [row] };
  assert.ok(core.calculateBuild(injected, attributes).status.invalidIssues.some((issue) => issue.code === "invalid_rune_slot"));
});

test("complete slot replacement status rejects a second Heroic in one equipment group", () => {
  const head = data.items.find((item) => item.equipmentType === "head" && item.grade === core.HEROIC_GRADE);
  const chest = data.items.find((item) => item.equipmentType === "chest" && item.grade === core.HEROIC_GRADE);
  const build = core.createInitialBuild();
  build.equipment.head = { ...core.emptyEquipmentSelection(), itemId: head.id, level: core.itemMaxLevel(head) };
  assert.equal(core.calculateBuild(build, attributes).status.state, "legal");
  const status = core.slotSelectionCalculationStatus("chest", { ...core.emptyEquipmentSelection(), itemId: chest.id, level: core.itemMaxLevel(chest) }, build, attributes);
  assert.equal(status.state, "invalid");
  assert.ok(status.invalidIssues.some((issue) => issue.code === "heroic_slot_cap_exceeded"));
});

test("Heroic cap is one weapon, one armor, and one accessory broad group", () => {
  const heroic = (type) => data.items.find((item) => item.equipmentType === type && item.grade === core.HEROIC_GRADE);
  const put = (build, slot, item) => { build.equipment[slot] = { ...core.emptyEquipmentSelection(), itemId: item.id, level: core.itemMaxLevel(item) }; };

  const onePerGroup = core.createInitialBuild();
  put(onePerGroup, "main_hand", heroic("bow"));
  put(onePerGroup, "head", heroic("head"));
  put(onePerGroup, "necklace", heroic("necklace"));
  assert.equal(core.calculateBuild(onePerGroup, attributes).status.state, "legal");

  for (const [firstSlot, firstType, secondSlot, secondType] of [
    ["main_hand", "bow", "off_hand", "staff"],
    ["head", "head", "chest", "chest"],
    ["necklace", "necklace", "bracelet", "bracelet"],
  ]) {
    const build = core.createInitialBuild();
    put(build, firstSlot, heroic(firstType));
    put(build, secondSlot, heroic(secondType));
    assert.ok(core.calculateBuild(build, attributes).status.invalidIssues.some((issue) => issue.code === "heroic_slot_cap_exceeded"));
  }
});
