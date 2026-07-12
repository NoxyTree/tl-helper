/**
 * Deterministic, bounded full-build search.
 *
 * Candidates are deliberately data-agnostic. `selection` may contain an item,
 * its optimized traits, runes, artifact configuration, or any other payload.
 * The caller owns exact game rules through `evaluate(selections, context)`.
 */

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const stableId = (candidate) => String(candidate.id ?? candidate.selection?.itemId ?? "");
const sortedObject = (value) => Object.fromEntries(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));

function abortRequested(options) {
  return options.signal?.aborted || options.shouldCancel?.() === true;
}

function assertRunning(options) {
  if (!abortRequested(options)) return;
  throw new DOMException("Full-build optimization cancelled", "AbortError");
}

function normalizeCandidates(slot, entries, locked) {
  const candidates = [...(entries ?? [])]
    .filter((candidate) => !locked || candidate.locked === true || stableId(candidate) === String(locked))
    .sort((a, b) => stableId(a).localeCompare(stableId(b)));
  if (!candidates.length) throw new Error(`No legal candidates supplied for slot: ${slot}`);
  return candidates;
}

function addStats(left, right) {
  const result = { ...left };
  for (const [id, value] of Object.entries(right ?? {})) result[id] = number(result[id]) + number(value);
  return result;
}

