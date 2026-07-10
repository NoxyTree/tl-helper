# TL Radar Creation Plan

## Objective

Build an evidence-based analysis pipeline that identifies content present in the local client but absent from Questlog or current official documentation, then tracks how that content changes between game builds.

The radar must detect content across all domains, not only abilities.

## Detection modes

### Current-build coverage mode

Compare one local build against:

- Questlog snapshots
- The normalized app dataset
- Current official update notes
- Current official roadmap announcements
- Known live content

This mode finds preloaded but unpublished content and public-data gaps.

### Patch-diff mode

Compare two collector snapshots to find:

- New packages
- Removed packages
- Changed raw table packages
- New or changed localization keys
- New or changed icons
- New achievements and rewards
- New encounter logic
- New content-opening configuration
- Placeholder text that became complete

Patch-diff evidence is more valuable than a current-build-only observation.

## Content domains

- Weapons and player skills
- Traits, specializations, and masteries
- Item and equipment passives
- Bosses, Archbosses, and Colossi
- Dungeons, raids, and dimensional trials
- Maps, regions, and battlegrounds
- Quests, Codex, story, and dialogue
- Items, sets, recipes, and materials
- Achievements and memorial records
- Events, attendance, and season passes
- Housing, furniture, fishing, and cooking
- Morphs, Amitoi, costumes, emotes, and shop content
- Feature flags, UI screens, and content-opening rules

## Normalization pipeline

1. Import the collector manifest.
2. Import decoded and schema-only table records.
3. Import localization for every language.
4. Import texture paths and dimensions.
5. Import Questlog records.
6. Import official mentions as separate evidence records.
7. Extract internal IDs, prefixes, and references.
8. Link records through exact IDs and asset paths.
9. Apply weaker name matching only after exact matching.
10. Build content clusters.
11. Score and classify candidates.
12. Generate machine-readable and human-readable reports.

## Entity matching order

Use evidence in this order:

1. Exact internal ID
2. Exact package or asset path
3. Exact localization key
4. Exact normalized name within the same domain
5. Strong shared prefix plus supporting relationships
6. Fuzzy name similarity as an unresolved suggestion only

Fuzzy matches must never be reported as confirmed.

## Candidate model

```json
{
  "candidateId": "upcoming-colossus-vegamor",
  "canonicalName": "Vegamor",
  "contentType": "colossus",
  "classification": "datamined_very_high_confidence",
  "officialStatus": "unnamed_colossus_announced",
  "questlogStatus": "absent",
  "firstSeenBuild": "24118850",
  "lastSeenBuild": "24118850",
  "confidence": 96,
  "signals": [],
  "negativeSignals": [],
  "evidenceIds": [],
  "notes": []
}
```

## Classification taxonomy

- `live_public`
- `live_missing_from_questlog`
- `officially_announced`
- `datamined_very_high_confidence`
- `datamined_likely`
- `datamined_incomplete`
- `internal_component`
- `npc_or_encounter_only`
- `item_or_affix_passive`
- `legacy_or_prototype`
- `test_content`
- `deprecated_or_not_in_use`
- `regional_variant`
- `unresolved`

## Confidence signals

Suggested positive weights:

| Signal | Weight |
| --- | ---: |
| Newly added since previous build | 20 |
| Added or materially changed in two consecutive builds | 10 |
| Complete localized name | 5 |
| Complete localized description | 8 |
| Localized in multiple languages | 8 |
| Dedicated icon, portrait, or map art | 8 |
| Linked NPC or encounter record | 8 |
| Linked achievement or memorial | 8 |
| Linked reward, gear, or recipe | 8 |
| Encounter dialogue or action-tree mechanics | 10 |
| Content-opening or schedule data | 12 |
| Official announcement alignment | 20 |
| Missing from Questlog or live public dataset | 3 |

Suggested negative weights:

| Signal | Weight |
| --- | ---: |
| Explicit `Not in Use` text | -30 |
| Test or prototype naming | -20 |
| Copy-only variant with no independent references | -10 |
| Only one orphaned identifier | -20 |
| No localization, art, or relationships | -15 |
| Unchanged residue across many builds | -8 |
| Clearly an internal sub-effect of a live skill | -15 |

Weights must remain configurable and explainable. The score is a prioritization aid, not proof.

## Content clustering

The radar should group related evidence by:

- Internal code prefix
- Localization namespace
- Region code
- NPC race or encounter ID
- Shared reward and item references
- Shared image naming
- Shared action-tree paths
- Dialogue references
- Patch introduction time

For example, Ramux evidence should cluster achievements, weapons, Codex, memorial, attendance, and NPC naming into one candidate instead of separate findings.

## Required reports

```text
reports\<build>\
  executive-summary.md
  officially-announced.md
  very-high-confidence.md
  likely.md
  incomplete.md
  questlog-gaps.md
  legacy-and-test.md
  new-localization.csv
  new-assets.csv
  changed-tables.csv
  candidates.json
  evidence.jsonl
```

## Spoiler and communication rules

- Every report must distinguish official information from inference.
- Public output should support confirmed-only, likely, and speculative filters.
- Do not convert a local name into an official claim.
- Do not infer release dates solely from file presence.
- Regional content must not automatically be treated as global upcoming content.
- Cut content may remain in the client indefinitely.
- The LLM-facing summary must cite evidence paths for each claim.

## Acceptance tests

### Ramux

- Cluster local Ramux evidence correctly.
- Recognize official announcement alignment.
- Recognize absence from current Questlog data.
- Classify as announced with strong preload evidence.

### Vegamor

- Cluster dialogue, mechanics, memorial, gear, and Codex evidence.
- Link cautiously to the officially announced unnamed August Colossus.
- State that the name-to-roadmap link is inferred.
- Classify at high confidence without calling it official.

### WP_CL

- Detect names, descriptions, and images.
- Detect references to Gauntlet systems.
- Apply legacy or prototype negative evidence.
- Avoid presenting it as a confirmed future weapon.

## Deliverables

- Import and normalization pipeline
- Build-diff engine
- Questlog comparison engine
- Official-mention importer
- Candidate clustering engine
- Configurable scoring engine
- Markdown, JSON, JSONL, and CSV reports
- Reproducible acceptance tests

