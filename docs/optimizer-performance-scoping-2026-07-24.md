# Optimizer performance scoping — targets: 10s build, 20s at 7+ goals

Date: 2026-07-24. Branch: `codex/sites-deploy`. Baseline commit: `b9d79bd`.
Owner targets: **10 seconds to final build; 20 seconds on builds with 7+ options.**
Sequencing per owner: correctness/quality first, then performance.

## Baseline (Main-PC, Ryzen 7600X, `.bench/stress-realistic.mjs`)

Wall time for ONE from-scratch optimization (the harness also runs an unmeasured
probe pass to size floors; the numbers below are the measured run only):

```
  n=5    median 31.9s   min 24.5s   max 36.8s   (9 rows)
  n=7    median 36.0s   min 25.7s   max 46.2s   (9 rows)
  n=10   median 36.9s   min 30.8s   max 47.8s   (9 rows)
  ALL    median 34.0s                            (27 rows)
```

Low-end reference (Birch): the same work runs ~85-100s, roughly 2.5x slower.

### The key shape: cost is nearly flat in goal count

n=5 -> n=10 costs only +16% (31.9s -> 36.9s). Runtime is dominated by FIXED
pipeline structure (seed enumeration, lane count, coordinate ascent, item
search), not by how many goals the user declared.

**Consequence for the targets:** the 20s allowance for 7+ goals buys almost no
extra headroom, because 7+ builds are only ~15% slower than 5-goal builds. The
binding constraint is the 10s floor applied to everything.

```
  n=5   31.9s -> 10s   = 3.2x needed
  n=7   36.0s -> 20s   = 1.8x median, 2.3x worst-case
  n=10  36.9s -> 20s   = 1.8x median, 2.4x worst-case
```

So the real program is: **~3.4x on the median, and the 7+ target falls out for
free once that lands.**

## Where the time goes — MEASURED

`bench-profile.mjs` (scratchpad worktree at `b9d79bd`) wraps `core` in a proxy
whose `calculateBuild` is instrumented, and attributes every call to the nearest
optimizer frame. Run IN-PROCESS with no worker pool so attribution is complete,
sword/dagger n=7. Call counts are exact and hardware-independent; wall shares are
indicative (this run had no pool parallelism and shared the box with another job).

```
wall 356.4s   calculateBuild calls 102,001   self-time in calculateBuild 224.9s (63%)

  bucket                                     calls    selfMs   %wall   ms/call
  evaluate [totalsOnly]   (progression)     63,332   112,274   31.5%     1.77
  evaluate [FULL]         (attributes)      28,769    67,351   18.9%     2.34
  evaluateFixed [FULL]    (rune refine)      9,306    41,641   11.7%     4.47
  everything else                              594     3,678    1.0%
```

**102,001 full stat-sheet evaluations for one build.** Three findings that
changed the plan:

1. **Progression is the single largest cost centre** — 62% of all calls. Not
   attributes, which is where I had expected the weight to sit.
2. **`totalsOnly` is a modest win, not a large one.** Measured 1.77ms vs 2.34ms
   per call — ~24% off the attribute stage, not the "roughly halves" the
   progression-stage comment reports. Worth doing, but it is not a tier-1 lever.
   **The problem is the call COUNT, not the cost per call.**
3. **37% of wall time is outside `calculateBuild` entirely** — the deep clones,
   scoring, bookkeeping and GC around these loops. `clone(build)` per candidate
   appears in the innermost loop of the progression allocator, the rune
   refinement, and nowhere is it necessary.

**The combinatorial search is not the problem.** `tl-full-build-optimizer.js`
already does the right thing: the beam search over slots works on additive stat
VECTORS (`addStats`, `objectiveVector`, `dominates`) with Pareto pruning and
set-route reachability. It rarely touches `calculateBuild`.

## The biggest lever: the progression allocator is a plain greedy

`tl-progression-optimizer.js:168` and `:197` — each iteration of the point-
spending loop re-evaluates EVERY eligible candidate from scratch:

```js
  while (pointState < target) {
    const baseScore = score(evaluate(build));           // 1 eval
    const candidates = masteryRowsForWeapon(weapon)
      .flatMap((mastery) => {
        const candidate = clone(build);                 // full deep clone
        candidate.masteries[mastery.id] = { level: next };
        return [{ ..., score: score(evaluate(candidate)) - baseScore }];   // 1 eval EACH
      })
      .sort(...);
    build.masteries[candidates[0].mastery.id] = { level: candidates[0].next };  // spend 1 point
  }
```

