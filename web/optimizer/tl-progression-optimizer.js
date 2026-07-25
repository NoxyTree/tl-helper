import { PASSIVE_EFFECT_CONTRACT } from "../tl-passive-effect-contract.js";
import { SOCIAL_EFFECT_DEFINITIONS } from "../tl-social-scenario-effects.js";

const clone = (value) => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));

class MaxHeap {
  constructor(precedes) {
    this.items = [];
    this.precedes = precedes;
  }

  get size() {
    return this.items.length;
  }

  push(value) {
    const items = this.items;
    let index = items.length;
    items.push(value);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.precedes(items[index], items[parent])) break;
      [items[index], items[parent]] = [items[parent], items[index]];
      index = parent;
    }
  }

  replace(values) {
    this.items = [];
    for (const value of values) this.push(value);
  }

  pop() {
    const items = this.items;
    if (!items.length) return null;
    const first = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let best = index;
        if (left < items.length && this.precedes(items[left], items[best])) best = left;
        if (right < items.length && this.precedes(items[right], items[best])) best = right;
        if (best === index) break;
        [items[index], items[best]] = [items[best], items[index]];
        index = best;
      }
    }
    return first;
  }
}

function withMasteryLevel(build, masteryId, level, callback) {
  const hadMastery = Object.prototype.hasOwnProperty.call(build.masteries, masteryId);
  const previous = build.masteries[masteryId];
  build.masteries[masteryId] = { level };
  try {
    return callback();
  } finally {
    if (hadMastery) build.masteries[masteryId] = previous;
    else delete build.masteries[masteryId];
  }
}

const MASTERY_PASSIVE_INTERACTION = new Map(
  PASSIVE_EFFECT_CONTRACT.bindings.masteryPassiveInteraction.map((row) => [row.masteryId, row.passiveSkillId]),
);

const clampInteger = (value, minimum, maximum, fallback = minimum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(numeric)));
};

const safeNonnegativeInteger = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : fallback;
};

const POTENTIAL_UNIFIED_MASTERY_ID = "WM_Common_SKILL_007";

export const PROVEN_REPRESENTABLE_UNIFIED_MASTERY_IDS = Object.freeze([
  POTENTIAL_UNIFIED_MASTERY_ID,
  "WM_Common_SKILL_020",
]);

export function representableUnifiedMasteryIds(core) {
  const unifiedIds = new Set(core.unifiedMasteryNodes().map((row) => row.id));
  const ids = new Set(core.unifiedMasteryNodes()
    .filter((row) => core.unifiedMasteryCounted(row.id))
    .map((row) => row.id));
  for (const id of Object.keys(SOCIAL_EFFECT_DEFINITIONS)) {
    if (unifiedIds.has(id)) ids.add(id);
  }
  return [...ids].sort((left, right) => left.localeCompare(right));
}

function stableSkillRows(rows) {
  return [...rows].sort((left, right) => String(left.skillSlotAffinity ?? "").localeCompare(String(right.skillSlotAffinity ?? ""))
    || String(left.mainCategory ?? "").localeCompare(String(right.mainCategory ?? ""))
    || String(left.name ?? left.id).localeCompare(String(right.name ?? right.id)));
}

function selectionForSkill(core, skill, levelCap) {
  return {
    skillId: skill.id,
    level: Math.min(core.skillBandedMax(skill), levelCap),
    loadoutType: core.skillLoadoutType(skill),
    specializationIds: [],
  };
}

function synergyCandidateScore({ core, build, weapon, row, evaluate, score, baseScore, levelCap }) {
  let candidateScore;
  let epicLookahead;
  withMasteryLevel(build, row.id, core.masteryMaxLevel(row), () => {
    candidateScore = score(evaluate(build));
    epicLookahead = core.masteryRowsForWeapon(weapon)
      .filter((epic) => epic.specializationType === "normal" && epic.grade === 41 && core.masterySynergyMatches(row, epic))
      .map((epic) => withMasteryLevel(build, epic.id, core.masteryMaxLevel(epic),
        () => (score(evaluate(build)) - candidateScore) / Math.max(1, core.masteryMaxLevel(epic))))
      .sort((a, b) => b - a)[0] ?? 0;
  });
  const direct = candidateScore - baseScore;
  const interactionLookahead = interactionMarginal({ core, build, mastery: row, evaluate, score, levelCap });
  return direct + interactionLookahead + epicLookahead;
}

