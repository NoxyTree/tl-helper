// Builds the normalized SQLite warehouse from decoded TLJsonDataTable JSON,
// localization, the extracted asset index, and Questlog snapshots.
// Contract: docs/data-contract.md
//
// Usage: node scripts/build-warehouse.mjs
// Env:   TL_DATA_ROOT (default D:\TL_Data), TL_EXTRACT_ROOT, TL_STEAM_BUILD

import { readFileSync, readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { AssetCaseIndex, normalizeAssetKey } from "./lib/asset-case-index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = process.env.TL_STEAM_BUILD ?? "24118850";
const GAME_VERSION = "1.431.22.7761";
const DATA_ROOT = process.env.TL_DATA_ROOT ?? "D:\\TL_Data";
const EXTRACT_ROOT = process.env.TL_EXTRACT_ROOT ?? path.join(DATA_ROOT, "raw", BUILD, "extracted");
const decodedDir = path.join(DATA_ROOT, "decoded", BUILD, "tables");
const questlogDir = path.join(root, "out", "questlog-public");
const warehouseDir = path.join(DATA_ROOT, "warehouse");
const dbPath = path.join(warehouseDir, `tl-${BUILD}.sqlite`);

const RECORD_TYPE = {
  TLItemLooks_Equip: "item", TLItemLooks: "item", TLItemEquip: "item", TLItemStats: "item",
  TLItemCombatPower: "reference", TLItemAttackSpeedBaseline: "reference", TLItemStatAttrConverter: "reference",
  TLSkill: "skill", TLSkillLevelSetting: "reference", TLPassiveSkillLooks: "skill",
  TLAbnormalState_Common: "status_effect",
  TLCraftingRecipe: "recipe", TLCookingRecipe: "recipe", TLSkillLevelUpRecipe: "recipe",
  TLRewardNpcFoItem: "reward",
  TLRuneInfo: "rune", TLRuneGrowth: "rune", TLRuneSynergy: "rune",
};

// ------------------------------------------------------------ inputs

function parseCsv(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); field = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

console.log("Loading localization...");
const loc = new Map(); // "namespace|key" -> translation
for (const [ns, key, , tr] of parseCsv(readFileSync(path.join(EXTRACT_ROOT, "localization", "csv", "en.csv"), "utf8")).slice(1)) {
  if (ns && key) loc.set(ns + "|" + key, tr);
}

console.log("Indexing extracted PNGs...");
function walkPngs(dir, base = dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkPngs(full, base, acc);
    else if (e.name.toLowerCase().endsWith(".png")) acc.push(path.relative(base, full).replace(/\\/g, "/"));
  }
  return acc;
}
const texturesRoot = path.join(EXTRACT_ROOT, "textures", "TL", "Content");
const pngIndex = new AssetCaseIndex(walkPngs(texturesRoot));
const collisions = pngIndex.collisions();
if (collisions.length) throw new Error(`asset key collisions in extraction: ${JSON.stringify(collisions.slice(0, 3))}`);

console.log("Loading Questlog ID sets...");
function loadTrpc(file) {
  const raw = readFileSync(path.join(questlogDir, file), "utf8").replace(/^﻿/, "");
  const batch = JSON.parse(raw);
  const vals = (o) => (Array.isArray(o) ? o : Object.values(o ?? {}));
  return vals(batch).flatMap((e) => vals(e?.result?.data?.json ?? e?.result?.data ?? e));
}
const qItemIds = new Set(loadTrpc("characterBuilder.getEquipmentItems.json").map((i) => i.id));
const qSkillIds = new Set();
for (const s of loadTrpc("skillBuilder.getSkillSets.json")) {
  qSkillIds.add(String(s.id).replace(/^SkillSet_/, ""));
  for (const sp of Object.values(s.specializations ?? {})) if (sp?.id) qSkillIds.add(String(sp.id).replace(/^SkillSet_/, ""));
}

// icon path from a decoded row: SoftObjectProperty { assetPath } fields
function iconOf(row) {
  for (const key of ["IconPath", "Icon", "icon_path", "EffectIconPath"]) {
    const v = row[key];
    if (v && typeof v === "object" && typeof v.assetPath === "string" && v.assetPath) return v.assetPath;
  }
  return null;
}

