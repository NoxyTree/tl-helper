import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildTableInventoryFiles,
  createTableInventory,
  loadValidatedInventoryInputs,
  validateInventory,
} from "../build-table-inventory.mjs";

const BUILD = "12345";

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value)}\n`, "utf8");
}

function fixture(directory) {
  const extractRoot = path.join(directory, "extract");
  const decodedDir = path.join(directory, "decoded");
  const outFull = path.join(directory, "reports", BUILD, "table-inventory.json");
  const outRepo = path.join(directory, "repo", "out", "coverage-audit", "table-inventory.json");
  mkdirSync(path.join(extractRoot, "indexes"), { recursive: true });
  mkdirSync(decodedDir, { recursive: true });
  writeFileSync(path.join(extractRoot, "indexes", "game_tables.csv"), [
    '"Table","RelativePath","JsonBytes","RawPackagePresent","RawPackageBytes","RowStructObjectName","RowStructObjectPath","JsonStatus","PayloadStatus"',
    '"TLItemStats","data\\TLItemStats.json","100","True","200","Class\'TLJsonItemStats\'","/Script/TLScheme","ok","schema_json_plus_raw_payload"',
    '"TLStringItemStats","data\\TLStringItemStats.json","50","True","75",,,"ok","schema_json_plus_raw_payload"',
    "",
  ].join("\r\n"), "utf8");
  writeJson(path.join(decodedDir, "TLItemStats.json"), {
    table: "TLItemStats",
    gameBuild: BUILD,
    sourcePath: "D:/source/TLItemStats.uasset",
    sha256: "a".repeat(64),
    decoderVersion: "0.2.0",
    declaredRowCount: 2,
    decodedRowCount: 2,
    unsupportedTypes: [],
    warnings: [],
    trailingBytes: 0,
    rows: {
      one: { Target: { RowName: "Referenced" } },
      two: { Target: { RowName: "None" } },
    },
  });
  writeJson(path.join(decodedDir, "TLStringItemStats.json"), {
    table: "TLStringItemStats",
    gameBuild: BUILD,
    sourcePath: "D:/source/TLStringItemStats.uasset",
    sha256: "b".repeat(64),
    decoderVersion: "0.1.0",
    declaredRowCount: 1,
    decodedRowCount: 1,
    unsupportedTypes: ["SoftObjectPath"],
    warnings: [],
    trailingBytes: 0,
    rows: { label: { Text: "Example" } },
  });
  return { build: BUILD, dataRoot: directory, extractRoot, decodedDir, outFull, outRepo };
}

function publicationArtifacts(directory) {
  const found = [];
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(tmp|bak)$/.test(entry.name)) found.push(file);
    }
  }
  visit(directory);
  return found;
}

test("validates all inputs and publishes byte-identical inventory copies", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "tl-table-inventory-"));
  try {
    const files = fixture(directory);
    const { inventory, outputs } = buildTableInventoryFiles({
      ...files,
      generatedAtUtc: "2026-07-14T10:00:00.000Z",
    });
    const full = readFileSync(files.outFull, "utf8");
    const repo = readFileSync(files.outRepo, "utf8");
    assert.equal(full, repo);
    assert.deepEqual(outputs, [path.resolve(files.outFull), path.resolve(files.outRepo)]);
    assert.deepEqual(inventory.totals, {
      tables: 2,
      families: 1,
      decodedTables: 2,
      decodedRows: 3,
      rawBytesAll: 275,
    });
    assert.equal(inventory.decoderVersion, "mixed");
    assert.deepEqual(inventory.decoderVersions, ["0.1.0", "0.2.0"]);
    assert.match(inventory.semanticIdentity.sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(JSON.parse(full), inventory);
    assert.deepEqual(publicationArtifacts(directory), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("semantic identity excludes generation time but includes inventory meaning", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "tl-table-inventory-"));
  try {
    const files = fixture(directory);
    const inputs = loadValidatedInventoryInputs(files);
    const first = createTableInventory({ ...inputs, build: BUILD, generatedAtUtc: "2026-07-14T10:00:00.000Z" });
    const second = createTableInventory({ ...inputs, build: BUILD, generatedAtUtc: "2026-07-14T11:00:00.000Z" });
    const reordered = createTableInventory({
      ...inputs,
      tableRows: [...inputs.tableRows].reverse(),
      build: BUILD,
      generatedAtUtc: first.generatedAtUtc,
    });
    assert.notEqual(first.generatedAtUtc, second.generatedAtUtc);
    assert.equal(first.semanticIdentity.sha256, second.semanticIdentity.sha256);
    assert.equal(first.semanticIdentity.sha256, reordered.semanticIdentity.sha256);

    const changed = createTableInventory({
      tableRows: inputs.tableRows.map((table) => table.table === "TLItemStats" ? { ...table, rawBytes: table.rawBytes + 1 } : table),
      decoded: inputs.decoded,
      build: BUILD,
      generatedAtUtc: first.generatedAtUtc,
    });
    assert.notEqual(first.semanticIdentity.sha256, changed.semanticIdentity.sha256);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("semantic identity exclusion metadata cannot be tampered with", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "tl-table-inventory-"));
  try {
    const files = fixture(directory);
    const inputs = loadValidatedInventoryInputs(files);
    const inventory = createTableInventory({
      ...inputs,
      build: BUILD,
      generatedAtUtc: "2026-07-14T10:00:00.000Z",
    });
    inventory.semanticIdentity.excludes = ["semanticIdentity", "generatedAtUtc"];
    assert.throws(
      () => validateInventory(inventory),
      /semantic identity exclusions are invalid/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an invalid decoded input leaves both existing outputs untouched", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "tl-table-inventory-"));
  try {
    const files = fixture(directory);
    mkdirSync(path.dirname(files.outFull), { recursive: true });
    mkdirSync(path.dirname(files.outRepo), { recursive: true });
    writeFileSync(files.outFull, "external-before\n", "utf8");
    writeFileSync(files.outRepo, "repo-before\n", "utf8");
    const invalidFile = path.join(files.decodedDir, "TLStringItemStats.json");
    const invalid = JSON.parse(readFileSync(invalidFile, "utf8"));
    invalid.decodedRowCount = 99;
    writeJson(invalidFile, invalid);

    assert.throws(() => buildTableInventoryFiles(files), /decodedRowCount 99 does not match 1 rows/);
    assert.equal(readFileSync(files.outFull, "utf8"), "external-before\n");
    assert.equal(readFileSync(files.outRepo, "utf8"), "repo-before\n");
    assert.deepEqual(publicationArtifacts(directory), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an invalid table index is rejected before either output is touched", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "tl-table-inventory-"));
  try {
    const files = fixture(directory);
    mkdirSync(path.dirname(files.outFull), { recursive: true });
    mkdirSync(path.dirname(files.outRepo), { recursive: true });
    writeFileSync(files.outFull, "external-before\n", "utf8");
    writeFileSync(files.outRepo, "repo-before\n", "utf8");
    const indexFile = path.join(files.extractRoot, "indexes", "game_tables.csv");
    writeFileSync(indexFile, [
      '"Table","RelativePath","JsonBytes","RawPackageBytes","RowStructObjectName"',
      '"TLItemStats","one.json","100","200","Class\'TLJsonItemStats\'"',
      '"TLItemStats","two.json","100","200","Class\'TLJsonItemStats\'"',
    ].join("\n"), "utf8");

    assert.throws(() => buildTableInventoryFiles(files), /duplicates table TLItemStats/);
    assert.equal(readFileSync(files.outFull, "utf8"), "external-before\n");
    assert.equal(readFileSync(files.outRepo, "utf8"), "repo-before\n");
    assert.deepEqual(publicationArtifacts(directory), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a second-target promotion failure rolls the first target back", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "tl-table-inventory-"));
  try {
    const files = fixture(directory);
    mkdirSync(path.dirname(files.outFull), { recursive: true });
    mkdirSync(path.dirname(files.outRepo), { recursive: true });
    writeFileSync(files.outFull, "external-before\n", "utf8");
    writeFileSync(files.outRepo, "repo-before\n", "utf8");
    const repoTarget = path.resolve(files.outRepo);
    const operations = {
      renameSync(source, destination) {
        if (destination === repoTarget && source.endsWith(".tmp")) throw new Error("simulated second promotion failure");
        return renameSync(source, destination);
      },
    };

    assert.throws(
      () => buildTableInventoryFiles({ ...files, operations }),
      /simulated second promotion failure/,
    );
    assert.equal(readFileSync(files.outFull, "utf8"), "external-before\n");
    assert.equal(readFileSync(files.outRepo, "utf8"), "repo-before\n");
    assert.deepEqual(publicationArtifacts(directory), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
