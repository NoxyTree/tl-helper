import test from "node:test";
import assert from "node:assert/strict";
import {
  artifactSetStatSources,
  attributeBreakpointStatSources,
  attributeCurveStatSources,
  buildItemSetStatSources,
  itemSetStatSources,
  materialBonusStatSources,
} from "../lib/stat-sources-progression.mjs";

const resolveStatTaxonomy = (raw) => raw === "all_double_attack"
  ? { canonicalStatId: "heavy_attack_chance", displayName: "Heavy Attack Chance", unit: "points", scale: 0.1, attackScope: "all", labelSource: "test", labelStatus: "verified" }
  : { canonicalStatId: raw, displayName: raw, unit: "raw", scale: 1 };

const options = {
  gameBuild: "123",
  sourcePath: "web/data/projections/equipment.json",
  rulesSourcePath: "web/tl-questlog-rules.js",
  resolveTaxonomy: resolveStatTaxonomy,
};

test("direct item-set stats retain piece requirements and ignore passive prose", () => {
  const rows = itemSetStatSources({
    id: "set_1", name: "Test Set", grade: 41,
    itemSetBonus: [{ set_count: 2, bonus_stat: [{ type: "all_double_attack", value: 1000 }], bonus_passive: [{ text: "Unparsed effect" }] }],
  }, options);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceType, "item_set");
  assert.equal(rows[0].value, 100);
  assert.equal(rows[0].rank, 2);
  assert.equal(JSON.parse(rows[0].conditionsJson).requiredSetPieces, 2);
  assert.equal(JSON.parse(rows[0].evidenceJson).semanticScope, "direct_numeric_bonus_only");
});

test("artifact sets use their distinct source type", () => {
  const rows = artifactSetStatSources({
    id: "artifact_1", name: "Test Artifact", bonuses: [{ set_count: 4, bonus_stat: [{ type: "hp_max", value: 800 }] }],
  }, options);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceType, "artifact_set");
  assert.equal(rows[0].sourceName, "Test Artifact");
});

test("bulk item-set indexing excludes artifact sets retained in itemSets", () => {
  const rows = buildItemSetStatSources([{
    id: "artifact_1", name: "Artifact Duplicate",
    itemSetMadeOfItems: [{ sub_category: "talistone1" }, { sub_category: "gemstone1" }],
    itemSetBonus: [{ set_count: 2, bonus_stat: [{ type: "hp_max", value: 800 }] }],
  }], options);
  assert.equal(rows.length, 0);
});

test("attribute curves preserve cumulative levels and weapon-specific variants", () => {
  const rows = attributeCurveStatSources({
    str: { 11: { hp_max: 45, bonus_attack_power_main_hand: { bow: 1, staff: 2 }, all_double_attack: 0 } },
  }, { ...options, sourcePath: "web/data/projections/progression.json" });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.rawStatId), ["hp_max", "bonus_attack_power_main_hand", "bonus_attack_power_main_hand"]);
  assert.deepEqual(rows.slice(1).map((row) => JSON.parse(row.contextJson).weaponType), ["bow", "staff"]);
  assert.equal(JSON.parse(rows[0].conditionsJson).cumulativeValue, true);
});

test("attribute breakpoints are explicit Questlog rules with threshold conditions", () => {
  const rows = attributeBreakpointStatSources({ str: { 50: { all_double_attack: 1000 } } }, options);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].canonicalStatId, "heavy_attack_chance");
  assert.equal(rows[0].sourceName, "Strength 50");
  assert.equal(rows[0].confidence, "verified_questlog_rule");
  assert.equal(JSON.parse(rows[0].conditionsJson).requiresAttributeTotal, 50);
});

test("material rules preserve stacking and equipment conditions", () => {
  const rows = materialBonusStatSources({
    staff: { mithril: { effectName: "mithril", stats: { all_double_attack: 600, hp_max_percentage: 0 } } },
  }, options);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceType, "weapon_material_bonus");
  assert.equal(rows[0].sourceName, "Staff with Mithril Armor");
  assert.equal(rows[0].value, 60);
  const conditions = JSON.parse(rows[0].conditionsJson);
  assert.equal(conditions.equippedWeaponType, "staff");
  assert.equal(conditions.appliesPerQualifyingArmorPiece, true);
  assert.equal(conditions.appliesForEachEquippedWeapon, true);
});

test("all progression rows match the 22-column stat source contract", () => {
  const row = attributeBreakpointStatSources({ dex: { 30: { all_double_attack: 1000 } } }, options)[0];
  assert.equal(Object.keys(row).length, 22);
  assert.deepEqual(Object.keys(row), [
    "statSourceId", "canonicalStatId", "statFamilyId", "rawStatId", "displayName",
    "sourceType", "sourceId", "sourceName", "sourceComponent", "valueRaw", "value",
    "unit", "level", "rank", "attackScope", "contextJson", "conditionsJson", "sourceTable",
    "sourcePath", "gameBuild", "confidence", "evidenceJson",
  ]);
});
