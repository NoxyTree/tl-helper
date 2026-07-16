// Behavioral contract for the two hosted Questlog adapter variants:
// api/questlog/character.js (Vercel) and functions/api/questlog/character.js
// (Cloudflare Pages mirror). Both must gate cross-site browser abuse, keep
// clear 400s for input mistakes, and map upstream failures to 502/504 with
// fixed messages that never echo internal error text.
import assert from "node:assert/strict";
import test from "node:test";
import vercelHandler from "../../api/questlog/character.js";
import { onRequestGet } from "../../functions/api/questlog/character.js";

const GOOD_URL = (slug) => `https://questlog.gg/throne-and-liberty/en/character-builder/${slug}?buildId=7`;

function upstreamJson(data) {
  const text = JSON.stringify({ result: { data } });
  return { ok: true, status: 200, headers: { get: () => null }, text: async () => text };
}

function healthyFetch() {
  return async (url) => upstreamJson(
    url.includes("getCharacter")
      ? { character: { user: { slug: "owner" } }, builds: [{ id: 7 }] }
      : { builds: [] },
  );
}

function withFetch(fetchImpl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  return Promise.resolve()
    .then(run)
    .finally(() => { globalThis.fetch = original; });
}

// ---------------------------------------------------------------- Vercel ----

function mockResponse() {
  return {
    statusCode: 0, headers: {}, body: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function vercelRequest({ url, secFetchSite } = {}) {
  const headers = {};
  if (secFetchSite) headers["sec-fetch-site"] = secFetchSite;
  return { method: "GET", headers, query: url === undefined ? {} : { url } };
}

test("Vercel adapter rejects cross-site browser requests with 403", async () => {
  const res = mockResponse();
  await withFetch(() => { throw new Error("must not reach upstream"); }, () =>
    vercelHandler(vercelRequest({ url: GOOD_URL("Blocked"), secFetchSite: "cross-site" }), res));
  assert.equal(res.statusCode, 403);
  assert.equal(res.headers["cache-control"], "no-store");
});

test("Vercel adapter admits same-origin and headerless clients", async () => {
  for (const secFetchSite of [undefined, "same-origin", "same-site", "none"]) {
    const res = mockResponse();
    await withFetch(healthyFetch(), () =>
      vercelHandler(vercelRequest({ url: GOOD_URL(`Pass-${secFetchSite}`), secFetchSite }), res));
    assert.equal(res.statusCode, 200, `sec-fetch-site=${secFetchSite} passes the gate`);
    assert.equal(res.body.schemaVersion, 1);
  }
});

test("Vercel adapter keeps clear 400s for input mistakes", async () => {
  const cases = [
    [vercelRequest({}), /complete Questlog/],
    [vercelRequest({ url: "https://example.com/character-builder/Test" }), /questlog\.gg/],
    [vercelRequest({ url: "https://questlog.gg/throne-and-liberty/en/character-builder/Test?buildId=nope" }), /numeric/],
  ];
  for (const [request, message] of cases) {
    const res = mockResponse();
    await withFetch(() => { throw new Error("must not reach upstream"); }, () => vercelHandler(request, res));
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, message);
  }
});

test("Vercel adapter maps upstream failure and bad JSON to a fixed 502", async () => {
  const failures = [
    async () => ({ ok: false, status: 500, headers: { get: () => null }, text: async () => "" }),
    async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => "<!doctype html>" }),
  ];
  for (const [index, fetchImpl] of failures.entries()) {
    const res = mockResponse();
    await withFetch(fetchImpl, () => vercelHandler(vercelRequest({ url: GOOD_URL(`Broken-${index}`) }), res));
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, "Questlog is unavailable right now. Try again in a minute.");
    assert.doesNotMatch(res.body.error, /Unexpected token|SyntaxError|failed \(500\)/);
  }
});

test("Vercel adapter maps timeouts to a fixed 504", async () => {
  const res = mockResponse();
  await withFetch(async () => {
    const error = new Error("The operation was aborted due to timeout");
    error.name = "TimeoutError";
    throw error;
  }, () => vercelHandler(vercelRequest({ url: GOOD_URL("Slow") }), res));
  assert.equal(res.statusCode, 504);
  assert.equal(res.body.error, "Questlog took too long to respond. Try again in a minute.");
});

// ------------------------------------------------------------ Cloudflare ----

function cfContext({ url, secFetchSite } = {}) {
  const target = new URL("https://tlhelper.org/api/questlog/character");
  if (url !== undefined) target.searchParams.set("url", url);
  const headers = secFetchSite ? { "sec-fetch-site": secFetchSite } : {};
  return { request: new Request(target, { headers }), waitUntil() {} };
}

function withCfCaches(run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: { default: { match: async () => undefined, put: async () => {} } },
  });
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (original) Object.defineProperty(globalThis, "caches", original);
      else delete globalThis.caches;
    });
}

test("Cloudflare adapter matches the Vercel abuse and failure contract", async () => {
  await withCfCaches(async () => {
    const blocked = await onRequestGet(cfContext({ url: GOOD_URL("Blocked"), secFetchSite: "cross-site" }));
    assert.equal(blocked.status, 403);

    await withFetch(healthyFetch(), async () => {
      for (const secFetchSite of [undefined, "same-origin", "same-site", "none"]) {
        const ok = await onRequestGet(cfContext({ url: GOOD_URL("Pass"), secFetchSite }));
        assert.equal(ok.status, 200, `sec-fetch-site=${secFetchSite} passes the gate`);
        assert.equal((await ok.json()).schemaVersion, 1);
      }
    });

    const invalid = await onRequestGet(cfContext({}));
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /complete Questlog/);

    await withFetch(async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => "<!doctype html>" }), async () => {
      const broken = await onRequestGet(cfContext({ url: GOOD_URL("Broken") }));
      assert.equal(broken.status, 502);
      const body = await broken.json();
      assert.equal(body.error, "Questlog is unavailable right now. Try again in a minute.");
    });

    await withFetch(async () => {
      const error = new Error("aborted");
      error.name = "TimeoutError";
      throw error;
    }, async () => {
      const slow = await onRequestGet(cfContext({ url: GOOD_URL("Slow") }));
      assert.equal(slow.status, 504);
      assert.equal((await slow.json()).error, "Questlog took too long to respond. Try again in a minute.");
    });
  });
});
