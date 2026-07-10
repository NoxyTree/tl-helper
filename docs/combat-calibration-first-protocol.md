# First combat calibration protocol

## Purpose

This is the smallest safe manual experiment that can answer three questions for build `24118850` without pretending that target mitigation is known:

1. Does a decoded `mul` of `10000` mean `100%` in the displayed and live magnitude formula?
2. Which visible Base Damage value is used: minimum, maximum, average, or a per-use roll?
3. Where is the first integer rounding applied?

The reviewed level-1 rows are:

| Ability | Formula row | Decoded expression |
| --- | --- | --- |
| Gaia Crash | `SW2_GaiaCrash_DD` | `Base Damage * 25500 / 10000 + 37` |
| Swift Healing | `WA_Heal_Heal` | `Base Damage * 16500 / 10000 + 200`, then an unresolved `HealEffect` hook |
| Distortion Veil | `ORB_Active_Shield_ShieldHp` | `Base Damage * 30000 / 10000 + 600` |

Tooltip matching can confirm the coefficient's display basis. Live healing and shield capacity are the primary evidence for Base Damage selection and rounding because armor mitigation does not sit between the formula and their observed values. Gaia Crash is a consistency check only. Do not fit a damage formula from Gaia Crash during this protocol.

## Safety and scope

Use only visible game information, manual input, screenshots, or a user-created recording inspected offline. Do not read process memory, capture packets, inject code, or automate gameplay.

Use a training target, training area, or consenting duel partner for Gaia Crash and shield depletion. Keep the target, content mode, level scaling, and target equipment unchanged. Prefer a non-hostile self-heal for Swift Healing.

Do not activate food, Stellarite, guardian effects, party effects, weapon mastery procs, passives that change Base Damage or healing, or temporary world/content buffs. If an effect cannot be disabled, record it and keep it identical in every configuration.

## Required observation contract

Store one observation per cast, tooltip check, or shield trial. Attempts in the same configuration share an `experimentId` and use increasing `attemptNumber` values. Preserve every raw attempt, including rejected attempts.

The accepted JSON contract is `tl-helper.combat-calibration-observation` version 1:

| Field | Required content |
| --- | --- |
| `schema`, `schemaVersion` | `tl-helper.combat-calibration-observation`, `1` |
| `experimentId` | Safe stable ID for the configuration, for example `swift-healing-baseline-a` |
| `attemptNumber` | Positive integer unique within the experiment |
| `recordedAt` | ISO timestamp with `Z` or an explicit UTC offset |
| `gameBuild`, `gameVersion` | Build is required; version is optional |
| `scenario` | `mode`, `abilityId`, `skillLevel`, and reviewed component row ID |
| `participants.source`, `participants.target` | Each needs a `buildSnapshotId` or SHA-256 `buildSnapshotHash`; a self-heal may use the same snapshot for both |
| `inputs.sourceStats`, `inputs.targetStats` | Relevant visible stat values as decimal strings |
| `inputs.baseDamage` | Either one `value`, or visible `minimum` and `maximum`, as decimal strings |
| `inputs.controlledVariables` | Context such as group, location, target, HP before/after, equipment, changed variable, and display-rounding notes; it must not contain formula claims |
| `inputs.activeEffects` | Checked visible effects, or `[]`; each effect records owner, ID, kind, and optional stacks/magnitude/time |
| `observedOutcome` | Exact visible `magnitude`, five explicit outcome flags, and optional millisecond timestamps |
| `evidence` | Type plus optional path and SHA-256 hash |
| `notes` | Optional manual transcription or ambiguity notes |
| `status` | `draft`, `reviewed`, or `rejected` |
| `reviewer` | Required for `reviewed`; optional otherwise |
| `rejectionReasons` | Required and non-empty only for `rejected`; forbidden for `draft` and `reviewed` |

Allowed evidence types are `manual`, `screenshot`, `recording`, and `ocr_reviewed`. A new manual entry should normally begin as `draft`. After a human checks the visible evidence it may be recorded as a separate `reviewed` observation. A rejected attempt stays in the store with `status: "rejected"` and its reasons. Stored observations are content-addressed and immutable.

