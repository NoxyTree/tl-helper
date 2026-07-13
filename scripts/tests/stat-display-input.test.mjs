import assert from "node:assert/strict";
import test from "node:test";

import { formatStat, statDisplayToRaw } from "../../web/tl-core.js";

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
