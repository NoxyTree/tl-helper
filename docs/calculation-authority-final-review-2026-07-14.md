# Persistent Static Calculation Authority: Final Review

Date: 2026-07-14  
Game data build: `24118850`  
Branch: `codex/calculation-consistency-release`  
Pre-implementation snapshot: `snapshot/calculation-pre-implementation-20260714` at `a1a67c6`

## Outcome

The shared calculator is now the authority for persistent static build totals and item-choice scoring across Armory, Tracker, Gear Viewer, Full Build Optimizer, Build From Scratch, saved BuildSnapshots, and Combat Lab build prefills.

Every projected set breakpoint and passive-like effect has an explicit machine-checked classification. Unknown or changed records fail the canonical contract instead of being inferred from tooltip wording or silently treated as zero.

The release claim is intentionally limited to persistent static build state. It does not claim exact live encounter outcomes for triggers, target state, party state, position, active buffs, procs, damage mitigation order, or server rounding.

## What is included in persistent static totals

- Equipped items and exact item levels
- Inherent item stats
- Normal and Heroic traits
- Selected Heroic effects and levels
- Trait Resonance
- Item Potential
- Normal and Chaos runes
- Rune synergies
- Artifacts and artifact sets
- Equipment sets, including structured and mapped passive breakpoints
- The decoded set-exclusivity winner rules
- Allocated attributes and attribute breakpoints
- Passive skills for the two equipped weapon families
- Structured weapon mastery for the two equipped weapon families
- Mapped passive mastery and Achievement effects
- Overall Mastery effects
- Selected persistent Skill Cores and innate item passives
- Decoded persistent passive-to-mastery transformations

## Canonical effect coverage

### Item sets

The set contract covers `78` sets and `151` breakpoints.

| Classification state | Count |
| --- | ---: |
| Confirmed incorrect | 0 |
| High risk | 0 |
| Review | 0 |
| Explicit combat-conditional unsupported | 9 |

The nine unsupported breakpoints are retained in the set topology and calculation trace. They are not applied as always-on stats.

### Weapon passive skills

| Semantic class | Count |
| --- | ---: |
| Persistent static and mapped | 18 |
| Conditional or combat-scoped | 62 |
| Total | 80 |

### Non-structured mastery effects

| Semantic class | Count |
| --- | ---: |
| Persistent static and mapped | 33 |
| Persistent but currently unrepresentable | 1 |
| Conditional or combat-scoped | 159 |
| Total | 193 |

`GT_Hero_Attack_01` is the sole persistent unrepresentable mastery. Its percentage Defense and Base Damage state reversal cannot be materialized honestly by the present flat-stat sheet model, so a selected build is provisional rather than receiving invented values.

### Item and Skill Core passive complexes

| Semantic class | Count |
| --- | ---: |
| Persistent static and safely mapped | 6 |
| Persistent owner semantics unresolved | 1 |
| Decoded source conflict | 1 |
| Unresolved decoded join | 1 |
| Conditional, proc, scenario, or skill-scoped | 285 |
| Total | 294 |

The six executable persistent complexes are Dark Wing's Bulwark, Dark Wing's Power, Mind's Eye, Eye of the Storm, Wind's Guidance, and Southpaw.

The three deliberately blocked item uncertainties are:

1. Malakar's Blazing Wind: owner inclusion is not proven.
2. Orthodox: the projection value `90` conflicts with decoded formula value `40`.
3. Primal Brothers' Thunder Strike: the exact complex-to-simple decoded join remains missing.

Aridus remains explicitly conditional and is not applied as a persistent Staff stat.

## One legality and authority model

`calculateBuild()` returns a shared status:

- `legal`: all persistent static inputs are authoritative.
- `provisional`: totals can be displayed, but an unresolved or assumed input prevents exact ranking or prefill.
- `invalid`: the stored configuration is impossible, malformed, or violates a decoded rule.

Armory and Tracker may display labeled provisional totals so users can repair a build. Gear Viewer, Full Build Optimizer, Build From Scratch final results, and Combat Lab prefills accept only legal calculations.

Final candidate legality is checked on complete builds. Gear Viewer no longer validates only an isolated item fragment, and both optimizers recalculate finalists through the shared authority.

## Progression rules now enforced

- Only passive skills and weapon mastery belonging to equipped weapon families affect totals.
- Foreign saved selections remain stored but inactive so a weapon swap is non-destructive.
- Canonical skill type defeats stored active, passive, or defensive type spoofing.
- Active skill cap `12` and defensive skill cap `1` use shipped-client structure.
- Passive skill cap `8` remains visibly derived pending a numeric client setting or in-game confirmation.
- Normal mastery levels are `1` through `10`; Achievement levels are exactly `1`.
- Each weapon has a decoded `220` point limit.
- Tier prerequisites, top-two Achievement selection, hybrid-category accounting, Epic prerequisites, and Epic-to-Achievement matching are enforced.
- Overall Mastery cap `4` and the exact Destruction Spear versus Piercing Spear exclusion are enforced.
- Overall Mastery unlock levels are checked when selections exist. Missing level data makes the build provisional.
- Armory now exposes an Overall Mastery Level input. Build From Scratch records the required level when its explicit Potential option is enabled.

## Input validation now enforced

