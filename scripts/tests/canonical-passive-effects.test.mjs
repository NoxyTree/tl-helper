import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PASSIVE_EFFECT_CONTRACT } from "../../web/tl-passive-effect-contract.js";
import {
  ITEM_PASSIVE_RULES,
  MASTERY_SYNERGY_RULES,
  PASSIVE_SKILL_RULES,
  PERK_PASSIVE_RULES,
  UNIFIED_MASTERY_RULES,
} from "../../web/tl-questlog-rules.js";

const readProjection = (relativePath) => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
const skillsProjection = readProjection("../../web/data/projections/skills.json");
const progressionProjection = readProjection("../../web/data/projections/progression.json");
const equipmentProjection = readProjection("../../web/data/projections/equipment.json");
const contract = PASSIVE_EFFECT_CONTRACT;

const sorted = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
const assertExactSet = (actual, expected, message) => {
  assert.deepEqual(sorted(actual), sorted(expected), message);
};
const assertSortedUnique = (ids, message) => {
  assert.deepEqual(ids, sorted(ids), message);
};
const flattenedClasses = (family) => Object.values(family.classes).flat();
const classCounts = (family) => Object.fromEntries(
  Object.entries(family.classes).map(([name, ids]) => [name, ids.length]),
);
const assertPartition = (family, universe, allowedClasses, label) => {
  assert.deepEqual(Object.keys(family.classes).sort(), [...allowedClasses].sort(), label + " class names drifted");
  const flattened = flattenedClasses(family);
  const duplicates = sorted(flattened.filter((id, index) => flattened.indexOf(id) !== index));
  assert.deepEqual(duplicates, [], label + " contains duplicate classifications");
  assert.equal(flattened.length, family.expectedCount, label + " classified count drifted");
  assert.deepEqual(classCounts(family), family.expectedClassCounts, label + " class counts drifted");
  assertExactSet(flattened, universe, label + " must classify the exact projection universe");
  assert.equal(Object.hasOwn(family, "defaultClassification"), false, label + " must not use a default classification");
  for (const [className, ids] of Object.entries(family.classes)) {
    assertSortedUnique(ids, label + " class must be deterministically sorted: " + className);
  }
};

const passiveIds = skillsProjection.data.skills
  .filter((row) => row.skillType === "passive")
  .map((row) => row.id);
const nonStructuredRows = progressionProjection.data.masteries
  .filter((row) => row.specializationType !== "normal" || !(row.stats?.length));
const nonStructuredIds = nonStructuredRows.map((row) => row.id);
const items = equipmentProjection.data.items;
const innateIds = items.map((item) => item.passives?.id).filter(Boolean);
const perkIds = items.flatMap((item) => (item.availablePerks ?? []).map((perk) => perk.passive?.id).filter(Boolean));
const itemComplexIds = sorted([...innateIds, ...perkIds]);

test("passive-effect contract metadata matches all source projections", () => {
  assert.equal(contract.schema, "tl-helper.passive-effect-contract");
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.gameBuild, "24118850");
  assert.equal(skillsProjection.gameBuild, contract.gameBuild);
  assert.equal(progressionProjection.gameBuild, contract.gameBuild);
  assert.equal(equipmentProjection.gameBuild, contract.gameBuild);
  assert.equal(Object.hasOwn(contract, "defaultClassification"), false);
});

test("all 80 projected weapon passives have one explicit semantic class", () => {
  const family = contract.families.weaponPassive;
  assert.equal(new Set(passiveIds).size, 80);
  assertPartition(family, passiveIds, ["persistentStatic", "conditional"], "weapon passive contract");
});

