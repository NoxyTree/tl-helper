const ALLOWED_HOSTS = new Set(["questlog.gg", "www.questlog.gg"]);
const PROCEDURES = Object.freeze({
  character: "characterBuilder.getCharacter",
  skills: "skillBuilder.getSkillBuildsBySlug",
  masteries: "weaponSpecialization.getWeaponSpecializationBySlug",
});
const MAX_RESPONSE_BYTES = 8_000_000;
const UPSTREAM_ERROR = "Questlog is unavailable right now. Try again in a minute.";
const TIMEOUT_ERROR = "Questlog took too long to respond. Try again in a minute.";

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
