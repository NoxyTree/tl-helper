#!/usr/bin/env node

// Machine-readable table + decoder inventory (Phase 5).
// Joins the extraction table index, decoded outputs, localization presence,
// and the audit's Questlog coverage map into one JSON inventory.
//
// Usage: node scripts/build-table-inventory.mjs
// Out:   TL_DATA_ROOT\reports\<build>\table-inventory.json  (full)
//        out/coverage-audit/table-inventory.json            (identical repo copy)

import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BUILD = process.env.TL_STEAM_BUILD ?? "24118850";
const DEFAULT_DATA_ROOT = process.env.TL_DATA_ROOT ?? "D:\\TL_Data";

const NODE_FILE_OPERATIONS = Object.freeze({
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
});

// Domains the roadmap prioritizes (combat first).
const PRIORITY_RULES = [
  [/^TL(Skill|AbnormalState|PassiveSkill|GuildSkill|WeaponCategorySkillSet|SkillLevel)/, "P1-combat"],
  [/^TL(Stats|BaseMainStat|PCInitialStat|PCLevelStat|PcDynamicStat|BasicStatBonus|ContentStatLimit|FormulaParameter)/, "P1-combat"],
  [/^TLItem(Stats|Equip|CombatPower|AttackSpeedBaseline|StatAttrConverter|MainLevelStat|ExtraLevelStat|MaterialStat|MainStatInit|ExtraStat)/, "P1-combat"],
  [/^TLItem(Looks|Enchant|RandomStat|UsableGroup|Usable$)/, "P2-items"],
  [/^TLRune/, "P2-items"],
  [/^TL(CraftingRecipe|CookingRecipe|ProcessingRecipe|FurnishingRecipe|SkillLevelUpRecipe)/, "P3-recipes"],
  [/^TL(RewardNpcFoItem|Reward|ItemLottery)/, "P3-loot"],
  [/^TL(Npc|Fo$|Fo_|FoState)/, "P4-npc-monsters"],
  [/^TL(Quest|Dialogue)/, "P5-quests"],
  [/^TL(Achievement|Codex|ItemCollection|GrowthPass|SeasonPass|StarJourney)/, "P5-progression"],
];

function priorityOf(family) {
  for (const [re, label] of PRIORITY_RULES) if (re.test(family)) return label;
  return "P9-low";
}

