// Sweeps RANK_DECAY values across curated goal presets at full thorough depth
// to measure how ranking steepness trades rank-1 retention against secondary
// goals. Mirrors the Build-from-Scratch request shape (theoretical heroics,
// thorough depth, preset floors as at_least goals). The engine is
// deterministic, so one run per (decay, preset) is sufficient.
//
//   node scripts/benchmark-rank-decay.mjs --decays=0.05,0.15,0.25,0.35,0.5 \
//     --presets=boss-dps,pvp-evasion --weapons=sword,sword2h --workers=4
import { availableParallelism } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Worker as NodeWorker } from "node:worker_threads";

import * as core from "../web/tl-core.js";
import { createOptimizerAdapter } from "../web/tl-full-build-adapter.js";
import { createOptimizerWorkerPool } from "../web/tl-optimizer-worker-pool.js";
import { resolveOptimizerPreset, weaponStatFamily } from "../web/tl-optimizer-presets.js";
import { loadWebDataFromFile } from "./lib/load-web-projections.mjs";

const option = (name, fallback) => process.argv.find((row) => row.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const decays = option("decays", "0.05,0.15,0.25,0.35,0.5").split(",").map(Number).filter((value) => value > 0 && value <= 1);
const presetIds = option("presets", "boss-dps,pvp-evasion").split(",").filter(Boolean);
const weaponTypes = option("weapons", "sword,sword2h").split(",");
const defaultWorkerCount = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
const workerCount = Math.max(1, Math.floor(Number(option("workers", String(defaultWorkerCount))) || 1));

const data = await loadWebDataFromFile(path.resolve("web/data/app-data.json"));
await core.initCore(data);
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
const optimizerTaskPool = createOptimizerWorkerPool({
  size: workerCount,
  WorkerCtor: workerCount > 1 ? NodeWebWorker : undefined,
  workerUrl: new URL("./node-optimizer-task-worker.mjs", import.meta.url),
});
const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }), optimizerTaskPool });

function presetGoals(presetId, rankDecay) {
  const preset = resolveOptimizerPreset(presetId, { family: weaponStatFamily(weaponTypes[0]) });
  const priorities = [
    ...preset.maximize.map((id) => ({ id, mode: "maximize", minimum: null, target: null })),
    ...preset.floors.map(({ id, display }) => ({ id, mode: "at_least", minimum: core.statDisplayToRaw(id, display), target: null })),
  ].map((row, index) => ({ ...row, rank: index + 1 }));
  return { priorities, protect: [], rankDecay };
}

function requestFor(build, presetId, rankDecay) {
  return {
    build,
    sourceKind: "scratch",
    weaponTypes,
    attributePointBudget: 59,
    goals: presetGoals(presetId, rankDecay),
    lockedSlotIds: [],
    progression: { enabled: true, skillLevelCap: 20, masteryPointsByWeapon: {}, overallMasteryLevel: 0 },
    rules: {
      minimumItemLevel: 50,
      keepCurrentHeroics: false,
      reconsiderHeroics: true,
      includeSetEffects: true,
      optimizeThreeTraits: true,
      bestHeroicConfiguration: true,
      allowUnownedHeroics: true,
      runes: { mode: "normal", chaosOwnershipRequired: true, normalDuplicateCap: 3, chaosDuplicateCap: 1 },
      artifacts: { mode: "sets" },
    },
    depth: "thorough",
  };
}

// One NDJSON receipt per line so a killed run still yields every completed row.
for (const presetId of presetIds) {
  for (const decay of decays) {
    const build = await adapter.createScratchBuild({ name: `Rank decay ${decay} — ${presetId}` });
    const startedAt = performance.now();
    const result = await adapter.optimize(requestFor(build, presetId, decay));
    const wallMs = Math.round(performance.now() - startedAt);
    const itemName = (selection) => core.indexes.itemById[selection?.itemId]?.name ?? null;
    console.log(JSON.stringify({
      benchmark: "rank-decay-sweep",
      gameBuild: core.data.gameBuild,
      weaponTypes,
      workerCount,
      preset: presetId,
      decay,
      wallMs,
      score: result.score,
      goals: result.goalResults.map(({ id, value, formattedValue, mode, minimumMet }) => ({ id, value, formattedValue, mode, minimumMet })),
      attributes: result.attributes,
      equipment: Object.fromEntries(Object.entries(result.build.equipment ?? {}).map(([slot, selection]) => [slot, itemName(selection)])),
      statDeltas: result.statDeltas?.slice(0, 12) ?? null,
    }));
    console.error(`done preset=${presetId} decay=${decay} wallMs=${wallMs}`);
  }
}

optimizerTaskPool.terminate();
