# Mastery Selection UI Recreation Brief

## Purpose

This document explains how the Questlog Mastery selection interface works so it can be recreated without needing to copy the original overlay directly.

Reference page:

`https://questlog.gg/throne-and-liberty/en/character-builder/TheSilenceOfTheArmoredImprovement?buildId=7935989`

The most important technical fact is that the Mastery diagram is not made from ordinary HTML nodes. Questlog renders the diagram with **Konva**, a JavaScript canvas scene-graph library. The browser therefore exposes one `<canvas>` element instead of a DOM element for every Mastery node and connector.

The supplied HTML is only the wrapper around that canvas. Copying it cannot reproduce the diagram because the nodes, icons, rings, lines, hit areas, and level labels are created at runtime by Konva.

## What Is Actually an Overlay

The screenshot contains two separate layers of UI.

### Parent Modal

The parent modal provides:

- A full-viewport dark backdrop over the character-builder page.
- A centred dialog panel.
- The build name and author header.
- The scrollable build list on the left.
- The Mastery graph in the centre.
- The Stats and Material Cost panel on the right.
- The item or passive icons below the graph.
- The Clone button at the bottom.
- Modal close behaviour.

### Mastery Graph Component

The copied HTML represents only the centre graph component. It provides:

- A fullscreen toggle in the upper-right corner.
- Previous and next weapon buttons on desktop.
- Two direct weapon-selection buttons on mobile.
- A clipped graph viewport.
- A Konva canvas inside that viewport.

The modal is not required to build the graph. The graph can first be implemented as a normal page component and later mounted inside a modal shell.

## Recommended Component Structure

```text
MasteryPreviewModal
├── ModalBackdrop
├── ModalDialog
│   ├── ModalHeader
│   │   ├── BuildTitle
│   │   ├── AuthorAndDate
│   │   └── CloseButton
│   ├── ModalBody
│   │   ├── BuildListSidebar
│   │   ├── MasteryGraphPanel
│   │   │   └── WeaponSpecializationBuildSelector
│   │   │       ├── FullscreenButton
│   │   │       ├── PreviousWeaponButton
│   │   │       ├── MobileWeaponButtons
│   │   │       ├── GraphViewport
│   │   │       │   └── KonvaStage or SVG
│   │   │       └── NextWeaponButton
│   │   └── MasteryStatsSidebar
│   └── ModalFooter
│       ├── AppliedOrOverallMasterySkills
│       └── CloneButton
```

State should live above the graph so the graph, stats sidebar, build list, and Clone action all read the same selected build.

## Suggested Modal Shell

The exact Questlog modal wrapper is separate from the copied HTML. A practical recreation can use:

```css
.mastery-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(0 0 0 / 78%);
}

.mastery-modal {
  width: min(1200px, calc(100vw - 48px));
  max-height: calc(100dvh - 48px);
  overflow: hidden;
  border: 1px solid #343434;
  border-radius: 8px;
  background: #202020;
  color: white;
  box-shadow: 0 24px 80px rgb(0 0 0 / 60%);
}

.mastery-modal-body {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr) 210px;
  min-height: 0;
}
```

The left and right columns can collapse into drawers or stacked sections on smaller screens.

Accessibility requirements for the recreated modal:

- Use `role="dialog"` and `aria-modal="true"`.
- Give the dialog an accessible title.
- Move keyboard focus into the modal when it opens.
- Trap Tab navigation inside the modal.
- Close on Escape.
- Restore focus to the button that opened the modal.
- Prevent the page behind it from scrolling.

## Canvas Viewport

The Questlog component uses:

- A fixed normal height of `700px`.
- A fullscreen height of `100dvh`.
- `overflow: hidden` on the graph viewport.
- A virtual scene size of `1000 × 1000` units.
- An initial scale of `0.675`.
- A dark canvas background.

At the initial scale, the 1000-unit scene occupies approximately 675 CSS pixels, which fits inside the normal 700-pixel viewport.

The visible canvas dimensions change with the available width. In the supplied HTML, the rendered canvas was `886 × 700` CSS pixels, but all scene geometry remains based on the virtual `1000 × 1000` coordinate system.