- Attribute IDs are restricted to STR, DEX, INT, PER, and CON.
- Attribute allocations must be nonnegative whole numbers and total no more than `59`.
- Arbitrary attribute keys cannot inject other stats.
- Unknown or wrong-slot items are invalid.
- Item levels, traits, Heroic effects, Resonance, Potential, and Skill Core selections are checked against the selected item.
- Rune IDs, stats, levels, equipment category, Chaos cap, and three-socket cap are checked across equipment, artifacts, and support slots.
- Three equal normal runes remain legal by design; only more than three sockets or multiple Chaos runes are rejected.
- Malformed skill levels, specialization collections, duplicate specializations, mastery levels, and unified mastery IDs become non-legal.
- Duplicate items, repeated passive complexes, and assumed Heroic group caps remain provisional until their runtime stacking or cap semantics are proven.

## BuildSnapshot v2

BuildSnapshot v2 stores raw build state and allocated attributes while treating resolved totals as a derived cache.

- Game build, character level, ruleset, and calculator version are code-owned.
- Deserialization ignores serialized totals and recalculates through current rules.
- Current-looking plain objects are recalculated before `isBuildSnapshot()`, `snapshotStat()`, or serialization accepts them.
- Nonfinite malformed input cannot be converted into a legal default or collide with a legal calculation fingerprint.
- The calculation context explicitly identifies persistent static mode, included set effects, and excluded dynamic effects.

## Cross-surface behavior

### Armory

Uses the shared calculator for totals, sources, set traces, passive rules, legality, and Combat Power display. It retains invalid or provisional data for repair and labels the authority state.

### Tracker

Uses the same current Armory calculation and visibly labels legal, provisional, or invalid static totals.

### Gear Viewer

Uses complete replacement deltas, set-aware totals, exact selected Skill Core variants, a canonical build and ruleset cache fingerprint, source-build legality gates, item-level contract gates, and complete candidate-build legality gates.

### Full Build Optimizer

Locks existing weapon families so saved progression cannot be carried into another weapon family. It enumerates decoded-proven persistent core variants, preserves set-completion routes, and rejects non-legal final candidates.

### Build From Scratch

Builds progression for its selected weapon pair, allocates legal mastery, records explicit Overall Mastery Potential state, and refuses a non-legal final or tradeoff build.

### Combat Lab

Only legal BuildSnapshots can prefill. Ability data and static data must use the same game build. Base Damage is taken only from the hand containing the ability's required weapon family; selecting the other hand is rejected and resynchronized. Missing weapon context falls back to visibly manual input.

Combat Lab remains a reviewed coefficient and scenario surface, not an exact final-damage authority.

## Remaining evidence-dependent uncertainties

These are explicit and do not silently enter exact item ranking:

1. Passive skill capacity `8` is derived rather than numerically decoded.
2. Same passive complex stacking across separate gear slots is unresolved.
3. Heroic equipment-group caps remain an assumed rule and make conflicting builds provisional.
4. Blazing Wind owner inclusion, Orthodox's source conflict, and Primal Brothers' missing decoded join remain unresolved.
5. Conditional effects need a future scenario contract before they can influence optimizer scoring.
6. Combat Power remains a fitted Questlog-parity heuristic rather than a decoded official game formula.
7. Final damage, defense, block, live rolls, modifier order, and server rounding remain outside the persistent static claim.

## Verification

- Node test suite: `464/464`
- Reference build assertions: `69/69`
- Edge cases: `12/12`
- BuildSnapshot v2 authority and migration verification: passed
- Set audit: `78` sets, `151` breakpoints, no incorrect or review classifications
- Passive-effect contract: `80 + 193 + 294 = 567` effects, every ID classified exactly once
- Passive registry binding audit: passed
- Complete candidate legality regressions: passed
- Diff whitespace check: passed
- Local HTTP smoke: all six calculation pages plus `tl-core.js` and the passive contract returned `200`
- In-app visual smoke: not completed in this session because the browser-control transport was unavailable

## Primary review files

- `web/tl-core.js`
- `web/tl-questlog-rules.js`
- `web/tl-passive-effect-contract.js`
- `web/tl-build-snapshot.js`
- `web/tl-full-build-adapter.js`
- `web/tl-progression-optimizer.js`
- `web/index.html`
- `web/tracker.html`
- `web/gear-viewer.html`
- `web/build-from-scratch.html`
- `web/combat-lab.js`
- `web/combat-lab-build-inputs.js`
- `scripts/tests/canonical-set-effects.test.mjs`
- `scripts/tests/canonical-passive-effects.test.mjs`
- `scripts/tests/calculation-status.test.mjs`
- `scripts/tests/gear-viewer-calculation-status.test.mjs`
- `scripts/verify-build-snapshot.mjs`

## Review criterion

The persistent static release is acceptable if a reviewer confirms that:

1. Every executable persistent rule has decoded, derived, calibrated, or modeled provenance.
2. Every projected set and passive-like effect belongs to exactly one explicit class.
3. Conditional effects are excluded without being mistaken for missing persistent rules.
4. Provisional or invalid inputs cannot enter exact Gear Viewer, optimizer, or Combat Lab build-derived results.
5. All build-consuming surfaces use the same game build, calculator, and context fingerprint.
