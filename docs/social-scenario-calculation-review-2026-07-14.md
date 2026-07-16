# Party and proximity calculation review

Date: 2026-07-14
Game build: `24118850`
Branch: `codex/calculation-consistency-release`
Pre-implementation snapshot: `snapshot/party-aura-pre-implementation-20260714` at `97b50be`

## Outcome

The shared calculator now evaluates two decoded-exact source social effects at a selected timestamp:

1. **Distorted Sanctuary**, including its additional nearby-party-member contribution at passive levels 1 through 20.
2. **Shielded by Unity**, including its exact zero, one, two, and capped three-or-more allied-player bands.

Combat Sanctuary correctly replaces both the persistent one-member Distorted Sanctuary stats and its scenario remainder with the decoded level-scaled Accuracy and Attack Range curves.

Static totals remain the default. Party and proximity effects are added only through a versioned combat scenario. Missing required observations never become zero and never receive estimated uptime.

## Calculation contract

`CombatScenario` schema version 5 adds participant-owned social facts:

- `party`: unspecified, or an observed total including the participant.
- `proximity`: unspecified, or explicitly observed count rows identified by cohort, comparator and exact radius.

The contract rejects unknown fields, duplicate tuples, impossible party bounds, decreasing counts at larger radii, contradictory `<` versus `<=` observations, and noncanonical values. Schema versions 1 through 4 migrate with social state unspecified and cannot smuggle version-5 fields.

Page controls expose:

- total party members including self;
- other party players within 4m;
- additional other party players above 4m through 16m;
- allied nonparty players within 4m.

Blank means unknown. An entered zero is an observed zero. The additional 4m-through-16m field requires the within-4m observation because the current contract stores cumulative radius counts, not annular counts. Invalid or inconsistent inputs block scenario scoring instead of falling back to static ranking.

## Decoded rules

### Distorted Sanctuary

Source ID: `SkillSet_WP_BO_S_AuraDefenceUp`
Required weapon: Bow
Radius: 16m
Count: party members including the source, maximum six

The persistent calculator owns the one-member source baseline. The scenario evaluator adds only:

`per-member raw value at selected passive level * observed other party players within 16m`

Decoded per-member level curves are stored in `web/tl-distorted-sanctuary-data.js` and independently fingerprinted in the test suite. The build-24118850 formula-table review confirmed all 20 values and all six cumulative party bands.

At level 20, each counted member contributes:

- All Critical Defense: `660` raw
- Continuous Healing: `660` raw

### Combat Sanctuary replacement

Mastery ID: `Bow_Normal_Tac_Skill`

When selected with Distorted Sanctuary, it replaces both original stats for the source baseline and scenario remainder. At level 20, each counted member contributes:

- All Accuracy: `440` raw
- Attack Range modifier: `75` raw

The previous static mapping incorrectly used these level-20 values at every passive level. It now uses the exact level 1 through 20 curves shared with the scenario evaluator.

### Shielded by Unity

Unified mastery ID: `WM_Common_SKILL_020`
Radius: 4m
Count: allied players excluding the source
Cap: three players

Exact formula:

`min(other party within 4m + allied nonparty within 4m, 3) * 500 raw Shield Received`

Decoded bands are `500`, `1000` and `1500` raw. The effect is sourced only from active unified mastery. A known insufficient or malformed Overall Mastery Level excludes the node from both persistent and scenario calculations. An unknown level remains explicitly provisional under the existing calculation-status contract.

## Shared calculation surfaces

The same canonical scenario reaches:

- Armory calculation authority and saved-build evaluation;
- Gear Viewer candidate and slot-delta scoring;
- Full Build Optimizer current, candidate, finalist and tuning calculations;
- Build From Scratch worker, finalist, result and tuning calculations.

Scenario state remains transient. It is included in scenario fingerprints, cache identity and optimizer requests, but not written into static Armory or preset builds.

## Catalogue and unsupported boundary

