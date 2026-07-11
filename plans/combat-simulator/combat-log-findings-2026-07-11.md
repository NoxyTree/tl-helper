# Combat-log findings, 2026-07-11

## Evidence

Session: Varkesh against a Practice Dummy, recorded 2026-07-11 from
01:31:17.139 to 01:31:54.367 local time.

Preserved source:

`D:\TL_Data\calibration\24118850\combat-logs\damage-dummy-varkesh-2026-07-11-013106.txt`

SHA-256:
`AC019FE4245A48CED58F3E630830F4DC0999BCC4569C8CC4DE225E8D47571F5D`

The three accompanying stat screenshots are preserved under the build's
calibration `screenshots` directory. A reviewed machine-readable manifest is
stored beside the log as
`damage-dummy-varkesh-2026-07-11-013106.session.json`.

## Version 4 schema

The file starts with `CombatLogVersion,4`, followed by ten-field CSV records:

```text
Timestamp, LogType, SkillName, SkillId, Damage,
HitCritical, HitDouble, HitType, CasterName, TargetName
```

This field order matches the published Detailed Battle Log specification
mirrored in the December combat-analysis update notes:

`https://throneandliberty.gameslantern.com/news/notice-tuesday-2-december-update-notes`

The local file independently confirms the outcome fields:

- all 336 rows with `HitCritical=1` use
  `kMaxDamageByCriticalDecision`
- all 195 rows with `HitCritical=0` use `kNormalHit`
- `HitDouble` distinguishes normal from Heavy Attack outcomes

The numeric ID is an effect or skill variant ID, not a unique localized-skill
ID. For example, Manaball and Stellar Dash each appear with three different
IDs, while their localized names are shared.

## Session inventory

| Measure | Value |
| --- | ---: |
| Records | 531 |
| Duration | 37.228 seconds |
| Total logged damage | 5,231,742 |
| Normal, non-heavy | 102 |
| Normal, heavy | 93 |
| Critical, non-heavy | 134 |
| Critical, heavy | 202 |
| Source and target | Varkesh to Practice Dummy |

Every record is `DamageDone`. There are no healing, self-target, HP, resource,
buff-application, or buff-removal events in this session.

Outcome counts are correlated within multi-hit abilities. They are useful for
session description but must not be treated as 531 independent chance trials.

## Build snapshot

The user identified the supplied screenshots as the build used for this log.
Key visible stats are:

| Stat | Value |
| --- | ---: |
| Base Damage | 366 to 993 |
| Healing | 0% |
| Healing Received | 4.2% |
| Skill Damage Boost | 713.7 |
| Health Regen | 2,144.375 |
| Critical Damage | +21% |
| Heavy Attack Damage | +128.4% |
| Magic Heavy Attack Chance | 1,521.8 |
| Melee Heavy Attack Chance | 1,158.8 |
| Ranged Heavy Attack Chance | 1,122.8 |
| Cooldown Speed | +103.2% |
| Buff Duration | +65.62% |

The screenshots were taken after the rotation and do not show the active-effect
row. They establish the equipped build totals, not the per-hit passive state.

## Heavy Attack magnitude finding

The displayed `+128.4% Heavy Attack Damage` predicts a Heavy magnitude of:

```text
normal magnitude * (1 + 1.284) = normal magnitude * 2.284
```

Several near-simultaneous same-effect pairs isolate this relationship:

| Effect | Non-heavy | Heavy | Observed ratio |
| --- | ---: | ---: | ---: |
| Manaball Eruption | 2,941 | 6,717 | 2.283917 |
| Manaball Eruption | 2,824 | 6,450 | 2.283994 |
| Manaball Eruption | 3,544 | 8,094 | 2.283860 |
| Rift Fracture | 2,167 | 4,950 | 2.284264 |
| Rift Fracture | 2,687 | 6,137 | 2.283960 |
| Stellar Echo | 1,422 | 3,247 | 2.283404 |
| Stellar Echo | 1,244 | 2,840 | 2.282958 |
| Stellar Echo | 710 | 1,621 | 2.283099 |
| Stellar Dash | 4,366 | 9,971 | 2.283784 |

A through-origin fit across these nine pairs gives `2.2838604`. Evaluating
each non-heavy value at the displayed `2.284` multiplier leaves residuals from
0.016 to 1.296 final damage points in magnitude.

Classification: **calibrated high confidence** that displayed Heavy Attack
Damage is the percentage increase above the normal resolved magnitude for
these damage effects. The remaining one-point differences leave exact hidden
precision and rounding order unresolved.

This does not resolve the Heavy Attack chance contest curve. Magnitude and
proc probability are separate mechanics.

## Critical outcome finding

The log directly labels every critical row as
`kMaxDamageByCriticalDecision`. This is strong evidence that the critical
decision selects a maximum-damage branch. It does not by itself establish
where the visible Critical Damage modifier is applied or how that branch
interacts with every skill-specific effect.

Classification: **extracted log semantics**, with damage-pipeline ordering
still calibration-required.

## Healing limitation

This file cannot answer whether Healing Received affects self-healing. It
contains no Swift Healing or other healing events. The version 4 published
schema documents `DamageDone`, and the original combat-analysis announcement
said attack-related metrics were being released first.

Continue using screenshots or video for the current high-Healing-Received
batch. A single short logger test containing one self-heal is enough to check
whether the current client has added an undocumented healing event type, but
it is not necessary to repeat the entire healing experiment with logging.

## Implementation consequences

1. Add a versioned combat-log importer before asking for large manual damage
   transcriptions.
2. Preserve numeric effect IDs and localized names separately.
3. Record Critical and Heavy outcome flags directly instead of inferring them
   from floating-number styling.
4. Use clustered or effect-aware sampling for chance estimates because
   multi-hit rows are correlated.
5. Add the calibrated Heavy Attack magnitude as a provenance-gated engine
   candidate while leaving its exact rounding stage unsupported.
6. Do not use this log to modify healing formulas.