~130 points x ~100 eligible rows x 2 weapons, plus `masteryRouteHints` doing its
own sweep. That is the 63,332.

Marginal gains here are approximately submodular (diminishing returns on mastery
points), which is exactly the precondition for **lazy greedy / CELF**: keep a
max-heap of candidate marginal gains, re-evaluate only the current top candidate,
and re-heap if its refreshed gain still leads. Typical reduction is 10-100x fewer
evaluations for an identical selection sequence.

**This was already scoped once.** `.bench/verify-lazy-greedy.mjs` and
`.bench/baseline-progression-optimizer.mjs` exist and describe exactly this
change — an equivalence gate comparing full resulting progression (masteries,
passives, unified masteries) plus objective score, and reporting the `evaluate()`
call count for each. The current allocator is NOT lazy, so either the change was
reverted or never landed. **The verification harness for the single biggest win
is already written.** Start there.

### `optimizeAttributeAllocation` (`tl-full-build-adapter.js:346`)

Per invocation it performs, via `evaluate()` (line 385), a
full `core.calculateBuild` for:

```
  seeds:   1 balanced
         + 5 single-attribute dumps
         + 5 balanced-preferred
         + up to 40 breakpoint seeds        (5 attrs x 8 thresholds)
         + up to 66 cross-attribute pairs   (12-entry pool, pairwise)
         ~= up to 117 evaluations

  lanes:   optimizeWith() runs 4 rounds x 20 neighbours = 80 evaluations
           x 4 lanes when floors are present
             (3 PROGRESSION_FLOOR_PENALTY_MULTIPLIERS + 1 feasibility)
         = 320 evaluations

  TOTAL   ~440 calculateBuild calls per attribute optimization
```

And `optimizeAttributeAllocation` is itself called repeatedly — once per round of
the rune-refinement loop (line 610) and from the beam search per candidate.

### `refineRuneConfiguration` (`tl-full-build-adapter.js:573`)

Same two problems, in a hotter loop. `evaluateFixed` (line 581) calls FULL
`calculateBuild` — no `totalsOnly` — and the trial loop does
`clone(workingBuild)` (a `structuredClone` of the ENTIRE build) for every single
rune candidate, plus a `JSON.stringify` per candidate for key comparison.

## The structural insight: attribute allocation is separable, so solve it

Verified in `web/tl-core.js:2858-2877`: an attribute's contribution to the stat
sheet is a pure function of THAT attribute's own level and nothing else —
`data.attributeStats[attributeId][level]` plus any
`ATTRIBUTE_BREAKPOINTS[attributeId][threshold]` it has crossed. There are **no
cross-attribute terms**.

So the attribute stage does not need a search over full build evaluations at all:

1. Precompute a per-attribute contribution table (5 attributes x ~60 levels) once
   per request, directly from `data.attributeStats` + `ATTRIBUTE_BREAKPOINTS`.
   This costs ZERO build evaluations.
2. Allocation is then a 5-dimensional bounded resource-allocation problem over
   additive stat vectors — solvable EXACTLY by dynamic programming in
   O(budget^2 x attributes) ~= 17k tiny vector ops. Microseconds.
3. The non-linearities (composite `min()` scoring, `STAT_HARD_CAPS`,
   `effectiveStatValue`) break pure linearity, so run the DP on the linear part
   to produce the top-K allocations, then truth-check K ~= 20-30 with real
   `calculateBuild`.

Net: ~440 full build evaluations -> ~25, and the result is MORE optimal than the
current 4-round coordinate ascent, which is greedy and can stall in a local
optimum. That local-optimum stalling is a plausible contributor to the
dump-vs-spread quality finding, so this change and the attribute-spread work
touch the same code and should be sequenced, not run in parallel.

## Tier 1 — behaviour-identical, already guarded

Both are pure-speed changes that must not alter any chosen build, which means the
EXISTING no-floor invariant hashes are a complete correctness gate for them:
`node .bench/probe-no-floor-invariant.mjs` must reproduce the three `ec197b0`
hashes byte-for-byte.

0. **Stop deep-cloning per rune trial** (`refineRuneConfiguration`, line ~595).
   `clone(workingBuild)` runs `structuredClone` on the entire build for every
   rune candidate — roughly 8,000 whole-build clones per request. Swap the one
   `runes` array in place, evaluate, restore. Also hoist the repeated
   `JSON.stringify` key comparison out of the inner loop.

