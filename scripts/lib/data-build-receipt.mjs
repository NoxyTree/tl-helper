import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { inventorySemanticIdentity as computeInventorySemanticSha256 } from "../build-table-inventory.mjs";
import { databaseSemanticHashes } from "../build-warehouse.mjs";
import { assertJsonSchema } from "./json-schema-validator.mjs";

export const DATA_BUILD_RECEIPT_SCHEMA = "tl-helper.data-build-receipt";
export const DATA_BUILD_RECEIPT_SCHEMA_VERSION = 1;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RECEIPT_SCHEMA_FILE = path.join(REPO_ROOT, "schemas", "data-build-receipt.schema.json");
const DECODED_BASELINE_SCHEMA_FILE = path.join(REPO_ROOT, "schemas", "decoded-data-baseline.schema.json");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function generatorSourceSetSha256(files) {
  return sha256(files.map((file) => JSON.stringify(file)).join("\n"));
}

export function assertDataGeneratorIdentity(recorded, current = null) {
  if (!recorded || typeof recorded !== "object" || Array.isArray(recorded)) {
    throw new Error("Cannot issue a data build receipt without generator provenance");
  }
  if (!/^[a-f0-9]{40,64}$/.test(recorded.gitCommit ?? "")) {
    throw new Error("Data generator Git commit is missing or invalid");
  }
  if (recorded.worktreeDirty !== false) {
    throw new Error("Data build receipts require a clean generator worktree at run start");
  }
  if (!Array.isArray(recorded.dirtyPaths) || recorded.dirtyPaths.length !== 0) {
    throw new Error("Data build receipts require an empty run-start dirty-path set");
  }
  if (typeof recorded.nodeVersion !== "string" || !/^v\d+/.test(recorded.nodeVersion)) {
    throw new Error("Data generator Node.js version is missing or invalid");
  }
  if (!Array.isArray(recorded.files) || recorded.files.length === 0) {
    throw new Error("Data generator file identities are missing");
  }
  const seen = new Set();
  for (const file of recorded.files) {
    if (!file || typeof file.path !== "string" || !file.path || file.path.includes("\\")) {
      throw new Error("Data generator file path is missing or non-canonical");
    }
    if (seen.has(file.path)) throw new Error(`Duplicate data generator file identity: ${file.path}`);
    seen.add(file.path);
    if (!/^[a-f0-9]{64}$/.test(file.sha256 ?? "")) {
      throw new Error(`Data generator file hash is missing or invalid: ${file.path}`);
    }
  }
  if (recorded.sourceSetSha256 !== generatorSourceSetSha256(recorded.files)) {
    throw new Error("Data generator source-set hash does not match its file identities");
  }
  if (current) {
    if (current.gitCommit !== recorded.gitCommit) {
      throw new Error("Current generator Git commit differs from the successful run");
    }
    if (current.nodeVersion !== recorded.nodeVersion) {
      throw new Error("Current generator Node.js version differs from the successful run");
    }
    if (current.sourceSetSha256 !== recorded.sourceSetSha256
      || JSON.stringify(current.files) !== JSON.stringify(recorded.files)) {
      throw new Error("Current generator files differ from the successful run");
    }
  }
  return recorded;
}

