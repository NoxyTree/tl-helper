# LLM Build Control

`/llm-build-control.html` is a compact control surface for agents and other tools that need to create TL Helper builds without operating every visual control individually.

The page accepts one JSON request, validates its human-readable stat and slot names against the live catalogue, runs the same full-build optimizer worker as the normal UI, and returns one JSON response. The response contains the recommended equipment, selected goal totals, active set effects, tradeoffs, warnings, search metrics, and preset/Armory persistence status.

## Request schema

```json
{
  "version": 1,
  "operation": "optimize",
  "source": { "kind": "armory" },
  "account": {
    "mode": "signed_in",
    "expectedName": "noxytree",
    "syncPreset": true
  },
  "goals": [
    { "stat": "PvP Endurance", "mode": "maximize" },
    { "stat": "Weaken Chance", "mode": "target", "value": 2000 },
    { "stat": "Buff Duration", "mode": "target", "value": 90 }
  ],
  "protect": [],
  "locks": { "keepHeroics": true, "slots": [] },
  "rules": {
    "minimumItemLevel": 50,
    "includeSetEffects": true,
    "traits": "optimize",
    "runes": "normal",
    "artifacts": "sets"
  },
  "search": { "depth": "refine" },
  "output": {
    "savePresetAs": "SNS/GS Tank + Weaken",
    "replacePreset": true,
    "activateInArmory": false,
    "includeFullResult": false
  }
}
```

## Sources

- `{ "kind": "armory" }` uses the build currently loaded in TL Helper.
- `{ "kind": "preset", "name": "Preset name or ID" }` uses a browser-local Armory preset.
- `{ "kind": "questlog", "url": "https://questlog.gg/..." }` imports a Questlog build first.

## Goals

Goals are ranked in array order. `mode` is `maximize`, `at_least`, or `target`. The last two require `value` in the same display units used by TL Helper; percentage values are converted to the calculator's internal basis-point representation automatically.

`at_least` remains rewarded above the floor. `target` stops rewarding the stat after the floor has been reached. Use `protect` for stats that cannot fall below the source build's current value.

## Account targeting

Use `account.mode: "signed_in"` to require an authenticated TL Helper session before the expensive optimizer run begins. `expectedName` is optional; when present, the request stops unless the active account name or provider username matches it. No credential, token, email address, or user ID belongs in the request.

With `syncPreset: true`, `output.savePresetAs` is required. After the complete result is saved locally, TL Helper creates the account preset immediately. Replacing a local preset with the same stable ID updates its existing cloud row.

## Persistence

`savePresetAs` saves the result to browser-local My Builds. If a matching name exists, `replacePreset` must be `true` or the request fails without overwriting anything. `activateInArmory` replaces the current browser-local Armory state only after the optimizer returns a complete result. Account synchronization happens only when the request explicitly selects `signed_in` mode and enables `syncPreset`.

## Stable browser controls

- Request textarea: `LLM build request JSON`
- Validate button: `Validate`
- Run button: `Run optimizer`
- Cancel button: `Cancel`
- Result textarea: `Structured result JSON`

These accessible names and the versioned JSON contract are the supported automation boundary.
