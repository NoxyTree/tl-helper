import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as core from "../../web/tl-core.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appData = await loadWebDataFromFile(join(repoRoot, "web", "data", "app-data.json"));
await core.initCore(appData);

const backedArmor = {
  id: "armor-z",
  name: "Armor alias Z",
  passive: { id: "SkillSet_Unique_Armor_Skill_01", name: "Bulwark Z", text: "alias" },
};
const backedArmorFirst = {
  id: "armor-a",
  name: "Armor alias A",
  passive: { id: "SkillSet_Unique_Armor_Skill_01", name: "Bulwark A", text: "alias" },
};
const backedAccessory = {
  id: "accessory",
  name: "Accessory core",
  passive: { id: "SkillSet_Unique_Accessory_Skill_01", name: "Accessory Power", text: "persistent" },
};
const backedWeapon = {
  id: "mind-eye",
  name: "Mind's Eye core",
  passive: { id: "SkillSet_WP_Item_A08_kAA_BO", name: "Mind's Eye", text: "persistent" },
};
const unsupported = {
  id: "unsupported",
  name: "Conditional core",
  passive: { id: "SkillSet_Test_Conditional", name: "Conditional Core", text: "When hit, gains power." },
};
const item = {
  id: "fixture-item",
  name: "Fixture Item",
  passives: { id: "SkillSet_Item_Innate", name: "Innate Effect", text: "Always present." },
  availablePerks: [unsupported, backedArmor, backedWeapon, backedAccessory, backedArmorFirst],
};

test("selectedItemPerk accepts only an available exact catalogue id", () => {
  assert.equal(core.selectedItemPerk(item, { perkId: "armor-z" }), backedArmor);
  assert.equal(core.selectedItemPerk(item, { perkId: "stale-id" }), null);
  assert.equal(core.selectedItemPerk(item, { perkId: "" }), null);
  assert.equal(core.selectedItemPerk(item, null), null);
});

test("itemPassiveComplexIds returns innate and selected complexes once", () => {
  assert.deepEqual(core.itemPassiveComplexIds(item, { perkId: "armor-z" }), [
    "SkillSet_Item_Innate",
    "SkillSet_Unique_Armor_Skill_01",
  ]);
  const sameComplex = {
    ...item,
    passives: { id: "SkillSet_Unique_Armor_Skill_01", name: "Innate copy" },
  };
  assert.deepEqual(core.itemPassiveComplexIds(sameComplex, { perkId: "armor-z" }), ["SkillSet_Unique_Armor_Skill_01"]);
  assert.deepEqual(core.itemPassiveComplexIds(item, { perkId: "stale-id" }), ["SkillSet_Item_Innate"]);
});

test("calculableItemPerkVariants is stable, deduplicated, and rule-backed", () => {
  const variants = core.calculableItemPerkVariants(item);
  assert.deepEqual(variants.map(({ perkId, passiveId, requiredWeapon }) => ({ perkId, passiveId, requiredWeapon })), [
    { perkId: "", passiveId: "", requiredWeapon: "" },
    { perkId: "accessory", passiveId: "SkillSet_Unique_Accessory_Skill_01", requiredWeapon: "" },
    { perkId: "armor-a", passiveId: "SkillSet_Unique_Armor_Skill_01", requiredWeapon: "" },
    { perkId: "mind-eye", passiveId: "SkillSet_WP_Item_A08_kAA_BO", requiredWeapon: "bow" },
  ]);
  assert.equal(variants[2].perk, backedArmorFirst);
  assert.ok(!variants.some((variant) => variant.perkId === "unsupported"));
});

test("itemTooltipEffects renders the actual selected core and never a catalogue default", () => {
  assert.deepEqual(core.itemTooltipEffects(item, null).map((effect) => effect.name), ["Innate Effect"]);
  assert.deepEqual(core.itemTooltipEffects(item, { perkId: "unsupported" }).map((effect) => effect.name), [
    "Innate Effect",
    "Conditional Core",
  ]);
  assert.deepEqual(core.itemTooltipEffects(item, { perkId: "accessory" }).map((effect) => effect.name), [
    "Innate Effect",
    "Accessory Power",
  ]);
  assert.deepEqual(core.itemTooltipEffects(item, { perkId: "stale-id" }).map((effect) => effect.name), ["Innate Effect"]);
});

test("an unavailable stored perk is a data-backed validation error and contributes nothing", () => {
  const build = core.createInitialBuild();
  const equipped = core.indexes.itemById.head_unique_aa_t2_set_001;
  assert.ok(equipped, "missing Dark Wing fixture item");
  build.equipment.head = {
    ...core.emptyEquipmentSelection(),
    itemId: equipped.id,
    level: core.itemMaxLevel(equipped),
    perkId: "stale-core-id",
  };
  const calc = core.calculateBuild(build, { str: 0, dex: 0, int: 0, per: 0, con: 0 });
  const issue = calc.validation.dataBacked.find((entry) => entry.code === "invalid_item_perk");
  assert.ok(issue);
  assert.equal(issue.severity, "error");
  assert.match(issue.message, /stale-core-id/);
  assert.ok(!calc.stats.some((stat) => stat.sources.some((source) => source.slot === "skill_core")));
});

test("an available unsupported core stays selected and visible without invented totals", () => {
  const build = core.createInitialBuild();
  const equipped = core.indexes.itemById.head_unique_aa_t2_set_001;
  const unsupportedPerk = equipped.availablePerks.find((perk) => perk.id === "SkillSet_WP_Item_FieldBoss_T3_SP_01");
  assert.ok(unsupportedPerk, "missing unsupported Skill Core fixture");
  build.equipment.head = {
    ...core.emptyEquipmentSelection(),
    itemId: equipped.id,
    level: core.itemMaxLevel(equipped),
    perkId: unsupportedPerk.id,
  };
  const calc = core.calculateBuild(build, { str: 0, dex: 0, int: 0, per: 0, con: 0 });
  assert.ok(!calc.validation.issues.some((entry) => entry.code === "invalid_item_perk"));
  assert.ok(!calc.stats.some((stat) => stat.sources.some((source) => source.slot === "skill_core")));
  assert.deepEqual(core.buildItemHoverModel("head", build, calc).effects.map((effect) => effect.name), [unsupportedPerk.passive.name]);
});
