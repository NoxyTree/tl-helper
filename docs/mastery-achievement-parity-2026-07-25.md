# Mastery Achievement parity investigation — 2026-07-25

## Conclusion

Candidate 3 is the explanation supported by the frozen evidence: these are faithful imports of Questlog mastery builds that really store fewer activated Achievement effects than the validator expects. The importer does not drop or collapse a second effect, and there is no decoded-game-data basis for a one-slot Common or Uncommon rule.

This conclusion is about the stored Questlog build and the panel rendered from it. It is not proof that the live game accepts an under-activated tier. The exact live-game legality of leaving a second eligible Achievement effect inactive remains unproven: the decoded mastery-node rows do not encode a required selection count, while the recovered Questlog planner permits fewer than two and only disables a third selection. No new game rule is inferred from that UI behavior.

The core validator was therefore not weakened. The parity verifier now marks these exact frozen source conditions as expected blockers while continuing to report any other blocking issue normally.

## Evidence chain

### 1. The payload and imported selection sets are identical

Each fixture's `questlogPayload.masteryBuild.specialization` value is an array. `importQuestlogBuild()` in `web/tl-core.js` maps every row to `build.masteries` by its mastery ID. Comparing the raw ID array with the imported object keys produced equal counts, no missing IDs, no duplicate raw IDs, and no rows without an ID:

| Build | Offending tier | Raw rows | Imported rows | Stored activated effect(s) |
|---|---|---:|---:|---|
| 8197308, Hit tank | Greatsword Uncommon | 55 | 55 | `Sword2h_High_Util_Skill` only |
| 8261110, Healer | Orb Common | 55 | 55 | `Orb_Normal_Tac_Skill` only |
| 8290225, Magic DPS | Staff Uncommon | 52 | 52 | `Staff_High_Def_Skill` only |
| 8227612, Juggernaut | Greatsword Common and Rare | 54 | 54 | `Sword2h_Normal_Def_Skill` and `Sword2h_Rare_Def_Skill`, one in each affected tier |

This rules out candidate 1. There is no second activated ID for the importer to recover.

### 2. The affected tiers genuinely have multiple eligible categories

Applying the existing decoded hybrid-category accounting to the stored normal-node levels gives:

| Build and tier | Eligible category totals (20 or more) |
|---|---|
| Hit tank, Greatsword Uncommon | Attack 20, Defence 20, Tactics 20, Utility 20 |
| Healer, Orb Common | Attack 30, Tactics 30, Utility 30 |
| Magic DPS, Staff Uncommon | Attack 20, Defence 20, Tactics 20 |
| Juggernaut, Greatsword Common | Attack 20, Defence 20, Utility 20 |
| Juggernaut, Greatsword Rare | Attack 30, Defence 30, Tactics 30, Utility 30 |

The warning is therefore not caused by category miscounting. Each tier has at least two categories over the 20-point threshold but stores only one activated effect.

### 3. Questlog rendered the stored under-activation

The fixture payload and Combined Stats panel were frozen together. With exactly the stored mastery rows, TL Helper matches Questlog at 73/73 for the hit tank and 83/83 for the healer. Across all four affected fixtures the current comparisons are 315/321. Synthesizing another activation would change the source build rather than repair an import omission.

The July 24 status document listed only the healer and hit tank. The current fixture fleet also contains the same condition in Magic DPS (one tier) and Juggernaut (two tiers), so all five exact warning messages are covered by the expectation marker.

### 4. No decoded evidence supports a low-tier slot reduction

The recovered static mastery records at `C:\_Projects\tl-character-extract\out\questlog-public\weaponSpecialization.getWeaponSpecializations.json` contain node identity, grade, category, type, cost, stats, and passives, but no grade-dependent Achievement-slot count.

The recovered Questlog core UI at `C:\_Projects\tl-character-extract\out\questlog-main.js` uses one requirement function for Common, Uncommon, and Rare. It requires 20 category points and disables an unselected node only when two same-grade synergies are already selected. It does not define one slot for Common or Uncommon. This agrees with `mastery-page-rules.md`, which records a maximum of two Synergy nodes per rarity tier.

That is not decoded-game-data proof of fewer low-tier slots, so candidate 2 is rejected rather than guessed.

## Change

`scripts/verify-questlog-parity.mjs` now has an exact build-ID and message expectation map for the five observed `mastery_synergy_count_invalid` conditions. The verifier preserves the calculation status and the core warning, but separates:

- unexpected blockers, rendered with `!`; and
- expected frozen-source blockers, rendered as `~ expected:`.

The JSON report retains `blockingIssues` and adds `expectedBlockingIssues` and `unexpectedBlockingIssues`. No fixture JSON, optimizer source, game-data projection, or validator rule changed.

## Parity verification

`node scripts/verify-questlog-parity.mjs` exited successfully before and after.

