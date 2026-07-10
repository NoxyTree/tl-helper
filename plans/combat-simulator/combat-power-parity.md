# Combat power parity analysis

Date: 2026-07-10
Game build: `24118850`
Decoder: `0.1.0`
Source table: `D:\TL_Data\decoded\24118850\tables\TLItemCombatPower.json`
Source SHA-256: `0d285a4bdebbe7037cfabe0e83a93f656e5f450d7fc8db1a290e4762f84264fb`

## Decision

Do not replace the live combat-power calculator yet.

`TLItemCombatPower` is authoritative for item component weights, but it is not the complete combat-power formula. Its 132 rows contain item base power and indexed enchant, trait, unique-trait, resonance, potential, rune, artifact, and perk values. It contains no skill-power rows, mastery-power rows, global starting value, or final aggregation rule.

The safe next change is to expose the decoded calculation alongside the fitted result for diagnostics. A production replacement needs the missing aggregation pipeline and a validated item-to-row mapping.

## Reproducible analysis

Implementation:

- `scripts/analyze-combat-power.mjs`
- `scripts/lib/combat-power-table.mjs`
- `scripts/tests/combat-power-table.test.mjs`

Run:

```powershell
$env:TL_DATA_ROOT = 'D:\TL_Data'
$env:TL_GAME_BUILD = '24118850'
node --test scripts/tests/combat-power-table.test.mjs
node scripts/analyze-combat-power.mjs --write
```

The second command writes the detailed evidence to:

`D:\TL_Data\reports\24118850\combat-power-parity.json`

## What the decoded table proves

The 132 rows divide into:

| Category | Rows |
| --- | ---: |
| Weapon | 14 |
| Armor | 50 |
| Accessory | 52 |
| Rune | 10 |
| Artifact | 6 |

The existing heuristic did recover some real patterns:

- Normal trait power matches exactly on 99 of 112 applicable equipment rows. The 13 exceptions are all `aaa` rows, where the first trait tier already adds power.
- The fitted weapon trait increment of 10 and armor/accessory increment of 5 are real for the older rows.
- Top-grade artifact bases match: `talistone_a_t1 = 60` and `gemstone_a_t1 = 70`.

It does not capture the complete table:

- Lower artifact grades have their own values.
- Seasonal equipment uses long, non-linear level arrays.
- Resonance varies by equipment generation and category.
- Unique traits, potentials, and perks have explicit components.
- Rune values are table-driven and differ from the fitted grade-plus-20-percent rule.

## Dataset comparison

Of 1,441 non-support items currently sent to the browser, 1,005 map to a decoded row using conservative ID and category rules. The remaining 436 include older `t3`, `t4`, and `t5` naming families for which the table has no same-name key. They are deliberately unresolved rather than guessed.

For the 1,005 conservatively mapped items at their maximum available level, comparing bare item power gives:

| Measure | Result |
| --- | ---: |
| Exact matches | 121 (12.0%) |
| Mean absolute difference | 111.94 power |
| Maximum absolute difference | 414 power |

This is not a claim that the decoded table is wrong. It shows that the fitted heuristic is not the same model and that several item generations use different progression rules.

Across 7,044 rune and level comparisons:

| Measure | Result |
| --- | ---: |
| Exact matches | 3,522 (50.0%) |
| Mean absolute difference | 2.98 power |
| Maximum absolute difference | 15 power |

The rune heuristic is a useful approximation but is not exact.

## Reference build comparison

The Questlog reference build reports 7,128 combat power. The current fitted breakdown is:

| Component | Current value |
| --- | ---: |
| Equipment starting value | 250 |
| Item subtotal, including fitted runes | 4,820 |
| Equipment power | 5,070 |
| Skill power | 642 |
| Mastery power | 1,416 |
| Total | 7,128 |

For the same build, the decoded table produces:

| Decoded component | Value |
| --- | ---: |
| Items, including traits, resonance, and artifacts | 4,573 |
| Runes | 1,075 |
| Decoded item and rune subtotal | 5,648 |

If that subtotal is naively combined with the existing skill and mastery heuristics, the result is 7,706, which is 578 above the observed total. This deliberately excludes any guessed starting value or perk adjustment. The mismatch proves that a direct table swap is unsafe, not that the decoded component weights are inaccurate.

## Mapping and units

Decoded values appear to be direct integer combat-power units. No scale factor is indicated in the table. Item row keys are inferred conservatively from item IDs and equipment categories:

- Weapons use the `weapon_*` rows.
- Armor uses slot rows for normal generations and `armor_*_S1` for seasonal gear.
- Accessories use slot rows for normal generations and `accessory_*_S1` for seasonal gear.
- Artifacts use grade-specific talistone and gemstone rows.
- Normal runes use `rune_<grade>_t1`; chaos runes use `rune_all_<grade>_t1`.

No explicit foreign-key field linking `TLItemEquip` or `TLItemStats` to `TLItemCombatPower` has been found. Therefore the mapping is `derived_high_confidence` for the 1,005 matched IDs, not `verified_exact`.

## Skill and mastery limits

No decoded field in `TLItemCombatPower` supports the current assumptions of 2 power per skill level, 3 power per mastery level, four mastery thresholds, or a 250 global equipment starting value. Those values remain fitted heuristics.

This analysis did not find a replacement source for them. They need either:

1. another client table or ActionTree/client-code trace, or
2. controlled build comparisons that change only one skill or mastery level.

## Safe replacement recommendation

Safe now:

- Use `TLItemCombatPower` as the source for explanatory component values.
- Replace hardcoded rune and artifact lookup values only inside an opt-in diagnostic path.
- Display old and decoded results side by side with provenance.
- Add unresolved-row warnings instead of falling back silently.

Not safe now:

- Replacing `calculateCombatPower()`.
- Removing the 250 starting value.
- Replacing skill or mastery power.
- Assigning the 436 unresolved item families to similar-looking rows.
- Treating the reference-build difference as a correction constant.

## Remaining evidence needed

1. Locate the client aggregation function or another table that supplies skill, mastery, global, and perk components.
2. Resolve legacy `t3`, `t4`, and `t5` item families through client code or controlled in-game comparisons.
3. Verify whether perk rows are added for innate passives, slotted skill cores, or both.
4. Capture several in-game combat-power totals while changing exactly one component at a time.
5. Validate the row adapter across at least one item from every supported row family before production use.

Precision labels used here:

- Decoded row contents: `verified_exact`
- Item-to-row adapter for matched IDs: `derived_high_confidence`
- Full decoded build total: `unsupported` until aggregation is known
