import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/combat-lab.html", import.meta.url), "utf8");

test("Combat Lab exposes two simple calculator modes with progressive disclosure", () => {
  assert.match(html, /id="ability-tab"[^>]*>Ability Damage/);
  assert.match(html, /id="matchup-tab"[^>]*>PvP Matchup/);
  assert.match(html, /Advanced calculation options/);
  assert.match(html, /Edit matchup stats/);
  assert.match(html, /How was this calculated\?/);
});

test("Combat Lab leads with per-hit damage without claiming final damage", () => {
  assert.match(html, /Raw damage per hit/);
  assert.match(html, /before target Defense and combat modifiers/i);
  assert.match(html, /Conditional follow-ups are not silently added/);
});

test("Combat Lab control IDs are unique", () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test("PvP Matchup provides two Questlog imports and visible fighter cards", () => {
  assert.match(html, /id="source-questlog-url"/);
  assert.match(html, /id="target-questlog-url"/);
  assert.match(html, /id="source-gear-left"/);
  assert.match(html, /id="source-gear-right"/);
  assert.match(html, /id="target-gear-left"/);
  assert.match(html, /id="target-gear-right"/);
  assert.match(html, /id="source-combat-stats"/);
  assert.match(html, /id="target-artifacts"/);
  assert.match(html, /id="swap-builds"/);
  assert.match(html, /id="player-image-input"[^>]*accept="image\/\*"/);
  assert.match(html, /assets\/portraits\/shadow-opponent\.webp/);
});

test("PvP Matchup exposes an evidence-scoped expected-damage comparison", () => {
  assert.match(html, /id="comparison-build"/);
  assert.match(html, /id="expected-ability"/);
  assert.match(html, /id="expected-weapon"/);
  assert.match(html, /id="expected-level"/);
  assert.match(html, /id="expected-damage-results"/);
  assert.match(html, /expected damage per component, not whole-skill damage or DPS/i);
  assert.match(html, /Before Defense/);
});
