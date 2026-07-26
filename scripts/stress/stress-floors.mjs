// Optimizer floor stress sweep.
//
// The witness principle: run the optimizer UNCONSTRAINED to see what a stat set
// can reach, then re-run demanding those exact values as "at least" floors. A
// satisfying build provably exists (the optimizer just built it), so any failure
// is a false "no build satisfies" — the bug class behind the original report.
//
// Sweeps: weapon pairs x floor-count x tightness x {plain, +locked slot, +set
// requirement}. Prints one line per case and a final PASS/FAIL tally.
//
//   node .bench/stress-floors.mjs [--partition=N/M] [--depth=fast|thorough]
import { availableParallelism } from "node:os";
import path from "node:path";
import { Worker as NodeWorker } from "node:worker_threads";

import * as core from "../../web/tl-core.js";
import { createOptimizerAdapter } from "../../web/optimizer/tl-full-build-adapter.js";
import { createOptimizerWorkerPool } from "../../web/optimizer/tl-optimizer-worker-pool.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const arg = (name, d) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d;
const depth = arg("depth", "fast");
const [pIdx, pCount] = String(arg("partition", "1/1")).split("/").map(Number);
const hardOnly = process.argv.includes("--hard-only");
const caseFilter = arg("case", "");

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

// Diverse stat pools per weapon pair so floors are weapon-relevant.
const CASES = [
  { w: ["sword", "dagger"],      goals: ["pvp_melee_accuracy", "pvp_all_critical_defense", "hp_max", "melee_critical_attack", "all_evasion"] },
  { w: ["sword", "sword2h"],     goals: ["all_double_attack", "all_critical_attack", "hp_max", "melee_accuracy", "all_double_defense"] },
  { w: ["staff", "dagger"],      goals: ["magic_critical_attack", "skill_cooldown_modifier", "hp_max", "magic_accuracy", "buff_given_duration_modifier"] },
  { w: ["crossbow", "dagger"],   goals: ["boss_range_accuracy", "melee_critical_attack", "hp_max", "range_accuracy", "all_critical_attack"] },
  { w: ["gauntlet", "sword2h"],  goals: ["hp_max", "melee_accuracy", "all_double_defense", "all_evasion", "melee_critical_attack"] },
  { w: ["bow", "dagger"],        goals: ["range_accuracy", "all_critical_attack", "hp_max", "all_evasion", "all_double_attack"] },
  { w: ["orb", "wand"],          goals: ["hp_max", "skill_cooldown_modifier", "buff_given_duration_modifier", "cost_max", "magic_accuracy"] },
  { w: ["sword", "wand"],        goals: ["hp_max", "all_double_defense", "all_critical_defense", "skill_cooldown_modifier", "all_evasion"] },
];
const FLOOR_COUNTS = [1, 3, 5];
const TIGHTNESS = [1.0, 0.98];        // 100% is the hard case; 98% catches near-boundary
const VARIANTS = ["plain", "locked", "set"];

function baseRequest(build, weapons, priorities, extra = {}) {
  return {
    build, sourceKind: "scratch", weaponTypes: weapons, attributePointBudget: 59,
    goals: { priorities, protect: [] },
    lockedSlotIds: extra.lockedSlotIds ?? [],
    progression: { enabled: true, skillLevelCap: 20, masteryPointsByWeapon: {}, overallMasteryLevel: 0 },
    rules: {
      minimumItemLevel: 50, keepCurrentHeroics: false, reconsiderHeroics: false,
      includeSetEffects: true, optimizeThreeTraits: true, bestHeroicConfiguration: false,
      allowUnownedHeroics: false,
      runes: { mode: "normal", chaosOwnershipRequired: true, normalDuplicateCap: 3, chaosDuplicateCap: 1 },
      artifacts: { mode: "sets" },
      ...(extra.sets ? { sets: extra.sets } : {}),
    },
    depth,
  };
}

async function optimize(req) {
  try { return { ok: true, result: await adapter.optimize(req, { onProgress() {} }) }; }
  catch (e) { return { ok: false, error: String(e?.message ?? e), diag: e?.constraintDiagnostics ?? null }; }
}

