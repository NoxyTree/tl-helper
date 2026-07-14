# Item Potential Exclusion Review

- Date: 2026-07-14
- Game data build: `24118850`
- Branch: `codex/calculation-consistency-release`
- Pre-implementation snapshot: `snapshot/item-potential-skills-pre-implementation-20260714` at `f3ad237`

## Decision

Item Potentials are deferred as one complete mechanic for the initial calculation release. No Item Potential outcome or level-`21` increment contributes value. A stored Ascended level-`21` selection remains preserved, while released calculations evaluate that skill at the normal level-`20` cap.

This is an explicit scope boundary, not an unsupported value silently treated as zero. The canonical calculation context is `itemPotentials: "excluded"` under ruleset `persistent-static-v3` and calculator version `3`.

## Projected inventory

The generated equipment projection is pinned by tests to:

| Measure | Count |
| --- | ---: |
| Potential pools | 3 |
| Carrier items | 193 |
| Stat rows | 20 |
| Skill rows | 180 |
| Unique skill outcome IDs | 180 |

Carrier distribution is `80` weapon, `49` accessory, and `64` equipment records. Stat-row distribution is `4/8/8`; skill-row distribution is `60/60/60`.

## Canonical behavior

1. Known stat and skill potential IDs remain stored on the item selection.
2. Questlog import, Armory persistence, BuildSnapshot serialization, and cache fingerprints retain those raw IDs.
3. Known potential IDs are legal, visible as excluded, and produce an ignored `item_potential_excluded` issue.
4. Unknown potential IDs remain invalid and can be cleared from Armory.
5. Stat outcomes contribute zero to every stat total.
6. Skill outcomes create no passive, mastery, scenario, or Combat Power contribution.
7. Raw Ascended skill level `21` is preserved, but `effectiveProgression()` resolves it at `20` and emits ignored issue `item_potential_skill_level_excluded`.
8. Optimizers never enumerate Item Potential choices. A generated configuration of the same item preserves its stored ID so a recommendation cannot silently erase user data; a different item never inherits it.
9. Manual Combat Lab release selection stops at level `20`. Its decoded formula projection can still inspect level `21` outside the released build-calculation path.

## Surface behavior

| Surface | Behavior |
| --- | --- |
| Armory | Preserves and identifies stored stat or skill outcomes, disables new selection, exposes a clear action, and labels totals as excluding Item Potentials |
| Tracker | Resolves the same canonical build and labels static totals as excluding Item Potentials |
| Gear Viewer | Does not enumerate potential variants, preserves the same item's stored choice, and discloses the exclusion in ranking status |
| Full Build Optimizer | Does not score or enumerate potentials, preserves same-item choices, and includes the exclusion in result assumptions |
| Build From Scratch | Generates no potential choices and distinguishes Overall Mastery named Potential from Item Potentials |
| BuildSnapshot | Owns the versioned exclusion context and re-resolves older snapshots through current authority |
| Combat Lab | Accepts only the exclusion context for build prefills and caps the release skill picker at level `20` |

## Evidence and tests

- `scripts/tests/item-potential-exclusion.test.mjs`
- `scripts/tests/item-potential-projection.test.mjs`
- `scripts/tests/persistence.test.mjs`
- `scripts/tests/combat-lab-model.test.mjs`
- `scripts/tests/combat-lab-build-inputs.test.mjs`
- `scripts/verify-build-snapshot.mjs`

The focused exclusion suite proves equal totals and Combat Power for potential-selected versus unselected builds, raw level-21 preservation with effective level-20 resolution, scenario-source exclusion, BuildSnapshot v1 migration and v2 re-resolution under the current v3 static ruleset, cross-page disclosure, projection drift detection, import and persistence round-trips, and Combat Lab release capping.

## Future support gate

Changing the calculation context from `excluded` requires a decoded closed-world classification for all `180` skill outcomes, exact weapon and activation gates, mutually exclusive candidate enumeration, scenario behavior, canonical optimizer integration, and cross-page regression fixtures. Partial support is not an acceptable release state.
