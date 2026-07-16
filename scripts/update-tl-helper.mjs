#!/usr/bin/env node

// Safe, single-command update runner for TL-Helper's existing data pipeline.
// This file orchestrates tools. It does not delete source data, upload, publish,
// or hide failed stages.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  atomicJson as atomicReceiptJson,
  buildDataBuildReceipt,
  decodedSemanticIdentity,
  fileSha256,
  inventorySemanticIdentity,
  pathSetIdentity,
  receiptPath,
  validateDecodedBaseline,
  validateInventoryIdentity,
  validateWarehouseIdentity,
  warehouseSemanticIdentity,
} from "./lib/data-build-receipt.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CONFIG = path.join(REPO_ROOT, "src", "TlCollector", "config.local.json");
const DATA_GENERATOR_FILES = [
  "scripts/update-tl-helper.mjs",
  "scripts/build-warehouse.mjs",
  "scripts/build-table-inventory.mjs",
  "scripts/generate-data-build-receipt.mjs",
  "scripts/build-stat-sources.mjs",
  "scripts/lib/asset-case-index.mjs",
  "scripts/lib/data-build-receipt.mjs",
  "scripts/lib/json-schema-validator.mjs",
  "scripts/lib/stat-sources.mjs",
  "scripts/lib/stat-sources-progression.mjs",
  "scripts/lib/stat-sources-runes.mjs",
  "scripts/lib/stat-taxonomy.mjs",
  "schemas/data-build-receipt.schema.json",
  "schemas/decoded-data-baseline.schema.json",
  "web/tl-questlog-rules.js",
];

export const STAGE_ORDER = [
  "collector", "decode", "warehouse", "inventory", "skill-formula-map", "web-data", "combat-abilities", "combat-effect-links", "stat-sources", "coverage",
  "evidence", "combat-power-analysis", "snapshot-verify", "reference-verify", "edge-verify", "js-tests",
  "collector-tests",
];

export const RECEIPT_MUTATING_STAGES = new Set(["collector", "decode", "warehouse", "inventory", "stat-sources"]);

const STAGE_ALIASES = new Map([
  ["collect", "collector"], ["test-js", "js-tests"], ["test-collector", "collector-tests"],
  ["web", "web-data"], ["verify-snapshot", "snapshot-verify"],
  ["power", "combat-power-analysis"],
  ["formulas", "skill-formula-map"],
  ["abilities", "combat-abilities"],
  ["effects", "combat-effect-links"],
  ["stats", "stat-sources"],
  ["verify-reference", "reference-verify"], ["verify-edges", "edge-verify"],
]);

function needValue(args, index, name) {
  if (index + 1 >= args.length) throw new Error(`${name} requires a value`);
  return args[index + 1];
}

function splitStages(value) {
  return value.split(",").map((item) => STAGE_ALIASES.get(item.trim()) ?? item.trim()).filter(Boolean);
}

export function parseArgs(args) {
  const options = {
    dryRun: false, validate: false, help: false, only: null, skip: [],
    build: null, dataRoot: null, extractRoot: null, questlogRoot: null, config: DEFAULT_CONFIG,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--validate") options.validate = true;
    else if (["--help", "-h", "/?"].includes(arg)) options.help = true;
    else if (arg === "--only") { options.only = splitStages(needValue(args, i, arg)); i++; }
    else if (arg === "--skip") { options.skip.push(...splitStages(needValue(args, i, arg))); i++; }
    else if (arg === "--build") { options.build = needValue(args, i, arg); i++; }
    else if (arg === "--data-root") { options.dataRoot = needValue(args, i, arg); i++; }
    else if (arg === "--extract-root") { options.extractRoot = needValue(args, i, arg); i++; }
    else if (arg === "--questlog-root") { options.questlogRoot = needValue(args, i, arg); i++; }
    else if (arg === "--config") { options.config = needValue(args, i, arg); i++; }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  const named = [...(options.only ?? []), ...options.skip];
  const unknown = named.filter((name) => !STAGE_ORDER.includes(name));
  if (unknown.length) throw new Error(`Unknown stage: ${[...new Set(unknown)].join(", ")}`);
  if (options.only && options.only.length === 0) throw new Error("--only requires at least one stage");
  return options;
}

function readJson(file) {
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, "utf8"));
}

