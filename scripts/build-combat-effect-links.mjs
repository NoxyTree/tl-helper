#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCombatEffectLinks } from "./lib/combat-effect-links.mjs";

const DEFAULT_BUILD = process.env.TL_STEAM_BUILD ?? "24118850";
const DEFAULT_DATA_ROOT = process.env.TL_DATA_ROOT ?? "D:\\TL_Data";

function readJson(file, label) {
  if (!existsSync(file)) throw new Error(`${label} is missing: ${file}`);
  return JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, file);
}

export function buildCombatEffectLinkFiles({ build = DEFAULT_BUILD, dataRoot = DEFAULT_DATA_ROOT, outputFile } = {}) {
  const root = path.resolve(dataRoot);
  const requestedBuild = String(build);
  const result = buildCombatEffectLinks({
    gameBuild: requestedBuild,
    effectTable: readJson(path.join(root, "decoded", requestedBuild, "tables", "TLEffectProperty.json"), "Decoded TLEffectProperty"),
    abilityArtifact: readJson(path.join(root, "reports", requestedBuild, "combat-abilities.json"), "Combat ability artifact"),
  });
  const output = outputFile ? path.resolve(outputFile) : path.join(root, "reports", requestedBuild, "combat-effect-links.json");
  atomicJson(output, result);
  return { outputFile: output, result };
}

export function main() {
  const { outputFile, result } = buildCombatEffectLinkFiles();
  const components = result.abilities.flatMap((ability) => ability.components);
  console.log(JSON.stringify({ outputFile, gameBuild: result.gameBuild, abilities: result.abilities.length, components: components.length, linkedEffects: components.reduce((total, component) => total + component.linkedEffects.length, 0) }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error.stack ?? error.message); process.exitCode = 1; }
}
