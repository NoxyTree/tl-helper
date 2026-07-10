# Damage, Healing, and Tanking Calculations

## Purpose

Define the calculation domains that the engine must support and the evidence required before a result can be called precise.

## Damage calculation

### Required attacker inputs

- Main-hand and off-hand damage ranges
- Bonus damage
- Damage type
- Skill damage coefficient
- Flat skill damage
- Skill Damage Boost or amplification
- PvP, boss, monster, and species modifiers
- Critical chance and damage
- Heavy or double-attack chance and damage
- Off-hand activation chance
- Defense penetration
- Damage-reduction penetration
- Range or distance modifiers
- Conditional passives
- Target-state modifiers

### Required defender inputs

- Relevant defense type
- Damage reduction
- Evasion
- Critical defense or endurance
- Heavy-attack defense
- Block chance
- Block penetration resistance where applicable
- Block efficiency
- PvP mitigation
- Species or content modifiers
- Temporary mitigation buffs
- Shields
- Damage-taken amplification or reduction

### Proposed resolution stages

The exact order remains a research item. The initial model should make each stage explicit:

1. Select weapon damage value or distribution.
2. Add attacker base and bonus components.
3. Apply skill coefficient and flat component.
4. Apply skill-specific amplification.
5. Resolve hit versus evasion.
6. Resolve critical chance versus critical defense.
7. Resolve heavy or double chance versus defense.
8. Resolve off-hand activation where applicable.
9. Resolve block and block penetration.
10. Apply defense and defense penetration.
11. Apply damage reduction and penetration.
12. Apply PvP, boss, monster, species, range, and target-state modifiers.
13. Apply final damage-taken modifiers.
14. Absorb through shields.
15. Apply final rounding and health loss.

Calibration may reorder these stages.

### Damage outputs

- Minimum and maximum normal hit
- Minimum and maximum critical hit
- Minimum and maximum heavy hit
- Blocked outcomes
- Expected damage per cast
- Expected damage per second
- Damage distribution
- Hit, miss, critical, heavy, and block probabilities
- Contribution by formula stage
- Damage absorbed by shields
- Confidence and unresolved warnings

## Healing calculation

### Required inputs

- Skill coefficient and flat healing
- Skill Healing
- Healing Done
- Healing Received
- Continuous Healing
- Continuous Healing Received
- Missing-health scaling
- Critical healing if supported
- Target maximum and missing health
- Tick count and interval
- Buff-duration interaction
- Skill-level scaling
- Party or area target count
- Conditional effects
- Resource cost

### Healing resolution

1. Resolve source healing power.
2. Apply skill coefficient and flat component.
3. Apply source healing modifiers.
4. Apply target healing-received modifiers.
5. Apply missing-health or target-state scaling.
6. Resolve critical or proc branches if applicable.
7. Apply caps.
8. Apply healing to missing health.
9. Record overheal.
10. Schedule future ticks.

### Healing outputs

- Raw heal
- Effective heal
- Overheal
- Heal per target
- Total area healing
- HPS
- Healing per mana
- HoT uptime
- Cleanse or dispel effects
- Shield conversion where applicable
- Confidence and unresolved warnings

## Shield calculation

Track shields as independent state objects:

- Source
- Initial capacity
- Remaining capacity
- Damage-type restrictions
- Duration
- Refresh or replacement behaviour
- Shield amplification
- Shield received modifier
- Maximum-health scaling
- Break triggers
- Expiration triggers

Outputs should distinguish prevented damage, expired unused shield, and overkill through shield.

## Tanking calculation

### Snapshot survivability

- Effective health by melee, ranged, and magic damage
- Effective health against a mixed damage profile
- Expected blocked damage
- Expected avoided damage
- Critical and heavy exposure
- Shield-adjusted effective health
- Healing-adjusted sustain
- Damage reduction contribution
- Defense contribution
- Evasion contribution

### Timeline survivability

- Time to death under a selected incoming rotation
- Survival probability
- Mitigation cooldown uptime
- Health and shield timeline
- Required HPS to survive
- Healer mana requirement
- Damage spikes
- Crowd-control vulnerability windows

### Threat and aggro

Threat simulation should remain separate until coefficients are known. Required evidence includes:

- Base threat per damage or healing
- Skill-specific threat multipliers
- Taunt behaviour
- Threat transfer or reduction
- NPC target-selection policy
- Threat decay or encounter resets

If threat data remains unavailable, the engine may display relative threat indices clearly marked as modeled rather than exact.

## Buffs from other weapon classes

External effects require ownership and scope:

- Source build and source skill
- Self, party, raid, target, or area scope
- Range requirement
- Duration and refresh behaviour
- Maximum stacks
- Exclusivity group
- Whether Buff Duration affects it
- Whether the source must remain nearby
- Trigger and internal cooldown
- Target eligibility

The buffed stat page should support:

- Baseline stats
- Self-buffed stats
- Party-buffed stats
- Selected timestamp
- Maximum theoretical buffs
- Realistic rotation uptime

Maximum theoretical stats and realistic average stats must never be presented as the same result.

## Probability curves

The engine may need calibrated curves for:

- Hit versus evasion
- Critical chance versus critical defense
- Heavy or double chance versus defense
- Block chance versus penetration
- Crowd-control accuracy versus resistance

Every curve must include:

- Game-build range
- Data points
- Fitting method
- Confidence interval
- Cap and floor behaviour
- Validation fixtures

## Major unknowns

- Exact server rounding order
- Whether some mitigation occurs before or after critical and heavy modifiers
- Server-only level or combat-power scaling
- Tick alignment and server tick rate
- Internal cooldown behaviour
- Simultaneous buff expiry and hit ordering
- Distance sampling
- Some boss-specific damage rules
- Threat coefficients
- Tooltip values that differ from live behaviour

Unknowns must remain visible in output and the formula registry.