function addCounts(left, values) {
  const result = { ...left };
  for (const value of values ?? []) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function signature(state) {
  return JSON.stringify({
    heroic: sortedObject(state.heroic),
    weapons: [...state.weapons].sort(),
    sets: sortedObject(state.sets),
    custom: [...state.custom].sort(),
  });
}

function objectiveVector(state, ids) {
  return ids.map((id) => number(state.stats[id]));
}

function dominates(a, b, ids) {
  const av = objectiveVector(a, ids);
  const bv = objectiveVector(b, ids);
  return av.every((value, index) => value >= bv[index]) && av.some((value, index) => value > bv[index]);
}

function heuristic(state, weights) {
  let score = number(state.hint);
  for (const [id, weight] of Object.entries(weights ?? {})) score += number(state.stats[id]) * number(weight);
  return score;
}

function stateOrder(a, b, weights) {
  return heuristic(b, weights) - heuristic(a, weights) || a.key.localeCompare(b.key);
}

function prune(states, { beamWidth, paretoWidth, paretoStats, weights }) {
  const frontiers = new Map();
  for (const state of states.sort((a, b) => a.key.localeCompare(b.key))) {
    const sig = signature(state);
    const frontier = frontiers.get(sig) ?? [];
    if (frontier.some((other) => dominates(other, state, paretoStats))) continue;
    const next = frontier.filter((other) => !dominates(state, other, paretoStats)).concat(state);
    // Equivalent set/rule states can still have a large Pareto frontier. This
    // local bound keeps worst-case work predictable while retaining diversity.
    frontiers.set(sig, next.length > paretoWidth ? next.sort((a, b) => stateOrder(a, b, weights)).slice(0, paretoWidth) : next);
  }
  return [...frontiers.values()].flat().sort((a, b) => stateOrder(a, b, weights)).slice(0, beamWidth);
}

function canAdd(state, candidate, options) {
  if (candidate.heroicGroup) {
    const cap = number(options.heroicCaps?.[candidate.heroicGroup] ?? 1);
    if ((state.heroic[candidate.heroicGroup] ?? 0) >= cap) return false;
  }
  if (options.distinctWeaponTypes && candidate.weaponType && state.weapons.includes(candidate.weaponType)) return false;
  return options.isPartialLegal?.(state.selections, candidate, state) !== false;
}

function addCandidate(state, slot, candidate) {
  const id = stableId(candidate);
  return {
    selections: { ...state.selections, [slot]: candidate.selection ?? candidate },
    candidates: { ...state.candidates, [slot]: candidate },
    stats: addStats(state.stats, candidate.stats),
    heroic: candidate.heroicGroup ? { ...state.heroic, [candidate.heroicGroup]: (state.heroic[candidate.heroicGroup] ?? 0) + 1 } : state.heroic,
    weapons: candidate.weaponType ? state.weapons.concat(candidate.weaponType) : state.weapons,
    sets: addCounts(state.sets, candidate.setKeys),
    custom: state.custom.concat(candidate.stateKeys ?? []),
    hint: number(state.hint) + number(candidate.scoreHint),
    key: `${state.key}|${slot}:${id}`,
  };
}

function protectedLegal(evaluation, protectedStats) {
  return Object.entries(protectedStats ?? {}).every(([id, rule]) => {
    const value = number(evaluation.stats?.[id]);
    if (typeof rule === "number") return value >= rule;
    if (rule?.min != null && value < number(rule.min)) return false;
    if (rule?.baseline != null) {
      const allowedLoss = rule.allowedLossPercent == null ? 0 : number(rule.allowedLossPercent);
      if (value < number(rule.baseline) * (1 - allowedLoss / 100)) return false;
    }
    return true;
  });
}

/**
 * @param {object} options
 * @param {Record<string, Array<object>>} options.candidatesBySlot
 * @param {(selections: Record<string, any>, context: object) => object|Promise<object>} options.evaluate
 * @returns {Promise<{best: object|null, alternatives: object[], searched: number, finalists: number}>}
 */
export async function optimizeFullBuild(options) {
  if (!options?.evaluate) throw new TypeError("evaluate callback is required");
  const slots = options.slotOrder?.length ? [...options.slotOrder] : Object.keys(options.candidatesBySlot ?? {}).sort();
  const locked = options.lockedSlots ?? {};
  const beamWidth = Math.max(1, number(options.beamWidth) || 500);
  const paretoWidth = Math.max(1, number(options.paretoWidth) || 24);
  const alternativeCount = Math.max(1, number(options.alternativeCount) || 5);
  const weights = options.weights ?? {};
  const paretoStats = [...new Set([...(options.paretoStats ?? Object.keys(weights)), ...Object.keys(options.protectedStats ?? {})])].sort();
  let searched = 0;
  let beam = [{ selections: {}, candidates: {}, stats: {}, heroic: {}, weapons: [], sets: {}, custom: [], hint: 0, key: "" }];

  for (let index = 0; index < slots.length; index += 1) {
    assertRunning(options);
    const slot = slots[index];
    const candidates = normalizeCandidates(slot, options.candidatesBySlot[slot], locked[slot]);
    const expanded = [];
    for (const state of beam) {
      for (const candidate of candidates) {
        searched += 1;
        if (canAdd(state, candidate, options)) expanded.push(addCandidate(state, slot, candidate));
      }
    }
    beam = prune(expanded, { beamWidth, paretoWidth, paretoStats, weights });
    options.onProgress?.({ phase: "search", completedSlots: index + 1, totalSlots: slots.length, frontierSize: beam.length, searched });
    if (!beam.length) break;
    await Promise.resolve();
  }

  const results = [];
  for (let index = 0; index < beam.length; index += 1) {
    assertRunning(options);
    const state = beam[index];
    const evaluation = await options.evaluate(state.selections, {
      candidates: state.candidates,
      approximateStats: state.stats,
      setCounts: state.sets,
      heroicCounts: state.heroic,
    });
    if (evaluation?.legal !== false && protectedLegal(evaluation ?? {}, options.protectedStats)) {
      results.push({ selections: state.selections, candidates: state.candidates, evaluation, key: state.key });
    }
    options.onProgress?.({ phase: "evaluate", completed: index + 1, total: beam.length, legal: results.length });
  }

  results.sort((a, b) => number(b.evaluation.score) - number(a.evaluation.score)
    || number(b.evaluation.protectedHeadroom) - number(a.evaluation.protectedHeadroom)
    || a.key.localeCompare(b.key));
  const alternatives = results.slice(0, alternativeCount);
  return { best: alternatives[0] ?? null, alternatives, searched, finalists: beam.length };
}