test("mixed weapon passives declare conditional remainders without breaking the source partition", () => {
  const family = contract.families.weaponPassive;
  assert.deepEqual(family.scenarioComponents, [
    {
      sourceId: "SkillSet_WP_BO_S_AuraDefenceUp",
      componentKind: "conditional_remainder",
      staticComponent: {
        summary: "The decoded one-member self minimum is calculated at the selected passive level; additional party-member bands require an explicit proximity scenario.",
        authority: "web/tl-questlog-rules.js PASSIVE_SKILL_RULES.SkillSet_WP_BO_S_AuraDefenceUp",
      },
    },
    {
      sourceId: "SkillSet_WP_ST_S_ManaRegenBuff",
      componentKind: "conditional_remainder",
      staticComponent: {
        summary: "The always-active Mana Regen curve is calculated at the selected passive level.",
        authority: "web/tl-questlog-rules.js PASSIVE_SKILL_RULES.SkillSet_WP_ST_S_ManaRegenBuff",
      },
    },
    {
      sourceId: "SkillSet_WP_SW_SH_S_AroundCountBuff",
      componentKind: "conditional_remainder",
      staticComponent: {
        summary: "The decoded two-or-fewer-target minimum All Defense value is calculated; higher nearby-target bands require an explicit target-count scenario.",
        authority: "web/tl-questlog-rules.js PASSIVE_SKILL_RULES.SkillSet_WP_SW_SH_S_AroundCountBuff",
      },
    },
  ]);
  for (const component of family.scenarioComponents) {
    assert.equal(component.componentKind, "conditional_remainder");
    assert.ok(component.staticComponent?.summary);
    assert.equal(component.staticComponent?.authority, `web/tl-questlog-rules.js PASSIVE_SKILL_RULES.${component.sourceId}`);
    assert.equal(family.classes.persistentStatic.includes(component.sourceId), true);
    assert.equal(family.classes.conditional.includes(component.sourceId), false);
    assert.equal(PASSIVE_SKILL_RULES[component.sourceId] !== undefined, true);
  }
});

test("all 193 non-structured mastery nodes have one explicit semantic class", () => {
  const family = contract.families.masteryNonStructured;
  const breakdown = Object.fromEntries(["normal", "synergy", "unified"].map((kind) => [
    kind,
    nonStructuredRows.filter((row) => row.specializationType === kind).length,
  ]));
  assert.equal(new Set(nonStructuredIds).size, 193);
  assert.deepEqual(breakdown, family.expectedBreakdown);
  assertPartition(family, nonStructuredIds, ["persistentStatic", "persistentUnrepresentable", "conditional"], "non-structured mastery contract");
});

test("all 294 item and perk complexes have one explicit semantic class", () => {
  const family = contract.families.itemPerkComplex;
  assert.deepEqual(
    { innate: new Set(innateIds).size, perk: new Set(perkIds).size, union: itemComplexIds.length },
    family.expectedBreakdown,
  );
  assertPartition(
    family,
    itemComplexIds,
    ["persistentStatic", "retiredInherent", "persistentOwnerSemanticsUnresolved", "sourceConflict", "unresolvedDecode", "conditional"],
    "item and perk complex contract",
  );
});

test("weapon passive rule bindings exactly match mapped persistent semantics", () => {
  const binding = contract.bindings.passiveSkillRule;
  assertExactSet(Object.keys(PASSIVE_SKILL_RULES), binding, "passive rule registry drifted");
  assertExactSet(binding, contract.families.weaponPassive.classes.persistentStatic, "persistent passive binding drifted");
  assert.equal(binding.length, 18);
  assertExactSet(binding.filter((id) => passiveIds.includes(id)), binding, "passive binding is not projected");
});

