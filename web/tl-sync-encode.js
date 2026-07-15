const BUILD_KINDS = new Set(["current", "preset", "questlog-import"]);

export function buildRowFromLocal(armoryState, options = {}) {
  const {
    userId,
    kind = "preset",
    isActive = false,
    gameBuild = "unversioned",
    schemaVersion = 1,
    name,
  } = options ?? {};
  if (!BUILD_KINDS.has(kind)) throw new RangeError(`Unsupported build kind: ${kind}`);
  return {
    user_id: userId,
    name: name ?? armoryState?.profile?.name ?? "Build",
    kind,
    is_active: Boolean(isActive),
    document: armoryState,
    document_schema: "tl-helper.armory-state",
    schema_version: schemaVersion,
    game_build: gameBuild,
  };
}

export function localFromBuildRow(row) {
  return row?.document ?? null;
}

export function achievementRowsFromLocal(progressMap, options = {}) {
  if (!progressMap || typeof progressMap !== "object" || Array.isArray(progressMap)) return [];
  const { userId } = options ?? {};

  const rows = [];
  for (const [id, entry] of Object.entries(progressMap)) {
    const normalized = normalizeAchievementEntry(entry);
    if (!normalized) continue;
    rows.push({
      user_id: userId,
      achievement_id: String(id),
      completed_stage_indexes: normalized.stages,
      completed: normalized.completed,
    });
  }
  return rows;
}

export function localFromAchievementRows(rows) {
  if (!Array.isArray(rows)) return {};

  const progress = {};
  for (const row of rows) {
    if (!row || row.achievement_id == null) continue;
    const stages = normalizeStageIndexes(row.completed_stage_indexes);
    if (!stages.length && row.completed === true) {
      progress[String(row.achievement_id)] = { completed: true };
    } else if (stages.length) {
      progress[String(row.achievement_id)] = { completedStageIndexes: stages };
    }
  }
  return progress;
}

export function mergeAchievementProgress(localMap, remoteMap) {
  const merged = new Map();
  mergeProgressSide(merged, localMap);
  mergeProgressSide(merged, remoteMap);

  const progress = {};
  for (const [id, entry] of merged) {
    const stages = [...entry.stages].sort((a, b) => a - b);
    if (!stages.length && entry.completed) {
      progress[id] = { completed: true };
    } else if (stages.length) {
      progress[id] = { completedStageIndexes: stages };
      if (entry.completed) progress[id].completed = true;
    }
  }
  return progress;
}

export function mergeBuildLists(localBuilds, remoteBuilds, keyOf = (build) => build.id ?? build.name) {
  const merged = new Map();
  for (const build of Array.isArray(localBuilds) ? localBuilds : []) merged.set(keyOf(build), build);
  for (const build of Array.isArray(remoteBuilds) ? remoteBuilds : []) merged.set(keyOf(build), build);
  return [...merged.values()];
}

function mergeProgressSide(merged, progressMap) {
  if (!progressMap || typeof progressMap !== "object" || Array.isArray(progressMap)) return;
  for (const [id, value] of Object.entries(progressMap)) {
    const normalized = normalizeAchievementEntry(value);
    if (!normalized) continue;
    const entry = merged.get(id) ?? { stages: new Set(), completed: false };
    for (const stage of normalized.stages) entry.stages.add(stage);
    entry.completed ||= normalized.completed;
    merged.set(id, entry);
  }
}

function normalizeAchievementEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const stages = normalizeStageIndexes(entry.completedStageIndexes);
  const completed = entry.completed === true;
  return stages.length || completed ? { stages, completed } : null;
}

function normalizeStageIndexes(indexes) {
  if (!Array.isArray(indexes)) return [];
  return [...new Set(indexes.filter(Number.isInteger))].sort((a, b) => a - b);
}
