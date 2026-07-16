import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import * as core from "../../web/tl-core.js";
import { OPTIMIZER_PRESETS, resolveOptimizerPreset, weaponStatFamily } from "../../web/tl-optimizer-presets.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const FAMILIES = ["melee", "range", "magic", "all"];

test("weapon families map every equipable weapon type", () => {
  assert.equal(weaponStatFamily("sword"), "melee");
  assert.equal(weaponStatFamily("sword2h"), "melee");
  assert.equal(weaponStatFamily("dagger"), "melee");
  assert.equal(weaponStatFamily("spear"), "melee");
  assert.equal(weaponStatFamily("gauntlet"), "melee");
  assert.equal(weaponStatFamily("bow"), "range");
  assert.equal(weaponStatFamily("crossbow"), "range");
  assert.equal(weaponStatFamily("staff"), "magic");
  assert.equal(weaponStatFamily("wand"), "magic");
  assert.equal(weaponStatFamily("orb"), "magic");
  assert.equal(weaponStatFamily(undefined), "all");
  assert.equal(weaponStatFamily("shield"), "all");
});

test("presets are structurally sound and resolve without family tokens", () => {
  assert.ok(OPTIMIZER_PRESETS.length >= 3);
  for (const preset of OPTIMIZER_PRESETS) {
    assert.ok(preset.id && preset.label && preset.tagline, `${preset.id} metadata`);
    assert.ok(preset.maximize.length >= 3 && preset.maximize.length <= 5, `${preset.id} maximize count`);
    assert.ok(preset.floors.length >= 1, `${preset.id} has at least one floor`);
    for (const family of FAMILIES) {
      const resolved = resolveOptimizerPreset(preset.id, { family });
      const ids = [...resolved.maximize, ...resolved.floors.map((row) => row.id)];
      assert.equal(new Set(ids).size, ids.length, `${preset.id}/${family} has no duplicate stat ids`);
      for (const id of ids) assert.ok(!id.includes("{family}"), `${preset.id}/${family} resolved ${id}`);
      for (const floor of resolved.floors) assert.ok(Number(floor.display) > 0, `${preset.id}/${family} floor ${floor.id} positive`);
    }
  }
  assert.throws(() => resolveOptimizerPreset("no-such-preset"));
  assert.deepEqual(
    resolveOptimizerPreset(OPTIMIZER_PRESETS[0].id, { family: "bogus" }).maximize,
    resolveOptimizerPreset(OPTIMIZER_PRESETS[0].id, { family: "all" }).maximize,
    "unknown family falls back to all",
  );
});

test("every resolved preset stat exists in the current game data", async () => {
  const data = await loadWebDataFromFile(path.resolve("web/data/app-data.json"));
  await core.initCore(data);
  const labels = core.data.statLabels ?? {};
  for (const preset of OPTIMIZER_PRESETS) {
    for (const family of FAMILIES) {
      const resolved = resolveOptimizerPreset(preset.id, { family });
      for (const id of [...resolved.maximize, ...resolved.floors.map((row) => row.id)]) {
        assert.ok(Object.hasOwn(labels, id), `${preset.id}/${family}: ${id} is a known stat`);
      }
      for (const floor of resolved.floors) {
        const raw = core.statDisplayToRaw(floor.id, floor.display);
        assert.ok(Number.isFinite(raw) && raw > 0, `${preset.id}/${family}: floor ${floor.id} converts to raw`);
      }
    }
  }
});
