# Community calculator audit, 2026-07-11

## Purpose

This audit evaluates two user-supplied community calculators without treating
their formulas as authoritative game rules. It compares their assumptions with
decoded build `24118850` data, the existing Questlog reference model, and the
live Swift Healing observations.

The original files are preserved outside the repository at:

`D:\TL_Data\external-references\community-calculators\2026-07-11`

User-provided source sheets:

- `https://docs.google.com/spreadsheets/d/1zujv29bzsOJNZF6xFlxmaX43ZqLCiKEOK8RV1PRtCQc/edit?gid=719590067`
- `https://docs.google.com/spreadsheets/d/1PScRk2LsP5AJ739ITGIKoE0Cg_wSuUiPQNn5YeQol1M/edit?gid=0`

| File | SHA-256 |
| --- | --- |
| `Healing calc.xlsx` | `EC8F0CB706F352C90427535DAAD40CF3416B92501EE76BC47A9C2733FA14CEE8` |
| `Healing calc - HEALING %.csv` | `F1277150185945B9840890A5627371CE392A30B32E82CA4D11F0A9D74D77E5C1` |
| `CALC.xlsx` | `0D9516BBCC0BF7BE5B71E25B75993963034ACC17F803C6E3BCD7DC00D8FBA770` |
| `CALC - Taulukko1.csv` | `A1D5A5EC546A8FAD4E0E2BAAE08A732CB50AFFB312767FAFA345726E0D944A8B` |

The workbook files retain the formulas. The CSV files contain calculated
values only and are useful as quick export cross-checks.

## Evidence policy

These workbooks are `derived_community_reference` evidence. They can supply
candidate formulas and experiment designs, but cannot upgrade an engine rule
to extracted, calibrated, or verified status by themselves.

Evidence priority for conflicts:

1. Live observations that isolate the relevant variable
2. Decoded client data for coefficients and formula hooks
3. Official documentation where it describes the exact mechanic
4. Community calculators and public models
5. Unattributed assumptions

## Healing calculator

### Formula inventory

The main inputs on `HEALING %` are:

- skill coefficient and flat amount
- minimum and maximum Base Damage
- Skill Damage Boost
- outgoing Healing percentage
- Healing Received percentage
- optional Healing Touch and Distorted Sanctuary effects

The important formulas are:

| Cell | Restated formula | Intended use |
| --- | --- | --- |
| `B10` | `(maxBD * coefficient + flat) * (1 + Healing) * (1 + HealingReceived) * (1 + SDB / (SDB + 3000))` | shield estimate |
| `B12:B13` | `(baseDamageModifier) * (1 + combinedHealing) * (1 + HealingReceived) * (1 + SDB / (SDB + 3000)) * stackMultiplier` | displayed minimum and maximum heal |
| `B20:B21` | `minOrMaxBD + (flat / coefficient) * coefficient` | intermediate Base Damage modifier |
| `B22` | `Healing + enabled conditional healing bonuses` | combined outgoing healing |
| `G2` | `3` when the Healing Touch option is enabled, otherwise `1` | full-stack multiplier |
| `G3` | `30%` when the Distorted Sanctuary option is enabled, otherwise `0%` | conditional outgoing healing |

### What matches decoded data

The coefficient stage in `B10` has the same structural form as decoded
`kAmountFromAttackPower` rows:

```text
Base Damage * mul / 10000 + add
```

That structural match is supported by the live-verified tooltip encoding. For
Swift Healing Epic level 4, global level 14, the exact decoded rows are:

| Cast | Formula row | Exact coefficient expression |
| --- | --- | --- |
| first | `WA_Heal_Heal` | `290% * Base Damage + 980` |
| second | `WA_Heal_Heal_Double` | `203% * Base Damage + 686` |

The second expression is exactly 70% of both first-cast coefficients. This
does not establish that an observed cast pair must have a 70% ratio because
runtime Base Damage selection and consecutive-cast state remain unresolved.

Classification: **verified coefficient shape**, but only at the client-visible
coefficient stage.

### Internal defect in the heal range

`B20` and `B21` simplify algebraically to:

```text
Base Damage + flat
```

The coefficient cancels because `(flat / coefficient) * coefficient = flat`.
Consequently, the workbook's `B12:B13` heal outputs do not evaluate the general
decoded expression `Base Damage * coefficient + flat`. This differs from its
own shield formula in `B10`, which does retain the coefficient.

Classification: **contradicted for use as a general decoded skill-heal
calculator**. The workbook's displayed minimum and maximum heal totals must not
be copied into TL-Helper.

### Outgoing Healing

Both decoded Swift Healing rows contain the dynamic hook `HealEffect`. The
workbook models this as a simple multiplicative `(1 + Healing)` stage.

The hook's existence is extracted. Its exact operation, stacking group,
ordering, and rounding are not yet materialized from the game data or isolated
by live testing.