| Archetype | Before | After |
|---|---:|---:|
| Melee PVE | 88/88 | 88/88 |
| Evasion tank | 82/82 | 82/82 |
| Hit tank | 73/73 | 73/73 |
| Melee DPS | 90/90 | 90/90 |
| Ranged DPS | 72/72 | 72/72 |
| Healer | 83/83 | 83/83 |
| Melee DPS max-dmg | 88/88 | 88/88 |
| Infiltrator PvP | 84/84 | 84/84 |
| Magic DPS | 76/77 | 76/77 |
| Juggernaut | 83/88 | 83/88 |
| **Overall** | **819/825 (99.3%)** | **819/825 (99.3%)** |

After classification, the JSON report contains five expected mastery blockers, zero unexpected blockers, and zero parity regressions.

## Test result

`npm test` was run. This checkout currently discovers 927 tests rather than the 908 stated in the task. Result: 926 passed and one failed.

The sole failure is `scripts/tests/optimizer-precache.test.mjs`, “a committed precache is fresh and internally consistent.” The committed cache stores engine fingerprint `0cffb6e7edd0c18775687d3f69772fe02c267de4eddd61fb598bd3f8f4e24863`; the current committed optimizer-engine module graph produces `93fa220de2df18192bd0aeea3b1188faba53be9defde23c3fafacd612e18f174`.

This task did not cause that failure: none of the modules returned by `optimizerEngineModules()` is dirty, and `scripts/verify-questlog-parity.mjs` is not part of the optimizer fingerprint. Per the task constraint, the optimizer sources and precache were not edited or regenerated. A completely green full-suite result therefore remains blocked by the pre-existing stale optimizer precache, not by the mastery-parity change.

---

# CORRECTION — 2026-07-26

