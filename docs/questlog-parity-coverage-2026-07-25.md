# Questlog parity: what the number actually covered

Date: 2026-07-25
Branch: `codex/sites-deploy`
Predecessor: `docs/questlog-parity-status-2026-07-24.md`

## The bug was the denominator

`scripts/verify-questlog-parity.mjs` joins our stats to Questlog's Combined Stats
panel by display label. A panel row whose label matched no stat id was skipped —
`continue`, with no counter. Not compared, not failed, not reported.

So `819/825 = 99.3%` did not mean "we reproduce 99.3% of what Questlog shows". It
meant "99.3% of the rows we happened to be able to map". The panels hold **887**
rows. **62 of them, 7%, were invisible.**

| Panel row | Fixtures affected |
| --- | --- |
| Movement Speed | 10 of 10 |
| Boss Ranged Evasion | 8 |
| Boss Melee / Magic / Ranged Endurance | 6 + 6 + 6 |
| Boss Melee / Magic / Ranged Heavy Attack Evasion | 6 + 5 + 5 |
| Healing Received | 3 |
| Combat Power | 2 |
| Max Damage, `~`, Range | 1 |
| Shield Health, Shield Health Received | 1 |

## What they turned out to be

**Nothing was miscalculated. Every one of the 62 rows now matches Questlog.** The
parity run went from 819/825 to 881/887 — the six known mismatches are unchanged,
and 62 already-correct totals stopped hiding.

That is the important finding, and it inverts the going assumption that these
were modelling gaps. They split three ways:

### 1. Stale display names (23 rows)

The verifier's own header claimed "both sides label from the same game data, so
there is no hand-written mapping to drift". That was wrong, and the wrongness is
what let the gap open. `scripts/build-web-data.mjs` `statLabel()` only
title-cases stat ids — `move_speed_modifier` becomes "Move Speed Modifier". Every
player-facing name comes from `STAT_ALIASES` or `derivedQuestlogStatName` in
`web/tl-core.js`: a hand-written map, and the only place our wording can drift
from Questlog's. Drift there is silent, because a label the panel does not use
drops the stat out of the comparison rather than failing it.

Five names were stale. The values were already exact on every fixture:

| Stat id | Was | Questlog |
| --- | --- | --- |
| `move_speed_modifier` | Move Speed | **Movement Speed** |
| `shield_modifier` | Shield Strength | **Shield Health** |
| `shield_taken_modifier` | Shield Received | **Shield Health Received** |
| `skill_heal_taken_modifier` | Skill Healing Received | **Healing Received** |
| `boss_range_evasion` | Boss Range Evasion | **Boss Ranged Evasion** |

The last one was structural, not a typo. `derivedQuestlogStatName` builds names
for the accuracy / armor / critical_attack / critical_defense / double_attack /
double_defense families and maps `range` to Questlog's "Ranged" — but it omitted
`evasion`, so `boss_range_evasion` fell through to the title-cased id while its
sibling `boss_range_accuracy` derived "Boss Ranged Hit Chance" correctly. Adding
`evasion` to that family fixes the whole set and also gives `boss_all_evasion`
its proper "Boss Evasion" (was "Boss All Evasion").

`heal_taken_modifier` and `shield_hp` were suspected missing stats. They are not
needed: nothing in the game data grants either, and Questlog's "Healing Received"
and "Shield Health" are `skill_heal_taken_modifier` and `shield_modifier`, whose
totals match on every fixture that displays them.

### 2. Boss defence projections absent from `statLabels` (37 rows)

`boss_melee_critical_defense`, `boss_magic_critical_defense`,
`boss_range_critical_defense` and the three `*_double_defense` equivalents are
**already modelled and already correct** — `STAT_EXPANSIONS` forwards
`melee_critical_defense -> [boss_melee_critical_defense, pvp_...]`, and
`calculateBuild` totals them. Spot-check against the panels, exact on all:

