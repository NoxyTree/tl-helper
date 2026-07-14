# Data build receipts

This directory contains one reviewed provenance receipt per game build after a
successful orchestrated warehouse and inventory rebuild.

Receipt files are named `<game-build>.json` and must conform to
`../schemas/data-build-receipt.schema.json`. Do not create a receipt by copying
counts from an older warehouse or inventory. Use the update orchestrator or
`scripts/generate-data-build-receipt.mjs` with a successful run report.

When a rebuild begins, the previous build receipt is moved under
`superseded/<build>/`. Files there remain provenance history but are not current
release markers. A current receipt is authoritative only while its source run
report is `passed` and its recorded hashes match the live outputs.

The producing run must start from a clean committed worktree. Each receipt pins
the Git commit and Node.js version, plus exact hashes of critical generators,
dependencies, and schemas. Before writing, every new Git dirty path must belong
to a declared generated-data location.

No receipt exists for build `24118850` yet because the canonical rebuild has not
been run after receipt support was introduced.
