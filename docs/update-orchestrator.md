# TL-Helper update orchestrator

`scripts/update-tl-helper.mjs` runs the existing collector, decoder, warehouse,
reports, web-data build, and tests in a fixed dependency order. It stops at the
first failed command or missing expected output.

## Safe first use

```powershell
$env:TL_DATA_ROOT = 'D:\TL_Data'
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

## Targeted runs

```powershell
node scripts\update-tl-helper.mjs --only decode,warehouse,inventory
node scripts\update-tl-helper.mjs --skip collector,web-data
node scripts\update-tl-helper.mjs --build 24118850 --data-root D:\TL_Data
```

Available stages are:

```text
collector, decode, warehouse, inventory, web-data, coverage, evidence,
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

- never deletes old data or source snapshots;
- never uploads or publishes anything;
- never stages or commits Git changes;
- refuses to place the bulk data root inside the repository;
- supplies the same build and data-root environment to every stage;
- records commands, timings, exit codes, expected outputs, and output tails;
- stops immediately after a failed stage.

The `web-data` stage regenerates the repository's existing
`web\data\app-data.json`. Skip that stage when only warehouse or report outputs
are wanted.