## Core Scene Geometry

The scene centre is:

```text
x = 500
y = 500
```

### Rarity Rings

Questlog draws four faint circular guides:

| Tier | Radius | Guide colour |
|---|---:|---|
| Common | 200 | translucent white |
| Uncommon | 326 | translucent green |
| Rare | 452 | translucent blue |
| Epic | 630 | translucent purple |

The exact recovered guide colours are:

```text
#ffffff50
#48bb7850
#65b0fc50
#A979CB50
```

### Normal Node Positions

Common, Uncommon, and Rare tiers each contain twelve normal node positions.

Their position formula is:

```js
angle = (index * (360 / 12) - 60) * Math.PI / 180;
x = 500 + radius * Math.cos(angle);
y = 500 + radius * Math.sin(angle);
```

Epic uses four positions with a `-45°` starting rotation:

```js
angle = (index * (360 / 4) - 45) * Math.PI / 180;
```

### Synergy Node Positions

There are four Synergy positions for each of the first three rarity tiers.

| Synergy tier | Radius |
|---|---:|
| Common | 263 |
| Uncommon | 389 |
| Rare | 520 |

All Synergy tiers use four positions with a `-45°` starting rotation.

### Central Category Icons

The four category markers sit around the centre:

| Category | X | Y |
|---|---:|---:|
| Utility | 420 | 420 |
| Attack | 580 | 420 |
| Defence | 420 | 580 |
| Tactics | 580 | 580 |

The current weapon icon is centred at `(500, 500)`, rendered at `128 × 128`, and displayed at approximately 50% opacity.

## Data Ordering

Questlog derives layout information from each node ID and its data fields. It splits IDs into values similar to:

```text
Weapon_Ring_Position_Number
```

It groups normal nodes into:

- `normal`
- `high`
- `rare`
- `hero`

These correspond visually to Common, Uncommon, Rare, and Epic rings.

It groups Synergy nodes into the `normal`, `high`, and `rare` rings.

The recovered category sort order is:

```js
[
  "attack",
  "tacticattack",
  "tactic",
  "defensetactic",
  "defense",
  "utildefense",
  "util",
  "attackutil"
]
```

The recovered secondary position order is:

```js
[3, 1, 2, 12, 11, 10, 9, 7, 8, 6, 5, 4]
```

This ordering is important. Sorting by name or raw `nodeNumber` alone will not reproduce the circular arrangement.

## Node Rendering

### Normal Nodes

- Rendered as circles.
- Base radius is `20 + 2 × ringIndex`.
- Include a category background image.
- Include the Mastery icon over the background.
- Selected nodes use the category colour for their border.
- Unselected nodes use `#333333`.
- Selected nodes show a small level badge near the bottom.

### Hybrid Nodes

Hybrid nodes use one of these categories:

- `attackutil`
- `tacticattack`
- `defensetactic`
- `utildefense`

They are rendered as four-sided regular polygons, visually producing a diamond shape.

Their base radius is:

```text
30 + 2 × ringIndex
```

### Synergy Nodes

- Rendered as rounded squares.
- Positioned between the normal rarity rings.
- Use the Mastery skill image as their icon.
- A dark overlay is drawn over an unavailable Synergy node.

### Epic Nodes

- Use four outer-ring positions rather than twelve.
- Use the larger node size.
- Clip the node image into a circular boundary.

## Category Colours

Recovered colours include:

| Category or path | Colour |
|---|---|
| Attack | `#f56565` |
| Tactics / Defence + Tactics | `#f2dd92` |
| Defence / Utility + Defence | `#65b0fc` |
| Utility / Attack + Utility | `#A979CB` |
| Inactive | `#333333` |
| Node fill | `#181818` |

The selected paths in the screenshot are simply connectors whose endpoint nodes are both active. They are not separate image assets.

## Connector Rendering

Connectors are drawn before nodes so the nodes sit on top of them.

For each non-Epic normal node, Questlog determines which of the four Synergy directions it can feed:

- Attack
- Tactics
- Defence
- Utility

