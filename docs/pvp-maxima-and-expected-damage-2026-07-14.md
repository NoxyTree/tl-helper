# PvP maxima and expected-damage comparison

Date: 2026-07-14  
Game data build: 24118850  
Item Potentials: excluded

## Scope

This review has two outputs:

1. Legal maximum static PvP offensive and defensive totals, including the weapon pairings that can attain them.
2. An evidence-scoped expected-damage comparison for deciding between Critical, Heavy Attack, Base Damage, and Skill Damage Boost.

The final offensive sweeps use the whole decoded item catalogue with minimum item level 0. Heavy Attack Evasion was also checked against every lower-level item by a source-bounded audit. Endurance and ordinary Evasion currently retain the verified endgame eligibility rule of maximum item level 50 or higher because their unrestricted searches exceeded the resource cap. Calculations include legal equipment, equipment sets, artifact sets, attributes, normal runes, persistent selected-weapon passives, selected-weapon mastery, Overall Mastery, and Heroic limits. Conditional combat scenarios are excluded unless stated. Item Potentials remain excluded.

## Expected-damage model now implemented

The resolver is `packages/combat-engine/src/expected-damage.mjs`. The browser receives the byte-identical copy produced by `scripts/sync-combat-engine-web.mjs`.

For one reviewed damage component, it calculates these mutually exclusive branches:

- miss;
- glance;
- glance plus Heavy Attack;
- normal;
- normal plus Heavy Attack;
- critical;
- critical plus Heavy Attack.

The probability-weighted branch total uses:

- typed Hit versus Evasion;
- typed Critical Hit versus Endurance;
- typed Heavy Attack Chance versus Heavy Attack Evasion;
- Critical Damage versus Critical Damage Resistance;
- Heavy Attack Damage versus Heavy Attack Damage Resistance;
- Skill Damage Boost versus Skill Damage Resistance;
- the reviewed ability coefficient at the correct equipped weapon hand's minimum and maximum Base Damage.

Critical selects maximum Base Damage. Glance selects minimum Base Damage. Normal uses the midpoint of the projected linear component range. The Heavy-plus-glance interaction is evaluated both ways. A comparison is model-stable only when one build's minimum sensitivity result exceeds the other build's maximum sensitivity result.

Heavy Attack Damage uses the bonus-only canonical calculator field:

```text
Heavy multiplier = max(2 + Heavy Damage bonus% - Heavy Damage Resistance%, 1.5)
```

The previous `1 + positive_difference` interpretation was incorrect for this field and has been fixed in the shared PvP model.

## What the comparison does not claim

The current result is expected damage per reviewed component before Defense, block, flat Bonus Damage, flat Damage Reduction, conditional combat state, final modifier order, and server rounding. It is not whole-skill damage or DPS.

The first reviewed damage component is Judgment Lightning's first-cast per-hit component. Other named skills remain unavailable until their component counts and live action semantics are reviewed. Unknown weapon families and abilities with multiple eligible components fail closed.

If omitted build inputs such as Bonus Damage, typed damage modifiers, PvP damage modifiers, or Shield Block Penetration differ between the two attackers, the UI reports that the full ranking remains unsupported instead of presenting an included-stage leader as the final winner.

## Maximum legal static totals

The following tables are populated from independent exhaustive or source-bounded searches. Display values are calculator raw values after the canonical stat-unit conversion.

### Offensive PvP chance

| Objective | Maximum | Weapon pairing(s) | Notes |
|---|---:|---|---|
| PvP Melee Heavy Attack Chance | 4,994.2 | Greatsword + Spear | Whole catalogue; nearest checked Greatsword + Gauntlet is 4,970.8 |
| PvP Ranged Heavy Attack Chance | 4,348.6 | Crossbow + Gauntlet | Whole catalogue; Bow + Gauntlet is 24 lower from mastery |
| PvP Magic Heavy Attack Chance | 5,068.8 | Staff + Wand | Whole catalogue; Staff + Orb is 5,056.8 |
| PvP Melee Critical Hit Chance | 6,597 | Dagger + Greatsword | Whole catalogue; DEX 55 / CON 4 |
| PvP Ranged Critical Hit Chance | 7,249 | Dagger + Bow | Whole catalogue; DEX 55 / CON 4 |
| PvP Magic Critical Hit Chance | 6,288.2 | Dagger + Staff | Whole catalogue; DEX 55 / CON 4 |

Heavy Attack decomposition:

- Melee raw 49,942: weapons 15,540; armor/material/runes 11,570; accessories 17,240; Deathless One artifact traits 2,160; selected Greatsword/Spear mastery 1,832; STR 50/80 breakpoints 1,600. No equipment set breakpoint contributes.
- Ranged raw 43,486: weapons/resonance/runes 13,440; armor/runes 11,420; accessories/runes 13,850; Deathless One artifact traits 2,160; selected Crossbow/Gauntlet mastery 1,016; STR 50/80 breakpoints 1,600. No equipment set breakpoint contributes.
- Magic raw 50,688: weapons/resonance/runes 15,540; armor/material/runes 11,750; accessories/runes 17,890; Punisher's Wings 2-piece 1,500; Deathless One artifact traits 2,160; selected Staff/Wand mastery 848; STR 50 breakpoint 1,000.

