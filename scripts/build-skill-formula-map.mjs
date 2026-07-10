#!/usr/bin/env node

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  buildSkillMapping, parseCsv,
} from "./lib/skill-formula-map.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = process.env.TL_STEAM_BUILD ?? "24118850";
const DATA_ROOT = process.env.TL_DATA_ROOT ?? "D:\\TL_Data";
const EXTRACT_ROOT = process.env.TL_EXTRACT_ROOT ?? path.join(DATA_ROOT, "raw", BUILD, "extracted");
const formulaFile = path.join(DATA_ROOT, "decoded", BUILD, "tables", "TLFormulaParameterNew.json");
const skillSetFile = path.join(REPO_ROOT, "out", "questlog-public", "skillBuilder.getSkillSets.json");
const localizationFile = path.join(EXTRACT_ROOT, "localization", "csv", "en.csv");
const outputFile = path.join(DATA_ROOT, "reports", BUILD, "skill-formula-map.json");

function values(value) { return Array.isArray(value) ? value : Object.values(value ?? {}); }
function sha256(file) { return createHash("sha256").update(readFileSync(file)).digest("hex"); }
function loadSkillSets(file) {
  const batch = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  return values(batch).flatMap((entry) => values(entry?.result?.data?.json ?? entry?.result?.data ?? entry));
}
function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, file);
}

const formulaTable = JSON.parse(readFileSync(formulaFile, "utf8"));
if (String(formulaTable.gameBuild) !== BUILD) {
  throw new Error(`Formula table build ${formulaTable.gameBuild} does not match requested build ${BUILD}`);
}
const skills = loadSkillSets(skillSetFile);
if (skills.length !== 210) throw new Error(`Expected 210 player skill sets, found ${skills.length}`);
const localizationRows = parseCsv(readFileSync(localizationFile, "utf8")).slice(1).map((row) => ({
  namespace: row[0], key: row[1], text: row[3] ?? "",
}));
const mappings = buildSkillMapping({ skills, localizationRows, formulaRows: formulaTable.rows });
const count = (classification) => mappings.filter((entry) => entry.classification === classification).length;
const uniqueMappedRows = new Set(mappings.flatMap((entry) => entry.formulaRows.map((row) => row.formulaRowId)));
const unresolvedBases = [...new Set(mappings.flatMap((entry) => entry.unresolvedPlaceholders))].sort();
const report = {
  schema: "tl-helper.skill-formula-map",
  schemaVersion: 1,
  gameBuild: BUILD,
  generatedAtUtc: new Date().toISOString(),
  provenance: {
    skillSets: {
      path: path.relative(REPO_ROOT, skillSetFile).replace(/\\/g, "/"),
      sha256: sha256(skillSetFile),
    },
    formulaTable: {
      table: formulaTable.table,
      sourcePath: formulaTable.sourcePath,
      sha256: formulaTable.sha256,
      decoderVersion: formulaTable.decoderVersion,
    },
    localization: { path: localizationFile, sha256: sha256(localizationFile), locale: "en" },
  },
  method: {
    exact: "Formula row is named by a placeholder in a localization entry whose key contains the full player skill ID.",
    derived: "Formula row shares the verified weapon-kit and skill-name prefix, but is not directly named by an inspected placeholder.",
    unresolved: "No formula row was named by a skill-linked placeholder and no verified-prefix row exists. No NPC or fuzzy alias is guessed.",
  },
  summary: {
    skillSets: mappings.length,
    exactSkillSets: count("exact"),
    derivedSkillSets: count("derived"),
    unresolvedSkillSets: count("unresolved"),
    mappedFormulaRowsUnique: uniqueMappedRows.size,
    mappingEdges: mappings.reduce((total, entry) => total + entry.formulaRows.length, 0),
    unresolvedPlaceholderBases: unresolvedBases.length,
  },
  unresolvedPlaceholderBases: unresolvedBases,
  unresolvedSkillSets: mappings.filter((entry) => entry.classification === "unresolved")
    .map(({ skillSetId, skillId, name, category, skillType, derivedPrefix, unresolvedPlaceholders }) => ({
      skillSetId, skillId, name, category, skillType, derivedPrefix, unresolvedPlaceholders,
    })),
  skills: mappings,
};

atomicJson(outputFile, report);
console.log(JSON.stringify({ outputFile, ...report.summary }, null, 2));
