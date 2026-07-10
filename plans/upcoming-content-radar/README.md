# Throne and Liberty Upcoming Content Intelligence

## Purpose

This planning pack defines a local, read-only system for collecting Throne and Liberty client data, comparing game builds, detecting content that is not yet represented by Questlog, and making the evidence safely searchable by an LLM.

The system has four main components:

1. `tl-collector`: fast, repeatable, incremental extraction from the installed game archives.
2. `tl-radar`: evidence-based detection and classification of possible upcoming content.
3. `upcoming-content.sqlite`: a versioned knowledge database with full provenance.
4. `tl-intel-mcp`: a read-only tool interface for Claude, Codex, and other LLM clients.

## Existing inputs

| Input | Location | Purpose |
| --- | --- | --- |
| Local game install | `D:\SteamLibrary\steamapps\common\Throne and Liberty` | Source archives and build metadata |
| Existing safe extraction | `D:\TL_Extracted` | Baseline data, raw tables, localization, and PNGs |
| Questlog snapshots | `D:\TL_Helper\out\questlog-public` | Current public comparison surface |
| Normalized Questlog data | `D:\TL_Helper\web\data\app-data.json` | Items, skills, runes, masteries, and assets used by the app |
| Current extraction indexes | `D:\TL_Extracted\indexes` | Table manifests, identifier lists, and texture manifest |

The AES key and any other local extraction configuration must be loaded from a local ignored configuration file or `D:\TL_Extracted\source-manifest.json`. Secrets and archive keys must not be copied into committed documentation or source files.

## Initial evidence cases

The first radar build must reproduce and classify these cases:

### Ramux

- Officially announced July Archboss.
- Present locally through NPC naming, achievements, gear, Codex references, memorial records, and event localization.
- Absent from the current Questlog-derived app dataset.
- Expected classification: `officially_announced`, with strong local preloading evidence.

### Vegamor

- Official roadmap announces an unnamed August Colossus.
- Local data names Vegamor and contains encounter dialogue, mechanics, memorial references, story references, and related gear.
- Absent from the current Questlog-derived app dataset.
- Expected classification: `datamined_very_high_confidence`, with an explicit note that linking Vegamor to the official August Colossus is an inference.

### WP_CL

- Local data contains 15 named abilities, 17 descriptions, and 22 images.
- The abilities reference both Claw and current Gauntlet systems.
- Expected classification: `legacy_or_prototype` unless stronger build-history evidence shows active development.

These cases are acceptance tests, not hardcoded answers. The system must arrive at its classification from evidence rules.

## Core principles

- Never launch the game as part of collection.
- Never attach to or inspect a running game process.
- Never interact with Easy Anti-Cheat.
- Never modify, repack, or overwrite game archives.
- Read only configured paths and asset types.
- Preserve every conclusion's evidence and source path.
- Keep official facts separate from inference.
- Label uncertainty clearly.
- Treat `Test`, `Copy`, `Prototype`, and `Not in Use` as negative evidence, not automatic deletion.
- Store raw snapshots outside Git.
- Keep generated databases and extracted assets outside Git.

## Proposed storage layout

```text
D:\TL_Intelligence\
  config\
  manifests\
    <steam-build>\
  snapshots\
    <steam-build>\
  content-store\
  database\
    upcoming-content.sqlite
  reports\
    <steam-build>\
  logs\
```

Source code and documentation remain in `D:\TL_Helper`. Large or generated outputs live in `D:\TL_Intelligence`.

## Recommended build order

1. Implement the collector and create a repeatable baseline manifest.
2. Implement the custom table-decoder proof of concept.
3. Normalize build snapshots into SQLite.
4. Implement patch and Questlog comparison.
5. Implement candidate clustering and confidence scoring.
6. Add official-announcement correlation.
7. Add the read-only MCP server.
8. Add a human review interface only after the evidence pipeline is reliable.

## Plans in this folder

- [01-tl-collector.md](01-tl-collector.md)
- [02-tl-radar.md](02-tl-radar.md)
- [03-upcoming-content-database.md](03-upcoming-content-database.md)
- [04-llm-mcp-server.md](04-llm-mcp-server.md)
- [05-implementation-roadmap.md](05-implementation-roadmap.md)
- [CLAUDE-HANDOFF.md](CLAUDE-HANDOFF.md)

