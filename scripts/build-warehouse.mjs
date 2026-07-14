// Builds the normalized SQLite warehouse from decoded TLJsonDataTable JSON,
// localization, the extracted asset index, and Questlog snapshots.
// Contract: docs/data-contract.md
//
// Usage: node scripts/build-warehouse.mjs [--build N] [--data-root PATH]
//        [--extract-root PATH] [--questlog-root PATH] [--decoded-baseline PATH] [--db-path PATH]
// Env:   TL_DATA_ROOT, TL_EXTRACT_ROOT, TL_QUESTLOG_ROOT, TL_STEAM_BUILD

import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { AssetCaseIndex, normalizeAssetKey } from "./lib/asset-case-index.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const DEFAULT_BUILD = "24118850";
const GAME_VERSION = "1.431.22.7761";
const REQUIRED_QUESTLOG_FILES = [
  "characterBuilder.getEquipmentItems.json",
  "skillBuilder.getSkillSets.json",
];
const RECORD_COLUMNS = [
  "record_id", "row_id", "record_type", "table_name", "table_family",
  "source_path", "source_sha256", "game_build", "game_version", "decoder_version",
  "locale", "name_loc", "loc_key", "loc_state", "icon_asset_path", "icon_asset_key",
  "icon_exists", "raw_json", "extraction_status", "questlog_present", "confidence",
  "first_seen_build", "last_seen_build",
];
const SEMANTIC_HASH_META = Object.freeze({
  decodedTables: "decoded_tables_semantic_sha256",
  records: "records_semantic_sha256",
  refs: "refs_semantic_sha256",
  assets: "assets_semantic_sha256",
  fts: "fts_semantic_sha256",
});
const SQLITE_SIDECAR_SUFFIXES = ["-wal", "-shm", "-journal"];

