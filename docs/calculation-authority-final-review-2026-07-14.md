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
| Persistent static and safely mapped | 7 |
| Persistent owner semantics unresolved | 1 |
| Decoded source conflict | 0 |
| Unresolved decoded join | 0 |
| Conditional, proc, scenario, or skill-scoped | 286 |
| Total | 294 |

The seven executable persistent complexes are Dark Wing's Bulwark, Dark Wing's Power, Mind's Eye, Eye of the Storm, Wind's Guidance, Orthodox, and Southpaw.

One item uncertainty remains deliberately blocked:

1. Malakar's Blazing Wind: owner inclusion is not proven.

Orthodox is now decoded-exact at `+40` Main Weapon Damage. The western projection value `90` is a localization binding error that references Southpaw's `_GT_02` formula instead of Orthodox's `_GT_01` formula. Primal Brothers' Thunder Strike is now an exact conditional Orb-summoning proc; its previously missing join was a case mismatch in `SkillSet_WP_Item_fieldBoss_T2_ORB_01`. Aridus and Primal Brothers remain excluded from persistent totals because both are explicitly conditional.

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
- Passive skill capacity follows decoded `TLGlobalCommon.GlobalCommonData.PassiveSkillSlotCountLevelLimits`: three slots at level 1, then four at 20, five at 25, six at 30, seven at 35, and eight at 40. The current level-60 scope therefore uses an exact cap of `8`.
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
- Duplicate item IDs remain provisional because unique-copy legality is not represented by the current catalogue.
- Repeated Equipment Skills and Skill Cores are legal but only one copy, or the highest-level copy when levels differ, activates. Build `24118850` projects one fixed rule per complex ID and no per-copy levels, so the shared calculator performs exact one-copy deduplication across innate and selected-core sources.
- The shipped Heroic equipment cap is enforced as one weapon, one armor item, and one accessory; conflicts are invalid.

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

Locks existing weapon families so saved progression cannot be carried into another weapon family. It enumerates decoded-proven persistent core variants, preserves set-completion routes, no longer rejects otherwise legal candidates merely because a conditional core ID repeats, and rejects non-legal final candidates. All seven currently mapped persistent duplicate topologies are mutually blocked by same-weapon-family or Heroic-group legality. A canonical topology test fails if a future data build introduces a beam-legal mapped duplicate, preventing additive partial scoring from silently double-counting it.

### Build From Scratch

Builds progression for its selected weapon pair, allocates legal mastery, records explicit Overall Mastery Potential state, and refuses a non-legal final or tradeoff build.

### Combat Lab

Only legal BuildSnapshots can prefill. Ability data and static data must use the same game build. Base Damage is taken only from the hand containing the ability's required weapon family; selecting the other hand is rejected and resynchronized. Missing weapon context falls back to visibly manual input.

Combat Lab remains a reviewed coefficient and scenario surface, not an exact final-damage authority.

## Remaining evidence-dependent uncertainties

These are explicit and do not silently enter exact item ranking:

1. Blazing Wind owner inclusion remains unresolved. Its `+2.5%` Base Damage magnitude, Crossbow requirement, and party aura are exact, but the decoded client graph does not expose the owner target filter.
2. Conditional effects need a future scenario contract before they can influence optimizer scoring.
3. Combat Power remains a fitted Questlog-parity heuristic rather than a decoded official game formula.
4. Final damage, defense, block, live rolls, modifier order, and server rounding remain outside the persistent static claim.

## Evidence added in the final static sweep

- Passive slot schedule: `D:\TL_Data\raw\24118850\extracted\data\TL\Content\Game\Client\Table\TLGlobalCommon.uasset`, row `GlobalCommonData`, field `PassiveSkillSlotCountLevelLimits`. The AGS override contains the identical schedule.
- Duplicate Equipment Skill behavior: `D:\TL_Data\raw\24118850\extracted\localization\csv\en.csv`, keys `TEXT_TOOLTIP_SKILL_MAIN_DESCRIPTION_Description`, `TEXT_TOOLTIP_SKILL_SPECIAL_SKILL_HELP_Description`, and `TEXT_RES_TUTORIAL_PC_MESSAGE_POTENTIAL_01`. All state that only one or the highest-level repeated skill activates.
- Heroic group cap: the same localization projection, key `TEXT_MSG_PERK_FAIL_EQUIP_LIMITS`, corroborated by all eight shipped locales plus the weapon, armor, and accessory partitions decoded from `TLPerkSocket.uasset` and `TLPerkOption.uasset`.
- Orthodox: `TLFormulaParameterNew.json` row `WP_Item_Field_NIX_GT_01` has `min=max=tooltip1=40`; `WP_Item_GT.json` and `TLEffectProperty.json` prove the persistent join. Korean, Japanese, and Traditional Chinese bind `_GT_01`; the affected western strings bind `_GT_02` incorrectly.
- Primal Brothers: `WP_Item_ORB.json` uses lowercase `fieldBoss` in the complex ID and joins to `WP_Item_FieldBoss_T2_ORB_01`. Its decoded effect graph is a delayed conditional direct-damage proc with a `300%` Base Damage formula.
- Blazing Wind: all shipped strings name party members within 16m but omit self. The client-visible aura graph does not expose the decisive owner filter, so exact owner scoring remains blocked pending one solo stat-panel test or a server target-filter decode.

## Verification

- Node test suite: `468/468`
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
