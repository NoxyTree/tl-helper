#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recordCombatObservation } from "./lib/combat-calibration-store.mjs";

const DEFAULT_BUILD = process.env.TL_STEAM_BUILD ?? "24118850";
const DEFAULT_DATA_ROOT = process.env.TL_DATA_ROOT ?? "D:\\TL_Data";

function parseArguments(argv) {
  const options = { build: DEFAULT_BUILD, dataRoot: DEFAULT_DATA_ROOT, input: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--build" || argument === "--data-root" || argument === "--input") {
      if (value === undefined || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      if (argument === "--build") options.build = value;
      if (argument === "--data-root") options.dataRoot = value;
      if (argument === "--input") options.input = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function readInput(input) {
  const source = input ? readFileSync(path.resolve(input), "utf8") : readFileSync(0, "utf8");
  if (!source.trim()) throw new Error(input ? `Input file is empty: ${input}` : "stdin is empty");
  return JSON.parse(source.replace(/^\uFEFF/, ""));
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const result = recordCombatObservation({
    observation: readInput(options.input),
    dataRoot: options.dataRoot,
    build: options.build,
  });
  console.log(JSON.stringify({
    created: result.created,
    contentId: result.observation.contentId,
    gameBuild: result.observation.gameBuild,
    experimentId: result.observation.experimentId,
    attemptNumber: result.observation.attemptNumber,
    observationFile: result.observationFile,
    indexFile: result.indexFile,
    observationCount: result.index.observationCount,
    experimentCount: result.index.experimentCount,
  }, null, 2));
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { main(); }
  catch (error) { console.error(error.stack ?? error.message); process.exitCode = 1; }
}
