# Scope: guard against undeclared stats collapsing

Date: 2026-07-25. Status: scoped, not implemented.

## The problem, measured

A Crusader (Greatsword + Sword & Shield) was optimized against six declared
PvP stats — PvP Endurance, PvP Melee Hit Chance, PvP Magic Heavy Attack Evasion,
Cooldown Speed, Buff Duration, Collision Chance. It beat a real imported player
on every one of them, by 6% to 430%.

It also produced this, against that same real player:

```
  Max Health          31,120  vs  50,255     -38%
  Block Chance          8.69%  vs   57.3%    -85%
  PvP Evasion               0  vs   1,044   -100%
  Damage Reduction         88  vs     173     -49%
```

**8.69% Block Chance on a Sword & Shield build.** Nothing warned. The result
reported `status: legal` and a healthy score.

This is not a bug. The optimizer was told six stats mattered and correctly
concluded nothing else did. But a user who names the handful of stats they tune
for — which is exactly how players think — gets a confident-looking build that
is quietly unusable, and no signal that anything is wrong.

## Why this is worth fixing before more speed work

The tool currently produces *correct* builds that are not necessarily *usable*
ones. A user cannot tell the two apart from the output. That gap costs more
trust than the difference between a 27-second and a 10-second run.

## The machinery already exists

No new concepts are needed. `web/optimizer/tl-full-build-adapter.js` already:

- computes `objectiveBaseline` (line ~1364) — a fixed pre-optimization stat map,
  already cloned into the result at line ~1829;
- computes `tradeoffs` (line ~1718) by comparing each **declared goal** against
  that baseline and flagging any that finished below it;
- computes `statDeltas` (line ~1816) as `finalStats[id] - objectiveBaseline[id]`
  for goals and protected stats;
- carries a `warnings: string[]` field (line ~1820) that the result view already
  renders.

The guard is the same comparison `tradeoffs` already performs, extended to a
curated set of stats the user did **not** declare.

## Proposed design

1. **Define a vitals set, conditioned on the equipped weapons.** Not all ~800
   stats — a short list of things whose collapse makes a build unfieldable.
   Universal candidates: `hp_max`, `damage_reduction`. Conditional: block chance
   only when Sword and Shield is equipped; mana/regen for casters; evasion and
   the typed endurances for anything expected to be hit.

2. **Compare each vital against `objectiveBaseline`** after `finalStats` is
   computed, skipping any stat the user declared as a goal or listed in
   `goals.protect` — those are already the user's explicit decision.

3. **Emit into the existing `warnings` array**, phrased concretely:
   `"Block Chance finished 85% below the starting build. Sword and Shield
   builds normally rely on it — add it as a 'keep at least' goal if that
   matters."`

4. **Warn only. Do not auto-protect.** The optimizer should not silently
   override what the user asked for. Surfacing the consequence is enough, and it
   keeps the tool honest rather than opinionated.

## Open questions — need owner input

- **Threshold.** What drop warrants a warning? A flat percentage below baseline
  is simple but wrong for stats that legitimately go to zero. Some stats may
  need absolute floors instead.
- **The vitals list itself.** This needs game knowledge, not repo knowledge.
  Which stats genuinely make a build unfieldable if they collapse, per archetype?
  The ten imported parity builds are the only empirical reference available, and
  they cover eight weapon pairs of forty-five.
- **Baseline choice.** `objectiveBaseline` is a scratch starting build, which may
  be a weak reference. The imported builds are stronger references but exist for
  only eight pairs. Worth deciding which is the honest comparison.

## Non-goals

- Not a constraint. It must not change which build the optimizer returns.
- Not a legality check. These builds are legal; they are just unwise.
- Not a replacement for floors. A user who wants a guarantee should declare an
  `at_least` goal; this only tells them when they should have.
