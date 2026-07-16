// Reproducible coverage audit: Questlog public snapshots + web/data/app-data.json
// versus the local static game extraction in D:\TL_Extracted.
//
// Usage:  node scripts/audit-questlog-coverage.mjs
// Env:    TL_EXTRACT_ROOT to point at a different extraction root.
//
// Outputs (out/coverage-audit/):
//   summary.json                    counts + validation of stated facts
//   questlog-assets-matched.csv     every icon path Questlog/app references, with local match
//   local-assets-unreferenced.csv   extracted PNGs nothing in Questlog references
//   candidate-missing-items.csv     item records present on one side only
//   candidate-missing-skills.csv    skill records present on one side only
//   uncovered-table-families.md     extracted table families vs Questlog coverage
//   table-decoder-priority.md       ranked decoding targets
//
// Matching rules (in confidence order):
//   1. exact normalized asset path        (exact_path / exact_path_ci)
//   2. exact internal ID                  (id_exact)
//   3. normalized display name            (name_match — always reported as ambiguous)
// Fuzzy matches are never reported as confirmed.

import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AssetCaseIndex } from "./lib/asset-case-index.mjs";
import { loadWebDataFromFile } from "./lib/load-web-projections.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STEAM_BUILD = process.env.TL_STEAM_BUILD ?? "24118850";
// Extraction root resolution: explicit TL_EXTRACT_ROOT wins; otherwise the
// build-scoped snapshot under TL_DATA_ROOT; otherwise the legacy location.
const EXTRACT_ROOT =
  process.env.TL_EXTRACT_ROOT ??
  (process.env.TL_DATA_ROOT
    ? path.join(process.env.TL_DATA_ROOT, "raw", STEAM_BUILD, "extracted")
    : "D:\\TL_Extracted");
const questlogDir = process.env.TL_QUESTLOG_ROOT
  ? path.resolve(process.env.TL_QUESTLOG_ROOT)
  : path.join(root, "out", "questlog-public");
const appDataPath = path.join(root, "web", "data", "app-data.json");
const texturesRoot = path.join(EXTRACT_ROOT, "textures", "TL", "Content");
const texturesIndexCsv = path.join(EXTRACT_ROOT, "indexes", "textures.csv");
const gameTablesCsv = path.join(EXTRACT_ROOT, "indexes", "game_tables.csv");
const enCsv = path.join(EXTRACT_ROOT, "localization", "csv", "en.csv");
const identifiersDir = path.join(EXTRACT_ROOT, "indexes");
const outDir = path.join(root, "out", "coverage-audit");

// Stated facts this audit must confirm or refute.
const EXPECTED = {
  appUniqueImagePaths: 2692,
  extractedPngTotal: 15020,
  equipmentIconPngs: 2455,
};

// ---------------------------------------------------------------- helpers

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file, header, rows) {
  const lines = [header.join(",")];
  for (const r of rows) lines.push(header.map((h) => csvCell(r[h])).join(","));
  writeFileSync(path.join(outDir, file), lines.join("\n") + "\n", "utf8");
  return rows.length;
}

function walkPngs(dir, base = dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPngs(full, base, acc);
    else if (entry.name.toLowerCase().endsWith(".png")) {
      acc.push(path.relative(base, full).replace(/\\/g, "/"));
    }
  }
  return acc;
}

function deepStrings(value, visit) {
  if (typeof value === "string") visit(value);
  else if (Array.isArray(value)) for (const v of value) deepStrings(v, visit);
  else if (value && typeof value === "object") for (const v of Object.values(value)) deepStrings(v, visit);
}

function values(objectLike) {
  return Array.isArray(objectLike) ? objectLike : Object.values(objectLike ?? {});
}

function loadTrpcRecords(file) {
  const raw = readFileSync(path.join(questlogDir, file), "utf8").replace(/^﻿/, "");
  const batch = JSON.parse(raw);
  return values(batch).flatMap((entry) => {
    const data = entry?.result?.data?.json ?? entry?.result?.data ?? entry;
    return values(data);
  });
}

