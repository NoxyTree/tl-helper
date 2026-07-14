# Persistent Static Calculation Authority: Final Review

Date: 2026-07-14  
Game data build: `24118850`  
Branch: `codex/calculation-consistency-release`  
Pre-implementation snapshot: `snapshot/calculation-pre-implementation-20260714` at `a1a67c6`
Scenario-extension snapshot: `snapshot/scenario-effects-pre-implementation-20260714` at `1307bc0`
Static-gap implementation snapshot: `snapshot/static-gap-pre-implementation-20260714` at `2efad6a`

## Outcome

The shared calculator is now the authority for persistent static build totals and item-choice scoring across Armory, Tracker, Gear Viewer, Full Build Optimizer, Build From Scratch, saved BuildSnapshots, and Combat Lab build prefills.

Every projected set breakpoint and passive-like effect has an explicit machine-checked classification. Unknown or changed records fail the canonical contract instead of being inferred from tooltip wording or silently treated as zero.

The release claim is intentionally limited to persistent static build state. It does not claim exact live encounter outcomes for triggers, target state, party state, position, active buffs, procs, damage mitigation order, or server rounding.

## Certified data baseline

The static authority now rests on a receipted canonical rebuild rather than a
stale warehouse:

- Source run: `D:\TL_Data\reports\24118850\update-runs\2026-07-14T07-01-19-589Z.json`
- Receipt: `data-build-receipts/24118850.json`
- Clean generator commit: `8365c0046fea968355245ea90c67c023efdddee3`
- Decoded universe: `55` tables and `159,448` records
- Full inventory: `1,387` tables across `680` families
- Stat-source materialization: `293,446` rows across `2,394` named sources
- Warehouse SHA-256 after stat-source materialization: `a484a8f5c4f59c968f157bcf1d0345890060483fad609856d76608488f6e75b8`
- Inventory semantic SHA-256: `fa4913bbb73740d49e495fd43f343303332f51280080d938c50ba192ec83bce6`

The run atomically rebuilt and validated the warehouse and inventory, then
materialized stat sources and regenerated evidence before issuing the receipt.
SQLite integrity is `ok`, journal mode is `DELETE`, FTS count equals record
count, both inventory copies are byte-identical, and all five stored warehouse
semantic hashes match values recomputed from live content.

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
- Duplicate equipped item IDs are invalid. Shipped system text says the same item can be equipped only once, and the ring-specific equip text confirms that identical rings cannot be equipped together. Owning multiple copies remains legal; this rule concerns simultaneous equipment only.
- Repeated Equipment Skills and Skill Cores are legal but only one copy, or the highest-level copy when levels differ, activates. Build `24118850` projects one fixed rule per complex ID and no per-copy levels, so the shared calculator performs exact one-copy deduplication across innate and selected-core sources.
- The shipped Heroic equipment cap is enforced as one weapon, one armor item, and one accessory; conflicts are invalid.

## BuildSnapshot v2

BuildSnapshot v2 stores raw build state and allocated attributes while treating resolved totals as a derived cache.

- Game build, character level, ruleset, and calculator version are code-owned.
- Deserialization ignores serialized totals and recalculates through current rules.
- Current-looking plain objects are recalculated before `isBuildSnapshot()`, `snapshotStat()`, or serialization accepts them.
- Nonfinite malformed input cannot be converted into a legal default or collide with a legal calculation fingerprint.
- The calculation context explicitly identifies persistent static mode, included set effects, and excluded dynamic effects.

## First exact scenario extension

The conditional-effect work queue now contains `530` deterministic source shells: `62` weapon passives, `159` non-structured masteries, `286` item or Skill Core complexes, and `23` conditional set components. The generated catalogue records carriers, weapon requirements, decoded source edges, provenance, and unresolved semantics without inferring executable behavior from tooltip prose.

Four decoded distance rules are now executable through an explicit combat scenario:

