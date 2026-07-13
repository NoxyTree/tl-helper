const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function dominates(left, right, statIds) {
  return statIds.every((id) => numeric(left.goalValues?.[id]) >= numeric(right.goalValues?.[id]))
    && statIds.some((id) => numeric(left.goalValues?.[id]) > numeric(right.goalValues?.[id]));
}

export function paretoTuneFrontier(candidates = [], statIds = [], limit = 48) {
  const ids = [...new Set(statIds)].slice(0, 5);
  const frontier = [];
  const seenVectors = new Set();
  for (const candidate of [...candidates].sort((a, b) => numeric(b.score) - numeric(a.score) || String(a.id).localeCompare(String(b.id)))) {
    const vector = ids.map((id) => numeric(candidate.goalValues?.[id])).join("|");
    if (seenVectors.has(vector)) continue;
    seenVectors.add(vector);
    if (frontier.some((other) => dominates(other, candidate, ids))) continue;
    for (let index = frontier.length - 1; index >= 0; index -= 1) {
      if (dominates(candidate, frontier[index], ids)) frontier.splice(index, 1);
    }
    frontier.push(candidate);
  }
  return frontier.sort((a, b) => numeric(b.score) - numeric(a.score) || String(a.id).localeCompare(String(b.id))).slice(0, limit);
}

export function tuneRanges(candidates = [], statIds = []) {
  return Object.fromEntries(statIds.map((id) => {
    const values = candidates.map((candidate) => numeric(candidate.goalValues?.[id]));
    return [id, { minimum: Math.min(...values), maximum: Math.max(...values) }];
  }));
}

export function selectLinkedTuneCandidate(candidates = [], statIds = [], changedId, targetValue, floors = {}) {
  const ids = [...new Set(statIds)].slice(0, 5);
  const legal = candidates.filter((candidate) => Object.entries(floors).every(([id, floor]) => numeric(candidate.goalValues?.[id]) >= numeric(floor)));
  const pool = legal.length ? legal : candidates;
  const ranges = tuneRanges(pool, ids);
  return [...pool].sort((a, b) => {
    const range = Math.max(1, numeric(ranges[changedId]?.maximum) - numeric(ranges[changedId]?.minimum));
    const targetDistance = (candidate) => Math.abs(numeric(candidate.goalValues?.[changedId]) - numeric(targetValue)) / range;
    const aggregate = (candidate) => ids.reduce((sum, id) => {
      const bounds = ranges[id];
      return sum + (numeric(candidate.goalValues?.[id]) - numeric(bounds?.minimum)) / Math.max(1, numeric(bounds?.maximum) - numeric(bounds?.minimum));
    }, 0);
    return targetDistance(a) - targetDistance(b) || aggregate(b) - aggregate(a) || numeric(b.score) - numeric(a.score) || String(a.id).localeCompare(String(b.id));
  })[0] ?? null;
}
