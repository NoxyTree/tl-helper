// Live auction-house price proxy for the gearing guide. Market prices change
// hourly, so unlike drop sources they are fetched at view time (not baked into a
// projection). Same cross-site gate, timeout, size cap, and 5-min edge cache as
// the character-import proxy. Region is required (prices are region-specific).
const REGIONS = new Set(["na-f", "eu-f", "as-f"]);
const PROCEDURE = "auctionHouse.getAuctionItem";
const MAX_RESPONSE_BYTES = 8_000_000;
const UPSTREAM_ERROR = "Questlog is unavailable right now. Try again in a minute.";
const TIMEOUT_ERROR = "Questlog took too long to respond. Try again in a minute.";
const BUSY_ERROR = "Too many price lookups right now. Wait a minute and try again.";

// Upstream rate limit -- same contract as the character adapter; see the long
// note there for why two buckets and why this is per-isolate best-effort.
//
// The ceilings are higher here because one gearing view legitimately prices a
// whole loadout in a burst, and tokens are only spent on a cache MISS, so a
// second look at the same items costs nothing.
const PER_CLIENT = { capacity: 60, perMs: 60 / 60_000 };
const PER_INSTANCE = { capacity: 300, perMs: 300 / 60_000 };
const MAX_TRACKED_CLIENTS = 5_000;
const clientBuckets = new Map();
const instanceBucket = { tokens: PER_INSTANCE.capacity, updatedAt: Date.now() };

function spend(bucket, limit, now) {
  bucket.tokens = Math.min(limit.capacity, bucket.tokens + (now - bucket.updatedAt) * limit.perMs);
  bucket.updatedAt = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

function clientKey(request) {
  return String(request.headers.get("cf-connecting-ip") ?? "").trim() || "unknown";
}

// Test hook. The buckets are module state that outlives a single request, so a
// suite exercising this endpoint repeatedly would otherwise trip its own limit
// and turn an unrelated assertion into a confusing 429. Unused at runtime.
export function __resetRateLimitForTests() {
  clientBuckets.clear();
  instanceBucket.tokens = PER_INSTANCE.capacity;
  instanceBucket.updatedAt = Date.now();
}

function withinRateLimit(request) {
  const now = Date.now();
  if (!spend(instanceBucket, PER_INSTANCE, now)) return false;
  const key = clientKey(request);
  if (!clientBuckets.has(key) && clientBuckets.size >= MAX_TRACKED_CLIENTS) {
    clientBuckets.delete(clientBuckets.keys().next().value);
  }
  const bucket = clientBuckets.get(key) ?? { tokens: PER_CLIENT.capacity, updatedAt: now };
  clientBuckets.set(key, bucket);
  return spend(bucket, PER_CLIENT, now);
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const secFetchSite = String(context.request.headers.get("sec-fetch-site") ?? "").toLowerCase();
  if (secFetchSite === "cross-site") return json({ error: "Cross-site requests are not allowed." }, 403);
  try {
    const itemId = String(requestUrl.searchParams.get("item") ?? "").trim();
    const region = String(requestUrl.searchParams.get("region") ?? "na-f").trim();
    const withHistory = requestUrl.searchParams.get("history") === "1";
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(itemId)) throw inputError("A valid item id is required.");
    if (!REGIONS.has(region)) throw inputError("region must be one of na-f, eu-f, as-f.");

    const cacheKey = new Request(`${requestUrl.origin}${requestUrl.pathname}?item=${encodeURIComponent(itemId)}&region=${region}&h=${withHistory ? 1 : 0}`);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    if (!withinRateLimit(context.request)) return json({ error: BUSY_ERROR }, 429, "no-store", { "retry-after": "60" });

    const data = await trpc(PROCEDURE, { language: "en", regionId: region, itemId, timespan: withHistory ? 360 : 1 });
    const response = json({
      schema: "tl-helper.questlog-market",
      schemaVersion: 1,
      fetchedAtUtc: new Date().toISOString(),
      itemId,
      region,
      // Bind-on-pickup gear is not tradeable → minPrice/history absent; that is a
      // valid answer the guide renders as "not on market", not an error.
      minPrice: data?.minPrice ?? null,
      inStock: data?.inStock ?? null,
      grade: data?.grade ?? null,
      history: withHistory ? (data?.history ?? []) : undefined,
    }, 200, "public, max-age=300");
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    const { status, message } = classifyError(error);
    if (status !== 400) console.error("questlog market lookup failed:", error);
    return json({ error: message }, status);
  }
}

function classifyError(error) {
  if (error?.status === 400) return { status: 400, message: error.message };
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return { status: 504, message: TIMEOUT_ERROR };
  return { status: 502, message: UPSTREAM_ERROR };
}

function inputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

async function trpc(procedure, input) {
  const query = encodeURIComponent(JSON.stringify(input));
  const response = await fetch(`https://questlog.gg/throne-and-liberty/api/trpc/${procedure}?input=${query}`, {
    headers: { accept: "application/json", "user-agent": "TL Helper hosted importer" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Questlog ${procedure} failed (${response.status}).`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_RESPONSE_BYTES) throw new Error("Questlog response exceeded the 8 MB safety limit.");
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error(`Questlog ${procedure} returned oversized data.`);
  // database/auctionHouse procedures wrap payloads in superjson (result.data.json).
  const wrapper = JSON.parse(text)?.result?.data;
  return wrapper?.json ?? wrapper ?? null;
}

function json(body, status, cacheControl = "no-store", extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": cacheControl,
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}
