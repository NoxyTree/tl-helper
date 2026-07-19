// Preset naming must be collision-proof across save paths, and origin
// inference must classify legacy presets (Questlog URL source, old constant
// optimizer names) without a stored origin field.
import assert from "node:assert/strict";
import test from "node:test";

import {
  dateStamp,
  generatePresetName,
  heroicItemNames,
  keyStatChips,
  presetOrigin,
  presetOriginLabel,
  uniqueName,
  weaponComboLabel,
} from "../../web/tl-preset-meta.js";

const stubCore = {
  HEROIC_GRADE: 51,
  equippedWeaponTypes: (build) => build?.weapons ?? [],
  label: (value) => String(value).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
  statName: (id) => `name:${id}`,
  formatStat: (id, value) => `fmt:${value}`,
  statTotal: (calc, id) => calc.totals[id] ?? 0,
  compositeStatBreakdown: (calc, id) => (calc.composites?.[id] != null ? { total: calc.composites[id], components: [] } : null),
  indexes: {
    itemById: {
      h1: { id: "h1", name: "Calanthia's Regret", grade: 51 },
      h2: { id: "h2", name: "Coldblooded Judgement", grade: 51 },
      n1: { id: "n1", name: "Plain Sword", grade: 4 },
    },
  },
};

test("weapon combo uses community short names", () => {
  assert.equal(weaponComboLabel(stubCore, { weapons: ["sword", "sword2h"] }), "SNS/GS");
  assert.equal(weaponComboLabel(stubCore, { weapons: ["staff", "dagger"] }), "STAFF/DAG");
  assert.equal(weaponComboLabel(stubCore, { weapons: [] }), "");
});

test("uniqueName appends the first free numeric suffix", () => {
  assert.equal(uniqueName("SNS/GS Optimized — 2026-07-19", []), "SNS/GS Optimized — 2026-07-19");
  assert.equal(
    uniqueName("SNS/GS Optimized — 2026-07-19", ["SNS/GS Optimized — 2026-07-19"]),
    "SNS/GS Optimized — 2026-07-19 (2)",
  );
  assert.equal(
    uniqueName("Build", ["build", "Build (2)"]),
    "Build (3)",
    "comparison is case-insensitive",
  );
});

test("generatePresetName is descriptive and collision-proof", () => {
  const existing = [];
  for (let run = 0; run < 3; run += 1) {
    existing.push(generatePresetName(stubCore, {
      build: { weapons: ["sword", "sword2h"] },
      origin: "optimized",
      date: new Date("2026-07-19T12:00:00Z"),
      existingNames: existing,
    }));
  }
  assert.deepEqual(existing, [
    "SNS/GS Optimized — 2026-07-19",
    "SNS/GS Optimized — 2026-07-19 (2)",
    "SNS/GS Optimized — 2026-07-19 (3)",
  ]);
  assert.equal(
    generatePresetName(stubCore, {
      build: { weapons: ["sword", "sword2h"] },
      origin: "optimized",
      label: "Frontline Tank",
      date: new Date("2026-07-19T12:00:00Z"),
    }),
    "SNS/GS Frontline Tank — 2026-07-19",
  );
});

test("presetOrigin classifies stored and legacy presets", () => {
  assert.equal(presetOrigin({ origin: "imported" }), "imported");
  assert.equal(presetOrigin({ source: "https://questlog.gg/x" }), "imported");
  assert.equal(presetOrigin({ sourceKind: "existing" }), "optimized");
  assert.equal(presetOrigin({ name: "Optimized full build" }), "optimized");
  assert.equal(presetOrigin({ name: "My cool build" }), "manual");
  assert.equal(presetOriginLabel({ name: "Optimized full build" }), "Optimized");
});

test("heroicItemNames lists heroic-grade equipment only, deduplicated", () => {
  const build = { equipment: {
    main_hand: { itemId: "h1" },
    off_hand: { itemId: "n1" },
    cloak: { itemId: "h2" },
    ring1: { itemId: "h1" },
    empty: null,
  } };
  assert.deepEqual(heroicItemNames(stubCore, build), ["Calanthia's Regret", "Coldblooded Judgement"]);
});

test("keyStatChips prefers composite totals and respects the limit", () => {
  const calc = { totals: { a: 5, b: 7 }, composites: { a: 3 } };
  const chips = keyStatChips(stubCore, calc, ["a", "b", "c", "d"], 3);
  assert.deepEqual(chips.map((chip) => chip.value), ["fmt:3", "fmt:7", "fmt:0"]);
  assert.equal(chips.length, 3);
});

test("dateStamp tolerates missing or invalid dates", () => {
  assert.equal(dateStamp("2026-07-19T01:02:03Z"), "2026-07-19");
  assert.equal(dateStamp(undefined), "");
  assert.equal(dateStamp("garbage"), "");
});
