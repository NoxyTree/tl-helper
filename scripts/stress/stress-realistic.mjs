// Realistic optimizer stress test.
//
// Simulates how players actually use the Build Optimizer: pick a weapon pair and
// 5-10 stat preferences appropriate to that build, some as "improve" (maximize)
// and some as "keep at least" floors. Measures wall time, whether it succeeds,
// the resulting score, whether declared floors are met, and flags anything that
// looks unreasonable (failure, excessive time, degenerate attribute dump).
//
//   node .bench/stress-realistic.mjs [--depth=fast|thorough] [--partition=N/M] [--json]
import { availableParallelism } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Worker as NodeWorker } from "node:worker_threads";

import * as core from "../../web/tl-core.js";
import { createOptimizerAdapter } from "../../web/optimizer/tl-full-build-adapter.js";
import { createOptimizerWorkerPool } from "../../web/optimizer/tl-optimizer-worker-pool.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const depth = arg("depth", "fast");
const asJson = process.argv.includes("--json");
const [pIdx, pCount] = String(arg("partition", "1/1")).split("/").map(Number);

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

// Weapon-family stat pools — preferences a player of that archetype would pick.
const MELEE = ["hp_max", "melee_critical_attack", "all_double_attack", "all_double_defense", "all_evasion", "all_critical_defense", "melee_accuracy", "skill_cooldown_modifier", "critical_damage_dealt_modifier", "pvp_melee_accuracy"];
const RANGED = ["range_accuracy", "all_critical_attack", "all_double_attack", "hp_max", "all_evasion", "critical_damage_dealt_modifier", "skill_cooldown_modifier", "all_double_defense", "pvp_range_accuracy", "attack_speed_modifier"];
const MAGIC = ["magic_critical_attack", "skill_power_amplification", "skill_cooldown_modifier", "hp_max", "magic_accuracy", "buff_given_duration_modifier", "critical_damage_dealt_modifier", "all_evasion", "cost_max", "pvp_magic_accuracy"];
const SUPPORT = ["heal_modifier", "skill_cooldown_modifier", "buff_given_duration_modifier", "cost_max", "hp_max", "all_evasion", "all_double_defense", "skill_power_amplification", "cost_regen", "all_critical_defense"];
const TANK = ["hp_max", "hp_regen", "all_critical_defense", "all_evasion", "all_double_defense", "melee_accuracy", "skill_cooldown_modifier", "collide_amplification", "pvp_all_critical_defense", "shield_block_chance"];

const FAMILY = { sword: MELEE, greatsword: MELEE, sword2h: MELEE, dagger: MELEE, spear: MELEE, gauntlet: MELEE, bow: RANGED, crossbow: RANGED, staff: MAGIC, wand: SUPPORT, orb: SUPPORT };

// 12 weapon pairs covering all 10 weapons.
const PAIRS = [
  ["sword", "dagger"], ["sword", "sword2h"], ["sword", "wand"],
  ["sword2h", "dagger"], ["staff", "dagger"], ["crossbow", "dagger"],
  ["bow", "dagger"], ["wand", "orb"], ["spear", "dagger"],
  ["gauntlet", "sword2h"], ["gauntlet", "dagger"], ["staff", "wand"],
];

// Per pair: preference sets of 5, 7, and 10 stats. The "profile" picks the pool
// from the primary weapon. Two of each set are floors (at_least) at 65% of a
// quick maximize probe, the rest maximize — a realistic "improve some, keep some".
function poolFor(pair) {
  // Prefer a magic/support pool if either weapon is caster, else melee/ranged by primary.
  if (pair.includes("staff")) return MAGIC;
  if (pair.includes("wand") || pair.includes("orb")) return SUPPORT;
  if (pair.includes("bow") || pair.includes("crossbow")) return RANGED;
  if (pair.includes("gauntlet")) return TANK;
  return FAMILY[pair[0]] ?? MELEE;
}

function baseRequest(build, weapons, priorities) {
  return {
    build, sourceKind: "scratch", weaponTypes: weapons, attributePointBudget: 59,
    goals: { priorities, protect: [] }, lockedSlotIds: [],
    progression: { enabled: true, skillLevelCap: 20, masteryPointsByWeapon: {}, overallMasteryLevel: 0 },
    rules: {
      minimumItemLevel: 50, keepCurrentHeroics: false, reconsiderHeroics: false,
      includeSetEffects: true, optimizeThreeTraits: true, bestHeroicConfiguration: false,
      allowUnownedHeroics: false,
      runes: { mode: "normal", chaosOwnershipRequired: true, normalDuplicateCap: 3, chaosDuplicateCap: 1 },
      artifacts: { mode: "sets" },
    },
    depth,
  };
}

