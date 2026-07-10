# Reference build fixtures

Each `*.json` file here drives one assertion pass in
`node scripts/verify-reference-build.mjs` (hermetic, offline by default).

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

## Adding a fixture (the missing archetypes)

Coverage today is a single sword/greatsword tank. Per FIX-PLAN 0.3 we still
want a staff/wand healer and a bow/dagger ranged build to exercise
ranged/magic accuracy sources, heal modifiers, and more passives. To add one:

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