The conclusion above ("candidate 3: faithful imports of genuinely
under-activated builds") does not survive looking at the six signed deltas.
It was reached without ever breaking down which SOURCE produces each
disagreeing number.

## The direction counts were wrong

Not five "ours lower" and one "ours higher". Measured:

| Fixture | Stat | Questlog | Ours | Delta |
|---|---|---:|---:|---:|
| Juggernaut | Critical Damage | 18.6 | 34.2 | **+15.6** |
| Juggernaut | Critical Damage Resistance | 9.6 | 10.8 | **+1.2** |
| Juggernaut | Melee Heavy Attack Chance (x3 contexts) | 1,567.8 | 1,467.8 | −100 |
| Magic DPS | Critical Damage Resistance | 42 | 36 | −6 |

Four low, two high. A missing Achievement effect cannot explain a stat we
**over**-report, so the under-activation theory never fit these two fixtures.

## Three of the four trace to exactly two mastery nodes

Source breakdowns from `calculateBuild(..., { includeSetEffects: true })`:

- **Critical Damage** — ours 3420 raw, Questlog 1860. Excess **1560**, which is
  exactly the `Double Impact` source.
- **Critical Damage Resistance** (Juggernaut) — ours 1080, Questlog 960. Excess
  **120**, again exactly `Double Impact`.
- **Melee Heavy Attack Chance** — ours 14678, Questlog 15678. Deficit **1000**,
  exactly the `Steel Sacrifice` source, which contributes **−1000**.

So we are not missing an effect. **We are applying two nodes Questlog does not.**

## What those two nodes are

- **`Steel Sacrifice` = `Sword2h_Normal_Def_Skill`** — `specializationType:
  "synergy"`, grade 11 (Common). This is the *very node* the validator warns
  about: it is the single stored Achievement effect in the under-activated
  Greatsword Common tier. Questlog appears to treat an under-activated tier as
  granting **nothing**, while we apply its member node.
- **`Double Impact` = `GT_Hero_Tactic_04`** — `specializationType: "normal"`,
  grade 41, gauntlet. A different mechanism: a normal node, not a synergy. We
  apply it; Questlog does not. The shipped guide gates Epic nodes at 80/120
  points, which is the first thing to check.

## Status

**Unresolved and not fixed.** The Magic DPS −6 (raw 600) is not attributable to
a named source yet and runs the other way.

This is a calculation disagreement in our favour on two stats — we inflate
Critical Damage by 84%. It must not be marked expected, and the fixtures stay
classified as unexpected blockers.

The next step is evidence about the game rule, not a code change: does an
under-activated tier grant its stored effect or not? Questlog says no. We say
yes. Nothing decoded so far settles it, and no rule should be written into the
engine until something does.

---

# Double Impact — hypotheses eliminated, 2026-07-26

`34.2 − 15.6 = 18.6` exactly: Questlog applies **none** of Double Impact, and
that single node accounts for the whole Critical Damage disagreement (and the
+1.2 on Critical Damage Resistance). So the question is narrow — why does
Questlog not apply a node the payload stores?

Three explanations checked against the data and **all three are wrong**:

| Hypothesis | Verdict |
|---|---|
| The node isn't actually selected | **No.** `GT_Hero_Tactic_04` is stored at `level: 10`. |
| It's Epic-gated and the gate isn't met | **No.** The gate is 80 non-Epic normal points for a first Epic (`tl-core.js:2229`). The build has **216**. |
| The weapon is over its point budget | **No.** `MASTERY_POINT_BUDGET = 220`; counting normal nodes only, no fixture on the fleet exceeds it. An earlier count of 226 wrongly included synergy nodes, which cost no points. |

So by every rule this engine implements, Double Impact is legitimately
unlocked, legitimately allocated, and should apply. Questlog disagrees.

**That means the disagreement is about a game rule we do not know**, not about
importing, gating, or budgeting. It cannot be resolved from anything currently
in the repo.

Resolving it needs external evidence — an in-game observation of a character
with an Epic gauntlet Tactic node, or a decode that exposes an activation
condition the current mastery records do not carry. Until then:

- Both fixtures stay **unexpected** blockers; `verify-questlog-parity.mjs`
  exits 1 on them.
- The over-report is disclosed in both optimizer footers.
- **Do not** write a rule into the engine to close the gap. Guessing a
  condition that happens to zero out this node would fit the fixture and
  silently break every build where the node legitimately applies.

---

# 2026-07-27: Juggernaut fully characterised, Magic DPS narrowed

The two fixtures are **not the same problem**, which is why no single theory
ever fit both. One over-applies, one under-applies.

## Juggernaut (8227612) — completely explained

Removing exactly two nodes takes it from **89/94 to 94/94**. Full parity, no
residual mismatch anywhere in the panel:

- `GT_Hero_Tactic_04` (Double Impact) — grade 41, `normal`, gauntlet/tactic
- `Sword2h_Normal_Def_Skill` (Steel Sacrifice) — grade 11, `synergy`

So Questlog's panel is *exactly* our calculation minus those two. This is no
longer "we disagree on five stats"; it is one precise claim with a clean test.

Ruled out, each by measurement: the nodes are stored (level 10 / present); the
Epic gate is met (80 required, 216 non-Epic points present); the weapon is
within the 220-point budget; and `reconcileMasterySelections` removes neither,
so no prerequisite is unsatisfied.

## Magic DPS (8290225) — still unexplained, but narrowed to one stat

A single miss: **Critical Damage Resistance, Questlog 42 vs ours 36** — raw 600
we do not have. Opposite direction to Juggernaut, so "we over-apply" cannot
explain it.

Eliminated:

- **A missing rune synergy.** All 13 three-rune slots produce one; 13 applied.
- **A missing second Achievement effect** — the original theory. Adding each
  candidate for the flagged Staff Uncommon tier (`Staff_High_Attack_Skill`,
  `Staff_High_Tac_Skill`, `Staff_High_Util_Skill`) leaves it at 76/77 with the
  identical shortfall. Removing the stored `Staff_High_Def_Skill` makes it
  *worse*, so Questlog does apply that one.

## What would settle it

For Juggernaut, one in-game observation on character 8227612: does the
Critical Damage on the character sheet include Double Impact's contribution
(34.2, our figure) or not (18.6, Questlog's)? That decides which side is wrong
with no further analysis.

**Do not** write a rule to close either gap. A condition invented to zero out
Double Impact would fit this fixture and break every build where the node
legitimately applies — and the Magic DPS shortfall runs the other way, so any
such rule would make that fixture worse.

---

# 2026-08-12: accepted, not explained — owner decision

Both fixtures are now marked expected in `verify-questlog-parity.mjs`, which
exits 0 again. **Nothing above was resolved.** This is a decision to stop
blocking a release on a question the repo cannot answer, not a finding.

What that costs, stated plainly: the site ships a Critical Damage figure for
under-activated Juggernaut-shaped builds that is **84% higher than Questlog's**
for the same build, and the Magic DPS Critical Damage Resistance is 6 low. Both
optimizer footers already disclose the six-stat disagreement and the 84% figure,
so a player is told; the gate no longer stops the release over it.

Two things make this an acceptance rather than an amnesty:

1. **The deltas are pinned.** `ACCEPTED_MISMATCHES` records each disagreement by
   signed delta — +15.6 Critical Damage, +1.2 Critical Damage Resistance, −100
   on the three Melee Heavy Attack Chance contexts, −6 for Magic DPS. The
   ratchet could never guard these: it counts matched stats, and an accepted
   mismatch is already unmatched, so the delta could grow without bound and
   every number the ratchet watches would hold. A delta that changes size, or a
   new disagreement in either fixture, fails the run. `scripts/tests/
   questlog-parity-acceptance.test.mjs` proves each of those fires.
2. **The do-not-invent-a-rule instruction above is unchanged.** Accepting the
   disagreement is explicitly *not* permission to close it with a guessed
   activation condition. The gap stays open and visible until evidence arrives.

This overrides the hard condition in `production-gates.md` G3, which forbids
classifying an unexplained "ours higher" as expected under any circumstances.
That rule was right to demand an explanation; the override is a judgement that
waiting for an in-game observation is a worse trade than launching with a
disclosed, bounded, pinned disagreement. Recorded here so the override is a
decision on the record rather than a quietly relaxed gate.

**What still settles it, unchanged:** one in-game observation on character
8227612 — does the character sheet's Critical Damage include Double Impact
(34.2, ours) or not (18.6, Questlog's)? That answer retires the acceptance in
either direction, and it is still worth getting.
