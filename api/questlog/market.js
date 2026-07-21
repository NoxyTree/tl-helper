// Live auction-house price proxy for the gearing guide. Market prices change
// hourly, so unlike drop sources they are fetched at view time (not baked into a
// projection). Same cross-site gate, timeout, size cap, and 5-min edge cache as
// the character-import proxy. Region is required (prices are region-specific).
const REGIONS = new Set(["na-f", "eu-f", "as-f"]);
const PROCEDURE = "auctionHouse.getAuctionItem";
const MAX_RESPONSE_BYTES = 8_000_000;
const UPSTREAM_ERROR = "Questlog is unavailable right now. Try again in a minute.";
const TIMEOUT_ERROR = "Questlog took too long to respond. Try again in a minute.";

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

function json(body, status, cacheControl = "no-store") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": cacheControl,
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
