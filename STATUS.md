# Project status: TL data platform

Updated 2026-07-10 after Combat Simulator Milestones 0 and 1. Current snapshot:
game version `1.431.22.7761`, Steam build `24118850`, decoder `0.1.0`.

TL-Helper now has a verified, one-command path from installed game archives to
decoded, normalized, searchable, browser-ready data. Combat Simulator Milestone
0 data discovery and Milestone 1 BuildSnapshot integration are complete. The
browser projection split, patch-safe Armory persistence, complete player-skill
formula-map pass, source-aware combat-power comparison, and the first
normalized stat-source index are also complete.
The next priorities are complete manual healer and ranged Questlog panels,
native combat-power aggregation, remaining formula mappings, and Combat
Simulator Milestone 2.

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
| Stat-source index | 183,676 level/rank rows across 2,070 named equipment/mastery sources and 106 canonical metrics | `scripts/build-stat-sources.mjs` |
| Table inventory | 1,387 tables across 680 families inventoried and prioritized | `D:\TL_Data\reports\24118850\table-inventory.json` |
| Asset casing | App-only 2,692 references: 2,269 exact and 423 case-insensitive; no missing references | `node --test scripts/tests/asset-case-index.test.mjs` |
| Discovery evidence | Ascended Ramux and WP_CL evidence packets | `D:\TL_Data\reports\24118850\evidence\` |
| Combat data audit | Milestone 0 complete; 4 deliverables and 7 initial validation abilities | `plans/combat-simulator/combat-data-audit.md` |
| Skill-to-formula map | All 210 player skill sets covered: 130 exact, 51 derived, 29 unresolved | `docs/skill-formula-mapping.md` |
| Combat-power parity | 1,280 source-aware item mappings; 161 unresolved; full aggregation remains unresolved | `plans/combat-simulator/combat-power-parity.md` |
| Armory persistence | Versioned state and presets with legacy migration, corrupt recovery, and build mismatch warnings | `web/tl-persistence.js` |
| Storage separation | Code in `D:\TL_Helper`; bulk data in `D:\TL_Data` | `docs/storage-and-retention.md` |
| Browser projections | 1,144-byte manifest plus 5 hashed projections; Armory and Tracker verified live | `web/data/app-data.json` |
| Update orchestrator | Complete guarded refresh including `skill-formula-map`, `combat-power-analysis`, stage gates, and JSON run reports | `node scripts/update-tl-helper.mjs` |

## Verified data snapshot

The following values were checked against the warehouse, inventory JSON, and
coverage summary on 2026-07-10:

- Warehouse: **85,099 records**, **38 distinct decoded tables**, 8,564 records with resolved English names.
- Inventory: 1,387 tables, 680 families, 676,769,295 raw bytes indexed.
- Formula system: `TLFormulaParameterNew` has 10,656 rows and 26 formula types.
- Tooltip resolution: 3,602 of 3,777 distinct bases resolve, or 95.4%.
- Skill formula map: all 210 player skill sets assessed, with 130 exact, 51
  derived, and 29 unresolved mappings. Its 1,854 edges reference 1,814 unique
  formula rows; 11 skill-linked placeholder bases remain unresolved.
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
- Stat sources: 183,676 build-scoped rows, 2,070 named sources, 169 raw stat
  IDs, and 106 canonical metrics. Heavy Attack Chance has 5,061 rows across
  430 named sources, with fixed curves, traits, resonance, unique traits, and
  mastery ranks kept distinct.
- Latest verification gate: BuildSnapshot passed, 69/69 assertions across 3
  fixtures, all 12 edge checks passed, JavaScript tests 39/39, collector tests
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

Patch-safe Armory persistence is complete. State and presets use versioned
documents with game-build provenance, legacy values migrate automatically,
corrupt values are backed up before recovery, and cross-build saves produce a
warning. Live browser migration and recovery verification passed.

The complete first-pass player skill-to-formula map is materialized and runs as
the orchestrator's `skill-formula-map` stage. Coverage and classification rules
are documented in `docs/skill-formula-mapping.md`. The remaining 29 skill sets
and 11 skill-linked placeholder bases are retained as explicit unresolved work.

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
The guarded sequence includes `skill-formula-map`, `stat-sources`, and
`combat-power-analysis`. These refresh formula provenance, the named stat
index, and decoded-versus-live parity evidence before application verification.

## Open technical work

- Extend `stat_sources` to runes, rune synergies, item sets, attribute
  breakpoints, material bonuses, skills, and passives. Current exact gaps and
  exclusions are in `docs/stat-source-coverage-audit.md`.
- Decode or map `TLAbnormalContentsGroup` for buff exclusivity references.
- Curate the field-to-table map needed for complete `TLDataHandle` resolution.
- Parse package-local `ObjectProperty` imports where future non-cosmetic links require them.
- Resolve the remaining 29 player skill sets and 11 skill-linked placeholder
  bases in the materialized map.
- Capture a second game build before claiming patch-history behavior.
- Complete full manual Questlog expected panels for the healer and ranged
  fixtures. Their current focused smoke panels are passing.
- Implement a native `TLItemCombatPower` consumer and resolve its aggregation
  rules. Source-aware mapping now covers 1,280 items with 161 unresolved, but
  the decoded reference subtotal of 7,221 already exceeds the observed 7,128
  total by 93, so it cannot replace the live calculation yet.
- Arrange off-machine backup only with explicit user authorization.

## Recommended refinement order

1. Complete full manual Questlog panels for healer and ranged builds.
2. Implement the native `TLItemCombatPower` consumer and resolve aggregation.
3. Resolve the remaining 29 skill mappings and 11 placeholder bases.
4. Begin Combat Simulator Milestone 2, the deterministic engine skeleton.
5. Build the seven-case single-ability Combat Lab after the engine boundary and
   calibration labels are ready.

## Read first next session

1. `STATUS.md`
2. `README.md`
3. `docs/data-contract.md`
4. `docs/storage-and-retention.md`
5. `docs/update-orchestrator.md`
6. `docs/skill-formula-mapping.md`
7. `web/tl-build-snapshot.js`
8. `web/tl-persistence.js`
9. `plans/combat-simulator/combat-data-audit.md`
10. `plans/combat-simulator/unknown-formulas.md`
11. `plans/combat-simulator/06-implementation-roadmap.md`
12. `D:\TL_Data\reports\24118850\update-runs\latest.json`
