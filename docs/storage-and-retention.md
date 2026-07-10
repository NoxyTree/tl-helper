# Data storage and retention

Applies from 2026-07-10 · data root: `TL_DATA_ROOT` (currently `D:\TL_Data`)

## Layout

```text
D:\TL_Helper\                 source code, schemas, docs, tests, small fixtures (git)
D:\TL_Data\
├── raw\<build>\              immutable source snapshots per game build
│   ├── extracted\            curated FModel extraction (was D:\TL_Extracted)
│   ├── fmodel-workspace\     original FModel output (was D:\TL_Helper\Output)
│   ├── questlog-public\      raw Questlog tRPC snapshots (fetch date in extraction-report.md)
│   └── collector\            TlCollector outputs (raw-tables, properties, textures, localization)
├── decoded\<build>\tables\   decoded TLJsonDataTable rows (decode-tljson-table.mjs)
├── warehouse\                tl-<build>.sqlite normalized store (build-warehouse.mjs)
├── assets\                   allowed extracted icons/images (future: content-addressed)
├── indexes\                  FTS/semantic indexes (FTS5 currently lives inside the sqlite)
├── manifests\<build>\        collector manifest.json + verification.json
├── reports\<build>\          table-inventory.json, evidence packets, audits
├── fixtures\                 larger verified samples (repo holds only the <1 MB set)
└── cache\                    reproducible/disposable (robocopy logs, tool downloads)
```

Every processed build records: build id, collection timestamp, file inventory, checksums, decoder version, schema/contract version, extraction configuration, and completion/error status — this is the collector manifest plus the decoded-table headers (`sha256`, `decoderVersion`, `gameBuild`) and warehouse `meta` table.

## Resolution rules for tools

1. `--output` flag (collector) or explicit env `TL_EXTRACT_ROOT` (scripts)
2. `TL_DATA_ROOT` environment variable → build-scoped subpaths
3. Legacy defaults (`D:\TL_Extracted`) only as fallback, to be retired

No tool may hardcode `D:\TL_Helper\Output` (nothing does; verified by grep) or write inside the game installation (enforced + tested in TlCollector).

## In git / out of git

**In**: source, schemas/migrations, `fixtures/` (<1 MB, provenance-documented), config examples, docs, validation scripts, discovery/classification rules. Compact generated reports live under `out/` which is git-ignored by long-standing project convention; they regenerate from one command each and their inputs are snapshotted under `TL_DATA_ROOT\raw`.

**Out** (git-ignored, verified): raw snapshots, decoded datasets, `web/assets/icons/` (2,692 CDN-mirrored icons, regenerable via `scripts/mirror-icons.mjs`), SQLite/DuckDB/Parquet, embeddings, caches, `aes.txt`, native DLLs, the legacy `Output/` directory. **No Git LFS.**

## Store preferences

- SQLite for application queries and relational records (implemented: `warehouse/tl-<build>.sqlite`).
- Parquet only when decoded collections outgrow SQLite analytics (not yet).
- SQLite FTS5 for full-text (implemented: `records_fts`).
- A vector index only when semantic search actually lands.

## Retention

| Class | Policy |
| --- | --- |
| `manifests\<build>` | keep forever, every processed build |
| `warehouse` per meaningful build | keep (meaningful = content patch, not hotfix reruns) |
| `raw\<build>` | keep while the build is needed for historical comparison; older builds may be irreplaceable after game updates — do not prune without an off-machine backup |
| `decoded`, `indexes`, `reports` | regenerable from raw + pinned decoder version; prune freely |
| `cache`, thumbnails, embeddings | disposable |

Off-machine backup: raw snapshots and manifests are the priority (raw > warehouse > everything else). **Nothing is uploaded to any cloud or external service without explicit authorization.**

## Legacy locations

| Location | Status |
| --- | --- |
| `D:\TL_Helper\Output` (3.66 GB) | copied to `raw\24118850\fmodel-workspace`, verified (counts+bytes+hashes); now git-ignored; removal decision is the user's — safe once FModel is repointed or retired |
| `D:\TL_Extracted` (3.98 GB) | copied to `raw\24118850\extracted`, verified; still the active default for scripts run without `TL_DATA_ROOT`; retire the default once workflows all set the env var |
| `D:\TL_Intelligence\dev` | superseded PoC outputs + local .NET SDK (`tools\dotnet-sdk`, reused by builds); relocate SDK to `TL_Data\cache\tools` before removing |
