# Build Versus Build Simulator

## Objective

Simulate combat between complete builds using explicit scenarios, rotations, reaction policies, resources, cooldowns, buffs, debuffs, and probability.

The simulator predicts outcomes under declared policies. It does not claim to predict human behaviour.

## Scenario configuration

### Participants

- Build A
- Build B
- Optional allies
- Optional NPC or boss
- Team assignment
- Starting health and resources

### Environment

- PvP, arena, battleground, open world, dungeon, or boss
- Starting distance
- Range bucket or simplified position model
- Day, night, rain, or other relevant conditions
- Level and combat-power gap
- PvP-specific modifiers
- Content stat limits
- Pre-applied buffs and debuffs

### Simulation controls

- Duration
- Number of Monte Carlo runs
- RNG seed
- End conditions
- Unsupported-mechanic behaviour
- Result detail level

## Action policies

### Fixed rotation

Execute abilities in a declared order. Wait or skip according to rotation rules when an action is unavailable.

### Priority list

Choose the first currently valid action:

```text
1. Use cleanse when controlled.
2. Use defensive skill before incoming burst.
3. Refresh primary debuff below 1 second.
4. Use burst skill when target is stunned.
5. Use filler attack.
```

### Reactive policy

Respond to events:

- Health threshold
- Shield break
- Target cast started
- Buff gained or lost
- Crowd control
- Resource threshold
- Enemy cooldown used
- Target distance changed

### Human timing model

Optional later model:

- Reaction-time distribution
- Input delay
- Decision delay
- Mistake probability
- Target-switch delay

This should be disabled by default in formula-validation mode.

## Timeline engine

The timeline should track:

- Cast start and completion
- Animation or action lock
- Global and skill cooldowns
- Resource regeneration
- Buff and debuff windows
- Damage, healing, shield, and DoT/HoT ticks
- Proc checks
- Internal cooldowns
- Crowd-control duration
- Cleanse and immunity
- Death and encounter end

## Simulation modes

### Single deterministic run

Useful for debugging a specific sequence with forced outcomes.

### Expected-value timeline

Useful for stable DPS or HPS estimates when dependencies are limited.

### Monte Carlo batch

Useful for:

- Time-to-kill distributions
- Proc chains
- Conditional rotations
- Probability of surviving burst
- Resource starvation
- Miss, block, critical, and heavy variation

### Optimizer mode

Later feature that searches rotations or builds using the simulator as the scoring function. Keep optimization outside the core simulator.

## Required outputs

### Summary

- Winner or end state under selected policies
- Win probability
- Median and percentile time to kill
- DPS, HPS, and damage prevented
- Effective healing and overheal
- Resource remaining
- Buff and debuff uptime
- Death cause
- Confidence level

### Timeline

- Actions
- Damage and healing events
- Buff and debuff changes
- Shields
- Cooldowns
- Resources
- Health
- Crowd control

### Breakdown

- Damage by ability
- Damage by proc or passive
- Healing by source
- Damage prevented by defense, evasion, block, reduction, and shields
- Stat contribution
- Failed action reasons
- Proc counts
- Cooldown delays

### Explainability

The user should be able to select any event and inspect:

- Formula
- Inputs
- Source records
- Rounding
- RNG roll or branch probability
- Active modifiers
- Unsupported assumptions

## Position model

Start with a simplified model:

- Melee
- Short range
- Long range
- Out of range

Policies may change distance through movement abilities. Exact 3D collision, line of sight, terrain, and pathing are outside the first simulator.

## Crowd control

Model only after the relevant rules are understood:

- Accuracy and resistance
- Duration modifiers
- Immunity gauge
- Diminishing or immunity rules
- Break-on-damage
- Cleanse
- Defense-skill interactions
- Collision and displacement

The initial PvP simulator may exclude complex displacement while still modeling control availability and duration.

## PvE extension

Boss and dungeon simulation may add:

- Scripted incoming damage timeline
- Enrage timer
- Phase changes
- Tank busters
- Raid-wide damage
- Required cleanses
- Add spawns
- Movement downtime
- Threat and taunts

ActionTree and BehaviorTree data may help build encounter templates, but manually reviewed encounter scripts are safer than attempting to execute extracted behaviour directly.

## Build comparison without full simulation

Before timeline simulation is complete, provide a static matchup report:

- Attacker hit versus defender evasion
- Critical chance versus defense
- Heavy chance versus defense
- Damage range versus mitigation
- Effective health
- Healing and shielding capacity
- Cooldown and attack-speed comparison
- Strong and weak damage types
- Most influential stat differences

This is a valuable intermediate product.

## Acceptance scenarios

1. Same build and fixed seed produces identical timeline.
2. Increasing target defense never increases incoming damage unless a documented conditional mechanic explains it.
3. A buff activates and expires at the expected timestamps.
4. A cooldown reduction changes later action availability.
5. A shield absorbs damage and reports unused capacity at expiry.
6. Monte Carlo results converge within a configured tolerance.
7. Unsupported crowd-control mechanics emit warnings.

