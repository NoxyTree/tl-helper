# First calibration session findings — 2026-07-10

Evidence: 21 immutable observations in `D:\TL_Data\calibration\24118850\`
(experiments `swift-healing-tooltip-basis`, `gaia-crash-tooltip-basis`,
`distortion-veil-tooltip-basis`, `swift-healing-baseline-a`,
`distortion-veil-baseline-a`, `gaia-crash-dummy-a`) with 27 screenshot files
under `screenshots\`. Character: Varkesh, level 60. Live client version string
was not captured; every checked value matches build `24118850` decoded data.

### Session condition added after review

The player subsequently confirmed that Stellarite was equipped during these
observations. The recorded stat-panel Base Damage ranges already include its
static attack-power modifier, so this does not change the tooltip-coefficient
verification or the evidence for a varying per-cast Base Damage roll. It does
prevent treating the Gaia Crash hits as a clean consumable-free pipeline test,
and Stellarite applicability must be controlled explicitly before using future
heal or shield samples to discriminate multipliers. This note adds context to
the immutable observations; it does not alter them.

## Finding 1 — tooltip coefficient basis: VERIFIED (protocol groups 1–3 complete)

All three skill tooltips match their decoded formula rows exactly, at every
displayed level:

| Skill | Tooltip tier | Displayed Lv.1–5 | Decoded row | Matches global levels |
| --- | --- | --- | --- | --- |
| Swift Healing | Epic | 270%+800 … 310%+1,040 | `WA_Heal_Heal` | 11–15 |
| Gaia Crash | Epic | 285%+67 … 295%+79 | `SW2_GaiaCrash_DD` | 11–15 |
| Distortion Veil | Heroic | 448%+1,575 … 480%+1,835 | `ORB_Active_Shield_ShieldHp` | 16–20 |

Per the protocol decision rules this upgrades the **display encoding**
(`tooltip1 = mul/100`, `tooltip2 = add`) to `verified_exact` for these rows on
this build. It also confirms two derived skill→formula mappings
(`WA_Heal_Heal`, `SW2_GaiaCrash_DD`) against live tooltips.

**New structural discovery: rarity tiers are 5-level windows into the global
level table.** Epic Lv.N = global level N+10; Heroic Lv.N = global level N+15.
Observed on three skills. Inferred (unobserved): base/Rare tiers occupy levels
1–10.

## Finding 2 — Base Damage selection: per-cast roll strongly supported, not yet calibrated

Seven Swift Healing self-casts (Epic Lv.4 = global 14: `290% × BD + 980`)
with Base Damage panel range 364~926, Healing +6%, Healing Received +4.2%:

- Normal: **3,114 / 3,106 / 2,714 / 2,714**
- Heavy Attack procs (player-confirmed, displayed with ×2): **2,856 / 2,365 / 2,365**

The values vary far beyond display noise, rejecting any constant
(min/max/midpoint) model. Implied Base Damage values sit inside 364–926 under
every candidate outgoing-healing multiplier (×1.00, ×1.06, ×1.042, ×1.1045),
so the multiplier and rounding cannot be discriminated yet. Two exact repeats
(2,714 twice, 2,365 twice) hint at value quantization worth watching.

Distortion Veil corroborates: eight self-cast shields (Heroic Lv.2 = global
17: `456% × BD + 1,640`, panel 379~1,023) read **5,562 / 5,562 / 6,910 /
7,690 / 5,627 / 7,932 / 7,803 / 5,003** from the HP-bar overlay — again
widely varying.

## Finding 3 — Heavy Attack procs apply to heals (new mechanic evidence)

Player-confirmed: three of seven Swift Healing casts were Heavy Attack procs,
shown in floating text with an ×2 marker. The healing session's Magic Heavy
Attack Chance was 1,253 (3/7 observed proc rate is consistent with a contest
around that magnitude). Open questions: whether the displayed value is the
pre- or post-doubling amount, and whether Heavy Attack Damage (+133.8%)
modifies heals. Engine consequence: healing outcomes need a heavy branch, not
just damage.

## Finding 4 — Distortion Veil magnitude does not fit the naive model: UNRESOLVED

With the session's displayed stats, `(456% × BD + 1,640)` scaled by the full
Shield Health bonus (+71.47%) puts every observed value below the possible
minimum, while no bonus at all puts the maximum observations above the
possible maximum. The effective multiplier must lie in roughly **+26% to
+49%** if the Base Damage roll model holds. Hypotheses to test: Shield Health
applies partially/conditionally, a hidden basis difference, or the panel stat
does not mean what it appears to mean. Do not model DV shielding magnitude
until resolved.

## Gaia Crash archive (group 9)

Three Practice Dummy hits (7,928 / 6,761 / 6,558 plus small unattributed
secondary numbers) are stored as `draft` consistency evidence only. Target
mitigation, the +100% monster bonus applicability, and pipeline order remain
unknown; per protocol no inference may use these yet.

## Video session addendum (recorded late 2026-07-10, experiment `swift-healing-video-a`)

Two Medal clips (preserved with hashes under
`D:\TL_Data\calibration\24118850\recordings\`) captured 8 rounds of paired
Swift Healing charge casts with the HP bar visible throughout. The clips
overlap by ~40 seconds; duplicated casts were cross-validated and
deduplicated to 16 recorded observations. Session stats: Base Damage
382~985, Healing +15%, Max Health 28,018, Stellarite active, Death
Aftereffect Tier 3 (player-identified as resurrection-cooldown-only).

**Verified via HP-delta arithmetic:**

1. **Heavy heal ×2 semantics proven.** For every ×2-marked heal the HP delta
   equals exactly twice the displayed value plus regen (e.g. 15,647→19,327
   with "+1,788 ×2": 3,680 = 2×1,788 + 104 regen). The displayed value is
   per-application; total healed is double.
2. **Health Regen stat is HP per 10 seconds.** Observed passive regen ~116
   per half-second (~2,320/10s) against a displayed stat of 2,318.
3. **Every non-heavy heal's HP delta reconciles to the displayed value plus
   regen** — floating text is exact, not rounded display.

**Base Damage selection: the roll model is now in doubt.** Round-opening
casts made after a long gap healed **exactly 3,160 all three times**; a
continuous per-cast roll over 382–985 cannot plausibly repeat exactly.
Every cast made within ~10s of a previous cast healed less, but by *varying*
ratios (0.46–0.81 of 3,160) — not the tooltip's flat −30%. No candidate
model fits yet: deterministic 3,160 implies an effective Base Damage of
609.6 (with Healing +15%) or 751.7 (without), neither a panel endpoint nor
the midpoint (683.5). Round 7 (1,943 then 1,449) is anomalously low and
unexplained. The screenshot-session variation earlier in the day is now
suspected to also reflect consecutive-cast state rather than a roll.

**Decisive next experiment (design for the next session):**

1. Ten isolated single casts, each ≥15s after the last, same gear, HP well
   below max, recorded. If all ten heal identically, the fresh-cast
   magnitude is deterministic and the roll hypothesis is rejected for heals.
2. Then swap one item and repeat five isolated casts — the shift identifies
   the Base Damage basis and multiplier.
3. Then map the penalty: pairs of casts with deliberate gaps of 2, 4, 6, 8,
   10, and 12 seconds between them.

## What is still open

1. **Multiplier and rounding discrimination** needs protocol groups 6–7:
   one-item gear changes (configurations B and C) with fresh stat-panel
   screenshots and ≥20 eligible casts each, plus HP-before/HP-after per cast
   (screen recording strongly preferred over single frames).
2. **HealEffect basis**: hold Healing +6% fixed (or change only it) across a
   comparison set.
3. **Distortion Veil multiplier puzzle** (Finding 4).
4. Heavy-heal doubling semantics (Finding 3).
5. Live client version capture at session start (screenshot the version
   string) so patch drift is ruled out explicitly.
