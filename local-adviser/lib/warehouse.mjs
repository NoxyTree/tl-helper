import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_WAREHOUSE_DIR = "D:/TL_Data/warehouse";

export function findWarehousePath(explicitPath = process.env.TL_HELPER_WAREHOUSE) {
  if (explicitPath) {
    const resolved = path.resolve(explicitPath);
    if (!existsSync(resolved)) throw new Error(`Warehouse not found: ${resolved}`);
    return resolved;
  }
  if (!existsSync(DEFAULT_WAREHOUSE_DIR)) {
    throw new Error(`Warehouse directory not found: ${DEFAULT_WAREHOUSE_DIR}`);
  }
  const candidates = readdirSync(DEFAULT_WAREHOUSE_DIR)
    .filter((name) => /^tl-.*\.sqlite$/i.test(name))
    .map((name) => path.join(DEFAULT_WAREHOUSE_DIR, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!candidates.length) throw new Error(`No TL warehouse found in ${DEFAULT_WAREHOUSE_DIR}`);
  return candidates[0];
}

function limitValue(value, fallback = 10, maximum = 30) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(maximum, parsed)) : fallback;
}

export function ftsQuery(value) {
  const tokens = String(value ?? "").trim().match(/[\p{L}\p{N}_'-]+/gu) ?? [];
  if (!tokens.length) throw new Error("Search query must contain a word or identifier.");
  return tokens.slice(0, 10).map((token) => `"${token.replaceAll('"', '""')}"*`).join(" AND ");
}

export class TlWarehouse {
  constructor(databasePath = findWarehousePath()) {
    this.path = databasePath;
    this.db = new DatabaseSync(databasePath, { readOnly: true });
  }

  metadata() {
    return Object.fromEntries(this.db.prepare("SELECT key, value FROM meta ORDER BY key").all().map((row) => [row.key, row.value]));
  }

  searchRecords({ query, table_family = "", record_type = "", limit = 10 } = {}) {
    const clauses = ["records_fts MATCH ?"];
    const values = [ftsQuery(query)];
    if (table_family) {
      clauses.push("r.table_family = ?");
      values.push(String(table_family));
    }
    if (record_type) {
      clauses.push("r.record_type = ?");
      values.push(String(record_type));
    }
    values.push(limitValue(limit));
    return this.db.prepare(`
      SELECT r.record_id, r.row_id, r.record_type, r.table_name, r.table_family,
             r.name_loc AS name, r.loc_state, r.confidence, r.game_build
      FROM records_fts
      JOIN records r ON r.record_id = records_fts.record_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY bm25(records_fts), r.name_loc
      LIMIT ?
    `).all(...values);
  }

  getRecord(identifier) {
    const row = this.db.prepare(`
      SELECT record_id, row_id, record_type, table_name, table_family, source_path,
             game_build, game_version, name_loc AS name, loc_key, loc_state,
             confidence, extraction_status, raw_json
      FROM records
      WHERE record_id = ? OR row_id = ?
      ORDER BY CASE WHEN record_id = ? THEN 0 ELSE 1 END
      LIMIT 1
    `).get(identifier, identifier, identifier);
    if (!row) return null;
    return { ...row, raw: JSON.parse(row.raw_json), raw_json: undefined };
  }

  searchStatSources({ stat_query, source_type = "", source_name = "", limit = 15 } = {}) {
    const query = String(stat_query ?? "").trim();
    if (!query) throw new Error("stat_query is required.");
    const clauses = ["(canonical_stat_id LIKE ? OR display_name LIKE ? OR raw_stat_id LIKE ?)"];
    const pattern = `%${query}%`;
    const values = [pattern, pattern, pattern];
    if (source_type) {
      clauses.push("source_type = ?");
      values.push(String(source_type));
    }
    if (source_name) {
      clauses.push("source_name LIKE ?");
      values.push(`%${source_name}%`);
    }
    values.push(limitValue(limit, 15, 40));
    return this.db.prepare(`
      SELECT canonical_stat_id, display_name, source_type, source_id, source_name,
             source_component, value, unit, level, rank, attack_scope, confidence,
             conditions_json, source_table
      FROM stat_sources
      WHERE ${clauses.join(" AND ")}
      ORDER BY ABS(value) DESC, source_name, COALESCE(level, rank) DESC
      LIMIT ?
    `).all(...values).map((row) => ({
      ...row,
      conditions: JSON.parse(row.conditions_json || "{}"),
      conditions_json: undefined,
    }));
  }

  close() {
    this.db.close();
  }
}
