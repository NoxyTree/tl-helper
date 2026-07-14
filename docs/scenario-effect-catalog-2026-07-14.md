# Scenario-effect catalogue foundation

- Game build: `24118850`
- Artifact: `web/data/scenario-effects.json`
- Generator: `scripts/build-scenario-effect-catalog.mjs`
- Pure builder and build-scoped registry: `scripts/lib/scenario-effect-catalog.mjs`
- Contract test: `scripts/tests/scenario-effect-catalog.test.mjs`

## Result

The repository now has one durable, deterministic inventory for every currently classified conditional or scoped effect that is absent from persistent sheet totals.

| Source family | Effect shells |
| --- | ---: |
| Weapon passive skills | 62 |
| Non-structured mastery nodes | 159 |
| Item passives and Skill Core complexes | 286 |
| Conditional set components | 23 |
| **Total** | **530** |

The 23 set components consist of nine breakpoints that are wholly unsupported by the static calculator and fourteen conditional remainders whose persistent component is already calculated separately. This avoids treating a mixed set breakpoint as either wholly implemented or wholly absent.

## What each shell records

Every entry contains:

- A stable catalogue ID, source family and source ID.
- Projected name and description.
- Direct carrier topology, including item, Skill Core, passive-skill, mastery-node or set-piece carriers.
- Weapon requirements derived directly from the projected skill, mastery, item or Skill Core relationship.
- An explicit support state.
- Precision and provenance records.
- Machine-readable source edges back to projection rows.
- A fixed list of unresolved semantic fields.
- Either `executableSemantics: null` or one explicit reviewed module/export/definition reference.

The catalogue does not parse description prose into triggers, formulas, proc rates, durations or stacking rules. Four decoded distance effects and two decoded ordinary day/night item effects now point to separately reviewed scenario implementations. The other 524 entries remain non-executable until their fields are independently decoded, reviewed and represented by a separate scenario rule. There is no default classification or fallback rule.

## Support-state meanings

| State | Count | Meaning |
| --- | ---: | --- |
| `catalogued_unmodeled` | 501 | The source and carrier are known, but no executable scenario semantics are claimed. |
| `scenario_executable_decoded` | 6 | A reviewed decoded rule has an exact module, evaluator export and definition key. |
| `unsupported_static_calculator` | 9 | The complete set breakpoint is outside persistent sheet totals. |
| `static_component_only` | 14 | The persistent set component is calculated elsewhere; only the conditional remainder is represented here. |

These are work-queue states, not final-damage confidence claims. The four distance rules use decoded exact coefficients and reviewed source gating, but retain `serverRounding` as an explicit unresolved field. The two ordinary day/night rules use decoded fixed amounts with no arithmetic rounding. Every other entry uses an `unsupported` precision stage and explicitly sets executable precision to false.

## Reviewed distance promotions

The following entries reference `web/tl-distance-scenario-effects.js`, `evaluateDistanceScenarioEffects` and their exact `DISTANCE_EFFECT_DEFINITIONS` key:

- `SkillSet_WP_BO_S_DistanceCritical`, Sniper's Sense.
- `Bow_Normal_Attack_Skill`, Far Sight.
- `SkillSet_WP_CR_CR_S_DistanceRangeAcc`, Eagle Vision.
- `SkillSet_WP_Item_kA_ST_55`, Black Rage's Boost.

`Crossbow_Normal_Util_Skill`, Predator's Focus, deliberately remains `catalogued_unmodeled`. Its nearby-opponent replacement needs opponent-position scenario inputs, and the distance evaluator fails the affected Eagle Vision route closed while that mastery is selected.

## Reviewed ordinary day/night promotions

The following entries reference `web/tl-time-of-day-scenario-effects.js`, `evaluateTimeOfDayScenarioEffects` and their exact `TIME_OF_DAY_EFFECT_DEFINITIONS` key:

- `SkillSet_WP_Item_kA_CR_61`, Kowazan's Bombing: `+1200` raw Attack Speed during ordinary day and `+600` during ordinary night.
- `SkillSet_WP_Item_kA_DA_61_2`, Kowazan's Madness: `+1250` raw Melee Critical Hit Chance during ordinary day and `+2500` during ordinary night.

Both rules are exact innate-item carriers. Dawn, dusk, unspecified time, and Eclipse fail closed when either source is active. Eclipse has distinct client rows, but its activation graph is not decoded. The evaluator also blocks the older Kowazan effects that share the same abnormal-state controllers, so no winner or stacking behavior is invented.

## Drift and reproducibility gates

Run:

```powershell
node scripts/build-scenario-effect-catalog.mjs
node --test scripts/tests/scenario-effect-catalog.test.mjs
```

The tests prove:

1. Exact equality with the 62, 159 and 286 conditional ID universes in `web/tl-passive-effect-contract.js`.
2. Exact equality between the nine wholly unsupported set breakpoints and `UNSUPPORTED_SET_BREAKPOINTS`.
3. An explicit, unique registry of fourteen mixed conditional set remainders.
4. Exactly 530 unique shells and the expected family/support-state counts.
5. Codepoint-stable ordering and byte-for-byte regeneration of the checked-in browser artifact.
6. Every shell has carriers, provenance, source edges and unresolved fields, with no executable semantic defaults.
7. Missing projection records and game-build mismatches fail closed.
8. Exactly the six reviewed distance and ordinary day/night IDs resolve to present executable definitions; Predator's Focus remains unsupported.

## Boundary of this milestone

This foundation answers which effects remain and where each comes from. For the six promoted rules it also identifies the reviewed executable authority without copying that arithmetic into the catalogue.

The next safe implementation step is to repeat this explicit promotion process for the decoded-provable Health and Mana threshold family. Static build totals must remain separate from every scenario overlay.
