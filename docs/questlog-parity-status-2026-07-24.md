# Questlog stat parity — status and handoff

Date: 2026-07-24
Branch: `codex/sites-deploy`
Suite at handoff: 908 passing, 0 failing. Reference builds 69/69.

## Why this matters

The site's premise is that our numbers are the player's real numbers. If a build
imported from questlog.gg does not reproduce that character's stats, every
downstream feature — the optimizer, protected stats, goal floors — is built on
sand. Parity is therefore the gating correctness property, ahead of performance.

## Where we are

`node scripts/verify-questlog-parity.mjs` — hermetic, offline, no network.

**After the 2026-07-24 data refresh and fixture correction:**

```
  100.0%   73/73   Hit tank (sword/greatsword)      [provisional]  1 blocking
  100.0%   72/72   Ranged DPS (crossbow/dagger)     [legal]        0 blocking
   98.8%   82/83   Healer (orb/wand)                [provisional]  1 blocking
   98.7%   76/77   Magic DPS (staff/dagger)         [provisional]  1 blocking
   96.3%   79/82   Evasion tank (greatsword/spear)  [legal]        0 blocking
   95.6%   87/91   Melee DPS (sword/greatsword)     [legal]        0 blocking

   Overall: 469/478 = 98.1% across 6 archetypes
```

Nine mismatched stats remain out of 478. **All six archetypes reproduce
questlog.** Progression: 55.2% before the refresh, 67.1% after it, 98.1% after
correcting two broken fixtures.

### The "broken archetypes" never existed — a fixture-capture error

The healer and magic DPS reading 6.2% and 5.3% was **my capture bug, not a
calculator defect.** When scraping, the character page renders whichever build it
is currently displaying, which is NOT necessarily the one named in the
`?build-id=` URL. I captured each panel from the displayed build while capturing
the payload from the URL's build, pairing two different builds inside one fixture.

Proof, by re-pairing each panel against candidate payloads:

| fixture panel | vs original payload | vs correct payload |
|---|---:|---:|
| Healer | 8023583 "orb" — **5/83 (6.0%)** | 8261110 "t4 theory" — **82/83 (98.8%)** |
| Magic DPS | 8255167 "Triple Eva" — **4/76 (5.3%)** | 8290225 "Current Nix Build" — **76/77 (98.7%)** |

Both fixtures were rebuilt around the payload that matches their panel.

This is exactly the desync this document already warned about, committed by the
author of the warning. **When capturing, verify the panel's build identity from
the page itself — never trust the URL parameter.** The build name is rendered
next to the stats; check it.

It also means the elaborate healer diagnosis (missing proportional Max Health
source, misrouted control resistances, PER table conflict) was explaining
differences between two unrelated builds. Those conclusions are void. Treat
`.bench/codex-out-healer.md` as unreliable.

The distribution is **bimodal**, not a gradient: four archetypes cluster at
74–85%, two are effectively broken, nothing in between. Max Health on the melee
build matches to five decimals (40,213.14 vs 40,213.148), so the engine's core
maths is sound — the gaps are missing or misrouted *sources*, not bad formulas.

## The two problems

### Problem 1 — the 74–85% band: stale game data

Every build in this band misses the same set:

| symptom | magnitude |
|---|---|
| Max Mana | −1,000 |
| Melee / Ranged / Magic Defense | −300 or −500 |
| Max Health | −2,000 |

That trio is exactly the old **Dark Wing's Power** (Melee + Ranged Defense +300,
Max Mana +1,000) and **Dark Wing's Bulwark** (Max Health +2,000, Magic Defense
+300) Skill Cores. Per the repo owner, the game **removed those Skill Cores and
made the stats inherent on Heroic items**. Our projection predates the change:

- `core.data.gameBuild` = `24118850`, generated **2026-07-13**.
- Searching every item for the inherent signature (`cost_max: 1000` +
  `melee_armor: 300`) returns **0 hits**. Eternal Promise, a Heroic ring, carries
  only `armor: { magic_armor: 450 }`.
- `web/tl-questlog-rules.js:340` still models the legacy Skill Core, and
  `web/tl-questlog-rules.js:335` carries a now-false comment saying it "is
  currently a selectable Skill Core only".

Builds that still have a `perk` stored fire the legacy rule once and lose one
copy; builds without it lose the lot. That explains the whole band.

**Ordering constraint — do not get this wrong.** Deleting the legacy perk rules
*before* refreshing data makes parity WORSE (−300 becomes −600, −1,000 becomes
−2,000), because the rule is currently the only thing supplying those stats. The
refresh and the rule retirement must land together.

### Problem 2 — the 5–6% cases: not constants

The magic DPS build computes **Melee Evasion 5,050 where questlog says 656** — an
eight-fold error, not a missing constant. Both broken archetypes carry
unresolved rune synergies.

