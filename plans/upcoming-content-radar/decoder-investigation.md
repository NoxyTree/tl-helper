# TLJsonDataTable decoder investigation

Date: 2026-07-10 · Game build: 1.431.22.7761 (Steam 24118850) · Status: **format decoded and independently verified**

A prior background investigation was cancelled before reporting; this document reflects a fresh, verified analysis done directly against the preserved raw packages in `D:\TL_Extracted\data\TL\Content\Game\Client\Table\` (read-only; nothing was modified or repacked).

## Format findings (byte-level, verified)

Packages examined: `TLSkillLevelSetting.uasset` (1,561 B), `TLRuneInfo.uasset` (29,301 B), plus 16 more tables including `TLSkill.uasset` (25.3 MB).

1. **Container**: Zen/IoStore package as exported by FModel (no legacy `C1 83 2A 9E` magic). Layout: zeroed/summary header → FName table → import/export metadata (64-bit public-export hashes, which look like high-entropy noise in a strings dump) → export blob.
2. **Name table**: contiguous `FSerializedNameHeader` entries — 2 bytes (`utf16 flag | length`) followed by the raw bytes. The package's own object path (`/Game/Game/Client/Table/<Name>`) is the anchor entry. Row IDs, field names, enum type names, enum *values*, property type names, and cross-referenced row names all live here.
3. **Export blob** (the part FModel's JSON omitted) serializes exactly like a stock `UDataTable`:
   - tagged UObject properties (`RowStruct` etc.) terminated by FName `None`
   - `u32` serialized-guid flag (observed 0)
   - `i32` row count
   - per row: `FName rowId`, then a standard **tagged** `FPropertyTag` stream (`name, type, size, arrayIndex, type-specific extras, hasGuid, value`) terminated by `None`.
4. **Tagged, not unversioned**: the presence of `IntProperty`/`NameProperty`/`EnumProperty`/`StructProperty` FNames is the tell. Tagged serialization is self-describing, so **no `.usmap` mappings file is needed** for table rows. Unknown value types can be skipped by their declared size without desynchronizing.
5. Observed value encodings: `EnumProperty` → FName of the enum value (e.g. `ETLRuneType::Attack`); `SoftObjectProperty` → FName asset path + FString subpath (used for icon paths); `StructProperty TLDataHandle` → nested tagged stream carrying `RowName` (cross-table row reference); `TextProperty` → FText, historyType 11 (`StringTableEntry`: FName string-table path + FString key — the key equals the localization CSV key).

Why FModel showed "schema only": CUE4Parse has no class mapping for `TLJsonDataTable`, so it deserialized the export as a generic `UObject` (just the `RowStruct` pointer) and never read the row map that follows. The data was always there.

## Row readability verdict

**Full row decode is possible offline, without the game, without a .usmap.** Implemented as `scripts/decode-tljson-table.mjs` (Node, no dependencies, decoder version 0.1.0). Results on the 18 priority tables — all decoded with **zero unsupported property types, zero warnings, and zero trailing bytes** (the stream is consumed byte-exactly, a strong structural correctness check):

| Table | Rows decoded |
| --- | ---: |
| TLSkill | 15,934 |
| TLItemLooks | 6,766 |
| TLSkillLevelUpRecipe | 3,790 |
| TLAbnormalState_Common | 3,297 |
| TLItemLooks_Equip | 2,272 |
| TLRewardNpcFoItem | 1,829 |
| TLItemStats | 1,818 |
| TLItemEquip | 1,499 |
| TLCraftingRecipe | 678 |
| TLItemStatAttrConverter | 292 |
| TLItemCombatPower | 132 |
| TLCookingRecipe | 81 |
| TLRuneInfo | 72 |
| TLPassiveSkillLooks | 21 |
| TLRuneSynergy | 13 |
| TLItemAttackSpeedBaseline / TLRuneGrowth / TLSkillLevelSetting | 9 / 9 / 5 |

Independent validation (rule: never claim decode without external verification):

- **TLSkill**: 15,191 of the 15,674 strings in `indexes/TLSkill.identifiers.txt` are actual row IDs (the remainder are name-table strings that are field values, not rows — the identifiers list was a name-table scan, not a row list).
- **TLItemStats**: 1,351 of 1,818 decoded row IDs appear in Questlog's 1,752 equipment items (consistent with the coverage audit's 1,355/2,438 measured against the broader identifiers list).
- **Known row spot-checks**: `TLRuneInfo["Rune_Weapon_Attack"] = {RuneNum:101, RuneTargetCategory:Weapon, RuneType:Attack, PositiveRandomStatGroup→Atk_Rune_rng_Weapon}`; `TLSkill["WP_CR_S_CriticalAttack"]` carries damage_type/attack_side/skill_delay/valid_range fields; `TLSkillLevelSetting` rows 1–5 map skill grades kB→kSS to first levels 1/6/11/16/21.
- **Localization chain**: `TLItemLooks_Equip["sword_aa_S1_arch_002"].UIName = {stringTable: TLStringItemLooks_Equip, key: "sword_aa_S1_arch_002_UIName"}` → `en.csv` → **"Ascended Ramux Sword"**, and its `IconPath` resolves to an extracted PNG. IDs, names, icons, and stats now link without Questlog.

What a strings-level scan yields by comparison: row IDs and referenced names only (~97% ID recall on TLSkill, 0% of field values/structure) — useful for discovery, insufficient for data.

## Recommended approach (ranked)

1. **Use the working Node decoder now** (`scripts/decode-tljson-table.mjs`) for batch decoding preserved `.uasset` payloads into `TL_DATA_ROOT\decoded\<build>\tables\*.json`. Effort: done for priority tables; remaining work is coverage of rare property types (`MapProperty`, `SetProperty`, FText history types other than None/Base/11 — none encountered yet; they are skipped by size and reported in `unsupportedTypes`, never silently dropped).
2. **For C# collector integration (Milestone 2/3)**: register the class in CUE4Parse — `ObjectTypeRegistry.RegisterClass("TLJsonDataTable", typeof(UDataTable))` — since the serialization is UDataTable-compatible. This gets rows straight from the archives without the FModel export intermediary. Small risk: CUE4Parse's UDataTable path expects the row struct to resolve; if `/Script/TLScheme` structs are missing it may still fall back — the Node decoder remains the reference implementation either way.
3. **Do not** pursue UAssetAPI/unreal_asset for this: they target legacy .uasset layouts and would need Zen support plus the same custom-class mapping.

Community tooling: not re-surveyed after the earlier investigation was cancelled; no external parser is needed given (1), so this is a curiosity, not a blocker.

## Caveats

- Layout constants (guid flag position, name-table anchor) are verified on build 24118850 only; the decoder throws loudly (`implausible row count`, anchor failure) rather than guessing if a future build shifts them.
- `TLDataHandle` serializes only `RowName`; the target table is implied by the field's schema, not stored per-row. Cross-reference resolution therefore needs a small field→table map, curated per family (e.g. `PositiveRandomStatGroup` → `TLItemRandomStatGroup`).
- `ObjectProperty` values are package-local import/export indices; resolving them to object paths needs the import map (not yet parsed — reported as `{objectIndex}`).
