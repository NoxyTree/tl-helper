#!/usr/bin/env node

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importCombatLog } from "./lib/combat-log-importer.mjs";

const DEFAULT_BUILD = process.env.TL_STEAM_BUILD ?? "24118850";
const DEFAULT_DATA_ROOT = process.env.TL_DATA_ROOT ?? "D:\\TL_Data";

function parseArguments(argv) {
  const options = { build: DEFAULT_BUILD, dataRoot: DEFAULT_DATA_ROOT, input: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!Object.hasOwn({ "--build": true, "--data-root": true, "--input": true, "--output": true }, argument)) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    options[{ "--build": "build", "--data-root": "dataRoot", "--input": "input", "--output": "output" }[argument]] = value;
    index += 1;
  }
  if (!options.input) throw new Error("--input is required");
  return options;
}

function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, file);
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const input = path.resolve(options.input);
  const source = readFileSync(input, "utf8");
  const imported = importCombatLog({ source, gameBuild: options.build, sourcePath: input });
  const output = options.output ? path.resolve(options.output) : path.join(path.resolve(options.dataRoot), "reports", String(options.build), "combat-logs", `${path.basename(input, path.extname(input))}.json`);
  atomicJson(output, imported);
  console.log(JSON.stringify({ outputFile: output, gameBuild: imported.gameBuild, formatVersion: imported.source.formatVersion, records: imported.summary.recordCount, totalDamage: imported.summary.totalDamage }, null, 2));
  return { imported, output };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error.stack ?? error.message); process.exitCode = 1; }
}
