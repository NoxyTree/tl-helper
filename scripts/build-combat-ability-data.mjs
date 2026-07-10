#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCombatAbilityData } from "./lib/combat-ability-data.mjs";
import { normalizeAbilityDefinition } from "../packages/combat-engine/src/ability-definition.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

export function defaultPaths({ build = DEFAULT_BUILD, dataRoot = DEFAULT_DATA_ROOT } = {}) {
  const resolvedDataRoot = path.resolve(dataRoot);
  return {
    build: String(build),
    dataRoot: resolvedDataRoot,
    skillsFile: path.join(REPO_ROOT, "web", "data", "projections", "skills.json"),
    skillFormulaMapFile: path.join(resolvedDataRoot, "reports", String(build), "skill-formula-map.json"),
    formulaTableFile: path.join(resolvedDataRoot, "decoded", String(build), "tables", "TLFormulaParameterNew.json"),
    reviewFile: path.join(REPO_ROOT, "scripts", "combat-abilities", "reviewed-abilities.json"),
    outputFile: path.join(resolvedDataRoot, "reports", String(build), "combat-abilities.json"),
  };
}

export function buildCombatAbilityDataFiles(options = {}) {
  const files = { ...defaultPaths(options), ...options };
  const review = readJson(files.reviewFile, "Reviewed ability manifest");
  if (review.schema !== "tl-helper.reviewed-combat-abilities" || review.schemaVersion !== 1) {
    throw new Error("Unsupported reviewed ability manifest schema");
  }
  if (String(review.reviewedGameBuild) !== String(files.build)) {
    throw new Error(`Reviewed ability manifest build ${review.reviewedGameBuild} does not match requested build ${files.build}`);
  }

  const result = buildCombatAbilityData({
    skillsProjection: readJson(files.skillsFile, "Skills projection"),
    skillFormulaMap: readJson(files.skillFormulaMapFile, "Skill-formula map"),
    formulaTable: readJson(files.formulaTableFile, "Decoded formula table"),
    requestedBuild: String(files.build),
    reviewedAbilities: review.abilities,
  });

  // Normalize through the public contract before writing so downstream tools
  // receive exactly the same immutable shape the engine accepts.
  const normalized = {
    ...result,
    abilities: result.abilities.map((ability) => normalizeAbilityDefinition(ability)),
  };
  atomicJson(files.outputFile, normalized);
  return { outputFile: files.outputFile, result: normalized };
}

export function main() {
  const { outputFile, result } = buildCombatAbilityDataFiles();
  const formulaComponents = result.abilities.reduce((total, ability) => total + ability.formulaComponents.length, 0);
  console.log(JSON.stringify({
    outputFile,
    gameBuild: result.gameBuild,
    abilities: result.abilities.length,
    formulaComponents,
    unresolvedStages: result.abilities.reduce((total, ability) => total + ability.unresolvedStages.length, 0),
  }, null, 2));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { main(); }
  catch (error) { console.error(error.stack ?? error.message); process.exitCode = 1; }
}