const RECORD_TYPE = {
  TLItemLooks_Equip: "item", TLItemLooks: "item", TLItemEquip: "item", TLItemStats: "item",
  TLItemCombatPower: "reference", TLItemAttackSpeedBaseline: "reference", TLItemStatAttrConverter: "reference",
  TLSkill: "skill", TLSkillLevelSetting: "reference", TLPassiveSkillLooks: "skill",
  TLAbnormalState_Common: "status_effect",
  TLCraftingRecipe: "recipe", TLCookingRecipe: "recipe", TLSkillLevelUpRecipe: "recipe",
  TLRewardNpcFoItem: "reward",
  TLRuneInfo: "rune", TLRuneGrowth: "rune", TLRuneSynergy: "rune",
};

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(file) {
  return sha256Bytes(readFileSync(file));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function aggregateIdentity(rows) {
  return sha256Bytes(Buffer.from(rows.map((row) => JSON.stringify(row)).join("\n"), "utf8"));
}

function updateSemanticHash(hash, values) {
  const encoded = JSON.stringify(values);
  hash.update(String(Buffer.byteLength(encoded, "utf8")));
  hash.update(":");
  hash.update(encoded);
  hash.update("\n");
}

function compareTextBinary(left, right) {
  return Buffer.compare(Buffer.from(String(left), "utf8"), Buffer.from(String(right), "utf8"));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertFile(file, label) {
  invariant(existsSync(file), `${label} is missing: ${file}`);
  invariant(statSync(file).isFile(), `${label} is not a file: ${file}`);
}

function assertDirectory(dir, label) {
  invariant(existsSync(dir), `${label} is missing: ${dir}`);
  invariant(statSync(dir).isDirectory(), `${label} is not a directory: ${dir}`);
}

function parseJsonFile(file, label) {
  assertFile(file, label);
  try {
    return JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF|^ï»¿/, ""));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${file}: ${error.message}`);
  }
}

function parseCsv(text) {
  invariant(typeof text === "string", "CSV input must be text");
  text = text.replace(/^\uFEFF/, "");
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); field = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
    else field += c;
  }
  invariant(!q, "CSV contains an unterminated quoted field");
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function trpcValues(value) {
  return Array.isArray(value) ? value : Object.values(value ?? {});
}

function readTrpc(file) {
  const batch = parseJsonFile(file, "Questlog snapshot");
  return trpcValues(batch).flatMap((entry) => trpcValues(entry?.result?.data?.json ?? entry?.result?.data ?? entry));
}

function walkPngs(dir, base = dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPngs(full, base, acc);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
      acc.push(path.relative(base, full).replace(/\\/g, "/"));
    }
  }
  return acc;
}

function familyOf(table) {
  let base = table.replace(/^TLString/, "TL").replace(/_AGS$/i, "");
  const suffix = /^(L\d+\w*|C|M|H|AD|\d+|Common|Event|Item|Live|BP|Weapon|Bow|Crossbow|Dagger|Gauntlet|Orb|Spear|Staff|Sword|Sword2h|Wand|Equip)$/i;
  const tokens = base.split("_");
  while (tokens.length > 1 && suffix.test(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join("_");
}

export function resolveWarehouseOptions(overrides = {}) {
  const build = String(overrides.build ?? process.env.TL_STEAM_BUILD ?? DEFAULT_BUILD);
  invariant(/^\d+$/.test(build), `game build must be numeric, received ${JSON.stringify(build)}`);
  const dataRoot = path.resolve(overrides.dataRoot ?? process.env.TL_DATA_ROOT ?? "D:\\TL_Data");
  const extractRoot = path.resolve(overrides.extractRoot ?? process.env.TL_EXTRACT_ROOT ?? path.join(dataRoot, "raw", build, "extracted"));
  const questlogRoot = path.resolve(overrides.questlogRoot ?? process.env.TL_QUESTLOG_ROOT ?? path.join(root, "out", "questlog-public"));
  const decodedDir = path.resolve(overrides.decodedDir ?? path.join(dataRoot, "decoded", build, "tables"));
  const decodedBaselinePath = path.resolve(overrides.decodedBaselinePath ?? path.join(root, "data-build-baselines", `${build}.json`));
  const dbPath = path.resolve(overrides.dbPath ?? path.join(dataRoot, "warehouse", `tl-${build}.sqlite`));
  return { build, gameVersion: overrides.gameVersion ?? GAME_VERSION, dataRoot, extractRoot, questlogRoot, decodedDir, decodedBaselinePath, dbPath };
}

export function validateWarehouseInputs(inputOptions = {}) {
  const options = resolveWarehouseOptions(inputOptions);
  assertDirectory(options.decodedDir, "decoded table directory");

  const localizationPath = path.join(options.extractRoot, "localization", "csv", "en.csv");
  assertFile(localizationPath, "English localization CSV");
  const localizationBytes = readFileSync(localizationPath);
  const localizationRows = parseCsv(localizationBytes.toString("utf8"));
  invariant(localizationRows.length > 1, `English localization CSV has no data rows: ${localizationPath}`);
  const localizationHeaders = localizationRows[0];
  invariant(new Set(localizationHeaders).size === localizationHeaders.length, `English localization CSV has duplicate headers: ${localizationPath}`);
  const requiredLocalizationHeaders = ["Namespace", "Key", "Hash", "Translation"];
  const localizationIndexes = Object.fromEntries(requiredLocalizationHeaders.map((header) => [header, localizationHeaders.indexOf(header)]));
  const missingLocalizationHeaders = requiredLocalizationHeaders.filter((header) => localizationIndexes[header] < 0);
  invariant(missingLocalizationHeaders.length === 0, `English localization CSV is missing headers ${missingLocalizationHeaders.join(", ")}: ${localizationPath}`);
  const loc = new Map();
  for (const [offset, row] of localizationRows.slice(1).entries()) {
    invariant(row.length <= localizationHeaders.length, `English localization CSV row ${offset + 2} has more fields than its header`);
    const namespace = row[localizationIndexes.Namespace] ?? "";
    const key = row[localizationIndexes.Key] ?? "";
    const translation = row[localizationIndexes.Translation] ?? "";
    if (namespace && key) {
      const compoundKey = `${namespace}|${key}`;
      invariant(!loc.has(compoundKey), `English localization CSV contains duplicate key ${compoundKey}`);
      loc.set(compoundKey, translation);
    }
  }
  invariant(loc.size > 0, `English localization CSV has no usable namespace/key rows: ${localizationPath}`);

  const texturesRoot = path.join(options.extractRoot, "textures", "TL", "Content");
  assertDirectory(texturesRoot, "extracted texture root");
  const pngPaths = walkPngs(texturesRoot).sort();
  const pngIndex = new AssetCaseIndex(pngPaths);
  const collisions = pngIndex.collisions();
  invariant(collisions.length === 0, `asset key collisions in extraction: ${JSON.stringify(collisions.slice(0, 3))}`);

  const questlogPaths = Object.fromEntries(REQUIRED_QUESTLOG_FILES.map((name) => {
    const file = path.join(options.questlogRoot, name);
    assertFile(file, `Questlog snapshot ${name}`);
    return [name, file];
  }));
  const equipmentRows = readTrpc(questlogPaths[REQUIRED_QUESTLOG_FILES[0]]);
  invariant(equipmentRows.length > 0, "Questlog equipment snapshot has no records");
  const qItemIds = new Set(equipmentRows.map((item) => item?.id).filter((id) => id !== undefined && id !== null).map(String));
  invariant(qItemIds.size > 0, "Questlog equipment snapshot has no item IDs");
  const skillRows = readTrpc(questlogPaths[REQUIRED_QUESTLOG_FILES[1]]);
  invariant(skillRows.length > 0, "Questlog skill snapshot has no records");
  const qSkillIds = new Set();
  for (const skill of skillRows) {
    if (skill?.id !== undefined && skill?.id !== null) qSkillIds.add(String(skill.id).replace(/^SkillSet_/, ""));
    for (const specialization of Object.values(skill?.specializations ?? {})) {
      if (specialization?.id) qSkillIds.add(String(specialization.id).replace(/^SkillSet_/, ""));
    }
  }
  invariant(qSkillIds.size > 0, "Questlog skill snapshot has no skill IDs");

  const decodedFiles = readdirSync(options.decodedDir)
    .filter((file) => file.toLowerCase().endsWith(".json"))
    .sort();
  invariant(decodedFiles.length > 0, `decoded table directory contains no JSON files: ${options.decodedDir}`);
  const seenTables = new Set();
  const tables = [];
  let decodedRows = 0;
  for (const fileName of decodedFiles) {
    const file = path.join(options.decodedDir, fileName);
    const bytes = readFileSync(file);
    let decoded;
    try { decoded = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")); }
    catch (error) { throw new Error(`decoded table is not valid JSON: ${file}: ${error.message}`); }
    invariant(isPlainObject(decoded), `decoded table must be an object: ${file}`);
    invariant(typeof decoded.table === "string" && decoded.table.trim().length > 0, `decoded table name is missing: ${file}`);
    invariant(fileName === `${decoded.table}.json`, `decoded filename/table mismatch: ${fileName} versus ${decoded.table}`);
    invariant(!seenTables.has(decoded.table), `duplicate decoded table: ${decoded.table}`);
    seenTables.add(decoded.table);
    invariant(decoded.gameBuild === options.build, `decoded table ${decoded.table} belongs to build ${decoded.gameBuild}, expected ${options.build}`);
    invariant(typeof decoded.decoderVersion === "string" && decoded.decoderVersion.trim().length > 0, `decoded table ${decoded.table} has no decoder version`);
    invariant(isPlainObject(decoded.rows), `decoded table ${decoded.table} has invalid rows`);
    const actualRows = Object.keys(decoded.rows).length;
    invariant(Object.keys(decoded.rows).every((rowId) => rowId.length > 0), `decoded table ${decoded.table} has an empty row ID`);
    invariant(Object.values(decoded.rows).every(isPlainObject), `decoded table ${decoded.table} contains a non-object row`);
    invariant(Number.isSafeInteger(decoded.declaredRowCount) && decoded.declaredRowCount >= 0, `decoded table ${decoded.table} has invalid declaredRowCount`);
    invariant(Number.isSafeInteger(decoded.decodedRowCount) && decoded.decodedRowCount >= 0, `decoded table ${decoded.table} has invalid decodedRowCount`);
    invariant(decoded.declaredRowCount === decoded.decodedRowCount, `decoded table ${decoded.table} declared ${decoded.declaredRowCount} rows but decoded ${decoded.decodedRowCount}`);
    invariant(decoded.decodedRowCount === actualRows, `decoded table ${decoded.table} reports ${decoded.decodedRowCount} rows but contains ${actualRows}`);
    invariant(Array.isArray(decoded.unsupportedTypes) && decoded.unsupportedTypes.every((entry) => typeof entry === "string"), `decoded table ${decoded.table} has invalid unsupportedTypes`);
    invariant(Array.isArray(decoded.warnings), `decoded table ${decoded.table} has invalid warnings`);
    invariant(Number.isSafeInteger(decoded.trailingBytes) && decoded.trailingBytes >= 0, `decoded table ${decoded.table} has invalid trailingBytes`);
    invariant(typeof decoded.sourcePath === "string" && decoded.sourcePath.trim().length > 0, `decoded table ${decoded.table} has no source path`);
    assertFile(decoded.sourcePath, `decoded source for ${decoded.table}`);
    invariant(/^[0-9a-f]{64}$/i.test(decoded.sha256 ?? ""), `decoded table ${decoded.table} has an invalid source sha256`);
    const actualSourceSha256 = sha256File(decoded.sourcePath);
    invariant(actualSourceSha256 === decoded.sha256.toLowerCase(), `decoded source sha256 mismatch for ${decoded.table}`);
    const decodedJsonSha256 = sha256Bytes(bytes);
    tables.push({
      table: decoded.table,
      file,
      fileName,
      rowCount: actualRows,
      decoderVersion: decoded.decoderVersion,
      sourcePath: decoded.sourcePath,
      sourceSha256: decoded.sha256.toLowerCase(),
      decodedJsonSha256,
    });
    decodedRows += actualRows;
  }

  const baseline = parseJsonFile(options.decodedBaselinePath, "reviewed decoded-data baseline");
  invariant(isPlainObject(baseline), `reviewed decoded-data baseline must be an object: ${options.decodedBaselinePath}`);
  invariant(baseline.schema === "tl-helper.decoded-data-baseline" && baseline.schemaVersion === 1, `reviewed decoded-data baseline has an unsupported schema: ${options.decodedBaselinePath}`);
  invariant(String(baseline.gameBuild) === options.build, `reviewed decoded-data baseline build ${baseline.gameBuild} does not match ${options.build}`);
  for (const key of ["tableCount", "rowCount"]) invariant(Number.isSafeInteger(baseline[key]) && baseline[key] >= 0, `reviewed decoded-data baseline ${key} is invalid`);
  invariant(Array.isArray(baseline.decoderVersions) && baseline.decoderVersions.every((entry) => typeof entry === "string" && entry.length > 0), "reviewed decoded-data baseline decoderVersions is invalid");
  invariant(/^[0-9a-f]{64}$/i.test(baseline.sourceSetSha256 ?? ""), "reviewed decoded-data baseline sourceSetSha256 is invalid");
  invariant(/^[0-9a-f]{64}$/i.test(baseline.artifactSetSha256 ?? ""), "reviewed decoded-data baseline artifactSetSha256 is invalid");
  const baselineTables = [...tables].sort((left, right) => left.table.localeCompare(right.table));
  const decodedIdentity = {
    tableCount: baselineTables.length,
    rowCount: decodedRows,
    decoderVersions: [...new Set(baselineTables.map((table) => table.decoderVersion))].sort(),
    sourceSetSha256: aggregateIdentity(baselineTables.map((table) => ({ table: table.table, decodedRows: table.rowCount, sourceSha256: table.sourceSha256 }))),
    artifactSetSha256: aggregateIdentity(baselineTables.map((table) => ({ table: table.table, artifactSha256: table.decodedJsonSha256 }))),
  };
  invariant(baseline.tableCount === decodedIdentity.tableCount, `decoded table count ${decodedIdentity.tableCount} does not match reviewed baseline ${baseline.tableCount}`);
  invariant(baseline.rowCount === decodedIdentity.rowCount, `decoded row count ${decodedIdentity.rowCount} does not match reviewed baseline ${baseline.rowCount}`);
  invariant(JSON.stringify(baseline.decoderVersions) === JSON.stringify(decodedIdentity.decoderVersions), `decoded versions ${JSON.stringify(decodedIdentity.decoderVersions)} do not match reviewed baseline ${JSON.stringify(baseline.decoderVersions)}`);
  invariant(baseline.sourceSetSha256.toLowerCase() === decodedIdentity.sourceSetSha256, "decoded source-set identity does not match reviewed baseline");
  invariant(baseline.artifactSetSha256.toLowerCase() === decodedIdentity.artifactSetSha256, "decoded artifact-set identity does not match reviewed baseline");

  const localizationSha256 = sha256Bytes(localizationBytes);
  const textureIndexSha256 = sha256Bytes(Buffer.from(pngPaths.join("\n"), "utf8"));
  const questlogSha256 = Object.fromEntries(Object.entries(questlogPaths).map(([name, file]) => [name, sha256File(file)]));
  const decodedBaselineSha256 = sha256File(options.decodedBaselinePath);
  const manifest = {
    gameBuild: options.build,
    decodedBaselineSha256,
    localizationSha256,
    textureIndexSha256,
    questlogSha256,
    tables: tables.map(({ table, rowCount, decoderVersion, sourceSha256, decodedJsonSha256 }) => ({
      table, rowCount, decoderVersion, sourceSha256, decodedJsonSha256,
    })),
  };
  const sourceManifestSha256 = sha256Bytes(Buffer.from(canonicalJson(manifest), "utf8"));
  return {
    options,
    loc,
    pngIndex,
    qItemIds,
    qSkillIds,
    tables,
    decodedRows,
    provenance: { localizationSha256, textureIndexSha256, questlogSha256, decodedBaselineSha256, sourceManifestSha256 },
    decodedIdentity,
  };
}

function iconOf(row) {
  for (const key of ["IconPath", "Icon", "icon_path", "EffectIconPath"]) {
    const value = row[key];
    if (value && typeof value === "object" && typeof value.assetPath === "string" && value.assetPath) return value.assetPath;
  }
  return null;
}

function iconToLocalRel(assetPath) {
  let result = assetPath.replace(/^\/Game\//i, "");
  const lastSlash = result.lastIndexOf("/"), lastDot = result.lastIndexOf(".");
  if (lastDot > lastSlash) result = result.slice(0, lastDot);
  return `${result}.png`;
}

function locOf(loc, table, rowId, row) {
  const ui = row.UIName;
  if (ui && typeof ui === "object" && ui.key) {
    const stringTable = String(ui.stringTable ?? "");
    const namespace = stringTable.includes(".") ? stringTable.slice(stringTable.lastIndexOf(".") + 1).replace(/^TLString/, "TL") : "";
    for (const candidate of [namespace, "TLItemLooks_Equip", "TLItemLooks"]) {
      const hit = loc.get(`${candidate}|${ui.key}`);
      if (hit !== undefined) return { key: ui.key, name: hit, state: "resolved" };
    }
    return { key: ui.key, name: null, state: "unresolved" };
  }
  if (table === "TLSkill") {
    for (const namespace of ["TLStringSkillDesc", "TLStringSkillDesc_Item"]) {
      const hit = loc.get(`${namespace}|TEXT_SKILL_NAME_${rowId}`);
      if (hit !== undefined) return { key: `TEXT_SKILL_NAME_${rowId}`, name: hit, state: "resolved" };
    }
    for (const [key, value] of loc) {
      if (key.endsWith(`|TEXT_SKILL_NAME_${rowId}`)) return { key: `TEXT_SKILL_NAME_${rowId}`, name: value, state: "resolved" };
    }
  }
  return { key: null, name: null, state: "none" };
}

function collectRefs(value, fieldPath, out) {
  if (!value || typeof value !== "object") return;
  if (typeof value.RowName === "string" && value.RowName !== "None") out.push({ field: fieldPath, to: value.RowName });
  for (const [key, child] of Object.entries(value)) if (key !== "RowName") collectRefs(child, fieldPath ? `${fieldPath}.${key}` : key, out);
}

function querySemanticHash(db, sql, columns) {
  const hash = createHash("sha256");
  for (const row of db.prepare(sql).iterate()) updateSemanticHash(hash, columns.map((column) => row[column]));
  return hash.digest("hex");
}

export function databaseSemanticHashes(db) {
  return {
    decodedTables: querySemanticHash(
      db,
      "SELECT table_name, row_count, source_path, source_sha256, decoded_json_sha256, decoder_version, game_build FROM decoded_tables ORDER BY table_name",
      ["table_name", "row_count", "source_path", "source_sha256", "decoded_json_sha256", "decoder_version", "game_build"],
    ),
    records: querySemanticHash(db, `SELECT ${RECORD_COLUMNS.join(", ")} FROM records ORDER BY record_id`, RECORD_COLUMNS),
    refs: querySemanticHash(db, "SELECT from_record_id, field, to_row_id FROM refs ORDER BY from_record_id, field, to_row_id", ["from_record_id", "field", "to_row_id"]),
    assets: querySemanticHash(db, "SELECT asset_key, original_path, exists_locally, referenced_by_questlog FROM assets ORDER BY asset_key", ["asset_key", "original_path", "exists_locally", "referenced_by_questlog"]),
    fts: querySemanticHash(db, "SELECT record_id, row_id, name_loc FROM records_fts ORDER BY record_id, row_id, name_loc", ["record_id", "row_id", "name_loc"]),
  };
}

export function assertWalCheckpointComplete(checkpoint) {
  invariant(isPlainObject(checkpoint), "SQLite WAL checkpoint returned no result");
  invariant(Number(checkpoint.busy) === 0, `SQLite WAL checkpoint remained busy: ${JSON.stringify(checkpoint)}`);
  invariant(Number(checkpoint.log) === 0 && Number(checkpoint.checkpointed) === 0, `SQLite WAL checkpoint left frames behind: ${JSON.stringify(checkpoint)}`);
  return checkpoint;
}

function createSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE decoded_tables (
      table_name TEXT PRIMARY KEY, row_count INTEGER NOT NULL,
      source_path TEXT NOT NULL, source_sha256 TEXT NOT NULL,
      decoded_json_sha256 TEXT NOT NULL, decoder_version TEXT NOT NULL,
      game_build TEXT NOT NULL
    );
    CREATE TABLE records (
      record_id TEXT PRIMARY KEY, row_id TEXT NOT NULL, record_type TEXT NOT NULL,
      table_name TEXT NOT NULL, table_family TEXT NOT NULL,
      source_path TEXT NOT NULL, source_sha256 TEXT NOT NULL,
      game_build TEXT NOT NULL, game_version TEXT NOT NULL, decoder_version TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'en',
      name_loc TEXT, loc_key TEXT, loc_state TEXT NOT NULL,
      icon_asset_path TEXT, icon_asset_key TEXT, icon_exists INTEGER,
      raw_json TEXT NOT NULL,
      extraction_status TEXT NOT NULL, questlog_present INTEGER,
      confidence TEXT NOT NULL DEFAULT 'extracted',
      first_seen_build TEXT NOT NULL, last_seen_build TEXT NOT NULL
    );
    CREATE INDEX idx_records_row ON records(row_id);
    CREATE INDEX idx_records_type ON records(record_type);
    CREATE TABLE refs (from_record_id TEXT NOT NULL, field TEXT NOT NULL, to_row_id TEXT NOT NULL);
    CREATE INDEX idx_refs_from ON refs(from_record_id);
    CREATE INDEX idx_refs_to ON refs(to_row_id);
    CREATE TABLE assets (
      asset_key TEXT PRIMARY KEY, original_path TEXT NOT NULL,
      exists_locally INTEGER NOT NULL, referenced_by_questlog INTEGER NOT NULL DEFAULT 0
    );
    CREATE VIRTUAL TABLE records_fts USING fts5(record_id, row_id, name_loc);
  `);
}

