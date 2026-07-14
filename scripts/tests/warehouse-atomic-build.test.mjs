import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  assertWalCheckpointComplete,
  buildWarehouse,
  parseWarehouseArgs,
  promoteDatabaseAtomic,
  validateWarehouseInputs,
  verifyWarehouseDatabase,
} from "../build-warehouse.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value), "utf8");
}

function makeFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "tl-warehouse-test-"));
  const build = "99999999";
  const dataRoot = path.join(root, "data");
  const extractRoot = path.join(dataRoot, "raw", build, "extracted");
  const decodedDir = path.join(dataRoot, "decoded", build, "tables");
  const questlogRoot = path.join(root, "questlog");
  const dbPath = path.join(dataRoot, "warehouse", `tl-${build}.sqlite`);
  const sourcePath = path.join(extractRoot, "data", "TLItemStats.uasset");
  const sourceBytes = Buffer.from("fixture-uasset", "utf8");
  mkdirSync(path.dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, sourceBytes);
  mkdirSync(path.join(extractRoot, "textures", "TL", "Content", "Image"), { recursive: true });
  writeFileSync(path.join(extractRoot, "textures", "TL", "Content", "Image", "item.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  mkdirSync(path.join(extractRoot, "localization", "csv"), { recursive: true });
  writeFileSync(
    path.join(extractRoot, "localization", "csv", "en.csv"),
    "Namespace,Key,Hash,Translation\nTLItemLooks_Equip,ITEM_ONE,,Item One\nTLStringSkillDesc,TEXT_SKILL_NAME_SKILL_ONE,,Skill One\n",
    "utf8",
  );
  const decodedPath = path.join(decodedDir, "TLItemStats.json");
  writeJson(decodedPath, {
    table: "TLItemStats",
    sourcePath,
    sha256: sha256(sourceBytes),
    gameBuild: build,
    decoderVersion: "test-decoder-1",
    declaredRowCount: 1,
    decodedRowCount: 1,
    unsupportedTypes: [],
    warnings: [],
    trailingBytes: 0,
    rows: {
      item_one: {
        UIName: { stringTable: "TLString.TLItemLooks_Equip", key: "ITEM_ONE" },
        IconPath: { assetPath: "/Game/Image/item.item" },
        Related: { RowName: "other_row" },
      },
    },
  });
  const zeroSourcePath = path.join(extractRoot, "data", "TLZeroTable.uasset");
  const zeroSourceBytes = Buffer.from("fixture-zero-uasset", "utf8");
  writeFileSync(zeroSourcePath, zeroSourceBytes);
  writeJson(path.join(decodedDir, "TLZeroTable.json"), {
    table: "TLZeroTable",
    sourcePath: zeroSourcePath,
    sha256: sha256(zeroSourceBytes),
    gameBuild: build,
    decoderVersion: "test-decoder-1",
    declaredRowCount: 0,
    decodedRowCount: 0,
    unsupportedTypes: [],
    warnings: [],
    trailingBytes: 0,
    rows: {},
  });
  const decodedBaselinePath = path.join(root, "data-build-baseline.json");
  const decodedArtifacts = readdirSync(decodedDir).filter((name) => name.endsWith(".json")).map((name) => {
    const file = path.join(decodedDir, name);
    const bytes = readFileSync(file);
    const parsed = JSON.parse(bytes.toString("utf8"));
    return { ...parsed, artifactSha256: sha256(bytes) };
  }).sort((left, right) => left.table.localeCompare(right.table));
  const aggregate = (rows) => sha256(Buffer.from(rows.map((row) => JSON.stringify(row)).join("\n"), "utf8"));
  writeJson(decodedBaselinePath, {
    schema: "tl-helper.decoded-data-baseline",
    schemaVersion: 1,
    gameBuild: build,
    tableCount: decodedArtifacts.length,
    rowCount: decodedArtifacts.reduce((sum, table) => sum + table.decodedRowCount, 0),
    decoderVersions: [...new Set(decodedArtifacts.map((table) => table.decoderVersion))].sort(),
    sourceSetSha256: aggregate(decodedArtifacts.map((table) => ({ table: table.table, decodedRows: table.decodedRowCount, sourceSha256: table.sha256 }))),
    artifactSetSha256: aggregate(decodedArtifacts.map((table) => ({ table: table.table, artifactSha256: table.artifactSha256 }))),
  });
  writeJson(path.join(questlogRoot, "characterBuilder.getEquipmentItems.json"), [
    { result: { data: { json: [{ id: "item_one" }] } } },
  ]);
  writeJson(path.join(questlogRoot, "skillBuilder.getSkillSets.json"), [
    { result: { data: { json: [{ id: "SkillSet_SKILL_ONE", specializations: {} }] } } },
  ]);
  return {
    root,
    options: { build, dataRoot, extractRoot, decodedDir, decodedBaselinePath, questlogRoot, dbPath, gameVersion: "test-version" },
    decodedPath,
    dbPath,
  };
}

function cleanup(fixture) {
  rmSync(fixture.root, { recursive: true, force: true });
}

test("warehouse validates all inputs, verifies the temp database, and promotes it", () => {
  const fixture = makeFixture();
  try {
    const validated = validateWarehouseInputs(fixture.options);
    assert.equal(validated.tables.length, 2);
    assert.equal(validated.decodedRows, 1);
    assert.match(validated.provenance.sourceManifestSha256, /^[0-9a-f]{64}$/);

    const result = buildWarehouse(fixture.options);
    assert.equal(result.records, 1);
    assert.equal(result.refs, 1);
    assert.equal(result.assets, 1);
    assert.equal(result.verification.integrity, "ok");
    assert.equal(result.verification.ftsRecords, 1);
    assert.equal(result.verification.tables, 2);
    assert.deepEqual(Object.keys(result.verification.semanticHashes).sort(), ["assets", "decodedTables", "fts", "records", "refs"]);
    assert.equal(result.sourceManifestSha256, validated.provenance.sourceManifestSha256);
    assert.equal(existsSync(`${fixture.dbPath}-wal`), false);
    assert.equal(existsSync(`${fixture.dbPath}-shm`), false);
    const modeDb = new DatabaseSync(fixture.dbPath, { readOnly: true });
    try { assert.equal(String(modeDb.prepare("PRAGMA journal_mode").get().journal_mode).toLowerCase(), "delete"); }
    finally { modeDb.close(); }
    const replacementResult = buildWarehouse(fixture.options);
    assert.equal(replacementResult.records, 1);
    assert.equal(readdirSync(path.dirname(fixture.dbPath)).some((name) => name.includes(".backup-")), false);

    const db = new DatabaseSync(fixture.dbPath, { readOnly: true });
    try {
      const tableCount = db.prepare("SELECT table_name, COUNT(*) AS count FROM records GROUP BY table_name").get();
      assert.equal(tableCount.table_name, "TLItemStats");
      assert.equal(tableCount.count, 1);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM records_fts").get().count, 1);
      assert.deepEqual(
        db.prepare("SELECT table_name, row_count FROM decoded_tables ORDER BY table_name").all().map((row) => [row.table_name, row.row_count]),
        [["TLItemStats", 1], ["TLZeroTable", 0]],
      );
      assert.equal(db.prepare("SELECT value FROM meta WHERE key='game_build'").get().value, fixture.options.build);
      assert.equal(db.prepare("SELECT value FROM meta WHERE key='source_manifest_sha256'").get().value, validated.provenance.sourceManifestSha256);
    } finally {
      db.close();
    }
    assert.deepEqual(readdirSync(path.dirname(fixture.dbPath)).filter((name) => name.includes(".tmp")), []);
  } finally {
    cleanup(fixture);
  }
});

test("input validation failure leaves an existing canonical database byte-for-byte unchanged", () => {
  const fixture = makeFixture();
  try {
    mkdirSync(path.dirname(fixture.dbPath), { recursive: true });
    const prior = Buffer.from("prior-canonical-database", "utf8");
    writeFileSync(fixture.dbPath, prior);
    const decoded = JSON.parse(readFileSync(fixture.decodedPath, "utf8"));
    decoded.decodedRowCount = 2;
    writeJson(fixture.decodedPath, decoded);

    assert.throws(
      () => buildWarehouse(fixture.options),
      /declared 1 rows but decoded 2/,
    );
    assert.deepEqual(readFileSync(fixture.dbPath), prior);
    assert.deepEqual(readdirSync(path.dirname(fixture.dbPath)), [path.basename(fixture.dbPath)]);
  } finally {
    cleanup(fixture);
  }
});

test("failed post-promotion verification restores the prior canonical database", () => {
  const fixture = makeFixture();
  try {
    mkdirSync(path.dirname(fixture.dbPath), { recursive: true });
    const prior = Buffer.from("verified-prior", "utf8");
    const replacement = Buffer.from("unverified-replacement", "utf8");
    writeFileSync(fixture.dbPath, prior);
    const tempPath = path.join(path.dirname(fixture.dbPath), ".replacement.tmp");
    writeFileSync(tempPath, replacement);
    let canonicalExistedAtReplacement = false;

    assert.throws(
      () => promoteDatabaseAtomic(
        tempPath,
        fixture.dbPath,
        () => { throw new Error("verification rejected replacement"); },
        {
          renameSync(source, destination) {
            if (source === tempPath && destination === fixture.dbPath) canonicalExistedAtReplacement = existsSync(fixture.dbPath);
            return renameSync(source, destination);
          },
        },
      ),
      /prior database restored/,
    );
    assert.equal(canonicalExistedAtReplacement, true);
    assert.deepEqual(readFileSync(fixture.dbPath), prior);
    assert.equal(readdirSync(path.dirname(fixture.dbPath)).some((name) => name.includes("backup-")), false);
  } finally {
    cleanup(fixture);
  }
});

test("promotion refuses a non-quiescent canonical SQLite family without touching it", () => {
  const fixture = makeFixture();
  try {
    mkdirSync(path.dirname(fixture.dbPath), { recursive: true });
    const prior = Buffer.from("verified-prior", "utf8");
    const wal = Buffer.from("active-wal", "utf8");
    writeFileSync(fixture.dbPath, prior);
    writeFileSync(`${fixture.dbPath}-wal`, wal);
    const tempPath = path.join(path.dirname(fixture.dbPath), ".replacement.tmp");
    writeFileSync(tempPath, "replacement", "utf8");
    assert.throws(() => promoteDatabaseAtomic(tempPath, fixture.dbPath), /not quiescent/);
    assert.deepEqual(readFileSync(fixture.dbPath), prior);
    assert.deepEqual(readFileSync(`${fixture.dbPath}-wal`), wal);
    assert.equal(readFileSync(tempPath, "utf8"), "replacement");
  } finally {
    cleanup(fixture);
  }
});

test("incomplete rollback preserves recovery artifacts and reports their paths", () => {
  const fixture = makeFixture();
  try {
    mkdirSync(path.dirname(fixture.dbPath), { recursive: true });
    writeFileSync(fixture.dbPath, "prior", "utf8");
    const tempPath = path.join(path.dirname(fixture.dbPath), ".replacement.tmp");
    writeFileSync(tempPath, "replacement", "utf8");
    assert.throws(
      () => promoteDatabaseAtomic(
        tempPath,
        fixture.dbPath,
        () => { throw new Error("verification failed"); },
        {
          renameSync(source, destination) {
            if (source.includes(".backup-") && destination === fixture.dbPath) throw new Error("simulated restore failure");
            return renameSync(source, destination);
          },
        },
      ),
      (error) => error instanceof AggregateError && /rollback was incomplete/.test(error.message) && /backup=/.test(error.message),
    );
    assert.equal(readFileSync(fixture.dbPath, "utf8"), "replacement");
    const recoveryFiles = readdirSync(path.dirname(fixture.dbPath)).filter((name) => name.includes(".backup-"));
    const backups = recoveryFiles.filter((name) => !name.endsWith(".restore.tmp"));
    assert.equal(backups.length, 1);
    assert.equal(readFileSync(path.join(path.dirname(fixture.dbPath), backups[0]), "utf8"), "prior");
    assert.equal(recoveryFiles.some((name) => name.endsWith(".restore.tmp")), true);
  } finally {
    cleanup(fixture);
  }
});

test("semantic verification detects corruption in records, refs, assets, and every FTS tuple", async (t) => {
  const corruptions = [
    ["records", "UPDATE records SET raw_json='{}'"],
    ["refs", "UPDATE refs SET field='corrupt'"],
    ["assets", "UPDATE assets SET original_path='corrupt'"],
    ["fts", "UPDATE records_fts SET name_loc='corrupt'"],
  ];
  for (const [surface, sql] of corruptions) {
    await t.test(surface, () => {
      const fixture = makeFixture();
      try {
        const validated = validateWarehouseInputs(fixture.options);
        const result = buildWarehouse(fixture.options);
        const db = new DatabaseSync(fixture.dbPath);
        try { db.exec(sql); } finally { db.close(); }
        assert.throws(
          () => verifyWarehouseDatabase(fixture.dbPath, validated, result.verification.semanticHashes),
          new RegExp(`warehouse ${surface} semantic hash`),
        );
      } finally {
        cleanup(fixture);
      }
    });
  }
});

test("WAL checkpoint acceptance requires a non-busy zero-frame result", () => {
  assert.deepEqual(assertWalCheckpointComplete({ busy: 0, log: 0, checkpointed: 0 }), { busy: 0, log: 0, checkpointed: 0 });
  assert.throws(() => assertWalCheckpointComplete({ busy: 1, log: 0, checkpointed: 0 }), /remained busy/);
  assert.throws(() => assertWalCheckpointComplete({ busy: 0, log: 1, checkpointed: 1 }), /left frames behind/);
});

test("reviewed decoded baseline mismatch is rejected before canonical output is touched", () => {
  const fixture = makeFixture();
  try {
    mkdirSync(path.dirname(fixture.dbPath), { recursive: true });
    writeFileSync(fixture.dbPath, "prior", "utf8");
    const baseline = JSON.parse(readFileSync(fixture.options.decodedBaselinePath, "utf8"));
    baseline.rowCount++;
    writeJson(fixture.options.decodedBaselinePath, baseline);
    assert.throws(() => buildWarehouse(fixture.options), /does not match reviewed baseline/);
    assert.equal(readFileSync(fixture.dbPath, "utf8"), "prior");
    assert.deepEqual(readdirSync(path.dirname(fixture.dbPath)), [path.basename(fixture.dbPath)]);
  } finally {
    cleanup(fixture);
  }
});

test("malformed localization schema is rejected before canonical output is touched", () => {
  const fixture = makeFixture();
  try {
    mkdirSync(path.dirname(fixture.dbPath), { recursive: true });
    writeFileSync(fixture.dbPath, "prior", "utf8");
    writeFileSync(
      path.join(fixture.options.extractRoot, "localization", "csv", "en.csv"),
      "namespace,key,hash,text\nTLItemLooks_Equip,ITEM_ONE,,Item One\n",
      "utf8",
    );
    assert.throws(() => buildWarehouse(fixture.options), /missing headers Namespace, Key, Hash, Translation/);
    assert.equal(readFileSync(fixture.dbPath, "utf8"), "prior");
  } finally {
    cleanup(fixture);
  }
});

test("warehouse CLI accepts an explicit Questlog root", () => {
  assert.deepEqual(
    parseWarehouseArgs(["--build", "123", "--data-root=D:/data", "--questlog-root", "D:/snapshots", "--decoded-baseline", "D:/baseline.json"]),
    { build: "123", dataRoot: "D:/data", questlogRoot: "D:/snapshots", decodedBaselinePath: "D:/baseline.json" },
  );
  assert.throws(() => parseWarehouseArgs(["--questlog-root"]), /missing value/);
  assert.throws(() => parseWarehouseArgs(["--unknown", "x"]), /unknown argument/);
});

test("warehouse verification never joins records directly against unindexed FTS text", () => {
  const source = readFileSync(path.resolve("scripts/build-warehouse.mjs"), "utf8");
  assert.doesNotMatch(source, /JOIN\s+records_fts\b/i);
});
