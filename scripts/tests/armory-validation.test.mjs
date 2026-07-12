import assert from "node:assert/strict";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as core from "../../web/tl-core.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appData = await loadWebDataFromFile(join(repoRoot, "web", "data", "app-data.json"));
await core.initCore(appData);

test("conditional weapon behaviour is not reported as missing from static Armory totals", () => {
  const build = core.createInitialBuild();
  const weapon = core.indexes.itemById.crossbow_aa_S1_002;
  assert.equal(weapon.name, "Arctic Roar Tracking Crossbows");
  assert.equal(weapon.passives?.name, "Blessing Steal");

  build.equipment.main_hand = {
    ...core.emptyEquipmentSelection(),
    itemId: weapon.id,
    level: core.itemMaxLevel(weapon),
  };

  const calc = core.calculateBuild(build, { str: 0, dex: 0, int: 0, per: 0, con: 0 });
  assert.ok(!calc.validation.issues.some((issue) => issue.message.includes("Blessing Steal")));
});
