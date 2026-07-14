# Optimizer set-route and performance review

Date: 2026-07-14  
Game build: `24118850`  
Branch: `codex/calculation-consistency-release`

## Outcome

The optimizer now preserves every reachable, goal-relevant equipment-set breakpoint as a structural route and every complete artifact set as a structural state. These paths remain represented through preliminary exact scoring, attribute allocation, rune refinement, and the final progression result.

The existing Fast and Thorough search widths remain unchanged at 300 and 1,000. The optimization does not obtain speed by shrinking the final search contract.

## What the search evaluates

- Equipment and artifacts are evaluated at their maximum enhancement level. Intermediate item levels are not separate candidates.
- The level 50 option excludes items whose maximum level is below 50.
- Normal items receive one objective-ranked package of three legal traits at maximum tier.
- Item Potentials remain excluded from scoring and recommendations. A stored Potential is preserved only when refitting the same item.
- Calculable Skill Core variants are separate candidates. Unsupported conditional cores receive no invented static value.
- Runes use maximum rune levels. Legal three-rune configurations are bounded during candidate generation and refined exactly for downstream finalists.
- Attribute points are optimized after the structural gear frontier is built.
- Passive skills and mastery are restricted to the requested or equipped weapon families.
- The expensive gear-aware progression search remains bounded to 4 Fast or 8 Thorough diverse finalists. Every structural route also retains the legal weapon-scoped progression selected before gear search, so it cannot disappear from the final result merely because it was not one of those gear-aware refinement targets.

## Correctness changes

1. Set relevance is calculated per cumulative breakpoint band, not once per full set.
2. Goal, minimum, protected-stat, dynamic-rule, and base-attribute outputs can make a route relevant.
3. Zero-hint threshold routes remain structurally represented.
4. Two-piece and four-piece bands are separate routes.
5. Complete artifact sets receive explicit structural reservation.
6. Future route reachability uses the same Heroic caps, weapon uniqueness, and item-uniqueness legality as the main search.
7. Route and artifact representation is reported at preliminary, attribute, rune, gear-aware progression, and final stages.
8. Exact `calculateBuild()` evaluation remains the scoring and legality authority.

## Performance changes

- Cached per-state signatures, objective vectors, and heuristic scores during pruning.
- Replaced repeated per-stat full sorting with a linear strongest and runner-up scan.
- Avoided reevaluating the current rune configuration during coordinate refinement.
- Memoized repeated progression states within each progression optimization.
- Reused normalized slot candidates during set-route reachability checks.
- Added a metadata-safe fast path for ordinary slot-unique set pieces while retaining full future-legality simulation for Heroic, weapon, or duplicate-item interactions.
- Calibrated the browser worker pool to approximately physical cores, capped at four workers. On the 12-thread, 6-core Ryzen test machine, four workers beat eight workers while returning the same build hash.

## Five-preference benchmark

Request:

- Sword and Greatsword
- 59 attribute points
- PvP Endurance
- PvP Melee Hit Chance
- Cooldown Speed
- Collision Chance
- Buff Duration
- Level 50+ items
- No unowned Heroics
- Sets, traits, normal runes, artifact sets, passives, and mastery enabled

| Measurement | Original baseline | Final release candidate |
| --- | ---: | ---: |
| Execution shape | Sequential CLI | Production-shaped 4-worker CLI |
| Wall time | 110.374s | 64.560s |
| Legal | Yes | Yes |
| Blocking issues | 0 | 0 |
| Unowned Heroics | 0 | 0 |
| Equipment routes represented | Not guaranteed | 26 of 26 |
| Complete artifact sets represented | Not guaranteed | 14 of 14 |
| Exact score | 0.6012087581 | 0.6556299874 |

The wall-time reduction is 41.5% for these measured harnesses. It is not a live-site before and after measurement because the public site has not been redeployed and browser automation was unavailable during this review.

Final selected goal values:

| Goal | Raw | Display |
| --- | ---: | ---: |
| PvP Endurance | 42,570 | 4,257 |
| PvP Melee Hit Chance | 24,580 | 2,458 |
| Cooldown Speed | 4,010 | 40.1% |
| Collision Chance | 65,840 | 1,646 |
| Buff Duration | 8,630 | 86.3% |

Final allocated attributes: STR 3, DEX 0, WIS 1, PER 49, FOR 6.

Active set breakpoints:

- Artifact set `set_a_artifact_set_001`: 2, 4, and 6 pieces
- Vanguard Leader `set_aa_T2_plate_005`: 2 pieces

Final build identity SHA-256: `09f27f2318dfe0bc88b0ee5aecde042ef53b65047ecbc01995c6bb6beb2ef4ab`

## Verification

- Repository tests: 729 passed, 0 failed
- Reference build assertions: 69 of 69
- Edge cases: 12 of 12
- BuildSnapshot v2 verification: passed
- Set audit: 78 sets, 151 breakpoints, 0 confirmed incorrect, 0 high risk, 0 review, 9 explicitly unsupported conditional breakpoints
- Independent review reproduced and then confirmed the Heroic future-legality route fix

## Deployment state

These changes are local and are not deployed to the public website. A live browser timing should be recorded only after an explicit preview or production deployment.
