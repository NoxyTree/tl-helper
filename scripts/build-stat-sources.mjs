// Materializes a conservative, build-scoped stat source index in the canonical
// warehouse. The first slice covers named equipment progression, traits, and
// resonance from the validated browser projection.
// Usage: node scripts/build-stat-sources.mjs
// Env: TL_DATA_ROOT, TL_STEAM_BUILD

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { buildEquipmentStatSources, buildMasteryStatSources } from "./lib/stat-sources.mjs";
import { resolveStatTaxonomy } from "./lib/stat-taxonomy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gameBuild = process.env.TL_STEAM_BUILD ?? "24118850";
const dataRoot = process.env.TL_DATA_ROOT ?? "D:\\TL_Data";
const dbPath = path.join(dataRoot, "warehouse", `tl-${gameBuild}.sqlite`);
const projectionPath = path.join(root, "web", "data", "projections", "equipment.json");
const projection = JSON.parse(readFileSync(projectionPath, "utf8"));
const progressionPath = path.join(root, "web", "data", "projections", "progression.json");
const progression = JSON.parse(readFileSync(progressionPath, "utf8"));

if (String(projection.gameBuild) !== String(gameBuild)) {
  throw new Error(`equipment projection build ${projection.gameBuild} does not match requested build ${gameBuild}`);
}
if (String(progression.gameBuild) !== String(gameBuild)) {
  throw new Error(`progression projection build ${progression.gameBuild} does not match requested build ${gameBuild}`);
}

const rows = buildEquipmentStatSources(projection.data.items ?? [], {
  gameBuild,
  sourcePath: path.relative(root, projectionPath).replaceAll("\\", "/"),
  resolveTaxonomy: resolveStatTaxonomy,
});
rows.push(...buildMasteryStatSources(progression.data.masteries ?? [], {
  gameBuild,
  sourcePath: path.relative(root, progressionPath).replaceAll("\\", "/"),
  resolveTaxonomy: resolveStatTaxonomy,
}));

if (!existsSync(dbPath)) {
  throw new Error(`warehouse does not exist for build ${gameBuild}: ${dbPath}`);
}

const db = new DatabaseSync(dbPath);
try {
  db.exec("BEGIN IMMEDIATE");
  db.exec(`
  DROP TABLE IF EXISTS stat_sources_next;
  CREATE TABLE stat_sources_next (
    stat_source_id TEXT PRIMARY KEY,
    canonical_stat_id TEXT NOT NULL,
    stat_family_id TEXT NOT NULL,
    raw_stat_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_component TEXT NOT NULL,
    value_raw REAL NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    level INTEGER,
    rank INTEGER,
    attack_scope TEXT NOT NULL,
    context_json TEXT NOT NULL,
    conditions_json TEXT NOT NULL,
    source_table TEXT NOT NULL,
    source_path TEXT NOT NULL,
    game_build TEXT NOT NULL,
    confidence TEXT NOT NULL,
    evidence_json TEXT NOT NULL
  );
`);
  const insert = db.prepare(`INSERT INTO stat_sources_next VALUES (${Array(22).fill("?").join(",")})`);
  for (const row of rows) insert.run(...Object.values(row));
  db.exec(`
    DROP TABLE IF EXISTS stat_sources;
    ALTER TABLE stat_sources_next RENAME TO stat_sources;
    CREATE INDEX idx_stat_sources_canonical ON stat_sources(canonical_stat_id);
    CREATE INDEX idx_stat_sources_family ON stat_sources(stat_family_id);
    CREATE INDEX idx_stat_sources_raw ON stat_sources(raw_stat_id);
    CREATE INDEX idx_stat_sources_source ON stat_sources(source_type, source_id);
    CREATE INDEX idx_stat_sources_name ON stat_sources(source_name);
  `);
  db.exec("COMMIT");
} catch (error) {
  try { db.exec("ROLLBACK"); } catch {}
  db.close();
  throw error;
}

const counts = db.prepare(`
  SELECT source_component, COUNT(*) AS rows, COUNT(DISTINCT source_id) AS sources,
         COUNT(DISTINCT raw_stat_id) AS raw_stats
  FROM stat_sources GROUP BY source_component ORDER BY source_component
`).all();
const heavy = db.prepare(`
  SELECT source_type, source_id, source_name, source_component, raw_stat_id, value_raw, value,
         unit, level, rank, attack_scope, conditions_json
  FROM stat_sources
  WHERE stat_family_id = 'heavy_attack_chance'
  ORDER BY source_name, source_component, COALESCE(level, rank)
`).all();
const totals = db.prepare(`
  SELECT COUNT(*) AS rows, COUNT(DISTINCT source_id) AS sources,
         COUNT(DISTINCT raw_stat_id) AS raw_stats,
         COUNT(DISTINCT canonical_stat_id) AS canonical_stats
  FROM stat_sources
`).get();
db.close();

const reportDir = path.join(dataRoot, "reports", gameBuild, "stat-sources");
mkdirSync(reportDir, { recursive: true });
const report = {
  schema: "tl-helper.stat-sources-report",
  schemaVersion: 1,
  gameBuild,
  generatedAtUtc: new Date().toISOString(),
  warehouse: dbPath,
  coverage: "Named equipment progression, traits, resonance, unique traits, and numeric mastery ranks present in validated browser projections. Skills, passives, sets, runes, attributes, and unlinked raw curves are not yet indexed.",
  totals,
  byComponent: counts,
  heavyAttack: { rows: heavy.length, sources: new Set(heavy.map((row) => row.source_id)).size, results: heavy },
};
writeFileSync(path.join(reportDir, "heavy-attack.json"), JSON.stringify(report, null, 2) + "\n");
const heavyBreakdown = dbPath && [
  "# Heavy Attack stat-source index",
  "",
  `Game build: ${gameBuild}`,
  "",
  `The index contains ${heavy.length.toLocaleString("en-US")} Heavy Attack Chance rows across ${report.heavyAttack.sources.toLocaleString("en-US")} named sources. Rows include every level or rank, so source count is the useful headline for discovery while row count preserves exact progression.`,
  "",
  "| Source component | Rows | Named sources |",
  "| --- | ---: | ---: |",
  ...Object.values(heavy.reduce((groups, row) => {
    const key = `${row.source_type}:${row.source_component}`;
    groups[key] ??= { label: key, rows: 0, sources: new Set() };
    groups[key].rows++;
    groups[key].sources.add(row.source_id);
    return groups;
  }, {})).map((group) => `| ${group.label} | ${group.rows.toLocaleString("en-US")} | ${group.sources.size.toLocaleString("en-US")} |`),
  "",
  "Use `scripts/queries/heavy-attack-sources.sql` for the full result. Optional traits, resonance, and unique traits are possibilities, not guaranteed grants; inspect `conditions_json` before presenting them.",
  "",
  "Current gaps: runes, set bonuses, attribute breakpoints, skills, passives, and unlinked raw curves are not yet materialized in this index.",
  "",
].join("\n");
writeFileSync(path.join(reportDir, "heavy-attack.md"), heavyBreakdown);
console.log(JSON.stringify({ dbPath, reportDir, ...totals, heavyAttackRows: heavy.length, heavyAttackSources: report.heavyAttack.sources, byComponent: counts }, null, 2));
