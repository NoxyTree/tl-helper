const ALLOWED_HOSTS = new Set(["questlog.gg", "www.questlog.gg"]);
const PROCEDURES = Object.freeze({
  character: "characterBuilder.getCharacter",
  skills: "skillBuilder.getSkillBuildsBySlug",
  masteries: "weaponSpecialization.getWeaponSpecializationBySlug",
});
const MAX_RESPONSE_BYTES = 8_000_000;
const UPSTREAM_ERROR = "Questlog is unavailable right now. Try again in a minute.";
const TIMEOUT_ERROR = "Questlog took too long to respond. Try again in a minute.";
const BUSY_ERROR = "Too many imports right now. Wait a minute and try again.";

// Upstream rate limit. Everything else here bounds what a request may ask for;
// nothing bounded how OFTEN. The Sec-Fetch-Site gate deliberately admits
// header-less clients, so a script could proxy questlog.gg through us without
// limit -- their block would land on our egress IPs, and the invocations are
// ours to pay for.
//
// Two buckets, because each answers a different abuse:
//   - per client, so one player cannot monopolise the endpoint;
//   - per isolate across all clients, because the client key comes from a
//     header and header rotation would walk straight past the first bucket.
//
// Honest about its reach: Workers isolates do not share memory and are recycled
// freely, so this bounds one isolate rather than the deployment. The gap
// between "unlimited" and "a few per isolate per minute" is the one that
// protects the upstream. Mirrors api/questlog/character.js.
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

// Cloudflare sets CF-Connecting-IP at the edge and it cannot be spoofed by the
// client. Unknown callers share one bucket rather than getting a free pass each.
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
  // Evict oldest-inserted first; Map preserves insertion order. Bounded so a
  // spray of distinct keys cannot grow this without limit.
  if (!clientBuckets.has(key) && clientBuckets.size >= MAX_TRACKED_CLIENTS) {
    clientBuckets.delete(clientBuckets.keys().next().value);
  }
  const bucket = clientBuckets.get(key) ?? { tokens: PER_CLIENT.capacity, updatedAt: now };
  clientBuckets.set(key, bucket);
  return spend(bucket, PER_CLIENT, now);
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  // Cheap same-origin gate: browsers send Sec-Fetch-Site; "cross-site" means a
  // foreign page is scripting this endpoint. Absent header (curl, old browsers,
  // direct navigation) and same-origin/same-site/none all pass.
  const secFetchSite = String(context.request.headers.get("sec-fetch-site") ?? "").toLowerCase();
  if (secFetchSite === "cross-site") return json({ error: "Cross-site requests are not allowed." }, 403);
  try {
    const parsed = parseQuestlogCharacterUrl(requestUrl.searchParams.get("url"));
    const cacheKey = new Request(`${requestUrl.origin}${requestUrl.pathname}?character=${encodeURIComponent(parsed.characterSlug)}&buildId=${encodeURIComponent(parsed.buildId ?? "")}`);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    if (!withinRateLimit(context.request)) return json({ error: BUSY_ERROR }, 429, "no-store", { "retry-after": "60" });
    const characterData = await trpc(PROCEDURES.character, { slug: parsed.characterSlug });
    const ownerSlug = characterData?.character?.user?.slug;
    if (!ownerSlug || !Array.isArray(characterData?.builds)) throw new Error("Questlog returned an incomplete character package.");
    const [skillData, masteryData] = await Promise.all([
      trpc(PROCEDURES.skills, { slug: ownerSlug }),
      trpc(PROCEDURES.masteries, { slug: ownerSlug }),
    ]);
    const response = json({
      schema: "tl-helper.questlog-character-import",
      schemaVersion: 1,
      fetchedAtUtc: new Date().toISOString(),
      ...parsed,
      procedures: PROCEDURES,
      characterData,
      skillData,
      masteryData,
    }, 200, "public, max-age=300");
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    const { status, message } = classifyError(error);
    if (status !== 400) console.error("questlog character import failed:", error);
    return json({ error: message }, status);
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
  const buildId = url.searchParams.get("buildId");
  if (buildId !== null && !/^\d+$/.test(buildId)) throw inputError("Questlog buildId must be numeric.");
  const canonical = new URL(`https://${url.hostname.toLowerCase()}/throne-and-liberty/en/character-builder/${encodeURIComponent(decodeURIComponent(slug))}`);
  if (buildId !== null) canonical.searchParams.set("buildId", buildId);
  return { sourceUrl: canonical.href, characterSlug: decodeURIComponent(slug), buildId };
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
  const data = JSON.parse(text)?.result?.data;
  if (!data) throw new Error(`Questlog ${procedure} returned invalid data.`);
  return data;
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