| | Healer 8261110 | Juggernaut 8227612 | Infiltrator 8297163 |
| --- | --- | --- | --- |
| Boss Melee Endurance | 3,425 | 643 | -21 |
| Boss Ranged Endurance | 1,825 | 119 | 24 |
| Boss Magic Endurance | 2,593 | 583 | 60 |
| Boss Melee Heavy Attack Evasion | 1,617 | 237 | -36 |

They were invisible because the verifier built its label map from
`core.data.statLabels`, and that projection collects stat ids **observed in item,
rune, mastery and set data**. No item grants a boss defence projection directly —
they exist only as expansion targets — so they never enter `statLabels` even
though every build has a total for them. The verifier now extends its map with
the ids present in `calculation.stats`, which is where the totals actually live.

`boss_all_critical_defense` and `boss_all_double_defense` remain rowless. They
are composites, never displayed, and no panel shows them.

### 3. Panel shape, not stat data (2 rows)

Questlog renders main-hand damage as one range row, `478 ~ 1071`. The capture
split it on whitespace, so the label landed on the minimum and the separator
became a key: `{"Max Damage": "478", "~": "1071"}`. Our numbers were already
right (`attack_power_main_hand_min` = 478, `_max` = 1071, both exact). The
verifier now joins the pair and compares both ends. Recapturing was rejected: a
payload refreshed without its panel silently reports false mismatches, which is
how 43/43 became 22/43 on 2026-07-24. `Range` is the same weapon block, where
Questlog drops the "Main Weapon" prefix it uses elsewhere.

## Combat Power: derived, and it was already implemented

Combat Power is a Questlog-side aggregate, not a game stat — no stat id, no row
in `calculateBuild`, no `STAT_EXPANSIONS` entry. We do derive it, in
`core.combatPowerBreakdown` (equipment + skills + masteries), so it is now
compared instead of omitted:

| Build | Ours | Questlog |
| --- | --- | --- |
| 8261110 Healer | 6,982 | 6,982 |
| 8215841 Melee DPS | 5,667 | 5,669 |

Only two fixtures captured the row. Both pass, but note **8215841 passes on the
relative tolerance, not exactly** — 2 points on 5,669 is 0.035%, inside the
harness's uniform 0.05% band. Combat Power is explicitly a fitted heuristic
(hardcoded tables plus per-item bonus allowlists in `tl-questlog-rules.js`, not
extracted from game power tables), so treat that as "consistent with", not
"verified". Capturing the row on more fixtures is the cheapest way to learn
whether the 2-point gap is a rounding artefact or a real drift in the fit.

## The gate that stops this recurring

Coverage is now enforced, not just reported:

- Every panel row is classified. `compared + unverified == panelRows` is asserted
  per fixture; a drift throws.
- Any unverified row **fails the run** and is printed with a reason. The escape
  hatch is `UNVERIFIED_PANEL_ROWS` in the verifier — an explicit, reviewed
  declaration that a displayed row is outside our model. It is currently empty
  and that is the goal state.
- The text report always prints `Panel coverage: N of M displayed rows compared,
  K unverified`, even at zero. A parity percentage printed without its coverage
  is the original bug.
- `scripts/tests/questlog-parity-coverage.test.mjs` reads the panel row counts
  straight from the fixtures and asserts the reported denominator equals them, so
  the verifier cannot define its own denominator.

Nothing was invented to close a gap: no new game constant, no hard-coded value,
no tuned tolerance. The label fixes rename stats to what Questlog calls them, and
the join fixes look up totals we were already computing.

## Result

```
  Overall: 881/887 = 99.3% across 10 archetypes
  Panel coverage: 887 of 887 displayed rows compared, 0 unverified
```

Ratchets raised to the earned counts in the same change (96, 84, 75, 102, 92, 73,
95, 96, 77, 91). Reference builds 69/69. The six remaining mismatches are
unchanged and pre-existing — five on Juggernaut 8227612 (Critical Damage, a -100
Melee Heavy Attack Chance shared across the plain/PvP/Boss projections) and one
on Magic DPS 8290225 (Critical Damage Resistance).

## Useful commands

```bash
node scripts/verify-questlog-parity.mjs --verbose
node --test scripts/tests/questlog-parity-coverage.test.mjs
node scripts/verify-reference-build.mjs
```