Blocking issues cluster into two families across the fleet:

- `"<slot> has three runes but no matching rune synergy in the cached table."`
  — magic DPS ×3, ranged DPS ×2, healer ×1. Absent from the two `legal` builds.
- `"<Weapon> <Rarity> mastery must activate 2 Achievement effects; 1 are stored."`
  — healer (Orb Common), hit tank (Greatsword Uncommon).

**Open question, unresolved:** are those synergy combinations genuinely absent
from the current game, or does our lookup fail to match rows we already hold?
This is a cheap check and it decides data-fix vs code-fix. Do it first.

### Problem 3 — chaos rune kAA2 tier is a stale clone (root cause CONFIRMED)

A flat melee-only shortfall of 10 display (100 raw) on melee Critical Hit Chance
and melee Heavy Attack Chance, with ranged and magic matching exactly, was traced
to the projection, not the engine.

In `web/data/projections/runes.json` the six `*_All_Rune_Usable_kAA2_001` entries
(Weapon / Ring / Necklace / Bracelet / Belt / Earring) are **byte-identical
clones of their `*_All_Rune_Usable_kAA_001` siblings** — same `grade: 41`, same
values — whereas every `Atk`/`Def`/`Ast` kAA2 rune is a genuinely distinct
`grade: 42` tier. The chaos kAA2 tier was never captured with its own values, so
each is ~100 raw low.

Isolating the melee-only residue (melee total − ranged total) on the melee DPS
build gives exactly −100 in three families (crit, heavy, hit), one per kAA2
chaos rune carried. The ladder `kAA2 = 2·kAA − kA` reproduces every observed
delta across **5 builds and 12 distinct stat ids**, including the `skill_power_*`
family whose steps are additive rather than multiplicative.

Applying that correction in memory (no files changed) moves:

- melee DPS 70/89 → **76/89**, ranged DPS 53/72 → **67/72**
- evasion tank 68/80 → **75/80**, hit tank 59/71 → **61/71**
- nothing regresses

It also **explains the melee/ranged asymmetry in Problem 4**: afterwards
`melee_accuracy` is +270, identical to ranged and magic, and the PvP rows are a
uniform −270. Two symptoms, one cause.

Fix is data-side: re-capture `characterBuilder.getEquipmentRunes.json` (consumed
at `scripts/build-web-data.mjs:262`, mapped at `:383-391`) and rebuild.
**Do not hard-code the derived ladder values** — the offline evidence cannot
distinguish "the game patched these runes after 2026-07-13" from "Questlog's API
returned kAA values for the kAA2 tier that day". Either way the correction is a
re-snapshot.

Ruled out along the way: weapon mastery (all 51 nodes import and apply; the two
negative `melee_armor` Intensity entries are legitimate melee-tree trade-offs and
a red herring), sets, attribute curves, armor-material bonuses, heroic effects,
resonance, skill passives, unified masteries.

### Problem 4 — Hit Chance sign flip: ALSO stale data (earlier claim retracted)

**An earlier draft of this document called this "a real logic bug, independent of
data freshness". That was wrong and is retracted.** `STAT_EXPANSIONS`
(`web/tl-questlog-rules.js:43`) is correct and needs no change.

Hit Chance ran high on general/Boss and low on PvP by the same amount (melee DPS
±270, hit tank ±142, ranged DPS −24). Two stale-projection defects account for
every row:

**Frost Lord's Black Scale gloves and boots.** At item level 71 our 2026-07-13
projection carried the stat in the **general** bucket at **half** value, where
live carries it as PvP:

| item | stale projection | live |
|---|---|---|
| `hands_aa_S1_plate_rift_001` (gloves) | `all_accuracy: 1200` | `pvp_all_accuracy: 2400` |
| `feet_aa_S1_plate_rift_001` (boots) | `all_accuracy: 1500` | `pvp_all_accuracy: 3000` |

General/Boss gains a bogus `1200 + 1500 = +2700` raw (+270 display). PvP inherits
that same bogus amount through `melee_accuracy → pvp_melee_accuracy` but loses the
real `2400 + 3000 = 5400`, netting `2700 − 5400 = −2700` (−270 display). That is
the sign flip, exactly.

Cross-build confirmation: build 8197308 wears the gloves only (stale
`all_accuracy 1420`) → general excess **+1420**, PvP short **−1430**. Builds
8166680 and 8244627 wear no Frost Lord rift plate → both deltas **0**.

**The kAA2 chaos runes from Problem 3** supply the residual melee-only −100, which
is why melee showed +2600 rather than +2700.

Verified against the refreshed projection with **no code change**: every
`melee/range/magic_accuracy`, `pvp_*_accuracy` and `boss_*_accuracy` delta on
build 8215841 goes to **0**. Per-fixture general-excess / PvP-missing before →
after: 8215841 `2700/5400 → 0/0`, 8197308 `1420/2850 → 0/0`,
8244627 `−240/0 → 0/0`, 8166680 `0/0 → 0/0`.

