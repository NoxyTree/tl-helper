# Project status: TL data platform

Updated 2026-07-11 after combat-log import and decoder coverage updates. Current snapshot:
game version `1.431.22.7761`, Steam build `24118850`, decoder `0.2.0`.

TL-Helper now has a verified, one-command path from installed game archives to
decoded, normalized, searchable, browser-ready data. Combat Simulator Milestone
0 data discovery, Milestone 1 BuildSnapshot integration, and Milestone 2
deterministic engine are complete. The
browser projection split, patch-safe Armory persistence, complete player-skill
formula-map pass, source-aware combat-power comparison, and the first
normalized stat-source index are also complete.
The next priorities are complete manual healer and ranged Questlog panels,
native combat-power aggregation, remaining formula mappings, and Combat
Simulator Milestone 3 formula ingestion and calibration.

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
| Web application | Armory, tracker, achievements, static build calculator, and first Combat Lab | `web/` |
| BuildSnapshot v1 | Immutable, versioned static-build contract used by Armory, tracker, and tests | `web/tl-build-snapshot.js` |
| Static calculation regression | 69/69 assertions across 3 fixtures; 12/12 edge cases | `scripts/verify-reference-build.mjs`, `scripts/verify-edge-cases.mjs` |
| Coverage audit | All four stated counts validate from the new data root | `node scripts/audit-questlog-coverage.mjs` |
| `TLJsonDataTable` decoder | RowStruct-validated tagged-property decoding; 30 curated tables clean, including `TLEffectProperty` and all weapon abnormal states | `node scripts/decode-tljson-table.mjs --all-priority` |
| Collector | 92 tests; deterministic rerun, resume, build-scoped output, `TL_DATA_ROOT` | `dotnet run --project src/TlCollector/App -- sample` |
| Normalized warehouse | **140,591 records across 48 decoded tables**, with provenance and FTS5 | `D:\TL_Data\warehouse\tl-24118850.sqlite` |
| Stat-source index | 293,446 level/rank rows across 2,394 named static sources and 110 canonical metrics | `scripts/build-stat-sources.mjs` |
| Table inventory | 1,387 tables across 680 families inventoried and prioritized | `D:\TL_Data\reports\24118850\table-inventory.json` |
| Asset casing | App-only 2,692 references: 2,269 exact and 423 case-insensitive; no missing references | `node --test scripts/tests/asset-case-index.test.mjs` |
| Discovery evidence | Ascended Ramux and WP_CL evidence packets | `D:\TL_Data\reports\24118850\evidence\` |
| Combat data audit | Milestone 0 complete; 4 deliverables and 7 initial validation abilities | `plans/combat-simulator/combat-data-audit.md` |
| Combat engine | Milestone 2 complete; deterministic fixed-point simulation and 22 focused tests | `packages/combat-engine/` |
| Real ability ingestion | 3 abilities, 5 reviewed components, 12 explicit unresolved stages | `D:\TL_Data\reports\24118850\combat-abilities.json` |
| Calibration harness | 49 real observations across 8 experiments: tooltip basis verified, Heavy Heal ×2 verified by HP deltas, Health Regen semantics identified, and a reviewed +20.85% versus +4.2% Healing Received comparison preserved | `plans/combat-simulator/calibration-findings-2026-07-10.md` |
| Community calculator audit | Healing, Healing Received, Skill Damage Boost, Cooldown Speed, and Buff Duration assumptions classified without promoting community formulas to verified rules | `plans/combat-simulator/community-calculator-audit-2026-07-11.md` |
| Combat-log calibration | Version 4 schema reviewed across 531 dummy hits; Critical and Heavy flags are explicit, and the displayed +128.4% Heavy Attack Damage fits a 2.284 magnitude multiplier | `plans/combat-simulator/combat-log-findings-2026-07-11.md` |
| Combat-log importer | Versioned `CombatLogVersion,4` importer with source hash, explicit outcome flags, and reviewed Judgment Lightning effect mappings | `node scripts/import-combat-log.mjs --input <log>` |
| Combat Lab | Saved-build Base Damage ranges, verified rarity mapping, reviewed ability coefficients, and opt-in Swift Healing v1 projections with complete traces and explicit modeled/final boundaries | `web/combat-lab.html` |
| Skill-to-formula map | All 210 player skill sets covered: 130 exact, 51 derived, 29 unresolved | `docs/skill-formula-mapping.md` |
| Combat-power parity | 1,280 source-aware item mappings; 161 unresolved; full aggregation remains unresolved | `plans/combat-simulator/combat-power-parity.md` |
| Armory persistence | Versioned state and presets with legacy migration, corrupt recovery, and build mismatch warnings | `web/tl-persistence.js` |
| Storage separation | Code in `D:\TL_Helper`; bulk data in `D:\TL_Data` | `docs/storage-and-retention.md` |
| Browser projections | 1,144-byte manifest plus 5 hashed projections; Armory and Tracker verified live | `web/data/app-data.json` |
| Update orchestrator | Complete guarded refresh including `skill-formula-map`, `combat-power-analysis`, stage gates, and JSON run reports | `node scripts/update-tl-helper.mjs` |

## Verified data snapshot

The following values were checked against the warehouse, inventory JSON, and
coverage summary on 2026-07-10:

- Warehouse: **140,591 records**, **48 distinct decoded tables**, 8,564 records with resolved English names.
- Newly decoded combat coverage: `TLEffectProperty` contributes 54,205 client-visible effect-property rows; all eleven weapon abnormal-state tables are decoded, including 174 Staff rows. This improves effect and buff evidence, but does not prove server modifier order, mitigation, contests, or rounding.
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
- Stat sources: 293,446 build-scoped rows, 2,394 named sources, 193 raw stat
  IDs, and 110 canonical metrics. Heavy Attack Chance has 15,247 rows across
  490 named sources. Fixed curves, selectable traits, randomized rune and
  resonance rolls, direct synergies and sets, attributes, threshold bonuses,
  material rules, and mastery ranks remain distinct.
- Latest verification gate: BuildSnapshot passed, 69/69 assertions across 3
  fixtures, all 12 edge checks passed, JavaScript tests 138/138, collector tests
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

The first trustworthy Combat Lab is now available at `web/combat-lab.html`.
It uses saved BuildSnapshots, reviewed real ability rows, verified Epic and
Heroic level mappings, Base Damage range endpoints, complete calculation
traces, and stage-level precision. It does not apply target mitigation or any
forced live outcome.

Combat Simulator Milestone 1 is also complete. The Armory and tracker both use
`resolveBuildSnapshot()` as the stable browser boundary around
`calculateBuild()`. BuildSnapshot v1 includes normalized attributes and loadout,
resolved stats and sources, combat power, rune synergies, validation, ruleset,
calculator version, and game-data build. Snapshots are deeply immutable,
versioned, validated, and canonically serializable.

Combat Simulator Milestone 2 is complete in `packages/combat-engine`. The
engine is independent of the DOM and existing calculator, uses BigInt
fixed-point arithmetic, seeded RNG, stable timestamp/phase/sequence ordering,
explicit unit state, provenance-enforced formula registration, arithmetic
traces, and canonical replay serialization. Admission for simultaneous actions
is atomic, magnitudes are bounded, timed shields expire deterministically, and
event expansion is capped. The synthetic mitigation and forced normal/critical
fixture is architecture evidence only. Real mitigation, hit, critical, Heavy
Attack, PvP, rounding order, and server timing remain unsupported until proven.

Milestone 3's ingestion foundation is complete for Judgment Lightning, Swift Healing,
and Distortion Veil. The build-scoped artifact contains five reviewed formula
components with every decoded level and thirteen unresolved stages. Judgment Lightning
and Swift Healing retain reviewed derived-high-confidence components. Distortion Veil
has exact localization-linked evidence.
Stalwart Bastion was corrected in the validation plan: it is a damage-reduction
buff, not a shield.

The first Milestone 3 API boundary is also complete. It loads the reviewed
artifact immutably, exposes expression-only inspection by default, and requires
an explicit opt-in for a caller-supplied Base Damage projection. The result is
always marked pre-resolution with final combat precision unsupported.

The first Milestone 3 user-facing slice is complete. The Combat Lab projects
both ends of a selected source build's Base Damage range, maps only the
live-verified Epic and Heroic level windows, preserves both fixed-point traces,
and exposes forced outcomes as descriptive but non-executable. Judgment
Lightning is the simple-damage baseline: its displayed result is explicitly a
first-cast per-hit component, never a whole-ability total. The confirmed log
IDs `950004896` and `968485880` remain distinct first-cast and conditional
second-cast mappings. The browser
runtime is a byte-exact generated mirror of the authored engine modules, and
the reviewed ability artifact is refreshed by the normal combat-ability build.

The first safe calibration harness is complete. It records immutable manual
observations under `D:\TL_Data\calibration\<build>`, rejects placeholder data,
uses collision-resistant canonical content IDs, and maintains an atomic index.
The initial protocol isolates tooltip basis, Base Damage selection, and
rounding; it explicitly forbids using Gaia Crash to infer mitigation.

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
D:\TL_Data\calibration\24118850\   immutable manual calibration observations
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

- Extend `stat_sources` to dynamic set effects, skills, and passives. The first
  nine Heavy Attack skill joins are mapped in `docs/skill-stat-source-join.md`.
  Current exact gaps and exclusions are in `docs/stat-source-coverage-audit.md`.
- Decode `TLAbnormalContentsGroup` with a dedicated layout parser for buff exclusivity references; it does not use the normal tagged `RowStruct` header.
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

1. Use decoded `TLEffectProperty` rows to classify Judgment Lightning and other effect components without inferring server execution order.
2. Materialize the nine reviewed Heavy Attack skill/passive sources.
3. Build the calibration hypothesis enumerator for multiplier, roll, and
   rounding candidates.
4. Wire additional reviewed real abilities into the Combat Lab one case at a
   time.
5. Complete full manual Questlog panels for healer and ranged builds.
6. Implement the native `TLItemCombatPower` consumer and resolve aggregation.

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
12. `packages/combat-engine/README.md`
13. `D:\TL_Data\reports\24118850\update-runs\latest.json`
