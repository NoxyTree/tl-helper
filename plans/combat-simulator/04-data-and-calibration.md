# Combat Data and Calibration Plan

## Objective

Establish authoritative, versioned combat data and safely calibrate formulas that are not fully represented in the client or official documentation.

## Data-source priority

1. Decoded local game tables
2. Current game localization and tooltip variables
3. Official patch notes and official skill descriptions
4. Existing Questlog public calculator data
5. Controlled in-game observations
6. Community formulas, retained only with source and validation status
7. Assumptions, always clearly labeled

## Priority game tables

### Player and base stats

- `TLStats`
- `TLBaseMainStat`
- `TLPCInitialStat`
- `TLPCLevelStat`
- `TLPcDynamicStat`
- `TLBasicStatBonusPreview`
- `TLContentStatLimit`

### Skills and effects

- `TLSkill`
- `TLSkillLevelSetting`
- `TLSkillOptionalDataForPc`
- `TLWeaponCategorySkillSet`
- `TLAbnormalState_Common`
- `TLAbnormalState_Weapon_*`
- `TLPassiveSkillLooks`
- `TLGuildSkillInfo`

### Equipment and timing

- `TLItemStats`
- `TLItemAttackSpeedBaseline`
- `TLItemStatAttrConverter`
- `TLItemMaterialStat`
- `TLItemMainLevelStat`
- `TLItemExtraLevelStat`
- `TLWeaponSpecializationStat`

### NPC, mitigation, and content

- NPC stat and class tables
- Encounter-specific skill tables
- Content-stat-limit tables
- ActionTree and BehaviorTree references
- Reward and item-effect tables where they trigger combat passives

## Decoder contract

Decoded rows must include:

- Source package path
- Source package hash
- Steam build and game version
- Decoder version
- Row ID
- Raw field names
- Raw values
- Unknown fields
- Parse warnings

Do not normalize away unknown fields before the raw decoded record is preserved.

## Tooltip-variable resolver

Many localized descriptions contain expressions such as:

```text
$[SkillName_DD.tooltip1]
$[SkillName_CoolDown.tooltip1]
```

The resolver should:

1. Parse placeholder references.
2. Link them to decoded skill variables.
3. Resolve values by skill level and specialization.
4. Preserve unresolved placeholders.
5. Produce both formatted text and structured formula inputs.

## Formula provenance

Each formula record should contain:

- Formula ID
- Game-build range
- Formula expression
- Input units
- Rounding stages
- Source type
- Source path or URL
- Calibration dataset ID
- Confidence
- Reviewer notes

## Safe calibration harness

Calibration must not read game memory, attach to the process, capture packets, inject code, or automate gameplay.

Supported observation methods:

- Manual entry
- User-created screenshots
- User-created gameplay recordings processed offline
- OCR of visible damage and healing numbers
- Exported build definitions

## Test-case record

```json
{
  "gameBuild": "24118850",
  "mode": "pvp_duel",
  "attackerBuildId": "...",
  "defenderBuildId": "...",
  "abilityId": "...",
  "abilityLevel": 5,
  "distance": "melee",
  "activeEffects": [],
  "observedOutcome": {
    "damage": 1234,
    "critical": false,
    "heavy": false,
    "blocked": false,
    "missed": false
  },
  "evidence": {
    "type": "manual",
    "path": null
  }
}
```

## Experiment design

### Formula order

- Hold builds constant.
- Change one stat source at a time.
- Use deterministic or low-variance abilities where possible.
- Record normal, critical, heavy, and blocked outcomes separately.
- Test integer boundaries to identify rounding.

### Probability curves

- Select controlled attacker and defender stat differences.
- Record a sufficiently large sample.
- Store raw observations, not only aggregated rates.
- Fit candidate curves.
- Validate against held-out observations.
- Record confidence intervals.

### Buff duration and cooldown

- Record visible activation and expiration timestamps.
- Test with and without duration modifiers.
- Test refresh, replacement, and maximum stacks.
- Separate displayed duration from effective duration.

## OCR pipeline, later phase

An offline OCR helper may:

- Extract frames from user-recorded clips.
- Detect floating damage or healing text.
- Classify visible outcome markers.
- Associate timestamps with manually declared skill usage.
- Present uncertain readings for human confirmation.

OCR output must never become a golden fixture without review.

## Golden test suite

Maintain fixtures for:

- Static build totals
- One-hit damage
- Critical damage
- Heavy damage
- Blocked damage
- Healing
- HoT ticks
- Shields
- Buff stacking
- Cooldown reduction
- Resource cost
- Party buff
- PvP target mitigation
- PvE level or combat-power scaling

Every fixture includes game build and formula version.

## Patch process

After each update:

1. Run the collector.
2. Diff combat-related tables and localization.
3. Mark affected formulas and fixtures stale.
4. Import official balance notes.
5. Re-run golden tests.
6. Recalibrate only where results changed or evidence is incomplete.
7. Publish a calculator-rules version tied to the game build.

## Precision labels

- `verified_exact`: extracted or officially specified and validated
- `verified_calibrated`: empirical model with strong validation
- `derived_high_confidence`: derived from multiple consistent sources
- `modeled`: plausible but incomplete
- `unsupported`: insufficient evidence

The UI must expose these labels.

