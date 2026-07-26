# Launch checklist — TL Helper

Status as of 2026-07-25. One line per item, each with the thing that *proves*
it done, so nothing gets called finished on a vibe.

The site's premise is "our numbers are the player's real numbers." Anything
that breaks that premise is a launch blocker. Anything that only makes the site
slower or less pretty is not.

---

## A. Blockers — the numbers are wrong or missing

### A1. ~~Set effects never activate~~ — WRONG, CLOSED 2026-07-26

**This blocker did not exist.** It came from reading one entry of a four-entry
set list on one bench build and generalising. Five independent sources say the
optimizer activates sets normally: the committed precache entries (Black Scales
2/2, Ancestral Armor 2/4/6pc), a real Crusader's Greedseeker 6/6, a smoke test,
and both legs of the `stress-floors` set lane at 17/17 builds with an active
set.

The underlying code defect is real but inert. `tl-full-build-adapter.js:1870`
selects the progression pool with plain `diverseFinalists`, so set-route
representatives reach the final sort unrefined and cannot win it. Measured on
the lane built to expose it — 24 cases, same machine, back to back:

| | baseline | with fix |
|---|---:|---:|
| runtime | 19.4 min | **122.2 min** (6.29x) |
| built / infeasible | 17 / 7 | 17 / 7 |
| cases with an active set | 17 | 17 |
| total active bonuses | 64 | 64 |

Identical outcomes at 6.29x the cost. The fix is reverted. Record the defect as
a latent inefficiency; do not pay 6x for it.

### A1-original (kept for the record) — set effects never activate
Optimizer output activates **zero** set bonuses. The Crusader carries 1 of 5
pieces of the Demonic Beast Hunter Set; its 2-piece breakpoint is `active:
false`. Set routes are discarded at two points in the beam search, so builds
that would complete a set never survive to be scored.

- Fix is written and reverted. Fable reviewed it: **SHIP**, with a proof that
  `diverseFinalistsWithSetRoutes` is strictly additive, so false infeasibility
  cannot be reintroduced.
- Blocked on runtime: measured **3.5×** (64s → 222s).
- Its gate criterion must change: the no-floor invariant hashes are **invalid**
  for this change, because it intentionally alters no-floor results. Use
  per-case score monotonicity instead.
- **Done when:** re-applied, a build completes a set, and score is
  non-decreasing case-by-case across the 144-case sweep.

### A2. Six parity stats — we OVER-APPLY two mastery nodes

**Updated 2026-07-26, and the direction counts below were wrong.** Measured: four
"ours lower" and two "ours HIGHER", not five and one. Three of the four distinct
deltas trace to exactly two nodes, to the unit: `Double Impact` (+1560 Critical
Damage, +120 Critical Damage Resistance) and `Steel Sacrifice` (−1000 Melee
Heavy Attack Chance). We apply both; Questlog applies neither.

`Steel Sacrifice` is `Sword2h_Normal_Def_Skill` — the single stored synergy in
the under-activated tier the validator warns about. Questlog appears to treat an
under-activated tier as granting nothing. Full detail and the source breakdowns
are in `mastery-achievement-parity-2026-07-25.md`.

**We over-report Critical Damage by 84%.** This is the one substantive
calculation blocker left. It needs evidence about the game rule, not a code
change — nothing decoded settles whether an under-activated tier grants its
effect.

### A2-original (kept for the record) — Achievement-effect parity
Juggernaut (5 misses) and Magic DPS (1 miss) sit at 83/88 and 76/77. The misses
are in exactly the stat families an Achievement effect grants, and **ours are
lower** — the signature of a missing second effect:

| Build | Stat | Questlog | Ours |
|---|---|---:|---:|
| Magic DPS | Critical Damage Resistance | 42 | 36 |
| Juggernaut | Melee Heavy Attack Chance (×3 contexts) | 1,567.8 | 1,467.8 |
| Juggernaut | Critical Damage | 18.6 | **34.2** |

The Juggernaut Critical Damage is 15.6 too *high*, which neither the
"under-activation" theory nor the "missing effect" theory explains. Both
fixtures remain **unexpected** blockers in the parity report.

Hit tank and healer carry the same warning but reach 73/73 and 83/83, which
proves Questlog rendered the same under-activation there — those two are
classified as expected. See `mastery-achievement-parity-2026-07-25.md`.

- **Done when:** those 6 stats are explained, then either fixed or marked with
  a recorded `expectationSource`.

