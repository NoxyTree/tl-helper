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
| Weapon passive components | 63 |
| Non-structured mastery nodes | 159 |
| Item passives and Skill Core complexes | 286 |
| Conditional set components | 23 |
| **Total** | **531** |

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

The catalogue does not parse description prose into triggers, formulas, proc rates, durations or stacking rules. Four decoded distance effects, two decoded ordinary day/night item effects, two decoded self-resource threshold masteries, and five decoded source-motion components now point to separately reviewed scenario implementations. The other 518 entries remain non-executable until their fields are independently decoded, reviewed and represented by a separate scenario rule. There is no default classification or fallback rule.

## Support-state meanings

| State | Count | Meaning |
| --- | ---: | --- |
| `catalogued_unmodeled` | 496 | The source and carrier are known, but no executable scenario semantics are claimed. |
| `scenario_executable_decoded` | 13 | A reviewed decoded rule has an exact module, evaluator export and definition key. |
| `unsupported_static_calculator` | 9 | The complete set breakpoint is outside persistent sheet totals. |
| `static_component_only` | 13 | The persistent set component is calculated elsewhere; only the conditional remainder is represented here. |

These are work-queue states, not final-damage confidence claims. The four distance rules use decoded exact coefficients and reviewed source gating, but retain `serverRounding` as an explicit unresolved field. The two ordinary day/night rules use decoded fixed amounts with no arithmetic rounding. The two self-resource rules use decoded exact threshold operators and integer basis-point comparisons with no unresolved arithmetic fields. The five source-motion rules use decoded duration thresholds, raw values, carrier gates, replacement behavior, and integer arithmetic without estimating uptime. Every other entry uses an `unsupported` precision stage and explicitly sets executable precision to false.

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

## Reviewed self-resource threshold promotions

The following entries reference `web/tl-resource-threshold-scenario-effects.js`, `evaluateResourceThresholdScenarioEffects` and their exact `RESOURCE_THRESHOLD_EFFECT_DEFINITIONS` key:

- `Sword2h_Hero_Attack_01`, Critical Equilibrium. Selected ranks 1 through 10 grant decoded raw `660` through `1200` Critical Damage at source Health `>= 50.00%`, or the same-rank Critical Damage Resistance at source Health `< 50.00%`.
- `Orb_Rare_Util_Skill`, Tranquil Will. The selected synergy mastery grants raw `1500` Mana Cost Efficiency at source Mana `<= 33.00%`.

The resource contract stores optional participant-owned `currentRatioBps` values from `0` through `10000`. Missing state is unspecified and fails only an active mastery that needs that resource. The selected mastery level and equipped weapon family are both required. Exactly `50.00%` belongs to Critical Equilibrium's high-Health branch; `33.00%` activates Tranquil Will, while `33.33%` does not.

## Reviewed source-motion promotions

The following components reference `web/tl-motion-scenario-effects.js`, `evaluateMotionScenarioEffects` and their exact `MOTION_EFFECT_DEFINITIONS` key:

- `SkillSet_WP_BO_S_InplaceAttack`, Rapidfire Stance: after 2s stationary, its exact level curve grants Attack Speed and all Hit Chance; it survives movement skills and ordinary movement for under 2s.
- `Bow_High_Tac_Skill`, Battle Tempo: when selected with Rapidfire Stance, it replaces the activation threshold with 4s and uses the exact transformed Attack Speed curve while retaining Rapidfire's Hit Chance.
- `SkillSet_WP_ST_S_ManaRegenBuff`, Asceticism: after 3s stationary, it adds the second exact Mana Regen curve and the exact all Heavy Attack Chance curve; its first Mana Regen curve remains separately calculated as persistent static state.
- `SkillSet_WP_Item_FieldBoss_T3_ST_02`, Aridus's Fury: after 3s stationary, the exact innate item or selected Skill Core carrier grants raw `1200` Base Damage modifier and retains it for under 2s after movement.
- `set_aa_t4_leather_001:4`, Stigma Executor: after 4s stationary, its conditional remainder grants raw `1500` Critical Damage and is removed immediately upon movement; the persistent raw `2000` component remains separately calculated.

CombatScenario v3 stores the participant-owned motion union. It distinguishes stationary duration bands, ordinary movement from movement skills, moving duration, and the prior stationary band. Missing or partial relevant state fails the complete scenario overlay closed. It does not replay movement or estimate uptime.

## Drift and reproducibility gates

Run:

```powershell
node scripts/build-scenario-effect-catalog.mjs
node --test scripts/tests/scenario-effect-catalog.test.mjs
```

The tests prove:

1. Exact equality with the 62 conditional weapon-passive IDs, one mixed weapon-passive remainder, 159 mastery IDs and 286 item or Skill Core IDs in `web/tl-passive-effect-contract.js`.
2. Exact equality between the nine wholly unsupported set breakpoints and `UNSUPPORTED_SET_BREAKPOINTS`.
3. An explicit, unique registry of fourteen mixed conditional set remainders.
4. Exactly 531 unique components and the expected family/support-state counts.
5. Codepoint-stable ordering and byte-for-byte regeneration of the checked-in browser artifact.
6. Every shell has carriers, provenance, source edges and unresolved fields, with no executable semantic defaults.
7. Missing projection records and game-build mismatches fail closed.
8. Exactly the thirteen reviewed distance, ordinary day/night, self-resource, and source-motion IDs resolve to present executable definitions; Predator's Focus remains unsupported.

## Boundary of this milestone

This foundation answers which effects remain and where each comes from. For the thirteen promoted rules it also identifies the reviewed executable authority without copying that arithmetic into the catalogue.

The next safe implementation step is to repeat this explicit promotion process for recent movement-skill use and other short-lived source events. Static build totals must remain separate from every scenario overlay.
