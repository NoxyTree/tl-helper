import { availableParallelism } from "node:os";
import path from "node:path";
import { Worker as NodeWorker } from "node:worker_threads";
import * as core from "../web/tl-core.js";
import { createOptimizerAdapter } from "../web/tl-full-build-adapter.js";
import { createOptimizerWorkerPool } from "../web/tl-optimizer-worker-pool.js";
import { loadWebDataFromFile } from "./lib/load-web-projections.mjs";

const goals = process.argv.slice(2).length ? process.argv.slice(2) : ["pvp_melee_accuracy", "pvp_range_accuracy", "pvp_magic_accuracy"];
await core.initCore(await loadWebDataFromFile(path.resolve("web/data/app-data.json")));

class NodeWebWorker {
  constructor(url) {
    this.worker = new NodeWorker(url);
    this.worker.on("message", (data) => this.onmessage?.({ data }));
    this.worker.on("error", (error) => this.onerror?.(error));
    this.worker.on("messageerror", (error) => this.onmessageerror?.(error));
  }
  postMessage(message) { this.worker.postMessage(message); }
  terminate() { return this.worker.terminate(); }
}

const pool = createOptimizerWorkerPool({
  size: Math.max(1, Math.min(4, Number(process.env.TL_AUDIT_WORKERS) || Math.floor(availableParallelism() / 2))),
  WorkerCtor: NodeWebWorker,
  workerUrl: new URL("./node-optimizer-task-worker.mjs", import.meta.url),
});
const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }), optimizerTaskPool: pool });
const results = [];

for (const goal of goals) {
  const build = await adapter.createScratchBuild({ name: `${goal} maximum audit` });
  const started = performance.now();
  const result = await adapter.optimize({
    build,
    sourceKind: "scratch",
    attributePointBudget: 59,
    goals: { priorities: [{ id: goal, rank: 1, mode: "maximize", minimum: null, target: null }], protect: [] },
    lockedSlotIds: [],
    progression: { enabled: true, skillLevelCap: 20, masteryPointsByWeapon: {}, overallMasteryLevel: 1560 },
    rules: {
      minimumItemLevel: 0,
      keepCurrentHeroics: false,
      reconsiderHeroics: true,
      includeSetEffects: true,
      optimizeThreeTraits: true,
      bestHeroicConfiguration: true,
      allowUnownedHeroics: true,
      runes: { mode: "normal", chaosOwnershipRequired: false, normalDuplicateCap: 3, chaosDuplicateCap: 1 },
      artifacts: { mode: "sets" },
    },
    depth: "refine",
  });
  const calc = core.calculateBuild(result.build, result.attributes, { includeSetEffects: true });
  const stat = calc.stats.find((row) => row.id === goal);
  results.push({
    goal,
    elapsedSeconds: Math.round((performance.now() - started) / 100) / 10,
    valueRaw: stat?.total ?? 0,
    valueDisplay: core.formatStat(goal, stat?.total ?? 0),
    weaponTypes: core.equippedWeaponTypes(result.build),
    weapons: ["main_hand", "off_hand"].map((slotId) => core.indexes.itemById[result.build.equipment[slotId]?.itemId]?.name),
    attributes: result.attributes,
    majorSources: (stat?.sources ?? []).slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 15)
      .map(({ name, sourceLabel, value, type }) => ({ name: name ?? sourceLabel, value, type })),
    status: calc.status,
  });
}

pool.terminate();
console.log(JSON.stringify({ gameBuild: core.data.gameBuild, potentialsIncluded: false, results }, null, 2));
