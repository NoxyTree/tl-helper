# Test fixtures

Small verified samples extracted read-only from the local Throne and Liberty
installation so repository tests never need the game archives or the AES key.
Total size is ~42 KB. Do not add large payloads here (the 25 MB TLSkill raw
table stays in the data root, never in the repo).

## Provenance

- Game version: `1.431.22.7761`
- Steam build: `24118850` (buildid from `appmanifest_2429640.acf`)
- Extracted: 2026-07-10 by `tl-collector 0.1.0` (CUE4Parse 1.2.2.202607),
  archives opened strictly read-only; source verified unchanged before/after
  (see `D:\TL_Data\manifests\24118850\verification.json`).
- Raw `.uasset` bytes are byte-identical to the independent FModel extraction
  preserved in `D:\TL_Extracted` (hash-verified).

## Files (build 24118850)

| File | Source package path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `24118850/TLRuneInfo.uasset` | `TL/Content/Game/Client/Table/TLRuneInfo.uasset` | 29,301 | `6a4c2e3e8ce87cacfc5766f0ea8ad2e9957e01b5010fcf634921ed9610ed7961` |
| `24118850/TLSkillLevelSetting.uasset` | `TL/Content/Game/Client/Table/TLSkillLevelSetting.uasset` | 1,561 | `48f4fe33af76a9dc8d49bbffcd1f3ea80c104935a52b4a6e939dec1d997e81fe` |
| `24118850/I_Ammo_0.png` | decoded from `TL/Content/Image/Icon/Item_128/AMMO/I_Ammo_0.uasset` (UTexture2D, 128x128, AssetRipper decoder, PNG) | 11,482 | `0496d492e9edd369e64996e4528166b418d8eb82a661aaf95218f9cdbf68cdee` |

Consumed by `src/TlCollector/Tests/FixtureTests.cs` (hash stability and
forbidden-asset-filter checks). The tables are `TLJsonDataTable` packages:
readable property JSON exposes only the row schema; full row payloads live in
these raw bytes and are the Milestone 3 decoder target.
