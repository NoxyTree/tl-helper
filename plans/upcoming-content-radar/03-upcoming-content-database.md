# Upcoming Content Database Creation Plan

## Objective

Create a SQLite database that stores normalized game entities, build history, localization, assets, relationships, official mentions, Questlog coverage, radar candidates, and the evidence behind every conclusion.

SQLite is the primary store because the data is structured and relationship-heavy. FTS5 provides natural-language discovery without making semantic-vector search a hard dependency.

## Database location

```text
D:\TL_Intelligence\database\upcoming-content.sqlite
```

The database is generated and must remain outside Git. Migrations and schema definitions belong in the repository.

## Proposed schema

### builds

| Column | Purpose |
| --- | --- |
| `id` | Internal build key |
| `steam_build` | Steam build number |
| `game_version` | Client version |
| `collected_at_utc` | Collection time |
| `manifest_path` | Source manifest |
| `collector_version` | Collector build |
| `is_baseline` | Baseline flag |

### source_files

- Build ID
- Internal package path
- Container path
- Asset type
- Source hash
- Source size
- Exported path
- Export hash
- Processing status

### entities

- Stable canonical entity ID
- Entity type
- Canonical name
- Internal primary ID
- First-seen build
- Last-seen build
- Current lifecycle state

### entity_versions

- Entity ID
- Build ID
- Structured JSON payload
- Payload hash
- Change type
- Decoder version
- Completeness status

### aliases

- Entity ID
- Alias
- Alias type
- Language
- Source evidence ID

### relationships

- Source entity ID
- Relationship type
- Target entity ID
- Build ID
- Structured metadata
- Confidence
- Evidence ID

Relationship examples:

- `skill_belongs_to_weapon`
- `boss_drops_item`
- `quest_rewards_item`
- `codex_mentions_npc`
- `achievement_targets_encounter`
- `recipe_produces_item`
- `entity_uses_asset`
- `candidate_matches_official_mention`

### localizations

- Build ID
- Language
- Namespace
- Localization key
- Source hash
- Translation
- First-seen build
- Last-seen build

### assets

- Asset ID
- Build ID
- Internal asset path
- Exported path
- Asset type
- Width and height
- Content hash
- First-seen build
- Last-seen build

### questlog_records

- Snapshot ID
- Domain
- Questlog ID
- Normalized name
- Internal icon path
- Structured JSON payload
- Payload hash

### official_mentions

- Mention ID
- Publication URL
- Publication date
- Official title
- Mentioned content type
- Normalized name if explicitly stated
- Release window
- Summary
- Source hash

### evidence

- Evidence ID
- Build ID
- Evidence type
- Source path or URL
- Source record key
- Extracted claim
- Structured metadata
- Strength

### candidates

- Candidate ID
- Canonical entity ID where resolved
- Content type
- Classification
- Confidence score
- Official status
- Questlog status
- First-seen build
- Last-seen build
- Human review status
- Summary

### candidate_evidence

- Candidate ID
- Evidence ID
- Signal type
- Weight
- Explanation

### reviews

- Candidate ID
- Review time
- Reviewer
- Decision
- Notes
- Previous classification
- New classification

## Full-text search

Create FTS5 indexes for:

- Entity names and aliases
- Localization text
- Dialogue and Codex text
- Candidate summaries
- Official mentions
- Evidence claims

The search index must retain links back to structured records and exact source evidence.

## Versioning behaviour

- Never overwrite historical entity versions.
- Mark the latest version through build ordering rather than destructive updates.
- Use stable canonical IDs independent of display-name changes.
- Record decoder version on every decoded payload.
- Re-importing the same build should be idempotent.
- A decoder improvement may create a new import revision without changing the source build.

## Ingestion order

1. Builds and source-file manifest
2. Raw and decoded tables
3. Localization
4. Assets
5. Questlog snapshot
6. Official mentions
7. Entity normalization
8. Relationships
9. Candidate evidence
10. Candidate scoring
11. FTS refresh

Use one transaction per ingestion stage and maintain an import journal.

## Required views

- `current_entities`
- `current_entity_versions`
- `new_entities_by_build`
- `changed_entities_by_build`
- `questlog_missing_entities`
- `officially_announced_candidates`
- `high_confidence_unannounced_candidates`
- `candidate_signal_summary`
- `entity_evidence_summary`
- `new_localization_by_build`
- `new_assets_by_build`

## Example queries

```sql
SELECT *
FROM high_confidence_unannounced_candidates
ORDER BY confidence_score DESC;
```

```sql
SELECT e.canonical_name, r.relationship_type, target.canonical_name
FROM relationships r
JOIN entities e ON e.id = r.source_entity_id
JOIN entities target ON target.id = r.target_entity_id
WHERE e.canonical_name = 'Vegamor';
```

```sql
SELECT language, localization_key, translation
FROM localizations
WHERE first_seen_build = :build
  AND translation MATCH 'Archboss OR Colossus';
```

## Migration strategy

- Store ordered SQL migrations in `D:\TL_Helper\database\migrations`.
- Record migration version in a `schema_migrations` table.
- Never edit an applied migration.
- Include a disposable fixture database for tests.
- Back up the live database before applying a migration.

## Verification

- Foreign-key enforcement enabled.
- Integrity check passes after each import.
- Same build can be imported twice without duplicates.
- Evidence paths resolve to existing files or retained URLs.
- Every candidate has at least one evidence record.
- Every score component is explainable through `candidate_evidence`.
- Historical versions remain queryable.
- FTS result IDs resolve to live structured records.
- Database can be opened read-only by the MCP server.

## Optional later extension

Embeddings may be added later for semantic discovery across dialogue and descriptions. They must supplement, not replace, exact relational and FTS retrieval. Embedding records should store model name, model version, source hash, and generation date.

