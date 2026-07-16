# HANDOFF — Provision Supabase so cloud sync goes live

You are an executing agent (e.g. Codex) working on the machine that owns this
repo. The client-side auth + sync code is **already built, committed, and tested
(760/760)**; it is inert until the Supabase project is provisioned and the two
public env vars are set. Your job: do the CLI-automatable steps below, and STOP
and tell the human for the console-only steps (you cannot create OAuth apps or
toggle dashboard settings).

## Environment / facts
- Repo root: `D:\TL_Helper-calculation-release`  (run all commands from here)
- OS: Windows. Shell examples use PowerShell; adjust as needed.
- Branch with the code: `perf/optimizer-set-route-and-preliminary-build`
- Supabase account owner: `thatsneakytree@gmail.com`
- Supabase project: `tl-helper`, **ref `xyqcrdnizqdrzwyajqfp`**, region eu-west-3
- Deploy targets: Vercel prod (`noxy-tree/tl-helper`) + Cloudflare Pages mirror (project `tl-helper`)
- Production origin: `https://tlhelper.org`

## Fixed values (use verbatim)
```
PROJECT_REF          = xyqcrdnizqdrzwyajqfp
TL_SUPABASE_URL      = https://xyqcrdnizqdrzwyajqfp.supabase.co
OAUTH_CALLBACK_URL   = https://xyqcrdnizqdrzwyajqfp.supabase.co/auth/v1/callback   (same for Discord + Google)
TL_SUPABASE_ANON_KEY = <human copies from Supabase dashboard -> API Keys -> "anon / public"; it is public, RLS is the boundary>
```

## Repo files this touches (all relative to repo root)
| File | Role |
|---|---|
| `supabase/migrations/20260712000000_initial_personal_hub.sql` | Schema to apply (tables + RLS + private `user-images` bucket) |
| `supabase/config.toml` | Local supabase config (site_url + redirect URLs already set) |
| `api/config.js` | Vercel runtime endpoint that reads `TL_SUPABASE_URL`/`TL_SUPABASE_ANON_KEY` from env and serves them to the browser at `/api/config` |
| `functions/api/config.js` | Cloudflare Pages mirror of the same endpoint (reads `context.env`) |
| `web/tl-supabase.js` | Browser client bootstrap (fetches `/api/config`, lazy-loads vendored supabase-js) |
| `web/vendor/supabase/supabase.esm.js` | Vendored `@supabase/supabase-js@2.110.6` |
| `web/tl-account-menu.js` | Guest-first sign-in UI (Discord/Google) |
| `web/tl-sync.js`, `web/tl-sync-encode.js` | Local-first sync (builds + achievements) |
| `.env.example` | Documents the two vars |
| `package.json` | `deploy:production` (Vercel), `deploy:production:cloudflare` (Wrangler) |

## GUARDRAILS
- The **anon key is public** and belongs only in env vars — do **NOT** commit it, and **NEVER** commit or use the `service_role` key or DB password anywhere.
- Do not hardcode keys into `web/`. They flow at runtime through `/api/config`.
- Do the console-only steps as the human; do not attempt to automate OAuth-app creation or provider toggling.

---

## STEP A — Apply the database migration  [AUTOMATABLE, or console]
CLI (from repo root):
```
npx supabase login          # one-time, opens a browser
npx supabase link --project-ref xyqcrdnizqdrzwyajqfp    # prompts for DB password (Dashboard -> Project Settings -> Database)
npx supabase db push        # applies supabase/migrations/*.sql
```
Fallback if no CLI/DB password: open Supabase **SQL Editor**, paste the entire
contents of `supabase/migrations/20260712000000_initial_personal_hub.sql`, Run.

**Verify:** Supabase → Table Editor shows tables `profiles`, `builds`,
`tracker_states`, `achievement_progress`, `wishlists`, `wishlist_items`,
`user_media`; Storage shows a **private** bucket `user-images`. RLS enabled on all.

## STEP B — Create the Discord OAuth app  [CONSOLE — human only, then continue]
1. https://discord.com/developers/applications → **New Application**.
2. **OAuth2** tab → **Redirects** → add exactly: `https://xyqcrdnizqdrzwyajqfp.supabase.co/auth/v1/callback`
3. Copy the **Client ID** and **Client Secret** (keep the secret out of chat/git).

## STEP C — Create the Google OAuth app  [CONSOLE — human only]
1. https://console.cloud.google.com → APIs & Services → **Credentials**.
2. **Create Credentials → OAuth client ID → Web application**.
3. **Authorized redirect URIs** → add: `https://xyqcrdnizqdrzwyajqfp.supabase.co/auth/v1/callback`
4. (If prompted, configure the OAuth consent screen — External, add your email as a test user.)
5. Copy the **Client ID** and **Client Secret**.

## STEP D — Enable providers + set URLs in Supabase  [CONSOLE — human only]
1. Authentication → **Providers** → enable **Discord**, paste its Client ID/Secret. Enable **Google**, paste its Client ID/Secret.
2. Authentication → **URL Configuration**:
   - **Site URL**: `https://tlhelper.org`
   - **Redirect URLs**: add `https://tlhelper.org/**` and `http://localhost:8791/**`

## STEP E — Set the two env vars on both hosts  [AUTOMATABLE, or console]
Values: `TL_SUPABASE_URL=https://xyqcrdnizqdrzwyajqfp.supabase.co` and `TL_SUPABASE_ANON_KEY=<anon key>`.

**Vercel** (from repo root; needs `npx vercel login`):
```
npx vercel env add TL_SUPABASE_URL production --scope noxy-tree        # paste the URL when prompted
npx vercel env add TL_SUPABASE_ANON_KEY production --scope noxy-tree   # paste the anon key when prompted
```
**Cloudflare Pages** — simplest via dashboard: Workers & Pages → `tl-helper` →
Settings → **Environment variables** (Production) → add both. (CLI alt:
`npx wrangler pages secret put TL_SUPABASE_URL --project-name tl-helper`, same for the key.)

## STEP F — Deploy  [AUTOMATABLE]
```
npm run deploy:production               # Vercel prod
npm run deploy:production:cloudflare    # Cloudflare Pages mirror
```

## STEP G — Verify end-to-end  [AUTOMATABLE + human]
1. `curl https://tlhelper.org/api/config` → must return `"configured": true` with
   `supabase.url`/`anonKey` and `"authProviders":["discord","google"]`.
   If `configured:false`, the env vars aren't set for the deployed function — recheck STEP E.
2. Open `https://tlhelper.org` → the header shows **Sign in** → test **Discord** and **Google**; each should redirect, return, and show your avatar chip.
3. Save a build as a preset and toggle an achievement; sign out; sign in in a
   different browser/device → both should appear (union merge; never overwrites local).
4. `npm test` still green (760 tests).

## STEP H — After it works
- In `web/privacy.html` the sync copy is already updated; nothing to do there.
- Report back which steps succeeded and paste any error text (never paste secrets).

## Recommended order
A → B → C → D → E → F → G. (A can run anytime; E/F must come after the anon key
exists — it always does — and sign-in only works once D is done.)
