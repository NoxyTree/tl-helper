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
| Conditional source components | 534 | 22 exact scenario rules executable; 512 explicitly non-executable and fail-closed |

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
4. Seven deterministic source-event effects are now exact at the evaluation instant for a confirmed successful qualifying activation: Shadow Walker, Nimble Steps, Barbarian's Dash, its Steadfast Rush augmentation, Enduring Dash, Mirage Dancer's Mobility branch, and Blizzard Overture 4-piece. CombatScenario v4 records observed event history, and these rules execute only at `occurredAgoMs: 0`. Elapsed duration and positive Buff Duration are not modeled, so aged events fail closed. Cooldown-bearing triggers, activation locks, refresh behavior, and uptime also remain unsupported.
5. Party size and nearby allies are now represented by CombatScenario v5. Distorted Sanctuary and Shielded by Unity are exact. Aura ownership, recipient propagation, and other social effects remain separate future work.
6. Skill-use, control, weaken, collision, and active-weapon state.
7. Stacks, proc chance, cooldown, duration, refresh, and uptime policy.
8. Target defenses, resistances, debuffs, immunities, and PvE or PvP mode.

For each family, add a closed-world schema, decoded rule definitions, source-weapon gating, legality behavior, cache fingerprinting, exact trace output, cross-page integration tests, and fail-closed handling for every unresolved member.

### 3. Deferred: implement Item Potentials as one complete mechanic

The release contract now excludes every Item Potential outcome consistently rather than applying stat outcomes while omitting skill outcomes. Current projection inventory is `3` pools, `193` carrier items, `20` stat rows, and `180` unique skill rows. Known choices and raw Ascended skill level `21` remain stored for forward compatibility, but all release calculations use zero potential value and the normal skill cap of `20`.

Future implementation remains a separate post-release tranche:

1. Decode and classify every potential skill outcome as persistent, scenario-conditional, or unsupported.
2. Retain the existing one-choice item selection contract for mutually exclusive stat or skill outcomes.
3. Apply selected persistent potential skills through the shared passive-effect authority and weapon/item gates.
4. Enumerate legal potential choices in Gear Viewer, Full Build Optimizer, and Build From Scratch.
5. Add canonical cross-page, import, snapshot, legality, and optimizer-finalist fixtures before changing `itemPotentials: "excluded"` to a supported calculation mode.

No potential outcome may receive value from tooltip prose or an optimistic hint before it has an executable decoded rule.

### 4. Add final combat resolution as a separate calibrated layer

Static stats and scenario overlays are inputs to combat resolution, not substitutes for it. The following still need decoded or controlled-test evidence:

- main-hand and off-hand Base Damage selection;
- skill coefficient and component selection;
- hit, evasion, critical, heavy attack, glance, block, and defense resolution;
- bonus damage, skill damage, PvE and PvP modifiers, resistances, and mitigation order;
- caps, minimums, signed arithmetic, intermediate precision, and final rounding;
- damage-over-time, healing-over-time, shields, cooldowns, and duration timing.

Each formula stage must be labeled exact, derived, calibrated, modeled, or unsupported. Server-only behavior must not be presented as exact.

### 5. Implemented: finalist-aware progression choice

Scratch progression scores all mapped persistent mastery effects and mastery-to-passive interactions through the canonical calculator. It now:

1. Produces bounded gear and attribute finalists.
2. Re-optimizes passives and mastery once against four fast or eight thorough diverse finalists using each finalist's fixed equipped items and allocated attributes.
3. Rejects non-legal refinements, then recalculates and reranks the retained finalists once.
4. Preserves the same weapon-family, legality, point-budget, skill-cap, and Achievement-priority rules.

This closes the known weakness where a gear-dependent or attribute-threshold mastery was valued only against a naked zero-attribute scratch build. It remains a bounded second pass, not an exhaustive progression proof.

The progression allocator now singleton-evaluates every unlocked unified mastery, then enumerates legal subsets of positive representable nodes up to the cap of four. Current executable proof covers persistent Potential and scenario-valued Shielded by Unity; unsupported nodes receive no invented value.

### 6. Separate exact arithmetic from search optimality

Every retained finalist is already recalculated by the canonical calculator. The search itself uses bounded candidate caps, beam width, attribute seeds, set-completion hints, and rune refinement. Therefore the present UI correctly says `best loadout found`, not `global optimum`.

To claim an absolute item choice for a fixed scenario and objective, implement either:

- an exact mixed-integer or constraint solver with a reproducible optimality certificate; or
- exhaustive enumeration for a sufficiently reduced and proven-complete candidate space.

The objective must name the scenario, ranked stats, caps, minimums, attribute budget, owned-item restrictions, rune policy, weapon pair, progression budget, and game build. There is no scenario-independent universally best build.

### 7. Certify every consuming page and data boundary

Maintain one page matrix that proves:

| Surface | Required authority |
|---|---|
| Armory and Tracker | Canonical totals, traces, legality, active weapon-family progression |
| Gear Viewer | Complete replacement build, set changes, selected core, scenario fingerprint, legal candidate |
| Full Build Optimizer | Canonical finalist arithmetic, scenario-aware objective, progression compatibility, explicit bounded-search warning |
| Build From Scratch | Requested-family scratch context, legal exact point spending, implemented bounded finalist-aware progression rerank |
| BuildSnapshot | Versioned canonical IDs, game-build identity, calculation context, migration and drift rejection |
| Combat Lab | Legal snapshot prefill, correct ability hand, reviewed coefficient, explicit scenario, separate resolution provenance |

Every projection rebuild must retain the warehouse receipt, semantic hashes, contract counts, and game-build identity. CI should fail on any unclassified new set, passive, mastery, perk, conditional source, stat ID, or formula binding.

## Definition of fully mapped

A source is fully mapped only when its carrier, activation requirements, recipients, value formula, units, caps, thresholds, stack and exclusivity rules, duration, weapon scope, scenario inputs, provenance grade, and page behavior are all explicit. Unknown behavior is a supported state and must fail closed.

A build recommendation is absolute only within a fully specified scenario and objective, with legal inputs, exact or explicitly calibrated calculation stages, and a search optimality certificate. Without all three, the honest claim remains exact retained-build arithmetic plus the best legal loadout found by bounded search.
