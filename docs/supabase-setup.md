# TL-Helper Supabase setup

This directory defines an isolated Supabase backend for optional account sync.
Anonymous/local-first use remains the default and must continue working when
Supabase is unavailable.

## Hosted project

1. Create a new Supabase project named `tl-helper`. Do not reuse an unrelated
   project's database or service-role key.
2. Install or run the CLI and authenticate:

   ```powershell
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

3. In Authentication URL Configuration, set:

   - Site URL: `https://tlhelper.org`
   - Redirect URL: `https://tlhelper.org/**`
   - Local redirect: `http://127.0.0.1:8791/**`

4. Copy `.env.example` to `.env.local` and set the project URL and anon key.
   The anon key is a browser credential; Row Level Security is the security
   boundary. Never expose or commit the service-role key.

## Schema

Migration `20260712000000_initial_personal_hub.sql` creates:

- private profiles
- one versioned row per current, preset, or Questlog-imported build
- tracker state
- per-achievement progress
- wishlists and wishlist items
- private user-media metadata
- the private `user-images` Storage bucket with a 2 MiB image limit

Every user-owned table has Row Level Security. Storage objects must live below
`<auth-user-id>/...`; bucket policies reject cross-user access.

## Sync boundary

Local persistence stays authoritative for immediate/offline saves. Cloud sync
must use the existing versioned Armory documents and optimistic revision checks.
A zero-row revision update is a conflict, not permission to overwrite.

BuildSnapshot JSON is a derived cache. The source build document remains
authoritative and snapshots must be regenerated when game build, ruleset, or
snapshot schema changes.

Character images are private objects, not JSON data URLs. Resize and convert
them client-side before upload, store crop metadata in `user_media`, and use
signed URLs for display.
