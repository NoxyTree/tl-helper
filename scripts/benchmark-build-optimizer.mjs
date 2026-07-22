import { readFile } from "node:fs/promises";

import * as core from "../web/tl-core.js";
import { createOptimizerAdapter } from "../web/tl-full-build-adapter.js";

async function loadData() {
  const manifest = JSON.parse(await readFile(new URL("../web/data/app-data.json", import.meta.url), "utf8"));
  const data = {
    schema: "tl-helper.web-data",
    schemaVersion: manifest.dataSchemaVersion,
    gameBuild: manifest.gameBuild,
    generatedAtUtc: manifest.generatedAtUtc,
  };
  for (const descriptor of manifest.projections) {
    const projection = JSON.parse(await readFile(new URL(`../web/data/${descriptor.file}`, import.meta.url), "utf8"));
    Object.assign(data, projection.data);
  }
  return data;
}

await core.initCore(await loadData());
const adapter = await createOptimizerAdapter({ core, storage: {} });
const rules = {
    minimumItemLevel: 50,
    reconsiderHeroics: true,
    includeSetEffects: true,
    optimizeThreeTraits: true,
    bestHeroicConfiguration: true,
    runes: { mode: "normal" },
    artifacts: { mode: "sets" },
};

const scenarios = [
  {
    benchmark: "staff-dagger-hit-health",
    weaponTypes: ["staff", "dagger"],
    goalIds: ["all_accuracy", "hp_max"],
  },
  {
    benchmark: "sns-gs-six-pvp-preferences",
    weaponTypes: ["sword", "sword2h"],
    goalIds: [
      "pvp_all_critical_defense",
      "pvp_melee_accuracy",
      "collide_amplification",
      "skill_cooldown_modifier",
      "buff_given_duration_modifier",
      "pvp_melee_double_defense",
    ],
  },
];

const benchmarks = [];
for (const scenario of scenarios) {
  const build = await adapter.createScratchBuild();
  const request = {
    build,
    sourceKind: "scratch",
    weaponTypes: scenario.weaponTypes,
    attributePointBudget: 59,
    goals: { priorities: scenario.goalIds.map((id, index) => ({ id, rank: index + 1, mode: "maximize" })) },
    rules,
  };
  const results = [];
  for (const depth of ["preview", "refine"]) {
    const startedAt = performance.now();
    const result = await adapter.optimize({ ...request, depth });
    results.push({
      depth,
      wallMs: Math.round(performance.now() - startedAt),
      score: result.score,
      goals: result.goalResults.map(({ id, name, value, formattedValue }) => ({ id, name, value, formattedValue })),
      metrics: result.searchMetrics,
    });
  }
  benchmarks.push({ benchmark: scenario.benchmark, weaponTypes: scenario.weaponTypes, preferenceCount: scenario.goalIds.length, results });
}

console.log(JSON.stringify({ benchmarks }, null, 2));

if (process.argv.includes("--assert")) {
  for (const benchmark of benchmarks) {
    const [preview, refine] = benchmark.results;
    if (preview.wallMs > 10_000) throw new Error(`${benchmark.benchmark} preview exceeded the 10 second gate: ${preview.wallMs} ms`);
    if (refine.wallMs > 25_000) throw new Error(`${benchmark.benchmark} refinement exceeded the 25 second gate: ${refine.wallMs} ms`);
    if (refine.score + 1e-12 < preview.score) throw new Error(`${benchmark.benchmark} refinement returned a weaker result than the preview.`);
  }
}
