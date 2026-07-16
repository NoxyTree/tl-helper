#!/usr/bin/env node

// Generates a checked-in receipt only from a successful orchestrator run that
// rebuilt and semantically validated both the warehouse and table inventory.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  atomicJson,
  buildDataBuildReceipt,
  inventorySemanticIdentity,
  receiptPath,
  validateInventoryIdentity,
  validateDecodedBaseline,
  validateWarehouseIdentity,
  warehouseSemanticIdentity,
} from "./lib/data-build-receipt.mjs";
import {
  collectDataBuildInputs, collectDataGeneratorIdentity, dataReceiptAllowedDirtyPaths,
} from "./update-tl-helper.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseReceiptArgs(args) {
  let runReport = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--run-report" && args[i + 1]) { runReport = path.resolve(args[++i]); continue; }
    if (["--help", "-h", "/?"].includes(args[i])) return { help: true, runReport: null };
    throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  if (!runReport) throw new Error("--run-report <successful-update-run.json> is required");
  return { help: false, runReport };
}

export function generateReceiptFromRun(runReportFile) {
  if (!existsSync(runReportFile)) throw new Error(`Run report not found: ${runReportFile}`);
  const report = JSON.parse(readFileSync(runReportFile, "utf8"));
  if (typeof report.questlogRoot !== "string" || !report.questlogRoot) {
    throw new Error("Run report has no explicit Questlog root");
  }
  const context = {
    build: String(report.gameBuild ?? ""),
    dataRoot: path.resolve(report.dataRoot ?? ""),
    extractRoot: path.resolve(report.extractRoot ?? ""),
    questlogRoot: path.resolve(report.questlogRoot),
    decodedBaselinePath: path.resolve(
      report.decodedBaselinePath
        ?? path.join(REPO_ROOT, "data-build-baselines", `${report.gameBuild}.json`),
    ),
  };
  if (!/^\d+$/.test(context.build)) throw new Error("Run report has no valid game build");
  report.reportPath = path.resolve(runReportFile);
  const inputs = collectDataBuildInputs(context);
  const warehouse = warehouseSemanticIdentity(path.join(context.dataRoot, "warehouse", `tl-${context.build}.sqlite`));
  const inventory = {
    ...inventorySemanticIdentity(path.join(context.dataRoot, "reports", context.build, "table-inventory.json")),
    repositoryCopy: inventorySemanticIdentity(path.join(REPO_ROOT, "out", "coverage-audit", "table-inventory.json")),
  };
  const warehouseErrors = validateWarehouseIdentity(warehouse, {
    build: context.build,
    decoded: inputs.decodedTables,
    localizationSha256: inputs.localization.sha256,
    texturePathSetSha256: inputs.texturePaths.pathSetSha256,
    questlogEquipmentSha256: inputs.questlogEquipment.sha256,
    questlogSkillsSha256: inputs.questlogSkills.sha256,
    decodedBaselineSha256: inputs.decodedBaseline.sha256,
  });
  const inventoryErrors = validateInventoryIdentity(inventory, { build: context.build, decoded: inputs.decodedTables });
  inventoryErrors.push(...validateDecodedBaseline(context.decodedBaselinePath, inputs.decodedTables, context.build));
  if (!inventory.repositoryCopy.exists) inventoryErrors.push("Repository inventory copy does not exist");
  else if (inventory.repositoryCopy.sha256 !== inventory.sha256) inventoryErrors.push("Repository inventory copy differs from canonical inventory");
  if (warehouseErrors.length || inventoryErrors.length) {
    throw new Error(`Current outputs failed semantic validation: ${[...warehouseErrors, ...inventoryErrors].join("; ")}`);
  }
  const receipt = buildDataBuildReceipt({
    repoRoot: REPO_ROOT,
    context,
    report,
    inputs,
    outputs: { warehouse, inventory },
    currentGenerator: collectDataGeneratorIdentity(),
    allowedGeneratorDirtyPaths: dataReceiptAllowedDirtyPaths(report.selectedStages),
  });
  const file = receiptPath(REPO_ROOT, context.build);
  atomicJson(file, receipt);
  return { file, receipt };
}

function main(args) {
  let options;
  try { options = parseReceiptArgs(args); }
  catch (error) { console.error(error.message); return 2; }
  if (options.help) {
    console.log("Usage: node scripts/generate-data-build-receipt.mjs --run-report <successful-update-run.json>");
    return 0;
  }
  try {
    const { file } = generateReceiptFromRun(options.runReport);
    console.log(file);
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = main(process.argv.slice(2));