See [`scripts/combat-calibration/example-observation.json`](../scripts/combat-calibration/example-observation.json) for a schema-valid draft Swift Healing observation. Its values are placeholders for manual replacement and make no formula or precision claim.

### Recording commands

From `D:\TL_Helper`, copy the example to a working file and replace every
placeholder before recording it:

```powershell
Copy-Item scripts\combat-calibration\example-observation.json D:\TL_Data\swift-observation-draft.json
# Edit D:\TL_Data\swift-observation-draft.json and set valuesArePlaceholders to false.
node scripts\record-combat-observation.mjs --input D:\TL_Data\swift-observation-draft.json --data-root D:\TL_Data --build 24118850
```

Or send the edited working file through standard input:

```powershell
Get-Content -Raw D:\TL_Data\swift-observation-draft.json | node scripts\record-combat-observation.mjs --data-root D:\TL_Data --build 24118850
```

The command validates and normalizes the observation, writes an immutable content-addressed JSON file below `D:\TL_Data\calibration\24118850`, and atomically rebuilds that build's index. Repeating identical input is idempotent.
The recorder refuses the bundled template while `valuesArePlaceholders` is
`true`, preventing example values from entering the evidence store.

## Pre-flight selection

Use level 1 of all three abilities if the current character can do so. If not, use one explicitly recorded level and load coefficients for that level. Never compare different ability levels.

Prepare three source configurations:

- **A, baseline:** the simplest stable equipment set.
- **B, low-boundary change:** change one item so the candidate coefficient result has a fractional part between `.10` and `.49` under at least one plausible Base Damage model.
- **C, high-boundary change:** change one item so the candidate result has a fractional part between `.50` and `.90` under at least one plausible model.

Prefer changes that affect only one end of the displayed Base Damage range. If that is impossible, record both changed endpoints and keep every other visible stat identical. A configuration is not useful for rounding if all candidate results are already integers or all rounding modes predict the same integer.

For healing, first lose enough health that every accepted Swift Healing cast lands below maximum HP. For shield trials, use the same target build and the same repeatable incoming action throughout.

## Nine observation groups

Each numbered group is one controlled observation configuration. Repeated casts within a group are individual attempts, not additional configurations.

1. **Gaia Crash tooltip basis.** Screenshot the level-1 tooltip and source stats in the same session. Confirm that it displays `255% of Base Damage + 37` for decoded `mul=25500, add=37`.

2. **Swift Healing tooltip basis.** Screenshot the level-1 tooltip and source stats. Confirm that it displays `165% of Base Damage + 200` for `mul=16500, add=200`.

3. **Distortion Veil tooltip basis.** Screenshot the level-1 tooltip and source stats. Confirm that it displays `300% of Base Damage + 600` and a 3-second duration for `mul=30000, add=600`.

4. **Swift Healing baseline A.** Record at least 20 eligible, non-critical/non-double/non-triple, non-overheal casts. Capture the HP panel before and after every cast. This distinguishes a constant minimum, maximum, or midpoint from a per-cast Base Damage roll when the outcomes contain more than display noise.

5. **Swift Healing zero-change repeat.** Without changing equipment, stats, skill level, mode, or buffs, close and reopen the character panel and repeat at least 10 eligible casts. Its distribution must agree with group 4. This detects hidden state, transcription error, and temporary effects before any one-variable comparison is trusted.

6. **Swift Healing configuration B.** Equip the preselected one-item change, verify every recorded field, and collect at least 20 eligible casts. Compare the raw outcome set and change from baseline against all candidate Base Damage and rounding predictions.

7. **Swift Healing configuration C.** Repeat group 6 with the high-boundary configuration. B and C together must discriminate truncation/floor from nearest rounding at least once. If they do not, select better boundary configurations instead of drawing a conclusion.

8. **Distortion Veil non-mitigation cross-check.** Record at least 10 shield applications with configuration A. If the UI exposes shield capacity directly, record that exact value. Otherwise, measure an interval: sum separately observed, post-mitigation HP losses from the unchanged incoming action until the shield breaks, and record the last fully absorbed total as the lower bound and the next hit total as the upper bound. Use this only to accept or reject candidate shield magnitudes that fall outside the interval. Do not treat an interval as an exact capacity or use it to derive armor mitigation.

