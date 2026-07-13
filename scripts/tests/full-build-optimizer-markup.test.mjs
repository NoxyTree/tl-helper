import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/full-build-optimizer.html", import.meta.url), "utf8");

test("full-build optimizer is a standalone shared-shell page", () => {
  assert.match(html, /<link[^>]+tl-shell\.css/);
  assert.match(html, /class="tl-app-header"/);
  assert.match(html, /Build Optimizer/);
  assert.match(html, /Configure everything, then improve/);
});

test("optimizer exposes source, goal, lock, and search controls", () => {
  assert.match(html, /data-source="armory"/);
  assert.match(html, /data-source="questlog"/);
  assert.match(html, /href="\.\/build-from-scratch\.html"/);
  assert.doesNotMatch(html, /data-source="scratch"/);
  assert.match(html, /id="increase-picker"/);
  assert.match(html, /id="protect-picker"/);
  assert.match(html, /id="slot-locks"/);
  assert.match(html, /data-value="fast"/);
  assert.match(html, /data-value="thorough"/);
  assert.match(html, /id="cancel-optimizer"/);
});

test("goal selection uses the structured Build from Scratch picker pattern", () => {
  assert.match(html, /class="picker-trigger"/);
  assert.match(html, /class="picker-menu hidden" role="dialog"/);
  assert.match(html, /Search all calculated stats/);
  assert.match(html, /STAT_CATEGORIES/);
  assert.match(html, /class="picker-results"/);
  assert.match(html, /class="goal-chip"/);
  assert.doesNotMatch(html, /createElement\("datalist"\)/);
  assert.match(html, /Ranked priorities · drag to reorder/);
  assert.match(html, /compositeComponents/);
  assert.match(html, /class="composite-badge"/);
  assert.match(html, /draggable="true"/);
  assert.match(html, /data-drag-handle/);
  assert.match(html, /goals:\{ priorities:state\.increase\.map/);
});

test("protected goals show current calculated floors and widen the workspace", () => {
  assert.match(html, /adapter\.currentStats/);
  assert.match(html, /class="picker-option-value" title="Current value"/);
  assert.match(html, /class="goal-chip-value" title="Current protected floor"/);
  assert.match(html, /\.setup-workspace:has\(\.picker-menu:not\(\.hidden\)\)/);
  assert.match(html, /repeat\(3,minmax\(0,1fr\)\)/);
});

test("optimizer uses full-screen setup and loading before opening the shared result screen", () => {
  assert.match(html, /id="setup-state" class="setup-workspace"/);
  assert.match(html, /grid-template-areas:"source goals" "locks rules" "actions actions"/);
  assert.match(html, /class="progress-card"/);
  assert.match(html, /Improving your build/);
  assert.match(html, /function setView\(view\)/);
  assert.match(html, /setView\("progress"\)/);
  assert.match(html, /openSharedResult/);
  assert.match(html, /storeImprovedResult/);
  assert.match(html, /build-from-scratch\.html\?result=improved/);
  assert.doesNotMatch(html, /id="empty-state"/);
  assert.match(html, /new Worker\("\.\/tl-builder-worker\.js"/);
  assert.match(html, /message\.type==="progress"/);
});

test("improved results reuse the Build from Scratch result experience", () => {
  assert.match(html, /import\("\.\/tl-optimizer-result-handoff\.js"\)/);
  assert.match(html, /location\.href="\.\/build-from-scratch\.html\?result=improved"/);
  assert.doesNotMatch(html, /renderResult\(message\.result\)/);
});

test("optimizer represents sets, traits, Heroics, runes, and artifacts", () => {
  assert.match(html, /id="include-sets"[^>]+checked/);
  assert.match(html, /Optimize 3 traits/);
  assert.match(html, /Best Heroic configuration/);
  assert.match(html, /Keep current Heroics/);
  assert.match(html, /Reconsider Heroics/);
  assert.match(html, /Optimize normal/);
  assert.match(html, /Use owned Chaos/);
  assert.match(html, /normalDuplicateCap:3/);
  assert.match(html, /chaosDuplicateCap:1/);
  assert.match(html, /Chaos rune IDs already equipped/);
  assert.match(html, /no more than one Chaos rune per item/);
  assert.match(html, /Optimize sets/);
});

test("optimizer uses a strict adapter and never fabricates recommendations", () => {
  assert.match(html, /import\("\.\/tl-full-build-adapter\.js"\)/);
  assert.match(html, /createOptimizerAdapter/);
  assert.match(html, /loadArmoryBuild/);
  assert.match(html, /importQuestlogBuild/);
  assert.match(html, /listStats/);
  assert.match(html, /tl-builder-worker\.js/);
  assert.match(html, /worker\.postMessage\(\{type:"optimize"/);
  assert.match(html, /The page will never invent results/);
  assert.match(html, /returned an invalid result/);
  assert.doesNotMatch(html, /setTimeout\([^)]*renderResult/);
});

test("result contract includes comparison, deltas, explanations, warnings, and alternatives", () => {
  assert.match(html, /result\.slots/);
  assert.match(html, /result\.statDeltas/);
  assert.match(html, /result\.explanations/);
  assert.match(html, /result\.assumptions/);
  assert.match(html, /result\.warnings/);
  assert.match(html, /result\.alternatives/);
  assert.match(html, /Current<\/th><th>Recommended/);
});

test("result handoff remains independent of unlicensed market data", () => {
  assert.match(html, /priorities:state\.increase/);
  assert.match(html, /includeSetEffects:\$\("include-sets"\)\.checked/);
  assert.doesNotMatch(html, /TLDB|\/api\/market\/prices|Lucent/);
});
