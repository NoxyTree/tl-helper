# Handoff: TL Helper — Armory Build Planner + Progress Tracker

## Overview
Two connected pages for a Throne and Liberty companion site ("TL Helper"), plus one shared component:

1. **Armory** — a full character build planner: a character "doll" (equipment slots, weapons, artifacts, portrait) on the left and a tabbed workspace on the right (Effects/stats, Skills, Mastery wheel, Runes, Artifacts). An "Edit Slot" modal picks items and configures traits/resonance/level.
2. **Tracker** — a personal daily/weekly task dashboard (with live reset countdowns, weekly caps, notes) that also displays a **read-only mirror of the Armory character** on the left so the page feels personal.
3. **ItemHoverCard** — a shared tooltip shown when hovering any equipped item on either page (traits, resonance, heroic trait, runes + rune synergy, skill core, set effects, weapon abilities).

The two pages already share state through `localStorage` and the same data/logic module (`tl-core.js`), so a build made in the Armory shows up on the Tracker automatically.

## About the Design Files
The files in `designs/` are **design references**, not drop-in production code. They are built as "Design Components" (`*.dc.html`) — self-contained HTML prototypes that render through a small runtime (`support.js`). They faithfully show the intended look, layout, and behavior.

Your task is to **recreate these designs in the target website's environment** (the TL Helper site appears to be a **React + Vite** app — see `tl-helper-redesigned/`), using its existing patterns, routing, and component conventions. Do **not** ship the `.dc.html` files or `support.js` directly.

**Important exception — reuse `tl-core.js` as-is.** `tl-core.js` is framework-agnostic, dependency-free ES-module business logic (data loading, stat calculation, build model, item/rune/skill/mastery helpers, and the hover-card model builder `buildItemHoverModel`). It is genuine production logic — import it directly into the React app rather than reimplementing it. The `.dc.html` files are effectively thin view layers over this module; porting means rebuilding those views as React components that call the same `tl-core.js` functions.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interactions. Recreate pixel-accurately using the exact tokens below. All icons are real remote image URLs from the extracted game data (`item.imageUrl`, `rune.imageUrl`, `skill.imageUrl`, mastery `icon`, currency `material.imageUrl`) — no hand-drawn or placeholder art. Keep using those URLs.

---

## Data
- **`designs/data/app-data.json`** — the entire game dataset: `items`, `itemSets`, `runes`, `runeSynergies`, `attributeStats`, `masteries`, `skills`, `skillTraits`, `traitsBySkillId`, `skillsByWeapon`, `artifactSets`, `slotDefinitions`, `statLabels`. Load once at startup via `initCore("<url>/app-data.json")`.
- **`designs/data/mastery-icons-index.json`** — supplementary mastery node icon index.
- Every item carries `itemStats` (traits / uniqueTraits / resonance), `setId`, `passives`, `availablePerks` (skill cores), `imageUrl`, `grade`, `equipmentType`.

## Design Tokens

### Fonts (Google Fonts)
- **Headings / display:** `Marcellus` (serif) — used for names, stat values, section titles, tab labels.
- **Body / UI:** `Instrument Sans` — everything else. Weights 400–700.
- Uppercase micro-labels use `letter-spacing: 0.14em–0.24em; text-transform: uppercase`.

### Core palette
| Token | Hex | Use |
|---|---|---|
| Background base | `#0c0a07` → `#0a0806` → `#080604` | vertical page gradient |
| Warm glow | `rgba(214,138,58,0.13)` | radial top glow |
| Text primary | `#f3e9d4` | body text |
| Text warm-white | `#e6d6b4` / `#d9c8a5` | secondary text |
| Gold bright | `#f6d391` | headings, active, highlights |
| Gold | `#e8b86a` | links, primary accent, progress fill |
| Gold muted | `#cbb185` | labels, secondary accent |
| Muted | `#8a795f` | tertiary labels |
| Muted dim | `#9d8a68` / `#6e5f49` | faint text |
| Danger | `#e56a6a` | destructive/clear |
| Success | `#55d58a` / `#7ee0a6` | equipped, synergy, active set |
| Border | `rgba(212,166,94,α)` | α ≈ 0.10–0.40 for borders/dividers |
| Panel bg | `rgba(18,14,9,0.55)` | cards |
| Inset bg | `rgba(10,8,5,0.4–0.6)` | rows, inputs |

