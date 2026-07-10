# Mastery Node Images

## Summary

The Mastery node images are not currently downloaded into this project as local `.webp`, `.png`, or other image files.

The project instead stores the source asset paths and resolved Questlog CDN URLs for the Mastery nodes. The tracker loads images from those remote URLs when needed.

## Local Reference File

The complete Mastery node index is stored at:

`C:\_Projects\tl-character-extract\out\tracker-weapon-masteries-index.json`

This file contains 544 Mastery records. Of those records:

- 495 contain an image asset path.
- 495 contain a resolved Questlog CDN image URL.
- The references resolve to 193 unique image URLs because many Mastery nodes reuse shared icons.
- 49 records currently have no image URL in the source data.

The containing output folder is:

`C:\_Projects\tl-character-extract\out`

## Fields Containing the Image Information

Each Mastery record can contain these fields:

- `iconPath`: The original game-style asset path supplied by the public data.
- `iconKey`: The final source asset name extracted from the path.
- `questlogImageUrl`: The resolved `.webp` URL used to retrieve the image.

Example:

```json
{
  "id": "Bow_High_Attack_01",
  "name": "Ranged Critical Hit Augment",
  "iconPath": "/assets/Game/Image/Skill/WeaponSpecialization/M_COMMON_2.M_COMMON_2",
  "iconKey": "M_COMMON_2",
  "questlogImageUrl": "https://cdn.questlog.gg/throne-and-liberty/assets/Game/Image/Skill/WeaponSpecialization/M_COMMON_2.webp"
}
```

## CDN Image Locations

The 193 unique referenced images are distributed across three CDN path groups.

### Weapon-Specific Active Mastery Icons

120 unique references are under:

`https://cdn.questlog.gg/throne-and-liberty/assets/Game/Image/Skill/Active/WeaponSpecialization/`

### Shared Mastery Icons

49 unique references are under:

`https://cdn.questlog.gg/throne-and-liberty/assets/Game/Image/Skill/WeaponSpecialization/`

### Other Active Skill Icons

24 unique references are under:

`https://cdn.questlog.gg/throne-and-liberty/assets/Game/Image/Skill/Active/`

The CDN may not provide a browsable directory listing. Individual complete image URLs from the JSON index can still be opened directly.

## URL Conversion Rule

The image URL is produced from `iconPath` using this rule:

1. Start with the original asset path.
2. If the path contains a `.`, remove the final `.` and everything after it.
3. Prefix the remaining path with `https://cdn.questlog.gg/throne-and-liberty`.
4. Append `.webp`.

Example source path:

```text
/assets/Game/Image/Skill/WeaponSpecialization/M_COMMON_2.M_COMMON_2
```

Resolved URL:

```text
https://cdn.questlog.gg/throne-and-liberty/assets/Game/Image/Skill/WeaponSpecialization/M_COMMON_2.webp
```

The URL conversion is implemented in:

- `C:\_Projects\tl-character-extract\scripts\Build-TrackerDataset.ps1`
- `C:\_Projects\tl-character-extract\scripts\build-web-data.mjs`

## Local Game Assets

The installed game directory inspected by this project is:

`D:\SteamLibrary\steamapps\common\Throne and Liberty`

The readable loose Mastery-related assets found there are `.bk2` interface animations, including:

- `BK2_SkillBook_WeaponProficiency_frame.bk2`
- `BK2_SkillMasterySmokeCirle_LoopFX.bk2`

These are UI frames and effects, not the individual static Mastery node icons. The static gameplay and UI assets that might contain the original icons are inside encrypted Unreal archives and were not extracted.

## Current Local Storage Status

There is no local folder containing all Mastery node images at present.

The project currently has:

- A local JSON index containing the image references.
- Remote CDN URLs for the available images.
- No downloaded local image cache.

If local copies are needed later, a suitable destination would be:

`C:\_Projects\tl-character-extract\web\assets\mastery-nodes`

That folder does not currently exist and is only a suggested future location.
