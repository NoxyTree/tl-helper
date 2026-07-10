# Throne and Liberty Character Tracker Data Report

Generated: 2026-07-08

## Safety boundary

This extraction stayed static and offline for the game install:

- Did not launch the game.
- Did not attach to the game process.
- Did not inspect memory, capture packets, or interact with Easy Anti-Cheat.
- Did not extract, brute force, or search the executable for archive keys.

## Local install findings

Game install inspected:

`D:\SteamLibrary\steamapps\common\Throne and Liberty`

Main package directory:

`D:\SteamLibrary\steamapps\common\Throne and Liberty\TL\Content\Paks`

The installed client uses encrypted Unreal archives for the important gameplay and localization data. The unencrypted mounted archives only exposed map and landscape data:

- Total mounted archive files: 1,874
- Candidate character/item/skill/rune files from unencrypted archives: 0
- Main gameplay, localization, item, skill, rune, and database archives: encrypted

Loose UI movie assets were readable:

- Loose UI `.bk2` files: 2,078
- Character-related loose assets after classification: 1,380
- Grouped visual assets: 716
- Local item visual groups: 328
- Character/NPC/companion visual groups: 313
- Questlog equipment items with plausible local `.bk2` visual candidates: 141

These local assets are mostly Bink movie files, not simple PNG/WebP icons. They are useful as presentation or preview assets, but not enough to recover full item names, rune stats, skill descriptions, or weapon mastery tables from the game directory alone.

## Questlog public data findings

Questlog is a Nuxt app. The public page loads:

`https://cdn.questlog.gg/_static/throne-and-liberty/_nuxt/CSq355zw.js`

That browser bundle exposes read procedures through:

`https://questlog.gg/throne-and-liberty/api/trpc/{procedure}?batch=1&input=...`

Working read input shape:

```json
{"0":{"language":"en"}}
```

Fetched read-only procedures:

- `characterBuilder.getEquipmentItems`
- `characterBuilder.getPreviewEquipmentItems`
- `characterBuilder.getEquipmentItemSets`
- `characterBuilder.getEquipmentRunes`
- `characterBuilder.getRuneSynergies`
- `characterBuilder.getAttributeStats`
- `skillBuilder.getSkillSets`
- `skillBuilder.getSkillTraits`
- `weaponSpecialization.getWeaponSpecializations`

Snapshot counts:

- Equipment items: 1,752
- Equipment item sets: 78
- Equipment runes: 132
- Rune synergies: 78
- Attribute stat groups: 5
- Skill sets: 210
- Skill traits: 398
- Weapon masteries/specializations: 544

Questlog includes names, ids, grades, equipment categories, stat structures, skill descriptions, rune stat tables, weapon mastery data, and icon asset paths. The icon fields are source asset paths used by Questlog's app, and the tracker outputs now include resolved direct CDN image URLs wherever an icon path is present.

The Questlog image helper was recovered from the public static chunk:

`out/questlog-chunks/Cic1jPfS.js`

For Throne and Liberty, the formula is:

1. Start with the `icon` path from the data.
2. If the path contains `.`, strip everything from the last `.` onward.
3. Prefix `https://cdn.questlog.gg/throne-and-liberty`.
4. Append `.webp`.

Example:

`/assets/Game/Image/Icon/Item_128/Equip/Weapon/IT_P_Bow_00002.IT_P_Bow_00002`

becomes:

`https://cdn.questlog.gg/throne-and-liberty/assets/Game/Image/Icon/Item_128/Equip/Weapon/IT_P_Bow_00002.webp`

This was validated with `HEAD` requests against sample item, ammo, and skill icons, all returning `image/webp`.

## Generated files

Local extraction outputs:

- `out/archive-summary.json`
- `out/archive-files.json`
- `out/loose-asset-summary.json`
- `out/loose-ui-assets-classified.json`
- `out/character-related-loose-assets-classified.json`
- `out/visual-asset-groups.json`
- `out/item-visual-groups.json`
- `out/character-visual-groups.json`

Questlog raw public snapshots:

- `out/questlog-public/characterBuilder.getEquipmentItems.json`
- `out/questlog-public/characterBuilder.getEquipmentItemSets.json`
- `out/questlog-public/characterBuilder.getEquipmentRunes.json`
- `out/questlog-public/characterBuilder.getRuneSynergies.json`
- `out/questlog-public/characterBuilder.getAttributeStats.json`
- `out/questlog-public/skillBuilder.getSkillSets.json`
- `out/questlog-public/skillBuilder.getSkillTraits.json`
- `out/questlog-public/weaponSpecialization.getWeaponSpecializations.json`

Dropped inputs (2026-07-10): `characterBuilder.getPreviewEquipmentItems.json` (1,357 records) and the local `.bk2` visual-candidate manifest were never consumed by the web app or `build-web-data.mjs`; they are no longer part of the pipeline. Re-fetch from the tRPC route if preview icons are ever wanted.

Tracker-friendly indexes:

- `scripts/Build-TrackerDataset.ps1`
- `out/tracker-seed-summary.json`
- `out/tracker-items-index.json`
- `out/tracker-runes-index.json`
- `out/tracker-skills-index.json`
- `out/tracker-weapon-masteries-index.json`
- `out/tracker-attribute-stats.json`
- `out/tracker-image-manifest.json`
- `out/tracker-full-dataset.json`

Image-link coverage:

- Image manifest entries: 3,354
- Direct Questlog CDN image URLs: 2,589
- Equipment items with plausible local `.bk2` visual candidates: 141

## Practical recommendation

For a character tracker, use the Questlog public read data as the initial metadata source, cache it locally, and treat it as undocumented and change-prone. Use the local game directory only for supplemental loose `.bk2` visual candidates and for verifying whether the installed client contains newly added loose assets.

Avoid anything involving archive key extraction, process inspection, packet capture, or live game automation. The useful and low-risk path is public web data plus static local file inventory.

## Tracker implementation notes

Current rule and scoring assumptions are documented in `tracker-rules.md`.

The web tracker separates the local `Estimated Stat Score` from official combat power. The Armory shows a fitted combat-power heuristic (hardcoded tables + item bonus allowlists in `web/tl-questlog-rules.js`, tuned to match the reference build) labeled "Combat Power (est.)" — it is an estimate, not extracted game power tables.
