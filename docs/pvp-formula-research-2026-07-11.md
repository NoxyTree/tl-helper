# PvP formula research — community/datamined evidence (2026-07-11)

Web research pass to reduce the in-game PvP test packages. Five parallel sweeps over
Maxroll, Metabattle, TL Codex (datamined tooltips), Inven KR, Reddit, Steam, community
calculators (Aragon's sheet, yiin/tnl-dmg-calc, wtfomg.eu), and official patch notes.

## Package 1 — Skill Damage Boost vs Skill Damage Resistance: LARGELY RESOLVED

Best-supported model (hypothesis "subtract first, then convert"):

```
diff = SDB − SDR
mult = diff > 0 ? 1 + diff/(diff+1000) : 1 − |diff|/(|diff|+1000)
```

- Primary: u/UgoRukh (aka Rabubu29) damage-formula compendium, r/throneandliberty
  2025-04-18 (post id 1k2cgcp), in-game tested, incl. the negative branch
  ("Time for Punishment vs 0-SDR target"). Independent confirmation in comments
  (ClocksKnot). Operationalized verbatim in https://github.com/yiin/tnl-dmg-calc
  (src/calculations.ts) and in Aragon's calculator sheet.
- Maxroll/Metabattle's "separate conversion" model was specifically tested and refuted.
- "Only higher stat applies" refuted by the tested negative branch.
- CAVEAT: the 1000 divisor may scale with content level (Talandre-era comments suggest
  possibly Level×20); Maxroll now lists SDR/(SDR+700), possibly a rebalance artifact.

Guildmate session downgraded from "discriminate 3 hypotheses" to a ~10-hit confirmation
spot-check, ideally at level-cap gear to probe the divisor.

## Package 2 — Heavy Chance vs Heavy Evasion: STILL THE TOP UNKNOWN

- Offensive curve x/(x+1000) is empirically solid: Inven KR 1,000-hit-per-bracket dummy
  test (crit 750 → 43.6% observed vs 42.9% predicted; heavy 220 → 16.8% vs 18.0%).
  https://www.inven.co.kr/webzine/news/?news=292667&site=tl and
  https://www.inven.co.kr/board/tl/6069/743 (measured table matching x/(x+1000)).
- Heavy Attack Evasion: every source only *asserts* it subtracts like Endurance before
  the curve. ZERO published tests or datamine. This package stands as designed.

## Package 3 — Crit/Heavy damage resistance: MOSTLY RESOLVED (datamined floors)

TL Codex datamined tooltip strings (https://tlcodex.com/en/stats/):
- Critical Damage Resistance: "the damage does not go lower than the Base Damage of the
  Critical Hit" → CritMult = 1 + max(CritDamage − CritResistance, 0). Floor confirmed
  by client data; additive subtraction is the natural reading but strictly inferred.
- Heavy Attack Damage Resistance: "Cannot reduce Heavy Attack Damage below 150% of Base
  Damage" → HeavyMult = max(2 + HD% − HR%, 1.5). The canonical calculator field
  `double_damage_dealt_modifier` is a bonus-only value, so its raw percentage must not
  be reinterpreted as a base-inclusive character-sheet total.
- Aragon: heavy = the hit applied twice; flat Bonus Damage is NOT doubled — it is split
  across the two hits. Bonus Damage nets against target's flat Damage Reduction.

Guildmate session reduced to one resistance-swap sanity check (confirm point-for-point
additive subtraction + observe floor onset).

## Package 4 — Defense & PvP modifier: SHAPE CONFIRMED, CONSTANT LEVEL-SCALED

- Mitigation = Def/(Def+K). K=2500 is the launch/level-50 value (Metabattle 2024-08).
  Aragon's calculator (2025-04-28, most-tested community source) states explicitly:
  "the modifier changes based on level, this is for level 55" with Damage × 1/(1+Def/2750)
  → K=2750 at 55 (~50/level, single datapoint, unverified curve).
- NO global hidden PvP multiplier. The PvE/PvP gap is per-skill "monster damage
  amplification" — officially confirmed in Update 4.0.0 notes (e.g. Zephyr's Nock
  40%→90%, Quick Fire 100%→150%). PvP damage is the un-amplified baseline.
  These per-skill amp values should be extractable from our client data.
- PvP stat caps since patch 3.28.0 (Maxroll): Hit/Evasion +3000/−4500 open world,
  +2000/−3000 battlegrounds, +1500/−2250 arena; Crit/Endurance +4500/−3000 /
  +3000/−2000 / +2250/−1500. Damage Reduction is 1:1 in PvP.
- Guildmate session refocuses on: current-cap K value, and rounding.

## Glancing (friend's tip): CORROBORATED MODEL

- When defender Endurance > attacker Crit: crit chance 0, and
  GlanceChance = (End − Crit)/((End − Crit) + 1000) (same curve, inverted diff —
  Steam/Norix, Gameslantern, Metabattle consistent).
- A glancing hit is NOT a flat % reduction: it forces the MINIMUM base-damage roll
  (mirror of crit forcing max). Effective loss depends on the skill's min–max spread.
- Curve constant inferred by symmetry only — no bracketed test published. Interaction
  glancing×heavy undocumented.

## DoTs (friend's tip): PARTIALLY CORROBORATED, ONE CONTESTED POINT

- Base damage = (min+max)/2 always: CONFIRMED (Rabubu29; stat-point math in thread
  built on it — min+max stats equal 2-max stats for DoTs).
- DoTs can heavy: CONFIRMED twice independently (Rabubu29; syanoe.com KR tick test
  observing ~4× anomalous ticks, 2024-01).
- "DoTs can't crit": CONTESTED. Rabubu29 explicitly says DoTs CAN crit — the Critical
  Damage % multiplier applies, but base stays the average (no max-roll promotion).
  The KR tester saw no crits on ticks. Unresolved; needs tick-level logs.
- DoTs DO take Skill Damage Boost and Defense mitigation; they IGNORE flat Bonus Damage
  and flat Damage Reduction (datamined: both stats "only apply to damage with on-hit
  effects" — tlcodex; Maxroll/Metabattle agree).

## Shield block

- 40% reduction (retain 60%) as a multiplicative term: corroborated (Rabubu29; 0.4
  constant in tnl-dmg-calc). Empirical, not datamined.
- Block chance = Shield Block Chance − attacker Shield Block Penetration Chance
  (direct %, not a rating curve).
- Separate stat "Shield Damage Reduction" scales magnitude (Aegis Shield passive
  +25–55%); stacking with the 40% base (additive vs multiplicative) is undocumented.
- Blocked hits can still crit/heavy — block just multiplies by 0.6.

## Canonical community pipeline (Rabubu29, best available)

```
(((skillPotency × BaseDMG) + skillFlatAdd)
  × Defense% × Block% × CritDamage% × SkillDamageBoost% × SpeciesBoost% × PVE%/PVP%)
  × HeavyAttack + BonusDamage − DamageReduction
```
BaseDMG: crit → max, glance → min, else uniform roll. (A commenter's correction places
Bonus Damage after the heavy multiplier, split across heavy's two hits per Aragon.)

## Still genuinely needs in-game testing (revised)

1. Heavy Chance vs Heavy Evasion — no data anywhere (top priority now).
2. Server rounding mode/placement — zero sources document it.
3. Defense K at current level cap (one 2750@55 datapoint; is it Level×50?).
4. Glancing curve constant (symmetry-inferred) and glancing×heavy interaction.
5. DoT crit behavior (contradictory sources).
6. Shield Damage Reduction stacking with the 40% base.
7. Hit vs Evasion constant (asserted, never large-sample tested).

## Checkable against EXISTING data (no guildmates needed)

- Historical character-sheet screenshots may still need UI-label interpretation, but
  the decoded static calculator field used by TL Helper is bonus-only.
- Bonus-damage-split-across-heavy-hits — refit the 531 PvE log records.
- Per-skill monster damage amplification values — extract from client data; also
  explains any PvE-vs-tooltip residuals in the calibration set.
- Defense K vs PvE mobs at known mob defense values, if any are datamined.

## Key sources

- Rabubu29/UgoRukh formula post: https://www.reddit.com/r/throneandliberty/comments/1k2cgcp/
  (Wayback: http://web.archive.org/web/20250801104116/...)
- Aragon PvE damage calc: https://docs.google.com/spreadsheets/d/1vFu4MISz7fzpX5bDHX5vtEdmbYCxkQgi4FLE0seHVHY
- yiin/tnl-dmg-calc: https://github.com/yiin/tnl-dmg-calc
- TL Codex datamined stats: https://tlcodex.com/en/stats/
- Maxroll in-depth stats: https://maxroll.gg/throne-and-liberty/resources/in-depth-stats-guide
- Metabattle hidden stats: https://metabattle.com/tl/Hidden_Stats_Guide
- Inven 1000-hit test: https://www.inven.co.kr/webzine/news/?news=292667&site=tl
- Inven measured curve table: https://www.inven.co.kr/board/tl/6069/743
- Update 4.0.0 (monster amp, official): https://www.playthroneandliberty.com/en-gb/news/articles/update-4-0-0
- syanoe.com DoT/Curse Explosion KR test: http://syanoe.com/game/g-information/8727.htm
- Aegis Shield (Shield Damage Reduction): https://throneandliberty.gameslantern.com/skills/aegis-shield