Single-category nodes connect to one direction. Some boundary nodes connect to two directions. Hybrid nodes use elbow-shaped polylines to reach both relevant directions.

Connector settings are approximately:

```js
{
  strokeWidth: 4,
  lineCap: "round",
  lineJoin: "round"
}
```

A connector is coloured only when both the normal node and its corresponding Synergy node are selected. Otherwise it remains `#333333`.

Implementation recommendation:

1. Compute all connector point arrays from node positions.
2. Render the inactive ring guides.
3. Render inactive connectors.
4. Render active connectors over them, or choose the connector colour from state.
5. Render nodes last.

## Interaction Model

### Selecting Nodes

- Clicking an available unselected node activates it.
- Clicking a selected node deactivates it.
- Questlog initially activates a node at its maximum available level, based on the length of its `stats` or `passives` array.
- Disabled nodes use a `not-allowed` cursor and reduced icon opacity.
- A selected node is automatically removed if a point change makes its requirement invalid.

### Changing Node Level

Questlog uses:

- `Shift + mouse wheel up` to increase a node level.
- `Shift + mouse wheel down` to decrease a node level.
- A minimum level of 1.
- A maximum derived from the node's stat or passive tiers.

The level is stored as part of the selection, not on the static node record:

```ts
type SelectedMasteryNode = {
  id: string;
  lvl: number;
};
```

For accessibility, the recreation should also provide keyboard or visible `+` and `-` controls. Canvas-only Shift-wheel editing is difficult to discover and inaccessible to many users.

### Hover Tooltips

Hovering a node opens a tooltip containing:

- Node name and image.
- Weapon and category.
- Current level.
- Effect or stats for that level.
- Activation conditions.
- Material cost.

The tooltip is an HTML overlay positioned using pointer coordinates. It is not drawn into the canvas.

### Zoom

Normal mouse-wheel movement zooms around the pointer position.

Recovered settings:

```text
zoom step: 0.1
minimum scale: 0.1
maximum scale: 5
initial scale: 0.675
```

When Shift is held, stage zoom is skipped so the wheel can change the hovered node's level.

### Pan

- Mouse drag pans the scene.
- Single-touch drag also pans.
- A movement threshold of approximately 10 pixels prevents a normal click from immediately becoming a pan.
- The initial stage position centres the scaled virtual scene inside the available viewport.

### Weapon Switching

Desktop uses large previous and next buttons on the left and right edges of the graph.

Mobile replaces these with two weapon buttons above the graph.

The graph uses a horizontal slide transition:

- Incoming weapon begins at `translateX(100%)` or `translateX(-100%)`.
- It animates to `translateX(0)`.
- The outgoing graph moves in the opposite direction.
- The recovered transition duration is approximately 300ms.

### Fullscreen

The upper-right button toggles graph fullscreen mode.

Normal mode uses `700px` height. Fullscreen mode uses `100dvh` and changes the expand icon to a close icon.

## Selection State and Rules

The graph should not decide unlocks from visual adjacency. It should call a rule layer using aggregate point totals.

The recovered progression rules are documented separately in:

`C:\_Projects\tl-character-extract\mastery-page-rules.md`

Key points:

- Common normal nodes are immediately available.
- Uncommon requires 30 Common points.
- Rare requires 30 Uncommon points.
- A Synergy node requires 20 matching category points at its rarity.
- No more than two Synergy nodes may be selected per rarity.
- The first Epic requires 80 total points and a matching Synergy.
- The second Epic requires 120 total points and a matching Synergy.
- No more than two Epic nodes may be selected.
- The current budget is 220 points per weapon.

`nodeNumber` is not a direct prerequisite link.

## Suggested State Model

```ts
type MasteryNode = {
  id: string;
  name: string;
  grade: 11 | 21 | 31 | 41;
  mainCategory: string;
  subCategory:
    | "attack"
    | "tactic"
    | "defense"
    | "util"
    | "attackutil"
    | "tacticattack"
    | "defensetactic"
    | "utildefense";
  specializationType: "normal" | "synergy" | "unified";
  nodeNumber: number;
  imageUrl?: string;
  stats?: Array<Record<string, number>>;
  passives?: string[];
};

type MasteryBuild = {
  id: string;
  name: string;
  mainHand: string;
  offHand: string;
  selectedNodes: Array<{ id: string; lvl: number }>;
};

type MasteryUiState = {
  modalOpen: boolean;
  activeBuildId: string | null;
  activeWeapon: string;
  fullscreen: boolean;
  scale: number;
  stagePosition: { x: number; y: number };
  hoveredNodeId: string | null;
};
```