function normName(name) {
  return String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Questlog icon field or CDN url -> "Game/Image/..." (no extension)
function iconToGamePath(icon) {
  let p = String(icon);
  const cdn = p.match(/^https:\/\/cdn\.questlog\.gg\/throne-and-liberty\/(.+?)(?:\.webp)?$/i);
  if (cdn) p = cdn[1];
  p = p.replace(/^\/+/, "").replace(/^assets\//i, "");
  const lastSlash = p.lastIndexOf("/");
  const lastDot = p.lastIndexOf(".");
  if (lastDot > lastSlash) p = p.slice(0, lastDot);
  return p;
}

// app-data.json "assets/icons/Game/Image/x.webp" -> "Game/Image/x"
function appPathToGamePath(p) {
  return p.replace(/^assets\/icons\//i, "").replace(/\.webp$/i, "");
}

// "Game/Image/x" -> extracted path relative to textures/TL/Content: "Image/x.png"
function gamePathToLocalRel(gamePath) {
  return gamePath.replace(/^Game\//i, "") + ".png";
}

// ---------------------------------------------------------------- 1. local texture inventory

console.log("Scanning extracted textures...");
const pngList = walkPngs(texturesRoot); // paths like "Image/Icon/Item_128/Equip/Weapon/IT_P_Bow_00002.png"
const pngIndex = new AssetCaseIndex(pngList);
const pngByLc = new Map(pngList.map((p) => [p.toLowerCase(), p]));
const pngCollisions = pngIndex.collisions();
const equipmentPngs = pngList.filter((p) => p.toLowerCase().startsWith("image/icon/item_128/equip/"));

// dimensions from the prebuilt texture index (RelativePath is relative to .../Content/Image)
const texDims = new Map();
if (existsSync(texturesIndexCsv)) {
  const rows = parseCsv(readFileSync(texturesIndexCsv, "utf8"));
  for (const r of rows.slice(1)) {
    if (r.length < 5) continue;
    texDims.set(("Image/" + r[0].replace(/\\/g, "/")).toLowerCase(), { width: r[2], height: r[3], bytes: r[4] });
  }
}

// ---------------------------------------------------------------- 2. referenced asset paths

console.log("Collecting app-data.json image paths...");
const appData = await loadWebDataFromFile(appDataPath);
const appPaths = new Set();
deepStrings(appData, (s) => {
  if (/^assets\/icons\/.+\.webp$/i.test(s)) appPaths.add(s);
});

console.log("Collecting raw Questlog snapshot icon paths...");
const snapshotFiles = readdirSync(questlogDir).filter((f) => f.endsWith(".json"));
// gamePath(lc) -> { gamePath, rawExample, domains:Set }
const questlogIcons = new Map();
for (const file of snapshotFiles) {
  const domain = file.replace(/\.json$/, "");
  const parsed = JSON.parse(readFileSync(path.join(questlogDir, file), "utf8").replace(/^﻿/, ""));
  deepStrings(parsed, (s) => {
    if (!s.includes("assets/Game/") && !/^\/?assets\/Game\//i.test(s)) return;
    const gamePath = iconToGamePath(s);
    if (!/^Game\//i.test(gamePath)) return;
    const key = gamePath.toLowerCase();
    if (!questlogIcons.has(key)) questlogIcons.set(key, { gamePath, rawExample: s, domains: new Set() });
    questlogIcons.get(key).domains.add(domain);
  });
}

// union of referenced assets: key = gamePath lowercase
const referenced = new Map(); // key -> { gamePath, rawExample, domains, appPath }
for (const [key, entry] of questlogIcons) referenced.set(key, { ...entry, appPath: "" });
for (const appPath of appPaths) {
  const gamePath = appPathToGamePath(appPath);
  const key = gamePath.toLowerCase();
  if (!referenced.has(key)) referenced.set(key, { gamePath, rawExample: "", domains: new Set(["app-data"]) });
  referenced.get(key).appPath = appPath;
  referenced.get(key).domains.add("app-data");
}

// ---------------------------------------------------------------- 3. asset matching

const assetRows = [];
const referencedLocalLc = new Set();
const casingRows = [];
let appMatched = 0, appTotalMatchedCi = 0;
for (const entry of [...referenced.values()].sort((a, b) => a.gamePath.localeCompare(b.gamePath))) {
  const rel = gamePathToLocalRel(entry.gamePath);
  const lookup = pngIndex.lookup(rel);
  casingRows.push({ query: rel, status: lookup.status, match: lookup.match ?? "", candidates: lookup.candidates.length });
  const hit = lookup.match ?? (lookup.status === "ambiguous" ? lookup.candidates[0] : undefined);
  let matchMethod = "none";
  if (hit) {
    matchMethod = lookup.status === "exact" ? "exact_path" : lookup.status === "ambiguous" ? "exact_path_ambiguous" : "exact_path_ci";
    referencedLocalLc.add(hit.toLowerCase());
    if (entry.appPath) {
      appMatched++;
      if (matchMethod !== "exact_path") appTotalMatchedCi++;
    }
  }
  assetRows.push({
    assetGamePath: entry.gamePath,
    matched: hit ? "yes" : "no",
    matchMethod,
    localPng: hit ? "textures/TL/Content/" + hit : "",
    appImagePath: entry.appPath,
    questlogIconExample: entry.rawExample,
    sources: [...entry.domains].sort().join(";"),
  });
}
const unmatchedAssets = assetRows.filter((r) => r.matched === "no");

// ---------------------------------------------------------------- 4. unreferenced local assets

const CLASSIFY_SUBTREES = [
  ["image/icon/item_128/equip/", "equipment-icon"],
  ["image/icon/item_128/", "item-icon"],
  ["image/icon/item_256/", "item-icon-large"],
  ["image/icon/item_blueprint", "item-blueprint-icon"],
  ["image/skill/active/", "skill-icon"],
  ["image/skill/specialization/", "skill-icon"],
  ["image/skill/weaponspecialization/", "mastery-icon"],
  ["image/skill/skilltrait/", "skill-trait-icon"],
  ["image/skill/", "status-effect-icon"],
  ["image/traiticon/", "trait-ui-icon"],
  ["image/monster/", "npc-portrait"],
  ["image/codex/", "codex-art"],
  ["image/mapicon/", "map-ui"],
  ["image/maparea/", "map-ui"],
  ["image/guide/", "guide-art"],
  ["image/loading/", "loading-art"],
  ["image/dungeon/", "dungeon-ui"],
  ["image/achievement/", "achievement-icon"],
  ["image/journal/", "journal-art"],
  ["image/memorial/", "memorial-art"],
  ["image/dialogue/", "dialogue-portrait"],
  ["image/costumesystem/", "costume-ui"],
  ["image/bmshop/", "shop-ui"],
  ["image/housing", "housing-ui"],
];

function classifyLocalPng(relLc) {
  for (const [prefix, label] of CLASSIFY_SUBTREES) if (relLc.startsWith(prefix)) return label;
  const segs = relLc.split("/");
  return segs.length > 1 ? `other:${segs[1]}` : "other";
}

const unreferencedRows = pngList
  .filter((p) => !referencedLocalLc.has(p.toLowerCase()))
  .sort()
  .map((p) => {
    const lc = p.toLowerCase();
    const dims = texDims.get(lc) ?? {};
    const family = p.split("/").slice(0, 3).join("/");
    return {
      localPng: "textures/TL/Content/" + p,
      family,
      classification: classifyLocalPng(lc),
      width: dims.width ?? "",
      height: dims.height ?? "",
      bytes: dims.bytes ?? "",
    };
  });

// ---------------------------------------------------------------- 5. localization + identifier inventories

console.log("Parsing localization (en.csv)...");
const locRows = parseCsv(readFileSync(enCsv, "utf8")).slice(1);
const equipNames = new Map();   // itemId -> display name (TLItemLooks_Equip)
const itemNames = new Map();    // itemId -> display name (TLItemLooks, incl. _0_ variant)
const skillNames = new Map();   // skillId -> display name (TEXT_SKILL_NAME_*)
for (const [ns, key, , translation] of locRows) {
  if (!key) continue;
  if (ns === "TLItemLooks_Equip") {
    const m = key.match(/^(.+)_UIName$/);
    if (m) equipNames.set(m[1], translation);
  } else if (ns === "TLItemLooks") {
    const m = key.match(/^(.+?)(?:_0)?_UIName$/);
    if (m && !m[1].endsWith("_Blueprint")) itemNames.set(m[1], translation);
  } else if (ns && ns.startsWith("TLStringSkillDesc")) {
    const m = key.match(/^TEXT_SKILL_NAME_(.+)$/);
    if (m) skillNames.set(m[1], translation);
  }
}

function loadIdentifiers(name) {
  const file = path.join(identifiersDir, name);
  if (!existsSync(file)) return new Set();
  return new Set(readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean));
}
const statsIds = loadIdentifiers("TLItemStats.identifiers.txt");
const tlSkillIds = loadIdentifiers("TLSkill.identifiers.txt");
const runeIds = loadIdentifiers("TLRuneInfo.identifiers.txt");

// ---------------------------------------------------------------- 6. Questlog record inventories

const qItems = loadTrpcRecords("characterBuilder.getEquipmentItems.json");
const qRunes = loadTrpcRecords("characterBuilder.getEquipmentRunes.json");
const qSkillSets = loadTrpcRecords("skillBuilder.getSkillSets.json");
const qTraits = loadTrpcRecords("skillBuilder.getSkillTraits.json");
const qMasteries = loadTrpcRecords("weaponSpecialization.getWeaponSpecializations.json");

const qItemIds = new Set(qItems.map((i) => i.id));
const qItemsByNormName = new Map();
for (const item of qItems) {
  const key = normName(item.name);
  if (!key) continue;
  if (!qItemsByNormName.has(key)) qItemsByNormName.set(key, []);
  qItemsByNormName.get(key).push(item.id);
}

const qSkillIdsStripped = new Set();
const qSkillSetAndSpecIds = new Set();
for (const s of qSkillSets) {
  qSkillIdsStripped.add(String(s.id).replace(/^SkillSet_/, ""));
  for (const spec of values(s.specializations)) if (spec?.id) qSkillIdsStripped.add(String(spec.id).replace(/^SkillSet_/, ""));
}
for (const id of qSkillIdsStripped) qSkillSetAndSpecIds.add(id);
// Trait IDs join the coverage universe (they prefix-match their parent skill),
// but their absence from TLSkill is expected — traits live in a separate table —
// so they are excluded from the questlog_only comparison below.
for (const t of qTraits) qSkillIdsStripped.add(String(t.id).replace(/^SkillSet_/, ""));
const qSkillNames = new Set(qSkillSets.map((s) => normName(s.name)).filter(Boolean));

// ---------------------------------------------------------------- 7. candidate missing items

function classifyItem(id, name) {
  if (/^\[unused\]/i.test(name)) return "unused-labeled";
  if (/test/i.test(id) || /\btest\b/i.test(name) || /^bd_/.test(id)) return "test-dev";
  if (/event/i.test(id) || /\bevent\b/i.test(name)) return "event";
  if (!name) return "unnamed-no-localization";
  if (/deprecated|not in use|do not use/i.test(name)) return "deprecated-labeled";
  return "possible-player-accessible";
}

const localItemUniverse = new Set([...equipNames.keys(), ...statsIds]);
const itemRows = [];
for (const id of [...localItemUniverse].sort()) {
  if (qItemIds.has(id)) continue;
  const name = equipNames.get(id) ?? itemNames.get(id) ?? "";
  const evidence = [];
  if (equipNames.has(id)) evidence.push("localization:TLItemLooks_Equip");
  else if (itemNames.has(id)) evidence.push("localization:TLItemLooks");
  if (statsIds.has(id)) evidence.push("table:TLItemStats");
  const nameHits = name ? (qItemsByNormName.get(normName(name)) ?? []) : [];
  const classification = classifyItem(id, name);
  let confidence = "low";
  if (nameHits.length) confidence = "ambiguous-name-collision";
  else if (name && evidence.length >= 2 && classification === "possible-player-accessible") confidence = "medium";
  itemRows.push({
    direction: "local_only",
    itemId: id,
    name,
    evidence: evidence.join(";"),
    sourcePath: evidence[0]?.startsWith("localization")
      ? "localization/csv/en.csv"
      : "indexes/TLItemStats.identifiers.txt",
    matchMethod: nameHits.length ? "id_absent+name_match" : "id_absent",
    possibleQuestlogIds: nameHits.join(";"),
    confidence,
    classification,
  });
}
// Questlog records with no local ID evidence
for (const item of [...qItems].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
  if (equipNames.has(item.id) || itemNames.has(item.id) || statsIds.has(item.id)) continue;
  itemRows.push({
    direction: "questlog_only",
    itemId: item.id,
    name: item.name ?? "",
    evidence: "questlog:characterBuilder.getEquipmentItems",
    sourcePath: path.join(questlogDir, "characterBuilder.getEquipmentItems.json"),
    matchMethod: "id_absent_locally",
    possibleQuestlogIds: "",
    confidence: "low",
    classification: "unmatched-locally (identifier extraction may be incomplete)",
  });
}

// ---------------------------------------------------------------- 8. candidate missing skills

const PLAYER_WEAPON_CODES = ["BO", "CL", "CR", "DA", "GT", "ORB", "SH", "SP", "ST", "SW2", "SW", "WA"];
const playerSkillRe = new RegExp(`^WP_(${PLAYER_WEAPON_CODES.join("|")})_`);
const localPlayerSkills = [...tlSkillIds].filter((id) => playerSkillRe.test(id)).sort();
const qSkillsSorted = [...qSkillIdsStripped].sort((a, b) => b.length - a.length);

function coveredBase(candidate) {
  for (const q of qSkillsSorted) {
    if (candidate === q) return { kind: "exact", id: q };
    if (candidate.startsWith(q + "_")) return { kind: "variant", id: q };
  }
  return null;
}

function skillIconEvidence(id) {
  const guesses = [
    `image/skill/active/s_${id.toLowerCase()}.png`,
    `image/skill/active/s_${id.toLowerCase().replace(/_s_/, "_")}.png`,
    `image/skill/passive/s_${id.toLowerCase().replace(/_s_/, "_")}.png`,
  ];
  for (const g of guesses) { const hit = pngByLc.get(g); if (hit) return hit; }
  return "";
}

function classifySkill(id, name, cover) {
  if (cover?.kind === "variant") return "variant-of-covered-skill";
  if (/_copy(_|$)/i.test(id)) return "dev-copy";
  if (/^\[unused\]/i.test(name)) return "unused-labeled";
  if (/not in use|deprecated/i.test(name)) return "deprecated-labeled";
  if (/test/i.test(id)) return "test-dev";
  if (/^WP_CL_/.test(id)) return "prototype-weapon (WP_CL claw)";
  if (/event|halloween/i.test(id)) return "event";
  if (!name) return "unnamed-no-localization";
  return "unmatched-base";
}

const skillRows = [];
for (const id of localPlayerSkills) {
  const cover = coveredBase(id);
  if (cover?.kind === "exact") continue;
  const name = skillNames.get(id) ?? "";
  const icon = skillIconEvidence(id);
  const classification = classifySkill(id, name, cover);
  const nameAmbiguous = name && qSkillNames.has(normName(name));
  let confidence = "low";
  if (nameAmbiguous) confidence = "ambiguous-name-collision";
  else if (classification === "unmatched-base" && name && icon) confidence = "medium";
  skillRows.push({
    direction: "local_only",
    skillId: id,
    name,
    weaponCode: id.split("_")[1],
    evidence: ["table:TLSkill", name ? "localization:TEXT_SKILL_NAME" : "", icon ? "icon:" + icon : ""].filter(Boolean).join(";"),
    sourcePath: "indexes/TLSkill.identifiers.txt",
    matchMethod: cover ? `id_absent+variant_of:${cover.id}` : (nameAmbiguous ? "id_absent+name_match" : "id_absent"),
    confidence,
    classification,
  });
}
for (const id of [...qSkillSetAndSpecIds].sort()) {
  if (tlSkillIds.has(id)) continue;
  skillRows.push({
    direction: "questlog_only",
    skillId: "SkillSet_" + id,
    name: "",
    weaponCode: id.startsWith("WP_") ? id.split("_")[1] : "",
    evidence: "questlog:skillBuilder",
    sourcePath: path.join(questlogDir, "skillBuilder.getSkillSets.json"),
    matchMethod: "id_absent_locally",
    confidence: "low",
    classification: "unmatched-locally (identifier extraction may be incomplete)",
  });
}

// ---------------------------------------------------------------- 9. table families

const tableRows = parseCsv(readFileSync(gameTablesCsv, "utf8")).slice(1)
  .filter((r) => r.length >= 5)
  .map((r) => ({ table: r[0], relPath: r[1], rawBytes: Number(r[4] || 0), rowStruct: r[5] ?? "" }));

const SUFFIX_TOKEN = /^(L\d+\w*|C|M|H|AD|AGS|\d+|Common|Event|Carnival|Resource|Item|Live|BP|Costume|SideEpisode|BattleGround|DungeonAffix|Halloween|Nebula|Tower|Mafia|Rift|Vagamont|Tuaren|TumgirRuins|Calanthia|Codex|LandOfSnowlight|ScarOfOblivion|SilentFrozenLand|SnowfieldOfChaos|Bow|Crossbow|Dagger|Gauntlet|Orb|Spear|Staff|Sword|Sword2h|Wand|Weapon|WeaponMastery|TimeSpace|Boss|Contract|CustomGame|MagicDoll)$/i;

function familyOf(table) {
  let base = table.replace(/^TLString/, "TL").replace(/_AGS$/i, "");
  const tokens = base.split("_");
  while (tokens.length > 1 && SUFFIX_TOKEN.test(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join("_");
}

const families = new Map();
for (const t of tableRows) {
  const fam = familyOf(t.table);
  if (!families.has(fam)) families.set(fam, { family: fam, tables: [], rawBytes: 0, hasStrings: false });
  const f = families.get(fam);
  f.tables.push(t.table);
  f.rawBytes += t.rawBytes;
  if (/^TLString/.test(t.table)) f.hasStrings = true;
}

// Curated Questlog coverage. Everything not listed is uncovered by Questlog.
const COVERAGE = new Map(Object.entries({
  TLSkill: ["partial", "Questlog covers player skill sets/specializations/traits only; table also holds NPC, abnormal-state, and affix rows"],
  TLSkillLevelSetting: ["partial", "per-level values appear inside Questlog skill levels"],
  TLSkillLevelUpRecipe: ["uncovered", "skill growth costs absent from Questlog"],
  TLSkillOptionalDataForPc: ["uncovered", "client-side per-skill option data absent from Questlog"],
  TLSkillDesc: ["partial", "Questlog carries descriptions for player skills only"],
  TLRuneInfo: ["covered", "Questlog getEquipmentRunes matches"],
  TLRuneGrowth: ["covered", "rune stat growth reflected in Questlog rune stat tables"],
  TLRuneSynergy: ["covered", "Questlog getRuneSynergies matches"],
  TLItemStats: ["partial", "computed below: only part of local IDs appear in Questlog"],
  TLItemLooks: ["partial", "names/icons for Questlog-listed equipment only"],
  TLTableWeaponSpecializationLooks: ["covered", "all mastery UIName keys match Questlog mastery ids"],
  TLWeaponSpecialization: ["covered", "Questlog getWeaponSpecializations"],
  TLWeaponCategorySkillSet: ["covered", "implicit in Questlog skill/weapon mapping"],
}));

function familyCoverage(fam) {
  if (COVERAGE.has(fam)) return COVERAGE.get(fam);
  for (const [key, val] of COVERAGE) if (fam.startsWith(key)) return val;
  return ["uncovered", ""];
}

const familyList = [...families.values()].sort((a, b) => b.rawBytes - a.rawBytes);

// ---------------------------------------------------------------- 10. write outputs

mkdirSync(outDir, { recursive: true });

const counts = {
  assetRows: writeCsv("questlog-assets-matched.csv",
    ["assetGamePath", "matched", "matchMethod", "localPng", "appImagePath", "questlogIconExample", "sources"], assetRows),
  unreferencedRows: writeCsv("local-assets-unreferenced.csv",
    ["localPng", "family", "classification", "width", "height", "bytes"], unreferencedRows),
  itemRows: writeCsv("candidate-missing-items.csv",
    ["direction", "itemId", "name", "evidence", "sourcePath", "matchMethod", "possibleQuestlogIds", "confidence", "classification"], itemRows),
  skillRows: writeCsv("candidate-missing-skills.csv",
    ["direction", "skillId", "name", "weaponCode", "evidence", "sourcePath", "matchMethod", "confidence", "classification"], skillRows),
};

const localOnlyItems = itemRows.filter((r) => r.direction === "local_only");
const localOnlySkills = skillRows.filter((r) => r.direction === "local_only");
const groupBy = (rows, key) => {
  const m = {};
  for (const r of rows) m[r[key]] = (m[r[key]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
};

const statsInQuestlog = [...statsIds].filter((id) => qItemIds.has(id)).length;
const equipNamesInQuestlog = [...equipNames.keys()].filter((id) => qItemIds.has(id)).length;

const validations = {
  appUniqueImagePaths: { expected: EXPECTED.appUniqueImagePaths, actual: appPaths.size, pass: appPaths.size === EXPECTED.appUniqueImagePaths },
  appImagePathsAllMatchLocally: {
    expected: appPaths.size, actual: appMatched, pass: appMatched === appPaths.size,
    caseInsensitiveOnlyMatches: appTotalMatchedCi,
  },
  extractedPngTotal: { expected: EXPECTED.extractedPngTotal, actual: pngList.length, pass: pngList.length === EXPECTED.extractedPngTotal },
  equipmentIconPngs: { expected: EXPECTED.equipmentIconPngs, actual: equipmentPngs.length, pass: equipmentPngs.length === EXPECTED.equipmentIconPngs },
};

const summary = {
  generatedAtUtc: new Date().toISOString(),
  inputs: {
    extractRoot: EXTRACT_ROOT,
    appData: path.relative(root, appDataPath),
    questlogSnapshots: snapshotFiles,
  },
  validations,
  assets: {
    referencedUnique: referenced.size,
    referencedByAppOnly: appPaths.size,
    matched: assetRows.length - unmatchedAssets.length,
    matchedCaseInsensitiveOnly: assetRows.filter((r) => r.matchMethod === "exact_path_ci").length,
    unmatched: unmatchedAssets.length,
    unmatchedList: unmatchedAssets.map((r) => r.assetGamePath),
    extractedPngTotal: pngList.length,
    extractedEquipmentPngs: equipmentPngs.length,
    localUnreferenced: unreferencedRows.length,
    localUnreferencedByClassification: groupBy(unreferencedRows, "classification"),
  },
  items: {
    questlogEquipmentItems: qItems.length,
    localEquipNameIds: equipNames.size,
    localItemStatsIds: statsIds.size,
    localEquipNameIdsInQuestlog: equipNamesInQuestlog,
    localItemStatsIdsInQuestlog: statsInQuestlog,
    localOnlyCandidates: localOnlyItems.length,
    localOnlyByClassification: groupBy(localOnlyItems, "classification"),
    questlogOnly: itemRows.length - localOnlyItems.length,
  },
  skills: {
    questlogSkillSets: qSkillSets.length,
    questlogTraits: qTraits.length,
    questlogStrippedIdUniverse: qSkillIdsStripped.size,
    localTlSkillIdentifiers: tlSkillIds.size,
    localPlayerWeaponSkillIds: localPlayerSkills.length,
    localOnlyCandidates: localOnlySkills.length,
    localOnlyByClassification: groupBy(localOnlySkills, "classification"),
    questlogOnly: skillRows.length - localOnlySkills.length,
  },
  runes: {
    questlogRunes: qRunes.length,
    localRuneInfoIdentifiers: runeIds.size,
  },
  masteries: { questlogMasteries: qMasteries.length },
  tables: {
    totalTables: tableRows.length,
    families: families.size,
    coveredFamilies: familyList.filter((f) => familyCoverage(f.family)[0] === "covered").length,
    partialFamilies: familyList.filter((f) => familyCoverage(f.family)[0] === "partial").length,
    uncoveredFamilies: familyList.filter((f) => familyCoverage(f.family)[0] === "uncovered").length,
    uncoveredRawBytes: familyList.filter((f) => familyCoverage(f.family)[0] === "uncovered").reduce((a, f) => a + f.rawBytes, 0),
  },
  outputRowCounts: counts,
};
writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");

// asset-casing-report.json: exact / case_insensitive / ambiguous / missing +
// collisions inside the extraction itself. See scripts/lib/asset-case-index.mjs.
{
  const byStatus = {};
  for (const r of casingRows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  writeFileSync(path.join(outDir, "asset-casing-report.json"), JSON.stringify({
    generatedAtUtc: summary.generatedAtUtc,
    totals: byStatus,
    extractedPathCollisions: pngCollisions,
    caseInsensitiveMatches: casingRows.filter((r) => r.status === "case_insensitive"),
    ambiguousMatches: casingRows.filter((r) => r.status === "ambiguous"),
    missing: casingRows.filter((r) => r.status === "missing"),
  }, null, 2), "utf8");
}

// uncovered-table-families.md
{
  const mb = (b) => (b / 1024 / 1024).toFixed(2);
  const lines = [
    "# Extracted table families vs Questlog coverage",
    "",
    `Generated by scripts/audit-questlog-coverage.mjs on ${summary.generatedAtUtc}.`,
    "",
    `Source index: \`${path.join(EXTRACT_ROOT, "indexes", "game_tables.csv")}\` (${tableRows.length} tables, grouped into ${families.size} families by stripping locale/region/weapon suffixes; \`TLStringX\` merges into \`TLX\`).`,
    "",
    "Coverage says whether the *data domain* is reachable through the Questlog public read procedures used by this app. \"partial\" means Questlog exposes a player-facing slice of a much larger table. Raw bytes are the preserved `.uasset` payload sizes — a proxy for row volume awaiting a TLJsonDataTable decoder.",
    "",
    "| Family | Tables | Raw MB | Strings | Questlog coverage | Note |",
    "| --- | ---: | ---: | :---: | --- | --- |",
  ];
  const small = [];
  for (const f of familyList) {
    const [status, note] = familyCoverage(f.family);
    if (f.rawBytes < 100 * 1024 && status === "uncovered") { small.push(f); continue; }
    const extra = f.family === "TLItemStats"
      ? `${statsInQuestlog} of ${statsIds.size} local IDs appear in Questlog`
      : note;
    lines.push(`| ${f.family} | ${f.tables.length} | ${mb(f.rawBytes)} | ${f.hasStrings ? "yes" : ""} | ${status} | ${extra} |`);
  }
  lines.push("");
  lines.push(`Plus ${small.length} further uncovered families under 100 KB each (${mb(small.reduce((a, f) => a + f.rawBytes, 0))} MB total): ${small.slice(0, 40).map((f) => f.family).join(", ")}${small.length > 40 ? ", …" : ""}.`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- covered families: ${summary.tables.coveredFamilies}`);
  lines.push(`- partial families: ${summary.tables.partialFamilies}`);
  lines.push(`- uncovered families: ${summary.tables.uncoveredFamilies} (${mb(summary.tables.uncoveredRawBytes)} MB of raw table payload)`);
  lines.push("");
  writeFileSync(path.join(outDir, "uncovered-table-families.md"), lines.join("\n"), "utf8");
}

// table-decoder-priority.md
{
  const mb = (b) => (b / 1024 / 1024).toFixed(2);
  const famBytes = (name) => families.get(name)?.rawBytes ?? 0;
  const PRIORITIES = [
    ["TLItemLooks + TLItemEquip + TLItemStats", ["TLItemLooks", "TLItemEquip", "TLItemStats"],
      "Complete item database. Localization already names 3,455 equipment items vs 1,752 in Questlog; decoding links every item ID to icon, slot, grade, and stats without depending on Questlog."],
    ["TLItemCombatPower", ["TLItemCombatPower"],
      "The app currently ships a fitted combat-power heuristic (web/tl-questlog-rules.js). This table is the real thing."],
    ["TLItemEnchant family", ["TLItemEnchant", "TLItemEnchantProbability", "TLItemEnchantTransfer", "TLItemExtraLevelStat", "TLItemExtraStatEnchant", "TLItemExtraStatInit"],
      "Upgrade/enchant planning for the tracker: costs, probabilities, transfer rules — none of it in Questlog."],
    ["TLSkillLevelUpRecipe", ["TLSkillLevelUpRecipe"],
      "Skill growth material costs; complements skill data the app already has."],
    ["TLCraftingRecipe + TLCookingRecipe families", ["TLCraftingRecipe", "TLCraftingRecipeGroup", "TLCraftingMaterialGroup", "TLCookingRecipe", "TLProcessingRecipe"],
      "Crafting/cooking loops feed the daily/weekly tracker; identifier lists already extracted, rows not decoded."],
    ["TLRewardNpcFoItem + reward tables", ["TLRewardNpcFoItem"],
      "Drop sources: which NPC/objects reward which items — pure gap today."],
    ["TLItemCollection + TLCodex families", ["TLItemCollection", "TLCodexCollection", "TLCodexNpcManage"],
      "Collection/codex progress tracking, a natural tracker feature."],
    ["TLAchievement", ["TLAchievement"],
      "Achievement conditions/rewards for the tracker."],
    ["TLSkill (full) + TLAbnormalState", ["TLSkill", "TLAbnormalState"],
      "Full skill table incl. NPC skills and status effects — big, valuable for tooltips of buffs/debuffs, but player slice is already covered via Questlog."],
  ];
  const lines = [
    "# TLJsonDataTable decoding priority",
    "",
    `Generated by scripts/audit-questlog-coverage.mjs on ${summary.generatedAtUtc}. Sizes are preserved raw-package bytes from the extraction.`,
    "",
    "Ranked by value to the tracker/armory app versus what Questlog already provides. See uncovered-table-families.md for the full coverage map and plans/upcoming-content-radar/decoder-investigation.md for the format investigation.",
    "",
    "| # | Target | Raw MB (matched families) | Why |",
    "| ---: | --- | ---: | --- |",
  ];
  PRIORITIES.forEach(([label, fams, why], i) => {
    const bytes = fams.reduce((a, f) => a + famBytes(f), 0);
    lines.push(`| ${i + 1} | ${label} | ${mb(bytes)} | ${why} |`);
  });
  lines.push("");
  writeFileSync(path.join(outDir, "table-decoder-priority.md"), lines.join("\n"), "utf8");
}

// ---------------------------------------------------------------- console report

console.log(JSON.stringify({ validations, outputRowCounts: counts }, null, 2));
for (const [name, v] of Object.entries(validations)) {
  if (!v.pass) console.error(`VALIDATION FAILED: ${name} expected ${v.expected} got ${v.actual}`);
}
console.log(`Wrote ${Object.keys(counts).length + 3} files to ${path.relative(root, outDir)}`);
