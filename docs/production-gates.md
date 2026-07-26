# Production gates — TL Helper

Date: 2026-07-25. Audited against HEAD `031d91a` on `codex/sites-deploy`.
This document audits `docs/launch-checklist.md`, replaces its "done when"
lines with mechanically checkable gates, sequences them, and lists what is
deliberately deferred.

Premise held constant throughout: **"our numbers are the player's real
numbers."** A gate is a launch gate only if failing it means a player sees a
wrong number or a silently unusable result. Everything else is ranked below.

Everything below marked *verified* was re-checked against the working tree
today, not taken from the checklist. Claims I could not verify cheaply (a
full optimizer run costs 40–70s on a machine the owner is using) are labelled.

---

## 1. Audit of `docs/launch-checklist.md`

### 1.1 A1's headline claim is false as stated — and that changes the gate

The checklist says "Optimizer output activates **zero** set bonuses."
*Verified false as a universal:* all 14 committed precache entries under
`web/data/optimizer-precache/` — generated 2026-07-25 08:32 at `4f12b6f` by
the real adapter at thorough depth — activate at least one set breakpoint,
including genuine equipment sets, not just artifact sets:

- `frontline-tank-sword-wand.json`: Black Scales of the Frost Lord Set 1 at
  2/2 pieces, breakpoint active, plus Ancestral Armor 6/6 (2/4/6 all active).
- Nine Lives, Blizzard Overture, Punisher's Wings, Azure Sky Apostle appear
  active across the other entries.

So set bonuses *do* activate when the best individual pieces happen to share
a set (and always for artifact sets, which are picked as sets). The real
defect is narrower and is confirmed in code:

- `web/optimizer/tl-full-build-adapter.js:1870` selects the progression pool
  with plain `diverseFinalists`, while the earlier rune-refinement and
  attribute stages (lines 1630, 1707) use `diverseFinalistsWithSetRoutes`.
  Set-route representatives are dropped exactly at the stage that adds the
  large mastery/passive score contribution.
- Lines 1930–1941 re-inject route representatives via
  `structuralFinalistCoverage`, but **unrefined** (seed progression, gear-stage
  score). After `exactOrder` sorts refined against unrefined candidates, a
  route representative essentially cannot win. Disadvantaged, not discarded —
  the checklist's cited line numbers (~1854, ~1936) point at the
  `searchMetrics`/`scenario` literal and the coverage re-add's rejection
  branch, not the actual selection.

Consequence for the gate: "a build completes a set" is too weak — 2-piece
incidental completions already pass it today. The gate must show a
*deliberately steered* completion: a multi-piece set whose bonus carries a
declared goal, activated at HEAD (see G2).

Evidence-age caveat, stated honestly: the precache proving activation predates
`cbe4333` (lazy-greedy) and `031d91a`. The no-floor invariant hashes being
byte-identical through HEAD covers only the three no-floor probe requests;
every precache preset declares floors. So nothing currently *proves* set
activation at HEAD on floored requests. G2 runs at HEAD precisely to close
that.

### 1.2 A2 is correctly a blocker, but its verifier has no teeth

*Verified:* `node scripts/verify-questlog-parity.mjs` **exits 0 today** with
the 6 misses and 3 unexpected blockers present. The script fails only on
ratchet regressions (`matched < baselineMatched`,
`scripts/verify-questlog-parity.mjs:127,154`). "Exit 0" is therefore not
evidence for A2, and any gate phrased as "parity passes" is currently
vacuous. The gate must assert on the `--json` report's
`unexpectedBlockingIssues` (G3).

Severity note the checklist undersells: Juggernaut Critical Damage 34.2 vs
Questlog 18.6 is **ours 84% high** on a damage stat. The five "ours lower"
misses fit the missing-second-Achievement-effect story; this one does not fit
any current theory. It is the single most premise-threatening number in the
checklist and must not be swept into an "expected" marker without a specific
explanation. An "expected" classification for an unexplained over-report
would itself breach the premise.

### 1.3 A3 is mis-framed twice: not a premise breaker, and not yet gateable

