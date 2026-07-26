// Witness test for false infeasibility.
//
// Step 1 runs the optimizer with NO floors and records the goal values it
// achieved. That result is a proof-by-construction that a legal build exists at
// those values. Step 2 re-runs with floors set to a FRACTION of those same
// values. Any failure is a build the search demonstrably can reach but loses.
//
// Run from repo root: node .bench/probe-false-infeasibility.mjs
import { availableParallelism } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Worker as NodeWorker } from "node:worker_threads";

import * as core from "../../web/tl-core.js";
import { createOptimizerAdapter } from "../../web/optimizer/tl-full-build-adapter.js";
import { createOptimizerWorkerPool } from "../../web/optimizer/tl-optimizer-worker-pool.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const data = await loadWebDataFromFile(path.resolve("web/data/app-data.json"));
await core.initCore(data);

class NodeWebWorker {
  constructor(url) {
    this.worker = new NodeWorker(url);
    this.worker.on("message", (d) => this.onmessage?.({ data: d }));
    this.worker.on("error", (e) => this.onerror?.(e));
    this.worker.on("messageerror", (e) => this.onmessageerror?.(e));
  }
  postMessage(m) { this.worker.postMessage(m); }
  terminate() { return this.worker.terminate(); }
}

const workerCount = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
const optimizerTaskPool = createOptimizerWorkerPool({
  size: workerCount,
  WorkerCtor: NodeWebWorker,
  workerUrl: new URL("../node-optimizer-task-worker.mjs", import.meta.url),
});
const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }), optimizerTaskPool });

// Mirrors a player transcribing their existing build's stats in as floors.
const GOALS = ["pvp_melee_accuracy", "pvp_all_critical_defense", "hp_max"];
const WEAPONS = ["sword", "dagger"];
const DEPTH = "fast";

function requestFor(build, minimums) {
  return {
    build,
    sourceKind: "scratch",
    weaponTypes: WEAPONS,
    attributePointBudget: 59,
    goals: {
      priorities: GOALS.map((id, i) => ({
        id, rank: i + 1,
        mode: minimums?.[id] != null ? "at_least" : "maximize",
        minimum: minimums?.[id] ?? null,
        target: null,
      })),
      protect: [],
    },
    lockedSlotIds: [],
    progression: { enabled: true, skillLevelCap: 20, masteryPointsByWeapon: {}, overallMasteryLevel: 0 },
    rules: {
      minimumItemLevel: 50, keepCurrentHeroics: false, reconsiderHeroics: false,
      includeSetEffects: true, optimizeThreeTraits: true, bestHeroicConfiguration: false,
      allowUnownedHeroics: false,
      runes: { mode: "normal", chaosOwnershipRequired: true, normalDuplicateCap: 3, chaosDuplicateCap: 1 },
      artifacts: { mode: "sets" },
    },
    depth: DEPTH,
  };
}

async function run(minimums) {
  const build = await adapter.createScratchBuild({ name: "witness probe" });
  const startedAt = performance.now();
  try {
    const result = await adapter.optimize(requestFor(build, minimums), { onProgress() {} });
    return {
      ok: true,
      wallMs: Math.round(performance.now() - startedAt),
      goals: Object.fromEntries(result.goalResults.map((g) => [g.id, g.value])),
    };
  } catch (error) {
    return {
      ok: false,
      wallMs: Math.round(performance.now() - startedAt),
      error: String(error?.message ?? error),
    };
  }
}

const receipts = [];

// Step 1: the witness.
const baseline = await run(null);
receipts.push({ label: "unconstrained (witness)", floors: null, ...baseline });
if (!baseline.ok) {
  console.log(JSON.stringify({ receipts }, null, 2));
  optimizerTaskPool.terminate();
  process.exit(0);
}

// adapter.optimize() takes RAW minimums; display->raw conversion happens above
// it in tl-optimizer-api.js (core.statDisplayToRaw). Use the raw witness values.
const witnessRaw = Object.fromEntries(GOALS.map((id) => [id, baseline.goals[id]]));

for (const pct of [0.70, 0.85, 0.95, 0.99, 1.0]) {
  const floors = Object.fromEntries(GOALS.map((id) => [id, Math.floor(witnessRaw[id] * pct)]));
  const row = await run(floors);
  receipts.push({
    label: `floors at ${Math.round(pct * 100)}% of witness`,
    floors,
    ...row,
    // A witness build exists at 100% of these values, so any failure here is a
    // build the search reached moments earlier and then lost.
    falseInfeasibility: row.ok === false && row.error?.includes("No build satisfies"),
  });
}

console.log(JSON.stringify({
  weapons: WEAPONS,
  depth: DEPTH,
  goals: GOALS.map((id) => ({ id, name: core.statName(id) })),
  witnessRaw,
  receipts,
}, null, 2));

optimizerTaskPool.terminate();
