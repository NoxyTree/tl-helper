# TL Helper Redesign Notes

This build redesigns the Nix/TL Helper site into a full dark-fantasy community intelligence board.

## What changed

- Reworked the site from a simple Nix shell into a broader TL Helper landing page.
- Added a global glass navigation bar, search bar and source-trust language.
- Added local image assets based on the supplied Throne and Liberty/Nix references.
- Split content into `src/content.js` so future guide data is easier to maintain.
- Added a full CSS token system in `src/styles.css` using the design system colours.
- Added reusable React components for badges, source labels, deadlines, priority cards, loop items, warnings, systems, intel cards and roadmap items.
- Added responsive layouts for desktop, tablet and mobile.
- Added production `dist/` build.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Theme logic

- Frost blue = official/system information
- Relic gold = priority/action items
- Void violet = community/farming intel
- Red frost = warnings, risk and deadlines
- Aurora teal = verified/active state

## Important note

This is an unofficial community resource design. Any public community claims should be rechecked after patches and hotfixes.
