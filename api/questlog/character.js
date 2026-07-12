const ALLOWED_HOSTS = new Set(["questlog.gg", "www.questlog.gg"]);
const PROCEDURES = Object.freeze({
  character: "characterBuilder.getCharacter",
  skills: "skillBuilder.getSkillBuildsBySlug",
  masteries: "weaponSpecialization.getWeaponSpecializationBySlug",
});
const MAX_RESPONSE_BYTES = 8_000_000;
const CACHE_TTL_MS = 300_000;
const cache = new Map();

export default async function handler(request, response) {
  if (request.method !== "GET") return send(response, 405, { error: "Method not allowed." }, "no-store");
  try {
    const rawUrl = Array.isArray(request.query?.url) ? request.query.url[0] : request.query?.url;
    const parsed = parseQuestlogCharacterUrl(rawUrl);
    const cacheKey = `${parsed.characterSlug}:${parsed.buildId ?? ""}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return send(response, 200, cached.value, "public, max-age=300");

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
    return send(response, 400, { error: String(error?.message ?? error) }, "no-store");
  }
}

function parseQuestlogCharacterUrl(input) {
  let url;
  try { url = new URL(String(input ?? "").trim()); }
  catch { throw new Error("Paste a complete Questlog character-builder URL."); }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) throw new Error("Only public questlog.gg HTTPS links are supported.");
  const parts = url.pathname.split("/").filter(Boolean);
  const marker = parts.indexOf("character-builder");
  const slug = marker >= 0 ? parts[marker + 1] : null;
  if (!slug) throw new Error("The link does not contain a Questlog character slug.");
  const buildId = url.searchParams.get("buildId");
  if (buildId !== null && !/^\d+$/.test(buildId)) throw new Error("Questlog buildId must be numeric.");
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

function send(response, status, body, cacheControl) {
  response.setHeader("Cache-Control", cacheControl);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  return response.status(status).json(body);
}
