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
  if (!candidates.length) throw new Error(`No compatible equipment options were found for slot: ${slot}`);
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

function capped(value, cap) {
  const maximum = Number(cap);
  return Number.isFinite(maximum) ? Math.min(number(value), maximum) : number(value);
}

function objectiveVector(state, ids, statCaps) {
  return ids.map((id) => capped(state.stats[id], statCaps?.[id]));
}

function dominates(a, b, ids, statCaps) {
  const av = a._objectiveVector ?? objectiveVector(a, ids, statCaps);
  const bv = b._objectiveVector ?? objectiveVector(b, ids, statCaps);
  return av.every((value, index) => value >= bv[index]) && av.some((value, index) => value > bv[index]);
}

function heuristic(state, weights, statCaps) {
  if (Number.isFinite(state._heuristic)) return state._heuristic;
  let score = number(state.hint);
  for (const [id, weight] of Object.entries(weights ?? {})) score += capped(state.stats[id], statCaps?.[id]) * number(weight);
  return score;
}

function stateOrder(a, b, weights, statCaps) {
  return heuristic(b, weights, statCaps) - heuristic(a, weights, statCaps)
    || number(a.neutralHeroics) - number(b.neutralHeroics)
    || number(b.neutralLevel) - number(a.neutralLevel)
    || number(b.neutralGrade) - number(a.neutralGrade)
    || a.key.localeCompare(b.key);
}

