# PvP Matchup calculation audit

Audited 11 July 2026 against game-data build `24118850`, the Questlog-parity
stat expansion rules, resolved BuildSnapshot contribution rows, the official
mode caps recorded in `pvp-formula-research-2026-07-11.md`, and the Combat Lab
browser workflow.

## Correct stat-selection rule

The scoped fields below are complete PvP projections, not bonuses:

- `pvp_{type}_accuracy`
- `pvp_{type}_evasion`
- `pvp_{type}_critical_attack`
- `pvp_{type}_critical_defense`
- `pvp_{type}_double_attack`
- `pvp_{type}_double_defense`

`type` is `melee`, `range`, or `magic`. The static engine recursively expands
ordinary typed stats into these PvP fields and then adds PvP-only sources.
Combat Lab must therefore use the scoped PvP value directly. Adding the normal
value double-counts it; using only the normal value drops PvP-only sources.

Example regression: normal Magic Heavy Attack `2384`, complete PvP Magic Heavy
Attack `3496.8`. The matchup input must be `3496.8`.

SDB and SDR remain `skill_power_amplification` and `skill_power_resistance`.
There is no separate scoped PvP projection for either field.

## Contest cap correction

Hit/Evasion and Critical/Endurance do not share cap directions:

| Mode | Hit minus Evasion | Critical minus Endurance |
| --- | --- | --- |
| General PvP | +3000 / -4500 | +4500 / -3000 |
| Battleground | +2000 / -3000 | +3000 / -2000 |
| Arena | +1500 / -2250 | +2250 / -1500 |

Heavy Chance/Evasion currently uses the Critical/Endurance cap family. This is
modeled with medium confidence; the subtract-first operation and current server
rounding remain explicitly unresolved.

## Verified behavior after correction

- Main-weapon attack type selects the matching scoped PvP stat family.
- Complete PvP totals replace normal totals without addition.
- Tenths are retained for projected values such as `3496.8`.
- Hit and Critical use separate official cap orientations in all three modes.
- Result cards show the actual operands and only say `capped` when a clamp was
  applied.
- SDB/SDR still uses the signed difference model and does not claim final
  damage.

## Remaining product risks

- Manual edits are overwritten when builds or attack type change. A later UI
  slice should separate build-linked inputs from a manual scenario mode.
- Dual-weapon builds default to the main weapon; off-weapon skills still need
  an explicit attack-type override.
- Unknown future weapon types should not silently default to melee.
- Heavy denominator/current server rounding and glancing symmetry remain
  modeled rather than exact.
- Final damage still excludes Defense, block, modifier order, and rounding.
