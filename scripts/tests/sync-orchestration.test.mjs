import test from "node:test";
import assert from "node:assert/strict";
import { runSync, syncAchievements, syncBuilds } from "../../web/tl-sync.js";
import { saveArmoryPresets, loadArmoryPresets } from "../../web/tl-persistence.js";

const ACH_KEY = "tl-achievement-tracker-progress-v1";
const armoryState = (id, name) => ({ id, name, createdAt: "2026-07-15", profile: { name }, attributes: {}, favoriteStatIds: [], build: { equipment: { main_hand: { itemId: "x" } } } });

function mockStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), _map: map };
}

// Minimal in-memory PostgREST-like client: shared row arrays per table, a
// thenable select builder, and upsert/insert that mutate the same arrays.
function mockClient(seed = {}) {
  const tables = { achievement_progress: [...(seed.achievement_progress ?? [])], builds: [...(seed.builds ?? [])] };
  const calls = { insert: 0, upsert: 0 };
  const from = (name) => {
    const rows = tables[name];
    const filters = [];
    const builder = {
      select() { return builder; },
      is(col, val) { filters.push((r) => (r[col] ?? null) === val); return builder; },
      eq(col, val) { filters.push((r) => r[col] === val); return builder; },
      then(resolve) { resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }); },
      async upsert(newRows, opts) {
        calls.upsert += 1;
        const keys = String(opts?.onConflict ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        for (const nr of newRows) {
          const i = keys.length ? rows.findIndex((r) => keys.every((k) => r[k] === nr[k])) : -1;
          if (i >= 0) rows[i] = { ...rows[i], ...nr }; else rows.push({ ...nr });
        }
        return { error: null };
      },
      async insert(newRows) { calls.insert += 1; for (const nr of newRows) rows.push({ ...nr, id: `uuid-${rows.length}` }); return { error: null }; },
    };
    return builder;
  };
  return { from, _tables: tables, _calls: calls };
}

test("runSync unions achievements across local and cloud without losing either", async () => {
  const storage = mockStorage({ [ACH_KEY]: JSON.stringify({ 1: { completedStageIndexes: [0, 1] } }) });
  const client = mockClient({ achievement_progress: [{ user_id: "u1", achievement_id: "2", completed_stage_indexes: [0], completed: false }] });
  const result = await runSync({ client, storage, userId: "u1" });
  assert.equal(result.ok, true);
  const localAfter = JSON.parse(storage.getItem(ACH_KEY));
  assert.deepEqual(localAfter["1"], { completedStageIndexes: [0, 1] }, "local-only progress retained");
  assert.deepEqual(localAfter["2"], { completedStageIndexes: [0] }, "cloud-only progress pulled down");
  const remoteIds = client._tables.achievement_progress.map((r) => r.achievement_id).sort();
  assert.deepEqual(remoteIds, ["1", "2"], "both achievements now in cloud");
});

test("runSync unions saved builds (presets) by stable id and pushes new ones up", async () => {
  const storage = mockStorage();
  saveArmoryPresets(storage, [armoryState("preset-a", "Local Build")], { gameBuild: "g1" });
  const client = mockClient({ builds: [{ id: "uuid-remote", name: "Cloud Build", kind: "preset", deleted_at: null, document: armoryState("preset-b", "Cloud Build"), game_build: "g1" }] });
  const result = await runSync({ client, storage, userId: "u1" });
  assert.equal(result.ok, true);
  const localPresets = loadArmoryPresets(storage, {}).data.map((p) => p.id).sort();
  assert.deepEqual(localPresets, ["preset-a", "preset-b"], "local now has both presets");
  const remoteDocIds = client._tables.builds.map((r) => r.document.id).sort();
  assert.deepEqual(remoteDocIds, ["preset-a", "preset-b"], "local preset pushed to cloud, cloud preset retained");
  assert.equal(client._calls.insert, 1, "exactly one insert batch");
});

test("runSync is idempotent — a second run inserts nothing new", async () => {
  const storage = mockStorage();
  saveArmoryPresets(storage, [armoryState("preset-a", "A")], { gameBuild: "g1" });
  const client = mockClient();
  await runSync({ client, storage, userId: "u1" });
  const afterFirst = client._tables.builds.length;
  await runSync({ client, storage, userId: "u1" });
  assert.equal(client._tables.builds.length, afterFirst, "no duplicate build rows on re-sync");
});

test("runSync surfaces a client error as {ok:false} without throwing", async () => {
  const storage = mockStorage();
  const client = { from: () => ({ select() { return this; }, is() { return this; }, eq() { return this; }, then(res) { res({ data: null, error: { message: "boom" } }); } }) };
  const result = await runSync({ client, storage, userId: "u1" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "error");
});

test("runSync refuses to run with missing deps (guest / signed out)", async () => {
  assert.equal((await runSync({ client: null, storage: mockStorage(), userId: "u1" })).ok, false);
  assert.equal((await runSync({ client: mockClient(), storage: null, userId: "u1" })).ok, false);
  assert.equal((await runSync({ client: mockClient(), storage: mockStorage(), userId: null })).ok, false);
});