Adversarial reading of the checklist's own rule: an undeclared stat that
collapses produces a build whose numbers are all *correct*. The premise
("numbers are real") is intact; what breaks is the implied promise that a
returned build is fieldable. That is a trust problem, arguably worse — but by
the checklist's stated blocker definition, A3 does not qualify, and the
checklist should either say the premise is broader than stated or reclassify.

More importantly, A3 as written — "Design decision still open" — is not a
gate. A gate with an unresolved design inside it is a wish. The decision
(warn-only per `docs/optimizer-undeclared-stat-guard-2026-07-25.md`, vitals
list, threshold) is an **owner input**, and until it is made, A3 can only be
gated as a disclosure (G4 offers both forms).

Two factual corrections to the checklist/scoping doc:

- **`web/optimizer/tl-builder-result-view.js` is dead code.** *Verified:* no
  file under `web/` imports it — only its test does. The shipped scratch page
  renders `result.allStats` via its own inline view
  (`web/build-from-scratch.html:2407,3022,3073`). The substance of the claim
  (every stat is rendered, sets tab exists) survives, but the citation is
  exactly the ".bench-style" trap the project has already burned itself on
  twice: citing code players never load. Any A3 fix that edits
  `tl-builder-result-view.js` will change nothing on the site.
- **The scratch page does not render `result.warnings` at all.** *Verified:*
  only `web/full-build-optimizer.html:853` renders warnings;
  `build-from-scratch.html` has no result-warnings rendering (its only
  "warning" is the heroic trait drawer). The scoping doc's "the result view
  already renders warnings" is true for one of the two result surfaces. A
  warn-only guard must add rendering to the scratch page or it is invisible
  on the primary surface.

### 1.4 C1 is mis-severitied: a stale precache is a premise breaker, not hygiene

*Verified:* the runtime cache lookup checks **only the game build**
(`web/optimizer/tl-optimizer-precache.js:93`); the engine fingerprint is
enforced solely by `optimizer-precache.test.mjs`, which is failing right now
(cache `0cffb6e7…` vs current `93fa220d…`, re-confirmed today). If the site
deployed at HEAD, a player hitting a cached preset would get a build computed
by a two-commit-old engine while a player one click away from cache
eligibility gets the live engine — two different "real numbers" for the same
request shape. That is the premise, broken, in production. It belongs in
section A of the checklist, gated by "npm test fully green" (G6), with regen
sequenced dead last (section 3).

The deliberate decision to leave the test red also normalizes shipping with
a red suite, which quietly devalues every other test-shaped gate.

### 1.5 What the checklist does not list at all

1. **The launch evidence is irreproducible.** The 144-case floor sweep
   (`stress-floors.mjs`), the timing lane (`stress-realistic.mjs`), the
   no-floor invariant (`probe-no-floor-invariant.mjs`), and the witness probe
   (`probe-false-infeasibility.mjs`) all live in `.bench/`, which is
   **gitignored**. *Verified present locally, absent from git.* Every
   headline number in the checklist ("144/144", "36/36", the hashes) is
   backed by scripts that a clean clone does not contain and that nothing
   pins against silent edit. This is the highest-leverage gap in the whole
   document: promote the four harnesses into `scripts/` (G0) or every
   downstream gate is built on sand.
2. **The deployment gate of `docs/deployment.md` is missing.** The checklist
   is optimizer-only. The repo already defines a release gate
   (`update-tl-helper.mjs --validate`, `verify-build-snapshot`,
   `verify-edge-cases`, the TlCollector dotnet tests, a browser smoke, the
   Questlog endpoint check). None of it appears in the launch checklist (G8).
3. **Data currency has no gate.** `web/data/app-data.json` is game build
   `24118850` (*verified*). Nothing anywhere asserts that this matches the
   live game's patch on launch day. If the game patches the day before
   launch, every number is wrong and every in-repo gate stays green. This is
   the premise's biggest *external* exposure (G9 — honest label: partially
   manual).
4. **Parity means Questlog, not the game.** Traces of Spacetime is
   deliberately excluded to match Questlog, and the achievement
   under-activation investigation explicitly could not prove live-game
   legality. The site's premise as worded promises the *player's* numbers.
   The gap between "matches Questlog" and "matches the game" needs either a
   one-line disclosure on the site or a conscious owner acceptance recorded
   somewhere (G9b).
