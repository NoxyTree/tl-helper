# Optimizer ranking calibration, totals-only evaluation, and floor retention — 2026-07-17

Follow-up to the 2026-07-16 meta audit, which validated the search machinery
but identified `RANK_DECAY = 0.05` as the next accuracy lever: near-
lexicographic rank weighting made every build all-in on the rank-1 stat
(degenerate attribute dumps, zero multiplier stats) where hand-made meta
builds balance a portfolio.

## 1. RANK_DECAY 0.05 → 0.35

Weights are geometric: rank r carries `RANK_DECAY^(r-1)`. The calibration
requirement was twofold:

- **Rank 1 keeps primacy.** All lower ranks combined carry
  `d / (1 - d)` of rank 1's weight — below 1 for any `d < 0.5`, so the rest
  of the list can never collectively outvote the player's first priority.
  At 0.35 the tail weight is 0.54.
- **Secondaries steer.** A complete secondary objective must outweigh a
  marginal rank-1 gain, or preset goals 2-5 remain decorative.

Method: `scripts/benchmark-rank-decay.mjs` swept d ∈ {0.05, 0.15, 0.25,
0.35, 0.5} over preset goal sets at full thorough depth (the engine is
deterministic; one run per cell). Boss DPS, sword/greatsword:

| d | rank-1 (Heavy Attack) | notable movement |
|------|----------------------|------------------|
| 0.05 | baseline | attribute dump str 44 / dex 7 / int 2 / per 3 / con 3 |
| 0.15 | ±0.0% | build byte-identical to 0.05 |
| 0.25 | −0.4% | +1.3% crit attack, +2.6% skill amp |
| 0.35 | −1.2% | +5.8% crit attack, **+29.4% crit damage**, +4.0% boss accuracy, attributes pivot to dex 34-led spread |
| 0.5 | −1.2% | build identical to 0.35 |

0.35 buys the multiplier stats and realistic attribute spreads the audit
found missing, for a ~1% rank-1 concession, and 0.5 adds nothing further
while giving up the tail-weight guarantee. Chosen: **0.35**.

Semantics tests updated accordingly
(`full-build-adapter.test.mjs`: "rank weighting lets secondaries steer but
never dethrone priority one"); the gear-aware progression fixture now gives
rank-1 a stat spread comparable to rank-2's so its ordering no longer flips
under any decay below 0.8.

## 2. Exact totals-only evaluation (mastery stage ≈ 2.2× faster)

Profiling the progression stage showed 15,468 `calculateBuild` calls per
finalist — 78.6% of stage wall time at 1.62 ms/call — where the greedy
mastery allocator consumes only `{stat id → total}` maps and ignores every
presentation product (per-stat source rows, set-effect trace, validation,
status, rune synergies).

`calculateBuild(build, attributes, { totalsOnly: true })` now runs the
identical stat math with all presentation products skipped. Equivalence is
pinned two ways:

- `scripts/tests/calculate-build-totals-only.test.mjs` — total-for-total
  equality against the full path across set-effect, progression, scenario,
  and no-set-effect builds.
- A full-trajectory gate (`.bench/verify-totals-only.mjs`): the entire
  progression optimization run twice, full vs totals-only evaluate —
  identical masteries, passives, unified masteries, stats, and score;
  23.6 s → 10.7 s per finalist (2.2×).

Only the progression evaluate loop opts in; every final/result calculation
still uses the full path. Wired in
`tl-full-build-adapter.js` (`optimizeProgressionFinalistTask`).

## 3. Goal-minimum retention in the beam (PvP Evasion preset fix)

The sweep surfaced a live bug: the PvP Evasion preset on sword/dagger died
with "No build satisfies the protected or minimum stat constraints" even
though both floors are individually reachable at 3-4× their values
(probed ceilings: 59,144 PvP melee accuracy vs floor 30,000; 44,144 Heavy
Attack vs floor 14,000).

Root cause: in scratch mode floors are enforced only after attribute
allocation, and the beam retained states purely by score/pareto. A state
that jointly covers both floors is usually non-extreme in every single
dimension, so the per-signature pareto width bound erased it before any
later stage could see it — leaving a frontier where no state could be
pushed over the floors.

Fix (`tl-full-build-optimizer.js`): `minimumTargets` — at every pruning
step, the states with the lowest joint normalized floor shortfall are
reserved into the beam (drawn from the full expansion, pre-pareto), and the
floor-nearest exact-evaluated results join the frontier handed to the
attribute stage. Reservation is purely additive: with no minimums declared
the search is byte-identical to before
(`full-build-optimizer.test.mjs`: "goal-minimum targets reserve
floor-capable states through beam pruning").

Acceptance (sword/dagger, thorough): the preset completes with both floors
met at either decay — 37,314 accuracy vs floor 30,000 and 15,374 Heavy
Attack vs floor 14,000 at d = 0.35. The decay calibration compounds here:
against the 0.05 baseline the 0.35 build is strictly better on five of six
goals *including rank 1* (+18.6% evasion, +23.2% HP, +17.3% damage
reduction, +5.1%/+1.3% floors, −9.8% crit defense), with the attribute dump
(dex 56) relaxing to a str 10 / dex 34 spread — near-lexicographic weights
had pinned the floor-constrained search into a strictly worse corner.

## 4. Precomputed result cache for preset scratch runs

The optimizer is deterministic, so results for the exact default preset
requests are precomputed offline and served statically:

- `scripts/precompute-optimizer-results.mjs` runs the real adapter at
  thorough depth over a curated preset × weapon-pair matrix into
  `web/data/optimizer-precache/`.
- `web/tl-optimizer-precache.js` canonicalizes a scratch request (null on
  anything the cache cannot represent: existing gear, locked slots,
  scenarios, non-default rules) and looks up by SHA-256 key.
- `build-from-scratch.html` consults the cache before spawning the worker;
  any miss or error falls back to the live run.
- Staleness is impossible to ship silently:
  `scripts/tests/optimizer-precache.test.mjs` fails the suite unless the
  committed index matches both the current game data build and a SHA-256
  fingerprint over the optimizer engine's transitive module closure
  (`scripts/lib/optimizer-engine-fingerprint.mjs`, walked from
  `tl-builder-worker.js`).

## Verification state

- Full suite green (see repo history for the exact count at merge).
- Deterministic sweep receipts under `.bench/` (untracked; regenerate with
  the scripts above).
