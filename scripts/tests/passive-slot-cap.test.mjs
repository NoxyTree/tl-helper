import assert from "node:assert/strict";
import test from "node:test";

import { PASSIVE_SKILL_CAP, passiveSkillCapForLevel } from "../../web/tl-core.js";

test("decoded passive slot schedule is exact at every unlock boundary", () => {
  const expectations = [
    [1, 3], [19, 3], [20, 4], [24, 4], [25, 5], [29, 5],
    [30, 6], [34, 6], [35, 7], [39, 7], [40, 8], [60, 8],
  ];
  for (const [level, slots] of expectations) assert.equal(passiveSkillCapForLevel(level), slots, `level ${level}`);
  assert.equal(PASSIVE_SKILL_CAP, 8, "current level-60 build scope");
});
