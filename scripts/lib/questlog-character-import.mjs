const ALLOWED_HOSTS = new Set(["questlog.gg", "www.questlog.gg"]);
const PROCEDURES = Object.freeze({
  character: "characterBuilder.getCharacter",
  skills: "skillBuilder.getSkillBuildsBySlug",
  masteries: "weaponSpecialization.getWeaponSpecializationBySlug",
});

export function parseQuestlogCharacterUrl(input) {
  let url;
  try { url = new URL(String(input ?? "").trim()); }
  catch { throw new Error("Paste a complete Questlog character-builder URL."); }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) throw new Error("Only public questlog.gg HTTPS links are supported.");
  const parts = url.pathname.split("/").filter(Boolean);
  const marker = parts.indexOf("character-builder");
  const slug = marker >= 0 ? parts[marker + 1] : null;
  if (!slug) throw new Error("The link does not contain a Questlog character slug.");
  // Questlog's own share links use "build-id"; older TL Helper links use
  // "buildId". Both select the same single build.
  const buildId = url.searchParams.get("buildId") ?? url.searchParams.get("build-id");
  if (buildId !== null && !/^\d+$/.test(buildId)) throw new Error("Questlog buildId must be numeric.");
  return Object.freeze({ sourceUrl: url.href, characterSlug: decodeURIComponent(slug), buildId });
}

export async function fetchQuestlogCharacterPackage({ sourceUrl, fetchImpl = fetch, timeoutMs = 12_000 } = {}) {
  const parsed = parseQuestlogCharacterUrl(sourceUrl);
  const characterData = await trpc(fetchImpl, PROCEDURES.character, { slug: parsed.characterSlug }, timeoutMs);
  const ownerSlug = characterData?.character?.user?.slug;
  if (!ownerSlug || !Array.isArray(characterData?.builds)) throw new Error("Questlog returned an incomplete character package.");
  const [skillData, masteryData] = await Promise.all([
    trpc(fetchImpl, PROCEDURES.skills, { slug: ownerSlug }, timeoutMs),
    trpc(fetchImpl, PROCEDURES.masteries, { slug: ownerSlug }, timeoutMs),
  ]);
  return Object.freeze({
    schema: "tl-helper.questlog-character-import",
    schemaVersion: 1,
    fetchedAtUtc: new Date().toISOString(),
    ...parsed,
    procedures: PROCEDURES,
    characterData,
    skillData,
    masteryData,
  });
}

async function trpc(fetchImpl, procedure, input, timeoutMs) {
  const query = encodeURIComponent(JSON.stringify(input));
  const response = await fetchImpl(`https://questlog.gg/throne-and-liberty/api/trpc/${procedure}?input=${query}`, {
    headers: { accept: "application/json", "user-agent": "TL Helper local importer" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Questlog ${procedure} failed (${response.status}).`);
  const contentLength = Number(response.headers?.get?.("content-length") ?? 0);
  if (contentLength > 8_000_000) throw new Error("Questlog response exceeded the 8 MB safety limit.");
  const payload = await response.json();
  const data = payload?.result?.data;
  if (!data || JSON.stringify(data).length > 8_000_000) throw new Error(`Questlog ${procedure} returned invalid or oversized data.`);
  return data;
}
