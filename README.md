# TL-Helper

TL-Helper is a local, self-sustaining Throne and Liberty data platform and
companion application. It combines an Armory build planner and progress tracker
with a read-only game-file collector, a general `TLJsonDataTable` decoder, a
normalized SQLite warehouse, validation reports, and planned combat and content
intelligence tools.

The current data snapshot is game version `1.431.22.7761`, Steam build
`24118850`. The warehouse contains **85,099 records from 38 decoded tables**.

## Source of truth

TL-Helper uses this hierarchy:

1. Decoded game files are the primary source for client-visible records and formulas.
2. The normalized warehouse is the stable interface used by downstream tools.
3. Questlog is a compatibility, parity, and coverage reference for the public calculator and UI.
4. Derived rules and calibrated mechanics must keep their evidence, confidence, game build, and calculation version.

Questlog absence is a coverage fact, not proof that content is upcoming. The
client files also do not prove server-side combat behavior. Unknown mechanics
remain explicitly marked instead of being guessed.

## Platform layers

| Layer | Purpose | Main location |
| --- | --- | --- |
| Web application | Armory planner, build calculations, achievements, and tracker | `web/` |
| BuildSnapshot | Immutable, versioned boundary shared by browser and future combat systems | `web/tl-build-snapshot.js` |
| Collector | Read-only, build-scoped collection from installed game archives | `src/TlCollector/` |
| Decoder | Converts `TLJsonDataTable` packages into structured rows | `scripts/decode-tljson-table.mjs` |
| Warehouse | Normalized records, provenance, references, assets, and FTS5 search | `D:\TL_Data\warehouse\tl-24118850.sqlite` |
| Validation | Reference builds, browser checks, edge cases, asset casing, coverage, and inventories | `scripts/`, `out/coverage-audit/` |
| Content intelligence | Evidence-based discovery and future patch comparison | `plans/upcoming-content-radar/` |
| Combat data | Decoded formulas, coverage audit, unknowns, and validation cases | `plans/combat-simulator/` |
| Update orchestrator | One guarded command for refresh, reports, web data, and verification | `scripts/update-tl-helper.mjs` |

## Data locations

Source code, documentation, schemas, tests, and small fixtures live in Git under
`D:\TL_Helper`. Bulk and generated game data live outside Git under `D:\TL_Data`:

```text
D:\TL_Data\raw\<build>\       immutable source snapshots
D:\TL_Data\decoded\<build>\   decoded table rows
D:\TL_Data\warehouse\         normalized SQLite databases
D:\TL_Data\manifests\<build>\ collection manifests and checksums
D:\TL_Data\reports\<build>\   inventories and evidence reports
D:\TL_Data\cache\              disposable intermediates and tools
```

Set the data root before running collection or data tools:

```powershell
$env:TL_DATA_ROOT = 'D:\TL_Data'
```

See `docs/data-contract.md` and `docs/storage-and-retention.md` for the canonical
record model, retention policy, and legacy-location status.

## Run the web application

```powershell
cd D:\TL_Helper\web
python -m http.server 8790 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8790/index.html
http://127.0.0.1:8790/tracker.html
http://127.0.0.1:8790/achievements.html
```

The bundled Questlog parity build is available at:

```text
http://127.0.0.1:8790/index.html?preset=questlog-the-death-prophet-and-void
```

## Refresh and validate the current build

The update orchestrator runs collection, decoding, warehouse and report builds,
web-data generation, and every verification gate in dependency order. It stops
at the first failure and writes a machine-readable run report.

```powershell
cd D:\TL_Helper
$env:TL_DATA_ROOT = 'D:\TL_Data'
node scripts\update-tl-helper.mjs --validate
node scripts\update-tl-helper.mjs --dry-run
node scripts\update-tl-helper.mjs
```

The orchestrator resolves .NET from `TL_DOTNET`, then
`D:\TL_Data\cache\tools\dotnet-sdk\dotnet.exe`, then `dotnet` on `PATH`.
Reports and bulk outputs remain build-scoped, while generated browser data
uses a small manifest plus five hashed projections. The guarded
sequence also runs the `combat-power-analysis` stage before application
verification. See
`docs/update-orchestrator.md` for targeted `--only` and `--skip` runs, report
locations, preflight checks, and safety boundaries.

## Current capability

- The `TLJsonDataTable` tagged-property row format is decoded for this build.
- All 38 attempted tables decoded cleanly, producing 85,099 warehouse records.
- `TLFormulaParameterNew` exposes 10,656 skill formula rows and 26 formula types. It resolves 95.4% of distinct player-facing tooltip placeholder bases.
- Cooldowns, costs, skill magnitudes, stat curves, item scaling, and much of the buff, debuff, stack, and crowd-control metadata are client-visible.
- Final live damage is not yet exact because mitigation and contest curves, pipeline order, and rounding require calibration or may be server-side.
- Questlog asset coverage validates completely, including case-safe lookup reporting for future Linux deployment.
- Combat Simulator Milestone 1 is complete. `BuildSnapshot` v1 wraps the
  verified static calculator with immutable loadout, resolved stats, combat
  power, validation, ruleset, game-build provenance, and canonical JSON
  serialization.
- Both the Armory and tracker now calculate through the same BuildSnapshot
  adapter used by automated verification.
- `web/data/app-data.json` is now a 1,144-byte manifest for five hashed
  projections: equipment, runes, progression, skills, and labels. Each
  projection retains the web-data schema and game-build provenance. The split
  separates concerns, improves integrity and caching, and enables future
  selective loading. The current browser initialization still assembles all
  five projections.
- Live browser verification passed for both the Armory and Tracker against the
  projected data.
- The latest verification gate passed BuildSnapshot checks, 69/69 assertions
  across three fixtures, all 12 edge checks, 25 JavaScript tests, and 92
  collector tests.
- Combat-power parity analysis confirms that `TLItemCombatPower` contains exact
  item component weights but not the full aggregation pipeline. The live
  calculator remains unchanged until unresolved item families and aggregation
  rules are proven. See
  `plans/combat-simulator/combat-power-parity.md`.

See `STATUS.md` for the current snapshot, open issues, verified commands, and
recommended next work.

## Browser state

- Armory build: `localStorage["tlhelper-builder-state-v2"]`
- Armory presets: `localStorage["tlhelper-builder-presets-v1"]`
- Tracker: `localStorage["tl-tracker-state-v1"]`

Saved-build versioning and patch-safe migration are planned refinements.

## Key references

- `STATUS.md`: current operational truth
- `docs/data-contract.md`: warehouse contract
- `docs/storage-and-retention.md`: data-root and retention rules
- `docs/update-orchestrator.md`: one-command refresh, validation, and reports
- `FIX-PLAN.md`: completed application audit plus remaining fixture work
- `plans/combat-simulator/combat-data-audit.md`: decoded combat-data findings
- `plans/combat-simulator/combat-power-parity.md`: decoded component parity and replacement limits
- `plans/combat-simulator/unknown-formulas.md`: mechanics that remain uncertain
- `plans/upcoming-content-radar/`: content-intelligence architecture
- `design-handoff/`: original application design references

The build regression currently matches all 69 asserted totals across three
fixtures. The original Questlog reference build still matches 7,128 combat
power, while focused healer and ranged smoke fixtures broaden calculator
coverage. Complete manual Questlog panels for those two archetypes remain the
next fixture task.
