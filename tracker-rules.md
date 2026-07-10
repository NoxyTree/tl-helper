# Character Builder and Tracker Rules

Updated: 2026-07-10

## Calculation status

The shared calculator in `web/tl-core.js` now follows the public Questlog calculation order and is used by both the Armory and Progress Tracker. It includes:

- level 55 base character stats and the allocated-attribute diminishing-cost curve
- item level main and extra stats
- armor material bonuses from both equipped weapons
- normal traits, unique traits, resonance, item potentials, and heroic effects
- rune stats, chaos-rune slot resolution, and rune synergies
- artifact effects and artifact set bonuses
- equipment set bonuses and conditional item passives
- active passive skills, skill cores, weapon mastery, mastery synergies, and unified mastery
- food, recovery items, riftstones, boonstones, castle bonuses, and stellarite
- attribute-derived stats and attribute breakpoints in the correct calculation phase
- Questlog-compatible combat power and display-unit formatting

Support effects contribute to totals but never count as character equipment. Gear completion remains limited to weapons, armor, accessories, and the brooch.

## Rules enforced

- Main Hand and Off Hand cannot use the same weapon type.
- Only one heroic weapon, armor piece, and accessory can be equipped in each category.
- Heroic gear uses its fixed supported item level.
- Scaling gear uses the nearest valid item level if imported state is stale.
- Normal traits are capped at three selected traits per item.
- Unique traits and resonance are single-select.
- Runes are checked against the category supported by their slot.
- Three slotted runes without a matching cached synergy are flagged.
- Active, passive, and defensive skill loadout limits are validated separately.

## Rune model

- Common runes support levels 1 to 20.
- Uncommon runes support levels 1 to 40.
- Rare runes support levels 1 to 60.
- Epic runes support levels 1 to 90.
- Epic II runes support levels 1 to 120.
- Chaos is a rune type, not a progression tier. Rare Chaos and Epic Chaos runes are fixed at level 1.
- An item may contain at most one Chaos rune.
- Socket order is significant. Attack, Defense, and Support permutations resolve to different synergy bonuses.
- A Chaos rune is expanded in socket order as Attack, Defense, or Support when finding the first matching synergy, matching the public Questlog calculator.
- Duplicate cached Chaos generations with the same grade and effects are collapsed in the editor.

Rune mode is entered from the Runes tab. Eligible equipped items are then selected directly from the character sheet instead of from a separate slot rail.

## Questlog import and verification

The Armory Import action accepts a JSON package containing Questlog character, build, skill-build, and mastery-build responses. It maps gear, artifacts, support effects, traits, resonance, heroic effects, potentials, skill cores, runes, skills, mastery, unified mastery, and allocated attributes into the local model.

`node scripts/verify-reference-build.mjs` fetches the public `TheDeathProphetAndVoid` reference build and asserts its combat power plus a broad set of raw totals. This is the regression test for calculator compatibility.

The reference currently resolves to 7,128 combat power with 399 to 640 base damage, 37,673.1 health, 4,159 melee defense, 3,850 magic defense, and 3,339 melee hit chance.

## Source scope

- Equipment, rune, set, attribute, skill, mastery, and character-build data come from cached or public Questlog read procedures.
- The compatibility rule tables are derived from the public Questlog client calculator.
- Local game files remain available for static metadata checks, but this work does not inspect process memory, capture packets, bypass encryption, or interact with anti-cheat.
- Conditional effects that depend on moment-to-moment combat state are represented only where the builder itself applies them as static build totals.