Composition of PvP totals (general + PvP-typed) is correct and matches questlog
on every clean fixture.

## Where the data actually comes from — this surprised us

`web/data/app-data.json` is **not** built from locally decoded game files in the
common path. `scripts/build-web-data.mjs` reads mirrored **questlog public API**
dumps from `out/questlog-public/`:

```
characterBuilder.getAttributeStats.json      characterBuilder.getEquipmentItemSets.json
characterBuilder.getEquipmentItems.json      characterBuilder.getEquipmentRunes.json
characterBuilder.getRuneSynergies.json       skillBuilder.getSkillSets.json
skillBuilder.getSkillTraits.json             weaponSpecialization.getWeaponSpecializations.json
```

All eight are dated **2026-07-10** — 14 days stale. `TL_DATA_ROOT` (the decoded
warehouse route described in `docs/data-contract.md`) is unset in the working
shell.

**Consequence:** refreshing likely needs no game-file extraction at all. Re-fetch
those public endpoints and re-run `scripts/build-web-data.mjs`. The tRPC call
pattern is already implemented in `scripts/lib/questlog-character-import.mjs`
(`https://questlog.gg/throne-and-liberty/api/trpc/<procedure>?input=<json>`).
There is no existing script that fetches these eight; one needs writing.

## What has already been fixed (in the working tree)

Three import defects, all with tests, full suite green:

1. **Heroic effects were silently zeroed.** `importQuestlogBuild` trusted
   questlog's group numbering, which does not always match our
   `random_stat_group_N` ordering. A mis-filed effect contributes **exactly 0**
   *and* raises a blocking issue, so one mismatch made an entire imported build
   uncalculable ("Optimizer unavailable"). Now each stat is placed in a group the
   item actually offers, preferring the stored number when legal; unplaceable
   stats are dropped rather than stored invalid. `web/tl-core.js`,
   `importedHeroicEffects()`.
2. **Overall Mastery Level was never imported.** Questlog sends the selected
   unified nodes but no level, so every import with a unified selection raised a
   blocking issue. We now derive the highest `requiredLevel` among the selections
   — a lower bound the game already proved by allowing the pick. An explicit
   value still wins. `web/tl-core.js`, `impliedOverallMasteryLevel()`.
3. **Composite floors named no binding component.** "PvP Hit Chance" is
   `pvp_all_accuracy`, scored as the **minimum** of PvP melee/ranged/magic. A
   player typing their sheet value unknowingly demands all three clear it. The
   infeasibility error now names the limiting component and the diagnostics carry
   `components` / `bindingComponent`. `web/optimizer/tl-full-build-adapter.js`.

The optimizer precache was regenerated; every cell changed **only** in
`engineFingerprint`, so no optimizer result moved.

## The parity harness

- `scripts/verify-questlog-parity.mjs` — offline verifier. `--verbose` lists every
  mismatch, `--json` for machine consumption.
- `scripts/reference-builds/questlog-parity/<buildId>.json` — six fixtures, each
  freezing the questlog payload **and** its rendered stats panel together.
- Stats are matched by **display label**. Both sides label from the same game
  data, so there is no hand-written mapping to drift.
- Each fixture carries `baselineParity`, a ratchet at today's number. Parity may
  rise freely; any drop exits non-zero.

`scripts/reference-builds/README.md` claims the expected totals cannot be
scripted because the character page is client-rendered. That is no longer true —
a browser can read the rendered panel. The six panels here were captured that way.

**Hard rule: recapture payload and panel together.** Owners edit their builds. A
live refresh of the older reference fixture turned 43/43 into 22/43 purely
because the character had been re-specced since transcription — a false alarm
that cost real time.

## Rules of engagement learned the hard way

- **Never guess a game constant to close a gap.** The calculator's authority is
  the product. An unresolved question is cheaper than a wrong number that fits
  one character and corrupts every other.
- **Check staleness before declaring a logic bug.** Two of the three problems
  above are data, not code.
- A lazy-greedy (CELF) rewrite of the mastery allocator was implemented, measured
  at 1.8× fewer evaluations, and **reverted**: it produced a strictly worse
  crossbow build because marginal gains are not submodular under composite
  `min()` goals. Forcing full sweeps made all four A/B cases identical, proving
  the implementation correct and the algorithm unsuitable. Do not retry without
  an exactness gate. Performance work is explicitly deprioritised until parity is
  solved.

## Recommended order of work

1. **Refresh the eight questlog public mirrors and rebuild the projection.**
   This is now the highest-leverage step: it is the confirmed fix for Problem 3
   and the presumed fix for Problem 1, and it is a prerequisite for everything
   else. No game-file extraction needed — these are public endpoints.
