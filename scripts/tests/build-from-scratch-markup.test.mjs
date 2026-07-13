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
  assert.match(html, /id="goal-picker"/);
  assert.doesNotMatch(html, /Protect/);
  assert.match(html, /id="allow-heroics"[^>]+checked/);
  assert.match(html, /id="include-sets"[^>]+checked/);
  assert.match(html, /id="optimize-traits"[^>]+checked/);
  assert.match(html, /data-value="normal" class="active"/);
  assert.match(html, /data-value="sets" class="active"/);
  assert.match(html, /data-value="fast" class="active"/);
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
  assert.match(html, /Heroic effects:/);
  assert.match(html, /Runes configured:/);
  assert.doesNotMatch(html, /<table/);
  assert.match(html, /id="cancel"/);
});
