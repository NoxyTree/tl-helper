# Combat UI and LLM Integration Plan

## Objective

Create interfaces that make complex combat calculations understandable without hiding assumptions, uncertainty, or formula provenance.

## Page structure

### Ability Calculator

Inputs:

- Source build
- Target build or target template
- Ability and level
- Specializations
- Combat mode
- Distance
- Active self buffs
- External party buffs
- Target debuffs
- Forced or probabilistic outcomes

Outputs:

- Normal, critical, heavy, and blocked ranges
- Expected damage, healing, or shielding
- Probability breakdown
- Formula trace
- Stat contributions
- Active effects
- Precision label

### Buffed Stats

Modes:

- Baseline
- Self-buffed
- Party-buffed
- Selected timestamp
- Maximum theoretical
- Average rotation uptime

The page must show every source that modifies each stat and why it is active.

### Build Versus Build

Layout:

- Build A on the left
- Build B on the right
- Scenario and policy controls in the center
- Matchup probabilities
- Static offense and defense comparison
- Simulation controls
- Timeline and outcome distribution

### Rotation Lab

- Drag-and-drop action timeline
- Priority-policy editor
- Buff and debuff lanes
- Cooldown lane
- Resource graph
- Damage, healing, and shield graph
- Proc statistics

### Tanking and Healing Lab

- Incoming damage profile
- Effective-health summary
- Mitigation breakdown
- Required HPS
- Healing rotation
- Shield and defensive cooldown timeline
- Overheal and mana efficiency

### Formula Explorer

- Formula ID and version
- Expression
- Source and provenance
- Rounding stages
- Calibration observations
- Confidence
- Affected abilities and mechanics

## Explainability interactions

Every number should support a detail view containing:

- Source build
- Target build
- Formula trace
- Active modifiers
- Source records
- Rounding
- RNG branch
- Precision label
- Unsupported warnings

Avoid unexplained aggregate ratings as the primary output.

## LLM role

The LLM can:

- Translate a natural-language question into a scenario
- Select relevant builds and abilities
- Explain formula traces
- Compare two results
- Identify the largest contributors
- Suggest controlled experiments
- Summarize patch changes
- Explain why a simulation differs from intuition

The LLM must not:

- Invent missing formulas
- Perform unsourced authoritative arithmetic
- Hide unsupported mechanics
- Treat simulation win probability as certainty
- Claim optimal play without running an optimizer

## Proposed MCP tools

### calculate_ability

Returns a snapshot damage, healing, or shielding calculation with full trace.

### calculate_buffed_stats

Returns stats for a selected timestamp and effect context.

### compare_build_matchup

Returns static attacker-versus-defender probabilities and mitigation.

### simulate_rotation

Runs one unit's rotation against a target template.

### simulate_build_vs_build

Runs deterministic or Monte Carlo simulations under declared policies.

### calculate_tank_survival

Returns effective health, survival timeline, and required healing.

### calculate_healing_rotation

Returns HPS, effective healing, overheal, shield uptime, and mana use.

### explain_combat_result

Returns formula stages, sources, and uncertainty for a result ID.

### list_unsupported_mechanics

Returns unresolved mechanics affecting a scenario.

## MCP response requirements

Every response includes:

- Ruleset and game build
- Calculation mode
- Seed where applicable
- Inputs
- Results
- Formula trace reference
- Precision labels
- Warnings
- Source evidence

## Shareable scenarios

Allow users to export a compact scenario package containing:

- Build references or embedded builds
- Ruleset version
- Scenario
- Rotation or policies
- RNG mode and seed
- Selected result summary

The same package should reproduce the result offline.

## Accessibility

- Do not rely on colour alone.
- Provide text equivalents for graphs.
- Support reduced motion.
- Keep tables keyboard navigable.
- Explain game terminology.
- Allow raw IDs and advanced fields to be toggled.

## Public-result safety

If results are shared publicly:

- Include ruleset and patch.
- Include precision label.
- Include unsupported warnings.
- Avoid presenting modeled outcomes as official game values.
- Link back to methodology.

