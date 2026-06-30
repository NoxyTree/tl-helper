# TL Helper

A static React community guide for Throne and Liberty. Currently covers the
"Frozen Divide: Nix" expansion (the Nix Field Guide section); built to grow
into more sections over time. No backend, no database — just a fast page on
a global CDN.

## Editing content (the part you do often)

All content lives in the clearly-marked DATA blocks at the top of `src/App.jsx`:

- `HERO_BG`        — hero background image (URL or data URI; leave "" for the SVG look)
- `DEADLINES`      — the live countdown cards (Right Now tab)
- `PRIORITIES`     — "If You Only Do Four Things"
- `DAILY` / `WEEKLY` / `WEEKLY_TARGETS` — The Loop
- `SYS_WARN` / `SYS_CHANGES`           — Systems
- `SECRETS` / `BIS`                    — Farm & Secrets  (source: "official" | "community")
- `ROADMAP`        — What's Next timeline

To update the guide: edit those arrays, commit, done. New deadline? Add an entry to
`DEADLINES` with a `target` of `Date.UTC(year, monthIndex, day, hour, min, 0)`
(month is 0-indexed: January = 0, July = 6).

## Operate from anywhere

Three ways to edit, all of which trigger an automatic deploy:

1. **GitHub web editor** — open `src/App.jsx` on github.com, press `.` to launch the
   browser editor, change the data, commit. Works from any browser, including a phone.
2. **Any machine** — `git clone`, edit, `git push`.
3. **Claude Code** — point it at the repo from whichever machine you're on.

Every push to `main` rebuilds and redeploys in about a minute. Nothing needs to be
running on your end.

## Run locally

    npm install
    npm run dev        # http://localhost:5173
    npm run build      # outputs to dist/

## Deploy (one-time setup)

### Cloudflare Pages (recommended)
1. Push this folder to a GitHub repo.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
3. Pick the repo. Framework preset: **Vite**. Build command `npm run build`.
   Output directory `dist`. Save and Deploy.
4. You get a free `*.pages.dev` URL. Add a custom domain under the project's
   Custom Domains tab if you want one.

### Vercel (equivalent)
1. Push to GitHub.
2. vercel.com → New Project → import the repo. It auto-detects Vite. Deploy.

Either host auto-deploys on every push to `main`.

## Notes
- Game screenshots and art are NCSoft / Amazon Games IP. Prefer your own captures,
  official press/creator assets, or original AI-generated art, and consider a small
  "not affiliated with NCSoft / Amazon Games" footer for a public site.
