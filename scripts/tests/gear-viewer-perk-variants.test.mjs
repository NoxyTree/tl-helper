import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const html = await readFile(join(root, "web", "gear-viewer.html"), "utf8");

test("Gear Viewer composes persistent Skill Core variants outside Heroic potential search", () => {
  assert.match(html, /core\.calculableItemPerkVariants\(item, \{ scenario \}\)/);
  assert.match(html, /const selection = \{ \.\.\.baseSelection, perkId: variant\.perkId \}/);
  assert.match(html, /potential = exactHeroicPotential/);
  assert.match(html, /const contribution = candidateContribution\(slotId, selection, build, attributes\)/);
});

test("Gear Viewer preserves the exact current core and permits legal repeated passive variants", () => {
  assert.match(html, /isExactCurrent: true/);
  assert.match(html, /core\.selectedItemPerk\(item, exactSelection\)/);
  assert.doesNotMatch(html, /repeatsPassiveOutsideSlot/);
  assert.match(html, /currentCoreUnsupported/);
});

test("Gear Viewer hover reconstruction consumes the winning candidate selection", () => {
  assert.match(html, /data-candidate-id="\$\{esc\(row\.candidateId\)\}"/);
  assert.match(html, /const candidate = lastRows\.find\(\(row\) => row\.candidateId === candidateId\)/);
  assert.match(html, /const \{ item, slotId, selection \} = candidate/);
  assert.match(html, /lastRows = visible/);
  assert.doesNotMatch(html, /lastRows = rows/);
  assert.match(html, /build\[?[^\n]*selection|\[slotId\] = selection/);
});
