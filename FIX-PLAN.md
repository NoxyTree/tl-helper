# TL Helper: Comprehensive Fix Plan

> **Platform note (2026-07-10):** this is the historical application audit.
> The audited phases are implemented except the healer and ranged reference
> fixtures in 0.3. Current platform status, decoded game-file coverage, data
> provenance, and future sequencing live in `STATUS.md`.

> **Status (implemented 2026-07-10):** all phases landed except 0.3 — the
> healer/ranged reference fixtures still need their expected tables
> hand-transcribed from Questlog's rendered stats panel (framework + procedure
> in `scripts/reference-builds/README.md`). Verification: `node
> scripts/verify-reference-build.mjs` (43/43, hermetic) and `node
> scripts/verify-edge-cases.mjs` (12/12, includes the 5.3 card-vs-total lock).
> Items 1.2/1.4/1.5 resolved as verified-parity-with-Questlog rather than code
> changes — see comments in `web/tl-questlog-rules.js`.

Written 2026-07-10, from a full build-side audit of the codebase (builder UI, stat
engine, and data pipeline). This file is self-contained: each item says what is
wrong, where, and what "done" looks like. Work through phases in order — Phase 1
changes calculation behavior, so landing it first means every later phase is
verified against a trustworthy engine.

## Ground rules

- **Decoded game files are the primary client-data source.** The existing static
  calculator intentionally mirrors Questlog's public client calculation (see
  `tracker-rules.md`), so Questlog remains its compatibility and parity
  reference. Any behavior change must keep
  `node scripts/verify-reference-build.mjs` at 43/43, including
  `combat_power: 7128`, unless an intentional versioned rules update documents
  and tests the difference.
- **Never fake missing data.** Where a fix is blocked on data we don't have
  (e.g. active/inactive trait flags, fixed enchant effects), surface the gap in
  the UI or docs — do not guess values. (Longstanding project rule.)
- **Baseline commit first.** The repo was freshly `git init`-ed with no commits.
  Commit the current state before touching anything so every fix is diffable.
- Key files: `web/tl-core.js` (engine), `web/tl-questlog-rules.js` (rule
  tables), `web/index.html` (Armory, single DC component), `web/tracker.html`,
  `web/ItemHoverCard.dc.html`, `scripts/build-web-data.mjs` (dataset build),
  `scripts/verify-reference-build.mjs` (regression test),
  `out/questlog-public/*.json` (raw source snapshots).

---

## Phase 0 — Baseline & test hardening

Do this first so every later change is provable.

- **0.1 Baseline commit** of the pristine copied state on `main`.
- **0.2 Make the regression test hermetic.** `verify-reference-build.mjs`
  currently live-fetches the reference character from questlog.gg tRPC on every
  run and only *writes* `web/data/reference-build.json` under
  `TL_REFERENCE_OUTPUT`; the committed fixture is never used as test input.
  Flip it: default to the committed `reference-build.json`, keep live fetch
  behind a flag (e.g. `TL_VERIFY_LIVE=1`) for refreshing the fixture.
  Done when: test passes offline.
- **0.3 Add a second and third reference build** (different archetypes — e.g. a
  staff/wand healer and a bow/dagger ranged build) exported the same way, with
  their own expected-total tables. The current test covers exactly one
  sword/greatsword tank, which leaves ranged/magic accuracy sources, heal
  modifiers, and most passives unexercised. Done when: 3 builds × full
  assertion tables pass.

## Phase 1 — Engine correctness (tl-core.js / tl-questlog-rules.js)

- **1.1 Remove the dead legacy engine and unify the item-card stat path.**
  `calculateBuildLegacy` (tl-core.js:1728) + `collectBuildContributions` and
  ~15 `source*Contributions` helpers (≈1754–1950) form a second, unordered
  engine with zero callers — but the item picker's stat chips/comparison rows
  still reuse pieces of it (`itemStatContribution` :2010,
  `itemStatContributionsForSlot` :1952, `artifactStatContributionsForSlot`
  :1970, consumed around index.html:3058–3081). Consequences today:
  - Artifact cards show the full `itemStats.artifact` block + `extra`, while
    the real total only applies the single selected `artifactStatId`
    (tl-core.js:1447–1451).
  - Off-hand cards read the item's own `offhand` block, while the real total
    derives off-hand damage from the main-hand item and skips off-hand
    `mainStats` entirely (tl-core.js:1455) — verify what Questlog does when
    only an off-hand is equipped and match it.
  Fix: delete the legacy engine; reimplement card/comparison contributions as a
  thin per-slot slice of `calculateBuild` (e.g. run the build with/without the
  candidate item and diff, or expose per-source rows from the live engine).
  Done when: card chips and equipped totals always agree; grep finds no
  `calculateBuildLegacy`.
