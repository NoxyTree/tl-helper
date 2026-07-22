import { createTldbMarketService, parseMarketQuery } from "../../packages/market-data/tldb-market.mjs";

const market = createTldbMarketService();

export default async function handler(request, response) {
  if (request.method !== "GET") return send(response, 405, { error: "Method not allowed." }, "no-store");
  try {
    const origin = `https://${request.headers.host ?? "tlhelper.org"}`;
    const url = new URL(request.url, origin);
    const value = await market.get(parseMarketQuery(url));
    return send(response, 200, value, value.stale ? "public, max-age=10" : "public, max-age=30, stale-if-error=300");
  } catch (error) {
    return send(response, Number(error?.status ?? 500), { error: String(error?.message ?? error) }, "no-store");
  }
}

function send(response, status, body, cacheControl) {
  response.setHeader("Cache-Control", cacheControl);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  return response.status(status).json(body);
}
