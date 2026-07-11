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

`resolveHealingRange()` adds the first opt-in Swift Healing calibration model.
It keeps the reviewed first- and second-cast coefficients exact, then traces
caller-provided Base Damage, Healing, Healing Received, Skill Damage Boost, and
forced Heavy applications as separately labeled modeled or calibrated stages.
Current live observations fall outside the naive projection interval, so the
result is explicitly not a final live-healing prediction and no expected value
is produced.

`pvp-models.mjs` contains isolated, opt-in community models rather than a full
damage pipeline. It exposes the signed Skill Damage Boost minus Skill Damage
Resistance curve, a Defense curve with a required caller-supplied level
constant, Critical and Heavy damage-resistance floors, and the symmetry-derived
glancing chance. Hit versus Evasion uses the established one-sided Evasion rule:
Hit is guaranteed when it meets or exceeds Evasion, otherwise the positive
Evasion difference enters the contest curve. Critical versus Endurance exposes
mutually exclusive Critical and glancing branches. Heavy Attack Chance minus
Heavy Attack Evasion remains a medium-confidence model: client tables verify
the paired stat families, while the subtract-first curve comes from community
testing. Denominators and optional content caps remain explicit caller inputs.
Every result is labeled `modeled`, names its evidence class,
and lists unresolved denominators, ordering, and rounding. These operations are
not composed automatically and are not exact final-damage claims.

## Manual calibration evidence

`calibration-observation.mjs` defines the immutable observation contract.
Records use canonical SHA-256 content IDs and cannot contain executable formula
claims. The separate CLI stores one immutable file per observation and rebuilds
a build-scoped index:

```powershell
node scripts\record-combat-observation.mjs --input <edited-observation.json> --data-root D:\TL_Data --build 24118850
```

See `docs/combat-calibration-first-protocol.md`. Only manual, screenshot,
user-created recording, and human-reviewed OCR evidence are accepted.
