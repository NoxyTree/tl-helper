# How Base Damage enters damage, and what each stat is worth

Date: 2026-07-25. Derived from our own decoded data and combat engine — see
"Reproducing this" at the end.

This exists because the question "should Base Damage rank above Skill Damage
Boost?" has been asked more than once and re-derived badly each time. The stat
name mapping lives in `docs/owner-build-stat-vocabulary.md`; this file is the
weighting.

## 1. Base Damage is the scalar everything else multiplies

Decoded level-1 ability rows (`docs/combat-calibration-first-protocol.md`):

```
  Gaia Crash        Base Damage * 25500 / 10000 + 37     -> BD * 2.55 + 37
  Swift Healing     Base Damage * 16500 / 10000 + 200    -> BD * 1.65 + 200
  Distortion Veil   Base Damage * 30000 / 10000 + 600    -> BD * 3.00 + 600
```

Critical Damage, Heavy Attack Damage and Skill Damage Boost all apply on top of
that product. Base Damage is not one stat among many — it is the base the others
scale.

## 2. It is per-hand, selected by the ability's weapon family

From `docs/calculation-authority-final-review-2026-07-14.md`:

> Base Damage is taken only from the hand containing the ability's required
> weapon family; selecting the other hand is rejected and resynchronized.

and `docs/pvp-maxima-and-expected-damage-2026-07-14.md` scores at "the correct
equipped weapon hand's minimum and maximum Base Damage".

**It is NOT main-hand-only, and NOT "the game takes the highest."** A staff
ability uses the staff's Base Damage; an orb ability uses the orb's.

**Consequence for the optimizer:** goal sets that only name
`attack_power_main_hand_max/min` capture half the picture for any two-weapon
build that presses abilities from both hands — which is most builds. The
off-hand pair `attack_power_off_hand_max/min` belongs in the goal set too,
ideally weighted by which abilities are actually used. This is a live gap, not a
resolved design.

## 3. Which end of the range is used — MODELLED, NOT VERIFIED

`web/vendor/combat-engine/expected-damage.mjs`:

```
  Critical -> MAXIMUM Base Damage
  Glance   -> MINIMUM Base Damage
  Normal   -> midpoint of the range
```

`docs/combat-calibration-first-protocol.md` was written to answer exactly this
("Which visible Base Damage value is used: minimum, maximum, average, or a
per-use roll?") and **was never run** — the only file in
`scripts/combat-calibration/` is `example-observation.json`. Treat the rule as a
well-reasoned model from decoded formulas, not a measured fact.

Everything in section 4 depends on it.

## 4. What each stat is worth

Measured by perturbing each input to `modelExpectedPvpDamage` and reading the
change in expected damage. Raw "+1 point" is NOT comparable across stats on
different scales, so the decision-relevant figure is **elasticity: percent
damage gained per one percent more of the stat.**

Reference build: a PvE caster DPS (Staff + Orb) with Base Damage 485-945,
Skill Damage Boost 859, crit chance 1389, crit damage 21.9%, heavy chance 2002,
heavy damage 8.8%, target resistances 0.

```
  Main Weapon Max Damage    0.951
  Base Damage (both ends)   0.792
  Critical Damage           0.586
  Critical Hit Chance       0.272
  Heavy Attack Damage       0.260
  Heavy Attack Chance       0.186
  Skill Damage Boost        0.170
  Main Weapon Min Damage    0.049
```

### Base Damage outranks Skill Damage Boost by ~5.6x

Skill Damage Boost runs on a saturating curve
(`modelSkillDamageMultiplier`, `web/vendor/combat-engine/pvp-models.mjs:53`):

```
  multiplier = 1 + d/(d + 1000)          d = boost - resistance
```

It asymptotes at x2 and can never exceed it:

```
  boost      0   x1.000   next point +0.1000%
  boost    859   x1.462   next point +0.0289%
  boost   3000   x1.750   next point +0.0063%
  boost  10000   x1.909   next point +0.0008%
```

Base Damage is the magnitude term: linear, no ceiling.

### Max and Min are ~19x apart and must not be ranked adjacently

0.951 versus 0.049. Criticals select maximum, glances select minimum, so the gap
widens with crit chance. Ranking them next to each other buys Min at a weight it
does not earn.

### Cooldown Speed and Attack Speed cannot be ranked from this

The model measures damage **per cast**. Those two change casts **per second**.
Placing them needs a rotation/DPS model we do not have. Treat their position in
any priority list as unresolved rather than trusting it.

## 5. Why ranking matters more than list length

Goal weights decay geometrically at `RANK_DECAY = 0.35`, so weight is
`0.35^(rank-1)`:

```
  rank 1  1.0        rank 4  0.0429     rank 7  0.00184
  rank 2  0.35       rank 5  0.0150     rank 8  0.000643
  rank 3  0.1225     rank 6  0.00525    rank 9  0.000225
```

Rank 9 carries **0.02%** of rank 1's weight. A nine-stat priority list is
effectively a three-stat list. Ordering dominates; adding more entries does
almost nothing. Note this applies to `maximize` goals — an `at_least` floor is a
hard constraint and outranks the weighting entirely.

## Reproducing this

`.bench/probe-stat-weights.mjs` (gitignored scratch) imports
`modelExpectedPvpDamage`, perturbs one input at a time, and reports both raw and
elasticity figures plus the saturation table. Omit `pvpMode` for the PvE case —
passing `false` throws, since it is looked up as a caps key.
