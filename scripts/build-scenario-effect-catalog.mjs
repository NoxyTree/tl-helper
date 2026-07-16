#!/usr/bin/env node

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildScenarioEffectCatalog, serializeScenarioEffectCatalog } from "./lib/scenario-effect-catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT = path.join(root, "web", "data", "scenario-effects.json");

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function projection(name) {
  return readJson(path.join(root, "web", "data", "projections", `${name}.json`));
}

function atomicWrite(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, content, "utf8");
  renameSync(temporary, file);
}

export function buildScenarioEffectCatalogFile({ outputFile = DEFAULT_OUTPUT } = {}) {
  const catalog = buildScenarioEffectCatalog({
    skillsProjection: projection("skills"),
    progressionProjection: projection("progression"),
    equipmentProjection: projection("equipment"),
  });
  const resolvedOutput = path.resolve(outputFile);
  atomicWrite(resolvedOutput, serializeScenarioEffectCatalog(catalog));
  return { outputFile: resolvedOutput, catalog };
}

export function main() {
  const { outputFile, catalog } = buildScenarioEffectCatalogFile();
  console.log(JSON.stringify({ outputFile, gameBuild: catalog.gameBuild, ...catalog.counts }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error.stack ?? error.message); process.exitCode = 1; }
}
