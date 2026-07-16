import test from "node:test";
import assert from "node:assert/strict";
import handler, { buildPublicConfig, isSupabaseUrl } from "../../api/config.js";

test("isSupabaseUrl accepts only https *.supabase.co", () => {
  assert.equal(isSupabaseUrl("https://abcdef.supabase.co"), true);
  assert.equal(isSupabaseUrl("https://abcdef.supabase.co/"), true);
  assert.equal(isSupabaseUrl("http://abcdef.supabase.co"), false, "http rejected");
  assert.equal(isSupabaseUrl("https://evil.example.com"), false, "foreign host rejected");
  assert.equal(isSupabaseUrl("not a url"), false);
  assert.equal(isSupabaseUrl(""), false);
  assert.equal(isSupabaseUrl(undefined), false);
});

test("buildPublicConfig reports configured with a valid URL + key", () => {
  const config = buildPublicConfig({ TL_SUPABASE_URL: "https://proj.supabase.co", TL_SUPABASE_ANON_KEY: "anon-key-123" });
  assert.equal(config.schema, "tl-helper.public-config");
  assert.equal(config.configured, true);
  assert.deepEqual(config.supabase, { url: "https://proj.supabase.co", anonKey: "anon-key-123" });
  assert.deepEqual(config.authProviders, ["discord", "google"]);
});

test("buildPublicConfig degrades to guest mode when unset or malformed", () => {
  for (const env of [{}, { TL_SUPABASE_URL: "https://proj.supabase.co" }, { TL_SUPABASE_ANON_KEY: "k" }, { TL_SUPABASE_URL: "http://proj.supabase.co", TL_SUPABASE_ANON_KEY: "k" }, { TL_SUPABASE_URL: "https://evil.example.com", TL_SUPABASE_ANON_KEY: "k" }]) {
    const config = buildPublicConfig(env);
    assert.equal(config.configured, false);
    assert.equal(config.supabase, null);
    assert.deepEqual(config.authProviders, []);
  }
});

test("buildPublicConfig never leaks a secret-looking service key", () => {
  // Only the two documented public vars are surfaced; nothing else from env.
  const config = buildPublicConfig({ TL_SUPABASE_URL: "https://proj.supabase.co", TL_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "super-secret", DATABASE_URL: "postgres://secret" });
  assert.deepEqual(Object.keys(config.supabase).sort(), ["anonKey", "url"]);
  assert.equal(JSON.stringify(config).includes("super-secret"), false);
  assert.equal(JSON.stringify(config).includes("postgres://"), false);
});

function mockResponse() {
  const res = { statusCode: 0, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; } };
  return res;
}

test("handler returns 200 + no-store for GET", async () => {
  const prev = { url: process.env.TL_SUPABASE_URL, key: process.env.TL_SUPABASE_ANON_KEY };
  process.env.TL_SUPABASE_URL = "https://proj.supabase.co";
  process.env.TL_SUPABASE_ANON_KEY = "anon";
  try {
    const res = mockResponse();
    await handler({ method: "GET" }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["cache-control"], "no-store");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.body.configured, true);
  } finally {
    process.env.TL_SUPABASE_URL = prev.url;
    process.env.TL_SUPABASE_ANON_KEY = prev.key;
  }
});

test("handler rejects non-GET methods", async () => {
  const res = mockResponse();
  await handler({ method: "POST" }, res);
  assert.equal(res.statusCode, 405);
});