function progressionStateKey(build) {
  const skills = [...(build.skills ?? [])]
    .map((row) => [row.skillId, Number(row.level ?? 0), row.loadoutType ?? "", [...(row.specializationIds ?? [])].sort()])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  const masteries = Object.entries(build.masteries ?? {})
    .map(([id, row]) => [id, Number(row?.level ?? row ?? 0)])
    .sort(([left], [right]) => left.localeCompare(right));
  const unified = [...(build.unifiedMasteries ?? [])].sort();
  return JSON.stringify([Number(build.overallMasteryLevel ?? 0), skills, masteries, unified]);
}

function synchronizeSynergies({ core, build, weapon, evaluate, score, levelCap }) {
  const rows = core.masteryRowsForWeapon(weapon);
  for (const row of rows) if (row.specializationType === "synergy") delete build.masteries[row.id];
  const baseScore = score(evaluate(build));
  const state = core.masteryWeaponPointState(weapon, build);
  for (const grade of [...new Set(rows.map((row) => row.grade))].sort((a, b) => a - b)) {
    const synergyRows = rows.filter((row) => row.specializationType === "synergy" && row.grade === grade);
    const eligible = synergyRows
      .map((row) => ({ row, category: row.subCategory, points: state.categoryTierTotals[`${row.subCategory}-${grade}`] ?? 0 }))
      .filter((entry) => entry.points >= 20)
      .sort((left, right) => right.points - left.points || left.category.localeCompare(right.category));
    const slotCount = Math.min(2, eligible.length);
    if (!slotCount) continue;
    const cutoff = eligible[slotCount - 1].points;
    const required = eligible.filter((entry) => entry.points > cutoff);
    const tied = eligible.filter((entry) => entry.points === cutoff);
    const chosen = [...required];
    chosen.push(...tied
      .map((entry) => ({ ...entry, score: synergyCandidateScore({ core, build, weapon, row: entry.row, evaluate, score, baseScore, levelCap }) }))
      .sort((left, right) => right.score - left.score || left.row.id.localeCompare(right.row.id))
      .slice(0, slotCount - required.length));
    for (const entry of chosen) build.masteries[entry.row.id] = { level: core.masteryMaxLevel(entry.row) };
  }
  const selectedSynergies = core.masteryWeaponPointState(weapon, build).selectedSynergy;
  for (const epic of core.masteryWeaponPointState(weapon, build).epicSelected) {
    if (!selectedSynergies.some((synergy) => core.masterySynergyMatches(synergy, epic))) delete build.masteries[epic.id];
  }
}

function interactionMarginal({ core, build, mastery, evaluate, score, levelCap }) {
  const passiveId = MASTERY_PASSIVE_INTERACTION.get(mastery.id);
  if (!passiveId || build.skills?.some((row) => row.skillId === passiveId)) return 0;
  const passive = core.indexes.skillById[passiveId];
  if (!passive) return 0;
  const hadSkills = Object.prototype.hasOwnProperty.call(build, "skills");
  if (!hadSkills) build.skills = [];
  build.skills.push(selectionForSkill(core, passive, levelCap));
  try {
    const withoutMasteryScore = score(evaluate(build));
    return withMasteryLevel(build, mastery.id, core.masteryMaxLevel(mastery),
      () => score(evaluate(build)) - withoutMasteryScore);
  } finally {
    build.skills.pop();
    if (!hadSkills) delete build.skills;
  }
}

