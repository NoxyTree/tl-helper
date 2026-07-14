import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as core from "../../web/tl-core.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appData = await loadWebDataFromFile(join(repoRoot, "web", "data", "app-data.json"));
await core.initCore(appData);

const attributes = { str: 0, dex: 0, int: 0, per: 0, con: 0 };

function selection(itemId, perkId = "") {
  const item = core.indexes.itemById[itemId];
  assert.ok(item, `missing fixture item ${itemId}`);
  return { ...core.emptyEquipmentSelection(), itemId, level: core.itemMaxLevel(item), perkId };
}

function sourceValues(calc, sourceLabel) {
  const values = {};
  for (const stat of calc.stats) for (const source of stat.sources) {
    if (source.sourceLabel !== sourceLabel) continue;
    values[stat.id] = (values[stat.id] ?? 0) + source.value;
  }
  return values;
}

test("Dark Wing's Bulwark applies through its real selected armor perk", () => {
  const build = core.createInitialBuild();
  build.equipment.head = selection("head_unique_aa_t2_set_001", "SkillSet_Unique_Armor_Skill_01");

  assert.deepEqual(sourceValues(core.calculateBuild(build, attributes), "Dark Wing's Bulwark"), {
    hp_max: 2000,
    magic_armor: 300,
  });
});

test("decoded personal item auras and Southpaw contribute exact persistent values", () => {
  const mind = core.createInitialBuild();
  mind.equipment.main_hand = selection("bow_aa_t5_boss_002");
  assert.deepEqual(sourceValues(core.calculateBuild(mind, attributes), "Angel Above the Frontier's Mind's Eye"), {
    attack_range_modifier: 900,
  });

  const storm = core.createInitialBuild();
  storm.equipment.main_hand = selection("crossbow_aa_t5_boss_002");
  assert.deepEqual(sourceValues(core.calculateBuild(storm, attributes), "Malakar's Eye of Storm"), {
    move_speed_modifier: 800,
  });

  const guidance = core.createInitialBuild();
  guidance.equipment.main_hand = selection("crossbow_aa_S1_004");
  const guidanceValues = sourceValues(core.calculateBuild(guidance, attributes), "Wind's Guidance");
  assert.equal(guidanceValues.move_speed_modifier, 800);
  for (const statId of ["melee_evasion", "range_evasion", "magic_evasion"]) assert.equal(guidanceValues[statId], 1600);

  const southpaw = core.createInitialBuild();
  southpaw.equipment.main_hand = selection("gauntlet_aa_S1_003");
  assert.deepEqual(sourceValues(core.calculateBuild(southpaw, attributes), "Southpaw"), {
    attack_power_off_hand: 90,
  });
});

test("weapon-specific cores require that weapon family and repeated complexes are explicit errors", () => {
  const build = core.createInitialBuild();
  build.equipment.main_hand = selection("bow_aa_t5_boss_002");
  build.equipment.head = selection("bow_aa_t2_raid_001", "Perk_bow_aa_t5_boss_002");
  const calc = core.calculateBuild(build, attributes);
  const issueCodes = calc.validation.issues.map((issue) => issue.code).filter(Boolean);

  assert.equal(sourceValues(calc, "Angel Above the Frontier's Mind's Eye").attack_range_modifier, 900 * 2);
  assert.ok(issueCodes.includes("repeated_passive_stacking_unresolved"));

  build.equipment.main_hand = selection("crossbow_aa_t5_boss_002");
  const withoutBow = core.calculateBuild(build, attributes);
  assert.deepEqual(sourceValues(withoutBow, "Angel Above the Frontier's Mind's Eye"), {});
  assert.ok(withoutBow.validation.issues.some((issue) => issue.code === "perk_required_weapon_missing"));
});
