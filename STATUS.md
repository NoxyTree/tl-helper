# Project status: TL data platform

Updated 2026-07-10 after Combat Simulator Milestones 0 and 1. Current snapshot:
game version `1.431.22.7761`, Steam build `24118850`, decoder `0.1.0`.

TL-Helper now has a verified, one-command path from installed game archives to
decoded, normalized, searchable, browser-ready data. Combat Simulator Milestone
0 data discovery and Milestone 1 BuildSnapshot integration are complete. The
browser projection split and combat-power comparison are also complete. The
next priorities are complete manual healer and ranged Questlog panels,
patch-safe saved builds, remaining formula and combat-power mappings, and
Combat Simulator Milestone 2.

## Current source-of-truth hierarchy

1. Decoded game files for client-visible data and formulas.
2. The build-scoped SQLite warehouse as the stable downstream interface.
3. Questlog as a compatibility, parity, and coverage reference.
4. Versioned derived or calibrated rules where the client does not expose the complete behavior.

Every conclusion should retain source path, game build, decoder version,
confidence, and whether it is extracted, derived, modeled, or calibrated.

## What is ready

| Layer | Current state | Entry point or evidence |
| --- | --- | --- |
| Web application | Armory, tracker, achievements, static build calculator | `web/` |
| BuildSnapshot v1 | Immutable, versioned static-build contract used by Armory, tracker, and tests | `web/tl-build-snapshot.js` |
| Static calculation regression | 69/69 assertions across 3 fixtures; 12/12 edge cases | `scripts/verify-reference-build.mjs`, `scripts/verify-edge-cases.mjs` |
| Coverage audit | All four stated counts validate from the new data root | `node scripts/audit-questlog-coverage.mjs` |
| `TLJsonDataTable` decoder | Tagged-property row format decoded; every attempted table clean | `node scripts/decode-tljson-table.mjs --all-priority` |
| Collector | 92 tests; deterministic rerun, resume, build-scoped output, `TL_DATA_ROOT` | `dotnet run --project src/TlCollector/App -- sample` |
| Normalized warehouse | **85,099 records across 38 decoded tables**, with provenance and FTS5 | `D:\TL_Data\warehouse\tl-24118850.sqlite` |
| Table inventory | 1,387 tables across 680 families inventoried and prioritized | `D:\TL_Data\reports\24118850\table-inventory.json` |
| Asset casing | App-only 2,692 references: 2,269 exact and 423 case-insensitive; no missing references | `node --test scripts/tests/asset-case-index.test.mjs` |
| Discovery evidence | Ascended Ramux and WP_CL evidence packets | `D:\TL_Data\reports\24118850\evidence\` |
| Combat data audit | Milestone 0 complete; 4 deliverables and 7 initial validation abilities | `plans/combat-simulator/combat-data-audit.md` |
| Combat-power parity | Decoded item components analyzed; full aggregation and some item families remain unresolved | `plans/combat-simulator/combat-power-parity.md` |
| Storage separation | Code in `D:\TL_Helper`; bulk data in `D:\TL_Data` | `docs/storage-and-retention.md` |
| Browser projections | 1,144-byte manifest plus 5 hashed projections; Armory and Tracker verified live | `web/data/app-data.json` |
| Update orchestrator | Complete guarded refresh including `combat-power-analysis`, stage gates, and JSON run reports | `node scripts/update-tl-helper.mjs` |

## Verified data snapshot

The following values were checked against the warehouse, inventory JSON, and
coverage summary on 2026-07-10:

- Warehouse: **85,099 records**, **38 distinct decoded tables**, 8,564 records with resolved English names.
- Inventory: 1,387 tables, 680 families, 676,769,295 raw bytes indexed.
- Formula system: `TLFormulaParameterNew` has 10,656 rows and 26 formula types.
- Tooltip resolution: 3,602 of 3,777 distinct bases resolve, or 95.4%.
- Assets: 15,020 extracted PNGs; 2,455 equipment-subtree PNGs.
- App references: 2,692 unique paths, all resolved. Of these, 423 require a case-insensitive match.
- Combined audit set: 2,695 references, all resolved. The extra three are set bonus icons outside `app-data.json`.
- Local unreferenced PNGs: 12,325, including 1,165 equipment icons, 1,807 other item icons, and 593 skill icons.
- Web data: `web/data/app-data.json` is a 1,144-byte manifest for five hashed
  projections covering equipment, runes, progression, skills, and labels. The
  manifest records schema, game build `24118850`, generation time, byte sizes,
  and SHA-256 hashes.
- Live browser verification: Armory and Tracker both passed against the
  projected dataset.
- BuildSnapshot: schema `tl-helper.build-snapshot` v1, ruleset
  `questlog-static-v1`, with immutable resolved output and canonical JSON
  round-trip verification.
- Latest verification gate: BuildSnapshot passed, 69/69 assertions across 3
  fixtures, all 12 edge checks passed, JavaScript tests 25/25, collector tests
  92/92.

## Combat milestones

Combat Simulator Milestone 0 is complete. The game files expose per-level skill
coefficients, tooltip values, cooldown and cost references, boss and PvE
variants, stat curves, item scaling, and much of the buff, debuff, stack,
exclusivity, and crowd-control metadata.

The client data does not yet establish the exact mitigation and contest curves,
combat-pipeline order, rounding, server tick behavior, threat coefficients, or
all PvP modifiers. These are catalogued in
`plans/combat-simulator/unknown-formulas.md` and must not be invented.

The smallest trustworthy future Combat Lab is a single-ability calculator using
the seven cases in `plans/combat-simulator/initial-validation-cases.md`, with a
formula trace and precision label for every stage.

Combat Simulator Milestone 1 is also complete. The Armory and tracker both use
`resolveBuildSnapshot()` as the stable browser boundary around
`calculateBuild()`. BuildSnapshot v1 includes normalized attributes and loadout,
resolved stats and sources, combat power, rune synergies, validation, ruleset,
calculator version, and game-data build. Snapshots are deeply immutable,
versioned, validated, and canonically serializable.

## Data locations

```text
D:\TL_Helper\                       code, docs, schemas, tests, small fixtures
D:\TL_Data\raw\24118850\           preserved source snapshot
D:\TL_Data\decoded\24118850\       decoded table rows
D:\TL_Data\warehouse\              normalized SQLite warehouse
D:\TL_Data\manifests\24118850\     collection manifest and verification
D:\TL_Data\reports\24118850\       inventories and evidence reports
```

Set `$env:TL_DATA_ROOT = 'D:\TL_Data'` for all data tooling. The legacy
`D:\TL_Helper\Output` copy remains safe to remove only after FModel is repointed
or retired. No cloud upload or off-machine backup has been authorized.

## One-command current-build sequence

```powershell
cd D:\TL_Helper
$env:TL_DATA_ROOT = 'D:\TL_Data'
node scripts\update-tl-helper.mjs --validate
node scripts\update-tl-helper.mjs --dry-run
node scripts\update-tl-helper.mjs
```

The orchestrator stops at the first failed stage and records commands, timings,
exit codes, output tails, and safety state beneath
`D:\TL_Data\reports\<build>\update-runs\`. It resolves the verified SDK at
`D:\TL_Data\cache\tools\dotnet-sdk\dotnet.exe` automatically. Detailed usage,
targeted recovery, and safety rules are in `docs/update-orchestrator.md`.
The guarded sequence includes `combat-power-analysis`, which refreshes the
decoded-versus-live parity evidence before the application verification stages.

## Open technical work

- Materialize the full skill-to-formula mapping for all 210 skill sets.
- Decode or map `TLAbnormalContentsGroup` for buff exclusivity references.
- Curate the field-to-table map needed for complete `TLDataHandle` resolution.
- Parse package-local `ObjectProperty` imports where future non-cosmetic links require them.
- Resolve the 175 NPC-kit tooltip bases not covered by player formula rows.
- Capture a second game build before claiming patch-history behavior.
- Complete full manual Questlog expected panels for the healer and ranged
  fixtures. Their current focused smoke panels are passing.
- Add saved-build schema versions, migrations, and data-build identifiers.
- Resolve the remaining combat-power aggregation rules and unsupported legacy
  item families before replacing the fitted live calculation.
- Arrange off-machine backup only with explicit user authorization.

## Recommended refinement order

1. Complete full manual Questlog panels for healer and ranged builds.
2. Add patch-safe saved-build migration and recovery.
3. Materialize the complete skill-to-formula mapping.
4. Resolve the combat-power aggregation pipeline and unsupported item families.
5. Begin Combat Simulator Milestone 2, the deterministic engine skeleton.
6. Build the seven-case single-ability Combat Lab after the engine boundary and
   calibration labels are ready.

## Read first next session

1. `STATUS.md`
2. `README.md`
3. `docs/data-contract.md`
4. `docs/storage-and-retention.md`
5. `docs/update-orchestrator.md`
6. `web/tl-build-snapshot.js`
7. `plans/combat-simulator/combat-data-audit.md`
8. `plans/combat-simulator/unknown-formulas.md`
9. `plans/combat-simulator/06-implementation-roadmap.md`
10. `D:\TL_Data\reports\24118850\update-runs\latest.json`
