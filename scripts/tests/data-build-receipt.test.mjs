import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { inventorySemanticIdentity as computeInventorySemanticSha256 } from "../build-table-inventory.mjs";
import { databaseSemanticHashes } from "../build-warehouse.mjs";
import {
  DATA_BUILD_RECEIPT_SCHEMA,
  assertDataGeneratorIdentity,
  assertOnlyAuthorizedGeneratorChanges,
  buildDataBuildReceipt,
  decodedSemanticIdentity,
  inventorySemanticIdentity,
  receiptPath,
  validateInventoryIdentity,
  validateDecodedBaseline,
  validateDataBuildReceipt,
  validateWarehouseIdentity,
  warehouseSemanticIdentity,
} from "../lib/data-build-receipt.mjs";

const BUILD = "999";

function generatorIdentity(overrides = {}) {
  const files = overrides.files ?? [{ path: "scripts/build.mjs", sha256: "1".repeat(64) }];
  return {
    gitCommit: "a".repeat(40),
    worktreeDirty: false,
    dirtyPaths: [],
    nodeVersion: process.version,
    sourceSetSha256: createHash("sha256").update(files.map((file) => JSON.stringify(file)).join("\n")).digest("hex"),
    files,
    ...overrides,
  };
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "tl-receipt-"));
  const decodedDir = path.join(root, "decoded");
  mkdirSync(decodedDir, { recursive: true });
  const rows = [
    { table: "TableA", sha256: "a".repeat(64), decodedRowCount: 2, rows: { a: {}, b: {} } },
    { table: "TableB", sha256: "b".repeat(64), decodedRowCount: 1, rows: { c: {} } },
  ];
  for (const row of rows) writeFileSync(path.join(decodedDir, `${row.table}.json`), JSON.stringify({ ...row, decoderVersion: "1" }));
  const dbFile = path.join(root, "warehouse.sqlite");
  const db = new DatabaseSync(dbFile);
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE decoded_tables (table_name TEXT, row_count INTEGER, source_path TEXT, source_sha256 TEXT, decoded_json_sha256 TEXT, decoder_version TEXT, game_build TEXT);
    CREATE TABLE records (
      record_id TEXT, row_id TEXT, record_type TEXT, table_name TEXT, table_family TEXT,
      source_path TEXT, source_sha256 TEXT, game_build TEXT, game_version TEXT, decoder_version TEXT,
      locale TEXT, name_loc TEXT, loc_key TEXT, loc_state TEXT, icon_asset_path TEXT, icon_asset_key TEXT,
      icon_exists INTEGER, raw_json TEXT, extraction_status TEXT, questlog_present INTEGER, confidence TEXT,
      first_seen_build TEXT, last_seen_build TEXT
    );
    CREATE TABLE refs (from_record_id TEXT, field TEXT, to_row_id TEXT);
    CREATE TABLE assets (asset_key TEXT, original_path TEXT, exists_locally INTEGER, referenced_by_questlog INTEGER);
    CREATE VIRTUAL TABLE records_fts USING fts5(record_id, row_id, name_loc);
  `);
  for (const [key, value] of Object.entries({
    game_build: BUILD,
    game_version: "test",
    contract: "docs/data-contract.md v1",
    localization_sha256: "c".repeat(64),
    texture_index_sha256: "d".repeat(64),
    questlog_equipment_sha256: "e".repeat(64),
    questlog_skills_sha256: "f".repeat(64),
    decoded_baseline_sha256: "0".repeat(64),
    source_manifest_sha256: "1".repeat(64),
    semantic_hash_schema: "length-prefixed-json-tuples-v1",
    decoded_tables_semantic_sha256: "2".repeat(64),
    records_semantic_sha256: "3".repeat(64),
    refs_semantic_sha256: "4".repeat(64),
    assets_semantic_sha256: "5".repeat(64),
    fts_semantic_sha256: "6".repeat(64),
  })) {
    db.prepare("INSERT INTO meta VALUES (?, ?)").run(key, value);
  }
  for (const row of rows) {
    db.prepare("INSERT INTO decoded_tables VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      row.table, row.decodedRowCount, `D:/${row.table}.uasset`, row.sha256, "8".repeat(64), "1", BUILD,
    );
    for (let i = 0; i < row.decodedRowCount; i++) {
      const recordId = `${row.table}:${i}`;
      db.prepare(`INSERT INTO records VALUES (${Array(23).fill("?").join(",")})`).run(
        recordId, String(i), "reference", row.table, row.table,
        `D:/${row.table}.uasset`, row.sha256, BUILD, "test", "1",
        "en", null, null, i === 0 ? "resolved" : "none", null, null,
        null, "{}", "decoded", null, "extracted", BUILD, BUILD,
      );
      db.prepare("INSERT INTO records_fts VALUES (?, ?, ?)").run(recordId, String(i), "");
    }
  }
  db.prepare("INSERT INTO refs VALUES ('TableA:0', 'Target', 'row')").run();
  db.prepare("INSERT INTO assets VALUES ('asset', '/Game/asset', 1, 0)").run();
  const semanticHashes = databaseSemanticHashes(db);
  for (const [key, value] of Object.entries({
    decoded_tables_semantic_sha256: semanticHashes.decodedTables,
    records_semantic_sha256: semanticHashes.records,
    refs_semantic_sha256: semanticHashes.refs,
    assets_semantic_sha256: semanticHashes.assets,
    fts_semantic_sha256: semanticHashes.fts,
  })) db.prepare("UPDATE meta SET value=? WHERE key=?").run(value, key);
  db.close();
  const inventoryFile = path.join(root, "inventory.json");
  const inventoryDocument = {
    generatedAtUtc: "2026-07-14T00:00:00.000Z",
    gameBuild: BUILD,
    decoderVersion: "1",
    totals: { tables: 10, families: 4, decodedTables: 2, decodedRows: 3, rawBytesAll: 100 },
  };
  inventoryDocument.semanticIdentity = {
    algorithm: "sha256",
    sha256: computeInventorySemanticSha256(inventoryDocument),
    excludes: ["generatedAtUtc", "semanticIdentity"],
  };
  writeFileSync(inventoryFile, JSON.stringify(inventoryDocument));
  return { root, decodedDir, dbFile, inventoryFile };
}

test("warehouse identity proves build, decoded row universe, and source hash universe", () => {
  const files = fixture();
  try {
    const decoded = decodedSemanticIdentity(files.decodedDir);
    const warehouse = warehouseSemanticIdentity(files.dbFile);
    assert.equal(warehouse.recordCount, 3);
    assert.equal(warehouse.tableCount, 2);
    assert.equal(warehouse.sourceSetSha256, decoded.sourceSetSha256);
    assert.deepEqual(validateWarehouseIdentity(warehouse, { build: BUILD, decoded }), []);
    assert.match(validateWarehouseIdentity({ ...warehouse, recordCount: 2 }, { build: BUILD, decoded })[0], /record count/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test("warehouse identity counts zero-row decoded tables from the explicit manifest", () => {
  const files = fixture();
  try {
    const zeroSha = "9".repeat(64);
    writeFileSync(path.join(files.decodedDir, "TableZero.json"), JSON.stringify({
      table: "TableZero", sha256: zeroSha, decodedRowCount: 0, rows: {}, decoderVersion: "1",
    }));
    const db = new DatabaseSync(files.dbFile);
    try {
      db.prepare("INSERT INTO decoded_tables VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        "TableZero", 0, "D:/TableZero.uasset", zeroSha, "8".repeat(64), "1", BUILD,
      );
      const hashes = databaseSemanticHashes(db);
      db.prepare("UPDATE meta SET value=? WHERE key='decoded_tables_semantic_sha256'").run(hashes.decodedTables);
    } finally { db.close(); }
    const decoded = decodedSemanticIdentity(files.decodedDir);
    const warehouse = warehouseSemanticIdentity(files.dbFile);
    assert.equal(warehouse.tableCount, 3);
    assert.equal(warehouse.recordCount, 3);
    assert.equal(warehouse.sourceSetSha256, decoded.sourceSetSha256);
    assert.deepEqual(validateWarehouseIdentity(warehouse, { build: BUILD, decoded }), []);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test("reviewed decoded baseline rejects a reduced or changed source universe", () => {
  const files = fixture();
  try {
    const decoded = decodedSemanticIdentity(files.decodedDir);
    const baselineFile = path.join(files.root, "baseline.json");
    writeFileSync(baselineFile, JSON.stringify({
      schema: "tl-helper.decoded-data-baseline",
      schemaVersion: 1,
      gameBuild: BUILD,
      tableCount: decoded.tableCount,
      rowCount: decoded.rowCount,
      decoderVersions: decoded.decoderVersions,
      sourceSetSha256: decoded.sourceSetSha256,
      artifactSetSha256: decoded.artifactSetSha256,
      reviewedAtUtc: "2026-07-14T00:00:00.000Z",
      reviewNote: "Reviewed fixture baseline.",
    }));
    assert.deepEqual(validateDecodedBaseline(baselineFile, decoded, BUILD), []);
    assert.match(
      validateDecodedBaseline(baselineFile, { ...decoded, tableCount: decoded.tableCount - 1 }, BUILD)[0],
      /table count/,
    );
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test("inventory identity is checked against decoded and indexed table counts", () => {
  const files = fixture();
  try {
    const decoded = decodedSemanticIdentity(files.decodedDir);
    const inventoryIdentity = inventorySemanticIdentity(files.inventoryFile);
    const inventory = { ...inventoryIdentity, repositoryCopy: { ...inventoryIdentity } };
    assert.deepEqual(validateInventoryIdentity(inventory, { build: BUILD, decoded, indexedTableCount: 10 }), []);
    assert.match(validateInventoryIdentity(inventory, { build: BUILD, decoded, indexedTableCount: 11 })[0], /game_tables/);
    assert.match(
      validateInventoryIdentity({ ...inventory, semanticSha256: "0".repeat(64) }, { build: BUILD, decoded, indexedTableCount: 10 })[0],
      /semantic hash/,
    );
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test("receipt requires successful warehouse and inventory stages with unchanged outputs", () => {
  const files = fixture();
  try {
    const warehouse = warehouseSemanticIdentity(files.dbFile);
    const inventoryIdentity = inventorySemanticIdentity(files.inventoryFile);
    const inventory = { ...inventoryIdentity, repositoryCopy: { ...inventoryIdentity } };
    const fileIdentity = (name, hash) => ({ exists: true, path: path.join(files.root, name), sha256: hash.repeat(64) });
    const inputs = {
      decodedTables: decodedSemanticIdentity(files.decodedDir),
      decodedBaseline: fileIdentity("baseline.json", "2"),
      localization: fileIdentity("en.csv", "3"),
      texturePaths: { exists: true, path: path.join(files.root, "textures"), fileCount: 0, pathSetSha256: "4".repeat(64) },
      questlogEquipment: fileIdentity("equipment.json", "5"),
      questlogSkills: fileIdentity("skills.json", "6"),
      gameTablesIndex: fileIdentity("game_tables.csv", "7"),
    };
    const report = {
      startedAtUtc: "2026-07-14T00:00:00.000Z",
      finishedAtUtc: "2026-07-14T00:01:00.000Z",
      mode: "run",
      status: "passed",
      reportPath: "D:/TL_Data/reports/999/update-runs/run.json",
      generator: generatorIdentity(),
      stages: [
        { name: "warehouse", status: "passed", afterIdentity: warehouse },
        { name: "inventory", status: "passed", afterIdentity: inventory },
      ],
      dataBuildInputs: inputs,
    };
    const currentGenerator = generatorIdentity();
    const receipt = buildDataBuildReceipt({
      repoRoot: files.root,
      context: { build: BUILD },
      report,
      inputs,
      outputs: { warehouse, inventory },
      currentGenerator,
    });
    assert.equal(receipt.schema, DATA_BUILD_RECEIPT_SCHEMA);
    assert.equal(receipt.gameBuild, BUILD);
    assert.equal(receipt.schemaPath, "schemas/data-build-receipt.schema.json");
    assert.deepEqual(receipt.generator, report.generator);
    assert.throws(
      () => validateDataBuildReceipt({ ...receipt, unreviewed: true }),
      /JSON Schema.*unreviewed is not allowed/,
    );
    assert.equal(receiptPath(files.root, BUILD), path.join(files.root, "data-build-receipts", "999.json"));
    assert.throws(() => buildDataBuildReceipt({
      repoRoot: files.root,
      context: { build: BUILD },
      report: { ...report, stages: report.stages.slice(0, 1) },
      inputs,
      outputs: { warehouse, inventory },
      currentGenerator,
    }), /inventory did not pass/);
    assert.throws(() => buildDataBuildReceipt({
      repoRoot: files.root,
      context: { build: BUILD },
      report,
      inputs,
      outputs: { warehouse: { ...warehouse, recordCount: 0 }, inventory },
      currentGenerator,
    }), /differ/);
    assert.throws(() => buildDataBuildReceipt({
      repoRoot: files.root,
      context: { build: BUILD },
      report,
      inputs: { ...inputs, gameTablesIndex: { exists: true, sha256: "changed" } },
      outputs: { warehouse, inventory },
      currentGenerator,
    }), /inputs differ/);
    assert.throws(() => buildDataBuildReceipt({
      repoRoot: files.root,
      context: { build: BUILD },
      report: { ...report, generator: { ...report.generator, worktreeDirty: true } },
      inputs,
      outputs: { warehouse, inventory },
      currentGenerator,
    }), /clean generator worktree/);
    assert.throws(() => buildDataBuildReceipt({
      repoRoot: files.root,
      context: { build: BUILD },
      report: { ...report, generator: undefined },
      inputs,
      outputs: { warehouse, inventory },
      currentGenerator,
    }), /without generator provenance/);
    assert.throws(() => buildDataBuildReceipt({
      repoRoot: files.root,
      context: { build: BUILD },
      report,
      inputs,
      outputs: { warehouse, inventory },
      currentGenerator: generatorIdentity({ gitCommit: "b".repeat(40) }),
    }), /Git commit differs/);

    const db = new DatabaseSync(files.dbFile);
    db.prepare("UPDATE records SET raw_json='corrupt' WHERE record_id='TableA:0'").run();
    db.close();
    const corruptedWarehouse = warehouseSemanticIdentity(files.dbFile);
    assert.match(
      validateWarehouseIdentity(corruptedWarehouse, { build: BUILD, decoded: inputs.decodedTables }).join("; "),
      /records semantic hash does not match current database content/,
    );
    assert.throws(() => buildDataBuildReceipt({
      repoRoot: files.root,
      context: { build: BUILD },
      report,
      inputs,
      outputs: { warehouse: corruptedWarehouse, inventory },
      currentGenerator,
    }), /warehouse core semantics differ/);
  } finally { rmSync(files.root, { recursive: true, force: true }); }
});

test("generator provenance rejects tampered source identities", () => {
  const generator = generatorIdentity();
  assert.equal(assertDataGeneratorIdentity(generator), generator);
  assert.throws(
    () => assertDataGeneratorIdentity({ ...generator, sourceSetSha256: "0".repeat(64) }),
    /source-set hash/,
  );
  assert.throws(
    () => assertDataGeneratorIdentity(generator, generatorIdentity({
      files: [{ path: "scripts/other.mjs", sha256: "2".repeat(64) }],
    })),
    /files differ/,
  );
  assert.throws(
    () => assertDataGeneratorIdentity(generator, generatorIdentity({ nodeVersion: "v99.0.0" })),
    /Node.js version differs/,
  );
  const generatedOnly = generatorIdentity({
    worktreeDirty: true,
    dirtyPaths: ["out/coverage-audit/table-inventory.json"],
  });
  assert.equal(
    assertOnlyAuthorizedGeneratorChanges(generatedOnly, ["out/coverage-audit/"]),
    generatedOnly,
  );
  assert.throws(
    () => assertOnlyAuthorizedGeneratorChanges(
      generatorIdentity({ worktreeDirty: true, dirtyPaths: ["scripts/lib/hidden-dependency.mjs"] }),
      ["out/coverage-audit/"],
    ),
    /outside authorized data outputs/,
  );
});

test("checked-in receipt schema is valid JSON and pins the contract identifiers", () => {
  const schema = JSON.parse(readFileSync(path.resolve("schemas/data-build-receipt.schema.json"), "utf8"));
  assert.equal(schema.properties.schema.const, DATA_BUILD_RECEIPT_SCHEMA);
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.equal(schema.properties.schemaPath.const, "schemas/data-build-receipt.schema.json");
});
