# TL Helper Local Build Adviser

The Local Build Adviser is a private, read-only chat service that runs on the user's Windows computer. The language model explains results and chooses tools. TL Helper's deterministic calculator and decoded SQLite warehouse remain the numeric authorities.

## What it uses

- Ollama at `http://127.0.0.1:11434`
- Model `gpt-oss:20b` by default
- Latest `D:\TL_Data\warehouse\tl-*.sqlite`, opened read-only
- `web/data/app-data.json` and its projection files
- `web/tl-core.js` for build calculation, validation, set effects, selected passives, and selected mastery nodes

The adviser server binds only to `127.0.0.1`. It is not part of the deployed website and adds no production inference or hosting cost.

## Start it

Double-click `start-local-adviser.cmd`, or run `npm run adviser:start`, then open `http://127.0.0.1:43120`.

Environment overrides:

```powershell
$env:TL_HELPER_WAREHOUSE = 'D:\TL_Data\warehouse\tl-24118850.sqlite'
$env:TL_ADVISER_MODEL = 'gpt-oss:20b'
$env:TL_ADVISER_PORT = '43120'
npm run adviser:start
```

## Build input

The page accepts a serialized `tl-helper.armory-state` document, an object containing `{ "build": ..., "attributes": ... }`, or a raw TL Helper build containing `equipment`.

Item Potentials are excluded. A candidate item comparison uses the candidate at maximum item level with no traits, runes, Heroic effects, perk, or potential. The existing configuration on all other slots remains intact.

## Available model tools

- Search projected items and inspect max-level item data
- Inspect item-set pieces and breakpoint classifications
- Search normalized stat sources
- Search and inspect decoded warehouse records
- Calculate the loaded build with validation and source breakdowns
- Compare one candidate item in one build slot

The model has no arbitrary SQL tool and the warehouse connection is read-only.

## Accuracy boundary

Static build totals include the calculation engine's supported item stats, set effects, valid selected passives, valid selected mastery nodes, runes, traits, Heroic effects, attributes, and other modeled sources. Foreign-weapon passive or mastery selections are excluded by the engine and surfaced through validation. Conditional combat effects require an explicit supported scenario. Static totals are not a damage simulation.

Results retain the engine's exact, derived, modeled, provisional, and unsupported classifications. The adviser prompt forbids inventing numeric values or claiming a globally optimal build without an optimizer result.
