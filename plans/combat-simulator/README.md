# Throne and Liberty Combat Simulator

## Vision

Create a precise, explainable, patch-versioned combat engine for Throne and Liberty that can calculate individual ability outcomes, resolve temporary buffs and passives, simulate rotations, compare complete builds, and model damage, healing, shielding, survivability, and threat.

The engine should support questions such as:

- How much damage will this ability deal using this build against that target?
- What are the minimum, maximum, and expected outcomes?
- Which buffs and passives are active at a selected moment?
- How does an ally's skill change my stats or damage?
- How much does a heal restore after healing-done and healing-received modifiers?
- How much effective health does a tank have against a particular damage profile?
- How long can one build survive another build's rotation?
- Which rotation produces the best burst, sustained damage, healing, or mitigation?
- Which stat or item caused the largest difference between two builds?

## Product boundary

The engine can model game rules and probability. It cannot guarantee the result of a real fight between human players because movement, targeting, timing, reaction speed, latency, and decision-making remain variable.

Results must always identify whether each formula is:

- Extracted from game data
- Explicitly documented by an official source
- Derived from an existing public calculator
- Empirically calibrated
- Assumed or unresolved

## Existing foundation

The current project already has a substantial static build calculator in `web/tl-core.js`:

- Equipment and item-level stats
- Traits, resonance, and potential effects
- Runes and rune synergies
- Equipment and artifact sets
- Item passives and skill cores
- Active and passive skill selection
- Weapon mastery and unified mastery
- Attribute-derived stats and breakpoints
- Food and other support effects
- Questlog-compatible combat power

The current `calculateBuild()` output should become the source of a versioned `BuildSnapshot` consumed by the combat engine.

## Main missing layer

The current calculator resolves static totals but intentionally excludes moment-to-moment combat state. The new engine must add:

- Skill coefficients and damage instances
- Target defense and mitigation
- Hit, evasion, critical, heavy, off-hand, and block resolution
- Healing, continuous healing, and shielding
- Buff and debuff activation
- Stacking and exclusivity rules
- Cooldowns and internal cooldowns
- Attack, cast, and animation timing
- Resource consumption and recovery
- Damage-over-time and healing-over-time ticks
- Conditional passive triggers
- Party buffs and enemy debuffs
- Target state and crowd control
- Threat and aggro where data permits

## Proposed architecture

```text
Questlog + decoded game tables + calibrated rules
                         |
                         v
                 Versioned ruleset
                         |
        Build A + Build B + Scenario + Policies
                         |
                         v
                 Static stat resolver
                         |
                         v
                Combat state resolver
                         |
                         v
              Discrete event simulation
                         |
                         v
        Results + evidence + uncertainty report
```

## Technology recommendation

- Data extraction and custom table decoding: C# and CUE4Parse.
- Combat engine: pure TypeScript package with no DOM dependencies.
- Exact arithmetic: explicit fixed-point or integer scaling with documented rounding.
- Storage: versioned SQLite rules and normalized JSON fixtures.
- Browser integration: compiled ESM bundle.
- LLM access: read-only MCP tools that call the deterministic engine.

The LLM explains and configures. It never performs authoritative combat arithmetic itself.

## Plans in this folder

- [01-combat-engine.md](01-combat-engine.md)
- [02-damage-healing-tanking.md](02-damage-healing-tanking.md)
- [03-build-vs-build-simulator.md](03-build-vs-build-simulator.md)
- [04-data-and-calibration.md](04-data-and-calibration.md)
- [05-ui-and-llm.md](05-ui-and-llm.md)
- [06-implementation-roadmap.md](06-implementation-roadmap.md)
- [community-calculator-audit-2026-07-11.md](community-calculator-audit-2026-07-11.md)
- [IDEAS.md](IDEAS.md)
- [CLAUDE-HANDOFF-AFTER-COLLECTOR.md](CLAUDE-HANDOFF-AFTER-COLLECTOR.md)

## Current dependency

The collector and custom `TLJsonDataTable` investigation in `plans/upcoming-content-radar` should finish before combat-engine implementation begins. That work may unlock the authoritative skill, stat, abnormal-effect, attack-speed, and mitigation records required here.
