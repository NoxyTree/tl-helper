import test from "node:test";
import assert from "node:assert/strict";

import {
  achievementRowsFromLocal,
  buildRowFromLocal,
  localFromAchievementRows,
  localFromBuildRow,
  mergeAchievementProgress,
  mergeBuildLists,
} from "../../web/tl-sync-encode.js";

test("builds round-trip with the armory document unchanged", () => {
  const armoryState = {
    profile: { name: "SnS/Wand" },
    attributes: { strength: 30 },
    favoriteStatIds: [1, 4],
    build: { equipment: { mainHand: { id: 123 } } },
  };

  const row = buildRowFromLocal(armoryState, { userId: "user-1", isActive: true });

  assert.deepEqual(row, {
    user_id: "user-1",
    name: "SnS/Wand",
    kind: "preset",
    is_active: true,
    document: armoryState,
    document_schema: "tl-helper.armory-state",
    schema_version: 1,
    game_build: "unversioned",
  });
  assert.strictEqual(localFromBuildRow(row), armoryState);
  assert.equal(localFromBuildRow(null), null);
  assert.equal(buildRowFromLocal(null, null).name, "Build");
});

test("build kind validation throws RangeError", () => {
  assert.throws(
    () => buildRowFromLocal({}, { userId: "user-1", kind: "shared" }),
    RangeError,
  );
});

test("achievement encoding normalizes stages, legacy completion, and text ids", () => {
  const rows = achievementRowsFromLocal({
    42: { completedStageIndexes: [3, 1, 3, 2.5, "2"] },
    99: { completed: true },
    100: { completedStageIndexes: [] },
    nope: null,
  }, { userId: "user-1" });

  assert.deepEqual(rows, [
    {
      user_id: "user-1",
      achievement_id: "42",
      completed_stage_indexes: [1, 3],
      completed: false,
    },
    {
      user_id: "user-1",
      achievement_id: "99",
      completed_stage_indexes: [],
      completed: true,
    },
  ]);
  assert.equal(typeof rows[0].achievement_id, "string");
  assert.deepEqual(achievementRowsFromLocal(null, null), []);
});

test("achievement rows round-trip to local entry shapes", () => {
  const local = {
    7: { completedStageIndexes: [2, 0, 2] },
    8: { completed: true },
  };

  const roundTrip = localFromAchievementRows(
    achievementRowsFromLocal(local, { userId: "user-1" }),
  );

  assert.deepEqual(roundTrip, {
    7: { completedStageIndexes: [0, 2] },
    8: { completed: true },
  });
  assert.deepEqual(localFromAchievementRows(null), {});
});

test("achievement merge unions stages and retains completion flags", () => {
  const local = {
    1: { completedStageIndexes: [0, 2] },
    2: { completed: true },
  };
  const remote = {
    1: { completedStageIndexes: [1, 2], completed: true },
    3: { completedStageIndexes: [4] },
  };

  assert.deepEqual(mergeAchievementProgress(local, remote), {
    1: { completedStageIndexes: [0, 1, 2], completed: true },
    2: { completed: true },
    3: { completedStageIndexes: [4] },
  });
  assert.deepEqual(local, {
    1: { completedStageIndexes: [0, 2] },
    2: { completed: true },
  });
  assert.deepEqual(remote, {
    1: { completedStageIndexes: [1, 2], completed: true },
    3: { completedStageIndexes: [4] },
  });
});

test("achievement merge handles null sides", () => {
  assert.deepEqual(
    mergeAchievementProgress(null, { 5: { completedStageIndexes: [1] } }),
    { 5: { completedStageIndexes: [1] } },
  );
  assert.deepEqual(mergeAchievementProgress(undefined, undefined), {});
});

test("build list merge deduplicates by key with remote winning", () => {
  const local = [
    { id: "a", name: "Local A" },
    { id: "b", name: "Local B" },
  ];
  const remote = [
    { id: "a", name: "Remote A" },
    { id: "c", name: "Remote C" },
  ];

  assert.deepEqual(mergeBuildLists(local, remote), [
    { id: "a", name: "Remote A" },
    { id: "b", name: "Local B" },
    { id: "c", name: "Remote C" },
  ]);
  assert.deepEqual(local, [
    { id: "a", name: "Local A" },
    { id: "b", name: "Local B" },
  ]);
  assert.deepEqual(
    mergeBuildLists([{ name: "same", side: "local" }], [{ name: "same", side: "remote" }]),
    [{ name: "same", side: "remote" }],
  );
});
