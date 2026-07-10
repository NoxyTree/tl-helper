# Combat Simulator Implementation Roadmap

## Dependency gate

Do not begin implementation until the current collector proof of concept and decoder investigation have been reviewed.

The current Claude assignment should finish uninterrupted. Its findings determine whether combat tables are directly decodable, require a custom serializer, or need calibration-first fallbacks.

## Milestone 0: Combat data audit

### Work

- Review collector and decoder results.
- Inventory every combat-related table.
- Identify fields already available through Questlog.
- Identify fields only present in local tables.
- Create an unknown-formula register.
- Record current game and Steam build.

### Definition of done

- Combat-data coverage report exists.
- Required tables have decoder status.
- Unknown mechanics are explicit.

## Milestone 1: Extract current static build engine

### Work

- Define `BuildSnapshot` schema.
- Refactor or wrap `calculateBuild()` behind a stable adapter.
- Preserve current Questlog-parity tests.
- Remove UI dependencies from combat inputs.
- Add build-snapshot serialization.

### Definition of done

- Existing reference build remains at its verified totals.
- Browser and test code consume the same snapshot contract.
- Snapshot is immutable and versioned.

## Milestone 2: Combat-engine skeleton

### Work

- Create pure TypeScript engine package.
- Implement fixed-point arithmetic.
- Implement event queue and unit state.
- Implement formula registry and provenance.
- Implement synthetic ability and effect fixtures.

### Definition of done

- Synthetic deterministic simulation passes.
- Same seed reproduces the same timeline.
- Formula trace includes every arithmetic stage.

## Milestone 3: Single-action calculator

Status: in progress. The versioned ingestion boundary is complete for Gaia
Crash, Swift Healing, and Distortion Veil. Five reviewed formula components are
materialized with per-level coefficients and twelve explicit unresolved stages.
No unresolved stage is executable yet. A pure coefficient inspector and
explicitly opted-in pre-resolution projection API are also complete; both keep
the live outcome precision `unsupported`.

### Work

- Implement base damage and skill coefficient handling.
- Implement target mitigation.
- Implement forced normal, critical, heavy, blocked, and missed outcomes.
- Implement healing and shielding.
- Add ability-calculator API.
- Add precision labels.

### Definition of done

- At least one real ability per weapon has a reviewed calculation.
- Damage, healing, and shield fixtures pass.
- Unsupported mechanics remain visible.

## Milestone 4: Effects and party context

### Work

- Implement buffs, debuffs, stacks, durations, and exclusivity.
- Implement passive triggers and internal cooldowns.
- Implement party and enemy effect sources.
- Implement self-buffed and party-buffed stat views.

### Definition of done

- External class buffs can change another build's stats.
- Effects activate, refresh, replace, stack, and expire correctly.
- Every active modifier has source provenance.

## Milestone 5: Timeline and rotation simulator

### Work

- Implement cooldowns and resources.
- Implement cast and action timing.
- Implement DoT and HoT ticks.
- Implement fixed rotations and priority policies.
- Add timeline output.

### Definition of done

- A complete rotation produces reproducible DPS, HPS, and uptime.
- Cooldown and resource constraints affect action availability.
- Timeline can explain failed or delayed actions.

## Milestone 6: Build-versus-build

### Work

- Implement two-unit targeting and reactions.
- Implement matchup probabilities.
- Implement Monte Carlo batches.
- Implement time-to-kill and survival distributions.
- Add simplified distance changes and defense skills.

### Definition of done

- Two supplied builds and policies produce a reproducible report.
- Results include distribution, not only one winner.
- Human-policy assumptions are explicit.

## Milestone 7: Tanking, healing, and PvE

### Work

- Implement incoming damage profiles.
- Implement effective health and required HPS.
- Implement defensive cooldown policies.
- Implement boss templates.
- Add modeled threat if coefficients are available.

### Definition of done

- Tank survival and healer requirements can be evaluated over time.
- Boss-specific unsupported mechanics are listed.

## Milestone 8: Optimizer and LLM

### Work

- Implement rotation search.
- Implement build-variable search.
- Add MCP tools.
- Add natural-language scenario construction.
- Add explanation and comparison workflows.

### Definition of done

- Optimizer results reproduce when rerun.
- LLM explanations cite deterministic result objects.
- LLM cannot bypass the formula engine.

## Recommended first product

The first user-facing release should contain:

1. Build A and Build B selectors.
2. Ability selector.
3. Self, party, and target effect controls.
4. Normal, critical, heavy, blocked, and expected outcomes.
5. Damage, healing, shield, and effective-health results.
6. Formula trace and precision label.

Do not wait for full timeline simulation before delivering this page.

## Regression requirements

- Existing static build totals remain unchanged unless an intentional ruleset update documents the change.
- Every formula change adds or updates fixtures.
- Every game patch has a ruleset ID.
- Monte Carlo convergence tests have tolerance bounds.
- Formula and effect ordering tests are explicit.
- No unsupported mechanic is silently ignored.

## Work separation

Use separate implementation sessions for:

1. Combat data audit
2. Build snapshot refactor
3. Engine skeleton
4. Formula implementation
5. Effects and party context
6. Timeline simulator
7. Build-versus-build
8. Optimizer and LLM

This keeps the most error-prone formula work reviewable.
