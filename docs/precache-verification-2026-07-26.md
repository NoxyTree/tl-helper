# Precache end-to-end verification — 2026-07-26

Evidence that the optimizer precache is actually reached by the shipping UI.
This existed as an assumption for the cache's entire life and was false the
whole time.

## Method

Every cell driven through the real wizard on `build-from-scratch.html` —
weapon pickers, role chip, preset chip, Continue, Forge — on a **fresh page
load** each time. `window.Worker` was wrapped to count constructions and
`window.fetch` to record precache requests.

A hit is `workers === 0` **and** the cell's entry file fetched. Checking only
for a rendered result would not distinguish a hit from a live run, and
`loadPrecachedResult` never throws — it returns null and the page silently
falls through, which is exactly how a 0%-hit-rate cache passed every earlier
check.

## Result — 14/14 hit

| preset | weapons | worker | entry fetched |
|---|---|:--:|---|
| pve-dps | dagger + greatsword | 0 | yes |
| pve-dps | crossbow + dagger | 0 | yes |
| pve-dps | staff + dagger | 0 | yes |
| pvp-heavy-dps | greatsword + dagger | 0 | yes |
| pvp-heavy-dps | crossbow + dagger | 0 | yes |
| pvp-heavy-dps | staff + dagger | 0 | yes |
| pvp-evasion-dps | sword&shield + dagger | 0 | yes |
| pvp-evasion-dps | sword&shield + wand | 0 | yes |
| pvp-crit-dps | dagger + sword&shield | 0 | yes |
| pvp-crit-dps | staff + dagger | 0 | yes |
| pve-tank | sword&shield + wand | 0 | yes |
| pve-tank | sword&shield + dagger | 0 | yes |
| pvp-endurance-oracle | wand + orb | 0 | yes |
| pvp-endurance-oracle | wand + sword&shield | 0 | yes |

Four roles, four presets, seven weapon families, both slots. Each resolves in
about a second against **39.3s** measured for the same journey before the fix.

Supporting: all 14 index keys matched keys derived independently from the
matrix before regeneration (0 missing, 0 unexpected, 14 distinct); suite
927/927; `verify-precache-fresh.mjs` reports fresh.

## A false failure worth recording

Mid-run, `pve-dps / crossbow + dagger` reported a live run. It hit on a fresh
page. The cause was the test driver reusing the page via *Edit build goals*,
which left the previous cell's priorities in state — so the request really was
different and really should have missed. Harness fault, not product. Every
result above uses a reload per cell.

It does surface real behaviour, and the behaviour is correct: **a player who
edits their goals away from a preset leaves the cache and pays the live run.**
A different request is not the cached request. Real-world hit rate therefore
depends on how many players forge straight from a preset rather than tuning
first, and nothing here measures that.

## Still unproven

- **Localhost only.** Not the deployed clean-URL config; index and entry
  fetches could resolve differently there.
- **Determinism is asserted, not tested.** No gate compares a stored entry
  against a live rerun of the same request. `optimizer-precache.test.mjs`
  checks freshness and stored-build legality, which is not the same claim.
- **Coverage is 14 curated cells.** Every other weapon pair, any hand-edited
  priority list, and the whole "Improve my build" flow run live —
  `canonicalPrecacheRequest` rejects anything that is not a bare scratch
  request, so `full-build-optimizer.html` is out of scope by design.
