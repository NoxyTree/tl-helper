// Public runtime configuration for the browser client.
//
// The static `web/` bundle ships with no build step, so it cannot embed the
// Supabase project URL / anon key at deploy time. This endpoint exposes them at
// runtime from environment variables. The anon key is intentionally public —
// row-level security is the security boundary (see docs/supabase-setup.md).
//
// A missing or malformed configuration degrades to guest-only mode (configured:
// false) rather than erroring, so the app always works without an account.
const SCHEMA = "tl-helper.public-config";
const SCHEMA_VERSION = 1;
const AUTH_PROVIDERS = Object.freeze(["discord", "google"]);

export function buildPublicConfig(env = {}) {
  const url = String(env.TL_SUPABASE_URL ?? "").trim();
  const anonKey = String(env.TL_SUPABASE_ANON_KEY ?? "").trim();
  const configured = isSupabaseUrl(url) && anonKey.length > 0;
  return {
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    configured,
    supabase: configured ? { url, anonKey } : null,
    authProviders: configured ? [...AUTH_PROVIDERS] : [],
  };
}

export function isSupabaseUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

export default async function handler(request, response) {
  if (request.method !== "GET") return send(response, 405, { error: "Method not allowed." });
  return send(response, 200, buildPublicConfig(process.env));
}

function send(response, status, body) {
  // No CDN caching: a rotated key or a newly enabled provider must take effect
  // immediately, and the client only fetches this once per session anyway.
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  return response.status(status).json(body);
}
