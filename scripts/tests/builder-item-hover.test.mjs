import assert from "node:assert/strict";
import test from "node:test";
import { builderHoverPosition, renderBuilderItemHover } from "../../web/tl-builder-item-hover.js";

const model = {
  name: "Heroic Coat", nameColor: "#f90", meta: "Heroic · Chest · Lv 12", headBorder: "2px solid #f90", headBg: "#111",
  hasStats: true, stats: [{ name: "Defense", formattedValue: "500", kind: "core" }],
  hasTraits: true, traits: [{ name: "Max Health", formattedValue: "600" }],
  hasUnique: true, unique: [{ name: "Heavy Attack", formattedValue: "80" }],
  hasHeroicEffects: true, heroicEffects: [{ groupNumber: 1, name: "Evasion", value: "220", level: 12, levelKnown: true }],
  hasResonance: true, resonance: [{ name: "Cooldown Speed", formattedValue: "4%" }],
  hasRunes: true, runes: [{ empty: false, hasIcon: false, typeColor: "#f00", typeLabel: "ATTACK", gradeName: "Rare", level: 60, maxLevel: 60, maxLevelLabel: "Max Lv 60", contribution: "+80 Hit" }],
  hasSynergy: true, synergyName: "Attack Support Defense", synergyStats: ["Max Health +100"],
  hasSet: true, setInfo: { name: "Overture", countLabel: "2/4", bonuses: [{ active: true, color: "#7e0", mark: "✓", required: "2 pc", text: "All Evasion 110", hasComputed: false }] },
  effects: [{ label: "Skill Core:", name: "Excluded", text: "Never render", hasIcon: false }, { label: "Passive:", name: "Kept", text: "Inherent item passive", hasIcon: false }],
};

test("renders the complete selected item configuration without skill-core potentials", () => {
  const html = renderBuilderItemHover(model);
  for (const text of ["Defense", "Traits", "Heroic Trait", "Heroic Effects", "Trait Resonance", "Runes", "Rune Synergy", "Set Effects", "Inherent item passive"]) assert.match(html, new RegExp(text));
  assert.match(html, /Evasion/);
  assert.match(html, /220/);
  assert.match(html, /\+80 Hit/);
  assert.match(html, /Rare · Max Lv 60/);
  assert.doesNotMatch(html, /Excluded|Never render|Skill Core/);
});

test("escapes item content", () => {
  assert.match(renderBuilderItemHover({ ...model, name: '<img src=x onerror="bad">' }), /&lt;img src=x onerror=&quot;bad&quot;&gt;/);
});

test("positions below in the upper viewport and above in the lower viewport", () => {
  assert.deepEqual(builderHoverPosition({ x: 100, y: 100 }, { width: 340, height: 500 }, { width: 1000, height: 800 }), { left: 116, top: 100, bottom: null });
  assert.deepEqual(builderHoverPosition({ x: 900, y: 700 }, { width: 340, height: 500 }, { width: 1000, height: 800 }), { left: 648, top: null, bottom: 100 });
});