Classification: **extractable hook, community-modeled operation**.

### Healing Received on self-heals

The workbook always multiplies its heal and shield estimates by
`(1 + Healing Received)`. It does not distinguish self-healing from healing
received from another player.

Our two clean non-Aridus Swift Healing batches changed displayed Healing
Received from 4.2% to 9.75%, while keeping displayed Base Damage, outgoing
Healing, and Skill Damage Boost unchanged. After converting second-cast values
to first-cast coefficient equivalents by dividing by 0.7:

| Batch | Equivalent observations | Mean |
| --- | ---: | ---: |
| 4.2% Healing Received | 16 | 2517.7 |
| 9.75% Healing Received | 10 | 2540.5 |

The workbook predicts a multiplier change of:

```text
1.0975 / 1.042 = 1.05326, or +5.33%
```

The observed mean changed by approximately +0.9%. A basic independent-sample
delta estimate gives an approximate 95% interval for the observed ratio of
0.899 to 1.133. The workbook's predicted 1.053 ratio lies comfortably inside
that interval. The within-batch variation is much larger than either point
estimate, so these samples neither confirm nor contradict a 5.33% effect.

Classification: **untested for external healing and unresolved for
self-healing**. Keep the current working hypothesis that the stat may apply
only to healing from another source, but do not encode that hypothesis yet.

### Skill Damage Boost

The workbook applies:

```text
bonus = SDB / (SDB + 3000)
```

It applies that bonus to healing and shielding even when no target resistance
input exists. The separately captured Questlog combat model instead uses a
contest between Skill Damage Boost and Skill Damage Resistance with constant
`1000`:

```text
max(0, boost - resistance) / (max(0, boost - resistance) + 1000)
```

Neither community model proves that this stage applies to Swift Healing. The
two models also disagree on both the denominator and whether target resistance
participates.

Classification: **conflicting community models, live behavior unverified**.
Do not execute either formula for healing or shielding.

### Missing Swift Healing mechanics

The workbook does not model several mechanics already present in our evidence:

- the separate 70% second-cast coefficient row
- the unresolved consecutive-use state
- Heavy Attack producing two heal applications
- the exact Base Damage selection rule
- the server rounding order

It is therefore a useful source of candidate modifier formulas, but not a
drop-in Swift Healing calculator.

## Cooldown and buff-duration calculator

### Cooldown Speed

The workbook computes:

```text
effectiveCooldown = baseCooldown / (1 + CooldownSpeed)
```

Its intermediate displayed reduction is:

```text
1 - 1 / (1 + CooldownSpeed)
```

For the included example, 83% Cooldown Speed and a 12 second base cooldown
produce `12 / 1.83 = 6.557377049` seconds.

The operation is plausible and internally consistent, while the game data and
TL-Helper currently establish the stat total and each skill's base cooldown,
not the final server operation or rounding boundary.

Classification: **community-modeled, calibration required**.

### Buff Duration

The workbook computes:

```text
effectiveDuration = baseDuration * (1 + BuffDuration)
```

For the included example, 83% Buff Duration and a 4 second base duration
produce 7.32 seconds.

This does not cover refresh behavior, maximum duration, server ticks,
recipient-side duration modifiers, debuffs, or effect-specific exceptions.

Classification: **community-modeled, calibration required**.

## Safe implementation consequences

1. Do not add the workbook's final healing or shield totals to the combat
   engine.
2. Retain the decoded Swift Healing coefficient rows as the only executable
   pre-resolution stage.
3. The workbook's Healing, Healing Received, Skill Damage Boost, Cooldown
   Speed, and Buff Duration candidates are recorded in `unknown-formulas.md`
   with community provenance.
4. Keep Healing Received self-heal semantics unresolved.
5. Use the cooldown and buff-duration equations as optional modeled formulas
   only after adding explicit provenance and tests that prevent them being
   reported as verified.
6. Use existing clean video and screenshot evidence before requesting more
   manual testing from the user.

## Smallest next validation work

- Search decoded abnormal-state and formula metadata for the exact operation
  attached to `HealEffect`, `skill_heal_taken_modifier`,
  `skill_power_amplification`, `skill_cooldown_modifier`, and
  `buff_given_duration_modifier`.
- Check whether any existing clean cast can be classified as an isolated fresh
  cast before requesting new gameplay capture.
- Do not repeat the existing small Healing Received change at high volume. If
  a materially larger change can be made while Base Damage, outgoing Healing,
  and Skill Damage Boost remain fixed, 8 to 10 paired activations would be a
  more useful low-burden test. Otherwise defer this question until a natural
  external-heal comparison is available.
- Calibrate Cooldown Speed from one visible skill tooltip or stopwatch pair,
  then test one high-value decimal boundary for rounding.