The conditional-effect catalogue now contains:

| State | Count |
| --- | ---: |
| Total components | 534 |
| Decoded scenario-executable | 22 |
| Explicitly non-executable | 512 |
| Persistent static component only | 14 |
| Whole static-calculator unsupported | 9 |

The catalogue newly records:

- Distorted Sanctuary as an executable conditional remainder;
- Shielded by Unity as an executable unified-mastery rule;
- Impenetrable's higher nearby-target bands as a non-executable conditional remainder;
- Divine Apostle's outgoing ally aura as a non-executable conditional remainder.

Party auras, recipient propagation, proc duration, uptime and target-count mechanics remain unsupported unless their complete trigger and recipient state are represented. No tooltip prose is converted into an executable rule automatically.

## Independent review findings resolved

Three independent reviews identified and verified fixes for:

- Gear Viewer silently reverting to static ranking when social controls were invalid;
- an additional 4m-through-16m value being retained in controls but absent from the canonical scenario;
- locked or malformed Overall Mastery selections still reaching scenario sources;
- Shielded by Unity inheriting Distorted Sanctuary's one-member static-baseline precision claim;
- stale canonical contract expectations after adding two mixed passive components;
- executable catalogue metadata incorrectly describing party total as mandatory;
- shared implementation and expected arrays lacking an independent decoded-data drift pin;
- the standalone evaluator accepting malformed party or proximity union shapes when called outside the normalized build path;
- the standalone evaluator accepting custom-prototype social records that the canonical plain-object contract rejects;
- the combat-engine package index omitting the four public party and proximity enums.

All findings are covered by regression tests.

## Verification

- Full repository suite at the end of the social-scenario tranche: `676/676` passed. The later final integrated calculation-release suite passed `718/718`.
- Focused social, catalogue, contract, page and calculation regressions: `102/102` passed.
- Reference builds: `69/69` asserted totals passed.
- Edge-case verifier: `12/12` passed.
- BuildSnapshot v2 authority and migration verifier: passed.
- Package and browser `combat-scenario.mjs`: byte identical.
- Generated `web/data/scenario-effects.json`: deterministic and checked against a second generation.
- Clean local HTTP host: all three scenario pages, the shared calculator, both new social modules, decoded social data and generated catalogue returned `200` with the expected file types.
- JavaScript module syntax checks: passed.
- `git diff --check`: passed.
- In-app visual smoke remains unavailable because the browser-control transport did not connect; no visual-pass claim is made.

## Remaining calculation release priorities

This was the status at the end of the social-scenario tranche. The later calculation release deliberately excludes every Item Potential outcome under a versioned `itemPotentials: "excluded"` context, preserves raw selections, and resolves Ascended level `21` at the normal level-`20` cap. Full Item Potential implementation is deferred rather than a release blocker.

Later optimizer work completed both follow-ups: Build From Scratch now evaluates every unlocked unified mastery, with executable proof for Potential and Shielded by Unity, and runs one bounded gear-aware progression pass against four fast or eight thorough diverse finalists before reranking once. This remains bounded-search evidence, not a global-optimum certificate.

## Reviewer entry points

Read these files together:

- `web/tl-distorted-sanctuary-data.js`
- `web/tl-social-scenario-effects.js`
- `web/tl-social-scenario-controls.js`
- `web/tl-questlog-rules.js`
- `web/tl-core.js`
- `packages/combat-engine/src/combat-scenario.mjs`
- `scripts/lib/scenario-effect-catalog.mjs`
- `scripts/tests/build-social-scenario-integration.test.mjs`
- `scripts/tests/social-scenario-effects.test.mjs`
- `scripts/tests/social-scenario-controls.test.mjs`
- `scripts/tests/scenario-effect-catalog.test.mjs`

Preserve the distinction between persistent static, decoded-exact scenario, derived, modeled and unsupported stages. Do not promote additional social effects without decoded trigger, recipient, count, duration and stacking evidence.
