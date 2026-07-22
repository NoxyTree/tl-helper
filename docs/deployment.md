# TL-Helper public beta deployment

The first production release is an anonymous, local-first Cloudflare Pages
application at `https://tlhelper.org`. Supabase authentication and account sync
are optional follow-up capabilities. They are not a prerequisite for creating,
editing, auto-saving, or storing multiple builds in TL Helper.

## Production layout

- `web/` is the static Pages output directory.
- `functions/api/questlog/character.js` is the same-origin Questlog adapter.
- `functions/api/market/prices.js` is the read-only normalized market-price adapter.
- `web/_headers` defines security and cache headers.
- `web/_redirects` serves the Armory at `/`.
- `wrangler.toml` records the Pages output and canonical origin.

The function accepts only public HTTPS `questlog.gg` character-builder URLs,
validates numeric build IDs, caps each upstream response at 8 MB, and never
uses cookies or privileged credentials.

The market adapter reads TLDB's unauthenticated internal market feed through a
shared source module. It whitelists the current Europe, Japan/Oceania, and
Americas region IDs, caps upstream responses at 2 MB, caches successful
snapshots for 30 seconds, and can serve a cached snapshot for up to 15 minutes
when the upstream is temporarily unavailable. It does not send credentials.

Backend examples:

```text
GET /api/market/prices?region=eu
GET /api/market/prices?region=jp
GET /api/market/prices?region=na&itemId=10012015
```

Regional responses omit listing tiers to keep snapshots compact. Supplying a
numeric `itemId` returns that item's active price tiers and expiry timestamps
when supplied by the upstream. Every response includes source, snapshot generation time, region, and
stale-state metadata. TLDB internal API use is unsupported; public deployment
requires confirming the intended reuse and attribution terms with TLDB.

## Release gate

Run from `D:\TL_Helper`:

```powershell
$env:TL_DATA_ROOT = 'D:\TL_Data'
node scripts\update-tl-helper.mjs --validate
node --test scripts\tests\*.test.mjs
node scripts\verify-build-snapshot.mjs
node scripts\verify-reference-build.mjs
node scripts\verify-edge-cases.mjs
D:\TL_Data\cache\tools\dotnet-sdk\dotnet.exe test src\TlCollector\TlCollector.slnx -c Release --no-restore
git diff --check
git status --short
```

Then verify in a browser:

1. Open the Armory and choose **New build**.
2. Set the character name, role, and server.
3. Select at least one item and change an attribute.
4. Open **My builds**, choose **Save current build**, and reload.
5. Confirm the saved build and current working build survive the reload.
6. Open Tracker and Achievements and check for console errors.
7. Test one valid and one rejected Questlog URL against the hosted endpoint.

## First deployment

The optimized game icon mirror is part of the Git release artifact. Cloudflare
Pages may deploy from the repository's production branch or through Wrangler
Direct Upload from a verified release machine. Both paths must contain every
icon checked by `scripts/tests/deployment-contract.test.mjs`.

This requires a Cloudflare account authenticated on the release machine:

```powershell
npm ci
npx wrangler login
npx wrangler pages project create tl-helper --production-branch main
npx wrangler pages deploy web --project-name tl-helper
```

Wrangler Direct Upload from the repository root compiles the root `functions/`
directory and uploads the complete local `web/` artifact. Git-connected Pages
builds also include the tracked icon mirror and Functions directory. Dashboard
drag-and-drop does not deploy Pages Functions and must not be used. Confirm the
deployed `/api/questlog/character` route before attaching the production
domain.

In the Pages dashboard, attach `tlhelper.org` as the custom domain. Do not
change DNS until the preview URL passes the browser release gate.

## Supabase follow-up

Do not add a service-role key to Pages. When account sync is implemented, only
the project URL and public anon key belong in browser-visible configuration.
Row Level Security remains the authorization boundary. See
`docs/supabase-setup.md`.

## Rollback

Use the Cloudflare Pages deployment list to promote the last known-good
deployment. Build data in browser storage is versioned independently, so a
static rollback must not delete or rewrite user local storage.
