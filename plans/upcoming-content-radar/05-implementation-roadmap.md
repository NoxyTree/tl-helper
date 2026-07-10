# Implementation Roadmap

## Milestone 0: Preserve the baseline

### Work

- Copy current extraction metadata into the proposed snapshot structure.
- Record Steam build, client version, extraction time, and tool versions.
- Preserve current Questlog snapshots and normalized app-data hash.
- Record the current official-announcement sources used for calibration.
- Produce a baseline integrity report.

### Definition of done

- Baseline manifest is immutable.
- Existing `D:\TL_Extracted` counts are recorded.
- Source files are unchanged.
- The baseline can be used in later comparisons.

## Milestone 1: Collector proof of concept

### Work

- Create the C# project.
- Initialize CUE4Parse against the local archive directory.
- Supply encryption configuration from a local ignored file.
- Enumerate packages under `TL/Content/Game/Client/Table`.
- Export one raw table, one property JSON, and one texture.
- Implement dry-run and source/output path safety checks.

### Definition of done

- One command reproduces the selected outputs without FModel interaction.
- No game process is launched.
- No game archive changes.
- Tests cover path containment and forbidden asset types.

## Milestone 2: Full collector and incremental manifests

### Work

- Implement profile filtering.
- Implement raw-table preservation.
- Implement texture decoding.
- Implement localization extraction and parsing.
- Implement resumable work queue.
- Implement manifests and unchanged-output reuse.
- Implement scan, extract, index, status, and verify commands.

### Definition of done

- Current approved scope is reproduced automatically.
- A second unchanged run performs no extraction work.
- Interrupted work resumes.
- Output contains no movies, models, animations, or audio.

## Milestone 3: Custom TLJsonDataTable decoder spike

### Priority tables

1. `TLSkill`
2. `TLRuneInfo`
3. `TLRuneGrowth`
4. `TLCraftingRecipe`
5. `TLCookingRecipe`
6. `TLItemStats`
7. Codex and quest tables
8. Boss, dungeon, and reward tables

### Work

- Inspect raw package structure and CUE4Parse output.
- Trace FModel and CUE4Parse handling for the custom table class.
- Determine whether rows are standard serialized data, custom bulk data, embedded JSON, or another encoded form.
- Create typed or generic row extraction.
- Preserve unknown fields rather than dropping them.
- Validate decoded IDs against localization, Questlog, and identifier lists.

### Definition of done

- At least three priority tables produce deterministic row records.
- Row counts and IDs are validated independently.
- Unknown or unsupported fields are reported explicitly.
- Decoder tests use retained fixture packages.

## Milestone 4: Database and normalization

### Work

- Apply initial SQLite migrations.
- Import build manifest, localization, assets, decoded tables, and Questlog.
- Build stable entity IDs and relationships.
- Build FTS indexes.
- Implement idempotent imports.

### Definition of done

- Ramux evidence is queryable as one entity cluster.
- Vegamor evidence is queryable as one entity cluster.
- Questlog coverage status is queryable.
- Database integrity checks pass.

## Milestone 5: Radar and scoring

### Work

- Implement current-build coverage mode.
- Implement patch-to-patch comparison.
- Implement candidate clustering.
- Implement configurable scoring.
- Import official mentions.
- Generate reports.

### Definition of done

- Ramux, Vegamor, and WP_CL acceptance cases classify sensibly.
- Every score is explainable.
- Official facts and inferred links are distinct.
- Reports include positive and negative evidence.

## Milestone 6: MCP and LLM access

### Work

- Implement read-only database repository.
- Implement MCP tools and response contracts.
- Add source-backed LLM guidance.
- Add integration tests.
- Add optional loopback HTTP API.

### Definition of done

- Claude or another MCP client can search entities and candidates.
- Results include build, confidence, evidence, and uncertainty.
- Arbitrary SQL and unrestricted file access are impossible.

## Milestone 7: Operations and future updates

### Work

- Detect Steam app-manifest build changes.
- Add a manual update command first.
- Add optional scheduled monitoring later.
- Create a review queue for new candidates.
- Add database backup and retention policy.
- Add public-report redaction rules if publishing is considered.

### Definition of done

- A new game update can be scanned, extracted, compared, and reported with one command sequence.
- Previous snapshots remain reproducible.
- Human review decisions are retained.

## Suggested command sequence after a patch

```powershell
tl-collector scan --json
tl-collector extract --profile knowledge
tl-collector extract --profile textures
tl-collector index
tl-collector verify
tl-radar compare --from previous --to current
tl-radar report --build current
```

## Verification matrix

| Area | Required verification |
| --- | --- |
| Safety | Source hashes or timestamps remain unchanged |
| Collector | Approved package counts and output hashes |
| Incremental update | Unchanged packages skipped |
| Decoder | Row counts and stable IDs |
| Database | Foreign keys, integrity, idempotency |
| Radar | Acceptance-case classifications |
| MCP | Read-only operation and evidence-backed responses |

## Main risks

### Custom table format

The custom table payload may require game-specific serialization support. Mitigation: preserve raw packages, implement the decoder as a separate versioned layer, and avoid blocking the rest of the collector.

### False upcoming-content claims

Old, cut, and regional content may remain in archives. Mitigation: require multi-signal evidence, track first-seen build, preserve negative signals, and use cautious classifications.

### Questlog schema changes

Questlog is undocumented and may change. Mitigation: preserve raw snapshots, validate response shapes, and treat Questlog as a comparison source rather than canonical truth.

### Large snapshots

Duplicating all extracted assets per build wastes disk space. Mitigation: content-addressed storage plus lightweight build manifests.

### Toolchain drift

CUE4Parse and Unreal formats change. Mitigation: pin dependency versions per collector release and record those versions in every build manifest.

## Recommended first implementation boundary

Do not attempt all milestones in one agent run. The first implementation should stop after Milestone 1 and a written decoder investigation. This creates a verified foundation before committing to the database and MCP architecture.