- **1.2 Level-60 base stats.** `CHARACTER_LEVEL = 60` but `BASE_LEVEL_STATS`
  only has rows for 50 and 55; nearest-match silently uses 55
  (tl-core.js:1427–1430, rules:11). Recover the level-60 row from Questlog's
  client and add it (or set CHARACTER_LEVEL to 55 if 60 rows genuinely don't
  exist — decide, don't leave the silent fallback).
- **1.3 Warn on unmapped rule IDs.** All rule tables are allowlists
  (`SET_PASSIVE_RULES` ~50 sets, `PASSIVE_SKILL_RULES` ~14 skills,
  `ITEM_PASSIVE_RULES` 3, `PERK_PASSIVE_RULES` 1, `UNIFIED_MASTERY_RULES` 1).
  Any selected passive/set/mastery/unified node not in a table silently
  contributes nothing (`applyQuestlogPhase`, tl-core.js:1605–1633).
  Fix: `validateBuild` (tl-core.js:2037) should emit an issue like "Passive
  'X' selected but has no calculation rule — totals exclude it", rendered in
  the existing validation panel. Done when: selecting an unmapped effect is
  visibly flagged instead of silent.
- **1.4 Fill `UNIFIED_MASTERY_RULES`.** One entry exists
  (`WM_Common_SKILL_007`, tl-questlog-rules.js:34); the bundled reference build
  selects four unified nodes, so three no-op today. Recover the remaining
  `WM_Common_SKILL_*` effects from the Questlog client bundle (same recovery
  method documented in `mastery-page-rules.md` — the cached chunk
  references live in the old repo under `out/questlog-chunks/`, and the live
  bundle URL is in `extraction-report.md`). Also: the builder UI never
  reads/writes `build.unifiedMasteries` (only Questlog import populates it) —
  add a small Unified Mastery section to the Mastery tab.
- **1.5 Double-count audit.** Three specific suspects:
  - `set_aa_T2_plate_003` rule lists `all_critical_defense 120` twice and
    `damage_reduction 12` twice (tl-questlog-rules.js:31) — verify against
    Questlog; dedupe if transcription error.
  - `SkillSet_Unique_Accessory_Skill_01` is encoded in BOTH
    `ITEM_PASSIVE_RULES` and `PERK_PASSIVE_RULES` — confirm no accessory
    triggers both branches (tl-core.js:1608 vs 1611), or guard it.
  - Static set `bonus_stat` rows (tl-core.js:1526–1532) + `SET_PASSIVE_RULES`
    per-phase effects have no overlap guard — add an assertion or a test.
- **1.6 Combat power honesty.** CP is currently a fitted heuristic (hardcoded
  `COMBAT_POWER` tables + two item-ID bonus allowlists in tl-questlog-rules.js:37–39;
  hardcoded talistone/gemstone/resonance/rune values in tl-core.js:1675–1726).
  It matches the one reference point. Either (a) label it "Estimated" in the
  hero strip + tracker, or (b) integrate the decoded `TLItemCombatPower` table
  after running it alongside the current calculation and explaining every
  difference. The table is decoded but not yet integrated. Also fix mixed
  rounding (`Math.round` in `combatPowerBreakdown` :1672
  vs `Math.floor` in `itemCombatPower` :1692) and reconcile the stale
  "combat power remains unavailable" claim in `extraction-report.md`.

## Phase 2 — Missing build features (UI)

- **2.1 Defensive skills UI.** `tl-core.js:989` classifies
  `skillType === "defensive"` as its own loadout type (cap 1,
  tl-core.js:1000), but the Skills tab renders only Active/Passive rows and
  pool tiles (index.html:2352–2353, 2440–2441) — the word "defensive" appears
  nowhere in index.html. Add a Defensive loadout slot + pool section mirroring
  the Active/Passive pattern; the tab badge already counts them. Also mirror in
  the skills summary anywhere loadout counts are shown.
- **2.2 Skill specializations — surface the data.** All 110
  `specializationIds` in app-data.json are dangling: `build-web-data.mjs:299`
  drops the full `skillSets[].specializations` objects (name, icon, type,
  per-level cooldown/mana/description) that exist in
  `out/questlog-public/skillBuilder.getSkillSets.json`. Emit them (either as a
  `skillSpecializations` collection or inline on each skill), then upgrade the
  spec toggles in the skill focus panel to show name/icon/description instead
  of bare IDs. Done when: zero dangling IDs; spec toggles show real content.
- **2.3 Item-potential enchant skills.** 193 items carry `itemPotential.skills`
  (proc effects with name/icon/description/probability) that
  `build-web-data.mjs:249–256` discards, keeping only stats. Surface them and
  show in the Edit Slot potential section + hover card.
- **2.4 Hover card completeness** (`buildItemHoverModel`, tl-core.js:603–715):
  - Computed `SET_PASSIVE_RULES` effects never appear on the card — it only
    shows static `itemSetBonus` rows (tl-core.js:676–682). Show them.
  - `cores`/`coreMore` are hardwired empty (tl-core.js:698–699), so the
    "Skill Cores · Potentials" template block (ItemHoverCard.dc.html:73–93) is
    dead — wire the slotted perk/core through, per the design handoff.
  - The two known Questlog-parity gaps stay blocked on missing data (no
    active/inactive trait flags; fixed set/enchant effects absent from the
    bundle) — keep them documented, don't fake them.
- **2.5 Blessings — decide scope.** No blessing editor exists anywhere. If
  blessings are meant to be in a "complete" build, that's a new extraction +
  engine + UI feature; otherwise record explicitly in README/tracker-rules
  that blessings are out of scope.

## Phase 3 — Data pipeline hygiene (scripts/build-web-data.mjs)

- **3.1 Fix tooltip mojibake.** 207/210 skills contain double-decoded UTF-8
  (▲/▼ arrows render as `â²` etc.) in `levels[].tooltipOptions`. Fix in
  `plainText()`/the read path (the snapshots are read with a BOM strip only).
  Done when: grep for `â` over app-data.json returns 0.
- **3.2 Normalize names.** All 132 rune names have trailing spaces
  (`"Attack Rune: Weapon "`); rune-synergy names ship raw-uppercase
  (`"ASSIST ATTACK DEFENSE"`). Trim + title-case at build time.
- **3.3 Mastery flags.** Emit `weaponActivatedOnly`, `isDisabled`, and
  `requiredLevel` from the raw weapon-specialization records (currently
  dropped at build-web-data.mjs:332–345) — `isDisabled` in particular may
  affect which of the 544 nodes should render on the wheel; 49 nodes currently
  have no image and no description.
- **3.4 Grade fallback.** 50 items (boonstones) serialize with `grade`
  undefined — give them an explicit grade or a documented default so
  grade-keyed UI (rings, colors) doesn't hit `undefined`.
- **3.5 Drop or adopt dead inputs.** `getPreviewEquipmentItems.json` (1,357
  records) and the local `.bk2` visual manifest are fetched/built but never
  consumed by the web app. Decide: delete from the pipeline, or wire up (e.g.
  preview icons). Recommendation: drop; note it in extraction-report.md.
- **3.6 Output integrity.** `app-data.js` is the file:// fallback wrapper of
  `app-data.json` (same stringify) — but note the web pages currently only
  `initCore("./data/app-data.json")`; either wire the `.js` fallback into the
  pages or stop emitting it. Also add a post-write assertion that both files
  parse to the same payload.

## Phase 4 — UI polish & dead code (web/index.html, web/tracker.html)

- **4.1 Tracker doll is missing the Brooch slot.** `tracker.html:512`
  `rightIds` has 6 slots; Armory has 7 (index.html:2093 includes `brooch`).
- **4.2 Fix hardcoded completion denominators.** Overview shows "Runes /42"
  and readiness "/63" (index.html:2131, 2136) but 15 slots × 3 sockets = 45;
  derive denominators from slot definitions instead of literals.
- **4.3 Runes tab gating.** `runeSlotChips` (index.html:2919) lists all 15
  equipment slots regardless of rune eligibility; the doll already gates on
  `runeEligible` (index.html:2006–2007) — apply the same gate. Also note rune
  socket count is hardcoded to 3 everywhere; confirm that matches the game.
- **4.4 Dead code sweep in `slotView`/mastery wheel:** duplicate `title` key
  (index.html:2016 vs 2033), unused `runeModeTitle` (:2042), always-empty
  `wheelWashes` (:2767 / template :682).
- **4.5 Auto-fill should reset focus state** (`skillFocusId`,
  `masteryFocusId`) like Clear does (index.html:2292 vs 2298).

## Phase 5 — Verification & regression net

- **5.1** Re-run the 3-build regression suite (Phase 0) after every phase.
- **5.2 Add edge-case checks** (script or test file): empty build, off-hand
  only, partial rune sets (1–2 runes), unmapped passive selected (expect a
  validation issue, not silence), over-budget masteries/specs, stale item
  level on import.
- **5.3 Card-vs-total consistency check:** for every item in a reference
  build, assert the picker comparison delta equals the actual
  `calculateBuild` total delta when equipping/unequipping — this locks in
  Phase 1.1 permanently.
- **5.4 Manual browser pass** (serve `web/`, or `.claude/launch.json`
  `tl-tracker-web`): hover cards on all slot types, defensive skill
  add/remove, mastery wheel unlock rules per `mastery-page-rules.md`,
  tracker mirror parity including brooch.

## Suggested milestones

1. **M1 (trust the numbers):** 0.1–0.3, 1.1, 1.2, 1.3 — hermetic multi-build
   tests + unified card path + visible warnings.
2. **M2 (complete the build model):** 1.4–1.6, 2.1–2.3.
3. **M3 (polish & data quality):** 2.4, 3.1–3.6, 4.1–4.5, 5.2–5.4.
4. **M4 (stretch):** blessings scope decision (2.5), additional reference
   builds, non-English localization.
