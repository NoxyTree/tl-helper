# Additional Game-Data Product Ideas

## Purpose

The extracted tables, localization, images, Questlog snapshots, and future build history can support several useful products beyond the upcoming-content radar and combat simulator.

## Highest-value ideas

| Idea | What it does | Main data needed | Difficulty |
| --- | --- | --- | --- |
| Patch Intelligence Dashboard | Shows new, changed, removed, and newly localized content after each patch | Collector manifests, decoded rows, localization, assets | Medium |
| Party Synergy Builder | Combines several builds and shows shared buffs, debuffs, coverage, and conflicts | Skills, effects, party scope, builds | High |
| Counter-Build Assistant | Explains which stats and effects counter a selected enemy build | Combat engine, matchup formulas | High |
| Boss and Dungeon Encyclopedia | Links bosses, mechanics, dialogue, action trees, rewards, Codex, and achievements | NPC, dungeon, reward, ActionTree, localization | Medium to high |
| Gear and Recipe Planner | Calculates materials, crafting paths, sources, and upgrade dependencies | Recipes, items, shops, rewards | Medium |
| Personal Completion Tracker | Tracks Codex, achievements, collections, fishing, housing, and rewards | Codex, achievement, collection, user state | Medium |
| Game Information Assistant | Answers sourced questions through MCP and the knowledge database | Normalized database and evidence | Medium |

## Combat and build tools

### Party Composition Lab

- Select a party or raid roster.
- Show duplicate and missing buffs.
- Show defensive and offensive coverage.
- Show cleanse, crowd-control, mobility, and healing coverage.
- Simulate party burst windows.

### Counter-Build Assistant

- Import an opponent build.
- Identify hit-versus-evasion problems.
- Identify critical, heavy, and block exposure.
- Suggest stat priorities rather than blindly recommending items.
- Explain tradeoffs and expected matchup impact.

### Build Change Explainer

Answer:

> Why did my damage, healing, combat power, or survivability change after this patch?

Compare rulesets, item records, skill changes, and build totals.

### Rotation Workshop

- Build and share rotations.
- Show buff alignment and cooldown drift.
- Compare burst and sustained variants.
- Find resource-starvation points.

### Tank and Healer Assignment Planner

- Model incoming encounter damage.
- Assign defensive and healing cooldowns.
- Warn about uncovered damage spikes.
- Calculate expected overheal and mana pressure.

## Patch and upcoming-content tools

### Patch Diff Explorer

- Visual tree of new and changed packages.
- Localization before and after.
- Icon and artwork comparisons.
- New table rows and removed rows.
- Confidence-ranked upcoming candidates.

### Content Readiness Timeline

Track a candidate across builds:

```text
Identifier only
-> localized name
-> description
-> icon
-> rewards
-> achievements
-> content schedule
-> official announcement
-> live release
```

### Skill Evolution History

- Compare skill names, formulas, cooldowns, and specializations across patches.
- Show removed and replaced skills.
- Preserve prototype or legacy skill families.

### Unused Content Museum

A clearly labeled archive of:

- Deprecated abilities
- Prototype weapons
- Old icons
- Removed events
- Test NPCs
- Unused dialogue

Keep it separate from upcoming-content predictions.

## Information and progression tools

### Complete Item Encyclopedia

- Equipment, materials, consumables, currencies, and furniture.
- Stats by level.
- Traits and potentials.
- Sources and crafting recipes.
- Related skills and sets.
- Current, upcoming, legacy, or regional status.

### Loot Source Graph

Navigate:

```text
Boss -> reward table -> chest -> item -> recipe -> material -> source
```

### Crafting Dependency Planner

- Enter desired items.
- Calculate total materials and currency.
- Merge shared ingredients.
- Show time-gated or event-only dependencies.
- Compare craft versus drop acquisition.

### Codex and Lore Graph

- Characters, factions, regions, bosses, books, and events.
- Dialogue and Codex citations.
- Spoiler-aware filters.
- Timeline and relationship graph.

### Achievement Route Planner

- Group achievements by location and activity.
- Build efficient completion routes.
- Link rewards and prerequisites.
- Flag unavailable or upcoming objectives.

### Fishing and Cooking Companion

- Fish habitats and conditions.
- Cooking recipes and buffs.
- Ingredient sources.
- Collection rewards.
- Best recipes for selected combat goals.

### Housing Catalogue

- Furniture, colour variants, categories, tags, and sources.
- Room-planning wish lists.
- Upcoming and shop-only furniture.
- Housing-power optimization.

## Visual and creative tools

### Asset Browser

- Search all 15,020 PNGs.
- Filter by skill, item, monster, Codex, dungeon, housing, and achievement.
- Link each image to known entities.
- Show unlinked assets for investigation.

### Monster and Boss Gallery

- Portraits, names, regions, skills, drops, and lore.
- Upcoming-content confidence.
- Encounter relationship graph.

### Build Cards

- Generate shareable build cards.
- Include selected stats, skills, masteries, and matchup purpose.
- Embed ruleset and game version.
- Link to reproducible build data.

### Skill Animation Storyboards

Without exporting animation assets, use skill icons, effect references, descriptions, and event ordering to create simplified explanatory storyboards.

### Patch Art Gallery

Show newly added icons and artwork by game build. This provides a visual patch diff even before every entity is decoded.

## Data-quality tools

### Questlog Coverage Auditor

- Exact local-to-Questlog asset matching.
- Local entities absent from Questlog.
- Questlog records absent locally.
- Stale names or values.
- Ambiguous matches.

### Localization Quality Explorer

- Compare all installed languages.
- Find missing translations.
- Find placeholder text.
- Find English or Korean text leaking into another locale.
- Detect new content that is localized only in selected regions.

### Orphan and Relationship Auditor

- Tables referencing missing entities.
- Images with no linked record.
- Localization keys with no linked table row.
- Questlog entries with missing local assets.
- Candidate decoder errors.

## Fun experimental ideas

### Build Tournament Simulator

Run a controlled round robin between supplied builds and policies. Present distributions and matchup weaknesses, not one absolute ranking.

### Boss Mechanic Quiz

Generate sourced quizzes from Codex, dialogue, and encounter records.

### Guess the Upcoming Content

A private evidence game where users inspect anonymized asset and localization clues before revealing the radar's classification.

### Solisium Daily Briefing

Generate a local report containing:

- Recent patch changes
- Newly detected assets
- Upcoming candidates
- Build-impact warnings
- Personal progression suggestions

### What Can I Make?

Select owned materials and receive available recipe paths, upgrade options, and missing ingredients.

## Suggested priority

After the collector and decoder:

1. Combat single-action calculator
2. Patch and Questlog coverage dashboard
3. Searchable game-data browser
4. Party synergy builder
5. Boss and dungeon encyclopedia
6. Full rotation and build-versus-build simulator
7. Crafting and completion tools
8. Creative galleries and experiments