5. **Cross-version score comparison trap.** A1's proposed gate ("score
   non-decreasing case-by-case") compares `score` fields produced by two
   different engines. Scores are scale- and baseline-relative; a change that
   touches probing or scales makes raw score fields incomparable across
   versions. The monotonicity gate must re-evaluate *both* returned builds
   under a single scorer (G2 does this). The checklist inherits the trap it
   warns about.
6. **Nobody has gated the browser.** Every verifier runs in Node. The shipped
   path is a browser Web Worker. Determinism is asserted in a comment
   (`tl-optimizer-precache.js:3-5`), never demonstrated as a gate. One
   manual check closes this (G8, step 2).

### 1.6 Smaller corrections

- "'Crusader' appears nowhere in `web/data`" is false: it is the **Crusader
  gear set** (`web/data/projections/equipment.json` — Crusader Armor/Gloves/
  Greaves/Helmet/Sabatons). The substantive claim (no class→pair mapping in
  the repo) holds, but B3's implementation now has a naming collision to
  design around: "Crusader" the class vs "Crusader" the armor set in the same
  UI.
- Known-unresolved constants are even less exposed than stated:
  `pvp-models.mjs` is imported only by `web/combat-lab-model.js`
  (*verified*), and Combat Lab is unlisted. Correctly non-blocking; they
  constrain internal research (goal-ordering evidence), not shipped numbers.
- B1's target is owner-machine-relative: 15–20s on a Ryzen 7600X is roughly
  40–55s on Birch-class hardware at the measured 2.73× ratio. Not a blocker,
  but the site's expectation copy and the loading bar are what make that
  honest, which is why B2 is sequenced with, not after, B1.
- Reference builds re-verified today: `verify-reference-build.mjs` 69/69,
  exit 0.

---

## 2. Gates

Each gate is a command (or a committed test) plus the exact observable that
constitutes a pass. Where a gate cannot be made mechanical, it says so
rather than pretending.

### G0 — Gate harnesses are committed and runnable from a clean clone
**Blocks: G2, G5, G7. Do this first; it is an hour of work.**

- Move `.bench/stress-floors.mjs`, `.bench/stress-realistic.mjs`,
  `.bench/probe-no-floor-invariant.mjs`, `.bench/probe-false-infeasibility.mjs`
  to `scripts/stress/` (imports adjusted, nothing else).
- **Pass:** `git ls-files scripts/stress/` lists all four, and in a fresh
  `git worktree add`, `node scripts/stress/stress-floors.mjs --partition=1/4
  --depth=fast` completes with a per-case PASS/FAIL summary and exit 0/1
  semantics. The expected no-floor hashes move out of a handoff doc into the
  probe itself (or a JSON fixture beside it) so "hashes unchanged" is a
  script exit code, not a human diff.

### G1 — Precache decision lands before anything regenerates
- **Pass:** the `tuningFrontier`-strip change in
  `scripts/precompute-optimizer-results.mjs` is committed (it is currently an
  uncommitted diff — *verified*), and the owner has explicitly accepted its
  cost in writing (cache hits serve no tuning sliders on precached presets;
  the scratch page guards `result?.tuningFrontier||[]` so no crash —
  *verified* at `build-from-scratch.html:2356`).
- Falsifiable check: `git status --short scripts/precompute-optimizer-results.mjs`
  is empty at the release SHA.

### G2 — Set routes survive to the final sort (checklist A1)
Three sub-criteria, all at the release SHA, all after G0:

1. **Floor sweep unchanged:** `node scripts/stress/stress-floors.mjs`
   (all 4 partitions, thorough) reports **144/144 satisfied** — every
   returned build meets every declared floor.
2. **Per-case monotonicity, single-scorer:** for each of the 144 cases,
   persist the returned build pre-change and post-change; evaluate **both**
   builds with the post-change engine (`calculateBuild` + the same
   `scoreRankedGoals` scales derived from one probe pass) and require
   post ≥ pre on every case, zero exceptions. Comparing stored `score`
   fields across engine versions is **not** a pass — scales are
   version-relative.