- Sniper's Sense
- Far Sight
- Eagle Vision
- Black Rage's Boost

Predator's Focus remains fail-closed because its replacement needs nearby-opponent positions, which the distance-only scenario does not yet model.

Scenario calculation is deliberately an overlay rather than a mutation of persistent totals:

- `calculateBuild().stats` remains the persistent static authority.
- A valid scenario adds `scenarioEffects` and `scenarioStats`.
- An invalid, unsupported, weapon-mismatched, or wrong-build scenario applies no partial overlay.
- The exact combat-scenario contract is closed-world and versioned. Unknown fields, missing schemas, invalid participants, and mismatched game builds fail validation.
- Browser contract modules are byte-exact mirrors of the authored combat-engine modules and are protected by a synchronization test.
- Decoded distance rules are pinned to game build `24118850`; they cannot execute against a future projection until they are re-audited.
- Equipped-weapon progression and selected Skill Core authority are reused, so foreign stored passives, foreign masteries, and unselected cores cannot reactivate through a scenario.
- Hard caps are reconstructed from uncapped static totals after overlay application.

Gear Viewer and Full Build Optimizer expose target-distance scoring as an explicit opt-in. Their default remains persistent static scoring. Candidate generation, complete-build scoring, protected-stat checks, cache identity, current totals, result hovers, and optimizer handoff use the same canonical scenario when enabled.

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

Builds progression for its selected weapon pair, allocates legal mastery, records explicit Overall Mastery Potential state, and refuses a non-legal final or tradeoff build. Scratch evaluation activates only the requested weapon families before concrete weapon items exist. All `32` mapped weapon mastery effects, including `12` mastery-to-passive transformations, are scored through the shared calculator rather than through structured mastery rows alone. The allocator reserves Epic capacity, follows legal Achievement-category priority, and consumes the exact requested point budget across the `80`, `130`, and `220` point boundaries.

Progression selection remains a deterministic bounded allocator. Its retained build is calculated exactly, but the selection process is not yet a proof of the globally optimal skill and mastery allocation. Gear-dependent and attribute-threshold progression should receive one bounded second pass against equipped finalists before that stronger claim is made.

### Combat Lab

Only legal BuildSnapshots can prefill. Ability data and static data must use the same game build. Base Damage is taken only from the hand containing the ability's required weapon family; selecting the other hand is rejected and resynchronized. Missing weapon context falls back to visibly manual input.

Combat Lab remains a reviewed coefficient and scenario surface, not an exact final-damage authority.

## Remaining evidence-dependent uncertainties

These are explicit and do not silently enter exact item ranking:

1. Blazing Wind owner inclusion remains unresolved. Its `+2.5%` Base Damage magnitude, Crossbow requirement, and party aura are exact, but the decoded client graph does not expose the owner target filter.
2. `GT_Hero_Attack_01`, Instinct and Restraint, has exact level rates and an exact Eclipse reversal, but percentage All Defense materialization, Base Damage hand scope, stacking order, and rounding are not present in the decoded client rows. It remains provisional rather than receiving invented endpoint totals.
3. The remaining conditional families need reviewed scenario semantics before they can influence optimizer scoring. Only the four decoded distance rules listed above are currently executable.
4. Combat Power remains a fitted Questlog-parity heuristic rather than a decoded official game formula.
5. Final damage, defense, block, live rolls, modifier order, and server rounding remain outside the persistent static claim.

## Evidence added in the final static sweep