export function parseSteamBuild(text) {
  return text.match(/"buildid"\s+"(\d+)"/i)?.[1] ?? null;
}

export function resolveContext(options, environment = process.env) {
  const configPath = path.resolve(options.config);
  const config = readJson(configPath);
  let manifestBuild = null;
  if (config.steamAppManifestPath && existsSync(config.steamAppManifestPath)) {
    manifestBuild = parseSteamBuild(readFileSync(config.steamAppManifestPath, "utf8"));
  }
  const build = String(options.build ?? environment.TL_STEAM_BUILD ?? manifestBuild ?? config.steamBuild ?? "").trim();
  if (!/^\d+$/.test(build)) throw new Error("No valid Steam build was found. Use --build or configure steamAppManifestPath.");

  const dataRootValue = options.dataRoot ?? environment.TL_DATA_ROOT ?? config.dataRoot;
  if (!dataRootValue) throw new Error("No data root was found. Use --data-root or set TL_DATA_ROOT.");
  const dataRoot = path.resolve(dataRootValue);
  const relativeToRepo = path.relative(REPO_ROOT, dataRoot);
  if (relativeToRepo === "" || (!relativeToRepo.startsWith("..") && !path.isAbsolute(relativeToRepo))) {
    throw new Error(`Data root must be outside the Git repository: ${dataRoot}`);
  }
  const extractRoot = path.resolve(options.extractRoot ?? environment.TL_EXTRACT_ROOT ?? path.join(dataRoot, "raw", build, "extracted"));
  const questlogRoot = path.resolve(
    options.questlogRoot
      ?? environment.TL_QUESTLOG_ROOT
      ?? path.join(REPO_ROOT, "out", "questlog-public"),
  );
  const decodedBaselinePath = path.join(REPO_ROOT, "data-build-baselines", `${build}.json`);
  const cachedDotnet = path.join(dataRoot, "cache", "tools", "dotnet-sdk", "dotnet.exe");
  const dotnet = environment.TL_DOTNET
    ? path.resolve(environment.TL_DOTNET)
    : existsSync(cachedDotnet) ? cachedDotnet : "dotnet";
  return { build, dataRoot, extractRoot, questlogRoot, decodedBaselinePath, configPath, config, manifestBuild, dotnet };
}

function csvDataRowCount(file) {
  return readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line.trim()).length - 1;
}

function command(executable, args) { return { executable, args }; }

