// Behavioral contract for the two hosted Questlog adapter variants:
// api/questlog/character.js (Vercel) and functions/api/questlog/character.js
// (Cloudflare Pages mirror). Both must gate cross-site browser abuse, keep
// clear 400s for input mistakes, and map upstream failures to 502/504 with
// fixed messages that never echo internal error text.
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import vercelHandler, { __resetRateLimitForTests as resetVercelLimit } from "../../api/questlog/character.js";
import { onRequestGet, __resetRateLimitForTests as resetCloudflareLimit } from "../../functions/api/questlog/character.js";
import marketHandler, { __resetRateLimitForTests as resetMarketLimit } from "../../api/questlog/market.js";

const GOOD_URL = (slug) => `https://questlog.gg/throne-and-liberty/en/character-builder/${slug}?buildId=7`;

// The rate-limit buckets are module state shared by every test in this file.
// Reset before each so one test's upstream traffic cannot starve the next and
// surface as a confusing 429 somewhere unrelated.
beforeEach(() => { resetVercelLimit(); resetCloudflareLimit(); });

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

test("Vercel adapter throttles sustained upstream traffic with a 429", async () => {
  let upstreamCalls = 0;
  await withFetch(async (url) => {
    upstreamCalls += 1;
    return upstreamJson(url.includes("getCharacter")
      ? { character: { user: { slug: "owner" } }, builds: [{ id: 7 }] }
      : { builds: [] });
  }, async () => {
    const statuses = [];
    // Distinct slugs so every call misses the response cache and reaches upstream.
    for (let i = 0; i < 14; i += 1) {
      const res = mockResponse();
      await vercelHandler(vercelRequest({ url: GOOD_URL(`Flood-${i}`) }), res);
      statuses.push(res.statusCode);
    }
    assert.equal(statuses.filter((code) => code === 200).length, 10, "the per-client bucket admits its capacity");
    assert.ok(statuses.slice(10).every((code) => code === 429), "and refuses the rest");
    assert.ok(upstreamCalls > 0 && upstreamCalls <= 30, "throttled requests never reach Questlog");
  });

  // A throttled answer must say so plainly and tell the caller when to retry.
  const throttled = mockResponse();
  await withFetch(() => { throw new Error("must not reach upstream"); }, () =>
    vercelHandler(vercelRequest({ url: GOOD_URL("Flood-after") }), throttled));
  assert.equal(throttled.statusCode, 429);
  assert.equal(throttled.headers["retry-after"], "60");
  assert.equal(throttled.headers["cache-control"], "no-store");
  assert.match(throttled.body.error, /Too many imports/);
});

test("a cached character costs no rate-limit budget", async () => {
  const slug = "Cached-Regular";
  await withFetch(healthyFetch(), async () => {
    const first = mockResponse();
    await vercelHandler(vercelRequest({ url: GOOD_URL(slug) }), first);
    assert.equal(first.statusCode, 200);
  });
  // Same slug 40 times with a fetch that would throw if reached: served from
  // the response cache, so a player re-opening a build is never throttled.
  await withFetch(() => { throw new Error("must not reach upstream"); }, async () => {
    for (let i = 0; i < 40; i += 1) {
      const res = mockResponse();
      await vercelHandler(vercelRequest({ url: GOOD_URL(slug) }), res);
      assert.equal(res.statusCode, 200, `repeat ${i} stays cached rather than throttled`);
    }
  });
});

test("one client's flood does not throttle a different client", async () => {
  const request = (slug, ip) => {
    const base = vercelRequest({ url: GOOD_URL(slug) });
    base.headers["x-real-ip"] = ip;
    return base;
  };
  await withFetch(healthyFetch(), async () => {
    for (let i = 0; i < 12; i += 1) {
      const res = mockResponse();
      await vercelHandler(request(`Noisy-${i}`, "203.0.113.9"), res);
    }
    const noisy = mockResponse();
    await vercelHandler(request("Noisy-last", "203.0.113.9"), noisy);
    assert.equal(noisy.statusCode, 429, "the flooding client is throttled");

    const quiet = mockResponse();
    await vercelHandler(request("Quiet-1", "198.51.100.4"), quiet);
    assert.equal(quiet.statusCode, 200, "a different client still gets served");
  });
});

// The market proxy carries the same limiter with a higher ceiling. Exercise it
// rather than trusting the shape: an unrun copy of the code is an untested one,
// and this is the endpoint a single page view fans out across.
test("Vercel market adapter throttles at its own higher ceiling", async () => {
  resetMarketLimit();
  const marketRequest = (item) => ({ method: "GET", headers: { "x-real-ip": "203.0.113.7" }, query: { item, region: "na-f" } });
  await withFetch(async () => upstreamJson({ json: { minPrice: 10, inStock: 2, grade: "epic" } }), async () => {
    const statuses = [];
    for (let i = 0; i < 64; i += 1) {
      const res = mockResponse();
      await marketHandler(marketRequest(`item-${i}`), res);
      statuses.push(res.statusCode);
    }
    assert.equal(statuses.filter((code) => code === 200).length, 60, "a whole loadout prices without throttling");
    assert.ok(statuses.slice(60).every((code) => code === 429), "sustained traffic past that is refused");
  });

  const throttled = mockResponse();
  await withFetch(() => { throw new Error("must not reach upstream"); }, () =>
    marketHandler(marketRequest("item-after"), throttled));
  assert.equal(throttled.statusCode, 429);
  assert.equal(throttled.headers["retry-after"], "60");
  assert.match(throttled.body.error, /Too many price lookups/);
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

test("Cloudflare adapter throttles sustained upstream traffic with a 429", async () => {
  await withCfCaches(async () => {
    await withFetch(healthyFetch(), async () => {
      const statuses = [];
      for (let i = 0; i < 14; i += 1) {
        // cf-connecting-ip is the client key; the mocked cache always misses,
        // so every one of these reaches upstream.
        const target = new URL("https://tlhelper.org/api/questlog/character");
        target.searchParams.set("url", GOOD_URL(`Flood-${i}`));
        const request = new Request(target, { headers: { "cf-connecting-ip": "203.0.113.9" } });
        statuses.push((await onRequestGet({ request, waitUntil() {} })).status);
      }
      assert.equal(statuses.filter((code) => code === 200).length, 10, "same per-client capacity as the Vercel twin");
      assert.ok(statuses.slice(10).every((code) => code === 429), "and refuses the rest");
    });

    const target = new URL("https://tlhelper.org/api/questlog/character");
    target.searchParams.set("url", GOOD_URL("Flood-after"));
    const throttled = await onRequestGet({
      request: new Request(target, { headers: { "cf-connecting-ip": "203.0.113.9" } }),
      waitUntil() {},
    });
    assert.equal(throttled.status, 429);
    assert.equal(throttled.headers.get("retry-after"), "60");
    assert.equal(throttled.headers.get("cache-control"), "no-store");
    assert.match((await throttled.json()).error, /Too many imports/);
  });
});
