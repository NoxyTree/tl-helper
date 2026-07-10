# Claude Handoff After Collector Review

Do not send this handoff until the current collector assignment has finished and its output has been reviewed.

```text
Work in D:\TL_Helper.

The collector proof of concept and TLJsonDataTable investigation have finished. Read their final report, implementation, tests, and blockers first.

Then read completely:

- plans/combat-simulator/README.md
- plans/combat-simulator/01-combat-engine.md
- plans/combat-simulator/02-damage-healing-tanking.md
- plans/combat-simulator/03-build-vs-build-simulator.md
- plans/combat-simulator/04-data-and-calibration.md
- plans/combat-simulator/05-ui-and-llm.md
- plans/combat-simulator/06-implementation-roadmap.md
- tracker-rules.md
- web/tl-core.js
- web/tl-questlog-rules.js

Existing uncommitted changes belong to the user. Do not revert, overwrite, stage, commit, push, or publish unrelated work.

Objective:

Complete only Milestone 0 from plans/combat-simulator/06-implementation-roadmap.md: the combat data audit. Do not implement the combat engine or UI yet.

The audit must:

1. Inventory every table and Questlog field relevant to damage, healing, shielding, tanking, cooldowns, resources, buffs, debuffs, party effects, PvP, and PvE.
2. Record whether each table is decoded, schema-only, raw-only, or unavailable.
3. Map tooltip placeholders to candidate table fields where evidence permits.
4. Identify formulas already present in tl-core.js and tl-questlog-rules.js.
5. Separate static build totals from moment-to-moment combat mechanics.
6. Create an unknown-formula register.
7. Identify which formulas can be extracted, which require calibration, and which may be server-only.
8. Recommend the smallest set of real abilities that can validate damage, healing, shielding, and mitigation.
9. Preserve formula provenance and current game-build information.

Write:

- plans/combat-simulator/combat-data-audit.md
- plans/combat-simulator/combat-table-inventory.csv
- plans/combat-simulator/unknown-formulas.md
- plans/combat-simulator/initial-validation-cases.md

Do not modify the current web calculator during this audit.

Finish with exact evidence, blockers, and a recommendation on whether Milestone 1 can begin safely.
```