export function stageDefinitions(context) {
  const node = process.execPath;
  const script = (name) => path.join(REPO_ROOT, "scripts", name);
  const jsTestDir = path.join(REPO_ROOT, "scripts", "tests");
  const jsTests = existsSync(jsTestDir)
    ? readdirSync(jsTestDir).filter((name) => name.endsWith(".test.mjs")).sort().map((name) => path.join(jsTestDir, name))
    : [];
  return {
    collector: {
      command: command(context.dotnet, ["run", "--project", path.join(REPO_ROOT, "src", "TlCollector", "App"), "-c", "Release", "--", "sample", "--config", context.configPath, "--output", context.dataRoot]),
      required: [context.configPath],
      output: path.join(context.dataRoot, "manifests", context.build, "manifest.json"),
    },
    decode: {
      command: command(node, [script("decode-tljson-table.mjs"), "--all-priority"]),
      required: [path.join(context.extractRoot, "data", "TL", "Content", "Game", "Client", "Table")],
      output: path.join(context.dataRoot, "decoded", context.build, "tables"),
      validateResult: (result) => {
        const match = result.stdout?.match(/decoded\s+(\d+)\/(\d+)\s+tables.+\((\d+)\s+errors\)/);
        return match && match[1] === match[2] && match[3] === "0"
          ? null : "Decoder did not report every selected table as successfully decoded";
      },
    },
    warehouse: {
      command: command(node, [
        script("build-warehouse.mjs"),
        "--questlog-root", context.questlogRoot,
        "--decoded-baseline", context.decodedBaselinePath,
      ]),
      required: [
        path.join(context.dataRoot, "decoded", context.build, "tables"),
        path.join(context.extractRoot, "localization", "csv", "en.csv"),
        path.join(context.extractRoot, "textures", "TL", "Content"),
        path.join(context.questlogRoot, "characterBuilder.getEquipmentItems.json"),
        path.join(context.questlogRoot, "skillBuilder.getSkillSets.json"),
        context.decodedBaselinePath,
      ],
      output: path.join(context.dataRoot, "warehouse", `tl-${context.build}.sqlite`),
      inspectBeforeOutput: shallowFileIdentity,
      inspectOutput: warehouseSemanticIdentity,
      validateOutput: (identity) => validateWarehouseIdentity(identity, {
        build: context.build,
        decoded: decodedSemanticIdentity(path.join(context.dataRoot, "decoded", context.build, "tables")),
        localizationSha256: fileSha256(path.join(context.extractRoot, "localization", "csv", "en.csv")),
        texturePathSetSha256: pathSetIdentity(path.join(context.extractRoot, "textures", "TL", "Content"), ".png").pathSetSha256,
        questlogEquipmentSha256: fileSha256(path.join(context.questlogRoot, "characterBuilder.getEquipmentItems.json")),
        questlogSkillsSha256: fileSha256(path.join(context.questlogRoot, "skillBuilder.getSkillSets.json")),
        decodedBaselineSha256: fileSha256(context.decodedBaselinePath),
      }),
    },
    inventory: {
      command: command(node, [script("build-table-inventory.mjs")]),
      required: [
        path.join(context.extractRoot, "indexes", "game_tables.csv"),
        path.join(context.dataRoot, "decoded", context.build, "tables"),
        context.decodedBaselinePath,
      ],
      output: path.join(context.dataRoot, "reports", context.build, "table-inventory.json"),
      repoOutput: path.join(REPO_ROOT, "out", "coverage-audit", "table-inventory.json"),
      inspectOutput: (file) => ({
        ...inventorySemanticIdentity(file),
        repositoryCopy: inventorySemanticIdentity(path.join(REPO_ROOT, "out", "coverage-audit", "table-inventory.json")),
      }),
      validateOutput: (identity) => {
        const errors = validateInventoryIdentity(identity, {
          build: context.build,
          decoded: decodedSemanticIdentity(path.join(context.dataRoot, "decoded", context.build, "tables")),
          indexedTableCount: csvDataRowCount(path.join(context.extractRoot, "indexes", "game_tables.csv")),
        });
        if (!identity.repositoryCopy?.exists) errors.push("Repository inventory copy does not exist");
        else if (identity.repositoryCopy.sha256 !== identity.sha256) errors.push("Repository inventory copy differs from canonical inventory");
        return errors;
      },
    },
    "skill-formula-map": {
      command: command(node, [script("build-skill-formula-map.mjs")]),
      required: [
        path.join(context.dataRoot, "decoded", context.build, "tables", "TLFormulaParameterNew.json"),
        path.join(context.extractRoot, "localization", "csv", "en.csv"),
        path.join(context.questlogRoot, "skillBuilder.getSkillSets.json"),
      ],
      output: path.join(context.dataRoot, "reports", context.build, "skill-formula-map.json"),
      validateResult: (result) => {
        const match = result.stdout?.match(/"skillSets":\s*(\d+)/);
        return match?.[1] === "210" ? null : "Skill-formula mapper did not report all 210 player skill sets";
      },
    },
    "stat-sources": {
      command: command(node, [script("build-stat-sources.mjs")]),
      required: [
        path.join(context.dataRoot, "warehouse", `tl-${context.build}.sqlite`),
        path.join(REPO_ROOT, "web", "data", "projections", "equipment.json"),
        path.join(REPO_ROOT, "web", "data", "projections", "progression.json"),
        path.join(REPO_ROOT, "web", "data", "projections", "runes.json"),
      ],
      output: path.join(context.dataRoot, "reports", context.build, "stat-sources", "heavy-attack.json"),
    },
    "combat-abilities": {
      command: command(node, [script("build-combat-ability-data.mjs")]),
      required: [
        path.join(REPO_ROOT, "web", "data", "projections", "skills.json"),
        path.join(context.dataRoot, "reports", context.build, "skill-formula-map.json"),
        path.join(context.dataRoot, "decoded", context.build, "tables", "TLFormulaParameterNew.json"),
        path.join(REPO_ROOT, "scripts", "combat-abilities", "reviewed-abilities.json"),
      ],
      output: path.join(context.dataRoot, "reports", context.build, "combat-abilities.json"),
      validateResult: (result) => {
        const abilities = result.stdout?.match(/"abilities":\s*(\d+)/)?.[1];
        const components = result.stdout?.match(/"formulaComponents":\s*(\d+)/)?.[1];
        return Number(abilities) >= 3 && Number(components) >= 5
          ? null : "Combat ability builder did not report at least 3 abilities and 5 reviewed components";
      },
    },
    "combat-effect-links": {
      command: command(node, [script("build-combat-effect-links.mjs")]),
      required: [
        path.join(context.dataRoot, "decoded", context.build, "tables", "TLEffectProperty.json"),
        path.join(context.dataRoot, "reports", context.build, "combat-abilities.json"),
      ],
      output: path.join(context.dataRoot, "reports", context.build, "combat-effect-links.json"),
      validateResult: (result) => {
        const abilities = result.stdout?.match(/"abilities":\s*(\d+)/)?.[1];
        const components = result.stdout?.match(/"components":\s*(\d+)/)?.[1];
        return Number(abilities) >= 3 && Number(components) >= 5
          ? null : "Combat effect linker did not report all reviewed abilities and components";
      },
    },
    coverage: {
      command: command(node, [script("audit-questlog-coverage.mjs")]),
      required: [context.extractRoot, path.join(REPO_ROOT, "web", "data", "app-data.json")],
      output: path.join(REPO_ROOT, "out", "coverage-audit", "summary.json"),
      validateResult: (result) => /VALIDATION FAILED:/i.test(result.stderr ?? "")
        ? "Coverage audit reported one or more failed validations" : null,
    },
    evidence: {
      command: command(node, [script("build-evidence-packets.mjs")]),
      required: [path.join(context.dataRoot, "warehouse", `tl-${context.build}.sqlite`)],
      output: path.join(context.dataRoot, "reports", context.build, "evidence"),
    },
    "combat-power-analysis": {
      command: command(node, [script("analyze-combat-power.mjs"), "--write"]),
      required: [
        path.join(context.dataRoot, "decoded", context.build, "tables", "TLItemCombatPower.json"),
        path.join(REPO_ROOT, "web", "data", "app-data.json"),
        path.join(REPO_ROOT, "web", "data", "reference-build.json"),
      ],
      output: path.join(context.dataRoot, "reports", context.build, "combat-power-parity.json"),
    },
    "snapshot-verify": {
      command: command(node, [script("verify-build-snapshot.mjs")]),
      required: [
        script("verify-build-snapshot.mjs"),
        path.join(REPO_ROOT, "web", "tl-build-snapshot.js"),
        path.join(REPO_ROOT, "web", "data", "app-data.json"),
      ],
      output: null,
    },
    "reference-verify": {
      command: command(node, [script("verify-reference-build.mjs")]),
      required: [
        script("verify-reference-build.mjs"),
        path.join(REPO_ROOT, "scripts", "reference-builds"),
        path.join(REPO_ROOT, "web", "data", "app-data.json"),
      ],
      output: null,
    },
    "edge-verify": {
      command: command(node, [script("verify-edge-cases.mjs")]),
      required: [
        script("verify-edge-cases.mjs"),
        path.join(REPO_ROOT, "web", "data", "app-data.json"),
      ],
      output: null,
    },
    "web-data": {
      command: command(node, [script("build-web-data.mjs")]),
      required: [context.questlogRoot],
      output: path.join(REPO_ROOT, "web", "data", "app-data.json"),
    },
    "js-tests": {
      command: command(node, ["--test", ...jsTests]),
      required: [jsTestDir, ...jsTests], output: null,
    },
    "collector-tests": {
      command: command(context.dotnet, ["test", path.join(REPO_ROOT, "src", "TlCollector", "TlCollector.slnx"), "-c", "Release", "--no-restore"]),
      required: [path.join(REPO_ROOT, "src", "TlCollector", "TlCollector.slnx")], output: null,
    },
  };
}