function normalizeSetRoutes(routes) {
  return [...(routes ?? [])].map((route) => ({
    id: String(route.id ?? `${route.setId}:${route.minimumPieces}`),
    setId: String(route.setId ?? ""),
    minimumPieces: Math.max(1, Math.floor(number(route.minimumPieces))),
    maximumPieces: Number.isFinite(Number(route.maximumPieces)) ? Math.max(1, Math.floor(Number(route.maximumPieces))) : Infinity,
  })).filter((route) => route.setId && route.maximumPieces >= route.minimumPieces)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function routeCount(state, route) {
  return number(state.sets?.[route.setId]);
}

const EMPTY_REACH_STATE = Object.freeze({ selections: {}, candidates: {}, stats: {}, heroic: {}, weapons: [], sets: {}, custom: [], hint: 0, neutralHeroics: 0, neutralLevel: 0, neutralGrade: 0, key: "" });

// Bounded backtracking search that answers "starting from `startState`, can
// enough distinct set pieces be added across the reachable future slots to land
// inside the route's [minimumPieces, maximumPieces] band?" — respecting the
// same legality rules (Heroic caps, distinct weapon types, distinct items) as
// the live beam expansion.
function routeReachableViaFutureSlots(startState, route, reachableSlots, candidatesBySlot, options) {
  const visit = (startIndex, current) => {
    const currentCount = routeCount(current, route);
    if (currentCount >= route.minimumPieces && currentCount <= route.maximumPieces) return true;
    if (currentCount > route.maximumPieces || currentCount + reachableSlots.length - startIndex < route.minimumPieces) return false;
    for (let index = startIndex; index < reachableSlots.length; index += 1) {
      const slot = reachableSlots[index];
      for (const candidate of candidatesBySlot[slot] ?? []) {
        if (!candidate.setKeys?.includes(route.setId) || !canAdd(current, candidate, options)) continue;
        if (visit(index + 1, addCandidate(current, slot, candidate))) return true;
      }
    }
    return false;
  };
  return visit(0, startState);
}

// Route reachability metadata depends only on (route, futureSlots, candidates),
// not on the beam state, so it is computed once per prune call and reused for
// every candidate state. `structural` marks routes whose reachability genuinely
// interacts with the rest of the build (a reachable set piece is Heroic-capped
// or carries a weapon type); only those need a per-state search. For every other
// route a state that holds none of the set's pieces has the exact reachability
// of an empty build, so `reachableFromEmpty` is computed once and reused.
function routeReachMetadata(route, futureSlots, candidatesBySlot, options) {
  const reachableSlots = [];
  const reachableItemIds = new Set();
  const idSlots = new Map();
  let duplicateItem = false;
  let structural = false;
  for (const slot of futureSlots) {
    const candidates = candidatesBySlot[slot] ?? [];
    let slotReaches = false;
    for (const candidate of candidates) {
      if (!candidate.setKeys?.includes(route.setId)) continue;
      slotReaches = true;
      if (candidate.heroicGroup || candidate.weaponType) structural = true;
      const itemId = candidate.selection?.itemId;
      if (itemId) {
        reachableItemIds.add(itemId);
        const seenSlots = idSlots.get(itemId) ?? new Set();
        seenSlots.add(slot);
        idSlots.set(itemId, seenSlots);
        if (seenSlots.size > 1) duplicateItem = true;
      }
    }
    if (slotReaches) reachableSlots.push(slot);
  }
  const reachableFromEmpty = !structural
    && reachableSlots.length >= route.minimumPieces
    && routeReachableViaFutureSlots(EMPTY_REACH_STATE, route, reachableSlots, candidatesBySlot, options);
  return { reachableSlots, reachableItemIds, baseInteractive: structural || duplicateItem, structural, reachableFromEmpty };
}

function stateCanReachRoute(state, route, candidatesBySlot, options, reach) {
  const count = routeCount(state, route);
  if (count > route.maximumPieces) return false;
  if (count >= route.minimumPieces) return true;
  const reachableSlots = reach.reachableSlots;
  if (count + reachableSlots.length < route.minimumPieces) return false;
  if (options.routeLegalityMetadataComplete === true) {
    let interactive = reach.baseInteractive;
    if (!interactive && reach.reachableItemIds.size) {
      for (const selection of Object.values(state.selections)) {
        if (selection?.itemId && reach.reachableItemIds.has(selection.itemId)) { interactive = true; break; }
      }
    }
    if (!interactive) return true;
  }
  // Non-structural route + no pieces held yet ⇒ reachability is build-independent
  // (the set candidates the search would add carry no Heroic/weapon interaction
  // and none of them is already equipped), so reuse the once-per-route result.
  if (!reach.structural && count === 0) return reach.reachableFromEmpty;
  return routeReachableViaFutureSlots(state, route, reachableSlots, candidatesBySlot, options);
}

function reserveSetRouteStates(states, routes, futureSlots, candidatesBySlot, options, weights, statCaps) {
  const retained = new Map();
  for (const route of routes) {
    const reach = routeReachMetadata(route, futureSlots, candidatesBySlot, options);
    // Linear scan for the single best reachable state (equivalent to
    // filter(...).sort(...)[0]) — avoids materializing and sorting the pool.
    let best = null;
    for (const state of states) {
      if (!stateCanReachRoute(state, route, candidatesBySlot, options, reach)) continue;
      if (best === null
        || (routeCount(best, route) - routeCount(state, route) || stateOrder(state, best, weights, statCaps)) < 0) {
        best = state;
      }
    }
    if (best) retained.set(best.key, best);
  }
  return [...retained.values()];
}

function reserveStructuralStates(states, structuralKeys, remainingStructuralKeys, weights, statCaps) {
  const retained = new Map();
  for (const key of structuralKeys) {
    const keyRemaining = remainingStructuralKeys.has(key);
    // Linear scan for the single best (equivalent to filter(...).sort(...)[0]):
    // prefer a state that already holds the structural key, then general order.
    let best = null;
    let bestHas = false;
    for (const state of states) {
      const has = state.custom.includes(key);
      if (!has && !keyRemaining) continue;
      if (best === null || (Number(bestHas) - Number(has) || stateOrder(state, best, weights, statCaps)) < 0) {
        best = state;
        bestHas = has;
      }
    }
    if (best) retained.set(best.key, best);
  }
  return [...retained.values()];
}

function diverseStates(states, statIds, limit, weights, statCaps) {
  const ordered = [...states].sort((a, b) => stateOrder(a, b, weights, statCaps));
  if (ordered.length <= limit) return ordered;
  const retained = new Map();
  const add = (row) => { if (row) retained.set(row.key, row); };
  const strongest = [];
  const runnersUp = [];
  for (const id of statIds) {
    let first = null;
    let second = null;
    const compare = (a, b) => capped(b.stats?.[id], statCaps?.[id]) - capped(a.stats?.[id], statCaps?.[id]) || stateOrder(a, b, weights, statCaps);
    for (const row of states) {
      if (!first || compare(row, first) < 0) {
        if (first?.key !== row.key) second = first;
        first = row;
      } else if (row.key !== first.key && (!second || compare(row, second) < 0)) {
        second = row;
      }
    }
    strongest.push(first);
    runnersUp.push(second);
  }
  for (const row of strongest) add(row);
  for (const row of runnersUp) add(row);
  for (const row of ordered) {
    if (retained.size >= limit) break;
    add(row);
  }
  return [...retained.values()].slice(0, limit);
}

function prune(states, { beamWidth, paretoWidth, paretoStats, weights, statCaps, setRoutes = [], futureSlots = [], candidatesBySlot = {}, searchOptions = {}, structuralKeys = [], remainingStructuralKeys = new Set(), minimumTargets = [] }) {
  const frontiers = new Map();
  for (const state of states) {
    state._signature = signature(state);
    state._objectiveVector = objectiveVector(state, paretoStats, statCaps);
    let score = number(state.hint);
    for (const [id, weight] of Object.entries(weights ?? {})) score += capped(state.stats[id], statCaps?.[id]) * number(weight);
    state._heuristic = score;
  }
  for (const state of states.sort((a, b) => a.key.localeCompare(b.key))) {
    const sig = state._signature;
    const frontier = frontiers.get(sig) ?? [];
    if (frontier.some((other) => dominates(other, state, paretoStats, statCaps))) continue;
    const next = frontier.filter((other) => !dominates(state, other, paretoStats, statCaps)).concat(state);
    // Equivalent set/rule states can still have a large Pareto frontier. This
    // local bound keeps worst-case work predictable while retaining diversity.
    frontiers.set(sig, next.length > paretoWidth ? diverseStates(next, paretoStats, paretoWidth, weights, statCaps) : next);
  }
  const pooled = [...frontiers.values()].flat();
  // Minimum-target reservation draws from the full expansion, not the pareto
  // pool: a jointly-floor-covering state is often non-extreme in every single
  // dimension, so the per-signature pareto width bound erases it before any
  // downstream retention could see it.
  const reserved = [...reserveSetRouteStates(pooled, setRoutes, futureSlots, candidatesBySlot, searchOptions, weights, statCaps),
    ...reserveStructuralStates(pooled, structuralKeys, remainingStructuralKeys, weights, statCaps),
    ...reserveMinimumTargetStates(states, minimumTargets, paretoWidth)];
  const general = diverseStates(pooled, paretoStats, beamWidth, weights, statCaps);
  const retained = new Map(reserved.map((state) => [state.key, state]));
  for (const state of general) retained.set(state.key, state);
  return [...retained.values()];
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
    neutralHeroics: number(state.neutralHeroics) + number(candidate.neutralHeroicCost),
    neutralLevel: number(state.neutralLevel) + number(candidate.neutralItemLevel),
    neutralGrade: number(state.neutralGrade) + number(candidate.neutralGrade),
    key: `${state.key}|${slot}:${id}`,
  };
}

