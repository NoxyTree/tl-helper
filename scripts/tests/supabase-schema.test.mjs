import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../../supabase/migrations/20260712000000_initial_personal_hub.sql", import.meta.url), "utf8");

test("Supabase schema enables RLS for every user-owned table", () => {
  for (const table of ["profiles", "builds", "tracker_states", "achievement_progress", "wishlists", "wishlist_items", "user_media"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`create policy ${table}_owner_all`, "i"));
  }
});

test("Supabase user images remain private and owner-scoped", () => {
  assert.match(sql, /values \('user-images', 'user-images', false, 2097152/i);
  assert.match(sql, /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/i);
  assert.doesNotMatch(sql, /service_role/i);
});

test("Supabase build documents preserve provenance and revisions", () => {
  for (const column of ["document_schema", "schema_version", "game_build", "snapshot_ruleset", "snapshot_game_build", "revision"]) {
    assert.match(sql, new RegExp(`\\b${column}\\b`, "i"));
  }
  assert.match(sql, /builds_one_active_per_user/i);
});