The three Heavy winners were rerun with minimum item level 0 and retained the same equipment IDs. They are whole-catalogue maxima for the decoded data build within the stated static configuration model. Main/off-hand order is reversible for these persistent totals. A foreign stored Staff mastery control contributed zero until Staff was actually equipped, confirming selected-weapon progression gating numerically.

The three Critical rows are exact totals for the returned legal builds from whole-catalogue bounded searches. They use Overall Mastery level 1560, the canonical 220-point mastery budget for each selected weapon, the eight-passive cap, and selected-weapon-only progression. Because progression is reranked only for a retained finalist pool, these are best-found legal maxima rather than a formal mathematical proof over every progression permutation.

### Defensive PvP ratings

| Objective | Maximum | Weapon pairing(s) | Notes |
|---|---:|---|---|
| PvP Melee Endurance | 5,770 | Bow + Sword | Endgame-only best found; CON 59 |
| PvP Ranged Endurance | 5,591 | Bow + Sword | Endgame-only best found; CON 59 |
| PvP Magic Endurance | 5,274 | Bow + Sword | Endgame-only best found; CON 59 |
| PvP Melee Heavy Attack Evasion | 3,811 | Orb + Wand | Whole-catalogue source-bounded; CON 59 |
| PvP Ranged Heavy Attack Evasion | 3,533 | Orb + Wand | Whole-catalogue source-bounded; CON 59 |
| PvP Magic Heavy Attack Evasion | 3,623 | Orb + Wand | Whole-catalogue source-bounded; CON 59 |
| PvP Melee Evasion | 3,782 | Crossbow + Dagger | Endgame-only best found; DEX 55 / CON 4 |
| PvP Ranged Evasion | 3,458 | Crossbow + Dagger | Endgame-only best found; DEX 56 / CON 3 |
| PvP Magic Evasion | 3,806 | Crossbow + Dagger | Endgame-only best found; DEX 55 / CON 4 |

The raw calculator totals for the defensive searches were respectively 57,700 / 55,910 / 52,740 Endurance, 38,110 / 35,330 / 36,230 Heavy Attack Evasion, and 37,820 / 34,580 / 38,060 Evasion. Every typed PvP contest rating uses the same raw-to-display multiplier of 0.1. A missing unit-map entry for several typed PvP fields was corrected so result formatting and optimizer inputs now agree with Combat Lab.

Defensive decomposition:

- Endurance: 22,790 PvP-all plus 720 direct typed PvP, then 34,190 melee, 32,400 ranged, or 29,230 magic ordinary typed Endurance. Greedseeker 6-piece is common. The typed variants use Skilled Veteran 2-piece for melee, Steel Wall 2-piece for ranged, and Prayer of Salvation 2-piece for magic.
- Heavy Attack Evasion: 15,970 PvP-all plus 720 direct typed PvP, then 21,420 melee, 18,640 ranged, or 19,540 magic ordinary typed Heavy Attack Evasion. Frigid Melody 2-piece and Wildlands Protector 6-piece are active.
- Evasion: 9,240 PvP-all plus 720 direct typed PvP, then 27,860 melee, 24,620 ranged, or 28,100 magic ordinary typed Evasion. Dawn of Black Lament 2-piece, Wildlands Protector 6-piece, Wind's Guidance, DEX 70, and selected-weapon Evasion mastery contribute.

No conditional scenario effect, Item Potential, suppressed set breakpoint, or foreign-weapon progression was included. Heroics were eligible under the legal caps but none won these defensive objectives. These are exact legal totals for the returned configurations from repeated deterministic bounded searches, not mathematical proofs over every progression rerank. The Endurance and ordinary Evasion rows must not be called whole-catalogue maxima: a direct source audit found lower-level items that can improve their source bounds, while the corrected unrestricted searches were stopped after exceeding the resource cap. Heavy Attack Evasion did survive the lower-level audit: no legacy item beats the selected item in any slot, and the only relevant legacy set bonus loses at least 3,000 raw after the required substitutions.

## Optimizer configuration correction found during the maxima audit

The audit found that generated equipment candidates left resonance empty and generated artifact candidates explicitly emitted empty trait and resonance arrays. This understated candidate totals and could change rankings in Build From Scratch and normal replacement optimization.

The generator now:

- selects one goal-aware maximum-tier resonance row for each generated equipment candidate;
- selects up to three goal-aware maximum-tier artifact traits;
- selects one goal-aware maximum-tier artifact resonance row when available;
- includes the configured artifact stat, traits, and resonance in artifact candidate scoring;
- continues to exclude Item Potentials.

## Verification contract

- Combat-engine package tests include the expected-damage resolver.
- Browser and package combat-engine modules must remain byte-identical after synchronization.
- Branch probabilities normalize exactly to 1 after fixed-point truncation.
- Required ability weapon and hand are enforced per attacker.
- Manual source and target matchup edits feed the primary comparison.
- Alternative attackers use their canonical offensive snapshot against the same edited target profile.
- Stable-winner percentages use the guaranteed interval margin, not the preferred model's midpoint.
- Full repository tests must pass before release.