- Passive slot schedule: `D:\TL_Data\raw\24118850\extracted\data\TL\Content\Game\Client\Table\TLGlobalCommon.uasset`, row `GlobalCommonData`, field `PassiveSkillSlotCountLevelLimits`. The AGS override contains the identical schedule.
- Duplicate Equipment Skill behavior: `D:\TL_Data\raw\24118850\extracted\localization\csv\en.csv`, keys `TEXT_TOOLTIP_SKILL_MAIN_DESCRIPTION_Description`, `TEXT_TOOLTIP_SKILL_SPECIAL_SKILL_HELP_Description`, and `TEXT_RES_TUTORIAL_PC_MESSAGE_POTENTIAL_01`. All state that only one or the highest-level repeated skill activates.
- Duplicate item legality: the same localization projection, keys `TEXT_MSG_ITEM_EQUIP_CHANGESLOT_SAMEITEM_Msg`, `TEXT_MSG_ITEM_EQUIP_FAIL_IDENTICAL_Msg`, `TEXT_MSG_ITEM_EQUIP_INVALID_IDENTICAL_Msg`, and `ring_common_Description`, corroborated by the Korean projection. They distinguish legal duplicate ownership from illegal simultaneous equipment and explicitly forbid identical rings.
- Heroic group cap: the same localization projection, key `TEXT_MSG_PERK_FAIL_EQUIP_LIMITS`, corroborated by all eight shipped locales plus the weapon, armor, and accessory partitions decoded from `TLPerkSocket.uasset` and `TLPerkOption.uasset`.
- Orthodox: `TLFormulaParameterNew.json` row `WP_Item_Field_NIX_GT_01` has `min=max=tooltip1=40`; `WP_Item_GT.json` and `TLEffectProperty.json` prove the persistent join. Korean, Japanese, and Traditional Chinese bind `_GT_01`; the affected western strings bind `_GT_02` incorrectly.
- Primal Brothers: `WP_Item_ORB.json` uses lowercase `fieldBoss` in the complex ID and joins to `WP_Item_FieldBoss_T2_ORB_01`. Its decoded effect graph is a delayed conditional direct-damage proc with a `300%` Base Damage formula.
- Blazing Wind: all shipped strings name party members within 16m but omit self. The client-visible aura graph does not expose the decisive owner filter, so exact owner scoring remains blocked pending one solo stat-panel test or a server target-filter decode.

## Verification

- Node test suite: `551/551`
- Reference build assertions: `69/69`
- Edge cases: `12/12`
- BuildSnapshot v2 authority and migration verification: passed
- Set audit: `78` sets, `151` breakpoints, no incorrect or review classifications
- Passive-effect contract: `80 + 193 + 294 = 567` effects, every ID classified exactly once
- Conditional scenario catalogue: `530/530` source shells, with `4` decoded distance rules executable and `526` explicitly non-executable
- Closed-world scenario, game-build drift, source-weapon binding, cache separation, hard-cap reconstruction, and unsupported-current-stat regressions: passed
- Browser combat-engine contract synchronization: passed
- Passive registry binding audit: passed
- Complete candidate legality regressions: passed
- Diff whitespace check: passed
- Local HTTP smoke: all six calculation pages, the scenario-aware calculator and adapter, distance evaluator, browser scenario contract, and generated scenario catalogue returned `200`
- Inline module syntax: Gear Viewer and Full Build Optimizer passed
- In-app visual smoke: not completed because the browser-control transport was unavailable

## Primary review files

- `web/tl-core.js`
- `web/tl-questlog-rules.js`
- `web/tl-passive-effect-contract.js`
- `web/tl-build-snapshot.js`
- `web/tl-distance-scenario-effects.js`
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
- `scripts/tests/build-distance-scenario-integration.test.mjs`
- `scripts/tests/combat-scenario-contract.test.mjs`
- `scripts/tests/scenario-effect-catalog.test.mjs`
- `scripts/verify-build-snapshot.mjs`

## Review criterion

The persistent static release is acceptable if a reviewer confirms that:

1. Every executable persistent rule has decoded, derived, calibrated, or modeled provenance.
2. Every projected set and passive-like effect belongs to exactly one explicit class.
3. Conditional effects are excluded without being mistaken for missing persistent rules.
4. Provisional or invalid inputs cannot enter exact Gear Viewer, optimizer, or Combat Lab build-derived results.
5. All build-consuming surfaces use the same game build, calculator, and context fingerprint.