function buildTemporaryDatabase(tempPath, validated) {
  const { options, tables, loc, pngIndex, qItemIds, qSkillIds, provenance } = validated;
  const db = new DatabaseSync(tempPath);
  let recordCount = 0, refCount = 0;
  let semanticHashes;
  try {
    createSchema(db);
    const insDecodedTable = db.prepare("INSERT INTO decoded_tables VALUES (?,?,?,?,?,?,?)");
    const insRecord = db.prepare("INSERT INTO records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    const insRef = db.prepare("INSERT INTO refs VALUES (?,?,?)");
    const insAsset = db.prepare("INSERT OR IGNORE INTO assets VALUES (?,?,?,0)");
    const insFts = db.prepare("INSERT INTO records_fts VALUES (?,?,?)");
    const hashers = Object.fromEntries(Object.keys(SEMANTIC_HASH_META).map((key) => [key, createHash("sha256")]));
    const expectedAssets = new Map();
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const expected of [...tables].sort((left, right) => compareTextBinary(left.table, right.table))) {
        const bytes = readFileSync(expected.file);
        invariant(sha256Bytes(bytes) === expected.decodedJsonSha256, `decoded table changed after validation: ${expected.file}`);
        const decoded = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
        invariant(Object.keys(decoded.rows).length === expected.rowCount, `decoded table row count changed after validation: ${expected.table}`);
        const decodedTableValues = [
          expected.table, expected.rowCount, expected.sourcePath, expected.sourceSha256,
          expected.decodedJsonSha256, expected.decoderVersion, options.build,
        ];
        insDecodedTable.run(...decodedTableValues);
        updateSemanticHash(hashers.decodedTables, decodedTableValues);
        const type = RECORD_TYPE[decoded.table] ?? "reference";
        const family = familyOf(decoded.table);
        for (const [rowId, row] of Object.entries(decoded.rows).sort(([left], [right]) => compareTextBinary(left, right))) {
          const recordId = `${decoded.table}:${rowId}`;
          const { key, name, state } = locOf(loc, decoded.table, rowId, row);
          const icon = iconOf(row);
          let iconKey = null, iconExists = null;
          if (icon) {
            const relative = iconToLocalRel(icon);
            iconKey = normalizeAssetKey(relative);
            iconExists = pngIndex.lookup(relative).status === "missing" ? 0 : 1;
            insAsset.run(iconKey, icon, iconExists);
            if (!expectedAssets.has(iconKey)) expectedAssets.set(iconKey, [iconKey, icon, iconExists, 0]);
          }
          let questlogPresent = null;
          if (["TLItemStats", "TLItemEquip", "TLItemLooks_Equip"].includes(decoded.table)) questlogPresent = qItemIds.has(rowId) ? 1 : 0;
          if (decoded.table === "TLSkill") questlogPresent = qSkillIds.has(rowId) ? 1 : 0;
          const recordValues = [
            recordId, rowId, type, decoded.table, family,
            expected.sourcePath, expected.sourceSha256, options.build, options.gameVersion, expected.decoderVersion,
            "en", name, key, state,
            icon, iconKey, iconExists,
            JSON.stringify(row),
            "decoded", questlogPresent, "extracted", options.build, options.build,
          ];
          insRecord.run(...recordValues);
          updateSemanticHash(hashers.records, recordValues);
          const ftsValues = [recordId, rowId, name ?? ""];
          insFts.run(...ftsValues);
          updateSemanticHash(hashers.fts, ftsValues);
          const refs = [];
          collectRefs(row, "", refs);
          refs.sort((left, right) => compareTextBinary(left.field, right.field) || compareTextBinary(left.to, right.to));
          for (const ref of refs) {
            const refValues = [recordId, ref.field, ref.to];
            insRef.run(...refValues);
            updateSemanticHash(hashers.refs, refValues);
            refCount++;
          }
          recordCount++;
        }
      }
      for (const assetValues of [...expectedAssets.values()].sort(([left], [right]) => compareTextBinary(left, right))) {
        updateSemanticHash(hashers.assets, assetValues);
      }
      semanticHashes = Object.fromEntries(Object.entries(hashers).map(([key, hash]) => [key, hash.digest("hex")]));
      const meta = {
        game_build: options.build,
        game_version: options.gameVersion,
        locale: "en",
        builtAtUtc: new Date().toISOString(),
        extractRoot: options.extractRoot,
        questlogRoot: options.questlogRoot,
        decodedBaselinePath: options.decodedBaselinePath,
        contract: "docs/data-contract.md v1",
        decoded_table_count: String(tables.length),
        decoded_row_count: String(validated.decodedRows),
        localization_sha256: provenance.localizationSha256,
        texture_index_sha256: provenance.textureIndexSha256,
        questlog_equipment_sha256: provenance.questlogSha256[REQUIRED_QUESTLOG_FILES[0]],
        questlog_skills_sha256: provenance.questlogSha256[REQUIRED_QUESTLOG_FILES[1]],
        decoded_baseline_sha256: provenance.decodedBaselineSha256,
        source_manifest_sha256: provenance.sourceManifestSha256,
        semantic_hash_schema: "length-prefixed-json-tuples-v1",
        ...Object.fromEntries(Object.entries(SEMANTIC_HASH_META).map(([key, metaKey]) => [metaKey, semanticHashes[key]])),
      };
      const insMeta = db.prepare("INSERT INTO meta VALUES (?,?)");
      for (const [key, value] of Object.entries(meta)) insMeta.run(key, value);
      db.exec("COMMIT");
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* preserve the original failure */ }
      throw error;
    }
    assertWalCheckpointComplete(db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get());
  } finally {
    db.close();
  }
  return { recordCount, refCount, semanticHashes };
}