### A3. Undeclared stats are unvalued, and the output does not flag it
Not a display gap — `tl-builder-result-view.js:82` ships an **All Stats** tab
rendering every calculated stat grouped by category, and a **Sets & Runes** tab
showing `equippedPieces/memberPieces` per set. The numbers are all there.

The gap is upstream and downstream of that:

- **Upstream:** an undeclared stat carries zero weight, so the optimizer will
  freely tank it to buy a declared one. A Crusader optimized on six declared
  stats produced 8.69% Block Chance against a real player's 57.3%.
- **Downstream:** that 8.69% *is* rendered — as one row among a few hundred,
  with nothing marking it as collapsed. Finding it requires already knowing it
  mattered.

Armour is the clearest case: strongest defensive stat per point (~7–16%
effective HP per 1,000 versus ~2% for Endurance), and nothing values it unless
the player thinks to name it.

- See `optimizer-undeclared-stat-guard-2026-07-25.md`.
- **SHIPPED BROKEN-BUT-DISCLOSED 2026-07-26.** Both optimizer footers now state
  that unlisted stats are not protected and may be traded away sharply. Static
  copy, not a generated warning, because `build-from-scratch.html` renders no
  `result.warnings` at all — a warn-only guard there would change nothing a
  player sees.
- **Still open, post-launch:** distinguishing a collapsed stat from a healthy
  one in the ledger. That is the real fix; the disclosure only stops the
  product implying a guarantee it does not provide.

---

## B. Ship quality — correct but not yet good enough

### B1. Optimizer speed: 15–20s target
Currently ~36–68s on Main-PC depending on floors. `031d91a` landed the cheap
wins (totalsOnly in both hot evaluators, ~8,000 clones removed) on correctness
grounds — identical output, strictly less work — not on a demonstrated speed
win. Remaining candidates: attribute-lane memoisation, lane pruning. The
attribute DP is **blocked**: its separability premise is incomplete (HP
material % and weapon min/max are applied at finalisation).

- **Done when:** median fully-qualified custom build ≤20s on Main-PC, measured
  by `stress-realistic` rather than a single case.

### B2. Loading bar
Explicitly wanted: at 15–20s the wait needs to feel intentional. Nothing built.

### B3. Class names
The 45-entry class → weapon-pair mapping was supplied and is a verified
bijection (10 weapons, each in exactly 9 pairs). **It is not in the repo** —
"Crusader" appears nowhere in `web/data` or `web/*.js`. Weapon icons *are* in
(commit `06ff6b7`).

- **Done when:** the optimizer and build sheet name the class rather than
  listing two weapons.

---

## C. Release hygiene

### C1. Precache is stale — currently failing a test
`optimizer-precache.test.mjs` fails: engine sources changed under `031d91a` and
the cache was not regenerated. Regen is ~7 minutes for 14 entries.

Blocked on a decision, not on time: `precompute-optimizer-results.mjs` has an
uncommitted change that strips `tuningFrontier` — the difference between ~29MB
and ~540MB of git blobs at full coverage. Regenerating before it lands bakes in
14 large entries. **Land that change, then regen.**

Cost of the change: a cache *hit* serves no tuning sliders. Live runs are
unaffected.

### C2. Full gate on `031d91a`
Running now, sharded Spruce + Birch. Parity ✅, reference builds ✅, invariant
hashes ✅ (byte-identical), `npm test` ❌ on C1 only. 144-case floor sweep and
the timing lane still in flight.

### C3. Clean like-for-like timing
The 1.12× figure for `031d91a` is contaminated — the comparison ran 8 goals
against 7. Birch's `stress-realistic` lane replaces it against a clean 92.9s
per-case median.

---

## D. Decided — do not reopen

- **Combat Lab** unlisted by owner decision (2026-07-23). Page stays deployed
  with `noindex`. Do not re-link.
- **Rune synergy warning** is a false alarm; settled 2026-07-24. The table holds
  all 78 legal rows.
- **Heavy-first goal ordering** beats crit-first by 8.3% and beat an elasticity
  re-rank by 12.5%. Both measured through `modelExpectedPvpDamage`. Stop
  re-deriving it from stat elasticity — elasticity assumes ceteris paribus,
  the optimizer reallocates.

---

## Known-unresolved constants

These are honest gaps, not bugs. They widen error bars; they do not block
launch, but nothing should claim precision they do not support.

- **Defense constant `k`** in `modelDefenseMultiplier` — `pvp-models.mjs:80`.
  Makes every armour benefit a band (6.6–13.9% per 1,000) rather than a number.
- **Boss endurance** is not modelled, which puts crit deep into saturation in
  PvE comparisons.
- **Glancing denominator** current-build confirmation — `pvp-models.mjs:44`.