function dirtyPathAllowed(dirtyPath, allowedPaths) {
  return allowedPaths.some((allowed) => {
    const normalized = String(allowed).replaceAll("\\", "/").replace(/^\.\//, "");
    return normalized.endsWith("/") ? dirtyPath.startsWith(normalized) : dirtyPath === normalized;
  });
}

export function assertOnlyAuthorizedGeneratorChanges(current, allowedPaths = []) {
  if (!current || !Array.isArray(current.dirtyPaths)) {
    throw new Error("Current generator dirty-path identity is missing");
  }
  if (current.worktreeDirty !== (current.dirtyPaths.length > 0)) {
    throw new Error("Current generator dirty-state summary is inconsistent");
  }
  const unauthorized = current.dirtyPaths.filter((dirtyPath) => !dirtyPathAllowed(dirtyPath, allowedPaths));
  if (unauthorized.length) {
    throw new Error(`Generator worktree changed outside authorized data outputs: ${unauthorized.join(", ")}`);
  }
  return current;
}

export function fileSha256(file) {
  return sha256(readFileSync(file));
}

function aggregateIdentity(rows) {
  return sha256(rows.map((row) => JSON.stringify(row)).join("\n"));
}

export function decodedSemanticIdentity(decodedDir) {
  if (!existsSync(decodedDir)) return { exists: false, path: decodedDir };
  const tables = readdirSync(decodedDir).filter((name) => name.endsWith(".json")).sort().map((name) => {
    const file = path.join(decodedDir, name);
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return {
      table: String(parsed.table ?? ""),
      decodedRows: Number(parsed.decodedRowCount ?? Object.keys(parsed.rows ?? {}).length),
      sourceSha256: String(parsed.sha256 ?? ""),
      decoderVersion: String(parsed.decoderVersion ?? ""),
      artifactSha256: fileSha256(file),
    };
  }).sort((left, right) => left.table.localeCompare(right.table));
  return {
    exists: true,
    path: decodedDir,
    tableCount: tables.length,
    rowCount: tables.reduce((sum, row) => sum + row.decodedRows, 0),
    decoderVersions: [...new Set(tables.map((row) => row.decoderVersion).filter(Boolean))].sort(),
    sourceSetSha256: aggregateIdentity(tables.map(({ table, decodedRows, sourceSha256 }) => ({ table, decodedRows, sourceSha256 }))),
    artifactSetSha256: aggregateIdentity(tables.map(({ table, artifactSha256 }) => ({ table, artifactSha256 }))),
  };
}

export function validateDecodedBaseline(file, identity, build) {
  if (!existsSync(file)) return [`Reviewed decoded-data baseline does not exist: ${file}`];
  let baseline;
  try { baseline = JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { return [`Reviewed decoded-data baseline is invalid JSON: ${error.message}`]; }
  const errors = [];
  try {
    const schema = JSON.parse(readFileSync(DECODED_BASELINE_SCHEMA_FILE, "utf8"));
    assertJsonSchema(baseline, schema, "Reviewed decoded-data baseline");
  } catch (error) { errors.push(error.message); }
  if (String(baseline?.gameBuild ?? "") !== String(build)) errors.push("Reviewed decoded-data baseline has the wrong game build");
  if (!identity?.exists) return [...errors, "Decoded source identity is unavailable"];
  const checks = [
    ["tableCount", "table count"],
    ["rowCount", "row count"],
    ["sourceSetSha256", "source-set hash"],
    ["artifactSetSha256", "artifact-set hash"],
  ];
  for (const [key, label] of checks) {
    if (baseline?.[key] !== identity[key]) errors.push(`Decoded ${label} differs from the reviewed baseline`);
  }
  if (JSON.stringify(baseline?.decoderVersions) !== JSON.stringify(identity.decoderVersions)) {
    errors.push("Decoded decoder-version set differs from the reviewed baseline");
  }
  return errors;
}

export function pathSetIdentity(root, extension = null) {
  if (!existsSync(root)) return { exists: false, path: root };
  const paths = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!extension || entry.name.toLowerCase().endsWith(extension)) {
        paths.push(path.relative(root, full).replace(/\\/g, "/"));
      }
    }
  };
  walk(root);
  paths.sort();
  return { exists: true, path: root, fileCount: paths.length, pathSetSha256: sha256(paths.join("\n")) };
}

