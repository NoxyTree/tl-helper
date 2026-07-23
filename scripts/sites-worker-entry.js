import { onRequestGet as getPublicConfig } from "../functions/api/config.js";
import { onRequestGet as getQuestlogCharacter } from "../functions/api/questlog/character.js";
import { onRequestGet as getQuestlogMarket } from "../functions/api/questlog/market.js";

const API_ROUTES = new Map([
  ["/api/config", getPublicConfig],
  ["/api/questlog/character", getQuestlogCharacter],
  ["/api/questlog/market", getQuestlogMarket],
]);

function withHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("content-security-policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  headers.set("x-frame-options", "DENY");
  if (pathname.startsWith("/assets/")) headers.set("cache-control", "public, max-age=31536000, immutable");
  else if (pathname.startsWith("/data/")) headers.set("cache-control", "public, max-age=300, must-revalidate");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function staticResponse(request, env) {
  const originalUrl = new URL(request.url);
  const candidates = [];
  if (originalUrl.pathname === "/") candidates.push("/index.html");
  else {
    candidates.push(originalUrl.pathname);
    if (!originalUrl.pathname.split("/").at(-1).includes(".")) candidates.push(`${originalUrl.pathname}.html`);
  }

  for (const pathname of candidates) {
    const url = new URL(request.url);
    url.pathname = pathname;
    const response = await env.ASSETS.fetch(new Request(url, request));
    if (response.status !== 404) return withHeaders(response, pathname);
  }
  return withHeaders(await env.ASSETS.fetch(request), originalUrl.pathname);
}

export default {
  async fetch(request, env, executionContext) {
    const url = new URL(request.url);
    const apiHandler = API_ROUTES.get(url.pathname.replace(/\/+$/, ""));
    if (apiHandler) {
      if (request.method !== "GET") {
        return new Response(JSON.stringify({ error: "Method not allowed." }), {
          status: 405,
          headers: { "content-type": "application/json; charset=utf-8", allow: "GET" },
        });
      }
      return apiHandler({
        request,
        env,
        waitUntil: (promise) => executionContext.waitUntil(promise),
      });
    }
    return staticResponse(request, env);
  },
};