### Grade (rarity) colors — from `tl-core.js` `GRADE_COLORS`
`0 #9aa0a8` · `11 Common #c8cdd4` · `21 Uncommon #5ecb7c` · `31/32 Rare #59a4ec` · `41/42/43 Epic #b873ff` · `51 Heroic #ff982d` · `61 Artifact #e2b354` · `71 Ancient #7fd6c9`. Use `gradeColor(grade)` / `gradeName(grade)`.

### Skill level tiers (custom, NOT the grade palette)
Skill levels are grouped into named tiers of **5 levels each** (`SKILL_TIER_SIZE = 5`), numbered **1–5 within each tier**:
- Common `#5ecb7c` (green) · Uncommon `#6bc2ff` (bright blue) · Epic `#b873ff` (purple) · Heroic `#ff982d` (orange).
- The single level above the last tier is **"Ascended"** — a special gear-potential unlock, intentionally **excluded** from the normal 1–20 ramp (`skillBandedMax()` caps normal levels). Helpers: `skillLevelBands`, `skillLevelTierFor`, `SKILL_LEVEL_TIERS`.

### Rune type colors
attack `#e56a6a` · defense `#72a9ff` · assist `#55d58a`.

### Radii / shadows / motion
- Radius: pills `999px`; cards `10–12px`; chips/tiles `6–10px`.
- Slot rings: circular 54–62px, `border: 1.5px solid <gradeColor>`, `box-shadow: 0 0 14px <gradeColor>40, inset 0 0 10px rgba(0,0,0,0.7)`.
- Panel shadow: `0 18px 40px rgba(0,0,0,0.35)`, inset top highlight `inset 0 1px 0 rgba(246,211,145,0.06)`.
- Keyframes: `tlFadeUp` (10px rise, 0.3–0.4s), `tlFadeIn`, `tlEmber` (top-edge glow pulse, 4s), `tlSlideIn` (modal), `tlEquipPulse` (equip flash), `tlSpin` (loader).
- Progress bars: 4–8px tall, fill `linear-gradient(90deg,#c08a3e,#f6d391)` with soft glow.

---

## Screens / Views

### 1. Armory — `TL Builder - Armory.dc.html`
Top bar (logo + editable character name/role/server + weapon-pair label + Auto-fill/Clear). Hero stat strip (8 chips: Max Health, Base Damage, defenses, hit, crit, heavy, cooldown). Main grid: **`470px` doll column** (sticky) + fluid workspace.

- **Character doll:** two columns of circular equipment slots (left: head, chest, hands, legs, feet, cloak; right: necklace, bracelet, belt, ring 1, ring 2, earring) flanking a portrait drop-zone (`image-slot`, id `armory-portrait`). Below: two weapon cards (main/off), a 3-stat weapon strip, and an artifacts orb row. Each filled slot shows the item icon, grade-colored ring, and an item-level badge. Clicking a slot opens the Edit Slot modal; hovering shows the **ItemHoverCard**.
- **Workspace tabs:** Effects (attributes with ± steppers + expandable stat pages), Skills, Mastery, Runes, Artifacts.
- **Skills tab:** budget strip; Active/Passive loadout as gems (grade-tier-colored ring, tier roman numeral top-right, per-tier level 1–5 badge bottom-right); a **Skill Library** grouped per equipped weapon into Active/Passive icon grids. Hover a skill → skill tooltip (tier, level, cooldown/mana, description); click → add to loadout. Right side: focused-skill editor with tier-banded level picker and specializations.
- **Mastery tab:** radial mastery **wheel** with pan (drag) + zoom (buttons/wheel), category markers, synergy/bridge diamond nodes, lane legend, weapon-point budget, and a node-detail side panel. Currency costs (Sollant, Marind, etc.) render with their asset icons.
- **Edit Slot modal:** left = searchable/filterable item list; right = item preview. Preview is a wide card: large header (62px icon), a **slider + −/+ steppers + Min/Max** item-level control, stat comparison in 2 columns, and Traits / Heroic Trait / Trait Resonance / Skill Core / Set sections. **Trait Resonance is single-select (pick one).** Traits cap at 3.

### 2. Tracker — `TL Tracker.dc.html`
Top bar (logo + nav: Armory | Tracker + editable board title + daily/weekly reset countdowns). Main grid: **`452px` character column** (the read-only doll mirror, same look as Armory, with hover cards + "Edit build in the Armory →" link) + fluid tracker column.