Keep static node data separate from build selections. This allows the same node definitions to power different saved builds.

## Image Data

Mastery image storage and URL conversion are documented in:

`C:\_Projects\tl-character-extract\mastery-node-images.md`

The local node index is:

`C:\_Projects\tl-character-extract\out\tracker-weapon-masteries-index.json`

The repository currently stores image URLs, not downloaded image files.

## Konva Versus SVG Recommendation

Questlog uses Konva, but an exact technology match is not required.

### Use Konva if:

- Smooth pan and zoom are primary requirements.
- The graph may contain many dynamically redrawn objects.
- Canvas-style pointer handling is acceptable.
- Matching Questlog's interaction code closely is useful.

### Use SVG if:

- There are only a few dozen visible nodes.
- DOM inspection and accessibility are important.
- CSS hover and focus states are desirable.
- Tooltips and click targets should be simpler.

For this Mastery tree, SVG is likely the easier recreation. The graph contains a predictable number of rings, connectors, and nodes. Use a `viewBox="0 0 1000 1000"`, place the same geometry in `<circle>`, `<path>`, `<image>`, and `<g>` elements, and apply pan and zoom to one root `<g>` transform.

The modal shell remains normal HTML regardless of whether the graph uses Konva or SVG.

## Suggested Build Order

1. Load and normalise the mastery-node JSON.
2. Implement the requirement and point-counting functions.
3. Implement the 1000 × 1000 scene geometry.
4. Render rings and the central category markers.
5. Render normal, hybrid, Synergy, and Epic nodes.
6. Render inactive and active connectors.
7. Add selection and node-level state.
8. Add HTML tooltips.
9. Add pan and zoom.
10. Add weapon switching.
11. Mount the graph inside the three-column modal.
12. Add keyboard and mobile controls.

## Common Mistakes to Avoid

- Do not try to recreate the graph by copying the `<canvas>` tag.
- Do not treat each coloured connector as an image.
- Do not treat `nodeNumber` as a direct dependency.
- Do not sort nodes alphabetically.
- Do not store selection state inside the static node data.
- Do not make the modal responsible for graph geometry.
- Do not calculate node positions from screen pixels. Use the fixed 1000 × 1000 virtual coordinate system.
- Do not rely only on Shift-wheel for level changes.
- Do not forget to account for device-pixel ratio if using a raw canvas implementation.

## Relevant Recovered Source

The cached Questlog graph implementation is in:

`C:\_Projects\tl-character-extract\out\questlog-chunks\BjG9XNuZ.js`

It contains the compiled equivalents of these components:

- `KonvaNodeLine`
- `KonvaNode`
- `KonvaWrapper`
- `KonvaBase`
- `WeaponSpecializationBuildSelector`

The file is minified onto one line, but it contains the recovered geometry and interaction values documented above.

## Copy-Paste Instruction for Claude

```text
Recreate the Mastery selection interface described in mastery-selection-ui-recreation.md.

Read these files first:
1. mastery-selection-ui-recreation.md
2. mastery-page-rules.md
3. mastery-node-images.md
4. out/tracker-weapon-masteries-index.json

Important architecture constraints:
- Build the modal shell and the graph as separate components.
- The original uses Konva canvas, so the copied HTML does not contain individual graph nodes.
- Prefer an SVG graph with viewBox 0 0 1000 1000 unless this project already uses Konva.
- Preserve the recovered ring radii, node angles, Synergy positions, category positions, sorting rules, point requirements, and weapon-switch behaviour.
- Keep static node definitions separate from selected-node state.
- Add accessible visible controls for node levels in addition to any mouse-wheel shortcut.
- Do not treat nodeNumber or visual adjacency as a prerequisite chain.
```

