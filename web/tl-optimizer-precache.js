// Precomputed full-build optimizer results for preset scratch requests.
//
// The optimizer is fully deterministic, so a result computed offline for the
// exact same canonical request (same game data build, same engine sources) is
// byte-identical to what the in-browser worker would produce. The generator
// (scripts/precompute-optimizer-results.mjs) runs the real adapter at thorough
// depth and stores results under web/data/optimizer-precache/; the scratch
// page consults this module before spawning the worker and falls back to a
// live run on any miss. Staleness is guarded twice: the index records the
// game data build (checked at lookup time) and an engine source fingerprint
// (pinned by scripts/tests/optimizer-precache.test.mjs, so a stale committed
// cache fails the suite before it can deploy).
import { normalizeRankedGoals } from "./tl-full-build-adapter.js";

export const PRECACHE_INDEX_URL = "./data/optimizer-precache/index.json";

const RUNE_RULE_FIELDS = ["mode", "chaosOwnershipRequired", "normalDuplicateCap", "chaosDuplicateCap"];
const RULE_FIELDS = ["minimumItemLevel", "keepCurrentHeroics", "reconsiderHeroics", "includeSetEffects", "optimizeThreeTraits", "bestHeroicConfiguration", "allowUnownedHeroics"];

function buildHasSelections(build) {
  for (const group of [build?.equipment, build?.artifacts, build?.supportSlots]) {
    for (const selection of Object.values(group ?? {})) {
      if (String(selection?.itemId ?? "").trim()) return true;
    }
  }
  return false;
}

function attributesAllocated(build) {
  return Object.values(build?.attributes ?? {}).some((value) => Number(value) > 0);
}

// Returns the cache-relevant normal form of a scratch optimize request, or
// null when the request depends on state the cache cannot represent (an
// existing build, locked slots, a combat scenario, or a non-thorough depth).
export function canonicalPrecacheRequest(request) {
  if (!request || request.sourceKind !== "scratch") return null;
  if (request.depth !== "thorough") return null;
  if (request.scenario != null) return null;
  if ((request.lockedSlotIds ?? []).length) return null;
  if ((request.goals?.protect ?? []).length) return null;
  if (request.goals?.rankDecay != null) return null;
  const sourceBuild = request.build?.build ?? request.build ?? {};
  if (buildHasSelections(sourceBuild) || attributesAllocated(request.build)) return null;
  const priorities = normalizeRankedGoals(request.goals ?? {})
    .map(({ id, rank, mode, minimum, target }) => ({ id, rank, mode, minimum, target }));
  if (!priorities.length) return null;
  const progression = request.progression ?? {};
  const rules = request.rules ?? {};
  return {
    schema: "tl-helper.optimizer-precache-request",
    schemaVersion: 1,
    weaponTypes: (request.weaponTypes ?? []).map(String),
    attributePointBudget: Number(request.attributePointBudget) || 0,
    priorities,
    progression: {
      enabled: progression.enabled !== false,
      skillLevelCap: Number(progression.skillLevelCap ?? 20),
      masteryPointsByWeapon: Object.fromEntries(Object.entries(progression.masteryPointsByWeapon ?? {}).sort(([a], [b]) => a.localeCompare(b))),
      overallMasteryLevel: Number(progression.overallMasteryLevel ?? 0),
    },
    rules: {
      ...Object.fromEntries(RULE_FIELDS.map((field) => [field, rules[field] ?? null])),
      runes: Object.fromEntries(RUNE_RULE_FIELDS.map((field) => [field, rules.runes?.[field] ?? null])),
      artifacts: { mode: rules.artifacts?.mode ?? null },
    },
  };
}

export async function precacheKey(canonical, gameBuild) {
  const text = JSON.stringify({ gameBuild: String(gameBuild), request: canonical });
  const bytes = new TextEncoder().encode(text);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}

// Looks up a precomputed result for the request. Returns the stored optimizer
// result or null. Never throws: any fetch or shape problem falls back to null
// so the caller runs the live optimizer instead.
export async function loadPrecachedResult(request, { gameBuild, fetchImpl = globalThis.fetch, indexUrl = PRECACHE_INDEX_URL } = {}) {
  try {
    if (!fetchImpl) return null;
    const canonical = canonicalPrecacheRequest(request);
    if (!canonical) return null;
    const indexResponse = await fetchImpl(indexUrl);
    if (!indexResponse?.ok) return null;
    const index = await indexResponse.json();
    if (index?.schema !== "tl-helper.optimizer-precache-index") return null;
    if (String(index.gameBuild) !== String(gameBuild)) return null;
    const key = await precacheKey(canonical, gameBuild);
    const file = index.entries?.[key];
    if (!file || !/^[a-z0-9-]+\.json$/.test(String(file))) return null;
    const entryResponse = await fetchImpl(indexUrl.replace(/index\.json$/, String(file)));
    if (!entryResponse?.ok) return null;
    const entry = await entryResponse.json();
    if (entry?.key !== key || !entry?.result?.build) return null;
    return entry.result;
  } catch {
    return null;
  }
}
