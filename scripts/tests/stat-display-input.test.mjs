import assert from "node:assert/strict";
import test from "node:test";

import { effectiveStatValue, formatStat, statDisplayToRaw, statHardCap } from "../../web/tl-core.js";
import { STAT_EXPANSIONS } from "../../web/tl-questlog-rules.js";

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

test("composite evasion ratings display in the same sheet units as their components", () => {
  // Regression: pvp_all_evasion fell through formatStat's contest-rating
  // regex (which omits evasion) and STAT_UNIT_MODIFIERS, showing raw units
  // 10x the game sheet next to its correctly scaled typed components.
  assert.equal(formatStat("pvp_all_evasion", 30240), "3,024");
  assert.equal(formatStat("pvp_all_evasion", 30240), formatStat("pvp_melee_evasion", 30240));
  for (const id of [
    "pvp_all_evasion",
    "boss_all_evasion",
    "boss_melee_evasion",
    "boss_range_evasion",
    "boss_magic_evasion",
    "front_all_evasion",
    "rear_all_evasion",
    "side_all_evasion",
  ]) {
    assert.equal(formatStat(id, 30240), "3,024", id);
    assert.equal(statDisplayToRaw(id, 3024), 30240, id);
  }
});

test("all-status-effect composites display in the same sheet units as their components", () => {
  // Regression: all_state_tolerance formatted raw (40x sheet) and
  // all_state_accuracy matched the /10 contest regex while both expand into
  // /40 condition components (mithril sword grants raw 2000 = sheet 50).
  assert.equal(formatStat("all_state_tolerance", 2000), "50");
  assert.equal(formatStat("all_state_accuracy", 4000), "100");
  assert.equal(statDisplayToRaw("all_state_tolerance", 50), 2000);
  assert.equal(statDisplayToRaw("all_state_accuracy", 100), 4000);
});

test("every composite stat formats identically to each of its expansion components", () => {
  // A composite contributes its raw value to every component, so the sheet
  // display of both must use the same raw-to-display scale.
  const probe = 30240;
  for (const [composite, components] of Object.entries(STAT_EXPANSIONS)) {
    for (const component of components) {
      assert.equal(
        formatStat(composite, probe),
        formatStat(component, probe),
        `${composite} vs ${component}`,
      );
      assert.equal(
        statDisplayToRaw(composite, 756),
        statDisplayToRaw(component, 756),
        `${composite} vs ${component} (display to raw)`,
      );
    }
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
