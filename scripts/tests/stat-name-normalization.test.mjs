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