// Goal minimums ("at least" floors) in scratch mode cannot be judged during
// the beam — attribute points that help satisfy them are allocated later — so
// they are enforced only after attribute optimization. Retention must
// therefore keep the states closest to jointly covering every floor alive
// through pruning and into the frontier, or a scoring-dominant beam can erase
// every floor-capable loadout and the run ends in "no build satisfies the
// constraints" even though the floors are individually reachable (observed
// with the PvP Evasion preset's accuracy + Heavy Attack floors, 2026-07-17).
// Reserving states is purely additive: without minimum targets the search is
// byte-identical to before.
function normalizeMinimumTargets(targets) {
  return (Array.isArray(targets) ? targets : [])
    .map((row) => ({
      id: String(row.id ?? ""),
      components: [...new Set((row.components?.length ? row.components : [row.id]).map(String))],
      minimum: number(row.minimum),
    }))
    .filter((row) => row.id && Number.isFinite(row.minimum) && row.minimum > 0);
}

function minimumShortfall(stats, targets) {
  let shortfall = 0;
  for (const target of targets) {
    const value = Math.min(...target.components.map((id) => number(stats?.[id])));
    shortfall += Math.max(0, target.minimum - value) / Math.max(1, target.minimum);
  }
  return shortfall;
}

function reserveMinimumTargetStates(pooled, targets, reserveWidth) {
  if (!targets.length || !pooled.length) return [];
  return pooled
    .map((state) => ({ state, shortfall: minimumShortfall(state.stats, targets) }))
    .sort((a, b) => a.shortfall - b.shortfall || b.state._heuristic - a.state._heuristic || a.state.key.localeCompare(b.state.key))
    .slice(0, Math.max(1, reserveWidth))
    .map(({ state }) => state);
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

function resultDominates(a, b, ids, statCaps) {
  const left = a.evaluation?.stats ?? {};
  const right = b.evaluation?.stats ?? {};
  return ids.every((id) => capped(left[id], statCaps?.[id]) >= capped(right[id], statCaps?.[id]))
    && ids.some((id) => capped(left[id], statCaps?.[id]) > capped(right[id], statCaps?.[id]));
}

function diverseResultFrontier(results, ids, limit, statCaps) {
  if (!ids.length) return results.slice(0, limit);
  const frontier = [];
  for (const result of [...results].sort((a, b) => a.key.localeCompare(b.key))) {
    if (frontier.some((other) => resultDominates(other, result, ids, statCaps))) continue;
    for (let index = frontier.length - 1; index >= 0; index -= 1) {
      if (resultDominates(result, frontier[index], ids, statCaps)) frontier.splice(index, 1);
    }
    frontier.push(result);
  }
  if (frontier.length <= limit) return frontier;
  const retained = new Map();
  const add = (row) => row && retained.set(row.key, row);
  add(frontier[0]);
  for (const id of ids) {
    const ordered = [...frontier].sort((a, b) => capped(b.evaluation?.stats?.[id], statCaps?.[id]) - capped(a.evaluation?.stats?.[id], statCaps?.[id]) || a.key.localeCompare(b.key));
    for (const row of ordered.slice(0, Math.max(2, Math.ceil(limit / ids.length)))) add(row);
  }
  for (const row of frontier) {
    if (retained.size >= limit) break;
    add(row);
  }
  return [...retained.values()].slice(0, limit);
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
  const frontierCount = Math.max(alternativeCount, number(options.frontierCount) || 48);
  const weights = options.weights ?? {};
  const statCaps = options.statCaps ?? {};
  const paretoStats = [...new Set([...(options.paretoStats ?? Object.keys(weights)), ...Object.keys(options.protectedStats ?? {})])].sort();
  const minimumTargets = normalizeMinimumTargets(options.minimumTargets);
  const setRoutes = normalizeSetRoutes(options.setRoutes);
  const structuralKeys = [...new Set(options.structuralStateKeys ?? [])].map(String).filter(Boolean).sort();
  const normalizedBySlot = Object.fromEntries(slots.map((slot) => [slot, normalizeCandidates(slot, options.candidatesBySlot[slot], locked[slot])]));
  let searched = 0;
  let beam = [{ selections: {}, candidates: {}, stats: {}, heroic: {}, weapons: [], sets: {}, custom: [], hint: 0, neutralHeroics: 0, neutralLevel: 0, neutralGrade: 0, key: "" }];

  for (let index = 0; index < slots.length; index += 1) {
    assertRunning(options);
    const slot = slots[index];
    const candidates = normalizedBySlot[slot];
    const futureSlots = slots.slice(index + 1);
    const remainingStructuralKeys = new Set(slots.slice(index + 1).flatMap((futureSlot) =>
      (normalizedBySlot[futureSlot] ?? []).flatMap((candidate) => candidate.stateKeys ?? [])));
    const expanded = [];
    for (const state of beam) {
      for (const candidate of candidates) {
        searched += 1;
        if (canAdd(state, candidate, options)) expanded.push(addCandidate(state, slot, candidate));
      }
    }
    beam = prune(expanded, { beamWidth, paretoWidth, paretoStats, weights, statCaps, setRoutes, futureSlots, candidatesBySlot: normalizedBySlot, searchOptions: options, structuralKeys, remainingStructuralKeys, minimumTargets });
    options.onProgress?.({ phase: "search", completedSlots: index + 1, totalSlots: slots.length, frontierSize: beam.length, searched });
    if (!beam.length) break;
    await Promise.resolve();
  }

  const results = [];
  const evaluationInputs = beam.map((state) => ({
    selections: state.selections,
    context: {
      candidates: state.candidates,
      approximateStats: state.stats,
      setCounts: state.sets,
      heroicCounts: state.heroic,
    },
  }));
  const batchEvaluations = typeof options.evaluateBatch === "function"
    ? await options.evaluateBatch(evaluationInputs, {
      signal: options.signal,
      onProgress: ({ completed, total = beam.length, workerCount = 1, mode = "sequential" } = {}) => {
        options.onProgress?.({ phase: "evaluate", completed, total, workerCount, mode });
      },
    })
    : null;
  if (batchEvaluations && (!Array.isArray(batchEvaluations) || batchEvaluations.length !== beam.length)) {
    throw new Error(`evaluateBatch returned ${Array.isArray(batchEvaluations) ? batchEvaluations.length : "a non-array"} result(s) for ${beam.length} finalist(s).`);
  }
  assertRunning(options);
  for (let index = 0; index < beam.length; index += 1) {
    assertRunning(options);
    const state = beam[index];
    const evaluation = batchEvaluations
      ? batchEvaluations[index]
      : await options.evaluate(state.selections, evaluationInputs[index].context);
    if (evaluation?.legal !== false && protectedLegal(evaluation ?? {}, options.protectedStats)) {
      results.push({ selections: state.selections, candidates: state.candidates, setCounts: state.sets, structuralKeys: state.custom, evaluation, key: state.key });
    }
    if (!batchEvaluations) options.onProgress?.({ phase: "evaluate", completed: index + 1, total: beam.length, legal: results.length, workerCount: 1, mode: "sequential" });
  }

  const neutral = (result, key) => Object.values(result.candidates).reduce((sum, candidate) => sum + number(candidate[key]), 0);
  results.sort((a, b) => number(b.evaluation.score) - number(a.evaluation.score)
    || number(b.evaluation.protectedHeadroom) - number(a.evaluation.protectedHeadroom)
    || neutral(a, "neutralHeroicCost") - neutral(b, "neutralHeroicCost")
    || neutral(b, "neutralItemLevel") - neutral(a, "neutralItemLevel")
    || neutral(b, "neutralGrade") - neutral(a, "neutralGrade")
    || a.key.localeCompare(b.key));
  const alternatives = results.slice(0, alternativeCount);
  const routeFinalists = new Map();
  for (const route of setRoutes) {
    const finalist = results.find((result) => {
      const count = number(result.setCounts?.[route.setId]);
      return count >= route.minimumPieces && count <= route.maximumPieces;
    });
    if (finalist) routeFinalists.set(route.id, finalist);
  }
  const structuralFinalists = new Map();
  for (const structuralKey of structuralKeys) {
    const finalist = results.find((result) => result.structuralKeys.includes(structuralKey));
    if (finalist) structuralFinalists.set(structuralKey, finalist);
  }
  const frontier = new Map([...routeFinalists.values()].map((result) => [result.key, result]));
  for (const result of structuralFinalists.values()) frontier.set(result.key, result);
  for (const result of diverseResultFrontier(results, paretoStats, frontierCount, statCaps)) frontier.set(result.key, result);
  // Floor-nearest finalists join the frontier so the attribute stage always
  // receives loadouts it can push over the goal minimums; ranked on exact
  // evaluated totals, unlike the beam reserve's additive approximations.
  if (minimumTargets.length) {
    const floorFinalists = [...results]
      .map((result) => ({ result, shortfall: minimumShortfall(result.evaluation?.stats ?? {}, minimumTargets) }))
      .sort((a, b) => a.shortfall - b.shortfall || number(b.result.evaluation?.score) - number(a.result.evaluation?.score) || a.result.key.localeCompare(b.result.key))
      .slice(0, Math.min(16, paretoWidth))
      .map(({ result }) => result);
    for (const result of floorFinalists) frontier.set(result.key, result);
  }
  return {
    best: alternatives[0] ?? null,
    alternatives,
    frontier: [...frontier.values()],
    searched,
    finalists: beam.length,
    setRouteMetrics: {
      requested: setRoutes.length,
      represented: routeFinalists.size,
      representedRouteIds: [...routeFinalists.keys()],
    },
    structuralStateMetrics: {
      requested: structuralKeys.length,
      represented: structuralFinalists.size,
      representedKeys: [...structuralFinalists.keys()],
    },
  };
}
