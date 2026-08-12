# Release review — TL Helper, 2026-08-12

Full pre-release review of `codex/sites-deploy` at `b7ab8e0`. Audits the shipped
`web/` surface, the deploy configuration, the public API endpoints, and every
gate in `docs/production-gates.md` — re-running each one rather than reading its
last recorded result.

One gate was failing and is fixed (§2). One gate is still failing and is an
owner decision, not a code fix (§3). Everything else in the standing bundle
passes.

**Landed since this review was written** — `fe80ca3`, `0b19805`, `8ace2da`,
`ba8f440`: the precache regeneration (§2), the portrait persistence fix (§4.1),
the horizontal-overflow fixes (§4.2, plus a pre-existing 83px desktop case the
review had not caught), and rate limiting on all four proxy variants (§4.3).
`npm test` is **935/935** at `ba8f440`. §3 and the §4.4–4.6 cleanups are open.

---

## 1. Gate results (all re-run today)

| Gate | Command | Result |
| --- | --- | --- |
| JS suite | `node --test scripts/tests/*.test.mjs` | **929/929**, 0 skipped |
| BuildSnapshot | `verify-build-snapshot.mjs` | pass |
| Reference builds | `verify-reference-build.mjs` | pass, 69/69 across 3 fixtures |
| Edge cases | `verify-edge-cases.mjs` | pass, 12/12 |
| Precache freshness | `verify-precache-fresh.mjs` | pass *(after §2)* |
| Precache determinism | `verify-precache-determinism.mjs` | pass — live rerun byte-identical to stored |
| Collector | `dotnet test TlCollector.slnx -c Release` | 92/92 |
| Whitespace | `git diff --check` | clean |
| **Questlog parity** | `verify-questlog-parity.mjs` | **exit 1 — see §3** |

`update-tl-helper.mjs --validate` needs `--build 24118850` on a machine without
the game installed; without it the build resolves to `0` and every input path
reports missing. Worth adding to `docs/deployment.md`, since the runbook prints
the command without the flag.

That validate run also reports `decoded-data-baseline` mismatched: `D:\TL_Data`
now holds **57 decoded tables against the 55 in the reviewed baseline**
(`data-build-baselines/24118850.json`, reviewed 2026-07-14). The guard is doing
its job — a receipt-producing rebuild is blocked until those two tables get an
evidence review. The shipped `web/data` still matches its committed receipt, so
this blocks a *data refresh*, not this release.

---

## 2. Fixed: the precache was stale and would have failed the deploy

`vercel.json` runs `verify-precache-fresh.mjs` as its build command, so HEAD
could not deploy. Four commits after the last regeneration touched engine
modules reachable from `tl-builder-worker.js`:

- `2c40c6f` — `web/optimizer/tl-optimizer-precache.js`
- `983b7df`, `3465ef1`, `34955cd` — `web/optimizer/tl-full-build-adapter.js`

Regenerated with `node scripts/precompute-optimizer-results.mjs` (~10 min, 14
entries at 38–51 s each). **The result is a fingerprint-only change:** all 14
entry files are byte-identical to their committed versions once the
`engineFingerprint` string is normalised out; `index.json` differs only in
`engineFingerprint` and `generatedAt`. The pin/Heroic work changed no optimizer
output.

The regenerated cache is **uncommitted in the working tree** — 15 files, 16
insertions, 16 deletions. It needs to be committed before the release SHA.

Verified in a real browser afterwards (`build-from-scratch.html`, live server):
a raw scratch request matching a cached cell canonicalises to the stored key,
`loadPrecachedResult` returns the entry in **4 ms**, and the returned score
equals the stored score. That is the precache half of G8 step 2.

---

## 3. Still blocking: Questlog parity (owner decision)

`verify-questlog-parity.mjs` exits 1, exactly as `docs/deployment.md` intends.
Overall **819/825 = 99.3%** across 10 archetypes; 8 fixtures are fully clean.
Two carry unexplained blockers:

- Magic DPS (staff/dagger), 76/77 — Staff Uncommon mastery
- Juggernaut (gauntlet/greatsword), 83/88 — Greatsword Common and Rare mastery

All three are the same message: an under-activated Achievement tier stores one
effect where the validator requires two. Hit tank and healer carry the identical
warning and still reach full parity, which is why those two are classified
expected.