function createMasteryRouteHintOracle({ core, build, weapon, evaluate, score, levelCap }) {
  const sources = [];
  const sourcesByKey = new Map();
  const addSource = (source) => {
    sources.push(source);
    for (const key of source.keys) {
      if (!sourcesByKey.has(key)) sourcesByKey.set(key, []);
      sourcesByKey.get(key).push(source);
    }
  };
  for (const epic of core.masteryRowsForWeapon(weapon)
    .filter((row) => row.specializationType === "normal" && row.grade === 41)
    .filter((row) => core.passiveEffectClassification("masteryNonStructured", row.id) !== "persistentUnrepresentable")) {
    addSource({
      row: epic,
      type: "epic",
      keys: core.masteryCategoryKeys(epic),
      denominator: Math.max(1, 80 + core.masteryMaxLevel(epic)),
      value: Number.POSITIVE_INFINITY,
      version: -1,
      volatile: false,
    });
  }
  for (const synergy of core.masteryRowsForWeapon(weapon)
    .filter((row) => row.specializationType === "synergy")) {
    const priorTierPoints = synergy.grade === 11 ? 0 : synergy.grade === 21 ? 30 : 60;
    addSource({
      row: synergy,
      type: "synergy",
      keys: core.masteryCategoryKeys(synergy).map((category) => `${synergy.grade}:${category}`),
      denominator: Math.max(1, priorTierPoints + 20),
      value: Number.POSITIVE_INFINITY,
      version: -1,
      volatile: false,
    });
  }

  const refresh = (source, baseScore, version, observeIncrease) => {
    const previous = source.value;
    const directGain = withMasteryLevel(build, source.row.id, core.masteryMaxLevel(source.row),
      () => score(evaluate(build)) - baseScore);
    const fullGain = source.type === "synergy"
      ? Math.max(0, directGain, interactionMarginal({ core, build, mastery: source.row, evaluate, score, levelCap }))
      : Math.max(0, directGain);
    source.value = fullGain / source.denominator;
    source.version = version;
    if (observeIncrease && Number.isFinite(previous)) {
      const scale = Math.max(1, Math.abs(previous), Math.abs(source.value));
      if (source.value - previous > Math.sqrt(Number.EPSILON) * scale) source.volatile = true;
    }
  };

  return (baseScore, version) => {
    // Audit the first state transition: cumulative mastery rows can contain
    // rounded increments, so a source that increases here is not a CELF bound
    // and must stay fresh for the remainder of this weapon allocation.
    if (version <= 1) {
      for (const source of sources) refresh(source, baseScore, version, version === 1);
    } else {
      for (const source of sources) if (source.volatile) refresh(source, baseScore, version, false);
    }
    const hints = new Map();
    for (const [key, keySources] of sourcesByKey) {
      while (keySources.length) {
        keySources.sort((left, right) => right.value - left.value || left.row.id.localeCompare(right.row.id));
        const leader = keySources[0];
        if (leader.version === version) {
          hints.set(key, leader.value);
          break;
        }
        refresh(leader, baseScore, version, false);
      }
    }
    return hints;
  };
}

function masteryCandidatePrecedes(left, right, includeRoutePriority) {
  if (left.score !== right.score) return left.score > right.score;
  if (includeRoutePriority && left.epicEligible !== right.epicEligible) return left.epicEligible;
  if (includeRoutePriority && left.mastery.grade !== right.mastery.grade) return left.mastery.grade < right.mastery.grade;
  return left.mastery.id.localeCompare(right.mastery.id) < 0;
}

function withinScoreReevaluationTolerance(left, right) {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  // Exact ties already follow the frozen allocator's deterministic secondary
  // ordering. Only a positive, round-off-sized lead needs another heap audit.
  return left > right && left - right <= Number.EPSILON * scale;
}

function masteryStep(core, mastery, weapon, build) {
  const current = core.masterySelectedLevel(mastery, build);
  const next = current + 1;
  if (next > core.masteryMaxLevel(mastery)) return null;
  if (!current && core.masteryLockInfo(mastery, weapon, build).locked) return null;
  if (!core.masteryCanSetLevel(mastery, next, weapon, build).ok) return null;
  return { current, next };
}

