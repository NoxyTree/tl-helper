import { createTldbMarketService, parseMarketQuery } from "../../../packages/market-data/tldb-market.mjs";

const market = createTldbMarketService();

export async function onRequestGet(context) {
  try {
    const value = await market.get(parseMarketQuery(new URL(context.request.url)));
    return json(value, 200, value.stale ? "public, max-age=10" : "public, max-age=30, stale-if-error=300");
  } catch (error) { return json({ error: String(error?.message ?? error) }, Number(error?.status ?? 500)); }
}

function json(body, status, cacheControl = "no-store") {
  return new Response(JSON.stringify(body), { status, headers: { "cache-control": cacheControl, "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" } });
}
