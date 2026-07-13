# Calculation consistency release review

## Scope

- Worktree: `D:\TL_Helper-calculation-release`
- Branch: `codex/calculation-consistency-release`
- Base snapshot: `20731f5`
- Game-data build: `24118850`
- Priority: static build totals, set activation, optimizer retention, and consistent explanations across Armory, Gear Viewer, Build Optimizer, Build from Scratch, Tracker, and Combat Lab.

The dirty main worktree at `D:\TL_Helper` was not modified.

## Release result

All build-consuming pages now use the same generated manifest and `calculateBuild()` as the final sheet-stat authority. Set effects are represented once as a canonical evaluated trace and are no longer independently reinterpreted by hover cards or result summaries.

Current set inventory:

- 78 unique sets
- 151 activation breakpoints
- 40 structured static breakpoints
- 101 mapped rule breakpoints
- 10 explicit unsupported breakpoints
- 0 unclassified breakpoints
- 0 multiply classified breakpoints
- 0 confirmed-incorrect audit rows
- 0 high-risk audit rows
- 0 review rows

## Correctness changes

### Canonical set-effect calculation

`calculateBuild()` now returns `setEffects` schema version 1. Each equipped set records its unique equipped-member count, member total, breakpoint state, calculation confidence, application provenance, evaluated stats, applied stats, suppressed stats, and unsupported reason.

Breakpoint states are:

- `inactive`
- `excluded`
- `applied`
- `applied_with_suppression`
- `suppressed`
- `active_no_effect`
- `unsupported`

Every applied source is linked to its set ID and piece breakpoint. Dynamic values are read from that source trace after evaluation. Consumers do not rerun a rule against totals that already contain its result.

### Set counting

Set thresholds count unique member item IDs consistently. Selecting the same ring in both ring slots no longer creates an extra set piece. The build validation report identifies duplicate selections and explains that they count once.

### Cross-set exclusivity

Stat-scoped exclusivity is implemented for the decoded non-stacking groups:

- Forgotten Assassin and Lightning Strike Evasion effects
- Death, Imperial Seeker, Spectral Overseer, and Secret Order Critical Damage effects
- the two currently unsupported Damage over Time exclusivity members

Only the conflicting stat is suppressed. Secret Order therefore keeps Heavy Attack Damage when a stronger Critical Damage effect wins. Highest-value precedence remains explicitly `modeled` because the client proves non-stacking but does not expose resolution order.

### Hover and summary parity

- Inactive set breakpoints are no longer labeled Applied.
- Percentage or attribute-driven set rules no longer display an inflated value computed from their own final total.
- Active unsupported effects say `Not calculated` and include the reason.
- Armory artifact-set rows use evaluated breakpoint values.
- Armory picker previews calculate the prospective replacement build and show resulting breakpoint states.
- Build from Scratch uses the canonical set trace instead of rebuilding bonuses from projection prose.
- Optimizer result objects carry the canonical set trace.

### Gear Viewer

- Set-aware Fit is the default.
- Preferences moved to schema key `tlhelper-gear-viewer-prefs-v2`, so an old automatically saved set-blind default cannot override the correction.
- Multi-slot items are evaluated in every compatible occupied slot. Ring candidates are tested against Ring 1 and Ring 2, then the strongest legal item-slot result is retained.
- Availability counts remain per unique item rather than per evaluated item-slot pair.

### Build Optimizer

- Ordinary candidate value is no longer counted once in `stats` and again in `scoreHint`.
- Direct objective score remains available for per-slot candidate capping but does not enter the beam twice.
- Artifact bundle objective hints are no longer erased by generic normalization.
- Set-completion hints are disabled when set effects are disabled.
- Set hints remain optimistic search-retention aids only. Complete finalists are recalculated through `calculateBuild()`.

### Generated stat catalogue

The generated stat-label projection now includes every stat known to the calculator unit registry. This adds the set-rule-only stats:

- `off_hand_attack_chance_modifier`
- `shield_block_efficiency`

They are now discoverable as optimizer goals instead of existing only in raw calculation output.

## Confidence boundaries

### Data-backed

Set membership, breakpoint joins, structured values, decoded mapped values, and the confirmed `>=` thresholds are treated as data-backed.