function allocateMasteryPointsLazy({
  core,
  build,
  weapon,
  rows,
  targetReached,
  evaluate,
  score,
  scoreCandidate,
  includeRoutePriority = false,
}) {
  const heap = new MaxHeap((left, right) => masteryCandidatePrecedes(left, right, includeRoutePriority));
  const currentById = new Map();
  let version = 0;

  const synchronizeEligible = () => {
    for (const mastery of rows) {
      const step = masteryStep(core, mastery, weapon, build);
      const existing = currentById.get(mastery.id);
      if (!step) {
        if (existing) currentById.delete(mastery.id);
        continue;
      }
      if (existing?.next === step.next) continue;
      const candidate = {
        mastery,
        ...step,
        score: Number.POSITIVE_INFINITY,
        epicEligible: Boolean(scoreCandidate.epicEligible?.(mastery)),
        version: -1,
      };
      currentById.set(mastery.id, candidate);
      heap.push(candidate);
    }
  };

  while (!targetReached()) {
    synchronizeEligible();
    const baseScore = score(evaluate(build));
    const iteration = scoreCandidate.beginIteration?.(baseScore, version);
    if (scoreCandidate.refreshPriority) {
      const refreshedCandidates = [...currentById.values()].map((candidate) => {
        const refreshed = scoreCandidate.refreshPriority(candidate);
        currentById.set(candidate.mastery.id, refreshed);
        return refreshed;
      });
      heap.replace(refreshedCandidates);
    }
    let selected = null;
    const refreshCandidate = (candidate, step) => {
      const candidateScore = scoreCandidate(candidate.mastery, step, baseScore, iteration);
      const refreshed = {
        ...candidate,
        ...(typeof candidateScore === "number" ? { score: candidateScore } : candidateScore),
        version,
      };
      currentById.set(candidate.mastery.id, refreshed);
      return refreshed;
    };
    if (scoreCandidate.shouldReevaluate) {
      for (const candidate of [...currentById.values()]) {
        if (candidate.version === version || !scoreCandidate.shouldReevaluate(candidate, version)) continue;
        const step = masteryStep(core, candidate.mastery, weapon, build);
        const refreshed = refreshCandidate(candidate, step);
        scoreCandidate.observeRefresh?.(candidate, refreshed);
      }
      heap.replace([...currentById.values()]);
    }
    while (heap.size) {
      const candidate = heap.pop();
      if (currentById.get(candidate.mastery.id) !== candidate) continue;
      const step = masteryStep(core, candidate.mastery, weapon, build);
      if (!step || step.next !== candidate.next) {
        currentById.delete(candidate.mastery.id);
        continue;
      }
      if (candidate.version !== version) {
        heap.push(refreshCandidate(candidate, step));
        continue;
      }
      const staleTop = [...currentById.values()]
        .filter((entry) => entry.version !== version)
        .sort((left, right) => masteryCandidatePrecedes(left, right, includeRoutePriority) ? -1 : 1)[0];
      if (staleTop && withinScoreReevaluationTolerance(candidate.score, staleTop.score)) {
        const runnerStep = masteryStep(core, staleTop.mastery, weapon, build);
        const refreshedStaleTop = refreshCandidate(staleTop, runnerStep);
        scoreCandidate.observeRefresh?.(staleTop, refreshedStaleTop);
        heap.push(candidate);
        heap.push(refreshedStaleTop);
        continue;
      }
      selected = candidate;
      break;
    }
    if (!selected) break;
    currentById.delete(selected.mastery.id);
    build.masteries[selected.mastery.id] = { level: selected.next };
    version += 1;
  }
}