export function warehouseSemanticIdentity(file) {
  if (!existsSync(file)) return { exists: false, path: file };
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const meta = Object.fromEntries(db.prepare("SELECT key, value FROM meta ORDER BY key").all().map((row) => [row.key, row.value]));
    const decodedManifestPresent = Boolean(db.prepare("SELECT 1 present FROM sqlite_master WHERE type='table' AND name='decoded_tables'").get()?.present);
    const sourceRows = decodedManifestPresent
      ? db.prepare(`
        SELECT table_name tableName, source_sha256 sourceSha256, row_count rowCount
        FROM decoded_tables ORDER BY table_name, source_sha256
      `).all()
      : db.prepare(`
        SELECT table_name tableName, source_sha256 sourceSha256, COUNT(*) rowCount
        FROM records GROUP BY table_name, source_sha256 ORDER BY table_name, source_sha256
      `).all();
    // decodedSemanticIdentity and the reviewed baseline intentionally use
    // localeCompare ordering. Reapply that contract after SQLite extraction;
    // SQLite BINARY order differs for names such as TLPC* and TLPc*.
    const normalizedSourceRows = sourceRows
      .map((row) => ({ table: row.tableName, decodedRows: Number(row.rowCount), sourceSha256: row.sourceSha256 }))
      .sort((left, right) => left.table.localeCompare(right.table));
    const integrityRows = db.prepare("PRAGMA integrity_check").all().map((row) => String(Object.values(row)[0]));
    const ftsPresent = Boolean(db.prepare("SELECT 1 present FROM sqlite_master WHERE name='records_fts'").get()?.present);
    const computedSemanticHashes = decodedManifestPresent && ftsPresent ? databaseSemanticHashes(db) : {};
    return {
      exists: true,
      path: file,
      sha256: fileSha256(file),
      bytes: statSync(file).size,
      gameBuild: String(meta.game_build ?? ""),
      gameVersion: String(meta.game_version ?? ""),
      contract: String(meta.contract ?? ""),
      integrity: integrityRows.length === 1 ? integrityRows[0] : integrityRows.join("; "),
      decodedManifestPresent,
      localizationSha256: String(meta.localization_sha256 ?? ""),
      texturePathSetSha256: String(meta.texture_index_sha256 ?? ""),
      questlogEquipmentSha256: String(meta.questlog_equipment_sha256 ?? ""),
      questlogSkillsSha256: String(meta.questlog_skills_sha256 ?? ""),
      decodedBaselineSha256: String(meta.decoded_baseline_sha256 ?? ""),
      sourceManifestSha256: String(meta.source_manifest_sha256 ?? ""),
      semanticHashSchema: String(meta.semantic_hash_schema ?? ""),
      decodedTablesSemanticSha256: String(meta.decoded_tables_semantic_sha256 ?? ""),
      recordsSemanticSha256: String(meta.records_semantic_sha256 ?? ""),
      refsSemanticSha256: String(meta.refs_semantic_sha256 ?? ""),
      assetsSemanticSha256: String(meta.assets_semantic_sha256 ?? ""),
      ftsSemanticSha256: String(meta.fts_semantic_sha256 ?? ""),
      computedDecodedTablesSemanticSha256: String(computedSemanticHashes.decodedTables ?? ""),
      computedRecordsSemanticSha256: String(computedSemanticHashes.records ?? ""),
      computedRefsSemanticSha256: String(computedSemanticHashes.refs ?? ""),
      computedAssetsSemanticSha256: String(computedSemanticHashes.assets ?? ""),
      computedFtsSemanticSha256: String(computedSemanticHashes.fts ?? ""),
      tableCount: normalizedSourceRows.length,
      recordCount: Number(db.prepare("SELECT COUNT(*) count FROM records").get().count),
      ftsRecordCount: ftsPresent ? Number(db.prepare("SELECT COUNT(*) count FROM records_fts").get().count) : -1,
      refCount: Number(db.prepare("SELECT COUNT(*) count FROM refs").get().count),
      assetCount: Number(db.prepare("SELECT COUNT(*) count FROM assets").get().count),
      localizedRecordCount: Number(db.prepare("SELECT COUNT(*) count FROM records WHERE loc_state='resolved'").get().count),
      sourceSetSha256: aggregateIdentity(normalizedSourceRows),
    };
  } finally {
    db.close();
  }
}

export function inventorySemanticIdentity(file) {
  if (!existsSync(file)) return { exists: false, path: file };
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  const semanticExcludes = parsed.semanticIdentity?.excludes;
  return {
    exists: true,
    path: file,
    sha256: fileSha256(file),
    bytes: statSync(file).size,
    gameBuild: String(parsed.gameBuild ?? ""),
    decoderVersion: parsed.decoderVersion == null ? null : String(parsed.decoderVersion),
    tableCount: Number(parsed.totals?.tables ?? NaN),
    familyCount: Number(parsed.totals?.families ?? NaN),
    decodedTableCount: Number(parsed.totals?.decodedTables ?? NaN),
    decodedRowCount: Number(parsed.totals?.decodedRows ?? NaN),
    rawBytes: Number(parsed.totals?.rawBytesAll ?? NaN),
    semanticSha256: String(parsed.semanticIdentity?.sha256 ?? ""),
    computedSemanticSha256: computeInventorySemanticSha256(parsed),
    semanticExcludes: Array.isArray(semanticExcludes) ? [...semanticExcludes] : null,
  };
}

