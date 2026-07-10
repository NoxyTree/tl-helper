import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import * as core from "../web/tl-core.js";

const CHARACTER_SLUG = "TheDeathProphetAndVoid";
const OWNER_SLUG = "crUTrs8OEZrE";
const EXPECTED = {
  str: 80,
  dex: 14,
  int: 71,
  per: 108,
  con: 103,
  hp_max: 37673.108,
  hp_regen: 367000,
  cost_max: 10699,
  cost_regen: 757000,
  bonus_attack_power_main_hand: 399,
  attack_power_main_hand: 640,
  attack_range_main_hand: 401.1,
  attack_speed_main_hand: 468.6289697908598,
  shield_block_chance: 5280,
  shield_block_chance_penetration: 2100,
  attack_speed_modifier: 2910,
  melee_accuracy: 33390,
  range_accuracy: 27130,
  magic_accuracy: 27130,
  melee_armor: 4159,
  range_armor: 4174,
  magic_armor: 3850,
  melee_evasion: 680,
  range_evasion: 680,
  magic_evasion: 680,
  melee_critical_defense: 30530,
  range_critical_defense: 26730,
  magic_critical_defense: 27810,
  melee_double_defense: 18170,
  range_double_defense: 18170,
  magic_double_defense: 25790,
  critical_damage_taken_modifier: 3750,
  double_damage_taken_modifier: 920,
  skill_power_amplification: 1190,
  skill_power_resistance: 8610,
  skill_cooldown_modifier: 8720,
  move_speed_modifier: 2090,
  buff_given_duration_modifier: 10990,
  debuff_taken_duration_modifier: -1310,
  weaken_accuracy: 85640,
  collide_amplification: 70840,
  collide_resistance: 85310,
};

async function trpc(path, input) {
  const query = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const response = await fetch(`https://questlog.gg/throne-and-liberty/api/trpc/${path}${query}`, {
    headers: { accept: "application/json", "user-agent": "TL Helper reference verifier" },
  });
  if (!response.ok) throw new Error(`${path} failed with ${response.status}`);
  return (await response.json()).result.data;
}

const appData = JSON.parse(await readFile(new URL("../web/data/app-data.json", import.meta.url), "utf8"));
await core.initCore(appData);
const characterData = await trpc("characterBuilder.getCharacter", { slug: CHARACTER_SLUG });
const sourceBuild = characterData.builds[0];
const [skillData, masteryData] = await Promise.all([
  trpc("skillBuilder.getSkillBuildsBySlug", { slug: OWNER_SLUG }),
  trpc("weaponSpecialization.getWeaponSpecializationBySlug", { slug: OWNER_SLUG }),
]);
const imported = core.importQuestlogBuild({
  characterData,
  build: sourceBuild,
  skillBuild: skillData.builds.find((row) => row.id === sourceBuild.skillBuildId),
  masteryBuild: masteryData.builds.find((row) => row.id === sourceBuild.weaponSpecializationBuildId),
});
const calculation = core.calculateBuild(imported.build, imported.attributes);
if (process.env.TL_REFERENCE_OUTPUT) {
  const output = resolve(process.env.TL_REFERENCE_OUTPUT);
  await writeFile(output, `${JSON.stringify({
    id: "questlog-the-death-prophet-and-void",
    name: "The Death Prophet and Void",
    source: `https://questlog.gg/throne-and-liberty/en/character-builder/${CHARACTER_SLUG}`,
    profile: imported.profile,
    attributes: imported.attributes,
    build: imported.build,
  }, null, 2)}\n`, "utf8");
  console.log(`Wrote reference preset: ${output}`);
}
const actual = Object.fromEntries(calculation.stats.map((row) => [row.id, row.total]));
actual.combat_power = core.calculateCombatPower(imported.build);
EXPECTED.combat_power = 7128;
const rows = Object.entries(EXPECTED).map(([statId, expected]) => {
  const value = Number(actual[statId] ?? 0);
  const difference = value - expected;
  return { statId, expected, actual: value, difference, pass: Math.abs(difference) < 0.0001 };
});
console.table(rows);
const failed = rows.filter((row) => !row.pass);
console.log(`Reference: ${characterData.character.name} / ${sourceBuild.name}`);
console.log(`Matched ${rows.length - failed.length}/${rows.length} asserted raw totals.`);
if (process.env.TL_VERIFY_DETAILS) {
  for (const statId of process.env.TL_VERIFY_DETAILS.split(",")) {
    const row = calculation.stats.find((entry) => entry.id === statId);
    console.log(`\n${statId}: ${row?.total ?? 0}`);
    console.table(row?.sources ?? []);
  }
  if (process.env.TL_VERIFY_DETAILS.includes("combat_power")) console.dir(core.combatPowerBreakdown(imported.build), { depth: null });
}
if (failed.length) process.exitCode = 1;