function allocateWeaponMastery({ core, build, weapon, pointBudget, evaluate, score, levelCap }) {
  const target = clampInteger(pointBudget, 0, core.MASTERY_POINT_BUDGET, core.MASTERY_POINT_BUDGET);
  const epicReserve = Math.min(10, Math.max(0, target - 80)) + Math.min(10, Math.max(0, target - 130));
  const nonEpicTarget = target - epicReserve;
  const weaponRows = core.masteryRowsForWeapon(weapon);
  const routeHintOracle = createMasteryRouteHintOracle({ core, build, weapon, evaluate, score, levelCap });
  const calculationEligibleEpicCategories = new Set(weaponRows
    .filter((mastery) => mastery.specializationType === "normal" && mastery.grade === 41)
    .filter((mastery) => core.passiveEffectClassification("masteryNonStructured", mastery.id) !== "persistentUnrepresentable")
    .flatMap((mastery) => core.masteryCategoryKeys(mastery)));
  let routeHints;
  const volatileDirectMarginals = new Set();
  const routeHintFor = (mastery) => Math.max(0, ...core.masteryCategoryKeys(mastery).flatMap((category) => [
      Number(routeHints.get(category) ?? 0),
      Number(routeHints.get(`${mastery.grade}:${category}`) ?? 0),
    ]));
  const nonEpicScore = (mastery, step, baseScore) => {
    const directGain = withMasteryLevel(build, mastery.id, step.next,
      () => score(evaluate(build)) - baseScore);
    const routeHint = routeHintFor(mastery);
    return { directGain, routeHint, score: directGain + routeHint };
  };
  nonEpicScore.beginIteration = (baseScore, version) => {
    routeHints = routeHintOracle(baseScore, version);
  };
  nonEpicScore.refreshPriority = (candidate) => {
    if (!Number.isFinite(candidate.directGain)) return candidate;
    const routeHint = routeHintFor(candidate.mastery);
    return { ...candidate, routeHint, score: candidate.directGain + routeHint };
  };
  nonEpicScore.shouldReevaluate = (candidate, version) => version === 1
    || volatileDirectMarginals.has(candidate.mastery.id);
  nonEpicScore.observeRefresh = (previous, refreshed) => {
    // Mixed-sign cumulative rows can have a marginal that rises as rounded
    // level increments alternate. Detect that from evaluations rather than
    // assuming submodularity or naming any game-specific row.
    const scale = Math.max(1, Math.abs(previous.directGain), Math.abs(refreshed.directGain));
    if (refreshed.directGain - previous.directGain > Math.sqrt(Number.EPSILON) * scale) {
      volatileDirectMarginals.add(previous.mastery.id);
    }
  };
  nonEpicScore.epicEligible = (mastery) => epicReserve > 0 && core.masteryCategoryKeys(mastery)
    .some((category) => calculationEligibleEpicCategories.has(category));
  allocateMasteryPointsLazy({
    core,
    build,
    weapon,
    rows: weaponRows.filter((mastery) => mastery.specializationType === "normal" && mastery.grade !== 41),
    targetReached: () => core.masteryWeaponPointState(weapon, build).nonEpicPoints >= nonEpicTarget,
    evaluate,
    score,
    scoreCandidate: nonEpicScore,
    includeRoutePriority: true,
  });
  synchronizeSynergies({ core, build, weapon, evaluate, score, levelCap });
  allocateMasteryPointsLazy({
    core,
    build,
    weapon,
    rows: weaponRows
      .filter((mastery) => mastery.specializationType === "normal" && mastery.grade === 41)
      .filter((mastery) => core.passiveEffectClassification("masteryNonStructured", mastery.id) !== "persistentUnrepresentable"),
    targetReached: () => core.masteryWeaponPointState(weapon, build).totalPoints >= target,
    evaluate,
    score,
    scoreCandidate: (mastery, step, baseScore) => withMasteryLevel(build, mastery.id, step.next,
      () => score(evaluate(build)) - baseScore),
  });
  return core.masteryWeaponPointState(weapon, build).totalPoints;
}

