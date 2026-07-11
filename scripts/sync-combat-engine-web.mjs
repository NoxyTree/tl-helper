#!/usr/bin/env node

import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const COMBAT_ENGINE_WEB_MODULES = [
  "ability-definition.mjs",
  "ability-data.mjs",
  "ability-magnitude.mjs",
  "ability-range-projection.mjs",
  "healing-resolver.mjs",
  "fixed-point.mjs",
  "trace.mjs",
];

export function syncCombatEngineWeb({ repoRoot = REPO_ROOT } = {}) {
  const sourceRoot = path.join(repoRoot, "packages", "combat-engine", "src");
  const outputRoot = path.join(repoRoot, "web", "vendor", "combat-engine");
  mkdirSync(outputRoot, { recursive: true });
  for (const file of COMBAT_ENGINE_WEB_MODULES) {
    copyFileSync(path.join(sourceRoot, file), path.join(outputRoot, file));
  }
  return { outputRoot, files: [...COMBAT_ENGINE_WEB_MODULES] };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = syncCombatEngineWeb();
  console.log(JSON.stringify(result, null, 2));
}
