# Evaluation-instant source-event calculation review

Date: 2026-07-14

Game data build: `24118850`

Branch: `codex/calculation-consistency-release`

Pre-implementation snapshot: `snapshot/movement-skill-events-pre-implementation-20260714`, resolving to commit `8902942`

## Outcome

CombatScenario v4 adds participant-owned observed event history. Seven decoded deterministic effects can now influence scenario totals and item-choice scoring at the exact instant of a confirmed successful qualifying ability activation:

| Component | Carrier | Qualifying category | Exact activation-instant result |
| --- | --- | --- | --- |
| Shadow Walker | Selected Dagger passive, ranks 1 to 20 | Mobility or Movement | Rank-specific Ranged Evasion, Magic Evasion, and Damage Reduction |
| Nimble Steps | Selected Spear passive, ranks 1 to 20 | Movement | Rank-specific Collision Resistance, Bind Tolerance, and Ranged Evasion |
| Barbarian's Dash | Selected Greatsword passive, ranks 1 to 20 | Mobility or Movement | Rank-specific Move Speed |
| Steadfast Rush, Barbarian's Dash augmentation | Selected Greatsword mastery with Barbarian's Dash | Mobility or Movement | Raw `4800` All State Tolerance, expanded to `+120` for each of eight control-resistance stats |
| Enduring Dash | Selected Spear mastery | Movement | Raw `2500` Melee, Ranged, and Magic Critical Defense |
| Mirage Dancer | Selected Crossbow mastery, ranks 1 to 10 | Mobility | Rank-specific Magic and Ranged Evasion |
| Blizzard Overture 4-piece | Active set breakpoint | Mobility | Raw `1000` Attack Speed and raw `1400` Heavy Attack Damage, in addition to its separately calculated persistent Cooldown Speed component |

The overlay never mutates persistent static totals. `calculateBuild().stats` remains the static authority; a supported event scenario adds `scenarioEffects` and `scenarioStats`.

## Exact boundary

An executable event record must state:

- `kind: "ability_use"`
- `outcome: "successful_activation"`
- `occurredAgoMs: 0`
- one equipped triggering weapon family
- a nonempty category set containing Mobility, Movement, or both

The generic passive and mastery triggers may be activated by a qualifying skill from either equipped weapon. The carrier passive or mastery still requires its own weapon family to be equipped. This separation follows the decoded trigger graph, which contains the carrier weapon gate but no same-weapon restriction on the qualifying activation.

The page controls intentionally create only this exact age-zero shape. They do not expose elapsed age.

## Closed-world contract

CombatScenario v4 validates, canonicalizes, sorts, and freezes event history. It rejects:

- unknown fields or event kinds;
- an unrecognized outcome;
- foreign triggering weapons;
- duplicate event IDs, sequences, or categories;
- negative ages or ages outside the declared lookback window;
- empty category arrays;
- cooldown state or other undeclared semantics.

CombatScenario v1 through v3 migrate to v4 with event history explicitly unspecified. Event history participates in scenario fingerprints and cache identity. Candidate rebinding preserves a compatible triggering weapon and rejects a scenario when that weapon is no longer equipped.

## Fail-closed behavior

When a build contains a relevant event source:

- unspecified or irrelevant event history produces an unsupported scenario;
- a qualifying event older than zero milliseconds produces `unsupported_event_duration`;
- an invalid source level or foreign carrier weapon produces an error;
- one unresolved event-family member clears every event-family row;
- any scenario-family error prevents the complete scenario overlay from being applied.

`includeSetEffects: false` removes the Blizzard Overture event carrier as well as persistent set processing.

## Deliberately unsupported

The following are not inferred:

- elapsed buff duration;
- the positive Buff Duration extension formula or its rounding boundary;
- refresh and replacement timing;
- cooldown availability or internal activation locks;
- proc probability or uptime;
- Nature's Power, whose internal three-second lock or refresh behavior is unresolved;
- Lightning Strike, which has an explicit cooldown and a separate aura;
- Spatial Rush, whose attribute-dependent branch needs a reviewed scenario representation;
- Destruction Empress's Gale and Off-hand Frenzy, whose Base Damage destination is only derived in the current representation;
- Mirage Dancer's separate evasion-on-dodge Move Speed branch.

