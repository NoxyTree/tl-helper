# Claude Implementation Handoff

Copy the prompt below into Claude Code for the first implementation phase.

```text
Work in D:\TL_Helper.

Read these planning files completely before making changes:

- plans/upcoming-content-radar/README.md
- plans/upcoming-content-radar/01-tl-collector.md
- plans/upcoming-content-radar/02-tl-radar.md
- plans/upcoming-content-radar/03-upcoming-content-database.md
- plans/upcoming-content-radar/04-llm-mcp-server.md
- plans/upcoming-content-radar/05-implementation-roadmap.md

Also read:

- README.md
- extraction-report.md
- scripts/build-web-data.mjs
- D:\TL_Extracted\README.md
- D:\TL_Extracted\source-manifest.json
- D:\TL_Extracted\indexes\summary.json
- D:\TL_Extracted\indexes\game_tables.csv

Important workspace state:

- Existing uncommitted changes belong to the user.
- Do not overwrite, revert, stage, or commit unrelated changes.
- Do not modify the current web app during this phase.
- Do not publish or push anything.

Safety boundary:

- Do not launch Throne and Liberty.
- Do not attach to or inspect game processes.
- Do not interact with Easy Anti-Cheat.
- Do not modify, mount for write, repack, or overwrite game archives.
- Use the installed archives read-only.
- Never put the AES key into committed source or documentation.
- Do not export movies, audio, animations, meshes, or models.

Objective:

Implement Milestone 1 from plans/upcoming-content-radar/05-implementation-roadmap.md: a safe C# command-line collector proof of concept using CUE4Parse.

The proof of concept must:

1. Create the project under src/TlCollector.
2. Read configuration from a local ignored file.
3. Validate that output is outside the game installation.
4. Scan the configured archive directory read-only.
5. Enumerate packages under TL/Content/Game/Client/Table.
6. Export one selected raw table package.
7. Export readable properties for one selected table where supported.
8. Decode and export one approved Texture2D as PNG.
9. Provide --dry-run and --json output.
10. Record tool version, game version, Steam build, selected package paths, output paths, hashes, timings, and errors in a manifest.
11. Add automated safety and path-containment tests.
12. Verify the source game files are unchanged.

Use D:\TL_Intelligence\dev as the development output root. Do not write generated output into Git.

In parallel with implementation, investigate the TLJsonDataTable payload using TLSkill.uasset, TLRuneInfo.uasset, and TLCraftingRecipe.uasset from D:\TL_Extracted. Write the findings to:

plans/upcoming-content-radar/decoder-investigation.md

Do not claim the custom rows are decoded unless row IDs and counts can be independently verified.

Run the tests and proof-of-concept commands. Finish with:

- Files changed
- Commands run
- Verification results
- Exact blockers
- Recommended Milestone 2 work

Stop after Milestone 1. Do not begin the database, radar, MCP server, or web interface yet.
```

## Follow-up Claude assignments

After Milestone 1 passes, use separate sessions for:

1. Full collector and incremental manifests.
2. Custom table decoder.
3. SQLite schema and imports.
4. Radar clustering and scoring.
5. MCP server and LLM integration.

Keeping these assignments separate makes failures easier to diagnose and prevents speculative radar logic from being built on an unverified extraction layer.

