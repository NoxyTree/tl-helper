import assert from "node:assert/strict";
import test from "node:test";
import { BUILDER_RESULT_TABS, normalizeStatGroups, renderCompactAttributeTracks, renderDenseStatLedger, renderGearResultAccess, renderSystemsResultAccess } from "../../web/tl-builder-result-view.js";

test("compact tracks show allocation, final total, milestones, and active bonuses without breakpoint cards", () => {
  const html = renderCompactAttributeTracks({ optimizedAttributes: { str: 20 }, allStats: [{ id: "str", value: 50 }], activeAttributeBreakpoints: [{ attributeId: "str", threshold: 50, bonuses: [{ name: "Heavy Attack", formattedValue: "+100" }] }] });
  assert.match(html, /STR/); assert.match(html, /20 allocated/); assert.match(html, /Heavy Attack/); assert.doesNotMatch(html, /breakpoint-card/);
});

test("dense ledger preserves every calculated stat, including zeroes, in deterministic categories", () => {
  const stats = [{ id: "b", name: "Beta", value: 2, formattedValue: "2", group: "Defense" }, { id: "a", name: "Alpha", value: 1, formattedValue: "1", group: "Offense" }, { id: "c", name: "Zero", value: 0, formattedValue: "0", group: "Offense" }];
  assert.equal(normalizeStatGroups(stats).flatMap((group) => group.rows).length, 3);
  const html = renderDenseStatLedger(stats); assert.match(html, /Alpha/); assert.match(html, /Beta/); assert.match(html, /Zero/);
});

test("gear access retains hover and inspection hooks for equipment and artifacts", () => {
  const html = renderGearResultAccess({ loadout: { equipment: [{ id: "head", name: "Helm" }], artifacts: [{ id: "talistone1", name: "Stone" }] } });
  assert.match(html, /data-result-slot="head"/); assert.match(html, /data-builder-item-hover/); assert.match(html, /talistone1/);
});

test("systems access preserves rune, set, artifact, and Heroic routes", () => {
  const html = renderSystemsResultAccess({ setEffects: ["Overture 2 pc"], loadout: { equipment: [{ selection: { runes: [{ runeId: "r1" }] } }], artifacts: Array.from({ length: 6 }, (_, index) => ({ id: `a${index}` })) } }, { runeName: () => "Attack Rune" });
  for (const text of ["Overture", "Attack Rune", "6/6", "Heroics"]) assert.match(html, new RegExp(text));
});

test("tab contract keeps detailed gear and systems access", () => {
  assert.deepEqual(BUILDER_RESULT_TABS.map((tab) => tab.id), ["overview", "attributes", "stats", "gear", "systems"]);
});