export function verifyWarehouseDatabase(databasePath, validated, expectedSemanticHashes = null) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const integrity = db.prepare("PRAGMA integrity_check").all().map((row) => String(Object.values(row)[0]));
    invariant(integrity.length === 1 && integrity[0] === "ok", `SQLite integrity_check failed: ${integrity.join("; ")}`);
    const meta = Object.fromEntries(db.prepare("SELECT key, value FROM meta").all().map((row) => [row.key, row.value]));
    const expectedMeta = {
      game_build: validated.options.build,
      decoded_table_count: String(validated.tables.length),
      decoded_row_count: String(validated.decodedRows),
      localization_sha256: validated.provenance.localizationSha256,
      texture_index_sha256: validated.provenance.textureIndexSha256,
      questlog_equipment_sha256: validated.provenance.questlogSha256[REQUIRED_QUESTLOG_FILES[0]],
      questlog_skills_sha256: validated.provenance.questlogSha256[REQUIRED_QUESTLOG_FILES[1]],
      decoded_baseline_sha256: validated.provenance.decodedBaselineSha256,
      source_manifest_sha256: validated.provenance.sourceManifestSha256,
      semantic_hash_schema: "length-prefixed-json-tuples-v1",
    };
    if (expectedSemanticHashes) {
      for (const [key, metaKey] of Object.entries(SEMANTIC_HASH_META)) expectedMeta[metaKey] = expectedSemanticHashes[key];
    }
    for (const [key, value] of Object.entries(expectedMeta)) invariant(meta[key] === value, `warehouse meta ${key} mismatch`);

    const recordCount = Number(db.prepare("SELECT COUNT(*) AS count FROM records").get().count);
    const ftsCount = Number(db.prepare("SELECT COUNT(*) AS count FROM records_fts").get().count);
    invariant(recordCount === validated.decodedRows, `warehouse record count ${recordCount} does not match decoded count ${validated.decodedRows}`);
    invariant(ftsCount === recordCount, `warehouse FTS count ${ftsCount} does not match record count ${recordCount}`);
    const missingFts = Number(db.prepare("SELECT COUNT(*) AS count FROM records r LEFT JOIN records_fts f ON f.record_id=r.record_id WHERE f.record_id IS NULL").get().count);
    invariant(missingFts === 0, `warehouse FTS is missing ${missingFts} records`);

    const builds = db.prepare("SELECT game_build, COUNT(*) AS count FROM records GROUP BY game_build").all();
    invariant(
      recordCount === 0 ? builds.length === 0 : builds.length === 1 && builds[0].game_build === validated.options.build && Number(builds[0].count) === recordCount,
      "warehouse record build identity mismatch",
    );
    const actualTables = new Map(db.prepare(`
      SELECT d.table_name, d.row_count AS declared_row_count, d.source_path, d.source_sha256,
             d.decoded_json_sha256, d.decoder_version, d.game_build, COUNT(r.record_id) AS record_count
      FROM decoded_tables d LEFT JOIN records r ON r.table_name=d.table_name
      GROUP BY d.table_name ORDER BY d.table_name
    `).all().map((row) => [row.table_name, row]));
    invariant(actualTables.size === validated.tables.length, `warehouse table count ${actualTables.size} does not match decoded table count ${validated.tables.length}`);
    for (const expected of validated.tables) {
      const actual = actualTables.get(expected.table);
      invariant(actual, `warehouse is missing decoded table ${expected.table}`);
      invariant(Number(actual.declared_row_count) === expected.rowCount && Number(actual.record_count) === expected.rowCount, `warehouse row count mismatch for ${expected.table}`);
      invariant(actual.source_path === expected.sourcePath, `warehouse source path mismatch for ${expected.table}`);
      invariant(actual.source_sha256 === expected.sourceSha256, `warehouse source sha256 mismatch for ${expected.table}`);
      invariant(actual.decoded_json_sha256 === expected.decodedJsonSha256, `warehouse decoded JSON sha256 mismatch for ${expected.table}`);
      invariant(actual.decoder_version === expected.decoderVersion, `warehouse decoder version mismatch for ${expected.table}`);
      invariant(actual.game_build === validated.options.build, `warehouse decoded table build mismatch for ${expected.table}`);
      actualTables.delete(expected.table);
    }
    invariant(actualTables.size === 0, `warehouse contains unexpected tables: ${[...actualTables.keys()].join(", ")}`);
    const orphanRecords = Number(db.prepare("SELECT COUNT(*) AS count FROM records r LEFT JOIN decoded_tables d ON d.table_name=r.table_name WHERE d.table_name IS NULL").get().count);
    invariant(orphanRecords === 0, `warehouse contains ${orphanRecords} records without a decoded-table manifest entry`);
    const inconsistentRecords = Number(db.prepare(`
      SELECT COUNT(*) AS count FROM records r JOIN decoded_tables d ON d.table_name=r.table_name
      WHERE r.source_path<>d.source_path OR r.source_sha256<>d.source_sha256
         OR r.decoder_version<>d.decoder_version OR r.game_build<>d.game_build
    `).get().count);
    invariant(inconsistentRecords === 0, `warehouse contains ${inconsistentRecords} records inconsistent with decoded-table provenance`);

    const semanticHashes = databaseSemanticHashes(db);
    for (const [key, metaKey] of Object.entries(SEMANTIC_HASH_META)) {
      invariant(meta[metaKey] === semanticHashes[key], `warehouse ${key} semantic hash does not match stored meta`);
      if (expectedSemanticHashes) invariant(expectedSemanticHashes[key] === semanticHashes[key], `warehouse ${key} semantic hash does not match source-derived expectation`);
    }
    return {
      integrity: "ok",
      records: recordCount,
      ftsRecords: ftsCount,
      tables: validated.tables.length,
      sourceManifestSha256: meta.source_manifest_sha256,
      semanticHashes,
    };
  } finally {
    db.close();
  }
}