Per `mastery-achievement-parity-2026-07-25.md` the remaining hard case is the
Juggernaut **Critical Damage over-report of 84%** (ours 34.2 vs Questlog 18.6).
"Ours higher" is not explained by the missing-effect theory, and G3 forbids
classifying an unexplained over-report as expected.

This is the one open item that contradicts the site's premise. It needs evidence
about the game rule, or an explicit written decision to ship with it — the
optimizer footers already disclose "six stats on imported mastery builds are
known to disagree — Critical Damage can read up to 84% high", so the disclosure
route is half-taken already.

---

## 4. New findings (not in the existing checklist)

### 4.1 The character portrait silently discards what the player drops — Armory and Tracker

`web/image-slot.js` is a design-tool scaffold. Its persistence goes through
`window.omelette.writeFile`, which only exists inside that tool's host. In a
browser:

- `window.omelette` is `undefined`, so `data-editable` is false and the
  "browse files" affordance is hidden — but the drop handlers stay bound and the
  empty state still reads "Drop your character screenshot" with `cursor:pointer`.
- Dropping an image **works** — it renders.
- Reloading **loses it**. Nothing reaches `localStorage`; confirmed by drop →
  reload → empty state returns.

Every other surface in the app auto-saves, so this reads as data loss. It also
makes `privacy.html` inaccurate: it states "character images are stored in your
browser on your device."

Supabase already has the intended home for this — a private `user-images` bucket
and a `user_media` table with `purpose in ('avatar','build-reference')` — and
the client uses neither. Options: wire the slot to `localStorage`/IndexedDB for
guests (and `user_media` when signed in), or remove the slot and its prompt.

Related: it fetches `.image-slots.state.json` on every Armory and Tracker load,
which 404s in production.

### 4.2 Mobile horizontal overflow on the two most-used pages

Measured at 375 px:

| Page | Overflow |
| --- | --- |
| Armory | **175 px** |
| Tracker | 29 px |
| Gear Viewer, Achievements, Build Optimizer, Build from Scratch | 0 |

Root cause at [web/index.html:412](../web/index.html) — the combat-stat panel uses
`grid-template-columns: 1fr 1fr`. `1fr` carries an implicit `min-width: auto`, so
long stat-name buttons ("Main Weapon Bonus Attack Power") force 225 px + 272 px
tracks inside a 317 px parent, and the whole document scrolls sideways.

Fix is `minmax(0, 1fr)` plus a single-column collapse under 620 px. The shared
shell is fine — `.tl-app-nav` already scrolls itself at ≤1000 px. There are 16
instances of `1fr 1fr` across index / tracker / gear-viewer / full-build-optimizer
/ build-from-scratch worth auditing together.

### 4.3 The Questlog proxy has no rate limiting

`api/questlog/character.js` and `api/questlog/market.js` (and their `functions/`
twins) are unauthenticated and unthrottled. SSRF handling is genuinely solid —
host allowlist, HTTPS-only, canonical URL rebuilt from the parsed slug, fixed
tRPC procedures, 12 s timeout, 8 MB cap, no raw error text echoed. What is
missing is volume control:

- The `Sec-Fetch-Site: cross-site` gate passes anything without the header, which
  the code documents as deliberate — so curl bypasses it.
- The in-memory cache (100 entries / 5 min, per lambda instance) only helps
  repeats; distinct slugs miss every time.

On a public launch that is unbounded proxying to questlog.gg from our egress IPs
plus unbounded function invocations. A per-IP token bucket, or at minimum a
global concurrency cap, before the site is announced.

### 4.4 Dead code in the shipped bundle

- `web/optimizer/tl-builder-result-view.js` and
  `web/optimizer/tl-builder-item-hover.js` are imported by **no page** — 20 KB
  shipped, and both have passing test files, so the suite reports confidence in
  code no player can reach. This also means launch-checklist A3's "ships an
  **All Stats** tab" is not true of anything the player sees.
- `web/vendor/babel/babel.min.js` is 3.1 MB and never loads. `ensureBabel()` only
  fires for a `jsx` `x-import`, and the only `x-import` on any page is
  `./image-slot.js` — confirmed by network trace. It uploads on every deploy.

### 4.5 Every internal link takes a redirect

`vercel.json` sets `cleanUrls: true` and canonicals/sitemap use `/tracker`, but
in-app navigation is written as `./tracker.html`. Each click 308s. Rewriting the
nav hrefs extensionless removes a round-trip per navigation and makes the landed
URL match the canonical.

