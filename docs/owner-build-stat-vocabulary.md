# Owner's build stat vocabulary -> internal stat IDs

The owner describes builds using in-game stat names. Several do not match our
display labels, and one ("Base Damage") has no direct equivalent at all. This
file is the resolved mapping so no session has to re-derive it — every prior
attempt guessed differently.

**Resolved by the owner. Do not re-guess these.**

## The one that keeps getting mis-resolved

**"Base Damage" = Main Weapon Max Damage AND Main Weapon Min Damage** —
`attack_power_main_hand_max` and `attack_power_main_hand_min`, both of them.

It is NOT `attack_power_modifier` ("Attack Power"), which is what sessions
default to because the label looks closest. The owner's words: *"Main Weapon
Max/Min Damage matters a lot as this increases damage a lot."*

Note questlog renders this as a range, `478 ~ 1071` (min ~ max), and the parity
fixture capture splits it into two panel rows — `{"Max Damage": "478", "~":
"1071"}` — which is why it appears unverified. Our calculation matches both ends
exactly; see docs and the parity coverage work.

**Max and Min are not interchangeable and should not be ranked adjacently.**
Criticals select maximum Base Damage, glances select minimum, so at a normal crit
rate Max is worth roughly 19x Min. Base Damage also outranks Skill Damage Boost by
about 5.6x, because Skill Damage Boost saturates and Base Damage does not. Full
weighting, methodology and caveats:
`docs/damage-model-stat-weights-2026-07-25.md`.

## Crusader — Greatsword + Sword & Shield (`sword2h` + `sword`), PvP

Owner's priorities, in the order given:

| Owner's name | Stat ID |
|---|---|
| PvP Endurance | `pvp_all_critical_defense` |
| PvP Melee Hit Chance | `pvp_melee_accuracy` |
| PvP Magic Heavy Attack Evasion | `pvp_magic_double_defense` |
| Cooldown Speed | `skill_cooldown_modifier` |
| Buff Duration | `buff_given_duration_modifier` |
| Collision Chance | `collide_amplification` |

## Enigma — Orb + Staff (`orb` + `staff`), PvE DPS

| Owner's name | Stat ID |
|---|---|
| Skill Damage Boost | `skill_power_amplification` |
| Base Damage | `attack_power_main_hand_max` + `attack_power_main_hand_min` |
| Heavy Attack Chance | `boss_magic_double_attack` |
| Heavy Attack Damage | `double_damage_dealt_modifier` |
| Critical Hit Rate | `boss_magic_critical_attack` |
| Critical Damage | `critical_damage_dealt_modifier` |
| Cooldown Speed | `skill_cooldown_modifier` |
| Attack Speed | `attack_speed_modifier` |

PvE means the **boss context** stats (`boss_*`), not the plain or `pvp_` variants.
Our stats are context-split, so this materially changes the build.

## Labels that differ from questlog

| questlog shows | our label | stat ID |
|---|---|---|
| Movement Speed | Move Speed | `move_speed_modifier` |
| Endurance | Endurance | `all_critical_defense` |
| Heavy Attack Chance | Heavy Attack Chance | `all_double_attack` |
| Heavy Attack Evasion | Heavy Attack Evasion | `all_double_defense` |
| Bonus Damage | Bonus Damage | `damage_reduction_penetration` (NOT weapon bonus damage) |

## Caveat when building from these lists

These are the stats the owner *tunes for*, not a complete build specification.
Optimizing them as the entire objective strips everything undeclared — a Crusader
run against the six above returned 8.69% Block Chance and 31k Max Health. See
`docs/optimizer-undeclared-stat-guard-2026-07-25.md`.