export function selectedStages(options) {
  const wanted = options.only ?? STAGE_ORDER;
  const skipped = new Set(options.skip);
  return STAGE_ORDER.filter((stage) => wanted.includes(stage) && !skipped.has(stage));
}

export function preflight(context, stages, definitions) {
  const checks = [
    { name: "data-root-outside-repo", ok: !path.resolve(context.dataRoot).startsWith(`${REPO_ROOT}${path.sep}`), detail: context.dataRoot },
    { name: "numeric-build", ok: /^\d+$/.test(context.build), detail: context.build },
  ];
  for (const stage of stages) {
    for (const required of definitions[stage].required) {
      checks.push({ name: `${stage}:input`, ok: existsSync(required), detail: required });
    }
  }
  if (stages.some((stage) => stage === "warehouse" || stage === "inventory")) {
    const decoded = decodedSemanticIdentity(path.join(context.dataRoot, "decoded", context.build, "tables"));
    const errors = validateDecodedBaseline(context.decodedBaselinePath, decoded, context.build);
    checks.push({
      name: "decoded-data-baseline",
      ok: errors.length === 0,
      detail: errors.length ? errors.join("; ") : context.decodedBaselinePath,
    });
  }
  if (stages.includes("collector") || stages.includes("collector-tests")) {
    const probe = spawnSync(context.dotnet, ["--list-sdks"], { encoding: "utf8", shell: false });
    const sdkList = probe.status === 0 ? (probe.stdout ?? "").trim() : "";
    checks.push({
      name: "dotnet-sdk",
      ok: sdkList.length > 0,
      detail: sdkList
        ? `${context.dotnet}: ${sdkList.split(/\r?\n/)[0]}`
        : `${context.dotnet} has no usable SDK. Set TL_DOTNET or install the SDK at TL_DATA_ROOT\\cache\\tools\\dotnet-sdk\\dotnet.exe`,
    });
  }
  return checks;
}

