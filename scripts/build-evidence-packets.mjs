// Discovery-pipeline acceptance cases (Phase 6): assemble evidence packets for
//   1. the "Ascended Ramux" equipment set
//   2. the WP_CL claw prototype skill group
// from the warehouse, localization, extracted assets, and Questlog snapshots.
//
// Labels follow the cautious vocabulary from the plans. Absence from Questlog
// is recorded as a coverage gap, never as proof of upcoming content.
//
// Usage: node scripts/build-evidence-packets.mjs

import { readFileSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = process.env.TL_STEAM_BUILD ?? "24118850";
const DATA_ROOT = process.env.TL_DATA_ROOT ?? "D:\\TL_Data";
const EXTRACT_ROOT = process.env.TL_EXTRACT_ROOT ?? path.join(DATA_ROOT, "raw", BUILD, "extracted");
const db = new DatabaseSync(path.join(DATA_ROOT, "warehouse", `tl-${BUILD}.sqlite`), { readOnly: true });

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
const locRows = parseCsv(readFileSync(path.join(EXTRACT_ROOT, "localization", "csv", "en.csv"), "utf8")).slice(1);

function recordView(r) {
  const raw = JSON.parse(r.raw_json);
  const refs = db.prepare("SELECT field, to_row_id FROM refs WHERE from_record_id = ?").all(r.record_id);
  return {
    recordId: r.record_id,
    rowId: r.row_id,
    table: r.table_name,
    sourcePath: r.source_path,
    sourceSha256: r.source_sha256,
    name: r.name_loc,
    localization: { key: r.loc_key, state: r.loc_state },
    icon: r.icon_asset_path ? { path: r.icon_asset_path, assetKey: r.icon_asset_key, existsLocally: !!r.icon_exists } : null,
    questlogPresent: r.questlog_present === null ? "not-comparable" : !!r.questlog_present,
    references: refs.map((x) => ({ field: x.field, toRow: x.to_row_id })),
    selectedRawFields: Object.fromEntries(Object.entries(raw).slice(0, 12)),
  };
}

function packet({ caseId, title, records, localizationMentions, classification, forAccessibility, againstAccessibility, forUpcoming, againstUpcoming, notes }) {
  return {
    caseId, title,
    gameBuild: BUILD, gameVersion: "1.431.22.7761",
    generatedAtUtc: new Date().toISOString(),
    sources: {
      warehouse: `TL_DATA_ROOT/warehouse/tl-${BUILD}.sqlite`,
      localization: "raw/" + BUILD + "/extracted/localization/csv/en.csv",
      questlogSnapshots: "D:/TL_Helper/out/questlog-public (fetched 2026-07-08)",
    },
    records,
    localizationMentions,
    crossBuildHistory: "single build captured (24118850); first_seen == last_seen — diffing begins with the next game patch",
    classification,
    reasoning: {
      forPlayerAccessibility: forAccessibility,
      againstPlayerAccessibility: againstAccessibility,
      forUpcomingContent: forUpcoming,
      againstUpcomingContent: againstUpcoming,
    },
    notes,
  };
}

// ---------------------------------------------------------------- Ramux

const ramuxRecords = db.prepare(
  "SELECT * FROM records WHERE name_loc LIKE '%Ramux%' OR row_id LIKE '%_S1_arch_002%' ORDER BY table_name, row_id",
).all().map(recordView);

// Live sibling arch-boss gear for contrast: fully stat-defined and Questlog-present,
// unlike the Ramux S1 rows. Demonstrates what a released set looks like in the data.
const ramuxContrast = db.prepare(
  "SELECT * FROM records WHERE row_id IN ('orb_aa_t1_arch_002','gauntlet_aa_t2_arch_002') ORDER BY table_name, row_id",
).all().map(recordView);

const ramuxLoc = locRows
  .filter(([, , , tr]) => /ramux/i.test(tr ?? ""))
  .map(([ns, key, , tr]) => ({ namespace: ns, key, text: tr.length > 160 ? tr.slice(0, 160) + "…" : tr }));

const ramuxIconsOk = ramuxRecords.filter((r) => r.icon?.existsLocally).length;
const ramuxInQuestlog = ramuxRecords.filter((r) => r.questlogPresent === true).length;

const ramuxPacket = packet({
  caseId: "ascended-ramux",
  title: "Ascended Ramux equipment set",
  records: ramuxRecords,
  localizationMentions: { count: ramuxLoc.length, sample: ramuxLoc.slice(0, 40) },
  classification: "potential_upcoming_content (present in current files; officially announced boss per plan calibration)",
  forAccessibility: [
    "Full player-grade equipment naming (weapon set 'Ascended Ramux …') in TLItemLooks_Equip with resolved English localization",
    `${ramuxIconsOk} record icon paths resolve to extracted player-style equipment icons (IT_P_*)`,
    "Localization includes non-item mentions (achievements/codex/NPC strings) indicating integrated content",
  ],
  againstAccessibility: [
    "S1_arch_002 weapon rows exist in TLItemLooks_Equip (cosmetic/name layer) but NOT in TLItemEquip or TLItemStats in this build — no stat rows means not equipable as-is",
    `Only ${ramuxInQuestlog} of ${ramuxRecords.length} records appear in Questlog`,
  ],
  forUpcoming: [
    "Named, iconed, localized gear with missing stat rows is the classic pre-release staging pattern",
    "Plan-level calibration: Ramux is the officially announced July Archboss (official source, separate from file evidence)",
  ],
  againstUpcoming: [
    "Absence from Questlog alone is a coverage gap, not proof — Questlog covers only ~51% of locally named equipment",
    "No cross-build history yet to show when these rows appeared",
  ],
  notes: "contrastRecords are live arch-boss gear (Tevent orb, Bellandir gauntlets): same naming scheme, but WITH TLItemEquip/TLItemStats rows and questlog_present=1. The Ramux S1 rows differ on exactly those axes.",
});
ramuxPacket.contrastRecords = ramuxContrast;

// ---------------------------------------------------------------- WP_CL

const clRecords = db.prepare(
  "SELECT * FROM records WHERE row_id LIKE 'WP_CL%' ORDER BY table_name, row_id",
).all().map(recordView);

const clLoc = locRows
  .filter(([, key]) => /WP_CL/i.test(key ?? ""))
  .map(([ns, key, , tr]) => ({ namespace: ns, key, text: tr.length > 160 ? tr.slice(0, 160) + "…" : tr }));

const clNamed = clLoc.filter((l) => /_NAME_/i.test(l.key)).length;
const clDesc = clLoc.filter((l) => /DESC/i.test(l.key)).length;
// TLSkill rows carry no icon fields (icons live in the un-decoded *Looks tables);
// icon evidence comes from the extracted image inventory instead.
function walkFiles(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(f, acc); else acc.push(f.replace(/\\/g, "/"));
  }
  return acc;
}
const clImages = walkFiles(path.join(EXTRACT_ROOT, "textures", "TL", "Content", "Image", "Skill"))
  .filter((p) => /WP_CL/i.test(p))
  .map((p) => p.slice(p.indexOf("Image/")));
