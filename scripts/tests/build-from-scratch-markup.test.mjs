import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/build-from-scratch.html", import.meta.url), "utf8");

test("scratch builder is a dedicated shared-shell experience", () => {
  assert.match(html, /<link[^>]+tl-shell\.css/);
  assert.match(html, /class="tl-app-header"/);
  assert.match(html, /<h1>Build from scratch<\/h1>/);
  assert.match(html, /href="\.\/full-build-optimizer\.html"/);
  assert.match(html, /Improve my build/);
});

test("character doll is the primary scratch result canvas", () => {
  assert.match(html, /id="left-rail"/);
  assert.match(html, /id="right-rail"/);
  assert.match(html, /id="weapons"/);
  assert.match(html, /id="artifacts"/);
  assert.match(html, /data-inspect/);
  assert.match(html, /result\?\.loadout/);
  assert.match(html, /slotId/);
  assert.match(html, /state\.locks\.has\(slotId\)/);
});

test("scratch controls are compact and have honest defaults", () => {
  assert.match(html, /id="goal-input"/);
  assert.match(html, /id="priority-list"/);
  assert.doesNotMatch(html, /Protect/);
  assert.match(html, /id="allow-heroics"[^>]+checked/);
  assert.match(html, /id="include-sets"[^>]+checked/);
  assert.match(html, /id="optimize-traits"[^>]+checked/);
  assert.match(html, /data-value="normal" class="active"/);
  assert.match(html, /data-value="sets" class="active"/);
  assert.match(html, /data-value="fast" class="active"/);
});

test("gamer priorities are ranked, reorderable, and sent to the adapter", () => {
  assert.match(html, /Add a stat to maximize/);
  assert.match(html, /draggable="true"/);
  assert.match(html, /data-up=/);
  assert.match(html, /data-down=/);
  assert.match(html, /data-minimum=/);
  assert.match(html, /goalPriorities/);
  assert.match(html, /rank:index\+1/);
  assert.match(html, /id="preset-select"/);
  assert.match(html, /Save preset/);
});

test("custom stat picker is compact, categorized, and keyboard accessible", () => {
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-autocomplete="list"/);
  assert.match(html, /aria-controls="stat-options"/);
  assert.match(html, /id="stat-options"[^>]+role="listbox"/);
  assert.match(html, /role="option"/);
  assert.match(html, /Offense/);
  assert.match(html, /Defense/);
  assert.match(html, /Utility/);
  assert.match(html, /PvP/);
  assert.match(html, /\.slice\(0,10\)/);
  assert.match(html, /event\.key==="ArrowDown"/);
  assert.match(html, /event\.key==="ArrowUp"/);
  assert.match(html, /event\.key==="Enter"/);
  assert.match(html, /event\.key==="Escape"/);
  assert.match(html, /No matching stats/);
  assert.match(html, /Type a stat name or choose a category/);
  assert.doesNotMatch(html, /<datalist/);
  assert.doesNotMatch(html, /createElement\("datalist"\)/);
});

test("scratch builder uses the adapter and stable lock identifiers", () => {
  assert.match(html, /createScratchBuild/);
  assert.match(html, /adapter\.optimize/);
  assert.match(html, /sourceKind:"scratch"/);
  assert.match(html, /lockedSlotIds:\[\.\.\.state\.locks\]/);
  assert.match(html, /objectiveBaseline:state\.result\?\.objectiveBaseline/);
  assert.doesNotMatch(html, /Number\(node\.dataset\.slot\)/);
});

test("results remain compact and inspectable", () => {
  assert.match(html, /id="inspector"/);
  assert.match(html, /Lock this result/);
  assert.match(html, /Rerun/);
  assert.match(html, /Assumptions and warnings/);
  assert.match(html, /result\.goalResults/);
  assert.match(html, /class="goal-result"/);
  assert.match(html, /Forge best loadout/);
  assert.match(html, /Heroic effects:/);
  assert.match(html, /Runes configured:/);
  assert.doesNotMatch(html, /<table/);
  assert.match(html, /id="cancel"/);
});
