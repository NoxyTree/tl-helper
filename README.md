# Throne and Liberty Character Tracker

Local prototype for a personal Throne and Liberty companion: an Armory build
planner plus a daily/weekly progress tracker.

## Run

Serve the `web` folder with any static server, then open `index.html`.

```powershell
cd D:\TL_Helper\web
python -m http.server 8790 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8790/index.html   (Armory build planner)
http://127.0.0.1:8790/tracker.html (daily/weekly tracker)
```

Open the bundled Questlog reference build directly:

```text
http://127.0.0.1:8790/index.html?preset=questlog-the-death-prophet-and-void
```

## Pages

- `web/index.html` — Armory: character doll, stats, skills, mastery wheel, runes, artifacts, Edit Slot modal.
- `web/tracker.html` — Tracker: daily/weekly loops, weekly caps, notes, plus a read-only mirror of the Armory build.
- `web/ItemHoverCard.dc.html` — shared item hover tooltip component (loaded by both pages via `dc-import`; keep the exact filename).
- `web/tl-core.js` — framework-agnostic data + build logic (stat calc, hover model, skill tiers, mastery costs). Both pages import it.
- `web/support.js` / `web/image-slot.js` — Design-Component runtime and portrait drop-zone component.
- `web/data/app-data.json` — full game dataset (items, runes, skills, masteries, sets).

## State

- Armory build: `localStorage["tlhelper-builder-state-v2"]`
- Armory presets: `localStorage["tlhelper-builder-presets-v1"]`
- Tracker: `localStorage["tl-tracker-state-v1"]` (reads, never writes, the Armory key)

The Presets control can save the current build, load a preset, rename it,
move it up or down, and remove it. The bundled reference is added the first
time preset storage is initialized in a browser.

## Reference

- `design-handoff/` — handoff README, reference screenshots, mastery icon index.
- `src/TlExtract`, `scripts/`, `out/` — game-data extraction pipeline that produced the dataset.

The reference regression test currently matches all 43 asserted totals,
including 7,128 combat power.
