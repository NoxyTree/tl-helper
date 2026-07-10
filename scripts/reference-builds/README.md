# Reference build fixtures

Each top-level `*.json` file here drives one assertion pass in
`node scripts/verify-reference-build.mjs` (hermetic, offline by default).
Build inputs for focused fixtures live under `presets/`.

Fields:

- `id` — stable preset id.
- `name` — display name used in test output (mention the archetype).
- `presetName` — display name written into the preset file by live refresh.
- `characterSlug` / `ownerSlug` / `buildIndex` — questlog.gg tRPC coordinates
  used only by `TL_VERIFY_LIVE=1` to refresh the preset file.
- `presetPath` — repo-relative path of the committed preset (build +
  attributes) the test calculates from. `web/data/reference-build.json` is
  also loaded by the Armory as the bundled preset.
- `expected` — raw stat totals (engine units, pre-display-formatting) plus
  `combat_power`. **These must be hand-transcribed from Questlog's rendered
  stats panel** — the tRPC API returns only the build inputs, never computed
  totals, and the character page is a client-rendered shell, so there is no
  scriptable source for them.
- `evidence` — optional provenance for a partial assertion table. Focused
  game-file smoke fixtures use manually traced decoded base and item rows and
  must not be described as full Questlog parity fixtures.

The verifier rejects fixtures with an empty `expected` table. Partial tables
are allowed only when the fixture documents evidence independent from
`calculateBuild()`.

## Adding a complete Questlog fixture

Coverage includes one complete sword/greatsword Questlog parity build plus two
small game-file-backed smoke builds for wand/staff and bow/dagger. The smoke
builds protect base, weapon, off-hand, ranged/magic accuracy, mana regeneration,
health regeneration, and attack-range paths. They do not replace the
still-needed complete healer and ranged Questlog totals, particularly healing
passives, mastery, traits, runes, and complete combat power. To add one:

1. Find a public questlog.gg character of the archetype; note its character
   slug (URL) and owner slug (from the skill/mastery build API calls).
2. Create the fixture JSON with an empty `expected`, run
   `TL_VERIFY_LIVE=1 node scripts/verify-reference-build.mjs` to export the
   preset file (`presetPath` can point at `scripts/reference-builds/<id>-preset.json`
   for fixtures that should not appear as Armory presets).
3. Open the character in a real browser, open the stats panel, and transcribe
   the raw totals into `expected` (convert displayed values back to raw units
   with `STAT_UNIT_MODIFIERS` from `web/tl-questlog-rules.js`).
4. Run the verifier offline; investigate any mismatch before committing.

## Current evidence gap

- Healer candidate: `TheSkilledPhaseOfSand`, build `7467952` ("1. Start Path
  of Ascension"), owner `is7DrBnXJxQJ`.
- `TheGrievingSilverAndDawn` was investigated as a ranged candidate, but its
  first build currently imports with a blank main-hand weapon and is unsuitable.

Questlog's tRPC payload supplies build inputs only. The complete expected table
must still be transcribed from the visible Combined Stats panel in a real
browser. Never use this verifier's calculated output as the evidence source.
