# Combat Engine Milestone 2

This package is the DOM-free deterministic combat-engine skeleton. It uses only
synthetic units, effects, and modeled formulas. It does not contain Throne and
Liberty damage, mitigation, hit, critical, Heavy Attack, PvP, or server-tick
rules.

## Test command

From the repository root:

```powershell
npm test --prefix packages\combat-engine
```

The repository-wide JavaScript gate also includes this file when the test file
list is passed to `node --test`.

## Package boundary

Import `packages/combat-engine/src/index.mjs`. The package has no DOM, browser
state, Node built-in, bulk-data, or web-calculator dependency. Its ESM modules
can run in Node or a modern browser.

Fixed-point values are scaled `bigint` values. Decimal inputs must be strings;
JavaScript fractional numbers are rejected so no hidden floating-point stage
enters engine arithmetic. Simulation output exposes scaled values as decimal
strings and can be canonically serialized with `serializeSimulation()`.

Formula definitions require a formula ID, game build, source table, source row,
precision label, provenance, trace metadata, and a reviewed calculation.
`modeled` formulas require explicit opt-in. `unsupported` formulas cannot have
an executable calculation. The included `tl.unknown-damage-pipeline` entry is a
deliberately non-executable marker for a Milestone 3 dependency.

The Milestone 2 fixture includes explicitly modeled static damage, target
mitigation, and forced normal/critical branches. They validate engine wiring
only and are marked `realGameFormula: false`. They must not be used as Throne
and Liberty combat rules.

## Real ability-data boundary

`src/ability-definition.mjs` defines the immutable, build-scoped contract for
reviewed real ability data. The current pipeline writes Gaia Crash, Swift
Healing, and Distortion Veil to:

```text
TL_DATA_ROOT\reports\<build>\combat-abilities.json
```

The artifact retains every decoded level, raw coefficients, tooltips, dynamic
stat IDs, owner-mapping evidence, source hash, decoder version, precision, and
unresolved stages. It is evidence for the future single-action calculator, not
an executable claim about mitigation, Base Damage selection, dynamic modifiers,
or rounding.

`loadCombatAbilityData()` validates and freezes a parsed artifact for stable
lookups. `inspectAbilityMagnitude()` returns the reviewed expression without
executing it. `projectAbilityMagnitude()` requires explicit
`allowUncalibratedProjection: true` and a caller-supplied Base Damage value.
Its numeric result is always labeled `tooltip_coefficient_projection`,
`pre_resolution`, and `overall: unsupported`; it is never final damage, healing,
or shield capacity.
