# Stress-test finding: from-scratch attribute allocation diverges from meta builds

Date: 2026-07-24. Surfaced by `.bench/stress-realistic.mjs` on the high-end run.
Separate from the floor-satisfaction work (that is done and verified).

## The finding

Across 36 realistic 5-10 preference requests, **21 of 27 successful builds put
~88% of the 59 attribute points into a single attribute** (e.g. `str:52 dex:7`,
`int:55 per:4`, `dex:56`).

Real questlog meta builds (the 10 parity fixtures) do the OPPOSITE — they spread
across 3-4 attributes, **no single attribute above 34%**:

```
  Melee DPS (sword/greatsword)  dex:18 int:4 per:19 str:18   max 32%
  Ranged DPS (crossbow/dagger)  dex:18 int:18 per:7 str:16   max 31%
  Healer (orb/wand)             con:18 int:11 per:20 str:10  max 34%
  ... every fixture 31-34% max
```

## Why (mechanism)

`ATTRIBUTE_BREAKPOINTS` (web/tl-questlog-rules.js:76) give big jumps at 50 pts,
e.g. STR-50 -> `all_double_attack +1000`, DEX-50 -> `move_speed +500`. With a
59-point budget the optimizer dumps ~52 into one attribute to CLAIM one
breakpoint. Real players stay at 18-20 per attribute — deliberately BELOW the
first (30-pt) breakpoint — taking balanced per-point (TLBaseMainStat) value
across 3-4 attributes instead.

So it is a modeling disagreement: **we chase one large breakpoint; meta players
spread for per-point value.** That skilled players consistently spread is
evidence our objective overvalues the single breakpoint (or undervalues the
spread), i.e. the attribute stage is miscalibrated for realistic multi-goal
requests.

## DECISIVE diagnostic (run 2026-07-24) — it is the objective, not the search

`.bench/probe-attr-quality.mjs` scored the optimizer's dump vs a meta-style spread
under OUR OWN objective, same build/goals:

```
  dump   str:40 dex:19 (0 0 0)        score 0.74771   <- optimizer's choice
  spread str:18 dex:18 per:19 int:4   score 0.73634
  => DUMP scores 1.5% HIGHER. The search is correct; it maximises the objective.
```

So this is NOT a broken search and NOT strictly an objective "bug": the optimizer
correctly maximises the DECLARED goals, and a dump does maximise a narrow 5-goal
objective. The divergence from meta play is because **real players implicitly
value their WHOLE stat sheet** (every attribute feeds hp/accuracy/defense across
the board), while the tool optimises only the 5-10 stats the user named.

It is therefore a PRODUCT DESIGN question, not a defect:
- If a user literally wants to maximise those 5 stats, the dump IS optimal.
- But a from-scratch build that looks degenerate vs meta erodes trust.

Options (owner's call):
1. Leave as-is — the tool honestly maximises declared goals; document that
   from-scratch builds are goal-maximal, not well-rounded.
2. Add a mild well-roundedness / full-profile term (or a small per-attribute
   diminishing-returns curve) so ties break toward spreads, matching meta feel.
   The margin is only ~1.5%, so a small term would flip most cases.
3. Value the full stat panel (not just declared goals) at low weight in the
   attribute stage.
Any change here re-scores presets -> re-run full parity + precache.

## Caveats / what is NOT yet proven

- The stress goal-sets are the first N of a family pool, not curated like real
  builds. Some dumps may be genuinely optimal for THOSE narrow objectives.
- Not yet confirmed whether a meta-style spread SCORES HIGHER than the dump under
  our own objective. That is the decisive test:
    - spread scores higher -> the attribute SEARCH is leaving value on the table.
    - dump scores higher -> the OBJECTIVE (breakpoint vs per-point weighting, or
      RANK_DECAY) is miscalibrated.
  Run it before choosing a fix.
- `docs/optimizer-rank-decay-calibration-2026-07-17.md` set RANK_DECAY=0.35
  specifically to avoid degenerate single-stat dumps and reported it produced
  "realistic attribute spreads" for its test case. This stress result CONTRADICTS
  that for broader goal-sets — so the calibration did not generalise.

## Relationship to shipped correctness

This does NOT affect parity: reproducing a GIVEN build's stats is 819/825. It
affects GENERATED from-scratch builds — a knowledgeable user would see the
attribute spread as wrong. Worth fixing before promoting the from-scratch
optimizer, but it is a build-QUALITY workstream, not a correctness regression,
and it is independent of the (completed, verified) floor fix.

## Suggested next step

1. Decisive diagnostic: for one degenerate case, score the optimizer's dump vs a
   meta-style spread under the same objective. Settles search-vs-objective.
2. If objective: revisit breakpoint weighting / RANK_DECAY / the per-point vs
   breakpoint value in the attribute optimizer. Re-run the full parity + precache
   after ANY change (attribute scoring feeds preset results).
3. Re-run `.bench/stress-realistic.mjs` (greatsword id now fixed to sword2h) and
   check the degenerate count drops and builds resemble the 31-34% meta spread.
