# Mastery Achievement parity investigation — 2026-07-25

## Conclusion

Candidate 3 is the explanation supported by the frozen evidence: these are faithful imports of Questlog mastery builds that really store fewer activated Achievement effects than the validator expects. The importer does not drop or collapse a second effect, and there is no decoded-game-data basis for a one-slot Common or Uncommon rule.

This conclusion is about the stored Questlog build and the panel rendered from it. It is not proof that the live game accepts an under-activated tier. The exact live-game legality of leaving a second eligible Achievement effect inactive remains unproven: the decoded mastery-node rows do not encode a required selection count, while the recovered Questlog planner permits fewer than two and only disables a third selection. No new game rule is inferred from that UI behavior.

The core validator was therefore not weakened. The parity verifier now marks these exact frozen source conditions as expected blockers while continuing to report any other blocking issue normally.

## Evidence chain

### 1. The payload and imported selection sets are identical

Each fixture's `questlogPayload.masteryBuild.specialization` value is an array. `importQuestlogBuild()` in `web/tl-core.js` maps every row to `build.masteries` by its mastery ID. Comparing the raw ID array with the imported object keys produced equal counts, no missing IDs, no duplicate raw IDs, and no rows without an ID:

| Build | Offending tier | Raw rows | Imported rows | Stored activated effect(s) |
|---|---|---:|---:|---|
| 8197308, Hit tank | Greatsword Uncommon | 55 | 55 | `Sword2h_High_Util_Skill` only |
| 8261110, Healer | Orb Common | 55 | 55 | `Orb_Normal_Tac_Skill` only |
| 8290225, Magic DPS | Staff Uncommon | 52 | 52 | `Staff_High_Def_Skill` only |
| 8227612, Juggernaut | Greatsword Common and Rare | 54 | 54 | `Sword2h_Normal_Def_Skill` and `Sword2h_Rare_Def_Skill`, one in each affected tier |

This rules out candidate 1. There is no second activated ID for the importer to recover.

### 2. The affected tiers genuinely have multiple eligible categories

Applying the existing decoded hybrid-category accounting to the stored normal-node levels gives:

| Build and tier | Eligible category totals (20 or more) |
|---|---|
| Hit tank, Greatsword Uncommon | Attack 20, Defence 20, Tactics 20, Utility 20 |
| Healer, Orb Common | Attack 30, Tactics 30, Utility 30 |
| Magic DPS, Staff Uncommon | Attack 20, Defence 20, Tactics 20 |
| Juggernaut, Greatsword Common | Attack 20, Defence 20, Utility 20 |
| Juggernaut, Greatsword Rare | Attack 30, Defence 30, Tactics 30, Utility 30 |

The warning is therefore not caused by category miscounting. Each tier has at least two categories over the 20-point threshold but stores only one activated effect.

### 3. Questlog rendered the stored under-activation

The fixture payload and Combined Stats panel were frozen together. With exactly the stored mastery rows, TL Helper matches Questlog at 73/73 for the hit tank and 83/83 for the healer. Across all four affected fixtures the current comparisons are 315/321. Synthesizing another activation would change the source build rather than repair an import omission.

The July 24 status document listed only the healer and hit tank. The current fixture fleet also contains the same condition in Magic DPS (one tier) and Juggernaut (two tiers), so all five exact warning messages are covered by the expectation marker.

### 4. No decoded evidence supports a low-tier slot reduction

The recovered static mastery records at `C:\_Projects\tl-character-extract\out\questlog-public\weaponSpecialization.getWeaponSpecializations.json` contain node identity, grade, category, type, cost, stats, and passives, but no grade-dependent Achievement-slot count.

The recovered Questlog core UI at `C:\_Projects\tl-character-extract\out\questlog-main.js` uses one requirement function for Common, Uncommon, and Rare. It requires 20 category points and disables an unselected node only when two same-grade synergies are already selected. It does not define one slot for Common or Uncommon. This agrees with `mastery-page-rules.md`, which records a maximum of two Synergy nodes per rarity tier.

That is not decoded-game-data proof of fewer low-tier slots, so candidate 2 is rejected rather than guessed.

## Change

`scripts/verify-questlog-parity.mjs` now has an exact build-ID and message expectation map for the five observed `mastery_synergy_count_invalid` conditions. The verifier preserves the calculation status and the core warning, but separates:

- unexpected blockers, rendered with `!`; and
- expected frozen-source blockers, rendered as `~ expected:`.

The JSON report retains `blockingIssues` and adds `expectedBlockingIssues` and `unexpectedBlockingIssues`. No fixture JSON, optimizer source, game-data projection, or validator rule changed.

## Parity verification

`node scripts/verify-questlog-parity.mjs` exited successfully before and after.

| Archetype | Before | After |
|---|---:|---:|
| Melee PVE | 88/88 | 88/88 |
| Evasion tank | 82/82 | 82/82 |
| Hit tank | 73/73 | 73/73 |
| Melee DPS | 90/90 | 90/90 |
| Ranged DPS | 72/72 | 72/72 |
| Healer | 83/83 | 83/83 |
| Melee DPS max-dmg | 88/88 | 88/88 |
| Infiltrator PvP | 84/84 | 84/84 |
| Magic DPS | 76/77 | 76/77 |
| Juggernaut | 83/88 | 83/88 |
| **Overall** | **819/825 (99.3%)** | **819/825 (99.3%)** |

After classification, the JSON report contains five expected mastery blockers, zero unexpected blockers, and zero parity regressions.

## Test result

`npm test` was run. This checkout currently discovers 927 tests rather than the 908 stated in the task. Result: 926 passed and one failed.

The sole failure is `scripts/tests/optimizer-precache.test.mjs`, “a committed precache is fresh and internally consistent.” The committed cache stores engine fingerprint `0cffb6e7edd0c18775687d3f69772fe02c267de4eddd61fb598bd3f8f4e24863`; the current committed optimizer-engine module graph produces `93fa220de2df18192bd0aeea3b1188faba53be9defde23c3fafacd612e18f174`.

This task did not cause that failure: none of the modules returned by `optimizerEngineModules()` is dirty, and `scripts/verify-questlog-parity.mjs` is not part of the optimizer fingerprint. Per the task constraint, the optimizer sources and precache were not edited or regenerated. A completely green full-suite result therefore remains blocked by the pre-existing stale optimizer precache, not by the mastery-parity change.
