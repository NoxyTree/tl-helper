# Optimizer floor-satisfaction + stress-testing — handoff

Date: 2026-07-24 (late session). Branch: `codex/sites-deploy`.
Written before a Main-PC shutdown so work resumes cleanly on any machine.

## TL;DR of the whole effort

1. **Calculation parity with questlog: DONE and pushed.** 819/825 stats across ten
   builds covering all ten weapons; 8 of 10 builds exact. Commit `8efe4bc`.
2. **Optimizer false-infeasibility (floors): PARTIALLY fixed and pushed.** Commit
   `ec197b0` fixes the common case; a broader stress sweep proved it does NOT
   generalize. This is the current open work.
3. **In flight when this doc was written:** a second Codex fix attempt was
   STOPPED (it was running against a harness that had a confirmed false-positive
   vector). The working tree was restored to the clean pushed state.

## Git state

- Pushed: `origin/codex/sites-deploy` at `ec197b0`.
  - `f848075` — parity refresh, imports, harness
  - `8efe4bc` — parity 99.3%, Star Journey decode, match questlog
  - `ec197b0` — optimizer floor steering (partial fix)
- Working tree at handoff: `web/optimizer/tl-full-build-adapter.js` was RESTORED
  to `ec197b0` (Codex's incomplete second-attempt edits reverted). The saved
  partial diff is at `.bench/codex-floors2-partial.patch` (84 lines) if any of it
  proves useful — but it was chasing a flawed gate, treat with suspicion.
- Everything under `.bench/` is gitignored scratch. `design-handoff/` is the
  user's untracked WIP — leave it.

## The current open issue: floors are a post-filter, not steered

Setting multiple "at least" floors can still yield a false "No build satisfies
the protected or minimum stat constraints" on a request that is provably
satisfiable. Root cause (confirmed): floors are enforced as a POST-FILTER at the
attribute / rune / progression stages; the search maximises score and only
checks floors at the end, so it cannot retrace to a satisfying build it already
built. `ec197b0` deferred one stage's rejection and added Lagrangian steering,
which fixed sword/dagger 3-goal but NOT other weapons / higher floor counts.

### Confirmed REAL failure (not a harness artifact)
- bow/dagger, 3 goals `[range_accuracy, all_critical_attack, hp_max]`: witness
  reaches Ranged Hit Chance 42,414; constrained run fails at 42,264 — short 150
  raw (0.35%). No `damage_reduction` involved, so this is a genuine
  search-completeness bug. Reproduce with `.bench/probe-false-infeasibility.mjs`
  (sword/dagger) or the bow/dagger snippet in session history.

## CRITICAL: harness soundness finding (fixed in harness; ALSO a product bug)

An independent audit found my stress harness had a FALSE-POSITIVE vector on the
goal id **`damage_reduction`**:

- `STAT_EXPANSIONS.damage_reduction = ["boss_damage_reduction"]` — a **length-1,
  one-way** expansion (`web/tl-questlog-rules.js:43`).
- So the goal is SCORED and REPORTED as `boss_damage_reduction`
  (`goalScoringValue`, `goalValue` in `tl-full-build-adapter.js`), but the floor
  is ENFORCED against raw `damage_reduction` (`satisfiesProtectedStats`,
  `minimumViolation`, and the infeasibility throw). `withCompositeTotals` only
  synthesizes `stats[id]` for `components.length > 1`, so raw `damage_reduction`
  stays below the reported boss value.
- Consequence in the harness: a `damage_reduction` floor set to the reported
  (boss) value is genuinely unsatisfiable, so "no build satisfies" is CORRECT
  there — but the harness hard-failed it as a bug. Those failures were phantoms.

**This is ALSO a genuine product bug**, not just a harness issue: a real user who
sets "Damage Reduction" as an at-least goal would type the displayed (boss) value
and the optimizer would fail to satisfy it against raw. Worth fixing properly:
make a length-1 non-context-split composite either score on its own id or write
its synthesized total into `withCompositeTotals` so report and constraint agree.
Audit confirmed only `damage_reduction` is affected among common goals
(`bonus_attack_power_main_hand/_off_hand` are also length-1 but already denied).

Harness fix applied: `damage_reduction` swapped out of `.bench/stress-floors.mjs`
(→ `all_double_defense`) and `.bench/stress-realistic.mjs` (→ `all_double_defense`,
TANK pool → `hp_regen`). Both re-audited: 0 unsafe stats remain.

## The harnesses (all in .bench/, gitignored)

- `probe-false-infeasibility.mjs` — the original witness gate (sword/dagger,
  70/85/95/99/100% of witness). The 100% row is the acceptance bar.
- `probe-no-floor-invariant.mjs` — SAFETY INVARIANT. Three floor-free scratch
  requests, hashed. With no floors the search must be byte-identical. Expected
  hashes at `ec197b0`:
  - sword/dagger    `b81c6251ee3a97c7da337a420b503e2f5d905eea4724ec698a6bfe7bacbac6f4`
  - staff/dagger    `e2021bdd8c5405f0410b17c3e15b581445f581dde79b8153a041500a9903e962`
  - crossbow/dagger `332a619760161e788354b4341961da1d2766b6f7e0f5e22f8b4fd3c361ab3577`
- `stress-floors.mjs` — broad witness sweep: 8 weapon pairs × floor-count {1,3,5}
  × tightness {100%,98%} × {plain, +locked slot, +set requirement} = 144 cases.
  Verifies the RETURNED build actually meets each floor, not just no-error.
  `--partition=N/M` to parallelise. Every `plain t=100%` case must satisfy.
  NOW CORRECTED (damage_reduction removed).
- `stress-realistic.mjs` — realistic-usage test the user asked for: 12 weapon
  pairs × {5,7,10} preferences, weapon-family-appropriate, 2 of each as
  "keep at least" floors at 65% of a probe. Measures WALL TIME, score, floors-met,
  and flags degenerate attribute dumps (>85% in one attribute). `--depth`,
  `--partition`, `--json`. NOW CORRECTED.

## Timing / cross-machine plan (user has 3 machines)

User machines: **Birch (low-end), Spruce (mid), Main-PC (high-end)**. Timing must
be measured on a QUIET machine — a smoke run during Codex contention showed ~115s
per request, roughly 2× inflated. Plan: run `stress-realistic.mjs --json` on each
machine and compare. The worker pool caps at min(4, physcores). Worth capturing
median / p90 / max per machine so the site can set expectations (e.g. "≈Xs on a
typical PC"). The optimizer runs off the main thread via a worker (`optimize`
resolves as a promise), so UI never blocks — but a low-end machine's wall time is
the real UX number.

## What to do next (recommended order)

1. Decide `damage_reduction` product fix (make report == constraint). Small,
   self-contained, and removes a real user-facing floor bug.
2. Re-run corrected `stress-floors.mjs` (all 4 partitions) to get the TRUE set of
   real false-infeasibility failures (bow/dagger confirmed; expect others at n=5).
3. Re-brief Codex (`gpt-5.6-sol`, high) to COMPLETE the floor fix, with:
   - the corrected sweep as the acceptance gate (every `plain t=100%` satisfies),
   - the hard safety invariant (byte-identical no-floors; hashes above),
   - never accept a build that misses a floor,
   - keep-small-logs (a prior run produced a 927 MB transcript).
4. After the fix: re-run all four sweep partitions + `probe-no-floor-invariant`
   (`"after"` must match the hashes) + `verify-questlog-parity` (819/825) +
   `verify-reference-build` (69/69) + `npm test` + regenerate precache LAST
   (`node scripts/precompute-optimizer-results.mjs --force`, ~15 min).
5. Run `stress-realistic.mjs --json` on Birch / Spruce / Main-PC for timing.

## Standing gates (must stay green)

    node scripts/verify-questlog-parity.mjs     # 819/825, 10 fixtures, ratchets
    node scripts/verify-reference-build.mjs     # 69/69
    npm test                                    # ~914 (varies with added tests)
    node .bench/probe-false-infeasibility.mjs   # 100% row OK
    node .bench/probe-no-floor-invariant.mjs    # hashes unchanged

## Hard-won rules (do not relearn these)

- Never invent/hard-code a game constant to close a gap. Refresh data instead.
- Never accept a build that misses a floor — that is a regression dressed as a fix.
- With no floors declared, the search MUST be byte-identical. Prove it via
  `probe-no-floor-invariant.mjs`, not via the precache (every precache preset
  declares floors, so it cannot test the no-floor path).
- Verify agent claims independently. `ec197b0` looked done and wasn't; a fix to
  one witness case did not generalise.
- Parity means we match QUESTLOG, not necessarily the GAME. Traces of Spacetime
  (`StarJourney`) is deliberately excluded to match questlog — see
  `docs/questlog-parity-status-2026-07-24.md`.
- Codex CLI: run from PowerShell for `codex update` (Git Bash tar breaks it).
  Model `gpt-5.6-sol` needs CLI ≥ 0.145. Keep agent logs small.
