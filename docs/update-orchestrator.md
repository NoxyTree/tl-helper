# TL-Helper update orchestrator

`scripts/update-tl-helper.mjs` runs the existing collector, decoder, warehouse,
reports, web-data build, and tests in a fixed dependency order. It stops at the
first failed command, missing required input, or semantically invalid output.

## Safe first use

```powershell
$env:TL_DATA_ROOT = 'D:\TL_Data'
$env:TL_QUESTLOG_ROOT = 'D:\TL_Helper\out\questlog-public'
node scripts\update-tl-helper.mjs --validate
node scripts\update-tl-helper.mjs --dry-run
```

Both commands write a machine-readable run report but do not execute pipeline
stages. Reports are written to:

```text
TL_DATA_ROOT\reports\<build>\update-runs\<timestamp>.json
TL_DATA_ROOT\reports\<build>\update-runs\latest.json
```

After reviewing the plan, run the complete update:

```powershell
node scripts\update-tl-helper.mjs
```

The build is detected in this order: `--build`, `TL_STEAM_BUILD`, Steam's
appmanifest referenced by the collector config, then the collector config's
fallback build. The data root is resolved from `--data-root`, `TL_DATA_ROOT`,
then collector config. `TL_EXTRACT_ROOT` defaults to the selected build's
`raw\<build>\extracted` directory beneath the data root.

The .NET SDK is resolved from `TL_DOTNET`, then
`TL_DATA_ROOT\cache\tools\dotnet-sdk\dotnet.exe`, then `dotnet` on `PATH`.
Preflight calls `--list-sdks` and stops with a clear error when the selected
runtime does not include an SDK. A machine with only the .NET runtime cannot
build or test the collector.

Warehouse preflight names every input currently consumed by the builder:

- `decoded\<build>\tables`
- `localization\csv\en.csv`
- `textures\TL\Content`
- `out\questlog-public\characterBuilder.getEquipmentItems.json`
- `out\questlog-public\skillBuilder.getSkillSets.json`

The Questlog directory is an explicit `questlogRoot` in the resolved context.
It is selected from `--questlog-root`, then `TL_QUESTLOG_ROOT`, then the
executing worktree's `out\questlog-public` fallback. Separate worktrees should
point at the reviewed snapshots explicitly instead of copying ignored inputs.
Inventory preflight requires both `indexes\game_tables.csv` and the decoded
table directory. Both stages also require
`data-build-baselines\<build>.json`, and preflight verifies that its table
count, row count, decoder versions, source-set hash, and artifact-set hash match
the current decoded directory before either builder can run.

## Targeted runs

```powershell
node scripts\update-tl-helper.mjs --only decode,warehouse,inventory
node scripts\update-tl-helper.mjs --skip collector,web-data
node scripts\update-tl-helper.mjs --build 24118850 --data-root D:\TL_Data --questlog-root D:\TL_Helper\out\questlog-public
```

Available stages are:

```text
collector, decode, warehouse, inventory, skill-formula-map, web-data, combat-abilities, stat-sources, coverage, evidence,
combat-power-analysis, snapshot-verify, reference-verify, edge-verify, js-tests,
collector-tests
```

The three application verification stages are deliberately separate. The run
report records BuildSnapshot contract checks, reference-build parity, and edge
checks independently, and the pipeline stops if any one fails.

`--only` is intentionally literal. It does not add dependencies automatically.
This makes targeted recovery predictable, but the operator is responsible for
ensuring earlier outputs exist. Preflight checks catch missing required inputs.

## Safety boundaries

The orchestrator:

- never deletes source snapshots;
- never uploads or publishes anything;
- never stages or commits Git changes;
- refuses to place the bulk data root inside the repository;
- supplies the same build and data-root environment to every stage;
- records commands, timings, exit codes, expected outputs, output tails, and
  before/after semantic output identities;
- stops immediately after a failed stage.

The safety report explicitly lists `replacesDerivedOutputs`. Warehouse and
inventory builders replace their same-build derived output paths. This is not
reported as source-data deletion, but it is also not described as append-only.

The warehouse stage is not accepted merely because a SQLite file exists. The
orchestrator opens it read-only and checks its game build, distinct table count,
record count, and aggregate source-table hash against the decoded input universe.
It also records the database SHA-256, size, reference count, asset count, and
localized-record count before and after the stage.

The inventory stage checks its game build, discovered table count,
decoded-table count, and decoded-row count against `game_tables.csv` and the
decoded input universe. The canonical report and repository inventory copy must
have identical SHA-256 hashes. Both stages fail closed on semantic drift.

The `web-data` stage regenerates the repository's existing
`web\data\app-data.json`. Skip that stage when only warehouse or report outputs
are wanted.

The `stat-sources` stage consumes the warehouse plus the generated equipment,
progression, and rune projections. It rebuilds the build-scoped `stat_sources` table
and writes the Heavy Attack coverage report beneath
`TL_DATA_ROOT\reports\<build>\stat-sources\`. Use `--only stats` to rerun it
after its inputs already exist.

The `combat-abilities` stage uses the reviewed manifest plus the current skill
projection, skill-formula map, and decoded formula table. It writes a validated,
build-scoped `combat-abilities.json` report. Use `--only abilities` after those
inputs already exist. Adding a formula row to the reviewed manifest is a manual
evidence decision; the stage never promotes a row by substring alone.

## Checked-in data build receipt

When a successful run includes both `warehouse` and `inventory`, the
orchestrator writes `data-build-receipts\<build>.json` using
`schemas\data-build-receipt.schema.json`. The receipt contains the validated
input and output semantic identities and points back to the update-run report.

The receipt is the release commit marker. Before any selected stage that can
change a receipted input or output starts (`collector`, `decode`, `warehouse`,
`inventory`, or `stat-sources`), any current receipt is moved to
`data-build-receipts\superseded\<build>\<run>.json`, so a failed or interrupted
rebuild cannot leave an older receipt appearing authoritative for new outputs.
A receipt-producing report is first published as `awaiting-receipt`; it becomes
`passed` only after the new receipt has been written and validated. Receipt
inspection recomputes the warehouse's decoded-table, record, reference, asset,
and FTS hashes from SQLite rather than trusting stored metadata.

A run that selects both receipt-producing stages must start from a clean Git
worktree. The commit pins the complete tracked source tree, while the report
also records the Node.js version and hashes of critical builders, dependencies,
receipt code, validators, and schemas. Receipt issuance rejects every Git change
outside the declared generated-data locations and rechecks the runtime and
critical source hashes.

No receipt is generated by `--validate` or `--dry-run`, and the receipt generator
refuses to infer post-rebuild counts from pre-existing outputs. A completed
receipt should be reviewed and committed like any other generated provenance
artifact. See `docs/data-contract.md` for the full field contract.