export function validateWarehouseIdentity(identity, {
  build, decoded, localizationSha256 = null, texturePathSetSha256 = null,
  questlogEquipmentSha256 = null, questlogSkillsSha256 = null, decodedBaselineSha256 = null,
}) {
  const errors = [];
  if (!identity?.exists) return ["Warehouse output does not exist"];
  if (identity.integrity !== "ok") errors.push(`Warehouse integrity check failed: ${identity.integrity || "<missing>"}`);
  if (!identity.decodedManifestPresent) errors.push("Warehouse has no decoded-table manifest");
  if (identity.gameBuild !== String(build)) errors.push(`Warehouse build ${identity.gameBuild || "<missing>"} does not match ${build}`);
  if (!decoded?.exists) errors.push("Decoded source identity is unavailable");
  else {
    if (identity.tableCount !== decoded.tableCount) errors.push(`Warehouse table count ${identity.tableCount} does not match decoded count ${decoded.tableCount}`);
    if (identity.recordCount !== decoded.rowCount) errors.push(`Warehouse record count ${identity.recordCount} does not match decoded row count ${decoded.rowCount}`);
    if (identity.sourceSetSha256 !== decoded.sourceSetSha256) errors.push("Warehouse source-table hash set does not match decoded inputs");
  }
  if (identity.ftsRecordCount !== identity.recordCount) errors.push("Warehouse FTS row count does not match records");
  if (identity.semanticHashSchema !== "length-prefixed-json-tuples-v1") errors.push("Warehouse semantic hash schema is missing or unsupported");
  for (const [key, label] of [
    ["decodedTablesSemanticSha256", "decoded table manifest"],
    ["recordsSemanticSha256", "records"],
    ["refsSemanticSha256", "references"],
    ["assetsSemanticSha256", "assets"],
    ["ftsSemanticSha256", "FTS"],
  ]) {
    if (!/^[a-f0-9]{64}$/.test(identity[key] ?? "")) errors.push(`Warehouse ${label} semantic hash is missing or invalid`);
  }
  for (const [storedKey, computedKey, label] of [
    ["decodedTablesSemanticSha256", "computedDecodedTablesSemanticSha256", "decoded table manifest"],
    ["recordsSemanticSha256", "computedRecordsSemanticSha256", "records"],
    ["refsSemanticSha256", "computedRefsSemanticSha256", "references"],
    ["assetsSemanticSha256", "computedAssetsSemanticSha256", "assets"],
    ["ftsSemanticSha256", "computedFtsSemanticSha256", "FTS"],
  ]) {
    if (identity[storedKey] !== identity[computedKey]) errors.push(`Warehouse ${label} semantic hash does not match current database content`);
  }
  if (localizationSha256 && identity.localizationSha256 !== localizationSha256) errors.push("Warehouse localization hash does not match its input");
  if (texturePathSetSha256 && identity.texturePathSetSha256 !== texturePathSetSha256) errors.push("Warehouse texture path-set hash does not match its input");
  if (questlogEquipmentSha256 && identity.questlogEquipmentSha256 !== questlogEquipmentSha256) errors.push("Warehouse Questlog equipment hash does not match its input");
  if (questlogSkillsSha256 && identity.questlogSkillsSha256 !== questlogSkillsSha256) errors.push("Warehouse Questlog skill hash does not match its input");
  if (decodedBaselineSha256 && identity.decodedBaselineSha256 !== decodedBaselineSha256) errors.push("Warehouse reviewed decoded-baseline hash does not match its input");
  return errors;
}

export function validateInventoryIdentity(identity, { build, decoded, indexedTableCount = null }) {
  const errors = [];
  if (!identity?.exists) return ["Inventory output does not exist"];
  if (identity.gameBuild !== String(build)) errors.push(`Inventory build ${identity.gameBuild || "<missing>"} does not match ${build}`);
  if (!decoded?.exists) errors.push("Decoded source identity is unavailable");
  else {
    if (identity.decodedTableCount !== decoded.tableCount) errors.push(`Inventory decoded-table count ${identity.decodedTableCount} does not match ${decoded.tableCount}`);
    if (identity.decodedRowCount !== decoded.rowCount) errors.push(`Inventory decoded-row count ${identity.decodedRowCount} does not match ${decoded.rowCount}`);
  }
  if (indexedTableCount != null && identity.tableCount !== indexedTableCount) {
    errors.push(`Inventory table count ${identity.tableCount} does not match game_tables.csv count ${indexedTableCount}`);
  }
  if (identity.semanticSha256 !== identity.computedSemanticSha256) {
    errors.push("Inventory declared semantic hash does not match its content");
  }
  if (JSON.stringify(identity.semanticExcludes) !== JSON.stringify(["generatedAtUtc", "semanticIdentity"])) {
    errors.push("Inventory semantic hash exclusions do not match the contract");
  }
  return errors;
}

export function receiptPath(repoRoot, build) {
  return path.join(repoRoot, "data-build-receipts", `${build}.json`);
}

export function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temp, file);
}

export function validateDataBuildReceipt(receipt) {
  const schema = JSON.parse(readFileSync(RECEIPT_SCHEMA_FILE, "utf8"));
  return assertJsonSchema(receipt, schema, "Data build receipt");
}

