// The Armory surfaces composite ratings (e.g. PvP Endurance) with the same
// component-minimum the optimizer scores, so both report one number. The
// breakdown must expose every typed component so the card can show them.
import assert from "node:assert/strict";
import test from "node:test";

import { compositeStatBreakdown, statTotal } from "../../web/tl-core.js";
import { CONTEXT_SPLIT_COMPOSITE_IDS, STAT_EXPANSIONS } from "../../web/tl-questlog-rules.js";

const calcWith = (rows) => ({ stats: rows.map(([id, total]) => ({ id, total })) });

test("composite PvP Endurance is the minimum of its typed components", () => {
  const components = STAT_EXPANSIONS.pvp_all_critical_defense;
  assert.equal(components.length, 3);
  const calc = calcWith([
    ["pvp_all_critical_defense", 6050],
    [components[0], 31770],
    [components[1], 34210],
    [components[2], 32950],
  ]);
  const breakdown = compositeStatBreakdown(calc, "pvp_all_critical_defense");
  assert.ok(breakdown);
  assert.equal(breakdown.total, 31770);
  assert.deepEqual(
    breakdown.components.map((component) => component.id),
    components,
  );
  assert.deepEqual(
    breakdown.components.map((component) => component.total),
    [31770, 34210, 32950],
  );
});

test("missing component rows count as zero, not the direct total", () => {
  const calc = calcWith([["pvp_all_critical_defense", 6050]]);
  const breakdown = compositeStatBreakdown(calc, "pvp_all_critical_defense");
  assert.equal(breakdown.total, 0);
});

test("non-composite stats return null and keep using the direct total", () => {
  const calc = calcWith([["skill_cooldown_modifier", 975]]);
  assert.equal(compositeStatBreakdown(calc, "skill_cooldown_modifier"), null);
  assert.equal(statTotal(calc, "skill_cooldown_modifier"), 975);
});

test("every multi-component expansion produces a breakdown, except context-split composites", () => {
  for (const [statId, components] of Object.entries(STAT_EXPANSIONS)) {
    const calc = calcWith(components.map((id, index) => [id, (index + 1) * 100]));
    const breakdown = compositeStatBreakdown(calc, statId);
    if (CONTEXT_SPLIT_COMPOSITE_IDS.has(statId)) {
      // Boss/PvP pairs display as a single total (their own row), never min(boss, pvp).
      assert.equal(breakdown, null, `${statId} is context-split and must not break down`);
    } else if (components.length < 2) {
      assert.equal(breakdown, null, statId);
    } else {
      assert.ok(breakdown, statId);
      assert.equal(breakdown.total, 100, statId);
    }
  }
});
