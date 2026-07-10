# Canonical data contract

Version 1 · applies from game build 24118850 · implemented by `scripts/build-warehouse.mjs` → `TL_DATA_ROOT\warehouse\tl-<build>.sqlite`

## Store decision

**SQLite** (via `node:sqlite`, no external dependencies) is the normalized query store:

- The repo's tooling is Node-based; `node:sqlite` ships with the installed Node 24 and supports FTS5.
- Row volumes (tens of thousands) are far below anything needing Parquet/DuckDB; those remain the documented choice for *large decoded analytical collections* later (see `docs/storage-and-retention.md`).
- Downstream consumers (radar, combat audit, MCP server) all plan on SQLite already.

Raw decoded JSON stays available at `TL_DATA_ROOT\decoded\<build>\tables\*.json`. Downstream tools must consume the warehouse, not the raw layouts — raw field names are game-internal and unstable across builds.

## Browser projection

`web/data/app-data.json` is a small generated manifest for browser-focused
projections rather than the canonical store. Its top-level contract is:

```json
{
  "schema": "tl-helper.web-data-manifest",
  "schemaVersion": 1,
  "dataSchema": "tl-helper.web-data",
  "dataSchemaVersion": 1,
  "gameBuild": "24118850",
  "generatedAtUtc": "...",
  "projections": []
}
```

The manifest currently references focused `equipment`, `runes`, `progression`,
`skills`, and `labels` JSON files. Every projection repeats the data schema,
schema version, game build, and generation timestamp. The shared loader rejects
mixed provenance or unexpected top-level keys before assembling the same
`tl-helper.web-data` object consumed by the calculation engine. This keeps the
`initCore` contract stable while allowing individual projections to be cached
and updated independently.

`scripts/build-web-data.mjs` requires a numeric `TL_STEAM_BUILD` and refuses to
write an unversioned projection. The update orchestrator supplies this value.
Saved `BuildSnapshot` records inherit `gameBuild` from the loaded projection so
calculator results remain traceable after later game patches.

## Record model

One record per (source table, row). Entity-level merging (e.g. one "item" uniting Looks/Equip/Stats rows) is a view over records sharing `row_id`, not a destructive merge.

### `records`

| Column | Meaning |
| --- | --- |
| `record_id` | Stable ID: `<table>:<row_id>` (e.g. `TLItemLooks_Equip:sword_aa_S1_arch_002`) |
| `row_id` | The FName row key inside the source table |
| `record_type` | `item` / `skill` / `status_effect` / `recipe` / `reward` / `rune` / `reference` |
| `table_name`, `table_family` | Source table and its audit family |
| `source_path` | Original package path of the preserved `.uasset` |
| `source_sha256` | Hash of the decoded package |
| `game_build`, `game_version` | Build provenance |
| `decoder_version` | Version of `decode-tljson-table.mjs` that produced the row |
| `locale` | Locale of the localized fields (currently `en`) |
| `name_loc` | Localized display name where a localization key resolves |
| `loc_key`, `loc_state` | Localization key and `resolved` / `unresolved` / `none` |
| `icon_asset_path` | Original icon path from the row (case preserved) |
| `icon_asset_key` | Case-normalized lookup key (see `scripts/lib/asset-case-index.mjs`) |
| `icon_exists` | Whether the icon resolves against the extracted PNG index |
| `raw_json` | Full decoded row, unknown fields preserved verbatim |
| `extraction_status` | `decoded` (+ decoder warnings count) |
| `questlog_present` | 1 / 0 / NULL(not comparable) — coverage fact, **not** an upcoming-content signal |
| `confidence` | Provenance label: always `extracted` here; inferred layers add their own |
| `first_seen_build`, `last_seen_build` | Build range (single build today; diffing fills these later) |

### `refs`

`(from_record_id, field, to_row_id)` — one row per `TLDataHandle`/`RowName` cross-reference found anywhere in the decoded row. The *target table* is not stored in the game data; resolving it needs the per-field map curated in the decoder notes. Following a ref = `SELECT * FROM records WHERE row_id = ?`.

### `assets`

`(asset_key PK, original_path, exists_locally, referenced_by_questlog)` — the case-normalized asset index (Phase 4). `asset_key` is lowercase, forward-slash. Collisions between distinct original paths are impossible today (verified 0) and rejected at build time if they appear.

### `records_fts` (FTS5)

Full-text over `record_id, row_id, name_loc` for discovery queries.

### `stat_sources` (derived index)

`scripts/build-stat-sources.mjs` materializes one row per named stat value and
level or rank after the warehouse and browser projections are rebuilt. It is a
derived, build-scoped query index rather than a replacement for `records`.

Each row preserves the canonical and raw stat IDs, player-facing label,
source type/ID/name/component, raw and display values, unit, level/rank, attack
scope, structured context and conditions, source table/path, game build,
confidence, and evidence. Fixed item curves, selectable traits, randomized
resonance and runes, direct rune synergies and set bonuses, attributes,
breakpoints, material rules, unique traits, and mastery ranks remain
distinguishable.

All currently indexed Heavy Attack Chance sources can be queried with
`scripts/queries/heavy-attack-sources.sql`. Current coverage is intentionally
conservative. See `docs/stat-source-coverage-audit.md` for source categories
that are not yet materialized.

## Rules

1. Never present raw absence from Questlog as "upcoming content" — `questlog_present=0` is a coverage fact only.
2. Unknown/unsupported decoded fields stay in `raw_json` (`{"unsupported": ...}` markers); they are never dropped.
3. Every record must be traceable: build + source path + sha256 + decoder version are NOT NULL.
4. Rebuilding the warehouse for the same build is idempotent (full rebuild, same content).