3. **Deliberate activation:** a committed fixture request whose top-ranked
   goal stat is granted predominantly by a specific ≥4-piece equipment-set
   breakpoint (chosen from existing game data — no invented constants); pass
   = the returned build reports that breakpoint `active: true`. Plus a
   regression floor on the incidental case: re-running the 14 precache preset
   requests at HEAD yields ≥1 active equipment-set breakpoint in every entry
   that has one today (14/14 have ≥1 active breakpoint of some kind —
   *verified* against the committed cache).
- The **no-floor invariant hashes are explicitly NOT a gate here** — this
  change intends to alter no-floor results. Recapture the hashes *after*
  this change lands; they then resume guarding pure-speed work.

### G3 — Achievement parity explained or explicitly expected (checklist A2)
- **Pass:** `node scripts/verify-questlog-parity.mjs --json` yields
  `results[*].unexpectedBlockingIssues` empty for **all ten** fixtures, AND
  one of:
  - overall matched = 825/825 with ratchets raised to 77 (Magic DPS) and 88
    (Juggernaut); or
  - the remaining misses each have a written explanation in a dated doc,
    the `EXPECTED_BLOCKING_ISSUES` map cites that doc in its comment, and —
    hard condition — the Juggernaut Critical Damage over-report (ours 34.2 vs
    18.6) has a *specific* explanation. An unexplained "ours higher" may not
    be classified expected under any circumstances.
- Non-vacuous by construction: today this command returns 3 unexpected
  blockers, so the gate currently **fails** (*verified*). Exit code alone is
  not the gate; today's exit code is 0.
- Fixture rule stands: no edits to `scripts/reference-builds/questlog-parity/*.json`
  except `baselineMatched` ratchet raises.

### G4 — Undeclared-stat collapse is either flagged or disclosed (checklist A3)
Not currently gateable; becomes gateable the moment the owner picks a form.

- **Form A (warn-only guard, the scoped design):** a committed test issues
  the documented Crusader-style request (six declared PvP goals, Sword &
  Shield equipped) and asserts `result.warnings` contains a vitals warning
  naming Block Chance; a second (negative-control) request with block
  declared produces no such warning; and **both** result surfaces render
  `result.warnings` — `full-build-optimizer.html` already does (line 853,
  *verified*), `build-from-scratch.html` currently does not (*verified*), so
  the test must assert the scratch page's rendered DOM, not
  `tl-builder-result-view.js`, which no page imports.