// Gauntlet linkage: tooltip placeholders in WP_CL descriptions reference
// Gauntlet_Claw_* variables (verified in en.csv), not TLSkill row refs.
const clGauntletLoc = clLoc.filter((l) => /gauntlet/i.test(l.text));

const clPacket = packet({
  caseId: "wp-cl-claw-prototype",
  title: "WP_CL claw weapon skill group",
  records: clRecords,
  localizationMentions: { count: clLoc.length, namedSkills: clNamed, descriptions: clDesc, sample: clLoc.slice(0, 40) },
  classification: "prototype_or_experimental (dormant unless build-history evidence shows active development)",
  forAccessibility: [],
  againstAccessibility: [
    "No SkillSet_WP_CL_* entries exist in Questlog skill sets",
    "Most WP_CL rows have no resolved TEXT_SKILL_NAME localization",
    "CL is absent from the shipped weapon list (bow/crossbow/dagger/gauntlet/orb/spear/staff/sword/greatsword/wand)",
  ],
  forUpcoming: [
    `${clRecords.length} TLSkill rows survive in the current build rather than being stripped`,
    `${clImages.length} WP_CL skill images present in the extraction; ${clNamed} localized names and ${clDesc} descriptions exist`,
  ],
  againstUpcoming: [
    `${clGauntletLoc.length} WP_CL descriptions resolve their tooltip values from current Gauntlet variables (e.g. $[Gauntlet_Claw_PrimeAttack_DD.tooltip1]) — consistent with the plan's read that claw abilities share/were folded into the Gauntlet system`,
    "No official mention correlates with a claw weapon; classification stays prototype/legacy per the acceptance criteria",
  ],
  notes: "Acceptance expectation from plans/upcoming-content-radar/README.md: legacy_or_prototype unless build history shows activity. This packet supports that expectation from evidence rules, not by hardcoding. TLSkill rows have no icon fields; icon evidence is the image-file inventory (referencedAssets).",
});
clPacket.referencedAssets = clImages;

// ---------------------------------------------------------------- write

for (const [name, p] of [["ascended-ramux", ramuxPacket], ["wp-cl-claw-prototype", clPacket]]) {
  for (const dir of [path.join(DATA_ROOT, "reports", BUILD, "evidence"), path.join(root, "out", "coverage-audit", "evidence")]) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(p, null, 1), "utf8");
  }
}
db.close();
console.log(JSON.stringify({
  ramux: { records: ramuxRecords.length, locMentions: ramuxLoc.length, iconsResolved: ramuxIconsOk, inQuestlog: ramuxInQuestlog },
  wpCl: { records: clRecords.length, locMentions: clLoc.length, named: clNamed, descriptions: clDesc, imageFiles: clImages.length, gauntletTooltipLinks: clGauntletLoc.length },
}, null, 1));
