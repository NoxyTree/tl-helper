import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/build-from-scratch.html", import.meta.url), "utf8");

test("stat picker exposes every adapter stat through searchable categories without a result cap", () => {
  assert.match(html, /aria-label="Add a priority stat"/);
  assert.match(html, /aria-label="Search all calculated stats"/);
  assert.match(html, /adapter\.listStats\(\)/);
  assert.match(html, /s\.statOptions\.filter/);
  assert.match(html, /statPickerCategory/);
  assert.match(html, /priorityCategories/);
  assert.match(html, /toggleComposite/);
  assert.match(html, /compositeComponents/);
  assert.match(html, /Included in this priority/);
  assert.match(html, /Optimizes all included stats together/);
  assert.match(html, /aria-label="Show components for/);
  assert.doesNotMatch(html, /cat\.icon/);
  for (const label of ["Featured", "Offense", "Defense", "Resources", "Utility", "PvP", "Control", "Boss & PvE", "Positioning", "Enemy Types", "Attributes"]) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /\.slice\(0,10\)/);
  assert.doesNotMatch(html, /<datalist/);
  assert.doesNotMatch(html, /<select[^>]+aria-label="Add a priority stat"/);
});

test("selected priorities are reorderable, removable, and support display-unit minimums", () => {
  assert.match(html, /movePriority/);
  assert.match(html, /draggable="true"/);
  assert.match(html, /startPriorityDrag/);
  assert.match(html, /dragOverPriority/);
  assert.match(html, /dropPriority/);
  assert.match(html, /Drag to reorder \{\{ p\.name \}\}/);
  assert.doesNotMatch(html, /aria-label="Move up"/);
  assert.doesNotMatch(html, /aria-label="Move down"/);
  assert.match(html, /removePriority/);
  assert.match(html, /Minimum \{\{ p\.name \}\}/);
  assert.match(html, /statDisplayToRaw/);
  assert.match(html, /rank:index\+1/);
});
