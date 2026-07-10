// Generic row decoder for Throne and Liberty's custom TLJsonDataTable packages
// (Zen/IoStore .uasset exports preserved under <extract>/data/.../Table/*.uasset).
//
// Format (verified against TLRuneInfo, build 24118850):
//   - Zen package: summary header, FSerializedNameHeader name table,
//     import/export maps, then export blob(s).
//   - The TLJsonDataTable export serializes like a stock UDataTable:
//     tagged UObject properties (terminated by FName "None"), an int32 row
//     count, then per row: FName rowId + tagged FProperty stream until "None".
//   - Tagged serialization is self-describing (property name, type name, size),
//     so rows decode without a .usmap. Unknown property types are skipped by
//     size and reported, never silently dropped.
//
// Usage:
//   node scripts/decode-tljson-table.mjs <Table.uasset> [more.uasset...] [--out <dir>]
//   node scripts/decode-tljson-table.mjs --all-priority   (decode a curated set)
//
// Output: <out>/<TableName>.json  { table, sourcePath, sha256, rowCount, rows,
//          unsupported, warnings, decoderVersion }

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

export const DECODER_VERSION = "0.1.0";
const EXTRACT_ROOT = process.env.TL_EXTRACT_ROOT ?? "D:\\TL_Extracted";
const DATA_ROOT = process.env.TL_DATA_ROOT ?? "D:\\TL_Data";
const BUILD = process.env.TL_STEAM_BUILD ?? "24118850";

const PRIORITY_TABLES = [
  "TLRuneInfo", "TLSkillLevelSetting", "TLItemStats", "TLItemEquip",
  "TLSkill", "TLRuneGrowth", "TLRuneSynergy", "TLItemCombatPower",
  "TLPassiveSkillLooks", "TLAbnormalState_Common", "TLCraftingRecipe",
  "TLCookingRecipe", "TLRewardNpcFoItem", "TLItemLooks_Equip", "TLItemLooks",
  "TLSkillLevelUpRecipe", "TLItemAttackSpeedBaseline", "TLItemStatAttrConverter",
];

// ---------------------------------------------------------------- low level

class Reader {
  constructor(buf, names) { this.buf = buf; this.names = names; this.p = 0; this.warnings = []; }
  u8() { return this.buf[this.p++]; }
  i32() { const v = this.buf.readInt32LE(this.p); this.p += 4; return v; }
  u32() { const v = this.buf.readUInt32LE(this.p); this.p += 4; return v; }
  i64() { const v = this.buf.readBigInt64LE(this.p); this.p += 8; return v; }
  f32() { const v = this.buf.readFloatLE(this.p); this.p += 4; return v; }
  f64() { const v = this.buf.readDoubleLE(this.p); this.p += 8; return v; }
  fname() {
    const idx = this.u32(), num = this.u32();
    const base = this.names[idx];
    if (base === undefined) return `<name:${idx}>`;
    return num ? `${base}_${num - 1}` : base;
  }
  fstring() {
    const len = this.i32();
    if (len === 0) return "";
    if (len > 0) { const s = this.buf.slice(this.p, this.p + len - 1).toString("latin1"); this.p += len; return s; }
    const n = -len; const s = this.buf.slice(this.p, this.p + n * 2 - 2).toString("utf16le"); this.p += n * 2; return s;
  }
}

function parseNameTable(buf) {
  // The name table begins with the package's own object path string; anchor there.
  const anchor = buf.indexOf(Buffer.from("/Game/"));
  if (anchor < 2) throw new Error("no /Game/ anchor found — not a recognized Zen table package");
  let off = anchor - 2;
  const names = [];
  while (off < buf.length - 2) {
    const b0 = buf[off], b1 = buf[off + 1];
    const utf16 = (b0 & 0x80) !== 0;
    const len = ((b0 & 0x7f) << 8) | b1;
    if (len === 0 || len > 1024) break;
    const bytes = len * (utf16 ? 2 : 1);
    const s = buf.slice(off + 2, off + 2 + bytes).toString(utf16 ? "utf16le" : "latin1");
    if (!utf16 && !/^[\x09\x0a\x0d\x20-\x7e -￿]*$/.test(s)) break;
    names.push(s);
    off += 2 + bytes;
  }
  return { names, endOffset: off };
}

// ---------------------------------------------------------------- tagged properties

