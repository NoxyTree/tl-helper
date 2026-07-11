#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importCombatLog } from "./lib/combat-log-importer.mjs";

const DEFAULT_BUILD = process.env.TL_STEAM_BUILD ?? "24118850";
const DEFAULT_DATA_ROOT = process.env.TL_DATA_ROOT ?? "D:\\TL_Data";

function fail(message) { throw new Error(`Combat log folder import: ${message}`); }

function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, file);
}

function text(value, label) {
  const result = String(value ?? "").trim();
  if (!result) fail(`${label} is required`);
  return result;
}

export function importCombatLogFolder({ inputDirectory, outputDirectory, gameBuild }) {
  const build = text(gameBuild, "gameBuild");
  const input = path.resolve(text(inputDirectory, "inputDirectory"));
  const output = path.resolve(text(outputDirectory, "outputDirectory"));
  if (!existsSync(input)) fail(`input directory is missing: ${input}`);
  const candidates = readdirSync(input, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".txt"))
    .map((entry) => entry.name).sort();
  const sessions = [];
  const errors = [];
  for (const name of candidates) {
    const sourcePath = path.join(input, name);
    try {
      const imported = importCombatLog({ source: readFileSync(sourcePath, "utf8"), gameBuild: build, sourcePath });
      const outputFile = path.join(output, `${path.basename(name, path.extname(name))}.json`);
      atomicJson(outputFile, imported);
      sessions.push({
        file: name, outputFile, sha256: imported.source.sha256, records: imported.summary.recordCount,
        totalDamage: imported.summary.totalDamage, knownMappings: imported.records.filter((record) => record.abilityMapping).length,
      });
    } catch (error) { errors.push({ file: name, error: error.message }); }
  }
  const overview = {
    schema: "tl-helper.combat-log-folder-import", schemaVersion: 1, gameBuild: build,
    inputDirectory: input, outputDirectory: output, sessions, errors,
    totals: {
      files: candidates.length, imported: sessions.length, failed: errors.length,
      records: sessions.reduce((total, session) => total + session.records, 0),
      damage: sessions.reduce((total, session) => total + BigInt(session.totalDamage), 0n).toString(),
      knownMappings: sessions.reduce((total, session) => total + session.knownMappings, 0),
    },
  };
  const overviewFile = path.join(output, "index.json");
  atomicJson(overviewFile, overview);
  return { overview, overviewFile };
}

function parseArguments(argv) {
  const defaults = { build: DEFAULT_BUILD, dataRoot: DEFAULT_DATA_ROOT, inputDirectory: null, outputDirectory: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const key = { "--build": "build", "--data-root": "dataRoot", "--input-dir": "inputDirectory", "--output-dir": "outputDirectory" }[argument];
    if (!key) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    defaults[key] = value;
  }
  return defaults;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const inputDirectory = options.inputDirectory ?? path.join(path.resolve(options.dataRoot), "calibration", String(options.build), "combat-logs");
  const outputDirectory = options.outputDirectory ?? path.join(path.resolve(options.dataRoot), "reports", String(options.build), "combat-logs");
  const result = importCombatLogFolder({ inputDirectory, outputDirectory, gameBuild: options.build });
  console.log(JSON.stringify({ overviewFile: result.overviewFile, ...result.overview.totals }, null, 2));
  if (result.overview.errors.length) process.exitCode = 1;
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error.stack ?? error.message); process.exitCode = 1; }
}
