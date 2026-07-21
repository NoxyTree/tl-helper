// Vercel serverless version of the live auction-house price proxy (Node runtime:
// export default handler(req, res), Map cache). The Cloudflare Pages Functions
// twin lives at functions/api/questlog/market.js (onRequestGet / caches.default).
// Market prices change hourly, so the gearing guide fetches this at view time.
const REGIONS = new Set(["na-f", "eu-f", "as-f"]);
const PROCEDURE = "auctionHouse.getAuctionItem";
const MAX_RESPONSE_BYTES = 8_000_000;
const CACHE_TTL_MS = 300_000;
const UPSTREAM_ERROR = "Questlog is unavailable right now. Try again in a minute.";
const TIMEOUT_ERROR = "Questlog took too long to respond. Try again in a minute.";
const cache = new Map();

export default async function handler(request, response) {
  if (request.method !== "GET") return send(response, 405, { error: "Method not allowed." }, "no-store");
  const secFetchSite = String(request.headers?.["sec-fetch-site"] ?? "").toLowerCase();
  if (secFetchSite === "cross-site") return send(response, 403, { error: "Cross-site requests are not allowed." }, "no-store");
  try {
    const pick = (v) => (Array.isArray(v) ? v[0] : v);
    const itemId = String(pick(request.query?.item) ?? "").trim();
    const region = String(pick(request.query?.region) ?? "na-f").trim();
    const withHistory = pick(request.query?.history) === "1";
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(itemId)) throw inputError("A valid item id is required.");
    if (!REGIONS.has(region)) throw inputError("region must be one of na-f, eu-f, as-f.");

    const cacheKey = `${itemId}:${region}:${withHistory ? 1 : 0}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      if (cached.expiresAt > Date.now()) return send(response, 200, cached.value, "public, max-age=300");
      cache.delete(cacheKey);
    }

    const data = await trpc(PROCEDURE, { language: "en", regionId: region, itemId, timespan: withHistory ? 360 : 1 });
    const value = {
      schema: "tl-helper.questlog-market",
      schemaVersion: 1,
      fetchedAtUtc: new Date().toISOString(),
      itemId,
      region,
      // Bind-on-pickup gear is not tradeable → minPrice/history absent; a valid
      // answer the guide renders as "not tradeable", not an error.
      minPrice: data?.minPrice ?? null,
      inStock: data?.inStock ?? null,
      grade: data?.grade ?? null,
      history: withHistory ? (data?.history ?? []) : undefined,
    };
    if (cache.size >= 500) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return send(response, 200, value, "public, max-age=300");
  } catch (error) {
    const { status, message } = classifyError(error);
    if (status !== 400) console.error("questlog market lookup failed:", error);
    return send(response, status, { error: message }, "no-store");
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
  const upstream = await fetch(`https://questlog.gg/throne-and-liberty/api/trpc/${procedure}?input=${query}`, {
    headers: { accept: "application/json", "user-agent": "TL Helper hosted importer" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!upstream.ok) throw new Error(`Questlog ${procedure} failed (${upstream.status}).`);
  const length = Number(upstream.headers.get("content-length") ?? 0);
  if (length > MAX_RESPONSE_BYTES) throw new Error("Questlog response exceeded the 8 MB safety limit.");
  const text = await upstream.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error(`Questlog ${procedure} returned oversized data.`);
  // database/auctionHouse procedures wrap payloads in superjson (result.data.json).
  const wrapper = JSON.parse(text)?.result?.data;
  return wrapper?.json ?? wrapper ?? null;
}

function send(response, status, body, cacheControl) {
  response.setHeader("Cache-Control", cacheControl);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  return response.status(status).json(body);
}
