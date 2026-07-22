// Local-first cloud sync for saved builds (Armory presets) and achievements.
//
// Guests keep everything in localStorage. When a user signs in, this merges
// their local data with the account's cloud copy using UNION semantics — no
// device ever loses progress — then writes the merged result back to both
// sides. v1 is additive and idempotent (keyed by stable preset id / achievement
// id); delete-propagation and live cross-device push are intentionally deferred.
//
// The orchestration takes its client and storage as arguments so it can be unit
// tested against a mock (see scripts/tests/sync-orchestration.test.mjs); the
// browser entry points resolve the real Supabase client and localStorage.
import { getSupabaseClient, onAuthChange } from "./tl-supabase.js";
import { loadArmoryPresets, saveArmoryPresets } from "./tl-persistence.js";
import {
  buildRowFromLocal, achievementRowsFromLocal, localFromAchievementRows,
  mergeAchievementProgress, mergeBuildLists,
} from "./tl-sync-encode.js";

const ACH_KEY = "tl-achievement-tracker-progress-v1";
const clampName = (value) => String(value || "Build").slice(0, 120) || "Build";
const isArmoryState = (value) => !!value && typeof value === "object" && !!value.build?.equipment;

function readLocalAchievements(storage) {
  try { return JSON.parse(storage.getItem(ACH_KEY) || "null") || {}; } catch { return {}; }
}
function writeLocalAchievements(storage, map) {
  try { storage.setItem(ACH_KEY, JSON.stringify(map)); } catch { /* storage full / unavailable — cloud copy still holds it */ }
}

// Merge local + cloud achievement progress (union), persist the merge to both.
export async function syncAchievements(client, storage, userId) {
  const local = readLocalAchievements(storage);
  const { data, error } = await client.from("achievement_progress").select("achievement_id, completed_stage_indexes, completed");
  if (error) throw error;
  const merged = mergeAchievementProgress(local, localFromAchievementRows(data ?? []));
  writeLocalAchievements(storage, merged);
  const rows = achievementRowsFromLocal(merged, { userId });
  if (rows.length) {
    const { error: upsertError } = await client.from("achievement_progress").upsert(rows, { onConflict: "user_id,achievement_id" });
    if (upsertError) throw upsertError;
  }
  return merged;
}

// Merge local Armory presets with the account's cloud builds (union by the
// preset's stable id, carried inside the row's `document`), persist to both.
export async function syncBuilds(client, storage, userId) {
  const loaded = loadArmoryPresets(storage, {});
  const localPresets = loaded.ok ? loaded.data : [];
  const gameBuild = loaded.ok ? loaded.gameBuild : "unversioned";

  const { data, error } = await client.from("builds").select("id, name, document, game_build").is("deleted_at", null).eq("kind", "preset");
  if (error) throw error;
  const remoteRows = data ?? [];
  const remotePresets = remoteRows.map((row) => row.document).filter(isArmoryState);

  const merged = mergeBuildLists(localPresets, remotePresets, (preset) => preset?.id ?? preset?.name).filter(isArmoryState);
  saveArmoryPresets(storage, merged, { gameBuild });

  const remoteIds = new Set(remoteRows.map((row) => row.document?.id).filter(Boolean));
  const toInsert = merged
    .filter((preset) => preset?.id && !remoteIds.has(preset.id))
    .map((preset) => buildRowFromLocal(preset, { userId, kind: "preset", gameBuild, name: clampName(preset.name) }));
  if (toInsert.length) {
    const { error: insertError } = await client.from("builds").insert(toInsert);
    if (insertError) throw insertError;
  }
  return merged;
}

/**
 * Push one known local preset to the signed-in account immediately. Unlike the
 * additive background merge, this path updates the matching cloud row when a
 * caller explicitly replaces a preset with the same stable document id.
 */
export async function syncPresetToAccount(client, preset, { userId, gameBuild = "unversioned" } = {}) {
  if (!client || !userId || !preset?.id || !isArmoryState(preset)) throw new TypeError("A client, user, and valid preset are required for account sync.");
  const { data, error } = await client.from("builds").select("id, document").eq("user_id", userId).is("deleted_at", null).eq("kind", "preset");
  if (error) throw error;
  const existing = (data ?? []).find((row) => row.document?.id === preset.id) ?? null;
  const cloudRow = buildRowFromLocal(preset, { userId, kind: "preset", gameBuild, name: clampName(preset.name) });
  if (existing) {
    const { error: updateError } = await client.from("builds").update(cloudRow).eq("id", existing.id);
    if (updateError) throw updateError;
    return { ok: true, action: "updated", remoteId: existing.id };
  }
  const { error: insertError } = await client.from("builds").insert([cloudRow]);
  if (insertError) throw insertError;
  return { ok: true, action: "created", remoteId: null };
}

/** Runs a full sync (builds + achievements) with injected deps. Never throws to callers. */
export async function runSync({ client, storage, userId }) {
  if (!client || !storage || !userId) return { ok: false, reason: "missing-deps" };
  try {
    const achievements = await syncAchievements(client, storage, userId);
    const builds = await syncBuilds(client, storage, userId);
    return { ok: true, achievements: Object.keys(achievements).length, builds: builds.length };
  } catch (error) {
    console.warn("Cloud sync failed; local data is unaffected.", error);
    return { ok: false, reason: "error", error };
  }
}

let syncing = false;
let installed = false;

/** Browser entry: resolves the live client + session and syncs localStorage. */
export async function syncNow() {
  if (syncing) return { ok: false, reason: "busy" };
  const client = await getSupabaseClient();
  if (!client) return { ok: false, reason: "unavailable" };
  let user = null;
  try { user = (await client.auth.getSession()).data?.session?.user ?? null; } catch { user = null; }
  if (!user) return { ok: false, reason: "signed-out" };
  syncing = true;
  try {
    return await runSync({ client, storage: globalThis.localStorage, userId: user.id });
  } finally {
    syncing = false;
  }
}

/** Subscribe to auth changes and sync once the user is signed in. Idempotent. */
export function installSync() {
  if (installed) return;
  installed = true;
  onAuthChange((session, event) => {
    if (event === "SIGNED_OUT" || !session?.user) return;
    syncNow();
  });
}
