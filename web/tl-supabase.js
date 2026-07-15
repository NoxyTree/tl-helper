// Browser Supabase bootstrap — the single place the client is created.
//
// Design goals (see docs/supabase-setup.md):
//  - Guest-first. If Supabase is not configured, or the library cannot load, or
//    the network is offline, every function here degrades to "no client" and the
//    app keeps working from localStorage. Nothing in here ever throws to callers.
//  - One client per page. The config fetch and client creation are memoised.
//
// The Supabase JS library is loaded from a vendored ES module so the static
// bundle stays self-contained (matching web/vendor/combat-engine). Until it is
// vendored at the path below, `isAvailable()` resolves false and the app runs in
// pure guest mode — no errors.
const SUPABASE_LIB_URL = "./vendor/supabase/supabase.esm.js";
const CONFIG_URL = "./api/config";
const AUTH_STORAGE_KEY = "tlhelper-auth";

let configPromise = null;
let clientPromise = null;

/** Fetches and memoises the public runtime config. Never rejects. */
export function getPublicConfig() {
  if (!configPromise) {
    configPromise = fetch(CONFIG_URL, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((config) => (config && config.schema === "tl-helper.public-config" ? config : notConfigured()))
      .catch(() => notConfigured());
  }
  return configPromise;
}

function notConfigured() {
  return { schema: "tl-helper.public-config", schemaVersion: 1, configured: false, supabase: null, authProviders: [] };
}

/**
 * Returns a ready Supabase client, or null in guest mode (unconfigured, library
 * unavailable, or offline). Memoised; safe to call on every page and repeatedly.
 */
export function getSupabaseClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const config = await getPublicConfig();
      if (!config?.configured || !config.supabase?.url || !config.supabase?.anonKey) return null;
      let createClient;
      try {
        ({ createClient } = await import(SUPABASE_LIB_URL));
      } catch (error) {
        console.warn("Supabase library unavailable; running in guest mode.", error);
        return null;
      }
      if (typeof createClient !== "function") return null;
      try {
        return createClient(config.supabase.url, config.supabase.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            // Completes the OAuth redirect (Discord/Google) when the provider
            // sends the user back to the app with a token in the URL.
            detectSessionInUrl: true,
            storage: globalThis.localStorage,
            storageKey: AUTH_STORAGE_KEY,
          },
        });
      } catch (error) {
        console.warn("Supabase client could not be created; running in guest mode.", error);
        return null;
      }
    })();
  }
  return clientPromise;
}

/** True when a usable client exists (Supabase configured and library loaded). */
export async function isAvailable() {
  return (await getSupabaseClient()) != null;
}

/** Current session, or null when signed out / in guest mode. Never rejects. */
export async function getSession() {
  const client = await getSupabaseClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data?.session ?? null;
  } catch {
    return null;
  }
}

/** Current user, or null. Convenience over getSession(). */
export async function getUser() {
  return (await getSession())?.user ?? null;
}

/**
 * Subscribes to auth changes. Fires immediately with the current session, then
 * on every sign-in/out/refresh. Returns an unsubscribe function (a no-op in
 * guest mode).
 */
export async function onAuthChange(callback) {
  const client = await getSupabaseClient();
  if (!client) {
    callback(null, "GUEST");
    return () => {};
  }
  try {
    callback((await getSession()), "INITIAL");
    const { data } = client.auth.onAuthStateChange((event, session) => callback(session ?? null, event));
    return () => data?.subscription?.unsubscribe?.();
  } catch {
    callback(null, "GUEST");
    return () => {};
  }
}

export const AUTH_PROVIDERS_SUPPORTED = Object.freeze(["discord", "google"]);
