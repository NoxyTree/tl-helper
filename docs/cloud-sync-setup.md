# Cloud sync setup (Supabase + Discord/Google)

Everything on the app side is built and tested. The steps below are the ones
that need your accounts/credentials — they can't be automated for you. Once done,
the "Sign in" menu goes live and builds + achievements sync per account.

The app is **fully usable in guest mode until this is configured** — it degrades
silently, so there's no rush and no half-broken state.

## 1. Supabase project

1. Create (or reuse) a Supabase project. Note its **Project URL**
   (`https://<ref>.supabase.co`) and **anon public key** (Project Settings → API).
   The anon key is *meant* to be public — row-level security is the boundary.
2. Apply the schema. From the repo root, with the Supabase CLI logged in:
   ```
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   This runs `supabase/migrations/20260712000000_initial_personal_hub.sql`
   (tables + RLS + the private `user-images` bucket).

## 2. OAuth apps (Discord + Google)

For both, the **redirect/callback URL is the same**:
```
https://<ref>.supabase.co/auth/v1/callback
```

**Discord** — https://discord.com/developers/applications → New Application →
OAuth2 → add the redirect URL above → copy **Client ID** + **Client Secret**.

**Google** — https://console.cloud.google.com → APIs & Services → Credentials →
Create OAuth client ID (Web application) → add the redirect URL above → copy
**Client ID** + **Client Secret**. (Configure the OAuth consent screen if prompted.)

## 3. Enable the providers in Supabase

Dashboard → Authentication → Providers → enable **Discord** and **Google**,
pasting each Client ID/Secret. Then Authentication → URL Configuration:
- **Site URL**: `https://tlhelper.org`
- **Redirect URLs**: add `https://tlhelper.org/**` and, for local testing,
  `http://localhost:8791/**`.

(These already match `supabase/config.toml`.)

## 4. Environment variables

Set these on **both** hosts (the app reads them at runtime via `/api/config`;
they are not embedded at build time):

| Variable | Value |
|---|---|
| `TL_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `TL_SUPABASE_ANON_KEY` | the anon public key |

- **Vercel** (production): Project → Settings → Environment Variables.
- **Cloudflare Pages** (mirror): Project → Settings → Environment variables.

## 5. Deploy & verify

Deploy as usual (`npm run deploy:production` / `deploy:production:cloudflare`).
Then:
1. Open the site → the header shows **Sign in** (if it still shows nothing,
   `/api/config` is returning `configured:false` — recheck the env vars).
2. Sign in with Discord and with Google — each should round-trip and show your
   avatar chip.
3. Save a build as a preset and toggle an achievement, sign out, sign in on
   another browser/device → they should appear (union merge, never overwrites).
4. Update `web/privacy.html`'s "account sync is not active" line, since it now is.

## Notes / current scope

- **v1 sync = saved builds (Armory presets) + achievements**, union-merged and
  idempotent (keyed by preset id / achievement id). Delete-propagation and live
  cross-device push are deferred to v2; additions never lose data.
- To rotate the anon key or change providers later, just update the env vars —
  `/api/config` is `no-store`, so changes take effect immediately.