export function runtimeStageInputErrors(context, stageName, definition) {
  const errors = (definition.required ?? [])
    .filter((required) => !existsSync(required))
    .map((required) => `Required input disappeared before ${stageName}: ${required}`);
  if (stageName === "warehouse" || stageName === "inventory") {
    const decoded = decodedSemanticIdentity(path.join(context.dataRoot, "decoded", context.build, "tables"));
    errors.push(...validateDecodedBaseline(context.decodedBaselinePath, decoded, context.build));
  }
  return errors;
}

function printable(cmd) {
  return [cmd.executable, ...cmd.args].map((part) => /\s/.test(part) ? `"${part}"` : part).join(" ");
}

function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temp, file);
}

function inputFileIdentity(file) {
  return existsSync(file) ? { exists: true, path: file, sha256: fileSha256(file) } : { exists: false, path: file };
}

function shallowFileIdentity(file) {
  return existsSync(file)
    ? { exists: true, path: file, sha256: fileSha256(file), bytes: statSync(file).size }
    : { exists: false, path: file };
}

export function collectDataBuildInputs(context) {
  return {
    decodedTables: decodedSemanticIdentity(path.join(context.dataRoot, "decoded", context.build, "tables")),
    decodedBaseline: inputFileIdentity(context.decodedBaselinePath),
    localization: inputFileIdentity(path.join(context.extractRoot, "localization", "csv", "en.csv")),
    texturePaths: pathSetIdentity(path.join(context.extractRoot, "textures", "TL", "Content"), ".png"),
    questlogEquipment: inputFileIdentity(path.join(context.questlogRoot, "characterBuilder.getEquipmentItems.json")),
    questlogSkills: inputFileIdentity(path.join(context.questlogRoot, "skillBuilder.getSkillSets.json")),
    gameTablesIndex: inputFileIdentity(path.join(context.extractRoot, "indexes", "game_tables.csv")),
  };
}

export function safetySummary(stages, definitions) {
  return {
    deletesSourceData: false,
    uploads: false,
    publishes: false,
    commits: false,
    replacesDerivedOutputs: stages
      .filter((stage) => definitions[stage].output)
      .map((stage) => definitions[stage].output),
  };
}

export function stageEnvironment(context, baseEnvironment = process.env) {
  return {
    ...baseEnvironment,
    TL_DATA_ROOT: context.dataRoot,
    TL_EXTRACT_ROOT: context.extractRoot,
    TL_QUESTLOG_ROOT: context.questlogRoot,
    TL_QUESTLOG_PUBLIC_DIR: context.questlogRoot,
    TL_STEAM_BUILD: context.build,
  };
}

