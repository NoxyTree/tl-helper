import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {
  STAGE_ORDER, parseArgs, parseSteamBuild, resolveContext, selectedStages, stageDefinitions,
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
  const options = parseArgs(["--build", "999", "--data-root", "D:\\TL_Test_Data"]);
  const context = resolveContext(options, {});
  assert.equal(context.build, "999");
  assert.equal(context.dataRoot, path.resolve("D:\\TL_Test_Data"));
  assert.equal(context.extractRoot, path.join(context.dataRoot, "raw", "999", "extracted"));
  const definitions = stageDefinitions(context);
  assert.equal(definitions.warehouse.output, path.join(context.dataRoot, "warehouse", "tl-999.sqlite"));
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
