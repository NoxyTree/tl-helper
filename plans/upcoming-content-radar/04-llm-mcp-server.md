# LLM and MCP Server Creation Plan

## Objective

Expose the intelligence database through a small, read-only interface that lets an LLM retrieve exact game records, compare builds, inspect upcoming-content evidence, and answer with source-backed uncertainty labels.

The LLM must never receive unrestricted filesystem access through this service.

## Proposed implementation

- Service location: `D:\TL_Helper\services\tl-intel-mcp`.
- Runtime: TypeScript and Node.js, unless repository constraints make a C# MCP server simpler.
- Database: read-only connection to `D:\TL_Intelligence\database\upcoming-content.sqlite`.
- Transport: stdio MCP first.
- Optional transport: local loopback HTTP for the web app.
- Configuration: local ignored JSON or environment variables.

## MCP tools

### search_game_data

Searches entities, aliases, localization, and descriptions.

Inputs:

- Query
- Entity types
- Build
- Language
- Limit

### get_entity

Returns one canonical entity with:

- Current structured record
- Historical versions
- Relationships
- Assets
- Localization
- Source evidence

### search_upcoming_content

Filters candidates by:

- Classification
- Confidence threshold
- Content type
- Official status
- Questlog status
- First-seen build
- Review status

### get_content_evidence

Returns every positive and negative signal used for a candidate's classification.

### compare_game_builds

Returns new, changed, and removed entities, assets, localization, and table records between two builds.

### find_new_localization

Searches localization added or changed in a selected build.

### find_new_assets

Searches assets added or changed in a selected build.

### find_unpublished_entities

Returns local entities absent from Questlog and optionally absent from official mentions.

### compare_with_questlog

Explains exact matches, unresolved matches, and current Questlog gaps for an entity or domain.

### get_official_mentions

Returns official announcement evidence without treating inferred links as official facts.

### explain_classification

Returns a human-readable explanation of confidence score, signals, penalties, and unresolved questions.

## Response contract

Every result should include:

```json
{
  "data": {},
  "build": "24118850",
  "classification": "datamined_very_high_confidence",
  "confidence": 96,
  "officialFact": false,
  "inference": true,
  "sources": [],
  "warnings": []
}
```

## LLM answer policy

The server should provide system guidance stating:

- Use `officialFact: true` only for explicitly sourced official claims.
- Describe local-file conclusions as datamined evidence or inference.
- Never convert a confidence score into certainty.
- Mention when content may be test, legacy, regional, or cut.
- Cite local evidence paths and official URLs.
- State the source build number.
- Avoid giving an exact release date unless an official source provides one.
- Prefer structured values over attempting to infer stats from prose.

## Query safety

- Open SQLite in read-only mode.
- Use parameterized SQL only.
- Do not expose arbitrary SQL execution as an MCP tool.
- Apply row and response-size limits.
- Restrict file reads to evidence paths already stored in the database.
- Reject paths outside configured evidence roots.
- Do not expose the AES key or collector configuration.
- Redact local machine paths from any future public-facing HTTP responses if required.

## Performance

- Use prepared statements.
- Cache stable lookup tables.
- Paginate large evidence sets.
- Return summaries first and evidence detail on request.
- Cap FTS search results.
- Avoid returning raw multi-megabyte JSON payloads to the LLM.

## Optional local HTTP API

The same service may expose loopback-only endpoints:

```text
GET /api/search
GET /api/entities/:id
GET /api/candidates
GET /api/candidates/:id/evidence
GET /api/builds/:from/compare/:to
```

This API should use the same repository layer and response contracts as MCP.

## Verification

- MCP client can list and call every tool.
- Service cannot modify the database.
- Invalid paths are rejected.
- Arbitrary SQL is impossible.
- Ramux returns official and local evidence separately.
- Vegamor returns the roadmap link as official evidence and the name match as inference.
- WP_CL returns prototype or legacy warnings.
- Build comparison returns deterministic results.
- Tool responses stay below configured size limits.
- Every candidate response contains evidence and uncertainty metadata.

## Deliverables

- MCP server
- Optional local HTTP adapter
- Tool schemas
- Read-only repository layer
- LLM guidance and response policy
- Fixture database and integration tests
- Claude Desktop or Claude Code configuration example
- Codex configuration example if supported locally

