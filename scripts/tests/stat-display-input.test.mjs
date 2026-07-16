import assert from "node:assert/strict";
import test from "node:test";

import { effectiveStatValue, formatStat, statDisplayToRaw, statHardCap } from "../../web/tl-core.js";

test("player-entered minimums round-trip through displayed stat units", () => {
  for (const [id, display, expected] of [
    ["hp_max", 50000, "50,000"],
    ["magic_critical_defense", 3500, "3,500"],
    ["buff_given_duration_modifier", 18, "18%"],
    ["skill_cooldown_modifier", 22, "22%"],
    ["stun_tolerance", 120, "120"],
  ]) {
    const raw = statDisplayToRaw(id, display);
    assert.equal(formatStat(id, raw), expected);
  }
});

test("official absolute caps use calculator raw units", () => {
  assert.equal(statHardCap("skill_cooldown_modifier"), 20000);
  assert.equal(statHardCap("buff_given_duration_modifier"), 15000);
  assert.equal(statHardCap("attack_speed_modifier"), 15000);
  assert.equal(statHardCap("attack_range_modifier"), 10000);
  assert.equal(statHardCap("con"), 130);
  assert.equal(statHardCap("pvp_melee_accuracy"), null);
  assert.equal(effectiveStatValue("skill_cooldown_modifier", 25000), 20000);
});