1. **`totalsOnly: true` in BOTH hot evaluators** — the attribute `evaluate()`
   (line 386) and the rune `evaluateFixed()` (line 581).
   The attribute stage builds full presentation-and-diagnostics products on every
   one of ~440 evaluations and throws them away. The codebase already proves
   `totalsOnly` is exact for scoring — see the comment at line 772 and
   `scripts/tests/calculate-build-totals-only.test.mjs` — and reports it "roughly
   halves the mastery stage". Only the winning row needs a full calc, for
   `activeAttributeBreakpoints(core, best.calc)`; recompute that once per lane
   (4 full calcs instead of 440).

2. **Memoize `evaluate` by `allocationKey` within a call.**
   There is no cache today. All 4 lanes start from the same `seedRows` and walk
   heavily overlapping coordinate-ascent paths, re-evaluating identical
   allocations. A per-invocation `Map` keyed by the existing `allocationKey`
   (line 319) dedupes them.

Estimated combined: **1.5-2x**. Lands the median around 17-23s. That likely meets
the 20s bar for 7+ but does NOT reach 10s.

## Tier 2 — structural, needed to actually reach 10s

3. **Incremental attribute evaluation.** A +/-1 point coordinate-ascent swap
   currently triggers a complete `calculateBuild`. Attribute contributions are
   additive per-point curves plus discrete breakpoints, so a delta-apply path
   should be dramatically cheaper than a full rebuild. This is the single
   largest remaining lever and the one that makes 10s plausible.

4. **Lane early-exit.** With floors present, all 4 lanes always run even when
   they converge on the same allocation. Detect coincidence and stop early.

5. **Seed pruning.** The 66 cross-attribute pair seeds are bounded but generous;
   with the pair pool already relevance-ranked, a smaller pool likely costs
   nothing in quality. Needs a quality gate, so treat as tuning, not a given.

6. **Worker pool cap.** `recommendedOptimizerWorkerCount`
   (`tl-optimizer-worker-pool.js:30`) caps at 4 workers deliberately, to keep the
   coordinator and UI responsive. Observed CPU during a run averaged only ~1
   core, so most of the pipeline is serial in the coordinator — raising the cap
   helps little until the serial stages above are addressed. Do this last, if at
   all.

Estimated Tier 1 + Tier 2(3,4): **3-4x**, landing the median at roughly 9-11s.

## Revised plan, ranked by measured leverage

| # | change | calls before | calls after | note |
|---|--------|-------------:|------------:|------|
| 1 | Progression lazy-greedy (CELF) | 63,332 | ~6,000 | harness already exists |
| 2 | Attribute allocation by DP | 28,769 | ~1,600 | exact; separability verified |
| 3 | Kill `clone(build)` in all three inner loops | — | — | attacks the 37% outside calc |
| 4 | `totalsOnly` in attribute + rune evaluators | — | — | ~24% per call, cheap to do |
| 5 | Memoize attribute lanes, prune coincident lanes | — | — | compounding |

Calls: **102,001 -> ~17,000 (6x)**, plus a cheaper cost per call, plus the clone
and GC pressure removed from the 37% that never enters `calculateBuild`.

Against a 36.0s n=7 median that projects to **roughly 6s** — clearing the 10s
target with enough margin to absorb being wrong about part of it.

Ordering note: (1) and (2) are independent code and can proceed in parallel. (2)
collides with the in-flight attribute-spread quality work — sequence those.

## Target, as decided by the owner

**REVISED 2026-07-25: 15-20 seconds on Main-PC, not 10.** The owner's words:
"we can have the performance to 15/20 seconds, I think that's more reasonable
with a loading bar, we just need it to feel nice." A progress bar changes the
requirement from "fast" to "responsive and honest about waiting", which is a
materially easier target — roughly 2x from the ~40s median rather than 4x.

Superseded original (2026-07-24): 10 seconds on Main-PC (Ryzen 7600X), for a
fully qualified build that meets every declared floor. Not a degraded or
early-exit result — the same quality bar we ship today, just faster.

Low-end machines are explicitly NOT the bar. Birch-class hardware runs ~2.5x
slower and will land proportionally higher; that is accepted. Presets are
unaffected either way — they are precached (`web/data/optimizer-precache/`) and
serve instantly. All of this applies only to custom from-scratch requests.

## Sequencing

The attribute-spread quality change (Option 2 of
`docs/optimizer-attribute-quality-finding-2026-07-24.md`) is in flight and will
shift this baseline slightly. Re-measure with `.bench/stress-realistic.mjs` after
it lands, then start Tier 1.