function readValue(r, type, size, tagExtra, depth) {
  switch (type) {
    case "IntProperty": return r.i32();
    case "UInt32Property": return r.u32();
    case "Int64Property": case "UInt64Property": return String(r.i64());
    case "FloatProperty": return r.f32();
    case "DoubleProperty": return r.f64();
    case "ByteProperty": return size === 8 ? r.fname() : r.u8();
    case "EnumProperty": return r.fname();
    case "NameProperty": return r.fname();
    case "StrProperty": return r.fstring();
    case "ObjectProperty": return { objectIndex: r.i32() };
    case "SoftObjectProperty": {
      const start = r.p; const asset = r.fname(); const sub = r.fstring();
      r.p = start + size;
      return { assetPath: asset, subPath: sub };
    }
    case "StructProperty": {
      if (tagExtra.structName === "TLDataHandle") {
        // observed layout (41 bytes): tagged inner props (DataTable ObjectProperty,
        // RowName NameProperty) — decode as nested tagged stream.
        return readTaggedStruct(r, r.p + size, depth + 1);
      }
      return readTaggedStruct(r, r.p + size, depth + 1);
    }
    case "ArrayProperty": {
      const end = r.p + size;
      const count = r.i32();
      const inner = tagExtra.innerType;
      const out = [];
      if (inner === "StructProperty") {
        // UE4.12+: one inner FPropertyTag describing the struct, then elements
        const innerTag = readTag(r);
        if (innerTag.name === "None") { r.p = end; return out; }
        for (let i = 0; i < count; i++) out.push(readTaggedStruct(r, end, depth + 1));
        r.p = end;
        return out;
      }
      const simple = { IntProperty: () => r.i32(), UInt32Property: () => r.u32(), FloatProperty: () => r.f32(), NameProperty: () => r.fname(), EnumProperty: () => r.fname(), ByteProperty: () => r.u8(), StrProperty: () => r.fstring(), ObjectProperty: () => ({ objectIndex: r.i32() }), BoolProperty: () => r.u8() !== 0 };
      if (simple[inner]) { for (let i = 0; i < count; i++) out.push(simple[inner]()); r.p = end; return out; }
      r.p = end;
      return { unsupportedArrayInner: inner, count };
    }
    case "TextProperty": {
      const end = r.p + size;
      try {
        r.u32(); // flags
        const historyType = r.buf.readInt8(r.p); r.p += 1;
        if (historyType === -1) { // None
          const hasCultureInvariant = r.u32();
          const text = hasCultureInvariant ? r.fstring() : "";
          r.p = end;
          return text;
        }
        if (historyType === 0) { // Base: namespace, key, source
          const ns = r.fstring(), key = r.fstring(), source = r.fstring();
          r.p = end;
          return { ns, key, text: source };
        }
        if (historyType === 11) { // StringTableEntry: table FName + key FString
          const stringTable = r.fname(), key = r.fstring();
          r.p = end;
          return { stringTable, key };
        }
      } catch { /* fall through to raw skip */ }
      r.p = end;
      return { textBytes: size };
    }
    case "MapProperty": case "SetProperty": { r.p += size; return { unsupported: type, bytes: size }; }
    default: { r.p += size; return { unsupported: type, bytes: size }; }
  }
}

function readTaggedStruct(r, hardEnd, depth = 0) {
  const obj = {};
  if (depth > 12) { r.p = hardEnd; return { unsupported: "depth" }; }
  while (r.p < r.buf.length) {
    const tag = readTag(r);
    if (tag.name === "None" || tag.name === null) break;
    const valueEnd = r.p + tag.size;
    let value;
    try {
      value = readValue(r, tag.type, tag.size, tag.extra, depth);
    } catch (e) {
      r.warnings.push(`value read failed for ${tag.name}(${tag.type}): ${e.message}`);
      value = { error: true };
    }
    if (tag.type !== "BoolProperty" && tag.type !== "ArrayProperty" && tag.type !== "StructProperty" && r.p !== valueEnd) {
      // resync by declared size — tagged format guarantees this is safe
      r.p = valueEnd;
    }
    if (tag.type === "StructProperty" || tag.type === "ArrayProperty") r.p = valueEnd;
    obj[tag.arrayIndex ? `${tag.name}[${tag.arrayIndex}]` : tag.name] = tag.type === "BoolProperty" ? tag.boolValue : value;
    if (hardEnd && r.p >= hardEnd) break;
  }
  return obj;
}

function readTag(r) {
  const name = r.fname();
  if (name === "None") return { name: "None" };
  const type = r.fname();
  const size = r.i32();
  const arrayIndex = r.i32();
  const extra = {};
  if (type === "StructProperty") { extra.structName = r.fname(); r.p += 16; }
  else if (type === "EnumProperty" || type === "ByteProperty") { extra.enumName = r.fname(); }
  else if (type === "ArrayProperty" || type === "SetProperty") { extra.innerType = r.fname(); }
  else if (type === "MapProperty") { extra.keyType = r.fname(); extra.valueType = r.fname(); }
  let boolValue;
  if (type === "BoolProperty") boolValue = r.u8() !== 0;
  const hasGuid = r.u8();
  if (hasGuid) r.p += 16;
  return { name, type, size, arrayIndex, extra, boolValue };
}