function optimizePassiveSkills({ core, build, rows, levelCap, evaluate, score }) {
  const remaining = stableSkillRows(rows);
  const selected = [];
  const heap = new MaxHeap((left, right) => left.score > right.score
    || (left.score === right.score && left.skill.id.localeCompare(right.skill.id) < 0));
  const currentById = new Map();
  let version = 0;
  for (const skill of remaining) {
    const candidate = {
      skill,
      selection: selectionForSkill(core, skill, levelCap),
      score: Number.POSITIVE_INFINITY,
      version: -1,
    };
    currentById.set(skill.id, candidate);
    heap.push(candidate);
  }
  while (selected.length < core.PASSIVE_SKILL_CAP && currentById.size) {
    const baseScore = score(evaluate(build));
    let best = null;
    const refreshCandidate = (candidate) => {
      const previousSkills = build.skills;
      selected.push(candidate.selection);
      build.skills = selected;
      let candidateScore;
      try {
        candidateScore = score(evaluate(build)) - baseScore;
      } finally {
        build.skills = previousSkills;
        selected.pop();
      }
      const refreshed = { ...candidate, score: candidateScore, version };
      currentById.set(candidate.skill.id, refreshed);
      return refreshed;
    };
    while (heap.size) {
      const candidate = heap.pop();
      if (currentById.get(candidate.skill.id) !== candidate) continue;
      if (candidate.version !== version) {
        heap.push(refreshCandidate(candidate));
        continue;
      }
      const staleTop = [...currentById.values()]
        .filter((entry) => entry.version !== version)
        .sort((left, right) => left.score === right.score
          ? left.skill.id.localeCompare(right.skill.id)
          : right.score - left.score)[0];
      if (staleTop && withinScoreReevaluationTolerance(candidate.score, staleTop.score)) {
        const refreshedStaleTop = refreshCandidate(staleTop);
        heap.push(candidate);
        heap.push(refreshedStaleTop);
        continue;
      }
      best = candidate;
      break;
    }
    if (!best) break;
    currentById.delete(best.skill.id);
    selected.push(best.selection);
    build.skills = [...selected];
    version += 1;
  }
  return selected;
}

function unifiedSelectionIsLegal(core, build, weapons, expectedIds) {
  const progression = core.effectiveProgression(build, { weaponTypes: weapons });
  if (progression.issues.length) return false;
  const activeIds = progression.unifiedMasteries.map(({ masteryId }) => masteryId).sort((left, right) => left.localeCompare(right));
  return activeIds.length === expectedIds.length && activeIds.every((id, index) => id === expectedIds[index]);
}

function unifiedSubsets(ids, cap) {
  const subsets = [];
  const visit = (start, selected) => {
    if (selected.length) subsets.push([...selected]);
    if (selected.length >= cap) return;
    for (let index = start; index < ids.length; index += 1) {
      selected.push(ids[index]);
      visit(index + 1, selected);
      selected.pop();
    }
  };
  visit(0, []);
  return subsets;
}

function optimizeUnifiedMasteries({ core, build, weapons, evaluate, score }) {
  const base = clone(build);
  base.unifiedMasteries = [];
  const baseScore = Number(score(evaluate(base)));
  if (!Number.isFinite(baseScore)) throw new TypeError("Overall Mastery baseline score must be finite.");

  const representableIds = new Set(representableUnifiedMasteryIds(core));
  const unlocked = core.unifiedMasteryNodes()
    .filter((row) => row.isDisabled !== true)
    .filter((row) => Number(row.requiredLevel ?? 0) <= build.overallMasteryLevel)
    .sort((left, right) => left.id.localeCompare(right.id));
  const singletonScores = new Map();
  const positiveRepresentableIds = [];
  for (const mastery of unlocked) {
    const candidate = clone(base);
    candidate.unifiedMasteries = [mastery.id];
    if (!unifiedSelectionIsLegal(core, candidate, weapons, [mastery.id])) continue;
    const candidateScore = Number(score(evaluate(candidate)));
    if (!Number.isFinite(candidateScore)) throw new TypeError(`Overall Mastery score for ${mastery.id} must be finite.`);
    singletonScores.set(mastery.id, candidateScore);
    if (representableIds.has(mastery.id) && candidateScore > baseScore) positiveRepresentableIds.push(mastery.id);
  }

  const ranked = [{ ids: [], score: baseScore, signature: "" }];
  for (const ids of unifiedSubsets(positiveRepresentableIds, core.UNIFIED_MASTERY_CAP)) {
    const candidate = clone(base);
    candidate.unifiedMasteries = ids;
    if (!unifiedSelectionIsLegal(core, candidate, weapons, ids)) continue;
    const candidateScore = ids.length === 1
      ? singletonScores.get(ids[0])
      : Number(score(evaluate(candidate)));
    if (!Number.isFinite(candidateScore)) throw new TypeError(`Overall Mastery score for ${ids.join(", ")} must be finite.`);
    ranked.push({ ids, score: candidateScore, signature: ids.join("|") });
  }
  ranked.sort((left, right) => right.score - left.score
    || left.ids.length - right.ids.length
    || left.signature.localeCompare(right.signature));
  build.unifiedMasteries = [...ranked[0].ids];
  return build.unifiedMasteries;
}

