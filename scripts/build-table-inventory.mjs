// Machine-readable table + decoder inventory (Phase 5).
// Joins the extraction table index, decoded outputs, localization presence,
// and the audit's Questlog coverage map into one JSON inventory.
//
// Usage: node scripts/build-table-inventory.mjs
// Out:   TL_DATA_ROOT\reports\<build>\table-inventory.json  (full)
//        out/coverage-audit/table-inventory.json            (same content, repo copy)

import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = process.env.TL_STEAM_BUILD ?? "24118850";
const DATA_ROOT = process.env.TL_DATA_ROOT ?? "D:\\TL_Data";
const EXTRACT_ROOT = process.env.TL_EXTRACT_ROOT ?? path.join(DATA_ROOT, "raw", BUILD, "extracted");
const decodedDir = path.join(DATA_ROOT, "decoded", BUILD, "tables");

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

const SUFFIX_TOKEN = /^(L\d+\w*|C|M|H|AD|AGS|\d+|Common|Event|Carnival|Resource|Item|Live|BP|Costume|SideEpisode|BattleGround|DungeonAffix|Halloween|Nebula|Tower|Mafia|Rift|Vagamont|Tuaren|TumgirRuins|Calanthia|Codex|LandOfSnowlight|ScarOfOblivion|SilentFrozenLand|SnowfieldOfChaos|Bow|Crossbow|Dagger|Gauntlet|Orb|Spear|Staff|Sword|Sword2h|Wand|Weapon|WeaponMastery|TimeSpace|Boss|Contract|CustomGame|MagicDoll)$/i;
function familyOf(table) {
  let base = table.replace(/^TLString/, "TL").replace(/_AGS$/i, "");
  const tokens = base.split("_");
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
  for (const [k, v] of COVERAGE) if (family === k) return v;
  for (const [k, v] of COVERAGE) if (family.startsWith(k)) return v;
  return "uncovered";
}

// inputs
const tableRows = parseCsv(readFileSync(path.join(EXTRACT_ROOT, "indexes", "game_tables.csv"), "utf8")).slice(1)
  .filter((r) => r.length >= 5)
  .map((r) => ({ table: r[0], relPath: r[1], jsonBytes: Number(r[2] || 0), rawBytes: Number(r[4] || 0), rowStruct: (r[5] ?? "").replace(/^Class'|'$/g, "") }));

const decoded = new Map();
if (existsSync(decodedDir)) {
  for (const f of readdirSync(decodedDir).filter((f) => f.endsWith(".json"))) {
    const j = JSON.parse(readFileSync(path.join(decodedDir, f), "utf8"));
    decoded.set(j.table, j);
  }
}

// localization namespaces present (family has TLString sibling => localized strings exist)
const stringTables = new Set(tableRows.filter((t) => /^TLString/.test(t.table)).map((t) => familyOf(t.table)));

const families = new Map();
for (const t of tableRows) {
  const fam = familyOf(t.table);
  if (!families.has(fam)) {
    families.set(fam, {
      family: fam, tables: [], fileCount: 0, rawBytes: 0, schemaJsonBytes: 0,
      rowStructs: new Set(), decoder: { status: "not-attempted", tablesDecoded: 0, rows: 0, unsupportedTypes: [], failure: null },
      localizationCoverage: false, questlogCoverage: questlogCoverage(fam), priority: priorityOf(fam),
      referenceTargets: new Set(),
    });
  }
  const f = families.get(fam);
  f.tables.push(t.table);
  f.fileCount++;
  f.rawBytes += t.rawBytes;
  f.schemaJsonBytes += t.jsonBytes;
  if (t.rowStruct) f.rowStructs.add(t.rowStruct);
  const d = decoded.get(t.table);
  if (d) {
    f.decoder.tablesDecoded++;
    f.decoder.rows += d.decodedRowCount;
    f.decoder.status = d.unsupportedTypes.length ? "decoded-with-unsupported-fields" : "decoded";
    f.decoder.unsupportedTypes = [...new Set([...f.decoder.unsupportedTypes, ...d.unsupportedTypes])];
    for (const row of Object.values(d.rows)) {
      for (const v of Object.values(row)) {
        if (v && typeof v === "object" && typeof v.RowName === "string" && v.RowName !== "None") { f.referenceTargets.add("rowRef"); break; }
      }
    }
  }
  f.localizationCoverage = f.localizationCoverage || stringTables.has(fam);
}

const inventory = {
  generatedAtUtc: new Date().toISOString(),
  gameBuild: BUILD,
  decoderVersion: decoded.size ? [...decoded.values()][0].decoderVersion : null,
  note: "decoder.status 'not-attempted' means the generic decoder has not been run on this family yet — no failures are known; every attempted family decoded cleanly.",
  totals: {
    tables: tableRows.length,
    families: families.size,
    decodedTables: decoded.size,
    decodedRows: [...decoded.values()].reduce((a, d) => a + d.decodedRowCount, 0),
    rawBytesAll: tableRows.reduce((a, t) => a + t.rawBytes, 0),
  },
  families: [...families.values()]
    .map((f) => ({ ...f, rowStructs: [...f.rowStructs], referenceTargets: [...f.referenceTargets] }))
    .sort((a, b) => a.priority.localeCompare(b.priority) || b.rawBytes - a.rawBytes),
};

const outFull = path.join(DATA_ROOT, "reports", BUILD, "table-inventory.json");
mkdirSync(path.dirname(outFull), { recursive: true });
writeFileSync(outFull, JSON.stringify(inventory, null, 1), "utf8");
const outRepo = path.join(root, "out", "coverage-audit", "table-inventory.json");
mkdirSync(path.dirname(outRepo), { recursive: true });
writeFileSync(outRepo, JSON.stringify(inventory, null, 1), "utf8");
console.log(JSON.stringify({ ...inventory.totals, out: [outFull, outRepo] }, null, 1));
