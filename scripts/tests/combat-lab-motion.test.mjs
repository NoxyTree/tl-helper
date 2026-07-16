import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const js = await readFile(new URL("../../web/combat-lab.js", import.meta.url), "utf8");
const css = await readFile(new URL("../../web/combat-lab.css", import.meta.url), "utf8");

// raceBarMarkup is a pure string builder (no DOM access), so it is extracted
// from the page module and evaluated directly — the page module itself touches
// document at import time and cannot be imported under node.
const raceBarSource = js.match(/function raceBarMarkup\([\s\S]*?\n\}/)?.[0];
assert.ok(raceBarSource, "combat-lab.js declares raceBarMarkup");
const raceBarMarkup = new Function(`${raceBarSource}; return raceBarMarkup;`)();

const verdictWith = (sourcePressure, targetPressure) => ({
  pressures: {
    source: { perSwingPercentOfOpponentHp: sourcePressure },
    target: { perSwingPercentOfOpponentHp: targetPressure },
  },
});

test("rotation-mode verdicts with finite TTKs render the race-bar markup", () => {
  // 100/0.92 ≈ 108.7s for the source, 100/0.50 = 200s for the target.
  const markup = raceBarMarkup("Hero", "Villain", verdictWith("0.92", "0.50"));
  assert.match(markup, /class="ttk-race" aria-hidden="true"/);
  assert.match(markup, /ttk-lane ttk-winner/);
  assert.match(markup, /ttk-lane ttk-loser/);
  assert.match(markup, /Hero/);
  assert.match(markup, /Villain/);
  assert.match(markup, /~109s/);
  assert.match(markup, /~200s/);
});

test("the winner's bar fills to 100% and the loser stops at winnerTTK/loserTTK", () => {
  const markup = raceBarMarkup("Hero", "Villain", verdictWith("0.92", "0.50"));
  const winnerLane = markup.match(/<div class="ttk-lane ttk-winner">[\s\S]*?<\/div>/)?.[0] ?? "";
  const loserLane = markup.match(/<div class="ttk-lane ttk-loser">[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.match(winnerLane, /--race-fill:1\.0000/);
  // (100/0.92) / (100/0.50) = 0.50/0.92 ≈ 0.5435.
  assert.match(loserLane, /--race-fill:0\.5435/);
});

test("the race bar is omitted when a TTK is non-finite or over the 999s cap", () => {
  assert.equal(raceBarMarkup("Hero", "Villain", verdictWith("0", "0.50")), "");
  assert.equal(raceBarMarkup("Hero", "Villain", verdictWith("0.92", "0")), "");
  assert.equal(raceBarMarkup("Hero", "Villain", verdictWith("NaN", "0.50")), "");
  // 100/0.05 = 2000s renders as "over 999s" in the verdict copy, so no bar.
  assert.equal(raceBarMarkup("Hero", "Villain", verdictWith("0.05", "0.50")), "");
});

test("race bars animate with compositor-friendly scaleX from the left edge", () => {
  assert.match(css, /\.ttk-fill\s*\{[^}]*transform:scaleX\(0\)/);
  assert.match(css, /\.ttk-fill\s*\{[^}]*transform-origin:left/);
  assert.match(css, /\.ttk-race\.is-run \.ttk-fill\s*\{[^}]*transform:scaleX\(var\(--race-fill/);
});

test("the advantage count-up is rAF-driven, ends at the exact value, and keeps the true value in the DOM", () => {
  const countUp = js.match(/function animateAdvantageCount\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(countUp, /requestAnimationFrame/);
  assert.match(countUp, /counter\.textContent = String\(finalText\)/, "final frame writes the exact engine string");
  assert.match(countUp, /prefersReducedMotion\(\)/, "reduced motion renders the final value instantly");
  // The animated span is decorative; a visually-hidden twin carries the true
  // value immediately for screen readers and DOM-level assertions.
  assert.match(js, /class="verdict-advantage-count" aria-hidden="true"[\s\S]{0,200}class="visually-hidden">\$\{escapeHtml\(verdict\.advantagePercent\)\}/);
});

test("every new motion surface collapses under prefers-reduced-motion", () => {
  const reduced = css.match(/@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?\}\}/)?.[0] ?? "";
  assert.match(reduced, /\.ttk-fill\{transition:none!important;transform:scaleX\(var\(--race-fill,1\)\)!important\}/);
  assert.match(reduced, /\.fighter-card\.card-victor,[^{]*\.trade-verdict\.verdict-reveal\{animation:none!important\}/);
});

test("fighter entrance and verdict reveal are subtle transform/opacity animations", () => {
  assert.match(css, /@keyframes fighter-enter-left \{ from \{ opacity:0; transform:translateX\(-20px\); \} \}/);
  assert.match(css, /@keyframes fighter-enter-right \{ from \{ opacity:0; transform:translateX\(20px\); \} \}/);
  assert.match(css, /@keyframes verdict-reveal \{ from \{ opacity:0; transform:translateY\(12px\); \} \}/);
  assert.match(css, /@keyframes vs-pop/);
  assert.match(js, /replayClass\(document\.querySelector\("\.player-card"\), "fighter-enter-left"\)/);
  assert.match(js, /replayClass\(document\.querySelector\("\.enemy-card"\), "fighter-enter-right"\)/);
});
