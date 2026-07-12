# TL-Helper

TL-Helper is a local, self-sustaining Throne and Liberty data platform and
companion application. It combines an Armory build planner and progress tracker
with a read-only game-file collector, a general `TLJsonDataTable` decoder, a
normalized SQLite warehouse, validation reports, and planned combat and content
intelligence tools.

The current data snapshot is game version `1.431.22.7761`, Steam build
`24118850`. The warehouse contains **140,591 records from 48 decoded tables**.

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
| Stat-source index | Player-facing taxonomy for named static stat sources and conditions | `stat_sources` in the warehouse |
| Validation | Reference builds, browser checks, edge cases, asset casing, coverage, and inventories | `scripts/`, `out/coverage-audit/` |
| Content intelligence | Evidence-based discovery and future patch comparison | `plans/upcoming-content-radar/` |
| Combat data | Decoded formulas, coverage audit, unknowns, and validation cases | `plans/combat-simulator/` |
| Combat engine | Deterministic fixed-point event simulation with provenance traces | `packages/combat-engine/` |
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
D:\TL_Data\calibration\<build>\ immutable manual combat observations and index
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
cd D:\TL_Helper
node scripts\serve-web.mjs web 8790
```

Open:

```text
http://127.0.0.1:8790/index.html
http://127.0.0.1:8790/tracker.html
http://127.0.0.1:8790/achievements.html
http://127.0.0.1:8790/combat-lab.html
```

Use the bundled Node server rather than a generic static server. Combat Lab's
Questlog URL importer uses its locked-down same-origin adapter.

The Armory is a native TL-Helper build editor. A new visitor starts with an
empty local build and can select equipment, skills, masteries, runes,
artifacts, support items, and attributes without importing anything. The
current build auto-saves in the browser, and **My builds** stores separately
named build snapshots. Questlog import is an optional compatibility path.

## Deploy the public beta

The repository includes a Cloudflare Pages configuration, production headers,
and a Pages Function for the locked-down Questlog character adapter. See
`docs/deployment.md` for the release gate, first deployment, custom domain, and
rollback commands. Supabase accounts are optional and are not required for the
anonymous local-first beta.

The bundled Questlog parity build is available at:

```text
http://127.0.0.1:8790/index.html?preset=questlog-the-death-prophet-and-void
```

## Refresh and validate the current build

The update orchestrator runs collection, decoding, warehouse and report builds,
the build-scoped skill-to-formula map, reviewed combat-ability ingestion,
web-data generation, stat-source indexing, and every
verification gate in dependency order. It stops at the first failure and writes
a machine-readable run report.

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
- The 30 curated priority tables decode cleanly with decoder `0.2.0`; this includes 54,205 `TLEffectProperty` rows and all weapon abnormal-state tables. The warehouse currently holds 140,591 records from 48 decoded tables.
- `TLFormulaParameterNew` exposes 10,656 skill formula rows and 26 formula types. It resolves 95.4% of distinct player-facing tooltip placeholder bases.
- Cooldowns, costs, skill magnitudes, stat curves, item scaling, and much of the buff, debuff, stack, and crowd-control metadata are client-visible.
- Final live damage is not yet exact because mitigation and contest curves, pipeline order, and rounding require calibration or may be server-side.
- Questlog asset coverage validates completely, including case-safe lookup reporting for future Linux deployment.
- Combat Simulator Milestone 1 is complete. `BuildSnapshot` v1 wraps the
  verified static calculator with immutable loadout, resolved stats, combat
  power, validation, ruleset, game-build provenance, and canonical JSON
  serialization.
- Combat Simulator Milestone 2 is complete. The DOM-free combat engine provides
  BigInt fixed-point arithmetic, seeded RNG, stable event ordering, immutable
  BuildSnapshot references, unit state, cooldowns, resources, shields, buffs,
  DoT/HoT events, canonical replay output, and provenance-enforced formulas.
  Synthetic mitigation and normal/critical branches validate the architecture
  but are explicitly not real game formulas. Unknown TL combat mechanics remain
  non-executable. See `packages/combat-engine/README.md`.
- Combat Simulator Milestone 3 ingestion has started. Judgment Lightning, Swift
  Healing, and Distortion Veil now produce a versioned real-ability artifact
  containing five reviewed formula components across every skill level, plus
  thirteen explicit unresolved stages. Judgment Lightning and Swift Healing remain
  derived-high-confidence owner mappings; Distortion Veil is exact. No real
  mitigation, Base Damage selection, dynamic modifier, or rounding stage is
  executable yet. The engine can inspect these expressions or produce an
  explicitly opted-in tooltip-style projection from caller-supplied Base Damage,
  but it cannot label that projection as final damage, healing, or shield health.
- Combat-log import supports build `24118850` and `CombatLogVersion,4`. It preserves effect IDs, localized names, Critical and Heavy flags, and confirmed first/conditional-second Judgment Lightning mappings without asserting a whole-ability total.
- `TLEffectProperty` links are materialized as reviewed component evidence, and [`docs/combat-testing-rundown.md`](docs/combat-testing-rundown.md) identifies which evidence is already usable, passively collected from normal play, or worth a short deliberate capture.
- The manual calibration harness now validates canonical, SHA-256-addressed
  observations and stores them atomically by game build. It accepts manual,
  screenshot, user-created recording, or reviewed OCR evidence only. The first
  protocol targets coefficient basis, Base Damage selection, and rounding
  without using Gaia Crash to guess mitigation.
- Both the Armory and tracker now calculate through the same BuildSnapshot
  adapter used by automated verification.
- Armory state and presets now use versioned, patch-safe persistence. Existing
  unversioned saves migrate automatically, corrupt records recover safely, and
  saves from a different game build produce a visible warning. Live browser
  migration and recovery have been verified.
- The build-scoped skill-to-formula map covers all 210 player skill sets: 130
  map through exact tooltip evidence, 51 through the verified naming transform,
  and 29 remain unresolved. Its 1,854 edges reference 1,814 unique formula rows,
  with 11 skill-linked placeholder bases still unresolved. See
  `docs/skill-formula-mapping.md`.
- `web/data/app-data.json` is now a 1,144-byte manifest for five hashed
  projections: equipment, runes, progression, skills, and labels. Each
  projection retains the web-data schema and game-build provenance. The split
  separates concerns, improves integrity and caching, and enables future
  selective loading. The current browser initialization still assembles all
  five projections.
- Live browser verification passed for both the Armory and Tracker against the
  projected data.
- The build-scoped `stat_sources` index contains 293,446 level/rank rows across
  2,394 named static sources. It normalizes 193 raw stat IDs to 110 canonical
  metrics while retaining values, units, scope, conditions, provenance, and
  confidence. Equipment, traits, resonance, masteries, runes, rune synergies,
  direct sets, attributes, breakpoints, and armor-material rules are indexed.
  Heavy Attack Chance currently resolves to 15,247 rows across 490 named
  sources. Optional and randomized sources are explicitly separated from
  inherent stats. See `docs/stat-taxonomy.md` and
  `docs/stat-source-coverage-audit.md`.
- The latest verification gate passed BuildSnapshot checks, 69/69 assertions
  across three fixtures, all 12 edge checks, 132 JavaScript tests, and 92
  collector tests.
- Combat-power parity analysis now maps 1,280 items using source-aware evidence,
  with 161 unresolved. The decoded reference subtotal is 7,221, already 93
  points above the observed 7,128 total, proving that the remaining aggregation
  pipeline cannot be replaced by a simple sum. The live calculator remains
  unchanged until those rules are proven. See
  `plans/combat-simulator/combat-power-parity.md`.

See `STATUS.md` for the current snapshot, open issues, verified commands, and
recommended next work.

## Browser state

- Armory build: `localStorage["tlhelper-builder-state-v2"]`
- Armory presets: `localStorage["tlhelper-builder-presets-v1"]`
- Tracker: `localStorage["tl-tracker-state-v1"]`

Armory state and presets are wrapped in versioned documents that preserve the
game-build identifier. Legacy values migrate in place, corrupt values are
backed up before recovery, and build mismatches are surfaced to the user.

## Key references

- `STATUS.md`: current operational truth
- `docs/data-contract.md`: warehouse contract
- `docs/storage-and-retention.md`: data-root and retention rules
- `docs/update-orchestrator.md`: one-command refresh, validation, and reports
- `docs/skill-formula-mapping.md`: complete player skill-to-formula coverage and unresolved evidence
- `scripts/combat-abilities/reviewed-abilities.json`: manually reviewed real ability rows
- `docs/combat-calibration-first-protocol.md`: first safe manual calibration experiment
- `docs/stat-taxonomy.md`: internal IDs to player-facing stat semantics
- `docs/stat-source-coverage-audit.md`: current source coverage, exclusions, and missing joins
- `docs/skill-stat-source-join.md`: evidence and implementation boundary for dynamic skill/passive grants
- `FIX-PLAN.md`: completed application audit plus remaining fixture work
- `plans/combat-simulator/combat-data-audit.md`: decoded combat-data findings
- `plans/combat-simulator/combat-power-parity.md`: decoded component parity and replacement limits
- `plans/combat-simulator/unknown-formulas.md`: mechanics that remain uncertain
- `packages/combat-engine/README.md`: deterministic engine boundary and test command
- `plans/upcoming-content-radar/`: content-intelligence architecture
- `design-handoff/`: original application design references

The build regression currently matches all 69 asserted totals across three
fixtures. The original Questlog reference build still matches 7,128 combat
power, while focused healer and ranged smoke fixtures broaden calculator
coverage. Complete manual Questlog panels for those two archetypes remain the
next fixture task.