export function normalizeProgressionSettings(core, weapons, settings = {}) {
  const masteryPointsByWeapon = Object.fromEntries(weapons.map((weapon) => [weapon,
    clampInteger(settings.masteryPointsByWeapon?.[weapon], 0, core.MASTERY_POINT_BUDGET, core.MASTERY_POINT_BUDGET)]));
  const hasExplicitOverallMasteryLevel = Object.prototype.hasOwnProperty.call(settings, "overallMasteryLevel");
  const potentialUnlockLevel = Number(core.indexes.masteryById[POTENTIAL_UNIFIED_MASTERY_ID]?.requiredLevel ?? 0);
  return {
    enabled: settings.enabled !== false,
    skillLevelCap: clampInteger(settings.skillLevelCap, 1, 20, 20),
    masteryPointsByWeapon,
    overallMasteryLevel: hasExplicitOverallMasteryLevel
      ? safeNonnegativeInteger(settings.overallMasteryLevel)
      : settings.includePotential === true ? safeNonnegativeInteger(potentialUnlockLevel) : 0,
  };
}

export function optimizeScratchProgression({ core, build, weapons, settings = {}, evaluate, score }) {
  const normalized = normalizeProgressionSettings(core, weapons, settings);
  // Scratch progression is chosen before concrete weapon items exist. The
  // evaluator receives the requested weapon families so the shared calculator
  // can activate only their passive and mastery rows without inventing gear.
  const evaluationCache = new Map();
  const evaluateProgression = (candidate) => {
    const key = progressionStateKey(candidate);
    if (!evaluationCache.has(key)) evaluationCache.set(key, evaluate(candidate, { progressionWeaponTypes: weapons }));
    return evaluationCache.get(key);
  };
  const result = clone(build);
  result.skills = [];
  result.masteries = {};
  result.unifiedMasteries = [];
  result.overallMasteryLevel = normalized.overallMasteryLevel;

  const masteryPointsByWeapon = {};
  if (normalized.enabled) {
    for (const weapon of weapons) {
      masteryPointsByWeapon[weapon] = allocateWeaponMastery({
        core,
        build: result,
        weapon,
        pointBudget: normalized.masteryPointsByWeapon[weapon],
        evaluate: evaluateProgression,
        score,
        levelCap: normalized.skillLevelCap,
      });
    }

    const available = core.availableSkillsForWeapons(weapons);
    const passiveRows = available.filter((skill) => core.skillLoadoutType(skill) === "passive");
    const passives = optimizePassiveSkills({ core, build: result, rows: passiveRows, levelCap: normalized.skillLevelCap, evaluate: evaluateProgression, score });
    result.skills = passives;
  }

  const unifiedMasteries = optimizeUnifiedMasteries({ core, build: result, weapons, evaluate: evaluateProgression, score });

  return {
    build: result,
    settings: normalized,
    summary: {
      masteryPointsByWeapon,
      passiveSkills: result.skills.length,
      unifiedMasteries: unifiedMasteries.length,
    },
  };
}
