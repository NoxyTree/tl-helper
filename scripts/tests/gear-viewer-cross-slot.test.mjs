import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as core from "../../web/tl-core.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const html = await readFile(new URL("../../web/gear-viewer.html", import.meta.url), "utf8");
const data = await loadWebDataFromFile(fileURLToPath(new URL("../../web/data/app-data.json", import.meta.url)));
await core.initCore(data);

function equip(build, slotId, itemId) {
  const item = core.indexes.itemById[itemId];
  assert.ok(item, `fixture item ${itemId} exists`);
  build.equipment[slotId] = {
    ...core.emptyEquipmentSelection(),
    itemId,
    level: core.itemMaxLevel(item),
  };
}

test("Gear Viewer evaluates every compatible occupied slot before keeping one item row", () => {
  assert.match(html, /function candidateSlotsFor\(item, build\)/);
  assert.match(html, /return matching\.length \? matching\.map\(\(row\) => row\.slotId\)/);
  assert.match(html, /for \(const slotId of candidateSlotsFor\(item, build\)\)/);
  assert.match(html, /function bestCandidateSlots\(rows\)/);
  assert.match(html, /bestByItem\.set\(row\.item\.id, row\)/);
  assert.match(html, /const bestSlots = bestCandidateSlots\(filtered\)/);
  assert.match(html, /item, slotId, level, selection, contribution/);
  assert.match(html, /const key = `\$\{row\.item\.id\}\|\$\{statId\}`/);

  const sourceStart = html.indexOf("    function bestCandidateSlots(rows) {");
  const sourceEnd = html.indexOf("\n    function sortRows", sourceStart);
  const source = sourceStart >= 0 && sourceEnd > sourceStart
    ? html.slice(sourceStart, sourceEnd).replace(/^    /gm, "")
    : "";
  assert.ok(source, "best-slot selector source is extractable for behavioral coverage");
  const bestCandidateSlots = Function(`"use strict"; ${source}; return bestCandidateSlots;`)();
  const item = { id: "candidate-ring" };
  const selected = bestCandidateSlots([
    { item, slotId: "ring_1", isPinned: false, protectionPass: true, score: 0, protectionHeadroom: 0 },
    { item, slotId: "ring_2", isPinned: false, protectionPass: true, score: 1, protectionHeadroom: 0 },
  ]);
  assert.deepEqual(selected.map((row) => row.slotId), ["ring_2"]);
});

test("the same ring candidate has different exact set-aware value in its two occupied slots", () => {
  const build = core.createInitialBuild();
  equip(build, "ring_1", "ring_aa_t2_upgrade_001");
  equip(build, "ring_2", "ring_a_Nudge_003");
  equip(build, "necklace", "necklace_aa_t2_upgrade_001");
  equip(build, "bracelet", "bracelet_aa_t2_upgrade_001");

  const item = core.indexes.itemById.ring_aa_t2_upgrade_002;
  const selection = {
    ...core.emptyEquipmentSelection(),
    itemId: item.id,
    level: core.itemMaxLevel(item),
  };
  const attributes = { str: 0, dex: 0, int: 0, per: 0, con: 0 };
  const ring1 = core.slotSelectionContribution("ring_1", selection, build, attributes, { includeSetEffects: true });
  const ring2 = core.slotSelectionContribution("ring_2", selection, build, attributes, { includeSetEffects: true });

  assert.equal(ring1.con ?? 0, 0, "replacing the existing Pledge ring does not complete the set");
  assert.equal(ring2.con, 2, "replacing the unrelated ring completes Pledge of Protection");
  assert.equal(ring2.hp_max - ring1.hp_max, 1000, "the completed set contributes its exact Max Health bonus");
  assert.ok(ring2.all_double_defense > ring1.all_double_defense, "the completed set contributes Heavy Attack Evasion");
});
