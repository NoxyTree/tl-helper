import { createHash } from "node:crypto";
import { availableParallelism } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Worker as NodeWorker } from "node:worker_threads";

import * as core from "../web/tl-core.js";
import { createOptimizerAdapter } from "../web/tl-full-build-adapter.js";
import { createOptimizerWorkerPool } from "../web/tl-optimizer-worker-pool.js";
import { loadWebDataFromFile } from "./lib/load-web-projections.mjs";

const option = (name, fallback) => process.argv.find((row) => row.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const depth = option("depth", "fast");
const runs = Math.max(1, Number(option("runs", "1")) || 1);
const timeoutMs = Math.max(0, Number(option("timeout-ms", "0")) || 0);
const progressionEnabled = option("progression", "true") !== "false";
const defaultWorkerCount = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
const workerCount = Math.max(1, Math.floor(Number(option("workers", String(defaultWorkerCount))) || 1));
const goalIds = [
  "pvp_all_critical_defense",
  "pvp_melee_accuracy",
  "skill_cooldown_modifier",
  "collide_amplification",
  "buff_given_duration_modifier",
];

const dataStartedAt = performance.now();
const data = await loadWebDataFromFile(path.resolve("web/data/app-data.json"));
const dataLoadMs = performance.now() - dataStartedAt;
const initStartedAt = performance.now();
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
const initializationMs = performance.now() - initStartedAt;

function requestFor(build) {
  return {
    build,
    sourceKind: "scratch",
    weaponTypes: ["sword", "sword2h"],
    attributePointBudget: 59,
    goals: { priorities: goalIds.map((id, index) => ({ id, rank: index + 1, mode: "maximize", minimum: null, target: null })), protect: [] },
    lockedSlotIds: [],
    progression: { enabled: progressionEnabled, skillLevelCap: 20, masteryPointsByWeapon: {}, overallMasteryLevel: 0 },
    rules: {
      minimumItemLevel: 50,
      keepCurrentHeroics: false,
      reconsiderHeroics: false,
      includeSetEffects: true,
      optimizeThreeTraits: true,
      bestHeroicConfiguration: false,
      allowUnownedHeroics: false,
      runes: { mode: "normal", chaosOwnershipRequired: true, normalDuplicateCap: 3, chaosDuplicateCap: 1 },
      artifacts: { mode: "sets" },
    },
    depth,
  };
}

function resultIdentity(result) {
  return {
    equipment: result.build.equipment,
    artifacts: result.build.artifacts,
    attributes: result.optimizedAttributes ?? result.attributes,
    progression: result.progression,
    goals: Object.fromEntries(result.goalResults.map(({ id, value }) => [id, value])),
  };
}

function activeSetBreakpoints(setEffects) {
  const sets = Array.isArray(setEffects) ? setEffects : Object.values(setEffects?.sets ?? setEffects ?? {});
  return sets.flatMap((set) => (set.breakpoints ?? set.bonuses ?? [])
    .filter((row) => row.active === true)
    .map((row) => `${set.setId ?? set.id}:${row.required ?? row.setCount ?? row.set_count}`)).sort();
}

const receipts = [];
for (let run = 1; run <= runs; run += 1) {
  const build = await adapter.createScratchBuild({ name: "Five preference benchmark" });
  const controller = new AbortController();
  const timeout = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const startedAt = performance.now();
  const boundaries = new Map();
  let combinations = 0;
  const mark = (name) => { if (!boundaries.has(name)) boundaries.set(name, performance.now() - startedAt); };
  try {
    const result = await adapter.optimize(requestFor(build), {
      signal: controller.signal,
      onProgress(progress) {
        const detailCount = Number(String(progress.detail ?? "").replaceAll(",", "").match(/\d+/)?.[0] ?? 0);
        if (String(progress.label).includes("Searching legal loadouts")) {
          mark("candidateGenerationEnd");
          combinations = Math.max(combinations, detailCount);
        } else if (String(progress.label).includes("preliminary finalists")) {
          mark("loadoutSearchEnd");
          combinations = Math.max(combinations, detailCount);
        } else if (String(progress.label).includes("attribute points")) {
          mark("preliminaryExactEnd");
        } else if (String(progress.label).includes("rune synergies")) {
          mark("attributesEnd");
        } else if (String(progress.label).includes("passive skills and mastery")) {
          mark("runesEnd");
        }
      },
    });
    const wallMs = performance.now() - startedAt;
    const calculation = core.calculateBuild(result.build, result.attributes, { includeSetEffects: true });
    const identity = resultIdentity(result);
    const heroicItemCount = Object.values(result.build.equipment ?? {})
      .map((selection) => core.indexes.itemById[selection?.itemId])
      .filter((item) => item?.grade === core.HEROIC_GRADE).length;
    const at = (name) => Number(boundaries.get(name) ?? wallMs);
    receipts.push({
      run,
      temperature: run === 1 ? "cold" : "warm",
      depth,
      wallMs: Math.round(wallMs),
      phasesMs: {
        candidateGeneration: Math.round(at("candidateGenerationEnd")),
        loadoutSearch: Math.round(at("loadoutSearchEnd") - at("candidateGenerationEnd")),
        preliminaryExact: Math.round(at("preliminaryExactEnd") - at("loadoutSearchEnd")),
        attributes: Math.round(at("attributesEnd") - at("preliminaryExactEnd")),
        runes: Math.round(at("runesEnd") - at("attributesEnd")),
        progression: Math.round(wallMs - at("runesEnd")),
      },
      combinations,
      attributeFinalists: result.attributeFinalistsEvaluated,
      progressionFinalists: result.progressionFinalistsEvaluated,
      score: result.score,
      goals: result.goalResults.map(({ id, value, formattedValue }) => ({ id, value, formattedValue })),
      attributes: result.attributes,
      status: calculation.status.state,
      blockingIssueCodes: calculation.status.blockingIssues.map((issue) => issue.code),
      heroicItemCount,
      activeSetBreakpoints: activeSetBreakpoints(result.setEffects),
      searchMetrics: result.searchMetrics,
      identitySha256: createHash("sha256").update(JSON.stringify(identity)).digest("hex"),
    });
  } catch (error) {
    receipts.push({ run, temperature: run === 1 ? "cold" : "warm", depth, wallMs: Math.round(performance.now() - startedAt), error: String(error?.message ?? error), aborted: error?.name === "AbortError" });
    if (error?.name !== "AbortError") throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

console.log(JSON.stringify({
  benchmark: "sword-greatsword-five-preferences",
  gameBuild: core.data.gameBuild,
  dataLoadMs: Math.round(dataLoadMs),
  initializationMs: Math.round(initializationMs),
  request: { weaponTypes: ["sword", "sword2h"], attributePointBudget: 59, goalIds, progression: progressionEnabled, unownedHeroics: false },
  workerCount,
  receipts,
}, null, 2));
optimizerTaskPool.terminate();
