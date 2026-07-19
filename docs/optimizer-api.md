# Structured optimizer API (`window.tlHelper`)

A scriptable control surface so automation — or an LLM driving the page — can run
the whole optimize → inspect → save → activate lifecycle without operating
individual browser controls. It is exposed on **`window.tlHelper`** by the Build
Optimizer page (`full-build-optimizer.html`) once the engine has loaded, and is
implemented by `web/tl-optimizer-api.js` (pure, dependency-injected; unit-tested
in `scripts/tests/optimizer-api.test.mjs`).

It operates on the same local-first storage the Armory uses, so it is scoped to
the current browser session — there is no separate credential. Sign-in state is
irrelevant to the local operations; cloud sync (if signed in) picks up saved
presets on the next sync as usual.

## Operations

| Method | Purpose |
| --- | --- |
| `getAccount()` | Current build: profile, attributes, equipped weapons, favourite stats. |
| `listPresets()` | All saved builds with `{id, name, origin, createdAt, weapons, heroics, keyStats}`. |
| `listSets()` | Armor set catalogue `{id, name, pieces}` — valid ids for `sets.require`. |
| `getPreset(id)` | One preset summary plus its full `build`/`attributes`. |
| `renamePreset(id, name)` | Rename; duplicate names are disambiguated (`Name (2)`). |
| `deletePreset(id, {confirm:true})` | Delete — **requires `confirm:true`** (irreversible). |
| `optimize(request)` / `preview(request)` | Run the optimizer; returns a structured result with a stable `resultId`. Nothing is persisted. |
| `getCandidates(resultId)` | Retained Pareto/tradeoff candidates from a prior `optimize`, each with its goal vector. |
| `saveResult(resultId, {name?, replacePresetId?})` | Persist a result as a new preset, or replace an existing one in place. |
| `activatePreset(id)` | Make a preset the live Armory build; the replaced build is backed up for the Armory's Restore control. |

`optimize` and `saveResult` are deliberately separate steps: `optimize` never
writes, and `saveResult` requires the `resultId` from a prior `optimize`, so a
result is never ambiguously auto-saved.

## Request schema

```jsonc
{
  "weapons": ["sword", "greatsword"],          // scratch build; "greatsword" aliases to sword2h. Omit to optimize the current account build.
  "heroics": {
    "maximum": 3,
    "itemPolicy": "allow_all",                 // "allow_all" | "keep"
    "configurationPolicy": "optimize"          // "optimize" (re-roll traits/effects) | "keep" (exact config)
  },
  "goals": [
    { "stat": "pvp_all_critical_defense", "mode": "target",   "value": 3000 }, // hard floor, stops rewarding past it
    { "stat": "pvp_magic_double_defense", "mode": "minimum",  "value": 2000 }, // hard floor, keeps rewarding
    { "stat": "weaken_accuracy",          "mode": "maximize"                 }
  ],
  "sets": {                                       // optional set-effect controls (omit for default behavior)
    "require": "set_aa_T2_leather_001",           // a set id from listSets() that must be active
    "minimumActiveBonuses": 2,                     // at least N active set bonuses
    "allowBreaking": false,                        // reject builds with partial (broken) sets
    "prefer": true                                 // soft: break score ties toward more active sets
  },
  "deprioritize": ["hp_max", "damage_reduction"] // recorded and echoed back as `ignored`; the engine has no explicit de-prioritise term
}
```

Goal `value`s are in the same display units the game shows; they are converted to
raw internally. `mode` is `maximize` | `minimum` | `target`. Ranking is the array
order. Heroic policy maps: `allow_all` → replace with any legal Heroic;
`keep`+`optimize` → keep the item, re-optimize its traits and Heroic effects;
`keep`+`keep` → keep the exact stored configuration.

## Response

`optimize`/`preview` return:

```jsonc
{
  "resultId": "1a2b3c4d",                 // deterministic for the same request + game build
  "name": "Optimized build from scratch",
  "score": 1.72,
  "equipment": [ { "slot": "main_hand", "item": "…", "grade": 51, "selection": { /* exact config */ } }, … ],
  "goals": [ { "stat": "…", "name": "…", "value": 3024, "formattedValue": "3,024", "rank": 1, "minimumMet": true, "components": [ … ] }, … ],
  "setEffects": [ { "name": "…", "equippedPieces": 4, "active": [2, 4] }, … ],
  "heroicEffects": [ { "slotId": "cloak", "itemName": "…", "groups": [ { "groupNumber": 1, "selected": { … }, "feedsGoals": [ … ], "tieBreaker": false } ] }, … ],
  "assumptions": [ … ],
  "explanations": [ … ],                  // includes set-break rationale and per-Heroic-effect reasoning
  "ignored": { "deprioritize": [ … ] }    // present only when the request carried unsupported hints
}
```

## Performance

`optimize` is routed through a throwaway Web Worker (`tl-builder-worker.js`), the
same engine and worker pool the interactive UI uses, so the search runs in
parallel and **never blocks the tab**. A typical improve run finishes in ~15s; an
unrestricted scratch search takes longer but still runs off the main thread. The
call resolves when the search completes, so `await` it as a long-running promise;
the lightweight operations return immediately. Injecting `runOptimize` into
`createOptimizerApi` overrides this (the default without it is the in-thread
adapter, used by the unit tests).
