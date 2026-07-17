// Generates the precomputed optimizer result cache consumed by
// web/tl-optimizer-precache.js. Runs the real adapter at thorough depth for
// each curated (preset, weapon-pair) cell, so a stored result is exactly what
// the in-browser worker would produce for the same request (the engine is
// deterministic). Resumable: existing entries whose key still matches are
// skipped; stale entries for the current matrix are overwritten. Re-run after
// any engine or game-data change (scripts/tests/optimizer-precache.test.mjs
// fails the suite while the committed cache is stale).
//
//   node scripts/precompute-optimizer-results.mjs [--workers=4] [--force]
import { availableParallelism } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Worker as NodeWorker } from "node:worker_threads";

import * as core from "../web/tl-core.js";
import { createOptimizerAdapter } from "../web/tl-full-build-adapter.js";
import { createOptimizerWorkerPool } from "../web/tl-optimizer-worker-pool.js";
import { canonicalPrecacheRequest, precacheKey } from "../web/tl-optimizer-precache.js";
import { resolveOptimizerPreset, weaponStatFamily } from "../web/tl-optimizer-presets.js";
import { loadWebDataFromFile } from "./lib/load-web-projections.mjs";
import { optimizerEngineFingerprint } from "./lib/optimizer-engine-fingerprint.mjs";

// Preset × weapon-pair matrix. Pairs mirror the archetypes with public
// popularity evidence (scripts/combat-opponents/questlog-roster.json chassis
// plus long-standing meta pairings); extend freely — the client falls back to
// a live run for anything not listed here.
const MATRIX = [
  { preset: "boss-dps", pairs: [["dagger", "sword2h"], ["crossbow", "dagger"], ["staff", "dagger"]] },
  { preset: "pvp-burst", pairs: [["sword2h", "dagger"], ["crossbow", "dagger"], ["staff", "dagger"]] },
  { preset: "pvp-evasion", pairs: [["sword", "dagger"], ["sword", "wand"]] },
  { preset: "support", pairs: [["wand", "orb"], ["wand", "sword"]] },
];

const option = (name, fallback) => process.argv.find((row) => row.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const force = process.argv.includes("--force");
const workerCount = Math.max(1, Math.floor(Number(option("workers", String(Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)))))) || 1));
const outDir = path.resolve("web/data/optimizer-precache");

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

function scratchRequest(build, presetId, weaponTypes) {
  const preset = resolveOptimizerPreset(presetId, { family: weaponStatFamily(weaponTypes[0]) });
  const priorities = [
    ...preset.maximize.map((id) => ({ id, mode: "maximize", minimum: null, target: null })),
    ...preset.floors.map(({ id, display }) => ({ id, mode: "at_least", minimum: core.statDisplayToRaw(id, display), target: null })),
  ].map((row, index) => ({ ...row, rank: index + 1 }));
  return {
    build,
    sourceKind: "scratch",
    weaponTypes,
    attributePointBudget: 59,
    goals: { priorities, protect: [] },
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

function assertJsonSafe(value, trail = "result") {
  if (value == null || ["string", "number", "boolean"].includes(typeof value)) return;
  if (Array.isArray(value)) return value.forEach((row, index) => assertJsonSafe(row, `${trail}[${index}]`));
  if (value instanceof Set || value instanceof Map) throw new TypeError(`${trail} is a ${value.constructor.name}; it would not survive JSON serialization.`);
  if (typeof value !== "object") throw new TypeError(`${trail} is a ${typeof value}; it would not survive JSON serialization.`);
  for (const [key, nested] of Object.entries(value)) assertJsonSafe(nested, `${trail}.${key}`);
}

mkdirSync(outDir, { recursive: true });
const indexPath = path.join(outDir, "index.json");
const fingerprint = optimizerEngineFingerprint(path.resolve("web"));
const entries = {};

for (const { preset, pairs } of MATRIX) {
  for (const weaponTypes of pairs) {
    const fileName = `${preset}-${weaponTypes[0]}-${weaponTypes[1]}.json`;
    const filePath = path.join(outDir, fileName);
    // No name override: the page calls createScratchBuild() bare, and stored
    // results must be indistinguishable from a live run's.
    const build = await adapter.createScratchBuild();
    const request = scratchRequest(build, preset, weaponTypes);
    const canonical = canonicalPrecacheRequest(request);
    if (!canonical) throw new Error(`${fileName}: request is not cache-eligible; generator and canonicalizer disagree.`);
    const key = await precacheKey(canonical, data.gameBuild);
    // Resume per entry file (the index is only written at the end): an entry
    // is reusable when its key re-derives AND it was generated by the exact
    // current engine sources.
    if (!force && existsSync(filePath)) {
      const existing = JSON.parse(readFileSync(filePath, "utf8"));
      if (existing.key === key && existing.engineFingerprint === fingerprint) {
        entries[key] = fileName;
        console.error(`kept ${fileName} (key and engine unchanged)`);
        continue;
      }
    }
    const startedAt = performance.now();
    const result = await adapter.optimize(request);
    assertJsonSafe(result);
    const roundTripped = JSON.parse(JSON.stringify(result));
    writeFileSync(filePath, JSON.stringify({
      schema: "tl-helper.optimizer-precache-entry",
      schemaVersion: 1,
      key,
      engineFingerprint: fingerprint,
      preset,
      weaponTypes,
      canonicalRequest: canonical,
      result: roundTripped,
    }));
    entries[key] = fileName;
    console.error(`computed ${fileName} in ${Math.round(performance.now() - startedAt)}ms (score ${result.score})`);
  }
}

writeFileSync(indexPath, JSON.stringify({
  schema: "tl-helper.optimizer-precache-index",
  schemaVersion: 1,
  gameBuild: String(data.gameBuild),
  engineFingerprint: fingerprint,
  generatedAt: new Date().toISOString(),
  entries,
}, null, 2));
console.error(`index written: ${Object.keys(entries).length} entries, engine ${fingerprint.slice(0, 16)}…`);
optimizerTaskPool.terminate();
