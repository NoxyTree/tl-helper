# Calculation Authority Implementation Status

Date: 2026-07-14  
Game data build: `24118850`  
Branch: `codex/calculation-consistency-release`  
Pre-implementation snapshot: `snapshot/calculation-pre-implementation-20260714` at `a1a67c6`

## Release claim boundary

The current target is a trustworthy persistent static build calculator. It includes equipment, item levels, inherent stats, traits, selected Heroic effects, runes, rune synergies, artifacts, item sets, allocated attributes, attribute breakpoints, equipped-family skills, equipped-family weapon mastery, unified mastery, and decoded-proven persistent item or perk effects.

It does not claim live encounter outcomes. Current Health, target Health, distance, position, movement, nearby target count, active attacking hand for conditional effects, party state, buffs, debuffs, stacks, procs, cooldown state, skill transformations, final mitigation order, and server rounding remain outside persistent static totals unless a future explicit scenario contract supplies them.

## Implemented in this tranche

### One effective progression authority

`web/tl-core.js` now derives a single non-mutating effective progression projection and uses it for:

- structured mastery stats
- passive skill rules
- normal passive mastery and Achievement rules
- unified mastery rules
- passive and mastery interactions
- Combat Power inputs
- unmapped-effect reporting
- build validation

Stored selections remain on the build when a weapon is swapped out, but only skills and weapon masteries belonging to currently equipped weapon families affect totals. Unified mastery remains global. Canonical skill data determines active, passive, or defensive type, so a stored type cannot spoof the cap or calculation path.

### Exact mastery legality

Raw persisted mastery selections are validated without clamping, deleting, adding, or otherwise mutating them.

Decoded or shipped-client-confirmed rules now enforced:

- 220 normal mastery points per weapon
- normal mastery levels from 1 through 10
- Achievement mastery level exactly 1
- 30 Common points to unlock Uncommon nodes
- 30 Uncommon points to unlock Rare nodes
- 20 category points to activate an Achievement effect
- the highest-point categories activate first
- at most two Achievement effects per Common, Uncommon, and Rare tier
- at most six Achievement effects per weapon
- hybrid category nodes credit both categories but consume their level once
- one Epic requires 80 non-Epic points
- two Epics require 120 non-Epic points
- at most two Epics
- each Epic requires a matching selected Achievement effect
- at most four Overall Mastery skills

Tie handling is deliberately non-invented: either tied category is legal at the selection cutoff.

Remaining mastery schema gap: unified rows have decoded `requiredLevel` values, but the build does not store character-wide Overall Mastery Level or all ten weapon mastery levels. Those unlock requirements cannot be enforced honestly until that field is added.

### Decoded persistent rule corrections

The passive and mastery registries now include decoded-proven persistent components that were missing or wrong, including:

- Wrathful Edge rear accuracy
- Forbidden Sanctuary side and rear Critical Hit Chance
- Aegis Shield block damage reduction
- Earth's Blessing
- Distorted Sanctuary
- Ambidexterity
- Physique Training
- Master of Provocation
- Impenetrable minimum defense band
- corrected Dexterous Power threshold branches
- corrected Mana Shield cap
- corrected Life's Bargain 40,000-Health scaling and percentage Base Damage penalty
- corrected Keen Reflexes Perception cap
- representable persistent mastery interactions

Conditional Aridus, `GT_Hero_Attack_01`, target bands, procs, and extra party effects remain explicitly unsupported instead of being valued as always active.

### Persistent item and selectable-core rules

The calculator now has exact personal rules for the decoded-proven persistent item or core effects currently safe to execute:

- Dark Wing's Bulwark
- Dark Wing's Power
- Mind's Eye
- Eye of the Storm
- Wind's Guidance
- Southpaw

Weapon-specific cores require the matching equipped family. Repeating the same passive complex across slots produces an explicit calculation error because same-core stacking remains unresolved.

The calculation engine applies a selected legal core correctly. Candidate generators do not yet enumerate these core variants, which is the next item-choice blocker.

### Optimizer and Gear Viewer safety

Existing-build optimization now locks the current main-hand and off-hand weapon families. It can choose a stronger weapon of the same family, but it cannot carry Bow/Dagger progression into a Staff/Sword recommendation. Changing weapon families is routed to Build From Scratch.

Existing-build optimization rejects source builds with calculation-blocking legality errors. Foreign inactive selections do not block it.

Gear Viewer weapon comparisons now use replacement deltas against the actual current slot selection. Shared family progression is no longer incorrectly credited to every same-family weapon candidate, and replacing a weapon with itself returns a zero delta.

## Current verification