export function collectDataGeneratorIdentity(repoRoot = REPO_ROOT) {
  const commitResult = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", shell: false });
  if (commitResult.status !== 0) throw new Error(`Unable to resolve generator Git commit: ${(commitResult.stderr ?? "").trim()}`);
  const trackedResult = spawnSync("git", ["diff", "HEAD", "--name-only", "-z"], { cwd: repoRoot, encoding: "utf8", shell: false });
  if (trackedResult.status !== 0) throw new Error(`Unable to inspect tracked generator changes: ${(trackedResult.stderr ?? "").trim()}`);
  const untrackedResult = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: repoRoot, encoding: "utf8", shell: false });
  if (untrackedResult.status !== 0) throw new Error(`Unable to inspect untracked generator changes: ${(untrackedResult.stderr ?? "").trim()}`);
  const dirtyPaths = [...new Set(`${trackedResult.stdout ?? ""}\0${untrackedResult.stdout ?? ""}`
    .split("\0")
    .map((value) => value.trim().replaceAll("\\", "/"))
    .filter(Boolean))].sort();
  const files = DATA_GENERATOR_FILES.map((relativePath) => {
    const file = path.join(repoRoot, ...relativePath.split("/"));
    if (!existsSync(file)) throw new Error(`Required data generator file is missing: ${file}`);
    return { path: relativePath, sha256: fileSha256(file) };
  });
  const sourceSetSha256 = createHash("sha256")
    .update(files.map((file) => JSON.stringify(file)).join("\n"))
    .digest("hex");
  return {
    gitCommit: (commitResult.stdout ?? "").trim(),
    worktreeDirty: dirtyPaths.length > 0,
    dirtyPaths,
    nodeVersion: process.version,
    sourceSetSha256,
    files,
  };
}

export function dataReceiptAllowedDirtyPaths(stages) {
  const selected = new Set(stages ?? []);
  const allowed = ["data-build-receipts/"];
  if (selected.has("inventory")) allowed.push("out/coverage-audit/table-inventory.json");
  if (selected.has("coverage")) allowed.push("out/coverage-audit/");
  if (selected.has("web-data")) allowed.push("web/data/app-data.json", "web/data/projections/");
  return allowed;
}

export function invalidateCurrentDataBuildReceipt(repoRoot, build, runId) {
  const current = receiptPath(repoRoot, build);
  if (!existsSync(current)) return null;
  const archive = path.join(repoRoot, "data-build-receipts", "superseded", String(build), `${runId}.json`);
  mkdirSync(path.dirname(archive), { recursive: true });
  const sha256 = fileSha256(current);
  renameSync(current, archive);
  return { path: current, sha256, archivedAt: archive };
}

function tail(text, length = 8000) {
  const value = text ?? "";
  return value.length <= length ? value : value.slice(-length);
}

export function reportPaths(context, startedAt) {
  const runId = startedAt.replace(/[:.]/g, "-");
  const dir = path.join(context.dataRoot, "reports", context.build, "update-runs");
  return { run: path.join(dir, `${runId}.json`), latest: path.join(dir, "latest.json") };
}

export function helpText() {
  return `TL-Helper safe update orchestrator

Usage: node scripts/update-tl-helper.mjs [options]

Options:
  --dry-run              Print and report the plan without running stages
  --validate             Run preflight validation only
  --only <a,b>           Run only named stages
  --skip <a,b>           Skip named stages
  --build <id>           Override detected Steam build
  --data-root <path>     Override TL_DATA_ROOT
  --extract-root <path>  Override TL_EXTRACT_ROOT
  --questlog-root <path> Override TL_QUESTLOG_ROOT
  --config <path>        Collector config path
  --help                 Show this help

Stages: ${STAGE_ORDER.join(", ")}

Default runs stages in dependency order and stops at the first failure. It never
deletes source snapshots, uploads, commits, or publishes. Rebuild stages replace
their named derived outputs after preflight succeeds.`;
}