2. Retire `SkillSet_Unique_Accessory_Skill_01` and `SkillSet_Unique_Armor_Skill_01`
   from `PERK_PASSIVE_RULES` **in the same change** as step 1, and only if the
   refreshed data actually supplies the inherent stats.
3. Determine whether the rune-synergy misses are stale data or a broken lookup.
   Gates the two broken archetypes (healer, magic DPS).
4. Re-run `scripts/verify-questlog-parity.mjs`, raise the baselines, and
   regenerate the optimizer precache (`scripts/precompute-optimizer-results.mjs
   --force`, ~25 min) — a game-data change fails the precache test until then.
5. Problems 3 and 4 need **no calculator change** — the refresh resolves both.
   Verify they went to zero rather than assuming it.

## Rune synergy warning is a FALSE ALARM — settled 2026-07-24

`"<slot> has three runes but no matching rune synergy in the cached table."`
fires on four of six fixtures. It is not a data gap and not a lookup bug.

The refreshed synergy table holds exactly 78 rows = 6 permutations × 13 slots,
i.e. only combinations of one Attack + one Defense + one Assist rune. Every
reported miss is `attack×3`, `defense×3` or `assist×3`.

**Proof that three same-type runes grant nothing:** the Ranged DPS fixture
(8244627) carries `Atk/Atk/Atk` on both head and feet, raises the warning for
both, and scores **72/72 = 100% parity** against questlog's own rendered panel.
If that configuration granted a synergy we would be missing it and could not be
perfect. Both lookup implementations are therefore correct and the data is
complete.

Two consequences:

1. **The warning is too broad** and should only fire when a synergy is genuinely
   expected. Today it marks legal builds `provisional` — Ranged DPS is
   `provisional` for this reason alone. That matters beyond cosmetics: blocking
   issues are what produce "Optimizer unavailable" and stop the optimizer running
   on a perfectly good build, the same class of defect as the Heroic-effect bug
   fixed earlier.
2. **Magic DPS's missing hundreds are not rune synergies.** Look elsewhere.

## The nine remaining mismatches

```
Evasion tank   Magic Defense                3420 -> 3220     (-200)
Evasion tank   Melee Defense                3869 -> 3669     (-200)
Evasion tank   Ranged Defense               4176 -> 3976     (-200)
Melee DPS      Max Mana                    10430 -> 9430    (-1000)
Melee DPS      Melee Defense                3614 -> 3314     (-300)
Melee DPS      Ranged Defense               3776 -> 3476     (-300)
Melee DPS      Attack Speed                  0.33 -> 132    (artifact)
Healer         Healing                    120.07 -> 132.07    (+12)
Magic DPS      Critical Damage Resistance      42 -> 36        (-6)
```

- **Melee DPS Attack Speed is a capture artifact, not a defect.** Questlog prints
  "Attack Speed" twice (`0.33s` and `132%`); the panel captured the seconds row.
  Our 132% matches the percentage row. Fix by recapturing that fixture's panel.
- **Melee DPS / Evasion tank defense + mana** still carry the Dark Wing signature
  (−1,000 mana, −300/−200 defenses) after the refresh and rule retirement. Most
  of the band closed; these residuals did not. Unresolved.
- **Healer Healing is now +12 OVER.** See the warning below.

## WARNING: the heal_modifier change needs re-verification

`web/tl-questlog-rules.js:42` was changed from an orphan `Healing: 3` to the
canonical `heal_modifier: 300` (3 display points per fabric piece). The change of
stat id is certainly right — `Healing` is not a real stat id and contributed
nothing.

**But it was validated against the mispaired healer fixture.** Against the
correctly-paired build we are now **+12 over** on Healing, implying the true
contribution is 3 display points, not 15. Either the bonus applies once rather
than per piece, or the magnitude is wrong.

Do NOT tune the constant to make the number fit. Establish how many fabric pieces
the build wears and whether the material bonus is per-piece or once, then set the
value from that evidence. (An attempt to count fabric pieces via
`item.material` / `item.armorMaterial` returned nothing — those are the wrong
field names; find the real one first.)

## Still unexplained after the refresh

- **Healer 8023583** shows a general Hit Chance excess of **+450** with PvP exact
  — a distinct defect, not explained by Problems 3 or 4.
- **Magic DPS 8255167** remains broken on unresolved rune synergies.
- Whether the rune-synergy misses are absent data or a failing lookup
  (`matchingSynergy` in `web/optimizer/tl-optimizer-components.js`).

## Useful commands

```bash
node scripts/verify-questlog-parity.mjs --verbose   # parity, all archetypes
node scripts/verify-reference-build.mjs             # 69/69 calculator fixtures
npm test                                            # 908 tests
node .bench/capture-character.mjs <slug> <buildId>  # freeze a new character (network)
```