- Node test suite: `420/420`
- Reference build assertions: `69/69`
- Edge cases: `12/12`
- BuildSnapshot v1 contract tests: passed
- Set audit: `78` sets, `151` breakpoints, `0` confirmed incorrect, `0` high risk, `0` review, `9` explicitly unmapped combat-conditional breakpoints
- Diff whitespace check: passed

The reference fixture for The Death Prophet and Void was updated only for decoded-confirmed Impenetrable and Life's Bargain changes. Its expectation source records why those totals intentionally diverge from the old Questlog panel.

## Remaining release gates

### P0: calculable core variants in item recommendations

There are 21 selectable-core carrier items and 880 item/core rows, but only five passive IDs currently have executable persistent `PERK_PASSIVE_RULES`. Those five produce only 14 legal item/core combinations, so exact enumeration is small.

Required work:

1. Add shared selected-core and calculable-core-variant helpers.
2. Validate stale or impossible `perkId` values.
3. Make hover text show the selected core rather than the first catalogue core.
4. Cross-product optimizer and Gear Viewer item candidates with blank plus rule-backed persistent cores.
5. Deduplicate alias perk IDs by passive complex.
6. Reject candidates that repeat a passive complex across slots.
7. Preserve selected unsupported cores only when the exact current item is retained, but never invent value for them.
8. Carry the winning `perkId` through Full Build Optimizer and Build From Scratch results.

### P0: BuildSnapshot freshness and calculation status

BuildSnapshot v1 trusts serialized resolved totals and permits caller-supplied calculator metadata. A stale or forged derived cache can therefore look current.

Required work:

1. Introduce a code-owned calculator version and static ruleset version.
2. Make raw build plus allocated attributes authoritative.
3. Re-resolve deserialized snapshots before current UI or optimizer use.
4. Derive game build and character level from the initialized calculator, not caller metadata.
5. Record a `persistent-static` calculation context.
6. Add a shared `legal`, `provisional`, or `invalid` status.
7. Permit Armory to display provisional totals, but prevent Gear Viewer, Combat Lab, and optimizers from ranking or prefilling invalid builds.

### P0: final candidate legality

Both optimizers must recalculate and reject every final candidate with a blocking calculation error. This is defense in depth for future core variants, set conflicts, duplicate passives, mastery errors, and malformed imported state.

### P0: cache and Combat Lab context

Gear Viewer pool and hover cache keys must include a canonical static calculation fingerprint containing the game build, ruleset, raw build, allocated attributes, set-effect mode, and calculation mode.

Combat Lab must:

- include attributes in build deduplication
- verify that ability and static-calculator datasets use the same game build
- select the hand matching the chosen ability's weapon family
- fall back to manual input with a visible unsupported-context warning when that weapon is not equipped
- refuse invalid snapshots as prefill sources

### P1: unified mastery unlock state

Persist `overallMasteryLevel`, or preferably all ten `weaponMasteryLevels`, in local builds, Questlog imports where available, and BuildSnapshot. Only then enforce each unified node's decoded `requiredLevel`.

The decoded mutual exclusion between `WM_Common_SKILL_002` and `WM_Common_SKILL_024` can be enforced independently.

### P1: passive skill cap evidence

Active 12 and defensive 1 have strong shipped-client structural evidence. Passive 8 remains derived from the available passive set and both UIs rather than a decoded numeric setting. Keep it visibly classified as derived until the numeric client setting or a minimal in-game read proves it.

### P1: explicit scenario contract

After the persistent static release is trustworthy, add a canonical scenario object only for effects that can be modeled with evidenced inputs. Its fingerprint must participate in BuildSnapshot, Gear Viewer caches, slot-delta caches, and optimizer scoring. Unsupported server-only formulas must remain unsupported.

## Recommended implementation order

1. Calculable core variants plus exact final-candidate legality.
2. BuildSnapshot v2 and shared legal/provisional/invalid status.
3. Gear Viewer calculation fingerprint and invalid-build gate.
4. Combat Lab dataset, build deduplication, and ability-hand fixes.
5. Unified mastery level schema and mutual exclusion.
6. Passive-effect classification drift guards and cross-surface fixtures for every executable core.
7. Browser smoke across Armory, Gear Viewer, Full Build Optimizer, Build From Scratch, Tracker, and Combat Lab.
8. Independent diff and database review, then a release candidate commit.

## Honest completion criterion

We can call persistent static build calculation complete when every projected persistent effect is classified, every executable rule is decoded-proven or visibly labeled derived or modeled, every selected input is legality-checked, every item-choice surface uses the same calculation authority and context fingerprint, every optimizer final candidate is legal, and all unsupported combat-state effects are explicit rather than silently scored as zero or always active.

That will make static item and build recommendations trustworthy. It will not make live damage outcomes exact until the separate scenario and combat-resolution layers have their own decoded or calibrated evidence.
