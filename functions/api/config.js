// Cloudflare Pages mirror of /api/config (Vercel: api/config.js).
//
// Exposes the public Supabase URL / anon key at runtime so the build-step-free
// static bundle can reach them. The anon key is intentionally public — row-level
// security is the security boundary. A missing config degrades to guest-only
// mode (configured: false) rather than erroring.
const SCHEMA = "tl-helper.public-config";
const SCHEMA_VERSION = 1;
const AUTH_PROVIDERS = ["discord", "google"];

export async function onRequestGet(context) {
  const env = context?.env ?? {};
  const url = String(env.TL_SUPABASE_URL ?? "").trim();
  const anonKey = String(env.TL_SUPABASE_ANON_KEY ?? "").trim();
  const configured = isSupabaseUrl(url) && anonKey.length > 0;
  return json({
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    configured,
    supabase: configured ? { url, anonKey } : null,
    authProviders: configured ? [...AUTH_PROVIDERS] : [],
  });
}

function isSupabaseUrl(value) {
  try {
    const parsed = new URL(String(value ?? ""));
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function json(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
