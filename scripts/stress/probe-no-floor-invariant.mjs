// Safety invariant: with NO minimums declared, the floor-steering change must
// leave the search byte-identical. The precache cannot test this (every preset
// declares floors), so run a floor-free scratch request directly and compare its
// full result identity. Run this against HEAD (baseline) and the working tree.
import { availableParallelism } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
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
const pool = createOptimizerWorkerPool({
  size: Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2))),
  WorkerCtor: NodeWebWorker,
  workerUrl: new URL("../node-optimizer-task-worker.mjs", import.meta.url),
});
const adapter = await createOptimizerAdapter({ core, storage: {}, loadArmoryState: () => ({ ok: false }), optimizerTaskPool: pool });

// Three floor-FREE scratch requests (all goals maximize, no minimum/target).
const CASES = [
  { weapons: ["sword", "dagger"], goals: ["pvp_melee_accuracy", "pvp_all_critical_defense", "hp_max"] },
  { weapons: ["staff", "dagger"], goals: ["magic_critical_attack", "skill_cooldown_modifier", "hp_max"] },
  { weapons: ["crossbow", "dagger"], goals: ["boss_range_accuracy", "melee_critical_attack", "hp_max"] },
];

// Re-baselineable snapshot of the current optimizer output. Intentional engine or
// route changes may alter these hashes; review and update them in the same commit.
const EXPECTED_HASHES = [
  "596c8913e38d0a3e96910d6691a5b39035bb5be75b980c7834a435f80e3884b6",
  "e2021bdd8c5405f0410b17c3e15b581445f581dde79b8153a041500a9903e962",
  "5a2dc21bb9886702cbf3a73a64d68da676110d76faab21daeaa2c3ad9748dd13",
];

const results = [];
for (const c of CASES) {
  const build = await adapter.createScratchBuild({ name: "no-floor invariant" });
  const result = await adapter.optimize({
    build, sourceKind: "scratch", weaponTypes: c.weapons, attributePointBudget: 59,
    goals: { priorities: c.goals.map((id, i) => ({ id, rank: i + 1, mode: "maximize", minimum: null, target: null })), protect: [] },
    lockedSlotIds: [],
    progression: { enabled: true, skillLevelCap: 20, masteryPointsByWeapon: {}, overallMasteryLevel: 0 },
    rules: {
      minimumItemLevel: 50, keepCurrentHeroics: false, reconsiderHeroics: false,
      includeSetEffects: true, optimizeThreeTraits: true, bestHeroicConfiguration: false,
      allowUnownedHeroics: false,
      runes: { mode: "normal", chaosOwnershipRequired: true, normalDuplicateCap: 3, chaosDuplicateCap: 1 },
      artifacts: { mode: "sets" },
    },
    depth: "fast",
  }, { onProgress() {} });
  // Identity = the parts a search change would perturb.
  const identity = {
    equipment: result.build.equipment,
    artifacts: result.build.artifacts,
    attributes: result.optimizedAttributes ?? result.attributes,
    score: Number(result.score.toFixed(9)),
    goals: Object.fromEntries(result.goalResults.map((g) => [g.id, g.value])),
  };
  const hash = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  results.push({ weapons: c.weapons.join("/"), attributes: identity.attributes, score: identity.score, hash });
}

let failures = 0;
for (const [index, result] of results.entries()) {
  const expected = EXPECTED_HASHES[index];
  if (result.hash === expected) {
    console.log(`PASS ${result.weapons}: ${result.hash}`);
  } else {
    failures++;
    console.error(`FAIL ${result.weapons}: expected ${expected}, received ${result.hash}`);
  }
}

console.log(JSON.stringify({ label: process.argv[2] ?? "run", results }, null, 2));
pool.terminate();
if (failures > 0) process.exitCode = 1;
