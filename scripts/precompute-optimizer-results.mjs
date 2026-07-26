// Generates the precomputed optimizer result cache consumed by
// web/optimizer/tl-optimizer-precache.js. Runs the real adapter at thorough depth for
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
import { createOptimizerAdapter } from "../web/optimizer/tl-full-build-adapter.js";
import { createOptimizerWorkerPool } from "../web/optimizer/tl-optimizer-worker-pool.js";
import { canonicalPrecacheRequest, precacheKey } from "../web/optimizer/tl-optimizer-precache.js";
import { resolveClassPreset, weaponStatFamily } from "../web/optimizer/tl-optimizer-presets.js";
import { loadWebDataFromFile } from "./lib/load-web-projections.mjs";
import { optimizerEngineFingerprint } from "./lib/optimizer-engine-fingerprint.mjs";

// Preset × weapon-pair matrix. Pairs mirror the archetypes with public
// popularity evidence (scripts/combat-opponents/questlog-roster.json chassis
// plus long-standing meta pairings); extend freely — the client falls back to
// a live run for anything not listed here.
// These are the CLASS presets the scratch page's role/preset chips actually
// apply (build-from-scratch.html:2857 -> applyClassPreset), not the
// OPTIMIZER_PRESETS vocabulary. The two are different sets of ids resolving to
// different priorities, and generating against the wrong one produced a cache
// that could never be hit: a real UI request canonicalized fine, fetched
// index.json, derived a key that was not in it, and fell through to a live run
// every single time. Verified end-to-end in a browser before and after.
//
// Pairs carry over from the previous matrix; each row maps to the class preset
// a player would reach for the same intent.
const MATRIX = [
  { role: "dps", preset: "pve-dps", pairs: [["dagger", "sword2h"], ["crossbow", "dagger"], ["staff", "dagger"]] },
  { role: "dps", preset: "pvp-heavy-dps", pairs: [["sword2h", "dagger"], ["crossbow", "dagger"], ["staff", "dagger"]] },
  { role: "dps", preset: "pvp-evasion-dps", pairs: [["sword", "dagger"], ["sword", "wand"]] },
  { role: "dps", preset: "pvp-crit-dps", pairs: [["dagger", "sword"], ["staff", "dagger"]] },
  { role: "tank", preset: "pve-tank", pairs: [["sword", "wand"], ["sword", "dagger"]] },
  { role: "oracle", preset: "pvp-endurance-oracle", pairs: [["wand", "orb"], ["wand", "sword"]] },
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

// Mirrors resolvePresetStats + applyClassPreset in build-from-scratch.html:
// family comes from the MAIN weapon, unknown ids are dropped against
// adapter.listStats(), duplicates are removed keeping first position, and every
// goal is left on the default "maximize" — the chips set no goalModes or
// goalValues, so nothing becomes a floor. Any drift from that page's behaviour
// silently reintroduces a permanently-missing cache.
function scratchRequest(build, role, presetId, weaponTypes, knownStatIds) {
  const preset = resolveClassPreset(role, presetId, { family: weaponStatFamily(weaponTypes[0]) });
  if (!preset) throw new Error(`Unknown class preset: ${role}/${presetId}`);
  const seen = new Set();
  const stats = preset.stats.filter((id) => knownStatIds.has(id) && !seen.has(id) && seen.add(id));
  if (!stats.length) throw new Error(`${role}/${presetId}: resolved to no known stats.`);
  const priorities = stats.map((id, index) => ({ id, rank: index + 1, mode: "maximize", minimum: null, target: null }));
  return {
    build,
    sourceKind: "scratch",
    weaponTypes,
    attributePointBudget: 59,
    goals: { priorities, protect: [] },
    lockedSlotIds: [],
    progression: { enabled: true, skillLevelCap: 20, masteryPointsByWeapon: {}, overallMasteryLevel: 1300 },
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

const knownStatIds = new Set((await adapter.listStats()).map((row) => row.id));

for (const { role, preset, pairs } of MATRIX) {
  for (const weaponTypes of pairs) {
    const fileName = `${preset}-${weaponTypes[0]}-${weaponTypes[1]}.json`;
    const filePath = path.join(outDir, fileName);
    // No name override: the page calls createScratchBuild() bare, and stored
    // results must be indistinguishable from a live run's.
    const build = await adapter.createScratchBuild();
    const request = scratchRequest(build, role, preset, weaponTypes, knownStatIds);
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
    // tuningFrontier is ~95% of a stored entry (1,924KB of 2,032KB measured):
    // up to `frontierCount` candidates, each carrying a full cloned build plus a
    // redundant activeAttributeBreakpoints list. Keeping it would put a
    // full-coverage cache (45 weapon pairs x 6 presets = 270 entries) at ~540MB
    // of git blobs, regenerated wholesale on every engine-fingerprint change.
    // Dropping it lands the same coverage at ~29MB.
    //
    // Cost: a cache HIT serves no tuning candidates, so the result view shows no
    // tuning sliders (build-from-scratch.html guards on
    // `tuningFrontier.length > 1`). Everything else — the build, its stats, goal
    // results, alternatives — is unaffected. A live run still returns the full
    // frontier, so tuning is only absent on precached presets.
    delete roundTripped.tuningFrontier;
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