- **Form B (defer + disclose):** a fixed sentence on both optimizer pages
  ("Stats you don't list are not protected and can drop sharply — add
  'keep at least' goals for anything you rely on"), gated by a DOM-presence
  test.
- Owner inputs still required for Form A: vitals list per weapon condition,
  threshold semantics. Until supplied, only Form B can gate.

### G5 — Performance (checklist B1)
- **Pass:** `node scripts/stress/stress-realistic.mjs --json --depth=thorough`
  on **Main-PC (Ryzen 7600X), quiet** (no concurrent agents/builds), at the
  release SHA: 36/36 succeeded, 36/36 floors met, 0 degenerate, and
  **median wall ≤ 20,000ms**. Record p50/p90/max into a dated doc — the p90
  feeds the loading-bar copy.
- The current 18.5s figure is a cross-machine extrapolation (Birch median ×
  2.73) and is **not** a pass. Nothing extrapolated passes this gate.
- Invalid unless run **after** G2 lands — a timing gate that excludes the
  known 3.5× set-route cost measures a product that won't ship.

### G6 — Test suite fully green, precache fresh (checklist C1)
- **Pass:** `npm test` reports **927/927** (or the then-current total) with
  zero failures and zero skips, including `optimizer-precache.test.mjs`; and
  `web/data/optimizer-precache/index.json` `engineFingerprint` equals
  `optimizerEngineFingerprint('web')` at the release SHA (one-line node
  check; today they differ — *verified*).
- Regen command: `node scripts/precompute-optimizer-results.mjs --force`,
  **after** G1 and after the last engine-touching commit. ~7–15 min.

### G7 — Standing correctness bundle at the release SHA
All four together, on the final commit, since any engine change invalidates
earlier runs:

- `node scripts/verify-questlog-parity.mjs` — exit 0, no ratchet regressions
  (plus G3's JSON assertion).
- `node scripts/verify-reference-build.mjs` — exit 0, 69/69. If a G2/G3 fix
  changes `the-death-prophet-and-void.json` totals, that is a stop-the-line
  signal to investigate, never a fixture edit.
- `node scripts/stress/probe-no-floor-invariant.mjs` — hashes match the
  post-G2 recaptured baseline.
- `node scripts/stress/probe-false-infeasibility.mjs` — 100% witness row
  satisfied.

### G8 — Deployment gate (from `docs/deployment.md`, absent from the checklist)
- **Pass, step 1 (mechanical):** the deployment.md release block exits 0
  end-to-end: `update-tl-helper.mjs --validate`, `node --test
  scripts/tests/*.test.mjs`, `verify-build-snapshot.mjs`,
  `verify-reference-build.mjs`, `verify-edge-cases.mjs`, TlCollector
  `dotnet test`, `git diff --check`, clean `git status`.
- **Pass, step 2 (manual, scripted checklist):** in a real browser against
  the deployed preview: run one scratch optimization to completion and
  confirm the returned goal values equal a Node run of the identical request
  (this is the only browser-vs-Node numbers check anywhere — treat a mismatch
  as a launch stopper); confirm a precache-eligible preset returns instantly
  and a modified request falls back to a live run; save/reload survives; one
  valid and one rejected Questlog URL against the hosted endpoint; no console
  errors on the five listed pages.
- Honest label: step 2 is manual. It is still falsifiable — each line has a
  yes/no outcome — but a human must execute it.

### G9 — Data currency and premise disclosure
- **G9a (partially manual):** on launch day, the owner confirms game build
  `app-data.json:gameBuild` (currently 24118850) corresponds to the live
  game's current patch, and records it (the data-build receipt exists for
  exactly this). Mechanical half: `generate-data-build-receipt.mjs` output
  committed at the release SHA. External half: cannot be verified from
  inside the repo; say so rather than pretend.
- **G9b (mechanical once written):** a disclosure line ships on the optimizer
  pages stating numbers are validated against Questlog's calculator and
  which known exclusions apply (Traces of Spacetime; achievement
  under-activation edge). Gate: DOM-presence test. Alternative: a recorded
  owner decision that no disclosure ships — also a pass, but it must be
  written down.

### G10 — Class names (checklist B3)
- **Pass:** a committed data file maps all 45 weapon pairs to class names; a
  test asserts it is total and injective over the 45 pairs; the scratch and
  improve result headers render the class name for the selected pair
  (DOM test on both pages). Design note recorded for the Crusader-set/
  Crusader-class collision (e.g. sets always rendered with "Set"/piece
  count).

### G11 — Loading bar (checklist B2)
- Gateable part: the run UI binds to the adapter's `onProgress` callbacks
  (percent + label already emitted — *verified* at
  `tl-full-build-adapter.js:1899`) and a DOM test asserts the progress
  element appears within 500ms of starting a run and advances on progress
  events. "Feels intentional" is not a gate and is not claimed as one.

---

## 3. Sequencing

```
G0 (commit harnesses)  ──────────────┐
G1 (precache decision commit)        │
                                     ▼
        A-track (engine):  G2 set routes → [speed work to re-hit target] → G3 calc fix (if any)
                                     │
        B-track (parallel, UI-only): G4 form decision → G4, G10, G11, G9b copy
                                     │
                       last engine-touching commit = release-candidate SHA
                                     ▼
        Evidence pass at RC SHA:  G2.1/G2.2/G2.3 + G5 + G7   (parallelizable across machines)
                                     ▼
        G6 precache regen (LAST engine-dependent artifact)
                                     ▼
        G8 deployment gate → G9a launch-day data check → ship
```

What blocks what:

- **G0 blocks G2, G5, G7** — no committed harness, no reproducible evidence.
- **G2 blocks G5**: timing measured without the 3.5× set-route cost is
  evidence for a product that won't ship. Conversely, **any speed work
  after G5 invalidates G5** — re-run it.
- **G2 invalidates the no-floor hash baseline** (intended result change).
  Recapture hashes immediately after G2 lands; only then do the hashes
  resume guarding later pure-speed commits (G7). Running G7's hash check
  against the pre-G2 baseline would fail spuriously; against a
  hastily-recaptured mid-fix baseline it would pass vacuously. Recapture
  exactly once, at the commit where G2's monotonicity evidence was taken.
- **G3 (if it changes `calculateBuild`) invalidates**: parity ratchets
  (raise-only edit), the recaptured no-floor hashes (recapture again), G2's
  monotonicity evidence (re-run the sweep), G5 timing (re-run), and the
  precache. This is why the sweep/timing/hash evidence pass happens once, at
  the RC SHA, not per-fix.
- **G6 (precache regen) is last** among engine-dependent artifacts; any
  engine commit after regen re-stales it (the fingerprint test will catch
  it — that is the test doing its job, do not silence it).
- **B-track is genuinely parallel** provided none of it touches modules
  reachable from `optimizer/tl-builder-worker.js` (that import graph is the
  precache fingerprint — *verified* in
  `scripts/lib/optimizer-engine-fingerprint.mjs`). Class names as a data
  file + page-level rendering stays outside it; verify with a fingerprint
  print before/after.
- **G8 step 2's browser-vs-Node check must run against the RC build with the
  fresh precache**, since it doubles as the cache-hit/live-run consistency
  check.

Cross-machine note: G5 is Main-PC-only by definition. The Birch/Spruce
`stress-realistic` runs are expectation-copy input, not gates.

---

## 4. Not before launch

Deliberately deferred, with reasons:

1. **Boss endurance modeling, Defense constant `k`, glancing denominator** —
   feed only Combat Lab (unlisted) and internal research. No shipped number
   depends on them (*verified* import graph). Resolving them under launch
   pressure invites exactly the invented-constant failure mode the project
   has rules against.
2. **Attribute-lane DP / memoisation** — its separability premise is known
   to be incomplete (HP material %, weapon min/max at finalisation). A speed
   win that risks wrong allocations is a premise trade nobody asked for.
   Only if G5 fails after G2 does more speed work happen, and then lane
   pruning first.
3. **Full 270-entry precache coverage** — 14 entries with the strip decision
   is ~29MB-safe and covers the marquee presets. Coverage expansion is a
   deploy-size/regen-time optimization, not correctness.
4. **Undeclared-stat guard beyond Form A/B** (auto-protection, per-class
   vitals curation across all 45 pairs) — needs game knowledge the repo
   demonstrably lacks (eight of forty-five pairs have any empirical
   reference). Ship warn-only or disclosure; iterate with real users.
5. **Goal-ordering revisits via elasticity** — settled twice through
   `modelExpectedPvpDamage`; the checklist's own "do not reopen" is right.
6. **Tuning sliders on precached presets** — cost accepted in G1; restoring
   them means revisiting the 540MB blob math, post-launch.
7. **Supabase auth/sync** — deployment.md already scopes it out of the first
   release.
8. **Spruce/Birch expectation copy ("≈Xs on a typical PC")** — wants the
   post-RC timing data anyway; a day-two content change.
9. **Dead-code cleanup of `tl-builder-result-view.js`** (either wire it in or
   delete it and its test) — worth doing so future audits stop citing it,
   but it changes nothing a player sees at launch.

---

## Next steps

### The single next action

Hand Codex the G0 harness promotion, now: move `.bench/stress-floors.mjs`,
`.bench/stress-realistic.mjs`, `.bench/probe-no-floor-invariant.mjs`,
`.bench/probe-false-infeasibility.mjs` to `scripts/stress/`, fix their
relative imports, embed the expected no-floor hashes in the probe as data,
and prove it from a fresh `git worktree` with
`node scripts/stress/stress-floors.mjs --partition=1/4 --depth=fast`.
Scripts-only, no optimizer hot path, independently verifiable — the exact
shape of work Codex is for. Everything downstream needs it. (~1–2h, guess.)

### Ordered sequence after it

| # | What | How long | Kind |
|---|---|---|---|
| 1 | G1: commit the `tuningFrontier` strip already sitting in the tree | 5 min | Mechanical (it's your diff; commit it) |
| 2 | **D1 decide**, then G2: re-apply the reverted set-route fix on Main-PC; build the monotonicity capture (persist pre/post builds per sweep case, re-score both under one engine) | fix re-apply ~1h; evidence = machine time below | Owner judgement on D1; the rest mechanical. Hot path — not Codex |
| 3 | **D2 decide**, then A2: time-boxed hunt for the Juggernaut Critical Damage over-report (34.2 vs 18.6) | half a day, time-boxed (guess) | Investigation; owner sets the stop rule |
| 4 | Speed work to re-hit ≤20s with set routes on (lane pruning first) | unknown — days, guess | Judgement-heavy; measured against G5 only |
| 5 | RC evidence pass at the release SHA: sweep + monotonicity + parity + reference + hashes + `stress-realistic` | overnight, see parallel plan | Mechanical |
| 6 | G6: precache regen, dead last among engine artifacts | 7–15 min (measured) | Mechanical |
| 7 | G8: deployment gate + browser-vs-Node spot check | ~1h manual | Mechanical checklist, human executes |

### B-track (parallel, Codex-suitable, never touches the worker import graph)

- G10 class names: commit the 45-pair mapping as data + render in both result
  headers; bijection test. (~2–3h, guess.)
- G11 loading bar bound to the existing `onProgress` events. (~2–3h, guess.)
- G4 Form B disclosure line + DOM test on both optimizer pages, and
  `result.warnings` rendering added to the scratch page. (~1–2h, guess.)
- Each is verifiable by test + screenshot; confirm the precache fingerprint
  is unchanged after each (one-line node check) before accepting.

### Machine plan

- **Spruce (12c, free):** launch detached now-ish — sweep partitions 1–2 at
  thorough, then its `stress-realistic` lane. Sweep shard ≈ hours (prior full
  gate ran sharded; per-shard wall not separately measured — estimate).
- **Birch (4c, free):** sweep partitions 3–4, then parity + `npm test`
  cross-check. Its 36-case realistic lane ≈ 30–60 min (derived from the
  measured 50.6s median × 36, plus overhead — estimate).
- **Main-PC:** owner works by day; **G5 timing runs here, overnight,
  detached via WMI**, machine otherwise idle. That is the only gate that
  cannot move off this box.
- **Codex:** G0 now; B-track items after. Nothing that imports into
  `optimizer/tl-builder-worker.js`'s graph.

### Decision points (owner)

- **D1 — set-route order:** (a) re-apply now, eat 3.5×, recover speed after;
  (b) optimize first. **Take (a):** every timing number without set routes
  measures a product that won't ship.
- **D2 — A2 stop rule:** (a) fix if the hunt lands; (b) expectation-mark the
  five "ours lower" misses with the doc trail. Either is fine — but the
  "ours higher" Juggernaut number may not be marked expected unexplained; if
  the time-box expires without an explanation, it stays a blocker.
- **D3 — A3 form:** (a) Form A minimal warn-only guard — vitals `hp_max`,
  `damage_reduction`, plus `shield_block_chance` when Sword & Shield is
  equipped, warn at ≥50% below `objectiveBaseline`; (b) Form B disclosure
  only. **Recommend (a):** it is small, the trust case is strong, and the
  scratch-page warnings rendering is needed for Form B anyway. Needs your
  sign-off on that exact vitals list and threshold — that is the whole
  decision.
- **D4 — G9b disclosure:** ship the one-line "validated against Questlog"
  disclosure. Obvious right answer: yes; write the sentence, gate on DOM
  presence.

---

## Appendix: what I verified vs. took on trust

Verified today against the tree: precache set activations (14/14, per-entry
inspection), precache fingerprint mismatch (recomputed both), parity verifier
exit-0-with-blockers behavior (ran it), reference builds 69/69 (ran it),
set-route selection asymmetry (read lines 578–613, 1620–1953), warnings
rendering asymmetry between the two result pages (grep + read),
`tl-builder-result-view.js` orphanhood (grep), `.bench` harness presence and
gitignore status, `damage_reduction` composite fix (now generalized in
`web/tl-questlog-rules.js` — the handoff doc's open product bug is closed),
Crusader-in-data, `gameBuild` value, fingerprint module-graph definition,
uncommitted precompute diff.

Taken on trust (too expensive to re-run on a machine in use): the 144/144
sweep result, 36/36 stress-realistic and its medians, invariant hash
byte-identity through HEAD, the 3.5× set-route fix cost, the 2.73× machine
ratio, and the reverted fix's SHIP review. Each becomes moot at the RC-SHA
evidence pass, which re-derives all of them under committed harnesses.
