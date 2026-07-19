// An infeasible floor must fail with a diagnosis — the impossible constraint,
// the best value any evaluated build reached, and structured data the UI can
// turn into one-click relaxations — not a bare "no builds match".
import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as core from "../../web/tl-core.js";
import { createOptimizerAdapter } from "../../web/tl-full-build-adapter.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appData = await loadWebDataFromFile(join(repoRoot, "web", "data", "app-data.json"));
await core.initCore(appData);

const attributes = { str: 0, dex: 0, int: 0, per: 0, con: 0 };

function baseBuild() {
  const build = core.createInitialBuild();
  const sword = appData.items.find((row) => row.equipmentType === "sword");
  assert.ok(sword);
  build.equipment.main_hand = { ...core.emptyEquipmentSelection(), itemId: sword.id, level: core.itemMaxLevel(sword) };
  return build;
}

test("an impossible floor fails with best-achievable diagnostics", async () => {
  const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }) });
  const impossible = 10_000_000;
  let thrown = null;
  try {
    await adapter.optimize({
      build: { build: baseBuild(), attributes },
      sourceKind: "existing",
      goals: { priorities: [{ id: "all_critical_attack", rank: 1, mode: "at_least", minimum: impossible }], protect: [] },
      rules: {
        minimumItemLevel: 0,
        includeSetEffects: false,
        optimizeThreeTraits: false,
        bestHeroicConfiguration: false,
        runes: { mode: "keep" },
        artifacts: { mode: "keep" },
      },
      depth: "fast",
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, "the optimizer must reject an impossible floor");
  assert.match(thrown.message, /No build satisfies the protected or minimum stat constraints\./);
  assert.match(thrown.message, /best evaluated build reached/);
  const diagnostics = thrown.constraintDiagnostics;
  assert.ok(diagnostics, "structured diagnostics must ride on the error");
  const conflict = diagnostics.conflicts.find((row) => row.id === "all_critical_attack");
  assert.ok(conflict, "the impossible stat is named");
  assert.equal(conflict.required, impossible);
  assert.equal(conflict.kind, "minimum");
  assert.ok(conflict.bestAchievable > 0 && conflict.bestAchievable < impossible);
  assert.equal(typeof conflict.formattedBestAchievable, "string");
});
