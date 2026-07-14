import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import os from "node:os";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  RECEIPT_MUTATING_STAGES, STAGE_ORDER, dataReceiptAllowedDirtyPaths, invalidateCurrentDataBuildReceipt, parseArgs, parseSteamBuild, resolveContext, runtimeStageInputErrors, safetySummary, selectedStages, stageDefinitions, stageEnvironment,
} from "../update-tl-helper.mjs";

test("parses Steam appmanifest build IDs", () => {
  assert.equal(parseSteamBuild('"buildid"\t\t"24118850"'), "24118850");
  assert.equal(parseSteamBuild('"StateFlags" "4"'), null);
});

test("stage selection preserves safe dependency order", () => {
  const options = parseArgs(["--only", "evidence,decode,warehouse", "--skip", "warehouse"]);
  assert.deepEqual(selectedStages(options), ["decode", "evidence"]);
});

test("rejects unknown stages and arguments", () => {
  assert.throws(() => parseArgs(["--only", "explode"]), /Unknown stage/);
  assert.throws(() => parseArgs(["--surprise"]), /Unknown argument/);
});

test("explicit context overrides environment and stays build scoped", () => {
  const options = parseArgs([
    "--build", "999",
    "--data-root", "D:\\TL_Test_Data",
    "--questlog-root", "D:\\TL_Questlog_Argument",
  ]);
  const context = resolveContext(options, { TL_QUESTLOG_ROOT: "D:\\TL_Questlog_Environment" });
  assert.equal(context.build, "999");
  assert.equal(context.dataRoot, path.resolve("D:\\TL_Test_Data"));
  assert.equal(context.extractRoot, path.join(context.dataRoot, "raw", "999", "extracted"));
  assert.equal(context.questlogRoot, path.resolve("D:\\TL_Questlog_Argument"));
  assert.equal(context.decodedBaselinePath, path.join(path.resolve("."), "data-build-baselines", "999.json"));
  const definitions = stageDefinitions(context);
  assert.equal(definitions.warehouse.output, path.join(context.dataRoot, "warehouse", "tl-999.sqlite"));
  assert.deepEqual(definitions.warehouse.command.args.slice(-4), [
    "--questlog-root", context.questlogRoot,
    "--decoded-baseline", context.decodedBaselinePath,
  ]);
});

test("Questlog root uses environment before the worktree-local fallback", () => {
  const options = parseArgs(["--build", "999", "--data-root", "D:\\TL_Test_Data"]);
  assert.equal(
    resolveContext(options, { TL_QUESTLOG_ROOT: "D:\\TL_Questlog_Environment" }).questlogRoot,
    path.resolve("D:\\TL_Questlog_Environment"),
  );
  assert.equal(
    resolveContext(options, {}).questlogRoot,
    path.join(path.resolve("."), "out", "questlog-public"),
  );
});

test("every pipeline stage receives one explicit Questlog snapshot root", () => {
  const context = resolveContext(parseArgs([
    "--build", "999",
    "--data-root", "D:\\TL_Test_Data",
    "--questlog-root", "D:\\TL_Questlog",
  ]), {});
  const environment = stageEnvironment(context, { PRESERVE: "yes" });
  assert.equal(environment.TL_QUESTLOG_ROOT, context.questlogRoot);
  assert.equal(environment.TL_QUESTLOG_PUBLIC_DIR, context.questlogRoot);
  assert.equal(environment.PRESERVE, "yes");
});

test("warehouse and inventory preflight declare every input their builders consume", () => {
  const context = resolveContext(parseArgs(["--build", "999", "--data-root", "D:\\TL_Test_Data"]), {});
  const definitions = stageDefinitions(context);
  assert.deepEqual(definitions.warehouse.required, [
    path.join(context.dataRoot, "decoded", "999", "tables"),
    path.join(context.extractRoot, "localization", "csv", "en.csv"),
    path.join(context.extractRoot, "textures", "TL", "Content"),
    path.join(context.questlogRoot, "characterBuilder.getEquipmentItems.json"),
    path.join(context.questlogRoot, "skillBuilder.getSkillSets.json"),
    context.decodedBaselinePath,
  ]);
  assert.deepEqual(definitions.inventory.required, [
    path.join(context.extractRoot, "indexes", "game_tables.csv"),
    path.join(context.dataRoot, "decoded", "999", "tables"),
    context.decodedBaselinePath,
  ]);
  assert.notEqual(definitions.warehouse.inspectBeforeOutput, definitions.warehouse.inspectOutput);
});

test("warehouse and inventory revalidate the reviewed decoded baseline immediately before execution", () => {
  const context = resolveContext(parseArgs(["--build", "999", "--data-root", "D:\\TL_Test_Data"]), {});
  assert.match(
    runtimeStageInputErrors(context, "warehouse", { required: [] })[0],
    /baseline does not exist/,
  );
  assert.deepEqual(runtimeStageInputErrors(context, "evidence", { required: [] }), []);
});

