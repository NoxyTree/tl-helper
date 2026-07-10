# Combat Engine Architecture

## Objective

Build a deterministic, data-driven library that resolves combat state and executes combat events without depending on the web UI, an LLM, or mutable global state.

## Proposed project layout

```text
packages/combat-engine/
  src/
    arithmetic/
    build/
    effects/
    events/
    formulas/
    policies/
    probability/
    resources/
    rulesets/
    simulation/
    state/
    validation/
  fixtures/
  tests/
```

If introducing a package workspace is too disruptive initially, the same structure can begin under `src/combat-engine` and move later.

## Core domain types

### BuildSnapshot

An immutable representation of a resolved build:

- Build ID and name
- Game version and Steam build
- Character level
- Equipment and item levels
- Skill loadout and skill levels
- Skill specializations
- Passives
- Mastery selections
- Attributes
- Static stat totals
- Stat contribution provenance
- Available combat actions

### UnitState

Mutable state for one simulated unit:

- Current and maximum health
- Current and maximum resource
- Static and temporary stats
- Active buffs and debuffs
- Shields
- Cooldowns
- Internal cooldowns
- Damage-over-time effects
- Healing-over-time effects
- Crowd-control state
- Position or distance bucket
- Current target
- Threat state
- Death state

### AbilityDefinition

- Ability ID
- Name and icon
- Weapon and damage type
- Skill level
- Cost
- Base cooldown
- Cast time
- Animation or lock time
- Range and area
- Damage and healing instances
- Conditions
- Applied effects
- Triggered subskills
- Chain-skill rules
- Specialization modifications
- PvE and PvP modifiers
- Formula provenance

### EffectDefinition

- Effect ID
- Source ability
- Owner and target scope
- Stat modifications
- Duration
- Tick interval
- Maximum stacks
- Refresh behaviour
- Replacement and exclusivity group
- Trigger conditions
- Proc probability
- Internal cooldown
- Dispel category
- Buff-duration interaction
- Debuff-duration interaction

### CombatScenario

- Mode: PvP, open-world PvE, boss, dungeon, or training target
- Participants and teams
- Starting distance
- Starting health and resources
- Pre-applied effects
- Environmental conditions
- Level and combat-power context
- Duration
- RNG mode and seed
- Action policies
- Unsupported-mechanic policy

### CombatEvent

Events should include:

- Action requested
- Cast started
- Cast completed
- Damage instance
- Heal instance
- Shield applied
- Buff or debuff applied
- Tick
- Cooldown ready
- Resource changed
- Proc check
- Block, miss, critical, or heavy result
- Cleanse or dispel
- Crowd control applied or removed
- Unit death
- Simulation end

## Event-driven simulation

Use a priority queue ordered by:

1. Simulation timestamp
2. Event phase
3. Stable event sequence number

This avoids frame-rate dependence and makes tests deterministic.

Event phases should define consistent ordering for simultaneous effects. For example:

1. Expirations
2. Resource regeneration
3. Cast completion
4. Hit resolution
5. Damage or healing
6. Triggered effects
7. Death checks
8. Cooldown and policy decisions

The order must be configurable if calibration reveals different server behaviour.

## Arithmetic and rounding

- Do not rely on incidental JavaScript floating-point behaviour.
- Define fixed-point scales for percentages and internal stat units.
- Record rounding after every formula stage.
- Support floor, ceiling, nearest, truncation, and deferred rounding.
- Include arithmetic traces in debug output.
- Preserve raw and displayed values separately.

## Formula registry

Every formula should be versioned:

```ts
type FormulaDefinition = {
  id: string;
  gameBuildFrom: string;
  gameBuildTo?: string;
  provenance: "extracted" | "official" | "derived" | "calibrated" | "assumed";
  confidence: number;
  inputUnits: Record<string, string>;
  outputUnit: string;
  evaluate(context: FormulaContext): FormulaResult;
};
```

The engine must refuse to silently substitute an incompatible formula from another patch.

## Effect rule representation

Use a constrained data representation for common effects:

```json
{
  "trigger": "on_skill_hit",
  "conditions": [
    { "field": "skill.weapon", "operator": "eq", "value": "bow" }
  ],
  "actions": [
    {
      "type": "apply_stat_modifier",
      "stat": "all_critical_attack",
      "value": 250,
      "durationMs": 5000
    }
  ]
}
```

Complex mechanics may use reviewed code-backed handlers. Arbitrary code from extracted data must never be executed.

## Calculation modes

### Deterministic outcome mode

Force a specified outcome such as normal, critical, heavy, blocked, or missed. Useful for min/max inspection and tests.

### Expected-value mode

Calculate analytic expected values where events are independent and tractable.

### Monte Carlo mode

Execute seeded repeated simulations for proc chains, conditional rotations, and dependent RNG.

### Exhaustive branch mode

Optional later mode for small event trees. Enumerate every branch and probability rather than sampling.

## Explainability

Every result should be able to produce a trace:

```text
Weapon base damage
+ static bonus damage
x skill coefficient
+ skill flat damage
x PvP modifier
x target mitigation
x critical modifier
- shield absorbed
= final health damage
```

The trace must include source IDs, formulas, rounding, and confidence.

## Engine invariants

- Same inputs, seed, and ruleset produce identical output.
- No result depends on UI state.
- No formula lacks a build version and provenance.
- No effect modifies an immutable `BuildSnapshot`.
- No event can be scheduled before current simulation time.
- Health and resource bounds are explicit.
- Dead units cannot act unless a mechanic explicitly allows it.
- Unsupported mechanics emit warnings rather than disappearing silently.

## Initial acceptance fixture

Create two minimal synthetic builds and one skill that exercises:

- Static damage
- Target mitigation
- Critical branch
- Buff application
- Buff expiration
- Cooldown
- Resource cost
- Deterministic replay

This fixture validates architecture before real game formulas are added.

