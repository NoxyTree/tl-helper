# Source motion calculation review

Date: 2026-07-14

Branch: `codex/calculation-consistency-release`

Pre-implementation snapshot: `snapshot/movement-position-pre-implementation-20260714` at `37b710618b90455395214deb7b062e6f7e6ffa67`.

Game data build: `24118850`

## Outcome

Source stationary and movement state remains a closed-world dimension in canonical CombatScenario v4. Five decoded components are exact and executable without mutating persistent static totals:

| Component | Exact activation | Exact result |
| --- | --- | --- |
| Rapidfire Stance | Stationary for at least 2s; movement skills do not cancel; ordinary movement grace is under 2s | Level-specific Attack Speed plus raw `1000` all Hit Chance |
| Battle Tempo | Selected with Rapidfire Stance; stationary for at least 4s | Replaces Rapidfire's Attack Speed curve with the exact transformed curve; Hit Chance is unchanged |
| Asceticism conditional remainder | Stationary for at least 3s; movement skills do not cancel; ordinary movement grace is under 2s | Second level-specific Mana Regen curve plus level-specific all Heavy Attack Chance |
| Aridus's Fury | Exact innate item or selected Skill Core carrier; stationary for at least 3s; movement grace is under 2s | Raw `1200` Base Damage modifier |
| Stigma Executor 4-piece remainder | Four active pieces and stationary for at least 4s | Raw `1500` Critical Damage, removed immediately upon movement |

Asceticism's first Mana Regen curve and Stigma Executor's raw `2000` Critical Damage remain persistent static components and are not duplicated by the scenario overlay.

## Contract

Participant motion is one strict tagged union:

- `unspecified`
- `stationary` with one of four duration bands
- `moving` with ordinary or movement-skill movement, an under-2s or 2s-or-more moving band, and the prior stationary band

CombatScenario v1 and v2 inputs migrate with motion unspecified. CombatScenario v3 motion semantics remain unchanged when migrating to v4, which adds participant event history. Unknown fields and invalid combinations are rejected. Motion participates in canonical scenario identity and survives build weapon rebinding.

## Calculation authority

- `web/tl-motion-scenario-effects.js` owns exact motion arithmetic and provenance.
- `web/tl-scenario-effects.js` composes motion atomically with distance, time, and resource families.
- `web/tl-core.js` supplies only equipped-family progression, exact active item carriers, and completed set breakpoints.
- `includeSetEffects: false` removes Stigma from both persistent and scenario calculation.
- Any active source with insufficient motion state prevents every scenario family from applying partial rows.
- Aridus accepts only `staff_aa_t3_boss_002` as its innate carrier or `perk_staff_aa_t3_boss_002` selected on `staff_aa_t2_raid_001`.

## Page behavior

Gear Viewer, Full Build Optimizer, and Build From Scratch expose the same source-motion union and the separate evaluation-instant event input. Persistent static scoring remains the default. When enabled, the canonical scenario participates in current totals, candidate scoring, protected-stat checks, hover reconstruction, caches, finalist validation, tuning, worker messages, and optimizer handoffs. Armory and saved presets deliberately remain scenario-free persistent builds.

## Evidence boundary

Position was not added. The audited remaining positional descriptions do not produce an executable stat overlay from direction alone.

Aridus's Hatred remains unsupported because the decoded raw `Damage +30` recipient stat is not proven. Seven deterministic no-cooldown event effects are now executable only for a confirmed successful qualifying activation at `occurredAgoMs: 0`. That event history is distinct from current moving or stationary state. Elapsed duration and positive Buff Duration remain unresolved, so aged events fail closed. Cooldown-bearing triggers, activation locks, refresh behavior, proc state, and uptime remain unsupported.

## Verification

- Focused contract, evaluator, catalogue, build-integration, helper, and page tests passed.
- Full Node suite: `647/647`.
- Reference builds: `69/69`.
- Edge cases: all `12` passed.
- BuildSnapshot v2 verification passed.
- Generated catalogue: `531/531`, with `20` decoded-executable and `511` explicitly non-executable components.
