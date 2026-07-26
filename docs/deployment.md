# TL-Helper production deployment

The first production release is an anonymous, local-first Cloudflare Pages
application at `https://tlhelper.org`, hosted by the `noxy-tree/tl-helper`
Vercel project. Supabase authentication and account sync
are optional follow-up capabilities. They are not a prerequisite for creating,
editing, auto-saving, or storing multiple builds in TL Helper.

## Production layout

- `web/` is the static Vercel output directory.
- `api/questlog/character.js` is the same-origin Questlog adapter.
- `vercel.json` defines clean URLs, security headers, and cache policy.
- `tlhelper.org` and `www.tlhelper.org` are the production aliases.
- Cloudflare Pages remains an optional deployment mirror, not the public production origin.

The function accepts only public HTTPS `questlog.gg` character-builder URLs,
validates numeric build IDs, caps each upstream response at 8 MB, and never
uses cookies or privileged credentials.

## Changing engine sources? Regenerate the precache BEFORE pushing

`vercel.json` runs `scripts/verify-precache-fresh.mjs` as its build command, so
a precache that disagrees with the shipped engine **fails the deployment** —
including a git-integration deploy, which is the whole reason it sits there.
That is deliberate: a stale cache means a cached player and a live player get
different numbers for the same request.

The cost is that any edit to a module reachable from
`web/optimizer/tl-builder-worker.js` changes the engine fingerprint and breaks
deploys until the cache is regenerated:

```bash
node scripts/precompute-optimizer-results.mjs --force
```

~10 minutes for 14 entries; worth running on a spare machine. `npm test` fails
on a stale cache too, so the signal is local — heed it rather than pushing and
regenerating after, which is exactly how deploys broke across `5ac144e`
through `4c15a84`.

`scripts/verify-precache-determinism.mjs --all` is the deeper check (stored
entries vs live reruns) but takes hours; it is a gate step, not a deploy step.

## Release gate

Run from `D:\TL_Helper`:

```powershell
$env:TL_DATA_ROOT = 'D:\TL_Data'
node scripts\update-tl-helper.mjs --validate
node --test scripts\tests\*.test.mjs
node scripts\verify-build-snapshot.mjs
node scripts\verify-reference-build.mjs
node scripts\verify-edge-cases.mjs
node scripts\verify-questlog-parity.mjs
node scripts\verify-precache-fresh.mjs
node scripts\verify-precache-determinism.mjs
D:\TL_Data\cache\tools\dotnet-sdk\dotnet.exe test src\TlCollector\TlCollector.slnx -c Release --no-restore
git diff --check
git status --short
```

**`verify-questlog-parity.mjs` exits 1 today, and that is not a broken gate.**
Two fixtures (Juggernaut, Magic DPS) carry blocking issues nobody has explained
— we apply two mastery nodes Questlog does not, over-reporting Critical Damage
by 84%. See `mastery-achievement-parity-2026-07-25.md`. It is meant to block a
release until that is resolved or deliberately accepted; it used to print the
problem and exit 0, which is how it went unnoticed.

`verify-precache-determinism.mjs` reruns the optimizer against a stored cache
entry and asserts the result is byte-identical. It defaults to **one** entry
(~90s on a spare machine, longer on a loaded one) because that is enough to
catch the failure that matters: a cache produced by different code than the one
being shipped. `verify-precache-fresh.mjs` compares fingerprints; this compares
*answers*, which is not the same claim.

Run the full sweep before a major release or after any optimizer change:

```bash
node scripts/verify-precache-determinism.mjs --all --json
```

14 entries, ~23 minutes measured on a spare 12-core box, `--json` for a
machine-readable verdict. It runs single-threaded on purpose while the
generator runs 4-way parallel, so a pass means the same request produced the
same bytes under different execution modes — not merely that a replay replays.

Then verify in a browser:

1. Open the Armory and choose **New build**.
2. Set the character name, role, and server.
3. Select at least one item and change an attribute.
4. Open **My builds**, choose **Save current build**, and reload.
5. Confirm the saved build and current working build survive the reload.
6. Open Tracker, Achievements, and Combat Lab and check for console errors.
7. Test one valid and one rejected Questlog URL against the hosted endpoint.

## First deployment

The optimized game icon mirror is part of the Git release artifact. Vercel
deploys the complete repository using `vercel.json`. The release must contain every
icon checked by `scripts/tests/deployment-contract.test.mjs`.

This requires access to the `noxy-tree/tl-helper` Vercel project:

```powershell
npm ci
npx vercel login
npx vercel link --project tl-helper --scope noxy-tree
npm run deploy:production
```

After deployment, verify that both custom domains point to the returned ready
deployment. If Vercel does not move them automatically, assign `tlhelper.org`
and `www.tlhelper.org` to that deployment with `vercel alias set`. Confirm the
deployed `/api/questlog/character` route and the visible build before considering
the release complete.

The Cloudflare mirror can be refreshed separately with
`npm run deploy:production:cloudflare`; it does not update `tlhelper.org`.
The mirror runs in guest-only mode (no account sign-in) unless
`TL_SUPABASE_URL` and `TL_SUPABASE_ANON_KEY` are set in the Cloudflare Pages
dashboard — the Vercel environment variables do not carry over.

Recommended: add a Vercel WAF rate-limit rule for `/api/questlog/character`;
the code-level same-origin gate (`Sec-Fetch-Site`) blocks browser-mediated
cross-site abuse but is not a rate limit.

## Supabase follow-up

Do not add a service-role key to Pages. When account sync is implemented, only
the project URL and public anon key belong in browser-visible configuration.
Row Level Security remains the authorization boundary. See
`docs/supabase-setup.md`.

## Rollback

Use the Cloudflare Pages deployment list to promote the last known-good
deployment. Build data in browser storage is versioned independently, so a
static rollback must not delete or rewrite user local storage.