export function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(argv); }
  catch (error) { console.error(`Argument error: ${error.message}\n\n${helpText()}`); return 2; }
  if (options.help) { console.log(helpText()); return 0; }

  const startedAt = new Date().toISOString();
  let context;
  try { context = resolveContext(options); }
  catch (error) { console.error(`Configuration error: ${error.message}`); return 2; }
  const definitions = stageDefinitions(context);
  const stages = selectedStages(options);
  if (!stages.length) { console.error("No stages selected."); return 2; }
  const checks = preflight(context, stages, definitions);
  const generator = collectDataGeneratorIdentity();
  if (["warehouse", "inventory"].every((name) => stages.includes(name))) {
    checks.push({
      name: "data-generator-clean",
      ok: !generator.worktreeDirty,
      detail: generator.worktreeDirty
        ? "Receipt-producing rebuilds require a clean committed worktree"
        : `${generator.gitCommit} with ${generator.files.length} pinned generator files`,
    });
  }
  const failedChecks = checks.filter((item) => !item.ok);
  const paths = reportPaths(context, startedAt);
  const report = {
    schemaVersion: 2,
    startedAtUtc: startedAt,
    finishedAtUtc: null,
    mode: options.dryRun ? "dry-run" : options.validate ? "validate" : "run",
    status: "running",
    repository: REPO_ROOT,
    gameBuild: context.build,
    buildSource: options.build ? "argument" : process.env.TL_STEAM_BUILD ? "environment" : context.manifestBuild ? "steam-appmanifest" : "collector-config",
    dataRoot: context.dataRoot,
    extractRoot: context.extractRoot,
    questlogRoot: context.questlogRoot,
    decodedBaselinePath: context.decodedBaselinePath,
    dotnet: context.dotnet,
    collectorConfig: context.configPath,
    generator,
    selectedStages: stages,
    skippedStages: STAGE_ORDER.filter((stage) => !stages.includes(stage)),
    preflight: checks,
    stages: [],
    safety: safetySummary(stages, definitions),
    reportPath: paths.run,
    dataBuildInputs: null,
    warehouseAfterAuthorizedMutation: null,
    supersededDataBuildReceipt: null,
    dataBuildReceipt: null,
  };

  console.log(`TL-Helper build ${context.build}`);
  console.log(`Data root: ${context.dataRoot}`);
  for (const stage of stages) console.log(`  ${stage}: ${printable(definitions[stage].command)}`);

  if (failedChecks.length) {
    report.status = "preflight-failed";
    for (const check of failedChecks) console.error(`Missing or invalid: ${check.detail} (${check.name})`);
  } else if (options.dryRun || options.validate) {
    report.status = options.dryRun ? "planned" : "validated";
  } else {
    const env = stageEnvironment(context);
    if (stages.some((stage) => RECEIPT_MUTATING_STAGES.has(stage))) {
      const runId = startedAt.replace(/[:.]/g, "-");
      report.supersededDataBuildReceipt = invalidateCurrentDataBuildReceipt(REPO_ROOT, context.build, runId);
    }
    for (const stageName of stages) {
      const definition = definitions[stageName];
      const stageStarted = new Date();
      let beforeIdentity = null;
      let beforeIdentityError = null;
      try {
        const inspectBefore = definition.inspectBeforeOutput ?? definition.inspectOutput;
        beforeIdentity = inspectBefore?.(definition.output) ?? null;
      }
      catch (error) { beforeIdentityError = error.message; }
      const runtimeInputErrors = runtimeStageInputErrors(context, stageName, definition);
      if (runtimeInputErrors.length) {
        report.stages.push({
          name: stageName,
          status: "failed",
          command: printable(definition.command),
          startedAtUtc: stageStarted.toISOString(),
          finishedAtUtc: new Date().toISOString(),
          durationMs: Date.now() - stageStarted.getTime(),
          exitCode: null,
          signal: null,
          output: definition.output,
          outputExists: definition.output ? existsSync(definition.output) : null,
          error: runtimeInputErrors[0],
          semanticErrors: runtimeInputErrors,
          beforeIdentity,
          beforeIdentityError,
          afterIdentity: null,
          stdoutTail: "",
          stderrTail: "",
        });
        console.error(`[${stageName}] failed input revalidation: ${runtimeInputErrors.join("; ")}`);
        break;
      }
      if ((stageName === "warehouse" || stageName === "inventory") && report.dataBuildInputs == null) {
        report.dataBuildInputs = collectDataBuildInputs(context);
      }
      console.log(`\n[${stageName}] starting`);
      const result = spawnSync(definition.command.executable, definition.command.args, {
        cwd: REPO_ROOT, env, encoding: "utf8", shell: false, maxBuffer: 64 * 1024 * 1024,
      });
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      const outputOk = !definition.output || existsSync(definition.output);
      let afterIdentity = null;
      let identityError = null;
      try { afterIdentity = definition.inspectOutput?.(definition.output) ?? null; }
      catch (error) { identityError = `Unable to inspect output identity: ${error.message}`; }
      const outputErrors = identityError ? [identityError] : (definition.validateOutput?.(afterIdentity) ?? []);
      const semanticError = definition.validateResult?.(result) ?? outputErrors[0] ?? null;
      const status = result.error || result.status !== 0 || !outputOk || semanticError ? "failed" : "passed";
      report.stages.push({
        name: stageName, status, command: printable(definition.command),
        startedAtUtc: stageStarted.toISOString(), finishedAtUtc: new Date().toISOString(),
        durationMs: Date.now() - stageStarted.getTime(), exitCode: result.status,
        signal: result.signal ?? null, output: definition.output,
        outputExists: definition.output ? outputOk : null,
        error: result.error?.message ?? semanticError ?? (!outputOk ? `Expected output missing: ${definition.output}` : null),
        semanticErrors: outputErrors,
        beforeIdentity,
        beforeIdentityError,
        afterIdentity,
        stdoutTail: tail(result.stdout), stderrTail: tail(result.stderr),
      });
      if (status === "passed" && stageName === "stat-sources") {
        try {
          const identity = warehouseSemanticIdentity(definitions.warehouse.output);
          const errors = definitions.warehouse.validateOutput(identity);
          if (errors.length) throw new Error(errors.join("; "));
          report.warehouseAfterAuthorizedMutation = identity;
        } catch (error) {
          const stage = report.stages.at(-1);
          stage.status = "failed";
          stage.error = `Unable to capture warehouse after authorized stat-sources mutation: ${error.message}`;
          stage.semanticErrors = [...stage.semanticErrors, stage.error];
        }
      }
      const finalStageStatus = report.stages.at(-1).status;
      console.log(`[${stageName}] ${finalStageStatus}`);
      if (finalStageStatus === "failed") break;
    }
    report.status = report.stages.length === stages.length && report.stages.every((stage) => stage.status === "passed") ? "passed" : "failed";
  }

  report.finishedAtUtc = new Date().toISOString();
  const receiptRequired = report.status === "passed"
    && ["warehouse", "inventory"].every((name) => stages.includes(name));
  if (receiptRequired) report.status = "awaiting-receipt";
  atomicJson(paths.run, report);
  atomicJson(paths.latest, report);
  if (receiptRequired) {
    try {
      const stageMap = new Map(report.stages.map((stage) => [stage.name, stage]));
      const currentWarehouse = warehouseSemanticIdentity(definitions.warehouse.output);
      const currentInventory = definitions.inventory.inspectOutput(definitions.inventory.output);
      const finalErrors = [
        ...definitions.warehouse.validateOutput(currentWarehouse),
        ...definitions.inventory.validateOutput(currentInventory),
      ];
      if (finalErrors.length) throw new Error(`Final data outputs failed semantic validation: ${finalErrors.join("; ")}`);
      const finalInputs = collectDataBuildInputs(context);
      const receiptReport = { ...report, status: "passed" };
      const receipt = buildDataBuildReceipt({
        repoRoot: REPO_ROOT,
        context,
        report: receiptReport,
        inputs: finalInputs,
        outputs: {
          warehouse: currentWarehouse,
          inventory: currentInventory,
        },
        currentGenerator: collectDataGeneratorIdentity(),
        allowedGeneratorDirtyPaths: dataReceiptAllowedDirtyPaths(stages),
      });
      const file = receiptPath(REPO_ROOT, context.build);
      atomicReceiptJson(file, receipt);
      report.status = "passed";
      report.dataBuildReceipt = { path: file, sha256: fileSha256(file), schema: receipt.schema, schemaVersion: receipt.schemaVersion };
    } catch (error) {
      report.status = "failed";
      report.dataBuildReceipt = { error: error.message };
    }
  }
  atomicJson(paths.run, report);
  atomicJson(paths.latest, report);
  console.log(`\nRun report: ${paths.run}`);
  return ["passed", "planned", "validated"].includes(report.status) ? 0 : 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = main();