export function buildDataBuildReceipt({
  repoRoot, context, report, inputs, outputs, currentGenerator, allowedGeneratorDirtyPaths = [],
}) {
  const stages = new Map((report.stages ?? []).map((stage) => [stage.name, stage]));
  for (const name of ["warehouse", "inventory"]) {
    const stage = stages.get(name);
    if (stage?.status !== "passed" || !stage.afterIdentity) {
      throw new Error(`Cannot issue a data build receipt: ${name} did not pass in this run`);
    }
  }
  if (report.status !== "passed") throw new Error("Cannot issue a data build receipt for a failed or incomplete run");
  if (!currentGenerator) throw new Error("Cannot issue a data build receipt without a current generator identity");
  assertDataGeneratorIdentity(report.generator, currentGenerator);
  assertOnlyAuthorizedGeneratorChanges(currentGenerator, allowedGeneratorDirtyPaths);
  for (const key of ["decodedTables", "decodedBaseline", "localization", "texturePaths", "questlogEquipment", "questlogSkills", "gameTablesIndex"]) {
    if (!inputs?.[key]?.exists) throw new Error(`Cannot issue a data build receipt: input identity ${key} is missing`);
  }
  if (!(inputs.decodedTables.tableCount > 0)) throw new Error("Cannot issue a data build receipt with an empty decoded table universe");
  if (!report.dataBuildInputs) throw new Error("Cannot issue a data build receipt without the run's final input identities");
  const inputCore = (value) => ({
    decodedTables: value.decodedTables,
    decodedBaseline: value.decodedBaseline,
    localization: value.localization,
    texturePaths: value.texturePaths,
    questlogEquipment: value.questlogEquipment,
    questlogSkills: value.questlogSkills,
    gameTablesIndex: value.gameTablesIndex,
  });
  if (JSON.stringify(inputCore(inputs)) !== JSON.stringify(inputCore(report.dataBuildInputs))) {
    throw new Error("Current data-build inputs differ from the identities recorded by the successful run");
  }
  const warehouseCoreKeys = [
    "sha256", "bytes", "gameBuild", "gameVersion", "contract", "integrity", "decodedManifestPresent",
    "tableCount", "recordCount", "ftsRecordCount",
    "refCount", "assetCount", "localizedRecordCount", "sourceSetSha256", "localizationSha256",
    "texturePathSetSha256", "questlogEquipmentSha256", "questlogSkillsSha256", "decodedBaselineSha256",
    "sourceManifestSha256", "semanticHashSchema", "decodedTablesSemanticSha256", "recordsSemanticSha256",
    "refsSemanticSha256", "assetsSemanticSha256", "ftsSemanticSha256", "computedDecodedTablesSemanticSha256",
    "computedRecordsSemanticSha256", "computedRefsSemanticSha256", "computedAssetsSemanticSha256",
    "computedFtsSemanticSha256",
  ];
  const expectedWarehouseIdentity = report.warehouseAfterAuthorizedMutation ?? stages.get("warehouse").afterIdentity;
  if (warehouseCoreKeys.some((key) => outputs.warehouse[key] !== expectedWarehouseIdentity[key])) {
    throw new Error("Current warehouse core semantics differ from the validated warehouse stage output");
  }
  const inventoryCoreKeys = [
    "sha256", "gameBuild", "tableCount", "familyCount", "decodedTableCount", "decodedRowCount",
    "rawBytes", "semanticSha256", "computedSemanticSha256",
  ];
  if (inventoryCoreKeys.some((key) => outputs.inventory[key] !== stages.get("inventory").afterIdentity[key])) {
    throw new Error("Current inventory differs from the validated inventory stage output");
  }
  if (!outputs.inventory.repositoryCopy?.exists || outputs.inventory.repositoryCopy.sha256 !== outputs.inventory.sha256) {
    throw new Error("Current repository inventory copy is missing or differs from the canonical inventory");
  }
  if (outputs.inventory.repositoryCopy?.sha256 !== stages.get("inventory").afterIdentity.repositoryCopy?.sha256) {
    throw new Error("Current repository inventory copy differs from the validated inventory stage output");
  }
  const receipt = {
    schema: DATA_BUILD_RECEIPT_SCHEMA,
    schemaVersion: DATA_BUILD_RECEIPT_SCHEMA_VERSION,
    gameBuild: String(context.build),
    generatedAtUtc: report.finishedAtUtc,
    schemaPath: "schemas/data-build-receipt.schema.json",
    sourceRun: {
      startedAtUtc: report.startedAtUtc,
      finishedAtUtc: report.finishedAtUtc,
      mode: report.mode,
      status: report.status,
      reportPath: report.reportPath,
    },
    generator: report.generator,
    inputs,
    outputs,
  };
  return validateDataBuildReceipt(receipt);
}