test("safety summary identifies replaceable derived outputs without claiming source deletion", () => {
  const context = resolveContext(parseArgs(["--build", "999", "--data-root", "D:\\TL_Test_Data"]), {});
  const definitions = stageDefinitions(context);
  assert.deepEqual(safetySummary(["warehouse", "inventory"], definitions), {
    deletesSourceData: false,
    uploads: false,
    publishes: false,
    commits: false,
    replacesDerivedOutputs: [definitions.warehouse.output, definitions.inventory.output],
  });
});

test("a prior receipt is atomically superseded before a data rebuild can replace outputs", () => {
  assert.deepEqual([...RECEIPT_MUTATING_STAGES].sort(), ["collector", "decode", "inventory", "stat-sources", "warehouse"]);
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "tl-receipt-invalidation-"));
  try {
    const current = path.join(repoRoot, "data-build-receipts", "999.json");
    mkdirSync(path.dirname(current), { recursive: true });
    writeFileSync(current, "prior receipt\n", "utf8");
    const result = invalidateCurrentDataBuildReceipt(repoRoot, "999", "run-id");
    assert.equal(result.path, current);
    assert.equal(readFileSync(result.archivedAt, "utf8"), "prior receipt\n");
    assert.equal(result.archivedAt, path.join(repoRoot, "data-build-receipts", "superseded", "999", "run-id.json"));
    assert.equal(invalidateCurrentDataBuildReceipt(repoRoot, "999", "another-run"), null);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("receipt issuance allows only selected generated repository paths", () => {
  assert.deepEqual(dataReceiptAllowedDirtyPaths(["warehouse", "inventory"]), [
    "data-build-receipts/",
    "out/coverage-audit/table-inventory.json",
  ]);
  assert.deepEqual(dataReceiptAllowedDirtyPaths(["warehouse", "inventory", "web-data"]), [
    "data-build-receipts/",
    "out/coverage-audit/table-inventory.json",
    "web/data/app-data.json",
    "web/data/projections/",
  ]);
});

test("TL_DOTNET explicitly selects the SDK host", () => {
  const options = parseArgs(["--build", "999", "--data-root", "D:\\TL_Test_Data"]);
  const context = resolveContext(options, { TL_DOTNET: "D:\\Tools\\dotnet.exe" });
  assert.equal(context.dotnet, path.resolve("D:\\Tools\\dotnet.exe"));
  assert.equal(stageDefinitions(context)["collector-tests"].command.executable, context.dotnet);
});

test("default selects every stage once", () => {
  assert.deepEqual(selectedStages(parseArgs([])), STAGE_ORDER);
});

test("application verifications are explicit and ordered before test suites", () => {
  const stages = selectedStages(parseArgs([]));
  assert.deepEqual(
    stages.slice(stages.indexOf("snapshot-verify"), stages.indexOf("js-tests") + 1),
    ["snapshot-verify", "reference-verify", "edge-verify", "js-tests"],
  );
  const context = resolveContext(parseArgs(["--build", "999", "--data-root", "D:\\TL_Test_Data"]), {});
  const definitions = stageDefinitions(context);
  assert.match(definitions["snapshot-verify"].command.args[0], /verify-build-snapshot\.mjs$/);
  assert.match(definitions["reference-verify"].command.args[0], /verify-reference-build\.mjs$/);
  assert.match(definitions["edge-verify"].command.args[0], /verify-edge-cases\.mjs$/);
});

test("combat-power evidence is regenerated before calculator verification", () => {
  const stages = selectedStages(parseArgs([]));
  assert.ok(stages.indexOf("combat-power-analysis") > stages.indexOf("evidence"));
  assert.ok(stages.indexOf("combat-power-analysis") < stages.indexOf("snapshot-verify"));
  const context = resolveContext(parseArgs(["--build", "999", "--data-root", "D:\\TL_Test_Data"]), {});
  const definition = stageDefinitions(context)["combat-power-analysis"];
  assert.match(definition.command.args[0], /analyze-combat-power\.mjs$/);
  assert.equal(definition.command.args[1], "--write");
});

test("skill formula mapping is build scoped and runs after decoded inputs", () => {
  const stages = selectedStages(parseArgs([]));
  assert.ok(stages.indexOf("skill-formula-map") > stages.indexOf("decode"));
  assert.ok(stages.indexOf("skill-formula-map") < stages.indexOf("snapshot-verify"));
  const context = resolveContext(parseArgs(["--build", "999", "--data-root", "D:\\TL_Test_Data"]), {});
  const definition = stageDefinitions(context)["skill-formula-map"];
  assert.match(definition.command.args[0], /build-skill-formula-map\.mjs$/);
  assert.equal(
    definition.output,
    path.join(context.dataRoot, "reports", "999", "skill-formula-map.json"),
  );
  assert.equal(definition.validateResult({ stdout: '{"skillSets": 210}' }), null);
  assert.match(definition.validateResult({ stdout: '{"skillSets": 209}' }), /all 210/);
});

test("stat sources are rebuilt from projections before evidence and verification", () => {
  const stages = selectedStages(parseArgs([]));
  assert.ok(stages.indexOf("stat-sources") > stages.indexOf("web-data"));
  assert.ok(stages.indexOf("stat-sources") < stages.indexOf("evidence"));
  assert.ok(stages.indexOf("stat-sources") < stages.indexOf("snapshot-verify"));

  const context = resolveContext(parseArgs(["--build", "999", "--data-root", "D:\\TL_Test_Data"]), {});
  const definition = stageDefinitions(context)["stat-sources"];
  assert.match(definition.command.args[0], /build-stat-sources\.mjs$/);
  assert.deepEqual(definition.required, [
    path.join(context.dataRoot, "warehouse", "tl-999.sqlite"),
    path.join(path.resolve("."), "web", "data", "projections", "equipment.json"),
    path.join(path.resolve("."), "web", "data", "projections", "progression.json"),
    path.join(path.resolve("."), "web", "data", "projections", "runes.json"),
  ]);
  assert.equal(
    definition.output,
    path.join(context.dataRoot, "reports", "999", "stat-sources", "heavy-attack.json"),
  );
  assert.deepEqual(parseArgs(["--only", "stats"]).only, ["stat-sources"]);
});

test("reviewed combat abilities are rebuilt after web data and before stat sources", () => {
  const stages = selectedStages(parseArgs([]));
  assert.ok(stages.indexOf("combat-abilities") > stages.indexOf("web-data"));
  assert.ok(stages.indexOf("combat-abilities") < stages.indexOf("combat-effect-links"));

  const context = resolveContext(parseArgs(["--build", "999", "--data-root", "D:\\TL_Test_Data"]), {});
  const definition = stageDefinitions(context)["combat-abilities"];
  assert.match(definition.command.args[0], /build-combat-ability-data\.mjs$/);
  assert.deepEqual(definition.required, [
    path.join(path.resolve("."), "web", "data", "projections", "skills.json"),
    path.join(context.dataRoot, "reports", "999", "skill-formula-map.json"),
    path.join(context.dataRoot, "decoded", "999", "tables", "TLFormulaParameterNew.json"),
    path.join(path.resolve("."), "scripts", "combat-abilities", "reviewed-abilities.json"),
  ]);
  assert.equal(definition.output, path.join(context.dataRoot, "reports", "999", "combat-abilities.json"));
  assert.equal(definition.validateResult({ stdout: '{"abilities":3,"formulaComponents":5}' }), null);
  assert.equal(definition.validateResult({ stdout: '{"abilities":4,"formulaComponents":7}' }), null);
  assert.match(definition.validateResult({ stdout: '{"abilities":3,"formulaComponents":4}' }), /3 abilities/);
  assert.deepEqual(parseArgs(["--only", "abilities"]).only, ["combat-abilities"]);
});

test("combat effect links follow reviewed abilities and retain build-scoped inputs", () => {
  const stages = selectedStages(parseArgs([]));
  assert.ok(stages.indexOf("combat-effect-links") > stages.indexOf("combat-abilities"));
  assert.ok(stages.indexOf("combat-effect-links") < stages.indexOf("stat-sources"));
  const context = resolveContext(parseArgs(["--build", "999", "--data-root", "D:\\TL_Test_Data"]), {});
  const definition = stageDefinitions(context)["combat-effect-links"];
  assert.match(definition.command.args[0], /build-combat-effect-links\.mjs$/);
  assert.deepEqual(definition.required, [
    path.join(context.dataRoot, "decoded", "999", "tables", "TLEffectProperty.json"),
    path.join(context.dataRoot, "reports", "999", "combat-abilities.json"),
  ]);
  assert.equal(definition.output, path.join(context.dataRoot, "reports", "999", "combat-effect-links.json"));
  assert.equal(definition.validateResult({ stdout: '{"abilities":3,"components":5}' }), null);
  assert.match(definition.validateResult({ stdout: '{"abilities":3,"components":4}' }), /all reviewed abilities/);
  assert.deepEqual(parseArgs(["--only", "effects"]).only, ["combat-effect-links"]);
});

test("decoder requires a complete semantic success summary", () => {
  const context = resolveContext(parseArgs(["--build", "999", "--data-root", "D:\\TL_Test_Data"]), {});
  const validate = stageDefinitions(context).decode.validateResult;
  assert.equal(validate({ stdout: "decoded 20/20 tables -> somewhere (0 errors)" }), null);
  assert.match(validate({ stdout: "decoded 19/20 tables -> somewhere (0 errors)" }), /every selected table/);
  assert.match(validate({ stdout: "decoded 20/20 tables -> somewhere (1 errors)" }), /every selected table/);
});

test("coverage stderr validation failures are fatal", () => {
  const context = resolveContext(parseArgs(["--build", "999", "--data-root", "D:\\TL_Test_Data"]), {});
  const validate = stageDefinitions(context).coverage.validateResult;
  assert.equal(validate({ stderr: "" }), null);
  assert.match(validate({ stderr: "VALIDATION FAILED: count" }), /failed validations/);
});