### Derived

Vanguard Leader 4-piece remains derived. Both localized strings say Main Weapon Base Damage +30, and the current representation raises the displayed weapon range through the calculator's bonus-attack-power expansion. A direct underlying stat identity binding is still absent.

### Modeled

- Owner application of the personal plus self-inclusive party aura for Oracle Priest, Forgotten Assassin, Skilled Veteran, and Admiral.
- Highest-value precedence for mutually exclusive set effects.

### Unsupported

These ten breakpoints are explicit and contribute no invented static value:

- Mother Nature 2-piece, Weaken Duration
- Dimensional Chaos 2-piece, Stamina Regen penalty
- Imperator 4-piece, mobility-skill move range
- Elder 2-piece, Skill Damage over Time
- Sacred Vanquisher 2-piece, Skill Damage over Time
- Lightning Strike 4-piece, conditional enemy Endurance and self Evasion
- Reborn Lord Set 2 2-piece, damage-over-time and triggered debuff
- Robert's Concentration 3-piece, target-health conditional
- Rutaine's Mysterious 3-piece, target-health conditional
- Sophia's Strength 3-piece, target-health conditional

The first two require a verified calculator stat mapping or raw value. The remaining effects require scoped or combat-stage state and are deliberately not promoted to persistent sheet totals.

## Surface matrix

| Surface | Calculation source | Set behavior |
| --- | --- | --- |
| Armory | `BuildSnapshot` to `calculateBuild()` | Included; canonical source and set summaries |
| Tracker | `BuildSnapshot` to `calculateBuild()` | Included; shared hover trace |
| Combat Lab | `BuildSnapshot` to `calculateBuild()` | Included in attacker and defender build totals |
| Gear Viewer | `slotSelectionContribution()` and `calculateBuild()` | Included by default; may be explicitly disabled |
| Full Build Optimizer | bounded search, then `calculateBuild()` | Included by default; completion hints protect routes |
| Build from Scratch | optimizer result, then `calculateBuild()` | Included by default; canonical set summary |

## Verification

- Full automated suite: 381 of 381 passing
- Reference builds: 69 of 69 asserted totals passing
- Edge cases: all passing
- Set audit: 78 sets, 151 breakpoints, 0 incorrect, 0 high-risk, 0 review, 10 unsupported
- Cross-surface Nine Lives fixture: Armory snapshot, Gear Viewer slot delta, and optimizer adapter agree with direct calculation
- Vanguard Leader boundary sweep: 9, 10, 19, 20, 40, and 41 Perception
- Browser smoke: Armory, Gear Viewer, Build from Scratch, Build Optimizer, and Tracker render from the release worktree with zero console errors; Gear Viewer and both optimizer experiences start set-aware
- `git diff --check`: clean

## Remaining optimizer search limitations

Finalist arithmetic is canonical, but bounded search is not proof of a global optimum. The following can still cause a theoretically best loadout to be pruned before final calculation:

1. A dynamic set threshold activated only by attributes supplied by the candidate gear itself.
2. A strong 2-piece or 4-piece artifact hybrid outside the retained per-slot artifact pool.
3. Heroic configurations discarded by approximate four-finalist pruning.
4. Weapon-material interactions evaluated against old or incomplete weapon context during candidate generation.
5. Rune configurations evaluated only for a retained subset.
6. Protected composite-stat generation and beneficial-negative objective direction.
7. Weapon and artifact lock alias handling in scratch re-forge.

These are search-completeness improvements, not known errors in the totals of a retained build. They should be the next calculation work before claiming globally optimal recommendations.

## Review files

- `docs/set-effect-audit-2026-07-13.md`
- `docs/set-effect-localization-resolution-2026-07-13.md`
- `web/tl-core.js`
- `web/tl-questlog-rules.js`
- `web/tl-full-build-adapter.js`
- `web/tl-full-build-optimizer.js`
- `web/gear-viewer.html`
- `scripts/tests/canonical-set-effects.test.mjs`
- `scripts/tests/calculation-surface-parity.test.mjs`
- `scripts/tests/set-exclusivity.test.mjs`
- `scripts/tests/gear-viewer-cross-slot.test.mjs`

