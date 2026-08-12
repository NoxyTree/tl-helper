const ALLOWED_HOSTS = new Set(["questlog.gg", "www.questlog.gg"]);
const PROCEDURES = Object.freeze({
  character: "characterBuilder.getCharacter",
  skills: "skillBuilder.getSkillBuildsBySlug",
  masteries: "weaponSpecialization.getWeaponSpecializationBySlug",
});
const MAX_RESPONSE_BYTES = 8_000_000;
const CACHE_TTL_MS = 300_000;
const UPSTREAM_ERROR = "Questlog is unavailable right now. Try again in a minute.";
const TIMEOUT_ERROR = "Questlog took too long to respond. Try again in a minute.";
const BUSY_ERROR = "Too many imports right now. Wait a minute and try again.";
const cache = new Map();

// Upstream rate limit. Everything else here bounds what a request may ask for;
// nothing bounded how OFTEN. The Sec-Fetch-Site gate deliberately admits
// header-less clients, so a script could proxy questlog.gg through us without
// limit -- their block would land on our egress IPs, and the invocations are
// ours to pay for.
//
// Two buckets, because each answers a different abuse:
//   - per client, so one player cannot monopolise the endpoint;
//   - per instance across all clients, because the client key comes from a
//     header and header rotation would walk straight past the first bucket.
//
// Honest about its reach: serverless instances do not share memory, so this
// bounds one instance rather than the deployment. A shared store would fix
// that and is not worth the dependency here -- the gap between "unlimited" and
// "a few per instance per minute" is the one that protects the upstream.
//
// Tokens are spent only where a request actually reaches Questlog, i.e. after
// the cache check, so repeat views of a cached character are never throttled.
const PER_CLIENT = { capacity: 10, perMs: 10 / 60_000 };
const PER_INSTANCE = { capacity: 60, perMs: 60 / 60_000 };
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

// Vercel sets x-real-ip from the edge; x-forwarded-for is the fallback and its
// leftmost entry is the client. Unknown callers share one bucket rather than
// getting a free pass each.
function clientKey(request) {
  const headers = request.headers ?? {};
  const forwarded = String(headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  return String(headers["x-real-ip"] ?? "").trim() || forwarded || "unknown";
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
  // Evict oldest-inserted first; Map preserves insertion order. Bounded so a
  // spray of distinct keys cannot grow this without limit.
  if (!clientBuckets.has(key) && clientBuckets.size >= MAX_TRACKED_CLIENTS) {
    clientBuckets.delete(clientBuckets.keys().next().value);
  }
  const bucket = clientBuckets.get(key) ?? { tokens: PER_CLIENT.capacity, updatedAt: now };
  clientBuckets.set(key, bucket);
  return spend(bucket, PER_CLIENT, now);
}

export default async function handler(request, response) {
  if (request.method !== "GET") return send(response, 405, { error: "Method not allowed." }, "no-store");
  // Cheap same-origin gate: browsers send Sec-Fetch-Site; "cross-site" means a
  // foreign page is scripting this endpoint. Absent header (curl, old browsers,
  // direct navigation) and same-origin/same-site/none all pass.
  const secFetchSite = String(request.headers?.["sec-fetch-site"] ?? "").toLowerCase();
  if (secFetchSite === "cross-site") return send(response, 403, { error: "Cross-site requests are not allowed." }, "no-store");
  try {
    const rawUrl = Array.isArray(request.query?.url) ? request.query.url[0] : request.query?.url;
    const parsed = parseQuestlogCharacterUrl(rawUrl);
    const cacheKey = `${parsed.characterSlug}:${parsed.buildId ?? ""}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      if (cached.expiresAt > Date.now()) return send(response, 200, cached.value, "public, max-age=300");
      cache.delete(cacheKey);
    }

    if (!withinRateLimit(request)) return send(response, 429, { error: BUSY_ERROR }, "no-store", { "Retry-After": "60" });

    const characterData = await trpc(PROCEDURES.character, { slug: parsed.characterSlug });
    const ownerSlug = characterData?.character?.user?.slug;
    if (!ownerSlug || !Array.isArray(characterData?.builds)) throw new Error("Questlog returned an incomplete character package.");
    const [skillData, masteryData] = await Promise.all([
      trpc(PROCEDURES.skills, { slug: ownerSlug }),
      trpc(PROCEDURES.masteries, { slug: ownerSlug }),
    ]);
    const value = {
      schema: "tl-helper.questlog-character-import",
      schemaVersion: 1,
      fetchedAtUtc: new Date().toISOString(),
      ...parsed,
      procedures: PROCEDURES,
      characterData,
      skillData,
      masteryData,
    };
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return send(response, 200, value, "public, max-age=300");
  } catch (error) {
    const { status, message } = classifyError(error);
    if (status !== 400) console.error("questlog character import failed:", error);
    return send(response, status, { error: message }, "no-store");
  }
}

// Input/validation problems keep their clear client-facing messages (400).
// Everything else is an upstream problem: timeouts map to 504, and upstream
// failures/invalid payloads map to 502 with a fixed message so internal error
// text (stack details, JSON parser output) never reaches the client.
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

function parseQuestlogCharacterUrl(input) {
  let url;
  try { url = new URL(String(input ?? "").trim()); }
  catch { throw inputError("Paste a complete Questlog character-builder URL."); }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) throw inputError("Only public questlog.gg HTTPS links are supported.");
  const parts = url.pathname.split("/").filter(Boolean);
  const marker = parts.indexOf("character-builder");
  const slug = marker >= 0 ? parts[marker + 1] : null;
  if (!slug) throw inputError("The link does not contain a Questlog character slug.");
  // Questlog's own share links use "build-id"; older TL Helper links use
  // "buildId". Both select the same single build.
  const buildId = url.searchParams.get("buildId") ?? url.searchParams.get("build-id");
  if (buildId !== null && !/^\d+$/.test(buildId)) throw inputError("Questlog buildId must be numeric.");
  const characterSlug = decodeURIComponent(slug);
  const canonical = new URL(`https://${url.hostname.toLowerCase()}/throne-and-liberty/en/character-builder/${encodeURIComponent(characterSlug)}`);
  if (buildId !== null) canonical.searchParams.set("buildId", buildId);
  return { sourceUrl: canonical.href, characterSlug, buildId };
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
  const data = JSON.parse(text)?.result?.data;
  if (!data) throw new Error(`Questlog ${procedure} returned invalid data.`);
  return data;
}

function send(response, status, body, cacheControl, extraHeaders) {
  response.setHeader("Cache-Control", cacheControl);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  for (const [key, value] of Object.entries(extraHeaders ?? {})) response.setHeader(key, value);
  return response.status(status).json(body);
}
