const ALLOWED_HOSTS = new Set(["questlog.gg", "www.questlog.gg"]);
const PROCEDURES = Object.freeze({
  character: "characterBuilder.getCharacter",
  skills: "skillBuilder.getSkillBuildsBySlug",
  masteries: "weaponSpecialization.getWeaponSpecializationBySlug",
});
const MAX_RESPONSE_BYTES = 8_000_000;

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  try {
    const parsed = parseQuestlogCharacterUrl(requestUrl.searchParams.get("url"));
    const characterData = await trpc(PROCEDURES.character, { slug: parsed.characterSlug });
    const ownerSlug = characterData?.character?.user?.slug;
    if (!ownerSlug || !Array.isArray(characterData?.builds)) throw new Error("Questlog returned an incomplete character package.");
    const [skillData, masteryData] = await Promise.all([
      trpc(PROCEDURES.skills, { slug: ownerSlug }),
      trpc(PROCEDURES.masteries, { slug: ownerSlug }),
    ]);
    return json({
      schema: "tl-helper.questlog-character-import",
      schemaVersion: 1,
      fetchedAtUtc: new Date().toISOString(),
      ...parsed,
      procedures: PROCEDURES,
      characterData,
      skillData,
      masteryData,
    }, 200);
  } catch (error) {
    return json({ error: String(error?.message ?? error) }, 400);
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
  return { sourceUrl: url.href, characterSlug: decodeURIComponent(slug), buildId };
}

async function trpc(procedure, input) {
  const query = encodeURIComponent(JSON.stringify(input));
  const response = await fetch(`https://questlog.gg/throne-and-liberty/api/trpc/${procedure}?input=${query}`, {
    headers: { accept: "application/json", "user-agent": "TL Helper hosted importer" },
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

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