// ---------------------------------------------------------------- table decode

export function decodeTable(filePath) {
  const buf = readFileSync(filePath);
  const { names, endOffset } = parseNameTable(buf);
  const nameIndex = new Map(names.map((n, i) => [n, i]));
  const noneIdx = nameIndex.get("None");
  if (noneIdx === undefined) throw new Error("name table has no 'None'");

  // Locate the export's UObject property stream: first valid FPropertyTag
  // ([nameIdx][0][typeIdx of a *Property name][0]) after the name table.
  // The export blob then reads: tagged UObject props … None, u32 guid flag,
  // i32 rowCount, rows (verified layout on build 24118850).
  const propTypeIdx = new Set(names.map((n, i) => (/Property$/.test(n) ? i : -1)).filter((i) => i >= 0));
  let exportStart = -1;
  for (let i = endOffset; i < buf.length - 24; i++) {
    const pn = buf.readUInt32LE(i);
    if (pn >= names.length || names[pn] === "None" || /Property$/.test(names[pn]) || buf.readUInt32LE(i + 4) !== 0) continue;
    const tt = buf.readUInt32LE(i + 8);
    if (!propTypeIdx.has(tt) || buf.readUInt32LE(i + 12) !== 0) continue;
    exportStart = i;
    break;
  }
  if (exportStart < 0) throw new Error("could not locate export property stream");

  const r = new Reader(buf, names);
  r.p = exportStart;
  readTaggedStruct(r, 0); // UObject properties (RowStruct handle etc.) — consumed, not rows
  r.u32(); // serialized guid flag (observed 0)
  const rowCount = r.i32();
  if (rowCount < 0 || rowCount > 5_000_000) throw new Error(`implausible row count ${rowCount} at ${r.p - 4}`);
  const rows = {};
  const unsupported = new Set();
  let decoded = 0;
  for (let i = 0; i < rowCount; i++) {
    const rowName = r.fname();
    const row = readTaggedStruct(r, 0);
    for (const v of Object.values(row)) {
      if (v && typeof v === "object" && v.unsupported) unsupported.add(v.unsupported);
    }
    rows[rowName] = row;
    decoded++;
  }
  return {
    table: path.basename(filePath, ".uasset"),
    sourcePath: filePath,
    sha256: createHash("sha256").update(buf).digest("hex"),
    gameBuild: BUILD,
    decoderVersion: DECODER_VERSION,
    declaredRowCount: rowCount,
    decodedRowCount: decoded,
    unsupportedTypes: [...unsupported],
    warnings: r.warnings.slice(0, 50),
    trailingBytes: buf.length - r.p,
    rows,
  };
}

// ---------------------------------------------------------------- CLI

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPathSafe());
function fileURLToPathSafe() {
  try { return new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"); } catch { return ""; }
}

if (isMain) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outDir = outIdx >= 0 ? args.splice(outIdx, 2)[1] : path.join(DATA_ROOT, "decoded", BUILD, "tables");
  let targets = args.filter((a) => !a.startsWith("--"));
  if (args.includes("--all-priority")) {
    targets = PRIORITY_TABLES.map((t) => path.join(EXTRACT_ROOT, "data", "TL", "Content", "Game", "Client", "Table", `${t}.uasset`));
  }
  if (!targets.length) {
    console.error("usage: node scripts/decode-tljson-table.mjs <Table.uasset>... [--out dir] | --all-priority");
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });
  const report = [];
  for (const t of targets) {
    const name = path.basename(t, ".uasset");
    if (!existsSync(t)) { report.push({ table: name, status: "missing" }); continue; }
    const started = Date.now();
    try {
      const result = decodeTable(t);
      writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(result), "utf8");
      report.push({
        table: name, status: "ok", rows: result.decodedRowCount, declared: result.declaredRowCount,
        unsupported: result.unsupportedTypes, warnings: result.warnings.length,
        trailingBytes: result.trailingBytes, ms: Date.now() - started,
      });
    } catch (e) {
      report.push({ table: name, status: "error", error: e.message, ms: Date.now() - started });
    }
  }
  console.log(JSON.stringify(report, null, 1));
  const failed = report.filter((x) => x.status === "error").length;
  console.log(`decoded ${report.filter((x) => x.status === "ok").length}/${report.length} tables -> ${outDir} (${failed} errors)`);
}
