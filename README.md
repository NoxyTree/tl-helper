# TL Helper

A static React community guide for Throne and Liberty, covering the
**Frozen Divide: Nix** expansion. It's a single-scroll "intelligence board" —
briefing, daily/weekly loop, systems, community farming intel and roadmap —
with official vs. community sourcing labelled throughout. No backend, no
database; just a fast page on a CDN.

**Live:** https://tlhelper.org

## Project structure

| Path | What it is |
|------|-----------|
| `src/content.js` | **All the guide content** — plain data arrays. This is what you edit. |
| `src/App.jsx`    | The React components that render the content. |
| `src/styles.css` | The dark-fantasy design system (CSS custom-property tokens). |
| `achievements/` | Vite entry page for the achievement tracker at `/achievements/`. |
| `src/achievements/` | Achievement tracker logic, styles, and static seed data. |
| `supabase/schema.sql` | Profiles/progress tables, RLS policies, and profile trigger. |
| `public/img/nix/`| Community screenshots (farm-spot maps, UI shots), each credited by handle. |
| `public/assets/` | Hero / key art. |

## Editing content (the part you do often)

Open `src/content.js` and edit the exported arrays — no component code required:

- `deadlines` — live countdown cards. `target: Date.UTC(year, monthIndex, day, hour, min, 0)` (month is 0-indexed: January = 0, July = 6).
- `priorities` — "What matters right now".
- `dailyLoop` / `weeklyLoop` / `targets` — the loop planner.
- `warnings` / `systems` — system changes and risk notes.
- `intel` / `builds` / `farmSpots` — community findings, BiS notes, and the farm-spot gallery.
- `roadmap` — the timeline.

Most entries take a `source` (`"official"` | `"community"`) and a `confidence`
label. Any entry can carry an `image: { src, credit, caption, fit }` to show a
screenshot (use `fit: "contain"` to display the whole image instead of a crop).
Screenshots live in `public/img/nix/`; reference them via the `NIX` prefix.

**Theme colours** (set in `styles.css`): frost blue = official/system · relic
gold = priority/action · void violet = community intel · red frost = warnings ·
aurora teal = verified/active.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs static site to dist/
```

## Deploy

Hosted on **Cloudflare Pages**, connected to this GitHub repo. Every push to
`master` triggers a build and publishes to `tlhelper.org` in about a minute —
no manual step. Pull requests automatically get their own preview URL.

Cloudflare build settings: build command `npm run build`, output directory
`dist` (framework preset "None").

The achievement tracker is published at `/achievements/`. Anonymous progress is
stored in browser localStorage. When Supabase is configured, signed-in users can
sync progress into profile rows protected by row-level security.

## Supabase profiles

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Enable the Auth providers you want. Google, Discord, and email magic links are wired in the UI.
4. Add `https://tlhelper.org/achievements/` as an allowed redirect URL in Supabase Auth settings.
5. Set these environment variables in Vercel:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
```

Without those env vars, the tracker stays fully local and hides the login controls.

Ways to edit, all of which trigger a deploy:

1. **GitHub web editor** — open a file on github.com, press `.` for the browser editor, commit. Works from a phone.
2. **Any machine** — `git clone`, edit, `git push`.
3. **Claude Code** — point it at the repo.

## Disclaimer

Unofficial community resource. Not affiliated with NCSoft, Amazon Games, or
Throne and Liberty. Game screenshots and art are the property of their owners;
community-contributed screenshots are credited to the member who shared them.
Public claims should be rechecked after patches and hotfixes.