### 4.6 Console noise

Two errors fire on Armory / Build-from-scratch loads:

```
<circle> attribute r: Expected length, "{{ ring.r }}".
<polyline> attribute points: Expected number, "{{ seg.points }}".
```

Source is `MasteryWheel.dc.html:37-38` — the browser's HTML parser sees the raw
template attributes before dc-runtime hydrates. **The wheel itself renders
correctly** (verified: 4 rings with numeric `r`, 48 polylines). Cosmetic, but
G8 step 2 asks for no console errors on the listed pages, so it currently fails
that line. Moving the placeholders to `data-*` attributes the runtime reads would
clear it.

---

## 5. Confirmed healthy

Re-verified rather than assumed:

- **No secrets tracked.** Only `.env.example` is in git; `.env.local` holds a
  Vercel OIDC token and is ignored. `.vercelignore` correctly anchors repo-root
  entries (the `supabase/` lesson held).
- **RLS is correct.** Every table has `auth.uid() = user_id` for all operations;
  the `user-images` bucket is private with folder-scoped storage policies.
- **No analytics or telemetry ships** — consistent with the privacy notice.
- **No XSS path found.** Build labels and Questlog-derived names go through
  `new Option()` or `.textContent`; raw-HTML render paths use `escapeHtml`/`esc`,
  including the TTK lane labels built from imported character names.
- **Accessibility basics** on all 7 public pages: skip link, `lang="en"`,
  viewport meta, no `<img>` without `alt`.
- **SEO** is complete and correct: per-page title, description, canonical, OG and
  Twitter cards; Combat Lab carries `noindex` and stays out of the nav and
  sitemap; `robots.txt` disallows the `.dc.html` templates and `/api/`.
- **Header parity** between `vercel.json` and `_headers`, with HSTS deliberately
  left to the Vercel platform and asserted as such in the contract test.
- **Item Potentials exclusion is disclosed** on all 7 pages.
- **Graceful degradation:** `/api/config` failing leaves an empty account slot
  and guest-only mode with no error — verified against a server with no such
  endpoint.
- **The loading bar exists** on both optimizer pages, bound to the adapter's
  `onProgress` ([build-from-scratch.html:728](../web/build-from-scratch.html)).
  Launch-checklist B2 ("Nothing built") is out of date.

Still genuinely open from the existing checklist: **G10 class names** — the
45-pair mapping is not in the repo; "Crusader" appears only as a set name in
`equipment.json`.

---

## 6. What is left

Done: precache (§2, `fe80ca3`), portrait (§4.1, `0b19805`), overflow (§4.2,
`8ace2da`), rate limiting (§4.3, `ba8f440`).

Remaining, in order:

1. **Decide Questlog parity** (§3) — fix, or write down the acceptance and raise
   the ratchets. This is the only open item that touches "our numbers are the
   player's real numbers", and the only one blocking a gate.
2. Cleanup: dead modules, Babel, the redirect hop, console noise (§4.4–4.6).
   None of these block a launch.
3. G10 class names, still absent.

Notes on what landed, for anyone re-reading the sections above:

- §4.1 The localStorage fallback makes `privacy.html`'s "character images are
  stored in your browser on your device" true as written, so no copy change was
  needed. The `.image-slots.state.json` 404 stays: the sidecar fetch has to run
  unconditionally for shared pages that do serve one, and a placebo empty file
  would be excluded by Cloudflare's dotfile handling anyway.
- §4.2 grew one finding. The Armory also overflowed by **83px at a 1280px
  laptop**, which the mobile sweep missed and which measured identically at
  `b7ab8e0` — pre-existing, not caused by the mobile fix. Both are fixed.
- §4.3 is per-instance and best-effort by construction; the code comments state
  that rather than implying a deployment-wide guarantee. If the launch draws
  real traffic, a shared store (KV/Redis) is the upgrade path.

## 7. Launch-day checks that cannot be verified from the repo

- `TL_SUPABASE_URL` and `TL_SUPABASE_ANON_KEY` are set in the Vercel production
  environment. If they are not, `/api/config` returns `configured: false`, the
  account menu silently disappears, and the sign-in section of `privacy.html`
  describes a feature that is not there.
- Game build `24118850` still matches the live patch (G9a).
- `README.md` is stale: it claims 140,591 records across 48 tables; the receipted
  warehouse and `STATUS.md` both say 159,448 across 55.