These records remain catalogued with unsupported semantics and cannot improve an exact optimizer result.

## Surface behavior

- Gear Viewer uses one canonical scenario for candidate ranking, protected-stat checks, cache identity, and hover reconstruction.
- Full Build Optimizer forwards the same scenario through worker requests, progress, results, tuning, hover calculations, and result handoff.
- Set-completion pruning evaluates a hypothetical full set against the same scenario. Blizzard Overture's supported event value can therefore preserve its four-piece route until exact complete-build scoring; an unspecified or aged event supplies no conditional hint.
- Build From Scratch constructs the event scenario against its selected weapon pair before concrete weapon items exist, then rebinds it to every candidate and final result.
- Armory, Tracker, saved presets, and BuildSnapshot remain persistent-static surfaces. They do not store transient event assertions.
- Combat Lab remains a reviewed static-prefill and coefficient surface for this milestone. It does not silently inherit an optimizer event assertion.

All exposed controls call the state a selected-timestamp or evaluation-instant result and state that no uptime is assumed.

## Primary implementation files

- `packages/combat-engine/src/combat-scenario.mjs`
- `web/vendor/combat-engine/combat-scenario.mjs`
- `web/tl-event-scenario-controls.js`
- `web/tl-event-scenario-effects.js`
- `web/tl-scenario-effects.js`
- `web/tl-core.js`
- `web/gear-viewer.html`
- `web/full-build-optimizer.html`
- `web/full-build-optimizer.js`
- `web/build-from-scratch.html`
- `web/tl-optimizer-result-handoff.js`
- `scripts/lib/scenario-effect-catalog.mjs`
- `web/data/scenario-effects.json`

## Review criteria

This tranche is acceptable only if a reviewer confirms that:

1. The seven values, rank curves, carrier gates, categories, and activation-instant boundary match their decoded records.
2. Generic triggers do not invent a same-weapon restriction, while carrier weapon gates remain enforced.
3. Aged events and Buff Duration do not enter optimizer scoring.
4. Scenario errors apply no partial rows.
5. Gear Viewer, Full Build Optimizer, and Build From Scratch score and display the same canonical scenario.
6. Armory, Tracker, BuildSnapshot, saved presets, and Combat Lab remain intentionally transient-event-free.
7. The generated catalogue reports `531` total conditional components, `20` decoded-executable components, and `511` non-executable components, with `duration` still unresolved on all seven event entries.

## Verification

- Node test suite: `647/647` passed.
- Reference builds: `69/69` assertions across three fixtures passed.
- Edge cases: all `12` passed.
- BuildSnapshot v2 verification passed.
- Event evaluator, contract, build-level integration, page wiring, worker, handoff, cache identity, candidate rebinding, and browser-contract synchronization tests passed within the full suite.
- Scenario catalogue: `531/531` components; `20` decoded-executable and `511` non-executable; regeneration was byte-identical.
- Local HTTP smoke returned `200` for all three calculation pages, the core and scenario modules, both event modules, the browser combat contract, and the generated catalogue.
- Direct module loading and inline script syntax passed for the changed modules and all three pages.
- `git diff --check` passed apart from Git's existing LF-to-CRLF checkout notices.
- In-app visual interaction could not be completed because the browser-control transport was unavailable. No visual-interaction claim is made from the HTTP and syntax checks.
- Independent review found one optimizer defect: scenario-exact set value was absent from the beam's set-completion hint, so Blizzard Overture or Stigma Executor routes could be pruned before exact scoring. The hint now evaluates hypothetical full set breakpoints against the same canonical scenario, without activating unrelated sources, and adds conditional value only when that scenario is supported.
- The reviewer rechecked the fix and reported no remaining P0, P1, or P2 calculation findings. The canonical Steadfast Rush name was aligned as the final P3 cleanup.
