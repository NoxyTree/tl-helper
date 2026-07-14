# Calculation completeness roadmap

Date: 2026-07-14

Branch: `codex/calculation-consistency-release`

Time-of-day implementation snapshot: `snapshot/time-of-day-pre-implementation-20260714` at commit `982197a6dcc581fedc8503577521a1374fbe1154`.

## What can be claimed now

The shared calculator is the authority for retained persistent static build totals across Armory, Tracker, Gear Viewer, Full Build Optimizer, Build From Scratch, BuildSnapshot, and Combat Lab prefills.

Current closed-world inventories are:

| Family | Inventory | Current status |
|---|---:|---|
| Equipment and artifact set breakpoints | 151 across 78 sets | Every breakpoint classified; exact persistent components implemented or explicitly unsupported |
| Weapon passives | 80 | Every ID classified exactly once |
| Non-structured mastery | 193 | Every ID classified exactly once; 33 persistent mappings across unified and weapon mastery |
| Innate item and selectable perk complexes | 294 | Every ID classified exactly once |
| Conditional source components | 531 | 13 exact scenario rules executable; 518 explicitly non-executable and fail-closed |

Selected skills and masteries are active only for equipped weapon families. Unified mastery is global. Build From Scratch can temporarily supply its requested weapon families to the same calculator while it constructs progression before concrete weapons are equipped. That override is local to scratch evaluation and does not change normal build calculation.

This is not yet an exact live-combat simulator, and bounded optimizer search is not yet a mathematical certificate of the global optimum.

## Remaining work, in dependency order

### 1. Close the two persistent-static evidence gaps

1. Malakar's Blazing Wind needs one solo stat-panel comparison with the core selected and unselected. The value, weapon requirement, aura radius, party target, and stack cap are exact. Only owner inclusion is unresolved.
2. Instinct and Restraint, `GT_Hero_Attack_01`, needs the calibration matrix already specified in the passive and mastery audit. Its rates and Eclipse reversal are exact, but endpoint materialization needs percentage Defense semantics, Base Damage hand scope, stacking order, and signed rounding.

Until those tests exist, both remain fail-closed or provisional. Neither can silently improve an exact optimizer result.

### 2. Promote conditional effects one mechanic family at a time

The scenario contract must grow by evidence-backed dimensions, not by parsing tooltip prose into guessed formulas. Recommended order:

1. Time-of-day state. Ordinary day and night are now exact for Kowazan's Bombing and Kowazan's Madness. Unsupported phases and shared older Kowazan controllers fail closed.
2. Self Health or Mana thresholds. CombatScenario v2 and the three optimizer-facing pages now carry optional participant-owned resource ratios. Critical Equilibrium and Tranquil Will are exact and executable. Absolute resource amounts and target-resource rules remain separate future work.
3. Source moving and stationary state is now exact for Rapidfire Stance, Battle Tempo, Asceticism, Aridus's Fury, and Stigma Executor. Position remains excluded because no remaining direction-only source is executable from direction alone.
4. Recent movement-skill use and other short-lived source events are the next mechanic family.
5. Party size, nearby allies, aura ownership, and recipient rules.
6. Skill-use, control, weaken, collision, and active-weapon state.
7. Stacks, proc chance, cooldown, duration, refresh, and uptime policy.
8. Target defenses, resistances, debuffs, immunities, and PvE or PvP mode.

For each family, add a closed-world schema, decoded rule definitions, source-weapon gating, legality behavior, cache fingerprinting, exact trace output, cross-page integration tests, and fail-closed handling for every unresolved member.

### 3. Add final combat resolution as a separate calibrated layer

Static stats and scenario overlays are inputs to combat resolution, not substitutes for it. The following still need decoded or controlled-test evidence:

- main-hand and off-hand Base Damage selection;
- skill coefficient and component selection;
- hit, evasion, critical, heavy attack, glance, block, and defense resolution;
- bonus damage, skill damage, PvE and PvP modifiers, resistances, and mitigation order;
- caps, minimums, signed arithmetic, intermediate precision, and final rounding;
- damage-over-time, healing-over-time, shields, cooldowns, and duration timing.

Each formula stage must be labeled exact, derived, calibrated, modeled, or unsupported. Server-only behavior must not be presented as exact.

### 4. Make progression choice finalist-aware

Scratch progression now scores all mapped persistent mastery effects and mastery-to-passive interactions through the canonical calculator. The next deterministic improvement is:

1. Produce bounded gear and attribute finalists.
2. Re-optimize passives and mastery once against each finalist's equipped items and allocated attributes.
3. Recalculate and rerank those finalists once.
4. Preserve the same weapon-family, legality, point-budget, skill-cap, and Achievement-priority rules.

This closes the known weakness where a gear-dependent or attribute-threshold mastery is initially valued against a naked zero-attribute scratch build.

### 5. Separate exact arithmetic from search optimality

Every retained finalist is already recalculated by the canonical calculator. The search itself uses bounded candidate caps, beam width, attribute seeds, set-completion hints, and rune refinement. Therefore the present UI correctly says `best loadout found`, not `global optimum`.

To claim an absolute item choice for a fixed scenario and objective, implement either:

- an exact mixed-integer or constraint solver with a reproducible optimality certificate; or
- exhaustive enumeration for a sufficiently reduced and proven-complete candidate space.

The objective must name the scenario, ranked stats, caps, minimums, attribute budget, owned-item restrictions, rune policy, weapon pair, progression budget, and game build. There is no scenario-independent universally best build.

### 6. Certify every consuming page and data boundary

Maintain one page matrix that proves:

| Surface | Required authority |
|---|---|
| Armory and Tracker | Canonical totals, traces, legality, active weapon-family progression |
| Gear Viewer | Complete replacement build, set changes, selected core, scenario fingerprint, legal candidate |
| Full Build Optimizer | Canonical finalist arithmetic, scenario-aware objective, progression compatibility, explicit bounded-search warning |
| Build From Scratch | Requested-family scratch context, legal exact point spending, finalist-aware progression rerank |
| BuildSnapshot | Versioned canonical IDs, game-build identity, calculation context, migration and drift rejection |
| Combat Lab | Legal snapshot prefill, correct ability hand, reviewed coefficient, explicit scenario, separate resolution provenance |

Every projection rebuild must retain the warehouse receipt, semantic hashes, contract counts, and game-build identity. CI should fail on any unclassified new set, passive, mastery, perk, conditional source, stat ID, or formula binding.

## Definition of fully mapped

A source is fully mapped only when its carrier, activation requirements, recipients, value formula, units, caps, thresholds, stack and exclusivity rules, duration, weapon scope, scenario inputs, provenance grade, and page behavior are all explicit. Unknown behavior is a supported state and must fail closed.

A build recommendation is absolute only within a fully specified scenario and objective, with legal inputs, exact or explicitly calibrated calculation stages, and a search optimality certificate. Without all three, the honest claim remains exact retained-build arithmetic plus the best legal loadout found by bounded search.
