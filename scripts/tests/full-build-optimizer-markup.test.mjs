import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/full-build-optimizer.html", import.meta.url), "utf8");

test("full-build optimizer is a standalone shared-shell page", () => {
  assert.match(html, /<link[^>]+tl-shell\.css/);
  assert.match(html, /class="tl-app-header"/);
  assert.match(html, /Build Optimizer/);
  assert.match(html, /Best result found under your settings/);
});

test("optimizer exposes source, goal, lock, and search controls", () => {
  assert.match(html, /data-source="armory"/);
  assert.match(html, /data-source="questlog"/);
  assert.match(html, /data-source="scratch"/);
  assert.match(html, /Build from scratch/);
  assert.match(html, /id="increase-picker"/);
  assert.match(html, /id="protect-picker"/);
  assert.match(html, /id="slot-locks"/);
  assert.match(html, /data-value="fast"/);
  assert.match(html, /data-value="thorough"/);
  assert.match(html, /id="cancel-optimizer"/);
});

test("scratch mode has honest no-baseline defaults", () => {
  assert.match(html, /state\.source==="scratch"/);
  assert.match(html, /createScratchBuild\(\)/);
  assert.match(html, /sourceKind:state\.source/);
  assert.match(html, /Scratch builds have no equipped slots to lock/);
  assert.match(html, /Needs an existing baseline/);
  assert.match(html, /activateSegment\("rune-mode","normal"\)/);
  assert.match(html, /activateSegment\("artifact-mode","sets"\)/);
  assert.match(html, /\$\("reconsider-heroics"\)\.checked=active/);
});

test("results include an Armory-style character doll canvas", () => {
  assert.match(html, /class="build-doll"/);
  assert.match(html, /Recommended character equipment/);
  assert.match(html, /result\.loadout\?\?result\.build/);
  assert.match(html, /dollSlot\(loadout/);
  assert.match(html, /main_hand/);
  assert.match(html, /off_hand/);
  assert.match(html, /loadout\.artifacts/);
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
  assert.match(html, /adapter\.optimize/);
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
  assert.match(html, /state\.source==="scratch"\?"Starting point":"Current"/);
  assert.match(html, /<\/th><th>Recommended/);
});