export function parseCsv(text) {
  if (typeof text !== "string") throw new TypeError("CSV input must be text");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const character = input[i];
    if (quoted) {
      if (character === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += character;
  }
  if (quoted) throw new Error("game_tables.csv contains an unterminated quoted field");
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function requireNonNegativeInteger(value, label) {
  if (!/^\d+$/.test(String(value))) throw new Error(`${label} must be a non-negative integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${label} exceeds the safe integer range`);
  return number;
}

export function parseAndValidateTableIndex(csvText, source = "game_tables.csv") {
  const rows = parseCsv(csvText);
  if (rows.length < 2) throw new Error(`${source} must contain a header and at least one table row`);
  const headers = rows[0];
  const duplicateHeaders = headers.filter((header, index) => header && headers.indexOf(header) !== index);
  if (duplicateHeaders.length) throw new Error(`${source} contains duplicate columns: ${[...new Set(duplicateHeaders)].join(", ")}`);
  const required = ["Table", "RelativePath", "JsonBytes", "RawPackageBytes", "RowStructObjectName"];
  const indexes = Object.fromEntries(required.map((name) => [name, headers.indexOf(name)]));
  const missing = required.filter((name) => indexes[name] < 0);
  if (missing.length) throw new Error(`${source} is missing required columns: ${missing.join(", ")}`);

  const tables = [];
  const seen = new Set();
  rows.slice(1).forEach((row, offset) => {
    const line = offset + 2;
    if (row.length > headers.length) throw new Error(`${source}:${line} has more fields than the header`);
    const table = String(row[indexes.Table] ?? "").trim();
    const relPath = String(row[indexes.RelativePath] ?? "").trim();
    if (!table) throw new Error(`${source}:${line} has an empty Table value`);
    if (!relPath) throw new Error(`${source}:${line} has an empty RelativePath value`);
    if (seen.has(table)) throw new Error(`${source}:${line} duplicates table ${table}`);
    seen.add(table);
    tables.push({
      table,
      relPath,
      jsonBytes: requireNonNegativeInteger(row[indexes.JsonBytes] ?? "", `${source}:${line} JsonBytes`),
      rawBytes: requireNonNegativeInteger(row[indexes.RawPackageBytes] ?? "", `${source}:${line} RawPackageBytes`),
      rowStruct: String(row[indexes.RowStructObjectName] ?? "").replace(/^Class'|'$/g, ""),
    });
  });
  return tables;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateDecodedTable(value, { file, build, indexedTables }) {
  if (!isPlainObject(value)) throw new Error(`${file} must contain a JSON object`);
  if (typeof value.table !== "string" || !value.table.trim()) throw new Error(`${file} has no valid table name`);
  if (String(value.gameBuild) !== String(build)) {
    throw new Error(`${file} game build ${value.gameBuild ?? "<missing>"} does not match ${build}`);
  }
  if (!indexedTables.has(value.table)) throw new Error(`${file} table ${value.table} is absent from game_tables.csv`);
  if (typeof value.sourcePath !== "string" || !value.sourcePath.trim()) throw new Error(`${file} has no sourcePath`);
  if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.sha256)) throw new Error(`${file} has no valid source sha256`);
  if (typeof value.decoderVersion !== "string" || !value.decoderVersion.trim()) {
    throw new Error(`${file} has no decoderVersion`);
  }
  if (!Number.isSafeInteger(value.declaredRowCount) || value.declaredRowCount < 0) {
    throw new Error(`${file} declaredRowCount must be a non-negative safe integer`);
  }
  if (!Number.isSafeInteger(value.decodedRowCount) || value.decodedRowCount < 0) {
    throw new Error(`${file} decodedRowCount must be a non-negative safe integer`);
  }
  if (!isPlainObject(value.rows)) throw new Error(`${file} rows must be an object`);
  const actualRows = Object.keys(value.rows).length;
  if (actualRows !== value.decodedRowCount) {
    throw new Error(`${file} decodedRowCount ${value.decodedRowCount} does not match ${actualRows} rows`);
  }
  if (value.declaredRowCount !== value.decodedRowCount) {
    throw new Error(`${file} declaredRowCount ${value.declaredRowCount} does not match decodedRowCount ${value.decodedRowCount}`);
  }
  if (Object.values(value.rows).some((row) => !isPlainObject(row))) throw new Error(`${file} contains a non-object decoded row`);
  if (!Array.isArray(value.unsupportedTypes) || value.unsupportedTypes.some((entry) => typeof entry !== "string")) {
    throw new Error(`${file} unsupportedTypes must be an array of strings`);
  }
  if (!Array.isArray(value.warnings)) throw new Error(`${file} warnings must be an array`);
  if (!Number.isSafeInteger(value.trailingBytes) || value.trailingBytes < 0) {
    throw new Error(`${file} trailingBytes must be a non-negative safe integer`);
  }
  return value;
}

const SUFFIX_TOKEN = /^(L\d+\w*|C|M|H|AD|AGS|\d+|Common|Event|Carnival|Resource|Item|Live|BP|Costume|SideEpisode|BattleGround|DungeonAffix|Halloween|Nebula|Tower|Mafia|Rift|Vagamont|Tuaren|TumgirRuins|Calanthia|Codex|LandOfSnowlight|ScarOfOblivion|SilentFrozenLand|SnowfieldOfChaos|Bow|Crossbow|Dagger|Gauntlet|Orb|Spear|Staff|Sword|Sword2h|Wand|Weapon|WeaponMastery|TimeSpace|Boss|Contract|CustomGame|MagicDoll)$/i;
function familyOf(table) {
  const tokens = table.replace(/^TLString/, "TL").replace(/_AGS$/i, "").split("_");
  while (tokens.length > 1 && SUFFIX_TOKEN.test(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join("_");
}

// Curated Questlog coverage (same source of truth as the audit script).
const COVERAGE = [
  ["TLSkill", "partial"], ["TLSkillLevelSetting", "partial"], ["TLSkillLevelUpRecipe", "uncovered"],
  ["TLSkillOptionalDataForPc", "uncovered"], ["TLSkillDesc", "partial"],
  ["TLRuneInfo", "covered"], ["TLRuneGrowth", "covered"], ["TLRuneSynergy", "covered"],
  ["TLItemStats", "partial"], ["TLItemLooks", "partial"],
  ["TLTableWeaponSpecializationLooks", "covered"], ["TLWeaponSpecialization", "covered"],
  ["TLWeaponCategorySkillSet", "covered"],
];
function questlogCoverage(family) {
  for (const [key, value] of COVERAGE) if (family === key) return value;
  for (const [key, value] of COVERAGE) if (family.startsWith(key)) return value;
  return "uncovered";
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function inventorySemanticIdentity(inventory) {
  const { generatedAtUtc: _generatedAtUtc, semanticIdentity: _semanticIdentity, ...semantic } = inventory;
  return createHash("sha256").update(JSON.stringify(canonicalize(semantic))).digest("hex");
}

export function createTableInventory({ tableRows, decoded, build, generatedAtUtc = new Date().toISOString() }) {
  const decodedVersions = [...new Set([...decoded.values()].map((table) => table.decoderVersion))].sort();
  const stringTables = new Set(tableRows.filter((table) => /^TLString/.test(table.table)).map((table) => familyOf(table.table)));
  const families = new Map();

  for (const table of tableRows) {
    const family = familyOf(table.table);
    if (!families.has(family)) {
      families.set(family, {
        family,
        tables: [],
        fileCount: 0,
        rawBytes: 0,
        schemaJsonBytes: 0,
        rowStructs: new Set(),
        decoder: { status: "not-attempted", tablesDecoded: 0, rows: 0, unsupportedTypes: [], failure: null },
        localizationCoverage: false,
        questlogCoverage: questlogCoverage(family),
        priority: priorityOf(family),
        referenceTargets: new Set(),
      });
    }
    const entry = families.get(family);
    entry.tables.push(table.table);
    entry.fileCount++;
    entry.rawBytes += table.rawBytes;
    entry.schemaJsonBytes += table.jsonBytes;
    if (table.rowStruct) entry.rowStructs.add(table.rowStruct);
    const decodedTable = decoded.get(table.table);
    if (decodedTable) {
      entry.decoder.tablesDecoded++;
      entry.decoder.rows += decodedTable.decodedRowCount;
      entry.decoder.status = decodedTable.unsupportedTypes.length || entry.decoder.status === "decoded-with-unsupported-fields"
        ? "decoded-with-unsupported-fields"
        : "decoded";
      entry.decoder.unsupportedTypes = [...new Set([...entry.decoder.unsupportedTypes, ...decodedTable.unsupportedTypes])].sort();
      for (const row of Object.values(decodedTable.rows)) {
        for (const value of Object.values(row)) {
          if (value && typeof value === "object" && typeof value.RowName === "string" && value.RowName !== "None") {
            entry.referenceTargets.add("rowRef");
            break;
          }
        }
      }
    }
    entry.localizationCoverage ||= stringTables.has(family);
  }

  const inventory = {
    generatedAtUtc,
    gameBuild: String(build),
    decoderVersion: decodedVersions.length === 0 ? null : decodedVersions.length === 1 ? decodedVersions[0] : "mixed",
    decoderVersions: decodedVersions,
    note: "decoder.status 'not-attempted' means the generic decoder has not been run on this family yet; no failures are known and every attempted family decoded cleanly.",
    totals: {
      tables: tableRows.length,
      families: families.size,
      decodedTables: decoded.size,
      decodedRows: [...decoded.values()].reduce((total, table) => total + table.decodedRowCount, 0),
      rawBytesAll: tableRows.reduce((total, table) => total + table.rawBytes, 0),
    },
    families: [...families.values()]
      .map((family) => ({
        ...family,
        tables: [...family.tables].sort(),
        rowStructs: [...family.rowStructs].sort(),
        referenceTargets: [...family.referenceTargets].sort(),
      }))
      .sort((a, b) => a.priority.localeCompare(b.priority)
        || b.rawBytes - a.rawBytes
        || a.family.localeCompare(b.family)),
  };
  inventory.semanticIdentity = {
    algorithm: "sha256",
    sha256: inventorySemanticIdentity(inventory),
    excludes: ["generatedAtUtc", "semanticIdentity"],
  };
  validateInventory(inventory);
  return inventory;
}

export function validateInventory(inventory) {
  if (!isPlainObject(inventory) || !isPlainObject(inventory.totals) || !Array.isArray(inventory.families)) {
    throw new Error("Generated inventory has an invalid shape");
  }
  for (const key of ["tables", "families", "decodedTables", "decodedRows", "rawBytesAll"]) {
    if (!Number.isSafeInteger(inventory.totals[key]) || inventory.totals[key] < 0) {
      throw new Error(`Generated inventory total ${key} is invalid`);
    }
  }
  const familyTables = inventory.families.reduce((total, family) => total + family.tables.length, 0);
  const familyDecodedTables = inventory.families.reduce((total, family) => total + family.decoder.tablesDecoded, 0);
  const familyDecodedRows = inventory.families.reduce((total, family) => total + family.decoder.rows, 0);
  if (inventory.families.length !== inventory.totals.families) throw new Error("Generated inventory family total does not match its families");
  if (familyTables !== inventory.totals.tables) throw new Error("Generated inventory table total does not match its families");
  if (familyDecodedTables !== inventory.totals.decodedTables) throw new Error("Generated inventory decoded-table total does not match its families");
  if (familyDecodedRows !== inventory.totals.decodedRows) throw new Error("Generated inventory decoded-row total does not match its families");
  const expectedIdentity = inventorySemanticIdentity(inventory);
  if (inventory.semanticIdentity?.algorithm !== "sha256" || inventory.semanticIdentity.sha256 !== expectedIdentity) {
    throw new Error("Generated inventory semantic identity is invalid");
  }
  const expectedExcludes = ["generatedAtUtc", "semanticIdentity"];
  if (!Array.isArray(inventory.semanticIdentity.excludes)
    || inventory.semanticIdentity.excludes.length !== expectedExcludes.length
    || inventory.semanticIdentity.excludes.some((entry, index) => entry !== expectedExcludes[index])) {
    throw new Error("Generated inventory semantic identity exclusions are invalid");
  }
  return inventory;
}

export function loadValidatedInventoryInputs({ build, extractRoot, decodedDir, operations = {} }) {
  const io = { ...NODE_FILE_OPERATIONS, ...operations };
  const indexFile = path.join(extractRoot, "indexes", "game_tables.csv");
  if (!io.existsSync(indexFile)) throw new Error(`Table index is missing: ${indexFile}`);
  const tableRows = parseAndValidateTableIndex(io.readFileSync(indexFile, "utf8"), indexFile);
  const indexedTables = new Set(tableRows.map((table) => table.table));
  const decoded = new Map();
  const files = io.existsSync(decodedDir)
    ? io.readdirSync(decodedDir).filter((file) => file.endsWith(".json")).sort()
    : [];
  for (const name of files) {
    const file = path.join(decodedDir, name);
    let parsed;
    try {
      parsed = JSON.parse(io.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    } catch (error) {
      throw new Error(`Decoded table is not valid JSON: ${file}: ${error.message}`);
    }
    validateDecodedTable(parsed, { file, build, indexedTables });
    if (decoded.has(parsed.table)) throw new Error(`Decoded table ${parsed.table} appears more than once`);
    decoded.set(parsed.table, parsed);
  }
  return { tableRows, decoded };
}

function validateSerializedInventory(serialized, expectedIdentity) {
  let inventory;
  try {
    inventory = JSON.parse(serialized);
  } catch (error) {
    throw new Error(`Staged inventory is not valid JSON: ${error.message}`);
  }
  validateInventory(inventory);
  if (inventory.semanticIdentity.sha256 !== expectedIdentity) throw new Error("Staged inventory semantic identity changed");
  return inventory;
}

function writeDurableTemporary(file, serialized, io) {
  const descriptor = io.openSync(file, "wx");
  try {
    io.writeFileSync(descriptor, serialized, "utf8");
    io.fsyncSync(descriptor);
  } finally {
    io.closeSync(descriptor);
  }
}

function bestEffortRemove(file, io) {
  try { io.rmSync(file, { force: true }); } catch { /* Retain recovery artifacts if removal is unavailable. */ }
}

export function publishInventoryCopies({ targets, serialized, expectedIdentity, operations = {} }) {
  const io = { ...NODE_FILE_OPERATIONS, ...operations };
  const resolvedTargets = targets.map((target) => path.resolve(target));
  if (resolvedTargets.length !== 2 || new Set(resolvedTargets).size !== 2) {
    throw new Error("Inventory publication requires two distinct output targets");
  }
  validateSerializedInventory(serialized, expectedIdentity);
  const token = `${process.pid}.${randomUUID()}`;
  const states = resolvedTargets.map((target) => ({
    target,
    temporary: `${target}.${token}.tmp`,
    backup: `${target}.${token}.bak`,
    backedUp: false,
    promoted: false,
  }));

  try {
    for (const state of states) {
      io.mkdirSync(path.dirname(state.target), { recursive: true });
      writeDurableTemporary(state.temporary, serialized, io);
      const staged = io.readFileSync(state.temporary, "utf8");
      if (staged !== serialized) throw new Error(`Staged inventory bytes changed for ${state.target}`);
      validateSerializedInventory(staged, expectedIdentity);
    }
    for (const state of states) {
      if (io.existsSync(state.target)) {
        // Retain the live target until its staged replacement is ready. This
        // avoids a missing-output window if the process stops during publish.
        io.copyFileSync(state.target, state.backup);
        state.backedUp = true;
      }
    }
    for (const state of states) {
      io.renameSync(state.temporary, state.target);
      state.promoted = true;
    }

    const published = states.map((state) => io.readFileSync(state.target, "utf8"));
    if (published[0] !== serialized || published[1] !== serialized || published[0] !== published[1]) {
      throw new Error("Published inventory copies are not byte-identical");
    }
    for (const content of published) validateSerializedInventory(content, expectedIdentity);
  } catch (error) {
    const rollbackErrors = [];
    for (const state of [...states].reverse()) {
      try {
        if (state.promoted) {
          if (state.backedUp && io.existsSync(state.backup)) {
            io.renameSync(state.backup, state.target);
            state.backedUp = false;
          } else if (io.existsSync(state.target)) io.rmSync(state.target, { force: true });
        }
      } catch (rollbackError) {
        rollbackErrors.push(new Error(`Could not restore ${state.target}: ${rollbackError.message}`));
      }
      bestEffortRemove(state.temporary, io);
      if (state.backedUp) bestEffortRemove(state.backup, io);
    }
    if (rollbackErrors.length) {
      throw new AggregateError([error, ...rollbackErrors], `Inventory publication failed and rollback was incomplete: ${error.message}`);
    }
    throw error;
  }

  for (const state of states) {
    bestEffortRemove(state.backup, io);
    bestEffortRemove(state.temporary, io);
  }
  return resolvedTargets;
}

export function defaultPaths({ build = DEFAULT_BUILD, dataRoot = DEFAULT_DATA_ROOT } = {}) {
  const resolvedDataRoot = path.resolve(dataRoot);
  const buildId = String(build);
  return {
    build: buildId,
    dataRoot: resolvedDataRoot,
    extractRoot: process.env.TL_EXTRACT_ROOT ?? path.join(resolvedDataRoot, "raw", buildId, "extracted"),
    decodedDir: path.join(resolvedDataRoot, "decoded", buildId, "tables"),
    outFull: path.join(resolvedDataRoot, "reports", buildId, "table-inventory.json"),
    outRepo: path.join(root, "out", "coverage-audit", "table-inventory.json"),
  };
}

export function buildTableInventoryFiles(options = {}) {
  const files = { ...defaultPaths(options), ...options };
  const inputs = loadValidatedInventoryInputs(files);
  const inventory = createTableInventory({
    ...inputs,
    build: files.build,
    generatedAtUtc: options.generatedAtUtc ?? new Date().toISOString(),
  });
  const serialized = `${JSON.stringify(inventory, null, 1)}\n`;
  const outputs = publishInventoryCopies({
    targets: [files.outFull, files.outRepo],
    serialized,
    expectedIdentity: inventory.semanticIdentity.sha256,
    operations: files.operations,
  });
  return { inventory, outputs };
}

export function main() {
  const { inventory, outputs } = buildTableInventoryFiles();
  console.log(JSON.stringify({
    ...inventory.totals,
    semanticIdentity: inventory.semanticIdentity.sha256,
    out: outputs,
  }, null, 1));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { main(); }
  catch (error) { console.error(error.stack ?? error.message); process.exitCode = 1; }
}