Tracker column: summary strip (Daily/Weekly completion bars) → **Daily Loop** and **Weekly Loop** checklists (checkbox items and counter items with −/value/+; priority items get an orange dot; add/remove custom tasks; per-section Reset) → **Weekly Caps** (progress bars with steppers) → **Notes** textarea. Default tasks reflect the current Nix-patch daily/weekly routine (Sundries Merchant, contract rights, co-op/solo dungeons, the four weekly merchants, mystic keys, bosses, raids, trials, token burn, etc.).

All grids use `repeat(auto-fit, minmax(…, 1fr))` so they reflow to one column when narrow (avoids overflow).

### 3. ItemHoverCard — `ItemHoverCard.dc.html`
Fixed 300px-wide tooltip (`max-height: 86vh`, scrolls if needed). Renders from one `data` object produced by `tl-core.js` `buildItemHoverModel(slotId, build, calc)`. Sections (in order, each shown only if present): header (icon + grade-colored name + meta) · Traits · Heroic Trait · Trait Resonance · Skill Core (the item's slotted core only — the availablePerks pool is intentionally hidden) · Weapon Abilities (weapons only) · Runes (filled runes + "Empty socket" placeholders for equipment) · Rune Synergy · Set effects (name, pieces equipped, per-tier bonuses). When a piece has no rolled selections, traits/resonance/heroic fall back to the item's own lines at max tier, capped to real slot counts (3 traits / 1 resonance / 1 heroic).

---

## Interactions & Behavior
- **Hover popout:** anchors to the right of the cursor; **flips above** the cursor when hovering in the lower half of the viewport so it never clips off-screen (`transform: translate(20px,0)` vs `translate(20px,-100%)`). `pointer-events: none`.
- **Edit Slot:** open on slot click; live stat comparison vs currently equipped; equip on item click; trait/resonance tiers toggle; level slider updates immediately; single-select resonance.
- **Skills:** click library skill to add (respects active/passive caps); tier-banded level selection; specialization toggles gated by unlock level.
- **Mastery wheel:** drag empty space to pan, wheel to zoom, Shift+click assigns points, click node to inspect then again to select; lock rules enforced by `masteryLockInfo`.
- **Tracker:** checkbox/counter toggles; daily reset at local midnight, weekly reset **Thursday** (change if the target server resets Wednesday); auto-clears completed items on rollover; live 1s countdown tick.

## State Management
- Armory build persisted at `localStorage["tlhelper-builder-state-v1"]` → `{ profile, attributes, build }`. `build` = `{ equipment, artifacts, skills, masteries }`.
- Tracker persisted at `localStorage["tl-tracker-state-v1"]` → `{ title, notes, counts, caps, customDaily, customWeekly, lastDaily, lastWeekly }`.
- Portrait image stored by the `image-slot` component under id `armory-portrait` (shared by both pages).
- The Tracker reads (never writes) the Armory build key to render its character mirror.
- Core state model + all derived values come from `tl-core.js`: `initCore`, `calculateBuild`, `statTotal`, `formatStat`, `slotItem/slotSelection`, `seedShowcaseBuild`, `buildItemHoverModel`, plus the skill/mastery/rune/artifact helpers. **Reuse these directly.**

## Assets
- Icons: remote URLs from `cdn.questlog.gg` already embedded in `app-data.json` fields (`imageUrl`, mastery `icon`, currency `material.imageUrl`). No local image assets required.
- `image-slot.js` — the drag-and-drop portrait placeholder web component (user-provided screenshot). Recreate as a React equivalent or wrap the web component.
- Fonts: Google Fonts `Marcellus` + `Instrument Sans`.

## Files (in `designs/`)
- `TL Builder - Armory.dc.html` — Armory page (view reference).
- `TL Tracker.dc.html` — Tracker page (view reference).
- `ItemHoverCard.dc.html` — shared hover tooltip (view reference).
- `tl-core.js` — **production-ready** framework-agnostic logic + data layer. Reuse directly.
- `data/app-data.json`, `data/mastery-icons-index.json` — game dataset.
- `support.js`, `image-slot.js` — the prototype runtime and portrait component (reference only; `image-slot` behavior should be recreated).

> Design-Component view files use inline styles and a small template syntax (`{{ }}`, `<sc-if>`, `<sc-for>`); read them for exact structure, spacing, and copy, then rebuild as idiomatic components in the target framework while importing `tl-core.js` for all logic.
