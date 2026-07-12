import assert from "node:assert/strict";
import test from "node:test";

import { statName } from "../../web/tl-core.js";

test("player-facing stat names never expose legacy Double Attack terminology", () => {
  assert.equal(statName("all_double_attack"), "Heavy Attack Chance");
  assert.equal(statName("pvp_magic_double_attack"), "PvP Magic Heavy Attack Chance");
  assert.equal(statName("boss_range_double_defense"), "Boss Ranged Heavy Attack Evasion");
  assert.equal(statName("double_damage_dealt_modifier"), "Heavy Attack Damage");
  assert.equal(statName("double_damage_taken_modifier"), "Heavy Attack Damage Resistance");
  assert.equal(statName("weaken_double_attack"), "Weaken Heavy Attack Chance");
});

test("player-facing enemy families use the Questlog terminology", () => {
  assert.equal(statName("animal_damage_amplification"), "Wildkin Damage Boost");
  assert.equal(statName("animal_damage_reduction"), "Wildkin Damage Reduction");
  assert.equal(statName("bonus_animal_attack_power"), "Bonus Wildkin Attack Power");
  assert.equal(statName("creation_damage_resistance"), "Construct Damage Resistance");
  assert.equal(statName("bonus_creation_attack_power"), "Bonus Construct Attack Power");
  assert.equal(statName("grankus_damage_reduction"), "Humanoid Damage Reduction");
  assert.equal(statName("bonus_grankus_attack_power"), "Bonus Humanoid Attack Power");
});