test("mastery direct and passive-interaction bindings cover exactly 33 persistent nodes", () => {
  const bindings = contract.bindings;
  assertExactSet(Object.keys(MASTERY_SYNERGY_RULES), bindings.masteryRule, "mastery rule registry drifted");
  assertExactSet(Object.keys(UNIFIED_MASTERY_RULES), bindings.unifiedMasteryRule, "unified mastery registry drifted");
  assert.equal(bindings.masteryRule.length, 26);
  assert.deepEqual(bindings.unifiedMasteryRule, ["WM_Common_SKILL_007"]);
  assert.equal(bindings.masteryPassiveInteraction.length, 12);

  const masteryUniverse = new Set(nonStructuredIds);
  const passiveUniverse = new Set(passiveIds);
  const interactionMasteries = bindings.masteryPassiveInteraction.map((row) => row.masteryId);
  assert.equal(new Set(interactionMasteries).size, 12, "mastery interaction IDs must be unique");
  for (const row of bindings.masteryPassiveInteraction) {
    assert.equal(masteryUniverse.has(row.masteryId), true, "unknown interaction mastery " + row.masteryId);
    assert.equal(passiveUniverse.has(row.passiveSkillId), true, "unknown interaction passive " + row.passiveSkillId);
    assert.ok(PASSIVE_SKILL_RULES[row.passiveSkillId], "interaction passive lacks a rule " + row.passiveSkillId);
  }

  const directMasteries = new Set([...bindings.masteryRule, ...bindings.unifiedMasteryRule]);
  assert.equal(interactionMasteries.filter((id) => directMasteries.has(id)).length, 6);
  const mapped = sorted([...directMasteries, ...interactionMasteries]);
  assert.equal(mapped.length, 33);
  assertExactSet(mapped, contract.families.masteryNonStructured.classes.persistentStatic, "persistent mastery binding drifted");
  assert.deepEqual(contract.families.masteryNonStructured.classes.persistentUnrepresentable, ["GT_Hero_Attack_01"]);
  assert.equal(mapped.includes("GT_Hero_Attack_01"), false);
  assert.equal(MASTERY_SYNERGY_RULES.GT_Hero_Attack_01, undefined);
  assert.equal(UNIFIED_MASTERY_RULES.GT_Hero_Attack_01, undefined);
});

test("item and perk rule bindings are exact, reachable, and semantically mapped", () => {
  const bindings = contract.bindings;
  assertExactSet(Object.keys(ITEM_PASSIVE_RULES), bindings.itemRule, "item passive registry drifted");
  assertExactSet(Object.keys(PERK_PASSIVE_RULES), bindings.perkRule, "perk passive registry drifted");
  assert.equal(bindings.itemRule.length, 5);
  assert.equal(bindings.perkRule.length, 4);

  const innateUniverse = new Set(innateIds);
  const perkUniverse = new Set(perkIds);
  for (const id of bindings.itemRule) assert.equal(innateUniverse.has(id), true, "item binding is unreachable " + id);
  for (const id of bindings.perkRule) assert.equal(perkUniverse.has(id), true, "perk binding is unreachable " + id);

  const mapped = sorted([...bindings.itemRule, ...bindings.perkRule]);
  assert.equal(mapped.length, 5);
  assertExactSet(mapped, contract.families.itemPerkComplex.classes.persistentStatic, "persistent item binding drifted");
  assertExactSet(mapped.filter((id) => itemComplexIds.includes(id)), mapped, "item binding is not projected");
});

test("known unresolved and conditional item complexes cannot silently gain static rules", () => {
  const classes = contract.families.itemPerkComplex.classes;
  assert.deepEqual(classes.retiredInherent, [
    "SkillSet_Unique_Accessory_Skill_01",
    "SkillSet_Unique_Armor_Skill_01",
  ]);
  assert.deepEqual(classes.persistentOwnerSemanticsUnresolved, ["SkillSet_WP_Item_FieldBoss_T3_CR_02"]);
  assert.deepEqual(classes.sourceConflict, []);
  assert.deepEqual(classes.unresolvedDecode, []);
  assert.equal(classes.conditional.includes("SkillSet_WP_Item_FieldBoss_T2_ORB_01"), true, "Primal Brothers must remain a conditional proc");
  assert.equal(classes.conditional.includes("SkillSet_WP_Item_FieldBoss_T3_ST_02"), true, "Aridus must remain conditional");

  const forbiddenStaticRules = [
    ...classes.retiredInherent,
    ...classes.persistentOwnerSemanticsUnresolved,
    ...classes.sourceConflict,
    ...classes.unresolvedDecode,
    "SkillSet_WP_Item_FieldBoss_T3_ST_02",
  ];
  for (const id of forbiddenStaticRules) {
    assert.equal(ITEM_PASSIVE_RULES[id], undefined, id + " unexpectedly gained an item rule");
    assert.equal(PERK_PASSIVE_RULES[id], undefined, id + " unexpectedly gained a perk rule");
  }
});