async function optimize(req) {
  const t = performance.now();
  try { const r = await adapter.optimize(req, { onProgress() {} }); return { ok: true, ms: performance.now() - t, result: r }; }
  catch (e) { return { ok: false, ms: performance.now() - t, error: String(e?.message ?? e) }; }
}

// Build the request matrix.
const requests = [];
for (const pair of PAIRS) {
  const pool = poolFor(pair);
  for (const n of [5, 7, 10]) {
    const ids = pool.slice(0, n);
    requests.push({ pair, n, ids });
  }
}
const mine = requests.filter((_, i) => (i % pCount) === (pIdx - 1));

const rows = [];
for (const rq of mine) {
  // 1) probe: maximize all, to size the floors realistically
  const b1 = await adapter.createScratchBuild({ name: "realistic probe" });
  const probe = await optimize(baseRequest(b1, rq.pair, rq.ids.map((id, i) => ({ id, rank: i + 1, mode: "maximize", minimum: null, target: null }))));
  if (!probe.ok) { rows.push({ pair: rq.pair.join("/"), n: rq.n, ok: false, ms: Math.round(probe.ms), error: probe.error.slice(0, 90), phase: "probe" }); continue; }
  const pv = Object.fromEntries(probe.result.goalResults.map((g) => [g.id, g.value]));

  // 2) realistic: last two prefs become "keep at least" floors at 65% of probe.
  const floorIds = rq.ids.slice(-2);
  const floors = Object.fromEntries(floorIds.map((id) => [id, Math.floor(pv[id] * 0.65)]));
  const b2 = await adapter.createScratchBuild({ name: "realistic run" });
  const run = await optimize(baseRequest(b2, rq.pair, rq.ids.map((id, i) => ({
    id, rank: i + 1,
    mode: floorIds.includes(id) ? "at_least" : "maximize",
    minimum: floorIds.includes(id) ? floors[id] : null, target: null,
  }))));

  const label = `${rq.pair.join("/")} n=${rq.n}`;
  if (!run.ok) { rows.push({ pair: rq.pair.join("/"), n: rq.n, ok: false, ms: Math.round(run.ms), error: run.error.slice(0, 90), phase: "run" }); console.error("FAIL", label, run.error.slice(0, 70)); continue; }

  const got = Object.fromEntries(run.result.goalResults.map((g) => [g.id, g.value]));
  const floorsMet = floorIds.every((id) => Number(got[id]) >= floors[id]);
  const attrs = run.result.optimizedAttributes ?? run.result.attributes ?? {};
  const attrVals = Object.values(attrs).map(Number);
  const attrTotal = attrVals.reduce((a, b) => a + b, 0);
  const maxAttr = Math.max(0, ...attrVals);
  // Degenerate = one attribute holds >85% of the spend.
  const degenerate = attrTotal > 0 && maxAttr / attrTotal > 0.85;
  rows.push({
    pair: rq.pair.join("/"), n: rq.n, ok: true, ms: Math.round(run.ms),
    score: Number(run.result.score.toFixed(3)), floorsMet, degenerate,
    attrs: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, Number(v)])),
    topGoals: rq.ids.slice(0, 3).map((id) => `${core.statName(id)}=${core.formatStat(id, got[id])}`),
  });
  console.error(`${run.ok ? "ok " : "ERR"} ${label.padEnd(26)} ${String(Math.round(run.ms)).padStart(6)}ms  score=${run.result.score.toFixed(3)}  floors=${floorsMet ? "met" : "MISSED"}${degenerate ? "  DEGENERATE-ATTRS" : ""}`);
}

// Summary
const ok = rows.filter((r) => r.ok);
const times = ok.map((r) => r.ms).sort((a, b) => a - b);
const pctile = (p) => times.length ? times[Math.min(times.length - 1, Math.floor(times.length * p))] : 0;
const summary = {
  depth, partition: `${pIdx}/${pCount}`, requests: rows.length,
  succeeded: ok.length, failed: rows.filter((r) => !r.ok).length,
  floorsMissed: ok.filter((r) => !r.floorsMet).length,
  degenerate: ok.filter((r) => r.degenerate).length,
  timing: { min: times[0], median: pctile(0.5), p90: pctile(0.9), max: times.at(-1) },
};

if (asJson) console.log(JSON.stringify({ summary, rows }, null, 1));
else {
  console.log("\n=== REALISTIC STRESS SUMMARY ===");
  console.log(JSON.stringify(summary, null, 1));
  const bad = rows.filter((r) => !r.ok || !r.floorsMet || r.degenerate);
  if (bad.length) console.log("\nFLAGGED:\n" + JSON.stringify(bad, null, 1));
}
pool.terminate();
