#!/usr/bin/env node

// Safe, single-command update runner for TL-Helper's existing data pipeline.
// This file orchestrates tools. It does not delete source data, upload, publish,
// or hide failed stages.

import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CONFIG = path.join(REPO_ROOT, "src", "TlCollector", "config.local.json");

export const STAGE_ORDER = [
  "collector", "decode", "warehouse", "inventory", "skill-formula-map", "web-data", "coverage",
  "evidence", "combat-power-analysis", "snapshot-verify", "reference-verify", "edge-verify", "js-tests",
  "collector-tests",
];

const STAGE_ALIASES = new Map([
  ["collect", "collector"], ["test-js", "js-tests"], ["test-collector", "collector-tests"],
  ["web", "web-data"], ["verify-snapshot", "snapshot-verify"],
  ["power", "combat-power-analysis"],
  ["formulas", "skill-formula-map"],
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
    build: null, dataRoot: null, extractRoot: null, config: DEFAULT_CONFIG,
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
  const cachedDotnet = path.join(dataRoot, "cache", "tools", "dotnet-sdk", "dotnet.exe");
  const dotnet = environment.TL_DOTNET
    ? path.resolve(environment.TL_DOTNET)
    : existsSync(cachedDotnet) ? cachedDotnet : "dotnet";
  return { build, dataRoot, extractRoot, configPath, config, manifestBuild, dotnet };
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
      command: command(node, [script("build-warehouse.mjs")]),
      required: [path.join(context.dataRoot, "decoded", context.build, "tables")],
      output: path.join(context.dataRoot, "warehouse", `tl-${context.build}.sqlite`),
    },
    inventory: {
      command: command(node, [script("build-table-inventory.mjs")]),
      required: [path.join(context.dataRoot, "decoded", context.build, "tables")],
      output: path.join(context.dataRoot, "reports", context.build, "table-inventory.json"),
    },
    "skill-formula-map": {
      command: command(node, [script("build-skill-formula-map.mjs")]),
      required: [
        path.join(context.dataRoot, "decoded", context.build, "tables", "TLFormulaParameterNew.json"),
        path.join(context.extractRoot, "localization", "csv", "en.csv"),
        path.join(REPO_ROOT, "out", "questlog-public", "skillBuilder.getSkillSets.json"),
      ],
      output: path.join(context.dataRoot, "reports", context.build, "skill-formula-map.json"),
      validateResult: (result) => {
        const match = result.stdout?.match(/"skillSets":\s*(\d+)/);
        return match?.[1] === "210" ? null : "Skill-formula mapper did not report all 210 player skill sets";
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
      required: [path.join(REPO_ROOT, "out", "questlog-public")],
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

function printable(cmd) {
  return [cmd.executable, ...cmd.args].map((part) => /\s/.test(part) ? `"${part}"` : part).join(" ");
}

function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temp, file);
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
  --config <path>        Collector config path
  --help                 Show this help

Stages: ${STAGE_ORDER.join(", ")}

Default runs stages in dependency order and stops at the first failure. It never
deletes, uploads, commits, publishes, or removes old build data.`;
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
  const failedChecks = checks.filter((item) => !item.ok);
  const paths = reportPaths(context, startedAt);
  const report = {
    schemaVersion: 1,
    startedAtUtc: startedAt,
    finishedAtUtc: null,
    mode: options.dryRun ? "dry-run" : options.validate ? "validate" : "run",
    status: "running",
    repository: REPO_ROOT,
    gameBuild: context.build,
    buildSource: options.build ? "argument" : process.env.TL_STEAM_BUILD ? "environment" : context.manifestBuild ? "steam-appmanifest" : "collector-config",
    dataRoot: context.dataRoot,
    extractRoot: context.extractRoot,
    dotnet: context.dotnet,
    collectorConfig: context.configPath,
    selectedStages: stages,
    skippedStages: STAGE_ORDER.filter((stage) => !stages.includes(stage)),
    preflight: checks,
    stages: [],
    safety: { deletesData: false, uploads: false, publishes: false, commits: false },
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
    const env = { ...process.env, TL_DATA_ROOT: context.dataRoot, TL_EXTRACT_ROOT: context.extractRoot, TL_STEAM_BUILD: context.build };
    for (const stageName of stages) {
      const definition = definitions[stageName];
      const stageStarted = new Date();
      console.log(`\n[${stageName}] starting`);
      const result = spawnSync(definition.command.executable, definition.command.args, {
        cwd: REPO_ROOT, env, encoding: "utf8", shell: false, maxBuffer: 64 * 1024 * 1024,
      });
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      const outputOk = !definition.output || existsSync(definition.output);
      const semanticError = definition.validateResult?.(result) ?? null;
      const status = result.error || result.status !== 0 || !outputOk || semanticError ? "failed" : "passed";
      report.stages.push({
        name: stageName, status, command: printable(definition.command),
        startedAtUtc: stageStarted.toISOString(), finishedAtUtc: new Date().toISOString(),
        durationMs: Date.now() - stageStarted.getTime(), exitCode: result.status,
        signal: result.signal ?? null, output: definition.output,
        outputExists: definition.output ? outputOk : null,
        error: result.error?.message ?? semanticError ?? (!outputOk ? `Expected output missing: ${definition.output}` : null),
        stdoutTail: tail(result.stdout), stderrTail: tail(result.stderr),
      });
      console.log(`[${stageName}] ${status}`);
      if (status === "failed") break;
    }
    report.status = report.stages.length === stages.length && report.stages.every((stage) => stage.status === "passed") ? "passed" : "failed";
  }

  report.finishedAtUtc = new Date().toISOString();
  atomicJson(paths.run, report);
  atomicJson(paths.latest, report);
  console.log(`\nRun report: ${paths.run}`);
  return ["passed", "planned", "validated"].includes(report.status) ? 0 : 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = main();