test("mapped persistent duplicate carriers cannot become beam-legal silently", () => {
  const items = equipmentProjection.data.items;
  const weaponTypes = new Set(["bow", "crossbow", "dagger", "gauntlet", "orb", "spear", "staff", "sword", "sword2h", "wand"]);
  const armorTypes = new Set(["head", "chest", "cloak", "hands", "feet", "legs"]);
  const accessoryTypes = new Set(["necklace", "bracelet", "ring", "brooch", "earring", "belt"]);
  const heroicGroup = (item) => item.grade !== 51 ? "" : armorTypes.has(item.equipmentType) ? "armor" : accessoryTypes.has(item.equipmentType) ? "accessory" : weaponTypes.has(item.equipmentType) ? "weapon" : "";

  for (const passiveId of contract.families.itemPerkComplex.classes.persistentStatic) {
    const carriers = items.filter((item) => item.passives?.id === passiveId
      || item.availablePerks?.some((perk) => perk.passive?.id === passiveId));
    if (carriers.length < 2) continue;
    const sameWeaponType = carriers.every((item) => weaponTypes.has(item.equipmentType))
      && new Set(carriers.map((item) => item.equipmentType)).size === 1;
    const groups = new Set(carriers.map(heroicGroup));
    const sameHeroicGroup = groups.size === 1 && !groups.has("");
    assert.equal(
      sameWeaponType || sameHeroicGroup,
      true,
      `${passiveId} gained a potentially legal duplicate topology; partial optimizer scoring must model one-copy activation before accepting this data build`,
    );
  }
});

test("no implementation binding points outside its classified projection universe", () => {
  const passiveUniverse = new Set(flattenedClasses(contract.families.weaponPassive));
  const masteryUniverse = new Set(flattenedClasses(contract.families.masteryNonStructured));
  const itemUniverse = new Set(flattenedClasses(contract.families.itemPerkComplex));
  for (const id of contract.bindings.passiveSkillRule) assert.equal(passiveUniverse.has(id), true, "unclassified passive binding " + id);
  for (const id of [...contract.bindings.masteryRule, ...contract.bindings.unifiedMasteryRule]) assert.equal(masteryUniverse.has(id), true, "unclassified mastery binding " + id);
  for (const row of contract.bindings.masteryPassiveInteraction) assert.equal(masteryUniverse.has(row.masteryId), true, "unclassified mastery interaction " + row.masteryId);
  for (const id of [...contract.bindings.itemRule, ...contract.bindings.perkRule]) assert.equal(itemUniverse.has(id), true, "unclassified item binding " + id);
});

test("implementation binding lists have deterministic ordering", () => {
  assertSortedUnique(contract.bindings.passiveSkillRule, "passive bindings are not sorted");
  assertSortedUnique(contract.bindings.masteryRule, "mastery bindings are not sorted");
  assertSortedUnique(contract.bindings.unifiedMasteryRule, "unified mastery bindings are not sorted");
  assertSortedUnique(contract.bindings.itemRule, "item bindings are not sorted");
  assertSortedUnique(contract.bindings.perkRule, "perk bindings are not sorted");
  const interactionIds = contract.bindings.masteryPassiveInteraction.map((row) => row.masteryId);
  assertSortedUnique(interactionIds, "mastery interaction bindings are not sorted");
});
