# Canonical stat taxonomy

Game tables use internal identifiers that are not always the names players see. The reusable resolver in `scripts/lib/stat-taxonomy.mjs` keeps the raw identifier while adding a semantic canonical ID, a Questlog-compatible display name, units, display scale, attack scope, context, and relationship.

```js
import { resolveStatTaxonomy } from "../scripts/lib/stat-taxonomy.mjs";

resolveStatTaxonomy("pvp_melee_double_attack");
// rawStatId: pvp_melee_double_attack
// canonicalStatId: heavy_attack_chance
// displayName: PvP Melee Heavy Attack Chance
// unit: points, scale: 0.1
```

## Important distinctions

- `double_attack` means **Heavy Attack Chance**.
- `double_defense` means **Heavy Attack Evasion**.
- `double_damage_dealt_modifier` means **Heavy Attack Damage** and is not Heavy Attack Chance.
- `double_damage_taken_modifier` means **Heavy Attack Damage Resistance** and is not Heavy Attack Evasion.

The canonical ID describes the underlying metric, so one exact query for `heavy_attack_chance` includes all attack scopes and contexts. The resolver preserves `all`, `melee`, `range`, and `magic` in `attackScope`, and separates base, PvP, boss, and directional contexts. `rear` uses Questlog's player-facing label **Back** while preserving `rear` in `rawStatId` and `direction`.

Condition-prefixed raw fields such as `weaken_double_attack` are also grouped under `heavy_attack_chance`, but remain `provisional` because their exact activation semantics have not yet been established. Their condition remains explicit in `condition` and the original identifier is never discarded.

## Label confidence

`labelStatus` prevents a generated English-looking label from being mistaken for verified terminology:

- `verified`: explicitly captured from the Questlog-compatible calculator or derived from its established combat-stat naming pattern.
- `provisional`: supplied by the generated local labels projection, but not yet independently verified as the in-game term.
- `unresolved`: only a humanized fallback is available.

`buildStatTaxonomy(rawStatIds, localLabels)` resolves a complete inventory while retaining those confidence flags. New labels should be promoted to `QUESTLOG_STAT_LABELS` only when supported by Questlog or localized game evidence.

## Current coverage

All 204 stat IDs in the current labels projection receive canonical metadata. Patterned hit, defense, critical hit, endurance, Heavy Attack, and evasion families are semantically normalized. Less common fields retain their stable raw ID as the canonical ID until their exact player-facing semantics are verified.
