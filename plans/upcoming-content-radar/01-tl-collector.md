# TL Collector Creation Plan

## Objective

Create a command-line collector that reads the local Throne and Liberty archives without launching the game, exports only approved data and 2D assets, resumes interrupted work, and processes only new or changed packages after later game updates.

The collector replaces manual FModel navigation. FModel remains useful for visual inspection and troubleshooting.

## Proposed implementation

- Language: C#.
- Project: `D:\TL_Helper\src\TlCollector`.
- Archive library: CUE4Parse.
- Localization fallback: repak for legacy localization `.pak` files.
- Output root: `D:\TL_Intelligence`.
- Configuration: JSON with schema validation.
- Logging: structured JSON lines plus concise console output.

## Safety boundary

The process must:

- Operate only on files under the configured game archive directory.
- Open source archives read-only.
- Refuse output paths inside the game installation.
- Refuse to run if the configured output resolves inside the source archive path.
- Avoid process enumeration except optional detection that the game is running.
- If game-running detection is enabled, stop safely rather than attaching to anything.
- Never modify, repack, mount, inject, or write to the game install.
- Never export configured forbidden asset classes.

## CLI design

```text
tl-collector scan
tl-collector extract --profile knowledge
tl-collector extract --profile textures
tl-collector diff --from <build> --to current
tl-collector index --build <build>
tl-collector verify --build <build>
tl-collector status
```

Every command should support:

```text
--config <path>
--output <path>
--json
--verbose
--dry-run
```

## Collection profiles

### Knowledge profile

Include:

```text
TL/Content/Game/Client/Table
TL/Content/ActionTree
TL/Content/BehaviorTree
TL/Content/AssetRef
TL/Content/Blueprints
TL/Content/ContentsCondition
TL/Content/System
TL/Content/TutorialCondition
```

### Texture profile

Include only `Texture2D` exports under approved prefixes:

```text
TL/Content/Image/Skill
TL/Content/Image/Icon/Item_128
TL/Content/Image/Monster
TL/Content/Image/Codex
TL/Content/Image/Dungeon
TL/Content/Image/Achievement
TL/Content/Image/Guide
TL/Content/Image/MapIcon
TL/Content/Image/Housing
```

### Explicit exclusions

- Movies and Bink files
- Audio and Wwise content
- Static meshes
- Skeletal meshes
- Animations
- Maps and world geometry
- Materials unless required solely to resolve an approved texture
- Shader and pipeline caches

## Manifest design

Each build manifest should contain:

```json
{
  "gameVersion": "1.431.22.7761",
  "steamBuild": "24118850",
  "scannedAtUtc": "...",
  "archiveRoot": "...",
  "containers": [],
  "packages": [],
  "outputs": [],
  "errors": []
}
```

Each package record should include:

- Internal package path
- Archive or IoStore container
- Package type
- Source size
- Container timestamp
- Source hash or stable package identity where practical
- Export profile
- Output files
- Output hashes
- Processing duration
- Result status
- Error details

## Incremental algorithm

1. Read the Steam app manifest and local executable version.
2. Enumerate supported `.pak`, `.utoc`, and `.ucas` containers.
3. Compare container metadata against the previous build manifest.
4. Enumerate packages only from changed containers.
5. Compare package identity, path, size, and available hash data.
6. Queue only new or changed approved packages.
7. Reuse content-addressed outputs when hashes match an older build.
8. Write the new manifest atomically after verification.
9. Preserve failed work in a resumable queue.

If package-level hash information is unavailable cheaply, the first version may reprocess approved packages from changed containers. This is still better than re-exporting the complete archive.

## Performance design

- Scan archive indexes once per run.
- Filter package paths before object loading.
- Use a bounded worker queue.
- Keep table parsing and texture decoding in separate queues.
- Avoid recompressing an unchanged PNG.
- Store outputs by content hash and link them into build snapshots.
- Batch manifest writes.
- Cache localization parsing.
- Record timing per stage so bottlenecks are visible.

Performance must never compromise deterministic output or archive safety.

## Output contract

```text
D:\TL_Intelligence\snapshots\<build>\
  raw-tables\
  properties\
  localization\
  textures\
  indexes\
  manifest.json
  verification.json
```

## Verification

The baseline collector must reproduce the important current counts or explain intentional scope differences:

- 1,387 main game-table JSON files
- 1,387 matching raw main game-table packages
- 15,020 approved current PNGs when using the full existing texture scope
- Eight localization resources
- 160,117 English localization entries

Additional checks:

- No forbidden extensions in output.
- No output file path escapes the configured root.
- No source file changes.
- Re-running an unchanged build performs no extraction work.
- Interrupted runs resume without duplicating output.
- Dry-run reports exactly what would be processed.

## Deliverables

- C# project and solution integration
- Configuration schema and example
- CLI help and command documentation
- Baseline manifest
- Incremental update tests
- Safety tests
- Performance report
- Operator runbook

