# Automated market data backend

## Goal

Provide TL Helper with normalized, fully automated Auction House prices without
coupling the application to one upstream response format. The backend owns its
public contract, validation, cache behavior, provenance, and eventually its
historical store.

## Phase 1: live normalized prices

Status: implemented locally.

- Use TLDB's unsupported internal JSON feed through a dedicated adapter.
- Whitelist Europe (`20005`), Japan/Oceania (`50005`), and Americas (`60005`).
- Expose regional snapshots and numeric single-item lookups at
  `/api/market/prices`.
- Include active listing tiers only for single-item responses.
- Cap upstream responses, validate the schema, cache for 30 seconds, and serve
  a successful snapshot for up to 15 minutes during an upstream failure.
- Preserve source, region, observation time, serving time, ETag, and stale state
  in every successful response.

## Phase 2: catalogue join

- Decode TLDB's auction catalogue into a build-scoped ID map.
- Join numeric Auction House IDs to TL Helper item IDs, extracts, lithographs,
  and traits.
- Record unmatched and ambiguous IDs as explicit coverage findings.
- Regenerate the map on a new game build and refresh it daily between patches.

## Phase 3: owned history

- Persist immutable normalized observations in a durable store.
- Make writes idempotent by region, item, and observation timestamp.
- Derive hourly and daily aggregates without rewriting raw observations.
- Add retention, source-health, schema-drift, and stale-region monitoring.
- Use upstream history only for optional backfill, never as the sole history.

## Phase 4: validation and failover

- Add Questlog and TL Tracker comparison adapters that do not affect the public
  response unless explicitly enabled.
- Compare a rotating item sample and report price, stock, and freshness drift.
- Fail over only to an approved source with compatible reuse terms.
- Keep serving the last verified snapshot with an explicit stale marker when
  no upstream is healthy.

## Phase 5: frontend integration

- Add region selection and Lucent price display to item surfaces.
- Load regional snapshots once and index them in the browser.
- Show observation age and stale state without exposing upstream-specific
  response shapes.
- Add price history and alerts after the durable history API is available.

## External gate

TLDB's bundled internal documentation permits personal-project API use while
its general terms restrict scripted access and reproduction. Confirm polling,
caching, public display, attribution, and acceptable request frequency in
writing before enabling the adapter in a public production deployment.