9. **Gaia Crash unchanged-target cross-check.** Against one unchanged training target, record at least 20 normal hits from configuration A and then repeat 10 normal hits without changing anything. Reject critical, Heavy Attack, blocked, missed, PvE-variant, trait-variant, and visibly buffed hits. This tests repeatability and later tooltip-versus-live consistency, but it does not calibrate Base Damage, rounding, or mitigation. Preserve it so the damage pipeline can be calibrated after armor conversion is known.

## Screenshots and manual values

At minimum, capture:

- The game build/version screen or launcher version.
- Each ability tooltip showing name, level, displayed coefficient, duration, and active specialization.
- The full character-stat panel showing Base Damage minimum and maximum immediately before each group.
- Weapon details, traits, level, and relevant mastery/passive screens.
- The visible active-effect bar at the beginning and end of each group.
- Source HP before and after each eligible heal.
- Target HP before and after damage or shield-depletion attempts.
- The floating outcome number and its visible critical, Heavy Attack, block, or miss marker.

Manual transcription must keep the screenshot or video reference. If a displayed stat is rounded by the UI, record it exactly as displayed and mark it `display_rounded`; do not add hidden precision.

## Rejection criteria

Mark an attempt `rejected`, supply `rejectionReasons`, and retain it when any of the following occurs:

- Overheal or uncertain HP-before/HP-after values.
- Critical, double/triple heal, Heavy Attack, block, miss, or other outcome branch not assigned to the group.
- A buff, debuff, proc, party effect, trait, specialization, Stellarite, food, guardian, or content modifier appears or expires.
- Source or target equipment, level, stats, target identity, mode, distance condition, or ability level differs from the configuration.
- The tooltip or stat-panel screenshot was not captured after the equipment change.
- Two variables changed between paired configurations.
- The floating number or HP change is obscured, ambiguous, or disagrees with the transcription.
- Shield timing expires before depletion, the incoming action changes, or the shield-capacity interval cannot be bounded.
- Network interruption, target reset, death, regeneration tick, or unrelated incoming/healing event overlaps the observation.

Reject an entire configuration when fewer than the required eligible attempts remain, the unchanged repeat disagrees materially with its baseline, or its candidate values cannot discriminate the hypotheses being tested.

## Decision rules

Treat these as three separate findings:

1. **Tooltip basis confirmed:** all three tooltips map `mul / 100` to the displayed percent and their additive constants match. This upgrades only the coefficient display interpretation from `derived_high_confidence` to `verified_exact` for the observed build and rows.
2. **Live Base Damage selection calibrated:** one Base Damage model predicts the complete reviewed Swift Healing datasets A, B, and C after explicitly accounting for the visible `HealEffect`, while competing models fail. If `HealEffect` is not visible or cannot be held fixed, the Base Damage result remains provisional.
3. **Rounding calibrated:** at least two independent boundary configurations produce exact integer observations that select the same rounding rule and reject the alternatives. A distribution alone is insufficient unless each observed value can be mapped to an allowed integer Base Damage roll.

Distortion Veil may corroborate a selected model. Gaia Crash may not upgrade any of these findings until target mitigation and damage-pipeline order are independently resolved.

## Evidence required for precision upgrades

| Claim | Minimum evidence | New precision |
| --- | --- | --- |
| Tooltip coefficient basis for these rows | Groups 1-3, matching tooltip screenshots, exact build and level | `verified_exact` for display encoding |
| Live `10000 = 100%` coefficient basis | Reviewed Swift A/B/C data, known or unchanged `HealEffect`, one model fits all raw outcomes | `verified_calibrated` |
| Base Damage selection | A/B/C plus zero-change repeat; competing min/max/midpoint/per-roll models rejected | `verified_calibrated` |
| First rounding stage | Two discriminating boundary configurations with exact repeated observations | `verified_calibrated` |
| Cross-ability generalization | Exact Swift result plus directly visible or tightly bounded Distortion Veil result on a second loadout/build | `derived_high_confidence`, not automatically `verified_exact` |
| Damage outcome | Requires separate armor/mitigation and pipeline-order calibration | Remains `unsupported` after this protocol |

Store the experiment data and evidence references unchanged. A reviewer may add conclusions, but must not rewrite raw observations to make a candidate formula fit.
