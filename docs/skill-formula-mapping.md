# Skill-to-formula mapping

`scripts/build-skill-formula-map.mjs` materializes the build-scoped relationship between the 210 player skill sets and `TLFormulaParameterNew`.

Run it with:

```powershell
$env:TL_DATA_ROOT = 'D:\TL_Data'
$env:TL_STEAM_BUILD = '24118850'
node scripts\build-skill-formula-map.mjs
```

The machine-readable output is `D:\TL_Data\reports\<build>\skill-formula-map.json`. It retains every mapped formula variant and every per-level parameter row, plus source-table hashes and decoder provenance.

Mappings have three classifications:

- `exact`: a raw localization placeholder names the formula row.
- `derived`: the row matches the verified player-skill naming transform, such as `WP_BO_S_PowerShot` to `BO_PowerShot_*`, but is not directly named by an inspected placeholder.
- `unresolved`: neither signal produces a formula row. The mapper does not use fuzzy matching or guess NPC-only aliases.

The Questlog skill-set response defines the current 210 player-facing sets. Formula values and localization evidence come from the extracted game build. A new build must regenerate the report; the script refuses a formula table whose embedded build does not match `TL_STEAM_BUILD`.

This mapping establishes data provenance, not live combat resolution order. Derived rows still require semantic review before a combat engine uses them automatically.

## Build 24118850 coverage

The current report covers all 210 player skill sets:

- 130 skill sets have at least one exact placeholder mapping.
- 51 have naming-derived mappings only.
- 29 remain unresolved.
- 1,854 mapping edges point to 1,814 unique formula rows: 647 exact edges and 1,207 derived variant edges.
- 11 skill-linked placeholder bases are absent from `TLFormulaParameterNew`; they remain recorded as unresolved.

The 29 unresolved sets are concentrated in passives, defensive actions, and effects whose localized descriptions either contain no formula placeholder or name a row absent from the decoded table. The complete named list and evidence are in the report's `unresolvedSkillSets` array.