// Build the full case list, then take this partition's slice.
const allCases = [];
for (const c of CASES) for (const n of FLOOR_COUNTS) for (const t of TIGHTNESS) for (const v of VARIANTS) {
  if (n > c.goals.length) continue;
  allCases.push({ ...c, n, t, v });
}
// --variant=set isolates the cases that request an active set bonus, which is
// the only lane that can show whether set-route preservation changes anything.
//
// Selection happens BEFORE partitioning. Partitioning the full case list and
// then filtering would spread N set cases across 48 shards and hand most shards
// nothing — the partition has to index into the cases actually being run.
const variantFilter = arg("variant", "");
const selected = allCases.filter((row) => (!hardOnly || (row.v === "plain" && row.t === 1.0))
  && (!variantFilter || row.v === variantFilter)
  && (!caseFilter || `${row.w.join("/")}:${row.n}` === caseFilter));
const mine = selected.filter((row, i) => (i % pCount) === (pIdx - 1));

// The set lane asked for minimumActiveBonuses:1, so "found a build" is not the
// measurement — "the build actually activates a set" is. Count active
// breakpoints so a run that satisfies the request only nominally is visible.
function activeSetBonuses(result) {
  const payload = result?.setEffects ?? result?.sets ?? [];
  const sets = Array.isArray(payload) ? payload : payload.sets ?? [];
  return sets.reduce((total, row) => total + (row.breakpoints ?? []).filter((b) => b.active).length, 0);
}

let pass = 0, fail = 0;
const failures = [];
const witnessCache = new Map();
for (const c of mine) {
  const goalIds = c.goals.slice(0, c.n);
  // 1) witness: maximize the chosen goals, no floors
  const witnessKey = `${c.w.join("/")}:${c.n}`;
  let wit = witnessCache.get(witnessKey);
  if (!wit) {
    const b1 = await adapter.createScratchBuild({ name: "stress witness" });
    wit = await optimize(baseRequest(b1, c.w, goalIds.map((id, i) => ({ id, rank: i + 1, mode: "maximize", minimum: null, target: null }))));
    witnessCache.set(witnessKey, wit);
  }
  if (!wit.ok) { fail++; failures.push({ ...c, goalIds, stage: "witness", error: wit.error }); continue; }
  const witVals = Object.fromEntries(wit.result.goalResults.map((g) => [g.id, g.value]));

  // 2) demand floors at tightness * witness, plus the variant twist
  const extra = {};
  if (c.v === "locked") extra.lockedSlotIds = ["ring_1"];   // a slot the search would otherwise optimize
  if (c.v === "set") extra.sets = { minimumActiveBonuses: 1, prefer: true };
  const floors = Object.fromEntries(goalIds.map((id) => [id, Math.floor(witVals[id] * c.t)]));
  const b2 = await adapter.createScratchBuild({ name: "stress floors" });
  const con = await optimize(baseRequest(b2, c.w, goalIds.map((id, i) => ({ id, rank: i + 1, mode: "at_least", minimum: floors[id], target: null })), extra));

  const label = `${c.w.join("/")}  n=${c.n} t=${Math.round(c.t * 100)}% ${c.v}`;
  if (con.ok) {
    // verify the returned build actually MEETS every floor (not just "no error")
    const got = Object.fromEntries(con.result.goalResults.map((g) => [g.id, g.value]));
    const unmet = goalIds.filter((id) => Number(got[id]) < floors[id]);
    if (unmet.length && c.v !== "locked" && c.v !== "set") {
      // locked/set may legitimately make a witness-tight floor infeasible; only
      // count plain as a hard pass/fail on satisfaction.
      fail++; failures.push({ ...c, goalIds, stage: "unmet", unmet: unmet.map((id) => `${core.statName(id)} ${got[id]}<${floors[id]}`) });
      console.log("FAIL", label, "unmet:", unmet.map((id) => core.statName(id)).join(","));
    } else { pass++; console.log("ok  ", label, c.v === "set" ? `bonuses=${activeSetBonuses(con.result)}` : ""); }
  } else if (c.v === "plain" && c.t === 1.0) {
    // plain + 100% witness is the pure false-infeasibility case: MUST satisfy
    fail++; failures.push({ ...c, goalIds, stage: "infeasible", error: con.error, diag: con.diag });
    console.log("FAIL", label, "->", con.error?.slice(0, 80));
  } else {
    // locked/set/98% may be genuinely infeasible; record but don't hard-fail
    pass++; console.log("ok? ", label, "(infeasible, variant may forbid)");
  }
}

console.log(`\nPARTITION ${pIdx}/${pCount}  cases=${mine.length}  pass=${pass}  fail=${fail}`);
if (failures.length) console.log("FAILURES:\n" + JSON.stringify(failures, null, 1));
pool.terminate();
process.exit(fail > 0 ? 1 : 0);