// "/Game/Image/X.X" -> "Image/X.png" (relative to textures/TL/Content)
function iconToLocalRel(assetPath) {
  let p = assetPath.replace(/^\/Game\//i, "");
  const lastSlash = p.lastIndexOf("/"), lastDot = p.lastIndexOf(".");
  if (lastDot > lastSlash) p = p.slice(0, lastDot);
  return p + ".png";
}

// localization key guess per table
function locOf(table, rowId, row) {
  const ui = row.UIName;
  if (ui && typeof ui === "object" && ui.key) {
    const st = String(ui.stringTable ?? "");
    const ns = st.includes(".") ? st.slice(st.lastIndexOf(".") + 1).replace(/^TLString/, "TL") : "";
    for (const nsTry of [ns, "TLItemLooks_Equip", "TLItemLooks"]) {
      const hit = loc.get(nsTry + "|" + ui.key);
      if (hit !== undefined) return { key: ui.key, name: hit, state: "resolved" };
    }
    return { key: ui.key, name: null, state: "unresolved" };
  }
  if (table === "TLSkill") {
    for (const ns of ["TLStringSkillDesc", "TLStringSkillDesc_Item"]) {
      const hit = loc.get(ns + "|TEXT_SKILL_NAME_" + rowId);
      if (hit !== undefined) return { key: "TEXT_SKILL_NAME_" + rowId, name: hit, state: "resolved" };
    }
    // weapon-specific namespaces
    for (const [k, v] of loc) {
      if (k.endsWith("|TEXT_SKILL_NAME_" + rowId)) return { key: "TEXT_SKILL_NAME_" + rowId, name: v, state: "resolved" };
    }
  }
  return { key: null, name: null, state: "none" };
}

function collectRefs(value, fieldPath, out) {
  if (!value || typeof value !== "object") return;
  if (typeof value.RowName === "string" && value.RowName !== "None") out.push({ field: fieldPath, to: value.RowName });
  for (const [k, v] of Object.entries(value)) if (k !== "RowName") collectRefs(v, fieldPath ? fieldPath + "." + k : k, out);
}

// ------------------------------------------------------------ build

mkdirSync(warehouseDir, { recursive: true });
if (existsSync(dbPath)) rmSync(dbPath); // idempotent full rebuild
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
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

const insRecord = db.prepare(`INSERT INTO records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insRef = db.prepare(`INSERT INTO refs VALUES (?,?,?)`);
const insAsset = db.prepare(`INSERT OR IGNORE INTO assets VALUES (?,?,?,0)`);
const insFts = db.prepare(`INSERT INTO records_fts VALUES (?,?,?)`);

function familyOf(table) {
  let base = table.replace(/^TLString/, "TL").replace(/_AGS$/i, "");
  const SUF = /^(L\d+\w*|C|M|H|AD|\d+|Common|Event|Item|Live|BP|Weapon|Bow|Crossbow|Dagger|Gauntlet|Orb|Spear|Staff|Sword|Sword2h|Wand|Equip)$/i;
  const tokens = base.split("_");
  while (tokens.length > 1 && SUF.test(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join("_");
}

let recordCount = 0, refCount = 0;
db.exec("BEGIN");
for (const file of readdirSync(decodedDir).filter((f) => f.endsWith(".json")).sort()) {
  const t = JSON.parse(readFileSync(path.join(decodedDir, file), "utf8"));
  const table = t.table;
  const type = RECORD_TYPE[table] ?? "reference";
  const family = familyOf(table);
  for (const [rowId, row] of Object.entries(t.rows)) {
    const recordId = `${table}:${rowId}`;
    const { key, name, state } = locOf(table, rowId, row);
    const icon = iconOf(row);
    let iconKey = null, iconExists = null;
    if (icon) {
      const rel = iconToLocalRel(icon);
      iconKey = normalizeAssetKey(rel);
      const lookup = pngIndex.lookup(rel);
      iconExists = lookup.status === "missing" ? 0 : 1;
      insAsset.run(iconKey, icon, iconExists);
    }
    let ql = null;
    if (table === "TLItemStats" || table === "TLItemEquip" || table === "TLItemLooks_Equip") ql = qItemIds.has(rowId) ? 1 : 0;
    if (table === "TLSkill") ql = qSkillIds.has(rowId) ? 1 : 0;
    insRecord.run(
      recordId, rowId, type, table, family,
      t.sourcePath, t.sha256, BUILD, GAME_VERSION, t.decoderVersion,
      "en", name, key, state,
      icon, iconKey, iconExists,
      JSON.stringify(row),
      "decoded", ql, "extracted", BUILD, BUILD,
    );
    insFts.run(recordId, rowId, name ?? "");
    const refs = [];
    collectRefs(row, "", refs);
    for (const r of refs) { insRef.run(recordId, r.field, r.to); refCount++; }
    recordCount++;
  }
}
for (const [k, v] of Object.entries({
  game_build: BUILD, game_version: GAME_VERSION, locale: "en",
  builtAtUtc: new Date().toISOString(), extractRoot: EXTRACT_ROOT,
  contract: "docs/data-contract.md v1",
})) db.prepare("INSERT INTO meta VALUES (?,?)").run(k, v);
db.exec("COMMIT");

const stats = {
  dbPath,
  records: recordCount,
  refs: refCount,
  assets: db.prepare("SELECT COUNT(*) c FROM assets").get().c,
  byType: Object.fromEntries(db.prepare("SELECT record_type, COUNT(*) c FROM records GROUP BY record_type").all().map((r) => [r.record_type, r.c])),
  locResolved: db.prepare("SELECT COUNT(*) c FROM records WHERE loc_state='resolved'").get().c,
  questlogPresent: db.prepare("SELECT COUNT(*) c FROM records WHERE questlog_present=1").get().c,
  questlogComparable: db.prepare("SELECT COUNT(*) c FROM records WHERE questlog_present IS NOT NULL").get().c,
};
db.close();
console.log(JSON.stringify(stats, null, 1));
