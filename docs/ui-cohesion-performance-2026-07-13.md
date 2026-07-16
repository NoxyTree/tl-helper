# UI cohesion and data-loading implementation snapshot

## Snapshot

- Base commit: `4bf444bc0a99d92b35d5b15508bbf9b40a00e54c`
- Snapshot branch: `codex/snapshot-ui-20260713-4bf444b`
- Implementation branch: `codex/ui-cohesion-performance`
- Worktree: `D:\TL_Helper-ui-performance`
- The main checkout's uncommitted market work was not modified.
- The endurance worktree's uncommitted evasion-exclusivity work was not modified.

## Implemented

### Projection caching

- The manifest remains a `cache: "no-store"` request.
- Projection requests now use normal browser caching.
- Each projection URL receives its manifest SHA-256 as the `v` query parameter, preventing a fresh manifest from resolving to an older cached stable-name projection.
- Hashless legacy manifests retain their original stable URLs.
- Combat Lab's generated ability and reference data now follow the production data cache policy.

### Projection size

- The equipment wire format is now schema version 2.
- Repeated `itemPotential` tables are interned as three pool entries and referenced by 193 items.
- `tl-core.initCore` restores independent `item.itemPotential` objects, preserving the version 1 runtime API and legacy expanded input support.
- Equipment projection raw size changed from 10,791,799 bytes to 6,114,096 bytes, a reduction of 4,677,703 bytes or 43.34%.
- Approximate gzip-9 size changed from about 1.306 MB to 464 KB.
- The complete five-projection payload changed from about 1.638 MB gzip to 796 KB gzip.

### Navigation and naming

- All eight public pages use identical primary-navigation destinations.
- Build from Scratch remains a Build Optimizer sub-location and links its active section back to the optimizer entry page with `aria-current="location"`.
- Document and social-sharing titles now align with primary-navigation product names.
- All direct local CSS and script tags use the same `20260713` release token, with regression coverage preventing one-off versions.

### Shared shell and runtime

- The shared shell now owns the header positioning rule previously duplicated by Build from Scratch.
- The more capable generated design-component runtime is now the single `support.js` runtime.
- `tl-builder-support.js` was removed, eliminating a near-duplicate 65,990-byte deployed file.

## Verification

- Repository tests: 359 of 359 passed.
- Reference builds: 69 of 69 asserted totals matched.
- Edge cases: all passed.
- Static local link, script, stylesheet, module, and CSS URL scan: zero missing references.
- Browser smoke: Armory, Gear Viewer, Full-build Optimizer, and Build from Scratch loaded with zero console warnings or errors.
- Mobile smoke at 390px: no body-level horizontal overflow on Gear Viewer or Build from Scratch. Gear Viewer's wide table remains intentionally contained in its own horizontal scroller.

## Deliberately not included

- Market-data work remains in the main checkout and still has its external-use approval gate.
- Evasion-set exclusivity remains in its existing separate session.
- `itemStats` curve interning or a light browse projection remains a later optimization. Caching and potential interning remove the immediate repeated-transfer cost first.
- Page-specific responsive breakpoints remain unchanged because live mobile checks did not expose body overflow or unusable layout behavior.
- The small page-local `$` and `esc` helpers remain duplicated. A new shared module request would not materially improve page performance for two one-line helpers.