function removeSqliteFamily(file) {
  for (const candidate of [file, ...SQLITE_SIDECAR_SUFFIXES.map((suffix) => `${file}${suffix}`)]) rmSync(candidate, { force: true });
}

function removeSqliteSidecars(file) {
  for (const suffix of SQLITE_SIDECAR_SUFFIXES) rmSync(`${file}${suffix}`, { force: true });
}

function fsyncFile(file, operations = {}) {
  const io = { openSync, fsyncSync, closeSync, ...operations };
  const descriptor = io.openSync(file, "r+");
  try { io.fsyncSync(descriptor); } finally { io.closeSync(descriptor); }
}

function sha256FileStreaming(file, operations = {}) {
  const io = { openSync, readSync, closeSync, ...operations };
  const descriptor = io.openSync(file, "r");
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const bytesRead = io.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    io.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function existingSqliteSidecars(file, io) {
  return SQLITE_SIDECAR_SUFFIXES.map((suffix) => `${file}${suffix}`).filter((candidate) => io.existsSync(candidate));
}

export function promoteDatabaseAtomic(tempPath, canonicalPath, verifyPromoted = () => {}, operations = {}) {
  const io = { copyFileSync, existsSync, openSync, readSync, fsyncSync, closeSync, readFileSync, renameSync, rmSync, ...operations };
  invariant(path.dirname(tempPath) === path.dirname(canonicalPath), "temporary and canonical SQLite files must be in the same directory");
  assertFile(tempPath, "temporary SQLite database");
  invariant(existingSqliteSidecars(tempPath, io).length === 0, `temporary SQLite database has WAL/SHM sidecars: ${existingSqliteSidecars(tempPath, io).join(", ")}`);
  const token = `${process.pid}-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const backupPath = `${canonicalPath}.backup-${token}`;
  const hadPrior = io.existsSync(canonicalPath);
  const initialCanonicalSidecars = existingSqliteSidecars(canonicalPath, io);
  invariant(initialCanonicalSidecars.length === 0, `canonical SQLite database is not quiescent; close all users and remove/checkpoint sidecars first: ${initialCanonicalSidecars.join(", ")}`);
  let replacementMoved = false;
  let backupCreated = false;
  let priorSha256 = null;
  let restorePath = null;
  try {
    if (hadPrior) {
      priorSha256 = sha256FileStreaming(canonicalPath, io);
      io.copyFileSync(canonicalPath, backupPath);
      backupCreated = true;
      fsyncFile(backupPath, io);
      invariant(sha256FileStreaming(backupPath, io) === priorSha256, "durable recovery backup does not match the live canonical database");
      const lateSidecars = existingSqliteSidecars(canonicalPath, io);
      invariant(lateSidecars.length === 0, `canonical SQLite database became active during promotion: ${lateSidecars.join(", ")}`);
    }
    io.renameSync(tempPath, canonicalPath);
    replacementMoved = true;
    verifyPromoted(canonicalPath);
  } catch (error) {
    const rollbackErrors = [];
    let restored = !replacementMoved;
    if (replacementMoved) {
      const promotedSidecars = existingSqliteSidecars(canonicalPath, io);
      for (const sidecar of promotedSidecars) {
        try { io.rmSync(sidecar, { force: true }); }
        catch (rollbackError) { rollbackErrors.push(new Error(`could not remove promoted sidecar ${sidecar}: ${rollbackError.message}`)); }
      }
      if (rollbackErrors.length === 0) {
        if (hadPrior && backupCreated && io.existsSync(backupPath)) {
          try {
            restorePath = `${backupPath}.restore.tmp`;
            io.copyFileSync(backupPath, restorePath);
            fsyncFile(restorePath, io);
            invariant(sha256FileStreaming(restorePath, io) === priorSha256, "rollback staging copy does not match its recovery hash");
            io.renameSync(restorePath, canonicalPath);
            restored = sha256FileStreaming(canonicalPath, io) === priorSha256;
            if (!restored) rollbackErrors.push(new Error("restored canonical database does not match its recovery hash"));
          } catch (rollbackError) {
            rollbackErrors.push(new Error(`could not restore recovery backup ${backupPath}: ${rollbackError.message}`));
          }
        } else if (!hadPrior) {
          try {
            if (io.existsSync(canonicalPath)) io.rmSync(canonicalPath, { force: true });
            restored = !io.existsSync(canonicalPath);
            if (!restored) rollbackErrors.push(new Error(`could not remove failed first-time canonical database ${canonicalPath}`));
          } catch (rollbackError) {
            rollbackErrors.push(new Error(`could not remove failed first-time canonical database ${canonicalPath}: ${rollbackError.message}`));
          }
        }
      }
    }
    if (restored && rollbackErrors.length === 0) {
      if (backupCreated) {
        try { io.rmSync(backupPath, { force: true }); } catch { /* recovery succeeded; retain a redundant backup if cleanup fails */ }
      }
      throw new Error(`warehouse promotion failed; prior database restored: ${error.message}`, { cause: error });
    }
    throw new AggregateError(
      [error, ...rollbackErrors],
      `warehouse promotion failed and rollback was incomplete; preserve and inspect canonical=${canonicalPath}, backup=${backupCreated ? backupPath : "<none>"}, restore=${restorePath && io.existsSync(restorePath) ? restorePath : "<none>"}, temp=${io.existsSync(tempPath) ? tempPath : "<promoted>"}`,
    );
  }
  if (backupCreated) {
    try { io.rmSync(backupPath, { force: true }); } catch { /* a redundant durable backup is safer than failing a completed promotion */ }
  }
  return { canonicalPath, replacedExisting: hadPrior, recoveryBackup: io.existsSync(backupPath) ? backupPath : null };
}

function warehouseStats(databasePath) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return {
      dbPath: databasePath,
      records: Number(db.prepare("SELECT COUNT(*) AS count FROM records").get().count),
      refs: Number(db.prepare("SELECT COUNT(*) AS count FROM refs").get().count),
      assets: Number(db.prepare("SELECT COUNT(*) AS count FROM assets").get().count),
      byType: Object.fromEntries(db.prepare("SELECT record_type, COUNT(*) AS count FROM records GROUP BY record_type").all().map((row) => [row.record_type, Number(row.count)])),
      locResolved: Number(db.prepare("SELECT COUNT(*) AS count FROM records WHERE loc_state='resolved'").get().count),
      questlogPresent: Number(db.prepare("SELECT COUNT(*) AS count FROM records WHERE questlog_present=1").get().count),
      questlogComparable: Number(db.prepare("SELECT COUNT(*) AS count FROM records WHERE questlog_present IS NOT NULL").get().count),
      sourceManifestSha256: db.prepare("SELECT value FROM meta WHERE key='source_manifest_sha256'").get().value,
    };
  } finally {
    db.close();
  }
}

export function buildWarehouse(inputOptions = {}) {
  console.log("Validating warehouse inputs...");
  const validated = validateWarehouseInputs(inputOptions);
  const { dbPath } = validated.options;
  const warehouseDir = path.dirname(dbPath);
  mkdirSync(warehouseDir, { recursive: true });
  const tempPath = path.join(warehouseDir, `.${path.basename(dbPath)}.${process.pid}.${Date.now()}.${randomBytes(4).toString("hex")}.tmp`);
  removeSqliteFamily(tempPath);
  try {
    console.log(`Building temporary warehouse: ${tempPath}`);
    const built = buildTemporaryDatabase(tempPath, validated);
    fsyncFile(tempPath);
    const verification = verifyWarehouseDatabase(tempPath, validated, built.semanticHashes);
    removeSqliteSidecars(tempPath);
    let promotedStats;
    promoteDatabaseAtomic(tempPath, dbPath, (promotedPath) => {
      verifyWarehouseDatabase(promotedPath, validated, built.semanticHashes);
      promotedStats = warehouseStats(promotedPath);
      removeSqliteSidecars(promotedPath);
    });
    return { ...promotedStats, verification };
  } catch (error) {
    removeSqliteFamily(tempPath);
    throw error;
  }
}

export function parseWarehouseArgs(argv) {
  const optionNames = new Map([
    ["--build", "build"],
    ["--data-root", "dataRoot"],
    ["--extract-root", "extractRoot"],
    ["--questlog-root", "questlogRoot"],
    ["--decoded-baseline", "decodedBaselinePath"],
    ["--db-path", "dbPath"],
  ]);
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    const [name, inlineValue] = argument.split(/=(.*)/s, 2);
    const property = optionNames.get(name);
    invariant(property, `unknown argument: ${argument}`);
    const value = inlineValue ?? argv[++index];
    invariant(value !== undefined && value !== "", `missing value for ${name}`);
    result[property] = value;
  }
  return result;
}

function printHelp() {
  console.log("Usage: node scripts/build-warehouse.mjs [--build N] [--data-root PATH] [--extract-root PATH] [--questlog-root PATH] [--decoded-baseline PATH] [--db-path PATH]");
  console.log("Environment: TL_STEAM_BUILD, TL_DATA_ROOT, TL_EXTRACT_ROOT, TL_QUESTLOG_ROOT");
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const args = parseWarehouseArgs(process.argv.slice(2));
    if (args.help) printHelp();
    else console.log(JSON.stringify(buildWarehouse(args), null, 1));
  } catch (error) {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  }
}
